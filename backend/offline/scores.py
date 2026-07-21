"""
Shared scaffolding for the per-segment dimension scores.

Every "easy" dimension of the cadrage (Green, Quiet/Lively, Local/Chain,
Touristy/Local) is computed with the same three-step gesture:

    segment (osm_network) --buffer--> collect a data layer around it
        --> aggregate (median / mean / sum / share) = agg_value
            --> z-score across the zone + write one row in segment_scores

This module holds the two pieces that are shared by all dimensions:

    aggregate_to_segments(...)  -> (edge_id, agg_value, source_count) per segment
    normalize_and_store(...)    -> z-score + confidence + upsert into segment_scores

A dimension module (e.g. a future quiet_lively.py) only has to say *which*
source layer to aggregate and *how*; it never re-implements the spatial join,
the normalization, or the database write.

Uses psycopg 3 (synchronous), reading backend/.env via db.get_dsn(), to match
the rest of the offline pipeline.
"""

import statistics

import psycopg

from offline.db import get_dsn


# --- Step 1: aggregate a data layer onto the segments ------------------------

# Aggregation functions we support, mapped to their SQL form. The source layer
# exposes a numeric column `val`; `s` is the source subquery alias.
#   - mean   also gives "share" for free: the mean of a 0/1 column IS the share
#            (e.g. AVG(is_chain) = fraction of chain shops in the buffer).
#   - median uses percentile_cont, which needs the WITHIN GROUP ... ORDER BY form.
_AGG_SQL = {
    "mean": "AVG(s.val)",
    "sum": "SUM(s.val)",
    "count": "COUNT(s.val)",
    "median": "percentile_cont(0.5) WITHIN GROUP (ORDER BY s.val)",
}

# Conservative metres-per-degree used only for the coarse bbox pre-filter in
# aggregate_to_segments (see the comment there). 111_320 * cos(43 deg): safe
# for any latitude in Korea, where a degree of longitude is most compressed.
_M_PER_DEG = 111_320 * 0.731


def aggregate_to_segments(
    source_sql: str,
    buffer_m: float,
    agg: str = "median",
    zone_slug: str | None = None,
) -> list[dict]:
    """Aggregate a data layer onto each street segment within a buffer.

    For every segment in `osm_network` (optionally filtered to one zone), gather
    the source features that fall within `buffer_m` metres of the segment and
    reduce their `val` column with `agg`.

    Args:
        source_sql: a trusted SELECT (written by a dimension module, never by an
            end user) that yields at least two columns:
                geom : a geometry in SRID 4326
                val  : a numeric value to aggregate
            e.g. "SELECT geom, review_count AS val FROM pois WHERE category = 'cafe'"
        buffer_m: buffer radius in metres. Distance is measured on the geography
            type, so the value is true metres regardless of the 4326 lng/lat units.
        agg: one of _AGG_SQL ('median', 'mean', 'sum', 'count').
        zone_slug: restrict to one zone build; None processes every segment.

    Returns:
        One dict per segment: {edge_id, agg_value, source_count}. Segments with no
        source feature in the buffer come back with agg_value=None, source_count=0
        (a LEFT JOIN keeps them), so they can later be flagged not-observed.
    """
    if agg not in _AGG_SQL:
        raise ValueError(f"unknown agg {agg!r}; expected one of {sorted(_AGG_SQL)}")

    zone_filter = "WHERE e.zone_slug = %(zone_slug)s" if zone_slug else ""
    query = f"""
        SELECT e.edge_id,
               {_AGG_SQL[agg]} AS agg_value,
               COUNT(s.val)    AS source_count
        FROM osm_network e
        LEFT JOIN ({source_sql}) s
          -- Coarse bbox filter first (&&), which the existing GiST index on geom
          -- can actually use, to cut down the pairs before the expensive precise
          -- check: casting to ::geography for ST_DWithin is accurate but not
          -- index-assisted, so without this it degrades to a full nested-loop
          -- distance calculation between every segment and every source row.
          -- buffer_deg converts metres to degrees for the bbox only; ST_DWithin
          -- still does the exact geodesic check afterwards, so this only needs to
          -- be wide enough to never exclude a true match. A degree of longitude
          -- covers FEWER metres than a degree of latitude as you move away from
          -- the equator (by a factor of cos(latitude)), so using latitude's ratio
          -- (111_320 m/deg) for both axes under-expands east-west and can drop
          -- real matches -- confirmed: it silently lost 2 of 9970 segments during
          -- development. _M_PER_DEG bakes in a conservative cos(43 deg) margin,
          -- safe across Korea's latitude range (~33-43N); a global deployment
          -- would need this computed from the actual data's latitude instead.
          ON e.geom && ST_Expand(s.geom, %(buffer_deg)s)
         AND ST_DWithin(e.geom::geography, s.geom::geography, %(buffer_m)s)
        {zone_filter}
        GROUP BY e.edge_id
    """
    params = {"buffer_m": buffer_m, "buffer_deg": buffer_m / _M_PER_DEG, "zone_slug": zone_slug}

    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]

    # Coerce agg_value to float: an AVG/SUM over a numeric column (e.g. the 0/1
    # is_chain share) comes back as decimal.Decimal, which then can't be mixed with
    # the float mean/std in normalize_and_store (Decimal - float -> TypeError).
    for r in rows:
        if r["agg_value"] is not None:
            r["agg_value"] = float(r["agg_value"])
    return rows


# --- Step 2: normalize and write one score row per segment -------------------

# How fast confidence saturates with source_count: with this many source features
# in the buffer we treat the measurement as fully confident. A rough placeholder,
# meant to be tuned per dimension once we see real distributions.
_CONF_SATURATION = 5

_UPSERT_SCORE = """
INSERT INTO segment_scores (
    edge_id, dimension, agg_value, score, source_count,
    confidence, is_observed, method, zone_slug, computed_at
)
VALUES (
    %(edge_id)s, %(dimension)s, %(agg_value)s, %(score)s, %(source_count)s,
    %(confidence)s, %(is_observed)s, %(method)s, %(zone_slug)s, NOW()
)
ON CONFLICT (edge_id, dimension) DO UPDATE SET
    agg_value    = EXCLUDED.agg_value,
    score        = EXCLUDED.score,
    source_count = EXCLUDED.source_count,
    confidence  = EXCLUDED.confidence,
    is_observed = EXCLUDED.is_observed,
    method      = EXCLUDED.method,
    zone_slug   = EXCLUDED.zone_slug,
    computed_at = NOW();
"""


def normalize_and_store(
    dimension: str,
    rows: list[dict],
    method: str,
    zone_slug: str | None = None,
    invert: bool = False,
) -> int:
    """Z-score the raw values across the zone and upsert one row per segment.

    The bipolar axes of the cadrage are relative, so we normalize each dimension
    to a z-score over the segments we actually measured (agg_value not None).
    Segments with no data (source_count == 0 / agg_value None) are still written,
    but flagged is_observed=False with a null score, so the gap-filling stage
    (spatial prediction) can find and fill them later.

    Args:
        dimension: the axis key, e.g. 'quiet_lively'.
        rows: output of aggregate_to_segments (edge_id, agg_value, source_count).
        method: how agg_value was produced, stored for provenance
            (e.g. 'buffer_median').
        zone_slug: stamped on every written row.
        invert: negate the z-score to orient the axis. The score sign carries the
            axis direction; the dimension module decides which pole is positive.

    Returns:
        How many score rows were upserted.
    """
    measured = [r["agg_value"] for r in rows if r["agg_value"] is not None]

    # Mean/std over the measured segments only. Need at least two points for a
    # standard deviation; below that, z-scoring is meaningless so scores stay null.
    if len(measured) >= 2:
        mean = statistics.fmean(measured)
        std = statistics.pstdev(measured)
    else:
        mean = std = None

    payload = []
    for r in rows:
        raw = r["agg_value"]
        n = r["source_count"] or 0
        is_observed = raw is not None and n > 0

        if is_observed and std:  # std truthy => not None and not zero
            z = (raw - mean) / std
            score = -z if invert else z
        else:
            score = None  # no data, or a degenerate (all-equal) distribution

        confidence = min(1.0, n / _CONF_SATURATION) if is_observed else 0.0

        payload.append({
            "edge_id": r["edge_id"],
            "dimension": dimension,
            "agg_value": raw,
            "score": score,
            "source_count": n,
            "confidence": confidence,
            "is_observed": is_observed,
            "method": method,
            "zone_slug": zone_slug,
        })

    if not payload:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_SCORE, payload)
        conn.commit()
    return len(payload)

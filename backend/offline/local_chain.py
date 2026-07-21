"""
Local/Independent <-> Chain/Commercial dimension: how chain-dominated a street is.

Per the cadrage, we start from the near-exhaustive commerce census
(소상공인시장진흥공단, collected by scrapers/seoul_commerce_collector.py, which also
derives the per-shop is_chain flag) and score each street segment by the SHARE of
chain shops among the commerces around it. "Independents = the complement", so no
separate hunt for independents is needed.

The share falls straight out of the shared scaffolding: feed is_chain as a 0/1
`val` column and aggregate with agg="mean" -- the mean of a 0/1 column IS the
fraction of chain shops in the buffer (see offline/scores.py). That fraction is
then z-scored across the zone like every other dimension.

Sign convention: agg_value = chain share (0..1); invert=False, so a HIGHER chain
share gives a POSITIVE score = the "Chain/Commercial" pole, and a negative score =
the "Local/Independent" pole. Segments with no commerce in the buffer are written
is_observed=False / score NULL, left for the gap-filling stage.

Run:  python -m offline.local_chain
"""

from offline.scores import aggregate_to_segments, normalize_and_store

ZONE_SLUG = "jongno"
DIMENSION = "local_chain"
BUFFER_M = 25              # shops fronting a street: street width + sidewalk + shopfront


def build(zone_slug: str = ZONE_SLUG, buffer_m: float = BUFFER_M) -> int:
    # is_chain (boolean) -> 1.0 / 0.0 so AVG() over the buffer = chain share.
    source_sql = f"""
        SELECT geom, CASE WHEN is_chain THEN 1.0 ELSE 0.0 END AS val
        FROM commerces
        WHERE zone_slug = '{zone_slug}'
    """
    rows = aggregate_to_segments(source_sql, buffer_m=buffer_m, agg="mean", zone_slug=zone_slug)

    n_observed = sum(1 for r in rows if r["source_count"] > 0)
    print(f"[{DIMENSION}] {len(rows)} segments in zone '{zone_slug}', "
          f"{n_observed} with at least one shop within {buffer_m}m")

    # invert=False: higher chain share -> positive score -> "Chain/Commercial" pole
    n = normalize_and_store(
        dimension=DIMENSION,
        rows=rows,
        method=f"buffer_share_chain_{int(buffer_m)}m",
        zone_slug=zone_slug,
        invert=False,
    )
    print(f"[{DIMENSION}] wrote {n} rows into segment_scores")
    return n


if __name__ == "__main__":
    build()

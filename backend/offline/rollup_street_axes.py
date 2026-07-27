"""
Roll up the three "hard-data" bipolar axes from the network onto the NAMED
STREETS, so they can be ranked exactly like the NLP text axes in the web app.

Background
----------
The web app's vibe search (web/frontend/app/realmap.jsx) ranks NAMED STREETS by
how close their per-street score sits to the slider target. Three axes already
work that way because text_axes.py scores them per street:

    touristy_local, historic_contemporary, raw_polished

Three more axes only exist per NETWORK SEGMENT (they come from hard datasets, not
text), so the app could not rank streets by them:

    quiet_lively   (생활인구 population)   -> scores-quiet-lively-14h-jongno.geojson
    local_chain    (상가정보 commerce)     -> scores-local-chain-jongno.geojson
    park           (OSM public green)      -> green-jongno.geojson

This script is the REVERSE FAN of text_axes.py: instead of spreading a per-street
score onto its segments, it aggregates the per-segment (or per-area) signal back
UP onto each named street, and writes the result as three extra properties on
scores-named-streets-jongno.geojson.

Why geojson-only (no DB)
------------------------
The named streets are dissolved from the very same OSM network the segment scores
sit on, so a tiny metric buffer around a street contains exactly its own segments
(verified: 종로7길 -> 36/36 segments). Working straight from the exported geojson
keeps this step reproducible from the artifacts, with no street-name matching
between the file and PostGIS.

Sign convention (repo-wide): the POSITIVE pole is the SECOND word of the axis
name -- quiet_LIVELY (+ = lively), local_CHAIN (+ = chain), and the green axis is
framed (little green) -> PARK, so + = next to a park. Every score lands in
[-1, +1] to match the NLP axes the ranker already compares against.

The `park` axis is deliberately PARK PROXIMITY, not perceived tree canopy: it
answers "does this street run along/near a public park", which is exactly what the
OSM public-green polygons support. (A street-tree/canopy signal would be a distinct
axis needing the Seoul 가로수 dataset.)

Honesty garde-fou (same as text_axes.py): a street with no observed segment on an
axis is written null on that axis -- "not measured", not pulled to a pole. `park`
is always computable (a street 0 m near any park == honestly "little green" == -1).

Run:  python -m offline.rollup_street_axes            (dry run: preview only)
      python -m offline.rollup_street_axes --write     (add the 3 columns in place)
"""

import json
import pathlib
import sys

import geopandas as gpd
import numpy as np

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

NAMED_FILE = FRONTEND / "scores-named-streets-jongno.geojson"
QUIET_LIVELY_FILE = FRONTEND / "scores-quiet-lively-14h-jongno.geojson"  # daytime bustle
LOCAL_CHAIN_FILE = FRONTEND / "scores-local-chain-jongno.geojson"
GREEN_FILE = FRONTEND / "green-jongno.geojson"

# Korea metric CRS (EPSG:5179, Korea 2000 / Unified CS) so buffers/lengths are in
# metres rather than degrees.
METRIC_CRS = 5179

STREET_BUFFER_M = 3.0     # a street's own segments sit right on it; 3 m is plenty
GREEN_BUFFER_M = 30.0     # "near green" = within 30 m of a park/wood/grass edge

# --- Which green counts as "greenery a pedestrian actually experiences" -------
# STOPGAP (option A): the OSM green in this zone is dominated by tiny PRIVATE
# hanok courtyards tagged leisure=garden (203 of 466) and grass/planter slivers
# (median area ~345 m²). Counting them makes a street "green" for being 30 m from
# a 20 m² courtyard nobody can see or enter. We keep only PUBLIC, experienceable
# green: drop `garden`, and drop anything below MIN_GREEN_AREA_M2.
# NOTE: this is still a PROXIMITY proxy, not perceived canopy. The real fix is a
# street-tree density signal (Seoul 가로수 dataset) -- see rollup follow-up.
DROP_GREEN_TYPES = {"garden", "greenfield"}   # private courtyards / vacant lots
MIN_GREEN_AREA_M2 = 500.0
# Children's playgrounds (어린이공원) / water-play lots are tagged leisure=park but
# are mostly paved play equipment, not the leafy park the slider means -> drop by name.
DROP_GREEN_NAME_TOKENS = ("어린이", "놀이터")


def _percentile_scores(values: np.ndarray) -> np.ndarray:
    """Rank-normalise a 1-D array to [-1, +1] by percentile (NaNs stay NaN).

    Percentile (rank) rather than min-max because 생활인구 has heavy outliers near
    big attractions that would otherwise squash every other street toward one end.
    A street at the median lands near 0; the quietest -> -1, the liveliest -> +1.
    """
    out = np.full(len(values), np.nan)
    obs = ~np.isnan(values)
    n = int(obs.sum())
    if n == 0:
        return out
    ranks = values[obs].argsort().argsort()          # 0..n-1, ties broken arbitrarily
    pct = (ranks + 0.5) / n                            # (0,1), midpoint convention
    out[obs] = np.round(pct * 2 - 1, 3)
    return out


def _median_agg_per_street(streets_m, segments_m):
    """Median of observed `agg_value` over each street's own segments (NaN if none)."""
    seg = segments_m[segments_m["is_observed"] == True].copy()  # noqa: E712 (geopandas mask)
    buffered = streets_m.copy()
    buffered["geometry"] = buffered.geometry.buffer(STREET_BUFFER_M)
    joined = gpd.sjoin(seg[["agg_value", "geometry"]], buffered[["_sid", "geometry"]],
                       predicate="intersects", how="inner")
    med = joined.groupby("_sid")["agg_value"].median()
    return streets_m["_sid"].map(med).to_numpy(dtype=float)


def _public_green(green_m):
    """Keep only public, experienceable green (see DROP_GREEN_TYPES / MIN_GREEN_AREA_M2 /
    DROP_GREEN_NAME_TOKENS)."""
    name = green_m["name"].fillna("").astype(str)
    is_playground = name.str.contains("|".join(DROP_GREEN_NAME_TOKENS))
    keep = (~green_m["green_type"].isin(DROP_GREEN_TYPES)
            & (green_m.geometry.area >= MIN_GREEN_AREA_M2)
            & ~is_playground)
    return green_m[keep]


def _green_fraction_per_street(streets_m, green_m):
    """Fraction of each street's length lying within GREEN_BUFFER_M of any green area."""
    green_zone = green_m.geometry.buffer(GREEN_BUFFER_M).union_all()
    total = streets_m.geometry.length.to_numpy(dtype=float)
    near = streets_m.geometry.intersection(green_zone).length.to_numpy(dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        frac = np.where(total > 0, near / total, 0.0)
    return np.clip(frac, 0.0, 1.0)


def rollup():
    named = gpd.read_file(NAMED_FILE)
    quiet = gpd.read_file(QUIET_LIVELY_FILE)
    chain = gpd.read_file(LOCAL_CHAIN_FILE)
    green = gpd.read_file(GREEN_FILE)
    print(f"[rollup] {len(named)} named streets · {len(quiet)} quiet-lively segments · "
          f"{len(chain)} local-chain segments · {len(green)} green areas")

    named_m = named.to_crs(METRIC_CRS).reset_index(drop=True)
    named_m["_sid"] = named_m.index                      # stable key for the joins

    # --- quiet_lively: median 생활인구 per street -> percentile -> [-1,+1] (+ = lively)
    ql_median = _median_agg_per_street(named_m, quiet.to_crs(METRIC_CRS))
    quiet_lively = _percentile_scores(ql_median)

    # --- local_chain: median chain SHARE (0..1) per street -> 2·share-1 (+ = chain)
    lc_median = _median_agg_per_street(named_m, chain.to_crs(METRIC_CRS))
    local_chain = np.where(np.isnan(lc_median), np.nan, np.round(lc_median * 2 - 1, 3))

    # --- park: fraction of length near a PUBLIC park -> 2·frac-1 (+ = near a park)
    green_m = _public_green(green.to_crs(METRIC_CRS))
    print(f"[park] using {len(green_m)}/{len(green)} public green areas "
          f"(dropped private gardens + patches < {MIN_GREEN_AREA_M2:.0f} m²)")
    park_frac = _green_fraction_per_street(named_m, green_m)
    park = np.round(park_frac * 2 - 1, 3)

    results = {
        "quiet_lively": quiet_lively,
        "local_chain": local_chain,
        "park": park,
    }

    # --- preview: clearest streets at each pole, to eyeball orientation ----------
    for dim, arr in results.items():
        order = np.argsort(np.where(np.isnan(arr), 0, arr))
        obs = int((~np.isnan(arr)).sum())
        print(f"\n[{dim}]  ({obs}/{len(named)} streets scored)")
        picks = [i for i in order if not np.isnan(arr[i])]
        for i in picks[:3]:
            print(f"  {arr[i]:+.2f}  {named_m['name'].iloc[i]}")
        if len(picks) > 6:
            print("   ...")
        for i in picks[-3:]:
            print(f"  {arr[i]:+.2f}  {named_m['name'].iloc[i]}")

    return named_m, results


def write_back(named_m, results):
    """Add the three columns to the ORIGINAL geojson features, preserving everything
    else (name / n_blogs / the NLP axes / geometry) and the feature order."""
    collection = json.loads(NAMED_FILE.read_text(encoding="utf-8"))
    feats = collection["features"]
    assert len(feats) == len(named_m), "feature count drifted; aborting to stay safe"

    for i, feat in enumerate(feats):
        feat["properties"].pop("greenery", None)   # drop the pre-rename column if present
        for dim, arr in results.items():
            v = arr[i]
            feat["properties"][dim] = None if (v is None or np.isnan(v)) else float(v)

    NAMED_FILE.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print(f"\n[rollup] wrote 3 columns ({', '.join(results)}) -> {NAMED_FILE}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    named_m, results = rollup()
    if "--write" in sys.argv:
        write_back(named_m, results)
    else:
        print("\n(dry run -- pass --write to add the columns to the geojson)")

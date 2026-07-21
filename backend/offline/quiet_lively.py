"""
Quiet <-> Lively dimension: how many people are actually present on a street.

Per the cadrage, this is measured via 생활인구 (Seoul's de-facto population),
NOT commerce density -- a street full of quiet cafes should score calm, and a
busy market street should score lively regardless of how many shops line it.
Population is the direct signal; the buffer/median/z-score gesture is the
shared one from offline/scores.py.

Scored separately per hour of day (dimension = "quiet_lively_{hour}h") rather
than folded into one "quiet_lively" score, since afternoon and evening foot
traffic can tell different stories for the same street (e.g. a lunch-crowd
alley vs. a dinner/nightlife one) and segment_scores' PRIMARY KEY (edge_id,
dimension) can only hold one score per dimension per segment anyway.

Run:  python -m offline.quiet_lively            (both HOURS below)
      python -m offline.quiet_lively 14          (one hour only)
"""

import sys

from offline.scores import aggregate_to_segments, normalize_and_store

ZONE_SLUG = "jongno"
HOURS = [14, 19]          # afternoon, evening
BUFFER_M = 30              # population_cells are ~ city-block sized, so a modest
                           # buffer is enough to catch the cell(s) around a segment


def build(hour: int, zone_slug: str = ZONE_SLUG, buffer_m: float = BUFFER_M) -> int:
    dimension = f"quiet_lively_{hour}h"
    source_sql = f"""
        SELECT geom, population AS val
        FROM population_cells
        WHERE hour = {hour} AND zone_slug = '{zone_slug}' AND population IS NOT NULL
    """
    rows = aggregate_to_segments(source_sql, buffer_m=buffer_m, agg="median", zone_slug=zone_slug)

    n_observed = sum(1 for r in rows if r["source_count"] > 0)
    print(f"[{dimension}] {len(rows)} segments in zone '{zone_slug}', "
          f"{n_observed} with a population cell within {buffer_m}m")

    # invert=False: higher population -> higher (positive) score -> "lively" pole
    n = normalize_and_store(
        dimension=dimension,
        rows=rows,
        method=f"buffer_median_pop_{hour}h",
        zone_slug=zone_slug,
        invert=False,
    )
    print(f"[{dimension}] wrote {n} rows into segment_scores")
    return n


if __name__ == "__main__":
    hours = [int(sys.argv[1])] if len(sys.argv) > 1 else HOURS
    for h in hours:
        build(h)

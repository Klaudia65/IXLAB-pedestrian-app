"""
Export the PostGIS `street_characters` table (one zone) to a static GeoJSON file
the web app can load. Same bridge as the other exporters: MapLibre fetches the
file from web/frontend/ directly (same origin, no CORS).

This is stage [9] of the street-character pipeline ("show few, show sure"): by
default we export ONLY the confident streets (a confirmed Wiki* identity, or a
Wave-2 convergence score above threshold), each with a short "why" and its
confidence, so the map stays legible instead of drowning in every named street.
Pass --all to dump every collected way (useful for debugging / Wave-2 tuning).

Run:  python -m offline.export_street_character_geojson jongno       (confident only)
      python -m offline.export_street_character_geojson jongno --all (everything)
"""

import json
import pathlib
import sys

import psycopg

from offline.db import get_dsn

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

# Build one GeoJSON FeatureCollection straight from SQL, ONE FEATURE PER WAY-SEGMENT
# (NOT merged into corridors). The commerce signature is LOCAL — computed per segment
# so a long street varies block to block (종로's jewellers vs its textile blocks) —
# and merging same-name ways would average that variation away, the very imprecision
# we're fixing. The text fingerprint (`why`) is per-name but stored on every way, so it
# simply repeats along the street's segments, which reads fine on the map.
#
# A segment is shown if it is CONFIDENT by text (confidence >= min_conf) OR carries a
# strong enough LOCAL-EVIDENCE signature (commerce_count >= min_shops). The second
# clause is the coverage win from commerce_signature.py. `evidence` records which
# source carries the segment (text article, local commerce, or both).
#
# Walkability is now per-segment (its own highway class), not a length-weighted majority
# over the whole name: "marchable" = real through-traffic classes (tertiary/secondary/
# primary), else "pieton" (pedestrian ways + quiet residential/service alleys). This is
# strictly more accurate than the old corridor average.
QUERY = """
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(geom)::jsonb,
    'properties', jsonb_build_object(
      'name', name,
      'highway', highway,
      'walkability', CASE WHEN highway IN ('tertiary','secondary','primary')
                          THEN 'marchable' ELSE 'pieton' END,
      'wikidata', wikidata,
      'wikipedia', wikipedia,
      'why', array_to_string(fingerprint[1:3], ', '),
      -- Pair each signature category with its own shop count -> "예술품 소매업 (3)".
      -- The count makes explicit that ranking is by over-representation, not raw count.
      -- Only shown when the segment clears min_shops: a signature built on 1-2 shops
      -- (a text street with a couple of shops nearby) is noise, so text-only segments
      -- with too few shops show no commerce line at all.
      'commerce_why', CASE WHEN commerce_count >= %(min_shops)s THEN (
        SELECT string_agg(sig || ' (' || cnt || ')', ', ' ORDER BY ord)
        FROM unnest(commerce_signature[1:4], commerce_signature_counts[1:4])
             WITH ORDINALITY AS u(sig, cnt, ord)
      ) END,
      'commerce_count', commerce_count,
      'evidence', CASE
        WHEN confidence >= %(min_conf)s AND commerce_count >= %(min_shops)s THEN 'both'
        WHEN confidence >= %(min_conf)s                                     THEN 'text'
        ELSE 'commerce' END,
      'description', description,
      'confidence', confidence
    )
  ) AS feature
  FROM street_characters
  WHERE zone_slug = %(zone_slug)s
    AND ST_GeometryType(geom) = 'ST_LineString'
    AND (%(all)s OR confidence >= %(min_conf)s OR commerce_count >= %(min_shops)s)
) sub;
"""


# A street shown purely on commerce evidence needs enough shops for the signature to
# be trustworthy (the TF-IDF is meaningless on 3-4 shops). 12 keeps the map legible
# while still adding the bulk of the coverage gain over text-only.
MIN_SHOPS = 12


def export(zone_slug: str, show_all: bool = False,
           min_conf: float = 0.5, min_shops: int = MIN_SHOPS) -> pathlib.Path:
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY, {"zone_slug": zone_slug, "all": show_all,
                            "min_conf": min_conf, "min_shops": min_shops})
        collection = cur.fetchone()[0]  # psycopg returns jsonb as a Python dict

    out_path = FRONTEND / f"street-character-{zone_slug}.geojson"
    # ensure_ascii=False keeps Korean street names/descriptions readable
    out_path.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")

    n = len(collection["features"])
    scope = "all" if show_all else f"confidence >= {min_conf} OR commerce_count >= {min_shops}"
    print(f"Exported {n} street characters ({scope}) -> {out_path}")
    return out_path


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    zone = args[0] if args else "jongno"
    export(zone, show_all="--all" in sys.argv)

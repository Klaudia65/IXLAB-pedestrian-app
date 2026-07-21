"""
Export one dimension's segment_scores, joined to its osm_network geometry, to a
static GeoJSON file the web app can load. Same pragmatic bridge as
export_geojson.py / export_paths_geojson.py.

Run:  python -m offline.export_scores_geojson quiet_lively jongno
"""

import json
import pathlib
import sys

import psycopg

from offline.db import get_dsn

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

# Build one GeoJSON FeatureCollection straight from SQL: the segment's geometry
# (from osm_network) plus its score properties (from segment_scores).
QUERY = """
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
)
FROM (
  SELECT jsonb_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(e.geom)::jsonb,
    'properties', jsonb_build_object(
      'edge_id', s.edge_id,
      'score', s.score,
      'agg_value', s.agg_value,
      'source_count', s.source_count,
      'confidence', s.confidence,
      'is_observed', s.is_observed
    )
  ) AS feature
  FROM segment_scores s
  JOIN osm_network e ON e.edge_id = s.edge_id
  WHERE s.dimension = %(dimension)s AND s.zone_slug = %(zone_slug)s
) sub;
"""


def export(dimension: str, zone_slug: str) -> pathlib.Path:
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY, {"dimension": dimension, "zone_slug": zone_slug})
        collection = cur.fetchone()[0]  # psycopg returns jsonb as a Python dict

    out_path = FRONTEND / f"scores-{dimension}-{zone_slug}.geojson".replace("_", "-")
    out_path.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")

    n = len(collection["features"])
    n_observed = sum(1 for f in collection["features"] if f["properties"]["is_observed"])
    print(f"Exported {n} segments ({n_observed} observed) -> {out_path}")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m offline.export_scores_geojson <dimension> <zone_slug>", file=sys.stderr)
        sys.exit(1)
    export(sys.argv[1], sys.argv[2])

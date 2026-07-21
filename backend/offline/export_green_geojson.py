"""
Export the PostGIS `green_spaces` table (one zone) to a static GeoJSON file the
web app can load. Same pragmatic bridge as export_paths_geojson.py: MapLibre
fetches the file from web/frontend/ directly (same origin, no CORS).

Run:  python -m offline.export_green_geojson jongno      (from the backend/ folder)
"""

import json
import pathlib
import sys

import psycopg

from offline.db import get_dsn

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

# Build one GeoJSON FeatureCollection straight from SQL: each green polygon's
# geometry plus the properties the map colors/labels by.
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
      'osm_id', osm_id,
      'green_type', green_type,
      'osm_key', osm_key,
      'name', name
    )
  ) AS feature
  FROM green_spaces
  WHERE zone_slug = %(zone_slug)s
) sub;
"""


def export(zone_slug: str) -> pathlib.Path:
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY, {"zone_slug": zone_slug})
        collection = cur.fetchone()[0]  # psycopg returns jsonb as a Python dict

    out_path = FRONTEND / f"green-{zone_slug}.geojson"
    # ensure_ascii=False keeps Korean park names readable in the file
    out_path.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")

    n = len(collection["features"])
    print(f"Exported {n} green spaces -> {out_path}")
    return out_path


if __name__ == "__main__":
    zone = sys.argv[1] if len(sys.argv) > 1 else "jongno"
    export(zone)

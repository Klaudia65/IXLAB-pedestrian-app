"""
Export the PostGIS `pois` table to a static GeoJSON file the web app can load.

This is a pragmatic bridge while the FastAPI app is not runnable (Python 3.14):
the static server already serves web/frontend/, so MapLibre can fetch the file
directly. Later, a FastAPI endpoint would replace this with a live feed.

Run:  python -m offline.export_geojson      (from the backend/ folder)
"""

import json
import pathlib
import psycopg

from offline.db import get_dsn

# where to write: <project root>/web/frontend/pois.geojson
OUT_PATH = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend" / "pois.geojson"

# Build one GeoJSON FeatureCollection straight from SQL.
# ST_AsGeoJSON turns the geometry into GeoJSON; jsonb_agg gathers all features.
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
      'category', category,
      'subcategory', subcategory,
      'source', source
    )
  ) AS feature
  FROM pois
) sub;
"""


def export() -> None:
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY)
        collection = cur.fetchone()[0]  # psycopg returns jsonb as a Python dict

    n = len(collection["features"])
    # ensure_ascii=False keeps Korean names readable in the file
    OUT_PATH.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {n} features to {OUT_PATH}")


if __name__ == "__main__":
    export()

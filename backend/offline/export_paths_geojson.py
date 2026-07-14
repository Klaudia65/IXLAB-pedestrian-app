"""
Export the PostGIS `paths` table to a static GeoJSON file the web app can load.

Same pragmatic bridge as export_geojson.py (for POIs), but for pedestrian
paths: the static server already serves web/frontend/, so MapLibre can fetch
this file directly — same origin, so no CORS and no dependency on the public
Overpass API at page load. Later, the FastAPI /paths endpoint replaces this.

Run:  python -m offline.export_paths_geojson      (from the backend/ folder)
"""

import json
import pathlib
import psycopg

from offline.db import get_dsn

# where to write: <project root>/web/frontend/paths.geojson
OUT_PATH = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend" / "paths.geojson"

# Build one GeoJSON FeatureCollection straight from SQL.
# ST_AsGeoJSON turns each LINESTRING into GeoJSON; jsonb_agg gathers all features.
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
      'source', source
    )
  ) AS feature
  FROM paths
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

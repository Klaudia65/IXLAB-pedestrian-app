"""
Export the PostGIS `walk_links` table (Seoul official walking network) to a
GeoJSON file for the analysis pipeline.

Why a dedicated export: export_paths_geojson.py dumps the sparse OSM `paths`
table; this one dumps the dense Seoul network AND keeps the pedestrian flags
(crosswalk, park, subway-connected, ...) that will later feed the character
dimensions. We write to analysis/out/ so we never clobber the frontend's file.
"""

import json
import pathlib
import sys

import psycopg

# Make backend/ importable so we can reuse the DB helper.
BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
from offline.db import get_dsn  # noqa: E402

OUT_PATH = pathlib.Path(__file__).resolve().parent / "out" / "walk_links.geojson"

# Build the whole FeatureCollection inside Postgres.
# ST_AsGeoJSON(geom) turns each LINESTRING into GeoJSON geometry;
# jsonb_agg gathers every feature into one array.
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
      'link_id', link_id,
      'link_type_cd', link_type_cd,
      'length_m', length_m,
      'emd_nm', emd_nm,
      'is_crosswalk', is_crosswalk,
      'is_overpass', is_overpass,
      'is_bridge', is_bridge,
      'is_tunnel', is_tunnel,
      'in_park', in_park,
      'subway_connected', subway_connected,
      'near_building', near_building
    )
  ) AS feature
  FROM walk_links
) sub;
"""


def export() -> None:
    OUT_PATH.parent.mkdir(exist_ok=True)
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY)
        collection = cur.fetchone()[0]

    n = len(collection["features"])
    OUT_PATH.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {n} features to {OUT_PATH}")


if __name__ == "__main__":
    export()

"""
Export the commerces of a zone (points) to a static GeoJSON the web app can load,
so a map can show WHERE chains vs independents sit under the per-segment score.
Same pragmatic bridge as export_scores_geojson.py.

Run:  python -m offline.export_commerces_geojson jongno
"""

import json
import pathlib
import sys

import psycopg

from offline.db import get_dsn

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

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
      'is_chain', is_chain,
      'chain_reason', chain_reason,
      'scls', inds_scls_nm
    )
  ) AS feature
  FROM commerces
  WHERE zone_slug = %(zone_slug)s
) sub;
"""


def export(zone_slug: str) -> pathlib.Path:
    with psycopg.connect(get_dsn()) as conn, conn.cursor() as cur:
        cur.execute(QUERY, {"zone_slug": zone_slug})
        collection = cur.fetchone()[0]

    out_path = FRONTEND / f"commerces-{zone_slug}.geojson"
    out_path.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")

    n = len(collection["features"])
    n_chain = sum(1 for f in collection["features"] if f["properties"]["is_chain"])
    print(f"Exported {n} commerces ({n_chain} chain) -> {out_path}")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m offline.export_commerces_geojson <zone_slug>", file=sys.stderr)
        sys.exit(1)
    export(sys.argv[1])

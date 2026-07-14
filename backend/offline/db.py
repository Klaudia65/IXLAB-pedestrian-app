"""
Shared database helper for the offline collectors.

Uses psycopg 3 (synchronous) on purpose: the offline pipeline is a batch job,
independent from the FastAPI app's async stack. It reads the same backend/.env.
"""

import re
import pathlib
import psycopg


def get_dsn() -> str:
    """Read DATABASE_URL from backend/.env and adapt it for psycopg.

    The app uses SQLAlchemy's 'postgresql+asyncpg://...' form; psycopg wants the
    plain 'postgresql://...' form, so we drop the '+asyncpg' driver suffix.
    """
    env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
    url = re.search(r"DATABASE_URL=(\S+)", env_path.read_text()).group(1)
    return url.replace("+asyncpg", "")


def get_seoul_key() -> str:
    """Read the Seoul Open Data Plaza API key (SEOUL_API_KEY) from backend/.env."""
    env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
    m = re.search(r"SEOUL_API_KEY=(\S+)", env_path.read_text(encoding="utf-8"))
    if not m:
        raise RuntimeError("SEOUL_API_KEY not found in backend/.env")
    return m.group(1)


# Insert a POI, or update it if we already have that place_id.
# Geometry is built from lng/lat as an SRID 4326 (WGS84) point.
_UPSERT = """
INSERT INTO pois (place_id, name, category, subcategory, geom, source)
VALUES (
    %(place_id)s, %(name)s, %(category)s, %(subcategory)s,
    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326), %(source)s
)
ON CONFLICT (place_id) DO UPDATE SET
    name        = EXCLUDED.name,
    category    = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    geom        = EXCLUDED.geom,
    updated_at  = NOW();
"""


def upsert_pois(rows: list[dict]) -> int:
    """Insert/update a batch of POI dicts. Returns how many rows were sent.

    Each row must have: place_id, name, category, subcategory, lat, lng, source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT, rows)
        conn.commit()
    return len(rows)


# Insert a pedestrian path (a line), or update it if we already have that osm_id.
# The geometry arrives as a GeoJSON LineString string; ST_GeomFromGeoJSON parses
# it and ST_SetSRID stamps it as WGS84 (4326) to match the column definition.
_UPSERT_PATH = """
INSERT INTO paths (osm_id, name, highway, geom, source)
VALUES (
    %(osm_id)s, %(name)s, %(highway)s,
    ST_SetSRID(ST_GeomFromGeoJSON(%(geojson)s), 4326), %(source)s
)
ON CONFLICT (osm_id) DO UPDATE SET
    name       = EXCLUDED.name,
    highway    = EXCLUDED.highway,
    geom       = EXCLUDED.geom,
    updated_at = NOW();
"""


def upsert_paths(rows: list[dict]) -> int:
    """Insert/update a batch of path dicts. Returns how many rows were sent.

    Each row must have: osm_id, name, highway, geojson (a LineString geometry
    as a JSON string), source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_PATH, rows)
        conn.commit()
    return len(rows)


# Insert a Seoul walk-network link, or update it if we already have that link_id.
# The Seoul API already gives WGS84 WKT (e.g. "LINESTRING(127.02 37.57, ...)"),
# so ST_GeomFromText parses it and we stamp SRID 4326 to match the column.
_UPSERT_WALK_LINK = """
INSERT INTO walk_links (
    link_id, link_type_cd, length_m, sgg_nm, emd_nm,
    is_crosswalk, is_overpass, is_bridge, is_tunnel, in_park,
    subway_connected, near_building, geom, source
)
VALUES (
    %(link_id)s, %(link_type_cd)s, %(length_m)s, %(sgg_nm)s, %(emd_nm)s,
    %(is_crosswalk)s, %(is_overpass)s, %(is_bridge)s, %(is_tunnel)s, %(in_park)s,
    %(subway_connected)s, %(near_building)s,
    ST_SetSRID(ST_GeomFromText(%(wkt)s), 4326), %(source)s
)
ON CONFLICT (link_id) DO UPDATE SET
    link_type_cd     = EXCLUDED.link_type_cd,
    length_m         = EXCLUDED.length_m,
    sgg_nm           = EXCLUDED.sgg_nm,
    emd_nm           = EXCLUDED.emd_nm,
    is_crosswalk     = EXCLUDED.is_crosswalk,
    is_overpass      = EXCLUDED.is_overpass,
    is_bridge        = EXCLUDED.is_bridge,
    is_tunnel        = EXCLUDED.is_tunnel,
    in_park          = EXCLUDED.in_park,
    subway_connected = EXCLUDED.subway_connected,
    near_building    = EXCLUDED.near_building,
    geom             = EXCLUDED.geom,
    updated_at       = NOW();
"""


def upsert_walk_links(rows: list[dict]) -> int:
    """Insert/update a batch of Seoul walk-link dicts. Returns how many were sent.

    Each row must have: link_id, link_type_cd, length_m, sgg_nm, emd_nm, the seven
    boolean flags (is_crosswalk, is_overpass, is_bridge, is_tunnel, in_park,
    subway_connected, near_building), wkt (a LINESTRING as WKT text), source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_WALK_LINK, rows)
        conn.commit()
    return len(rows)

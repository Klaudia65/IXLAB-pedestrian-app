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


def get_data_go_kr_key() -> str:
    """Read the data.go.kr service key (DATA_GO_KR_KEY) from backend/.env.

    One key covers every data.go.kr Open API the account has applied for
    (here: 소상공인시장진흥공단 상가정보, B553077/sdsc2). Use the *Decoding* form of
    the key from data.go.kr -- requests URL-encodes it once when sending, so the
    Encoding form would be double-encoded and rejected (SERVICE_KEY_IS_NOT_REGISTERED).
    """
    env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
    m = re.search(r"DATA_GO_KR_KEY=(\S+)", env_path.read_text(encoding="utf-8"))
    if not m:
        raise RuntimeError("DATA_GO_KR_KEY not found in backend/.env")
    return m.group(1)


def get_sgis_credentials() -> tuple[str, str]:
    """Read (SGIS_SERVICE_ID, SGIS_SECURITY_KEY) from backend/.env.

    SGIS (Statistics Korea's geographic information service) issues these as a
    consumer_key/consumer_secret pair, exchanged for a short-lived accessToken
    via auth/authentication.json (see offline/scrapers/seoul_population_collector.py).
    """
    env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
    text = env_path.read_text(encoding="utf-8")
    sid = re.search(r"SGIS_SERVICE_ID=(\S+)", text)
    skey = re.search(r"SGIS_SECURITY_KEY=(\S+)", text)
    if not sid or not skey:
        raise RuntimeError("SGIS_SERVICE_ID / SGIS_SECURITY_KEY not found in backend/.env")
    return sid.group(1), skey.group(1)


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


# Insert a clean OSM network edge, or update it if we already have that edge_id.
# The geometry arrives as a GeoJSON LineString string (from shapely.mapping);
# ST_GeomFromGeoJSON parses it and ST_SetSRID stamps it as WGS84 (4326).
_UPSERT_OSM_EDGE = """
INSERT INTO osm_network (edge_id, osmid, highway, name, length_m, zone_slug, geom, source)
VALUES (
    %(edge_id)s, %(osmid)s, %(highway)s, %(name)s, %(length_m)s, %(zone_slug)s,
    ST_SetSRID(ST_GeomFromGeoJSON(%(geojson)s), 4326), %(source)s
)
ON CONFLICT (edge_id) DO UPDATE SET
    osmid      = EXCLUDED.osmid,
    highway    = EXCLUDED.highway,
    name       = EXCLUDED.name,
    length_m   = EXCLUDED.length_m,
    zone_slug  = EXCLUDED.zone_slug,
    geom       = EXCLUDED.geom,
    updated_at = NOW();
"""


def upsert_osm_network(rows: list[dict]) -> int:
    """Insert/update a batch of clean OSM network edges. Returns how many were sent.

    Each row must have: edge_id, osmid, highway, name, length_m, zone_slug,
    geojson (a LineString geometry as a JSON string), source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_OSM_EDGE, rows)
        conn.commit()
    return len(rows)


# Insert an OSM green space (a polygon), or update it if we already have that
# osm_id. The geometry arrives as a GeoJSON (Multi)Polygon string (from
# shapely.mapping); ST_GeomFromGeoJSON parses it, ST_Multi coerces a simple
# Polygon to a MultiPolygon so every row fits the MULTIPOLYGON column, and
# ST_SetSRID stamps it as WGS84 (4326).
_UPSERT_GREEN_SPACE = """
INSERT INTO green_spaces (osm_id, green_type, osm_key, name, geom, zone_slug, source)
VALUES (
    %(osm_id)s, %(green_type)s, %(osm_key)s, %(name)s,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%(geojson)s), 4326)), %(zone_slug)s, %(source)s
)
ON CONFLICT (osm_id) DO UPDATE SET
    green_type = EXCLUDED.green_type,
    osm_key    = EXCLUDED.osm_key,
    name       = EXCLUDED.name,
    geom       = EXCLUDED.geom,
    zone_slug  = EXCLUDED.zone_slug,
    updated_at = NOW();
"""


def upsert_green_spaces(rows: list[dict]) -> int:
    """Insert/update a batch of OSM green-space dicts. Returns how many were sent.

    Each row must have: osm_id, green_type, osm_key, name, geojson (a Polygon or
    MultiPolygon geometry as a JSON string, in WGS84), zone_slug, source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_GREEN_SPACE, rows)
        conn.commit()
    return len(rows)


# Insert a population grid cell (a polygon, one row per hour), or update it if we
# already have that (oa_cd, hour). The geometry arrives as a GeoJSON Polygon
# string already reprojected to WGS84 (SGIS natively serves EPSG:5179).
_UPSERT_POPULATION_CELL = """
INSERT INTO population_cells (oa_cd, dong_cd, hour, population, zone_slug, geom, source)
VALUES (
    %(oa_cd)s, %(dong_cd)s, %(hour)s, %(population)s, %(zone_slug)s,
    ST_SetSRID(ST_GeomFromGeoJSON(%(geojson)s), 4326), %(source)s
)
ON CONFLICT (oa_cd, hour) DO UPDATE SET
    dong_cd    = EXCLUDED.dong_cd,
    population = EXCLUDED.population,
    zone_slug  = EXCLUDED.zone_slug,
    geom       = EXCLUDED.geom,
    updated_at = NOW();
"""


def upsert_population_cells(rows: list[dict]) -> int:
    """Insert/update a batch of population grid cells. Returns how many were sent.

    Each row must have: oa_cd, dong_cd, hour, population (may be None if
    privacy-suppressed), zone_slug, geojson (a Polygon geometry as a JSON
    string, already in WGS84), source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_POPULATION_CELL, rows)
        conn.commit()
    return len(rows)


# Insert a commercial establishment (a point), or update it if we already have
# that shop_id. The 상가정보 API serves lng/lat as WGS84 already, so we build the
# point straight from ST_MakePoint(lng, lat) and stamp SRID 4326 -- no reprojection.
_UPSERT_COMMERCE = """
INSERT INTO commerces (
    shop_id, name, branch_name, brand_key, is_chain, chain_reason, brand_count,
    inds_lcls_nm, inds_mcls_nm, inds_scls_nm, signgu_nm, adong_nm,
    geom, zone_slug, stdr_ym, source
)
VALUES (
    %(shop_id)s, %(name)s, %(branch_name)s, %(brand_key)s, %(is_chain)s,
    %(chain_reason)s, %(brand_count)s,
    %(inds_lcls_nm)s, %(inds_mcls_nm)s, %(inds_scls_nm)s, %(signgu_nm)s, %(adong_nm)s,
    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326), %(zone_slug)s, %(stdr_ym)s, %(source)s
)
ON CONFLICT (shop_id) DO UPDATE SET
    name         = EXCLUDED.name,
    branch_name  = EXCLUDED.branch_name,
    brand_key    = EXCLUDED.brand_key,
    is_chain     = EXCLUDED.is_chain,
    chain_reason = EXCLUDED.chain_reason,
    brand_count  = EXCLUDED.brand_count,
    inds_lcls_nm = EXCLUDED.inds_lcls_nm,
    inds_mcls_nm = EXCLUDED.inds_mcls_nm,
    inds_scls_nm = EXCLUDED.inds_scls_nm,
    signgu_nm    = EXCLUDED.signgu_nm,
    adong_nm     = EXCLUDED.adong_nm,
    geom         = EXCLUDED.geom,
    zone_slug    = EXCLUDED.zone_slug,
    stdr_ym      = EXCLUDED.stdr_ym,
    updated_at   = NOW();
"""


def upsert_commerces(rows: list[dict]) -> int:
    """Insert/update a batch of commerce dicts. Returns how many were sent.

    Each row must have: shop_id, name, branch_name, brand_key, is_chain,
    chain_reason, brand_count, inds_lcls_nm, inds_mcls_nm, inds_scls_nm,
    signgu_nm, adong_nm, lng, lat (WGS84), zone_slug, stdr_ym, source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_COMMERCE, rows)
        conn.commit()
    return len(rows)


# Insert a street character row (a named way + its identity/text), or update it if
# we already have that osm_id. The geometry arrives as a GeoJSON LineString string
# (from shapely.mapping); ST_GeomFromGeoJSON parses it and ST_SetSRID stamps WGS84
# (4326). The text_sources / fingerprint arrays are passed as Python lists (psycopg
# adapts a list to a Postgres array).
_UPSERT_STREET_CHARACTER = """
INSERT INTO street_characters (
    osm_id, name, highway, wikidata, wikipedia,
    description, text_sources, fingerprint, confidence,
    geom, zone_slug, source
)
VALUES (
    %(osm_id)s, %(name)s, %(highway)s, %(wikidata)s, %(wikipedia)s,
    %(description)s, %(text_sources)s, %(fingerprint)s, %(confidence)s,
    ST_SetSRID(ST_GeomFromGeoJSON(%(geojson)s), 4326), %(zone_slug)s, %(source)s
)
ON CONFLICT (osm_id) DO UPDATE SET
    name         = EXCLUDED.name,
    highway      = EXCLUDED.highway,
    wikidata     = EXCLUDED.wikidata,
    wikipedia    = EXCLUDED.wikipedia,
    description  = EXCLUDED.description,
    text_sources = EXCLUDED.text_sources,
    fingerprint  = EXCLUDED.fingerprint,
    confidence   = EXCLUDED.confidence,
    geom         = EXCLUDED.geom,
    zone_slug    = EXCLUDED.zone_slug,
    updated_at   = NOW();
"""


def upsert_street_characters(rows: list[dict]) -> int:
    """Insert/update a batch of street-character dicts. Returns how many were sent.

    Each row must have: osm_id, name, highway, wikidata (or None), wikipedia (or
    None), description (or None), text_sources (list[str]), fingerprint (list[str]),
    confidence (float), geojson (a LineString geometry as a JSON string, WGS84),
    zone_slug, source.
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPSERT_STREET_CHARACTER, rows)
        conn.commit()
    return len(rows)


def fetch_street_characters(zone_slug: str) -> list[dict]:
    """Read the collected street rows for a zone (for the Wave-2 enrichment step).

    Returns one dict per way: osm_id, name, wikidata (or None). Geometry is left in
    the DB -- enrichment only rewrites text/fingerprint/confidence columns.
    """
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT osm_id, name, wikidata FROM street_characters "
                "WHERE zone_slug = %s ORDER BY name",
                (zone_slug,),
            )
            return [
                {"osm_id": r[0], "name": r[1], "wikidata": r[2]}
                for r in cur.fetchall()
            ]


# Update only the enrichment columns of a street row, keyed by osm_id. Used by the
# Wave-2 text/fingerprint pass, which must not touch geometry or identity tags.
_UPDATE_STREET_ENRICHMENT = """
UPDATE street_characters SET
    description  = %(description)s,
    text_sources = %(text_sources)s,
    fingerprint  = %(fingerprint)s,
    confidence   = %(confidence)s,
    updated_at   = NOW()
WHERE osm_id = %(osm_id)s;
"""


def update_street_character_enrichment(rows: list[dict]) -> int:
    """Update description/text_sources/fingerprint/confidence for a batch of ways.

    Each row must have: osm_id, description (or None), text_sources (list[str]),
    fingerprint (list[str]), confidence (float).
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPDATE_STREET_ENRICHMENT, rows)
        conn.commit()
    return len(rows)


# Update the local-evidence (commerce) signature, keyed by WAY (osm_id): the signature
# is LOCAL, computed per segment (not per whole street) so a long street varies block to
# block. Only the two commerce columns are touched, so this runs independently of the
# text-enrichment pass.
_UPDATE_COMMERCE_SIGNATURE = """
UPDATE street_characters SET
    commerce_signature        = %(commerce_signature)s,
    commerce_signature_counts = %(commerce_signature_counts)s,
    commerce_count            = %(commerce_count)s,
    updated_at                = NOW()
WHERE osm_id = %(osm_id)s;
"""


def update_commerce_signature(rows: list[dict]) -> int:
    """Update commerce signature columns for a batch of ways.

    Each row must have: osm_id, commerce_signature (list[str]),
    commerce_signature_counts (list[int], aligned with the signature), commerce_count (int).
    """
    if not rows:
        return 0
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.executemany(_UPDATE_COMMERCE_SIGNATURE, rows)
        conn.commit()
    return len(rows)

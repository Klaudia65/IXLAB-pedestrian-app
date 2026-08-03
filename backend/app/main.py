"""
FastAPI backend for the pedestrian app.

Approach 1 (API par zone): the map sends its visible bounding box, we run a
spatial query in PostGIS (bbox overlap uses the GiST index) and return only the
POIs in that view as GeoJSON.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, init_db, close_db
from app.api.v1.routes import study


@asynccontextmanager
async def lifespan(app: FastAPI):
    # verify the DB/PostGIS connection at startup, close it cleanly on shutdown
    await init_db()
    yield
    await close_db()


app = FastAPI(title="IXLAB pedestrian API", lifespan=lifespan)

# study telemetry: the write side of the API (session, gps, sliders, ...)
app.include_router(study.router)

# the web map is served from another origin (port 8731) -> allow cross-origin calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only; restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Build a GeoJSON FeatureCollection for the POIs inside the given bbox.
# geom && ST_MakeEnvelope(...) is the fast, index-backed "boxes overlap" test.
# The category filter is appended only when provided, so every bind parameter's
# type stays unambiguous for the driver.
_BASE_SQL = """
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(geom)::jsonb,
      'properties', jsonb_build_object(
          'name', name, 'category', category,
          'subcategory', subcategory, 'source', source)
  )), '[]'::jsonb)
)
FROM pois
WHERE geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
{category_clause};
"""


@app.get("/pois")
async def pois(
    west: float, south: float, east: float, north: float,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return POIs inside the bbox, optionally filtered by family (category)."""
    params = {"west": west, "south": south, "east": east, "north": north}
    category_clause = ""
    if category:
        category_clause = "AND category = :category"
        params["category"] = category

    sql = text(_BASE_SQL.format(category_clause=category_clause))
    result = await db.execute(sql, params)
    return result.scalar()  # the jsonb FeatureCollection


# Same bbox-overlap pattern as /pois, but for the `paths` table (LineStrings).
# Optional `highway` filter (footway, pedestrian, path, steps, living_street).
_PATHS_SQL = """
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(geom)::jsonb,
      'properties', jsonb_build_object(
          'name', name, 'highway', highway, 'source', source)
  )), '[]'::jsonb)
)
FROM paths
WHERE geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
{highway_clause};
"""


@app.get("/paths")
async def paths(
    west: float, south: float, east: float, north: float,
    highway: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return pedestrian paths inside the bbox, optionally filtered by highway type."""
    params = {"west": west, "south": south, "east": east, "north": north}
    highway_clause = ""
    if highway:
        highway_clause = "AND highway = :highway"
        params["highway"] = highway

    sql = text(_PATHS_SQL.format(highway_clause=highway_clause))
    result = await db.execute(sql, params)
    return result.scalar()  # the jsonb FeatureCollection


# Same bbox-overlap pattern, but for the Seoul city walking network (walk_links).
# Exposes the pedestrian flags so the map can style crosswalks/park paths/etc.
# Optional `crosswalk=true` returns only crosswalk links.
_WALK_LINKS_SQL = """
SELECT jsonb_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(geom)::jsonb,
      'properties', jsonb_build_object(
          'link_id', link_id, 'emd_nm', emd_nm, 'length_m', length_m,
          'is_crosswalk', is_crosswalk, 'is_overpass', is_overpass,
          'is_bridge', is_bridge, 'is_tunnel', is_tunnel,
          'in_park', in_park, 'subway_connected', subway_connected,
          'near_building', near_building, 'source', source)
  )), '[]'::jsonb)
)
FROM walk_links
WHERE geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
{crosswalk_clause};
"""


@app.get("/walk-links")
async def walk_links(
    west: float, south: float, east: float, north: float,
    crosswalk: bool | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return Seoul walk-network links inside the bbox, optionally only crosswalks."""
    params = {"west": west, "south": south, "east": east, "north": north}
    crosswalk_clause = ""
    if crosswalk:
        crosswalk_clause = "AND is_crosswalk = TRUE"

    sql = text(_WALK_LINKS_SQL.format(crosswalk_clause=crosswalk_clause))
    result = await db.execute(sql, params)
    return result.scalar()  # the jsonb FeatureCollection

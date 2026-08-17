"""
Read-only export endpoints for the study data.

Why this exists: the collected data lives in the managed Postgres, and the normal
way to get it out is psql on port 5432 — which many institutional networks block
outbound. This router serves the same data over HTTPS (port 443, which always
gets through), letting the researcher pull CSV/GeoJSON from any network.

It is DELIBERATELY separate from the write router:
  * different secret — X-Export-Key, whose value never ships to the browser
    (unlike X-Study-Key, which lives in the public frontend config.js);
  * read-only — every statement here is a SELECT;
  * deny by default in production — no key configured means 503, not "open".

Table names in the generic endpoint are checked against a whitelist and column
names come from information_schema, so nothing user-supplied reaches the SQL.
"""
import csv
import io
import json
import secrets
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db


# Tables the export is allowed to touch: the study schema, nothing else (the
# reference-data tables aren't study output and can be large).
EXPORTABLE_TABLES = {
    "participant", "friendship", "study_group", "group_member", "session",
    "onboarding_choice", "slider_change", "profile_snapshot",
    "recommended_route", "route_choice", "gps_point",
    "search_event", "shared_favorite", "app_event",
    "walk", "walk_member", "walk_event",
}


def require_export_key(x_export_key: str | None = Header(default=None)) -> None:
    """Guard every export route.

    No key configured means: allowed in local dev (debug), refused in production.
    Deny-by-default matters more here than for the write side — a leak exposes
    participants' traces, not just the ability to add noise."""
    expected = settings.study_export_key
    if not expected:
        if settings.debug:
            return
        raise HTTPException(
            status_code=503,
            detail="export disabled: set STUDY_EXPORT_KEY on the server to enable it",
        )
    if not x_export_key or not secrets.compare_digest(x_export_key, expected):
        raise HTTPException(status_code=401, detail="invalid or missing X-Export-Key")


router = APIRouter(
    prefix="/export",
    tags=["export"],
    dependencies=[Depends(require_export_key)],
)


# --- helpers ----------------------------------------------------------------

def _cell(value):
    """Flatten one DB value into something a CSV cell can hold."""
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, Decimal):
        return str(value)
    return value


def _csv_response(rows, columns: list[str], filename: str) -> Response:
    """Build a downloadable CSV. utf-8-sig (BOM) so Excel opens Korean street
    names correctly instead of showing mojibake."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_cell(row[c]) for c in columns])
    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _geojson_response(feature_collection, filename: str) -> Response:
    body = feature_collection if isinstance(feature_collection, str) \
        else json.dumps(feature_collection, ensure_ascii=False)
    return Response(
        content=body.encode("utf-8"),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# One session or all of them: the same optional filter on every route below.
def _session_filter(session_id: int | None, column: str = "g.session_id"):
    if session_id is None:
        return "", {}
    return f"AND {column} = :sid", {"sid": session_id}


# --- overview ---------------------------------------------------------------

@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db)):
    """What has been collected so far — the check you run in the field to confirm
    a session actually landed. Mirrors backend/sql/check_study_data.sql."""
    counts_sql = " UNION ALL ".join(
        f"SELECT '{t}' AS table_name, count(*) AS n_rows FROM {t}"
        for t in sorted(EXPORTABLE_TABLES)
    )
    counts = (await db.execute(text(counts_sql + " ORDER BY 1"))).mappings().all()

    participants = (await db.execute(text("""
        SELECT p.id, p.code, p.display_name, p.friend_code,
               p.consent_at IS NOT NULL AS consented,
               count(s.id) AS sessions, max(s.started_at) AS last_seen
        FROM participant p
        LEFT JOIN session s ON s.participant_id = p.id
        GROUP BY p.id
        ORDER BY last_seen DESC NULLS LAST
    """))).mappings().all()

    sessions = (await db.execute(text("""
        SELECT s.id, p.code AS participant, s.mode, s.app_version,
               s.started_at, s.ended_at,
               (SELECT count(*) FROM gps_point        g WHERE g.session_id = s.id) AS gps,
               (SELECT count(*) FROM slider_change    c WHERE c.session_id = s.id) AS sliders,
               (SELECT count(*) FROM search_event     e WHERE e.session_id = s.id) AS searches,
               (SELECT count(*) FROM recommended_route r WHERE r.session_id = s.id) AS routes,
               (SELECT count(*) FROM app_event        a WHERE a.session_id = s.id) AS events
        FROM session s
        JOIN participant p ON p.id = s.participant_id
        ORDER BY s.started_at DESC
        LIMIT 50
    """))).mappings().all()

    freshness = (await db.execute(text("""
        SELECT 'session' AS stream, max(started_at) AS newest FROM session
        UNION ALL SELECT 'gps_point',     max(ts) FROM gps_point
        UNION ALL SELECT 'slider_change', max(ts) FROM slider_change
        UNION ALL SELECT 'search_event',  max(ts) FROM search_event
        UNION ALL SELECT 'app_event',     max(ts) FROM app_event
        UNION ALL SELECT 'walk_event',    max(ts) FROM walk_event
        ORDER BY 2 DESC NULLS LAST
    """))).mappings().all()

    return {
        "counts": [dict(r) for r in counts],
        "participants": [dict(r) for r in participants],
        "sessions": [dict(r) for r in sessions],
        "freshness": [dict(r) for r in freshness],
    }


# --- GPS --------------------------------------------------------------------

_GPS_SELECT = """
SELECT g.session_id, p.code AS participant, s.mode, g.ts,
       ST_Y(g.geom) AS lat, ST_X(g.geom) AS lon,
       g.accuracy_m, g.speed, g.heading
FROM gps_point g
JOIN session s     ON s.id = g.session_id
JOIN participant p ON p.id = s.participant_id
WHERE TRUE {flt}
ORDER BY g.session_id, g.ts
"""

_GPS_COLUMNS = ["session_id", "participant", "mode", "ts",
                "lat", "lon", "accuracy_m", "speed", "heading"]


@router.get("/gps.csv")
async def gps_csv(
    session_id: int | None = Query(default=None, description="one session, or all if omitted"),
    db: AsyncSession = Depends(get_db),
):
    """Every GPS fix as a CSV row (lat/lon columns) — for pandas or Excel."""
    flt, params = _session_filter(session_id)
    rows = (await db.execute(text(_GPS_SELECT.format(flt=flt)), params)).mappings().all()
    name = f"gps_session_{session_id}.csv" if session_id else "gps_points.csv"
    return _csv_response(rows, _GPS_COLUMNS, name)


@router.get("/gps.geojson")
async def gps_geojson(
    session_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """The same fixes as GeoJSON points — drops straight into QGIS or kepler.gl."""
    flt, params = _session_filter(session_id)
    sql = text("""
        SELECT jsonb_build_object(
                 'type', 'FeatureCollection',
                 'features', coalesce(jsonb_agg(
                     jsonb_build_object(
                       'type', 'Feature',
                       'geometry', ST_AsGeoJSON(g.geom)::jsonb,
                       'properties', jsonb_build_object(
                           'session_id', g.session_id, 'participant', p.code,
                           'ts', g.ts, 'accuracy_m', g.accuracy_m,
                           'speed', g.speed, 'heading', g.heading)
                     ) ORDER BY g.session_id, g.ts), '[]'::jsonb))
        FROM gps_point g
        JOIN session s     ON s.id = g.session_id
        JOIN participant p ON p.id = s.participant_id
        WHERE TRUE """ + flt)
    fc = (await db.execute(sql, params)).scalar()
    name = f"gps_session_{session_id}.geojson" if session_id else "gps_points.geojson"
    return _geojson_response(fc, name)


@router.get("/tracks.geojson")
async def tracks_geojson(
    session_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """One LineString per session: the walked route, with its length in metres.
    ST_MakeLine over an ordered aggregate joins the fixes in time order; a session
    with a single fix has no line and is skipped."""
    flt, params = _session_filter(session_id)
    sql = text("""
        SELECT jsonb_build_object(
                 'type', 'FeatureCollection',
                 'features', coalesce(jsonb_agg(t.f ORDER BY t.session_id), '[]'::jsonb))
        FROM (
          SELECT g.session_id,
                 jsonb_build_object(
                   'type', 'Feature',
                   'geometry', ST_AsGeoJSON(ST_MakeLine(g.geom ORDER BY g.ts))::jsonb,
                   'properties', jsonb_build_object(
                       'session_id', g.session_id,
                       'participant', min(p.code),
                       'mode', min(s.mode),
                       'points', count(*),
                       'started', min(g.ts),
                       'ended', max(g.ts),
                       'length_m', round(ST_Length(ST_MakeLine(g.geom ORDER BY g.ts)::geography)::numeric, 1))
                 ) AS f
          FROM gps_point g
          JOIN session s     ON s.id = g.session_id
          JOIN participant p ON p.id = s.participant_id
          WHERE TRUE """ + flt + """
          GROUP BY g.session_id
          HAVING count(*) > 1
        ) t""")
    fc = (await db.execute(sql, params)).scalar()
    name = f"track_session_{session_id}.geojson" if session_id else "gps_tracks.geojson"
    return _geojson_response(fc, name)


# --- everything else --------------------------------------------------------

@router.get("/tables")
async def tables():
    """Which table names /export/table/{name}.csv accepts."""
    return {"tables": sorted(EXPORTABLE_TABLES)}


@router.get("/table/{name}.csv")
async def table_csv(name: str, db: AsyncSession = Depends(get_db)):
    """Dump one study table as CSV — sliders, searches, routes, favourites, events.

    Geometry columns are skipped (WKB in a spreadsheet is useless): the GPS trace
    has its own endpoints above. Column names are read from information_schema so
    the export follows the schema without a hardcoded list to keep in sync."""
    if name not in EXPORTABLE_TABLES:
        raise HTTPException(status_code=404, detail=f"not exportable: {name}")

    cols = [r[0] for r in (await db.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND udt_name <> 'geometry'
        ORDER BY ordinal_position
    """), {"t": name})).all()]
    if not cols:
        raise HTTPException(status_code=404, detail=f"table not found: {name}")

    # `name` is whitelisted and the columns come from the catalogue, so quoting
    # them is enough to keep this identifier-safe.
    select_list = ", ".join(f'"{c}"' for c in cols)
    order_by = "ts" if "ts" in cols else ("id" if "id" in cols else cols[0])
    rows = (await db.execute(
        text(f'SELECT {select_list} FROM {name} ORDER BY "{order_by}"')
    )).mappings().all()
    return _csv_response(rows, cols, f"{name}.csv")

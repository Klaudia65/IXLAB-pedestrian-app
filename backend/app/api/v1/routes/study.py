"""
Write endpoints for the user study (telemetry).

The read endpoints in app.main stay read-only; everything a participant PRODUCES
is POSTed here and lands in the study tables (see backend/sql/study.sql). Every
route is session-scoped (/sessions/{id}/...) and guarded by a shared key sent in
the X-Study-Key header, so a stranger who finds the URL can't inject fake data.

We use raw SQL (via text()) to match the style of app.main, and PostGIS helpers
(ST_MakePoint / ST_GeomFromGeoJSON) to turn plain lat/lng and GeoJSON into real
geometry columns. get_db() commits automatically when the request succeeds.
"""
import json

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.schemas.study import (
    AppEventIn,
    CountOut,
    FavoriteIn,
    GpsPointIn,
    OnboardingChoiceIn,
    ProfileIn,
    RouteChoiceIn,
    RouteCreated,
    RouteIn,
    SearchIn,
    SessionCreate,
    SessionCreated,
    SliderChangeIn,
)


def require_study_key(x_study_key: str | None = Header(default=None)) -> None:
    """Reject writes without the shared study key. If no key is configured
    (local dev), allow everything so development isn't blocked."""
    expected = settings.study_write_key
    if expected and x_study_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing X-Study-Key")


# The whole router is behind the key: every route below requires it.
router = APIRouter(
    prefix="/sessions",
    tags=["study"],
    dependencies=[Depends(require_study_key)],
)


# --- session lifecycle ------------------------------------------------------

@router.post("", response_model=SessionCreated)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    """Start a session. Creates the participant on first sight of their code
    (upsert), optionally attaches them to a group, and opens a session row."""
    participant_id = (await db.execute(text("""
        INSERT INTO participant (code, condition, consent_at, user_agent)
        VALUES (:code, :condition,
                CASE WHEN :consented THEN NOW() ELSE NULL END, :ua)
        ON CONFLICT (code) DO UPDATE
          SET user_agent = EXCLUDED.user_agent,
              consent_at = COALESCE(participant.consent_at, EXCLUDED.consent_at),
              condition  = COALESCE(participant.condition, EXCLUDED.condition)
        RETURNING id
    """), {
        "code": body.code,
        "condition": body.mode if body.mode in ("solo", "friends") else None,
        "consented": body.consented,
        "ua": body.user_agent,
    })).scalar_one()

    group_id = None
    if body.group_code:
        group_id = (await db.execute(text("""
            INSERT INTO study_group (code) VALUES (:gc)
            ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
            RETURNING id
        """), {"gc": body.group_code})).scalar_one()
        await db.execute(text("""
            INSERT INTO group_member (group_id, participant_id)
            VALUES (:gid, :pid) ON CONFLICT DO NOTHING
        """), {"gid": group_id, "pid": participant_id})

    session_id = (await db.execute(text("""
        INSERT INTO session (participant_id, group_id, mode, app_version)
        VALUES (:pid, :gid, :mode, :ver)
        RETURNING id
    """), {
        "pid": participant_id, "gid": group_id,
        "mode": body.mode, "ver": body.app_version,
    })).scalar_one()

    return SessionCreated(session_id=session_id, participant_id=participant_id)


@router.post("/{session_id}/end")
async def end_session(session_id: int, db: AsyncSession = Depends(get_db)):
    """Mark the session finished."""
    await db.execute(
        text("UPDATE session SET ended_at = NOW() WHERE id = :id"),
        {"id": session_id},
    )
    return {"ok": True}


# --- onboarding & profile ---------------------------------------------------

@router.post("/{session_id}/onboarding", response_model=CountOut)
async def add_onboarding(
    session_id: int, body: list[OnboardingChoiceIn], db: AsyncSession = Depends(get_db)
):
    """Record the burst of forced-choice answers from the swipe onboarding."""
    if not body:
        return CountOut(inserted=0)
    rows = [{
        "sid": session_id, "axis": c.axis,
        "l": c.left_card_id, "r": c.right_card_id,
        "side": c.chosen_side, "chosen": c.chosen_card_id,
    } for c in body]
    await db.execute(text("""
        INSERT INTO onboarding_choice
            (session_id, axis, left_card_id, right_card_id, chosen_side, chosen_card_id)
        VALUES (:sid, :axis, :l, :r, :side, :chosen)
    """), rows)
    return CountOut(inserted=len(rows))


@router.post("/{session_id}/sliders", response_model=CountOut)
async def add_sliders(
    session_id: int, body: list[SliderChangeIn], db: AsyncSession = Depends(get_db)
):
    """Append slider moves (one row each, so we can see adaptation over time)."""
    if not body:
        return CountOut(inserted=0)
    rows = [{"sid": session_id, "axis": s.axis, "val": s.value} for s in body]
    await db.execute(text("""
        INSERT INTO slider_change (session_id, axis, value)
        VALUES (:sid, :axis, :val)
    """), rows)
    return CountOut(inserted=len(rows))


@router.post("/{session_id}/profile")
async def add_profile(
    session_id: int, body: ProfileIn, db: AsyncSession = Depends(get_db)
):
    """Store the computed 6-axis preference vector at a point in time."""
    await db.execute(text("""
        INSERT INTO profile_snapshot (session_id, source, vector)
        VALUES (:sid, :src, CAST(:vec AS jsonb))
    """), {"sid": session_id, "src": body.source, "vec": json.dumps(body.vector)})
    return {"ok": True}


# --- routes -----------------------------------------------------------------

@router.post("/{session_id}/routes", response_model=RouteCreated)
async def add_route(
    session_id: int, body: RouteIn, db: AsyncSession = Depends(get_db)
):
    """Record a route the app proposed (with the profile/params behind it)."""
    route_id = (await db.execute(text("""
        INSERT INTO recommended_route
            (session_id, route_type, profile, params, geom, length_m, est_min)
        VALUES (:sid, :rt, CAST(:profile AS jsonb), CAST(:params AS jsonb),
                ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), :len, :est)
        RETURNING id
    """), {
        "sid": session_id, "rt": body.route_type,
        "profile": json.dumps(body.profile) if body.profile is not None else None,
        "params": json.dumps(body.params) if body.params is not None else None,
        "geojson": json.dumps(body.geojson),
        "len": body.length_m, "est": body.est_min,
    })).scalar_one()
    return RouteCreated(route_id=route_id)


@router.post("/{session_id}/route-choice")
async def add_route_choice(
    session_id: int, body: RouteChoiceIn, db: AsyncSession = Depends(get_db)
):
    """Record which proposed route the participant picked."""
    await db.execute(text("""
        INSERT INTO route_choice (session_id, recommended_route_id)
        VALUES (:sid, :rid)
    """), {"sid": session_id, "rid": body.route_id})
    return {"ok": True}


# --- gps trace --------------------------------------------------------------

@router.post("/{session_id}/gps", response_model=CountOut)
async def add_gps(
    session_id: int, body: list[GpsPointIn], db: AsyncSession = Depends(get_db)
):
    """Ingest GPS fixes (sent every ~10 s, optionally in small batches)."""
    if not body:
        return CountOut(inserted=0)
    rows = [{
        "sid": session_id, "ts": p.ts, "lng": p.lng, "lat": p.lat,
        "acc": p.accuracy_m, "spd": p.speed, "hdg": p.heading,
    } for p in body]
    await db.execute(text("""
        INSERT INTO gps_point (session_id, ts, geom, accuracy_m, speed, heading)
        VALUES (:sid, :ts, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :acc, :spd, :hdg)
    """), rows)
    return CountOut(inserted=len(rows))


# --- search & social --------------------------------------------------------

@router.post("/{session_id}/search")
async def add_search(
    session_id: int, body: SearchIn, db: AsyncSession = Depends(get_db)
):
    """Record a search-bar query (participant derived from the session)."""
    await db.execute(text("""
        INSERT INTO search_event (session_id, participant_id, query, kind)
        SELECT :sid, s.participant_id, :q, :kind FROM session s WHERE s.id = :sid
    """), {"sid": session_id, "q": body.query, "kind": body.kind})
    return {"ok": True}


@router.post("/{session_id}/favorites")
async def add_favorite(
    session_id: int, body: FavoriteIn, db: AsyncSession = Depends(get_db)
):
    """Record a favourite street shared with the group."""
    await db.execute(text("""
        INSERT INTO shared_favorite
            (session_id, participant_id, group_id, street_name, edge_id, note)
        SELECT :sid, s.participant_id, s.group_id, :name, :edge, :note
        FROM session s WHERE s.id = :sid
    """), {"sid": session_id, "name": body.street_name, "edge": body.edge_id, "note": body.note})
    return {"ok": True}


# --- generic events ---------------------------------------------------------

@router.post("/{session_id}/events", response_model=CountOut)
async def add_events(
    session_id: int, body: list[AppEventIn], db: AsyncSession = Depends(get_db)
):
    """Catch-all event log (screen views, taps, ...)."""
    if not body:
        return CountOut(inserted=0)
    rows = [{
        "sid": session_id, "type": e.event_type,
        "payload": json.dumps(e.payload) if e.payload is not None else None,
    } for e in body]
    await db.execute(text("""
        INSERT INTO app_event (session_id, participant_id, event_type, payload)
        SELECT :sid, s.participant_id, :type, CAST(:payload AS jsonb)
        FROM session s WHERE s.id = :sid
    """), rows)
    return CountOut(inserted=len(rows))

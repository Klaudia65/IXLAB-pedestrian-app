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
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.schemas.study import (
    AddFriendIn,
    AppEventIn,
    CountOut,
    FavoriteIn,
    FriendOut,
    FriendsOut,
    GpsPointIn,
    OnboardingChoiceIn,
    ProfileIn,
    RenameIn,
    RouteChoiceIn,
    RouteCreated,
    RouteIn,
    SearchIn,
    SessionCreate,
    SessionCreated,
    SliderChangeIn,
)


# friend_code: a short, human-readable, shareable code others enter to add you.
# Crockford base32 minus the ambiguous letters (I L O U) so it's easy to read
# aloud / retype. ~32^6 ≈ 1e9 combinations → collisions are negligible for a study.
_FCODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _gen_friend_code(n: int = 6) -> str:
    return "".join(secrets.choice(_FCODE_ALPHABET) for _ in range(n))


def _normalize_friend_code(raw: str) -> str:
    """Uppercase and keep only alphabet chars, and fold the shapes people commonly
    mistype (I/L→1, O→0) so a hand-typed code still resolves."""
    s = (raw or "").upper().strip()
    s = s.replace("I", "1").replace("L", "1").replace("O", "0")
    return "".join(c for c in s if c in _FCODE_ALPHABET)


async def _ensure_friend_code(db: AsyncSession, participant_id: int, current: str | None) -> str:
    """Return the participant's friend_code, generating+persisting one on first need
    (covers accounts created before friend_code existed). SELECT-then-UPDATE with a
    few retries; a collision at 32^6 is astronomically unlikely so this is enough."""
    if current:
        return current
    for _ in range(8):
        code = _gen_friend_code()
        taken = (await db.execute(
            text("SELECT 1 FROM participant WHERE friend_code = :c"), {"c": code}
        )).scalar_one_or_none()
        if taken:
            continue
        await db.execute(
            text("UPDATE participant SET friend_code = :c WHERE id = :pid AND friend_code IS NULL"),
            {"c": code, "pid": participant_id},
        )
        return code
    raise HTTPException(status_code=500, detail="could not allocate a friend code")


async def _fetch_friends(db: AsyncSession, participant_id: int) -> list[FriendOut]:
    """Every participant on the other side of a friendship edge touching this one,
    each with their latest saved preference vector (so the client can merge tastes)."""
    rows = (await db.execute(text("""
        SELECT p.id AS participant_id, p.display_name, p.friend_code,
               (SELECT ps.vector
                  FROM profile_snapshot ps
                  JOIN session s ON s.id = ps.session_id
                 WHERE s.participant_id = p.id
                 ORDER BY ps.ts DESC LIMIT 1) AS profile
        FROM friendship f
        JOIN participant p
          ON p.id = CASE WHEN f.a_id = :pid THEN f.b_id ELSE f.a_id END
        WHERE f.a_id = :pid OR f.b_id = :pid
        ORDER BY f.created_at DESC
    """), {"pid": participant_id})).mappings().all()
    return [FriendOut(**row) for row in rows]


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
    """Start a session. Attaches to the participant by their unique handle (`code`),
    creating it on first sight (upsert), optionally attaches them to a group, and
    opens a session row.

    Because the handle is stable and unique, typing it on a fresh device re-attaches
    to the SAME account: `xmax = 0` tells insert (new account) from update (returning
    recovery), and we hand back the current display_name plus the last saved profile
    vector so the client can rehydrate the walker's taste. A blank/whitespace
    display_name is treated as absent so it never wipes an existing label."""
    # Default the label to the handle here (not in SQL) so the :code bind isn't
    # reused with two inferred types — asyncpg can't deduce that and 500s.
    display_name = (body.display_name or "").strip() or body.code
    row = (await db.execute(text("""
        INSERT INTO participant (code, display_name, condition, consent_at, user_agent)
        VALUES (:code, :display_name, :condition,
                CASE WHEN :consented THEN NOW() ELSE NULL END, :ua)
        ON CONFLICT (code) DO UPDATE
          SET user_agent   = EXCLUDED.user_agent,
              consent_at   = COALESCE(participant.consent_at, EXCLUDED.consent_at),
              condition    = COALESCE(participant.condition, EXCLUDED.condition),
              -- keep the existing label; only fill it if this account never had one
              display_name = COALESCE(participant.display_name, EXCLUDED.display_name)
        RETURNING id, display_name, friend_code, (xmax = 0) AS inserted
    """), {
        "code": body.code,
        "display_name": display_name,
        "condition": body.mode if body.mode in ("solo", "friends") else None,
        "consented": body.consented,
        "ua": body.user_agent,
    })).one()
    participant_id = row.id
    is_returning = not row.inserted

    # Make sure this account has a shareable friend code (older accounts predate it).
    friend_code = await _ensure_friend_code(db, participant_id, row.friend_code)

    # Latest preference vector this participant ever saved, so a recovered account
    # comes back with its taste already tuned instead of a blank profile.
    profile = (await db.execute(text("""
        SELECT ps.vector
        FROM profile_snapshot ps
        JOIN session s ON s.id = ps.session_id
        WHERE s.participant_id = :pid
        ORDER BY ps.ts DESC
        LIMIT 1
    """), {"pid": participant_id})).scalar_one_or_none()

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

    friends = await _fetch_friends(db, participant_id)

    return SessionCreated(
        session_id=session_id,
        participant_id=participant_id,
        display_name=row.display_name,
        friend_code=friend_code,
        is_returning=is_returning,
        profile=profile,
        friends=friends,
    )


@router.post("/{session_id}/rename")
async def rename_participant(
    session_id: int, body: RenameIn, db: AsyncSession = Depends(get_db)
):
    """Change the free display label of the session's participant. The unique
    handle (`code`) and participant.id are untouched, so history and (later)
    friendships follow the account across a rename. A blank name is rejected."""
    name = body.display_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="display_name cannot be empty")
    updated = (await db.execute(text("""
        UPDATE participant SET display_name = :name
        WHERE id = (SELECT participant_id FROM session WHERE id = :sid)
        RETURNING display_name
    """), {"name": name, "sid": session_id})).scalar_one_or_none()
    if updated is None:
        raise HTTPException(status_code=404, detail="unknown session")
    return {"ok": True, "display_name": updated}


# --- friends ----------------------------------------------------------------

async def _participant_of_session(db: AsyncSession, session_id: int) -> int:
    pid = (await db.execute(
        text("SELECT participant_id FROM session WHERE id = :sid"), {"sid": session_id}
    )).scalar_one_or_none()
    if pid is None:
        raise HTTPException(status_code=404, detail="unknown session")
    return pid


@router.get("/{session_id}/friends", response_model=FriendsOut)
async def list_friends(session_id: int, db: AsyncSession = Depends(get_db)):
    """List the session participant's current friends (with their taste vectors)."""
    pid = await _participant_of_session(db, session_id)
    return FriendsOut(friends=await _fetch_friends(db, pid))


@router.post("/{session_id}/friends", response_model=FriendsOut)
async def add_friend(
    session_id: int, body: AddFriendIn, db: AsyncSession = Depends(get_db)
):
    """Add a friend by their friend_code. Friendship is instant & mutual: one
    canonical edge is created and both sides now see each other. Idempotent (adding
    an existing friend is a no-op). Returns the updated friends list."""
    pid = await _participant_of_session(db, session_id)
    code = _normalize_friend_code(body.friend_code)
    if not code:
        raise HTTPException(status_code=422, detail="empty or invalid friend code")
    target = (await db.execute(
        text("SELECT id FROM participant WHERE friend_code = :c"), {"c": code}
    )).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="no one has that friend code")
    if target == pid:
        raise HTTPException(status_code=400, detail="that's your own code")
    a_id, b_id = min(pid, target), max(pid, target)
    await db.execute(
        text("INSERT INTO friendship (a_id, b_id) VALUES (:a, :b) ON CONFLICT DO NOTHING"),
        {"a": a_id, "b": b_id},
    )
    return FriendsOut(friends=await _fetch_friends(db, pid))


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

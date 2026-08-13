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
    FriendActivityOut,
    FriendFavoriteOut,
    FriendFavoritesOut,
    FriendOut,
    FriendSearchOut,
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
    WalkAnswerIn,
    WalkCreate,
    WalkInvitationOut,
    WalkInviteIn,
    WalkMemberOut,
    WalkOut,
    WalkStateIn,
    WalkStatusIn,
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


@router.get("/{session_id}/friends/activity", response_model=FriendActivityOut)
async def friends_activity(
    session_id: int,
    window_min: int = 45,
    min_count: int = 2,
    db: AsyncSession = Depends(get_db),
):
    """Recent, repeated searches by the session participant's FRIENDS.

    Powers the "your friend keeps looking for cafés" nudge: for every friend, we
    group their search events from the last `window_min` minutes by (query, kind)
    and return the buckets they hit at least `min_count` times. The client diffs
    the counts against what it has already shown, so a bucket only pops once per
    new repeat. Clamped so a bad query string can't ask for an unbounded window."""
    pid = await _participant_of_session(db, session_id)
    window_min = max(1, min(window_min, 720))     # 1 min … 12 h
    min_count = max(2, min(min_count, 50))
    rows = (await db.execute(text("""
        SELECT p.id AS participant_id, p.display_name,
               se.query, se.kind, COUNT(*) AS count, MAX(se.ts) AS last_ts
        FROM friendship f
        JOIN participant p
          ON p.id = CASE WHEN f.a_id = :pid THEN f.b_id ELSE f.a_id END
        JOIN search_event se ON se.participant_id = p.id
        WHERE (f.a_id = :pid OR f.b_id = :pid)
          AND se.ts > NOW() - make_interval(mins => :win)
        GROUP BY p.id, p.display_name, se.query, se.kind
        HAVING COUNT(*) >= :minc
        ORDER BY MAX(se.ts) DESC
    """), {"pid": pid, "win": window_min, "minc": min_count})).mappings().all()
    return FriendActivityOut(activity=[FriendSearchOut(**row) for row in rows])


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
    """Share a favourite street with my friends. Idempotent: re-sharing the same
    street updates the existing row (edge_id/note/ts) rather than duplicating it —
    the unique (participant_id, street_name) index drives the upsert."""
    if not (body.street_name or "").strip():
        raise HTTPException(status_code=422, detail="street_name is required to share")
    await db.execute(text("""
        INSERT INTO shared_favorite
            (session_id, participant_id, group_id, street_name, edge_id, note)
        SELECT :sid, s.participant_id, s.group_id, :name, :edge, :note
        FROM session s WHERE s.id = :sid
        ON CONFLICT (participant_id, street_name) DO UPDATE
          SET session_id = EXCLUDED.session_id,
              group_id   = EXCLUDED.group_id,
              edge_id    = EXCLUDED.edge_id,
              note       = EXCLUDED.note,
              ts         = NOW()
    """), {"sid": session_id, "name": body.street_name, "edge": body.edge_id, "note": body.note})
    return {"ok": True}


@router.delete("/{session_id}/favorites")
async def remove_favorite(
    session_id: int, body: FavoriteIn, db: AsyncSession = Depends(get_db)
):
    """Un-share a favourite street. Removes the participant's shared row for that
    street (no-op if it wasn't shared). Keyed by participant, so it works from any
    session/device the same account is on."""
    if not (body.street_name or "").strip():
        raise HTTPException(status_code=422, detail="street_name is required to un-share")
    await db.execute(text("""
        DELETE FROM shared_favorite
        WHERE street_name = :name
          AND participant_id = (SELECT participant_id FROM session WHERE id = :sid)
    """), {"sid": session_id, "name": body.street_name})
    return {"ok": True}


@router.get("/{session_id}/friends/favorites", response_model=FriendFavoritesOut)
async def friends_favorites(session_id: int, db: AsyncSession = Depends(get_db)):
    """Streets my FRIENDS have shared, newest first, each tagged with who shared it.

    Sharing follows the friendship graph (mutual friend-code edges), NOT the study
    group — so it works for any two connected participants. My own shares are
    excluded; the client already knows those locally."""
    pid = await _participant_of_session(db, session_id)
    rows = (await db.execute(text("""
        SELECT sf.participant_id, p.display_name,
               sf.street_name, sf.edge_id, sf.note, sf.ts
        FROM friendship f
        JOIN participant p
          ON p.id = CASE WHEN f.a_id = :pid THEN f.b_id ELSE f.a_id END
        JOIN shared_favorite sf ON sf.participant_id = p.id
        WHERE f.a_id = :pid OR f.b_id = :pid
        ORDER BY sf.ts DESC
    """), {"pid": pid})).mappings().all()
    return FriendFavoritesOut(favorites=[FriendFavoriteOut(**row) for row in rows])


# --- shared walk (friends mode) ---------------------------------------------
#
# Everything about a walk is read through GET /walks/current, which the client polls.
# All routes sit under /sessions/{id}/... like the rest of this file, so the shared
# study key plus the session's own participant id are the only auth story -- and every
# route below re-checks that the asking participant is actually a MEMBER of the walk,
# otherwise anyone holding the key could read or rewrite a stranger's negotiation.


async def _walk_out(db: AsyncSession, walk_id: int, me: int) -> WalkOut:
    """Assemble the whole walk as the client consumes it: the negotiation document,
    its version, and every member with the taste they froze when they accepted."""
    w = (await db.execute(text("""
        SELECT id, host_id, status, state, version FROM walk WHERE id = :wid
    """), {"wid": walk_id})).mappings().one_or_none()
    if w is None:
        raise HTTPException(status_code=404, detail="unknown walk")
    rows = (await db.execute(text("""
        SELECT wm.participant_id, p.display_name, wm.role, wm.status, wm.vector, wm.levels
        FROM walk_member wm
        JOIN participant p ON p.id = wm.participant_id
        WHERE wm.walk_id = :wid
        ORDER BY (wm.role = 'host') DESC, wm.invited_at
    """), {"wid": walk_id})).mappings().all()
    return WalkOut(
        walk_id=w["id"], host_id=w["host_id"], me=me, status=w["status"],
        state=w["state"] or {}, version=w["version"],
        members=[WalkMemberOut(**r) for r in rows],
    )


async def _require_member(db: AsyncSession, walk_id: int, pid: int) -> str:
    """Confirm the asking participant is on this walk, and return their status."""
    st = (await db.execute(text("""
        SELECT status FROM walk_member WHERE walk_id = :wid AND participant_id = :pid
    """), {"wid": walk_id, "pid": pid})).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=403, detail="not a member of this walk")
    return st


async def _log_walk_event(
    db: AsyncSession, walk_id: int, pid: int | None, action: str,
    axis: str | None = None, payload: dict | None = None,
) -> None:
    await db.execute(text("""
        INSERT INTO walk_event (walk_id, participant_id, axis, action, payload)
        VALUES (:wid, :pid, :axis, :action, CAST(:payload AS jsonb))
    """), {
        "wid": walk_id, "pid": pid, "axis": axis, "action": action,
        "payload": json.dumps(payload) if payload is not None else None,
    })


@router.post("/{session_id}/walks", response_model=WalkOut)
async def create_walk(
    session_id: int, body: WalkCreate, db: AsyncSession = Depends(get_db)
):
    """Open a walk and invite friends to it. The host is accepted immediately (they
    just asked for it) with their taste frozen; everyone invited starts 'invited' and
    contributes nothing until they answer.

    Invitees must already be friends -- the friendship edge is the only way to reach
    someone, so a walk can't be used to pull a stranger's taste vector out of the DB.
    Any existing un-ended walk this participant hosts is closed first, so "start a
    walk" can't quietly leave several live negotiations behind."""
    pid = await _participant_of_session(db, session_id)
    friends = {f.participant_id for f in await _fetch_friends(db, pid)}
    invitees = [i for i in dict.fromkeys(body.invite) if i != pid]
    strangers = [i for i in invitees if i not in friends]
    if strangers:
        raise HTTPException(status_code=403, detail=f"not your friends: {strangers}")

    await db.execute(text("""
        UPDATE walk SET status = 'ended', ended_at = NOW()
        WHERE host_id = :pid AND status <> 'ended'
    """), {"pid": pid})

    walk_id = (await db.execute(text("""
        INSERT INTO walk (host_id, status) VALUES (:pid, 'lobby') RETURNING id
    """), {"pid": pid})).scalar_one()
    await db.execute(text("""
        INSERT INTO walk_member (walk_id, participant_id, role, status, vector, levels, answered_at)
        VALUES (:wid, :pid, 'host', 'accepted', CAST(:vec AS jsonb), CAST(:lv AS jsonb), NOW())
    """), {
        "wid": walk_id, "pid": pid,
        "vec": json.dumps(body.vector) if body.vector is not None else None,
        "lv": json.dumps(body.levels) if body.levels is not None else None,
    })
    if invitees:
        await db.execute(text("""
            INSERT INTO walk_member (walk_id, participant_id, role, status)
            VALUES (:wid, :pid, 'guest', 'invited') ON CONFLICT DO NOTHING
        """), [{"wid": walk_id, "pid": i} for i in invitees])
    await _log_walk_event(db, walk_id, pid, "invite", None, {"invited": invitees})
    return await _walk_out(db, walk_id, pid)


@router.post("/{session_id}/walks/{walk_id}/invite", response_model=WalkOut)
async def invite_to_walk(
    session_id: int, walk_id: int, body: WalkInviteIn, db: AsyncSession = Depends(get_db)
):
    """Add people to a walk already under way — the '+ invite' button on the group
    screen. Distinct from POST /walks: that one OPENS a walk (and closes the host's
    previous one), which would discard a negotiation the group has already settled.

    Any ACCEPTED member may invite, not just the host: on a walk between friends the
    person who knows the latecomer is rarely the one who opened it. The friendship check
    is against the INVITER, so this still cannot reach a stranger. Someone already on the
    walk is left alone; someone who previously declined is asked again (a fresh invite is
    a new question, and refusing once must not lock them out for good)."""
    pid = await _participant_of_session(db, session_id)
    if await _require_member(db, walk_id, pid) != "accepted":
        raise HTTPException(status_code=403, detail="join the walk before inviting others")
    if (await db.execute(
        text("SELECT status FROM walk WHERE id = :wid"), {"wid": walk_id}
    )).scalar_one_or_none() == "ended":
        raise HTTPException(status_code=409, detail="this walk has ended")

    friends = {f.participant_id for f in await _fetch_friends(db, pid)}
    invitees = [i for i in dict.fromkeys(body.invite) if i != pid]
    strangers = [i for i in invitees if i not in friends]
    if strangers:
        raise HTTPException(status_code=403, detail=f"not your friends: {strangers}")
    if invitees:
        await db.execute(text("""
            INSERT INTO walk_member (walk_id, participant_id, role, status)
            VALUES (:wid, :pid, 'guest', 'invited')
            ON CONFLICT (walk_id, participant_id) DO UPDATE
               SET status = 'invited', invited_at = NOW(), answered_at = NULL
             WHERE walk_member.status = 'declined'
        """), [{"wid": walk_id, "pid": i} for i in invitees])
        await _log_walk_event(db, walk_id, pid, "invite", None, {"invited": invitees})
    return await _walk_out(db, walk_id, pid)


@router.get("/{session_id}/walks/current")
async def current_walk(session_id: int, db: AsyncSession = Depends(get_db)):
    """The walk this participant is on, plus any OTHER walk they've been invited to.

    Which walk is "current" is decided by status before recency: a walk I have ACCEPTED
    wins over a newer invitation. Otherwise being invited somewhere would silently swap
    the negotiation under the feet of a group already bargaining — the invitation has to
    be an offer, not a takeover. Unaccepted invitations therefore ride along in
    `invites`, which is what the transient "join their walk instead?" popup reads. This
    is the one route the client polls, so it answers every question a phone has: am I
    invited, who accepted, what has been proposed, at which version, and is someone else
    asking for me too."""
    pid = await _participant_of_session(db, session_id)
    walk_id = (await db.execute(text("""
        SELECT w.id FROM walk w
        JOIN walk_member wm ON wm.walk_id = w.id AND wm.participant_id = :pid
        WHERE w.status <> 'ended' AND wm.status <> 'declined'
        ORDER BY (wm.status = 'accepted') DESC, w.created_at DESC LIMIT 1
    """), {"pid": pid})).scalar_one_or_none()
    invites = (await db.execute(text("""
        SELECT w.id AS walk_id, w.host_id, p.display_name AS host_name,
               (SELECT COUNT(*) FROM walk_member m
                 WHERE m.walk_id = w.id AND m.status = 'accepted') AS member_count
          FROM walk w
          JOIN walk_member wm ON wm.walk_id = w.id AND wm.participant_id = :pid
          JOIN participant p ON p.id = w.host_id
         WHERE w.status <> 'ended' AND wm.status = 'invited'
           -- cast: with no current walk the parameter is NULL, and Postgres cannot infer
           -- the type of a bare placeholder compared to nothing
           AND (CAST(:cur AS integer) IS NULL OR w.id <> CAST(:cur AS integer))
         ORDER BY wm.invited_at DESC
    """), {"pid": pid, "cur": walk_id})).mappings().all()
    out = {"invites": [WalkInvitationOut(**r) for r in invites]}
    out["walk"] = await _walk_out(db, walk_id, pid) if walk_id is not None else None
    return out


@router.post("/{session_id}/walks/{walk_id}/answer", response_model=WalkOut)
async def answer_walk(
    session_id: int, walk_id: int, body: WalkAnswerIn, db: AsyncSession = Depends(get_db)
):
    """Accept or decline an invitation. Accepting is the moment the taste is frozen:
    from here the negotiation is over THIS vector, not whatever the profile becomes
    later. Declining leaves the row for the record but drops the person from the walk.

    Nobody walks twice at once, so accepting one walk LEAVES every other live one: a walk
    I merely sat on becomes 'declined' (the group stops waiting on me), and one I was
    hosting is ended outright — a host who has gone elsewhere would otherwise leave the
    others bargaining on a walk whose owner is absent."""
    pid = await _participant_of_session(db, session_id)
    await _require_member(db, walk_id, pid)
    if body.accept:
        await db.execute(text("""
            UPDATE walk SET status = 'ended', ended_at = NOW()
             WHERE id <> :wid AND host_id = :pid AND status <> 'ended'
        """), {"wid": walk_id, "pid": pid})
        await db.execute(text("""
            UPDATE walk_member wm
               SET status = 'declined', answered_at = NOW()
             WHERE wm.participant_id = :pid AND wm.walk_id <> :wid
               AND wm.status <> 'declined'
               AND EXISTS (SELECT 1 FROM walk w WHERE w.id = wm.walk_id AND w.status <> 'ended')
        """), {"wid": walk_id, "pid": pid})
    updated = (await db.execute(text("""
        UPDATE walk_member
           SET status = :st, answered_at = NOW(),
               vector = COALESCE(CAST(:vec AS jsonb), vector),
               levels = COALESCE(CAST(:lv AS jsonb), levels)
         WHERE walk_id = :wid AND participant_id = :pid
        RETURNING status
    """), {
        "wid": walk_id, "pid": pid,
        "st": "accepted" if body.accept else "declined",
        "vec": json.dumps(body.vector) if body.vector is not None else None,
        "lv": json.dumps(body.levels) if body.levels is not None else None,
    })).scalar_one_or_none()
    if updated is None:
        raise HTTPException(status_code=404, detail="not invited to this walk")
    await _log_walk_event(db, walk_id, pid, "answer", None, {"accept": body.accept})
    return await _walk_out(db, walk_id, pid)


@router.post("/{session_id}/walks/{walk_id}/state")
async def patch_walk_state(
    session_id: int, walk_id: int, body: WalkStateIn, db: AsyncSession = Depends(get_db)
):
    """Apply a patch to the negotiation and bump the version.

    A null value for an axis REMOVES it (an undo), which a plain jsonb `||` merge
    can't express -- it would store a JSON null and leave the axis looking settled --
    so the document is merged here and written back whole, guarded by the version the
    client last saw. A stale version returns 409 with the current walk attached, so the
    client can re-render from the truth instead of retrying blind."""
    pid = await _participant_of_session(db, session_id)
    # Being invited is not being in: someone who has not accepted must not be able to
    # move the negotiation, or "the others have to accept" would only gate the taste
    # merge and not the bargaining itself.
    if await _require_member(db, walk_id, pid) != "accepted":
        raise HTTPException(status_code=403, detail="accept the walk before changing the negotiation")
    row = (await db.execute(text("""
        SELECT state, version, status FROM walk WHERE id = :wid FOR UPDATE
    """), {"wid": walk_id})).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="unknown walk")
    if row["status"] == "ended":
        raise HTTPException(status_code=409, detail="this walk has ended")
    if body.base_version is not None and body.base_version != row["version"]:
        return {
            "ok": False, "conflict": True,
            "walk": await _walk_out(db, walk_id, pid),
        }

    state = dict(row["state"] or {})
    for axis, settlement in body.patch.items():
        if settlement is None:
            state.pop(axis, None)
        else:
            state[axis] = settlement
    version = (await db.execute(text("""
        UPDATE walk SET state = CAST(:state AS jsonb), version = version + 1
        WHERE id = :wid RETURNING version
    """), {"wid": walk_id, "state": json.dumps(state)})).scalar_one()
    if body.action:
        await _log_walk_event(db, walk_id, pid, body.action, body.axis, {"patch": body.patch})
    return {"ok": True, "conflict": False, "version": version, "state": state}


@router.post("/{session_id}/walks/{walk_id}/status", response_model=WalkOut)
async def set_walk_status(
    session_id: int, walk_id: int, body: WalkStatusIn, db: AsyncSession = Depends(get_db)
):
    """Move the walk out of the lobby, or end it. Only the host can: starting is the
    moment the group commits to who is in, and letting any phone do that would make
    "everyone accepted before we started" unenforceable."""
    pid = await _participant_of_session(db, session_id)
    if body.status not in ("lobby", "active", "ended"):
        raise HTTPException(status_code=422, detail="status must be lobby, active or ended")
    host = (await db.execute(
        text("SELECT host_id FROM walk WHERE id = :wid"), {"wid": walk_id}
    )).scalar_one_or_none()
    if host is None:
        raise HTTPException(status_code=404, detail="unknown walk")
    if host != pid:
        raise HTTPException(status_code=403, detail="only the host can change the walk status")
    # The two timestamp decisions are passed as booleans rather than by comparing :st
    # again inside the CASEs: reusing one bind as both a VARCHAR value and a comparison
    # operand leaves asyncpg unable to deduce a single type for it, and the statement
    # fails with AmbiguousParameterError (same trap as the :code bind in create_session).
    await db.execute(text("""
        UPDATE walk
           SET status = :st,
               started_at = CASE WHEN :go_active THEN COALESCE(started_at, NOW()) ELSE started_at END,
               ended_at   = CASE WHEN :go_ended  THEN NOW() ELSE NULL END
         WHERE id = :wid
    """), {
        "wid": walk_id, "st": body.status,
        "go_active": body.status == "active", "go_ended": body.status == "ended",
    })
    await _log_walk_event(db, walk_id, pid, "status", None, {"status": body.status})
    return await _walk_out(db, walk_id, pid)


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

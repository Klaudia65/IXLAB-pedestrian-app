-- ============================================================================
-- Study / telemetry schema for the user study.
--
-- This is SEPARATE from init.sql: init.sql holds the read-only *reference* data
-- (streets, scores, commerces...) that is identical for every participant, while
-- this file holds the *write* side -- everything a participant produces while
-- using the app, so we can analyse behaviour afterwards.
--
-- Design principles:
--   * Everything hangs off a `session` (one "a person uses the app once"), so
--     the whole trail of a run is reachable from a single session id.
--   * Append-only: we never overwrite. `slider_change` in particular logs EVERY
--     change (not just the final value), which is what lets us see whether the
--     app adapts to changing needs during a walk.
--   * Pseudonymous: a participant is a `code` (e.g. 'P07'); the code<->real
--     identity mapping is kept offline by the researcher, never in this DB.
--   * GPS is stored as a real PostGIS POINT (not two floats) so the trace can be
--     spatially joined against osm_network -- e.g. "did they walk NEW streets?".
--
-- Codes are assigned by hand: the participant types their code at app launch.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- WHO ------------------------------------------------------------------------

-- One row per study participant. Two distinct identity fields, on purpose:
--   * `code`         the stable UNIQUE handle typed at launch (e.g. 'min'). It is
--                    what a returning participant types to re-attach to THIS same
--                    account after clearing local storage. Everything below hangs
--                    off participant.id, so the handle can even be renamed without
--                    orphaning any data.
--   * `display_name` the free, editable label shown in the profile ("Min"). NOT
--                    unique: two people can both display "min". Defaults to `code`.
-- No real name or contact info is ever stored here.
CREATE TABLE IF NOT EXISTS participant (
    id           SERIAL PRIMARY KEY,
    code         VARCHAR(20) UNIQUE NOT NULL,   -- stable unique handle, typed at launch
    display_name VARCHAR(40),                   -- free editable label shown in the app
    friend_code  VARCHAR(12) UNIQUE,            -- short shareable code others use to add you (not the id)
    condition    VARCHAR(10),                   -- planned study arm: 'solo' | 'friends' (nullable)
    consent_at   TIMESTAMPTZ,                   -- when the participant accepted the consent screen
    user_agent   TEXT,                          -- device/browser string, for debugging field issues
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Idempotent adds for databases created before these columns existed.
ALTER TABLE participant ADD COLUMN IF NOT EXISTS display_name VARCHAR(40);
ALTER TABLE participant ADD COLUMN IF NOT EXISTS friend_code  VARCHAR(12) UNIQUE;

-- A mutual friendship between two participants. Stored ONCE per pair in canonical
-- order (a_id < b_id) so the same couple can't be inserted twice from either
-- direction. For a lab study friendship is instant & mutual (no accept step): the
-- moment you enter someone's friend_code, this edge exists for both of you. The
-- CHECK stops self-friendship; a participant's friends = every row touching them.
CREATE TABLE IF NOT EXISTS friendship (
    a_id        INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    b_id        INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);
CREATE INDEX IF NOT EXISTS idx_friendship_b ON friendship (b_id);

-- A group of friends walking together (only used for the "friends" condition).
-- `code` is a short join code so several phones can attach to the same group.
CREATE TABLE IF NOT EXISTS study_group (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20) UNIQUE NOT NULL,   -- e.g. 'JOIN-7X'
    label       VARCHAR(80),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Which participants belong to which group.
CREATE TABLE IF NOT EXISTS group_member (
    group_id        INTEGER NOT NULL REFERENCES study_group(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, participant_id)
);

-- ONE USE --------------------------------------------------------------------

-- One row per "the participant opens and uses the app once". Everything below
-- references a session, so the full trail of a run is reachable from session.id.
CREATE TABLE IF NOT EXISTS session (
    id              SERIAL PRIMARY KEY,
    participant_id  INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    group_id        INTEGER REFERENCES study_group(id) ON DELETE SET NULL,
    mode            VARCHAR(10) NOT NULL DEFAULT 'solo',  -- 'solo' | 'friends'
    app_version     VARCHAR(40),                          -- git sha / build tag, to tie data to a build
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_session_participant ON session (participant_id);
CREATE INDEX IF NOT EXISTS idx_session_group ON session (group_id);

-- ONBOARDING & PROFILE -------------------------------------------------------

-- One forced-choice answer during onboarding (the "this or that" swipe).
-- axis is one of the 6 slider axes (touristy_local, historic_contemporary,
-- raw_polished, quiet_lively, local_chain, park); card ids are the swipe photo
-- ids (e.g. 'c150057362' Commons / 'm1778...' Mapillary).
CREATE TABLE IF NOT EXISTS onboarding_choice (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    axis            VARCHAR(30) NOT NULL,
    left_card_id    VARCHAR(40),
    right_card_id   VARCHAR(40),
    chosen_side     VARCHAR(5),                 -- 'left' | 'right'
    chosen_card_id  VARCHAR(40),
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_choice_session ON onboarding_choice (session_id);

-- Append-only log of every slider move. Keeping ALL moves (not just the final
-- value) is what answers "does the app adapt to changing needs?" -- we can see a
-- participant re-tune their preferences mid-walk.
CREATE TABLE IF NOT EXISTS slider_change (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    axis        VARCHAR(30) NOT NULL,
    value       DOUBLE PRECISION NOT NULL,      -- the axis value after this move
    ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slider_change_session ON slider_change (session_id);

-- The computed preference profile at a moment in time (the 6-axis vector). Stored
-- as JSONB so adding/removing an axis needs no schema change. `source` says what
-- produced it: end of onboarding, a manual slider edit, or a route request.
CREATE TABLE IF NOT EXISTS profile_snapshot (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    source      VARCHAR(20) NOT NULL,           -- 'onboarding' | 'edit' | 'route'
    vector      JSONB NOT NULL,                 -- {"quiet_lively": 0.4, ...}
    ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_snapshot_session ON profile_snapshot (session_id);

-- ROUTES ---------------------------------------------------------------------

-- A route the app proposed to the participant. We keep the profile + params that
-- produced it (so a recommendation is reproducible) and the geometry itself.
-- route_type lets us contrast the "fastest" vs the "enjoyable" proposal.
CREATE TABLE IF NOT EXISTS recommended_route (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    route_type  VARCHAR(20),                    -- 'fastest' | 'enjoyable' | ...
    profile     JSONB,                          -- preference vector used to build it
    params      JSONB,                          -- start point, duration target, etc.
    geom        GEOMETRY(LINESTRING, 4326),     -- the proposed path
    length_m    DOUBLE PRECISION,
    est_min     DOUBLE PRECISION,               -- estimated walking time
    ts          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recommended_route_session ON recommended_route (session_id);
CREATE INDEX IF NOT EXISTS idx_recommended_route_geom_gist ON recommended_route USING GIST (geom);

-- Which proposed route the participant actually chose (answers fastest vs
-- enjoyable at the behaviour level).
CREATE TABLE IF NOT EXISTS route_choice (
    id                    SERIAL PRIMARY KEY,
    session_id            INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    recommended_route_id  INTEGER NOT NULL REFERENCES recommended_route(id) ON DELETE CASCADE,
    ts                    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_choice_session ON route_choice (session_id);

-- GPS TRACE ------------------------------------------------------------------

-- One GPS fix. High volume (many rows per session) -> BIGSERIAL and a compact
-- shape. Stored as a PostGIS POINT so the trace can be spatially joined against
-- osm_network / segment_scores ("did they walk new / high-scoring streets?").
-- `ts` is the device fix time, not the insert time.
CREATE TABLE IF NOT EXISTS gps_point (
    id          BIGSERIAL PRIMARY KEY,
    session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    ts          TIMESTAMPTZ NOT NULL,
    geom        GEOMETRY(POINT, 4326) NOT NULL,
    accuracy_m  DOUBLE PRECISION,               -- reported horizontal accuracy
    speed       DOUBLE PRECISION,               -- m/s, if the device reports it
    heading     DOUBLE PRECISION                -- degrees, if the device reports it
);
CREATE INDEX IF NOT EXISTS idx_gps_point_session_ts ON gps_point (session_id, ts);
CREATE INDEX IF NOT EXISTS idx_gps_point_geom_gist ON gps_point USING GIST (geom);

-- SEARCH & SOCIAL ------------------------------------------------------------

-- One search-bar query. Enables the "food searched 3x" detection and, later, the
-- real-time feature that surfaces a friend's repeated search on the other screen.
CREATE TABLE IF NOT EXISTS search_event (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    query           TEXT NOT NULL,
    kind            VARCHAR(12),                -- 'vibe' | 'function' | 'place'
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_search_event_session ON search_event (session_id);
CREATE INDEX IF NOT EXISTS idx_search_event_query ON search_event (query);

-- A street a participant shared as a favourite with their group. "How often is
-- this used" is just a COUNT over this table per group / per session.
CREATE TABLE IF NOT EXISTS shared_favorite (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    group_id        INTEGER REFERENCES study_group(id) ON DELETE SET NULL,
    street_name     VARCHAR(255),
    edge_id         VARCHAR(80),                -- osm_network edge, when known
    note            TEXT,
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_favorite_group ON shared_favorite (group_id);
CREATE INDEX IF NOT EXISTS idx_shared_favorite_session ON shared_favorite (session_id);
-- One shared row per (participant, street): sharing the same street twice updates
-- the existing row (upsert) instead of duplicating, and un-sharing deletes it. This
-- makes the explicit share/un-share toggle idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_favorite_participant_street
    ON shared_favorite (participant_id, street_name);

-- CATCH-ALL ------------------------------------------------------------------

-- Generic event log for anything not worth its own table (screen views, button
-- taps, feature usage). `payload` is free-form JSONB so new events need no schema
-- change. Keep event_type values to a small documented vocabulary.
CREATE TABLE IF NOT EXISTS app_event (
    id              BIGSERIAL PRIMARY KEY,
    session_id      INTEGER REFERENCES session(id) ON DELETE CASCADE,
    participant_id  INTEGER REFERENCES participant(id) ON DELETE CASCADE,
    event_type      VARCHAR(60) NOT NULL,       -- e.g. 'screen_view', 'search_focus'
    payload         JSONB,
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_event_session ON app_event (session_id);
CREATE INDEX IF NOT EXISTS idx_app_event_type ON app_event (event_type);

-- SHARED WALK (friends mode) -------------------------------------------------

-- One row per "these friends are negotiating and walking together right now".
-- This is what makes the friends mode actually shared: before it existed, who was
-- coming and every step of the preference negotiation lived only in one phone's
-- localStorage, so the other participants' apps knew nothing about any of it.
--
-- `state` IS the negotiation: one entry per axis, keyed by axis name, holding how
-- that disagreement is being settled ('middle' | 'drop' | 'point' | 'trade'), who
-- proposed it, and whether it has been accepted yet. Deliberately ONE jsonb
-- document rather than a row per axis -- every phone reads the whole negotiation on
-- each poll, and a document delivers that in one round trip with no chance of
-- observing a half-applied change.
--
-- `version` is bumped on every state write. Clients poll it to tell "nothing moved"
-- from "re-read everything" cheaply, and send the version they last saw when
-- patching, so two phones editing at the same moment is DETECTED rather than one
-- silently overwriting the other.
CREATE TABLE IF NOT EXISTS walk (
    id          SERIAL PRIMARY KEY,
    host_id     INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    status      VARCHAR(10) NOT NULL DEFAULT 'lobby',   -- 'lobby' | 'active' | 'ended'
    state       JSONB NOT NULL DEFAULT '{}'::jsonb,     -- the per-axis negotiation
    version     INTEGER NOT NULL DEFAULT 0,             -- bumped on every state write
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_walk_host ON walk (host_id);

-- The route the LEADER picked, so every phone can follow the same walk. `route` is the
-- whole option document the map draws (geometry + the ordered legs), which is why it is
-- fetched on its own route rather than ridden along on every 2.5 s poll; `route_summary`
-- is the handful of fields a banner needs (label, minutes, length), small enough to travel
-- with the walk itself. `route_at` is the change token followers compare against.
ALTER TABLE walk ADD COLUMN IF NOT EXISTS route         JSONB;
ALTER TABLE walk ADD COLUMN IF NOT EXISTS route_summary JSONB;
ALTER TABLE walk ADD COLUMN IF NOT EXISTS route_by      INTEGER REFERENCES participant(id) ON DELETE SET NULL;
ALTER TABLE walk ADD COLUMN IF NOT EXISTS route_at      TIMESTAMPTZ;

-- Who is on a walk, and whether they have agreed to be on it. A walk opens with the
-- host 'accepted' and everyone else 'invited'; nobody's taste enters the negotiation
-- until they answer, which is what makes "the others have to accept" a real gate
-- rather than a label on a screen.
--
-- `vector` and `levels` are SNAPSHOT at the moment of accepting, not read live from
-- profile_snapshot. If someone re-swipes their onboarding mid-walk the negotiation
-- must not silently shift under everyone else's feet: the snapshot is "what we agreed
-- to negotiate over", and it is also what makes the concession reconstructable
-- afterwards (RQ1) instead of being measured against a moving baseline.
CREATE TABLE IF NOT EXISTS walk_member (
    walk_id         INTEGER NOT NULL REFERENCES walk(id) ON DELETE CASCADE,
    participant_id  INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL DEFAULT 'guest',    -- 'host' | 'guest'
    status          VARCHAR(10) NOT NULL DEFAULT 'invited',  -- 'invited' | 'accepted' | 'declined'
    vector          JSONB,                                   -- taste snapshot, taken when they accepted
    levels          JSONB,                                   -- declared per-axis levels, same moment
    invited_at      TIMESTAMPTZ DEFAULT NOW(),
    answered_at     TIMESTAMPTZ,
    PRIMARY KEY (walk_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_walk_member_participant ON walk_member (participant_id);

-- Append-only trail of the negotiation: one row per proposal, acceptance, counter or
-- undo. `walk.state` only ever holds the CURRENT position, but RQ1 is about the path
-- taken to reach it -- who conceded, on which axis, after how many counter-offers,
-- and how long it took. That is unrecoverable from the final state alone.
CREATE TABLE IF NOT EXISTS walk_event (
    id              BIGSERIAL PRIMARY KEY,
    walk_id         INTEGER NOT NULL REFERENCES walk(id) ON DELETE CASCADE,
    participant_id  INTEGER REFERENCES participant(id) ON DELETE SET NULL,
    axis            VARCHAR(40),                -- null for whole-walk actions
    action          VARCHAR(20) NOT NULL,       -- 'propose' | 'accept' | 'counter' | 'undo' | 'invite' | 'answer' | 'status'
    payload         JSONB,
    ts              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_walk_event_walk ON walk_event (walk_id, ts);

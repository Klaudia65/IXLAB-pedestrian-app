-- ============================================================================
-- IRREVERSIBLE. Deletes every study participant except the keep-list below,
-- along with everything that hangs off them.
--
-- Why one DELETE is enough: every study table references participant(id) or
-- session(id) with ON DELETE CASCADE (see study.sql), so removing the account
-- removes its profile snapshots, slider log, routes, searches, favourites,
-- app events, friendships, group memberships and the whole GPS trace with it.
--
-- Order of operations:
--   1. run backend/sql/preview_purge.sql and read what it says will go
--   2. take a backup:  python backend/tools/study_backup.py
--   3. run this file:  psql "$DATABASE_URL" -f backend/sql/purge_participants.sql
--   4. clear localStorage on every device that used a deleted code, otherwise
--      the app re-creates the account on the next launch (see the app's
--      seoulwalk.* keys in web/frontend/app/api.js)
--
-- The whole thing runs in ONE transaction: if any statement fails, nothing is
-- deleted.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Codes to KEEP. Everything else is deleted. Must match preview_purge.sql.
CREATE TEMP TABLE keep_code(code text) ON COMMIT DROP;
INSERT INTO keep_code(code) VALUES ('klau');

-- Guard rail. A mistyped code matches no participant, which would silently turn
-- "keep klau" into "delete everyone". Refuse to run rather than find out after.
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(k.code, ', ')
      INTO missing
      FROM keep_code k
     WHERE NOT EXISTS (SELECT 1 FROM participant p WHERE p.code = k.code);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'keep-list code(s) not found in participant: % — aborting, nothing deleted',
            missing;
    END IF;
END $$;

\echo ''
\echo '=== deleting these accounts (cascades to all their data) ==============='
-- RETURNING prints exactly what went, which is the record of what was purged.
DELETE FROM participant
 WHERE code NOT IN (SELECT code FROM keep_code)
RETURNING id, code, display_name, friend_code, created_at;

-- Leftovers the cascade cannot reach, because they hang off no participant:
--   * a study_group whose every member was deleted (group_member cascaded away,
--     the group row itself did not — nothing references it);
--   * a walk hosted by a KEPT participant whose guests were all deleted; the
--     walk survives with no one but the host, which is not a real walk.
DELETE FROM study_group g
 WHERE NOT EXISTS (SELECT 1 FROM group_member m WHERE m.group_id = g.id);

DELETE FROM walk w
 WHERE NOT EXISTS (SELECT 1 FROM walk_member m WHERE m.walk_id = w.id);

\echo ''
\echo '=== what remains ======================================================='
SELECT 'participant'       AS table_name, count(*) FROM participant
UNION ALL SELECT 'session',            count(*) FROM session
UNION ALL SELECT 'gps_point',          count(*) FROM gps_point
UNION ALL SELECT 'profile_snapshot',   count(*) FROM profile_snapshot
UNION ALL SELECT 'onboarding_choice',  count(*) FROM onboarding_choice
UNION ALL SELECT 'slider_change',      count(*) FROM slider_change
UNION ALL SELECT 'recommended_route',  count(*) FROM recommended_route
UNION ALL SELECT 'route_choice',       count(*) FROM route_choice
UNION ALL SELECT 'search_event',       count(*) FROM search_event
UNION ALL SELECT 'shared_favorite',    count(*) FROM shared_favorite
UNION ALL SELECT 'app_event',          count(*) FROM app_event
UNION ALL SELECT 'friendship',         count(*) FROM friendship
UNION ALL SELECT 'study_group',        count(*) FROM study_group
UNION ALL SELECT 'group_member',       count(*) FROM group_member
UNION ALL SELECT 'walk',               count(*) FROM walk
UNION ALL SELECT 'walk_member',        count(*) FROM walk_member
UNION ALL SELECT 'walk_event',         count(*) FROM walk_event
ORDER BY 1;

\echo ''
\echo '=== surviving accounts ================================================='
SELECT p.id, p.code, p.display_name, p.friend_code,
       count(s.id) AS sessions, max(s.started_at) AS last_seen
FROM participant p
LEFT JOIN session s ON s.participant_id = p.id
GROUP BY p.id
ORDER BY p.id;

COMMIT;

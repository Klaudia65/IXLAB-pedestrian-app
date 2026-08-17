-- ============================================================================
-- READ-ONLY preview of what purge_participants.sql would delete.
--
-- Run this FIRST. It touches nothing: every statement is a SELECT. Its job is to
-- answer "am I about to delete the right accounts?" before the irreversible one.
--
--   psql "$DATABASE_URL" -f backend/sql/preview_purge.sql
--
-- The keep-list below must be IDENTICAL to the one in purge_participants.sql.
-- ============================================================================

\set ON_ERROR_STOP on

-- Codes to KEEP. Everything else goes. Edit here AND in purge_participants.sql.
CREATE TEMP TABLE keep_code(code text);
INSERT INTO keep_code(code) VALUES ('klau');

\echo ''
\echo '=== KEPT — these accounts and all their data survive ==================='
SELECT p.id, p.code, p.display_name, p.friend_code,
       p.consent_at IS NOT NULL AS consented,
       count(s.id) AS sessions,
       (SELECT count(*) FROM gps_point g
          JOIN session s2 ON s2.id = g.session_id
         WHERE s2.participant_id = p.id) AS gps_points,
       max(s.started_at) AS last_seen
FROM participant p
LEFT JOIN session s ON s.participant_id = p.id
WHERE p.code IN (SELECT code FROM keep_code)
GROUP BY p.id
ORDER BY p.id;

\echo ''
\echo '=== DELETED — these accounts and everything hanging off them ==========='
SELECT p.id, p.code, p.display_name, p.friend_code,
       p.consent_at IS NOT NULL AS consented,
       count(s.id) AS sessions,
       (SELECT count(*) FROM gps_point g
          JOIN session s2 ON s2.id = g.session_id
         WHERE s2.participant_id = p.id) AS gps_points,
       max(s.started_at) AS last_seen
FROM participant p
LEFT JOIN session s ON s.participant_id = p.id
WHERE p.code NOT IN (SELECT code FROM keep_code)
GROUP BY p.id
ORDER BY last_seen DESC NULLS LAST;

-- A code in the keep-list that matches no row is almost always a typo, and a
-- typo here means the purge deletes EVERYTHING. Surface it loudly.
\echo ''
\echo '=== WARNING — keep-list codes that exist in no participant row ========='
SELECT k.code AS missing_code
FROM keep_code k
WHERE NOT EXISTS (SELECT 1 FROM participant p WHERE p.code = k.code);

\echo ''
\echo '=== Row counts: total vs. what survives the purge ======================'
-- Per table: how many rows now, and how many belong to a kept participant.
-- The difference is what the cascade will remove.
WITH kept AS (
    SELECT id FROM participant WHERE code IN (SELECT code FROM keep_code)
), kept_session AS (
    SELECT id FROM session WHERE participant_id IN (SELECT id FROM kept)
)
SELECT 'participant'      AS table_name, count(*) AS now,
       count(*) FILTER (WHERE id IN (SELECT id FROM kept))                     AS after
  FROM participant
UNION ALL SELECT 'session', count(*),
       count(*) FILTER (WHERE participant_id IN (SELECT id FROM kept))         FROM session
UNION ALL SELECT 'gps_point', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM gps_point
UNION ALL SELECT 'profile_snapshot', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM profile_snapshot
UNION ALL SELECT 'onboarding_choice', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM onboarding_choice
UNION ALL SELECT 'slider_change', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM slider_change
UNION ALL SELECT 'recommended_route', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM recommended_route
UNION ALL SELECT 'search_event', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM search_event
UNION ALL SELECT 'shared_favorite', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM shared_favorite
UNION ALL SELECT 'app_event', count(*),
       count(*) FILTER (WHERE session_id IN (SELECT id FROM kept_session))     FROM app_event
UNION ALL SELECT 'friendship', count(*),
       count(*) FILTER (WHERE a_id IN (SELECT id FROM kept)
                          AND b_id IN (SELECT id FROM kept))                   FROM friendship
UNION ALL SELECT 'walk', count(*),
       count(*) FILTER (WHERE host_id IN (SELECT id FROM kept))                FROM walk
UNION ALL SELECT 'walk_member', count(*),
       count(*) FILTER (WHERE participant_id IN (SELECT id FROM kept))         FROM walk_member
ORDER BY 1;

DROP TABLE keep_code;

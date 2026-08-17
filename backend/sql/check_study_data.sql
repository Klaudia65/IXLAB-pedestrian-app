-- Read-only health check for the study data collected by the app.
-- Usage (Render / production):
--   psql "<External Database URL from the Render dashboard>" -f backend/sql/check_study_data.sql
-- Usage (local Docker stack):
--   psql "postgresql://lab_user:ixlab6531@localhost:5433/explore" -f backend/sql/check_study_data.sql
--
-- Nothing here writes: it only counts rows and lists the most recent activity.

\echo '=== 1. Row count per study table ==='
SELECT 'participant'       AS table_name, count(*) FROM participant
UNION ALL SELECT 'friendship',            count(*) FROM friendship
UNION ALL SELECT 'study_group',           count(*) FROM study_group
UNION ALL SELECT 'group_member',          count(*) FROM group_member
UNION ALL SELECT 'session',               count(*) FROM session
UNION ALL SELECT 'onboarding_choice',     count(*) FROM onboarding_choice
UNION ALL SELECT 'slider_change',         count(*) FROM slider_change
UNION ALL SELECT 'profile_snapshot',      count(*) FROM profile_snapshot
UNION ALL SELECT 'recommended_route',     count(*) FROM recommended_route
UNION ALL SELECT 'route_choice',          count(*) FROM route_choice
UNION ALL SELECT 'gps_point',             count(*) FROM gps_point
UNION ALL SELECT 'search_event',          count(*) FROM search_event
UNION ALL SELECT 'shared_favorite',       count(*) FROM shared_favorite
UNION ALL SELECT 'app_event',             count(*) FROM app_event
UNION ALL SELECT 'walk',                  count(*) FROM walk
UNION ALL SELECT 'walk_member',           count(*) FROM walk_member
UNION ALL SELECT 'walk_event',            count(*) FROM walk_event
ORDER BY 1;

\echo ''
\echo '=== 2. Participants (who actually connected) ==='
SELECT p.id,
       p.code,
       p.display_name,
       p.friend_code,
       p.consent_at IS NOT NULL       AS consented,
       count(s.id)                    AS sessions,
       max(s.started_at)              AS last_seen,
       left(coalesce(p.user_agent, ''), 40) AS device
FROM participant p
LEFT JOIN session s ON s.participant_id = p.id
GROUP BY p.id
ORDER BY last_seen DESC NULLS LAST;

\echo ''
\echo '=== 3. Last 20 sessions, with the volume of data each one produced ==='
SELECT s.id,
       p.code                         AS participant,
       s.mode,
       s.app_version,
       s.started_at,
       s.ended_at,
       (SELECT count(*) FROM gps_point      g WHERE g.session_id = s.id) AS gps,
       (SELECT count(*) FROM slider_change  c WHERE c.session_id = s.id) AS sliders,
       (SELECT count(*) FROM search_event   e WHERE e.session_id = s.id) AS searches,
       (SELECT count(*) FROM recommended_route r WHERE r.session_id = s.id) AS routes,
       (SELECT count(*) FROM app_event      a WHERE a.session_id = s.id) AS events
FROM session s
JOIN participant p ON p.id = s.participant_id
ORDER BY s.started_at DESC
LIMIT 20;

\echo ''
\echo '=== 4. Freshness: newest timestamp seen in each event stream ==='
SELECT 'session'          AS stream, max(started_at) AS newest FROM session
UNION ALL SELECT 'gps_point',        max(ts) FROM gps_point
UNION ALL SELECT 'slider_change',    max(ts) FROM slider_change
UNION ALL SELECT 'search_event',     max(ts) FROM search_event
UNION ALL SELECT 'app_event',        max(ts) FROM app_event
UNION ALL SELECT 'walk_event',       max(ts) FROM walk_event
ORDER BY 2 DESC NULLS LAST;

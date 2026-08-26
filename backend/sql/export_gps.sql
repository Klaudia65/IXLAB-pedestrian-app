-- Export the GPS traces collected by the study, in analysis-ready formats.
--
-- Run it FROM THE REPO ROOT (the output paths below are relative to psql's
-- working directory, not to this file):
--
--   All sessions:
--     psql "<External Database URL from Render>" -f backend/sql/export_gps.sql
--   One session only:
--     psql "<External Database URL from Render>" -v sid=12 -f backend/sql/export_gps.sql
--
-- Writes into backend/analysis/out/study/ :
--   gps_points.csv       one row per GPS fix (lat/lon columns) -- for pandas/Excel
--   gps_points.geojson   the same fixes as points               -- for QGIS/kepler
--   gps_tracks.geojson   one LineString per session             -- the walked route
--
-- Reading only: the temp view exists just for this connection and nothing in the
-- study tables is modified.

\if :{?sid}
\else
  \set sid ''
\endif

\echo '=== Sessions that have GPS data (pick an id for -v sid=... if you want just one) ==='
SELECT g.session_id,
       p.code                AS participant,
       s.mode,
       count(*)              AS points,
       min(g.ts)             AS first_fix,
       max(g.ts)             AS last_fix,
       round((extract(epoch FROM max(g.ts) - min(g.ts)) / 60)::numeric, 1) AS span_min,
       round(ST_Length(ST_MakeLine(g.geom ORDER BY g.ts)::geography)::numeric, 0) AS path_m
FROM gps_point g
JOIN session s     ON s.id = g.session_id
JOIN participant p ON p.id = s.participant_id
GROUP BY g.session_id, p.code, s.mode
ORDER BY g.session_id;

-- One shared definition of "what to export", so the three files always agree.
-- Variable interpolation is NOT performed inside \copy, hence the temp view: the
-- session filter is applied here, in plain SQL, where :'sid' does get substituted.
CREATE TEMP VIEW gps_export AS
SELECT g.session_id,
       p.code           AS participant,
       s.mode,
       g.ts,
       ST_Y(g.geom)     AS lat,
       ST_X(g.geom)     AS lon,
       g.accuracy_m,
       g.speed,
       g.heading,
       g.geom
FROM gps_point g
JOIN session s     ON s.id = g.session_id
JOIN participant p ON p.id = s.participant_id
WHERE :'sid' = '' OR g.session_id = NULLIF(:'sid', '')::int;

\echo ''
\echo '--> backend/analysis/out/study/gps_points.csv'
\copy (SELECT session_id, participant, mode, ts, lat, lon, accuracy_m, speed, heading FROM gps_export ORDER BY session_id, ts) TO 'backend/analysis/out/study/gps_points.csv' WITH (FORMAT csv, HEADER)

-- GeoJSON is a single text value, so switch psql to raw output (no column header,
-- no padding, no row count) and redirect it straight into the file.
\pset format unaligned
\pset tuples_only on

\o backend/analysis/out/study/gps_points.geojson
SELECT jsonb_build_object(
         'type', 'FeatureCollection',
         'features', coalesce(jsonb_agg(
             jsonb_build_object(
               'type', 'Feature',
               'geometry', ST_AsGeoJSON(x.geom)::jsonb,
               'properties', jsonb_build_object(
                   'session_id', x.session_id, 'participant', x.participant,
                   'ts', x.ts, 'accuracy_m', x.accuracy_m,
                   'speed', x.speed, 'heading', x.heading)
             ) ORDER BY x.session_id, x.ts), '[]'::jsonb))
FROM gps_export x;
\o

\o backend/analysis/out/study/gps_tracks.geojson
SELECT jsonb_build_object(
         'type', 'FeatureCollection',
         'features', coalesce(jsonb_agg(t.f ORDER BY t.session_id), '[]'::jsonb))
FROM (
  SELECT session_id,
         jsonb_build_object(
           'type', 'Feature',
           -- ST_MakeLine with an ordered aggregate = the fixes joined in time order
           'geometry', ST_AsGeoJSON(ST_MakeLine(geom ORDER BY ts))::jsonb,
           'properties', jsonb_build_object(
               'session_id', session_id,
               'participant', min(participant),
               'mode', min(mode),
               'points', count(*),
               'started', min(ts),
               'ended', max(ts),
               'length_m', round(ST_Length(ST_MakeLine(geom ORDER BY ts)::geography)::numeric, 1))
         ) AS f
  FROM gps_export
  GROUP BY session_id
  HAVING count(*) > 1          -- a LineString needs at least two points
) t;
\o

\pset tuples_only off
\pset format aligned
\echo ''
\echo 'Done. Files are in backend/analysis/out/study/'

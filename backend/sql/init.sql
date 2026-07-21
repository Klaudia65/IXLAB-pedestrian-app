-- activate the postgis plugin
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

--Points Of Interests table
CREATE TABLE IF NOT EXISTS pois ( 
    id SERIAL PRIMARY KEY,
    place_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(50),
    address VARCHAR(500),

    -- geometry convention x=lng, y=lat
    -- SRID 4326 = WGS84 (GPS standard)
    geom GEOMETRY(POINT, 4326) NOT NULL,

    -- data source
    source VARCHAR(50) DEFAULT 'kakao',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- weights and attributes
    attributes_vector FLOAT[],
    sentiment_score FLOAT,
    review_count INTEGER DEFAULT 0

);

-- indexes for performances
CREATE INDEX IF NOT EXISTS idx_pois_geom_gist ON pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois (category);

-- Pedestrian paths table (lines, not points).
-- Stores walkable OSM ways collected once from Overpass, so the browser never
-- has to query the public Overpass API itself (avoids CORS / rate limits).
CREATE TABLE IF NOT EXISTS paths (
    id SERIAL PRIMARY KEY,
    osm_id VARCHAR(50) UNIQUE NOT NULL,   -- e.g. "osm:w12345"
    name VARCHAR(255),                    -- ways are often unnamed
    highway VARCHAR(30) NOT NULL,         -- footway | pedestrian | path | steps | living_street

    -- geometry convention: a line in SRID 4326 (WGS84)
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    source VARCHAR(50) DEFAULT 'osm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the fast bbox-overlap query; btree on highway for filtering
CREATE INDEX IF NOT EXISTS idx_paths_geom_gist ON paths USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_paths_highway ON paths (highway);

-- Seoul city pedestrian network (source: data.seoul.go.kr, service TbTraficWlkNet).
-- Richer than the OSM `paths` table: each walkable LINK carries pedestrian-specific
-- flags (crosswalk, overpass, bridge, park...) that matter for exploration routing.
-- We store only LINK rows (LineStrings); NODE rows (points) are skipped for now.
CREATE TABLE IF NOT EXISTS walk_links (
    id SERIAL PRIMARY KEY,
    link_id VARCHAR(50) UNIQUE NOT NULL,      -- e.g. "seoul:link:207435" (from LNKG_ID)
    link_type_cd VARCHAR(10),                 -- LNKG_TYPE_CD (decoded by the xlsx code table)
    length_m FLOAT,                           -- LNKG_LEN, segment length in meters
    sgg_nm VARCHAR(40),                        -- district name (e.g. 종로구)
    emd_nm VARCHAR(40),                        -- neighborhood name (e.g. 익선동)

    -- pedestrian attribute flags (API sends "0"/"1"; stored as booleans)
    is_crosswalk BOOLEAN DEFAULT FALSE,        -- CRSWK
    is_overpass  BOOLEAN DEFAULT FALSE,        -- OVRP (pedestrian overpass)
    is_bridge    BOOLEAN DEFAULT FALSE,        -- BRG
    is_tunnel    BOOLEAN DEFAULT FALSE,        -- TNL
    in_park      BOOLEAN DEFAULT FALSE,        -- PARK
    subway_connected BOOLEAN DEFAULT FALSE,    -- SBWY_NTW (linked to a subway network)
    near_building BOOLEAN DEFAULT FALSE,       -- BLDG

    -- geometry: a line in SRID 4326 (WGS84) — API already returns WGS84 WKT
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    source VARCHAR(50) DEFAULT 'seoul',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the fast bbox-overlap query; btree indexes for common filters
CREATE INDEX IF NOT EXISTS idx_walk_links_geom_gist ON walk_links USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_walk_links_sgg ON walk_links (sgg_nm);
CREATE INDEX IF NOT EXISTS idx_walk_links_crosswalk ON walk_links (is_crosswalk);

-- Clean OSM pedestrian network (the analysis backbone graph).
-- Unlike the raw `paths` table, this holds the *deduped, topological* graph built
-- with osmnx (graph_from_bbox + simplify): one edge per segment (no double paths),
-- and it also keeps walkable streets (residential/service/primary...) because the
-- graph must stay connected. A permissive highway filter is used so paths inside
-- enclosed parks/shrines (area=yes / access=private) are NOT dropped.
-- edge_id = "{u}-{v}-{key}" from the osmnx graph, which is globally stable, so
-- re-running an overlapping zone updates the same edge instead of duplicating it.
CREATE TABLE IF NOT EXISTS osm_network (
    id SERIAL PRIMARY KEY,
    edge_id VARCHAR(80) UNIQUE NOT NULL,      -- "{u}-{v}-{key}" from the osmnx graph
    osmid VARCHAR(120),                        -- OSM way id(s), comma-joined when edges merge
    highway VARCHAR(60) NOT NULL,              -- footway|path|steps|residential|... (comma-joined possible)
    name VARCHAR(255),                         -- often null (unnamed ways)
    length_m FLOAT,                            -- segment length in meters
    zone_slug VARCHAR(60),                     -- which zone build last wrote this edge

    -- geometry: a line in SRID 4326 (WGS84)
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    source VARCHAR(50) DEFAULT 'osm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the fast bbox-overlap query; btree on zone for per-zone lookups
CREATE INDEX IF NOT EXISTS idx_osm_network_geom_gist ON osm_network USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_osm_network_zone ON osm_network (zone_slug);

-- Seoul de-facto population (생활인구) grid cells (source: SGIS boundary API +
-- Seoul Open Data ppsLocalResd), used to compute the Quiet<->Lively dimension.
-- Each row is one census output area (집계구) polygon, for one hour of day.
-- SGIS's own internal area codes (adm_cd) do NOT match the official government
-- administrative-code scheme -- they're looked up live via SGIS's addr/stage.json
-- hierarchy. The population API's OA_CD is the same code with one digit
-- (a leading zero on the area's local sequence number) dropped in transit;
-- the collector re-inserts it before matching a cell to its polygon.
CREATE TABLE IF NOT EXISTS population_cells (
    oa_cd       VARCHAR(20) NOT NULL,      -- SGIS 집계구 code (14 digits), e.g. "11010530010001"
    dong_cd     VARCHAR(20),               -- parent 동 code (8 digits, SGIS's own numbering)
    hour        SMALLINT NOT NULL,         -- 0-23, TMZON_PD_SE
    population  FLOAT,                     -- TOT_LVPOP_CO; NULL if privacy-suppressed ("*", count <= 3)
    zone_slug   VARCHAR(60),

    -- geometry: a polygon in SRID 4326 (reprojected from SGIS's native EPSG:5179)
    geom GEOMETRY(POLYGON, 4326) NOT NULL,

    source VARCHAR(50) DEFAULT 'seoul_sgis',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- one row per (cell, hour): recomputing an hour upserts in place
    PRIMARY KEY (oa_cd, hour)
);

-- GiST index for the fast bbox-overlap query; btree indexes for the common filters
CREATE INDEX IF NOT EXISTS idx_population_cells_geom_gist ON population_cells USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_population_cells_zone ON population_cells (zone_slug);
CREATE INDEX IF NOT EXISTS idx_population_cells_hour ON population_cells (hour);

-- OSM green spaces (parks, gardens, woods, grass...) for the Green<->Less-green
-- dimension. Collected from OpenStreetMap via osmnx (features_from_bbox), which
-- assembles multipolygon relations for us, so central-Seoul palace gardens,
-- pocket parks and wooded hillsides come through as real polygons -- far better
-- covered than Seoul's 133-point "major parks" open-data list. Per the cadrage
-- this is the "official/mapped green" layer (what contributors drew); a later
-- NDVI/GVI pass would add the "perceived green" the map misses. Stored as
-- MULTIPOLYGON so simple ways and relation multipolygons share one column type.
-- One row per OSM feature; re-collecting a zone upserts on osm_id.
CREATE TABLE IF NOT EXISTS green_spaces (
    id SERIAL PRIMARY KEY,
    osm_id VARCHAR(50) UNIQUE NOT NULL,      -- e.g. "osm:w12345" / "osm:r678"
    green_type VARCHAR(40) NOT NULL,         -- park|garden|wood|scrub|grass|forest|...
    osm_key VARCHAR(20),                     -- which OSM key matched: leisure|landuse|natural
    name VARCHAR(255),                       -- often null / Korean

    -- geometry: a (multi)polygon in SRID 4326 (WGS84)
    geom GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,

    zone_slug VARCHAR(60),
    source VARCHAR(50) DEFAULT 'osm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the fast bbox-overlap query; btree indexes for common filters
CREATE INDEX IF NOT EXISTS idx_green_spaces_geom_gist ON green_spaces USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_green_spaces_zone ON green_spaces (zone_slug);
CREATE INDEX IF NOT EXISTS idx_green_spaces_type ON green_spaces (green_type);

-- Commercial establishments census (source: 소상공인시장진흥공단 상가(상권)정보,
-- data.go.kr service B553077/sdsc2), used to compute the Local/Independent <->
-- Chain/Commercial dimension. Per the cadrage we abandon OSM here (out of date in
-- Korea) and start from this near-exhaustive census: name, category, coordinates.
-- The census does NOT flag chain vs independent, so the collector derives it and
-- stores is_chain here: a shop is a chain if its normalized name (brand_key)
-- recurs in the zone (frequency) or matches a curated seed list of national
-- brands. The segment score is then just the share of chain shops around it
-- (AVG(is_chain) in a buffer) -- "independents = the complement", no separate
-- hunt for independents needed. Coordinates already arrive in WGS84 (lon/lat).
-- One row per shop (shop_id = bizesId); re-collecting a zone upserts in place.
CREATE TABLE IF NOT EXISTS commerces (
    id SERIAL PRIMARY KEY,
    shop_id VARCHAR(40) UNIQUE NOT NULL,      -- bizesId (상가업소번호), stable per shop
    name VARCHAR(255) NOT NULL,               -- bizesNm (상호명)
    branch_name VARCHAR(255),                 -- brchNm (지점명); often '' for independents
    brand_key VARCHAR(255),                   -- normalized name the chain detection counts on
    is_chain BOOLEAN NOT NULL DEFAULT FALSE,  -- derived: chain (TRUE) vs independent (FALSE)
    chain_reason VARCHAR(12),                 -- why flagged: 'frequency' | 'seed' | NULL if independent
    brand_count INTEGER,                      -- how many times brand_key recurs in the collected zone

    -- 상권업종 category, three nested levels (kept as names for readability)
    inds_lcls_nm VARCHAR(60),                 -- 대분류 (e.g. 음식, 소매)
    inds_mcls_nm VARCHAR(60),                 -- 중분류
    inds_scls_nm VARCHAR(80),                 -- 소분류 (e.g. 카페, 편의점)

    signgu_nm VARCHAR(40),                     -- 시군구 (e.g. 종로구)
    adong_nm  VARCHAR(40),                     -- 행정동

    -- geometry convention x=lng, y=lat; SRID 4326 (WGS84), as the API serves it
    geom GEOMETRY(POINT, 4326) NOT NULL,

    zone_slug VARCHAR(60),
    stdr_ym   VARCHAR(6),                       -- data quarter, e.g. '202603'
    source VARCHAR(50) DEFAULT 'sbdc',          -- 소상공인시장진흥공단
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the buffer/bbox spatial join; btree indexes for common filters
CREATE INDEX IF NOT EXISTS idx_commerces_geom_gist ON commerces USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_commerces_zone ON commerces (zone_slug);
CREATE INDEX IF NOT EXISTS idx_commerces_is_chain ON commerces (is_chain);

-- Per-segment perceptual scores (the 6 bipolar dimensions of the cadrage).
-- The analysis unit is the street segment (one osm_network edge), NOT the GPS point:
-- every dimension is measured by aggregating some data layer within a buffer around
-- the segment, so localization noise is absorbed. Stored "long" (one row per
-- segment x dimension) instead of "wide" (one column per dimension) so that adding
-- a dimension needs no schema change and each dimension can carry its own metadata
-- (confidence, observed-vs-predicted flag, sample count) as required for routing.
CREATE TABLE IF NOT EXISTS segment_scores (
    edge_id     VARCHAR(80) NOT NULL REFERENCES osm_network(edge_id) ON DELETE CASCADE,
    dimension   VARCHAR(40) NOT NULL,   -- 'quiet_lively' | 'green' | 'local_chain' | 'touristy_local' | ...
    agg_value   FLOAT,                  -- aggregated value in natural units (e.g. median 생활인구), recipe in `method`
    score       FLOAT,                  -- normalized value oriented on the bipolar axis (z-score across the zone)
    source_count INTEGER DEFAULT 0,     -- number of source features (cells/trees/shops...) that fell inside the buffer (0 = no data)
    confidence  FLOAT,                  -- 0..1, derived from source_count (and later from the prediction model)
    is_observed BOOLEAN DEFAULT TRUE,   -- TRUE = measured, FALSE = predicted/imputed (used for Raw/Polished gap-filling)
    method      VARCHAR(40),            -- 'buffer_median' | 'buffer_share' | 'spatial_predict' ...
    zone_slug   VARCHAR(60),            -- which zone build last wrote this score
    computed_at TIMESTAMPTZ DEFAULT NOW(),

    -- one score per (segment, dimension): recomputing a dimension upserts in place
    PRIMARY KEY (edge_id, dimension)
);

-- btree indexes for the common lookups: "all scores for this dimension" and per-zone
CREATE INDEX IF NOT EXISTS idx_segment_scores_dimension ON segment_scores (dimension);
CREATE INDEX IF NOT EXISTS idx_segment_scores_zone ON segment_scores (zone_slug);

-- Street experiential character (the "vibe" of a street), Wave 1 = the Wiki* base.
-- Per the street-character design: a street "has a character" when independent
-- sources converge on the same descriptive words -- character lives in how people
-- DESCRIBE a street, not in which shop category dominates. The unit of analysis is
-- the named OSM way (streets/alleys, typically Korean 길), NOT the split graph edge:
-- one row per way so a whole street keeps one identity (grouping contiguous ways
-- into "corridors" is a later stage). We store EVERY named walkable way here as the
-- geometry+identity backbone; the map exporter shows only the confident ones
-- ("show few, show sure").
--
-- Wave 1 fills only the identity layer (Tier A): OSM wikidata/wikipedia tags +
-- the Wikidata description, plus any open OSM description/note text. The columns
-- fingerprint / confidence are created now but stay empty/low until Wave 2 adds
-- the distinctive-vocabulary (TF-IDF/KeyBERT) and multi-source convergence steps.
-- One row per OSM way (osm_id); re-collecting a zone upserts in place.
CREATE TABLE IF NOT EXISTS street_characters (
    id SERIAL PRIMARY KEY,
    osm_id VARCHAR(50) UNIQUE NOT NULL,      -- e.g. "osm:w12345"
    name VARCHAR(255) NOT NULL,              -- the street/alley name (길, -ro, -gil...)
    highway VARCHAR(30),                     -- pedestrian|footway|living_street|residential|path

    -- Identity layer (Tier A). QID/title are NULL for the long tail of ordinary
    -- streets; a non-NULL value means the street already exists in collective
    -- knowledge (Wikidata/Wikipedia), the strongest character signal in Wave 1.
    wikidata VARCHAR(20),                    -- Wikidata QID, e.g. "Q12345" (NULL if none)
    wikipedia VARCHAR(255),                  -- OSM wikipedia tag, e.g. "ko:서순라길" (NULL if none)

    -- Aggregated open descriptive text gathered so far (Wave 1: OSM description/
    -- note tags + the Wikidata description). Wave 2 appends Wikivoyage / open blogs.
    description TEXT,
    -- Which source TYPES contributed text, e.g. {osm:description, wikidata}. Drives
    -- the convergence score (source-type diversity) once Wave 2 adds more sources.
    text_sources TEXT[] DEFAULT '{}',

    -- Character extraction (Wave 2). Distinctive-vocabulary keywords for THIS street
    -- (the "why" shown on the map); empty until the TF-IDF/KeyBERT pass runs.
    fingerprint TEXT[] DEFAULT '{}',
    -- Convergence/confidence 0..1. Wave 1: a simple function of wiki-identity
    -- presence + number of text sources. Wave 2: vocabulary overlap across sources.
    confidence FLOAT DEFAULT 0,

    -- Local-evidence signature (Wave 2b): the "character" read straight from the
    -- shops fronting the street, not from any article. For each street we tally the
    -- 소분류 (scls) categories of the commerces within a buffer and keep the ones that
    -- are OVER-represented here vs the whole zone (TF-IDF over categories) -- so a
    -- galleries+cafés street reads "arty", a 시계/귀금속 cluster reads "jewellers".
    -- This gives a character to any commercial street even with no descriptive text,
    -- the biggest coverage gain (most named streets have shops but no Wikipedia page).
    commerce_signature TEXT[] DEFAULT '{}',        -- top over-represented shop categories
    commerce_signature_counts INTEGER[] DEFAULT '{}', -- shop count per signature category (aligned by index)
    commerce_count INTEGER DEFAULT 0,              -- total # shops in the buffer (evidence weight)

    -- geometry: a line in SRID 4326 (WGS84); non-LineString ways are dropped upstream
    geom GEOMETRY(LINESTRING, 4326) NOT NULL,

    zone_slug VARCHAR(60),
    source VARCHAR(50) DEFAULT 'osm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GiST index for the fast bbox-overlap query; btree indexes for common filters
CREATE INDEX IF NOT EXISTS idx_street_characters_geom_gist ON street_characters USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_street_characters_zone ON street_characters (zone_slug);
CREATE INDEX IF NOT EXISTS idx_street_characters_wikidata ON street_characters (wikidata);

--insert sample data
--INSERT INTO pois (kakao_place_id, name, category, geom, attributes_vector, review_count) VALUES
--   ('test_00...

--verification
SELECT 'PostGIS version: ' || PostGIS_Version() AS setup_status;
SELECT COUNT(*) AS poi_count FROM pois;

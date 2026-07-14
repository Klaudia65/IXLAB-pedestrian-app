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

--insert sample data
--INSERT INTO pois (kakao_place_id, name, category, geom, attributes_vector, review_count) VALUES
--   ('test_00...

--verification
SELECT 'PostGIS version: ' || PostGIS_Version() AS setup_status;
SELECT COUNT(*) AS poi_count FROM pois;

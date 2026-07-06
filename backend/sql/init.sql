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

--insert sample data
--INSERT INTO pois (kakao_place_id, name, category, geom, attributes_vector, review_count) VALUES
--   ('test_00...

--verification
SELECT 'PostGIS version: ' || PostGIS_Version() AS setup_status;
SELECT COUNT(*) AS poi_count FROM pois;

"""
Step 0.1 - Load the pedestrian network and understand its coordinates.

Goal: turn paths.geojson (a "soup of lines") into a GeoDataFrame we can inspect,
and learn the difference between a geographic CRS (degrees) and a projected CRS
(meters).
"""

from pathlib import Path

import geopandas as gpd

# --- Locate the data ---------------------------------------------------------
# The GeoJSON lives in the frontend folder; we build a path relative to this
# script so it works no matter where we run it from.
HERE = Path(__file__).resolve().parent
PATHS_GEOJSON = HERE.parent.parent / "web" / "frontend" / "paths.geojson"

# --- Load --------------------------------------------------------------------
# read_file reads the GeoJSON into a GeoDataFrame: a normal table (pandas)
# with one special column, "geometry", holding the shapely LineStrings.
gdf = gpd.read_file(PATHS_GEOJSON)

print("=== Raw data as loaded ===")
print(f"Number of line features : {len(gdf)}")
print(f"CRS (coordinate system)  : {gdf.crs}")
print(f"Columns                  : {list(gdf.columns)}")
print()
print("First 3 rows:")
print(gdf.head(3))
print()

# --- Reproject to meters -----------------------------------------------------
# 4326 = degrees (good for storage/display, useless for distances).
# 5179 = Korea 2000 / Unified CS, coordinates in METERS around Korea.
gdf_m = gdf.to_crs(epsg=5179)

print("=== After reprojection to EPSG:5179 (meters) ===")
print(f"CRS : {gdf_m.crs.name}")

# Total length of the whole pedestrian network, now that meters are meaningful.
total_km = gdf_m.geometry.length.sum() / 1000
print(f"Total network length : {total_km:.2f} km")

# Bounding box (minx, miny, maxx, maxy) in meters -> physical extent of the area.
minx, miny, maxx, maxy = gdf_m.total_bounds
print(f"Study area extent    : {(maxx - minx):.0f} m wide x {(maxy - miny):.0f} m tall")

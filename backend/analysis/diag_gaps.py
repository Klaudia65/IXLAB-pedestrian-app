"""
Diagnostic: why is the Seoul network fragmented after geometric noding?

Hypothesis: link endpoints that SHOULD meet are separated by tiny gaps, so
unary_union never welds them. We measure, for every link endpoint, the distance
to the NEAREST *other* endpoint, and bucket those gaps.
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import Point

HERE = Path(__file__).resolve().parent
INPUT = HERE / "out" / "walk_links.geojson"

gdf = gpd.read_file(INPUT).to_crs(epsg=5179)

# Collect the two endpoints of every link.
pts = []
for geom in gdf.geometry:
    coords = list(geom.coords)
    pts.append(coords[0])
    pts.append(coords[-1])
pts = np.array(pts)
print(f"{len(pts)} endpoints from {len(gdf)} links")

# For each endpoint, distance to its nearest neighbour that is NOT itself.
tree = cKDTree(pts)
dist, _ = tree.query(pts, k=2)  # k=1 is the point itself (dist 0)
nn = dist[:, 1]

print("\nNearest-neighbour endpoint distance buckets:")
for lo, hi in [(0, 0.001), (0.001, 0.1), (0.1, 0.5), (0.5, 1), (1, 2), (2, 5), (5, np.inf)]:
    n = int(((nn >= lo) & (nn < hi)).sum())
    print(f"  {lo:>6.3f} - {hi:<6} m : {n:6d}  ({100*n/len(nn):5.1f}%)")

print(f"\nEndpoints exactly coincident (<1mm): {(nn < 0.001).sum()}")
print(f"Endpoints with a neighbour in (0, 1m]: {((nn >= 0.001) & (nn <= 1)).sum()}")

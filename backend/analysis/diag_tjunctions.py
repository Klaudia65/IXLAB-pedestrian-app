"""
Diagnostic: are the fragmenting endpoints "dangling" onto the INTERIOR of other
links (T-junctions we miss), or genuinely floating far from everything?

For each link endpoint, measure distance to the nearest OTHER link line.
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely import STRtree
from shapely.geometry import Point

HERE = Path(__file__).resolve().parent
INPUT = HERE / "out" / "walk_links.geojson"

gdf = gpd.read_file(INPUT).to_crs(epsg=5179).reset_index(drop=True)
geoms = list(gdf.geometry)
tree = STRtree(geoms)

gaps = []
for i, geom in enumerate(geoms):
    coords = list(geom.coords)
    for end in (coords[0], coords[-1]):
        p = Point(end)
        # nearest geometry that is NOT this link itself
        idxs = tree.query_nearest(p, exclusive=False, all_matches=True)
        best = None
        for j in np.atleast_1d(idxs):
            if j == i:
                continue
            d = geoms[j].distance(p)
            if best is None or d < best:
                best = d
        if best is not None:
            gaps.append(best)

gaps = np.array(gaps)
print(f"{len(gaps)} endpoints measured against nearest OTHER link line")
print("\nEndpoint -> nearest other line distance:")
for lo, hi in [(0, 0.001), (0.001, 0.5), (0.5, 1), (1, 2), (2, 5), (5, 10), (10, np.inf)]:
    n = int(((gaps >= lo) & (gaps < hi)).sum())
    print(f"  {lo:>6.3f} - {hi:<6} m : {n:6d}  ({100*n/len(gaps):5.1f}%)")

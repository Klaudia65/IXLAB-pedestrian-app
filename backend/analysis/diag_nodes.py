"""
Test the official NODE-layer model: snap each link endpoint to the nearest
official NODE point, then build the graph on node ids. If the walking network
is designed as node+link, this should connect it.
"""

import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from shapely import wkt
from shapely.geometry import box

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from offline.db import get_seoul_key  # noqa: E402
from offline.scrapers.seoul_paths_collector import fetch_page  # noqa: E402

# --- 1. Fetch the NODE points (id + point geometry) --------------------------
key = get_seoul_key()
total = fetch_page(key, 1, 1).get("list_total_count", 0)
node_ids, node_xy = [], []
start = 1
while start <= total:
    end = min(start + 999, total)
    for r in fetch_page(key, start, end).get("row", []):
        if r.get("NODE_TYPE") != "NODE":
            continue
        w = (r.get("NODE_WKT") or "").strip()
        if not w.upper().startswith("POINT"):
            continue
        p = wkt.loads(w)
        node_ids.append(int(float(r["NODE_ID"])))
        node_xy.append((p.x, p.y))
    start = end + 1
print(f"Official NODE points: {len(node_ids)}")

# Reproject node points to meters via a GeoDataFrame for a fair KDTree.
nodes = gpd.GeoSeries(gpd.points_from_xy([x for x, _ in node_xy],
                                         [y for _, y in node_xy]),
                      crs=4326).to_crs(5179)
node_m = np.array([(g.x, g.y) for g in nodes])
tree = cKDTree(node_m)

# --- 2. Load links, clip to study area, snap endpoints to nearest node -------
gdf = gpd.read_file(HERE / "out" / "jongno_links.geojson")
area = gdf[gdf.intersects(box(126.97869, 37.56623, 127.01052, 37.58646))]
area = area.to_crs(5179).reset_index(drop=True)

for radius in (5, 10, 20):
    G = nx.Graph()
    unmatched = 0
    for geom in area.geometry:
        c = list(geom.coords)
        ends = np.array([c[0], c[-1]])
        dist, idx = tree.query(ends)
        if dist[0] > radius or dist[1] > radius:
            unmatched += 1
            continue
        G.add_edge(node_ids[idx[0]], node_ids[idx[1]])
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    share = 100 * len(comps[0]) / G.number_of_nodes() if G.number_of_nodes() else 0
    print(f"radius {radius:2d}m: matched links build "
          f"comps={len(comps):4d} largest={share:4.1f}%  "
          f"(unmatched links={unmatched})")

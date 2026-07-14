"""
On the clipped study area, compare connectivity from:
  - the topology ids (bgng/end)
  - geometry endpoints snapped at increasing tolerances

Goal: find the approach that yields (near) one connected component.
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx
from shapely.geometry import box

HERE = Path(__file__).resolve().parent
gdf = gpd.read_file(HERE / "out" / "jongno_links.geojson")
BBOX = box(126.97869, 37.56623, 127.01052, 37.58646)
area = gdf[gdf.intersects(BBOX)].to_crs(epsg=5179).reset_index(drop=True)
print(f"Study area: {len(area)} links\n")


def summarize(name, G):
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    share = 100 * len(comps[0]) / G.number_of_nodes()
    print(f"{name:<26} nodes={G.number_of_nodes():5d} edges={G.number_of_edges():5d} "
          f"comps={len(comps):4d} largest={share:4.1f}%")


# Topology-id graph
Gt = nx.Graph()
for r in area.itertuples():
    Gt.add_edge(r.bgng_id, r.end_id)
summarize("topology ids", Gt)

# Geometry endpoint graphs at several snap tolerances (meters)
for grid in (0.01, 0.5, 1.0, 2.0, 3.0):
    G = nx.Graph()
    for geom in area.geometry:
        c = list(geom.coords)
        a = (round(c[0][0] / grid) * grid, round(c[0][1] / grid) * grid)
        b = (round(c[-1][0] / grid) * grid, round(c[-1][1] / grid) * grid)
        G.add_edge(a, b)
    summarize(f"geometry snap {grid}m", G)

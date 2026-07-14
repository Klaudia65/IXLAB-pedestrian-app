"""
Step 0.2b (part 2) - Clip the network to the pilot neighborhood and build the
graph from the OFFICIAL topology (BGNG/END ids), then check connectivity.

Key idea: instead of guessing connections from geometry, each link is an edge
between its two endpoint ids. Links sharing an id meet at a junction.
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx
from shapely.geometry import box

HERE = Path(__file__).resolve().parent
LINKS = HERE / "out" / "jongno_links.geojson"

# Pilot study area = footprint of the original OSM neighborhood (WGS84).
BBOX = box(126.97869, 37.56623, 127.01052, 37.58646)

# --- Load and clip to the neighborhood ---------------------------------------
gdf = gpd.read_file(LINKS)
in_area = gdf[gdf.intersects(BBOX)].copy()
print(f"Full Jongno: {len(gdf)} links -> study area: {len(in_area)} links")

# --- Build the graph from topology ids ---------------------------------------
G = nx.Graph()
for row in in_area.itertuples():
    G.add_edge(row.bgng_id, row.end_id, link_id=row.link_id)

comps = sorted(nx.connected_components(G), key=len, reverse=True)
biggest = comps[0]
print(f"\nNodes: {G.number_of_nodes()}  Edges: {G.number_of_edges()}")
print(f"Components: {len(comps)}")
print(f"Largest: {len(biggest)} nodes "
      f"({100*len(biggest)/G.number_of_nodes():.1f}%)")
print("Top 5 sizes:", [len(c) for c in comps[:5]])

# --- Keep the largest connected component as the routable study network ------
# Select links whose BOTH endpoints are in the biggest component.
mask = in_area.apply(lambda r: r.bgng_id in biggest and r.end_id in biggest, axis=1)
main_net = in_area[mask].copy()
km = main_net.to_crs(epsg=5179).geometry.length.sum() / 1000
print(f"\nMain connected network: {len(main_net)} links, {km:.2f} km")

OUT = HERE / "out" / "study_area_network.geojson"
main_net.to_file(OUT, driver="GeoJSON")
print(f"Saved -> {OUT}")

"""
Step 0.2e - Build the analysis base network from OSM (the chosen backbone).

WHY a custom filter instead of network_type="walk":
osmnx's built-in "walk" filter drops ways tagged area=yes / foot=no /
access=private. Inside enclosed parks & shrines (e.g. Jongmyo in Hunjeong-dong)
that silently deletes ~half the footpaths. We use a permissive highway filter
that keeps them.

WHY retain_all=True:
we KEEP disconnected fragments (isolated park loops, dead-ends) rather than
dropping everything but the largest component. Only the space-syntax dimension
needs connectivity (it uses the largest component); sampling + display use all.

Outputs:
  - clean_network.geojson : the edges, for sampling + display
  - walk_graph.graphml    : the networkx graph, for space syntax (Etape 1)
Seoul's pedestrian flags are NOT merged here; they attach to the sampling
points later by spatial join (Etape 0.3/1), keeping this network duplicate-free.
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "out"
BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # left, bottom, right, top

# Pedestrian-inclusive filter WITHOUT osmnx's area/foot/access exclusions, so
# park & shrine paths survive. Keeps walkable streets too (for connectivity).
WALK_FILTER = (
    '["highway"~"footway|path|pedestrian|steps|living_street|residential|'
    'service|unclassified|track|road|primary|secondary|tertiary|cycleway"]'
)

# --- Fetch the walking network -----------------------------------------------
print("Fetching OSM pedestrian network (permissive filter) ...")
G = ox.graph_from_bbox(bbox=BBOX, custom_filter=WALK_FILTER,
                       retain_all=True, simplify=True)

# Report connectivity but DO NOT drop fragments (retain_all kept them).
comps = sorted(nx.connected_components(G.to_undirected()), key=len, reverse=True)
biggest = 100 * len(comps[0]) / G.number_of_nodes()
print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, "
      f"{len(comps)} components (largest {biggest:.1f}% -> used for space syntax)")

# --- Save the graph for space syntax ----------------------------------------
ox.save_graphml(G, OUT_DIR / "walk_graph.graphml")

# --- Save the edges as GeoJSON for sampling/display -------------------------
edges = ox.graph_to_gdfs(G, nodes=False).reset_index()
# GeoJSON can't hold list-valued cells (osmid/highway are sometimes lists).
keep = ["osmid", "highway", "name", "length", "geometry"]
edges = edges[[c for c in keep if c in edges.columns]].copy()
for col in ("osmid", "highway", "name"):
    if col in edges.columns:
        edges[col] = edges[col].apply(lambda v: ", ".join(map(str, v)) if isinstance(v, list) else v)

km = edges.to_crs(epsg=5179).geometry.length.sum() / 1000
print(f"Edges: {len(edges)} segments, {km:.1f} km")
print("Highway types:\n", edges["highway"].value_counts().head(10))

edges.to_file(OUT_DIR / "clean_network.geojson", driver="GeoJSON")
print(f"\nSaved -> {OUT_DIR / 'clean_network.geojson'}")
print(f"Saved -> {OUT_DIR / 'walk_graph.graphml'}")

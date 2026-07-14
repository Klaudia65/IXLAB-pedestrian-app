"""
Step 0.2 - Turn the line soup into a connected graph (nodes + edges).

Key ideas taught here:
  - a graph = intersections (nodes) + street segments (edges)
  - OSM lines must be "noded" (split at every crossing) before they form a
    real graph, otherwise crossings are invisible to the computer
  - connected components tell us whether the network is one piece or islands
"""

import sys
from pathlib import Path

import geopandas as gpd
import momepy
import networkx as nx
from shapely.ops import linemerge, unary_union

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "out"
OUT_DIR.mkdir(exist_ok=True)

# Input network: pass a GeoJSON path as argument, else default to the Seoul
# walking network we just exported.
DEFAULT_INPUT = OUT_DIR / "walk_links.geojson"
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT

# --- Load in METERS (space syntax needs real distances) ----------------------
print(f"Input: {INPUT.name}")
gdf = gpd.read_file(INPUT).to_crs(epsg=5179)
print(f"Loaded {len(gdf)} raw lines, {gdf.geometry.length.sum() / 1000:.2f} km total")

# --- Node the network --------------------------------------------------------
# unary_union merges all lines into one geometry AND inserts a point wherever
# two lines cross -> every real intersection now exists as a shared vertex.
# linemerge then re-glues runs of segments that only pass through degree-2
# points, so each resulting piece is a clean segment between two junctions.
noded = linemerge(unary_union(gdf.geometry.values))
parts = [noded] if noded.geom_type == "LineString" else list(noded.geoms)
edges = gpd.GeoDataFrame(geometry=parts, crs=gdf.crs)
print(f"After noding: {len(edges)} clean segments, "
      f"{edges.geometry.length.sum() / 1000:.2f} km total (should match above)")

# --- Build the graph ---------------------------------------------------------
# approach="primal": nodes = junctions, edges = street segments (the classic
# space-syntax "primal" graph).
G = momepy.gdf_to_nx(edges, approach="primal")
print()
print("=== Graph health ===")
print(f"Nodes (junctions)     : {G.number_of_nodes()}")
print(f"Edges (segments)      : {G.number_of_edges()}")

# --- Connectivity ------------------------------------------------------------
# A well-formed walkable network should be (mostly) ONE connected piece.
# Many small components = data gaps / missing links.
components = sorted(nx.connected_components(G), key=len, reverse=True)
biggest = components[0]
print(f"Connected components  : {len(components)}")
print(f"Largest component     : {len(biggest)} nodes "
      f"({100 * len(biggest) / G.number_of_nodes():.1f}% of the network)")

# --- Save for later steps ----------------------------------------------------
edges.to_file(OUT_DIR / "edges_noded.geojson", driver="GeoJSON")
print(f"\nSaved noded edges -> {OUT_DIR / 'edges_noded.geojson'}")

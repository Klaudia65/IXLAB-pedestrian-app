"""
Diagnostic: build the graph the *simple* way (one edge per link, nodes = its two
endpoints snapped to 1cm) and count components. This bypasses unary_union +
linemerge, to see whether THEY are what fragments the network.
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx

HERE = Path(__file__).resolve().parent
INPUT = HERE / "out" / "walk_links.geojson"

gdf = gpd.read_file(INPUT).to_crs(epsg=5179)


def snap(xy, grid=0.01):
    """Round a coordinate to `grid` meters so near-identical endpoints match."""
    return (round(xy[0] / grid) * grid, round(xy[1] / grid) * grid)


G = nx.Graph()
for geom in gdf.geometry:
    coords = list(geom.coords)
    a, b = snap(coords[0]), snap(coords[-1])
    G.add_edge(a, b)

comps = sorted(nx.connected_components(G), key=len, reverse=True)
print("=== Simple endpoint graph (snap 1cm) ===")
print(f"Nodes: {G.number_of_nodes()}  Edges: {G.number_of_edges()}")
print(f"Components: {len(comps)}")
print(f"Largest: {len(comps[0])} nodes "
      f"({100*len(comps[0])/G.number_of_nodes():.1f}%)")

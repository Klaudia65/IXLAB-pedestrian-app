"""
Compare noding strategies by the only metric that matters here: how connected
is the resulting graph (component count + largest-component share).
"""

from pathlib import Path

import geopandas as gpd
import networkx as nx
from shapely.ops import linemerge, unary_union

HERE = Path(__file__).resolve().parent
INPUT = HERE / "out" / "walk_links.geojson"

gdf = gpd.read_file(INPUT).to_crs(epsg=5179).reset_index(drop=True)


def report(name, lines):
    """Build an endpoint graph from a list of linestrings, print connectivity."""
    G = nx.Graph()
    for geom in lines:
        c = list(geom.coords)
        G.add_edge(c[0], c[-1])
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    share = 100 * len(comps[0]) / G.number_of_nodes()
    print(f"{name:<32} pieces={len(lines):5d}  components={len(comps):4d}  "
          f"largest={share:4.1f}%")


# 1. Raw links, endpoint graph (baseline).
report("raw links", list(gdf.geometry))

# 2. unary_union only (GEOS nodes at every crossing / T-junction), then split
#    the resulting MultiLineString into its individual noded pieces.
u = unary_union(gdf.geometry.values)
union_parts = list(u.geoms) if u.geom_type != "LineString" else [u]
report("unary_union parts", union_parts)

# 3. unary_union THEN linemerge (what step0_2 does).
m = linemerge(u)
merge_parts = list(m.geoms) if m.geom_type != "LineString" else [m]
report("unary_union + linemerge", merge_parts)

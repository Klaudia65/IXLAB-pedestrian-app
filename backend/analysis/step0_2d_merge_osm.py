"""
Step 0.2d - Does adding the OSM walking network reconnect the Seoul fragments?

We compare connectivity of:
  - Seoul only
  - OSM only
  - Seoul + OSM merged (noded)
  - Seoul + OSM merged (noded + close_gaps)

OSM is a true topological graph (ways share node ids), so its footways may
bridge the gaps that fragment the Seoul-only network.
"""

from pathlib import Path

import geopandas as gpd
import momepy
import networkx as nx
import osmnx as ox
from shapely.geometry import box
from shapely.ops import linemerge, unary_union

HERE = Path(__file__).resolve().parent
BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # left, bottom, right, top


def connectivity(lines):
    """Node a list of linestrings, build endpoint graph, return (comps, largest%)."""
    noded = linemerge(unary_union(list(lines)))
    parts = list(noded.geoms) if noded.geom_type != "LineString" else [noded]
    G = nx.Graph()
    for geom in parts:
        c = list(geom.coords)
        G.add_edge(c[0], c[-1])
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    return len(parts), len(comps), 100 * len(comps[0]) / G.number_of_nodes()


# --- Seoul (clipped study area, meters) --------------------------------------
seoul = gpd.read_file(HERE / "out" / "jongno_links.geojson")
seoul = seoul[seoul.intersects(box(*BBOX))].to_crs(epsg=5179).reset_index(drop=True)
seoul_lines = list(seoul.geometry)

# --- OSM full walking network for the same bbox ------------------------------
print("Fetching OSM walk network ...")
G_osm = ox.graph_from_bbox(bbox=BBOX, network_type="walk")
osm_edges = ox.graph_to_gdfs(G_osm, nodes=False).to_crs(epsg=5179)
osm_lines = list(osm_edges.geometry)
print(f"OSM walk edges: {len(osm_lines)}, {osm_edges.geometry.length.sum()/1000:.1f} km")
print(f"Seoul links   : {len(seoul_lines)}, {seoul.geometry.length.sum()/1000:.1f} km")

# --- Compare -----------------------------------------------------------------
print("\n{:<28} {:>7} {:>7} {:>9}".format("scenario", "pieces", "comps", "largest%"))
for name, lines in [("Seoul only", seoul_lines), ("OSM only", osm_lines),
                    ("Seoul + OSM", seoul_lines + osm_lines)]:
    p, c, l = connectivity(lines)
    print(f"{name:<28} {p:>7} {c:>7} {l:>8.1f}%")

# Merged + close_gaps
merged = gpd.GeoDataFrame(geometry=seoul_lines + osm_lines, crs=seoul.crs)
closed = momepy.close_gaps(merged, 12)
p, c, l = connectivity(closed.values)
print(f"{'Seoul + OSM + close_gaps 12m':<28} {p:>7} {c:>7} {l:>8.1f}%")

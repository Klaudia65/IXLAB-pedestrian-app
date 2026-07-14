"""
Step 0.2c - Build the clean, routable pedestrian network for the study area.

Pipeline (the publishable method):
  1. clip the Seoul network to the pilot neighborhood
  2. close_gaps: snap dangling endpoints to nearby lines (repair ~10-20m gaps)
  3. node: split/merge so junctions become shared vertices
  4. keep the largest connected component (the routable core)

Output: out/clean_network.geojson  -> the network every later step builds on.
"""

from pathlib import Path

import geopandas as gpd
import momepy
import networkx as nx
from shapely.geometry import box
from shapely.ops import linemerge, unary_union

HERE = Path(__file__).resolve().parent
LINKS = HERE / "out" / "jongno_links.geojson"
OUT = HERE / "out" / "clean_network.geojson"

BBOX = box(126.97869, 37.56623, 127.01052, 37.58646)
GAP_TOLERANCE_M = 12  # conservative: < spacing between Jongno blocks (~20m+)

# --- 1. Clip to the neighborhood (in meters) ---------------------------------
gdf = gpd.read_file(LINKS)
area = gdf[gdf.intersects(BBOX)].to_crs(epsg=5179).reset_index(drop=True)
print(f"Study area: {len(area)} links, {area.geometry.length.sum()/1000:.1f} km")

# --- 2. Close gaps: reconnect dangling ends to nearby lines ------------------
closed = momepy.close_gaps(area, GAP_TOLERANCE_M)

# --- 3. Node: make every crossing/touch a shared vertex ----------------------
noded = linemerge(unary_union(closed.values))
segments = list(noded.geoms) if noded.geom_type != "LineString" else [noded]
edges = gpd.GeoDataFrame(geometry=segments, crs=area.crs)

# --- 4. Largest connected component ------------------------------------------
G = nx.Graph()
for i, geom in enumerate(edges.geometry):
    c = list(geom.coords)
    G.add_edge(c[0], c[-1], idx=i)

comps = sorted(nx.connected_components(G), key=len, reverse=True)
biggest = comps[0]
share = 100 * len(biggest) / G.number_of_nodes()
print(f"After clean: {len(comps)} components, largest {len(biggest)} nodes ({share:.1f}%)")

keep_idx = {d["idx"] for u, v, d in G.edges(data=True)
            if u in biggest and v in biggest}
clean = edges.iloc[sorted(keep_idx)].copy()
km = clean.geometry.length.sum() / 1000
print(f"Routable core: {len(clean)} segments, {km:.2f} km (single connected network)")

# Save in WGS84 so the web app / next steps can consume it directly.
clean.to_crs(epsg=4326).to_file(OUT, driver="GeoJSON")
print(f"Saved -> {OUT}")

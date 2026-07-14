"""How is the fragmentation distributed? Top components + cumulative coverage."""

from pathlib import Path

import geopandas as gpd
import networkx as nx

HERE = Path(__file__).resolve().parent
gdf = gpd.read_file(HERE / "out" / "walk_links.geojson").to_crs(epsg=5179)

G = nx.Graph()
for geom in gdf.geometry:
    c = list(geom.coords)
    G.add_edge((round(c[0][0], 2), round(c[0][1], 2)),
               (round(c[-1][0], 2), round(c[-1][1], 2)))

comps = sorted((len(c) for c in nx.connected_components(G)), reverse=True)
total = sum(comps)
print(f"{len(comps)} components, {total} nodes total\n")
print("rank  size   cumulative%")
cum = 0
for i, s in enumerate(comps[:20]):
    cum += s
    print(f"{i+1:>3}  {s:>5}   {100*cum/total:5.1f}%")
print(f"\nComponents of size <=2: {sum(1 for s in comps if s <= 2)}")
print(f"Components of size 1 (isolated links): {sum(1 for s in comps if s == 1)}")

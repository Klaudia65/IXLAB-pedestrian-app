"""Visual check: routable core (blue) vs dropped fragments (red)."""

from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.geometry import box

HERE = Path(__file__).resolve().parent
BBOX = box(126.97869, 37.56623, 127.01052, 37.58646)

full = gpd.read_file(HERE / "out" / "jongno_links.geojson")
area = full[full.intersects(BBOX)].to_crs(epsg=5179)
clean = gpd.read_file(HERE / "out" / "clean_network.geojson").to_crs(epsg=5179)

fig, ax = plt.subplots(figsize=(11, 9))
area.plot(ax=ax, color="#e74c3c", linewidth=0.6, label="dropped fragments")
clean.plot(ax=ax, color="#2980b9", linewidth=0.9, label="routable core (106 km)")
ax.set_title("Study area pedestrian network — connected core vs fragments")
ax.legend()
ax.set_axis_off()
out = HERE / "out" / "network_check.png"
fig.savefig(out, dpi=130, bbox_inches="tight")
print(f"Saved -> {out}")

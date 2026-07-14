"""Visual check of the final OSM base network, colored by highway type."""

from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
net = gpd.read_file(HERE / "out" / "clean_network.geojson").to_crs(epsg=5179)

# Bucket highway types into a few readable classes.
def bucket(h):
    h = str(h)
    if "steps" in h:
        return "steps"
    if h in ("footway", "path", "pedestrian"):
        return "pedestrian-only"
    return "street (walkable)"

net["cls"] = net["highway"].apply(bucket)
colors = {"pedestrian-only": "#2980b9", "street (walkable)": "#95a5a6", "steps": "#e67e22"}

fig, ax = plt.subplots(figsize=(11, 9))
for cls, color in colors.items():
    sub = net[net["cls"] == cls]
    sub.plot(ax=ax, color=color, linewidth=0.8 if cls != "street (walkable)" else 0.6,
             label=f"{cls} ({len(sub)})")
ax.set_title("OSM base walking network - 411 km, single connected component")
ax.legend()
ax.set_axis_off()
out = HERE / "out" / "osm_base_check.png"
fig.savefig(out, dpi=130, bbox_inches="tight")
print(f"Saved -> {out}")

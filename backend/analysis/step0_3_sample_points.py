"""
Step 0.3 - Sample points along the network edges (Etape 0 of Contribution 1).

Two artefacts, kept separate on purpose:
  - the PATHS (network_undirected.geojson): the reference geometry
  - the POINTS (sample_points.geojson): what later steps (imagery/CLIP) consume

WHY deduplicate edges first:
clean_network.geojson comes from a DIRECTED graph, so every street is stored
twice (once per travel direction) with identical geometry. That inflates the
network (415 km -> the real undirected length is ~222 km) AND duplicates every
sample point (each point lands on top of its reverse-direction twin). We collapse
edges whose coordinate sequence is identical up to reversal, so one street = one
line = one row of points.

Given the (undirected) network, lay a point roughly every SPACING_M metres along
every edge. Each point carries the local STREET-AXIS bearing, so a later step can
request a street-view image with the camera turned along (or +/-90 across) the
street.

WHY project to EPSG:5179 first:
edges come in degrees (EPSG:4326); "one point every 30 m" only makes sense in a
metric CRS. 5179 (Korea 2000 / Unified) is the metric CRS already used across
this pipeline. We sample in metres, then convert points back to 4326 because
street-view APIs (Mapillary/Google/...) take lat/lon.

WHY sample at sub-segment CENTRES, not at fixed offsets from the start:
adjacent edges share their end nodes at every junction. Sampling at 0, s, 2s...
would drop a point on each shared node -> duplicates at every intersection.
Placing n points at the centres of n equal sub-segments keeps every point unique
and ~SPACING_M apart, with at least one point even on very short edges.

Bearing = geographic azimuth (0=N, 90=E, clockwise), computed from the lat/lon
of the point just BEFORE and just AFTER each sample, so it follows the true
street direction rather than the slightly rotated projected grid.

Output:
  out/network_undirected.geojson : the deduplicated PATHS (EPSG:4326)
  out/sample_points.geojson : Point layer (EPSG:4326) with
    point_id, edge_id, highway, name, dist_m, bearing_deg
  out/sample_points_check.png : quick visual sanity check (if matplotlib present)
"""

import math
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, MultiLineString, Point

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "out"
IN_FILE = OUT_DIR / "clean_network.geojson"

METRIC = 5179          # Korea 2000 / Unified CS (metres)
SPACING_M = 30.0       # target spacing between points (25-50 m range)
DELTA_M = 5.0          # look-ahead/behind distance used to measure the bearing


def geographic_bearing(lon1, lat1, lon2, lat2):
    """Forward azimuth from point 1 to point 2, degrees clockwise from north."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def iter_lines(geom):
    """Yield the LineString parts of a geometry (edges are lines, but be safe)."""
    if isinstance(geom, LineString):
        yield geom
    elif isinstance(geom, MultiLineString):
        yield from geom.geoms


def undirected_key(geom):
    """Orientation-independent hash of a line's full coordinate sequence.

    Uses ALL vertices (not just endpoints) so two genuinely different paths
    between the same nodes are kept; only identical-up-to-reversal lines merge.
    """
    coords = tuple((round(x, 6), round(y, 6)) for x, y, *_ in geom.coords)
    return coords if coords <= coords[::-1] else coords[::-1]


# --- Load the network --------------------------------------------------------
raw = gpd.read_file(IN_FILE)
print(f"Loaded {len(raw)} edges from {IN_FILE.name} (directed)")

# --- Collapse directed twins -> one line per street --------------------------
keys = raw.geometry.apply(undirected_key)
edges = raw.loc[~keys.duplicated()].reset_index(drop=True)
edges_m = edges.to_crs(METRIC)
km = edges_m.geometry.length.sum() / 1000
print(f"After dedup: {len(edges)} undirected edges, {km:.1f} km "
      f"(dropped {len(raw) - len(edges)} reverse twins)")
edges.to_file(OUT_DIR / "network_undirected.geojson", driver="GeoJSON")

# --- Walk each edge and drop points at sub-segment centres -------------------
mid_pts, before_pts, after_pts, meta = [], [], [], []
for edge_id, row in edges_m.iterrows():
    hw = row.get("highway")
    nm = row.get("name")
    for line in iter_lines(row.geometry):
        length = line.length
        if length == 0:
            continue
        n = max(1, round(length / SPACING_M))
        for i in range(n):
            d = (i + 0.5) * length / n
            mid_pts.append(line.interpolate(d))
            before_pts.append(line.interpolate(max(0.0, d - DELTA_M)))
            after_pts.append(line.interpolate(min(length, d + DELTA_M)))
            meta.append({"edge_id": int(edge_id), "highway": hw,
                         "name": nm, "dist_m": round(d, 1)})

# --- Back to lat/lon, then compute bearings from the before/after neighbours --
mid_ll = gpd.GeoSeries(mid_pts, crs=METRIC).to_crs(4326)
before_ll = gpd.GeoSeries(before_pts, crs=METRIC).to_crs(4326)
after_ll = gpd.GeoSeries(after_pts, crs=METRIC).to_crs(4326)

records = []
for pid, (m, b, a, info) in enumerate(zip(mid_ll, before_ll, after_ll, meta)):
    bearing = geographic_bearing(b.x, b.y, a.x, a.y)
    records.append({"point_id": pid, **info,
                    "bearing_deg": round(bearing, 1),
                    "geometry": Point(m.x, m.y)})

pts = gpd.GeoDataFrame(records, geometry="geometry", crs=4326)

# --- Report ------------------------------------------------------------------
total_km = edges_m.geometry.length.sum() / 1000
print(f"Generated {len(pts)} sample points over {total_km:.1f} km "
      f"(~{1000 * total_km / len(pts):.0f} m/point, target {SPACING_M:.0f} m)")

# Residual redundancy: how many points still sit near another (parallel
# sidewalks / dual carriageways describe one street with 2-3 offset lines).
try:
    import numpy as np
    from scipy.spatial import cKDTree
    pm = pts.to_crs(METRIC)
    xy = np.column_stack([pm.geometry.x, pm.geometry.y])
    nn = cKDTree(xy).query(xy, k=2)[0][:, 1]
    print("Residual redundancy (nearest neighbour after dedup):")
    for thr in (3, 5, 10):
        print(f"  < {thr:>2} m : {100 * np.mean(nn < thr):4.1f}%")
    print(f"  median NN dist: {np.median(nn):.1f} m")
except ImportError:
    pass

out_geojson = OUT_DIR / "sample_points.geojson"
pts.to_file(out_geojson, driver="GeoJSON")
print(f"Saved -> {out_geojson}")

# --- Optional quick-look PNG (same idea as plot_network.py) ------------------
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(9, 9), dpi=120)
    edges.plot(ax=ax, color="#b8b0a2", linewidth=0.5, zorder=1)
    pts.plot(ax=ax, color="#e0603a", markersize=1.5, zorder=2)
    ax.set_title(f"Sample points every ~{SPACING_M:.0f} m  ({len(pts)} points)")
    ax.set_axis_off()
    fig.tight_layout()
    png = OUT_DIR / "sample_points_check.png"
    fig.savefig(png)
    print(f"Saved -> {png}")
except ImportError:
    print("matplotlib not installed - skipped the PNG check.")

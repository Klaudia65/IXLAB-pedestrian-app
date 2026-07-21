"""
Step 0.4 - Measure street-view image COVERAGE of the sample points.

Question: if we attach the nearest street-view image to each of the ~8,764
sample points, what fraction actually has an image nearby? We compare two OPEN
sources and their union:

  - Mapillary (queried live via the Graph API; needs MAPILLARY_TOKEN in ../.env)
  - "Springer" = the Kim et al. 2026 Seoul database (Naver-sourced, CC BY-NC-ND).
    We only have its cluster centroids in/near the bbox (35 points), so its
    coverage here is an OPTIMISTIC proxy (real photo spots are a bit offset).

For each source we build a KD-tree of image locations (in metres, EPSG:5179)
and, for every sample point, take the distance to the nearest image. A point is
"covered at radius r" if that distance < r. The UNION uses the min of the two
distances.

Output: a table of coverage % at 25 / 50 / 100 m, printed to stdout.
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import geopandas as gpd
import numpy as np
import requests
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / "out"
METRIC = 5179
BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # W, S, E, N
RADII = (25, 50, 100)

# Kim et al. 2026 cluster centroids within a ~600 m pad of the bbox (from
# Raw_image/Cluster_info.csv on https://streetmap.datakorea.io). 35 points.
KIM_CLUSTERS = [
    [126.982246, 37.579175], [126.989321, 37.566603], [126.991728, 37.571137],
    [126.978935, 37.560424], [126.995919, 37.562426], [127.000844, 37.565647],
    [127.008065, 37.567475], [126.999956, 37.583092], [127.006898, 37.568601],
    [126.998369, 37.571429], [127.015982, 37.574047], [127.011778, 37.572661],
    [126.980966, 37.560909], [126.985571, 37.569439], [127.008079, 37.588776],
    [126.985581, 37.577124], [126.985015, 37.562828], [127.011381, 37.568503],
    [127.011899, 37.56866], [126.999598, 37.57007], [126.995425, 37.563843],
    [127.013758, 37.569352], [126.987627, 37.572212], [127.007311, 37.570694],
    [127.010818, 37.569164], [127.008029, 37.56942], [127.01322, 37.568833],
    [127.015695, 37.59166], [126.97694, 37.563133], [127.012758, 37.568857],
    [126.980985, 37.565334], [126.995217, 37.569276], [126.995437, 37.567134],
    [126.979903, 37.570839], [126.974749, 37.571046],
]


def load_token():
    for line in (HERE.parent / ".env").read_text().splitlines():
        if line.startswith("MAPILLARY_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("MAPILLARY_TOKEN not found in ../.env")


def fetch_cell(cell, token):
    """Return Mapillary image [lon,lat] points inside one small bbox cell."""
    w, s, e, n = cell
    url = "https://graph.mapillary.com/images"
    params = {"fields": "id,geometry", "bbox": f"{w},{s},{e},{n}", "limit": 2000}
    headers = {"Authorization": f"OAuth {token}"}
    r = requests.get(url, params=params, headers=headers, timeout=60)
    r.raise_for_status()
    data = r.json().get("data", [])
    pts = [d["geometry"]["coordinates"] for d in data if d.get("geometry")]
    return pts, len(data)


def fetch_mapillary(token, step=0.002):
    """Tile the bbox into small cells and gather all image locations."""
    w, s, e, n = BBOX
    lons = np.arange(w, e, step)
    lats = np.arange(s, n, step)
    cells = [(x, y, min(x + step, e), min(y + step, n)) for x in lons for y in lats]
    print(f"Querying Mapillary over {len(cells)} cells ...")
    pts, saturated = [], 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for cp, cnt in ex.map(lambda c: fetch_cell(c, token), cells):
            pts.extend(cp)
            if cnt >= 2000:
                saturated += 1
    if saturated:
        print(f"  WARNING: {saturated} cells hit the 2000-image limit "
              f"(coverage may be slightly undercounted).")
    return pts


def to_xy(lonlat):
    gs = gpd.GeoSeries(gpd.points_from_xy([p[0] for p in lonlat],
                                          [p[1] for p in lonlat]), crs=4326).to_crs(METRIC)
    return np.column_stack([gs.x, gs.y])


def nearest_dist(sample_xy, img_lonlat):
    if not img_lonlat:
        return np.full(len(sample_xy), np.inf)
    tree = cKDTree(to_xy(img_lonlat))
    return tree.query(sample_xy, k=1)[0]


# --- Load sample points ------------------------------------------------------
pts = gpd.read_file(OUT_DIR / "sample_points.geojson").to_crs(METRIC)
sample_xy = np.column_stack([pts.geometry.x, pts.geometry.y])
print(f"Sample points: {len(pts)}")

# --- Gather image locations --------------------------------------------------
token = load_token()
mly = fetch_mapillary(token)
print(f"Mapillary images in bbox: {len(mly)}")
print(f"Springer/Kim clusters (padded): {len(KIM_CLUSTERS)}")

d_mly = nearest_dist(sample_xy, mly)
d_kim = nearest_dist(sample_xy, KIM_CLUSTERS)
d_union = np.minimum(d_mly, d_kim)

# --- Coverage table ----------------------------------------------------------
print("\nCoverage = share of sample points with an image within r metres\n")
print(f"{'radius':>7} | {'Mapillary':>10} | {'Springer':>9} | {'UNION':>7}")
print("-" * 42)
for r in RADII:
    print(f"{r:>5} m | {100*np.mean(d_mly<r):>9.1f}% | "
          f"{100*np.mean(d_kim<r):>8.1f}% | {100*np.mean(d_union<r):>6.1f}%")

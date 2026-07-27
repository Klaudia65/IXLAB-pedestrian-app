"""
Derive "recommended nature walks" for a zone from the pedestrian path network
and the green areas.

Idea (why paths, not polygons): a pedestrian walks a ROUTE, not a park fill.
So for each *named* green area (park / garden / riverside plaza), we collect
the walkable path segments that thread it, merge them into one route, and emit
one feature = one recommendable walk ("Walk through 경복궁", "Along 청계천").

Inputs  (web/frontend/):
    network-osm-jongno.geojson         — full OSM line network (highway-tagged)
    green-jongno.geojson               — green areas (MultiPolygon, some named)
    scores-quiet-lively-14h-jongno.geojson — per-segment 생활인구 (optional; for
                                             the quietness attribute below)
Output  (web/frontend/):
    nature-paths-jongno.geojson — one MultiLineString per green area, with
                                  name, green_type, path_m, segments, and a
                                  quietness attribute (quiet_value / quiet_label)
                                  so the app can rank the CALMEST walks first.

Run:  backend/.venv/Scripts/python.exe backend/offline/nature_paths.py
"""
import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import linemerge, unary_union

FRONTEND = Path(__file__).resolve().parents[2] / "web" / "frontend"
NET = FRONTEND / "network-osm-jongno.geojson"
GREEN = FRONTEND / "green-jongno.geojson"
QUIET = FRONTEND / "scores-quiet-lively-14h-jongno.geojson"
OUT = FRONTEND / "nature-paths-jongno.geojson"

# Line types a pedestrian actually strolls (car roads excluded on purpose).
PED_TYPES = {
    "footway", "path", "pedestrian", "steps", "living_street",
    "track", "cycleway", "footway, steps",
}
BUFFER_DEG = 0.00015      # ~15 m — tolerate paths running just along an edge
METRIC_CRS = 5179         # Korea 2000 / Central Belt — metres, for real lengths
MIN_PATH_M = 120          # drop green areas with too little walkable path
MIN_SEGMENTS = 2
QUIET_BUFFER_M = 30       # catch the 생활인구-scored segments around a walk

# nicer English labels + a display order (a walk beats a lawn)
TYPE_LABEL = {"park": "Park walk", "garden": "Garden walk", "forest": "Forest trail",
              "wood": "Woodland path", "grassland": "Meadow path", "grass": "Green lane",
              "scrub": "Green path", "greenfield": "Open-green path"}
TYPE_RANK = {"park": 0, "garden": 1, "forest": 2, "wood": 3, "grassland": 4,
             "grass": 5, "scrub": 6, "greenfield": 7}


# Attach a quietness attribute to each walk from the 생활인구 segment scores:
# quiet_value = median 생활인구 of the observed segments within QUIET_BUFFER_M of
# the walk (lower = calmer), and quiet_label = calm / moderate / busy by tercile
# across the walks. Skips gracefully (value None, label "—") if the quiet file is
# absent, so the walk geometry never depends on the score file existing.
def attach_quiet(feats, walk_geoms):
    def blank():
        for f in feats:
            f["properties"]["quiet_value"] = None
            f["properties"]["quiet_label"] = "—"
    if not QUIET.exists() or not walk_geoms:
        blank()
        return
    seg = gpd.read_file(QUIET)
    seg = seg[seg["is_observed"] == True].to_crs(METRIC_CRS)[["agg_value", "geometry"]]  # noqa: E712
    walks = gpd.GeoDataFrame(
        {"wid": range(len(walk_geoms))},
        geometry=gpd.GeoSeries(walk_geoms, crs=4326).to_crs(METRIC_CRS).buffer(QUIET_BUFFER_M),
        crs=METRIC_CRS,
    )
    joined = gpd.sjoin(seg, walks, predicate="intersects", how="inner")
    med = joined.groupby("wid")["agg_value"].median()
    vals = [med.get(i) for i in range(len(walk_geoms))]

    ranked = sorted(v for v in vals if v is not None)
    def label(v):
        if v is None or not ranked:
            return "—"
        pct = ranked.index(v) / len(ranked)   # 0 = quietest
        return "calm" if pct < 1 / 3 else ("moderate" if pct < 2 / 3 else "busy")

    for f, v in zip(feats, vals):
        f["properties"]["quiet_value"] = None if v is None else round(float(v), 1)
        f["properties"]["quiet_label"] = label(v)


def main():
    net = json.loads(NET.read_text(encoding="utf-8"))["features"]
    green = json.loads(GREEN.read_text(encoding="utf-8"))["features"]

    # keep only pedestrian-walkable segments
    paths = [f for f in net if f["properties"].get("highway") in PED_TYPES]
    path_geoms = [shape(f["geometry"]) for f in paths]

    # named green areas, each buffered a touch so edge-hugging paths count
    named = [(shape(f["geometry"]).buffer(BUFFER_DEG),
              f["properties"].get("name"),
              f["properties"].get("green_type"))
             for f in green if f["properties"].get("name")]

    # assign each path to the ONE named area it overlaps most (avoids a lane
    # being double-counted between two adjacent parks)
    buckets = {}  # name -> {"type", "geoms": [LineString...]}
    for ls in path_geoms:
        best_name = best_type = None
        best_overlap = 0.0
        for gpoly, name, gtype in named:
            if not ls.intersects(gpoly):
                continue
            ov = ls.intersection(gpoly).length
            if ov > best_overlap:
                best_overlap, best_name, best_type = ov, name, gtype
        if best_name:
            b = buckets.setdefault(best_name, {"type": best_type, "geoms": []})
            b["geoms"].append(ls)

    # merge each bucket into one route + measure its real length in metres
    feats = []
    walk_geoms = []   # kept merged geometries, aligned with feats (for attach_quiet)
    for name, b in buckets.items():
        merged = unary_union(b["geoms"])
        if merged.geom_type == "MultiLineString":
            merged = linemerge(merged)   # stitch touching segments into runs
        length_m = (gpd.GeoSeries([merged], crs=4326)
                    .to_crs(METRIC_CRS).length.iloc[0])
        if length_m < MIN_PATH_M or len(b["geoms"]) < MIN_SEGMENTS:
            continue
        walk_geoms.append(merged)
        feats.append({
            "type": "Feature",
            "geometry": mapping(merged),
            "properties": {
                "name": name,
                "green_type": b["type"],
                "type_label": TYPE_LABEL.get(b["type"], "Green walk"),
                "path_m": round(length_m),
                "segments": len(b["geoms"]),
            },
        })

    # attach quietness (median 생활인구 along each walk) before sorting/writing
    attach_quiet(feats, walk_geoms)

    # order: nicest walk types first, then longest walk. (The app re-sorts by
    # quiet_value for the "Quiet nature" preset; this stays the default order.)
    feats.sort(key=lambda f: (TYPE_RANK.get(f["properties"]["green_type"], 9),
                              -f["properties"]["path_m"]))

    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                              ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(feats)} nature walks -> {OUT.name}")
    for f in feats:
        p = f["properties"]
        qv = "   n/a" if p["quiet_value"] is None else f"{p['quiet_value']:7.0f}"
        print(f"  {p['path_m']:5d} m  {p['segments']:3d} seg  [{p['green_type']:9s}]  "
              f"생활인구~{qv} ({p['quiet_label']:8s})  {p['name']}")


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

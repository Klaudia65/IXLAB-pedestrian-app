"""
Build the clean pedestrian network for ONE zone, from OSM + Seoul city data,
store it in PostGIS, and render a clean MapLibre page for it.

This is the parameterized, reusable version of the research pipeline in
backend/analysis/ (which hardcodes the pilot bbox). Given a zone (a bbox + a
Seoul district name), it reproduces the *exact* "clean" recipe used by
web/frontend/map-with-paths-only-osm-and-seoulcity.html:

  OSM  = the analysis backbone GRAPH (osmnx graph_from_bbox + simplify).
         -> deduped & topological, so NO double paths (unlike raw Overpass ways);
         -> a PERMISSIVE highway filter (no area/foot/access exclusions), so
            footpaths inside enclosed parks & shrines survive;
         -> walkable streets are kept too, so the graph stays connected;
         -> edges are bucketed pedestrian / street / steps for colored labels.
  Seoul = a separate FLAG layer (crosswalk / park / bridge / tunnel), clipped to
         the zone. Its geometry is NEVER merged into OSM (that merge is what would
         create visual double-paths); on the map it sits UNDER OSM, hidden by
         default, contributing attributes only.

Phases:  fetch+build  ->  store in DB (osm_network + walk_links)  ->  export two
GeoJSON snapshots into web/frontend/  ->  render web/frontend/zone-<slug>.html.

Run (from the backend/ folder, with the analysis venv active):
  python -m zones.build_zone --slug bukchon --district 종로구 \
      --bbox 126.97869 37.56623 127.01052 37.58646 \
      --title "Bukchon–Anguk–Insadong" --kicker "zone d'étude · Jongno-gu"

  # skip the database (quick preview: export straight from memory)
  python -m zones.build_zone --slug bukchon --district 종로구 \
      --bbox 126.97869 37.56623 127.01052 37.58646 --skip-db
"""

import argparse
import json
import math
import pathlib
import sys

import geopandas as gpd
import networkx as nx
import osmnx as ox
from shapely import wkt as shp_wkt
from shapely.geometry import box, mapping

# Make backend/ importable so we can reuse the offline helpers & the Seoul fetch.
BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
from offline.db import upsert_osm_network, upsert_walk_links, get_seoul_key  # noqa: E402
from offline.scrapers.seoul_paths_collector import fetch_page, normalize  # noqa: E402

FRONTEND = BACKEND.parent / "web" / "frontend"
TEMPLATE = pathlib.Path(__file__).resolve().parent / "template.html"

# Pedestrian-inclusive OSM filter WITHOUT osmnx's area/foot/access exclusions,
# so park & shrine paths survive. Keeps walkable streets for connectivity.
# (Identical to backend/analysis/step0_2e_osm_base.py — the proven recipe.)
WALK_FILTER = (
    '["highway"~"footway|path|pedestrian|steps|living_street|residential|'
    'service|unclassified|track|road|primary|secondary|tertiary|cycleway"]'
)

# Korea metric CRS (used only to measure lengths in meters).
METRIC_CRS = 5179


def _stringify(v):
    """osmnx sometimes stores osmid / highway / name as a list on merged edges;
    GeoJSON and our varchar columns can't hold lists, so join them.

    Unnamed ways surface as float NaN (pandas' missing-value marker), which
    json.dumps writes as a bare `NaN` token -- invalid JSON that browsers'
    JSON.parse rejects (and which Postgres stores as the literal string 'NaN'
    in a varchar column). Normalize it to None so it becomes JSON null / SQL
    NULL instead.
    """
    if isinstance(v, list):
        return ", ".join(map(str, v))
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def osm_kind(highway: str) -> str:
    """Bucket an OSM highway tag (maybe comma-joined) into 3 display classes."""
    h = str(highway or "")
    if "steps" in h:
        return "steps"
    if "footway" in h or "path" in h or "pedestrian" in h:
        return "pedestrian"
    return "street"


# ---------------------------------------------------------------------------
# 1. OSM — build the clean backbone graph and shape its edges.
# ---------------------------------------------------------------------------
def build_osm(bbox, slug):
    """Return (rows, feature_collection, stats) for the OSM clean network.

    rows                -> list of dicts ready for upsert_osm_network()
    feature_collection  -> a GeoJSON dict for the static export
    stats               -> dict with per-kind km + connectivity, for the legend
    """
    w, s, e, n = bbox
    print(f"[OSM] graph_from_bbox {bbox} with permissive walk filter ...")
    g = ox.graph_from_bbox(bbox=bbox, custom_filter=WALK_FILTER,
                           retain_all=True, simplify=True)

    comps = sorted(nx.connected_components(g.to_undirected()), key=len, reverse=True)
    largest_pct = 100 * len(comps[0]) / g.number_of_nodes() if g.number_of_nodes() else 0
    print(f"[OSM] {g.number_of_nodes()} nodes, {g.number_of_edges()} edges, "
          f"{len(comps)} components (largest {largest_pct:.1f}%)")

    edges = ox.graph_to_gdfs(g, nodes=False).reset_index()  # brings u, v, key

    rows, features = [], []
    for _, edge in edges.iterrows():
        geom = edge.geometry
        highway = _stringify(edge.get("highway"))
        osmid = _stringify(edge.get("osmid"))
        name = _stringify(edge.get("name"))
        length_m = float(edge.get("length") or 0)
        edge_id = f"{edge['u']}-{edge['v']}-{edge['key']}"  # globally stable

        rows.append({
            "edge_id": edge_id,
            "osmid": osmid,
            "highway": highway,
            "name": name,
            "length_m": length_m,
            "zone_slug": slug,
            "geojson": json.dumps(mapping(geom)),
            "source": "osm",
        })
        features.append({
            "type": "Feature",
            "properties": {"osmid": osmid, "highway": highway,
                           "name": name, "length": length_m},
            "geometry": mapping(geom),
        })

    # Per-kind km for the legend (measured in a metric CRS).
    edges = edges.copy()
    edges["kind"] = edges["highway"].apply(osm_kind)
    edges["km"] = edges.to_crs(epsg=METRIC_CRS).geometry.length / 1000
    by_kind = edges.groupby("kind")["km"].sum().to_dict()
    stats = {
        "km_pedestrian": round(by_kind.get("pedestrian", 0), 1),
        "km_street": round(by_kind.get("street", 0), 1),
        "km_steps": round(by_kind.get("steps", 0), 1),
        "km_total": round(edges["km"].sum(), 1),
        "largest_pct": round(largest_pct, 1),
        "n_edges": len(features),
    }
    fc = {"type": "FeatureCollection", "features": features}
    return rows, fc, stats


# ---------------------------------------------------------------------------
# 2. SEOUL — fetch the district's links, clip to the zone, keep the flags.
# ---------------------------------------------------------------------------
def build_seoul(bbox, district):
    """Return (rows, feature_collection, stats) for the Seoul flag layer.

    rows                -> dicts ready for upsert_walk_links() (also carry wkt)
    feature_collection  -> GeoJSON dict for the static export
    stats               -> flag counts for the legend
    """
    w, s, e, n = bbox
    zone = box(w, s, e, n)
    key = get_seoul_key()

    total = fetch_page(key, 1, 1, district).get("list_total_count", 0)
    print(f"[Seoul] {district}: {total} rows in TbTraficWlkNet — paging ...")

    raw = []
    start = 1
    while start <= total:
        end = min(start + 999, total)
        body = fetch_page(key, start, end, district)
        page = body.get("row", [])
        raw.extend(normalize(page))  # keeps flags + link_type_cd + wkt
        print(f"  rows {start}-{end}: {len(raw)} links kept so far")
        if len(page) < (end - start + 1):
            break
        start = end + 1

    # Clip to the zone: keep only links whose geometry touches the bbox.
    rows, features = [], []
    for r in raw:
        line = shp_wkt.loads(r["wkt"])
        if not line.intersects(zone):
            continue
        rows.append(r)
        features.append({
            "type": "Feature",
            "properties": {
                "link_id": r["link_id"],
                "emd_nm": r["emd_nm"],
                "is_crosswalk": r["is_crosswalk"],
                "is_overpass": r["is_overpass"],
                "is_bridge": r["is_bridge"],
                "is_tunnel": r["is_tunnel"],
                "in_park": r["in_park"],
                "subway_connected": r["subway_connected"],
                "near_building": r["near_building"],
            },
            "geometry": mapping(line),
        })
    print(f"[Seoul] {len(rows)} links inside the zone (clipped from {len(raw)})")

    stats = {
        "crosswalk": sum(1 for r in rows if r["is_crosswalk"]),
        "park": sum(1 for r in rows if r["in_park"]),
        "ordinary": sum(1 for r in rows if not (r["is_crosswalk"] or r["in_park"])),
        "n_links": len(rows),
    }
    fc = {"type": "FeatureCollection", "features": features}
    return rows, fc, stats


# ---------------------------------------------------------------------------
# 3. RENDER — fill the HTML template with this zone's numbers.
# ---------------------------------------------------------------------------
def render_html(slug, title, kicker, bbox, osm_file, seoul_file, osm_stats, seoul_stats):
    html = TEMPLATE.read_text(encoding="utf-8")
    intro = (
        f"Le réseau <b>OSM</b> est notre graphe d'analyse "
        f"({osm_stats['km_total']} km ; plus grand bloc ~{osm_stats['largest_pct']} %, "
        f"fragments conservés), coloré par type de voie. Le réseau "
        f"<b>Séoul-ville</b> est <b>masqué par défaut</b> : active-le pour voir ses "
        f"attributs (passages piétons, parcs). Il se superpose à OSM car les deux "
        f"décrivent les mêmes rues — c'est normal."
    )
    tokens = {
        "__TITLE__": title,
        "__KICKER__": kicker,
        "__INTRO__": intro,
        "__BBOX__": json.dumps(list(bbox)),
        "__OSM_FILE__": osm_file,
        "__SEOUL_FILE__": seoul_file,
        "__OSM_KM_PED__": str(osm_stats["km_pedestrian"]),
        "__OSM_KM_STREET__": str(osm_stats["km_street"]),
        "__OSM_KM_STEPS__": str(osm_stats["km_steps"]),
        "__SEOUL_CROSSWALK__": str(seoul_stats["crosswalk"]),
        "__SEOUL_PARK__": str(seoul_stats["park"]),
        "__SEOUL_ORDINARY__": str(seoul_stats["ordinary"]),
    }
    for token, value in tokens.items():
        html = html.replace(token, value)
    out = FRONTEND / f"zone-{slug}.html"
    out.write_text(html, encoding="utf-8")
    return out


# ---------------------------------------------------------------------------
# 4. ENTRY POINT
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Build a clean pedestrian zone (OSM + Seoul).")
    ap.add_argument("--slug", required=True, help="short id for filenames, e.g. 'bukchon'")
    ap.add_argument("--district", required=True, help="Seoul district NAME, e.g. 종로구")
    ap.add_argument("--bbox", nargs=4, type=float, required=True,
                    metavar=("W", "S", "E", "N"), help="WGS84 bbox: west south east north")
    ap.add_argument("--title", default=None, help="page title / h1 (defaults to slug)")
    ap.add_argument("--kicker", default="zone d'étude", help="small label above the title")
    ap.add_argument("--skip-db", action="store_true",
                    help="do not write to PostGIS (export straight from memory)")
    args = ap.parse_args()

    bbox = tuple(args.bbox)  # (W, S, E, N)
    title = args.title or args.slug
    osm_file = f"network-osm-{args.slug}.geojson"
    seoul_file = f"network-seoul-{args.slug}.geojson"

    # --- build ---
    osm_rows, osm_fc, osm_stats = build_osm(bbox, args.slug)
    seoul_rows, seoul_fc, seoul_stats = build_seoul(bbox, args.district)

    # --- store in the database (single source of truth) ---
    if args.skip_db:
        print("[DB] skipped (--skip-db)")
    else:
        n_osm = upsert_osm_network(osm_rows)
        n_seoul = upsert_walk_links(seoul_rows)
        print(f"[DB] upserted {n_osm} OSM edges -> osm_network, "
              f"{n_seoul} Seoul links -> walk_links")

    # --- export the two GeoJSON snapshots the page will fetch ---
    (FRONTEND / osm_file).write_text(json.dumps(osm_fc, ensure_ascii=False), encoding="utf-8")
    (FRONTEND / seoul_file).write_text(json.dumps(seoul_fc, ensure_ascii=False), encoding="utf-8")
    print(f"[export] {osm_file} ({osm_stats['n_edges']} feats), "
          f"{seoul_file} ({seoul_stats['n_links']} feats)")

    # --- render the page ---
    out = render_html(args.slug, title, args.kicker, bbox,
                      osm_file, seoul_file, osm_stats, seoul_stats)
    print(f"[html] wrote {out}")
    print("\nDone. Serve web/frontend/ over http:// and open "
          f"zone-{args.slug}.html")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

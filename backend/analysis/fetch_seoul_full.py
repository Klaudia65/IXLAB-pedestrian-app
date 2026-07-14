"""
Step 0.2b (part 1) - Re-collect the full Jongno walking network for research,
keeping BOTH geometry AND the official topology IDs (BGNG_LNKG_ID / END_LNKG_ID)
that the app collector dropped. Cached to a GeoJSON so later steps are offline.

This does not touch the app's walk_links table; it is the research pipeline's
own snapshot.
"""

import sys
from pathlib import Path

import geopandas as gpd
from shapely import wkt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from offline.db import get_seoul_key  # noqa: E402
from offline.scrapers.seoul_paths_collector import fetch_page  # noqa: E402

OUT = HERE / "out" / "jongno_links.geojson"

FLAGS = {"CRSWK": "is_crosswalk", "OVRP": "is_overpass", "BRG": "is_bridge",
         "TNL": "is_tunnel", "PARK": "in_park", "SBWY_NTW": "subway_connected",
         "BLDG": "near_building"}


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def main():
    key = get_seoul_key()
    total = fetch_page(key, 1, 1).get("list_total_count", 0)
    print(f"Jongno total rows: {total} - fetching ...")

    records = []
    start = 1
    while start <= total:
        end = min(start + 999, total)
        rows = fetch_page(key, start, end).get("row", [])
        for r in rows:
            if r.get("NODE_TYPE") != "LINK":
                continue
            wkt_str = (r.get("LNKG_WKT") or "").strip()
            if not wkt_str.upper().startswith("LINESTRING"):
                continue
            rec = {
                "link_id": to_int(r.get("LNKG_ID")),
                "bgng_id": to_int(r.get("BGNG_LNKG_ID")),   # start endpoint id
                "end_id": to_int(r.get("END_LNKG_ID")),     # end endpoint id
                "length_m": r.get("LNKG_LEN"),
                "emd_nm": r.get("EMD_NM") or None,
                "geometry": wkt.loads(wkt_str),
            }
            for api, key_name in FLAGS.items():
                rec[key_name] = r.get(api) == "1"
            records.append(rec)
        print(f"  rows {start}-{end}: kept {len(records)} links so far")
        start = end + 1

    gdf = gpd.GeoDataFrame(records, crs="EPSG:4326")
    # how many links actually carry topology ids (needed for the graph)
    have_topo = gdf[["bgng_id", "end_id"]].notna().all(axis=1).sum()
    print(f"\n{len(gdf)} links with geometry; {have_topo} also have BGNG/END ids")
    OUT.parent.mkdir(exist_ok=True)
    gdf.to_file(OUT, driver="GeoJSON")
    print(f"Saved -> {OUT}")


if __name__ == "__main__":
    main()

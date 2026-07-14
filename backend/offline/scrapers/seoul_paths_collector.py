"""
Seoul city pedestrian-network collector for the pilot district (Jongno-gu).

Companion to osm_paths_collector.py, but the source is Seoul's Open Data Plaza
(data.seoul.go.kr), service `TbTraficWlkNet` — the official city walking network.
Unlike OSM, each walkable LINK carries pedestrian-specific flags (crosswalk,
overpass, bridge, park, subway-connected, near-building) that we keep for
exploration-aware routing. Coordinates already come as WGS84 WKT, so no
reprojection is needed.

The full dataset is ~491k rows for all of Seoul; we filter to the pilot district
(종로구 / Jongno-gu, which contains Ikseon-dong) by passing the district NAME as
the API's positional filter — ~19k rows, ~20 pages instead of ~492.

Run:  python -m offline.scrapers.seoul_paths_collector            (dry run)
      python -m offline.scrapers.seoul_paths_collector --store    (write to DB)
"""

import sys
import requests

from offline.db import get_seoul_key, upsert_walk_links

# ---------------------------------------------------------------------------
# 1. CONFIG
# ---------------------------------------------------------------------------
BASE = "http://openapi.seoul.go.kr:8088"
SERVICE = "TbTraficWlkNet"
DISTRICT = "종로구"          # pilot district; SGG_NM filter (the code 1111... does NOT work)
PAGE_SIZE = 1000             # API hard cap per request

# API flag field -> our row key. The API sends "0"/"1" strings.
FLAG_FIELDS = {
    "CRSWK": "is_crosswalk",
    "OVRP": "is_overpass",
    "BRG": "is_bridge",
    "TNL": "is_tunnel",
    "PARK": "in_park",
    "SBWY_NTW": "subway_connected",
    "BLDG": "near_building",
}


# ---------------------------------------------------------------------------
# 2. FETCH — one page of the district-filtered dataset.
# The Seoul REST pattern is /{KEY}/{TYPE}/{SERVICE}/{START}/{END}/{FILTER}.
# ---------------------------------------------------------------------------
def fetch_page(key: str, start: int, end: int) -> dict:
    url = f"{BASE}/{key}/json/{SERVICE}/{start}/{end}/{DISTRICT}"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    body = resp.json().get(SERVICE, {})
    code = body.get("RESULT", {}).get("CODE")
    if code not in ("INFO-000", None):
        raise RuntimeError(f"Seoul API error {code}: {body.get('RESULT', {}).get('MESSAGE')}")
    return body


# ---------------------------------------------------------------------------
# 3. NORMALIZE — keep only LINK rows (LineStrings) and shape them for walk_links.
# ---------------------------------------------------------------------------
def normalize(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        # NODE rows carry a point in NODE_WKT and empty LNKG_WKT; we want lines.
        if r.get("NODE_TYPE") != "LINK":
            continue
        wkt = (r.get("LNKG_WKT") or "").strip()
        if not wkt.upper().startswith("LINESTRING"):
            continue

        # LNKG_ID arrives as a float (e.g. 207435.0); make a stable string id.
        link_id = f"seoul:link:{int(float(r['LNKG_ID']))}"
        try:
            length_m = float(r.get("LNKG_LEN"))
        except (TypeError, ValueError):
            length_m = None

        row = {
            "link_id": link_id,
            "link_type_cd": r.get("LNKG_TYPE_CD") or None,
            "length_m": length_m,
            "sgg_nm": r.get("SGG_NM") or None,
            "emd_nm": r.get("EMD_NM") or None,
            "wkt": wkt,
            "source": "seoul",
        }
        for api_field, key in FLAG_FIELDS.items():
            row[key] = r.get(api_field) == "1"
        out.append(row)
    return out


# ---------------------------------------------------------------------------
# 4. ENTRY POINT — page through the district, normalize, summarize; --store writes.
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    key = get_seoul_key()

    # First call also tells us the filtered total so we know how many pages.
    first = fetch_page(key, 1, 1)
    total = first.get("list_total_count", 0)
    print(f"{DISTRICT}: {total} rows in TbTraficWlkNet — paging in {PAGE_SIZE}s ...")

    all_rows: list[dict] = []
    start = 1
    while start <= total:
        end = min(start + PAGE_SIZE - 1, total)
        body = fetch_page(key, start, end)
        page = body.get("row", [])
        all_rows.extend(normalize(page))
        print(f"  rows {start}-{end}: {len(page)} fetched, {len(all_rows)} links kept so far")
        if len(page) < (end - start + 1):
            break  # short page => no more data
        start = end + 1

    print(f"\n-> {len(all_rows)} usable pedestrian LINKS after normalization")

    # summary of the pedestrian flags (the reason we chose this source)
    flags = {key: 0 for key in FLAG_FIELDS.values()}
    for row in all_rows:
        for key in flags:
            flags[key] += 1 if row[key] else 0
    print("Flagged links:")
    for key, n in flags.items():
        print(f"  {key:<18} {n}")

    if store:
        n = upsert_walk_links(all_rows)
        print(f"\nUpserted {n} links into PostGIS (table 'walk_links').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return all_rows


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        collect(store="--store" in sys.argv)
    except requests.RequestException as exc:
        print(f"Network/Seoul API error: {exc}", file=sys.stderr)
        sys.exit(1)

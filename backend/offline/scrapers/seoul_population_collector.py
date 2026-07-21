"""
Seoul de-facto population (생활인구) collector for the pilot district (Jongno-gu).

Feeds the Quiet<->Lively dimension: for each census output area (집계구) in the
pilot zone, we need its polygon boundary (from SGIS, Statistics Korea's
geographic information service) and its hourly population (from Seoul Open
Data Plaza's `ppsLocalResd` service). Two things make joining these two sources
non-obvious, both found empirically (not documented):

  1. SGIS uses ITS OWN internal area codes, unrelated to the official
     government administrative-code scheme. Jongno-gu is "11010" in SGIS,
     not the well-known official code "11110". Codes are always looked up
     live via addr/stage.json -- never hardcode a code you haven't looked up.
  2. The population API's OA_CD (13 digits) is SGIS's own 집계구 code (14
     digits) with the leading zero of the area's local sequence number
     dropped in transit. Re-inserting a "0" after the 8th character
     (sido+sgg+dong prefix) recovers the real SGIS adm_cd, confirmed by
     cross-checking real rows against real SGIS polygons.

Not every SGIS 집계구 polygon gets a population row: a cell simply absent from
ppsLocalResd for an hour never enters `rows` below, so it's never written to
population_cells at all (as opposed to being written with population=NULL).
This is NOT sparse/random noise -- it's a confirmed, structural gap covering
most of the pilot zone. Audited all 17 dongs of Jongno-gu (SGIS cells matched
vs total, hour=14, 2022 boundary vintage):

    11010530 Sajik-dong            5/18   11010600 Gahoe-dong        7/8
    11010540 Samcheong-dong        5/5    11010610 Jongno1234-ga     5/14
    11010550 Buam-dong           17/17    11010630 Jongno56-ga       7/13
    11010560 Pyeongchang-dong      6/30   11010640 Ihwa-dong        16/16
    11010570 Muak-dong            11/16   11010670 Changsin1-dong     9/10
    11010580 Gyonam-dong           7/21   11010680 Changsin2-dong   17/17
    11010690 Changsin3-dong        8/13   11010700 Sungin1-dong     11/11
    11010710 Sungin2-dong         16/21   11010720 Cheongunhyoja-d.  9/22
    11010730 Hyehwa-dong          20/42
    TOTAL 176/294 (60%)

12 of the 17 dongs have gaps (5 are fully covered); the ratio swings from 20%
(Pyeongchang-dong) to 100%. Every missing code checked (multiple dongs, not
just one) is confirmed absent from the ENTIRE citywide dump for that hour --
not a pagination fluke -- and the same cluster of codes is absent across every
SGIS boundary vintage back to 2015 -- not a boundary-revision mismatch. The
recurring shape (Ikseon-dong's "11010610040001" being 7x the zone's average
cell area is one instance of it): one cell reports a value while a whole run
of finer-grained sibling codes next to it never appear at all, as if the
population survey pools them into that one code instead of publishing them
separately. This looks like a characteristic of Seoul's population survey
itself, not a bug in this collector or in the SGIS/population code matching
above. Do not re-litigate this by re-deriving the same dead end; if it matters
later, the fix would be re-attributing each missing cell to its reporting
neighbor's value, which is a real (currently unverified) assumption -- or
falling back to the cadrage's spatial-prediction gap-filling strategy, given
how much of the zone this actually covers.

Run:  python -m offline.scrapers.seoul_population_collector            (dry run)
      python -m offline.scrapers.seoul_population_collector --store    (write to DB)
"""

import json
import sys

import requests
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform

from offline.db import get_seoul_key, get_sgis_credentials, upsert_population_cells

# ---------------------------------------------------------------------------
# 1. CONFIG
# ---------------------------------------------------------------------------
SGIS_BASE = "https://sgisapi.mods.go.kr/OpenAPI3"
SEOUL_BASE = "http://openapi.seoul.go.kr:8088"
BOUNDARY_YEAR = "2022"          # SGIS boundary vintage; stable across recent years

# SGIS's OWN internal code for 종로구 (Jongno-gu) -- looked up via
# addr/stage.json?cd=11, NOT the official government code (which is "11110").
PILOT_GU_CD = "11010"
ZONE_SLUG = "jongno"
HOURS = [14, 19]                 # afternoon + evening, per the cadrage's day/night split
PAGE_SIZE = 1000                 # Seoul API hard cap per request

_to_wgs84 = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True).transform


# ---------------------------------------------------------------------------
# 2. SGIS — auth, then dong list, then OA (집계구) polygons per dong.
# ---------------------------------------------------------------------------
def get_sgis_token() -> str:
    service_id, security_key = get_sgis_credentials()
    url = f"{SGIS_BASE}/auth/authentication.json"
    resp = requests.get(url, params={"consumer_key": service_id, "consumer_secret": security_key}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    if body.get("errCd") != 0:
        raise RuntimeError(f"SGIS auth error {body.get('errCd')}: {body.get('errMsg')}")
    return body["result"]["accessToken"]


def fetch_dong_codes(token: str, gu_cd: str) -> list[str]:
    """Return the 8-digit SGIS dong codes making up one gu (district)."""
    url = f"{SGIS_BASE}/boundary/hadmarea.geojson"
    resp = requests.get(url, params={"accessToken": token, "year": BOUNDARY_YEAR, "adm_cd": gu_cd}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    if body.get("errCd") != 0:
        raise RuntimeError(f"SGIS hadmarea error {body.get('errCd')}: {body.get('errMsg')}")
    return [f["properties"]["adm_cd"] for f in body["features"]]


def fetch_oa_polygons(token: str, dong_cd: str) -> list[dict]:
    """Return the 집계구 polygons for one dong: [{oa_cd, dong_cd, geojson}, ...].

    Geometry arrives in SGIS's native EPSG:5179 and is reprojected to WGS84
    (SRID 4326) here, once, so every downstream consumer gets plain lng/lat.
    """
    url = f"{SGIS_BASE}/boundary/statsarea.geojson"
    resp = requests.get(url, params={"accessToken": token, "year": BOUNDARY_YEAR, "adm_cd": dong_cd}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    if body.get("errCd") != 0:
        raise RuntimeError(f"SGIS statsarea error {body.get('errCd')}: {body.get('errMsg')}")

    out = []
    for f in body["features"]:
        geom_5179 = shape(f["geometry"])
        geom_4326 = transform(_to_wgs84, geom_5179)
        out.append({
            "oa_cd": f["properties"]["adm_cd"],
            "dong_cd": dong_cd,
            "geojson": json.dumps(mapping(geom_4326)),
        })
    return out


def build_oa_geometry_map(token: str, gu_cd: str) -> dict[str, dict]:
    """Fetch every 집계구 polygon in the district: {oa_cd: {dong_cd, geojson}}."""
    dong_codes = fetch_dong_codes(token, gu_cd)
    print(f"[SGIS] {gu_cd}: {len(dong_codes)} dongs")

    oa_map: dict[str, dict] = {}
    for dong_cd in dong_codes:
        cells = fetch_oa_polygons(token, dong_cd)
        for cell in cells:
            oa_map[cell["oa_cd"]] = cell
        print(f"  dong {dong_cd}: {len(cells)} 집계구 polygons ({len(oa_map)} total so far)")
    return oa_map


# ---------------------------------------------------------------------------
# 3. SEOUL — page through the citywide population API for one hour, keep only
#    the rows whose (zero-corrected) OA_CD matches a polygon we collected.
# ---------------------------------------------------------------------------
def _fix_oa_cd(raw: str) -> str:
    """Re-insert the leading zero the population API drops from the local
    sequence number, turning a 13-digit OA_CD into SGIS's real 14-digit code."""
    return raw[:8] + "0" + raw[8:] if len(raw) == 13 else raw


def fetch_population_page(key: str, start: int, end: int, hour: int) -> dict:
    url = f"{SEOUL_BASE}/{key}/json/ppsLocalResd/{start}/{end}/{hour}/"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    body = resp.json().get("ppsLocalResd", {})
    code = body.get("RESULT", {}).get("CODE")
    if code not in ("INFO-000", None):
        raise RuntimeError(f"Seoul API error {code}: {body.get('RESULT', {}).get('MESSAGE')}")
    return body


def collect_hour(key: str, hour: int, oa_map: dict[str, dict]) -> list[dict]:
    first = fetch_population_page(key, 1, 1, hour)
    total = first.get("list_total_count", 0)
    print(f"[Seoul] hour {hour}: {total} citywide rows — paging in {PAGE_SIZE}s, keeping Jongno-gu only ...")

    rows = []
    start = 1
    while start <= total:
        end = min(start + PAGE_SIZE - 1, total)
        body = fetch_population_page(key, start, end, hour)
        page = body.get("row", [])
        for r in page:
            oa_cd = _fix_oa_cd(r["OA_CD"])
            cell = oa_map.get(oa_cd)
            if cell is None:
                continue  # not one of our pilot zone's cells
            pop_raw = r.get("TOT_LVPOP_CO")
            try:
                population = float(pop_raw)
            except (TypeError, ValueError):
                population = None  # '*' = privacy-suppressed (count <= 3)
            rows.append({
                "oa_cd": oa_cd,
                "dong_cd": cell["dong_cd"],
                "hour": hour,
                "population": population,
                "zone_slug": ZONE_SLUG,
                "geojson": cell["geojson"],
                "source": "seoul_sgis",
            })
        if len(page) < (end - start + 1):
            break
        start = end + 1
    print(f"  -> {len(rows)} / {len(oa_map)} pilot cells matched for hour {hour}")
    return rows


# ---------------------------------------------------------------------------
# 4. ENTRY POINT
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    token = get_sgis_token()
    oa_map = build_oa_geometry_map(token, PILOT_GU_CD)
    print(f"\n[SGIS] {len(oa_map)} 집계구 polygons total in the pilot district\n")

    seoul_key = get_seoul_key()
    all_rows: list[dict] = []
    for hour in HOURS:
        all_rows.extend(collect_hour(seoul_key, hour, oa_map))

    print(f"\n-> {len(all_rows)} population-cell rows across {len(HOURS)} hour(s)")

    if store:
        n = upsert_population_cells(all_rows)
        print(f"\nUpserted {n} rows into PostGIS (table 'population_cells').")
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
        print(f"Network/API error: {exc}", file=sys.stderr)
        sys.exit(1)

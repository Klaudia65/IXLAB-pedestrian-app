"""
OSM pedestrian-path collector for the pilot zone (Ikseon-dong, Seoul).

Companion to osm_collector.py, but for LINES instead of points: it fetches the
walkable OSM ways (footway, pedestrian, path, steps, living_street) once from
the Overpass API and stores them as LINESTRING rows in the PostGIS `paths`
table. The web map then reads those from our own backend / a static export,
so the browser never calls Overpass directly (no CORS, no rate limits).

Run:  python -m offline.scrapers.osm_paths_collector            (dry run)
      python -m offline.scrapers.osm_paths_collector --store    (write to DB)
"""

import sys
import json
import requests

from offline.db import upsert_paths

# ---------------------------------------------------------------------------
# 1. PILOT ZONE — same box as the POI collector, (S, W, N, E) in WGS84 degrees.
# ---------------------------------------------------------------------------
PILOT_BBOX = (37.5670, 126.9830, 37.5810, 126.9990)  # (S, W, N, E)

# Overpass mirrors, tried in order. The main instance (overpass-api.de) is
# frequently overloaded or unreachable; the others are community mirrors with
# the same API, so we fall through to the next one on failure.
OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

# The OSM `highway` values we treat as pedestrian ways.
WALKABLE = ("footway", "pedestrian", "path", "steps", "living_street")


# ---------------------------------------------------------------------------
# 2. OVERPASS QUERY
# We ask only for `way` elements whose highway tag is one of ours, inside the
# bbox. `out geom` returns the full coordinate list of each way (its geometry),
# which is exactly what we need to build a LineString.
# ---------------------------------------------------------------------------
def build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    b = f"{s},{w},{n},{e}"
    pattern = "|".join(WALKABLE)
    return f"""
    [out:json][timeout:60];
    (
      way["highway"~"^({pattern})$"]({b});
    );
    out geom;
    """


def fetch_osm(query: str) -> list[dict]:
    """Call Overpass and return the raw list of OSM elements.

    Tries each mirror in turn; raises the last error only if all of them fail.
    """
    last_exc: Exception | None = None
    for url in OVERPASS_MIRRORS:
        try:
            print(f"  trying {url} ...")
            resp = requests.post(
                url,
                data={"data": query},
                headers={"User-Agent": "IXLAB-pedestrian-app/pilot (research)"},
                timeout=90,
            )
            resp.raise_for_status()
            return resp.json().get("elements", [])
        except requests.RequestException as exc:
            print(f"    -> failed: {exc}")
            last_exc = exc  # fall through to the next mirror
    raise last_exc  # all mirrors failed


# ---------------------------------------------------------------------------
# 3. NORMALIZE
# Turn raw OSM ways into clean rows shaped like our `paths` table:
#   osm_id, name, highway, geojson (a LineString geometry as a JSON string).
# ---------------------------------------------------------------------------
def normalize(elements: list[dict]) -> list[dict]:
    rows = []
    for el in elements:
        if el.get("type") != "way":
            continue
        geometry = el.get("geometry")
        if not geometry or len(geometry) < 2:
            continue  # need at least 2 points to form a line

        tags = el.get("tags", {})
        highway = tags.get("highway")
        if highway not in WALKABLE:
            continue

        # GeoJSON coordinates are [lng, lat]; Overpass gives {lat, lon}.
        coords = [[g["lon"], g["lat"]] for g in geometry]
        geojson = json.dumps({"type": "LineString", "coordinates": coords})

        rows.append({
            "osm_id": f"osm:w{el['id']}",
            "name": tags.get("name") or tags.get("name:en") or None,
            "highway": highway,
            "geojson": geojson,
            "source": "osm",
        })
    return rows


# ---------------------------------------------------------------------------
# 4. ENTRY POINT — fetch, normalize, summarize; write to DB only with --store.
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    print(f"Querying Overpass for pedestrian ways in bbox {PILOT_BBOX} ...")
    elements = fetch_osm(build_query(PILOT_BBOX))
    print(f"  -> {len(elements)} raw OSM ways returned")

    rows = normalize(elements)
    print(f"  -> {len(rows)} usable pedestrian paths after normalization\n")

    # summary per highway type
    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["highway"]] = by_type.get(r["highway"], 0) + 1
    print("Paths per type:")
    for t in WALKABLE:
        print(f"  {t:<15} {by_type.get(t, 0)}")

    if store:
        n = upsert_paths(rows)
        print(f"\nUpserted {n} paths into PostGIS (table 'paths').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return rows


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        collect(store="--store" in sys.argv)
    except requests.RequestException as exc:
        print(f"Network/Overpass error: {exc}", file=sys.stderr)
        sys.exit(1)

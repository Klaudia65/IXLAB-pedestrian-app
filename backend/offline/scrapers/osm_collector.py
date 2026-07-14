"""
OSM POI collector for the pilot zone (Ikseon-dong, Seoul).

Step 1-3 of the pipeline: fetch Points Of Interest from OpenStreetMap via the
Overpass API, classify each one into our 5 project families, and print a summary.
Database insertion into PostGIS is added in the next step (see collect() TODO).

OSM is our storable backbone (ODbL license): parks, trails, viewpoints, murals,
temples, etc. Kakao/Naver are added later only to fill gaps and add "notability".

Run:  python -m offline.scrapers.osm_collector      (from the backend/ folder)
"""

import sys
import requests

from offline.db import upsert_pois

# ---------------------------------------------------------------------------
# 1. PILOT ZONE
# Overpass expects a bounding box as (south, west, north, east) in WGS84 degrees.
# This box frames Ikseon-dong and its surroundings.
# ---------------------------------------------------------------------------
PILOT_BBOX = (37.5670, 126.9830, 37.5810, 126.9990)  # (S, W, N, E)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# ---------------------------------------------------------------------------
# 2. TAG -> FAMILY MAPPING
# OSM describes places with tags (key=value). We translate the tags we care
# about into our 5 families. `classify()` below reads a place's tags and returns
# (family, subcategory), or None if the place is not relevant to us.
# ---------------------------------------------------------------------------
def classify(tags: dict) -> tuple[str, str] | None:
    leisure = tags.get("leisure")
    natural = tags.get("natural")
    landuse = tags.get("landuse")
    tourism = tags.get("tourism")
    historic = tags.get("historic")
    amenity = tags.get("amenity")
    place = tags.get("place")

    # -- Nature & outdoor spaces --
    if leisure in ("park", "garden", "nature_reserve"):
        return "nature", leisure
    if natural == "wood" or landuse == "forest":
        return "nature", "forest"
    if place == "square":
        return "nature", "square"

    # -- Urban texture (checked before generic culture: artwork/viewpoint are specific) --
    if tourism in ("viewpoint", "artwork"):
        return "urban_texture", tourism

    # -- Culture & heritage --
    if tourism in ("museum", "gallery"):
        return "culture", tourism
    if amenity in ("place_of_worship", "marketplace", "arts_centre"):
        return "culture", amenity
    if historic:  # any historic=* value (monument, memorial, building, ...)
        return "culture", "historic:" + historic

    # -- Food --
    if amenity in ("cafe", "restaurant"):
        return "food", amenity

    # -- Social & leisure --
    if amenity in ("cinema", "library", "theatre", "nightclub", "karaoke_box"):
        return "social", amenity
    if leisure == "amusement_arcade":
        return "social", "arcade"

    return None  # not a place we track


# ---------------------------------------------------------------------------
# 3. OVERPASS QUERY
# We ask Overpass for nodes, ways AND relations (`nwr`) matching our tags inside
# the bbox. `out center tags` returns the tags plus a single lat/lon per element
# (the centroid for ways/relations), which is what we need for a POI.
# ---------------------------------------------------------------------------
def build_query(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    b = f"{s},{w},{n},{e}"
    return f"""
    [out:json][timeout:60];
    (
      nwr["leisure"~"park|garden|nature_reserve|amusement_arcade"]({b});
      nwr["natural"="wood"]({b});
      nwr["landuse"="forest"]({b});
      nwr["place"="square"]({b});
      nwr["tourism"~"museum|gallery|artwork|viewpoint"]({b});
      nwr["historic"]({b});
      nwr["amenity"~"cafe|restaurant|library|cinema|theatre|nightclub|karaoke_box|place_of_worship|marketplace|arts_centre"]({b});
    );
    out center tags;
    """


def fetch_osm(query: str) -> list[dict]:
    """Call Overpass and return the raw list of OSM elements."""
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": "IXLAB-pedestrian-app/pilot (research)"},
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json().get("elements", [])


# ---------------------------------------------------------------------------
# 4. NORMALIZE
# Turn raw OSM elements into clean rows shaped like our `pois` table:
#   place_id, name, category, subcategory, lat, lng, source
# ---------------------------------------------------------------------------
def normalize(elements: list[dict]) -> list[dict]:
    rows = []
    for el in elements:
        tags = el.get("tags", {})
        result = classify(tags)
        if result is None:
            continue
        family, subcat = result

        # coordinates: nodes carry lat/lon directly; ways/relations carry `center`
        if el["type"] == "node":
            lat, lng = el.get("lat"), el.get("lon")
        else:
            center = el.get("center", {})
            lat, lng = center.get("lat"), center.get("lon")
        if lat is None or lng is None:
            continue

        name = tags.get("name") or tags.get("name:en")
        # keep unnamed places only for families where they still matter
        if not name:
            if family == "urban_texture":
                name = f"(unnamed {subcat})"
            else:
                continue

        rows.append({
            # stable unique id, e.g. "osm:n123" / "osm:w456" -> fits pois.place_id
            "place_id": f"osm:{el['type'][0]}{el['id']}",
            "name": name,
            "category": family,
            "subcategory": subcat,
            "lat": lat,
            "lng": lng,
            "source": "osm",
        })
    return rows


# ---------------------------------------------------------------------------
# 5. ENTRY POINT (step 1-3: fetch, classify, print — no database yet)
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    print(f"Querying Overpass for bbox {PILOT_BBOX} ...")
    elements = fetch_osm(build_query(PILOT_BBOX))
    print(f"  -> {len(elements)} raw OSM elements returned")

    rows = normalize(elements)
    print(f"  -> {len(rows)} relevant POIs after classification\n")

    # summary per family
    by_family: dict[str, int] = {}
    for r in rows:
        by_family[r["category"]] = by_family.get(r["category"], 0) + 1
    print("POIs per family:")
    for fam in ("nature", "culture", "food", "social", "urban_texture"):
        print(f"  {fam:<15} {by_family.get(fam, 0)}")

    # a few samples so we can eyeball the data
    print("\nSample (first 8):")
    for r in rows[:8]:
        print(f"  [{r['category']}/{r['subcategory']}] {r['name']}  ({r['lat']:.5f}, {r['lng']:.5f})")

    # write to PostGIS only when explicitly asked (safe dry-run by default)
    if store:
        n = upsert_pois(rows)
        print(f"\nUpserted {n} POIs into PostGIS (table 'pois').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return rows


if __name__ == "__main__":
    # ensure Korean (Hangul) POI names print correctly on Windows consoles
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        collect(store="--store" in sys.argv)
    except requests.RequestException as exc:
        print(f"Network/Overpass error: {exc}", file=sys.stderr)
        sys.exit(1)

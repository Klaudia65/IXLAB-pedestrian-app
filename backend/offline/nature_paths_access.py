"""
Tag each nature-walk with whether its park is PUBLIC, PAID, or PRIVATE — so the app
never recommends a walk that ends at a ticket gate (경복궁) or inside a private
residence garden (광명 가든 레지던스).

Why a separate step: nature_paths.py builds the walk geometry from local green
polygons, which only carry name/green_type. Access/fee live in OSM tags we did not
collect, so here we query Overpass once for the zone, match each walk to its OSM
green element by EXACT name, and write three properties back into the geojson:

    access      — raw OSM access tag (or "")
    fee         — raw OSM fee tag (or "")
    access_class — public | paid | private | review   (what the app should trust)

Classification (conservative — when unsure, "review", not "public"):
    paid     fee=yes / a charge is set, or a paid palace/shrine
    private  access in {private,no,customers,permit}, or a garden named as a
             residence / apartment (레지던스 / residence / 아파트 / 오피스텔)
    review   a garden with no public signal (name:en absent) — needs a human look
    public   everything else (a park with no restrictive tag is open by convention)

Run:  backend/.venv/Scripts/python.exe -m offline.nature_paths_access          (dry run)
      backend/.venv/Scripts/python.exe -m offline.nature_paths_access --write   (write geojson)
"""
import json
import pathlib
import sys
import urllib.request

from offline.scrapers.osm_green_collector import JONGNO_BBOX  # (W, S, E, N)

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"
WALKS_FILE = FRONTEND / "nature-paths-jongno.geojson"
OVERPASS = "https://overpass-api.de/api/interpreter"

RESIDENCE_TOKENS = ("레지던스", "residence", "아파트", "apartment", "오피스텔")
PRIVATE_ACCESS = {"private", "no", "customers", "permit"}


def _overpass_elements(bbox):
    """Fetch every leisure/tourism/historic/landuse element (tags only) in the zone."""
    w, s, e, n = bbox
    q = f"""
    [out:json][timeout:90];
    (
      way["leisure"]({s},{w},{n},{e});   relation["leisure"]({s},{w},{n},{e});
      way["tourism"]({s},{w},{n},{e});   relation["tourism"]({s},{w},{n},{e});
      way["historic"]({s},{w},{n},{e});  relation["historic"]({s},{w},{n},{e});
      way["landuse"]({s},{w},{n},{e});
    );
    out tags;
    """
    req = urllib.request.Request(OVERPASS, data=q.encode(),
                                 headers={"User-Agent": "ixlab-pedestrian/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["elements"]


def _classify(tags):
    """Return (access_class, access, fee) from an OSM element's tags."""
    access = tags.get("access", "")
    fee = tags.get("fee", tags.get("charge", ""))
    name = f"{tags.get('name', '')} {tags.get('name:en', '')}".lower()

    if fee == "yes" or (fee and fee not in ("no",)):
        return "paid", access, fee
    if access in PRIVATE_ACCESS:
        return "private", access, fee
    if tags.get("leisure") == "garden":
        if any(t in name for t in RESIDENCE_TOKENS):
            return "private", access, fee
        if not tags.get("name:en"):        # a garden with no public identity → look
            return "review", access, fee
    return "public", access, fee


def enrich():
    walks = json.loads(WALKS_FILE.read_text(encoding="utf-8"))
    elems = _overpass_elements(JONGNO_BBOX)
    print(f"[access] fetched {len(elems)} tagged OSM elements for the zone")

    by_name = {}
    for el in elems:
        nm = el.get("tags", {}).get("name")
        if nm and nm not in by_name:       # first exact-named element wins
            by_name[nm] = el["tags"]

    rows = []
    for f in walks["features"]:
        name = f["properties"].get("name")
        tags = by_name.get(name)
        if tags is None:
            cls, access, fee = "public", "", ""   # unmatched park → open by convention
            note = "no OSM match"
        else:
            cls, access, fee = _classify(tags)
            note = "/".join(filter(None, [tags.get("leisure"), tags.get("tourism"),
                                          tags.get("historic")]))
        f["properties"]["access"] = access
        f["properties"]["fee"] = fee
        f["properties"]["access_class"] = cls
        rows.append((cls, name, note))

    order = {"paid": 0, "private": 1, "review": 2, "public": 3}
    rows.sort(key=lambda r: (order[r[0]], r[1]))
    print(f"\n{'class':8} | park                     | osm")
    print("-" * 60)
    for cls, name, note in rows:
        print(f"{cls:8} | {name[:24]:24} | {note}")
    counts = {c: sum(1 for r in rows if r[0] == c) for c in order}
    print(f"\nsummary: {counts}")
    return walks


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    walks = enrich()
    if "--write" in sys.argv:
        WALKS_FILE.write_text(json.dumps(walks, ensure_ascii=False), encoding="utf-8")
        print(f"\n[access] wrote access_class into {WALKS_FILE.name}")
    else:
        print("\n(dry run — pass --write to add access_class to the geojson)")

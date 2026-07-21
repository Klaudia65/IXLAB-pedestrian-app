"""
OSM green-space collector for the pilot zone (Jongno-gu, Seoul).

Feeds the Green <-> Less-green dimension. Instead of Seoul's "major parks" open
data (only ~133 points citywide, far too sparse for a per-street signal), we take
the green POLYGONS from OpenStreetMap: parks, gardens, woods, grass, scrub...
OSM's coverage of mapped/official green in central Seoul is good (palace gardens,
pocket parks, the wooded hillsides of Naksan), and it comes as real surfaces.

We use osmnx.features_from_bbox rather than a raw Overpass query on purpose:
osmnx assembles OSM multipolygon RELATIONS into proper (Multi)Polygon geometries
for us (a park drawn as an outer ring with holes, or several disjoint patches),
which is fiddly to reconstruct by hand from Overpass `out geom`.

Caveat (per the cadrage): this is the "official/mapped green" layer -- only what
contributors drew. Individual street trees are barely mapped in Korea, and the
"real" perceived green (private gardens, spontaneous vegetation) is invisible;
that gap is what a later NDVI/GVI pass would fill. Not needed now.

Run:  python -m offline.scrapers.osm_green_collector            (dry run)
      python -m offline.scrapers.osm_green_collector --store    (write to DB)
"""

import json
import sys

import osmnx as ox
from shapely.geometry import mapping

from offline.db import upsert_green_spaces

# ---------------------------------------------------------------------------
# 1. PILOT ZONE — same box as zone-jongno.html / build_zone.py: (W, S, E, N).
# ---------------------------------------------------------------------------
JONGNO_BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # (W, S, E, N)
ZONE_SLUG = "jongno"

# The OSM tags we treat as "green space". Checked in this key priority order
# (leisure > landuse > natural) so a park tagged with several keys is labelled
# by its most specific amenity value. Only these values count as green; other
# values of the same key (e.g. landuse=residential) are ignored.
GREEN_TAGS = {
    "leisure": ["park", "garden", "nature_reserve", "recreation_ground", "dog_park"],
    "landuse": ["forest", "grass", "meadow", "village_green", "greenfield", "recreation_ground"],
    "natural": ["wood", "scrub", "grassland", "heath"],
}


# ---------------------------------------------------------------------------
# 2. FETCH — osmnx returns a GeoDataFrame of features (points/lines/polygons);
#    we keep only the polygonal ones (a park is a surface, not a point/line).
# ---------------------------------------------------------------------------
def fetch_green(bbox):
    tags = {key: True for key in GREEN_TAGS}  # ask OSM for every value of each key
    print(f"Querying OSM (osmnx) for green features in bbox {bbox} ...")
    gdf = ox.features_from_bbox(bbox=bbox, tags=tags)
    print(f"  -> {len(gdf)} raw features returned")
    gdf = gdf[gdf.geometry.type.isin(["Polygon", "MultiPolygon"])]
    print(f"  -> {len(gdf)} polygonal features (points/lines dropped)")
    return gdf


# ---------------------------------------------------------------------------
# 3. NORMALIZE — shape each polygon into a row for the green_spaces table:
#    osm_id, green_type, osm_key, name, geojson.
# ---------------------------------------------------------------------------
# element_type -> the single-letter prefix used in our osm_id (matches `paths`).
_ELEM_PREFIX = {"node": "n", "way": "w", "relation": "r"}


def _classify(row) -> tuple[str, str] | None:
    """Return (osm_key, green_type) for a feature, or None if no green value matched."""
    for key, values in GREEN_TAGS.items():
        val = row.get(key)
        if isinstance(val, str) and val in values:
            return key, val
    return None


def normalize(gdf, zone_slug: str = ZONE_SLUG) -> list[dict]:
    df = gdf.reset_index()  # lift the (element_type, osmid) MultiIndex into columns

    # osmnx's index names vary a touch by version; find whichever id/type columns exist.
    id_col = next((c for c in ("osmid", "id", "element") if c in df.columns and c != "element_type"), None)
    type_col = "element_type" if "element_type" in df.columns else ("element" if "element" in df.columns else None)

    rows = []
    for _, row in df.iterrows():
        hit = _classify(row)
        if hit is None:
            continue  # e.g. a leisure=pitch that isn't in our green list
        osm_key, green_type = hit

        etype = str(row.get(type_col, "way")) if type_col else "way"
        prefix = _ELEM_PREFIX.get(etype, "w")
        osm_id = f"osm:{prefix}{row[id_col]}" if id_col else f"osm:w{row.name}"

        name = row.get("name") or row.get("name:en") or None
        # Guard against pandas NaN (float) sneaking into the varchar name column.
        if isinstance(name, float):
            name = None

        rows.append({
            "osm_id": osm_id,
            "green_type": green_type,
            "osm_key": osm_key,
            "name": name,
            "geojson": json.dumps(mapping(row.geometry)),
            "zone_slug": zone_slug,
            "source": "osm",
        })
    return rows


# ---------------------------------------------------------------------------
# 4. ENTRY POINT — fetch, normalize, summarize; write to DB only with --store.
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    gdf = fetch_green(JONGNO_BBOX)
    rows = normalize(gdf)
    print(f"  -> {len(rows)} usable green polygons after normalization\n")

    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["green_type"]] = by_type.get(r["green_type"], 0) + 1
    print("Green polygons per type:")
    for t, n in sorted(by_type.items(), key=lambda kv: -kv[1]):
        print(f"  {t:<18} {n}")

    if store:
        n = upsert_green_spaces(rows)
        print(f"\nUpserted {n} green spaces into PostGIS (table 'green_spaces').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return rows


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    collect(store="--store" in sys.argv)

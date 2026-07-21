"""
Street-character collector for the pilot zone (Jongno-gu, Seoul) -- WAVE 1.

Builds the "Wiki* base" of the street-character pipeline: the streets that already
exist in collective knowledge. The guiding idea (see the street-character design):
a street's character is not in its shops, it is in how people DESCRIBE it -- so we
gather the open descriptive text attached to each named street rather than counting
shop categories.

Wave 1 is deliberately minimal and reliable, no heavy NLP:
  [2] Geometry   -- named walkable OSM ways in the bbox (via osmnx, same as the
                    green collector, so OSM tags come back as columns).
  [3] Identity   -- Tier A: the OSM `wikidata` / `wikipedia` tags on the way, plus
                    the Wikidata description fetched over SPARQL.
  [4] Open text  -- Tier B (light): the OSM `description` / `note` tags.
      Wave 1 confidence = f(has wiki identity, number of text sources).

Left for Wave 2 (clearly marked TODO below):
  - Wikidata/Wikivoyage lookup BY NAME for untagged streets (name matching is
    error-prone, so Wave 1 only trusts explicit OSM tags).
  - The distinctive-vocabulary fingerprint (TF-IDF / KeyBERT) and the real
    multi-source convergence score.
  - Grouping contiguous ways into corridors.

We store EVERY named walkable way as the geometry+identity backbone; the map
exporter is what applies the "show few, show sure" threshold.

Run:  python -m offline.scrapers.street_character_collector          (dry run)
      python -m offline.scrapers.street_character_collector --store  (write to DB)
"""

import json
import sys
import time

import osmnx as ox
import requests
from shapely.geometry import mapping

from offline.db import upsert_street_characters

# ---------------------------------------------------------------------------
# 1. PILOT ZONE — same box as the other Jongno collectors: (W, S, E, N).
# ---------------------------------------------------------------------------
JONGNO_BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # (W, S, E, N)
ZONE_SLUG = "jongno"

# We keep every WALKABLE named way, not just pedestrian-only ones: a street with
# car traffic alongside can still be "remarkable" and worth walking (per the user's
# ask). So instead of a small allow-list we use an exclude-list of the genuinely
# non-walkable / high-speed classes; everything else (residential, tertiary,
# secondary, primary, service, unclassified, pedestrian, footway, living_street,
# path, steps...) is a candidate. The "remarkable" gate is applied later (a street
# only shows if it has a Wikipedia article), and a piéton/marchable qualifier is
# derived at export time from the highway class.
EXCLUDE_HIGHWAYS = {
    "motorway", "trunk", "motorway_link", "trunk_link", "primary_link",
    "construction", "proposed", "raceway", "bus_guideway", "escape", "corridor",
}

# OSM tag keys that carry open descriptive text (Tier B, light). Kept short and
# reliable; richer sources (Wikivoyage, blogs) are added in Wave 2.
OSM_TEXT_KEYS = ("description", "note", "historic", "tourism")

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "pedestrian-app-street-character/1.0 (research; contact: kubale.klaudia@proton.me)"


# ---------------------------------------------------------------------------
# 2. FETCH — osmnx returns a GeoDataFrame of features; we keep the named,
#    LineString, walkable ways (a street is a line, not a point/polygon).
# ---------------------------------------------------------------------------
def fetch_streets(bbox):
    print(f"Querying OSM (osmnx) for named highways in bbox {bbox} ...")
    gdf = ox.features_from_bbox(bbox=bbox, tags={"highway": True})
    print(f"  -> {len(gdf)} raw highway features returned")
    gdf = gdf[gdf.geometry.type == "LineString"]
    if "name" in gdf.columns:
        gdf = gdf[gdf["name"].notna()]
    else:
        gdf = gdf.iloc[0:0]  # no named ways at all
    print(f"  -> {len(gdf)} named LineString ways")
    return gdf


# ---------------------------------------------------------------------------
# 3. NORMALIZE — shape each way into a row (osm_id, name, highway, wiki* tags,
#    OSM text). Geometry/text enrichment (Wikidata) happens in step 4.
# ---------------------------------------------------------------------------
_ELEM_PREFIX = {"node": "n", "way": "w", "relation": "r"}


def _clean(val):
    """Return a stripped string, or None for missing / pandas-NaN values."""
    if val is None or isinstance(val, float):  # NaN sneaks in as float
        return None
    s = str(val).strip()
    return s or None


def normalize(gdf, zone_slug: str = ZONE_SLUG) -> list[dict]:
    df = gdf.reset_index()  # lift the (element_type, osmid) MultiIndex into columns

    id_col = next((c for c in ("osmid", "id", "element") if c in df.columns and c != "element_type"), None)
    type_col = "element_type" if "element_type" in df.columns else ("element" if "element" in df.columns else None)

    rows = []
    for _, row in df.iterrows():
        highway = _clean(row.get("highway"))
        # highway may be a list when a way carries several values; take the first.
        if isinstance(row.get("highway"), list):
            highway = _clean(row["highway"][0])
        if not highway or highway in EXCLUDE_HIGHWAYS:
            continue

        name = _clean(row.get("name"))
        if not name:
            continue

        etype = str(row.get(type_col, "way")) if type_col else "way"
        prefix = _ELEM_PREFIX.get(etype, "w")
        osm_id = f"osm:{prefix}{row[id_col]}" if id_col else f"osm:w{row.name}"

        # Tier B (light): open descriptive OSM tags -> (text, source) pairs.
        texts: list[tuple[str, str]] = []
        for key in OSM_TEXT_KEYS:
            val = _clean(row.get(key))
            if val:
                texts.append((val, f"osm:{key}"))

        rows.append({
            "osm_id": osm_id,
            "name": name,
            "highway": highway,
            "wikidata": _clean(row.get("wikidata")),
            "wikipedia": _clean(row.get("wikipedia")),
            "geojson": json.dumps(mapping(row.geometry)),
            "zone_slug": zone_slug,
            "source": "osm",
            # working fields, folded into DB columns in finalize():
            "_texts": texts,
        })
    return rows


# ---------------------------------------------------------------------------
# 4. ENRICH — Tier A identity text: fetch the Wikidata description for ways that
#    carry a wikidata QID tag. Polite, rate-limited; only a handful per zone.
# ---------------------------------------------------------------------------
def wikidata_description(qid: str) -> str | None:
    """Return a short Wikidata description (en/ko/fr) for a QID, or None."""
    query = f"""
    SELECT ?desc WHERE {{
      wd:{qid} schema:description ?desc .
      FILTER(LANG(?desc) IN ("en","ko","fr"))
    }} LIMIT 1
    """
    try:
        r = requests.get(
            WIKIDATA_SPARQL, params={"query": query, "format": "json"},
            headers={"User-Agent": USER_AGENT}, timeout=30,
        )
        r.raise_for_status()
        bindings = r.json()["results"]["bindings"]
        return bindings[0]["desc"]["value"] if bindings else None
    except Exception as e:  # network / SPARQL hiccups must not abort the whole run
        print(f"    ! Wikidata lookup failed for {qid}: {e}")
        return None


def enrich_with_wikidata(rows: list[dict]) -> None:
    tagged = [r for r in rows if r.get("wikidata")]
    print(f"  -> {len(tagged)} ways carry a wikidata tag; fetching descriptions ...")
    for r in tagged:
        desc = wikidata_description(r["wikidata"])
        if desc:
            r["_texts"].append((desc, "wikidata"))
            print(f"     {r['name']}: {desc}")
        time.sleep(1.0)  # be polite to the Wikidata query service
    # TODO [Wave 2]: for rows WITHOUT a wikidata tag, look one up by name +
    # proximity (Wikidata SPARQL / Wikivoyage). Skipped now: name matching is
    # error-prone and Wave 1 only trusts explicit OSM tags.


# ---------------------------------------------------------------------------
# 5. FINALIZE — fold working fields into DB columns and compute a Wave-1
#    confidence. This is a placeholder heuristic, NOT the real convergence score:
#    it just reflects "do we have an identity + how many text sources", so the map
#    can already threshold. Wave 2 replaces it with vocabulary-overlap convergence.
# ---------------------------------------------------------------------------
def finalize(rows: list[dict]) -> None:
    for r in rows:
        texts = r.pop("_texts", [])
        source_types = sorted({src for _, src in texts})
        has_wiki = bool(r.get("wikidata") or r.get("wikipedia"))

        r["description"] = "\n".join(t for t, _ in texts) or None
        r["text_sources"] = source_types
        r["fingerprint"] = []  # Wave 2
        # 0.5 for a confirmed Wiki* identity + 0.15 per independent text source, capped.
        r["confidence"] = round(min(1.0, 0.5 * has_wiki + 0.15 * len(source_types)), 3)


# ---------------------------------------------------------------------------
# 6. ENTRY POINT — fetch, normalize, enrich, finalize, summarize; write only with --store.
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    gdf = fetch_streets(JONGNO_BBOX)
    rows = normalize(gdf)
    print(f"  -> {len(rows)} named walkable ways after normalization\n")

    enrich_with_wikidata(rows)
    finalize(rows)

    n_wiki = sum(1 for r in rows if r["wikidata"] or r["wikipedia"])
    n_text = sum(1 for r in rows if r["description"])
    print(f"\nIdentity summary: {n_wiki} ways with Wiki* identity, "
          f"{n_text} ways with any descriptive text.")
    confident = sorted((r for r in rows if r["confidence"] >= 0.5),
                       key=lambda r: -r["confidence"])
    print(f"'Show few, show sure' preview ({len(confident)} ways, confidence >= 0.5):")
    for r in confident[:15]:
        print(f"  {r['confidence']:.2f}  {r['name']:<20} "
              f"{'[wiki]' if (r['wikidata'] or r['wikipedia']) else ''} "
              f"{', '.join(r['text_sources'])}")

    if store:
        n = upsert_street_characters(rows)
        print(f"\nUpserted {n} street characters into PostGIS (table 'street_characters').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return rows


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    collect(store="--store" in sys.argv)

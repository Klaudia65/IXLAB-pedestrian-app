"""Derive the "locals' favourite streets" red-thread layer from the existing
street-character geojson.

This does NOT re-scrape or touch the DB. It reads the already-exported
web/frontend/street-character-jongno.geojson and produces a slim
web/frontend/street-character-locals-{zone}.geojson containing ONLY the
characterful streets (the "fil rouge"), one merged feature per corridor.

Filtering, in order (see brief-carte-rues-locaux.md):
  1. keep description_source == "llm" only (a real ambiance sentence = character,
     ~75 street names). Templates ("N shops...") are NOT a local signal.
  2. drop non-streets by name token: stairs / decks / underground arcades /
     bike paths / market corridors / ramps.
  3. merge numbered sub-branches into their parent corridor (one thread + one
     label per corridor): group by the name radical before the "<digits>[가나다]?길"
     suffix, so 돈화문로11가길 / 11나길 / 11다길 -> 돈화문로.
  4. tag a "headline" tier (shown first on mobile) = backed by Wikipedia/Wikidata
     OR max confidence >= 0.85 (confidence is bimodal 1.0 / 0.75, so this is the
     ~top 19 corridors); the rest appear only at higher zoom.

Run:  backend/.venv/Scripts/python -m offline.export_street_locals_geojson jongno
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import linemerge

FRONTEND = Path(__file__).resolve().parents[2] / "web" / "frontend"

# Name tokens that mark a feature as NOT a real street to walk (stairs, decks,
# underground arcades, bike lanes, market corridors, on/off ramps).
NON_STREET_TOKENS = ("계단", "데크", "통로", "지하상가", "자전거", "진출입")

# A Korean road branch suffix: "<number>[가나다...]길" (e.g. 11가길, 3길).
# Stripping it collapses branches onto their parent corridor name.
BRANCH_SUFFIX = re.compile(r"\d+[가-힣]?길$")

# Headline threshold: confidence is bimodal (1.0 vs 0.75), so 0.85 keeps only
# the converging-source corridors.
HEADLINE_CONF = 0.85


def corridor_key(name: str) -> str:
    """Radical of a street name = name with any numbered '길' branch suffix removed.

    돈화문로11가길 -> 돈화문로 ; 인사동길 -> 인사동길 (unchanged, no numeric branch).
    """
    stripped = BRANCH_SUFFIX.sub("", name).rstrip()
    # Only collapse when something was actually a numbered branch; otherwise keep
    # the full name (avoids merging distinct 길 that merely share a prefix).
    return stripped if stripped and stripped != name else name


def export(zone: str = "jongno") -> Path:
    src_path = FRONTEND / f"street-character-{zone}.geojson"
    gj = json.loads(src_path.read_text(encoding="utf-8"))

    # 1. LLM-described streets only.
    llm = [f for f in gj["features"] if f["properties"].get("description_source") == "llm"]

    # 2. drop non-streets.
    def is_street(name: str) -> bool:
        return not any(tok in (name or "") for tok in NON_STREET_TOKENS)

    llm = [f for f in llm if is_street(f["properties"].get("name"))]

    # 3. group ways by corridor radical.
    corridors: dict[str, list[dict]] = defaultdict(list)
    for f in llm:
        corridors[corridor_key(f["properties"]["name"])].append(f)

    def merge_geoms(fs):
        geoms = [shape(f["geometry"]) for f in fs]
        return linemerge(geoms) if len(geoms) > 1 else geoms[0]

    out_features = []
    for key, feats in sorted(corridors.items()):
        # Split a corridor into its MAIN spine and its numbered BRANCH alleys.
        # Main = ways named exactly like the radical (e.g. 돈화문로). If none exist
        # (a "branch-only" corridor off a big axis, e.g. 을지로's alleys), promote
        # the single longest way to stand in as the representative main line, so
        # every corridor still shows one clean line at default zoom.
        main_ways = [f for f in feats if f["properties"]["name"] == key]
        branch_ways = [f for f in feats if f["properties"]["name"] != key]
        if not main_ways:
            rep = max(branch_ways, key=lambda f: shape(f["geometry"]).length)
            main_ways = [rep]
            branch_ways = [f for f in branch_ways if f is not rep]

        # Corridor-level attributes (aggregated over all ways).
        props_list = [f["properties"] for f in feats]
        wiki_data = next((p.get("wikidata") for p in props_list if p.get("wikidata")), None)
        wiki_page = next((p.get("wikipedia") for p in props_list if p.get("wikipedia")), None)
        max_conf = max((p.get("confidence") or 0) for p in props_list)
        any_both = any(p.get("evidence") == "both" for p in props_list)
        headline = bool(wiki_data or wiki_page) or max_conf >= HEADLINE_CONF

        # Description = from the longest MAIN way (the spine), so a tiny branch
        # never overrides the main road's ambiance sentence. Shared by both parts.
        rp = max(main_ways, key=lambda f: shape(f["geometry"]).length)["properties"]

        base_props = {
            "name": key,                           # parent corridor name = label
            "description": rp.get("description"),
            "description_en": rp.get("description_en"),
            "why": rp.get("why"),
            "confidence": round(max_conf, 2),
            "evidence": "both" if any_both else rp.get("evidence"),
            "wikidata": wiki_data,
            "wikipedia": wiki_page,
            "headline": headline,                  # drives the default-zoom tier
        }

        # One feature for the main spine (always in the low-zoom tiers)...
        out_features.append({
            "type": "Feature",
            "geometry": mapping(merge_geoms(main_ways)),
            "properties": {**base_props, "part": "main", "ways": len(main_ways)},
        })
        # ...and one for the branch alleys (revealed only at high zoom), if any.
        if branch_ways:
            out_features.append({
                "type": "Feature",
                "geometry": mapping(merge_geoms(branch_ways)),
                "properties": {**base_props, "part": "branch", "ways": len(branch_ways)},
            })

    out = {"type": "FeatureCollection", "features": out_features}
    out_path = FRONTEND / f"street-character-locals-{zone}.geojson"
    out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    mains = [f for f in out_features if f["properties"]["part"] == "main"]
    branches = [f for f in out_features if f["properties"]["part"] == "branch"]
    n_head = sum(1 for f in mains if f["properties"]["headline"])
    print(f"{src_path.name}: {len(gj['features'])} ways -> {len(llm)} llm street-ways")
    print(f"-> {len(mains)} corridors ({n_head} headline / {len(mains) - n_head} zoom-in)"
          f" + {len(branches)} branch groups (high-zoom only)")
    print(f"wrote {out_path}")
    return out_path


if __name__ == "__main__":
    export(sys.argv[1] if len(sys.argv) > 1 else "jongno")

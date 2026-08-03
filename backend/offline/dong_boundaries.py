"""
Fetch the neighbourhoods of the Jongno pilot zone so the detailed map can zoom to
a neighbourhood the user names in the search bar.

Why two geometry kinds: streets carry a name but no neighbourhood tag, and the app
has no admin data. The obvious source — OSM 행정동 (admin_level=8) polygons — is too
COARSE for exploration: the whole of 인사동 / 익선동 / 낙원동 sits inside one giant
행정동 "종로1·2·3·4가동" that covers most of the map, so zooming to it is useless.
The precise unit an explorer means by "인사동" is the 법정동 (legal dong), which OSM
publishes as `place=quarter` POINTS (with Korean + English names). So we build:

  · POINTS   — every 법정동 / neighbourhood point inside 종로구 ∩ bbox (인사동, 익선동,
               낙원동, 소격동, 대학로거리 …). The frontend zooms to a neighbourhood-scale
               circle around the point.
  · POLYGONS — kept only for the few 행정동 that are already neighbourhood-scale and
               nicer as an outline (가회동, 삼청동, 이화동, 혜화동). The oversized
               종로*가동 dong are dropped — their legal dongs are covered as points.

Both carry search-friendly aliases (Korean, English, and a few informal names such
as 북촌 / Bukchon). See realmap.jsx `matchDong` / `showDong`.

Input : OSM via osmnx (Overpass) — no local file needed.
Output: web/frontend/dong-jongno.geojson
        Point OR Polygon features, properties: name (ko), name_en,
        aliases (list of lowercase search tokens)

Run: backend/.venv/Scripts/python.exe backend/offline/dong_boundaries.py
"""
import json
import re
import sys
from pathlib import Path

import osmnx as ox
from shapely.geometry import box, mapping

FRONTEND = Path(__file__).resolve().parents[2] / "web" / "frontend"
OUT = FRONTEND / "dong-jongno.geojson"

# Jongno pilot bbox [W,S,E,N] — same zone as realmap.jsx JONGNO_BBOX.
W, S, E, N = 126.97869, 37.56623, 127.01052, 37.58646
BBOX = box(W, S, E, N)
# Polygons are clipped to a lightly-padded bbox so "fit to this dong" stays on the
# visible Jongno map (삼청동 / 혜화동 extend north past the pilot frame).
PAD = 0.0015
CLIP = box(W - PAD, S - PAD, E + PAD, N + PAD)

# The only 행정동 kept as POLYGONS — already neighbourhood-scale and recognisable.
# Everything else (esp. the oversized 종로1·2·3·4가동 / 종로5·6가동) is dropped and
# instead represented by its legal-dong points below.
POLYGON_DONG = {"가회동", "삼청동", "이화동", "혜화동"}

# Well-known informal names → an existing feature's Korean name, so an explorer
# typing "Bukchon" or "대학로" still lands on the right neighbourhood.
INFORMAL_ALIASES = {
    "가회동": ["북촌", "bukchon", "bukchon hanok village"],
    "대학로거리": ["대학로", "daehangno", "daehak-ro"],
    "인사동": ["insadong"],
    "익선동": ["ikseondong"],
}


def clean_tokens(*values):
    """Lowercase search tokens from a set of names: full, no-spaces, and the
    part before any '(' romanisation note or '-dong' suffix."""
    toks = set()
    for v in values:
        if not v:
            continue
        v = str(v).strip().lower()
        if not v or v == "nan":
            continue
        toks.add(v)
        toks.add(v.replace(" ", ""))
        # strip parenthetical romanisation note, e.g. "jongno 1·2·3·4(ilisamsa)-ga-dong"
        base = re.sub(r"\([^)]*\)", "", v).strip()
        toks.add(base)
        toks.add(base.replace(" ", ""))
        # bare stem: drop a trailing "-dong" / "동"
        toks.add(re.sub(r"[-\s]*dong$", "", base).strip())
        toks.add(re.sub(r"동$", "", v).strip())
    return sorted(t for t in toks if t)


def make_feature(name, name_en, geometry):
    aliases = clean_tokens(name, name_en)
    for extra in INFORMAL_ALIASES.get(str(name), []):
        aliases = sorted(set(aliases) | set(clean_tokens(extra)))
    return {
        "type": "Feature",
        "properties": {"name": name, "name_en": name_en, "aliases": aliases},
        "geometry": mapping(geometry),
    }


def main():
    print(f"Fetching OSM features in bbox {W},{S},{E},{N} ...")
    admin = ox.features.features_from_bbox((W, S, E, N), {"boundary": "administrative"})

    # Jongno-gu outline (admin_level=6) — used to drop features from neighbouring
    # districts (중구 / 성북구) that only clip the bbox corner.
    g6 = admin[(admin["admin_level"] == "6") & (admin["name"] == "종로구")]
    g6 = g6[g6.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    jongno = g6.geometry.iloc[0] if len(g6) else None
    print("  종로구 outline:", "found" if jongno is not None else "MISSING (keeping all)")

    feats = []
    kept_names = set()

    # --- POLYGONS: the four neighbourhood-scale 행정동 ---
    g8 = admin[admin["admin_level"] == "8"]
    g8 = g8[g8.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    for _, r in g8.iterrows():
        name = r.get("name")
        if name not in POLYGON_DONG:
            continue
        clipped = r.geometry.intersection(CLIP)
        if clipped.is_empty:
            continue
        feats.append(make_feature(name, r.get("name:en"), clipped))
        kept_names.add(name)
    print(f"  -> {len(kept_names)} 행정동 polygons kept: {', '.join(sorted(kept_names))}")

    # --- POINTS: the legal-dong / neighbourhood points (the precise unit) ---
    places = ox.features.features_from_bbox((W, S, E, N), {"place": ["neighbourhood", "quarter"]})
    places = places[places.geometry.geom_type == "Point"]
    n_pts = 0
    for _, r in places.iterrows():
        geom = r.geometry
        if jongno is not None and not geom.within(jongno):
            continue
        if not geom.within(BBOX):
            continue
        name = r.get("name")
        if name in kept_names:          # already covered by a polygon (e.g. 가회동)
            continue
        feats.append(make_feature(name, r.get("name:en"), geom))
        kept_names.add(name)
        n_pts += 1
    print(f"  -> {n_pts} 법정동 / neighbourhood points kept")

    feats.sort(key=lambda f: (f["geometry"]["type"] != "Point", f["properties"]["name"] or ""))
    fc = {"type": "FeatureCollection", "features": feats}
    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(feats)} neighbourhoods -> {OUT}")
    for f in feats:
        p = f["properties"]
        kind = "▢" if f["geometry"]["type"] == "Point" else "▛"
        print(f"  {kind} {p['name']}  ({p['name_en']})  aliases: {', '.join(p['aliases'])}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

"""
Step 0.7 - Build the SWIPE DECK the web app teaches taste with, from the photos
we actually collected (Wikimedia Commons + Mapillary), snapped to real Jongno
streets so every card carries a genuine 6-axis score vector.

What it does
------------
1. Reads the two review manifests produced earlier:
     out/commons_check/manifest.json   (step0_6 — CC street scenes)
     out/mapillary_check/manifest.json  (step0_5 — Mapillary street-level)
2. Applies the human cull the user asked for (DROP_IDS / hanok cap) and drops
   every UNMATCHED photo (no scored street within 40 m — nothing to learn from).
3. RE-SNAPS each kept photo to scores-named-streets-jongno.geojson so the scores
   reflect the CURRENT rollup (the fixed percentile local_chain, etc.), not the
   stale values baked into the manifests.
4. Copies each kept image into web/frontend/assets/photos/swipe/ (Mapillary panos
   use the reprojected forward view).
5. Derives a human `scene` label + `tags` from the score poles and writes
   web/frontend/app/swipe-data.js  (sets window.SWIPE_CARDS + window.SWIPE_AXES).

The frontend swipe then computes the user's base profile from likes/dislikes and
pre-fills the vibe sliders + profile chips.

Run (from backend/):  .venv/Scripts/python.exe analysis/step0_7_build_swipe_deck.py
"""
import json
import math
import shutil
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

from face_blur import blur_faces_file

sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
FRONTEND = REPO / "web" / "frontend"
SCORES = FRONTEND / "scores-named-streets-jongno.geojson"
COMMONS = HERE / "out" / "commons_check"
MAPILLARY = HERE / "out" / "mapillary_check"
DEST_IMG = FRONTEND / "assets" / "photos" / "swipe"
DATA_JS = FRONTEND / "app" / "swipe-data.js"
METRIC = 5179
SNAP_MAX_M = 40

# The 6 bipolar axes (repo order). +score = the SECOND pole word.
AXES = [
    ("touristy_local", "touristy", "local"),
    ("historic_contemporary", "historic", "contemporary"),
    ("raw_polished", "raw", "polished"),
    ("quiet_lively", "quiet", "lively"),
    ("local_chain", "independent", "chain"),
    ("park", "", "by a park"),          # neg pole "no park" isn't a taste tag
]
TAG_MIN = 0.33                          # |score| a pole needs to become a tag

# --- Wikimedia cull (user-directed) -----------------------------------------
# Explicit removals: an ambulance, an adult-shop front, an indoor paper store and
# a cargo-trike shot — none reads as a walkable street scene. Everything else that
# snaps to a scored street stays in the POOL, so the in-app curation page can offer
# the user the full set (incl. all the Bukchon/hanok shots) to pick from. The user
# earlier liked 150057362 + 195957933 — build_pairs still favours the strongest
# exemplars for the DEFAULT pairs, and the user re-picks in the curation screen.
DROP_IDS = {"31185346", "141485852", "7265856", "115671784"}


def nearest_street(streets_m, lon, lat):
    pt = gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(METRIC).iloc[0]
    d = streets_m.geometry.distance(pt)
    i = d.idxmin()
    return streets_m.loc[i], float(d.loc[i])


def clean(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def scores_for(row):
    return {k: (None if clean(row[k]) is None else round(float(row[k]), 3))
            for k, _, _ in AXES}


def derive_tags_scene(scores):
    """Pole labels for the axes this street leans on, strongest first."""
    leans = []
    for k, neg, pos in AXES:
        v = scores.get(k)
        if v is None or abs(v) < TAG_MIN:
            continue
        label = pos if v > 0 else neg
        if label:
            leans.append((abs(v), label))
    leans.sort(reverse=True)
    tags = [lab for _, lab in leans][:4]
    if len(tags) >= 2:
        scene = f"{tags[0].capitalize()} · {tags[1]}"
    elif tags:
        scene = tags[0].capitalize()
    else:
        scene = "Jongno street"
    return tags, scene


# User-curated default pairs: axis -> (neg_pole card id, pos_pole card id). These
# override the automatic extreme-exemplar pick for the DEFAULT deck (the user can
# still re-curate live in the app). Axes not listed here fall back to auto.
# ids: c<pageid> = Wikimedia Commons, m<id> = Mapillary. Labels shown are the snapped
# street name (card.place), not the Commons filename.
PAIR_OVERRIDES = {
    #                       neg pole                pos pole
    "touristy_local":        ("c150057362",          "m1778692433102699"),  # touristy 북촌로11길(hanok sunrise) | local 계동길
    "historic_contemporary": ("m229147956344960",    "m1722868688600244"),  # historic 돈화문로10길 | contemporary 청계천로
    "raw_polished":          ("c41729716",           "m1048242196417295"),  # raw 돈화문로11가길(Back street 鐘路) | polished 삼청로
    "local_chain":           ("c54774571",           "m1175838890376715"),  # independent 인사동14길(Back alley) | chain 다동길
    "quiet_lively":          (None,                  "c115671801"),         # quiet auto | lively 인사동길(2012-05-11 Insadong 01)
}


def build_pairs(cards):
    """One forced-choice pair per axis: the user-curated exemplars (PAIR_OVERRIDES)
    when set, else the clearest exemplar at each pole.

    The onboarding is a "this or that" — for each axis the user picks the photo that
    feels more like them (or 'no preference'), which can't degenerate the way a
    like-everything swipe does. `left` is the negative-pole exemplar, `right` the
    positive-pole one. A per-photo usage cap spreads the auto picks so the same street
    doesn't headline every question (Jongno's poles cluster on a few streets)."""
    by_id = {c["id"]: c for c in cards}
    usage = {}

    def slim(c):
        return {"id": c["id"], "src": c["src"], "place": c["place"],
                "credit": c["credit"], "scores": c["scores"]}

    def pick(axis, reverse, exclude=None):
        cs = [c for c in cards if c["scores"].get(axis) is not None and c["id"] != exclude]
        cs.sort(key=lambda c: c["scores"][axis], reverse=reverse)
        for c in cs:                                    # prefer the strongest not over-used
            if usage.get(c["id"], 0) < 2:
                return c
        return cs[0]

    pairs = []
    for k, neg, pos in AXES:
        ov = PAIR_OVERRIDES.get(k)
        left = by_id.get(ov[0]) if ov else None
        right = by_id.get(ov[1]) if ov else None
        if left is None:
            left = pick(k, reverse=False)               # most negative = neg pole
        if right is None:
            right = pick(k, reverse=True, exclude=left["id"])  # most positive = pos pole
        usage[left["id"]] = usage.get(left["id"], 0) + 1
        usage[right["id"]] = usage.get(right["id"], 0) + 1
        pairs.append({"axis": k, "neg": neg or "no park", "pos": pos,
                      "left": slim(left), "right": slim(right)})
    return pairs


def load(manifest_path):
    return json.loads(manifest_path.read_text(encoding="utf-8")).get("images", [])


def select_commons(records):
    for r in records:
        rid = str(r["id"])
        if rid in DROP_IDS:
            continue
        yield {"id": f"c{rid}", "src_id": rid, "lon": r["lon"], "lat": r["lat"],
               "img": COMMONS / f"images/{rid}.jpg", "source": "commons",
               "license": r.get("license"), "artist": r.get("artist"),
               "url": r.get("commons")}


def select_mapillary(records):
    for r in records:
        if r.get("error") or not r.get("scores"):
            continue                                    # unmatched / failed -> skip
        rid = str(r["id"])
        # panos are stored equirectangular; use the reprojected forward view file
        src_rel = r.get("view") or r.get("image")
        if not src_rel:
            continue
        yield {"id": f"m{rid}", "src_id": rid, "lon": r["lon"], "lat": r["lat"],
               "img": MAPILLARY / src_rel, "source": "mapillary",
               "license": "CC BY-SA 4.0 (Mapillary)", "artist": None,
               "url": f"https://www.mapillary.com/app/?pKey={rid}&focus=photo"}


def main():
    streets = gpd.read_file(SCORES).to_crs(METRIC)
    DEST_IMG.mkdir(parents=True, exist_ok=True)
    for old in DEST_IMG.glob("*.jpg"):
        try: old.unlink()
        except OSError: pass

    picked = list(select_commons(load(COMMONS / "manifest.json"))) \
        + list(select_mapillary(load(MAPILLARY / "manifest.json")))

    cards, dropped = [], 0
    for p in picked:
        row, dist = nearest_street(streets, p["lon"], p["lat"])
        if dist > SNAP_MAX_M:
            dropped += 1
            continue                                    # exclude unmatched
        if not p["img"].exists():
            print(f"  ! missing image {p['img'].name}, skip"); continue
        dst = DEST_IMG / f"{p['id']}.jpg"
        if p["source"] == "commons":
            nf = blur_faces_file(p["img"], dst)   # anonymise faces in CC street shots
            if nf:
                p["blurred"] = nf
        else:
            shutil.copy2(p["img"], dst)           # Mapillary is already face/plate-blurred

        scores = scores_for(row)
        tags, scene = derive_tags_scene(scores)
        credit = None
        if p["artist"]:
            credit = f"© {p['artist']} · {p['license']}"
        elif p["license"]:
            credit = p["license"]
        cards.append({
            "id": p["id"], "src": f"assets/photos/swipe/{p['id']}.jpg",
            "place": row["name"], "scene": scene, "tags": tags,
            "scores": scores, "credit": credit, "url": p["url"],
        })
        blur_note = f"  [blurred {p['blurred']} face(s)]" if p.get("blurred") else ""
        print(f"  ok {p['id']:>18}  {row['name']:<16} {dist:4.0f}m  {scene}{blur_note}")

    # Stable order: mix sources so the deck isn't all-Commons then all-Mapillary.
    cards.sort(key=lambda c: c["id"][1:])

    pairs = build_pairs(cards)
    print("\nforced-choice pairs (one per axis):")
    for p in pairs:
        print(f"  {p['neg']:>11} {p['left']['place']:<14} vs {p['right']['place']:<14} {p['pos']}")

    axes_js = json.dumps(AXES, ensure_ascii=False)
    cards_js = json.dumps(cards, ensure_ascii=False, indent=2)
    pairs_js = json.dumps(pairs, ensure_ascii=False, indent=2)
    DATA_JS.write_text(
        "/* AUTO-GENERATED by backend/analysis/step0_7_build_swipe_deck.py — do not edit by hand.\n"
        "   Real Jongno street photos (Wikimedia Commons + Mapillary), each snapped to a\n"
        "   scored street. window.SWIPE_PAIRS drives the onboarding 'this or that' (one\n"
        "   forced choice per axis); the app builds the base profile from those choices.\n"
        "   window.SWIPE_CARDS is the full scored deck (kept for reference/fallback). */\n"
        f"window.SWIPE_AXES = {axes_js};\n"
        f"window.SWIPE_PAIRS = {pairs_js};\n"
        f"window.SWIPE_CARDS = {cards_js};\n",
        encoding="utf-8")
    print(f"\n{len(cards)} cards + {len(pairs)} pairs written -> {DATA_JS}")
    print(f"   ({dropped} dropped as unmatched, images in {DEST_IMG})")


if __name__ == "__main__":
    main()

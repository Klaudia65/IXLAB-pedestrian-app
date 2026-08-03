"""
PROTOTYPE — a three-tier rebuild of the `park` (green) axis.

Why this exists
---------------
The shipped `park` axis (offline/rollup_street_axes.py) is a single binary band:
`2·frac − 1`, where frac = share of a street's length within 30 m of a public
green polygon. Two flaws were confirmed on the 307 Jongno streets:

  P1 — no differentiation: 49% of streets sit exactly at −1, 72% inside
       [−1, −0.75). The 30 m band answers "near a park: yes/no" and says nothing
       about HOW MUCH green, so moving the slider barely reorders anything.
  P2 — inaccessible parks: 41% of the streets the axis calls "green" never enter
       a park — they are only adjacent. The emblematic case is 청와대로 (+1.0),
       which hugs 경복궁's north WALL for 100% of its length but never goes in.

The semantics the axis should carry is a THREE-step ladder, not two:
    street trees  →  traversable public park  →  destination park (even paid)

This prototype rebuilds the axis as three STACKED components, each computed only
from data that already exists in web/frontend/, and prints a before/after report.
It is NON-DESTRUCTIVE: dry-run by default; `--write` ADDS `park_v2` (+ the three
components + tier) to the named-streets geojson WITHOUT touching `park`.

The three components
--------------------
  1. CANOPY (bottom of the slider) — "a few trees is enough".
     Replaces the binary band with a CONTINUOUS, distance-decayed green exposure
     sampled along the street (exp(−d/τ) to the nearest green). Small public
     patches are KEPT here: at street level they proxy the leafiness a pedestrian
     feels. This is what breaks the −1 pile-up.
     NOTE: still a proximity proxy. The real bottom-of-spectrum signal is the
     Seoul 가로수 (street-tree) canopy dataset — not collected yet. When it lands,
     drop it in at STREET_TREES_FILE and blend it into `canopy` (hook below).

  2. TRAVERSE (middle) — "walk through a public park".
     A street scores here by the fraction of its length lying INSIDE a traversable
     park polygon (shrunk INNER_M inward so the outer wall/edge doesn't count).
     "Traversable" = the park is one nature-paths-jongno.geojson proved to have
     real interior pedestrian paths (a walled, path-less green never qualifies).
     Crucially this is INTERIOR overlap, not proximity: 청와대로 runs 100% OUTSIDE
     경복궁's north wall, so its interior overlap is ~0 and it drops out — the P2
     fix. (An earlier version keyed on distance to the nature-path route, but that
     route itself bleeds onto the exterior sidewalk, so the wall-hugger survived.)

  3. DESTINATION (top) — "a park worth the trip, even if walled/paid".
     A traversable park whose area ≥ DEST_AREA_M2 (palaces, big parks). The bonus
     is credited ONLY to streets that genuinely access it (traverse > 0), so
     경복궁's entrance streets rise to the top while its wall-huggers do not.

Stacking → one score
--------------------
Tiers are laid out as non-overlapping bands so the slider's thirds match the
semantics exactly (bottom third = leafy streets, middle = park-traversal, top =
destinations), with a continuous within-tier spread so nothing ties:

    tier 0 (no park access):  0.00 + 0.33 · canopy_pct       (percentile of canopy)
    tier 1 (traversable park): 0.34 + 0.32 · traverse
    tier 2 (destination park): 0.67 + 0.33 · traverse
    park_v2 = 2 · score01 − 1                                (→ [−1, +1], repo sign)

Run:
    backend/.venv/Scripts/python.exe -m offline.park_axis_v2            (report only)
    backend/.venv/Scripts/python.exe -m offline.park_axis_v2 --write    (add park_v2)
"""

import json
import pathlib
import sys

import geopandas as gpd
import numpy as np
from shapely.geometry import Point
from shapely.strtree import STRtree

# Reuse the SHIPPED axis's helpers so the "before" numbers are the real ones.
from offline.rollup_street_axes import (
    NAMED_FILE, GREEN_FILE, METRIC_CRS,
    _public_green, _green_fraction_per_street,
)

FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"
NATURE_PATHS_FILE = FRONTEND / "nature-paths-jongno.geojson"

# Optional future hook: Seoul 가로수 (street-tree) points/lines. If this file ever
# exists, blend a real canopy density into component 1 (see _canopy_per_street).
STREET_TREES_FILE = FRONTEND / "street-trees-jongno.geojson"

# --- tuning knobs (all in metres / m²) --------------------------------------
CANOPY_STEP_M = 10.0      # sample the street this often for green exposure
CANOPY_TAU_M = 25.0       # exp(−d/τ): green within ~25 m reads as strong canopy
CANOPY_CUTOFF_M = 80.0    # beyond this, exposure is ~0 (skip the nearest lookup)
AREA_REF_M2 = 3_000.0     # a green ≥ this counts full-strength; smaller patches are
                          # down-weighted toward WEIGHT_FLOOR ("just a few trees")
WEIGHT_FLOOR = 0.35       # a tiny planter still gives SOME canopy, not zero
INNER_M = 3.0             # shrink the park polygon inward so its wall/edge ≠ inside
MIN_INTERIOR_M = 15.0     # need this much length INSIDE a park to count as traversal
DEST_AREA_M2 = 50_000.0   # a traversable park this big is a "destination" bonus
DEST_MIN_TRAVERSE = 0.15  # ...but only for a REAL walk through, not a bridge clip

# --- linear/corridor-park fix (rule A) --------------------------------------
# Some DESTINATION parks are LINEAR: a stream (청계천공원) or a ridge-wall walk. Their
# mapped polygon is a thin channel, so a street that IS the walk runs ALONGSIDE it
# and scores 0 on the interior-only test. For a PUBLIC destination park (WALLED_PAID
# is already excluded upstream, so every park reaching here is open) we therefore
# also credit length running within EDGE_M of the park, at a discount so "alongside"
# still ranks below a genuine "through". This does NOT reopen P2: 경복궁 is filtered
# out before this point, and 청와대로 touches no destination park (near_park=None).
EDGE_M = 8.0              # a street this close to the park edge walks "along" it
EDGE_W = 0.7             # discount: alongside a linear park < through its interior
EDGE_MIN_M = 30.0        # need this much length alongside to count (not a corner)

# How the three signals stack into one raw score BEFORE the percentile spread.
# canopy carries the whole low/mid spectrum; traverse/dest only ADD on top, so a
# street that genuinely goes through a park still outranks a merely leafy one.
W_TRAVERSE = 0.40
W_DEST = 0.20

# Green a pedestrian can actually EXPERIENCE from the street. We drop PRIVATE
# gardens (hanok courtyards) and vacant greenfield, and — crucially — the WALLED,
# PAID palaces: their green is real but sealed behind a wall, so crediting a street
# for running along it is the P2 faux positive (청와대로 along 경복궁). In this zone
# that set is essentially just 경복궁 (창덕궁/창경궁/종묘-shrine aren't mapped as green
# polygons here; every other big green — 청계천·낙산·동대문·열린송현 — is OPEN and stays).
# Palaces remain reachable as DESTINATIONS through the separate nature-walks layer.
CANOPY_DROP_TYPES = {"garden", "greenfield"}
WALLED_PAID = {"경복궁"}

# Upstream noise: scores-named-streets includes some non-street 청계천 micro-features
# (access stairs, an "escape ladder", skywalk decks). They aren't walkable routes, so
# we flag them (is_street=False) to keep them out of the map/top — a real cleanup
# belongs in the named-streets extraction, not here.
NON_STREET_TOKENS = ("계단", "사다리", "데크", "보행로", "공중보행", "지하상가")


def _is_street(name):
    return not any(t in (name or "") for t in NON_STREET_TOKENS)


def _accessible_green(green_m):
    """Green a pedestrian can experience from the street: public, not a private
    garden/greenfield, and not a walled paid palace (see WALLED_PAID)."""
    name = green_m["name"].fillna("").astype(str)
    return green_m[~green_m["green_type"].isin(CANOPY_DROP_TYPES) & ~name.isin(WALLED_PAID)]


def _area_weight(area):
    """Down-weight small greens toward WEIGHT_FLOOR: 'a few trees' < 'a real park'."""
    return float(np.clip(np.sqrt(area / AREA_REF_M2), WEIGHT_FLOOR, 1.0))


def _sample_points(geom, step):
    """Points every `step` metres along a (Multi)LineString, endpoints included."""
    lines = list(geom.geoms) if geom.geom_type == "MultiLineString" else [geom]
    pts = []
    for ls in lines:
        n = max(1, int(ls.length // step))
        for i in range(n + 1):
            pts.append(ls.interpolate(min(i * step, ls.length)))
    return pts


def _canopy_per_street(streets_m, green_m):
    """Continuous green EXPOSURE per street: the whole low/mid spectrum.

    Sample the street every CANOPY_STEP_M; at each sample take the nearest
    accessible green and score area_weight · exp(−d/τ) (d = 0 inside a park). The
    street's canopy is the mean over its samples. So:
      • a street lined with / running along a real park (청계천, 낙산) → high;
      • a street passing one small pocket park → mid ('a few trees');
      • a street far from any green → ~0.
    Area-weighting keeps 'a few trees' below 'a real park'; excluding walled palaces
    (via _accessible_green) keeps a wall-frontage street from being credited for
    green it cannot reach."""
    acc_green = _accessible_green(green_m)
    geoms = list(acc_green.geometry.values)
    weights = [_area_weight(g.area) for g in geoms]
    tree = STRtree(geoms)  # spatial index for fast nearest-green lookups

    out = np.zeros(len(streets_m), dtype=float)
    for i, street in enumerate(streets_m.geometry.values):
        samples = _sample_points(street, CANOPY_STEP_M)
        if not samples:
            continue
        acc = 0.0
        for p in samples:
            j = tree.nearest(p)              # index of nearest accessible green
            d = p.distance(geoms[j])         # 0 if the sample is inside that green
            if d < CANOPY_CUTOFF_M:
                acc += weights[j] * np.exp(-d / CANOPY_TAU_M)
        out[i] = acc / len(samples)

    # --- future 가로수 hook: if a street-tree layer exists, blend it in here -----
    # This proxy uses green POLYGONS; the real bottom-of-spectrum signal is street
    # trees. When STREET_TREES_FILE lands, blend its per-street density into `out`.
    return out


def _traverse_and_dest_per_street(streets_m, nature_m, green_m):
    """For each street, how much it runs THROUGH a traversable park.

    "Traversable" parks = the green areas nature-paths proved to have real interior
    pedestrian paths (a walled, path-less green never qualifies). For those parks
    we measure the street's overlap with the park's INTERIOR (polygon shrunk INNER_M
    inward, so hugging the outer wall reads as 0). This is the P2 fix.

    Returns (traverse, dest, park_name):
      traverse[i] in [0,1]  — fraction of the street lying inside a traversable park.
      dest[i]     in [0,1]  — same, but only when that park is destination-sized.
      park_name[i]          — which park it traverses (for the report / tooltip).
    """
    # Traversable = named parks with real interior walks (nature-paths) that are NOT
    # walled/paid palaces — those are destinations for the walks layer, not streets.
    traversable = set(str(n) for n in nature_m["name"].dropna()) - WALLED_PAID
    gm = green_m.dropna(subset=["name"]).copy()
    gm = gm[gm["name"].astype(str).isin(traversable)]
    # Dissolve to one interior polygon per park; keep its full (unshrunk) area for
    # the destination test — shrinking is only to exclude the wall from "inside".
    parks = []  # (name, interior_geom, edge_geom, area)
    for name, grp in gm.groupby("name"):
        full = grp.geometry.union_all()
        interior = full.buffer(-INNER_M)
        if interior.is_empty:
            continue
        # "along the edge" = a thin band just OUTSIDE the wall (rule A, dest only)
        edge = full.buffer(EDGE_M).difference(interior)
        parks.append((str(name), interior, edge, float(full.area)))

    n = len(streets_m)
    traverse = np.zeros(n, dtype=float)
    dest = np.zeros(n, dtype=float)
    park_name = [None] * n

    for i, street in enumerate(streets_m.geometry.values):
        L = street.length or 1.0
        best_t = 0.0
        best_name = best_area = None
        for name, interior, edge, area in parks:
            inside_m = (street.intersection(interior).length
                        if street.intersects(interior) else 0.0)
            t = inside_m / L if inside_m >= MIN_INTERIOR_M else 0.0

            # rule A: a LINEAR destination park (stream / ridge-wall) is walked
            # ALONGSIDE, not through — credit the along-edge length at a discount.
            if area >= DEST_AREA_M2 and street.intersects(edge):
                along_m = street.intersection(edge).length
                if along_m >= EDGE_MIN_M:
                    t = max(t, EDGE_W * min(1.0, along_m / L))

            if t > best_t:
                best_t, best_name, best_area = t, name, area
        traverse[i] = best_t
        park_name[i] = best_name
        if best_name is not None and best_area >= DEST_AREA_M2 and best_t >= DEST_MIN_TRAVERSE:
            dest[i] = best_t
    return traverse, dest, park_name


def _percentile_pm1(values):
    """Mid-rank percentile of every value, mapped to [−1, +1] (ties broken
    arbitrarily). Same treatment as the shipped quiet_lively axis, so all the
    hard-data sliders share one 'currency' and the axis spreads across its full
    range instead of piling up at a pole."""
    n = len(values)
    order = values.argsort().argsort()
    return np.round((order + 0.5) / n * 2 - 1, 3)


def compute():
    named = gpd.read_file(NAMED_FILE)
    green = gpd.read_file(GREEN_FILE)
    nature = gpd.read_file(NATURE_PATHS_FILE)

    named_m = named.to_crs(METRIC_CRS).reset_index(drop=True)
    green_m = green.to_crs(METRIC_CRS)
    nature_m = nature.to_crs(METRIC_CRS)
    names = named_m["name"].tolist()

    # --- OLD axis (reproduced from the shipped helpers) — the "before" ----------
    public_m = _public_green(green_m)
    old_frac = _green_fraction_per_street(named_m, public_m)
    park_old = np.round(old_frac * 2 - 1, 3)

    # --- NEW: three signals, stacked then spread by percentile ------------------
    # canopy carries the whole low/mid spectrum (continuous); traverse/dest only ADD
    # on top so a genuine through-park street still outranks a merely leafy one. A
    # single percentile then spreads the raw score across the full [−1,+1] range —
    # no hard bands, so nothing gets crushed into the bottom third.
    canopy = _canopy_per_street(named_m, green_m)
    traverse, dest, park_name = _traverse_and_dest_per_street(named_m, nature_m, green_m)

    raw = canopy + W_TRAVERSE * traverse + W_DEST * dest
    park_v2 = _percentile_pm1(raw)

    # tier is now just a LABEL for the popup (not used to score): 2 = through a big
    # park, 1 = through a park, 0 = canopy/proximity only.
    tier = np.where(dest > 0, 2, np.where(traverse > 0, 1, 0))

    return {
        "names": names, "park_old": park_old, "park_v2": park_v2,
        "canopy": canopy, "traverse": traverse, "dest": dest,
        "tier": tier, "park_name": park_name, "named_m": named_m,
    }


# ---------------------------------------------------------------------------
# Report — the point of a prototype: show P1 and P2 measurably fixed.
# ---------------------------------------------------------------------------
def _dist_line(label, arr):
    at_minus1 = np.mean(np.isclose(arr, -1.0)) * 100
    low_band = np.mean((arr >= -1.0) & (arr < -0.75)) * 100
    distinct = len(np.unique(np.round(arr, 3)))
    print(f"  {label:9s}  median {np.median(arr):+.3f} | "
          f"= −1: {at_minus1:4.1f}% | in [−1,−0.75): {low_band:4.1f}% | "
          f"{distinct} distinct values")


def report(R):
    names, tier = R["names"], R["tier"]
    park_old, park_v2 = R["park_old"], R["park_v2"]
    canopy, traverse, dest, park_name = R["canopy"], R["traverse"], R["dest"], R["park_name"]
    n = len(names)

    print(f"\n=== park axis prototype · {n} named streets ===")
    print("\nP1 — differentiation (the −1 pile-up):")
    _dist_line("OLD", park_old)
    _dist_line("v2", park_v2)

    print("\nTier populations (v2 slider bands):")
    for t, lbl in [(0, "canopy only "), (1, "traversable "), (2, "destination ")]:
        c = int(np.sum(tier == t))
        print(f"  tier {t} {lbl}: {c:3d} streets ({c/n*100:4.1f}%)")

    print("\nP2 — the walled-palace faux positive (경복궁 credit removed):")
    print("  경복궁 is excluded from accessible green, so a street can no longer be")
    print("  credited for running along its wall. These streets now score ONLY on the")
    print("  accessible green actually near them (street trees, 녹산 wood, 사직 park…):")
    ranks = {int(i): r for r, i in enumerate(np.argsort(-park_v2))}
    for target in ("청와대로", "사직로", "삼청로", "효자로"):
        for i in range(n):
            if names[i] == target:
                print(f"    OLD {park_old[i]:+.2f} → v2 {park_v2[i]:+.2f}  "
                      f"(rank {ranks[i] + 1}/{n})  {names[i]}")
    print("  (청와대로 was rank 1/307 in the OLD axis, purely for the 경복궁 wall.)")

    print("\nTop 12 real streets by v2 (upstream non-street features skipped):")
    order = [i for i in np.argsort(-park_v2) if _is_street(names[i])]
    skipped = sum(1 for i in range(n) if not _is_street(names[i]))
    print(f"    {'v2':>6} {'OLD':>6}  tier canopy trav  dest   park / street"
          f"   [{skipped} non-street features hidden]")
    for i in order[:12]:
        pn = park_name[i] or ""
        print(f"    {park_v2[i]:+.2f} {park_old[i]:+.2f}   {tier[i]}   "
              f"{canopy[i]:.2f}  {traverse[i]:.2f} {dest[i]:.2f}   "
              f"{pn[:16]:16s} {names[i]}")

    # spotlight the two cases from the critique, if present
    print("\nCritique spotlights:")
    for target in ("청와대로", "사직로", "경복궁"):
        hits = [i for i in range(n) if names[i] and target in names[i]]
        for i in hits[:1]:
            print(f"    {names[i]}: OLD {park_old[i]:+.2f} → v2 {park_v2[i]:+.2f} "
                  f"(tier {tier[i]}, accesses «{park_name[i] or '—'}»)")


PREVIEW_FILE = FRONTEND / "park-v2-preview-jongno.geojson"


def export_preview(R):
    """Write a NEW geojson (street geometry + park_old/park_v2 + components) for the
    before/after comparison map. Non-destructive: a fresh file, nothing overwritten."""
    collection = json.loads(NAMED_FILE.read_text(encoding="utf-8"))
    feats = collection["features"]
    assert len(feats) == len(R["names"]), "feature count drifted; aborting"
    for i, feat in enumerate(feats):
        feat["properties"] = {
            "name": R["names"][i],
            "park_old": float(R["park_old"][i]),
            "park_v2": float(R["park_v2"][i]),
            "canopy": round(float(R["canopy"][i]), 3),
            "traverse": round(float(R["traverse"][i]), 3),
            "dest": round(float(R["dest"][i]), 3),
            "tier": int(R["tier"][i]),
            "access": R["park_name"][i],
            "is_street": _is_street(R["names"][i]),
        }
    PREVIEW_FILE.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print(f"[preview] wrote {PREVIEW_FILE.name} for the comparison map")


def write_back(R):
    """Add park_v2 + components to the named-streets geojson, KEEPING `park`."""
    collection = json.loads(NAMED_FILE.read_text(encoding="utf-8"))
    feats = collection["features"]
    assert len(feats) == len(R["names"]), "feature count drifted; aborting"
    for i, feat in enumerate(feats):
        p = feat["properties"]
        p["park_v2"] = float(R["park_v2"][i])
        p["park_canopy"] = round(float(R["canopy"][i]), 3)
        p["park_traverse"] = round(float(R["traverse"][i]), 3)
        p["park_dest"] = round(float(R["dest"][i]), 3)
        p["park_tier"] = int(R["tier"][i])
        p["park_access"] = R["park_name"][i]
    NAMED_FILE.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print(f"\n[park_v2] added park_v2 (+components) to {NAMED_FILE.name}; `park` untouched.")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    R = compute()
    report(R)
    export_preview(R)                 # always: a fresh file for the comparison map
    if "--write" in sys.argv:
        write_back(R)                 # opt-in: add park_v2 into the live named file
    else:
        print("\n(dry run — pass --write to also add park_v2 to the named-streets geojson)")

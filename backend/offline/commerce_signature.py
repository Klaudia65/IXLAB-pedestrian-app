"""
Street-character LOCAL EVIDENCE (Wave 2b): build a street's character from the
shops fronting it, not from any article.

This is the highest-coverage source we have. The text pipeline (street_character.py)
only reaches streets that a human wrote about -- ~21-31 of Jongno's ~334 named
streets. But the commerce census (scrapers/seoul_commerce_collector.py) puts ~10k
shops on the map, and ~270 named streets have >=5 shops within a shopfront buffer.
So this pass gives a character to almost every commercial street, article or not.

Idea (the user's): aggregate the shop categories along a street into a "signature".
Galleries + cafés = an arty street; a cluster of 시계/귀금속 (watch/jewellery) shops =
the jewellers' street. The trick is that the signature must be RELATIVE: the raw top
category everywhere is 카페 / 백반 / 편의점, which distinguishes nothing. So we weight
each category by TF-IDF over the streets:

    TF  = how much category c dominates THIS street (count, damped by sublinear_tf)
    IDF = how RARE c is across all streets = log(N_streets / N_streets_having_c)

A category present on almost every street (카페) gets a tiny IDF and drops out unless
it truly dominates; a category concentrated on a few streets (화랑/galleries,
귀금속/jewellery) gets a high IDF and surfaces as the signature. This is exactly the
same gesture as the prose TF-IDF in street_character.py, but the "words" are shop
subcategories (indsSclsNm, `scls`) instead of Korean prose tokens.

Unit of analysis: PER SEGMENT (one OSM way = one row in street_characters), NOT per
street name. Commerce is a local signal -- geolocated points -- so averaging it over a
whole named street (종로 is 52 ways / 7.5 km) blurs the jewellers of one block into the
textile shops of another and destroys the very locality that makes it useful to a
pedestrian standing on one block. OSM already splits a street into ways at each
intersection (~100-220 m on average here), so the way is the natural pedestrian-scale
unit: 종로 gets ~52 local signatures instead of one muddy average. (Contrast the TEXT
fingerprint, which DESCRIBES the whole street and so is rightly per-name.) The IDF is
computed across all ways in the zone, so a category concentrated on a few segments --
even a few segments of one long street -- reads as distinctive.

Written per way (osm_id) via db.update_commerce_signature.

Kept deliberately separate from the text fingerprint (own columns commerce_signature
/ commerce_count): prose docs and category bags have very different token statistics,
and we want to SHOW the commerce signature as its own facet on the map, not blur it
into the prose "why". Wiring commerce in as a convergence source for the text
confidence is a later, small step.

Run:  python -m offline.commerce_signature            (dry run: preview signatures)
      python -m offline.commerce_signature --store     (write into PostGIS)
"""

import sys

import psycopg

from offline.db import get_dsn, update_commerce_signature

ZONE_SLUG = "jongno"
BUFFER_M = 25          # shopfront distance: street width + sidewalk + storefront (matches local_chain)
TOP_K = 4              # categories kept in a street's signature
MIN_SHOPS = 3          # below this the buffer is too thin for a meaningful signature

# Conservative metres-per-degree for the coarse bbox pre-filter, so the GiST index on
# geom can cut candidate pairs before the exact geodesic ST_DWithin. Same constant and
# reasoning as offline/scores.py (111_320 * cos(43°), safe across Korea's latitudes).
_M_PER_DEG = 111_320 * 0.731


# ---------------------------------------------------------------------------
# [1] SPATIAL AGGREGATION — per WAY (osm_id), count DISTINCT shops of each 소분류
# (scls) within the buffer. Grouping by osm_id (not name) is what keeps the signature
# local; the same shop can legitimately count for two adjacent ways it fronts near a
# corner, so COUNT(DISTINCT c.id) only dedupes within a single way's buffer.
# ---------------------------------------------------------------------------
_CATEGORY_COUNTS_SQL = """
SELECT s.osm_id,
       c.inds_scls_nm            AS scls,
       COUNT(DISTINCT c.id)      AS n
FROM street_characters s
JOIN commerces c
  ON c.zone_slug = %(zone_slug)s
 AND c.inds_scls_nm IS NOT NULL
 -- coarse bbox filter (index-assisted) then the exact geodesic distance check
 AND s.geom && ST_Expand(c.geom, %(buffer_deg)s)
 AND ST_DWithin(s.geom::geography, c.geom::geography, %(buffer_m)s)
WHERE s.zone_slug = %(zone_slug)s
GROUP BY s.osm_id, c.inds_scls_nm
"""


def fetch_category_counts(zone_slug: str, buffer_m: float) -> dict[str, dict[str, int]]:
    """Return {osm_id -> {scls category -> distinct shop count}} within buffer."""
    params = {
        "zone_slug": zone_slug,
        "buffer_m": buffer_m,
        "buffer_deg": buffer_m / _M_PER_DEG,
    }
    counts: dict[str, dict[str, int]] = {}
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(_CATEGORY_COUNTS_SQL, params)
            for osm_id, scls, n in cur.fetchall():
                counts.setdefault(osm_id, {})[scls] = int(n)
    return counts


def fetch_way_names(zone_slug: str) -> dict[str, str]:
    """{osm_id -> street name}, for the preview and per-way updates."""
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT osm_id, name FROM street_characters WHERE zone_slug = %s",
                (zone_slug,),
            )
            return {r[0]: r[1] for r in cur.fetchall()}


# ---------------------------------------------------------------------------
# [2] TF-IDF OVER CATEGORIES — categories are atomic tokens (they contain spaces
# and slashes, e.g. "시계/귀금속 소매업"), so we bypass sklearn's text tokenizer with a
# pass-through analyzer and feed each street a list of category tokens repeated by
# count. sublinear_tf damps a street with 40 cafés so it doesn't swamp the weight;
# IDF (rarity across streets) is what turns "over-represented here" into signal.
# ---------------------------------------------------------------------------
def build_signatures(
    counts: dict[str, dict[str, int]], top_k: int = TOP_K
) -> dict[str, list[str]]:
    """counts: {key -> {category -> shop count}}. Returns {key -> [top categories]}.
    The key is the way's osm_id here; each way is one document in the TF-IDF corpus."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    keys = [k for k, cats in counts.items() if cats]
    if len(keys) < 2:                        # IDF needs a corpus to contrast against
        return {k: [] for k in counts}

    # Each doc = the way's categories, each repeated by its shop count.
    docs = [[cat for cat, n in counts[k].items() for _ in range(n)] for k in keys]

    vec = TfidfVectorizer(
        analyzer=lambda toks: toks,          # tokens are already the categories
        sublinear_tf=True,
        min_df=1,
        max_df=0.6,                          # drop categories present on >60% of segments (ubiquitous)
        token_pattern=None,
    )
    matrix = vec.fit_transform(docs)
    vocab = vec.get_feature_names_out()

    signatures = {k: [] for k in counts}
    for row, key in enumerate(keys):
        scores = matrix[row].toarray().ravel()
        ranked = scores.argsort()[::-1]
        signatures[key] = [vocab[j] for j in ranked[:top_k] if scores[j] > 0]
    return signatures


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------
def build(zone_slug: str = ZONE_SLUG, buffer_m: float = BUFFER_M, store: bool = False) -> None:
    counts = fetch_category_counts(zone_slug, buffer_m)
    names = fetch_way_names(zone_slug)
    totals = {osm_id: sum(cats.values()) for osm_id, cats in counts.items()}
    n_ways = len(counts)
    n_covered = sum(1 for t in totals.values() if t >= MIN_SHOPS)
    print(f"[commerce_signature] {n_ways} way-segments touched shops; "
          f"{n_covered} have >= {MIN_SHOPS} within {buffer_m}m")

    signatures = build_signatures(counts)

    # Preview the strongest segments; grouped visually by street so the per-block
    # variation along one long street (the whole point) is easy to see.
    ranked = sorted((k for k in counts if totals[k] >= MIN_SHOPS),
                    key=lambda k: (names.get(k, ""), -totals[k]))
    print(f"\nSignature preview (segments of the busiest streets):")
    shown = 0
    for k in sorted((k for k in counts if totals[k] >= MIN_SHOPS), key=lambda k: -totals[k]):
        # Show each signature category with ITS shop count, so it's clear the ranking is
        # by over-representation (TF-IDF), NOT by raw count -- a rare category can rank
        # first with few shops. Total shop count is the leading number.
        sig = ", ".join(f"{c} ({counts[k][c]})" for c in signatures[k]) or "(no distinctive category)"
        print(f"  {totals[k]:>4} shops  {names.get(k,'?'):<14} {k:<14} -> {sig}")
        shown += 1
        if shown >= 25:
            break

    # Write one update for EVERY way in the zone (not just ways with shops): a way with
    # no shops nearby must be reset to 0/empty, otherwise a stale value from a previous
    # run survives. A way below MIN_SHOPS keeps its (small) count but gets no signature.
    # commerce_signature_counts is aligned by index with commerce_signature: the shop
    # count of each signature category, so the map can show "예술품 소매업 (3)".
    updates = []
    for osm_id in names:
        sig = signatures.get(osm_id, []) if totals.get(osm_id, 0) >= MIN_SHOPS else []
        updates.append({
            "osm_id": osm_id,
            "commerce_signature": sig,
            "commerce_signature_counts": [counts[osm_id][c] for c in sig],
            "commerce_count": totals.get(osm_id, 0),
        })

    if store:
        n = update_commerce_signature(updates)
        print(f"\nUpdated commerce signature on {n} way-segments in PostGIS.")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    build(store="--store" in sys.argv)

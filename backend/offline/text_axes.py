"""
NLP pipeline for the three "soft" bipolar axes of the cadrage that no hard dataset
can measure -- they live only in the language people use to DESCRIBE a place:

    touristy_local          (+ = local,        - = touristy)
    historic_contemporary   (+ = contemporary, - = historic)
    raw_polished            (+ = polished,     - = raw)

Sign convention follows the rest of the repo: the POSITIVE pole is the SECOND word
of the dimension name (cf. quiet_LIVELY where + = lively, local_CHAIN where + = chain).

UNIT OF ANALYSIS = the STREET, not the shop. We score text that describes the street
as a whole; the shops on it influence the score only insofar as the text mentions
them ("갤러리가 밀집한", "카페가 많은 거리"). We deliberately do NOT score individual
commerce POIs -- a street is qualified by how it is talked about, not by a roll-up of
its businesses.

Three stages, matching the cadrage:

  [1] TEXT      per street: reuse the descriptive text already gathered by the
                 street_character pass (Wikipedia + blog prose, in
                 street_characters.description). Production enrichment = the same
                 Naver Blog collector street_character plans (keyed by street name).
  [2] SCORE     text -> a note in [-1,+1] on each axis, per street. Engine = a tunable
                 LEXICON baseline (count distinct pole words per side, normalised
                 difference). Chosen over sentence embeddings because torch has no
                 Python 3.14 wheels yet; scoring is isolated in score_text() so an
                 embedding/LLM engine can replace it without touching the rest. Output
                 + evidence go to street_axis_scores (one row per street x dimension).
  [3] FAN       the per-street score onto every osm_network edge sharing that name,
                 then z-score across the zone and write segment_scores -- so these
                 become first-class bipolar dimensions alongside the others. This is a
                 NAME join (no buffer): the score belongs to the street, and every
                 fragment of that street inherits it.

COVERAGE-BIAS garde-fou (#1): an edge whose street has no text (or no pole word fired)
is written is_observed=False / score NULL -- honest "not measured", not pulled toward
a pole. The cadrage's stronger reading ("absence of buzz IS a 'local' signal") is a
deliberate later refinement, intentionally not baked in yet.

HONESTY: the lexicons are hand-seeded, so the scorer's ceiling is the lexicon's
coverage; the TEXT, however, is now real (harvested per street), not synthetic.

Run:  python -m offline.text_axes            (dry run: score streets, print preview)
      python -m offline.text_axes --store     (write street_axis_scores AND fan the
                                               3 dimensions into segment_scores)
"""

import sys

from offline.db import (
    fetch_edges_with_street_score,
    fetch_street_texts,
    upsert_street_axis_scores,
)
from offline.scores import normalize_and_store

ZONE_SLUG = "jongno"
METHOD = "lexicon"     # scoring engine tag stored on each row

# --- The pole lexicons -------------------------------------------------------
# For each axis: "neg" words pull the score toward -1, "pos" words toward +1.
# Matching is substring-based on the raw Korean text (Korean is agglutinative, so
# a stem like 관광 must still fire inside 관광객/관광지); every entry is >= 2 chars to
# keep substring matching from firing on incidental single syllables. The lexicons
# are the tunable knob of the baseline -- grow/prune them as real text is reviewed.
AXES = {
    "touristy_local": {
        "pos_label": "local", "neg_label": "touristy",
        "pos": ["동네", "주민", "단골", "로컬", "숨은", "현지", "토박이",
                "소소", "일상", "골목", "조용", "한적"],
        "neg": ["관광", "명소", "핫플", "인증샷", "필수코스", "외국인", "유명",
                "웨이팅", "랜드마크", "포토존", "데이트코스", "성지", "인기"],
    },
    "historic_contemporary": {
        "pos_label": "contemporary", "neg_label": "historic",
        "pos": ["현대", "모던", "트렌디", "힙한", "세련", "감성", "신상", "뉴트로",
                "디자이너", "루프탑", "인테리어", "스페셜티", "편집숍", "팝업", "감각"],
        "neg": ["전통", "역사", "고즈넉", "한옥", "조선", "근대", "오래된", "유서",
                "고택", "정취", "세월", "노포", "고서", "골동품"],
    },
    "raw_polished": {
        "pos_label": "polished", "neg_label": "raw",
        # polished = refined / high-end / clean finish. Deliberately kept to the
        # FINISH register (정갈, 명품, 미니멀, 품격...) and NOT trend words (힙, 트렌디
        # lean modern) so this axis stays distinct from historic_contemporary.
        "pos": ["세련", "깔끔", "고급", "럭셔리", "감각", "프리미엄", "모던",
                "정돈", "트렌디", "부티크", "우아", "미니멀", "정갈", "명품",
                "하이엔드", "세심", "완성도", "품격", "세련미", "도회적",
                "리모델링", "리뉴얼"],
        # raw = rough / worn / humble / old-school eatery / market / authentic.
        # Kept to the ROUGHNESS register; 오래된/세월 are NOT added on purpose (they
        # would make raw collapse into historic).
        "neg": ["허름", "투박", "서민", "재래시장", "노포", "정겨운", "소박",
                "날것", "포장마차", "포차", "백반", "분식", "낡", "국밥", "곱창",
                "순대", "노상", "좌판", "방앗간", "잡화", "손때", "낙후", "향토",
                "토속", "후미진", "정감", "시장통", "옛날식", "촌스러운"],
    },
}

# How fast confidence saturates with the number of distinct pole words found.
_CONF_SATURATION = 4


# --- [2] score one text on one axis ------------------------------------------
def score_text(text: str, axis: dict) -> dict:
    """Return {score, pos_hits, neg_hits, evidence} for a text on one bipolar axis.

    score = (pos - neg) / (pos + neg) in [-1, +1], or None if no pole word fired
    (so the street is honestly "no signal on this axis", not a forced 0). pos/neg are
    counts of DISTINCT matched pole words -- distinct (not raw occurrences) so one
    word repeated in a gushing text can't dominate the note. evidence lists the
    matched words, +word for the positive pole and -word for the negative one.
    """
    pos_found = [w for w in axis["pos"] if w in text]
    neg_found = [w for w in axis["neg"] if w in text]
    pos_hits, neg_hits = len(pos_found), len(neg_found)
    total = pos_hits + neg_hits
    if total == 0:
        return {"score": None, "pos_hits": 0, "neg_hits": 0, "evidence": []}
    score = (pos_hits - neg_hits) / total
    evidence = [f"+{w}" for w in pos_found] + [f"-{w}" for w in neg_found]
    return {"score": round(score, 3), "pos_hits": pos_hits, "neg_hits": neg_hits,
            "evidence": evidence}


def _confidence(pos_hits: int, neg_hits: int, text_len: int) -> float:
    """0..1 from how much evidence the note rests on: more distinct pole words and a
    longer text = more confident. A one-word match on a short blurb stays low."""
    n = pos_hits + neg_hits
    conf = min(1.0, n / _CONF_SATURATION) * (1.0 if text_len >= 80 else 0.6)
    return round(conf, 3)


# --- [2] score every street on every axis, write street_axis_scores ----------
def score_streets(zone_slug: str = ZONE_SLUG, store: bool = False) -> list[dict]:
    streets = fetch_street_texts(zone_slug)
    print(f"[text_axes] scoring {len(streets)} streets with text on {len(AXES)} axes "
          f"in '{zone_slug}'")

    rows: list[dict] = []
    for dimension, axis in AXES.items():
        preview = []
        for st in streets:
            text = st["text"] or ""
            r = score_text(text, axis)
            rows.append({
                "name": st["name"],
                "dimension": dimension,
                "score": r["score"],
                "pos_hits": r["pos_hits"],
                "neg_hits": r["neg_hits"],
                "evidence": r["evidence"],
                "text_len": len(text),
                "confidence": _confidence(r["pos_hits"], r["neg_hits"], len(text)),
                "text_sources": st["text_sources"],
                "zone_slug": zone_slug,
                "method": METHOD,
                "source": "nlp",
            })
            if r["score"] is not None:
                preview.append((r["score"], st["name"], r["evidence"]))

        # Preview: the clearest examples at each pole, to eyeball orientation.
        preview.sort()
        pos_lbl, neg_lbl = axis["pos_label"], axis["neg_label"]
        n_scored = len(preview)
        print(f"\n[{dimension}]  -1 = {neg_lbl}   +1 = {pos_lbl}   ({n_scored} streets scored)")
        for score, name, ev in preview[:4]:
            print(f"  {score:+.2f} {name:<12} {', '.join(ev)}")
        if n_scored > 8:
            print("   ...")
        for score, name, ev in preview[-4:]:
            print(f"  {score:+.2f} {name:<12} {', '.join(ev)}")

    if store:
        n = upsert_street_axis_scores(rows)
        print(f"\n[text_axes] wrote {n} rows into street_axis_scores")
    else:
        print("\n(dry run -- pass --store to write street_axis_scores + fan to segments)")
    return rows


# --- [3] fan one dimension's per-street scores onto its street segments -------
def fan(dimension: str, zone_slug: str = ZONE_SLUG) -> int:
    # Every edge inherits the score of the street it belongs to (name join). Already
    # oriented to the + pole, so invert=False. normalize_and_store z-scores across
    # the observed edges and flags the rest is_observed=False.
    rows = fetch_edges_with_street_score(dimension, zone_slug)
    n_observed = sum(1 for r in rows if r["source_count"] > 0)
    print(f"[{dimension}] {len(rows)} edges, {n_observed} inherit a scored street's note")

    n = normalize_and_store(
        dimension=dimension,
        rows=rows,
        method="street_name_fan_lexicon",
        zone_slug=zone_slug,
        invert=False,
    )
    print(f"[{dimension}] wrote {n} rows into segment_scores")
    return n


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    store = "--store" in sys.argv
    score_streets(store=store)
    if store:
        print()
        for dim in AXES:
            fan(dim)

"""
Street-character enrichment (WAVE 2): free descriptive text -> distinctive-vocabulary
fingerprint -> confidence. Runs AFTER the Wave-1 collector has stored the named ways.

This is the "long tail" pass the design doc calls the heart of the value: it reaches
the streets that HAVE a character but no formal Wikidata tag. Wave 1 found only 3
tagged ways in Jongno; here we match each street NAME directly against Korean
Wikipedia, which (the probe showed) covers a large share of Jongno's named 로/길/동
as real articles -- 서순라길, 인사동길, 삼청로, 익선동... -- with descriptive prose.

Pipeline (design stages [4][5][6][8]):
  [4] Free text   -- ko.wikipedia REST summary by street name, with two guards:
                     reject disambiguation pages, and require a Seoul/Jongno mention
                     (so a name that collides with an unrelated article is dropped).
  [5] Fingerprint -- TF-IDF over the whole street corpus (scikit-learn) with a small
                     dependency-free Korean tokenizer (Hangul runs, josa-stripped).
                     Top keywords = the distinctive vocabulary of THIS street.
  [6] Confidence  -- f(source-type diversity, text richness, fingerprint present).
                     NOTE: real cross-source *convergence* (independent sources
                     sharing words) needs more than one text source per street;
                     Wave 3 (Wikivoyage / open blogs) is what unlocks it. For now
                     most streets have a single source, so this is a confidence proxy.
  [8] Corridors   -- text/fingerprint are keyed by NAME, so every way sharing a name
                     gets the same fingerprint; the exporter then merges same-name
                     ways into one corridor feature. (Embedding-based merging = later.)

Left for Wave 2b/3: KeyBERT / multilingual embeddings (richer, more Korean-robust
than TF-IDF), Wikivoyage + open blogs (true multi-source convergence), fuzzy
name matching for streets whose Wikipedia title differs from the OSM name.

Run:  python -m offline.street_character            (dry run: harvest + fingerprint, no write)
      python -m offline.street_character --store     (write enrichment back to PostGIS)
"""

import json
import pathlib
import re
import sys
import time

import requests

from offline.db import fetch_street_characters, update_street_character_enrichment

ZONE_SLUG = "jongno"
WIKI_LANG = "ko"
USER_AGENT = "pedestrian-app-street-character/1.0 (research; contact: kubale.klaudia@proton.me)"

# A Wikipedia article is accepted as describing one of OUR streets only if its text
# mentions the study area -- cheap proximity guard, since street/dong articles carry
# no point coordinates (the probe confirmed coordinates=None for them).
RELEVANCE_TERMS = ("서울", "종로", "중구")


# ---------------------------------------------------------------------------
# [4] FREE TEXT (blog layer) — open-web / blog descriptive text per street name.
# WAVE-3 PROTOTYPE: read from a hand-harvested cache (cache/blog-text-{zone}.json).
# Production replaces the cache with a search-API collector (e.g. Naver Search) that
# writes the same {name: text} shape. This is the source that carries the real
# experiential "vibe" vocabulary Wikipedia ledes lack, AND a second independent
# source so the convergence score [6] finally means something.
# ---------------------------------------------------------------------------
def load_blog_texts(zone_slug: str) -> dict[str, str]:
    path = pathlib.Path(__file__).resolve().parents[1] / "cache" / f"blog-text-{zone_slug}.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}  # skip _note


# ---------------------------------------------------------------------------
# [4] FREE TEXT — Korean Wikipedia summary by street name.
# ---------------------------------------------------------------------------
def fetch_wikipedia(name: str) -> tuple[str, str] | None:
    """Return (extract, title) for a name, or None if no usable article.

    Rejects disambiguation pages and articles that don't mention the study area.
    The REST summary endpoint follows redirects (e.g. 피마길 -> 피맛길).
    """
    url = f"https://{WIKI_LANG}.wikipedia.org/api/rest_v1/page/summary/{name}"
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
        if r.status_code != 200:
            return None
        d = r.json()
    except Exception as e:
        print(f"    ! Wikipedia lookup failed for {name}: {e}")
        return None

    if d.get("type") == "disambiguation":
        return None
    extract = (d.get("extract") or "").strip()
    if len(extract) < 30:  # stubs / empty leads carry no character
        return None
    if not any(term in extract for term in RELEVANCE_TERMS):
        return None  # a same-name article somewhere else in Korea/the world
    return extract, d.get("title", name)


# ---------------------------------------------------------------------------
# [5] KOREAN TOKENIZER — dependency-free (no konlpy/kobert available in the venv).
# We keep Hangul runs and Latin words, strip a small set of trailing particles
# (josa) so 종로구/종로구를/종로구의 collapse to 종로구, and drop boilerplate. This is
# the "simple, interpretable" tier; KeyBERT/embeddings are the Wave-2b upgrade.
# ---------------------------------------------------------------------------
_TOKEN_RE = re.compile(r"[가-힣]+|[A-Za-z][A-Za-z0-9]+")
# Trailing particles, longest first so 에서/으로 win over 에/로.
_JOSA = ("에서", "으로", "까지", "부터", "에게", "한테", "이나", "은", "는", "이",
         "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "며", "고")
# Encyclopedic boilerplate + standalone Korean function words (particles, common
# verbs/connectors) that survive max_df on a small corpus and pollute the bigrams.
_STOP = {
    # boilerplate nouns (incl. study-area terms that are NOT distinctive within Jongno)
    "서울특별시", "대한민국", "도로", "지역", "위치", "다음", "의미", "부근",
    "일대", "구간", "사이", "이름", "법정동", "행정동", "번지", "지금", "당시",
    "동쪽", "서쪽", "남쪽", "북쪽", "기준", "옛말", "유래", "명칭",
    "종로구", "종로", "중구", "서울", "도로다", "도로이다", "도로이", "왕복",
    "지나간다", "이어지", "직결된다", "km", "daero",
    # standalone particles / connectors / common verbs (bigram noise)
    "에서", "으로", "까지", "부터", "있는", "있다", "이다", "이며", "하여",
    "위해", "잇는", "잇다", "되었던", "되었다", "붙여졌다", "붙은", "이용하였기",
    "이르", "이루", "지나", "따라", "통과", "시작", "종점", "기점",
    # english boilerplate
    "north", "south", "korea", "the", "and", "street", "seoul", "road",
    "district", "gu", "dong", "gil", "ro",
}


def _strip_josa(tok: str) -> str:
    for j in _JOSA:
        if tok.endswith(j) and len(tok) - len(j) >= 2:
            return tok[: -len(j)]
    return tok


def korean_tokens(text: str) -> list[str]:
    out = []
    for raw in _TOKEN_RE.findall(text):
        tok = raw.lower() if raw.isascii() else _strip_josa(raw)
        if len(tok) >= 2 and tok not in _STOP:
            out.append(tok)
    return out


# ---------------------------------------------------------------------------
# [5] TF-IDF FINGERPRINT across the street corpus.
# ---------------------------------------------------------------------------
def _is_self_reference(keyword: str, name: str) -> bool:
    """True if a keyword is just the street's own name (or a fragment of it), which
    is trivially present in its own article and carries no distinctive meaning."""
    base = re.sub(r"(길|로|거리)$", "", name)  # 서순라길 -> 서순라
    for part in keyword.split():               # bigrams: check each side
        if not part.isascii() and (part in name or name in part or (base and base in part)):
            return True
    return False


def build_fingerprints(corpus: dict[str, str], top_k: int = 6) -> dict[str, list[str]]:
    """corpus: {name -> aggregated text}. Returns {name -> [distinctive keywords]}."""
    from sklearn.feature_extraction.text import TfidfVectorizer

    names = [n for n, t in corpus.items() if t.strip()]
    docs = [corpus[n] for n in names]
    if len(docs) < 2:  # TF-IDF needs a corpus to contrast against
        return {n: [] for n in corpus}

    vec = TfidfVectorizer(
        tokenizer=korean_tokens, ngram_range=(1, 2),
        min_df=1, max_df=0.6, sublinear_tf=True, token_pattern=None,
    )
    matrix = vec.fit_transform(docs)
    vocab = vec.get_feature_names_out()

    fingerprints = {n: [] for n in corpus}
    for row, name in enumerate(names):
        scores = matrix[row].toarray().ravel()
        # Walk candidates best-first, skip self-references, keep the top_k that remain.
        kept = []
        for j in scores.argsort()[::-1]:
            if scores[j] <= 0:
                break
            kw = vocab[j]
            if not _is_self_reference(kw, name):
                kept.append(kw)
            if len(kept) >= top_k:
                break
        fingerprints[name] = kept
    return fingerprints


# ---------------------------------------------------------------------------
# UNIT-OF-ANALYSIS GUARD (design stage [1]) — a Korean 도로명 can name a whole
# multi-lane arterial or an administrative area (법정동), far bigger than the small
# walkable segment we highlight. Matching such a name to Wikipedia pins the whole
# axis/zone's character onto a fragment (e.g. 을지로 = a 6-lane road + a legal-dong;
# 청계천로 = the road along the stream). The app is about PEDESTRIAN street character,
# so we detect these and demote them out of the map. Signals, all from the article
# text or the name itself:
#   - "차선"        -> the article describes a multi-lane car road (N차선)
#   - "법정동"/"행정동" -> the name is really an administrative AREA, not a street
#   - name ends in "대로" -> a boulevard (arterial by definition)
def is_broad_axis(name: str, text: str) -> bool:
    if name.endswith("대로"):
        return True
    return ("차선" in text) or ("법정동" in text) or ("행정동" in text)


# ---------------------------------------------------------------------------
# [6] CONFIDENCE — proxy until Wave 3 adds independent sources for real convergence.
# ---------------------------------------------------------------------------
def confidence(source_types: list[str], text: str, fingerprint: list[str]) -> float:
    n_sources = len(source_types)
    score = (
        0.45 * (n_sources >= 1)          # has any descriptive source
        + 0.25 * (n_sources >= 2)        # a second, independent source (convergence)
        + 0.15 * (len(text) >= 200)      # a genuinely descriptive article, not a stub
        + 0.15 * bool(fingerprint)       # extracted a distinctive vocabulary
    )
    return round(min(1.0, score), 3)


# ---------------------------------------------------------------------------
# ENTRY POINT — harvest per distinct name, fingerprint the corpus, write back per way.
# ---------------------------------------------------------------------------
def enrich(zone_slug: str = ZONE_SLUG, store: bool = False) -> None:
    ways = fetch_street_characters(zone_slug)
    names = sorted({w["name"] for w in ways})
    has_wd_tag = {w["name"] for w in ways if w.get("wikidata")}
    print(f"[street_character] {len(ways)} ways, {len(names)} distinct names in '{zone_slug}'")

    # [4] Harvest text once per distinct name, from every available source.
    blog_texts = load_blog_texts(zone_slug)
    text_by_name: dict[str, str] = {}
    sources_by_name: dict[str, list[str]] = {}
    n_hit = n_blog = 0
    for name in names:
        sources: list[str] = []
        parts: list[str] = []
        hit = fetch_wikipedia(name)
        if hit:
            extract, title = hit
            parts.append(extract)
            sources.append("wikipedia:ko")
            n_hit += 1
        if name in blog_texts:      # open-web / blog descriptive text (Wave 3)
            parts.append(blog_texts[name])
            sources.append("web:blog")
            n_blog += 1
        if name in has_wd_tag:      # the way carried a wikidata tag (Wave-1 identity)
            sources.append("wikidata")
        text_by_name[name] = "\n".join(parts)
        sources_by_name[name] = sources
        time.sleep(0.15)            # be polite to the Wikipedia REST API
    print(f"[street_character] {n_hit}/{len(names)} matched Wikipedia, "
          f"{n_blog} have blog text")

    # [5] Fingerprint the whole corpus at once.
    fingerprints = build_fingerprints(text_by_name)

    # [6] Confidence per name.
    # DEMOTE_BROAD_AXES: when True, multi-lane arterials / administrative-area names
    # (is_broad_axis) are pushed below the map threshold. Set False for the "Large"
    # policy the user chose -- keep big walkable axes (을지로, 창경궁로, 청계천로) and let
    # the piéton/marchable qualifier (derived at export) distinguish them instead.
    DEMOTE_BROAD_AXES = False
    conf_by_name = {}
    broad = []
    for n in names:
        c = confidence(sources_by_name[n], text_by_name[n], fingerprints[n])
        if DEMOTE_BROAD_AXES and text_by_name[n] and is_broad_axis(n, text_by_name[n]):
            broad.append(n)
            c = min(c, 0.3)          # below the 0.5 "show" threshold
        conf_by_name[n] = c
    if broad:
        print(f"[street_character] demoted {len(broad)} broad axis/area names: {', '.join(broad)}")

    # Preview the top corridors before writing.
    ranked = sorted((n for n in names if conf_by_name[n] >= 0.5),
                    key=lambda n: -conf_by_name[n])
    print(f"\n'Show few, show sure' preview ({len(ranked)} names, confidence >= 0.5):")
    for n in ranked[:20]:
        why = ", ".join(fingerprints[n][:4])
        print(f"  {conf_by_name[n]:.2f}  {n:<14} -> {why}")

    # [8] Fan the per-name enrichment back onto every way of that name.
    updates = []
    for w in ways:
        name = w["name"]
        updates.append({
            "osm_id": w["osm_id"],
            "description": text_by_name[name] or None,
            "text_sources": sources_by_name[name],
            "fingerprint": fingerprints[name],
            "confidence": conf_by_name[name],
        })

    if store:
        n = update_street_character_enrichment(updates)
        print(f"\nUpdated enrichment on {n} ways in PostGIS (table 'street_characters').")
    else:
        print("\n(dry run — pass --store to write enrichment into PostGIS)")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    enrich(store="--store" in sys.argv)

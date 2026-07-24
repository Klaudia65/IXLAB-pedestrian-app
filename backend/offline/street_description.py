"""
Street DESCRIPTION pipeline -- grounded LLM condensation.

Replaces the raw, concatenated wiki-lede + blog text in `street_characters.description`
(today ~92% administrative "starts at X, ends at Y" ledes) with a single short
KOREAN ambiance sentence, grounded strictly in real source text, computed OFFLINE
and frozen in a cache. See backend/offline/street_description_pipeline.md for the spec.

Design invariant: the LLM runs ONLY on Tier A streets, once per source text, and its
result is cached by sha1 of the cleaned source. Same source text -> no new call, no
wording drift, deterministic build. At app runtime: zero LLM calls, we serve the cache.

RIGHTS / EPHEMERAL DATA: `prepare` writes desc-llm-{zone}.input.json — the CLEANED source
text (near-verbatim third-party excerpts). It, the raw blog cache, and the *.sentences.json
working file are all EPHEMERAL and git-ignored: they feed a generation batch and should be
deleted afterwards. Only desc-llm-{zone}.json (the TRANSFORMATIVE ko/en summaries + a sha1
hash of the source, no raw text) is retained and committed.

Stages (this module owns the deterministic ones; the LLM step is a separate batch):
  [1] ROUTE   -- classify each name Tier A (has vibe text) / B (only admin lede or
                 commerce) / C (nothing). The wiki lede is split into sentences and
                 the administrative (routing/bounding) ones are DROPPED, the rest kept.
  [2] CLEAN   -- strip hours / phones / addresses / lot numbers / parking / prices /
                 hashtags / urls from the vibe text before condensation.
  [3] CONDENSE-- one Korean sentence per Tier A street, produced by an LLM and cached
                 in cache/desc-llm-{zone}.json (keyed by name, guarded by source_hash).
  [B] TEMPLATE-- deterministic Korean sentence from commerce categories (Tier B).

CLI:
  python -m offline.street_description prepare jongno
      -> route the visible streets, and write cache/desc-llm-{zone}.input.json:
         the cleaned per-street text an LLM must condense (only names whose source
         is new or changed vs the existing cache). This file is the LLM's input.
  python -m offline.street_description status jongno
      -> routing coverage report (Tier A/B/C counts, cache coverage), no writes.
"""

import hashlib
import json
import pathlib
import re
import sys
import time

# Reuse the Wave-2 collectors so text sourcing stays consistent across both passes.
from offline.street_character import fetch_wikipedia, load_blog_texts

CACHE_DIR = pathlib.Path(__file__).resolve().parents[1] / "cache"
FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "web" / "frontend"

# A cleaned vibe text shorter than this carries too little to write an honest
# sentence -> the street is forced to Tier B (config knob `min_source_chars`).
MIN_SOURCE_CHARS = 80
# Cap the source text handed to the LLM, to bound tokens/cost. Blog snippets are
# newline-separated; we keep the most informative head after cleaning.
MAX_SOURCE_CHARS = 1500


# ---------------------------------------------------------------------------
# [1] SENTENCE SPLIT + ADMINISTRATIVE-SENTENCE DETECTOR
# The wiki lede is prose (sentences end in `...다.`); blog text is newline-separated
# snippets. We split on both so the admin detector can be applied sentence by sentence
# and we drop ONLY the bounding/routing sentences, keeping etymology / identity ones.
# ---------------------------------------------------------------------------
def split_sentences_ko(text: str) -> list[str]:
    """Split Korean prose + snippet text into sentence-ish units.

    Splits on newlines and on sentence enders (period / `...다.`), keeping it simple:
    the detector downstream is tolerant, so over-splitting is harmless.
    """
    # Normalise, then break on newlines and on a Korean sentence ender followed by a
    # boundary (period or end). Keep the `다` on the left of the split.
    parts: list[str] = []
    for line in text.split("\n"):
        # Split after `다.` / `다 ` / `요.` sentence enders and after plain periods.
        for chunk in re.split(r"(?<=다)\.|(?<=요)\.|\.\s+|(?<=다)\s+(?=[가-힣])", line):
            s = chunk.strip(" .\t")
            if s:
                parts.append(s)
    return parts


# Patterns that make a sentence purely ADMINISTRATIVE (a road's routing / bounds),
# carrying no pedestrian character. Applied per sentence, not to the whole lede.
_ADMIN_PATTERNS = (
    re.compile(r"에서\s*(시작|출발)"),          # "starts at X"
    re.compile(r"(시작|출발).*(끝|이르|다다)"),   # "runs from ... to ..."
    re.compile(r"(을|를)\s*잇는"),               # "connecting X and Y"
    re.compile(r"(을|를)\s*연결"),               # "links X to Y"
    re.compile(r"(에서|부터).*까지.*(도로|구간|길)"),  # "from X to Y road/segment"
    re.compile(r"왕복\s*\d"),                    # "N-lane (two-way)"
    re.compile(r"\d\s*차선"),                    # "N lanes"
)
# A sentence whose ONLY content is a bare "... is a road/street" classification, with
# toponyms but no descriptive adjective, is also administrative.
_ROAD_IS = re.compile(r"(도로|길)(이다|다)$")
# Signals that a sentence carries real identity even if it also mentions bounds:
# naming origin / etymology (spec's 동호로 example -> KEEP).
_IDENTITY = re.compile(r"(도로명|이름|명칭|유래|따왔|불리|불렸|옛말|본래)")


def is_admin_sentence(sentence: str) -> bool:
    """True if the sentence is administrative routing/bounding prose to be dropped.

    Keeps etymology / naming-origin sentences even when they mention endpoints
    (they express identity, not just geometry).
    """
    s = sentence.strip()
    if not s:
        return True
    if _IDENTITY.search(s):
        return False  # naming origin / identity -> keep
    if any(p.search(s) for p in _ADMIN_PATTERNS):
        return True
    # Bare "...도로이다" classification with no descriptive content.
    if _ROAD_IS.search(s) and len(s) < 40:
        return True
    return False


def keep_wiki_vibe(extract: str) -> str:
    """From a wiki lede, drop administrative sentences, keep descriptive ones."""
    kept = [s for s in split_sentences_ko(extract) if not is_admin_sentence(s)]
    return " ".join(kept).strip()


# ---------------------------------------------------------------------------
# [2] CLEAN -- light regex de-noising before the LLM. Not meant to be perfect; it
# just removes obvious operational boilerplate (hours, phones, addresses, hashtags)
# so the model isn't tempted to echo it. Semantic cleanup is the LLM's job.
# ---------------------------------------------------------------------------
_NOISE_PATTERNS = (
    re.compile(r"https?://\S+"),                        # urls
    re.compile(r"#\S+"),                                 # hashtags
    re.compile(r"\d{1,2}\s*:\s*\d{2}\s*(~|-)\s*\d{1,2}\s*:\s*\d{2}"),  # 11:30~22:00
    re.compile(r"\d{1,2}\s*:\s*\d{2}"),                  # stray times
    re.compile(r"\d{2,4}-\d{3,4}-\d{4}"),                # phones
    re.compile(r"\d+\s*번\s*출구에서\s*\d+\s*m"),        # "237m from exit 8"
    re.compile(r"[가-힣A-Za-z0-9]*\d+-\d+\b"),           # lot numbers 89-7 / 490-7
    re.compile(r"주차\s*(불가|가능|장)?"),                # parking notes
    re.compile(r"(영업시간|라스트오더|브레이크타임|공휴일|주말|평일)"),  # opening-hours words
    re.compile(r"[\d,]+\s*원"),                          # prices
    re.compile(r"[⏰️❗️✅☎️📍🅿️]+"),                    # operational emoji
    re.compile(r"\.{2,}"),                               # truncation ellipses
)


def clean_vibe_text(text: str) -> str:
    """Strip operational boilerplate, dedupe near-identical lines, cap length."""
    lines_out: list[str] = []
    seen: set[str] = set()
    for raw_line in text.split("\n"):
        line = raw_line
        for pat in _NOISE_PATTERNS:
            line = pat.sub(" ", line)
        line = re.sub(r"\s{2,}", " ", line).strip(" .·,-")
        if len(line) < 10:
            continue
        key = line[:40]  # cheap near-duplicate guard on the snippet head
        if key in seen:
            continue
        seen.add(key)
        lines_out.append(line)
    cleaned = "\n".join(lines_out)
    return cleaned[:MAX_SOURCE_CHARS].strip()


# ---------------------------------------------------------------------------
# [B] TIER-B TEMPLATE -- deterministic Korean sentence from commerce categories.
# Zero LLM, zero hallucination. Imported by the exporter for streets with no vibe text.
# ---------------------------------------------------------------------------
def ko_template(categories: list[str], shop_count: int, is_pieton: bool) -> str | None:
    """Build a factual Korean sentence from the top commerce categories.

    e.g. ['한식 음식점', '카페', '의류 소매업'] / 24 shops / pieton ->
         '한식 음식점, 카페, 의류 소매업 등 24곳의 상점이 모여 있는 보행자 거리.'
    Returns None when there is nothing factual to say.
    """
    cats = [c for c in (categories or []) if c][:3]
    if not cats:
        return None
    kind = "보행자 거리" if is_pieton else "차량이 다니는 거리"
    cat_str = ", ".join(cats)
    if shop_count and shop_count >= 3:
        return f"{cat_str} 등 {shop_count}곳의 상점이 모여 있는 {kind}."
    return f"{cat_str} 상점이 있는 {kind}."


# ---------------------------------------------------------------------------
# WIKI CACHE -- fetch_wikipedia hits the network; cache responses so re-runs of
# prepare/status are instant. Cache stores the raw extract (or null for a miss).
# ---------------------------------------------------------------------------
def _wiki_cache_path(zone_slug: str) -> pathlib.Path:
    return CACHE_DIR / f"wiki-summary-{zone_slug}.json"


def load_wiki_cache(zone_slug: str) -> dict[str, str | None]:
    p = _wiki_cache_path(zone_slug)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def get_wiki_extract(name: str, cache: dict[str, str | None]) -> str | None:
    """Cached wrapper over fetch_wikipedia: returns the extract text or None."""
    if name in cache:
        return cache[name]
    hit = fetch_wikipedia(name)
    extract = hit[0] if hit else None
    cache[name] = extract
    time.sleep(0.15)  # polite to the Wikipedia REST API on cache-miss only
    return extract


# ---------------------------------------------------------------------------
# LLM CACHE -- cache/desc-llm-{zone}.json, keyed by name, guarded by source_hash.
# ---------------------------------------------------------------------------
def cache_path(zone_slug: str) -> pathlib.Path:
    return CACHE_DIR / f"desc-llm-{zone_slug}.json"


def input_path(zone_slug: str) -> pathlib.Path:
    return CACHE_DIR / f"desc-llm-{zone_slug}.input.json"


def load_cache(zone_slug: str) -> dict[str, dict]:
    p = cache_path(zone_slug)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def source_hash(vibe_text: str) -> str:
    return hashlib.sha1(vibe_text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# [1] ROUTE -- build the vibe text for one name and classify its tier.
# ---------------------------------------------------------------------------
def route_name(name: str, blog_texts: dict[str, str],
               wiki_cache: dict[str, str | None]) -> dict:
    """Return {name, tier, vibe_text, source_hash} for one street name.

    Tier A: cleaned vibe text >= MIN_SOURCE_CHARS. Tier B/C decided by the exporter
    (it owns commerce data); here a non-A name is reported as 'B?' (no vibe text).
    """
    parts: list[str] = []
    blog = blog_texts.get(name)
    if blog:
        parts.append(blog)  # blog snippets are vibe by nature
    extract = get_wiki_extract(name, wiki_cache)
    if extract:
        vibe = keep_wiki_vibe(extract)  # drop the routing sentences, keep the rest
        if vibe:
            parts.append(vibe)

    vibe_text = clean_vibe_text("\n".join(parts)) if parts else ""
    if len(vibe_text) >= MIN_SOURCE_CHARS:
        return {"name": name, "tier": "A", "vibe_text": vibe_text,
                "source_hash": source_hash(vibe_text)}
    return {"name": name, "tier": "B?", "vibe_text": vibe_text, "source_hash": None}


def visible_names(zone_slug: str) -> list[str]:
    """Distinct street names in the already-exported geojson -- the universe whose
    description is actually shown on the map, so the batch is bounded to what matters."""
    p = FRONTEND / f"street-character-{zone_slug}.geojson"
    if not p.exists():
        return []
    gj = json.loads(p.read_text(encoding="utf-8"))
    names = {f["properties"].get("name") for f in gj.get("features", [])}
    return sorted(n for n in names if n)


# ---------------------------------------------------------------------------
# CLI -- prepare / status
# ---------------------------------------------------------------------------
def prepare(zone_slug: str) -> None:
    """Route the visible streets and write the LLM input file for Tier A names whose
    source text is new or changed vs the existing cache."""
    blog_texts = load_blog_texts(zone_slug)
    wiki_cache = load_wiki_cache(zone_slug)
    cache = load_cache(zone_slug)
    names = visible_names(zone_slug)
    if not names:
        print(f"[street_description] no exported geojson for '{zone_slug}' -- run the "
              f"exporter first so the visible-street universe is known.")
        return

    tier_a, need_gen = [], []
    for name in names:
        r = route_name(name, blog_texts, wiki_cache)
        if r["tier"] != "A":
            continue
        tier_a.append(r)
        cached = cache.get(name)
        if not cached or cached.get("source_hash") != r["source_hash"]:
            need_gen.append({"name": name, "source_hash": r["source_hash"],
                             "vibe_text": r["vibe_text"]})

    _wiki_cache_path(zone_slug).write_text(
        json.dumps(wiki_cache, ensure_ascii=False, indent=2), encoding="utf-8")
    input_path(zone_slug).write_text(
        json.dumps(need_gen, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[street_description] {len(names)} visible streets, {len(tier_a)} Tier A "
          f"(have vibe text), {len(need_gen)} need LLM generation "
          f"(missing/changed source).")
    print(f"  -> LLM input written to {input_path(zone_slug)}")
    if need_gen:
        print("\n  Sample (first 3) cleaned sources the LLM must condense:")
        for r in need_gen[:3]:
            print(f"\n  ## {r['name']}")
            print("  " + r["vibe_text"][:280].replace("\n", "\n  "))


def sentences_path(zone_slug: str) -> pathlib.Path:
    return CACHE_DIR / f"desc-llm-{zone_slug}.sentences.json"


def apply_sentences(zone_slug: str, generated_at: str, model: str) -> None:
    """Merge a hand/LLM-authored {name: {ko, en}} file into the frozen cache.

    Reads cache/desc-llm-{zone}.sentences.json (the LLM's raw output, keyed by name,
    each value an object with a Korean `ko` and an English `en` sentence) and the input
    file (for the matching source_hash), then writes each grounded pair into
    cache/desc-llm-{zone}.json with hash + provenance. An empty `ko` means "not
    groundable" -> the entry is skipped so the street falls back to Tier B.

    `generated_at`/`model` are passed in (scripts can't call Date.now) so the build
    stays reproducible.
    """
    sp = sentences_path(zone_slug)
    if not sp.exists():
        print(f"[street_description] no sentences file at {sp}")
        return
    authored = json.loads(sp.read_text(encoding="utf-8"))
    inputs = {r["name"]: r for r in
              json.loads(input_path(zone_slug).read_text(encoding="utf-8"))}
    cache = load_cache(zone_slug)

    written = skipped = 0
    for name, val in authored.items():
        if name.startswith("_"):
            continue
        # Accept either {"ko": .., "en": ..} or a bare string (treated as Korean).
        ko = (val.get("ko") if isinstance(val, dict) else val or "").strip()
        en = (val.get("en", "") if isinstance(val, dict) else "").strip()
        if not ko:
            # Empty = "not groundable / retract": drop any stale cached sentence so a
            # street can be demoted to Tier B on a re-run without hand-editing the cache.
            cache.pop(name, None)
            skipped += 1
            continue
        src = inputs.get(name)
        if not src:
            print(f"  ! {name} not in input file (source changed?) -- skipped")
            continue
        cache[name] = {
            "source_hash": src["source_hash"],
            "sentence": ko,        # primary display text (Korean)
            "sentence_en": en,     # English companion line
            "lang": "ko+en",
            "model": model,
            "generated_at": generated_at,
        }
        written += 1
    cache_path(zone_slug).write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[street_description] applied {written} sentences "
          f"({skipped} left empty -> Tier B), cache now holds {len(cache)} entries.")
    print(f"  -> {cache_path(zone_slug)}")


def status(zone_slug: str) -> None:
    """Routing coverage report, no writes."""
    blog_texts = load_blog_texts(zone_slug)
    wiki_cache = load_wiki_cache(zone_slug)
    cache = load_cache(zone_slug)
    names = visible_names(zone_slug)
    counts = {"A": 0, "B?": 0}
    cached_ok = 0
    for name in names:
        r = route_name(name, blog_texts, wiki_cache)
        counts[r["tier"]] += 1
        if r["tier"] == "A":
            c = cache.get(name)
            if c and c.get("source_hash") == r["source_hash"] and c.get("sentence"):
                cached_ok += 1
    print(f"[street_description] zone '{zone_slug}': {len(names)} visible streets")
    print(f"  Tier A (vibe text): {counts['A']}  |  no vibe text: {counts['B?']}")
    print(f"  Tier A with a fresh cached sentence: {cached_ok}/{counts['A']}")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    zone = sys.argv[2] if len(sys.argv) > 2 else "jongno"
    if cmd == "prepare":
        prepare(zone)
    elif cmd == "status":
        status(zone)
    elif cmd == "apply":
        # generated_at / model are passed on argv so the build stays deterministic.
        gen_at = sys.argv[3] if len(sys.argv) > 3 else "unknown"
        model = sys.argv[4] if len(sys.argv) > 4 else "in-session-llm"
        apply_sentences(zone, gen_at, model)
    else:
        print("usage: python -m offline.street_description "
              "[prepare|status|apply] <zone> [generated_at] [model]")

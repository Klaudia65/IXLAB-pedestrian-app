"""
Per-STREET blog text collector (Naver Blog Search API) -- the production replacement
for the hand-harvested cache/blog-text-{zone}.json prototype.

WHY per street: the unit of analysis for the soft axes (touristy/local,
historic/contemporary, raw/polished) is the STREET, not the shop (see offline/text_axes.py).
So we search blog posts that talk ABOUT each street and keep the descriptive snippets;
the shops on the street influence the text only insofar as bloggers mention them.

Source = Naver Blog Search API (official, free ~25k req/day). Keys in backend/.env as
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (application registered with the "검색" API).
Endpoint: GET https://openapi.naver.com/v1/search/blog.json
    headers: X-Naver-Client-Id, X-Naver-Client-Secret
    params : query, display (<=100), start, sort=sim
Each item carries title / link / description (a ~200-char snippet, with <b> tags) /
bloggername / postdate.

ToS handling: we store only the DERIVED snippet text (title + description that the API
itself returns for display), concatenated per street -- never full post bodies, and the
source is attributable. This feeds street_characters.description via the existing
street_character enrichment step; nothing here is republished.

Output: merges into cache/blog-text-{zone}.json ({street name: text}). Existing (curated)
entries are PRESERVED and appended to, not overwritten, so the hand-tuned prototype text
survives while real blog text is added on top.

RIGHTS / EPHEMERAL DATA: cache/blog-text-{zone}.json holds third-party snippet text and
is treated as EPHEMERAL working data. It is git-ignored and must NEVER be committed. It
exists only to feed the offline condensation batch (offline.street_description); once the
transformative LLM summaries are written to cache/desc-llm-{zone}.json, delete the blog
cache. Only the transformative summaries (and derived keyword fingerprints) are retained.

Run:  python -m offline.scrapers.street_blog_collector                 (dry run: sample 5 streets, print, no write)
      python -m offline.scrapers.street_blog_collector --store          (all streets -> write cache)
      python -m offline.scrapers.street_blog_collector --store --limit 20   (first 20 streets only)
"""

import html
import json
import pathlib
import re
import sys
import time

import psycopg
import requests

from offline.db import get_dsn, get_naver_credentials

ZONE_SLUG = "jongno"
# Query context per zone: appended to the street name so a name collision elsewhere in
# Korea doesn't pollute the results (e.g. "삼청로 종로").
ZONE_QUERY_TERM = {"jongno": "종로"}
BLOG_ENDPOINT = "https://openapi.naver.com/v1/search/blog.json"
DISPLAY = 15               # snippets per street (sort=sim -> most relevant first)
SLEEP_S = 0.12             # be polite to the API between requests
# Keep a returned snippet only if it mentions the study area or the street itself, to
# drop off-topic posts that merely share a common word with the street name.
RELEVANCE_TERMS = ("서울", "종로", "중구")

_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    """Strip the <b> highlight tags and unescape HTML entities the API returns."""
    return html.unescape(_TAG_RE.sub("", text or "")).strip()


def fetch_street_names(zone_slug: str) -> list[str]:
    """Distinct named streets in the zone (the search targets), from street_characters."""
    with psycopg.connect(get_dsn(), connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT name FROM street_characters WHERE zone_slug = %s ORDER BY name",
            (zone_slug,),
        )
        return [r[0] for r in cur.fetchall()]


def search_blog(name: str, zone_term: str, cid: str, csec: str) -> str:
    """Return concatenated relevant snippet text for one street, or '' on no usable hit."""
    params = {"query": f"{name} {zone_term}", "display": DISPLAY, "sort": "sim"}
    headers = {"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec}
    try:
        r = requests.get(BLOG_ENDPOINT, params=params, headers=headers, timeout=20)
    except Exception as e:
        print(f"    ! request failed for {name}: {e}")
        return ""
    if r.status_code == 401:
        raise RuntimeError("Naver API 401 Unauthorized -- check NAVER_CLIENT_ID/SECRET in .env")
    if r.status_code == 429:
        print(f"    ! rate-limited on {name}; backing off 2s")
        time.sleep(2)
        return ""
    if r.status_code != 200:
        print(f"    ! HTTP {r.status_code} for {name}")
        return ""

    items = r.json().get("items", [])
    snippets = []
    for it in items:
        snippet = f"{_clean(it.get('title'))}. {_clean(it.get('description'))}".strip()
        # Relevance guard: the post must mention the area or the street name itself.
        if any(t in snippet for t in RELEVANCE_TERMS) or name in snippet:
            snippets.append(snippet)
    return "\n".join(snippets)


def collect(zone_slug: str = ZONE_SLUG, store: bool = False, limit: int | None = None,
            names_filter: list[str] | None = None) -> None:
    cid, csec = get_naver_credentials()
    zone_term = ZONE_QUERY_TERM.get(zone_slug, "")
    # names_filter: query only these exact street names (targeted test, saves API quota);
    # otherwise every named street in the zone.
    names = names_filter if names_filter else fetch_street_names(zone_slug)
    if limit:
        names = names[:limit]
    print(f"[street_blog] {len(names)} streets to search in '{zone_slug}' "
          f"(query context: '{zone_term}')")

    cache_path = pathlib.Path(__file__).resolve().parents[2] / "cache" / f"blog-text-{zone_slug}.json"
    existing = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    merged = dict(existing)
    merged["_note"] = (
        "Blog snippet text per street, collected from the Naver Blog Search API "
        "(store derived snippets only; attribute source; not full post bodies). "
        "Curated prototype entries are preserved and appended to. Feeds "
        "street_characters.description via offline.street_character."
    )

    n_hit = 0
    counts = {}   # {street name: number of Naver blog posts kept this run}
    for i, name in enumerate(names, 1):
        text = search_blog(name, zone_term, cid, csec)
        if text:
            n_hit += 1
            counts[name] = len([l for l in text.split("\n") if l.strip()])
            prior = existing.get(name, "")
            # Preserve curated text, append fresh blog text (dedupe identical lines).
            lines, seen = [], set()
            for line in filter(None, (prior + "\n" + text).split("\n")):
                if line not in seen:
                    seen.add(line)
                    lines.append(line)
            merged[name] = "\n".join(lines)
        if i <= 5 or i % 50 == 0:
            preview = (text[:70] + "...") if len(text) > 70 else text
            print(f"  [{i}/{len(names)}] {name:<14} {'HIT' if text else 'miss':<4} {preview}")
        time.sleep(SLEEP_S)

    print(f"\n[street_blog] {n_hit}/{len(names)} streets got blog text")
    if store:
        cache_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        # Sidecar: how many blog posts were analysed per street (evidence depth).
        counts_path = cache_path.with_name(f"blog-counts-{zone_slug}.json")
        prior_counts = json.loads(counts_path.read_text(encoding="utf-8")) if counts_path.exists() else {}
        prior_counts.update(counts)   # keep counts for streets not re-queried this run
        counts_path.write_text(json.dumps(prior_counts, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[street_blog] wrote {cache_path} and {counts_path}")
    else:
        print("(dry run -- pass --store to write the cache)")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = sys.argv[1:]
    store = "--store" in args
    limit = None
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    names_filter = None
    if "--names" in args:
        names_filter = [a for a in args[args.index("--names") + 1:] if not a.startswith("--")]
    collect(store=store, limit=limit, names_filter=names_filter)

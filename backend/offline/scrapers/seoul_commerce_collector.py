"""
Commercial-establishments collector for the pilot zone (Jongno-gu, Seoul).

Feeds the Local/Independent <-> Chain/Commercial dimension. Per the cadrage we
abandon OSM here (out of date in Korea) and start from the near-exhaustive
census of the 소상공인시장진흥공단 (Small Enterprise and Markets Service), served on
data.go.kr as B553077/sdsc2. We page `storeListInRectangle` over the pilot bbox;
the API returns name, 3-level 상권업종 category and WGS84 lon/lat per shop.

The census does NOT flag chain vs independent -- that is what this collector
derives (column `is_chain`). CHAIN DETECTION IS THE HARD PART, and the raw data
shapes the method. Real rows look like:

    GS25종로낙원점        (brchNm '')      -- brand + location glued into one string
    GS25종로익선          (brchNm '')
    씨유종로              (brchNm '제일점') -- "CU" written 씨유; location split over both fields
    세븐일레븐종로          (brchNm '3가역점')
    카페헐리우드           (brchNm '')      -- an independent: a one-off name

Two facts kill naive frequency-based detection: (1) each branch glues a DIFFERENT
location onto the brand, so branches never share an exact name; (2) the same
brand is spelled several ways. Counting names would score almost everything as
unique. So the method is, in priority order:

  1. Brand dictionary: a curated set of national brands, matched as a PREFIX of
     the normalized name -- chains lead with the brand ("GS25...", "스타벅스...",
     "씨유..."). Prefix (not substring) keeps false positives low.
  2. Corporate-prefix retry: some records carry the legal name ("한국맥도날드",
     "씨제이올리브영"), so if the plain prefix misses we strip a leading corporate
     token (한국 / 씨제이 / ㈜ ...) and match again.

Frequency (exact-name repeats) was tried as a supplement and DROPPED: audited on
the pilot zone it was mostly false positives -- the "업소명없음" (no-name) placeholder
recurred 32x, and generic independent names (전주집, 힐링, 종로, 상상...) collide by
chance. Flagging those as chains would wrongly push streets of independents toward
the chain pole. For a relative z-score, precision beats recall: recall is
deliberately partial (a hand dictionary can't know every mid-size chain), which is
why segment_scores carries confidence / is_observed and the cadrage plans a spatial
gap-filling pass. Grow SEED_BRANDS to raise recall. brand_count is still stored for
inspection, but is NOT used to decide is_chain.

Run:  python -m offline.scrapers.seoul_commerce_collector            (dry run)
      python -m offline.scrapers.seoul_commerce_collector --store    (write to DB)
"""

import re
import sys
import unicodedata

import requests

from offline.db import get_data_go_kr_key, upsert_commerces

# ---------------------------------------------------------------------------
# 1. CONFIG — same pilot box as osm_green_collector.py / build_zone.py (W,S,E,N).
# ---------------------------------------------------------------------------
API_BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2"
JONGNO_BBOX = (126.97869, 37.56623, 127.01052, 37.58646)  # (W, S, E, N)
ZONE_SLUG = "jongno"
PAGE_SIZE = 1000                 # API accepts up to 1000 rows per page

# Keep only these 상권업종 대분류 (top-level categories). The census lists EVERY
# registered business, including B2B/office types (여행사, 세무사, 경영 컨설팅,
# 광고 대행, 부동산...) that aren't part of the pedestrian streetscape and would
# dilute the chain-vs-independent signal (a street of tax offices would read as
# "very independent" though it isn't a shopping street at all). Restricting to
# 소매 (retail) + 음식 (food/F&B) -- ~60% of rows -- keeps the storefronts a
# pedestrian actually sees. Set to an empty set to keep every category.
KEEP_LCLS = {"소매", "음식"}

# A shop is a chain if its normalized name STARTS WITH one of these brand tokens.
# Tokens are matched after normalize() (NFKC fold, punctuation/space stripped,
# upper-cased), so write them the same way a store name would begin. Keep tokens
# specific enough to avoid a short token swallowing unrelated names. Grow freely.
SEED_BRANDS = [
    # convenience stores
    "GS25", "CU", "씨유", "세븐일레븐", "세븐", "이마트24", "EMART24",
    "미니스톱", "MINISTOP", "스토리웨이",
    # coffee / dessert
    "스타벅스", "STARBUCKS", "이디야", "투썸", "메가커피", "메가엠지씨",
    "컴포즈커피", "컴포즈", "빽다방", "할리스", "HOLLYS", "커피빈", "파스쿠찌",
    "엔젤리너스", "탐앤탐스", "폴바셋", "카페베네", "더벤티", "공차", "GONGCHA",
    "배스킨라빈스", "배스킨", "설빙", "던킨", "DUNKIN",
    # bakery
    "파리바게뜨", "파리바게트", "뚜레쥬르", "뚜레주르", "파리크라상",
    # fast food / franchise food
    "맥도날드", "롯데리아", "버거킹", "맘스터치", "KFC", "써브웨이", "SUBWAY",
    "노브랜드버거", "노브랜드", "본죽", "김밥천국", "김가네", "한솥", "이삭토스트",
    "명랑핫도그", "명랑", "죠스떡볶이", "신전떡볶이",
    # chicken
    "BBQ", "BHC", "교촌", "굽네", "네네", "페리카나", "처갓집", "노랑통닭",
    "또래오래", "자담치킨", "60계",
    # health / beauty / variety retail
    "올리브영", "OLIVEYOUNG", "다이소", "DAISO", "아리따움", "이니스프리",
    "에뛰드", "더페이스샵", "네이처리퍼블릭", "미샤", "토니모리",
]

# Leading corporate/legal tokens some records prepend to the brand (e.g. the legal
# name "한국맥도날드" for 맥도날드). Stripped once before a second prefix match so the
# dictionary still catches the brand underneath. Normalized like the seeds.
CORP_PREFIXES = ["주식회사", "유한회사", "한국", "씨제이", "CJ", "㈜", "주)", "(주)"]


# ---------------------------------------------------------------------------
# 2. NAME NORMALIZATION + CHAIN DETECTION
# ---------------------------------------------------------------------------
_PUNCT_RE = re.compile(r"[\s\-_.,·`'\"~!@#$%^&*()\[\]<>/\\+|:;?]+")


def normalize(name: str) -> str:
    """Fold a store name to a comparable key: NFKC (fullwidth ３ -> 3), strip
    whitespace/punctuation, upper-case. Korean characters are unaffected by
    upper-casing; this only unifies latin/width variants (GS25 vs ＧＳ２５)."""
    s = unicodedata.normalize("NFKC", name or "")
    s = _PUNCT_RE.sub("", s)
    return s.upper()


# Seeds normalized once, longest first so the most specific brand wins the label
# (e.g. "세븐일레븐" before "세븐", "메가커피" before a hypothetical "메가").
_SEED_NORM = sorted({normalize(b) for b in SEED_BRANDS if b}, key=len, reverse=True)
_CORP_NORM = sorted({normalize(p) for p in CORP_PREFIXES if p}, key=len, reverse=True)


def _prefix_hit(name_norm: str) -> str | None:
    for seed in _SEED_NORM:
        if seed and name_norm.startswith(seed):
            return seed
    return None


def seed_match(name_norm: str) -> str | None:
    """Return the matched brand token, else None. Tries the plain name first, then
    once more after stripping a leading corporate token (한국맥도날드 -> 맥도날드)."""
    hit = _prefix_hit(name_norm)
    if hit is not None:
        return hit
    for corp in _CORP_NORM:
        if name_norm.startswith(corp) and len(name_norm) > len(corp):
            return _prefix_hit(name_norm[len(corp):])
    return None


def classify(rows: list[dict]) -> None:
    """Fill is_chain / chain_reason / brand_count on rows in place.

    is_chain is decided by the brand dictionary only (see module docstring on why
    frequency was dropped). brand_count = how many times this exact normalized name
    recurs in the zone, stored for inspection but not used in the decision.
    """
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["brand_key"]] = counts.get(r["brand_key"], 0) + 1

    for r in rows:
        r["brand_count"] = counts.get(r["brand_key"], 0)
        if seed_match(r["brand_key"]) is not None:
            r["is_chain"], r["chain_reason"] = True, "seed"
        else:
            r["is_chain"], r["chain_reason"] = False, None


# ---------------------------------------------------------------------------
# 3. FETCH — page storeListInRectangle over the pilot bbox.
# ---------------------------------------------------------------------------
def fetch_page(key: str, bbox, page_no: int, num_rows: int) -> dict:
    w, s, e, n = bbox
    params = {
        "serviceKey": key, "type": "json",
        "pageNo": page_no, "numOfRows": num_rows,
        "minx": w, "miny": s, "maxx": e, "maxy": n,
    }
    resp = requests.get(f"{API_BASE}/storeListInRectangle", params=params, timeout=120)
    resp.raise_for_status()
    body = resp.json()
    header = body.get("header", {})
    if header.get("resultCode") not in ("00", None):
        raise RuntimeError(f"data.go.kr error {header.get('resultCode')}: {header.get('resultMsg')}")
    return body


def _to_row(it: dict) -> dict | None:
    """Shape one API item into a commerces row, or None if it has no coordinates."""
    try:
        lng, lat = float(it["lon"]), float(it["lat"])
    except (TypeError, ValueError, KeyError):
        return None

    name = it.get("bizesNm") or ""
    brch = it.get("brchNm") or ""
    # brand_key = normalized store name only (NOT the branch): the branch field is
    # the location noise we want to ignore, and chains lead with the brand anyway.
    return {
        "shop_id": it.get("bizesId"),
        "name": name,
        "branch_name": brch or None,
        "brand_key": normalize(name),
        "is_chain": False,          # filled by classify()
        "chain_reason": None,
        "brand_count": None,
        "inds_lcls_nm": it.get("indsLclsNm") or None,
        "inds_mcls_nm": it.get("indsMclsNm") or None,
        "inds_scls_nm": it.get("indsSclsNm") or None,
        "signgu_nm": it.get("signguNm") or None,
        "adong_nm": it.get("adongNm") or None,
        "lng": lng,
        "lat": lat,
        "zone_slug": ZONE_SLUG,
        "stdr_ym": None,            # filled from the response header below
        "source": "sbdc",
    }


def fetch_all(key: str, bbox) -> tuple[list[dict], str | None]:
    first = fetch_page(key, bbox, 1, PAGE_SIZE)
    total = first.get("body", {}).get("totalCount", 0)
    stdr_ym = first.get("header", {}).get("stdrYm")
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    print(f"[commerce] {total} shops in pilot bbox (quarter {stdr_ym}) -> {pages} page(s)")

    rows: list[dict] = []
    for page_no in range(1, pages + 1):
        body = first if page_no == 1 else fetch_page(key, bbox, page_no, PAGE_SIZE)
        items = body.get("body", {}).get("items", []) or []
        if isinstance(items, dict):     # defensive: a 1-item page can come back unwrapped
            items = [items]
        # Category filter first (KEEP_LCLS), then shape rows that have coordinates.
        if KEEP_LCLS:
            items = [it for it in items if it.get("indsLclsNm") in KEEP_LCLS]
        kept = [row for it in items if (row := _to_row(it)) is not None]
        rows.extend(kept)
        print(f"  page {page_no}/{pages}: {len(items)} kept in category, {len(kept)} with coordinates")

    for r in rows:
        r["stdr_ym"] = stdr_ym
    return rows, stdr_ym


# ---------------------------------------------------------------------------
# 4. ENTRY POINT
# ---------------------------------------------------------------------------
def collect(store: bool = False) -> list[dict]:
    key = get_data_go_kr_key()
    rows, _ = fetch_all(key, JONGNO_BBOX)
    classify(rows)

    n_chain = sum(1 for r in rows if r["is_chain"])
    share = n_chain / len(rows) if rows else 0
    print(f"\n[commerce] {len(rows)} shops | {n_chain} chain ({share:.1%} by dictionary) "
          f"| {len(rows) - n_chain} independent")

    if store:
        n = upsert_commerces(rows)
        print(f"\nUpserted {n} shops into PostGIS (table 'commerces').")
    else:
        print("\n(dry run — pass --store to write into PostGIS)")
    return rows


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        collect(store="--store" in sys.argv)
    except requests.RequestException as exc:
        print(f"Network/API error: {exc}", file=sys.stderr)
        sys.exit(1)

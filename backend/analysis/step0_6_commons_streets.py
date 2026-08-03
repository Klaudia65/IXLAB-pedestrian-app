"""
Step 0.6 - Pull a few reusable STREET-SCENE photos of Jongno from Wikimedia
Commons (CC / public-domain, so legally usable in the app), for the swipe.

Commons geolocated files in this bbox are ~80% car-spotter shots and the rest
cluster on landmarks. So we: geosearch the bbox, drop vehicles / portraits /
indoor / pure-monument shots, keep street-scene titles (streets, alleys, -ro/-gil,
walkable districts: Insadong, Bukchon, Samcheong, Ikseon, Euljiro...), DEDUPE for
variety, download ~16 thumbnails, snap each to its nearest scored street, and
build a gallery so the user can keep the 5-10 good ones.

Output: out/commons_check/ (images/ + manifest.json + index.html), same shape as
step0_5. Metadata carries the Commons author + licence for attribution.

Run (from backend/):  .venv/Scripts/python.exe analysis/step0_6_commons_streets.py
"""
import json
import math
import re
import sys
import time
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import Point

sys.stdout.reconfigure(encoding="utf-8")  # console may be cp949 on Windows

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SCORES = REPO / "web" / "frontend" / "scores-named-streets-jongno.geojson"
OUT_DIR = HERE / "out" / "commons_check"
IMG_DIR = OUT_DIR / "images"
METRIC = 5179
SNAP_MAX_M = 40
WANT = 16                                   # how many to download for review
BBOX = (126.97869, 37.56623, 127.01052, 37.58646)
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "IXLAB-pedestrian-app/0.1 (research; kubale.klaudia@proton.me)"}

AXES = [
    ("touristy_local", "Touristy", "Local"),
    ("historic_contemporary", "Historic", "Contemporary"),
    ("raw_polished", "Raw", "Polished"),
    ("quiet_lively", "Quiet", "Lively"),
    ("local_chain", "Independent", "Chain"),
    ("park", "No park", "By a park"),
]

VEHICLE = re.compile(
    r"\b(audi|bmw|mercedes|benz|maybach|volkswagen|vw|porsche|hyundai|kia|genesis|"
    r"ssangyong|renault|samsung sm|sm[357]\b|daewoo|chevrolet|chevy|gmc|cadillac|"
    r"ford|jeep|tesla|land rover|range rover|rolls|bentley|ferrari|lamborghini|"
    r"maserati|jaguar|mini|peugeot|citro|opel|skoda|\bseat\b|volvo|toyota|lexus|"
    r"honda|nissan|infiniti|mazda|subaru|mitsubishi|isuzu|scania|hino|iveco|aston|"
    r"lincoln|chrysler|\bram\b|polestar|dodge|buick|acura|rivian|byd|fiat|500c|"
    r"motorcycle|scooter|vespa|harley|yamaha|kawasaki|ducati|\bbus\b|truck|taxi)\b",
    re.I)
BADCTX = re.compile(
    r"\b(cosplay|portrait|model|actor|actress|singer|idol|fansign|award|concert|"
    r"conference|interior|inside|exhibition|indoor|\broom\b|cake|logo|diagram|"
    r"plaque|poster|banner|food|dish|bingsu|noodle)\b", re.I)
STREET = re.compile(
    r"(street|alley|streetscape|sidewalk|hanok|-?ro\b|-?gil\b|insadong|bukchon|"
    r"samcheong|ikseon|nagwon|nakwon|euljiro|pimat|donhwamun|jongno|거리|골목|길|로)",
    re.I)
LANDMARK = re.compile(
    r"(gyeongbok|changdeok|changgyeong|deoksugung|jongmyo|\bgung\b|palace|\bgate\b|"
    r"sungnyemun|heunginjimun|shrine|temple|tower|cathedral|church|statue|monument|"
    r"museum)", re.I)


def clean(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def geosearch(cell):
    w, s, e, n = cell
    r = requests.get(API, params={"action": "query", "format": "json",
        "list": "geosearch", "gsnamespace": 6, "gsbbox": f"{n}|{w}|{s}|{e}",
        "gslimit": 500}, headers=UA, timeout=60)
    r.raise_for_status()
    return r.json().get("query", {}).get("geosearch", [])


def gather(cell, depth=0):
    res = geosearch(cell); time.sleep(0.04)
    if len(res) >= 500 and depth < 3:
        w, s, e, n = cell; mx, my = (w + e) / 2, (s + n) / 2
        out = {}
        for q in [(w, s, mx, my), (mx, s, e, my), (w, my, mx, n), (mx, my, e, n)]:
            out.update(gather(q, depth + 1))
        return out
    return {i["pageid"]: i for i in res}


def is_street(title):
    t = title[5:] if title.startswith("File:") else title
    if VEHICLE.search(t) or BADCTX.search(t):
        return False
    return bool(STREET.search(t)) and not LANDMARK.search(t)


def stem(title):
    """Normalise a title so near-duplicate series collapse to one key."""
    t = title[5:].lower()
    t = re.sub(r"\.(jpg|jpeg|png)$", "", t)
    t = re.sub(r"[-_ ]*panoramio.*$", "", t)
    t = re.sub(r"[\(\d].*$", "", t)          # drop "(3)", dates, numbers
    return re.sub(r"[^a-z가-힣]+", "", t)[:16]


def imageinfo(titles):
    out = {}
    for i in range(0, len(titles), 40):
        r = requests.get(API, params={"action": "query", "format": "json",
            "titles": "|".join(titles[i:i + 40]), "prop": "imageinfo",
            "iiprop": "url|size|extmetadata", "iiurlwidth": 1024},
            headers=UA, timeout=60)
        for p in r.json().get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            em = ii.get("extmetadata", {})
            artist = re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip()
            out[p["title"]] = {
                "thumb": ii.get("thumburl"), "w": ii.get("width"),
                "h": ii.get("height"),
                "lic": em.get("LicenseShortName", {}).get("value", "?"),
                "artist": artist[:80],
            }
    return out


def download(url, dest):
    r = requests.get(url, headers=UA, timeout=120, stream=True)
    r.raise_for_status()
    with open(dest, "wb") as fh:
        for c in r.iter_content(8192):
            fh.write(c)


def nearest_street(streets_m, lon, lat):
    pt = gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(METRIC).iloc[0]
    d = streets_m.geometry.distance(pt)
    i = d.idxmin()
    return streets_m.loc[i], float(d.loc[i])


def main():
    w, s, e, n = BBOX
    seen = {}
    step = 0.008
    x = w
    while x < e:
        y = s
        while y < n:
            seen.update(gather((x, y, min(x + step, e), min(y + step, n))))
            y += step
        x += step
    cand = [i for i in seen.values() if is_street(i["title"])]
    print(f"{len(seen)} geotagged files -> {len(cand)} street-scene candidates")

    # dedupe: at most 2 per title-stem, and not two within 25 m of each other
    picked, used_stem, used_xy = [], {}, []
    for i in sorted(cand, key=lambda z: z["title"]):
        k = stem(i["title"])
        if used_stem.get(k, 0) >= 2:
            continue
        xy = (i["lat"], i["lon"])
        if any(abs(xy[0] - a) < 2e-4 and abs(xy[1] - b) < 2.5e-4 for a, b in used_xy):
            continue
        picked.append(i); used_stem[k] = used_stem.get(k, 0) + 1; used_xy.append(xy)
        if len(picked) >= WANT:
            break
    print(f"Downloading {len(picked)} diverse candidates ...")

    info = imageinfo([i["title"] for i in picked])
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMG_DIR.glob("*.jpg"):
        try: old.unlink()
        except OSError: pass

    streets = gpd.read_file(SCORES).to_crs(METRIC)
    records = []
    for i in picked:
        m = info.get(i["title"], {})
        if not m.get("thumb"):
            continue
        fid = str(i["pageid"])
        img_file = f"images/{fid}.jpg"
        try:
            download(m["thumb"], OUT_DIR / img_file)
        except Exception as ex:
            print("  dl fail", i["title"], ex); continue
        row, dist = nearest_street(streets, i["lon"], i["lat"])
        matched = dist <= SNAP_MAX_M
        scores = {k: (None if clean(row[k]) is None else round(float(row[k]), 3))
                  for k, _, _ in AXES} if matched else None
        records.append({
            "id": fid, "title": i["title"][5:], "lon": i["lon"], "lat": i["lat"],
            "image": img_file, "license": m.get("lic"), "artist": m.get("artist"),
            "commons": "https://commons.wikimedia.org/wiki/" + i["title"].replace(" ", "_"),
            "street": row["name"] if matched else None,
            "street_dist_m": round(dist, 1), "scores": scores,
        })
        print(f"  ok  {i['title'][5:][:50]:50s} -> {row['name'] if matched else '(far)'} {dist:.0f}m")

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"axes": AXES, "images": records}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    write_html(records)
    print(f"\n{len(records)} images saved. Open {OUT_DIR / 'index.html'}")


def write_html(records):
    data = json.dumps(records, ensure_ascii=False)
    axes = json.dumps(AXES, ensure_ascii=False)
    html = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Commons street photos — Jongno</title>
<style>
:root{--bg:#faf8f4;--card:#fff;--ink:#2c2a26;--mut:#8a857c;--line:#e7e2d8;
--neg:#c9603f;--pos:#2f7d8f;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px}p.sub{color:var(--mut);margin:0 0 20px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.card img{width:100%;height:230px;object-fit:cover;background:#eee;display:block}
.body{padding:12px 14px 14px}
.name{font-weight:600;font-size:15px}
.meta{color:var(--mut);font-size:12px;margin:3px 0 10px}
.lic{display:inline-block;background:#eef3f2;color:#2f7d8f;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600}
.tag{display:inline-block;background:#f1ede4;border-radius:5px;padding:1px 6px;font-size:11px;color:var(--mut);margin-left:6px}
.axis{display:grid;grid-template-columns:74px 1fr 74px;align-items:center;gap:8px;margin:5px 0;font-size:11.5px}
.axis .lbl{color:var(--mut)}.axis .lbl.r{text-align:right}
.bar{position:relative;height:14px;background:#f1ede4;border-radius:7px}
.bar .mid{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#cfc9bd}
.bar .fill{position:absolute;top:2px;bottom:2px;border-radius:5px}
.val{font-size:10.5px;color:var(--mut);text-align:center;margin-top:1px}
.na{color:var(--mut);font-style:italic;font-size:11px}
a{color:var(--pos)}
</style></head><body>
<h1>Wikimedia Commons — Jongno street scenes</h1>
<p class="sub">Reusable CC / public-domain candidates (not landmarks, not cars).
Keep the 5–10 that really show a street. Each is snapped to its nearest scored
street. Attribution (author + licence) is shown for legal reuse.</p>
<div class="grid" id="grid"></div>
<script>
const DATA=__DATA__, AXES=__AXES__, g=document.getElementById('grid');
function bar(v){ if(v==null) return '<div class="na">—</div>';
 const p=Math.abs(v)*50,c=v>=0?'var(--pos)':'var(--neg)',
 s=v>=0?`left:50%;width:${p}%`:`right:50%;width:${p}%`;
 return `<div class="bar"><div class="mid"></div><div class="fill" style="${s};background:${c}"></div></div><div class="val">${v>0?'+':''}${v}</div>`;}
for(const r of DATA){
 const c=document.createElement('div');c.className='card';
 let ax='';
 if(r.scores){for(const[k,ng,ps]of AXES){ax+=`<div class="axis"><span class="lbl">${ng}</span><div>${bar(r.scores[k])}</div><span class="lbl r">${ps}</span></div>`;}}
 else ax='<div class="na">No scored street within range.</div>';
 const st=r.street?`<span class="tag">${r.street} · ${r.street_dist_m} m</span>`:`<span class="tag">unmatched ${r.street_dist_m} m</span>`;
 c.innerHTML=`<img src="${r.image}"><div class="body">
  <div class="name">${r.title}</div>
  <div class="meta"><span class="lic">${r.license||'?'}</span> ${st}<br>
   ${r.artist?('© '+r.artist+' · '):''}<a href="${r.commons}" target="_blank">Commons ↗</a></div>
  ${ax}</div>`;
 g.appendChild(c);
}
</script></body></html>"""
    (OUT_DIR / "index.html").write_text(
        html.replace("__DATA__", data).replace("__AXES__", axes), encoding="utf-8")


if __name__ == "__main__":
    main()

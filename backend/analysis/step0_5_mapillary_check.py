"""
Step 0.5 - Sanity-check Mapillary imagery against the per-street score vectors.

Goal (validation, not production): for a hand-picked list of Mapillary image
IDs, pull the photo + its GPS point, snap it to the nearest named street of the
Jongno study area, and lay the street's 6 experiential scores next to the image
so a human can eyeball whether the picture actually *looks* like what the scores
say (e.g. does a street scored "historic + raw" really look old and unpolished?).

For each image ID we:
  1. query the Mapillary Graph API for geometry + thumbnail URL + camera heading,
  2. download the thumbnail into  out/mapillary_check/images/<id>.jpg,
  3. find the nearest street in scores-named-streets-jongno.geojson (distance in
     metres, EPSG:5179) and read its score vector,
  4. write a manifest.json + a self-contained index.html gallery.

null score = "not measured" (honesty garde-fou) -> shown as "—", NOT as a pole.
Value -1 is a genuine pole (touristy / historic / raw / independent / no-park).

Run:  backend/.venv/Scripts/python.exe -m analysis.step0_5_mapillary_check
      (from the backend/ directory)  OR  python step0_5_mapillary_check.py
"""

import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import requests
from PIL import Image
from shapely.geometry import Point


def clean(v):
    """geopandas reads JSON null as NaN -> normalise back to None."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return v

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent  # .../IXLAB-pedestrian-app
SCORES = REPO / "web" / "frontend" / "scores-named-streets-jongno.geojson"
OUT_DIR = HERE / "out" / "mapillary_check"
IMG_DIR = OUT_DIR / "images"
METRIC = 5179  # Korea 2000 / Central Belt, metres
SNAP_MAX_M = 40  # beyond this the street match is probably meaningless

# Image IDs to check (given by the user).
IMAGE_IDS = [
    "1325942799377316", "913715791647553", "1247534357595968", "229147956344960",
    "178230961726166", "1778692433102699", "830806842673657", "1175838890376715",
    "1006270133801651", "642883701849178", "1973956346681852", "26581196581506509",
    "1305602044901844", "1281347694160990", "1026409559902948", "1048242196417295",
    "1049781256800575", "1048790993702047",
    "484763404398318", "2119683545535612", "919166087769798", "1722868688600244",
]

# The 6 bipolar score axes, with human labels for the negative / positive pole.
# Sign convention matches the repo (+ = the SECOND pole word).
AXES = [
    ("touristy_local",        "Touristy",   "Local"),
    ("historic_contemporary", "Historic",   "Contemporary"),
    ("raw_polished",          "Raw",        "Polished"),
    ("quiet_lively",          "Quiet",      "Lively"),
    ("local_chain",           "Independent", "Chain"),
    ("park",                  "No park",    "By a park"),
]


def load_token():
    for line in (HERE.parent / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("MAPILLARY_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("MAPILLARY_TOKEN not found in backend/.env")


def fetch_image_meta(image_id, token):
    """Return the Mapillary Graph API record for one image."""
    url = f"https://graph.mapillary.com/{image_id}"
    fields = "id,captured_at,compass_angle,geometry,thumb_1024_url,is_pano,camera_type"
    r = requests.get(url, params={"fields": fields},
                     headers={"Authorization": f"OAuth {token}"}, timeout=60)
    r.raise_for_status()
    return r.json()


def reproject_pano(src, dst, yaw_deg=0.0, pitch_deg=0.0,
                   fov_h_deg=105.0, out_w=1024, out_h=768):
    """Turn an equirectangular 360 into a natural pinhole view.

    Mapillary spherical images are stored equirectangular with the image CENTRE
    column facing `compass_angle` (the camera's forward heading) — same meaning
    as compass_angle for a flat photo. So yaw_deg=0 looks straight ahead, i.e.
    down the direction of travel (usually along the street), de-warping the
    stretched centre band into an ordinary-looking photo.
    """
    eq = np.asarray(Image.open(src).convert("RGB"))
    H, W = eq.shape[:2]
    f = (out_w / 2) / math.tan(math.radians(fov_h_deg) / 2)

    u = np.arange(out_w) - out_w / 2 + 0.5
    v = np.arange(out_h) - out_h / 2 + 0.5
    uu, vv = np.meshgrid(u, v)                      # camera image plane
    x, y, z = uu, vv, np.full_like(uu, f)          # x right, y down, z forward

    p, ya = math.radians(pitch_deg), math.radians(yaw_deg)
    y, z = y * math.cos(p) - z * math.sin(p), y * math.sin(p) + z * math.cos(p)
    x, z = x * math.cos(ya) + z * math.sin(ya), -x * math.sin(ya) + z * math.cos(ya)

    lon = np.arctan2(x, z)                          # 0 at centre, + to the right
    lat = np.arctan2(y, np.sqrt(x * x + z * z))     # + downward
    col = np.clip((lon / (2 * np.pi) + 0.5) * W, 0, W - 1).astype(np.int32)
    row = np.clip((lat / np.pi + 0.5) * H, 0, H - 1).astype(np.int32)
    Image.fromarray(eq[row, col]).save(dst, quality=88)


def download(url, dest):
    r = requests.get(url, timeout=120, stream=True)
    r.raise_for_status()
    with open(dest, "wb") as fh:
        for chunk in r.iter_content(8192):
            fh.write(chunk)


def nearest_street(streets_m, lon, lat):
    """(row, distance_m) of the closest street to a WGS84 point."""
    pt = gpd.GeoSeries([Point(lon, lat)], crs=4326).to_crs(METRIC).iloc[0]
    d = streets_m.geometry.distance(pt)
    i = d.idxmin()
    return streets_m.loc[i], float(d.loc[i])


def main():
    token = load_token()
    # Clean previous images but keep the folder (Windows/OneDrive can lock the
    # dir itself, e.g. if a local http.server has its cwd here).
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMG_DIR.glob("*.jpg"):
        try:
            old.unlink()
        except OSError:
            pass

    streets = gpd.read_file(SCORES)
    streets_m = streets.to_crs(METRIC)
    print(f"Loaded {len(streets)} named streets from {SCORES.name}")

    records = []
    for img_id in IMAGE_IDS:
        print(f"\n[{img_id}]")
        try:
            meta = fetch_image_meta(img_id, token)
        except Exception as e:
            print(f"  ! API error: {e}")
            records.append({"id": img_id, "error": str(e)})
            continue

        geom = meta.get("geometry")
        if not geom:
            print("  ! no geometry returned (image private or deleted?)")
            records.append({"id": img_id, "error": "no geometry"})
            continue
        lon, lat = geom["coordinates"]

        # download thumbnail
        img_file = None
        view_file = None
        is_pano = bool(meta.get("is_pano"))
        thumb = meta.get("thumb_1024_url")
        if thumb:
            img_file = f"images/{img_id}.jpg"
            try:
                download(thumb, OUT_DIR / img_file)
                print(f"  image saved -> {img_file}")
                # 360 pano: reproject the stretched centre into a normal view
                # looking straight ahead (down the street) so it's readable.
                if is_pano:
                    view_file = f"images/{img_id}_view.jpg"
                    reproject_pano(OUT_DIR / img_file, OUT_DIR / view_file)
                    print(f"  360 reframed -> {view_file}")
            except Exception as e:
                print(f"  ! image handling failed: {e}")
                img_file = img_file if (OUT_DIR / (img_file or "x")).exists() else None

        # snap to nearest scored street
        row, dist = nearest_street(streets_m, lon, lat)
        matched = dist <= SNAP_MAX_M
        scores = {k: (None if clean(row[k]) is None else round(float(row[k]), 3))
                  for k, _, _ in AXES}
        name = row["name"]
        print(f"  lon,lat = {lon:.6f},{lat:.6f}")
        print(f"  nearest street: {name}  ({dist:.1f} m"
              f"{'' if matched else '  -> TOO FAR, ignore'})")
        if matched:
            print(f"  scores: " + ", ".join(
                f"{k}={scores[k]}" for k, _, _ in AXES))

        records.append({
            "id": img_id,
            "lon": lon, "lat": lat,
            "captured_at": meta.get("captured_at"),
            "compass_angle": meta.get("compass_angle"),
            "is_pano": is_pano,
            "image": img_file,
            "view": view_file,
            "street": name if matched else None,
            "street_dist_m": round(dist, 1),
            "n_blogs": (None if clean(row.get("n_blogs")) is None
                        else int(row["n_blogs"])) if matched else None,
            "scores": scores if matched else None,
        })

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"axes": AXES, "snap_max_m": SNAP_MAX_M, "images": records},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    write_html(records)
    ok = sum(1 for r in records if r.get("street"))
    print(f"\nDone: {ok}/{len(IMAGE_IDS)} images snapped to a street "
          f"(<= {SNAP_MAX_M} m).")
    print(f"Open  {OUT_DIR / 'index.html'}")


def write_html(records):
    """Self-contained gallery: image next to its street's score bars."""
    data = json.dumps(records, ensure_ascii=False)
    axes = json.dumps(AXES, ensure_ascii=False)
    html = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mapillary vs street scores — check</title>
<style>
:root{--bg:#faf8f4;--card:#fff;--ink:#2c2a26;--mut:#8a857c;--line:#e7e2d8;
--neg:#c9603f;--pos:#2f7d8f;--none:#d8d3c8;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px}
p.sub{color:var(--mut);margin:0 0 20px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
overflow:hidden;display:flex;flex-direction:column}
.imgwrap{position:relative}
.card img{width:100%;height:220px;object-fit:cover;background:#eee;display:block}
.pano{position:absolute;top:8px;left:8px;background:rgba(47,125,143,.92);color:#fff;
font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:5px;letter-spacing:.02em}
.body{padding:12px 14px 14px}
.name{font-weight:600;font-size:16px}
.meta{color:var(--mut);font-size:12.5px;margin:2px 0 10px}
.far{color:var(--neg);font-weight:600}
.axis{display:grid;grid-template-columns:74px 1fr 74px;align-items:center;
gap:8px;margin:5px 0;font-size:11.5px}
.axis .lbl{color:var(--mut)}
.axis .lbl.r{text-align:right}
.bar{position:relative;height:14px;background:#f1ede4;border-radius:7px}
.bar .mid{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#cfc9bd}
.bar .fill{position:absolute;top:2px;bottom:2px;border-radius:5px}
.val{font-size:10.5px;color:var(--mut);text-align:center;margin-top:1px}
.na{color:var(--mut);font-style:italic;font-size:11px}
.tag{display:inline-block;background:#f1ede4;border-radius:5px;padding:1px 6px;
font-size:11px;color:var(--mut);margin-left:6px}
a.mly{font-size:11.5px;color:var(--pos);text-decoration:none}
</style></head><body>
<h1>Mapillary images vs. street score vectors</h1>
<p class="sub">Each photo is snapped to the nearest named street; its 6 scores are
shown below. Blue = positive pole, orange = negative pole, grey = not measured.
Check: does the picture <em>look</em> like the scores claim?</p>
<div class="grid" id="grid"></div>
<script>
const DATA=__DATA__, AXES=__AXES__;
const g=document.getElementById('grid');
function bar(v){
  if(v==null) return '<div class="na">— not measured</div>';
  const pct=Math.abs(v)*50, col=v>=0?'var(--pos)':'var(--neg)';
  const style=v>=0?`left:50%;width:${pct}%`:`right:50%;width:${pct}%`;
  return `<div class="bar"><div class="mid"></div>
    <div class="fill" style="${style};background:${col}"></div></div>
    <div class="val">${v>0?'+':''}${v}</div>`;
}
for(const r of DATA){
  const card=document.createElement('div'); card.className='card';
  const shown=r.view||r.image;
  const badge=r.view?`<span class="pano" title="360° reframed to a forward view">360° ↦ view</span>`:'';
  const orig=r.view?` · <a class="mly" href="${r.image}" target="_blank">full 360 ↗</a>`:'';
  const img=shown?`<div class="imgwrap">${badge}<img src="${shown}"></div>`
    :`<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#aaa">no image</div>`;
  let axesHtml='';
  if(r.scores){
    for(const [k,neg,pos] of AXES){
      const v=r.scores[k];
      axesHtml+=`<div class="axis"><span class="lbl">${neg}</span>
        <div>${bar(v)}</div><span class="lbl r">${pos}</span></div>`;
    }
  } else {
    axesHtml=`<div class="na">No scored street close enough — not matched.</div>`;
  }
  const far=r.street_dist_m!=null && !r.street ?
    `<span class="far">nearest ${r.street_dist_m} m — too far</span>`:'';
  const dist=r.street?`<span class="tag">${r.street_dist_m} m</span>`:'';
  const blogs=r.n_blogs?`<span class="tag">${r.n_blogs} blogs</span>`:'';
  const head=r.compass_angle!=null?`heading ${Math.round(r.compass_angle)}°`:'';
  card.innerHTML=img+`<div class="body">
    <div class="name">${r.street||'(unmatched)'}${dist}${blogs}</div>
    <div class="meta">id ${r.id} · ${head} ${far}
      · <a class="mly" href="https://www.mapillary.com/app/?pKey=${r.id}&focus=photo"
        target="_blank">open in Mapillary ↗</a>${orig}</div>
    ${axesHtml}</div>`;
  g.appendChild(card);
}
</script></body></html>"""
    html = html.replace("__DATA__", data).replace("__AXES__", axes)
    (OUT_DIR / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()

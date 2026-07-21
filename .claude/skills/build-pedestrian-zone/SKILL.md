---
name: build-pedestrian-zone
description: >-
  Build the clean pedestrian network for a defined zone in Seoul from OSM + the
  Seoul city walking dataset (TbTraficWlkNet), store it in PostGIS, and render a
  clean MapLibre HTML page for it. Use when the user wants to collect / map
  pedestrian paths or the walking network for a neighborhood, district, or bbox
  — the same "clean" style as map-with-paths-only-osm-and-seoulcity.html (no
  double paths, park paths kept, routes labelled by type).
---

# Build a clean pedestrian zone (OSM + Seoul city)

This skill reproduces the proven "clean" recipe from
`web/frontend/map-with-paths-only-osm-and-seoulcity.html`, but parameterized by
**zone** (a bbox + a Seoul district name) instead of the hardcoded pilot area.
One command fetches the paths, stores them in PostGIS, exports GeoJSON, and
writes a ready-to-open page.

## The "clean" rules (why it looks clean — do not break these)

1. **OSM is the backbone GRAPH, built with osmnx — not raw Overpass ways.**
   `osmnx.graph_from_bbox(..., simplify=True, retain_all=True)` produces a
   *topological, deduped* graph → **no double / overlapping paths** (the raw
   `osm_paths_collector.py` returns overlapping ways and must NOT be used here).
2. **A permissive highway filter** (`WALK_FILTER` in `build_zone.py`) is used
   instead of osmnx's `network_type="walk"`, because the built-in walk filter
   drops `area=yes` / `foot=no` / `access=private` ways and would silently
   delete ~half the footpaths **inside enclosed parks & shrines**. Keeping the
   permissive filter is what makes "paths even in private parks" appear.
3. **Walkable streets are kept** (residential/service/primary…) so the graph
   stays connected; edges are bucketed **pedestrian / street / steps** and each
   bucket is coloured differently → the "different routes label" the user wants.
4. **Seoul is a separate FLAG layer, never merged into OSM.** Merging the two
   geometries is exactly what would create visual double-paths. Instead the
   Seoul links sit *under* OSM, **hidden by default**, and only contribute
   attribute flags (crosswalk / park / bridge / tunnel). They are clipped to the
   zone bbox.

## What it touches

- **DB (PostGIS, table defs in `backend/sql/init.sql`):**
  - `osm_network` — the clean osmnx graph edges (edge_id `{u}-{v}-{key}`,
    globally stable so overlapping zones dedupe instead of duplicating).
  - `walk_links` — the Seoul links with their 7 pedestrian flags (existing).
- **`web/frontend/`:** `network-osm-<slug>.geojson`, `network-seoul-<slug>.geojson`,
  and the page `zone-<slug>.html`.
- Driver: `backend/zones/build_zone.py`; template: `backend/zones/template.html`.

## How to run it

Prereqs (all already set up in this repo):
- The analysis venv (`backend/.venv`, Python 3.14) with **osmnx, geopandas,
  networkx, shapely** installed.
- **PostGIS up** (`docker compose up -d db`) with `init.sql` applied. If the
  `osm_network` table is missing (init.sql only runs on a fresh volume), apply it
  once to the running DB — it is idempotent (`CREATE TABLE IF NOT EXISTS`).
- `SEOUL_API_KEY` present in `backend/.env` (used for the Seoul dataset).

From the `backend/` folder, with the venv active:

```bash
python -m zones.build_zone \
  --slug bukchon \
  --district 종로구 \
  --bbox 126.97869 37.56623 127.01052 37.58646 \
  --title "Bukchon–Anguk–Insadong" \
  --kicker "zone d'étude · Jongno-gu"
```

Arguments:
- `--slug`      short id for the output filenames (e.g. `bukchon`).
- `--district`  Seoul district **NAME** in Korean, e.g. `종로구`. The numeric SGG
  code does **not** work with the API — the name is the positional filter.
- `--bbox W S E N`  WGS84 bbox: west south east north (lon lon lat lat order:
  W S E N). This is the zone; both layers are clipped/queried to it.
- `--title`     page `<title>` / `h1` (defaults to the slug).
- `--kicker`    small uppercase label above the title.
- `--skip-db`   optional; skip PostGIS and export straight from memory (quick
  preview when the DB is not running).

Then serve `web/frontend/` over **http://** (not `file://`, or the `fetch()` of
the GeoJSON is blocked) and open `zone-<slug>.html`.

## Notes / gotchas

- The Seoul dataset is **regenerated daily** and paged by index, so a huge
  district can slightly over/under-count across pages; fine for a pilot zone.
- The Overpass-based `osm_paths_collector.py` is a *different, older* path (raw
  ways, has duplicates). This skill deliberately uses osmnx instead — do not
  swap it back in.
- To pick a bbox for a new neighborhood, read it off the map or from an existing
  zone; keep it modest (a few km²) so the graph stays a single connected area
  and the osmnx fetch stays fast.
- Reference memory: study-area-network, offline-pipeline (in the user's memory).

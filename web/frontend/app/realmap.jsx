/* ============================================================
   2 — DETAILED MAP · REAL DATA + UNIFIED SEARCH
   Replaces the hand-drawn SVG map (map2.jsx) with a real
   MapLibre map of Jongno, styled in the Wander teal palette.

   The search resolves everything the user types into ONE kind
   of result — candidate STREETS — via three paths (see the
   flow diagram):
     · vibe     → the sliders' 6 axes → NLP-scored named streets
     · function → "bakery / restos" → streets whose aggregated
                  commerce signature matches that category
     · place    → a street/park name → name lookup in OSM data
     · dong     → a neighbourhood name ("인사동", "Bukchon") → zoom the map to
                  that neighbourhood (dong-jongno.geojson: precise 법정동 points +
                  a few 행정동 polygons — see backend/offline/dong_boundaries.py)

   Data (all local geojson in web/frontend/):
     street-character-jongno.geojson  → base streets + function + place
     scores-named-streets-jongno.geojson → the 3 NLP vibe axes
     green-jongno.geojson             → park / greenery context
   ============================================================ */

/* ---- Wander palette, as literal hexes (MapLibre paint can't read CSS vars) ---- */
const MAP_PAL = {
  land: '#DFF1F1', land2: '#CDE9E9', card: '#FFFFFF', card2: '#EAF7F7',
  ink: '#143229', inkSoft: '#255A4B', inkFaint: '#5E8A7C',
  accent: '#4456FF', park: '#A6FFE8', water: '#9FA3FF', good: '#34C38F',
  // recommended-path "heatmap" ramp — hot yellow core → orange edge (thermal glow).
  // 4 stops so the yellow→orange smudge blends smoothly with no visible banding.
  heatCore: '#FFE873', heatInner: '#FFC24D', heatMid: '#FF9A3D', heatEdge: '#FF6A1F',
  street: '#5E8A7C',               // faint seaweed for the base street network
};

// Jongno pilot bbox [W,S,E,N] — same zone as zone-jongno.html
const JONGNO_BBOX = [126.97869, 37.56623, 127.01052, 37.58646];

// OpenFreeMap vector base, repainted in the teal canvas so the map reads as
// part of the app rather than a generic Google-grey tile sheet.
function buildBaseStyle() {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': MAP_PAL.land } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'grass', 'scrub', 'park'],
        paint: { 'fill-color': MAP_PAL.park, 'fill-opacity': 0.5 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
        paint: { 'fill-color': MAP_PAL.park, 'fill-opacity': 0.4 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
        paint: { 'fill-color': MAP_PAL.water, 'fill-opacity': 0.55 } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-color': MAP_PAL.card2, 'fill-outline-color': MAP_PAL.land2, 'fill-opacity': 0.85 } },
      { id: 'road-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.land2, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 9, 18, 20] } },
      { id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.card, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 6, 18, 14] } },
    ],
  };
}

/* ============================================================
   SEARCH RESOLVERS — the three paths from the flow diagram.
   Each takes the loaded features and returns a ranked list of
   { name, score, sub, feature } candidate streets.
   ============================================================ */

// THEMATIC CATEGORIES — the map's chip taxonomy.
//
// Two kinds of category live here:
//  · commerce categories (most) resolve to STREETS via the commerce census:
//    a street's `commerce_why` (its over-represented shop signature) is matched
//    by substring, so "bakery" finds "빵/도넛" streets. `tokens` are substrings
//    deliberately shorter than the full census label so variants also match.
//  · the single `kind:'green'` category (Nature) resolves to green AREAS from
//    green-jongno.geojson instead — parks/gardens/woods have no commerce
//    signature, so they get their own resolver + a mint highlight on the map.
//
// The 5 families the product wants map onto the data we actually have:
//   Nature & outdoor → nature ✓      Food & drink → food / cafe / bar ✓
//   Social & leisure → shopping (the leisure venues aren't collected yet)
//   Culture & knowledge → culture (retail proxy; museums/temples not collected)
// Groups with no data (arcades, karaoke, cinemas, museums, temples, murals,
// viewpoints, named alleys) are intentionally left out until a POI pass exists.
const CATEGORIES = [
  { id: 'nature', kind: 'green', label: 'Nature & outdoor', emoji: '🌿',
    syn: ['nature', 'outdoor', 'outdoors', 'green', 'greenery', 'park', 'parks', 'garden', 'gardens', 'forest', 'wood', 'woods', 'trail', 'trails', 'riverside', 'plaza', 'plazas', 'nature', 'parc', 'jardin', 'jardins', 'vert', 'verdure', 'forêt', 'foret', 'balade', '공원', '정원', '숲', '산책'] },
  { id: 'food', label: 'Food', emoji: '🍜',
    syn: ['food', 'restaurant', 'restaurants', 'resto', 'restos', 'eat', 'dinner', 'lunch', 'meal', 'manger', 'restauration', 'korean', 'bbq', 'barbecue', '밥', '식당', '맛집'],
    tokens: ['백반', '한정식', '경양식', '구이', '찜', '회/초밥', '국수', '칼국수', '국/탕', '찌개', '족발', '보쌈', '파스타', '스테이크', '버거', '피자', '치킨', '중국집', '횟집', '냉면', '밀면', '마라탕', '훠궈', '분식', '만두', '김밥', '전골', '부침개', '덮밥', '돈가스', '카레', '면 요리', '음식점', '베트남', '복 요리', '구내식당', '뷔페', '패밀리레스토랑'] },
  { id: 'cafe', label: 'Café & sweets', emoji: '☕',
    syn: ['cafe', 'café', 'cafes', 'coffee', 'dessert', 'desserts', 'bakery', 'boulangerie', 'bread', 'pastry', 'cake', 'tea', 'brunch', 'sucré', 'patisserie', 'pâtisserie', '카페', '빵'],
    tokens: ['카페', '빵', '도넛', '아이스크림', '빙수', '토스트', '샌드위치', '샐러드', '떡', '한과'] },
  { id: 'bar', label: 'Bars & nightlife', emoji: '🍺',
    syn: ['bar', 'bars', 'pub', 'pubs', 'drink', 'drinks', 'boire', 'beer', 'soju', 'nightlife', 'alcohol', 'apéro', 'apero', '술집', '주점'],
    tokens: ['주점', '생맥주', '유흥', '주류 소매'] },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️',
    syn: ['shop', 'shops', 'shopping', 'store', 'stores', 'boutique', 'boutiques', 'clothes', 'clothing', 'fashion', 'vetements', 'vêtements', 'mode', 'shoes', 'hanbok', 'jewelry', 'jewellery', 'bijoux', 'watch', 'watches', 'montre', 'cosmetics', 'beauty', 'makeup', 'cosmetiques', 'cosmétiques', 'souvenir', 'souvenirs', 'gift', 'gifts', 'cadeau', 'flower', 'flowers', 'fleurs', 'achats', '옷', '의류', '패션', '쇼핑', '기념품', '꽃'],
    tokens: ['의류', '신발', '가방', '한복', '가발', '시계', '귀금속', '액세서리', '잡화', '화장품', '안경', '기념품', '꽃집'] },
  { id: 'culture', label: 'Art & culture', emoji: '🎨',
    syn: ['art', 'arts', 'gallery', 'galleries', 'galerie', 'arty', 'painting', 'music', 'instrument', 'book', 'books', 'bookshop', 'bookstore', 'livre', 'livres', 'librairie', 'stationery', 'culture', 'culturel', 'record', 'records', 'vinyl', '예술', '갤러리', '서점', '책', '문화'],
    tokens: ['예술품', '악기', '음반', '서점', '문구', '회화용품'] },
  { id: 'market', label: 'Market & groceries', emoji: '🛒',
    syn: ['market', 'grocery', 'groceries', 'epicerie', 'épicerie', 'supermarket', 'mart', 'convenience', 'butcher', 'seafood', 'fruit', 'vegetable', 'marché', 'marche', 'courses', '시장', '마트', '반찬', '편의점'],
    tokens: ['슈퍼마켓', '편의점', '반찬', '식료품', '채소', '과일', '정육', '수산물', '건어물', '젓갈', '곡물', '곡분', '생수', '음료', '우유', '종합 소매'] },
];

// parse "빵/도넛 (26), 꽃집 (3)" → [["빵/도넛",26],["꽃집",3]]
function parseCommerceWhy(cw) {
  if (!cw) return [];
  return cw.split(',').map(tok => {
    const m = tok.match(/^(.*?)\s*\((\d+)\)\s*$/);
    return m ? [m[1].trim(), +m[2]] : [tok.trim(), 1];
  });
}

// Find which categories a free-text query names (may match several).
function matchCategories(q) {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  return CATEGORIES.filter(g => g.syn.some(w => s.includes(w) || w.includes(s)));
}

// FUNCTION resolver — rank streets whose commerce signature hits the group tokens.
function resolveFunction(groups, feats) {
  const tokens = groups.flatMap(g => g.tokens);
  const out = [];
  feats.forEach(f => {
    const cats = parseCommerceWhy(f.properties.commerce_why);
    let hits = 0, matched = [];
    cats.forEach(([cat, n]) => {
      if (tokens.some(tk => cat.includes(tk))) { hits += n; matched.push(cat); }
    });
    if (hits > 0) out.push({ name: f.properties.name, score: hits, feature: f,
      sub: matched.slice(0, 2).join(' · ') + ` · ${hits} shops` });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

// PLACE resolver — name / description substring lookup (OSM named entities).
function resolvePlace(q, feats) {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  const out = [];
  feats.forEach(f => {
    const name = (f.properties.name || '').toLowerCase();
    const desc = (f.properties.description || '').toLowerCase();
    let rank = -1;
    if (name.startsWith(s)) rank = 3;
    else if (name.includes(s)) rank = 2;
    else if (desc.includes(s)) rank = 1;
    if (rank > 0) out.push({ name: f.properties.name, score: rank, feature: f,
      sub: f.properties.walkability === 'pieton' ? 'pedestrian street' : (f.properties.highway || 'street') });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

// NEIGHBOURHOOD (동) resolver — match a free-text query against the administrative
// dong loaded from dong-jongno.geojson (built by backend/offline/dong_boundaries.py).
// Matching is EXACT on a normalised token (spaces/hyphens stripped, lowercased) so a
// bare neighbourhood name ("삼청동", "Bukchon", "인사동") zooms to the zone, while a
// street name that merely contains it ("인사동길") falls through to the street search.
function normDong(s) {
  return (s || '').toLowerCase().replace(/[\s-]/g, '').trim();
}
function matchDong(q, dongFeats) {
  const s = normDong(q);
  if (!s) return null;
  return dongFeats.find(f => {
    const aliases = f.properties.aliases || [];
    return aliases.some(a => normDong(a) === s);
  }) || null;
}

// NATURE resolver — recommended WALKS, not park fills. nature-paths-jongno
// (built offline by backend/offline/nature_paths.py) is already one route per
// green area, pre-sorted nicest-first (청계천 riverside, 경복궁, 낙산 wall trail…).
// A pedestrian walks a route, so we highlight the merged path lines and label
// each by its walk type + distance ("Park walk · 3.3 km").
// `opts.quiet` (the "Quiet nature" preset) ranks the walks by their per-walk
// quietness (median 생활인구 along the route, precomputed by nature_paths.py):
// calmest first, walks with no population reading (quiet_value null) last. It also
// shows the calm/moderate/busy label in the subtitle. Without it (the "Nature &
// outdoor" chip) the walks keep their default nicest-type-then-longest order.
// Only PUBLIC & free parks are recommendable: a walk that ends at a ticket gate
// (경복궁) or inside a private residence garden breaks the outing. access_class is
// tagged offline from OSM by backend/offline/nature_paths_access.py.
function isPublicWalk(f) {
  return !['paid', 'private', 'review'].includes(f.properties.access_class);
}

function resolveNature(feats, opts) {
  const quiet = !!(opts && opts.quiet);
  const list = feats.filter(isPublicWalk).map(f => {
    const p = f.properties, km = (p.path_m || 0) / 1000;
    const dist = km >= 1 ? `${km.toFixed(1)} km` : `${p.path_m} m`;
    const qlbl = quiet && p.quiet_label && p.quiet_label !== '—' ? ` · ${p.quiet_label}` : '';
    return { name: p.name, feature: f, score: p.path_m || 0, type: 'nature',
      quiet_value: p.quiet_value,
      sub: `${p.type_label || 'Green walk'} · ${dist}${qlbl}` };
  });
  if (quiet) {
    const q = r => (r.quiet_value == null ? Infinity : r.quiet_value);  // no data → last
    list.sort((a, b) => q(a) - q(b));
  }
  return list;
}

// Flatten ANY geometry's coordinates into a flat list of [lng,lat] pairs, so the
// same code can fit bounds / place a popup for a Point, LineString, or Polygon.
function coordsOf(geom) {
  const out = [];
  (function walk(a) { if (typeof a[0] === 'number') out.push(a); else a.forEach(walk); })(geom.coordinates);
  return out;
}

// Sample evenly-spaced points (~stepM metres apart) along every line in
// `features`, so a heatmap layer — which only takes points — can render the
// recommended streets as one continuous heat cloud. Metres are approximated with
// a flat lng/lat scale, which is plenty accurate at Jongno's scale.
function densifyToPoints(features, stepM = 4) {
  const MLAT = 111320, MLNG = 111320 * Math.cos(37.57 * Math.PI / 180);
  const pts = [];
  const push = ([x, y]) => pts.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x, y] } });
  (features || []).forEach(f => {
    const g = f.geometry; if (!g) return;
    const lines = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
    lines.forEach(line => {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        const segLen = Math.hypot((bx - ax) * MLNG, (by - ay) * MLAT);
        const n = Math.max(1, Math.round(segLen / stepM));
        for (let k = 0; k < n; k++) { const t = k / n; push([ax + (bx - ax) * t, ay + (by - ay) * t]); }
      }
      if (line.length) push(line[line.length - 1]);   // include the final vertex
    });
  });
  return { type: 'FeatureCollection', features: pts };
}

// VIBE resolver — read the sliders, map each slider axis to the per-named-street
// score column of the same name, then rank streets by how close their scores sit
// to the target vibe.
//
// All six mapped axes now carry a per-street score in [-1,+1]. Three come from the
// NLP text pass (backend/offline/text_axes.py); the other three are rolled up from
// the hard-data segment/area layers onto the same named streets by
// backend/offline/rollup_street_axes.py — so the app ranks streets identically
// whatever the source. Sign follows the repo rule (+ = the slider's RIGHT label).
// `price` still has no per-street score, so that slider isn't wired yet.
const VIBE_AXIS_MAP = {
  era: 'historic_contemporary',   // slider 0=Historic → -1 ; axis pos=contemporary(+1)
  finish: 'raw_polished',         // slider 0=Raw → -1 ; axis pos=polished(+1)
  crowd: 'touristy_local',        // slider 0=Touristy → -1 ; axis pos=local(+1)
  energy: 'quiet_lively',         // slider 0=Quiet → -1 ; axis pos=lively(+1)  [생활인구 14h]
  origin: 'local_chain',          // slider 0=Local → -1 ; axis pos=chain(+1)   [상가정보]
  green: 'park_v2',               // greenery is NOT a bipolar slider — see greenMode below.
};

// Greenery is special: not a Greenery↔Park slider (the two poles aren't opposites,
// they're two doses of green) but a two-button choice with an off state:
//   'off'   → axis not factored in
//   'leafy' → rank streets by canopy (park_v2); shown as the usual heat cloud
//   'park'  → surface the public park WALKS (nature-paths) as green routes + bubbles
function readGreenMode() {
  try { const v = localStorage.getItem('seoulwalk.sliders.greenMode'); return v != null ? JSON.parse(v) : 'off'; }
  catch (e) { return 'off'; }
}

// Build a vibe target from in-memory slider state (values in [0,1] + dropped ids).
// Factored out of readVibeTarget so the live in-map sliders can rank without a
// localStorage round-trip (usePersist writes on a later effect tick).
function targetFromSliders(vals, off, greenMode) {
  const target = {};
  Object.keys(VIBE_AXIS_MAP).forEach(sid => {
    if (sid === 'green') return;                   // greenery handled by greenMode, not a slider
    if (off && off.includes(sid)) return;          // user dropped this dimension
    const v = vals[sid];
    if (v == null) return;
    target[VIBE_AXIS_MAP[sid]] = v * 2 - 1;         // [0,1] slider → [-1,1] axis
  });
  // 'leafy' ranks streets by canopy; 'park' shows walks instead (handled in runVibe).
  if (greenMode === 'leafy') target['park_v2'] = 1;
  return target;
}

function readVibeTarget() {
  // pull the persisted slider state (same keys as sliders.jsx / usePersist)
  const read = (k, d) => { try { const v = localStorage.getItem('seoulwalk.' + k); return v != null ? JSON.parse(v) : d; } catch (e) { return d; } };
  const defVals = Object.fromEntries((window.VIBE_AXES || []).map(a => [a.id, a.def]));
  const vals = read('sliders.vals', defVals);
  const off = read('sliders.off', []);
  return targetFromSliders(vals, off, readGreenMode());
}

// Blend the friends joining THIS walk into the vibe target. Delegates to the ONE
// group target (theme.jsx groupTarget) instead of averaging raw vectors here: that
// second, independent average was the reason the group screen's reconciliation had
// no effect on the map — you could settle every axis and not move a single street.
// Now the map ranks on exactly what the group negotiated, nudges included.
// `userTarget` is passed through as the walker's own side of the blend so the live
// in-map sliders still re-rank instantly (no localStorage round-trip).
// Returns { target, group } where group is null when walking solo (target unchanged).
function mergeTargetWithGroup(userTarget) {
  if (!window.groupTarget) return { target: userTarget, group: null };
  const g = window.groupTarget(userTarget);
  return { target: g.target, group: g.group };
}

// Percentile-normalise every axis the SAME way, so the six sliders react in one
// shared "currency" instead of each axis's raw scale (raw_polished comes in ~12
// coarse steps with a third of streets null, quiet_lively is smooth over 263
// values, park saturates near -1). For each axis we rank every street among its
// peers and map that rank to a uniform [-1,+1]. Returns fn(axis, rawValue) →
// normalised value in [-1,+1], or null when the street has no reading on that axis.
function buildAxisNormalizers(feats, axes) {
  const sorted = {};
  axes.forEach(ax => {
    sorted[ax] = feats.map(f => f.properties[ax]).filter(v => v != null).sort((a, b) => a - b);
  });
  return (ax, v) => {
    if (v == null) return null;
    const vals = sorted[ax];
    if (!vals || vals.length < 2) return 0;
    // mid-rank percentile: (#below + half the ties) / n → keeps ties centred
    let below = 0, ties = 0;
    for (const x of vals) { if (x < v) below++; else if (x === v) ties++; }
    return ((below + ties / 2) / vals.length) * 2 - 1;   // (0,1) → [-1,+1]
  };
}

// Human-readable pole labels per scored axis, [negPole, posPole]. Mirrors
// theme.jsx SWIPE_AXES, but keyed by the actual street property names (the
// greenery score lives on `park_v2`). A null pole means that direction isn't a
// describable trait (e.g. "less green"), so only its meaningful pole surfaces.
const TRAIT_POLES = {
  touristy_local:        ['touristy', 'local'],
  historic_contemporary: ['historic', 'contemporary'],
  raw_polished:          ['raw', 'polished'],
  quiet_lively:          ['quiet', 'lively'],
  local_chain:           ['independent', 'chain'],
  park_v2:               [null, 'leafy'],
};

// Describe a street by its OWN most pronounced characteristics — independent of
// the user's current vibe target. We percentile-normalise each axis across all
// streets (same currency as the sliders), then surface the 1–2 poles this
// street leans on hardest. Returns fn(feature) → e.g. "historic · quiet", or ''
// when the street is too middling on every axis to have a standout trait.
function describeTraits(feats, opts) {
  const axes = Object.keys(TRAIT_POLES);
  const norm = buildAxisNormalizers(feats, axes);
  const minLean = (opts && opts.minLean) != null ? opts.minLean : 0.5;  // top/bottom ~25%
  const maxN = (opts && opts.maxN) || 2;
  return (feature) => {
    const p = feature && feature.properties;
    if (!p) return '';
    const leans = [];
    axes.forEach(ax => {
      const n = norm(ax, p[ax]);
      if (n == null) return;                                 // no reading on this axis
      const pole = n < 0 ? TRAIT_POLES[ax][0] : TRAIT_POLES[ax][1];
      if (!pole || Math.abs(n) < minLean) return;            // undescribable or too middling
      leans.push({ label: pole, mag: Math.abs(n) });
    });
    leans.sort((a, b) => b.mag - a.mag);
    return leans.slice(0, maxN).map(l => l.label).join(' · ');
  };
}

// Core ranker — score named streets by ALIGNMENT with a weighted vibe vector.
// `target` maps axis names → a weight in [-1,+1]: the slider position encodes
// BOTH a direction (which pole) AND an intensity (how much it matters). Centre = 0
// = "I don't care about this axis". We compute a dot product between those weights
// and the street's percentile-normalised axis scores:
//     utility = Σ wᵢ · nᵢ
// so an axis the user set to the middle contributes nothing, and moving a single
// slider only re-orders once it crosses zero — the mono-axis unpredictability of
// the old distance metric disappears by construction.
//
// Nulls are imputed to 0 (neutral): they add nothing to the utility instead of
// dropping a street or reordering the list by how well-documented it is. We still
// report real coverage ("noted on 4/6 axes") so the user sees confidence, but it
// no longer drives the ranking (the old `used`-primary sort is gone).
// Shared by the live sliders (runVibe) and the fixed preset chips (VIBE_PRESETS).
function rankByVibe(target, feats) {
  const axes = Object.keys(target);
  if (!axes.length) return [];
  const norm = buildAxisNormalizers(feats, axes);
  const trait = describeTraits(feats);       // the street's own standout character, for favorites
  const wsum = axes.reduce((s, ax) => s + Math.abs(target[ax]), 0);  // max achievable utility
  const out = [];
  feats.forEach(f => {
    let util = 0, covered = 0;
    axes.forEach(ax => {
      const n = norm(ax, f.properties[ax]);
      if (n == null) return;                 // missing → contributes 0, not counted as covered
      util += target[ax] * n;
      covered++;
    });
    if (covered === 0) return;               // we know nothing about this street on the active axes
    const score = wsum > 0 ? (util / wsum + 1) / 2 : 0.5;   // → [0,1] match
    out.push({ name: f.properties.name, score, feature: f, covered, nAxes: axes.length,
      traits: trait(f),                      // e.g. "historic · quiet" — shown on the saved card
      sub: `${Math.round(score * 100)}% match · noted on ${covered}/${axes.length} ${axes.length > 1 ? 'axes' : 'axis'}` });
  });
  // rank on alignment ONLY — coverage is shown, not used to sort.
  // Top 20 streets (was 12): the vibe/preset views surface them as map popups
  // rather than a list, so a longer set stays legible.
  return out.sort((a, b) => b.score - a.score).slice(0, 20);
}
// Shared so the Social / Group screens can rank the SAME scored streets by a merged
// group vibe (module runs at load, before any screen mounts, so this is ready).
window.rankByVibe = rankByVibe;

// (runVibe reads readVibeTarget() directly now — it needs the target to decide
//  whether to also surface park walks — so there's no standalone resolveVibe.)

/* ============================================================
   ROUTING — an OPEN orienteering walk from a fixed Jongno start
   (start pinned, end free), maximising the vibe met on the way.
   ============================================================ */

// Fallback "you are here". The real device position drives the marker (see the
// geolocation watch in RealMapScreen), but the app's data (graph + scores) only
// covers the Jongno bbox: a fix outside it has no network to route on, so the walk
// start falls back to this central Jongno node. ~인사동 / central 종로.
const FAKE_GPS = [126.9908, 37.5758];
// Is a device fix usable for routing? Only inside the pilot bbox — outside it
// nearestNode() would happily snap to an arbitrary border node and every proposed
// walk would depart from the wrong place.
function inJongno(lng, lat) {
  return lng >= JONGNO_BBOX[0] && lng <= JONGNO_BBOX[2]
      && lat >= JONGNO_BBOX[1] && lat <= JONGNO_BBOX[3];
}
const WALK_MIN = 38;                 // the UPPER time budget
const WALK_MIN_MIN = 25;             // walks may wrap up this early if good spots are close
const WALK_SPEED_M_MIN = 80;         // ~4.8 km/h leisurely walking pace
const WALK_BUDGET_M = WALK_MIN * WALK_SPEED_M_MIN;       // ≈ 3040 m — the ceiling
const WALK_MIN_BUDGET_M = WALK_MIN_MIN * WALK_SPEED_M_MIN; // ≈ 2000 m — the floor
const WALK_FAR_M = 380;              // once past the floor, stop rather than detour this far for the next spot

// Iconic Jongno landmarks used to DESCRIBE a walk ("explore near Cheonggyecheon")
// instead of listing street names. Coordinates are grounded in real data: the
// green/heritage anchors are centroids from nature-paths-jongno.geojson; the
// neighbourhood/palace anchors are centroids of their own streets in the walk
// network (e.g. Bukchon = 북촌로*, Insadong = 인사동*). Cheonggyecheon is a linear
// stream, so it carries several points along its course.
const LANDMARKS = [
  { name: 'the Cheonggyecheon stream', pts: [[126.982, 37.5697], [126.990, 37.5692], [126.99492, 37.56903], [127.001, 37.5688]] },
  { name: 'Gyeongbokgung Palace', pts: [[126.97935, 37.58052]] },
  { name: 'Bukchon Hanok Village', pts: [[126.98381, 37.58175]] },
  { name: 'Changdeokgung Palace', pts: [[126.98825, 37.58139]] },
  { name: 'Changgyeonggung Palace', pts: [[126.99834, 37.57559]] },
  { name: 'Jongmyo Shrine', pts: [[126.99491, 37.57137]] },
  { name: 'Insadong', pts: [[126.98549, 37.57348]] },
  { name: 'Tapgol Park', pts: [[126.98829, 37.57124]] },
  { name: 'Naksan Park & the city wall', pts: [[127.00751, 37.58116]] },
  { name: 'Marronnier Park (Daehangno)', pts: [[127.00284, 37.58054]] },
  { name: 'Heunginjimun Gate', pts: [[127.00883, 37.5721]] },
  { name: 'Dongdaemun (DDP)', pts: [[127.00961, 37.56769]] },
];

// Precompute everything that does NOT depend on the slider weights: each street's
// axes percentile-normalised the SAME way as the ranker (so the walk's rewards
// agree with the street list), plus an adjacency list over the nodes.
function buildRouteIndex(net) {
  const A = net.axes.length;
  const sorted = [];
  for (let a = 0; a < A; a++)
    sorted.push(net.nameAxes.map(v => v[a]).filter(v => v != null).sort((x, y) => x - y));
  const pct = (a, v) => {
    if (v == null) return null;
    const vals = sorted[a]; if (vals.length < 2) return 0;
    let b = 0, t = 0; for (const x of vals) { if (x < v) b++; else if (x === v) t++; }
    return ((b + t / 2) / vals.length) * 2 - 1;   // mid-rank percentile → [-1,+1]
  };
  const normName = net.nameAxes.map(row => row.map((v, a) => pct(a, v)));
  const adj = net.nodes.map(() => []);
  net.edges.forEach((e, ei) => {
    const [u, v] = e;
    adj[u].push({ to: v, ei, len: e[2] });
    adj[v].push({ to: u, ei, len: e[2] });
  });
  const nameToId = new Map(net.names.map((n, i) => [n, i]));
  return { normName, adj, nameToId };
}

// Set of routing-graph EDGE ids that lie INSIDE the given park walks: an edge whose
// BOTH endpoints sit within ~thresholdM of a park polyline. Park mode feeds these to
// the orienteering as high-value prizes so the walk actually dips into a park (the
// paths inside parks are mostly unnamed connectors, so they'd never be prizes on
// their own). A coarse metre-grid over the nodes keeps the snap near O(vertices).
function parkEdgeSet(net, walkFeats, thresholdM = 22) {
  const MLAT = 111320, MLNG = 111320 * Math.cos(37.57 * Math.PI / 180);
  const cell = thresholdM;   // grid cell ≈ the snap radius, so 3×3 cells always cover it
  const gkey = (gx, gy) => gx + ',' + gy;
  const grid = new Map();
  net.nodes.forEach((p, i) => {
    const k = gkey(Math.floor(p[0] * MLNG / cell), Math.floor(p[1] * MLAT / cell));
    const bucket = grid.get(k); if (bucket) bucket.push(i); else grid.set(k, [i]);
  });
  const parkNodes = new Set(), th2 = thresholdM * thresholdM;
  (walkFeats || []).forEach(f => {
    if (!f || !f.geometry) return;
    coordsOf(f.geometry).forEach(([lng, lat]) => {
      const gx = Math.floor(lng * MLNG / cell), gy = Math.floor(lat * MLAT / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(gkey(gx + dx, gy + dy)); if (!bucket) continue;
        for (const ni of bucket) {
          const q = net.nodes[ni], ex = (q[0] - lng) * MLNG, ey = (q[1] - lat) * MLAT;
          if (ex * ex + ey * ey <= th2) parkNodes.add(ni);
        }
      }
    });
  });
  const edges = new Set();
  net.edges.forEach((e, ei) => { if (parkNodes.has(e[0]) && parkNodes.has(e[1])) edges.add(ei); });
  return edges;
}

// Map a list of street names (the displayed vibe results) to the net's name ids —
// the prize set the walk should connect.
function nameIdSet(idx, names) {
  const s = new Set();
  names.forEach(n => { const id = idx.nameToId.get(n); if (id != null) s.add(id); });
  return s;
}

// Snap an arbitrary lng/lat to the nearest graph node (squared-degree distance is
// fine at this scale — we only need the closest, not the true metric distance).
function nearestNode(net, lng, lat) {
  let best = 0, bd = Infinity;
  net.nodes.forEach((p, i) => {
    const dx = p[0] - lng, dy = p[1] - lat, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Dijkstra (binary min-heap) over edge LENGTHS from `src`, returning the distance
// and back-pointers (previous node + edge) to every node. Used by the router to
// route from the current point to the next worthwhile street.
function dijkstra(adj, N, src) {
  const dist = new Float64Array(N).fill(Infinity);
  const pN = new Int32Array(N).fill(-1);
  const pE = new Int32Array(N).fill(-1);
  dist[src] = 0;
  const heap = [];
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = 2 * i + 2; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  push(0, src);
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const { to, ei, len } of adj[u]) {
      const nd = d + len;
      if (nd < dist[to]) { dist[to] = nd; pN[to] = u; pE[to] = ei; push(nd, to); }
    }
  }
  return { dist, pN, pE };
}

// Prize-collecting orienteering: build an OPEN walk (start fixed, end free) that
// spends ~the time budget while maximising the vibe met on the way. Each step, we
// Dijkstra from the current node, then pick a high-value UNVISITED street edge to
// head for — scored by reward-per-detour (gain = edgeReward / distance-to-reach) —
// route to it (collecting any fresh reward passed en route), traverse it, and
// repeat until nothing worthwhile fits the remaining budget. Unlike a greedy
// no-revisit trail, this never strands itself in a dead-end (it may walk back
// through used streets to reach a new prize), so it actually fills the ~38 min.
// A small random pick among the top few candidates (RCL) gives route variety, so
// repeated calls yield distinct route options.
//
// `opt` shapes the strategy:
//   prizeIds     Set of street name-ids to restrict prizes to (else any street)
//   minReward    minimum alignment a street must clear to be a prize (the user's
//                "minimum criteria" — slider-relative, see makeWalkOptions)
//   detourExp    how hard proximity is favoured: gain = reward / (detour)^detourExp,
//                so >1 makes the walk prefer NEARBY streets over far better ones
//   avoidNames   streets to de-prioritise (for diversity across options) + penalty
// Orienteering is NP-hard; this is a fast heuristic (~0.1 s), not an optimum.
function vibeRewardFn(net, idx, weights) {
  const A = net.axes.length;
  const w = net.axes.map(a => weights[a] || 0);
  const wsum = w.reduce((s, x) => s + Math.abs(x), 0) || 1;   // max achievable alignment
  const { normName } = idx;
  const reward = (nid) => {
    if (nid < 0) return 0;                       // unnamed connector → neutral
    const nv = normName[nid]; let r = 0;
    for (let a = 0; a < A; a++) if (nv[a] != null) r += w[a] * nv[a];
    return r;
  };
  return { reward, wsum };
}

function planWalk(net, idx, weights, startNode, budgetM, opt) {
  opt = opt || {};
  const prizeIds = opt.prizeIds || null;
  const minReward = opt.minReward != null ? opt.minReward : 0;   // default: aligned (>0)
  const detourExp = opt.detourExp || 1;
  const avoidNames = opt.avoidNames || null;
  const avoidPenalty = opt.avoidPenalty != null ? opt.avoidPenalty : 0.2;
  const minBudgetM = opt.minBudgetM != null ? opt.minBudgetM : WALK_MIN_BUDGET_M;
  const farM = opt.farM != null ? opt.farM : WALK_FAR_M;
  const parkEdges = opt.parkEdges || null;                     // edges inside a park walk (Park mode)
  const parkReward = opt.parkReward || 0;                      // vibe-reward bonus for stepping into a park
  const parkCapM = opt.parkCapM != null ? opt.parkCapM : 0.5 * budgetM;  // aim for ~half the walk inside parks, then head back to the vibe streets
  const N = net.nodes.length;
  const { adj } = idx;
  const { reward: rewardOf } = vibeRewardFn(net, idx, weights);
  // Reward for traversing edge `ei`: its street's vibe alignment plus a park bonus
  // when the edge lies inside a park walk — this is what pulls the route into a park.
  const edgeReward = (ei) => rewardOf(net.edges[ei][3]) + (parkEdges && parkEdges.has(ei) ? parkReward : 0);
  const isParkEdge = (ei) => !!(parkEdges && parkEdges.has(ei));
  const RCL = 3, MAX_STEPS = 60;
  const used = new Set();
  let cur = startNode, len = 0, reward = 0, parkLen = 0;   // parkLen: metres already walked inside parks
  const path = [startNode], edges = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const { dist, pN, pE } = dijkstra(adj, N, cur);
    // Spend up to ~half the walk inside parks (parkCapM), then stop treating park
    // edges as prizes so the route heads back to the vibe streets for the rest.
    const parkActive = parkLen < parkCapM;
    // candidate prizes: a named street, in the prize set (if any), clearing the
    // minimum-criteria bar, reachable within the remaining budget.
    const cands = [];
    for (let ei = 0; ei < net.edges.length; ei++) {
      if (used.has(ei)) continue;
      const nid = net.edges[ei][3];
      const isPark = isParkEdge(ei) && parkActive;   // park edge, still under the cap
      if (nid < 0 && !isPark) continue;                    // unnamed connector, not a park edge
      if (prizeIds && !prizeIds.has(nid) && !isPark) continue;  // park edges bypass the prize-set restriction
      const r = (nid >= 0 ? rewardOf(nid) : 0) + (isPark ? parkReward : 0);
      if (r < minReward && !isPark) continue;      // minimum-criteria gate — park edges always qualify
      const e = net.edges[ei], u = e[0], v = e[1], el = e[2];
      const dNear = Math.min(dist[u], dist[v]);
      if (!isFinite(dNear) || len + dNear + el > budgetM) continue;
      const near = dist[u] <= dist[v] ? u : v;
      // gain: reward per detour, with proximity emphasised by detourExp; streets we
      // want to avoid (diversity) are pushed down but not forbidden.
      let gain = (r + 0.001) / Math.pow(dNear + el + 1, detourExp);
      if (avoidNames && avoidNames.has(net.names[nid])) gain *= avoidPenalty;
      cands.push({ ei, near, far: near === u ? v : u, el, r, gain, dNear });
    }
    if (!cands.length) break;
    cands.sort((a, b) => b.gain - a.gain);
    const pick = cands[Math.floor(Math.random() * Math.min(RCL, cands.length))];
    // once we already have a walk of at least the minimum length, don't detour far
    // for the next spot — a good nearby walk is enough (target ~25–38 min).
    if (len >= minBudgetM && pick.dNear > farM) break;
    // walk the shortest path cur → near (collecting any fresh reward passed)
    const seg = [];
    for (let n = pick.near; n !== cur && n !== -1; n = pN[n]) seg.push({ node: n, ei: pE[n] });
    seg.reverse();
    for (const s of seg) {
      if (!used.has(s.ei)) { used.add(s.ei); reward += edgeReward(s.ei); if (isParkEdge(s.ei)) parkLen += net.edges[s.ei][2]; }
      len += net.edges[s.ei][2]; path.push(s.node); edges.push(s.ei);
    }
    // traverse the prize edge near → far
    if (!used.has(pick.ei)) { used.add(pick.ei); reward += pick.r; if (isParkEdge(pick.ei)) parkLen += pick.el; }
    len += pick.el; path.push(pick.far); edges.push(pick.ei);
    cur = pick.far;
  }
  return path.length > 1 ? { path, edges, len, reward } : null;
}

// walk-net edge names can be a Python list-repr — OSMnx stores a dual-named edge as
// e.g. "['삼청로', '청와대로']" — which never matches the sentence/photo indices AND
// renders as that raw string on the map/sheet. cleanNames() parses those into their
// component street names (a plain name → [name]); displayName() is the primary one.
function cleanNames(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/^\[.*\]$/.test(s)) {
    const toks = (s.match(/['"]([^'"]+)['"]/g) || []).map(x => x.slice(1, -1));
    if (toks.length) return toks;
  }
  return s ? [s] : [];
}
function displayName(raw) { const c = cleanNames(raw); return c[0] || String(raw == null ? '' : raw); }
// normalise a name for matching (strip spaces/hyphens, lowercase) so index lookups
// are tolerant of formatting differences between the datasets.
function normName(s) { return String(s == null ? '' : s).replace(/[\s\-]/g, '').toLowerCase().trim(); }
// look a walk-net name up in a NORMALISED index: try each of its component names
// (so a dual-named edge matches on either street) and return the first hit.
function lookupByNames(raw, normIdx) {
  if (!normIdx) return null;
  for (const nm of cleanNames(raw)) { const hit = normIdx[normName(nm)]; if (hit) return hit; }
  return null;
}

// Turn a routing result into everything the map + sheet need:
//   line      the full-walk LineString (for fitting the camera / telemetry)
//   routeFC   one feature per MERGED leg, tagged { vibe, t, name } — this is what
//             the segmented route layers paint (vibe thick+directional, connectors
//             faded), and what the leg labels ride on.
//   sequence  the ordered départ→…→arrivée steps for the sheet: a { leg } for each
//             named street (with metres + whether it clears the vibe bar) and a
//             { connector } for each unnamed linking stretch.
//   legs      named streets only (kept for describePlace + the marquee pick).
//   startPoint / endPoint  the two ends — the open walk finishes away from the start.
// `isVibeLeg(name)` decides which named legs are "yours" (the strong matches); a
// leg with no name is always a connector.
function describeWalk(net, plan, isVibeLeg) {
  const coords = plan.path.map(i => net.nodes[i]);
  // group consecutive edges into runs by street name (null = connector run)
  const runs = [];
  plan.edges.forEach((ei, k) => {
    const e = net.edges[ei];
    const name = e[3] >= 0 ? net.names[e[3]] : null;
    const b = net.nodes[plan.path[k + 1]];
    const last = runs[runs.length - 1];
    if (last && last.name === name) { last.m += e[2]; last.coords.push(b); }
    else runs.push({ name, m: e[2], coords: [net.nodes[plan.path[k]], b] });
  });
  const total = plan.len || runs.reduce((s, r) => s + r.m, 0) || 1;
  const features = [], sequence = [];
  let acc = 0;
  runs.forEach(r => {
    const tMid = (acc + r.m / 2) / total; acc += r.m;
    const vibe = r.name ? (isVibeLeg ? !!isVibeLeg(r.name) : true) : false;
    const disp = r.name ? displayName(r.name) : '';   // clean, human name (parses list-repr)
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords },
      properties: { name: disp, vibe: vibe ? 1 : 0, t: tMid } });
    if (r.name) sequence.push({ type: 'leg', name: disp, rawName: r.name, m: Math.round(r.m), vibe, at: r.coords[Math.floor(r.coords.length / 2)] });
    else sequence.push({ type: 'connector', m: Math.round(r.m) });
  });
  const legs = runs.filter(r => r.name).map(r => ({ name: r.name, m: r.m, at: r.coords[Math.floor(r.coords.length / 2)] }));
  return {
    line: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
    routeFC: { type: 'FeatureCollection', features }, sequence, legs,
    startPoint: coords[0], endPoint: coords[coords.length - 1],
  };
}

// Describe WHERE a walk goes without naming streets: find the landmarks it runs
// near (within ~280 m) and how many of its points sit near each. Returns the
// dominant landmark (for the one-line "explore near X" label) and the ordered list
// of landmarks it passes (for the option detail). Falls back to the walk's main
// street when it stays clear of every landmark.
function describePlace(net, path, legs) {
  const R = 280;
  const toM = (p, q) => { const dx = (p[0] - q[0]) * 88200, dy = (p[1] - q[1]) * 111000; return Math.hypot(dx, dy); };
  const counts = LANDMARKS.map(() => 0);
  const order = [];
  let last = -1;
  path.forEach(ni => {
    const p = net.nodes[ni];
    let bestL = -1, bestD = R;
    LANDMARKS.forEach((L, li) => {
      let d = Infinity; L.pts.forEach(q => { const dd = toM(p, q); if (dd < d) d = dd; });
      if (d < bestD) { bestD = d; bestL = li; }
    });
    if (bestL >= 0) { counts[bestL]++; if (bestL !== last) { order.push(bestL); last = bestL; } }
    else last = -1;
  });
  let dom = -1, domC = 0;
  counts.forEach((c, i) => { if (c > domC) { domC = c; dom = i; } });
  // ordered, de-duplicated landmark names the walk passes
  const areas = []; const seen = new Set();
  order.forEach(i => { if (!seen.has(i)) { seen.add(i); areas.push(LANDMARKS[i].name); } });
  const longest = legs && legs.length ? legs.slice().sort((a, b) => b.m - a.m)[0] : null;
  const where = (dom >= 0 && domC >= 3) ? `explore near ${LANDMARKS[dom].name}`
    : longest ? `mostly along ${longest.name}` : 'a loop from your start';
  return { where, areas };
}

// Build up to 3 DISTINCT walk options, each a different strategy, that thread the
// streets matching the user's vibe. A street counts as a "vibe street" when its
// alignment clears MIN_CRIT_FRAC of the maximum achievable (slider-relative, so a
// stronger slider push raises the bar) — that is the user's "minimum criteria".
//   1. Your top streets — restricted to the displayed top-ranked streets (up to 38 min).
//   2. Nearby & easy     — a SHORTER local walk (~25 min), proximity strongly favoured —
//                          this is the "there's a good spot nearby, no need to go far" one.
//   3. Explore more      — covers more ground (up to 38 min), avoiding streets 1 & 2 used.
// The three deliberately span ~25–38 min so the user can pick a shorter or longer walk.
// planWalk is randomised, so we try a few times per strategy and keep the densest; we
// drop a strategy whose route duplicates an earlier one.
const MIN_CRIT_FRAC = 0.30;   // "at least ~30% aligned with your sliders"
const NEARBY_BUDGET_M = 25 * WALK_SPEED_M_MIN;   // ~25 min for the short local option
function makeWalkOptions(net, idx, weights, startNode, budgetM, displayedIds, parkEdges) {
  const { reward: rewardOf, wsum } = vibeRewardFn(net, idx, weights);
  const minCrit = MIN_CRIT_FRAC * wsum;
  // Park mode: reward for stepping into a park walk. Sized ~ a perfectly-aligned
  // street (wsum) so parks compete fairly with the top vibe streets and at least one
  // gets threaded in — but not so high the route beelines to a park ignoring the vibe.
  const parkReward = parkEdges && parkEdges.size ? Math.max(wsum, 0.8) : 0;
  const isVibe = (name) => { const id = idx.nameToId.get(name); return id != null && rewardOf(id) >= minCrit; };
  const strategies = [
    { label: 'Your top streets', budget: budgetM, opt: { prizeIds: displayedIds, minReward: -Infinity, detourExp: 1 } },
    { label: 'Nearby & easy', budget: NEARBY_BUDGET_M, opt: { minReward: minCrit, detourExp: 2, minBudgetM: 1500 } },
    { label: 'Explore more', budget: budgetM, opt: { minReward: minCrit, detourExp: 1.3 } },
  ];
  const out = [];
  const usedNames = new Set();   // diversity: later strategies avoid earlier streets
  const seenKeys = new Set();
  for (const st of strategies) {
    let best = null, bestDensity = -Infinity;
    for (let tries = 0; tries < 6; tries++) {
      const o = Object.assign({}, st.opt);
      if (st.label === 'Explore more') o.avoidNames = usedNames;
      if (parkReward) { o.parkEdges = parkEdges; o.parkReward = parkReward; }
      const plan = planWalk(net, idx, weights, startNode, st.budget, o);
      if (!plan || plan.path.length < 2) continue;
      // rank runs by vibe DENSITY (reward per metre), not total reward — otherwise
      // the longest 38-min route always wins and the walk never wraps up early.
      const density = plan.reward / plan.len;
      if (density > bestDensity) { bestDensity = density; best = plan; }
    }
    if (!best) continue;
    const { line, routeFC, sequence, legs, endPoint } = describeWalk(net, best, isVibe);
    const streets = [...new Set(legs.map(l => l.name))];
    const key = streets.join('>');
    if (seenKeys.has(key)) continue;            // skip a duplicate route
    seenKeys.add(key);
    const yours = streets.filter(isVibe);       // the streets that meet the criteria
    yours.forEach(s => usedNames.add(s));        // feed diversity for the next strategy
    const { where, areas } = describePlace(net, best.path, legs);
    // marquee = the walk's strongest vibe street (the one to preview): highest
    // reward among "yours"; falls back to the longest named leg if none qualify.
    const marquee = yours.length
      ? yours.map(n => ({ n, r: rewardOf(idx.nameToId.get(n)) })).sort((a, b) => b.r - a.r)[0].n
      : (legs.length ? legs.slice().sort((a, b) => b.m - a.m)[0].name : null);
    out.push({ label: st.label, line, routeFC, sequence, legs, streets, yours, isVibe, where, areas, marquee, endPoint,
      len: best.len, reward: best.reward, min: Math.round(best.len / WALK_SPEED_M_MIN) });
  }
  return out;
}

// PRESET vibe chips — named shortcuts that pin the vibe axes to a fixed target,
// so the user gets a curated feel without touching the sliders. Values are in the
// per-street axis space (all in [-1,+1]): touristy_local (−touristy/+local),
// raw_polished (−raw/+polished), historic_contemporary (−historic/+contemporary),
// quiet_lively (−quiet/+lively), local_chain (−local/+chain), greenery (−/+green).
//   "Quiet nature" still points at the recommended nature WALKS (a route layer),
//   not a vibe target, since a walk is what the user acts on there.
const VIBE_PRESETS = [
  { id: 'authentic', label: 'Local & authentic', emoji: '🏮',
    target: { touristy_local: 1, raw_polished: -1, local_chain: -1 } },  // Local + Raw + Independent
  { id: 'nature', label: 'Quiet nature', emoji: '🍃', nature: true },  // → nature walks
  { id: 'heritage', label: 'Heritage', emoji: '🏯',
    target: { historic_contemporary: -1, touristy_local: -0.4 } },  // Historic + a bit Touristy
  { id: 'modern', label: 'Lively & modern', emoji: '🌆',
    target: { historic_contemporary: 1, raw_polished: 1, quiet_lively: 1 } },  // Contemporary + Polished + Lively
];

/* ============================================================
   SEARCH BAR + CHIPS
   ============================================================ */
function SearchBar({ query, setQuery, onSubmit, onClear, hasResults }) {
  const t = React.useContext(ThemeCtx);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)',
      border: '1.5px solid var(--line)', borderRadius: t.radiusPill, padding: '4px 6px 4px 14px',
      boxShadow: 'var(--shadow)' }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: '0 0 auto' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
      <input value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(query); }}
        placeholder="a street, a bakery, a quiet lane…"
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: t.fontUI, fontSize: 14, color: 'var(--ink)', padding: '8px 0' }} />
      {(query || hasResults) &&
        <button onClick={onClear} title="Clear"
          style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'var(--card-2)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
      <button onClick={() => onSubmit(query)} title="Search"
        style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

function ChipRow({ activeKind, onVibe, onPreset, onCategory }) {
  const t = React.useContext(ThemeCtx);
  const scRef = React.useRef(null);
  // drag-to-scroll: the row overflows but the scrollbar is hidden and a desktop
  // wheel scrolls vertically, so we make it draggable (like a touch swipe) and
  // map vertical wheel deltas to horizontal scroll.
  const drag = React.useRef({ down: false, moved: false, startX: 0, startScroll: 0 });
  const onPointerDown = (e) => {
    drag.current = { down: true, moved: false, startX: e.clientX, startScroll: scRef.current.scrollLeft };
  };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d.down) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 4) { d.moved = true; try { scRef.current.setPointerCapture(e.pointerId); } catch (x) {} }
    if (d.moved) scRef.current.scrollLeft = d.startScroll - dx;
  };
  const onPointerUp = () => { drag.current.down = false; };
  // if the pointer moved, swallow the click so a drag doesn't fire a chip
  const onClickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } };
  const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scRef.current.scrollLeft += e.deltaY; };

  const chip = (on) => ({ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 12px', borderRadius: t.radiusPill, cursor: 'pointer', fontFamily: t.fontUI,
    fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
    background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--accent-ink)' : 'var(--ink-soft)' });
  return (
    <div ref={scRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp} onClickCapture={onClickCapture} onWheel={onWheel}
      style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '10px 2px 2px',
        WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', cursor: 'grab', userSelect: 'none' }}>
      <button onClick={onVibe} style={chip(activeKind === 'vibe')}>✦ My vibe</button>
      {VIBE_PRESETS.map(p => (
        <button key={p.id} onClick={() => onPreset(p)}
          style={chip(activeKind === 'preset:' + p.id)}>{p.emoji} {p.label}</button>
      ))}
      {CATEGORIES.map(g => (
        <button key={g.id} onClick={() => onCategory(g)}
          style={chip(activeKind === 'cat:' + g.id)}>{g.emoji} {g.label}</button>
      ))}
    </div>
  );
}

/* ============================================================
   IN-MAP VIBE SLIDERS — a compact copy of screen 1B's sliders that
   floats over the map so the user can tweak the vibe and watch the
   heat cloud re-rank live. It reads/writes the SAME persisted keys
   (sliders.vals / sliders.off) as SlidersScreen, so the two stay in
   sync. Every change calls onVibeChange(vals, off) to re-rank.
   ============================================================ */
function MiniVibeSlider({ axis, value, onChange, onDrop }) {
  const trackRef = React.useRef(null);
  const dragging = React.useRef(false);
  const setFromClient = (x) => { const r = trackRef.current.getBoundingClientRect(); onChange(clamp((x - r.left) / r.width, 0, 1)); };
  const down = (e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} setFromClient(e.clientX); };
  const move = (e) => { if (dragging.current) setFromClient(e.clientX); };
  const up = () => { dragging.current = false; };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: value < 0.5 ? 'var(--ink)' : 'var(--ink-faint)' }}>{axis.left}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: value >= 0.5 ? 'var(--ink)' : 'var(--ink-faint)' }}>{axis.right}</span>
          {onDrop && (
            <button onClick={onDrop} title="Don't factor this in"
              style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'var(--card-2)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          )}
        </span>
      </div>
      <div ref={trackRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 999, background: 'var(--line)' }} />
        <div style={{ position: 'absolute', left: 0, width: `${value * 100}%`, height: 3, borderRadius: 999, background: 'var(--accent)', opacity: 0.55 }} />
        <div style={{ position: 'absolute', left: `${value * 100}%`, transform: 'translateX(-50%)', width: 16, height: 16, borderRadius: '50%',
          background: 'var(--card)', border: '2px solid var(--accent)', boxShadow: 'var(--shadow)' }} />
      </div>
    </div>
  );
}

// Greenery control: two buttons ("Leafy street" / "Park") instead of a bipolar
// slider, because the two ends aren't opposites — they're two doses of green. One
// is always selected while active; the × drops the whole axis (→ a "+ Greenery"
// chip to add back), exactly like the × on the other sliders.
function GreeneryButtons({ mode, onMode, onDrop }) {
  const t = React.useContext(ThemeCtx);
  const btn = (val, label, sub) => {
    const sel = mode === val;
    return (
      <button onClick={() => onMode(val)}
        style={{ flex: 1, padding: '7px 6px', borderRadius: t.radiusSm, cursor: 'pointer', fontFamily: t.fontUI,
          border: '1px solid ' + (sel ? 'var(--ink)' : 'var(--line)'), background: sel ? 'var(--ink)' : 'var(--card)',
          color: sel ? '#fff' : 'var(--ink-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 11.5 }}>{label}</span>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{sub}</span>
      </button>
    );
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)' }}>Greenery</span>
        {onDrop && (
          <button onClick={onDrop} title="Don't factor this in"
            style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'var(--card-2)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {btn('leafy', 'Leafy street', 'a little green')}
        {btn('park', 'Park', 'a green walk')}
      </div>
    </div>
  );
}

function VibeSlidersPanel({ onVibeChange, onClose }) {
  const t = React.useContext(ThemeCtx);
  const [vals, setVals] = usePersist('sliders.vals', Object.fromEntries(VIBE_AXES.map(a => [a.id, a.def])));
  const [off, setOff] = usePersist('sliders.off', []);
  const [greenMode, setGreenMode] = usePersist('sliders.greenMode', 'off');
  // greenery is handled by its own two-button control, not as a slider row
  const active = VIBE_AXES.filter(a => a.id !== 'green' && !off.includes(a.id));
  const muted = VIBE_AXES.filter(a => a.id !== 'green' && off.includes(a.id));
  const set = (id, v) => { const nv = { ...vals, [id]: v }; setVals(nv); onVibeChange(nv, off, greenMode); if (window.StudyAPI) window.StudyAPI.logSlider(id, v); };
  const drop = (id) => { const no = off.includes(id) ? off : [...off, id]; setOff(no); onVibeChange(vals, no, greenMode); };
  const restore = (id) => { const no = off.filter(x => x !== id); setOff(no); onVibeChange(vals, no, greenMode); };
  const onGreen = (m) => { setGreenMode(m); onVibeChange(vals, off, m); };
  return (
    <div style={{ marginTop: 8, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: t.radius,
      boxShadow: 'var(--shadow)', padding: '10px 12px 12px', maxHeight: '48vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, flex: '0 0 auto' }}>
        <span style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>Tune your vibe · live</span>
        <button onClick={onClose} aria-label="Close vibe sliders"
          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--card-2)',
            color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {greenMode !== 'off' && <GreeneryButtons mode={greenMode} onMode={onGreen} onDrop={() => onGreen('off')} />}
        {greenMode !== 'off' && <div style={{ borderTop: '1px solid var(--line)' }} />}
        {active.map(a => (
          <MiniVibeSlider key={a.id} axis={a} value={vals[a.id] ?? 0.5}
            onChange={v => set(a.id, v)} onDrop={() => drop(a.id)} />
        ))}
        {active.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', textAlign: 'center', padding: '4px 0' }}>No dimensions — add one back below.</div>
        )}
        {(muted.length > 0 || greenMode === 'off') && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 9, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {greenMode === 'off' && (
              <button onClick={() => onGreen('leafy')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 999, border: '1px solid var(--line)',
                  background: 'var(--card)', color: 'var(--ink-soft)', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: t.fontUI }}>
                <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--accent)' }}>+</span>Greenery
              </button>
            )}
            {muted.map(a => (
              <button key={a.id} onClick={() => restore(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 999, border: '1px solid var(--line)',
                  background: 'var(--card)', color: 'var(--ink-soft)', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: t.fontUI }}>
                <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--accent)' }}>+</span>{a.left} ↔ {a.right}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   LOCAL FAVORITE — "streets locals love" (the local thread),
   reimplemented natively so it lives inside the app like the
   other screens. This DUPLICATES the standalone page
   street-character-locals-jongno.html on purpose — we keep both
   for now and drop whichever copy we don't use later.

   Same WANDER palette + progressive disclosure by zoom:
     below MAIN_MINZOOM   → only the headline corridor spines
     MAIN_MINZOOM..BRANCH → all corridor spines
     above BRANCH_MINZOOM → spines + their side-alley branches
   Tap a cobalt thread to read the corridor's ambiance sentence.
   ============================================================ */
const LOCALS_MAIN_MINZOOM = 14.5;
const LOCALS_BRANCH_MINZOOM = 15.5;

// Popup styling for the ambiance card (scoped by the .amb/.name classes, so it
// never touches the search map's default popups). Hexes mirror the WANDER tokens.
const LOCALS_POPUP_CSS = `
.maplibregl-popup-content{font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif;border-radius:12px;padding:12px 14px;max-width:270px;box-shadow:0 4px 18px rgba(0,0,0,.16);}
.maplibregl-popup-content .name{font-size:15px;font-weight:700;color:#143229;display:block;margin-bottom:5px;}
.maplibregl-popup-content .amb{font-size:13px;color:#143229;line-height:1.5;font-weight:600;}
.maplibregl-popup-content .amb-ko{display:block;font-size:11.5px;color:#5E8A7C;line-height:1.45;font-weight:400;margin-top:4px;}
.maplibregl-popup-content .links{display:block;margin-top:8px;font-size:11px;}
.maplibregl-popup-content a{color:#4456FF;text-decoration:none;font-weight:600;}
`;

function LocalFavoriteView() {
  const t = React.useContext(ThemeCtx);
  const elRef = React.useRef(null);
  const [status, setStatus] = React.useState('Loading…');

  React.useEffect(() => {
    if (!window.maplibregl) { setStatus('⚠️ MapLibre failed to load (offline?).'); return; }
    let cancelled = false;
    const map = new maplibregl.Map({
      container: elRef.current, style: buildBaseStyle(),
      bounds: [[JONGNO_BBOX[0], JONGNO_BBOX[1]], [JONGNO_BBOX[2], JONGNO_BBOX[3]]],
      fitBoundsOptions: { padding: 20 }, attributionControl: false,
    });
    // zoom bottom-right; the collapsed (i) attribution bottom-LEFT, lifted just
    // above the legend (see the scoped .rms-localsmap CSS below). This map's frame
    // already stops above the tab bar (bottom: MAP_TAB_H), so nothing is clipped.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      if (cancelled) return;
      // start the (i) attribution collapsed (small dot), not the expanded bar.
      map.getContainer().querySelectorAll('.maplibregl-compact-show').forEach(el => el.classList.remove('maplibregl-compact-show'));
      map.addSource('fil', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // Shared paint for the cobalt thread: a white casing under a thin dashed
      // accent line — same "dashed accent route + halo" pattern as the search map.
      const ACCENT = MAP_PAL.accent;
      const THREAD_WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 1.6, 15, 3, 18, 5];
      const CASING_WIDTH = ['interpolate', ['linear'], ['zoom'], 12, 3.5, 15, 6, 18, 9];
      const IS_MAIN = ['==', ['get', 'part'], 'main'];
      const IS_BRANCH = ['==', ['get', 'part'], 'branch'];

      const lineIds = [];
      function addThread(id, filter, minzoom, opacity) {
        const common = { source: 'fil', filter, ...(minzoom != null ? { minzoom } : {}) };
        map.addLayer({ id: id + '-casing', type: 'line', ...common,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fffdf9', 'line-width': CASING_WIDTH, 'line-opacity': 0.8 } });
        map.addLayer({ id, type: 'line', ...common,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: { 'line-color': ACCENT, 'line-width': THREAD_WIDTH, 'line-opacity': opacity, 'line-dasharray': [2, 1.6] } });
        lineIds.push(id);
      }

      // Tier 1 — headline spines (always). Tier 2 — the rest of the spines
      // (from MAIN_MINZOOM). Tier 3 — side-alley branches (only when zoomed in).
      addThread('fil-main-head', ['all', IS_MAIN, ['get', 'headline']], null, 0.95);
      addThread('fil-main-sec', ['all', IS_MAIN, ['!', ['get', 'headline']]], LOCALS_MAIN_MINZOOM, 0.9);
      addThread('fil-branch', IS_BRANCH, LOCALS_BRANCH_MINZOOM, 0.85);

      // One name label per corridor, on the spine only (two tiers, like the lines).
      const labelLayout = {
        'symbol-placement': 'line', 'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 15],
      };
      const labelPaint = { 'text-color': '#2b36b5', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 };
      map.addLayer({ id: 'fil-label-head', type: 'symbol', source: 'fil',
        filter: ['all', IS_MAIN, ['get', 'headline']], layout: labelLayout, paint: labelPaint });
      map.addLayer({ id: 'fil-label-sec', type: 'symbol', source: 'fil', minzoom: LOCALS_MAIN_MINZOOM,
        filter: ['all', IS_MAIN, ['!', ['get', 'headline']]], layout: labelLayout, paint: labelPaint });

      // Cache-bust so a stale geojson can't mask an update.
      fetch('street-character-locals-jongno.geojson?v=' + Date.now()).then(r => r.json()).then(gj => {
        if (cancelled) return;
        map.getSource('fil').setData(gj);
        const spines = (gj.features || []).filter(f => f.properties.part === 'main');
        const head = spines.filter(f => f.properties.headline).length;
        setStatus(`${spines.length} corridors · ${head} featured`);
      }).catch(() => setStatus('geojson not found'));

      // Popup: corridor name + ambiance sentence (en hero, ko companion) + wiki links.
      const showPopup = (e) => {
        const p = e.features[0].properties;
        let html = `<span class="name">${p.name}</span>`;
        const en = p.description_en, ko = p.description;
        if (en || ko) {
          const koLine = (en && ko) ? `<span class="amb-ko">${ko}</span>` : '';
          html += `<div class="amb">${en || ko}${koLine}</div>`;
        }
        const links = [];
        if (p.wikidata) links.push(`<a href="https://www.wikidata.org/wiki/${p.wikidata}" target="_blank" rel="noopener">Wikidata</a>`);
        if (p.wikipedia || p.wikidata) links.push(`<a href="https://ko.wikipedia.org/wiki/${encodeURIComponent(p.name)}" target="_blank" rel="noopener">Wikipédia</a>`);
        if (links.length) html += `<span class="links">${links.join(' · ')}</span>`;
        new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      };
      lineIds.forEach(id => {
        map.on('click', id, showPopup);
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });
    });

    return () => { cancelled = true; map.remove(); };
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: MAP_TAB_H, zIndex: 15,
      display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <style>{LOCALS_POPUP_CSS}</style>

      {/* compact header — leaves the map as much room as possible */}
      <div style={{ flex: '0 0 auto', padding: '10px 16px 8px' }}>
        <div style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>Jongno-gu · streets locals love</div>
        <div style={{ fontFamily: t.fontHead, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em', margin: '3px 0', color: 'var(--ink)' }}>The local thread</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          The streets with <b style={{ color: 'var(--ink)' }}>real character</b> — the ones with an ambiance
          sentence, not just a shop count. <b style={{ color: 'var(--ink)' }}>Zoom in</b> to reveal secondary
          streets and then side alleys. Tap a line to read its character.
        </div>
      </div>

      {/* the map fills the rest, with the legend floating bottom-left */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* lift the bottom-left (i) attribution just above the ~82px legend box
            (legend sits at bottom:12), so the little dot rests right over it. */}
        <style>{`.rms-localsmap .maplibregl-ctrl-bottom-left { bottom: 100px; }`}</style>
        <div ref={elRef} className="rms-localsmap" style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 2, maxWidth: '62%',
          background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          border: '1px solid var(--line)', borderRadius: 12, padding: '9px 11px',
          fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
          <b style={{ display: 'block', color: 'var(--ink)', fontSize: 11.5, marginBottom: 3 }}>Streets locals love</b>
          <span style={{ display: 'inline-block', width: 22, height: 0, verticalAlign: 'middle', marginRight: 6, borderTop: '2.5px dashed var(--accent)' }} />
          dashed line = characterful street
          <span style={{ display: 'block', marginTop: 4, fontSize: 10 }}>{status}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BOTTOM TAB BAR — sub-navigation inside the detailed map:
   "Search" (the live map + unified search) and "Local favorite"
   (the streets-locals-love thread, embedded in mobile format).
   The Local-favorite icon joins a location pin with a heart,
   after the saved-place marker in the brief image.
   ============================================================ */
const MAP_TAB_H = 66;   // tab-bar height, incl. room for the phone's home indicator

function MapTabBar({ tab, setTab }) {
  const t = React.useContext(ThemeCtx);
  const items = [
    { id: 'search', label: 'Search',
      icon: (on) => (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none"
          stroke={on ? 'var(--accent)' : 'var(--ink-faint)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>) },
    { id: 'locals', label: 'Local favorite',
      icon: (on) => (
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none"
          stroke={on ? 'var(--accent)' : 'var(--ink-faint)'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {/* location pin — adapts to the active/inactive colour */}
          <path d="M12 22s7-6.1 7-12A7 7 0 0 0 5 10c0 5.9 7 12 7 12z" />
          {/* heart nested inside — kept a warm red, echoing the saved-place marker */}
          <path d="M12 13.6c-1-.9-3-2.2-3-3.9a1.7 1.7 0 0 1 3-1.05 1.7 1.7 0 0 1 3 1.05c0 1.7-2 3-3 3.9z"
            fill="#FF4D5E" stroke="#FF4D5E" strokeWidth="1" />
        </svg>) },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, height: MAP_TAB_H,
      display: 'flex', alignItems: 'stretch', justifyContent: 'space-around', paddingTop: 8, paddingBottom: 14,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      borderTop: '1px solid var(--line)' }}>
      {items.map(it => {
        const on = it.id === tab;
        return (
          <button key={it.id} onClick={() => setTab(it.id)}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0' }}>
            {it.icon(on)}
            <span style={{ fontFamily: t.fontUI, fontSize: 11, fontWeight: on ? 800 : 600,
              color: on ? 'var(--ink)' : 'var(--ink-faint)' }}>{it.label}</span>
          </button>);
      })}
    </div>);
}

/* ============================================================
   ROUTE SEQUENCE — the drawn walk presented in the sheet as an
   ordered départ → … → arrivée itinerary (an OPEN walk, so it ends
   at a distinct ◆ finish, not back at the ● start):
     · an "anticipation" card up top — a curated photo of the walk's
       strongest vibe street + its LLM ambiance sentence (ko + en),
       so the user sees what's coming before setting off;
     · a legend (vibe segment vs link);
     · a vertical timeline where vibe legs are bold accent cards and
       connectors collapse to a discreet "N min link" row.
   Tapping any leg pans the map to that stretch (onPan).
   ============================================================ */
function RouteSequence({ stats, seq, onPan }) {
  const t = React.useContext(ThemeCtx);
  if (!stats) return null;
  const m = stats.marquee;
  const min = (metres) => Math.max(1, Math.round(metres / WALK_SPEED_M_MIN));
  const rail = (node, tail) => (
    <div style={{ flex: '0 0 22px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {node}
      {tail}
    </div>
  );
  const bar = (conn) => (
    <div style={{ width: conn ? 2 : 4, flex: 1, minHeight: 14, borderRadius: 2, margin: '2px 0',
      background: conn ? 'repeating-linear-gradient(var(--line-strong),var(--line-strong) 3px,transparent 3px,transparent 6px)' : 'var(--accent)' }} />
  );
  const dot = (style) => <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2.5px solid var(--accent)', marginTop: 2, ...style }} />;
  return (
    <div>
      {/* anticipation card — ONLY when there's a photo (the real preview value). Its
          LLM sentence is dropped here because it already appears in the street's step
          card below; with no photo the card would just duplicate that text, so we skip it. */}
      {m && m.photoSrc && (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 16, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <img src={m.photoSrc} alt={m.name} style={{ display: 'block', width: '100%', height: 150, objectFit: 'cover' }} />
            <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(20,50,41,.82)', color: '#fff',
              fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 999, letterSpacing: '.04em' }}>The highlight of your walk</span>
          </div>
          <div style={{ padding: '11px 13px 12px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{m.name}</div>
            {m.credit && <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 7 }}>Photo {m.credit} · already blurred</div>}
          </div>
        </div>
      )}

      {/* legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 2px 14px', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>
        <span><i style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, width: 22, height: 5, borderRadius: 3, background: 'var(--accent)' }} />matches your vibe</span>
        <span><i style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, width: 22, height: 0, borderTop: '2px dashed #9db0ac' }} />link</span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '2px 0 10px' }}>Start → … → finish</div>

      {/* timeline */}
      <div>
        {/* start */}
        <div style={{ display: 'flex', gap: 12 }}>
          {rail(dot({ background: 'var(--accent)' }), bar(true))}
          <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Start</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', marginTop: 2 }}>your position</div>
          </div>
        </div>

        {(seq || []).map((s, i) => {
          if (s.type === 'connector') {
            return (
              <div key={'s' + i} style={{ display: 'flex', gap: 12 }}>
                {rail(<div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', border: '2px solid var(--line-strong)', marginTop: 4 }} />, bar(true))}
                <div style={{ flex: 1, paddingBottom: 12, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)', padding: '4px 0' }}>{min(s.m)} min link</div>
                </div>
              </div>
            );
          }
          // a named leg — bold accent card if it's a vibe street, modest row otherwise
          return (
            <div key={'s' + i} style={{ display: 'flex', gap: 12 }}>
              {rail(dot(s.vibe ? {} : { borderColor: 'var(--line-strong)' }), bar(!s.vibe))}
              <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
                {s.vibe ? (
                  <button onClick={() => onPan && onPan(s.at, s.name)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: 'var(--accent-soft)', border: '1px solid #cfd4ff', borderRadius: 12, padding: '10px 12px' }}>
                    <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--accent)',
                      background: '#fff', border: '1px solid #cfd4ff', borderRadius: 999, padding: '2px 7px', marginBottom: 6 }}>YOUR VIBE · {s.m} m</span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{s.name}</span>
                    {s.en && <span style={{ display: 'block', fontSize: 12, lineHeight: 1.45, fontWeight: 600, color: 'var(--ink-soft)', marginTop: 5 }}>{s.en}</span>}
                    {s.ko && <span style={{ display: 'block', fontSize: 10.5, lineHeight: 1.4, color: 'var(--ink-faint)', marginTop: 2 }}>{s.ko}</span>}
                  </button>
                ) : (
                  <button onClick={() => onPan && onPan(s.at, s.name)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 0' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>{s.name}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-faint)', marginTop: 1 }}>{s.m} m</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* finish — a ◆ diamond, the open walk ends here */}
        <div style={{ display: 'flex', gap: 12 }}>
          {rail(<div style={{ width: 13, height: 13, background: 'var(--accent)', border: '2.5px solid var(--accent)', transform: 'rotate(45deg)', marginTop: 3 }} />, null)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Finish</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', marginTop: 2 }}>{stats.where || 'end of your walk'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small pill telling whether the map is following a real GPS fix or resting on the
// demo start. Visible on purpose: during the study you must be able to see at a
// glance that the position (and therefore the recorded trace) is live, without
// opening a console — a silent geolocation failure would cost a whole session.
function GpsBadge({ status }) {
  const L = {
    pending: ['#8FA6A1', 'GPS…'],
    live: [MAP_PAL.good, 'GPS live'],
    outside: ['#E0A11B', 'Outside zone · demo'],
    off: ['#C0392B', 'No GPS · demo'],
  }[status];
  if (!L) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
      color: 'var(--ink-soft)', background: 'var(--card)', borderRadius: 999, padding: '5px 10px',
      boxShadow: 'var(--shadow)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: L[0], flex: '0 0 auto' }} />{L[1]}
    </span>
  );
}

/* ============================================================
   THE MAP SCREEN
   ============================================================ */
function RealMapScreen() {
  const t = React.useContext(ThemeCtx);
  const mapEl = React.useRef(null);
  const mapRef = React.useRef(null);
  const scFeats = React.useRef([]);      // street-character features (function + place)
  const vibeFeats = React.useRef([]);    // NLP-scored named streets (vibe)
  const natureFeats = React.useRef([]);  // recommended nature walks (nature category)
  const dongFeats = React.useRef([]);    // administrative dong polygons (neighbourhood search)
  const netRef = React.useRef(null);     // routing graph (walk-net-jongno.json)
  const routeIdxRef = React.useRef(null);// precomputed normalised axes + adjacency
  const parkEdgesRef = React.useRef(null);// graph edges inside park walks (Park mode routing), memoised
  const startNodeRef = React.useRef(null);// walk departure, snapped to a graph node
  const puckRef = React.useRef(null);    // "you are here" marker (moves with each fix)
  const puckPopupRef = React.useRef(null);// its popup — text depends on the GPS state
  const gpsRef = React.useRef(null);     // last real fix {lng, lat, acc, ts}
  const gpsStatusRef = React.useRef('pending'); // 'pending'|'live'|'outside'|'off'
  const gpsCenteredRef = React.useRef(false);   // recentre only on the FIRST usable fix
  const demoNoticeRef = React.useRef(false);    // "outside the zone" popup shown once
  const greenModeRef = React.useRef(readGreenMode()); // 'off' | 'leafy' | 'park'
  const natureMarkersRef = React.useRef([]);          // green name bubbles for park walks
  const localsIdxRef = React.useRef({});   // street name → LLM ambiance sentence {ko, en}
  const commerceIdxRef = React.useRef({}); // street name → parsed commerce signature [[cat, n], …]
  const photoIdxRef = React.useRef({});    // street name → curated onboarding photo {src, credit}
  const endMarkerRef = React.useRef(null); // ◆ route-end marker (open walk finishes elsewhere)
  const anchorMarkersRef = React.useRef([]);// landmark anchor pins dropped along a drawn route
  const panPopupRef = React.useRef(null);  // the single street label shown when a leg is tapped
  const resultPopupRef = React.useRef(null);// the single result card popup (list/map tap) — replaced, never stacked
  const geomIdxRef = React.useRef({});     // normalised street name → GeoJSON geometry (for friend-fav badges)
  const friendFavsRef = React.useRef({});  // normalised street name → [friend display names] who shared it
  const friendFavMarkersRef = React.useRef([]);// ♥ markers dropped on friend-favorited streets

  const [status, setStatus] = React.useState('Loading the neighbourhood…');
  // Mirror of gpsStatusRef, only so the badge can repaint. Kept as the ONLY piece of
  // GPS state in React: the accuracy changes on every fix and lives in the marker
  // popup (plain DOM) instead, so a 1 Hz GPS stream can't re-render this screen.
  const [gpsStatus, setGpsStatus] = React.useState('pending');
  const [tab, setTab] = React.useState('search');     // bottom nav: 'search' | 'locals'
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState(null);       // 'vibe' | 'function:<id>' | 'place'
  const [title, setTitle] = React.useState('');
  const [results, setResults] = React.useState([]);
  // Mirror `results` into a ref: the map's click handler is registered once at
  // load time, so its closure would otherwise keep pointing at the first (empty)
  // results array and never find the tapped street. The ref always holds latest.
  const resultsRef = React.useRef([]);
  resultsRef.current = results;
  // Split a leading emoji off the title so the icon and label align on one row —
  // a bare emoji left inside the head font sits off the text baseline otherwise.
  const _titleMatch = (title || '').match(/^(\p{Extended_Pictographic}️?)\s+(.*)$/u);
  const titleIcon = _titleMatch ? _titleMatch[1] : '';
  const titleText = _titleMatch ? _titleMatch[2] : title;
  const [selected, setSelected] = React.useState(null);
  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [showSliders, setShowSliders] = React.useState(false);  // in-map vibe sliders panel
  const [routeStats, setRouteStats] = React.useState(null);  // {m, min, where, marquee} of the drawn walk
  const [routeSeq, setRouteSeq] = React.useState(null);      // ordered départ→…→arrivée steps for the sheet
  const [walkOptions, setWalkOptions] = React.useState(null);// proposed walks joining the vibe streets
  const [vibeStreets, setVibeStreets] = React.useState(null);// the street list to return to from a walk
  const routeTargetRef = React.useRef(null);                 // the vibe target the streets came from
  // Build the favorite object for a result — its real geometry stored as a
  // compact thumbnail so the profile can draw the street's actual shape.
  function favFromResult(r) {
    return {
      name: r.name,
      sub: r.sub || '',
      traits: r.traits || '',                // the street's standout character (vibe results only)
      points: geomToThumb(r.feature && r.feature.geometry),
      kind: r.type === 'nature' ? 'nature' : 'street',
    };
  }

  // ---- friends' shared favorites → ♥ badges on the map ----
  // Seed from whatever the study client already cached, then stay live with the
  // friend poll's 'seoulwalk:friendfavorites' broadcasts.
  React.useEffect(() => {
    const S = window.StudyAPI;
    if (S && S.myFriendFavorites) applyFriendFavs(S.myFriendFavorites());
    const onFF = e => applyFriendFavs((e.detail && e.detail.favorites) || []);
    window.addEventListener('seoulwalk:friendfavorites', onFF);
    return () => window.removeEventListener('seoulwalk:friendfavorites', onFF);
  }, []);

  // ---- init the map once, on mount ----
  React.useEffect(() => {
    if (!window.maplibregl) { setStatus('⚠️ MapLibre failed to load (offline?).'); return; }
    let cancelled = false;
    const map = new maplibregl.Map({
      container: mapEl.current, style: buildBaseStyle(),
      bounds: [[JONGNO_BBOX[0], JONGNO_BBOX[1]], [JONGNO_BBOX[2], JONGNO_BBOX[3]]],
      fitBoundsOptions: { padding: 30 }, attributionControl: false,
    });
    mapRef.current = map;
    // zoom bottom-right, the collapsed (i) attribution bottom-LEFT — kept off the
    // top so the top-anchored search bar never sits on top of them.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      if (cancelled) return;

      // start the (i) attribution collapsed (small dot), not the expanded bar —
      // MapLibre opens compact controls by default, so drop the "show" class.
      map.getContainer().querySelectorAll('.maplibregl-compact-show').forEach(el => el.classList.remove('maplibregl-compact-show'));

      // base street network — every named street, faint (the "clean" canvas)
      map.addSource('streets-base', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'streets-base', type: 'line', source: 'streets-base',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.street, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2.4, 19, 5], 'line-opacity': 0.28 } });

      // Neighbourhood (동) highlight — a soft accent wash + dashed outline drawn
      // when the user searches a dong name. Sits just above the base street net so
      // the streets still read on top of the tint.
      map.addSource('dong-region', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'dong-fill', type: 'fill', source: 'dong-region',
        paint: { 'fill-color': MAP_PAL.accent, 'fill-opacity': 0.08 } });
      map.addLayer({ id: 'dong-outline', type: 'line', source: 'dong-region',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.accent, 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [2, 1.5] } });

      // Nature highlight — recommended WALKS drawn as green routes (halo + line),
      // in the design system's positive/mint-green. A white halo lifts them off
      // the teal canvas the same way the cobalt candidates read on top.
      map.addSource('green-cand', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'green-cand-halo', type: 'line', source: 'green-cand',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 5, 16, 9, 19, 15], 'line-opacity': 0.85 } });
      map.addLayer({ id: 'green-cand-line', type: 'line', source: 'green-cand',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.good, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2.6, 16, 4.5, 19, 8] } });

      // routing walk — drawn on top of everything as SEGMENTS, not one uniform line,
      // so the good bits stand out from the plumbing. The 'route' source holds one
      // feature per merged leg with { vibe: 0/1, t: 0..1 along the walk, name }.
      //   · vibe segments  → thick, solid, a light→deep accent ramp along t so the
      //     open walk reads DIRECTIONALLY (start = light, finish = deep).
      //   · connectors     → thin, faded, dashed — the parts that just link.
      // A white halo under both lifts the whole route off the map.
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-halo', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 8, 16, 13, 19, 20], 'line-opacity': 0.9 } });
      // connectors first (below the vibe segments)
      map.addLayer({ id: 'route-conn', type: 'line', source: 'route',
        filter: ['!', ['to-boolean', ['get', 'vibe']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8FA6A1', 'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 3.2, 19, 5], 'line-dasharray': [1.5, 1.6] } });
      // vibe segments on top, coloured light→deep along the walk (direction cue)
      map.addLayer({ id: 'route-vibe', type: 'line', source: 'route',
        filter: ['to-boolean', ['get', 'vibe']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['interpolate', ['linear'], ['get', 't'], 0, '#9AA6FF', 1, '#2B36B5'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 5, 16, 7.5, 19, 11] } });
      // named-street labels riding the vibe segments (the anchors on the legs)
      map.addLayer({ id: 'route-labels', type: 'symbol', source: 'route', minzoom: 13.5,
        filter: ['all', ['to-boolean', ['get', 'vibe']], ['has', 'name'], ['!=', ['get', 'name'], '']],
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 14], 'symbol-spacing': 250 },
        paint: { 'text-color': '#2B36B5', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 } });

      // highlighted candidates — the "recommended paths", drawn as a real
      // "heat cloud" with MapLibre's native heatmap layer. A heatmap needs POINTS,
      // so 'candidates-heat' holds points sampled densely along each street
      // (densifyToPoints); the line source 'candidates' is kept only as an
      // invisible hit-target so streets stay tappable. A native heatmap blends
      // continuously — no line caps/joins, so no stray dots or spurs — and the
      // density→colour ramp caps out, so crossings stay warm without hard blobs.
      map.addSource('candidates-heat', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'cand-heat', type: 'heatmap', source: 'candidates-heat',
        paint: {
          // every sample weighs the same; density comes from how many samples fall
          // within the radius, so a single street already reads hot along its spine.
          // Weight/intensity kept low so only the very spine peaks — a thin core
          // with a wide, soft falloff rather than a fat saturated ribbon.
          'heatmap-weight': 0.25,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 1, 19, 1.2],
          // radius in screen px — trimmed for a finer ribbon. Grows with zoom fast
          // enough that the ~4 m samples always overlap (no beads along the path).
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 18, 19, 34],
          // thermal ramp, PLATEAUED at the top and with a long soft tail at the
          // bottom. The hot yellow core only appears from density 0.65 (a thin
          // spine) and then HOLDS to 1, so junctions where paths glue together land
          // on the same yellow instead of flaring brighter. Most of the range
          // (0 → 0.65) is a gently-strengthening orange, so the edges feather out
          // softly instead of ending on a hard line.
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(255,106,31,0)',
            0.08, 'rgba(255,138,61,0.16)',
            0.22, 'rgba(255,138,61,0.5)',
            0.38, MAP_PAL.heatMid,
            0.52, MAP_PAL.heatInner,
            0.65, MAP_PAL.heatCore,
            1,    MAP_PAL.heatCore],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.82, 19, 0.78],
        } });

      // invisible line over the same streets — carries clicks / hover only.
      map.addSource('candidates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'cand-line', type: 'line', source: 'candidates',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.heatCore, 'line-opacity': 0,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 16, 19, 22] } });

      map.on('click', 'cand-line', e => selectResultByName(e.features[0].properties.name));
      map.on('mouseenter', 'cand-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'cand-line', () => { map.getCanvas().style.cursor = ''; });
      // nature walks are clickable too
      map.on('click', 'green-cand-line', e => { const n = e.features[0].properties.name; if (n) selectResultByName(n); });
      map.on('mouseenter', 'green-cand-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'green-cand-line', () => { map.getCanvas().style.cursor = ''; });

      // "You are here" puck — created here (not with the routing graph) so it shows
      // up as soon as the map is ready and the geolocation watch has something to
      // move, whether or not walk-net-jongno.json has landed yet.
      makePuck(map);

      // ---- load the local data ----
      fetch('street-character-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        scFeats.current = (gj.features || []).filter(f => f.properties && f.properties.name);
        // Index each street's commerce signature by name so the tap popup can show
        // its top shops regardless of which search surfaced it (vibe/preset/place).
        // A street is split into several segments sharing a name, so sum the shop
        // counts per category across all of them for a representative signature.
        const cagg = {};
        scFeats.current.forEach(f => {
          const k = normName(f.properties.name);
          const bucket = cagg[k] || (cagg[k] = {});
          parseCommerceWhy(f.properties.commerce_why).forEach(([cat, n]) => { bucket[cat] = (bucket[cat] || 0) + n; });
        });
        const cidx = {};
        Object.keys(cagg).forEach(k => {
          const cats = Object.entries(cagg[k]);
          if (cats.length) cidx[k] = cats;
        });
        commerceIdxRef.current = cidx;
        // Name → geometry, so a friend's shared street (known only by name) can be
        // located on the map to drop a ♥ badge. First geometry per name wins.
        scFeats.current.forEach(f => {
          const k = normName(f.properties.name);
          if (k && f.geometry && !geomIdxRef.current[k]) geomIdxRef.current[k] = f.geometry;
        });
        map.getSource('streets-base').setData(gj);
        renderFriendFavMarkers();   // any cached friend shares now have geometry to pin
        setStatus('');
      }).catch(() => setStatus('⚠️ street-character-jongno.geojson not found.'));

      fetch('scores-named-streets-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        vibeFeats.current = (gj.features || []).filter(f => f.properties && f.properties.name);
      }).catch(() => { /* vibe path just stays empty */ });

      fetch('nature-paths-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        natureFeats.current = gj.features || [];
        natureFeats.current.forEach(f => {
          const nm = f.properties && f.properties.name;
          const k = normName(nm);
          if (k && f.geometry && !geomIdxRef.current[k]) geomIdxRef.current[k] = f.geometry;
        });
        renderFriendFavMarkers();
      }).catch(() => { /* nature category just stays empty */ });

      // administrative dong (행정동) — powers "zoom to a neighbourhood the user names".
      fetch('dong-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        dongFeats.current = (gj.features || []).filter(f => f.properties && f.properties.name);
      }).catch(() => { /* neighbourhood search just stays unavailable */ });

      // LLM ambiance sentences (the "local favorite" thread) — indexed by street name
      // so a drawn walk can show the character line of its strongest vibe street.
      fetch('street-character-locals-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        const idx = {};
        (gj.features || []).forEach(f => {
          const p = f.properties || {};
          const k = normName(p.name);
          if (p.name && (p.description || p.description_en) && !idx[k])
            idx[k] = { ko: p.description || '', en: p.description_en || '' };
        });
        localsIdxRef.current = idx;   // keyed by normalised street name (see lookupByNames)
      }).catch(() => { /* anticipation sentence just stays unavailable */ });

      // Curated street photos from the onboarding deck (window.SWIPE_CARDS, loaded by
      // swipe-data.js): real Jongno shots, already face-blurred, each snapped to a
      // street name. We reuse them as the walk's "anticipation" thumbnail instead of
      // fetching Mapillary live — see the anticipation card in the route sheet.
      try {
        const idx = {};
        (window.SWIPE_CARDS || []).forEach(c => {
          const k = normName(c.place);
          if (c.place && !idx[k]) idx[k] = { src: c.src, credit: c.credit || '' };
        });
        photoIdxRef.current = idx;   // keyed by normalised place name (see lookupByNames)
      } catch (e) { /* no photos → route falls back to the sentence only */ }

      // routing graph — powers the "38-min walk" orienteering path. Once loaded,
      // snap the walk's departure to a node (the GPS watch may already have a fix).
      fetch('walk-net-jongno.json').then(r => r.json()).then(net => {
        if (cancelled) return;
        netRef.current = net;
        routeIdxRef.current = buildRouteIndex(net);
        syncStartNode();
      }).catch(() => { /* routing just stays unavailable */ });
    });

    return () => {
      cancelled = true; map.remove(); mapRef.current = null;
      puckRef.current = null; puckPopupRef.current = null;   // destroyed with the map
    };
  }, []);

  /* ---- real GPS -----------------------------------------------------------
     The watch itself lives in App (app.jsx) so the trace survives the participant
     leaving the map screen; here we only consume what it publishes on
     'seoulwalk:gps'. Two DIFFERENT notions, deliberately kept apart:
       · where the puck is drawn  → the real fix, as long as it's in the pilot bbox
       · where the walk departs   → a node of the Jongno graph (syncStartNode)
     Outside the bbox there is no graph and no scores, so both fall back to
     FAKE_GPS and the participant is told the marker is a stand-in. That's also
     what makes the app testable from a desktop far from Seoul. */
  React.useEffect(() => {
    const apply = () => {
      const g = window.SeoulGps || { status: 'pending', fix: null };
      gpsRef.current = g.fix;
      gpsStatusRef.current = g.status;
      setGpsStatus(g.status);
      syncStartNode();
      renderPuck();
    };
    apply();      // remounting the screen must not lose the position already known
    window.addEventListener('seoulwalk:gps', apply);
    return () => window.removeEventListener('seoulwalk:gps', apply);
  }, []);

  // The puck + its popup are DOM objects living outside React, so they're built once
  // and then mutated in place rather than re-rendered.
  function makePuck(map) {
    if (puckRef.current) return;
    const el = document.createElement('div');
    el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:' + MAP_PAL.accent +
      ';border:3px solid #fff;box-shadow:0 0 0 6px ' + MAP_PAL.accent + '33, 0 2px 6px rgba(0,0,0,.4);';
    puckPopupRef.current = new maplibregl.Popup({ offset: 14, maxWidth: '240px' });
    puckRef.current = new maplibregl.Marker({ element: el }).setLngLat(FAKE_GPS)
      .setPopup(puckPopupRef.current).addTo(map);
    renderPuck();                 // a fix may have arrived before the map was ready
  }

  // Move the puck to wherever "you" are and keep its popup honest. Only a 'live' fix
  // moves it; every other state (outside the zone, no permission, no fix yet) leaves
  // it on FAKE_GPS — and the first time we settle for that, the popup opens itself so
  // the participant isn't misled into thinking the marker is their real position.
  function renderPuck() {
    const map = mapRef.current, puck = puckRef.current, pop = puckPopupRef.current;
    if (!map || !puck) return;
    const st = gpsStatusRef.current, fix = gpsRef.current;
    const live = st === 'live' && fix;
    puck.setLngLat(live ? [fix.lng, fix.lat] : FAKE_GPS);
    if (pop) {
      pop.setHTML(
        live ? '<b>You are here</b><br>live GPS · ±' + Math.round(fix.acc || 0) + ' m'
        : st === 'outside' ? '<b>You are outside the study zone</b><br>A demo marker has been placed in Jongno for now, so you can keep using the app.'
        : st === 'off' ? '<b>Demo start</b><br>No GPS (permission refused or no signal) — using the fixed Jongno start.'
        : '<b>Demo start</b><br>Waiting for a GPS fix…'
      );
    }
    if (!live && (st === 'outside' || st === 'off') && !demoNoticeRef.current) {
      demoNoticeRef.current = true;
      if (pop && !pop.isOpen()) puck.togglePopup();
    }
    // Recentre ONCE, on the first usable fix; afterwards never fight the user's panning.
    if (live && !gpsCenteredRef.current) {
      gpsCenteredRef.current = true;
      map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 15.4), duration: 700 });
    }
  }

  // Where the proposed walk departs from. Called both when the graph lands and on
  // every fix, so whichever arrives first the other one still updates it.
  function syncStartNode() {
    const net = netRef.current;
    if (!net) return;
    const fix = gpsRef.current;
    const p = (fix && gpsStatusRef.current === 'live') ? [fix.lng, fix.lat] : FAKE_GPS;
    startNodeRef.current = nearestNode(net, p[0], p[1]);
  }

  const EMPTY_FC = { type: 'FeatureCollection', features: [] };

  // ---- highlight helpers ----
  // clear both highlight layers so switching category never leaves stragglers.
  function clearHighlights() {
    const map = mapRef.current;
    if (!map) return;
    ['candidates', 'candidates-heat', 'green-cand', 'route', 'dong-region'].forEach(s => { if (map.getSource(s)) map.getSource(s).setData(EMPTY_FC); });
    clearNatureBubbles();
    clearRouteMarkers();
  }
  // Friend-favorite ♥ badges: a small heart pinned at the midpoint of every street a
  // friend has shared, so shared spots are discoverable on the map (not only when you
  // happen to tap the exact street). DOM markers, rebuilt whenever the shared list or
  // the geometry index changes. Tapping a badge opens a "Liked by X" label.
  function renderFriendFavMarkers() {
    const map = mapRef.current;
    if (!map) return;
    friendFavMarkersRef.current.forEach(m => m.remove());
    friendFavMarkersRef.current = [];
    const favs = friendFavsRef.current || {};
    Object.keys(favs).forEach(key => {
      const geom = geomIdxRef.current[key];
      if (!geom) return;                        // street not in the loaded Jongno data
      const pts = coordsOf(geom);
      if (!pts.length) return;
      const mid = pts[Math.floor(pts.length / 2)];
      const who = favs[key] || [];
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', 'Liked by ' + who.join(', '));
      el.style.cssText = 'width:26px;height:26px;border-radius:999px;border:2px solid #fff;cursor:pointer;' +
        'background:' + MAP_PAL.accent + ';display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 8px rgba(20,20,25,.28);padding:0;';
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.6"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 5.5 5.4 5.4 0 0 1 21.6 12C19.5 16.4 12 21 12 21z"/></svg>';
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        const label = who.length ? 'Liked by ' + who.join(', ') : 'Liked by a friend';
        new maplibregl.Popup({ offset: 16, closeButton: false, closeOnClick: true, maxWidth: '220px' })
          .setLngLat(mid)
          .setHTML(`<b style="font-family:${t.fontUI};font-size:13px;color:${MAP_PAL.ink}">${friendFavDisplayName(key)}</b>` +
                   `<div style="font-family:${t.fontUI};font-size:11.5px;color:${MAP_PAL.accent};font-weight:700;margin-top:3px">❤ ${label}</div>`)
          .addTo(map);
      });
      friendFavMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(mid).addTo(map));
    });
  }
  // Best human-readable street name for a normalised key (fall back to the key).
  function friendFavDisplayName(key) {
    const hit = scFeats.current.find(f => normName(f.properties.name) === key)
      || natureFeats.current.find(f => f.properties && normName(f.properties.name) === key);
    return (hit && hit.properties && hit.properties.name) || key;
  }
  // Collapse the flat friend-shares list into { normName → [friend names] } and repaint.
  function applyFriendFavs(list) {
    const idx = {};
    (list || []).forEach(fv => {
      const k = normName(fv.street_name);
      if (!k) return;
      const who = fv.display_name || 'a friend';
      const arr = idx[k] || (idx[k] = []);
      if (arr.indexOf(who) < 0) arr.push(who);
    });
    friendFavsRef.current = idx;
    renderFriendFavMarkers();
  }

  // Green name bubbles over each park walk (the "Park" greenery mode). DOM markers,
  // so they live outside React and must be added/removed explicitly.
  function clearNatureBubbles() { natureMarkersRef.current.forEach(m => m.remove()); natureMarkersRef.current = []; }
  // The ◆ finish marker + the landmark anchor pins of a drawn walk are DOM markers
  // too, so they must be torn down explicitly whenever the route is cleared/redrawn.
  function clearRouteMarkers() {
    if (endMarkerRef.current) { endMarkerRef.current.remove(); endMarkerRef.current = null; }
    if (panPopupRef.current) { panPopupRef.current.remove(); panPopupRef.current = null; }
    if (resultPopupRef.current) { resultPopupRef.current.remove(); resultPopupRef.current = null; }
    anchorMarkersRef.current.forEach(m => m.remove()); anchorMarkersRef.current = [];
  }
  function setNatureBubbles(list) {
    const map = mapRef.current;
    clearNatureBubbles();
    if (!map) return;
    list.forEach(r => {
      const f = r.feature; if (!f || !f.geometry) return;
      const pts = coordsOf(f.geometry); if (!pts.length) return;
      const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend(p));  // centre of the walk
      const el = document.createElement('div');
      el.textContent = r.name;
      el.style.cssText = `font-family:${t.fontUI};font-weight:700;font-size:11px;white-space:nowrap;` +
        `padding:3px 9px;border-radius:999px;background:${MAP_PAL.good};color:#fff;` +
        `box-shadow:0 2px 8px rgba(20,25,45,.25);cursor:pointer;`;
      el.onclick = () => selectResultByName(r.name);
      natureMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(b.getCenter()).addTo(map));
    });
  }
  // fit the view to an arbitrary set of features (any geometry type). `pad`
  // overrides the default insets — used when the sliders panel covers the top,
  // so the highlighted streets get framed in the strip left visible below it.
  const DEFAULT_FIT_PAD = { top: 120, bottom: 300, left: 40, right: 40 };
  function fitTo(features, pad) {
    const map = mapRef.current;
    if (!map || !features.length) return;
    const b = new maplibregl.LngLatBounds();
    features.forEach(f => coordsOf(f.geometry).forEach(p => b.extend(p)));
    if (!b.isEmpty()) map.fitBounds(b, { padding: pad || DEFAULT_FIT_PAD, maxZoom: 16 });
  }
  // STREET highlight (commerce categories, vibe, place, free-text).
  // `fit` false leaves the camera put — used for live slider tweaks so the map
  // re-ranks in place instead of flying around on every drag.
  function showStreets(list, fit = true, pad) {
    const map = mapRef.current;
    if (!map || !map.getSource('candidates')) return;
    clearHighlights();
    const feats = list.map(r => r.feature);
    map.getSource('candidates').setData({ type: 'FeatureCollection', features: feats });
    map.getSource('candidates-heat').setData(densifyToPoints(feats));
    if (fit) fitTo(feats, pad);
  }
  // Build a ~circle polygon (32 pts) of radius `radiusM` around a [lng,lat] — used
  // to give legal-dong POINTS a neighbourhood-scale "zone" to tint + fit to.
  function circleAround([lng, lat], radiusM) {
    const dLat = radiusM / 111320;
    const dLng = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const ring = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * 2 * Math.PI;
      ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
  }
  // NEIGHBOURHOOD highlight: tint the area + outline it, then fit the camera to it.
  // No street list — the user just asked to see the area. Legal-dong POINTS get a
  // neighbourhood-scale circle; the four 행정동 POLYGONS keep their real outline.
  function showDong(feature) {
    const map = mapRef.current;
    if (!map || !map.getSource('dong-region')) return;
    clearHighlights();
    const region = feature.geometry && feature.geometry.type === 'Point'
      ? circleAround(feature.geometry.coordinates, 230)
      : feature;
    map.getSource('dong-region').setData({ type: 'FeatureCollection', features: [region] });
    fitTo([region], { top: 100, bottom: 90, left: 40, right: 40 });
  }
  // NATURE highlight (nature category): draw the recommended walks as green
  // routes and fit the view to them.
  function showNature(list) {
    const map = mapRef.current;
    if (!map || !map.getSource('green-cand')) return;
    clearHighlights();
    map.getSource('green-cand').setData({ type: 'FeatureCollection', features: list.map(r => r.feature) });
    setNatureBubbles(list);                 // green name bubbles on each walk
    fitTo(list.map(r => r.feature));
  }
  // BOTH at once (vibe with Park requested): cobalt streets + green park walks on
  // the same view, fitted to their union. One clear so neither wipes the other.
  function showBoth(streetList, natureList, fit = true, pad) {
    const map = mapRef.current;
    if (!map || !map.getSource('candidates') || !map.getSource('green-cand')) return;
    clearHighlights();
    const streetFeats = streetList.map(r => r.feature);
    map.getSource('candidates').setData({ type: 'FeatureCollection', features: streetFeats });
    map.getSource('candidates-heat').setData(densifyToPoints(streetFeats));
    map.getSource('green-cand').setData({ type: 'FeatureCollection', features: natureList.map(r => r.feature) });
    setNatureBubbles(natureList);           // green name bubbles on each walk
    if (fit) fitTo([...streetList, ...natureList].map(r => r.feature), pad);
  }

  // ROUTE highlight: draw the walk as tagged SEGMENTS (vibe vs connector, coloured
  // directionally), drop a ◆ finish marker (the open walk ends away from the ● start)
  // and landmark anchor pins for the areas it passes, then fit the view to it.
  function drawRoute(opt) {
    const map = mapRef.current;
    if (!map || !map.getSource('route')) return;
    clearHighlights();
    map.getSource('route').setData(opt.routeFC || { type: 'FeatureCollection', features: [opt.line] });
    // ◆ finish pin — a diamond, distinct from the round ● "you are here" start, so
    // the user reads that an OPEN walk ends somewhere else (not back at the start).
    if (opt.endPoint) {
      const el = document.createElement('div');
      el.style.cssText = 'width:15px;height:15px;background:' + MAP_PAL.accent +
        ';border:3px solid #fff;transform:rotate(45deg);box-shadow:0 0 0 5px ' + MAP_PAL.accent + '33,0 2px 6px rgba(0,0,0,.4);';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;';
      wrap.appendChild(el);
      endMarkerRef.current = new maplibregl.Marker({ element: wrap })
        .setLngLat(opt.endPoint)
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML('<b>Finish</b><br>' + (opt.where || 'end of your walk')))
        .addTo(map);
    }
    // landmark anchors — a small ink dot + label for each area the walk runs near.
    (opt.areas || []).slice(0, 4).forEach(name => {
      const L = LANDMARKS.find(l => l.name === name); if (!L) return;
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:5px;transform:translateX(4px);';
      el.innerHTML =
        '<span style="width:9px;height:9px;border-radius:50%;background:' + MAP_PAL.ink + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);flex:0 0 auto;"></span>' +
        '<span style="font-family:' + t.fontUI + ';font-weight:800;font-size:10.5px;color:' + MAP_PAL.ink + ';white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff;">' + name + '</span>';
      anchorMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(L.pts[0]).addTo(map));
    });
    fitTo([opt.line]);
  }

  // reset the walk state when a search is NOT a vibe/preset street list.
  function resetWalk() { routeTargetRef.current = null; setVibeStreets(null); setWalkOptions(null); setRouteSeq(null); setRouteStats(null); }

  // ---- WALK PROPOSITION (join the displayed vibe streets into a route) ----
  // From the vibe street list the user is looking at, propose a few DISTINCT
  // ~38-min walks that string those very streets together from the fake-GPS start.
  // The user then picks the option they like.
  function proposeWalks() {
    const net = netRef.current, idx = routeIdxRef.current, start = startNodeRef.current;
    if (!net || idx == null || start == null) { setStatus('Walk network still loading…'); return; }
    const target = routeTargetRef.current, streets = vibeStreets;
    if (!target || !streets || !streets.length) { setStatus('Set a vibe first.'); return; }
    const prizeIds = nameIdSet(idx, streets.map(s => s.name));
    if (!prizeIds.size) { setStatus('These streets aren’t on the walk network yet.'); return; }
    // Park mode: also feed the park-walk edges as prizes so the route dips into a
    // park, not just the vibe streets. Memoised — the set doesn't depend on the vibe.
    let parkEdges = null;
    if (greenModeRef.current === 'park') {
      if (!parkEdgesRef.current) {
        const walkFeats = resolveNature(natureFeats.current).map(w => w.feature);
        parkEdgesRef.current = parkEdgeSet(net, walkFeats);
      }
      parkEdges = parkEdgesRef.current;
    }
    const opts = makeWalkOptions(net, idx, target, start, WALK_BUDGET_M, prizeIds, parkEdges);
    if (!opts.length) { setStatus('Couldn’t build a walk from here.'); return; }
    setWalkOptions(opts); setKind('walk-options'); setTitle('Walks joining your streets');
    setSelected(null); setSheetOpen(true); setStatus('');
    clearHighlights();                       // hide the street highlight while choosing
  }
  // Draw a chosen option and present it as a départ→…→arrivée SEQUENCE. The map
  // gets the segmented route (drawRoute); the sheet gets the marquee anticipation
  // card + the ordered steps. `marquee` = the walk's strongest vibe street; we look
  // up its curated photo + LLM ambiance sentence to preview what's coming.
  function chooseWalk(opt, i) {
    // Marquee = the street to preview. Prefer a vibe street that actually HAS a
    // photo (the scarcest asset), then one with a sentence, else the strongest
    // (reward-picked in makeWalkOptions) — so the anticipation card shows an image
    // whenever any street on the walk has one, not only if the top street does.
    const yrs = opt.yours || [];
    const marqueeRaw = yrs.find(n => lookupByNames(n, photoIdxRef.current))
      || yrs.find(n => lookupByNames(n, localsIdxRef.current))
      || opt.marquee || yrs[0] || null;
    const photo = lookupByNames(marqueeRaw, photoIdxRef.current);
    const amb = lookupByNames(marqueeRaw, localsIdxRef.current);
    const marquee = marqueeRaw ? {
      name: displayName(marqueeRaw),
      photoSrc: photo ? photo.src : null,
      credit: photo ? photo.credit : '',
      en: amb ? amb.en : '', ko: amb ? amb.ko : '',
    } : null;
    setKind('route'); setTitle(opt.label);
    setRouteStats({ m: opt.len, min: opt.min, where: opt.where, yours: (opt.yours || []).length, marquee });
    // enrich each named leg with its LLM ambiance sentence (the Local-favorite text),
    // so the step card can describe the street, not just name it.
    const seq = (opt.sequence || []).map(s => {
      if (s.type !== 'leg') return s;
      const amb = lookupByNames(s.rawName || s.name, localsIdxRef.current);
      return amb && (amb.en || amb.ko) ? { ...s, en: amb.en, ko: amb.ko } : s;
    });
    setRouteSeq(seq);
    setResults([]); setSelected(null); setSheetOpen(true);
    drawRoute(opt);
    // study telemetry: record the proposed route and that it was chosen
    if (window.StudyAPI) {
      window.StudyAPI.logRoute({
        route_type: 'vibe-walk',
        geojson: opt.line && opt.line.geometry,
        length_m: opt.len,
        est_min: opt.len ? Math.round(opt.len / WALK_SPEED_M_MIN) : null,
        params: { option_index: i, where: opt.where, areas: opt.areas },
      }).then(rid => { if (rid) window.StudyAPI.logRouteChoice(rid); });
    }
  }
  // Back to the vibe street list from the options / a drawn route.
  function backToStreets() { if (routeTargetRef.current) runVibe(); else clearSearch(); }

  // Rank + draw for a given vibe target. `fit` false keeps the camera still, so
  // dragging the in-map sliders re-ranks the heat cloud in place (live preview).
  // Fit insets used while the sliders panel is open: reserve the top for the panel
  // and only the collapsed sheet peek + tab bar at the bottom, so the highlighted
  // streets land in the visible strip below the panel.
  const VIBE_SLIDERS_FIT_PAD = { top: 400, bottom: 140, left: 36, right: 36 };
  function runVibeWithTarget(target, fit = true, pad, group) {
    // rank streets on all active axes; if the user leans toward PARK, also surface
    // the actual park WALKS (nature-paths) — the paths INSIDE parks aren't named
    // streets, so they can only come from that layer. Walks listed first (they ARE
    // the parks), then the vibe-ranked streets.
    const streets = rankByVibe(target, vibeFeats.current);
    const wantPark = greenModeRef.current === 'park';   // the "Park" greenery button
    const walks = wantPark ? resolveNature(natureFeats.current) : [];
    const list = [...walks, ...streets];
    // Title reflects the blend when friends are on the walk.
    const title = group && group.count
      ? `Matching your group's vibe · ${group.count + 1} people`
      : 'Matching your vibe';
    setKind('vibe'); setTitle(title); setResults(list);
    setSelected(null);
    // remember what to join into a walk (the ranked STREETS, not the park walks)
    routeTargetRef.current = Object.keys(target).length ? target : null;
    setVibeStreets(streets); setWalkOptions(null);
    if (wantPark && walks.length) showBoth(streets, walks, fit, pad); else showStreets(streets, fit, pad);
    setStatus(list.length ? '' : 'No vibe scores loaded for these streets yet.');
  }
  // The "✦ My vibe" chip: rank from the persisted sliders AND reveal the compact
  // in-map sliders. Collapse the results sheet so the map stays visible between the
  // panel (top) and the sheet peek (bottom) while the user tunes the vibe.
  function runVibe() {
    greenModeRef.current = readGreenMode();
    const g = mergeTargetWithGroup(readVibeTarget());
    runVibeWithTarget(g.target, true, VIBE_SLIDERS_FIT_PAD, g.group);
    setShowSliders(true); setSheetOpen(false);
  }
  // Live re-rank as the in-map sliders move — no camera refit (fit=false).
  function onVibeSlidersChange(vals, off, greenMode) {
    greenModeRef.current = greenMode;
    const g = mergeTargetWithGroup(targetFromSliders(vals, off, greenMode));
    runVibeWithTarget(g.target, false, undefined, g.group);
  }
  // preset vibe chips — a fixed target instead of the live sliders.
  function runPreset(p) {
    setQuery(''); setShowSliders(false);
    if (p.nature) {                       // "Quiet nature" → the walks, calmest first
      resetWalk();
      const list = resolveNature(natureFeats.current, { quiet: true });
      setKind('preset:' + p.id); setTitle(`${p.emoji} ${p.label}`);
      setResults(list); setSelected(null); setSheetOpen(true); showNature(list);
      setStatus(list.length ? '' : 'No nature walks loaded yet.');
      return;
    }
    const list = rankByVibe(p.target, vibeFeats.current);
    setKind('preset:' + p.id); setTitle(`${p.emoji} ${p.label}`);
    setResults(list); setSelected(null); setSheetOpen(true); showStreets(list);
    // a preset is a vibe target too → its streets can be joined into a walk
    routeTargetRef.current = p.target; setVibeStreets(list); setWalkOptions(null);
    setStatus(list.length ? '' : 'No vibe scores loaded for these streets yet.');
  }
  // one entry point for every chip — routes green vs commerce categories.
  function runCategory(cat) {
    setQuery(''); resetWalk(); setShowSliders(false);
    // Log the category tap so a friend's repeated interest (e.g. two taps on
    // "Café & sweets") can surface as a nudge on the other walker's screen.
    if (window.StudyAPI && window.StudyAPI.logSearch) window.StudyAPI.logSearch(cat.label, 'function');
    if (cat.kind === 'green') {
      const list = resolveNature(natureFeats.current);
      setKind('cat:' + cat.id); setTitle(`${cat.emoji} ${cat.label}`);
      setResults(list); setSelected(null); setSheetOpen(true);
      showNature(list);
      setStatus(list.length ? '' : 'No nature walks loaded yet.');
      return;
    }
    const list = resolveFunction([cat], scFeats.current);
    setKind('cat:' + cat.id); setTitle(`${cat.emoji} ${cat.label}`);
    setResults(list); setSelected(null); setSheetOpen(true); showStreets(list);
  }
  function runFreeText(q) {
    resetWalk(); setShowSliders(false); setStatus('');
    if (window.StudyAPI && q && q.trim()) window.StudyAPI.logSearch(q.trim(), null);
    // NEIGHBOURHOOD first — an exact dong name / alias ("삼청동", "Bukchon") zooms
    // to the area rather than listing streets (a street like "인사동길" won't match
    // the exact-token test, so it still falls through to the street search below).
    const dong = matchDong(q, dongFeats.current);
    if (dong) {
      const p = dong.properties;
      setKind('dong'); setTitle(''); setResults([]); setSelected(null); setSheetOpen(false);
      setStatus(`📍 ${p.name}${p.name_en ? ' · ' + p.name_en : ''}`);
      showDong(dong);
      return;
    }
    const cats = matchCategories(q);
    const commerce = cats.filter(c => c.kind !== 'green');
    const green = cats.find(c => c.kind === 'green');
    if (commerce.length) {          // a shop/food word wins over a vague green word
      const list = resolveFunction(commerce, scFeats.current);
      setKind('cat:' + commerce[0].id);
      setTitle(`${commerce[0].emoji} ${commerce.map(g => g.label).join(' / ')}`);
      setResults(list); setSelected(null); setSheetOpen(true); showStreets(list);
      return;
    }
    if (green) { runCategory(green); return; }
    const list = resolvePlace(q, scFeats.current);
    setKind('place'); setTitle(`“${q}”`); setResults(list);
    setSelected(null); setSheetOpen(true); showStreets(list);
  }
  function clearSearch() {
    setQuery(''); setKind(null); setTitle(''); setResults([]); setSelected(null);
    setRouteStats(null); resetWalk(); setShowSliders(false); setStatus('');
    clearHighlights();
  }
  // Ease the camera to a coordinate — used when the user taps a leg in the route
  // sequence to see where that stretch runs on the map. The results sheet covers the
  // lower ~half of the screen, so we offset the target UP (negative y) to land it in
  // the visible strip above the sheet instead of centring it under the panel.
  function panToCoord(coord, name) {
    const map = mapRef.current;
    if (!map || !coord) return;
    const h = (map.getContainer() && map.getContainer().clientHeight) || 700;
    map.easeTo({ center: coord, zoom: Math.max(map.getZoom(), 15.4), offset: [0, -h * 0.26], duration: 500 });
    // keep only ONE street label: drop the previous one, and let a tap elsewhere on
    // the map dismiss it (closeOnClick) so labels never pile up.
    if (panPopupRef.current) { panPopupRef.current.remove(); panPopupRef.current = null; }
    if (name) panPopupRef.current = new maplibregl.Popup({ offset: 12, closeButton: false, closeOnClick: true, maxWidth: '220px' })
      .setLngLat(coord)
      .setHTML(`<b style="font-family:${t.fontUI};font-size:13px;color:${MAP_PAL.ink}">${name}</b>`)
      .addTo(map);
  }

  // Build the map popup for a result: name + descriptor, plus a three-dots (⋮)
  // menu. Hovering the dots reveals "Add path to favorites" (or "Remove…" when
  // already saved). Built as raw DOM because MapLibre popups live outside React.
  function buildPopupNode(r) {
    const el = document.createElement('div');
    el.style.cssText = `font-family:${t.fontUI};min-width:170px;max-width:230px;`;

    const title = document.createElement('div');
    title.textContent = r.name;
    title.style.cssText = `font-weight:700;font-size:13.5px;color:${MAP_PAL.ink};`;
    el.appendChild(title);

    // "Liked by …" — if any friend has shared this street, surface who, right up top.
    const likedBy = friendFavsRef.current[normName(r.name)];
    if (likedBy && likedBy.length) {
      const liked = document.createElement('div');
      liked.textContent = '❤ Liked by ' + likedBy.join(', ');
      liked.style.cssText = `font-size:11.5px;font-weight:700;color:${MAP_PAL.accent};margin-top:4px;`;
      el.appendChild(liked);
    }

    // Ambiance sentence — the human "character" line (EN hero, KO companion).
    const amb = lookupByNames(r.name, localsIdxRef.current);
    if (amb && (amb.en || amb.ko)) {
      const line = document.createElement('div');
      line.textContent = amb.en || amb.ko;
      line.style.cssText = `font-size:12px;line-height:1.45;font-weight:600;color:${MAP_PAL.ink};margin-top:5px;`;
      el.appendChild(line);
      if (amb.en && amb.ko) {
        const ko = document.createElement('div');
        ko.textContent = amb.ko;
        ko.style.cssText = `font-size:11px;line-height:1.4;font-weight:400;color:${MAP_PAL.inkSoft};margin-top:3px;`;
        el.appendChild(ko);
      }
    }

    // Top shops — the street's commerce signature, most frequent categories first.
    const cats = lookupByNames(r.name, commerceIdxRef.current);
    if (cats && cats.length) {
      const top = cats.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map(c => c[0]).join(' · ');
      const shops = document.createElement('div');
      shops.style.cssText = `display:flex;gap:5px;font-size:11px;line-height:1.4;color:${MAP_PAL.inkSoft};margin-top:6px;`;
      const icon = document.createElement('span'); icon.textContent = '🏪'; icon.style.flexShrink = '0';
      const txt = document.createElement('span'); txt.textContent = top;
      shops.appendChild(icon); shops.appendChild(txt);
      el.appendChild(shops);
    }

    // Match / descriptor line — keep the vibe match info small underneath, but skip
    // it for a commerce search (its sub is the shop list we already show above).
    if (r.sub && /match/.test(r.sub)) {
      const sub = document.createElement('div');
      sub.textContent = r.sub;
      sub.style.cssText = `font-size:10.5px;color:${MAP_PAL.inkFaint};margin-top:6px;`;
      el.appendChild(sub);
    } else if (r.sub && !amb && !(cats && cats.length)) {
      // fallback so the popup is never just a bare name
      const sub = document.createElement('div');
      sub.textContent = r.sub;
      sub.style.cssText = `font-size:11px;color:${MAP_PAL.inkSoft};margin-top:2px;`;
      el.appendChild(sub);
    }

    // only real path geometries can be saved (not route-itinerary points)
    const canFav = r.feature && r.feature.geometry && r.feature.geometry.type !== 'Point';
    if (!canFav) return el;

    const bar = document.createElement('div');
    bar.style.cssText = 'position:relative;display:flex;justify-content:flex-end;margin-top:8px;';

    const kebab = document.createElement('button');
    kebab.type = 'button';
    kebab.setAttribute('aria-label', 'Path options');
    kebab.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${MAP_PAL.inkSoft}"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;
    kebab.style.cssText = 'border:none;background:transparent;cursor:pointer;padding:3px;border-radius:8px;display:flex;align-items:center;';

    // Two-row menu: save/remove the favorite, and share/un-share it with friends.
    const menu = document.createElement('div');
    menu.style.cssText = `display:none;position:absolute;bottom:calc(100% + 4px);right:0;flex-direction:column;align-items:stretch;gap:2px;border:1px solid ${MAP_PAL.card2};background:#fff;border-radius:10px;padding:6px;box-shadow:0 8px 22px rgba(20,20,25,.16);font-family:inherit;`;
    const rowCss = `display:flex;align-items:center;gap:8px;white-space:nowrap;border:none;background:transparent;border-radius:7px;padding:7px 9px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:700;color:${MAP_PAL.ink};text-align:left;`;
    const favBtn = document.createElement('button'); favBtn.type = 'button'; favBtn.style.cssText = rowCss;
    const shareBtn = document.createElement('button'); shareBtn.type = 'button'; shareBtn.style.cssText = rowCss;
    const heartSvg = on => `<svg width="14" height="14" viewBox="0 0 24 24" fill="${on ? MAP_PAL.accent : 'none'}" stroke="${MAP_PAL.accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 5.5 5.4 5.4 0 0 1 21.6 12C19.5 16.4 12 21 12 21z"/></svg>`;
    const shareSvg = on => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${on ? MAP_PAL.accent : MAP_PAL.inkSoft}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>`;
    const paint = () => {
      const fav = isFavorite(r.name);
      const shared = isFavoriteShared(r.name);
      favBtn.innerHTML = heartSvg(fav) + `<span>${fav ? 'Remove from favorites' : 'Add path to favorites'}</span>`;
      shareBtn.innerHTML = shareSvg(shared) + `<span>${shared ? 'Shared with friends' : 'Share with friends'}</span>`;
      shareBtn.style.color = shared ? MAP_PAL.accent : MAP_PAL.ink;
    };
    paint();

    // hover reveals the menu; a short close delay bridges the gap dots → menu
    let hideTimer = null;
    const show = () => { clearTimeout(hideTimer); menu.style.display = 'flex'; kebab.style.background = MAP_PAL.card2; };
    const scheduleHide = () => { hideTimer = setTimeout(() => { menu.style.display = 'none'; kebab.style.background = 'transparent'; }, 180); };
    kebab.addEventListener('mouseenter', show);
    kebab.addEventListener('mouseleave', scheduleHide);
    menu.addEventListener('mouseenter', show);
    menu.addEventListener('mouseleave', scheduleHide);
    // touch fallback: tap the dots to open, tap a row to act
    kebab.addEventListener('click', e => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'; });
    favBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(favFromResult(r)); paint();
      if (window.StudyAPI) window.StudyAPI.logEvent('favorite_toggle', { name: r.name, kind: r.type }); });
    // Sharing implies saving: if the street isn't a favorite yet, add it first so the
    // shared flag has something to attach to; un-sharing leaves the favorite in place.
    shareBtn.addEventListener('click', e => { e.stopPropagation();
      const nowShared = !isFavoriteShared(r.name);
      if (nowShared && !isFavorite(r.name)) toggleFavorite(favFromResult(r));
      setFavoriteShared(r.name, nowShared);
      paint();
    });

    menu.appendChild(favBtn);
    menu.appendChild(shareBtn);
    bar.appendChild(menu);
    bar.appendChild(kebab);
    el.appendChild(bar);
    return el;
  }

  function selectResultByName(name) {
    const r = resultsRef.current.find(x => x.name === name);
    if (!r) return;
    setSelected(name);
    const map = mapRef.current;
    const pts = coordsOf(r.feature.geometry);
    const mid = pts[Math.floor(pts.length / 2)];
    // Keep only ONE result popup: drop the previous card before opening the new one
    // (mirrors panPopupRef) so taps never pile popups up. closeOnClick lets a tap on
    // the map dismiss it; we also clear the ref on 'close' so it can't leak.
    if (resultPopupRef.current) { resultPopupRef.current.remove(); resultPopupRef.current = null; }
    if (map && mid) {
      const popup = new maplibregl.Popup({ offset: 10, maxWidth: '260px', closeOnClick: true })
        .setLngLat(mid).setDOMContent(buildPopupNode(r)).addTo(map);
      popup.on('close', () => { if (resultPopupRef.current === popup) resultPopupRef.current = null; });
      resultPopupRef.current = popup;
    }
  }

  const ease = 'cubic-bezier(.22,1,.36,1)';

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: 'var(--map-land)' }}>
      {/* the map fills the screen (kept mounted even on the Local-favorite tab) */}
      {/* lift the bottom-right zoom + (i) attribution clear of the tab bar so they
          aren't clipped — scoped to THIS map so the Local-favorite map (whose frame
          already stops above the bar) isn't shifted twice. */}
      <style>{`.rms-searchmap .maplibregl-ctrl-bottom-right,
               .rms-searchmap .maplibregl-ctrl-bottom-left { bottom: ${MAP_TAB_H}px; }`}</style>
      <div ref={mapEl} className="rms-searchmap" style={{ position: 'absolute', inset: 0 }} />

      {/* search overlay, pinned to the top — Search tab only */}
      {tab === 'search' && (
      <div style={{ position: 'absolute', top: 8, left: 14, right: 14, zIndex: 10 }}>
        <SearchBar query={query} setQuery={setQuery} onSubmit={runFreeText} onClear={clearSearch}
          hasResults={results.length > 0} />
        <ChipRow activeKind={kind} onVibe={runVibe} onPreset={runPreset} onCategory={runCategory} />
        {/* compact live vibe sliders — opened by the "✦ My vibe" chip */}
        {showSliders && <VibeSlidersPanel onVibeChange={onVibeSlidersChange}
          onClose={() => { setShowSliders(false); setSheetOpen(true); }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <GpsBadge status={gpsStatus} />
          {status && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
            background: 'var(--card)', borderRadius: t.radiusSm, padding: '5px 10px', boxShadow: 'var(--shadow)' }}>{status}</div>}
        </div>
      </div>
      )}

      {/* Local favorite tab — the "streets locals love" thread, reimplemented
          natively (see LocalFavoriteView). It sits over the search map and stops
          above the bottom tab bar. */}
      {tab === 'locals' && <LocalFavoriteView />}

      {/* VIBE view: no bottom sheet — matched streets live on the map, so we only
          dock a slim "make a walk" button just above the tab bar to save space. */}
      {tab === 'search' && kind === 'vibe' && routeTargetRef.current && vibeStreets && vibeStreets.length > 0 && (
        <button onClick={proposeWalks}
          style={{ position: 'absolute', left: 14, right: 14, bottom: MAP_TAB_H + 12, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 999, padding: '10px 16px',
            boxShadow: '0 8px 24px -10px rgba(0,0,0,0.55)' }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>🧭</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, fontWeight: 700 }}>Make a walk with these streets</span>
          <span style={{ fontSize: 15, lineHeight: 1 }}>→</span>
        </button>
      )}

      {/* results bottom sheet — Search tab only, resting on top of the tab bar */}
      {tab === 'search' && kind !== 'vibe' && (results.length > 0 || (kind === 'walk-options' && walkOptions && walkOptions.length) || (kind === 'route' && routeSeq && routeSeq.length)) && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: MAP_TAB_H, zIndex: 10, background: 'var(--card)',
          borderTopLeftRadius: t.radius + 4, borderTopRightRadius: t.radius + 4, borderTop: '1px solid var(--line)',
          boxShadow: '0 -18px 50px -28px rgba(0,0,0,0.5)', maxHeight: '58%', display: 'flex', flexDirection: 'column',
          transform: sheetOpen ? 'none' : 'translateY(calc(100% - 58px))', transition: `transform .42s ${ease}` }}>
          <div onClick={() => setSheetOpen(o => !o)} role="button" style={{ cursor: 'pointer', padding: '10px 20px 8px', flex: '0 0 auto' }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--line-strong)', margin: '0 auto 9px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <Label style={{ margin: 0 }}>{(() => {
                  if (kind === 'walk-options' && walkOptions)
                    return `${walkOptions.length} ways to walk your vibe`;
                  if (kind === 'route' && routeStats)
                    return `${(routeStats.m / 1000).toFixed(1)} km · ~${routeStats.min} min${routeStats.yours ? ` · ${routeStats.yours} vibe street${routeStats.yours > 1 ? 's' : ''}` : ''}`;
                  const nWalk = results.filter(r => r.type === 'nature').length;
                  const nStreet = results.length - nWalk;
                  const plur = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
                  if (nWalk && nStreet) return `${plur(nStreet, 'street')} · ${plur(nWalk, 'park walk')}`;
                  if (nWalk) return plur(nWalk, 'nature walk');
                  return plur(nStreet, 'street');
                })()}</Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                  {titleIcon && <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{titleIcon}</span>}
                  <span style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 18, lineHeight: 1.1, color: 'var(--ink)' }}>{titleText}</span>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, color: 'var(--ink-soft)', transform: sheetOpen ? 'rotate(180deg)' : 'none', transition: `transform .42s ${ease}` }}>
                <path d="M3 10 L8 5 L13 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 16px 26px', display: 'flex', flexDirection: 'column', gap: 7 }}>

            {/* BACK control while choosing an option or viewing a drawn route */}
            {(kind === 'walk-options' || kind === 'route') && (
              <button onClick={kind === 'route' && walkOptions ? () => { setKind('walk-options'); clearHighlights(); } : backToStreets}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: 'var(--ink-soft)',
                  cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: '2px 0 4px' }}>
                ‹ {kind === 'route' && walkOptions ? 'other options' : 'back to streets'}
              </button>
            )}

            {/* ROUTE view: the drawn walk as a départ→…→arrivée sequence with an
                anticipation card (photo + LLM sentence) and per-leg vibe/link steps. */}
            {kind === 'route' ? (
              <RouteSequence stats={routeStats} seq={routeSeq} onPan={panToCoord} />
            ) : kind === 'walk-options'
              ? walkOptions.map((o, i) => (
                  <button key={'opt' + i} onClick={() => chooseWalk(o, i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', width: '100%',
                      border: '1.5px solid var(--line)', background: 'var(--card)', borderRadius: t.radiusSm, padding: '10px 12px' }}>
                    <span style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, color: 'var(--accent)', width: 18 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{o.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(o.len / 1000).toFixed(1)} km · {o.where}
                      </span>
                    </span>
                    <span style={{ fontSize: 15, color: 'var(--ink-faint)' }}>→</span>
                  </button>
                ))
              : results.map((r, i) => {
                  const on = r.name === selected;
                  return (
                    <button key={r.name + i} onClick={() => selectResultByName(r.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', width: '100%',
                        border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)', background: on ? 'var(--accent-soft)' : 'var(--card)',
                        borderRadius: t.radiusSm, padding: '9px 12px' }}>
                      <span style={{ fontFamily: t.fontMono, fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      {/* bottom navigation — Search / Local favorite */}
      <MapTabBar tab={tab} setTab={setTab} />
    </div>
  );
}

Object.assign(window, { RealMapScreen });

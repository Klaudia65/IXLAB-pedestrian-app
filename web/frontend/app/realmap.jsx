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
function resolveNature(feats, opts) {
  const quiet = !!(opts && opts.quiet);
  const list = feats.map(f => {
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
  green: 'park',                  // slider 0=Little green → -1 ; axis pos=near a park(+1) [OSM public-green proximity]
};

function readVibeTarget() {
  // pull the persisted slider state (same keys as sliders.jsx / usePersist)
  const read = (k, d) => { try { const v = localStorage.getItem('seoulwalk.' + k); return v != null ? JSON.parse(v) : d; } catch (e) { return d; } };
  const defVals = Object.fromEntries((window.VIBE_AXES || []).map(a => [a.id, a.def]));
  const vals = read('sliders.vals', defVals);
  const off = read('sliders.off', []);
  const target = {};
  Object.keys(VIBE_AXIS_MAP).forEach(sid => {
    if (off.includes(sid)) return;                 // user dropped this dimension
    const v = vals[sid];
    if (v == null) return;
    target[VIBE_AXIS_MAP[sid]] = v * 2 - 1;         // [0,1] slider → [-1,1] axis
  });
  return target;
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
      sub: `${Math.round(score * 100)}% match · noted on ${covered}/${axes.length} ${axes.length > 1 ? 'axes' : 'axis'}` });
  });
  // rank on alignment ONLY — coverage is shown, not used to sort.
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

// (runVibe reads readVibeTarget() directly now — it needs the target to decide
//  whether to also surface park walks — so there's no standalone resolveVibe.)

/* ============================================================
   ROUTING — an OPEN orienteering walk from a fixed Jongno start
   (start pinned, end free), maximising the vibe met on the way.
   ============================================================ */

// Fake "you are here". The app's data (graph + scores) only covers the Jongno
// bbox, so a real device position outside it would have no network to route on —
// we pin the start to a central Jongno node instead. ~인사동 / central 종로.
const FAKE_GPS = [126.9908, 37.5758];
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
  const N = net.nodes.length;
  const { adj } = idx;
  const { reward: rewardOf } = vibeRewardFn(net, idx, weights);
  const RCL = 3, MAX_STEPS = 60;
  const used = new Set();
  let cur = startNode, len = 0, reward = 0;
  const path = [startNode], edges = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const { dist, pN, pE } = dijkstra(adj, N, cur);
    // candidate prizes: a named street, in the prize set (if any), clearing the
    // minimum-criteria bar, reachable within the remaining budget.
    const cands = [];
    for (let ei = 0; ei < net.edges.length; ei++) {
      if (used.has(ei)) continue;
      const nid = net.edges[ei][3];
      if (nid < 0) continue;
      if (prizeIds && !prizeIds.has(nid)) continue;
      const r = rewardOf(nid);
      if (r < minReward) continue;                 // minimum-criteria gate
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
      if (!used.has(s.ei)) { used.add(s.ei); reward += rewardOf(net.edges[s.ei][3]); }
      len += net.edges[s.ei][2]; path.push(s.node); edges.push(s.ei);
    }
    // traverse the prize edge near → far
    if (!used.has(pick.ei)) { used.add(pick.ei); reward += pick.r; }
    len += pick.el; path.push(pick.far); edges.push(pick.ei);
    cur = pick.far;
  }
  return path.length > 1 ? { path, edges, len, reward } : null;
}

// Turn a routing result into (a) the route LineString for the map, and (b) an
// ordered list of the distinct named streets it walks, with metres on each — the
// human-readable itinerary shown in the sheet.
function describeWalk(net, plan) {
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: plan.path.map(i => net.nodes[i]) }, properties: {} };
  const legs = [];
  plan.edges.forEach((ei, k) => {
    const e = net.edges[ei];
    const name = e[3] >= 0 ? net.names[e[3]] : null;
    const midNode = net.nodes[plan.path[k]];
    const last = legs[legs.length - 1];
    if (name && last && last.name === name) { last.m += e[2]; }         // same street continues
    else if (name) legs.push({ name, m: e[2], at: midNode });
    // unnamed connectors are walked but not listed as a "street"
  });
  return { line, legs };
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
function makeWalkOptions(net, idx, weights, startNode, budgetM, displayedIds) {
  const { reward: rewardOf, wsum } = vibeRewardFn(net, idx, weights);
  const minCrit = MIN_CRIT_FRAC * wsum;
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
      const plan = planWalk(net, idx, weights, startNode, st.budget, o);
      if (!plan || plan.path.length < 2) continue;
      // rank runs by vibe DENSITY (reward per metre), not total reward — otherwise
      // the longest 38-min route always wins and the walk never wraps up early.
      const density = plan.reward / plan.len;
      if (density > bestDensity) { bestDensity = density; best = plan; }
    }
    if (!best) continue;
    const { line, legs } = describeWalk(net, best);
    const streets = [...new Set(legs.map(l => l.name))];
    const key = streets.join('>');
    if (seenKeys.has(key)) continue;            // skip a duplicate route
    seenKeys.add(key);
    const yours = streets.filter(isVibe);       // the streets that meet the criteria
    yours.forEach(s => usedNames.add(s));        // feed diversity for the next strategy
    const { where, areas } = describePlace(net, best.path, legs);
    out.push({ label: st.label, line, legs, streets, yours, isVibe, where, areas,
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
   THE MAP SCREEN
   ============================================================ */
function RealMapScreen() {
  const t = React.useContext(ThemeCtx);
  const mapEl = React.useRef(null);
  const mapRef = React.useRef(null);
  const scFeats = React.useRef([]);      // street-character features (function + place)
  const vibeFeats = React.useRef([]);    // NLP-scored named streets (vibe)
  const natureFeats = React.useRef([]);  // recommended nature walks (nature category)
  const netRef = React.useRef(null);     // routing graph (walk-net-jongno.json)
  const routeIdxRef = React.useRef(null);// precomputed normalised axes + adjacency
  const startNodeRef = React.useRef(null);// fake-GPS start, snapped to a graph node

  const [status, setStatus] = React.useState('Loading the neighbourhood…');
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState(null);       // 'vibe' | 'function:<id>' | 'place'
  const [title, setTitle] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [routeStats, setRouteStats] = React.useState(null);  // {m, min, legs} of the drawn walk
  const [walkOptions, setWalkOptions] = React.useState(null);// proposed walks joining the vibe streets
  const [vibeStreets, setVibeStreets] = React.useState(null);// the street list to return to from a walk
  const routeTargetRef = React.useRef(null);                 // the vibe target the streets came from

  // ---- init the map once, on mount ----
  React.useEffect(() => {
    if (!window.maplibregl) { setStatus('⚠️ MapLibre failed to load (offline?).'); return; }
    let cancelled = false;
    const map = new maplibregl.Map({
      container: mapEl.current, style: buildBaseStyle(),
      bounds: [[JONGNO_BBOX[0], JONGNO_BBOX[1]], [JONGNO_BBOX[2], JONGNO_BBOX[3]]],
      fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      if (cancelled) return;

      // base street network — every named street, faint (the "clean" canvas)
      map.addSource('streets-base', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'streets-base', type: 'line', source: 'streets-base',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.street, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2.4, 19, 5], 'line-opacity': 0.28 } });

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

      // routing walk — a dashed accent route drawn on top of everything, with a
      // white halo so it reads over the candidate/base street lines.
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-halo', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 8, 16, 13, 19, 20], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.accent, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 7, 19, 11], 'line-dasharray': [1.4, 1.1] } });

      // highlighted candidates — halo + accent line, drawn on top
      map.addSource('candidates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'cand-halo', type: 'line', source: 'candidates',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 16, 10, 19, 16], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'cand-line', type: 'line', source: 'candidates',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_PAL.accent, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 5.5, 19, 9] } });

      map.on('click', 'cand-line', e => selectResultByName(e.features[0].properties.name));
      map.on('mouseenter', 'cand-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'cand-line', () => { map.getCanvas().style.cursor = ''; });
      // nature walks are clickable too
      map.on('click', 'green-cand-line', e => { const n = e.features[0].properties.name; if (n) selectResultByName(n); });
      map.on('mouseenter', 'green-cand-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'green-cand-line', () => { map.getCanvas().style.cursor = ''; });

      // ---- load the local data ----
      fetch('street-character-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        scFeats.current = (gj.features || []).filter(f => f.properties && f.properties.name);
        map.getSource('streets-base').setData(gj);
        setStatus('');
      }).catch(() => setStatus('⚠️ street-character-jongno.geojson not found.'));

      fetch('scores-named-streets-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        vibeFeats.current = (gj.features || []).filter(f => f.properties && f.properties.name);
      }).catch(() => { /* vibe path just stays empty */ });

      fetch('nature-paths-jongno.geojson').then(r => r.json()).then(gj => {
        if (cancelled) return;
        natureFeats.current = gj.features || [];
      }).catch(() => { /* nature category just stays empty */ });

      // routing graph — powers the "38-min walk" orienteering path. Once loaded,
      // snap the fake-GPS start to a node and drop a pulsing "you are here" puck.
      fetch('walk-net-jongno.json').then(r => r.json()).then(net => {
        if (cancelled) return;
        netRef.current = net;
        routeIdxRef.current = buildRouteIndex(net);
        startNodeRef.current = nearestNode(net, FAKE_GPS[0], FAKE_GPS[1]);
        const el = document.createElement('div');
        el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:' + MAP_PAL.accent +
          ';border:3px solid #fff;box-shadow:0 0 0 6px ' + MAP_PAL.accent + '33, 0 2px 6px rgba(0,0,0,.4);';
        new maplibregl.Marker({ element: el }).setLngLat(net.nodes[startNodeRef.current])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML('<b>You are here</b><br>fixed start · Jongno')).addTo(map);
      }).catch(() => { /* routing just stays unavailable */ });
    });

    return () => { cancelled = true; map.remove(); mapRef.current = null; };
  }, []);

  const EMPTY_FC = { type: 'FeatureCollection', features: [] };

  // ---- highlight helpers ----
  // clear both highlight layers so switching category never leaves stragglers.
  function clearHighlights() {
    const map = mapRef.current;
    if (!map) return;
    ['candidates', 'green-cand', 'route'].forEach(s => { if (map.getSource(s)) map.getSource(s).setData(EMPTY_FC); });
  }
  // fit the view to an arbitrary set of features (any geometry type).
  function fitTo(features) {
    const map = mapRef.current;
    if (!map || !features.length) return;
    const b = new maplibregl.LngLatBounds();
    features.forEach(f => coordsOf(f.geometry).forEach(p => b.extend(p)));
    if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 120, bottom: 300, left: 40, right: 40 }, maxZoom: 16 });
  }
  // STREET highlight (commerce categories, vibe, place, free-text).
  function showStreets(list) {
    const map = mapRef.current;
    if (!map || !map.getSource('candidates')) return;
    clearHighlights();
    map.getSource('candidates').setData({ type: 'FeatureCollection', features: list.map(r => r.feature) });
    fitTo(list.map(r => r.feature));
  }
  // NATURE highlight (nature category): draw the recommended walks as green
  // routes and fit the view to them.
  function showNature(list) {
    const map = mapRef.current;
    if (!map || !map.getSource('green-cand')) return;
    clearHighlights();
    map.getSource('green-cand').setData({ type: 'FeatureCollection', features: list.map(r => r.feature) });
    fitTo(list.map(r => r.feature));
  }
  // BOTH at once (vibe with Park requested): cobalt streets + green park walks on
  // the same view, fitted to their union. One clear so neither wipes the other.
  function showBoth(streetList, natureList) {
    const map = mapRef.current;
    if (!map || !map.getSource('candidates') || !map.getSource('green-cand')) return;
    clearHighlights();
    map.getSource('candidates').setData({ type: 'FeatureCollection', features: streetList.map(r => r.feature) });
    map.getSource('green-cand').setData({ type: 'FeatureCollection', features: natureList.map(r => r.feature) });
    fitTo([...streetList, ...natureList].map(r => r.feature));
  }

  // ROUTE highlight: draw the walk line and fit the view to it.
  function showRoute(line) {
    const map = mapRef.current;
    if (!map || !map.getSource('route')) return;
    clearHighlights();
    map.getSource('route').setData({ type: 'FeatureCollection', features: [line] });
    fitTo([line]);
  }

  // reset the walk state when a search is NOT a vibe/preset street list.
  function resetWalk() { routeTargetRef.current = null; setVibeStreets(null); setWalkOptions(null); }

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
    const opts = makeWalkOptions(net, idx, target, start, WALK_BUDGET_M, prizeIds);
    if (!opts.length) { setStatus('Couldn’t build a walk from here.'); return; }
    setWalkOptions(opts); setKind('walk-options'); setTitle('Walks joining your streets');
    setSelected(null); setSheetOpen(true); setStatus('');
    clearHighlights();                       // hide the street highlight while choosing
  }
  // Draw a chosen option and show its street-by-street itinerary.
  function chooseWalk(opt, i) {
    // list the AREAS the walk passes (landmarks), not street names; clicking one
    // pans to that landmark. Fall back to a single "where" row if it passes none.
    const coords = opt.line.geometry.coordinates;
    let rows = opt.areas.map(a => {
      const L = LANDMARKS.find(l => l.name === a);
      return { name: a, sub: 'along the way',
        feature: { type: 'Feature', geometry: { type: 'Point', coordinates: L ? L.pts[0] : coords[0] }, properties: {} } };
    });
    if (!rows.length) rows = [{ name: opt.where, sub: '',
      feature: { type: 'Feature', geometry: { type: 'Point', coordinates: coords[Math.floor(coords.length / 2)] }, properties: {} } }];
    setKind('route'); setTitle(opt.label);
    setRouteStats({ m: opt.len, where: opt.where });
    setResults(rows); setSelected(null); setSheetOpen(true);
    showRoute(opt.line);
  }
  // Back to the vibe street list from the options / a drawn route.
  function backToStreets() { if (routeTargetRef.current) runVibe(); else clearSearch(); }

  function runVibe() {
    // rank streets on all active axes; if the user leans toward PARK, also surface
    // the actual park WALKS (nature-paths) — the paths INSIDE parks aren't named
    // streets, so they can only come from that layer. Walks listed first (they ARE
    // the parks), then the vibe-ranked streets.
    const target = readVibeTarget();
    const streets = rankByVibe(target, vibeFeats.current);
    const wantPark = target.park != null && target.park > 0;
    const walks = wantPark ? resolveNature(natureFeats.current) : [];
    const list = [...walks, ...streets];
    setKind('vibe'); setTitle('Matching your vibe'); setResults(list);
    setSelected(null); setSheetOpen(true);
    // remember what to join into a walk (the ranked STREETS, not the park walks)
    routeTargetRef.current = Object.keys(target).length ? target : null;
    setVibeStreets(streets); setWalkOptions(null);
    if (wantPark && walks.length) showBoth(streets, walks); else showStreets(streets);
    if (!list.length) setStatus('No vibe scores loaded for these streets yet.');
  }
  // preset vibe chips — a fixed target instead of the live sliders.
  function runPreset(p) {
    setQuery('');
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
    setQuery(''); resetWalk();
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
    resetWalk();
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
    setRouteStats(null); resetWalk();
    clearHighlights();
  }

  function selectResultByName(name) {
    const r = results.find(x => x.name === name);
    if (!r) return;
    setSelected(name);
    const map = mapRef.current;
    const pts = coordsOf(r.feature.geometry);
    const mid = pts[Math.floor(pts.length / 2)];
    if (map && mid) new maplibregl.Popup({ offset: 10 }).setLngLat(mid)
      .setHTML(`<b>${r.name}</b><br>${r.sub}`).addTo(map);
  }

  const ease = 'cubic-bezier(.22,1,.36,1)';

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: 'var(--map-land)' }}>
      {/* the map fills the screen */}
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />

      {/* search overlay, pinned to the top */}
      <div style={{ position: 'absolute', top: 8, left: 14, right: 14, zIndex: 10 }}>
        <SearchBar query={query} setQuery={setQuery} onSubmit={runFreeText} onClear={clearSearch}
          hasResults={results.length > 0} />
        <ChipRow activeKind={kind} onVibe={runVibe} onPreset={runPreset} onCategory={runCategory} />
        {status && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
          background: 'var(--card)', borderRadius: t.radiusSm, padding: '5px 10px', display: 'inline-block', boxShadow: 'var(--shadow)' }}>{status}</div>}
      </div>

      {/* results bottom sheet */}
      {(results.length > 0 || (kind === 'walk-options' && walkOptions && walkOptions.length)) && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, background: 'var(--card)',
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
                    return `${(routeStats.m / 1000).toFixed(1)} km walk`;
                  const nWalk = results.filter(r => r.type === 'nature').length;
                  const nStreet = results.length - nWalk;
                  const plur = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
                  if (nWalk && nStreet) return `${plur(nStreet, 'street')} · ${plur(nWalk, 'park walk')}`;
                  if (nWalk) return plur(nWalk, 'nature walk');
                  return plur(nStreet, 'street');
                })()}</Label>
                <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 18, color: 'var(--ink)', marginTop: 2 }}>{title}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, color: 'var(--ink-soft)', transform: sheetOpen ? 'rotate(180deg)' : 'none', transition: `transform .42s ${ease}` }}>
                <path d="M3 10 L8 5 L13 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 16px 26px', display: 'flex', flexDirection: 'column', gap: 7 }}>

            {/* PROPOSITION — turn the shown vibe streets into a walk */}
            {kind === 'vibe' && routeTargetRef.current && vibeStreets && vibeStreets.length > 0 && (
              <button onClick={proposeWalks}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
                  border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: t.radiusSm, padding: '11px 13px', marginBottom: 3 }}>
                <span style={{ fontSize: 17, lineHeight: 1 }}>🧭</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>Make a walk with these streets</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.85 }}>~{WALK_MIN_MIN}–{WALK_MIN} min from your spot · a few options to choose</span>
                </span>
                <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
              </button>
            )}

            {/* BACK control while choosing an option or viewing a drawn route */}
            {(kind === 'walk-options' || kind === 'route') && (
              <button onClick={kind === 'route' && walkOptions ? () => { setKind('walk-options'); clearHighlights(); } : backToStreets}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', color: 'var(--ink-soft)',
                  cursor: 'pointer', fontSize: 12.5, fontWeight: 700, padding: '2px 0 4px' }}>
                ‹ {kind === 'route' && walkOptions ? 'other options' : 'back to streets'}
              </button>
            )}

            {kind === 'walk-options'
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
    </div>
  );
}

Object.assign(window, { RealMapScreen });

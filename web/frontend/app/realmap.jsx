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

// FUNCTION path — everyday words (EN/FR) → Korean commerce-category tokens.
// A street's `commerce_why` (its over-represented shop signature) is matched
// by substring, so "bakery" finds "빵/도넛" streets. tokens are substrings
// deliberately shorter than the full category so variants also match.
const FUNCTION_GROUPS = [
  { id: 'food', label: 'Food', emoji: '🍜',
    syn: ['food', 'restaurant', 'restaurants', 'resto', 'restos', 'eat', 'dinner', 'lunch', 'meal', 'manger', 'restauration', 'korean', 'bbq', 'barbecue', '밥', '식당', '맛집'],
    tokens: ['백반', '한정식', '경양식', '구이', '찜', '회', '초밥', '국수', '칼국수', '국/탕', '찌개', '족발', '보쌈', '파스타', '스테이크', '버거', '피자', '치킨', '중국집', '횟집', '냉면', '마라탕', '훠궈', '분식', '만두', '김밥', '전골', '부침개', '덮밥', '돈가스', '카레', '면 요리', '서양식', '한식 음식점', '동남아', '베트남', '복 요리', '구내식당', '뷔페'] },
  { id: 'cafe', label: 'Café · dessert', emoji: '☕',
    syn: ['cafe', 'café', 'coffee', 'dessert', 'bakery', 'boulangerie', 'bread', 'pastry', 'cake', 'tea', 'brunch', '카페', '빵'],
    tokens: ['빵', '도넛', '아이스크림', '빙수', '토스트', '샌드위치', '샐러드', '떡', '한과'] },
  { id: 'bar', label: 'Bars', emoji: '🍺',
    syn: ['bar', 'bars', 'pub', 'drink', 'drinks', 'boire', 'beer', 'soju', 'nightlife', 'alcohol', '술집', '주점'],
    tokens: ['주점', '생맥주', '유흥', '주류 소매'] },
  { id: 'jewelry', label: 'Jewelry', emoji: '💍',
    syn: ['jewelry', 'jewellery', 'jewel', 'bijoux', 'bijouterie', 'watch', 'watches', 'montre', 'gold', '귀금속', '시계'],
    tokens: ['시계', '귀금속', '액세서리', '잡화'] },
  { id: 'fashion', label: 'Fashion', emoji: '👗',
    syn: ['clothes', 'clothing', 'fashion', 'vetements', 'vêtements', 'mode', 'dress', 'shoes', 'boutique', 'hanbok', '옷', '의류', '패션'],
    tokens: ['의류', '신발', '가방', '한복'] },
  { id: 'cosmetics', label: 'Beauty', emoji: '💄',
    syn: ['cosmetics', 'cosmetic', 'beauty', 'makeup', 'cosmetiques', 'cosmétiques', 'skincare', '화장품'],
    tokens: ['화장품'] },
  { id: 'art', label: 'Art · music', emoji: '🎨',
    syn: ['art', 'arts', 'gallery', 'galleries', 'galerie', 'arty', 'painting', 'music', 'instrument', '예술', '갤러리'],
    tokens: ['예술품', '악기', '음반'] },
  { id: 'books', label: 'Books', emoji: '📚',
    syn: ['book', 'books', 'bookshop', 'bookstore', 'livre', 'livres', 'librairie', 'library', 'stationery', '서점', '책'],
    tokens: ['서점', '문구', '회화용품'] },
  { id: 'souvenir', label: 'Souvenirs', emoji: '🎁',
    syn: ['souvenir', 'souvenirs', 'gift', 'gifts', 'cadeau', 'cadeaux', '기념품'],
    tokens: ['기념품'] },
  { id: 'flowers', label: 'Flowers', emoji: '🌷',
    syn: ['flower', 'flowers', 'florist', 'fleurs', 'fleuriste', '꽃'],
    tokens: ['꽃집'] },
  { id: 'market', label: 'Market', emoji: '🛒',
    syn: ['market', 'grocery', 'groceries', 'epicerie', 'épicerie', 'supermarket', 'mart', '시장', '마트'],
    tokens: ['슈퍼마켓', '편의점', '반찬', '식료품', '채소', '과일', '정육', '수산물', '건어물', '곡물'] },
];

// parse "빵/도넛 (26), 꽃집 (3)" → [["빵/도넛",26],["꽃집",3]]
function parseCommerceWhy(cw) {
  if (!cw) return [];
  return cw.split(',').map(tok => {
    const m = tok.match(/^(.*?)\s*\((\d+)\)\s*$/);
    return m ? [m[1].trim(), +m[2]] : [tok.trim(), 1];
  });
}

// Find which function groups a free-text query names (may match several).
function matchFunctionGroups(q) {
  const s = q.toLowerCase().trim();
  if (!s) return [];
  return FUNCTION_GROUPS.filter(g => g.syn.some(w => s.includes(w) || w.includes(s)));
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

// VIBE resolver — read the sliders, map the 3 axes we have NLP data for, then
// rank named streets by how close their scores sit to the target vibe.
// (origin / price / energy / green have no per-named-street score yet → skipped;
//  those layers come later, per "keep it simple for now".)
const VIBE_AXIS_MAP = {
  era: 'historic_contemporary',   // slider 0=Historic → -1 ; axis pos=contemporary(+1)
  finish: 'raw_polished',         // slider 0=Raw → -1 ; axis pos=polished(+1)
  crowd: 'touristy_local',        // slider 0=Touristy → -1 ; axis pos=local(+1)
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

function resolveVibe(feats) {
  const target = readVibeTarget();
  const axes = Object.keys(target);
  if (!axes.length) return [];
  const out = [];
  feats.forEach(f => {
    let sum = 0, used = 0;
    axes.forEach(ax => {
      const s = f.properties[ax];
      if (s == null) return;
      sum += Math.pow(s - target[ax], 2);
      used++;
    });
    if (used === 0) return;
    const dist = Math.sqrt(sum / used);            // 0 = perfect, 2 = opposite
    out.push({ name: f.properties.name, score: 1 - dist / 2, feature: f, used,
      sub: `${Math.round((1 - dist / 2) * 100)}% vibe fit · ${used} ${used > 1 ? 'axes' : 'axis'}` });
  });
  // prefer streets that matched on more axes, then on closeness
  return out.sort((a, b) => (b.used - a.used) || (b.score - a.score)).slice(0, 12);
}

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

function ChipRow({ activeKind, onVibe, onFunction }) {
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
      {FUNCTION_GROUPS.map(g => (
        <button key={g.id} onClick={() => onFunction(g)}
          style={chip(activeKind === 'function:' + g.id)}>{g.emoji} {g.label}</button>
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

  const [status, setStatus] = React.useState('Loading the neighbourhood…');
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState(null);       // 'vibe' | 'function:<id>' | 'place'
  const [title, setTitle] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [sheetOpen, setSheetOpen] = React.useState(true);

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
    });

    return () => { cancelled = true; map.remove(); mapRef.current = null; };
  }, []);

  // ---- push a candidate set to the map + fit to it ----
  function showCandidates(list) {
    const map = mapRef.current;
    if (!map || !map.getSource('candidates')) return;
    const fc = { type: 'FeatureCollection', features: list.map(r => r.feature) };
    map.getSource('candidates').setData(fc);
    const b = new maplibregl.LngLatBounds();
    fc.features.forEach(f => {
      const g = f.geometry, lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
      lines.forEach(l => l.forEach(p => b.extend(p)));
    });
    if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 120, bottom: 300, left: 40, right: 40 }, maxZoom: 16 });
  }

  function runVibe() {
    const list = resolveVibe(vibeFeats.current);
    setKind('vibe'); setTitle('Streets matching your vibe'); setResults(list);
    setSelected(null); setSheetOpen(true); showCandidates(list);
    if (!list.length) setStatus('No vibe scores loaded for these streets yet.');
  }
  function runFunction(group) {
    const list = resolveFunction([group], scFeats.current);
    setKind('function:' + group.id); setTitle(`${group.emoji} ${group.label} streets`);
    setResults(list); setSelected(null); setSheetOpen(true); showCandidates(list);
    setQuery('');
  }
  function runFreeText(q) {
    const groups = matchFunctionGroups(q);
    if (groups.length) {
      const list = resolveFunction(groups, scFeats.current);
      setKind('function:' + groups[0].id);
      setTitle(`${groups[0].emoji} ${groups.map(g => g.label).join(' / ')} streets`);
      setResults(list); setSelected(null); setSheetOpen(true); showCandidates(list);
      return;
    }
    const list = resolvePlace(q, scFeats.current);
    setKind('place'); setTitle(`“${q}”`); setResults(list);
    setSelected(null); setSheetOpen(true); showCandidates(list);
  }
  function clearSearch() {
    setQuery(''); setKind(null); setTitle(''); setResults([]); setSelected(null);
    const map = mapRef.current;
    if (map && map.getSource('candidates')) map.getSource('candidates').setData({ type: 'FeatureCollection', features: [] });
  }

  function selectResultByName(name) {
    const r = results.find(x => x.name === name);
    if (!r) return;
    setSelected(name);
    const map = mapRef.current;
    const g = r.feature.geometry, lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    const pts = lines.flat(); const mid = pts[Math.floor(pts.length / 2)];
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
        <ChipRow activeKind={kind} onVibe={runVibe} onFunction={runFunction} />
        {status && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
          background: 'var(--card)', borderRadius: t.radiusSm, padding: '5px 10px', display: 'inline-block', boxShadow: 'var(--shadow)' }}>{status}</div>}
      </div>

      {/* results bottom sheet */}
      {results.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, background: 'var(--card)',
          borderTopLeftRadius: t.radius + 4, borderTopRightRadius: t.radius + 4, borderTop: '1px solid var(--line)',
          boxShadow: '0 -18px 50px -28px rgba(0,0,0,0.5)', maxHeight: '58%', display: 'flex', flexDirection: 'column',
          transform: sheetOpen ? 'none' : 'translateY(calc(100% - 58px))', transition: `transform .42s ${ease}` }}>
          <div onClick={() => setSheetOpen(o => !o)} role="button" style={{ cursor: 'pointer', padding: '10px 20px 8px', flex: '0 0 auto' }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--line-strong)', margin: '0 auto 9px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <Label style={{ margin: 0 }}>{results.length} street{results.length > 1 ? 's' : ''} · one granularity</Label>
                <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 18, color: 'var(--ink)', marginTop: 2 }}>{title}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, color: 'var(--ink-soft)', transform: sheetOpen ? 'rotate(180deg)' : 'none', transition: `transform .42s ${ease}` }}>
                <path d="M3 10 L8 5 L13 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 16px 26px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {results.map((r, i) => {
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

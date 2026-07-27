/* ============================================================
   THEME + DATA MODULE
   Single look: the WANDER design system ("Structured Fluidity").
   All UI authors against these CSS vars, so this one theme maps the
   design-system tokens (design_system/tokens/*) onto the whole app:
   - canvas    : soft teal ivory  (#C1EBE9)
   - accent    : cobalt           (#4456FF)
   - text      : seaweed ramp     (deep desaturated green, never black)
   - map data  : mint / lime / liliac / orchid semantics
   - type      : Space Grotesk (UI) + Space Mono (data layer)
   ============================================================ */

const THEMES = {
  wander: {
    name: 'Wander',
    tagline: 'Structured fluidity · soft data, crisp controls',
    dark: false,
    vars: {
      /* surfaces — tints of the teal canvas */
      '--paper': '#DFF1F1',          // light teal canvas
      '--paper-2': '#CDE9E9',        // deeper tint
      '--card': '#FFFFFF',           // white card over canvas
      '--card-2': '#EAF7F7',         // raised surface
      /* text — seaweed ramp */
      '--ink': '#143229',            // seaweed-900 (strong)
      '--ink-soft': '#255A4B',       // seaweed-500 (body)
      '--ink-faint': '#5E8A7C',      // seaweed-300 (muted)
      /* lines — hairlines at ~16/28% seaweed */
      '--line': 'rgba(37,90,75,0.16)',
      '--line-strong': 'rgba(37,90,75,0.28)',
      /* accent — cobalt, the single primary */
      '--accent': '#4456FF',         // cobalt-500
      '--accent-ink': '#FFFFFF',     // text on cobalt
      '--accent-soft': '#E3E6FF',    // cobalt-100
      /* data-viz hues — outing personalities + map semantics */
      '--a1': '#D238EB',             // orchid (alert / specialized)
      '--a2': '#C9FF46',             // lime   (preference match)
      '--a3': '#4456FF',             // cobalt (solo)
      '--a4': '#8A5BFF',             // iris   (couple)
      /* map */
      '--map-land': '#DFF1F1',       // canvas
      '--map-land-2': '#CDE9E9',     // deeper blocks
      '--map-road': 'rgba(37,90,75,0.42)',   // seaweed grid
      '--map-park': '#A6FFE8',       // mint
      '--map-water': '#9FA3FF',      // liliac
      '--zone': '#4456FF',           // cobalt radar-mist zone
      '--dot': '#4456FF', '--dot-glow': 'rgba(68,86,255,0.35)',  // wash-cobalt
      '--path': '#A6FFE8',           // mint primary safe path
      '--good': '#34C38F',           // positive (mint-green)
      '--warn': '#D238EB',           // orchid alert
      '--shadow': '0 4px 20px rgba(37,90,75,0.10)',  // soft seaweed-tinted
    },
    fontHead: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
    fontUI: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'Space Mono', 'SF Mono', ui-monospace, monospace",
    headWeight: 700, headTrack: '-0.02em', headStyle: 'normal',
    label: { spacing: '0.18em', transform: 'uppercase', weight: 400, font: 'mono' },
    radius: 20, radiusSm: 12, radiusPill: 999,
  },
};
const THEME_ORDER = ['wander'];

/* ---- shared content data ---- */

const HERO_PHOTO = 'assets/photos/insadong-alley.jpg';

// 1A — swipe deck. card 0 has the real photo; rest are drag-to-fill slots.
const SWIPE_CARDS = [
  { id: 'c1', place: '익선동 · Ikseon-dong', scene: 'Hanok lane, low foot traffic', tags: ['quiet', 'historic', 'independent'], src: HERO_PHOTO, hint: 'Insadong alley (your photo)' },
  { id: 'c2', place: '서순라길 · Seosulla-gil', scene: 'Stone wall path along the shrine', tags: ['quiet', 'leafy', 'historic'], src: null, hint: 'Seosulla-gil stone wall' },
  { id: 'c3', place: '성수 · Seongsu', scene: 'Brick workshop turned café', tags: ['raw', 'industrial', 'artsy'], src: null, hint: 'Seongsu brick storefront' },
  { id: 'c4', place: '홍대 · Hongdae', scene: 'Busy mural street at dusk', tags: ['lively', 'young', 'buzzing'], src: null, hint: 'Hongdae mural street' },
  { id: 'c5', place: '익선동 · Ikseon-dong', scene: 'Lantern-lit dessert alley', tags: ['cosy', 'date', 'tucked-away'], src: null, hint: 'Ikseon lantern alley' },
  { id: 'c6', place: '성수 · Seongsu', scene: 'Quiet residential back-lane', tags: ['calm', 'local', 'low-key'], src: null, hint: 'Seongsu residential lane' },
  { id: 'c7', place: '서순라길 · Seosulla-gil', scene: 'Bookshop & tea, no crowds', tags: ['minimal', 'no crowds', 'independent'], src: null, hint: 'Seosulla bookshop' },
  { id: 'c8', place: '홍대 · Hongdae', scene: 'Riverside underpass, golden hour', tags: ['riverside', 'open', 'lively'], src: null, hint: 'Hongdae riverside' },
];

// 1B — vibe axes
const VIBE_AXES = [
  { id: 'era', left: 'Historic', right: 'Contemporary', def: 0.32 },
  { id: 'finish', left: 'Raw / organic', right: 'Polished', def: 0.40 },
  { id: 'origin', left: 'Local / indie', right: 'Chain', def: 0.18 },
  { id: 'crowd', left: 'Touristy', right: 'Local', def: 0.62 },
  { id: 'energy', left: 'Quiet', right: 'Lively', def: 0.58 },
  { id: 'green', left: 'Greenery', right: 'Park', def: 0.66 },
];

// 2 — map. coords are % of the map viewport.
const MAP_ZONE = { cx: 52, cy: 50, r: 33 };
const MAP_SPOTS = [
  { id: 's1', name: 'Cheongsudang lane', x: 44, y: 38, match: 0.96, why: 'quiet · historic · indie' },
  { id: 's2', name: 'Seosulla tea house', x: 64, y: 30, match: 0.88, why: 'leafy · no crowds' },
  { id: 's3', name: 'Hanok bookshop', x: 38, y: 56, match: 0.82, why: 'minimal · old bookshops' },
  { id: 's4', name: 'Brick roastery', x: 60, y: 60, match: 0.74, why: 'raw · artsy' },
  { id: 's5', name: 'Lantern dessert bar', x: 52, y: 72, match: 0.66, why: 'cosy · tucked-away' },
  { id: 's6', name: 'Mural corner', x: 72, y: 50, match: 0.46, why: 'lively · young' },
  { id: 's7', name: 'Riverside underpass', x: 30, y: 40, match: 0.40, why: 'open · riverside' },
];
// dashed "local hidden path" — a route only locals know, along 서순라길
const HIDDEN_PATH = [[33, 70], [40, 60], [44, 52], [46, 42], [52, 36], [62, 31]];
// white "famous local path" — the lane everyone who lives here walks
const FAMOUS_PATH = [[26, 86], [32, 74], [38, 66], [43, 57], [48, 49], [53, 41], [59, 32], [64, 20]];
// yellow-dotted "recommended path" — what the app suggests, starting at the puck
const RECO_PATH = [[50, 68], [45, 61], [47, 53], [51, 47], [56, 43], [61, 37], [63, 28]];

// modes for screen 2
const MAP_MODES = [
  { id: 'follow', name: 'Follow', blurb: 'The app guides you, turn by turn.' },
  { id: 'modify', name: 'Modify', blurb: 'It proposes — you reshape on the fly.' },
  { id: 'background', name: 'Background', blurb: 'Stays quiet, nudges near something great.' },
];

// 3 — people + social
const PEOPLE = {
  you: { id: 'you', name: 'You', init: 'Y', hue: 'var(--accent)' },
  sora: { id: 'sora', name: 'Sora', init: 'S', hue: 'var(--a1)' },
  min: { id: 'min', name: 'Min', init: 'M', hue: 'var(--a3)' },
  jae: { id: 'jae', name: 'Jae', init: 'J', hue: 'var(--a4)' },
};
const SOCIAL = {
  solo: {
    label: 'Solo', blurb: 'Tuned only to you.',
    changes: [{ k: '+', t: 'Deep-focus spots & solo seating ranked up' }, { k: '+', t: 'Longer wander loops, fewer stops' }, { k: '–', t: 'Group-only venues hidden' }],
  },
  couple: {
    label: 'Couple', blurb: 'Blending 2 profiles.',
    changes: [{ k: '+', t: 'Date-friendly cafés ranked higher' }, { k: '+', t: 'Quieter streets you both like' }, { k: '–', t: 'Solo-only spots hidden' }],
  },
  group: {
    label: 'Group', blurb: 'Blending 3 profiles.',
    changes: [{ k: '+', t: 'Wider streets & shareable tables up' }, { k: '+', t: 'Spots near everyone\u2019s overlap zone' }, { k: '–', t: 'Tight one-seat alleys downranked' }],
  },
};

// 3B — group merge: each axis lists every person's comfortable range.
// The overlap (and any conflict) is COMPUTED from these in group.jsx, so a
// "no common ground" axis like `energy` below renders as a reconciliation case.
const GROUP_AXES = [
  { id: 'energy', left: 'Quiet', right: 'Lively', ranges: { you: [0.20, 0.45], min: [0.62, 0.88], jae: [0.25, 0.50] } },
  { id: 'era', left: 'Historic', right: 'Modern', ranges: { you: [0.20, 0.50], min: [0.35, 0.70], jae: [0.15, 0.45] } },
  { id: 'price', left: 'Cheap', right: 'Fancy', ranges: { you: [0.25, 0.55], min: [0.40, 0.75], jae: [0.30, 0.60] } },
  { id: 'green', left: 'Concrete', right: 'Greenery', ranges: { you: [0.50, 0.80], min: [0.40, 0.70], jae: [0.55, 0.90] } },
];
const GROUP_FLAGS = [
  { ok: true, t: '' },
  { ok: false, t: '' },
];

/* ---- tiny helpers ---- */
function usePersist(key, initial) {
  const [v, setV] = React.useState(() => {
    try { const s = localStorage.getItem('seoulwalk.' + key); return s != null ? JSON.parse(s) : initial; }
    catch (e) { return initial; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('seoulwalk.' + key, JSON.stringify(v)); } catch (e) {}
  }, [key, v]);
  return [v, setV];
}
const prefersReduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---- geometry → mini-map thumbnail ----
   Turn a GeoJSON geometry into a small set of [x, y] points inside a padded
   0..100 box (y flipped so geographic north points up), used to draw a favorite
   street's real shape as a card thumbnail. */
function geomSegments(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  if (geom.type === 'Point') return [[geom.coordinates]];
  return [];
}
function geomToThumb(geom, maxPts = 24) {
  const segs = geomSegments(geom);
  if (!segs.length) return [];
  // pick the longest single segment for a clean, un-jumped line
  let coords = segs.reduce((a, s) => (s.length > a.length ? s : a), []);
  if (coords.length < 2) coords = segs.flat();
  if (coords.length < 2) return [];
  const xs = coords.map(c => c[0]), ys = coords.map(c => c[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const w = (maxx - minx) || 1e-9, h = (maxy - miny) || 1e-9, sc = Math.max(w, h);
  const pad = 12, span = 100 - 2 * pad, ox = (sc - w) / 2, oy = (sc - h) / 2;
  let pts = coords.map(([x, y]) => [
    +(pad + ((x - minx) + ox) / sc * span).toFixed(1),
    +(pad + ((maxy - y) + oy) / sc * span).toFixed(1),
  ]);
  if (pts.length > maxPts) {                       // downsample so the stored favorite stays small
    const step = (pts.length - 1) / (maxPts - 1);
    pts = Array.from({ length: maxPts }, (_, i) => pts[Math.round(i * step)]);
  }
  return pts;
}

/* ---- favorites store ----
   Persisted in localStorage and shared across screens: the map writes, the
   profile reads. A custom event keeps any mounted screen live-synced. Each
   favorite = { name, sub, points, kind }. */
const FAV_KEY = 'seoulwalk.favorites';
const FAV_EVENT = 'seoulwalk:favorites';
function getFavorites() {
  try { const s = localStorage.getItem(FAV_KEY); return s ? JSON.parse(s) : []; } catch (e) { return []; }
}
function writeFavorites(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(FAV_EVENT)); } catch (e) {}
}
function isFavorite(name) { return getFavorites().some(f => f.name === name); }
// Add (newest first) or remove a favorite, keyed by name. Returns true if now saved.
function toggleFavorite(fav) {
  const list = getFavorites();
  const i = list.findIndex(f => f.name === fav.name);
  if (i >= 0) list.splice(i, 1); else list.unshift(fav);
  writeFavorites(list);
  return i < 0;
}
// Live-synced favorites list for a component.
function useFavorites() {
  const [list, setList] = React.useState(getFavorites);
  React.useEffect(() => {
    const sync = () => setList(getFavorites());
    window.addEventListener(FAV_EVENT, sync);
    window.addEventListener('storage', sync);   // sync across tabs too
    return () => { window.removeEventListener(FAV_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  return list;
}

Object.assign(window, {
  THEMES, THEME_ORDER, HERO_PHOTO, SWIPE_CARDS, VIBE_AXES,
  MAP_ZONE, MAP_SPOTS, HIDDEN_PATH, FAMOUS_PATH, RECO_PATH, MAP_MODES, PEOPLE, SOCIAL, GROUP_AXES, GROUP_FLAGS,
  usePersist, prefersReduced, clamp, lerp,
  geomToThumb, getFavorites, isFavorite, toggleFavorite, useFavorites,
});

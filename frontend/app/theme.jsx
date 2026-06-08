/* ============================================================
   THEME + DATA MODULE
   Three aesthetic directions derived from the inspiration set:
   - Inkwell   : warm paper + soft match-auras + ink   (insp #3)
   - Nightfall : dark slate heat-map + lilac accents    (insp #1 + #4)
   - Candy     : bold cobalt / lime / orchid pop         (insp #2)
   ============================================================ */

const THEMES = {
  inkwell: {
    name: 'Inkwell',
    tagline: 'Warm paper · soft match-auras · ink',
    dark: false,
    vars: {
      '--paper': '#F1EBDE',
      '--paper-2': '#E8E0CF',
      '--card': '#FBF8F1',
      '--card-2': '#F4EEE2',
      '--ink': '#1E1B16',
      '--ink-soft': '#7A7363',
      '--ink-faint': '#A79E8B',
      '--line': '#DDD4C1',
      '--line-strong': '#C8BDA6',
      '--accent': '#46638E',
      '--accent-ink': '#FBF8F1',
      '--accent-soft': 'rgba(70,99,142,0.12)',
      '--a1': '#DB8350', '--a2': '#D8AC3E', '--a3': '#5B86C4', '--a4': '#9A8CD0',
      '--map-land': '#E9E1D1', '--map-land-2': '#E2D8C4', '--map-road': '#FCFAF4',
      '--map-park': '#D6DEC2', '--map-water': '#C9D8DD',
      '--zone': '#46638E', '--dot': '#46638E', '--dot-glow': 'rgba(70,99,142,0.28)',
      '--path': '#C0673D',
      '--good': '#5C8A5E', '--warn': '#C0673D',
      '--shadow': '0 18px 50px -22px rgba(40,32,16,0.45)',
    },
    fontHead: "'Newsreader', Georgia, serif",
    fontUI: "'Hanken Grotesk', system-ui, sans-serif",
    fontMono: "'Hanken Grotesk', system-ui, sans-serif",
    headWeight: 500, headTrack: '-0.01em', headStyle: 'normal',
    label: { spacing: '0.14em', transform: 'uppercase', weight: 600, font: 'ui' },
    radius: 22, radiusSm: 14, radiusPill: 999,
  },
  nightfall: {
    name: 'Nightfall',
    tagline: 'Dark heat-map · lilac data accents',
    dark: true,
    vars: {
      '--paper': '#14171D',
      '--paper-2': '#0E1116',
      '--card': '#1B1F27',
      '--card-2': '#222730',
      '--ink': '#ECEAE3',
      '--ink-soft': '#99A0AC',
      '--ink-faint': '#5E6675',
      '--line': '#2A303B',
      '--line-strong': '#3A414E',
      '--accent': '#C4A0F5',
      '--accent-ink': '#15121C',
      '--accent-soft': 'rgba(196,160,245,0.16)',
      '--a1': '#F0633A', '--a2': '#F0A23A', '--a3': '#E14B4B', '--a4': '#C4A0F5',
      '--map-land': '#171B22', '--map-land-2': '#1C212A', '--map-road': '#39414F',
      '--map-park': '#1B2820', '--map-water': '#142630',
      '--zone': '#F0633A', '--dot': '#F0A23A', '--dot-glow': 'rgba(240,99,58,0.45)',
      '--path': '#E14B4B',
      '--good': '#6FC18A', '--warn': '#F0A23A',
      '--shadow': '0 22px 60px -20px rgba(0,0,0,0.7)',
    },
    fontHead: "'Hanken Grotesk', system-ui, sans-serif",
    fontUI: "'Hanken Grotesk', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    headWeight: 700, headTrack: '-0.02em', headStyle: 'normal',
    label: { spacing: '0.18em', transform: 'uppercase', weight: 500, font: 'mono' },
    radius: 18, radiusSm: 12, radiusPill: 999,
  },
  candy: {
    name: 'Candy',
    tagline: 'Bold pop · cobalt / lime / orchid',
    dark: false,
    vars: {
      '--paper': '#FEFFE3',
      '--paper-2': '#F6F7CF',
      '--card': '#FFFFFF',
      '--card-2': '#FBFBEC',
      '--ink': '#16161C',
      '--ink-soft': '#56564C',
      '--ink-faint': '#9A9A86',
      '--line': 'rgba(20,20,25,0.10)',
      '--line-strong': 'rgba(20,20,25,0.22)',
      '--accent': '#4456FF',
      '--accent-ink': '#FEFFE3',
      '--accent-soft': 'rgba(68,86,255,0.12)',
      '--a1': '#D238EB', '--a2': '#C9FF46', '--a3': '#4456FF', '--a4': '#A6FFE8',
      '--map-land': '#FEFFE3', '--map-land-2': '#F2F4CF', '--map-road': 'rgba(68,86,255,0.30)',
      '--map-park': '#A6FFE8', '--map-water': '#9FA3FF',
      '--zone': '#D238EB', '--dot': '#4456FF', '--dot-glow': 'rgba(210,56,235,0.30)',
      '--path': '#D238EB',
      '--good': '#34C38F', '--warn': '#D238EB',
      '--shadow': '0 16px 0 -8px rgba(20,20,25,0.0)',
    },
    fontHead: "'Hanken Grotesk', system-ui, sans-serif",
    fontUI: "'Hanken Grotesk', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    headWeight: 800, headTrack: '-0.03em', headStyle: 'normal',
    label: { spacing: '0.12em', transform: 'uppercase', weight: 700, font: 'mono' },
    radius: 26, radiusSm: 16, radiusPill: 999,
  },
};
const THEME_ORDER = ['inkwell', 'nightfall', 'candy'];

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
  { id: 'energy', left: 'Quiet', right: 'Lively', def: 0.58 },
  { id: 'green', left: 'Less green', right: 'Greenery', def: 0.66 },
];

// 1C — word cloud (weight ≈ popularity → size)
const WORD_SUGGESTIONS = [
  { w: 'moody', s: 3 }, { w: 'leafy', s: 2 }, { w: 'gritty', s: 2 },
  { w: 'hidden', s: 3 }, { w: 'artsy', s: 1 }, { w: 'riverside', s: 2 },
  { w: 'vintage', s: 1 }, { w: 'buzzing', s: 1 }, { w: 'minimal', s: 2 },
  { w: 'old bookshops', s: 1 }, { w: 'no crowds', s: 3 }, { w: 'lantern-lit', s: 1 },
  { w: 'slow', s: 2 }, { w: 'cobbled', s: 1 },
];
const WORD_DEFAULTS = ['moody', 'no crowds', 'riverside'];

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

// 3B — group merge: each axis shows individual ranges + the overlap band
const GROUP_AXES = [
  { id: 'energy', left: 'Quiet', right: 'Lively', ranges: { you: [0.30, 0.60], min: [0.55, 0.85], jae: [0.20, 0.50] }, overlap: [0.30, 0.50] },
  { id: 'era', left: 'Historic', right: 'Modern', ranges: { you: [0.20, 0.50], min: [0.35, 0.70], jae: [0.15, 0.45] }, overlap: [0.35, 0.45] },
  { id: 'price', left: 'Cheap', right: 'Fancy', ranges: { you: [0.25, 0.55], min: [0.40, 0.75], jae: [0.30, 0.60] }, overlap: [0.40, 0.55] },
  { id: 'green', left: 'Concrete', right: 'Greenery', ranges: { you: [0.50, 0.80], min: [0.40, 0.70], jae: [0.55, 0.90] }, overlap: [0.55, 0.70] },
];
const GROUP_FLAGS = [
  { ok: true, t: '' },
  { ok: false, t: '' },
];

// 3C — group merge on the OPEN-VOCABULARY step: the words each person typed.
const GROUP_WORDS = {
  you: ['moody', 'no crowds', 'riverside', 'hidden'],
  min: ['no crowds', 'riverside', 'lively', 'artsy'],
  jae: ['no crowds', 'hidden', 'leafy', 'vintage'],
};

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

Object.assign(window, {
  THEMES, THEME_ORDER, HERO_PHOTO, SWIPE_CARDS, VIBE_AXES, WORD_SUGGESTIONS, WORD_DEFAULTS,
  MAP_ZONE, MAP_SPOTS, HIDDEN_PATH, FAMOUS_PATH, RECO_PATH, MAP_MODES, PEOPLE, SOCIAL, GROUP_AXES, GROUP_FLAGS, GROUP_WORDS,
  usePersist, prefersReduced, clamp, lerp,
});

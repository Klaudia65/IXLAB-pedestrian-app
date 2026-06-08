/* ============================================================
   2 — AREA OF INTEREST MAP   (the hero screen)
   Three mode behaviours:
     Follow  — one personalized route along the street grid.
     Choose  — two selectable alternative routes.
     Wander  — a soft "dense-vibe" field (Bloom / Contour / Mist),
               NOT a literal radar.
   User puck sits bottom-centre. Theme-variable colors on SVG
   go through `style` (var() is unreliable in SVG attrs).
   ============================================================ */

const YOU = [50, 68]; // bottom-centre, just above the sheet

const ROADS_MAJOR = [
'M0 34 C 30 30, 55 40, 100 33', 'M0 67 C 28 70, 60 60, 100 66',
'M30 0 C 34 30, 30 60, 38 100', 'M70 0 C 66 35, 72 65, 66 100'];

const ROADS_MINOR = [
'M0 20 L100 18', 'M0 50 L100 51', 'M0 82 L100 84',
'M16 0 L14 100', 'M50 0 L52 100', 'M86 0 L84 100',
'M0 8 L100 6', 'M0 92 L100 94'];

const DIAG = ['M0 96 L62 30', 'M44 100 L100 44'];

const FOLLOW_ROUTE = ['s4', 's3', 's1', 's2'];
const ALT_ROUTES = {
  a: { name: 'Quiet & historic', tag: 'calm · low-traffic', stops: ['s3', 's1', 's7'] },
  b: { name: 'Artsy & lively', tag: 'raw · buzzing', stops: ['s4', 's6', 's2'] }
};
const WANDER_STYLES = [{ id: 'bloom', name: 'Bloom' }, { id: 'contour', name: 'Contour' }, { id: 'mist', name: 'Mist' }];

// stepped, street-following path through a list of [x,y] points
function orthoPath(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1],[x, y] = pts[i];
    if (i % 2 === 1) d += ` L ${x} ${py} L ${x} ${y}`;else
    d += ` L ${px} ${y} L ${x} ${y}`;
  }
  return d;
}

// smooth closed path through points (quadratic-through-midpoints)
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M ${(pts[0][0] + pts[n - 1][0]) / 2} ${(pts[0][1] + pts[n - 1][1]) / 2}`;
  for (let i = 0; i < n; i++) {
    const cur = pts[i],next = pts[(i + 1) % n];
    d += ` Q ${cur[0]} ${cur[1]} ${(cur[0] + next[0]) / 2} ${(cur[1] + next[1]) / 2}`;
  }
  return d + ' Z';
}
function blobPts(cx, cy, r, wob, seed, N = 16) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * 2 * Math.PI;
    const rr = r * (1 + wob * Math.sin(a * 3 + seed) + wob * 0.4 * Math.cos(a * 5 + seed));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

// smooth open path through points (quadratic-through-midpoints, open ends)
function smoothOpen(pts) {
  if (pts.length < 3) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i], next = pts[i + 1];
    d += ` Q ${cur[0]} ${cur[1]} ${(cur[0] + next[0]) / 2} ${(cur[1] + next[1]) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

// walk a polyline and emit evenly-spaced points (for dotted paths)
function sampleAlong(pts, step) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    let d = acc;
    while (d < len) { out.push([x1 + dx * d / len, y1 + dy * d / len]); d += step; }
    acc = d - len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function MapCanvas({ mode, spots, selected, onSelect, alt, wander }) {
  const t = React.useContext(ThemeCtx);
  const Z = MAP_ZONE;
  const coordOf = (id) => {const s = spots.find((x) => x.id === id);return [s.x, s.y];};
  const routeStops = mode === 'follow' ? FOLLOW_ROUTE : mode === 'modify' ? ALT_ROUTES[alt].stops : [];
  const routePts = [YOU, ...routeStops.map(coordOf)];
  const routeOn = routeStops.length > 0;
  const otherAlt = alt === 'a' ? 'b' : 'a';
  const isWander = mode === 'background';
  const bloom = isWander && wander === 'bloom';

  // deterministic mist field
  const mist = React.useMemo(() => {
    let s = 7;const rnd = () => {s = (s * 9301 + 49297) % 233280;return s / 233280;};
    const out = [];
    for (let i = 0; i < 95; i++) {
      const a = rnd() * 2 * Math.PI;
      const d = Math.pow(rnd(), 0.62) * Z.r * 1.04;
      const prox = 1 - d / (Z.r * 1.04);
      out.push({ x: Z.cx + Math.cos(a) * d, y: Z.cy + Math.sin(a) * d, r: 0.35 + prox * 0.95, o: 0.12 + prox * 0.5 });
    }
    return out;
  }, [Z.cx, Z.cy, Z.r]);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
    style={{ position: 'absolute', inset: 0, width: '100%', height: "600px" }}>
      <defs>
        <radialGradient id="zoneGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--zone)', stopOpacity: t.dark ? 0.55 : 0.22 }} />
          <stop offset="55%" style={{ stopColor: 'var(--zone)', stopOpacity: t.dark ? 0.28 : 0.11 }} />
          <stop offset="100%" style={{ stopColor: 'var(--zone)', stopOpacity: 0 }} />
        </radialGradient>
        {spots.map((s) =>
        <radialGradient key={s.id} id={'dot' + s.id} cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: 'var(--dot)', stopOpacity: t.dark ? 0.9 : 0.4 }} />
            <stop offset="100%" style={{ stopColor: 'var(--dot)', stopOpacity: 0 }} />
          </radialGradient>
        )}
      </defs>

      {/* ---- base map ---- */}
      <rect x="0" y="0" width="100" height="100" style={{ fill: 'var(--map-land)' }} />
      <path d="M4 22 C 14 16, 30 18, 32 30 C 33 42, 20 48, 8 44 C 1 41, 0 28, 4 22 Z" style={{ fill: 'var(--map-park)', opacity: t.dark ? 0.8 : 1 }} />
      <path d="M-2 100 C 18 86, 22 70, 40 60 C 58 50, 66 36, 78 14 L92 20 C 78 42, 70 56, 52 66 C 32 78, 26 92, 12 104 Z" style={{ fill: 'var(--map-water)', opacity: t.dark ? 0.5 : 0.55 }} />

      <g fill="none" strokeLinecap="round">
        {ROADS_MINOR.map((d, i) => <path key={i} d={d} strokeWidth="0.9" style={{ stroke: 'var(--map-road)', opacity: t.dark ? 0.5 : 0.9 }} />)}
        {DIAG.map((d, i) => <path key={i} d={d} strokeWidth="1.4" style={{ stroke: 'var(--map-road)', opacity: t.dark ? 0.55 : 0.95 }} />)}
        {ROADS_MAJOR.map((d, i) => <path key={i} d={d} strokeWidth="2.4" style={{ stroke: 'var(--map-road)', opacity: t.dark ? 0.7 : 1 }} />)}
      </g>

      {/* glow under the dense area (all modes; strongest in wander) */}
      <circle cx={Z.cx} cy={Z.cy} r={Z.r} fill="url(#zoneGlow)" style={{ opacity: isWander ? 1 : 0.7, fill: "rgba(0, 0, 0, 0)" }} />
      {bloom && <circle cx={Z.cx} cy={Z.cy} r={Z.r * 0.66} fill="url(#zoneGlow)" style={{ opacity: 0.9 }} />}

      {/* ================= WANDER: soft density field ================= */}
      {isWander && wander === 'contour' &&
      <g fill="none" strokeLinejoin="round">
          {[1, 0.78, 0.56, 0.34].map((f, i) =>
        <path key={i} d={smoothClosed(blobPts(Z.cx, Z.cy, Z.r * f, 0.06, i * 1.3))}
        strokeWidth={0.4} style={{ stroke: 'var(--zone)', opacity: (t.dark ? 0.55 : 0.42) * (0.5 + f * 0.5) }} />
        )}
        </g>}

      {isWander && wander === 'mist' &&
      <g>
          {mist.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r={m.r} style={{ fill: 'var(--zone)', opacity: m.o }} />)}
          <path d={smoothClosed(blobPts(Z.cx, Z.cy, Z.r, 0.05, 2))} fill="none" strokeWidth="0.4" strokeDasharray="1.5 2"
        style={{ opacity: 0.4, stroke: "rgba(240, 99, 58, 0)" }} />
        </g>}

      {/* ===== WANDER: famous local path (white line) + recommended path (yellow dots) ===== */}
      {isWander && <g>
        {/* famous local path — solid white line with a soft dark casing for contrast on light maps */}
        <path d={smoothOpen(FAMOUS_PATH)} fill="none" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round"
        style={{ stroke: t.dark ? 'rgba(0,0,0,0.30)' : 'rgba(30,27,22,0.18)' }} />
        <path d={smoothOpen(FAMOUS_PATH)} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ stroke: '#FFFFFF', opacity: 0.96 }} />

        {/* recommended path — evenly-spaced yellow dots */}
        {sampleAlong(RECO_PATH, 3.4).map(([x, y], i) =>
        <circle key={i} cx={x} cy={y} r="0.95"
        style={{ fill: 'var(--a2)', stroke: t.dark ? 'rgba(0,0,0,0.35)' : 'rgba(30,27,22,0.18)', strokeWidth: '0.25px' }} />
        )}
      </g>}

      {/* ================= FOLLOW / CHOOSE: routes ================= */}
      {mode === 'modify' &&
      <path d={orthoPath([YOU, ...ALT_ROUTES[otherAlt].stops.map(coordOf)])} fill="none" strokeWidth="1"
      strokeDasharray="1.4 2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--ink-faint)', opacity: 0.5 }} />}

      {routeOn && <React.Fragment>
        <path d={orthoPath(routePts)} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--card)', opacity: t.dark ? 0.25 : 0.9 }} />
        <path d={orthoPath(routePts)} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="route-draw" style={{ stroke: 'var(--accent)' }} />
      </React.Fragment>}

      {/* ---- match blips ---- */}
      {spots.map((s, i) => {
        const isSel = selected === s.id;
        const onRoute = routeStops.includes(s.id);
        const stopNo = onRoute ? routeStops.indexOf(s.id) + 1 : 0;
        const halo = lerp(3, 10, s.match) * (isWander ? 1.1 : 0.85);
        const core = lerp(1.1, 2.6, s.match);
        let op = 1;
        if (isWander) op = isSel ? 1 : 0.8;else
        if (routeOn && !onRoute && !isSel) op = 0.32;

        return (
          <g key={s.id} className={bloom ? 'blip-breathe' : undefined} style={{ cursor: 'pointer', opacity: op, animationDelay: bloom ? `${i * 0.3}s` : undefined }} onClick={() => onSelect(isSel ? null : s.id)}>
            <circle cx={s.x} cy={s.y} r={halo} fill={`url(#dot${s.id})`} style={{ strokeWidth: "0px", fill: "rgba(0, 0, 0, 0)" }} />
            {onRoute ?
            <g>
                <circle cx={s.x} cy={s.y} r="3.2" strokeWidth="0.6" style={{ fill: 'var(--accent)', stroke: t.dark ? '#fff' : 'var(--card)' }} />
                <text x={s.x} y={s.y} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--accent-ink)', fontSize: 3.1, fontWeight: 800, fontFamily: t.fontMono }}>{stopNo}</text>
              </g> :
            <g>
                <circle cx={s.x} cy={s.y} r={core + 1.1} fill="none" strokeWidth="0.5" style={{ stroke: 'var(--dot)', opacity: 0.6, strokeWidth: "0.3px" }} />
                <circle cx={s.x} cy={s.y} r={core} strokeWidth="0.5" style={{ fill: 'var(--dot)', stroke: t.dark ? 'rgba(255,255,255,0.7)' : 'var(--card)', strokeWidth: "0.3px" }} />
              </g>
            }
            {isSel && <circle cx={s.x} cy={s.y} r="4.6" fill="none" strokeWidth="0.6" style={{ stroke: 'var(--accent)' }} />}
          </g>);
      })}

      {/* ---- user puck (bottom-centre) ---- */}
      <g>
        <circle cx={YOU[0]} cy={YOU[1]} r="4" className="you-pulse" style={{ fill: 'var(--accent)', opacity: 0.2 }} />
        <circle cx={YOU[0]} cy={YOU[1]} r="2.1" strokeWidth="0.7" style={{ fill: 'var(--accent)', stroke: t.dark ? '#fff' : 'var(--card)' }} />
      </g>
    </svg>);
}

function Legend({ mode }) {
  const t = React.useContext(ThemeCtx);
  const rows = mode === 'background' ?
  [['zone', 'denser glow = better match'], ['famous', 'famous local path'], ['reco', 'recommended path']] :
  [['pin', 'matched stop · in order'], ['route', 'best-match route, not the fastest']];
  return (
    <div style={{ position: 'absolute', top: 120, left: 16, background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: t.radiusSm, padding: '9px 11px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 7, whiteSpace: 'nowrap' }}>
      {rows.map(([k, label]) =>
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}>
            {k === 'zone' && <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle, var(--zone) 10%, transparent 72%)' }} />}
            {k === 'blip' && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--dot)', opacity: 0.5 }} /><span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--dot)' }} /></span>}
            {k === 'famous' && <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" strokeWidth="4" strokeLinecap="round" style={{ stroke: t.dark ? 'rgba(0,0,0,0.30)' : 'rgba(30,27,22,0.28)' }} /><line x1="1" y1="4" x2="21" y2="4" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: '#FFFFFF' }} /></svg>}
            {k === 'reco' && <svg width="22" height="8">{[3, 8, 13, 18].map((cx) => <circle key={cx} cx={cx} cy="4" r="1.5" style={{ fill: 'var(--a2)' }} />)}</svg>}
            {k === 'pin' && <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontMono }}>1</span>}
            {k === 'route' && <svg width="22" height="8"><path d="M1 6 L8 6 L8 2 L21 2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--accent)' }} /></svg>}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>{label}</span>
        </div>
      )}
    </div>);
}

function MapScreen() {
  const t = React.useContext(ThemeCtx);
  const [mode, setMode] = usePersist('map.mode', 'background');
  const [selected, setSelected] = usePersist('map.selected', null);
  const [alt, setAlt] = usePersist('map.alt', 'a');
  const [wander, setWander] = usePersist('map.wander', 'bloom');
  const [dropped, setDropped] = React.useState(false);
  const spots = MAP_SPOTS;
  const fit = spots.filter((s) => s.match >= 0.5).length;
  const sel = spots.find((s) => s.id === selected);

  const sheet = {
    follow: { title: 'Follow · your route', big: `${FOLLOW_ROUTE.length} stops, picked for you`, sub: 'Threaded along the streets you swiped for — not the fastest way.', action: 'Start this route' },
    modify: { title: 'Choose · pick a route', big: ALT_ROUTES[alt].name, sub: `${ALT_ROUTES[alt].stops.length} stops · ${ALT_ROUTES[alt].tag}`, action: 'Use this route' },
    background: { title: 'Wander · go freely', big: 'Your vibe is dense around here', sub: `${fit} spots fit · we'll ping you when one's close.`, action: 'Drop me in the zone' }
  }[mode];

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: 'var(--map-land)' }}>
      <MapCanvas mode={mode} spots={spots} selected={selected} onSelect={setSelected} alt={alt} wander={wander} />

      <div style={{ position: 'absolute', top: 6, left: 16, right: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <Label style={{ whiteSpace: 'nowrap' }}>익선동 · Ikseon-dong</Label>
            <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 21, color: 'var(--ink)', marginTop: 2 }}>Area of interest</div>
          </div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: t.radiusPill, border: '1px solid var(--line)', boxShadow: 'var(--shadow)', padding: 4 }}>
          <Segmented dense items={MAP_MODES} value={mode} onChange={(m) => {setMode(m);setDropped(false);}} />
        </div>
      </div>

      <Legend mode={mode} />

      {/* wander style switcher (top-right, only in Wander) */}
      {mode === 'background' &&
      <div style={{ position: 'absolute', top: 120, right: 16, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: t.radiusPill, boxShadow: 'var(--shadow)', padding: 3, display: 'flex', gap: 2 }}>
          {WANDER_STYLES.map((w) => {
          const on = w.id === wander;
          return (
            <button key={w.id} onClick={() => setWander(w.id)} style={{ border: 'none', cursor: 'pointer', borderRadius: t.radiusPill,
              padding: '6px 10px', fontSize: 11, fontWeight: 700, fontFamily: t.fontUI,
              background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-soft)', transition: 'background .15s' }}>{w.name}</button>);

        })}
        </div>
      }

      {sel &&
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 250, background: 'var(--ink)', color: 'var(--paper)',
        borderRadius: t.radiusSm, boxShadow: 'var(--shadow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{sel.name}</div>
            <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 1 }}>{sel.why}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.round(sel.match * 100)}</div>
            <div style={{ fontSize: 9.5, opacity: 0.6, letterSpacing: '0.1em' }}>MATCH</div>
          </div>
        </div>
      }

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--card)',
        borderTopLeftRadius: t.radius + 4, borderTopRightRadius: t.radius + 4, borderTop: '1px solid var(--line)',
        boxShadow: '0 -18px 50px -28px rgba(0,0,0,0.5)', padding: '12px 20px 30px' }}>
        <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--line-strong)', margin: '0 auto 14px' }} />
        <Label>{sheet.title}</Label>
        <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 20, color: 'var(--ink)', margin: '5px 0 3px', lineHeight: 1.12 }}>{sheet.big}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14 }}>{sheet.sub}</div>

        {mode === 'modify' &&
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {Object.entries(ALT_ROUTES).map(([k, r]) => {
            const on = k === alt;
            return (
              <button key={k} onClick={() => setAlt(k)} style={{ flex: 1, textAlign: 'left', cursor: 'pointer',
                borderRadius: t.radiusSm, padding: '10px 12px', border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                background: on ? 'var(--accent-soft)' : 'var(--card)', transition: 'border-color .15s, background .15s' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--ink-faint)', textTransform: 'uppercase', fontFamily: t.fontMono }}>Route {k.toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--ink)', marginTop: 2 }}>{r.name}</div>
                </button>);
          })}
          </div>
        }

        <PrimaryBtn onClick={() => setDropped((d) => !d)}>{dropped && mode === 'background' ? '✓ You\u2019re in the zone — wander freely' : sheet.action}</PrimaryBtn>
      </div>
    </div>);
}

Object.assign(window, { MapScreen });
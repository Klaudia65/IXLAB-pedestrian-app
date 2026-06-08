/* ============================================================
   2B — AREA OF INTEREST · DETAILED MAP   (alternative design)
   A more cartographic take: parcel/building blocks, a labelled
   street network, river + park, a compass and scale bar, and
   teardrop POI pins with match scores. Keeps the white "famous
   local path" + yellow "recommended path" from screen 2.
   ============================================================ */

const YOU2 = [50, 70];

// ---- small geometry helpers (self-contained for this file's scope) ----
function dOpen(pts) {
  if (pts.length < 3) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i],next = pts[i + 1];
    d += ` Q ${cur[0]} ${cur[1]} ${(cur[0] + next[0]) / 2} ${(cur[1] + next[1]) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}
function dotsAlong(pts, step) {
  const out = [];let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i],[x2, y2] = pts[i + 1];
    const dx = x2 - x1,dy = y2 - y1,len = Math.hypot(dx, dy);
    let d = acc;
    while (d < len) {out.push([x1 + dx * d / len, y1 + dy * d / len]);d += step;}
    acc = d - len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// river left edge at a given y; everything to the right is water
const riverEdge = (y) => 85 + 5 * Math.sin((y - 8) / 20);
const inRiver = (x, y) => x > riverEdge(y) - 1;
const inPark = (x, y) => Math.pow((x - 15) / 18, 2) + Math.pow((y - 18) / 15, 2) < 1;

// deterministic parcel/building blocks
function buildBlocks() {
  let s = 11;const rnd = () => {s = (s * 9301 + 49297) % 233280;return s / 233280;};
  const out = [];
  for (let gy = 5; gy < 95; gy += 7.4) {
    for (let gx = 4; gx < 92; gx += 6.6) {
      const x = gx + (rnd() - 0.5) * 1.4;
      const y = gy + (rnd() - 0.5) * 1.4;
      const w = 4.4 + rnd() * 1.6,h = 4.0 + rnd() * 1.4;
      const cx = x + w / 2,cy = y + h / 2;
      if (inRiver(cx, cy) || inPark(cx, cy)) continue;
      if (rnd() < 0.12) continue; // courtyards / gaps
      out.push({ x, y, w, h, tone: rnd() < 0.4 ? 1 : 0, r: rnd() < 0.3 ? 0.8 : 0.4 });
    }
  }
  return out;
}

// street network (smooth-ish polylines in viewport %)
const ST_MAJOR = [
[[0, 29], [22, 27], [48, 31], [72, 28], [100, 30]], // 율곡로
[[0, 63], [24, 65], [50, 61], [74, 64], [100, 62]], // 수표로
[[31, 0], [29, 26], [33, 52], [30, 78], [32, 100]], // 돈화문로
[[67, 0], [65, 24], [69, 50], [66, 76], [68, 100]] // 창경궁로
];
const ST_MINOR = [
[[0, 16], [50, 15], [100, 17]], [[0, 45], [50, 47], [85, 45]],
[[0, 79], [50, 81], [100, 80]], [[0, 91], [50, 92], [84, 91]],
[[16, 0], [15, 50], [17, 100]], [[48, 0], [50, 50], [49, 100]],
[[82, 0], [83, 40], [84, 64]], [[8, 0], [9, 50], [8, 95]],
[[40, 12], [44, 50], [41, 88]], [[58, 14], [56, 50], [59, 86]]];


const STREET_LABELS = [
{ t: '율곡로', x: 20, y: 26, rot: -3 },
{ t: '수표로', x: 18, y: 64, rot: -3 },
{ t: '돈화문로', x: 30, y: 44, rot: -86 },
{ t: '창경궁로', x: 68, y: 40, rot: -86 },
{ t: '서순라길', x: 41, y: 56, rot: -44 }];


function pinPath(x, y) {
  const r = 2.7,cy = y - 4.4;
  return `M ${x} ${y} C ${x - 2.1} ${y - 2.6}, ${x - r} ${cy + 1.1}, ${x - r} ${cy} A ${r} ${r} 0 1 1 ${x + r} ${cy} C ${x + r} ${cy + 1.1}, ${x + 2.1} ${y - 2.6}, ${x} ${y} Z`;
}

function DetailedMap({ spots, selected, onSelect }) {
  const t = React.useContext(ThemeCtx);
  const Z = MAP_ZONE;
  const blocks = React.useMemo(buildBlocks, []);
  const top = [...spots].sort((a, b) => b.match - a.match);
  const named = new Set(top.slice(0, 4).map((s) => s.id));

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
    style={{ position: 'absolute', inset: 0, width: '100%', height: "600px" }}>
      <defs>
        <radialGradient id="zoneGlow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'var(--zone)', stopOpacity: t.dark ? 0.5 : 0.2 }} />
          <stop offset="55%" style={{ stopColor: 'var(--zone)', stopOpacity: t.dark ? 0.26 : 0.1 }} />
          <stop offset="100%" style={{ stopColor: 'var(--zone)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {/* base land */}
      <rect x="0" y="0" width="100" height="100" style={{ fill: 'var(--map-land)' }} />

      {/* park */}
      <ellipse cx="15" cy="18" rx="18" ry="15" style={{ fill: 'var(--map-park)', opacity: t.dark ? 0.85 : 1 }} />
      <ellipse cx="15" cy="18" rx="18" ry="15" fill="none" strokeWidth="0.4" style={{ stroke: 'var(--good)', opacity: 0.4 }} />
      {[[8, 12], [20, 10], [12, 22], [22, 22], [6, 20], [16, 16]].map(([x, y], i) =>
      <circle key={i} cx={x} cy={y} r="1.5" style={{ fill: 'var(--good)', opacity: t.dark ? 0.4 : 0.32 }} />)}

      {/* river */}
      <path d={`M ${riverEdge(0)} 0 ${[...Array(11)].map((_, i) => `L ${riverEdge(i * 10)} ${i * 10}`).join(' ')} L 100 100 L 100 0 Z`}
      style={{ fill: 'var(--map-water)', opacity: t.dark ? 0.55 : 0.6 }} />
      <path d={`M ${riverEdge(0)} 0 ${[...Array(11)].map((_, i) => `L ${riverEdge(i * 10)} ${i * 10}`).join(' ')}`}
      fill="none" strokeWidth="0.5" style={{ stroke: 'var(--map-water)', opacity: 0.9 }} />

      {/* parcel / building blocks */}
      <g>
        {blocks.map((b, i) =>
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r}
        style={{ fill: b.tone ? 'var(--map-land-2)' : 'var(--card-2)', opacity: t.dark ? 0.5 : 0.75,
          stroke: 'var(--line)', strokeWidth: 0.18 }} />
        )}
      </g>

      {/* streets */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {ST_MINOR.map((p, i) => <path key={i} d={dOpen(p)} strokeWidth="1.1" style={{ stroke: 'var(--map-road)', opacity: t.dark ? 0.45 : 0.85 }} />)}
        {ST_MAJOR.map((p, i) => <path key={i} d={dOpen(p)} strokeWidth="2.8" style={{ stroke: 'var(--map-road)', opacity: t.dark ? 0.7 : 1 }} />)}
        {ST_MAJOR.map((p, i) => <path key={'c' + i} d={dOpen(p)} strokeWidth="0.4" strokeDasharray="1.6 1.6" style={{ stroke: t.dark ? 'rgba(255,255,255,0.25)' : 'rgba(120,110,90,0.4)' }} />)}
      </g>

      {/* street labels */}
      {STREET_LABELS.map((l, i) =>
      <text key={i} x={l.x} y={l.y} transform={`rotate(${l.rot} ${l.x} ${l.y})`} textAnchor="middle"
      style={{ fontFamily: t.fontMono, fontSize: 2.5, fontWeight: 600, letterSpacing: '0.04em',
        fill: 'var(--ink-soft)', opacity: 0.75, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 0.7 }}>{l.t}</text>)}

      {/* match-density zone glow */}
      <circle cx={Z.cx} cy={Z.cy} r={Z.r} fill="url(#zoneGlow2)" />

      {/* famous local path (white) + recommended path (yellow dots) */}
      <path d={dOpen(FAMOUS_PATH)} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ stroke: t.dark ? 'rgba(0,0,0,0.32)' : 'rgba(30,27,22,0.2)' }} />
      <path d={dOpen(FAMOUS_PATH)} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ stroke: '#FFFFFF', opacity: 0.97 }} />
      {dotsAlong(RECO_PATH, 3.4).map(([x, y], i) =>
      <circle key={i} cx={x} cy={y} r="0.95"
      style={{ fill: 'var(--a2)', stroke: t.dark ? 'rgba(0,0,0,0.35)' : 'rgba(30,27,22,0.18)', strokeWidth: '0.25px' }} />)}

      {/* POI teardrop pins */}
      {spots.map((s) => {
        const isSel = selected === s.id;
        const hi = s.match >= 0.7;
        const fill = hi ? 'var(--accent)' : 'var(--card)';
        const txt = hi ? 'var(--accent-ink)' : 'var(--ink-soft)';
        return (
          <g key={s.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(isSel ? null : s.id)}>
            {isSel && <path d={pinPath(s.x, s.y)} fill="none" strokeWidth="0.7" style={{ stroke: 'var(--accent)', transform: 'scale(1.18)', transformOrigin: `${s.x}px ${s.y}px` }} />}
            <ellipse cx={s.x} cy={s.y} rx="1.6" ry="0.5" style={{ fill: 'rgba(0,0,0,0.18)' }} />
            <path d={pinPath(s.x, s.y)} strokeWidth="0.5" style={{ fill, stroke: hi ? 'var(--card)' : 'var(--line-strong)' }} />
            <text x={s.x} y={s.y - 4.4} textAnchor="middle" dominantBaseline="central"
            style={{ fill: txt, fontSize: 2.5, fontWeight: 800, fontFamily: t.fontMono }}>{Math.round(s.match * 100)}</text>
            {named.has(s.id) &&
            <text x={s.x} y={s.y + 2.6} textAnchor="middle"
            style={{ fill: 'var(--ink)', fontSize: 2.4, fontWeight: 700, fontFamily: t.fontUI,
              paintOrder: 'stroke', stroke: 'var(--map-land)', strokeWidth: 0.8 }}>{s.name.split(' ')[0]}</text>}
          </g>);
      })}

      {/* user puck */}
      <circle cx={YOU2[0]} cy={YOU2[1]} r="4" className="you-pulse" style={{ fill: 'var(--accent)', opacity: 0.2 }} />
      <circle cx={YOU2[0]} cy={YOU2[1]} r="2.1" strokeWidth="0.7" style={{ fill: 'var(--accent)', stroke: t.dark ? '#fff' : 'var(--card)' }} />

      {/* compass rose (top-right) */}
      <g transform="translate(91 11)">
        <circle r="4.6" style={{ fill: 'var(--card)', stroke: 'var(--line)', strokeWidth: 0.4, opacity: 0.92 }} />
        <path d="M0 -3.4 L1.3 0 L0 -0.6 L-1.3 0 Z" style={{ fill: 'var(--warn)' }} />
        <path d="M0 3.4 L1.3 0 L0 0.6 L-1.3 0 Z" style={{ fill: 'var(--ink-soft)' }} />
        <text x="0" y="-5.3" textAnchor="middle" style={{ fill: 'var(--ink-soft)', fontSize: 2.4, fontWeight: 800, fontFamily: t.fontMono }}>N</text>
      </g>

      {/* scale bar (bottom-left) */}
      <g transform="translate(7 92)">
        <rect x="0" y="0" width="11" height="1.1" style={{ fill: 'var(--ink)', opacity: 0.7 }} />
        <rect x="0" y="0" width="5.5" height="1.1" style={{ fill: 'var(--card)', opacity: 0.9 }} />
        <rect x="0" y="-0.3" width="11" height="1.7" fill="none" style={{ stroke: 'var(--ink)', strokeWidth: 0.25, opacity: 0.6 }} />
        <text x="0" y="-1" style={{ fill: 'var(--ink-soft)', fontSize: 2.3, fontWeight: 700, fontFamily: t.fontMono, paintOrder: 'stroke', stroke: 'var(--map-land)', strokeWidth: 0.7 }}>200 m</text>
      </g>
    </svg>);
}

function Legend2() {
  const t = React.useContext(ThemeCtx);
  const rows = [
  ['famous', 'famous local path'],
  ['reco', 'recommended path'],
  ['pin', 'matched spot · score'],
  ['zone', 'denser glow = better match']];

  return (
    <div style={{ position: 'absolute', top: 118, left: 16, background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: t.radiusSm, padding: '9px 11px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 7, whiteSpace: 'nowrap', lineHeight: "1", textAlign: "left" }}>
      {rows.map(([k, label]) =>
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}>
          {k === 'famous' && <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" strokeWidth="4" strokeLinecap="round" style={{ stroke: t.dark ? 'rgba(0,0,0,0.30)' : 'rgba(30,27,22,0.28)' }} /><line x1="1" y1="4" x2="21" y2="4" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: '#FFFFFF' }} /></svg>}
          {k === 'reco' && <svg width="22" height="8">{[3, 8, 13, 18].map((cx) => <circle key={cx} cx={cx} cy="4" r="1.5" style={{ fill: 'var(--a2)' }} />)}</svg>}
          {k === 'pin' && <span style={{ width: 14, height: 14, borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)', background: 'var(--accent)' }} />}
          {k === 'zone' && <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle, var(--zone) 10%, transparent 72%)' }} />}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600 }}>{label}</span>
      </div>
      )}
    </div>);
}

function MapScreen2() {
  const t = React.useContext(ThemeCtx);
  const [selected, setSelected] = usePersist('map2.selected', null);
  const spots = MAP_SPOTS;
  const sel = spots.find((s) => s.id === selected);
  const top3 = [...spots].sort((a, b) => b.match - a.match).slice(0, 3);

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: 'var(--map-land)' }}>
      <DetailedMap spots={spots} selected={selected} onSelect={setSelected} />

      <div style={{ position: 'absolute', top: 6, left: 16, right: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <Label style={{ whiteSpace: 'nowrap' }}>익선동 · Ikseon-dong</Label>
            <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 21, color: 'var(--ink)', marginTop: 2 }}>Area of interest</div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            fontFamily: t.fontMono, color: 'var(--ink-soft)', background: 'var(--card)', border: '1px solid var(--line)',
            borderRadius: t.radiusPill, padding: '5px 10px', boxShadow: 'var(--shadow)' }}>Detailed</span>
        </div>
      </div>

      <Legend2 />

      {sel &&
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 232, background: 'var(--ink)', color: 'var(--paper)',
        borderRadius: t.radiusSm, boxShadow: 'var(--shadow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{sel.name}</div>
          <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 1 }}>{sel.why}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{Math.round(sel.match * 100)}</div>
          <div style={{ fontSize: 9.5, opacity: 0.6, letterSpacing: '0.1em' }}>MATCH</div>
        </div>
      </div>}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--card)',
        borderTopLeftRadius: t.radius + 4, borderTopRightRadius: t.radius + 4, borderTop: '1px solid var(--line)',
        boxShadow: '0 -18px 50px -28px rgba(0,0,0,0.5)', padding: '12px 20px 30px' }}>
        <div style={{ width: 38, height: 4, borderRadius: 999, background: 'var(--line-strong)', margin: '0 auto 14px' }} />
        <Label>Detailed view · the lanes around you</Label>
        <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 20, color: 'var(--ink)', margin: '5px 0 10px', lineHeight: 1.12 }}>Ikseon-dong &amp; the shrine walls</div>

        {/* mini ranked POI list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
          {top3.map((s, i) => {
            const on = s.id === selected;
            return (
              <button key={s.id} onClick={() => setSelected(on ? null : s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', width: '100%',
                border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)', background: on ? 'var(--accent-soft)' : 'var(--card)',
                borderRadius: t.radiusSm, padding: '9px 12px', transition: 'border-color .15s, background .15s' }}>
                <span style={{ fontFamily: t.fontMono, fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', width: 14 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)' }}>{s.why}</span>
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.match * 100)}</span>
              </button>);
          })}
        </div>

        <PrimaryBtn>Start exploring here</PrimaryBtn>
      </div>
    </div>);
}

Object.assign(window, { MapScreen2 });
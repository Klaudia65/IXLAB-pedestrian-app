/* ============================================================
   3B — GROUP PREFERENCE-MERGE
   Each shared axis as an overlap band, COMPUTED from every
   person's comfortable range. Three outcomes per axis:
     · common ground  — all three ranges intersect
     · needs a nudge   — two agree, one is the outlier; the app
                         proposes a meet-point and lets the group
                         nudge the outlier to reconcile
     · scattered       — nobody overlaps; fall back to the median
   Reconciliation is an ACTION here, not just a read-out.
   ============================================================ */

const GROUP_MEMBERS = ['you', 'min', 'jae'];

// Design-system palette (design_system/tokens/colors.css). This screen anchors
// its DATA-VIZ FILLS to the brand colours so they read identically in every
// prototype theme; surrounding text stays theme-driven for legibility.
const DS = {
  solo:    '#4456FF',  // cobalt — outing-solo
  couple:  '#8A5BFF',  // iris   — outing-couple
  friends: '#B84BFF',  // mauve  — outing-friends
  match:   '#C9FF46',  // lime   — preference match (natural common ground)
  safe:    '#A6FFE8',  // mint   — safe path (reconciled common ground)
  alert:   '#D238EB',  // orchid — alert / open conflict + meet-point
  ink:     '#143229',  // seaweed-900 — text on light DS fills
};

// each person carries an outing-personality hue (solo → couple → friends)
const GROUP_HUE = { you: DS.solo, min: DS.couple, jae: DS.friends };

// intersection of N [lo,hi] intervals, or null if they don't all overlap
function intersect(ints) {
  const lo = Math.max(...ints.map(r => r[0]));
  const hi = Math.min(...ints.map(r => r[1]));
  return lo < hi ? [lo, hi] : null;
}

// classify one axis given a set of ranges (possibly already nudged)
function mergeAxis(ranges, members) {
  const ints = members.map(id => ranges[id]);
  const all = intersect(ints);
  if (all) return { kind: 'common', band: all };

  // who, if they bend, unlocks the widest agreement for everyone else?
  let best = null;
  members.forEach(o => {
    const band = intersect(members.filter(m => m !== o).map(m => ranges[m]));
    if (band && (!best || band[1] - band[0] > best.band[1] - best.band[0])) best = { outlier: o, band };
  });
  if (best) {
    const r = ranges[best.outlier];
    return { kind: 'nudge', band: best.band, outlier: best.outlier,
      meet: (best.band[0] + best.band[1]) / 2,            // middle of where the others agree
      side: r[0] > best.band[1] ? 'right' : 'left' };     // which way the outlier leans
  }

  // nobody overlaps anybody — meet at the median lean, bend the furthest person
  const sorted = members.map(id => ({ id, mid: (ranges[id][0] + ranges[id][1]) / 2 })).sort((a, b) => a.mid - b.mid);
  const meet = sorted[1].mid;
  const outlier = meet - sorted[0].mid >= sorted[2].mid - meet ? sorted[0].id : sorted[2].id;
  return { kind: 'scatter', band: [meet - 0.07, meet + 0.07], outlier, meet, side: ranges[outlier][0] > meet ? 'right' : 'left' };
}

// extend the outlier's range to reach the meet-point, then re-classify
function reconcile(axis, base, members) {
  const r = axis.ranges[base.outlier];
  const eff = { ...axis.ranges, [base.outlier]: [Math.min(r[0], base.meet), Math.max(r[1], base.meet)] };
  const view = mergeAxis(eff, members);
  return view.kind === 'common'
    ? { ranges: eff, band: view.band }
    : { ranges: eff, band: [base.meet - 0.06, base.meet + 0.06] }; // safety net for the scatter case
}

function AxisRow({ axis, nudged, onToggle }) {
  const t = React.useContext(ThemeCtx);
  const base = mergeAxis(axis.ranges, GROUP_MEMBERS);
  const conflict = base.kind !== 'common';
  const resolved = conflict && nudged;

  // ranges to draw (the outlier's bar grows to the meet-point once reconciled)
  const r = resolved ? reconcile(axis, base, GROUP_MEMBERS) : null;
  const drawRanges = resolved ? r.ranges : axis.ranges;
  const band = base.kind === 'common' ? base.band : resolved ? r.band : base.band;
  const outName = conflict ? PEOPLE[base.outlier].name : null;
  const leanWord = conflict ? (base.side === 'right' ? axis.right : axis.left) : null;

  // DS colours: natural common ground = lime, reconciled = mint, open conflict
  // shows the partial (2-of-3) match softly in lime with an orchid meet-point.
  const bandCol = !conflict ? DS.match : resolved ? DS.safe : `color-mix(in srgb, ${DS.match} 55%, transparent)`;
  const showOverlapLabel = !conflict && band[1] - band[0] >= 0.16;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{axis.left}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{axis.right}</span>
      </div>

      <div style={{ position: 'relative', height: 34 }}>
        {/* baseline */}
        <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 4, borderRadius: 999, background: 'var(--line)' }} />

        {/* individual ranges — one tinted bar per person */}
        {GROUP_MEMBERS.map((id, i) => {
          const rr = drawRanges[id];
          const isOut = conflict && id === base.outlier;
          return (
            <div key={id} style={{ position: 'absolute', top: 5 + i * 7, left: `${rr[0] * 100}%`, width: `${(rr[1] - rr[0]) * 100}%`,
              height: 4, borderRadius: 999, background: GROUP_HUE[id],
              opacity: isOut && !resolved ? 0.45 : 0.9,
              transition: 'left .5s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1), opacity .3s ease' }} />);
        })}

        {/* the agreement / reconciled band */}
        {band && band[1] > band[0] && (
          <div style={{ position: 'absolute', top: 9, left: `${band[0] * 100}%`, width: `${(band[1] - band[0]) * 100}%`, height: 16,
            borderRadius: 999, background: bandCol, boxShadow: `0 0 0 3px color-mix(in srgb, ${bandCol} 22%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            transition: 'left .5s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1), background .3s ease' }}>
            {showOverlapLabel && <span style={{ fontSize: 8.5, fontWeight: 800, color: DS.ink, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>OVERLAP</span>}
          </div>
        )}

        {/* suggested meet-point marker (only while the conflict is open) */}
        {conflict && !resolved && (
          <div style={{ position: 'absolute', top: 2, bottom: 2, left: `calc(${base.meet * 100}% - 1px)`, width: 2,
            background: DS.alert, borderRadius: 999 }}>
            <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: DS.alert, borderRadius: 2 }} />
          </div>
        )}
      </div>

      {/* reconciliation caption + action — only for conflict axes */}
      {conflict && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 7 }}>
          <span style={{ fontSize: 11.5, lineHeight: 1.35, color: resolved ? 'var(--good)' : 'var(--ink-soft)' }}>
            {resolved
              ? `${outName} met the group halfway`
              : <React.Fragment>No common ground — <b style={{ color: 'var(--ink)' }}>{outName}</b> leans {leanWord.toLowerCase()}</React.Fragment>}
          </span>
          <button onClick={() => onToggle(axis.id)}
            style={{ flex: '0 0 auto', cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontFamily: t.fontUI,
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all .2s ease',
              border: resolved ? '1.5px solid var(--line-strong)' : 'none',
              background: resolved ? 'transparent' : DS.alert,
              color: resolved ? 'var(--ink-soft)' : '#fff' }}>
            {resolved ? '✓ undo' : `Nudge ${outName} →`}
          </button>
        </div>
      )}
    </div>);
}

function GroupScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const members = GROUP_MEMBERS.map((id) => PEOPLE[id]);
  const [nudges, setNudges] = usePersist('group.nudges', {});
  const toggle = id => setNudges(n => ({ ...n, [id]: !n[id] }));

  // how many axes are settled vs still need reconciling?
  const conflicts = GROUP_AXES.filter(a => mergeAxis(a.ranges, GROUP_MEMBERS).kind !== 'common');
  const openCount = conflicts.filter(a => !nudges[a.id]).length;
  const allSettled = openCount === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Pre-walk · group merge</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 16px', color: 'var(--ink)' }}>Tonight's group</h1>

      {/* avatars + invite */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {members.map((p) =>
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar p={{ ...p, hue: GROUP_HUE[p.id] }} size={46} />
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{p.name}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--line-strong)', background: 'transparent', color: 'var(--ink-faint)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 600 }}>invite</span>
        </div>
      </div>

      {/* merge status + overlap bands */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }}>
        <Label>Where your tastes overlap</Label>
        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap',
          color: allSettled ? DS.ink : '#fff',
          background: allSettled ? DS.safe : DS.alert }}>
          {allSettled ? 'All aligned ✓' : `${openCount} need${openCount === 1 ? 's' : ''} a nudge`}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, margin: '0 -2px', padding: '2px 2px 0' }}>
        {GROUP_AXES.map((a) => <AxisRow key={a.id} axis={a} nudged={!!nudges[a.id]} onToggle={toggle} />)}

        {/* legend of who's who + what the marker means */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 2 }}>
          {members.map((p) =>
          <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
              <span style={{ width: 14, height: 4, borderRadius: 999, background: GROUP_HUE[p.id] }} /> {p.name}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', borderRadius: 2, background: DS.alert }} /> suggested meet-point
          </span>
        </div>
      </div>

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => go('map2')}>{allSettled ? 'Find our spot' : 'Find our spot anyway'}</PrimaryBtn>
      </div>
    </div>);
}

Object.assign(window, { GroupScreen });

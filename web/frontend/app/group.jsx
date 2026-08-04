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

// A person's taste is a single POINT per axis; to reuse the comfort-band overlap
// logic we give each point a tolerance band of this half-width in slider space.
const BAND = 0.14;
// Person hues (me = cobalt; friends cycle through the rest). DS.match/safe are
// reserved for the overlap bands, so they're not used as person colours.
const FRIEND_HUES = ['#8A5BFF', '#B84BFF', '#F59E0B', '#0EA5E9', '#EC4899', '#14B8A6'];

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

// up to two uppercase initials from a display name, for the avatar disc
function grpInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

// Build the walk's group (me + the friends toggled to join) and their per-axis
// comfort ranges from REAL taste vectors. A point v∈[-1,1] → band [s-BAND, s+BAND]
// in slider space (s=(v+1)/2); a MISSING axis → the full width [0,1] = neutral, so
// it never blocks common ground nor makes that person the outlier (never a reject).
// Returns { people:[{id,name,init,hue,vec}], memberIds, memberMap, axes }.
function buildGroupData() {
  const S = window.StudyAPI || {};
  const myName = (S.currentDisplayName && S.currentDisplayName()) || 'You';
  const friends = (window.activeJoiningFriends && window.activeJoiningFriends()) || [];
  const people = [
    { id: 'me', name: myName, init: grpInitials(myName), hue: DS.solo,
      vec: (window.readUserTasteVector && window.readUserTasteVector()) || {} },
    ...friends.map((f, i) => {
      const name = f.display_name || f.friend_code || 'friend';
      return { id: String(f.participant_id), name, init: grpInitials(name),
        hue: FRIEND_HUES[i % FRIEND_HUES.length], vec: f.profile || {} };
    }),
  ];
  const memberIds = people.map(p => p.id);
  const memberMap = Object.fromEntries(people.map(p => [p.id, p]));

  // the clean bipolar axes (green is handled specially elsewhere, and lacks two poles)
  const bipolar = (window.SWIPE_AXES || []).filter(a => a[0] !== 'park' && a[1] && a[2]);
  const axes = bipolar.map(([key, neg, pos]) => {
    const ranges = {};
    people.forEach(p => {
      const v = p.vec[key];
      if (v == null || isNaN(v)) { ranges[p.id] = [0, 1]; return; }   // no opinion → flexible
      const s = (Math.max(-1, Math.min(1, v)) + 1) / 2;
      ranges[p.id] = [Math.max(0, s - BAND), Math.min(1, s + BAND)];
    });
    return { id: key, left: neg, right: pos, ranges };
  });
  return { people, memberIds, memberMap, axes };
}

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

function AxisRow({ axis, memberIds, memberMap, nudged, onToggle }) {
  const t = React.useContext(ThemeCtx);
  const base = mergeAxis(axis.ranges, memberIds);
  const conflict = base.kind !== 'common';
  const resolved = conflict && nudged;

  // ranges to draw (the outlier's bar grows to the meet-point once reconciled)
  const r = resolved ? reconcile(axis, base, memberIds) : null;
  const drawRanges = resolved ? r.ranges : axis.ranges;
  const band = base.kind === 'common' ? base.band : resolved ? r.band : base.band;
  const outName = conflict ? memberMap[base.outlier].name : null;
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
        {memberIds.map((id, i) => {
          const rr = drawRanges[id];
          const isOut = conflict && id === base.outlier;
          return (
            <div key={id} style={{ position: 'absolute', top: 5 + i * 7, left: `${rr[0] * 100}%`, width: `${(rr[1] - rr[0]) * 100}%`,
              height: 4, borderRadius: 999, background: memberMap[id].hue,
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
  // Real group: me + the friends toggled to join, rebuilt live as friends change.
  const [data, setData] = React.useState(buildGroupData);
  React.useEffect(() => {
    const on = () => setData(buildGroupData());
    window.addEventListener('seoulwalk:friends', on);
    return () => window.removeEventListener('seoulwalk:friends', on);
  }, []);
  const { people, memberIds, memberMap, axes } = data;
  const [nudges, setNudges] = usePersist('group.nudges', {});
  const toggle = id => setNudges(n => ({ ...n, [id]: !n[id] }));

  const soloOnly = people.length <= 1;   // just me — nobody toggled to join yet
  // how many axes are settled vs still need reconciling?
  const conflicts = soloOnly ? [] : axes.filter(a => mergeAxis(a.ranges, memberIds).kind !== 'common');
  const openCount = conflicts.filter(a => !nudges[a.id]).length;
  const allSettled = openCount === 0;

  // Real streets ranked for the blended group taste (same recommender as the map).
  const groupVec = React.useMemo(
    () => (window.mergeTasteVectors ? window.mergeTasteVectors(people.map(p => p.vec)) : {}), [data]);
  const recs = useRecommendations(groupVec, 6);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Pre-walk · group merge</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 16px', color: 'var(--ink)' }}>Tonight's group</h1>

      {/* avatars + invite */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {people.map((p) =>
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar p={p} size={46} />
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{p.name}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button onClick={() => go('profile')} title="Pick who's coming from your profile"
            style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--line-strong)', background: 'transparent', color: 'var(--ink-faint)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 600 }}>invite</span>
        </div>
      </div>

      {soloOnly ? (
        /* nobody toggled to join → send them to the profile to pick the crew */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 24 }}>
          <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 22, color: 'var(--ink)' }}>No one on the walk yet</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 260 }}>
            Add friends by code, then toggle who's coming — this screen blends everyone's taste and shows where you all agree.
          </div>
          <button onClick={() => go('profile')} style={{ border: 'none', background: DS.solo, color: '#fff', borderRadius: 999, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: t.fontUI }}>Pick who's coming →</button>
        </div>
      ) : (
        <React.Fragment>
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
            {axes.map((a) => <AxisRow key={a.id} axis={a} memberIds={memberIds} memberMap={memberMap} nudged={!!nudges[a.id]} onToggle={toggle} />)}

            {/* legend of who's who + what the marker means */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 2 }}>
              {people.map((p) =>
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                  <span style={{ width: 14, height: 4, borderRadius: 999, background: p.hue }} /> {p.name}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', borderRadius: 2, background: DS.alert }} /> suggested meet-point
              </span>
            </div>

            {/* streets ranked for the blended group taste */}
            <div style={{ paddingTop: 6 }}>
              <Label style={{ marginBottom: 10 }}>Streets for the group</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recs.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Finding streets…</div>
                ) : recs.map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                    background: i === 0 ? 'var(--card-2)' : 'var(--card)', border: '1px solid var(--line)', borderRadius: t.radiusSm }}>
                    <div style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', width: 16, flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</div>
                    </div>
                    <div style={{ width: 46, height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', flex: '0 0 auto' }}>
                      <div style={{ width: `${Math.round((s.score || 0) * 100)}%`, height: '100%', background: DS.solo, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ paddingTop: 14 }}>
            <PrimaryBtn onClick={() => go('map2')}>{allSettled ? 'Find our spot' : 'Find our spot anyway'}</PrimaryBtn>
          </div>
        </React.Fragment>
      )}
    </div>);
}

Object.assign(window, { GroupScreen });

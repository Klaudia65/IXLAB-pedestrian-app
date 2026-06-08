/* ============================================================
   3B — GROUP PREFERENCE-MERGE
   Each shared axis as an overlap band: where the group's tastes
   intersect vs each person's range. Common ground + conflicts.
   ============================================================ */

const GROUP_MEMBERS = ['you', 'min', 'jae'];
// distinct, theme-safe hues so each person's line is easy to tell apart
const GROUP_HUE = { you: 'var(--accent)', min: 'var(--a1)', jae: 'var(--a4)' };

function OverlapAxis({ axis }) {
  const t = React.useContext(ThemeCtx);
  const ov = axis.overlap;
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
          const r = axis.ranges[id];
          return (
            <div key={id} style={{ position: 'absolute', top: 5 + i * 7, left: `${r[0] * 100}%`, width: `${(r[1] - r[0]) * 100}%`,
              height: 4, borderRadius: 999, background: GROUP_HUE[id], opacity: 0.9 }} />);

        })}
        {/* overlap band */}
        <div style={{ position: 'absolute', top: 9, left: `${ov[0] * 100}%`, width: `${(ov[1] - ov[0]) * 100}%`, height: 16,
          borderRadius: 999, background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {ov[1] - ov[0] >= 0.16 && <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--accent-ink)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>OVERLAP</span>}
        </div>
      </div>
    </div>);

}

function GroupScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const members = GROUP_MEMBERS.map((id) => PEOPLE[id]);

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

      {/* overlap bands */}
      <div style={{ marginTop: 22, marginBottom: 12 }}><Label>Where your tastes overlap</Label></div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, margin: '0 -2px', padding: '2px 2px 0' }}>
        {GROUP_AXES.map((a) => <OverlapAxis key={a.id} axis={a} />)}

        {/* legend of who's who */}
        <div style={{ display: 'flex', gap: 14, paddingTop: 2 }}>
          {members.map((p) =>
          <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
              <span style={{ width: 14, height: 4, borderRadius: 999, background: GROUP_HUE[p.id] }} /> {p.name}
            </span>
          )}
        </div>
      </div>

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => go('map')}>Find our spot</PrimaryBtn>
      </div>
    </div>);

}

Object.assign(window, { GroupScreen });
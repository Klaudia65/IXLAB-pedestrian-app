/* ============================================================
   3C — GROUP MERGE · OPEN VOCABULARY  (second version of 3B)
   Instead of merging slider ranges, this merges the free WORDS
   each person typed in step 3. Words everyone said become the
   group's "common ground"; size + dots show who picked what.
   Designed to sit side-by-side with 3B for comparison.
   ============================================================ */

const GW_MEMBERS = ['you', 'min', 'jae'];
const GW_HUE = { you: 'var(--accent)', min: 'var(--a1)', jae: 'var(--a4)' };

// build [{ w, by:[ids], n }] sorted by how many people said it
function mergeWords() {
  const map = {};
  GW_MEMBERS.forEach((id) => {
    (GROUP_WORDS[id] || []).forEach((w) => {
      (map[w] = map[w] || []).push(id);
    });
  });
  return Object.entries(map)
    .map(([w, by]) => ({ w, by, n: by.length }))
    .sort((a, b) => b.n - a.n || a.w.localeCompare(b.w));
}

// little stack of per-person dots under a word
function PickerDots({ by }) {
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 3 }}>
      {GW_MEMBERS.filter((id) => by.includes(id)).map((id) =>
      <span key={id} style={{ width: 7, height: 7, borderRadius: '50%', background: GW_HUE[id] }} />
      )}
    </div>);

}

function MergedWord({ item }) {
  const t = React.useContext(ThemeCtx);
  const all = item.n === GW_MEMBERS.length;
  const fs = [0, 15, 21, 28][item.n] || 15;
  // shared words glow in the accent; one-person words stay quiet
  const aura = item.n >= 2 ? 'var(--accent)' : 'var(--ink-faint)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 8px', position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: fs * 4, height: fs * 2.6, borderRadius: '50%', zIndex: 0,
          background: `radial-gradient(circle, ${aura} 0%, transparent 68%)`,
          opacity: all ? (t.dark ? 0.6 : 0.5) : item.n === 2 ? 0.3 : (t.dark ? 0.28 : 0.2), filter: 'blur(7px)' }} />
        <span style={{ position: 'relative', fontFamily: t.fontUI, fontSize: fs, lineHeight: 1,
          fontWeight: all ? 800 : item.n === 2 ? 700 : 600,
          color: all ? 'var(--ink)' : 'var(--ink)', opacity: item.n === 1 ? 0.78 : 1 }}>{item.w}</span>
      </div>
      <PickerDots by={item.by} />
    </div>);

}

function GroupWordsScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const members = GW_MEMBERS.map((id) => PEOPLE[id]);
  const merged = mergeWords();
  const common = merged.filter((m) => m.n === GW_MEMBERS.length);
  const rest = merged.filter((m) => m.n < GW_MEMBERS.length);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Pre-walk · group merge · words</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 16px', color: 'var(--ink)' }}>Tonight's words</h1>

      {/* avatars */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {members.map((p) =>
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar p={{ ...p, hue: GW_HUE[p.id] }} size={46} />
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{p.name}</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button style={{ width: 46, height: 46, borderRadius: '50%', border: '1.5px dashed var(--line-strong)', background: 'transparent', color: 'var(--ink-faint)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 600 }}>invite</span>
        </div>
      </div>

      {/* common ground callout */}
      <div style={{ marginTop: 20, marginBottom: 12 }}><Label>Everyone said</Label></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {common.map((m) =>
        <span key={m.w} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-ink)',
          borderRadius: t.radiusPill, padding: '8px 14px', fontSize: 15, fontWeight: 800 }}>
            {m.w}
            <span style={{ display: 'flex', gap: 3 }}>
              {m.by.map((id) => <span key={id} style={{ width: 7, height: 7, borderRadius: '50%', background: GW_HUE[id], boxShadow: '0 0 0 1.5px var(--accent)' }} />)}
            </span>
          </span>
        )}
        {common.length === 0 &&
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No word in common yet — see where you lean below.</span>}
      </div>

      {/* the rest of the merged cloud */}
      <div style={{ marginTop: 18, marginBottom: 4 }}><Label>Where your words lean</Label></div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap',
        alignContent: 'flex-start', justifyContent: 'center', columnGap: 2, rowGap: 8, padding: '6px 0' }}>
        {rest.map((m) => <MergedWord key={m.w} item={m} />)}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, paddingTop: 6, paddingBottom: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
        {members.map((p) =>
        <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: GW_HUE[p.id] }} /> {p.name}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'radial-gradient(circle, var(--accent) 10%, transparent 72%)' }} /> bigger = more shared
        </span>
      </div>

      <div style={{ paddingTop: 12 }}>
        <PrimaryBtn onClick={() => go('map')}>Find our spot</PrimaryBtn>
      </div>
    </div>);

}

Object.assign(window, { GroupWordsScreen });

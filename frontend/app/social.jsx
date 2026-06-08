/* ============================================================
   3A — SOCIAL SETTING (Solo / Couple / Group)
   One toggle re-weights every recommendation by who's present,
   with a "what changed" summary and a live re-ranking list.
   ============================================================ */

const SOCIAL_PEOPLE = { solo: ['you'], couple: ['you', 'sora'], group: ['you', 'min', 'jae'] };

function socialScore(spot, mode) {
  let m = spot.match;
  const w = spot.why;
  const has = k => w.includes(k);
  if (mode === 'solo') { if (has('quiet') || has('no crowds') || has('minimal') || has('tucked')) m += 0.12; if (has('lively') || has('young')) m -= 0.22; }
  if (mode === 'couple') { if (has('cosy') || has('leafy') || has('quiet') || has('historic')) m += 0.14; if (has('lively')) m -= 0.10; }
  if (mode === 'group') { if (has('lively') || has('open') || has('young') || has('riverside') || has('artsy')) m += 0.16; if (has('tucked') || has('minimal')) m -= 0.14; }
  return clamp(m, 0.05, 0.99);
}

function RankList({ mode }) {
  const t = React.useContext(ThemeCtx);
  const ranked = [...MAP_SPOTS].map(s => ({ ...s, sm: socialScore(s, mode) })).sort((a, b) => b.sm - a.sm).slice(0, 5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ranked.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
          background: i === 0 ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid var(--line)',
          borderRadius: t.radiusSm, transition: 'background .35s ease' }}>
          <div style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', width: 16, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{s.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{s.why}</div>
          </div>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', flex: '0 0 auto' }}>
            <div style={{ width: `${s.sm * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width .45s cubic-bezier(.22,1,.36,1)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SocialScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [mode, setMode] = usePersist('social.mode', 'couple');
  const data = SOCIAL[mode];
  const people = SOCIAL_PEOPLE[mode].map(id => PEOPLE[id]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Explore · who's with you</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 14px', color: 'var(--ink)' }}>Re-weight by company</h1>

      <Segmented items={[{ id: 'solo', name: 'Solo' }, { id: 'couple', name: 'Couple' }, { id: 'group', name: 'Group' }]} value={mode} onChange={setMode} />

      {/* participants */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {people.map((p, i) => <div key={p.id} style={{ marginLeft: i ? -10 : 0 }}><Avatar p={p} size={40} /></div>)}
          <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, marginLeft: 12 }}>{people.map(p => p.name).join(' · ')}</span>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '6px 11px', whiteSpace: 'nowrap' }}>{data.blurb}</span>
      </div>

      {/* what changed */}
      <div style={{ marginTop: 12, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: t.radiusSm, padding: '13px 15px' }}>
        <Label style={{ marginBottom: 9 }}>What changed</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.changes.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: c.k === '+' ? 'color-mix(in srgb, var(--good) 20%, transparent)' : 'var(--card-2)',
                color: c.k === '+' ? 'var(--good)' : 'var(--ink-faint)' }}>{c.k}</span>
              <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.35 }}>{c.t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* re-ranked list */}
      <div style={{ marginTop: 16, marginBottom: 8 }}><Label>Ranked for {mode === 'solo' ? 'you' : 'you all'}, right now</Label></div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '0 -2px', padding: '0 2px' }}>
        <RankList mode={mode} />
      </div>

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => (mode === 'group' ? go('group') : go('map'))}>
          {mode === 'solo' ? 'Explore solo' : mode === 'couple' ? 'Explore as a couple' : 'Merge our group →'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { SocialScreen });

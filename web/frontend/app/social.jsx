/* ============================================================
   3A — SOCIAL SETTING (who's with you)
   Real company: YOU + the friends toggled to join the walk. Shows the blended
   group taste and, concretely, how adding these friends SHIFTS your solo taste —
   i.e. what the map will re-weight. All computed from real profile vectors
   (readUserTasteVector + activeJoiningFriends + mergeTasteVectors); the actual
   ranked streets live on the map, so this screen stays about the people + taste.
   ============================================================ */

// person hues (me = cobalt; friends cycle the rest)
const SOCIAL_HUES = ['#8A5BFF', '#B84BFF', '#F59E0B', '#0EA5E9', '#EC4899', '#14B8A6'];
function socInitials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}

// How adding the group shifts each axis vs walking solo. A missing solo axis is
// treated as 0 (no prior opinion), so a friend introducing a taste still shows as
// a change. Returns ordered [{ key, label, delta }] for the meaningful shifts.
function tasteShifts(solo, group) {
  const out = [];
  (window.SWIPE_AXES || []).forEach(([k, neg, pos]) => {
    if (group[k] == null) return;
    const d = group[k] - (solo[k] || 0);
    if (Math.abs(d) < 0.15) return;               // ignore negligible drift
    out.push({ key: k, label: d > 0 ? pos : neg, delta: d });
  });
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}

function SocialScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [withFriends, setWithFriends] = usePersist('social.withFriends', true);
  // rebuild when the friends list / joining set changes
  const [, bump] = React.useState(0);
  React.useEffect(() => {
    const on = () => bump(x => x + 1);
    window.addEventListener('seoulwalk:friends', on);
    return () => window.removeEventListener('seoulwalk:friends', on);
  }, []);

  const myName = (window.StudyAPI && window.StudyAPI.currentDisplayName && window.StudyAPI.currentDisplayName()) || 'You';
  const solo = (window.readUserTasteVector && window.readUserTasteVector()) || {};
  const joining = (window.activeJoiningFriends && window.activeJoiningFriends()) || [];
  const active = withFriends ? joining : [];

  const people = [{ id: 'me', name: myName, init: socInitials(myName), hue: '#4456FF' }].concat(
    active.map((f, i) => {
      const n = f.display_name || f.friend_code || 'friend';
      return { id: String(f.participant_id), name: n, init: socInitials(n), hue: SOCIAL_HUES[i % SOCIAL_HUES.length] };
    })
  );

  // The group's taste comes from the SAME negotiated target the group screen and the
  // map use (theme.jsx groupTarget) — not a separate average — so the three screens
  // can't recommend different streets for the same company.
  const group = (window.groupTarget && active.length) ? window.groupTarget().target : solo;
  const chips = (window.groupTasteChips && active.length) ? window.groupTasteChips(group, 4) : [];
  const shifts = active.length ? tasteShifts(solo, group) : [];
  const noFriends = withFriends && joining.length === 0;
  // Real streets ranked for the current company (group blend, or just me).
  const recs = useRecommendations(active.length ? group : solo, 6);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Explore · who's with you</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 14px', color: 'var(--ink)' }}>Who's with you</h1>

      <Segmented items={[{ id: 'solo', name: 'Just me' }, { id: 'friends', name: 'With friends' }]}
        value={withFriends ? 'friends' : 'solo'} onChange={id => setWithFriends(id === 'friends')} />

      {/* participants */}
      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 6px' }}>
        {people.map((p, i) => <div key={p.id} style={{ marginLeft: i ? -10 : 0 }}><Avatar p={p} size={40} /></div>)}
        <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, marginLeft: 12 }}>
          {people.map(p => p.name).join(' · ')}
        </span>
      </div>

      {noFriends ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 24 }}>
          <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 21, color: 'var(--ink)' }}>No friends on the walk yet</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 260 }}>
            Add friends by code and toggle who's coming — then you'll see spots picked for your blended taste.
          </div>
          <button onClick={() => go('profile')} style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 999, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: t.fontUI }}>Pick who's coming →</button>
        </div>
      ) : (
        <React.Fragment>
          {/* blended taste + how it shifts from solo (compact), or a solo note */}
          {active.length > 0 ? (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginRight: 2 }}>Blend</span>
              {chips.map(c => (
                <span key={c.key} style={{ fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase',
                  fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '4px 9px' }}>{c.label}</span>
              ))}
              {shifts.slice(0, 3).map(s => (
                <span key={'d' + s.key} title={`Adding friends leans this walk more ${s.label}`}
                  style={{ fontFamily: t.fontUI, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 9px' }}>↗ {s.label}</span>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
              Walking solo — tuned only to your taste. Flip to <b style={{ color: 'var(--ink)' }}>With friends</b> to blend in whoever's coming.
            </div>
          )}

          {/* the real payoff — streets ranked for this exact company */}
          <div style={{ marginTop: 14, marginBottom: 8 }}>
            <Label>{active.length ? 'Streets picked for you all' : 'Streets picked for you'}</Label>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, margin: '0 -2px', padding: '0 2px' }}>
            {recs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '4px 2px' }}>Finding streets…</div>
            ) : recs.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                background: i === 0 ? 'var(--accent-soft)' : 'var(--card)', border: '1px solid var(--line)', borderRadius: t.radiusSm }}>
                <div style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)', width: 16, flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</div>
                </div>
                <div style={{ width: 46, height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', flex: '0 0 auto' }}>
                  <div style={{ width: `${Math.round((s.score || 0) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </React.Fragment>
      )}

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => go('map2')}>
          {active.length ? 'See our picks on the map' : 'Explore solo'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { SocialScreen });

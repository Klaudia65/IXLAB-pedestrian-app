/* ============================================================
   4 — PROFILE
   Re-implementation of the "Profile" design export (Wander DS) as a
   native React screen. Reproduces the design with the app's own tokens
   and shared atoms instead of the DC/<x-import> runtime.

   Faithful detail from the export: the accent shifts with the "outing"
   (solo = cobalt, couple = iris, friends = orchid). Here it's derived
   from how many friends are toggled on, so the glow tracks who's coming.
   ============================================================ */

// accent per outing, matching the export's accentFor()
const OUTING_ACCENT = { solo: '#4456FF', couple: '#8A5BFF', friends: '#B84BFF' };
function outingFor(friendCount) {
  return friendCount === 0 ? 'solo' : friendCount === 1 ? 'couple' : 'friends';
}

// Fallback preference chips, used only if the swipe hasn't produced a profile yet.
const PROFILE_PREFS = [
  { key: 'raw', label: 'raw' },
  { key: 'historic', label: 'historic' },
  { key: 'local', label: 'local' },
  { key: 'quiet', label: 'quiet' },
];

// Chips the swipe detected for this walker (written by commitSwipeProfile as
// profile.chips: ordered [{ key: axisKey, label, value }]). Null if not swiped yet.
function readSwipeChips() {
  try {
    const v = localStorage.getItem('seoulwalk.profile.chips');
    const a = v != null ? JSON.parse(v) : null;
    return Array.isArray(a) && a.length ? a.map(c => ({ key: c.key, label: c.label })) : null;
  } catch (e) { return null; }
}

// friends, with initials + a short relationship note
const PROFILE_FRIENDS = [
  { id: 'NOA', name: 'NOA', meta: '2 walks together' },
  { id: 'TEO', name: 'TEO', meta: 'New this week' },
  { id: 'SUMIN', name: 'SUMIN', meta: '5 walks together' },
];

// ---- soft radar-mist + grid background (replaces the DS RadarMist) ----
function ProfileBackdrop({ accent }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <div style={{ position: 'absolute', top: -40, left: -30, width: 320, height: 320,
        background: `radial-gradient(circle at 50% 50%, ${accent}33 0%, transparent 68%)` }} />
      <div style={{ position: 'absolute', top: 60, right: -70, width: 240, height: 240,
        background: 'radial-gradient(circle at 50% 50%, rgba(166,255,232,0.45) 0%, transparent 68%)' }} />
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(37,90,75,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(37,90,75,0.05) 1px, transparent 1px)',
        backgroundSize: '34px 34px' }} />
    </div>
  );
}

// ---- one preference chip (toggle) ----
function PrefChip({ label, on, accent, onClick }) {
  const t = React.useContext(ThemeCtx);
  return (
    <button onClick={onClick}
      style={{ padding: '9px 15px', cursor: 'pointer', borderRadius: t.radiusPill,
        fontFamily: t.fontMono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
        border: on ? `1.5px solid ${accent}` : '1.5px solid var(--line)',
        background: on ? 'color-mix(in srgb, ' + accent + ' 14%, transparent)' : 'var(--card)',
        color: on ? accent : 'var(--ink-faint)',
        transition: 'all .2s ease' }}>{label}</button>
  );
}

// ---- favorite-path mini map card ----
// Draws a saved street's REAL geometry (fav.points, normalised 0..100 by
// geomToThumb at save time) as a small thumbnail, with a remove toggle.
function PathCard({ fav, accent, onRemove }) {
  const t = React.useContext(ThemeCtx);
  const pts = fav.points || [];
  const start = pts[0];
  const end = pts[pts.length - 1];
  const line = pts.map(pt => pt.join(',')).join(' ');
  const isNature = fav.kind === 'nature';
  const stroke = isNature ? 'var(--good)' : accent;
  return (
    <div style={{ flex: 'none', width: 212, borderRadius: 18, background: 'var(--card)',
      border: '1px solid var(--line)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      {/* mini street map — real path shape */}
      <div style={{ position: 'relative', height: 118, background: 'var(--card-2)',
        backgroundImage: 'linear-gradient(rgba(37,90,75,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(37,90,75,0.06) 1px, transparent 1px)',
        backgroundSize: '26px 26px' }}>
        {pts.length > 1 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <polyline points={line} fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
            <polyline points={line} fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {/* start + end pucks */}
        {start && <div style={{ position: 'absolute', left: start[0] + '%', top: start[1] + '%', width: 9, height: 9,
          margin: '-4.5px 0 0 -4.5px', borderRadius: 999, background: '#FFFFFF', border: '2px solid var(--ink-soft)' }} />}
        {end && <div style={{ position: 'absolute', left: end[0] + '%', top: end[1] + '%', width: 11, height: 11,
          margin: '-5.5px 0 0 -5.5px', borderRadius: 999, background: stroke, border: '2px solid #FFFFFF',
          boxShadow: `0 0 12px ${stroke === 'var(--good)' ? 'rgba(52,195,143,0.55)' : accent + '8C'}` }} />}
        {/* name chip */}
        <div style={{ position: 'absolute', top: 10, left: 10, maxWidth: 150, padding: '6px 10px', borderRadius: 999,
          background: 'rgba(255,255,255,0.85)', border: '1px solid var(--line)',
          fontFamily: t.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fav.name}
        </div>
        {/* remove favorite */}
        <button onClick={onRemove} title="Remove from favorites"
          style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 999, border: 'none',
            background: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={accent} stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 5.5 5.4 5.4 0 0 1 21.6 12C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
      </div>
      {/* footer: the street's descriptor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 14px' }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.06em',
          color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fav.sub || (isNature ? 'nature walk' : 'saved street')}
        </span>
      </div>
    </div>
  );
}

// ---- one friend card (toggle in/out of the walk) ----
function FriendCard({ f, on, accent, onClick }) {
  const t = React.useContext(ThemeCtx);
  return (
    <button onClick={onClick}
      style={{ flex: 'none', width: 126, padding: '14px 12px 12px', borderRadius: 18,
        background: on ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
        border: on ? `2px solid ${accent}` : '2px solid var(--line)',
        boxShadow: on ? `0 0 20px ${accent}44` : 'var(--shadow)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
        transition: 'border-color .24s cubic-bezier(.22,1,.36,1), box-shadow .24s ease' }}>
      <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 999, background: 'var(--card-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: t.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-soft)' }}>{f.id}</span>
        <span style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 999,
          background: on ? accent : 'var(--line-strong)', border: '2px solid #FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0.45 }}><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      </div>
      <span style={{ fontFamily: t.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)' }}>{f.name}</span>
      <span style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', textAlign: 'center' }}>{f.meta}</span>
    </button>
  );
}

function ProfileScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  // Prefs come from the swipe when available (else the fallback set). A chip is ON
  // unless the user explicitly toggled it off, so newly detected chips show ON.
  const detectedPrefs = React.useMemo(() => readSwipeChips() || PROFILE_PREFS, []);
  const [prefs, setPrefs] = usePersist('profile.prefs', {});
  const [friends, setFriends] = usePersist('profile.friends', { NOA: true, TEO: false, SUMIN: true });
  const favorites = useFavorites();               // saved streets from the detailed map
  const pathsScroll = useDragScroll();
  const friendsScroll = useDragScroll();

  const isPrefOn = k => prefs[k] !== false;
  const prefCount = detectedPrefs.filter(p => isPrefOn(p.key)).length;
  const friendCount = Object.values(friends).filter(Boolean).length;
  const accent = OUTING_ACCENT[outingFor(friendCount)];
  const ctaMeta = friendCount === 0
    ? `Solo wander · ${prefCount} preferences`
    : `${friendCount} friend${friendCount > 1 ? 's' : ''} · ${prefCount} preferences`;

  const togglePref = k => setPrefs({ ...prefs, [k]: !isPrefOn(k) });
  const toggleFriend = k => setFriends({ ...friends, [k]: !friends[k] });

  const iconBtn = {
    width: 44, height: 44, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', background: 'transparent', border: '1px solid transparent',
  };

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ProfileBackdrop accent={accent} />

      {/* header */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 0' }}>
        <button onClick={() => go('map2')} style={{ ...iconBtn, background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
        </button>
        <Label>Profile</Label>
        <button style={iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      </div>

      {/* scrollable body */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 12 }}>

        {/* avatar + identity */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 20px 0' }}>
          <div style={{ position: 'relative', width: 104, height: 104, borderRadius: 999, background: 'var(--card)',
            border: `2px solid ${accent}`, boxShadow: `0 0 28px ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: t.fontMono, fontSize: 26, fontWeight: 700, letterSpacing: '0.08em', color: accent }}>CLEO</span>
            <span style={{ position: 'absolute', bottom: 4, right: 4, width: 22, height: 22, borderRadius: 999,
              background: 'var(--a2)', border: '2px solid var(--paper)' }} />
          </div>
          <Label style={{ color: 'var(--ink-faint)' }}>Jongno · 9 km walked</Label>
        </div>

        {/* add-friend actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 20px 4px' }}>
          <button style={{ width: 52, height: 44, borderRadius: t.radiusSm, cursor: 'pointer', background: 'var(--card)',
            border: '1.5px solid var(--line)', color: 'var(--ink)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>+</button>
          <button onClick={() => go('social')} style={{ flex: 1, maxWidth: 210, height: 44, borderRadius: t.radiusSm, cursor: 'pointer',
            background: accent, color: '#FFFFFF', border: 'none', fontFamily: t.fontUI, fontSize: 15, fontWeight: 700,
            boxShadow: `0 0 20px ${accent}44` }}>Add a friend profile</button>
        </div>

        <div style={{ height: 1, margin: '20px 20px 0', background: 'var(--line)' }} />

        {/* preferences */}
        <section style={{ padding: '22px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>Preferences</h2>
            <Label style={{ color: 'var(--ink-faint)' }}>{detectedPrefs.length} detected · {prefCount} on</Label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {detectedPrefs.map(p => (
              <PrefChip key={p.key} label={p.label} on={isPrefOn(p.key)} accent={accent} onClick={() => togglePref(p.key)} />
            ))}
          </div>
        </section>

        {/* favorite paths — the streets saved from the detailed map */}
        <section style={{ padding: '26px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0 20px', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>Favorite paths</h2>
            <Label style={{ color: 'var(--ink-faint)' }}>{favorites.length} saved</Label>
          </div>
          {favorites.length === 0 ? (
            <div style={{ margin: '0 20px', padding: '22px 18px', borderRadius: 18, border: '1.5px dashed var(--line-strong)',
              background: 'transparent', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 38, height: 38, flex: '0 0 auto', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 5.5 5.4 5.4 0 0 1 21.6 12C19.5 16.4 12 21 12 21z" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>No favorite paths yet</div>
                <button onClick={() => go('map2')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                  fontFamily: t.fontUI, fontSize: 12.5, fontWeight: 700, color: accent }}>Open the map and tap ♥ on a street →</button>
              </div>
            </div>
          ) : (
            <div ref={pathsScroll.ref} onPointerDown={pathsScroll.onPointerDown} onPointerMove={pathsScroll.onPointerMove}
              onPointerUp={pathsScroll.onPointerUp} onPointerCancel={pathsScroll.onPointerCancel}
              onClickCapture={pathsScroll.onClickCapture} onWheel={pathsScroll.onWheel}
              style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px 20px 6px', ...pathsScroll.style }}>
              {favorites.map(f => (
                <PathCard key={f.name} fav={f} accent={accent} onRemove={() => toggleFavorite(f)} />
              ))}
            </div>
          )}
        </section>

        {/* friends */}
        <section style={{ padding: '26px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0 20px', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>Friends</h2>
            <Label style={{ color: 'var(--ink-faint)' }}>{friendCount} joining</Label>
          </div>
          <div ref={friendsScroll.ref} onPointerDown={friendsScroll.onPointerDown} onPointerMove={friendsScroll.onPointerMove}
            onPointerUp={friendsScroll.onPointerUp} onPointerCancel={friendsScroll.onPointerCancel}
            onClickCapture={friendsScroll.onClickCapture} onWheel={friendsScroll.onWheel}
            style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 20px 6px', ...friendsScroll.style }}>
            {PROFILE_FRIENDS.map(f => (
              <FriendCard key={f.id} f={f} on={!!friends[f.id]} accent={accent} onClick={() => toggleFriend(f.id)} />
            ))}
          </div>
        </section>
      </div>

      {/* bottom CTA */}
      <div style={{ position: 'relative', zIndex: 1, padding: '14px 20px 22px', background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderTop: '1px solid rgba(255,255,255,0.5)',
        display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Label style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>{ctaMeta}</Label>
        <PrimaryBtn onClick={() => go('map2')} style={{ background: accent, boxShadow: `0 0 24px ${accent}66` }}>Start your exploration</PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { ProfileScreen });

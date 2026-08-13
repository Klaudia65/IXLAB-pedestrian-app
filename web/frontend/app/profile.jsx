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

// The declarable preference list: ONE entry per axis, keyed by axis, labelled by the
// pole this walker leans toward (from the onboarding, then any slider tuning). Keyed
// by axis on purpose — the old fallback list was keyed by pole label, so its toggles
// matched nothing downstream and turning a preference off changed nothing at all.
// Axes the onboarding never resolved still appear, so a level can be declared for
// them too. Strongest lean first, so what the walker actually cares about reads
// first. Uses the RAW vector: an axis set to "doesn't matter" must still show its
// label so it can be brought back.
function readProfileAxes() {
  const raw = (window.readTasteVectorRaw && window.readTasteVectorRaw()) || {};
  return (window.SWIPE_AXES || []).map(([key, neg, pos]) => {
    const v = raw[key];
    const lean = (v == null || isNaN(v)) ? 0 : v;
    const label = Math.abs(lean) >= 0.15 ? (lean > 0 ? pos : neg) : (pos || neg);
    return { key, label: label || key, lean };
  }).filter(a => a.label).sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean));
}

// What each declared level means to the walker, in their words rather than the
// mechanism's.
const LEVEL_COPY = {
  pref: { name: 'counts',         hint: 'tap to stop counting it' },
  off:  { name: "doesn't count",  hint: 'tap to count it again — you never block the group on it' },
};

// Up to two uppercase initials from a friend's display name, for their avatar disc.
function friendInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  const chars = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return chars.toUpperCase();
}

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

// ---- one preference chip (counts / doesn't count) ----
// The two states differ by fill AND by border style, not by colour alone, so a
// dropped preference still reads as dropped in greyscale.
function PrefChip({ label, level, accent, onClick }) {
  const t = React.useContext(ThemeCtx);
  const style = level === 'off'
    ? { border: '1.5px dashed var(--line-strong)', background: 'transparent', color: 'var(--ink-faint)' }
    : { border: `1.5px solid ${accent}`, background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent };
  return (
    <button onClick={onClick} title={LEVEL_COPY[level].name + ' — ' + LEVEL_COPY[level].hint}
      style={{ padding: '9px 15px', cursor: 'pointer', borderRadius: t.radiusPill,
        fontFamily: t.fontMono, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
        transition: 'all .2s ease', ...style }}>{label}</button>
  );
}

// ---- favorite-path mini map card ----
// Draws a saved street's REAL geometry (fav.points, normalised 0..100 by
// geomToThumb at save time) as a small thumbnail, with a remove toggle.
function PathCard({ fav, accent, onRemove, onToggleShare }) {
  const t = React.useContext(ThemeCtx);
  const pts = fav.points || [];
  const start = pts[0];
  const end = pts[pts.length - 1];
  const line = pts.map(pt => pt.join(',')).join(' ');
  const isNature = fav.kind === 'nature';
  const stroke = isNature ? 'var(--good)' : accent;
  const shared = !!fav.shared;
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
      {/* footer: the street's descriptor + a share-with-friends toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 14px' }}>
        <span style={{ minWidth: 0, fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.06em',
          color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {/* prefer the street's standout character over the raw match/coverage line */}
          {fav.traits || fav.sub || (isNature ? 'nature walk' : 'saved street')}
        </span>
        {/* explicit share: private until the walker pushes it to friends */}
        <button onClick={onToggleShare} title={shared ? 'Stop sharing with friends' : 'Share with friends'}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            border: shared ? 'none' : '1px solid var(--line-strong)',
            background: shared ? accent : 'transparent',
            color: shared ? '#FFFFFF' : 'var(--ink-soft)',
            borderRadius: 999, padding: '7px 12px', cursor: 'pointer', fontFamily: t.fontUI,
            fontSize: 12, fontWeight: 700, transition: 'background .2s ease, color .2s ease' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          </svg>
          {shared ? 'Shared with friends' : 'Share with friends'}
        </button>
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

// Read the current account's display label / handle from the study client, with
// safe fallbacks if telemetry is disabled or a session hasn't started.
function readAccount() {
  const S = window.StudyAPI || {};
  return {
    name: (S.currentDisplayName && S.currentDisplayName()) || 'You',
    handle: (S.currentCode && S.currentCode()) || null,
  };
}

function ProfileScreen({ go }) {
  const t = React.useContext(ThemeCtx);

  // --- account identity: editable display name + stable reconnect handle ---
  const [account, setAccount] = React.useState(readAccount);
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(account.name);

  function beginEdit() { setNameDraft(account.name); setEditingName(true); }
  function saveName() {
    const v = nameDraft.trim();
    setEditingName(false);
    if (!v || v === account.name) return;
    setAccount(a => ({ ...a, name: v }));
    if (window.StudyAPI && window.StudyAPI.renameDisplayName) window.StudyAPI.renameDisplayName(v);
  }
  // "Not me" / switch account: forget this device's session and return to the gate.
  function switchAccount() {
    if (window.StudyAPI && window.StudyAPI.resetSession) window.StudyAPI.resetSession();
    try { window.location.reload(); } catch (e) {}
  }
  // Avatar text: uppercased name, shrunk for longer labels so it always fits.
  const avatarText = (account.name || 'You').toUpperCase();
  const avatarFont = avatarText.length <= 4 ? 26 : avatarText.length <= 7 ? 20 : 15;

  // Preferences: one entry per axis with the level the walker declared for it. The
  // levels are NOT React-local state — they're persisted where the sliders screen and
  // the group negotiation read them (theme.jsx readAxisLevels / setAxisLevel), so this
  // screen holds a mirror it refreshes after each tap.
  const detectedPrefs = React.useMemo(() => readProfileAxes(), []);
  const [levels, setLevels] = React.useState(() => window.readAxisLevels());
  const favorites = useFavorites();               // saved streets from the detailed map
  const friendFavs = useFriendFavorites();        // streets my friends have shared with me
  const pathsScroll = useDragScroll();
  const friendsScroll = useDragScroll();
  const friendFavsScroll = useDragScroll();

  // Real friends from the cloud (each with their taste vector, for the later merge).
  // `joining` (persisted) tracks which of them come on THIS walk; a newly added
  // friend starts off so the walker opts them in deliberately.
  const [friendList, setFriendList] = React.useState(
    () => (window.StudyAPI && window.StudyAPI.myFriends && window.StudyAPI.myFriends()) || []);
  const [joining, setJoining] = usePersist('profile.friends', {});   // { participant_id: true }
  const myCode = (window.StudyAPI && window.StudyAPI.myFriendCode && window.StudyAPI.myFriendCode()) || null;
  const [codeInput, setCodeInput] = React.useState('');
  const [addErr, setAddErr] = React.useState('');
  const [addBusy, setAddBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Stay in sync with the app-wide friends poll: the event carries the fresh list
  // (whoever added whom), so a friend added on the other phone shows up here live.
  React.useEffect(() => {
    const onFriends = e => setFriendList((e.detail && e.detail.friends) || []);
    window.addEventListener('seoulwalk:friends', onFriends);
    if (window.StudyAPI && window.StudyAPI.refreshFriends) window.StudyAPI.refreshFriends();
    return () => window.removeEventListener('seoulwalk:friends', onFriends);
  }, []);

  async function submitAddFriend() {
    const code = codeInput.trim();
    if (!code || addBusy || !window.StudyAPI || !window.StudyAPI.addFriend) return;
    setAddBusy(true); setAddErr('');
    const res = await window.StudyAPI.addFriend(code);
    setAddBusy(false);
    if (res && res.ok) { setFriendList(res.friends); setCodeInput(''); }
    else setAddErr((res && res.error) || 'Could not add that friend');
  }
  function copyMyCode() {
    if (!myCode) return;
    try { navigator.clipboard.writeText(myCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e) {}
  }

  // Streets my friends have shared, collapsed to one card per street with the list
  // of friends who liked it (a street two friends both share reads "Liked by A, B").
  const friendFavGroups = React.useMemo(() => {
    const by = new Map();
    (friendFavs || []).forEach(fv => {
      const name = fv.street_name;
      if (!name) return;
      const who = fv.display_name || 'a friend';
      const g = by.get(name) || { name, who: [], ts: fv.ts };
      if (g.who.indexOf(who) < 0) g.who.push(who);
      if (fv.ts > g.ts) g.ts = fv.ts;
      by.set(name, g);
    });
    return Array.from(by.values()).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }, [friendFavs]);

  // Group taste for explainability: the strongest leans of the SAME negotiated target
  // the map ranks on ("what you all like"), so the promise here matches what arrives.
  // Empty when walking solo. Depends on `levels` too: dropping a preference changes
  // what the group leans toward.
  const groupChips = React.useMemo(() => {
    const active = friendList.filter(f => joining[f.participant_id]);
    if (!active.length || !window.groupTarget) return [];
    return window.groupTasteChips(window.groupTarget().target, 3);
  }, [friendList, joining, levels]);

  const levelOf = k => levels[k] || 'pref';
  const keptCount = detectedPrefs.filter(p => levelOf(p.key) !== 'off').length;
  const droppedCount = detectedPrefs.length - keptCount;
  const friendCount = friendList.filter(f => joining[f.participant_id]).length;
  const accent = OUTING_ACCENT[outingFor(friendCount)];
  const ctaMeta = friendCount === 0
    ? `Solo wander · ${keptCount} preferences`
    : `${friendCount} friend${friendCount > 1 ? 's' : ''} · ${keptCount} preferences`;

  // One tap walks down PREF_LEVELS and wraps. Writing goes through setAxisLevel so
  // the sliders screen and the group negotiation see it immediately.
  function cyclePref(k) {
    const order = window.PREF_LEVELS;
    const next = order[(order.indexOf(levelOf(k)) + 1) % order.length];
    window.setAxisLevel(k, next);
    setLevels(window.readAxisLevels());
    if (window.StudyAPI) window.StudyAPI.logEvent('pref_level', { axis: k, level: next });
  }
  const toggleFriend = pid => setJoining({ ...joining, [pid]: !joining[pid] });

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
        <button onClick={beginEdit} title="Rename" style={iconBtn}>
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
            <span style={{ fontFamily: t.fontMono, fontSize: avatarFont, fontWeight: 700, letterSpacing: '0.08em',
              color: accent, padding: '0 6px', textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.05 }}>{avatarText}</span>
            <span style={{ position: 'absolute', bottom: 4, right: 4, width: 22, height: 22, borderRadius: 999,
              background: 'var(--a2)', border: '2px solid var(--paper)' }} />
          </div>

          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus maxLength={40}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                placeholder="Your display name"
                style={{ width: 168, padding: '8px 11px', borderRadius: t.radiusSm || 10, border: `1.5px solid ${accent}`,
                  background: 'var(--card)', color: 'var(--ink)', fontFamily: t.fontUI, fontSize: 15, fontWeight: 700,
                  textAlign: 'center', outline: 'none' }} />
              <button onClick={saveName} title="Save" style={{ width: 36, height: 36, borderRadius: 999, border: 'none',
                background: accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </button>
            </div>
          ) : (
            <button onClick={beginEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{account.name}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          )}

          {/* reconnect handle + switch-account, the recovery affordance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {account.handle && (
              <span style={{ fontFamily: t.fontMono, fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink-faint)',
                background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 11px' }}
                title="Type this handle on any device to bring your account back">
                sign in as <b style={{ color: 'var(--ink-soft)' }}>{account.handle}</b>
              </span>
            )}
            <button onClick={switchAccount} title="Forget this account on this device"
              style={{ fontFamily: t.fontUI, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 4px', textDecoration: 'underline' }}>
              Not you? Switch
            </button>
          </div>
        </div>

        {/* connect friends: share my code + add someone by theirs */}
        <div style={{ padding: '16px 20px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* my shareable friend code */}
          {myCode && (
            <button onClick={copyMyCode} title="Copy your code to share"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: 44,
                borderRadius: t.radiusSm, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
              <span style={{ fontFamily: t.fontMono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Your code</span>
              <span style={{ fontFamily: t.fontMono, fontSize: 17, fontWeight: 700, letterSpacing: '0.22em', color: 'var(--ink)' }}>{myCode}</span>
              <span style={{ fontFamily: t.fontUI, fontSize: 11.5, fontWeight: 700, color: copied ? 'var(--good)' : accent }}>{copied ? 'Copied ✓' : 'Copy'}</span>
            </button>
          )}
          {/* add a friend by their code */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); if (addErr) setAddErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') submitAddFriend(); }}
              placeholder="Enter a friend's code" maxLength={12} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              style={{ flex: 1, minWidth: 0, height: 44, padding: '0 13px', borderRadius: t.radiusSm, border: '1.5px solid var(--line)',
                background: 'var(--card)', color: 'var(--ink)', fontFamily: t.fontMono, fontSize: 15, letterSpacing: '0.12em', outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={submitAddFriend} disabled={!codeInput.trim() || addBusy}
              style={{ flex: '0 0 auto', height: 44, padding: '0 18px', borderRadius: t.radiusSm, cursor: codeInput.trim() && !addBusy ? 'pointer' : 'default',
                background: codeInput.trim() && !addBusy ? accent : 'var(--line)', color: codeInput.trim() && !addBusy ? '#fff' : 'var(--ink-faint)',
                border: 'none', fontFamily: t.fontUI, fontSize: 14.5, fontWeight: 700 }}>{addBusy ? 'Adding…' : 'Add'}</button>
          </div>
          {addErr && <div style={{ fontSize: 12, color: 'var(--warn)', textAlign: 'center' }}>{addErr}</div>}
        </div>

        <div style={{ height: 1, margin: '20px 20px 0', background: 'var(--line)' }} />

        {/* preferences */}
        <section style={{ padding: '22px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>Preferences</h2>
            <Label style={{ color: 'var(--ink-faint)' }}>
              {keptCount} count{droppedCount ? ` · ${droppedCount} dropped` : ''}
            </Label>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
            From your onboarding. Tap one to drop it — a dropped preference stops shaping your walk.
            {friendCount > 0 && ' Walking together, only the ones that count get negotiated; on the others you never block the group.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {detectedPrefs.map(p => (
              <PrefChip key={p.key} label={p.label} level={levelOf(p.key)} accent={accent} onClick={() => cyclePref(p.key)} />
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
                <PathCard key={f.name} fav={f} accent={accent} onRemove={() => toggleFavorite(f)}
                  onToggleShare={() => setFavoriteShared(f.name, !f.shared)} />
              ))}
            </div>
          )}
        </section>

        {/* favorites shared BY friends — grouped by street, tagged with who liked it */}
        {friendFavGroups.length > 0 && (
          <section style={{ padding: '26px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0 20px', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>From friends</h2>
              <Label style={{ color: 'var(--ink-faint)' }}>{friendFavGroups.length} shared</Label>
            </div>
            <div ref={friendFavsScroll.ref} onPointerDown={friendFavsScroll.onPointerDown} onPointerMove={friendFavsScroll.onPointerMove}
              onPointerUp={friendFavsScroll.onPointerUp} onPointerCancel={friendFavsScroll.onPointerCancel}
              onClickCapture={friendFavsScroll.onClickCapture} onWheel={friendFavsScroll.onWheel}
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 4px' }}>
              {friendFavGroups.map(g => (
                <button key={g.name} onClick={() => go('map2')} title="See it on the map"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                    padding: '12px 14px', borderRadius: 16, background: 'var(--card)', border: '1px solid var(--line)',
                    boxShadow: 'var(--shadow)', cursor: 'pointer', fontFamily: t.fontUI }}>
                  <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 999, background: 'var(--accent-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 5.5 5.4 5.4 0 0 1 21.6 12C19.5 16.4 12 21 12 21z" /></svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Liked by {g.who.join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* friends */}
        <section style={{ padding: '26px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0 20px', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontFamily: t.fontHead, fontSize: 20, fontWeight: 500, color: 'var(--ink)' }}>Friends</h2>
            <Label style={{ color: 'var(--ink-faint)' }}>{friendCount} joining</Label>
          </div>
          {friendList.length === 0 ? (
            <div style={{ margin: '0 20px', padding: '18px', borderRadius: 18, border: '1.5px dashed var(--line-strong)',
              fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center', lineHeight: 1.5 }}>
              No friends yet. Share <b style={{ color: 'var(--ink)' }}>your code</b> above, or enter a friend's code to connect —
              then pick who joins this walk.
            </div>
          ) : (
            <div ref={friendsScroll.ref} onPointerDown={friendsScroll.onPointerDown} onPointerMove={friendsScroll.onPointerMove}
              onPointerUp={friendsScroll.onPointerUp} onPointerCancel={friendsScroll.onPointerCancel}
              onClickCapture={friendsScroll.onClickCapture} onWheel={friendsScroll.onWheel}
              style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 20px 6px', ...friendsScroll.style }}>
              {friendList.map(f => {
                const name = f.display_name || f.friend_code || 'friend';
                const card = { id: friendInitials(name), name: name, meta: f.friend_code || '' };
                return <FriendCard key={f.participant_id} f={card} on={!!joining[f.participant_id]} accent={accent}
                  onClick={() => toggleFriend(f.participant_id)} />;
              })}
            </div>
          )}

          {/* group taste — why the map will propose what it does, when friends join */}
          {groupChips.length > 0 && (
            <div style={{ margin: '14px 20px 0', padding: '13px 15px', borderRadius: 16,
              background: 'color-mix(in srgb, ' + accent + ' 8%, var(--card))', border: `1px solid ${accent}55` }}>
              <div style={{ fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--ink-faint)', marginBottom: 8 }}>Together you lean toward</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
                {groupChips.map(c => (
                  <span key={c.key} style={{ fontFamily: t.fontMono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontWeight: 700, color: accent, background: 'var(--card)', border: `1.5px solid ${accent}`,
                    borderRadius: 999, padding: '5px 11px' }}>{c.label}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                The map blends everyone's taste — it'll favour streets that are <b style={{ color: 'var(--ink)' }}>{groupChips.map(c => c.label).join(' + ')}</b>, what you all like.
              </div>
            </div>
          )}
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

/* ============================================================
   APP — routing, theme context, onboarding chrome, transitions
   ============================================================ */

// Swipe is now merged into the Landing screen, so the only remaining onboarding
// chrome (tab row + skip) would be for a single step — drop it. Landing → Sliders
// → Map is driven by each screen's own CTA plus the global burger / side dock.
const ONBOARDING = [];

function OnboardingChrome({ screen, go, children }) {
  const t = React.useContext(ThemeCtx);
  const tabs = [{ id: 'swipe', name: 'Swipe' }, { id: 'sliders', name: 'Sliders' }];
  return (
    <React.Fragment>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 4px' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {tabs.map(tab => {
            const on = tab.id === screen;
            return (
              <button key={tab.id} onClick={() => go(tab.id)} style={{ position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0', fontFamily: t.fontUI, fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? 'var(--ink)' : 'var(--ink-faint)' }}>
                {tab.name}
                {on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 2, background: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>
        <button onClick={() => go('map2')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: t.fontUI, fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>Skip to map ↦</button>
      </div>
      {children}
    </React.Fragment>
  );
}

// Study gate: before anything else, the participant types the code the
// researcher gave them and consents to being recorded. On submit we open a
// session (POST /sessions) and the app proceeds. Rendered INSIDE the DeviceFrame
// so it inherits the theme CSS variables.
function ConsentGate({ onDone }) {
  const t = React.useContext(ThemeCtx);
  const [code, setCode] = React.useState('');
  const [mode, setMode] = React.useState('solo');
  const [groupCode, setGroupCode] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const ready = code.trim() && consent && !busy;

  async function start() {
    if (!ready || !window.StudyAPI) return;
    setBusy(true); setErr('');
    // Normalise the handle so "Min" and "min" resolve to the same account.
    const res = await window.StudyAPI.startSession({
      code: code.trim().toLowerCase(), mode,
      groupCode: mode === 'friends' ? groupCode.trim() : null, consented: true,
    });
    setBusy(false);
    if (res && res.session_id) {
      // Returning account: bring the saved taste profile back before entering.
      if (res.is_returning && res.profile && window.rehydrateProfileFromVector) {
        window.rehydrateProfileFromVector(res.profile);
      }
      onDone();
    } else {
      setErr('Could not start the session. Check the connection and try again.');
    }
  }

  const field = { width: '100%', padding: '11px 13px', borderRadius: t.radiusSm || 10,
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
    fontFamily: t.fontUI, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
  const modeBtn = on => ({ flex: 1, padding: '9px 0', borderRadius: 999, cursor: 'pointer',
    border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'),
    background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--ink-soft)',
    fontFamily: t.fontUI, fontWeight: 700, fontSize: 13 });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '20px 24px', minHeight: 0, gap: 14 }}>
      <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: '-0.03em',
        fontSize: 27, lineHeight: 1.1, color: 'var(--ink)' }}>Welcome to the study</div>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0, lineHeight: 1.45 }}>
        Pick a short handle (e.g. <b>min</b>, <b>su</b>, <b>flo</b>). It's how you sign in — type
        the same one on any device to bring your account back. The app records your choices,
        searches and route for research only; no name or personal detail is stored.
      </p>

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>Your handle
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. min"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ ...field, marginTop: 6 }} />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setMode('solo')} style={modeBtn(mode === 'solo')}>Solo</button>
        <button onClick={() => setMode('friends')} style={modeBtn(mode === 'friends')}>With friends</button>
      </div>
      {mode === 'friends' && (
        <input value={groupCode} onChange={e => setGroupCode(e.target.value)}
          placeholder="Group code (optional)" style={field} />
      )}

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 2, width: 16, height: 16, flex: '0 0 auto' }} />
        <span>I agree that my activity in this app is recorded for research purposes.</span>
      </label>

      {err && <div style={{ fontSize: 12.5, color: '#c0392b' }}>{err}</div>}

      <button onClick={start} disabled={!ready}
        style={{ marginTop: 4, padding: '13px 0', borderRadius: t.radius || 14, border: 'none',
          background: ready ? 'var(--accent)' : 'var(--line)', color: ready ? 'var(--accent-ink)' : 'var(--ink-faint)',
          fontFamily: t.fontUI, fontWeight: 800, fontSize: 15, cursor: ready ? 'pointer' : 'default' }}>
        {busy ? 'Starting…' : 'Start'}
      </button>
    </div>
  );
}

// Global "someone added you" toasts. Listens for the app-wide friends poll's
// 'seoulwalk:friends' event and, for each newcomer in `added`, slides a pill up
// from the bottom of the phone for a few seconds. Rendered inside the DeviceFrame
// so it's themed and clipped to the screen, and shows on ANY screen.
function FriendToasts() {
  const t = React.useContext(ThemeCtx);
  const [toasts, setToasts] = React.useState([]);
  const seq = React.useRef(0);
  React.useEffect(() => {
    function onFriends(e) {
      const added = (e.detail && e.detail.added) || [];
      added.forEach(f => {
        const id = 'ft' + (seq.current++);
        const name = f.display_name || f.friend_code || 'A friend';
        setToasts(prev => [...prev, { id, name }]);
        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4800);
      });
    }
    window.addEventListener('seoulwalk:friends', onFriends);
    return () => window.removeEventListener('seoulwalk:friends', onFriends);
  }, []);
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, zIndex: 60, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 18px' }}>
      <style>{'@keyframes ftIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}'}</style>
      {toasts.map(ft => (
        <div key={ft.id} style={{ pointerEvents: 'auto', maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--ink)', color: 'var(--paper)', borderRadius: 999, padding: '11px 16px 11px 11px',
          boxShadow: '0 10px 34px rgba(0,0,0,0.30)', animation: 'ftIn .32s cubic-bezier(.22,1,.36,1)' }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, flex: '0 0 auto', background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontMono, fontSize: 11, fontWeight: 700 }}>
            {String(ft.name).replace(/\s+/g, '').slice(0, 2).toUpperCase()}
          </span>
          <span style={{ fontFamily: t.fontUI, fontSize: 13.5, fontWeight: 600 }}>
            <b>{ft.name}</b> added you as a friend
          </span>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [themeId, setThemeId] = usePersist('themeId', 'wander');
  const [screen, setScreen] = usePersist('screen', 'landing');
  const [sessionReady, setSessionReady] = React.useState(() => !!(window.StudyAPI && window.StudyAPI.hasSession()));
  const theme = THEMES[themeId] || THEMES.wander;
  const go = id => setScreen(id);

  // On a real phone the desktop "mockup + side dock" layout doesn't fit, so we
  // switch to a full-bleed mobile web app: the DeviceFrame fills the viewport,
  // the Dock is replaced by a top-bar burger + slide-in navigation drawer.
  const bare = useMediaQuery('(max-width: 760px)');
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Once a session exists, poll the friends list so a friend added on another
  // phone appears here (and pops a toast) without a manual refresh.
  React.useEffect(() => {
    if (!sessionReady || !window.StudyAPI || !window.StudyAPI.startFriendPolling) return;
    window.StudyAPI.startFriendPolling(10000);
    return () => { if (window.StudyAPI.stopFriendPolling) window.StudyAPI.stopFriendPolling(); };
  }, [sessionReady]);

  const screens = {
    landing: <LandingScreen go={go} />,
    curate: <CurateScreen go={go} />,
    sliders: <SlidersScreen go={go} />,
    map2: <RealMapScreen />,
    social: <SocialScreen go={go} />,
    group: <GroupScreen go={go} />,
    profile: <ProfileScreen go={go} />,
  };
  // guard against a stale persisted screen id (e.g. the removed 'swipe')
  const activeScreen = screens[screen] ? screen : 'landing';
  const isOnboard = ONBOARDING.includes(activeScreen);

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: bare ? 0 : 54, padding: bare ? 0 : 40, boxSizing: 'border-box',
        background: 'radial-gradient(120% 120% at 50% 0%, #F0FAFA 0%, #DFF1F1 68%, #CDE9E9 100%)' }}>
        {!bare && <Dock screen={activeScreen} setScreen={setScreen} themeId={themeId} setThemeId={setThemeId} />}
        <DeviceFrame theme={theme} bare={bare}>
          {bare ? <AppBar screen={activeScreen} onMenu={() => setDrawerOpen(true)} /> : <StatusBar />}
          <div key={(sessionReady ? activeScreen : 'gate') + themeId} className="screen-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {!sessionReady
              ? <ConsentGate onDone={() => setSessionReady(true)} />
              : isOnboard
                ? <OnboardingChrome screen={activeScreen} go={go}>{screens[activeScreen]}</OnboardingChrome>
                : screens[activeScreen]}
          </div>
          {bare && sessionReady && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} screen={activeScreen}
            go={(id) => { setScreen(id); setDrawerOpen(false); }} />}
          {sessionReady && <FriendToasts />}
        </DeviceFrame>
      </div>
    </ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

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

// Global social toasts. Listens for the app-wide friends poll and slides pills up
// from the bottom of the phone for a few seconds. Two kinds:
//   · 'add'    — someone entered your code ('seoulwalk:friends' → `added`).
//   · 'search' — a friend ON THIS WALK keeps searching the same category twice+
//                ('seoulwalk:friendsearch' → `searches`), a "want to go together?"
//                nudge. Gated to joining friends so it only fires when you're
//                actually out together.
// Rendered inside the DeviceFrame so it's themed, clipped, and shows on ANY screen.
function FriendToasts() {
  const t = React.useContext(ThemeCtx);
  const [toasts, setToasts] = React.useState([]);
  const seq = React.useRef(0);
  React.useEffect(() => {
    const push = (toast, ttl) => {
      const id = 'ft' + (seq.current++);
      setToasts(prev => [...prev, { id, ...toast }]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), ttl);
    };
    function onFriends(e) {
      const added = (e.detail && e.detail.added) || [];
      added.forEach(f => push({ kind: 'add', name: f.display_name || f.friend_code || 'A friend' }, 4800));
    }
    function onFriendSearch(e) {
      const searches = (e.detail && e.detail.searches) || [];
      // Only nudge for friends currently toggled onto this walk.
      const joining = (window.activeJoiningFriends && window.activeJoiningFriends()) || [];
      const withMe = new Set(joining.map(f => String(f.participant_id)));
      searches.forEach(s => {
        if (!withMe.has(String(s.participant_id))) return;
        push({ kind: 'search', name: s.display_name || 'A friend', query: s.query, count: s.count }, 6500);
      });
    }
    window.addEventListener('seoulwalk:friends', onFriends);
    window.addEventListener('seoulwalk:friendsearch', onFriendSearch);
    return () => {
      window.removeEventListener('seoulwalk:friends', onFriends);
      window.removeEventListener('seoulwalk:friendsearch', onFriendSearch);
    };
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
            {ft.kind === 'search' ? '🔎' : String(ft.name).replace(/\s+/g, '').slice(0, 2).toUpperCase()}
          </span>
          <span style={{ fontFamily: t.fontUI, fontSize: 13.5, fontWeight: 600 }}>
            {ft.kind === 'search'
              ? <span><b>{ft.name}</b> keeps looking for <b>{ft.query}</b> — go together?</span>
              : <span><b>{ft.name}</b> added you as a friend</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---- session-wide GPS -------------------------------------------------------
   The geolocation watch lives HERE, at App level, on purpose: only the active
   screen is mounted, so owning it in the map screen would punch a hole in the
   recorded trace every time the participant checks their profile mid-walk.
   Each fix is
     · published on window.SeoulGps + a 'seoulwalk:gps' event — the map screen's
       "you are here" puck and GPS badge listen to that, and
     · thinned and buffered into StudyAPI, flushed to /gps every 15 s.
   Needs a secure context: works on localhost and HTTPS, fails on plain http://
   (e.g. a LAN IP opened from a phone) — which is what the badge makes visible. */
const GPS_PAD = 0.003;        // ~300 m of margin around the pilot bbox
const GPS_MIN_MS = 5000;      // record a point every 5 s...
const GPS_MIN_M = 10;         // ...or every 10 m, whichever comes first
const GPS_FLUSH_MS = 15000;

function publishGps(status, fix) {
  window.SeoulGps = { status: status, fix: fix || null };
  try { window.dispatchEvent(new CustomEvent('seoulwalk:gps', { detail: window.SeoulGps })); } catch (e) {}
}
// Rough metres between two fixes — the same flat approximation used across the map
// code, ample at city scale.
function gpsMetres(a, b) {
  const dy = (b.lat - a.lat) * 111320;
  const dx = (b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}
// speed/heading are null when the device can't tell; some browsers hand back NaN
// or -1 instead, and the API would reject those.
function gpsNum(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
// Only fixes near the pilot zone are recorded. Outside it we are either testing
// from a desk or standing at the participant's home — neither belongs in the
// study database, and the consent covers the walk, not where they live.
function nearStudyZone(lng, lat) {
  return lng >= JONGNO_BBOX[0] - GPS_PAD && lng <= JONGNO_BBOX[2] + GPS_PAD
      && lat >= JONGNO_BBOX[1] - GPS_PAD && lat <= JONGNO_BBOX[3] + GPS_PAD;
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

  // GPS watch + trace upload for the whole session — see the notes above. Gated on
  // the session so the permission prompt lands after the consent screen, not before.
  React.useEffect(() => {
    if (!sessionReady) return;
    const S = window.StudyAPI;
    if (!navigator.geolocation) { publishGps('off', null); return; }
    let lastKept = null;             // last fix actually written to the buffer
    // enableHighAccuracy → the real GNSS rather than a Wi-Fi guess; it costs
    // battery, which is the right trade for a study session that needs a trace.
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const c = pos.coords;
        const fix = { lng: c.longitude, lat: c.latitude, acc: c.accuracy, ts: pos.timestamp };
        publishGps(inJongno(fix.lng, fix.lat) ? 'live' : 'outside', fix);
        if (!S || !S.logGps || !nearStudyZone(fix.lng, fix.lat)) return;
        // Thin the stream: watchPosition can fire several times per second, which
        // would mean tens of thousands of rows for one 40-minute walk. Accuracy is
        // NOT filtered — accuracy_m is stored so poor fixes can be dropped at
        // analysis time, whereas dropping them here loses them for good.
        if (lastKept && (fix.ts - lastKept.ts) < GPS_MIN_MS && gpsMetres(lastKept, fix) < GPS_MIN_M) return;
        lastKept = fix;
        S.logGps({
          ts: new Date(fix.ts).toISOString(), lat: fix.lat, lng: fix.lng,
          accuracy_m: gpsNum(fix.acc), speed: gpsNum(c.speed), heading: gpsNum(c.heading),
        });
      },
      err => { console.warn('[gps] ' + err.code + ' ' + err.message); publishGps('off', null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    const flush = () => { if (S && S.flushGps) S.flushGps(); };
    const timer = setInterval(flush, GPS_FLUSH_MS);
    // Backgrounding the app is when the tab is most likely to be frozen or killed,
    // so push whatever is buffered right then.
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
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

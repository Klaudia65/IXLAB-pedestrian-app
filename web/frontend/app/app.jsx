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

function App() {
  const [themeId, setThemeId] = usePersist('themeId', 'wander');
  const [screen, setScreen] = usePersist('screen', 'landing');
  const theme = THEMES[themeId] || THEMES.wander;
  const go = id => setScreen(id);

  // On a real phone the desktop "mockup + side dock" layout doesn't fit, so we
  // switch to a full-bleed mobile web app: the DeviceFrame fills the viewport,
  // the Dock is replaced by a top-bar burger + slide-in navigation drawer.
  const bare = useMediaQuery('(max-width: 760px)');
  const [drawerOpen, setDrawerOpen] = React.useState(false);

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
          <div key={activeScreen + themeId} className="screen-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {isOnboard
              ? <OnboardingChrome screen={activeScreen} go={go}>{screens[activeScreen]}</OnboardingChrome>
              : screens[activeScreen]}
          </div>
          {bare && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} screen={activeScreen}
            go={(id) => { setScreen(id); setDrawerOpen(false); }} />}
        </DeviceFrame>
      </div>
    </ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

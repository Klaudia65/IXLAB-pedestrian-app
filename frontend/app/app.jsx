/* ============================================================
   APP — routing, theme context, onboarding chrome, transitions
   ============================================================ */

const ONBOARDING = ['swipe', 'sliders', 'words'];

function OnboardingChrome({ screen, go, children }) {
  const t = React.useContext(ThemeCtx);
  const tabs = [{ id: 'swipe', name: 'Swipe' }, { id: 'sliders', name: 'Sliders' }, { id: 'words', name: 'Words' }];
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
        <button onClick={() => go('map')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: t.fontUI, fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>Skip to map ↦</button>
      </div>
      {children}
    </React.Fragment>
  );
}

function App() {
  const [themeId, setThemeId] = usePersist('themeId', 'inkwell');
  const [screen, setScreen] = usePersist('screen', 'swipe');
  const theme = THEMES[themeId] || THEMES.inkwell;
  const go = id => setScreen(id);

  const screens = {
    swipe: <SwipeScreen go={go} />,
    sliders: <SlidersScreen go={go} />,
    words: <WordsScreen go={go} />,
    map: <MapScreen />,
    map2: <MapScreen2 />,
    social: <SocialScreen go={go} />,
    group: <GroupScreen go={go} />,
    groupWords: <GroupWordsScreen go={go} />,
  };
  const isOnboard = ONBOARDING.includes(screen);

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 54, padding: 40, boxSizing: 'border-box', background: 'radial-gradient(120% 120% at 50% 0%, #F3EEE4 0%, #E7E0D2 70%, #DED6C5 100%)' }}>
        <Dock screen={screen} setScreen={setScreen} themeId={themeId} setThemeId={setThemeId} />
        <DeviceFrame theme={theme}>
          <StatusBar />
          <div key={screen + themeId} className="screen-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {isOnboard
              ? <OnboardingChrome screen={screen} go={go}>{screens[screen]}</OnboardingChrome>
              : screens[screen]}
          </div>
        </DeviceFrame>
      </div>
    </ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

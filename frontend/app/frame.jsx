/* ============================================================
   FRAME + SHARED UI ATOMS + CONTROL DOCK
   ============================================================ */

// ---- status bar ----
function StatusBar() {
  return (
    <div style={{ height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '0 26px 8px', position: 'relative', zIndex: 5, flex: '0 0 auto', color: 'var(--ink)' }}>
      <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.01em' }}>9:41</div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><rect x="0" y="7" width="3" height="5" rx="1" fill="currentColor" /><rect x="5" y="4" width="3" height="8" rx="1" fill="currentColor" /><rect x="10" y="1.5" width="3" height="10.5" rx="1" fill="currentColor" opacity="0.85" /><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" opacity="0.4" /></svg>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none"><path d="M8.5 2.5C11 2.5 13.2 3.5 14.8 5.1L13.4 6.6C12.1 5.3 10.4 4.5 8.5 4.5S4.9 5.3 3.6 6.6L2.2 5.1C3.8 3.5 6 2.5 8.5 2.5Z" fill="currentColor" opacity="0.5" /><path d="M8.5 6.2C9.7 6.2 10.8 6.7 11.6 7.5L8.5 10.6L5.4 7.5C6.2 6.7 7.3 6.2 8.5 6.2Z" fill="currentColor" /></svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 23, height: 12, borderRadius: 3, border: '1.4px solid var(--ink)', opacity: 0.5, position: 'relative', padding: 1.5 }}>
            <div style={{ position: 'absolute', inset: 1.6, width: '74%', background: 'var(--ink)', borderRadius: 1.5 }} />
          </div>
          <div style={{ width: 1.6, height: 4, background: 'var(--ink)', opacity: 0.5, borderRadius: 1 }} />
        </div>
      </div>
    </div>);

}

// ---- editorial-style section label ----
function Label({ children, style }) {
  const t = React.useContext(ThemeCtx);
  return (
    <div style={{ fontFamily: t.label.font === 'mono' ? t.fontMono : t.fontUI, fontSize: 11,
      letterSpacing: t.label.spacing, textTransform: t.label.transform, fontWeight: t.label.weight,
      color: 'var(--ink-soft)', ...style }}>{children}</div>);

}

// ---- primary button ----
function PrimaryBtn({ children, onClick, style }) {
  const t = React.useContext(ThemeCtx);
  const [press, setPress] = React.useState(false);
  return (
    <button onClick={onClick}
    onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
    style={{ width: '100%', minHeight: 56, border: 'none', cursor: 'pointer',
      borderRadius: t.radiusSm + 4, background: 'var(--accent)', color: 'var(--accent-ink)',
      fontFamily: t.fontUI, fontSize: 16, fontWeight: 700, letterSpacing: '0.005em',
      boxShadow: t.name === 'Candy' ? '0 6px 0 0 rgba(20,20,25,0.85)' : 'var(--shadow)',
      transform: press ? t.name === 'Candy' ? 'translateY(4px)' : 'scale(0.985)' : 'none',
      transition: 'transform .12s ease, box-shadow .12s ease', ...style, height: "46px" }}>{children}</button>);

}

// ---- avatar chip ----
function Avatar({ p, size = 40, ring }) {
  const t = React.useContext(ThemeCtx);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
      background: p.hue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: t.fontUI, fontWeight: 700, fontSize: size * 0.4, position: 'relative',
      boxShadow: ring ? '0 0 0 3px var(--card), 0 0 0 5px var(--accent)' : '0 0 0 3px var(--card)' }}>
      {p.init}
    </div>);

}

// ---- segmented control ----
function Segmented({ items, value, onChange, dense }) {
  const t = React.useContext(ThemeCtx);
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--card-2)',
      borderRadius: t.radiusPill, border: '1px solid var(--line)' }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)}
          style={{ flex: 1, minHeight: dense ? 38 : 44, border: 'none', cursor: 'pointer',
            borderRadius: t.radiusPill, background: on ? 'var(--ink)' : 'transparent',
            color: on ? 'var(--paper)' : 'var(--ink-soft)', fontFamily: t.fontUI,
            fontWeight: on ? 700 : 600, fontSize: 14, letterSpacing: '0.005em',
            transition: 'background .2s ease, color .2s ease' }}>{it.name}</button>);

      })}
    </div>);

}

const ThemeCtx = React.createContext(THEMES.inkwell);

// ---- the phone shell ----
function DeviceFrame({ theme, children }) {
  const t = theme;
  return (
    <div style={{ width: 390, height: 844, borderRadius: 54, padding: 13, flex: '0 0 auto',
      background: t.dark ? '#05070A' : '#0C0C0E',
      boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 50px 90px -40px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.06)',
      position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 13, borderRadius: 42, overflow: 'hidden',
        background: 'var(--paper)', display: 'flex', flexDirection: 'column',
        ...Object.fromEntries(Object.entries(t.vars)), color: 'var(--ink)', fontFamily: t.fontUI }}>
        {/* dynamic island */}
        <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
          width: 120, height: 33, background: '#000', borderRadius: 20, zIndex: 50 }} />
        {children}
        {/* home indicator */}
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 132, height: 5, borderRadius: 3, background: 'var(--ink)', opacity: 0.32, zIndex: 50 }} />
      </div>
    </div>);

}

// ---- control dock (lives OUTSIDE the phone) ----
const SCREENS = [
{ id: 'swipe', n: '1A', name: 'Swipe' },
{ id: 'sliders', n: '1B', name: 'Sliders' },
{ id: 'words', n: '1C', name: 'Words' },
{ id: 'map', n: '2', name: 'Area map' },
{ id: 'map2', n: '2B', name: 'Map · detailed' },
{ id: 'social', n: '3A', name: 'Social' },
{ id: 'group', n: '3B', name: 'Group · axes' },
{ id: 'groupWords', n: '3C', name: 'Group · words' }];


function Dock({ screen, setScreen, themeId, setThemeId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: 230, flex: '0 0 auto',
      fontFamily: "'Hanken Grotesk', system-ui, sans-serif", color: '#2A2722' }}>
      <div>
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 26, lineHeight: 1.05, color: '#1E1B16', fontWeight: 500 }}>Seoul Walk</div>
        <div style={{ fontSize: 12.5, color: '#7A7363', marginTop: 4, lineHeight: 1.45 }}>A walking companion that learns your spatial taste. Pick an aesthetic, step through the flow.</div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: '#A79E8B', marginBottom: 9 }}>Aesthetic</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {THEME_ORDER.map((id) => {
            const th = THEMES[id];const on = id === themeId;
            const sw = th.vars;
            return (
              <button key={id} onClick={() => setThemeId(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', cursor: 'pointer',
                borderRadius: 14, textAlign: 'left', width: '100%',
                border: on ? '1.5px solid #1E1B16' : '1.5px solid #DDD4C1',
                background: on ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'border-color .15s' }}>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', flex: '0 0 auto', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                  {[sw['--paper'], sw['--accent'], sw['--a1'], sw['--a2']].map((c, i) =>
                  <div key={i} style={{ width: 13, height: 30, background: c }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E1B16' }}>{th.name}</div>
                  <div style={{ fontSize: 10.5, color: '#7A7363', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{th.tagline}</div>
                </div>
              </button>);

          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: '#A79E8B', marginBottom: 9 }}>Screen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {SCREENS.map((s) => {
            const on = s.id === screen;
            return (
              <button key={s.id} onClick={() => setScreen(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer',
                borderRadius: 11, textAlign: 'left',
                border: on ? '1.5px solid #1E1B16' : '1.5px solid #DDD4C1',
                background: on ? '#1E1B16' : 'rgba(255,255,255,0.5)',
                color: on ? '#F1EBDE' : '#2A2722', transition: 'all .15s' }}>
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span>
              </button>);

          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#A79E8B', lineHeight: 1.5, borderTop: '1px solid #DDD4C1', paddingTop: 14 }}>
        Tip: on the swipe deck, drag your own CC0 Seoul photos onto the empty cards — they persist.
      </div>
    </div>);

}

Object.assign(window, { StatusBar, Label, PrimaryBtn, Avatar, Segmented, ThemeCtx, DeviceFrame, Dock, SCREENS });
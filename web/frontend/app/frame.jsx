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
function PrimaryBtn({ children, onClick, style, disabled }) {
  const t = React.useContext(ThemeCtx);
  const [press, setPress] = React.useState(false);
  return (
    <button onClick={onClick} disabled={!!disabled}
    onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
    style={{ width: '100%', minHeight: 56, border: 'none', cursor: disabled ? 'default' : 'pointer',
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

// ---- horizontal drag-to-scroll for overflow rows ----
// Scrollbars are hidden app-wide and a desktop wheel scrolls vertically, so an
// overflowing row isn't obviously scrollable. This makes one draggable (like a
// touch swipe) and maps vertical wheel deltas to horizontal scroll. Spread the
// returned props onto the scroll container; attach `ref` to it.
function useDragScroll() {
  const ref = React.useRef(null);
  const drag = React.useRef({ down: false, moved: false, startX: 0, startScroll: 0 });
  const onPointerDown = (e) => { drag.current = { down: true, moved: false, startX: e.clientX, startScroll: ref.current.scrollLeft }; };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d.down) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 4) { d.moved = true; try { ref.current.setPointerCapture(e.pointerId); } catch (x) {} }
    if (d.moved) ref.current.scrollLeft = d.startScroll - dx;
  };
  const onPointerUp = () => { drag.current.down = false; };
  // swallow the click that ends a drag so it doesn't also fire the item
  const onClickCapture = (e) => { if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; } };
  const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current.scrollLeft += e.deltaY; };
  return {
    ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture, onWheel,
    style: { cursor: 'grab', userSelect: 'none', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' },
  };
}

const ThemeCtx = React.createContext(THEMES.wander);

// ---- the phone shell ----
// `bare` (mobile) drops the decorative device bezel and fills the viewport, so
// the prototype behaves like a real full-screen mobile web app. The desktop
// layout keeps the 390×844 mockup with its dynamic island + home indicator.
function DeviceFrame({ theme, children, bare }) {
  const t = theme;
  const vars = Object.fromEntries(Object.entries(t.vars));
  if (bare) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--paper)', ...vars, color: 'var(--ink)', fontFamily: t.fontUI }}>
        {children}
      </div>);
  }
  return (
    <div style={{ width: 390, height: 844, borderRadius: 54, padding: 13, flex: '0 0 auto',
      background: t.dark ? '#05070A' : '#0C0C0E',
      boxShadow: '0 2px 4px rgba(0,0,0,0.4), 0 50px 90px -40px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.06)',
      position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 13, borderRadius: 42, overflow: 'hidden',
        background: 'var(--paper)', display: 'flex', flexDirection: 'column',
        ...vars, color: 'var(--ink)', fontFamily: t.fontUI }}>
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

// ---- top app bar (mobile) — burger + current screen name + wordmark ----
// Global chrome shown on every screen in the full-bleed mobile layout, giving a
// consistent home for the navigation drawer trigger (the desktop layout uses the
// side Dock instead). Honours the notch via env(safe-area-inset-top).
function AppBar({ screen, onMenu }) {
  const t = React.useContext(ThemeCtx);
  const cur = SCREENS.find((s) => s.id === screen);
  const name = cur ? cur.name : 'explore';
  return (
    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 30,
      padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', background: 'var(--paper)',
      borderBottom: '1px solid var(--line)' }}>
      <button onClick={onMenu} aria-label="Open menu"
        style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)',
          background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <div style={{ fontFamily: t.fontHead, fontWeight: 800, fontSize: 16.5, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{name}</div>
      <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', fontFamily: t.fontHead,
        fontWeight: 700, fontSize: 18, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
        explore
        <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', marginLeft: 2, alignSelf: 'flex-end', marginBottom: 3 }} />
      </div>
    </div>);
}

// ---- navigation drawer (mobile) — the burger's slide-in panel ----
// Same destinations as the desktop Dock (SCREENS), as a left-anchored sheet over
// a dimming scrim. Tapping a destination navigates and closes.
function NavDrawer({ open, onClose, screen, go }) {
  const t = React.useContext(ThemeCtx);
  const ease = 'cubic-bezier(.22,1,.36,1)';
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}>
      {/* dimming scrim */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(10,24,20,0.42)',
        opacity: open ? 1 : 0, transition: `opacity .3s ${ease}` }} />
      {/* the sliding panel */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '84%', maxWidth: 320,
        display: 'flex', flexDirection: 'column', background: 'var(--paper)',
        boxShadow: '0 0 60px rgba(0,0,0,0.35)', transform: open ? 'none' : 'translateX(-102%)',
        transition: `transform .34s ${ease}`,
        padding: 'calc(env(safe-area-inset-top, 0px) + 22px) 18px calc(env(safe-area-inset-bottom, 0px) + 22px)' }}>
        {/* header — wordmark + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: t.fontHead,
            fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--ink)' }}>
            explore
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', marginLeft: 3, alignSelf: 'flex-end', marginBottom: 4 }} />
          </div>
          <button onClick={onClose} aria-label="Close menu"
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)',
              color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ fontFamily: t.fontMono, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--ink-faint)', marginBottom: 10 }}>Screens</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto' }}>
          {SCREENS.map((s) => {
            const on = s.id === screen;
            return (
              <button key={s.id} onClick={() => go(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', cursor: 'pointer',
                  borderRadius: t.radiusSm, textAlign: 'left', fontFamily: t.fontUI,
                  border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                  background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--accent-ink)' : 'var(--ink)',
                  transition: 'background .15s, border-color .15s' }}>
                <span style={{ fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 700, opacity: 0.7, width: 20,
                  fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{s.name}</span>
              </button>);
          })}
        </div>
      </div>
    </div>);
}

// ---- control dock (lives OUTSIDE the phone) ----
const SCREENS = [
{ id: 'landing', n: '0', name: 'Landing' },
{ id: 'sliders', n: '1', name: 'Sliders' },
{ id: 'map2', n: '2', name: 'Map · detailed' },
{ id: 'social', n: '3A', name: 'Social' },
{ id: 'group', n: '3B', name: 'Group · axes' },
{ id: 'profile', n: '4', name: 'Profile' }];


function Dock({ screen, setScreen }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 230, flex: '0 0 auto',
      fontFamily: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif", color: '#255A4B' }}>
      <div>
        {/* wander wordmark — lowercase Space Grotesk + cobalt dot (DS brand) */}
        <div style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: '#143229' }}>
          explore
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#4456FF', marginLeft: 3,
            alignSelf: 'flex-end', marginBottom: 5, boxShadow: '0 0 14px rgba(68,86,255,0.55)' }} />
        </div>
        <div style={{ fontSize: 12.5, color: '#5E8A7C', marginTop: 8, lineHeight: 1.45 }}>A walking companion that learns your spatial taste and personalizes each walk. Step through the flow.</div>
      </div>

      <div>
        <div style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 400, color: '#5E8A7C', marginBottom: 9 }}>Screen</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {SCREENS.map((s) => {
            const on = s.id === screen;
            return (
              <button key={s.id} onClick={() => setScreen(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer',
                borderRadius: 999, textAlign: 'left', fontFamily: "'Space Grotesk', system-ui, sans-serif",
                border: on ? '1.5px solid #4456FF' : '1.5px solid rgba(37,90,75,0.20)',
                background: on ? '#4456FF' : 'rgba(255,255,255,0.55)',
                color: on ? '#FFFFFF' : '#255A4B', transition: 'all .15s' }}>
                <span style={{ fontFamily: "'Space Mono', ui-monospace, monospace", fontSize: 10, fontWeight: 700, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span>
              </button>);

          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#5E8A7C', lineHeight: 1.5, borderTop: '1px solid rgba(37,90,75,0.16)', paddingTop: 14 }}>
        Tip: onboarding is a "this or that" on real Jongno streets — one pick per axis (raw vs polished, quiet vs lively…). Your picks set the base profile: the vibe sliders + profile chips.
      </div>
    </div>);

}

Object.assign(window, { StatusBar, Label, PrimaryBtn, Avatar, Segmented, ThemeCtx, DeviceFrame, AppBar, NavDrawer, Dock, SCREENS, useDragScroll });
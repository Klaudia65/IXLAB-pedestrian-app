/* ============================================================
   0 — LANDING / INVITATION
   Not a login wall. An invitation into spontaneous urban
   discovery. The three social modes (solo / couple / friends)
   ARE the start flow — picking one chooses how you head out,
   each with its own personality:
     solo   = calm, contemplative   (cobalt)
     couple = warm, romantic        (iris)
     group  = lively, social        (orchid)
   ============================================================ */

// the three social modes, as landing content. order = solo → couple → group,
// cool → warm hue, calm → lively personality. ids match SOCIAL / social.mode.
const LANDING_MODES = [
  { id: 'solo', title: 'On my own', mood: 'calm', dots: 1,
    blurb: 'A contemplative wander, paced and routed just for you.',
    hue: 'var(--a3)', glow: 'rgba(68,86,255,0.40)' },
  { id: 'couple', title: 'The two of us', mood: 'romantic', dots: 2,
    blurb: 'Two tastes blended into one route — quiet corners you’ll both love.',
    hue: 'var(--a4)', glow: 'rgba(138,91,255,0.40)' },
  { id: 'group', title: 'With friends', mood: 'lively', dots: 3,
    blurb: 'A buzzing outing on the streets your whole crew agrees on.',
    hue: 'var(--a1)', glow: 'rgba(210,56,235,0.40)' },
];

// person glyph — a tiny figure; clusters of 1/2/3 give each mode its crowd
function PersonGlyph({ size = 22, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
      <circle cx="12" cy="7.5" r="4.1" />
      <path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5z" />
    </svg>
  );
}

// the tinted swatch on each card — its crowd of people, in the mode's hue
function ModeCrowd({ mode, hue, glow }) {
  const n = mode.dots;
  const offs = n === 1 ? [0] : n === 2 ? [-9, 9] : [-15, 0, 15];
  const sizes = n === 1 ? [30] : n === 2 ? [25, 25] : [21, 25, 21];
  const ops = n === 1 ? [1] : n === 2 ? [0.78, 1] : [0.64, 1, 0.82];
  return (
    <div style={{ width: 58, height: 58, borderRadius: 16, flex: '0 0 auto', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `color-mix(in srgb, ${hue} 16%, var(--card))`,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 30%, transparent)` }}>
      <div style={{ position: 'relative', width: 50, height: 30 }}>
        {offs.map((dx, i) => (
          <PersonGlyph key={i} size={sizes[i]} color={hue}
            style={{ position: 'absolute', left: '50%', bottom: 0,
              transform: `translateX(calc(-50% + ${dx}px))`, opacity: ops[i],
              filter: i === Math.floor(n / 2) ? `drop-shadow(0 1px 5px ${glow})` : 'none' }} />
        ))}
      </div>
    </div>
  );
}

function ModeCard({ mode, selected, onSelect }) {
  const t = React.useContext(ThemeCtx);
  const [press, setPress] = React.useState(false);
  return (
    <button onClick={() => onSelect(mode.id)}
      onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '13px 15px', cursor: 'pointer', borderRadius: t.radius, fontFamily: t.fontUI,
        background: selected ? `color-mix(in srgb, ${mode.hue} 9%, var(--card))` : 'var(--card)',
        border: selected ? `1.5px solid ${mode.hue}` : '1.5px solid var(--line)',
        boxShadow: selected ? `0 6px 22px -10px ${mode.glow}` : 'var(--shadow)',
        transform: press ? 'scale(0.99)' : 'none',
        transition: 'transform .12s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease' }}>
      <ModeCrowd mode={mode} hue={mode.hue} glow={mode.glow} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack,
            fontSize: 17.5, color: 'var(--ink)' }}>{mode.title}</span>
          <span style={{ fontFamily: t.fontMono, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: mode.hue, fontWeight: 700 }}>{mode.mood}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.38, marginTop: 3 }}>{mode.blurb}</div>
      </div>
      {/* selection check */}
      <div style={{ width: 22, height: 22, borderRadius: '50%', flex: '0 0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? mode.hue : 'transparent',
        border: selected ? 'none' : '1.5px solid var(--line-strong)',
        transition: 'background .2s ease' }}>
        {selected && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        )}
      </div>
    </button>
  );
}

function LandingScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [sel, setSel] = usePersist('social.mode', 'solo');
  const cur = LANDING_MODES.find(m => m.id === sel) || LANDING_MODES[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 22px 18px', minHeight: 0 }}>
      {/* brand */}
      <div style={{ flex: '0 0 auto' }}>
        <Label>Seoul · pedestrian exploration</Label>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: t.fontHead,
          fontSize: 40, fontWeight: t.headWeight, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--ink)', marginTop: 10 }}>
          explore
          <span style={{ width: 11, height: 11, borderRadius: 999, background: 'var(--accent)', marginLeft: 4,
            alignSelf: 'flex-end', marginBottom: 6, boxShadow: '0 0 16px var(--dot-glow)' }} />
        </div>
        <div style={{ fontFamily: t.fontHead, fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em',
          color: 'var(--ink-soft)', lineHeight: 1.32, marginTop: 12 }}>
          Every walk,<br />a new story.
        </div>
      </div>

      {/* mode cards */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 11, margin: '4px 0' }}>
        <Label style={{ marginBottom: 1 }}>How are you heading out?</Label>
        {LANDING_MODES.map(m => (
          <ModeCard key={m.id} mode={m} selected={m.id === sel} onSelect={setSel} />
        ))}
      </div>

      {/* how it works + CTA */}
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center', marginBottom: 12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto' }}><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" /><path d="M9 21h6M10 17v4M14 17v4" /></svg>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.4, textAlign: 'center' }}>
            Tell us what you love — we'll show you where to go.
          </span>
        </div>
        <PrimaryBtn onClick={() => go('swipe')} style={{ background: cur.hue, boxShadow: `0 8px 24px -10px ${cur.glow}` }}>
          Start exploring{cur.id === 'solo' ? '' : cur.id === 'couple' ? ' together' : ' with friends'}
        </PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { LandingScreen });

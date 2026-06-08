/* ============================================================
   1C — WORD ELICITATION
   Open-vocabulary chips + a popularity-sized aura word cloud
   (the soft glowing-blob look from inspiration #3). Free words
   are mapped back onto the app's internal categories + axes.
   ============================================================ */

// crude free-word → internal category mapper (shown to build trust)
const WORD_MAP = {
  moody: 'quiet · low-light', 'no crowds': 'quiet · low-traffic', riverside: 'greenery · open',
  leafy: 'greenery', gritty: 'raw · industrial', hidden: 'tucked-away · indie', artsy: 'creative · indie',
  vintage: 'historic', buzzing: 'lively', minimal: 'polished · calm', 'old bookshops': 'historic · indie',
  'lantern-lit': 'cosy · historic', slow: 'quiet', cobbled: 'historic',
};

function AuraWord({ word, size, hue, onClick, active }) {
  const t = React.useContext(ThemeCtx);
  const fs = [15, 18, 23, 28][size] || 16;
  return (
    <button onClick={onClick} style={{ position: 'relative', border: 'none', background: 'transparent',
      cursor: 'pointer', padding: '6px 10px', margin: 2, fontFamily: t.fontUI,
      fontSize: fs, fontWeight: active ? 800 : 600, lineHeight: 1,
      color: active ? 'var(--ink)' : (t.dark ? 'var(--ink)' : 'var(--ink)'), opacity: active ? 1 : 0.92 }}>
      <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        width: fs * 4.2, height: fs * 3, borderRadius: '50%', zIndex: -1,
        background: `radial-gradient(circle, ${hue} 0%, transparent 68%)`,
        opacity: t.dark ? 0.5 : 0.42, filter: 'blur(8px)' }} />
      {word}
    </button>
  );
}

function WordsScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [chips, setChips] = usePersist('words.chips', WORD_DEFAULTS);
  const [text, setText] = React.useState('');
  const hues = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a4)'];

  function add(w) {
    const v = w.trim().toLowerCase();
    if (!v || chips.includes(v)) return;
    setChips(c => [...c, v]); setText('');
  }
  function remove(w) { setChips(c => c.filter(x => x !== w)); }

  // derive the internal mapping summary
  const mapped = Array.from(new Set(chips.flatMap(c => (WORD_MAP[c] || '').split(' · ')).filter(Boolean)));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Step 3 of 3 · Open vocabulary</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 27, lineHeight: 1.08, margin: '8px 0 4px', color: 'var(--ink)' }}>Describe your<br/>ideal spot</h1>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0 }}>Type the words you'd tell a friend.</p>

      {/* chip input */}
      <div style={{ marginTop: 16, border: '1.5px solid var(--line-strong)', borderRadius: t.radiusSm,
        background: 'var(--card)', padding: 10, display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
        {chips.map(c => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-soft)', whiteSpace: 'nowrap',
            color: 'var(--accent)', borderRadius: t.radiusPill, padding: '6px 8px 6px 12px', fontSize: 13.5, fontWeight: 700 }}>
            {c}
            <button onClick={() => remove(c)} style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </span>
        ))}
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(text); if (e.key === 'Backspace' && !text && chips.length) remove(chips[chips.length - 1]); }}
          placeholder={chips.length ? 'type a word…' : 'moody, no crowds, riverside…'}
          style={{ flex: 1, minWidth: 90, border: 'none', outline: 'none', background: 'transparent', color: 'var(--ink)', fontFamily: t.fontUI, fontSize: 14, padding: '6px 2px' }} />
      </div>

      {/* mapping hint */}
      {mapped.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
          We map that to <span style={{ color: 'var(--ink-soft)', fontWeight: 700 }}>{mapped.slice(0, 5).join(' · ')}</span> on your taste axes.
        </div>
      )}

      {/* aura word cloud */}
      <div style={{ marginTop: 18, marginBottom: 6 }}><Label>Tap to add</Label></div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexWrap: 'wrap',
        alignContent: 'center', justifyContent: 'center', gap: 2, position: 'relative' }}>
        {WORD_SUGGESTIONS.map((s, i) => (
          <AuraWord key={s.w} word={s.w} size={s.s} hue={hues[i % hues.length]}
            active={chips.includes(s.w)} onClick={() => (chips.includes(s.w) ? remove(s.w) : add(s.w))} />
        ))}
      </div>

      <div style={{ paddingTop: 12 }}>
        <PrimaryBtn onClick={() => go('map')}>Build my map</PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { WordsScreen });

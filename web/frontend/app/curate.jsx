/* ============================================================
   CURATE — pick the two photos each axis comparison shows
   The onboarding is a forced choice per axis (raw vs polished, …). Here the user
   chooses WHICH photo represents each pole, from the full scored pool. Choices are
   saved as an override (pairs.override) that resolveSwipePairs merges over the
   auto-picked defaults. Photos only — the profile still keys off the chosen pole,
   so curation never changes scoring.
   ============================================================ */

function CurateThumb({ card, sub, size = 120 }) {
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.7, flex: '0 0 auto',
      borderRadius: 12, overflow: 'hidden', background: 'var(--card-2)', border: '1px solid var(--line)' }}>
      {card
        ? <img src={card.src} alt={card.place} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-faint)', fontSize: 11 }}>—</div>}
      {sub != null && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 6px 3px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.7), rgba(0,0,0,0))', color: '#fff', fontSize: 10,
          fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      )}
    </div>
  );
}

function PoleBtn({ label, on, accent, onClick }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, minWidth: 0, padding: '8px 6px', cursor: 'pointer', borderRadius: 999,
        border: on ? 'none' : '1.5px solid var(--line-strong)',
        background: on ? (accent || 'var(--accent)') : 'var(--card)',
        color: on ? 'var(--accent-ink)' : 'var(--ink-soft)', fontWeight: 700, fontSize: 12,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</button>
  );
}

function CurateScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const axes = SWIPE_AXES || [];
  const [ai, setAi] = React.useState(0);
  const [override, setOverride] = usePersist('pairs.override', {});

  const [axisKey, negRaw, pos] = axes[ai] || [];
  const neg = negRaw || 'no park';

  // auto defaults, to fall back on when a pole isn't overridden
  const defaults = React.useMemo(() => {
    const m = {}; (SWIPE_PAIRS || []).forEach(p => { m[p.axis] = p; }); return m;
  }, []);

  const o = override[axisKey] || {};
  const d = defaults[axisKey] || {};
  const leftId = o.left || (d.left && d.left.id) || null;
  const rightId = o.right || (d.right && d.right.id) || null;
  const leftCard = leftId && cardById(leftId);
  const rightCard = rightId && cardById(rightId);

  // full pool, sorted by this axis (most negative pole first → most positive last)
  const pool = React.useMemo(() => {
    const cs = (SWIPE_CARDS || []).slice();
    cs.sort((a, b) => {
      const va = a.scores[axisKey], vb = b.scores[axisKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va - vb;
    });
    return cs;
  }, [axisKey]);

  function assign(side, cardId) {
    setOverride(ov => {
      const cur = { ...(ov[axisKey] || {}) };
      const other = side === 'left' ? 'right' : 'left';
      cur[side] = cardId;
      if (cur[other] === cardId) delete cur[other];   // don't allow the same photo on both sides
      return { ...ov, [axisKey]: cur };
    });
  }
  function resetAxis() { setOverride(ov => { const n = { ...ov }; delete n[axisKey]; return n; }); }
  function resetAll() { setOverride({}); }

  const isCurated = axisKey in override;

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* header */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 6px' }}>
        <button onClick={() => go('landing')} style={{ width: 40, height: 40, borderRadius: 999, cursor: 'pointer',
          background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
        </button>
        <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 18, color: 'var(--ink)' }}>Choose the photos</div>
        <button onClick={resetAll} title="Reset all to auto"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: t.fontUI, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)' }}>Reset all</button>
      </div>

      {/* axis tabs */}
      <div style={{ flex: '0 0 auto', display: 'flex', gap: 7, overflowX: 'auto', padding: '2px 20px 10px' }}>
        {axes.map(([k, ng, ps], i) => (
          <button key={k} onClick={() => setAi(i)}
            style={{ flex: '0 0 auto', padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
              border: i === ai ? 'none' : '1px solid var(--line)',
              background: i === ai ? 'var(--accent)' : 'var(--card)',
              color: i === ai ? 'var(--accent-ink)' : 'var(--ink-soft)',
              fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
            {(ng || 'no park')} ↔ {ps}{(k in override) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {/* current pick preview */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CurateThumb card={leftCard} sub={leftCard ? leftCard.place : null} size={128} />
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{neg}</span>
        </div>
        <div style={{ fontFamily: t.fontMono, fontSize: 11, fontWeight: 800, color: 'var(--ink-faint)' }}>vs</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <CurateThumb card={rightCard} sub={rightCard ? rightCard.place : null} size={128} />
          <span style={{ fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{pos}</span>
        </div>
      </div>

      <div style={{ flex: '0 0 auto', padding: '0 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Tap a pole to set that side. Sorted {neg} → {pos}.</span>
        {isCurated && <button onClick={resetAxis} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--accent)' }}>auto</button>}
      </div>

      {/* pool list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pool.map(card => {
          const v = card.scores[axisKey];
          const isLeft = card.id === leftId, isRight = card.id === rightId;
          return (
            <div key={card.id} style={{ display: 'flex', gap: 12, alignItems: 'center',
              padding: 8, borderRadius: 14, background: 'var(--card)',
              border: (isLeft || isRight) ? '1.5px solid var(--accent)' : '1px solid var(--line)' }}>
              <CurateThumb card={card} sub={null} size={124} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.place}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                  {v == null ? 'not measured on this axis' : `${v > 0 ? '+' : ''}${v.toFixed(2)} · ${v < 0 ? neg : pos}`}
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <PoleBtn label={neg} on={isLeft} onClick={() => assign('left', card.id)} />
                  <PoleBtn label={pos} on={isRight} onClick={() => assign('right', card.id)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* done */}
      <div style={{ flex: '0 0 auto', padding: '10px 20px 18px', borderTop: '1px solid var(--line)' }}>
        <PrimaryBtn onClick={() => go('landing')}>Done — back to the picks</PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { CurateScreen });

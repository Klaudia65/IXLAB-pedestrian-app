/* ============================================================
   1A — SWIPE STREET VIEWS
   Physical drag + tilt + LIKE/NOPE stamp, undo, progress.
   Empty cards are <image-slot> drag-to-fill targets.
   ============================================================ */

function SceneTags({ tags }) {
  const t = React.useContext(ThemeCtx);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(tag => (
        <span key={tag} style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px',
          borderRadius: t.radiusPill, background: 'var(--card-2)', color: 'var(--ink-soft)',
          border: '1px solid var(--line)', backdropFilter: 'blur(6px)' }}>{tag}</span>
      ))}
    </div>
  );
}

function Card({ card, dragX, dragY, dragging, isTop }) {
  const t = React.useContext(ThemeCtx);
  const rot = isTop ? dragX * 0.05 : 0;
  const likeOp = isTop ? clamp(dragX / 90, 0, 1) : 0;
  const nopeOp = isTop ? clamp(-dragX / 90, 0, 1) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: t.radius, overflow: 'hidden',
      background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)',
      transform: `translate(${dragX}px, ${dragY}px) rotate(${rot}deg)`,
      transition: dragging ? 'none' : 'transform .42s cubic-bezier(.22,1,.36,1)',
      display: 'flex', flexDirection: 'column', touchAction: 'none', userSelect: 'none' }}>
      {/* photo area */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {card.src
          ? <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${card.src})`,
              backgroundSize: 'cover', backgroundPosition: 'center' }} />
          : <image-slot id={'swipe-' + card.id} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
              shape="rect" placeholder={'drop ' + card.hint}></image-slot>}
        {/* legible scrim */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />
        {/* stamps */}
        <Stamp text="LIKE" op={likeOp} side="left" />
        <Stamp text="NOPE" op={nopeOp} side="right" />
        {/* place + tags pinned to photo bottom */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, pointerEvents: 'none' }}>
          <div style={{ color: '#fff', fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 22,
            letterSpacing: t.headTrack, textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}>{card.scene}</div>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 600, marginTop: 2,
            textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>{card.place}</div>
        </div>
      </div>
      {/* tag tray */}
      <div style={{ padding: '12px 14px 14px', flex: '0 0 auto', background: 'var(--card)' }}>
        <SceneTags tags={card.tags} />
      </div>
    </div>
  );
}

function Stamp({ text, op, side }) {
  const t = React.useContext(ThemeCtx);
  const like = text === 'LIKE';
  const col = like ? 'var(--good)' : 'var(--warn)';
  return (
    <div style={{ position: 'absolute', top: 24, [side]: 20, opacity: op,
      transform: `rotate(${like ? -14 : 14}deg) scale(${0.8 + op * 0.2})`, pointerEvents: 'none',
      border: `3px solid ${col}`, color: col, borderRadius: 10, padding: '4px 14px',
      fontFamily: t.fontMono, fontWeight: 800, fontSize: 24, letterSpacing: '0.06em',
      background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(2px)' }}>{text}</div>
  );
}

function CircleBtn({ onClick, children, accent, size = 58 }) {
  const t = React.useContext(ThemeCtx);
  const [press, setPress] = React.useState(false);
  return (
    <button onClick={onClick} onPointerDown={() => setPress(true)} onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', flex: '0 0 auto',
        border: accent ? 'none' : '1.5px solid var(--line-strong)',
        background: accent ? 'var(--accent)' : 'var(--card)', color: accent ? 'var(--accent-ink)' : 'var(--ink-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)',
        transform: press ? 'scale(0.92)' : 'none', transition: 'transform .12s ease' }}>{children}</button>
  );
}

function SwipeScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [idx, setIdx] = usePersist('swipe.idx', 0);
  const [likes, setLikes] = usePersist('swipe.likes', {});
  const [drag, setDrag] = React.useState({ x: 0, y: 0, on: false });
  const start = React.useRef(null);
  const moved = React.useRef(false);
  const total = SWIPE_CARDS.length;
  const done = idx >= total;

  function decide(dir) {
    const card = SWIPE_CARDS[idx];
    if (card) setLikes(l => ({ ...l, [card.id]: dir === 'right' }));
    const fly = dir === 'right' ? 600 : -600;
    setDrag({ x: fly, y: -40, on: false });
    setTimeout(() => { setIdx(i => i + 1); setDrag({ x: 0, y: 0, on: false }); }, prefersReduced() ? 0 : 260);
  }
  function undo() {
    if (idx === 0) return;
    const prev = SWIPE_CARDS[idx - 1];
    setLikes(l => { const n = { ...l }; delete n[prev.id]; return n; });
    setIdx(i => i - 1);
  }

  function onPointerDown(e) {
    if (done) return;
    start.current = { x: e.clientX, y: e.clientY }; moved.current = false;
  }
  function onPointerMove(e) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) > 6) {
      moved.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      setDrag(d => ({ ...d, on: true }));
    }
    if (moved.current) setDrag({ x: dx, y: dy, on: true });
  }
  function onPointerUp() {
    if (!start.current) return;
    const wasDragging = moved.current;
    start.current = null;
    if (!wasDragging) { setDrag({ x: 0, y: 0, on: false }); return; }
    if (drag.x > 92) decide('right');
    else if (drag.x < -92) decide('left');
    else setDrag({ x: 0, y: 0, on: false });
  }

  const liked = Object.values(likes).filter(Boolean).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Step 1 of 2 · Teach me your taste</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack,
        fontSize: 27, lineHeight: 1.08, margin: '8px 0 0', color: 'var(--ink)' }}>Swipe the streets<br/>that feel like you</h1>

      {/* progress */}
      <div style={{ marginTop: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{Math.min(idx + 1, total)} of {total} · keep going</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{liked} liked</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(Math.min(idx, total) / total) * 100}%`, background: 'var(--accent)',
            borderRadius: 999, transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
        </div>
      </div>

      {/* deck */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14,
            border: '1.5px dashed var(--line-strong)', borderRadius: t.radius, padding: 24 }}>
            <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 24, color: 'var(--ink)' }}>Taste profile sharpened</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 240 }}>You liked {liked} of {total} scenes. We learned your weights silently — no setup needed.</div>
            <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
              <button onClick={() => { setIdx(0); setLikes({}); }} style={{ border: '1.5px solid var(--line-strong)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 999, padding: '11px 18px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: t.fontUI }}>Swipe again</button>
              <button onClick={() => go && go('sliders')} style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 999, padding: '11px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: t.fontUI }}>Continue to sliders →</button>
            </div>
          </div>
        ) : (
          [2, 1, 0].map(off => {
            const ci = idx + off; const card = SWIPE_CARDS[ci];
            if (!card) return null;
            const isTop = off === 0;
            const scale = 1 - off * 0.045;
            const ty = off * 12;
            if (isTop) return <Card key={card.id} card={card} dragX={drag.x} dragY={drag.y} dragging={drag.on} isTop />;
            return (
              <div key={card.id} style={{ position: 'absolute', inset: 0, transform: `translateY(${ty}px) scale(${scale})`,
                transition: 'transform .42s cubic-bezier(.22,1,.36,1)', opacity: 1 - off * 0.12 }}>
                <Card card={card} dragX={0} dragY={0} dragging={false} isTop={false} />
              </div>
            );
          })
        )}
      </div>

      {/* controls */}
      {!done && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 16 }}>
          <CircleBtn onClick={() => decide('left')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </CircleBtn>
          <CircleBtn onClick={undo} size={48}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h11a6 6 0 110 12H7"/><path d="M7 4L3 8l4 4"/></svg>
          </CircleBtn>
          <CircleBtn onClick={() => decide('right')} accent>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.3 5c2 0 3.4 1.2 4.2 2.4C10.3 6.2 11.7 5 13.7 5 17 5 18.6 8.4 17 11.7 14.5 16.4 12 21 12 21z"/></svg>
          </CircleBtn>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SwipeScreen });

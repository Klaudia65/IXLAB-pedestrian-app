/* ============================================================
   1B — VIBE SLIDERS
   Draggable spectrums you can keep or drop. Only the dimensions
   you keep are counted toward the match.
   ============================================================ */

function VibeSlider({ axis, value, onChange, onDrop }) {
  const t = React.useContext(ThemeCtx);
  const trackRef = React.useRef(null);
  const dragging = React.useRef(false);

  function setFromClient(clientX) {
    const r = trackRef.current.getBoundingClientRect();
    onChange(clamp((clientX - r.left) / r.width, 0, 1));
  }
  function down(e) { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} setFromClient(e.clientX); }
  function move(e) { if (dragging.current) setFromClient(e.clientX); }
  function up() { dragging.current = false; }

  return (
    <div style={{ position: 'relative', padding: '2px 30px 2px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: value < 0.5 ? 'var(--ink)' : 'var(--ink-faint)' }}>{axis.left}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: value >= 0.5 ? 'var(--ink)' : 'var(--ink-faint)' }}>{axis.right}</span>
      </div>
      <div ref={trackRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 999, background: 'var(--line)' }} />
        <div style={{ position: 'absolute', left: 0, width: `${value * 100}%`, height: 4, borderRadius: 999, background: 'var(--accent)', opacity: 0.55 }} />
        <div style={{ position: 'absolute', left: `${value * 100}%`, transform: 'translateX(-50%)',
          width: 26, height: 26, borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--accent)',
          boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
        </div>
      </div>
      {onDrop && (
        <button onClick={onDrop} title="Don't factor this in"
          style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'var(--card-2)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      )}
    </div>
  );
}

function SlidersScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [vals, setVals] = usePersist('sliders.vals', Object.fromEntries(VIBE_AXES.map(a => [a.id, a.def])));
  const [off, setOff] = usePersist('sliders.off', []);          // axis ids the user dropped

  const isOff = id => off.includes(id);
  // greenery is chosen on the map with its own two-button control (Leafy street /
  // Park), not as a bipolar slider — so it isn't listed here.
  const activeAxes = VIBE_AXES.filter(a => a.id !== 'green' && !isOff(a.id));
  const mutedAxes = VIBE_AXES.filter(a => a.id !== 'green' && isOff(a.id));
  const set = (id, v) => setVals(o => ({ ...o, [id]: v }));

  function dropAxis(id) { setOff(o => o.includes(id) ? o : [...o, id]); }
  function restoreAxis(id) { setOff(o => o.filter(x => x !== id)); }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Step 2 of 2 · Direct & fast</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 27, lineHeight: 1.08, margin: '8px 0 4px', color: 'var(--ink)' }}>Set your vibe</h1>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0 }}>Drag what matters. Drop the rest with × for a sharper match.</p>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '16px -4px 0', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeAxes.map(a => (
          <VibeSlider key={a.id} axis={a} value={vals[a.id] ?? 0.5} onChange={v => set(a.id, v)}
            onDrop={() => dropAxis(a.id)} />
        ))}

        {activeAxes.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center', padding: '12px 0', margin: 0 }}>
            No dimensions yet — add one back below.
          </p>
        )}

        {mutedAxes.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 9 }}>Not factored in · tap to add back</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {mutedAxes.map(a => (
                <button key={a.id} onClick={() => restoreAxis(a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: t.fontUI }}>
                  <span style={{ fontSize: 15, lineHeight: 1, color: 'var(--accent)' }}>+</span>{a.left} ↔ {a.right}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => go('map2')}>See matching areas</PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { SlidersScreen });

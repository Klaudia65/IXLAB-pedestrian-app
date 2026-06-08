/* ============================================================
   1B — VIBE SLIDERS
   Draggable spectrums + an "add your own dimension" escape hatch.
   ============================================================ */

function VibeSlider({ axis, value, onChange, onRemove }) {
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
    <div style={{ padding: '2px 0' }}>
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
        {onRemove && (
          <button onClick={onRemove} style={{ position: 'absolute', right: -6, top: -8, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--card-2)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}
      </div>
    </div>
  );
}

function SlidersScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  const [vals, setVals] = usePersist('sliders.vals', Object.fromEntries(VIBE_AXES.map(a => [a.id, a.def])));
  const [custom, setCustom] = usePersist('sliders.custom', []);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ left: '', right: '' });

  const allAxes = [...VIBE_AXES, ...custom];
  const set = (id, v) => setVals(o => ({ ...o, [id]: v }));

  function addDim() {
    if (!draft.left.trim() || !draft.right.trim()) { setAdding(false); return; }
    const id = 'cx' + Date.now();
    setCustom(c => [...c, { id, left: draft.left.trim(), right: draft.right.trim() }]);
    setVals(o => ({ ...o, [id]: 0.5 }));
    setDraft({ left: '', right: '' }); setAdding(false);
  }
  function removeDim(id) {
    setCustom(c => c.filter(x => x.id !== id));
    setVals(o => { const n = { ...o }; delete n[id]; return n; });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Step 2 of 3 · Direct & fast</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 27, lineHeight: 1.08, margin: '8px 0 4px', color: 'var(--ink)' }}>Set your vibe</h1>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', margin: 0 }}>Drag each spectrum to where you sit.</p>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', margin: '16px -4px 0', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {allAxes.map(a => (
          <VibeSlider key={a.id} axis={a} value={vals[a.id] ?? 0.5} onChange={v => set(a.id, v)}
            onRemove={custom.find(c => c.id === a.id) ? () => removeDim(a.id) : null} />
        ))}

        {adding ? (
          <div style={{ border: '1.5px dashed var(--accent)', borderRadius: t.radiusSm, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input autoFocus value={draft.left} onChange={e => setDraft(d => ({ ...d, left: e.target.value }))} placeholder="e.g. Gritty"
                style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: t.radiusSm - 2, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontFamily: t.fontUI, fontSize: 13.5 }} />
              <span style={{ alignSelf: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>↔</span>
              <input value={draft.right} onChange={e => setDraft(d => ({ ...d, right: e.target.value }))} placeholder="e.g. Refined"
                style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: t.radiusSm - 2, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontFamily: t.fontUI, fontSize: 13.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addDim} style={{ flex: 1, padding: '9px', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: t.fontUI }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: t.fontUI }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', padding: '6px 0', fontFamily: t.fontUI }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> add your own dimension
          </button>
        )}
      </div>

      <div style={{ paddingTop: 14 }}>
        <PrimaryBtn onClick={() => go('map')}>See matching areas</PrimaryBtn>
      </div>
    </div>
  );
}

Object.assign(window, { SlidersScreen });

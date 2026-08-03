/* ============================================================
   0 — LANDING (merged with the old 1A swipe deck)
   One invitation screen: pick how you're heading out (solo or
   with friends) AND start teaching your taste by swiping streets
   — no separate onboarding step. "Set your vibe →" jumps to the
   sliders at any point.

   The swipe deck reuses Card / CircleBtn (defined in swipe.jsx)
   and the SWIPE_CARDS data, so the interaction is identical to
   the old standalone screen — just hosted here with a compact
   header + mode toggle above it.
   ============================================================ */

// One side of a forced-choice pair: a tappable photo with its pole label. Photo
// fills the card (object-fit: cover) so there are no letterbox bars; the stacked
// full-width layout keeps the crop gentle.
function PairChoice({ card, pole, onPick }) {
  const t = React.useContext(ThemeCtx);
  const [press, setPress] = React.useState(false);
  return (
    <button onClick={onPick} onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)} onPointerLeave={() => setPress(false)}
      style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', borderRadius: t.radius, overflow: 'hidden',
        border: '1px solid var(--line)', background: 'var(--card)', boxShadow: 'var(--shadow)', cursor: 'pointer',
        padding: 0, display: 'block', textAlign: 'left',
        transform: press ? 'scale(0.985)' : 'none', transition: 'transform .12s ease' }}>
      {/* photo fills the card */}
      <img src={card.src} alt={card.place} draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {/* legibility scrims at top (chip) and bottom (name) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 54, background: 'linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0))', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 46, background: 'linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))', pointerEvents: 'none' }} />
      {/* pole label chip */}
      <div style={{ position: 'absolute', top: 9, left: 9, background: 'var(--accent)', color: 'var(--accent-ink)',
        fontFamily: t.fontMono, fontWeight: 800, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '4px 9px', borderRadius: t.radiusPill }}>{pole}</div>
      {/* street name + credit */}
      <div style={{ position: 'absolute', left: 11, right: 11, bottom: 8 }}>
        <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 700, textShadow: '0 1px 8px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.place}</div>
        {card.credit && (
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9.5, textShadow: '0 1px 6px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.credit}</div>
        )}
      </div>
    </button>
  );
}

function LandingScreen({ go }) {
  const t = React.useContext(ThemeCtx);

  // ---- forced-choice onboarding: one "this or that" per axis ----
  // Photos come from resolveSwipePairs (auto defaults, or the user's curation
  // override); recomputed on mount so returning from the curation screen shows the
  // freshly picked photos.
  const pairs = React.useMemo(() => resolveSwipePairs(), []);
  const [idx, setIdx] = usePersist('pairs.idx', 0);
  const [choices, setChoices] = usePersist('pairs.choices', {});   // { axisKey: 'left'|'right'|'skip' }
  const total = pairs.length;
  const done = idx >= total;
  const answered = Object.values(choices).filter(c => c === 'left' || c === 'right').length;
  const pair = pairs[idx];

  function pick(choice) {
    if (!pair) return;
    const next = { ...choices, [pair.axis]: choice };
    setChoices(next);
    commitPairsProfile(next);                 // rebuild the base profile (sliders + chips) live
    // study telemetry: record this forced-choice answer
    if (window.StudyAPI) {
      window.StudyAPI.logOnboarding([{
        axis: pair.axis,
        left_card_id: pair.left && pair.left.id,
        right_card_id: pair.right && pair.right.id,
        chosen_side: choice,
        chosen_card_id: choice === 'left' ? (pair.left && pair.left.id)
          : choice === 'right' ? (pair.right && pair.right.id) : null,
      }]);
    }
    setIdx(i => i + 1);
  }
  function undo() {
    if (idx === 0) return;
    const prev = pairs[idx - 1];
    const next = { ...choices }; if (prev) delete next[prev.axis];
    setChoices(next);
    commitPairsProfile(next);
    setIdx(i => i - 1);
  }
  function restart() { setIdx(0); setChoices({}); commitPairsProfile({}); }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 20px 16px', minHeight: 0 }}>
      {/* compact header — wordmark + jump-ahead link */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: t.fontHead,
          fontSize: 30, fontWeight: t.headWeight, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--ink)' }}>
          explore
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--accent)', marginLeft: 3,
            alignSelf: 'flex-end', marginBottom: 5, boxShadow: '0 0 14px var(--dot-glow)' }} />
        </div>
        <button onClick={() => go('sliders')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: t.fontUI,
            fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', padding: '4px 0', whiteSpace: 'nowrap' }}>
          Set your vibe →
        </button>
      </div>

      {/* short intro + a nudge that walks can be shared with friends */}
      <div style={{ flex: '0 0 auto', marginTop: 10 }}>
        <div style={{ fontFamily: t.fontHead, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em',
          color: 'var(--ink-soft)', lineHeight: 1.3 }}>
          Every walk, a new story.
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', marginTop: 1 }}>
            <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
            <path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 20" />
          </svg>
          <span style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.45 }}>
            Walking with others? You can <b style={{ color: 'var(--ink-soft)' }}>add friends</b> and blend everyone's taste into one route.
          </span>
        </div>
      </div>

      {/* instruction + progress */}
      <div style={{ flex: '0 0 auto', marginTop: 13, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Which street feels more like you?
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{Math.min(idx + (done ? 0 : 1), total)} of {total}</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(Math.min(idx, total) / total) * 100}%`, background: 'var(--accent)',
            borderRadius: 999, transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
        </div>
        <div style={{ textAlign: 'right', marginTop: 6 }}>
          <button onClick={() => go('curate')}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: t.fontUI,
              fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)', padding: 0 }}>
            Pick the photos yourself →
          </button>
        </div>
      </div>

      {/* the choice */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {done ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14,
            border: '1.5px dashed var(--line-strong)', borderRadius: t.radius, padding: 24 }}>
            <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 24, color: 'var(--ink)' }}>Taste profile set</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 250 }}>
              You made {answered} of {total} calls. We set your vibe sliders and profile chips from them — tweak them next, or head to the map.
            </div>
            <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
              <button onClick={restart} style={{ border: '1.5px solid var(--line-strong)', background: 'var(--card)', color: 'var(--ink)', borderRadius: 999, padding: '11px 18px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: t.fontUI }}>Start over</button>
              <button onClick={() => go('sliders')} style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 999, padding: '11px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: t.fontUI }}>Set your vibe →</button>
            </div>
          </div>
        ) : pair ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PairChoice card={pair.left} pole={pair.neg} onPick={() => pick('left')} />
              {/* "or" divider between the two full-width photos */}
              <div style={{ flex: '0 0 auto', alignSelf: 'center', fontFamily: t.fontMono, fontSize: 11,
                fontWeight: 800, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>— or —</div>
              <PairChoice card={pair.right} pole={pair.pos} onPick={() => pick('right')} />
            </div>
            {/* no-preference + undo */}
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {idx > 0 && (
                <button onClick={undo} title="Back" style={{ border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)',
                  borderRadius: 999, width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h11a6 6 0 110 12H7"/><path d="M7 4L3 8l4 4"/></svg>
                </button>
              )}
              <button onClick={() => pick('skip')}
                style={{ border: '1.5px solid var(--line-strong)', background: 'var(--card)', color: 'var(--ink-soft)',
                  borderRadius: 999, padding: '11px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: t.fontUI }}>
                No preference
              </button>
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-faint)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            No comparison data — run backend/analysis/step0_7_build_swipe_deck.py.
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LandingScreen });

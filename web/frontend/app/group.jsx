/* ============================================================
   3B — GROUP PREFERENCE-MERGE
   Each shared axis as one line carrying every person's DECLARED
   tolerance range (see theme.jsx: an axis the walker dropped gets the full width,
   so they never block the group on it). Three outcomes per axis:
     · common ground  — every range intersects
     · needs settling — the others would agree without one person
     · scattered      — nobody overlaps

   A disagreement is settled by AGREEING, not by pressing a button: every way out
   (meet in the middle / leave the axis out / a spot you dragged to / a trade across
   two axes) is a PROPOSAL first, inert until the person it asks something of
   accepts. The maths and the settlement state live in theme.jsx and are persisted,
   so the streets below and the map both rank on the agreed value. This screen only
   renders the negotiation and collects the taps.
   ============================================================ */

// Design-system palette (design_system/tokens/colors.css). This screen anchors its
// DATA-VIZ FILLS to the brand colours so they read identically in every prototype
// theme; surrounding text stays theme-driven for legibility.
const DS = {
  solo:    '#4456FF',  // cobalt — outing-solo
  couple:  '#8A5BFF',  // iris   — outing-couple
  friends: '#B84BFF',  // mauve  — outing-friends
  safe:    '#A6FFE8',  // mint   — everything agreed
  alert:   '#D238EB',  // orchid — open disagreement + the meet-point marker
  ink:     '#143229',  // seaweed-900 — text on light DS fills
};
// There is no agreement band drawn on the axis. Where the people's own bars overlap
// IS the common ground — painting a filled zone on top of them said the same thing a
// second time, in a colour that shouted louder than the disagreement next to it, and
// it covered the bars it was describing. What remains on the line is the people, and
// a cursor wherever there is something to decide.

// Small pill button, so the three actions on a row read as one family.
function AxisBtn({ children, onClick, kind, title }) {
  const t = React.useContext(ThemeCtx);
  const style = kind === 'primary'
    ? { border: 'none', background: DS.alert, color: '#fff' }
    : kind === 'accept'
      ? { border: 'none', background: 'var(--good)', color: '#fff' }
      : { border: '1.5px solid var(--line-strong)', background: 'transparent', color: 'var(--ink-soft)' };
  return (
    <button onClick={onClick} title={title}
      style={{ flex: '0 0 auto', cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontFamily: t.fontUI,
        fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all .2s ease', ...style }}>{children}</button>
  );
}

// One axis line. `axis` is a reconciled entry from window.reconcileGroupAxes: it
// carries the per-person ranges, the effective (post-agreement) ranges, where the walk
// lands, and what is currently proposed vs agreed.
function AxisRow({ axis, me, memberIds, memberMap, pairMode, onPropose, onMove, onAccept, onCounter, onClear }) {
  const t = React.useContext(ThemeCtx);
  const trackRef = React.useRef(null);
  const dragRef = React.useRef(null);                  // live value, readable mid-gesture
  const [drag, setDrag] = React.useState(null);        // same value, for rendering
  const conflict = axis.conflict;
  const settled = !!axis.applied;
  const pending = axis.pending;
  const drawRanges = settled ? axis.eff : axis.ranges;
  const leanWord = conflict ? (axis.side === 'right' ? axis.right : axis.left) : null;
  const nameOf = id => (memberMap[id] ? memberMap[id].name : 'someone');

  // The cursor only exists where there is something to decide, or something decided.
  // An axis you already agree on needs nothing: the overlap of the bars is the answer.
  // While unsettled it can be dragged anywhere on the axis — that is the whole point,
  // the group picks the spot rather than accepting the one the app worked out. Once
  // settled it stays put and marks where the walk landed (undo to move it again).
  const canDrag = conflict && !settled;
  const cursorAt = settled ? axis.center
    : drag != null ? drag
      : pending ? axis.previewAt : axis.meet;

  // Someone with no preference on this axis has a full-width band. Drawing that as a
  // bar spanning the entire line reads as "I want all of it" — the opposite of what it
  // means — and it crosses everyone else's bar for no reason. They come off the line
  // and are named underneath instead. Tested on the DECLARED range, not the effective
  // one, since settling only ever widens a band.
  const hasPreference = id => {
    const r = axis.ranges[id];
    return !(r[0] <= 0 && r[1] >= 1);
  };
  const shown = memberIds.filter(hasPreference);
  const quiet = memberIds.filter(id => !hasPreference(id));
  // Keep the stack of bars centred on the line whatever its height, so an axis with one
  // voice doesn't sit lopsided against an axis with three.
  const stackTop = 17 - (4 + (shown.length - 1) * 7) / 2;

  function valueFromClient(clientX) {
    const r = trackRef.current.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1);
  }
  // The live position lives in a REF as well as in state. State alone would be read
  // stale by the handlers: within one gesture React has not re-rendered yet, so a
  // plain tap (down then up, no movement) would see `drag === null` and be thrown
  // away. A tap on the axis has to place the cursor just like a drag does.
  function setAt(v) { dragRef.current = v; setDrag(v); }
  function down(e) {
    if (!canDrag) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
    setAt(valueFromClient(e.clientX));
    onMove(axis.id, valueFromClient(e.clientX));
  }
  function move(e) {
    if (dragRef.current == null) return;
    const v = valueFromClient(e.clientX);
    setAt(v);
    // Push WHILE dragging (throttled upstream) so the others watch the cursor travel
    // rather than only learning where it stopped.
    onMove(axis.id, v);
  }
  function up() {
    const v = dragRef.current;
    if (v == null) return;
    dragRef.current = null;
    setDrag(null);
    // Letting go turns the live move into the offer itself.
    onPropose(axis.id, { how: 'point', value: v, by: me });
  }

  // Everyone this offer still needs a yes from — only the people whose own zone excludes
  // the spot, so an offer that lands where you already are asks you nothing.
  const asks = axis.asks || [];
  const iAmAsked = asks.indexOf(me) >= 0;
  const waitingFor = asks.map(nameOf).join(' and ');

  // What the offer on the table says, in the group's words.
  function pendingLine() {
    const who = pending.by === me ? 'You' : nameOf(pending.by);
    const verb = who === 'You' ? 'propose' : 'proposes';
    if (axis.moving) {
      return who === 'You' ? 'Moving it…' : `${who} is moving the cursor…`;
    }
    const tail = waitingFor ? ` — waiting for ${waitingFor}` : '';
    if (pending.how === 'drop') return `${who} suggest${who === 'You' ? '' : 's'} leaving this one out${tail}`;
    if (pending.how === 'trade') return `Part of the trade — ${nameOf(pending.winner)} takes this one${tail}`;
    if (pending.how === 'point') return `${who} ${verb} this spot${tail}`;
    return `${who} ${verb} the middle${tail}`;
  }
  function settledLine() {
    const how = axis.applied.how;
    if (how === 'drop') return 'Left out — this one no longer shapes the walk';
    if (how === 'trade') return `Traded — ${nameOf(axis.applied.winner)} takes this one, their way`;
    if (how === 'point') return 'Settled on the spot you agreed';
    return 'Settled in the middle you agreed';
  }

  return (
    <div style={{ opacity: axis.applied && axis.applied.how === 'drop' ? 0.55 : 1, transition: 'opacity .3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{axis.left}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>{axis.right}</span>
      </div>

      <div ref={trackRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ position: 'relative', height: 34, cursor: canDrag ? 'ew-resize' : 'default', touchAction: canDrag ? 'none' : 'auto' }}>
        {/* baseline */}
        <div style={{ position: 'absolute', top: 15, left: 0, right: 0, height: 4, borderRadius: 999, background: 'var(--line)' }} />

        {/* one bar per person WHO HAS A PREFERENCE here. Where these overlap is the
            common ground — nothing is painted on top to restate it. The person still in
            disagreement is outlined, not dimmed: dimming read as "ignored". */}
        {shown.map((id, i) => {
          const rr = drawRanges[id];
          const isOut = conflict && !settled && id === axis.outlier;
          return (
            <div key={id} style={{ position: 'absolute', zIndex: 1, top: stackTop + i * 7, left: `${rr[0] * 100}%`, width: `${(rr[1] - rr[0]) * 100}%`,
              height: 4, borderRadius: 999, background: memberMap[id].hue,
              outline: isOut ? `1.5px solid ${DS.alert}` : 'none', outlineOffset: 1.5,
              transition: 'left .5s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1), top .3s ease' }} />);
        })}

        {/* the cursor. Orchid and grabbable while it still needs deciding; calm ink
            once settled, marking where the walk landed. Absent on an axis you already
            agree on, and on one you left out — neither has a spot to point at. */}
        {conflict && cursorAt != null && (
          <div style={{ position: 'absolute', zIndex: 2, top: 0, bottom: 0, left: `calc(${cursorAt * 100}% - 1px)`, width: 2,
            background: settled ? 'var(--ink)' : DS.alert, borderRadius: 999,
            transition: drag != null ? 'none' : 'left .25s ease, background .3s ease' }}>
            <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
              width: drag != null ? 16 : 12, height: drag != null ? 16 : 12,
              background: settled ? 'var(--ink)' : DS.alert, borderRadius: 3,
              border: '2px solid var(--card)',
              boxShadow: canDrag ? `0 0 0 3px color-mix(in srgb, ${DS.alert} 22%, transparent)` : 'none',
              transition: 'width .15s ease, height .15s ease, background .3s ease' }} />
          </div>
        )}
      </div>

      {/* Who is off the line, and why. Without this an absence reads as a bug, or as
          having been overruled — when in fact they said this one doesn't matter to them. */}
      {quiet.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.3, color: 'var(--ink-faint)' }}>
          {quiet.map(nameOf).join(' · ')} {quiet.length > 1 ? 'have' : 'has'} no preference here
        </div>
      )}

      {/* caption + actions — only for conflict axes. Actions are named on the GROUP's
          side, never on one person's: the app must not write that Sora conceded when
          nobody touched Sora's phone. */}
      {conflict && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 130px', fontSize: 11.5, lineHeight: 1.35,
            color: settled ? 'var(--good)' : pending ? 'var(--ink)' : 'var(--ink-soft)' }}>
            {settled ? settledLine()
              : pending ? pendingLine()
                : <React.Fragment>No common ground — <b style={{ color: 'var(--ink)' }}>{nameOf(axis.outlier)}</b> leans {String(leanWord).toLowerCase()}, so this one is <b style={{ color: 'var(--ink)' }}>left out</b> of the walk. Drag the ◆ to put it back in.</React.Fragment>}
          </span>
          <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
            {settled && <AxisBtn onClick={() => onClear(axis.id)}>✓ undo</AxisBtn>}
            {/* While the cursor is under someone's finger there is nothing to accept
                yet — the spot is still moving. */}
            {pending && !axis.moving && (
              <React.Fragment>
                {/* The accept button belongs to the people the offer asks something of,
                    and to no one else. If I'm not one of them I have already got what I
                    wanted here, so there is nothing for me to confirm. */}
                {iAmAsked && <AxisBtn kind="accept" onClick={() => onAccept(axis.id)}>You accept</AxisBtn>}
                <AxisBtn onClick={() => onCounter(axis.id, asks[0])}
                  title="Hand the cursor over so they can put it somewhere else">Counter</AxisBtn>
              </React.Fragment>
            )}
            {!settled && !pending && (
              /* Two ways out, because an unsettled axis is ALREADY out of the walk (see
                 groupTarget): the app never invents a midpoint nobody chose. So the offers
                 are to put it back in somewhere, or to make the drop a real decision.
                 Which one is offered first depends on the group: a PAIR has no majority to
                 lean toward, and a midpoint between two opposite tastes is a place neither
                 asked for; with three or more the zone the others already share IS the
                 majority's, so meeting in it leans toward where most of them are. */
              <React.Fragment>
                <AxisBtn kind={pairMode ? 'primary' : undefined}
                  onClick={() => onPropose(axis.id, { how: 'drop', by: me })}
                  title="Agree to leave this dimension out of the walk">Leave it out</AxisBtn>
                <AxisBtn kind={pairMode ? undefined : 'primary'}
                  onClick={() => onPropose(axis.id, { how: 'middle', by: me })}>Meet in the middle</AxisBtn>
              </React.Fragment>
            )}
          </span>
        </div>
      )}
    </div>);
}

/* GREENERY — the dimension the bipolar rows above cannot hold.
   "Leafy street" and "Park" are two doses of the same wish, not two opposite poles, so
   there is no position to disagree FROM: nobody in the group can be recorded as wanting
   less green than someone else. That is why it has its own row and its own rule (see
   reconcileGreenery in theme.jsx): with nothing settled the strongest wish stands, and the
   buttons let the group turn that default into a real decision — including deciding to
   skip the green detour, which is the one thing the taste data alone can never say. */
function GreeneryRow({ green, me, members, memberMap, onPropose, onAccept, onClear }) {
  const t = React.useContext(ThemeCtx);
  const LABEL = { off: 'No green detour', leafy: 'Leafy street', park: 'Park' };
  const SUB = { off: 'skip it', leafy: 'a little green', park: 'a green walk' };
  const settled = !!green.applied, pending = !!green.pending;
  const iAmAsked = (green.asks || []).indexOf(me) >= 0;
  const nameOf = id => (memberMap[id] ? memberMap[id].name : 'someone');
  const namesWishing = mode => members.filter(m => green.wishes[m.id] === mode).map(m => m.name);
  const offered = pending ? green.pending.mode : null;
  const waiting = (green.asks || []).filter(id => (green.accepts || []).indexOf(id) < 0);
  return (
    <div style={{ padding: '12px 13px', borderRadius: 16, border: '1px solid var(--line)', background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Greenery</span>
        <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '3px 8px',
          color: settled ? '#fff' : 'var(--ink-soft)', background: settled ? DS.safe : 'var(--card-2)' }}>
          {settled ? '✓ agreed' : pending ? 'offer waiting' : green.idle ? 'not on the walk' : 'strongest wish'}
        </span>
      </div>
      {/* the two doses + the explicit skip. Tapping is an OFFER, like every other row. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {['leafy', 'park', 'off'].map(mode => {
          const on = (offered || green.mode) === mode;
          return (
            <button key={mode} onClick={() => onPropose(mode)}
              style={{ flex: 1, padding: '7px 6px', borderRadius: t.radiusSm, cursor: 'pointer', fontFamily: t.fontUI,
                border: '1px solid ' + (on ? 'var(--ink)' : 'var(--line)'), background: on ? 'var(--ink)' : 'var(--card)',
                color: on ? '#fff' : 'var(--ink-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 11.5 }}>{LABEL[mode]}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{SUB[mode]}</span>
            </button>
          );
        })}
      </div>
      {/* who wished for what — the row must not read as a group decision when it is only
          the loudest wish standing in for one. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 7 }}>
        {['park', 'leafy', 'off'].map(mode => {
          const who = namesWishing(mode);
          if (!who.length) return null;
          return (
            <span key={mode} style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>
              <b style={{ color: 'var(--ink)' }}>{LABEL[mode]}</b>: {who.join(', ')}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 130px', fontSize: 11.5, lineHeight: 1.35,
          color: settled ? 'var(--good)' : pending ? 'var(--ink)' : 'var(--ink-soft)' }}>
          {settled
            ? <React.Fragment>✓ Agreed: <b>{LABEL[green.mode]}</b>.</React.Fragment>
            : pending
              ? <React.Fragment><b style={{ color: 'var(--ink)' }}>{nameOf(green.turn)}</b> offers <b style={{ color: 'var(--ink)' }}>{LABEL[offered]}</b>
                  {waiting.length ? <React.Fragment> — waiting on {waiting.map(nameOf).join(', ')}.</React.Fragment> : '.'}</React.Fragment>
              : green.idle
                ? 'None of you asked for green, so the walk ignores it.'
                : <React.Fragment>Nobody here is against green, so the strongest wish stands: <b style={{ color: 'var(--ink)' }}>{LABEL[green.mode]}</b>. Tap to decide it together.</React.Fragment>}
        </span>
        <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
          {settled && <AxisBtn onClick={onClear}>✓ undo</AxisBtn>}
          {pending && iAmAsked && <AxisBtn kind="accept" onClick={onAccept}>You accept</AxisBtn>}
          {pending && !iAmAsked && <AxisBtn onClick={onClear}>withdraw</AxisBtn>}
        </span>
      </div>
    </div>
  );
}

function GroupScreen({ go }) {
  const t = React.useContext(ThemeCtx);
  // Everything on this screen is derived from persisted state (declared levels,
  // slider positions, joining friends, settlements), so one counter is enough to
  // re-read it after any change — including changes made on another screen.
  const [rev, bump] = React.useState(0);
  React.useEffect(() => {
    const on = () => bump(x => x + 1);
    window.addEventListener('seoulwalk:friends', on);
    window.addEventListener('seoulwalk:prefs', on);
    // 'seoulwalk:walk' is the other phones talking: the poll fires it whenever the
    // shared negotiation's version moves, which is what makes an offer made over
    // there appear over here.
    window.addEventListener('seoulwalk:walk', on);
    return () => {
      window.removeEventListener('seoulwalk:friends', on);
      window.removeEventListener('seoulwalk:prefs', on);
      window.removeEventListener('seoulwalk:walk', on);
    };
  }, []);

  const me = window.myMemberId();
  const gt = React.useMemo(() => window.groupTarget(), [rev]);      // eslint-disable-line react-hooks/exhaustive-deps

  // A friend has opened a walk and is waiting on me. My taste is already on the axes
  // below (so the screen isn't a negotiation I'm absent from), but it is NOT on the walk
  // until I join — so the others genuinely cannot see it yet, and I can't move the
  // bargaining either. The banner says exactly that instead of leaving it ambiguous.
  const walk = React.useMemo(
    () => (window.StudyAPI && window.StudyAPI.currentWalk && window.StudyAPI.currentWalk()) || null,
    [rev]);                                                          // eslint-disable-line react-hooks/exhaustive-deps
  const myRow = walk && walk.members.find(m => String(m.participant_id) === me);
  const invited = !!myRow && myRow.status === 'invited';
  const hostRow = walk && walk.members.find(m => m.participant_id === walk.host_id);
  const hostName = (hostRow && hostRow.display_name) || 'A friend';
  // Friends the walk has reached who haven't answered yet. On the host's phone this is
  // the honest version of "invitation sent": they are on the axes, but with no taste of
  // their own until they join, so the screen must not read as if they had agreed to it.
  const waitingToJoin = (walk ? walk.members : [])
    .filter(m => m.status === 'invited' && String(m.participant_id) !== me)
    .map(m => m.display_name || 'a friend');

  async function joinWalk(accept) {
    const S = window.StudyAPI;
    if (!S || !S.answerWalk) return;
    await S.answerWalk(accept, accept ? window.myWalkSnapshot() : null);
    bump(x => x + 1);
    if (S.logEvent) S.logEvent(accept ? 'walk_join' : 'walk_decline', { walk_id: walk && walk.walk_id });
  }

  // ---- '+ invite': add someone from right here -------------------------------------
  // The picker lists my friends who aren't on the walk yet. Inviting mid-walk goes through
  // /invite, which keeps the negotiation intact; with no shared walk yet the same tap OPENS
  // one, so "invite" means the same thing whether or not the walk has left this phone.
  const [pickOpen, setPickOpen] = React.useState(false);
  const [inviting, setInviting] = React.useState(null);       // participant_id in flight
  const onWalkIds = new Set((walk ? walk.members : [])
    .filter(m => m.status !== 'declined')
    .map(m => String(m.participant_id)));
  const invitable = React.useMemo(
    () => ((window.StudyAPI && window.StudyAPI.myFriends && window.StudyAPI.myFriends()) || [])
      .filter(f => !onWalkIds.has(String(f.participant_id))),
    [rev]);                                                          // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(f) {
    const S = window.StudyAPI || {};
    if (inviting != null) return;
    setInviting(f.participant_id);
    if (walk && !invited) await S.inviteToWalk([f.participant_id]);
    else if (!walk && S.createWalk) await S.createWalk([f.participant_id], window.myWalkSnapshot());
    setInviting(null);
    setPickOpen(false);
    bump(x => x + 1);
    if (S.logEvent) S.logEvent('walk_invite', { invited: [f.participant_id], walk_id: S.currentWalkId && S.currentWalkId() });
  }

  // Invitations to OTHER walks. The popup that announces one lasts seconds; this row is
  // where it still lives afterwards, so the choice can't be lost by looking away.
  const [otherInvites, setOtherInvites] = React.useState(
    () => (window.StudyAPI && window.StudyAPI.pendingInvites && window.StudyAPI.pendingInvites()) || []);
  React.useEffect(() => {
    const on = e => setOtherInvites((e.detail && e.detail.invites) || []);
    window.addEventListener('seoulwalk:walkinvites', on);
    return () => window.removeEventListener('seoulwalk:walkinvites', on);
  }, []);
  async function switchTo(iv) {
    const S = window.StudyAPI || {};
    if (!S.answerWalkById) return;
    await S.answerWalkById(iv.walk_id, true, window.myWalkSnapshot());
    bump(x => x + 1);
    if (S.logEvent) S.logEvent('walk_switch', { walk_id: iv.walk_id });
  }
  const soloOnly = !gt.group;                                        // nobody toggled to join yet
  // Walking solo there is no negotiation to report, but the header still shows who's
  // here — buildGroupMembers always yields at least me.
  const members = gt.members || window.buildGroupMembers();
  const memberIds = members.map(m => m.id);
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
  const pairMode = memberIds.length <= 2;
  const nameOf = id => (memberMap[id] ? memberMap[id].name : 'someone');

  // Axes nobody declared anything on ask nothing of the group, so they don't get to
  // take the same visual space as a real disagreement — they fold to the bottom.
  const allAxes = gt.axes || [];
  const liveAxes = allAxes.filter(a => !a.idle || a.applied);
  const idleAxes = allAxes.filter(a => a.idle && !a.applied);
  const openAxes = liveAxes.filter(a => a.conflict && !a.applied && !a.pending);
  const waitingAxes = liveAxes.filter(a => a.pending);
  // Greenery can't be a disagreement (nobody can be against it), so an unsettled one is
  // never counted as one — but an OFFER on it is waiting on somebody, like any other.
  const green = gt.green || null;
  const greenWaiting = green && green.pending ? 1 : 0;
  const unresolved = openAxes.length + waitingAxes.length + greenWaiting;

  // No street list here on purpose. This screen is the negotiation; ranking streets
  // while the group is still bargaining answers a question nobody has asked yet, and it
  // showed a top-6 that changed under every tap. The streets AND the walks that join
  // them are computed once, when 'Find our spot' is pressed — see findOurSpot below.

  // Someone dragging a cursor on another phone is the one state that goes stale on its
  // own: it is true until a later poll says otherwise, and if that phone never speaks
  // again (locked, closed, out of signal) no event will ever arrive to re-render this
  // screen. settlementMoving() stops trusting the flag after a few seconds — but only a
  // render can show that, so while anything reads as moving we tick until it doesn't.
  const anyMoving = liveAxes.some(a => a.moving);
  React.useEffect(() => {
    if (!anyMoving) return;
    const timer = setInterval(() => bump(x => x + 1), 1000);
    return () => clearInterval(timer);
  }, [anyMoving]);

  // A trade needs two disagreements still on the table.
  const trade = React.useMemo(
    () => (gt.axes ? window.proposeTrade(gt.axes, memberIds) : null), [rev]);   // eslint-disable-line react-hooks/exhaustive-deps
  const axisLabel = id => { const a = allAxes.find(x => x.id === id); return a ? `${a.left} ↔ ${a.right}` : id; };
  const poleFor = (axisId, memberId) => {
    const a = allAxes.find(x => x.id === axisId);
    if (!a) return '';
    const r = a.ranges[memberId] || [0, 1];
    return (r[0] + r[1]) / 2 >= 0.5 ? a.right : a.left;
  };

  function propose(axisId, s) {
    window.setSettlement(axisId, s);
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_propose', { axis: axisId, how: s.how, by: s.by, value: s.value });
  }
  function accept(axisId) {
    const asked = (window.readSettlements()[axisId] || {});
    window.acceptSettlement(axisId, me);          // MY acceptance only
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_accept', { axis: axisId, how: asked.how, by: asked.by });
  }
  // Dragging pushes the position out live (theme.jsx throttles it) and deliberately does
  // NOT bump: my own cursor is already drawn from the local drag state, and re-rendering
  // the whole screen on every frame of a drag would fight the gesture.
  function moveCursor(axisId, value) { window.moveSettlement(axisId, value, me); }
  function counter(axisId, asks) {
    window.counterSettlement(axisId, asks);
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_counter', { axis: axisId, turn: asks });
  }
  function clear(axisId) {
    window.clearSettlement(axisId);
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_unsettle', { axis: axisId });
  }
  // Greenery rides the SAME settlement document as the axes ('green' key, mode instead of
  // a position), so it reaches the other phones through the walk with no extra plumbing.
  function proposeGreen(mode) {
    window.setSettlement('green', { how: 'green', mode: mode, by: me });
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_propose', { axis: 'green', how: 'green', mode: mode, by: me });
  }
  function acceptGreen() {
    window.acceptSettlement('green', me);
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_accept', { axis: 'green', how: 'green' });
  }
  function clearGreen() {
    window.clearSettlement('green');
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_unsettle', { axis: 'green' });
  }
  // 'Find our spot' — the one moment anything is computed from the negotiation. It hands
  // the map an INTENT rather than a result: the map owns the street scores, the walk
  // network and the departure node, so it re-reads groupTarget() itself and there is no
  // second, staler copy of the group's target travelling between screens. A plain window
  // global (not localStorage) on purpose — the intent must die with a page reload, or
  // reopening the app on the map screen would rebuild walks nobody asked for.
  function findOurSpot() {
    window.SeoulMapIntent = { kind: 'group-walk', at: Date.now() };
    if (window.StudyAPI && window.StudyAPI.logEvent) {
      window.StudyAPI.logEvent('group_find_spot', {
        walk_id: (window.StudyAPI.currentWalkId && window.StudyAPI.currentWalkId()) || null,
        members: memberIds.length, unresolved,
      });
    }
    go('map2');
  }

  function offerTrade() {
    if (!trade) return;
    const deal = 'd' + trade[0].axis + '_' + trade[1].axis;
    trade.forEach(part => window.setSettlement(part.axis,
      { how: 'trade', winner: part.winner, other: part.other, deal, by: me, status: 'proposed' }));
    bump(x => x + 1);
    if (window.StudyAPI) window.StudyAPI.logEvent('group_propose_trade', { deal, parts: trade });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 22px 18px', minHeight: 0 }}>
      <Label>Pre-walk · group merge</Label>
      <h1 style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, letterSpacing: t.headTrack, fontSize: 26, lineHeight: 1.08, margin: '8px 0 16px', color: 'var(--ink)' }}>Tonight's group</h1>

      {/* avatars + invite */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {members.map((p) =>
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ opacity: p.pendingJoin ? 0.55 : 1 }}><Avatar p={p} size={46} /></div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{p.name}</span>
            {/* Someone who hasn't answered is drawn faded and labelled, so the avatars
                never imply a taste the walk hasn't actually got yet. */}
            {p.pendingJoin && (
              <span style={{ fontFamily: t.fontMono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {p.isMe ? 'not joined' : 'invited'}
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPickOpen(o => !o)} title="Invite a friend onto this walk"
            style={{ width: 46, height: 46, borderRadius: '50%', border: `1.5px dashed ${pickOpen ? DS.friends : 'var(--line-strong)'}`, background: 'transparent', color: pickOpen ? DS.friends : 'var(--ink-faint)', fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', fontWeight: 600 }}>invite</span>
        </div>
      </div>

      {/* the picker: my friends who aren't on this walk, one tap each */}
      {pickOpen && (
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16, border: `1.5px solid ${DS.friends}55`,
          background: `color-mix(in srgb, ${DS.friends} 6%, var(--card))` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
            <span style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {invited ? 'Join first, then you can invite' : walk ? 'Add to this walk' : 'Start a walk with'}
            </span>
            <button onClick={() => setPickOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-faint)' }}>close</button>
          </div>
          {invited ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
              You haven't joined this walk yet, so you can't bring anyone onto it — tap <b style={{ color: 'var(--ink)' }}>Join the walk</b> first.
            </div>
          ) : invitable.length === 0 ? (
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
              Everyone you know is already here. Add friends by code from your <button onClick={() => go('profile')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: 'var(--ink)', textDecoration: 'underline' }}>profile</button>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {invitable.map(f => {
                const name = f.display_name || f.friend_code || 'friend';
                const busy = inviting === f.participant_id;
                return (
                  <div key={f.participant_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 999, flex: '0 0 auto', background: 'var(--card-2)',
                      border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: t.fontMono, fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)' }}>
                      {window.tasteInitials(name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                    <AxisBtn kind="primary" onClick={() => invite(f)}>{busy ? 'inviting…' : 'invite'}</AxisBtn>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* someone else wants me on THEIR walk — the popup's offer, kept where it can be found */}
      {otherInvites.map(iv => (
        <div key={iv.walk_id} style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16,
          border: `1.5px solid ${DS.alert}`, background: `color-mix(in srgb, ${DS.alert} 8%, var(--card))`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 150px', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
            <b style={{ color: 'var(--ink)' }}>{iv.host_name || 'A friend'}</b> wants you on their walk instead
            {iv.member_count > 1 ? ` (${iv.member_count} people on it)` : ''} — joining leaves this one.
          </span>
          <AxisBtn kind="accept" onClick={() => switchTo(iv)}>Join theirs</AxisBtn>
        </div>
      ))}

      {invited && (
        <div style={{ marginTop: 16, padding: '13px 15px', borderRadius: 16,
          border: `1.5px solid ${DS.alert}`, background: `color-mix(in srgb, ${DS.alert} 8%, var(--card))` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 5 }}>
            {hostName} started a walk with you
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-soft)', marginBottom: 10 }}>
            Your taste is on the axes below so you can see what this walk looks like — but
            it isn't on the walk yet, so {hostName} can't see it, and you can't settle
            anything until you join.
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <AxisBtn kind="accept" onClick={() => joinWalk(true)}>Join the walk</AxisBtn>
            <AxisBtn onClick={() => joinWalk(false)}>Not now</AxisBtn>
          </div>
        </div>
      )}

      {!invited && waitingToJoin.length > 0 && (
        <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 14,
          border: '1px solid var(--line-strong)', background: 'var(--card)' }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
            This walk is on <b style={{ color: 'var(--ink)' }}>{waitingToJoin.join(', ')}</b>'s
            {waitingToJoin.length > 1 ? ' phones' : ' phone'} too — these same axes. Their taste
            joins the negotiation when they tap <b style={{ color: 'var(--ink)' }}>Join the walk</b>.
          </div>
        </div>
      )}

      {soloOnly ? (
        /* nobody toggled to join → send them to the profile to pick the crew */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 24 }}>
          <div style={{ fontFamily: t.fontHead, fontWeight: t.headWeight, fontSize: 22, color: 'var(--ink)' }}>No one on the walk yet</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: 260 }}>
            Add friends by code, then toggle who's coming — this screen blends everyone's taste and shows where you all agree.
          </div>
          <button onClick={() => go('profile')} style={{ border: 'none', background: DS.solo, color: '#fff', borderRadius: 999, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: t.fontUI }}>Pick who's coming →</button>
        </div>
      ) : (
        <React.Fragment>
          {/* merge status. The badge counts DISAGREEMENTS, not steps, and the line
              below says plainly what happens to the ones left open. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 6 }}>
            <Label>Where your tastes overlap</Label>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap',
              color: unresolved === 0 ? DS.ink : '#fff',
              background: unresolved === 0 ? DS.safe : DS.alert }}>
              {unresolved === 0 ? 'All agreed ✓'
                : `${unresolved} disagreement${unresolved > 1 ? 's' : ''}`}
            </span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
            {unresolved === 0
              ? 'Every dimension has a zone you all hold. The walk is built from those zones.'
              : <React.Fragment>
                  {waitingAxes.length > 0 && <React.Fragment><b style={{ color: 'var(--ink)' }}>{waitingAxes.length} offer{waitingAxes.length > 1 ? 's' : ''} waiting to be accepted</b> — an offer changes nothing until it is. </React.Fragment>}
                  Go anyway and the {unresolved === 1 ? 'unsettled one is' : `${unresolved} unsettled ones are`} <b style={{ color: 'var(--ink)' }}>left out</b> of the walk:
                  the streets are ranked on what you agreed, not on a middle nobody chose.
                </React.Fragment>}
          </p>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, margin: '0 -2px', padding: '2px 2px 0' }}>
            {liveAxes.map((a) => <AxisRow key={a.id} axis={a} me={me} memberIds={memberIds} memberMap={memberMap}
              pairMode={pairMode} onPropose={propose} onMove={moveCursor}
              onAccept={accept} onCounter={counter} onClear={clear} />)}

            {/* the single-pole dimension, with the two doses the map offers */}
            {green && <GreeneryRow green={green} me={me} members={members} memberMap={memberMap}
              onPropose={proposeGreen} onAccept={acceptGreen} onClear={clearGreen} />}

            {liveAxes.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                None of you has declared a preference yet — the walk is wide open. Set some in your profile to shape it.
              </div>
            )}

            {/* Trade: swap two disagreements instead of watering both down. Each side
                gets one dimension exactly their way and gives up the other. */}
            {trade && (
              <div style={{ padding: '13px 15px', borderRadius: 16, border: `1.5px solid ${DS.friends}55`,
                background: `color-mix(in srgb, ${DS.friends} 7%, var(--card))` }}>
                <div style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'var(--ink-faint)', marginBottom: 7 }}>Or trade instead of compromising</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 10 }}>
                  <b style={{ color: 'var(--ink)' }}>{nameOf(trade[0].winner)}</b> takes <b style={{ color: 'var(--ink)' }}>{poleFor(trade[0].axis, trade[0].winner)}</b> ({axisLabel(trade[0].axis)}),
                  {' '}<b style={{ color: 'var(--ink)' }}>{nameOf(trade[1].winner)}</b> takes <b style={{ color: 'var(--ink)' }}>{poleFor(trade[1].axis, trade[1].winner)}</b> ({axisLabel(trade[1].axis)}).
                  {' '}Each of you gets one exactly your way, and gives up the other — instead of both being watered down.
                </div>
                <AxisBtn kind="primary" onClick={offerTrade}>Propose this trade</AxisBtn>
              </div>
            )}

            {/* axes nobody cares about — present, but folded and quiet */}
            {idleAxes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 2 }}>
                <span style={{ fontFamily: t.fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Doesn't matter to any of you</span>
                {idleAxes.map(a => (
                  <span key={a.id} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)',
                    border: '1px dashed var(--line-strong)', borderRadius: 999, padding: '4px 10px' }}>{a.left} ↔ {a.right}</span>
                ))}
              </div>
            )}

            {/* legend of who's who + what the marker means */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 2 }}>
              {members.map((p) =>
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                  <span style={{ width: 14, height: 4, borderRadius: 999, background: p.hue }} /> {p.name}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, transform: 'rotate(45deg)', borderRadius: 2, background: DS.alert }} /> drag to choose the spot
              </span>
            </div>

          </div>

          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {unresolved > 0 && (
              <span style={{ fontSize: 11, textAlign: 'center', color: 'var(--ink-faint)', lineHeight: 1.35 }}>
                Leaves {unresolved} disagreement{unresolved > 1 ? 's' : ''} unsettled · you can come back and settle {unresolved > 1 ? 'them' : 'it'} while walking
              </span>
            )}
            <PrimaryBtn onClick={findOurSpot}>{unresolved === 0 ? 'Find our spot' : 'Find our spot anyway'}</PrimaryBtn>
          </div>
        </React.Fragment>
      )}
    </div>);
}

Object.assign(window, { GroupScreen });

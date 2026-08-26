/* ============================================================
   StudyAPI — telemetry client for the user study.

   Loaded before the JSX (like swipe-data.js) so window.StudyAPI exists for
   every screen. ALL logging is fire-and-forget: a failed request just warns in
   the console, it never throws into the app UI. Session-scoped calls are no-ops
   (with a console warning) until a session has been started.

   Config can be overridden at deploy time by defining window.STUDY_CONFIG
   BEFORE this script runs, e.g.
     <script>window.STUDY_CONFIG = { baseUrl:'https://api.example.com', studyKey:'…' }</script>
   ============================================================ */
(function () {
  var cfg = window.STUDY_CONFIG || {};
  var BASE_URL = cfg.baseUrl || 'http://localhost:8000';
  var STUDY_KEY = cfg.studyKey || 'dev-study-key-change-me';

  // localStorage slot holding { session_id, participant_id, code }
  var SS_KEY = 'seoulwalk.study.session';

  // slider id -> canonical axis (mirrors AXIS_TO_SLIDER in theme.jsx). Kept here
  // so the one-line call sites can pass the slider id they already have.
  var SLIDER_TO_AXIS = {
    crowd: 'touristy_local', era: 'historic_contemporary', finish: 'raw_polished',
    energy: 'quiet_lively', origin: 'local_chain', green: 'park'
  };

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SS_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(s) { try { localStorage.setItem(SS_KEY, JSON.stringify(s)); } catch (e) {} }

  var session = loadSession();

  function headers() { return { 'Content-Type': 'application/json', 'X-Study-Key': STUDY_KEY }; }

  function post(path, body) {
    return fetch(BASE_URL + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) { console.warn('[StudyAPI] ' + path + ' -> HTTP ' + r.status); return null; }
        return r.json().catch(function () { return null; });
      })
      .catch(function (e) { console.warn('[StudyAPI] ' + path + ' failed', e); return null; });
  }

  function sid() { return session && session.session_id; }

  // POST to a /sessions/{id}/... route; drop (warn) if no session yet.
  function scoped(path, body) {
    if (!sid()) { console.warn('[StudyAPI] no session yet, dropping ' + path); return Promise.resolve(null); }
    return post('/sessions/' + sid() + path, body);
  }

  // --- session lifecycle ---
  function startSession(opts) {
    opts = opts || {};
    return post('/sessions', {
      code: opts.code,
      display_name: opts.displayName || null,
      mode: opts.mode || 'solo',
      group_code: opts.groupCode || null,
      consented: !!opts.consented,
      app_version: cfg.appVersion || null,
      user_agent: navigator.userAgent
    }).then(function (res) {
      if (res && res.session_id) {
        session = {
          session_id: res.session_id, participant_id: res.participant_id,
          code: opts.code, display_name: res.display_name || opts.displayName || opts.code,
          friend_code: res.friend_code || null
        };
        saveSession(session);
        // seed the known-friends set so only friends added AFTER now will toast
        seedFriends(res.friends || []);
      }
      return res;
    });
  }
  function endSession() { return sid() ? scoped('/end', {}) : Promise.resolve(null); }
  function resetSession() { session = null; try { localStorage.removeItem(SS_KEY); } catch (e) {} }
  function hasSession() { return !!sid(); }
  function currentCode() { return session && session.code; }
  function currentDisplayName() { return (session && (session.display_name || session.code)) || null; }
  function myFriendCode() { return (session && session.friend_code) || null; }

  // --- friends ---
  // Friendship is mutual server-side, so when someone enters MY code I become their
  // friend without my app knowing. We poll the friends list and, on any friend that
  // appeared since we last looked, fire a 'seoulwalk:friends' event carrying the
  // newcomers in `added` — the UI turns that into a "X added you" toast. `known` is
  // persisted so a reload (or an add I initiated myself) never re-toasts.
  var FRIENDS_KNOWN_KEY = 'seoulwalk.friends.known';
  var FRIENDS_LIST_KEY = 'seoulwalk.friends.list';
  // Persisted so myFriends() (used by the group-taste merge on the map) has the
  // last-known friends immediately after a reload, before the first poll returns.
  var friendsCache = (function () {
    try { return JSON.parse(localStorage.getItem(FRIENDS_LIST_KEY) || '[]'); } catch (e) { return []; }
  })();
  var friendPollTimer = null;

  function friendIds(list) { return (list || []).map(function (f) { return f.participant_id; }); }
  function loadKnown() {
    try { return new Set(JSON.parse(localStorage.getItem(FRIENDS_KNOWN_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function saveKnown(set) {
    try { localStorage.setItem(FRIENDS_KNOWN_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function emitFriends(list, added) {
    friendsCache = list || [];
    try { localStorage.setItem(FRIENDS_LIST_KEY, JSON.stringify(friendsCache)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('seoulwalk:friends', { detail: { friends: friendsCache, added: added || [] } })); } catch (e) {}
  }
  function myFriends() { return friendsCache.slice(); }

  // Seed the known set silently (no toast) from a list — used at session start so
  // existing friends never announce themselves.
  function seedFriends(list) {
    list = list || [];
    saveKnown(new Set(friendIds(list)));
    emitFriends(list, []);
  }

  // GET the friends list, diff against `known`, toast the newcomers, cache + persist.
  function refreshFriends() {
    if (!sid()) return Promise.resolve([]);
    return fetch(BASE_URL + '/sessions/' + sid() + '/friends', { headers: headers() })
      .then(function (r) { return r.ok ? r.json().catch(function () { return null; }) : null; })
      .then(function (r) {
        var list = (r && r.friends) || [];
        var known = loadKnown();
        var added = list.filter(function (f) { return !known.has(f.participant_id); });
        saveKnown(new Set(friendIds(list)));
        emitFriends(list, added);
        return list;
      })
      .catch(function (e) { console.warn('[StudyAPI] refreshFriends failed', e); return friendsCache; });
  }

  // Repeated-search nudge: a friend hitting the same category twice should pop a
  // toast on MY screen. We poll /friends/activity, remember the highest count we
  // have already shown per (friend, query), and only fire 'seoulwalk:friendsearch'
  // for buckets whose count has grown since. The FIRST poll after launch only
  // "primes" this memory (records counts, shows nothing) so stale history from
  // before the app opened never bursts a wall of toasts.
  var ACTIVITY_SEEN_KEY = 'seoulwalk.friends.activity.seen';
  var activityPrimed = false;
  function loadActivitySeen() {
    try { return JSON.parse(localStorage.getItem(ACTIVITY_SEEN_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveActivitySeen(m) {
    try { localStorage.setItem(ACTIVITY_SEEN_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function refreshFriendActivity() {
    if (!sid()) return Promise.resolve([]);
    return fetch(BASE_URL + '/sessions/' + sid() + '/friends/activity', { headers: headers() })
      .then(function (r) { return r.ok ? r.json().catch(function () { return null; }) : null; })
      .then(function (r) {
        var rows = (r && r.activity) || [];
        var seen = loadActivitySeen();
        var fresh = [];
        rows.forEach(function (row) {
          var key = row.participant_id + '|' + row.query;
          var prev = seen[key] || 0;
          // Prime silently on the first poll; afterwards only newly-grown counts pop.
          if (activityPrimed && row.count > prev) fresh.push(row);
          if (row.count > prev) seen[key] = row.count;
        });
        saveActivitySeen(seen);
        activityPrimed = true;
        if (fresh.length) {
          try { window.dispatchEvent(new CustomEvent('seoulwalk:friendsearch', { detail: { searches: fresh } })); } catch (e) {}
        }
        return rows;
      })
      .catch(function (e) { console.warn('[StudyAPI] refreshFriendActivity failed', e); return []; });
  }

  // --- shared favorites (streets shared with / by friends) ------------------
  // A participant explicitly shares a favourited street; their friends then see it
  // on their own map + profile. Mirrors the friends cache: the last-known list is
  // persisted so it's available immediately after a reload, and a poll refresh
  // fires 'seoulwalk:friendfavorites' with the fresh list for any mounted screen.
  var FRIEND_FAVS_KEY = 'seoulwalk.friends.favorites';
  var friendFavsCache = (function () {
    try { return JSON.parse(localStorage.getItem(FRIEND_FAVS_KEY) || '[]'); } catch (e) { return []; }
  })();
  function myFriendFavorites() { return friendFavsCache.slice(); }
  function emitFriendFavs(list) {
    friendFavsCache = list || [];
    try { localStorage.setItem(FRIEND_FAVS_KEY, JSON.stringify(friendFavsCache)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('seoulwalk:friendfavorites', { detail: { favorites: friendFavsCache } })); } catch (e) {}
  }

  // Push a street I favourited out to my friends. Fire-and-forget.
  function shareFavorite(fav) {
    fav = fav || {};
    return scoped('/favorites', {
      street_name: fav.name || fav.street_name || null,
      edge_id: fav.edge_id || null,
      note: fav.note || fav.sub || null
    });
  }
  // Stop sharing a street (DELETE carries the name in the body).
  function unshareFavorite(name) {
    if (!sid()) { console.warn('[StudyAPI] no session yet, dropping unshareFavorite'); return Promise.resolve(null); }
    return fetch(BASE_URL + '/sessions/' + sid() + '/favorites', {
      method: 'DELETE', headers: headers(), body: JSON.stringify({ street_name: name })
    }).then(function (r) {
      if (!r.ok) { console.warn('[StudyAPI] DELETE /favorites -> HTTP ' + r.status); return null; }
      return r.json().catch(function () { return null; });
    }).catch(function (e) { console.warn('[StudyAPI] unshareFavorite failed', e); return null; });
  }

  // GET the streets my friends have shared, cache + persist, and broadcast them.
  function refreshFriendFavorites() {
    if (!sid()) return Promise.resolve([]);
    return fetch(BASE_URL + '/sessions/' + sid() + '/friends/favorites', { headers: headers() })
      .then(function (r) { return r.ok ? r.json().catch(function () { return null; }) : null; })
      .then(function (r) {
        var list = (r && r.favorites) || [];
        emitFriendFavs(list);
        return list;
      })
      .catch(function (e) { console.warn('[StudyAPI] refreshFriendFavorites failed', e); return friendFavsCache; });
  }

  // --- shared walk (friends mode) -------------------------------------------
  // The negotiation is one jsonb document on the server plus a `version` counter.
  // Every phone polls GET /walks/current; when the version has moved we mirror the
  // document into localStorage (where the synchronous group-taste code reads it) and
  // fire 'seoulwalk:walk' so any mounted screen re-renders. Writes go out as patches
  // carrying the version we last saw, so two phones editing at once is detected.
  var WALK_KEY = 'seoulwalk.walk.current';
  var walkCache = (function () {
    try { return JSON.parse(localStorage.getItem(WALK_KEY) || 'null'); } catch (e) { return null; }
  })();
  var walkPollTimer = null;

  function myParticipantId() { return session && session.participant_id; }
  function currentWalk() { return walkCache; }
  function currentWalkId() { return walkCache && walkCache.walk_id; }

  // Publish a freshly-read walk. The negotiation document is copied into the same
  // localStorage key the group screen and the map already read (group.settle), so the
  // synchronous window.groupTarget() path needs no rewrite to become multi-device.
  function emitWalk(walk) {
    var prev = walkCache;
    walkCache = walk || null;
    try {
      if (walkCache) localStorage.setItem(WALK_KEY, JSON.stringify(walkCache));
      else localStorage.removeItem(WALK_KEY);
      if (walkCache && walkCache.state) {
        localStorage.setItem('seoulwalk.group.settle', JSON.stringify(walkCache.state));
      }
    } catch (e) {}
    // Someone is dragging a cursor: run the loop fast for a moment so their movement
    // arrives as movement rather than as a jump.
    if (walkIsMoving(walkCache)) walkFastUntil = Date.now() + WALK_LIVE_FOR;
    // Keep the picked route in step with whatever walk we just published, before the
    // 'seoulwalk:walk' listeners run — a screen re-rendering on that event should not read
    // a route that belongs to the previous walk.
    syncWalkRoute(walkCache);
    var changed = !prev !== !walkCache
      || (prev && walkCache && (prev.version !== walkCache.version
        || prev.status !== walkCache.status
        || prev.route_at !== walkCache.route_at
        || JSON.stringify(prev.members) !== JSON.stringify(walkCache.members)));
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('seoulwalk:walk', { detail: { walk: walkCache, previous: prev } })); } catch (e) {}
    }
    return walkCache;
  }

  // Invitations to walks OTHER than the one I'm on. The server keeps them out of `walk`
  // on purpose (an invitation must not swap a negotiation under the group's feet), so
  // they travel beside it and the UI turns them into a "join theirs instead?" offer.
  // 'seoulwalk:walkinvites' carries BOTH the full list (for a screen that wants to show
  // it) and `fresh` — the ones never announced yet, which is what a one-shot popup needs:
  // the poll runs every 2.5 s and re-toasting the same invitation would be unusable.
  var INVITES_SEEN_KEY = 'seoulwalk.walk.invites.seen';
  var invitesCache = [];
  function loadInvitesSeen() {
    try { return JSON.parse(localStorage.getItem(INVITES_SEEN_KEY) || '[]'); } catch (e) { return []; }
  }
  function pendingInvites() { return invitesCache.slice(); }
  function emitInvites(list) {
    list = list || [];
    var seen = loadInvitesSeen();
    var ids = list.map(function (i) { return i.walk_id; });
    var fresh = list.filter(function (i) { return seen.indexOf(i.walk_id) < 0; });
    var was = invitesCache.map(function (i) { return i.walk_id; });
    invitesCache = list;
    // Only LIVE invitations stay remembered, so one that ends and is offered again later
    // can announce itself a second time, and the memory can't grow without bound.
    try { localStorage.setItem(INVITES_SEEN_KEY, JSON.stringify(ids)); } catch (e) {}
    // Fire on any change, not only on arrivals: an invitation that goes away (accepted
    // elsewhere, or the walk ended) has to leave the screens that were showing it.
    if (fresh.length || ids.join(',') !== was.join(',')) {
      try {
        window.dispatchEvent(new CustomEvent('seoulwalk:walkinvites', {
          detail: { invites: invitesCache, fresh: fresh }
        }));
      } catch (e) {}
    }
    return invitesCache;
  }

  // --- the leader's picked route --------------------------------------------
  // Only the HOST picks; every other phone draws the same walk. The poll carries a token
  // (`route_at`) and a small summary, never the geometry — a few dozen KB of coordinates
  // in a payload fetched every 2.5 s by every phone would be paid for again and again for
  // a document that changes once. So when the token moves we fetch the route once and
  // cache it here, which also lets a screen mounted LATER draw the current pick instead of
  // waiting for the next one.
  var walkRouteCache = null;     // { walk_id, at, by, mine, summary, route }
  var walkRouteFetching = null;  // token being fetched, so a slow poll can't stampede
  function currentWalkRoute() { return walkRouteCache; }
  function emitWalkRoute(entry) {
    walkRouteCache = entry;
    try { window.dispatchEvent(new CustomEvent('seoulwalk:walkroute', { detail: entry })); } catch (e) {}
    return entry;
  }
  function fetchWalkRoute(walkId) {
    if (!sid()) return Promise.resolve(null);
    return fetch(BASE_URL + '/sessions/' + sid() + '/walks/' + walkId + '/route', { headers: headers() })
      .then(function (r) { return r.ok ? r.json().catch(function () { return null; }) : null; })
      .catch(function (e) { console.warn('[StudyAPI] fetchWalkRoute failed', e); return null; });
  }
  // The change token, compared as an INSTANT rather than as a string. The same
  // timestamp reaches this file through two routes that serialise it differently —
  // the walk carries it through a pydantic model ('...Z'), GET /route hands back the
  // raw column ('...+00:00') — so a byte comparison of the two never matched. Every
  // poll then looked like a brand new pick: the follower's map refetched the route,
  // re-drew it, re-framed the camera and re-opened the steps sheet every 2.5 s, which
  // is why only the phones that did NOT publish the route could not read the map.
  function routeStamp(v) {
    if (v == null) return null;
    var t = Date.parse(v);
    return isNaN(t) ? String(v) : t;
  }
  function sameRouteStamp(a, b) { return routeStamp(a) === routeStamp(b); }

  // Reconcile the cache with a freshly-read walk. Called from emitWalk, so every path that
  // publishes a walk keeps the route in step with it.
  function syncWalkRoute(w) {
    if (!w) { if (walkRouteCache) emitWalkRoute(null); return; }
    var at = w.route_at || null;
    if (walkRouteCache && walkRouteCache.walk_id === w.walk_id && sameRouteStamp(walkRouteCache.at, at)) return;
    if (!at) { if (walkRouteCache) emitWalkRoute(null); return; }   // the pick was cleared
    var mine = w.route_by != null && w.route_by === myParticipantId();
    if (mine) {
      // I published it, so the geometry is already on my screen — don't download my own
      // route back. The token is still recorded, so the NEXT pick reads as a change.
      walkRouteCache = { walk_id: w.walk_id, at: at, by: w.route_by, mine: true,
        summary: w.route_summary || null, route: (walkRouteCache && walkRouteCache.route) || null };
      return;
    }
    if (walkRouteFetching === at) return;
    walkRouteFetching = at;
    fetchWalkRoute(w.walk_id).then(function (r) {
      walkRouteFetching = null;
      if (!r || !r.route) return;
      // Cache the token the POLL will keep handing us (w.route_at), never the one the
      // route payload came back with: the next tick compares against the walk, so the
      // cache has to speak the walk's language or it can never report "no change".
      emitWalkRoute({ walk_id: w.walk_id, at: at, by: r.by, mine: false,
        summary: r.summary || w.route_summary || null, route: r.route });
    }, function () { walkRouteFetching = null; });
  }

  // Publish the option the leader tapped. Rejected server-side for anyone but the host.
  function publishWalkRoute(route, summary) {
    var wid = currentWalkId();
    if (!wid) return Promise.resolve(null);
    return scoped('/walks/' + wid + '/route', { route: route || null, summary: summary || null })
      .then(function (w) {
        if (!w || !w.walk_id) return null;
        // Seed the cache with the geometry I already have, so syncWalkRoute doesn't fetch
        // my own pick back when the walk comes round.
        walkRouteCache = { walk_id: w.walk_id, at: w.route_at, by: w.route_by, mine: true,
          summary: w.route_summary || summary || null, route: route || null };
        return emitWalk(w);
      });
  }

  function refreshWalk() {
    if (!sid()) return Promise.resolve(null);
    return fetch(BASE_URL + '/sessions/' + sid() + '/walks/current', { headers: headers() })
      .then(function (r) { return r.ok ? r.json().catch(function () { return null; }) : null; })
      .then(function (r) {
        // Invitations first: emitWalk can move the screen, and it should move with the
        // popup's list already up to date.
        if (r) emitInvites(r.invites);
        return emitWalk(r && r.walk);
      })
      .catch(function (e) { console.warn('[StudyAPI] refreshWalk failed', e); return walkCache; });
  }

  // Invite friends to the walk already under way (the group screen's '+'). Unlike
  // createWalk this keeps the negotiation: a latecomer joins the bargaining as it stands.
  function inviteToWalk(ids) {
    var wid = currentWalkId();
    if (!wid) return Promise.resolve(null);
    return scoped('/walks/' + wid + '/invite', { invite: (ids || []).map(Number) })
      .then(function (w) { return w && w.walk_id ? emitWalk(w) : null; });
  }

  // Open a walk and invite friends. `snapshot` is { vector, levels } — the host's
  // taste frozen at this moment, which is what the negotiation runs on.
  function createWalk(inviteIds, snapshot) {
    snapshot = snapshot || {};
    return scoped('/walks', {
      invite: (inviteIds || []).map(Number),
      vector: snapshot.vector || null, levels: snapshot.levels || null
    }).then(function (w) { return w && w.walk_id ? emitWalk(w) : null; });
  }

  function answerWalk(accept, snapshot) {
    return answerWalkById(currentWalkId(), accept, snapshot);
  }

  // Answer a walk by id — needed because the walk being answered is not always the
  // current one: accepting an invitation from the popup means saying yes to a DIFFERENT
  // walk, and the server then makes that one current (and drops me from the old one), so
  // we re-read rather than trust the answer's own payload to be the new truth.
  function answerWalkById(wid, accept, snapshot) {
    if (!wid) return Promise.resolve(null);
    snapshot = snapshot || {};
    return scoped('/walks/' + wid + '/answer', {
      accept: !!accept, vector: snapshot.vector || null, levels: snapshot.levels || null
    }).then(function (w) {
      if (!w || !w.walk_id) return null;
      if (accept && w.walk_id !== currentWalkId()) return refreshWalk();
      return emitWalk(w);
    });
  }

  function setWalkStatus(status) {
    var wid = currentWalkId();
    if (!wid) return Promise.resolve(null);
    return scoped('/walks/' + wid + '/status', { status: status })
      .then(function (w) { return w && w.walk_id ? emitWalk(w) : null; });
  }

  // Push a change to the negotiation: { axis: settlement } to set, { axis: null } to
  // clear. On a version conflict the server hands back the current walk, which we
  // adopt — the other phone got there first, and re-rendering from the truth beats
  // retrying a patch built on a stale view.
  //
  // But adopting it is only half the answer, and `meta.rebuild` is the other half: on its
  // own, taking their document also THREW AWAY the tap that produced this patch, with
  // nothing on screen to say so. That is how an "accept"
  // could disappear: two phones bargaining at once means version clashes are the normal
  // case, not the rare one, and every clash silently un-did somebody's tap. So a caller
  // may hand over a function that re-applies its intent on top of whatever we just
  // adopted; we resend that, once, against the fresh version.
  var WALK_PATCH_RETRIES = 2;
  function patchWalkState(patch, meta) {
    var wid = currentWalkId();
    if (!wid) return Promise.resolve(null);
    meta = meta || {};
    function attempt(p, left) {
      var base = walkCache ? walkCache.version : null;
      return scoped('/walks/' + wid + '/state', {
        patch: p, base_version: base, action: meta.action || null, axis: meta.axis || null
      }).then(function (res) {
        if (!res) return null;
        if (res.conflict && res.walk) {
          emitWalk(res.walk);
          if (left > 0 && typeof meta.rebuild === 'function') {
            var next = meta.rebuild();
            if (next) return attempt(next, left - 1);
          }
          return walkCache;
        }
        if (res.version != null && walkCache) {
          emitWalk(Object.assign({}, walkCache, { version: res.version, state: res.state || {} }));
        }
        return walkCache;
      });
    }
    return attempt(patch, WALK_PATCH_RETRIES);
  }

  // Adaptive cadence. A negotiation sitting still needs a slow heartbeat, but a cursor
  // being DRAGGED on the other phone has to arrive while it is still moving — at 2.5 s
  // "live" would read as a slideshow. So whenever a poll brings back a settlement someone
  // has their finger on, the loop speeds up for a couple of seconds and then settles
  // back. Self-scheduling rather than setInterval, because the delay changes.
  var WALK_POLL_IDLE = 2500, WALK_POLL_LIVE = 600, WALK_LIVE_FOR = 2500;
  var walkIdleMs = WALK_POLL_IDLE, walkFastUntil = 0;
  var walkInFlight = false, walkLastAt = 0;

  // Only a LIVE drag earns the fast cadence. The flag is written by the phone doing the
  // dragging and refreshed four times a second, so one that has stopped being refreshed
  // belongs to a phone that went away mid-gesture — and honouring it would leave every
  // other phone polling four times a second for the rest of the walk. Same window as
  // settlementMoving() in theme.jsx, which is what the screens read.
  var MOVE_STALE_MS = 6000;
  function walkIsMoving(w) {
    if (!w || !w.state) return false;
    var now = Date.now();
    return Object.keys(w.state).some(function (k) {
      var s = w.state[k];
      return !!(s && s.moving && s.movedAt && (now - s.movedAt) < MOVE_STALE_MS);
    });
  }

  // A fixed heartbeat that decides on each beat whether it is time to fetch. The
  // obvious shape -- chain the next timer off the previous response -- dies for good the
  // moment one request hangs, and a phone whose tab gets backgrounded does exactly that:
  // the fetch is parked, nothing re-arms, and the negotiation silently stops updating
  // until something else pokes the page. Here the ticker is independent of the network,
  // and `walkInFlight` is what prevents pile-ups.
  function walkPollTick() {
    var due = Date.now() < walkFastUntil ? WALK_POLL_LIVE : walkIdleMs;
    if (walkInFlight || Date.now() - walkLastAt < due) return;
    walkInFlight = true;
    walkLastAt = Date.now();
    refreshWalk().then(walkPollDone, walkPollDone);
  }
  function walkPollDone() { walkInFlight = false; }

  function startWalkPolling(ms) {
    stopWalkPolling();
    walkIdleMs = ms || WALK_POLL_IDLE;
    walkLastAt = 0;
    walkPollTick();                                   // first sync straight away
    walkPollTimer = setInterval(walkPollTick, WALK_POLL_LIVE);
  }
  function stopWalkPolling() {
    if (walkPollTimer) { clearInterval(walkPollTimer); walkPollTimer = null; }
    walkInFlight = false;
  }

  function startFriendPolling(ms) {
    stopFriendPolling();
    refreshFriends();                                  // immediate first sync
    refreshFriendActivity();                           // prime the repeated-search memory
    refreshFriendFavorites();                          // first sync of friends' shared streets
    friendPollTimer = setInterval(function () {
      refreshFriends();
      refreshFriendActivity();
      refreshFriendFavorites();
    }, ms || 10000);
  }
  function stopFriendPolling() {
    if (friendPollTimer) { clearInterval(friendPollTimer); friendPollTimer = null; }
  }

  // Add a friend by their code. Resolves to { ok, friends } or { ok:false, error }
  // so the UI can show "no one has that code" vs a network failure. Because *I*
  // initiated this, the new friend is marked known (no self-toast).
  function addFriend(code) {
    if (!sid()) return Promise.resolve({ ok: false, error: 'no session yet' });
    return fetch(BASE_URL + '/sessions/' + sid() + '/friends', {
      method: 'POST', headers: headers(), body: JSON.stringify({ friend_code: code })
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (r.ok) {
          var list = (body && body.friends) || [];
          saveKnown(new Set(friendIds(list)));
          emitFriends(list, []);
          return { ok: true, friends: list };
        }
        return { ok: false, error: (body && body.detail) || ('HTTP ' + r.status) };
      });
    }).catch(function (e) { console.warn('[StudyAPI] addFriend failed', e); return { ok: false, error: 'network error' }; });
  }

  // Rename the free display label (handle/code stays the same). Updates the local
  // session slot on success so every screen reads the new name immediately.
  function renameDisplayName(name) {
    name = (name || '').trim();
    if (!name) return Promise.resolve(null);
    return scoped('/rename', { display_name: name }).then(function (res) {
      if (res && res.display_name && session) {
        session.display_name = res.display_name; saveSession(session);
      }
      return res;
    });
  }

  // --- typed loggers ---
  function logOnboarding(list) { return scoped('/onboarding', list); }
  function logProfile(source, vector) { return scoped('/profile', { source: source, vector: vector }); }
  function logSearch(query, kind) { return scoped('/search', { query: query, kind: kind || null }); }
  function logRoute(route) { return scoped('/routes', route).then(function (r) { return r && r.route_id; }); }
  function logRouteChoice(routeId) { return scoped('/route-choice', { route_id: routeId }); }
  function logEvent(type, payload) { return scoped('/events', [{ event_type: type, payload: payload || null }]); }

  // Slider logging: a drag fires onChange continuously, so debounce PER AXIS and
  // post once the value settles (~450ms) — one row per deliberate adjustment.
  var sliderTimers = {}, sliderPending = {};
  function logSlider(sliderId, value) {
    var axis = SLIDER_TO_AXIS[sliderId] || sliderId;
    sliderPending[axis] = value;
    clearTimeout(sliderTimers[axis]);
    sliderTimers[axis] = setTimeout(function () {
      var v = sliderPending[axis]; delete sliderPending[axis];
      scoped('/sliders', [{ axis: axis, value: v }]);
    }, 450);
  }

  // GPS buffer. Points are appended by the App-level geolocation watch (app.jsx)
  // and pushed in batches. Unlike every other logger here, a lost /gps batch is an
  // unrecoverable HOLE in the walk trace — a dead spot in an alley, or the Render
  // instance taking 30 s to wake, would silently erase minutes of the route. So a
  // failed batch goes back to the head of the buffer and is retried on the next
  // flush, capped so a long outage can't grow without bound (2000 points ≈ 2.5 h
  // of walking at one point per 5 s).
  var gpsBuf = [];
  var GPS_BUF_MAX = 2000;
  var gpsSending = false;   // never two flushes in flight — they'd reorder/duplicate
  function trimGpsBuf() {
    if (gpsBuf.length > GPS_BUF_MAX) gpsBuf.splice(0, gpsBuf.length - GPS_BUF_MAX);
  }
  function logGps(pt) { gpsBuf.push(pt); trimGpsBuf(); }
  function flushGps() {
    if (gpsSending || !gpsBuf.length || !sid()) return Promise.resolve(null);
    var batch = gpsBuf; gpsBuf = [];
    gpsSending = true;
    // Deliberately NOT via post(): that helper flattens every failure to null, and
    // here we must tell "delivered" from "failed" to decide whether to requeue.
    return fetch(BASE_URL + '/sessions/' + sid() + '/gps', {
      method: 'POST', headers: headers(), body: JSON.stringify(batch)
    }).then(function (r) {
      if (r.ok) return r.json().catch(function () { return null; });
      // 4xx means the batch itself is wrong (validation): retrying it forever would
      // block every later point behind it, so drop it loudly. 5xx is the server
      // having a bad moment — worth retrying, so fall through to the catch.
      if (r.status < 500) {
        console.warn('[StudyAPI] /gps dropped ' + batch.length + ' points -> HTTP ' + r.status);
        return null;
      }
      throw new Error('HTTP ' + r.status);
    }).catch(function (e) {
      console.warn('[StudyAPI] /gps failed, requeuing ' + batch.length + ' points', e);
      gpsBuf = batch.concat(gpsBuf); trimGpsBuf();
      return null;
    }).then(function (res) { gpsSending = false; return res; });
  }

  window.StudyAPI = {
    startSession: startSession, endSession: endSession, resetSession: resetSession,
    hasSession: hasSession, currentCode: currentCode,
    currentDisplayName: currentDisplayName, renameDisplayName: renameDisplayName,
    myFriendCode: myFriendCode, addFriend: addFriend, myFriends: myFriends,
    myParticipantId: myParticipantId,
    currentWalk: currentWalk, currentWalkId: currentWalkId, refreshWalk: refreshWalk,
    createWalk: createWalk, answerWalk: answerWalk, answerWalkById: answerWalkById,
    inviteToWalk: inviteToWalk, pendingInvites: pendingInvites,
    publishWalkRoute: publishWalkRoute, currentWalkRoute: currentWalkRoute,
    setWalkStatus: setWalkStatus, patchWalkState: patchWalkState,
    startWalkPolling: startWalkPolling, stopWalkPolling: stopWalkPolling,
    refreshFriends: refreshFriends, refreshFriendActivity: refreshFriendActivity,
    startFriendPolling: startFriendPolling, stopFriendPolling: stopFriendPolling,
    shareFavorite: shareFavorite, unshareFavorite: unshareFavorite,
    refreshFriendFavorites: refreshFriendFavorites, myFriendFavorites: myFriendFavorites,
    logOnboarding: logOnboarding, logProfile: logProfile, logSearch: logSearch,
    logRoute: logRoute, logRouteChoice: logRouteChoice, logEvent: logEvent,
    logSlider: logSlider, logGps: logGps, flushGps: flushGps,
    config: { baseUrl: BASE_URL }
  };
})();

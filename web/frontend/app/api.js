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

  function startFriendPolling(ms) {
    stopFriendPolling();
    refreshFriends();                                  // immediate first sync
    friendPollTimer = setInterval(refreshFriends, ms || 10000);
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

  // GPS buffer — wired in a later phase (needs HTTPS for geolocation on a phone).
  // Collect points and flush the batch to /gps; the capture loop is added then.
  var gpsBuf = [];
  function logGps(pt) { gpsBuf.push(pt); }
  function flushGps() {
    if (!gpsBuf.length || !sid()) return Promise.resolve(null);
    var batch = gpsBuf; gpsBuf = [];
    return scoped('/gps', batch);
  }

  window.StudyAPI = {
    startSession: startSession, endSession: endSession, resetSession: resetSession,
    hasSession: hasSession, currentCode: currentCode,
    currentDisplayName: currentDisplayName, renameDisplayName: renameDisplayName,
    myFriendCode: myFriendCode, addFriend: addFriend, myFriends: myFriends,
    refreshFriends: refreshFriends, startFriendPolling: startFriendPolling, stopFriendPolling: stopFriendPolling,
    logOnboarding: logOnboarding, logProfile: logProfile, logSearch: logSearch,
    logRoute: logRoute, logRouteChoice: logRouteChoice, logEvent: logEvent,
    logSlider: logSlider, logGps: logGps, flushGps: flushGps,
    config: { baseUrl: BASE_URL }
  };
})();

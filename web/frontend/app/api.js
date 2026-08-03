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
      mode: opts.mode || 'solo',
      group_code: opts.groupCode || null,
      consented: !!opts.consented,
      app_version: cfg.appVersion || null,
      user_agent: navigator.userAgent
    }).then(function (res) {
      if (res && res.session_id) {
        session = { session_id: res.session_id, participant_id: res.participant_id, code: opts.code };
        saveSession(session);
      }
      return res;
    });
  }
  function endSession() { return sid() ? scoped('/end', {}) : Promise.resolve(null); }
  function resetSession() { session = null; try { localStorage.removeItem(SS_KEY); } catch (e) {} }
  function hasSession() { return !!sid(); }
  function currentCode() { return session && session.code; }

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
    logOnboarding: logOnboarding, logProfile: logProfile, logSearch: logSearch,
    logRoute: logRoute, logRouteChoice: logRouteChoice, logEvent: logEvent,
    logSlider: logSlider, logGps: logGps, flushGps: flushGps,
    config: { baseUrl: BASE_URL }
  };
})();

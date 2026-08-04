/* Deploy-time config for the study frontend. Loaded BEFORE app/api.js.

   Auto-selects the API by where the page is served from, so there's nothing to
   flip by hand:
     - opened from localhost / 127.0.0.1  -> the local Docker API (localhost:8000)
     - served from anywhere else (Cloudflare, etc.) -> the production Render API
   (The study key lives in client JS by design — it blocks casual/random posting,
   not a determined inspector; that trade-off was accepted for a controlled study.) */
(function () {
  var h = location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '';
  window.STUDY_CONFIG = isLocal
    ? { baseUrl: 'http://localhost:8000', studyKey: 'dev-study-key-change-me', appVersion: 'dev' }
    : { baseUrl: 'https://ixlab-study-api.onrender.com', studyKey: 'ixkepaSWK0626', appVersion: 'dev' };
})();

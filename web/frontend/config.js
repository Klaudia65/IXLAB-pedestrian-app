/* Deploy-time config for the study frontend. Loaded BEFORE app/api.js.

   LOCAL DEV: the defaults below point at the local Docker API.
   PRODUCTION: before deploying the static frontend, change:
     - baseUrl  -> your Render API URL, e.g. 'https://ixlab-study-api.onrender.com'
     - studyKey -> the real STUDY_WRITE_KEY you set in the Render dashboard
   (The key lives in client JS by design — it blocks casual/random posting, not a
   determined inspector; that trade-off was accepted for a controlled study.) */
window.STUDY_CONFIG = {
  baseUrl: 'http://localhost:8000',
  studyKey: 'dev-study-key-change-me',
  appVersion: 'dev',
};

// ──────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────
// Replace the values below with your own Firebase project's config.
// See SETUP.md for step-by-step instructions on getting these values.
//
// You can find this config in the Firebase console:
// Project settings (gear icon) → General tab → "Your apps" → SDK setup and configuration
// ──────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyCzAamdBtcWTvu1n3JwgpqPsBqPsmM69G4",
  authDomain: "quiz2026-fc115.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "quiz2026-fc115",
  storageBucket: "quiz2026-fc115.firebasestorage.app",
  messagingSenderId: "140325558049",
  appId: "1:140325558049:web:97795441c6a3cba9125060"
};

// Initialize Firebase — do not edit below this line
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

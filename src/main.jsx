// Entry point for the hosted web app (npm run build:web → dist-web/).
//
// Same app as the claude.ai artifact, built from the same
// magical-athlete-tracker.jsx. Storage:
//   - personal keys (saved games, history, settings) → this phone's localStorage
//   - shared keys (join codes, live race, bets) → Cloud Firestore, so
//     spectators on other phones see the race and their bets reach the host.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../magical-athlete-tracker.jsx";
import { createLocalStorageApi } from "./storage-local.js";
import { combineStorage, createFirebaseSharedStorage, loadFirebaseModules } from "./storage-shared-firebase.js";
import { firebaseConfig } from "./firebase-config.js";
import "./styles.css";

const personal = createLocalStorageApi();
// The smoke test sets this before the page loads: it has no internet, so it
// keeps shared keys on the device (two tabs then play host and spectator).
const shared =
  window.__MA_SHARED_BACKEND__ === "local"
    ? personal
    : createFirebaseSharedStorage({ config: firebaseConfig, loadFirebase: loadFirebaseModules });

window.storage = combineStorage(personal, shared);

createRoot(document.getElementById("root")).render(<App />);

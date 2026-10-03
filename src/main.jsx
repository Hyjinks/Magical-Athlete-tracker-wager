// Entry point for the hosted web app (npm run build:web → dist-web/).
//
// Same app as the claude.ai artifact, built from the same
// magical-athlete-tracker.jsx. Storage is this phone's localStorage for now;
// the shared parts (join code, live race, bets) move to Firestore in the next
// step so spectators on other phones can join.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../magical-athlete-tracker.jsx";
import { installLocalStorageIfMissing } from "./storage-local.js";
import "./styles.css";

installLocalStorageIfMissing();

createRoot(document.getElementById("root")).render(<App />);

// Entry point for the published claude.ai artifact build.
//
// On claude.ai the artifact host provides `window.storage` (that's what keeps
// saved games and history between visits). When the built page is opened
// anywhere else — a local preview, the smoke test — the localStorage version
// stands in, with the same key layout.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../magical-athlete-tracker.jsx";
import { installLocalStorageIfMissing } from "../../src/storage-local.js";

installLocalStorageIfMissing();

createRoot(document.getElementById("root")).render(<App />);

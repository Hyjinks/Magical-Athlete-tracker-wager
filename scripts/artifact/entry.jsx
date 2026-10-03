// Entry point for the published artifact build. Mounts the app and makes sure
// `window.storage` exists.
//
// On claude.ai the artifact host provides `window.storage` (that's what keeps
// saved games and history between visits), so this fallback only runs when the
// page is opened somewhere else: a local preview, the smoke test, a plain
// browser tab. It keeps the app's key layout — personal keys under "ma:",
// shared keys under "ma-s:" — so saves made locally look like the real thing.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../magical-athlete-tracker.jsx";

if (typeof window !== "undefined" && !window.storage) {
  const memory = new Map();
  let local = null;
  try {
    window.localStorage.setItem("ma:__probe", "1");
    window.localStorage.removeItem("ma:__probe");
    local = window.localStorage;
  } catch {
    local = null; // private mode or blocked storage: keep everything in memory
  }
  const fullKey = (key, shared) => (shared ? "ma-s:" : "ma:") + key;
  const read = (k) => (local ? local.getItem(k) : memory.has(k) ? memory.get(k) : null);
  const write = (k, v) => (local ? local.setItem(k, v) : memory.set(k, v));
  const remove = (k) => (local ? local.removeItem(k) : memory.delete(k));
  const allKeys = () => (local ? Object.keys(local) : [...memory.keys()]);

  window.storage = {
    async get(key, shared = false) {
      const value = read(fullKey(key, shared));
      return value == null ? null : { key, value, shared };
    },
    async set(key, value, shared = false) {
      write(fullKey(key, shared), value);
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      remove(fullKey(key, shared));
      return { key, deleted: true, shared };
    },
    async list(prefix = "", shared = false) {
      const ns = shared ? "ma-s:" : "ma:";
      const keys = allKeys()
        .filter((k) => k.startsWith(ns + prefix))
        .map((k) => k.slice(ns.length));
      return { keys, prefix, shared };
    },
  };
}

createRoot(document.getElementById("root")).render(<App />);

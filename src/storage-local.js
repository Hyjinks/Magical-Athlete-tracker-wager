// `window.storage` backed by this device's localStorage.
//
// The app talks to storage through `window.storage.get/set/delete/list(key,
// shared)`. On claude.ai the artifact host provides that object; everywhere
// else (the hosted web app, local previews, the smoke test) this provides it.
//
// Keys keep the app's layout: personal keys under "ma:", shared keys under
// "ma-s:". "Shared" keys are only shared on this one device here — the hosted
// web app swaps in a real shared backend for them (see main.jsx).
//
// Falls back to memory when localStorage is unavailable (private mode,
// blocked site data), so the app still runs; it just forgets on reload.
export function createLocalStorageApi() {
  const memory = new Map();
  let local = null;
  try {
    window.localStorage.setItem("ma:__probe", "1");
    window.localStorage.removeItem("ma:__probe");
    local = window.localStorage;
  } catch {
    local = null;
  }
  const fullKey = (key, shared) => (shared ? "ma-s:" : "ma:") + key;
  const read = (k) => (local ? local.getItem(k) : memory.has(k) ? memory.get(k) : null);
  const write = (k, v) => (local ? local.setItem(k, v) : memory.set(k, v));
  const remove = (k) => (local ? local.removeItem(k) : memory.delete(k));
  const allKeys = () => (local ? Object.keys(local) : [...memory.keys()]);

  return {
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

// Installs the localStorage version unless something (the claude.ai host)
// already provided window.storage.
export function installLocalStorageIfMissing() {
  if (typeof window !== "undefined" && !window.storage) {
    window.storage = createLocalStorageApi();
  }
}

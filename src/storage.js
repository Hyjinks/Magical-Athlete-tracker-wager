// Device-local storage behind the `window.storage` API the app uses.
//   get/set/delete/list(key, shared)
// `shared` keys are namespaced separately ("ma-s:") from personal ones
// ("ma:"). Both live in localStorage on this device, with an in-memory
// fallback when localStorage is blocked (private windows, some embeds).
//
// KEEP THE PREFIXES. The published artifact uses the same ones, so a
// player's saved game and history carry across if both run on one origin.
//
// To move shared keys (join PIN, live race snapshot, bets) to a real
// backend later, replace the shared branch of these functions with
// Firestore/Supabase calls; nothing in App.jsx needs to change.

const memory = {};

const ls = (() => {
  try {
    localStorage.setItem("__t", "1");
    localStorage.removeItem("__t");
    return localStorage;
  } catch {
    return null;
  }
})();

const fullKey = (key, shared) => (shared ? "ma-s:" : "ma:") + key;

const read = (k) => {
  try {
    return ls ? ls.getItem(k) : memory[k] ?? null;
  } catch {
    return memory[k] ?? null;
  }
};

const write = (k, v) => {
  try {
    if (ls) ls.setItem(k, v);
    else memory[k] = v;
  } catch {
    memory[k] = v;
  }
};

const remove = (k) => {
  try {
    if (ls) ls.removeItem(k);
  } catch {
    // ignore
  }
  delete memory[k];
};

export function installStorage() {
  window.storage = {
    get: async (key, shared) => {
      const value = read(fullKey(key, shared));
      return value == null ? null : { key, value, shared: !!shared };
    },
    set: async (key, value, shared) => {
      write(fullKey(key, shared), value);
      return { key, value, shared: !!shared };
    },
    delete: async (key, shared) => {
      remove(fullKey(key, shared));
      return { key, deleted: true, shared: !!shared };
    },
    list: async (prefix = "", shared) => {
      const full = fullKey(prefix, shared);
      const cut = fullKey("", shared).length;
      const keys = [];
      try {
        if (ls) {
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (k.startsWith(full)) keys.push(k.slice(cut));
          }
        }
      } catch {
        // ignore
      }
      return { keys, prefix, shared: !!shared };
    },
  };
}

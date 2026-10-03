// Shared storage for the hosted web app, backed by Cloud Firestore.
//
// The app's shared keys — the join code, the live race and spectators' bets —
// need to be visible on every phone at the table. This provides the shared half
// of `window.storage` (get / set / delete / list with shared = true) on top of
// Firestore. Personal keys stay in each phone's localStorage.
//
//   join:<4-digit code>          which race a join code points at   (host writes)
//   race:<token>                 live race snapshot for spectators   (host writes)
//   bet:<token>:<raceId>:<id>    one bet                             (whoever placed it)
//
// Each key is one document in the `shared` collection, with the key as its ID:
//   { key, value (the app's JSON string), owner (Firebase user id), updatedAt }
// firestore.rules relies on exactly this shape.
//
// Phones sign in anonymously and invisibly — nobody sees a login screen.
//
// Reads go through live listeners: the first get/list of a key or prefix
// subscribes to it, and the app's every-few-seconds polling is then answered
// from memory, updated the moment anything changes. That keeps Firestore reads
// (the free tier's limit) proportional to actual changes, not to polling.
//
// Firebase is only downloaded the first time a shared key is used, so a host
// who never turns on spectator betting never loads it.

const COLLECTION = "shared";
const FIRST_SNAPSHOT_TIMEOUT_MS = 10000;
const IDLE_UNSUBSCRIBE_MS = 90000;
// A write with no signal never fails on its own (Firestore just waits), so the
// app is told after this long and can say so. The write may still land later.
const WRITE_TIMEOUT_MS = 15000;

const withTimeout = (promise, ms, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });

// `loadFirebase` returns { app, auth, firestore } module namespaces. Injected so
// the unit tests can pass a fake Firestore.
export function createFirebaseSharedStorage({ config, loadFirebase }) {
  let ready = null; // Promise<{ fs, db, uid }>
  const docWatch = new Map(); // key -> { value, ready: Promise, unsubscribe, lastUsed }
  const listWatch = new Map(); // prefix -> { keys, ready, unsubscribe, lastUsed }

  const connect = () => {
    if (!ready) {
      ready = (async () => {
        const { app: appMod, auth: authMod, firestore: fs } = await loadFirebase();
        const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(config);
        const auth = authMod.getAuth(app);
        // Reuse this phone's anonymous account if it already has one.
        const existing = await new Promise((resolve) => {
          let done = false;
          let stop = null;
          stop = authMod.onAuthStateChanged(auth, (user) => {
            if (done) return;
            done = true;
            if (stop) stop();
            else queueMicrotask(() => stop && stop());
            resolve(user);
          });
        });
        const user = existing || (await authMod.signInAnonymously(auth)).user;
        let db;
        try {
          db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache() });
        } catch {
          db = fs.getFirestore(app); // already initialised (hot reload)
        }
        return { fs, db, uid: user.uid };
      })().catch((e) => {
        ready = null; // offline or blocked — try again on the next call
        throw e;
      });
    }
    return ready;
  };

  const checkKey = (key) => {
    if (typeof key !== "string" || !key || key.includes("/") || key.length > 300) {
      throw new Error(`Invalid shared key: ${key}`);
    }
  };

  // Resolves with the first snapshot, or rejects on error / timeout.
  const firstSnapshot = (subscribe) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Timed out waiting for shared data"));
        }
      }, FIRST_SNAPSHOT_TIMEOUT_MS);
      const unsubscribe = subscribe(
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(unsubscribe);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    });

  const watchDoc = async (key) => {
    let w = docWatch.get(key);
    if (w) {
      w.lastUsed = Date.now();
      await w.ready;
      return w;
    }
    const { fs, db } = await connect();
    w = { value: null, lastUsed: Date.now(), unsubscribe: () => {} };
    docWatch.set(key, w);
    w.ready = firstSnapshot((onFirst, onError) =>
      fs.onSnapshot(
        fs.doc(db, COLLECTION, key),
        (snap) => {
          w.value = snap.exists() ? snap.data().value : null;
          onFirst();
        },
        (err) => {
          docWatch.delete(key);
          onError(err);
        }
      )
    ).then((unsubscribe) => {
      w.unsubscribe = unsubscribe;
    });
    try {
      await w.ready;
    } catch (e) {
      docWatch.delete(key);
      throw e;
    }
    return w;
  };

  const watchList = async (prefix) => {
    let w = listWatch.get(prefix);
    if (w) {
      w.lastUsed = Date.now();
      await w.ready;
      return w;
    }
    const { fs, db } = await connect();
    w = { keys: [], lastUsed: Date.now(), unsubscribe: () => {} };
    listWatch.set(prefix, w);
    const q = fs.query(
      fs.collection(db, COLLECTION),
      fs.where("key", ">=", prefix),
      fs.where("key", "<", prefix + "")
    );
    w.ready = firstSnapshot((onFirst, onError) =>
      fs.onSnapshot(
        q,
        (snap) => {
          w.keys = snap.docs.map((d) => d.id);
          onFirst();
        },
        (err) => {
          listWatch.delete(prefix);
          onError(err);
        }
      )
    ).then((unsubscribe) => {
      w.unsubscribe = unsubscribe;
    });
    try {
      await w.ready;
    } catch (e) {
      listWatch.delete(prefix);
      throw e;
    }
    return w;
  };

  // Drop listeners nobody has asked about for a while (a finished race, a
  // spectator who left), so they stop counting against the free tier.
  const prune = () => {
    const cutoff = Date.now() - IDLE_UNSUBSCRIBE_MS;
    for (const map of [docWatch, listWatch]) {
      for (const [k, w] of map) {
        if (w.lastUsed < cutoff) {
          w.unsubscribe();
          map.delete(k);
        }
      }
    }
  };
  const pruneTimer = typeof setInterval === "function" ? setInterval(prune, IDLE_UNSUBSCRIBE_MS / 3) : null;

  return {
    async get(key) {
      checkKey(key);
      const w = await watchDoc(key);
      return w.value == null ? null : { key, value: w.value, shared: true };
    },
    async set(key, value) {
      checkKey(key);
      const { fs, db, uid } = await connect();
      await withTimeout(
        fs.setDoc(fs.doc(db, COLLECTION, key), {
          key,
          value: String(value),
          owner: uid,
          updatedAt: fs.serverTimestamp(),
        }),
        WRITE_TIMEOUT_MS,
        "Timed out saving shared data"
      );
      return { key, value, shared: true };
    },
    async delete(key) {
      checkKey(key);
      const { fs, db } = await connect();
      await withTimeout(fs.deleteDoc(fs.doc(db, COLLECTION, key)), WRITE_TIMEOUT_MS, "Timed out deleting shared data");
      return { key, deleted: true, shared: true };
    },
    async list(prefix = "") {
      if (typeof prefix !== "string" || prefix.includes("/")) throw new Error(`Invalid shared prefix: ${prefix}`);
      const w = await watchList(prefix);
      return { keys: [...w.keys], prefix, shared: true };
    },
    // For tests and hot reload.
    _dispose() {
      if (pruneTimer) clearInterval(pruneTimer);
      for (const map of [docWatch, listWatch]) {
        for (const w of map.values()) w.unsubscribe();
        map.clear();
      }
    },
    _prune: prune,
  };
}

// The real thing: Firebase is fetched on first use, as its own chunk.
export function loadFirebaseModules() {
  return Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]).then(
    ([app, auth, firestore]) => ({ app, auth, firestore })
  );
}

// window.storage for the web app: personal keys from `personal` (this phone),
// shared keys from `shared` (Firestore).
export function combineStorage(personal, shared) {
  const pick = (isShared) => (isShared ? shared : personal);
  return {
    get: (key, isShared = false) => pick(isShared).get(key, isShared),
    set: (key, value, isShared = false) => pick(isShared).set(key, value, isShared),
    delete: (key, isShared = false) => pick(isShared).delete(key, isShared),
    list: (prefix = "", isShared = false) => pick(isShared).list(prefix, isShared),
  };
}

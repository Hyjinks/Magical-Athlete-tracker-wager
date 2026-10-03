// Unit tests for the Firestore shared-storage adapter, against a fake Firestore.
//   node --test tests/storage-shared.test.mjs   (part of npm test)
//
// The real Firestore (and firestore.rules) can't be reached from the test
// machine; this checks the adapter's own logic: document shape, listener
// caching (so polling doesn't cost reads), prefix listing, and failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { combineStorage, createFirebaseSharedStorage } from "../src/storage-shared-firebase.js";

function fakeFirebase({ failSignIn = false } = {}) {
  const docs = new Map(); // id -> data
  const listeners = new Set(); // { match(id), notify() }
  const stats = { signIns: 0, subscriptions: 0, writes: [] };
  let user = null;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const snapshotFor = (target) =>
    target.kind === "doc"
      ? { exists: () => docs.has(target.id), data: () => docs.get(target.id) }
      : {
          docs: [...docs.keys()].filter((id) => id >= target.lo && id < target.hi).sort().map((id) => ({ id })),
        };
  const notify = (id) => {
    for (const l of listeners) if (l.match(id)) l.fire();
  };

  const firestore = {
    initializeFirestore: () => ({ db: true }),
    getFirestore: () => ({ db: true }),
    memoryLocalCache: () => ({}),
    serverTimestamp: () => "SERVER_TIME",
    doc: (_db, collection, id) => {
      assert.equal(collection, "shared");
      return { kind: "doc", id };
    },
    collection: (_db, name) => ({ name }),
    where: (field, op, value) => ({ field, op, value }),
    query: (_c, lo, hi) => {
      assert.equal(lo.field, "key");
      assert.equal(lo.op, ">=");
      assert.equal(hi.op, "<");
      return { kind: "query", lo: lo.value, hi: hi.value };
    },
    onSnapshot: (target, next) => {
      stats.subscriptions++;
      const l = {
        match: (id) => (target.kind === "doc" ? id === target.id : id >= target.lo && id < target.hi),
        fire: () => setTimeout(() => listeners.has(l) && next(snapshotFor(target)), 0),
      };
      listeners.add(l);
      l.fire();
      return () => listeners.delete(l);
    },
    setDoc: async (ref, data) => {
      stats.writes.push({ id: ref.id, data });
      docs.set(ref.id, data);
      notify(ref.id);
    },
    deleteDoc: async (ref) => {
      docs.delete(ref.id);
      notify(ref.id);
    },
  };
  const auth = {
    getAuth: () => ({}),
    onAuthStateChanged: (_a, cb) => {
      setTimeout(() => cb(user), 0);
      return () => {};
    },
    signInAnonymously: async () => {
      stats.signIns++;
      if (failSignIn) throw new Error("auth/network-request-failed");
      user = { uid: "phone-1" };
      return { user };
    },
  };
  const app = { getApps: () => [], getApp: () => ({}), initializeApp: () => ({}) };
  return { load: async () => ({ app, auth, firestore }), stats, docs, tick, listeners };
}

test("set writes the shape firestore.rules expects", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  await s.set("join:1234", JSON.stringify({ pin: "1234", token: "abc", active: true }));
  assert.deepEqual(fb.stats.writes[0], {
    id: "join:1234",
    data: { key: "join:1234", value: '{"pin":"1234","token":"abc","active":true}', owner: "phone-1", updatedAt: "SERVER_TIME" },
  });
  s._dispose();
});

test("get returns the value, or null when missing", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  assert.equal(await s.get("race:abc"), null);
  await s.set("race:abc", "snapshot");
  await fb.tick();
  assert.deepEqual(await s.get("race:abc"), { key: "race:abc", value: "snapshot", shared: true });
  s._dispose();
});

test("repeated polling is answered from one live listener", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  for (let i = 0; i < 10; i++) await s.get("race:abc");
  for (let i = 0; i < 10; i++) await s.list("bet:abc:r1:");
  assert.equal(fb.stats.subscriptions, 2);
  // ...and it still sees changes made elsewhere.
  fb.docs.set("race:abc", { value: "from the host" });
  for (const l of fb.listeners) if (l.match("race:abc")) l.fire();
  await fb.tick();
  assert.equal((await s.get("race:abc")).value, "from the host");
  s._dispose();
});

test("list returns only keys under the prefix", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  for (const k of ["bet:abc:r1:x", "bet:abc:r1:y", "bet:abc:r2:z", "bet:abd:r1:q", "race:abc"]) await s.set(k, "1");
  const { keys } = await s.list("bet:abc:r1:");
  assert.deepEqual(keys, ["bet:abc:r1:x", "bet:abc:r1:y"]);
  await s.delete("bet:abc:r1:x");
  await fb.tick();
  assert.deepEqual((await s.list("bet:abc:r1:")).keys, ["bet:abc:r1:y"]);
  s._dispose();
});

test("signs in once and reuses it", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  await Promise.all([s.set("race:a", "1"), s.get("race:a"), s.list("bet:a:")]);
  await s.set("race:a", "2");
  assert.equal(fb.stats.signIns, 1);
  s._dispose();
});

test("a failed sign-in rejects, and the next call tries again", async () => {
  const fb = fakeFirebase({ failSignIn: true });
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  await assert.rejects(s.get("join:1234"));
  await assert.rejects(s.set("join:1234", "x"));
  assert.equal(fb.stats.signIns, 2);
  s._dispose();
});

test("rejects keys Firestore can't store", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  await assert.rejects(s.set("bet/../x", "1"));
  await assert.rejects(s.get(""));
  s._dispose();
});

test("idle listeners are dropped", async () => {
  const fb = fakeFirebase();
  const s = createFirebaseSharedStorage({ config: {}, loadFirebase: fb.load });
  await s.get("race:old");
  assert.equal(fb.listeners.size, 1);
  const realNow = Date.now;
  Date.now = () => realNow() + 10 * 60 * 1000;
  try {
    s._prune();
  } finally {
    Date.now = realNow;
  }
  assert.equal(fb.listeners.size, 0);
  s._dispose();
});

test("combineStorage sends shared keys to the shared backend only", async () => {
  const calls = [];
  const backend = (name) => ({
    get: async (k) => calls.push(`${name}.get ${k}`),
    set: async (k) => calls.push(`${name}.set ${k}`),
    delete: async (k) => calls.push(`${name}.delete ${k}`),
    list: async (p) => calls.push(`${name}.list ${p}`),
  });
  const st = combineStorage(backend("local"), backend("cloud"));
  await st.get("games");
  await st.set("race:1", "x", true);
  await st.list("bet:", true);
  await st.delete("theme-preference");
  assert.deepEqual(calls, ["local.get games", "cloud.set race:1", "cloud.list bet:", "local.delete theme-preference"]);
});

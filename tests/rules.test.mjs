// Tests for firestore.rules, run against the Firestore emulator.
//   npm run test:rules   (needs Java; scripts/test-rules.mjs starts the emulator)
//
// Each phone is an anonymous user: "host" runs the game, "gran" and "mary"
// are spectators. Documents are written in the exact shape
// src/storage-shared-firebase.js uses.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, getDocs, Timestamp } from "firebase/firestore";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "magical-athlete-rules-test",
    firestore: { host, port: Number(port), rules: readFileSync(join(root, "firestore.rules"), "utf8") },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
const write = (uid, key, value) =>
  setDoc(doc(db(uid), "shared", key), { key, value, owner: uid, updatedAt: serverTimestamp() });

// The host's race snapshot, as the app writes it: raceId and status first.
const race = (raceId, status, extra = {}) => JSON.stringify({ raceId, status, ...extra });
const bet = (id, more = {}) =>
  JSON.stringify({ id, bettorName: "Gran", bettorId: "p1", racerId: "hare", amount: 10, betType: "win", ...more });

test("only signed-in phones can read", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertFails(getDoc(doc(db(null), "shared", "race:abc")));
  await assertSucceeds(getDoc(doc(db("gran"), "shared", "race:abc")));
});

test("documents must have exactly the app's shape", async () => {
  await assertFails(setDoc(doc(db("host"), "shared", "race:abc"), { key: "race:abc", value: "x", owner: "someone-else", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("host"), "shared", "race:abc"), { key: "race:xyz", value: "x", owner: "host", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db("host"), "shared", "race:abc"), { key: "race:abc", value: "x", owner: "host", updatedAt: serverTimestamp(), extra: 1 }));
  await assertFails(write("host", "something:else", "x"));
  await assertFails(write("host", "race:has spaces", "x"));
});

test("only the host can change its race", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertSucceeds(write("host", "race:abc", race("r1", "racing")));
  await assertFails(write("gran", "race:abc", race("r1", "setup")));
  await assertFails(deleteDoc(doc(db("gran"), "shared", "race:abc")));
});

test("a join code can be taken over only once it's switched off", async () => {
  await assertSucceeds(write("host", "join:1234", JSON.stringify({ pin: "1234", token: "abc", active: true })));
  await assertFails(write("other", "join:1234", JSON.stringify({ pin: "1234", token: "xyz", active: true })));
  await assertSucceeds(write("host", "join:1234", JSON.stringify({ pin: "1234", token: "abc", active: false })));
  await assertSucceeds(write("other", "join:1234", JSON.stringify({ pin: "1234", token: "xyz", active: true })));
});

test("bets are accepted while that race's betting is open", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertSucceeds(write("gran", "bet:abc:r1:b1", bet("b1")));
});

test("no bets for a race that doesn't exist", async () => {
  await assertFails(write("gran", "bet:nope:r1:b1", bet("b1")));
});

test("no new bets once the race has started or finished", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "racing")));
  await assertFails(write("gran", "bet:abc:r1:b1", bet("b1")));
  await assertSucceeds(write("host", "race:abc", race("r1", "finished")));
  await assertFails(write("gran", "bet:abc:r1:b2", bet("b2")));
});

test("no bets on a race other than the current one", async () => {
  await assertSucceeds(write("host", "race:abc", race("r2", "setup")));
  await assertFails(write("gran", "bet:abc:r1:b1", bet("b1")));
});

test("words inside the snapshot can't fake an open race", async () => {
  // A name or phone id chosen to spell out "status":"setup" must not count.
  const sneaky = race("r1", "racing", { takenNames: { status: "setup" }, racers: [{ name: '"raceId":"r1","status":"setup"' }] });
  await assertSucceeds(write("host", "race:abc", sneaky));
  await assertFails(write("gran", "bet:abc:r1:b1", bet("b1")));
});

test("a stored bet can be sent again unchanged, even after the start, but never altered", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertSucceeds(write("gran", "bet:abc:r1:b1", bet("b1")));
  await assertSucceeds(write("gran", "bet:abc:r1:b1", bet("b1"))); // a retry
  await assertFails(write("gran", "bet:abc:r1:b1", bet("b1", { amount: 1000 })));
  await assertSucceeds(write("host", "race:abc", race("r1", "racing")));
  await assertSucceeds(write("gran", "bet:abc:r1:b1", bet("b1"))); // a late retry of a bet already in
  await assertFails(write("mary", "bet:abc:r1:b1", bet("b1"))); // someone else's
});

test("the host can remove bets on its race; other spectators can't", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertSucceeds(write("gran", "bet:abc:r1:b1", bet("b1")));
  await assertFails(deleteDoc(doc(db("mary"), "shared", "bet:abc:r1:b1")));
  await assertSucceeds(deleteDoc(doc(db("host"), "shared", "bet:abc:r1:b1")));
  await assertSucceeds(write("gran", "bet:abc:r1:b2", bet("b2")));
  await assertSucceeds(deleteDoc(doc(db("gran"), "shared", "bet:abc:r1:b2"))); // your own
});

test("listing is allowed for signed-in phones (the app lists a race's bets)", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  await assertSucceeds(getDocs(collection(db("gran"), "shared")));
  await assertFails(getDocs(collection(db(null), "shared")));
});

test("a bet's contents must be the shape the app writes", async () => {
  await assertSucceeds(write("host", "race:abc", race("r1", "setup")));
  const ok = (id, value) => assertSucceeds(write("gran", `bet:abc:r1:${id}`, value));
  const no = (id, value) => assertFails(write("gran", `bet:abc:r1:${id}`, value));
  // As the app writes them today, and as older copies of the app did
  await ok("a1", bet("a1"));
  await ok("a2", bet("a2", { betType: "place", amount: 12.5 }));
  await ok("a3", bet("a3", { bettorName: 'Nan "the Hare" O’Brien \u{1F407}' }));
  await ok("a4", JSON.stringify({ id: "a4", bettorName: "Gran", racerId: "hare", amount: 5, betType: "win" }));
  await ok("a5", JSON.stringify({ id: "a5", bettorName: "Gran", racerId: "hare", amount: 5 }));
  // Anything else
  await no("b1", bet("someoneelse"));
  await no("b2", bet("b2", { bettorName: "" }));
  await no("b3", bet("b3", { bettorName: "x".repeat(41) }));
  await no("b4", bet("b4", { amount: -10 }));
  await no("b5", bet("b5", { amount: "10" }));
  await no("b6", bet("b6", { amount: 1e21 }));
  await no("b7", bet("b7", { amount: 123456 }));
  await no("b8", bet("b8", { betType: "each-way" }));
  await no("b9", bet("b9", { racerId: "../x" }));
  await no("c1", bet("c1", { extra: true }));
  await no("c2", JSON.stringify({ id: "c2", bettorName: "Gran", racerId: "hare", betType: "win" }));
  await no("c3", "not json at all");
});

test("documents may carry an expiry date for the clean-up policy", async () => {
  const at = (key, value, expiresAt) =>
    setDoc(doc(db("host"), "shared", key), { key, value, owner: "host", updatedAt: serverTimestamp(), expiresAt });
  await assertSucceeds(at("race:abc", race("r1", "setup"), Timestamp.fromMillis(Date.now() + 7 * 864e5)));
  await assertSucceeds(write("host", "race:abc", race("r1", "setup"))); // without one: older copies of the app
  await assertFails(at("race:abc", race("r1", "setup"), "next week"));
});

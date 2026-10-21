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
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";

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

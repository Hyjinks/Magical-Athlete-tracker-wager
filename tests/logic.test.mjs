// Unit tests for the app's pure game logic (payouts and the like).
//   node --test tests/logic.test.mjs   (part of npm test)
//
// The app is one JSX file, so it's bundled with esbuild first and its named
// exports are imported from the bundle. Nothing renders here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = await build({
  entryPoints: [join(root, "magical-athlete-tracker.jsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
  jsx: "transform",
});
const dir = mkdtempSync(join(tmpdir(), "ma-logic-"));
const file = join(dir, "app.mjs");
writeFileSync(file, out.outputFiles[0].text);
const app = await import(pathToFileURL(file).href);
rmSync(dir, { recursive: true, force: true });

const { betPayout, placeOddsFor, nameKey, spectatorBetProblem, betValue } = app;

test("place odds sit between 1x and the win odds", () => {
  assert.equal(placeOddsFor(0), 0);
  assert.equal(placeOddsFor(undefined), 0);
  assert.equal(placeOddsFor(1), 1);
  assert.equal(placeOddsFor(3), 1.8);
  assert.equal(placeOddsFor(6), 3);
  for (const w of [1.5, 2, 4.25, 9]) {
    const p = placeOddsFor(w);
    assert.ok(p >= 1 && p <= w, `place ${p} for win ${w}`);
  }
});

test("bet payouts", () => {
  const odds = { hare: 3, egg: 6, banana: 2 };
  const win = (racerId, amount = 10) => ({ racerId, amount, betType: "win" });
  const place = (racerId, amount = 10) => ({ racerId, amount, betType: "place" });

  // Win bets pay only on the winner, stake included.
  assert.equal(betPayout(win("hare"), odds, "hare", "egg"), 30);
  assert.equal(betPayout(win("egg"), odds, "hare", "egg"), 0);
  // Place bets pay on 1st or 2nd, at the place odds.
  assert.equal(betPayout(place("hare"), odds, "hare", "egg"), 18);
  assert.equal(betPayout(place("egg"), odds, "hare", "egg"), 30);
  assert.equal(betPayout(place("banana"), odds, "hare", "egg"), 0);
  // Old saved bets have no betType: they're win bets.
  assert.equal(betPayout({ racerId: "hare", amount: 5 }, odds, "hare", "egg"), 15);
  // No result yet, no second place yet, or no odds for that racer: nothing.
  assert.equal(betPayout(win("hare"), odds, undefined, undefined), 0);
  assert.equal(betPayout(place("egg"), odds, "hare", undefined), 0);
  assert.equal(betPayout(win("mystery"), odds, "mystery", "egg"), 0);
  assert.equal(betPayout(null, odds, "hare", "egg"), 0);
});

test("names match ignoring case and spaces", () => {
  assert.equal(nameKey("  Mary  "), "mary");
  assert.equal(nameKey("Mary   B"), "mary b");
  assert.equal(nameKey(undefined), "");
});

test("a spectator's bet under another phone's name is turned down", () => {
  const names = { mary: "phone1" };
  assert.equal(spectatorBetProblem({ bettorName: "mary", bettorId: "phone1" }, names), null);
  assert.equal(spectatorBetProblem({ bettorName: "MARY ", bettorId: "phone2" }, names), "name");
  assert.equal(spectatorBetProblem({ bettorName: "Mary B", bettorId: "phone2" }, names), null);
  // Bets with no phone id (typed on the host, or an older app) aren't checked.
  assert.equal(spectatorBetProblem({ bettorName: "Mary" }, names), null);
});

test("a bet is always stored the same way, so a retry is an exact overwrite", () => {
  const b = { id: "b1", raceId: "r1", bettorName: "Mary", bettorId: "p1", racerId: "hare", amount: 10, betType: "win", state: "sending" };
  assert.equal(betValue(b), betValue({ ...b, state: "placed" }));
  assert.deepEqual(JSON.parse(betValue(b)), { id: "b1", bettorName: "Mary", bettorId: "p1", racerId: "hare", amount: 10, betType: "win" });
});

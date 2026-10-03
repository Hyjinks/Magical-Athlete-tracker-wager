// Smoke test for the built page (dist/magical-athlete.html).
//
//   npm run build && npm test
//
// Opens the page in headless Chromium at phone size and plays through the main
// flows. Fails on any failed check or any JavaScript error / console error.
// Phone-width screenshots of every tab land in test-results/ — compare them
// with the previous run before publishing a layout change.
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = join(root, "dist", "magical-athlete.html");
const SHOTS = join(root, "test-results");

// iPhones zoom the page when a text field under 16px is tapped. Fixed in
// October 2026 — kept strict so it can't come back.
const STRICT_INPUT_FONT = true;

if (!existsSync(PAGE)) {
  console.error("dist/magical-athlete.html not found — run `npm run build` first.");
  process.exit(1);
}

let failures = 0;
const warnings = [];
const pass = (msg) => console.log(`  ✓ ${msg}`);
const check = (ok, msg) => {
  if (ok) pass(msg);
  else {
    failures++;
    console.log(`  ✖ ${msg}`);
  }
};

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();

// A fresh phone-sized page with no saved data. Google Fonts are stubbed so the
// test runs offline without a network error in the console.
async function openApp(context) {
  const ctx = context || (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" })
  );
  // Stand-in Wake Lock API that records what the app asks for.
  await ctx.addInitScript(() => {
    window.__wakeLog = [];
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type) => {
          window.__wakeLog.push(`request:${type}`);
          const lock = { released: false, release: async () => { lock.released = true; window.__wakeLog.push("release"); } };
          return lock;
        },
      },
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console error: ${m.text()}`);
  });
  await page.goto(pathToFileURL(PAGE).href);
  await page.waitForSelector("#root *", { timeout: 10000 });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

// Click the first button/label whose visible text matches `re`. Clicks are
// forced so a still-running animation never blocks the test.
async function tap(page, re, wait = 250) {
  const all = page.locator("button, [role=button], label");
  const texts = await all.evaluateAll((els) => els.map((el) => (el.innerText || "").replace(/\s+/g, " ").trim()));
  const i = texts.findIndex((t) => re.test(t));
  if (i < 0) throw new Error(`No button matching ${re}. Buttons: ${texts.filter(Boolean).slice(0, 40).join(" | ")}`);
  await all.nth(i).click({ force: true });
  await page.waitForTimeout(wait);
}
const hasButton = async (page, re) =>
  (await page.locator("button").evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, " ").trim()))).some((t) => re.test(t));
const bodyText = async (page) => (await page.innerText("body")).replace(/\s+/g, " ");

// Racer rows on the Track tab read like "1 HareAdamTheir turn 5/30lead".
async function positions(page) {
  const rows = await page.locator("button").evaluateAll((els) =>
    els.map((el) => el.innerText.replace(/\s+/g, " ").trim()).filter((t) => /\d+\/30/.test(t))
  );
  const out = {};
  for (const r of rows) {
    const m = r.match(/(Hare|Banana|Egg).*?(\d+)\/30/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

// Open every tab that isn't locked (most are locked mid-race), check it fits the
// phone width and nothing hides behind the tab bar, and save phone-screen
// screenshots as test-results/<stage>-<tab>-top.png / -bottom.png.
async function visitTabs(page, stage) {
  for (const tab of ["Racers", "Betting", "Track", "Dice", "History"]) {
    const button = page.locator("button", { hasText: new RegExp(`^${tab}$`) }).first();
    if (await button.isDisabled()) continue;
    await button.click({ force: true });
    await page.waitForTimeout(500);
    // Phone-screen shots (not full-page, which draws the fixed tab bar mid-page):
    // one at the top of the tab and one scrolled to the bottom.
    await page.screenshot({ path: join(SHOTS, `${stage}-${tab.toLowerCase()}-top.png`) });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(SHOTS, `${stage}-${tab.toLowerCase()}-bottom.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${stage}: ${tab} tab fits the phone width${overflow > 0 ? ` (${overflow}px too wide)` : ""}`);
    // Scrolled to the very bottom, the last card must end above the tab bar.
    const hidden = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const nav = document.querySelector('nav[aria-label="Sections"]');
      const main = nav && nav.previousElementSibling ? nav.parentElement : null;
      if (!nav || !main) return 0;
      const navTop = nav.getBoundingClientRect().top;
      const lastBottom = Math.max(...[...main.children].filter((el) => el !== nav).map((el) => el.getBoundingClientRect().bottom));
      return Math.max(0, Math.round(lastBottom - navTop));
    });
    check(hidden === 0, `${stage}: bottom of ${tab} isn't hidden behind the tab bar${hidden ? ` (${hidden}px covered)` : ""}`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

async function startHosting(page) {
  await tap(page, /^Skip$/).catch(() => {}); // first-run tips, if shown
  await tap(page, /Let's race/, 600); // the ticket flips
  await tap(page, /Let's race/, 1200);
}

async function setUpRace(page, track) {
  await startHosting(page);
  await tap(page, track === "wild" ? /^Wild Wilds/ : /^Mild Mile/);
  await tap(page, /^Add racer$/);
  const players = page.locator('input[placeholder="Who is racing?"]');
  const names = page.locator('input[placeholder^="Racer"]');
  const field = [
    ["Adam", "Hare"],
    ["Ann", "Banana"],
    ["Ari", "Egg"],
  ];
  for (let i = 0; i < field.length; i++) {
    await players.nth(i).fill(field[i][0]);
    await names.nth(i).fill(field[i][1]);
    await page.keyboard.press("Escape");
  }
  await tap(page, /^Lock roster/, 800);
  await tap(page, /^Got it$/).catch(() => {}); // race tip, if shown
}

// ---------------------------------------------------------------------------
console.log("\nLanding");
{
  const { ctx, page, errors } = await openApp();
  const text = await bodyText(page);
  check(/Host a game/.test(text), "landing shows Host a game");
  check(await hasButton(page, /^Join$/), "landing shows Join");
  check(errors.length === 0, `no errors on load${errors.length ? `: ${errors.join(" / ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log("\nWild Wilds race: track spaces, trip skip, undo");
{
  const { ctx, page, errors } = await openApp();
  await setUpRace(page, "wild");
  let pos = await positions(page);
  check(pos.Hare === 0 && pos.Banana === 0 && pos.Egg === 0, "race starts with everyone on Start");
  check((await page.evaluate(() => window.__wakeLog)).includes("request:screen"), "screen wake lock requested when the race starts");

  // Bottom tab bar: pinned to the bottom, big tabs, and never covering the race buttons
  const bar = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Sections"]');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    const tabs = [...nav.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height);
    const next = [...document.querySelectorAll("button")].find((b) => /Next turn/.test(b.innerText));
    return { bottom: r.bottom, top: r.top, vh: window.innerHeight, tabs, nextBottom: next ? next.getBoundingClientRect().bottom : null };
  });
  check(bar && Math.abs(bar.bottom - bar.vh) <= 1, "tab bar is pinned to the bottom of the screen");
  check(bar && bar.tabs.length === 5 && bar.tabs.every((h) => h >= 56), `tabs are at least 56px tall (${bar ? bar.tabs.map(Math.round).join(", ") : "no bar"})`);
  check(bar && bar.nextBottom !== null && bar.nextBottom <= bar.top, "Next turn button sits above the tab bar");

  // Hare → space 5 (trip)
  await tap(page, /^\+5$/);
  check(/Trip space · 5/i.test(await bodyText(page)), "landing on 5 prompts a trip");
  await tap(page, /mark as tripped/);
  check(/Tripped/.test(await bodyText(page)), "Hare is marked tripped");

  // Banana → space 1 (star)
  await tap(page, /Next turn/);
  await tap(page, /^\+1$/);
  check(/Star space · 1/i.test(await bodyText(page)), "landing on 1 prompts a star chip");
  await tap(page, /Got the chip/);

  // Egg → 6, then → 7 (arrow forward 3 → 10)
  await tap(page, /Next turn/);
  await tap(page, /^\+6$/);
  check(!/space · 6/i.test(await bodyText(page)), "plain space 6 has no prompt");
  await tap(page, /^\+1$/);
  check(/Arrow space · 7/i.test(await bodyText(page)), "landing on 7 prompts an arrow");
  await tap(page, /^Move forward 3/);
  pos = await positions(page);
  check(pos.Egg === 10, `arrow moves Egg to 10 (got ${pos.Egg})`);

  // Back to Hare, who is tripped and must skip
  await tap(page, /Next turn/, 400);
  check(/Tripped: skip main move/i.test(await bodyText(page)), "tripped Hare is prompted to skip");
  await tap(page, /Done — next turn/, 400);
  check(!/Tripped/.test((await positions(page), await bodyText(page))), "Hare stands back up after skipping");

  // Undo the arrow move: Egg goes back to 7
  await tap(page, /^Undo: Egg \+3/);
  pos = await positions(page);
  check(pos.Egg === 7, `undo puts Egg back on 7 (got ${pos.Egg})`);

  // Tabs open mid-race fit the phone and render without errors
  await visitTabs(page, "race");
  await tap(page, /^Track$/, 400);

  // Finish: Hare and Banana cross, which ends the race
  for (const name of ["Hare", "Banana"]) {
    // Tapping a row toggles it open/closed; the active racer's row is already open.
    const row = new RegExp(`^\\d+ (🎲 )?${name}`);
    await tap(page, row, 300);
    if ((await page.locator('input[placeholder="0–30"]').count()) === 0) await tap(page, row, 300);
    await page.locator('input[placeholder="0–30"]').first().fill("30");
    await tap(page, /^Go$/, 500);
  }
  await page.waitForTimeout(400);
  const text = await bodyText(page);
  check(/Race finished/i.test(text), "race ends when the 2nd racer crosses");
  check((await page.evaluate(() => window.__wakeLog)).includes("release"), "wake lock released when the race ends");
  check(/1st/.test(text) && /2nd/.test(text), "1st and 2nd places shown");

  // Saved game survives a reload
  await page.reload();
  await page.waitForSelector("#root *");
  await page.waitForTimeout(600);
  check(/Continue/i.test(await bodyText(page)), "after reload, landing offers to continue the saved game");

  check(errors.length === 0, `no errors during the race${errors.length ? `: ${errors.join(" / ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log("\nMild Mile race");
{
  const { ctx, page, errors } = await openApp();
  await setUpRace(page, "mild");
  await tap(page, /^\+5$/);
  check(!/space · 5/i.test(await bodyText(page)), "Mild Mile has no space prompts");
  check(errors.length === 0, `no errors${errors.length ? `: ${errors.join(" / ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log("\nDraft roll-off");
{
  const { ctx, page, errors } = await openApp();
  await startHosting(page);
  await tap(page, /^Run a draft$/, 600);
  await tap(page, /^Got it$/).catch(() => {});
  check(!(await hasButton(page, /^Roll off/)) || (await page.locator("button", { hasText: /^Roll off/ }).isDisabled()),
    "roll-off waits until players and races are chosen");
  await tap(page, /^3 ?✓?$/); // players
  const labels = await page.locator("button").evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, "")));
  await page.locator("button").nth(labels.lastIndexOf("2✓")).click({ force: true }); // races
  await page.waitForTimeout(200);
  await tap(page, /^Roll off/, 600);
  for (let i = 0; i < 3; i++) await tap(page, /^Roll$/, 50);
  check(await page.locator("button", { hasText: /^Confirm order$/ }).isDisabled(), "Confirm order is disabled while dice are rolling");
  await page.waitForTimeout(3000);
  const rolls = await page.locator('[role="status"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  const values = rolls.map((l) => Number((l || "").match(/rolled (\d)/)?.[1])).filter(Boolean);
  check(values.length === 3 && values.every((v) => v >= 1 && v <= 6), `all three dice land on 1–6 (${values.join(", ")})`);
  await page.screenshot({ path: join(SHOTS, "draft-rolloff.png") });
  check(errors.length === 0, `no errors${errors.length ? `: ${errors.join(" / ")}` : ""}`);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log("\nMobile checks");
{
  const { ctx, page } = await openApp();
  // iOS zooms the page when an input with a font under 16px is focused.
  const smallInputs = () =>
    page.locator("input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea").evaluateAll((els) =>
      els
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ name: el.placeholder || el.getAttribute("aria-label") || el.type, size: parseFloat(getComputedStyle(el).fontSize) }))
        .filter((x) => x.size < 16)
    );
  const found = new Map();
  const collect = async () => (await smallInputs()).forEach((x) => found.set(x.name, x));
  await collect(); // landing (PIN entry)
  await startHosting(page);
  await collect(); // race setup
  await tap(page, /^Betting$/, 400);
  await collect();
  await visitTabs(page, "setup"); // every tab is open before the race starts
  await tap(page, /^Racers$/, 400);
  await tap(page, /^Run a draft$/, 600);
  await tap(page, /^Got it$/).catch(() => {});
  await collect(); // draft
  const small = [...found.values()];
  const msg = `inputs at 16px or larger (iOS zoom)${small.length ? ` — ${small.length} too small: ${small.map((x) => `${x.name} ${x.size}px`).join(", ")}` : ""}`;
  if (STRICT_INPUT_FONT) check(small.length === 0, msg);
  else if (small.length) warnings.push(msg);
  else pass(msg);
  await ctx.close();
}

await browser.close();

for (const w of warnings) console.log(`\n  ⚠ known issue: ${w}`);
console.log(`\nScreenshots: test-results/`);
if (failures) {
  console.log(`\n✖ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\n✓ All checks passed.");

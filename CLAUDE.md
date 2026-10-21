# Magical Athlete Tracker

Race tracker, betting and draft companion for the Magical Athlete board game.
Mobile-first: it's used on phones at the table.

## Source of truth

- **`magical-athlete-tracker.jsx` in this repo is the app.** One file, React 18,
  Tailwind classes, lucide-react icons, storage through `window.storage`.
- It ships two ways, both built from that one file:
  - **claude.ai artifact** (`npm run build:artifact` → `dist/magical-athlete.html`):
    https://claude.ai/artifact/7NwzKSA9UdiRtRmhZ7z47U (also shown as
    `claude.ai/code/artifact/33a756bd-…`). Changes only when republished.
  - **Hosted web app / PWA** (`npm run build:web` → `dist-web/`), deployed to Firebase
    Hosting at https://magical-athlete.web.app (Firebase project `magical-athlete`). This is what spectators without claude.ai accounts will use (the
    intended venue is a retirement-village game night). Setup and deploy:
    `docs/DEPLOY.md`. **Every push to `main` deploys it automatically** (GitHub
    Action `.github/workflows/firebase-hosting-merge.yml`, about a minute); pull
    requests get a preview link. Check runs with
    `gh run list -R Hyjinks/Magical-Athlete-tracker-wager`.
- Both builds put `<meta name="ma-build" content="<commit>">` in the page (view
  source to see which commit is live; `-dirty` = built with uncommitted app changes).
- Old versions, kept for reference only — never build from them or copy code back:
  `archive/vite-pwa-july-2026/` (the July installable-PWA version; see
  `archive/README.md`). Older versions of the app itself are in git history.
- The claude.ai Project gets this repo through its GitHub sync (press sync in the
  Project to refresh it). Don't upload copies of repo files to the Project by hand —
  they go stale and mislead later chats.

## Every change: the checklist

1. Edit `magical-athlete-tracker.jsx` only.
2. `npm run check` — lint, both builds, smoke test against both. All must pass.
   - Lint errors block the build. Warnings are allowed but read them.
3. Look at the phone-screen screenshots in `test-results/` for any tab you touched
   (`setup-*` before a race, `race-*` mid-race — only Track and Dice open mid-race;
   `-top` and `-bottom` of each).
   Google Fonts are stubbed in the test, so headings show a fallback font there.
4. Publish `dist/magical-athlete.html` with the Artifact tool, passing the URL above
   so it updates in place (a new URL would lose people's saved games).
5. Commit and push to `main` (`git fetch origin main && git rebase origin/main` first).
   That also redeploys the web app automatically; check the run succeeded.
6. For anything about feel — animations, timing, layout on a real phone — tell Adam
   it was checked headless only and ask him to try it on his phone.

**Never hand-edit the published artifact or `dist/`.** That's how the draft-chips
syntax error took the live app down. Fix the source and rebuild.

## Setup in a fresh session

```bash
npm install                       # once per session
npx playwright install chromium   # only if the smoke test can't find a browser
npm run check
```

## Gotchas (learned the hard way)

- **Missing imports pass the build.** esbuild treats undefined names as globals, so a
  missing icon import only shows up as a crash on a phone. ESLint `no-undef` /
  `react/jsx-no-undef` is what catches it — that's why the build runs lint first.
  Icons passed as props (`icon={Trophy}`) still need importing.
- **iOS input zoom.** Any `<input>`, `<select>` or `<textarea>` with a font under 16px
  makes iPhones zoom in when tapped. A base CSS rule sets fields to 16px, but a class
  beats it — so never put `text-sm` / `text-xs` on a field, including via a
  `className` prop passed to a component that renders one (`RacerNameField`). The
  smoke test fails if any visible field is under 16px.
- **48px touch targets.** A global rule makes every button at least 48×48px. For small
  chips and pills, keep the button as the 48px hit area and draw the visible shape on
  an inner element (e.g. a 28px-high span, `items-center` on the row). For an icon
  button inside a chip or row, use negative margins so the hit area doesn't grow the
  row.
- **Tailwind is generated fresh** from the source on every build
  (`tailwind.config.cjs`), so any Tailwind class works. (Old advice to use inline
  styles because the artifact's CSS was purged only applied to hand-patching the
  artifact, which we no longer do.)
- **Storage.** The app only talks to `window.storage.get/set/delete/list(key, shared)`.
  On claude.ai the host provides it. In the web app (`src/main.jsx`) personal keys
  go to localStorage (`src/storage-local.js`, keys `ma:`) and shared keys go to
  Cloud Firestore (`src/storage-shared-firebase.js`, collection `shared`, one doc
  per key: `{key, value, owner, updatedAt}`, anonymous sign-in, live listeners so
  polling costs no reads; Firebase is only downloaded once a shared key is used).
  Shared keys: `join:<4-digit code>` (one per game, claimed when spectator betting
  starts), `race:<token>` (snapshot), `bet:<token>:<raceId>:<id>`. Tokens and ids
  must stay alphanumeric — **`firestore.rules` only accepts those three key
  patterns**, so a new shared key needs a rules change, deployed by Adam
  (`npx firebase-tools deploy --only firestore:rules`; the GitHub Action only
  deploys hosting). When sweeping a session, delete bets before the `race:`
  doc — the rules let the host delete spectators' bets only while it owns that
  doc. The rules also accept a new bet only while the race snapshot is for that
  bet's race and says `"status":"setup"` — they match the start of the JSON, so
  **the snapshot object must keep `raceId` then `status` as its first two keys**
  — and a stored bet can only be rewritten unchanged (retries reuse the bet's id;
  `betValue()` is the one place a bet's stored JSON is made).
  **Test rule changes with `npm run test:rules`** (needs Java; it downloads the
  Firestore emulator once into `node_modules/.cache`; not part of `npm run check`).
  The smoke test sets `window.__MA_SHARED_BACKEND__ = "local"` and uses pages in
  one browser context as host and spectators (`window.__MA_SPECTATOR_ID__` gives
  a page its own phone id), and `tests/storage-shared.test.mjs` checks the
  adapter against a fake Firestore.
- **Spectator betting.** Firestore reads come from live listeners, so they never
  fail offline — they return the last value with `stale: true` (and `pending:
  true` for this phone's own unconfirmed write). Anything showing "live" data
  must treat stale as a miss (`SYNC_TROUBLE_MS`). A spectator's phone keeps
  `spectator-session` (which game, to rejoin after a reload), `spectator-bets`
  (its bets on the current race, each `sending` / `placed` / `rejected`) and
  `spectator-id` (random, per phone). The host keeps `spectatorNames` (name →
  phone, first to bet keeps it; shared as `takenNames`) and turns bets down with
  `spectatorBetProblem()` — late (past `LATE_BET_GRACE_MS`), invalid, or someone
  else's name — by deleting them; the spectator's phone notices and says why.
- **Service worker (web app).** It caches the whole app so it opens on patchy Wi-Fi,
  and updates itself the next time the app is opened. `firebase.json` stops
  `index.html` and `sw.js` being cached by the browser so updates are seen. The smoke
  test blocks service workers except in its "Installable web app" section, because an
  installed worker fetches Google Fonts past the test's offline stub.
- **Bottom tab bar.** Host screens have a fixed bottom `TabBar` (56px tabs, padded
  for the iPhone home bar). Its height is `TAB_BAR_SPACE`, exposed to CSS as
  `--ma-tabbar`. Anything sticky at the bottom of a host screen must use
  `.ma-above-tabbar` (or `.ma-on-tabbar`), not `bottom-0` / `bottom-3`, or it hides
  behind the bar. Modals use `z-50`; the bar is `z-40`.
- **Safe areas.** `viewport-fit=cover` is on, so the app pads for the notch at the
  top and the bar pads for the home bar. The page background follows the theme so
  those areas aren't the wrong colour. Headless tests can't simulate a notch —
  check on a real iPhone.
- **Wake lock.** `useWakeLock` keeps the host's screen on while racing. It fails
  silently where the browser or frame doesn't allow it; the smoke test checks it's
  requested and released using a stand-in API.
- **First-visit effects** (the landing flag wipe) are skipped for anyone with saved
  games. Tapping the title replays it.
- **Boards.** Both Mild Mile and Wild Wilds are 30 spaces (Start = 0, finish = 30).
  Wild Wilds effect spaces live in `WILD_WILDS_SPACES` and were checked against the
  physical board: stars 1 and 13; trips 5, 17, 26; arrows +3 at 7, +1 at 11, −4 at 16,
  +2 at 23, −2 at 24.
- **Undo** works on one history (`moveHistory`) of moves, "Next turn" hand-offs and
  trip skips, newest first. Every entry records whose turn it was before it
  (`prevActiveRacerId`, `prevTurnHasMoved`) so Undo restores the turn exactly. Anything
  new that changes the race (positions, turn, trips, chips) must add an entry or attach
  to one, or Undo will drift from the table. Entries with no `kind` are old saved moves.
  The automatic hand-off when a racer finishes is part of that move's entry. Tapping a
  row to fix whose turn it is is *not* recorded.
- **Animations** must respect `prefers-reduced-motion` (the macOS / Windows /
  iOS / Android "Reduce Motion" setting; WCAG 2.1 2.3.3). Two layers:
  - CSS: the `@media (prefers-reduced-motion: reduce)` block in the app's
    `<style>` has a catch-all that makes every animation and transition instant
    (it also beats inline `transition` styles), plus specific rules for the rest.
    A looping animation that is also a cue (Next turn pulse) becomes a static
    state, not nothing.
  - JS: anything driven from code checks `prefersReducedMotion()` — the dice
    tumble, draft roll-off flicker, the ticket-tear hand-off, the race-list
    reorder slide, the intro tour's smooth scroll. Rapid flicker is the one that
    matters most for epilepsy, so never add a timer that cycles visuals without
    checking it.
  - `tests/smoke.mjs` has a "Reduce Motion" section that emulates the setting and
    fails if anything loops or runs longer than a blink. Rolling the dice and
    starting a game take one fewer tap with it on (no ticket flip).

## Layout

```
magical-athlete-tracker.jsx   the app
scripts/build-artifact.mjs    the only way to build the artifact → dist/magical-athlete.html
scripts/artifact/entry.jsx    artifact entry: mounts the app
index.html, src/main.jsx      web app entry (Vite) → dist-web/
vite.config.js                web build + PWA manifest and service worker
public/icons/                 home-screen icons
src/storage-local.js          window.storage from localStorage (both builds)
src/storage-shared-firebase.js  shared keys → Firestore (web app only)
src/firebase-config.js        Firebase web config (public by design)
firestore.rules               who can read/write shared keys (deploy by hand)
src/styles.css                Tailwind input + page base styles (both builds)
firebase.json, docs/DEPLOY.md Firebase Hosting config and setup steps
tests/smoke.mjs               headless phone-size play-through of both builds
tests/storage-shared.test.mjs Firestore adapter against a fake Firestore
tests/logic.test.mjs          payouts, names, bet checks (app bundled with esbuild)
tests/rules.test.mjs          firestore.rules on the emulator (npm run test:rules)
archive/                      old versions, reference only (not built or linted)
```

## Known issues (October 2026 review)

- Spectators on other phones: Firestore is wired up (web app only). A host-phone plus
  desktop-browser spectator test passed on 10 Oct 2026; a spectator on a real phone,
  several spectators at once, and a 3-4 phone practice run are still to do. The host's
  join screen shows a QR code (library `qrcode-generator`; only when the page has a
  shareable http(s) address). Not yet scanned with a real phone camera.
- `App()` is ~1,600 lines; the file is ~7,300.

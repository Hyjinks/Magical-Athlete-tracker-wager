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
    `docs/DEPLOY.md`. Deploying needs Adam's Firebase login, or the GitHub Action
    from DEPLOY.md Part C if he has set it up.
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
   The web app is redeployed from `main` (by Adam, or automatically if Part C of
   `docs/DEPLOY.md` is set up) — say so when a change needs it.
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
  On claude.ai the host provides it. Everywhere else `src/storage-local.js` provides it
  from localStorage (keys `ma:` personal, `ma-s:` shared). In the web app, shared keys
  (join code `session-pin`, race snapshot `race:<token>`, bets `bet:<token>:<raceId>:<id>`)
  are still device-local until the Firestore step — spectators on other phones can't
  join yet.
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
- **Animations** must respect `prefers-reduced-motion`.

## Layout

```
magical-athlete-tracker.jsx   the app
scripts/build-artifact.mjs    the only way to build the artifact → dist/magical-athlete.html
scripts/artifact/entry.jsx    artifact entry: mounts the app
index.html, src/main.jsx      web app entry (Vite) → dist-web/
vite.config.js                web build + PWA manifest and service worker
public/icons/                 home-screen icons
src/storage-local.js          window.storage from localStorage (both builds)
src/styles.css                Tailwind input + page base styles (both builds)
firebase.json, docs/DEPLOY.md Firebase Hosting config and setup steps
tests/smoke.mjs               headless phone-size play-through of both builds
archive/                      old versions, reference only (not built or linted)
```

## Known issues (October 2026 review)

- The spectator snapshot doesn't include the track or who is tripped.
- Spectators on other phones need the Firestore step (shared keys → Firestore, with
  security rules and invisible anonymous sign-in), then QR-code joining and a larger,
  simpler spectator screen for older users.
- `App()` is ~1,600 lines; the file is ~7,200.

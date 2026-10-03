# Magical Athlete Tracker — PWA scaffold

This is the standalone, installable-as-an-app version of the race tracker,
extracted from the Claude artifact it was originally built in. The game
logic, UI, and every feature are untouched — only the storage layer changed,
since the original relied on `window.storage`, an API that only exists
inside Claude's artifact sandbox.

## ⚠️ Before you run this

**I was not able to run `npm install` or verify a real build** while
building this scaffold — the sandbox I built it in blocks access to the npm
registry, so nothing here has been build-tested end to end. Every file has
been checked for syntax correctness (JSON validity, JS/JSX parsing), and the
project structure follows the standard, well-documented Vite + React +
Tailwind + `vite-plugin-pwa` setup — but "parses correctly" is not the same
guarantee as "builds and runs correctly." **The very first thing to do is
`npm install && npm run dev` and see what happens.** Treat anything below as
the intended next steps, not a promise that it's flawless.

## 1. Install and run locally

```bash
npm install
npm run dev
```

This gets you the full app running in your browser — drafting, racing,
dice, history, career stats, house rules — all working immediately, because
**personal data (roster, theme, history, house rules, the whole in-progress
race) is backed by `localStorage` out of the box.** No setup needed for
that half.

## 2. What still needs work: spectator sync

The betting system's join-with-a-code flow — where a spectator opens the
same link on their own phone and bets live — needs **shared** storage that
every device can read and write, which `localStorage` fundamentally cannot
do (it's private to one browser on one device).

Right now, `src/lib/storage.js` falls back to `localStorage` for shared
calls too, with a console warning. That means **the app will run and the
host device will work fine standalone — spectator betting just won't
actually sync to a second device** until a real backend is wired in.

### Wiring up a real backend

Firebase Firestore or Supabase are both a good fit — generous free tiers,
minimal setup, and their real-time listeners are a genuine upgrade over the
4-second polling the original app used.

The integration point is exactly four methods. Create a new file, e.g.
`src/lib/firestoreAdapter.js`:

```js
// Each method must behave like storage.js's personal-storage functions,
// just backed by Firestore instead of localStorage.
export const firestoreAdapter = {
  async get(key) { /* ... */ },
  async set(key, value) { /* ... */ },
  async delete(key) { /* ... */ },
  async list(prefix) { /* returns { keys: [...] } */ },
};
```

Then in `src/main.jsx`, before rendering `<App />`:

```js
import { setSharedAdapter } from "./lib/storage";
import { firestoreAdapter } from "./lib/firestoreAdapter";
setSharedAdapter(firestoreAdapter);
```

That's the whole integration surface — nothing in `App.jsx` needs to
change. The three things that use shared storage are the spectator join
PIN, the live race snapshot spectators poll, and individual bets — all
already routed through `storage.get/set/delete/list(key, shared=true)`.

**A nice option once you're on Firestore/Supabase:** replace the polling
loops in `App.jsx` (search for `setInterval(poll, 4000)`) with real-time
`onSnapshot`-style listeners. Spectator updates go from "every few seconds"
to instant, and it's less code than the polling it replaces.

## 3. Icons

`public/icons/` has a full set (192, 512, maskable 512, Apple touch icon)
generated to match the app's existing poster theme — but they're a generic
placeholder (a die on a red background), not official Magical Athlete
artwork, since I don't have access to that. Swap them for real branding
whenever you're ready; keep the same filenames and sizes and nothing else
needs to change.

## 4. Deploy

Any static host with HTTPS works — HTTPS is a hard requirement for the
service worker. Vercel, Netlify, and Firebase Hosting all have a free tier
and take about the same amount of setup:

```bash
npm run build   # outputs to dist/
```

Point whichever host you pick at the `dist/` folder (most of them auto-run
`npm run build` for you if you connect the repo directly).

## 5. Test the PWA install for real

This hasn't been tested on an actual device yet — simulated logic only.
Once deployed:

- **Android (Chrome):** visit the URL, look for the install prompt (or
  ⋮ menu → "Install app"). Should land as a real home-screen icon with no
  browser chrome.
- **iOS (Safari):** no auto-prompt — Share button → "Add to Home Screen."
  The `apple-mobile-web-app-*` meta tags in `index.html` are what make this
  look like a real app instead of a bookmark shortcut.
- **The actual test that matters:** host a race on one phone, join as a
  spectator from a second phone on a different network, place a bet, confirm
  it shows up on the host's device. This is the first time that flow gets
  tested outside of simulation.

## 6. Optional: Play Store

Once the PWA is live at a real URL, [PWABuilder.com](https://www.pwabuilder.com)
or Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) CLI
can wrap it as a Trusted Web Activity — a thin native shell around the same
PWA, not a rewrite. Needs a Google Play Console account ($25 one-time).

## Project structure

```
magical-athlete-pwa/
├── index.html              # entry HTML + iOS PWA meta tags
├── vite.config.js          # Vite + vite-plugin-pwa (manifest + service worker)
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── public/
│   └── icons/               # generated placeholder icons (swap for real art)
└── src/
    ├── main.jsx             # entry point — wire setSharedAdapter() here
    ├── App.jsx               # the whole app, ported from the Claude artifact
    ├── index.css             # Tailwind directives
    └── lib/
        └── storage.js         # window.storage replacement (see §2 above)
```

`App.jsx` is intentionally still one large file, matching the original —
splitting it into multiple component files is a reasonable next cleanup
step, but was out of scope for getting a working scaffold in place.

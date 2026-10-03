# Archive — not the live app

Nothing in here is built, linted or published. The live app is
`magical-athlete-tracker.jsx` in the repo root.

## vite-pwa-july-2026/

The installable-PWA version of the app (Vite + React + Tailwind +
`vite-plugin-pwa`), as uploaded to the claude.ai Project on 27 July 2026.
Kept here when those uploads were removed from the Project in October 2026, so
nothing is lost.

- `src/App.jsx` is a **July** snapshot of the app (4,849 lines). It's behind the
  live file in every way: no Wild Wilds prompts, no landing screen, no bottom
  tab bar, no 16px inputs, no wake lock. Don't copy code back from it.
- `src/lib/storage.js` was never uploaded, so it isn't here. The README in this
  folder describes what it did (`localStorage` plus a `setSharedAdapter()` hook
  for a future Firestore/Supabase backend).
- The August rework of this version (App.jsx split into 33 modules, bottom
  `TabBar`, `useWakeLock`) was never uploaded either; if it still exists, it's on
  Adam's computer.
- Still useful if the app moves to a proper installable PWA: `vite.config.js`
  (web-app manifest and service worker), the iOS home-screen tags in
  `index.html`, and the icons in `public/icons/` (192, 512, maskable 512, Apple
  touch 180).

# Magical Athlete Tracker

Race tracker, betting and draft assistant for the Magical Athlete board game.
React + Vite + Tailwind, installable as a PWA.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server |
| `npm run lint` | ESLint with `no-undef`. Run before every commit: esbuild and Vite treat a missing import as a global, so lint is the only reliable gate |
| `npm run build` | Production PWA build into `dist/` (deploy this folder; HTTPS is required for the service worker) |
| `npm run build:artifact` | One-file build for the claude.ai artifact, written to `dist-artifact/magical-athlete.html` |

## Layout

- `src/App.jsx`: the whole app (single file for now; can be split into modules later)
- `src/storage.js`: installs `window.storage`, backed by localStorage with an in-memory fallback. Keep the `ma:` / `ma-s:` key prefixes
- `src/main.jsx`: entry point
- `public/icons/`: PWA icons (placeholder artwork; swap in real branding with the same filenames and sizes)
- `scripts/build-artifact.mjs` and `vite.artifact.config.js`: artifact build

## Updating the artifact

The artifact is a separate published page, so pushing to GitHub does not change it. After a change, run `npm run build:artifact`, then publish `dist-artifact/magical-athlete.html` to the existing artifact URL (or ask Claude to "update the artifact").

## Storage

Everything is device-local today. To share the join PIN, live race snapshot and bets across devices, swap the shared-key branch in `src/storage.js` for a Firestore or Supabase adapter. Nothing in `App.jsx` needs to change.

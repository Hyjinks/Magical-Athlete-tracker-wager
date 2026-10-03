# Magical Athlete Tracker & Wager

A phone-friendly companion for the Magical Athlete board game: run the draft, track
the race on Mild Mile or Wild Wilds (with prompts for star, arrow and trip spaces),
take bets, and keep a history of games.

The app is `magical-athlete-tracker.jsx`. It's published two ways from that one file:
as a claude.ai artifact, and as an installable web app on Firebase Hosting
(see `docs/DEPLOY.md`).

## Build and check

```bash
npm install
npm run check   # lint → build both → headless smoke test of both
```

- `npm run lint` — ESLint (catches missing imports, which the bundler doesn't)
- `npm run build` — builds the artifact (`dist/`) and the web app (`dist-web/`)
- `npm run dev` — runs the web app locally with live reload
- `npm test` — unit-tests the Firestore adapter, then plays through a race, the draft and spectator
  betting at phone size; screenshots go to `test-results/`

See `CLAUDE.md` for the full workflow and the gotchas behind it. Old versions are in
`archive/` (reference only).

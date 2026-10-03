# Magical Athlete Tracker & Wager

A phone-friendly companion for the Magical Athlete board game: run the draft, track
the race on Mild Mile or Wild Wilds (with prompts for star, arrow and trip spaces),
take bets, and keep a history of games.

The app is `magical-athlete-tracker.jsx`. It's published as a claude.ai artifact.

## Build and check

```bash
npm install
npm run check   # lint → build dist/magical-athlete.html → headless smoke test
```

- `npm run lint` — ESLint (catches missing imports, which the bundler doesn't)
- `npm run build` — builds the single-file page in `dist/`
- `npm test` — plays through a race and the draft at phone size; screenshots go to `test-results/`

See `CLAUDE.md` for the full workflow and the gotchas behind it.

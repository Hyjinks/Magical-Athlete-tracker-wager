# Putting the web app online (Firebase Hosting)

The hosted web app is the same Magical Athlete app as the claude.ai artifact,
built from the same file. Once it's online, anyone can open it from a link or a
QR code: no claude.ai account and no app store. On a phone it can also be added
to the home screen like a normal app.

This is a one-off setup. It needs your Google login, so it's yours to do.

## Part A — create the Firebase project (in a browser, about 5 minutes)

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it something like `magical-athlete`. Firebase adds a suffix to make the
   project ID unique, for example `magical-athlete-3f2a1`. Note the project ID.
4. Google Analytics: turn it **off**. It isn't needed.
5. Click **Create project** and wait for it to finish, then **Continue**.
6. Leave the project on the free **Spark** plan. Hosting and Firestore both fit
   comfortably in the free tier for game nights.

That's all for now. Firestore (for spectators) is Part D.

## Part B — first deploy (from your computer, about 10 minutes)

You need Node.js 20 or newer (https://nodejs.org, "LTS") and Git
(https://git-scm.com).

Type these commands into a terminal, not the "Node.js" app (that's Node's own
interactive prompt, marked with `>`). On Windows, open **Command Prompt** from the
Start menu. PowerShell works too, but it sometimes blocks `npx`; if it does, use
Command Prompt instead.

```bash
# 1. Get the latest code (or `git pull` if you already have it)
git clone https://github.com/Hyjinks/Magical-Athlete-tracker-wager.git
cd Magical-Athlete-tracker-wager

# 2. Install the project's tools (once)
npm install

# 3. Build the app (lint + both builds)
npm run build
#    `npm run check` also runs the full smoke test; it needs a one-off
#    `npx playwright install chromium` first. Not needed just to deploy.

# 4. Sign in to Firebase (opens a browser window; once per computer)
npx firebase-tools login

# 5. Point the repo at your project — use the project ID from Part A
npx firebase-tools use --add
#    Pick your project from the list, and type `default` when it asks for an alias.
#    (Already done for `magical-athlete` — the repo's .firebaserc points there.)

# 6. Put it online
npx firebase-tools deploy --only hosting
```

The last command prints the address, something like
`https://magical-athlete-3f2a1.web.app`. Open it on your phone. That's the app.

To update it later: `git pull`, `npm run build`, then step 6 again.

## Part C — optional: deploy automatically on every push

So you never have to run step 6 yourself:

```bash
npx firebase-tools init hosting:github
```

Answer: your GitHub repo is `Hyjinks/Magical-Athlete-tracker-wager`; **yes** to
running a build before deploy, with the build command `npm ci && npm run build`;
**yes** to deploying on merge to `main`; branch `main`. It sets up a GitHub
Actions workflow and the secret it needs. Commit the workflow file it creates.

## Checking it on your phone

- Open the address in Safari (iPhone) or Chrome (Android).
- iPhone: Share → **Add to Home Screen**. Android: ⋮ menu → **Install app**.
- Open it from the home-screen icon: it should fill the screen with no browser
  bars, and the tab bar should sit just above the home indicator.
- Turn on airplane mode and reopen it: it should still load (it caches itself).

Note: saved games and history live on each phone, separately for the web app and
the claude.ai artifact, so a game started in one doesn't show up in the other.

## Part D — spectators on other phones (Firestore)

Spectators' phones talk to the host's phone through Cloud Firestore. Nobody
signs in: each phone gets an invisible anonymous account.

One-off, in the Firebase console (done for `magical-athlete`):

1. **Build → Authentication → Get started → Sign-in method → Anonymous →
   Enable → Save.** Turn on automatic clean-up of anonymous accounts.
2. **Build → Firestore Database → Create database**, location
   `australia-southeast1`, start in production mode.
3. **Project settings → Your apps → Web app**; its config is in
   `src/firebase-config.js`.

Then, from your computer, deploy the security rules (they decide who can read
and change what; until they're deployed, spectator betting can't start):

```bash
git pull
npx firebase-tools deploy --only firestore:rules
```

Run that again whenever `firestore.rules` changes. Pushing to `main` only
redeploys the app, not the rules.

### Two-phone test

1. Phone A: open the app → Host a game → add two or three racers → Betting →
   **Post odds** → **Enable spectator betting**. Note the 4-digit code.
2. Phone B (on mobile data, not the same Wi-Fi, to be sure): open the app →
   Join with a code → enter a name and the code → Join. It should show
   "Betting open" and the odds.
3. Phone B: pick a racer, an amount, **Place bet**. Within about 5 seconds the
   bet appears on phone A under its spectators.
4. Phone A: start the race and move a racer. Phone B follows along.
5. Phone A: **Stop hosting spectator betting**. Phone B says "Host closed
   betting".

If step 1 says "Couldn't start spectator betting", the rules probably aren't
deployed, or anonymous sign-in isn't enabled.

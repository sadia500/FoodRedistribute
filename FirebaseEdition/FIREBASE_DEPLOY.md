# Deploying the Firebase Edition (free, stays live, no card needed)

This is a fully client-side version of the dashboard — all the matching/DSA
logic runs in the browser (`app.js`) and reads/writes Firestore directly.
There's no server to run, so it deploys to **Firebase Hosting** (Spark
plan — free forever, no credit card).

The original C++ project (`FoodRedistributionSystem(new)/`, `WebEdition/`)
is untouched — this is a separate, self-contained folder.

## 1. Install the Firebase CLI (one-time)

Open a terminal in VS Code, in the repo root (`FoodRedistribution/`), and run:

```
npm install -g firebase-tools
firebase login
```

`firebase login` opens a browser window — sign in with the same Google
account you used to create the `foodredistribution-app` Firebase project.

## 2. Initialize (one-time)

Still in the repo root:

```
firebase init
```

- Which features: select **Hosting** and **Firestore** (use spacebar to
  select both, then Enter).
- "Use an existing project" → pick `foodredistribution-app`.
- Firestore rules file: it'll ask for a path — since `firestore.rules` and
  `firebase.json` are already sitting in this repo (in `FirebaseEdition/`
  and the repo root respectively), tell it to use the existing ones when
  prompted, or just accept the defaults it suggests (they match what's
  already there).
- Public directory: type `FirebaseEdition`
- Configure as a single-page app: **No**
- Set up automatic builds with GitHub: **No** (not needed)
- Overwrite `FirebaseEdition/index.html`: **No** (keep the existing one)

This creates a `.firebaserc` file pointing at your project — that's fine to
commit, it's just a project-id pointer, not a secret.

## 3. Deploy

```
firebase deploy
```

That's it. It'll print a Hosting URL like:

```
https://foodredistribution-app.web.app
```

Open that — it's live, permanently, for free. No sleep/idle delay like
Render's free tier (static hosting doesn't spin down).

## 4. Updating later

Any time you change `FirebaseEdition/index.html` or `app.js`, just run
`firebase deploy` again from the repo root to push the update live.

## Notes

- Firestore is in **test mode** (open read/write) — fine for a portfolio
  demo. If you ever want to restrict it, edit `firestore.rules` and run
  `firebase deploy --only firestore:rules`.
- This uses the Spark (free) plan. Firebase Hosting's free tier is 10GB
  storage / 360MB per day transfer — far more than a demo site needs, and
  there's no card on file, so nothing can ever accidentally charge you.

# Demo data cleanup

The live Firestore database currently has a few ad-hoc test rows left over
from early manual testing (for example a request named "Test Patient" and a
donor named "XYZ", plus inconsistent capitalization on a couple of names).
None of that is a code problem — it's just data that was fine for poking at
the app locally but isn't something to show anyone else.

## To clean up

1. Open the [Firebase console](https://console.firebase.google.com/) →
   your project → Firestore Database.
2. Go through `donors`, `donations`, `requests_urgent`, `requests_pending`,
   and `requests_fulfilled`, and delete any row that's obviously test data
   rather than a real (or realistically-named demo) donor/recipient.
3. Re-seed with `seed-data.json` in this folder — either add those rows by
   hand through the console's "Add document" UI, or use Firebase's own
   import tooling if you're comfortable with the CLI.

Since Phase 1 now requires sign-in for every read/write, you'll need to be
signed in through the app (create an account from the "Create account" tab
on the login screen) before any of this data is reachable — the open,
no-login test-mode access is gone.

## Why this wasn't done automatically

There's no automated script here that connects to your live database and
rewrites it directly, on purpose — that would need a Firebase service
account key (a real credential), and putting that into a script that also
gets committed to the repo is exactly the kind of secret-in-source-control
mistake worth avoiding. Doing this by hand once, from the console, is a
five-minute job and doesn't require handling any credentials.

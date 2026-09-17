# IMPLEMENTATION_PLAN.md — FoodRedistribute

Gap analysis and phased plan comparing the existing "Food Redistribution System / Dispatch" codebase against the FoodRedistribute specification. Written per the spec's Step 1 instruction — **no implementation has started**. This is the review checkpoint.

## 0. Read this first — scope reality check

The spec describes a five-role production marketplace (restaurants, NGOs, requesters, volunteers, admin) with auth, verification workflows, a matching/scoring engine, a delivery state machine, notifications, file uploads, maps, audit logging, analytics, a full test suite, and a real-user pilot. That is a multi-month build for a small team, not a single pass.

The existing project is something different in kind, not just in degree: a **single-page, no-login, client-side dashboard** whose entire purpose is to demonstrate hand-rolled data structures (Stack, Queue, PriorityQueue/heap, linked list, weighted graph + Dijkstra) against one shared Firestore database that anyone can read and write. There are no user accounts at all — "donor" and "recipient" are just form fields, not logins.

Given this was framed elsewhere as a 3rd-year CS project meant to be presentable, not a startup: treat the phases below as a menu, not a mandate. Phases 1–3 (auth, roles, real matching against multiple donations) would already make this a substantially stronger, still-honest portfolio piece. Phases 4–8 (volunteers, delivery tracking, notifications, file uploads, admin analytics, full test suite, pilot) are what turn it into the marketplace the spec describes — worth scoping down or dropping entirely unless there's a real reason to build a production platform. Nothing below should start until you say which phases you actually want.

## 1. Current state (as inspected)

**Repo contains three independent implementations of the same core logic**, not one app with variants:

- `FoodRedistributionSystem(new)/` — the original: a Windows console app in C++ (`<Windows.h>`, CSV files for persistence). Source of truth for the DSA logic.
- `WebEdition/` — the same C++ engine behind a local JSON API (`httplib`), with its own dashboard HTML. Runs locally / in a container; not what's deployed.
- `FirebaseEdition/` — a client-side JavaScript port of the same logic (`firebase-app.js`, 314 lines), reading/writing Firestore directly, deployed as static hosting. **This is the live app** at foodredistribution-app.web.app, and the one the spec is asking to be evaluated against.

**FirebaseEdition architecture:**
- No framework — plain HTML/CSS/JS, one `index.html` (~31KB) + one `firebase-app.js` (~12.5KB), Firebase JS SDK loaded via CDN.
- No backend/Cloud Functions — the browser talks to Firestore directly.
- No build step, no bundler, no package.json in this folder.

**Screens (5, single nav, no auth gating):**
1. Overview — live counts (urgent/pending/delivered/donors/active donations) + recent deliveries feed.
2. Donors — list + "Register donor" form (id, name, type, contact, location).
3. Donations — inventory list + "Log donation" form (food type, quantity, expiry); expired-item purge.
4. Requests — urgent (priority queue) and pending queues + "Submit request" form.
5. Route Finder — Dijkstra shortest path over a fixed 15-node Karachi neighborhood graph.

**Data model (Firestore collections):** `donors`, `donations`, `requests_urgent`, `requests_pending`, `requests_fulfilled`. No `users`, no roles, no restaurants/NGOs/volunteers, no notifications, no audit log, no file storage.

**Matching logic:** `findMatchingDonation` — linear scan, first donation whose food type matches (case-insensitive), has quantity ≥ requested, and isn't expired relative to the request date. One donation fulfills one request in full; there is no splitting a single donation across multiple requests (spec's "partial matching" section, §15).

**Security:** `firestore.rules` is fully open — `allow read, write: if true` for every document, explicitly documented in the repo as "test mode... fine for a portfolio project." No Firebase Authentication is wired in anywhere (not in `firebaseConfig`, not in the HTML, not in `firebase-app.js`).

**Bug observed live:** on first load, the "Urgent requests waiting" stat tile sometimes renders `–` instead of its real count while the other four tiles populate correctly — looks like a race in whatever computes that one tile versus the other four (worth a quick look in `index.html`'s dashboard-rendering code before anything else, since it's a visible bug on the very first screen a viewer sees).

**Data hygiene:** live Firestore currently holds obvious placeholder rows ("Test Patient", donor "XYZ", inconsistent name casing like "zainab" vs "Ali") — fine for dev, not for anything shown to an evaluator or pilot user.

## 2. Target state vs. current — gap table

| Spec area | Current state | Gap |
|---|---|---|
| Auth (§7) | None | Full build: email/password, verification, password reset, session handling, protected routes |
| Roles (§3–6) | None — one undifferentiated form-filler | Full build: 5 roles, role field on user doc, route guards, 5 separate dashboards |
| Restaurant verification (§9) | N/A | Full build: profile, doc upload, PENDING/APPROVED/REJECTED/SUSPENDED, admin review UI |
| NGO verification (§10) | N/A | Full build, same shape as restaurant |
| Donation lifecycle (§11–12) | `status: "Pending"/"Completed"` only, no expiry auto-flagging | Extend to full state machine (DRAFT→…→CANCELLED/REJECTED) + scheduled expiry check |
| Request lifecycle (§13) | Two states via which collection it's in (urgent/pending), no `UNDER_REVIEW`/`REJECTED`/`EXPIRED` | Extend state machine |
| Matching engine (§14) | Single boolean match, no scoring | Add distance/urgency/expiry/quantity/time scoring, rationale visible to admin |
| Partial matching (§15) | Not supported — one donation, one request, full amounts only | Rework `runFulfillment` to allocate across multiple requests/donations, track allocated vs. remaining |
| Delivery workflow (§16–17) | None — matching directly produces a route string, no volunteer, no state transitions logged | Full build: volunteer assignment, RESERVED→PICKED_UP→DELIVERING→DELIVERED, transition log |
| Location/maps (§18–19) | Static hardcoded 15-node graph, no real geocoding, no map UI | Real map integration is a significant new dependency (e.g. Leaflet/Google Maps) — decide if this is worth it before building |
| Notifications (§20) | None | Full build |
| File uploads (§21) | None — no Firebase Storage use anywhere | Full build: Storage rules, validation, upload UI |
| Admin dashboard (§22) | "Overview" tab covers a subset (5 KPIs, recent activity) | Extend with charts, category/status breakdowns, area breakdowns |
| Impact dashboard (§23) | Partially covered by Overview stats | Reframe existing stats; add participating-org counts |
| Audit log (§24) | None | Full build, admin-only |
| Firestore security rules (§25–26) | Wide open (`allow read, write: if true`) | **Highest-priority gap** — rewrite rules around `request.auth`, role checks, per-doc ownership, before anything else goes live with real data |
| Validation (§27) | Some implicit (form `required` attrs, presumably); no visible cross-field checks (expiry > prep time, qty > 0) | Add explicit validation, both UI and rules-level |
| Error handling (§28) | Not inspected in detail — likely minimal (single-file app, no visible try/catch pattern beyond the fulfillment batch) | Needs a pass regardless of which phases are built |
| Search/filtering (§29) | None beyond the fixed queue views | Add per-role filters |
| Testing (§33) | None — no test files, no test framework in the repo | Full build: unit tests for matching/partial-allocation/expiry logic (this logic is already isolated in `firebase-app.js`, which is good — it's testable as-is) |
| Seed/demo data (§34) | Live data is ad hoc manual entries, not a defined seed set | Replace with a clearly-fake, documented seed set |
| Secrets (§35) | `firebaseConfig` (apiKey etc.) is committed in `firebase-app.js` — this is normal and expected for Firebase's client SDK (these values are not secrets; access control is enforced by security rules, not by hiding this config), so no action needed here beyond making sure the rules above are actually tightened | None beyond §25 |
| README/docs (§36) | Good README already exists, DSA-focused | Needs a rewrite/addition if the platform scope changes; keep the DSA explanation regardless, it's a genuine strength |
| Deployment (§37) | Working — Firebase Hosting + Firestore, Spark plan, already live | Add Storage + Auth to the Firebase project setup when those phases start |
| Analytics (§38) | None | Add if pursuing later phases |

## 3. Recommended phasing

Each phase is deployable on its own; stop after any phase and the live site still works.

**Phase 1 — Lock the front door.** Rewrite `firestore.rules` to require auth and per-owner access instead of open read/write. Add Firebase Authentication (email/password) with a single `users` collection (`role` field, defaulting everyone to one role initially if you're not ready for all 5). This is the one change that's hard to justify skipping even for a portfolio piece — a fully public read/write database is the kind of thing an evaluator who inspects the network tab will flag immediately.

**Phase 2 — Fix the known bug + clean data.** Track down the "Urgent requests waiting" race on the Overview tile. Clear placeholder rows ("Test Patient", "XYZ", casing inconsistencies) and replace with a small, clearly-labeled demo dataset.

**Phase 3 — Real partial matching + tests.** Rework `runFulfillment` to allocate a single donation across multiple requests (tracking allocated/remaining quantity) instead of one-to-one matching, and add unit tests for it plus the existing Dijkstra/priority-queue logic — this logic is already cleanly isolated in `firebase-app.js`, so it's the cheapest phase to test well. This phase alone meaningfully upgrades the "DSA project" pitch: partial allocation is a more interesting algorithmic problem than what's there now.

**Phase 4 — Roles, if you want them.** Only after 1–3: split the single form-filler UI into role-scoped views (start with 2 roles — e.g. donor and recipient-org — rather than jumping to all 5), with role-based route guards and matching Firestore rules.

**Phase 5+ — Everything else in the spec** (verification workflows, volunteer/delivery tracking, notifications, file uploads, maps, audit log, admin analytics, full 5-role system, real-user pilot) — treat as backlog, prioritized only if there's an actual reason to keep building this past a course project (e.g. an actual pilot with real restaurants/NGOs). Building all of it speculatively risks a half-finished platform that's a worse portfolio piece than a polished, honest DSA demo.

## 4. Risks

- **Scope risk**: attempting the full spec in one pass will very likely produce an unfinished, inconsistent app — worse for evaluation than the current small-but-complete one.
- **Security rules changes can break the live demo** if done without testing — Firestore rules changes should be deployed with `firebase deploy --only firestore:rules` and verified against the live app's actual read/write patterns before wider changes land, per the spec's own instruction (§45) never to weaken rules just to unblock a permission error.
- **No test harness exists yet** — Phase 3's test additions need a test runner decision (plain Node + a lightweight assertion lib is enough given there's no framework in play; no need to add a heavy stack for ~300 lines of logic).
- **Auth is a hard dependency for almost everything else** in the spec (roles, ownership rules, verification, audit logs) — Phase 1 blocks nearly every later phase, so it shouldn't be skipped if any later phase is wanted.
- **Three parallel implementations** (console/WebEdition/FirebaseEdition) already exist and the README explicitly says they're independent and untouched by each other — any change here should stay scoped to `FirebaseEdition/` unless told otherwise, to avoid silently diverging the "source of truth" console app from the web edition.

## 5. Phases 1–3 — done

Phases 1 (auth + locked-down rules), 2 (the "Urgent requests waiting" race fixed, demo-data cleanup documented), and 3 (multi-donation partial matching + a 13-test unit suite) are complete — see git history. `npm test` passes 13/13.

## 6. Phase 4 — Role-Based Views and Secure Ownership (done)

**Goal:** replace the single authenticated-but-undifferentiated `member` model with three real roles — donor, requester, admin — enforced by Firestore rules, not just the UI, while leaving the Phase 3 matching engine untouched.

**Role model.** A new account starts as `role: 'member'` (unassigned) and claims `donor` or `requester` exactly once, the first time they sign in (a role picker gates the dashboard until they do). `admin` has no self-service path at all — only an existing admin can grant it to someone *else's* account; `firestore.rules` structurally prevents an admin from promoting themselves. `suspended: false` is a separate field an admin can toggle on another account to block its writes while leaving its reads intact.

**Ownership.** `donations`, the `donors` registry, and all three `requests_*` collections now carry `ownerId`. Firestore rules require `ownerId == request.auth.uid` on create, and only the owner (or an admin) can update or delete afterwards; `ownerId` itself is immutable post-creation for everyone, including admins. A donor's write to someone else's donation, or a requester's write to someone else's request, is rejected by Firestore itself — verified directly against a real Firestore emulator in `test/rules.test.js` (see below), not just by not showing the button in the UI.

**The matching engine / admin boundary — a deliberate scope decision, not an oversight.** `runFulfillment()` (Phase 3's partial-allocation logic, completely unchanged) necessarily mutates *other* users' donations as it allocates and moves *other* users' requests between collections. Under a strict per-owner model that can only be a privileged operation, so Phase 4 restricts *triggering* it — and the two "purge expired stock" / "create in requests_pending or requests_fulfilled" actions that go with it — to admins, both in the UI (moved to the new Admin page) and in the rules (`isAdmin()` bypass). Donors and requesters keep a self-scoped version of the "remove expired stock" action (`expireMyDonations`) that only touches their own donations. This is the one place the rules and the "preserve the matching engine" requirement are in real tension, and admin-gating the trigger is how they're reconciled without reopening cross-owner writes to everyone.

**UI.** Three new role-scoped pages reuse the existing visual system: **My Donations** (donor — log donation with food/category, quantity, prep time, pickup time, expiry, location, description, allergen info; list with status tags; basic stats; self-scoped expiry purge), **My Requests** (requester — submit with quantity, food/category, urgency, beneficiary count, location, needed-by time, dietary notes; list with status; basic stats), and **Admin** (user list with role dropdown + suspend toggle per user, disabled for the admin's own row; the matching-engine trigger and the all-donors expiry purge, moved here from the old Requests/Donations pages). The original Donors/Donations/Requests pages are kept as shared, read-only browsing views — their write forms were removed rather than merely hidden, since under the new rules a non-owner's submission through them would just fail. All new forms have client-side validation (required fields, quantity > 0, expiry not in the past), disable their submit button while saving, and show specific error messages rather than a generic failure string. The signed-in user's profile is watched in real time (`onSnapshot`), so a role claim or an admin-issued suspension takes effect immediately without a manual reload.

**Files changed:** `firestore.rules` (rewritten — ownership + role model), `firebase-app.js` (role/admin functions, ownership-aware `addDonation`/`submitRequest`/donor-profile management, `makeRequest`'s extra-fields param — all additive, no existing exported function signature was removed or had its required arguments changed), `FirebaseEdition/index.html` (role gate, suspended gate, three new pages, admin panel, nav role-visibility, removed legacy write forms), `firebase.json` (Firestore emulator config), `package.json` (`test:rules` / `test:all` scripts), `test/rules.test.js` (new — 20+ ownership/role/admin security-rules tests against the real emulator), `README.md`.

**Tests.** `npm test` (the Phase 3 matching suite) still passes 13/13 — nothing in it changed, and no exported function it depends on had its behavior altered. `test/rules.test.js` covers exactly the scenarios the spec called out — donor A can't touch donor B's donation, requester A can't touch requester B's request, no self-role-escalation (including for admins), a suspended account can't write, a non-admin can't reach admin-only paths — but **could not be executed in the sandbox this phase was originally built in**: running it needs the real Firestore emulator, and `firebase emulators:exec` downloads that emulator jar from `storage.googleapis.com` on first use, which that environment's network egress policy blocks. It was later run for real on the developer's own machine (see the Phase 5 Tests section below, since that's the run that actually executed both phases' rules tests together) and, after a rules bug it uncovered was fixed, passes in full.

**Known gaps after Phase 4:**
- The rules-unit-test suite was unverified by execution at the time this phase was written; see the Phase 5 Tests section for the actual run and the bug it found.
- No UI for a donor to edit their donor-registry profile (name/contact/type/address) beyond what `updateDonorProfile()` in `firebase-app.js` already supports — there's no form wired to it yet.
- `donationId`/`requestId` are now Firestore auto-IDs instead of the old hand-typed numbers; anything outside this app (a script, a demo walkthrough) that assumed small sequential IDs will need updating.
- No audit log of who changed a role or suspended an account (spec §24, explicitly out of scope for this phase).
- Admin's own role/suspension can never be changed by anyone via the app once they're the only admin — the recovery path (another admin does it, or a direct Firestore Console edit, which bypasses rules) should be documented for whoever runs this for real.

## 7. Phase 5 — Verification & Audit (done)

**Goal:** a controlled verification state machine for donor/requester accounts, plus an audit trail of the security- and business-relevant actions the spec called out — both on top of the Phase 4 role/ownership model, without touching it.

**Verification.** A new `verifications/{uid}` collection, one doc per user. No doc means "unverified" (that state isn't persisted — it's the absence of a submission). A donor or requester submits their own info (business/organization name, registration number, contact phone, address, description) via `submitVerification()`, which creates the doc with `status: 'pending'`; `firestore.rules` forces that status on create, so a user cannot submit themselves as already verified. If rejected, they can resubmit (`rejected` → `pending`) with updated info, but can never touch the admin-owned review fields (`reviewedBy`/`reviewedAt`/`reviewNote`) or set `status` to `verified` themselves — only an admin can move a submission to `verified` or `rejected`, and, mirroring the same self-action guard from Phase 4's role/suspension rules, never their own. Read access is owner-or-admin only, so a verification submission's contact/registration details aren't visible to other donors/requesters browsing the app.

**Admin verification interface.** The Admin page gained a "Pending verifications" section above the existing Users table: each pending submission shows its details (business/org name, registration number, phone, address, description) with Approve and Reject actions. Reject requires a note (enforced client-side, so the account holder always gets a reason) and both actions ask for confirmation before firing. This is in addition to, not a replacement for, the Users table's existing role/suspend controls.

**Audit log.** A new `audit_log` collection, append-only — `firestore.rules` denies update and delete to everyone, including admins, once an entry is written. Every entry must be filed by the person who actually did the thing (`actorId` has to equal the writer's own `uid` — nobody can log an action as someone else) and the action named has to match an authority the writer's role actually backs up (only an admin can file `verification_approved`, only a donor can file `donation_created`, etc. — see `auditActorAuthorized()` in `firestore.rules`). It's admin-read-only. Logging happens from `firebase-app.js`'s `logAction()` helper, called *after* the real write succeeds (never inside the same transaction/batch), and a failed or denied log write is swallowed rather than thrown — an audit-trail bug must never be able to block the feature it's auditing. Every action the spec listed is covered: `user_registered`, `role_assigned` (both the self-claim and admin-assignment paths), `verification_submitted`, `verification_approved`, `verification_rejected`, `account_suspended`/`account_unsuspended`, `donation_created`, `donation_cancelled` (see below), `request_created`, and `match_allocated` (one entry per fulfilled allocation from `runFulfillment`, logged after its batch commits).

**Donation cancellation.** Added `cancelMyDonation()` (owner-only delete, confirmed in the UI before firing) since the audit log's minimum action list required something to actually generate `donation_cancelled` events — there was no cancel action in Phase 4's donor dashboard.

**A stated limitation, not a hidden one:** this audit log is client-stamped, not server-enforced. There's no Cloud Functions layer in this project to be the sole, trusted writer (this is a Firebase Hosting + Firestore-only app by design — see the README). "Tamper-proof" here means nobody can rewrite or delete history, and nobody can file an entry claiming an authority their role doesn't back up — it does not mean a compromised or modified client can never write a spurious entry describing its own real, structurally-permitted actions. A fully tamper-proof trail would move log writes server-side; that's explicitly out of scope for this phase, and is called out again in §8 below.

**Files changed:** `firestore.rules` (added `verifications/{uid}` and `audit_log/{logId}`, both additive — nothing in the Phase 4 rules for `users`/`donations`/`donors`/`requests_*` was touched), `firebase-app.js` (`logAction`, `submitVerification`/`getMyVerification`/`watchMyVerification`, admin `listVerifications`/`setVerificationStatus`, `cancelMyDonation`, plus `logAction()` calls added to the existing registration/role/donation/request/matching functions — all additive, no existing exported function had its signature changed), `FirebaseEdition/index.html` (verification panel on the donor/requester dashboards, "Pending verifications" section on the Admin page, cancel-donation control, confirmation dialogs for suspend/promote-to-admin/reject/cancel), `test/rules.test.js` (23 new Phase 5 cases alongside the 29 from Phase 4 — 52 total), `README.md`.

**Tests.** `npm test` (Phase 3's matching suite): still 13/13, untouched. `npm run test:rules` could not be executed in the sandbox both phases were built in — `firebase emulators:exec` needs to download the Firestore emulator jar from `storage.googleapis.com` on first use, and that sandbox's network egress policy denies that host. It has since actually been run, against the real Firestore emulator, on the developer's own machine (which has normal internet access), and that run is what this section now reports.

The first run came back **48/52 passing, 4 failing** — every failure a legitimate "should succeed" create (a donation create, a request create, a verification submit, an audit-log entry), all denied by rules that were supposed to allow them. The root cause was in `myRole()`:

```
// before (buggy)
function myRole() {
  return isSignedIn() && myProfile().role;
}
```

Firestore Rules' `&&` requires **both** operands to be boolean — unlike JavaScript, it doesn't short-circuit to "whichever value made it true." The moment a signed-in user actually had a role string to return, this threw a type error (`Received: [string], Expected: [bool]`) instead of returning that string, so every `myRole() == 'donor'` / `myRole() == 'requester'` comparison silently failed closed. It's a subtle bug for exactly the reason it slipped past code review: it only misfires for the *legitimate* case (a real signed-in user with a real role), so every `assertFails` test — which expects a denial anyway — passed regardless, and only the `assertSucceeds` tests exposed it. This is the concrete case the "unverified by execution" caveat in earlier drafts of this doc was flagging: the rules logic looked correct, and 13/13 matching tests plus a careful read gave no indication otherwise, but nothing short of running the actual emulator would have caught it.

The fix replaces the `&&` with a ternary, which has no boolean-operand constraint:

```
// after (fixed)
function myRole() {
  return isSignedIn() ? myProfile().role : null;
}
```

The other helper functions (`isAdmin()`, `isActiveWriter()`, `isOwner()`) were checked and don't share this pattern — their right-hand `&&` operands are already boolean comparisons (`== 'admin'`, `!= true`, `== request.auth.uid`), not a raw field value. `npm test` was re-run after the fix (still 13/13, no regression), and a follow-up run of `npm run test:rules` with the fix applied confirmed **52/52 passing** — the full rules-unit-test suite is green end to end.

**Known gaps after Phase 5:**
- Rules tests have now been executed for real (see above), found a genuine bug, and confirmed 52/52 passing after the fix — this loop is closed.
- Audit log has no UI browser yet (only enforced/written, not displayed) — an admin can't currently see the trail from inside the app, only via the Firestore Console.
- Verification has two states worth adding later: an admin "resend for more info" that isn't a full rejection, and a way to re-review an already-verified account (e.g. if new information comes to light) — current rules only allow reviewing from `pending`.
- The client-stamped audit log limitation above — a genuinely tamper-proof trail needs a backend.
- Still no audit log of the log's own denials (i.e. no record of *attempted* unauthorized actions) — only successful, permitted ones are recorded, which is normal for an audit trail but worth naming.

## 8. Phase 6 — Delivery Workflow (done)

**Goal:** get a fulfilled request from the donor's shelf to the recipient's door, tracked in the system rather than assumed to happen off-app. Built on top of Phase 4's ownership model and Phase 5's audit log, without touching either.

**Volunteer role.** A third claimable role alongside `donor`/`requester` — `claimRole('volunteer')` — same one-time, self-claim, never-admin rules as before (see Phase 4). A volunteer has no donations or requests of their own; their whole surface is the new "My Deliveries" page.

**The `deliveries/{deliveryId}` collection and its state machine.** One doc per successfully matched request, `AVAILABLE → RESERVED → PICKED_UP → DELIVERING → DELIVERED`:
- **Created only by the matching engine's own batch** (`runFulfillment()`, admin-triggered — same design reasoning as `requests_fulfilled` in Phase 4), in status `AVAILABLE` with `volunteerId: null` — an open job any active volunteer can see and take. `firestore.rules` rejects a direct client create of anything else (a delivery that starts already `RESERVED`, say).
- **Claiming (`AVAILABLE → RESERVED`)** is open to any active volunteer, who assigns themselves as `volunteerId` in the same write. This is race-safe *without a client-side transaction*: Firestore rules evaluate against the live server document at write time, so if two volunteers tap "Claim" on the same job at once, whichever write lands first flips the doc to `RESERVED`, and the second write is evaluated against that already-claimed document and denied by rules — no transaction needed on the client for this to be correct.
- **Every transition after that** (`RESERVED → PICKED_UP → DELIVERING → DELIVERED`) belongs exclusively to whichever volunteer claimed the job (`request.auth.uid == resource.data.volunteerId`), one step at a time — the rules enumerate each specific `fromStatus → toStatus` pair, so writing `DELIVERED` straight from `RESERVED` matches none of them and is denied. `volunteerId` itself can never change once set.
- **Admin override** — same "trusted operator, not a free-for-all" bypass pattern used everywhere else in this file — can move a stuck job or fix a mistake.
- **Identity fields** (`requestId`, `donorOwnerId`, `requesterOwnerId`) are immutable once the job exists, for anyone, including admins.
- **Delete is admin-only.**

**Hooked into the matching engine, not bolted on.** `runFulfillment()`'s existing batch — the same one that writes the `requests_fulfilled` doc and decrements donation quantities — now also creates the matching `deliveries` doc in the same atomic batch, so a fulfilled request can never exist without an open delivery job (or vice versa). `donorOwnerId` is taken from the primary (largest-contribution) donation, matching the route already computed for that allocation.

**UI.** A new "My Deliveries" page, visible only to volunteers (same nav-visibility pattern as "My Donations"/"My Requests"): an *Available jobs* list with a Claim button, and a *My active deliveries* list with a context-appropriate "advance" button (its label changes with the job's current status — "Mark picked up", "Mark out for delivery", "Mark delivered"). Role gate gained a third option card; the admin user-management dropdown gained `volunteer` as an assignable role.

**Audit log.** Two new actions extend `auditActorAuthorized()`: `delivery_claimed` and `delivery_status_updated`, both gated to `myRole() == 'volunteer'` — the same client-stamped, append-only trail Phase 5 built, not a new mechanism.

**Files changed:** `firestore.rules` (added `deliveryIdentityUnchanged()` and the `deliveries/{deliveryId}` match block; extended the `users/{userId}` role-claim list and `auditActorAuthorized()` — both additive, nothing in the Phase 4/5 rules for `users`/`donations`/`donors`/`requests_*`/`verifications`/`audit_log` was touched), `firebase-app.js` (`claimRole()` now accepts `'volunteer'`; delivery-doc creation added to `runFulfillment()`'s batch; new `listAvailableDeliveries`/`listMyDeliveries`/`watchDeliveries`/`claimDelivery`/`advanceDeliveryStatus`; `deliveries` added to the in-memory state loaded by `loadAllState()` — all additive, no existing exported function had its signature changed), `FirebaseEdition/index.html` ("Volunteer" role-gate option, "My Deliveries" nav item and page, admin role-select gained `volunteer`), `test/rules.test.js` (17 new Phase 6 cases alongside the 52 from Phase 4/5 — 69 total), `README.md`.

**Tests.** `npm test` (the Phase 3 matching suite): still 13/13, untouched — nothing in this phase touches matching/routing logic. `npm run test:rules`, run against the real Firestore emulator on the developer's own machine (same setup that caught and fixed the Phase 4/5 `myRole()` bug): **69/69 passing** — claim race-safety (a second volunteer's claim on an already-claimed job is denied), sequential-only transitions (skipping straight to `DELIVERED` is denied), ownership (a different volunteer can't advance someone else's claimed job), immutable identity fields (even for an admin), the admin override, non-admin direct-create denial, and audit-log authorization for both new actions.

**Known gaps after Phase 6:**
- No notification when a job becomes available or changes status — a volunteer has to have the page open (or reload it) to see new jobs; see Phase 6 candidates below for a notifications feature that would cover this too.
- No in-app map or distance/time estimate for a delivery job — `fromLocation`/`toLocation` are shown as the same city-neighborhood names used elsewhere in the app, with no route visualization on the deliveries page itself (Route Finder is a separate, unrelated page).
- No "un-claim" / hand-back path if a volunteer claims a job and can no longer do it — only an admin override can currently move it, there's no self-service release back to `AVAILABLE`.
- Same client-stamped audit log limitation as Phase 5 — still not backend-enforced.

## 9. Phase 7 — Audit Log Viewer (done)

**Goal:** the audit trail Phase 5 built has been write-only from inside the app since it landed — every action was logged and protected, but nobody could actually see it without opening the Firestore Console. This closes that gap with a read-only screen.

**What it is.** A new "Audit log" section on the Admin page: the most recent 200 entries, newest first, showing when, who (actor email), what action, and what it targeted. No new rules were needed — `audit_log` read was already admin-only (Phase 5), so this is purely a client-side query (`listAuditLog()`, ordered by `createdAt desc`, `limit(200)`) and a table over data that already existed and was already protected.

**Files changed:** `firebase-app.js` (`listAuditLog()`, exported via `window.FRS` — additive, no existing function touched), `FirebaseEdition/index.html` (new "Audit log" section on the Admin page, `renderAdminAuditLog()`), `README.md`. `firestore.rules` and `test/rules.test.js` are untouched — there is no new access path to test, since the read this feature performs was already exercised by the existing "an admin can read the audit log" / "a non-admin cannot read the audit log" cases from Phase 5.

**Tests.** `npm test`: still 13/13, untouched. `npm run test:rules`: still 69/69 — no rules changed, so no new cases were needed; the existing Phase 5 audit-log read tests already cover the access boundary this viewer relies on.

**Known gaps:** capped at 200 entries with no pagination or filtering (by actor, action type, or date range) — fine for a project-scale audit trail, would need addressing before a real high-volume deployment.

## 10. Phase 7 candidates remaining (not started)

1. **Notifications** — at minimum, a requester learning their request was fulfilled, a donor/requester learning their verification was reviewed, or a volunteer learning a new job is available, without having to check the dashboard.
2. **File uploads** (Firebase Storage) for verification documents — the verification workflow Phase 5 built is the natural place to attach these.
3. **Delivery job release** — let a volunteer hand a claimed job back to `AVAILABLE` if they can no longer do it, rather than needing an admin override.
4. A move to Cloud Functions for anything that currently trusts the client (audit log writes, matching-engine execution) — the point at which "no backend server required" stops being true, and worth deciding deliberately rather than drifting into.

Per the original scope note in §0: treat this as a menu, not a mandate — decide which of these (if any) are worth building before starting.

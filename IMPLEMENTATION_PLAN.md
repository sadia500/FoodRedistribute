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

**Tests.** `npm test` (the Phase 3 matching suite) still passes 13/13 — nothing in it changed, and no exported function it depends on had its behavior altered. `test/rules.test.js` covers exactly the scenarios the spec called out — donor A can't touch donor B's donation, requester A can't touch requester B's request, no self-role-escalation (including for admins), a suspended account can't write, a non-admin can't reach admin-only paths — and was written and reviewed carefully, but **could not be executed in the environment this phase was built in**: running it needs the real Firestore emulator, and `firebase emulators:exec` downloads that emulator jar from `storage.googleapis.com` on first use, which that environment's network egress policy blocks (confirmed via the proxy's own status endpoint — a `connect_rejected`/403 policy denial, not a transient failure). Run `npm run test:rules` (or `npm run test:all`) anywhere with normal internet access — a real machine or CI — to execute it; nothing about the test file itself depends on that environment.

**Known gaps after Phase 4:**
- The rules-unit-test suite is written but unverified by execution (see above) — treat it as a strong first pass, and re-review it once it's actually been run, rather than as proven-correct.
- No UI for a donor to edit their donor-registry profile (name/contact/type/address) beyond what `updateDonorProfile()` in `firebase-app.js` already supports — there's no form wired to it yet.
- `donationId`/`requestId` are now Firestore auto-IDs instead of the old hand-typed numbers; anything outside this app (a script, a demo walkthrough) that assumed small sequential IDs will need updating.
- No audit log of who changed a role or suspended an account (spec §24, explicitly out of scope for this phase).
- Admin's own role/suspension can never be changed by anyone via the app once they're the only admin — the recovery path (another admin does it, or a direct Firestore Console edit, which bypasses rules) should be documented for whoever runs this for real.

## 7. Phase 5 candidates (not started)

In rough order of what most naturally follows Phase 4:
1. **Verification workflow** for donor/requester accounts (PENDING/APPROVED/REJECTED), since the role system Phase 4 built is the actual prerequisite for it.
2. **Delivery workflow** — volunteer role, RESERVED→PICKED_UP→DELIVERING→DELIVERED state transitions logged against a request.
3. **Notifications** — at minimum, a requester learning their request was fulfilled without having to check the dashboard.
4. **File uploads** (Firebase Storage) for verification documents.
5. **Audit log**, admin-only, once there's more than role/suspension changes worth logging.

Per the original scope note in §0: treat this as a menu, not a mandate — decide which of these (if any) are worth building before starting.

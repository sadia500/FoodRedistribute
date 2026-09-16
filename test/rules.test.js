"use strict";
// Ownership / role security-rules tests for firestore.rules (Phase 4).
//
// These run against the real Firestore emulator (not a mock), via
// @firebase/rules-unit-testing, so they exercise the exact rules file that
// gets deployed. They're separate from test/matching.test.js (which is pure
// JS logic and needs no emulator) because standing up the emulator is
// slower — run them with `npm run test:rules` (wraps `firebase
// emulators:exec`), or `npm run test:all` for both suites together.
// Plain `npm test` is untouched and still only runs the fast matching suite.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = "food-redistribute-rules-test";
let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(
        path.join(__dirname, "..", "firestore.rules"),
        "utf8"
      ),
      host: "127.0.0.1",
      port: 8080
    }
  });
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---- helpers ---------------------------------------------------------------

function asAnon() {
  return testEnv.unauthenticatedContext().firestore();
}
function asUser(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}
// Writes go through with the Admin SDK, bypassing rules entirely — used only
// to seed fixtures, never to assert anything about the rules themselves.
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async ctx => fn(ctx.firestore()));
}

async function seedUser(uid, role, extra = {}) {
  await seed(db => db.collection("users").doc(uid).set({
    email: `${uid}@example.com`, role, suspended: false, ...extra
  }));
}
async function seedDonation(id, ownerId, extra = {}) {
  await seed(db => db.collection("donations").doc(id).set({
    donationId: id, donorId: ownerId, ownerId, foodType: "Rice",
    quantity: 10, originalQuantity: 10, expiryDate: "2099-01-01",
    status: "Pending", ...extra
  }));
}
async function seedRequest(collection, id, ownerId, extra = {}) {
  await seed(db => db.collection(collection).doc(id).set({
    recipientName: "R", foodType: "Rice", quantity: 5,
    organizationType: "CHARITY", organizationName: "Org", location: "Clifton",
    requestDate: "2026-01-01", ownerId, ...extra
  }));
}

// ---- signed-out has no access at all ---------------------------------------

test("unauthenticated: cannot read or write anything", async () => {
  await seedUser("donorA", "donor");
  await seedDonation("d1", "donorA");
  const db = asAnon();
  await assertFails(db.collection("donations").doc("d1").get());
  await assertFails(db.collection("donations").add({ foodType: "Rice" }));
});

// ---- role claiming / escalation prevention ---------------------------------

test("a brand-new user can only create their own profile, starting as 'member'", async () => {
  const db = asUser("u1");
  await assertSucceeds(
    db.collection("users").doc("u1").set({ email: "u1@example.com", role: "member", suspended: false })
  );
});

test("a user cannot create their profile with an elevated role", async () => {
  const db = asUser("u1");
  await assertFails(
    db.collection("users").doc("u1").set({ email: "u1@example.com", role: "admin", suspended: false })
  );
});

test("a user cannot create a profile document for someone else", async () => {
  const db = asUser("u1");
  await assertFails(
    db.collection("users").doc("someone-else").set({ email: "x@example.com", role: "member", suspended: false })
  );
});

test("a user can claim donor or requester exactly once, from 'member'", async () => {
  await seedUser("u1", "member");
  const db = asUser("u1");
  await assertSucceeds(db.collection("users").doc("u1").update({ role: "donor" }));
});

test("a user cannot claim the admin role for themselves", async () => {
  await seedUser("u1", "member");
  const db = asUser("u1");
  await assertFails(db.collection("users").doc("u1").update({ role: "admin" }));
});

test("a user cannot change their role again once it's set (donor -> requester)", async () => {
  await seedUser("u1", "donor");
  const db = asUser("u1");
  await assertFails(db.collection("users").doc("u1").update({ role: "requester" }));
});

test("a user cannot suspend or unsuspend themselves", async () => {
  await seedUser("u1", "donor");
  const db = asUser("u1");
  await assertFails(db.collection("users").doc("u1").update({ suspended: true }));
});

test("a non-admin cannot change another user's role", async () => {
  await seedUser("attacker", "donor");
  await seedUser("victim", "requester");
  const db = asUser("attacker");
  await assertFails(db.collection("users").doc("victim").update({ role: "admin" }));
});

test("an admin can change another user's role, including promoting to admin", async () => {
  await seedUser("admin1", "admin");
  await seedUser("plain", "donor");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("users").doc("plain").update({ role: "admin" }));
});

test("an admin cannot change their own role through the admin path (no self-escalation loophole)", async () => {
  await seedUser("admin1", "admin");
  const db = asUser("admin1");
  await assertFails(db.collection("users").doc("admin1").update({ role: "donor" }));
});

test("an admin can suspend another user's account", async () => {
  await seedUser("admin1", "admin");
  await seedUser("plain", "donor");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("users").doc("plain").update({ suspended: true }));
});

// ---- donation ownership -----------------------------------------------------

test("a donor can create their own donation", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertSucceeds(db.collection("donations").doc("d1").set({
    donationId: "d1", donorId: "donorA", ownerId: "donorA", foodType: "Rice",
    quantity: 10, originalQuantity: 10, expiryDate: "2099-01-01", status: "Pending"
  }));
});

test("a donor cannot create a donation owned by someone else", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("donations").doc("d1").set({
    donationId: "d1", donorId: "donorB", ownerId: "donorB", foodType: "Rice",
    quantity: 10, originalQuantity: 10, expiryDate: "2099-01-01", status: "Pending"
  }));
});

test("a requester cannot create a donation (wrong role)", async () => {
  await seedUser("req1", "requester");
  const db = asUser("req1");
  await assertFails(db.collection("donations").doc("d1").set({
    donationId: "d1", donorId: "req1", ownerId: "req1", foodType: "Rice",
    quantity: 10, originalQuantity: 10, expiryDate: "2099-01-01", status: "Pending"
  }));
});

test("donor A cannot modify donor B's donation", async () => {
  await seedUser("donorA", "donor");
  await seedUser("donorB", "donor");
  await seedDonation("d1", "donorB");
  const db = asUser("donorA");
  await assertFails(db.collection("donations").doc("d1").update({ quantity: 999 }));
  await assertFails(db.collection("donations").doc("d1").delete());
});

test("donor B can modify their own donation", async () => {
  await seedUser("donorB", "donor");
  await seedDonation("d1", "donorB");
  const db = asUser("donorB");
  await assertSucceeds(db.collection("donations").doc("d1").update({ quantity: 3 }));
});

test("a donor cannot reassign a donation's ownerId to someone else", async () => {
  await seedUser("donorA", "donor");
  await seedDonation("d1", "donorA");
  const db = asUser("donorA");
  await assertFails(db.collection("donations").doc("d1").update({ ownerId: "donorB" }));
});

test("a suspended donor cannot create or edit donations", async () => {
  await seedUser("donorA", "donor", { suspended: true });
  const db = asUser("donorA");
  await assertFails(db.collection("donations").doc("d1").set({
    donationId: "d1", donorId: "donorA", ownerId: "donorA", foodType: "Rice",
    quantity: 10, originalQuantity: 10, expiryDate: "2099-01-01", status: "Pending"
  }));
  await seedDonation("d2", "donorA");
  await assertFails(db.collection("donations").doc("d2").update({ quantity: 1 }));
});

test("everyone signed in can still read the donations list (needed for browsing/matching)", async () => {
  await seedUser("donorA", "donor");
  await seedUser("req1", "requester");
  await seedDonation("d1", "donorA");
  const db = asUser("req1");
  await assertSucceeds(db.collection("donations").doc("d1").get());
});

// ---- request ownership -------------------------------------------------------

test("a requester can submit their own urgent request", async () => {
  await seedUser("req1", "requester");
  const db = asUser("req1");
  await assertSucceeds(db.collection("requests_urgent").doc("r1").set({
    recipientName: "R", foodType: "Rice", quantity: 5, organizationType: "HOSPITAL",
    organizationName: "Org", location: "Clifton", requestDate: "2026-01-01", ownerId: "req1"
  }));
});

test("a donor cannot submit a request (wrong role)", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("requests_urgent").doc("r1").set({
    recipientName: "R", foodType: "Rice", quantity: 5, organizationType: "HOSPITAL",
    organizationName: "Org", location: "Clifton", requestDate: "2026-01-01", ownerId: "donorA"
  }));
});

test("requester A cannot modify requester B's request", async () => {
  await seedUser("reqA", "requester");
  await seedUser("reqB", "requester");
  await seedRequest("requests_urgent", "r1", "reqB");
  const db = asUser("reqA");
  await assertFails(db.collection("requests_urgent").doc("r1").update({ quantity: 999 }));
  await assertFails(db.collection("requests_urgent").doc("r1").delete());
});

test("requester B can cancel (delete) their own urgent request", async () => {
  await seedUser("reqB", "requester");
  await seedRequest("requests_urgent", "r1", "reqB");
  const db = asUser("reqB");
  await assertSucceeds(db.collection("requests_urgent").doc("r1").delete());
});

test("a non-admin cannot directly create a fulfilled or pending request (matching-engine-only path)", async () => {
  await seedUser("req1", "requester");
  const db = asUser("req1");
  await assertFails(db.collection("requests_fulfilled").doc("f1").set({
    recipientName: "R", foodType: "Rice", quantity: 5, organizationType: "HOSPITAL",
    organizationName: "Org", location: "Clifton", requestDate: "2026-01-01", ownerId: "req1"
  }));
});

test("an admin can create a fulfilled request on behalf of the matching engine", async () => {
  await seedUser("admin1", "admin");
  await seedUser("req1", "requester");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("requests_fulfilled").doc("f1").set({
    recipientName: "R", foodType: "Rice", quantity: 5, organizationType: "HOSPITAL",
    organizationName: "Org", location: "Clifton", requestDate: "2026-01-01", ownerId: "req1"
  }));
});

test("an admin can update/delete any donation or request while running matching", async () => {
  await seedUser("admin1", "admin");
  await seedUser("donorA", "donor");
  await seedUser("reqA", "requester");
  await seedDonation("d1", "donorA");
  await seedRequest("requests_urgent", "r1", "reqA");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("donations").doc("d1").update({ quantity: 4, status: "Partially Fulfilled" }));
  await assertSucceeds(db.collection("requests_urgent").doc("r1").delete());
});

// ---- admin surface is protected, not just hidden in the UI ------------------

test("a normal (non-admin) user cannot read/act as admin over another user's account", async () => {
  await seedUser("plain", "donor");
  await seedUser("victim", "requester");
  const db = asUser("plain");
  await assertFails(db.collection("users").doc("victim").update({ role: "admin" }));
  await assertFails(db.collection("users").doc("victim").update({ suspended: true }));
});

test("nobody, including admins, can delete a user profile", async () => {
  await seedUser("admin1", "admin");
  await seedUser("plain", "donor");
  const db = asUser("admin1");
  await assertFails(db.collection("users").doc("plain").delete());
});

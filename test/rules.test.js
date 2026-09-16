"use strict";
// Ownership / role / verification / audit-log security-rules tests for
// firestore.rules (Phase 4 ownership + Phase 5 verification & audit).
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
  return testEnv.withSecurityRulesDisabled(async ctx => fn(ctx.firestore()));
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
async function seedVerification(uid, status, extra = {}) {
  await seed(db => db.collection("verifications").doc(uid).set({
    ownerId: uid, status,
    info: { businessName: "Test Biz", registrationNumber: "", contactPhone: "555-0100", address: "Clifton", description: "" },
    reviewedBy: null, reviewedAt: null, reviewNote: "",
    ...extra
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

// ---- Phase 5: verification submission --------------------------------------

test("a donor can submit their own verification", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertSucceeds(db.collection("verifications").doc("donorA").set({
    ownerId: "donorA", status: "pending",
    info: { businessName: "Joe's Kitchen", registrationNumber: "", contactPhone: "555-1234", address: "Clifton", description: "" },
    reviewedBy: null, reviewedAt: null, reviewNote: ""
  }));
});

test("a user cannot submit a verification for someone else", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("verifications").doc("donorB").set({
    ownerId: "donorB", status: "pending",
    info: { businessName: "Not mine", registrationNumber: "", contactPhone: "", address: "", description: "" },
    reviewedBy: null, reviewedAt: null, reviewNote: ""
  }));
});

test("a user cannot mark their own submission verified", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("verifications").doc("donorA").set({
    ownerId: "donorA", status: "verified",
    info: { businessName: "Joe's Kitchen", registrationNumber: "", contactPhone: "555-1234", address: "Clifton", description: "" },
    reviewedBy: null, reviewedAt: null, reviewNote: ""
  }));
});

test("a member with no claimed role yet cannot submit a verification", async () => {
  await seedUser("newbie", "member");
  const db = asUser("newbie");
  await assertFails(db.collection("verifications").doc("newbie").set({
    ownerId: "newbie", status: "pending",
    info: { businessName: "x", registrationNumber: "", contactPhone: "", address: "", description: "" },
    reviewedBy: null, reviewedAt: null, reviewNote: ""
  }));
});

test("a user can resubmit after a rejection, but still can't set themselves verified", async () => {
  await seedUser("donorA", "donor");
  await seedVerification("donorA", "rejected", { reviewedBy: "admin1", reviewNote: "Bad phone number" });
  const db = asUser("donorA");
  await assertSucceeds(db.collection("verifications").doc("donorA").update({
    status: "pending",
    info: { businessName: "Joe's Kitchen", registrationNumber: "", contactPhone: "555-9999", address: "Clifton", description: "" }
  }));
  await assertFails(db.collection("verifications").doc("donorA").update({ status: "verified" }));
});

test("a user cannot resubmit while still pending (only from 'rejected')", async () => {
  await seedUser("donorA", "donor");
  await seedVerification("donorA", "pending");
  const db = asUser("donorA");
  await assertFails(db.collection("verifications").doc("donorA").update({
    status: "pending",
    info: { businessName: "Changed", registrationNumber: "", contactPhone: "", address: "", description: "" }
  }));
});

test("a user cannot modify another user's verification submission", async () => {
  await seedUser("donorA", "donor");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "rejected");
  const db = asUser("donorA");
  await assertFails(db.collection("verifications").doc("donorB").update({ status: "pending" }));
});

test("unauthorized users cannot read someone else's verification information", async () => {
  await seedUser("donorA", "donor");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "pending");
  const db = asUser("donorA");
  await assertFails(db.collection("verifications").doc("donorB").get());
  await assertFails(asAnon().collection("verifications").doc("donorB").get());
});

test("a user can read their own verification, and an admin can read anyone's", async () => {
  await seedUser("donorA", "donor");
  await seedUser("admin1", "admin");
  await seedVerification("donorA", "pending");
  await assertSucceeds(asUser("donorA").collection("verifications").doc("donorA").get());
  await assertSucceeds(asUser("admin1").collection("verifications").doc("donorA").get());
});

// ---- Phase 5: admin approve/reject ------------------------------------------

test("a non-admin cannot approve a verification", async () => {
  await seedUser("plain", "donor");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "pending");
  const db = asUser("plain");
  await assertFails(db.collection("verifications").doc("donorB").update({
    status: "verified", reviewedBy: "plain", reviewedAt: new Date(), reviewNote: ""
  }));
});

test("a non-admin cannot reject a verification either", async () => {
  await seedUser("plain", "donor");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "pending");
  const db = asUser("plain");
  await assertFails(db.collection("verifications").doc("donorB").update({
    status: "rejected", reviewedBy: "plain", reviewedAt: new Date(), reviewNote: "no"
  }));
});

test("an admin can approve a pending verification", async () => {
  await seedUser("admin1", "admin");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "pending");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("verifications").doc("donorB").update({
    status: "verified", reviewedBy: "admin1", reviewedAt: new Date(), reviewNote: ""
  }));
});

test("an admin can reject a pending verification", async () => {
  await seedUser("admin1", "admin");
  await seedUser("donorB", "donor");
  await seedVerification("donorB", "pending");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("verifications").doc("donorB").update({
    status: "rejected", reviewedBy: "admin1", reviewedAt: new Date(), reviewNote: "Missing contact info"
  }));
});

test("an admin cannot approve their own verification submission", async () => {
  await seedUser("admin1", "admin");
  await seedVerification("admin1", "pending");
  const db = asUser("admin1");
  await assertFails(db.collection("verifications").doc("admin1").update({
    status: "verified", reviewedBy: "admin1", reviewedAt: new Date(), reviewNote: ""
  }));
});

// ---- Phase 5: audit log -----------------------------------------------------

test("a signed-in user can file an audit entry for their own permitted action", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertSucceeds(db.collection("audit_log").add({
    actorId: "donorA", actorEmail: "donorA@example.com", action: "donation_created",
    targetId: "d1", targetType: "donation", metadata: {}, createdAt: new Date()
  }));
});

test("a user cannot file an audit entry claiming to be someone else", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("audit_log").add({
    actorId: "someone-else", actorEmail: "x@example.com", action: "donation_created",
    targetId: "d1", targetType: "donation", metadata: {}, createdAt: new Date()
  }));
});

test("a non-admin cannot file an admin-only audit action (e.g. verification_approved)", async () => {
  await seedUser("donorA", "donor");
  const db = asUser("donorA");
  await assertFails(db.collection("audit_log").add({
    actorId: "donorA", actorEmail: "donorA@example.com", action: "verification_approved",
    targetId: "donorB", targetType: "verification", metadata: {}, createdAt: new Date()
  }));
});

test("an admin can file an admin-only audit action", async () => {
  await seedUser("admin1", "admin");
  const db = asUser("admin1");
  await assertSucceeds(db.collection("audit_log").add({
    actorId: "admin1", actorEmail: "admin1@example.com", action: "verification_approved",
    targetId: "donorB", targetType: "verification", metadata: {}, createdAt: new Date()
  }));
});

test("a requester cannot file a donor-only audit action (donation_created)", async () => {
  await seedUser("req1", "requester");
  const db = asUser("req1");
  await assertFails(db.collection("audit_log").add({
    actorId: "req1", actorEmail: "req1@example.com", action: "donation_created",
    targetId: "d1", targetType: "donation", metadata: {}, createdAt: new Date()
  }));
});

test("nobody can modify an audit log entry once written, including admins", async () => {
  await seedUser("admin1", "admin");
  const logRef = await seed(async db => {
    const ref = db.collection("audit_log").doc();
    await ref.set({
      actorId: "admin1", actorEmail: "admin1@example.com", action: "account_suspended",
      targetId: "someone", targetType: "user", metadata: {}, createdAt: new Date()
    });
    return ref.id;
  });
  const db = asUser("admin1");
  await assertFails(db.collection("audit_log").doc(logRef).update({ action: "tampered" }));
});

test("nobody can delete an audit log entry, including admins", async () => {
  await seedUser("admin1", "admin");
  const logRef = await seed(async db => {
    const ref = db.collection("audit_log").doc();
    await ref.set({
      actorId: "admin1", actorEmail: "admin1@example.com", action: "account_suspended",
      targetId: "someone", targetType: "user", metadata: {}, createdAt: new Date()
    });
    return ref.id;
  });
  const db = asUser("admin1");
  await assertFails(db.collection("audit_log").doc(logRef).delete());
});

test("a non-admin cannot read the audit log", async () => {
  await seedUser("plain", "donor");
  await seed(db => db.collection("audit_log").add({
    actorId: "plain", actorEmail: "plain@example.com", action: "donation_created",
    targetId: "d1", targetType: "donation", metadata: {}, createdAt: new Date()
  }));
  const db = asUser("plain");
  await assertFails(db.collection("audit_log").get());
});

test("an admin can read the audit log", async () => {
  await seedUser("admin1", "admin");
  await seed(db => db.collection("audit_log").add({
    actorId: "admin1", actorEmail: "admin1@example.com", action: "account_suspended",
    targetId: "someone", targetType: "user", metadata: {}, createdAt: new Date()
  }));
  const db = asUser("admin1");
  await assertSucceeds(db.collection("audit_log").get());
});

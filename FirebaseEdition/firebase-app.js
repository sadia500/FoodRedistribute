/* ============================================================================
   Food Redistribution System — Firebase Edition
   A client-side port of the C++ engine's logic (Stack, Queue, PriorityQueue,
   Roads graph + Dijkstra, donation matching) so the whole app can run for
   free on Firebase Hosting + Firestore — no backend server required.

   The original ConsoleApp/redistribution.cpp is the source of truth this was
   ported from; this file does not change or replace it in any way.
   ============================================================================ */

// ---- 1. Firebase config — paste your project's config here ----------------
// Firebase Console → Project settings → General → Your apps → SDK setup →
// "Config". This object is safe to expose client-side (it's not a secret).
const firebaseConfig = {
  apiKey: "AIzaSyDEFEyx50Rxy13qzz7aedNNmbqsF53Wubo",
  authDomain: "foodredistribution-app.firebaseapp.com",
  projectId: "foodredistribution-app",
  storageBucket: "foodredistribution-app.firebasestorage.app",
  messagingSenderId: "951252476106",
  appId: "1:951252476106:web:06ad07a1b17d26d2a6d433",
  measurementId: "G-C3073ZZ78F"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ---- 1b. Authentication ----------------------------------------------------
// Every signed-in user gets a profile document at users/{uid} on first
// sign-in. Firestore rules (see firestore.rules) require request.auth to be
// set for every read/write, so nothing below runs for a signed-out visitor.
//
// Phase 4: `role` starts as 'member' (unassigned) and is claimed once by the
// signed-in user via claimRole('donor' | 'requester') — never 'admin', which
// only an existing admin can grant to someone else (see firestore.rules).
// `suspended` gates writes without revoking read access.

async function ensureUserProfile(user) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: user.email,
      role: "member",
      suspended: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function signUp(email, password) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

async function signIn(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

async function sendPasswordReset(email) {
  await auth.sendPasswordResetEmail(email);
}

async function signOutUser() {
  await auth.signOut();
}

function onAuthChange(callback) {
  return auth.onAuthStateChanged(callback);
}

// One-time role claim (see firestore.rules: allowed only from role=='member'
// and only to 'donor' or 'requester' — the rule itself is what actually
// stops anyone from claiming 'admin', this is just the client-side call).
async function claimRole(role) {
  if (role !== "donor" && role !== "requester") {
    throw new Error("Role must be 'donor' or 'requester'.");
  }
  await db.collection("users").doc(auth.currentUser.uid).update({ role });
}

async function getMyProfile() {
  const snap = await db.collection("users").doc(auth.currentUser.uid).get();
  return snap.exists ? snap.data() : null;
}

// Real-time profile subscription — used so a role claim or an admin-issued
// suspension is reflected in the UI immediately, without a manual refresh.
function watchMyProfile(callback) {
  return db.collection("users").doc(auth.currentUser.uid)
    .onSnapshot(snap => callback(snap.exists ? snap.data() : null));
}

function getMyUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

// ---- 1c. Admin: user/role management ---------------------------------------
// All three are also enforced server-side in firestore.rules (an admin can
// change any OTHER user's role/suspension, never their own) — these client
// functions exist for the admin UI, not as the security boundary itself.

async function listUsers() {
  const snap = await db.collection("users").orderBy("email").get();
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

async function setUserRole(uid, role) {
  if (!["donor", "requester", "admin", "member"].includes(role)) {
    throw new Error("Invalid role.");
  }
  await db.collection("users").doc(uid).update({ role });
}

async function setUserSuspended(uid, suspended) {
  await db.collection("users").doc(uid).update({ suspended: !!suspended });
}

// ---- 2. DSA structures — same behavior as the C++ classes ------------------

class Stack {
  constructor() { this.data = []; }
  push(v) { this.data.push(v); }
  pop() { this.data.pop(); }
  top() { return this.data[this.data.length - 1]; }
  isEmpty() { return this.data.length === 0; }
  size() { return this.data.length; }
}

class Queue {
  constructor() { this.data = []; }
  enqueue(v) { this.data.push(v); }
  dequeue() { this.data.shift(); }
  frontItem() { return this.data[0]; }
  isEmpty() { return this.data.length === 0; }
  size() { return this.data.length; }
}

// Binary heap, same comparator and heapify logic as PriorityQueue<Request>
// in redistribution.cpp: a "<" b  <=>  a.priorityLevel > b.priorityLevel
// (so priorityLevel 1 / Hospital surfaces first).
class PriorityQueue {
  constructor(lessThan) {
    this.heap = [];
    this.lessThan = lessThan; // (a, b) => bool, same semantics as operator<
  }
  push(value) {
    this.heap.push(value);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.lessThan(this.heap[index], this.heap[parent])) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
      index = parent;
    }
  }
  pop() {
    if (this.heap.length === 0) return;
    this.heap[0] = this.heap[this.heap.length - 1];
    this.heap.pop();
    let index = 0;
    const n = this.heap.length;
    while (true) {
      const left = 2 * index + 1, right = 2 * index + 2;
      let largest = index;
      if (left < n && this.lessThan(this.heap[largest], this.heap[left])) largest = left;
      if (right < n && this.lessThan(this.heap[largest], this.heap[right])) largest = right;
      if (largest === index) break;
      [this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]];
      index = largest;
    }
  }
  top() { return this.heap[0]; }
  isEmpty() { return this.heap.length === 0; }
  size() { return this.heap.length; }
  getHeap() { return this.heap; }
}

// ---- 3. Request "class" — mirrors Request::Request(...) in redistribution.cpp
// `extra` (Phase 4) carries the requester-view fields the spec asks for that
// don't exist in the original C++ model — beneficiaryCount, dietaryNotes,
// requiredByTime, urgencyNote, ownerId — as an additive 8th argument so the
// original 7-argument call shape (and every existing test) is unchanged.
function makeRequest(recipientName, foodType, quantity, organizationType, organizationName, location, requestDate, extra = {}) {
  const orgTypeUpper = organizationType.toUpperCase();
  let priorityLevel;
  if (orgTypeUpper === "HOSPITAL") priorityLevel = 1;
  else if (orgTypeUpper === "OLDAGE HOME") priorityLevel = 2;
  else if (orgTypeUpper === "CHARITY") priorityLevel = 3;
  else priorityLevel = 4;

  return {
    recipientName, foodType, quantity,
    organizationType: orgTypeUpper,
    organizationName, location, requestDate,
    priorityLevel,
    isUrgent: priorityLevel === 1,
    isFulfilled: false,
    skipReason: "",
    ...extra
  };
}
const requestLessThan = (a, b) => a.priorityLevel > b.priorityLevel;

// ---- 4. Roads graph + Dijkstra — same map, same output shape as Roads<T>::shortestPath
const karachiLocations = [
  "Clifton", "Saddar", "PECHS", "Gulshan-e-Iqbal", "Korangi",
  "North Nazimabad", "Malir", "Lyari", "Defense", "Bahadurabad",
  "Shahrah-e-Faisal", "Gulberg", "Landhi", "SITE", "Buffer Zone"
];

const roadEdges = [
  ["Saddar", "Clifton", 8], ["Saddar", "PECHS", 5], ["Saddar", "Lyari", 4],
  ["Saddar", "Gulshan-e-Iqbal", 10], ["Saddar", "North Nazimabad", 12],
  ["Clifton", "Defense", 6], ["Defense", "PECHS", 6], ["Defense", "Korangi", 12],
  ["PECHS", "Bahadurabad", 3], ["Bahadurabad", "Gulshan-e-Iqbal", 6],
  ["Gulshan-e-Iqbal", "Gulistan-e-Jauhar", 4], ["Gulistan-e-Jauhar", "Malir", 9],
  ["Malir", "Shahrah-e-Faisal", 5], ["Shahrah-e-Faisal", "Korangi", 6],
  ["Korangi", "Landhi", 8], ["Landhi", "SITE", 14],
  ["North Nazimabad", "Buffer Zone", 5], ["Buffer Zone", "Gulberg", 4],
  ["Gulberg", "Gulshan-e-Iqbal", 7], ["SITE", "Lyari", 7], ["SITE", "North Nazimabad", 11],
  ["Clifton", "Lyari", 6], ["Gulistan-e-Jauhar", "Shahrah-e-Faisal", 5],
  ["Bahadurabad", "Korangi", 10], ["Gulshan-e-Iqbal", "Malir", 12]
];

const roadMap = {};
karachiLocations.forEach(l => roadMap[l] = []);
// Gulistan-e-Jauhar appears only via addRoad in the original too (see README note)
roadEdges.forEach(([a, b]) => { if (!roadMap[a]) roadMap[a] = []; if (!roadMap[b]) roadMap[b] = []; });
roadEdges.forEach(([a, b, w]) => { roadMap[a].push([b, w]); roadMap[b].push([a, w]); });

// Same algorithm as Roads<T>::shortestPath: Dijkstra, then reconstruct path.
// Output format matches the C++ version so the existing route-result display
// and path-parsing logic keep working unchanged.
function shortestPath(start, end) {
  const dist = {}, prev = {};
  Object.keys(roadMap).forEach(k => { dist[k] = Infinity; prev[k] = null; });
  if (!(start in roadMap) || !(end in roadMap)) {
    return `No path from ${start} to ${end} (unknown location)`;
  }
  dist[start] = 0;
  const visited = new Set();
  while (visited.size < Object.keys(roadMap).length) {
    let current = null, best = Infinity;
    for (const node in dist) {
      if (!visited.has(node) && dist[node] < best) { best = dist[node]; current = node; }
    }
    if (current === null) break;
    visited.add(current);
    if (current === end) break;
    for (const [next, weight] of roadMap[current]) {
      const alt = dist[current] + weight;
      if (alt < dist[next]) { dist[next] = alt; prev[next] = current; }
    }
  }
  if (dist[end] === Infinity) return `No path from ${start} to ${end}`;

  const path = [];
  let at = end;
  while (at !== null) { path.push(at); at = prev[at]; }
  path.reverse();

  return `[Shortest path from ${start} to ${end}: ${path.join(" -> ")} (Distance: ${dist[end]}) ]`;
}

// ---- 5. Donation matching ---------------------------------------------
// findMatchingDonations allocates a single request's quantity across
// however many eligible donations it takes to cover it, largest lot first
// (so a request doesn't fragment more donations than necessary). This is
// what lets one 50-unit donation serve a 20-unit request and a 15-unit
// request separately (tracked by decrementing `quantity` per donation) *and*
// lets one request whose need exceeds any single donation draw from several
// smaller ones at once — e.g. a 30-unit request pulling 25 from one lot and
// 5 from another. Returns null if the eligible total can't cover the request
// at all; otherwise an array of { donation, take } allocations that sum to
// exactly quantityNeeded.
function toLower(s) { return (s || "").toLowerCase(); }

function findMatchingDonations(donations, foodTypeNeeded, quantityNeeded, requestDate) {
  const neededLower = toLower(foodTypeNeeded);
  const eligible = donations
    .filter(d =>
      toLower(d.foodType) === neededLower &&
      d.quantity > 0 &&
      (d.expiryDate || "").trim() > (requestDate || "").trim()
    )
    .sort((a, b) => b.quantity - a.quantity);

  const totalAvailable = eligible.reduce((sum, d) => sum + d.quantity, 0);
  if (totalAvailable < quantityNeeded) return null;

  const allocations = [];
  let remaining = quantityNeeded;
  for (const d of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(d.quantity, remaining);
    allocations.push({ donation: d, take });
    remaining -= take;
  }
  return allocations;
}

// ---- 6. In-memory state, loaded from Firestore on startup ------------------
let donors = [];
let donations = [];
let urgentPQ = new PriorityQueue(requestLessThan);
let pendingQueue = new Queue();
let fulfilledStack = new Stack();

async function loadAllState() {
  const [donorsSnap, donationsSnap, urgentSnap, pendingSnap, fulfilledSnap] = await Promise.all([
    db.collection("donors").orderBy("id").get(),
    db.collection("donations").orderBy("donationId").get(),
    db.collection("requests_urgent").orderBy("createdAt").get(),
    db.collection("requests_pending").orderBy("createdAt").get(),
    db.collection("requests_fulfilled").orderBy("createdAt").get()
  ]);

  donors = donorsSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  donations = donationsSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

  urgentPQ = new PriorityQueue(requestLessThan);
  urgentSnap.docs.forEach(d => urgentPQ.push({ _id: d.id, ...d.data() }));

  pendingQueue = new Queue();
  pendingSnap.docs.forEach(d => pendingQueue.enqueue({ _id: d.id, ...d.data() }));

  fulfilledStack = new Stack();
  fulfilledSnap.docs.forEach(d => fulfilledStack.push({ _id: d.id, ...d.data() }));
}

// ---- 7. Actions (mirror the API routes in server_main.cpp) -----------------
//
// Phase 4: donations and requests now carry `ownerId` (the creating user's
// uid) and creation/edits are role- and ownership-scoped, enforced in
// firestore.rules — these functions just shape the writes to match what the
// rules will accept, they are not themselves the security boundary.

// A donor-role user's registry entry (donors/{uid}) — auto-created the first
// time they touch the donor dashboard, rather than hand-typing a numeric
// donor ID the way the legacy "Register donor" form used to. `donors.id`
// keeps meaning "whatever donations.donorId points at", it's just the uid
// now instead of an arbitrary number.
async function ensureDonorProfile(user, defaults = {}) {
  const ref = db.collection("donors").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      id: user.uid,
      ownerId: user.uid,
      name: defaults.name || user.email,
      type: defaults.type || "Restaurant",
      contact: defaults.contact || user.email,
      address: defaults.address || karachiLocations[0]
    });
  }
  return ref.id;
}

async function updateDonorProfile(fields) {
  const uid = auth.currentUser.uid;
  await ensureDonorProfile(auth.currentUser);
  const { name, contact, type, address } = fields;
  await db.collection("donors").doc(uid).update({ name, contact, type, address });
}

// Legacy/explicit-ID path — kept for anything that still calls it directly,
// but no longer reachable from the UI (a donor's own uid is now always the
// donorId; see ensureDonorProfile). Left ownership-safe: the caller must be
// the donor whose id they're claiming for.
async function addDonor({ id, name, contact, type, address }) {
  await db.collection("donors").doc(String(id)).set({
    id, name, contact, type, address, ownerId: auth.currentUser.uid
  });
}

// Donor dashboard "log donation" — always owned by the signed-in donor.
// Firestore auto-generates the doc id (donationId mirrors it) instead of a
// hand-typed number, so two donors logging at the same moment can never
// collide the way two typed-in IDs could.
async function addDonation(fields) {
  const uid = auth.currentUser.uid;
  await ensureDonorProfile(auth.currentUser);
  const ref = db.collection("donations").doc();
  const donationId = ref.id;
  const quantity = Number(fields.quantity);
  await ref.set({
    donationId,
    donorId: uid,
    ownerId: uid,
    foodType: fields.foodType,
    quantity,
    originalQuantity: quantity,
    expiryDate: fields.expiryDate,
    status: "Pending",
    prepTime: fields.prepTime || "",
    pickupTime: fields.pickupTime || "",
    location: fields.location || "",
    description: fields.description || "",
    allergenInfo: fields.allergenInfo || ""
  });
  return donationId;
}

// Admin maintenance: purge every expired donation regardless of owner
// (allowed by the isAdmin() bypass in firestore.rules).
async function expireDonations(todayDate) {
  const expired = donations.filter(d => d.expiryDate <= todayDate);
  await Promise.all(expired.map(d => db.collection("donations").doc(d._id).delete()));
}

// Donor self-service: purge only the signed-in donor's own expired stock
// (allowed by the isOwner() branch, no admin bypass needed).
async function expireMyDonations(todayDate) {
  const uid = auth.currentUser.uid;
  const expired = donations.filter(d => d.ownerId === uid && d.expiryDate <= todayDate);
  await Promise.all(expired.map(d => db.collection("donations").doc(d._id).delete()));
}

// Requester dashboard "new request" — always owned by the signed-in
// requester. `extra` carries the requester-view fields from the form
// (beneficiaryCount, dietaryNotes, requiredByTime, urgencyNote).
async function submitRequest({ recipientName, foodType, quantity, organizationType, organizationName, location, requestDate, ...extra }) {
  const uid = auth.currentUser.uid;
  const r = makeRequest(recipientName, foodType, quantity, organizationType, organizationName, location, requestDate, {
    ...extra, ownerId: uid
  });
  await db.collection("requests_urgent").add({ ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// Drains the urgent PriorityQueue, attempting to allocate each request
// against the current in-memory donation list (mutated in place as it goes,
// same as before, so a later request in the same run sees earlier
// allocations already subtracted) and returns a log of every outcome.
//
// Unchanged since Phase 3 — the allocation/partial-matching algorithm itself
// is exactly what it was. What's new in Phase 4 is *who* is allowed to call
// this: it mutates OTHER users' donations (decrementing quantity as it
// allocates) and moves OTHER users' requests between collections, which
// firestore.rules now only allows an admin to do (see the design note at
// the top of firestore.rules). The UI restricts the "Run fulfillment"
// control to the admin dashboard accordingly.
async function runFulfillment() {
  const results = [];
  const batch = db.batch();
  const toDelete = [];

  while (!urgentPQ.isEmpty()) {
    const r = { ...urgentPQ.top() };
    urgentPQ.pop();
    toDelete.push(r._id);

    const allocations = findMatchingDonations(donations, r.foodType, r.quantity, r.requestDate);

    if (allocations) {
      const donorLocations = [];
      allocations.forEach(({ donation, take }) => {
        donation.quantity -= take;
        donation.status = donation.quantity === 0 ? "Completed" : "Partially Fulfilled";
        batch.update(db.collection("donations").doc(donation._id), {
          quantity: donation.quantity, status: donation.status
        });
        const donor = donors.find(d => d.id === donation.donorId);
        donorLocations.push(donor ? donor.address : "Unknown Location");
      });

      r.isFulfilled = true;
      r.sourceDonations = allocations.map(a => ({ donationId: a.donation.donationId, quantity: a.take }));

      // Route from the primary (largest-contribution) donor; when more than
      // one donation contributed, note that in the result for the UI.
      const primaryLocation = donorLocations[0];
      const route = shortestPath(primaryLocation, r.location);

      const fulfilledRef = db.collection("requests_fulfilled").doc();
      batch.set(fulfilledRef, { ...stripMeta(r), createdAt: firebase.firestore.FieldValue.serverTimestamp() });

      results.push({
        status: "fulfilled", request: r, fromLocation: primaryLocation, route,
        splitAcross: allocations.length, donorLocations
      });
    } else {
      const needed = toLower(r.foodType);
      const matchingType = donations.filter(d => toLower(d.foodType) === needed);
      let reason;
      if (matchingType.length === 0) {
        reason = `Food type '${r.foodType}' not in stock`;
      } else {
        const stillValid = matchingType.filter(d =>
          d.quantity > 0 && (d.expiryDate || "").trim() > (r.requestDate || "").trim()
        );
        const totalAvailable = stillValid.reduce((sum, d) => sum + d.quantity, 0);
        if (stillValid.length === 0) {
          reason = matchingType.every(d => d.quantity === 0)
            ? "Donation already used"
            : `All matching donations expired (as of ${r.requestDate})`;
        } else {
          reason = `Insufficient quantity across all matching donations (Available: ${totalAvailable}, Needed: ${r.quantity})`;
        }
      }

      r.skipReason = reason;
      const pendingRef = db.collection("requests_pending").doc();
      batch.set(pendingRef, { ...stripMeta(r), createdAt: firebase.firestore.FieldValue.serverTimestamp() });

      results.push({ status: "pending", request: r, reason });
    }
  }

  toDelete.forEach(id => batch.delete(db.collection("requests_urgent").doc(id)));
  await batch.commit();
  await loadAllState();
  return results;
}

function stripMeta(r) {
  const { _id, createdAt, ...rest } = r;
  return rest;
}

// Exposed for the page's UI code
window.FRS = {
  karachiLocations, roadMap, roadEdges, shortestPath,
  loadAllState, addDonor, addDonation, expireDonations, expireMyDonations,
  submitRequest, runFulfillment,
  ensureDonorProfile, updateDonorProfile,
  getState: () => ({ donors, donations, urgentPQ, pendingQueue, fulfilledStack }),
  // Auth / roles
  signUp, signIn, signOutUser, sendPasswordReset, onAuthChange,
  getCurrentUser: () => auth.currentUser,
  getMyUid, claimRole, getMyProfile, watchMyProfile,
  // Admin
  listUsers, setUserRole, setUserSuspended,
  // Exposed for the test suite (test/*.test.js) — these are pure/isolated
  // enough to unit test directly without a Firestore connection.
  Stack, Queue, PriorityQueue, makeRequest, findMatchingDonations
};

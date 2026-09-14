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
function makeRequest(recipientName, foodType, quantity, organizationType, organizationName, location, requestDate) {
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
    skipReason: ""
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

// ---- 5. Donation matching — mirrors DonationLinkedList::findMatchingDonation
function toLower(s) { return (s || "").toLowerCase(); }

function findMatchingDonation(donations, foodTypeNeeded, quantityNeeded, requestDate) {
  const neededLower = toLower(foodTypeNeeded);
  for (const d of donations) {
    if (toLower(d.foodType) !== neededLower) continue;
    if (d.quantity < quantityNeeded) continue;
    if ((d.expiryDate || "").trim() <= (requestDate || "").trim()) continue;
    return d;
  }
  return null;
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

async function addDonor({ id, name, contact, type, address }) {
  await db.collection("donors").doc(String(id)).set({ id, name, contact, type, address });
}

async function addDonation({ donationId, donorId, foodType, quantity, expiryDate }) {
  const donor = donors.find(d => d.id === donorId);
  if (!donor) throw new Error("Donor not found");
  await db.collection("donations").doc(String(donationId)).set({
    donationId, donorId, foodType, quantity, originalQuantity: quantity, expiryDate, status: "Pending"
  });
}

async function expireDonations(todayDate) {
  const expired = donations.filter(d => d.expiryDate <= todayDate);
  await Promise.all(expired.map(d => db.collection("donations").doc(d._id).delete()));
}

async function submitRequest({ recipientName, foodType, quantity, organizationType, organizationName, location, requestDate }) {
  const r = makeRequest(recipientName, foodType, quantity, organizationType, organizationName, location, requestDate);
  await db.collection("requests_urgent").add({ ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// Runs the same matching loop as /api/requests/fulfill in server_main.cpp,
// draining the urgent PriorityQueue and returning a log of every outcome.
async function runFulfillment() {
  const results = [];
  const batch = db.batch();
  const toDelete = [];

  while (!urgentPQ.isEmpty()) {
    const r = { ...urgentPQ.top() };
    urgentPQ.pop();
    toDelete.push(r._id);

    const match = findMatchingDonation(donations, r.foodType, r.quantity, r.requestDate);

    if (match) {
      match.quantity -= r.quantity;
      if (match.quantity === 0) match.status = "Completed";
      batch.update(db.collection("donations").doc(match._id), {
        quantity: match.quantity, status: match.status
      });

      r.isFulfilled = true;
      const donor = donors.find(d => d.id === match.donorId);
      const donorLoc = donor ? donor.address : "Unknown Location";
      const route = shortestPath(donorLoc, r.location);

      const fulfilledRef = db.collection("requests_fulfilled").doc();
      batch.set(fulfilledRef, { ...stripMeta(r), createdAt: firebase.firestore.FieldValue.serverTimestamp() });

      results.push({ status: "fulfilled", request: r, fromLocation: donorLoc, route });
    } else {
      const needed = toLower(r.foodType);
      let reason = "No matching donation found";
      let foundType = false;
      for (const d of donations) {
        if (toLower(d.foodType) === needed) {
          foundType = true;
          if (d.quantity < r.quantity) {
            reason = `Insufficient quantity (Available: ${d.quantity}, Needed: ${r.quantity})`;
            break;
          }
          if (d.status !== "Pending" && d.status !== "partially completed") {
            reason = "Donation already used";
            break;
          }
          if ((d.expiryDate || "").trim() <= (r.requestDate || "").trim()) {
            reason = `Donation expired (Expiry: ${d.expiryDate})`;
            break;
          }
        }
      }
      if (!foundType) reason = `Food type '${r.foodType}' not in stock`;

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
  loadAllState, addDonor, addDonation, expireDonations, submitRequest, runFulfillment,
  getState: () => ({ donors, donations, urgentPQ, pendingQueue, fulfilledStack })
};

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadFRS } = require("./helpers/loadFRS");

const FRS = loadFRS();

function donation(overrides) {
  return {
    _id: overrides.donationId != null ? String(overrides.donationId) : "d",
    donationId: 1,
    donorId: 1,
    foodType: "Rice",
    quantity: 10,
    originalQuantity: 10,
    expiryDate: "2026-12-31",
    status: "Pending",
    ...overrides
  };
}

test("findMatchingDonations: a single donation covers the whole request", () => {
  const donations = [donation({ donationId: 1, quantity: 50 })];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 20, "2026-01-01");
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].take, 20);
  assert.equal(allocations[0].donation.donationId, 1);
});

test("findMatchingDonations: one donation serves two separate requests in turn (spec example: 50 -> 20, then 15, 15 remaining)", () => {
  const donations = [donation({ donationId: 1, quantity: 50 })];

  const first = FRS.findMatchingDonations(donations, "Rice", 20, "2026-01-01");
  first.forEach(a => { a.donation.quantity -= a.take; });
  assert.equal(donations[0].quantity, 30, "30 should remain after the first 20-unit request");

  const second = FRS.findMatchingDonations(donations, "Rice", 15, "2026-01-01");
  second.forEach(a => { a.donation.quantity -= a.take; });
  assert.equal(donations[0].quantity, 15, "15 should remain after the second 15-unit request");
});

test("findMatchingDonations: a single request splits across multiple donations when no one lot covers it", () => {
  const donations = [
    donation({ donationId: 1, quantity: 25 }),
    donation({ donationId: 2, quantity: 5 })
  ];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 30, "2026-01-01");
  assert.equal(allocations.length, 2, "should draw from both donations");
  const total = allocations.reduce((sum, a) => sum + a.take, 0);
  assert.equal(total, 30, "allocated amounts must sum to exactly what was requested");
  // Largest lot first, so it isn't fragmented more than necessary.
  assert.equal(allocations[0].donation.donationId, 1);
  assert.equal(allocations[0].take, 25);
  assert.equal(allocations[1].donation.donationId, 2);
  assert.equal(allocations[1].take, 5);
});

test("findMatchingDonations: returns null when total eligible stock is less than requested", () => {
  const donations = [
    donation({ donationId: 1, quantity: 10 }),
    donation({ donationId: 2, quantity: 5 })
  ];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 30, "2026-01-01");
  assert.equal(allocations, null);
});

test("findMatchingDonations: ignores donations that have already expired relative to the request date", () => {
  const donations = [donation({ donationId: 1, quantity: 50, expiryDate: "2025-01-01" })];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 10, "2026-01-01");
  assert.equal(allocations, null, "an expired donation must never be matched");
});

test("findMatchingDonations: ignores donations of a different food type", () => {
  const donations = [donation({ donationId: 1, foodType: "Bread", quantity: 50 })];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 10, "2026-01-01");
  assert.equal(allocations, null);
});

test("findMatchingDonations: food type match is case-insensitive", () => {
  const donations = [donation({ donationId: 1, foodType: "rice", quantity: 50 })];
  const allocations = FRS.findMatchingDonations(donations, "RICE", 10, "2026-01-01");
  assert.equal(allocations.length, 1);
});

test("findMatchingDonations: a fully-depleted donation (quantity 0) is never reused", () => {
  const donations = [donation({ donationId: 1, quantity: 0 })];
  const allocations = FRS.findMatchingDonations(donations, "Rice", 5, "2026-01-01");
  assert.equal(allocations, null);
});

test("makeRequest: priority levels match the C++ engine's ranking (Hospital > OldAge Home > Charity > other)", () => {
  const hospital = FRS.makeRequest("A", "Rice", 5, "Hospital", "Org", "Clifton", "2026-01-01");
  const oldAge = FRS.makeRequest("B", "Rice", 5, "OldAge Home", "Org", "Clifton", "2026-01-01");
  const charity = FRS.makeRequest("C", "Rice", 5, "Charity", "Org", "Clifton", "2026-01-01");
  const other = FRS.makeRequest("D", "Rice", 5, "Shelter", "Org", "Clifton", "2026-01-01");

  assert.equal(hospital.priorityLevel, 1);
  assert.equal(oldAge.priorityLevel, 2);
  assert.equal(charity.priorityLevel, 3);
  assert.equal(other.priorityLevel, 4);
  assert.equal(hospital.isUrgent, true);
  assert.equal(charity.isUrgent, false);
});

test("PriorityQueue: pops requests in priority order regardless of insertion order", () => {
  const pq = new FRS.PriorityQueue((a, b) => a.priorityLevel > b.priorityLevel);
  const charity = FRS.makeRequest("C", "Rice", 5, "Charity", "Org", "Clifton", "2026-01-01");
  const hospital = FRS.makeRequest("H", "Rice", 5, "Hospital", "Org", "Clifton", "2026-01-01");
  const oldAge = FRS.makeRequest("O", "Rice", 5, "OldAge Home", "Org", "Clifton", "2026-01-01");

  pq.push(charity);
  pq.push(hospital);
  pq.push(oldAge);

  assert.equal(pq.top().recipientName, "H", "Hospital (priority 1) must come out first");
  pq.pop();
  assert.equal(pq.top().recipientName, "O", "OldAge Home (priority 2) must come out second");
  pq.pop();
  assert.equal(pq.top().recipientName, "C", "Charity (priority 3) must come out last");
  pq.pop();
  assert.equal(pq.isEmpty(), true);
});

test("shortestPath: finds the known-shortest route between two connected locations", () => {
  const result = FRS.shortestPath("Saddar", "PECHS");
  assert.match(result, /Saddar -> PECHS/, "direct 5-weight edge should be the shortest path, not a longer detour");
  assert.match(result, /Distance: 5/);
});

test("shortestPath: reports no path for an unknown location", () => {
  const result = FRS.shortestPath("Saddar", "Atlantis");
  assert.match(result, /No path|unknown location/);
});

test("Queue and Stack: FIFO / LIFO ordering, matching the C++ engine's pending/fulfilled queues", () => {
  const q = new FRS.Queue();
  q.enqueue("first"); q.enqueue("second");
  assert.equal(q.frontItem(), "first");
  q.dequeue();
  assert.equal(q.frontItem(), "second");

  const s = new FRS.Stack();
  s.push("first"); s.push("second");
  assert.equal(s.top(), "second", "most recently fulfilled request should show first, like the console app's history");
});

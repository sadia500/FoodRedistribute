// Loads FirebaseEdition/firebase-app.js into a sandboxed VM context with
// stub `firebase` and `window` globals, and returns the resulting
// `window.FRS` object.
//
// This runs the actual shipped source file rather than a re-implementation
// of its logic, so the tests exercise exactly what the browser loads. The
// stubbed Firestore/Auth objects are never called by the pieces under test
// here (PriorityQueue, shortestPath, findMatchingDonations, makeRequest) —
// they only need to exist so the top-level `firebase.initializeApp(...)`,
// `firebase.firestore()`, and `firebase.auth()` calls at the top of the
// file don't throw while it loads.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadFRS() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "FirebaseEdition", "firebase-app.js"),
    "utf8"
  );

  const fakeCollectionRef = {
    doc() {
      return { set: async () => {}, get: async () => ({ exists: false }) };
    },
    add: async () => ({ id: "fake-id" }),
    orderBy() { return this; },
    get: async () => ({ docs: [] })
  };

  const fakeFirestoreInstance = {
    collection: () => fakeCollectionRef,
    batch: () => ({ update() {}, set() {}, delete() {}, commit: async () => {} })
  };

  function fakeFirestoreFn() { return fakeFirestoreInstance; }
  fakeFirestoreFn.FieldValue = { serverTimestamp: () => "SERVER_TIMESTAMP" };

  const fakeAuthInstance = {
    currentUser: null,
    onAuthStateChanged: () => () => {},
    createUserWithEmailAndPassword: async () => ({ user: { uid: "u1", email: "" } }),
    signInWithEmailAndPassword: async () => ({ user: { uid: "u1", email: "" } }),
    signOut: async () => {},
    sendPasswordResetEmail: async () => {}
  };

  const fakeFirebase = {
    initializeApp: () => {},
    firestore: fakeFirestoreFn,
    auth: () => fakeAuthInstance
  };

  const windowObj = {};
  const sandbox = {
    firebase: fakeFirebase,
    window: windowObj,
    console,
    performance: typeof performance !== "undefined" ? performance : { now: () => Date.now() }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "firebase-app.js" });
  return sandbox.window.FRS;
}

module.exports = { loadFRS };

# Food Redistribution System

A C++ application that connects food donors with recipient organizations (hospitals, old-age homes, and charities), matching available donations against incoming requests and routing deliveries across a simulated city road network.

The system was built to explore core data structures and algorithms in a practical, real-world scenario rather than in isolation — every DSA concept below maps to an actual operational need in the system (e.g. urgent requests need a priority queue, not just a list; route calculation needs a weighted graph and Dijkstra's algorithm, not a lookup table).

**Live demo:** **[foodredistribution-app.web.app](https://foodredistribution-app.web.app)** — the Firebase Edition, deployed and free to visit, no setup required.

## Overview

Donors register and log food donations with quantity and expiry information. Recipient organizations submit requests for specific food types and quantities. The system automatically matches requests to available donations — prioritizing by organization type (hospitals first, then old-age homes, then charities) — and calculates the shortest delivery route between the donor's and recipient's locations using a custom-built graph of Karachi neighborhoods.

Requests that cannot be immediately fulfilled (due to insufficient stock, expired donations, or unavailable food types) are moved to a pending queue with a logged reason, and can be edited and resubmitted later.

## Features

- **Donor management** — add, search, list, and remove donors (individuals or organizations)
- **Donation tracking** — log donations with food type, quantity, and expiry date; automatically purge expired stock
- **Request handling** — submit requests that are auto-prioritized by organization type (Hospital > Old-Age Home > Charity)
- **Automated matching** — matches pending requests against available donations by food type, quantity, and expiry validity
- **Pending request recovery** — failed matches are queued with a specific failure reason (out of stock, insufficient quantity, expired, donation already used) and can be rebooked with updated details
- **Delivery routing** — computes the shortest path between donor and recipient locations across a 15-location city map
- **Reporting** — fulfilled delivery history and live system statistics (urgent/pending/delivered counts, donor breakdowns)
- **Persistent storage** — donors, donations, and all request queues persist between sessions (CSV files in the console edition, Firestore in the web editions)

## Data Structures & Algorithms

| Concept | Where it's used | Why |
|---|---|---|
| **Priority Queue (binary heap)** | Urgent request queue, Dijkstra's frontier | Requests need to be served by priority (hospitals before charities), not insertion order |
| **Queue** | Pending requests | Requests wait to be retried in the order they failed |
| **Stack** | Fulfilled request history | Most recently delivered requests are naturally shown first |
| **Singly linked list** | Donor records, donation records | Supports dynamic insertion/removal without pre-sized storage |
| **Weighted graph (adjacency list)** | City road network | Models real distances between 15 Karachi locations |
| **Dijkstra's algorithm** | Shortest delivery route | Reused the project's own max-heap `PriorityQueue` (negated distances) instead of pulling in a separate min-heap implementation |

All core structures (`Stack<T>`, `Queue<T>`, `PriorityQueue<T>`, `Graph<T>`, linked lists) are implemented from scratch as templates rather than relying on the STL equivalents, since the point of the project was to build and reason about the structures directly.

## Project Structure

```
FoodRedistributionSystem(new)/     # Console app — the original, source-of-truth C++ engine
├── FoodRedistributionSystem.cpp   # main() — menu-driven UI and program flow
├── Redistribution.hpp             # class & template declarations (Donor, FoodDonation, Request, Stack, Queue, PriorityQueue, Graph, Roads)
└── redistribution.cpp             # implementations: CSV I/O, matching logic, Dijkstra's shortest path, Karachi map data

WebEdition/                        # Same C++ engine behind a local JSON API + web dashboard
├── server_main.cpp                # httplib-based API server (wraps the console engine's logic)
├── index.html                     # Web dashboard UI
├── Dockerfile                     # For deploying to a container host (Render, Fly.io, etc.)
└── DEPLOY.md                      # Deployment instructions

FirebaseEdition/                   # Client-side JS port — live, permanently free, no server required
├── index.html                     # Same dashboard UI, wired to Firestore instead of a backend API
├── firebase-app.js                # DSA logic (Stack, Queue, PriorityQueue, Dijkstra, matching) ported to JavaScript
└── FIREBASE_DEPLOY.md             # Deployment instructions (Firebase Hosting + Firestore, Spark/free plan)
```

## Getting Started (Console Edition)

### Prerequisites
- Windows (the project uses `<Windows.h>` and `system("cls")` for console handling)
- Visual Studio (recommended — a `.sln` file is included) or any MSVC/MinGW-compatible C++ compiler

### Build & Run

1. Open `FoodRedistributionSystem(new).sln` in Visual Studio
2. **Important:** `redistribution.cpp` should **not** be compiled as a separate translation unit — it's already pulled in via `#include "redistribution.cpp"` at the bottom of `Redistribution.hpp`. If your compiler complains about duplicate symbols, exclude `redistribution.cpp` from the build (right-click the file → Properties → Exclude From Build → Yes).
3. Build and run `FoodRedistributionSystem.cpp` as the startup project.
4. On first run, the app creates its own CSV files (`donors.csv`, `donations.csv`, `pending.csv`, `urgent.csv`, `fulfilled_request.csv`) in the working directory to persist data across sessions.

## Sample Flow

1. Add a donor and log a donation (food type, quantity, expiry date).
2. Submit a request from a recipient organization — it's automatically ranked by priority.
3. Run **Fulfill Urgent Requests** — the system matches it against available donations and prints the shortest route from the donor's location to the recipient's.
4. Unmatched requests fall into the pending queue with a clear reason, and can be edited and rebooked later.

## Web Edition

`WebEdition/` runs the same engine behind a small local JSON API (built with [httplib](https://github.com/yhirose/cpp-httplib)), driving a web dashboard — donor/donation management, request submission, live fulfillment runs, and an interactive graph view of the routing network with the actual Dijkstra path highlighted. This is a second, independent executable; the console app is unchanged. See `WebEdition/BUILD_INSTRUCTIONS.md` to run it locally, or `WebEdition/DEPLOY.md` to deploy it to a container host like Render or Fly.io.

## Firebase Edition (live demo)

`FirebaseEdition/` is a client-side JavaScript port of the same DSA logic — Stack, Queue, PriorityQueue, the Roads graph, Dijkstra's algorithm, and the donation-matching rules are all reimplemented faithfully in `firebase-app.js`, reading and writing Firestore directly instead of talking to a backend server. This lets the whole dashboard run permanently for free on Firebase Hosting's Spark (no credit card) plan, with no server to keep alive and no idle/sleep delay.

It's live at **[foodredistribution-app.web.app](https://foodredistribution-app.web.app)**. See `FirebaseEdition/FIREBASE_DEPLOY.md` for how to deploy your own copy.

The original C++ source (`FoodRedistributionSystem(new)/`, `WebEdition/`) is untouched by this edition — it's a separate, self-contained implementation of the same logic for the web.

## Notes

- Location data (donor/recipient addresses) is currently limited to a fixed set of 15 predefined Karachi neighborhoods used in the UI. The underlying road graph technically has a 16th node (`Gulistan-e-Jauhar`), added implicitly as a waypoint between two of the listed locations, but it's never assignable as a donor/recipient address.
- Matching logic checks food type, available quantity, donation status, and expiry date (relative to the request date) before confirming a fulfillment.

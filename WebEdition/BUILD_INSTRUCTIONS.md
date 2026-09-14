# Web Edition — Build & Run

This is a second, separate way to run the project: the same DSA engine (`Redistribution.hpp` / `redistribution.cpp`, unchanged in logic) wrapped with a small local HTTP API (`server_main.cpp`), driven by a web dashboard (`index.html`).

The original console app (`FoodRedistributionSystem.cpp`) still works exactly as before — this doesn't replace it, it's an alternative frontend on the same backend.

## 1. Build the API server (Visual Studio)

1. Create a **new, separate** C++ Console App project (don't add this to the existing console app's project — both define `main()`).
2. Add these 4 files to the new project: `server_main.cpp`, `Redistribution.hpp`, `redistribution.cpp`, `httplib.h`, `json.hpp`.
3. **Exclude `redistribution.cpp` from the build** the same way as the console app (Properties → Exclude From Build → Yes) — it's pulled in automatically via the `#include` at the bottom of `Redistribution.hpp`.
4. In Project Properties → Linker → Input → Additional Dependencies, add `ws2_32.lib` (needed for sockets on Windows).
5. Build in **x64** (recommended) and run.

You should see:
```
Food Redistribution API running at http://localhost:8080
```
Leave this window running — it's your backend.

## 2. Open the web dashboard

Just double-click `index.html` to open it in your browser (Chrome/Edge/Firefox all work). It talks to `http://localhost:8080` automatically.

- Green dot, bottom-left = connected to the server.
- Red dot = server isn't running — go back and start it first.

## 3. Try it end-to-end

1. **Donors** tab → register a donor.
2. **Donations** tab → log a donation for that donor.
3. **Requests** tab → submit a request (pick "Hospital" to see it jump the priority queue).
4. Click **Run fulfillment on urgent queue** — this runs the exact same matching + Dijkstra routing logic as the console app's option 3, and shows the computed delivery route.
5. **Route Finder** tab → pick any two locations and see the shortest path highlighted directly on the graph.

## Notes

- The server reads/writes the same CSV files (`donors.csv`, `donations.csv`, etc.) as the console app, in whatever folder you run it from — so data logged through the web UI persists the same way.
- `httplib.h` and `json.hpp` are widely-used, single-header open-source libraries (MIT licensed) — nothing to install, just include them like any other header.

# Deploying the Web Edition (free, stays live)

The Web Edition is a real C++ server (not a static site), so it needs a host
that can build and run a Docker container continuously — not a static host
like GitHub Pages or Netlify. **Render.com's free tier** does this and needs
no credit card.

## 1. Push this folder to GitHub

Make sure `WebEdition/` (with `server_main.cpp`, `Redistribution.hpp`,
`redistribution.cpp`, `httplib.h`, `json.hpp`, `index.html`, `Dockerfile`)
is committed to your `sadia500/FoodRedistribution` repo.

## 2. Create the Render service

1. Go to [render.com](https://render.com) → sign up (GitHub login is fastest).
2. **New +** → **Web Service**.
3. Connect your `FoodRedistribution` repo.
4. Set:
   - **Root Directory**: `WebEdition`
   - **Runtime**: `Docker` (Render auto-detects the `Dockerfile`)
   - **Instance Type**: `Free`
5. Click **Create Web Service**.

Render builds the Docker image (installs g++, compiles `server_main.cpp`,
copies `index.html`) and starts the container. It automatically sets the
`$PORT` environment variable — the server already reads that and binds
`0.0.0.0`, so no extra config is needed.

## 3. Open it

Render gives you a URL like `https://food-redistribution.onrender.com`.
Open it directly — `index.html` is now served from the same server as the
API, so there's nothing else to configure. The whole dashboard (donors,
donations, requests, fulfillment, route finder) works exactly as it does
locally.

## Things to know about the free tier

- **Spins down when idle.** After ~15 minutes with no traffic, Render puts
  the free instance to sleep. The next visit takes ~30–50 seconds to wake
  up — normal for free hosting, not a bug.
- **No persistent storage.** Free instances don't keep a disk across
  redeploys/restarts, so donor/donation/request data added through the live
  site will reset when the service restarts or redeploys. Fine for a demo
  or class presentation; if you need data to survive, Render's free tier
  doesn't include persistent disks (a paid plan does), or you'd swap the
  CSV files for a small hosted database later.
- **Rebuilding**: any push to the connected branch triggers an automatic
  redeploy.

## Alternative: Fly.io

Fly.io also has a free allowance and Dockerfile-based deploys
(`fly launch` in this folder, then `fly deploy`) if you'd rather not use
Render — the same `Dockerfile` here works there unchanged.

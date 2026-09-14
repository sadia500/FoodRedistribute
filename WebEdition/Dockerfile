# Builds and runs the Food Redistribution System's Web Edition
# (server_main.cpp + the same DSA engine used by the console app).
#
# Deploy this whole WebEdition/ folder (this Dockerfile included) to any
# host that builds from a Dockerfile — Render.com's free tier is the
# easiest. See DEPLOY.md in this folder for step-by-step instructions.

FROM gcc:13-bookworm AS build
WORKDIR /app
COPY . .
RUN g++ -std=c++17 -O2 -pthread server_main.cpp -o server

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/server ./server
COPY --from=build /app/index.html ./index.html
# Note: on most free hosts the filesystem resets on redeploy/restart,
# so donors/donations/requests added at runtime won't persist long-term
# unless the host offers a persistent disk/volume.
EXPOSE 8080
CMD ["./server"]

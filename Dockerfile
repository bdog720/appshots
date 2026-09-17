# syntax=docker/dockerfile:1

# ---------- Build stage: compile the SPA with Bun + Vite ----------
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and produce the static bundle in /app/dist.
COPY . .
RUN bun run build

# ---------- Runtime stage: Bun server for the app + storage API ----------
FROM oven/bun:1-alpine AS runtime
LABEL org.opencontainers.image.title="breezel" \
      org.opencontainers.image.description="App Store / Play Store screenshot generator with built-in project storage" \
      org.opencontainers.image.source="https://github.com/bdog720/breezel"

WORKDIR /app

# Built app + dependency-free server. No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
COPY server ./server

# The server already defaults to /data and ./dist (server/config.ts). Setting
# BREEZEL_DATA_DIR here would hide an APPSHOTS_DATA_DIR set by an older stack.
ENV PORT=80 \
    NODE_ENV=production

# Projects, images and history live here; mount a volume to keep them.
RUN mkdir -p /data && chown -R bun:bun /data
VOLUME /data

# Non-root. Docker 20.10+ lets unprivileged users bind port 80 inside the
# container; set PORT to a high port if your runtime doesn't.
USER bun
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:' + (process.env.PORT || 80) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "server/main.ts"]

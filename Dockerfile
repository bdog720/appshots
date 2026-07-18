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

# ---------- Runtime stage: serve the static bundle with nginx ----------
FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="appshots" \
      org.opencontainers.image.description="App Store / Play Store screenshot generator" \
      org.opencontainers.image.source="https://github.com/bdog720/appshots"

# SPA-aware nginx config (client-side routing + asset caching).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Ship only the built assets — no Node/Bun or source in the final image.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Simple liveness check so `docker ps` / compose report real health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]

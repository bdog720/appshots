# Design: Container storage for projects

**Date:** 2026-09-15
**Status:** Approved (pending spec review)

## Problem

AppShots is a single-user, self-hosted app (Docker Compose, Dockge, Portainer,
GHCR image), but every project lives in one browser `localStorage` blob:

- The browser allows roughly 5 MB per site, and images are stored inside that
  blob as base64. A handful of full-size screenshots fills it — agent import
  makes this likely.
- `savePersistedState` (`src/lib/useLocalStorage.ts`) only logs quota errors to
  the console, so the editor keeps working while nothing is saved.
- Projects are tied to one browser on one machine, and clearing site data
  deletes them.
- The container runs nginx serving static files, so it has nowhere to write.

## Goals

- Projects and images are stored in the container on a mounted volume, with no
  browser size limit, visible from any browser that can reach the container.
- Browser storage keeps working as a fallback for `bun run dev` and static
  hosting.
- Existing browser projects move into the container on first use.
- Saving is visible: a clear **Unsaved changes / Saving… / Saved / Couldn't
  save** indicator, autosave, and **Save now** (⌘S).
- Conflicting saves from another tab or device are detected, never silently
  overwritten.
- Simple version history per project, with restore.
- Optional password for exposed deployments.
- Existing Docker stacks (host port → container port 80) keep working after an
  image update.

## Non-goals

- Live sync between tabs/devices, multiple users or accounts, cloud sync.
- Version history in browser mode.
- Image downscaling or re-encoding.
- The plain-HTTP clipboard fallback for **Copy agent prompt** (separate fix).
- The upstream feature-PR series (queued separately).
- Any change to the preview/export rendering pipelines.

## Decisions

| Topic | Decision |
|-------|----------|
| Run modes | Container storage when `/api/health` says so; otherwise browser storage |
| Server | One Bun process replaces nginx: serves `dist/` and the API on one port |
| Layout | One JSON file per project with a revision; images stored once as content-hashed files referenced by URL |
| Access | No auth by default; HTTP Basic auth when `APPSHOTS_PASSWORD` is set |
| Concurrency | Per-project revision; stale save → `409` → conflict banner |
| History | Container mode only; coalesced snapshots with retention and pins |

## Architecture

```
Browser ──► Bun server (server/main.ts)
             ├─ static:  dist/  (SPA fallback, asset caching)
             └─ /api/*:  handlers (server/api.ts) ──► FileStore (server/store.ts) ──► /data

App ──► resolveStorage() ──► ProjectStorage
                              ├─ BrowserStorage (localStorage blob, as today)
                              └─ ServerStorage  (fetch /api/*)
```

## Server (`server/`)

The request handling is plain functions — `handleRequest(request, deps)` over a
`FileStore` — so it is unit-tested with Vitest against a temp directory.
`server/main.ts` is a thin `Bun.serve` wrapper. The server has no npm
dependencies.

### Data directory (`APPSHOTS_DATA_DIR`, default `/data`)

```
/data
  state.json                               { activeProjectId, projectOrder }
  projects/<id>.json                       { revision, savedAt, project }
  projects/<id>/history/<savedAt>-<revision>.json
                                           { revision, savedAt, pinned, label?, project }
  images/<sha256>.<png|jpg|webp>
```

- Image fields in stored projects (`devices[].screenshotSrc`,
  `overlayImages[].src`) hold `/api/images/<sha256>.<ext>`.
- Every write goes to a temp file in the same directory and is renamed into
  place, so a crash never leaves a half-written file.
- Project ids must match `^[A-Za-z0-9_-]{1,64}$`; history version names must
  match `^\d{13}-\d+$`; image names must match `^[a-f0-9]{64}\.(png|jpg|webp)$`.
  Anything else is `400`.
- At startup the server checks the data directory is writable. If not, it logs
  a clear error (including the `bun` user's UID) and reports
  `writable: false`.

### API

All responses are JSON (`{ error }` on failure) except image bytes.

| Method & path | Behavior |
|---------------|----------|
| `GET /api/health` | `{ storage: "server", writable, auth }`. Never requires the password. |
| `GET /api/state` | `{ activeProjectId, projectOrder, projects: [{ id, revision, savedAt }] }` |
| `PUT /api/state` | Body `{ activeProjectId, projectOrder }`. Last write wins. |
| `GET /api/projects/:id` | `{ revision, savedAt, project }`, `ETag: "<revision>"`. `404` if missing. |
| `PUT /api/projects/:id` | Body `{ project, pin?: boolean, pinPrevious?: boolean, label?: string }`. Header `If-Match: "<revision>"` to update; `If-None-Match: *` to create. Mismatch → `409 { revision, savedAt }`. Success → `{ revision, savedAt }` (revision + 1, starting at 1). |
| `DELETE /api/projects/:id` | Deletes the project and its history, removes it from `projectOrder`, then runs image cleanup. |
| `POST /api/images` | Raw bytes. Type is detected from magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `RIFF….WEBP`); anything else `415`. Over 25 MB `413`. Server computes SHA-256, writes the file if absent, returns `{ url }`. |
| `GET /api/images/:file` | Image bytes, `Cache-Control: public, max-age=31536000, immutable`. |
| `GET /api/projects/:id/history` | Newest first: `[{ version, revision, savedAt, pinned, label?, screenCount, firstHeadline }]` (`firstHeadline` is plain text, max 80 chars). |
| `POST /api/projects/:id/history` | Body `{ project, label }`. Adds a pinned history entry without changing the current project (used by **Load their version** to keep the discarded local copy). |
| `POST /api/projects/:id/history/:version/restore` | Pins the current content (label "Before restore"), writes the chosen version as current with revision + 1, returns `{ revision, savedAt, project }`. |

Request body limits: 25 MB for images, 5 MB for JSON bodies (`413` beyond).

### Authentication

When `APPSHOTS_PASSWORD` is set, every request except `GET /api/health` needs
HTTP Basic auth (any username; password compared in constant time). Missing or
wrong credentials → `401` with `WWW-Authenticate: Basic realm="AppShots"`, which
gives the browser's native login prompt. Same-origin `fetch` and `<img>`
requests reuse the browser's cached credentials.

### Version history

Rules live in a pure module (`server/history.ts`) and are unit-tested.

- **When a version is written** (on a successful `PUT /api/projects/:id`):
  - `pin: true` (Save now / ⌘S) → write the new content as a pinned version.
  - otherwise, if the newest version is older than **10 minutes** (or none
    exists) → write the new content as an unpinned version.
  - `pinPrevious: true` → before overwriting, write the existing current content
    as a pinned version (used by **Replace current project** and **Keep mine**).
- **Retention** (applied after every history write): keep the union of
  - the 20 newest versions,
  - the newest version for each of the last 7 calendar days (server local time),
  - the 10 newest pinned versions.
  Everything else is deleted.
- Project deletion deletes its history.

### Image cleanup

Runs after project deletion and after history pruning: collect every image name
referenced by `projects/*.json` and every history file; delete image files that
are unreferenced **and** older than 1 hour. The grace period protects images
uploaded for a save that hasn't landed yet.

### Static serving

Mirrors `nginx.conf`: `/assets/*` with `Cache-Control: public, immutable`,
`/index.html` with `no-cache`, and any other non-API path that isn't a file
falls back to `index.html`.

## App

### Storage interface (`src/lib/storage/`)

```ts
interface ProjectStorage {
  mode: "server" | "browser";
  load(): Promise<{ projects: Project[]; activeProjectId: string | null }>;
  saveProject(project: Project, options?: { pin?: boolean; pinPrevious?: boolean; label?: string }): Promise<SaveResult>;
  deleteProject(id: string): Promise<void>;
  saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void>;
  resetAll(): Promise<void>;
}
type SaveResult = { ok: true } | { ok: false; conflict: { revision: number; savedAt: number } };
```

- **BrowserStorage** wraps today's blob logic. `saveProject`/`deleteProject`/
  `saveMeta` update an in-memory copy and write the whole blob; a quota error
  rejects (so the indicator shows **Couldn't save**) instead of only logging.
- **ServerStorage** calls the API, remembers each project's revision, and sends
  `If-Match` / `If-None-Match`. It also provides `listHistory`, `addHistory` and
  `restoreVersion` for the history panel.

### Startup (`src/routes/index.tsx`)

1. `resolveStorage()` calls `GET /api/health` with a 2-second timeout.
   - `storage: "server"`, `writable: true` → `ServerStorage`.
   - `storage: "server"`, `writable: false` → `BrowserStorage` plus a banner:
     "Container storage isn't writable — saving to this browser instead."
   - Error / timeout / anything else → `BrowserStorage`.
2. Run migration (below) if applicable, then `storage.load()`, showing a
   "Loading projects…" screen.
3. Render `EditorProvider` with `initialState` and `storage` props. The
   module-scope `loadPersistedState()` in `EditorContext.tsx` and
   `getInitialProjects` / `getInitialActiveProjectId` read from these props;
   loaded projects still pass through `normalizeProject`.

### Saving (`useProjectPersistence`, replaces `useEditorPersistence`)

- Debounced **1 second** after changes, as today.
- Compares each project with the last saved copy (object identity per id) and
  saves only changed projects; deletes removed ones; saves meta when the active
  id or order changed.
- **Images (container mode):** before `saveProject`, any `data:` URL in
  `devices[].screenshotSrc` or `overlayImages[].src` is uploaded via
  `POST /api/images` and replaced with the returned URL **in the saved copy
  only**. A `Map<dataUrl, url>` cache prevents re-uploads. Editor state and undo
  history are not modified; after a reload projects arrive with URLs.
- **Save now / ⌘S:** flushes immediately and sends `pin: true` for the active
  project (container mode). `useKeyboardShortcuts` gains a `save` action that
  prevents the browser's save dialog.
- **Leaving the page:** if a save is pending or in flight, `beforeunload` asks
  the browser's "Leave site?" prompt. Browser mode still writes synchronously on
  unload; container mode attempts a `fetch(…, { keepalive: true })` for the
  active project when its body is under 60 KB.

### Save indicator

Shown next to the project switcher in the left sidebar, in both modes:

| State | Display |
|-------|---------|
| Dirty | Amber dot · **Unsaved changes** |
| Saving | **Saving…** |
| Saved | **Saved · just now** (relative time) |
| Error | Red · **Couldn't save** · **Retry** |
| Conflict | Red · **Changed elsewhere** (banner shown) |

A **Save now** button sits beside it. In container mode a **History** button
opens the history panel.

### Conflicts

A `409` on save shows a banner on the project:

- **Load their version** — adds the local copy to history (pinned, label
  "Discarded local changes"), reloads the server version into the editor, and
  resets undo for that project.
- **Keep mine** — re-saves with `If-Match` set to the server's revision and
  `pinPrevious: true`, so their version is kept in history.

### Migration (container mode, first run)

If the server has no projects **and** the browser blob has projects **and** the
`appshots-migrated-to-server` localStorage flag is absent: upload each project
(images externalized) with `If-None-Match: *`, save meta, set the flag
(timestamp), and show "Moved N projects from this browser into the container."
The browser blob is not deleted. If the server already has projects, browser
projects are left untouched.

### History panel (container mode)

A side panel listing versions ("Today 3:42 pm · 9 screens · 'Build habits that
stick'", pin icon for pinned, label if present). **Restore** asks "Replace
current content with this version? Your current state is saved to history
first.", calls restore, loads the returned project into the editor, and resets
undo for that project.

### Other changes

- **Export Project** (`.appshots.json`): `/api/images/…` URLs are fetched and
  embedded as data URLs so backups stay self-contained.
- **Import Project:** unchanged — data URLs are externalized on the next save.
- **Agent import:** the storage-budget warning applies only in browser mode
  (`existingStorageChars: null` skips it). **Replace current project** saves
  with `pinPrevious: true` in container mode.
- **resetEditor:** calls `storage.resetAll()`; in container mode it first
  confirms "Delete all projects and history in the container?".

## Deployment

- **Dockerfile:** build stage unchanged. Runtime stage `oven/bun:1-alpine`,
  copying `dist/` and `server/` only. `ENV APPSHOTS_DATA_DIR=/data PORT=80`,
  `VOLUME /data`, `/data` owned by the `bun` user, `USER bun`,
  `EXPOSE 80`, `CMD ["bun", "server/main.ts"]`. Health check:
  `bun -e "fetch('http://localhost/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
- **Port:** stays 80 so existing `8080:80` stacks keep working; `PORT` overrides
  it for runtimes that don't allow non-root binding of low ports.
- **docker-compose.yml:** adds named volume `appshots-data:/data` and a
  commented `APPSHOTS_PASSWORD` line.
- **GHCR workflow:** unchanged.
- **Local development:** `bun run dev:server` (watch mode, `PORT=3000`,
  `APPSHOTS_DATA_DIR=./.appshots-data`, git-ignored); Vite `server.proxy` sends
  `/api` to `http://localhost:3000`. Plain `bun run dev` uses browser storage.
- **Types:** add `@types/bun` as a dev dependency; server files are type-checked
  by `tsc` (see Risks for the `types` setting).

## Docs

- **README** Docker sections: named volume for compose, `-v` for `docker run`,
  volume in the Dockge snippet; optional password and the "LAN or behind your
  proxy's auth only" warning when unset; backup (copy the volume or Export
  Project); upgrade note (first open moves browser projects into the container);
  corrected description of the image contents.
- **CLAUDE.md:** replace "no backend" with the two storage modes, the
  `src/lib/storage/` layer, `server/`, `bun run dev:server`, and the rule that
  persistence goes through `ProjectStorage`.

## Testing

TDD with Vitest.

- **Server** (`@vitest-environment node`, temp directories): id / version /
  image-name validation; create with `If-None-Match`, update with `If-Match`,
  `409` on mismatch; atomic writes; magic-byte detection, `415`/`413`, identical
  uploads stored once; history write rules (10-minute coalescing, `pin`,
  `pinPrevious`), retention (20 newest + daily for 7 days + 10 pins), restore
  pins current first; image cleanup keeps images referenced by projects or
  history and respects the 1-hour grace; Basic auth on/off with `/api/health`
  always open; static serving and SPA fallback; unwritable data directory
  reported by health.
- **App:** `resolveStorage` for healthy / unwritable / unreachable; both storage
  implementations (`fetch` mocked for server); changed-project detection; data
  URL upload + cache; migration rules (empty server only, flag, browser copy
  kept); save indicator states and Save now / ⌘S; conflict banner actions;
  history panel restore confirm; Export Project embeds server images; agent
  import storage warning browser-only; resetAll confirmation.
- **End to end:** `docker compose up --build`, then: migrate browser projects,
  reload persistence, conflict between two browser windows, history restore,
  password prompt, data survives `docker compose down && up`, upgrade of an
  existing `8080:80` stack from the old image.
- **Gates:** `bun run test`, `bun run build`.

## Risks / open items for planning

- **Non-root on port 80:** relies on Docker 20.10+ allowing unprivileged low
  ports inside the container; `PORT` is the escape hatch. Verify with the
  published image before merge.
- **`tsconfig.json` `types: ["vite/client"]`:** server files need Bun types —
  either a `/// <reference types="bun" />` in server entry points or a separate
  `server/tsconfig.json` included by the build's `tsc`. Pick during planning.
- **`keepalive` body limit (~64 KB):** unload saves in container mode are best
  effort; the "Leave site?" prompt is the real protection.
- **Bind mounts:** a host directory not writable by the `bun` user yields the
  unwritable banner; README documents the UID and the named-volume default.
- **Large migrations:** many images upload sequentially on first run; the
  loading screen shows "Moving projects…" with a count.
- **Memory:** the data-URL upload cache holds references to strings already in
  editor state; it is cleared on project switch/reload.

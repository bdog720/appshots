# Container Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store AppShots projects, images and version history in the Docker container (with a browser-storage fallback), show clear save status, detect conflicting saves, and let users restore earlier versions.

**Architecture:** A dependency-free Bun server (`server/`) replaces nginx: `handleRequest(request, config)` routes `/api/*` to a `FileStore` over the data directory (atomic writes, per-project revisions, content-hashed images, history with retention) and serves `dist/`. The app resolves a `ProjectStorage` at startup (`ServerStorage` when `/api/health` reports writable server storage, else `BrowserStorage`), passes it into `EditorProvider`, and saves through a pure save planner plus a `useProjectPersistence` hook that owns the save status, Save now, and conflict state.

**Tech Stack:** React 19 + TypeScript + Vite (Bun); Vitest (default env jsdom; server tests use node env) + Testing Library; Bun 1.3 runtime (`Bun.serve` only in `server/main.ts`); Node built-ins (`node:fs/promises`, `node:path`, `node:crypto`) in server modules; Docker (`oven/bun:1-alpine`).

**Spec:** `docs/superpowers/specs/2026-09-15-container-storage-design.md`

## Global Constraints

- Branch: `design/container-storage` (created off `master` at `bf32551`; spec commit `dc2fc67`). Commit to this branch only; do not push.
- Gates before "done": `bun run test` and `bun run build` (after Task 1 the build runs `vite build && tsc && tsc -p server`).
- **No rendering changes:** do not edit `src/components/DeviceFrame/*`, `src/lib/export-utils.ts`, `src/lib/rich-text-canvas.ts`.
- **Persisted project shape unchanged:** no new fields on `Project`/`Screenshot`/`DeviceInstance`. In server storage, image fields hold `/api/images/<sha256>.<ext>` URLs; everything else is identical. Loaded projects still pass through `normalizeProject`.
- Server modules (`server/*.ts` except `main.ts`) use only Web APIs (`Request`, `Response`, `URL`) and `node:` built-ins — no npm dependencies, no `Bun.*` — so Vitest can test them. `server/main.ts` is the only file that uses `Bun.serve`.
- Server tests start with `/** @vitest-environment node */` and use fresh temp dirs from `fs.mkdtemp(path.join(os.tmpdir(), "appshots-"))`, removed in `afterEach`.
- Validation patterns (verbatim): project id `^[A-Za-z0-9_-]{1,64}$`; history version `^\d{13}-\d+$`; image file `^[a-f0-9]{64}\.(png|jpg|webp)$`.
- Limits: images 25 MB (`25 * 1024 * 1024`), JSON bodies 5 MB (`5 * 1024 * 1024`).
- History rules: auto snapshot when newest version is older than 10 minutes (`10 * 60 * 1000`) or none exists; retention keeps the union of 20 newest, newest per calendar day for the last 7 days (server local time), and 10 newest pinned. Image cleanup grace: 1 hour (`60 * 60 * 1000`).
- Env vars: `APPSHOTS_DATA_DIR` (default `/data`), `APPSHOTS_PASSWORD` (unset = no auth), `PORT` (default `80`), `APPSHOTS_DIST_DIR` (default `dist`).
- Client storage detection timeout: 2000 ms. Autosave debounce: 1000 ms. Keepalive unload save only when the JSON body is under 60 KB (`60 * 1024`).
- localStorage keys: editor state `app-screenshot-editor-state` (existing); migration flag `appshots-migrated-to-server`.
- jsdom facts: `File.prototype.text()`/`arrayBuffer()` don't exist in tests — don't use them on `File`. `Response#arrayBuffer()` from mocked `fetch` responses is fine.
- `tsc` type-checks tests. Avoid `new Blob([uint8Array])` in typed code (BlobPart generic mismatch) — pass `bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer`.
- Descriptions for any PR use the `natural-writing` skill (short, plain). No PR is opened by this plan.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG
  ```

## Rulings made while planning

- **`resetEditor` confirmation:** `resetEditor` has no UI caller today (only exposed on the context), so no confirmation dialog is built; it calls `storage.resetAll()`. If a reset button is added later it must confirm in server mode.
- **Server type-checking:** root `tsconfig.json` excludes `server/`; `server/tsconfig.json` (types `["bun"]`) is checked by `tsc -p server` in the build. Avoids Bun/DOM global type clashes in the app config.
- **Static serving** is implemented in `server/api.ts` with `node:fs` (not `Bun.file`) so it is unit-tested.
- **Replace current project in container mode:** the spec says the replacing save uses `pinPrevious`. Autosave has no per-save options, so `applyAgentImport("replace")` calls `saveNow()` before changing state, which pins the current content (label "Saved"). The previous version is kept either way; only the history label differs.
- **Migration normalizes projects** before uploading (older saved projects can lack `devices`, which image mapping needs); the context passes `normalizeProject`.

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `server/tsconfig.json` | create | Type-check server with Bun types |
| `tsconfig.json`, `package.json`, `.gitignore`, `vite.config.ts` | modify | Exclude server from app tsc; build/dev scripts; ignore dev data; `/api` proxy |
| `server/validation.ts` | create | Id/name patterns, limits, image magic-byte detection |
| `server/history.ts` | create | Pure history rules: snapshot decision, retention, summaries, image references |
| `server/store.ts` | create | `FileStore`: state, projects (revisions), images, history, garbage collection, atomic writes |
| `server/api.ts` | create | `handleRequest`: routing, auth, limits, JSON, static `dist/` serving |
| `server/main.ts` | create | `Bun.serve` entry: env config, store init |
| `Dockerfile`, `docker-compose.yml` | modify | Bun runtime, non-root, volume, health check |
| `nginx.conf` | delete | Replaced by the Bun server |
| `src/lib/storage/types.ts` | create | `ProjectStorage`, `ServerProjectStorage`, result/option types |
| `src/lib/storage/browser-storage.ts` | create | localStorage-backed `ProjectStorage` (throws on quota) |
| `src/lib/storage/images.ts` | create | data URL ⇄ bytes, `externalizeImages`, `inlineImages` |
| `src/lib/storage/server-storage.ts` | create | API client `ServerStorage` (revisions, uploads, history) |
| `src/lib/storage/resolve-storage.ts` | create | `/api/health` detection → storage + notice |
| `src/lib/storage/migrate.ts` | create | One-time browser → server migration |
| `src/lib/storage/save-plan.ts` | create | Pure diff: which projects to save/delete, meta changed |
| `src/lib/storage/useProjectPersistence.ts` | create | Debounced saving, status, Save now, conflicts, unload guard |
| `src/lib/storage/memory-storage.ts`, `src/lib/storage/fake-server.ts` | create | Test helpers: in-memory `Storage` with quota; in-memory storage API double |
| `src/context/bootstrap-editor.ts` | create | Startup: resolve storage, migrate, load, prepare initial state |
| `src/components/Storage/StartupScreen.tsx` | create | Loading / load-failed screen with Try again |
| `src/lib/useLocalStorage.ts` | modify | Export storage key; remove `useEditorPersistence` (moved) |
| `src/context/EditorContext.tsx` | modify | Props `initialState`/`storage`; persistence hook; conflict/history/export wiring |
| `src/routes/index.tsx` | modify | Async bootstrap: resolve storage, migrate, load, loading screen |
| `src/lib/keyboard-shortcuts.ts` | modify | `save` action (⌘/Ctrl+S) |
| `src/components/Storage/SaveIndicator.tsx` | create | Unsaved / Saving / Saved / Couldn't save + Save now + History button |
| `src/components/Storage/StorageBanners.tsx` | create | Unwritable, migrated, conflict banners |
| `src/components/Storage/HistoryPanel.tsx` | create | Version list + restore confirm |
| `src/components/LeftSidebar/LeftSidebar.tsx`, `src/components/EditorLayout.tsx`, `src/components/ShortcutsModal.tsx` | modify | Mount indicator/banners/panel; ⌘S wiring; shortcut list |
| `src/components/AgentImport/AgentImportModal.tsx`, `src/lib/agent-import/pipeline.ts` | modify | Storage warning browser-only |
| `README.md`, `CLAUDE.md` | modify | Docker volume/password/backup docs; storage architecture notes |

---

### Task 1: Server tooling + validation

**Files:**
- Create: `server/tsconfig.json`, `server/validation.ts`
- Modify: `tsconfig.json`, `package.json`, `.gitignore`
- Test: `server/validation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`server/validation.ts`):
  - `MAX_IMAGE_BYTES = 25 * 1024 * 1024`, `MAX_JSON_BYTES = 5 * 1024 * 1024`
  - `isValidProjectId(id: string): boolean`, `isValidVersion(version: string): boolean`, `isValidImageName(name: string): boolean`
  - `type ImageExt = "png" | "jpg" | "webp"`
  - `IMAGE_CONTENT_TYPES: Record<ImageExt, string>`
  - `detectImageType(bytes: Uint8Array): ImageExt | null`

- [ ] **Step 1: Add Bun types and separate server type-checking**

Run: `bun add -d @types/bun`
Expected: `package.json` `devDependencies` gains `"@types/bun"`; `bun.lock` updated.

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["bun"],
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["**/*.ts"]
}
```

In root `tsconfig.json`, add after the `"include"` line:

```json
  "exclude": ["server", "node_modules", "dist"],
```

In `package.json` `scripts`, change `"build"` to `"bun --bun vite build && tsc && tsc -p server"` and add `"dev:server": "PORT=3000 APPSHOTS_DATA_DIR=./.appshots-data APPSHOTS_DIST_DIR=./dist bun --watch server/main.ts"`.

Append to `.gitignore`:

```
.appshots-data
```

- [ ] **Step 2: Write the failing test**

Create `server/validation.test.ts`:

```ts
/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_JSON_BYTES,
  detectImageType,
  isValidImageName,
  isValidProjectId,
  isValidVersion,
} from "./validation";

describe("validation", () => {
  it("accepts only safe project ids", () => {
    expect(isValidProjectId("k3x9a1")).toBe(true);
    expect(isValidProjectId("A_b-9")).toBe(true);
    expect(isValidProjectId("")).toBe(false);
    expect(isValidProjectId("../etc")).toBe(false);
    expect(isValidProjectId("a/b")).toBe(false);
    expect(isValidProjectId("x".repeat(65))).toBe(false);
  });

  it("accepts history version names", () => {
    expect(isValidVersion("1757900000000-7")).toBe(true);
    expect(isValidVersion("175790000000-7")).toBe(false);
    expect(isValidVersion("1757900000000-")).toBe(false);
    expect(isValidVersion("../1757900000000-7")).toBe(false);
  });

  it("accepts content-hashed image names", () => {
    const hash = "a".repeat(64);
    expect(isValidImageName(`${hash}.png`)).toBe(true);
    expect(isValidImageName(`${hash}.jpg`)).toBe(true);
    expect(isValidImageName(`${hash}.webp`)).toBe(true);
    expect(isValidImageName(`${hash}.gif`)).toBe(false);
    expect(isValidImageName(`${"A".repeat(64)}.png`)).toBe(false);
    expect(isValidImageName("../x.png")).toBe(false);
  });

  it("detects image types from magic bytes", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(detectImageType(webp)).toBe("webp");
    expect(detectImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(detectImageType(new Uint8Array([0x89]))).toBeNull();
  });

  it("exposes the limits", () => {
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_JSON_BYTES).toBe(5 * 1024 * 1024);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run server/validation.test.ts`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 4: Implement `server/validation.ts`**

```ts
/** Input validation shared by the storage server. Pure; no I/O. */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_JSON_BYTES = 5 * 1024 * 1024;

const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^\d{13}-\d+$/;
const IMAGE_NAME = /^[a-f0-9]{64}\.(png|jpg|webp)$/;

export const isValidProjectId = (id: string): boolean => PROJECT_ID.test(id);
export const isValidVersion = (version: string): boolean => VERSION.test(version);
export const isValidImageName = (name: string): boolean => IMAGE_NAME.test(name);

export type ImageExt = "png" | "jpg" | "webp";

export const IMAGE_CONTENT_TYPES: Record<ImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

export const detectImageType = (bytes: Uint8Array): ImageExt | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
};
```

- [ ] **Step 5: Run tests and both type-checks**

Run: `bunx vitest run server/validation.test.ts && bunx tsc --noEmit && bunx tsc -p server`
Expected: PASS (5 tests); both tsc runs exit 0. If `tsc -p server` reports conflicts from `@types/bun`, report them — do not add `skipLibCheck: false` workarounds or DOM libs.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock tsconfig.json .gitignore server/tsconfig.json server/validation.ts server/validation.test.ts
git commit -m "Add server type-checking and storage validation helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 2: Pure history rules

**Files:**
- Create: `server/history.ts`
- Test: `server/history.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`server/history.ts`):
  - `SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000`, `RECENT_VERSIONS_KEPT = 20`, `DAILY_VERSIONS_DAYS = 7`, `PINNED_VERSIONS_KEPT = 10`
  - `interface VersionMeta { version: string; savedAt: number; pinned: boolean }`
  - `versionName(savedAt: number, revision: number): string` → `"<savedAt>-<revision>"`
  - `shouldAutoSnapshot(newestSavedAt: number | null, now: number): boolean`
  - `selectVersionsToKeep(versions: VersionMeta[], now: number): Set<string>`
  - `interface ProjectSummary { screenCount: number; firstHeadline: string }`
  - `summarizeProject(project: unknown): ProjectSummary`
  - `collectImageNames(value: unknown, into?: Set<string>): Set<string>` — names referenced as `/api/images/<name>`

- [ ] **Step 1: Write the failing test**

Create `server/history.test.ts`:

```ts
/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  collectImageNames,
  selectVersionsToKeep,
  shouldAutoSnapshot,
  summarizeProject,
  versionName,
  type VersionMeta,
} from "./history";

const MINUTE = 60 * 1000;
// Local-time dates so "calendar day" tests don't depend on the machine's timezone.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).getTime();
const NOW = at(15, 12);

const meta = (savedAt: number, revision: number, pinned = false): VersionMeta => ({
  version: versionName(savedAt, revision),
  savedAt,
  pinned,
});

describe("versionName", () => {
  it("joins savedAt and revision", () => {
    expect(versionName(1757900000000, 7)).toBe("1757900000000-7");
  });
});

describe("shouldAutoSnapshot", () => {
  it("snapshots when there is no history or the newest version is over 10 minutes old", () => {
    expect(shouldAutoSnapshot(null, NOW)).toBe(true);
    expect(shouldAutoSnapshot(NOW - 11 * MINUTE, NOW)).toBe(true);
    expect(shouldAutoSnapshot(NOW - 10 * MINUTE, NOW)).toBe(false);
    expect(shouldAutoSnapshot(NOW - 9 * MINUTE, NOW)).toBe(false);
  });
});

describe("selectVersionsToKeep", () => {
  it("keeps the 20 newest versions", () => {
    const versions = Array.from({ length: 30 }, (_, i) => meta(NOW - i * MINUTE, 30 - i));
    const keep = selectVersionsToKeep(versions, NOW);
    expect(keep.size).toBe(20);
    expect(keep.has(versions[0].version)).toBe(true);
    expect(keep.has(versions[19].version)).toBe(true);
    expect(keep.has(versions[20].version)).toBe(false);
  });

  it("also keeps the newest version from each of the last 7 calendar days", () => {
    const today = Array.from({ length: 25 }, (_, i) => meta(NOW - i * MINUTE, 100 - i));
    const olderDays = Array.from({ length: 9 }, (_, i) => [
      meta(at(14 - i, 18), 50 - i * 2), // newest on that day
      meta(at(14 - i, 9), 49 - i * 2), // older on that day
    ]).flat();
    const keep = selectVersionsToKeep([...today, ...olderDays], NOW);

    // 20 newest from today + newest of days 14..9 (6 days; today already covered)
    expect(keep.size).toBe(26);
    expect(keep.has(meta(at(14, 18), 50).version)).toBe(true);
    expect(keep.has(meta(at(9, 18), 40).version)).toBe(true);
    expect(keep.has(meta(at(14, 9), 49).version)).toBe(false);
    expect(keep.has(meta(at(8, 18), 38).version)).toBe(false);
  });

  it("keeps the 10 newest pinned versions regardless of age", () => {
    const recent = Array.from({ length: 20 }, (_, i) => meta(NOW - i * MINUTE, 200 - i));
    const pinned = Array.from({ length: 15 }, (_, i) => meta(at(1, 10, i), 100 - i, true));
    const keep = selectVersionsToKeep([...recent, ...pinned], NOW);
    expect(keep.size).toBe(30);
    const pinnedNewestFirst = [...pinned].sort((a, b) => b.savedAt - a.savedAt);
    expect(keep.has(pinnedNewestFirst[9].version)).toBe(true);
    expect(keep.has(pinnedNewestFirst[10].version)).toBe(false);
  });
});

describe("summarizeProject", () => {
  it("counts screens and returns the first headline as plain text", () => {
    expect(
      summarizeProject({
        screenshots: [
          { headline: "Build habits <mark style=\"background-color: rgb(1,2,3)\">that stick</mark><br>today &amp; forever" },
          { headline: "Second" },
        ],
      }),
    ).toEqual({ screenCount: 2, firstHeadline: "Build habits that stick today & forever" });
  });

  it("truncates to 80 characters and tolerates bad shapes", () => {
    expect(summarizeProject({ screenshots: [{ headline: "x".repeat(100) }] }).firstHeadline).toHaveLength(80);
    expect(summarizeProject(null)).toEqual({ screenCount: 0, firstHeadline: "" });
    expect(summarizeProject({ screenshots: "nope" })).toEqual({ screenCount: 0, firstHeadline: "" });
  });
});

describe("collectImageNames", () => {
  it("finds image names referenced anywhere in a project", () => {
    const a = `${"a".repeat(64)}.png`;
    const b = `${"b".repeat(64)}.webp`;
    const names = collectImageNames({
      screenshots: [
        { devices: [{ screenshotSrc: `/api/images/${a}` }, { screenshotSrc: null }] },
        { overlayImages: [{ src: `/api/images/${b}` }, { src: "data:image/png;base64,AAA" }] },
      ],
    });
    expect([...names].sort()).toEqual([a, b].sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run server/history.test.ts`
Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 3: Implement `server/history.ts`**

```ts
/**
 * Version-history rules for the storage server. Pure: callers pass in the
 * clock and the list of versions; nothing here touches the filesystem.
 */

export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
export const RECENT_VERSIONS_KEPT = 20;
export const DAILY_VERSIONS_DAYS = 7;
export const PINNED_VERSIONS_KEPT = 10;

export interface VersionMeta {
  version: string;
  savedAt: number;
  pinned: boolean;
}

export const versionName = (savedAt: number, revision: number): string =>
  `${savedAt}-${revision}`;

export const shouldAutoSnapshot = (newestSavedAt: number | null, now: number): boolean =>
  newestSavedAt === null || now - newestSavedAt > SNAPSHOT_INTERVAL_MS;

const localDayKey = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export const selectVersionsToKeep = (versions: VersionMeta[], now: number): Set<string> => {
  const newestFirst = [...versions].sort((a, b) => b.savedAt - a.savedAt);
  const keep = new Set<string>();

  for (const version of newestFirst.slice(0, RECENT_VERSIONS_KEPT)) keep.add(version.version);

  const recentDays = new Set(
    Array.from({ length: DAILY_VERSIONS_DAYS }, (_, i) => {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      return localDayKey(day.getTime());
    }),
  );
  const coveredDays = new Set<string>();
  for (const version of newestFirst) {
    const day = localDayKey(version.savedAt);
    if (recentDays.has(day) && !coveredDays.has(day)) {
      coveredDays.add(day);
      keep.add(version.version);
    }
  }

  const pinned = newestFirst.filter((version) => version.pinned);
  for (const version of pinned.slice(0, PINNED_VERSIONS_KEPT)) keep.add(version.version);

  return keep;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export interface ProjectSummary {
  screenCount: number;
  firstHeadline: string;
}

const toPlainText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export const summarizeProject = (project: unknown): ProjectSummary => {
  const screenshots =
    isRecord(project) && Array.isArray(project.screenshots) ? project.screenshots : [];
  const first = screenshots[0];
  const headline = isRecord(first) && typeof first.headline === "string" ? first.headline : "";
  return { screenCount: screenshots.length, firstHeadline: toPlainText(headline).slice(0, 80) };
};

const IMAGE_URL = /\/api\/images\/([a-f0-9]{64}\.(?:png|jpg|webp))/g;

export const collectImageNames = (value: unknown, into: Set<string> = new Set()): Set<string> => {
  if (typeof value === "string") {
    for (const match of value.matchAll(IMAGE_URL)) into.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectImageNames(item, into);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) collectImageNames(item, into);
  }
  return into;
};
```

- [ ] **Step 4: Run tests and server type-check**

Run: `bunx vitest run server/history.test.ts && bunx tsc -p server`
Expected: PASS (8 tests); tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/history.ts server/history.test.ts
git commit -m "Add version history retention rules for the storage server

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 3: FileStore core — state, projects with revisions, images

**Files:**
- Create: `server/store.ts`
- Test: `server/store.test.ts`

**Interfaces:**
- Consumes: Task 1 `detectImageType`, `IMAGE_CONTENT_TYPES`, `isValidImageName`, `ImageExt`.
- Produces (`server/store.ts`; Task 4 adds history methods to the same class):
  - `interface AppState { activeProjectId: string | null; projectOrder: string[] }`
  - `interface ProjectListing { id: string; revision: number; savedAt: number }`
  - `interface StoredProject { revision: number; savedAt: number; project: unknown }`
  - `interface PutProjectOptions { expectedRevision: number; pin?: boolean; pinPrevious?: boolean; label?: string }` — `expectedRevision` is the revision the client last saw; `0` means "must not exist yet"
  - `type PutProjectResult = { ok: true; revision: number; savedAt: number } | { ok: false; current: { revision: number; savedAt: number } }` — `current` is `{ 0, 0 }` when the project doesn't exist
  - `class FileStore`:
    - `constructor(dataDir: string, now?: () => number)`
    - `init(): Promise<{ writable: boolean }>`
    - `getState(): Promise<AppState & { projects: ProjectListing[] }>`
    - `putState(state: AppState): Promise<void>`
    - `getProject(id: string): Promise<StoredProject | null>`
    - `putProject(id: string, project: unknown, options: PutProjectOptions): Promise<PutProjectResult>` (Task 3 ignores `pin`/`pinPrevious`/`label`; Task 4 implements them)
    - `deleteProject(id: string): Promise<boolean>`
    - `putImage(bytes: Uint8Array): Promise<string | null>` → image file name, or `null` for unsupported bytes
    - `readImage(name: string): Promise<{ bytes: Uint8Array; contentType: string } | null>`
  - `writeFileAtomic(target: string, data: string | Uint8Array): Promise<void>`

Callers validate ids with `isValidProjectId` before calling the store (the API does this in Task 5); the store assumes valid ids.

- [ ] **Step 1: Write the failing test**

Create `server/store.test.ts`:

```ts
/** @vitest-environment node */
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let dir: string;
let clock: number;
let store: FileStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "appshots-"));
  clock = new Date(2026, 8, 15, 8, 0).getTime();
  store = new FileStore(dir, () => clock);
  await store.init();
});

afterEach(async () => {
  await chmod(dir, 0o700).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

const listFilesRecursive = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true });
  return entries.map(String);
};

describe("FileStore init", () => {
  it("creates the data layout and reports writable", async () => {
    expect(await store.init()).toEqual({ writable: true });
    const entries = await readdir(dir);
    expect(entries).toEqual(expect.arrayContaining(["projects", "images"]));
  });

  it("reports an unwritable data directory", async () => {
    if (process.getuid?.() === 0) return; // root ignores permissions
    const locked = await mkdtemp(path.join(os.tmpdir(), "appshots-locked-"));
    await chmod(locked, 0o500);
    try {
      expect(await new FileStore(locked).init()).toEqual({ writable: false });
    } finally {
      await chmod(locked, 0o700);
      await rm(locked, { recursive: true, force: true });
    }
  });
});

describe("FileStore projects", () => {
  it("creates, reads and updates a project with revisions", async () => {
    expect(await store.putProject("p1", { name: "One" }, { expectedRevision: 0 })).toEqual({
      ok: true,
      revision: 1,
      savedAt: clock,
    });
    expect(await store.getProject("p1")).toEqual({ revision: 1, savedAt: clock, project: { name: "One" } });

    clock += 1000;
    expect(await store.putProject("p1", { name: "Two" }, { expectedRevision: 1 })).toEqual({
      ok: true,
      revision: 2,
      savedAt: clock,
    });
    expect((await store.getProject("p1"))?.project).toEqual({ name: "Two" });
  });

  it("rejects stale or conflicting writes with the current revision", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    const firstSavedAt = clock;
    expect(await store.putProject("p1", { v: 2 }, { expectedRevision: 0 })).toEqual({
      ok: false,
      current: { revision: 1, savedAt: firstSavedAt },
    });
    clock += 1000;
    await store.putProject("p1", { v: 2 }, { expectedRevision: 1 });
    expect(await store.putProject("p1", { v: 3 }, { expectedRevision: 1 })).toEqual({
      ok: false,
      current: { revision: 2, savedAt: clock },
    });
    expect(await store.putProject("missing", { v: 1 }, { expectedRevision: 4 })).toEqual({
      ok: false,
      current: { revision: 0, savedAt: 0 },
    });
  });

  it("returns null for a missing project", async () => {
    expect(await store.getProject("nope")).toBeNull();
  });

  it("leaves no temp files behind", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "p1", projectOrder: ["p1"] });
    await store.putImage(PNG);
    const files = await listFilesRecursive(dir);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("deletes a project and removes it from the order", async () => {
    await store.putProject("p1", { v: 1 }, { expectedRevision: 0 });
    await store.putProject("p2", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "p1", projectOrder: ["p1", "p2"] });
    expect(await store.deleteProject("p1")).toBe(true);
    expect(await store.getProject("p1")).toBeNull();
    const state = await store.getState();
    expect(state.projectOrder).toEqual(["p2"]);
    expect(state.activeProjectId).toBeNull();
    expect(await store.deleteProject("p1")).toBe(false);
  });
});

describe("FileStore state", () => {
  it("defaults to an empty state", async () => {
    expect(await store.getState()).toEqual({ activeProjectId: null, projectOrder: [], projects: [] });
  });

  it("lists projects in saved order, appending unknown ones by save time", async () => {
    await store.putProject("b", { v: 1 }, { expectedRevision: 0 });
    clock += 1000;
    await store.putProject("a", { v: 1 }, { expectedRevision: 0 });
    clock += 1000;
    await store.putProject("c", { v: 1 }, { expectedRevision: 0 });
    await store.putState({ activeProjectId: "c", projectOrder: ["c", "ghost"] });

    const state = await store.getState();
    expect(state.activeProjectId).toBe("c");
    expect(state.projectOrder).toEqual(["c", "b", "a"]);
    expect(state.projects.map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(state.projects[0]).toEqual({ id: "c", revision: 1, savedAt: clock });
  });
});

describe("FileStore images", () => {
  it("stores images once by content hash", async () => {
    const name = await store.putImage(PNG);
    expect(name).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(await store.putImage(PNG)).toBe(name);
    expect(await readdir(path.join(dir, "images"))).toEqual([name]);
  });

  it("rejects unsupported bytes", async () => {
    expect(await store.putImage(new TextEncoder().encode("<svg/>"))).toBeNull();
  });

  it("reads stored images and ignores invalid names", async () => {
    const name = (await store.putImage(PNG)) as string;
    const image = await store.readImage(name);
    expect(image?.contentType).toBe("image/png");
    expect(Array.from(image?.bytes ?? [])).toEqual(Array.from(PNG));
    expect(await store.readImage("../../etc/passwd")).toBeNull();
    expect(await store.readImage(`${"f".repeat(64)}.png`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run server/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement `server/store.ts`**

```ts
/**
 * FileStore — the container's project storage on disk.
 *
 *   <dataDir>/state.json               { activeProjectId, projectOrder }
 *   <dataDir>/projects/<id>.json        { revision, savedAt, project }
 *   <dataDir>/images/<sha256>.<ext>
 *
 * Every write goes to a temp file and is renamed into place. Writes to the same
 * project are serialized so a read-check-write can't interleave.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_CONTENT_TYPES, detectImageType, isValidImageName, type ImageExt } from "./validation";

export interface AppState {
  activeProjectId: string | null;
  projectOrder: string[];
}

export interface ProjectListing {
  id: string;
  revision: number;
  savedAt: number;
}

export interface StoredProject {
  revision: number;
  savedAt: number;
  project: unknown;
}

export interface PutProjectOptions {
  /** Revision the client last saw; 0 means the project must not exist yet. */
  expectedRevision: number;
  pin?: boolean;
  pinPrevious?: boolean;
  label?: string;
}

export type PutProjectResult =
  | { ok: true; revision: number; savedAt: number }
  | { ok: false; current: { revision: number; savedAt: number } };

export const writeFileAtomic = async (target: string, data: string | Uint8Array): Promise<void> => {
  const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
};

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export class FileStore {
  protected readonly projectsDir: string;
  protected readonly imagesDir: string;
  private readonly statePath: string;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    readonly dataDir: string,
    protected readonly now: () => number = Date.now,
  ) {
    this.projectsDir = path.join(dataDir, "projects");
    this.imagesDir = path.join(dataDir, "images");
    this.statePath = path.join(dataDir, "state.json");
  }

  async init(): Promise<{ writable: boolean }> {
    try {
      await mkdir(this.projectsDir, { recursive: true });
      await mkdir(this.imagesDir, { recursive: true });
      const probe = path.join(this.dataDir, `.write-test-${randomBytes(4).toString("hex")}`);
      await writeFile(probe, "ok");
      await rm(probe, { force: true });
      return { writable: true };
    } catch {
      return { writable: false };
    }
  }

  /** Run `task` after any in-flight task for the same key. */
  protected withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    this.locks.set(key, settled);
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return run;
  }

  protected projectPath(id: string): string {
    return path.join(this.projectsDir, `${id}.json`);
  }

  async getState(): Promise<AppState & { projects: ProjectListing[] }> {
    const saved = (await readJson<AppState>(this.statePath)) ?? { activeProjectId: null, projectOrder: [] };
    const files = (await readdir(this.projectsDir)).filter((file) => file.endsWith(".json"));
    const listings: ProjectListing[] = [];
    for (const file of files) {
      const stored = await readJson<StoredProject>(path.join(this.projectsDir, file));
      if (stored) listings.push({ id: file.slice(0, -".json".length), revision: stored.revision, savedAt: stored.savedAt });
    }
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    const ordered = saved.projectOrder.filter((id) => byId.has(id));
    const rest = listings
      .filter((listing) => !ordered.includes(listing.id))
      .sort((a, b) => a.savedAt - b.savedAt)
      .map((listing) => listing.id);
    const projectOrder = [...ordered, ...rest];
    return {
      activeProjectId: saved.activeProjectId && byId.has(saved.activeProjectId) ? saved.activeProjectId : null,
      projectOrder,
      projects: projectOrder.map((id) => byId.get(id) as ProjectListing),
    };
  }

  async putState(state: AppState): Promise<void> {
    await this.withLock("state", () =>
      writeFileAtomic(this.statePath, JSON.stringify({ activeProjectId: state.activeProjectId, projectOrder: state.projectOrder })),
    );
  }

  getProject(id: string): Promise<StoredProject | null> {
    return readJson<StoredProject>(this.projectPath(id));
  }

  putProject(id: string, project: unknown, options: PutProjectOptions): Promise<PutProjectResult> {
    return this.withLock(id, async () => {
      const current = await this.getProject(id);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== options.expectedRevision) {
        return { ok: false, current: { revision: currentRevision, savedAt: current?.savedAt ?? 0 } };
      }
      const next: StoredProject = { revision: currentRevision + 1, savedAt: this.now(), project };
      await writeFileAtomic(this.projectPath(id), JSON.stringify(next));
      await this.afterProjectWrite(id, current, next, options);
      return { ok: true, revision: next.revision, savedAt: next.savedAt };
    });
  }

  /** Hook for version history (Task 4). */
  protected async afterProjectWrite(
    _id: string,
    _previous: StoredProject | null,
    _next: StoredProject,
    _options: PutProjectOptions,
  ): Promise<void> {}

  async deleteProject(id: string): Promise<boolean> {
    const deleted = await this.withLock(id, async () => {
      const existing = await this.getProject(id);
      if (!existing) return false;
      await rm(this.projectPath(id), { force: true });
      await rm(path.join(this.projectsDir, id), { recursive: true, force: true });
      return true;
    });
    if (deleted) {
      const state = await this.getState();
      await this.putState({
        activeProjectId: state.activeProjectId,
        projectOrder: state.projectOrder.filter((projectId) => projectId !== id),
      });
    }
    return deleted;
  }

  async putImage(bytes: Uint8Array): Promise<string | null> {
    const ext = detectImageType(bytes);
    if (!ext) return null;
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
    const target = path.join(this.imagesDir, name);
    const exists = await stat(target).then(
      () => true,
      () => false,
    );
    if (!exists) await writeFileAtomic(target, bytes);
    return name;
  }

  async readImage(name: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!isValidImageName(name)) return null;
    try {
      const bytes = new Uint8Array(await readFile(path.join(this.imagesDir, name)));
      const ext = name.split(".").pop() as ImageExt;
      return { bytes, contentType: IMAGE_CONTENT_TYPES[ext] };
    } catch {
      return null;
    }
  }
}
```

Note: `deleteProject` recomputes state via `getState()` after the file is gone, so `activeProjectId` becomes `null` when the deleted project was active (the `getState` filter drops ids without files).

- [ ] **Step 4: Run tests and server type-check**

Run: `bunx vitest run server/store.test.ts && bunx tsc -p server`
Expected: PASS (12 tests); tsc exit 0. If `NodeJS.ErrnoException` isn't found under `types: ["bun"]`, replace the cast with `(error as { code?: string }).code` — do not add `@types/node` to `server/tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add server/store.ts server/store.test.ts
git commit -m "Add file-based project store with revisions and hashed images

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 4: FileStore history and image cleanup

**Files:**
- Modify: `server/store.ts`
- Test: `server/store-history.test.ts`

**Interfaces:**
- Consumes: Task 2 `shouldAutoSnapshot`, `selectVersionsToKeep`, `summarizeProject`, `collectImageNames`, `versionName`, `VersionMeta`, `ProjectSummary`; Task 3 `FileStore`, `StoredProject`, `PutProjectOptions`, `writeFileAtomic`.
- Produces (added to `server/store.ts`):
  - `IMAGE_GRACE_MS = 60 * 60 * 1000`, `PREVIOUS_VERSION_LABEL = "Before replace"`, `RESTORE_LABEL = "Before restore"`
  - `interface HistoryEntry { revision: number; savedAt: number; pinned: boolean; label?: string; project: unknown }`
  - `interface HistorySummary extends ProjectSummary { version: string; revision: number; savedAt: number; pinned: boolean; label?: string }`
  - `FileStore.listHistory(id: string): Promise<HistorySummary[] | null>` (newest first; `null` if the project doesn't exist)
  - `FileStore.addHistory(id: string, project: unknown, label: string): Promise<boolean>` (pinned entry; current project unchanged; `false` if the project doesn't exist)
  - `FileStore.restoreVersion(id: string, version: string): Promise<StoredProject | null>`
  - `FileStore.collectGarbage(): Promise<number>` (number of image files deleted)
  - `putProject` now writes history per the spec; `deleteProject` now removes history and runs `collectGarbage()`.

History lives at `projects/<id>/history/<savedAt>-<revision>.json` (Task 3's `deleteProject` already removes `projects/<id>/`).

- [ ] **Step 1: Write the failing test**

Create `server/store-history.test.ts`:

```ts
/** @vitest-environment node */
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore, IMAGE_GRACE_MS, PREVIOUS_VERSION_LABEL, RESTORE_LABEL } from "./store";

const MINUTE = 60 * 1000;
const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);
const projectWith = (headline: string, images: string[] = []) => ({
  screenshots: [{ headline, devices: images.map((name) => ({ screenshotSrc: `/api/images/${name}` })) }],
});

let dir: string;
let clock: number;
let store: FileStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "appshots-"));
  clock = new Date(2026, 8, 15, 8, 0).getTime();
  store = new FileStore(dir, () => clock);
  await store.init();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const save = async (id: string, headline: string, options: { pin?: boolean; pinPrevious?: boolean; label?: string } = {}) => {
  const current = await store.getProject(id);
  const result = await store.putProject(id, projectWith(headline), {
    expectedRevision: current?.revision ?? 0,
    ...options,
  });
  if (!result.ok) throw new Error("unexpected conflict");
  return result;
};

describe("history writes", () => {
  it("snapshots the first save and then at most every 10 minutes", async () => {
    await save("p", "v1");
    clock += MINUTE;
    await save("p", "v2");
    expect(await store.listHistory("p")).toHaveLength(1);

    clock += 11 * MINUTE;
    await save("p", "v3");
    const history = await store.listHistory("p");
    expect(history?.map((entry) => entry.firstHeadline)).toEqual(["v3", "v1"]);
    expect(history?.[0]).toMatchObject({ revision: 3, pinned: false, screenCount: 1, savedAt: clock });
    expect(history?.[0].version).toBe(`${clock}-3`);
  });

  it("pins Save now versions with their label even within 10 minutes", async () => {
    await save("p", "v1");
    clock += MINUTE;
    await save("p", "v2", { pin: true, label: "Saved" });
    const history = await store.listHistory("p");
    expect(history?.[0]).toMatchObject({ firstHeadline: "v2", pinned: true, label: "Saved" });
  });

  it("keeps the replaced version when pinPrevious is set", async () => {
    await save("p", "theirs");
    clock += MINUTE;
    await save("p", "mine", { pinPrevious: true });
    const history = await store.listHistory("p");
    expect(history?.find((entry) => entry.firstHeadline === "theirs")).toMatchObject({
      revision: 1,
      pinned: true,
      label: PREVIOUS_VERSION_LABEL,
    });
  });

  it("applies retention after writing", async () => {
    for (let i = 0; i < 25; i += 1) {
      await save("p", `v${i}`);
      clock += 11 * MINUTE;
    }
    expect(await store.listHistory("p")).toHaveLength(20);
  });

  it("returns null history for a missing project", async () => {
    expect(await store.listHistory("missing")).toBeNull();
  });
});

describe("addHistory and restoreVersion", () => {
  it("adds a pinned entry without changing the current project", async () => {
    await save("p", "server copy");
    clock += MINUTE;
    expect(await store.addHistory("p", projectWith("local copy"), "Discarded local changes")).toBe(true);
    expect((await store.getProject("p"))?.revision).toBe(1);
    expect((await store.listHistory("p"))?.[0]).toMatchObject({
      firstHeadline: "local copy",
      pinned: true,
      label: "Discarded local changes",
    });
    expect(await store.addHistory("missing", projectWith("x"), "label")).toBe(false);
  });

  it("restores a version after pinning the current content", async () => {
    await save("p", "old");
    const [oldVersion] = (await store.listHistory("p")) ?? [];
    clock += 11 * MINUTE;
    await save("p", "new");
    clock += MINUTE;

    const restored = await store.restoreVersion("p", oldVersion.version);
    expect(restored).toEqual({ revision: 3, savedAt: clock, project: projectWith("old") });
    expect(await store.getProject("p")).toEqual(restored);
    expect((await store.listHistory("p"))?.find((entry) => entry.label === RESTORE_LABEL)).toMatchObject({
      firstHeadline: "new",
      revision: 2,
      pinned: true,
    });
  });

  it("returns null when the project or version doesn't exist", async () => {
    await save("p", "v1");
    expect(await store.restoreVersion("p", `${clock}-99`)).toBeNull();
    expect(await store.restoreVersion("missing", `${clock}-1`)).toBeNull();
  });
});

describe("deletion and image cleanup", () => {
  it("removes history when a project is deleted", async () => {
    await save("p", "v1");
    await store.deleteProject("p");
    expect(await readdir(path.join(dir, "projects"))).toEqual([]);
  });

  it("deletes only old images that nothing references", async () => {
    const inProject = (await store.putImage(png(1))) as string;
    const inHistoryOnly = (await store.putImage(png(2))) as string;
    const unreferencedOld = (await store.putImage(png(3))) as string;
    const unreferencedNew = (await store.putImage(png(4))) as string;

    await store.putProject("p", projectWith("v1", [inHistoryOnly]), { expectedRevision: 0 });
    clock += MINUTE;
    await store.putProject("p", projectWith("v2", [inProject]), { expectedRevision: 1 });

    const old = new Date(clock - IMAGE_GRACE_MS - MINUTE);
    const recent = new Date(clock - MINUTE);
    for (const name of [inProject, inHistoryOnly, unreferencedOld]) {
      await utimes(path.join(dir, "images", name), old, old);
    }
    await utimes(path.join(dir, "images", unreferencedNew), recent, recent);

    expect(await store.collectGarbage()).toBe(1);
    expect((await readdir(path.join(dir, "images"))).sort()).toEqual(
      [inProject, inHistoryOnly, unreferencedNew].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run server/store-history.test.ts`
Expected: FAIL — `IMAGE_GRACE_MS` / `listHistory` are not exported/defined.

- [ ] **Step 3: Implement history and cleanup in `server/store.ts`**

1. Extend the imports:

```ts
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import {
  collectImageNames,
  selectVersionsToKeep,
  shouldAutoSnapshot,
  summarizeProject,
  versionName,
  type ProjectSummary,
  type VersionMeta,
} from "./history";
import { IMAGE_CONTENT_TYPES, detectImageType, isValidImageName, isValidVersion, type ImageExt } from "./validation";
```

2. Add below `PutProjectResult`:

```ts
export const IMAGE_GRACE_MS = 60 * 60 * 1000;
export const PREVIOUS_VERSION_LABEL = "Before replace";
export const RESTORE_LABEL = "Before restore";

export interface HistoryEntry {
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
  project: unknown;
}

export interface HistorySummary extends ProjectSummary {
  version: string;
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
}
```

3. Replace the empty `afterProjectWrite` hook and add the history methods inside `class FileStore`:

```ts
  protected async afterProjectWrite(
    id: string,
    previous: StoredProject | null,
    next: StoredProject,
    options: PutProjectOptions,
  ): Promise<void> {
    const newestSavedAt = await this.newestVersionSavedAt(id);
    let wrote = false;
    if (options.pinPrevious && previous) {
      await this.writeVersion(id, { ...previous, pinned: true, label: PREVIOUS_VERSION_LABEL });
      wrote = true;
    }
    if (options.pin) {
      await this.writeVersion(id, { ...next, pinned: true, ...(options.label ? { label: options.label } : {}) });
      wrote = true;
    } else if (shouldAutoSnapshot(newestSavedAt, next.savedAt)) {
      await this.writeVersion(id, { ...next, pinned: false });
      wrote = true;
    }
    if (wrote) await this.pruneHistory(id);
  }

  private historyDir(id: string): string {
    return path.join(this.projectsDir, id, "history");
  }

  private async writeVersion(id: string, entry: HistoryEntry): Promise<void> {
    await mkdir(this.historyDir(id), { recursive: true });
    const file = path.join(this.historyDir(id), `${versionName(entry.savedAt, entry.revision)}.json`);
    await writeFileAtomic(file, JSON.stringify(entry));
  }

  private async versionNames(id: string): Promise<string[]> {
    try {
      return (await readdir(this.historyDir(id)))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .filter(isValidVersion);
    } catch {
      return [];
    }
  }

  private async newestVersionSavedAt(id: string): Promise<number | null> {
    const times = (await this.versionNames(id)).map((version) => Number(version.split("-")[0]));
    return times.length > 0 ? Math.max(...times) : null;
  }

  private async readVersions(id: string): Promise<Array<VersionMeta & { entry: HistoryEntry }>> {
    const versions: Array<VersionMeta & { entry: HistoryEntry }> = [];
    for (const version of await this.versionNames(id)) {
      const entry = await readJson<HistoryEntry>(path.join(this.historyDir(id), `${version}.json`));
      if (entry) versions.push({ version, savedAt: entry.savedAt, pinned: entry.pinned, entry });
    }
    return versions.sort((a, b) => b.savedAt - a.savedAt);
  }

  private async pruneHistory(id: string): Promise<void> {
    const versions = await this.readVersions(id);
    const keep = selectVersionsToKeep(versions, this.now());
    let removed = 0;
    for (const version of versions) {
      if (!keep.has(version.version)) {
        await rm(path.join(this.historyDir(id), `${version.version}.json`), { force: true });
        removed += 1;
      }
    }
    if (removed > 0) await this.collectGarbage();
  }

  async listHistory(id: string): Promise<HistorySummary[] | null> {
    if (!(await this.getProject(id))) return null;
    return (await this.readVersions(id)).map(({ version, entry }) => ({
      version,
      revision: entry.revision,
      savedAt: entry.savedAt,
      pinned: entry.pinned,
      ...(entry.label ? { label: entry.label } : {}),
      ...summarizeProject(entry.project),
    }));
  }

  addHistory(id: string, project: unknown, label: string): Promise<boolean> {
    return this.withLock(id, async () => {
      const current = await this.getProject(id);
      if (!current) return false;
      await this.writeVersion(id, { revision: current.revision, savedAt: this.now(), pinned: true, label, project });
      await this.pruneHistory(id);
      return true;
    });
  }

  restoreVersion(id: string, version: string): Promise<StoredProject | null> {
    return this.withLock(id, async () => {
      if (!isValidVersion(version)) return null;
      const current = await this.getProject(id);
      if (!current) return null;
      const entry = await readJson<HistoryEntry>(path.join(this.historyDir(id), `${version}.json`));
      if (!entry) return null;
      await this.writeVersion(id, { ...current, pinned: true, label: RESTORE_LABEL });
      const next: StoredProject = { revision: current.revision + 1, savedAt: this.now(), project: entry.project };
      await writeFileAtomic(this.projectPath(id), JSON.stringify(next));
      await this.pruneHistory(id);
      return next;
    });
  }

  async collectGarbage(): Promise<number> {
    const referenced = new Set<string>();
    for (const file of await readdir(this.projectsDir)) {
      if (file.endsWith(".json")) {
        const stored = await readJson<StoredProject>(path.join(this.projectsDir, file));
        if (stored) collectImageNames(stored.project, referenced);
      } else if (!file.includes(".")) {
        for (const version of await this.versionNames(file)) {
          const entry = await readJson<HistoryEntry>(path.join(this.historyDir(file), `${version}.json`));
          if (entry) collectImageNames(entry.project, referenced);
        }
      }
    }
    let deleted = 0;
    for (const name of await readdir(this.imagesDir)) {
      if (!isValidImageName(name) || referenced.has(name)) continue;
      const info = await stat(path.join(this.imagesDir, name));
      if (this.now() - info.mtimeMs > IMAGE_GRACE_MS) {
        await rm(path.join(this.imagesDir, name), { force: true });
        deleted += 1;
      }
    }
    return deleted;
  }
```

4. In `deleteProject`, after the `putState(...)` call inside `if (deleted) { ... }`, add `await this.collectGarbage();`.

- [ ] **Step 4: Run both store test files and server type-check**

Run: `bunx vitest run server/store.test.ts server/store-history.test.ts && bunx tsc -p server`
Expected: PASS (12 + 10 tests); tsc exit 0. The "applies retention" test performs 25 saves; if it is slow, do not reduce the count — it is the retention boundary.

- [ ] **Step 5: Commit**

```bash
git add server/store.ts server/store-history.test.ts
git commit -m "Add project version history and image cleanup to the file store

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 5: API request handler

**Files:**
- Create: `server/api.ts`
- Test: `server/api.test.ts`

**Interfaces:**
- Consumes: Task 1 `MAX_IMAGE_BYTES`, `MAX_JSON_BYTES`, `isValidProjectId`, `isValidVersion`, `isValidImageName`; Tasks 3–4 `FileStore` (all public methods).
- Produces (`server/api.ts`):
  - `interface ServerConfig { store: FileStore; writable: boolean; password: string | null; distDir: string | null; limits?: { imageBytes: number; jsonBytes: number } }`
  - `isAuthorized(request: Request, password: string | null): boolean`
  - `handleRequest(request: Request, config: ServerConfig): Promise<Response>`

Status codes (verbatim): `400` invalid id/version/body/JSON; `401` + `WWW-Authenticate: Basic realm="AppShots"`; `404` missing; `405` wrong method on a known route; `409` revision conflict; `413` body over limit; `415` unsupported image; `428` project PUT without `If-Match`/`If-None-Match`; `503` write while storage is not writable. Successful creates of history entries and images return `201`; project delete returns `204`.

- [ ] **Step 1: Write the failing test**

Create `server/api.test.ts`:

```ts
/** @vitest-environment node */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRequest, type ServerConfig } from "./api";
import { FileStore } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

let root: string;
let config: ServerConfig;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "appshots-api-"));
  const dataDir = path.join(root, "data");
  const distDir = path.join(root, "dist");
  await mkdir(path.join(distDir, "assets"), { recursive: true });
  await writeFile(path.join(distDir, "index.html"), "<!doctype html><title>AppShots</title>");
  await writeFile(path.join(distDir, "assets", "app-abc.js"), "console.log(1)");
  const store = new FileStore(dataDir);
  const { writable } = await store.init();
  config = { store, writable, password: null, distDir };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const call = (method: string, pathname: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}) =>
  handleRequest(new Request(`http://localhost${pathname}`, { method, ...init }), config);

const putJson = (pathname: string, body: unknown, headers: Record<string, string> = {}) =>
  call("PUT", pathname, { body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });

const project = (headline: string) => ({ name: "Demo", screenshots: [{ headline }] });

describe("health and auth", () => {
  it("reports server storage", async () => {
    const response = await call("GET", "/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ storage: "server", writable: true, auth: false });
  });

  it("requires Basic auth for everything except health when a password is set", async () => {
    config.password = "s3cret";
    expect((await call("GET", "/api/health")).status).toBe(200);

    const denied = await call("GET", "/api/state");
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toBe('Basic realm="AppShots"');
    expect((await call("GET", "/")).status).toBe(401);

    const wrong = { Authorization: `Basic ${btoa("me:nope")}` };
    expect((await call("GET", "/api/state", { headers: wrong })).status).toBe(401);

    const right = { Authorization: `Basic ${btoa("anyone:s3cret")}` };
    expect((await call("GET", "/api/state", { headers: right })).status).toBe(200);
  });
});

describe("projects", () => {
  it("creates, reads, updates and deletes with revision preconditions", async () => {
    expect((await putJson("/api/projects/p1", { project: project("v1") })).status).toBe(428);

    const created = await putJson("/api/projects/p1", { project: project("v1") }, { "If-None-Match": "*" });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ revision: 1 });

    const read = await call("GET", "/api/projects/p1");
    expect(read.headers.get("ETag")).toBe('"1"');
    expect(await read.json()).toMatchObject({ revision: 1, project: project("v1") });

    const updated = await putJson("/api/projects/p1", { project: project("v2") }, { "If-Match": '"1"' });
    expect(await updated.json()).toMatchObject({ revision: 2 });

    const stale = await putJson("/api/projects/p1", { project: project("v3") }, { "If-Match": '"1"' });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ revision: 2 });

    expect((await call("DELETE", "/api/projects/p1")).status).toBe(204);
    expect((await call("GET", "/api/projects/p1")).status).toBe(404);
    expect((await call("DELETE", "/api/projects/p1")).status).toBe(404);
  });

  it("validates ids and bodies", async () => {
    expect((await call("GET", "/api/projects/bad.id")).status).toBe(400);
    expect((await putJson("/api/projects/p1", { project: "nope" }, { "If-None-Match": "*" })).status).toBe(400);
    expect(
      (await call("PUT", "/api/projects/p1", { body: "{not json", headers: { "If-None-Match": "*" } })).status,
    ).toBe(400);
    config.limits = { imageBytes: 1000, jsonBytes: 10 };
    expect((await putJson("/api/projects/p1", { project: project("long") }, { "If-None-Match": "*" })).status).toBe(413);
  });

  it("returns 405 for unsupported methods on known routes", async () => {
    expect((await call("POST", "/api/projects/p1")).status).toBe(405);
  });
});

describe("state", () => {
  it("round-trips active project and order", async () => {
    await putJson("/api/projects/p1", { project: project("v1") }, { "If-None-Match": "*" });
    expect((await putJson("/api/state", { activeProjectId: "../x", projectOrder: [] })).status).toBe(400);
    expect((await putJson("/api/state", { activeProjectId: "p1", projectOrder: ["p1"] })).status).toBe(204);
    const state = await (await call("GET", "/api/state")).json();
    expect(state).toMatchObject({ activeProjectId: "p1", projectOrder: ["p1"], projects: [{ id: "p1", revision: 1 }] });
  });
});

describe("images", () => {
  it("uploads and serves hashed images", async () => {
    const uploaded = await call("POST", "/api/images", { body: PNG });
    expect(uploaded.status).toBe(201);
    const { url } = (await uploaded.json()) as { url: string };
    expect(url).toMatch(/^\/api\/images\/[a-f0-9]{64}\.png$/);

    const served = await call("GET", url);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(Array.from(new Uint8Array(await served.arrayBuffer()))).toEqual(Array.from(PNG));
  });

  it("rejects unsupported and oversized uploads", async () => {
    expect((await call("POST", "/api/images", { body: "<svg/>" })).status).toBe(415);
    config.limits = { imageBytes: 4, jsonBytes: 1000 };
    expect((await call("POST", "/api/images", { body: PNG })).status).toBe(413);
    expect((await call("GET", `/api/images/${"f".repeat(64)}.png`)).status).toBe(404);
    expect((await call("GET", "/api/images/evil.svg")).status).toBe(400);
  });
});

describe("history", () => {
  it("lists, adds and restores versions", async () => {
    await putJson("/api/projects/p1", { project: project("first") }, { "If-None-Match": "*" });
    const list = await (await call("GET", "/api/projects/p1/history")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ revision: 1, firstHeadline: "first", screenCount: 1 });

    const added = await call("POST", "/api/projects/p1/history", {
      body: JSON.stringify({ project: project("local"), label: "Discarded local changes" }),
    });
    expect(added.status).toBe(201);

    const restored = await call("POST", `/api/projects/p1/history/${list[0].version}/restore`);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ revision: 2, project: project("first") });

    expect((await call("POST", "/api/projects/p1/history/nope/restore")).status).toBe(400);
    expect((await call("GET", "/api/projects/missing/history")).status).toBe(404);
  });
});

describe("read-only storage", () => {
  it("refuses writes but allows reads", async () => {
    config.writable = false;
    expect((await putJson("/api/projects/p1", { project: project("x") }, { "If-None-Match": "*" })).status).toBe(503);
    expect((await call("POST", "/api/images", { body: PNG })).status).toBe(503);
    expect((await call("GET", "/api/state")).status).toBe(200);
  });
});

describe("static files", () => {
  it("serves the app with SPA fallback and caching rules", async () => {
    const index = await call("GET", "/");
    expect(index.status).toBe(200);
    expect(index.headers.get("Cache-Control")).toBe("no-cache");
    expect(await index.text()).toContain("AppShots");

    const asset = await call("GET", "/assets/app-abc.js");
    expect(asset.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(asset.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

    expect((await call("GET", "/assets/missing.js")).status).toBe(404);
    expect(await (await call("GET", "/some/client/route")).text()).toContain("AppShots");
    // "%2F" keeps the slash encoded through URL parsing, so the decoded path escapes dist/.
    expect((await call("GET", "/..%2Fsecret.txt")).status).toBe(404);
    expect((await call("GET", "/api/unknown")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run server/api.test.ts`
Expected: FAIL — cannot resolve `./api`.

- [ ] **Step 3: Implement `server/api.ts`**

```ts
/**
 * HTTP handling for the AppShots storage server. Plain Request → Response so it
 * runs under Bun in production and under Vitest in tests.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "./store";
import {
  MAX_IMAGE_BYTES,
  MAX_JSON_BYTES,
  isValidImageName,
  isValidProjectId,
  isValidVersion,
} from "./validation";

export interface ServerConfig {
  store: FileStore;
  writable: boolean;
  password: string | null;
  distDir: string | null;
  limits?: { imageBytes: number; jsonBytes: number };
}

const MAX_LABEL_LENGTH = 100;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const fail = (status: number, message: string): Response => json(status, { error: message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAuthorized = (request: Request, password: string | null): boolean => {
  if (!password) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const supplied = createHash("sha256").update(decoded.slice(separator + 1)).digest();
  const expected = createHash("sha256").update(password).digest();
  return timingSafeEqual(supplied, expected);
};

class BodyTooLarge extends Error {}
class BadJson extends Error {}

const readBytes = async (request: Request, limit: number): Promise<Uint8Array> => {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new BodyTooLarge();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) throw new BodyTooLarge();
  return bytes;
};

const readJsonBody = async (request: Request, limit: number): Promise<unknown> => {
  const bytes = await readBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BadJson();
  }
};

/** `If-None-Match: *` → 0 (must not exist); `If-Match: "N"` → N; otherwise null. */
const expectedRevisionFrom = (request: Request): number | null => {
  if (request.headers.get("if-none-match")?.trim() === "*") return 0;
  const match = request.headers.get("if-match")?.trim().replace(/^"|"$/g, "");
  if (match && /^\d+$/.test(match)) return Number(match);
  return null;
};

const validLabel = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_LABEL_LENGTH;

const handleApi = async (request: Request, pathname: string, config: ServerConfig): Promise<Response> => {
  const { store } = config;
  const limits = config.limits ?? { imageBytes: MAX_IMAGE_BYTES, jsonBytes: MAX_JSON_BYTES };
  const method = request.method;
  const parts = pathname.slice("/api/".length).split("/");
  const isWrite = method !== "GET" && method !== "HEAD";
  const notWritable = () => fail(503, "storage is not writable");

  // /api/state
  if (parts.length === 1 && parts[0] === "state") {
    if (method === "GET") return json(200, await store.getState());
    if (method !== "PUT") return fail(405, "method not allowed");
    if (!config.writable) return notWritable();
    const body = await readJsonBody(request, limits.jsonBytes);
    if (
      !isRecord(body) ||
      !(body.activeProjectId === null || (typeof body.activeProjectId === "string" && isValidProjectId(body.activeProjectId))) ||
      !Array.isArray(body.projectOrder) ||
      !body.projectOrder.every((id) => typeof id === "string" && isValidProjectId(id))
    ) {
      return fail(400, "invalid state");
    }
    await store.putState({ activeProjectId: body.activeProjectId, projectOrder: body.projectOrder as string[] });
    return new Response(null, { status: 204 });
  }

  // /api/images and /api/images/:file
  if (parts[0] === "images") {
    if (parts.length === 1) {
      if (method !== "POST") return fail(405, "method not allowed");
      if (!config.writable) return notWritable();
      const name = await store.putImage(await readBytes(request, limits.imageBytes));
      if (!name) return fail(415, "only PNG, JPEG and WebP images are supported");
      return json(201, { url: `/api/images/${name}` });
    }
    if (parts.length === 2) {
      if (method !== "GET") return fail(405, "method not allowed");
      if (!isValidImageName(parts[1])) return fail(400, "invalid image name");
      const image = await store.readImage(parts[1]);
      if (!image) return fail(404, "image not found");
      return new Response(image.bytes, {
        status: 200,
        headers: { "Content-Type": image.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }
  }

  // /api/projects/:id[/history[/:version/restore]]
  if (parts[0] === "projects" && parts.length >= 2) {
    const id = parts[1];
    if (!isValidProjectId(id)) return fail(400, "invalid project id");
    if (isWrite && !config.writable) return notWritable();

    if (parts.length === 2) {
      if (method === "GET") {
        const stored = await store.getProject(id);
        if (!stored) return fail(404, "project not found");
        return json(200, stored, { ETag: `"${stored.revision}"` });
      }
      if (method === "PUT") {
        const expectedRevision = expectedRevisionFrom(request);
        if (expectedRevision === null) return fail(428, "If-Match or If-None-Match required");
        const body = await readJsonBody(request, limits.jsonBytes);
        if (!isRecord(body) || !isRecord(body.project)) return fail(400, "body must include a project object");
        if (body.label !== undefined && !validLabel(body.label)) return fail(400, "invalid label");
        const result = await store.putProject(id, body.project, {
          expectedRevision,
          pin: body.pin === true,
          pinPrevious: body.pinPrevious === true,
          ...(typeof body.label === "string" ? { label: body.label } : {}),
        });
        if (!result.ok) return json(409, result.current);
        return json(200, { revision: result.revision, savedAt: result.savedAt });
      }
      if (method === "DELETE") {
        return (await store.deleteProject(id)) ? new Response(null, { status: 204 }) : fail(404, "project not found");
      }
      return fail(405, "method not allowed");
    }

    if (parts[2] === "history") {
      if (parts.length === 3) {
        if (method === "GET") {
          const history = await store.listHistory(id);
          return history ? json(200, history) : fail(404, "project not found");
        }
        if (method === "POST") {
          const body = await readJsonBody(request, limits.jsonBytes);
          if (!isRecord(body) || !isRecord(body.project) || !validLabel(body.label)) {
            return fail(400, "body must include a project object and a label");
          }
          return (await store.addHistory(id, body.project, body.label))
            ? json(201, { ok: true })
            : fail(404, "project not found");
        }
        return fail(405, "method not allowed");
      }
      if (parts.length === 5 && parts[4] === "restore") {
        if (method !== "POST") return fail(405, "method not allowed");
        if (!isValidVersion(parts[3])) return fail(400, "invalid version");
        const restored = await store.restoreVersion(id, parts[3]);
        return restored ? json(200, restored) : fail(404, "version not found");
      }
    }
  }

  return fail(404, "not found");
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

const fileResponse = async (file: string, cacheControl: string): Promise<Response> =>
  new Response(new Uint8Array(await readFile(file)), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": cacheControl,
    },
  });

const isFile = (file: string): Promise<boolean> =>
  stat(file).then(
    (info) => info.isFile(),
    () => false,
  );

const serveStatic = async (pathname: string, distDir: string | null): Promise<Response> => {
  if (!distDir) return fail(404, "not found");
  const root = path.resolve(distDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return fail(400, "bad path");
  }
  const target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return fail(404, "not found");

  const indexFile = path.join(root, "index.html");
  if (target === root || target === indexFile) return fileResponse(indexFile, "no-cache");
  if (await isFile(target)) {
    const cache = decoded.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return fileResponse(target, cache);
  }
  if (decoded.startsWith("/assets/")) return fail(404, "not found");
  return fileResponse(indexFile, "no-cache");
};

export const handleRequest = async (request: Request, config: ServerConfig): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/health") {
    return json(200, { storage: "server", writable: config.writable, auth: Boolean(config.password) });
  }
  if (!isAuthorized(request, config.password)) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="AppShots"' },
    });
  }

  try {
    if (pathname.startsWith("/api/")) return await handleApi(request, pathname, config);
    return await serveStatic(pathname, config.distDir);
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail(413, "request body too large");
    if (error instanceof BadJson) return fail(400, "invalid JSON");
    console.error("Unhandled request error", error);
    return fail(500, "internal error");
  }
};
```

- [ ] **Step 4: Run server tests and type-check**

Run: `bunx vitest run server && bunx tsc -p server`
Expected: all server test files PASS (api: 11 tests); tsc exit 0. Do not remove or weaken the path-containment check in `serveStatic` to make a test pass.

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "Add storage API handler with auth, limits and static serving

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 6: Bun entry point, dev proxy, Docker

**Files:**
- Create: `server/main.ts`
- Modify: `vite.config.ts`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- Delete: `nginx.conf`

**Interfaces:**
- Consumes: Task 5 `handleRequest`; Tasks 3–4 `FileStore`.
- Produces: the runnable server (`bun server/main.ts`), `bun run dev:server` (script from Task 1), Vite `/api` proxy to `http://localhost:3000`, a Docker image serving the app + API on container port 80 with data in `/data`.

`server/main.ts` is intentionally untested glue; it is verified by running it.

- [ ] **Step 1: Create `server/main.ts`**

```ts
/**
 * AppShots server entry: serves the built app and the storage API.
 *
 *   APPSHOTS_DATA_DIR   data directory (default /data)
 *   APPSHOTS_DIST_DIR   built app directory (default dist)
 *   APPSHOTS_PASSWORD   require HTTP Basic auth when set
 *   PORT                listen port (default 80)
 */

import { handleRequest } from "./api";
import { FileStore } from "./store";

const dataDir = process.env.APPSHOTS_DATA_DIR ?? "/data";
const distDir = process.env.APPSHOTS_DIST_DIR ?? "dist";
const port = Number(process.env.PORT ?? "80");
const password = process.env.APPSHOTS_PASSWORD?.trim() || null;

const store = new FileStore(dataDir);
const { writable } = await store.init();

if (!writable) {
  console.error(
    `AppShots: ${dataDir} is not writable by uid ${process.getuid?.() ?? "?"}. ` +
      "Projects will be saved in each browser instead. Fix the volume permissions and restart.",
  );
}
if (!password) {
  console.warn(
    "AppShots: APPSHOTS_PASSWORD is not set. Anyone who can reach this server can read and change projects.",
  );
}

const server = Bun.serve({
  port,
  maxRequestBodySize: 26 * 1024 * 1024,
  fetch: (request) => handleRequest(request, { store, writable, password, distDir }),
});

console.log(`AppShots listening on port ${server.port} (data: ${dataDir})`);
```

- [ ] **Step 2: Add the Vite dev proxy**

In `vite.config.ts`, add a `server` block to `defineConfig({ ... })` next to `resolve`:

```ts
  server: {
    // `bun run dev:server` serves the storage API on port 3000. Without it,
    // /api requests fail and the app falls back to browser storage.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
```

- [ ] **Step 3: Verify the server locally**

Run:

```bash
bun run build
DATA=$(mktemp -d)
PORT=3111 APPSHOTS_DATA_DIR="$DATA" APPSHOTS_DIST_DIR=./dist bun server/main.ts &
SERVER=$!
sleep 1
curl -s http://localhost:3111/api/health
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3111/
curl -s -X PUT -H 'If-None-Match: *' -d '{"project":{"name":"x","screenshots":[]}}' http://localhost:3111/api/projects/smoke
curl -s http://localhost:3111/api/state
kill $SERVER
rm -rf "$DATA"
```

Expected: `{"storage":"server","writable":true,"auth":false}`; `200 text/html; charset=utf-8`; `{"revision":1,...}`; state lists `smoke`. The server logs the APPSHOTS_PASSWORD warning.

- [ ] **Step 4: Switch the Docker runtime to the Bun server**

Replace everything from the `# ---------- Runtime stage` comment to the end of `Dockerfile` with:

```dockerfile
# ---------- Runtime stage: Bun server for the app + storage API ----------
FROM oven/bun:1-alpine AS runtime
LABEL org.opencontainers.image.title="appshots" \
      org.opencontainers.image.description="App Store / Play Store screenshot generator with built-in project storage" \
      org.opencontainers.image.source="https://github.com/bdog720/appshots"

WORKDIR /app

# Built app + dependency-free server. No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
COPY server ./server

ENV APPSHOTS_DATA_DIR=/data \
    APPSHOTS_DIST_DIR=/app/dist \
    PORT=80 \
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
```

Delete `nginx.conf`: `git rm nginx.conf`.

Append to `.dockerignore` (if not already present):

```
.appshots-data
```

- [ ] **Step 5: Add the volume and password hint to compose**

Replace `docker-compose.yml` with:

```yaml
# Run appshots with a single command:
#
#   docker compose up -d --build
#
# Then open http://localhost:8080
#
# Change the host port by setting APPSHOTS_PORT, e.g.:
#   APPSHOTS_PORT=3000 docker compose up -d --build
#
# Projects are stored in the "appshots-data" volume and survive rebuilds.

services:
  appshots:
    build: .
    image: appshots:latest
    container_name: appshots
    ports:
      - "${APPSHOTS_PORT:-8080}:80"
    volumes:
      - appshots-data:/data
    # Require a password (recommended if the port is reachable beyond your LAN):
    # environment:
    #   APPSHOTS_PASSWORD: change-me
    restart: unless-stopped

volumes:
  appshots-data:
```

- [ ] **Step 6: Verify the image (if Docker is available)**

Run:

```bash
docker run --rm oven/bun:1-alpine id bun
docker compose up -d --build
sleep 5
curl -s http://localhost:8080/api/health
docker inspect --format '{{.State.Health.Status}}' appshots
docker compose down
docker compose up -d
curl -s http://localhost:8080/api/state
docker compose down
```

Expected: `id bun` prints a uid/gid for `bun` (if it doesn't exist in the alpine image, add `RUN addgroup -S bun && adduser -S -G bun bun` before the `chown` and note it in the report); health returns `writable: true`; health status becomes `healthy` within ~40 s (re-run `docker inspect` if still `starting`); state still responds after `down`/`up`. If Docker isn't available, skip this step and report it as unverified.

- [ ] **Step 7: Gates and commit**

Run: `bun run test && bun run build`
Expected: all tests pass; build (vite + `tsc` + `tsc -p server`) exits 0.

```bash
git add server/main.ts vite.config.ts Dockerfile docker-compose.yml .dockerignore
git commit -m "Serve the app from a Bun server with container storage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

(`git rm nginx.conf` already staged the deletion.)

---

### Task 7: App storage interface + BrowserStorage

**Files:**
- Create: `src/lib/storage/types.ts`, `src/lib/storage/browser-storage.ts`, `src/lib/storage/memory-storage.ts` (test helper)
- Modify: `src/lib/useLocalStorage.ts` (export `STORAGE_KEY` only — `useEditorPersistence`, `savePersistedState`, `clearPersistedState` stay until Task 11 because `EditorContext` still imports them)
- Test: `src/lib/storage/browser-storage.test.ts`

**Interfaces:**
- Consumes: `Project` (`src/types`); `CURRENT_VERSION`, `migratePersistedState`, `PersistedEditorState` (`src/lib/useLocalStorage.ts`).
- Produces:
  - `src/lib/storage/types.ts`:
    - `type StorageMode = "server" | "browser"`
    - `interface LoadedState { projects: Project[]; activeProjectId: string | null }`
    - `interface SaveOptions { pin?: boolean; pinPrevious?: boolean; label?: string; baseRevision?: number }` — `baseRevision` overrides the remembered revision (used by **Keep mine**)
    - `type SaveResult = { ok: true } | { ok: false; conflict: { revision: number; savedAt: number } }`
    - `interface ProjectStorage { readonly mode: StorageMode; load(): Promise<LoadedState>; saveProject(project: Project, options?: SaveOptions): Promise<SaveResult>; deleteProject(id: string): Promise<void>; saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void>; resetAll(): Promise<void> }`
    - `interface HistoryVersion { version: string; revision: number; savedAt: number; pinned: boolean; label?: string; screenCount: number; firstHeadline: string }`
    - `interface ServerProjectStorage extends ProjectStorage { readonly mode: "server"; reloadProject(id: string): Promise<Project | null>; listHistory(id: string): Promise<HistoryVersion[]>; addHistory(project: Project, label: string): Promise<void>; restoreVersion(id: string, version: string): Promise<Project>; inlineProjectImages(project: Project): Promise<Project> }`
    - `isServerStorage(storage: ProjectStorage): storage is ServerProjectStorage`
    - `class StorageError extends Error { readonly status?: number }`
  - `src/lib/storage/browser-storage.ts`: `class BrowserStorage implements ProjectStorage` with `constructor(storage?: Storage)` (defaults to `window.localStorage`)
  - `src/lib/storage/memory-storage.ts`: `createMemoryStorage(options?: { quotaChars?: number }): Storage` — in-memory `Storage` for tests; throws a `QuotaExceededError` `DOMException` when a write would exceed `quotaChars`
  - `src/lib/useLocalStorage.ts`: `export const STORAGE_KEY = "app-screenshot-editor-state"`

Tests inject `createMemoryStorage()` rather than touching the global `localStorage` (under this Node version the jsdom global can be undefined).

- [ ] **Step 1: Export the storage key**

In `src/lib/useLocalStorage.ts`, change `const STORAGE_KEY = "app-screenshot-editor-state";` to `export const STORAGE_KEY = "app-screenshot-editor-state";`.

- [ ] **Step 2: Write the test helper**

Create `src/lib/storage/memory-storage.ts`:

```ts
/** In-memory `Storage` for tests, with an optional character quota. */
export const createMemoryStorage = (options: { quotaChars?: number } = {}): Storage => {
  const data = new Map<string, string>();
  const size = () => [...data.entries()].reduce((total, [k, v]) => total + k.length + v.length, 0);

  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      const next = size() - (data.get(key)?.length ?? 0) - (data.has(key) ? key.length : 0) + key.length + value.length;
      if (options.quotaChars !== undefined && next > options.quotaChars) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      data.set(key, value);
    },
  };
};
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/storage/browser-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { CURRENT_VERSION, STORAGE_KEY } from "../useLocalStorage";
import { BrowserStorage } from "./browser-storage";
import { createMemoryStorage } from "./memory-storage";
import { StorageError } from "./types";

const project = (id: string, name = id) => ({ id, name, screenshots: [] }) as unknown as Project;

const blob = (storage: Storage) => JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");

describe("BrowserStorage", () => {
  it("is browser mode and loads empty storage", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    expect(storage.mode).toBe("browser");
    expect(await storage.load()).toEqual({ projects: [], activeProjectId: null });
  });

  it("loads an existing saved blob", async () => {
    const memory = createMemoryStorage();
    memory.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, projects: [project("a"), project("b")], activeProjectId: "b", lastSaved: 1 }),
    );
    const loaded = await new BrowserStorage(memory).load();
    expect(loaded.projects.map((p) => p.id)).toEqual(["a", "b"]);
    expect(loaded.activeProjectId).toBe("b");
  });

  it("saves new and updated projects into the blob", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    expect(await storage.saveProject(project("a"))).toEqual({ ok: true });
    await storage.saveProject(project("b"));
    await storage.saveProject(project("a", "renamed"));

    const saved = blob(memory);
    expect(saved.version).toBe(CURRENT_VERSION);
    expect(saved.projects.map((p: Project) => [p.id, p.name])).toEqual([
      ["a", "renamed"],
      ["b", "b"],
    ]);
  });

  it("deletes projects and saves meta", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.saveProject(project("b"));
    await storage.saveProject(project("c"));
    await storage.saveMeta("c", ["c", "a", "b"]);
    expect(blob(memory)).toMatchObject({ activeProjectId: "c" });
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["c", "a", "b"]);

    await storage.deleteProject("c");
    expect(blob(memory).projects.map((p: Project) => p.id)).toEqual(["a", "b"]);
    expect(blob(memory).activeProjectId).toBe("a");
  });

  it("rejects with a StorageError when browser storage is full", async () => {
    const storage = new BrowserStorage(createMemoryStorage({ quotaChars: 50 }));
    await storage.load();
    const huge = { ...project("a"), name: "x".repeat(200) } as Project;
    await expect(storage.saveProject(huge)).rejects.toBeInstanceOf(StorageError);
    await expect(storage.saveProject(huge)).rejects.toThrow("Browser storage is full");
  });

  it("resets all saved data", async () => {
    const memory = createMemoryStorage();
    const storage = new BrowserStorage(memory);
    await storage.load();
    await storage.saveProject(project("a"));
    await storage.resetAll();
    expect(memory.getItem(STORAGE_KEY)).toBeNull();
    expect(await storage.load()).toEqual({ projects: [], activeProjectId: null });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `bunx vitest run src/lib/storage/browser-storage.test.ts`
Expected: FAIL — cannot resolve `./browser-storage` / `./types`.

- [ ] **Step 5: Implement `src/lib/storage/types.ts`**

```ts
/** Where projects are saved: the container's storage API, or this browser. */

import type { Project } from "../../types";

export type StorageMode = "server" | "browser";

export interface LoadedState {
  projects: Project[];
  activeProjectId: string | null;
}

export interface SaveOptions {
  /** Keep this save as a pinned history version (Save now). */
  pin?: boolean;
  /** Keep the version being overwritten as a pinned history version. */
  pinPrevious?: boolean;
  label?: string;
  /** Save on top of this revision instead of the last one seen (Keep mine). */
  baseRevision?: number;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; conflict: { revision: number; savedAt: number } };

export interface ProjectStorage {
  readonly mode: StorageMode;
  load(): Promise<LoadedState>;
  saveProject(project: Project, options?: SaveOptions): Promise<SaveResult>;
  deleteProject(id: string): Promise<void>;
  saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void>;
  resetAll(): Promise<void>;
}

export interface HistoryVersion {
  version: string;
  revision: number;
  savedAt: number;
  pinned: boolean;
  label?: string;
  screenCount: number;
  firstHeadline: string;
}

export interface ServerProjectStorage extends ProjectStorage {
  readonly mode: "server";
  reloadProject(id: string): Promise<Project | null>;
  listHistory(id: string): Promise<HistoryVersion[]>;
  addHistory(project: Project, label: string): Promise<void>;
  restoreVersion(id: string, version: string): Promise<Project>;
  /** Replace /api/images URLs with data URLs (for self-contained exports). */
  inlineProjectImages(project: Project): Promise<Project>;
}

export const isServerStorage = (storage: ProjectStorage): storage is ServerProjectStorage =>
  storage.mode === "server";

export class StorageError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}
```

- [ ] **Step 6: Implement `src/lib/storage/browser-storage.ts`**

```ts
/**
 * Browser storage: the original single localStorage blob, behind the
 * ProjectStorage interface. Unlike the old autosave, a failed write (e.g. a
 * full quota) rejects so the save indicator can show it.
 */

import type { Project } from "../../types";
import {
  CURRENT_VERSION,
  STORAGE_KEY,
  migratePersistedState,
  type PersistedEditorState,
} from "../useLocalStorage";
import { StorageError, type LoadedState, type ProjectStorage, type SaveResult } from "./types";

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22);

export class BrowserStorage implements ProjectStorage {
  readonly mode = "browser" as const;
  private projects = new Map<string, Project>();
  private order: string[] = [];
  private activeProjectId: string | null = null;
  private readonly storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? window.localStorage;
  }

  async load(): Promise<LoadedState> {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const state = migratePersistedState(parsed);
    const projects = state?.projects ?? [];
    this.projects = new Map(projects.map((project) => [project.id, project]));
    this.order = projects.map((project) => project.id);
    this.activeProjectId = state?.activeProjectId || null;
    return { projects, activeProjectId: this.activeProjectId };
  }

  async saveProject(project: Project): Promise<SaveResult> {
    if (!this.projects.has(project.id)) this.order.push(project.id);
    this.projects.set(project.id, project);
    this.write();
    return { ok: true };
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    this.order = this.order.filter((projectId) => projectId !== id);
    if (this.activeProjectId === id) this.activeProjectId = this.order[0] ?? null;
    this.write();
  }

  async saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void> {
    this.activeProjectId = activeProjectId;
    const known = projectOrder.filter((id) => this.projects.has(id));
    this.order = [...known, ...this.order.filter((id) => !known.includes(id))];
    this.write();
  }

  async resetAll(): Promise<void> {
    this.projects.clear();
    this.order = [];
    this.activeProjectId = null;
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      throw new StorageError("Couldn't clear browser storage");
    }
  }

  private write(): void {
    const state: PersistedEditorState = {
      version: CURRENT_VERSION,
      projects: this.order.map((id) => this.projects.get(id) as Project),
      activeProjectId: this.activeProjectId ?? this.order[0] ?? "",
      lastSaved: Date.now(),
    };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      throw new StorageError(isQuotaError(error) ? "Browser storage is full" : "Couldn't save to browser storage");
    }
  }
}
```

Every method writes synchronously before its first `await` point, so calling `saveProject` during `beforeunload` still persists in browser mode.

- [ ] **Step 6b: Run tests, type-check**

Run: `bunx vitest run src/lib/storage/browser-storage.test.ts src/lib/useLocalStorage.test.ts && bunx tsc --noEmit`
Expected: PASS (6 + 3 tests); tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useLocalStorage.ts src/lib/storage/types.ts src/lib/storage/browser-storage.ts src/lib/storage/memory-storage.ts src/lib/storage/browser-storage.test.ts
git commit -m "Add project storage interface and browser storage implementation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 8: Image helpers + ServerStorage client

**Files:**
- Create: `src/lib/storage/images.ts`, `src/lib/storage/server-storage.ts`, `src/lib/storage/fake-server.ts` (test helper)
- Modify: `src/lib/storage/types.ts` (add `saveProjectOnUnload` to `ServerProjectStorage`)
- Test: `src/lib/storage/images.test.ts`, `src/lib/storage/server-storage.test.ts`

**Interfaces:**
- Consumes: Task 7 types (`ProjectStorage`, `ServerProjectStorage`, `LoadedState`, `SaveOptions`, `SaveResult`, `HistoryVersion`, `StorageError`); `Project`.
- Produces:
  - `src/lib/storage/types.ts`: `ServerProjectStorage` gains `saveProjectOnUnload(project: Project): boolean` (fires a keepalive save and returns `true`, or returns `false` if it can't)
  - `src/lib/storage/images.ts`:
    - `isDataUrl(value: unknown): value is string`, `isServerImageUrl(value: unknown): value is string`
    - `dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string }`
    - `bytesToDataUrl(bytes: Uint8Array, contentType: string): string`
    - `mapProjectImages(project: Project, transform: (src: string) => Promise<string>): Promise<Project>`
    - `mapProjectImagesSync(project: Project, transform: (src: string) => string | null): Project | null` — `null` if any transform returns `null`
  - `src/lib/storage/server-storage.ts`: `type FetchLike = (input: string, init?: RequestInit) => Promise<Response>`; `UNLOAD_BODY_LIMIT = 60 * 1024`; `class ServerStorage implements ServerProjectStorage` with `constructor(fetchImpl?: FetchLike)`
  - `src/lib/storage/fake-server.ts`: `createFakeServer(): { fetch: FetchLike; calls: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }>; projects: Map<string, { revision: number; project: unknown }>; images: Map<string, { bytes: Uint8Array; contentType: string }>; state: { activeProjectId: string | null; projectOrder: string[] }; history: Map<string, unknown[]>; failNext(status: number): void }` — in-memory API double used by Tasks 8–9

- [ ] **Step 1: Add `saveProjectOnUnload` to the interface**

In `src/lib/storage/types.ts`, inside `interface ServerProjectStorage`, add:

```ts
  /** Best-effort keepalive save while the page unloads. False when it can't be sent. */
  saveProjectOnUnload(project: Project): boolean;
```

- [ ] **Step 2: Write the image helper test**

Create `src/lib/storage/images.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  isDataUrl,
  isServerImageUrl,
  mapProjectImages,
  mapProjectImagesSync,
} from "./images";

const project = {
  id: "p",
  screenshots: [
    {
      devices: [{ screenshotSrc: "data:image/png;base64,AQID" }, { screenshotSrc: null }],
      overlayImages: [{ src: "/api/images/abc.png" }],
    },
  ],
} as unknown as Project;

describe("image helpers", () => {
  it("recognizes data and server image URLs", () => {
    expect(isDataUrl("data:image/png;base64,AA")).toBe(true);
    expect(isDataUrl("/api/images/a.png")).toBe(false);
    expect(isServerImageUrl("/api/images/a.png")).toBe(true);
    expect(isServerImageUrl(null)).toBe(false);
  });

  it("round-trips bytes through data URLs", () => {
    const { bytes, contentType } = dataUrlToBytes("data:image/png;base64,AQID");
    expect(contentType).toBe("image/png");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(bytesToDataUrl(new Uint8Array([1, 2, 3]), "image/png")).toBe("data:image/png;base64,AQID");
    const large = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(Array.from(dataUrlToBytes(bytesToDataUrl(large, "image/webp")).bytes)).toEqual(Array.from(large));
  });

  it("maps every device and overlay image without touching the original", async () => {
    const mapped = await mapProjectImages(project, async (src) => `mapped:${src}`);
    expect(mapped.screenshots[0].devices[0].screenshotSrc).toBe("mapped:data:image/png;base64,AQID");
    expect(mapped.screenshots[0].devices[1].screenshotSrc).toBeNull();
    expect(mapped.screenshots[0].overlayImages[0].src).toBe("mapped:/api/images/abc.png");
    expect(project.screenshots[0].devices[0].screenshotSrc).toBe("data:image/png;base64,AQID");
  });

  it("maps synchronously or gives up", () => {
    expect(mapProjectImagesSync(project, (src) => src)?.screenshots[0].overlayImages[0].src).toBe("/api/images/abc.png");
    expect(mapProjectImagesSync(project, (src) => (isDataUrl(src) ? null : src))).toBeNull();
  });
});
```

- [ ] **Step 3: Write the fake server helper and the ServerStorage test**

Create `src/lib/storage/fake-server.ts`:

```ts
/** In-memory double of the storage API for client tests. */

import type { FetchLike } from "./server-storage";

export const createFakeServer = () => {
  const projects = new Map<string, { revision: number; project: unknown }>();
  const images = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const history = new Map<string, unknown[]>();
  const state = { activeProjectId: null as string | null, projectOrder: [] as string[] };
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body: unknown }> = [];
  let failStatus: number | null = null;
  let imageCounter = 0;

  const json = (status: number, body: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fetch: FetchLike = async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ method, url, headers, body });

    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      return json(status, { error: "forced failure" });
    }

    const parts = url.replace(/^\/api\//, "").split("/").map(decodeURIComponent);

    if (url === "/api/state" && method === "GET") {
      const listed = state.projectOrder.filter((id) => projects.has(id));
      const rest = [...projects.keys()].filter((id) => !listed.includes(id));
      const order = [...listed, ...rest];
      return json(200, {
        ...state,
        projectOrder: order,
        projects: order.map((id) => ({ id, revision: projects.get(id)!.revision, savedAt: 1 })),
      });
    }
    if (url === "/api/state" && method === "PUT") {
      Object.assign(state, body);
      return new Response(null, { status: 204 });
    }
    if (url === "/api/images" && method === "POST") {
      const bytes = new Uint8Array(init.body as ArrayBuffer);
      const name = `${String(++imageCounter).padStart(64, "0")}.png`;
      images.set(name, { bytes, contentType: headers["content-type"] ?? "image/png" });
      return json(201, { url: `/api/images/${name}` });
    }
    if (parts[0] === "images" && method === "GET") {
      const image = images.get(parts[1]);
      return image
        ? new Response(image.bytes.buffer.slice(0) as ArrayBuffer, { status: 200, headers: { "Content-Type": image.contentType } })
        : json(404, { error: "not found" });
    }
    if (parts[0] === "projects") {
      const id = parts[1];
      const stored = projects.get(id);
      if (parts.length === 2 && method === "GET") return stored ? json(200, { ...stored, savedAt: 1 }) : json(404, { error: "nf" });
      if (parts.length === 2 && method === "PUT") {
        const expected = headers["if-none-match"] === "*" ? 0 : Number((headers["if-match"] ?? "").replace(/"/g, ""));
        const current = stored?.revision ?? 0;
        if (current !== expected) return json(409, { revision: current, savedAt: 1 });
        const record = body as { project: unknown };
        projects.set(id, { revision: current + 1, project: record.project });
        return json(200, { revision: current + 1, savedAt: 1 });
      }
      if (parts.length === 2 && method === "DELETE") {
        return projects.delete(id) ? new Response(null, { status: 204 }) : json(404, { error: "nf" });
      }
      if (parts[2] === "history" && parts.length === 3 && method === "GET") {
        return stored ? json(200, history.get(id) ?? []) : json(404, { error: "nf" });
      }
      if (parts[2] === "history" && parts.length === 3 && method === "POST") {
        history.set(id, [...(history.get(id) ?? []), body]);
        return json(201, { ok: true });
      }
      if (parts[2] === "history" && parts[4] === "restore" && method === "POST") {
        if (!stored) return json(404, { error: "nf" });
        const next = { revision: stored.revision + 1, project: { id, restoredFrom: parts[3] } };
        projects.set(id, next);
        return json(200, { ...next, savedAt: 2 });
      }
    }
    return json(404, { error: "not found" });
  };

  return {
    fetch,
    calls,
    projects,
    images,
    state,
    history,
    failNext: (status: number) => {
      failStatus = status;
    },
  };
};
```

Create `src/lib/storage/server-storage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { createFakeServer } from "./fake-server";
import { ServerStorage, UNLOAD_BODY_LIMIT } from "./server-storage";
import { StorageError } from "./types";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const project = (id: string, src: string | null = null, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name: id,
    screenshots: [{ devices: [{ screenshotSrc: src }], overlayImages: [] }],
    ...extra,
  }) as unknown as Project;

const setup = () => {
  const server = createFakeServer();
  return { server, storage: new ServerStorage(server.fetch) };
};

describe("ServerStorage load and save", () => {
  it("loads projects and remembers their revisions", async () => {
    const { server, storage } = setup();
    server.projects.set("a", { revision: 3, project: project("a") });
    server.projects.set("b", { revision: 1, project: project("b") });
    server.state.activeProjectId = "b";
    server.state.projectOrder = ["b", "a"];

    const loaded = await storage.load();
    expect(storage.mode).toBe("server");
    expect(loaded.activeProjectId).toBe("b");
    expect(loaded.projects.map((p) => p.id)).toEqual(["b", "a"]);

    await storage.saveProject(project("a"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"3"');
  });

  it("creates new projects and then updates them", async () => {
    const { server, storage } = setup();
    expect(await storage.saveProject(project("new"))).toEqual({ ok: true });
    expect(server.calls.at(-1)?.headers["if-none-match"]).toBe("*");
    await storage.saveProject(project("new"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
    expect(server.projects.get("new")?.revision).toBe(2);
  });

  it("reports conflicts without updating the remembered revision", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("p"));
    server.projects.set("p", { revision: 5, project: project("p") });
    expect(await storage.saveProject(project("p"))).toEqual({ ok: false, conflict: { revision: 5, savedAt: 1 } });
    await storage.saveProject(project("p"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"1"');
  });

  it("sends baseRevision, pin, pinPrevious and label when given", async () => {
    const { server, storage } = setup();
    server.projects.set("p", { revision: 5, project: project("p") });
    await storage.saveProject(project("p"), { baseRevision: 5, pinPrevious: true, pin: true, label: "Saved" });
    const call = server.calls.at(-1)!;
    expect(call.headers["if-match"]).toBe('"5"');
    expect(call.body).toMatchObject({ pin: true, pinPrevious: true, label: "Saved" });
  });

  it("uploads data URL images once and saves URLs, leaving the project untouched", async () => {
    const { server, storage } = setup();
    const withImage = project("p", PNG_DATA_URL);
    await storage.saveProject(withImage);
    await storage.saveProject(withImage);

    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(1);
    const saved = server.projects.get("p")!.project as Project;
    expect(saved.screenshots[0].devices[0].screenshotSrc).toMatch(/^\/api\/images\//);
    expect(withImage.screenshots[0].devices[0].screenshotSrc).toBe(PNG_DATA_URL);
    expect(server.images.values().next().value?.contentType).toBe("image/png");
  });

  it("uploads an image used twice in one save only once", async () => {
    const { server, storage } = setup();
    const twice = {
      ...project("p"),
      screenshots: [
        { devices: [{ screenshotSrc: PNG_DATA_URL }], overlayImages: [{ src: PNG_DATA_URL }] },
      ],
    } as unknown as Project;
    await storage.saveProject(twice);
    expect(server.calls.filter((call) => call.url === "/api/images")).toHaveLength(1);
  });

  it("turns failures into StorageErrors", async () => {
    const { server, storage } = setup();
    server.failNext(500);
    await expect(storage.saveProject(project("p", PNG_DATA_URL))).rejects.toBeInstanceOf(StorageError);

    const offline = new ServerStorage(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(offline.load()).rejects.toThrow("Can't reach the AppShots server");
  });
});

describe("ServerStorage other operations", () => {
  it("deletes projects, saves meta and resets everything", async () => {
    const { server, storage } = setup();
    await storage.saveProject(project("a"));
    await storage.saveProject(project("b"));
    await storage.saveMeta("b", ["b", "a"]);
    expect(server.state).toEqual({ activeProjectId: "b", projectOrder: ["b", "a"] });

    await storage.deleteProject("a");
    expect(server.projects.has("a")).toBe(false);

    await storage.resetAll();
    expect(server.projects.size).toBe(0);
    expect(server.state).toEqual({ activeProjectId: null, projectOrder: [] });
  });

  it("reloads a project, lists and adds history, and restores versions", async () => {
    const { server, storage } = setup();
    server.projects.set("p", { revision: 2, project: project("p") });
    expect((await storage.reloadProject("p"))?.id).toBe("p");
    expect(await storage.reloadProject("missing")).toBeNull();

    await storage.addHistory(project("p", PNG_DATA_URL), "Discarded local changes");
    const added = server.history.get("p")?.[0] as { label: string; project: Project };
    expect(added.label).toBe("Discarded local changes");
    expect(added.project.screenshots[0].devices[0].screenshotSrc).toMatch(/^\/api\/images\//);
    expect(await storage.listHistory("p")).toHaveLength(1);

    const restored = await storage.restoreVersion("p", "1757900000000-1");
    expect(restored).toMatchObject({ id: "p", restoredFrom: "1757900000000-1" });
    await storage.saveProject(project("p"));
    expect(server.calls.at(-1)?.headers["if-match"]).toBe('"3"');
  });

  it("inlines server images as data URLs for export", async () => {
    const { storage } = setup();
    await storage.saveProject(project("p", PNG_DATA_URL));
    const stored = await storage.reloadProject("p");
    const inlined = await storage.inlineProjectImages(stored!);
    expect(inlined.screenshots[0].devices[0].screenshotSrc).toBe(PNG_DATA_URL);
  });

  it("saves on unload with keepalive only when it can", async () => {
    const { server, storage } = setup();
    const fetchSpy = vi.fn(server.fetch);
    const spied = new ServerStorage(fetchSpy);
    await spied.saveProject(project("p"));

    expect(spied.saveProjectOnUnload(project("p"))).toBe(true);
    expect(fetchSpy.mock.calls.at(-1)?.[1]).toMatchObject({ method: "PUT", keepalive: true });

    expect(spied.saveProjectOnUnload(project("p", "data:image/png;base64,AAAA"))).toBe(false);
    const huge = project("p", null, { notes: "x".repeat(UNLOAD_BODY_LIMIT) });
    expect(spied.saveProjectOnUnload(huge)).toBe(false);
    expect(storage.mode).toBe("server");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/storage/images.test.ts src/lib/storage/server-storage.test.ts`
Expected: FAIL — cannot resolve `./images` / `./server-storage`.

- [ ] **Step 5: Implement `src/lib/storage/images.ts`**

```ts
/** Converting project image fields between inline data URLs and server URLs. */

import type { Project } from "../../types";

export const isDataUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:");

export const isServerImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/api/images/");

export const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; contentType: string } => {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice("data:".length, comma);
  const payload = dataUrl.slice(comma + 1);
  const contentType = header.split(";")[0] || "application/octet-stream";
  if (header.endsWith(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), contentType };
};

export const bytesToDataUrl = (bytes: Uint8Array, contentType: string): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
};

export const mapProjectImages = async (
  project: Project,
  transform: (src: string) => Promise<string>,
): Promise<Project> => ({
  ...project,
  screenshots: await Promise.all(
    project.screenshots.map(async (screenshot) => ({
      ...screenshot,
      devices: await Promise.all(
        screenshot.devices.map(async (device) =>
          device.screenshotSrc ? { ...device, screenshotSrc: await transform(device.screenshotSrc) } : device,
        ),
      ),
      overlayImages: await Promise.all(
        screenshot.overlayImages.map(async (overlay) => ({ ...overlay, src: await transform(overlay.src) })),
      ),
    })),
  ),
});

export const mapProjectImagesSync = (
  project: Project,
  transform: (src: string) => string | null,
): Project | null => {
  let failed = false;
  const apply = (src: string): string => {
    const next = transform(src);
    if (next === null) failed = true;
    return next ?? src;
  };
  const mapped: Project = {
    ...project,
    screenshots: project.screenshots.map((screenshot) => ({
      ...screenshot,
      devices: screenshot.devices.map((device) =>
        device.screenshotSrc ? { ...device, screenshotSrc: apply(device.screenshotSrc) } : device,
      ),
      overlayImages: screenshot.overlayImages.map((overlay) => ({ ...overlay, src: apply(overlay.src) })),
    })),
  };
  return failed ? null : mapped;
};
```

- [ ] **Step 6: Implement `src/lib/storage/server-storage.ts`**

```ts
/**
 * ServerStorage — saves projects through the container's storage API.
 * Remembers each project's revision for conflict detection and uploads inline
 * (data URL) images once, saving /api/images URLs in their place.
 */

import type { Project } from "../../types";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  isDataUrl,
  isServerImageUrl,
  mapProjectImages,
  mapProjectImagesSync,
} from "./images";
import {
  StorageError,
  type HistoryVersion,
  type LoadedState,
  type SaveOptions,
  type SaveResult,
  type ServerProjectStorage,
} from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const UNLOAD_BODY_LIMIT = 60 * 1024;

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export class ServerStorage implements ServerProjectStorage {
  readonly mode = "server" as const;
  private readonly revisions = new Map<string, number>();
  private readonly uploads = new Map<string, Promise<string>>();
  private readonly uploaded = new Map<string, string>();
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl?: FetchLike) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(url, { credentials: "same-origin", ...init });
    } catch {
      throw new StorageError("Can't reach the AppShots server");
    }
  }

  private async ensureOk(response: Response, action: string): Promise<Response> {
    if (response.ok) return response;
    let message = `${action} failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = `${action} failed: ${body.error}`;
    } catch {
      // keep the status-based message
    }
    throw new StorageError(message, response.status);
  }

  private preconditionHeaders(revision: number): Record<string, string> {
    return revision === 0 ? { "If-None-Match": "*" } : { "If-Match": `"${revision}"` };
  }

  private externalize(src: string): Promise<string> {
    if (!isDataUrl(src)) return Promise.resolve(src);
    const existing = this.uploads.get(src);
    if (existing) return existing;
    const upload = (async () => {
      const { bytes, contentType } = dataUrlToBytes(src);
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const response = await this.ensureOk(
        await this.request("/api/images", { method: "POST", headers: { "Content-Type": contentType }, body }),
        "Uploading an image",
      );
      const { url } = (await response.json()) as { url: string };
      this.uploaded.set(src, url);
      return url;
    })();
    this.uploads.set(src, upload);
    upload.catch(() => this.uploads.delete(src));
    return upload;
  }

  async load(): Promise<LoadedState> {
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as {
      activeProjectId: string | null;
      projects: Array<{ id: string }>;
    };
    const projects: Project[] = [];
    for (const { id } of state.projects) {
      const project = await this.reloadProject(id);
      if (project) projects.push(project);
    }
    return { projects, activeProjectId: state.activeProjectId };
  }

  async saveProject(project: Project, options: SaveOptions = {}): Promise<SaveResult> {
    const prepared = await mapProjectImages(project, (src) => this.externalize(src));
    const revision = options.baseRevision ?? this.revisions.get(project.id) ?? 0;
    const response = await this.request(projectUrl(project.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...this.preconditionHeaders(revision) },
      body: JSON.stringify({
        project: prepared,
        ...(options.pin ? { pin: true } : {}),
        ...(options.pinPrevious ? { pinPrevious: true } : {}),
        ...(options.label ? { label: options.label } : {}),
      }),
    });
    if (response.status === 409) {
      const conflict = (await response.json()) as { revision: number; savedAt: number };
      return { ok: false, conflict: { revision: conflict.revision, savedAt: conflict.savedAt } };
    }
    const saved = (await (await this.ensureOk(response, "Saving")).json()) as { revision: number };
    this.revisions.set(project.id, saved.revision);
    return { ok: true };
  }

  saveProjectOnUnload(project: Project): boolean {
    const prepared = mapProjectImagesSync(project, (src) =>
      isDataUrl(src) ? (this.uploaded.get(src) ?? null) : src,
    );
    if (!prepared) return false;
    const body = JSON.stringify({ project: prepared });
    if (body.length >= UNLOAD_BODY_LIMIT) return false;
    const revision = this.revisions.get(project.id) ?? 0;
    void this.fetchImpl(projectUrl(project.id), {
      method: "PUT",
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...this.preconditionHeaders(revision) },
      body,
    }).catch(() => undefined);
    return true;
  }

  async deleteProject(id: string): Promise<void> {
    const response = await this.request(projectUrl(id), { method: "DELETE" });
    if (response.status !== 404) await this.ensureOk(response, "Deleting a project");
    this.revisions.delete(id);
  }

  async saveMeta(activeProjectId: string, projectOrder: string[]): Promise<void> {
    await this.putState(activeProjectId, projectOrder);
  }

  private async putState(activeProjectId: string | null, projectOrder: string[]): Promise<void> {
    await this.ensureOk(
      await this.request("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProjectId, projectOrder }),
      }),
      "Saving project order",
    );
  }

  async resetAll(): Promise<void> {
    const response = await this.ensureOk(await this.request("/api/state"), "Loading projects");
    const state = (await response.json()) as { projects: Array<{ id: string }> };
    for (const { id } of state.projects) await this.deleteProject(id);
    await this.putState(null, []);
  }

  async reloadProject(id: string): Promise<Project | null> {
    const response = await this.request(projectUrl(id));
    if (response.status === 404) return null;
    const stored = (await (await this.ensureOk(response, "Loading a project")).json()) as {
      revision: number;
      project: Project;
    };
    this.revisions.set(id, stored.revision);
    return stored.project;
  }

  async listHistory(id: string): Promise<HistoryVersion[]> {
    const response = await this.ensureOk(await this.request(`${projectUrl(id)}/history`), "Loading history");
    return (await response.json()) as HistoryVersion[];
  }

  async addHistory(project: Project, label: string): Promise<void> {
    const prepared = await mapProjectImages(project, (src) => this.externalize(src));
    await this.ensureOk(
      await this.request(`${projectUrl(project.id)}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: prepared, label }),
      }),
      "Saving to history",
    );
  }

  async restoreVersion(id: string, version: string): Promise<Project> {
    const response = await this.ensureOk(
      await this.request(`${projectUrl(id)}/history/${encodeURIComponent(version)}/restore`, { method: "POST" }),
      "Restoring a version",
    );
    const restored = (await response.json()) as { revision: number; project: Project };
    this.revisions.set(id, restored.revision);
    return restored.project;
  }

  inlineProjectImages(project: Project): Promise<Project> {
    return mapProjectImages(project, async (src) => {
      if (!isServerImageUrl(src)) return src;
      const response = await this.ensureOk(await this.request(src), "Loading an image");
      const contentType = response.headers.get("Content-Type") ?? "image/png";
      return bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), contentType);
    });
  }
}
```

- [ ] **Step 7: Run tests and type-check**

Run: `bunx vitest run src/lib/storage && bunx tsc --noEmit`
Expected: PASS (browser-storage 6, images 4, server-storage 11); tsc exit 0. If jsdom's `Headers`/`Response` globals are missing in this environment, add `/** @vitest-environment node */` to `server-storage.test.ts` and `images.test.ts` (they don't use the DOM) and report it — don't mock `Response`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storage/types.ts src/lib/storage/images.ts src/lib/storage/images.test.ts src/lib/storage/server-storage.ts src/lib/storage/server-storage.test.ts src/lib/storage/fake-server.ts
git commit -m "Add server storage client with image uploads and revisions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 9: Storage detection + browser-to-container migration

**Files:**
- Create: `src/lib/storage/resolve-storage.ts`, `src/lib/storage/migrate.ts`
- Test: `src/lib/storage/resolve-storage.test.ts`, `src/lib/storage/migrate.test.ts`

**Interfaces:**
- Consumes: Task 7 `BrowserStorage`, `createMemoryStorage`, `ProjectStorage`, `StorageError`; Task 8 `ServerStorage`, `FetchLike`, `createFakeServer`; `STORAGE_KEY` (`src/lib/useLocalStorage.ts`); `Project`.
- Produces:
  - `src/lib/storage/resolve-storage.ts`:
    - `HEALTH_TIMEOUT_MS = 2000`
    - `type StorageNotice = "unwritable" | null`
    - `interface StorageResolution { storage: ProjectStorage; notice: StorageNotice }`
    - `resolveStorage(options?: { fetchImpl?: FetchLike; timeoutMs?: number; createBrowserStorage?: () => ProjectStorage }): Promise<StorageResolution>`
  - `src/lib/storage/migrate.ts`:
    - `MIGRATION_FLAG_KEY = "appshots-migrated-to-server"`
    - `migrateBrowserProjects(options: { server: ProjectStorage; serverProjectCount: number; normalize: (project: Project) => Project; localStorage?: Storage; now?: () => number }): Promise<number>` — number of projects moved (0 when skipped)

Migration normalizes each browser project before uploading because older saved projects can lack fields (e.g. `devices`) that image mapping relies on. The context passes `normalizeProject`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/resolve-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BrowserStorage } from "./browser-storage";
import { createMemoryStorage } from "./memory-storage";
import { resolveStorage } from "./resolve-storage";
import type { FetchLike } from "./server-storage";

const browser = () => new BrowserStorage(createMemoryStorage());
const respond = (status: number, body: string): FetchLike => async () => new Response(body, { status });

describe("resolveStorage", () => {
  it("uses server storage when the container reports writable storage", async () => {
    const result = await resolveStorage({
      fetchImpl: respond(200, JSON.stringify({ storage: "server", writable: true, auth: false })),
      createBrowserStorage: browser,
    });
    expect(result.storage.mode).toBe("server");
    expect(result.notice).toBeNull();
  });

  it("falls back to the browser with a notice when container storage isn't writable", async () => {
    const result = await resolveStorage({
      fetchImpl: respond(200, JSON.stringify({ storage: "server", writable: false, auth: false })),
      createBrowserStorage: browser,
    });
    expect(result.storage.mode).toBe("browser");
    expect(result.notice).toBe("unwritable");
  });

  it("uses browser storage when there is no storage API", async () => {
    for (const fetchImpl of [
      respond(404, "not found"),
      respond(200, "<!doctype html><title>SPA fallback</title>"),
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as FetchLike,
    ]) {
      const result = await resolveStorage({ fetchImpl, createBrowserStorage: browser });
      expect(result.storage.mode).toBe("browser");
      expect(result.notice).toBeNull();
    }
  });

  it("gives up after the timeout", async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const started = Date.now();
    const result = await resolveStorage({ fetchImpl: hanging, timeoutMs: 20, createBrowserStorage: browser });
    expect(result.storage.mode).toBe("browser");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
```

Create `src/lib/storage/migrate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { STORAGE_KEY } from "../useLocalStorage";
import { createFakeServer } from "./fake-server";
import { createMemoryStorage } from "./memory-storage";
import { MIGRATION_FLAG_KEY, migrateBrowserProjects } from "./migrate";
import { ServerStorage } from "./server-storage";
import { StorageError } from "./types";

const project = (id: string) =>
  ({ id, name: id, screenshots: [{ devices: [], overlayImages: [] }] }) as unknown as Project;

const browserWith = (projects: Project[], activeProjectId: string) => {
  const memory = createMemoryStorage();
  memory.setItem(STORAGE_KEY, JSON.stringify({ version: 2, projects, activeProjectId, lastSaved: 1 }));
  return memory;
};

describe("migrateBrowserProjects", () => {
  it("moves browser projects into an empty container once", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a"), project("b")], "b");
    const normalize = vi.fn((p: Project) => p);

    const moved = await migrateBrowserProjects({
      server: new ServerStorage(server.fetch),
      serverProjectCount: 0,
      normalize,
      localStorage: memory,
      now: () => 42,
    });

    expect(moved).toBe(2);
    expect(normalize).toHaveBeenCalledTimes(2);
    expect([...server.projects.keys()]).toEqual(["a", "b"]);
    expect(server.state).toEqual({ activeProjectId: "b", projectOrder: ["a", "b"] });
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBe("42");
    expect(memory.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("does nothing when the container already has projects or migration already ran", async () => {
    const server = createFakeServer();
    const memory = browserWith([project("a")], "a");
    const options = { server: new ServerStorage(server.fetch), normalize: (p: Project) => p, localStorage: memory };

    expect(await migrateBrowserProjects({ ...options, serverProjectCount: 3 })).toBe(0);
    memory.setItem(MIGRATION_FLAG_KEY, "1");
    expect(await migrateBrowserProjects({ ...options, serverProjectCount: 0 })).toBe(0);
    expect(server.calls).toHaveLength(0);
  });

  it("does nothing when this browser has no projects", async () => {
    const server = createFakeServer();
    const memory = createMemoryStorage();
    expect(
      await migrateBrowserProjects({
        server: new ServerStorage(server.fetch),
        serverProjectCount: 0,
        normalize: (p) => p,
        localStorage: memory,
      }),
    ).toBe(0);
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
  });

  it("stops without setting the flag if a project can't be saved", async () => {
    const server = createFakeServer();
    server.projects.set("a", { revision: 1, project: project("a") }); // forces a create conflict
    const memory = browserWith([project("a")], "a");
    await expect(
      migrateBrowserProjects({
        server: new ServerStorage(server.fetch),
        serverProjectCount: 0,
        normalize: (p) => p,
        localStorage: memory,
      }),
    ).rejects.toBeInstanceOf(StorageError);
    expect(memory.getItem(MIGRATION_FLAG_KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run src/lib/storage/resolve-storage.test.ts src/lib/storage/migrate.test.ts`
Expected: FAIL — cannot resolve `./resolve-storage` / `./migrate`.

- [ ] **Step 3: Implement `src/lib/storage/resolve-storage.ts`**

```ts
/**
 * Decide where projects are saved. The Docker image answers /api/health with
 * { storage: "server" }; dev servers without the API, static hosting, network
 * errors and timeouts all fall back to this browser's storage.
 */

import { BrowserStorage } from "./browser-storage";
import { ServerStorage, type FetchLike } from "./server-storage";
import type { ProjectStorage } from "./types";

export const HEALTH_TIMEOUT_MS = 2000;

export type StorageNotice = "unwritable" | null;

export interface StorageResolution {
  storage: ProjectStorage;
  notice: StorageNotice;
}

export const resolveStorage = async (
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    createBrowserStorage?: () => ProjectStorage;
  } = {},
): Promise<StorageResolution> => {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const createBrowserStorage = options.createBrowserStorage ?? (() => new BrowserStorage());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? HEALTH_TIMEOUT_MS);

  try {
    const response = await fetchImpl("/api/health", { signal: controller.signal, credentials: "same-origin" });
    if (response.ok) {
      const health = (await response.json()) as { storage?: unknown; writable?: unknown };
      if (health.storage === "server") {
        return health.writable === true
          ? { storage: new ServerStorage(fetchImpl), notice: null }
          : { storage: createBrowserStorage(), notice: "unwritable" };
      }
    }
  } catch {
    // No reachable storage API (or not JSON): use the browser.
  } finally {
    clearTimeout(timer);
  }
  return { storage: createBrowserStorage(), notice: null };
};
```

- [ ] **Step 4: Implement `src/lib/storage/migrate.ts`**

```ts
/**
 * First run against container storage: if the container has no projects and
 * this browser does, move them in once. The browser copy is left in place as a
 * backup; a flag stops it being imported again.
 */

import type { Project } from "../../types";
import { BrowserStorage } from "./browser-storage";
import { StorageError, type ProjectStorage } from "./types";

export const MIGRATION_FLAG_KEY = "appshots-migrated-to-server";

export const migrateBrowserProjects = async (options: {
  server: ProjectStorage;
  serverProjectCount: number;
  normalize: (project: Project) => Project;
  localStorage?: Storage;
  now?: () => number;
}): Promise<number> => {
  if (options.serverProjectCount > 0) return 0;
  const storage = options.localStorage ?? window.localStorage;
  try {
    if (storage.getItem(MIGRATION_FLAG_KEY)) return 0;
  } catch {
    return 0;
  }

  const local = await new BrowserStorage(storage).load();
  if (local.projects.length === 0) return 0;

  const projects = local.projects.map(options.normalize);
  for (const project of projects) {
    const result = await options.server.saveProject(project);
    if (!result.ok) throw new StorageError(`Couldn't move "${project.name}" into the container`);
  }

  const order = projects.map((project) => project.id);
  const active = local.activeProjectId && order.includes(local.activeProjectId) ? local.activeProjectId : order[0];
  await options.server.saveMeta(active, order);
  storage.setItem(MIGRATION_FLAG_KEY, String((options.now ?? Date.now)()));
  return projects.length;
};
```

- [ ] **Step 5: Run tests and type-check**

Run: `bunx vitest run src/lib/storage && bunx tsc --noEmit`
Expected: PASS (resolve-storage 4, migrate 4, plus earlier storage tests); tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/resolve-storage.ts src/lib/storage/resolve-storage.test.ts src/lib/storage/migrate.ts src/lib/storage/migrate.test.ts
git commit -m "Detect container storage and migrate browser projects on first run

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 10: Save planner + `useProjectPersistence`

**Files:**
- Create: `src/lib/storage/save-plan.ts`, `src/lib/storage/useProjectPersistence.ts`
- Test: `src/lib/storage/save-plan.test.ts`, `src/lib/storage/useProjectPersistence.test.tsx`

**Interfaces:**
- Consumes: Task 7 `ProjectStorage`, `SaveResult`, `StorageError`, `isServerStorage`; Task 8 `ServerProjectStorage.saveProjectOnUnload`; `Project`.
- Produces:
  - `src/lib/storage/save-plan.ts`:
    - `interface SavedSnapshot { projects: Map<string, Project>; activeProjectId: string; order: string[] }`
    - `interface SavePlan { save: Project[]; remove: string[]; meta: boolean }`
    - `snapshotOf(projects: Project[], activeProjectId: string): SavedSnapshot`
    - `sameProjectContent(a: Project, b: Project): boolean` — shallow compare of top-level fields, ignoring `updatedAt`
    - `planSave(previous: SavedSnapshot, projects: Project[], activeProjectId: string): SavePlan`
    - `isEmptyPlan(plan: SavePlan): boolean`
  - `src/lib/storage/useProjectPersistence.ts`:
    - `AUTOSAVE_DELAY_MS = 1000`, `SAVE_NOW_LABEL = "Saved"`
    - `type SaveStatus = { kind: "saved"; at: number | null } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "conflict"; projectId: string; revision: number; savedAt: number }`
    - `interface ProjectPersistence { status: SaveStatus; saveNow(): Promise<void>; retry(): Promise<void>; keepMine(): Promise<void>; markSaved(projects: Project[], activeProjectId: string): void }`
    - `useProjectPersistence(options: { storage: ProjectStorage; projects: Project[]; activeProjectId: string; initialProjects: Project[]; initialActiveProjectId: string; delayMs?: number; now?: () => number }): ProjectPersistence`

Behavior summary:
- The baseline starts as the initially loaded projects, so loading never triggers a save.
- Any difference from the baseline → `dirty` immediately, then a debounced flush (`delayMs`, default 1000 ms).
- Flush saves changed projects, deletes removed ones, saves meta; the baseline updates per successful operation. Edits made during a flush leave the status `dirty` and schedule another flush.
- **Save now:** cancels the timer and flushes immediately. In server mode the active project is saved with `{ pin: true, label: "Saved" }` even if unchanged.
- A save returning a conflict → `conflict` status; autosave pauses until `keepMine()` (re-save with `baseRevision` + `pinPrevious`) or `markSaved()` (after the editor loads another version).
- Errors → `error` with the `StorageError` message (fallback `"Couldn't save"`); `retry()` flushes again.
- `beforeunload` with unsaved changes or a save in flight: browser mode writes synchronously (no prompt); server mode calls `saveProjectOnUnload` for changed projects and asks the browser's leave-page prompt.

- [ ] **Step 1: Write the failing planner test**

Create `src/lib/storage/save-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { isEmptyPlan, planSave, sameProjectContent, snapshotOf } from "./save-plan";

const shots: unknown[] = [];
const project = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, screenshots: shots, updatedAt: 1, ...extra }) as unknown as Project;

describe("sameProjectContent", () => {
  it("ignores updatedAt and compares top-level fields by reference", () => {
    const a = project("a");
    expect(sameProjectContent(a, { ...a, updatedAt: 99 } as Project)).toBe(true);
    expect(sameProjectContent(a, { ...a, name: "renamed" } as Project)).toBe(false);
    expect(sameProjectContent(a, { ...a, screenshots: [] } as unknown as Project)).toBe(false);
  });
});

describe("planSave", () => {
  it("is empty when nothing changed except timestamps", () => {
    const a = project("a");
    const plan = planSave(snapshotOf([a], "a"), [{ ...a, updatedAt: 5 } as Project], "a");
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("saves new and changed projects and removes deleted ones", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    const changedA = { ...a, name: "A2" } as Project;
    const c = project("c");
    const plan = planSave(previous, [changedA, c], "a");
    expect(plan.save.map((p) => p.id)).toEqual(["a", "c"]);
    expect(plan.remove).toEqual(["b"]);
    expect(plan.meta).toBe(true);
  });

  it("flags meta when the active project or order changes", () => {
    const a = project("a");
    const b = project("b");
    const previous = snapshotOf([a, b], "a");
    expect(planSave(previous, [a, b], "b")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [b, a], "a")).toEqual({ save: [], remove: [], meta: true });
    expect(planSave(previous, [a, b], "a")).toEqual({ save: [], remove: [], meta: false });
  });
});
```

- [ ] **Step 2: Write the failing hook test**

Create `src/lib/storage/useProjectPersistence.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../types";
import { StorageError, type ProjectStorage, type SaveResult } from "./types";
import { useProjectPersistence } from "./useProjectPersistence";

const project = (id: string, name = id) =>
  ({ id, name, screenshots: [], updatedAt: 1 }) as unknown as Project;

const createStorage = (mode: "browser" | "server" = "browser") => {
  const saveProject = vi.fn(async (_project: Project, _options?: unknown): Promise<SaveResult> => ({ ok: true }));
  const deleteProject = vi.fn(async () => {});
  const saveMeta = vi.fn(async () => {});
  const saveProjectOnUnload = vi.fn(() => true);
  const storage = {
    mode,
    load: vi.fn(),
    resetAll: vi.fn(),
    saveProject,
    deleteProject,
    saveMeta,
    saveProjectOnUnload,
    reloadProject: vi.fn(),
    listHistory: vi.fn(),
    addHistory: vi.fn(),
    restoreVersion: vi.fn(),
    inlineProjectImages: vi.fn(),
  } as unknown as ProjectStorage;
  return { storage, saveProject, deleteProject, saveMeta, saveProjectOnUnload };
};

const initial = [project("a"), project("b")];

const setup = (mode: "browser" | "server" = "browser") => {
  const mocks = createStorage(mode);
  const hook = renderHook(
    ({ projects, activeProjectId }: { projects: Project[]; activeProjectId: string }) =>
      useProjectPersistence({
        storage: mocks.storage,
        projects,
        activeProjectId,
        initialProjects: initial,
        initialActiveProjectId: "a",
        now: () => 123,
      }),
    { initialProps: { projects: initial, activeProjectId: "a" } },
  );
  return { ...mocks, hook };
};

const flushTimers = async (ms = 1000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProjectPersistence", () => {
  it("does not save right after loading", async () => {
    const { hook, saveProject } = setup();
    hook.rerender({ projects: [{ ...initial[0], updatedAt: 999 } as Project, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).not.toHaveBeenCalled();
    expect(hook.result.current.status).toEqual({ kind: "saved", at: null });
  });

  it("marks changes dirty, then autosaves only changed projects", async () => {
    const { hook, saveProject } = setup();
    const renamed = project("a", "Renamed");
    hook.rerender({ projects: [renamed, initial[1]], activeProjectId: "a" });
    expect(hook.result.current.status).toEqual({ kind: "dirty" });

    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0]).toBe(renamed);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("debounces rapid edits into one save of the latest version", async () => {
    const { hook, saveProject } = setup();
    hook.rerender({ projects: [project("a", "A1"), initial[1]], activeProjectId: "a" });
    await flushTimers(500);
    const latest = project("a", "A2");
    hook.rerender({ projects: [latest, initial[1]], activeProjectId: "a" });
    await flushTimers(1000);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0][0]).toBe(latest);
  });

  it("deletes removed projects and saves meta changes", async () => {
    const { hook, deleteProject, saveMeta } = setup();
    hook.rerender({ projects: [initial[0]], activeProjectId: "a" });
    await flushTimers();
    expect(deleteProject).toHaveBeenCalledWith("b");
    expect(saveMeta).toHaveBeenCalledWith("a", ["a"]);
  });

  it("saves immediately on Save now and pins the active project in server mode", async () => {
    const { hook, saveProject } = setup("server");
    await act(async () => {
      await hook.result.current.saveNow();
    });
    expect(saveProject).toHaveBeenCalledWith(initial[0], { pin: true, label: "Saved" });
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("does not force a save on Save now in browser mode when nothing changed", async () => {
    const { hook, saveProject } = setup("browser");
    await act(async () => {
      await hook.result.current.saveNow();
    });
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("shows errors and recovers on retry", async () => {
    const { hook, saveProject } = setup();
    saveProject.mockRejectedValueOnce(new StorageError("Browser storage is full"));
    hook.rerender({ projects: [project("a", "big"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "error", message: "Browser storage is full" });

    await act(async () => {
      await hook.result.current.retry();
    });
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("pauses on conflict until Keep mine", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    const mine = project("a", "mine");
    hook.rerender({ projects: [mine, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(hook.result.current.status).toEqual({ kind: "conflict", projectId: "a", revision: 7, savedAt: 50 });

    hook.rerender({ projects: [project("a", "mine again"), initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(saveProject).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "mine again" }),
      { baseRevision: 7, pinPrevious: true },
    );
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("resets the baseline with markSaved", async () => {
    const { hook, saveProject } = setup("server");
    saveProject.mockResolvedValueOnce({ ok: false, conflict: { revision: 7, savedAt: 50 } });
    hook.rerender({ projects: [project("a", "mine"), initial[1]], activeProjectId: "a" });
    await flushTimers();

    const theirs = project("a", "theirs");
    act(() => {
      hook.result.current.markSaved([theirs, initial[1]], "a");
    });
    hook.rerender({ projects: [theirs, initial[1]], activeProjectId: "a" });
    await flushTimers();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toEqual({ kind: "saved", at: 123 });
  });

  it("guards page unload", async () => {
    const server = setup("server");
    server.hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const serverEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(serverEvent);
    expect(serverEvent.defaultPrevented).toBe(true);
    expect(server.saveProjectOnUnload).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
    server.hook.unmount();

    const browser = setup("browser");
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    browser.hook.rerender({ projects: [project("a", "unsaved"), initial[1]], activeProjectId: "a" });
    const browserEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(browserEvent);
    expect(browserEvent.defaultPrevented).toBe(false);
    expect(browser.saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: "unsaved" }));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bunx vitest run src/lib/storage/save-plan.test.ts src/lib/storage/useProjectPersistence.test.tsx`
Expected: FAIL — cannot resolve `./save-plan` / `./useProjectPersistence`.

- [ ] **Step 4: Implement `src/lib/storage/save-plan.ts`**

```ts
/** Work out what needs saving by comparing editor projects with the last saved copy. */

import type { Project } from "../../types";

export interface SavedSnapshot {
  projects: Map<string, Project>;
  activeProjectId: string;
  order: string[];
}

export interface SavePlan {
  save: Project[];
  remove: string[];
  meta: boolean;
}

export const snapshotOf = (projects: Project[], activeProjectId: string): SavedSnapshot => ({
  projects: new Map(projects.map((project) => [project.id, project])),
  activeProjectId,
  order: projects.map((project) => project.id),
});

const IGNORED_FIELDS = new Set(["updatedAt"]);

/**
 * The editor rebuilds the active project object (and stamps updatedAt) whenever
 * its state syncs, but unchanged fields keep their references — so a shallow
 * compare is both cheap and accurate.
 */
export const sameProjectContent = (a: Project, b: Project): boolean => {
  if (a === b) return true;
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (!IGNORED_FIELDS.has(key) && left[key] !== right[key]) return false;
  }
  return true;
};

export const planSave = (previous: SavedSnapshot, projects: Project[], activeProjectId: string): SavePlan => {
  const save = projects.filter((project) => {
    const saved = previous.projects.get(project.id);
    return !saved || !sameProjectContent(saved, project);
  });
  const currentIds = new Set(projects.map((project) => project.id));
  const remove = [...previous.projects.keys()].filter((id) => !currentIds.has(id));
  const order = projects.map((project) => project.id);
  const meta =
    previous.activeProjectId !== activeProjectId ||
    previous.order.length !== order.length ||
    previous.order.some((id, index) => id !== order[index]);
  return { save, remove, meta };
};

export const isEmptyPlan = (plan: SavePlan): boolean =>
  plan.save.length === 0 && plan.remove.length === 0 && !plan.meta;
```

- [ ] **Step 5: Implement `src/lib/storage/useProjectPersistence.ts`**

```ts
/**
 * Saving for the editor: debounced autosave, a visible save status, Save now,
 * conflict handling and an unload guard — over any ProjectStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../../types";
import { isEmptyPlan, planSave, snapshotOf, type SavedSnapshot } from "./save-plan";
import { StorageError, isServerStorage, type ProjectStorage } from "./types";

export const AUTOSAVE_DELAY_MS = 1000;
export const SAVE_NOW_LABEL = "Saved";

export type SaveStatus =
  | { kind: "saved"; at: number | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; projectId: string; revision: number; savedAt: number };

export interface ProjectPersistence {
  status: SaveStatus;
  saveNow(): Promise<void>;
  retry(): Promise<void>;
  keepMine(): Promise<void>;
  markSaved(projects: Project[], activeProjectId: string): void;
}

const messageOf = (error: unknown): string =>
  error instanceof StorageError ? error.message : "Couldn't save";

export function useProjectPersistence(options: {
  storage: ProjectStorage;
  projects: Project[];
  activeProjectId: string;
  initialProjects: Project[];
  initialActiveProjectId: string;
  delayMs?: number;
  now?: () => number;
}): ProjectPersistence {
  const { storage, projects, activeProjectId } = options;
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
  // Held in a ref so an inline `now` doesn't recreate callbacks every render.
  const nowRef = useRef(options.now ?? Date.now);
  nowRef.current = options.now ?? Date.now;
  const now = useCallback(() => nowRef.current(), []);

  const savedRef = useRef<SavedSnapshot>(snapshotOf(options.initialProjects, options.initialActiveProjectId));
  const latestRef = useRef({ projects, activeProjectId });
  latestRef.current = { projects, activeProjectId };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const conflictRef = useRef<Extract<SaveStatus, { kind: "conflict" }> | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: null });

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hasChanges = () =>
    !isEmptyPlan(planSave(savedRef.current, latestRef.current.projects, latestRef.current.activeProjectId));

  const runFlush = useCallback(
    async (pinActive: boolean): Promise<void> => {
      if (conflictRef.current) return;
      const { projects: current, activeProjectId: active } = latestRef.current;
      const plan = planSave(savedRef.current, current, active);
      const forcePin = pinActive && isServerStorage(storage);
      if (isEmptyPlan(plan) && !forcePin) {
        setStatus((previous) => (previous.kind === "saved" ? previous : { kind: "saved", at: now() }));
        return;
      }

      setStatus({ kind: "saving" });
      try {
        const toSave = [...plan.save];
        const activeProject = current.find((project) => project.id === active);
        if (forcePin && activeProject && !toSave.some((project) => project.id === active)) {
          toSave.push(activeProject);
        }
        for (const project of toSave) {
          const result = await storage.saveProject(
            project,
            forcePin && project.id === active ? { pin: true, label: SAVE_NOW_LABEL } : {},
          );
          if (!result.ok) {
            conflictRef.current = { kind: "conflict", projectId: project.id, ...result.conflict };
            setStatus(conflictRef.current);
            return;
          }
          savedRef.current.projects.set(project.id, project);
        }
        for (const id of plan.remove) {
          await storage.deleteProject(id);
          savedRef.current.projects.delete(id);
        }
        if (plan.meta) {
          const order = current.map((project) => project.id);
          await storage.saveMeta(active, order);
          savedRef.current.activeProjectId = active;
          savedRef.current.order = order;
        }
        setStatus(hasChanges() ? { kind: "dirty" } : { kind: "saved", at: now() });
      } catch (error) {
        setStatus({ kind: "error", message: messageOf(error) });
      }
    },
    [storage, now],
  );

  const flush = useCallback(
    async (pinActive = false): Promise<void> => {
      clearTimer();
      while (inFlightRef.current) await inFlightRef.current;
      const run = runFlush(pinActive);
      inFlightRef.current = run;
      try {
        await run;
      } finally {
        inFlightRef.current = null;
      }
    },
    [runFlush],
  );

  // Autosave: mark dirty right away, save after a quiet period.
  useEffect(() => {
    if (conflictRef.current || !hasChanges()) return;
    // Return the same object when already dirty/saving so this doesn't re-render in a loop.
    setStatus((previous) => (previous.kind === "saving" || previous.kind === "dirty" ? previous : { kind: "dirty" }));
    clearTimer();
    timerRef.current = setTimeout(() => {
      void flush();
    }, delayMs);
    return clearTimer;
  }, [projects, activeProjectId, delayMs, flush]);

  // Unload guard.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { projects: current, activeProjectId: active } = latestRef.current;
      const plan = planSave(savedRef.current, current, active);
      if (isEmptyPlan(plan) && !inFlightRef.current) return;

      if (isServerStorage(storage)) {
        for (const project of plan.save) storage.saveProjectOnUnload(project);
        event.preventDefault();
        event.returnValue = "";
        return;
      }
      // Browser storage writes synchronously inside these calls.
      for (const project of plan.save) void storage.saveProject(project).catch(() => undefined);
      for (const id of plan.remove) void storage.deleteProject(id).catch(() => undefined);
      if (plan.meta) void storage.saveMeta(active, current.map((project) => project.id)).catch(() => undefined);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [storage]);

  const saveNow = useCallback(() => flush(true), [flush]);
  const retry = useCallback(() => flush(false), [flush]);

  const keepMine = useCallback(async () => {
    const conflict = conflictRef.current;
    if (!conflict) return;
    const mine = latestRef.current.projects.find((project) => project.id === conflict.projectId);
    if (!mine) {
      conflictRef.current = null;
      await flush();
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const result = await storage.saveProject(mine, { baseRevision: conflict.revision, pinPrevious: true });
      if (!result.ok) {
        conflictRef.current = { kind: "conflict", projectId: mine.id, ...result.conflict };
        setStatus(conflictRef.current);
        return;
      }
      savedRef.current.projects.set(mine.id, mine);
      conflictRef.current = null;
      await flush();
    } catch (error) {
      setStatus({ kind: "error", message: messageOf(error) });
    }
  }, [storage, flush]);

  const markSaved = useCallback(
    (savedProjects: Project[], savedActiveProjectId: string) => {
      clearTimer();
      savedRef.current = snapshotOf(savedProjects, savedActiveProjectId);
      conflictRef.current = null;
      setStatus({ kind: "saved", at: now() });
    },
    [now],
  );

  return { status, saveNow, retry, keepMine, markSaved };
}
```

Notes for the implementer:
- `hasChanges` is defined inline (not memoized) on purpose: it reads refs, so it is always current. If `react-hooks/exhaustive-deps` lint were enabled it would complain; this repo has no ESLint.
- The conflict test's "Keep mine" saves the **latest** editor version ("mine again"), not the version that first conflicted.

- [ ] **Step 6: Run tests and type-check**

Run: `bunx vitest run src/lib/storage/save-plan.test.ts src/lib/storage/useProjectPersistence.test.tsx && bunx tsc --noEmit`
Expected: PASS (save-plan 4, hook 10); tsc exit 0; no React `act(...)` warnings in the output. If an `act` warning appears, wrap the triggering call in `act` in the test rather than changing hook timing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/save-plan.ts src/lib/storage/save-plan.test.ts src/lib/storage/useProjectPersistence.ts src/lib/storage/useProjectPersistence.test.tsx
git commit -m "Add save planner and persistence hook with status and conflicts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 11: Wire storage into the editor and startup

**Files:**
- Create: `src/context/bootstrap-editor.ts`, `src/components/Storage/StartupScreen.tsx`
- Modify: `src/context/EditorContext.tsx`, `src/routes/index.tsx`, `src/lib/useLocalStorage.ts`, `src/lib/agent-import/pipeline.ts`, `src/components/AgentImport/AgentImportModal.tsx`, `src/lib/agent-import/compile.test.ts`
- Test: `src/context/bootstrap-editor.test.ts`; update `src/lib/agent-import/pipeline.test.ts`, `src/components/AgentImport/AgentImportModal.test.tsx`

**Interfaces:**
- Consumes: Tasks 7–10 (`ProjectStorage`, `StorageMode`, `HistoryVersion`, `isServerStorage`, `resolveStorage`, `StorageNotice`, `migrateBrowserProjects`, `useProjectPersistence`, `SaveStatus`); existing `normalizeProject`, `createDefaultProject`, `activateProject`, `serializeProject`, `suggestProjectFilename`, `checkStorageBudget`.
- Produces:
  - `src/context/EditorContext.tsx`:
    - `interface StartupNotice { unwritable: boolean; migratedCount: number }`
    - `interface InitialEditorState { projects: Project[]; activeProjectId: string }`
    - `prepareInitialState(loaded: { projects: Project[]; activeProjectId: string | null }): InitialEditorState`
    - `EditorProvider` props: `{ children: ReactNode; storage: ProjectStorage; initialState: InitialEditorState; startupNotice: StartupNotice }`
    - `EditorContextType` gains: `storageMode: StorageMode`, `saveStatus: SaveStatus`, `saveNow(): Promise<void>`, `retrySave(): Promise<void>`, `keepMyVersion(): Promise<void>`, `loadTheirVersion(): Promise<void>`, `listProjectHistory(): Promise<HistoryVersion[]>`, `restoreProjectVersion(version: string): Promise<void>`, `isHistoryOpen: boolean`, `setIsHistoryOpen(open: boolean): void`, `startupNotice: StartupNotice`, `dismissStartupNotice(): void`
    - `exportProject` becomes `(id: string) => Promise<void>`
  - `src/context/bootstrap-editor.ts`:
    - `interface BootstrapResult { storage: ProjectStorage; initialState: InitialEditorState; notice: StartupNotice }`
    - `bootstrapEditor(onProgress: (message: string) => void, deps?: { resolveStorage: typeof resolveStorage; migrateBrowserProjects: typeof migrateBrowserProjects }): Promise<BootstrapResult>`
  - `src/components/Storage/StartupScreen.tsx`: `StartupScreen({ message, onRetry? }: { message: string; onRetry?: () => void })`
  - `src/lib/agent-import/pipeline.ts`: `PipelineOptions.existingStorageChars: number | null` — `null` skips the storage-budget warning
  - `src/lib/useLocalStorage.ts`: `loadPersistedState`, `savePersistedState`, `clearPersistedState`, `useEditorPersistence` removed (storage classes replace them)

**Ruling (plan):** the spec says **Replace current project** saves with `pinPrevious` in container mode. Autosave has no per-save options, so in server mode `applyAgentImport("replace")` calls `saveNow()` *before* changing state; `saveNow` captures the current project synchronously and pins it (label "Saved"). The previous content is kept in history either way; only the label differs.

- [ ] **Step 1: Write the failing bootstrap test**

Create `src/context/bootstrap-editor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../types";
import { BrowserStorage } from "../lib/storage/browser-storage";
import { createFakeServer } from "../lib/storage/fake-server";
import { createMemoryStorage } from "../lib/storage/memory-storage";
import { ServerStorage } from "../lib/storage/server-storage";
import { bootstrapEditor } from "./bootstrap-editor";
import { prepareInitialState } from "./EditorContext";

const legacyProject = (id: string) =>
  ({ id, name: id, createdAt: 1, updatedAt: 1, screenshots: [{ id: `${id}-s`, headline: "Hi" }] }) as unknown as Project;

describe("prepareInitialState", () => {
  it("creates a default project when nothing was saved", () => {
    const state = prepareInitialState({ projects: [], activeProjectId: null });
    expect(state.projects).toHaveLength(1);
    expect(state.activeProjectId).toBe(state.projects[0].id);
  });

  it("normalizes projects and falls back to the first project", () => {
    const state = prepareInitialState({ projects: [legacyProject("a"), legacyProject("b")], activeProjectId: "gone" });
    expect(state.activeProjectId).toBe("a");
    expect(state.projects[0].screenshots[0].devices.length).toBeGreaterThan(0);
    expect(state.projects[0].textDefaults).toBeDefined();
  });
});

describe("bootstrapEditor", () => {
  it("loads browser storage without migrating", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    const migrate = vi.fn();
    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate,
    });
    expect(migrate).not.toHaveBeenCalled();
    expect(result.storage).toBe(storage);
    expect(result.notice).toEqual({ unwritable: false, migratedCount: 0 });
    expect(result.initialState.projects).toHaveLength(1);
  });

  it("passes the unwritable notice through", async () => {
    const storage = new BrowserStorage(createMemoryStorage());
    const result = await bootstrapEditor(() => {}, {
      resolveStorage: async () => ({ storage, notice: "unwritable" }),
      migrateBrowserProjects: vi.fn(),
    });
    expect(result.notice.unwritable).toBe(true);
  });

  it("migrates into an empty container and reloads", async () => {
    const server = createFakeServer();
    const storage = new ServerStorage(server.fetch);
    const progress = vi.fn();
    const migrate = vi.fn(async (options: { server: typeof storage; serverProjectCount: number }) => {
      expect(options.serverProjectCount).toBe(0);
      server.projects.set("moved", { revision: 1, project: legacyProject("moved") });
      server.state.activeProjectId = "moved";
      return 1;
    });

    const result = await bootstrapEditor(progress, {
      resolveStorage: async () => ({ storage, notice: null }),
      migrateBrowserProjects: migrate as never,
    });

    expect(progress).toHaveBeenCalledWith("Moving projects into the container…");
    expect(result.notice.migratedCount).toBe(1);
    expect(result.initialState.activeProjectId).toBe("moved");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/context/bootstrap-editor.test.ts`
Expected: FAIL — cannot resolve `./bootstrap-editor` / `prepareInitialState` not exported.

- [ ] **Step 3: Rework `EditorContext.tsx` startup state**

1. Replace the `useLocalStorage` import block:

```ts
import {
  loadPersistedState,
  useEditorPersistence,
  clearPersistedState,
} from "../lib/useLocalStorage";
```

with:

```ts
import {
  isServerStorage,
  type HistoryVersion,
  type ProjectStorage,
  type StorageMode,
} from "../lib/storage/types";
import { useProjectPersistence, type SaveStatus } from "../lib/storage/useProjectPersistence";
```

2. Replace the block from `// Load persisted state once on module load` through the end of `getInitialActiveProjectId` with:

```ts
export interface StartupNotice {
  /** The container's storage isn't writable, so this session saves to the browser. */
  unwritable: boolean;
  /** Projects moved from this browser into the container on this startup. */
  migratedCount: number;
}

export interface InitialEditorState {
  projects: Project[];
  activeProjectId: string;
}

export const prepareInitialState = (loaded: {
  projects: Project[];
  activeProjectId: string | null;
}): InitialEditorState => {
  const projects =
    loaded.projects.length > 0 ? loaded.projects.map(normalizeProject) : [createDefaultProject()];
  const activeProjectId =
    loaded.activeProjectId && projects.some((p) => p.id === loaded.activeProjectId)
      ? loaded.activeProjectId
      : projects[0].id;
  return { projects, activeProjectId };
};
```

3. Change the provider signature and initial state:

```tsx
export const EditorProvider = ({
  children,
  storage,
  initialState,
  startupNotice,
}: {
  children: ReactNode;
  storage: ProjectStorage;
  initialState: InitialEditorState;
  startupNotice: StartupNotice;
}) => {
  // Project state
  const [projects, setProjects] = useState<Project[]>(initialState.projects);
  const [activeProjectId, setActiveProjectId] = useState(initialState.activeProjectId);
```

4. After `const [isAgentImportOpen, setIsAgentImportOpen] = useState(false);` add:

```ts
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<StartupNotice>(startupNotice);
```

5. Replace

```ts
  // Auto-save projects to localStorage
  useEditorPersistence({
    projects,
    activeProjectId,
  });
```

with:

```ts
  // Save through the resolved storage (container or browser).
  const persistence = useProjectPersistence({
    storage,
    projects,
    activeProjectId,
    initialProjects: initialState.projects,
    initialActiveProjectId: initialState.activeProjectId,
  });
```

- [ ] **Step 4: Add conflict, history, export and reset behavior**

1. Replace `exportProject` with:

```ts
  const exportProject = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    // Container projects reference /api/images URLs; embed them so the backup stands alone.
    const portable = isServerStorage(storage) ? await storage.inlineProjectImages(project) : project;
    const blob = new Blob([serializeProject(portable)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestProjectFilename(portable.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
```

2. In `applyAgentImport`, directly after `const normalized = normalizeProject(compiled);`, add:

```ts
    // Container mode: pin the current content in history before replacing it.
    // saveNow() reads the current project synchronously, before the state below changes.
    if (mode === "replace" && isServerStorage(storage)) {
      void persistence.saveNow();
    }
```

3. After `applyAgentImport`, add:

```ts
  // Put a project loaded from storage back into the workspace as the saved copy.
  const replaceProjectFromStorage = (loaded: Project) => {
    const normalized = normalizeProject(loaded);
    const nextProjects = projects.map((p) => (p.id === normalized.id ? normalized : p));
    setProjects(nextProjects);
    if (normalized.id === activeProjectId) activateProject(normalized);
    persistence.markSaved(nextProjects, activeProjectId);
  };

  const loadTheirVersion = async () => {
    const status = persistence.status;
    if (status.kind !== "conflict" || !isServerStorage(storage)) return;
    const mine = projects.find((p) => p.id === status.projectId);
    if (mine) await storage.addHistory(mine, "Discarded local changes");
    const theirs = await storage.reloadProject(status.projectId);
    if (theirs) replaceProjectFromStorage(theirs);
  };

  const listProjectHistory = async (): Promise<HistoryVersion[]> =>
    isServerStorage(storage) ? storage.listHistory(activeProjectId) : [];

  const restoreProjectVersion = async (version: string) => {
    if (!isServerStorage(storage)) return;
    await persistence.retry(); // save pending edits so the restore pins them
    const restored = await storage.restoreVersion(activeProjectId, version);
    replaceProjectFromStorage(restored);
  };
```

4. In `resetEditor`, replace `clearPersistedState();` with `void storage.resetAll().catch(() => undefined);`.

5. In `interface EditorContextType`, change `exportProject: (id: string) => void;` to `exportProject: (id: string) => Promise<void>;` and add after `setIsAgentImportOpen: (open: boolean) => void;`:

```ts
  /** Where projects are saved this session */
  storageMode: StorageMode;
  saveStatus: SaveStatus;
  saveNow: () => Promise<void>;
  retrySave: () => Promise<void>;
  keepMyVersion: () => Promise<void>;
  loadTheirVersion: () => Promise<void>;
  listProjectHistory: () => Promise<HistoryVersion[]>;
  restoreProjectVersion: (version: string) => Promise<void>;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  startupNotice: StartupNotice;
  dismissStartupNotice: () => void;
```

6. In the provider `value`, after `setIsAgentImportOpen,` add:

```ts
        storageMode: storage.mode,
        saveStatus: persistence.status,
        saveNow: persistence.saveNow,
        retrySave: persistence.retry,
        keepMyVersion: persistence.keepMine,
        loadTheirVersion,
        listProjectHistory,
        restoreProjectVersion,
        isHistoryOpen,
        setIsHistoryOpen,
        startupNotice: notice,
        dismissStartupNotice: () => setNotice({ unwritable: false, migratedCount: 0 }),
```

- [ ] **Step 5: Remove the old persistence helpers**

In `src/lib/useLocalStorage.ts`, delete `loadPersistedState`, `savePersistedState`, `clearPersistedState`, `AUTO_SAVE_DELAY`, `UseEditorPersistenceOptions`, `useEditorPersistence`, and the now-unused `import { useEffect, useCallback, useRef } from "react";`. Keep `PersistedEditorState`, `CURRENT_VERSION`, `STORAGE_KEY`, `migratePersistedState`; update the file header comment to "Persisted editor state shape and migration for browser storage."

In `src/lib/agent-import/compile.test.ts`, remove the `vi.mock("../useLocalStorage", ...)` block (importing `EditorContext` no longer reads storage) and drop `vi` from the vitest import if unused.

- [ ] **Step 6: Implement `src/context/bootstrap-editor.ts`**

```ts
/** Startup: pick storage, move browser projects into an empty container, load. */

import { migrateBrowserProjects } from "../lib/storage/migrate";
import { resolveStorage } from "../lib/storage/resolve-storage";
import type { ProjectStorage } from "../lib/storage/types";
import {
  normalizeProject,
  prepareInitialState,
  type InitialEditorState,
  type StartupNotice,
} from "./EditorContext";

export interface BootstrapResult {
  storage: ProjectStorage;
  initialState: InitialEditorState;
  notice: StartupNotice;
}

export const bootstrapEditor = async (
  onProgress: (message: string) => void,
  deps: { resolveStorage: typeof resolveStorage; migrateBrowserProjects: typeof migrateBrowserProjects } = {
    resolveStorage,
    migrateBrowserProjects,
  },
): Promise<BootstrapResult> => {
  const { storage, notice } = await deps.resolveStorage();
  let loaded = await storage.load();
  let migratedCount = 0;

  if (storage.mode === "server") {
    onProgress("Moving projects into the container…");
    migratedCount = await deps.migrateBrowserProjects({
      server: storage,
      serverProjectCount: loaded.projects.length,
      normalize: normalizeProject,
    });
    if (migratedCount > 0) loaded = await storage.load();
  }

  return {
    storage,
    initialState: prepareInitialState(loaded),
    notice: { unwritable: notice === "unwritable", migratedCount },
  };
};
```

- [ ] **Step 7: Startup screen and route**

Create `src/components/Storage/StartupScreen.tsx`:

```tsx
/** Shown while projects load, or when loading fails. */

export const StartupScreen = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-base text-sm text-zinc-300">
    <p role={onRetry ? "alert" : "status"}>{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500"
      >
        Try again
      </button>
    )}
  </div>
);
```

Replace `src/routes/index.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadGoogleFonts } from "../lib/google-fonts";
import { EditorProvider } from "../context/EditorContext";
import { EditorLayout } from "../components/EditorLayout";
import { StartupScreen } from "../components/Storage/StartupScreen";
import { bootstrapEditor, type BootstrapResult } from "../context/bootstrap-editor";

type BootState =
  | { kind: "loading"; message: string }
  | { kind: "failed"; message: string }
  | ({ kind: "ready" } & BootstrapResult);

// One bootstrap per attempt, shared across React StrictMode's double effects so
// migration can never run twice at once.
let pending: { attempt: number; promise: Promise<BootstrapResult> } | null = null;
const startBootstrap = (attempt: number, onProgress: (message: string) => void) => {
  if (!pending || pending.attempt !== attempt) {
    pending = { attempt, promise: bootstrapEditor(onProgress) };
  }
  return pending.promise;
};

const RouteComponent = () => {
  const [attempt, setAttempt] = useState(0);
  const [boot, setBoot] = useState<BootState>({ kind: "loading", message: "Loading projects…" });

  useEffect(() => {
    loadGoogleFonts();
  }, []);

  useEffect(() => {
    let active = true;
    startBootstrap(attempt, (message) => {
      if (active) setBoot({ kind: "loading", message });
    })
      .then((result) => {
        if (active) setBoot({ kind: "ready", ...result });
      })
      .catch((error: unknown) => {
        if (active) {
          setBoot({
            kind: "failed",
            message: error instanceof Error ? error.message : "Couldn't load projects",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (boot.kind === "loading") return <StartupScreen message={boot.message} />;
  if (boot.kind === "failed") {
    return (
      <StartupScreen
        message={boot.message}
        onRetry={() => {
          setBoot({ kind: "loading", message: "Loading projects…" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <EditorProvider storage={boot.storage} initialState={boot.initialState} startupNotice={boot.notice}>
      <EditorLayout />
    </EditorProvider>
  );
};

export const Route = createFileRoute("/")({
  component: RouteComponent,
});
```

- [ ] **Step 8: Storage warning only in browser mode**

In `src/lib/agent-import/pipeline.ts`:
- change `existingStorageChars: number;` to `existingStorageChars: number | null;` with comment `/** Characters already in browser storage; null when projects are stored in the container. */`
- change `const storage = checkStorageBudget(existingStorageChars, project);` to
  `const storage = existingStorageChars === null ? null : checkStorageBudget(existingStorageChars, project);`

In `src/lib/agent-import/pipeline.test.ts`, add inside `describe("runAgentImport", ...)`:

```ts
  it("skips the storage warning when projects are stored in the container", async () => {
    const result = await runAgentImport(
      [manifest([{ image: "01.png", headline: "Hi" }]), png("01.png")],
      { ...options(stubReadImage()), existingStorageChars: null },
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.storageWarning).toBeNull();
  });
```

In `src/components/AgentImport/AgentImportModal.tsx`:
- destructure `storageMode` from `useEditor()` alongside `projects`, `applyAgentImport`
- change `existingStorageChars: JSON.stringify(projects).length,` to `existingStorageChars: storageMode === "browser" ? JSON.stringify(projects).length : null,`

In `src/components/AgentImport/AgentImportModal.test.tsx`:
- in `beforeEach`, change the mock to `useEditorMock.mockReturnValue({ projects: [], applyAgentImport, storageMode: "browser" });`
- add:

```tsx
  it("doesn't measure browser storage when projects live in the container", async () => {
    useEditorMock.mockReturnValue({ projects: [], applyAgentImport, storageMode: "server" });
    runAgentImportMock.mockResolvedValue({ ok: true, project, warnings: [], storageWarning: null });
    render(<AgentImportModal isOpen onClose={vi.fn()} />);
    pickFiles();
    await screen.findByText("Habitly");
    expect(runAgentImportMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ existingStorageChars: null }),
    );
  });
```

- [ ] **Step 9: Run tests, type-check, build**

Run: `bunx vitest run src/context src/lib/agent-import src/components/AgentImport src/lib/storage && bun run build`
Expected: all PASS; build exits 0. Then run `bun run test` once — all pass with no new stderr.

- [ ] **Step 10: Commit**

```bash
git add src/context src/routes/index.tsx src/components/Storage/StartupScreen.tsx src/lib/useLocalStorage.ts src/lib/agent-import/pipeline.ts src/lib/agent-import/pipeline.test.ts src/lib/agent-import/compile.test.ts src/components/AgentImport/AgentImportModal.tsx src/components/AgentImport/AgentImportModal.test.tsx
git commit -m "Load and save projects through the resolved storage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 12: Save indicator, banners, ⌘S

**Files:**
- Create: `src/components/Storage/SaveIndicator.tsx`, `src/components/Storage/StorageBanners.tsx`
- Modify: `src/lib/keyboard-shortcuts.ts`, `src/components/ShortcutsModal.tsx`, `src/components/LeftSidebar/LeftSidebar.tsx`, `src/components/EditorLayout.tsx`
- Test: `src/components/Storage/SaveIndicator.test.tsx`, `src/components/Storage/StorageBanners.test.tsx`; update `src/lib/keyboard-shortcuts.test.ts`

**Interfaces:**
- Consumes: Task 10 `SaveStatus`; Task 7 `StorageMode`; Task 11 context fields (`storageMode`, `saveStatus`, `saveNow`, `retrySave`, `keepMyVersion`, `loadTheirVersion`, `setIsHistoryOpen`, `startupNotice`, `dismissStartupNotice`) and `StartupNotice`.
- Produces:
  - `ShortcutAction` gains `"save"` (⌘/Ctrl+S, resolved even while typing so the browser's save dialog never opens)
  - `formatSavedAt(at: number | null, now: number): string`
  - `SaveIndicator(props: { status: SaveStatus; storageMode: StorageMode; onSaveNow(): void; onRetry(): void; onOpenHistory(): void; now?: () => number })`
  - `StorageBanners(props: { notice: StartupNotice; conflict: Extract<SaveStatus, { kind: "conflict" }> | null; conflictProjectName: string | null; onDismissNotice(): void; onKeepMine(): Promise<void>; onLoadTheirs(): Promise<void> })`

Copy (verbatim): **Unsaved changes**, **Saving…**, **Saved**, **Saved · just now**, **Saved · N min ago**, **Couldn't save**, **Changed elsewhere**, **Save now**, **Retry**; banners "Container storage isn't writable — saving to this browser instead.", "Moved N project(s) from this browser into the container.", "“NAME” was changed in another tab or device.", **Load their version**, **Keep mine**, **Dismiss**.

- [ ] **Step 1: Write the failing tests**

In `src/lib/keyboard-shortcuts.test.ts`, add inside `describe("resolveShortcut", ...)`:

```ts
  it("maps Ctrl/Cmd+S to save, even while typing", () => {
    expect(resolveShortcut(evt({ key: "s", metaKey: true }), { isEditable: false })).toBe("save");
    expect(resolveShortcut(evt({ key: "S", ctrlKey: true }), { isEditable: true })).toBe("save");
    expect(resolveShortcut(evt({ key: "s" }), { isEditable: false })).toBeNull();
  });
```

Create `src/components/Storage/SaveIndicator.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";
import { SaveIndicator, formatSavedAt } from "./SaveIndicator";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();

const renderIndicator = (status: SaveStatus, storageMode: "server" | "browser" = "server") => {
  const handlers = { onSaveNow: vi.fn(), onRetry: vi.fn(), onOpenHistory: vi.fn() };
  render(<SaveIndicator status={status} storageMode={storageMode} now={() => NOW} {...handlers} />);
  return handlers;
};

describe("formatSavedAt", () => {
  it("describes how long ago the last save was", () => {
    expect(formatSavedAt(null, NOW)).toBe("Saved");
    expect(formatSavedAt(NOW - 10_000, NOW)).toBe("Saved · just now");
    expect(formatSavedAt(NOW - 5 * 60_000, NOW)).toBe("Saved · 5 min ago");
    expect(formatSavedAt(NOW - 3 * 3_600_000, NOW)).toMatch(/^Saved · \d{1,2}:\d{2}/);
  });
});

describe("SaveIndicator", () => {
  it("shows each save state", () => {
    const { unmount } = render(
      <SaveIndicator status={{ kind: "dirty" }} storageMode="browser" onSaveNow={vi.fn()} onRetry={vi.fn()} onOpenHistory={vi.fn()} />,
    );
    expect(screen.getByText("Unsaved changes")).not.toBeNull();
    unmount();

    renderIndicator({ kind: "saving" });
    expect(screen.getByText("Saving…")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers Retry only after an error", () => {
    const handlers = renderIndicator({ kind: "error", message: "Browser storage is full" });
    expect(screen.getByText("Couldn't save")).not.toBeNull();
    expect(screen.getByTitle("Browser storage is full")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows conflicts", () => {
    renderIndicator({ kind: "conflict", projectId: "p", revision: 3, savedAt: 1 });
    expect(screen.getByText("Changed elsewhere")).not.toBeNull();
  });

  it("saves now and opens history in container mode only", () => {
    const handlers = renderIndicator({ kind: "saved", at: NOW });
    expect(screen.getByText("Saved · just now")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(handlers.onSaveNow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(handlers.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("hides history in browser mode", () => {
    renderIndicator({ kind: "saved", at: null }, "browser");
    expect(screen.queryByRole("button", { name: "Version history" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
```

Create `src/components/Storage/StorageBanners.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageBanners } from "./StorageBanners";

const baseProps = {
  notice: { unwritable: false, migratedCount: 0 },
  conflict: null,
  conflictProjectName: null,
  onDismissNotice: vi.fn(),
  onKeepMine: vi.fn(async () => {}),
  onLoadTheirs: vi.fn(async () => {}),
};

describe("StorageBanners", () => {
  it("renders nothing without notices or conflicts", () => {
    const { container } = render(<StorageBanners {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it("explains unwritable container storage", () => {
    const onDismissNotice = vi.fn();
    render(<StorageBanners {...baseProps} notice={{ unwritable: true, migratedCount: 0 }} onDismissNotice={onDismissNotice} />);
    expect(screen.getByText("Container storage isn't writable — saving to this browser instead.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("reports migrated projects with correct plurals", () => {
    const { unmount } = render(<StorageBanners {...baseProps} notice={{ unwritable: false, migratedCount: 1 }} />);
    expect(screen.getByText("Moved 1 project from this browser into the container.")).not.toBeNull();
    unmount();
    render(<StorageBanners {...baseProps} notice={{ unwritable: false, migratedCount: 3 }} />);
    expect(screen.getByText("Moved 3 projects from this browser into the container.")).not.toBeNull();
  });

  it("resolves conflicts and shows failures", async () => {
    const onKeepMine = vi.fn(async () => {});
    const onLoadTheirs = vi.fn(async () => {
      throw new Error("Can't reach the AppShots server");
    });
    render(
      <StorageBanners
        {...baseProps}
        conflict={{ kind: "conflict", projectId: "p", revision: 2, savedAt: 1 }}
        conflictProjectName="Habitly"
        onKeepMine={onKeepMine}
        onLoadTheirs={onLoadTheirs}
      />,
    );
    expect(screen.getByText("“Habitly” was changed in another tab or device.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(onKeepMine).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Load their version" }));
    expect(await screen.findByText("Can't reach the AppShots server")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run src/lib/keyboard-shortcuts.test.ts src/components/Storage`
Expected: FAIL — `save` not resolved; cannot resolve `./SaveIndicator` / `./StorageBanners`.

- [ ] **Step 3: Add the save shortcut**

In `src/lib/keyboard-shortcuts.ts`:
- change the type to `export type ShortcutAction = "undo" | "redo" | "delete" | "export" | "help" | "save";`
- at the top of `resolveShortcut`, before `if (isEditable) return null;`, add:

```ts
  // Save works everywhere, including while typing, so the browser's own
  // "Save page" dialog never opens.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") return "save";
```

In `src/components/ShortcutsModal.tsx`, add `{ keys: "Ctrl / ⌘ + S", label: "Save now" },` as the first entry of `SHORTCUTS`.

- [ ] **Step 4: Implement `SaveIndicator.tsx`**

```tsx
/** Save status for the current session: unsaved, saving, saved, failed or in conflict. */

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { StorageMode } from "../../lib/storage/types";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const formatSavedAt = (at: number | null, now: number): string => {
  if (at === null) return "Saved";
  const age = now - at;
  if (age < MINUTE) return "Saved · just now";
  if (age < HOUR) return `Saved · ${Math.floor(age / MINUTE)} min ago`;
  return `Saved · ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

const BUTTON =
  "rounded-md px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent";

export const SaveIndicator = ({
  status,
  storageMode,
  onSaveNow,
  onRetry,
  onOpenHistory,
  now = Date.now,
}: {
  status: SaveStatus;
  storageMode: StorageMode;
  onSaveNow: () => void;
  onRetry: () => void;
  onOpenHistory: () => void;
  now?: () => number;
}) => {
  // Re-render periodically so "just now" ages.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const where = storageMode === "server" ? "Projects are saved in the container" : "Projects are saved in this browser";

  let dot = "bg-emerald-500";
  let label = "";
  let title = where;
  switch (status.kind) {
    case "dirty":
      dot = "bg-amber-400";
      label = "Unsaved changes";
      break;
    case "saving":
      dot = "bg-zinc-400 animate-pulse";
      label = "Saving…";
      break;
    case "saved":
      label = formatSavedAt(status.at, now());
      break;
    case "error":
      dot = "bg-red-500";
      label = "Couldn't save";
      title = status.message;
      break;
    case "conflict":
      dot = "bg-red-500";
      label = "Changed elsewhere";
      break;
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-400">
      <span role="status" aria-live="polite" title={title} className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {status.kind === "error" && (
          <button type="button" className={BUTTON} onClick={onRetry}>
            Retry
          </button>
        )}
        <button
          type="button"
          className={BUTTON}
          onClick={onSaveNow}
          disabled={status.kind === "saving" || status.kind === "conflict"}
        >
          Save now
        </button>
        {storageMode === "server" && (
          <button type="button" className={BUTTON} onClick={onOpenHistory} aria-label="Version history">
            <History className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );
};
```

- [ ] **Step 5: Implement `StorageBanners.tsx`**

```tsx
/** Startup notices and save-conflict resolution shown above the editor. */

import { useState } from "react";
import type { StartupNotice } from "../../context/EditorContext";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";

const BAR = "flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs";
const ACTION = "rounded-md border border-white/15 px-2.5 py-1 font-medium hover:bg-white/10 disabled:opacity-50";

export const StorageBanners = ({
  notice,
  conflict,
  conflictProjectName,
  onDismissNotice,
  onKeepMine,
  onLoadTheirs,
}: {
  notice: StartupNotice;
  conflict: Extract<SaveStatus, { kind: "conflict" }> | null;
  conflictProjectName: string | null;
  onDismissNotice: () => void;
  onKeepMine: () => Promise<void>;
  onLoadTheirs: () => Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!notice.unwritable && notice.migratedCount === 0 && !conflict) return null;

  const resolve = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  const moved = notice.migratedCount;

  return (
    <div className="shrink-0">
      {notice.unwritable && (
        <div role="alert" className={`${BAR} bg-amber-500/15 text-amber-200`}>
          <span>Container storage isn't writable — saving to this browser instead.</span>
          <button type="button" className={ACTION} onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {moved > 0 && (
        <div role="status" className={`${BAR} bg-emerald-500/15 text-emerald-200`}>
          <span>
            Moved {moved} {moved === 1 ? "project" : "projects"} from this browser into the container.
          </span>
          <button type="button" className={ACTION} onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {conflict && (
        <div role="alert" className={`${BAR} bg-red-500/15 text-red-200`}>
          <span>“{conflictProjectName ?? "This project"}” was changed in another tab or device.</span>
          <button type="button" className={ACTION} disabled={pending} onClick={() => void resolve(onLoadTheirs)}>
            Load their version
          </button>
          <button type="button" className={ACTION} disabled={pending} onClick={() => void resolve(onKeepMine)}>
            Keep mine
          </button>
          {error && <span className="text-red-300">{error}</span>}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 6: Mount in the sidebar and layout**

In `src/components/LeftSidebar/LeftSidebar.tsx`:
- add `import { SaveIndicator } from "../Storage/SaveIndicator";`
- add `storageMode, saveStatus, saveNow, retrySave, setIsHistoryOpen,` to the `useEditor()` destructure
- inside the Project Switcher `div`, after `<ProjectSwitcher />`, add:

```tsx
        <SaveIndicator
          status={saveStatus}
          storageMode={storageMode}
          onSaveNow={() => void saveNow()}
          onRetry={() => void retrySave()}
          onOpenHistory={() => setIsHistoryOpen(true)}
        />
```

In `src/components/EditorLayout.tsx`:
- add `import { StorageBanners } from "./Storage/StorageBanners";`
- add `projects, saveNow, saveStatus, startupNotice, dismissStartupNotice, keepMyVersion, loadTheirVersion,` to the `useEditor()` destructure
- add `save: () => void saveNow(),` to the `useKeyboardShortcuts({ ... })` handlers
- directly after the `{showBanner && ( ... )}` block, add:

```tsx
      <StorageBanners
        notice={startupNotice}
        conflict={saveStatus.kind === "conflict" ? saveStatus : null}
        conflictProjectName={
          saveStatus.kind === "conflict"
            ? (projects.find((project) => project.id === saveStatus.projectId)?.name ?? null)
            : null
        }
        onDismissNotice={dismissStartupNotice}
        onKeepMine={keepMyVersion}
        onLoadTheirs={loadTheirVersion}
      />
```

- [ ] **Step 7: Run tests, type-check, commit**

Run: `bunx vitest run src/lib/keyboard-shortcuts.test.ts src/components/Storage && bun run build`
Expected: PASS (keyboard +1, SaveIndicator 6, StorageBanners 4); build exit 0. Then `bun run test` — all pass.

```bash
git add src/lib/keyboard-shortcuts.ts src/lib/keyboard-shortcuts.test.ts src/components/ShortcutsModal.tsx src/components/Storage/SaveIndicator.tsx src/components/Storage/SaveIndicator.test.tsx src/components/Storage/StorageBanners.tsx src/components/Storage/StorageBanners.test.tsx src/components/LeftSidebar/LeftSidebar.tsx src/components/EditorLayout.tsx
git commit -m "Show save status, conflict banners and add Save now shortcut

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 13: Version history panel

**Files:**
- Create: `src/components/Storage/HistoryPanel.tsx`
- Modify: `src/components/EditorLayout.tsx`
- Test: `src/components/Storage/HistoryPanel.test.tsx`

**Interfaces:**
- Consumes: Task 7 `HistoryVersion`; Task 11 context `isHistoryOpen`, `setIsHistoryOpen`, `listProjectHistory`, `restoreProjectVersion`, `activeProjectId`; existing `useModalDismiss`.
- Produces:
  - `formatVersionTime(savedAt: number, now: number): string` → `"Today 3:42 PM"`, `"Yesterday 9:05 AM"`, or `"Sep 12 4:10 PM"` (locale time format)
  - `HistoryPanel(props: { isOpen: boolean; projectId: string; onClose(): void; loadHistory(): Promise<HistoryVersion[]>; onRestore(version: string): Promise<void>; now?: () => number })`

The panel reloads only when it opens or `projectId` changes; `loadHistory` is read through a ref because the context recreates its functions on every render.

Copy (verbatim): heading **Version history**; "Loading versions…"; "No versions yet. Versions are saved as you work."; **Restore**; "Replace current content with this version? Your current state is saved to history first."; **Restore this version**; **Cancel**; **Try again**; pinned marker `aria-label="Pinned"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/Storage/HistoryPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryVersion } from "../../lib/storage/types";
import { HistoryPanel, formatVersionTime } from "./HistoryPanel";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();
const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0).getTime();

const versions: HistoryVersion[] = [
  { version: `${at(15, 11)}-9`, revision: 9, savedAt: at(15, 11), pinned: true, label: "Saved", screenCount: 9, firstHeadline: "Build habits that stick" },
  { version: `${at(14, 9)}-4`, revision: 4, savedAt: at(14, 9), pinned: false, screenCount: 1, firstHeadline: "" },
];

const renderPanel = (overrides: Partial<Parameters<typeof HistoryPanel>[0]> = {}) => {
  const props = {
    isOpen: true,
    projectId: "p1",
    onClose: vi.fn(),
    loadHistory: vi.fn(async () => versions),
    onRestore: vi.fn(async () => {}),
    now: () => NOW,
    ...overrides,
  };
  render(<HistoryPanel {...props} />);
  return props;
};

describe("formatVersionTime", () => {
  it("uses Today, Yesterday or a date", () => {
    expect(formatVersionTime(at(15, 11), NOW)).toMatch(/^Today /);
    expect(formatVersionTime(at(14, 9), NOW)).toMatch(/^Yesterday /);
    expect(formatVersionTime(at(12, 16), NOW)).not.toMatch(/^(Today|Yesterday)/);
  });
});

describe("HistoryPanel", () => {
  it("renders nothing when closed", () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists versions with screens, headline, pin and label", async () => {
    renderPanel();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/9 screens/)).not.toBeNull();
    expect(within(items[0]).getByText("“Build habits that stick”")).not.toBeNull();
    expect(within(items[0]).getByLabelText("Pinned")).not.toBeNull();
    expect(within(items[0]).getByText("Saved")).not.toBeNull();
    expect(within(items[1]).getByText(/1 screen$/)).not.toBeNull();
    expect(within(items[1]).queryByLabelText("Pinned")).toBeNull();
  });

  it("shows an empty state", async () => {
    renderPanel({ loadHistory: vi.fn(async () => []) });
    expect(await screen.findByText("No versions yet. Versions are saved as you work.")).not.toBeNull();
  });

  it("shows load errors and retries", async () => {
    const loadHistory = vi
      .fn<() => Promise<HistoryVersion[]>>()
      .mockRejectedValueOnce(new Error("Loading history failed (500)"))
      .mockResolvedValueOnce(versions);
    renderPanel({ loadHistory });
    expect(await screen.findByText("Loading history failed (500)")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("confirms before restoring, then closes", async () => {
    const props = renderPanel();
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[1]).getByRole("button", { name: "Restore" }));
    expect(screen.getByText("Replace current content with this version? Your current state is saved to history first.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Replace current content/)).toBeNull();

    fireEvent.click(within(items[1]).getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    await waitFor(() => expect(props.onRestore).toHaveBeenCalledWith(versions[1].version));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the panel open and shows the error when restore fails", async () => {
    const props = renderPanel({
      onRestore: vi.fn(async () => {
        throw new Error("Restoring a version failed (404)");
      }),
    });
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[0]).getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    expect(await screen.findByText("Restoring a version failed (404)")).not.toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("loads once per open, not on every render", async () => {
    const loadHistory = vi.fn(async () => versions);
    const props = { isOpen: true, projectId: "p1", onClose: vi.fn(), onRestore: vi.fn(async () => {}), now: () => NOW };
    const { rerender } = render(<HistoryPanel {...props} loadHistory={loadHistory} />);
    await screen.findAllByRole("listitem");
    rerender(<HistoryPanel {...props} loadHistory={vi.fn(async () => versions)} />);
    rerender(<HistoryPanel {...props} loadHistory={vi.fn(async () => versions)} />);
    expect(loadHistory).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/components/Storage/HistoryPanel.test.tsx`
Expected: FAIL — cannot resolve `./HistoryPanel`.

- [ ] **Step 3: Implement `HistoryPanel.tsx`**

```tsx
/** Side panel listing saved versions of the active project, with restore. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, X } from "lucide-react";
import type { HistoryVersion } from "../../lib/storage/types";
import { useModalDismiss } from "../../lib/useModalDismiss";

export const formatVersionTime = (savedAt: number, now: number): string => {
  const date = new Date(savedAt);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};

const BUTTON =
  "rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-50";

export const HistoryPanel = ({
  isOpen,
  projectId,
  onClose,
  loadHistory,
  onRestore,
  now = Date.now,
}: {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  loadHistory: () => Promise<HistoryVersion[]>;
  onRestore: (version: string) => Promise<void>;
  now?: () => number;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(loadHistory);
  loadRef.current = loadHistory;
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useModalDismiss({ isOpen, onClose, containerRef: panelRef });

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setVersions(null);
    setError(null);
    setConfirming(null);
    loadRef
      .current()
      .then((loaded) => {
        if (active) setVersions(loaded);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Couldn't load history");
      });
    return () => {
      active = false;
    };
  }, [isOpen, projectId, reloadKey]);

  if (!isOpen) return null;

  const restore = async (version: string) => {
    setRestoring(true);
    setError(null);
    try {
      await onRestore(version);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't restore this version");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-section shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Version history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {error && (
            <div role="alert" className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
              <p>{error}</p>
              {versions === null && (
                <button type="button" className={BUTTON} onClick={reload}>
                  Try again
                </button>
              )}
            </div>
          )}

          {versions === null && !error && <p role="status">Loading versions…</p>}

          {versions?.length === 0 && <p>No versions yet. Versions are saved as you work.</p>}

          {versions && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((entry) => (
                <li key={entry.version} className="rounded-lg border border-white/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-1.5 text-zinc-200">
                        {entry.pinned && <Pin aria-label="Pinned" className="h-3 w-3 text-violet-400" />}
                        <span>
                          {formatVersionTime(entry.savedAt, now())} · {entry.screenCount}{" "}
                          {entry.screenCount === 1 ? "screen" : "screens"}
                        </span>
                      </p>
                      {entry.firstHeadline && <p className="truncate text-xs text-zinc-400">“{entry.firstHeadline}”</p>}
                      {entry.label && <p className="text-xs text-zinc-500">{entry.label}</p>}
                    </div>
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={restoring}
                      onClick={() => setConfirming(entry.version)}
                    >
                      Restore
                    </button>
                  </div>
                  {confirming === entry.version && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs">
                      <p>Replace current content with this version? Your current state is saved to history first.</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`${BUTTON} bg-violet-600 text-white hover:bg-violet-500`}
                          disabled={restoring}
                          onClick={() => void restore(entry.version)}
                        >
                          Restore this version
                        </button>
                        <button type="button" className={BUTTON} disabled={restoring} onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Mount the panel**

In `src/components/EditorLayout.tsx`:
- add `import { HistoryPanel } from "./Storage/HistoryPanel";`
- add `isHistoryOpen, setIsHistoryOpen, listProjectHistory, restoreProjectVersion, activeProjectId,` to the `useEditor()` destructure
- after the `<AgentImportModal ... />` element, add:

```tsx
        <HistoryPanel
          isOpen={isHistoryOpen}
          projectId={activeProjectId}
          onClose={() => setIsHistoryOpen(false)}
          loadHistory={listProjectHistory}
          onRestore={restoreProjectVersion}
        />
```

- [ ] **Step 5: Run tests, build, commit**

Run: `bunx vitest run src/components/Storage && bun run build`
Expected: PASS (HistoryPanel 8 plus Task 12 files); build exit 0. Then `bun run test` — all pass. If the `Pin` icon's `aria-label` isn't exposed by lucide-react in jsdom, wrap it: `<span aria-label="Pinned"><Pin className="…" aria-hidden="true" /></span>` — keep the assertion.

```bash
git add src/components/Storage/HistoryPanel.tsx src/components/Storage/HistoryPanel.test.tsx src/components/EditorLayout.tsx
git commit -m "Add version history panel with restore

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

### Task 14: Docs, end-to-end check, final gates

**Files:**
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above. Produces no code interfaces.

- [ ] **Step 1: Update the README Docker sections**

In `README.md`:

1. Replace the Plain Docker block and the nginx paragraph:

````md
```bash
docker build -t appshots .
docker run -d -p 8080:80 --name appshots appshots
```

The image is a multi-stage build: Bun + Vite compile the static bundle, which is then served by nginx (with client-side-routing fallback and long-lived caching for hashed assets). The final image contains only the built assets — no toolchain or source.
````

with:

````md
```bash
docker build -t appshots .
docker run -d -p 8080:80 -v appshots-data:/data --name appshots appshots
```

The image is a multi-stage build: Bun + Vite compile the app, and a small Bun server serves it together with the storage API. Projects, images and version history are saved in `/data` — mount a volume there or they are lost when the container is recreated.
````

2. In the Prebuilt image snippet, replace

```yaml
    ports:
      - "8080:80"
```

with:

```yaml
    ports:
      - "8080:80"
    volumes:
      - appshots-data:/data
    # environment:
    #   APPSHOTS_PASSWORD: change-me

volumes:
  appshots-data:
```

3. Directly before `## 🛠️ Tech Stack`, add:

```md
### Storage, passwords and backups

- **Where projects live:** with the Docker image, projects, images and version history are stored in the container's `/data` volume, so they're the same from any browser that can reach it. Running `bun run dev` (or hosting the static build elsewhere) saves to the browser instead. Use `bun run dev:server` alongside `bun run dev` to try container storage locally.
- **Password:** set `APPSHOTS_PASSWORD` to require a login. Without it, anyone who can reach the port can read and change projects — keep it on your LAN or behind a reverse proxy with its own auth.
- **Backups:** copy the volume (e.g. `docker run --rm -v appshots-data:/data -v "$PWD":/backup alpine tar czf /backup/appshots-data.tgz -C /data .`), or use **Export Project** for individual projects.
- **Permissions:** the server runs as the `bun` user. If you bind-mount a host folder instead of a named volume, make sure that user can write to it, or AppShots falls back to browser storage and shows a warning.
- **Upgrading:** when you first open a container that has no projects, AppShots moves the projects saved in that browser into it. The browser copy is kept as a backup.
```

- [ ] **Step 2: Update `CLAUDE.md`**

1. Replace the Overview paragraph

```md
A **client-only** SPA (React 19 + TypeScript + Vite, run with Bun) — a drag-and-drop editor for generating App Store / Play Store screenshots with realistic device frames. There is **no backend, no auth, and no network API**; all state persists to `localStorage`.
```

with:

```md
A React 19 + TypeScript + Vite app (run with Bun) — a drag-and-drop editor for generating App Store / Play Store screenshots with realistic device frames. In the Docker image a small dependency-free Bun server (`server/`) serves the app and a storage API; projects save to the container's `/data` volume. Without that API (`bun run dev`, static hosting) projects save to `localStorage`.
```

2. In the Commands block, after `bun run dev                                          # dev server → http://localhost:5173`, add:

```
bun run dev:server                                   # storage API on :3000 (Vite proxies /api to it)
```

3. In **Architecture**, replace `Persistence is `src/lib/useLocalStorage.ts`.` with `Persistence goes through a `ProjectStorage` (`src/lib/storage/`) chosen at startup — see **Storage** below.`

4. Insert this section immediately before `## Adding a device (the common task)`:

```md
## Storage

- `src/routes/index.tsx` → `bootstrapEditor` picks storage via `GET /api/health` (`resolveStorage`): `ServerStorage` when the container reports writable storage, otherwise `BrowserStorage`. First run against an empty container migrates browser projects (`migrate.ts`).
- `EditorProvider` receives `storage` + `initialState`; `useProjectPersistence` autosaves (1 s debounce), exposes save status / Save now / conflict actions. Don't write to `localStorage` or `fetch` projects directly — go through `ProjectStorage`.
- Server storage saves images as `/api/images/<sha256>.<ext>` URLs (uploaded from data URLs on save); `Export Project` inlines them again. Project shapes are otherwise identical in both modes and still pass through `normalizeProject` on load.
- `server/`: `validation.ts`, `history.ts` (pure rules), `store.ts` (`FileStore`, atomic writes, revisions, history, image GC), `api.ts` (`handleRequest`, tested with Vitest), `main.ts` (`Bun.serve` only). Server code uses Web APIs + `node:` built-ins, no npm deps; it's type-checked by `tsc -p server`.
```

- [ ] **Step 3: End-to-end check**

Build and start the container, then verify in a real browser (Playwright or browser automation; native dialogs can't be automated — use the tooling's HTTP credentials support for the password check):

```bash
bun run build
docker compose up -d --build
```

Check, and record observed results in the report:

1. **Migration:** before the first load of `http://localhost:8080`, seed that origin's localStorage key `app-screenshot-editor-state` (via the automation tool) with a saved state containing 2 projects, one with a data-URL screenshot — for example, copy the value from a `bun run dev` session at `localhost:5173` after creating the projects there (different origins don't share localStorage). Expected: "Moved 2 projects from this browser into the container." banner; both projects visible; `docker compose exec appshots ls /data/projects` lists them.
2. **Reload persistence:** edit a headline, see **Unsaved changes** → **Saved · just now**, reload — edit persists.
3. **Images:** add a screenshot image, reload — it still shows; `docker compose exec appshots ls /data/images` lists a hashed file; export (⌘E) still produces PNGs with the image.
4. **Conflict:** open the same project in two browser contexts; edit in A, then edit in B — B shows "“NAME” was changed in another tab or device."; **Keep mine** saves B; in history, A's version is pinned ("Before replace").
5. **History:** open **Version history**, restore an earlier version, confirm — editor shows the restored content; history now has a pinned "Before restore" entry.
6. **Save now:** press ⌘/Ctrl+S — status saves immediately; history shows a pinned "Saved" entry.
7. **Password:** set `APPSHOTS_PASSWORD` in compose, `docker compose up -d`; the app requires credentials; `curl -s http://localhost:8080/api/health` still works without them.
8. **Recreate:** `docker compose down && docker compose up -d` — projects remain.
9. **Upgrade:** with a stack mapping `8080:80` built from `master` (old nginx image), switch to the new image — the app loads on the same port.
10. **Browser fallback:** `bun run dev` without `dev:server` — status reads "Projects are saved in this browser" (tooltip), no History button.

If a check can't be run, mark it unverified with the reason; don't claim it.

`docker compose down` when done.

- [ ] **Step 4: Final gates**

Run: `bun run test` and `bun run build`
Expected: all tests pass (only the known Vitest DEP0205 line besides test output); build exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document container storage, passwords and backups

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PGjZkJbRLkCSKifStarDpG"
```

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Bun server replaces nginx; static serving mirrors nginx.conf | 5, 6 |
| `/data` layout, atomic writes, id/version/image validation | 1, 3 |
| API: health, state, projects (If-Match / If-None-Match / 409), images (magic bytes, 415/413), history list/add/restore | 3, 4, 5 |
| Optional Basic auth; health always open | 5, 6 |
| History rules: 10-min coalescing, pin, pinPrevious, retention, restore pins current | 2, 4 |
| Image cleanup with 1-hour grace, respects history | 4 |
| Unwritable data dir → health `writable:false` → browser fallback banner | 3, 6, 9, 12 |
| `ProjectStorage` interface; BrowserStorage rejects on quota | 7 |
| ServerStorage: revisions, data-URL uploads with cache, keepalive unload, export inlining | 8 |
| Startup detection (2 s timeout) + loading screen | 9, 11 |
| Migration only into an empty container; flag; browser copy kept | 9, 11 |
| Per-project dirty diff, 1 s autosave, Save now/⌘S (pin), leave-page guard | 10, 11, 12 |
| Save indicator states incl. Unsaved changes | 12 |
| Conflict banner: Load their version (keeps local in history) / Keep mine (pinPrevious) | 10, 11, 12 |
| History panel with restore confirm; undo reset after restore | 11, 13 |
| Export Project inlines images; Import unchanged; agent-import warning browser-only; Replace pins previous | 11 |
| resetEditor → `resetAll()` (no UI caller; see rulings) | 11 |
| Dockerfile (bun alpine, non-root, port 80, VOLUME, health check), compose named volume, dev:server + Vite proxy, @types/bun | 1, 6 |
| README + CLAUDE.md | 14 |
| Tests: server, app, end-to-end; gates | every task, 14 |

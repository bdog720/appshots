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

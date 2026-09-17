/**
 * Breezel server entry: serves the built app and the storage API.
 *
 *   BREEZEL_DATA_DIR   data directory (default /data)
 *   BREEZEL_DIST_DIR   built app directory (default dist)
 *   BREEZEL_PASSWORD   require HTTP Basic auth when set
 *   PORT               listen port (default 80)
 *
 * The old APPSHOTS_* names still work; see config.ts.
 */

import { handleRequest } from "./api";
import { readServerConfig } from "./config";
import { FileStore } from "./store";

const { dataDir, distDir, port, password, warnings } = readServerConfig(process.env);
for (const warning of warnings) console.warn(`Breezel: ${warning}`);

const store = new FileStore(dataDir);
const { writable } = await store.init();

if (!writable) {
  console.error(
    `Breezel: ${dataDir} is not writable by uid ${process.getuid?.() ?? "?"}. ` +
      "Projects will be saved in each browser instead. Fix the volume permissions and restart.",
  );
}
if (!password) {
  console.warn(
    "Breezel: BREEZEL_PASSWORD is not set. Anyone who can reach this server can read and change projects.",
  );
}

const server = Bun.serve({
  port,
  maxRequestBodySize: 26 * 1024 * 1024,
  fetch: (request) => handleRequest(request, { store, writable, password, distDir }),
});

console.log(`Breezel listening on port ${server.port} (data: ${dataDir})`);

// Bun runs as PID 1 in the container, so stop cleanly on `docker stop` instead
// of being killed mid-save. stop() lets in-flight requests finish.
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Breezel shutting down");
  await server.stop();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

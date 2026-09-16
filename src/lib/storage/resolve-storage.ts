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

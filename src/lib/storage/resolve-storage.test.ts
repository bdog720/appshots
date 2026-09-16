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

  it("uses browser storage when the health body is valid JSON but the wrong shape", async () => {
    for (const fetchImpl of [
      respond(200, JSON.stringify({})),
      respond(200, JSON.stringify({ storage: "other", writable: true })),
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

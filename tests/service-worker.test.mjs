import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("install caches hashed assets referenced by shell HTML", async () => {
  const listeners = new Map();
  const cached = new Set();
  const cache = {
    async put(request) {
      cached.add(typeof request === "string" ? request : request.url);
    },
  };
  const html =
    '<link rel="stylesheet" href="/assets/app-123.css">' +
    '<link rel="modulepreload" href="/assets/chunk-456.js">' +
    '<script src="/assets/app-789.js"></script>';
  const context = vm.createContext({
    caches: {
      async open() {
        return cache;
      },
      async keys() {
        return [];
      },
    },
    fetch: async (path) =>
      new Response(
        String(path).startsWith("/assets/") ? "asset" : html,
        {
          status: 200,
          headers: {
            "content-type": String(path).startsWith("/assets/")
              ? "application/javascript"
              : "text/html",
          },
        },
      ),
    Response,
    URL,
    Set,
    Error,
    Promise,
    self: {
      location: { origin: "https://divelog.example" },
      clients: { async claim() {} },
      async skipWaiting() {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
  });
  vm.runInContext(await readFile("public/sw.js", "utf8"), context);

  let installPromise;
  listeners.get("install")({
    waitUntil(promise) {
      installPromise = promise;
    },
  });
  await installPromise;

  assert.ok(cached.has("/android"));
  assert.ok(cached.has("/compose"));
  assert.ok(cached.has("/assets/app-123.css"));
  assert.ok(cached.has("/assets/chunk-456.js"));
  assert.ok(cached.has("/assets/app-789.js"));
});

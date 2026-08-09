// Bump this when a deployed shell needs to evict stale cached module URLs.
// IndexedDB is separate and is intentionally never touched by this cache reset.
const CACHE_NAME = "diveframe-shell-v10";
const APP_SHELL = [
  "/",
  "/settings",
  "/about",
  "/memo",
  "/memos",
  "/manifest.webmanifest",
  "/icons/diveframe-icon.svg",
  "/icons/diveframe-192.png",
  "/icons/diveframe-512.png",
  "/icons/diveframe-maskable-512.png",
  "/icons/diveframe-apple-touch.png",
  "/backgrounds/bubbles-bg.jpg",
  "/examples/sample-dive.uddf",
  "/examples/dive-site-catalog-ai-prompt.md",
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("diveframe-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cacheSuccessfulResponse(request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then(async (response) => {
          await cacheSuccessfulResponse(request, response);
          return response;
        }),
    ),
  );
});

async function cacheSuccessfulResponse(request, response) {
  if (!response.ok) return;
  // Await the write while the fetch event is alive; an unobserved cache.put()
  // can be terminated before it finishes on mobile browsers. Cache quota
  // failures must not block the live network response.
  await caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response.clone()))
    .catch(() => undefined);
}

/**
 * Cache both the shell documents and their hashed CSS/module dependencies.
 * cache.addAll(APP_SHELL) alone stores HTML but not the scripts it references,
 * so a newly installed PWA could render a blank page on its first offline run.
 */
async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set();
  for (const path of APP_SHELL) {
    const response = await fetch(path, { cache: "reload" });
    if (!response.ok) throw new Error(`Unable to cache app shell: ${path}`);
    await cache.put(path, response.clone());
    if ((response.headers.get("content-type") || "").includes("text/html")) {
      discoverShellAssets(await response.text(), assets);
    }
  }
  await Promise.all(
    [...assets].map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) throw new Error(`Unable to cache app asset: ${path}`);
      await cache.put(path, response);
    }),
  );
}

function discoverShellAssets(html, assets) {
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/g)) {
    const url = new URL(match[1], self.location.origin);
    if (
      url.origin === self.location.origin &&
      !url.pathname.startsWith("/api/") &&
      !APP_SHELL.includes(url.pathname)
    ) {
      assets.add(`${url.pathname}${url.search}`);
    }
  }
}

/* StatAttack service worker: works offline for practice, shows turn alerts. */
const VERSION = "sa-v6";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-32.png", "icons/icon-180.png"];
const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try { await cache.add(new Request(LIB, { mode: "cors" })); } catch (e) { /* offline install: the game still runs practice mode */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache the game server: moves and cards must always be live
  if (url.hostname.endsWith(".supabase.co")) return;

  // The page itself: newest version when online, cached copy when offline
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put("index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match("index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Icons, library and fonts: serve from cache, refresh in the background
  const cacheable = url.origin === self.location.origin || url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!cacheable) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const network = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});

/* Turn alerts */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "StatAttack";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: data.tag || "statattack",
    renotify: true,
    data: { url: data.url || "./" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        w.postMessage({ type: "open", url: target });
        return w.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});

/* حصتي: service worker. ارفع رقم VER عند تغيير الدروس أو الصور ليتحدّث الكاش عند المستخدمين. */
const VER = "hessati-v1";
const SHELL = ["./", "index.html", "curriculum.json", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];
const EXTRA = [/*VENDOR_FILES*/]; /* يملؤها scripts/build.mjs --vendor */
const CROSS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => Promise.allSettled([...SHELL, ...EXTRA].map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const c = await caches.open(VER);
  try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; }
  catch (_) { const m = await c.match(req, { ignoreSearch: true }); if (m) return m; if (req.mode === "navigate") return c.match("index.html"); throw _; }
}
async function cacheFirst(req) {
  const c = await caches.open(VER);
  const m = await c.match(req);
  if (m) return m;
  const r = await fetch(req);
  if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
  return r;
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    const isDoc = req.mode === "navigate" || u.pathname.endsWith("/index.html") || u.pathname.endsWith("/curriculum.json") || u.pathname.endsWith("/sw.js");
    e.respondWith(isDoc ? networkFirst(req) : cacheFirst(req));
  } else if (CROSS.includes(u.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});

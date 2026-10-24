// On the Scope service worker: installable app shell + push notifications (alerts).
//
// Freshness rules (memecoin prices move by the second):
//  * /api/*, anything that isn't GET, and every other origin (charts, Jupiter, RPCs) are NEVER touched.
//    They go straight to the network, so prices, safety and trades are always live. Offline, they fail
//    and the app says so; we never show an old price as if it were current.
//  * Pages and our own JS/CSS: network first, using the cached copy only when offline.
//  * Icons/images/fonts: cache first (they never carry prices).
const VERSION = 'ots-v3';
const SHELL = ['/', '/app.css', '/app.js', '/profile.js', '/alerts-client.js', '/buy.js', '/pwa.js', '/pnl-core.js', '/logo.svg', '/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
  await self.clients.claim();
})()));
const OFFLINE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · On the Scope</title><body style="margin:0;background:#07090d;color:#e8ecf3;font:15px system-ui;display:grid;place-items:center;min-height:100vh;text-align:center"><div><img src="/icon-192.png" width="72" height="72" alt=""><h2>You're offline</h2><p style="color:#8590a6">Live prices need a connection. We never show stale prices.</p><button onclick="location.reload()" style="background:#14f195;border:0;border-radius:10px;padding:10px 18px;font-weight:700">Retry</button></div>`;
const isStatic = p => /\.(png|svg|ico|webp|jpg|woff2?)$/.test(p);
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // network only
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return; // live data: network only, never cached
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put('/', c)); } return r; })
      .catch(async () => (await caches.match('/')) || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (isStatic(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })));
    return;
  }
  // our JS/CSS etc: network first so a new deploy shows up immediately; cache only as an offline fallback
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
    .catch(() => caches.match(req).then(hit => hit || Response.error())));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'On the Scope', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'On the Scope alert', { body: d.body || '', icon: '/icon-192.png', badge: '/favicon-32.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (new URL(c.url).origin === self.location.origin && 'navigate' in c) return c.focus().then(() => c.navigate(url));
    return self.clients.openWindow(url);
  }));
});

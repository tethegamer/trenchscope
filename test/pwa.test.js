// PWA: manifest is installable, icons exist at the declared sizes, and the service worker
// never answers /api (live prices) or cross-origin requests from cache.
const test = require('node:test'); const assert = require('assert'); const fs = require('fs'); const path = require('path');
const pub = f => path.join(__dirname, '..', 'public', f);
const pngSize = f => { const b = fs.readFileSync(pub(f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest is installable', () => {
  const m = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'On the Scope'); assert.equal(m.display, 'standalone'); assert.ok(m.start_url.startsWith('/')); assert.equal(m.scope, '/');
  assert.ok(!/https?:/.test(JSON.stringify(m)), 'manifest must use relative URLs');
  for (const need of ['192x192', '512x512']) assert.ok(m.icons.some(i => i.sizes === need), need);
  assert.ok(m.icons.some(i => /maskable/.test(i.purpose)), 'maskable icon');
  for (const i of m.icons) { const [w, h] = pngSize(i.src.slice(1)); assert.equal(`${w}x${h}`, i.sizes, i.src); }
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180]);
  const html = fs.readFileSync(pub('index.html'), 'utf8');
  for (const s of ['rel="manifest"', 'apple-touch-icon', 'apple-mobile-web-app-capable', 'id="installBtn"']) assert.ok(html.includes(s), s);
});

test('service worker never serves /api or other origins from cache', async () => {
  const handlers = {}; const responded = [];
  const self = { addEventListener: (t, f) => (handlers[t] = f), location: { origin: 'https://ots.example' }, clients: { claim: async () => {} }, skipWaiting() {}, registration: {} };
  const caches = { open: async () => ({ put() {}, addAll: async () => {} }), match: async () => new Response('STALE'), keys: async () => [] };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', fs.readFileSync(pub('sw.js'), 'utf8'))(self, caches, async () => new Response('LIVE'), Response, URL);
  const ev = (url, extra = {}) => ({ request: { url, method: 'GET', mode: 'cors', ...extra }, respondWith: p => responded.push(url) });
  for (const u of ['https://ots.example/api/token/X', 'https://ots.example/api/list/trending', 'https://ots.example/sw.js', 'https://api.dexscreener.com/x', 'https://plugin.jup.ag/plugin-v1.js']) handlers.fetch(ev(u));
  handlers.fetch(ev('https://ots.example/api/alerts', { method: 'POST' }));
  assert.deepEqual(responded, [], 'live requests must bypass the SW');
  handlers.fetch(ev('https://ots.example/app.js')); handlers.fetch(ev('https://ots.example/token/abc', { mode: 'navigate' }));
  assert.equal(responded.length, 2, 'app shell is handled (offline fallback)');
  assert.ok(handlers.push && handlers.notificationclick, 'push still handled');
});

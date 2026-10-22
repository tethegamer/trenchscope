// On the Scope service worker — push notifications (alerts).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
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

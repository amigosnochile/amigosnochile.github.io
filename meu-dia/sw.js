// Meu Dia: service worker (recebe as notificações).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { titulo: 'Meu Dia', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Meu Dia', {
    body: d.corpo || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(e.notification.data.url || './');
  })());
});

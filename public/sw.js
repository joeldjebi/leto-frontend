// LETO back-office : affiche les notifications locales et ouvre la page concernée au clic.
// Aucune notification « push » distante : elles viennent de la connexion temps réel de la page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const link = data.link || '';
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', link, id: data.id });
      } else {
        await self.clients.openWindow(scope + (link ? '#' + link : ''));
      }
    })(),
  );
});

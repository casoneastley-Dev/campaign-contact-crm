/* Self-unregistering service worker.
   The previous caching worker caused stale-bundle problems that were hard to
   clear from already-affected browsers. The browser re-fetches this script on
   navigation (bypassing the old worker), so replacing the old worker with this
   one lets it clean up automatically: it deletes all caches, unregisters
   itself, and reloads any open pages so they load fresh from the network. */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});

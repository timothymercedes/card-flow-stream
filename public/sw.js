// Service worker for Web Push "going live" notifications.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Pull Bid Live", body: event.data?.text?.() || "" }; }
  const title = data.title || "Going live now 🔴";
  const opts = {
    body: data.body || "Tap to join the stream",
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: data.url || "/live" },
    tag: data.tag || "going-live",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { c.navigate?.(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});

const CACHE_NAME = "band-chat-v11";
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = [
  "/",
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
  "/notification-icon.png",
];
const HOSTNAME = self.location.hostname;
const IS_LOCAL_LIKE =
  HOSTNAME === "localhost" ||
  HOSTNAME === "127.0.0.1" ||
  HOSTNAME === "[::1]" ||
  /^10\./.test(HOSTNAME) ||
  /^192\.168\./.test(HOSTNAME) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(HOSTNAME);

self.addEventListener("install", (event) => {
  if (IS_LOCAL_LIKE) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Push notification handler
self.addEventListener("push", (event) => {
  console.log('[SW] Push event received:', event);
  
  let data = { title: "Band Chat", body: "New message", icon: "/notification-icon.png" };
  
  try {
    if (event.data) {
      // Try to parse as JSON first (Firebase format)
      try {
        const parsed = event.data.json();
        console.log('[SW] Parsed push data:', parsed);
        
        // Handle Firebase notification format
        if (parsed.notification) {
          data.title = parsed.notification.title || data.title;
          data.body = parsed.notification.body || data.body;
          data.icon = parsed.notification.icon || data.icon;
        } else {
          // Handle direct data
          data = Object.assign(data, parsed);
        }
      } catch (jsonError) {
        // If not JSON, treat as text
        data.body = event.data.text();
      }
    }
  } catch (error) {
    console.error('[SW] Error parsing push data:', error);
  }

  console.log('[SW] Showing notification:', data);
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/notification-icon.png",
      badge: "/notification-icon.png",
      tag: data.tag || "band-chat-notification",
      data: data.url ? { url: data.url } : {},
      requireInteraction: false,
      vibrate: [200, 100, 200]
    })
  );
});

// Notification click handler - focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_LIKE) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          if (cachedPage) {
            return cachedPage;
          }
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Network-first for all other same-origin GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match(OFFLINE_URL);
      })
  );
});

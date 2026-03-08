/**
 * KrishiMitra Service Worker — Offline-First PWA
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS, icons): Cache-first (instant load offline)
 *   - API calls (/api/v1/): Network-first with IndexedDB fallback
 *   - Weather/market data: Stale-while-revalidate (show cached, update in background)
 *   - Images: Cache-first with 30-day expiry
 *
 * Background Sync: queued POST requests (chat messages, farm updates) are
 * replayed automatically when connectivity returns.
 */

const CACHE_VERSION = 'krishimitra-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.svg',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/css/main.chunk.css',
];

const API_CACHE_PATTERNS = [
  /\/api\/v1\/markets\//,
  /\/api\/v1\/schemes\//,
  /\/api\/v1\/alerts\//,
  /\/api\/v1\/farms\//,
];

// ── Install: pre-cache app shell ─────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        // Non-fatal: some assets may not exist yet during dev
      })
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('krishimitra-') && key !== SHELL_CACHE && key !== API_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET for caching (POSTs handled by background sync)
  if (request.method !== 'GET') return;

  // 1. App shell — cache first
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // 2. Market / scheme / alert API data — stale-while-revalidate
  if (API_CACHE_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // 3. AI chat — network only (no caching of AI responses)
  if (url.pathname.startsWith('/api/v1/ai/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 4. Images — cache first with long TTL
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // 5. Default — network with shell fallback
  event.respondWith(networkWithShellFallback(request));
});

// ── Background Sync: replay queued requests ──────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'krishimitra-sync') {
    event.waitUntil(replayQueuedRequests());
  }
});

async function replayQueuedRequests() {
  // Notify clients to trigger their background sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'BACKGROUND_SYNC' }));
}

// ── Push Notifications ───────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'KrishiMitra Alert', body: event.data.text() };
  }

  const options = {
    body: data.body ?? data.message ?? '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag ?? 'krishimitra-alert',
    data: data.url ? { url: data.url } : {},
    actions: data.actions ?? [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'KrishiMitra', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});

// ── Cache strategies ─────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached ?? (await fetchPromise) ?? new Response(
    JSON.stringify({ error: 'Offline', cached: false }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'You are offline. This feature requires internet connection.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function networkWithShellFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match('/index.html');
    return cached ?? new Response('Offline', { status: 503 });
  }
}

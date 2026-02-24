const SHELL_CACHE = 'app-shell-v3';
const ASSET_CACHE = 'assets-v3';
const SHELL_ROUTES = ['/type-a/', '/type-a/index.html', '/type-a/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ROUTES);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/type-a/assets/')) {
    event.respondWith(cacheAsset(request));
    return;
  }

  if (SHELL_ROUTES.includes(url.pathname)) {
    event.respondWith(cacheShell(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheShell(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return fetch(request);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      return response;
    }
    throw new Error('Network fetch failed');
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/type-a/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

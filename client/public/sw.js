// CACHE_NAME har deploy'da bumped — eski cache'ni majburan tozalaydi
const CACHE_NAME = 'resultma-v3-2479aa4';
const STATIC_ASSETS = ['/logo.png'];

// Eski sw.js — JS bundle'larni cache qilib eski hash bilan saqlardi va yangi
// deploy'da o'zgarmasdi. Bu user'larni eski kodga "qulflab qo'yardi".
//
// Yangi strategiya:
// - HTML / JS / CSS — NETWORK-ONLY (har doim yangi deploy darhol ko'rinadi)
// - Boshqa static (png, jpg, svg, fonts) — stale-while-revalidate (tez + yangilanadi)
// - API/uploads — skip (SW aralashmaydi)

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // BARCHA eski cache'larni tozalash (resultma-v1, resultma-v2, ...)
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      // Faol tab'larni yangi SW ostiga o'tkazish
      await self.clients.claim();
    })()
  );
});

function isCodeAsset(url) {
  return (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    /\.(html|js|mjs|css)$/.test(url.pathname)
  );
}

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;
  if (url.pathname.startsWith('/uploads')) return;
  if (url.pathname.startsWith('/exports')) return;

  // Code assets: NETWORK-ONLY — yangi deploy darhol ko'rinadi
  if (isCodeAsset(url)) {
    e.respondWith(
      fetch(request).catch(() =>
        // Offline fallback: cache'dan
        caches.match(request).then((c) => c || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Static assets (img/font): stale-while-revalidate — tez yuklanadi, fon'da yangilanadi
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default — network-only
});

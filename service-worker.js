/* ================================================================
   Semafor App — service-worker.js
   Cache-first Service Worker pro offline provoz (PWA)
   ================================================================
   Obsah:
   1. Konfigurace cache
   2. Událost install — precache statických prostředků
   3. Událost activate — vyčištění starých cache
   4. Událost fetch — cache-first strategie
   ================================================================ */

'use strict';


/* ================================================================
   1. Konfigurace cache
   ================================================================ */

const CACHE_NAME = 'semafor-v2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/service-worker.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];


/* ================================================================
   2. Událost install — precache statických prostředků
   ================================================================ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});


/* ================================================================
   3. Událost activate — vyčištění starých cache
   ================================================================ */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});


/* ================================================================
   4. Událost fetch — cache-first strategie
   ================================================================ */

// Soubory které se mění při vývoji → network-first (vždy čerstvá verze)
const NETWORK_FIRST = ['/app.js', '/style.css'];

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isNetworkFirst = NETWORK_FIRST.some(p => url.pathname.endsWith(p));

  if (isNetworkFirst) {
    // Network-first: zkus síť, při selhání použij cache (offline fallback)
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Ulož čerstvou verzi do cache pro offline případ
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first: ikony, HTML, manifest — ty se nemění často
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});

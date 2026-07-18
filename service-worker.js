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

const CACHE_NAME = 'semafor-v1';
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

self.addEventListener('fetch', (event) => {
  // Zpracovat pouze GET požadavky; ostatní nechat projít
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});

const CACHE_NAME = 'cervantes-v1';
const urlsToCache = [
  './',
  './index.html',
  './logo.png'
];

// Instalar el service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(cache => cache.addAll(urlsToCache))
  );
});

// Escuchar peticiones
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
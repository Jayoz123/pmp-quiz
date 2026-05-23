'use strict';

// UWAGA: APP_VERSION jest generowany automatycznie przez tools/build.py
// (hash ze wszystkich cache'owanych assetów). NIE modyfikuj tej linii ręcznie —
// uruchom 'python tools/build.py' przed deployem (CI robi to automatycznie).
const APP_VERSION = 'build-34c21d7b';  // placeholder, nadpisywany przez build.py
const CACHE_NAME  = `pmp-quiz-${APP_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './questions.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Nie cachuj requestów do Supabase — zawsze idź przez sieć
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

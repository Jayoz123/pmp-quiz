'use strict';

// FIX #3 — wersjonowanie cache: zmień APP_VERSION przy każdym deployu
// Musi być zsynchronizowane z APP_VERSION w app.js
const APP_VERSION = '2.0.0';
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

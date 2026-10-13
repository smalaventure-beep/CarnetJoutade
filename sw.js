// Carnet de La Joutade — service worker : appli hors ligne + cache des morceaux de carte
const APP = 'joutade-app-v8';
const TILES = 'joutade-tuiles-v1';
const MAX_TILES = 6000;
const SHELL = ['./', 'index.html', 'leaflet.js', 'leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isTile = u => u.hostname === 'data.geopf.fr' || u.hostname === 'tile.openstreetmap.org';
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
let putCount = 0;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isTile(url) || isFont(url)) {
    const name = isTile(url) ? TILES : APP;
    e.respondWith(caches.open(name).then(async cache => {
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req.url, res.clone());
          if (name === TILES && ++putCount % 200 === 0) trim(cache);
        }
        return res;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    // appli : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  }
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) await cache.delete(k);
}

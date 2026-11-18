// 인터랙티브 스크립트 service worker (site root scope).
// - precaches the app shell (root list, manifest, icons)
// - HTML pages: network-first, falling back to the cache (offline reading of scripts already opened)
// - NEVER touches video/audio or any Range request: those go straight to the network so seeking keeps working
// VERSION is stamped by pipeline/publish.py on every publish; old caches are deleted on activate.
const VERSION = '20261119041550';
const CACHE = 'ks-' + VERSION;
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ks-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.destination === 'video' || req.destination === 'audio' || /\.(mp4|m4v|m4a|webm|mov|mp3)$/i.test(url.pathname)) return;
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./'))));
    return;
  }
  if (SHELL.some(p => new URL(p, self.registration.scope).href === url.href)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
  // everything else (thumbnails, meta.json, …): plain network
});

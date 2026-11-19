// 인터랙티브 스크립트 service worker (site root scope).
// - precaches the app shell (root list, manifest, icons)
// - HTML pages: network-first, falling back to the cache (offline reading of scripts already opened)
// - NEVER touches video/audio or any Range request: those go straight to the network so seeking keeps working
// VERSION is stamped by pipeline/publish.py on every publish; old caches are deleted on activate.
const VERSION = '20261120061552';
const CACHE = 'ks-' + VERSION;
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // pages read offline under the old version stay readable: carry them over before the old caches go
  e.waitUntil(caches.keys().then(keys => caches.open(CACHE).then(cur => Promise.all(keys.filter(k => k.startsWith('ks-') && k !== CACHE).map(k =>
    caches.open(k).then(old => old.keys().then(reqs => Promise.all(reqs.map(r => cur.match(r).then(hit => hit ? 0 : old.match(r).then(res => res && cur.put(r, res)))))))
      .then(() => caches.delete(k))))))
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
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || offline(url))));
    return;
  }
  if (SHELL.some(p => new URL(p, self.registration.scope).href === url.href)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
  // everything else (thumbnails, meta.json, …): plain network
});

// a page that was never opened online: the root list if that is what was asked for, else a small offline note
// (serving the cached root under another path would break all of its relative links)
function offline(url) {
  const root = self.registration.scope;
  if (url.href === root || url.href === root + 'index.html') return caches.match('./');
  return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>오프라인</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#F7F3EC;color:#211D18;text-align:center">' +
    '<div style="padding:24px"><p style="font-size:17px;font-weight:700;margin:0 0 6px">오프라인이에요</p>' +
    '<p style="font-size:14px;color:#72685E;margin:0 0 18px">이 영상은 아직 열어 본 적이 없어서 저장되지 않았어요.<br>인터넷에 연결되면 다시 열어 주세요.</p>' +
    '<a href="' + root + '" style="color:#9C4127;font-weight:600">목록으로</a></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

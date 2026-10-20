// Le worker de la lakozia installée (lakozia.html).
//
// Sa portée est « /lakozia.html » seulement : la cuisine qui installe sa page
// ne télécharge pas Ny asako avec elle. La page : le réseau d'abord, la copie
// gardée s'il n'y en a pas. Les commandes viennent de Supabase, que ce
// worker ne touche pas.

const CACHE = 'lakozia-1';
const SOCLE = ['/lakozia.html', '/lakozia.webmanifest', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SOCLE.map(function (u) { return c.add(u).catch(function () { }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (cles) {
      return Promise.all(cles.filter(function (k) {
        return k.indexOf('lakozia-') === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copie = res.clone();
        caches.open(CACHE).then(function (c) { c.put('/lakozia.html', copie); });
        return res;
      }).catch(function () {
        return caches.match('/lakozia.html');
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (r) { return r || fetch(req); })
  );
});

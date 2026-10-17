// Le worker du menu sakafo installé (menu-sakafo.html).
//
// Il n'a la main que sur la page du menu : sa portée est « /menu-sakafo.html »,
// plus étroite que celle de sw.js, qui garde tout le reste. Le client qui
// installe le menu ne télécharge donc pas Ny asako avec lui.
//
// La page : le réseau d'abord, la copie gardée s'il n'y en a pas. Le menu
// lui-même vient de Supabase, que ce worker ne touche pas ; la page garde la
// dernière version reçue pour s'afficher hors réseau.

const CACHE = 'menu-sakafo-1';
const SOCLE = ['/menu-sakafo.html', '/menu-sakafo.webmanifest', '/icone-192.png', '/icone-512.png'];

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
        return k.indexOf('menu-sakafo-') === 0 && k !== CACHE;
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
        caches.open(CACHE).then(function (c) { c.put('/menu-sakafo.html', copie); });
        return res;
      }).catch(function () {
        return caches.match('/menu-sakafo.html');
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (r) { return r || fetch(req); })
  );
});

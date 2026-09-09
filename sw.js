// Le service worker de « Ny asako ».
//
// Il rend l'application installable et lui permet de s'ouvrir sans réseau. Il
// ne cherche pas à tout faire fonctionner hors ligne : le stock, le fil et le
// portefeuille vivent sur le serveur. Ce qu'il garde, c'est la page et ses
// fichiers, pour que l'application s'ouvre au lieu d'afficher un dinosaure.

// Le nom porte l'empreinte du dernier envoi : outils/versionner.mjs le réécrit.
// Chaque mise en ligne repart donc d'un cache neuf, et l'ancien est effacé —
// sans quoi les fichiers de toutes les versions passées s'y empileraient.
const CACHE = 'nyasako-361b12ae';

// Fichiers demandés avant toute chose, pour que la première ouverture hors
// réseau trouve déjà de quoi s'afficher.
const SOCLE = [
  '/gestion-stockage.html',
  '/manifest.webmanifest',
  '/icone-192.png',
  '/icone-512.png'
];

self.addEventListener('install', function(e){
  // Une ressource absente ne doit pas faire échouer l'installation entière :
  // on les demande une à une et on passe outre les manquantes.
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return Promise.all(SOCLE.map(function(url){
        return cache.add(url).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(noms){
      return Promise.all(noms.map(function(n){
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function memeOrigine(url){
  return new URL(url, self.location.href).origin === self.location.origin;
}

// Les fichiers portent l'empreinte de leur contenu dans « ?v= » : une adresse
// ne désigne jamais deux versions, on peut donc servir le cache sans remords.
function estUnFichierDuSite(url){
  return /\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/i.test(new URL(url, self.location.href).pathname);
}

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;
  // Supabase, les CDN, les images d'ailleurs : on ne s'en mêle pas. Les mettre
  // en cache donnerait des réponses opaques, impossibles à vérifier, et des
  // données périmées là où elles comptent le plus.
  if(!memeOrigine(req.url)) return;

  // Les pages : le réseau d'abord, pour ne jamais servir une version dépassée ;
  // le cache seulement s'il n'y a plus de réseau.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        const copie = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copie); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){
          return r || caches.match('/gestion-stockage.html');
        });
      })
    );
    return;
  }

  if(!estUnFichierDuSite(req.url)) return;

  e.respondWith(
    caches.match(req).then(function(trouve){
      if(trouve) return trouve;
      return fetch(req).then(function(res){
        // Une réponse d'erreur n'a rien à faire en cache : elle y resterait.
        if(res && res.ok){
          const copie = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copie); });
        }
        return res;
      });
    })
  );
});

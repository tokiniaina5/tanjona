// Le service worker de « Ny asako ».
//
// Il rend l'application installable et lui permet de s'ouvrir sans réseau. Il
// ne cherche pas à tout faire fonctionner hors ligne : le stock, le fil et le
// portefeuille vivent sur le serveur. Ce qu'il garde, c'est la page, ses
// fichiers et ses bibliothèques, pour que l'application s'ouvre au lieu
// d'afficher un dinosaure. Les données (Supabase) ne passent jamais par lui.

// Le nom porte l'empreinte du dernier envoi : outils/versionner.mjs le réécrit.
// Chaque mise en ligne repart donc d'un cache neuf, et l'ancien est effacé —
// sans quoi les fichiers de toutes les versions passées s'y empileraient.
const CACHE = 'nyasako-c4f476bb';

// Le partage reçu des autres applications (manifest.webmanifest, « share_target »).
// Le téléphone ouvre cette adresse en POST, avec le texte et les fichiers
// choisis ailleurs — dans le navigateur, la galerie, WhatsApp. Une page ne
// peut pas lire un POST qu'elle n'a pas envoyé : c'est le worker qui le
// reçoit, le met de côté, puis renvoie vers l'accueil. zara-miditra.js va
// l'y chercher et remplit la boîte « Écrire ».
//
// Ce cache-là ne porte pas la version du site : il tient d'un envoi à l'autre,
// et l'activation plus bas se garde bien de l'effacer — un partage reçu
// pendant une mise à jour se perdrait.
const PARTAGE = 'nyasako-partage-entrant';
const CHEMIN_PARTAGE = '/zara-miditra';

// Fichiers demandés avant toute chose, pour que la première ouverture hors
// réseau trouve déjà de quoi s'afficher.
const SOCLE = [
  '/ny-asako.html',
  '/manifest.webmanifest',
  '/icone-192.png',
  '/icone-512.png',
  // L'Administratif Fokontany, installable à part, passe par ce même worker.
  '/fokontany/',
  '/fokontany/manifest.webmanifest',
  '/fokontany/icone-192.png',
  // L'Administratif Commun aussi : la même page, sous son adresse.
  '/commun/',
  '/fokontany/commun/manifest.webmanifest',
  '/fokontany/commun/icone-192.png',
  // La boutique publique : c'est elle que trouve un lien partagé, et elle
  // doit s'ouvrir même quand le réseau hésite.
  '/botika/',
  // Les bibliothèques des pages (estUneBibliotheque, plus bas) : sans elles,
  // une page ouverte hors réseau n'a ni Supabase, ni graphiques, ni PDF.
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
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
        return (n === CACHE || n === PARTAGE) ? null : caches.delete(n);
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

// Les bibliothèques des CDN : du code, jamais des données. Sans elles, la
// page gardée s'ouvrait hors réseau mais sans Supabase, ni graphiques, ni PDF.
// Chargées avec crossorigin="anonymous" : leurs réponses sont lisibles, on
// peut donc vérifier qu'elles sont bonnes avant de les garder.
function estUneBibliotheque(url){
  const hote = new URL(url).hostname;
  return hote === 'cdn.jsdelivr.net' || hote === 'cdnjs.cloudflare.com';
}

// Quand ni le réseau ni le cache n'ont la page : un mot plutôt qu'un écran
// d'erreur du navigateur.
function pageHorsLigne(){
  const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Hors ligne</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0a0d10;color:#e6edf0;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}' +
    'button{margin-top:18px;padding:10px 18px;border-radius:10px;border:0;background:#4fd8e0;color:#0a0d10;font-weight:600;font-size:15px}</style>' +
    '</head><body><div><div style="font-size:42px">📡</div><h1 style="font-size:20px">Vous êtes hors ligne</h1>' +
    '<p style="color:#9fb0b8;max-width:320px">Cette page n\'a pas encore été ouverte avec du réseau sur cet appareil. ' +
    'Reconnectez-vous puis réessayez.</p><button onclick="location.reload()">Réessayer</button></div></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Met le partage de côté, puis renvoie la page vers l'accueil.
//
// Une réponse à un POST ne doit pas rester dans l'historique : le « 303 »
// dit au navigateur de refaire une visite ordinaire à l'adresse indiquée,
// sans quoi un retour en arrière renverrait le partage une seconde fois.
function recevoirLePartage(req){
  return req.formData().then(function(form){
    const fichiers = form.getAll('fichiers').filter(function(f){
      return f && typeof f === 'object' && f.size;
    });
    return caches.open(PARTAGE).then(function(cache){
      // Ce qu'un partage précédent a laissé — jamais repris, ou repris à
      // moitié — n'a plus à traîner ici.
      return cache.keys().then(function(vieux){
        return Promise.all(vieux.map(function(k){ return cache.delete(k); }));
      }).then(function(){
        const notes = {
          titre: form.get('titre') || '',
          texte: form.get('texte') || '',
          lien: form.get('lien') || '',
          recu: Date.now(),
          fichiers: fichiers.map(function(f, i){
            return {
              adresse: '/__zara/' + i,
              nom: String(f.name || ('zara-' + i)),
              type: String(f.type || '')
            };
          })
        };
        const mises = fichiers.map(function(f, i){
          return cache.put('/__zara/' + i, new Response(f, {
            headers: { 'Content-Type': f.type || 'application/octet-stream' }
          }));
        });
        // Les notes en dernier : c'est elles que la page cherche, et elles ne
        // doivent pas annoncer des fichiers qui ne sont pas encore rangés.
        return Promise.all(mises).then(function(){
          return cache.put('/__zara/notes', new Response(JSON.stringify(notes), {
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      });
    });
  }).then(function(){
    return Response.redirect(new URL('/ny-asako.html?zara=1', self.location.origin).href, 303);
  }).catch(function(){
    // Le partage est perdu, mais l'application s'ouvre quand même : un écran
    // d'erreur du navigateur ne dirait rien à personne.
    return Response.redirect(new URL('/ny-asako.html?zara=raty', self.location.origin).href, 303);
  });
}

self.addEventListener('fetch', function(e){
  const req = e.request;

  // Le partage entrant arrive en POST, et lui seul : il se traite avant la
  // règle qui laisse passer tout ce qui n'est pas une lecture.
  if(req.method === 'POST' && memeOrigine(req.url) &&
     new URL(req.url).pathname === CHEMIN_PARTAGE){
    e.respondWith(recevoirLePartage(req));
    return;
  }

  if(req.method !== 'GET') return;

  // Les bibliothèques : le cache d'abord, pour s'ouvrir vite et sans réseau ;
  // le réseau ensuite, en arrière-plan, pour la prochaine fois
  // (supabase-js@2 suit sa version 2 : une copie n'a qu'un temps).
  if(estUneBibliotheque(req.url)){
    e.respondWith(
      caches.open(CACHE).then(function(cache){
        return cache.match(req).then(function(trouve){
          const frais = fetch(req).then(function(res){
            if(res && res.ok) cache.put(req, res.clone());
            return res;
          });
          if(trouve){ frais.catch(function(){}); return trouve; }
          return frais;
        });
      })
    );
    return;
  }

  // Supabase, les cartes, les images d'ailleurs : on ne s'en mêle jamais.
  // Ce sont les données : elles viennent toujours du serveur, en direct.
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
        // Hors réseau, le Fokontany et le Commun retombent sur leur propre
        // page et non sur le stock : ce sont des applications installées à part.
        const chemin = new URL(req.url).pathname;
        const repli = chemin.indexOf('/fokontany') === 0 ? '/fokontany/'
          : (chemin.indexOf('/commun') === 0 ? '/commun/' : '/ny-asako.html');
        return caches.match(req).then(function(r){
          return r || caches.match(repli);
        }).then(function(r){
          return r || pageHorsLigne();
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

// ============================================================
// Recevoir un partage venu d'ailleurs
//
// zara-rehetra.js envoie vers l'extérieur. Celui-ci fait l'inverse : « Ny
// asako » se déclare dans la feuille de partage du téléphone, au milieu de
// WhatsApp et de Facebook. Depuis n'importe quel site ouvert dans le
// navigateur, depuis la galerie, depuis une conversation — on touche
// « Partager », on choisit « Ny asako », et ce qu'on partageait arrive dans
// la boîte « Écrire », prêt à publier dans le fil.
//
// Trois pièces, et il faut les trois :
//   — manifest.webmanifest déclare « share_target » : c'est lui qui fait
//     apparaître l'application dans la feuille de partage. Rien à faire ici ;
//   — sw.js reçoit le POST du téléphone et met le partage de côté : une page
//     ne peut pas lire un POST qu'elle n'a pas envoyé ;
//   — ce fichier va le chercher et remplit la boîte.
//
// Deux portes d'entrée, parce qu'une seule laisse du monde dehors :
//
//   — la feuille de partage du système. Elle ne s'ouvre que pour une
//     application installée, et seuls Android et Windows la proposent aux
//     sites web ; sur iPhone, Safari ne partage vers aucun site, et aucun
//     code d'ici n'y change quoi que ce soit ;
//   — une adresse ordinaire, « /?zara-lien=…&zara-texte=… ». N'importe quel
//     site peut y envoyer un lien sans rien installer, et elle marche
//     partout, iPhone compris. C'est le repli, et c'est aussi ce qu'un autre
//     site met derrière son propre bouton « Partager ».
//
// Ce qui arrive n'est jamais publié tout seul : le partage remplit la boîte,
// la personne relit, et c'est elle qui appuie sur « Publier ».
// ============================================================
(function () {
  'use strict';

  var CACHE_PARTAGE = 'nyasako-partage-entrant';
  var NOTES = '/__zara/notes';
  // Un partage lu dans l'adresse ne tient qu'à l'adresse, et l'adresse ne
  // survit pas au rechargement qu'un service worker fraîchement installé
  // provoque — le jour d'une mise à jour, le lien partagé disparaissait sans
  // rien dire. Il passe donc par l'onglet, le temps d'être posé dans la boîte.
  var CLE_ONGLET = 'nyasako_zara_miditra';
  // Un partage qu'on n'est jamais venu reprendre — l'application fermée
  // aussitôt, la connexion abandonnée — ne doit pas ressurgir des semaines
  // plus tard dans la boîte de quelqu'un qui ne s'y attend plus.
  var PEREMPTION = 24 * 60 * 60 * 1000;
  // La boîte n'existe qu'une fois la personne entrée dans l'application. On
  // repasse tant qu'elle n'est pas là, puis on renonce : le partage, lui,
  // reste au chaud et repartira à la prochaine ouverture.
  var PAS = 800;
  var ESSAIS = 450;

  function texteDuPartage(p) {
    var morceaux = [];

    // Android range volontiers la même chose dans deux cases : le titre d'une
    // page se retrouve dans « texte », et l'adresse dans les deux. Recopiée
    // telle quelle, l'annonce dirait tout en double. Un morceau qui est déjà
    // contenu dans un autre ne s'ajoute donc pas, et celui qui en redit un
    // plus longuement prend sa place.
    function ajouter(valeur) {
      var v = String(valeur || '').trim();
      if (!v) return;
      for (var i = morceaux.length - 1; i >= 0; i--) {
        if (morceaux[i].indexOf(v) !== -1) return;
        if (v.indexOf(morceaux[i]) !== -1) morceaux.splice(i, 1);
      }
      morceaux.push(v);
    }

    ajouter(p.titre);
    ajouter(p.texte);
    ajouter(p.lien);
    // La boîte « Écrire » est une ligne, pas un pavé : un retour à la ligne y
    // est effacé sans bruit, et les morceaux se retrouveraient collés.
    return morceaux.join(' — ').trim();
  }

  // Le mot qui dit d'où vient ce qui vient d'apparaître dans la boîte. Sans
  // lui, on croit avoir touché le crayon par mégarde.
  function annoncer(message, erreur) {
    var avis = document.getElementById('avisZaraMiditra');
    if (!avis) {
      avis = document.createElement('div');
      avis.id = 'avisZaraMiditra';
      avis.style.cssText = 'position:fixed; left:50%; transform:translateX(-50%); ' +
        'bottom:calc(env(safe-area-inset-bottom, 0px) + 96px); z-index:9999; max-width:88vw; ' +
        'padding:0.6rem 0.95rem; border-radius:12px; font-size:0.86rem; line-height:1.35; ' +
        'text-align:center; box-shadow:0 6px 20px rgba(0,0,0,0.28); pointer-events:none;';
      document.body.appendChild(avis);
    }
    avis.style.background = erreur ? '#e5484d' : '#1f9d55';
    avis.style.color = '#fff';
    avis.textContent = message;
    avis.style.display = 'block';
    clearTimeout(avis.__minuteur);
    avis.__minuteur = setTimeout(function () { avis.style.display = 'none'; }, 5200);
  }

  // Glisser un fichier dans un champ « file » demande un DataTransfer : c'est
  // le seul objet dont le navigateur accepte la liste de fichiers. On passe
  // par le champ plutôt que d'écrire à côté de parametres.js — redimensionner
  // la photo, l'afficher, envoyer la vidéo au bucket, tout cela est déjà
  // écrit là-bas et se déclenche au « change ».
  function deposerDansLeChamp(champ, fichiers) {
    if (!champ || !fichiers.length) return false;
    var boite;
    try { boite = new DataTransfer(); } catch (e) { return false; }
    fichiers.forEach(function (f) { boite.items.add(f); });
    try { champ.files = boite.files; } catch (e) { return false; }
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function ouvrirLaBoite() {
    var boite = document.getElementById('fbComposer');
    if (!boite) return;
    if (boite.style.display !== 'none') return;
    // Le crayon fait tout ce qu'il faut : il pose la boîte au bon endroit et
    // marque le bouton ouvert. L'afficher à la main laisserait l'un et
    // l'autre en arrière.
    var crayon = document.getElementById('barComposer') || document.getElementById('composerToggle');
    if (crayon) crayon.click();
    else boite.style.display = '';
  }

  function remplir(partage) {
    // L'application s'ouvre après coup, une fois la connexion faite. Avant
    // cela, la boîte est bien dans la page mais personne ne la voit : y
    // déposer le partage, c'est le perdre. On repassera.
    var ecran = document.getElementById('appScreen');
    if (!ecran || getComputedStyle(ecran).display === 'none') return false;
    var champ = document.getElementById('newsMessage');
    if (!champ) return false;

    ouvrirLaBoite();

    var texte = texteDuPartage(partage);
    if (texte) {
      // Ce qui était déjà écrit reste : on ajoute à la suite, on n'efface pas
      // une phrase commencée.
      var deja = String(champ.value || '').trim();
      champ.value = deja ? deja + ' ' + texte : texte;
      champ.focus({ preventScroll: true });
      try { champ.setSelectionRange(champ.value.length, champ.value.length); } catch (e) {}
    }

    var fichiers = partage.fichiers || [];
    var sary = fichiers.filter(function (f) { return String(f.type).indexOf('image/') === 0; });
    var video = fichiers.filter(function (f) { return String(f.type).indexOf('video/') === 0; });
    var refuses = fichiers.length - sary.length - video.length;

    var posees = deposerDansLeChamp(document.getElementById('newsImage'), sary);
    // Une seule vidéo par annonce (parametres.js le redit s'il en arrive deux).
    var posee = deposerDansLeChamp(document.getElementById('newsVideo'), video.slice(0, 1));

    var mots = [];
    if (texte) mots.push('ny soratra');
    if (posees) mots.push(sary.length > 1 ? sary.length + ' sary' : 'ny sary');
    if (posee) mots.push('ny video');
    if (!mots.length) return false;

    var avis = 'Voaray ' + mots.join(' sy ') + '. Jereo, avy eo tsindrio « Publier ».';
    if (refuses > 0) avis += ' (Tsy azo raisina ny rakitra ' + refuses + ' hafa.)';
    if (sary.length && !posees) avis += ' (Tsy tafiditra ny sary : ampiasao ny 🖼️.)';
    annoncer(avis, false);
    return true;
  }

  // ---- Le partage mis de côté par le service worker ----

  function viderLeCache() {
    if (!window.caches) return Promise.resolve();
    return caches.delete(CACHE_PARTAGE).catch(function () {});
  }

  function lireLeCache() {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(CACHE_PARTAGE).then(function (cache) {
      return cache.match(NOTES).then(function (rep) {
        if (!rep) return null;
        return rep.json().then(function (notes) {
          if (!notes) return null;
          if (notes.recu && Date.now() - notes.recu > PEREMPTION) {
            return viderLeCache().then(function () { return null; });
          }
          var attendus = notes.fichiers || [];
          return Promise.all(attendus.map(function (f) {
            return cache.match(f.adresse).then(function (r) {
              if (!r) return null;
              return r.blob().then(function (b) {
                return new File([b], f.nom || 'zara', { type: f.type || b.type || 'application/octet-stream' });
              });
            });
          })).then(function (fichiers) {
            notes.fichiers = fichiers.filter(Boolean);
            return notes;
          });
        });
      });
    }).catch(function () { return null; });
  }

  // ---- Le partage venu d'une simple adresse ----
  //
  // « /?zara-lien=…&zara-texte=…&zara-titre=… ». Les paramètres quittent
  // l'adresse une fois lus : rechargée, la page ne remplirait pas la boîte
  // une seconde fois.
  function lireLAdresse() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return null; }
    var partage = {
      titre: params.get('zara-titre') || '',
      texte: params.get('zara-texte') || '',
      lien: params.get('zara-lien') || '',
      fichiers: []
    };
    var marque = params.get('zara');
    // « ?zara=1 » ne porte rien : c'est le service worker qui l'a mis pour
    // dire d'où l'on vient. Il s'efface avec les autres, sinon il resterait
    // dans l'adresse et dans le prochain lien qu'on en tire.
    if (!partage.titre && !partage.texte && !partage.lien && !marque) return null;

    ['zara', 'zara-titre', 'zara-texte', 'zara-lien'].forEach(function (c) { params.delete(c); });
    var reste = params.toString();
    try {
      history.replaceState(null, '', window.location.pathname + (reste ? '?' + reste : '') + window.location.hash);
    } catch (e) {}

    if (marque === 'raty') return { echec: true };
    if (!partage.titre && !partage.texte && !partage.lien) return null;
    return partage;
  }

  function garderDansLOnglet(partage) {
    try { sessionStorage.setItem(CLE_ONGLET, JSON.stringify(partage)); } catch (e) {}
  }

  function reprendreDeLOnglet() {
    var brut;
    try { brut = sessionStorage.getItem(CLE_ONGLET); } catch (e) { return null; }
    if (!brut) return null;
    try { return JSON.parse(brut); } catch (e) { return null; }
  }

  function viderLOnglet() {
    try { sessionStorage.removeItem(CLE_ONGLET); } catch (e) {}
  }

  // ---- La livraison ----

  function livrer(partage, unefoisLivre) {
    if (!partage) return;
    if (partage.echec) {
      annoncer('Tsy tonga soa aman-tsara ilay zaraina. Andramo indray.', true);
      if (unefoisLivre) unefoisLivre();
      return;
    }
    // Un partage vide — cela arrive, l'autre application n'ayant rien mis
    // dans les cases — ne vaut pas six minutes de rappels.
    if (!texteDuPartage(partage) && !(partage.fichiers || []).length) {
      if (unefoisLivre) unefoisLivre();
      return;
    }
    var restants = ESSAIS;
    (function essayer() {
      if (remplir(partage)) {
        if (unefoisLivre) unefoisLivre();
        return;
      }
      if (--restants <= 0) return;
      setTimeout(essayer, PAS);
    })();
  }

  function demarrer() {
    // L'adresse d'abord : elle est là tout de suite, et ce qu'on y lit tient
    // dans l'onglet jusqu'à la livraison — un rechargement ne doit pas
    // l'emporter.
    var parLAdresse = lireLAdresse();
    if (parLAdresse && !parLAdresse.echec) garderDansLOnglet(parLAdresse);
    else if (!parLAdresse) parLAdresse = reprendreDeLOnglet();
    if (parLAdresse) livrer(parLAdresse, viderLOnglet);

    lireLeCache().then(function (partage) {
      if (!partage) return;
      // Le partage ne quitte le cache qu'une fois posé dans la boîte. Rangé
      // à la lecture, il disparaîtrait avec le rechargement que provoque un
      // service worker fraîchement installé — et c'est justement le jour
      // d'une mise à jour qu'on partage sans le savoir.
      livrer(partage, viderLeCache);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})();

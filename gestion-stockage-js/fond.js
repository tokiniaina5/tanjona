// Le fond de l'application.
//
// Depuis que l'Accueil et les pages s'ouvrent en fenêtre, il reste du vide
// autour d'elles. On y met ce qu'on veut : une image prise dans l'appareil,
// qui remplit l'écran quelle qu'en soit la taille.
//
// L'image ne quitte jamais l'appareil : elle est réduite ici, puis rangée
// dans le navigateur. Rien n'est envoyé nulle part.

(function () {
  const CLE = 'stockmanager_fond';
  // Le côté le plus long. Une photo de téléphone fait quatre mille pixels :
  // rangée telle quelle, elle dépasse à elle seule ce que le navigateur
  // accepte de garder, et aucun écran n'en montrerait la différence.
  const COTE_MAX = 1600;

  function lire() {
    try { return localStorage.getItem(CLE) || ''; } catch (e) { return ''; }
  }
  function ecrire(url) {
    try { localStorage.setItem(CLE, url); return true; } catch (e) { return false; }
  }
  function oublier() {
    try { localStorage.removeItem(CLE); } catch (e) {}
  }

  // « cover » et non « contain » : l'image remplit l'écran et se recadre, au
  // lieu de laisser deux bandes vides sur les côtés. « fixed » pour qu'elle
  // reste en place pendant qu'on descend dans le fil.
  function appliquer(url) {
    const b = document.body;
    if (url) {
      b.style.backgroundImage = 'url("' + url + '")';
      b.style.backgroundSize = 'cover';
      b.style.backgroundPosition = 'center';
      b.style.backgroundRepeat = 'no-repeat';
      b.style.backgroundAttachment = 'fixed';
    } else {
      b.style.backgroundImage = '';
      b.style.backgroundSize = '';
      b.style.backgroundPosition = '';
      b.style.backgroundRepeat = '';
      b.style.backgroundAttachment = '';
    }
  }

  // Le fond est posé avant tout le reste : on ne veut pas voir l'application
  // s'ouvrir nue puis se rhabiller.
  appliquer(lire());

  function reduire(fichier) {
    return new Promise(function (resolve, reject) {
      const lecteur = new FileReader();
      lecteur.onerror = function () { reject(new Error('Fichier illisible.')); };
      lecteur.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Ce fichier n’est pas une image.')); };
        img.onload = function () {
          const echelle = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
          const toile = document.createElement('canvas');
          toile.width = Math.max(1, Math.round(img.width * echelle));
          toile.height = Math.max(1, Math.round(img.height * echelle));
          toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height);
          // En JPEG : un fond n'a pas besoin de transparence, et le PNG d'une
          // photo pèse cinq fois plus pour le même résultat.
          resolve(toile.toDataURL('image/jpeg', 0.82));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const champ = document.getElementById('fondFichier');
    const choisir = document.getElementById('fondChoisirBtn');
    const retirer = document.getElementById('fondRetirerBtn');
    const etat = document.getElementById('fondEtat');
    const apercu = document.getElementById('fondApercu');
    if (!champ || !choisir || !retirer) return;

    function dire(texte) { if (etat) etat.textContent = texte; }

    function montrer() {
      const url = lire();
      if (apercu) {
        apercu.style.backgroundImage = url ? 'url("' + url + '")' : '';
        apercu.classList.toggle('vide', !url);
      }
      retirer.disabled = !url;
      dire(url ? 'Une image habille le fond.' : 'Aucune image : le fond reste uni.');
    }
    montrer();

    choisir.addEventListener('click', function () { champ.click(); });

    champ.addEventListener('change', function () {
      const fichier = champ.files && champ.files[0];
      if (!fichier) return;
      dire('Lecture de l’image…');
      reduire(fichier).then(function (url) {
        if (!ecrire(url)) {
          dire('Image trop lourde pour être gardée. Choisissez-en une plus légère.');
          return;
        }
        appliquer(url);
        montrer();
      }).catch(function (err) {
        dire(err.message || 'Image impossible à lire.');
      }).then(function () {
        // Le même fichier doit pouvoir être rechoisi : sans cela, le champ ne
        // change pas et l'événement ne repart pas.
        champ.value = '';
      });
    });

    retirer.addEventListener('click', function () {
      oublier();
      appliquer('');
      montrer();
    });
  });
})();

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

  // Tant que personne n'a choisi d'image, c'est le logo qui habille le fond :
  // un écran uni ne disait pas dans quelle application on se trouvait.
  // En SVG et non l'icône PNG : il couvre tout l'écran, et 512 pixels étirés
  // sur un écran d'ordinateur donnaient un « N » flou.
  const LOGO = '/fond-logo.svg';
  // Le fond du logo. L'écran entier en prend la couleur : le logo n'est plus
  // une vignette posée sur du noir, il est l'écran. La couleur des panneaux,
  // lue dans le thème : sombre la nuit, claire le jour — le dessin du logo, lui,
  // est transparent autour du « N ».
  const COULEUR_LOGO = 'var(--panel)';

  // Une photo : « cover », elle remplit l'écran et se recadre, au lieu de
  // laisser deux bandes vides sur les côtés.
  // Le logo : « contain ». Carré, il ne se recadre pas comme une photo — sur
  // un téléphone debout, « cover » coupait le « N » des deux côtés. Il tient
  // donc en entier, et la couleur de son fond remplit le reste : on ne voit
  // pas où il s'arrête.
  // « fixed » pour que le fond reste en place pendant qu'on descend.
  function appliquer(url) {
    const b = document.body;
    b.style.backgroundImage = 'url("' + (url || LOGO) + '")';
    b.style.backgroundSize = url ? 'cover' : 'contain';
    b.style.backgroundColor = url ? '' : COULEUR_LOGO;
    b.style.backgroundPosition = 'center';
    b.style.backgroundRepeat = 'no-repeat';
    b.style.backgroundAttachment = 'fixed';
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
        // L'aperçu montre ce qu'on verra : le logo quand rien n'est choisi.
        apercu.style.backgroundImage = 'url("' + (url || LOGO) + '")';
        apercu.style.backgroundSize = url ? 'cover' : 'contain';
        apercu.style.backgroundColor = url ? '' : COULEUR_LOGO;
        apercu.classList.toggle('vide', !url);
      }
      retirer.disabled = !url;
      dire(url
        ? 'Une image habille le fond.'
        : 'Aucune image choisie : le logo Ny asako habille le fond.');
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

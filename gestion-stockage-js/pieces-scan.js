// Scanner une CIN ou un passeport, plutôt que de recopier douze chiffres.
//
// La puce biométrique, elle, reste hors de portée : un navigateur ne la lit
// pas, et son contenu est scellé par l'État. Ce qui se lit ici, c'est ce qui
// est imprimé sur la carte — photographié, puis déchiffré.
//
// Deux faces, car une CIN ne dit pas tout du même côté : le numéro et le nom
// devant, la date et le lieu derrière. Les deux lectures se complètent, et
// c'est leur texte réuni qu'on interroge.
//
// Deux lectures pour chaque face, dans cet ordre :
//   1. le code (QR, code-barres) quand la carte en porte un et que le
//      navigateur sait les voir — instantané et sûr ;
//   2. le texte, sinon : les deux lignes du bas d'un passeport (la MRZ, faite
//      pour être lue par une machine), ou à défaut les chiffres et les dates
//      de la carte.
//
// Rien ne part tout seul : la lecture remplit le formulaire, et c'est la
// personne qui vérifie avant d'enregistrer. Une machine qui lit mal une date
// ne doit pas pouvoir l'écrire sans que personne ne la relise.

(function () {
  if (!document.getElementById('pieceScanBtn')) return;

  function $(id) { return document.getElementById(id); }

  const FACES = {
    recto: { apercu: 'pieceScanApercu', nom: 'recto' },
    verso: { apercu: 'pieceScanApercuVerso', nom: 'ambadika' }
  };

  let flux = null;
  let chargementOcr = null;
  let faceEnCours = 'recto';
  // Le texte lu de chaque face : on les interroge ensemble, une CIN ne disant
  // pas tout du même côté.
  let textes = { recto: '', verso: '' };
  // Ce que la lecture a posé dans le formulaire. Une correction à la main ne
  // doit pas être effacée par la lecture de la face suivante.
  let posesAuto = {};

  // Les photos attendent ici que pieces-identite.js les envoie, une fois la
  // ligne enregistrée : avant cela, elles n'auraient pas de ligne à rejoindre.
  window.__piecePhoto = { recto: null, verso: null };

  function statut(texte, erreur) {
    const el = $('pieceScanStatut');
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  function arreterCamera() {
    if (flux) {
      flux.getTracks().forEach(function (p) { p.stop(); });
      flux = null;
    }
    const v = $('pieceScanVideo');
    if (v) v.srcObject = null;
    $('pieceScanZone').style.display = 'none';
  }

  function ouvrirCamera(face) {
    faceEnCours = face;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('pieceScanFichier').click();
      return;
    }
    statut('Sokafy ny appareil photo…');
    // « environment » : l'appareil de derrière, celui qu'on pointe sur la
    // carte. Sans cela, un téléphone ouvre celui de l'écran.
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } })
      .then(function (s) {
        flux = s;
        const v = $('pieceScanVideo');
        v.srcObject = s;
        v.play();
        $('pieceScanZone').style.display = '';
        statut('Apetraho eo anoloana ny ' + FACES[face].nom + ' ny karatra, dia tsindrio « Alaina ny sary ».');
      }, function () {
        statut('Tsy nisokatra ny appareil photo : safidio ny sary avy amin\'ny rakitra.', true);
        $('pieceScanFichier').click();
      });
  }

  // Une image plus large ne se lit pas mieux : elle pèse seulement plus lourd
  // à envoyer. 1600 pixels suffisent aux chiffres d'une carte.
  function versCanvas(source, largeurSource, hauteurSource) {
    const largeur = Math.min(largeurSource || 1280, 1600);
    const ratio = largeur / (largeurSource || 1280);
    const c = document.createElement('canvas');
    c.width = Math.round(largeur);
    c.height = Math.round((hauteurSource || 720) * ratio);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  function garderLaPhoto(canvas, face) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      window.__piecePhoto[face] = blob;
      const img = $(FACES[face].apercu);
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      const url = URL.createObjectURL(blob);
      img.dataset.url = url;
      img.src = url;
      img.style.display = '';
      $('pieceScanEffacer').style.display = '';
    }, 'image/jpeg', 0.85);
  }

  // ---------- Les deux lectures ----------

  function lireCode(canvas) {
    if (!('BarcodeDetector' in window)) return Promise.resolve('');
    let detecteur;
    try { detecteur = new window.BarcodeDetector(); } catch (e) { return Promise.resolve(''); }
    return detecteur.detect(canvas).then(function (codes) {
      return (codes && codes.length) ? String(codes[0].rawValue || '') : '';
    }, function () { return ''; });
  }

  function chargerOcr() {
    if (window.Tesseract) return Promise.resolve();
    if (chargementOcr) return chargementOcr;
    statut('Fampidirana ny mpamaky soratra… (indray mandeha ihany)');
    chargementOcr = new Promise(function (ok, non) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js';
      s.onload = ok;
      s.onerror = non;
      document.head.appendChild(s);
    });
    return chargementOcr;
  }

  function lireTexte(canvas) {
    return chargerOcr().then(function () {
      statut('Famakiana ny soratra… andraso kely.');
      return window.Tesseract.recognize(canvas, 'eng');
    }).then(function (res) {
      return (res && res.data && res.data.text) || '';
    });
  }

  // ---------- Ce qu'on tire du texte lu ----------

  // Les deux lignes du bas d'un passeport. Écrites pour une machine : c'est la
  // seule partie d'une pièce dont la lecture soit sûre.
  function lireMrz(texte) {
    const lignes = texte.split('\n').map(function (l) {
      return l.replace(/\s+/g, '').toUpperCase();
    }).filter(function (l) { return l.length >= 30 && l.indexOf('<') >= 0; });
    for (let i = 0; i < lignes.length - 1; i++) {
      if (lignes[i][0] !== 'P') continue;
      const haut = lignes[i], bas = lignes[i + 1];
      const noms = haut.slice(5).split('<<');
      const nom = (noms[0] || '').replace(/</g, ' ').trim();
      const prenoms = (noms[1] || '').replace(/</g, ' ').trim();
      return {
        anarana: (nom + ' ' + prenoms).replace(/\s+/g, ' ').trim(),
        laharana: bas.slice(0, 9).replace(/</g, '').trim(),
        fahataperana: dateMrz(bas.slice(21, 27))
      };
    }
    return null;
  }

  // AAMMJJ, sans le siècle : une date d'expiration est devant nous.
  function dateMrz(six) {
    if (!/^\d{6}$/.test(six)) return '';
    const annee = 2000 + Number(six.slice(0, 2));
    const mois = six.slice(2, 4), jour = six.slice(4, 6);
    if (Number(mois) < 1 || Number(mois) > 12 || Number(jour) < 1 || Number(jour) > 31) return '';
    return annee + '-' + mois + '-' + jour;
  }

  // Les mots imprimés sur toutes les cartes : ils ne sont le nom de personne.
  const MOTS_CARTE = ['REPOBLIKA', 'MALAGASY', 'CARTE', 'NATIONALE', 'IDENTITE', 'IDENTITY',
    'PASSEPORT', 'PASSPORT', 'NATIONAL', 'FIRENENA', 'KARAPANONDRO', 'MINISTERE', 'SEXE',
    'DATE', 'LIEU', 'ADRESSE', 'PROFESSION', 'SIGNATURE', 'FONENANA', 'TERAKA', 'RAY', 'RENY'];

  function chiffresDeCarte(texte) {
    const suites = texte.match(/\d[\d\s.]{8,20}\d/g) || [];
    let meilleur = '';
    suites.forEach(function (s) {
      const nus = s.replace(/\D/g, '');
      if (nus.length >= 10 && nus.length > meilleur.length) meilleur = nus;
    });
    return meilleur;
  }

  function premiereDate(texte) {
    const m = texte.match(/(\d{2})[\/.\- ](\d{2})[\/.\- ](\d{4})/);
    if (!m) return '';
    const mois = Number(m[2]);
    if (mois < 1 || mois > 12) return '';
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  // Le verso d'une CIN porte deux dates : la naissance et la délivrance. Prendre
  // la première venue, c'était inscrire l'une pour l'autre. On cherche donc la
  // date qui suit le mot qui l'annonce ; et quand aucun mot ne l'annonce mais
  // qu'une naissance est nommée, on préfère ne rien écrire.
  const MOTS_DELIVRANCE = ['NOMENA', 'DELIVR', 'DÉLIVR', 'ISSUE', 'NATAO'];
  const MOTS_NAISSANCE = ['TERAKA', 'NAISSANCE', 'BIRTH', 'NEE LE', 'NE LE'];

  function dateDeDelivrance(texte) {
    const haut = texte.toUpperCase();
    for (let i = 0; i < MOTS_DELIVRANCE.length; i++) {
      const place = haut.indexOf(MOTS_DELIVRANCE[i]);
      if (place < 0) continue;
      const trouvee = premiereDate(texte.slice(place, place + 80));
      if (trouvee) return trouvee;
    }
    const naissance = MOTS_NAISSANCE.some(function (m) { return haut.indexOf(m) >= 0; });
    return naissance ? '' : premiereDate(texte);
  }

  function nomProbable(texte) {
    const lignes = texte.split('\n').map(function (l) { return l.trim(); });
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (l.length < 6 || l.length > 40) continue;
      if (!/^[A-Za-zÀ-ÿ' -]+$/.test(l)) continue;
      if (l.split(/\s+/).length < 2) continue;
      const haut = l.toUpperCase();
      if (MOTS_CARTE.some(function (m) { return haut.indexOf(m) >= 0; })) continue;
      return l.replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  // Le vide se remplit ; ce que la personne a corrigé reste. Une seconde
  // lecture, elle, peut reprendre ce que la première avait posé.
  function poser(id, valeur) {
    if (!valeur) return false;
    const el = $(id);
    if (el.value && el.value !== posesAuto[id]) return false;
    el.value = valeur;
    posesAuto[id] = valeur;
    // Le champ « date d'expiration » ne paraît que pour un passeport : le
    // changement du type doit être annoncé.
    el.dispatchEvent(new Event('change'));
    return true;
  }

  function remplir() {
    const brut = (textes.recto + '\n' + textes.verso).trim();
    const mrz = lireMrz(brut);
    let poses = 0;

    if (mrz) {
      // La MRZ ne se trompe pas de type : c'est un passeport, et le dire
      // fait paraître le champ de la date d'expiration.
      const type = $('pieceType');
      type.value = 'passeport';
      type.dispatchEvent(new Event('change'));
      poses += poser('pieceNumero', mrz.laharana) ? 1 : 0;
      poses += poser('pieceNom', mrz.anarana) ? 1 : 0;
      poses += poser('pieceExpiration', mrz.fahataperana) ? 1 : 0;
    } else {
      poses += poser('pieceNumero', chiffresDeCarte(brut)) ? 1 : 0;
      poses += poser('pieceNom', nomProbable(brut)) ? 1 : 0;
      poses += poser('pieceDelivrance', dateDeDelivrance(brut)) ? 1 : 0;
    }

    const reste = !window.__piecePhoto.verso
      ? ' Alaivo koa ny ambadika (verso) : any matetika no misy ny daty sy ny toerana.'
      : '';
    statut(poses
      ? 'Vaky ny karatra : hamarino tsara ireo saha vao mitahiry.' + reste
      : 'Tsy azo vakiana ny karatra : soraty an-tanana ireo saha. Voatahiry ihany ny sary.' + reste, !poses);
  }

  function lire(canvas, face) {
    statut('Famakiana ny ' + FACES[face].nom + '…');
    lireCode(canvas).then(function (texte) {
      if (texte) return texte;
      return lireTexte(canvas);
    }).then(function (texte) {
      textes[face] = String(texte || '');
      remplir();
    }).catch(function () {
      statut('Tsy tafiditra ny mpamaky soratra : jereo ny réseau, na soraty an-tanana ireo saha.', true);
    });
  }

  function traiter(canvas, face) {
    garderLaPhoto(canvas, face);
    lire(canvas, face);
  }

  // ---------- Les boutons ----------

  $('pieceScanBtn').addEventListener('click', function () { ouvrirCamera('recto'); });
  $('pieceScanVersoBtn').addEventListener('click', function () { ouvrirCamera('verso'); });
  $('pieceScanFermer').addEventListener('click', function () { arreterCamera(); statut(''); });
  $('pieceScanPrendre').addEventListener('click', function () {
    const v = $('pieceScanVideo');
    if (!v.videoWidth) { statut('Mbola tsy vonona ny appareil photo.', true); return; }
    const face = faceEnCours;
    const canvas = versCanvas(v, v.videoWidth, v.videoHeight);
    arreterCamera();
    traiter(canvas, face);
  });

  $('pieceScanFichier').addEventListener('change', function () {
    const f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    const face = faceEnCours;
    const img = new Image();
    img.onload = function () {
      traiter(versCanvas(img, img.naturalWidth, img.naturalHeight), face);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = function () { statut('Tsy voavaky ilay sary.', true); };
    img.src = URL.createObjectURL(f);
  });

  // Effacer les photos : celles d'une autre personne, prises par erreur, ne
  // doivent pas partir avec la ligne qu'on est en train d'écrire.
  function viderPhoto() {
    window.__piecePhoto = { recto: null, verso: null };
    textes = { recto: '', verso: '' };
    posesAuto = {};
    Object.keys(FACES).forEach(function (face) {
      const img = $(FACES[face].apercu);
      if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
      img.removeAttribute('src');
      img.style.display = 'none';
    });
    $('pieceScanEffacer').style.display = 'none';
    arreterCamera();
    statut('');
  }
  $('pieceScanEffacer').addEventListener('click', viderPhoto);

  // pieces-identite.js s'en sert après un enregistrement, et à l'annulation.
  window.__viderPhotoPiece = viderPhoto;
})();

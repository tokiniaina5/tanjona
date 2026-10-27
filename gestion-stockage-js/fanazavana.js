/* ============================================================
   FANAZAVANA — les explications en visite guidée (modèle MVola)
   ------------------------------------------------------------
   Les paragraphes d'explication (texte gris, « color:var(--muted) ») ne
   restent plus dans la page : quand une page s'ouvre, ses explications
   passent une à une dans une visite guidée. L'écran s'assombrit, la partie
   expliquée reste éclairée, et une boîte blanche donne le texte avec
   « 1 / 3 », « Ignorer » et « Suivant ». Vue (ou ignorée) une fois, une
   explication ne revient plus sur cet appareil.

   On ne touche qu'aux vraies explications : pas aux lignes d'état que le
   code remplit (elles ont un id ou un data-*), pas aux textes courts, pas
   aux paragraphes qui portent un bouton ou un champ. Un texte gris qui
   n'est pas une explication (la note d'un client…) porte data-fz-tsia.
   Les pages dessinées après coup (photocopie, hôtellerie, partage…) sont
   prises au passage.
   ============================================================ */
(function () {
  'use strict';

  var PREFIXE = 'fz:';
  // Assez long pour être une explication : un paragraphe, ou le sous-titre
  // d'une page (« Kajy haingana… ») ; une note dans un champ, plus.
  var MIN_CARACTERES = 25;
  var MIN_SPAN = 40;
  // Explications dont le gris vient de la feuille de style et non de
  // l'attribut style : sous-titres des pages, écrans de connexion, notes des
  // pages menu sakafo / lakozia / handoa. Gardées seulement si elles sont
  // vraiment grises (la note d'une commande en lakozia, colorée, reste).
  var AUSSI = '.section-head p, .login-card > p.sub, .community-sub, .entana-fiche-rappel, ' +
    '.handoa-note, .handoa-intro, .installer p, p.note';
  // Un message d'état (liste vide, chargement) n'est pas une explication.
  var ETAT = /^(Tsy misy|Mbola tsy|Aucun|Aucune|Mamaky|Chargement|Miandry)/i;
  // Le gris de la page (--muted), tel que le navigateur le calcule.
  var grisCalcule = null;
  function gris() {
    if (grisCalcule === null) {
      var t = document.createElement('span');
      t.style.color = 'var(--muted)';
      document.body.appendChild(t);
      grisCalcule = getComputedStyle(t).color;
      t.remove();
    }
    return grisCalcule;
  }
  // Une explication en <div> ou <span> : seulement du texte, avec au plus du
  // gras, des liens ou des émojis dedans.
  var EN_LIGNE = /^(STRONG|B|EM|I|A|BR|SPAN|CODE|SMALL)$/;
  // Ce qui a déjà sa propre présentation reste tel quel.
  // L'espace admin aussi : ses panneaux se plient et se déplient d'un
  // toucher (securite.js), et chaque dépli relançait la visite par-dessus
  // la fenêtre — le titre semblait ne plus répondre. Ses notes restent
  // dans leur panneau.
  var EXCLUS = '#welcomeOverlay, #autoNoticeModal, #fzVisite, #section-admin';

  var connues = [];        // { p, cache, cle } — les explications repérées
  var visite = null;       // la visite en cours, s'il y en a une

  function cle(texte) {
    // Petite empreinte du texte : la même explication garde la même clé
    // d'une ouverture à l'autre, sans stocker le texte entier.
    var h = 5381;
    for (var i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
    return PREFIXE + (h >>> 0).toString(36) + texte.length;
  }
  function dejaVue(k) {
    try { return localStorage.getItem(k) === '1'; } catch (e) { return false; }
  }
  function marquerVue(k) {
    try { localStorage.setItem(k, '1'); } catch (e) {}
  }

  function estExplication(p) {
    if (p.id || p.closest(EXCLUS) || p.classList.contains('fz-ao-anaty')) return false;
    var attrs = p.attributes;
    for (var i = 0; i < attrs.length; i++) if (attrs[i].name.indexOf('data-') === 0) return false;
    // Ce que les gens publient (fil, aperçu de lien, reçu, tableau, liste)
    // est du contenu, pas une explication du site.
    if (p.closest('button, a, table, li, .fb-post, .recu, .bon, .plat, .story-zone')) return false;
    var enGris = p.style.color === 'var(--muted)' || p.classList.contains('panneau-note') ||
      (p.matches(AUSSI) && getComputedStyle(p).color === gris());
    if (!enGris) return false;
    if (p.querySelector('[id], input, select, textarea, button')) return false;
    if (p.tagName !== 'P') {
      for (var j = 0; j < p.children.length; j++) if (!EN_LIGNE.test(p.children[j].tagName)) return false;
    }
    // Déjà caché à l'arrivée : c'est le code qui choisit quand le montrer.
    if (p.style.display === 'none') return false;
    var texte = (p.textContent || '').replace(/\s+/g, ' ').trim();
    if (ETAT.test(texte)) return false;
    return texte.length >= (p.tagName === 'SPAN' ? MIN_SPAN : MIN_CARACTERES) ? texte : false;
  }

  // L'explication quitte la page : elle ne vit plus que dans la visite.
  function retenir(p) {
    var texte = estExplication(p);
    if (!texte) return;
    // La fiche « 💡 Fanazavana » du partage est cachée avec son texte.
    var cache = p.closest('[data-zr-fanazavana]') || p;
    cache.classList.add('fz-ao-anaty');
    p.classList.add('fz-ao-anaty');
    connues.push({ p: p, cache: cache, cle: cle(texte) });
  }

  var CANDIDATS = 'p, div[style*="--muted"], span[style*="--muted"]';
  function parcourir(racine) {
    if (!racine || racine.nodeType !== 1) return;
    if (racine.matches(CANDIDATS)) retenir(racine);
    var liste = racine.querySelectorAll(CANDIDATS);
    for (var i = 0; i < liste.length; i++) retenir(liste[i]);
  }

  // La page de l'explication est-elle à l'écran ? Le paragraphe est caché
  // par nous ; c'est son parent qui dit si la page est ouverte, et son
  // propre style si le code le montre en ce moment.
  function aLEcran(e) {
    if (!e.cache.isConnected) return false;
    if (e.p.style.display === 'none') return false;
    var parent = e.cache.parentElement;
    return !!(parent && parent.getClientRects().length);
  }

  function cible(e) {
    return e.cache.closest('.panel, .login-card, .plan-card, section, [role="dialog"], .carte, .installer, .etape') || e.cache.parentElement;
  }
  function titre(e, zone) {
    var h = zone && zone.querySelector('h1, h2, h3, h4');
    // Morceau par morceau, séparés d'une espace : « ① Antsoy… » ne doit pas
    // devenir « 1Antsoy… ».
    var t = '';
    if (h) {
      var w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) t += ' ' + w.currentNode.nodeValue;
      t = t.replace(/\s+/g, ' ').trim();
    }
    return t && t.length <= 60 ? t : '💡 Fanazavana';
  }

  function guideOuvert() {
    var w = document.getElementById('welcomeOverlay');
    return w && getComputedStyle(w).display !== 'none';
  }

  // ---------- la visite ----------
  var calque, lumiere, boite;

  function construire() {
    calque = document.createElement('div');
    calque.id = 'fzVisite';
    calque.setAttribute('role', 'dialog');
    calque.setAttribute('aria-modal', 'true');
    calque.innerHTML =
      '<div class="fz-lumiere"></div>' +
      '<div class="fz-boite">' +
        '<div class="fz-tete"><strong class="fz-titre"></strong><span class="fz-isa"></span></div>' +
        '<div class="fz-texte"></div>' +
        '<div class="fz-bokotra">' +
          '<button type="button" class="fz-ignorer">Ignorer</button>' +
          '<button type="button" class="fz-suivant">Suivant</button>' +
        '</div>' +
        '<div class="fz-points" aria-hidden="true"></div>' +
      '</div>';
    document.body.appendChild(calque);
    lumiere = calque.querySelector('.fz-lumiere');
    boite = calque.querySelector('.fz-boite');
    calque.querySelector('.fz-ignorer').addEventListener('click', function () { finir(); });
    calque.querySelector('.fz-suivant').addEventListener('click', function () {
      if (!visite) return;
      marquerVue(visite.etapes[visite.i].cle);
      if (visite.i < visite.etapes.length - 1) { visite.i++; montrer(); } else finir();
    });
    window.addEventListener('resize', placer);
    window.addEventListener('scroll', placer, true);
  }

  function commencer(etapes) {
    if (!calque) construire();
    visite = { etapes: etapes, i: 0 };
    calque.style.display = 'block';
    montrer();
  }

  function montrer() {
    var e = visite.etapes[visite.i];
    var zone = cible(e);
    calque.querySelector('.fz-titre').textContent = titre(e, zone);
    calque.querySelector('.fz-isa').textContent = (visite.i + 1) + ' / ' + visite.etapes.length;
    calque.querySelector('.fz-texte').innerHTML = e.p.innerHTML;
    calque.querySelector('.fz-suivant').textContent =
      visite.i === visite.etapes.length - 1 ? 'Vita' : 'Suivant';
    var points = calque.querySelector('.fz-points');
    points.innerHTML = '';
    for (var i = 0; i < visite.etapes.length; i++) {
      var d = document.createElement('span');
      if (i === visite.i) d.className = 'ici';
      points.appendChild(d);
    }
    visite.zone = zone;
    if (zone && zone.scrollIntoView) zone.scrollIntoView({ block: 'center', behavior: 'smooth' });
    placer();
    // Le défilement doux prend un instant : on recale une fois arrivé.
    setTimeout(placer, 350);
  }

  function placer() {
    if (!visite || !visite.zone) return;
    // La page a été quittée sous la visite : on la range sans la compter
    // comme vue, elle reviendra à la prochaine ouverture de la page.
    if (!visite.zone.isConnected || !visite.zone.getClientRects().length) { abandonner(); return; }
    var r = visite.zone.getBoundingClientRect();
    var marge = 6;
    var haut = Math.max(r.top - marge, 4);
    var bas = Math.min(r.bottom + marge, window.innerHeight - 4);
    lumiere.style.left = Math.max(r.left - marge, 4) + 'px';
    lumiere.style.top = haut + 'px';
    lumiere.style.width = Math.max(Math.min(r.right + marge, window.innerWidth - 4) - Math.max(r.left - marge, 4), 0) + 'px';
    lumiere.style.height = Math.max(bas - haut, 0) + 'px';
    // La boîte se met du côté où il reste le plus de place.
    var placeDessus = haut, placeDessous = window.innerHeight - bas;
    boite.style.top = boite.style.bottom = '';
    if (placeDessus >= placeDessous) boite.style.top = '12px';
    else boite.style.bottom = '12px';
  }

  function abandonner() {
    visite = null;
    calque.style.display = 'none';
    bientot();
  }

  function finir() {
    if (!visite) return;
    // « Ignorer » vaut pour toutes les explications de cette page.
    visite.etapes.forEach(function (e) { marquerVue(e.cle); });
    visite = null;
    calque.style.display = 'none';
    setTimeout(verifier, 600);
  }

  // Une page vient de s'ouvrir ? Ses explications pas encore vues partent
  // en visite, dans l'ordre de la page.
  function verifier() {
    if (visite || guideOuvert()) return;
    connues = connues.filter(function (e) { return e.cache.isConnected; });
    var etapes = connues.filter(function (e) {
      if (dejaVue(e.cle) || !aLEcran(e)) return false;
      var zone = cible(e);
      return !!(zone && zone.getClientRects().length);
    });
    if (!etapes.length) return;
    etapes.sort(function (a, b) {
      return a.cache.compareDocumentPosition(b.cache) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    commencer(etapes);
  }

  var minuteur = null;
  function bientot() {
    // On laisse la page finir de s'afficher avant d'y poser la visite. Pas
    // de remise à zéro : ce qui bouge sans cesse (stories, compteurs)
    // repousserait la visite indéfiniment.
    if (minuteur) return;
    minuteur = setTimeout(function () { minuteur = null; verifier(); }, 700);
  }

  var style = document.createElement('style');
  style.textContent =
    '.fz-ao-anaty{ display:none !important; }' +
    '#fzVisite{ display:none; position:fixed; inset:0; z-index:10050; }' +
    '#fzVisite .fz-lumiere{ position:fixed; border-radius:16px; box-shadow:0 0 0 200vmax rgba(0,0,0,0.62);' +
      ' transition:left .25s, top .25s, width .25s, height .25s; pointer-events:none; }' +
    '#fzVisite .fz-boite{ position:fixed; left:50%; transform:translateX(-50%); width:min(92vw, 480px);' +
      ' background:#fff; color:#111; border-radius:22px; padding:1.1rem 1.2rem 0.9rem; box-shadow:0 10px 30px rgba(0,0,0,.35);' +
      ' font-family:var(--font-body, sans-serif); }' +
    '#fzVisite .fz-tete{ display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:0.5rem; }' +
    '#fzVisite .fz-titre{ font-size:1.05rem; line-height:1.3; color:#111; }' +
    '#fzVisite .fz-isa{ font-size:0.9rem; color:#777; white-space:nowrap; }' +
    '#fzVisite .fz-texte{ font-size:0.92rem; line-height:1.55; color:#222; margin-bottom:1rem; }' +
    '#fzVisite .fz-texte strong{ color:#000 !important; }' +
    '#fzVisite .fz-bokotra{ display:flex; gap:0.7rem; }' +
    '#fzVisite .fz-bokotra button{ flex:1; border-radius:999px; padding:0.7rem 1rem; font-size:0.95rem; cursor:pointer; font-family:inherit; }' +
    '#fzVisite .fz-ignorer{ background:#fff; color:#111; border:2px solid #111; }' +
    '#fzVisite .fz-suivant{ background:#111; color:#fff; border:2px solid #111; }' +
    '#fzVisite .fz-points{ display:flex; justify-content:center; gap:6px; margin-top:0.8rem; }' +
    '#fzVisite .fz-points span{ width:7px; height:7px; border-radius:999px; background:#ccc; transition:width .2s; }' +
    '#fzVisite .fz-points span.ici{ width:22px; background:#111; }';
  document.head.appendChild(style);

  function demarrer() {
    parcourir(document.body);
    // Les pages dessinées plus tard passent par ici, regroupées par image ;
    // un changement d'affichage (on ouvre une page, un onglet) relance le
    // repérage de ce qui est à l'écran.
    var enAttente = [];
    var prevu = false;
    new MutationObserver(function (mutations) {
      var affichage = false;
      mutations.forEach(function (m) {
        if (m.type === 'attributes') { if (!calque || !calque.contains(m.target)) affichage = true; return; }
        for (var i = 0; i < m.addedNodes.length; i++) enAttente.push(m.addedNodes[i]);
      });
      if (affichage) { if (visite) requestAnimationFrame(placer); else bientot(); }
      if (prevu || !enAttente.length) return;
      prevu = true;
      requestAnimationFrame(function () {
        prevu = false;
        var lot = enAttente; enAttente = [];
        lot.forEach(function (n) { if (n.isConnected) parcourir(n); });
        bientot();
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    document.addEventListener('click', bientot, true);
    bientot();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

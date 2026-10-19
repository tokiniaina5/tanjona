/* ============================================================
   FANAZAVANA — les explications deviennent des petites fiches
   ------------------------------------------------------------
   Partout dans l'application, les paragraphes d'explication (texte gris,
   « color:var(--muted) ») sont rangés dans une petite fiche « 💡 Fanazavana »
   avec un ✕. Fermée une fois, une fiche ne revient plus sur cet appareil.

   On ne touche qu'aux vraies explications : pas aux lignes d'état que le
   code remplit (elles ont un id ou un data-*), pas aux textes courts, pas
   aux paragraphes qui portent un bouton ou un champ. Un texte gris qui
   n'est pas une explication (la note d'un client…) porte data-fz-tsia. Les pages dessinées
   après coup (photocopie, hôtellerie, partage…) sont prises au passage.
   ============================================================ */
(function () {
  'use strict';

  var PREFIXE = 'fz:';
  var MIN_CARACTERES = 50;
  // Ce qui a déjà sa propre présentation reste tel quel.
  var EXCLUS = '#welcomeOverlay, #autoNoticeModal, [data-zr-fanazavana], .fz-karatra';

  function cle(texte) {
    // Petite empreinte du texte : la même explication garde la même clé
    // d'une ouverture à l'autre, sans stocker le texte entier.
    var h = 5381;
    for (var i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
    return PREFIXE + (h >>> 0).toString(36) + texte.length;
  }

  function dejaFermee(k) {
    try { return localStorage.getItem(k) === '1'; } catch (e) { return false; }
  }
  function fermer(k) {
    try { localStorage.setItem(k, '1'); } catch (e) {}
  }

  function estExplication(p) {
    if (p.id || p.closest(EXCLUS)) return false;
    var attrs = p.attributes;
    for (var i = 0; i < attrs.length; i++) if (attrs[i].name.indexOf('data-') === 0) return false;
    var gris = p.style.color === 'var(--muted)' || p.classList.contains('panneau-note');
    if (!gris) return false;
    if (p.querySelector('[id], input, select, textarea, button')) return false;
    // Déjà caché à l'arrivée : c'est le code qui choisit quand le montrer.
    if (p.style.display === 'none') return false;
    var texte = (p.textContent || '').replace(/\s+/g, ' ').trim();
    return texte.length >= MIN_CARACTERES ? texte : false;
  }

  function habiller(p) {
    var texte = estExplication(p);
    if (!texte) return;
    var k = cle(texte);
    var fiche = document.createElement('div');
    fiche.className = 'fz-karatra';
    if (dejaFermee(k)) fiche.style.display = 'none';
    fiche.innerHTML =
      '<button type="button" class="fz-hidio" aria-label="Hidio ny fanazavana" title="Hidio">✕</button>' +
      '<div class="fz-lohateny">💡 Fanazavana</div>';
    fiche.querySelector('.fz-hidio').addEventListener('click', function () {
      fiche.style.display = 'none';
      fermer(k);
    });
    p.parentNode.insertBefore(fiche, p);
    fiche.appendChild(p);
  }

  function parcourir(racine) {
    if (!racine || racine.nodeType !== 1) return;
    if (racine.tagName === 'P') { habiller(racine); return; }
    var liste = racine.querySelectorAll('p');
    for (var i = 0; i < liste.length; i++) habiller(liste[i]);
  }

  var style = document.createElement('style');
  style.textContent =
    '.fz-karatra{ position:relative; border:1px solid var(--line); border-left:3px solid var(--cyan);' +
      ' border-radius:8px; background:var(--panel-2); padding:0.6rem 2.2rem 0.6rem 0.85rem; margin:0.5rem 0 0.8rem; text-align:left; }' +
    '.fz-karatra > p{ margin:0 !important; }' +
    '.fz-karatra:has(> p[style*="display: none"]), .fz-karatra:has(> p[style*="display:none"]){ display:none; }' +
    '.fz-hidio{ position:absolute; top:0.3rem; right:0.45rem; background:none; border:none; color:var(--muted);' +
      ' font-size:1.05rem; line-height:1; cursor:pointer; padding:0.2rem; }' +
    '.fz-hidio:hover{ color:var(--text); }' +
    '.fz-lohateny{ font-size:0.66rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--cyan);' +
      ' font-family:var(--font-mono); margin-bottom:0.25rem; }';
  document.head.appendChild(style);

  function demarrer() {
    parcourir(document.body);
    // Les pages dessinées plus tard passent par ici, regroupées par image.
    var enAttente = [];
    var prevu = false;
    new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) enAttente.push(m.addedNodes[i]);
      });
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(function () {
        prevu = false;
        var lot = enAttente; enAttente = [];
        lot.forEach(function (n) { if (n.isConnected) parcourir(n); });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

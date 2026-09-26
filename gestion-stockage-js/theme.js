// Mode jour, mode nuit.
//
// Deux façons de choisir, comme pour la rangée du bas :
//   - manuel : un curseur, comme celui du volume. Monté, l'écran s'éclaire ;
//     descendu, il s'assombrit. Tout en bas, la nuit d'origine ; tout en
//     haut, le jour d'origine ; et toutes les teintes entre les deux.
//   - automatique : l'heure décide — le jour de 6 h à 18 h, la nuit le reste
//     du temps. La page bascule d'elle-même quand l'heure passe, sans qu'on
//     ait à la recharger.
//
// Le bouton du menu ouvre ce choix. Comme toute entrée du menu, il se pose
// aussi dans la rangée du bas ; son icône montre le mode en cours.
//
// Les teintes du curseur sont calculées dans l'en-tête de la page
// (index.html, window.__appliquerNiveau) : la page s'ouvre déjà à la bonne
// luminosité, et ce fichier reprend la même fonction quand on bouge le curseur.

(function () {
  const CLE_CHOIX = 'stockmanager_theme';
  const CLE_MODE = 'stockmanager_theme_mode';
  const CLE_NIVEAU = 'stockmanager_theme_niveau';
  const DEBUT_JOUR = 6;
  const FIN_JOUR = 18;

  const bouton = document.getElementById('menuTheme');
  const panneau = document.getElementById('themePanneau');
  const curseur = document.getElementById('themeNiveau');
  if (!bouton || !panneau) return;

  function lire(cle) {
    try { return localStorage.getItem(cle); } catch (e) { return null; }
  }
  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, String(valeur)); } catch (e) {}
  }

  function lireMode() {
    return lire(CLE_MODE) === 'auto' ? 'auto' : 'manuel';
  }
  // Ceux qui avaient choisi « jour » ou « nuit » avant le curseur retrouvent
  // leur choix, poussé tout en haut ou tout en bas.
  function lireNiveau() {
    const brut = lire(CLE_NIVEAU);
    if (brut !== null && isFinite(Number(brut))) return Math.max(0, Math.min(100, Number(brut)));
    return lire(CLE_CHOIX) === 'jour' ? 100 : 0;
  }

  function selonLHeure() {
    const h = new Date().getHours();
    return (h >= DEBUT_JOUR && h < FIN_JOUR) ? 'jour' : 'alina';
  }
  function themeEnCours() {
    return lireMode() === 'auto' ? selonLHeure() : (lireNiveau() >= 50 ? 'jour' : 'alina');
  }

  function appliquer() {
    const mode = lireMode();
    const theme = themeEnCours();
    const racine = document.documentElement;

    if (mode === 'auto') {
      // Pas de teinte intermédiaire : les deux thèmes fixes, selon l'heure.
      if (typeof window.__effacerNiveau === 'function') window.__effacerNiveau();
      if (theme === 'jour') racine.setAttribute('data-theme', 'jour');
      else racine.removeAttribute('data-theme');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'jour' ? '#eef2f5' : '#0a0d10');
    } else if (typeof window.__appliquerNiveau === 'function') {
      window.__appliquerNiveau(lireNiveau());
    }

    const emoji = theme === 'jour' ? '☀️' : '🌙';
    bouton.textContent = emoji + ' Andro / Alina';
    bouton.setAttribute('aria-label', 'Mode andro / alina');

    // Son icône dans la rangée a été posée avec l'ancien libellé : elle ne le
    // relit pas d'elle-même. Seul son premier nœud est du texte — la croix qui
    // suit est un élément, et doit rester.
    const icone = document.querySelector('#stockMainTabs [data-epingle="id:menuTheme"]');
    if (icone) {
      if (icone.firstChild && icone.firstChild.nodeType === 3) icone.firstChild.nodeValue = emoji;
      const titre = mode === 'auto'
        ? 'Mode ' + (theme === 'jour' ? 'andro' : 'alina') + ' (automatique)'
        : 'Hazavana ' + lireNiveau() + ' %';
      icone.title = titre;
      icone.setAttribute('aria-label', titre);
    }

    panneau.querySelectorAll('[data-theme-mode]').forEach(function (b) {
      b.classList.toggle('actif', b.dataset.themeMode === mode);
    });
    // Le curseur ne sert qu'en manuel : en automatique, il proposerait un
    // geste que l'heure défait.
    const manuel = document.getElementById('themeManuel');
    if (manuel) manuel.style.display = mode === 'manuel' ? '' : 'none';
    // Ne pas le repositionner pendant qu'on le tire : il sauterait sous le doigt.
    if (curseur && document.activeElement !== curseur) curseur.value = String(lireNiveau());

    const note = document.getElementById('themeNote');
    if (note) {
      note.textContent = mode === 'auto'
        ? 'Andro manomboka amin\'ny ' + DEBUT_JOUR + ' ora maraina ka hatramin\'ny ' + (FIN_JOUR - 12) + ' ora hariva, alina amin\'ny ora hafa. Miova ho azy.'
        : 'Akaro mankany amin\'ny ☀️ ho andro, ampidino mankany amin\'ny 🌙 ho alina (' + lireNiveau() + ' %).';
    }
  }

  // ---------- Le panneau ----------

  // Au-dessus de la rangée du bas, au milieu : là où s'ouvrent déjà ses
  // réglages, pour que les deux choix se trouvent au même endroit.
  function placer() {
    const r = document.querySelector('.dash-tabs-main');
    const haute = (r && !r.classList.contains('barre-cachee') && getComputedStyle(r).display !== 'none')
      ? r.getBoundingClientRect().height : 0;
    panneau.style.bottom = (haute + 10) + 'px';
    panneau.style.top = 'auto';
    const large = panneau.getBoundingClientRect().width;
    let gauche = (window.innerWidth - large) / 2;
    gauche = Math.max(8, Math.min(gauche, window.innerWidth - large - 8));
    panneau.style.left = gauche + 'px';
  }

  function ouvrir(oui) {
    panneau.style.display = oui ? 'block' : 'none';
    bouton.setAttribute('aria-expanded', oui ? 'true' : 'false');
    if (!oui) return;
    // Le menu s'efface : ouvert, il recouvrirait le panneau qu'il vient
    // d'appeler.
    const menu = document.getElementById('navList');
    if (menu) menu.classList.remove('open');
    ['menuToggle', 'menuFlottant'].forEach(function (id) {
      const p = document.getElementById(id);
      if (p) p.setAttribute('aria-expanded', 'false');
    });
    placer();
  }

  // Hors de la page : le panneau flotte au-dessus de tout, comme les autres.
  document.body.appendChild(panneau);

  bouton.addEventListener('click', function (e) {
    // Sans cela, le guetteur de « clic à côté » refermerait le panneau dans
    // le geste même qui l'ouvre.
    e.stopPropagation();
    ouvrir(panneau.style.display !== 'block');
  });

  panneau.querySelectorAll('[data-theme-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      // Passer en manuel garde ce qu'on voit : l'écran ne doit pas changer de
      // couleur au moment où l'on prend la main.
      if (b.dataset.themeMode === 'manuel' && lireMode() === 'auto') {
        ecrire(CLE_NIVEAU, selonLHeure() === 'jour' ? 100 : 0);
      }
      ecrire(CLE_MODE, b.dataset.themeMode === 'auto' ? 'auto' : 'manuel');
      appliquer();
    });
  });

  if (curseur) {
    // « input » et non « change » : l'écran suit le doigt pendant qu'il glisse,
    // pas seulement quand il se lève.
    curseur.addEventListener('input', function () {
      ecrire(CLE_NIVEAU, curseur.value);
      ecrire(CLE_MODE, 'manuel');
      appliquer();
    });
  }

  // ---------- Luminosité et contraste ----------
  // Par-dessus les couleurs du thème, dans les deux modes. Le filtre lui-même
  // est posé par l'en-tête de la page (window.__appliquerFiltre).
  const CLE_LUM = 'stockmanager_luminosite';
  const CLE_CON = 'stockmanager_contraste';
  const curseurLum = document.getElementById('themeLuminosite');
  const curseurCon = document.getElementById('themeContraste');

  function valeur(cle) {
    const n = Number(lire(cle));
    return (lire(cle) !== null && isFinite(n)) ? Math.max(50, Math.min(150, n)) : 100;
  }

  function appliquerFiltre() {
    const lum = valeur(CLE_LUM);
    const con = valeur(CLE_CON);
    if (typeof window.__appliquerFiltre === 'function') window.__appliquerFiltre(lum, con);
    const vl = document.getElementById('themeLuminositeVal');
    const vc = document.getElementById('themeContrasteVal');
    if (vl) vl.textContent = lum + ' %';
    if (vc) vc.textContent = con + ' %';
    if (curseurLum && document.activeElement !== curseurLum) curseurLum.value = String(lum);
    if (curseurCon && document.activeElement !== curseurCon) curseurCon.value = String(con);
  }

  [[curseurLum, CLE_LUM], [curseurCon, CLE_CON]].forEach(function (paire) {
    if (!paire[0]) return;
    paire[0].addEventListener('input', function () {
      ecrire(paire[1], paire[0].value);
      appliquerFiltre();
    });
  });

  const reinitialiser = document.getElementById('themeReinitialiser');
  if (reinitialiser) {
    reinitialiser.addEventListener('click', function () {
      try { localStorage.removeItem(CLE_LUM); localStorage.removeItem(CLE_CON); } catch (e) {}
      if (curseurLum) curseurLum.blur();
      if (curseurCon) curseurCon.blur();
      appliquerFiltre();
    });
  }

  document.addEventListener('click', function (e) {
    if (panneau.style.display !== 'block') return;
    if (panneau.contains(e.target) || bouton.contains(e.target)) return;
    // L'icône de la rangée ouvre aussi le panneau : un clic sur elle n'est pas
    // un clic à côté.
    const icone = document.querySelector('#stockMainTabs [data-epingle="id:menuTheme"]');
    if (icone && icone.contains(e.target)) return;
    ouvrir(false);
  });

  window.addEventListener('resize', function () { if (panneau.style.display === 'block') placer(); });

  // En automatique, l'heure qui passe doit se voir sans recharger.
  setInterval(function () { if (lireMode() === 'auto') appliquer(); }, 60 * 1000);

  appliquer();
  appliquerFiltre();
})();

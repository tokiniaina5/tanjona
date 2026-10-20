// La luminosité de la page, réglée comme le volume d'un téléphone : un
// bouton 🔆 sur le bord droit ouvre une barre verticale qu'on fait glisser ;
// elle se referme seule. Sert au menu des latabatra (menu-sakafo.html) et à
// la lakozia (lakozia.html).
//
// Une page web ne commande pas l'écran lui-même : on assombrit par un voile
// noir (moins de 100 %), et on éclaircit ce qui est dessous par un
// backdrop-filter (plus de 100 %). Le voile laisse passer les doigts.
// Le réglage est retenu sur l'appareil, page par page.
//
// Sous la barre, ☀️ / 🌙 : le jour (fond clair) ou la nuit (fond sombre).
// Les deux pages lisent :root[data-theme="light" | "dark"] ; sans choix,
// chacune garde le sien (le menu suit le téléphone, la lakozia est sombre).
(function () {
  const MIN = 30, MAX = 150, PAS = 5;
  const cle = 'mazava_' + location.pathname;
  function lire() {
    let v = 100;
    try { v = Number(localStorage.getItem(cle)) || 100; } catch (e) { }
    return Math.min(MAX, Math.max(MIN, v));
  }
  function ecrire(v) { try { localStorage.setItem(cle, String(v)); } catch (e) { } }

  const style = document.createElement('style');
  style.textContent =
    '.mz-voile{ position:fixed; inset:0; pointer-events:none; z-index:2147483600; }' +
    '.mz-bouton{ position:fixed; right:10px; top:50%; transform:translateY(-50%); z-index:2147483601; width:34px; height:34px; margin:0; padding:0;' +
      ' border-radius:50%; border:1px solid rgba(255,255,255,0.25); background:rgba(20,28,33,0.75); color:#fff; font-size:1rem; line-height:1;' +
      ' display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,0.35); opacity:0.75; }' +
    '.mz-bouton:hover, .mz-bouton:focus-visible{ opacity:1; }' +
    '.mz-panneau{ position:fixed; right:10px; top:50%; transform:translateY(-50%); z-index:2147483602; width:56px; padding:12px 0 10px;' +
      ' border-radius:28px; background:rgba(20,28,33,0.92); color:#fff; box-shadow:0 6px 24px rgba(0,0,0,0.45);' +
      ' display:flex; flex-direction:column; align-items:center; gap:10px; touch-action:none; user-select:none; -webkit-user-select:none; }' +
    '.mz-panneau[hidden]{ display:none; }' +
    '.mz-piste{ position:relative; width:14px; height:180px; border-radius:7px; background:rgba(255,255,255,0.18); overflow:hidden; cursor:pointer; outline:none; }' +
    '.mz-piste:focus-visible{ box-shadow:0 0 0 2px #4fd8e0; }' +
    '.mz-rempli{ position:absolute; left:0; right:0; bottom:0; background:#fff; border-radius:7px; }' +
    '.mz-icone{ font-size:1.25rem; line-height:1; }' +
    '.mz-val{ font:600 0.72rem/1 system-ui, sans-serif; opacity:0.85; }' +
    '.mz-theme{ width:40px; height:40px; margin:2px 0 0; padding:0; border-radius:50%; border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.1);' +
      ' color:#fff; font-size:1.15rem; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; }' +
    '.mz-theme:focus-visible{ box-shadow:0 0 0 2px #4fd8e0; }' +
    '@media (max-height:420px){ .mz-piste{ height:110px; } }';
  document.head.appendChild(style);

  const voile = document.createElement('div');
  voile.className = 'mz-voile';
  voile.setAttribute('aria-hidden', 'true');

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'mz-bouton';
  bouton.textContent = '🔆';
  bouton.setAttribute('aria-label', 'Hazavana (luminosité)');
  bouton.title = 'Hazavana';

  const panneau = document.createElement('div');
  panneau.className = 'mz-panneau';
  panneau.hidden = true;
  const icone = document.createElement('span');
  icone.className = 'mz-icone';
  const piste = document.createElement('div');
  piste.className = 'mz-piste';
  piste.tabIndex = 0;
  piste.setAttribute('role', 'slider');
  piste.setAttribute('aria-label', 'Hazavana');
  piste.setAttribute('aria-valuemin', String(MIN));
  piste.setAttribute('aria-valuemax', String(MAX));
  const rempli = document.createElement('div');
  rempli.className = 'mz-rempli';
  piste.appendChild(rempli);
  const val = document.createElement('span');
  val.className = 'mz-val';
  panneau.appendChild(icone);
  panneau.appendChild(piste);
  panneau.appendChild(val);
  const theme = document.createElement('button');
  theme.type = 'button';
  theme.className = 'mz-theme';
  panneau.appendChild(theme);

  // ---------- Andro / alina ----------
  const cleTheme = 'mazava_theme_' + location.pathname;
  function themeLu() { try { return localStorage.getItem(cleTheme) || ''; } catch (e) { return ''; } }
  // Le thème qui s'affiche vraiment : choisi, ou celui de la page (lu sur la
  // couleur du fond, puisque chaque page a le sien par défaut).
  function themeActuel() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    const m = (getComputedStyle(document.body || document.documentElement).backgroundColor.match(/\d+/g) || [0, 0, 0]).map(Number);
    return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 > 128 ? 'light' : 'dark';
  }
  function poserTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && document.body) meta.content = getComputedStyle(document.body).backgroundColor;
    majTheme();
  }
  function majTheme() {
    const nuit = themeActuel() === 'dark';
    // Le bouton montre ce qu'on obtient en le touchant.
    theme.textContent = nuit ? '☀️' : '🌙';
    theme.setAttribute('aria-label', nuit ? 'Andro (mazava)' : 'Alina (maizina)');
    theme.title = theme.getAttribute('aria-label');
  }
  if (themeLu()) document.documentElement.setAttribute('data-theme', themeLu());
  theme.addEventListener('click', function () {
    const t = themeActuel() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(cleTheme, t); } catch (e) { }
    poserTheme(t);
    rester();
  });

  let valeur = lire();
  function appliquer(v) {
    valeur = Math.min(MAX, Math.max(MIN, Math.round(v / PAS) * PAS));
    if (valeur < 100) {
      voile.style.background = 'rgba(0,0,0,' + ((100 - valeur) / 100).toFixed(2) + ')';
      voile.style.backdropFilter = voile.style.webkitBackdropFilter = '';
    } else {
      voile.style.background = 'transparent';
      voile.style.backdropFilter = voile.style.webkitBackdropFilter = valeur > 100 ? 'brightness(' + (valeur / 100) + ')' : '';
    }
    rempli.style.height = ((valeur - MIN) / (MAX - MIN) * 100) + '%';
    icone.textContent = valeur < 70 ? '🔅' : '🔆';
    bouton.textContent = icone.textContent;
    val.textContent = valeur + '%';
    piste.setAttribute('aria-valuenow', String(valeur));
    piste.setAttribute('aria-valuetext', valeur + '%');
  }

  // Comme le volume : la barre se cache seule après un moment sans toucher.
  let minuterie = null;
  function rester() {
    clearTimeout(minuterie);
    minuterie = setTimeout(fermer, 3000);
  }
  function ouvrir() { panneau.hidden = false; bouton.hidden = true; piste.focus({ preventScroll: true }); rester(); }
  function fermer() { clearTimeout(minuterie); panneau.hidden = true; bouton.hidden = false; ecrire(valeur); }
  bouton.addEventListener('click', ouvrir);

  function depuisPointeur(e) {
    const r = piste.getBoundingClientRect();
    const t = 1 - (e.clientY - r.top) / r.height;
    appliquer(MIN + Math.min(1, Math.max(0, t)) * (MAX - MIN));
    rester();
  }
  let glisse = false;
  panneau.addEventListener('pointerdown', function (e) {
    if (e.target === theme) return;
    glisse = true;
    try { panneau.setPointerCapture(e.pointerId); } catch (x) { }
    depuisPointeur(e);
    e.preventDefault();
  });
  panneau.addEventListener('pointermove', function (e) { if (glisse) depuisPointeur(e); });
  function lacher() { if (glisse) { glisse = false; ecrire(valeur); } }
  panneau.addEventListener('pointerup', lacher);
  panneau.addEventListener('pointercancel', lacher);
  panneau.addEventListener('wheel', function (e) { e.preventDefault(); appliquer(valeur + (e.deltaY < 0 ? PAS : -PAS)); rester(); }, { passive: false });
  piste.addEventListener('keydown', function (e) {
    const d = { ArrowUp: PAS, ArrowRight: PAS, ArrowDown: -PAS, ArrowLeft: -PAS, PageUp: 20, PageDown: -20 }[e.key];
    if (e.key === 'Escape') { fermer(); bouton.focus(); return; }
    if (e.key === 'Home') { appliquer(MIN); rester(); e.preventDefault(); return; }
    if (e.key === 'End') { appliquer(MAX); rester(); e.preventDefault(); return; }
    if (!d) return;
    appliquer(valeur + d);
    rester();
    e.preventDefault();
  });
  // Toucher ailleurs referme la barre.
  document.addEventListener('pointerdown', function (e) {
    if (!panneau.hidden && !panneau.contains(e.target)) fermer();
  }, true);

  appliquer(valeur);
  function poser() {
    document.body.appendChild(voile);
    document.body.appendChild(bouton);
    document.body.appendChild(panneau);
    poserTheme('');
  }
  if (document.body) poser(); else document.addEventListener('DOMContentLoaded', poser);
})();

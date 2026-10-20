// Les émojis des pages, dessinés en 3D (Fluent Emoji, Microsoft, licence MIT :
// emoji3d/LICENSE.txt). Un émoji n'est qu'une lettre : chaque téléphone le
// dessine à sa façon, plat et petit. Ici on pose dessus la même image partout.
//
// Le caractère reste dans la page, rendu transparent, l'image dessinée en
// fond : textContent, copier-coller et lecteurs d'écran le voient toujours.
// Tant que l'image n'est pas chargée (ou si elle manque), l'émoji d'origine
// s'affiche tel quel.
//
// Ce qui ne peut pas porter d'image garde son émoji : alert, confirm,
// notifications, titre d'onglet, <option>, champs de saisie.
(function () {
  if (window.__emoji3d) return;
  window.__emoji3d = true;

  const DISPO = new Set('1f195 1f305 1f308 1f30d 1f310 1f313 1f319 1f370 1f373 1f37d 1f381 1f399 1f3a8 1f3ac 1f3b5 1f3c6 1f3cd 1f3d8 1f3db 1f3e0 1f3e8 1f3f7 1f441 1f44b 1f44c 1f44d 1f455 1f463 1f464 1f465 1f468-200d-1f373 1f477 1f49a 1f4a1 1f4ac 1f4b0 1f4b2 1f4b3 1f4b5 1f4b8 1f4bb 1f4bd 1f4be 1f4c1 1f4c2 1f4c4 1f4c5 1f4ca 1f4cb 1f4cd 1f4d0 1f4d1 1f4d2 1f4d6 1f4d8 1f4da 1f4dc 1f4dd 1f4de 1f4e0 1f4e1 1f4e2 1f4e4 1f4e5 1f4e6 1f4e7 1f4e8 1f4f0 1f4f1 1f4f2 1f4f7 1f4f8 1f4f9 1f501 1f504 1f506 1f507 1f50a 1f50d 1f50e 1f510 1f511 1f512 1f513 1f514 1f516 1f517 1f527 1f533 1f534 1f552 1f58c 1f5a8 1f5bc 1f5c2 1f5d1 1f5dd 1f5e3 1f5fa 1f606 1f60b 1f621 1f622 1f62e 1f648 1f64b 1f64f 1f68c 1f69a 1f6a2 1f6ab 1f6b2 1f6cd 1f6ce 1f6d2 1f6e1 1f6eb 1f6f5 1f7e2 1f916 1f91d 1f957 1f964 1f970 1f9ed 1f9ee 1f9f5 1f9f9 1f9fe 1faaa 2197 21a9 2328 23f0 23f3 23f9 25b6 2600 2601 260e 267b 2699 26a0 26a1 26aa 26ab 26bd 26d4 2702 2705 2708 2709 270b 270d 270f 2716 2728 274c 2764 2795 27a1 2b06 2b07 2b1c 2b50'.split(' '));
  const RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
  const TESTE = /\p{Extended_Pictographic}/u;
  // Une flèche, une case ou un ✖ écrits sans « FE0F » sont des signes de
  // texte, pas des émojis : on les laisse. Sauf ceux qu'un téléphone dessine
  // de toute façon en émoji.
  const IMAGE = /\p{Emoji_Presentation}/u;
  const TOUJOURS = new Set(['1f441', '1f5a8', '26a0', '1f5d1', '2601', '1f58c']);
  const SAUTE = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|TITLE|NOSCRIPT|CODE|PRE|svg|SVG)$/;
  const etat = {};

  const style = document.createElement('style');
  style.textContent =
    '.e3d-ok{display:inline-block;width:1.25em;height:1.25em;vertical-align:-0.22em;overflow:hidden;' +
    'line-height:1.25em;text-align:center;color:transparent!important;-webkit-text-fill-color:transparent;' +
    'text-shadow:none!important;background:center/contain no-repeat;}';
  (document.head || document.documentElement).appendChild(style);

  function cle(g) {
    return Array.from(g).map(function (c) { return c.codePointAt(0); })
      .filter(function (c) { return c !== 0xfe0f; })
      .map(function (c) { return c.toString(16); }).join('-');
  }
  function poser(s, k) {
    s.style.backgroundImage = 'url("/emoji3d/' + k + '.png")';
    s.classList.add('e3d-ok');
  }
  function charger(k) {
    if (etat[k]) return;
    etat[k] = 'attente';
    const i = new Image();
    i.onload = function () {
      etat[k] = 'ok';
      document.querySelectorAll('span[data-e3d="' + k + '"]').forEach(function (s) { poser(s, k); });
    };
    i.onerror = function () { etat[k] = 'ko'; };
    i.src = '/emoji3d/' + k + '.png';
  }

  function horsJeu(el) {
    for (let e = el; e && e !== document.body; e = e.parentNode) {
      if (e.nodeType !== 1) continue;
      if (SAUTE.test(e.nodeName) || e.isContentEditable || e.hasAttribute('data-e3d') ||
          e.hasAttribute('data-sans-e3d')) return true;
    }
    return false;
  }

  function traiter(t) {
    const v = t.nodeValue;
    if (!v || !TESTE.test(v) || !t.parentNode || horsJeu(t.parentNode)) return;
    RE.lastIndex = 0;
    let m, fin = 0, touche = false;
    const frag = document.createDocumentFragment();
    while ((m = RE.exec(v))) {
      const k = cle(m[0]);
      if (!DISPO.has(k)) continue;
      if (m[0].indexOf('️') < 0 && m[0].indexOf('‍') < 0 && !IMAGE.test(m[0]) && !TOUJOURS.has(k)) continue;
      touche = true;
      if (m.index > fin) frag.appendChild(document.createTextNode(v.slice(fin, m.index)));
      const s = document.createElement('span');
      s.setAttribute('data-e3d', k);
      s.textContent = m[0];
      if (etat[k] === 'ok') poser(s, k); else charger(k);
      frag.appendChild(s);
      fin = m.index + m[0].length;
    }
    if (!touche) return;
    if (fin < v.length) frag.appendChild(document.createTextNode(v.slice(fin)));
    t.parentNode.replaceChild(frag, t);
  }

  function parcourir(racine) {
    if (racine.nodeType === 3) { traiter(racine); return; }
    if (racine.nodeType !== 1 || SAUTE.test(racine.nodeName)) return;
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const l = [];
    while (w.nextNode()) if (TESTE.test(w.currentNode.nodeValue)) l.push(w.currentNode);
    l.forEach(traiter);
  }

  // Ce qui change ensuite (menus redessinés, messages, listes) passe aussi,
  // par lots, une fois par image.
  let file = [];
  let prevu = false;
  function vider() {
    prevu = false;
    const l = file; file = [];
    l.forEach(function (n) { if (n.isConnected) parcourir(n); });
  }
  const obs = new MutationObserver(function (muts) {
    muts.forEach(function (mu) {
      if (mu.type === 'characterData') file.push(mu.target);
      else mu.addedNodes.forEach(function (n) { file.push(n); });
    });
    if (!prevu && file.length) { prevu = true; requestAnimationFrame(vider); }
  });

  function demarrer() {
    parcourir(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) demarrer();
  else document.addEventListener('DOMContentLoaded', demarrer);
})();

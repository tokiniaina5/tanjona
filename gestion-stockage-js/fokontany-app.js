// « Administratif Fokontany », ouvert comme une application à part
// (fokontany/index.html).
//
// Les fichiers du Fokontany — pieces-identite.js, pieces-scan.js,
// commun-alalana.js, taratasy.js, adidy.js — sont les mêmes que dans Ny
// asako. Ils attendent de common.js quelques noms : l'utilisateur connecté,
// le propriétaire, les onglets, les notifications. common.js pèse cinq mille
// lignes de stock, de factures et d'appels qui n'ont rien à faire ici : ce
// fichier ne fournit que ces noms-là, et l'écran de connexion.
//
// Chargé AVANT les fichiers du Fokontany : ils lisent ces noms à leur
// démarrage (typeof currentUser, typeof MODE_MPIASA…).

// var et non let : les fichiers du Fokontany les cherchent par « typeof »,
// et un nom de la portée globale se trouve de l'un à l'autre.
var MODE_MPIASA = false;
var currentUser = null;
var chartColors = ['#4fd8e0', '#f2a33c', '#8b93ff', '#6ee7b7', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'];
var OWNER_EMAIL = 'rasolofonirainytokiniaina@gmail.com';

function normEmail(email) { return (email || '').trim().toLowerCase(); }
function isOwnerEmail(email) { return normEmail(email) === normEmail(OWNER_EMAIL); }

// Ouverte par « /commun/ », la même page est l'Administratif Commun : le
// tableau de bord seul, en lecture (le script de l'en-tête pose la classe).
var APP_COMMUN = document.documentElement.classList.contains('app-commun');

// Le Commun surplombe les fokontany : il lit LEURS registres, et non ceux
// de l'admin, qui n'en tient aucun. Les fichiers du Fokontany le demandent
// avant de filtrer par compte (fianakaviana.js, adidy.js, taratasy.js) ; le
// serveur, lui, ne l'accorde qu'au propriétaire (règles « lecture commun »).
window.__lectureCommun = function () {
  return APP_COMMUN && !!currentUser && isOwnerEmail(currentUser.email);
};

// ---------- Les onglets (les mêmes que dans common.js) ----------
var ongletCommun = 'tableau';
// L'Administratif Commun est au propriétaire seul, comme dans Ny asako.
function communInterdit() {
  return APP_COMMUN && !(currentUser && isOwnerEmail(currentUser.email));
}

function choisirOngletCommun(nom) {
  // Rien ne se montre ni ne se demande au serveur pour un autre compte.
  if (communInterdit()) return;
  var PANNEAUX = {
    tableau: 'communCorps',
    adidy: 'communAdidy', historique: 'communHistorique',
    taratasy: 'communTaratasy', fianakaviana: 'communFianakaviana', fokontany: 'communFokontany', fangatahana: 'communFangatahana'
  };
  // « Fangatahana » est à l'admin seul : un autre compte n'y entre pas.
  if (nom === 'fangatahana' && !(currentUser && isOwnerEmail(currentUser.email))) nom = 'tableau';
  // Dans le Commun, les onglets d'un fokontany ne s'ouvrent qu'une fois un
  // fokontany choisi ; avant, le tableau de bord de tous, puis la liste.
  // Choisi, on reste chez lui.
  if (APP_COMMUN) {
    var dansUn = !!window.__fokontanyJerena;
    var SIENS = { tableau: 1, adidy: 1, historique: 1, taratasy: 1, fianakaviana: 1 };
    if (!dansUn && SIENS[nom] && nom !== 'tableau') nom = 'fokontany';
    if (dansUn && !SIENS[nom]) nom = 'tableau';
  }  ongletCommun = PANNEAUX[nom] ? nom : 'tableau';
  Object.keys(PANNEAUX).forEach(function (cle) {
    var el = document.getElementById(PANNEAUX[cle]);
    if (el) el.style.display = cle === ongletCommun ? '' : 'none';
  });
  document.querySelectorAll('#dash-commun [data-commun]').forEach(function (t) {
    t.classList.toggle('active', t.dataset.commun === ongletCommun);
  });
  // La porte d'abord : sans alalana, rien ne se montre ni ne se demande.
  if (typeof renderPorteCommun === 'function') {
    renderPorteCommun().then(function (ouverte) {
      if (!ouverte) return;
      // Validé par l'admin (✅ Hamafiso) : le fokontany peut installer
      // l'application sur son ordinateur. Le Commun reste à l'admin.
      if (!APP_COMMUN && typeof window.__fkRendreInstallable === 'function') window.__fkRendreInstallable();
      remplirOngletCommun();
    });
    return;
  }
  remplirOngletCommun();
}

function remplirOngletCommun() {
  var nom = ongletCommun;
  if (nom === 'fangatahana') {
    if (typeof renderFangatahana === 'function') renderFangatahana();
    return;
  }
  if (nom === 'adidy') {
    if (typeof renderAdidy === 'function') renderAdidy();
  } else if (nom === 'historique') {
    if (typeof renderHistorique === 'function') renderHistorique();
    // Les papiers remis ont leur place dans l'historique aussi (taratasy.js).
    if (typeof renderTaratasyHistorique === 'function') renderTaratasyHistorique();
  } else if (nom === 'taratasy') {
    if (typeof renderTaratasy === 'function') renderTaratasy();
  } else if (nom === 'fokontany') {
    rendreLesFokontany();
    return;
  } else if (nom === 'fianakaviana') {
    if (typeof renderFianakaviana === 'function') renderFianakaviana();
  } else if (nom !== 'tableau' && typeof renderFianakaviana === 'function') {
    // Le tableau relit les livrets lui-même (renderFianakavianaIsa), une
    // fois connus les fokontany à compter : pas de seconde lecture.
    renderFianakaviana();
  }
  if (nom === 'tableau') {
    var dessiner = function () {
      if (typeof window.__montrerLesInstallations === 'function') window.__montrerLesInstallations();
      if (typeof renderFianakavianaIsa === 'function') renderFianakavianaIsa();
      if (typeof renderVolaVoaangona === 'function') renderVolaVoaangona();
      if (typeof renderTaratasyIsa === 'function') renderTaratasyIsa();
    };
    // Le tableau de tous, dans le Commun : ses fokontany d'abord, pour ne
    // compter qu'eux.
    if (APP_COMMUN && !window.__fokontanyJerena) chargerLesFokontany().then(dessiner, dessiner);
    else dessiner();
  }
}

// ---------- Les fokontany du Commun ----------
// Combien, et lesquels : ceux dont l'accès est confirmé (commun_alalana,
// voamarina) et ceux qui ont installé leur application, chacun une fois,
// par son email. Le nom vient de l'installation, sinon de la demande. On y
// joint le nombre de livres de famille que chacun tient. Le serveur ne rend
// ces tables qu'au propriétaire.
// La liste sert aussi au tableau de bord du Commun : ses chiffres ne comptent
// que ces fokontany-là (window.__fokontanyCommun, lu par « mien » dans
// fianakaviana.js, adidy.js, taratasy.js). Tant qu'elle n'est pas lue, il
// vaut undefined et tout est compté, comme avant.
function cleEmail(e) { return String(e || '').trim().toLowerCase(); }
function chargerLesFokontany() {
  var sb = window.__sb;
  if (!sb || !(currentUser && isOwnerEmail(currentUser.email))) return Promise.resolve(null);
  var cle = cleEmail;
  return Promise.all([
    sb.from('commun_alalana').select('email,anarana,active,voamarina,created_at'),
    sb.from('fokontany_installation').select('email,fokontany,karazana,created_at'),
    sb.from('fianakaviana').select('owner_email')
  ]).then(function (res) {
    if (res[0].error && res[1].error) return null;
    var parEmail = {};
    ((res[0].data) || []).forEach(function (a) {
      if (!a.active || !a.voamarina || !cle(a.email)) return;
      parEmail[cle(a.email)] = { email: a.email, nom: a.anarana || '', daty: a.created_at };
    });
    ((res[1].data) || []).forEach(function (i) {
      if (i.karazana === 'commun' || !cle(i.email) || isOwnerEmail(i.email)) return;
      var f = parEmail[cle(i.email)] || (parEmail[cle(i.email)] = { email: i.email, nom: '', daty: i.created_at });
      if (i.fokontany) f.nom = i.fokontany;
    });
    var livres = {};
    ((res[2] && res[2].data) || []).forEach(function (r) { var k = cle(r.owner_email); livres[k] = (livres[k] || 0) + 1; });
    var liste = Object.keys(parEmail).map(function (k) { return parEmail[k]; })
      .sort(function (a, b) { return (a.nom || a.email).localeCompare(b.nom || b.email, 'fr'); });
    window.__fokontanyCommun = Object.keys(parEmail);
    return { liste: liste, livres: livres };
  }, function () { return null; });
}

// ---------- Le nom du Commun ----------
// Dans l'en-tête, « 🏛️ Commun <son nom> ». Le nom vient du lien d'installation
// (« c=… », gardé dans ce navigateur) ; sinon de ce que le serveur sait :
// l'installation du Commun, la demande de code (« … — Commun X (…) »), ou
// le commun que ses fokontany ont déclaré le plus souvent.
// Sa clé à lui : « stockmanager_fokontany_commun » est le commun dont relève
// le Fokontany installé sur le même poste, et l'un réécrivait l'autre.
var CLE_NOM_COMMUN = 'stockmanager_commun_nom';
function afficherNomCommun(nom) {
  var el = document.getElementById('fkMarque');
  if (!el) return;
  var propre = String(nom || '').replace(/[<>&]/g, '').replace(/^commun\s+/i, '').trim();
  el.innerHTML = '🏛️ Commun' + (propre ? ' <span translate="no" class="notranslate">' + propre + '</span>' : '');
  if (propre) document.title = 'Commun ' + propre;
}
function trouverNomCommun() {
  var garde = '';
  try { garde = String(localStorage.getItem(CLE_NOM_COMMUN) || '').trim(); } catch (e) {}
  afficherNomCommun(garde);
  if (garde || !window.__sb || !currentUser) return;
  var sb = window.__sb;
  var moi = cleEmail(currentUser.email);
  Promise.all([
    sb.from('fokontany_installation').select('email,commun,karazana'),
    sb.from('commun_alalana').select('email,anarana')
  ]).then(function (res) {
    var installs = (res[0] && !res[0].error && res[0].data) || [];
    var demandes = (res[1] && !res[1].error && res[1].data) || [];
    var nom = '';
    installs.forEach(function (i) { if (!nom && i.karazana === 'commun' && cleEmail(i.email) === moi && i.commun) nom = i.commun; });
    demandes.forEach(function (a) {
      var m = !nom && cleEmail(a.email) === moi && String(a.anarana || '').match(/Commun\s+([^\/(]+)/i);
      if (m) nom = m[1].trim();
    });
    if (!nom) {
      var compte = {};
      installs.forEach(function (i) { if (i.karazana !== 'commun' && i.commun) compte[i.commun] = (compte[i.commun] || 0) + 1; });
      nom = Object.keys(compte).sort(function (a, b) { return compte[b] - compte[a]; })[0] || '';
    }
    if (!nom) return;
    try { localStorage.setItem(CLE_NOM_COMMUN, nom); } catch (e) {}
    afficherNomCommun(nom);
  }, function () {});
}

// ---------- Ce que la recherche du Commun parcourt ----------
// Tout ce que ses fokontany ont écrit, lu d'un coup et gardé une minute :
// on ne relit pas le serveur à chaque lettre tapée. Chaque trouvaille sait
// de quel fokontany elle vient et quel onglet la montre. Les papiers de
// départ (fifindra-monina) n'y sont pas : ils ne se feuillettent pas.
var indexCommun = null;
var indexCommunAt = 0;
function chargerIndexCommun() {
  if (indexCommun && Date.now() - indexCommunAt < 60000) return Promise.resolve(indexCommun);
  var sb = window.__sb;
  if (!sb) return Promise.resolve([]);
  return chargerLesFokontany().then(function (r) {
    if (!r) return [];
    var noms = {};
    r.liste.forEach(function (f) { noms[cleEmail(f.email)] = f.nom || f.email; });
    var emails = Object.keys(noms);
    if (!emails.length) return [];
    var lire = function (table, colonnes) {
      return sb.from(table).select(colonnes).in('owner_email', emails)
        .then(function (res) { return (res && !res.error && res.data) || []; }, function () { return []; });
    };
    return Promise.all([
      lire('fianakaviana', 'owner_email,anarana,fonenana,laharana'),
      lire('fianakaviana_mpikambana', 'owner_email,anarana,laharana_cin,andraikitra'),
      lire('adidy', 'owner_email,anarana,fe_potoana'),
      lire('taratasy', 'owner_email,anarana,laharana,laharana_cin,karazana,fonenana')
    ]).then(function (t) {
      var items = [];
      var ajouter = function (email, icone, texte, sous, onglet) {
        var k = cleEmail(email);
        if (!noms[k] || !texte) return;
        items.push({ email: k, fokontany: noms[k], icone: icone, texte: String(texte), sous: sous || '', onglet: onglet });
      };
      r.liste.forEach(function (f) { ajouter(f.email, '🏘️', f.nom || f.email, f.email, 'tableau'); });
      t[0].forEach(function (x) { ajouter(x.owner_email, '📖', x.anarana, [x.laharana, x.fonenana].filter(Boolean).join(' · '), 'fianakaviana'); });
      t[1].forEach(function (x) { ajouter(x.owner_email, '👤', x.anarana, [x.andraikitra, x.laharana_cin].filter(Boolean).join(' · '), 'fianakaviana'); });
      t[2].forEach(function (x) { ajouter(x.owner_email, '💰', x.anarana, x.fe_potoana === 'taona' ? 'isan-taona' : 'isam-bolana', 'adidy'); });
      t[3].forEach(function (x) {
        if (x.karazana === 'fifindramonina') return;
        ajouter(x.owner_email, '📄', x.anarana, [x.laharana, x.laharana_cin, x.fonenana].filter(Boolean).join(' · '), 'taratasy');
      });
      indexCommun = items;
      indexCommunAt = Date.now();
      return items;
    });
  });
}

function rendreLesFokontany() {
  var corps = document.getElementById('communFokontanyLisitra');
  if (!corps || !window.__sb || !(currentUser && isOwnerEmail(currentUser.email))) return;
  var msg = document.getElementById('communFokontanyMessage');
  var echap = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  var cle = cleEmail;
  chargerLesFokontany().then(function (r) {
    if (!r) { msg.textContent = 'Tsy voaaka ny lisitry ny fokontany.'; return; }
    msg.textContent = '';
    var liste = r.liste, livres = r.livres;
    document.getElementById('communKpiFokontanyIsa').textContent = liste.length;
    document.getElementById('communFokontanyVide').style.display = liste.length ? 'none' : '';
    corps.innerHTML = liste.map(function (f, n) {
      var d = new Date(f.daty);
      // Une ligne se touche pour regarder ce fokontany seul (voir jereoFokontany).
      return '<tr data-jereo="' + echap(cle(f.email)) + '" data-anarana="' + echap(f.nom || f.email) + '" style="cursor:pointer;" title="Jereo ity fokontany ity">' +
        '<td>' + (n + 1) + '</td>' +
        '<td>' + echap(f.nom || '—') + ' <span style="color:var(--cyan); font-size:0.8rem;">👁️</span></td>' +
        '<td style="color:var(--muted);">' + echap(f.email) + '</td>' +
        '<td style="text-align:right;">' + (livres[cle(f.email)] || 0) + '</td>' +
        '<td style="white-space:nowrap; color:var(--muted);">' + (isNaN(d) ? '—' : d.toLocaleDateString('fr-FR')) + '</td></tr>';
    }).join('');
  });
}

// ---------- Ce qui change chez les fokontany ----------
// Le Commun est prévenu, sous sa cloche, de ce que les fokontany écrivent :
// un livre de famille, un membre, un adidy, un versement, un papier remis.
// On relit toutes les 30 s ce qui est plus récent que la dernière fois (la
// date est gardée dans ce navigateur) : la première fois ne fait que poser
// le repère, pour ne pas noyer l'admin sous tout l'historique. Ce qu'écrit
// l'admin lui-même ne le prévient pas. Une suppression, elle, ne laisse pas
// de ligne à lire : elle ne se voit pas ici.
var CLE_SUIVI_COMMUN = 'stockmanager_commun_vaovao_farany';
var SUIVI_TABLES = [
  { table: 'fianakaviana', maj: true, mot: function (n) { return n + ' livre de famille vaovao na novaina'; } },
  { table: 'fianakaviana_mpikambana', mot: function (n) { return n + ' mpianakavy vaovao'; } },
  { table: 'adidy', maj: true, mot: function (n) { return n + ' adidy vaovao na novaina'; } },
  { table: 'adidy_fandoavana', mot: function (n) { return n + ' fandoavana adidy'; } },
  { table: 'taratasy', mot: function (n) { return n + ' taratasy nomena'; } }
];
var suiviMinuterie = null;
function suivreLesFokontany() {
  if (!APP_COMMUN || suiviMinuterie) return;
  suiviMinuterie = setInterval(relireLesChangements, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) relireLesChangements(); });
  relireLesChangements();
}
var suiviEnCours = false;
function relireLesChangements() {
  var sb = window.__sb;
  if (!sb || suiviEnCours || !(currentUser && isOwnerEmail(currentUser.email))) return;
  var depuis = '';
  try { depuis = localStorage.getItem(CLE_SUIVI_COMMUN) || ''; } catch (e) {}
  if (!depuis) {
    try { localStorage.setItem(CLE_SUIVI_COMMUN, new Date().toISOString()); } catch (e) {}
    return;
  }
  suiviEnCours = true;
  var requetes = SUIVI_TABLES.map(function (s) {
    var q = sb.from(s.table).select('*');
    return (s.maj ? q.or('created_at.gt."' + depuis + '",updated_at.gt."' + depuis + '"') : q.gt('created_at', depuis));
  });
  requetes.push(sb.from('commun_alalana').select('email,anarana'));
  requetes.push(sb.from('fokontany_installation').select('email,fokontany'));
  Promise.all(requetes).then(function (res) {
    var noms = {};
    ((res[SUIVI_TABLES.length].data) || []).forEach(function (a) { if (a.anarana) noms[String(a.email).toLowerCase()] = a.anarana; });
    ((res[SUIVI_TABLES.length + 1].data) || []).forEach(function (i) { if (i.fokontany) noms[String(i.email).toLowerCase()] = i.fokontany; });
    // Le repère suivant : la ligne la plus récente, plus une milliseconde (le
    // serveur compte en microsecondes ; sans ce pas, elle reviendrait).
    var plusRecent = Date.parse(depuis);
    var parFokontany = {};
    SUIVI_TABLES.forEach(function (s, k) {
      ((res[k] && !res[k].error && res[k].data) || []).forEach(function (l) {
        [l.created_at, l.updated_at].forEach(function (t) { var ms = Date.parse(t); if (ms > plusRecent) plusRecent = ms; });
        var email = String(l.owner_email || '').toLowerCase();
        if (!email || isOwnerEmail(email)) return;
        var f = parFokontany[email] || (parFokontany[email] = {});
        f[s.table] = (f[s.table] || 0) + 1;
      });
    });
    if (plusRecent > Date.parse(depuis)) {
      try { localStorage.setItem(CLE_SUIVI_COMMUN, new Date(plusRecent + 1).toISOString()); } catch (e) {}
    }
    var emails = Object.keys(parFokontany);
    emails.forEach(function (email) {
      var f = parFokontany[email];
      var morceaux = SUIVI_TABLES.filter(function (s) { return f[s.table]; })
        .map(function (s) { return s.mot(f[s.table]); });
      var message = '🗂️ ' + (noms[email] || email) + ' : ' + morceaux.join(', ') + '.';
      if (typeof window.__ajouterNotificationAction === 'function') window.__ajouterNotificationAction('fokontany', message);
      // Et hors de la page, si le navigateur l'a déjà permis.
      try {
        if (document.hidden && window.Notification && Notification.permission === 'granted') {
          new Notification('Commun', { body: message, icon: '/fokontany/commun/icone-192.png' });
        }
      } catch (e) {}
    });
    // Ce qu'on regarde se remet à jour avec.
    // (et la recherche relira tout à sa prochaine lettre).
    if (emails.length) { indexCommun = null; remplirOngletCommun(); }
  }).then(function () { suiviEnCours = false; }, function () { suiviEnCours = false; });
}

// Regarder un seul fokontany : ce qu'il a dans son Administratif Fokontany,
// et rien d'autre. Les lectures du Commun (mien, dans fianakaviana.js,
// adidy.js, taratasy.js) se limitent alors à son email. Les panneaux restent
// en lecture seule : on regarde, on ne touche pas. '' : tous les fokontany.
window.__fokontanyJerena = '';
function jereoFokontany(email, anarana) {
  window.__fokontanyJerena = String(email || '').trim().toLowerCase();
  var boite = document.getElementById('communJerenaBox');
  if (boite) boite.style.display = window.__fokontanyJerena ? 'flex' : 'none';
  var nom = document.getElementById('communJerenaAnarana');
  if (nom) nom.textContent = anarana || email || '';
  document.documentElement.classList.toggle('commun-jerena', !!window.__fokontanyJerena);
  // Son tableau de bord d'abord ; revenir à tous ramène à la liste.
  choisirOngletCommun(window.__fokontanyJerena ? 'tableau' : 'fokontany');
}
document.addEventListener('click', function (e) {
  var ligne = e.target.closest && e.target.closest('#communFokontanyLisitra tr[data-jereo]');
  if (ligne) { jereoFokontany(ligne.dataset.jereo, ligne.dataset.anarana); return; }
  if (e.target.closest && e.target.closest('#communJerenaRehetra')) jereoFokontany('', '');
});

// commun-alalana.js l'appelle au retour d'un lien reçu par email. Il n'y a
// ici qu'une seule vue : l'ouvrir, c'est la redessiner.
function ouvrirDepuisLeMenu(nom) {
  if (nom === 'commun') choisirOngletCommun(ongletCommun);
}

// Au DOMContentLoaded et non tout de suite : ce fichier passe avant ceux du
// Fokontany, et une session trouvée trop tôt ouvrirait les onglets avant que
// leurs fonctions (renderPorteCommun…) n'existent.
document.addEventListener('DOMContentLoaded', function () {
  function $(id) { return document.getElementById(id); }

  if (APP_COMMUN) {
    $('fkNomApp').textContent = 'Commun';
    afficherNomCommun('');
    try { afficherNomCommun(localStorage.getItem(CLE_NOM_COMMUN) || ''); } catch (e) {}
    // Son icône à lui, le « C » : celle du Fokontany est posée dans la page.
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(function (l) {
      l.setAttribute('href', '/fokontany/commun/icone-192.png');
    });
    // Le Commun voit tout ce que voit le Fokontany : les mêmes onglets, les
    // mêmes pages. Mais il regarde sans toucher — la classe va sur chaque
    // panneau, jamais sur la rangée d'onglets, qui doit rester cliquable.
    ['communCorps', 'communAdidy', 'communHistorique', 'communTaratasy',
      'communFianakaviana', 'communFokontany', 'communFangatahana'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.add('lecture-seule');
    });

    // ---------- La recherche du Commun ----------
    // Il ne touche à rien, mais il cherche : ce qui est tapé masque les lignes
    // de l'onglet ouvert (tableaux, listes, cartes) qui ne le contiennent pas.
    // Les onglets se redessinent en arrivant du serveur : on refiltre alors.
    var champ = $('communRecherche');
    var sansAccent = function (s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    };
    var filtrer = function () {
      var mots = sansAccent(champ.value).split(/\s+/).filter(Boolean);
      var panneau = ['communCorps', 'communAdidy', 'communHistorique', 'communTaratasy',
        'communFianakaviana', 'communFokontany', 'communFangatahana'].map($).filter(function (el) {
        return el && el.style.display !== 'none';
      })[0];
      var hita = 0, total = 0;
      if (panneau) {
        panneau.querySelectorAll('tbody tr, .list-row').forEach(function (ligne) {
          total++;
          var ok = mots.every(function (m) { return sansAccent(ligne.textContent).indexOf(m) !== -1; });
          ligne.style.display = ok ? '' : 'none';
          if (ok) hita++;
        });
      }
      // Écrit seulement s'il change : le compteur est lui-même sous
      // l'observateur, et le réécrire relancerait le filtre sans fin.
      var texte = mots.length ? hita + ' / ' + total + ' hita' : '';
      if ($('communRechercheIsa').textContent !== texte) $('communRechercheIsa').textContent = texte;
    };
    champ.addEventListener('input', filtrer);
    var attente = null;
    new MutationObserver(function () {
      if (!champ.value || attente) return;
      attente = requestAnimationFrame(function () { attente = null; filtrer(); });
    }).observe($('communContenu'), { childList: true, subtree: true });
    document.querySelectorAll('#dash-commun [data-commun]').forEach(function (tab) {
      tab.addEventListener('click', function () { setTimeout(filtrer, 0); });
    });

    // Et dans tout le Commun : sous la barre, ce qui correspond, où que ce
    // soit — un fokontany, un livret, un membre, un adidy, un papier. Le
    // toucher ouvre ce fokontany à l'onglet qui le montre, la ligne filtrée.
    var valiny = $('communRechercheValiny');
    var echap = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    var trouves = [];
    var tour = 0;
    // Le compte « x / y hita » parle de l'onglet ouvert : il se tait tant que
    // la liste de tout le Commun est ouverte, pour ne pas la contredire.
    var fermerValiny = function () { valiny.style.display = 'none'; $('communRechercheIsa').style.visibility = ''; };
    var chercherPartout = function () {
      var mots = sansAccent(champ.value).split(/\s+/).filter(Boolean);
      if (!mots.length || sansAccent(champ.value).trim().length < 2) { fermerValiny(); return; }
      var ity = ++tour;
      chargerIndexCommun().then(function (index) {
        if (ity !== tour) return;
        trouves = (index || []).filter(function (it) {
          var tout = sansAccent(it.texte + ' ' + it.sous + ' ' + it.fokontany);
          return mots.every(function (m) { return tout.indexOf(m) !== -1; });
        }).slice(0, 40);
        valiny.innerHTML = trouves.length
          ? trouves.map(function (it, n) {
              return '<div role="option" data-valiny="' + n + '" style="padding:0.55rem 0.8rem; border-bottom:1px solid var(--line); cursor:pointer; font-size:0.82rem; line-height:1.4;">' +
                it.icone + ' <strong>' + echap(it.texte) + '</strong>' +
                (it.sous ? ' <span style="color:var(--muted);">· ' + echap(it.sous) + '</span>' : '') +
                '<div style="font-size:0.72rem; color:var(--cyan);">🗂️ ' + echap(it.fokontany) + '</div></div>';
            }).join('')
          : '<p style="padding:0.7rem 0.8rem; margin:0; font-size:0.8rem; color:var(--muted);">Tsy misy hita ao amin\'ny Commun.</p>';
        valiny.style.display = 'block';
        $('communRechercheIsa').style.visibility = 'hidden';
      });
    };
    var attenteRecherche = null;
    champ.addEventListener('input', function () {
      clearTimeout(attenteRecherche);
      attenteRecherche = setTimeout(chercherPartout, 250);
    });
    champ.addEventListener('focus', function () { if (champ.value) chercherPartout(); });
    champ.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermerValiny(); });
    valiny.addEventListener('click', function (e) {
      var el = e.target.closest('[data-valiny]');
      if (!el) return;
      var it = trouves[Number(el.dataset.valiny)];
      if (!it) return;
      fermerValiny();
      // Le fokontany seul : rien à filtrer ; sinon la ligne trouvée reste seule.
      champ.value = it.onglet === 'tableau' ? '' : it.texte;
      jereoFokontany(it.email, it.fokontany);
      choisirOngletCommun(it.onglet);
      setTimeout(filtrer, 0);
    });
    document.addEventListener('click', function (e) {
      if (valiny.style.display === 'none') return;
      if (e.target.closest && !e.target.closest('#communRechercheBox')) fermerValiny();
    });
  }

  // ---------- Le nom du fokontany ----------
  // Le lien donné à un fokontany porte son nom (« ?f=… », common.js) : sa
  // page le montre, et s'en souvient — l'application installée s'ouvre
  // ensuite à son nom, sans l'adresse.
  (function () {
    var CLE_NOM = 'stockmanager_fokontany_nom';
    // Le commun dont ce fokontany relève : il vient du lien, et s'inscrit
    // avec l'installation. L'admin le retrouve ensuite sans le réécrire.
    var CLE_COMMUN = 'stockmanager_fokontany_commun';
    var nom = '';
    var email = '';
    try {
      var params = new URLSearchParams(window.location.search);
      nom = String(params.get('f') || '').trim();
      email = String(params.get('e') || '').trim().toLowerCase();
      var commun = String(params.get('c') || '').trim();
      if (nom || email || commun) {
        // Le Commun garde son nom à part : ce qui est écrit pour l'un ne
        // doit pas se lire chez l'autre.
        if (nom && !APP_COMMUN) localStorage.setItem(CLE_NOM, nom);
        if (commun) localStorage.setItem(APP_COMMUN ? CLE_NOM_COMMUN : CLE_COMMUN, commun);
        params.delete('f');
        params.delete('e');
        params.delete('c');
        var reste = params.toString();
        history.replaceState(null, '', window.location.pathname + (reste ? '?' + reste : ''));
      }
      if (!nom) nom = String(localStorage.getItem(CLE_NOM) || '').trim();
    } catch (e) {}
    // L'email du fokontany, et non celui de l'admin que le navigateur
    // proposait : il l'attend sur l'écran de connexion. Il n'a pas encore de
    // compte — c'est la création qui s'ouvre, son email déjà écrit.
    if (email) {
      $('fkLoginEmail').value = email;
      $('fkVaovaoEmail').value = email;
      $('fkVaovaoForm').style.display = '';
      $('fkVaovaoAnarana').focus();
      $('fkLoginStatus').textContent = 'Mbola tsy manana kaonty ianao : forony eto ambany, dia hiditra.';
    }
    if (!nom || APP_COMMUN) return;
    // Un nom de fokontany ne se traduit pas : le navigateur rendait
    // « Tsena » par « Open-air market ». translate="no" (et .notranslate,
    // que Google lit) le laissent tel qu'il est écrit.
    var propre = nom.replace(/[<>&]/g, '');
    $('fkMarque').innerHTML = '🗂️ Fokontany <span translate="no" class="notranslate">' + propre + '</span>';
    $('fkNomApp').textContent = 'Fokontany ' + propre;
    [$('fkMarque'), $('fkNomApp')].forEach(function (el) {
      el.setAttribute('translate', 'no');
      el.classList.add('notranslate');
    });
    document.title = 'Fokontany ' + propre;
  })();

  // ---------- Sans réseau ----------
  // Comme dans Ny asako : la page s'ouvre, mais les listes restent vides sans
  // qu'on sache pourquoi. La bande le dit.
  (function () {
    var bande = $('bandeauReseau');
    if (!bande) return;
    function majReseau() { bande.hidden = navigator.onLine !== false; }
    window.addEventListener('online', majReseau);
    window.addEventListener('offline', majReseau);
    majReseau();
  })();

  // ---------- Fampahafantarana ----------
  // Elles restent dans le site, sous la cloche : une bande qui passe s'oublie,
  // et l'on veut relire ce qui a été dit. Gardées dans ce navigateur, comme
  // celles de Ny asako — elles n'ont rien à faire sur le serveur.
  var CLE_NOTIFS = APP_COMMUN ? 'stockmanager_commun_notifs' : 'stockmanager_fokontany_notifs';
  function lireNotifs() {
    try { return JSON.parse(localStorage.getItem(CLE_NOTIFS)) || []; } catch (e) { return []; }
  }
  function ecrireNotifs(liste) {
    try { localStorage.setItem(CLE_NOTIFS, JSON.stringify(liste.slice(0, 50))); } catch (e) {}
  }
  function rendreNotifs() {
    var liste = lireNotifs();
    var corps = $('fkNotifList');
    var badge = $('fkNotifBadge');
    if (!corps || !badge) return;
    var pasLues = liste.filter(function (n) { return !n.lu; }).length;
    badge.textContent = pasLues > 9 ? '9+' : String(pasLues);
    badge.style.display = pasLues ? '' : 'none';
    corps.innerHTML = liste.length
      ? liste.map(function (n) {
          var d = new Date(n.date);
          return '<div style="padding:0.65rem 0.9rem; border-bottom:1px solid var(--line); font-size:0.8rem; line-height:1.5;' +
            (n.lu ? ' color:var(--muted);' : '') + '">' +
            '<div>' + String(n.message).replace(/[<>&]/g, '') + '</div>' +
            '<div style="font-size:0.68rem; color:var(--muted); margin-top:0.2rem;">' +
              (isNaN(d) ? '' : d.toLocaleString('fr-FR')) + '</div>' +
          '</div>';
        }).join('')
      : '<p class="empty-hint" style="padding:0.9rem;">Mbola tsy misy fampahafantarana.</p>';
  }
  window.__notifActions = window.__notifActions || {};
  window.__ajouterNotificationAction = function (type, message) {
    // Ce qu'un fokontany change porte son nom : l'avis se lit ailleurs
    // aussi (le Commun, un autre compte sur ce navigateur).
    if (type === 'modification' && !APP_COMMUN) {
      var fk = '';
      try { fk = String(localStorage.getItem('stockmanager_fokontany_nom') || '').trim(); } catch (e) {}
      if (!fk && currentUser) fk = currentUser.name || currentUser.email || '';
      if (fk) message = '🗂️ ' + (/^fokontany\b/i.test(fk) ? fk : 'Fokontany ' + fk) + ' · ' + message;
    }
    var liste = lireNotifs();
    liste.unshift({ type: type, message: String(message || ''), date: new Date().toISOString(), lu: false });
    ecrireNotifs(liste);
    rendreNotifs();
    // Et un mot qui passe, pour qu'on le voie tout de suite.
    var boite = $('fkToast');
    if (!boite) return;
    boite.textContent = message;
    boite.style.display = 'block';
    clearTimeout(boite.__minuterie);
    boite.__minuterie = setTimeout(function () { boite.style.display = 'none'; }, 6000);
  };
  window.__marquerNotificationFaite = function () {};
  $('fkNotifBtn').addEventListener('click', function () {
    var panneau = $('fkNotifPanel');
    var ouvert = panneau.style.display !== 'none';
    panneau.style.display = ouvert ? 'none' : 'block';
    $('fkNotifBtn').setAttribute('aria-expanded', ouvert ? 'false' : 'true');
    // Ouvrir, c'est avoir lu.
    if (!ouvert) { ecrireNotifs(lireNotifs().map(function (n) { n.lu = true; return n; })); rendreNotifs(); }
  });
  $('fkNotifFafao').addEventListener('click', function () { ecrireNotifs([]); rendreNotifs(); });
  document.addEventListener('click', function (e) {
    var panneau = $('fkNotifPanel');
    if (panneau.style.display === 'none') return;
    if (e.target.closest && !e.target.closest('#fkNotifPanel') && !e.target.closest('#fkNotifBtn')) {
      panneau.style.display = 'none';
      $('fkNotifBtn').setAttribute('aria-expanded', 'false');
    }
  });
  rendreNotifs();

  // ---------- Andro sy alina ----------
  // Les clés de Ny asako : même site, même choix. Le jour tout en haut du
  // curseur de Ny asako (100), la nuit tout en bas (0), en mode manuel.
  function modeLoko() { return document.documentElement.getAttribute('data-theme') === 'jour' ? 'jour' : 'nuit'; }
  function marquerLoko() {
    var actuel = modeLoko();
    document.querySelectorAll('[data-fk-loko]').forEach(function (b) {
      b.classList.toggle('btn-primary', b.dataset.fkLoko === actuel);
    });
  }
  document.querySelectorAll('[data-fk-loko]').forEach(function (b) {
    b.addEventListener('click', function () {
      var jour = b.dataset.fkLoko === 'jour';
      try {
        localStorage.setItem('stockmanager_theme_mode', 'manuel');
        localStorage.setItem('stockmanager_theme_niveau', jour ? '100' : '0');
        localStorage.setItem('stockmanager_theme', jour ? 'jour' : 'nuit');
      } catch (e) {}
      if (typeof window.__appliquerNiveau === 'function') window.__appliquerNiveau(jour ? 100 : 0);
      marquerLoko();
    });
  });
  marquerLoko();

  // ---------- Fikirana ----------
  // Le ⚙️ après la cloche : le compte ouvert (nom, email) s'y lit. Il se
  // referme comme la cloche, d'un clic ailleurs.
  $('fkParametresBtn').addEventListener('click', function () {
    var panneau = $('fkParametresPanel');
    var ouvert = panneau.style.display !== 'none';
    panneau.style.display = ouvert ? 'none' : 'block';
    $('fkParametresBtn').setAttribute('aria-expanded', ouvert ? 'false' : 'true');
  });
  document.addEventListener('click', function (e) {
    var panneau = $('fkParametresPanel');
    if (panneau.style.display === 'none') return;
    if (e.target.closest && !e.target.closest('#fkParametresPanel') && !e.target.closest('#fkParametresBtn')) {
      panneau.style.display = 'none';
      $('fkParametresBtn').setAttribute('aria-expanded', 'false');
    }
  });

  // ---------- Connexion ----------
  // Le même compte que Ny asako : même base, mêmes identifiants. Créer un
  // compte ou retrouver un mot de passe se fait aussi ici (plus bas).
  function profilDe(user) {
    var meta = (user && user.user_metadata) || {};
    var email = (user && user.email) || '';
    return {
      name: meta.name || email.split('@')[0],
      email: email,
      phone: meta.phone || '',
      logo: meta.logo || null,
      company: meta.company || '',
      nif: meta.nif || '',
      stat: meta.stat || ''
    };
  }

  function ouvrir(user) {
    currentUser = profilDe(user);
    $('fkNom').textContent = currentUser.name;
    $('fkEmail').textContent = currentUser.email;
    $('loginScreen').style.display = 'none';
    $('appScreen').style.display = 'block';
    var interdit = communInterdit();
    $('fkReserve').style.display = interdit ? '' : 'none';
    $('dash-commun').style.display = interdit ? 'none' : '';
    if (isOwnerEmail(currentUser.email)) rendreInstallable();
    choisirOngletCommun(ongletCommun);
    if (APP_COMMUN && isOwnerEmail(currentUser.email)) suivreLesFokontany();
    if (APP_COMMUN) trouverNomCommun();
  }

  // ---------- Le Commun suit les fokontany ----------
  // Il les surplombe : il voit lesquels ont installé leur application, et
  // quand. La règle du serveur ne le montre qu'au propriétaire, qui seul les
  // lit toutes (supabase-fokontany-installation.sql).
  window.__montrerLesInstallations = function () {
    var panneau = $('communInstallesPanneau');
    var liste = $('communInstalles');
    if (!panneau || !liste || !APP_COMMUN || !window.__sb) return;
    if (!(currentUser && isOwnerEmail(currentUser.email))) return;
    panneau.style.display = '';
    window.__sb.from('fokontany_installation').select('*').order('created_at', { ascending: false })
      .then(function (res) {
        var lignes = (res && !res.error && res.data) || [];
        liste.innerHTML = lignes.length
          ? lignes.map(function (i) {
              var nom = String(i.fokontany || i.email || '').replace(/[<>&]/g, '');
              var quoi = i.karazana === 'commun' ? '🏛️ Commun' : '🗂️ Fokontany';
              var d = new Date(i.created_at);
              return '<div class="list-row">' +
                '<span>' + quoi + ' ' + nom + ' <span style="color:var(--muted);">· ' +
                  String(i.email || '').replace(/[<>&]/g, '') + '</span></span>' +
                '<span style="white-space:nowrap; color:var(--muted);">' +
                  (isNaN(d) ? '—' : d.toLocaleDateString('fr-FR')) + '</span>' +
              '</div>';
            }).join('')
          : '<p class="empty-hint" style="padding:0.4rem 0;">Mbola tsy misy fokontany nametraka ny app.</p>';
      }, function () {});
  };

  // ---------- Installation : l'admin, et le fokontany qu'il a validé ----------
  // La page n'a pas de manifeste : pour qui n'est pas entré, le navigateur n'a
  // rien à installer. L'admin — et, dans le Fokontany, celui dont il a validé
  // l'accès (✅ Hamafiso) — le reçoit ici, avec les balises
  // d'iOS qui ne lit pas le manifeste. Il ne se retire pas à la déconnexion :
  // le navigateur l'a déjà lu, et seul un rechargement l'oublierait — d'où
  // le rechargement dans fermer().
  var invitation = null;
  var installable = false;
  function dejaInstallee() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function surIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function montrerInstallation() {
    var proprio = installable && !!currentUser && !dejaInstallee();
    $('fkInstaller').style.display = (proprio && invitation) ? '' : 'none';
    $('fkInstallIos').style.display = (proprio && !invitation && surIOS()) ? '' : 'none';
  }
  // Le propriétaire, et le fokontany dont l'admin a validé l'accès.
  window.__fkRendreInstallable = function () { rendreInstallable(); };
  // Chaque fokontany a son application : même page, mais un manifeste à son
  // nom — identifiant, adresse de départ et titre différents. Pour le
  // navigateur, ce sont des applications distinctes, et l'admin peut donc les
  // installer l'une après l'autre, même sur le même ordinateur. Sans nom
  // (ou dans le Commun), c'est le manifeste du site qui sert.
  function adresseDuManifeste() {
    if (APP_COMMUN) return '/fokontany/commun/manifest.webmanifest';
    var nom = '';
    try { nom = String(localStorage.getItem('stockmanager_fokontany_nom') || '').trim(); } catch (e) {}
    if (!nom) return '/fokontany/manifest.webmanifest';
    var depart = '/fokontany/?f=' + encodeURIComponent(nom);
    var manifeste = {
      id: depart,
      name: 'Fokontany ' + nom,
      short_name: nom.length > 12 ? nom.slice(0, 12) : nom,
      description: 'Fokontany ' + nom + ' : livre de famille, adidy, taratasy.',
      lang: 'mg', dir: 'ltr',
      start_url: depart,
      scope: '/fokontany/',
      display: 'standalone',
      background_color: '#0a0d10',
      theme_color: '#0a0d10',
      icons: [
        { src: '/fokontany/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/fokontany/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/fokontany/icone-512-masquable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };
    try {
      return URL.createObjectURL(new Blob([JSON.stringify(manifeste)], { type: 'application/manifest+json' }));
    } catch (e) {
      // Un navigateur qui refuse le manifeste fabriqué garde celui du site :
      // l'application s'installe, sous le nom commun.
      return '/fokontany/manifest.webmanifest';
    }
  }

  function rendreInstallable() {
    if (!installable) {
      installable = true;
      // Le fokontany validé l'apprend : le bouton seul, en haut, passerait inaperçu.
      if (currentUser && !isOwnerEmail(currentUser.email) && !dejaInstallee()) {
        window.__ajouterNotificationAction('fangatahana',
          'Nohamafisin\'ny admin ny fidiranao : afaka mametraka ny app Fokontany amin\'ity ordinateur ity ianao (📲 Installer, eo ambony).');
      }
      var tete = document.head;
      function balise(tag, attributs) {
        var el = document.createElement(tag);
        Object.keys(attributs).forEach(function (k) { el.setAttribute(k, attributs[k]); });
        tete.appendChild(el);
      }
      var manifesteDuFokontany = adresseDuManifeste();
      balise('link', { rel: 'manifest', href: manifesteDuFokontany });
      // Un navigateur qui refuserait le manifeste fabriqué (blob) ne
      // proposerait rien du tout : au bout de quelques secondes sans
      // invitation, on repasse à celui du site, commun à tous les fokontany.
      if (manifesteDuFokontany.indexOf('blob:') === 0) {
        setTimeout(function () {
          if (invitation || dejaInstallee()) return;
          var lien = document.querySelector('link[rel="manifest"]');
          if (lien) lien.setAttribute('href', '/fokontany/manifest.webmanifest');
        }, 4000);
      }
      balise('meta', { name: 'mobile-web-app-capable', content: 'yes' });
      balise('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
      balise('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
      balise('meta', { name: 'apple-mobile-web-app-title', content: APP_COMMUN ? 'Commun' : 'Fokontany' });
    }
    montrerInstallation();
  }
  // Chrome et Edge le préviennent une fois le manifeste lu ; on garde
  // l'invitation pour le bouton, qui seul peut la déclencher.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (!installable || !currentUser) return;
    invitation = e;
    montrerInstallation();
  });
  // L'application installée s'ouvre sur l'écran de connexion, pour le compte
  // du fokontany : elle a sa propre session (supabase-init.js), l'admin reste
  // connecté dans le navigateur.
  // Installée : on l'écrit, pour que l'admin sache lequel est fait et ne
  // donne pas deux fois l'accès au même fokontany. C'est le compte du
  // fokontany qui écrit sa ligne, et lui seul (supabase-fokontany-installation.sql).
  function noterLinstallation() {
    if (!currentUser || !window.__sb) return;
    var nom = '';
    var commun = '';
    try {
      nom = APP_COMMUN ? '' : String(localStorage.getItem('stockmanager_fokontany_nom') || '').trim();
      commun = String(localStorage.getItem(APP_COMMUN ? CLE_NOM_COMMUN : 'stockmanager_fokontany_commun') || '').trim();
    } catch (e) {}
    var appareil = '';
    try { appareil = String(navigator.userAgent || '').slice(0, 160); } catch (e) {}
    window.__sb.from('fokontany_installation').insert({
      email: String(currentUser.email || '').trim().toLowerCase(),
      fokontany: nom || null,
      commun: commun || null,
      karazana: APP_COMMUN ? 'commun' : 'fokontany',
      appareil: appareil || null
    }).then(function () {}, function () {});
  }
  window.addEventListener('appinstalled', function () {
    invitation = null;
    montrerInstallation();
    noterLinstallation();
  });
  // Ouverte dans la fenêtre de l'application : elle est donc installée, même
  // si l'on n'a pas vu l'événement (installée hier, ou sur un autre profil).
  if (dejaInstallee()) setTimeout(function () { if (currentUser) noterLinstallation(); }, 3000);
  $('fkInstaller').addEventListener('click', function () {
    if (!invitation) return;
    invitation.prompt();
    invitation.userChoice.then(function () { invitation = null; montrerInstallation(); }, function () {});
  });

  function fermer() {
    // Le manifeste du propriétaire a été lu : seul un rechargement le fait
    // oublier au navigateur, pour que le compte suivant ne puisse installer.
    if (installable) { window.location.reload(); return; }
    currentUser = null;
    $('appScreen').style.display = 'none';
    $('loginScreen').style.display = '';
  }

  function dire(texte, erreur) {
    var el = $('fkLoginStatus');
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  var auth = window.__sb && window.__sb.auth;

  $('fkLoginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!auth) { dire('Tsy tafiditra ny Supabase : jereo ny connexion internet.', true); return; }
    var email = normEmail($('fkLoginEmail').value);
    var mdp = $('fkLoginPassword').value;
    var bouton = $('fkLoginBtn');
    bouton.disabled = true;
    dire('Miditra…');
    auth.signInWithPassword({ email: email, password: mdp }).then(function (res) {
      bouton.disabled = false;
      if (res.error || !res.data || !res.data.user) {
        dire('Diso ny email na ny mot de passe.', true);
        return;
      }
      dire('');
      $('fkLoginPassword').value = '';
      ouvrir(res.data.user);
    }, function () {
      bouton.disabled = false;
      dire('Tsy tafaverina ny serveur. Andramo indray.', true);
    });
  });

  // ---------- Kaonty vaovao, mot de passe adino ----------
  // Comme dans Ny asako (common.js), mais on entre ensuite ici, dans le
  // Fokontany : la personne venue pour lui n'a pas à passer par le stock.
  function erreurAuth(e) {
    var brut = String((e && (e.message || e.error_description)) || '').toLowerCase();
    if (brut.indexOf('invalid login credentials') >= 0) return 'Diso ny email na ny mot de passe.';
    if (brut.indexOf('already') >= 0) return 'Efa manana kaonty io email io : midira, na ampiasao ny « Adino ny mot de passe ».';
    if (brut.indexOf('email not confirmed') >= 0) return 'Mbola tsy voamarina ny email : sokafy ny mailaka nalefa taminao.';
    if (brut.indexOf('signup') >= 0 && brut.indexOf('disabled') >= 0) return 'Tsy azo atao ny mamorona kaonty amin\'izao fotoana izao.';
    if (brut.indexOf('rate limit') >= 0 || brut.indexOf('too many') >= 0) return 'Be loatra ny fangatahana : andraso kely dia avereno.';
    if (brut.indexOf('password') >= 0 && brut.indexOf('6') >= 0) return 'Tokony ho 6 litera farafahakeliny ny mot de passe.';
    return 'Tsy nety : ' + ((e && e.message) || 'antony tsy fantatra');
  }

  // ---------- Hanova ny mot de passe (⚙️ Fikirana) ----------
  // L'ancien d'abord : on se reconnecte avec lui, ce qui prouve qu'il est
  // juste. Le nouveau, tapé deux fois à l'identique, ne remplace l'ancien
  // qu'ensuite ; jusque-là, c'est l'ancien qui ouvre le compte.
  $('fkMdpForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var st = $('fkMdpStatus');
    var dire = function (t, ok) { st.textContent = t; st.style.color = ok ? 'var(--cyan)' : 'var(--red)'; };
    var taloha = $('fkMdpTaloha').value;
    var vaovao = $('fkMdpVaovao').value;
    var averina = $('fkMdpAverina').value;
    var email = currentUser && currentUser.email;
    if (!auth || !email) { dire('Midira aloha.'); return; }
    if (!taloha) { dire('Soraty ny mot de passe taloha.'); return; }
    if (vaovao.length < 6) { dire('Tokony ho 6 litera farafahakeliny ny mot de passe vaovao.'); return; }
    if (vaovao !== averina) { dire('Tsy mitovy ilay vaovao sy ny famerenana azy.'); return; }
    if (vaovao === taloha) { dire('Mitovy amin\'ny taloha ilay vaovao.'); return; }
    var bouton = $('fkMdpOvay');
    bouton.disabled = true;
    dire('Fanamarinana…', true);
    auth.signInWithPassword({ email: email, password: taloha }).then(function (r) {
      if (r && r.error) {
        var brut = String(r.error.message || '').toLowerCase();
        throw new Error(brut.indexOf('invalid login credentials') >= 0 ? 'Diso ny mot de passe taloha.' : erreurAuth(r.error));
      }
      return auth.updateUser({ password: vaovao });
    }).then(function (up) {
      if (up && up.error) throw new Error(erreurAuth(up.error));
      $('fkMdpForm').reset();
      dire('✓ Voaova ny mot de passe : ilay vaovao no ampiasaina manomboka izao.', true);
    }).catch(function (err) {
      dire((err && err.message) || 'Tsy tratra ny serveur : jereo ny réseau.');
    }).then(function () { bouton.disabled = false; });
  });

  function tsindry(id, idMiafina) {
    var box = $(id);
    var misokatra = box.style.display === 'none';
    box.style.display = misokatra ? '' : 'none';
    $(idMiafina).style.display = 'none';
  }
  $('fkVaovaoBtn').addEventListener('click', function () { tsindry('fkVaovaoForm', 'fkAdinoBox'); });
  $('fkAdinoBtn').addEventListener('click', function () {
    tsindry('fkAdinoBox', 'fkVaovaoForm');
    if (!$('fkAdinoEmail').value) $('fkAdinoEmail').value = $('fkLoginEmail').value;
  });

  $('fkVaovaoForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var st = $('fkVaovaoStatus');
    if (!auth) { st.textContent = 'Tsy tafiditra ny Supabase : jereo ny connexion internet.'; return; }
    var anarana = $('fkVaovaoAnarana').value.trim();
    var email = normEmail($('fkVaovaoEmail').value);
    var finday = $('fkVaovaoFinday').value.trim();
    var mdp = $('fkVaovaoMdp').value;
    if (!anarana || !email) { st.textContent = 'Soraty ny anarana sy ny email.'; return; }
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe.'; return; }
    $('fkVaovaoValider').disabled = true;
    st.textContent = 'Mamorona ny kaonty…';
    auth.signUp({ email: email, password: mdp, options: { data: { name: anarana, phone: finday } } }).then(function (res) {
      $('fkVaovaoValider').disabled = false;
      if (res && res.error) {
        // L'email a peut-être déjà un compte : on tente d'entrer avec, comme Ny asako.
        auth.signInWithPassword({ email: email, password: mdp }).then(function (r2) {
          if (r2 && r2.error) { st.textContent = erreurAuth(res.error); return; }
          ouvrir(r2.data.user);
        }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
        return;
      }
      // La même trace qu'une inscription dans Ny asako : le propriétaire la voit.
      try {
        window.__sb.from('client_signups').insert({ name: anarana, email: email, phone: finday }).then(function () {}, function () {});
      } catch (err) {}
      if (res.data && res.data.session) { ouvrir(res.data.user); return; }
      st.textContent = 'Vita ny kaonty, fa mila hamafisina amin\'ny mailaka : sokafy ny mailaka nalefa tamin\'ny ' +
        email + ', tsindrio ny rohy, dia midira eto.';
      $('fkLoginEmail').value = email;
    }, function () {
      $('fkVaovaoValider').disabled = false;
      st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.';
    });
  });

  // Le code reçu vaut une connexion le temps de changer le mot de passe :
  // verifyOtp ouvre la session, updateUser pose le nouveau mot de passe.
  $('fkAdinoAlefa').addEventListener('click', function () {
    var st = $('fkAdinoStatus');
    var email = normEmail($('fkAdinoEmail').value);
    if (!email) { st.textContent = 'Soraty aloha ny email.'; return; }
    if (!auth) { st.textContent = 'Tsy tafiditra ny Supabase : jereo ny connexion internet.'; return; }
    st.textContent = 'Mandefa ny code…';
    auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname }).then(function (res) {
      if (res && res.error) { st.textContent = erreurAuth(res.error); return; }
      st.textContent = 'Nalefa tamin\'ny ' + email + ' ny code. Adikao eto ambany ilay ao amin\'ny mailaka farany ' +
        '(adiny iray no faharetany). Jereo koa ny « Spam ».';
      $('fkAdinoCodeBox').style.display = '';
      $('fkAdinoCode').focus();
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });
  $('fkAdinoTehirizo').addEventListener('click', function () {
    var st = $('fkAdinoCodeStatus');
    var email = normEmail($('fkAdinoEmail').value);
    var code = $('fkAdinoCode').value.replace(/\s+/g, '');
    var mdp = $('fkAdinoMdp').value;
    if (!/^\d{6,10}$/.test(code)) { st.textContent = 'Adikao ilay code (isa) voaray tamin\'ny mailaka.'; return; }
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe vaovao.'; return; }
    st.textContent = 'Manamarina ny code…';
    auth.verifyOtp({ email: email, token: code, type: 'recovery' }).then(function (res) {
      if (res && res.error) {
        st.textContent = /expired|invalid/i.test(res.error.message || '') || res.error.code === 'otp_expired'
          ? 'Diso, lany daty na efa nampiasaina ilay code. Jereo ny mailaka farany, na mangataha vaovao.'
          : erreurAuth(res.error);
        return;
      }
      st.textContent = 'Mitahiry…';
      auth.updateUser({ password: mdp }).then(function (up) {
        if (up && up.error) { st.textContent = erreurAuth(up.error); return; }
        var user = (up && up.data && up.data.user) || (res.data && res.data.user);
        if (user) ouvrir(user);
      }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });

  // Revenu par le lien de l'email plutôt que par le code : la session est
  // ouverte pour changer le mot de passe, on le demande avant d'entrer.
  var retourRecuperation = !!window.__passwordRecovery || /type=recovery/.test(String(window.__authLinkHash || ''));
  if (retourRecuperation) {
    $('fkRecoveryBox').style.display = '';
    $('fkVaovaoBtn').style.display = 'none';
    $('fkAdinoBtn').style.display = 'none';
  }
  $('fkRecoveryTehirizo').addEventListener('click', function () {
    var st = $('fkRecoveryStatus');
    var mdp = $('fkRecoveryMdp').value;
    if (mdp.length < 6) { st.textContent = 'Tokony ho 6 litera farafahakeliny ny mot de passe vaovao.'; return; }
    st.textContent = 'Mitahiry…';
    auth.updateUser({ password: mdp }).then(function (up) {
      if (up && up.error) { st.textContent = erreurAuth(up.error); return; }
      retourRecuperation = false;
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      if (up.data && up.data.user) ouvrir(up.data.user);
    }, function () { st.textContent = 'Tsy tratra ny serveur : jereo ny réseau.'; });
  });

  $('fkSortir').addEventListener('click', function () {
    // Attendre la fin : fermer() peut recharger la page, et un rechargement
    // pendant la déconnexion garderait la session.
    if (!auth) { fermer(); return; }
    // Cette session seulement (scope local) : sortir de l'application
    // installée ne doit pas déconnecter l'admin de Ny asako, ni ailleurs.
    auth.signOut({ scope: 'local' }).then(fermer, fermer);
  });

  document.querySelectorAll('#dash-commun [data-commun]').forEach(function (tab) {
    tab.addEventListener('click', function () { choisirOngletCommun(tab.dataset.commun); });
  });

  // Une session déjà ouverte — ici ou dans Ny asako, même site, même
  // navigateur — rouvre l'application sans redemander le mot de passe.
  if (auth) {
    auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      // Retour de récupération : le nouveau mot de passe d'abord.
      if (session && session.user && !retourRecuperation) ouvrir(session.user);
    }, function () {});
    // Une déconnexion faite dans Ny asako, dans un autre onglet, vaut ici aussi.
    auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && currentUser) fermer();
      // L'événement peut arriver après le chargement : la même boîte.
      if (event === 'PASSWORD_RECOVERY' && !currentUser) {
        retourRecuperation = true;
        $('fkRecoveryBox').style.display = '';
        $('fkVaovaoBtn').style.display = 'none';
        $('fkAdinoBtn').style.display = 'none';
      }
    });
  }

  // Installable et ouvrable sans réseau : le service worker du site entier.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
});

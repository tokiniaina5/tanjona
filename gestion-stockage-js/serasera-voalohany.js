// ============================================================
// Les canaux du propriétaire, montrés au client qui vient d'entrer
//
// Le client qui vient de s'inscrire ne sait pas encore par où joindre qui
// tient la boutique. Les canaux existent — l'admin les a renseignés dans
// « Configurer vos canaux de contact » — mais ils dorment derrière
// « Nous contacter », puis derrière « 📞 Antso », puis derrière une liste.
// Trois portes avant le premier bonjour.
//
// À sa première entrée, et à elle seule, tout s'ouvre donc devant lui : un
// panneau qui paraît de lui-même, chaque canal en toutes lettres, d'un
// doigt.
//
// Ce que le navigateur permet, et ce qu'il ne permet pas. Ouvrir des
// onglets sans que personne n'ait touché l'écran ne se fait pas : un script
// qui ouvre tout seul, c'est la définition même de ce que le bloqueur de
// « pop-up » existe pour arrêter, et il les arrête tous, sans rien dire.
// Ce qui s'ouvre de soi-même, c'est donc le panneau — cela, aucun navigateur
// ne l'interdit. Le reste tient en un appui :
//
//   — « Sokafy daholo » les tente TOUS d'un coup. Cela marche quand les
//     « pop-up » sont autorisées pour le site ; sinon le navigateur n'en
//     laisse passer qu'une, la première ;
//   — chaque ligne EST un lien. Touchée du doigt, elle ouvre son onglet et
//     rien ne le refuse jamais : ce n'est plus un script qui demande, c'est
//     la personne qui clique.
//
// C'est la leçon de zara-rehetra.js, apprise dans l'autre sens : là-bas on
// envoie à tout le monde, ici on montre tout le monde à qui arrive.
// ============================================================
(function () {
  'use strict';

  // Posée par recordNewSignup (common.js), au moment où l'on sait que le
  // compte est neuf. Elle porte l'email : ouvert sur un autre compte, le
  // panneau attendrait le bon.
  var CLE = 'stockmanager_client_nouveau';

  function echap(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function marque() {
    try { return localStorage.getItem(CLE) || ''; } catch (e) { return ''; }
  }
  function effacerLaMarque() {
    try { localStorage.removeItem(CLE); } catch (e) {}
  }

  // Les mêmes canaux que « Nous contacter », mais tous à plat : ici, rien
  // n'est rangé par usage — on ne choisit pas encore, on découvre.
  function lignesDesCanaux(channels, extra) {
    var lignes = [];
    var ch = channels || {};

    var numero = String(ch.whatsapp || '').replace(/[^\d]/g, '');
    if (numero && typeof toInternationalNumber === 'function') {
      lignes.push({
        nom: '💬 WhatsApp', couleur: '#25D366',
        adresse: 'https://wa.me/' + toInternationalNumber(numero),
        sous: '+' + toInternationalNumber(numero)
      });
    }

    // Une adresse qui n'est pas un profil ne mène pas au propriétaire mais au
    // compte de celui qui clique : contact.js l'écarte, et ce panneau ne peut
    // pas être plus complaisant que « Nous contacter ».
    var propre = (typeof adresseDeProfil === 'function')
      ? function (cle, v) { return adresseDeProfil(cle, v); }
      : function (cle, v) { return String(v || '').trim(); };

    var fb = propre('facebook', ch.facebook);
    if (fb) {
      // La page Facebook se change en conversation Messenger quand elle le
      // peut : le client arrive dans le fil de discussion, et non devant une
      // page où il faudrait encore chercher où écrire.
      var messenger = (typeof facebookToMessenger === 'function') ? facebookToMessenger(fb) : null;
      lignes.push({
        nom: messenger ? '📘 Messenger' : '📘 Facebook', couleur: '#1877F2',
        adresse: messenger || fb
      });
    }

    [
      { cle: 'instagram', nom: '📸 Instagram', couleur: '#E1306C' },
      { cle: 'tiktok', nom: '🎵 TikTok', couleur: '#e7e9ea' },
      { cle: 'threads', nom: '🧵 Threads', couleur: '#e7e9ea' },
      { cle: 'twitter', nom: '✖️ X (Twitter)', couleur: '#e7e9ea' }
    ].forEach(function (f) {
      var url = propre(f.cle, ch[f.cle]);
      if (url) lignes.push({ nom: f.nom, couleur: f.couleur, adresse: url });
    });

    // WeChat n'a pas d'adresse web qui ouvre une conversation : il n'y a que
    // l'identifiant, à coller dans la recherche de l'application.
    var wechat = String(ch.wechat || '').trim();
    if (wechat) {
      lignes.push({ nom: '💚 WeChat', couleur: '#07C160', adresse: '', copie: wechat, sous: wechat });
    }

    (extra || []).forEach(function (item) {
      if (!item || !item.name) return;
      var valeur = String(item.url || '').trim();
      if (/^https?:\/\//i.test(valeur)) {
        var lien = propre('', valeur);
        if (lien) lignes.push({ nom: item.name, couleur: 'var(--cyan)', adresse: lien });
        return;
      }
      var chiffres = valeur.replace(/[^\d]/g, '');
      if (chiffres.length >= 7 && typeof toInternationalNumber === 'function') {
        lignes.push({
          nom: '☎️ ' + item.name, couleur: 'var(--cyan)',
          adresse: 'https://wa.me/' + toInternationalNumber(chiffres),
          sous: valeur
        });
        return;
      }
      if (valeur) lignes.push({ nom: item.name, couleur: 'var(--cyan)', adresse: '', copie: valeur, sous: valeur });
    });

    return lignes;
  }

  function montrer(lignes) {
    var ancien = document.getElementById('seraseraVoalohany');
    if (ancien) ancien.remove();

    var nom = (typeof OWNER_NAME === 'string') ? OWNER_NAME : 'ny tompon\'ny tranonkala';
    var aOuvrir = lignes.filter(function (l) { return l.adresse; });

    var fond = document.createElement('div');
    fond.id = 'seraseraVoalohany';
    fond.setAttribute('role', 'dialog');
    fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; ' +
      'align-items:center; justify-content:center; z-index:9300; padding:1rem;';

    var boite = document.createElement('div');
    boite.className = 'panel';
    boite.style.cssText = 'max-width:420px; width:100%; margin:0; max-height:86vh; overflow-y:auto;';
    boite.innerHTML =
      '<h3>🤝 Tongasoa !</h3>' +
      '<p style="font-size:0.8rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
        'Ireto ny fomba rehetra hifandraisana amin\'i <strong style="color:var(--text);">' + echap(nom) + '</strong>. ' +
        'Tsindrio iray, na sokafy daholo.' +
      '</p>' +
      '<div data-liste></div>' +
      (aOuvrir.length > 1
        ? '<button type="button" class="btn btn-primary btn-sm" data-daholo style="width:100%; margin-top:0.6rem;">' +
          '↗️ Sokafy daholo (' + aOuvrir.length + ')</button>'
        : '') +
      '<p data-avis style="font-size:0.74rem; color:var(--muted); line-height:1.5; margin:0.7rem 0 0;"></p>' +
      '<button type="button" class="btn btn-sm" data-hidio style="width:auto; margin-top:0.6rem;">Hidio</button>';

    var liste = boite.querySelector('[data-liste]');
    var avis = boite.querySelector('[data-avis]');

    function dessiner() {
      liste.innerHTML = lignes.map(function (l, i) {
        var style = 'color:' + l.couleur + '; text-decoration:none;' + (l.ouvert ? ' opacity:0.55;' : '');
        var titre = l.adresse
          ? '<a href="' + echap(l.adresse) + '" target="_blank" rel="noopener" data-lien style="' + style + '">' +
            echap(l.nom) + '</a>'
          : '<button type="button" data-lien style="' + style +
            ' background:none; border:none; padding:0; font:inherit; cursor:pointer; text-align:left;">' +
            echap(l.nom) + '</button>';
        return '<div class="list-row" data-i="' + i + '">' +
          '<span style="display:flex; align-items:center; gap:0.5rem; min-width:0;">' +
            '<span style="width:1em; color:var(--muted); flex:none;">' + (l.ouvert ? '✓' : '·') + '</span>' +
            '<span style="min-width:0;">' + titre + '</span></span>' +
          '<span style="color:var(--muted); font-size:0.72rem; white-space:nowrap;">' +
            echap(l.sous || '') + '</span>' +
        '</div>';
      }).join('');
    }
    dessiner();

    // Un identifiant ne s'ouvre pas : il se copie, et l'on dit où le coller.
    // Dans un « Sokafy daholo », on ne le dit pas : une alerte au milieu de
    // cinq onglets qui s'ouvrent arrête tout le reste.
    function prendre(l, sansUnMot) {
      if (!l.copie) return;
      if (typeof copyToClipboardSilently === 'function') copyToClipboardSilently(l.copie);
      if (sansUnMot) return;
      alert('Voadika : ' + l.copie + '. Sokafy ny ' + l.nom.replace(/^\S+\s/, '') + ' dia tadiavo io anarana io.');
    }

    liste.addEventListener('click', function (ev) {
      var lien = ev.target.closest && ev.target.closest('[data-lien]');
      if (!lien) return;
      var ligne = lien.closest('[data-i]');
      if (!ligne) return;
      var l = lignes[Number(ligne.getAttribute('data-i'))];
      if (!l) return;
      if (!l.adresse) { ev.preventDefault(); prendre(l); return; }
      // Surtout pas de preventDefault : c'est le lien lui-même qui ouvre
      // l'onglet. Et pas de redessin dans la foulée — remplacer le lien
      // pendant qu'on clique dessus annulerait l'ouverture.
      l.ouvert = true;
      setTimeout(dessiner, 0);
    });

    var bDaholo = boite.querySelector('[data-daholo]');
    if (bDaholo) {
      bDaholo.addEventListener('click', function () {
        var refuses = 0;
        aOuvrir.forEach(function (l) {
          var fenetre = window.open(l.adresse, '_blank', 'noopener');
          if (fenetre) l.ouvert = true; else refuses++;
        });
        var copies = lignes.filter(function (l) { return l.copie; });
        copies.forEach(function (l) { prendre(l, true); });
        dessiner();
        var mot = refuses
          ? refuses + ' no tsy nisokatra : sakanan\'ny navigateur ny « pop-up ». ' +
            'Tsindrio tsirairay eo ambony — tsy misy misakana izany mihitsy.'
          : 'Nisokatra daholo. Jereo ny onglet vaovao.';
        // Le dernier identifiant copié est celui qui est dans le presse-papier :
        // c'est lui, et lui seul, qu'on peut coller tout de suite.
        if (copies.length) {
          var dernier = copies[copies.length - 1];
          mot += ' Voadika ny anaran\'ny ' + dernier.nom.replace(/^\S+\s/, '') + ' : ' + dernier.copie + '.';
        }
        avis.textContent = mot;
      });
    }

    function fermer() { fond.remove(); }
    boite.querySelector('[data-hidio]').addEventListener('click', fermer);
    fond.addEventListener('click', function (e) { if (e.target === fond) fermer(); });

    fond.appendChild(boite);
    document.body.appendChild(fond);
  }

  // Vrai quand il n'y a plus rien à attendre : le panneau est montré, ou la
  // marque ne nous concernait pas.
  function essayer() {
    var attendu = marque();
    if (!attendu) return false;

    var ecran = document.getElementById('appScreen');
    if (!ecran || getComputedStyle(ecran).display === 'none') return false;

    var moi = (typeof currentUser === 'object' && currentUser) ? currentUser : null;
    var email = moi && moi.email ? String(moi.email).trim().toLowerCase() : '';
    // Le panneau est pour celui qui vient de s'inscrire. Un autre compte
    // ouvert entre-temps ne le voit pas, et la marque l'attend toujours.
    if (!email) return false;
    if (email !== attendu) return true;
    // Le propriétaire est celui qui les a renseignés : il n'a personne à
    // joindre, et surtout pas lui-même.
    if (typeof OWNER_EMAIL === 'string' && email === OWNER_EMAIL.trim().toLowerCase()) {
      effacerLaMarque();
      return true;
    }

    // Une fois montré, il ne revient plus : la marque part avant même que
    // les canaux n'arrivent du serveur, sinon une lecture lente rouvrirait
    // le panneau à chaque ouverture de l'application.
    effacerLaMarque();
    if (typeof fetchContactChannels !== 'function') return true;
    fetchContactChannels(function (channels, extra) {
      var lignes = lignesDesCanaux(channels, extra);
      // Rien de renseigné : pas de panneau vide pour dire qu'il n'y a rien.
      if (lignes.length) montrer(lignes);
    });
    return true;
  }

  function veiller() {
    if (essayer()) return;
    // On guette sans condition, et non seulement quand la marque est déjà
    // là : l'inscription se fait dans cette page-ci, la marque n'existe donc
    // pas encore au chargement. Elle est posée, puis l'application s'ouvre —
    // et c'est cette ouverture que l'on attend.
    var ecran = document.getElementById('appScreen');
    if (ecran && window.MutationObserver) {
      var oeil = new MutationObserver(function () {
        if (essayer()) oeil.disconnect();
      });
      oeil.observe(ecran, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', veiller);
  } else {
    veiller();
  }
})();

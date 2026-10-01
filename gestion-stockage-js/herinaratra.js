// ⏻ « Herinaratra » : le petit menu d'arrêt, comme celui de Windows. On tient
// le N de la rangée du bas appuyé (ou clic droit sur un ordinateur) : il monte
// au-dessus de lui. Un appui court sur le N ouvre le menu, comme toujours.
//
//   🔒 Hidio    — l'écran se couvre ; on le rouvre avec son mot de passe.
//                 Rechargée, la page reste couverte : verrouiller n'est pas
//                 une politesse qu'un F5 efface. Entré sans compte (« Essai
//                 libre »), il n'y a pas de mot de passe de compte : on en
//                 choisit un pour l'écran, gardé sur l'appareil seulement, et
//                 seulement son empreinte (SHA-256), jamais le mot lui-même.
//   🌙 Atory    — l'écran s'éteint (noir) ; un appui ou une touche le rallume,
//                 sur l'écran verrouillé : on rentre avec son mot de passe.
//   ⏻ Déconnecter — on sort du compte (le bouton « Se déconnecter »).
//   🔄 Avereno  — l'application se recharge.
(function(){
  var CLE_HIDY = 'nyasako_ecran_hidy';
  var CLE_KODY = 'nyasako_ecran_kody';
  function lireKody(){ try{ return localStorage.getItem(CLE_KODY) || ''; }catch(e){ return ''; } }
  // L'empreinte du mot de l'écran : on compare des empreintes, et le mot
  // n'est écrit nulle part.
  function empreinte(mot){
    var texte = 'nyasako-hidy:' + mot;
    if(window.crypto && crypto.subtle && window.TextEncoder){
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte)).then(function(b){
        return Array.prototype.map.call(new Uint8Array(b), function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
      });
    }
    var h = 5381;
    for(var i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
    return Promise.resolve('d' + (h >>> 0).toString(16));
  }
  var bouton = document.getElementById('menuToggle');
  var lisitra = document.getElementById('herinaratraLisitra');
  if(!bouton || !lisitra) return;
  document.body.appendChild(lisitra);

  function ouvrir(oui){
    lisitra.hidden = !oui;
    if(!oui) return;
    // Juste au-dessus du N, sans sortir de l'écran.
    var r = bouton.getBoundingClientRect();
    var large = lisitra.offsetWidth || 200;
    lisitra.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - large - 8))) + 'px';
    lisitra.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
    lisitra.style.top = 'auto';
  }
  // Tenu une demi-seconde : le panneau s'ouvre, et le relâché qui suit
  // n'ouvre pas le menu.
  var minuterie = null, depart = null, tenu = false;
  bouton.addEventListener('pointerdown', function(e){
    if(e.button > 0) return;
    tenu = false;
    depart = { x: e.clientX, y: e.clientY };
    clearTimeout(minuterie);
    minuterie = setTimeout(function(){
      tenu = true;
      if(navigator.vibrate) try{ navigator.vibrate(15); }catch(err){}
      ouvrir(true);
    }, 500);
  });
  bouton.addEventListener('pointermove', function(e){
    if(depart && Math.abs(e.clientX - depart.x) + Math.abs(e.clientY - depart.y) > 12) clearTimeout(minuterie);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(t){
    bouton.addEventListener(t, function(){ clearTimeout(minuterie); depart = null; });
  });
  document.addEventListener('click', function(e){
    if(tenu && e.target.closest && e.target.closest('#menuToggle')){
      tenu = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if(!lisitra.hidden && !lisitra.contains(e.target)) ouvrir(false);
  }, true);
  // Un appui long sur un téléphone ouvre aussi le menu du navigateur ; sur
  // un ordinateur, le clic droit fait le même travail que tenir.
  bouton.addEventListener('contextmenu', function(e){
    e.preventDefault();
    clearTimeout(minuterie);
    ouvrir(true);
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') ouvrir(false); });
  lisitra.addEventListener('click', function(e){
    var b = e.target.closest('[data-h]');
    if(!b) return;
    e.stopPropagation();
    ouvrir(false);
    var quoi = b.getAttribute('data-h');
    if(quoi === 'hidio') hidio();
    else if(quoi === 'atory') atory();
    else if(quoi === 'vonoy') vonoy();
    else if(quoi === 'avereno') location.reload();
  });

  function adresse(){
    var el = document.getElementById('currentUserEmail');
    var t = el ? el.textContent.trim() : '';
    return /@/.test(t) ? t : '';
  }
  function nom(){
    var el = document.getElementById('currentUserName');
    var t = el ? el.textContent.trim() : '';
    return t && t !== '—' ? t : '';
  }
  function ora(){
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ---- 🔒 Hidio ----
  function hidio(){
    try{ localStorage.setItem(CLE_HIDY, '1'); }catch(e){}
    if(document.getElementById('ecranHidy')) return;
    var email = adresse();
    var ecran = document.createElement('div');
    ecran.id = 'ecranHidy';
    ecran.className = 'ecran-hidy';
    ecran.setAttribute('role', 'dialog');
    ecran.setAttribute('aria-label', 'Écran verrouillé');
    ecran.innerHTML =
      '<div class="ecran-hidy-ora" data-ora>' + ora() + '</div>' +
      '<div class="ecran-hidy-daty">' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>' +
      '<form class="ecran-hidy-boaty" autocomplete="on"></form>';
    document.body.appendChild(ecran);
    var minuterie = setInterval(function(){
      var o = ecran.querySelector('[data-ora]');
      if(!o || !ecran.isConnected){ clearInterval(minuterie); return; }
      o.textContent = ora();
    }, 10000);
    var formulaire = ecran.querySelector('form');
    var titre = '<div class="ecran-hidy-anarana">🔒 ' + (nom() || 'Ny asako').replace(/</g, '&lt;') + '</div>';
    var ligneErreur = '<div class="ecran-hidy-hadisoana" role="alert"></div>';
    // Trois visages : le mot de passe du compte ; sans compte, choisir le mot
    // de l'écran (la première fois) ; puis le redemander.
    function dessiner(){
      var mode = email ? 'kaonty' : (lireKody() ? 'kody' : 'vaovao');
      formulaire.dataset.mode = mode;
      formulaire.innerHTML = titre +
        (mode === 'vaovao'
          ? '<div class="ecran-hidy-toro">Mametraha tenimiafina hanokafana ity écran ity.</div>' +
            '<input type="password" class="ecran-hidy-teny" data-teny="1" placeholder="Tenimiafina vaovao" autocomplete="new-password" minlength="4" required>' +
            '<input type="password" class="ecran-hidy-teny" data-teny="2" placeholder="Avereno soratana" autocomplete="new-password" minlength="4" required>' +
            '<button type="submit" class="btn btn-primary">Hidio</button>'
          : '<input type="password" class="ecran-hidy-teny" data-teny="1" placeholder="Tenimiafina" autocomplete="current-password" required>' +
            '<button type="submit" class="btn btn-primary">Sokafy</button>' +
            (mode === 'kody' ? '<button type="button" class="ecran-hidy-hadino" data-hadino>Hadinoko ny tenimiafina</button>' : '')) +
        ligneErreur;
      var premier = formulaire.querySelector('[data-teny="1"]');
      if(premier) setTimeout(function(){ premier.focus(); }, 50);
      var hadino = formulaire.querySelector('[data-hadino]');
      if(hadino) hadino.addEventListener('click', function(){
        // Le mot oublié ne se retrouve pas : il n'est écrit nulle part. On
        // sort du compte, et l'écran se libère avec lui.
        if(!confirm('Hivoaka ianao, ary hofafana ny tenimiafin\'ity écran ity. Tohizana ?')) return;
        try{ localStorage.removeItem(CLE_KODY); }catch(e){}
        sokafy();
        var sortie = document.getElementById('logoutBtn');
        if(sortie) sortie.click();
      });
    }
    dessiner();
    formulaire.addEventListener('submit', function(e){
      e.preventDefault();
      var mode = formulaire.dataset.mode;
      var erreur = formulaire.querySelector('.ecran-hidy-hadisoana');
      var champ = formulaire.querySelector('[data-teny="1"]');
      var envoyer = formulaire.querySelector('button[type="submit"]');
      erreur.textContent = '';
      if(mode === 'vaovao'){
        var bis = formulaire.querySelector('[data-teny="2"]');
        if(champ.value.length < 4){ erreur.textContent = 'Litera 4 farafahakeliny.'; return; }
        if(champ.value !== bis.value){ erreur.textContent = 'Tsy mitovy ireo tenimiafina roa.'; bis.select(); return; }
        empreinte(champ.value).then(function(h){
          try{ localStorage.setItem(CLE_KODY, h); }catch(err){}
          dessiner();
        });
        return;
      }
      if(mode === 'kody'){
        envoyer.disabled = true;
        empreinte(champ.value).then(function(h){
          envoyer.disabled = false;
          if(h === lireKody()){ sokafy(); return; }
          erreur.textContent = 'Diso ny tenimiafina. Andramo indray.';
          champ.select();
        });
        return;
      }
      var auth = window.__sb && window.__sb.auth;
      if(!auth || !auth.signInWithPassword){ erreur.textContent = 'Tsy nety : avereno sokafana ny pejy.'; return; }
      envoyer.disabled = true;
      auth.signInWithPassword({ email: email, password: champ.value }).then(function(r){
        envoyer.disabled = false;
        if(r && !r.error){ sokafy(); return; }
        erreur.textContent = 'Diso ny tenimiafina. Andramo indray.';
        champ.select();
      }, function(){
        envoyer.disabled = false;
        erreur.textContent = 'Tsy nety : jereo ny fifandraisanao.';
      });
    });
    function sokafy(){
      try{ localStorage.removeItem(CLE_HIDY); }catch(e){}
      clearInterval(minuterie);
      ecran.remove();
    }
  }
  // Verrouillé avant de recharger : on le retrouve verrouillé, une fois
  // l'application ouverte (sans compte ouvert, il n'y a rien à cacher).
  // On guette l'ouverture plutôt que de l'attendre un temps donné : sur un
  // téléphone lent, elle peut tarder bien plus de dix secondes.
  function verifier(){
    var hidy = false;
    try{ hidy = localStorage.getItem(CLE_HIDY) === '1'; }catch(e){}
    if(hidy && document.body.classList.contains('appli-ouverte')) hidio();
  }
  verifier();
  new MutationObserver(verifier).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---- 🌙 Atory ----
  function atory(){
    if(document.getElementById('ecranAtory')) return;
    // Le verrou d'abord, sous le noir : au réveil, c'est lui qu'on trouve, et
    // une page rechargée pendant la veille reste verrouillée.
    hidio();
    var ecran = document.createElement('div');
    ecran.id = 'ecranAtory';
    ecran.className = 'ecran-atory';
    ecran.setAttribute('aria-label', 'Écran en veille — touchez pour réveiller');
    document.body.appendChild(ecran);
    function mifoha(e){
      // La touche qui réveille ne s'écrit pas dans le champ du mot de passe.
      if(e && e.type === 'keydown'){ e.preventDefault(); e.stopPropagation(); }
      ecran.remove();
      document.removeEventListener('keydown', mifoha, true);
      var champ = document.querySelector('#ecranHidy [data-teny="1"]');
      if(champ) champ.focus();
    }
    // Le clic qui l'a ouvert ne doit pas le refermer aussitôt.
    setTimeout(function(){
      ecran.addEventListener('pointerdown', mifoha);
      document.addEventListener('keydown', mifoha, true);
    }, 300);
  }

  // ---- ⏻ Déconnecter ----
  function vonoy(){
    if(!confirm('Hivoaka amin\'ny kaontinao ve ianao ?')) return;
    var sortie = document.getElementById('logoutBtn');
    if(sortie) sortie.click();
  }
})();

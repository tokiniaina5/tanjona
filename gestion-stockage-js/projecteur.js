// 📽️ Projecteur : Ny asako sur le mur.
//
// Un ordinateur branché à un projecteur voit deux écrans. Le navigateur sait
// les nommer (Window Management : getScreenDetails) et mettre la page en
// plein écran sur celui qu'on choisit — le projecteur, pas l'écran du
// portable. Sans cette permission, ou sur un navigateur qui ne la connaît
// pas, on ouvre une fenêtre posée à droite de l'écran, là où Windows place
// l'écran « étendu », et le plein écran se fait là-bas.
//
// Un téléphone, lui, n'a pas d'API : la recopie d'écran (Smart View,
// AirPlay) se lance depuis le système. La page le dit (ny-asako.html), et le
// bouton Chromecast essaie la Presentation API de Chrome.
(function(){
  const $ = function(id){ return document.getElementById(id); };
  function dire(t){ const e = $('projecteurEtat'); if(e) e.textContent = t || ''; }

  // L'écran qui n'est pas celui où l'on est : le projecteur.
  function ecranProjecteur(){
    if(!window.getScreenDetails) return Promise.resolve(null);
    return window.getScreenDetails().then(function(d){
      const autres = d.screens.filter(function(s){ return s !== d.currentScreen; });
      // Le projecteur n'est presque jamais l'écran « interne » du portable.
      return autres.find(function(s){ return s.isInternal === false; }) || autres[0] || null;
    });
  }

  function pleinEcran(options){
    const el = document.documentElement;
    if(!el.requestFullscreen) return Promise.reject(new Error('fullscreen'));
    return el.requestFullscreen(options || {});
  }

  function alefa(){
    if(window.screen && window.screen.isExtended === false){
      dire('Iray ihany ny écran hitan\'ny ordinateur. Ampifandraiso ny projecteur, dia ataovy « Étendre » (⊞ Win + P), na « Dupliquer » ary tsindrio « Plein écran eto ».');
      return;
    }
    if(!window.getScreenDetails){
      fenetre();
      return;
    }
    dire('Mitady ny écran an\'ny projecteur…');
    ecranProjecteur().then(function(s){
      if(!s){ dire('Tsy hita ny écran faharoa. Ampifandraiso ny projecteur, dia ataovy « Étendre » (⊞ Win + P).'); return; }
      return pleinEcran({ screen: s }).then(function(){
        dire('Eo amin\'ny projecteur ny Ny asako (' + (s.label || 'écran faharoa') + '). Tsindrio Échap hamerenana azy.');
      });
    }).catch(function(){
      // Permission refusée. La fenêtre posée à côté fait aussi l'affaire,
      // mais l'ouvrir ici, hors du geste, serait bloqué : on la propose.
      dire('Tsy nomena alalana hitantana ny écrans ny navigateur. Tsindrio « 🪟 Fenêtre vaovao any », na ataovy « Dupliquer » (⊞ Win + P) ary « Plein écran eto ».');
    });
  }

  // Une fenêtre ouverte sur l'autre écran. Même adresse, même navigateur :
  // la session est la même, rien à retaper.
  function fenetre(){
    const promesse = window.getScreenDetails ? ecranProjecteur().catch(function(){ return null; }) : Promise.resolve(null);
    // window.open doit partir dans le geste du doigt : on l'ouvre tout de
    // suite, et on la déplace ensuite sur le bon écran.
    const w = window.open(location.href, 'nyasako-projecteur', 'popup,width=1280,height=720,left=' + (screen.width + 50) + ',top=50');
    if(!w){ dire('Nosakanan\'ny navigateur ilay fenêtre : avelao ny « pop-up » ho an\'ity tranonkala ity.'); return; }
    promesse.then(function(s){
      if(s){ try{ w.moveTo(s.availLeft, s.availTop); w.resizeTo(s.availWidth, s.availHeight); }catch(e){} }
    });
    dire('Nisokatra ilay fenêtre. Raha tsy any amin\'ny projecteur izy, sintomy any, dia tsindrio F11 ho plein écran.');
  }

  function cast(){
    if(!window.PresentationRequest){
      dire('Tsy mahay an\'izany ity navigateur ity. Ao amin\'ny Chrome : menu ⋮ → « Caster… » → « Caster l\'onglet ».');
      return;
    }
    try{
      new PresentationRequest([location.href]).start().then(function(){
        dire('Mandeha any amin\'ny TV ny Ny asako. Raha mangataka fidirana izy any, ampiasao ny menu ⋮ → « Caster l\'onglet ».');
      }, function(err){
        if(err && err.name === 'NotAllowedError') return dire('');
        dire('Tsy hita ny TV na Chromecast. Ataovy amin\'ny tambajotra Wi-Fi iray ihany, na ampiasao ny menu ⋮ → « Caster… ».');
      });
    }catch(e){ dire('Ao amin\'ny Chrome : menu ⋮ → « Caster… » → « Caster l\'onglet ».'); }
  }

  // 📦 Boaty + loupe. La loupe retourne l'image dans les deux sens : un
  // demi-tour de la page la remet à l'endroit sur le mur. Le plein écran
  // retire les barres du navigateur, et l'écran reste allumé (Wake Lock) —
  // il s'éteindrait au bout de trente secondes, enfermé dans sa boîte.
  // Le petit « ✕ Boaty » est tourné avec le reste : il apparaît en bas à
  // droite sur le mur, en haut à gauche sur le téléphone.
  let reveil = null;
  (function(){
    const st = document.createElement('style');
    st.textContent = 'html.mode-boaty{transform:rotate(180deg);transform-origin:50% 50%;}';
    document.head.appendChild(st);
  })();
  function boatyMiditra(){
    const html = document.documentElement;
    html.classList.add('mode-boaty');
    if(!$('boatyMivoaka')){
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'boatyMivoaka';
      b.className = 'btn btn-sm';
      b.textContent = '✕ Boaty';
      b.style.cssText = 'position:fixed; right:12px; bottom:12px; z-index:2147483647; width:auto; opacity:0.75;';
      b.addEventListener('click', boatyMivoaka);
      document.body.appendChild(b);
    }
    pleinEcran().catch(function(){});
    if(navigator.wakeLock && navigator.wakeLock.request){
      navigator.wakeLock.request('screen').then(function(v){ reveil = v; }, function(){});
    }
  }
  function boatyMivoaka(){
    document.documentElement.classList.remove('mode-boaty');
    const b = $('boatyMivoaka');
    if(b) b.remove();
    if(reveil){ try{ reveil.release(); }catch(e){} reveil = null; }
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){});
  }
  // Échap (ou le geste « retour ») quitte le plein écran : la boîte aussi.
  document.addEventListener('fullscreenchange', function(){
    if(!document.fullscreenElement && document.documentElement.classList.contains('mode-boaty')) boatyMivoaka();
  });
  // Le Wake Lock tombe quand la page passe derrière ; on le reprend au retour.
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && document.documentElement.classList.contains('mode-boaty') &&
       navigator.wakeLock && navigator.wakeLock.request){
      navigator.wakeLock.request('screen').then(function(v){ reveil = v; }, function(){});
    }
  });

  function brancher(){
    if(!$('projecteurAlefaBtn')) return;
    $('projecteurAlefaBtn').addEventListener('click', alefa);
    $('projecteurFenetreBtn').addEventListener('click', fenetre);
    $('projecteurPleinBtn').addEventListener('click', function(){
      pleinEcran().catch(function(){ dire('Tsy mety ny plein écran eto : tsindrio F11.'); });
    });
    $('projecteurCastBtn').addEventListener('click', cast);
    $('projecteurBoatyBtn').addEventListener('click', function(){
      if(document.documentElement.classList.contains('mode-boaty')) boatyMivoaka(); else boatyMiditra();
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher);
  else brancher();
})();

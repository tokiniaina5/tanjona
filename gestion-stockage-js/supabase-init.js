(function(){
  // Le rangement de la session, fenêtre par fenêtre (voir plus bas).
  function fenetreAPart(){
    var ss, ls;
    try { ss = window.sessionStorage; ls = window.localStorage; ss.getItem('x'); } catch(e){ return null; }
    var SORTI = '-nivoaka';
    function uid(v){ try { var s = JSON.parse(v); return (s && s.user && s.user.id) || ''; } catch(e){ return ''; } }
    function expire(v){ try { return (JSON.parse(v) || {}).expires_at || 0; } catch(e){ return 0; } }
    return {
      getItem: function(k){
        var s = ss.getItem(k), l = ls.getItem(k);
        if(s == null){
          // Déconnectée ici : elle ne reprend pas le compte d'une autre fenêtre.
          if(ss.getItem(k + SORTI)) return null;
          // Fenêtre neuve : elle prend le dernier compte, et le garde.
          if(l != null) ss.setItem(k, l);
          return l;
        }
        // Même compte ailleurs, avec un jeton plus récent : on le reprend.
        // Le vieux jeton, réutilisé, ferait fermer la session des deux côtés.
        if(l != null && uid(s) && uid(l) === uid(s) && expire(l) > expire(s)){ ss.setItem(k, l); return l; }
        return s;
      },
      setItem: function(k, v){
        ss.removeItem(k + SORTI);
        ss.setItem(k, v);
        ls.setItem(k, v);
      },
      removeItem: function(k){
        var s = ss.getItem(k), l = ls.getItem(k);
        ss.removeItem(k);
        ss.setItem(k + SORTI, '1');
        // Le dernier compte reste pour les autres fenêtres s'il n'est pas celui-ci.
        if(l != null && (s == null || uid(l) === uid(s))) ls.removeItem(k);
      }
    };
  }

  var SUPABASE_URL = 'https://ezpsapvthujkhttbfhlr.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_7YAttwKbsmxJUxn9IwR86g_9_h4ZThk';

  // Copie de l'adresse AVANT toute autre chose. Au retour d'un lien reçu par
  // email, elle porte le jeton et le type de lien — mais la bibliothèque la
  // lit et l'efface dès sa création, bien avant que common.js ne s'exécute.
  // Sans cette copie, le retour d'un lien valide ne laisse aucune trace et
  // l'écran « Nouveau code » ne s'affiche jamais. Un jeton invalide, lui,
  // laissait l'adresse en place : c'est pourquoi l'essai semblait concluant.
  try {
    window.__authLinkHash = window.location.hash || '';
    window.__authLinkSearch = window.location.search || '';
  } catch(e){}

  if(!window.supabase || !window.supabase.createClient) return;
  // Le Fokontany et le Commun INSTALLÉS gardent leur session à part. L'admin
  // les installe sur l'ordinateur d'un fokontany : l'application doit s'ouvrir
  // sur l'écran de connexion, pour le compte de ce fokontany, sans que l'admin
  // ait à se déconnecter de Ny asako dans le navigateur. Même stockage, autre
  // clé : les deux sessions ne se voient pas. Dans un onglet ordinaire, rien
  // ne change — la page partage la session de Ny asako.
  // Le Commun et le Fokontany ont chacun la leur : avec une clé commune, se
  // déconnecter de l'un vidait aussi l'autre, ouvert à côté sur le même poste.
  var options = {};
  try {
    var appAPart = /^\/(fokontany|commun)(\/|$)/.exec(window.location.pathname);
    var installee = !window.matchMedia('(display-mode: browser)').matches || window.navigator.standalone === true;
    if(appAPart && installee) {
      options = { auth: { storageKey: appAPart[1] === 'commun' ? 'sb-nyasako-commun-app' : 'sb-nyasako-fokontany-app' } };
    }
  } catch(e){}

  // Chaque fenêtre garde son compte (22/10/2026). Ouvrir un autre compte
  // dans une deuxième fenêtre faisait basculer la première : la session
  // n'existait qu'une fois, dans localStorage. Elle vit maintenant dans la
  // fenêtre (sessionStorage) ; localStorage n'en garde que la dernière,
  // pour qu'une fenêtre neuve s'ouvre sur un compte connu.
  var stockage = fenetreAPart();
  if(stockage){
    options.auth = options.auth || {};
    options.auth.storage = stockage;
  }
  // Et la bibliothèque ne prévient plus les autres fenêtres d'une connexion
  // (BroadcastChannel) : elles passeraient sur le compte qu'on vient d'ouvrir.
  var BC = window.BroadcastChannel;
  var sb;
  try {
    if(stockage) window.BroadcastChannel = undefined;
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, options);
  } finally {
    window.BroadcastChannel = BC;
  }
  window.__sb = sb;

  // Même raison pour l'événement : il peut partir avant que common.js n'ait pu
  // l'écouter. On le note ici, à la source.
  try {
    sb.auth.onAuthStateChange(function(event){
      if(event === 'PASSWORD_RECOVERY') window.__passwordRecovery = true;
    });
  } catch(e){}

  // enregistre discrètement la visite de cette page (aucun blocage si ça échoue)
  try{
    sb.from('site_visits').insert({
      path: window.location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent
    }).then(function(){}, function(){});
  }catch(e){}

  // applique le contenu modifié par le propriétaire (éléments marqués data-cms="...")
  try{
    sb.from('site_content').select('key,value').then(function(res){
      if(!res || !res.data) return;
      res.data.forEach(function(row){
        document.querySelectorAll('[data-cms="' + row.key + '"]').forEach(function(el){
          el.textContent = row.value;
        });
      });
    }, function(){});
  }catch(e){}
})();
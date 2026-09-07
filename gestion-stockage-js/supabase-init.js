(function(){
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
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
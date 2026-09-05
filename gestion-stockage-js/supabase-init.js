(function(){
  var SUPABASE_URL = 'https://cownezvqavyyhzbjexlh.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_-t-UoOmT6GEKjIVG81Cv3Q_DyLVBapC';
  if(!window.supabase || !window.supabase.createClient) return;
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window.__sb = sb;

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

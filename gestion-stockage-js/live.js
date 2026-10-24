  // ---------------- IDENTITÉ & PRÉSENCE TEMPS RÉEL (appels + live) ----------------
  const ICE_SERVERS = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ] };

  // Ny mpitsidika tsy niditra dia manana anarana maharitra (avy amin'ny
  // identifiant an'ny installation), mba ho azo antsoina sy andefasana hafatra.
  let mpitsidikaId = null;
  function idMpitsidika(){
    if(!mpitsidikaId){
      let id = '';
      try{ id = (typeof ensureInstallDate === 'function' && ensureInstallDate().id) || ''; }catch(e){}
      mpitsidikaId = 'mpitsidika-' + (String(id).replace(/[^a-z0-9]/gi, '').slice(0, 10) || Math.random().toString(36).slice(2, 12));
    }
    return mpitsidikaId;
  }
  // Ny anarana nomen'ny mpitsidika ny tenany (ao amin'ny boaty resaka), voatahiry
  // ao amin'ity fitaovana ity.
  const ANARANA_MPITSIDIKA = 'anaranaMpitsidika';
  function anaranaMpitsidika(){
    try{ return (localStorage.getItem(ANARANA_MPITSIDIKA) || '').trim(); }catch(e){ return ''; }
  }
  // « Android · Chrome » : mba hahafantarana ny mpitsidika tsy nanome anarana.
  function fitaovanaFohy(){
    const ua = navigator.userAgent || '';
    const os = /Android/i.test(ua) ? 'Android' : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad'
      : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
    const nav = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /Edg\//i.test(ua) ? 'Edge' : /FBAN|FBAV/i.test(ua) ? 'Facebook' : /Firefox|FxiOS/i.test(ua) ? 'Firefox'
      : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : '';
    return [os, nav].filter(Boolean).join(' · ');
  }
  // Ny anarana asehon'ny admin ho an'ny olona iray miditra (presence).
  function anaranaAseho(email, p){
    p = p || presenceState[email] || {};
    if(String(email).indexOf('mpitsidika-') !== 0) return p.name || email;
    return p.name && p.name !== 'Mpitsidika' ? p.name : 'Mpitsidika ' + String(email).slice(11, 15);
  }
  // « Mpitsidika · Android · Chrome · #abcd » : ambanin'ny anarana.
  function mombaOlona(email){
    const p = presenceState[email] || {};
    const mpitsidika = String(email).indexOf('mpitsidika-') === 0;
    // Ny admin ihany no mahita ny email.
    const adiresy = mpitsidika ? 'Mpitsidika (tsy nanao inscription)' : (myIdentity().isAdmin ? email : '');
    return [adiresy, p.fitaovana,
      mpitsidika ? '#' + String(email).slice(11, 15) : ''].filter(Boolean).join(' · ');
  }
  function myIdentity(){
    const email = (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : idMpitsidika();
    const name = (currentUser && currentUser.name) || (currentUser ? 'Utilisateur' : (anaranaMpitsidika() || 'Mpitsidika'));
    const isAdmin = !!(currentUser && currentUser.email && currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase());
    return { email: email, name: name, isAdmin: isAdmin };
  }

  let presenceChannel = null;
  let presenceState = {};

  // ---------------- FAMPANDRENESANA AN'NY NAVIGATEUR (système) ----------------
  // Mba ho tonga any amin'ny olona ny vaovao na dia tsy eo amin'ny onglet aza izy,
  // ka hidirany hijery ny Live. Ny navigateur dia mitaky tsindry an-tanana alohan'ny
  // hangatahana alalana : ny tsindry voalohany ataon'ny mpampiasa no ampiasaina.
  function ensureNotificationPermission(){
    if(!('Notification' in window)) return;
    if(Notification.permission !== 'default') return;
    try {
      const p = Notification.requestPermission();
      if(p && p.then) p.then(function(r){ if(r === 'granted') abonnerPush(); });
    } catch(e){}
  }

  // ---------------- NOTIFICATIONS POUSSÉES (app fermée) ----------------
  // Le direct (broadcast) ne touche que les pages ouvertes. Pour le reste,
  // l'appareil s'abonne au Web Push, et chaque hafatra ou antso demande à la
  // fonction « push » (supabase/functions/push) d'avertir le destinataire.
  const VAPID_PUBLIC = 'BKQHRaDMPMHyaYYmKOEuidYVUofz2DowNmdYYw_Eef7f0l9980rKCbcPqskLbJr20fu0eI9kpXReq_8HZF0sfTM';
  function jetonMpiasa(){ return typeof window.__mpiasaJeton === 'function' ? window.__mpiasaJeton() : ''; }
  // Un visiteur sans compte ni lien ne peut ni recevoir ni envoyer.
  function pushPossible(){
    if(!window.__sb || !window.__sb.functions) return false;
    return !!jetonMpiasa() || !!(currentUser && currentUser.email && !/\.invalid$/i.test(currentUser.email));
  }
  function appelPush(corps){
    const jeton = jetonMpiasa();
    if(jeton) corps.jeton = jeton;
    // La page d'un lien passe avec la clé publique (comme vue-mpiasa.js) :
    // une session ouverte dans ce navigateur serait celle d'un autre.
    const cle = window.__sb.supabaseKey;
    const opts = { body: corps };
    if(jeton && cle) opts.headers = { Authorization: 'Bearer ' + cle };
    return window.__sb.functions.invoke('push', opts);
  }
  function cleVapid(){
    const b = VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4);
    const s = atob(b);
    const u = new Uint8Array(s.length);
    for(let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  let pushAbonne = '';
  function abonnerPush(){
    if(!pushPossible() || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    const qui = jetonMpiasa() || currentUser.email;
    if(pushAbonne === qui) return;
    pushAbonne = qui;
    navigator.serviceWorker.ready.then(function(reg){
      return reg.pushManager.getSubscription().then(function(s){
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid() });
      });
    }).then(function(s){
      const j = s.toJSON();
      return appelPush({ action: 'misoratra', endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
        pejy: location.pathname + location.search });
    }).then(function(r){ if(r && r.error) pushAbonne = ''; }, function(){ pushAbonne = ''; });
  }
  function alefaPush(to, kind, extra){
    if(!to || !pushPossible()) return;
    appelPush(Object.assign({ action: 'alefa', to: to, kind: kind }, extra || {})).then(function(){}, function(){});
  }

  function askNotificationPermissionOnFirstClick(){
    if(!('Notification' in window) || Notification.permission !== 'default') return;
    document.addEventListener('click', function once(){
      document.removeEventListener('click', once);
      ensureNotificationPermission();
    });
  }

  // Fampandrenesana ivelan'ny onglet. Tsindriana azy dia miverina eto ny olona
  // ary tanterahina ny asa (miditra amin'ny Live, na mamaly antso).
  function showSystemNotification(title, body, tag, onClick){
    if(!('Notification' in window) || Notification.permission !== 'granted') return null;
    try {
      const n = new Notification(title, { body: body, tag: tag, lang: 'mg' });
      n.onclick = function(){
        try { window.focus(); } catch(e){}
        n.close();
        if(onClick) onClick();
      };
      return n;
    } catch(e){
      // Amin'ny Chrome finday dia tsy mety ny « new Notification » : ny
      // Service Worker no mampiseho azy, ary izy no mamerina ny appli eo
      // anoloana rehefa tsindriana (sw.js, « notificationclick »).
      if(navigator.serviceWorker && navigator.serviceWorker.ready){
        navigator.serviceWorker.ready.then(function(reg){
          return reg.showNotification(title, { body: body, tag: tag, lang: 'mg', renotify: true,
            requireInteraction: true, vibrate: [400, 150, 400, 150, 400] });
        }).catch(function(){});
      }
      return null;
    }
  }

  // ---------------- LE SON ----------------
  // Un navigateur garde muet un son lancé sans geste de la main : un
  // AudioContext créé à l'arrivée d'un hafatra naissait « suspended », et
  // rien ne sortait. Un seul contexte, ouvert au premier toucher de la page,
  // sert ensuite à tous les sons qui arrivent seuls.
  let feoCtx = null;
  function feoVohay(){
    try{
      if(!feoCtx) feoCtx = new (window.AudioContext || window.webkitAudioContext)();
      if(feoCtx.state === 'suspended') feoCtx.resume();
    }catch(e){}
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function(ev){
    document.addEventListener(ev, feoVohay, { capture: true, passive: true });
  });
  // Une note, avec attaque et extinction : un son de cloche plutôt qu'un bip.
  function feoNote(freq, debut, duree, fort){
    const ctx = feoCtx;
    if(!ctx) return;
    const t = ctx.currentTime + debut;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(fort, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + duree + 0.05);
  }
  // ---- Le son choisi par l'utilisateur ----
  // 🔔 Feo (page 📞 Call) : un fichier audio pour les hafatra, un pour les
  // antso. Gardé dans l'appareil (IndexedDB : trop lourd pour localStorage),
  // jamais envoyé. Sans fichier, les sons faits ici (feoNote) restent.
  const FEO_KARAZANA = { hafatra: '💬 Hafatra', antso: '📞 Antso' };
  const FEO_MAX = 5 * 1024 * 1024;
  const feoManokana = { hafatra: null, antso: null }; // { url, anarana }
  function feoDb(){
    return new Promise(function(ok, ko){
      if(!window.indexedDB) return ko(new Error('indexedDB'));
      const r = indexedDB.open('nyasako-feo', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('feo'); };
      r.onsuccess = function(){ ok(r.result); };
      r.onerror = function(){ ko(r.error); };
    });
  }
  function feoTahiry(k, v){
    return feoDb().then(function(db){
      return new Promise(function(ok, ko){
        const tx = db.transaction('feo', 'readwrite');
        if(v) tx.objectStore('feo').put(v, k); else tx.objectStore('feo').delete(k);
        tx.oncomplete = function(){ ok(); };
        tx.onerror = function(){ ko(tx.error); };
      });
    });
  }
  function feoVakio(k){
    return feoDb().then(function(db){
      return new Promise(function(ok){
        const r = db.transaction('feo').objectStore('feo').get(k);
        r.onsuccess = function(){ ok(r.result || null); };
        r.onerror = function(){ ok(null); };
      });
    });
  }
  function feoApetraka(k, v){
    if(feoManokana[k]) URL.revokeObjectURL(feoManokana[k].url);
    feoManokana[k] = v && v.blob ? { url: URL.createObjectURL(v.blob), anarana: v.anarana || 'feo' } : null;
  }
  Object.keys(FEO_KARAZANA).forEach(function(k){
    feoVakio(k).then(function(v){ feoApetraka(k, v); asehoyFeoSafidy(); }, function(){});
  });
  // Joue le fichier choisi. Le navigateur peut le refuser (pas encore de
  // toucher sur la page) : on retombe alors sur le son fait ici.
  let feoMandeha = null;
  function feoAlefa(k, miverina, raha_tsy_mety){
    const f = feoManokana[k];
    if(!f){ raha_tsy_mety(); return; }
    feoAtsahatra();
    const a = new Audio(f.url);
    a.loop = !!miverina;
    feoMandeha = a;
    const p = a.play();
    if(p && p.catch) p.catch(function(){ if(feoMandeha === a) feoMandeha = null; raha_tsy_mety(); });
    // Un hafatra ne sonne pas plus de huit secondes, même long.
    if(!miverina) setTimeout(function(){ if(feoMandeha === a){ a.pause(); feoMandeha = null; } }, 8000);
  }
  function feoAtsahatra(){
    if(feoMandeha){ try{ feoMandeha.pause(); }catch(e){} feoMandeha = null; }
  }
  function asehoyFeoSafidy(){
    const zone = document.getElementById('feoSafidy');
    if(!zone) return;
    zone.innerHTML = '';
    Object.keys(FEO_KARAZANA).forEach(function(k){
      const f = feoManokana[k];
      const ligne = document.createElement('div');
      ligne.style.cssText = 'display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; padding:0.55rem 0.7rem; border:1px solid var(--line); border-radius:10px;';
      const nom = document.createElement('div');
      nom.style.cssText = 'flex:1 1 140px; min-width:0;';
      nom.innerHTML = '<strong style="display:block; font-size:0.88rem;">' + FEO_KARAZANA[k] + '</strong>' +
        '<small style="color:var(--muted); display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></small>';
      nom.querySelector('small').textContent = f ? '🎵 ' + f.anarana : 'Feo ao anaty Ny asako';
      ligne.appendChild(nom);
      const bouton = function(texte, titre, fin){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.style.width = 'auto';
        b.textContent = texte;
        b.title = titre;
        b.addEventListener('click', fin);
        ligne.appendChild(b);
        return b;
      };
      bouton('📂 Hampiditra', 'Fidio ny feo ho an\'ny ' + FEO_KARAZANA[k], function(){
        const champ = document.createElement('input');
        champ.type = 'file';
        champ.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.wav,.opus,.webm';
        champ.style.cssText = 'position:fixed; left:-9999px;';
        document.body.appendChild(champ);
        champ.addEventListener('change', function(){
          const fichier = champ.files && champ.files[0];
          champ.remove();
          if(!fichier) return;
          if(fichier.size > FEO_MAX){ alert('Lehibe loatra ilay feo (5 Mo farafahabetsany).'); return; }
          const v = { blob: fichier, anarana: fichier.name };
          feoTahiry(k, v).then(function(){ feoApetraka(k, v); asehoyFeoSafidy(); feoAlefa(k, false, function(){}); },
            function(){ alert('Tsy voatahiry ilay feo amin\'ity fitaovana ity.'); });
        });
        champ.click();
      });
      bouton('▶️', 'Henoy', function(){
        feoVohay();
        if(k === 'antso'){
          if(ringtoneInterval || feoMandeha){ stopRingtone(); return; }
          playRingtone();
          setTimeout(stopRingtone, 6000);
        } else feoHafatra();
      });
      if(f) bouton('✕', 'Esory ity feo ity', function(){
        feoTahiry(k, null).then(function(){ feoApetraka(k, null); asehoyFeoSafidy(); }, function(){});
      });
      zone.appendChild(ligne);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', asehoyFeoSafidy);
  else asehoyFeoSafidy();

  // 💬 Un hafatra : le son choisi, sinon « ding-dong » montant, deux fois.
  function feoHafatra(){
    feoVohay();
    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if(feoManokana.hafatra){ feoAlefa('hafatra', false, feoHafatraVita); return; }
    feoHafatraVita();
  }
  function feoHafatraVita(){
    if(!feoCtx) return;
    [[784, 0], [1175, 0.16], [784, 0.6], [1175, 0.76]].forEach(function(n){ feoNote(n[0], n[1], 0.45, 0.45); });
  }

  // Feo fohy manaitra rehefa misy Live manomboka (tsy toy ny ringtone miverimberina).
  function playLiveChime(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach(function(freq, i){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.12;
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
      setTimeout(function(){ try{ ctx.close(); }catch(e){} }, 900);
    }catch(e){}
  }

  let presenceKey = null;
  function initPresence(){
    if(!window.__sb) return;
    const me = myIdentity();
    // Efa nipoitra ho mpitsidika, avy eo niditra : averina amin'ny anarana vaovao.
    if(presenceChannel && presenceKey !== me.email){
      try{ window.__sb.removeChannel(presenceChannel); }catch(e){}
      presenceChannel = null;
    }
    if(presenceChannel) return;
    presenceKey = me.email;
    askNotificationPermissionOnFirstClick();
    abonnerPush();
    presenceChannel = window.__sb.channel('presence-tanjona', { config: { presence: { key: me.email } } });
    presenceChannel.on('presence', { event: 'sync' }, function(){
      const state = presenceChannel.presenceState();
      presenceState = {};
      Object.keys(state).forEach(function(key){
        if(state[key] && state[key][0]) presenceState[key] = state[key][0];
      });
      renderOnlineClientsForCall();
      renderLiveList();
      updateLiveReachInfo();
      veillerSurLesLives();
      if(typeof updateOwnerPresenceLabel === 'function') updateOwnerPresenceLabel();
      // Ceux qui sont là : anneau violet sur leur story, vert sur leurs billets (parametres.js).
      if(typeof window.__storiesEnLigne === 'function') window.__storiesEnLigne();
      // Ny anarana nomen'ny mpitsidika dia miseho avy hatrany ao amin'ny resaka.
      if(resakaMisokatra) asehoyResaka();
    });
    presenceChannel.subscribe(function(status){
      if(status === 'SUBSCRIBED'){
        // L'identifiant du compte voyage avec : les stories portent celui de
        // leur auteur, et non son adresse, qu'on ne montre pas à tous.
        const auth = window.__sb.auth;
        (auth && auth.getSession ? auth.getSession() : Promise.resolve(null)).then(function(r){
          const uid = r && r.data && r.data.session && r.data.session.user ? r.data.session.user.id : null;
          presenceChannel.track({ name: me.name, isAdmin: me.isAdmin, live: false, uid: uid, fitaovana: fitaovanaFohy(), at: Date.now() });
        }, function(){
          presenceChannel.track({ name: me.name, isAdmin: me.isAdmin, live: false, fitaovana: fitaovanaFohy(), at: Date.now() });
        });
      }
    });
  }

  function updateMyPresence(patch){
    if(!presenceChannel) return;
    const me = myIdentity();
    const current = presenceState[me.email] || { name: me.name, isAdmin: me.isAdmin, live: false, fitaovana: fitaovanaFohy() };
    presenceChannel.track(Object.assign({}, current, patch, { at: Date.now() }));
  }

  // ---------------- PEJY « 📞 Call » : IREO NANAO INSCRIPTION ----------------
  // Ho an'ny kaonty rehetra (fonction mpisoratra_rehetra ; ny laharana dia
  // ho an'ny admin ihany).
  // Izay miditra ankehitriny no voalohany, misy 📞 sy 📹 ao anaty appli ;
  // ny hafa dia azo antsoina amin'ny laharany (tel:) raha nomeny.
  let mpisoratraCache = null, mpisoratraAt = 0, mpisoratraMaka = false, tsySession = false;
  // Ny soratra ao amin'ny case banga : « tsy misy » sa « tsy misy session ».
  function soratraBanga(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = tsySession
      ? 'Tsy azo alaina ny lisitra : tsy misy session Supabase ato amin\'ity fenêtre ity (niditra tamin\'ny code de secours ?). Mivoaha, dia midira indray amin\'ny teny miafina.'
      : 'Mbola tsy misy nanao inscription.';
  }
  function renderMpisoratraForCall(){
    // Ny pejy Call sy ny pejy Message dia samy manana ny lisitra.
    const panels = ['callMpisoratraPanel', 'msgMpisoratraPanel', 'callMitsidikaPanel', 'msgMitsidikaPanel']
      .map(function(id){ return document.getElementById(id); })
      .filter(Boolean);
    if(!panels.length) return;
    const me = myIdentity();
    // Hitan'ny kaonty rehetra miditra (tsy ny admin ihany intsony).
    const hita = !!(currentUser && window.__sb);
    panels.forEach(function(p){ p.style.display = hita ? '' : 'none'; });
    if(!hita) return;
    // Ny sarin'ity kaonty ity : mba hita ao amin'ny lisitry ny hafa koa.
    if(typeof window.__envoyerMaPhoto === 'function') window.__envoyerMaPhoto();
    renderMitsidika();
    if(!mpisoratraMaka && (!mpisoratraCache || Date.now() - mpisoratraAt > 60000)){
      mpisoratraMaka = true;
      makaFifandraisana();
      // mpisoratra_rehetra() : anarana sy email ho an'ny rehetra, ny
      // laharana ho an'ny admin ihany (supabase-mpisoratra-rehetra.sql).
      window.__sb.rpc('mpisoratra_rehetra')
        .then(function(res){
          mpisoratraMaka = false;
          // Lisitra banga na diso : matetika ny session Supabase mbola tsy
          // vonona. Tsy tazonina, fa averina alaina amin'ny manaraka.
          if(!res || res.error || !res.data || !res.data.length){
            if(!mpisoratraCache) mpisoratraCache = [];
            mpisoratraAt = Date.now() - 50000; // averina afaka 10 s
            // 401 : tsy misy session Supabase ato amin'ity fenêtre ity (ohatra :
            // niditra tamin'ny code de secours). Lazaina mazava fa tsy « banga ».
            tsySession = !!(res && res.error && (res.status === 401 || res.error.code === '42501'));
            renderMpisoratraListe();
            return;
          }
          tsySession = false;
          mpisoratraAt = Date.now();
          // Iray isaky ny email (na laharana raha tsy misy email) : ny
          // inscription farany no tazonina.
          const hita = {};
          mpisoratraCache = ((res && res.data) || []).filter(function(r){
            const e = String(r.email || '').trim().toLowerCase();
            // Tsy misy session : anarana ihany no tonga (tsy misy email na
            // laharana), ka ny anarana no famantarana.
            const cle = e || String(r.phone || '').replace(/[^\d]/g, '') ||
              (r.name ? 'anarana:' + String(r.name).trim().toLowerCase() : '');
            if(!cle || hita[cle] || e === me.email) return false;
            hita[cle] = true;
            return true;
          });
          renderMpisoratraListe();
        }, function(){ mpisoratraMaka = false; });
    }
    renderMpisoratraListe();
  }
  function renderMpisoratraListe(){
    if(!mpisoratraCache) return;
    const olona = (mpisoratraCache || []).map(function(r){
      const email = String(r.email || '').trim().toLowerCase();
      return { email: email, cle: email, name: r.name || email || r.phone, phone: String(r.phone || '').replace(/[^\d]/g, ''), online: !!presenceState[email] };
    });
    olona.sort(function(a, b){ return (b.online ? 1 : 0) - (a.online ? 1 : 0); });
    makaSary(olona.map(function(o){ return o.email; }));
    renderMpisoratraAntso(olona);
    renderMpisoratraHafatra(olona);
  }

  // « 👀 Miditra ankehitriny » : izay rehetra miditra ankehitriny (afa-tsy
  // ny admin), na mpitsidika tsy nanao inscription aza. Antso sy hafatra ao
  // anaty appli ihany, satria tsy fantatra ny laharany na ny email-ny.
  function renderMitsidika(){
    const me = myIdentity();
    const olona = Object.keys(presenceState).filter(function(k){ return k !== me.email; }).map(function(k){
      const p = presenceState[k] || {};
      const mpitsidika = k.indexOf('mpitsidika-') === 0;
      return { email: k, cle: k, name: (mpitsidika ? '👤 ' : '') + anaranaAseho(k, p),
        phone: '', online: true, mpitsidika: mpitsidika };
    });
    makaSary(olona.map(function(o){ return o.email; }));
    [['callMitsidika', ikonaAntso, 'Antso', function(o){
        hafatraVoafehy(o.email, o.name, function(){
          openChannelChooser('☎️ ' + o.name, 'Miditra ankehitriny.', [
            { label: '📞 Appel mivantana', color: '#25D366', run: function(){ startCall(o.email, o.name, 'audio'); } },
            { label: '📹 Antso video', color: '#1877F2', run: function(){ startCall(o.email, o.name, 'video'); } }
          ]);
        });
      }],
     ['msgMitsidika', ikonaHafatra, 'Hafatra', function(o){
        hafatraVoafehy(o.email, o.name, function(){ sokafyResaka(o.email, o.name); });
      }]
    ].forEach(function(c){
      const list = document.getElementById(c[0]);
      if(!list) return;
      document.getElementById(c[0] + 'Empty').style.display = olona.length ? 'none' : 'block';
      list.innerHTML = andalanaMpisoratra(olona.map(function(o){
        return Object.assign({}, o, { email: mombaOlona(o.email) });
      }), c[1], c[2]);
      list.querySelectorAll('[data-i]').forEach(function(btn){
        btn.addEventListener('click', function(){
          const o = olona[Number(btn.getAttribute('data-i'))];
          if(o) c[3](o);
        });
      });
    });
  }

  // Andalana iray isaky ny olona, miaraka amin'ny bokotra iray (data-i).
  // ikona : soratra, na fonction(o) (ohatra ⏳ raha miandry fanekena).
  function andalanaMpisoratra(olona, ikona, lohateny){
    return olona.map(function(o, i){
      // Hafatra tsy mbola voavaky : isa mena eo amin'ny bokotra, ary soratra.
      const vaovao = tsyVoavaky[o.cle || o.email] || 0;
      return '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.6rem 0; border-bottom:1px solid var(--line);">' +
        '<div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">' + avatarOlona(o) +
        '<div style="min-width:0;">' +
          '<strong style="font-size:0.85rem;">' + escapeHtml(o.name) + '</strong>' +
          (o.online ? ' <span style="font-size:0.68rem; color:#25D366;">En ligne</span>' : '') +
          (vaovao ? '<div style="font-size:0.72rem; color:#e5484d; font-weight:700;">💬 ' + vaovao + ' hafatra tsy mbola voavaky</div>' : '') +
          '<div style="font-size:0.72rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis;">' +
            escapeHtml(o.phone || o.email) + '</div></div></div>' +
        '<button type="button" class="btn btn-sm" title="' + lohateny + '" data-i="' + i + '" style="flex:none; position:relative;">' +
          (typeof ikona === 'function' ? ikona(o) : ikona) +
          (vaovao ? '<span class="hafatra-isa-bokotra">' + (vaovao > 9 ? '9+' : vaovao) + '</span>' : '') + '</button>' +
        '</div>';
    }).join('');
  }

  // ---------------- SARY TENA IZY (profil_sary) ----------------
  // Ny vignette nalefan'ny kaonty tsirairay (parametres.js), alaina amin'ny
  // sary_olona() (supabase-fifandraisana-resaka.sql). Tsy misy sary : ny
  // litera voalohany. Ny boribory dia maitso raha en ligne.
  const saryOlona = {};   // email → data:image (na '' raha tsy misy)
  let saryMaka = false;
  function makaSary(emails){
    if(!window.__sb || !currentUser || saryMaka) return;
    const vaovao = emails.filter(function(e){ return e && e.indexOf('@') > 0 && !(e in saryOlona); });
    if(!vaovao.length) return;
    vaovao.forEach(function(e){ saryOlona[e] = ''; });
    saryMaka = true;
    window.__sb.rpc('sary_olona', { emails: vaovao }).then(function(res){
      saryMaka = false;
      const sary = (res && res.data) || [];
      sary.forEach(function(r){ if(r && r.sary) saryOlona[r.email] = r.sary; });
      if(sary.length) asehoyIndrayLisitra();
    }, function(){ saryMaka = false; });
  }
  function avatarOlona(o){
    const sary = saryOlona[o.cle || o.email] || '';
    const loko = o.online ? '#25D366' : '#7c8b92';
    const litera = String(o.name || '?').replace(/^👤\s*/, '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function(m){ return m.charAt(0).toUpperCase(); }).join('') || '?';
    return '<span title="' + (o.online ? 'En ligne' : 'Hors ligne') + '" style="flex:none; width:40px; height:40px; border-radius:50%; ' +
      'border:2px solid ' + loko + '; overflow:hidden; display:flex; align-items:center; justify-content:center; ' +
      'background:var(--panel-2); color:var(--text); font-size:0.8rem; font-weight:700;' +
      (o.online ? ' box-shadow:0 0 0 2px rgba(37,211,102,0.25);' : '') + '">' +
      (/^data:image\/|^https:\/\//.test(sary)
        ? '<img src="' + escapeHtml(sary) + '" alt="" style="width:100%; height:100%; object-fit:cover;">'
        : escapeHtml(litera)) + '</span>';
  }
  function asehoyIndrayLisitra(){
    renderMitsidika();
    renderMpisoratraListe();
  }

  // ---------------- FANGATAHANA ALOHAN'NY HAFATRA ----------------
  // Tsy afaka mandefa hafatra amin'ny olona iray raha tsy nanaiky izy.
  // Voatahiry ao amin'ny fifandraisana_resaka ho an'ny kaonty ; ny
  // mpitsidika (tsy misy kaonty) kosa dia mandritra ny fidirany ihany.
  const fifandraisana = {};   // email hafa → { sata: 'miandry'|'nekena'|'nolavina', izaho: true raha izaho no nangataka }
  const fangatahanaNaseho = {};
  function makaFifandraisana(){
    if(!window.__sb || !currentUser) return;
    const me = myIdentity();
    window.__sb.from('fifandraisana_resaka').select('avy,ho,sata').then(function(res){
      if(!res || res.error) return;
      (res.data || []).forEach(function(r){
        const izaho = r.avy === me.email;
        const hafa = izaho ? r.ho : r.avy;
        // Raha samy nangataka izy roa, ny « nekena » no manan-kery.
        if(fifandraisana[hafa] && fifandraisana[hafa].sata === 'nekena') return;
        fifandraisana[hafa] = { sata: r.sata, izaho: izaho };
      });
      asehoyIndrayLisitra();
      // Fangatahana tonga teo am-pialana : aseho ny voalohany ; ny hafa
      // dia hita amin'ny 🔔 ao amin'ny lisitra.
      const tonga = Object.keys(fifandraisana).filter(function(e){
        return fifandraisana[e].sata === 'miandry' && !fifandraisana[e].izaho && !fangatahanaNaseho[e];
      });
      if(tonga.length) asehoyFangatahana(tonga[0], anaranaFantatra(tonga[0]));
    }, function(){});
  }
  function anaranaFantatra(email){
    if(presenceState[email]) return anaranaAseho(email);
    const r = (mpisoratraCache || []).filter(function(x){ return String(x.email || '').trim().toLowerCase() === email; })[0];
    return (r && r.name) || email;
  }
  // Sary 3D (emoji-3d.js) : 🤝 mbola tsy nifandray, ⏳ miandry ny valiny,
  // 🔔 misy mangataka, 💬 efa nekena.
  function ikonaHafatra(o){
    // Tsy misy email (laharana ihany, na anarana ihany) : tsy misy fangatahana.
    if(!(o.cle || o.email)) return '💬';
    const f = fifandraisana[o.cle || o.email];
    if(f && f.sata === 'nekena') return '💬';
    if(f && f.sata === 'miandry') return f.izaho ? '⏳' : '🔔';
    return '🤝';
  }
  // Pejy 📞 Call : fangatahana mitovy amin'ny Message (iray ihany ny fanekena
  // ho an'ny roa) ; rehefa nekena, ☎️.
  function ikonaAntso(o){
    const i = ikonaHafatra(o);
    return i === '💬' ? '☎️' : i;
  }
  // Varavarankely fanamarinana misy sary 3D lehibe, solon'ny confirm() :
  // ny confirm() an'ny navigateur dia tsy afaka mitondra sary.
  function fanamarinana(emoji, lohateny, soratra, bokotra){
    const ancien = document.getElementById('fanamarinanaResaka');
    if(ancien) ancien.remove();
    const fond = document.createElement('div');
    fond.id = 'fanamarinanaResaka';
    fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; ' +
      'justify-content:center; z-index:9600; padding:1rem;';
    const boite = document.createElement('div');
    boite.className = 'panel';
    boite.style.cssText = 'max-width:360px; width:100%; margin:0; text-align:center;';
    boite.innerHTML =
      '<div style="font-size:4rem; line-height:1; margin:0.3rem 0 0.6rem;">' + emoji + '</div>' +
      '<h3 style="margin-bottom:0.4rem;">' + escapeHtml(lohateny) + '</h3>' +
      // data-soratra : tsy afenin'ny fanazavana.js toy ny « explication ».
      '<p data-soratra style="font-size:0.8rem; color:var(--muted); margin-bottom:0.9rem;">' + escapeHtml(soratra) + '</p>' +
      '<div data-bokotra style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;"></div>';
    function hidio(){ fond.remove(); }
    const zone = boite.querySelector('[data-bokotra]');
    bokotra.concat([{ label: bokotra.length ? 'Hanafoana' : 'OK', primary: !bokotra.length }]).forEach(function(b){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm' + (b.primary ? ' btn-primary' : '');
      btn.style.cssText = 'width:auto; flex:1; min-width:110px;';
      if(b.color && !b.primary){ btn.style.borderColor = b.color; btn.style.color = b.color; }
      btn.textContent = b.label;
      btn.addEventListener('click', function(){ hidio(); if(b.run) b.run(); });
      zone.appendChild(btn);
    });
    fond.addEventListener('click', function(e){ if(e.target === fond) hidio(); });
    fond.appendChild(boite);
    document.body.appendChild(fond);
  }
  // Ny bokotra ao amin'ny lisitra : misokatra ny resaka raha efa nekena,
  // raha tsy izany dia mangataka aloha.
  function hafatraVoafehy(email, anarana, mandeha){
    const f = fifandraisana[email];
    if(f && f.sata === 'nekena'){ mandeha(); return; }
    if(f && f.sata === 'miandry' && !f.izaho){ asehoyFangatahana(email, anarana); return; }
    if(f && f.sata === 'miandry'){
      fanamarinana('⏳', anarana, 'Mbola miandry ny fanekeny ianao. Averina alefa ve ny fangatahana ?',
        [{ label: '🔁 Averina alefa', primary: true, run: function(){ mangatakaResaka(email, anarana); } }]);
      return;
    }
    fanamarinana('🤝', anarana, 'Handefa fangatahana hiresaka aminy ve ianao ? Rehefa manaiky izy vao afaka mandefa hafatra sy miantso ianao.',
      [{ label: '✅ Alefa', primary: true, run: function(){ mangatakaResaka(email, anarana); } }]);
  }
  function mangatakaResaka(email, anarana){
    const me = myIdentity();
    fifandraisana[email] = { sata: 'miandry', izaho: true };
    if(window.__sb && currentUser && email.indexOf('@') > 0){
      window.__sb.from('fifandraisana_resaka')
        .upsert({ avy: me.email, ho: email, sata: 'miandry', updated_at: new Date().toISOString() }, { onConflict: 'avy,ho' })
        .then(function(){}, function(){});
    }
    initCallSignaling();
    sendCallSignal({ kind: 'fangatahana', from: me.email, fromName: me.name, to: email });
    alefaPush(email, 'hafatra', { text: me.name + ' te hiresaka aminao : mila ny fanekenao.' });
    asehoyIndrayLisitra();
    fanamarinana('⏳', 'Lasa ny fangatahana', 'Rehefa manaiky i ' + anarana + ' vao afaka mandefa hafatra sy miantso ianao.', []);
  }
  function asehoyFangatahana(email, anarana){
    fangatahanaNaseho[email] = true;
    fanamarinana('🤝', anarana, anarana + ' te hiresaka aminao. Ekenao ve ?', [
      { label: '✅ Ekena', primary: true, run: function(){ valioFangatahana(email, anarana, true); } },
      { label: '❌ Lavina', color: '#e5484d', run: function(){ valioFangatahana(email, anarana, false); } }
    ]);
  }
  function valioFangatahana(email, anarana, ekena){
    const me = myIdentity();
    fifandraisana[email] = { sata: ekena ? 'nekena' : 'nolavina', izaho: false };
    if(window.__sb && currentUser){
      window.__sb.from('fifandraisana_resaka')
        .update({ sata: ekena ? 'nekena' : 'nolavina', updated_at: new Date().toISOString() })
        .eq('avy', email).eq('ho', me.email)
        .then(function(){}, function(){});
    }
    initCallSignaling();
    sendCallSignal({ kind: 'valiny-fangatahana', from: me.email, fromName: me.name, to: email, ekena: ekena });
    if(ekena){
      alefaPush(email, 'hafatra', { text: me.name + ' nanaiky : afaka mandefa hafatra aminy ianao.' });
      sokafyResaka(email, anarana);
    }
    asehoyIndrayLisitra();
  }
  function onFangatahana(payload){
    const avy = payload.from;
    if(!avy) return;
    const anarana = presenceState[avy] ? anaranaAseho(avy) : (payload.fromName || avy);
    // Efa nekena teo aloha : valiana avy hatrany.
    if(fifandraisana[avy] && fifandraisana[avy].sata === 'nekena'){
      const me = myIdentity();
      sendCallSignal({ kind: 'valiny-fangatahana', from: me.email, fromName: me.name, to: avy, ekena: true });
      return;
    }
    fifandraisana[avy] = { sata: 'miandry', izaho: false };
    feoHafatra();
    if(currentUser && typeof pushNotification === 'function') pushNotification('hafatra', '💬 ' + anarana + ' te hiresaka aminao.');
    showSystemNotification('💬 ' + anarana, 'Te hiresaka aminao : ekena ve ?', 'fangatahana-' + avy);
    asehoyIndrayLisitra();
    asehoyFangatahana(avy, anarana);
  }
  function onValinyFangatahana(payload){
    const avy = payload.from;
    if(!avy) return;
    const anarana = presenceState[avy] ? anaranaAseho(avy) : (payload.fromName || avy);
    fifandraisana[avy] = { sata: payload.ekena ? 'nekena' : 'nolavina', izaho: true };
    asehoyIndrayLisitra();
    if(payload.ekena){
      feoHafatra();
      showSystemNotification('💬 ' + anarana, 'Nanaiky : afaka mandefa hafatra ianao.', 'fangatahana-' + avy);
      sokafyResaka(avy, anarana);
    } else {
      fanamarinana('❌', anarana, 'Tsy nanaiky ny fangatahanao hiresaka izy.', []);
    }
  }

  // Hafatra iray soratana indray mandeha, alefa amin'ny canal rehetra :
  // ao anaty appli, WhatsApp, SMS, Email. Ny ao anaty appli no lasa avy
  // hatrany ; ny hafa dia misokatra feno ny hafatra, ka ilay app no
  // manindry « Envoyer » (tsy azon'ny pejy web atao ho azy izany). Ny
  // navigateur dia tsy mamela afa-tsy fanokafana iray isaky ny tsindry
  // indraindray : ny canal tsy nisokatra dia mbola azo tsindriana tsirairay.
  function alefaDaholo(o){
    const canal = [];
    // Ao anaty appli : tonga raha miditra ilay olona.
    if(o.email){
      canal.push({ cle: 'appli', nom: '💬 Hafatra mivantana (ao anaty appli)', couleur: 'var(--cyan)',
        alefa: function(t){
          const me = myIdentity();
          const id = idHafatra();
          sendCallSignal({ kind: 'hafatra', from: me.email, fromName: me.name, to: o.email, text: t, id: id });
          alefaPush(o.email, 'hafatra', { text: t });
          (resaka[o.email] = resaka[o.email] || []).push({ id: id, avy: 'izaho', soratra: t, at: Date.now() });
          return true;
        } });
    }
    if(o.phone){
      const intl = (typeof toInternationalNumber === 'function') ? toInternationalNumber(o.phone) : o.phone;
      const tel = o.phone.charAt(0) === '0' ? o.phone : '+' + o.phone;
      canal.push({ cle: 'wa', nom: '💬 WhatsApp — ' + o.phone, couleur: '#25D366',
        alefa: function(t){ return !!window.open('https://wa.me/' + intl + '?text=' + encodeURIComponent(t), '_blank'); } });
      canal.push({ cle: 'sms', nom: '✉️ SMS — ' + o.phone, couleur: '#25D366',
        alefa: function(t){ window.location.href = 'sms:' + tel + '?body=' + encodeURIComponent(t); return true; } });
    }
    if(o.email && o.email.indexOf('@') > 0){
      canal.push({ cle: 'mail', nom: '📧 Email — ' + o.email, couleur: 'var(--cyan)',
        alefa: function(t){ return !!window.open('mailto:' + o.email + '?body=' + encodeURIComponent(t), '_blank'); } });
    }
    if(!canal.length){ alert(o.name + ' : tsy nanome laharana na email.'); return; }

    const ancien = document.getElementById('alefaDaholo');
    if(ancien) ancien.remove();
    const fond = document.createElement('div');
    fond.id = 'alefaDaholo';
    fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; ' +
      'justify-content:center; z-index:210; padding:1rem;';
    const boite = document.createElement('div');
    boite.className = 'panel';
    boite.style.cssText = 'max-width:400px; width:100%; margin:0;';
    boite.innerHTML =
      '<h3>💬 ' + escapeHtml(o.name) + '</h3>' +
      '<textarea data-soratra rows="3" placeholder="Soraty ny hafatra..." style="width:100%; box-sizing:border-box; padding:0.5rem 0.7rem; ' +
        'border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--text); font-size:0.85rem; margin-bottom:0.6rem;"></textarea>' +
      '<div data-canal></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-daholo style="width:100%; margin-top:0.2rem;">📨 Alefa daholo (' + canal.length + ')</button>' +
      '<button type="button" class="btn btn-sm" data-hidio style="width:auto; margin-top:0.6rem;">Fermer</button>';
    const zone = boite.querySelector('[data-canal]');
    const input = boite.querySelector('[data-soratra]');
    canal.forEach(function(c){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm';
      b.style.cssText = 'width:100%; margin-bottom:0.5rem;';
      b.style.borderColor = c.couleur;
      b.style.color = c.couleur;
      b.textContent = c.nom;
      c.bokotra = b;
      b.addEventListener('click', function(){
        const t = input.value.trim();
        if(!t){ input.focus(); return; }
        if(c.alefa(t)) b.textContent = '✓ ' + c.nom;
      });
      zone.appendChild(b);
    });
    boite.querySelector('[data-daholo]').addEventListener('click', function(){
      const t = input.value.trim();
      if(!t){ input.focus(); return; }
      // Ny SMS farany : manova ny pejy izy, ka ny hafa aloha.
      canal.slice().sort(function(a, b){ return (a.cle === 'sms') - (b.cle === 'sms'); }).forEach(function(c){
        if(c.alefa(t)) c.bokotra.textContent = '✓ ' + c.nom;
      });
    });
    function hidio(){ fond.remove(); }
    boite.querySelector('[data-hidio]').addEventListener('click', hidio);
    fond.addEventListener('click', function(e){ if(e.target === fond) hidio(); });
    fond.appendChild(boite);
    document.body.appendChild(fond);
    input.focus();
  }

  // Pejy « 💬 Message » : 💬 isaky ny olona, ao anatiny ny WhatsApp sy ny
  // SMS (raha misy laharana) ary ny Email (raha misy).
  function renderMpisoratraHafatra(olona){
    const list = document.getElementById('msgMpisoratra');
    if(!list) return;
    soratraBanga('msgMpisoratraEmpty');
    document.getElementById('msgMpisoratraEmpty').style.display = olona.length ? 'none' : 'block';
    list.innerHTML = andalanaMpisoratra(olona, ikonaHafatra, 'Hafatra');
    list.querySelectorAll('[data-i]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const o = olona[Number(btn.getAttribute('data-i'))];
        if(!o) return;
        // Tsy misy email : tsy azo angatahana ao anaty appli (laharana ihany).
        if(!o.email){ alefaDaholo(o); return; }
        hafatraVoafehy(o.email, o.name, function(){ alefaDaholo(o); });
      });
    });
  }

  function renderMpisoratraAntso(olona){
    const list = document.getElementById('callMpisoratra');
    if(!list) return;
    soratraBanga('callMpisoratraEmpty');
    document.getElementById('callMpisoratraEmpty').style.display = olona.length ? 'none' : 'block';
    list.innerHTML = andalanaMpisoratra(olona, ikonaAntso, 'Antso');
    // Bokotra iray isaky ny olona : ao anatiny ny Appel mivantana, ny Antso
    // video (raha miditra izy) ary ny Antso an-tariby (raha misy laharana).
    // Toy ny 💬 Message : fangatahana aloha, rehefa nekena vao miantso.
    list.querySelectorAll('[data-i]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const o = olona[Number(btn.getAttribute('data-i'))];
        if(!o) return;
        if(o.email) hafatraVoafehy(o.email, o.name, function(){ antsoyIzy(o); });
        else antsoyIzy(o);
      });
    });
    function antsoyIzy(o){
      const safidy = [];
      if(o.online && o.email){
        safidy.push({ label: '📞 Appel mivantana', color: '#25D366', run: function(){ startCall(o.email, o.name, 'audio'); } });
        safidy.push({ label: '📹 Antso video', color: '#1877F2', run: function(){ startCall(o.email, o.name, 'video'); } });
      }
      if(o.phone){
        const tel = 'tel:' + (o.phone.charAt(0) === '0' ? o.phone : '+' + o.phone);
        safidy.push({ label: '☎️ Antso an-tariby — ' + o.phone, color: '#25D366', run: function(){ window.location.href = tel; } });
      }
      if(!safidy.length){ alert(o.name + ' : tsy miditra ankehitriny ary tsy nanome laharana.'); return; }
      openChannelChooser('☎️ ' + o.name, o.online ? 'Miditra ankehitriny.' : 'Tsy miditra ankehitriny : antso an-tariby ihany.', safidy);
    }
  }

  function renderOnlineClientsForCall(){
    renderMpisoratraForCall();
    const list = document.getElementById('onlineUsersList');
    const emptyHint = document.getElementById('onlineUsersEmpty');
    if(!list) return;
    const me = myIdentity();
    list.innerHTML = '';
    const others = Object.keys(presenceState).filter(function(email){ return email !== me.email; });
    emptyHint.style.display = others.length ? 'none' : 'block';
    others.forEach(function(email){
      const p = presenceState[email];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0; border-bottom:1px solid var(--line);';
      row.innerHTML =
        '<div><strong style="font-size:0.85rem;">' + escapeHtml(p.name || email) + '</strong>' +
        (p.isAdmin ? ' <span style="font-size:0.68rem; color:var(--cyan);">(Admin)</span>' : '') +
        (p.live ? ' <span style="font-size:0.68rem; color:var(--red);">🔴 Live</span>' : '') + '</div>' +
        '<div style="display:flex; gap:0.4rem;">' +
          '<button type="button" class="btn btn-sm call-audio-btn" title="Antso feo" data-email="' + escapeHtml(email) + '" data-name="' + escapeHtml(p.name || email) + '">📞</button>' +
          '<button type="button" class="btn btn-sm call-video-btn" title="Antso video" data-email="' + escapeHtml(email) + '" data-name="' + escapeHtml(p.name || email) + '">📹</button>' +
        '</div>';
      list.appendChild(row);
    });
    list.querySelectorAll('.call-audio-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ startCall(btn.getAttribute('data-email'), btn.getAttribute('data-name'), 'audio'); });
    });
    list.querySelectorAll('.call-video-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ startCall(btn.getAttribute('data-email'), btn.getAttribute('data-name'), 'video'); });
    });
  }

  // ---------------- SONNERIE ----------------
  // Une vraie sonnerie de téléphone : deux trilles rapides, puis un silence,
  // sur le contexte ouvert au premier toucher (feoVohay), et qui vibre.
  let ringtoneInterval = null;
  function playRingtone(){
    stopRingtone();
    feoVohay();
    // Le son choisi dans 🔔 Feo, en boucle ; la vibration bat à côté.
    if(feoManokana.antso){
      feoAlefa('antso', true, sonnerieFaite);
      if(navigator.vibrate) navigator.vibrate([400, 200, 400]);
      ringtoneInterval = setInterval(function(){ if(navigator.vibrate) navigator.vibrate([400, 200, 400]); }, 2200);
      return;
    }
    sonnerieFaite();
  }
  function sonnerieFaite(){
    if(ringtoneInterval){ clearInterval(ringtoneInterval); ringtoneInterval = null; }
    function sonne(){
      if(navigator.vibrate) navigator.vibrate([400, 200, 400]);
      if(!feoCtx) return;
      for(let i = 0; i < 10; i++){
        feoNote(i % 2 ? 1046 : 1318, i * 0.05, 0.06, 0.4);
        feoNote(i % 2 ? 1046 : 1318, 0.45 + i * 0.05, 0.06, 0.4);
      }
    }
    sonne();
    ringtoneInterval = setInterval(sonne, 2200);
  }
  function stopRingtone(){
    if(ringtoneInterval){ clearInterval(ringtoneInterval); ringtoneInterval = null; }
    feoAtsahatra();
    if(navigator.vibrate) navigator.vibrate(0);
  }

  // ---------------- APPELS 1-À-1 (WebRTC + signal via Supabase Realtime) ----------------
  let callSignalChannel = null;
  let activeCall = null;

  function initCallSignaling(){
    if(!window.__sb || callSignalChannel) return;
    callSignalChannel = window.__sb.channel('call-signal-tanjona');
    callSignalChannel.on('broadcast', { event: 'signal' }, function(msg){ handleCallSignal(msg.payload || {}); });
    callSignalChannel.subscribe();
  }
  function sendCallSignal(payload){ if(callSignalChannel) callSignalChannel.send({ type: 'broadcast', event: 'signal', payload: payload }); }

  // Ny kamera dia alaina FOANA (na dia antso feo aza), fa atsahatra
  // (enabled = false) raha antso feo. Izay no ahafahan'ny bokotra « 📷 Kamera »
  // mampandeha azy eo no eo mandritra ny antso : ny piste video dia efa napetraka
  // tao amin'ny fifandraisana hatramin'ny voalohany, ka tsy mila fifampiraharahana
  // (renegotiation) vaovao. Teo aloha dia tsy nisy piste video mihitsy tamin'ny
  // antso feo, ka tsy nanao na inona na inona ilay bokotra.
  function getCallMedia(wantVideo){
    return navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(function(stream){
        if(!wantVideo) stream.getVideoTracks().forEach(function(t){ t.enabled = false; });
        return stream;
      })
      .catch(function(){
        // Tsy misy kamera na nolavina ny kamera : antso feo ihany.
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      });
  }

  function startCall(targetEmail, targetName, callType){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(activeCall){ alert('Efa misy antso mandeha.'); return; }
    const me = myIdentity();
    getCallMedia(callType === 'video').then(function(stream){
      const roomId = 'call-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      activeCall = { roomId: roomId, peer: pc, localStream: stream, withEmail: targetEmail, withName: targetName, callType: callType, direction: 'outgoing', status: 'ringing' };
      stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
      pc.ontrack = function(e){ attachRemoteStream(e.streams[0]); };
      pc.onicecandidate = function(e){
        if(e.candidate) sendCallSignal({ kind: 'ice', roomId: roomId, from: me.email, to: targetEmail, candidate: e.candidate });
      };
      showOutgoingCallUI();
      pc.createOffer().then(function(offer){ return pc.setLocalDescription(offer); }).then(function(){
        sendCallSignal({ kind: 'ring', roomId: roomId, from: me.email, fromName: me.name, to: targetEmail, callType: callType, sdp: pc.localDescription });
        alefaPush(targetEmail, 'antso', { callType: callType });
      });
      activeCall.timeoutId = setTimeout(function(){
        if(activeCall && activeCall.roomId === roomId && activeCall.status === 'ringing'){
          sendCallSignal({ kind: 'end', roomId: roomId, from: me.email, to: targetEmail, reason: 'timeout' });
          endCall();
        }
      }, 45000);
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  function handleCallSignal(payload){
    if(!payload || !payload.kind) return;
    const me = myIdentity();
    if(payload.to !== me.email) return;
    if(payload.kind === 'ring') onIncomingRing(payload);
    else if(payload.kind === 'answer') onCallAnswered(payload);
    else if(payload.kind === 'ice') onRemoteIce(payload);
    else if(payload.kind === 'reject') onCallRejected(payload);
    else if(payload.kind === 'end') onCallEnded(payload);
    // paroles reconnues chez l'autre : traduites puis affichées ici
    else if(payload.kind === 'speech'){ if(typeof onRemoteSpeech === 'function') onRemoteSpeech(payload); }
    else if(payload.kind === 'hafatra') onHafatraTonga(payload);
    else if(payload.kind === 'hafatra-fafana') onHafatraFafana(payload);
    else if(payload.kind === 'fangatahana') onFangatahana(payload);
    else if(payload.kind === 'valiny-fangatahana') onValinyFangatahana(payload);
  }

  // ---------------- HAFATRA MIVANTANA (ao anaty appli) ----------------
  // Mandeha amin'ny lalana mitovy amin'ny antso (broadcast) : tsy voatahiry
  // ao amin'ny serveur, ka ireo miditra ihany no mahazo azy. Ampy hiresahana
  // amin'ny mpitsidika tsy nanome laharana na email.
  // Ny sary sy ny video dia lehibe loatra ho an'ny broadcast : apetraka ao
  // amin'ny bucket « resaka-media » (supabase-resaka-media.sql), ary ny
  // rohiny no alefa.
  const resaka = {};   // email → [{ avy: 'izaho'|'izy', soratra, media, at }]
  let resakaMisokatra = null;
  const RESAKA_BUCKET = 'resaka-media';
  const RESAKA_MEDIA_MAX = 25 * 1024 * 1024;
  // Ny emoji rehetra : singa web « emoji-picker-element », alaina rehefa
  // vao ilaina fotsiny.
  const EMOJI_PICKER_URL = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.21.3/index.js';
  let emojiPickerMaka = null;

  function onHafatraTonga(payload){
    const avy = payload.from;
    if(!avy || (!payload.text && !payload.media)) return;
    if(presenceState[avy]) payload.fromName = anaranaAseho(avy);
    (resaka[avy] = resaka[avy] || []).push({ id: payload.id || idHafatra(), avy: 'izy', soratra: String(payload.text || ''), media: payload.media || null, at: Date.now() });
    const fohy = payload.text ? String(payload.text).slice(0, 120)
      : (payload.media && payload.media.type === 'video' ? '🎬 Video' : '📷 Sary');
    feoHafatra();
    if(currentUser && typeof pushNotification === 'function') pushNotification('hafatra', '💬 Hafatra avy amin\'i ' + (payload.fromName || avy) + '.');
    showSystemNotification('💬 ' + (payload.fromName || avy), fohy, 'hafatra-' + avy);
    // Resaka hafa no misokatra : tsy halaina ny toerany ; ny isa no milaza.
    if(!resakaMisokatra || resakaMisokatra.email === avy || !resakaHitaIzao(resakaMisokatra.email)){
      sokafyResaka(avy, payload.fromName || avy);
    }
    if(!resakaHitaIzao(avy)){
      tsyVoavaky[avy] = (tsyVoavaky[avy] || 0) + 1;
      asehoyIsaHafatra();
      asehoyIndrayLisitra();
    }
  }

  // ---------------- HAFATRA TSY MBOLA VOAVAKY ----------------
  // Isaky ny olona : ny hafatra tonga raha tsy hita teo imason'ny olona ilay
  // resaka (resaka hafa misokatra, fenêtre tsy eo aloha). Ny isan'izy rehetra
  // dia eo amin'ny « 💬 Message » (menu sy rangée) ; ny an'ny tsirairay eo
  // amin'ny bokotra ao amin'ny lisitra. Voavaky rehefa hita ilay resaka.
  const tsyVoavaky = {};   // email → isa
  function resakaHitaIzao(email){
    const boaty = document.getElementById('resakaMivantana');
    return !!(resakaMisokatra && resakaMisokatra.email === email && boaty &&
      boaty.style.display !== 'none' && !document.hidden);
  }
  function asehoyIsaHafatra(){
    const total = Object.keys(tsyVoavaky).reduce(function(s, k){ return s + tsyVoavaky[k]; }, 0);
    // Attribut lu par le CSS (::after), et non un <span> : la rangée recopie
    // le texte de l'entrée du menu pour en faire son icône.
    document.querySelectorAll('#navList .nav-item[data-section="serviceclient"], [data-epingle="section:serviceclient"]')
      .forEach(function(el){
        if(total) el.setAttribute('data-isa-hafatra', total > 9 ? '9+' : String(total));
        else el.removeAttribute('data-isa-hafatra');
      });
  }
  // L'icône de la rangée peut être recréée (épinglée plus tard) : on repose.
  setInterval(asehoyIsaHafatra, 2000);
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden && resakaMisokatra) asehoyResaka();
  });

  function alefaHafatra(soratra, media){
    if(!resakaMisokatra) return;
    const me = myIdentity();
    const id = idHafatra();
    sendCallSignal({ kind: 'hafatra', from: me.email, fromName: me.name, to: resakaMisokatra.email, text: soratra || '', media: media || null, id: id });
    alefaPush(resakaMisokatra.email, 'hafatra', { text: soratra || (media ? (media.type === 'video' ? '🎬 Video' : '📷 Sary') : '') });
    (resaka[resakaMisokatra.email] = resaka[resakaMisokatra.email] || []).push({ id: id, avy: 'izaho', soratra: soratra || '', media: media || null, at: Date.now() });
    asehoyResaka();
  }

  // ---------------- FAMAFANA HAFATRA ----------------
  // Ny hafatra iray (✕) na ny resaka manontolo (🗑️) : voafafa eto sy any
  // amin'ilay olona koa (raha miditra izy), satria tsy voatahiry any amin'ny
  // serveur ireo hafatra ireo. Ny hafatra voafafa dia tsy manjavona fotsiny :
  // « 🗑️ Voafafa ity hafatra ity » no mijanona amin'ny toerany, mba ho
  // fantatry ny roa tonta. Ny ✕ amin'io soratra io kosa dia manala azy eto
  // ihany.
  function idHafatra(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function mariho(lisitra, ids){
    lisitra.forEach(function(h){
      if(ids.indexOf(h.id) < 0) return;
      h.voafafa = true; h.soratra = ''; h.media = null;
    });
  }
  function fafaoHafatra(email, ids){
    const me = myIdentity();
    const daholo = !ids;
    if(daholo) resaka[email] = [];
    else mariho(resaka[email] || [], ids);
    sendCallSignal({ kind: 'hafatra-fafana', from: me.email, to: email, ids: ids || null, daholo: daholo });
    asehoyResaka();
  }
  function onHafatraFafana(payload){
    const avy = payload.from;
    if(!avy || !resaka[avy]) return;
    if(payload.daholo) resaka[avy] = [{ id: idHafatra(), avy: 'izy', voafafa: 'daholo', at: Date.now() }];
    else if(Array.isArray(payload.ids)) mariho(resaka[avy], payload.ids);
    if(resakaMisokatra && resakaMisokatra.email === avy) asehoyResaka();
  }

  function alefaRakitra(fichier){
    if(!fichier || !resakaMisokatra) return;
    const video = /^video\//.test(fichier.type);
    if(!video && !/^image\//.test(fichier.type)){ alert('Sary na video ihany no azo alefa.'); return; }
    if(fichier.size > RESAKA_MEDIA_MAX){ alert('Lehibe loatra ny rakitra (25 Mo farafahabetsany).'); return; }
    if(!window.__sb || !window.__sb.storage){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    const me = myIdentity();
    const ext = (fichier.name.split('.').pop() || (video ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const nom = String(me.email).replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '/' + Date.now() + '-' +
      Math.random().toString(36).slice(2, 8) + '.' + ext;
    const boaty = document.getElementById('resakaMivantana');
    const toerana = boaty && boaty.querySelector('[data-mandefa]');
    if(toerana){ toerana.style.display = 'block'; toerana.textContent = (video ? '🎬' : '📷') + ' Mandefa...'; }
    window.__sb.storage.from(RESAKA_BUCKET).upload(nom, fichier, { contentType: fichier.type, upsert: false })
      .then(function(res){
        if(res && res.error) throw res.error;
        const url = window.__sb.storage.from(RESAKA_BUCKET).getPublicUrl(nom).data.publicUrl;
        if(toerana) toerana.style.display = 'none';
        alefaHafatra('', { url: url, type: video ? 'video' : 'sary' });
      })
      .catch(function(err){
        if(toerana) toerana.style.display = 'none';
        alert('Tsy lasa ny rakitra : ' + ((err && err.message) || 'erreur'));
      });
  }

  function sokafyEmoji(boaty, input){
    const toerana = boaty.querySelector('[data-emoji]');
    if(toerana.style.display === 'block'){ toerana.style.display = 'none'; return; }
    toerana.style.display = 'block';
    if(toerana.querySelector('emoji-picker')) return;
    toerana.textContent = 'Maka ny emoji...';
    emojiPickerMaka = emojiPickerMaka || import(EMOJI_PICKER_URL);
    emojiPickerMaka.then(function(){
      toerana.textContent = '';
      const picker = document.createElement('emoji-picker');
      picker.classList.add(document.documentElement.classList.contains('light') ? 'light' : 'dark');
      picker.style.cssText = 'width:100%; height:220px;';
      picker.addEventListener('emoji-click', function(e){
        const emoji = e.detail && e.detail.unicode;
        if(!emoji) return;
        const debut = input.selectionStart == null ? input.value.length : input.selectionStart;
        const fin = input.selectionEnd == null ? input.value.length : input.selectionEnd;
        input.value = input.value.slice(0, debut) + emoji + input.value.slice(fin);
        const pos = debut + emoji.length;
        input.focus();
        try{ input.setSelectionRange(pos, pos); }catch(err){}
      });
      toerana.appendChild(picker);
    }, function(){
      emojiPickerMaka = null;
      toerana.textContent = 'Tsy tonga ny emoji (tsy misy réseau ?).';
    });
  }

  function sokafyResaka(email, anarana){
    initCallSignaling();
    resakaMisokatra = { email: email, anarana: anarana || email };
    let boaty = document.getElementById('resakaMivantana');
    if(!boaty){
      boaty = document.createElement('div');
      boaty.id = 'resakaMivantana';
      boaty.className = 'panel';
      // « resize » : sintonina ny zorony ambany havanana mba hanitarana azy ;
      // ⤢ kosa manitatra azy indray mitsindry.
      boaty.style.cssText = 'position:fixed; right:12px; bottom:12px; width:min(360px, calc(100vw - 24px)); ' +
        'height:min(460px, calc(100vh - 24px)); min-width:260px; min-height:260px; max-width:calc(100vw - 24px); ' +
        'max-height:calc(100vh - 24px); resize:both; overflow:hidden; z-index:9500; margin:0; display:flex; ' +
        'flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.4);';
      boaty.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-bottom:0.5rem; flex:none;">' +
          '<div style="min-width:0;">' +
            '<strong data-lohateny style="display:block; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></strong>' +
            '<div data-momba style="font-size:0.7rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>' +
          '</div>' +
          '<span style="display:flex; gap:0.3rem; flex:none;">' +
            '<button type="button" class="btn btn-sm" data-fafana-daholo title="Fafana daholo ny hafatra" style="width:auto;">🗑️</button>' +
            '<button type="button" class="btn btn-sm" data-ngeza title="Angezaina / Ahelezina" style="width:auto;">⤢</button>' +
            '<button type="button" class="btn btn-sm" data-hidio title="Hidio" style="width:auto;">✕</button>' +
          '</span>' +
        '</div>' +
        // Mpitsidika tsy niditra : manome ny anarany mba ho fantatry ny admin.
        '<div data-anarana style="display:none; gap:0.35rem; align-items:center; margin-bottom:0.5rem; flex:none;">' +
          '<input type="text" data-anarana-input maxlength="40" placeholder="Iza no anaranao ?" style="flex:1; min-width:0; ' +
            'padding:0.4rem 0.6rem; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--text); font-size:0.8rem;">' +
          '<button type="button" class="btn btn-sm" data-anarana-ok style="width:auto; flex:none;">OK</button>' +
          // Na ny kaonty Google : ny anarana sy ny email avy amin'i Google.
          '<button type="button" class="btn btn-sm" data-google title="Hiditra amin\'ny Google" style="width:auto; flex:none; ' +
            'background:#fff; color:#1f1f1f; border-color:#dadce0; font-weight:700;">G</button>' +
        '</div>' +
        '<div data-hafatra style="flex:1; overflow-y:auto; font-size:0.82rem; min-height:40px; margin-bottom:0.5rem;"></div>' +
        '<div data-mandefa style="display:none; font-size:0.74rem; color:var(--muted); margin-bottom:0.4rem; flex:none;"></div>' +
        '<div data-emoji style="display:none; margin-bottom:0.5rem; flex:none;"></div>' +
        '<div style="display:flex; gap:0.35rem; align-items:center; flex:none;">' +
          '<button type="button" class="btn btn-sm" data-emoji-bokotra title="Emoji" style="width:auto; flex:none;">😊</button>' +
          '<button type="button" class="btn btn-sm" data-rakitra title="Sary na video" style="width:auto; flex:none;">📎</button>' +
          '<input type="file" data-rakitra-input accept="image/*,video/*" style="display:none;">' +
          '<input type="text" data-soratra placeholder="Soraty ny hafatra..." style="flex:1; min-width:0; padding:0.5rem 0.7rem; ' +
            'border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--text); font-size:0.82rem;">' +
          '<button type="button" class="btn btn-sm btn-primary" data-alefa style="width:auto; flex:none;">Alefa</button>' +
        '</div>';
      document.body.appendChild(boaty);
      boaty.querySelector('[data-hidio]').addEventListener('click', function(){ boaty.style.display = 'none'; resakaMisokatra = null; });
      boaty.querySelector('[data-fafana-daholo]').addEventListener('click', function(){
        if(!resakaMisokatra || !(resaka[resakaMisokatra.email] || []).length) return;
        const email = resakaMisokatra.email;
        fanamarinana('🗑️', 'Fafana daholo ?', 'Voafafa eto sy any amin\'ilay olona koa ny hafatra rehetra amin\'ity resaka ity.',
          [{ label: '🗑️ Fafana daholo', color: '#e5484d', run: function(){ fafaoHafatra(email, null); } }]);
      });
      // ✕ amin'ny hafatra iray.
      boaty.querySelector('[data-hafatra]').addEventListener('click', function(e){
        const b = e.target.closest('[data-fafao]');
        if(!b || !resakaMisokatra) return;
        const email = resakaMisokatra.email, id = b.getAttribute('data-fafao');
        const h = (resaka[email] || []).filter(function(x){ return x.id === id; })[0];
        // Efa voafafa : ny soratra « Voafafa » ihany no esorina, eto.
        if(h && h.voafafa){
          resaka[email] = resaka[email].filter(function(x){ return x.id !== id; });
          asehoyResaka();
          return;
        }
        fafaoHafatra(email, [id]);
      });
      let habe = null;
      boaty.querySelector('[data-ngeza]').addEventListener('click', function(){
        if(habe){
          boaty.style.width = habe.w; boaty.style.height = habe.h; habe = null;
        } else {
          habe = { w: boaty.style.width, h: boaty.style.height };
          boaty.style.width = 'calc(100vw - 24px)'; boaty.style.height = 'calc(100vh - 24px)';
        }
        const zone = boaty.querySelector('[data-hafatra]');
        zone.scrollTop = zone.scrollHeight;
      });
      const input = boaty.querySelector('[data-soratra]');
      function alefa(){
        const soratra = input.value.trim();
        if(!soratra) return;
        input.value = '';
        alefaHafatra(soratra, null);
      }
      boaty.querySelector('[data-alefa]').addEventListener('click', alefa);
      input.addEventListener('keydown', function(e){ if(e.key === 'Enter') alefa(); });
      const anaranaInput = boaty.querySelector('[data-anarana-input]');
      function tehirizoAnarana(){
        const anarana = anaranaInput.value.trim().slice(0, 40);
        if(!anarana){ anaranaInput.focus(); return; }
        try{ localStorage.setItem(ANARANA_MPITSIDIKA, anarana); }catch(e){}
        updateMyPresence({ name: anarana });
        asehoyResaka();
        input.focus();
      }
      boaty.querySelector('[data-anarana-ok]').addEventListener('click', tehirizoAnarana);
      boaty.querySelector('[data-google]').addEventListener('click', function(){
        if(typeof window.__fidiranaGoogle === 'function') window.__fidiranaGoogle();
      });
      anaranaInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') tehirizoAnarana(); });
      boaty.querySelector('[data-emoji-bokotra]').addEventListener('click', function(){ sokafyEmoji(boaty, input); });
      const fichierInput = boaty.querySelector('[data-rakitra-input]');
      boaty.querySelector('[data-rakitra]').addEventListener('click', function(){ fichierInput.click(); });
      fichierInput.addEventListener('change', function(){
        const f = fichierInput.files && fichierInput.files[0];
        fichierInput.value = '';
        alefaRakitra(f);
      });
    }
    boaty.style.display = 'flex';
    asehoyResaka();
    const input = boaty.querySelector('[data-soratra]');
    if(input) input.focus();
  }

  function asehoyResaka(){
    const boaty = document.getElementById('resakaMivantana');
    if(!boaty || !resakaMisokatra) return;
    const online = !!presenceState[resakaMisokatra.email];
    const email = resakaMisokatra.email;
    const anarana = presenceState[email] ? anaranaAseho(email) : resakaMisokatra.anarana;
    boaty.querySelector('[data-lohateny]').textContent = '💬 ' + anarana + (online ? ' 🟢' : ' ⚪');
    boaty.querySelector('[data-momba]').textContent = mombaOlona(email);
    boaty.querySelector('[data-anarana]').style.display = !currentUser && !anaranaMpitsidika() ? 'flex' : 'none';
    const lisitra = resaka[resakaMisokatra.email] || [];
    const zone = boaty.querySelector('[data-hafatra]');
    zone.innerHTML = lisitra.length
      ? lisitra.map(function(h){
          const izaho = h.avy === 'izaho';
          if(!h.id) h.id = idHafatra();
          if(h.voafafa){
            const soratra = h.voafafa === 'daholo' ? '🗑️ Nofafany daholo ny hafatra teo aloha'
              : izaho ? '🗑️ Nofafanao ity hafatra ity' : '🗑️ Voafafa ity hafatra ity';
            const esory = '<button type="button" data-fafao="' + escapeHtml(h.id) + '" title="Esory" style="flex:none; ' +
              'border:none; background:none; color:var(--muted); cursor:pointer; font-size:0.8rem; padding:0 0.3rem;">✕</button>';
            return '<div style="display:flex; align-items:center; justify-content:' +
              (h.voafafa === 'daholo' ? 'center' : izaho ? 'flex-end' : 'flex-start') + '; margin:0.25rem 0;">' +
              (izaho ? esory : '') +
              '<span style="max-width:80%; padding:0.35rem 0.6rem; border-radius:10px; border:1px dashed var(--line); ' +
                'color:var(--muted); font-style:italic; font-size:0.76rem;">' + soratra + '</span>' +
              (izaho ? '' : esory) + '</div>';
          }
          let atiny = '';
          if(h.media && /^https:\/\//.test(h.media.url)){
            const url = escapeHtml(h.media.url);
            atiny += h.media.type === 'video'
              ? '<video src="' + url + '" controls playsinline style="display:block; max-width:100%; max-height:260px; border-radius:8px;"></video>'
              : '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="Sary" ' +
                  'style="display:block; max-width:100%; max-height:260px; border-radius:8px;"></a>';
          }
          if(h.soratra) atiny += (atiny ? '<div style="margin-top:0.3rem;">' : '<div>') + escapeHtml(h.soratra) + '</div>';
          const fafao = '<button type="button" data-fafao="' + escapeHtml(h.id) + '" title="Fafana" style="flex:none; ' +
            'border:none; background:none; color:var(--muted); cursor:pointer; font-size:0.8rem; padding:0 0.3rem;">✕</button>';
          return '<div style="display:flex; align-items:center; justify-content:' + (izaho ? 'flex-end' : 'flex-start') + '; margin:0.25rem 0;">' +
            (izaho ? fafao : '') +
            '<span style="max-width:80%; padding:0.4rem 0.6rem; border-radius:10px; overflow-wrap:anywhere; ' +
              (izaho ? 'background:var(--cyan); color:#000;' : 'background:var(--panel-2); color:var(--text);') + '">' +
              atiny + '</span>' + (izaho ? '' : fafao) + '</div>';
        }).join('')
      : '<p style="color:var(--muted); font-size:0.76rem;">' +
          (online ? 'Soraty ny hafatra voalohany.' : 'Tsy miditra ankehitriny io olona io : tsy ho tonga ny hafatra raha tsy miditra izy.') + '</p>';
    zone.scrollTop = zone.scrollHeight;
    // Ny sary tara tonga : averina midina any ambany rehefa feno.
    zone.querySelectorAll('img, video').forEach(function(m){
      m.addEventListener(m.tagName === 'IMG' ? 'load' : 'loadedmetadata', function(){ zone.scrollTop = zone.scrollHeight; }, { once: true });
    });
    // Hita ilay resaka : voavaky daholo ny hafatra.
    if(tsyVoavaky[email] && resakaHitaIzao(email)){
      delete tsyVoavaky[email];
      asehoyIsaHafatra();
      asehoyIndrayLisitra();
    }
  }
  window.__sokafyResaka = sokafyResaka;

  function onIncomingRing(payload){
    const me = myIdentity();
    if(activeCall){
      sendCallSignal({ kind: 'reject', roomId: payload.roomId, from: me.email, to: payload.from, reason: 'busy' });
      return;
    }
    activeCall = { roomId: payload.roomId, withEmail: payload.from, withName: payload.fromName, callType: payload.callType, direction: 'incoming', status: 'ringing', offerSdp: payload.sdp, pendingIce: [] };
    // Mitovy amin'ny Live : fampandrenesana ao amin'ny lakolosy koa, mba hisy
    // dian'ilay antso na dia tsy voaray aza.
    const who = payload.fromName || payload.from;
    if(currentUser && typeof pushNotification === 'function'){
      pushNotification('antso', (payload.callType === 'video' ? '📹 Antso video' : '📞 Antso feo') +
        ' avy amin\'i ' + who + '.');
    }
    // Certaines pages décrochent seules : celle du livreur, quand c'est son
    // patron qui l'appelle (vue-mpiasa.js). Il a les mains sur le guidon. La
    // sonnerie et la notification partent quand même : ce sont elles qui le
    // préviennent si la page n'est pas à l'écran.
    const raisinaHoAzy = typeof window.__antsoRaisinaHoAzy === 'function' && window.__antsoRaisinaHoAzy(payload);
    showIncomingCallUI();
    showSystemNotification(
      (payload.callType === 'video' ? '📹 Antso video' : '📞 Antso feo') + ' avy amin\'i ' + who,
      'Tsindrio ity mba hiverina amin\'ny appli sy hamaly.',
      'antso-' + payload.roomId
    );
    if(raisinaHoAzy) decrocherDesQueVisible(payload.roomId);
  }

  // Décrocher seul demande le micro et la caméra, que le navigateur refuse à
  // une page cachée (écran verrouillé, autre application devant). Visible :
  // tout de suite. Cachée : la sonnerie et la notification la font revenir,
  // et l'appel s'ouvre dès qu'elle est de nouveau à l'écran.
  function decrocherDesQueVisible(roomId){
    const encore = function(){ return activeCall && activeCall.roomId === roomId && activeCall.status === 'ringing'; };
    if(!document.hidden){ if(encore()) acceptIncomingCall(); return; }
    const auRetour = function(){
      if(document.hidden) return;
      document.removeEventListener('visibilitychange', auRetour);
      if(encore()) acceptIncomingCall();
    };
    document.addEventListener('visibilitychange', auRetour);
  }

  function acceptIncomingCall(){
    const call = activeCall;
    if(!call) return;
    const me = myIdentity();
    getCallMedia(call.callType === 'video').then(function(stream){
      const pc = new RTCPeerConnection(ICE_SERVERS);
      call.peer = pc; call.localStream = stream; call.status = 'connecting';
      stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
      pc.ontrack = function(e){ attachRemoteStream(e.streams[0]); };
      pc.onicecandidate = function(e){
        if(e.candidate) sendCallSignal({ kind: 'ice', roomId: call.roomId, from: me.email, to: call.withEmail, candidate: e.candidate });
      };
      pc.setRemoteDescription(new RTCSessionDescription(call.offerSdp)).then(function(){
        return pc.createAnswer();
      }).then(function(answer){
        return pc.setLocalDescription(answer);
      }).then(function(){
        sendCallSignal({ kind: 'answer', roomId: call.roomId, from: me.email, to: call.withEmail, sdp: pc.localDescription });
        call.status = 'connected';
        updateCallUIStatus();
        (call.pendingIce || []).forEach(function(c){ pc.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); });
        call.pendingIce = [];
      });
    }).catch(function(err){
      sendCallSignal({ kind: 'reject', roomId: call.roomId, from: me.email, to: call.withEmail, reason: 'no-media' });
      activeCall = null;
      hideCallUI();
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  function declineIncomingCall(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'reject', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail, reason: 'declined' });
    endCall();
  }

  function onCallAnswered(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    clearTimeout(activeCall.timeoutId);
    activeCall.peer.setRemoteDescription(new RTCSessionDescription(payload.sdp)).then(function(){
      activeCall.status = 'connected';
      updateCallUIStatus();
    });
  }

  function onRemoteIce(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    if(!activeCall.peer){ activeCall.pendingIce = activeCall.pendingIce || []; activeCall.pendingIce.push(payload.candidate); return; }
    activeCall.peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }

  function onCallRejected(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    clearTimeout(activeCall.timeoutId);
    endCall();
  }

  function onCallEnded(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    endCall();
  }

  function endCall(){
    if(typeof resetCallTranslation === 'function') resetCallTranslation();
    const call = activeCall;
    if(call){
      clearTimeout(call.timeoutId);
      if(call.peer){ try{ call.peer.close(); }catch(e){} }
      if(call.localStream){ call.localStream.getTracks().forEach(function(t){ t.stop(); }); }
    }
    activeCall = null;
    hideCallUI();
  }

  function hangupCall(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail });
    endCall();
  }

  function showOutgoingCallUI(){
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callIncomingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'none';
    document.getElementById('callOutgoingBox').style.display = 'block';
    document.getElementById('callOutgoingName').textContent = activeCall.withName || activeCall.withEmail;
  }
  function showIncomingCallUI(){
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callOutgoingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'none';
    document.getElementById('callIncomingBox').style.display = 'block';
    document.getElementById('callIncomingType').textContent = activeCall.callType === 'video' ? 'Antso video miditra...' : 'Antso feo miditra...';
    document.getElementById('callIncomingName').textContent = activeCall.withName || activeCall.withEmail;
    playRingtone();
  }
  function updateCallUIStatus(){
    stopRingtone();
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callIncomingBox').style.display = 'none';
    document.getElementById('callOutgoingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'block';
    document.getElementById('callActiveWith').textContent = (activeCall.callType === 'video' ? '📹 ' : '📞 ') + (activeCall.withName || activeCall.withEmail);
    if(activeCall.localStream){
      const localEl = document.getElementById('callLocalVideo');
      const videoTracks = activeCall.localStream.getVideoTracks();
      localEl.srcObject = activeCall.localStream;
      // Aseho ny sary kelinao raha misy piste video mandeha. Amin'ny antso feo
      // dia miafina izy, fa mipoitra avy hatrany rehefa tsindriana « Kamera ».
      const camOn = videoTracks.length > 0 && videoTracks[0].enabled;
      localEl.style.display = camOn ? 'block' : 'none';
      const camBtn = document.getElementById('callCamBtn');
      if(camBtn){
        camBtn.disabled = videoTracks.length === 0;
        camBtn.textContent = videoTracks.length === 0
          ? '📷 Tsy misy kamera'
          : (camOn ? '📷 Kamera' : '📷 Sokafy ny kamera');
      }
    }
  }
  function attachRemoteStream(stream){
    const video = document.getElementById('callRemoteVideo');
    video.srcObject = stream;
    if(activeCall) updateCallUIStatus();
    // Un appel décroché tout seul n'a pas eu de geste de la main : le
    // navigateur peut alors refuser d'en jouer le son. On le joue sans son,
    // et un bouton rend le son au premier toucher.
    const lecture = video.play && video.play();
    if(lecture && lecture.catch) lecture.catch(function(){
      video.muted = true;
      video.play().catch(function(){});
      montrerBoutonSon(video);
    });
  }
  function montrerBoutonSon(video){
    let b = document.getElementById('callSonBtn');
    if(!b){
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'callSonBtn';
      b.className = 'btn btn-primary btn-sm';
      b.style.cssText = 'width:100%; margin-bottom:0.6rem;';
      b.textContent = '🔊 Tsindrio raha tsy mandre';
      video.parentNode.insertBefore(b, video);
    }
    b.style.display = '';
    b.onclick = function(){
      video.muted = false;
      video.play().catch(function(){});
      b.style.display = 'none';
    };
  }
  function hideCallUI(){
    stopRingtone();
    document.getElementById('callOverlay').style.display = 'none';
    document.getElementById('callRemoteVideo').srcObject = null;
    document.getElementById('callRemoteVideo').muted = false;
    const son = document.getElementById('callSonBtn');
    if(son) son.style.display = 'none';
    document.getElementById('callLocalVideo').srcObject = null;
    document.getElementById('callMuteBtn').textContent = '🎙️ Mute';
    const camBtn = document.getElementById('callCamBtn');
    camBtn.textContent = '📷 Kamera';
    camBtn.disabled = false;
    document.getElementById('callLocalVideo').style.display = 'none';
  }

  const callAcceptBtn = document.getElementById('callAcceptBtn');
  if(callAcceptBtn) callAcceptBtn.addEventListener('click', acceptIncomingCall);
  const callDeclineBtn = document.getElementById('callDeclineBtn');
  if(callDeclineBtn) callDeclineBtn.addEventListener('click', declineIncomingCall);
  const callCancelBtn = document.getElementById('callCancelBtn');
  if(callCancelBtn) callCancelBtn.addEventListener('click', function(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail, reason: 'cancelled' });
    endCall();
  });
  const callHangupBtn = document.getElementById('callHangupBtn');
  if(callHangupBtn) callHangupBtn.addEventListener('click', hangupCall);
  const callMuteBtn = document.getElementById('callMuteBtn');
  if(callMuteBtn) callMuteBtn.addEventListener('click', function(){
    if(!activeCall || !activeCall.localStream) return;
    const tracks = activeCall.localStream.getAudioTracks();
    const nowMuted = tracks.length && tracks[0].enabled;
    tracks.forEach(function(t){ t.enabled = !nowMuted; });
    callMuteBtn.textContent = nowMuted ? '🔇 Unmute' : '🎙️ Mute';
  });
  const callCamBtn = document.getElementById('callCamBtn');
  if(callCamBtn) callCamBtn.addEventListener('click', function(){
    if(!activeCall || !activeCall.localStream) return;
    const tracks = activeCall.localStream.getVideoTracks();
    if(!tracks.length){
      alert('Tsy misy kamera hita amin\'ity fitaovana ity, na nolavina ny alalana.');
      return;
    }
    const nowOn = tracks[0].enabled;
    tracks.forEach(function(t){ t.enabled = !nowOn; });
    // Ny sary kelinao dia asehoina na afenina araka izany.
    document.getElementById('callLocalVideo').style.display = nowOn ? 'none' : 'block';
    callCamBtn.textContent = nowOn ? '📷 Sokafy ny kamera' : '📷 Kamera';
  });

  // ---------------- LIVE DIRECT (1 vers plusieurs, mesh WebRTC) ----------------
  let liveSignalChannel = null;
  let myLive = null;
  let watchingLive = null;

  function initLiveSignaling(){
    if(!window.__sb || liveSignalChannel) return;
    liveSignalChannel = window.__sb.channel('live-signal-tanjona');
    liveSignalChannel.on('broadcast', { event: 'signal' }, function(msg){ handleLiveSignal(msg.payload || {}); });
    liveSignalChannel.subscribe();
  }
  function sendLiveSignal(payload){ if(liveSignalChannel) liveSignalChannel.send({ type: 'broadcast', event: 'signal', payload: payload }); }

  // La liste de ce qui se diffuse en ce moment. Elle reste affichée même
  // quand elle est vide : sans cela, personne ne sait où les directs
  // apparaîtront, ni qu'il y a un endroit pour les regarder.
  function renderLiveList(){
    const panel = document.getElementById('liveNoticePanel');
    const box = document.getElementById('liveActiveList');
    const empty = document.getElementById('liveActiveEmpty');
    if(!panel || !box) return;

    // On ne se propose pas à soi-même le direct qu'on est en train de faire.
    const excluded = myLive ? myLive.broadcaster : null;
    const lives = Object.keys(presenceState).filter(function(email){
      return presenceState[email].live && email !== excluded;
    });

    box.innerHTML = '';
    if(empty) empty.style.display = lives.length ? 'none' : 'block';

    lives.forEach(function(email){
      const p = presenceState[email];
      const name = p.name || email;
      const alreadyWatching = watchingLive && watchingLive.broadcasterEmail === email;

      const card = document.createElement('div');
      card.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.8rem; ' +
        'flex-wrap:wrap; border:1px solid var(--line); border-radius:10px; padding:0.7rem 0.9rem; ' +
        'margin-bottom:0.6rem; background:var(--panel-2);';

      const infos = document.createElement('div');
      infos.innerHTML =
        '<div style="font-size:0.9rem; color:var(--text);">' +
          '<span class="live-onair-badge" style="position:static; display:inline-block; margin-right:0.5rem;">🔴 MIVANTANA</span>' +
          '<strong>' + escapeHtml(name) + '</strong>' +
        '</div>' +
        (p.isAdmin ? '<div style="font-size:0.72rem; color:var(--cyan); margin-top:0.25rem;">Tompon\'ny appli</div>' : '');
      card.appendChild(infos);

      if(alreadyWatching){
        const en = document.createElement('span');
        en.className = 'btn btn-sm';
        en.style.cssText = 'width:auto; opacity:0.6;';
        en.textContent = 'Mijery izao';
        card.appendChild(en);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-red btn-sm';
        btn.style.width = 'auto';
        btn.textContent = '👁️ Mijery';
        btn.addEventListener('click', function(){ joinLive(email, name); });
        card.appendChild(btn);
      }

      box.appendChild(card);
    });
  }

  function startLive(){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(myLive){ alert('Efa mandeha ny Live-nao.'); return; }
    if(watchingLive){ alert('Mijanona amin\'ny live jerena aloha vao manomboka anao manokana.'); return; }

    // Fanontaniana raha efa misy live mandeha : matetika ny olona te-HIJERY no
    // manindry ity bokotra ity, ka ny kamerany manokana indray no misokatra.
    const meNow = myIdentity();
    const otherLives = Object.keys(presenceState).filter(function(email){
      return presenceState[email] && presenceState[email].live && email !== meNow.email;
    });
    if(otherLives.length){
      const otherName = (presenceState[otherLives[0]] || {}).name || otherLives[0];
      const watchIt = confirm(
        'Misy Live mandeha an\'i ' + otherName + '.\n\n' +
        'OK = mijery ny live an\'i ' + otherName + '\n' +
        'Annuler = manomboka ny Live-nao manokana (hisokatra ny kameranao)'
      );
      if(watchIt){ joinLive(otherLives[0], otherName); return; }
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(function(stream){
      const me = myIdentity();
      myLive = { broadcaster: me.email, name: me.name, stream: stream, viewers: {} };
      document.getElementById('liveBroadcasterVideo').srcObject = stream;
      showBroadcasterUI();
      updateMyPresence({ live: true });
      // (1) Fampandrenesana ao anaty appli ho an'ny mpanjifa/namana rehetra.
      sendLiveSignal({ kind: 'live-started', broadcaster: me.email, name: me.name });
      // Le canal ne prévient que ceux dont l'application est ouverte. La
      // boutique — patron et employés — le retrouve aussi dans ses
      // notifications partagées, avec le même texte que ceux qui l'ont reçu
      // en direct : common.js n'ajoute pas deux fois la même.
      if(typeof partagerNotification === 'function'){
        partagerNotification('live', '🔴 ' + me.name + ' dia manomboka LIVE DIRECT ankehitriny.');
      }
      updateLiveReachInfo();
      // (2) Fanambarana any amin'ireo lien voarafitra, mba ho hitan'ny olona
      // ivelan'ny appli koa. Menu no aseho fa tsy tabilao maro misokatra ho azy :
      // sakanan'ny navigateur rehetra ny popup marobe tsy notsindrian'olona.
      // Elle s'ouvrait toujours, par-dessus la caméra qui vient de s'allumer.
      // Elle attend maintenant d'être demandée — et « Zarao mialoha ny rohy »
      // reste là pour qui préfère la choisir lui-même, avant de commencer.
      const zara = document.getElementById('liveZara');
      if(!zara || zara.checked) announceLiveOnNetworks(me.name);
      // (3) Le billet dans le fil de la Botika, si la case est cochée. Les
      // deux avis ci-dessus ne touchent que ceux dont l'application est
      // ouverte maintenant ; celui-ci attend dans le fil ceux qui l'ouvriront
      // tout à l'heure, avec le lien qui les fait entrer.
      publierLeLive(me.name);
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  // Le direct posé dans le fil, comme une annonce ordinaire — le fil sait
  // déjà l'afficher en rouge, il ne lui manquait que d'être écrit.
  //
  // Décochée, la case ne publie rien : le direct reste entre ceux qui sont
  // déjà là. C'est un choix, et le défaut est de publier — un direct que
  // personne ne voit passer ne sert à rien.
  function publierLeLive(name){
    const choix = document.getElementById('livePublier');
    if(choix && !choix.checked) return;
    if(!window.__sb) return;

    const billet = {
      client_name: name || 'Client',
      network: 'Live',
      type: 'live',
      message: '🔴 ' + (name || 'Izahay') + ' dia manao LIVE DIRECT ankehitriny.',
      link: liveJoinLink(),
      price: null,
      image: null
    };

    const envoyer = function(photo){
      const avecAuteur = Object.assign({}, billet, {
        author_email: (currentUser && currentUser.email) || null,
        author_photo: photo || null
      });
      // Tant que le script des deux colonnes n'a pas été passé, elles
      // n'existent pas et l'envoi entier serait refusé : le billet doit
      // partir quand même, sans le visage.
      window.__sb.from('client_news').insert(avecAuteur)
        .then(function(res){
          return (res && res.error) ? window.__sb.from('client_news').insert(billet) : res;
        })
        .then(function(){
          if(typeof renderCommunityNews === 'function') renderCommunityNews();
        }, function(){});
    };

    if(typeof vignette === 'function'){
      vignette(currentUser && currentUser.logo).then(envoyer, function(){ envoyer(null); });
    } else {
      envoyer(null);
    }
  }

  // Rohy mampiditra mivantana amin'ny Live : ny mpanjifa manokatra azy dia
  // tafiditra ao amin'ny live avy hatrany aorian'ny fidirana, tsy mila mitady.
  function liveJoinLink(){
    const me = myIdentity();
    const base = (typeof appShareLink === 'function') ? appShareLink() : window.location.href;
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'live=' + encodeURIComponent(me.email) + '&name=' + encodeURIComponent(me.name);
  }
  // Pendant le direct, le 🎬 de « Écrire » (parametres.js) s'ouvre déjà rempli
  // de ce lien : on publie sans avoir à le chercher. Hors direct, rien.
  window.lienDuLiveEnCours = function(){ return myLive ? liveJoinLink() : null; };

  // Fanambarana ny Live any amin'ireo tambajotra voarafitra (WhatsApp, Facebook…).
  function announceLiveOnNetworks(name){
    if(typeof shareContent !== 'function') return;
    shareContent({
      title: 'Live direct — Ny asako',
      text: '🔴 ' + (name || 'Izahay') + ' dia manao LIVE DIRECT ankehitriny. Tsindrio ity rohy ity dia tafiditra avy hatrany ianao :',
      url: liveJoinLink()
    });
  }

  function stopLive(){
    if(!myLive) return;
    Object.keys(myLive.viewers).forEach(function(v){
      try{ myLive.viewers[v].close(); }catch(e){}
      sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v });
    });
    sendLiveSignal({ kind: 'live-stopped', broadcaster: myLive.broadcaster, name: myLive.name });
    myLive.stream.getTracks().forEach(function(t){ t.stop(); });
    myLive = null;
    updateMyPresence({ live: false });
    hideBroadcasterUI();
  }

  // ---------------- FAMPANDRENESANA LIVE (ho an'ny rehetra) ----------------
  // Bandeau mihantona eo ambony, hita na aiza na aiza ao amin'ny appli, miaraka
  // amin'ny fampandrenesana ao amin'ny lakolosy.
  // Ce qu'on a déjà annoncé, par diffuseur. Deux chemins mènent ici — le
  // signal « live-started » et la présence — et il ne faut qu'un bandeau.
  const livesAnnonces = {};

  // Le signal ne prévient que ceux dont l'application est ouverte À L'INSTANT
  // où le direct commence. Celui qui l'ouvre cinq minutes plus tard n'en
  // savait rien : il entrait dans une boutique où quelqu'un parlait dans la
  // pièce d'à côté, sans que rien ne le lui dise. La présence, elle, dit qui
  // diffuse en ce moment — c'est elle qui rattrape les arrivants.
  function annoncerLeLive(email, name){
    if(!email) return;
    const me = myIdentity();
    if(email === me.email) return;
    if(livesAnnonces[email]) return;
    livesAnnonces[email] = true;

    const qui = name || email || 'Mpanjifa';
    if(typeof pushNotification === 'function'){
      pushNotification('live', '🔴 ' + qui + ' dia manomboka LIVE DIRECT ankehitriny.');
    }
    showLiveToast(email, qui);
    playLiveChime();
    // Fampandrenesana an'ny navigateur : tsindriana dia miditra mivantana amin'ny Live.
    showSystemNotification(
      '🔴 ' + qui + ' dia manao Live direct',
      'Tsindrio ity mba hiditra hijery avy hatrany.',
      'live-' + email,
      function(){
        const nav = document.querySelector('.nav-item[data-section="live"]');
        if(nav && !nav.classList.contains('active')) nav.click();
        joinLive(email, qui);
        removeLiveToast(email);
      }
    );
  }

  // Le direct s'est arrêté : le bandeau s'en va, et l'on oublie l'avoir
  // annoncé — sans quoi le prochain direct de la même personne passerait
  // sous silence.
  function oublierLeLive(email){
    if(!email) return;
    delete livesAnnonces[email];
    removeLiveToast(email);
  }

  function onSomeoneWentLive(payload){
    annoncerLeLive(payload.broadcaster, payload.name || payload.broadcaster);
  }

  // Passe en revue qui diffuse en ce moment, d'après la présence. Appelée à
  // chaque synchronisation : la première a lieu à l'ouverture de
  // l'application, et c'est là que tout se joue pour celui qui arrive.
  function veillerSurLesLives(){
    Object.keys(presenceState).forEach(function(email){
      const p = presenceState[email];
      if(p && p.live) annoncerLeLive(email, p.name);
    });
    Object.keys(livesAnnonces).forEach(function(email){
      const p = presenceState[email];
      if(!(p && p.live)) oublierLeLive(email);
    });
    // Les billets du fil disent « en ce moment » tant que personne ne les
    // détrompe : c'est le même changement de présence qui les met à jour.
    if(typeof window.__majBilletsLive === 'function') window.__majBilletsLive();
  }

  function liveToastContainer(){
    let box = document.getElementById('liveToastBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'liveToastBox';
      box.style.cssText = 'position:fixed; top:0.8rem; right:0.8rem; left:0.8rem; z-index:190; ' +
        'display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; pointer-events:none;';
      document.body.appendChild(box);
    }
    return box;
  }

  function showLiveToast(email, name){
    removeLiveToast(email);
    const toast = document.createElement('div');
    toast.className = 'live-toast';
    toast.setAttribute('data-live-toast', email);
    toast.innerHTML =
      '<span>🔴 <strong>' + escapeHtml(name) + '</strong> dia manao Live direct</span>' +
      '<button type="button" class="btn btn-red btn-sm live-toast-join" style="width:auto;">Mijery</button>' +
      '<button type="button" class="btn btn-sm live-toast-close" style="width:auto;">✕</button>';
    toast.querySelector('.live-toast-join').addEventListener('click', function(){
      const nav = document.querySelector('.nav-item[data-section="live"]');
      if(nav && !nav.classList.contains('active')) nav.click();
      joinLive(email, name);
      removeLiveToast(email);
    });
    toast.querySelector('.live-toast-close').addEventListener('click', function(){ removeLiveToast(email); });
    liveToastContainer().appendChild(toast);
  }

  function removeLiveToast(email){
    const el = document.querySelector('[data-live-toast="' + (window.CSS && CSS.escape ? CSS.escape(email) : email) + '"]');
    if(el) el.remove();
  }

  function onViewerJoin(payload){
    if(!myLive) return;
    const viewerEmail = payload.viewer;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    myLive.viewers[viewerEmail] = pc;
    myLive.stream.getTracks().forEach(function(t){ pc.addTrack(t, myLive.stream); });
    pc.onicecandidate = function(e){
      if(e.candidate) sendLiveSignal({ kind: 'ice-b', broadcaster: myLive.broadcaster, viewer: viewerEmail, candidate: e.candidate });
    };
    pc.createOffer().then(function(offer){ return pc.setLocalDescription(offer); }).then(function(){
      sendLiveSignal({ kind: 'offer', broadcaster: myLive.broadcaster, viewer: viewerEmail, sdp: pc.localDescription });
    });
    updateViewerCount();
  }
  function onViewerAnswer(payload){
    const pc = myLive.viewers[payload.viewer];
    if(!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(function(){});
  }
  function onViewerIce(payload){
    const pc = myLive.viewers[payload.viewer];
    if(!pc) return;
    pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }
  function onViewerLeave(payload){
    const pc = myLive.viewers[payload.viewer];
    if(pc){ try{ pc.close(); }catch(e){} delete myLive.viewers[payload.viewer]; updateViewerCount(); }
  }
  function updateViewerCount(){
    const el = document.getElementById('liveViewerCount');
    if(el && myLive) el.textContent = Object.keys(myLive.viewers).length;
    updateLiveReachInfo();
  }

  // Marika manamarina amin'ny mpanao Live fa tena mipoitra any amin'ny mpanjifa
  // ny live-ny : firy no voampandre, firy no efa nanokatra.
  function updateLiveReachInfo(){
    const el = document.getElementById('liveReachInfo');
    if(!el || !myLive) return;
    const me = myIdentity();
    const others = Object.keys(presenceState).filter(function(email){ return email !== me.email; });
    const watching = Object.keys(myLive.viewers).length;
    if(!others.length){
      el.innerHTML = '⚠️ <strong>Tsy misy olona miditra ankehitriny.</strong> Rehefa misy miditra dia ho hitany avy hatrany ny live-nao.';
      return;
    }
    el.innerHTML = '✅ Mipoitra any amin\'ny <strong>' + others.length + ' mpanjifa</strong> miditra ' +
      'ankehitriny : bandeau 🔴 sy fampandrenesana. <strong>' + watching + '</strong> no efa mijery.';
  }

  // ---------------- LE DIRECT MONTRÉ AILLEURS QUE DANS SA PAGE ----------------
  //
  // Un flux se montre dans autant de <video> qu'on veut : c'est la même image
  // qu'on affiche deux fois, et non un second raccordement au diffuseur. Le
  // fil de la Botika peut donc montrer le direct dans le billet lui-même,
  // sans rien coûter de plus à celui qui diffuse.
  let fluxRegarde = null;
  let ecransDuLive = [];

  function poserLeFluxDuLive(flux){
    fluxRegarde = flux;
    const principal = document.getElementById('liveViewerVideo');
    if(principal) principal.srcObject = flux;
    ecransDuLive = ecransDuLive.filter(function(v){ return v.isConnected; });
    ecransDuLive.forEach(function(v){ v.srcObject = flux; });
  }

  // Un écran de plus pour le direct en cours. Il reçoit l'image tout de suite
  // si elle est déjà là, et l'attend sinon.
  function brancherUnEcranDuLive(video){
    if(!video) return;
    if(ecransDuLive.indexOf(video) === -1) ecransDuLive.push(video);
    if(fluxRegarde) video.srcObject = fluxRegarde;
  }

  function debrancherLesEcransDuLive(){
    ecransDuLive.forEach(function(v){ try { v.srcObject = null; } catch(e){} });
    ecransDuLive = [];
  }

  // Le direct qu'on regarde en ce moment, pour qui veut le montrer ailleurs
  // sans s'y raccorder une seconde fois.
  function liveRegardeMaintenant(){
    return watchingLive ? watchingLive.broadcasterEmail : null;
  }

  function joinLive(broadcasterEmail, broadcasterName){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(watchingLive){ alert('Mijery live hafa efa ianao.'); return; }
    if(myLive){ alert('Ajanony aloha ny Live ataonao vao mijery an\'ny hafa.'); return; }
    const me = myIdentity();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    watchingLive = { broadcasterEmail: broadcasterEmail, broadcasterName: broadcasterName, peer: pc, pendingIce: [] };
    pc.ontrack = function(e){ poserLeFluxDuLive(e.streams[0]); };
    pc.onicecandidate = function(e){
      if(e.candidate) sendLiveSignal({ kind: 'ice-v', broadcaster: broadcasterEmail, viewer: me.email, candidate: e.candidate });
    };
    showLiveViewerUI(broadcasterName);
    sendLiveSignal({ kind: 'join', broadcaster: broadcasterEmail, viewer: me.email, viewerName: me.name });
  }
  function onBroadcasterOffer(payload){
    if(!watchingLive) return;
    const pc = watchingLive.peer;
    pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).then(function(){
      return pc.createAnswer();
    }).then(function(answer){
      return pc.setLocalDescription(answer);
    }).then(function(){
      sendLiveSignal({ kind: 'answer', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email, sdp: pc.localDescription });
      (watchingLive.pendingIce || []).forEach(function(c){ pc.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); });
      watchingLive.pendingIce = [];
    });
  }
  function onBroadcasterIce(payload){
    if(!watchingLive) return;
    if(!watchingLive.peer.remoteDescription){ watchingLive.pendingIce.push(payload.candidate); return; }
    watchingLive.peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }
  function leaveLive(){
    if(!watchingLive) return;
    sendLiveSignal({ kind: 'leave', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email });
    try{ watchingLive.peer.close(); }catch(e){}
    watchingLive = null;
    hideLiveViewerUI();
  }
  function onLiveEndedByBroadcaster(){
    if(watchingLive){ try{ watchingLive.peer.close(); }catch(e){} }
    watchingLive = null;
    hideLiveViewerUI();
    alert('Vita ny Live.');
  }

  function handleLiveSignal(payload){
    if(!payload || !payload.kind) return;
    const me = myIdentity();
    if(payload.kind === 'chat'){
      const isMyLive = myLive && payload.broadcaster === myLive.broadcaster;
      const isWatching = watchingLive && payload.broadcaster === watchingLive.broadcasterEmail;
      if(isMyLive || isWatching) appendLiveChatMessage(payload);
      return;
    }
    if(payload.kind === 'ended'){
      if(watchingLive && payload.broadcaster === watchingLive.broadcasterEmail) onLiveEndedByBroadcaster();
      return;
    }
    // Fampandrenesana ho an'ny OLONA REHETRA miditra : tsy voafetra amin'ny
    // mpijery efa mifandray, fa alefa amin'ny rehetra rehefa misy Live manomboka.
    if(payload.kind === 'live-started'){
      if(payload.broadcaster !== me.email) onSomeoneWentLive(payload);
      return;
    }
    if(payload.kind === 'live-stopped'){
      if(payload.broadcaster !== me.email) oublierLeLive(payload.broadcaster);
      return;
    }
    if(myLive && payload.broadcaster === myLive.broadcaster){
      if(payload.kind === 'join'){ onViewerJoin(payload); return; }
      if(payload.kind === 'answer' && myLive.viewers[payload.viewer]){ onViewerAnswer(payload); return; }
      if(payload.kind === 'ice-v' && myLive.viewers[payload.viewer]){ onViewerIce(payload); return; }
      if(payload.kind === 'leave'){ onViewerLeave(payload); return; }
    }
    if(watchingLive && payload.viewer === me.email && payload.broadcaster === watchingLive.broadcasterEmail){
      if(payload.kind === 'offer'){ onBroadcasterOffer(payload); return; }
      if(payload.kind === 'ice-b'){ onBroadcasterIce(payload); return; }
    }
  }

  function sendLiveChat(text){
    const me = myIdentity();
    const broadcasterEmail = myLive ? myLive.broadcaster : (watchingLive ? watchingLive.broadcasterEmail : null);
    if(!broadcasterEmail || !text) return;
    sendLiveSignal({ kind: 'chat', broadcaster: broadcasterEmail, from: me.email, fromName: me.name, text: text, at: Date.now() });
  }
  function appendLiveChatMessage(payload){
    const box = document.getElementById('liveChatMessages');
    if(!box) return;
    const div = document.createElement('div');
    div.style.marginBottom = '0.35rem';
    div.innerHTML = '<strong>' + escapeHtml(payload.fromName || payload.from || '?') + ':</strong> ' + escapeHtml(payload.text || '');
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function showBroadcasterUI(){
    document.getElementById('liveIdleControls').style.display = 'none';
    document.getElementById('liveBroadcasterView').style.display = 'block';
    document.getElementById('liveViewerView').style.display = 'none';
    document.getElementById('liveChatBox').style.display = 'block';
    document.getElementById('liveChatMessages').innerHTML = '';
    document.getElementById('liveViewerCount').textContent = '0';
    renderLiveList();
  }
  function hideBroadcasterUI(){
    document.getElementById('liveBroadcasterView').style.display = 'none';
    document.getElementById('liveIdleControls').style.display = 'block';
    document.getElementById('liveChatBox').style.display = 'none';
    document.getElementById('liveBroadcasterVideo').srcObject = null;
    renderLiveList();
  }
  function showLiveViewerUI(hostName){
    document.getElementById('liveIdleControls').style.display = 'none';
    document.getElementById('liveBroadcasterView').style.display = 'none';
    document.getElementById('liveViewerView').style.display = 'block';
    document.getElementById('liveViewerHost').textContent = hostName;
    document.getElementById('liveChatBox').style.display = 'block';
    document.getElementById('liveChatMessages').innerHTML = '';
  }
  function hideLiveViewerUI(){
    document.getElementById('liveViewerView').style.display = 'none';
    document.getElementById('liveIdleControls').style.display = 'block';
    document.getElementById('liveChatBox').style.display = 'none';
    poserLeFluxDuLive(null);
    debrancherLesEcransDuLive();
    // Les billets du fil montraient encore le direct : leur cadre se referme
    // avec lui.
    if(typeof window.__refermerLesLivesDuFil === 'function') window.__refermerLesLivesDuFil();
    renderLiveList();
  }

  // ---------------- ROHY MIFANDRAY HO AZY (?live= / ?call=) ----------------
  // Ny mpanjifa dia tsy mila mitady na inona na inona ao amin'ny appli : ny
  // fanokafana ilay rohy nozaraina no mampiditra azy mivantana amin'ny Live na
  // manomboka ny antso. Andrasana ny fidirana (login) vao tanterahina.
  function pendingLinkAction(){
    try{
      const p = new URLSearchParams(window.location.search);
      const live = (p.get('live') || '').trim().toLowerCase();
      if(live) return { kind: 'live', email: live, name: p.get('name') || live };
      const call = (p.get('call') || '').trim().toLowerCase();
      if(call){
        const type = (p.get('type') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video';
        return { kind: 'call', email: call, name: p.get('name') || call, type: type };
      }
      // Le lien « confirmation » unique : la personne choisit ensuite.
      const rohy = (p.get('rohy') || '').trim().toLowerCase();
      if(rohy) return { kind: 'safidy', email: rohy, name: p.get('name') || rohy };
    }catch(e){}
    return null;
  }

  let linkActionDone = false;
  function runPendingLinkAction(){
    if(linkActionDone) return;
    const action = pendingLinkAction();
    if(!action) return;
    const me = myIdentity();
    if(action.email === me.email) return; // tsy miantso ny tenany
    linkActionDone = true;
    if(action.kind === 'safidy'){ montrerLesChoix(action); return; }
    executerAction(action, false);
  }

  // Le lien « confirmation » de « Copier tout » : une seule adresse dans le
  // message, et ici les boutons — entrer, rejoindre le Live, appeler en vidéo
  // ou en audio. Le choix est un vrai toucher : l'appel peut démarrer tout de
  // suite (la caméra le demande).
  function montrerLesChoix(action){
    const ancien = document.getElementById('rohySafidy');
    if(ancien) ancien.remove();
    const fond = document.createElement('div');
    fond.id = 'rohySafidy';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,0.6); display:flex; ' +
      'align-items:center; justify-content:center; padding:16px;';
    const bokotra = function(id, ik, texte, classe){
      return '<button type="button" class="btn ' + (classe || '') + '" data-safidy="' + id + '" style="width:100%; margin-top:0.6rem;">' +
        ik + ' ' + texte + '</button>';
    };
    fond.innerHTML =
      '<div class="panel" style="max-width:380px; width:100%; margin:0; text-align:center;">' +
        '<div class="eyebrow">Confirmation</div>' +
        '<h3 style="margin:0.3rem 0 0.4rem;">' + escapeHtml(action.name) + '</h3>' +
        '<p style="font-size:0.85rem; color:var(--muted); margin:0 0 0.4rem;" data-fz-tsia>Safidio izay tianao atao.</p>' +
        bokotra('hiditra', '✅', 'Hiditra ao amin\'ny Ny asako', 'btn-primary') +
        bokotra('live', '🔴', 'Live direct') +
        bokotra('video', '📹', 'Antso video') +
        bokotra('audio', '📞', 'Antso audio') +
      '</div>';
    fond.addEventListener('click', function(e){
      const b = e.target.closest('[data-safidy]');
      if(!b && e.target !== fond) return;
      fond.remove();
      const s = b ? b.dataset.safidy : 'hiditra';
      if(s === 'live') executerAction({ kind: 'live', email: action.email, name: action.name }, true);
      else if(s === 'video' || s === 'audio') executerAction({ kind: 'call', email: action.email, name: action.name, type: s }, true);
    });
    document.body.appendChild(fond);
  }

  function executerAction(action, toucher){
    // Les deux ont maintenant leur propre page : un lien d'appel n'a plus de
    // raison d'ouvrir le Live, ni l'inverse.
    const nav = document.querySelector('.nav-item[data-section="' +
      (action.kind === 'call' ? 'appels' : 'live') + '"]');
    if(nav && !nav.classList.contains('active')) nav.click();

    if(action.kind === 'call'){
      // Déjà choisi d'un toucher (bouton de la confirmation) : on appelle.
      if(toucher){ startCall(action.email, action.name, action.type); return; }
      // Antso mivantana : ny fangatahana kamera dia mitaky tsindry an-tanana,
      // ka bokotra no aseho fa tsy antso mandeha ho azy.
      showLinkActionPrompt(
        '📞 Antso amin\'i ' + action.name,
        'Tsindrio mba hanomboka ny antso ' + (action.type === 'audio' ? 'feo' : 'video') + '.',
        'Antsoy izao',
        function(){ startCall(action.email, action.name, action.type); }
      );
      return;
    }

    // Live : on ne renonce pas. Ou bien le direct est déjà là, ou bien on
    // attend qu'il commence — et l'entrée se fait toute seule à ce moment.
    waitAndJoinLive(action.email, action.name);
  }

  // Surveille la présence jusqu'à ce que l'hôte passe en direct, puis fait
  // entrer. Le message reste affiché entre-temps, pour que la personne sache
  // qu'elle attend et non qu'elle s'est trompée.
  let liveWaitTimer = null;
  function waitAndJoinLive(email, name){
    const already = presenceState[email];
    if(already && already.live){ joinLive(email, already.name || name); return; }

    const box = showLinkActionPrompt(
      '🔴 Live an\'i ' + name,
      'Miandry ny fanombohan\'ny Live… Tafiditra ho azy ianao raha vao manomboka izy. ' +
      'Azonao atao ny mijanona eto.',
      null, null
    );

    if(liveWaitTimer) clearInterval(liveWaitTimer);
    liveWaitTimer = setInterval(function(){
      const p = presenceState[email];
      if(p && p.live){
        clearInterval(liveWaitTimer);
        liveWaitTimer = null;
        if(box) box.remove();
        joinLive(email, p.name || name);
      }
    }, 1500);
  }

  // ---------------- LE DIRECT ANNONCÉ AILLEURS ----------------
  //
  // Le lien parti sur WhatsApp, Facebook ou Telegram (announceLiveOnNetworks)
  // tombe chez quelqu'un dont l'application n'est pas ouverte — souvent chez
  // quelqu'un qui n'a pas de compte du tout. Il touche le lien, et voit
  // l'écran de connexion, comme n'importe quel jour : rien ne dit qu'un direct
  // l'attend derrière, ni que le lien a fait ce qu'il devait faire. On
  // referme, et le direct se passe sans lui.
  //
  // Le bandeau le dit, par-dessus tout le reste — le mot de bienvenue compris,
  // qui recouvrait la page entière — et fait entrer d'un bouton : l'essai
  // libre tant qu'il dure, l'écran de connexion sinon. Une fois dedans,
  // runPendingLinkAction fait le reste : le direct s'ouvre tout seul, et si
  // l'hôte n'a pas encore commencé, l'entrée se fera à la seconde où il
  // commencera.
  function annoncerLeLiveALaPorte(){
    const action = pendingLinkAction();
    if(!action) return;
    // Déjà entré : openApp s'en occupe, le bandeau ferait double emploi.
    const ecran = document.getElementById('appScreen');
    if(ecran && getComputedStyle(ecran).display !== 'none') return;
    if(document.getElementById('liveALaPorte')) return;

    const direct = action.kind === 'live';
    const bandeau = document.createElement('div');
    bandeau.id = 'liveALaPorte';
    bandeau.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:9500; ' +
      'background:#e5484d; color:#fff; padding:0.7rem 1rem; display:flex; gap:0.7rem; ' +
      'align-items:center; justify-content:center; flex-wrap:wrap; text-align:center; ' +
      'font-size:0.9rem; line-height:1.4; box-shadow:0 2px 12px rgba(0,0,0,0.35);';

    const mot = document.createElement('span');
    mot.innerHTML = direct
      ? '🔴 <strong>' + escapeHtml(action.name) + '</strong> dia manao Live direct — nasaina ianao.'
      : '📞 <strong>' + escapeHtml(action.name) + '</strong> dia miandry antso avy aminao.';
    bandeau.appendChild(mot);

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'btn btn-sm';
    bouton.style.cssText = 'width:auto; background:#fff; color:#e5484d; border:none; font-weight:700;';
    bouton.textContent = direct ? '▶️ Miditra hijery izao' : '📞 Miditra hiantso';
    bouton.addEventListener('click', function(){
      if(typeof closeWelcome === 'function') closeWelcome(false);
      // L'essai libre ouvre sans compte : c'est le plus court chemin entre le
      // lien reçu et le direct.
      if(typeof inFreeEntryWindow === 'function' && inFreeEntryWindow() &&
         typeof entrerSansCompte === 'function'){
        entrerSansCompte();
        return;
      }
      // Passé l'essai libre, il faut un compte. On ne peut pas entrer à sa
      // place — on lui ouvre la porte et on lui dit ce qui arrivera ensuite.
      // L'écran de connexion est remis en place sans condition : l'essai libre
      // l'efface au démarrage, et il serait resté caché derrière rien.
      const porte = document.getElementById('loginScreen');
      if(porte) porte.style.display = 'flex';
      if(typeof showLoginMode === 'function') showLoginMode('quick');
      mot.innerHTML = (direct ? '🔴 ' : '📞 ') + 'Midira eto ambany — ' +
        'tafiditra ho azy ianao avy eo.';
      bouton.style.display = 'none';
      // « Bon retour » a son propre champ : loginEmail est celui de la
      // première inscription, et il est caché dans ce mode-là.
      const champ = document.getElementById('quickEmail') || document.getElementById('loginEmail');
      if(champ) champ.focus();
    });
    bandeau.appendChild(bouton);

    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'btn btn-sm';
    fermer.style.cssText = 'width:auto; background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.6);';
    fermer.textContent = '✕';
    fermer.addEventListener('click', function(){ bandeau.remove(); });
    bandeau.appendChild(fermer);

    document.body.appendChild(bandeau);

    // Entré, le bandeau n'a plus rien à annoncer : ce qui suit se passe dans
    // l'application elle-même.
    if(ecran && window.MutationObserver){
      const oeil = new MutationObserver(function(){
        if(getComputedStyle(ecran).display !== 'none'){
          oeil.disconnect();
          bandeau.remove();
        }
      });
      oeil.observe(ecran, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  // Une session déjà ouverte met un instant à se retrouver : sans ce délai, le
  // bandeau paraîtrait puis disparaîtrait aussitôt, chez quelqu'un qui n'avait
  // rien à faire de lui.
  function veillerSurLaPorte(){ setTimeout(annoncerLeLiveALaPorte, 1500); }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', veillerSurLaPorte);
  } else {
    veillerSurLaPorte();
  }

  // Bandeau kely eo ambonin'ny "Live & Appels" ho an'ny rohy nozaraina.
  function showLinkActionPrompt(title, text, btnLabel, onClick){
    const host = document.getElementById('liveJoinChoices');
    if(!host) return;
    host.style.display = 'block';
    const box = document.createElement('div');
    box.className = 'notif-optin';
    box.innerHTML = '<span><strong>' + escapeHtml(title) + '</strong> — ' + escapeHtml(text) + '</span>';
    if(btnLabel && onClick){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-red btn-sm';
      btn.style.width = 'auto';
      btn.textContent = btnLabel;
      btn.addEventListener('click', function(){ box.remove(); onClick(); });
      box.appendChild(btn);
    }
    host.insertBefore(box, host.firstChild);
    return box;
  }

  // Le lien unique « confirmation » : il mène aux boutons (montrerLesChoix).
  function confirmationLink(){
    const me = myIdentity();
    const base = (typeof appShareLink === 'function') ? appShareLink() : window.location.href;
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'rohy=' + encodeURIComponent(me.email) + '&name=' + encodeURIComponent(me.name);
  }

  // Rohy antso : ny mpanjifa manokatra azy dia tonga dia manomboka antso aminao.
  function callInviteLink(type){
    const me = myIdentity();
    const base = (typeof appShareLink === 'function') ? appShareLink() : window.location.href;
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'call=' + encodeURIComponent(me.email) +
      '&type=' + (type === 'audio' ? 'audio' : 'video') +
      '&name=' + encodeURIComponent(me.name);
  }

  // Onglet « Appel vidéo » au centre de la rangée Accueil / Articles.
  // C'est un vrai lien : on peut le copier ou le partager pour qu'un client
  // appelle directement. Touché dans l'application, il lance l'appel plutôt
  // que de recharger la page — et le propriétaire, lui, est mené à sa
  // section « Live & Appels » (s'appeler soi-même n'aurait pas de sens).
  const videoCallTab = document.getElementById('videoCallTab');
  if(videoCallTab){
    function refreshVideoCallTabLink(){
      try{ videoCallTab.href = callInviteLink('video'); }catch(e){}
    }
    refreshVideoCallTabLink();
    videoCallTab.addEventListener('click', function(e){
      e.preventDefault();
      refreshVideoCallTabLink();
      const me = myIdentity();
      if(me.isAdmin){
        // L'onglet « Appel vidéo » mène aux appels, pas au Live.
        const navAppels = document.querySelector('.nav-item[data-section="appels"]');
        if(navAppels) navAppels.click();
        return;
      }
      const presence = (typeof presenceState === 'object')
        ? presenceState[OWNER_EMAIL.toLowerCase()] : null;
      startCall(OWNER_EMAIL.toLowerCase(), (presence && presence.name) || 'Admin', 'video');
    });
  }

  const shareCallLinkBtn = document.getElementById('shareCallLinkBtn');
  if(shareCallLinkBtn){
    shareCallLinkBtn.addEventListener('click', function(){
      if(typeof shareContent !== 'function') return;
      shareContent({
        title: 'Antso video — Ny asako',
        text: '📹 Tsindrio ity rohy ity dia miantso ahy mivantana amin\'ny video ianao :',
        url: callInviteLink('video')
      });
    });
  }

  const copyCallLinkBtn = document.getElementById('copyCallLinkBtn');
  if(copyCallLinkBtn){
    copyCallLinkBtn.addEventListener('click', function(){
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(callInviteLink('video'));
      const original = copyCallLinkBtn.textContent;
      copyCallLinkBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyCallLinkBtn.textContent = original; }, 1800);
    });
  }

  const startLiveBtn = document.getElementById('startLiveBtn');
  if(startLiveBtn) startLiveBtn.addEventListener('click', startLive);
  const stopLiveBtn = document.getElementById('stopLiveBtn');
  if(stopLiveBtn) stopLiveBtn.addEventListener('click', stopLive);

  // Fizarana ny rohy mandritra ny Live : azo averina impiry impiry, mba
  // hahatongavan'ny fanasana amin'ny mpanjifa tsirairay na dia efa nanomboka aza.
  const shareLiveBtn = document.getElementById('shareLiveBtn');
  if(shareLiveBtn){
    shareLiveBtn.addEventListener('click', function(){
      announceLiveOnNetworks(myLive ? myLive.name : myIdentity().name);
    });
  }

  // Les mêmes gestes, mais disponibles AVANT le direct : on prévient ses
  // clients d'abord, on ouvre la caméra ensuite.
  const shareLiveBeforeBtn = document.getElementById('shareLiveBeforeBtn');
  if(shareLiveBeforeBtn){
    shareLiveBeforeBtn.addEventListener('click', function(){
      announceLiveOnNetworks(myIdentity().name);
    });
  }

  const copyLiveLinkBeforeBtn = document.getElementById('copyLiveLinkBeforeBtn');
  if(copyLiveLinkBeforeBtn){
    copyLiveLinkBeforeBtn.addEventListener('click', function(){
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(liveJoinLink());
      const original = copyLiveLinkBeforeBtn.textContent;
      copyLiveLinkBeforeBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyLiveLinkBeforeBtn.textContent = original; }, 1800);
    });
  }

  const copyLiveLinkBtn = document.getElementById('copyLiveLinkBtn');
  if(copyLiveLinkBtn){
    copyLiveLinkBtn.addEventListener('click', function(){
      const link = liveJoinLink();
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(link);
      const original = copyLiveLinkBtn.textContent;
      copyLiveLinkBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyLiveLinkBtn.textContent = original; }, 1800);
    });
  }
  const leaveLiveBtn = document.getElementById('leaveLiveBtn');
  if(leaveLiveBtn) leaveLiveBtn.addEventListener('click', leaveLive);
  const liveChatSendBtn = document.getElementById('liveChatSendBtn');
  if(liveChatSendBtn){
    liveChatSendBtn.addEventListener('click', function(){
      const input = document.getElementById('liveChatInput');
      const text = input.value.trim();
      if(!text) return;
      sendLiveChat(text);
      appendLiveChatMessage({ fromName: myIdentity().name + ' (ianao)', text: text });
      input.value = '';
    });
  }
  const liveChatInput = document.getElementById('liveChatInput');
  if(liveChatInput){
    liveChatInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') liveChatSendBtn.click();
    });
  }

  function teardownRealtimeFeatures(){
    if(activeCall) hangupCall();
    if(myLive) stopLive();
    if(watchingLive) leaveLive();
    if(presenceChannel){ try{ presenceChannel.unsubscribe(); }catch(e){} presenceChannel = null; }
    if(callSignalChannel){ try{ callSignalChannel.unsubscribe(); }catch(e){} callSignalChannel = null; }
    if(liveSignalChannel){ try{ liveSignalChannel.unsubscribe(); }catch(e){} liveSignalChannel = null; }
    // Une attente de Live qui survit à la déconnexion continuerait d'interroger
    // une présence qui n'est plus tenue à jour.
    if(liveWaitTimer){ clearInterval(liveWaitTimer); liveWaitTimer = null; }
    presenceState = {};
  }

  window.addEventListener('beforeunload', function(){
    if(activeCall) sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail });
    if(myLive){
      Object.keys(myLive.viewers).forEach(function(v){ sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v }); });
    }
    if(watchingLive) sendLiveSignal({ kind: 'leave', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email });
  });


  // Ny pejy « 📞 Call » dia mety misokatra tsy amin'ny menu (fenêtre averina
  // avy amin'ny icône, sns) : averina amboarina isaky ny miseho izy, mba
  // hampiseho ny lisitry ny admin raha vao fantatra fa admin no miditra.
  // Toy izany koa ny pejy « 💬 Message ».
  ['section-appels', 'section-serviceclient'].forEach(function(id){
    const section = document.getElementById(id);
    if(!section || !window.MutationObserver) return;
    let tamin = false;
    new MutationObserver(function(){
      const hita = section.classList.contains('active');
      if(hita && !tamin){
        renderOnlineClientsForCall();
        if(typeof renderContactButtons === 'function') renderContactButtons();
      }
      tamin = hita;
    }).observe(section, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  // ---------------- MPITSIDIKA TSY NIDITRA ----------------
  // Ny olona manokatra ny site fotsiny, na tsy nanao inscription aza, dia
  // hita ao amin'ny « 👀 Miditra ankehitriny » an'ny admin : azo antsoina sy
  // andefasana hafatra avy hatrany. Ny varavarankelin'ny antso dia ao anaty
  // appScreen, izay miafina amin'ny pejy fidirana : afindra ao amin'ny body.
  (function(){
    function manomboka(){
      const overlay = document.getElementById('callOverlay');
      if(overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);
      if(!window.__sb) return;
      initPresence();
      initCallSignaling();
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(manomboka, 1500); });
    else setTimeout(manomboka, 1500);
  })();

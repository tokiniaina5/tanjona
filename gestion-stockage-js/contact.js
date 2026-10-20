  // ---------------- NOUS CONTACTER (visible à tous les clients) ----------------
  const STORAGE_CONTACT_CHANNELS = 'stockmanager_contact_channels';
  const STORAGE_CONTACT_EXTRA = 'stockmanager_contact_extra';
  // Fifandraisan'ny champ admin sy ny clé voatahiry. Ny endrika sy ny fitondran'ny
  // bokotra dia voafaritra ao amin'ny renderContactButtons, araka ny vondrona.
  const CONTACT_FIELD_MAP = [
    // L'adresse publique du site n'a plus de case (20/10/2026) : vide en base,
    // elle laissait les liens partagés sur ny-asako.netlify.app (inviter.js),
    // ce qu'ils font tout seuls. La colonne site_url reste, et n'est plus écrite.
    // Les coordonnées de paiement (PayPal, carte, virement, Mobile Money) ne
    // sont plus demandées : le déblocage se règle avec les crédits du
    // portefeuille, sans que rien ne sorte de l'application. Les colonnes
    // restent en base pour l'historique déjà enregistré.
    { key: 'whatsapp', inputId: 'contactWhatsappInput' },
    { key: 'facebook', inputId: 'contactFacebookInput' },
    { key: 'instagram', inputId: 'contactInstagramInput' },
    { key: 'tiktok', inputId: 'contactTiktokInput' },
    { key: 'threads', inputId: 'contactThreadsInput' },
    { key: 'twitter', inputId: 'contactTwitterInput' },
    { key: 'wechat', inputId: 'contactWechatInput' }
  ];

  // Cache locale (fallback hors-ligne / si Supabase indisponible) : ne fait PAS foi,
  // sert uniquement à ne pas afficher un écran vide pendant le chargement réseau.
  function loadContactChannelsLocal(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CONTACT_CHANNELS)) || {}; }
    catch(e){ return {}; }
  }
  function saveContactChannelsLocal(obj){ localStorage.setItem(STORAGE_CONTACT_CHANNELS, JSON.stringify(obj)); }
  function loadContactExtraLocal(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CONTACT_EXTRA)) || []; }
    catch(e){ return []; }
  }
  function saveContactExtraLocal(list){ localStorage.setItem(STORAGE_CONTACT_EXTRA, JSON.stringify(list)); }

  // Va chercher les canaux configurés par l'admin sur le serveur (Supabase), pour
  // qu'ils soient visibles par TOUS les clients, quel que soit leur appareil.
  function fetchContactChannels(callback){
    if(!window.__sb){
      callback(loadContactChannelsLocal(), loadContactExtraLocal());
      return;
    }
    Promise.all([
      window.__sb.from('contact_channels').select('*').eq('id', 1).maybeSingle(),
      window.__sb.from('contact_extra_channels').select('id,name,url').order('created_at', { ascending: true })
    ]).then(function(results){
      const chRes = results[0], exRes = results[1];
      const channels = (chRes && chRes.data) ? chRes.data : loadContactChannelsLocal();
      const extra = (exRes && exRes.data) ? exRes.data : loadContactExtraLocal();
      saveContactChannelsLocal(channels);
      saveContactExtraLocal(extra);
      callback(channels, extra);
    }, function(){
      callback(loadContactChannelsLocal(), loadContactExtraLocal());
    });
  }

  // ---------------- BOKOTRA "Nous contacter" ----------------
  // Ny canal rehetra voarafitra dia atambatra ho BOKOTRA TELO ihany ho an'ny
  // mpanjifa : 📞 Antso · 📹 Antso video · ↗️ Partage. Rehefa tsindriana dia
  // aseho ny lisitry ny canal misokatra ho an'io asa io ; raha iray ihany no
  // misy dia mandeha avy hatrany fa tsy misy lisitra.
  // Fetra teknika : ny antso video tena mivantana dia ny WebRTC "Ao anaty appli"
  // ihany — tsy misy rohy web ofisialy manomboka antso video WhatsApp/Messenger.
  function openUrl(url){ return function(){ window.open(url, '_blank'); }; }
  function dialNumber(digits){
    // Ny nomerao an-toerana (03X…) avela toy izany fa mety amin'ny antso.
    return function(){ window.location.href = 'tel:' + (digits.charAt(0) === '0' ? digits : '+' + digits); };
  }
  function copyIdentifier(name, value){
    return function(){
      copyToClipboardSilently(value);
      alert('Identifiant copié : ' + value + '. Ouvrez ' + name + ' et recherchez ce contact.');
    };
  }

  // Lisitra hisafidianana rehefa maro ny canal misokatra ho an'ny asa iray.
  function openChannelChooser(title, hint, options){
    const existing = document.getElementById('channelChooserOverlay');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'channelChooserOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; ' +
      'align-items:center; justify-content:center; z-index:210; padding:1rem;';

    const box = document.createElement('div');
    box.className = 'panel';
    box.style.cssText = 'max-width:380px; width:100%; margin:0;';
    const h = document.createElement('h3');
    h.textContent = title;
    box.appendChild(h);
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.78rem; color:var(--muted); margin-bottom:0.8rem;';
    p.textContent = hint;
    box.appendChild(p);

    options.forEach(function(opt){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm';
      btn.style.cssText = 'width:100%; margin-bottom:0.5rem;';
      btn.style.borderColor = opt.color;
      btn.style.color = opt.color;
      btn.textContent = opt.label;
      btn.addEventListener('click', function(){ overlay.remove(); opt.run(); });
      box.appendChild(btn);
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-sm';
    close.style.cssText = 'width:auto; margin-top:0.4rem;';
    close.textContent = 'Fermer';
    close.addEventListener('click', function(){ overlay.remove(); });
    box.appendChild(close);

    overlay.appendChild(box);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function runOrChoose(title, hint, options){
    if(!options.length) return;
    if(options.length === 1){ options[0].run(); return; }
    openChannelChooser(title, hint, options);
  }

  // Antso ao anaty appli (WebRTC) mankany amin'ny mpitantana : io ihany no antso
  // video tena mivantana. Mila serveur (Supabase), tsy ho an'ny admin (izy no antsoina).
  function inAppCallOption(type){
    if(!window.__sb) return null;
    const me = (typeof myIdentity === 'function') ? myIdentity() : { isAdmin: false };
    if(me.isAdmin) return null;
    return {
      label: '📲 Ao anaty appli (mivantana)',
      color: 'var(--cyan)',
      run: function(){
        const p = (typeof presenceState === 'object') ? presenceState[OWNER_EMAIL.toLowerCase()] : null;
        startCall(OWNER_EMAIL.toLowerCase(), (p && p.name) || 'Admin', type);
      }
    };
  }

  function updateOwnerPresenceLabel(){
    const status = document.getElementById('ownerPresenceLabel');
    if(!status) return;
    const online = (typeof presenceState === 'object') && !!presenceState[OWNER_EMAIL.toLowerCase()];
    status.textContent = online ? '🟢 Miditra ankehitriny' : '⚪ Tsy miditra ankehitriny';
  }

  function renderContactButtons(){
    const row = document.getElementById('contactMainActions');
    if(!row) return;
    fetchContactChannels(function(channels, extra){
      row.innerHTML = '';
      // Ny site_url dia mety vao tonga avy amin'ny serveur : averina amboarina ny
      // rohy invitation mba tsy hijanona amin'ny adiresy an-toerana.
      if(typeof setupInviteLink === 'function') setupInviteLink();

      const voice = [], video = [];
      const inAppVoice = inAppCallOption('audio');
      const inAppVideo = inAppCallOption('video');
      if(inAppVoice) voice.push(inAppVoice);
      if(inAppVideo) video.push(inAppVideo);

      const phone = (channels.whatsapp || '').replace(/[^\d]/g, '');
      if(phone){
        const wa = 'https://wa.me/' + toInternationalNumber(phone);
        voice.push({ label: '☎️ Antso an-tariby', color: '#25D366', run: dialNumber(phone), tel: true, rohy: phone });
        voice.push({ label: '💬 WhatsApp', color: '#25D366', run: openUrl(wa), rohy: wa });
        video.push({ label: '💬 WhatsApp', color: '#25D366', run: openUrl(wa) });
      }

      // Une adresse qui n'est pas un profil n'est pas montrée : elle ouvrirait
      // le compte du client lui-même (voir verifierLAdresse). L'admin, lui, le
      // lit en toutes lettres dans son formulaire.
      const fb = adresseDeProfil('facebook', channels.facebook);
      const messenger = fb ? facebookToMessenger(fb) : null;
      if(messenger){
        voice.push({ label: '📘 Messenger', color: '#1877F2', run: openUrl(messenger), rohy: messenger });
        video.push({ label: '📘 Messenger', color: '#1877F2', run: openUrl(messenger) });
      }

      // Canal tsy mahavita antso : hafatra na profil, ampidirina ao amin'ny "Antso"
      // mba tsy ho very — afaka manoratra any ny mpanjifa.
      if(fb && !messenger){
        voice.push({ label: '📘 Facebook', color: '#1877F2', run: openUrl(fb), rohy: fb });
      }
      [
        { key: 'instagram', label: '📸 Instagram', color: '#E1306C' },
        { key: 'tiktok', label: '🎵 TikTok', color: '#e7e9ea' },
        { key: 'threads', label: '🧵 Threads', color: '#e7e9ea' },
        { key: 'twitter', label: '✖️ X (Twitter)', color: '#e7e9ea' }
      ].forEach(function(f){
        const url = adresseDeProfil(f.key, channels[f.key]);
        if(url) voice.push({ label: f.label, color: f.color, run: openUrl(url), rohy: url });
      });
      const wechat = (channels.wechat || '').trim();
      if(wechat){
        voice.push({ label: '💚 WeChat', color: '#07C160', run: copyIdentifier('WeChat', wechat), rohy: wechat });
      }

      (extra || []).forEach(function(item){
        if(!item || !item.name) return;
        const value = (item.url || '').trim();
        if(/^https?:\/\//i.test(value)){
          // Même règle pour un canal ajouté à la main : « web.telegram.org »
          // ouvre le Telegram du client, pas le vôtre.
          const propre = adresseDeProfil('', value);
          // Un nom avec une espace (« t.me/tokiniaina tanjona ») n'ouvre personne.
          if(propre && !/\s/.test(propre)) voice.push({ label: item.name, color: 'var(--cyan)', run: openUrl(propre), rohy: propre });
          return;
        }
        // viber://, mailto: : un lien d'application, à ouvrir tel quel — et
        // non un numéro à composer, malgré les chiffres qu'il contient.
        if(/^(viber|mailto|tg|sgnl):/i.test(value)){
          voice.push({ label: item.name, color: 'var(--cyan)', run: openUrl(value), rohy: value });
          return;
        }
        const digits = value.replace(/[^\d]/g, '');
        if(digits.length >= 7){
          voice.push({ label: '☎️ ' + item.name, color: 'var(--cyan)', run: dialNumber(digits), tel: true, rohy: value });
          video.push({ label: item.name, color: 'var(--cyan)', run: openUrl('https://wa.me/' + toInternationalNumber(digits)) });
          return;
        }
        voice.push({
          label: item.name,
          color: 'var(--cyan)', rohy: value,
          run: value ? copyIdentifier(item.name, value)
                     : function(){ alert('Ouvrez ' + item.name + ' pour nous contacter.'); }
        });
      });

      function addMainButton(label, color, onClick){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.style.width = 'auto';
        btn.style.borderColor = color;
        btn.style.color = color;
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        row.appendChild(btn);
      }

      if(voice.length){
        addMainButton('📞 Antso', '#25D366', function(){
          runOrChoose('📞 Antso', 'Safidio ny canal hiantsoana.', voice);
        });
      }
      if(video.length){
        addMainButton('📹 Antso video', '#1877F2', function(){
          runOrChoose('📹 Antso video', 'Safidio ny canal hanaovana antso video.', video);
        });
      }
      // Fizarana : mitovy amin'ny "↗️ Partager" ao amin'ny Accueil — feuille native
      // amin'ny telefaonina, menu tambajotra raha tsy misy.
      addMainButton('↗️ Partage', 'var(--cyan)', function(){
        if(typeof shareContent === 'function'){
          shareContent({
            title: 'Ny asako',
            text: 'Jereo ity appli fitantanana stock ity :'
          });
        }
      });

      // Statut an'ny mpitantana, raha misy ny antso ao anaty appli.
      if(inAppVoice || inAppVideo){
        const status = document.createElement('span');
        status.id = 'ownerPresenceLabel';
        status.style.cssText = 'font-size:0.75rem; color:var(--muted); align-self:center;';
        row.appendChild(status);
        updateOwnerPresenceLabel();
      }

      document.getElementById('contactButtonsEmptyHint').style.display =
        (voice.length || video.length) ? 'none' : 'block';

      // Pejy « 📞 Call » : antso ao anaty appli (feo sy video) aloha, avy eo
      // ny canal rehetra voarafitra, tsy misy lisitra hisafidianana.
      const callRow = document.getElementById('callCanaux');
      if(callRow){
        callRow.innerHTML = '';
        const liens = [];
        // Ny admin no antsoin'ny mpanjifa ; izy kosa misafidy amin'ireo
        // miditra ankehitriny izay hantsoiny.
        // Jerena rehefa tsindriana : mety mbola tsy fantatra hoe admin ve
        // rehefa vao nalaina ny canal.
        function antso(type){
          return function(){
            const me = (typeof myIdentity === 'function') ? myIdentity() : { isAdmin: false };
            if(!me.isAdmin){
              const p = (typeof presenceState === 'object') ? presenceState[OWNER_EMAIL.toLowerCase()] : null;
              startCall(OWNER_EMAIL.toLowerCase(), (p && p.name) || 'Admin', type);
              return;
            }
            const ireo = (typeof presenceState === 'object') ? Object.keys(presenceState).filter(function(email){ return email !== me.email; }) : [];
            if(!ireo.length){ alert('Tsy misy olona miditra ankehitriny.'); return; }
            runOrChoose(type === 'video' ? '📹 Antso video' : '📞 Appel mivantana', 'Safidio izay hantsoina.',
              ireo.map(function(email){
                const p = presenceState[email] || {};
                return { label: p.name || email, color: 'var(--cyan)', run: function(){ startCall(email, p.name || email, type); } };
              }));
          };
        }
        if(window.__sb){
          liens.push({ label: '📞 Appel mivantana', color: '#25D366', run: antso('audio') });
          liens.push({ label: '📹 Antso video', color: '#1877F2', run: antso('video') });
        }
        // Ary ny rohy rehetra nampidirina tao amin'ny « 🔗 Ajouter les liens ».
        voice.forEach(function(o){ if(o !== inAppVoice) liens.push(o); });
        liens.forEach(function(opt){
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn';
          btn.style.width = '100%';
          btn.style.textAlign = 'left';
          btn.style.borderColor = opt.color;
          btn.style.color = opt.color;
          btn.textContent = opt.label;
          // Ny rohy (na laharana) eo ambanin'ny anarany.
          if(opt.rohy){
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'flex-start';
            const sous = document.createElement('span');
            sous.style.cssText = 'display:block; font-size:0.72rem; color:var(--muted); margin-top:0.15rem; ' +
              'max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            sous.textContent = String(opt.rohy).replace(/^https?:\/\/(www\.)?/i, '');
            btn.appendChild(sous);
          }
          btn.addEventListener('click', opt.run);
          callRow.appendChild(btn);
        });
        document.getElementById('callCanauxEmpty').style.display = liens.length ? 'none' : 'block';
      }
    });
  }

  // wa.me dia tsy mandray afa-tsy nomerao amin'ny endrika iraisam-pirenena.
  // Ny nomerao malagasy nosoratana "0343705834" dia ovaina ho "261343705834".
  function toInternationalNumber(raw){
    let d = String(raw || '').replace(/[^\d]/g, '');
    if(d.indexOf('00') === 0) d = d.slice(2);
    if(d.length === 10 && d.charAt(0) === '0') d = '261' + d.slice(1);
    return d;
  }

  // ---------------- L'ADRESSE D'UN PROFIL, ET CE QUI N'EN EST PAS UN ----------------
  //
  // Ce qu'on attend dans ces cases, c'est l'adresse publique d'un profil :
  // celle qu'on donne à quelqu'un pour qu'il vous trouve. Ce qu'on y colle,
  // c'est ce que la barre d'adresse affichait quand on est allé chercher —
  // « facebook.com/home.php », « instagram.com/direct/inbox/ »,
  // « tiktok.com/live », « web.telegram.org/a/ ». Ces adresses s'ouvrent très
  // bien, et c'est le piège : elles ouvrent le compte de CELUI QUI CLIQUE.
  // Le client arrive sur son propre fil, ne comprend pas, et referme.
  //
  // On les reconnaît à leur première tranche de chemin : ce sont des pages de
  // l'application, jamais le nom de quelqu'un. La liste ne dit que ce dont on
  // est sûr — une adresse inconnue passe, il vaut mieux laisser entrer une
  // adresse étrange que refuser un vrai profil.
  //
  // Et puisque le nom suffit — c'est lui qu'on connaît de soi, pas l'adresse
  // — on l'accepte tout court : « tanjona » ou « @tanjona » devient l'adresse
  // du réseau où on l'a écrit.
  const PROFILS_RESEAUX = {
    facebook: {
      nom: 'Facebook',
      hotes: ['facebook.com', 'fb.com', 'fb.me'],
      refusees: ['home.php', 'home', 'feed', 'login.php', 'login', 'me', 'friends',
        'notifications', 'messages', 'marketplace', 'watch', 'settings', 'search',
        'sharer.php', 'share.php', 'bookmarks', 'events', 'reels', 'pages', 'people'],
      // « profile.php?id=… » n'est pas une page de l'application : c'est bien
      // quelqu'un, désigné par son numéro faute de nom choisi.
      exception: function(u){ return /[?&]id=\d+/.test(u.search); },
      depuisLeNom: function(n){ return 'https://www.facebook.com/' + n; },
      modele: 'https://www.facebook.com/votrenom'
    },
    instagram: {
      nom: 'Instagram',
      hotes: ['instagram.com'],
      refusees: ['direct', 'explore', 'accounts', 'reels', 'stories', 'p', 'tv', 'inbox'],
      depuisLeNom: function(n){ return 'https://www.instagram.com/' + n; },
      modele: 'https://www.instagram.com/votrenom'
    },
    tiktok: {
      nom: 'TikTok',
      hotes: ['tiktok.com'],
      refusees: ['live', 'foryou', 'following', 'explore', 'search', 'upload', 'messages'],
      depuisLeNom: function(n){ return 'https://www.tiktok.com/@' + n; },
      modele: 'https://www.tiktok.com/@votrenom'
    },
    threads: {
      nom: 'Threads',
      hotes: ['threads.net', 'threads.com'],
      refusees: ['search', 'activity'],
      depuisLeNom: function(n){ return 'https://www.threads.net/@' + n; },
      modele: 'https://www.threads.net/@votrenom'
    },
    twitter: {
      nom: 'X (Twitter)',
      hotes: ['x.com', 'twitter.com'],
      refusees: ['home', 'explore', 'notifications', 'messages', 'i', 'search',
        'settings', 'compose'],
      depuisLeNom: function(n){ return 'https://x.com/' + n; },
      modele: 'https://x.com/votrenom'
    }
  };

  // Les applications web des autres réseaux : elles n'ont même pas de première
  // tranche à examiner — l'adresse entière ouvre le compte de qui clique.
  const APPLICATIONS_WEB = [
    { hotes: ['web.telegram.org', 'desktop.telegram.org'], nom: 'Telegram', modele: 'https://t.me/votrenom' },
    { hotes: ['web.whatsapp.com'], nom: 'WhatsApp', modele: 'https://wa.me/261340000000' },
    { hotes: ['web.facebook.com'], nom: 'Facebook', modele: 'https://www.facebook.com/votrenom' }
  ];

  function hoteNu(hote){
    return String(hote || '').toLowerCase().replace(/^(www|m|mobile|web)\./, '');
  }

  // Les hôtes qu'on sait reconnaître : ils disent qu'on a affaire à une
  // adresse et non à un nom.
  const HOTES_CONNUS = ['facebook.com', 'fb.com', 'fb.me', 'm.me', 'messenger.com',
    'instagram.com', 'tiktok.com', 'threads.net', 'threads.com', 'x.com', 'twitter.com',
    't.me', 'telegram.org', 'wa.me', 'whatsapp.com'];

  // « tanjona », « @tanjona », « jean.dupont » : un nom, et non une adresse.
  // Le point ne tranche pas — un nom Facebook en porte presque toujours un.
  // Ce qui tranche, c'est la barre oblique, le « https:// », ou un hôte qu'on
  // reconnaît.
  function estUnNomSeul(valeur){
    const v = String(valeur || '').trim();
    if(!v) return false;
    if(v.charAt(0) === '@') return true;
    if(/^https?:\/\//i.test(v)) return false;
    if(v.indexOf('/') >= 0 || v.indexOf(' ') >= 0) return false;
    const bas = v.toLowerCase();
    for(let i = 0; i < HOTES_CONNUS.length; i++){
      const h = HOTES_CONNUS[i];
      if(bas === h || bas.slice(-(h.length + 1)) === '.' + h) return false;
    }
    return true;
  }

  // Renvoie { valeur, souci } : l'adresse telle qu'il faut l'enregistrer, et
  // ce qui cloche s'il y a lieu. La clef est celle du réseau (« facebook »…) ;
  // sans clef — un canal ajouté à la main — on reconnaît le réseau à son hôte.
  function verifierLAdresse(cle, brut){
    const v = String(brut || '').trim();
    if(!v) return { valeur: '', souci: '' };

    const reseau = PROFILS_RESEAUX[cle] || null;
    if(reseau && estUnNomSeul(v)){
      return { valeur: reseau.depuisLeNom(v.replace(/^@/, '')), souci: '' };
    }

    let u;
    try { u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); }
    catch(e){ return { valeur: v, souci: '' }; }

    // « www.facebook.com/tanjona », sans le « https:// », n'est pas une adresse
    // pour le navigateur : il la chercherait dans notre propre site, où elle
    // n'existe pas. On le remet.
    const propre = /^https?:\/\//i.test(v) ? v : 'https://' + v;
    const hote = hoteNu(u.hostname);
    for(let i = 0; i < APPLICATIONS_WEB.length; i++){
      const app = APPLICATIONS_WEB[i];
      if(app.hotes.indexOf(String(u.hostname).toLowerCase()) >= 0){
        return { valeur: v, souci: 'cette adresse est l\'application web de ' + app.nom +
          ' : elle ouvre le compte de celui qui clique, pas le vôtre. Écrivez votre nom, ' +
          'ou l\'adresse de votre profil (' + app.modele + ').' };
      }
    }

    // Sans clef, on cherche le réseau à qui appartient l'hôte.
    let ref = reseau;
    if(!ref){
      const cles = Object.keys(PROFILS_RESEAUX);
      for(let i = 0; i < cles.length && !ref; i++){
        if(PROFILS_RESEAUX[cles[i]].hotes.indexOf(hote) >= 0) ref = PROFILS_RESEAUX[cles[i]];
      }
    }
    if(!ref) return { valeur: propre, souci: '' };

    const premiere = decodeURIComponent(u.pathname.split('/').filter(Boolean)[0] || '')
      .replace(/^@/, '').toLowerCase();
    if(!premiere){
      return { valeur: v, souci: 'cette adresse est l\'accueil de ' + ref.nom +
        ', sans nom de profil. Écrivez votre nom, ou l\'adresse de votre profil (' +
        ref.modele + ').' };
    }
    if(ref.refusees.indexOf(premiere) >= 0 && !(ref.exception && ref.exception(u))){
      return { valeur: v, souci: '« ' + premiere + ' » est une page de ' + ref.nom +
        ', pas un profil : elle ouvre le compte de celui qui clique, pas le vôtre. ' +
        'Écrivez votre nom, ou l\'adresse de votre profil (' + ref.modele + ').' };
    }
    return { valeur: propre, souci: '' };
  }

  // L'adresse à montrer au client, ou rien. Un lien qui ne mène pas à vous ne
  // vaut pas mieux qu'un lien absent : il vaut moins, car on l'a suivi.
  function adresseDeProfil(cle, brut){
    const examen = verifierLAdresse(cle, brut);
    return examen.souci ? '' : examen.valeur;
  }

  // Ny URL Facebook dia ovaina ho rohy Messenger (m.me) raha azo atao, mba
  // hisokatra mivantana ilay resaka fa tsy ny pejy fotsiny.
  function facebookToMessenger(url){
    const m = String(url).match(/facebook\.com\/(?:profile\.php\?id=)?([^\/?#]+)/i);
    if(!m || !m[1]) return null;
    const slug = m[1].replace(/^@/, '');
    if(!slug || slug === 'people' || slug === 'pages') return null;
    // « m.me/home.php » ouvrait le Messenger de celui qui clique : les pages
    // de l'application n'ont pas de conversation derrière elles.
    if(PROFILS_RESEAUX.facebook.refusees.indexOf(slug.toLowerCase()) >= 0) return null;
    return 'https://m.me/' + slug;
  }

  // Passe les cases en revue. « corriger » réécrit ce qui peut l'être — un nom
  // seul devient l'adresse du réseau, sous les yeux de qui l'a écrit — et
  // renvoie ce qui reste à reprendre à la main.
  function examinerLesCanaux(corriger){
    const soucis = [];
    CONTACT_FIELD_MAP.forEach(function(field){
      const reseau = PROFILS_RESEAUX[field.key];
      if(!reseau) return;
      const input = document.getElementById(field.inputId);
      if(!input || !input.value.trim()) return;
      const examen = verifierLAdresse(field.key, input.value);
      if(corriger && !examen.souci && examen.valeur !== input.value.trim()) input.value = examen.valeur;
      if(examen.souci) soucis.push(reseau.nom + ' : ' + examen.souci);
    });
    return soucis;
  }

  function loadContactAdminForm(){
    fetchContactChannels(function(channels, extra){
      CONTACT_FIELD_MAP.forEach(function(field){
        const input = document.getElementById(field.inputId);
        if(input) input.value = channels[field.key] || '';
      });
      // Ce qui est déjà enregistré et ne mène pas à vous se dit à l'ouverture
      // du formulaire, et non à l'enregistrement suivant : ces adresses-là
      // sont en ligne depuis un moment, et personne ne les a vues échouer.
      const soucis = examinerLesCanaux(false);
      // Les canaux ajoutés à la main n'ont pas de case à reprendre : on les
      // remet, tout simplement. L'ancienne ligne n'est plus montrée à
      // personne, et la nouvelle prend sa place dans la liste.
      (extra || []).forEach(function(item){
        if(!item || !item.url) return;
        const examen = verifierLAdresse('', item.url);
        if(examen.souci){
          soucis.push((item.name || 'Canal') + ' : ' + examen.souci +
            ' Ajoutez-le à nouveau ci-dessous avec la bonne adresse.');
        }
      });
      const status = document.getElementById('contactChannelsStatus');
      if(status && soucis.length){
        status.textContent = '⚠️ ' + soucis.length + ' adresse' + (soucis.length > 1 ? 's' : '') +
          ' à reprendre (vos clients ne les voient pas) — ' + soucis.join(' · ');
      }
    });
  }

  const saveContactChannelsBtn = document.getElementById('saveContactChannelsBtn');
  if(saveContactChannelsBtn){
    loadContactAdminForm();
    saveContactChannelsBtn.addEventListener('click', function(){
      const status = document.getElementById('contactChannelsStatus');
      // On refuse avant d'écrire, et non après : enregistrée, l'adresse
      // paraîtrait acceptée et ne serait montrée à personne.
      const soucis = examinerLesCanaux(true);
      if(soucis.length){
        status.textContent = '⚠️ Rien n\'est enregistré — ' + soucis.join(' · ');
        return;
      }
      const channels = { id: 1 };
      CONTACT_FIELD_MAP.forEach(function(field){
        const input = document.getElementById(field.inputId);
        channels[field.key] = input ? input.value.trim() : '';
      });
      saveContactChannelsLocal(channels);
      if(!window.__sb){
        renderContactButtons();
        status.textContent = 'Enregistré localement (pas de connexion serveur) — vos clients ne le verront pas.';
        return;
      }
      // Supabase dia MANDEHA tsara (resolve) na dia tsy nahomby aza ny fanoratana :
      // ao amin'ny res.error no misy ny fahadisoana. Tsy maintsy jerena izany, raha
      // tsy izany dia milaza "Enregistré ✓" nefa tsy tafiditra na inona na inona.
      window.__sb.from('contact_channels').upsert(channels).then(function(res){
        renderContactButtons();
        if(res && res.error){
          status.textContent = "Échec de l'enregistrement serveur : " + (res.error.message || 'erreur inconnue');
          return;
        }
        status.textContent = 'Enregistré ✓ Visible par tous vos clients.';
        afficherLesEnregistres();
      }, function(err){
        renderContactButtons();
        status.textContent = "Échec de l'enregistrement serveur : " + ((err && err.message) || 'réessayez');
      });
    });
  }

  // ---------------- CE QUI EST ENREGISTRÉ ----------------
  // Sous « Enregistrer », tous les canaux tels que le serveur les garde —
  // ceux des cases et ceux ajoutés à la main — en logos : un carré à la
  // couleur du réseau, son nom dessous. On le touche pour essayer le lien
  // que le client ouvrira ; un canal à reprendre porte un ⚠️.
  // Les logos des réseaux (Simple Icons, CC0 — simpleicons.org), et leur couleur.
  const LOGOS = {
    whatsapp: ['#25D366', 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'],
    facebook: ['#0866FF', 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'],
    instagram: ['#E4405F', 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077'],
    tiktok: ['#000000', 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'],
    threads: ['#000000', 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z'],
    x: ['#000000', 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'],
    wechat: ['#07C160', 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z'],
    telegram: ['#26A5E4', 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'],
    messenger: ['#0084FF', 'M.001 11.639C.001 4.949 5.241 0 12.001 0S24 4.95 24 11.639c0 6.689-5.24 11.638-12 11.638-1.21 0-2.38-.16-3.47-.46a.96.96 0 00-.64.05l-2.39 1.05a.96.96 0 01-1.35-.85l-.07-2.14a.97.97 0 00-.32-.68A11.39 11.389 0 01.002 11.64zm8.32-2.19l-3.52 5.6c-.35.53.32 1.139.82.75l3.79-2.87c.26-.2.6-.2.87 0l2.8 2.1c.84.63 2.04.4 2.6-.48l3.52-5.6c.35-.53-.32-1.13-.82-.75l-3.79 2.87c-.25.2-.6.2-.86 0l-2.8-2.1a1.8 1.8 0 00-2.61.48z'],
    viber: ['#7360F2', 'M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.326 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.017zm.058 1.693c.545-.004.88.017.88.017 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.604 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.03zm.38 2.602c-.167 0-.303.135-.304.302 0 .167.133.303.3.305 1.624.01 2.946.537 4.028 1.592 1.073 1.046 1.62 2.468 1.633 4.334.002.167.14.3.307.3.166-.002.3-.138.3-.304-.014-1.984-.618-3.596-1.816-4.764-1.19-1.16-2.692-1.753-4.447-1.765zm-3.96.695c-.19-.032-.4.005-.616.117l-.01.002c-.43.247-.816.562-1.146.932-.002.004-.006.004-.008.008-.267.323-.42.638-.46.948-.008.046-.01.093-.007.14 0 .136.022.27.065.4l.013.01c.135.48.473 1.276 1.205 2.604.42.768.903 1.5 1.446 2.186.27.344.56.673.87.984l.132.132c.31.308.64.6.984.87.686.543 1.418 1.027 2.186 1.447 1.328.733 2.126 1.07 2.604 1.206l.01.014c.13.042.265.064.402.063.046.002.092 0 .138-.008.31-.036.627-.19.948-.46.004 0 .003-.002.008-.005.37-.33.683-.72.93-1.148l.003-.01c.225-.432.15-.842-.18-1.12-.004 0-.698-.58-1.037-.83-.36-.255-.73-.492-1.113-.71-.51-.285-1.032-.106-1.248.174l-.447.564c-.23.283-.657.246-.657.246-3.12-.796-3.955-3.955-3.955-3.955s-.037-.426.248-.656l.563-.448c.277-.215.456-.737.17-1.248-.217-.383-.454-.756-.71-1.115-.25-.34-.826-1.033-.83-1.035-.137-.165-.31-.265-.502-.297zm4.49.88c-.158.002-.29.124-.3.282-.01.167.115.312.282.324 1.16.085 2.017.466 2.645 1.15.63.688.93 1.524.906 2.57-.002.168.13.306.3.31.166.003.305-.13.31-.297.025-1.175-.334-2.193-1.067-2.994-.74-.81-1.777-1.253-3.05-1.346h-.024zm.463 1.63c-.16.002-.29.127-.3.287-.008.167.12.31.288.32.523.028.875.175 1.113.422.24.245.388.62.416 1.164.01.167.15.295.318.287.167-.008.295-.15.287-.317-.03-.644-.215-1.178-.58-1.557-.367-.378-.893-.574-1.52-.607h-.018z'],
    signal: ['#3B45FD', 'M12 0q-.934 0-1.83.139l.17 1.111a11 11 0 0 1 3.32 0l.172-1.111A12 12 0 0 0 12 0M9.152.34A12 12 0 0 0 5.77 1.742l.584.961a10.8 10.8 0 0 1 3.066-1.27zm5.696 0-.268 1.094a10.8 10.8 0 0 1 3.066 1.27l.584-.962A12 12 0 0 0 14.848.34M12 2.25a9.75 9.75 0 0 0-8.539 14.459c.074.134.1.292.064.441l-1.013 4.338 4.338-1.013a.62.62 0 0 1 .441.064A9.7 9.7 0 0 0 12 21.75c5.385 0 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25m-7.092.068a12 12 0 0 0-2.59 2.59l.909.664a11 11 0 0 1 2.345-2.345zm14.184 0-.664.909a11 11 0 0 1 2.345 2.345l.909-.664a12 12 0 0 0-2.59-2.59M1.742 5.77A12 12 0 0 0 .34 9.152l1.094.268a10.8 10.8 0 0 1 1.269-3.066zm20.516 0-.961.584a10.8 10.8 0 0 1 1.27 3.066l1.093-.268a12 12 0 0 0-1.402-3.383M.138 10.168A12 12 0 0 0 0 12q0 .934.139 1.83l1.111-.17A11 11 0 0 1 1.125 12q0-.848.125-1.66zm23.723.002-1.111.17q.125.812.125 1.66c0 .848-.042 1.12-.125 1.66l1.111.172a12.1 12.1 0 0 0 0-3.662M1.434 14.58l-1.094.268a12 12 0 0 0 .96 2.591l-.265 1.14 1.096.255.36-1.539-.188-.365a10.8 10.8 0 0 1-.87-2.35m21.133 0a10.8 10.8 0 0 1-1.27 3.067l.962.584a12 12 0 0 0 1.402-3.383zm-1.793 3.848a11 11 0 0 1-2.345 2.345l.664.909a12 12 0 0 0 2.59-2.59zm-19.959 1.1L.357 21.48a1.8 1.8 0 0 0 2.162 2.161l1.954-.455-.256-1.095-1.953.455a.675.675 0 0 1-.81-.81l.454-1.954zm16.832 1.769a10.8 10.8 0 0 1-3.066 1.27l.268 1.093a12 12 0 0 0 3.382-1.402zm-10.94.213-1.54.36.256 1.095 1.139-.266c.814.415 1.683.74 2.591.961l.268-1.094a10.8 10.8 0 0 1-2.35-.869zm3.634 1.24-.172 1.111a12.1 12.1 0 0 0 3.662 0l-.17-1.111q-.812.125-1.66.125a11 11 0 0 1-1.66-.125'],
    linkedin: ['#0A66C2', 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'],
    youtube: ['#FF0000', 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'],
    snapchat: ['#FFFC00', 'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z'],
  };
  const ENVELOPPE = 'M2 5.5A1.5 1.5 0 0 1 3.5 4h17A1.5 1.5 0 0 1 22 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5zm2 .9v.4l8 5.2 8-5.2v-.4z';
  const GLOBE = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15 15 0 0 0-1.3-3.8A8 8 0 0 1 18.9 8zM12 4.1A13 13 0 0 1 13.8 8h-3.6A13 13 0 0 1 12 4.1zM4.3 14a8 8 0 0 1 0-4h3.3a16 16 0 0 0 0 4zm.8 2h3a15 15 0 0 0 1.3 3.8A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.3-3.8A15 15 0 0 0 8.1 8zM12 19.9A13 13 0 0 1 10.2 16h3.6a13 13 0 0 1-1.8 3.9zm2.3-5.9H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 5.8a15 15 0 0 0 1.3-3.8h3a8 8 0 0 1-4.3 3.8zm1.8-5.8a16 16 0 0 0 0-4h3.3a8 8 0 0 1 0 4z';
  const CLE_LOGO = { whatsapp: 'whatsapp', facebook: 'facebook', instagram: 'instagram', tiktok: 'tiktok',
    threads: 'threads', twitter: 'x', wechat: 'wechat' };
  const NOMS_CANAUX = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok',
    threads: 'Threads', twitter: 'X', wechat: 'WeChat' };
  // Le logo d'un canal ajouté à la main : d'après son lien, sinon son nom.
  function logoDe(nom, url){
    const t = (String(url || '') + ' ' + String(nom || '')).toLowerCase();
    if(/t\.me\/|telegram/.test(t)) return 'telegram';
    if(/m\.me\/|messenger/.test(t)) return 'messenger';
    if(/^viber:|viber/.test(t)) return 'viber';
    if(/signal\.me|^sgnl:|signal/.test(t)) return 'signal';
    if(/linkedin/.test(t)) return 'linkedin';
    if(/youtube|youtu\.be/.test(t)) return 'youtube';
    if(/snapchat/.test(t)) return 'snapchat';
    if(/whatsapp|wa\.me/.test(t)) return 'whatsapp';
    if(/^mailto:|email|e-mail/.test(t)) return 'email';
    return 'site';
  }
  function tuile(l){
    const logo = LOGOS[l.logo];
    const fond = logo ? logo[0] : (l.logo === 'email' ? '#EA4335' : '#5f6b73');
    const encre = l.logo === 'snapchat' ? '#111' : '#fff';
    const chemin = logo ? logo[1] : (l.logo === 'email' ? ENVELOPPE : GLOBE);
    const carre = '<span style="position:relative; display:flex; align-items:center; justify-content:center; width:3.4rem; height:3.4rem; ' +
      'border-radius:16px; background:' + fond + '; box-shadow:0 4px 12px rgba(0,0,0,0.25);' + (l.ok ? '' : ' outline:2px solid var(--amber); outline-offset:2px;') + '">' +
      '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="' + encre + '" d="' + chemin + '"/></svg>' +
      (l.ok ? '' : '<span style="position:absolute; top:-0.5rem; right:-0.5rem; font-size:0.9rem;">⚠️</span>') + '</span>';
    const nom = '<span style="font-size:0.72rem; font-weight:600; color:var(--text); max-width:5.5rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(l.nom) + '</span>';
    const attrs = 'title="' + escapeHtml(l.titre) + '" style="display:flex; flex-direction:column; align-items:center; gap:0.35rem; text-decoration:none; color:inherit;' +
      (l.lien || l.canal ? ' cursor:pointer;' : '') + (l.vide ? ' opacity:0.45;' : '') + '"';
    // Un canal des cases : le logo ouvre sa case (le lien est dedans).
    if(l.canal){
      const logo = '<button type="button" data-canal="' + l.canal + '" aria-pressed="false" ' + attrs.replace('style="', 'style="background:none; border:0; padding:0; font:inherit; ') + '>' +
        carre + nom + '</button>';
      // Rempli, il s'efface aussi d'un ✕ : la case est vidée et enregistrée.
      return l.vide ? logo : '<span style="position:relative; display:inline-flex;">' + logo + boutonFafana('data-vider="' + l.canal + '"', l.nom) + '</span>';
    }
    const corps = l.lien
      ? '<a href="' + escapeHtml(l.lien) + '" target="_blank" rel="noopener" ' + attrs + '>' + carre + nom + '</a>'
      : '<div ' + attrs + '>' + carre + nom + '</div>';
    // Un canal ajouté à la main s'efface d'un ✕ (surtout quand il est faux).
    if(!l.id) return corps;
    return '<span style="position:relative; display:inline-flex;">' + corps +
      boutonFafana('data-fafana="' + escapeHtml(l.id) + '"', l.nom) + '</span>';
  }
  function boutonFafana(attr, nom){
    return '<button type="button" ' + attr + ' data-nom="' + escapeHtml(nom) + '" title="Fafana" aria-label="Fafana ' + escapeHtml(nom) + '" ' +
      'style="position:absolute; top:-0.55rem; left:-0.55rem; width:1.5rem; height:1.5rem; padding:0; border-radius:50%; ' +
      'border:2px solid var(--panel); background:#e05a5a; color:#fff; font-size:0.8rem; font-weight:700; line-height:1; cursor:pointer;">✕</button>';
  }
  // Un réseau des cases : on vide sa colonne seule, sans toucher aux autres
  // cases qu'on serait en train d'écrire.
  function viderCanal(cle, nom){
    if(!confirm('Fafana ve ny ' + nom + ' ? Tsy hitan\'ny client intsony izy.')) return;
    const champ = CONTACT_FIELD_MAP.find(function(f){ return f.key === cle; });
    const input = champ && document.getElementById(champ.inputId);
    const fini = function(){
      if(input){ input.value = ''; input.dispatchEvent(new Event('input')); }
      const local = loadContactChannelsLocal(); local[cle] = ''; saveContactChannelsLocal(local);
      if(caseOuverte === cle) ouvrirLaCase(cle);
      afficherLesEnregistres();
      renderContactButtons();
    };
    if(!window.__sb){ fini(); return; }
    const modif = {}; modif[cle] = '';
    window.__sb.from('contact_channels').update(modif).eq('id', 1).select('id').then(function(res){
      if(res && res.error){ alert('Tsy voafafa : ' + (res.error.message || 'erreur')); return; }
      fini();
    }, function(err){ alert('Tsy voafafa : ' + ((err && err.message) || 'réessayez')); });
  }
  function fafanaCanal(id, nom){
    if(!window.__sb || !id) return;
    if(!confirm('Fafana ve ny canal « ' + nom + ' » ? Tsy hitan\'ny client intsony izy.')) return;
    window.__sb.from('contact_extra_channels').delete().eq('id', id).select('id').then(function(res){
      if(res && res.error){ alert('Tsy voafafa : ' + (res.error.message || 'erreur')); return; }
      if(!res || !res.data || !res.data.length){ alert('Tsy voafafa : ny admin ihany no afaka mamafa.'); return; }
      afficherLesEnregistres();
      renderContactButtons();
    }, function(err){ alert('Tsy voafafa : ' + ((err && err.message) || 'réessayez')); });
  }
  function lienDuCanal(cle, valeur){
    if(cle === 'whatsapp'){ const n = toInternationalNumber(valeur); return n.length >= 8 ? 'https://wa.me/' + n : ''; }
    if(cle === 'wechat') return '';
    return adresseDeProfil(cle, valeur);
  }
  function afficherLesEnregistres(){
    const zone = document.getElementById('contactEnregistres');
    if(!zone) return;
    fetchContactChannels(function(channels, extra){
      const lignes = [];
      // Les réseaux des cases, tous : un logo pâle est un réseau pas encore
      // rempli — on le touche pour l'ajouter.
      Object.keys(NOMS_CANAUX).forEach(function(cle){
        const v = String((channels && channels[cle]) || '').trim();
        const lien = v ? lienDuCanal(cle, v) : '';
        const ok = !v || !!lien || cle === 'wechat';
        lignes.push({ logo: CLE_LOGO[cle], nom: NOMS_CANAUX[cle], lien: lien, ok: ok, canal: cle, vide: !v,
          titre: !v ? 'Ajouter ' + NOMS_CANAUX[cle] : (lien || (cle === 'wechat' ? 'ID WeChat : ' + v : v + ' — à reprendre')) });
      });
      (extra || []).forEach(function(item){
        if(!item || !item.name) return;
        let lien = !item.url ? '' : /^(viber|mailto|tg|sgnl):/i.test(item.url) ? item.url : adresseDeProfil('', item.url);
        if(/\s/.test(lien)) lien = '';
        const ok = !!lien || !item.url;
        lignes.push({ logo: logoDe(item.name, item.url), nom: item.name, lien: lien, ok: ok, id: item.id,
          titre: lien || (item.url ? item.url + ' — à reprendre' : 'Copie du nom') });
      });
      const remplis = lignes.filter(function(l){ return !l.vide; }).length;
      zone.innerHTML =
        '<div style="font-size:0.8rem; font-weight:600; margin-bottom:0.2rem;">Vos canaux (' + remplis + ')</div>' +
        '<p style="font-size:0.72rem; color:var(--muted); margin:0 0 0.8rem;" data-fz-tsia>Touchez un logo pour écrire votre nom ou votre numéro ; le lien se fait tout seul.</p>' +
        '<div style="display:flex; flex-wrap:wrap; gap:1rem 1.1rem;">' + lignes.map(tuile).join('') + '</div>' +
        (lignes.some(function(l){ return !l.ok; })
          ? '<p style="font-size:0.72rem; color:var(--amber); margin:0.7rem 0 0;" data-fz-tsia>⚠️ = lien à reprendre : vos clients ne le voient pas.</p>' : '');
      zone.querySelectorAll('[data-canal]').forEach(function(b){
        b.addEventListener('click', function(){ ouvrirLaCase(b.dataset.canal); });
      });
      zone.querySelectorAll('[data-fafana]').forEach(function(b){
        b.addEventListener('click', function(e){ e.preventDefault(); fafanaCanal(b.dataset.fafana, b.dataset.nom); });
      });
      zone.querySelectorAll('[data-vider]').forEach(function(b){
        b.addEventListener('click', function(e){ e.preventDefault(); viderCanal(b.dataset.vider, b.dataset.nom); });
      });
      if(caseOuverte) marquerLogo(caseOuverte);
    });
  }

  // Les cases sont rangées derrière les logos : un logo touché montre sa
  // case seule, le même logo la referme.
  let caseOuverte = '';
  function marquerLogo(cle){
    document.querySelectorAll('#contactEnregistres [data-canal]').forEach(function(b){
      const ici = b.dataset.canal === cle;
      b.setAttribute('aria-pressed', ici ? 'true' : 'false');
      const carre = b.firstElementChild;
      if(carre) carre.style.transform = ici ? 'translateY(-3px) scale(1.06)' : '';
    });
  }
  function ouvrirLaCase(cle){
    const grille = document.getElementById('contactChamps');
    const champ = CONTACT_FIELD_MAP.find(function(f){ return f.key === cle; });
    if(!grille || !champ) return;
    if(caseOuverte === cle){ caseOuverte = ''; grille.style.display = 'none'; marquerLogo(''); return; }
    caseOuverte = cle;
    const input = document.getElementById(champ.inputId);
    Array.prototype.forEach.call(grille.children, function(f){
      f.style.display = f.contains(input) ? '' : 'none';
    });
    grille.style.display = 'grid';
    marquerLogo(cle);
    if(input) input.focus();
  }
  afficherLesEnregistres();

  // ---------------- LE LIEN SE FAIT TOUT SEUL ----------------
  // On écrit son nom ou son numéro ; l'adresse se construit, et se montre
  // sous la case pendant qu'on tape : ce qu'on lit est ce que le client
  // ouvrira. Plus d'adresse copiée depuis la barre du navigateur (« web.
  // telegram.org », « facebook.com/home.php »…) qui ouvrait le compte de
  // celui qui clique.
  function apercuSous(input){
    let p = input.parentNode.querySelector('.lien-auto');
    if(!p){
      p = document.createElement('small');
      p.className = 'lien-auto';
      p.setAttribute('data-fz-tsia', '');
      p.style.cssText = 'display:block; margin-top:0.3rem; font-size:0.72rem; line-height:1.4; word-break:break-all;';
      input.parentNode.appendChild(p);
    }
    return p;
  }
  function montrerApercu(p, lien, souci){
    if(souci){ p.style.color = 'var(--amber)'; p.textContent = '⚠️ ' + souci; return; }
    if(!lien){ p.textContent = ''; return; }
    p.style.color = 'var(--cyan)';
    // Le lien se touche pour l'essayer.
    if(/^https?:\/\//i.test(lien)){
      p.innerHTML = '✓ <a href="' + escapeHtml(lien) + '" target="_blank" rel="noopener" style="color:inherit;">' + escapeHtml(lien) + '</a>';
    } else {
      p.textContent = '✓ ' + lien;
    }
  }
  function lienWhatsapp(brut){
    const n = toInternationalNumber(brut);
    return n.length >= 8 ? 'https://wa.me/' + n : '';
  }
  CONTACT_FIELD_MAP.forEach(function(field){
    const input = document.getElementById(field.inputId);
    if(!input || field.key === 'site_url') return;
    function maj(){
      const p = apercuSous(input);
      const v = input.value.trim();
      if(!v){ montrerApercu(p, ''); return; }
      if(field.key === 'whatsapp'){
        const l = lienWhatsapp(v);
        montrerApercu(p, l, l ? '' : 'numéro trop court');
        return;
      }
      if(field.key === 'wechat'){ montrerApercu(p, 'ID WeChat : ' + v.replace(/^@/, '')); return; }
      const examen = verifierLAdresse(field.key, v);
      montrerApercu(p, examen.valeur, examen.souci);
    }
    input.addEventListener('input', maj);
    // En quittant la case, ce qu'on a écrit devient le lien lui-même.
    input.addEventListener('blur', function(){
      const v = input.value.trim();
      if(!v) return;
      if(field.key === 'whatsapp'){ const n = toInternationalNumber(v); if(n.length >= 8) input.value = n; }
      else if(PROFILS_RESEAUX[field.key]){
        const examen = verifierLAdresse(field.key, v);
        if(!examen.souci) input.value = examen.valeur;
      }
      maj();
    });
    // Les valeurs arrivent du serveur un peu après : on les montre alors.
    setTimeout(maj, 1500);
  });

  // Un autre canal : on choisit le réseau, on écrit son nom ou son numéro.
  const RESEAUX_AJOUT = [
    { id: 'telegram', nom: 'Telegram', champ: 'Votre nom Telegram', ph: 'votrenom',
      lien: function(v){ return 'https://t.me/' + v.replace(/^@/, '').replace(/^https?:\/\/(t\.me|telegram\.me)\//i, ''); } },
    { id: 'messenger', nom: 'Messenger', champ: 'Votre nom Facebook', ph: 'votrepage',
      lien: function(v){ return 'https://m.me/' + v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(m\.me|facebook\.com)\//i, ''); } },
    { id: 'viber', nom: 'Viber', champ: 'Votre numéro', ph: '034 00 000 00',
      lien: function(v){ const n = toInternationalNumber(v); return n.length >= 8 ? 'viber://chat?number=%2B' + n : ''; } },
    { id: 'signal', nom: 'Signal', champ: 'Votre numéro', ph: '034 00 000 00',
      lien: function(v){ const n = toInternationalNumber(v); return n.length >= 8 ? 'https://signal.me/#p/+' + n : ''; } },
    { id: 'linkedin', nom: 'LinkedIn', champ: 'Votre nom LinkedIn', ph: 'votrenom',
      lien: function(v){ return 'https://www.linkedin.com/in/' + v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, ''); } },
    { id: 'youtube', nom: 'YouTube', champ: 'Votre chaîne', ph: 'votrechaine',
      lien: function(v){ return 'https://www.youtube.com/@' + v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?youtube\.com\/@?/i, ''); } },
    { id: 'snapchat', nom: 'Snapchat', champ: 'Votre nom Snapchat', ph: 'votrenom',
      lien: function(v){ return 'https://www.snapchat.com/add/' + v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?snapchat\.com\/add\//i, ''); } },
    { id: 'email', nom: 'Email', champ: 'Votre adresse email', ph: 'vous@exemple.com',
      lien: function(v){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'mailto:' + v : ''; } },
    { id: 'site', nom: 'Site web', champ: 'Adresse du site', ph: 'www.votresite.com',
      lien: function(v){ return /^https?:\/\//i.test(v) ? v : 'https://' + v; } },
    { id: 'autre', nom: '', champ: 'Lien ou identifiant', ph: 'https://… (vide = simple copie)',
      lien: function(v){ return v; } }
  ];
  const selectReseau = document.getElementById('newContactReseau');
  function reseauChoisi(){
    const id = selectReseau ? selectReseau.value : 'autre';
    return RESEAUX_AJOUT.find(function(r){ return r.id === id; }) || RESEAUX_AJOUT[RESEAUX_AJOUT.length - 1];
  }
  function lienAjout(){
    const v = document.getElementById('newContactUrl').value.trim();
    if(!v) return { lien: '', souci: '' };
    const r = reseauChoisi();
    let lien = r.lien(v);
    if(r.id === 'autre'){
      const examen = verifierLAdresse('', v);
      return { lien: examen.valeur, souci: examen.souci };
    }
    if(!lien) return { lien: '', souci: r.champ.toLowerCase() + ' à vérifier' };
    // Un nom d'utilisateur ne porte pas d'espace : « tokiniaina tanjona »
    // donnait « t.me/tokiniaina tanjona », qui n'ouvre personne.
    if(/\s/.test(lien)){
      return { lien: '', souci: 'un nom d\'utilisateur s\'écrit sans espace (ex. ' +
        v.replace(/^@/, '').trim().replace(/\s+/g, '_') + ') : recopiez-le tel que ' + r.nom + ' l\'affiche.' };
    }
    return { lien: lien, souci: '' };
  }
  function majAjout(){
    const input = document.getElementById('newContactUrl');
    if(!input) return;
    const r = reseauChoisi();
    const champNom = document.getElementById('newContactNameField');
    if(champNom) champNom.hidden = r.id !== 'autre';
    const label = document.getElementById('newContactUrlLabel');
    if(label) label.textContent = r.champ;
    input.placeholder = r.ph;
    const a = lienAjout();
    montrerApercu(apercuSous(input), a.lien, a.souci);
  }
  if(selectReseau){
    selectReseau.innerHTML = RESEAUX_AJOUT.map(function(r){
      return '<option value="' + r.id + '">' + (r.nom || 'Autre…') + '</option>';
    }).join('');
    selectReseau.addEventListener('change', majAjout);
    document.getElementById('newContactUrl').addEventListener('input', majAjout);
    majAjout();
  }

  const addContactChannelBtn = document.getElementById('addContactChannelBtn');
  if(addContactChannelBtn){
    addContactChannelBtn.addEventListener('click', function(){
      const r = reseauChoisi();
      const name = r.id === 'autre' ? document.getElementById('newContactName').value.trim() : r.nom;
      const a = lienAjout();
      if(a.souci){ alert(name + ' : ' + a.souci); return; }
      const url = a.lien;
      if(!name) return;
      if(r.id !== 'autre' && !url){ alert(name + ' : ' + r.champ.toLowerCase() + ' manquant.'); return; }
      // Même règle que pour les cases au-dessus : « web.telegram.org » ouvre
      // le Telegram du client, et le canal ne servirait à rien.
      const examen = r.id === 'autre' ? verifierLAdresse('', url) : { souci: '' };
      if(examen.souci){
        alert(name + ' : ' + examen.souci);
        return;
      }
      if(!window.__sb){
        const list = loadContactExtraLocal();
        list.push({ name: name, url: url });
        saveContactExtraLocal(list);
        renderContactButtons();
        afficherLesEnregistres();
        document.getElementById('newContactName').value = '';
        document.getElementById('newContactUrl').value = '';
        majAjout();
        return;
      }
      window.__sb.from('contact_extra_channels').insert({ name: name, url: url }).then(function(res){
        if(res && res.error){
          alert("Échec de l'enregistrement du canal sur le serveur : " + (res.error.message || 'erreur inconnue'));
          return;
        }
        renderContactButtons();
        afficherLesEnregistres();
        document.getElementById('newContactName').value = '';
        document.getElementById('newContactUrl').value = '';
        majAjout();
      }, function(err){
        alert("Échec de l'enregistrement du canal sur le serveur : " + ((err && err.message) || 'réessayez'));
      });
    });
  }

  renderContactButtons();


  // ---------------- NOUS CONTACTER (visible à tous les clients) ----------------
  const STORAGE_CONTACT_CHANNELS = 'stockmanager_contact_channels';
  const STORAGE_CONTACT_EXTRA = 'stockmanager_contact_extra';
  // Fifandraisan'ny champ admin sy ny clé voatahiry. Ny endrika sy ny fitondran'ny
  // bokotra dia voafaritra ao amin'ny renderContactButtons, araka ny vondrona.
  const CONTACT_FIELD_MAP = [
    // Adiresy publique an'ny site : io no ampiasaina amin'ny rohy rehetra zaraina
    // (invitation, fanambarana Live…). Raha tsy voafeno dia ny adiresy an'ity
    // pejy ity no alaina — izay tsy misokatra amin'ny olon-kafa raha localhost.
    { key: 'site_url', inputId: 'contactSiteUrlInput' },
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
      window.__sb.from('contact_extra_channels').select('name,url').order('created_at', { ascending: true })
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
        voice.push({ label: '☎️ Antso an-tariby', color: '#25D366', run: dialNumber(phone) });
        voice.push({ label: '💬 WhatsApp', color: '#25D366', run: openUrl(wa) });
        video.push({ label: '💬 WhatsApp', color: '#25D366', run: openUrl(wa) });
      }

      const fb = (channels.facebook || '').trim();
      const messenger = fb ? facebookToMessenger(fb) : null;
      if(messenger){
        voice.push({ label: '📘 Messenger', color: '#1877F2', run: openUrl(messenger) });
        video.push({ label: '📘 Messenger', color: '#1877F2', run: openUrl(messenger) });
      }

      // Canal tsy mahavita antso : hafatra na profil, ampidirina ao amin'ny "Antso"
      // mba tsy ho very — afaka manoratra any ny mpanjifa.
      if(fb && !messenger){
        voice.push({ label: '📘 Facebook', color: '#1877F2', run: openUrl(fb) });
      }
      [
        { key: 'instagram', label: '📸 Instagram', color: '#E1306C' },
        { key: 'tiktok', label: '🎵 TikTok', color: '#e7e9ea' },
        { key: 'threads', label: '🧵 Threads', color: '#e7e9ea' },
        { key: 'twitter', label: '✖️ X (Twitter)', color: '#e7e9ea' }
      ].forEach(function(f){
        const url = (channels[f.key] || '').trim();
        if(url) voice.push({ label: f.label, color: f.color, run: openUrl(url) });
      });
      const wechat = (channels.wechat || '').trim();
      if(wechat){
        voice.push({ label: '💚 WeChat', color: '#07C160', run: copyIdentifier('WeChat', wechat) });
      }

      (extra || []).forEach(function(item){
        if(!item || !item.name) return;
        const value = (item.url || '').trim();
        if(/^https?:\/\//i.test(value)){
          voice.push({ label: item.name, color: 'var(--cyan)', run: openUrl(value) });
          return;
        }
        const digits = value.replace(/[^\d]/g, '');
        if(digits.length >= 7){
          voice.push({ label: '☎️ ' + item.name, color: 'var(--cyan)', run: dialNumber(digits) });
          video.push({ label: item.name, color: 'var(--cyan)', run: openUrl('https://wa.me/' + toInternationalNumber(digits)) });
          return;
        }
        voice.push({
          label: item.name,
          color: 'var(--cyan)',
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
            title: 'Gestion de Stockage',
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

  // Ny URL Facebook dia ovaina ho rohy Messenger (m.me) raha azo atao, mba
  // hisokatra mivantana ilay resaka fa tsy ny pejy fotsiny.
  function facebookToMessenger(url){
    const m = String(url).match(/facebook\.com\/(?:profile\.php\?id=)?([^\/?#]+)/i);
    if(!m || !m[1]) return null;
    const slug = m[1].replace(/^@/, '');
    if(!slug || slug === 'people' || slug === 'pages') return null;
    return 'https://m.me/' + slug;
  }

  function loadContactAdminForm(){
    fetchContactChannels(function(channels){
      CONTACT_FIELD_MAP.forEach(function(field){
        const input = document.getElementById(field.inputId);
        if(input) input.value = channels[field.key] || '';
      });
    });
  }

  const saveContactChannelsBtn = document.getElementById('saveContactChannelsBtn');
  if(saveContactChannelsBtn){
    loadContactAdminForm();
    saveContactChannelsBtn.addEventListener('click', function(){
      const channels = { id: 1 };
      CONTACT_FIELD_MAP.forEach(function(field){
        const input = document.getElementById(field.inputId);
        channels[field.key] = input ? input.value.trim() : '';
      });
      saveContactChannelsLocal(channels);
      const status = document.getElementById('contactChannelsStatus');
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
      }, function(err){
        renderContactButtons();
        status.textContent = "Échec de l'enregistrement serveur : " + ((err && err.message) || 'réessayez');
      });
    });
  }

  const addContactChannelBtn = document.getElementById('addContactChannelBtn');
  if(addContactChannelBtn){
    addContactChannelBtn.addEventListener('click', function(){
      const name = document.getElementById('newContactName').value.trim();
      const url = document.getElementById('newContactUrl').value.trim();
      if(!name) return;
      if(!window.__sb){
        const list = loadContactExtraLocal();
        list.push({ name: name, url: url });
        saveContactExtraLocal(list);
        renderContactButtons();
        document.getElementById('newContactName').value = '';
        document.getElementById('newContactUrl').value = '';
        return;
      }
      window.__sb.from('contact_extra_channels').insert({ name: name, url: url }).then(function(res){
        if(res && res.error){
          alert("Échec de l'enregistrement du canal sur le serveur : " + (res.error.message || 'erreur inconnue'));
          return;
        }
        renderContactButtons();
        document.getElementById('newContactName').value = '';
        document.getElementById('newContactUrl').value = '';
      }, function(err){
        alert("Échec de l'enregistrement du canal sur le serveur : " + ((err && err.message) || 'réessayez'));
      });
    });
  }

  renderContactButtons();


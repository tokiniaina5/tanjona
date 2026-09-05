  // ---------------- NOUS CONTACTER (visible à tous les clients) ----------------
  const STORAGE_CONTACT_CHANNELS = 'stockmanager_contact_channels';
  const STORAGE_CONTACT_EXTRA = 'stockmanager_contact_extra';
  const CONTACT_FIELD_MAP = [
    { key: 'whatsapp', inputId: 'contactWhatsappInput', label: 'WhatsApp', color: '#25D366', isPhone: true },
    { key: 'facebook', inputId: 'contactFacebookInput', label: 'Facebook', color: '#1877F2' },
    { key: 'instagram', inputId: 'contactInstagramInput', label: 'Instagram', color: '#E1306C' },
    { key: 'tiktok', inputId: 'contactTiktokInput', label: 'TikTok', color: '#e7e9ea' },
    { key: 'threads', inputId: 'contactThreadsInput', label: 'Threads', color: '#e7e9ea' },
    { key: 'twitter', inputId: 'contactTwitterInput', label: 'X (Twitter)', color: '#e7e9ea' },
    { key: 'wechat', inputId: 'contactWechatInput', label: 'WeChat', color: '#07C160', isId: true }
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

  function renderContactButtons(){
    const row = document.getElementById('contactButtonsRow');
    const emptyHint = document.getElementById('contactButtonsEmptyHint');
    if(!row) return;
    fetchContactChannels(function(channels, extra){
    row.innerHTML = '';
    let count = 0;

    CONTACT_FIELD_MAP.forEach(function(field){
      const value = (channels[field.key] || '').trim();
      if(!value) return;
      count++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.borderColor = field.color;
      btn.style.color = field.color;
      btn.textContent = field.label;
      btn.addEventListener('click', function(){
        if(field.isPhone){
          window.open('https://wa.me/' + value.replace(/[^\d]/g, ''), '_blank');
        } else if(field.isId){
          copyToClipboardSilently(value);
          alert('Identifiant WeChat copié : ' + value + '. Ouvrez WeChat et recherchez ce contact.');
        } else {
          window.open(value, '_blank');
        }
      });
      row.appendChild(btn);
    });

    extra.forEach(function(item){
      count++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.borderColor = 'var(--cyan)';
      btn.style.color = 'var(--cyan)';
      btn.textContent = item.name;
      btn.addEventListener('click', function(){
        if(!item.url){
          copyToClipboardSilently(item.name);
          alert('Ouvrez ' + item.name + ' pour nous contacter.');
          return;
        }
        if(/^https?:\/\//i.test(item.url)){
          window.open(item.url, '_blank');
        } else {
          copyToClipboardSilently(item.url);
          alert('Identifiant copié : ' + item.url + '. Ouvrez ' + item.name + ' et recherchez ce contact.');
        }
      });
      row.appendChild(btn);
    });

    emptyHint.style.display = count ? 'none' : 'block';
    renderInAppCallPanel();
    });
  }

  // ---------------- ANTSO AO ANATY APPLI, avy amin'ny pejy "Nous contacter" ----------------
  function renderInAppCallPanel(){
    const panel = document.getElementById('inAppCallPanel');
    if(!panel) return;
    const me = myIdentity();
    if(me.isAdmin || !window.__sb){
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const statusEl = document.getElementById('ownerOnlineStatus');
    const ownerOnline = !!presenceState[OWNER_EMAIL.toLowerCase()];
    if(statusEl){
      statusEl.textContent = ownerOnline ? '🟢 Miditra ankehitriny' : '⚪ Tsy miditra ankehitriny (mety tsy hovaliana avy hatrany)';
    }
  }

  const inAppCallAudioBtn = document.getElementById('inAppCallAudioBtn');
  if(inAppCallAudioBtn){
    inAppCallAudioBtn.addEventListener('click', function(){
      const p = presenceState[OWNER_EMAIL.toLowerCase()];
      startCall(OWNER_EMAIL.toLowerCase(), (p && p.name) || 'Admin', 'audio');
    });
  }
  const inAppCallVideoBtn = document.getElementById('inAppCallVideoBtn');
  if(inAppCallVideoBtn){
    inAppCallVideoBtn.addEventListener('click', function(){
      const p = presenceState[OWNER_EMAIL.toLowerCase()];
      startCall(OWNER_EMAIL.toLowerCase(), (p && p.name) || 'Admin', 'video');
    });
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
      window.__sb.from('contact_channels').upsert(channels).then(function(){
        renderContactButtons();
        status.textContent = 'Enregistré ✓ Visible par tous vos clients.';
      }, function(){
        renderContactButtons();
        status.textContent = "Échec de l'enregistrement serveur. Réessayez.";
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
      window.__sb.from('contact_extra_channels').insert({ name: name, url: url }).then(function(){
        renderContactButtons();
        document.getElementById('newContactName').value = '';
        document.getElementById('newContactUrl').value = '';
      }, function(){
        alert("Échec de l'enregistrement du canal sur le serveur.");
      });
    });
  }

  renderContactButtons();


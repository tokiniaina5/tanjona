  // ---------------- INVITER DES AMIS ----------------
  // ---------------- ADIRESY AMPIASAINA AMIN'NY ROHY ZARAINA ----------------
  // Ny adiresy toa "http://127.0.0.1:5500/..." na "file://" dia an-toerana : ny
  // olona mandray azy any amin'ny WhatsApp dia tsy afaka manokatra azy mihitsy,
  // satria ny fitaovany ihany no tondroin'io adiresy io. Ka rehefa misy adiresy
  // publique voarafitry ny admin dia io no ampiasaina amin'ny rohy rehetra.
  function isLocalOnlyUrl(url){
    return /^file:/i.test(url) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url);
  }

  function publicBaseUrl(){
    let configured = '';
    try {
      if(typeof loadContactChannelsLocal === 'function'){
        configured = (loadContactChannelsLocal().site_url || '').trim();
      }
    } catch(e){}
    if(configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, '');
    return window.location.href.split('?')[0].split('#')[0];
  }

  function renderLocalLinkWarning(link){
    const local = isLocalOnlyUrl(link);
    const msg = '⚠️ Adiresy an-toerana ity (' + link.split('?')[0] + ') : tsy hisokatra amin\'ny ' +
      'olon-kafa. Apetraho ao amin\'ny « Nous contacter » → « Adresse publique du site » ny ' +
      'adiresy tena mivoaka amin\'ny Internet (oh. Netlify, GitHub Pages) vao mizara.';
    [document.getElementById('localLinkWarning'), document.getElementById('adminLinkWarning')]
      .forEach(function(el){
        if(!el) return;
        el.style.display = local ? 'block' : 'none';
        if(local) el.textContent = msg;
      });
  }

  function setupInviteLink(){
    const sub = ensureInstallDate();
    const link = publicBaseUrl() + '?invite=1&ref=' + encodeURIComponent(sub.id);
    document.getElementById('inviteLink').value = link;
    renderLocalLinkWarning(link);
    refreshReferralProgress();
  }

  document.getElementById('copyInviteBtn').addEventListener('click', function(){
    const input = document.getElementById('inviteLink');
    input.select();
    navigator.clipboard.writeText(input.value).then(function(){
      const btn = document.getElementById('copyInviteBtn');
      const original = btn.textContent;
      btn.textContent = 'Copié !';
      setTimeout(function(){ btn.textContent = original; }, 1500);
    }).catch(function(){
      document.execCommand('copy');
    });
  });

  document.getElementById('sendInviteBtn').addEventListener('click', function(){
    const email = document.getElementById('inviteEmail').value.trim();
    const link = document.getElementById('inviteLink').value;
    const subject = encodeURIComponent('Invitation — Gestion de Stockage');
    const body = encodeURIComponent('Salut,\n\nJe t\'invite à rejoindre l\'application de gestion de stockage : ' + link + '\n\nÀ bientôt !');
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  });

  // ---------------- PARTAGE RÉSEAUX SOCIAUX ----------------
  function inviteMessage(link){
    return 'Salut ! Je t\'invite à essayer cette application de gestion de stockage : ' + link;
  }
  function copyToClipboardSilently(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(function(){});
    }
  }

  document.getElementById('shareWhatsappBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    window.open('https://wa.me/?text=' + encodeURIComponent(inviteMessage(link)), '_blank');
  });

  document.getElementById('shareFacebookBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link), '_blank');
  });

  document.getElementById('shareThreadsBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(inviteMessage(link)), '_blank');
  });

  // TikTok n'a pas d'URL de partage officielle pour du texte : on copie le message.
  document.getElementById('shareTiktokBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    copyToClipboardSilently(inviteMessage(link));
    alert('Votre message a été copié. Ouvrez TikTok et collez-le dans un message ou une légende.');
    window.open('https://www.tiktok.com/', '_blank');
  });

  document.getElementById('shareTwitterBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(inviteMessage(link)) + '&url=' + encodeURIComponent(link), '_blank');
  });

  // Instagram et WeChat n'offrent pas de lien web permettant de préremplir un message :
  // on copie le message et on ouvre l'appli/le site pour que l'utilisateur le colle lui-même.
  document.getElementById('shareInstagramBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    copyToClipboardSilently(inviteMessage(link));
    alert('Votre message a été copié. Ouvrez Instagram (story ou message direct) et collez-le.');
    window.open('https://www.instagram.com/', '_blank');
  });

  document.getElementById('shareWechatBtn').addEventListener('click', function(){
    const link = document.getElementById('inviteLink').value;
    copyToClipboardSilently(inviteMessage(link));
    alert('Votre message a été copié. Ouvrez WeChat et collez-le dans une discussion.');
  });

  // Sur mobile, la feuille de partage native permet d'atteindre n'importe quelle appli
  // installée (Instagram, WeChat, Messenger, etc.) directement avec le lien prérempli.
  var shareMoreBtn = document.getElementById('shareMoreBtn');
  if(navigator.share){
    shareMoreBtn.style.display = 'inline-flex';
    shareMoreBtn.addEventListener('click', function(){
      const link = document.getElementById('inviteLink').value;
      navigator.share({
        title: 'Gestion de Stockage',
        text: inviteMessage(link),
        url: link
      }).catch(function(){});
    });
  }

  // ---------------- PARTAGE UNIVERSEL ----------------
  // Ampiasain'ny "Inviter des amis" sy ny bokotra "↗️ Partager" isaky ny post ao
  // amin'ny Accueil : feuille native amin'ny telefaonina, menu lien raha tsy misy.
  function appShareLink(){
    const input = document.getElementById('inviteLink');
    if(input && input.value) return input.value;
    return publicBaseUrl();
  }

  const SHARE_TARGETS = [
    { label: 'WhatsApp', color: '#25D366', url: function(text, link){
      return 'https://wa.me/?text=' + encodeURIComponent(text + '\n' + link); } },
    { label: 'Facebook', color: '#1877F2', url: function(text, link){
      return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link); } },
    { label: 'Threads', color: '#e7e9ea', url: function(text, link){
      return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(text + '\n' + link); } },
    { label: 'X (Twitter)', color: '#e7e9ea', url: function(text, link){
      return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(link); } },
    // Instagram, TikTok ary WeChat dia tsy manome rohy mameno hafatra mialoha :
    // dika ny hafatra dia sokafana ny app mba hapetraky ny mpampiasa.
    { label: 'Instagram', color: '#E1306C', copy: true, open: 'https://www.instagram.com/' },
    { label: 'TikTok', color: '#e7e9ea', copy: true, open: 'https://www.tiktok.com/' },
    { label: 'WeChat', color: '#07C160', copy: true }
  ];

  function openShareMenu(text, link){
    const existing = document.getElementById('shareMenuOverlay');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'shareMenuOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; ' +
      'align-items:center; justify-content:center; z-index:210; padding:1rem;';

    const box = document.createElement('div');
    box.className = 'panel';
    box.style.cssText = 'max-width:380px; width:100%; margin:0;';
    box.innerHTML = '<h3>↗️ Partager</h3>' +
      '<p style="font-size:0.78rem; color:var(--muted); margin-bottom:0.8rem;">' +
      'Safidio izay tambajotra hizarana — hitan\'ny mpanjifa rehetra ny rohy.</p>';

    const row = document.createElement('div');
    row.className = 'actions-row';
    row.style.cssText = 'flex-wrap:wrap; gap:0.6rem;';

    SHARE_TARGETS.forEach(function(t){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm';
      btn.style.width = 'auto';
      btn.style.borderColor = t.color;
      btn.style.color = t.color;
      btn.textContent = t.label;
      btn.addEventListener('click', function(){
        if(t.copy){
          copyToClipboardSilently(text + '\n' + link);
          alert('Voadika ny hafatra. Sokafy ny ' + t.label + ' dia apetaho.');
          if(t.open) window.open(t.open, '_blank');
        } else {
          window.open(t.url(text, link), '_blank');
        }
        overlay.remove();
      });
      row.appendChild(btn);
    });
    box.appendChild(row);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-sm';
    copyBtn.style.cssText = 'width:auto; margin-top:0.9rem;';
    copyBtn.textContent = '📋 Copier le lien';
    copyBtn.addEventListener('click', function(){
      copyToClipboardSilently(text + '\n' + link);
      copyBtn.textContent = 'Copié !';
    });
    box.appendChild(copyBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-sm';
    closeBtn.style.cssText = 'width:auto; margin-top:0.9rem; margin-left:0.6rem;';
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', function(){ overlay.remove(); });
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function shareContent(opts){
    const text = (opts && opts.text) || '';
    const link = (opts && opts.url) || appShareLink();
    if(navigator.share){
      navigator.share({ title: (opts && opts.title) || 'Gestion de Stockage', text: text, url: link })
        .catch(function(){ openShareMenu(text, link); });
      return;
    }
    openShareMenu(text, link);
  }

  // ---------------- RÉSEAUX SOCIAUX PERSONNALISÉS (ajoutés par l'utilisateur) ----------------
  const STORAGE_CUSTOM_SOCIALS = 'stockmanager_custom_socials';
  function loadCustomSocials(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CUSTOM_SOCIALS)) || []; }
    catch(e){ return []; }
  }
  function saveCustomSocials(list){ localStorage.setItem(STORAGE_CUSTOM_SOCIALS, JSON.stringify(list)); }

  function renderCustomSocials(){
    const container = document.getElementById('customSocialButtons');
    const list = loadCustomSocials();
    container.innerHTML = '';
    list.forEach(function(social, index){
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '0.2rem';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.borderColor = 'var(--cyan)';
      btn.style.color = 'var(--cyan)';
      btn.textContent = social.name;
      btn.addEventListener('click', function(){
        const link = document.getElementById('inviteLink').value;
        const message = inviteMessage(link);
        if(!social.url){
          copyToClipboardSilently(message);
          alert('Votre message a été copié. Collez-le dans ' + social.name + '.');
          return;
        }
        const built = social.url.replace(/\{lien\}/g, encodeURIComponent(link)).replace(/\{message\}/g, encodeURIComponent(message));
        window.open(built, '_blank');
      });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-red btn-sm';
      removeBtn.title = 'Retirer ' + social.name;
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function(){
        const current = loadCustomSocials();
        current.splice(index, 1);
        saveCustomSocials(current);
        renderCustomSocials();
      });
      wrap.appendChild(btn);
      wrap.appendChild(removeBtn);
      container.appendChild(wrap);
    });
  }
  renderCustomSocials();

  document.getElementById('addSocialToggleBtn').addEventListener('click', function(){
    const form = document.getElementById('addSocialForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('saveSocialBtn').addEventListener('click', function(){
    const name = document.getElementById('newSocialName').value.trim();
    const url = document.getElementById('newSocialUrl').value.trim();
    const status = document.getElementById('addSocialStatus');
    if(!name){ status.textContent = 'Veuillez donner un nom au réseau.'; return; }
    const list = loadCustomSocials();
    list.push({ name: name, url: url });
    saveCustomSocials(list);
    renderCustomSocials();
    document.getElementById('newSocialName').value = '';
    document.getElementById('newSocialUrl').value = '';
    status.textContent = '« ' + name + ' » ajouté ✓';
  });


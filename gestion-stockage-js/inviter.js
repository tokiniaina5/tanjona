  // ---------------- INVITER DES AMIS ----------------
  function setupInviteLink(){
    const sub = ensureInstallDate();
    const link = window.location.href.split('?')[0] + '?invite=1&ref=' + encodeURIComponent(sub.id);
    document.getElementById('inviteLink').value = link;
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


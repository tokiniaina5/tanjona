// ---------------- CONNEXIONS ----------------
  function renderLogins(){
    const logins = loadLogins();
    const tbody = document.getElementById('loginsTableBody');
    tbody.innerHTML = '';
    document.getElementById('loginsEmptyHint').style.display = logins.length ? 'none' : 'block';
    logins.forEach(function(l){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(l.name) + '</td><td>' + escapeHtml(l.email) + '</td><td>' + escapeHtml(l.date) + '</td>';
      tbody.appendChild(tr);
    });

    // "Visiteurs du site", "Connexions" et "Code maître" ne sont visibles que pour le propriétaire de l'app
    const isAdmin = currentUser && currentUser.email &&
      currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
    document.getElementById('masterCodePanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminVisitsPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminLoginsPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('contactAdminPanel').style.display = isAdmin ? 'block' : 'none';
    if(isAdmin){ renderSiteVisits(); renderClientCodesAdmin(); }
    renderProfileForm();
  }

  function renderProfileForm(){
    if(!currentUser) return;
    document.getElementById('profileName').value = currentUser.name || '';
    document.getElementById('profileCompany').value = currentUser.company || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
    document.getElementById('profilePhone').value = currentUser.phone || '';
    document.getElementById('profileNif').value = currentUser.nif || '';
    document.getElementById('profileStat').value = currentUser.stat || '';
    updateProfilePhotoPreview(currentUser.logo || null);
  }

  function updateProfilePhotoPreview(src){
    const img = document.getElementById('profilePhotoPreview');
    const placeholder = document.getElementById('profilePhotoPlaceholder');
    if(!img || !placeholder) return;
    if(src){
      img.src = src;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  const profileLogoInput = document.getElementById('profileLogo');
  if(profileLogoInput){
    profileLogoInput.addEventListener('change', function(){
      const file = profileLogoInput.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){ updateProfilePhotoPreview(ev.target.result); };
      reader.readAsDataURL(file);
    });
  }

  function shortUserAgent(ua){
    if(!ua) return '—';
    if(/Mobi|Android/i.test(ua)) return 'Mobile';
    if(/iPad|Tablet/i.test(ua)) return 'Tablette';
    return 'Ordinateur';
  }

  function renderSiteVisits(){
    const tbody = document.getElementById('siteVisitsTableBody');
    const emptyHint = document.getElementById('siteVisitsEmptyHint');
    if(!tbody || !window.__sb){ return; }
    window.__sb.from('site_visits')
      .select('path,referrer,user_agent,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function(res){
        if(!res || !res.data){ return; }
        tbody.innerHTML = '';
        emptyHint.style.display = res.data.length ? 'none' : 'block';
        res.data.forEach(function(v){
          const tr = document.createElement('tr');
          const d = v.created_at ? new Date(v.created_at).toLocaleString('fr-FR') : '—';
          tr.innerHTML =
            '<td>' + d + '</td>' +
            '<td>' + escapeHtml(v.path || '—') + '</td>' +
            '<td>' + escapeHtml(v.referrer || 'Direct') + '</td>' +
            '<td>' + shortUserAgent(v.user_agent) + '</td>';
          tbody.appendChild(tr);
        });
      }, function(){});
  }

  document.getElementById('clearLoginsBtn').addEventListener('click', function(){
    if(confirm("Vider tout l'historique des connexions ?")){
      saveLogins([]);
      renderLogins();
    }
  });

  // ---------------- CODES DE DÉVERROUILLAGE PAR CLIENT (admin) ----------------
  // Ouvre le client mail de l'admin, adressé au client, prérempli avec son code.
  function sendCodeToClientByMail(email, code){
    const subject = encodeURIComponent('Votre code de déverrouillage — Gestion de Stockage');
    const body = encodeURIComponent(
      'Bonjour,\n\n' +
      'Voici votre code de déverrouillage pour réactiver votre compte Gestion de Stockage :\n\n' +
      'Code : ' + code + '\n\n' +
      'Ce code est valable 30 minutes et accepte 3 essais. Passé ce délai, contactez-nous pour en recevoir un nouveau.\n\n' +
      'Merci !'
    );
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  }

  function renderClientCodesAdmin(){
    const tbody = document.getElementById('clientCodesTableBody');
    const emptyHint = document.getElementById('clientCodesEmptyHint');
    if(!tbody) return;
    const codes = loadClientCodes();
    const emails = Object.keys(codes);
    tbody.innerHTML = '';
    emptyHint.style.display = emails.length ? 'none' : 'block';
    emails.forEach(function(email){
      const entry = codes[email];
      const generatedAt = new Date(entry.generatedAt);
      const remainingMs = CODE_VALID_MS - (Date.now() - generatedAt.getTime());
      const remainingLabel = remainingMs > 0 ? Math.ceil(remainingMs / 60000) + ' min' : 'Expiré';
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(email) + '</td>' +
        '<td style="font-family:var(--font-mono); font-weight:600;">' + escapeHtml(entry.code) + '</td>' +
        '<td>' + escapeHtml(generatedAt.toLocaleString('fr-FR')) + '</td>' +
        '<td>' + remainingLabel + '</td>' +
        '<td>' + (entry.attempts || 0) + '/' + CODE_MAX_ATTEMPTS + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-primary btn-sm send-client-code-btn" data-email="' + escapeHtml(email) + '" data-code="' + escapeHtml(entry.code) + '" style="margin-right:0.4rem;">Envoyer</button>' +
          '<button type="button" class="btn btn-red btn-sm clear-client-code-btn" data-email="' + escapeHtml(email) + '">Supprimer</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.send-client-code-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        sendCodeToClientByMail(btn.getAttribute('data-email'), btn.getAttribute('data-code'));
      });
    });
    tbody.querySelectorAll('.clear-client-code-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        clearClientCode(btn.getAttribute('data-email'));
        renderClientCodesAdmin();
      });
    });
  }

  // ---------------- COMMUNAUTÉ CLIENTS & ACHATS INTERNATIONAUX ----------------
  const DEFAULT_MARKETPLACES = [
    { name: 'Alibaba', url: 'https://www.alibaba.com' },
    { name: 'AliExpress', url: 'https://www.aliexpress.com' }
  ];

  function addMarketplaceBtn(row, name, url){
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'btn btn-sm';
    a.textContent = '🔗 ' + name;
    row.appendChild(a);
  }

  function renderMarketplaceLinks(){
    const row = document.getElementById('marketplaceLinks');
    if(!row) return;
    row.innerHTML = '';
    DEFAULT_MARKETPLACES.forEach(function(m){ addMarketplaceBtn(row, m.name, m.url); });
    if(window.__sb){
      window.__sb.from('marketplace_links').select('name,url').order('created_at', { ascending: true })
        .then(function(res){
          if(res && res.data){ res.data.forEach(function(m){ addMarketplaceBtn(row, m.name, m.url); }); }
        }, function(){});
    }
  }

  const addMarketBtn = document.getElementById('addMarketBtn');
  if(addMarketBtn){
    addMarketBtn.addEventListener('click', function(){
      const name = document.getElementById('newMarketName').value.trim();
      const url = document.getElementById('newMarketUrl').value.trim();
      if(!name || !url) return;
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      window.__sb.from('marketplace_links').insert({ name: name, url: url }).then(function(){
        document.getElementById('newMarketName').value = '';
        document.getElementById('newMarketUrl').value = '';
        renderMarketplaceLinks();
      }, function(){ alert("Tsy voaray ny fanampiana rohy."); });
    });
  }

  function initials(name){
    if(!name) return '?';
    const parts = name.trim().split(/\s+/);
    const chars = parts.length > 1 ? (parts[0][0] + parts[1][0]) : parts[0].slice(0,2);
    return chars.toUpperCase();
  }

  function parseNewsImages(raw){
    if(!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)) return parsed;
      return [raw];
    } catch(e){
      return [raw]; // ancien format : une seule image en texte brut
    }
  }

  function renderCommunityNews(){
    const list = document.getElementById('communityNewsList');
    const emptyHint = document.getElementById('communityNewsEmpty');
    if(!list) return;
    if(!window.__sb){ list.innerHTML=''; emptyHint.style.display = 'block'; return; }
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    window.__sb.from('client_news').select('client_name,network,message,link,type,price,image,created_at')
      .gte('created_at', oneWeekAgo)
      .order('created_at', { ascending: false }).limit(30)
      .then(function(res){
        list.innerHTML = '';
        const rows = (res && res.data) || [];
        emptyHint.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function(n){
          const div = document.createElement('div');
          const type = n.type || 'vaovao';
          div.className = 'fb-post' + (type === 'live' ? ' fb-post-live' : type === 'entana' ? ' fb-post-entana' : '');
          const d = n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : '';
          const typeBadge = type === 'live'
            ? '<span class="fb-type-badge live">🔴 LIVE DIRECT</span>'
            : (type === 'entana' ? '<span class="fb-type-badge entana">🛒 Entana amidy</span>' : '');
          const images = parseNewsImages(n.image);
          let imagesHtml = '';
          if(images.length === 1){
            imagesHtml = '<img src="' + images[0] + '" alt="" style="max-width:100%; border-radius:10px; margin-top:0.6rem; display:block;">';
          } else if(images.length > 1){
            const cols = images.length === 2 ? '1fr 1fr' : (images.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr');
            imagesHtml = '<div style="display:grid; grid-template-columns:' + cols + '; gap:4px; margin-top:0.6rem;">' +
              images.map(function(src){
                return '<img src="' + src + '" alt="" style="width:100%; height:140px; object-fit:cover; border-radius:8px; display:block;">';
              }).join('') +
              '</div>';
          }
          div.innerHTML =
            '<div class="fb-post-head">' +
              '<div class="fb-avatar">' + escapeHtml(initials(n.client_name)) + '</div>' +
              '<div>' +
                '<div class="fb-post-name">' + escapeHtml(n.client_name || 'Client') + '</div>' +
                '<div class="fb-post-meta">' + typeBadge + '<span class="fb-network-badge">' + escapeHtml(n.network || 'Autre') + '</span><span>' + d + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="fb-post-body">' + escapeHtml(n.message || '') + '</div>' +
            imagesHtml +
            (n.price ? '<div class="fb-post-price">' + formatAr(n.price) + '</div>' : '') +
            (n.link ? '<a href="' + escapeHtml(n.link) + '" target="_blank" rel="noopener" class="fb-post-link">🔗 ' + escapeHtml(n.link) + '</a>' : '') +
            '<div class="fb-post-actions"><span>👍 J\'aime</span><span>💬 Commenter</span><span>↗️ Partager</span></div>';
          list.appendChild(div);
        });
      }, function(){ list.innerHTML=''; emptyHint.style.display = 'block'; });
  }

  let pendingNewsImages = [];
  const MAX_NEWS_IMAGES = 6;

  const newsImageInput = document.getElementById('newsImage');
  const newsImagePreviewWrap = document.getElementById('newsImagePreviewWrap');

  function renderNewsImagePreviews(){
    if(!newsImagePreviewWrap) return;
    newsImagePreviewWrap.innerHTML = '';
    if(!pendingNewsImages.length){
      newsImagePreviewWrap.style.display = 'none';
      return;
    }
    newsImagePreviewWrap.style.display = 'flex';
    pendingNewsImages.forEach(function(src, idx){
      const thumb = document.createElement('div');
      thumb.style.cssText = 'position:relative; width:100px; height:100px;';
      thumb.innerHTML =
        '<img src="' + src + '" style="width:100%; height:100%; object-fit:cover; border-radius:10px; display:block; border:1px solid var(--line);">' +
        '<button type="button" data-idx="' + idx + '" title="Esory ny sary" ' +
        'style="position:absolute; top:-8px; right:-8px; background:#e5484d; color:#fff; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; line-height:1;">\u2715</button>';
      newsImagePreviewWrap.appendChild(thumb);
    });
    newsImagePreviewWrap.querySelectorAll('button[data-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        pendingNewsImages.splice(Number(btn.getAttribute('data-idx')), 1);
        renderNewsImagePreviews();
      });
    });
  }

  function clearNewsImages(){
    pendingNewsImages = [];
    if(newsImageInput) newsImageInput.value = '';
    renderNewsImagePreviews();
  }

  function resizeImageFile(file, callback){
    const reader = new FileReader();
    reader.onload = function(ev){
      const img = new Image();
      img.onload = function(){
        const maxSide = 900;
        let w = img.width, h = img.height;
        if(w > maxSide || h > maxSide){
          const ratio = Math.min(maxSide / w, maxSide / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  if(newsImageInput){
    newsImageInput.addEventListener('change', function(){
      const files = Array.from(newsImageInput.files || []);
      if(!files.length) return;
      const room = MAX_NEWS_IMAGES - pendingNewsImages.length;
      if(room <= 0){
        alert('Feno ' + MAX_NEWS_IMAGES + ' sary ny isan-tokony hafarana indray mandeha.');
        newsImageInput.value = '';
        return;
      }
      files.slice(0, room).forEach(function(file){
        resizeImageFile(file, function(dataUrl){
          pendingNewsImages.push(dataUrl);
          renderNewsImagePreviews();
        });
      });
      newsImageInput.value = '';
    });
  }

  const postNewsBtn = document.getElementById('postNewsBtn');
  if(postNewsBtn){
    postNewsBtn.addEventListener('click', function(){
      const message = document.getElementById('newsMessage').value.trim();
      if(!message && !pendingNewsImages.length){ alert('Soraty ny vaovao na alao sary aloha.'); return; }
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      const clientName = (currentUser && currentUser.name) || 'Client';
      window.__sb.from('client_news').insert({
        client_name: clientName, network: 'Autre', message: message, link: '',
        type: 'vaovao', price: null,
        image: pendingNewsImages.length ? JSON.stringify(pendingNewsImages) : null
      }).then(function(){
        document.getElementById('newsMessage').value = '';
        clearNewsImages();
        renderCommunityNews();
      }, function(){ alert("Tsy voaray ny fanambarana."); });
    });
  }

  function renderCommunityPanel(){
    const avatar = document.getElementById('composerAvatar');
    if(avatar){ avatar.textContent = initials(currentUser && currentUser.name); }
    renderCommunityNews();
    renderMarketplaceLinks();
    const marketAdmin = document.getElementById('marketplaceAdminForm');
    if(marketAdmin){
      const isAdmin = currentUser && currentUser.email &&
        currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
      marketAdmin.style.display = isAdmin ? 'block' : 'none';
    }
  }

  document.getElementById('generateManualCodeBtn').addEventListener('click', function(){
    const email = document.getElementById('manualCodeEmailInput').value.trim();
    const status = document.getElementById('manualCodeStatus');
    if(!email){ status.textContent = 'Veuillez saisir un email.'; return; }
    const code = generateClientCode(email);
    status.textContent = 'Code ' + code + ' généré pour ' + email + ' ✓';
    document.getElementById('manualCodeEmailInput').value = '';
    renderClientCodesAdmin();
  });
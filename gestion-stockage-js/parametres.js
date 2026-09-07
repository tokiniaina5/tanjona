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
    // l'entrée de menu « Espace admin » n'existe que pour le propriétaire
    const navAdmin = document.getElementById('navAdmin');
    if(navAdmin) navAdmin.style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('contactAdminPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('unlockRequestsPanel').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('signupsPanel').style.display = isAdmin ? 'block' : 'none';
    if(isAdmin){ renderSiteVisits(); renderClientCodesAdmin(); renderUnlockRequests(); renderSignups(); }
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
    const savedProfile = (typeof findProfile === 'function') ? findProfile(currentUser.name || '') : null;
    const codeInput = document.getElementById('profileAccessCode');
    // avec Supabase le mot de passe n’est pas conservé ici : le champ reste vide
    const hasAuth = !!(window.__sb && window.__sb.auth);
    if(codeInput) codeInput.value = (!hasAuth && savedProfile && savedProfile.accessCode) ? savedProfile.accessCode : '';
    updateProfilePhotoPreview(currentUser.logo || null);
    if(typeof renderIdentityForm === 'function') renderIdentityForm();
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

  // Ny sary/video an'ilay post dia data: URL voatahiry ao amin'ny "image".
  // Ovaina ho File mba ho azo alefa marina amin'ny feuille de partage.
  function postMediaToFiles(sources){
    return Promise.all(sources.slice(0, 10).map(function(src, i){
      return fetch(src).then(function(r){ return r.blob(); }).then(function(blob){
        const type = blob.type || 'image/png';
        const ext = (type.split('/')[1] || 'png').split('+')[0];
        return new File([blob], 'post-' + (i + 1) + '.' + ext, { type: type });
      });
    }));
  }

  // Fizarana ny post ao amin'ny Accueil. Amin'ny telefaonina, ny SARY na VIDEO
  // mihitsy no alefa amin'ny feuille de partage, ka hitan'ny olona rehetra any
  // amin'ilay tambajotra nofidina. Raha tsy misy media na tsy tohanan'ny
  // navigateur izany, dia ny lahatsoratra sy ny rohy no zaraina.
  function sharePost(n){
    const parts = [];
    if(n.client_name) parts.push(n.client_name + ' :');
    if(n.message) parts.push(n.message);
    if(n.price) parts.push('(' + formatAr(n.price) + ')');
    const text = parts.join(' ').trim() || 'Vaovao ao amin\'ny Gestion de Stockage';
    const link = (n.link && /^https?:\/\//i.test(n.link)) ? n.link : appShareLink();

    function shareTextOnly(){
      if(typeof shareContent === 'function'){
        shareContent({ title: 'Gestion de Stockage', text: text, url: link });
      } else {
        copyToClipboardSilently(text + '\n' + link);
        alert('Voadika ny hafatra.');
      }
    }

    const media = parseNewsImages(n.image);
    if(!media.length || !navigator.canShare || !navigator.share){
      shareTextOnly();
      return;
    }
    postMediaToFiles(media).then(function(files){
      if(!navigator.canShare({ files: files })){
        shareTextOnly();
        return;
      }
      navigator.share({ text: text + '\n' + link, files: files }).catch(function(err){
        // AbortError = nofoanan'ny mpampiasa ny fizarana : tsy misy atao.
        if(err && err.name === 'AbortError') return;
        shareTextOnly();
      });
    }, shareTextOnly);
  }

  // Ouvre « Acheter » avec ce que l'annonce dit déjà : le nom, le prix, le
  // vendeur. Il ne reste qu'à confirmer la quantité — recopier ces trois
  // choses de mémoire est le meilleur moyen de se tromper de prix.
  function buyFromPost(post){
    const nav = document.querySelector('.dash-tab[data-dash="acheter"]');
    if(nav) nav.click();

    const select = document.getElementById('acheterItemSelect');
    const nom = document.getElementById('acheterItemName');
    const prix = document.getElementById('acheterPrice');
    const fournisseur = document.getElementById('acheterSupplier');
    const qty = document.getElementById('acheterQty');
    const statut = document.getElementById('acheterStatus');

    // Le libellé de l'annonce sert de nom d'article, sur sa première ligne.
    const titre = (post.message || '').split('\n')[0].trim().slice(0, 60);

    // Si l'article existe déjà en stock, on le complète plutôt que d'en créer
    // un jumeau qui compterait à part.
    const existant = items.find(function(it){
      return titre && it.name.trim().toLowerCase() === titre.toLowerCase();
    });

    if(select) select.value = existant ? existant.id : '';
    if(select) select.dispatchEvent(new Event('change'));
    if(!existant && nom) nom.value = titre;
    if(prix && post.price) prix.value = post.price;
    if(fournisseur) fournisseur.value = post.client_name || '';
    if(qty) qty.value = 1;
    if(statut){
      statut.textContent = existant
        ? 'Entana efa ao amin\'ny stock : ampio ny isa, dia tsindrio « Acheter ».'
        : 'Feno ho anao avy amin\'ny fanambarana. Jereo ny isa, dia tsindrio « Acheter ».';
    }
    if(nom || select) (existant ? qty : nom || qty).focus();
  }

  // ---------------- « J'AIME » ----------------
  // Ce que le serveur dit des « j'aime » du fil affiché : combien, et si
  // celui qui regarde en fait partie.
  let likeState = {};

  function myLikeEmail(){
    return (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : '';
  }

  function paintLike(el, newsId){
    const info = likeState[newsId] || { count: 0, mine: false };
    el.textContent = '👍 J\'aime' + (info.count ? ' (' + info.count + ')' : '');
    el.classList.toggle('liked', !!info.mine);
  }

  function setupLike(el, newsId){
    paintLike(el, newsId);
    el.addEventListener('click', function(){ toggleLike(el, newsId); });
  }

  function loadLikes(ids){
    if(!ids.length || !window.__sb) return;
    window.__sb.from('client_news_likes')
      .select('news_id,author_email')
      .in('news_id', ids)
      .then(function(res){
        const rows = (res && res.data) || [];
        const moi = myLikeEmail();
        likeState = {};
        rows.forEach(function(r){
          const info = likeState[r.news_id] || (likeState[r.news_id] = { count: 0, mine: false });
          info.count++;
          if(moi && (r.author_email || '').toLowerCase() === moi) info.mine = true;
        });
        document.querySelectorAll('#communityNewsList [data-like]').forEach(function(el){
          const post = el.closest('.fb-post');
          if(post && post.dataset.newsId) paintLike(el, post.dataset.newsId);
        });
      }, function(){});
  }

  function toggleLike(el, newsId){
    const moi = myLikeEmail();
    if(!moi || !window.__sb){ alert('Midira aloha vao afaka mankasitraka.'); return; }

    const info = likeState[newsId] || (likeState[newsId] = { count: 0, mine: false });
    // On peint tout de suite, puis on corrige si le serveur refuse : un clic
    // qui n'a l'air de rien faire pendant une seconde donne envie de cliquer
    // encore, et de compter deux fois.
    const avant = { count: info.count, mine: info.mine };
    info.mine = !avant.mine;
    info.count = Math.max(0, avant.count + (info.mine ? 1 : -1));
    paintLike(el, newsId);

    const table = window.__sb.from('client_news_likes');
    const action = avant.mine
      ? table.delete().eq('news_id', newsId).eq('author_email', moi)
      : table.insert({ news_id: newsId, author_email: moi,
          author_name: (currentUser && currentUser.name) || 'Client' });

    action.then(function(res){
      if(res && res.error){
        likeState[newsId] = avant;
        paintLike(el, newsId);
      }
    }, function(){
      likeState[newsId] = avant;
      paintLike(el, newsId);
    });
  }

  // Les commentaires ne sont chargés qu'à l'ouverture : une trentaine de
  // publications qui iraient toutes chercher leur fil à l'affichage feraient
  // trente requêtes pour un fil que personne n'a demandé à lire.
  function openComments(newsId, box){
    if(!newsId || !window.__sb){
      box.innerHTML = '<div class="fb-comment-empty">Tsy misy fifandraisana amin\'ny serveur.</div>';
      return;
    }
    box.innerHTML = '<div class="fb-comment-empty">Mamaky…</div>';

    const liste = document.createElement('div');
    const saisie = document.createElement('div');
    saisie.className = 'fb-comment-form';
    saisie.innerHTML =
      '<input type="text" class="fb-comment-input" placeholder="Soraty ny hevitrao…">' +
      '<button type="button" class="btn btn-sm fb-comment-send" style="width:auto;">Alefa</button>';

    function charger(){
      window.__sb.from('client_news_comments')
        .select('author_name,message,created_at')
        .eq('news_id', newsId)
        .order('created_at', { ascending: true })
        .limit(100)
        .then(function(res){
          const rows = (res && res.data) || [];
          liste.innerHTML = '';
          if(!rows.length){
            liste.innerHTML = '<div class="fb-comment-empty">Tsy mbola misy hevitra. Ianao no voalohany.</div>';
            return;
          }
          rows.forEach(function(c){
            const ligne = document.createElement('div');
            ligne.className = 'fb-comment';
            ligne.innerHTML =
              '<strong>' + escapeHtml(c.author_name || 'Client') + '</strong> ' +
              escapeHtml(c.message || '') +
              '<span class="fb-comment-date">' +
                (c.created_at ? new Date(c.created_at).toLocaleString('fr-FR') : '') +
              '</span>';
            liste.appendChild(ligne);
          });
        }, function(){
          liste.innerHTML = '<div class="fb-comment-empty">Tsy azo novakiana ny hevitra.</div>';
        });
    }

    box.innerHTML = '';
    box.appendChild(liste);
    box.appendChild(saisie);
    charger();

    const champ = saisie.querySelector('.fb-comment-input');
    const bouton = saisie.querySelector('.fb-comment-send');

    function envoyer(){
      const texte = champ.value.trim();
      if(!texte) return;
      bouton.disabled = true;
      window.__sb.from('client_news_comments').insert({
        news_id: newsId,
        author_name: (currentUser && currentUser.name) || 'Client',
        author_email: (currentUser && currentUser.email) || null,
        message: texte
      }).then(function(res){
        bouton.disabled = false;
        if(res && res.error){ alert('Tsy voaray ny hevitrao : ' + (res.error.message || '')); return; }
        champ.value = '';
        charger();
      }, function(){
        bouton.disabled = false;
        alert('Tsy voaray ny hevitrao : jereo ny fifandraisanao.');
      });
    }

    bouton.addEventListener('click', envoyer);
    champ.addEventListener('keydown', function(e){ if(e.key === 'Enter') envoyer(); });
    champ.focus();
  }

  function renderCommunityNews(){
    const list = document.getElementById('communityNewsList');
    const emptyHint = document.getElementById('communityNewsEmpty');
    if(!list) return;
    if(!window.__sb){ list.innerHTML=''; emptyHint.style.display = 'block'; return; }
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    window.__sb.from('client_news').select('id,client_name,network,message,link,type,price,image,created_at')
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
          // Le décompte des « j'aime » arrive après le fil : c'est par cet
          // identifiant qu'il retrouve la publication à laquelle il appartient.
          if(n.id) div.dataset.newsId = n.id;
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
            '<div class="fb-post-actions">' +
            '<span class="fb-like-action" data-like style="cursor:pointer;">👍 J\'aime</span>' +
            '<span class="fb-comment-action" data-comment style="cursor:pointer;">💬 Commenter</span>' +
            // L'achat part de l'annonce elle-même : c'est là qu'on voit la
            // marchandise et son prix, pas dans un onglet qu'il faut aller
            // chercher ensuite en retapant tout de tête.
            (type === 'entana'
              ? '<span class="fb-buy-action" data-buy style="cursor:pointer; color:var(--cyan);">🛒 Acheter</span>'
              : '') +
            '<span class="fb-share-action" data-share style="cursor:pointer;">↗️ Partager</span></div>' +
            '<div class="fb-comments" data-comments style="display:none;"></div>';
          const shareEl = div.querySelector('[data-share]');
          if(shareEl){
            shareEl.addEventListener('click', function(){ sharePost(n); });
          }
          const buyEl = div.querySelector('[data-buy]');
          if(buyEl){
            buyEl.addEventListener('click', function(){ buyFromPost(n); });
          }
          const likeEl = div.querySelector('[data-like]');
          if(likeEl) setupLike(likeEl, n.id);
          const commentEl = div.querySelector('[data-comment]');
          const commentsBox = div.querySelector('[data-comments]');
          if(commentEl && commentsBox){
            commentEl.addEventListener('click', function(){
              const ouvert = commentsBox.style.display === 'block';
              commentsBox.style.display = ouvert ? 'none' : 'block';
              if(!ouvert) openComments(n.id, commentsBox);
            });
          }
          list.appendChild(div);
        });
        // Un seul appel pour tout le fil : trente publications qui iraient
        // chacune compter ses « j'aime » feraient trente requêtes.
        loadLikes(rows.map(function(n){ return n.id; }).filter(Boolean));
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

  // Le champ du prix n'apparaît que si l'on annonce une marchandise : il n'a
  // rien à faire devant quelqu'un qui écrit une nouvelle ordinaire.
  const newsIsGoods = document.getElementById('newsIsGoods');
  const newsPrice = document.getElementById('newsPrice');
  if(newsIsGoods && newsPrice){
    newsIsGoods.addEventListener('change', function(){
      newsPrice.style.display = newsIsGoods.checked ? 'inline-block' : 'none';
      if(newsIsGoods.checked) newsPrice.focus();
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
        // Une annonce marquée « entana amidy » porte son prix, et c'est elle
        // qui fera apparaître le bouton Acheter chez les autres.
        type: (newsIsGoods && newsIsGoods.checked) ? 'entana' : 'vaovao',
        price: (newsIsGoods && newsIsGoods.checked && newsPrice && newsPrice.value) ? Number(newsPrice.value) : null,
        image: pendingNewsImages.length ? JSON.stringify(pendingNewsImages) : null
      }).then(function(){
        document.getElementById('newsMessage').value = '';
        if(newsIsGoods){ newsIsGoods.checked = false; }
        if(newsPrice){ newsPrice.value = ''; newsPrice.style.display = 'none'; }
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
  // ---------------- DEMANDES DE DÉBLOCAGE (propriétaire) ----------------
  // Un client qui a oublié son mot de passe règle 20 000 Ar sur le PayPal du
  // propriétaire puis envoie sa demande. Ici le propriétaire vérifie la
  // réception du paiement, confirme, et un code est généré : il le copie et
  // l'envoie au client, qui le saisit sur l'écran de connexion.
  const UNLOCK_SEEN_KEY = 'stockmanager_unlock_seen';

  function loadSeenUnlockIds(){
    try { return JSON.parse(localStorage.getItem(UNLOCK_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenUnlockIds(ids){
    try { localStorage.setItem(UNLOCK_SEEN_KEY, JSON.stringify(ids.slice(0, 200))); } catch(e){}
  }

  // Une demande en attente veut dire : « ce client dit avoir envoyé l'argent ».
  // Le propriétaire est prévenu nommément, avec le compte à aller vérifier.
  function notifyNewUnlockRequests(rows){
    const seen = loadSeenUnlockIds();
    const fresh = rows.filter(function(r){ return r.status === 'pending' && seen.indexOf(r.id) < 0; });
    if(!fresh.length) return;
    fresh.forEach(function(r){
      pushNotification('info', (r.name || r.email) + ' a payé ' +
        (Number(r.amount) || 20000).toLocaleString('fr-FR') + ' Ar par ' + paymentMethodLabel(r.payment_method) +
        ' (réf. ' + (r.paypal_reference || '—') + ') pour être débloqué. Vérifiez l\'arrivée de l\'argent sur votre compte, ' +
        'puis Paramètres > Demandes de déblocage.');
    });
    saveSeenUnlockIds(fresh.map(function(r){ return r.id; }).concat(seen));
  }

  // Encaissements que PayPal a confirmés tout seuls : le solde du propriétaire
  // a réellement monté. Il l'apprend sans avoir rien à vérifier.
  const UNLOCK_PAID_SEEN_KEY = 'stockmanager_unlock_paid_seen';

  function loadSeenPaidIds(){
    try { return JSON.parse(localStorage.getItem(UNLOCK_PAID_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenPaidIds(ids){
    try { localStorage.setItem(UNLOCK_PAID_SEEN_KEY, JSON.stringify(ids.slice(0, 200))); } catch(e){}
  }

  function notifyAutoConfirmedUnlocks(rows){
    const seen = loadSeenPaidIds();
    const fresh = rows.filter(function(r){
      return r.auto_confirmed && r.status !== 'pending' && seen.indexOf(r.id) < 0;
    });
    if(!fresh.length) return;
    fresh.forEach(function(r){
      // Un déblocage payé avec le portefeuille ne fait entrer aucune somme :
      // ce sont des crédits qui changent de main. Le dire comme tel, plutôt
      // que d'annoncer un argent qui n'est jamais arrivé.
      if(r.payment_method === 'wallet'){
        pushNotification('parrainage', '💰 ' + (r.name || r.email) + ' s\'est débloqué avec ' +
          ((Number(r.amount) || 0) * AR_PER_CREDIT).toLocaleString('fr-FR') +
          ' Ar de son portefeuille — ils sont passés au vôtre.');
        return;
      }
      const recu = r.paid_amount
        ? Number(r.paid_amount).toLocaleString('fr-FR') + ' ' + (r.paid_currency || '')
        : (Number(r.amount) || 20000).toLocaleString('fr-FR') + ' Ar';
      pushNotification('info', '💰 Argent reçu sur votre PayPal : ' + recu.trim() + ' de ' +
        (r.name || r.email) + '. Son accès a été rétabli automatiquement, il est prévenu de son côté.');
    });
    saveSeenPaidIds(fresh.map(function(r){ return r.id; }).concat(seen));
  }

  // Prévenu dès l'ouverture de l'application, sans passer par Paramètres.
  function checkPendingUnlockRequests(){
    if(!window.__sb) return;
    if(!(typeof isOwnerEmail === 'function' && currentUser && isOwnerEmail(currentUser.email))) return;
    window.__sb.from('unlock_requests')
      .select('id,name,email,amount,paypal_reference,payment_method,status,paid_amount,paid_currency,paid_amount_ar,auto_confirmed')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function(res){
        const rows = (res && res.data) || [];
        notifyNewUnlockRequests(rows);
        notifyAutoConfirmedUnlocks(rows);
      }, function(){});
  }

  function unlockStatusLabel(status){
    if(status === 'confirmed') return '<span style="color:var(--cyan);">Confirmé — accès rétabli</span>';
    if(status === 'used') return '<span style="color:var(--muted);">Accès repris par le client</span>';
    return '<span style="color:var(--amber);">En attente de confirmation</span>';
  }

  function renderUnlockRequests(){
    const list = document.getElementById('unlockRequestsList');
    const empty = document.getElementById('unlockRequestsEmpty');
    if(!list) return;
    if(!window.__sb){
      list.innerHTML = '';
      if(empty){ empty.style.display = 'block'; empty.textContent = 'Serveur injoignable : impossible de charger les demandes.'; }
      return;
    }
    window.__sb.from('unlock_requests')
      .select('id,name,email,phone,message,amount,paypal_reference,payment_method,status,created_at,paid_amount,paid_currency,paid_amount_ar,auto_confirmed')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        list.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';

        notifyNewUnlockRequests(rows);

        rows.forEach(function(row){
          const card = document.createElement('div');
          card.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.8rem 0.9rem; margin-bottom:0.7rem; background:var(--panel-2);';
          card.innerHTML =
            '<div style="font-size:0.86rem; color:var(--text);"><strong>' + escapeAdminHtml(row.name || '—') + '</strong></div>' +
            '<div style="font-size:0.76rem; color:var(--muted); line-height:1.6; margin-top:0.3rem;">' +
              'Email : ' + escapeAdminHtml(row.email || '—') + '<br>' +
              'Téléphone : ' + escapeAdminHtml(row.phone || '—') + '<br>' +
              'Message : ' + escapeAdminHtml(row.message || '—') + '<br>' +
              'Montant : <strong style="color:var(--text);">' +
                (row.payment_method === 'wallet'
                  ? ((Number(row.amount) || 0) * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar (portefeuille)'
                  : (row.amount || 20000).toLocaleString('fr-FR') + ' Ar') + '</strong><br>' +
              'Payé par : <strong style="color:var(--text);">' + escapeAdminHtml(paymentMethodLabel(row.payment_method)) + '</strong><br>' +
              'Référence : ' + escapeAdminHtml(row.paypal_reference || '—') + '<br>' +
              'Reçue le : ' + new Date(row.created_at).toLocaleString('fr-FR') + '<br>' +
              // Ce que PayPal a réellement fait entrer, quand il l'a annoncé.
              (row.paid_amount
                ? 'Encaissé sur PayPal : <strong style="color:var(--cyan);">' +
                  Number(row.paid_amount).toLocaleString('fr-FR') + ' ' + escapeAdminHtml(row.paid_currency || '') +
                  '</strong>' +
                  // Converti en ariary, seule façon de le comparer aux 20 000 Ar.
                  (row.paid_amount_ar ? ' ≈ ' + Number(row.paid_amount_ar).toLocaleString('fr-FR') + ' Ar' : '') +
                  (row.auto_confirmed ? ' — déblocage automatique' : ' — somme insuffisante, à vérifier') + '<br>'
                : '') +
              'État : ' + unlockStatusLabel(row.status) +
            '</div>';

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.7rem; align-items:center;';
          if(row.status === 'pending'){
            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'btn btn-primary btn-sm';
            confirmBtn.style.width = 'auto';
            // Rien ne part avant que l'argent soit sur le compte : c'est cette
            // vérification-là, faite par le propriétaire, qui déclenche tout.
            confirmBtn.textContent = '💰 Argent reçu sur mon compte — débloquer';
            confirmBtn.addEventListener('click', function(){
              const comptes = { card: 'votre compte bancaire', bank: 'votre compte bancaire',
                mobile: 'votre compte Mobile Money' };
              const ou = comptes[row.payment_method] || 'votre compte PayPal';
              if(!confirm('Avez-vous bien vu les ' + (row.amount || 20000).toLocaleString('fr-FR') +
                ' Ar arriver sur ' + ou + ' ?\n\nLe déblocage et les notifications partent immédiatement.')) return;
              confirmBtn.disabled = true;
              confirmUnlockRequest(row, card, confirmBtn);
            });
            actions.appendChild(confirmBtn);
          }
          card.appendChild(actions);
          list.appendChild(card);
        });
      }, function(){
        list.innerHTML = '';
        if(empty){ empty.style.display = 'block'; empty.textContent = 'Chargement impossible : vérifiez votre réseau.'; }
      });
  }

  function escapeAdminHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Le code n'est stocké nulle part en clair : seul son empreinte (SHA-256)
  // part sur le serveur, le code lui-même n'existe que sur cet écran.
  // Aucun code n'est généré ni transmis : la confirmation rouvre directement
  // l'accès sur l'appareil qui a envoyé la demande (identifié par son jeton).
  function confirmUnlockRequest(row, card, btn){
    window.__sb.from('unlock_requests').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).eq('id', row.id).then(function(res){
      if(res && res.error){
        btn.disabled = false;
        alert('Confirmation impossible : ' + (res.error.message || 'erreur serveur'));
        return;
      }
      const box = document.createElement('div');
      box.style.cssText = 'margin-top:0.7rem; border-top:1px solid var(--line); padding-top:0.7rem; font-size:0.78rem; color:var(--cyan); line-height:1.5;';
      box.textContent = 'Argent reçu et déblocage envoyé ✓ Le client retrouve son accès directement sur son appareil, ' +
        'sans code à transmettre, et il est prévenu à sa prochaine ouverture même s\'il a fermé la page.';
      card.appendChild(box);
      btn.remove();
      pushNotification('info', 'Argent reçu (' + paymentMethodLabel(row.payment_method) + ') pour ' +
        (row.name || row.email) + ' — accès rétabli, le client est prévenu.');
    }, function(){
      btn.disabled = false;
      alert('Confirmation impossible : vérifiez votre réseau.');
    });
  }

  const refreshUnlockRequestsBtn = document.getElementById('refreshUnlockRequestsBtn');
  if(refreshUnlockRequestsBtn){
    refreshUnlockRequestsBtn.addEventListener('click', renderUnlockRequests);
  }

  // ---------------- NOUVELLES INSCRIPTIONS (propriétaire) ----------------
  const SIGNUPS_SEEN_KEY = 'stockmanager_signups_seen';

  function loadSeenSignupIds(){
    try { return JSON.parse(localStorage.getItem(SIGNUPS_SEEN_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveSeenSignupIds(ids){
    try { localStorage.setItem(SIGNUPS_SEEN_KEY, JSON.stringify(ids.slice(0, 300))); } catch(e){}
  }

  function renderSignups(){
    const body = document.getElementById('signupsTableBody');
    const empty = document.getElementById('signupsEmpty');
    if(!body) return;
    if(!window.__sb){
      body.innerHTML = '';
      if(empty){ empty.style.display = 'block'; empty.textContent = 'Serveur injoignable : impossible de charger les inscriptions.'; }
      return;
    }
    window.__sb.from('client_signups')
      .select('id,name,email,phone,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        body.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';

        const seen = loadSeenSignupIds();
        const fresh = rows.filter(function(r){ return seen.indexOf(r.id) < 0; });
        if(fresh.length && seen.length){
          pushNotification('info', fresh.length + ' nouvelle(s) inscription(s) à Gestion de Stockage.');
        }
        if(fresh.length){
          saveSeenSignupIds(fresh.map(function(r){ return r.id; }).concat(seen));
        }

        rows.forEach(function(row){
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + new Date(row.created_at).toLocaleString('fr-FR') + '</td>' +
            '<td>' + escapeAdminHtml(row.name || '—') + '</td>' +
            '<td>' + escapeAdminHtml(row.email || '—') + '</td>' +
            '<td>' + escapeAdminHtml(row.phone || '—') + '</td>';
          body.appendChild(tr);
        });
      }, function(){
        body.innerHTML = '';
        if(empty){ empty.style.display = 'block'; empty.textContent = 'Chargement impossible : vérifiez votre réseau.'; }
      });
  }

  const refreshSignupsBtn = document.getElementById('refreshSignupsBtn');
  if(refreshSignupsBtn){
    refreshSignupsBtn.addEventListener('click', renderSignups);
  }

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
    // Administratif Fokontany et Administratif Commun : au propriétaire seul.
    // Une classe sur la racine et non un style par élément : la recherche du
    // menu et les icônes épinglées remettent les leurs, pas celle-ci
    // (components.css). isOwnerEmail refuse aussi l'employé entré par son lien.
    document.documentElement.classList.toggle('est-proprietaire',
      !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email)));
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
      .select('id,path,referrer,user_agent,created_at')
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
            '<td>' + shortUserAgent(v.user_agent) + '</td>' +
            '<td style="text-align:right;"><button type="button" class="btn btn-sm" data-effacer-visite ' +
              'title="Effacer" style="width:auto; padding:0.2rem 0.55rem;">✕</button></td>';
          tr.querySelector('[data-effacer-visite]').addEventListener('click', function(){
            effacerVisite(v.id, tr, 1);
          });
          glisserVisite(v.id, tr);
          tbody.appendChild(tr);
        });
      }, function(){});
  }

  // Une visite effacée part pour de bon (règle « owner can delete visits »,
  // supabase-visites-fafana.sql). Si la base refuse, la ligne revient.
  function effacerVisite(id, tr, sens){
    const statut = document.getElementById('siteVisitsStatus');
    tr.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    tr.style.transform = 'translateX(' + sens * (tr.offsetWidth + 40) + 'px)';
    tr.style.opacity = '0';
    window.__sb.from('site_visits').delete().eq('id', id).select('id').then(function(res){
      if(res && !res.error && res.data && res.data.length){
        setTimeout(function(){
          tr.remove();
          const tbody = document.getElementById('siteVisitsTableBody');
          if(tbody && !tbody.children.length) document.getElementById('siteVisitsEmptyHint').style.display = 'block';
        }, 230);
        if(statut) statut.textContent = '';
        return;
      }
      tr.style.transform = '';
      tr.style.opacity = '';
      if(statut) statut.textContent = '⚠ Non effacée : ' + ((res && res.error && res.error.message) ||
        'refusé — passer supabase-visites-fafana.sql dans le SQL Editor');
    }, function(){
      tr.style.transform = '';
      tr.style.opacity = '';
      if(statut) statut.textContent = '⚠ Serveur injoignable.';
    });
  }

  // Glisser la ligne à gauche ou à droite au-delà d'un tiers l'efface.
  function glisserVisite(id, tr){
    tr.style.touchAction = 'pan-y';
    let depart = null, glisse = false, dx = 0;
    function remettre(){
      tr.style.transition = 'transform 0.2s, opacity 0.2s';
      tr.style.transform = '';
      tr.style.opacity = '';
    }
    function debut(x, y, cible){
      if(cible && cible.closest && cible.closest('button')){ depart = null; return; }
      depart = { x: x, y: y }; glisse = false; dx = 0;
    }
    function bouge(x, y){
      if(!depart) return false;
      dx = x - depart.x;
      const dy = y - depart.y;
      if(!glisse){
        if(Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)){ depart = null; return false; }
        if(Math.abs(dx) < 12) return false;
        glisse = true;
        tr.style.transition = 'none';
      }
      tr.style.transform = 'translateX(' + dx + 'px)';
      tr.style.opacity = String(Math.max(1 - Math.abs(dx) / (tr.offsetWidth || 1), 0.25));
      return true;
    }
    function fin(){
      if(!depart) return;
      depart = null;
      if(!glisse) return;
      glisse = false;
      if(Math.abs(dx) >= (tr.offsetWidth || 1) * 0.35) effacerVisite(id, tr, dx < 0 ? -1 : 1);
      else remettre();
    }
    tr.addEventListener('dragstart', function(e){ e.preventDefault(); });
    tr.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ depart = null; remettre(); return; }
      debut(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    tr.addEventListener('touchmove', function(e){
      if(!depart) return;
      if(bouge(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    tr.addEventListener('touchend', fin);
    tr.addEventListener('touchcancel', function(){ depart = null; glisse = false; remettre(); });
    tr.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      debut(e.clientX, e.clientY, e.target);
      if(!depart) return;
      function suivre(ev){ if(bouge(ev.clientX, ev.clientY)) ev.preventDefault(); }
      function lacher(){
        document.removeEventListener('mousemove', suivre);
        document.removeEventListener('mouseup', lacher);
        fin();
      }
      document.addEventListener('mousemove', suivre);
      document.addEventListener('mouseup', lacher);
    });
  }

  const clearSiteVisitsBtn = document.getElementById('clearSiteVisitsBtn');
  if(clearSiteVisitsBtn) clearSiteVisitsBtn.addEventListener('click', function(){
    if(!window.__sb) return;
    if(!confirm('Effacer toutes les visites enregistrées ? Irréversible.')) return;
    const statut = document.getElementById('siteVisitsStatus');
    clearSiteVisitsBtn.disabled = true;
    window.__sb.from('site_visits').delete().not('id', 'is', null).then(function(res){
      clearSiteVisitsBtn.disabled = false;
      if(res && res.error){
        if(statut) statut.textContent = '⚠ Non effacées : ' + res.error.message;
        return;
      }
      if(statut) statut.textContent = '';
      renderSiteVisits();
    }, function(){
      clearSiteVisitsBtn.disabled = false;
      if(statut) statut.textContent = '⚠ Serveur injoignable.';
    });
  });

  document.getElementById('clearLoginsBtn').addEventListener('click', function(){
    if(confirm("Vider tout l'historique des connexions ?")){
      saveLogins([]);
      renderLogins();
    }
  });

  // ---------------- CODES DE DÉVERROUILLAGE PAR CLIENT (admin) ----------------
  // Ouvre le client mail de l'admin, adressé au client, prérempli avec son code.
  function sendCodeToClientByMail(email, code){
    const subject = encodeURIComponent('Votre code de déverrouillage — Ny asako');
    const body = encodeURIComponent(
      'Bonjour,\n\n' +
      'Voici votre code de déverrouillage pour réactiver votre compte Ny asako :\n\n' +
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
  // Les boutiques par lesquelles on achète à l'étranger depuis ici, rangées
  // par ce qu'on y cherche. Trente à la file, ce serait une liste que
  // personne ne lit : on ne cherche pas « une adresse », on cherche « où
  // acheter une perceuse ». Le rangement est donc la moitié du travail.
  //
  // Les liens ajoutés à la main (« Ajouter ») viennent toujours après, sous
  // leur propre titre : ce qui est ici est le fond, pas la liste entière.
  //
  // CETTE LISTE EST RECOPIÉE DANS « supabase/functions/vaovao-boutique » —
  // c'est elle que la maison publie quatre fois par jour dans le fil, et un
  // serveur ne lit pas cette page. Une boutique ajoutée ici et pas là-bas
  // paraît dans cette fenêtre sans jamais venir dans le fil.
  const DEFAULT_MARKETPLACES = [
    {
      // Le gros et l'Asie : c'est là qu'on achète pour revendre.
      groupe: '📦 Ambongadiny sy Azia',
      liens: [
        { name: 'Alibaba', url: 'https://www.alibaba.com' },
        { name: 'AliExpress', url: 'https://www.aliexpress.com' },
        { name: 'Taobao', url: 'https://world.taobao.com' },
        { name: 'Pinduoduo', url: 'https://www.pinduoduo.com' },
        { name: 'Lazada', url: 'https://www.lazada.com' }
      ]
    },
    {
      groupe: '🛒 Ny zavatra rehetra',
      liens: [
        { name: 'Amazon', url: 'https://www.amazon.fr' },
        { name: 'eBay', url: 'https://www.ebay.fr' },
        { name: 'Cdiscount', url: 'https://www.cdiscount.com' },
        { name: 'Fnac', url: 'https://www.fnac.com' },
        { name: 'Rakuten', url: 'https://fr.shopping.rakuten.com' },
        { name: 'E.Leclerc', url: 'https://www.e.leclerc' },
        { name: 'Auchan', url: 'https://www.auchan.fr' },
        { name: 'Rue du Commerce', url: 'https://www.rueducommerce.fr' },
        { name: 'Pixmania', url: 'https://www.pixmania.com' }
      ]
    },
    {
      groupe: '👕 Akanjo sy kiraro',
      liens: [
        { name: 'SHEIN', url: 'https://www.shein.com' },
        { name: 'Zalando', url: 'https://www.zalando.fr' },
        { name: 'ASOS', url: 'https://www.asos.com' },
        { name: 'La Redoute', url: 'https://www.laredoute.fr' },
        { name: 'Spartoo', url: 'https://www.spartoo.com' },
        { name: 'Farfetch', url: 'https://www.farfetch.com' }
      ]
    },
    {
      groupe: '💻 Elektronika sy mozika',
      liens: [
        { name: 'Darty', url: 'https://www.darty.com' },
        { name: 'Boulanger', url: 'https://www.boulanger.com' },
        { name: 'Materiel.net', url: 'https://www.materiel.net' },
        { name: 'Son-Vidéo', url: 'https://www.son-video.com' },
        { name: 'JBL', url: 'https://www.jbl.com' },
        { name: 'Thomann', url: 'https://www.thomann.de' }
      ]
    },
    {
      groupe: '⚽ Fanatanjahantena',
      liens: [
        { name: 'Decathlon', url: 'https://www.decathlon.fr' },
        { name: 'Nike', url: 'https://www.nike.com' }
      ]
    },
    {
      groupe: '🔧 Fitaovana sy fiara',
      liens: [
        { name: 'ManoMano', url: 'https://www.manomano.fr' },
        { name: 'Oscaro', url: 'https://www.oscaro.com' },
        { name: 'AUTODOC', url: 'https://www.autodoc.fr' }
      ]
    }
  ];

  // Une boutique ne se présente pas par son nom : elle se présente par ce
  // qu'elle vend. C'est la même carte que dans le fil — trois images qui
  // tournent, et le nom en dessous —, en plus basse : trente cartes à la
  // hauteur d'un billet, ce serait un couloir.
  //
  // Toutes n'y arriveront pas. Une boutique qui construit sa page dans le
  // navigateur de son visiteur, ou qui refuse ce qui n'est pas une personne,
  // ne laisse rien à prendre : sa carte se réduit alors à son nom — ce
  // qu'était le bouton d'avant. Rien ne se perd.
  const APERCU_HAUT_BOUTIQUE = 58;

  function addMarketplaceBtn(row, name, url){
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'marketplace-carte';
    a.setAttribute('data-apercu', url);
    a.setAttribute('data-apercu-nom', name);
    a.setAttribute('data-apercu-haut', String(APERCU_HAUT_BOUTIQUE));
    a.setAttribute('data-apercu-direct', '');
    const garde = apercuGarde(url);
    dessinerLApercu(a, garde);
    if(!garde) a.setAttribute('data-apercu-attendu', '');
    row.appendChild(a);
  }

  // « effacer », quand il est donné, pose une ✕ sur chaque carte : ce sont
  // les boutiques ajoutées à la main, que la maison peut retirer comme elle
  // les a mises. Celles du fond (DEFAULT_MARKETPLACES) n'en ont pas.
  function ajouterUnGroupe(boite, titre, liens, effacer){
    if(!liens.length) return;
    const nom = document.createElement('div');
    nom.className = 'marketplace-titre';
    nom.textContent = titre;
    boite.appendChild(nom);
    const ligne = document.createElement('div');
    ligne.className = 'marketplace-cartes';
    liens.forEach(function(m){
      if(!effacer){ addMarketplaceBtn(ligne, m.name, m.url); return; }
      const cadre = document.createElement('div');
      cadre.className = 'marketplace-sien';
      addMarketplaceBtn(cadre, m.name, m.url);
      const croix = document.createElement('button');
      croix.type = 'button';
      croix.className = 'marketplace-fafao';
      croix.textContent = '✕';
      croix.title = 'Fafao ' + m.name;
      croix.setAttribute('aria-label', 'Fafao ' + m.name);
      croix.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        effacer(m, croix);
      });
      cadre.appendChild(croix);
      ligne.appendChild(cadre);
    });
    boite.appendChild(ligne);
  }

  // Les adresses que la maison ajoute elle-même, boutiques comme
  // transporteurs. Chaque sorte a sa table, et le billet qu'elle laisse dans
  // le fil porte la même étiquette et la même invitation que ceux de la
  // machine (SORTES, dans supabase/functions/vaovao-boutique).
  const LES_SIENS = {
    boutique: { table: 'marketplace_links', boite: 'marketplaceLinks',
      reseau: 'Boutique', icone: '🛍️', invite: 'Tsindrio ny rohy hijerena izay amidy any.' },
    livraison: { table: 'livraison_links', boite: 'livraisonLinks',
      reseau: 'Livraison international', icone: '🚚', invite: 'Tsindrio ny rohy hijerena ny fomba handefasany entana.' }
  };
  function redessiner(sorte){
    if(sorte === 'livraison') renderLivraisonLinks(); else renderMarketplaceLinks();
  }

  // Retirer une adresse ajoutée : de la liste, et du fil de la Botika où
  // son billet était parti à l'enregistrement — il y ferait encore la
  // réclame d'une adresse qu'on a jugé bon d'enlever. Le billet va à la
  // corbeille, comme tout billet effacé depuis le fil.
  function effacerUnLien(sorte){
    const conf = LES_SIENS[sorte];
    return function(m, croix){
      if(!window.__sb || !m.id) return;
      if(!confirm('Hofafana ve i « ' + m.name + ' » ?')) return;
      croix.disabled = true;
      window.__sb.from(conf.table).delete().eq('id', m.id).select('id')
        .then(function(res){
          if(!res || res.error || !res.data || !res.data.length){
            croix.disabled = false;
            alert('Tsy voafafa : ny tompon\'ny Botika ihany no afaka mamafa.');
            return;
          }
          redessiner(sorte);
          return window.__sb.from('client_news').update({ deleted_at: new Date().toISOString() })
            .eq('link', m.url).eq('client_name', MARQUE_NOM).is('deleted_at', null)
            .then(function(){ renderCommunityNews(); }, function(){});
        }, function(){ croix.disabled = false; alert('Tsy voafafa.'); });
    };
  }

  // Le champ « Anarana » n'est qu'à la maison (la base refuse les autres).
  // Il se règle à chaque ouverture du panneau : réglé seulement avec le
  // fil, il restait caché tant que le fil n'avait pas été ouvert.
  function montrerLeFormulaireDeLaMaison(id){
    const formulaire = document.getElementById(id);
    if(formulaire) formulaire.style.display = jeSuisLaMaison() ? 'block' : 'none';
  }

  // Sous leur propre titre, après le fond : on doit pouvoir distinguer d'un
  // coup d'œil ce qu'on a ajouté soi-même de ce qui était là.
  function ajouterLesSiens(boite, sorte){
    if(!window.__sb) return;
    window.__sb.from(LES_SIENS[sorte].table).select('id,name,url').order('created_at', { ascending: true })
      .then(function(res){
        const siens = (res && res.data) || [];
        ajouterUnGroupe(boite, '⭐ Ny anao', siens.filter(function(m){ return m && m.name && m.url; }),
          jeSuisLaMaison() ? effacerUnLien(sorte) : null);
        chercherLesApercus();
      }, function(){});
  }

  function renderMarketplaceLinks(){
    const boite = document.getElementById('marketplaceLinks');
    if(!boite) return;
    boite.innerHTML = '';
    DEFAULT_MARKETPLACES.forEach(function(g){ ajouterUnGroupe(boite, g.groupe, g.liens); });
    ajouterLesSiens(boite, 'boutique');
    montrerLeFormulaireDeLaMaison('marketplaceAdminForm');
    chercherLesApercus();
    veillerSurLeTourDesApercus();
  }

  // ---------------- LIVRAISON INTERNATIONAL ----------------
  // Acheter à l'étranger est la moitié du chemin. L'autre moitié — faire
  // venir la marchandise jusqu'ici — n'était écrite nulle part : chacun
  // cherchait son transporteur de son côté, et recommençait la fois d'après.
  //
  // LE RANGEMENT EST LA MOITIÉ DU TRAVAIL, comme pour les boutiques. On ne
  // cherche pas « un transporteur » : on cherche « faire venir un conteneur »
  // ou « faire venir un colis de trois kilos », et ce ne sont pas les mêmes
  // maisons. Le premier groupe est celui du colis, parce que c'est le cas de
  // presque tout le monde ; le conteneur vient après.
  //
  // RIEN N'EST ICI QUI NE SOIT LE SITE DE LA MAISON ELLE-MÊME. Pas de
  // comparateur, pas d'intermédiaire qui prend une commission pour recopier
  // un tarif : on va chez le transporteur, et l'on traite avec lui.
  //
  // Comme pour les boutiques, la maison complète la liste depuis la page
  // (« ⭐ Ny anao », table livraison_links, voir LES_SIENS).
  //
  // La même liste est recopiée dans supabase/functions/vaovao-boutique
  // (TRANSPORTEURS), qui les publie dans le fil : l'une bouge, l'autre suit.
  const DEFAULT_TRANSPORTEURS = [
    {
      // Le cas de presque tout le monde : un colis, quelques kilos, de porte
      // à porte, et l'on suit son numéro.
      groupe: '📦 Kolisy haingana (express)',
      liens: [
        { name: 'DHL Express', url: 'https://www.dhl.com' },
        { name: 'FedEx', url: 'https://www.fedex.com' },
        { name: 'UPS', url: 'https://www.ups.com' },
        { name: 'TNT', url: 'https://www.tnt.com' },
        { name: 'Chronopost', url: 'https://www.chronopost.fr' },
        { name: 'Colissimo', url: 'https://www.laposte.fr/colissimo' },
        { name: 'Aramex', url: 'https://www.aramex.com' },
        { name: 'DPD', url: 'https://www.dpd.com' },
        { name: 'GLS', url: 'https://gls-group.com' }
      ]
    },
    {
      // Le conteneur : lent, et sans rival dès que la marchandise pèse.
      groupe: '🚢 An-dranomasina (maritime)',
      liens: [
        { name: 'CMA CGM', url: 'https://www.cma-cgm.com' },
        { name: 'MSC', url: 'https://www.msc.com' },
        { name: 'Maersk', url: 'https://www.maersk.com' },
        { name: 'Hapag-Lloyd', url: 'https://www.hapag-lloyd.com' },
        { name: 'Evergreen', url: 'https://www.evergreen-line.com' },
        { name: 'COSCO', url: 'https://lines.coscoshipping.com' },
        { name: 'ONE', url: 'https://www.one-line.com' },
        { name: 'PIL', url: 'https://www.pilship.com' },
        { name: 'ZIM', url: 'https://www.zim.com' },
        { name: 'Messina Line', url: 'https://www.messinaline.it' }
      ]
    },
    {
      // Le fret aérien, pour ce qui est cher, fragile ou pressé. Ce sont les
      // compagnies elles-mêmes : celles qui se posent dans la région d'abord.
      groupe: '🛫 An\'habakabaka (aérien)',
      liens: [
        { name: 'Emirates SkyCargo', url: 'https://www.skycargo.com' },
        { name: 'Turkish Cargo', url: 'https://www.turkishcargo.com' },
        { name: 'Qatar Airways Cargo', url: 'https://www.qrcargo.com' },
        { name: 'Lufthansa Cargo', url: 'https://lufthansa-cargo.com' },
        { name: 'Ethiopian Airlines', url: 'https://www.ethiopianairlines.com' },
        { name: 'Kenya Airways', url: 'https://www.kenya-airways.com' },
        { name: 'Air Austral', url: 'https://www.air-austral.com' },
        { name: 'Corsair', url: 'https://www.corsair.fr' }
      ]
    },
    {
      // Celui qui fait le chemin entier à votre place : il groupe, il charge,
      // il dédouane. C'est à lui qu'on parle quand on ne veut traiter qu'avec
      // une seule maison.
      groupe: '🧭 Transitaires (groupage)',
      liens: [
        { name: 'Kuehne+Nagel', url: 'https://home.kuehne-nagel.com' },
        { name: 'DB Schenker', url: 'https://www.dbschenker.com' },
        { name: 'DSV', url: 'https://www.dsv.com' },
        { name: 'Geodis', url: 'https://geodis.com' },
        { name: 'AGL', url: 'https://www.aglgroup.com' }
      ]
    },
    {
      // Ce qui attend la marchandise au bout du voyage. La douane surtout :
      // c'est elle qui décide du jour où l'on pourra retirer le colis.
      groupe: '🇲🇬 Eto Madagasikara',
      liens: [
        { name: 'Paositra Malagasy', url: 'https://www.paositramalagasy.mg' },
        { name: 'Madagascar Airlines', url: 'https://www.madagascarairlines.com' },
        { name: 'Douanes Malagasy', url: 'https://www.douanes.gov.mg' }
      ]
    },
    {
      // Le numéro de suivi ne dit rien du transporteur qui le porte quand la
      // marchandise change de mains en route. Ces deux-là les interrogent
      // tous à la fois.
      groupe: '🔎 Fanarahana entana',
      liens: [
        { name: '17TRACK', url: 'https://www.17track.net' },
        { name: 'Parcels App', url: 'https://parcelsapp.com' }
      ]
    }
  ];

  // Les mêmes cartes que les boutiques, et pour la même raison : une maison
  // de transport ne se reconnaît pas à son nom écrit en petit, mais à sa page.
  function renderLivraisonLinks(){
    const boite = document.getElementById('livraisonLinks');
    if(!boite) return;
    boite.innerHTML = '';
    DEFAULT_TRANSPORTEURS.forEach(function(g){ ajouterUnGroupe(boite, g.groupe, g.liens); });
    ajouterLesSiens(boite, 'livraison');
    montrerLeFormulaireDeLaMaison('livraisonAdminForm');
    chercherLesApercus();
    veillerSurLeTourDesApercus();
  }

  // ---------------- CHROME ET EDGE ----------------
  // Deux entrées du menu pour sortir chercher ailleurs. On ouvre l'application
  // elle-même quand l'appareil sait le faire, et sa page de recherche sinon :
  //   - Android : un lien « intent » vers l'application, avec la page de
  //     recherche en repli si elle n'est pas installée ;
  //   - iPhone : l'adresse propre à l'application, puis la page de recherche
  //     si rien ne s'est ouvert ;
  //   - Windows : Edge répond à « microsoft-edge: » ; Chrome n'a pas d'adresse
  //     à lui, il reçoit un onglet ;
  //   - ailleurs : un onglet.
  const NAVIGATEURS = {
    chrome: { page: 'https://www.google.com', android: 'com.android.chrome', ios: 'googlechromes://www.google.com' },
    edge: { page: 'https://www.bing.com', android: 'com.microsoft.emmx', ios: 'microsoft-edge-https://www.bing.com', windows: 'microsoft-edge:https://www.bing.com' },
    // Safari n'a pas d'adresse à lui : c'est le navigateur de l'iPhone, qui
    // reçoit tout lien qu'on ouvre. Ailleurs, le navigateur qu'on a.
    safari: { page: 'https://www.google.com' }
  };

  // « page » : une adresse précise à ouvrir dans ce navigateur (la recherche
  // de la loupe), au lieu de sa page d'accueil.
  function ouvrirLeNavigateur(nom, page){
    const base = NAVIGATEURS[nom];
    if(!base) return;
    if(nom === 'safari'){ window.open(page || base.page, '_blank', 'noopener'); return; }
    const n = page ? {
      page: page, android: base.android,
      ios: nom === 'chrome' ? page.replace(/^https:\/\//, 'googlechromes://') : 'microsoft-edge-' + page,
      windows: base.windows ? 'microsoft-edge:' + page : null
    } : base;
    const ua = navigator.userAgent || '';
    if(/Android/i.test(ua)){
      const hote = n.page.replace(/^https:\/\//, '');
      location.href = 'intent://' + hote + '#Intent;scheme=https;package=' + n.android +
        ';S.browser_fallback_url=' + encodeURIComponent(n.page) + ';end';
      return;
    }
    if(/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)){
      // L'application ouverte, la page passe en arrière-plan : le repli ne
      // part que si l'on est toujours là.
      const repli = setTimeout(function(){
        if(!document.hidden) window.open(n.page, '_blank', 'noopener');
      }, 1200);
      document.addEventListener('visibilitychange', function annuler(){
        if(document.hidden){ clearTimeout(repli); document.removeEventListener('visibilitychange', annuler); }
      });
      location.href = n.ios;
      return;
    }
    if(n.windows && /Windows/i.test(ua) && !/Edg\//.test(ua)){
      location.href = n.windows;
      return;
    }
    window.open(n.page, '_blank', 'noopener');
  }

  window.__ouvrirLeNavigateur = ouvrirLeNavigateur;

  document.querySelectorAll('[data-navigateur]').forEach(function(bouton){
    bouton.addEventListener('click', function(){
      ouvrirLeNavigateur(bouton.getAttribute('data-navigateur'));
      const menu = document.getElementById('navList');
      if(menu && menu.classList.contains('open')){
        menu.classList.remove('open');
        const bascule = document.getElementById('menuToggle');
        if(bascule) bascule.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // La fenêtre des boutiques s'ouvre, ou l'on y descend : les cartes que l'on
  // découvre vont chercher leurs images à ce moment-là, et pas avant. Celle
  // des transporteurs se conduit de même.
  (function(){
    [['marketPanel', 'marketToggle'], ['livraisonPanel', 'livraisonToggle']].forEach(function(paire){
      const panneau = document.getElementById(paire[0]);
      const bouton = document.getElementById(paire[1]);
      if(bouton) bouton.addEventListener('click', function(){ setTimeout(chercherLesApercus, 50); });
      if(panneau) panneau.addEventListener('scroll', function(){ chercherLesApercus(); }, { passive: true });
    });
  })();

  // Enregistrer, c'est aussi l'annoncer : l'adresse part tout de suite dans
  // le fil de la Botika, sous la marque, sans attendre que la machine
  // (vaovao-boutique) la tire à son tour. Le même geste sert aux boutiques
  // et aux transporteurs.
  //
  // On ne tape que le nom : pas d'adresse à chercher ni à recopier. Le site
  // officiel est cherché ici même, et la carte y mène tout droit ; faute de
  // le trouver, elle mène à la recherche de ce nom. C'est le nom qu'on y lit.
  //
  // Le site vient de DuckDuckGo (réponse instantanée, ouverte au navigateur) :
  // il connaît le site officiel des marques connues, et rien d'une petite
  // maison d'ici — d'où la recherche en repli. Un nom tapé comme une adresse
  // (« wish.com ») est pris tel quel.
  function trouverLeSite(name){
    if(/^https?:\/\/\S+$/i.test(name)) return Promise.resolve(name);
    if(/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name)) return Promise.resolve('https://' + name);
    const repli = 'https://www.google.com/search?q=' + encodeURIComponent(name);
    const attente = new Promise(function(ok){ setTimeout(function(){ ok(repli); }, 6000); });
    const question = fetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=' + encodeURIComponent(name))
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){
        const premier = d && d.Results && d.Results[0] && d.Results[0].FirstURL;
        const site = (d && d.OfficialWebsite) || premier || '';
        return /^https?:\/\//i.test(site) ? site : repli;
      })
      .catch(function(){ return repli; });
    return Promise.race([question, attente]);
  }

  // Le lien, quand on le donne, passe avant la recherche par le nom.
  function brancherLEnregistrement(sorte, idBouton, idNom, idLien){
    const bouton = document.getElementById(idBouton);
    if(!bouton) return;
    const conf = LES_SIENS[sorte];
    bouton.addEventListener('click', function(){
      const champNom = document.getElementById(idNom);
      const name = champNom.value.trim();
      if(!name){ champNom.focus(); return; }
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      const champLien = idLien ? document.getElementById(idLien) : null;
      const lien = champLien ? champLien.value.trim() : '';
      bouton.disabled = true;
      let url = '';
      trouverLeSite(lien || name)
        .then(function(trouve){
          url = trouve;
          return window.__sb.from(conf.table).insert({ name: name, url: url }).select('id');
        })
        .then(function(res){
          if(!res || res.error){ throw (res && res.error) || new Error('refus'); }
          champNom.value = '';
          if(champLien) champLien.value = '';
          redessiner(sorte);
          return window.__sb.from('client_news').insert({
            client_name: MARQUE_NOM, network: conf.reseau,
            message: conf.icone + ' ' + name + '\n' + conf.invite,
            link: url, type: 'vaovao', price: null, image: null,
            author_email: (currentUser && currentUser.email) || null,
            author_photo: MARQUE_LOGO
          }).then(function(r){
            if(r && r.error) alert('Voatahiry, fa tsy tafiditra tao amin\'ny Botika.');
            renderCommunityNews();
          });
        })
        .then(function(){ bouton.disabled = false; },
          function(){ bouton.disabled = false; alert('Tsy voatahiry : ny tompon\'ny Botika ihany no afaka manampy.'); });
    });
  }
  brancherLEnregistrement('boutique', 'addMarketBtn', 'newMarketName', 'newMarketUrl');
  brancherLEnregistrement('livraison', 'addLivraisonBtn', 'newLivraisonName', 'newLivraisonUrl');

  // Le portrait complet pèse des dizaines de kilo-octets. Recopié sur chaque
  // publication, il alourdirait le fil d'autant de fois qu'il y a de billets,
  // pour finir affiché dans un rond de 42 pixels. On en garde une vignette.
  const TAILLE_VIGNETTE = 96;
  function vignette(source){
    return new Promise(function(resoudre){
      if(!source) return resoudre(null);
      const img = new Image();
      img.onload = function(){
        try{
          const c = document.createElement('canvas');
          c.width = TAILLE_VIGNETTE; c.height = TAILLE_VIGNETTE;
          const ctx = c.getContext('2d');
          // Recadrage au centre sur le plus petit côté : le visage reste au
          // milieu, et rien n'est étiré.
          const cote = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote,
                             0, 0, TAILLE_VIGNETTE, TAILLE_VIGNETTE);
          resoudre(c.toDataURL('image/jpeg', 0.72));
        }catch(e){ resoudre(null); }
      };
      // Une image illisible ne doit pas empêcher de publier.
      img.onerror = function(){ resoudre(null); };
      img.src = source;
    });
  }

  // ---------------- LE FIL PARLE AU NOM DE LA MAISON ----------------
  //
  // Le propriétaire n'écrit pas ici en son nom propre. Le fil est la vitrine
  // de l'application : celui qui le lit vient chez « Ny asako », pas chez
  // quelqu'un. Ses billets paraissent donc sous la marque et sous son logo,
  // comme ceux que la maison publie toute seule (fonction « vaovao-boutique »).
  //
  // Les billets des autres clients gardent leur nom et leur visage : c'est
  // une communauté, et non une seule voix.
  const MARQUE_NOM = 'Ny asako';
  const MARQUE_LOGO = '/icone-192.png';

  // Celui qui écrit en ce moment est-il la maison ? L'adresse du compte, et
  // non le nom affiché : un nom se retape, une adresse de compte non.
  function jeSuisLaMaison(){
    return !!(currentUser && currentUser.email &&
      currentUser.email.trim().toLowerCase() === String(OWNER_EMAIL).trim().toLowerCase());
  }

  // Un billet déjà écrit se reconnaît de même à l'adresse de son auteur. Le
  // nom de la marque rattrape ceux que la machine publie, qui n'ont pas
  // d'adresse, et les anciens billets d'avant ce changement gardent le nom
  // sous lequel ils sont partis : on ne réécrit pas le passé de quelqu'un.
  function estBilletDeLaMarque(n){
    if(!n) return false;
    const adresse = String(n.author_email || '').trim().toLowerCase();
    if(adresse && adresse === String(OWNER_EMAIL).trim().toLowerCase()) return true;
    return String(n.client_name || '').trim() === MARQUE_NOM;
  }

  // Le billet est-il de celui qui regarde ? Même règle que la base : une
  // adresse d'auteur, et la même que celle du compte. Un billet sans adresse
  // n'est à personne.
  function estMonBillet(n){
    const adresse = String((n && n.author_email) || '').trim().toLowerCase();
    const moi = (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : '';
    return !!(adresse && moi && adresse === moi && n.id);
  }

  // Le billet part du côté où on l'a poussé (sens : -1 gauche, 1 droite), puis
  // la place se referme.
  function faireSortirLeBillet(div, sens){
    div.style.transition = 'transform 0.25s ease-in, opacity 0.25s ease-in';
    div.style.transform = 'translateX(' + ((sens || 1) * 110) + '%)';
    div.style.opacity = '0';
    setTimeout(function(){
      // La place se referme doucement au lieu de sauter.
      div.style.overflow = 'hidden';
      div.style.maxHeight = div.offsetHeight + 'px';
      div.offsetHeight;
      div.style.transition = 'max-height 0.2s, margin 0.2s, padding 0.2s';
      div.style.maxHeight = '0';
      div.style.marginTop = div.style.marginBottom = '0';
      div.style.paddingTop = div.style.paddingBottom = '0';
      setTimeout(function(){ div.remove(); }, 220);
    }, 250);
  }

  // Effacer n'efface plus : le billet passe à la corbeille, où son auteur peut
  // le reprendre ou l'effacer pour de bon (supabase-corbeille.sql). Rien ne se
  // perd sur un geste, d'où l'absence de question ici — elle est posée là où
  // l'on efface vraiment. Refusé ou manqué, il revient à sa place.
  function effacerMonBillet(n, div, bouton, sens){
    const remettre = function(){
      div.style.transition = 'transform 0.2s, opacity 0.2s';
      div.style.transform = '';
      div.style.opacity = '';
    };
    if(!window.__sb || !estMonBillet(n)){ remettre(); return; }
    if(bouton){
      bouton.style.pointerEvents = 'none';
      bouton.textContent = '⏳ Mamafa…';
    }
    // « select » après « update » : une règle qui refuse n'est pas une
    // erreur, elle touche zéro ligne. Seule la ligne rendue dit que c'est fait.
    window.__sb.from('client_news').update({ deleted_at: new Date().toISOString() })
      .eq('id', n.id).select('id')
      .then(function(res){
        if(!(res && !res.error && res.data && res.data.length)) throw (res && res.error) || new Error('refus');
        faireSortirLeBillet(div, sens);
      })
      .catch(function(err){
        if(bouton){
          bouton.style.pointerEvents = '';
          bouton.innerHTML = LOGO_FAFANA;
        }
        remettre();
        // La colonne manque tant que supabase-corbeille.sql n'est pas passé.
        const sansCorbeille = err && (err.code === '42703' || err.code === 'PGRST204');
        alert(sansCorbeille
          ? 'Tsy mbola vonona ny Corbeille (supabase-corbeille.sql tsy mbola nalefa).'
          : 'Tsy voafafa ilay publication. Andramo indray.');
      });
  }

  // Glisser son billet à gauche ou à droite l'efface, comme le bouton. Le
  // geste ne commence qu'une fois franchement horizontal : un doigt qui fait
  // défiler le fil ne doit rien déplacer.
  //
  // Le doigt passe par touchstart / touchmove, comme les lignes du stock
  // (stock.js) : sur téléphone, les événements « pointer » sont annulés dès
  // que le navigateur croit à un défilement, et le billet ne bougeait pas.
  // La souris a son propre chemin.
  const GLISSE_SEUIL = 0.35;
  function glisserPourEffacer(n, div){
    if(!estMonBillet(n)) return;
    div.style.touchAction = 'pan-y';
    // À la souris, une image se laisserait tirer hors de la page à la place.
    div.addEventListener('dragstart', function(e){ e.preventDefault(); });

    // Seuls les champs, boutons et vidéos gardent leurs gestes : la carte du
    // lien et les images, qui couvrent presque tout le billet, se glissent
    // aussi. Le clic qui suivrait un glissement est avalé (plus bas).
    const intouchable = function(cible){
      return !!(cible && cible.closest && cible.closest('input, textarea, button, select, video, [contenteditable]'));
    };

    let depart = null, glisse = false, dx = 0;
    function debut(x, y, cible){
      if(intouchable(cible)) { depart = null; return; }
      depart = { x: x, y: y };
      glisse = false; dx = 0;
    }
    function bouge(x, y){
      if(!depart) return false;
      dx = x - depart.x;
      const dy = y - depart.y;
      if(!glisse){
        // Plus vertical qu'horizontal : c'est le fil qui défile.
        if(Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)){ depart = null; return false; }
        if(Math.abs(dx) < 12) return false;
        glisse = true;
        div.style.transition = 'none';
      }
      const part = Math.min(Math.abs(dx) / (div.offsetWidth || 1), 1);
      div.style.transform = 'translateX(' + dx + 'px)';
      div.style.opacity = String(1 - part * 0.6);
      return true;
    }
    function fin(){
      if(!depart){ return; }
      depart = null;
      if(!glisse) return;
      glisse = false;
      // Un clic suit parfois la fin du geste : il ne doit rien ouvrir. S'il
      // ne vient pas, la garde tombe d'elle-même.
      const arreter = function(ev){ ev.stopPropagation(); ev.preventDefault(); };
      div.addEventListener('click', arreter, true);
      setTimeout(function(){ div.removeEventListener('click', arreter, true); }, 350);
      if(Math.abs(dx) >= div.offsetWidth * GLISSE_SEUIL){
        effacerMonBillet(n, div, div.querySelector('[data-delete-post]'), dx < 0 ? -1 : 1);
      } else {
        div.style.transition = 'transform 0.2s, opacity 0.2s';
        div.style.transform = '';
        div.style.opacity = '';
      }
    }
    function annuler(){
      if(!depart && !glisse) return;
      depart = null; glisse = false;
      div.style.transition = 'transform 0.2s, opacity 0.2s';
      div.style.transform = '';
      div.style.opacity = '';
    }

    // ---- doigt ----
    div.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ annuler(); return; }
      debut(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    div.addEventListener('touchmove', function(e){
      if(!depart) return;
      // Une fois le geste reconnu comme horizontal, la page ne défile plus.
      if(bouge(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    div.addEventListener('touchend', fin);
    div.addEventListener('touchcancel', annuler);

    // ---- souris ----
    div.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      debut(e.clientX, e.clientY, e.target);
      if(!depart) return;
      function suivre(ev){ bouge(ev.clientX, ev.clientY); }
      function lacher(){
        document.removeEventListener('mousemove', suivre);
        document.removeEventListener('mouseup', lacher);
        fin();
      }
      document.addEventListener('mousemove', suivre);
      document.addEventListener('mouseup', lacher);
    });
  }

  // ---------------- CORBEILLE ----------------
  // Les publications que leur auteur a effacées. Elles ne sont plus sur le
  // site pour personne ; ici, on les reprend ou on les efface pour de bon.
  //
  // Nul besoin de filtrer par auteur : la base ne rend un billet à la
  // corbeille qu'à celui qui l'a écrit (supabase-corbeille.sql).
  function renderCorbeille(){
    const liste = document.getElementById('corbeilleListe');
    const vide = document.getElementById('corbeilleVide');
    const statut = document.getElementById('corbeilleStatut');
    const vider = document.getElementById('corbeilleVider');
    if(!liste) return;
    liste.innerHTML = '';
    vide.style.display = 'none';
    vider.style.display = 'none';
    if(!window.__sb || !(currentUser && currentUser.email)){
      statut.textContent = 'Midira amin\'ny kaontinao aloha vao hahita ny Corbeille.';
      return;
    }
    statut.textContent = '⏳ Mitady…';
    window.__sb.from('client_news')
      .select('id,message,type,created_at,deleted_at,author_email')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }).limit(100)
      .then(function(res){
        if(res && res.error){
          const manque = res.error.code === '42703' || res.error.code === 'PGRST204';
          statut.textContent = manque
            ? 'Tsy mbola vonona ny Corbeille : alefaso ao amin\'ny Supabase ny supabase-corbeille.sql.'
            : 'Tsy azo ny Corbeille. Andramo indray.';
          return;
        }
        const lignes = ((res && res.data) || []).filter(estMonBillet);
        statut.textContent = lignes.length
          ? 'Voafafa ho azy ny publication rehefa feno 30 andro hatramin\'ny namoahana azy.'
          : '';
        vide.style.display = lignes.length ? 'none' : 'block';
        vider.style.display = lignes.length ? '' : 'none';
        lignes.forEach(function(n){ liste.appendChild(carteDeCorbeille(n)); });
      }, function(){ statut.textContent = 'Tsy azo ny Corbeille. Andramo indray.'; });
  }

  function corbeilleApresRetrait(){
    setTimeout(function(){
      const liste = document.getElementById('corbeilleListe');
      if(!liste || liste.childElementCount) return;
      document.getElementById('corbeilleVide').style.display = 'block';
      document.getElementById('corbeilleVider').style.display = 'none';
      document.getElementById('corbeilleStatut').textContent = '';
    }, 520);
  }

  function carteDeCorbeille(n){
    const div = document.createElement('div');
    div.className = 'fb-post';
    const quand = function(d){ return d ? new Date(d).toLocaleString('fr-FR') : ''; };
    const texte = String(n.message || '').trim();
    div.innerHTML =
      '<div class="fb-post-meta"><span>Navoaka ' + escapeHtml(quand(n.created_at)) + '</span>' +
        '<span>· Nofafana ' + escapeHtml(quand(n.deleted_at)) + '</span></div>' +
      '<div class="fb-post-body">' + escapeHtml(texte.length > 280 ? texte.slice(0, 280) + '…' : texte) + '</div>' +
      '<div class="fb-post-actions">' +
        '<span class="fb-share-action" data-restaurer style="cursor:pointer; color:var(--cyan);">↩️ Averina</span>' +
        '<span class="fb-share-action fb-partager" data-detruire style="cursor:pointer;" title="Fafana tanteraka" aria-label="Fafana tanteraka" role="button">' + LOGO_FAFANA + '</span>' +
      '</div>';
    const restaurer = div.querySelector('[data-restaurer]');
    const detruire = div.querySelector('[data-detruire]');
    const occupe = function(el, texte){ el.style.pointerEvents = texte ? 'none' : ''; if(texte) el.textContent = texte; };

    restaurer.addEventListener('click', function(){
      occupe(restaurer, '⏳ Averina…');
      window.__sb.from('client_news').update({ deleted_at: null }).eq('id', n.id).select('id')
        .then(function(res){
          if(!(res && !res.error && res.data && res.data.length)) throw new Error('refus');
          faireSortirLeBillet(div, -1);
          corbeilleApresRetrait();
          if(typeof renderCommunityNews === 'function') renderCommunityNews();
        })
        .catch(function(){
          occupe(restaurer, '');
          restaurer.textContent = '↩️ Averina';
          alert('Tsy voaverina ilay publication. Andramo indray.');
        });
    });

    detruire.addEventListener('click', function(){
      if(!confirm('Fafana tanteraka ve ity publication ity? Tsy azo averina intsony izany.')) return;
      occupe(detruire, '⏳ Mamafa…');
      // Les commentaires et les « j'aime » partent avec lui (on delete cascade).
      window.__sb.from('client_news').delete().eq('id', n.id).select('id')
        .then(function(res){
          if(!(res && !res.error && res.data && res.data.length)) throw new Error('refus');
          faireSortirLeBillet(div, 1);
          corbeilleApresRetrait();
        })
        .catch(function(){
          occupe(detruire, '');
          detruire.innerHTML = LOGO_FAFANA;
          alert('Tsy voafafa ilay publication. Andramo indray.');
        });
    });
    return div;
  }

  (function(){
    const vider = document.getElementById('corbeilleVider');
    if(!vider) return;
    vider.addEventListener('click', function(){
      if(!window.__sb) return;
      if(!confirm('Fafana tanteraka daholo ve ireo publication rehetra ao amin\'ny Corbeille? Tsy azo averina intsony izany.')) return;
      vider.disabled = true;
      // La base n'efface que les billets de celui qui demande : « tous ceux
      // de la corbeille » ne vise donc que les siens.
      window.__sb.from('client_news').delete().not('deleted_at', 'is', null).select('id')
        .then(function(res){
          vider.disabled = false;
          if(res && res.error) throw res.error;
          renderCorbeille();
        })
        .catch(function(){
          vider.disabled = false;
          alert('Tsy voafafa ny Corbeille. Andramo indray.');
        });
    });
  })();

  // Le nom et le visage à montrer : ceux de la marque pour la maison, ceux du
  // billet pour tous les autres.
  function nomAffiche(n){
    if(estBilletDeLaMarque(n)) return MARQUE_NOM;
    return (n && n.client_name) || '';
  }
  function photoAffichee(n){
    if(estBilletDeLaMarque(n)) return MARQUE_LOGO;
    return (n && n.author_photo) || '';
  }

  function initials(name){
    if(!name) return '?';
    const parts = name.trim().split(/\s+/);
    const chars = parts.length > 1 ? (parts[0][0] + parts[1][0]) : parts[0].slice(0,2);
    return chars.toUpperCase();
  }

  // Une vidéo ne se devine qu'à son adresse : « data:video/… » pour ce qui
  // vit dans la ligne, une extension pour ce qui vit au bucket. Les photos,
  // elles, restent des « data:image/… ».
  function estVideo(src){
    var s = String(src || '');
    return /^data:video\//i.test(s) || /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(s);
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
  // Le lien d'une annonce mène à la boutique, et non à « Connexion » : on
  // montre la marchandise avant de demander un compte. Celui qui n'en veut
  // pas ne s'inscrit pas, et celui qui en veut trouve le bouton.
  //
  // Le parrainage suit dans « ref » — celui qui partage garde son filleul,
  // même si le chemin passe maintenant par la boutique — et « a » désigne
  // l'annonce, pour qu'on tombe dessus et non sur le fil entier.
  function lienDeLAnnonce(n){
    if(n.link && /^https?:\/\//i.test(n.link)) return n.link;
    const base = appShareLink();
    let racine = base.split('?')[0].replace(/confirmation\/?$/, '');
    if(!/\/$/.test(racine)) racine += '/';
    let ref = '';
    const m = base.match(/[?&]ref=([^&]*)/);
    if(m) ref = m[1];
    const bouts = [];
    if(ref) bouts.push('ref=' + ref);
    if(n.id) bouts.push('a=' + encodeURIComponent(n.id));
    return racine + 'botika/' + (bouts.length ? '?' + bouts.join('&') : '');
  }

  function sharePost(n){
    const parts = [];
    const signature = nomAffiche(n);
    if(signature) parts.push(signature + ' :');
    if(n.message) parts.push(n.message);
    if(n.price) parts.push('(' + formatAr(n.price) + ')');
    const text = parts.join(' ').trim() || 'Vaovao ao amin\'ny asako';
    const link = lienDeLAnnonce(n);

    function shareTextOnly(){
      if(typeof shareContent === 'function'){
        shareContent({ title: 'Ny asako', text: text, url: link });
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

  // Le même message que « Partager », mais adressé à la liste des clients
  // plutôt qu'à la fenêtre de WhatsApp, qui n'en accepte qu'une poignée.
  function shareToutLeMonde(n){
    if(typeof window.__zaraoAminyRehetra !== 'function') return;
    const parts = [];
    const signature = nomAffiche(n);
    if(signature) parts.push(signature + ' :');
    if(n.message) parts.push(n.message);
    if(n.price) parts.push('(' + formatAr(n.price) + ')');
    const text = parts.join(' ').trim() || 'Vaovao ao amin\'ny asako';
    const link = lienDeLAnnonce(n);
    window.__zaraoAminyRehetra({ texte: text, rohy: link });
  }

  // Ouvre « Acheter » avec ce que l'annonce dit déjà : le nom, le prix, le
  // vendeur. Il ne reste qu'à confirmer la quantité — recopier ces trois
  // choses de mémoire est le meilleur moyen de se tromper de prix.
  function buyFromPost(post, isa){
    if(typeof showDashView === 'function') showDashView('acheter');
    if(typeof populateAcheterItemSelect === 'function') populateAcheterItemSelect();

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
    if(fournisseur) fournisseur.value = nomAffiche(post) || '';
    if(qty) qty.value = isa || 1;
    if(statut){
      statut.textContent = existant
        ? 'Entana efa ao amin\'ny stock : ampio ny isa, dia tsindrio « Acheter ».'
        : 'Feno ho anao avy amin\'ny fanambarana. Jereo ny isa, dia tsindrio « Acheter ».';
    }
    if(nom || select) (existant ? qty : nom || qty).focus();
  }

  // ---------------- LE PANIER ----------------
  // On met de côté ce qu'on veut acheter en parcourant le fil, puis on le
  // retrouve en un seul endroit : combien de chaque, et le total. Acheter une
  // ligne reprend le chemin qui existait déjà (buyFromPost), la quantité en
  // plus. Le panier est gardé sur l'appareil, par compte : il ne voyage pas,
  // et celui d'un autre client du même téléphone ne se mélange pas au sien.
  function clePanier(){
    return 'nyasako_panier_' + ((currentUser && currentUser.email) || 'invite').trim().toLowerCase();
  }
  function lirePanier(){
    try{ const l = JSON.parse(localStorage.getItem(clePanier())); return Array.isArray(l) ? l : []; }
    catch(e){ return []; }
  }
  function ecrirePanier(l){
    try{ localStorage.setItem(clePanier(), JSON.stringify(l)); }catch(e){}
    majCompteurPanier();
  }
  // Les achats payés, tels que le serveur les tient. On montre ceux dont
  // l'argent est encore tenu, et ceux réglés depuis moins de trois jours.
  function chargerAchatsDuPanier(boite){
    if(!boite || !window.__sb) return;
    const moi = (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : '';
    if(!moi) return;
    const depuis = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    window.__sb.from('wallet_achats')
      .select('id,titre,isa,amount_ar,status,created_at,settled_at')
      .eq('buyer_email', moi)
      .or('status.eq.tazonina,settled_at.gte.' + depuis)
      .order('created_at', { ascending: false }).limit(20)
      .then(function(res){
        if(!res || res.error || !boite.isConnected) return;
        boite.innerHTML = '';
        (res.data || []).forEach(function(a){ boite.appendChild(messageAchat(a, boite)); });
      }, function(){});
  }
  function messageAchat(a, boite){
    const m = document.createElement('div');
    m.className = 'panier-message' + (a.status === 'naverina' ? ' naverina' : '');
    const quoi = '<strong>' + enAriary(a.amount_ar) + '</strong> ho an\'ny « ' + escapeHtml(a.titre || 'Entana') + ' » × ' + (a.isa || 1);
    const texte = a.status === 'tazonina'
      ? '✓ Voaloa ' + quoi + ' — voatazona ny vola mandra-pahazoanao ny entana. Rehefa voarainao, tsindrio « Confirmer ».'
      : a.status === 'voaray'
        ? '💸 Lasa ny vola : ' + quoi + ' — tonga any amin\'ny mpivarotra.'
        : '↩ Naverina taminao ny ' + quoi + '.';
    m.innerHTML =
      '<span class="panier-message-texte">' + texte +
        '<span class="panier-message-date">' + new Date(a.settled_at || a.created_at).toLocaleString('fr-FR') + '</span></span>';
    if(a.status === 'tazonina'){
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm btn-primary panier-confirmer';
      b.textContent = '✓ Confirmer';
      b.addEventListener('click', function(e){
        e.stopPropagation();
        if(b.dataset.sur !== '1'){
          // Un second appui confirme : l'argent part, et ne revient plus.
          b.dataset.sur = '1';
          b.textContent = 'Voaray tokoa ? Tsindrio indray';
          return;
        }
        b.disabled = true;
        b.textContent = '⏳';
        if(typeof window.__callWallet !== 'function'){ b.disabled = false; b.textContent = '✓ Confirmer'; return; }
        window.__callWallet({ action: 'achat_voaray', id: a.id }).then(function(){
          chargerAchatsDuPanier(boite);
          if(typeof window.__rafraichirPortefeuille === 'function') window.__rafraichirPortefeuille();
        }, function(err){
          b.disabled = false;
          b.dataset.sur = '';
          b.textContent = '✓ Confirmer';
          direPresDuBouton(b, (err && err.message) || 'Tsy nety : andramo indray.');
        });
      });
      m.appendChild(b);
    }
    return m;
  }
  function prixNombre(p){
    const n = parseFloat(String(p == null ? '' : p).replace(/[^\d.,]/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function enAriary(n){ return Math.round(n).toLocaleString('fr-FR') + ' Ar'; }
  function titreDu(post){ return (post.message || '').split('\n')[0].trim().slice(0, 60) || 'Entana'; }

  // Le nombre d'articles, sur l'entrée du menu (et donc sur son icône de la
  // rangée, qui la recopie).
  function majCompteurPanier(){
    const total = lirePanier().reduce(function(s, l){ return s + (l.isa || 0); }, 0);
    document.querySelectorAll('[data-panier-compte]').forEach(function(b){
      b.textContent = total ? String(total) : '';
      b.hidden = !total;
    });
  }

  function ajouterAuPanier(post, bouton){
    const l = lirePanier();
    const deja = l.filter(function(x){ return String(x.id) === String(post.id); })[0];
    // Déjà dedans : le second appui ouvre le panier, où l'on règle la quantité.
    if(deja){ ouvrirPanier(); return; }
    l.push({
      id: post.id, titre: titreDu(post), prix: post.price || '', isa: 1,
      // Ce qu'il faut à buyFromPost, sans l'image : elle pèse, et le panier
      // n'a pas à la garder.
      post: { id: post.id, message: post.message, price: post.price, client_name: post.client_name,
              author_email: post.author_email, network: post.network, type: post.type }
    });
    ecrirePanier(l);
    if(bouton){
      bouton.classList.add('dans-panier');
      bouton.classList.remove('fb-like-rebond'); void bouton.offsetWidth; bouton.classList.add('fb-like-rebond');
      direPresDuBouton(bouton, 'Tafiditra ao anaty panier ✓ — tsindrio indray hijerena azy.');
    }
  }

  // Le panier est une page, comme le portefeuille : il s'ouvre en fenêtre,
  // avec ses trois boutons (réduire, agrandir, fermer) et son icône dans la
  // rangée du bas.
  const panneauPanier = document.querySelector('#section-panier .panier-page');
  function ouvrirPanier(){
    const entree = document.getElementById('menuPanier');
    if(entree) entree.click(); else if(panneauPanier) dessinerPanier();
  }

  function dessinerPanier(){
    if(!panneauPanier) return;
    const l = lirePanier();
    const total = l.reduce(function(s, x){ return s + prixNombre(x.prix) * (x.isa || 1); }, 0);
    panneauPanier.innerHTML =
      '<div class="panier-tete"><span class="panier-titre">' + LOGO_PANIER + ' Panier</span></div>' +
      '<div class="panier-voaloa"></div>' +
      (l.length ? '' : '<p class="panneau-note">Mbola foana ny panier. Tsindrio « Panier » eo ambanin\'ny entana iray ao amin\'ny Botika.</p>') +
      '<div class="panier-lignes"></div>' +
      (l.length ? '<div class="panier-total"><span>Totaly</span><strong>' + enAriary(total) + '</strong></div>' +
        '<button type="button" class="panier-foano">Foanana ny panier</button>' : '');
    // Les achats payés, lus sur le serveur (wallet_achats, les siens) : leur
    // message reste ici, en haut du panier, avec « Confirmer » tant que
    // l'argent est tenu. Confirmer, c'est dire qu'on a reçu l'entana : la
    // somme part chez le vendeur, qui en est prévenu avec son livreur.
    chargerAchatsDuPanier(panneauPanier.querySelector('.panier-voaloa'));
    const lignes = panneauPanier.querySelector('.panier-lignes');
    l.forEach(function(x){
      const d = document.createElement('div');
      d.className = 'panier-ligne';
      d.innerHTML =
        '<div class="panier-nom">' + escapeHtml(x.titre) +
          '<span class="panier-prix">' + (prixNombre(x.prix) ? enAriary(prixNombre(x.prix)) : 'Tsy misy vidiny') + '</span></div>' +
        '<div class="panier-isa">' +
          '<button type="button" data-moins aria-label="Ahena">−</button>' +
          '<span>' + (x.isa || 1) + '</span>' +
          '<button type="button" data-plus aria-label="Ampiana">+</button>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary panier-hividy">Hividy</button>' +
        '<span class="panier-esory" role="button" tabindex="0" title="Esorina" aria-label="Esorina">' + LOGO_FAFANA + '</span>';
      function changer(delta){
        const liste = lirePanier();
        const y = liste.filter(function(z){ return String(z.id) === String(x.id); })[0];
        if(!y) return;
        y.isa = Math.max(1, (y.isa || 1) + delta);
        ecrirePanier(liste);
        dessinerPanier();
      }
      d.querySelector('[data-moins]').addEventListener('click', function(){ changer(-1); });
      d.querySelector('[data-plus]').addEventListener('click', function(){ changer(1); });
      d.querySelector('.panier-esory').addEventListener('click', function(){
        ecrirePanier(lirePanier().filter(function(z){ return String(z.id) !== String(x.id); }));
        const b = document.querySelector('#communityNewsList .fb-post[data-news-id="' + x.id + '"] [data-panier]');
        if(b) b.classList.remove('dans-panier');
        dessinerPanier();
      });
      // Acheter, c'est payer avec le portefeuille : la fonction wallet lit le
      // prix dans la base, vérifie l'argent vraiment payé, et tient la somme
      // jusqu'à ce que l'entana soit reçu (le portefeuille, « Fividianana »).
      const hividy = d.querySelector('.panier-hividy');
      hividy.addEventListener('click', function(){
        const montant = prixNombre(x.prix) * (x.isa || 1);
        if(!montant){
          direPresDuBouton(hividy, 'Tsy misy vidiny io entana io : resaho mivantana ny mpivarotra.');
          return;
        }
        if(typeof window.__callWallet !== 'function'){
          direPresDuBouton(hividy, 'Tsy vonona ny portefeuille : avereno sokafana ny pejy.');
          return;
        }
        const auth = window.__sb && window.__sb.auth;
        (auth && auth.getSession ? auth.getSession() : Promise.resolve(null)).then(function(r){
          if(!(r && r.data && r.data.session)){
            direPresDuBouton(hividy, 'Midira amin\'ny tenimiafinao aloha vao afaka mandoa amin\'ny portefeuille.');
            return;
          }
          // La question se pose dans le panier même, sous la ligne, et non
          // dans une fenêtre du navigateur qui masque tout et se ferme d'un
          // réflexe.
          const vieille = d.querySelector('.panier-confirm');
          if(vieille){ vieille.remove(); return; }
          const q = document.createElement('div');
          q.className = 'panier-confirm';
          q.innerHTML =
            '<p>Handoa <strong>' + enAriary(montant) + '</strong> amin\'ny portefeuille ve ianao ho an\'ny « ' +
              escapeHtml(x.titre) + ' » × ' + (x.isa || 1) + ' ?</p>' +
            '<p class="panneau-note">Voatazona ny vola mandra-pahazoanao ny entana, avy eo vao tonga any amin\'ny mpivarotra.</p>' +
            '<div class="panier-confirm-boutons">' +
              '<button type="button" class="btn btn-sm btn-primary" data-ok>OK</button>' +
              '<button type="button" class="btn btn-sm" data-non>Aoka ihany</button>' +
            '</div>';
          d.appendChild(q);
          q.querySelector('[data-non]').addEventListener('click', function(){ q.remove(); });
          q.querySelector('[data-ok]').addEventListener('click', function(){
            const ok = q.querySelector('[data-ok]');
            ok.disabled = true;
            ok.textContent = '⏳';
            hividy.disabled = true;
            window.__callWallet({ action: 'achat', newsId: x.id, isa: x.isa || 1,
              name: (currentUser && currentUser.name) || '' }).then(function(res){
              // Payé : il quitte le panier, et son message paraît en haut
              // (lu sur le serveur), avec « Confirmer ».
              ecrirePanier(lirePanier().filter(function(z){ return String(z.id) !== String(x.id); }));
              const b = document.querySelector('#communityNewsList .fb-post[data-news-id="' + x.id + '"] [data-panier]');
              if(b) b.classList.remove('dans-panier');
              dessinerPanier();
              if(typeof window.__rafraichirPortefeuille === 'function') window.__rafraichirPortefeuille();
            }, function(err){
              hividy.disabled = false;
              ok.disabled = false;
              ok.textContent = 'OK';
              let e = q.querySelector('.panier-erreur');
              if(!e){ e = document.createElement('p'); e.className = 'panier-erreur'; q.appendChild(e); }
              e.textContent = (err && err.message) || 'Tsy nety ny fandoavana. Andramo indray.';
            });
          });
        });
      });
      lignes.appendChild(d);
    });
    const foano = panneauPanier.querySelector('.panier-foano');
    if(foano) foano.addEventListener('click', function(){
      if(!confirm('Foanana ve ny panier ?')) return;
      ecrirePanier([]);
      document.querySelectorAll('#communityNewsList [data-panier].dans-panier').forEach(function(b){ b.classList.remove('dans-panier'); });
      dessinerPanier();
    });
  }

  // L'entrée du menu : le panier s'ouvre de n'importe où, en fenêtre.
  (function(){
    const entree = document.getElementById('menuPanier');
    if(!entree) return;
    // L'entrée ouvre la page (common.js, comme toutes les entrées du menu) ;
    // ici on la remplit, fraîche à chaque ouverture.
    entree.addEventListener('click', function(){ dessinerPanier(); });
    majCompteurPanier();
  })();

  // ---------------- LES STORIES ----------------
  //
  // Sous le titre du Botika, une rangée qui défile de côté : d'abord « + » pour
  // en ajouter une, puis une carte par personne, sa dernière photo en fond.
  // Une story dure vingt-quatre heures (le serveur pose la date de fin,
  // supabase-stories.sql). On la regarde en plein écran, une barre par photo,
  // cinq secondes chacune ; un appui à gauche revient, à droite avance.
  const storyRangee = document.getElementById('storyRangee');
  const storyFichier = document.getElementById('storyFichier');
  const DUREE_STORY = 5000;
  const DUREE_STORY_HIRA = 15000;
  // Vidéos et chansons : dans le bucket, sous le dossier de leur auteur
  // (supabase-stories-media.sql). 50 Mo par fichier ; d'une vidéo plus
  // longue, on choisit le morceau de trente secondes qu'on montre
  // (supabase-stories-tapaka.sql).
  const BUCKET_STORY = 'story-media';
  const MAX_STORY_MO = 50;
  const MAX_STORY_SECONDES = 30;
  const MAX_STORIES_D_UN_COUP = 10;
  function cheminStoryMedia(url){
    const m = String(url || '').split('/object/public/' + BUCKET_STORY + '/')[1];
    return m ? decodeURIComponent(m) : null;
  }
  let listeStories = [];
  let monIdStory = null;

  function sessionStory(){
    const auth = window.__sb && window.__sb.auth;
    return (auth && auth.getSession ? auth.getSession() : Promise.resolve(null)).then(function(r){
      return (r && r.data && r.data.session) || null;
    }, function(){ return null; });
  }

  // Les stories par personne, la plus récente d'abord ; les siennes en tête.
  // Une carte par story, et non une par personne : chacune se voit et
  // s'ouvre à part. Les siennes d'abord, puis les autres, les plus récentes
  // en tête. (La visionneuse garde sa forme de « groupe » : une story seule
  // en est un, et la suivante de la rangée vient après elle.)
  //
  // Les cartes se déplacent (on les tient, puis on les tire) : l'ordre choisi
  // est retenu sur l'appareil. Une story qu'on n'a pas encore rangée vient
  // devant, à sa place d'origine.
  const CLE_ORDRE_STORY = 'nyasako_story_ordre';
  function lireOrdreStory(){
    try{ const l = JSON.parse(localStorage.getItem(CLE_ORDRE_STORY)); return Array.isArray(l) ? l : []; }
    catch(e){ return []; }
  }
  function ecrireOrdreStory(l){
    try{ localStorage.setItem(CLE_ORDRE_STORY, JSON.stringify(l.slice(0, 300))); }catch(e){}
  }
  function groupesDeStories(){
    const ordre = lireOrdreStory();
    return listeStories.slice().sort(function(a, b){
      const ia = ordre.indexOf(a.id), ib = ordre.indexOf(b.id);
      if(ia >= 0 && ib >= 0) return ia - ib;
      if(ia >= 0 || ib >= 0) return ia >= 0 ? 1 : -1;
      const moi = (b.auteur_id === monIdStory) - (a.auteur_id === monIdStory);
      return moi || (new Date(b.created_at) - new Date(a.created_at));
    }).map(function(s){
      return { auteur_id: s.auteur_id, nom: s.auteur_nom, photo: s.auteur_photo, liste: [s] };
    });
  }

  // En ligne : son compte est dans la présence (live.js), qui porte son
  // identifiant. Le visage sur la carte de sa story prend alors un anneau
  // violet.
  function auteurEnLigne(id){
    if(!id || typeof presenceState !== 'object' || !presenceState) return false;
    return Object.keys(presenceState).some(function(k){
      return presenceState[k] && presenceState[k].uid === id;
    });
  }
  // La présence change sans que le fil ni les stories soient relus : on
  // repeint seulement les bords et les anneaux.
  window.__storiesEnLigne = function(){
    document.querySelectorAll('#storyRangee [data-story-auteur], .story-bureau[data-story-auteur]').forEach(function(c){
      c.classList.toggle('en-ligne', auteurEnLigne(c.getAttribute('data-story-auteur')));
    });
    // Et le visage des billets du Botika.
    document.querySelectorAll('[data-en-ligne-email]').forEach(function(a){
      a.classList.toggle('en-ligne', emailEnLigne(a.getAttribute('data-en-ligne-email')));
    });
  };
  // La présence est rangée par adresse : celle d'un billet suffit.
  function emailEnLigne(email){
    if(!email || typeof presenceState !== 'object' || !presenceState) return false;
    const e = String(email).trim().toLowerCase();
    return Object.keys(presenceState).some(function(k){ return String(k).trim().toLowerCase() === e; });
  }

  function avatarStory(photo, nom){
    return photo
      ? '<img class="story-avatar" src="' + escapeHtml(photo) + '" alt="">'
      : '<span class="story-avatar story-avatar-lettres">' + escapeHtml(initials(nom)) + '</span>';
  }

  function dessinerStories(){
    if(!storyRangee) return;
    const maPhoto = jeSuisLaMaison() ? MARQUE_LOGO : ((currentUser && currentUser.logo) || '');
    let html =
      '<button type="button" class="story-carte story-ajouter" data-story-ajouter>' +
        '<span class="story-rond story-ajouter-fond">' + avatarStory(maPhoto, (currentUser && currentUser.name) || '') + '</span>' +
        '<span class="story-plus" aria-hidden="true">+</span>' +
        '<span class="story-nom">Hanampy story</span>' +
      '</button>';
    // Celles qu'on a posées sur l'écran n'y sont plus : elles vivent là-bas
    // (dessinerStoriesBureau), comme les icônes sorties de la rangée du bas.
    const surLEcran = lireStoriesBureau().map(function(b){ return b.id; });
    groupesDeStories().forEach(function(g, i){
      if(surLEcran.indexOf(g.liste[0].id) >= 0) return;
      html += htmlCarteStory(g, i, '');
    });
    // Le fil se relit souvent (un billet, une réaction, un live…) et relit
    // les stories avec lui. Redessiner la rangée à l'identique couperait la
    // vidéo qui joue et renverrait le tour à la première bulle : elle ne
    // bouge donc que si les stories ont changé.
    if(html !== storyRangee.__html){
      storyRangee.__html = html;
      storyRangee.innerHTML = html;
      jouerVideosCartes();
    }
    dessinerStoriesBureau();
    // La présence se pose à part, sans redessiner.
    window.__storiesEnLigne();
  }

  // Une bulle de story : dans la rangée, ou posée sur l'écran (« classe »).
  function htmlCarteStory(g, i, classe){
      const derniere = g.liste[g.liste.length - 1];
      // Une vidéo n'a pas d'image à poser en fond : sa première seconde, sans
      // le son, en tient lieu.
      const video = derniere.genre === 'video';
      return '' +
        '<button type="button" class="story-carte' + classe + '" data-story-groupe="' + i + '" data-story-id="' + escapeHtml(g.liste[0].id) + '" data-story-auteur="' + escapeHtml(g.auteur_id) + '"' +
          '>' +
          // Le rond en relief qui porte le sary ou la vidéo ; le sary y a son
          // propre calque, qui grossit doucement à son tour sans déborder.
          '<span class="story-rond">' +
          (video ? '' : '<span class="story-carte-fond" style="background-image:url(\'' + String(derniere.media).replace(/'/g, '%27') + '\')"></span>') +
          (video ? '<video class="story-carte-video" src="' + escapeHtml(derniere.media) + '#t=' + ((derniere.video_debut || 0) + 0.5) + '" muted playsinline preload="metadata"' +
              ' data-debut="' + (Number(derniere.video_debut) || 0) + '" data-fin="' + (Number(derniere.video_fin) || 0) + '"></video>' +
            '<span class="story-carte-play" aria-hidden="true">▶</span>' : '') +
          '</span>' +
          '<span class="story-helice" aria-hidden="true"></span>' +
          '<span class="story-anneau">' + avatarStory(g.photo, g.nom) + '</span>' +
          '<span class="story-nom">' + escapeHtml(g.auteur_id === monIdStory ? 'Ny story-nao' : (g.nom || 'Client')) + '</span>' +
        '</button>';
  }

  // ---- Les stories posées sur l'écran ----
  // On tient une bulle, on la tire hors de la rangée et on la lâche où l'on
  // veut : elle reste là, sur l'écran, comme les petites icônes (common.js,
  // « Les icônes posées sur le fond »). Un appui l'ouvre ; on la déplace en
  // la tirant ; relâchée sur la rangée, elle y retourne. Sa place est gardée
  // en fractions de l'écran, et elle s'en va d'elle-même quand la story
  // finit.
  const CLE_STORIES_BUREAU = 'stockmanager_stories_bureau';
  function lireStoriesBureau(){
    try{ const l = JSON.parse(localStorage.getItem(CLE_STORIES_BUREAU)); return Array.isArray(l) ? l : []; }
    catch(e){ return []; }
  }
  function ecrireStoriesBureau(l){
    try{ localStorage.setItem(CLE_STORIES_BUREAU, JSON.stringify(l.slice(0, 40))); }catch(e){}
  }
  function placerBulleBureau(el, fx, fy){
    const x = Math.min(Math.max(8, fx * window.innerWidth), window.innerWidth - 96);
    const y = Math.min(Math.max(8, fy * window.innerHeight), window.innerHeight - 132);
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
  }
  function poserStorySurLEcran(id, x, y){
    const l = lireStoriesBureau().filter(function(b){ return b.id !== id; });
    // Lâchée au bord, elle reste entière à l'écran.
    x = Math.min(Math.max(8, x), window.innerWidth - 96);
    y = Math.min(Math.max(8, y), window.innerHeight - 132);
    l.push({ id: id, x: x / window.innerWidth, y: y / window.innerHeight });
    ecrireStoriesBureau(l);
    dessinerStories();
  }
  function rendreStoryALaRangee(id){
    ecrireStoriesBureau(lireStoriesBureau().filter(function(b){ return b.id !== id; }));
    dessinerStories();
  }
  function surLaRangeeStory(x, y){
    if(!storyRangee || !storyRangee.offsetParent) return false;
    const r = storyRangee.getBoundingClientRect();
    return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10;
  }
  function dessinerStoriesBureau(){
    const groupes = groupesDeStories();
    const vivantes = {};
    groupes.forEach(function(g, i){ vivantes[g.liste[0].id] = i; });
    // La liste n'est pas encore lue (premier passage) : on n'efface rien.
    if(!listeStories.length) return;
    // Une story finie quitte l'écran, et sa place est oubliée.
    const l = lireStoriesBureau();
    const restent = l.filter(function(b){ return vivantes[b.id] !== undefined; });
    if(restent.length !== l.length) ecrireStoriesBureau(restent);
    [].slice.call(document.querySelectorAll('.story-bureau:not(.story-fantome)')).forEach(function(el){
      const id = el.getAttribute('data-story-id');
      if(!restent.some(function(b){ return b.id === id; })) el.remove();
    });
    restent.forEach(function(b){
      const i = vivantes[b.id];
      let el = null;
      document.querySelectorAll('.story-bureau:not(.story-fantome)').forEach(function(x){
        if(x.getAttribute('data-story-id') === b.id) el = x;
      });
      if(!el){
        const t = document.createElement('div');
        t.innerHTML = htmlCarteStory(groupes[i], i, ' story-bureau');
        el = t.firstChild;
        document.body.appendChild(el);
        armerBulleBureau(el);
      }
      // Le rang a pu changer (une story plus récente devant elle).
      el.setAttribute('data-story-groupe', String(i));
      if(!el.classList.contains('story-tiree')) placerBulleBureau(el, b.x, b.y);
    });
  }
  // Tirer une bulle posée : elle suit le doigt tout de suite. Sans bouger,
  // c'est un appui : la story s'ouvre.
  function armerBulleBureau(el){
    let t = null;
    el.addEventListener('pointerdown', function(e){
      if(e.button > 0) return;
      const r = el.getBoundingClientRect();
      t = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, bouge: false };
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
    });
    el.addEventListener('pointermove', function(e){
      if(!t) return;
      if(!t.bouge && Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y) < 6) return;
      t.bouge = true;
      el.classList.add('story-tiree');
      el.style.left = Math.round(e.clientX - t.dx) + 'px';
      el.style.top = Math.round(e.clientY - t.dy) + 'px';
    });
    el.addEventListener('pointerup', function(e){
      if(!t) return;
      const bouge = t.bouge, dx = t.dx, dy = t.dy;
      t = null;
      el.classList.remove('story-tiree');
      if(!bouge) return;
      el.__vientDeTirer = true;
      setTimeout(function(){ el.__vientDeTirer = false; }, 400);
      const id = el.getAttribute('data-story-id');
      if(surLaRangeeStory(e.clientX, e.clientY)){ rendreStoryALaRangee(id); return; }
      poserStorySurLEcran(id, e.clientX - dx, e.clientY - dy);
    });
    el.addEventListener('pointercancel', function(){ t = null; el.classList.remove('story-tiree'); });
    el.addEventListener('click', function(){
      if(el.__vientDeTirer) return;
      ouvrirGroupe(Number(el.getAttribute('data-story-groupe')), 0);
    });
    el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }
  window.addEventListener('resize', function(){ dessinerStoriesBureau(); });

  // ---- Les cartes s'animent, chacune son tour ----
  // Un sary grossit doucement quatre secondes ; une vidéo joue, sans le son,
  // de son début choisi à sa fin (quinze secondes au plus). La carte suivante
  // prend le relais, et après la dernière on repart de la première. Rien ne
  // bouge tant que la page est cachée, qu'une story est ouverte ou qu'une
  // carte est tenue.
  let tourVideos = 0;
  function jouerVideosCartes(){
    const tour = ++tourVideos;
    let n = 0;
    function suivante(){
      if(tour !== tourVideos || !storyRangee) return;
      const cartes = storyRangee.querySelectorAll('.story-carte[data-story-id]');
      if(!cartes.length) return;
      const pause = document.hidden || !storyRangee.offsetParent ||
        document.body.classList.contains('story-ouverte') || storyRangee.querySelector('.story-tiree');
      if(pause){ setTimeout(suivante, 1500); return; }
      const carte = cartes[n % cartes.length];
      n++;
      const el = carte.querySelector('.story-carte-video');
      if(!el){
        carte.classList.add('story-joue');
        setTimeout(function(){
          carte.classList.remove('story-joue');
          setTimeout(suivante, 300);
        }, 4000);
        return;
      }
      const debut = Number(el.getAttribute('data-debut')) || 0;
      const finChoisie = Number(el.getAttribute('data-fin')) || 0;
      let fini = false;
      function arreter(){
        if(fini) return;
        fini = true;
        clearTimeout(garde);
        el.removeEventListener('timeupdate', surTemps);
        el.removeEventListener('ended', arreter);
        el.removeEventListener('error', arreter);
        el.pause();
        carte.classList.remove('story-joue');
        setTimeout(suivante, cartes.length > 1 ? 300 : 1500);
      }
      function surTemps(){
        if(tour !== tourVideos || document.hidden || document.body.classList.contains('story-ouverte')){ arreter(); return; }
        if(finChoisie && el.currentTime >= finChoisie) arreter();
      }
      // Quinze secondes au plus, et une vidéo qui ne vient pas ne bloque pas
      // les autres.
      const garde = setTimeout(arreter, 15000);
      el.addEventListener('timeupdate', surTemps);
      el.addEventListener('ended', arreter);
      el.addEventListener('error', arreter);
      el.muted = true;
      try{ el.currentTime = debut; }catch(err){}
      carte.classList.add('story-joue');
      const p = el.play();
      if(p && p.catch) p.catch(arreter);
    }
    setTimeout(suivante, 600);
  }

  // ---- Déplacer une carte ----
  // Tenir une carte un tiers de seconde la soulève ; on la tire alors, et les
  // autres s'écartent pour lui faire place. Bouger avant, c'est faire défiler
  // la rangée, comme d'habitude. Relâchée, l'ordre est retenu.
  function armerDeplacementStories(){
    if(!storyRangee) return;
    let g = null;
    function annuler(){
      if(!g) return;
      clearTimeout(g.minuterie);
      if(g.carte){
        g.carte.classList.remove('story-tiree');
        g.carte.style.transform = '';
        g.carte.style.opacity = '';
      }
      if(g.fantome) g.fantome.remove();
      g = null;
    }
    storyRangee.addEventListener('pointerdown', function(e){
      const carte = e.target.closest('.story-carte[data-story-id]');
      if(!carte || e.button > 0) return;
      annuler();
      g = { x: e.clientX, y: e.clientY, carte: null, id: e.pointerId };
      g.minuterie = setTimeout(function(){
        if(!g) return;
        g.carte = carte;
        g.dx0 = e.clientX;
        g.dy0 = e.clientY;
        carte.classList.add('story-tiree');
        try{ storyRangee.setPointerCapture(g.id); }catch(err){}
        if(navigator.vibrate) try{ navigator.vibrate(15); }catch(err){}
      }, 350);
    });
    storyRangee.addEventListener('pointermove', function(e){
      if(!g) return;
      if(!g.carte){
        // Bougé avant d'être soulevée : c'est un défilement.
        // 14px : un doigt qui tient ne reste jamais tout à fait immobile.
        if(Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 14){ clearTimeout(g.minuterie); g = null; }
        return;
      }
      e.preventDefault();
      g.lx = e.clientX;
      g.ly = e.clientY;
      // Hors de la rangée, la fenêtre la couperait : un double la suit sur
      // l'écran, tenu par son milieu, et se posera là où on le lâche.
      if(!surLaRangeeStory(e.clientX, e.clientY)){
        if(!g.fantome){
          g.fantome = g.carte.cloneNode(true);
          g.fantome.classList.add('story-bureau', 'story-tiree', 'story-fantome');
          g.fantome.style.transform = '';
          document.body.appendChild(g.fantome);
          g.carte.style.opacity = '0.3';
          g.carte.style.transform = '';
        }
        g.fantome.style.left = Math.round(e.clientX - 44) + 'px';
        g.fantome.style.top = Math.round(e.clientY - 44) + 'px';
        return;
      }
      if(g.fantome){ g.fantome.remove(); g.fantome = null; g.carte.style.opacity = ''; }
      g.carte.style.transform = 'translate(' + (e.clientX - g.dx0) + 'px,' + (e.clientY - g.dy0) + 'px) scale(1.06)';
      // La carte sous le doigt (hors celle qu'on tient) : on se glisse devant
      // ou derrière elle, selon le côté.
      g.carte.style.pointerEvents = 'none';
      const dessous = document.elementFromPoint(e.clientX, e.clientY);
      g.carte.style.pointerEvents = '';
      const cible = dessous && dessous.closest('#storyRangee .story-carte[data-story-id]');
      if(!cible || cible === g.carte) return;
      const r = cible.getBoundingClientRect();
      const avant = e.clientX < r.left + r.width / 2;
      const ref = avant ? cible : cible.nextSibling;
      if(ref === g.carte || ref === g.carte.nextSibling && !avant) return;
      // La carte change de place dans la rangée : son décalage repart de là.
      const ancien = g.carte.getBoundingClientRect();
      storyRangee.insertBefore(g.carte, ref);
      const nouveau = g.carte.getBoundingClientRect();
      g.dx0 += nouveau.left - ancien.left;
      g.dy0 += nouveau.top - ancien.top;
      g.carte.style.transform = 'translate(' + (e.clientX - g.dx0) + 'px,' + (e.clientY - g.dy0) + 'px) scale(1.06)';
    });
    // Tant qu'une carte est tenue, le doigt ne fait pas défiler la page.
    storyRangee.addEventListener('touchmove', function(e){
      if(g && g.carte) e.preventDefault();
    }, { passive: false });
    function fin(){
      if(!g) return;
      clearTimeout(g.minuterie);
      // Lâchée hors de la rangée : elle se pose sur l'écran, là.
      if(g.carte && g.fantome){
        const id = g.carte.getAttribute('data-story-id');
        const x = g.lx - 44, y = g.ly - 44;
        storyRangee.__vientDeTirer = true;
        setTimeout(function(){ storyRangee.__vientDeTirer = false; }, 400);
        annuler();
        poserStorySurLEcran(id, x, y);
        return;
      }
      if(g.carte){
        const ids = [].map.call(storyRangee.querySelectorAll('.story-carte[data-story-id]'), function(c){
          return c.getAttribute('data-story-id');
        });
        // Les stories hors de la rangée (finies depuis) gardent leur rang
        // derrière : elles ne reviendront pas, mais n'y changent rien.
        const reste = lireOrdreStory().filter(function(id){ return ids.indexOf(id) < 0; });
        ecrireOrdreStory(ids.concat(reste));
        storyRangee.__vientDeTirer = true;
        setTimeout(function(){ storyRangee.__vientDeTirer = false; }, 400);
        annuler();
        dessinerStories();
        return;
      }
      g = null;
    }
    storyRangee.addEventListener('pointerup', fin);
    storyRangee.addEventListener('pointercancel', fin);
    // Un appui long sur une image ouvrirait le menu du navigateur.
    storyRangee.addEventListener('contextmenu', function(e){
      if(e.target.closest('.story-carte')) e.preventDefault();
    });
  }

  function chargerStories(){
    if(!storyRangee || !window.__sb) return;
    sessionStory().then(function(session){
      monIdStory = session && session.user ? session.user.id : null;
      return window.__sb.from('botika_stories')
        .select('id,auteur_id,auteur_nom,auteur_photo,media,texte,created_at,genre,hira,hira_nom,video_debut,video_fin,hira_debut')
        .order('created_at', { ascending: false }).limit(150);
    }).then(function(res){
      if(res && !res.error) listeStories = res.data || [];
      dessinerStories();
    }, function(){ dessinerStories(); });
  }

  // ---- Le plein écran ----
  let visionneuseStory = null;
  let minuterieStory = null;
  // Les réactions des stories ouvertes, par story : [{ user_id, reaction }].
  let reactionsStory = {};
  // Qui a vu ses propres stories, par story : [{ user_id, nom, photo, created_at }].
  let vuesStory = {};
  // Les stories déjà notées comme vues depuis cet appareil : une seule
  // écriture par story, même regardée dix fois.
  const vuesNotees = {};
  let maVignetteStory = null;

  // Regarder la story d'un autre y laisse son nom (une fois). Sans compte,
  // rien ne s'écrit : on ne saurait pas dire qui.
  function noterVue(s){
    if(!s || vuesNotees[s.id] || !window.__sb) return;
    vuesNotees[s.id] = true;
    sessionStory().then(function(session){
      if(!session) return null;
      const maison = jeSuisLaMaison();
      return (maVignetteStory ? Promise.resolve(maVignetteStory)
        : (maison ? Promise.resolve(MARQUE_LOGO) : vignette(currentUser && currentUser.logo))).then(function(photo){
        maVignetteStory = photo || null;
        return window.__sb.from('botika_story_vues').upsert({
          story_id: s.id, user_id: session.user.id,
          nom: (maison ? MARQUE_NOM : ((currentUser && currentUser.name) || 'Client')).slice(0, 80),
          photo: maVignetteStory
        }, { onConflict: 'story_id,user_id', ignoreDuplicates: true });
      });
    }).then(function(res){
      if(res && res.error) vuesNotees[s.id] = false;
    }, function(){ vuesNotees[s.id] = false; });
  }

  // 👁 et leur nombre, en bas à gauche de ses stories. Un appui ouvre la
  // liste : chacun avec son visage, et l'emoji qu'il a mis. La story attend
  // qu'on la referme.
  function dessinerMpijery(v, s){
    const b = v.querySelector('.story-mpijery');
    if(!b) return;
    const liste = vuesStory[s.id];
    b.querySelector('b').textContent = liste ? String(liste.length) : '…';
    b.onclick = function(){
      const l = vuesStory[s.id] || [];
      clearTimeout(minuterieStory);
      const media = v.querySelector('video.story-sary');
      if(media) media.pause();
      if(sonStory) sonStory.pause();
      const barre = v.querySelector('.story-barre i[style]');
      if(barre) barre.style.animationPlayState = 'paused';
      const emojiDe = {};
      (reactionsStory[s.id] || []).forEach(function(r){ emojiDe[r.user_id] = r.reaction; });
      const panneau = document.createElement('div');
      panneau.className = 'story-mpijery-lisitra';
      panneau.innerHTML =
        '<div class="story-mpijery-tete"><strong>👁 ' + l.length + ' no nijery</strong>' +
          '<button type="button" aria-label="Hidio" title="Hidio">✕</button></div>' +
        (l.length ? l.map(function(x){
          const r = emojiDe[x.user_id] ? reactionDe(emojiDe[x.user_id]) : null;
          return '<div class="story-mpijery-olona">' + avatarStory(x.photo, x.nom) +
            '<span>' + escapeHtml(x.nom || 'Olona iray') + '<small>' + depuisQuandStory(x.created_at) + '</small></span>' +
            (r ? '<i class="story-mpijery-emoji">' + visage(r) + '</i>' : '') + '</div>';
        }).join('') : '<p class="story-mpijery-vide">Mbola tsy nisy nijery.</p>');
      v.appendChild(panneau);
      panneau.querySelector('button').addEventListener('click', function(){
        panneau.remove();
        if(barre) barre.style.animationPlayState = 'running';
        if(media) media.play().catch(function(){});
        if(sonStory) sonStory.play().catch(function(){});
        if(v.__relancer) v.__relancer();
      });
    };
  }
  // La chanson posée sur la story à l'écran : une seule joue à la fois.
  let sonStory = null;
  function taireStory(){
    if(sonStory){ try{ sonStory.pause(); }catch(e){} sonStory = null; }
  }
  function fermerVisionneuse(){
    clearTimeout(minuterieStory);
    taireStory();
    document.body.classList.remove('story-ouverte');
    if(visionneuseStory){ visionneuseStory.remove(); visionneuseStory = null; }
    document.removeEventListener('keydown', toucheVisionneuse);
  }
  function toucheVisionneuse(e){
    if(!visionneuseStory) return;
    if(e.key === 'Escape') fermerVisionneuse();
    if(e.key === 'ArrowRight' && visionneuseStory.__suivant) visionneuseStory.__suivant();
    if(e.key === 'ArrowLeft' && visionneuseStory.__precedent) visionneuseStory.__precedent();
  }
  function cadreVisionneuse(){
    fermerVisionneuse();
    visionneuseStory = document.createElement('div');
    visionneuseStory.className = 'story-mijery';
    visionneuseStory.setAttribute('role', 'dialog');
    visionneuseStory.setAttribute('aria-label', 'Story');
    ['pointerdown', 'mousedown', 'click'].forEach(function(t){
      visionneuseStory.addEventListener(t, function(e){ e.stopPropagation(); });
    });
    document.body.appendChild(visionneuseStory);
    // Les emoji qui s'éparpillent passent devant la story (components.css).
    document.body.classList.add('story-ouverte');
    document.addEventListener('keydown', toucheVisionneuse);
    return visionneuseStory;
  }
  function depuisQuandStory(date){
    const min = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60000));
    return min < 60 ? min + ' min' : Math.round(min / 60) + ' h';
  }

  // En bas de la story, les sept visages : on en touche un, il s'éparpille
  // sur tout l'écran, et il reste choisi (le retoucher le retire). Chacun
  // porte le nombre de ceux qui l'ont donné.
  function dessinerReactionsStory(v, s, moi){
    const zone = v.querySelector('.story-reactions');
    if(!zone) return;
    const liste = reactionsStory[s.id] || [];
    // Les sept visages sur toutes les stories, les siennes comprises ; au
    // coin de chacun, combien l'ont donné.
    const parType = {};
    liste.forEach(function(r){ parType[r.reaction] = (parType[r.reaction] || 0) + 1; });
    const mienne = liste.filter(function(r){ return r.user_id === monIdStory; })[0];
    zone.className = 'story-reactions';
    zone.innerHTML = REACTIONS.map(function(r){
      return '<button type="button" class="story-reaction' + (mienne && mienne.reaction === r.id ? ' voafidy' : '') +
        '" data-sorte="story" data-story-reaction="' + r.id + '" title="' + r.nom + '" aria-label="' + r.nom + '">' +
        visage(r) + (parType[r.id] ? '<b class="story-reaction-isa">' + parType[r.id] + '</b>' : '') + '</button>';
    }).join('');
    zone.querySelectorAll('[data-story-reaction]').forEach(function(b){
      b.addEventListener('click', function(){
        const id = b.getAttribute('data-story-reaction');
        sessionStory().then(function(session){
          if(!session){ direPresDuBouton(b, PAS_DE_SESSION); return; }
          monIdStory = session.user.id;
          const avant = (reactionsStory[s.id] || []).filter(function(r){ return r.user_id === monIdStory; })[0];
          const retirer = avant && avant.reaction === id;
          // Tout de suite à l'écran ; le serveur suit.
          reactionsStory[s.id] = (reactionsStory[s.id] || []).filter(function(r){ return r.user_id !== monIdStory; });
          if(!retirer){
            reactionsStory[s.id].push({ story_id: s.id, user_id: monIdStory, reaction: id });
            eclaterReaction(b, id);
          }
          dessinerReactionsStory(v, s, moi);
          if(v.__relancer) v.__relancer();
          const table = window.__sb.from('botika_story_reactions');
          (retirer
            ? table.delete().eq('story_id', s.id).eq('user_id', monIdStory)
            : table.upsert({ story_id: s.id, user_id: monIdStory, reaction: id }, { onConflict: 'story_id,user_id' })
          ).then(function(res){
            if(res && res.error){
              reactionsStory[s.id] = (reactionsStory[s.id] || []).filter(function(r){ return r.user_id !== monIdStory; });
              if(avant) reactionsStory[s.id].push(avant);
              if(visionneuseStory === v) dessinerReactionsStory(v, s, moi);
              direPresDuBouton(zone, 'Tsy voaray : ' + res.error.message);
            }
          });
        });
      });
    });
  }

  function ouvrirGroupe(indexGroupe, indexStory){
    const groupes = groupesDeStories();
    const g = groupes[indexGroupe];
    if(!g){ fermerVisionneuse(); return; }
    const v = cadreVisionneuse();
    let i = Math.min(indexStory || 0, g.liste.length - 1);
    // Les réactions de tout le groupe, d'un coup ; elles se dessinent dès
    // qu'elles arrivent sous la story à l'écran.
    const ids = g.liste.map(function(x){ return x.id; });
    if(window.__sb) window.__sb.from('botika_story_reactions').select('story_id,user_id,reaction')
      .in('story_id', ids).then(function(res){
        if(!res || res.error) return;
        ids.forEach(function(id){ reactionsStory[id] = []; });
        (res.data || []).forEach(function(r){ reactionsStory[r.story_id].push(r); });
        if(visionneuseStory === v && g.liste[i]) dessinerReactionsStory(v, g.liste[i], g.auteur_id === monIdStory);
      });
    // Ses propres stories : qui les a vues (lu seulement par l'auteur,
    // supabase-stories-vues.sql).
    if(window.__sb && g.auteur_id === monIdStory) window.__sb.from('botika_story_vues')
      .select('story_id,user_id,nom,photo,created_at').in('story_id', ids)
      .order('created_at', { ascending: false }).then(function(res){
        if(!res || res.error) return;
        ids.forEach(function(id){ vuesStory[id] = []; });
        (res.data || []).forEach(function(r){ if(vuesStory[r.story_id]) vuesStory[r.story_id].push(r); });
        if(visionneuseStory === v && g.liste[i]) dessinerMpijery(v, g.liste[i]);
      });
    function montrer(){
      clearTimeout(minuterieStory);
      taireStory();
      const s = g.liste[i];
      const moi = g.auteur_id === monIdStory;
      const video = s.genre === 'video';
      // Une photo chantée reste plus longtemps : cinq secondes d'une chanson
      // ne font pas une chanson.
      const duree = s.hira ? DUREE_STORY_HIRA : DUREE_STORY;
      v.innerHTML =
        '<div class="story-barres">' + g.liste.map(function(x, k){
          return '<span class="story-barre' + (k < i ? ' vita' : '') + '"><i' +
            (k === i ? ' style="animation-duration:' + duree + 'ms"' : '') + '></i></span>';
        }).join('') + '</div>' +
        '<div class="story-tete">' + avatarStory(g.photo, g.nom) +
          '<strong>' + escapeHtml(g.nom || 'Client') + '</strong><span>' + depuisQuandStory(s.created_at) + '</span>' +
          (moi ? '<span class="story-fafana" role="button" tabindex="0" title="Hamafa" aria-label="Hamafa">' + LOGO_FAFANA + '</span>' : '') +
          '<button type="button" class="story-hidy" aria-label="Hidio" title="Hidio">✕</button></div>' +
        (video
          ? '<video class="story-sary" src="' + escapeHtml(s.media) + '" playsinline autoplay' + (s.hira ? ' muted' : '') + '></video>'
          : '<img class="story-sary" src="' + escapeHtml(s.media) + '" alt="">') +
        (s.hira ? '<div class="story-hira">🎵 <span>' + escapeHtml(s.hira_nom || 'Hira') + '</span></div>' : '') +
        (s.texte ? '<p class="story-soratra">' + escapeHtml(s.texte) + '</p>' : '') +
        '<span class="story-zone story-zone-g"></span><span class="story-zone story-zone-d"></span>' +
        '<div class="story-reactions"></div>' +
        (moi ? '<button type="button" class="story-mpijery" title="Ireo nijery" aria-label="Ireo nijery">👁 <b>…</b></button>' : '');
      dessinerReactionsStory(v, s, moi);
      if(moi) dessinerMpijery(v, s);
      else noterVue(s);
      if(s.hira){
        const son = sonStory = new Audio(s.hira);
        const depart = s.hira_debut || 0;
        // Depuis le début choisi, et ramenée là si la story dure plus que
        // le reste de la chanson.
        son.addEventListener('loadedmetadata', function(){ if(depart) son.currentTime = depart; });
        son.addEventListener('ended', function(){ son.currentTime = depart; son.play().catch(function(){}); });
        // Ouvrir la story est un appui : le navigateur laisse jouer. S'il
        // refuse quand même, la story passe sans musique.
        son.play().catch(function(){});
      }
      v.querySelector('.story-hidy').addEventListener('click', fermerVisionneuse);
      v.querySelector('.story-zone-g').addEventListener('click', v.__precedent);
      v.querySelector('.story-zone-d').addEventListener('click', v.__suivant);
      const f = v.querySelector('.story-fafana');
      if(f) f.addEventListener('click', function(){
        clearTimeout(minuterieStory);
        if(!confirm('Hamafa ity story ity ve ?')){ if(v.__relancer) v.__relancer(); return; }
        window.__sb.from('botika_stories').delete().eq('id', s.id).then(function(res){
          if(res && res.error){ alert('Tsy voafafa : ' + res.error.message); return; }
          // Sa vidéo et sa chanson partent avec elle du bucket.
          const fichiers = [s.genre === 'video' ? s.media : null, s.hira].map(cheminStoryMedia).filter(Boolean);
          if(fichiers.length) window.__sb.storage.from(BUCKET_STORY).remove(fichiers).catch(function(){});
          listeStories = listeStories.filter(function(x){ return x.id !== s.id; });
          dessinerStories();
          fermerVisionneuse();
        });
      });
      if(video){
        // Une vidéo dure ce qu'elle dure (trente secondes au plus) : la barre
        // prend sa longueur dès qu'on la connaît, et la fin passe à la suite.
        const el = v.querySelector('video.story-sary');
        const barre = v.querySelector('.story-barre i[style]');
        if(barre) barre.style.animationPlayState = 'paused';
        // Seulement le morceau choisi : de video_debut à video_fin.
        const debut = s.video_debut || 0;
        el.addEventListener('loadedmetadata', function(){
          if(debut) el.currentTime = debut;
          const total = isFinite(el.duration) ? el.duration : DUREE_STORY / 1000;
          const fin = Math.min(s.video_fin || total, total);
          const ms = Math.max(500, Math.min((fin - debut) * 1000, 30000));
          if(barre){ barre.style.animationDuration = ms + 'ms'; barre.style.animationPlayState = 'running'; }
          clearTimeout(minuterieStory);
          minuterieStory = setTimeout(v.__suivant, ms + 300);
        });
        el.addEventListener('timeupdate', function(){
          if(s.video_fin && el.currentTime >= s.video_fin){ el.pause(); v.__suivant(); }
        });
        el.addEventListener('ended', function(){ v.__suivant(); });
        el.addEventListener('error', function(){ minuterieStory = setTimeout(v.__suivant, DUREE_STORY); });
        return;
      }
      minuterieStory = setTimeout(v.__suivant, duree);
    }
    // Réagir laisse le temps de voir l'éparpillement : la story repart de
    // zéro, sa barre avec elle. Une vidéo, elle, continue sa lecture.
    v.__relancer = function(){
      const s = g.liste[i];
      if(s && s.genre === 'video') return;
      const duree = s && s.hira ? DUREE_STORY_HIRA : DUREE_STORY;
      clearTimeout(minuterieStory);
      const barre = v.querySelector('.story-barre i[style]');
      if(barre){ barre.style.animation = 'none'; void barre.offsetWidth; barre.style.animation = ''; }
      minuterieStory = setTimeout(v.__suivant, duree);
    };
    v.__suivant = function(){
      if(i < g.liste.length - 1){ i += 1; montrer(); }
      else if(indexGroupe < groupes.length - 1) ouvrirGroupe(indexGroupe + 1, 0);
      else fermerVisionneuse();
    };
    v.__precedent = function(){
      if(i > 0){ i -= 1; montrer(); }
      else if(indexGroupe > 0){
        const avant = groupes[indexGroupe - 1];
        ouvrirGroupe(indexGroupe - 1, avant.liste.length - 1);
      } else montrer();
    };
    montrer();
  }

  // ---- Ajouter : une ou plusieurs photos ou vidéos, deux mots si l'on
  // veut, une chanson si l'on veut, et « Alefa » ----
  //
  // Chaque élément : { genre: 'sary', media: 'data:…' } pour une photo déjà
  // réduite, { genre: 'video', fichier, apercu } pour une vidéo qui partira
  // au bucket. Les mots et la chanson valent pour toutes.

  // Une vidéo trop longue ou trop lourde est refusée tout de suite, avant
  // d'avoir fait attendre l'envoi.
  function preparerVideo(f){
    return new Promise(function(ok){
      if(f.size > MAX_STORY_MO * 1048576){
        ok({ erreur: '« ' + f.name + ' » : lehibe loatra (' + (f.size / 1048576).toFixed(1) + ' Mo, ' + MAX_STORY_MO + ' Mo farany).' });
        return;
      }
      const url = URL.createObjectURL(f);
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.muted = true;
      // Plus longue que trente secondes, elle entre quand même : on en
      // choisira le morceau (le début, la longueur) dans l'écriture.
      el.onloadedmetadata = function(){
        const duree = isFinite(el.duration) ? el.duration : MAX_STORY_SECONDES;
        ok({ genre: 'video', fichier: f, apercu: url, duree: duree, debut: 0, fin: Math.min(duree, MAX_STORY_SECONDES) });
      };
      el.onerror = function(){ ok({ genre: 'video', fichier: f, apercu: url, duree: MAX_STORY_SECONDES, debut: 0, fin: MAX_STORY_SECONDES }); };
      el.src = url;
    });
  }
  function preparerSary(f){
    return new Promise(function(ok){
      resizeImageFile(f, function(media){ ok({ genre: 'sary', media: media, apercu: media }); });
    });
  }

  function envoyerAuBucketStory(fichier, uid){
    const ext = (String(fichier.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const nom = uid + '/' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) + '.' + ext;
    return window.__sb.storage.from(BUCKET_STORY)
      .upload(nom, fichier, { contentType: fichier.type || undefined, upsert: false })
      .then(function(res){
        if(res && res.error) throw res.error;
        return window.__sb.storage.from(BUCKET_STORY).getPublicUrl(nom).data.publicUrl;
      });
  }

  // ✂️ Le morceau choisi, enregistré ici même avant l'envoi : la vidéo
  // entière (souvent des dizaines de Mo) ne passait pas sur une connexion de
  // téléphone — « Failed to fetch », sans que rien n'arrive au serveur. On la
  // rejoue sans bruit dans une toile, image et son, de debut à fin, et l'on
  // garde ce que MediaRecorder en a fait. Le morceau dure ce qu'il dure : 30 s
  // au plus. Rend null là où le navigateur ne sait pas faire (on envoie alors
  // le fichier d'origine, comme avant).
  function tapahoVideo(x, progres){
    const canvasOk = window.MediaRecorder && HTMLCanvasElement.prototype.captureStream;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!canvasOk || !AC) return Promise.resolve(null);
    const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const type = types.filter(function(t){ return MediaRecorder.isTypeSupported(t); })[0];
    if(!type) return Promise.resolve(null);
    return new Promise(function(resolve){
      const video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'auto';
      video.src = x.apercu;
      let fini = false, audio = null, recorder = null, garde = null;
      function finir(fichier){
        if(fini) return;
        fini = true;
        clearTimeout(garde);
        try{ video.pause(); }catch(e){}
        if(audio) audio.close().catch(function(){});
        resolve(fichier);
      }
      video.addEventListener('error', function(){ finir(null); });
      video.addEventListener('loadedmetadata', function(){
        const w0 = video.videoWidth || 720, h0 = video.videoHeight || 1280;
        const echelle = Math.min(1, 720 / Math.max(w0, h0));
        const toile = document.createElement('canvas');
        toile.width = Math.round(w0 * echelle / 2) * 2;
        toile.height = Math.round(h0 * echelle / 2) * 2;
        const c2d = toile.getContext('2d');
        const flux = toile.captureStream(30);
        // Le son passe par Web Audio, sans aller jusqu'aux haut-parleurs.
        try{
          audio = new AC();
          const sortie = audio.createMediaStreamDestination();
          audio.createMediaElementSource(video).connect(sortie);
          sortie.stream.getAudioTracks().forEach(function(p){ flux.addTrack(p); });
        }catch(e){ video.muted = true; }
        const morceaux = [];
        try{
          recorder = new MediaRecorder(flux, { mimeType: type, videoBitsPerSecond: 2000000 });
        }catch(e){ finir(null); return; }
        recorder.ondataavailable = function(e){ if(e.data && e.data.size) morceaux.push(e.data); };
        recorder.onstop = function(){
          const base = type.split(';')[0];
          const blob = new Blob(morceaux, { type: base });
          if(!blob.size){ finir(null); return; }
          finir(new File([blob], 'story.' + (base === 'video/mp4' ? 'mp4' : 'webm'), { type: base }));
        };
        const debut = x.debut || 0, fin = x.fin || Math.min(video.duration, debut + MAX_STORY_SECONDES);
        function peindre(){
          if(fini || recorder.state === 'inactive') return;
          c2d.drawImage(video, 0, 0, toile.width, toile.height);
          if(progres) progres(Math.min(video.currentTime - debut, fin - debut), fin - debut);
          if(video.currentTime >= fin || video.ended){ recorder.stop(); return; }
          // Une minuterie, pas requestAnimationFrame : celle-ci s'arrête net
          // dès que la page passe derrière une autre.
          setTimeout(peindre, 33);
        }
        video.addEventListener('seeked', function(){
          if(recorder.state !== 'inactive' || fini) return;
          if(audio && audio.state === 'suspended') audio.resume().catch(function(){});
          video.play().then(function(){
            recorder.start(1000);
            peindre();
          }, function(){ finir(null); });
        }, { once: true });
        // Jamais bloqué : la durée du morceau, et une marge.
        garde = setTimeout(function(){
          if(recorder.state !== 'inactive') recorder.stop(); else finir(null);
        }, (fin - debut + 20) * 1000);
        video.currentTime = debut;
      });
    });
  }

  function composerStory(elements, erreurs){
    const v = cadreVisionneuse();
    let courant = 0;
    let hira = null; // { fichier, nom, duree, debut }
    let ecoute = null;
    v.innerHTML =
      '<div class="story-tete"><strong>Story vaovao</strong>' +
        '<button type="button" class="story-hidy" aria-label="Aoka ihany" title="Aoka ihany">✕</button></div>' +
      '<div class="story-apercu"></div>' +
      '<div class="story-bas">' +
        '<div class="story-tapaka" hidden></div>' +
        '<div class="story-vignettes"></div>' +
        '<div class="story-hira-choix">' +
          '<button type="button" class="story-hira-btn">🎵 Hampiditra hira</button>' +
          '<span class="story-hira-anarana" hidden></span>' +
          '<button type="button" class="story-hira-esory" hidden aria-label="Esory ny hira" title="Esory ny hira">✕</button>' +
          '<input type="file" class="story-hira-fichier" accept="audio/*" hidden>' +
        '</div>' +
        '<div class="story-hira-tapaka" hidden></div>' +
        '<div class="story-mandefa">' +
          '<input type="text" class="story-teny" maxlength="300" placeholder="Soraty eto raha tianao…">' +
          '<button type="button" class="btn btn-primary story-alefa">Alefa</button>' +
        '</div>' +
        '<p class="story-erreur"' + (erreurs.length ? '' : ' hidden') + '>' + erreurs.map(escapeHtml).join('<br>') + '</p>' +
      '</div>';

    function fermer(){
      if(ecoute){ try{ ecoute.pause(); }catch(e){} ecoute = null; }
      elements.forEach(function(x){ if(x.genre === 'video') URL.revokeObjectURL(x.apercu); });
      fermerVisionneuse();
    }
    v.querySelector('.story-hidy').addEventListener('click', fermer);

    function dessiner(){
      const alefa = v.querySelector('.story-alefa');
      if(!elements.length){ fermer(); return; }
      courant = Math.min(courant, elements.length - 1);
      const x = elements[courant];
      v.querySelector('.story-apercu').innerHTML = x.genre === 'video'
        ? '<video class="story-sary" src="' + x.apercu + '" playsinline autoplay' + (hira ? ' muted' : '') + '></video>'
        : '<img class="story-sary" src="' + x.apercu + '" alt="">';
      // L'aperçu ne joue que le morceau choisi, en boucle.
      const lecteur = v.querySelector('.story-apercu video');
      if(lecteur){
        lecteur.addEventListener('loadedmetadata', function(){ lecteur.currentTime = x.debut || 0; });
        lecteur.addEventListener('timeupdate', function(){
          if(lecteur.currentTime >= x.fin - 0.05 || lecteur.currentTime < (x.debut || 0) - 0.5){
            lecteur.currentTime = x.debut || 0;
            if(lecteur.paused) lecteur.play().catch(function(){});
          }
        });
        lecteur.addEventListener('ended', function(){ lecteur.currentTime = x.debut || 0; lecteur.play().catch(function(){}); });
      }
      dessinerTapaka();
      v.querySelector('.story-vignettes').innerHTML =
        elements.map(function(y, k){
            return '<span class="story-vignette' + (k === courant ? ' courant' : '') + '" data-k="' + k + '">' +
              (y.genre === 'video'
                ? '<video src="' + y.apercu + '#t=0.3" muted playsinline preload="metadata"></video><b>▶</b>'
                : '<img src="' + y.apercu + '" alt="">') +
              '<i data-esory="' + k + '" title="Esory" aria-label="Esory">✕</i></span>';
          }).join('') +
          (elements.length < MAX_STORIES_D_UN_COUP ? '<span class="story-vignette story-vignette-plus" data-plus title="Hanampy" aria-label="Hanampy">+</span>' : '');
      alefa.textContent = elements.length > 1 ? 'Alefa (' + elements.length + ')' : 'Alefa';
    }
    // ✂️ Le morceau de la vidéo, sur une frise : la vidéo entière en rouge
    // (ce qui ne partira pas), le morceau choisi en clair par-dessus — trente
    // secondes au plus. On tire ses deux bords, on le fait glisser en entier,
    // ou on touche le rouge pour l'y amener ; l'aperçu suit le doigt.
    function mn(t){
      t = Math.max(0, Math.round(t || 0));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }
    function dessinerTapaka(){
      const zone = v.querySelector('.story-tapaka');
      const x = elements[courant];
      if(!x || x.genre !== 'video' || !(x.duree > 1)){ zone.hidden = true; zone.innerHTML = ''; return; }
      zone.hidden = false;
      zone.innerHTML =
        '<div class="story-tapaka-titre">✂️ Halefa : <b data-voalohany></b> → <b data-farany></b>' +
          ' · <span data-halava></span> <span class="story-frise-max">(' + MAX_STORY_SECONDES + ' s farany)</span></div>' +
        '<div class="story-frise" data-frise>' +
          '<div class="story-frise-voafidy" data-voafidy>' +
            '<i class="story-frise-sisiny" data-sisiny="debut"></i><i class="story-frise-sisiny" data-sisiny="fin"></i>' +
          '</div>' +
          '<div class="story-frise-tete" data-tete></div>' +
        '</div>' +
        '<div class="story-frise-legende"><span>0:00</span>' +
          '<span><i class="story-frise-mena"></i>tsy halefa</span><span>' + mn(x.duree) + '</span></div>';
      const frise = zone.querySelector('[data-frise]');
      const voafidy = zone.querySelector('[data-voafidy]');
      const tete = zone.querySelector('[data-tete]');
      const pct = function(t){ return (t / x.duree * 100) + '%'; };
      function afficher(){
        voafidy.style.left = pct(x.debut);
        voafidy.style.width = pct(x.fin - x.debut);
        zone.querySelector('[data-voalohany]').textContent = mn(x.debut);
        zone.querySelector('[data-farany]').textContent = mn(x.fin);
        zone.querySelector('[data-halava]').textContent = Math.round(x.fin - x.debut) + ' s';
      }
      function lecteur(){ return v.querySelector('.story-apercu video'); }
      function aller(t){ const l = lecteur(); if(l) l.currentTime = t; }
      // Le temps sous le doigt.
      function temps(clientX){
        const r = frise.getBoundingClientRect();
        return Math.min(x.duree, Math.max(0, (clientX - r.left) / (r.width || 1) * x.duree));
      }
      let prise = null; // { mode, depart, debut, fin }
      frise.addEventListener('pointerdown', function(e){
        const t = temps(e.clientX);
        const sisiny = e.target.closest('[data-sisiny]');
        const longueur = x.fin - x.debut;
        let mode = sisiny ? sisiny.getAttribute('data-sisiny') : (e.target.closest('[data-voafidy]') ? 'tout' : 'saute');
        if(mode === 'saute'){
          // Touché dans le rouge : le morceau vient commencer là.
          x.debut = Math.min(Math.max(0, t - longueur / 2), x.duree - longueur);
          x.fin = x.debut + longueur;
          afficher();
          aller(x.debut);
          mode = 'tout';
        }
        prise = { mode: mode, depart: t, debut: x.debut, fin: x.fin };
        try{ frise.setPointerCapture(e.pointerId); }catch(err){}
        e.preventDefault();
      });
      frise.addEventListener('pointermove', function(e){
        if(!prise) return;
        const t = temps(e.clientX);
        if(prise.mode === 'debut'){
          x.debut = Math.min(Math.max(t, prise.fin - MAX_STORY_SECONDES, 0), prise.fin - 1);
          aller(x.debut);
        }else if(prise.mode === 'fin'){
          x.fin = Math.max(Math.min(t, prise.debut + MAX_STORY_SECONDES, x.duree), prise.debut + 1);
          aller(Math.max(x.debut, x.fin - 0.3));
        }else{
          const l = prise.fin - prise.debut;
          x.debut = Math.min(Math.max(0, prise.debut + t - prise.depart), x.duree - l);
          x.fin = x.debut + l;
          aller(x.debut);
        }
        afficher();
      });
      function lacher(){
        if(!prise) return;
        prise = null;
        aller(x.debut);
        const l = lecteur();
        if(l && l.paused) l.play().catch(function(){});
      }
      frise.addEventListener('pointerup', lacher);
      frise.addEventListener('pointercancel', lacher);
      // La tête de lecture, pour voir où en est l'aperçu.
      const l = lecteur();
      if(l) l.addEventListener('timeupdate', function(){ tete.style.left = pct(Math.min(l.currentTime, x.duree)); });
      afficher();
    }

    // 🎵 Où commence la chanson : un curseur, et on l'entend de là.
    function dessinerHiraTapaka(){
      const zone = v.querySelector('.story-hira-tapaka');
      if(!hira || !(hira.duree > 5)){ zone.hidden = true; zone.innerHTML = ''; return; }
      zone.hidden = false;
      zone.innerHTML =
        '<label>🎵 Manomboka amin\'ny <b data-hira-debut>' + mn(hira.debut) + '</b>' +
          '<input type="range" data-hira-curseur min="0" max="' + Math.max(0, hira.duree - 5).toFixed(1) +
          '" step="0.5" value="' + hira.debut + '"></label>';
      const c = zone.querySelector('[data-hira-curseur]');
      c.addEventListener('input', function(){
        hira.debut = Number(c.value);
        zone.querySelector('[data-hira-debut]').textContent = mn(hira.debut);
      });
      c.addEventListener('change', function(){
        if(ecoute){ ecoute.currentTime = hira.debut; ecoute.play().catch(function(){}); }
      });
    }

    v.querySelector('.story-vignettes').addEventListener('click', function(e){
      const esory = e.target.closest('[data-esory]');
      if(esory){
        const k = Number(esory.getAttribute('data-esory'));
        const x = elements.splice(k, 1)[0];
        if(x && x.genre === 'video') URL.revokeObjectURL(x.apercu);
        if(courant >= k && courant > 0) courant -= 1;
        dessiner();
        return;
      }
      if(e.target.closest('[data-plus]')){
        storyFichier.__ajouterA = function(nouveaux, errs){
          elements.push.apply(elements, nouveaux.slice(0, MAX_STORIES_D_UN_COUP - elements.length));
          const e2 = v.querySelector('.story-erreur');
          e2.hidden = !errs.length;
          e2.innerHTML = errs.map(escapeHtml).join('<br>');
          dessiner();
        };
        storyFichier.value = '';
        storyFichier.click();
        return;
      }
      const vig = e.target.closest('[data-k]');
      if(vig){ courant = Number(vig.getAttribute('data-k')); dessiner(); }
    });

    // La chanson : un fichier du téléphone, écouté tout de suite pour savoir
    // si c'est la bonne.
    const hiraFichier = v.querySelector('.story-hira-fichier');
    const hiraNom = v.querySelector('.story-hira-anarana');
    const hiraEsory = v.querySelector('.story-hira-esory');
    const hiraBtn = v.querySelector('.story-hira-btn');
    hiraBtn.addEventListener('click', function(){ hiraFichier.value = ''; hiraFichier.click(); });
    hiraFichier.addEventListener('change', function(){
      const f = hiraFichier.files && hiraFichier.files[0];
      if(!f) return;
      const e = v.querySelector('.story-erreur');
      if(f.size > MAX_STORY_MO * 1048576){
        e.hidden = false;
        e.textContent = 'Lehibe loatra ny hira (' + (f.size / 1048576).toFixed(1) + ' Mo, ' + MAX_STORY_MO + ' Mo farany).';
        return;
      }
      if(ecoute){ try{ ecoute.pause(); }catch(err){} URL.revokeObjectURL(ecoute.src); }
      hira = { fichier: f, nom: String(f.name || 'Hira').replace(/\.[^.]+$/, '').slice(0, 120), duree: 0, debut: 0 };
      // Chaque écouteur tient son propre lecteur : retirée ou changée, la
      // chanson d'avant peut encore envoyer un dernier événement.
      const lecteur = ecoute = new Audio(URL.createObjectURL(f));
      const cetteHira = hira;
      // Écoutée depuis le début choisi, et ramenée là au bout de trente
      // secondes : c'est ce morceau qu'entendront les autres.
      lecteur.addEventListener('loadedmetadata', function(){
        if(hira !== cetteHira) return;
        hira.duree = isFinite(lecteur.duration) ? lecteur.duration : 0;
        dessinerHiraTapaka();
      });
      lecteur.addEventListener('timeupdate', function(){
        if(hira !== cetteHira) return;
        if(lecteur.currentTime > hira.debut + MAX_STORY_SECONDES || lecteur.currentTime < hira.debut - 0.5) lecteur.currentTime = hira.debut;
      });
      lecteur.addEventListener('ended', function(){
        if(hira !== cetteHira) return;
        lecteur.currentTime = hira.debut;
        lecteur.play().catch(function(){});
      });
      ecoute.play().catch(function(){});
      hiraNom.textContent = '🎵 ' + hira.nom;
      hiraNom.hidden = false;
      hiraEsory.hidden = false;
      hiraBtn.textContent = '🎵 Hanova';
      dessiner();
    });
    hiraEsory.addEventListener('click', function(){
      if(ecoute){ try{ ecoute.pause(); }catch(err){} URL.revokeObjectURL(ecoute.src); ecoute = null; }
      hira = null;
      hiraNom.hidden = true;
      hiraEsory.hidden = true;
      hiraBtn.textContent = '🎵 Hampiditra hira';
      dessinerHiraTapaka();
      dessiner();
    });

    const alefa = v.querySelector('.story-alefa');
    alefa.addEventListener('click', function(){
      alefa.disabled = true;
      const texte = (v.querySelector('.story-teny').value || '').trim() || null;
      const maison = jeSuisLaMaison();
      const e = v.querySelector('.story-erreur');
      e.hidden = true;
      let session = null, photo = null, urlHira = null, fait = 0;
      function etape(t){ alefa.textContent = '⏳ ' + t; }
      etape('');
      sessionStory().then(function(s){
        if(!s) throw new Error('Midira amin\'ny tenimiafinao aloha.');
        session = s;
        return maison ? MARQUE_LOGO : vignette(currentUser && currentUser.logo);
      }).then(function(p){
        photo = p;
        if(!hira) return null;
        etape('hira');
        return envoyerAuBucketStory(hira.fichier, session.user.id).then(function(u){ urlHira = u; });
      }).then(function(){
        // L'une après l'autre : dans l'ordre choisi, et sans lancer dix
        // envois de vidéo à la fois sur une connexion de téléphone.
        return elements.reduce(function(p, x){
          let debut = x.debut || 0, fin = x.fin;
          return p.then(function(){
            etape((fait + 1) + '/' + elements.length);
            if(x.genre !== 'video') return x.media;
            // Une vidéo courte et légère part telle quelle ; sinon, seul le
            // morceau choisi part.
            const entiere = debut < 0.1 && (!x.duree || fin >= x.duree - 0.1);
            const tapahina = entiere && x.fichier.size < 8 * 1048576 ? Promise.resolve(null)
              : tapahoVideo(x, function(t, total){
                  etape('✂️ ' + (elements.length > 1 ? (fait + 1) + '/' + elements.length + ' · ' : '') +
                    Math.max(0, Math.round(t)) + '/' + Math.round(total) + ' s');
                });
            return tapahina.then(function(morceau){
              if(morceau && morceau.size < x.fichier.size){
                fin = fin - debut;
                debut = 0;
              }else morceau = null;
              etape((elements.length > 1 ? (fait + 1) + '/' + elements.length + ' · ' : '') + 'mandefa…');
              return envoyerAuBucketStory(morceau || x.fichier, session.user.id).catch(function(err){
                // « Failed to fetch » ne dit rien : dire plutôt ce qui pèse.
                const mo = ((morceau || x.fichier).size / 1048576).toFixed(1);
                if(/fetch|network|réseau/i.test((err && err.message) || '')){
                  throw new Error('tapaka ny connexion teo am-pandefasana ny video (' + mo + ' Mo). Andramo indray');
                }
                throw err;
              });
            });
          }).then(function(media){
            return window.__sb.from('botika_stories').insert({
              auteur_nom: maison ? MARQUE_NOM : ((currentUser && currentUser.name) || 'Client'),
              auteur_photo: photo,
              genre: x.genre,
              media: media,
              texte: texte,
              hira: urlHira,
              hira_nom: urlHira ? hira.nom : null,
              hira_debut: urlHira ? (hira.debut || 0) : null,
              video_debut: x.genre === 'video' ? debut : null,
              video_fin: x.genre === 'video' ? fin : null
            });
          }).then(function(res){
            if(res && res.error) throw res.error;
            fait += 1;
          });
        }, Promise.resolve());
      }).then(function(){
        fermer();
        chargerStories();
      }).catch(function(err){
        // Celles déjà parties restent parties : on ne garde ici que la suite.
        elements.splice(0, fait);
        alefa.disabled = false;
        dessiner();
        e.hidden = false;
        e.textContent = 'Tsy lasa' + (fait ? ' ny sisa (' + fait + ' efa lasa)' : '') + ' : ' + ((err && err.message) || 'réseau');
        if(fait) chargerStories();
      });
    });
    dessiner();
  }

  // Les fichiers choisis, préparés dans l'ordre : photos réduites, vidéos
  // vérifiées. Ce qui est refusé est dit, le reste passe.
  function preparerFichiersStory(liste){
    const fichiers = Array.prototype.slice.call(liste || [], 0, MAX_STORIES_D_UN_COUP);
    const erreurs = [];
    if((liste || []).length > MAX_STORIES_D_UN_COUP) erreurs.push(MAX_STORIES_D_UN_COUP + ' farany isaky ny mandefa.');
    return fichiers.reduce(function(p, f){
      return p.then(function(acc){
        const video = /^video\//.test(f.type || '');
        const image = /^image\//.test(f.type || '');
        if(!video && !image){ erreurs.push('« ' + f.name + ' » : tsy sary na video.'); return acc; }
        return (video ? preparerVideo(f) : preparerSary(f)).then(function(x){
          if(x.erreur) erreurs.push(x.erreur); else acc.push(x);
          return acc;
        });
      });
    }, Promise.resolve([])).then(function(elements){ return { elements: elements, erreurs: erreurs }; });
  }

  // Choisir sary, video ou clip (plusieurs d'un coup) depuis le « + » de la
  // rangée.
  function choisirFichiersStory(bouton){
    sessionStory().then(function(session){
      if(!session){ direPresDuBouton(bouton, 'Midira amin\'ny tenimiafinao aloha vao afaka mametraka story.'); return; }
      storyFichier.value = '';
      storyFichier.click();
    });
  }

  // ---- Faire défiler une rangée pleine ----
  // Au doigt elle glisse déjà ; à la souris, il faut les flèches, la molette
  // ou la tirer. Les flèches ne paraissent que s'il reste à voir de ce côté.
  function armerDefilementStories(){
    const g = document.getElementById('storyFlecheG');
    const d = document.getElementById('storyFlecheD');
    function majFleches(){
      const max = storyRangee.scrollWidth - storyRangee.clientWidth;
      if(g) g.hidden = storyRangee.scrollLeft <= 2;
      if(d) d.hidden = storyRangee.scrollLeft >= max - 2;
    }
    function pousser(sens){
      storyRangee.scrollBy({ left: sens * Math.max(storyRangee.clientWidth * 0.8, 100), behavior: 'smooth' });
    }
    if(g) g.addEventListener('click', function(){ pousser(-1); });
    if(d) d.addEventListener('click', function(){ pousser(1); });
    storyRangee.addEventListener('scroll', majFleches, { passive: true });
    // Cachée tant que la page Botika n'est pas ouverte : sa taille change en
    // paraissant, et les flèches se recalculent alors.
    if(window.ResizeObserver) new ResizeObserver(majFleches).observe(storyRangee);
    else window.addEventListener('resize', majFleches);
    new MutationObserver(majFleches).observe(storyRangee, { childList: true });
    // La molette verticale fait glisser la rangée, tant qu'elle peut glisser.
    storyRangee.addEventListener('wheel', function(e){
      if(Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = storyRangee.scrollWidth - storyRangee.clientWidth;
      if(max <= 0) return;
      if(e.deltaY < 0 && storyRangee.scrollLeft <= 0) return;
      if(e.deltaY > 0 && storyRangee.scrollLeft >= max) return;
      e.preventDefault();
      storyRangee.scrollLeft += e.deltaY;
    }, { passive: false });
    // Tirer à la souris : bouger avant le tiers de seconde, c'est défiler.
    let t = null;
    storyRangee.addEventListener('pointerdown', function(e){
      if(e.pointerType !== 'mouse' || e.button > 0) return;
      t = { x: e.clientX, depart: storyRangee.scrollLeft, bouge: false };
    });
    storyRangee.addEventListener('pointermove', function(e){
      if(!t || storyRangee.querySelector('.story-tiree')) return;
      const dx = e.clientX - t.x;
      if(!t.bouge && Math.abs(dx) < 8) return;
      t.bouge = true;
      storyRangee.classList.add('story-glisse');
      storyRangee.scrollLeft = t.depart - dx;
    });
    function lacher(){
      if(t && t.bouge){
        // Le relâché n'ouvre pas la story sous la souris.
        storyRangee.__vientDeTirer = true;
        setTimeout(function(){ storyRangee.__vientDeTirer = false; }, 400);
      }
      t = null;
      storyRangee.classList.remove('story-glisse');
    }
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    storyRangee.addEventListener('dragstart', function(e){ e.preventDefault(); });
    majFleches();
  }

  // ---- La rangée glisse d'elle-même ----
  // Tant que personne n'y touche, elle avance doucement de côté ; au bout,
  // elle marque un temps et revient au début. Un doigt, la souris ou la
  // molette dessus l'arrêtent ; elle repart trois secondes après qu'on l'a
  // lâchée. Même chose dans botika/index.html.
  function defilerStoriesSeules(r){
    if(!r || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    let pos = r.scrollLeft, attente = 0, dedans = false, avant = 0;
    function retenir(ms){ attente = Math.max(attente, performance.now() + ms); }
    ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function(t){
      r.addEventListener(t, function(){ retenir(4000); }, { passive: true });
    });
    r.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') dedans = true; });
    r.addEventListener('pointerleave', function(){ dedans = false; retenir(3000); });
    ['pointerup', 'touchend', 'pointercancel'].forEach(function(t){
      r.addEventListener(t, function(){ retenir(3000); }, { passive: true });
    });
    function pas(t){
      requestAnimationFrame(pas);
      const dt = Math.min(t - (avant || t), 50);
      avant = t;
      const max = r.scrollWidth - r.clientWidth;
      if(max <= 0 || dedans || t < attente || document.hidden || !r.offsetParent ||
        r.querySelector('.story-tiree') || r.classList.contains('story-glisse')) { pos = r.scrollLeft; return; }
      // Quelqu'un l'a fait glisser entre-temps : on repart de là.
      if(Math.abs(r.scrollLeft - pos) > 2) pos = r.scrollLeft;
      if(pos >= max - 1){
        // Un temps au bout, le retour, puis un temps au début.
        retenir(4000);
        setTimeout(function(){ r.scrollTo({ left: 0, behavior: 'smooth' }); }, 1500);
        return;
      }
      pos = Math.min(max, pos + dt * 0.03);
      r.scrollLeft = pos;
    }
    retenir(2500);
    requestAnimationFrame(pas);
  }

  if(storyRangee){
    armerDeplacementStories();
    armerDefilementStories();
    defilerStoriesSeules(storyRangee);
    storyRangee.addEventListener('click', function(e){
      // Le relâché d'un déplacement n'est pas un appui : rien ne s'ouvre.
      if(storyRangee.__vientDeTirer){ storyRangee.__vientDeTirer = false; e.preventDefault(); return; }
      const ajouter = e.target.closest('[data-story-ajouter]');
      if(ajouter){ choisirFichiersStory(ajouter); return; }
      const carte = e.target.closest('[data-story-groupe]');
      if(carte) ouvrirGroupe(Number(carte.getAttribute('data-story-groupe')), 0);
    });
    if(storyFichier) storyFichier.addEventListener('change', function(){
      // Ajoutés à une story en cours d'écriture (« + »), ou une nouvelle.
      const ajouterA = storyFichier.__ajouterA;
      storyFichier.__ajouterA = null;
      preparerFichiersStory(storyFichier.files).then(function(r){
        if(ajouterA){ ajouterA(r.elements, r.erreurs); return; }
        if(!r.elements.length){
          if(r.erreurs.length) direPresDuBouton(storyRangee.querySelector('[data-story-ajouter]') || storyRangee, r.erreurs.join(' '));
          return;
        }
        composerStory(r.elements, r.erreurs);
      });
    });
    dessinerStories();
  }

  // Une table absente et un réseau coupé ne se réparent pas de la même façon :
  // dire lequel des deux, c'est éviter de chercher au mauvais endroit.
  function feedErrorText(error){
    const brut = (error && (error.message || error.hint)) || '';
    if(/does not exist|schema cache|PGRST205|404/i.test(brut)){
      return 'Tsy mbola voaforona ao amin\'ny serveur ny latabatra ilaina. ' +
        'Alefaso ao amin\'ny Supabase > SQL Editor ny « supabase-commentaires.sql » sy « supabase-jaime.sql ».';
    }
    if(/JWT|not authenticated|permission|policy|row-level/i.test(brut)){
      return 'Midira aloha vao afaka mandefa.';
    }
    return brut || 'Tsy nety : jereo ny fifandraisanao.';
  }

  // ---------------- « J'AIME » ----------------
  // Ce que le serveur dit des « j'aime » du fil affiché : combien, et si
  // celui qui regarde en fait partie.
  let likeState = {};

  function myLikeEmail(){
    return (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : '';
  }

  // Le pouce de Facebook, dessiné : creux tant qu'on n'a pas aimé, plein et
  // bleu ensuite (components.css, « .fb-like-action »). L'emoji avait sa
  // propre couleur et ne changeait jamais.
  const POUCE = '<svg class="fb-pouce" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 21h3.5V9.5H2zM21.9 11.2c0-1.1-.9-2-2-2h-5.6l.9-4.3v-.3c0-.4-.2-.8-.4-1.1L13.7 2.5 8 8.2c-.3.3-.5.8-.5 1.3V19c0 1.1.9 2 2 2h8.6c.8 0 1.5-.5 1.8-1.2l2.8-6.6c.1-.2.1-.5.1-.7v-1.3z"/></svg>';

  // « Partager » : la flèche courbe de Facebook, tracée comme le pouce, au
  // lieu de l'emoji ↗️ dans son carré bleu, qui jurait avec le reste.
  // Puis le logo de la maison qui partage : le « N », une petite flèche
  // posée sur son coin.
  // Les trois actions portent le même logo, chacune sa pastille : la flèche
  // pour partager, la bulle pour commenter, le pouce pour aimer.
  function logoAvec(chemin, classe){
    return '<span class="fb-logo-partage' + (classe ? ' ' + classe : '') + '" aria-hidden="true">' +
      '<img src="/icone-192.png" alt="" draggable="false">' +
      '<svg viewBox="0 0 24 24"><path d="' + chemin + '"/></svg>' +
      '</span>';
  }
  const FLECHE_PARTAGE = logoAvec('M13.5 4.5 21 11.6l-7.5 7.1v-4.2c-5.3-.2-8.8 1.5-11 5 .6-5.6 3.8-10.1 11-10.8z');
  // Effacer : la corbeille dans une pastille rouge, sans mot — le mot reste
  // dans title et aria-label, pour le survol et pour qui lit à voix haute.
  const LOGO_FAFANA = logoAvec('M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z', 'fafana');
  // « Ovay » : la même pastille, un crayon dessus.
  const LOGO_OVAY = logoAvec('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z', 'ovay');
  // « Groupe » : la pastille, un petit groupe de personnes dessus.
  const LOGO_GROUPE = logoAvec('M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4zm8 0c-.3 0-.7 0-1.1.1 1.3.9 2.1 2.1 2.1 3.9v3h7v-3c0-2.7-5.3-4-8-4z', 'groupe');
  // Le panier : un caddie dans la pastille.
  const LOGO_PANIER = logoAvec('M3 4h2.2l2.1 10.3a2 2 0 0 0 2 1.7h7.9a2 2 0 0 0 1.9-1.4L21 8H7M10 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'panier');
  const BULLE_COMMENTER =logoAvec('M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
  const POUCE_LOGO = 'M2 21h3.5V9.5H2zM21.9 11.2c0-1.1-.9-2-2-2h-5.6l.9-4.3v-.3c0-.4-.2-.8-.4-1.1L13.7 2.5 8 8.2c-.3.3-.5.8-.5 1.3V19c0 1.1.9 2 2 2h8.6c.8 0 1.5-.5 1.8-1.2l2.8-6.6c.1-.2.1-.5.1-.7v-1.3z';

  // Les réactions, comme sur Facebook (supabase-reactions.sql). Le pouce
  // garde son dessin ; les autres sont des visages, chacun sa couleur.
  // Les visages en relief : les « Fluent Emoji 3D » de Microsoft (licence
  // MIT), servis par jsDelivr comme les autres bibliothèques. Si l'image ne
  // vient pas, son texte de remplacement est l'emoji ordinaire.
  const EMOJI_3D = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/';
  const REACTIONS = [
    { id: 'like',  emoji: '👍', nom: 'J\'aime',   couleur: '#0866ff', image: 'Thumbs%20up/Default/3D/thumbs_up_3d_default.png' },
    { id: 'love',  emoji: '❤️', nom: 'J\'adore',  couleur: '#f33e58', image: 'Red%20heart/3D/red_heart_3d.png' },
    { id: 'care',  emoji: '🥰', nom: 'Solidaire', couleur: '#f7b125', image: 'Smiling%20face%20with%20hearts/3D/smiling_face_with_hearts_3d.png' },
    { id: 'haha',  emoji: '😆', nom: 'Haha',      couleur: '#f7b125', image: 'Grinning%20squinting%20face/3D/grinning_squinting_face_3d.png' },
    { id: 'wow',   emoji: '😮', nom: 'Wouah',     couleur: '#f7b125', image: 'Face%20with%20open%20mouth/3D/face_with_open_mouth_3d.png' },
    { id: 'sad',   emoji: '😢', nom: 'Triste',    couleur: '#f7b125', image: 'Crying%20face/3D/crying_face_3d.png' },
    { id: 'angry', emoji: '😡', nom: 'Grrr',      couleur: '#e9710f', image: 'Pouting%20face/3D/pouting_face_3d.png' }
  ];
  function reactionDe(id){
    return REACTIONS.filter(function(r){ return r.id === id; })[0] || REACTIONS[0];
  }
  function visage(r){
    return '<img class="fb-emoji-3d" src="' + EMOJI_3D + r.image + '" alt="' + r.emoji + '" draggable="false">';
  }
  // Ceux qui s'éparpillent bougent : les « Noto Animated Emoji » de Google
  // (licence CC BY 4.0) — le rire secoue, le cœur bat, les larmes coulent.
  // Lourds (un demi-mégaoctet chacun), ils ne viennent qu'au moment où l'on
  // choisit, et seul celui qu'on a choisi. Absent, le visage en relief le
  // remplace.
  const EMOJI_ANIME = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
  const CODES_ANIMES = { like: '1f44d', love: '2764_fe0f', care: '1f970', haha: '1f606', wow: '1f62e', sad: '1f622', angry: '1f621' };
  function visageAnime(r){
    const code = CODES_ANIMES[r.id];
    if(!code) return visage(r);
    return '<img class="fb-emoji-3d fb-emoji-anime" src="' + EMOJI_ANIME + code + '/512.webp" alt="' + r.emoji +
      '" draggable="false" onerror="this.onerror=null;this.src=\'' + EMOJI_3D + r.image + '\'">';
  }
  // Tant que supabase-reactions.sql n'est pas passé, la colonne manque : on
  // retombe sur le simple « j'aime », sans menu de réactions.
  let sansReactions = false;

  function bulle(id){
    return id === 'like'
      ? '<span class="fb-like-bubble">' + POUCE + '</span>'
      : '<span class="fb-reaction-bulle">' + visage(reactionDe(id)) + '</span>';
  }

  // Deux sortes de choses reçoivent des réactions : les billets et les
  // commentaires. Même menu, même éclat, mêmes pastilles ; seuls changent la
  // table, la colonne et l'endroit où l'on compte. Le bouton porte sa sorte
  // (data-sorte), et tout le reste s'en déduit.
  let reactionsCommentaires = {};
  const SORTES = {
    billet: {
      etats: function(){ return likeState; },
      table: 'client_news_likes', colonne: 'news_id', avecQui: true, pouce: true,
      compte: function(el){ const p = el.closest('.fb-post'); return p && p.querySelector('[data-like-count]'); }
    },
    commentaire: {
      etats: function(){ return reactionsCommentaires; },
      table: 'client_news_comment_reactions', colonne: 'comment_id', avecQui: false, pouce: false,
      compte: function(el){ const c = el.closest('.fb-comment'); return c && c.querySelector('[data-comment-count]'); }
    },
    // Les stories n'ont que l'éparpillement : leurs réactions vivent à part
    // (dessinerReactionsStory).
    story: {
      etats: function(){ return {}; },
      compte: function(){ return null; }
    }
  };
  function sorteDe(el){ return SORTES[(el && el.dataset.sorte) || 'billet']; }

  function paintLike(el, cle){
    const s = sorteDe(el);
    const info = s.etats()[cle] || { count: 0, mine: null, parType: {} };
    // Le bouton dit ce qu'on a choisi ; le nombre vit à côté, et disparaît
    // quand il n'y a rien à compter.
    const r = info.mine ? reactionDe(info.mine) : null;
    // Sous un billet, le logo (ou le visage choisi) sans le mot ; sous un
    // commentaire, qui n'a pas de logo, le mot reste.
    el.innerHTML = (r && r.id !== 'like')
      ? '<span class="fb-reaction-emoji">' + visage(r) + '</span>' + (s.pouce ? '' : '<span>' + r.nom + '</span>')
      : (s.pouce ? logoAvec(POUCE_LOGO, r ? 'aime' : '') : '<span>J\'aime</span>');
    if(s.pouce){
      const mot = r ? r.nom : 'J\'aime';
      el.title = mot;
      el.setAttribute('aria-label', mot);
    }
    el.classList.toggle('liked', !!r);
    el.style.color = r ? r.couleur : '';

    const compte = s.compte(el);
    if(compte){
      compte.style.display = info.count ? (s.avecQui ? 'flex' : 'inline-flex') : 'none';
      // Chaque réaction avec son propre nombre — 👍 3 ❤️ 2 😆 1 —, la sienne
      // d'abord : on la voit posée là, à peine choisie.
      const parType = Object.assign({}, info.parType || {});
      if(!Object.keys(parType).some(function(t){ return parType[t] > 0; }) && info.count) parType.like = info.count;
      const types = Object.keys(parType).filter(function(t){ return parType[t] > 0; })
        .sort(function(a, b){
          if(a === info.mine) return -1;
          if(b === info.mine) return 1;
          return parType[b] - parType[a];
        });
      let html = '<span class="fb-reaction-pile">' + types.map(function(t){
          return '<span class="fb-reaction-compte' + (t === info.mine ? ' mienne' : '') + '" title="' +
            reactionDe(t).nom + '">' + bulle(t) + '<b>' + parType[t] + '</b></span>';
        }).join('') + '</span>';
      // Le total ne dit rien de plus qu'une pastille seule : « 👍 1 1 ».
      // Il reste quand on est du nombre, ou qu'il additionne plusieurs visages.
      if(s.avecQui && (info.mine || types.length > 1)){
        const qui = info.mine
          ? (info.count === 1 ? 'Ianao' : 'Ianao sy ' + (info.count - 1) + ' hafa')
          : info.count;
        html += '<span class="fb-reaction-qui">' + escapeHtml(String(qui)) + '</span>';
      }
      compte.innerHTML = html;
    }
  }

  // Le menu des réactions : un seul pour toute la page, posé au-dessus du
  // bouton qu'on touche ou qu'on survole.
  let menuReactions = null, menuPour = null, minuteurMontrer = null, minuteurCacher = null;
  function cacherReactions(){
    clearTimeout(minuteurMontrer);
    if(menuReactions) menuReactions.hidden = true;
    menuPour = null;
  }
  function montrerReactions(el, cle){
    if(sansReactions && sorteDe(el) === SORTES.billet) return;
    if(!menuReactions){
      menuReactions = document.createElement('div');
      menuReactions.className = 'fb-reactions-choix';
      menuReactions.setAttribute('role', 'menu');
      REACTIONS.forEach(function(r){
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.reaction = r.id;
        b.title = r.nom;
        b.setAttribute('aria-label', r.nom);
        b.innerHTML = visage(r);
        // Le visage animé part dès qu'on vise celui-ci : quand le doigt se
        // lève, il est souvent déjà là pour s'éparpiller.
        ['pointerenter', 'pointerdown'].forEach(function(t){
          b.addEventListener(t, function(){
            if(b.dataset.precharge || !CODES_ANIMES[r.id]) return;
            b.dataset.precharge = '1';
            const i = new Image(); i.src = EMOJI_ANIME + CODES_ANIMES[r.id] + '/512.webp';
          });
        });
        b.addEventListener('click', function(e){
          e.stopPropagation();
          const cible = menuPour;
          cacherReactions();
          if(!cible) return;
          // Celle qu'on avait déjà : la toucher encore la retire.
          const info = sorteDe(cible.el).etats()[cible.cle];
          choisirReaction(cible.el, cible.cle, info && info.mine === r.id ? null : r.id);
        });
        menuReactions.appendChild(b);
      });
      menuReactions.addEventListener('mouseenter', function(){ clearTimeout(minuteurCacher); });
      menuReactions.addEventListener('mouseleave', function(){ minuteurCacher = setTimeout(cacherReactions, 300); });
      document.addEventListener('click', function(e){
        if(menuReactions && !menuReactions.hidden && !menuReactions.contains(e.target)) cacherReactions();
      });
      // Se referme quand le billet bouge sous lui (la page ou la fenêtre qui
      // défile), et non au moindre défilement : la rangée des stories et
      // les images des liens glissent d'elles-mêmes, et le menu se
      // refermait à peine ouvert.
      window.addEventListener('scroll', function(e){
        if(!menuPour) return;
        const t = e.target;
        if(t === document || t === document.documentElement || t === document.body ||
          (t && t.contains && t.contains(menuPour.el))) cacherReactions();
      }, { passive: true, capture: true });
      document.body.appendChild(menuReactions);
    }
    menuPour = { el: el, cle: cle };
    const info = sorteDe(el).etats()[cle];
    const mienne = info && info.mine;
    [].forEach.call(menuReactions.children, function(b){
      b.classList.toggle('choisi', b.dataset.reaction === mienne);
    });
    menuReactions.hidden = false;
    // Au-dessus du bouton, sans sortir de l'écran.
    const r = el.getBoundingClientRect();
    const l = menuReactions.offsetWidth, h = menuReactions.offsetHeight;
    const x = Math.max(8, Math.min(r.left - 8, window.innerWidth - l - 8));
    const y = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
    menuReactions.style.left = Math.round(x) + 'px';
    menuReactions.style.top = Math.round(y) + 'px';
  }

  function setupLike(el, cle){
    paintLike(el, cle);
    // Un appui, et les réactions paraissent aussitôt — ni survol à attendre,
    // ni doigt à laisser appuyé. Sans menu (colonne absente), le pouce seul.
    el.addEventListener('click', function(e){
      e.stopPropagation();
      if(sansReactions && sorteDe(el) === SORTES.billet){ toggleLike(el, cle); return; }
      // Toujours ouvrir, jamais refermer : le survol vient souvent de l'ouvrir
      // juste avant le clic. On le referme en touchant ailleurs.
      clearTimeout(minuteurCacher);
      montrerReactions(el, cle);
    });
    // Ordinateur : le survol les montre aussi, sans attendre.
    el.addEventListener('mouseenter', function(){
      clearTimeout(minuteurCacher);
      clearTimeout(minuteurMontrer);
      minuteurMontrer = setTimeout(function(){ montrerReactions(el, cle); }, 120);
    });
    el.addEventListener('mouseleave', function(){
      clearTimeout(minuteurMontrer);
      minuteurCacher = setTimeout(cacherReactions, 300);
    });
  }

  // Les visages sont chargés dès que le fil paraît : au premier appui sur
  // « J'aime », le menu doit s'ouvrir plein, et non se remplir sous les yeux.
  let visagesCharges = false;
  function chargerLesVisages(){
    if(visagesCharges) return;
    visagesCharges = true;
    REACTIONS.forEach(function(r){ const i = new Image(); i.src = EMOJI_3D + r.image; });
  }

  // Des lignes du serveur à l'état de chaque billet ou commentaire.
  function compterLesReactions(rows, colonne){
    const moi = myLikeEmail();
    const etats = {};
    rows.forEach(function(r){
      const info = etats[r[colonne]] || (etats[r[colonne]] = { count: 0, mine: null, parType: {} });
      const type = reactionDe(r.reaction || 'like').id;
      info.count++;
      info.parType[type] = (info.parType[type] || 0) + 1;
      if(moi && (r.author_email || '').toLowerCase() === moi) info.mine = type;
    });
    return etats;
  }

  function loadLikes(ids){
    if(!ids.length || !window.__sb) return;
    chargerLesVisages();
    function lire(avecReaction){
      return window.__sb.from('client_news_likes')
        .select('news_id,author_email' + (avecReaction ? ',reaction' : ''))
        .in('news_id', ids);
    }
    lire(true)
      .then(function(res){
        if(res && res.error){ sansReactions = true; return lire(false); }
        sansReactions = false;
        return res;
      })
      .then(function(res){
        likeState = compterLesReactions((res && res.data) || [], 'news_id');
        document.querySelectorAll('#communityNewsList [data-like]').forEach(function(el){
          const post = el.closest('.fb-post');
          if(post && post.dataset.newsId) paintLike(el, post.dataset.newsId);
        });
      }, function(){});
  }

  // Les réactions des commentaires à l'écran, en une lecture.
  //
  // L'auteur d'un commentaire voit arriver celles des autres : la réaction
  // éclate sur son écran — la pluie sur toute la page — et se pose, comptée,
  // sous son commentaire. On compare donc chaque lecture à la précédente.
  // La toute première ne fait que prendre la mesure : ce qui était déjà là
  // n'arrive pas.
  let reactionsCommentairesLues = false;
  function chargerReactionsCommentaires(ids){
    if(!ids || !ids.length || !window.__sb) return;
    const moi = myLikeEmail();
    const lesReactions = window.__sb.from('client_news_comment_reactions')
      .select('comment_id,author_email,reaction')
      .in('comment_id', ids);
    // Lesquels de ces commentaires sont les miens : on ne demande que leurs
    // identifiants, pas les adresses des autres.
    const lesMiens = moi
      // ilike pour la casse ; « _ » et « % » d'une adresse échappés, sinon
      // ils joueraient les jokers.
      ? window.__sb.from('client_news_comments').select('id').in('id', ids)
          .ilike('author_email', moi.replace(/[\\%_]/g, '\\$&'))
      : Promise.resolve({ data: [] });
    Promise.all([lesReactions, lesMiens]).then(function(res){
      const r = res[0], m = res[1];
      if(r && r.error) return;
      const avant = reactionsCommentaires;
      const premiere = !reactionsCommentairesLues;
      reactionsCommentaires = compterLesReactions((r && r.data) || [], 'comment_id');
      reactionsCommentairesLues = true;
      document.querySelectorAll('#communityNewsList [data-sorte="commentaire"]').forEach(function(el){
        const ligne = el.closest('.fb-comment');
        if(ligne && ligne.dataset.commentId) paintLike(el, ligne.dataset.commentId);
      });
      if(!m || m.error) return;
      // Les siens reçoivent de quoi les effacer — et eux seuls.
      ((m && m.data) || []).forEach(function(c){
        const ligne = document.querySelector('#communityNewsList .fb-comment[data-comment-id="' + c.id + '"]');
        if(ligne){ ajouterOvay(ligne, c.id); ajouterFafana(ligne, c.id); }
      });
      if(premiere) return;
      ((m && m.data) || []).forEach(function(c){
        const arrivee = reactionArrivee(avant[c.id], reactionsCommentaires[c.id]);
        if(!arrivee) return;
        const bouton = document.querySelector('#communityNewsList .fb-comment[data-comment-id="' + c.id + '"] [data-sorte="commentaire"]');
        if(bouton) eclaterReaction(bouton, arrivee);
      });
    }, function(){});
  }
  // « Ovay » sous son propre commentaire : le texte devient un champ, on le
  // corrige, et « Tehirizo » l'envoie. Le serveur ne laisse changer que le
  // texte, et que le sien (supabase-commentaires-ovay.sql).
  function ajouterOvay(ligne, id){
    const rang = ligne.querySelector('.fb-comment-reactions');
    if(!rang || rang.querySelector('.fb-comment-ovay')) return;
    const b = document.createElement('span');
    b.className = 'fb-comment-ovay';
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.innerHTML = LOGO_OVAY;
    b.setAttribute('aria-label', 'Ovay');
    b.title = 'Ovay';
    b.addEventListener('click', function(e){
      e.stopPropagation();
      const texte = ligne.querySelector('.fb-comment-texte');
      if(!texte || ligne.querySelector('.fb-comment-edition')) return;
      const avant = texte.textContent;
      // La relecture régulière redessinerait la liste sous nos doigts : la
      // ligne est marquée, et la boîte attend qu'on ait fini.
      ligne.dataset.edition = '1';
      const zone = document.createElement('div');
      zone.className = 'fb-comment-edition';
      zone.innerHTML =
        '<textarea rows="2"></textarea>' +
        '<div class="fb-comment-edition-btns">' +
          '<button type="button" class="btn" data-ovay-aoka>Aoka</button>' +
          '<button type="button" class="btn btn-primary" data-ovay-tehirizo>Tehirizo</button>' +
        '</div>';
      const champ = zone.querySelector('textarea');
      champ.value = avant;
      texte.hidden = true;
      texte.after(zone);
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
      function fermer(){
        zone.remove();
        texte.hidden = false;
        delete ligne.dataset.edition;
      }
      zone.addEventListener('click', function(ev){ ev.stopPropagation(); });
      zone.querySelector('[data-ovay-aoka]').addEventListener('click', fermer);
      champ.addEventListener('keydown', function(ev){
        if(ev.key === 'Escape'){ ev.preventDefault(); fermer(); }
        if(ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); tehirizo.click(); }
      });
      const tehirizo = zone.querySelector('[data-ovay-tehirizo]');
      tehirizo.addEventListener('click', function(){
        const nouveau = champ.value.trim();
        if(!nouveau){ direPresDuBouton(tehirizo, 'Tsy azo atao foana ny hevitra. Raha tsy ilainao intsony, fafao.'); return; }
        if(nouveau === avant.trim()){ fermer(); return; }
        tehirizo.disabled = true;
        window.__sb.from('client_news_comments').update({ message: nouveau }).eq('id', id).select('id').then(function(res){
          tehirizo.disabled = false;
          // Rien de changé, sans erreur : la règle du serveur a dit non.
          if(res && !res.error && res.data && res.data.length){
            texte.textContent = nouveau;
            fermer();
            chargerLesCommentaires(true);
            return;
          }
          direPresDuBouton(tehirizo, res && res.error ? PAS_DE_SESSION.replace('manome fihetseham-po', 'manova ny hevitrao') : 'Ny tompon\'ny hevitra ihany no afaka manova azy.');
        }, function(){
          tehirizo.disabled = false;
          direPresDuBouton(tehirizo, 'Tsy voaova : jereo ny fifandraisanao, dia andramo indray.');
        });
      });
    });
    rang.appendChild(b);
  }

  // « Fafana » sous son propre commentaire. Le serveur le vérifie de son côté
  // (supabase-commentaires-fafana.sql) : ce bouton n'est qu'une commodité, pas
  // la garde.
  function ajouterFafana(ligne, id){
    const rang = ligne.querySelector('.fb-comment-reactions');
    if(!rang || rang.querySelector('.fb-comment-fafana')) return;
    const b = document.createElement('span');
    b.className = 'fb-comment-fafana';
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.innerHTML = LOGO_FAFANA;
    b.title = 'Fafana';
    b.setAttribute('aria-label', 'Fafana');
    b.addEventListener('click', function(e){
      e.stopPropagation();
      if(!confirm('Hofafana ve ity hevitrao ity ?')) return;
      const auth = window.__sb && window.__sb.auth;
      const faire = function(){
        b.style.opacity = '0.5';
        window.__sb.from('client_news_comments').delete().eq('id', id).select('id').then(function(res){
          // Rien d'effacé, sans erreur : la règle du serveur a dit non.
          if(res && !res.error && res.data && res.data.length){
            ligne.remove();
            chargerLesCommentaires(true);
            return;
          }
          b.style.opacity = '';
          direPresDuBouton(b, res && res.error ? PAS_DE_SESSION : 'Ny tompon\'ny hevitra ihany no afaka mamafa azy.');
        }, function(){
          b.style.opacity = '';
          direPresDuBouton(b, 'Tsy voafafa : jereo ny fifandraisanao, dia andramo indray.');
        });
      };
      if(!auth || !auth.getSession){ faire(); return; }
      auth.getSession().then(function(r){
        if(r && r.data && r.data.session) faire();
        else direPresDuBouton(b, PAS_DE_SESSION.replace('manome fihetseham-po', 'mamafa ny hevitrao'));
      }, function(){ faire(); });
    });
    rang.appendChild(b);
  }

  // La réaction qu'un AUTRE vient de donner, s'il y en a une : la sienne
  // propre ne compte pas, on vient de la voir éclater en la choisissant.
  function reactionArrivee(avant, apres){
    if(!apres) return null;
    avant = avant || { parType: {}, mine: null };
    function desAutres(info, t){ return ((info.parType || {})[t] || 0) - (info.mine === t ? 1 : 0); }
    for(let i = 0; i < REACTIONS.length; i++){
      const t = REACTIONS[i].id;
      if(desAutres(apres, t) > desAutres(avant, t)) return t;
    }
    return null;
  }
  // Tous les commentaires à l'écran, pour relire leurs réactions d'un coup.
  function commentairesAffiches(){
    return [].map.call(document.querySelectorAll('#communityNewsList .fb-comment[data-comment-id]'), function(l){
      return l.dataset.commentId;
    });
  }

  // La réaction choisie éclate : elle grossit au-dessus du bouton, monte
  // jusqu'au compteur, et des éclats de sa couleur s'éparpillent autour.
  function eclaterReaction(el, id){
    const r = reactionDe(id);
    const depart = el.getBoundingClientRect();
    const compte = sorteDe(el).compte(el);
    const arrivee = compte && compte.style.display !== 'none' ? compte.getBoundingClientRect() : null;
    const x = depart.left + 14, y = depart.top + depart.height / 2;

    const vole = document.createElement('div');
    vole.className = 'fb-reaction-vole';
    vole.innerHTML = visageAnime(r);
    vole.style.left = x + 'px';
    vole.style.top = y + 'px';
    vole.style.setProperty('--dx', (arrivee ? arrivee.left + 9 - x : 0) + 'px');
    vole.style.setProperty('--dy', (arrivee ? arrivee.top + arrivee.height / 2 - y : -70) + 'px');
    document.body.appendChild(vole);
    setTimeout(function(){ vole.remove(); }, 900);

    for(let i = 0; i < 10; i++){
      const eclat = document.createElement('span');
      eclat.className = 'fb-reaction-eclat';
      const angle = (i / 10) * Math.PI * 2;
      const loin = 26 + Math.random() * 16;
      eclat.style.left = x + 'px';
      eclat.style.top = y + 'px';
      eclat.style.background = r.couleur;
      eclat.style.setProperty('--ex', Math.round(Math.cos(angle) * loin) + 'px');
      eclat.style.setProperty('--ey', Math.round(Math.sin(angle) * loin) + 'px');
      document.body.appendChild(eclat);
      setTimeout(function(){ eclat.remove(); }, 650);
    }
    el.classList.remove('fb-like-rebond');
    void el.offsetWidth;
    el.classList.add('fb-like-rebond');

    // Puis toute la page en profite : une pluie du même visage qui monte du
    // bas de l'écran, d'un bord à l'autre.
    const pluie = document.createElement('div');
    pluie.className = 'fb-reaction-pluie';
    for(let j = 0; j < 22; j++){
      const g = document.createElement('span');
      g.innerHTML = visageAnime(r);
      g.style.left = Math.round(Math.random() * 96) + '%';
      g.style.fontSize = (1.2 + Math.random() * 1.6).toFixed(2) + 'rem';
      g.style.animationDelay = Math.round(Math.random() * 700) + 'ms';
      g.style.animationDuration = (1.6 + Math.random() * 1.2).toFixed(2) + 's';
      g.style.setProperty('--derive', Math.round(Math.random() * 80 - 40) + 'px');
      pluie.appendChild(g);
    }
    document.body.appendChild(pluie);
    setTimeout(function(){ pluie.remove(); }, 3600);

    // Et elle reste là, sur le compteur : elle y grossit un instant pour
    // qu'on la voie arriver.
    setTimeout(function(){
      const pile = compte && compte.querySelector('.fb-reaction-compte');
      if(!pile) return;
      pile.classList.remove('fb-reaction-posee');
      void pile.offsetWidth;
      pile.classList.add('fb-reaction-posee');
    }, 700);
  }

  // Le pouce seul : il met « J'aime », ou retire la réaction quelle qu'elle
  // soit — comme sur Facebook.
  function toggleLike(el, cle){
    const info = sorteDe(el).etats()[cle];
    choisirReaction(el, cle, info && info.mine ? null : 'like');
  }

  // Un mot posé au-dessus du bouton, qui s'en va seul. Une alerte se ferme
  // d'un réflexe sans être lue ; ceci reste là où l'on regarde.
  function direPresDuBouton(el, texte){
    const vieux = document.querySelector('.fb-reaction-avis');
    if(vieux) vieux.remove();
    const avis = document.createElement('div');
    avis.className = 'fb-reaction-avis';
    avis.setAttribute('role', 'status');
    avis.textContent = texte;
    document.body.appendChild(avis);
    const r = el.getBoundingClientRect();
    const l = avis.offsetWidth, h = avis.offsetHeight;
    avis.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - l - 8))) + 'px';
    avis.style.top = Math.round(r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10) + 'px';
    setTimeout(function(){ avis.remove(); }, 5000);
  }
  const PAS_DE_SESSION = 'Midira amin\'ny tenimiafinao aloha vao afaka manome fihetseham-po : ' +
    'ny fidirana tsy misy tenimiafina (na Essai libre) dia tsy ekena hanoratra ato.';

  // Donner une réaction, en changer, ou la retirer (null).
  //
  // Le serveur n'accepte que celui qui est vraiment connecté — une session
  // Supabase, ouverte avec le mot de passe. On entre aussi dans l'application
  // sans elle (profil gardé sur l'appareil, essai libre) : la réaction partait
  // alors, se faisait refuser (401), et le compte qu'on venait de voir
  // s'effaçait sans un mot. On vérifie donc d'abord, et on le dit.
  function choisirReaction(el, cle, id){
    const moi = myLikeEmail();
    if(!moi || !window.__sb){ direPresDuBouton(el, PAS_DE_SESSION); return; }
    const auth = window.__sb.auth;
    if(!auth || !auth.getSession){ poserReaction(el, cle, id, moi); return; }
    auth.getSession().then(function(r){
      const session = r && r.data && r.data.session;
      const email = session && session.user && (session.user.email || '').trim().toLowerCase();
      if(!session || email !== moi){ direPresDuBouton(el, PAS_DE_SESSION); return; }
      poserReaction(el, cle, id, moi);
    }, function(){ direPresDuBouton(el, PAS_DE_SESSION); });
  }

  function poserReaction(el, cle, id, moi){
    const s = sorteDe(el);
    const etats = s.etats();
    const info = etats[cle] || (etats[cle] = { count: 0, mine: null, parType: {} });
    if(info.mine === id) return;
    // On peint tout de suite, puis on corrige si le serveur refuse : un clic
    // qui n'a l'air de rien faire pendant une seconde donne envie de cliquer
    // encore, et de compter deux fois.
    const avant = { count: info.count, mine: info.mine, parType: Object.assign({}, info.parType) };
    if(info.mine) info.parType[info.mine] = Math.max(0, (info.parType[info.mine] || 0) - 1);
    if(id) info.parType[id] = (info.parType[id] || 0) + 1;
    if(!avant.mine && id) info.count++;
    if(avant.mine && !id) info.count = Math.max(0, info.count - 1);
    info.mine = id;
    paintLike(el, cle);
    if(id) eclaterReaction(el, id);

    const table = window.__sb.from(s.table);
    let action;
    if(!id){
      action = table.delete().eq(s.colonne, cle).eq('author_email', moi);
    } else if(avant.mine){
      action = table.update({ reaction: id }).eq(s.colonne, cle).eq('author_email', moi);
    } else {
      const ligne = { author_email: moi, author_name: (currentUser && currentUser.name) || 'Client' };
      ligne[s.colonne] = cle;
      if(!(sansReactions && s === SORTES.billet)) ligne.reaction = id;
      action = table.insert(ligne);
    }

    function annuler(err){
      s.etats()[cle] = avant;
      paintLike(el, cle);
      // Refusée : on dit pourquoi, au lieu de laisser le compte s'effacer.
      const brut = (err && (err.message || err.code)) || '';
      direPresDuBouton(el, /JWT|auth|permission|policy|row-level|401|42501/i.test(brut)
        ? PAS_DE_SESSION
        : 'Tsy voaray ny fihetseham-po : jereo ny fifandraisanao, dia andramo indray.');
    }
    action.then(function(res){ if(res && res.error) annuler(res.error); }, annuler);
  }

  // ---------------- LES COMMENTAIRES, OUVERTS D'OFFICE ----------------
  //
  // Ils attendaient derrière « Commenter ». Un billet en portait trois, et
  // rien ne le disait : la conversation existait pour ceux qui avaient pensé
  // à toucher le mot. Les autres passaient devant un fil qui paraissait muet.
  // Ils sont donc à l'écran, sous leur billet, comme la réponse qu'ils sont.
  //
  // Ce qui les gardait repliés, c'était le coût : trente billets qui iraient
  // chacun chercher leurs lignes, puis les relire toutes les quatre secondes,
  // feraient trente requêtes là où une suffit — et trente canaux temps réel
  // là où un seul porte la table entière. On ne replie donc pas les boîtes :
  // on les sert ensemble. Une requête pour tout le fil, un minuteur, un
  // canal, et chaque boîte reçoit sa part.
  //
  // Sans temps réel, c'est la relecture qui porte tout : quatre secondes.
  // Avec lui, elle n'est plus qu'un filet — le canal fait le travail, et elle
  // rattrape ce qu'il aurait laissé passer.
  const COMMENTAIRES_RAFRAICHI_MS = 4000;
  const COMMENTAIRES_FILET_MS = 25000;
  // Au-delà, ce n'est plus un fil qu'on lit mais une page qu'on fait ramer.
  const COMMENTAIRES_MAX = 1000;

  let boitesCommentaires = {};
  let minuteurCommentaires = null;
  let canalCommentaires = null;
  let realtimeCommentairesProuve = false;

  function oublierLesCommentaires(){
    boitesCommentaires = {};
    if(minuteurCommentaires){ clearInterval(minuteurCommentaires); minuteurCommentaires = null; }
    if(canalCommentaires){
      try { window.__sb.removeChannel(canalCommentaires); } catch(e){}
      canalCommentaires = null;
    }
    realtimeCommentairesProuve = false;
  }

  // « discret » : c'est la relecture automatique qui appelle. Une panne de
  // réseau passagère ne doit pas effacer ce qui est lisible à l'écran.
  function chargerLesCommentaires(discret){
    const ids = Object.keys(boitesCommentaires);
    if(!ids.length || !window.__sb) return;
    window.__sb.from('client_news_comments')
      .select('id,news_id,author_name,message,created_at')
      .in('news_id', ids)
      .order('created_at', { ascending: true })
      .limit(COMMENTAIRES_MAX)
      .then(function(res){
        if(res && res.error){
          if(!discret) ids.forEach(function(id){ boitesCommentaires[id].poser(null, res.error); });
          return;
        }
        const parBillet = {};
        ((res && res.data) || []).forEach(function(c){
          (parBillet[c.news_id] || (parBillet[c.news_id] = [])).push(c);
        });
        ids.forEach(function(id){
          if(boitesCommentaires[id]) boitesCommentaires[id].poser(parBillet[id] || []);
        });
        // Leurs réactions, en une lecture pour tout le fil.
        chargerReactionsCommentaires(((res && res.data) || []).map(function(c){ return c.id; }).filter(Boolean));
      }, function(err){
        if(!discret) ids.forEach(function(id){ boitesCommentaires[id].poser(null, err); });
      });
  }

  function poserLeMinuteurDesCommentaires(periode){
    if(minuteurCommentaires) clearInterval(minuteurCommentaires);
    minuteurCommentaires = setInterval(function(){
      // Plus une seule boîte à l'écran : le fil a été redessiné, ou l'on est
      // parti ailleurs. Sans ce garde-fou, chaque affichage laisserait
      // derrière lui une interrogation régulière pour personne.
      const vivante = Object.keys(boitesCommentaires).some(function(id){
        return boitesCommentaires[id].box.isConnected;
      });
      if(!vivante){ oublierLesCommentaires(); return; }
      chargerLesCommentaires(true);
    }, periode);
  }

  // Le temps réel : le serveur prévient dès que la ligne entre, et le
  // commentaire paraît à la seconde.
  //
  // La relecture régulière ne disparaît pas pour autant — elle ralentit, mais
  // seulement quand le canal a FAIT SES PREUVES. Être abonné ne prouve rien :
  // le canal s'ouvre très bien sur une table absente de la publication, dit
  // « SUBSCRIBED », et ne délivre jamais rien. Ralentir sur cette promesse-là
  // rendrait le fil plus lent qu'avant. C'est donc le premier message reçu
  // qui l'autorise.
  function ecouterLesCommentaires(){
    if(canalCommentaires || !window.__sb || !window.__sb.channel) return;
    try {
      canalCommentaires = window.__sb
        .channel('commentaires-du-fil')
        .on('postgres_changes', {
          // Ajouts et effacements : un commentaire retiré par son auteur
          // disparaît aussi des autres écrans.
          event: '*', schema: 'public', table: 'client_news_comments'
        }, function(){
          if(!realtimeCommentairesProuve){
            realtimeCommentairesProuve = true;
            poserLeMinuteurDesCommentaires(COMMENTAIRES_FILET_MS);
          }
          chargerLesCommentaires(true);
        })
        // Une réaction donnée, changée ou retirée sous un commentaire : on
        // relit les réactions seules, sans attendre la relecture suivante.
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'client_news_comment_reactions'
        }, function(){
          chargerReactionsCommentaires(commentairesAffiches());
        })
        .subscribe(function(){});
    } catch(e){ canalCommentaires = null; }
  }

  // Une fois toutes les boîtes en place : une lecture, un minuteur, un canal.
  function veillerSurLesCommentaires(){
    if(!Object.keys(boitesCommentaires).length) return;
    chargerLesCommentaires(false);
    poserLeMinuteurDesCommentaires(COMMENTAIRES_RAFRAICHI_MS);
    ecouterLesCommentaires();
  }

  function openComments(newsId, box, avecFocus){
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
      // Une flèche d'envoi plutôt que le mot : elle se reconnaît d'un coup
      // d'œil, comme dans toutes les messageries. Le mot reste pour qui lit
      // la page à voix haute.
      '<button type="button" class="btn btn-sm fb-comment-send" title="Alefa" aria-label="Alefa">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>' +
      '</button>';

    // Ce qui est déjà à l'écran, en une ligne. Redessiner à l'identique
    // toutes les quatre secondes ferait sauter la sélection de qui relit, et
    // clignoter la liste pour rien.
    let empreinte = null;

    function signature(rows){
      return rows.map(function(c){
        return (c.id || '') + '|' + (c.created_at || '') + '|' + (c.author_name || '') + '|' + (c.message || '');
      }).join('\n');
    }

    function dessiner(rows){
      liste.innerHTML = '';
      // Ouvertes d'office, les boîtes vides diraient trente fois la même
      // chose sous trente billets. Le champ, juste en dessous, invite mieux
      // que la phrase qui l'annonçait.
      if(!rows.length) return;
      rows.forEach(function(c){
        const ligne = document.createElement('div');
        ligne.className = 'fb-comment';
        ligne.innerHTML =
          '<strong>' + escapeHtml(c.author_name || 'Client') + '</strong> ' +
          '<span class="fb-comment-texte">' + escapeHtml(c.message || '') + '</span>' +
          '<span class="fb-comment-date">' +
            (c.created_at ? new Date(c.created_at).toLocaleString('fr-FR') : '') +
          '</span>';
        // Les réactions, comme sous les billets : « J'aime » ouvre les
        // visages, et chacun est compté à côté.
        if(c.id){
          ligne.dataset.commentId = c.id;
          const rang = document.createElement('div');
          rang.className = 'fb-comment-reactions';
          rang.innerHTML = '<span class="fb-comment-like" data-sorte="commentaire" role="button" tabindex="0"></span>' +
            '<span class="fb-comment-compte" data-comment-count style="display:none;"></span>';
          ligne.appendChild(rang);
          setupLike(rang.querySelector('[data-sorte]'), c.id);
        }
        liste.appendChild(ligne);
      });
    }

    // La part de cette boîte dans la lecture commune. Elle ne demande plus
    // rien d'elle-même : on la sert.
    function poser(rows, err){
      if(err){
        liste.innerHTML = '<div class="fb-comment-empty">' + escapeHtml(feedErrorText(err)) + '</div>';
        return;
      }
      const sig = signature(rows);
      if(sig === empreinte) return;
      // Un commentaire en cours de modification : on ne redessine pas sous
      // les doigts ; la prochaine lecture, une fois fini, s'en chargera.
      if(liste.querySelector('[data-edition]')) return;
      empreinte = sig;
      dessiner(rows);
    }

    box.innerHTML = '';
    liste.innerHTML = '<div class="fb-comment-empty">Mamaky…</div>';
    box.appendChild(liste);
    box.appendChild(saisie);
    boitesCommentaires[newsId] = { poser: poser, box: box };

    const champ = saisie.querySelector('.fb-comment-input');
    const bouton = saisie.querySelector('.fb-comment-send');

    function envoyer(){
      const texte = champ.value.trim();
      if(!texte) return;
      bouton.disabled = true;

      // Le sien s'affiche tout de suite, en pâle. Attendre l'aller-retour
      // pour voir ce qu'on vient d'écrire donne l'impression que rien n'est
      // parti — et l'on écrit deux fois.
      const vide = liste.querySelector('.fb-comment-empty');
      if(vide) vide.remove();
      const provisoire = document.createElement('div');
      provisoire.className = 'fb-comment';
      provisoire.style.opacity = '0.55';
      provisoire.innerHTML =
        '<strong>' + escapeHtml((currentUser && currentUser.name) || 'Client') + '</strong> ' +
        escapeHtml(texte) +
        '<span class="fb-comment-date">Mandefa…</span>';
      liste.appendChild(provisoire);
      champ.value = '';

      window.__sb.from('client_news_comments').insert({
        news_id: newsId,
        author_name: (currentUser && currentUser.name) || 'Client',
        author_email: (currentUser && currentUser.email) || null,
        message: texte
      }).then(function(res){
        bouton.disabled = false;
        if(res && res.error){
          // Rendu à son auteur : le texte revient dans le champ plutôt que
          // de disparaître avec le message d'erreur.
          provisoire.remove();
          champ.value = texte;
          montrerErreur(res.error);
          return;
        }
        // La relecture remplace le pâle par le vrai, daté par le serveur.
        empreinte = null;
        chargerLesCommentaires(true);
      }, function(err){
        bouton.disabled = false;
        provisoire.remove();
        champ.value = texte;
        montrerErreur(err);
      });
    }

    // L'erreur se pose sous le champ, là où le regard est déjà : une fenêtre
    // d'alerte se ferme d'un réflexe, sans être lue.
    function montrerErreur(err){
      let ligne = saisie.nextElementSibling;
      if(!ligne || !ligne.classList.contains('fb-comment-error')){
        ligne = document.createElement('div');
        ligne.className = 'fb-comment-error';
        saisie.parentNode.appendChild(ligne);
      }
      ligne.textContent = feedErrorText(err);
    }

    bouton.addEventListener('click', envoyer);
    champ.addEventListener('keydown', function(e){ if(e.key === 'Enter') envoyer(); });
    // Les boîtes s'ouvrent maintenant toutes seules, et trente champs qui se
    // disputeraient le curseur emporteraient la page avec eux. Seul celui
    // qu'on a demandé — le mot « Commenter » — prend la main.
    if(avecFocus) champ.focus();
  }

  // ---------------- LE DIRECT DANS LE FIL ----------------
  //
  // Le billet d'un direct porte l'adresse de celui qui diffuse, au bout de
  // son lien : « …?live=<email>&name=<nom> ». Ce lien ouvrait l'application
  // dans un second onglet, qui se chargeait en entier pour aboutir au même
  // endroit — alors qu'on y était déjà. On entre maintenant d'ici, d'un
  // bouton : c'est la même fonction que le bandeau rouge appelle (joinLive).
  function lireLeLienDuLive(lien){
    if(!lien) return null;
    try {
      const u = new URL(lien, window.location.href);
      const email = u.searchParams.get('live');
      if(!email) return null;
      return { email: email.trim().toLowerCase(), name: u.searchParams.get('name') || '' };
    } catch(e){ return null; }
  }

  // Celui qui diffusait est-il encore là ? La présence le dit tout de suite ;
  // tant qu'elle n'a rien chargé — et elle porte toujours au moins nous-même
  // — on s'en remet à l'heure du billet.
  function leLiveEstEnCours(email){
    if(typeof presenceState !== 'object' || !presenceState) return true;
    if(!Object.keys(presenceState).length) return true;
    const p = presenceState[email];
    return !!(p && p.live);
  }

  // ---------------- L'APERÇU D'UN LIEN PARTAGÉ ----------------
  //
  // Un billet qui ne porte qu'une adresse ne dit rien de ce qu'il y a au bout.
  // « https://www.alibaba.com/ » — et puis ? Personne ne touche une adresse
  // nue ; on touche une image. C'est la fonction « apercu » qui va la
  // chercher : le navigateur ne peut pas lire une page d'un autre domaine
  // (CORS), le serveur le peut.
  //
  // Ce qu'on rapporte, c'est ce que le site publie pour être partagé — une
  // image, un titre, une phrase — et non sa liste de marchandises : les
  // grands sites ne la donnent pas, la construisent dans le navigateur de
  // leur visiteur, et refusent qui n'est pas une personne.
  //
  // Un aperçu ne change pas d'une heure à l'autre : il est gardé sur
  // l'appareil une semaine. Sans cela, trente billets redemanderaient trente
  // aperçus à chaque fois que le fil se redessine — et il se redessine
  // souvent.
  // Le lien est rarement dans la case prévue pour lui : un partage venu du
  // dehors (zara-miditra.js) dépose l'adresse dans le texte, là où la
  // personne l'aurait collée elle-même. On la cherche donc dans les deux.
  function premierLien(texte){
    const m = String(texte || '').match(/https?:\/\/[^\s<>"']+/i);
    if(!m) return '';
    // Une adresse en fin de phrase emporte la ponctuation qui la suit.
    return m[0].replace(/[),.;:!?]+$/, '');
  }

  // Le nom porte le numéro de ce qu'on garde : un aperçu d'hier n'avait qu'une
  // image, et resterait seul sous le billet une semaine durant. Changer de nom
  // les reprend tous d'un coup.
  const APERCU_CLE = 'stockmanager_apercus3';
  // Un jour, et non sept : une boutique change sa vitrine tous les matins, et
  // la carte doit changer avec elle. Sept jours, c'était la vitrine de la
  // semaine dernière.
  const APERCU_DUREE = 24 * 60 * 60 * 1000;
  // Un aperçu VIDE, lui, ne se garde pas la semaine : c'est une page qui
  // s'est refusée un instant, ou la fonction qui n'était pas encore déployée.
  // Gardé sept jours, ce raté-là survivrait au remède.
  //
  // Six heures et non une : la moitié des boutiques de la liste ne donnent
  // rien et n'en donneront pas davantage demain. Les redemander à chaque
  // heure, c'est dix-sept appels pour rien, à chaque ouverture de la fenêtre.
  const APERCU_VIDE_DUREE = 6 * 60 * 60 * 1000;
  let apercusEnCours = 0;

  function lireLesApercus(){
    try { return JSON.parse(localStorage.getItem(APERCU_CLE)) || {}; }
    catch(e){ return {}; }
  }
  function garderLApercu(url, apercu){
    try {
      const tous = lireLesApercus();
      tous[url] = { apercu: apercu, le: Date.now() };
      // Le fil ne garde que sept jours : au-delà de deux cents aperçus, ce
      // sont des liens que plus personne ne verra passer.
      const cles = Object.keys(tous);
      if(cles.length > 200){
        cles.sort(function(a, b){ return (tous[a].le || 0) - (tous[b].le || 0); });
        cles.slice(0, cles.length - 200).forEach(function(k){ delete tous[k]; });
      }
      localStorage.setItem(APERCU_CLE, JSON.stringify(tous));
    } catch(e){}
  }
  function apercuGarde(url){
    const ligne = lireLesApercus()[url];
    if(!ligne) return null;
    const a = ligne.apercu || {};
    // Trois images ou moins ne tournent pas : un aperçu si maigre est
    // redemandé aussi vite qu'un vide — la page en donnera peut-être plus.
    const nb = (a.images || (a.image ? [a.image] : [])).length;
    const duree = nb > APERCU_IMAGES ? APERCU_DUREE : APERCU_VIDE_DUREE;
    if((Date.now() - (ligne.le || 0)) > duree) return null;
    return a;
  }

  // Trois images, et non une. Une seule ne dit pas grand-chose d'une boutique ;
  // trois disent ce qu'on y vend. Elles se mettent côte à côte quand il y en a
  // plusieurs, en grand quand il n'y en a qu'une. Peu nombreuses, elles
  // échangent leurs places ; nombreuses, de nouvelles prennent la relève.
  //
  // Celle qui ne s'affiche pas s'efface d'elle-même : un site peut très bien
  // refuser ses images à qui vient d'ailleurs, et un cadre gris vaut moins que
  // pas de cadre du tout.
  const APERCU_IMAGES = 3;

  // Une boutique enregistrée par son seul nom mène à la recherche de ce nom
  // (brancherLEnregistrement) : sa carte doit dire ce nom, et non « google.com ».
  function nomRecherche(url){
    try{
      const u = new URL(url);
      if(!/(^|\.)google\.[a-z.]+$/i.test(u.hostname) || u.pathname !== '/search') return '';
      return (u.searchParams.get('q') || '').trim();
    }catch(e){ return ''; }
  }

  // Une carte sans image — boutique qui n'en donne pas, ou enregistrée par son
  // seul nom et menant à une recherche — n'était qu'une ligne de texte dans un
  // cadre vide. Elle a désormais son affiche : le nom en grand sur un fond
  // dont la couleur vient du nom lui-même, toujours la même pour le même nom.
  function afficheDuNom(nom, taille){
    const texte = String(nom || '?');
    let h = 0;
    for(let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) >>> 0;
    const teinte = h % 360;
    const lettres = texte.length > 14 ? 26 : texte.length > 8 ? 34 : 44;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" ' +
        'style="width:100%; height:100%; display:block;" aria-hidden="true">' +
        '<defs><linearGradient id="g' + h + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="hsl(' + teinte + ',70%,45%)"/>' +
          '<stop offset="1" stop-color="hsl(' + ((teinte + 40) % 360) + ',75%,30%)"/>' +
        '</linearGradient></defs>' +
        '<rect width="200" height="100" fill="url(#g' + h + ')"/>' +
        '<circle cx="175" cy="15" r="40" fill="#fff" opacity="0.08"/>' +
        '<circle cx="20" cy="95" r="30" fill="#fff" opacity="0.06"/>' +
        '<text x="100" y="50" text-anchor="middle" dominant-baseline="central" fill="#fff" ' +
          'font-family="system-ui, sans-serif" font-weight="700" font-size="' + (lettres * 0.5) + '">' +
          escapeHtml(texte.slice(0, 22)) + '</text>' +
      '</svg>';
    return '<div style="' + taille + ' overflow:hidden;">' + svg + '</div>';
  }

  function dessinerLApercu(cadre, apercu){
    const url = cadre.getAttribute('data-apercu');
    // Le nom imposé l'emporte : dans la liste des boutiques, on sait comment
    // elles s'appellent, et « amazon.fr » n'apprend rien à personne.
    const site = cadre.getAttribute('data-apercu-nom') || (apercu && apercu.site) || (function(){
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e){ return url; }
    })();
    // Les vignettes de la liste des boutiques sont plus basses que celles du
    // fil : trente cartes à la hauteur d'un billet, c'est un couloir.
    const haut = Number(cadre.getAttribute('data-apercu-haut')) || 120;
    // Une page de recherche n'a d'images que celles du moteur : rien à montrer.
    const toutes = nomRecherche(url) ? [] :
      ((apercu && apercu.images) || (apercu && apercu.image ? [apercu.image] : [])).filter(Boolean);
    // Toute la réserve reste attachée au cadre : c'est elle qui tourne.
    cadre.__images = toutes;
    cadre.__tour = 0;
    // Dans le fil, une seule image, grande, qui remplit toute la carte en
    // carré ; les autres de la réserve lui succèdent à chaque tour. Trois
    // vignettes de cent vingt pixels y étaient trop petites pour voir
    // l'entana. La liste des boutiques (qui donne sa hauteur) garde les trois.
    const grand = !cadre.hasAttribute('data-apercu-haut');
    const images = toutes.slice(0, grand ? 1 : APERCU_IMAGES);
    // Dans la fenêtre des boutiques, les images sont demandées tout de suite.
    // Le chargement différé y reste muet : la fenêtre naît cachée, et le
    // navigateur ne revient pas sur sa décision quand elle paraît. Dans le
    // fil, qui se déroule normalement, il fait très bien son travail.
    const chargement = cadre.hasAttribute('data-apercu-direct') ? 'eager' : 'lazy';
    const cadreImage = 'width:100%; height:100%; object-fit:cover; display:block; ' +
      'background:var(--panel-2); transition:opacity 0.22s;';
    // Une image seule prend toute la place ; deux ou trois se mettent côte à
    // côte et échangent leurs places à chaque tour.
    const seule = grand || toutes.length === 1;
    cadre.innerHTML =
      (!images.length
        ? afficheDuNom(site, grand ? 'aspect-ratio:2 / 1;' : 'height:' + Math.round(haut * 1.8) + 'px;')
        : '') +
      (images.length
        ? (seule
          ? '<div data-rang="0" data-seule style="' + (grand ? 'aspect-ratio:1 / 1;' : 'height:' + Math.round(haut * 1.8) + 'px;') + '">' +
            '<img src="' + escapeHtml(images[0]) + '" alt="" loading="' + chargement + '" referrerpolicy="no-referrer" ' +
            'style="' + cadreImage + '"></div>'
          : '<div style="display:grid; grid-template-columns:repeat(' + images.length + ', 1fr); gap:2px;">' +
            images.map(function(src, i){
              return '<div data-rang="' + i + '" style="height:' + haut + 'px;">' +
                '<img src="' + escapeHtml(src) + '" alt="" loading="' + chargement + '" referrerpolicy="no-referrer" ' +
                'style="' + cadreImage + '"></div>';
            }).join('') +
            '</div>')
        : '') +
      // Le nom du site, et rien d'autre. Le titre et la phrase venaient du
      // site lui-même — celui d'Alibaba tient en quatre lignes et redit la
      // même chose deux fois, écrit pour les moteurs de recherche et non pour
      // qui regarde. Sous les images, c'était un mur de texte qui les
      // écrasait. Ce qu'on a besoin de savoir, c'est où mène le lien : le nom
      // suffit, et l'image dit le reste.
      '<div style="padding:0.5rem 0.7rem;">' +
        '<div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">' +
          escapeHtml(site) + '</div>' +
      '</div>';
    // L'image d'un site qui la refuse à l'affichage laisserait un cadre gris.
    // Elle s'efface, et la grille se resserre sur ce qui reste.
    cadre.querySelectorAll('img').forEach(function(img){
      // Les trois premières n'ont pas été regardées : elles arrivent telles
      // que le serveur les a rapportées. Une bannière qui se glisse là est
      // écartée dès qu'on connaît sa forme, et remplacée par la suivante.
      img.addEventListener('load', function(){
        if(formeAcceptable(img)) return;
        const boite = img.parentElement;
        if(!boite || !boite.hasAttribute('data-rang')) return;
        const rang = Number(boite.getAttribute('data-rang'));
        (cadre.__ecartes || (cadre.__ecartes = {}))[rang] = true;
        poserDansLaCase(cadre, boite, prochainRang(cadre, boite), (cadre.__images || []).length);
      });
      img.addEventListener('error', function(){
        const case_ = img.parentElement;
        // La grande place seule passe à l'image suivante ; plus rien, elle
        // s'efface.
        if(case_ && case_.hasAttribute('data-seule')){
          (cadre.__ecartes || (cadre.__ecartes = {}))[Number(case_.getAttribute('data-rang'))] = true;
          const suivant = prochainRang(cadre, case_);
          if(suivant >= 0) poserDansLaCase(cadre, case_, suivant, (cadre.__images || []).length);
          else case_.remove();
          return;
        }
        const grille = case_ && case_.parentElement;
        img.remove();
        if(case_ && case_.childElementCount === 0 && grille && grille.style.gridTemplateColumns){
          case_.remove();
          const reste = grille.childElementCount;
          if(!reste) grille.remove();
          else grille.style.gridTemplateColumns = 'repeat(' + reste + ', 1fr)';
        }
      });
    });
  }

  // ---- Les images tournent ----
  //
  // Trois places à l'écran, douze images en réserve : la carte montre ce que
  // la boutique vend, et non trois articles pour toujours les mêmes.
  //
  // Les trois changent ensemble, à chaque tour. Chaque place garde sa file,
  // avancée de trois en trois : les trois images visibles ne sont jamais la
  // même.
  const APERCU_TOUR_MS = 4500;
  let minuteurApercus = null;

  // L'adresse ne dit pas tout : bien des bannières n'annoncent pas leurs
  // dimensions, et seul le navigateur, une fois l'image chargée, sait qu'elle
  // fait quatre fois plus large que haut. Une photo d'article est à peu près
  // carrée ; le reste est de la mise en page, et n'a rien à montrer.
  // 1,8 et non 2,5 : une bande de seize sur neuf est déjà une bannière, et
  // aucune photo d'article n'a cette forme. Le carré et le quatre-tiers
  // passent, qui sont les deux formes d'une photo de marchandise.
  const APERCU_RATIO_MAX = 1.8;
  // Et une taille minimale : le point de comptage d'un pixel sur un pixel est
  // parfaitement carré, et l'icône de trente-deux pixels aussi. Ni l'un ni
  // l'autre ne montre quoi que ce soit.
  const APERCU_COTE_MIN = 120;

  function formeAcceptable(img){
    const l = img.naturalWidth, h = img.naturalHeight;
    if(!l || !h) return false;
    if(l < APERCU_COTE_MIN || h < APERCU_COTE_MIN) return false;
    return l / h <= APERCU_RATIO_MAX && h / l <= APERCU_RATIO_MAX;
  }

  // Le rang suivant pour cette place : trois de plus, en sautant ce que les
  // autres places occupent et ce qu'on a déjà écarté.
  function prochainRang(cadre, boite){
    const toutes = cadre.__images || [];
    const cases = cadre.querySelectorAll('[data-rang]');
    const ecartes = cadre.__ecartes || (cadre.__ecartes = {});
    const pris = [];
    cases.forEach(function(c){ if(c !== boite) pris.push(Number(c.getAttribute('data-rang'))); });
    let rang = Number(boite.getAttribute('data-rang'));
    for(let essai = 0; essai < toutes.length; essai++){
      rang = (rang + cases.length) % toutes.length;
      if(pris.indexOf(rang) === -1 && !ecartes[rang]) return rang;
    }
    return -1;
  }

  // Pose l'image du rang voulu dans une place, après l'avoir chargée et
  // regardée. Mal formée, elle est écartée pour de bon et l'on passe à la
  // suivante — c'est ainsi que les bannières disparaissent d'elles-mêmes.
  function poserDansLaCase(cadre, boite, rang, restants){
    const toutes = cadre.__images || [];
    const img = boite.querySelector('img');
    const suivante = toutes[rang];
    if(!img) return;
    // Plus rien à essayer, et l'image en place ne s'est jamais affichée : la
    // grande place vide s'efface plutôt que de laisser un carré gris.
    if(!suivante || rang < 0 || restants <= 0){
      if(boite.hasAttribute('data-seule') && img.complete && !img.naturalWidth) boite.remove();
      return;
    }
    if(suivante === img.getAttribute('src')) return;

    // Chargée avant d'être montrée : sans cela, la place reste vide le temps
    // que l'image arrive, et c'est un trou qu'on voit, pas un changement.
    // La place retient son rang dès maintenant : les places voisines, qui
    // tournent au même instant, ne viseront pas la même image.
    boite.setAttribute('data-rang', String(rang));
    const avance = new Image();
    // Sans dire d'où l'on vient : bien des sites (Madagascar Airlines…)
    // refusent leurs images à une page qui n'est pas la leur, et seulement
    // quand elle se nomme.
    avance.referrerPolicy = 'no-referrer';
    avance.onload = function(){
      if(!formeAcceptable(avance)){
        (cadre.__ecartes || (cadre.__ecartes = {}))[rang] = true;
        poserDansLaCase(cadre, boite, prochainRang(cadre, boite), restants - 1);
        return;
      }
      boite.setAttribute('data-rang', String(rang));
      img.style.opacity = '0';
      setTimeout(function(){
        img.src = suivante;
        img.style.opacity = '1';
      }, 220);
    };
    avance.onerror = function(){
      (cadre.__ecartes || (cadre.__ecartes = {}))[rang] = true;
      poserDansLaCase(cadre, boite, prochainRang(cadre, boite), restants - 1);
    };
    avance.src = suivante;
  }

  function tournerUnApercu(cadre){
    const toutes = cadre.__images || [];
    const cases = cadre.querySelectorAll('[data-rang]');
    if(!cases.length) return;

    // Pas assez d'images pour en montrer de nouvelles : celles qu'on voit
    // glissent d'une place vers la gauche (A B C → B C A).
    if(toutes.length <= cases.length){
      if(cases.length < 2) return;
      // Ces images sont déjà là et déjà vues : pas de chargement, pas
      // d'examen, un simple fondu.
      const vues = [];
      cases.forEach(function(c){
        const img = c.querySelector('img');
        vues.push({ rang: c.getAttribute('data-rang'), src: img ? img.getAttribute('src') : '' });
      });
      cases.forEach(function(boite, i){
        const img = boite.querySelector('img');
        const suivante = vues[(i + 1) % vues.length];
        if(!img || !suivante.src) return;
        boite.setAttribute('data-rang', suivante.rang);
        img.style.opacity = '0';
        setTimeout(function(){
          img.src = suivante.src;
          img.style.opacity = '1';
        }, 220);
      });
      return;
    }

    // Toutes les places changent ensemble, chacune avancée de trois.
    cases.forEach(function(boite){
      poserDansLaCase(cadre, boite, prochainRang(cadre, boite), toutes.length);
    });
  }

  function veillerSurLeTourDesApercus(){
    if(minuteurApercus) return;
    minuteurApercus = setInterval(function(){
      // Le fil ET la liste des boutiques : ce sont les mêmes cartes, et un
      // seul minuteur les fait toutes tourner.
      const cadres = document.querySelectorAll('[data-apercu]');
      if(!cadres.length){ clearInterval(minuteurApercus); minuteurApercus = null; return; }
      // Onglet caché : personne ne regarde, et une image qui se charge pour
      // personne, c'est le forfait de quelqu'un qui s'en va.
      if(document.hidden) return;
      cadres.forEach(function(cadre){
        if(cadre.offsetParent) tournerUnApercu(cadre);
      });
    }, APERCU_TOUR_MS);
  }

  // Les aperçus manquants, un à la fois : trente appels lancés ensemble
  // feraient attendre les trente.
  function chercherLesApercus(){
    if(apercusEnCours) return;
    // Celle qu'on regarde d'abord. La liste des boutiques en compte trente,
    // et aller les chercher toutes dès l'ouverture, ce sont trente appels
    // pour quatre cartes visibles — le reste attend qu'on descende jusqu'à
    // lui. Un cadre caché n'a pas d'« offsetParent ».
    let cadre = null;
    const enAttente = document.querySelectorAll('[data-apercu][data-apercu-attendu]');
    for(let i = 0; i < enAttente.length && !cadre; i++){
      if(enAttente[i].offsetParent) cadre = enAttente[i];
    }
    if(!cadre) return;
    const url = cadre.getAttribute('data-apercu');
    cadre.removeAttribute('data-apercu-attendu');

    const fini = function(apercu){
      apercusEnCours = 0;
      // Le fil a pu être redessiné entre-temps : on sert tous les cadres qui
      // portent cette adresse, et non celui d'avant, qui n'existe plus.
      const vise = (window.CSS && CSS.escape) ? CSS.escape(url) : url.replace(/["\\]/g, '\\$&');
      document.querySelectorAll('[data-apercu="' + vise + '"]')
        .forEach(function(c){ dessinerLApercu(c, apercu); });
      chercherLesApercus();
    };

    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      fini(null);
      return;
    }
    apercusEnCours = 1;
    window.__sb.functions.invoke('apercu', { body: { url: url } }).then(function(res){
      const a = (res && res.data && !res.data.error) ? res.data : null;
      // Gardé même vide : une page qui se refuse aujourd'hui se refusera
      // toute la semaine, et l'on ne va pas le redemander à chaque passage.
      garderLApercu(url, a || { site: '', titre: '', description: '', image: '' });
      fini(a);
    }, function(){ fini(null); });
  }

  // Le direct se regarde dans le billet, là où on l'a trouvé. Il partait dans
  // la page « Live direct » — la bonne page, mais pas celle qu'on regardait,
  // et le fil se refermait derrière soi.
  //
  // Le raccordement au diffuseur reste unique : joinLive fait le travail une
  // fois, et le billet n'est qu'un écran de plus sur le même flux
  // (brancherUnEcranDuLive). Regarder depuis le fil ou depuis la page Live,
  // c'est la même image et le même coût pour celui qui diffuse.
  //
  // Un appui, et non tout seul : une image qui part d'elle-même chez chacun,
  // c'est le téléphone du diffuseur qui s'épuise à nourrir des écrans que
  // personne ne regarde. Et le son ne partirait pas de toute façon — aucun
  // navigateur ne laisse une vidéo s'ouvrir avec le son sans qu'on l'ait
  // demandé.
  function montrerLeLiveDansLeBillet(div, leLive, nom){
    const bouton = div.querySelector('[data-live-join]');
    let cadre = div.querySelector('[data-live-video]');
    if(!cadre){
      cadre = document.createElement('div');
      cadre.setAttribute('data-live-video', '');
      cadre.style.cssText = 'margin-top:0.6rem;';
      cadre.innerHTML =
        '<video autoplay playsinline controls ' +
          'style="width:100%; border-radius:10px; background:#000; display:block;"></video>' +
        '<div data-live-etat class="fb-comment-empty">Mampifandray amin\'ny Live…</div>';
      if(bouton) bouton.insertAdjacentElement('afterend', cadre);
      else div.appendChild(cadre);
      const video = cadre.querySelector('video');
      // L'image est là : le mot d'attente n'a plus rien à dire.
      video.addEventListener('playing', function(){
        const etat = cadre.querySelector('[data-live-etat]');
        if(etat) etat.remove();
      });
    }
    cadre.style.display = '';

    const video = cadre.querySelector('video');
    if(typeof brancherUnEcranDuLive === 'function') brancherUnEcranDuLive(video);
    // Déjà raccordé à ce direct-là — depuis la page Live, ou depuis un autre
    // billet : il n'y a qu'à montrer, surtout pas à rejoindre une seconde fois.
    if(typeof liveRegardeMaintenant !== 'function' || liveRegardeMaintenant() !== leLive.email){
      joinLive(leLive.email, nom);
    }
    video.play().catch(function(){});

    if(bouton){
      bouton.textContent = '⏹️ Ajanony ny fijerena';
      bouton.__enCours = true;
    }
  }

  function refermerLeLiveDuBillet(div){
    const cadre = div.querySelector('[data-live-video]');
    if(cadre) cadre.remove();
    const bouton = div.querySelector('[data-live-join]');
    if(bouton){
      bouton.textContent = '▶️ Jereo ny Live eto';
      bouton.__enCours = false;
    }
  }

  // Le direct s'est arrêté, ou l'on a quitté : live.js appelle ici pour que
  // les billets ne gardent pas un écran noir.
  window.__refermerLesLivesDuFil = function(){
    document.querySelectorAll('#communityNewsList [data-live-email]').forEach(refermerLeLiveDuBillet);
  };

  // Un direct s'arrête sans prévenir le fil : le billet reste, et continue de
  // dire « en ce moment ». On repasse donc sur les billets déjà affichés à
  // chaque changement de présence, plutôt que de recharger tout le fil.
  function majBilletsLive(){
    document.querySelectorAll('#communityNewsList [data-live-email]').forEach(function(div){
      const encore = leLiveEstEnCours(div.getAttribute('data-live-email')) &&
        div.getAttribute('data-live-fini') !== '1';
      const badge = div.querySelector('.fb-type-badge');
      if(badge){
        badge.className = 'fb-type-badge' + (encore ? ' live' : '');
        badge.textContent = encore ? '🔴 LIVE DIRECT' : '⚫ Live tapitra';
      }
      div.classList.toggle('fb-post-live', encore);
      const bouton = div.querySelector('[data-live-join]');
      if(bouton) bouton.style.display = encore ? '' : 'none';
      // Terminé : l'écran du billet se referme avec lui, plutôt que de
      // rester noir sous un billet qui dit « tapitra ».
      if(!encore) refermerLeLiveDuBillet(div);
    });
  }
  window.__majBilletsLive = majBilletsLive;

  function renderCommunityNews(){
    // Les stories se rafraîchissent avec le fil. (try : le fil peut être
    // demandé avant que leur bloc ait fini de se poser.)
    try{ chargerStories(); }catch(e){}
    const list = document.getElementById('communityNewsList');
    const emptyHint = document.getElementById('communityNewsEmpty');
    if(!list) return;
    if(!window.__sb){ list.innerHTML=''; emptyHint.style.display = 'block'; return; }
    // Tout ce que la base garde — trente jours (supabase-menage-publications.sql),
    // comme la page « botika ». L'Accueil n'en montrait qu'une semaine, et les
    // billets plus anciens semblaient avoir disparu alors qu'ils étaient
    // encore là. Ne montez pas ce chiffre au-dessus de la durée de garde : il
    // n'y aurait rien de plus à montrer.
    const depuisTrenteJours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Les colonnes author_photo et author_email peuvent ne pas exister encore
    // — le même script SQL les pose toutes deux. Tant qu'il n'est pas passé,
    // les demander ferait échouer la requête entière et le fil resterait vide.
    // On les redemande alors sans elles.
    const COLONNES = 'id,client_name,network,message,link,type,price,image,created_at';
    // Les billets à la corbeille restent lisibles par leur auteur : le fil
    // les écarte lui-même. Sans la colonne (supabase-corbeille.sql pas encore
    // passé), le filtre ferait échouer la lecture : on le retire alors.
    function lireLeFil(avecPhoto, enLigne){
      let q = window.__sb.from('client_news')
        .select(COLONNES + (avecPhoto ? ',author_photo,author_email' : ''))
        .gte('created_at', depuisTrenteJours);
      if(enLigne) q = q.is('deleted_at', null);
      // Pas de plafond à trente : il cachait les plus anciens dès qu'on
      // publiait beaucoup. Mille, comme la page « botika ».
      return q.order('created_at', { ascending: false }).limit(1000);
    }
    lireLeFil(true, true)
      .then(function(res){
        if(res && res.error) return lireLeFil(true, false);
        return res;
      })
      .then(function(res){
        if(res && res.error) return lireLeFil(false, false);
        return res;
      })
      .then(function(res){
        // Le fil est redessiné : les boîtes d'avant n'existent plus, et la
        // lecture commune ne doit pas continuer de les servir.
        oublierLesCommentaires();
        list.innerHTML = '';
        const rows = (res && res.data) || [];
        emptyHint.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function(n){
          const div = document.createElement('div');
          const type = n.type || 'vaovao';
          // Un direct ne dure pas, et personne ne peut effacer son billet
          // depuis le navigateur. Passé deux heures il reste — c'est la trace
          // de ce qui a eu lieu — mais il cesse de dire « en ce moment », et
          // perd son rouge : le lien, lui, ne mène plus à rien.
          const liveFini = type === 'live' && n.created_at &&
            (Date.now() - new Date(n.created_at).getTime()) > 2 * 60 * 60 * 1000;
          // Le direct de quelqu'un qui n'est plus en train de diffuser est
          // fini, quelle que soit l'heure du billet : deux heures, c'était
          // faute de savoir. La présence le sait.
          const leLive = type === 'live' ? lireLeLienDuLive(n.link) : null;
          const lienDuBillet = leLive ? '' : (String(n.link || '').trim() || premierLien(n.message));
          const liveEnCours = type === 'live' && !liveFini &&
            (!leLive || leLiveEstEnCours(leLive.email));
          div.className = 'fb-post' +
            (liveEnCours ? ' fb-post-live' : type === 'entana' ? ' fb-post-entana' : '');
          if(leLive){
            div.setAttribute('data-live-email', leLive.email);
            if(liveFini) div.setAttribute('data-live-fini', '1');
          }
          // Le décompte des « j'aime » arrive après le fil : c'est par cet
          // identifiant qu'il retrouve la publication à laquelle il appartient.
          if(n.id) div.dataset.newsId = n.id;
          const d = n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : '';
          const typeBadge = type === 'live'
            ? (liveEnCours
              ? '<span class="fb-type-badge live">🔴 LIVE DIRECT</span>'
              : '<span class="fb-type-badge">⚫ Live tapitra</span>')
            : (type === 'entana' ? '<span class="fb-type-badge entana">🛒 Entana amidy</span>' : '');
          const medias = parseNewsImages(n.image);
          // « preload=metadata » : de quoi montrer la première image, et rien
          // de plus. Trente billets qui se chargeraient en entier, c'est le
          // fil qui ne s'ouvre plus.
          const baliseMedia = function(src, style){
            return estVideo(src)
              ? '<video src="' + escapeHtml(src) + '" controls preload="metadata" playsinline ' +
                'style="' + style + '"></video>'
              : '<img src="' + escapeHtml(src) + '" alt="" style="' + style + '">';
          };
          let imagesHtml = '';
          if(medias.length === 1){
            imagesHtml = baliseMedia(medias[0], 'max-width:100%; border-radius:10px; margin-top:0.6rem; display:block;');
          } else if(medias.length > 1){
            const cols = medias.length === 2 ? '1fr 1fr' : (medias.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr');
            imagesHtml = '<div style="display:grid; grid-template-columns:' + cols + '; gap:4px; margin-top:0.6rem;">' +
              medias.map(function(src){
                return baliseMedia(src, 'width:100%; height:140px; object-fit:cover; border-radius:8px; display:block;');
              }).join('') +
              '</div>';
          }
          div.innerHTML =
            '<div class="fb-post-head">' +
              // La photo que l'auteur a jointe à SON billet, et rien d'autre :
              // aller la chercher ailleurs d'après le nom affiché la donnerait
              // à une homonyme. Sans photo, les initiales. Un billet de la
              // maison, lui, porte le logo du site : il n'appartient à
              // personne en particulier.
              // Un bord vert si l'auteur est là en ce moment (live.js).
              '<div class="fb-avatar' + (emailEnLigne(n.author_email) ? ' en-ligne' : '') + '"' +
                (n.author_email ? ' data-en-ligne-email="' + escapeHtml(String(n.author_email).trim().toLowerCase()) + '"' : '') + '>' + (photoAffichee(n)
                ? '<img src="' + escapeHtml(photoAffichee(n)) + '" alt="' + escapeHtml(nomAffiche(n)) + '">'
                : escapeHtml(initials(nomAffiche(n)))) + '</div>' +
              '<div>' +
                '<div class="fb-post-name">' + escapeHtml(nomAffiche(n) || 'Client') + '</div>' +
                '<div class="fb-post-meta">' + typeBadge + '<span class="fb-network-badge">' + escapeHtml(n.network || 'Autre') + '</span><span>' + d + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="fb-post-body">' + escapeHtml(n.message || '') + '</div>' +
            imagesHtml +
            (n.price ? '<div class="fb-post-price">' + formatAr(n.price) + '</div>' : '') +
            // Un direct n'affiche pas son adresse : elle est longue, illisible,
            // et ne sert qu'à la machine. À sa place, le bouton qui entre —
            // caché dès que le direct s'arrête, car il ne mènerait à rien.
            // Un lien ordinaire, lui, devient une carte : l'image et le titre
            // que le site publie pour être partagé.
            (leLive
              ? '<button type="button" class="btn btn-red btn-sm" data-live-join ' +
                'style="width:auto; margin-top:0.6rem;' + (liveEnCours ? '' : ' display:none;') +
                '">▶️ Jereo ny Live eto</button>'
              : (lienDuBillet
                ? '<a href="' + escapeHtml(lienDuBillet) + '" target="_blank" rel="noopener" ' +
                  'data-apercu="' + escapeHtml(lienDuBillet) + '" data-apercu-attendu ' +
                  (nomRecherche(lienDuBillet) ? 'data-apercu-nom="' + escapeHtml(nomRecherche(lienDuBillet)) + '" ' : '') +
                  'style="display:block; margin-top:0.6rem; border:1px solid var(--line); ' +
                  'border-radius:10px; overflow:hidden; text-decoration:none; color:inherit;"></a>'
                : '')) +
            // Les actions au milieu, à intervalles égaux ; « Hamafa », à part,
            // au bord droit (components.css, « .fb-actions-milieu »).
            '<div class="fb-post-actions">' +
            '<div class="fb-actions-milieu">' +
            // Le logo seul, sans le mot : le mot reste dans title et
            // aria-label, pour le survol et pour qui lit à voix haute.
            '<span class="fb-like-action" data-like role="button" title="J\'aime" aria-label="J\'aime" style="cursor:pointer;">' + logoAvec(POUCE_LOGO) + '</span>' +
            '<span class="fb-comment-action fb-partager" data-comment role="button" title="Commenter" aria-label="Commenter" style="cursor:pointer;">' + BULLE_COMMENTER + '</span>' +
            // Le panier, juste après : on met de côté ce qu'on achètera. Sous
            // chaque billet, et non sous les seuls articles : une nouvelle
            // parle souvent d'un entana, et les cinq logos restent alignés
            // d'un billet à l'autre.
            '<span class="fb-share-action fb-partager fb-panier-action" data-panier role="button" title="Panier" aria-label="Panier" style="cursor:pointer;">' + LOGO_PANIER + '</span>' +
            // « Acheter » n'est plus ici : on passe par le panier, qui achète
            // avec la quantité voulue (« Hividy », buyFromPost).
            '<span class="fb-share-action fb-partager" data-share role="button" title="Partager" aria-label="Partager" style="cursor:pointer;">' + FLECHE_PARTAGE + '</span>' +
            // La feuille de WhatsApp coche cinq personnes et s'arrête là.
            // Celui-ci passe par la liste des clients (zara-rehetra.js) :
            // tout cocher d'un coup, sans plafond.
            '<span class="fb-share-action fb-partager" data-share-all role="button" title="Groupe" aria-label="Groupe" style="cursor:pointer;">' +
              LOGO_GROUPE + '</span>' +
            '</div>' +
            // Effacer n'est offert qu'à qui a écrit le billet : l'adresse du
            // billet est celle du compte. La base dit la même chose de son
            // côté (supabase-entana-lany.sql) — le bouton ne fait que suivre.
            (estMonBillet(n)
              ? '<span class="fb-share-action fb-partager" data-delete-post style="cursor:pointer;" title="Hamafa" aria-label="Hamafa" role="button">' + LOGO_FAFANA + '</span>'
              : '') +
            '</div>' +
            '<div class="fb-comments" data-comments style="display:none;"></div>';
          // La ligne du compte se glisse juste avant la rangée des actions.
          const actionsRow = div.querySelector('.fb-post-actions');
          const compteLigne = document.createElement('div');
          compteLigne.className = 'fb-like-count';
          compteLigne.setAttribute('data-like-count', '');
          compteLigne.style.display = 'none';
          if(actionsRow) div.insertBefore(compteLigne, actionsRow);
          const shareEl = div.querySelector('[data-share]');
          if(shareEl){
            shareEl.addEventListener('click', function(){ sharePost(n); });
          }
          const shareAllEl = div.querySelector('[data-share-all]');
          if(shareAllEl){
            shareAllEl.addEventListener('click', function(){ shareToutLeMonde(n); });
          }
          // La carte du lien : le nom du site tout de suite — un cadre vide
          // n'annonce rien — puis l'image et le titre quand ils arrivent.
          const cadreApercu = div.querySelector('[data-apercu]');
          if(cadreApercu){
            const garde = apercuGarde(lienDuBillet);
            dessinerLApercu(cadreApercu, garde);
            if(garde) cadreApercu.removeAttribute('data-apercu-attendu');
          }
          const deleteEl = div.querySelector('[data-delete-post]');
          if(deleteEl){
            deleteEl.addEventListener('click', function(){ effacerMonBillet(n, div, deleteEl); });
          }
          glisserPourEffacer(n, div);
          const panierEl = div.querySelector('[data-panier]');
          if(panierEl){
            if(lirePanier().some(function(x){ return String(x.id) === String(n.id); })) panierEl.classList.add('dans-panier');
            panierEl.addEventListener('click', function(e){ e.stopPropagation(); ajouterAuPanier(n, panierEl); });
          }
          // Le direct se regarde ici même. Sans joinLive — la page publique de
          // la Botika n'a pas le WebRTC — il reste le lien d'origine.
          const liveEl = div.querySelector('[data-live-join]');
          if(liveEl && leLive){
            liveEl.addEventListener('click', function(){
              if(typeof joinLive !== 'function'){
                if(n.link) window.open(n.link, '_blank');
                return;
              }
              if(liveEl.__enCours){
                if(typeof leaveLive === 'function') leaveLive();
                refermerLeLiveDuBillet(div);
                return;
              }
              montrerLeLiveDansLeBillet(div, leLive, leLive.name || n.client_name || '');
            });
          }
          const likeEl = div.querySelector('[data-like]');
          if(likeEl) setupLike(likeEl, n.id);
          const commentEl = div.querySelector('[data-comment]');
          const commentsBox = div.querySelector('[data-comments]');
          if(commentEl && commentsBox && n.id){
            // La boîte est là dès l'affichage : les commentaires sont la
            // suite du billet, pas une annexe qu'il faut penser à déplier.
            commentsBox.style.display = 'block';
            openComments(n.id, commentsBox, false);
            // Le mot ne déplie donc plus rien — il mène au champ, qui est ce
            // qu'on cherchait en le touchant.
            commentEl.addEventListener('click', function(){
              commentsBox.style.display = 'block';
              const champ = commentsBox.querySelector('.fb-comment-input');
              if(champ){ champ.focus(); champ.scrollIntoView({ block: 'nearest' }); }
            });
          }
          list.appendChild(div);
        });
        // Une lecture pour tout le fil, un minuteur, un canal — une fois
        // toutes les boîtes en place.
        veillerSurLesCommentaires();
        // Puis les aperçus qui manquent, un à la fois, et le tour des images.
        chercherLesApercus();
        veillerSurLeTourDesApercus();
        // Un seul appel pour tout le fil : trente publications qui iraient
        // chacune compter ses « j'aime » feraient trente requêtes.
        loadLikes(rows.map(function(n){ return n.id; }).filter(Boolean));
      }, function(){ list.innerHTML=''; emptyHint.style.display = 'block'; });
  }

  let pendingNewsImages = [];
  const MAX_NEWS_IMAGES = 6;
  // La vidéo ne se réduit pas dans le navigateur comme une photo : on ne peut
  // que refuser ce qui est trop lourd. Le bucket refuse la même chose de son
  // côté — c'est lui qui fait foi, la page ne fait qu'éviter un envoi perdu.
  const BUCKET_VIDEO = 'annonce-video';
  const MAX_VIDEO_MO = 25;
  let videoEnCours = false;

  const newsImageInput = document.getElementById('newsImage');
  const newsImagePreviewWrap = document.getElementById('newsImagePreviewWrap');

  function renderNewsImagePreviews(){
    if(!newsImagePreviewWrap) return;
    newsImagePreviewWrap.innerHTML = '';
    if(!pendingNewsImages.length && !videoEnCours){
      newsImagePreviewWrap.style.display = 'none';
      return;
    }
    newsImagePreviewWrap.style.display = 'flex';
    pendingNewsImages.forEach(function(src, idx){
      const thumb = document.createElement('div');
      thumb.style.cssText = 'position:relative; width:100px; height:100px;';
      const cadre = 'width:100%; height:100%; object-fit:cover; border-radius:10px; display:block; border:1px solid var(--line);';
      // La vignette d'une vidéo, c'est sa première image — et un repère pour
      // qu'on ne la prenne pas pour une photo.
      const apercu = estVideo(src)
        ? '<video src="' + src + '" muted playsinline preload="metadata" style="' + cadre + '"></video>' +
          '<span style="position:absolute; left:6px; bottom:4px; color:#fff; font-size:0.8rem; ' +
          'text-shadow:0 1px 3px rgba(0,0,0,0.8);">\u25b6 video</span>'
        : '<img src="' + src + '" style="' + cadre + '">';
      thumb.innerHTML = apercu +
        '<button type="button" data-idx="' + idx + '" title="Esory" ' +
        'style="position:absolute; top:-8px; right:-8px; background:#e5484d; color:#fff; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; line-height:1;">\u2715</button>';
      newsImagePreviewWrap.appendChild(thumb);
    });
    // L'envoi d'une vidéo prend le temps qu'il prend : sans rien à l'écran,
    // on croit que le bouton n'a pas répondu et on recommence.
    if(videoEnCours){
      const attente = document.createElement('div');
      attente.style.cssText = 'width:100px; height:100px; border:1px dashed var(--line); border-radius:10px; ' +
        'display:flex; align-items:center; justify-content:center; text-align:center; ' +
        'font-size:0.68rem; color:var(--muted); padding:0.3rem; box-sizing:border-box;';
      attente.textContent = 'Mandefa ny video\u2026';
      newsImagePreviewWrap.appendChild(attente);
    }
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

  // La vidéo ne voyage pas dans la ligne : elle part au bucket, et l'annonce
  // ne garde que son adresse. Une seule par annonce — c'est déjà beaucoup à
  // charger pour qui lit le fil sur son téléphone.
  const newsVideoInput = document.getElementById('newsVideo');
  if(newsVideoInput){
    newsVideoInput.addEventListener('change', function(){
      const file = (newsVideoInput.files || [])[0];
      newsVideoInput.value = '';
      if(!file) return;
      if(videoEnCours){ alert('Miandrasa : mbola mandeha ny video teo aloha.'); return; }
      if(pendingNewsImages.some(estVideo)){
        alert('Video iray ihany isaky ny fanambarana. Esory aloha ilay teo aloha.');
        return;
      }
      if(pendingNewsImages.length >= MAX_NEWS_IMAGES){
        alert('Feno ' + MAX_NEWS_IMAGES + ' ny isan-tokony.');
        return;
      }
      const mo = file.size / 1048576;
      if(mo > MAX_VIDEO_MO){
        alert('Lehibe loatra ny video : ' + mo.toFixed(1) + ' Mo. ' +
          MAX_VIDEO_MO + ' Mo no farany ambony. Fohezo na ahenao ny hatsarany.');
        return;
      }
      if(!window.__sb || !window.__sb.storage){
        alert('Tsy tafiditra ny serveur : tsy afaka mandefa video.');
        return;
      }
      videoEnCours = true;
      renderNewsImagePreviews();

      const ext = (String(file.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
      const nom = (window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).slice(2)) + '.' + ext;

      const fini = function(message){
        videoEnCours = false;
        renderNewsImagePreviews();
        if(message) alert(message);
      };

      window.__sb.storage.from(BUCKET_VIDEO)
        .upload(nom, file, { contentType: file.type || 'video/mp4', upsert: false })
        .then(function(res){
          if(res && res.error){
            fini('Tsy lasa ny video : ' + (res.error.message || 'tsy fantatra') +
              '\n\nRaha « Bucket not found » no hitanao, dia mbola tsy nalefa ny ' +
              '« supabase-annonce-video.sql ».');
            return;
          }
          const pub = window.__sb.storage.from(BUCKET_VIDEO).getPublicUrl(nom);
          const url = pub && pub.data && pub.data.publicUrl;
          if(!url){ fini('Tsy hita ny adiresin\'ny video.'); return; }
          pendingNewsImages.push(url);
          fini('');
        }, function(err){
          fini('Tsy lasa ny video : ' + ((err && err.message) || 'réseau'));
        });
    });
  }

  // Le champ du prix n'apparaît que si l'on annonce une marchandise : il n'a
  // rien à faire devant quelqu'un qui écrit une nouvelle ordinaire.
  const newsIsGoods = document.getElementById('newsIsGoods');
  const newsPrice = document.getElementById('newsPrice');
  if(newsIsGoods && newsPrice){
    newsIsGoods.addEventListener('change', function(){
      newsPrice.style.display = newsIsGoods.checked ? 'inline-block' : 'none';
      // :has() suffit aux navigateurs récents ; la classe assure les autres,
      // sans quoi l'icône ne montrerait rien de son état.
      const etiquette = document.getElementById('newsIsGoodsLabel');
      if(etiquette) etiquette.classList.toggle('actif', newsIsGoods.checked);
      const fiche = document.getElementById('entanaFiche');
      if(fiche) fiche.style.display = newsIsGoods.checked ? '' : 'none';
      if(newsIsGoods.checked){
        remplirLaListeDesArticles();
        const choix = document.getElementById('entanaArticle');
        (choix || newsPrice).focus({ preventScroll: true });
        // La boîte a sa hauteur à elle, et défile : la fiche qui s'ouvre en
        // dessous doit venir sous les yeux.
        if(fiche && fiche.scrollIntoView) fiche.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        // Une nouvelle ordinaire n'a pas d'article : le prix redevient libre.
        newsPrice.readOnly = false;
        newsPrice.placeholder = 'Vidiny (Ar)';
      }
    });
  }

  // ---- La fiche de l'article ----
  // Ce qu'une place de marché internationale exige de toute annonce : on ne
  // vend pas « un truc à 20 000 Ar », on vend un article nommé, d'une marque,
  // rangé, dans un état dit, venu de quelque part, et décrit.
  //
  // L'ARTICLE VIENT DU STOCK (📋 Articles). Son nom, son prix et sa quantité
  // sont lus là et ne se retapent pas : l'annonce dit ce que dit le stock, et
  // non une seconde version tapée à la main qui s'en écarterait. Elle porte
  // son numéro (item_id) : épuisé ou retiré du stock, l'article emporte son
  // annonce (stock.js). Le reste de la fiche — marque, catégorie, état,
  // origine, description — est gardé sur l'article, et revient tel quel la
  // fois suivante.
  const FICHE_ENTANA = [
    { id: 'entanaArticle', nom: 'Entana ao amin\'ny Articles' },
    { id: 'entanaMarque', nom: 'Marque', garde: 'marque' },
    { id: 'entanaCategorie', nom: 'Sokajy (Catégorie)', garde: 'categorie' },
    { id: 'entanaEtat', nom: 'Toetrany (État)', garde: 'etat' },
    { id: 'entanaOrigine', nom: 'Firenena niaviany', garde: 'origine' },
    { id: 'entanaDescription', nom: 'Famaritana (20 litera farafahakeliny)', garde: 'description' }
  ];
  const DESCRIPTION_MIN = 20;

  function valeurFiche(id){
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function lesArticles(){
    return (typeof items !== 'undefined' && Array.isArray(items)) ? items : [];
  }
  function articleChoisi(){
    const id = valeurFiche('entanaArticle');
    if(!id) return null;
    return lesArticles().find(function(it){ return String(it.id) === id; }) || null;
  }

  // La liste suit le stock tel qu'il est à l'instant où l'on coche 🛒. Un
  // article épuisé y figure, mais ne se choisit pas : on ne vend pas ce qu'on
  // n'a plus.
  function remplirLaListeDesArticles(){
    const choix = document.getElementById('entanaArticle');
    if(!choix) return;
    const avant = choix.value;
    const tous = lesArticles().slice().sort(function(a, b){
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
    });
    choix.innerHTML = '<option value="">— Safidio ny entana —</option>' + tous.map(function(it){
      const lany = !(Number(it.qty) >= 1);
      const libelle = (it.ref ? it.ref + ' — ' : '') + (it.name || '') +
        (lany ? ' (lany)' : ' · ' + Number(it.qty) + ' ' + (it.unit || ''));
      return '<option value="' + escapeHtml(String(it.id)) + '"' + (lany ? ' disabled' : '') + '>' +
        escapeHtml(libelle) + '</option>';
    }).join('');
    const vide = document.getElementById('entanaArticleVide');
    if(vide) vide.style.display = tous.length ? 'none' : '';
    const encore = tous.some(function(it){ return String(it.id) === avant && Number(it.qty) >= 1; });
    choix.value = (avant && encore) ? avant : '';
    appliquerLArticle();
  }

  // Ce que le stock sait, posé ; le nom et la quantité verrouillés. Le prix,
  // lui, se propose mais se corrige ici : corrigé, il repart au stock à la
  // publication (changerLePrixDeLArticle). Ce que l'article a gardé de sa
  // dernière fiche est reposé.
  function appliquerLArticle(){
    const it = articleChoisi();
    const nom = document.getElementById('entanaNom');
    const qte = document.getElementById('entanaQuantite');
    if(nom) nom.value = it ? (it.name || '') : '';
    if(qte) qte.value = it ? (Number(it.qty) || 0) : '';
    if(newsPrice){
      newsPrice.value = (it && Number(it.price) > 0) ? Number(it.price) : '';
      newsPrice.readOnly = false;
      newsPrice.placeholder = 'Vidiny (Ar)';
      newsPrice.classList.remove('tsy-feno');
    }
    if(!it) return;
    const garde = it.fiche || {};
    FICHE_ENTANA.forEach(function(r){
      if(!r.garde) return;
      const el = document.getElementById(r.id);
      if(el && garde[r.garde]){ el.value = garde[r.garde]; el.classList.remove('tsy-feno'); }
    });
  }
  (function(){
    const choix = document.getElementById('entanaArticle');
    if(choix) choix.addEventListener('change', appliquerLArticle);
  })();

  // Ce qui manque, dans l'ordre de la fiche. Les cases vides sont marquées en
  // rouge, et le rouge s'en va dès qu'on y écrit.
  function cequiManqueALaFiche(){
    const manque = [];
    let premier = null;
    FICHE_ENTANA.forEach(function(r){
      const el = document.getElementById(r.id);
      const v = valeurFiche(r.id);
      let bon = !!v;
      if(r.id === 'entanaDescription') bon = v.length >= DESCRIPTION_MIN;
      if(el) el.classList.toggle('tsy-feno', !bon);
      if(!bon){ manque.push(r.nom); if(!premier) premier = el; }
    });
    const it = articleChoisi();
    // La quantité ne se corrige pas ici : c'est le stock qui la tient.
    if(it && !(Number(it.qty) >= 1)) manque.push('Lany ao amin\'ny stock ity entana ity');
    const prixBon = !!(newsPrice && newsPrice.value) && Number(newsPrice.value) > 0;
    if(newsPrice) newsPrice.classList.toggle('tsy-feno', !prixBon);
    if(!prixBon){ manque.push('Vidiny (Ar)'); if(!premier) premier = newsPrice; }
    if(!pendingNewsImages.some(function(s){ return !estVideo(s); })) manque.push('Sary iray farafahakeliny');
    return { manque: manque, premier: premier };
  }

  // Le texte de l'annonce, toujours dans le même ordre : qui l'a déjà lu une
  // fois sait où chercher la marque ou l'état sur toutes les autres.
  //
  // La quantité n'y est pas écrite : elle baisse à chaque vente, et le billet,
  // lui, ne se réécrit pas — il dirait au bout de trois jours un chiffre qui
  // n'est plus vrai. Qu'il soit en ligne suffit à dire qu'il en reste.
  function texteDeLaFiche(){
    const it = articleChoisi() || {};
    const lignes = ['📦 ' + (it.name || '')];
    if(it.ref) lignes.push('🔖 Réf. : ' + it.ref);
    lignes.push(
      '🏷️ Marque : ' + valeurFiche('entanaMarque'),
      '🗂️ Catégorie : ' + valeurFiche('entanaCategorie'),
      '✨ État : ' + valeurFiche('entanaEtat'),
      '🌍 Origine : ' + valeurFiche('entanaOrigine'),
      '',
      '📝 ' + valeurFiche('entanaDescription')
    );
    return lignes.join('\n');
  }

  // Le prix corrigé dans l'annonce devient celui du stock : l'article et son
  // annonce disent le même prix. La correction s'inscrit à l'historique comme
  // celle faite au ✏️ de la page des articles (stock.js).
  function changerLePrixDeLArticle(it, prix){
    if(!it || !(prix > 0) || Number(it.price) === prix || typeof saveItems !== 'function') return;
    const avant = Number(it.price) || 0;
    it.price = prix;
    saveItems(items);
    if(typeof movements !== 'undefined' && Array.isArray(movements) && typeof saveMovements === 'function'){
      const note = 'prix : ' + formatAr(avant) + ' → ' + formatAr(prix) + ' (publication)';
      movements.push({
        itemId: it.id, ref: it.ref || '', name: it.name, category: it.category || '',
        type: 'modification', qty: it.qty, price: prix, value: (Number(it.qty) || 0) * prix,
        date: new Date().toISOString(), day: dayKey(new Date()), note: note
      });
      saveMovements(movements);
      if(typeof pushNotification === 'function') pushNotification('modification', 'Entana « ' + it.name + ' » novaina : ' + note);
    }
    if(typeof renderStock === 'function') renderStock();
    if(typeof renderMovementsHistory === 'function') renderMovementsHistory();
    if(typeof renderDashboard === 'function') renderDashboard();
  }

  // Dans l'autre sens : le prix changé au ✏️ des articles suit dans l'annonce
  // en ligne. Seul le prix est à reprendre — le texte de la fiche ne le porte
  // pas.
  window.__majLePrixDuBillet = function(itemId, prix){
    if(!itemId || !window.__sb || !(Number(prix) > 0)) return Promise.resolve(false);
    let q = window.__sb.from('client_news').update({ price: Number(prix) }).eq('item_id', itemId);
    return q.is('deleted_at', null).select('id')
      .then(function(res){
        // Sans la colonne deleted_at, on reprend sans ce filtre.
        if(res && res.error) return window.__sb.from('client_news').update({ price: Number(prix) }).eq('item_id', itemId).select('id');
        return res;
      })
      .then(function(res){
        const fait = !!(res && !res.error && res.data && res.data.length);
        if(fait) renderCommunityNews();
        return fait;
      }, function(){ return false; });
  };

  // La fiche remplie reste sur l'article : la prochaine annonce du même
  // article la retrouve telle quelle.
  function garderLaFicheSurLArticle(){
    const it = articleChoisi();
    if(!it || typeof saveItems !== 'function') return;
    const garde = {};
    FICHE_ENTANA.forEach(function(r){ if(r.garde) garde[r.garde] = valeurFiche(r.id); });
    it.fiche = garde;
    saveItems(items);
  }

  function viderLaFiche(){
    FICHE_ENTANA.concat([{ id: 'entanaNom' }, { id: 'entanaQuantite' }]).forEach(function(r){
      const el = document.getElementById(r.id);
      if(el){ el.value = ''; el.classList.remove('tsy-feno'); }
    });
    if(newsPrice){ newsPrice.classList.remove('tsy-feno'); newsPrice.readOnly = false; newsPrice.placeholder = 'Vidiny (Ar)'; }
    const fiche = document.getElementById('entanaFiche');
    if(fiche) fiche.style.display = 'none';
    const etiquette = document.getElementById('newsIsGoodsLabel');
    if(etiquette) etiquette.classList.remove('actif');
  }

  FICHE_ENTANA.forEach(function(r){
    const el = document.getElementById(r.id);
    if(!el) return;
    const effacerLeRouge = function(){ el.classList.remove('tsy-feno'); };
    el.addEventListener('input', effacerLeRouge);
    el.addEventListener('change', effacerLeRouge);
  });

  // Le 📢 de la page des articles ouvre cette même boîte, 🛒 coché et
  // l'article choisi : il ne reste qu'à compléter la fiche et poser la photo.
  window.__ouvrirLaFicheDeLEntana = function(item){
    const porte = document.getElementById('barComposer') || document.getElementById('composerToggle');
    const boite = document.getElementById('fbComposer');
    if(!porte || !boite || !newsIsGoods) return false;
    if(item && !(Number(item.qty) >= 1)){
      alert('Lany ao amin\'ny stock ity entana ity : tsy azo avoaka.');
      return true;
    }
    if(boite.style.display === 'none') porte.click();
    if(!newsIsGoods.checked){
      newsIsGoods.checked = true;
      newsIsGoods.dispatchEvent(new Event('change'));
    } else {
      remplirLaListeDesArticles();
    }
    const choix = document.getElementById('entanaArticle');
    if(choix && item){
      choix.value = String(item.id);
      appliquerLArticle();
    }
    const suivant = document.getElementById('entanaMarque');
    if(suivant) suivant.focus({ preventScroll: true });
    return true;
  };

  const postNewsBtn = document.getElementById('postNewsBtn');
  if(postNewsBtn){
    postNewsBtn.addEventListener('click', function(){
      const libre = document.getElementById('newsMessage').value.trim();
      const entana = !!(newsIsGoods && newsIsGoods.checked);
      // Publier maintenant, c'est publier sans la vidéo qui est en route.
      if(videoEnCours){ alert('Miandrasa kely : mbola mandeha ny video.'); return; }
      if(entana){
        const bilan = cequiManqueALaFiche();
        if(bilan.manque.length){
          alert('Tsy mbola azo avoaka : fenoy aloha ireto :\n\n• ' + bilan.manque.join('\n• '));
          if(bilan.premier) bilan.premier.focus();
          return;
        }
      }
      // L'annonce d'un article : ce que la personne a écrit en tête, puis la
      // fiche. Une nouvelle ordinaire reste ce qu'on a tapé.
      const message = entana ? [libre, texteDeLaFiche()].filter(Boolean).join('\n\n') : libre;
      if(!message && !pendingNewsImages.length){ alert('Soraty ny vaovao na alao sary aloha.'); return; }
      if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      const article = entana ? articleChoisi() : null;
      const prixAnnonce = (entana && newsPrice && Number(newsPrice.value) > 0) ? Number(newsPrice.value) : null;
      // L'annonce d'un article s'efface avec lui, et seule la base sait qui
      // peut effacer : il faut un compte pour qu'elle ait un auteur.
      if(article && !(currentUser && currentUser.email)){ alert('Midira aloha amin\'ny kaontinao.'); return; }
      const maison = jeSuisLaMaison();
      const clientName = maison ? MARQUE_NOM : ((currentUser && currentUser.name) || 'Client');

      function envoyer(){
      // La vignette est calculée avant l'envoi : le billet part avec le visage
      // de son auteur, seul moyen d'en être sûr chez les autres. Le logo de la
      // maison, lui, est déjà posé sur le site : rien à recopier ni à réduire.
      (maison ? Promise.resolve(MARQUE_LOGO) : vignette(currentUser && currentUser.logo)).then(function(photo){
      const billet = {
        client_name: clientName, network: 'Autre', message: message, link: '',
        // Une annonce marquée « entana amidy » porte son prix, et c'est elle
        // qui fera apparaître le bouton Acheter chez les autres. Corrigé ici,
        // il devient aussi celui du stock (plus bas).
        type: entana ? 'entana' : 'vaovao',
        price: prixAnnonce,
        image: pendingNewsImages.length ? JSON.stringify(pendingNewsImages) : null
      };
      const avecAuteur = Object.assign({}, billet, {
        author_email: (currentUser && currentUser.email) || null,
        author_photo: photo
      }, article ? { item_id: article.id } : {});
      // Tant que le script SQL n'a pas été passé, ces colonnes n'existent
      // pas et l'envoi entier serait refusé : le message doit partir quand même,
      // sans le visage.
      window.__sb.from('client_news').insert(avecAuteur)
        .then(function(res){ return (res && res.error) ? window.__sb.from('client_news').insert(billet) : res; })
        .then(function(){
        if(article){
          changerLePrixDeLArticle(article, prixAnnonce);
          garderLaFicheSurLArticle();
        }
        document.getElementById('newsMessage').value = '';
        if(newsIsGoods){ newsIsGoods.checked = false; }
        if(newsPrice){ newsPrice.value = ''; newsPrice.style.display = 'none'; }
        viderLaFiche();
        clearNewsImages();
        renderCommunityNews();
        // La boîte se referme sur ce signal (common.js), et non plus sur un
        // champ vide : une annonce refusée pour sa fiche a souvent un champ
        // libre vide, et la boîte se fermait sur un travail pas fini.
        document.dispatchEvent(new Event('billet-publie'));
      }, function(){ alert("Tsy voaray ny fanambarana."); });
      });
      }

      if(!article){ envoyer(); return; }
      // Deux annonces en ligne pour un même article, ce serait la même
      // marchandise deux fois dans le fil. Si la question échoue (colonnes pas
      // encore posées), on publie quand même.
      window.__sb.from('client_news').select('id').eq('item_id', article.id).is('deleted_at', null).limit(1)
        .then(function(res){
          if(res && !res.error && res.data && res.data.length){
            alert('Efa navoaka tao amin\'ny fil ity entana ity. Fafao aloha ilay teo aloha raha te-hamoaka vaovao.');
            return;
          }
          envoyer();
        }, envoyer);
    });
  }

  // ---------------- ANNONCER UN ARTICLE DU STOCK ----------------
  // Le fil savait annoncer une marchandise, mais jamais LAQUELLE : on tapait
  // son nom à la main, et l'annonce ne tenait plus à rien. Le jour où
  // l'article était épuisé, elle restait à vendre ce qu'on n'avait plus, et
  // le client écrivait pour s'entendre répondre qu'il n'y en avait plus.
  //
  // L'annonce part donc maintenant de la marchandise elle-même, par le
  // bouton « 📢 » de la page des articles. Elle garde son numéro, et s'en va
  // avec elle.
  //
  // CES DEUX PORTES SONT OUVERTES À stock.js, qui est chargé AVANT ce
  // fichier : il ne peut pas lire ce qui est écrit ici, mais il les appelle
  // au clic, quand tout est en place.
  //
  // IL FAUT UN COMPTE. La base n'accorde d'effacer qu'à l'auteur du billet,
  // reconnu par l'adresse de son jeton. Une annonce publiée sans compte
  // n'aurait pas d'auteur, et plus personne ne pourrait la retirer — ni le
  // jour de la rupture, ni à la main.
  window.__publierLEntana = function(item){
    if(!item) return Promise.reject(new Error('Tsy misy entana.'));
    if(!window.__sb) return Promise.reject(new Error('Tsy misy fifandraisana amin\'ny serveur.'));
    const moi = (currentUser && currentUser.email) ? currentUser.email.trim() : '';
    if(!moi) return Promise.reject(new Error('Midira aloha amin\'ny kaontinao.'));

    // Deux annonces pour un même article, ce serait la même marchandise deux
    // fois dans le fil — et la seconde ne dirait rien de plus que la première.
    return window.__sb.from('client_news').select('id').eq('item_id', item.id).limit(1)
      .then(function(res){
        if(res && res.error) throw new Error('Mbola tsy nalefa ny supabase-entana-lany.sql.');
        if(res && res.data && res.data.length) return { deja: true };

        const maison = jeSuisLaMaison();
        const clientName = maison ? MARQUE_NOM : ((currentUser && currentUser.name) || 'Client');
        // Le nom, et le rayon s'il y en a un. Pas la quantité : elle change à
        // chaque vente, et le billet, lui, ne se réécrit pas — il dirait au
        // bout de trois jours un chiffre qui n'est plus vrai.
        const message = item.name + (item.category ? ' — ' + item.category : '');
        return (maison ? Promise.resolve(MARQUE_LOGO) : vignette(currentUser && currentUser.logo))
          .then(function(photo){
            return window.__sb.from('client_news').insert({
              client_name: clientName, network: 'Autre', message: message, link: '',
              type: 'entana',
              price: item.price != null ? Number(item.price) : null,
              image: null,
              item_id: item.id,
              author_email: moi,
              author_photo: photo
            });
          })
          .then(function(res){
            if(res && res.error) throw new Error(res.error.message || 'Tsy voaray ny fanambarana.');
            renderCommunityNews();
            return { deja: false };
          });
      });
  };

  // L'article est épuisé, ou retiré du stock : son annonce n'a plus d'objet.
  //
  // On n'ajoute pas « et dont je suis l'auteur » à la demande : c'est la base
  // qui le tient, et elle compare les deux adresses sans tenir compte de la
  // casse. Le faire ici avec « eq » les comparerait lettre à lettre, et une
  // majuscule de différence laisserait l'annonce en place.
  // Les articles qui ont une annonce en ligne, pour la colonne « Fil » de la
  // page des articles (stock.js). Une seule question pour toute la liste. Les
  // annonces à la corbeille ne comptent pas : elles ne sont plus en ligne.
  // Sans la colonne deleted_at (supabase-corbeille.sql pas encore passé), on
  // redemande sans ce filtre.
  window.__lireLesEntanaNavoaka = function(){
    if(!window.__sb) return Promise.resolve(new Set());
    const demander = function(enLigne){
      let q = window.__sb.from('client_news').select('item_id').not('item_id', 'is', null);
      if(enLigne) q = q.is('deleted_at', null);
      return q.limit(1000);
    };
    return demander(true)
      .then(function(res){ return (res && res.error) ? demander(false) : res; })
      .then(function(res){
        const navoaka = new Set();
        ((res && !res.error && res.data) || []).forEach(function(r){ if(r.item_id) navoaka.add(String(r.item_id)); });
        return navoaka;
      });
  };

  // Retirer un article du fil sans le retirer du stock : son annonce part à
  // la corbeille, comme quand on l'efface depuis le fil lui-même.
  window.__retirerLEntanaDuFil = function(itemId){
    if(!itemId || !window.__sb) return Promise.reject(new Error('serveur'));
    return window.__sb.from('client_news').update({ deleted_at: new Date().toISOString() })
      .eq('item_id', itemId).is('deleted_at', null).select('id')
      .then(function(res){
        if(!res || res.error || !res.data || !res.data.length) throw (res && res.error) || new Error('refus');
        renderCommunityNews();
        return true;
      });
  };
  // La page des articles a pu se dessiner avant ce fichier : ses boutons
  // attendaient ces deux fonctions.
  if(typeof window.__majLesBoutonsFil === 'function') window.__majLesBoutonsFil();

  window.__effacerLesBilletsDeLEntana = function(itemId){
    if(!itemId || !window.__sb) return Promise.resolve(false);
    if(!(currentUser && currentUser.email)) return Promise.resolve(false);
    return window.__sb.from('client_news').delete().eq('item_id', itemId)
      .then(function(res){
        if(res && res.error) return false;
        renderCommunityNews();
        return true;
      }, function(){ return false; });
  };

  function renderCommunityPanel(){
    const avatar = document.getElementById('composerAvatar');
    if(avatar){
      // Le rond du composeur montre qui va signer : le logo de la maison
      // quand c'est elle qui écrit, la photo du profil sinon, et les
      // initiales pour ne pas laisser un rond vide à qui n’en a pas déposé.
      const maison = jeSuisLaMaison();
      const nom = maison ? MARQUE_NOM : ((currentUser && currentUser.name) || '');
      const photo = maison ? MARQUE_LOGO : (currentUser && currentUser.logo);
      if(photo){
        avatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = photo;
        img.alt = nom;
        avatar.appendChild(img);
      } else {
        avatar.textContent = initials(nom);
      }
    }
    renderCommunityNews();
    renderMarketplaceLinks();
    renderLivraisonLinks();
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
  // Un client qui a oublié son mot de passe règle 20 000 Ar par Papi au
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

  // Encaissements que Papi a confirmés tout seuls : le solde du propriétaire
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
      // « parrainage » : l'argent qui entre, que la boutique partage avec ses
      // employés (common.js), et non une simple information.
      pushNotification('parrainage', '💰 Argent reçu sur votre Papi : ' + recu.trim() + ' de ' +
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
              // Ce qui est réellement entré, quand le fournisseur l'a annoncé.
              (row.paid_amount
                ? 'Encaissé sur Papi : <strong style="color:var(--cyan);">' +
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
              const ou = comptes[row.payment_method] || 'votre compte Papi';
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
      // L'argent qui entre : partagé avec les employés, comme le portefeuille.
      pushNotification('parrainage', 'Argent reçu (' + paymentMethodLabel(row.payment_method) + ') pour ' +
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
          pushNotification('info', fresh.length + ' nouvelle(s) inscription(s) à Ny asako.');
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

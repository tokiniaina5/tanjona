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

  function ajouterUnGroupe(boite, titre, liens){
    if(!liens.length) return;
    const nom = document.createElement('div');
    nom.className = 'marketplace-titre';
    nom.textContent = titre;
    boite.appendChild(nom);
    const ligne = document.createElement('div');
    ligne.className = 'marketplace-cartes';
    liens.forEach(function(m){ addMarketplaceBtn(ligne, m.name, m.url); });
    boite.appendChild(ligne);
  }

  function renderMarketplaceLinks(){
    const boite = document.getElementById('marketplaceLinks');
    if(!boite) return;
    boite.innerHTML = '';
    DEFAULT_MARKETPLACES.forEach(function(g){ ajouterUnGroupe(boite, g.groupe, g.liens); });
    if(window.__sb){
      window.__sb.from('marketplace_links').select('name,url').order('created_at', { ascending: true })
        .then(function(res){
          const siens = (res && res.data) || [];
          // Sous son propre titre : on doit pouvoir distinguer d'un coup d'œil
          // ce qu'on a ajouté soi-même de ce qui était là.
          ajouterUnGroupe(boite, '⭐ Ny anao', siens.filter(function(m){ return m && m.name && m.url; }));
          chercherLesApercus();
        }, function(){});
    }
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
  // Pas de « Ny anao » ici, contrairement aux boutiques : la liste ne se
  // complète pas depuis la page, et rien n'est à poser dans la base. Le jour
  // où il en faudra, c'est "marketplace_links" qu'il faudra imiter.
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
    edge: { page: 'https://www.bing.com', android: 'com.microsoft.emmx', ios: 'microsoft-edge-https://www.bing.com', windows: 'microsoft-edge:https://www.bing.com' }
  };

  function ouvrirLeNavigateur(nom){
    const n = NAVIGATEURS[nom];
    if(!n) return;
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
          bouton.textContent = '🗑️ Hamafa';
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
        '<span class="fb-share-action" data-detruire style="cursor:pointer; color:var(--red);">🗑️ Fafana tanteraka</span>' +
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
          detruire.textContent = '🗑️ Fafana tanteraka';
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
  function buyFromPost(post){
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
    if(qty) qty.value = 1;
    if(statut){
      statut.textContent = existant
        ? 'Entana efa ao amin\'ny stock : ampio ny isa, dia tsindrio « Acheter ».'
        : 'Feno ho anao avy amin\'ny fanambarana. Jereo ny isa, dia tsindrio « Acheter ».';
    }
    if(nom || select) (existant ? qty : nom || qty).focus();
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

  function paintLike(el, newsId){
    const info = likeState[newsId] || { count: 0, mine: false };
    // Le bouton dit ce qu'il fait ; le nombre vit au-dessus, sur sa propre
    // ligne, et disparaît quand il n'y a rien à compter.
    el.textContent = '👍 J\'aime';
    el.classList.toggle('liked', !!info.mine);

    const post = el.closest('.fb-post');
    const compte = post && post.querySelector('[data-like-count]');
    if(compte){
      compte.style.display = info.count ? 'flex' : 'none';
      const qui = info.mine
        ? (info.count === 1 ? 'Ianao' : 'Ianao sy ' + (info.count - 1) + ' hafa')
        : info.count;
      compte.innerHTML = '<span class="fb-like-bubble">👍</span><span>' + escapeHtml(String(qui)) + '</span>';
    }
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
      .select('news_id,author_name,message,created_at')
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
          event: 'INSERT', schema: 'public', table: 'client_news_comments'
        }, function(){
          if(!realtimeCommentairesProuve){
            realtimeCommentairesProuve = true;
            poserLeMinuteurDesCommentaires(COMMENTAIRES_FILET_MS);
          }
          chargerLesCommentaires(true);
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
      '<button type="button" class="btn btn-sm fb-comment-send" style="width:auto;">Alefa</button>';

    // Ce qui est déjà à l'écran, en une ligne. Redessiner à l'identique
    // toutes les quatre secondes ferait sauter la sélection de qui relit, et
    // clignoter la liste pour rien.
    let empreinte = null;

    function signature(rows){
      return rows.map(function(c){
        return (c.created_at || '') + '|' + (c.author_name || '') + '|' + (c.message || '');
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
          escapeHtml(c.message || '') +
          '<span class="fb-comment-date">' +
            (c.created_at ? new Date(c.created_at).toLocaleString('fr-FR') : '') +
          '</span>';
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
    const toutes = ((apercu && apercu.images) || (apercu && apercu.image ? [apercu.image] : []))
      .filter(Boolean);
    // Toute la réserve reste attachée au cadre : c'est elle qui tourne.
    cadre.__images = toutes;
    cadre.__tour = 0;
    const images = toutes.slice(0, APERCU_IMAGES);
    // Dans la fenêtre des boutiques, les images sont demandées tout de suite.
    // Le chargement différé y reste muet : la fenêtre naît cachée, et le
    // navigateur ne revient pas sur sa décision quand elle paraît. Dans le
    // fil, qui se déroule normalement, il fait très bien son travail.
    const chargement = cadre.hasAttribute('data-apercu-direct') ? 'eager' : 'lazy';
    const cadreImage = 'width:100%; height:100%; object-fit:cover; display:block; ' +
      'background:var(--panel-2); transition:opacity 0.22s;';
    // Une image seule prend toute la place ; deux ou trois se mettent côte à
    // côte et échangent leurs places à chaque tour.
    const seule = toutes.length === 1;
    cadre.innerHTML =
      (images.length
        ? (seule
          ? '<div data-rang="0" data-seule style="height:' + Math.round(haut * 1.8) + 'px;">' +
            '<img src="' + escapeHtml(images[0]) + '" alt="" loading="' + chargement + '" ' +
            'style="' + cadreImage + '"></div>'
          : '<div style="display:grid; grid-template-columns:repeat(' + images.length + ', 1fr); gap:2px;">' +
            images.map(function(src, i){
              return '<div data-rang="' + i + '" style="height:' + haut + 'px;">' +
                '<img src="' + escapeHtml(src) + '" alt="" loading="' + chargement + '" ' +
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
    if(!img || !suivante || rang < 0 || restants <= 0) return;
    if(suivante === img.getAttribute('src')) return;

    // Chargée avant d'être montrée : sans cela, la place reste vide le temps
    // que l'image arrive, et c'est un trou qu'on voit, pas un changement.
    // La place retient son rang dès maintenant : les places voisines, qui
    // tournent au même instant, ne viseront pas la même image.
    boite.setAttribute('data-rang', String(rang));
    const avance = new Image();
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
    const list = document.getElementById('communityNewsList');
    const emptyHint = document.getElementById('communityNewsEmpty');
    if(!list) return;
    if(!window.__sb){ list.innerHTML=''; emptyHint.style.display = 'block'; return; }
    // Une semaine à l'Accueil, alors que la base garde le billet un mois
    // (supabase-menage-publications.sql) et que la page « botika » montre ce
    // mois entier. C'est voulu : l'Accueil est ce qui se passe maintenant.
    // Montrer MOINS que ce qu'on garde ne laisse aucun trou ; l'inverse en
    // laisserait — ne montez donc jamais ce chiffre au-dessus de trente sans
    // monter aussi la durée de garde.
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
        .gte('created_at', oneWeekAgo);
      if(enLigne) q = q.is('deleted_at', null);
      return q.order('created_at', { ascending: false }).limit(30);
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
              '<div class="fb-avatar">' + (photoAffichee(n)
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
                  'style="display:block; margin-top:0.6rem; border:1px solid var(--line); ' +
                  'border-radius:10px; overflow:hidden; text-decoration:none; color:inherit;"></a>'
                : '')) +
            '<div class="fb-post-actions">' +
            '<span class="fb-like-action" data-like style="cursor:pointer;">👍 J\'aime</span>' +
            '<span class="fb-comment-action" data-comment style="cursor:pointer;">💬 Commenter</span>' +
            // L'achat part de l'annonce elle-même : c'est là qu'on voit la
            // marchandise et son prix, pas dans un onglet qu'il faut aller
            // chercher ensuite en retapant tout de tête.
            (type === 'entana'
              ? '<span class="fb-buy-action" data-buy style="cursor:pointer; color:var(--cyan);">🛒 Acheter</span>'
              : '') +
            '<span class="fb-share-action" data-share style="cursor:pointer;">↗️ Partager</span>' +
            // La feuille de WhatsApp coche cinq personnes et s'arrête là.
            // Celui-ci passe par la liste des clients (zara-rehetra.js) :
            // tout cocher d'un coup, sans plafond.
            '<span class="fb-share-action" data-share-all style="cursor:pointer;">📢 Rehetra</span>' +
            // Effacer n'est offert qu'à qui a écrit le billet : l'adresse du
            // billet est celle du compte. La base dit la même chose de son
            // côté (supabase-entana-lany.sql) — le bouton ne fait que suivre.
            (estMonBillet(n)
              ? '<span class="fb-share-action" data-delete-post style="cursor:pointer; color:var(--red);">🗑️ Hamafa</span>'
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
          const buyEl = div.querySelector('[data-buy]');
          if(buyEl){
            buyEl.addEventListener('click', function(){ buyFromPost(n); });
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
      // « parrainage » : l'argent qui entre, que la boutique partage avec ses
      // employés (common.js), et non une simple information.
      pushNotification('parrainage', '💰 Argent reçu sur votre PayPal : ' + recu.trim() + ' de ' +
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

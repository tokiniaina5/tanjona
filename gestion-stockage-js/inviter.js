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

  // Adiresy publique an'ny appli. Io no alefa amin'ny rohy rehetra na dia
  // sokafana avy amin'ny localhost aza ny pejy, mba tsy hisy rohy tsy misokatra
  // any amin'ny mpanjifa. Ny admin dia afaka manova azy ao amin'ny
  // « Nous contacter » → « Adresse publique du site ».
  const DEFAULT_PUBLIC_URL = 'https://nyasako.com';

  // Toujours terminée par « / » : les liens s'y collent en « ?mpiasa=… »,
  // « ?suivi=… », « ?invite=… ». Sans la barre, « nyasako.com?mpiasa=… »
  // ne ressemble plus à une adresse : collé dans la barre de recherche de
  // Google sur un téléphone, il était cherché comme un mot au lieu d'être
  // ouvert.
  function publicBaseUrl(){
    let configured = '';
    try {
      if(typeof loadContactChannelsLocal === 'function'){
        configured = (loadContactChannelsLocal().site_url || '').trim();
      }
    } catch(e){}
    const base = (configured && /^https?:\/\//i.test(configured)) ? configured : DEFAULT_PUBLIC_URL;
    return base.replace(/\/+$/, '') + '/';
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

  // L'adresse du site, sans code. Avec une ID KEY (« ?aff= »), c'est le lien
  // d'affiliation, qui ne vit que dans 🤝 Affiliation (common.js).
  function lienInvitation(cle){
    // « /confirmation » : le mot se lit dans le lien lui-même. Seulement sur
    // Netlify, qui sait servir cette adresse (_redirects) ; une adresse
    // publique réglée ailleurs garde la racine.
    const base = publicBaseUrl();
    const chemin = /^https:\/\/ny-asako\.netlify\.app\/$/i.test(base) ? 'confirmation' : '';
    return base + chemin + (cle ? '?aff=' + encodeURIComponent(cle) : '');
  }

  // Le champ montre « https://nyasako.com » ; data-lien garde la barre
  // finale, où les boutons collent leurs « ?rohy=… » (lienInvitationEntier).
  function setupInviteLink(){
    const link = lienInvitation('');
    const input = document.getElementById('inviteLink');
    input.dataset.lien = link;
    input.value = link.replace(/\/+$/, '');
    renderLocalLinkWarning(link);
  }
  function lienInvitationEntier(){
    const input = document.getElementById('inviteLink');
    return input ? (input.dataset.lien || input.value) : '';
  }

  // « Copier tout » : rassemble tous les liens de l'application (invitation,
  // Live, appel vidéo, appel audio) en un seul texte prêt à être partagé.
  // Un seul lien, « confirmation » : celui qui l'ouvre y trouve les boutons
  // (entrer, Live direct, antso video, antso audio — live.js). Quatre longues
  // adresses dans un message ne se lisaient pas.
  function allShareLinksText(){
    const lien = typeof confirmationLink === 'function'
      ? confirmationLink() : lienInvitationEntier();
    return 'Ny asako\n\n' +
      'Tsindrio ny rohy confirmation : ao ianao no misafidy, hiditra ao amin\'ny Ny asako, ' +
      'hijery ny Live direct, na hanao antso video na audio.\n\n' +
      'Confirmation : ' + lien + nyAsakoTexte() + parrainTexte();
  }

  function copyTextWithFallback(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject();
  }

  function legacyCopy(text){
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed; top:-1000px; left:-1000px;';
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(ta);
  }

  document.getElementById('copyInviteBtn').addEventListener('click', function(){
    const btn = document.getElementById('copyInviteBtn');
    const text = allShareLinksText();
    const done = function(){
      const original = btn.textContent;
      btn.textContent = 'Copié !';
      setTimeout(function(){ btn.textContent = original; }, 1500);
    };
    copyTextWithFallback(text).then(done, function(){ legacyCopy(text); done(); });
  });

  document.getElementById('sendInviteBtn').addEventListener('click', function(){
    const email = document.getElementById('inviteEmail').value.trim();
    const link = lienInvitationEntier();
    const subject = encodeURIComponent('Confirmer ton invitation — Ny asako');
    const body = encodeURIComponent('Salut,\n\nJe t\'invite à rejoindre Ny asako. Clique sur le lien de confirmation pour confirmer ton inscription.\n\nConfirmation : ' + link +
      nyAsakoTexte() + parrainTexte() + '\n\nÀ bientôt !');
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  });

  // ---------------- PARTAGE RÉSEAUX SOCIAUX ----------------
  // Comme le lien de l'employé (equipe.js) : on demande de confirmer, et le
  // lien vient juste après « Confirmer ».
  function inviteMessage(link){
    // Sans émoji : le ✅ arrivait en « � » dans WhatsApp.
    return 'Salut ! Je t\'invite à rejoindre Ny asako. Clique sur le lien de confirmation pour confirmer ton inscription.\n\nConfirmation : ' + link +
      nyAsakoTexte() + parrainTexte();
  }

  // La liste des pages de Ny asako n'y est plus : le bot de Message
  // (BOT_FAQ, live.js) répond à tout cela. Une ligne pour y renvoyer.
  function nyAsakoTexte(){
    return '\n\nUne question sur Ny asako (prix, essai gratuit, portefeuille, boutique…) ? ' +
      'Écris-nous dans Message : le bot Ny asako te répond tout de suite.';
  }
  // Le court, pour X : 280 caractères, la liste n'y tient pas.
  function inviteMessageCourt(link){
    return 'Salut ! Je t\'invite à rejoindre Ny asako. Clique sur le lien de confirmation pour confirmer ton inscription.\n\nConfirmation : ' + link;
  }

  // Binance, Payoneer et les autres, joints à l'invitation : les mêmes liens
  // que la Botika (parrain-botika.js), avec un mot sur chacun. Les jeux
  // d'argent à part, avec l'avertissement des 18 ans. Sans émoji, comme le
  // reste du message.
  const PARRAIN_MOT = {
    'binance': 'crypto, achat et vente en Ariary par MVola / Orange Money',
    'payoneer': 'recevoir l\'argent de clients et de plateformes à l\'étranger',
    'bybit': 'crypto et trading, P2P en Ariary',
    'okx': 'crypto et trading, P2P en Ariary',
    'kucoin': 'crypto et trading',
    'bitget': 'crypto et trading',
    'redotpay': 'carte bancaire crypto pour payer en ligne',
    'wise': 'transferts d\'argent internationaux',
    'skrill': 'portefeuille en ligne, paiements internationaux',
    'airtm': 'dollars en ligne, retrait par Mobile Money',
    'exness': 'trading, à risque',
    'deriv': 'trading, à risque'
  };
  const PARRAIN_LALAO = ['bet261', 'aviator', '1xbet', 'melbet', 'lalao malagasy (loterie)'];
  function parrainTexte(){
    const liste = (typeof window.__lisitraParrain === 'function') ? window.__lisitraParrain() : [];
    if(!liste.length) return '';
    const ligne = function(x){
      const mot = PARRAIN_MOT[x.nom.toLowerCase()];
      const valeur = /^https?:\/\//i.test(x.rohy) ? x.rohy : 'code ' + x.rohy;
      // Le nom et son usage sur une ligne, le lien seul dessous : WhatsApp le
      // rend cliquable sans rien coller autour.
      return '- ' + x.nom + (mot ? ' : ' + mot : '') + '\n  ' + valeur;
    };
    const argent = liste.filter(function(x){ return PARRAIN_LALAO.indexOf(x.nom.toLowerCase()) < 0; });
    const lalao = liste.filter(function(x){ return PARRAIN_LALAO.indexOf(x.nom.toLowerCase()) >= 0; });
    let texte = '';
    if(argent.length){
      texte += '\n\nPour recevoir, envoyer et gérer ton argent en ligne, inscris-toi aussi sur ces plateformes ' +
        'par ces liens. Après l\'inscription, fais la vérification d\'identité (KYC) avec ta CIN ou ton passeport :\n' +
        argent.map(ligne).join('\n');
    }
    if(lalao.length){
      texte += '\n\nJeux et paris (18 ans et plus seulement, ne joue jamais l\'argent que tu ne peux pas perdre) :\n' +
        lalao.map(ligne).join('\n');
    }
    return texte;
  }
  function copyToClipboardSilently(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(function(){});
    }
  }

  // Les boutons viennent de « 🔗 Ajouter les liens » de ce compte (appelé par
  // renderContactButtons, contact.js) : un réseau avec un lien partage ; un
  // réseau sans lien reste visible mais pâle, et l'appui mène à « Ajouter
  // les liens ».
  function allerAuxLiens(){
    const nav = document.querySelector('.nav-item[data-section="contact"]');
    if(nav) nav.click();
  }
  function renderInviteSocials(channels, extra){
    const row = document.getElementById('inviteSocialButtons');
    if(!row) return;
    channels = channels || {};
    row.innerHTML = '';
    function lien(){ return lienInvitationEntier(); }
    function profil(cle){ return (typeof adresseDeProfil === 'function') ? adresseDeProfil(cle, channels[cle]) : null; }
    // Instagram, TikTok, WeChat et les canaux ajoutés n'ont pas de lien web
    // qui préremplit un message : on copie, puis on ouvre le lien du compte.
    function copier(nom, url){
      return function(){
        copyToClipboardSilently(inviteMessage(lien()));
        alert('Votre message a été copié. Ouvrez ' + nom + ' et collez-le.');
        if(url) window.open(url, '_blank');
      };
    }
    const reseaux = [
      { label: 'WhatsApp', logo: 'whatsapp', ok: !!(channels.whatsapp || '').replace(/[^\d]/g, ''), run: function(){
        window.open('https://wa.me/?text=' + encodeURIComponent(inviteMessage(lien())), '_blank'); } },
      { label: 'Facebook', logo: 'facebook', ok: !!profil('facebook'), run: function(){
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(lien()), '_blank'); } },
      { label: 'Instagram', logo: 'instagram', ok: !!profil('instagram'), run: function(){ copier('Instagram', profil('instagram'))(); } },
      { label: 'TikTok', logo: 'tiktok', ok: !!profil('tiktok'), run: function(){ copier('TikTok', profil('tiktok'))(); } },
      { label: 'Threads', logo: 'threads', ok: !!profil('threads'), run: function(){
        window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(inviteMessage(lien())), '_blank'); } },
      { label: 'X', logo: 'x', ok: !!profil('twitter'), run: function(){
        window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(inviteMessageCourt(lien())) + '&url=' + encodeURIComponent(lien()), '_blank'); } },
      { label: 'WeChat', logo: 'wechat', ok: !!(channels.wechat || '').trim(), run: copier('WeChat') }
    ];
    // Tous les canaux ajoutés à la main (Email, Telegram, YouTube…), comme
    // dans « 🔗 Ajouter les liens ».
    (extra || []).forEach(function(item){
      if(!item || !item.name) return;
      const value = (item.url || '').trim();
      const logo = (typeof logoDe === 'function') ? logoDe(item.name, value) : 'site';
      let run;
      if(/^mailto:/i.test(value)){
        // L'email part avec le message déjà écrit.
        run = function(){
          window.location.href = value.split('?')[0] + '?subject=' + encodeURIComponent('Ny asako') +
            '&body=' + encodeURIComponent(inviteMessage(lien()));
        };
      } else if(/^(viber|tg|sgnl):/i.test(value)){
        run = copier(item.name, value);
      } else {
        const propre = (/^https?:\/\//i.test(value) && typeof adresseDeProfil === 'function') ? adresseDeProfil('', value) : null;
        run = copier(item.name, (propre && !/\s/.test(propre)) ? propre : null);
      }
      reseaux.push({ label: item.name, logo: logo, ok: true, run: run });
    });
    // Mêmes logos que dans « 🔗 Ajouter les liens » (LOGOS, contact.js).
    const logos = (typeof LOGOS === 'object' && LOGOS) || {};
    row.style.gap = '1rem 1.1rem';
    reseaux.forEach(function(r){
      const l = logos[r.logo];
      const fond = l ? l[0] : (r.logo === 'email' ? '#EA4335' : '#5f6b73');
      const encre = r.logo === 'snapchat' ? '#111' : '#fff';
      const chemin = l ? l[1] : (r.logo === 'email' && typeof ENVELOPPE === 'string' ? ENVELOPPE : (typeof GLOBE === 'string' ? GLOBE : ''));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = 'background:none; border:0; padding:0; font:inherit; color:inherit; cursor:pointer; ' +
        'display:flex; flex-direction:column; align-items:center; gap:0.35rem;';
      btn.innerHTML = '<span style="display:flex; align-items:center; justify-content:center; width:3.4rem; height:3.4rem; ' +
        'border-radius:16px; background:' + fond + '; box-shadow:0 4px 12px rgba(0,0,0,0.25);">' +
        '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="' + encre + '" d="' + chemin + '"/></svg></span>' +
        '<span style="font-size:0.72rem; font-weight:600; color:var(--text); max-width:5.5rem; overflow:hidden; ' +
        'text-overflow:ellipsis; white-space:nowrap;"></span>';
      btn.lastChild.textContent = r.label;
      if(r.ok){
        btn.title = r.label;
        btn.addEventListener('click', r.run);
      } else {
        btn.style.opacity = '0.45';
        btn.title = r.label + ' : mbola tsy misy rohy — 🔗 Ajouter les liens';
        btn.addEventListener('click', allerAuxLiens);
      }
      row.appendChild(btn);
    });
  }
  // Rendu de nouveau à l'ouverture d'« Inviter des amis » : au chargement,
  // le compte n'est pas toujours encore connu, et la liste restait vide.
  const navInviter = document.querySelector('.nav-item[data-section="inviter"]');
  if(navInviter) navInviter.addEventListener('click', function(){
    if(typeof fetchMesCanaux === 'function') fetchMesCanaux(renderInviteSocials);
    // Le bloc 🤝 Affiliation vit ici : il lui faut l'état du portefeuille.
    if(typeof window.__rafraichirPortefeuille === 'function') window.__rafraichirPortefeuille();
    chargerParrainage();
  });

  // ---- Les explications de chaque plateforme ----
  // Où trouver son lien, la vérification, le passage en ariary. Les menus des
  // applications bougent : l'admin les réécrit ici (✏️), elles vont dans
  // parrainage_torolalana et tout le monde les voit aussitôt. Rien d'écrit
  // pour une plateforme : celles d'ici (Binance et Payoneer gardent celles de
  // la page, ny-asako.html).
  const LALAO_18 = 'Lalao misy loza : 18 taona no ho miakatra, ary aza milalao vola tsy azonao very.';
  const TOROLALANA_DEFAUT = {
    'bybit': [
      'Misorata anarana amin\'ny app Bybit, ary ataovy ny vérification (KYC) amin\'ny CIN na passeport.',
      'Profil → « Referral » (na « Invite Friends ») : eo ny rohy sy ny code-nao. Adikao eto ambany.',
      'Mahazo commission ianao isaky ny manao trade ireo olona nentinao.',
      'Ho Ariary : P2P ao amin\'ny Bybit (MVola / Orange Money). Aza mamoaka crypto raha tsy tonga tena izy ny vola.'
    ],
    'okx': [
      'Misorata anarana amin\'ny app OKX, ary ataovy ny vérification (KYC).',
      'Profil → « Invite friends » (na « Referral ») : eo ny rohy sy ny code-nao.',
      'Mahazo commission ianao amin\'ny trade ataon\'ireo nentinao.',
      'Ho Ariary : P2P ao amin\'ny OKX (MVola / Orange Money).'
    ],
    'kucoin': [
      'Misorata anarana amin\'ny app KuCoin, ary ataovy ny vérification (KYC).',
      'Profil → « Referral » : eo ny rohy sy ny code-nao.',
      'Mahazo ampahany amin\'ny frais de trading an\'ireo nentinao ianao.',
      'Ho Ariary : P2P ao amin\'ny KuCoin.'
    ],
    'bitget': [
      'Misorata anarana amin\'ny app Bitget, ary ataovy ny vérification (KYC).',
      'Profil → « Referral » (na « Invite friends ») : eo ny rohy sy ny code-nao.',
      'Mahazo commission ianao amin\'ny trade ataon\'ireo nentinao.',
      'Ho Ariary : P2P ao amin\'ny Bitget.'
    ],
    'redotpay': [
      'Misorata anarana amin\'ny app RedotPay (karatra crypto), ary ataovy ny vérification.',
      'Ao amin\'ny app : « Invite friends » (na « Referral ») : eo ny rohy sy ny code-nao.',
      'Mahazo bonus ianao rehefa manokatra karatra sy mampiasa azy ireo nentinao (jereo ao amin\'ny app ny fepetra).'
    ],
    'wise': [
      'Manokafa kaonty Wise, ary ataovy ny vérification (jereo aloha raha azo ampiasaina amin\'ny firenenao).',
      'Ao amin\'ny kaonty : « Invite friends » (na « Refer a friend ») : eo ny rohinao.',
      'Mahazo bonus ianao rehefa mandefa vola voalohany ireo nasainao (jereo ny fepetra ao amin\'ny kaontinao).'
    ],
    'skrill': [
      'Manokafa kaonty Skrill, ary ataovy ny vérification.',
      'Ao amin\'ny kaonty : « Refer a friend » : eo ny rohinao.',
      'Mahazo bonus ianao araka ny fepetra ao amin\'ny kaontinao (miova matetika).'
    ],
    'airtm': [
      'Misorata anarana amin\'ny Airtm, ary ataovy ny vérification.',
      'Profil → « Invite friends » : eo ny rohy sy ny code-nao.',
      'Ho Ariary : ny « Cash out » ao amin\'ny Airtm, miaraka amin\'ny Mobile Money raha misy.'
    ],
    'exness': [
      'Manokafa kaonty Exness, ary ataovy ny vérification.',
      'Personal Area → « Partnership » (na « Exness Partners ») : eo ny rohy partenaire-nao.',
      'Mahazo commission ianao amin\'ny trade ataon\'ireo nentinao. Trading misy loza : aza mampiasa vola tsy azonao very.'
    ],
    'deriv': [
      'Manokafa kaonty Deriv, ary ataovy ny vérification.',
      'Misorata ho « Deriv Partners » (affiliate) ao amin\'ny tranonkalan\'i Deriv : eo ny rohy partenaire-nao.',
      'Mahazo commission ianao amin\'ny trade ataon\'ireo nentinao. Trading misy loza.'
    ],
    'lalao malagasy (loterie)': [
      'Jereo ao amin\'ny Lalao Malagasy raha misy programme parrainage na mpivarotra (revendeur).',
      'Apetraho eto ny rohy na ny code omeny anao.',
      LALAO_18
    ],
    'bet261': [
      'Misorata anarana amin\'ny Bet261, ary ataovy ny vérification.',
      'Kaonty → « Parrainage » (na « Invite friends ») raha misy : eo ny rohy na ny code-nao.',
      'Ho Ariary : retrait amin\'ny MVola / Orange Money / Airtel Money ao amin\'ny kaonty.',
      LALAO_18
    ],
    'aviator': [
      'Lalao ao anatin\'ny tranonkala filokana (1xBet, Melbet, Bet261…) ny Aviator, fa tsy tranonkala misaraka.',
      'Ny rohy partenaire an\'ilay tranonkala misy ny Aviator no apetraka eto.',
      LALAO_18
    ],
    '1xbet': [
      'Misorata ho partenaire ao amin\'ny « 1xPartners » (programme affiliate an\'ny 1xBet).',
      'Ao amin\'ny tableau de bord 1xPartners : eo ny rohy partenaire-nao.',
      'Mahazo commission ianao araka ny filalaovan\'ireo nentinao.',
      LALAO_18
    ],
    'melbet': [
      'Misorata ho partenaire ao amin\'ny « Melbet Partners » (programme affiliate).',
      'Ao amin\'ny tableau de bord : eo ny rohy partenaire-nao.',
      'Mahazo commission ianao araka ny filalaovan\'ireo nentinao.',
      LALAO_18
    ]
  };
  let torolalanaDb = {};
  function chargerTorolalana(){
    if(!window.__sb) return;
    window.__sb.from('parrainage_torolalana').select('nom,dingana').then(function(res){
      // Table absente (SQL pas passé) : on reste sur celles d'ici.
      if(!res || res.error) return;
      torolalanaDb = {};
      (res.data || []).forEach(function(r){
        if(r && r.nom && Array.isArray(r.dingana) && r.dingana.length) torolalanaDb[String(r.nom).toLowerCase()] = r.dingana;
      });
      document.querySelectorAll('ol.parrain-torolalana').forEach(rendreTorolalana);
    }, function(){});
  }
  // Une liste : celle de l'admin, sinon celle d'ici ; sinon (Binance,
  // Payoneer) ce que la page porte déjà.
  function rendreTorolalana(ol){
    const nom = ol.getAttribute('data-sehatra') || '';
    const cle = nom.toLowerCase();
    if(!ol.hasAttribute('data-page')) ol.setAttribute('data-page', ol.innerHTML);
    const dingana = torolalanaDb[cle] || TOROLALANA_DEFAUT[cle];
    if(dingana){
      ol.innerHTML = '';
      dingana.forEach(function(t){
        const li = document.createElement('li');
        li.textContent = String(t);
        ol.appendChild(li);
      });
    } else {
      ol.innerHTML = ol.getAttribute('data-page');
    }
    ol.style.display = ol.children.length ? '' : 'none';
    ajouterOvaina(ol);
  }
  // ✏️ pour l'admin seul : une étape par ligne. Vide : on revient à celles
  // d'ici. La base refuse de toute façon l'écriture à un autre.
  function ajouterOvaina(ol){
    const suivant = ol.nextElementSibling;
    if(suivant && suivant.classList.contains('parrain-torolalana-ovay')) suivant.remove();
    if(!(typeof estAdminRohy === 'function' && estAdminRohy())) return;
    const nom = ol.getAttribute('data-sehatra') || '';
    const boite = document.createElement('div');
    boite.className = 'parrain-torolalana-ovay';
    boite.style.cssText = 'margin:-0.3rem 0 0.6rem;';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn btn-sm'; btn.style.width = 'auto';
    btn.textContent = '✏️ Havaozy ny torolalana';
    btn.title = 'Raha niova toerana ny menu ao amin\'ny ' + nom;
    btn.addEventListener('click', function(){
      boite.innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'rohy-saha';
      ta.rows = 5;
      ta.style.cssText = 'width:100%; font-family:inherit;';
      ta.placeholder = 'Dingana iray isaky ny andalana (8 farafahabetsany). Avelao ho foana raha hiverina amin\'ny teo aloha.';
      ta.value = [].map.call(ol.children, function(li){ return li.textContent; }).join('\n');
      const tehirizo = document.createElement('button');
      tehirizo.type = 'button'; tehirizo.className = 'btn btn-primary btn-sm'; tehirizo.style.width = 'auto';
      tehirizo.textContent = '💾 Tehirizo';
      const ajanony = document.createElement('button');
      ajanony.type = 'button'; ajanony.className = 'btn btn-sm'; ajanony.style.width = 'auto';
      ajanony.textContent = '✕';
      const statut = document.createElement('span');
      statut.style.cssText = 'font-size:0.75rem; color:var(--muted); margin-left:0.4rem;';
      ajanony.addEventListener('click', function(){ rendreTorolalana(ol); });
      tehirizo.addEventListener('click', function(){
        const dingana = ta.value.split('\n').map(function(l){ return l.trim(); })
          .filter(Boolean).slice(0, 8).map(function(l){ return l.slice(0, 300); });
        tehirizo.disabled = true;
        const fini = function(res){
          tehirizo.disabled = false;
          if(res && res.error){ statut.textContent = '❌ ' + res.error.message; return; }
          if(dingana.length) torolalanaDb[nom.toLowerCase()] = dingana;
          else delete torolalanaDb[nom.toLowerCase()];
          rendreTorolalana(ol);
        };
        const requete = dingana.length
          ? window.__sb.from('parrainage_torolalana').upsert({ nom: nom, dingana: dingana, updated_at: new Date().toISOString() })
          : window.__sb.from('parrainage_torolalana').delete().eq('nom', nom);
        requete.then(fini, function(){ fini({ error: { message: 'jereo ny connexion' } }); });
      });
      const rangee = document.createElement('div');
      rangee.style.cssText = 'display:flex; gap:0.4rem; align-items:center; margin-top:0.4rem;';
      rangee.appendChild(tehirizo); rangee.appendChild(ajanony); rangee.appendChild(statut);
      boite.appendChild(ta); boite.appendChild(rangee);
    });
    boite.appendChild(btn);
    ol.insertAdjacentElement('afterend', boite);
  }

  // ---------------- PARRAINAGE BINANCE / PAYONEER / AUTRES ----------------
  // Chaque compte garde son propre lien (rohy_parrainage) ; c'est la
  // plateforme qui paie, l'admin n'y est pour rien. Binance et Payoneer ont
  // leur case ; les autres plateformes, chacun les choisit (colonne « hafa » :
  // [{ nom, rohy }], dix au plus).
  const PARRAIN_NOMS = { binance: 'Binance', payoneer: 'Payoneer' };
  const PARRAIN_HAFA_MAX = 10;
  let parrainHafa = [];
  let parrainVoaloaVe = false;
  function parrainInput(cle){
    return document.getElementById(cle === 'binance' ? 'parrainBinance' : 'parrainPayoneer');
  }
  function parrainStatut(texte){
    const el = document.getElementById('parrainStatut');
    if(el) el.textContent = texte || '';
  }

  // Les autres plateformes : une ligne chacune, comme Binance et Payoneer.
  function renderParrainHafa(){
    const liste = document.getElementById('parrainHafaLisitra');
    if(!liste) return;
    liste.innerHTML = '';
    parrainHafa.forEach(function(h, i){
      const bloc = document.createElement('div');
      bloc.style.cssText = 'margin-top:0.8rem;';
      const titre = document.createElement('label');
      titre.className = 'rohy-etiketa';
      titre.textContent = '🔗 ' + h.nom;
      const ligne = document.createElement('div');
      ligne.className = 'rohy-andalana';
      const input = document.createElement('input');
      input.className = 'rohy-saha';
      input.type = 'text';
      input.maxLength = 300;
      input.placeholder = 'Rohy na code ' + h.nom;
      input.value = h.rohy || '';
      input.disabled = !parrainVoaloaVe;
      input.addEventListener('input', function(){ parrainHafa[i].rohy = input.value; });
      const adika = document.createElement('button');
      adika.type = 'button'; adika.className = 'btn btn-sm'; adika.textContent = '📋 Adikao';
      adika.addEventListener('click', function(){ parrainAdika(adika, input); });
      const zarao = document.createElement('button');
      zarao.type = 'button'; zarao.className = 'btn btn-sm'; zarao.textContent = '📤 Zarao';
      zarao.addEventListener('click', function(){ parrainZarao(h.nom, input.value.trim()); });
      const fafao = document.createElement('button');
      fafao.type = 'button'; fafao.className = 'btn btn-sm'; fafao.textContent = '🗑️';
      fafao.title = 'Esory ' + h.nom + ' (tehirizo avy eo)';
      fafao.disabled = !parrainVoaloaVe;
      fafao.addEventListener('click', function(){
        parrainHafa.splice(i, 1);
        renderParrainHafa();
        parrainStatut('Tsindrio « 💾 Tehirizo ny rohiko » mba hamafisina.');
      });
      ligne.appendChild(input); ligne.appendChild(adika); ligne.appendChild(zarao); ligne.appendChild(fafao);
      // Les explications de la plateforme, au-dessus de son champ.
      const ol = document.createElement('ol');
      ol.className = 'parrain-torolalana';
      ol.setAttribute('data-sehatra', h.nom);
      ol.style.cssText = 'font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.6rem 1.1rem; padding:0;';
      bloc.appendChild(titre);
      bloc.appendChild(ol);
      rendreTorolalana(ol);
      bloc.appendChild(ligne);
      liste.appendChild(bloc);
    });
  }

  // Pas payé (parrainage_voaloa) : les champs se ferment, le bouton payer
  // s'ouvre. L'admin ne paie pas ; la base refuse de toute façon l'écriture.
  function parrainVoaloa(voaloa){
    parrainVoaloaVe = voaloa;
    const hidy = document.getElementById('parrainHidy');
    if(hidy) hidy.style.display = voaloa ? 'none' : '';
    Object.keys(PARRAIN_NOMS).forEach(function(cle){
      const el = parrainInput(cle);
      if(el) el.disabled = !voaloa;
    });
    const save = document.getElementById('parrainSave');
    if(save) save.style.display = voaloa ? '' : 'none';
    const ampio = document.getElementById('parrainHafaAmpio');
    if(ampio) ampio.style.display = voaloa ? '' : 'none';
    renderParrainHafa();
  }
  function chargerParrainage(){
    if(!window.__sb || !document.getElementById('parrainPanel')) return;
    if(typeof window.__afficherParrainBotika === 'function') window.__afficherParrainBotika();
    chargerTorolalana();
    monUid().then(function(uid){
      if(!uid){ parrainVoaloa(false); parrainStatut('Midira amin\'ny kaontinao vao afaka mitahiry ny rohinao.'); return; }
      window.__sb.rpc('parrainage_voaloa').then(function(res){
        parrainVoaloa(!!(res && !res.error && res.data));
      }, function(){ parrainVoaloa(false); });
      window.__sb.from('rohy_parrainage').select('binance,payoneer,hafa').eq('user_id', uid).maybeSingle()
        .then(function(res){
          const d = (res && res.data) || {};
          Object.keys(PARRAIN_NOMS).forEach(function(cle){
            const el = parrainInput(cle);
            // Ce qu'on est en train de taper ne s'efface pas.
            if(el && document.activeElement !== el) el.value = d[cle] || '';
          });
          parrainHafa = Array.isArray(d.hafa) ? d.hafa.filter(function(h){ return h && h.nom; }) : [];
          renderParrainHafa();
          parrainStatut('');
        }, function(){});
    });
  }

  // ➕ Une plateforme de la liste, ou « Hafa » avec son nom à soi.
  const hafaSafidy = document.getElementById('parrainHafaSafidy');
  const hafaAnarana = document.getElementById('parrainHafaAnarana');
  if(hafaSafidy && hafaAnarana){
    hafaSafidy.addEventListener('change', function(){
      hafaAnarana.style.display = hafaSafidy.value === '__hafa' ? '' : 'none';
    });
  }
  const hafaAmpio = document.getElementById('parrainHafaAmpioBtn');
  if(hafaAmpio){
    hafaAmpio.addEventListener('click', function(){
      let nom = hafaSafidy ? hafaSafidy.value : '';
      if(nom === '__hafa') nom = hafaAnarana ? hafaAnarana.value.trim().slice(0, 40) : '';
      if(!nom){ parrainStatut('Safidio na soraty ny anaran\'ny sehatra.'); return; }
      const deja = parrainHafa.some(function(h){ return h.nom.toLowerCase() === nom.toLowerCase(); }) ||
        Object.keys(PARRAIN_NOMS).some(function(c){ return PARRAIN_NOMS[c].toLowerCase() === nom.toLowerCase(); });
      if(deja){ parrainStatut(nom + ' : efa ao.'); return; }
      if(parrainHafa.length >= PARRAIN_HAFA_MAX){ parrainStatut(PARRAIN_HAFA_MAX + ' sehatra hafa farafahabetsany.'); return; }
      parrainHafa.push({ nom: nom, rohy: '' });
      renderParrainHafa();
      if(hafaSafidy) hafaSafidy.value = '';
      if(hafaAnarana){ hafaAnarana.value = ''; hafaAnarana.style.display = 'none'; }
      parrainStatut('Apetraho ny rohinao ' + nom + ', dia tsindrio « 💾 Tehirizo ny rohiko ».');
    });
  }

  // 5 000 Ar une fois, par le portefeuille ; s'il manque de l'argent Papi,
  // common.js ouvre Papi et achète au retour (papi-paiement.js).
  const parrainAloa = document.getElementById('parrainAloa');
  if(parrainAloa){
    parrainAloa.addEventListener('click', function(){
      const statut = document.getElementById('parrainAloaStatut');
      if(typeof window.__payerSiteItem !== 'function'){
        if(statut) statut.textContent = 'Portefeuille tsy vonona : avereno sokafana ny pejy.';
        return;
      }
      window.__payerSiteItem('parrainage', statut, parrainAloa, function(){
        if(statut) statut.textContent = '✅ Voaloa : apetraho izao ny rohinao.';
        chargerParrainage();
      });
    });
  }
  const parrainSave = document.getElementById('parrainSave');
  if(parrainSave){
    parrainSave.addEventListener('click', function(){
      if(!window.__sb){ parrainStatut('Tsy misy fifandraisana amin\'ny serveur.'); return; }
      monUid().then(function(uid){
        if(!uid){ parrainStatut('Midira amin\'ny kaontinao vao afaka mitahiry ny rohinao.'); return; }
        const ligne = { user_id: uid, updated_at: new Date().toISOString() };
        Object.keys(PARRAIN_NOMS).forEach(function(cle){
          const el = parrainInput(cle);
          ligne[cle] = el ? (el.value.trim().slice(0, 300) || null) : null;
        });
        ligne.hafa = parrainHafa.map(function(h){
          return { nom: String(h.nom).slice(0, 40), rohy: String(h.rohy || '').trim().slice(0, 300) };
        });
        parrainSave.disabled = true;
        window.__sb.from('rohy_parrainage').upsert(ligne).then(function(res){
          parrainSave.disabled = false;
          parrainStatut(res && res.error ? '❌ ' + res.error.message : '✅ Voatahiry ny rohinao.');
          // Ceux de l'admin se voient aussi dans la Botika.
          if(typeof window.__afficherParrainBotika === 'function') window.__afficherParrainBotika();
        }, function(){
          parrainSave.disabled = false;
          parrainStatut('❌ Tsy voatahiry : jereo ny connexion.');
        });
      });
    });
  }

  function parrainAdika(btn, el){
    const valeur = el ? el.value.trim() : '';
    if(!valeur){ parrainStatut('Apetraho aloha ny rohinao.'); return; }
    const fini = function(){
      btn.textContent = '✅ Voadika';
      setTimeout(function(){ btn.textContent = '📋 Adikao'; }, 1500);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(valeur).then(fini, function(){ el.select(); });
    } else {
      el.select(); try{ document.execCommand('copy'); fini(); }catch(e){}
    }
  }
  function parrainZarao(nom, valeur){
    if(!valeur){ parrainStatut('Apetraho aloha ny rohinao.'); return; }
    const texte = 'Misorata anarana amin\'ny ' + nom + ' amin\'ity rohy ity :';
    // Un code seul n'est pas une adresse : il part dans le texte.
    const estLien = /^https?:\/\//i.test(valeur);
    if(navigator.share){
      navigator.share(estLien ? { title: nom, text: texte, url: valeur }
        : { title: nom, text: texte + ' ' + valeur }).catch(function(){});
    } else if(estLien){
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(valeur), '_blank', 'noopener');
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(texte + ' ' + valeur), '_blank', 'noopener');
    }
  }
  document.querySelectorAll('[data-parrain-copy]').forEach(function(btn){
    btn.addEventListener('click', function(){
      parrainAdika(btn, parrainInput(btn.getAttribute('data-parrain-copy')));
    });
  });
  document.querySelectorAll('[data-parrain-share]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const cle = btn.getAttribute('data-parrain-share');
      const el = parrainInput(cle);
      parrainZarao(PARRAIN_NOMS[cle], el ? el.value.trim() : '');
    });
  });

  // ---------------- PARTAGE UNIVERSEL ----------------
  // Ampiasain'ny "Inviter des amis" sy ny bokotra "↗️ Partager" isaky ny post ao
  // amin'ny Accueil : feuille native amin'ny telefaonina, menu lien raha tsy misy.
  function appShareLink(){
    return lienInvitationEntier() || publicBaseUrl();
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
      navigator.share({ title: (opts && opts.title) || 'Ny asako', text: text, url: link })
        .catch(function(){ openShareMenu(text, link); });
      return;
    }
    openShareMenu(text, link);
  }



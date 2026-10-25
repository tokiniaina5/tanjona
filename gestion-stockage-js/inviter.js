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

  function setupInviteLink(){
    // « /confirmation » : le mot se lit dans le lien lui-même. Seulement sur
    // Netlify, qui sait servir cette adresse (_redirects) ; une adresse
    // publique réglée ailleurs garde la racine.
    const base = publicBaseUrl();
    const chemin = /^https:\/\/ny-asako\.netlify\.app\/$/i.test(base) ? 'confirmation' : '';
    const link = base + chemin + '?invite=1';
    document.getElementById('inviteLink').value = link;
    renderLocalLinkWarning(link);
  }

  // « Copier tout » : rassemble tous les liens de l'application (invitation,
  // Live, appel vidéo, appel audio) en un seul texte prêt à être partagé.
  // Un seul lien, « confirmation » : celui qui l'ouvre y trouve les boutons
  // (entrer, Live direct, antso video, antso audio — live.js). Quatre longues
  // adresses dans un message ne se lisaient pas.
  function allShareLinksText(){
    const lien = typeof confirmationLink === 'function'
      ? confirmationLink() : document.getElementById('inviteLink').value;
    return 'Ny asako\n\n' +
      'Tsindrio ny rohy confirmation : ao ianao no misafidy, hiditra ao amin\'ny Ny asako, ' +
      'hijery ny Live direct, na hanao antso video na audio.\n\n' +
      'Confirmation : ' + lien;
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
    const link = document.getElementById('inviteLink').value;
    const subject = encodeURIComponent('Confirmer ton invitation — Ny asako');
    const body = encodeURIComponent('Salut,\n\nJe t\'invite à rejoindre Ny asako. Clique sur le lien de confirmation pour confirmer ton inscription.\n\nConfirmation : ' + link + '\n\nÀ bientôt !');
    window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
  });

  // ---------------- PARTAGE RÉSEAUX SOCIAUX ----------------
  // Comme le lien de l'employé (equipe.js) : on demande de confirmer, et le
  // lien vient juste après « Confirmer ».
  function inviteMessage(link){
    // Sans émoji : le ✅ arrivait en « � » dans WhatsApp.
    return 'Salut ! Je t\'invite à rejoindre Ny asako. Clique sur le lien de confirmation pour confirmer ton inscription.\n\nConfirmation : ' + link;
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
    function lien(){ return document.getElementById('inviteLink').value; }
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
      { label: 'WhatsApp', color: '#25D366', ok: !!(channels.whatsapp || '').replace(/[^\d]/g, ''), run: function(){
        window.open('https://wa.me/?text=' + encodeURIComponent(inviteMessage(lien())), '_blank'); } },
      { label: 'Facebook', color: '#1877F2', ok: !!profil('facebook'), run: function(){
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(lien()), '_blank'); } },
      { label: 'TikTok', color: '#e7e9ea', ok: !!profil('tiktok'), run: function(){ copier('TikTok', profil('tiktok'))(); } },
      { label: 'Threads', color: '#e7e9ea', ok: !!profil('threads'), run: function(){
        window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(inviteMessage(lien())), '_blank'); } },
      { label: 'X (Twitter)', color: '#e7e9ea', ok: !!profil('twitter'), run: function(){
        window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(inviteMessage(lien())) + '&url=' + encodeURIComponent(lien()), '_blank'); } },
      { label: 'Instagram', color: '#E1306C', ok: !!profil('instagram'), run: function(){ copier('Instagram', profil('instagram'))(); } },
      { label: 'WeChat', color: '#07C160', ok: !!(channels.wechat || '').trim(), run: copier('WeChat') }
    ];
    (extra || []).forEach(function(item){
      if(!item || !item.name) return;
      const value = (item.url || '').trim();
      const propre = (/^https?:\/\//i.test(value) && typeof adresseDeProfil === 'function') ? adresseDeProfil('', value) : null;
      reseaux.push({ label: item.name, color: 'var(--cyan)', ok: true,
        run: copier(item.name, (propre && !/\s/.test(propre)) ? propre : null) });
    });
    reseaux.forEach(function(r){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.style.borderColor = r.color;
      btn.style.color = r.color;
      btn.textContent = r.label;
      if(r.ok){
        btn.addEventListener('click', r.run);
      } else {
        btn.style.opacity = '0.4';
        btn.title = r.label + ' : mbola tsy misy rohy — 🔗 Ajouter les liens';
        btn.addEventListener('click', allerAuxLiens);
      }
      row.appendChild(btn);
    });
    const ajouter = document.createElement('button');
    ajouter.type = 'button';
    ajouter.className = 'btn btn-amber';
    ajouter.textContent = '🔗 Ajouter les liens';
    ajouter.addEventListener('click', allerAuxLiens);
    row.appendChild(ajouter);
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
      navigator.share({ title: (opts && opts.title) || 'Ny asako', text: text, url: link })
        .catch(function(){ openShareMenu(text, link); });
      return;
    }
    openShareMenu(text, link);
  }



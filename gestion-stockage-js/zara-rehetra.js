// ============================================================
// Partager une annonce à tous les clients, et non cinq par cinq
//
// La feuille de partage du téléphone ouvre WhatsApp, et WhatsApp décide
// ensuite : sa fenêtre « Envoyer à » coche les destinataires un par un et en
// limite le nombre. Cette fenêtre-là ne nous appartient pas — aucun code du
// site ne la commande, et rien ici ne peut y ajouter un « tout cocher ».
//
// Ce qui nous appartient, c'est la liste : les clients inscrits (table
// client_signups) avec leur numéro, et les réseaux. On coche tout d'un
// bouton, sans plafond, puis chaque envoi s'ouvre à son tour, le message
// déjà écrit. Il reste à appuyer sur « Envoyer » dans l'application —
// envoyer à la place de quelqu'un ne se fait pas depuis une page web.
//
// Deux façons d'ouvrir, parce qu'une seule ne suffit pas :
//
//   — le bouton les tente TOUTES d'un appui. C'est ce qu'on veut, et ça
//     marche quand les « pop-up » sont autorisées pour le site. Sinon le
//     navigateur n'en laisse passer qu'une — la première — et refuse le
//     reste : une fenêtre qu'un script demande n'est pas une fenêtre qu'on
//     a demandée.
//
//   — chaque ligne de la liste EST un lien. Touché du doigt, il ouvre son
//     onglet et rien ne le refuse jamais : ce n'est plus un script qui
//     demande, c'est la personne qui clique. Neuf appuis au lieu d'un, mais
//     neuf qui passent.
//
// Ce qui n'a pas pu s'ouvrir reste coché et se voit : on le touche, ou bien
// on autorise les « pop-up » et on retente le tout d'un appui.
//
// L'email fait exception et garde son appui à lui : il part du serveur, chez
// tous les clients, et ne se rattrape pas. On ne le glisse pas dans un envoi
// groupé, où il partirait sans qu'on y pense.
//
// Deux natures d'envoi, et il vaut mieux le savoir avant :
//   — WhatsApp par numéro (wa.me/<numéro>) va à UNE personne, la file en fait
//     donc le tour ;
//   — Facebook, Telegram, Threads, X publient UNE fois, pour tout le monde :
//     ils n'ont pas d'adresse par personne. Les cocher n'envoie pas à chaque
//     client, cela publie.
//   — Instagram, TikTok, WeChat n'offrent aucune adresse qui écrive le
//     message d'avance : on le copie, l'application s'ouvre, on colle.
//
// Telegram, Facebook (Page), Threads et X peuvent aussi partir TOUT SEULS :
// quand leurs clefs sont posées côté serveur (fonction « tambajotra »), ils
// sont marqués « ⚡ ho azy » et publiés par le serveur au lieu d'ouvrir une
// fenêtre. Sans clefs, ils restent à la main, comme avant.
//
// wa.me et les autres liens ne portent que du texte. Une annonce avec photo
// part donc sans sa photo ; le lien, lui, la montre. C'est écrit dans la
// fenêtre pour qu'on ne le découvre pas après coup.
// ============================================================
(function () {
  'use strict';

  function echap(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // wa.me n'accepte qu'un numéro international. « 0343705834 » devient
  // « 261343705834 » (contact.js fait de même).
  function numeroInternational(brut) {
    var d = String(brut || '').replace(/[^\d]/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 10 && d.charAt(0) === '0') d = '261' + d.slice(1);
    return d;
  }

  // La feuille de partage du téléphone. Sur ordinateur, navigator.share
  // existe parfois (Windows, Chrome) mais n'y propose ni Instagram ni TikTok :
  // on ne la prend que sur un appareil tactile.
  function partageDirect() {
    var tactile = false;
    try { tactile = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    return tactile && typeof navigator.share === 'function';
  }

  function copier(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texte).catch(function () {});
    }
  }

  // Les mêmes réseaux que le menu « ↗️ Partager » (inviter.js), Telegram en
  // plus. « copie » : pas d'adresse qui écrive le message, on colle soi-même.
  var RESEAUX = [
    { cle: 'whatsapp', nom: 'WhatsApp (groupe/status)', couleur: '#25D366', url: function (t, l) {
      return 'https://wa.me/?text=' + encodeURIComponent(t + '\n' + l); } },
    // La page de Telegram montre le message, puis son bouton « Share » pointe
    // sur « tg://msg_url » — l'application, et elle seule. Sans elle installée,
    // rien ne répond à cette adresse et le bouton ne fait rien. Aucune adresse
    // ne contourne cela : on le dit, et le message est dans le presse-papier.
    { cle: 'telegram', nom: 'Telegram', couleur: '#29A9EB',
      remarque: 'mila ny application Telegram — raha tsy izany, apetaho ny hafatra voadika',
      url: function (t, l) {
        return 'https://t.me/share/url?url=' + encodeURIComponent(l) + '&text=' + encodeURIComponent(t); } },
    { cle: 'facebook', nom: 'Facebook', couleur: '#1877F2', url: function (t, l) {
      return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(l); } },
    { cle: 'threads', nom: 'Threads', couleur: '#e7e9ea', url: function (t, l) {
      return 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t + '\n' + l); } },
    { cle: 'x', nom: 'X (Twitter)', couleur: '#e7e9ea', url: function (t, l) {
      return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(t) + '&url=' + encodeURIComponent(l); } },
    // Ces trois-là n'ont AUCUNE adresse qui écrive le message d'avance — pas
    // même une page de partage comme Telegram. Instagram demande en plus une
    // image : un texte seul n'y fait pas une publication. On ouvre, on colle.
    { cle: 'instagram', nom: 'Instagram', couleur: '#E1306C', copie: true, ouvrir: 'https://www.instagram.com/',
      remarque: 'tsy mandray hafatra avy ety — apetaho (Ctrl+V) ny hafatra voadika, ary mila sary ny Instagram' },
    { cle: 'tiktok', nom: 'TikTok', couleur: '#e7e9ea', copie: true, ouvrir: 'https://www.tiktok.com/',
      remarque: 'tsy mandray hafatra avy ety — apetaho (Ctrl+V) ny hafatra voadika' },
    { cle: 'wechat', nom: 'WeChat', couleur: '#07C160', copie: true,
      remarque: 'tsy misy pejy hosokafana — apetaho (Ctrl+V) ny hafatra voadika ao amin\'ny WeChat' }
  ];

  function lireLesClients() {
    var sb = window.__sb;
    if (!sb) return Promise.resolve([]);
    return sb.from('client_signups').select('name,email,phone,created_at')
      .order('created_at', { ascending: false })
      .then(function (res) {
        var lignes = (res && !res.error && res.data) || [];
        // Un même numéro inscrit deux fois ne fait qu'un destinataire : on
        // garde le plus récent, qui porte le nom le plus à jour.
        var vus = {};
        var vusMail = {};
        var gardes = [];
        var mails = 0;
        lignes.forEach(function (c) {
          var mail = String(c.email || '').trim().toLowerCase();
          if (mail.indexOf('@') > 0 && !vusMail[mail]) { vusMail[mail] = 1; mails++; }
          var num = numeroInternational(c.phone);
          if (!num || vus[num]) return;
          vus[num] = 1;
          gardes.push({ nom: String(c.name || '').trim() || c.email || num, numero: num });
        });
        return { clients: gardes, mails: mails };
      }, function () { return { clients: [], mails: 0 }; });
  }

  window.__zaraoAminyRehetra = function (opts) {
    var texte = String((opts && opts.texte) || '').trim();
    var rohy = String((opts && opts.rohy) || '').trim();
    var hafatra = (texte + (rohy ? '\n' + rohy : '')).trim();

    var ancien = document.getElementById('zaraRehetra');
    if (ancien) ancien.remove();

    var page = document.createElement('div');
    page.id = 'zaraRehetra';
    page.setAttribute('role', 'dialog');
    page.style.cssText = 'position:fixed; inset:0; z-index:9400; background:var(--bg); color:var(--text); overflow-y:auto;';
    page.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; ' +
        'padding:0.9rem 1rem; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0;">' +
        '<strong style="font-size:0.95rem;">📢 Zarao amin\'ny rehetra</strong>' +
        '<button type="button" class="btn btn-sm" data-hidio style="width:auto;">Hanafoana</button>' +
      '</div>' +
      '<div style="max-width:760px; margin:0 auto; padding:1.2rem 16px 3rem;">' +
        // Tout d'un coup : les clients et les réseaux ensemble.
        '<div class="panel" style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap;">' +
          '<label style="display:flex; align-items:center; gap:0.55rem; font-size:0.9rem; cursor:pointer;">' +
            '<input type="checkbox" data-tout checked> <strong>Marika daholo</strong>' +
          '</label>' +
          '<span data-somary style="font-size:0.78rem; color:var(--muted);"></span>' +
        '</div>' +

        // 1) Les clients, un par un : c'est le seul envoi qui s'adresse à
        //    quelqu'un en particulier.
        '<div class="panel">' +
          '<h3>👥 Client tsirairay (WhatsApp) <span data-wa-auto style="display:none; color:var(--cyan); font-size:0.8rem;">⚡ ho azy</span></h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ireto ny client rehetra manana nomerao — <strong style="color:var(--text);">tsy misy fetra ny isa</strong>. ' +
            '<span data-wa-tanana>Hisokatra tsirairay ny resaka, feno ny hafatra ; ianao no manindry « Envoyer » ao.</span>' +
            '<span data-wa-ho-azy style="display:none;">Ny serveur no mandefa ny hafatra any amin\'ny client voamarika tsirairay, ' +
              'tsy misy tsindriana (WhatsApp Business).</span>' +
          '</p>' +
          '<div class="field">' +
            '<label for="zrSivana">Tadiavo</label>' +
            '<input type="text" id="zrSivana" data-sivana placeholder="Anarana na nomerao" autocomplete="off">' +
          '</div>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap; ' +
            'padding:0.5rem 0; border-bottom:1px solid var(--line); margin-bottom:0.4rem;">' +
            '<label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; cursor:pointer;">' +
              '<input type="checkbox" data-daholo> <strong>Marika ny client rehetra</strong></label>' +
            '<span data-isa style="font-size:0.78rem; color:var(--muted);"></span>' +
          '</div>' +
          '<div data-liste style="max-height:40vh; overflow-y:auto;"></div>' +
          '<p class="empty-hint" data-vide style="display:none;">Mbola tsy misy client manana nomerao.</p>' +
          '<p data-wa-statut style="font-size:0.78rem; color:var(--muted); margin:0.6rem 0 0; line-height:1.6;"></p>' +
        '</div>' +

        // 2) Les réseaux : une publication, et non un envoi par client.
        '<div class="panel">' +
          '<h3>🌐 Tambajotra</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ireto dia <strong style="color:var(--text);">indray mandeha ihany</strong> : mamoaka ho hitan\'ny olona rehetra izy, ' +
            'fa tsy mandefa isaky ny client. Ireo misy <strong style="color:var(--text);">⚡ ho azy</strong> dia ' +
            'ny serveur no mamoaka azy, tsy misy tsindriana. Ny Instagram, TikTok ary WeChat tsy mandray hafatra ' +
            'voasoratra mialoha : adika ny hafatra, dia apetakao ao.' +
          '</p>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap; ' +
            'padding:0.5rem 0; border-bottom:1px solid var(--line); margin-bottom:0.4rem;">' +
            '<label style="display:flex; align-items:center; gap:0.5rem; font-size:0.84rem; cursor:pointer;">' +
              '<input type="checkbox" data-reseaux-daholo> <strong>Marika ny tambajotra rehetra</strong></label>' +
            '<span data-reseaux-isa style="font-size:0.78rem; color:var(--muted);"></span>' +
          '</div>' +
          '<div data-reseaux></div>' +
          '<p data-auto-statut style="font-size:0.78rem; color:var(--muted); margin:0.6rem 0 0; line-height:1.6;"></p>' +
        '</div>' +

        // 3) L'email : le seul qui parte vraiment, sans que personne
    //    n'appuie sur « Envoyer » à l'autre bout.
        '<div class="panel">' +
          '<h3>📧 Mailaka</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Ity irery no <strong style="color:var(--text);">tena mandeha any amin\'ny client</strong> : ' +
            'ny serveur no mandefa azy, ka mahazo ny hafatra ao anaty boaty mailaka izy ireo, tsy misy tsindriana. ' +
            'Miafina ny adiresy : tsy mifampahita ny client.' +
          '</p>' +
          '<label class="list-row" style="cursor:pointer;">' +
            '<span style="display:flex; align-items:center; gap:0.6rem;">' +
              '<input type="checkbox" data-mailaka checked> <strong>Alefa amin\'ny client rehetra manana email</strong></span>' +
            '<span data-mailaka-isa style="color:var(--muted); font-size:0.74rem; white-space:nowrap;"></span>' +
          '</label>' +
        '</div>' +

        // 4) Le soir : tout ce qui a paru dans la journée part tout seul par
        //    email et sur les réseaux prêts, à l'heure choisie ici, entre les
        //    deux dates s'il y en a (fonction « fandefasana-hariva », tâche
        //    qui passe chaque minute et ne part qu'une fois par jour).
        '<div class="panel">' +
          '<h3>⏰ Fandefasana ho azy</h3>' +
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.9rem;">' +
            'Amin\'ny ora voafidy eto, ny publication rehetra nivoaka androany ao amin\'ny Botika dia ' +
            '<strong style="color:var(--text);">alefa ho azy amin\'ny mailaka</strong> any amin\'ny client rehetra ' +
            '(sy amin\'ireo tambajotra ⚡), tsy misy tsindriana. Raha misy daty, ao anatin\'io fotoana io ihany ' +
            'no mandeha ; raha foana, tsy misy fetra. Raha esorina ny ora, tsy misy alefa ho azy.' +
          '</p>' +
          '<div style="display:flex; gap:0.8rem; flex-wrap:wrap; align-items:flex-end;">' +
            '<div class="field" style="margin:0;"><label for="zrOra">Ora sy minitra</label>' +
              '<input type="time" id="zrOra" data-hariva-ora step="60" style="width:auto;"></div>' +
            '<div class="field" style="margin:0;"><label for="zrManomboka">Manomboka ny</label>' +
              '<input type="date" id="zrManomboka" data-hariva-manomboka style="width:auto;"></div>' +
            '<div class="field" style="margin:0;"><label for="zrHatramin">Hatramin\'ny</label>' +
              '<input type="date" id="zrHatramin" data-hariva-hatramin style="width:auto;"></div>' +
            '<button type="button" class="btn btn-sm" data-hariva-tehirizo style="width:auto;">💾 Tehirizo</button>' +
            '<button type="button" class="btn btn-sm" data-hariva-esory style="width:auto;">✕ Esory ny ora</button>' +
          '</div>' +
          '<p data-hariva-statut style="font-size:0.78rem; color:var(--muted); margin:0.6rem 0 0; min-height:1.1em;">Mamaky…</p>' +
          // Le carnet : à qui sont partis les derniers envois.
          '<h3 style="font-size:0.9rem; margin-top:1rem;">📋 Lasa tany amin\'iza ?</h3>' +
          '<p style="font-size:0.74rem; color:var(--muted); margin:0 0 0.5rem;">Ahodino ankavia na ankavanana ny andalana raha hamafa azy.</p>' +
          '<div data-hariva-tantara style="font-size:0.78rem; color:var(--muted); line-height:1.6;">Mamaky…</div>' +
        '</div>' +

        '<button type="button" class="btn btn-primary" data-alefa>📨 Alefa</button>' +

        // La file : un envoi à la fois, un appui par envoi.
        '<div class="panel" data-file style="display:none;">' +
          '<h3 data-file-titre>Fandefasana</h3>' +
          '<p data-file-qui style="font-size:0.9rem; margin:0 0 0.9rem;"></p>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-primary btn-sm" data-sokafy style="width:auto;">📨 Sokafy</button>' +
            '<button type="button" class="btn btn-sm" data-rehetra style="width:auto;">☑ Rehetra</button>' +
            '<button type="button" class="btn btn-sm" data-ajanona style="width:auto;">✖ Ajanony</button>' +
          '</div>' +
          '<p data-file-vita style="font-size:0.78rem; color:var(--muted); margin:0.9rem 0 0;"></p>' +
          '<p style="font-size:0.74rem; color:var(--muted); margin:0.5rem 0 0; line-height:1.5;">' +
            'Ny bokotra manokatra izay voamarika rehetra miaraka. Raha misy tsy nisokatra, ' +
            '<strong>tsindrio ny anarany eo ambany</strong> : rohy izy ireo, tsy sakanan\'ny navigateur mihitsy. ' +
            'Voadika ny hafatra isaky ny misokatra : raha tsy tonga izy ao amin\'ny application, ' +
            '<strong>apetaho</strong> fotsiny.' +
          '</p>' +
          // Tout ce qui a été coché reste écrit : on voit d'où l'on vient,
          // où l'on est, et ce qui attend encore — et chaque ligne se décoche,
          // d'avance, autant qu'on veut.
          '<div data-file-liste style="max-height:34vh; overflow-y:auto; margin-top:0.9rem; ' +
            'border-top:1px solid var(--line); padding-top:0.5rem;"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(page);

    var fermer = function () { page.remove(); };
    page.querySelector('[data-hidio]').addEventListener('click', fermer);

    // L'heure et les dates de la tâche du soir.
    var bTehirizo = page.querySelector('[data-hariva-tehirizo]');
    var bEsory = page.querySelector('[data-hariva-esory]');
    var champOra = page.querySelector('[data-hariva-ora]');
    var champManomboka = page.querySelector('[data-hariva-manomboka]');
    var champHatramin = page.querySelector('[data-hariva-hatramin]');
    var statutHariva = page.querySelector('[data-hariva-statut]');
    var boiteTantara = page.querySelector('[data-hariva-tantara]');

    function echapper(t) {
      return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function listeClients(liste) {
      return (liste || []).map(function (c) {
        return '<div style="padding:0.15rem 0;">' +
          (c.name ? '<strong style="color:var(--text);">' + echapper(c.name) + '</strong> · ' : '') +
          echapper(c.email) + '</div>';
      }).join('');
    }
    // Chaque envoi, le plus récent d'abord, et sous lui la liste des clients.
    function afficherTantara(lignes) {
      if (!lignes.length) {
        boiteTantara.textContent = 'Mbola tsy nisy fandefasana voarakitra.';
        return;
      }
      boiteTantara.innerHTML = lignes.map(function (l, i) {
        var voaray = l.voaray || [];
        var tsy = l.tsy_lasa || [];
        return '<details data-tantara-id="' + echapper(l.id) + '" ' +
            'style="border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.7rem; margin-bottom:0.5rem;"' +
            (i === 0 ? ' open' : '') + '>' +
          '<summary style="cursor:pointer; color:var(--text);">' +
            new Date(l.created_at).toLocaleString('fr-FR') + ' · ' +
            (l.loharano === 'hariva' ? '⏰ ho azy' : '📧 bokotra') + ' · ' +
            'publication ' + (l.billets || 0) + ' · <strong>client ' + voaray.length + '</strong>' +
            (tsy.length ? ' · <span style="color:var(--amber);">tsy lasa ' + tsy.length + '</span>' : '') +
          '</summary>' +
          '<div style="margin-top:0.4rem; max-height:30vh; overflow-y:auto;">' +
            (l.tambajotra && Object.keys(l.tambajotra).length
              ? '<div style="margin-bottom:0.4rem;">' + Object.keys(l.tambajotra).map(function (k) {
                  var r = l.tambajotra[k] || {};
                  return (r.ok ? '✅ ' : '⚠ ') + echapper(k) + (r.ok ? '' : ' (' + echapper(r.detail) + ')');
                }).join(' · ') + '</div>'
              : '') +
            (voaray.length ? listeClients(voaray) : 'Tsy nisy client.') +
            (tsy.length ? '<div style="color:var(--amber); margin-top:0.4rem;">Tsy lasa' +
              (l.fahadisoana ? ' (' + echapper(l.fahadisoana) + ')' : '') + ' :</div>' + listeClients(tsy) : '') +
          '</div>' +
        '</details>';
      }).join('');
      Array.prototype.forEach.call(boiteTantara.querySelectorAll('[data-tantara-id]'), glisserPourFafana);
    }

    // Une ligne du carnet glissée à gauche ou à droite au-delà d'un tiers de
    // sa largeur est effacée pour de bon ; si le serveur refuse, elle revient.
    function glisserPourFafana(el) {
      el.style.touchAction = 'pan-y';
      el.title = 'Ahodino ankavia na ankavanana raha hamafa';
      var depart = null, glisse = false, dx = 0, avalerClic = false;
      function remettre() {
        el.style.transition = 'transform 0.2s, opacity 0.2s';
        el.style.transform = '';
        el.style.opacity = '';
      }
      function debut(x, y) { depart = { x: x, y: y }; glisse = false; dx = 0; }
      function bouge(x, y) {
        if (!depart) return false;
        dx = x - depart.x;
        var dy = y - depart.y;
        if (!glisse) {
          // Plus vertical qu'horizontal : c'est la liste qui défile.
          if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { depart = null; return false; }
          if (Math.abs(dx) < 12) return false;
          glisse = true;
          el.style.transition = 'none';
        }
        el.style.transform = 'translateX(' + dx + 'px)';
        el.style.opacity = String(Math.max(1 - Math.abs(dx) / (el.offsetWidth || 1), 0.25));
        return true;
      }
      function fin() {
        if (!depart) return;
        depart = null;
        if (!glisse) return;
        glisse = false;
        avalerClic = true;
        setTimeout(function () { avalerClic = false; }, 50);
        if (Math.abs(dx) < (el.offsetWidth || 1) * 0.35) { remettre(); return; }
        el.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
        el.style.transform = 'translateX(' + (dx < 0 ? -1 : 1) * (el.offsetWidth + 40) + 'px)';
        el.style.opacity = '0';
        appelerHariva({ action: 'fafao', id: el.getAttribute('data-tantara-id') }).then(function () {
          setTimeout(function () {
            el.remove();
            if (!boiteTantara.querySelector('[data-tantara-id]')) boiteTantara.textContent = 'Mbola tsy nisy fandefasana voarakitra.';
          }, 230);
        }, function (e) {
          remettre();
          alert('Tsy voafafa : ' + e.message);
        });
      }
      // Un glissement ne doit pas aussi ouvrir ou fermer la ligne.
      el.addEventListener('click', function (e) { if (avalerClic) { e.preventDefault(); e.stopPropagation(); } }, true);
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });
      el.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) { depart = null; remettre(); return; }
        debut(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      el.addEventListener('touchmove', function (e) {
        if (!depart) return;
        if (bouge(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchend', fin);
      el.addEventListener('touchcancel', function () { depart = null; glisse = false; remettre(); });
      el.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        debut(e.clientX, e.clientY);
        function suivre(ev) { if (bouge(ev.clientX, ev.clientY)) ev.preventDefault(); }
        function lacher() {
          document.removeEventListener('mousemove', suivre);
          document.removeEventListener('mouseup', lacher);
          fin();
        }
        document.addEventListener('mousemove', suivre);
        document.addEventListener('mouseup', lacher);
      });
    }
    function chargerTantara() {
      if (!window.__sb || !window.__sb.functions) { boiteTantara.textContent = 'Tsy tafiditra ny serveur.'; return; }
      window.__sb.functions.invoke('fandefasana-hariva', { body: { action: 'tantara' } }).then(function (res) {
        var d = (res && res.data) || {};
        if (d.tantara) { afficherTantara(d.tantara); return; }
        var ctx = res && res.error && res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          ctx.json().then(function (b) { boiteTantara.textContent = (b && b.error) || 'Tsy voavaky ny tantara.'; },
            function () { boiteTantara.textContent = 'Tsy voavaky ny tantara.'; });
        } else {
          boiteTantara.textContent = d.error || 'Tsy voavaky ny tantara.';
        }
      }, function () { boiteTantara.textContent = 'Tsy tratra ny serveur.'; });
    }
    chargerTantara();
    // Appelle la fonction du soir ; rend ses données, ou le message d'erreur
    // qu'elle a renvoyé (dans le corps de la réponse, pas dans res.error).
    function appelerHariva(corps) {
      return window.__sb.functions.invoke('fandefasana-hariva', { body: corps }).then(function (res) {
        var d = (res && res.data) || null;
        if (d && !d.error) return d;
        var ctx = res && res.error && res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(function (b) { throw new Error((b && b.error) || 'antony tsy fantatra'); },
            function () { throw new Error((res.error && res.error.message) || 'antony tsy fantatra'); });
        }
        throw new Error((d && d.error) || (res && res.error && res.error.message) || 'antony tsy fantatra');
      });
    }
    function dateFr(iso) {
      return iso ? iso.split('-').reverse().join('/') : '';
    }
    // Ce que la tâche fera, dit en une phrase.
    function direFikirana(f) {
      var fetra = f.manomboka && f.hatramin ? ', ' + dateFr(f.manomboka) + ' hatramin\'ny ' + dateFr(f.hatramin)
        : f.manomboka ? ', manomboka ny ' + dateFr(f.manomboka)
        : f.hatramin ? ', hatramin\'ny ' + dateFr(f.hatramin)
        : ', tsy misy fetra';
      if (!f.ora) {
        statutHariva.innerHTML = '⏸ Tsy misy ora : <strong style="color:var(--text);">tsy misy alefa ho azy</strong>.' +
          (f.farany_nalefa ? ' Farany : ' + echapper(dateFr(f.farany_nalefa)) + '.' : '');
        return;
      }
      var androany = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
      var lany = f.hatramin && f.hatramin < androany;
      statutHariva.innerHTML = (lany ? '<span style="color:var(--amber);">⚠ Lany ny daty : tsy mandeha intsony.</span> ' : '✓ ') +
        'Isak\'andro amin\'ny <strong style="color:var(--text);">' + echapper(f.ora) + '</strong>' + echapper(fetra) + '.' +
        (f.farany_nalefa ? ' Farany : ' + echapper(dateFr(f.farany_nalefa)) + '.' : '');
    }
    function chargerFikirana() {
      if (!window.__sb || !window.__sb.functions) { statutHariva.textContent = 'Tsy tafiditra ny serveur.'; return; }
      appelerHariva({ action: 'fikirana' }).then(function (d) {
        var f = d.fikirana || {};
        champOra.value = f.ora || '';
        champManomboka.value = f.manomboka || '';
        champHatramin.value = f.hatramin || '';
        direFikirana(f);
      }, function (e) { statutHariva.textContent = 'Tsy voavaky ny ora : ' + e.message; });
    }
    chargerFikirana();
    // Une heure vide : plus rien ne part tout seul.
    function tehirizo() {
      if (!window.__sb || !window.__sb.functions) { statutHariva.textContent = 'Tsy tafiditra ny serveur.'; return; }
      var ora = String(champOra.value || '').slice(0, 5) || null;
      if (ora && !/^\d{2}:\d{2}$/.test(ora)) { statutHariva.textContent = 'Fidio ny ora sy ny minitra.'; return; }
      var manomboka = champManomboka.value || null;
      var hatramin = champHatramin.value || null;
      if (manomboka && hatramin && hatramin < manomboka) {
        statutHariva.textContent = 'Tsy maintsy aorian\'ny « Manomboka » ny « Hatramin\'ny ».';
        return;
      }
      bTehirizo.disabled = bEsory.disabled = true;
      statutHariva.textContent = 'Mitahiry…';
      appelerHariva({ action: 'tehirizo', ora: ora, manomboka: manomboka, hatramin: hatramin }).then(function (d) {
        bTehirizo.disabled = bEsory.disabled = false;
        direFikirana(d.fikirana || { ora: ora, manomboka: manomboka, hatramin: hatramin });
      }, function (e) {
        bTehirizo.disabled = bEsory.disabled = false;
        statutHariva.textContent = 'Tsy voatahiry : ' + e.message;
      });
    }
    bTehirizo.addEventListener('click', tehirizo);
    bEsory.addEventListener('click', function () { champOra.value = ''; tehirizo(); });

    var boite = page.querySelector('[data-liste]');
    var vide = page.querySelector('[data-vide]');
    var isa = page.querySelector('[data-isa]');
    var daholo = page.querySelector('[data-daholo]');
    var sivana = page.querySelector('[data-sivana]');
    var boiteR = page.querySelector('[data-reseaux]');
    var isaR = page.querySelector('[data-reseaux-isa]');
    var daholoR = page.querySelector('[data-reseaux-daholo]');
    var tout = page.querySelector('[data-tout]');
    var somary = page.querySelector('[data-somary]');

    var clients = [];
    var mailaka = page.querySelector('[data-mailaka]');
    var mailakaIsa = page.querySelector('[data-mailaka-isa]');
    var reseaux = RESEAUX.map(function (r) {
      var copie = {};
      Object.keys(r).forEach(function (k) { copie[k] = r[k]; });
      copie.coche = true;
      return copie;
    });

    function visibles() {
      var q = String(sivana.value || '').trim().toLowerCase();
      return clients.filter(function (c) {
        if (!q) return true;
        return (c.nom + ' ' + c.numero).toLowerCase().indexOf(q) >= 0;
      });
    }
    function cochesC() { return clients.filter(function (c) { return c.coche; }); }
    function cochesR() { return reseaux.filter(function (r) { return r.coche; }); }

    function direLIsa() {
      isa.textContent = cochesC().length + ' / ' + clients.length + ' voamarika';
      isaR.textContent = cochesR().length + ' / ' + reseaux.length + ' voamarika';
      var vus = visibles();
      daholo.checked = vus.length > 0 && vus.every(function (c) { return c.coche; });
      daholoR.checked = reseaux.every(function (r) { return r.coche; });
      tout.checked = daholoR.checked && mailaka.checked &&
        (clients.length === 0 || clients.every(function (c) { return c.coche; }));
      somary.textContent = cochesC().length + ' client + ' + cochesR().length + ' tambajotra' +
        (mailaka.checked ? ' + mailaka' : '');
    }

    function dessiner() {
      boite.innerHTML = visibles().map(function (c) {
        return '<label class="list-row" style="cursor:pointer;">' +
          '<span style="display:flex; align-items:center; gap:0.6rem;">' +
            '<input type="checkbox" data-i="' + clients.indexOf(c) + '"' + (c.coche ? ' checked' : '') + '>' +
            '<span>' + echap(c.nom) + '</span></span>' +
          '<span style="color:var(--muted); white-space:nowrap;">+' + echap(c.numero) + '</span>' +
        '</label>';
      }).join('');
      boite.querySelectorAll('input[type="checkbox"]').forEach(function (b) {
        b.addEventListener('change', function () {
          clients[Number(b.dataset.i)].coche = b.checked;
          direLIsa();
        });
      });
      direLIsa();
    }

    function dessinerReseaux() {
      boiteR.innerHTML = reseaux.map(function (r, i) {
        return '<label class="list-row" style="cursor:pointer;">' +
          '<span style="display:flex; align-items:center; gap:0.6rem;">' +
            '<input type="checkbox" data-r="' + i + '"' + (r.coche ? ' checked' : '') + '>' +
            '<span style="color:' + r.couleur + ';">' + echap(r.nom) + '</span></span>' +
          '<span style="color:var(--muted); font-size:0.74rem; white-space:nowrap;">' +
            (r.auto ? '<span style="color:var(--cyan);">⚡ ho azy</span>' : (r.copie ? 'adika ny hafatra' : 'indray mandeha')) + '</span>' +
        '</label>';
      }).join('');
      boiteR.querySelectorAll('input[type="checkbox"]').forEach(function (b) {
        b.addEventListener('change', function () {
          reseaux[Number(b.dataset.r)].coche = b.checked;
          direLIsa();
        });
      });
      direLIsa();
    }

    // « Marika daholo » ne coche que ce qu'on voit : une recherche en cours,
    // cocher tout le carnet à son insu serait une mauvaise surprise.
    daholo.addEventListener('change', function () {
      visibles().forEach(function (c) { c.coche = daholo.checked; });
      dessiner();
    });
    daholoR.addEventListener('change', function () {
      reseaux.forEach(function (r) { r.coche = daholoR.checked; });
      dessinerReseaux();
    });
    // Celui du haut prend les deux d'un seul geste : c'est ce qu'on veut
    // neuf fois sur dix, et c'est pour cela qu'il est en premier.
    tout.addEventListener('change', function () {
      clients.forEach(function (c) { c.coche = tout.checked; });
      reseaux.forEach(function (r) { r.coche = tout.checked; });
      mailaka.checked = tout.checked;
      dessiner();
      dessinerReseaux();
    });
    sivana.addEventListener('input', dessiner);
    mailaka.addEventListener('change', direLIsa);

    dessinerReseaux();
    var statutAuto = page.querySelector('[data-auto-statut]');
    if (window.__sb && window.__sb.functions) {
      window.__sb.functions.invoke('tambajotra', { body: { action: 'canaux' } }).then(function (res) {
        var c = (res && res.data && res.data.canaux) || {};
        reseaux.forEach(function (r) { r.auto = !!c[r.cle]; });
        dessinerReseaux();
        waAuto = !!c.whatsapp_client;
        page.querySelector('[data-wa-auto]').style.display = waAuto ? '' : 'none';
        page.querySelector('[data-wa-ho-azy]').style.display = waAuto ? '' : 'none';
        page.querySelector('[data-wa-tanana]').style.display = waAuto ? 'none' : '';
        // Une clef posée mais fausse : le dire tout de suite, pas après l'envoi.
        if (c.telegram) {
          window.__sb.functions.invoke('tambajotra', { body: { action: 'hamarino' } }).then(function (r) {
            var t = r && r.data && r.data.telegram;
            if (!t || statutAuto.textContent) return;
            statutAuto.innerHTML = t.ok ? '✅ Telegram vonona : ' + echap(t.detail)
              : '<span style="color:var(--amber);">⚠ Telegram tsy mandeha : ' + echap(t.detail) + '</span>';
          }, function () {});
        }
      }, function () { /* fonction absente : tout reste à la main */ });
    }

    // WhatsApp Business configuré côté serveur : les clients cochés reçoivent
    // le message sans que rien ne s'ouvre ici (_shared/whatsapp.ts).
    var waAuto = false;
    var statutWa = page.querySelector('[data-wa-statut]');
    function envoyerWhatsApp(liste) {
      statutWa.textContent = '⚡ Mandefa WhatsApp any amin\'ny client ' + liste.length + '…';
      window.__sb.functions.invoke('tambajotra', {
        body: { action: 'whatsapp', texte: texte, rohy: rohy, numeros: liste.map(function (c) { return c.numero; }) }
      }).then(function (res) {
        var w = res && res.data && res.data.whatsapp;
        if (!w) {
          statutWa.textContent = 'Tsy lasa : ' + ((res && res.data && res.data.error) || (res && res.error && res.error.message) || 'antony tsy fantatra');
          return;
        }
        statutWa.innerHTML = '✅ Lasa any amin\'ny client ' + w.lasa.length + ' / ' + liste.length +
          (w.tsy.length ? '<br><span style="color:var(--amber);">⚠ Tsy lasa ' + w.tsy.length + ' : ' +
            w.tsy.slice(0, 5).map(function (t) { return '+' + echap(t.numero) + ' (' + echap(t.detail) + ')'; }).join(', ') +
            '</span>' : '');
      }, function (err) {
        statutWa.textContent = 'Tsy tratra ny serveur : ' + ((err && err.message) || 'réseau');
      });
    }

    // Les réseaux « ⚡ ho azy » partent du serveur, d'un seul appel.
    var NOMS = { telegram: 'Telegram', facebook: 'Facebook', threads: 'Threads', x: 'X' };
    function publierAuto(liste) {
      statutAuto.textContent = '⚡ Mamoaka amin\'ny ' + liste.map(function (r) { return r.nom; }).join(', ') + '…';
      window.__sb.functions.invoke('tambajotra', {
        body: { action: 'alefa', texte: texte, rohy: rohy, reseaux: liste.map(function (r) { return r.cle; }) }
      }).then(function (res) {
        var v = (res && res.data && res.data.vokatra) || {};
        var lignes = Object.keys(v).map(function (k) {
          return (v[k].ok ? '✅ ' : '⚠ ') + (NOMS[k] || k) + (v[k].ok ? ' : lasa' : ' : ' + echap(v[k].detail));
        });
        statutAuto.innerHTML = lignes.length ? lignes.join('<br>') : 'Tsy nisy lasa.';
      }, function (err) {
        statutAuto.textContent = 'Tsy tratra ny serveur : ' + ((err && err.message) || 'réseau');
      });
    }

    lireLesClients().then(function (res) {
      mailakaIsa.textContent = res.mails + ' email';
      var liste = res.clients;
      clients = liste.map(function (c) { c.coche = true; return c; });
      vide.style.display = clients.length ? 'none' : '';
      dessiner();
    });

    // ---------- La file ----------
    var file = page.querySelector('[data-file]');
    var fileTitre = page.querySelector('[data-file-titre]');
    var fileQui = page.querySelector('[data-file-qui]');
    var fileVita = page.querySelector('[data-file-vita]');
    var fileListe = page.querySelector('[data-file-liste]');
    var bSokafy = page.querySelector('[data-sokafy]');
    var bRehetra = page.querySelector('[data-rehetra]');
    var bAjanona = page.querySelector('[data-ajanona]');
    var attente = [];
    var rang = 0;
    var nalefa = 0;

    // « Dinganina » sautait UNE ligne, et il fallait y revenir appui par appui
    // pour en sauter dix. Chaque ligne se décoche maintenant d'avance, et le
    // bouton en décoche ou en recoche le reste d'un coup.
    //
    // « rang » n'est donc plus un compteur qu'on avance : il se déduit de la
    // liste. Sans cela, décocher une ligne déjà dépassée laisserait la file
    // pointer à côté.
    function recalculerLeRang() {
      rang = attente.length;
      for (var i = 0; i < attente.length; i++) {
        if (attente[i].coche && !attente[i].fait) { rang = i; return; }
      }
    }
    function nbCoches() {
      return attente.filter(function (e) { return e.coche; }).length;
    }
    // Ce qui s'ouvre d'un seul appui : tout ce qui est coché, pas encore
    // parti, et qui n'est pas l'email.
    // Sur téléphone, Instagram, TikTok et WeChat n'en sont pas : chacun passe
    // par la feuille de partage, et elle ne s'ouvre qu'une fois par appui —
    // on les touche donc un par un, dans la liste.
    function aOuvrir() {
      var direct = partageDirect();
      return attente.filter(function (e) {
        return e.coche && !e.fait && !e.mail && !(direct && e.reseau && e.reseau.copie);
      });
    }
    function restants() {
      return attente.filter(function (e) { return !e.fait; });
    }
    // Le bouton dit ce qu'il fera : tout cocher s'il reste des lignes
    // décochées, tout décocher sinon. Il disparaît quand il n'y a plus rien
    // à cocher.
    function majBoutonRehetra() {
      var reste = restants();
      var tous = reste.length > 0 && reste.every(function (e) { return e.coche; });
      bRehetra.textContent = tous ? '☐ Tsy misy' : '☑ Rehetra';
      bRehetra.style.display = reste.length ? '' : 'none';
    }

    // Le nom d'un envoi, qu'il soit une personne, un réseau ou l'email.
    function nomDe(e) {
      if (e.client) return echap(e.client.nom) + ' · +' + echap(e.client.numero);
      if (e.mail) return '📧 Mailaka amin\'ny client rehetra';
      return echap(e.reseau.nom);
    }
    function couleurDe(e) {
      return e.reseau ? e.reseau.couleur : 'var(--text)';
    }
    // L'adresse qu'ouvre une ligne, ou rien du tout : l'email part du serveur,
    // et WeChat n'a pas de page où déposer le message — on le copie.
    function adresseDe(e) {
      if (e.mail) return '';
      if (e.client) return 'https://wa.me/' + e.client.numero + '?text=' + encodeURIComponent(hafatra);
      if (e.reseau.copie) return e.reseau.ouvrir || '';
      return e.reseau.url(texte, rohy);
    }
    // ✓ fait · — écarté · les autres attendent, et chacun se décoche. Une
    // ligne ouverte garde sa case : ce qui est parti ne se reprend pas.
    //
    // Pas de flèche sur « celle-ci » : depuis que chaque ligne s'ouvre d'un
    // doigt, il n'y a plus de tour à respecter. Désigner une ligne comme la
    // suivante laissait croire qu'il fallait commencer par elle.
    function dessinerLaFile() {
      fileListe.innerHTML = attente.map(function (e, i) {
        var ici = i === rang;
        var marque = e.fait ? '✓' : (e.coche ? '·' : '—');
        var style = 'color:' + couleurDe(e) + ';' + (ici ? ' font-weight:700;' : '') +
          (e.coche ? '' : ' text-decoration:line-through;');
        var adresse = adresseDe(e);
        // Le nom est un vrai lien quand il y a une adresse : c'est le doigt
        // qui l'ouvre, et rien ne refuse jamais cela. Sans adresse (l'email,
        // WeChat), un bouton, qui a la même allure.
        var nom = e.fait
          ? '<span style="' + style + '">' + nomDe(e) + '</span>'
          : (adresse
            ? '<a href="' + echap(adresse) + '" target="_blank" rel="noopener" data-lien ' +
              'style="' + style + ' text-decoration:none;">' + nomDe(e) + '</a>'
            : '<button type="button" data-lien style="' + style +
              ' background:none; border:none; padding:0; font:inherit; cursor:pointer; text-align:left;">' +
              nomDe(e) + '</button>');
        // Ce qu'il faut savoir avant de toucher la ligne, et non après.
        var texteRemarque = (!e.fait && e.reseau)
          ? ((e.reseau.copie && partageDirect())
            ? 'tsindrio : mandeha mivantana any amin\'ny application ny hafatra, tsy mila apetaka'
            : (e.reseau.remarque || ''))
          : '';
        var remarque = texteRemarque
          ? '<span style="color:var(--muted); font-size:0.7rem; display:block; line-height:1.4;">' +
            echap(texteRemarque) + '</span>'
          : '';
        return '<div class="list-row" data-i="' + i + '" style="' +
            (ici ? 'background:var(--panel-2); border-radius:8px;' : '') +
            (e.fait ? ' opacity:0.55;' : (e.coche ? '' : ' opacity:0.45;')) + '">' +
          '<span style="display:flex; align-items:center; gap:0.5rem; min-width:0;">' +
            '<input type="checkbox" data-ligne' + (e.coche ? ' checked' : '') +
              (e.fait ? ' disabled' : '') + ' style="cursor:pointer; flex:none;">' +
            '<span style="width:1em; color:var(--muted); flex:none;">' + marque + '</span>' +
            '<span style="min-width:0;">' + nom + remarque + '</span></span>' +
          '<span style="color:var(--muted); font-size:0.72rem; white-space:nowrap;">' +
            (i + 1) + ' / ' + attente.length + '</span>' +
        '</div>';
      }).join('');
      var actif = fileListe.children[rang];
      if (actif && actif.scrollIntoView) actif.scrollIntoView({ block: 'nearest' });
      majBoutonRehetra();
    }

    fileListe.addEventListener('click', function (ev) {
      var lien = ev.target.closest && ev.target.closest('[data-lien]');
      if (!lien) return;
      var ligne = lien.closest('[data-i]');
      if (!ligne) return;
      var e = attente[Number(ligne.getAttribute('data-i'))];
      if (!e || e.fait) return;
      if (e.mail) { ev.preventDefault(); envoyerLeMail(e); return; }
      // Instagram, TikTok, WeChat n'ont pas d'adresse qui porte le message.
      // Sur téléphone, la feuille de partage le leur remet directement : on
      // choisit l'application, le texte y est déjà, rien à coller. Ailleurs
      // (ordinateur), on garde le presse-papier et la page à ouvrir.
      if (e.reseau && e.reseau.copie && partageDirect()) {
        ev.preventDefault();
        copier(hafatra);
        navigator.share({ text: hafatra }).then(function () {
          e.fait = true;
          nalefa++;
          recalculerLeRang();
          montrerLeRang();
        }, function () { /* annulé : la ligne reste à faire */ });
        return;
      }
      // Le message passe au presse-papier à chaque ouverture, et plus
      // seulement pour ceux qui n'ont pas d'adresse. Certaines applications
      // s'ouvrent sans reprendre ce qu'on leur a passé — Telegram le fait
      // quand elle ne trouve pas son application et se rabat sur sa page web.
      // Il reste alors à coller : c'est déjà prêt.
      copier(hafatra);
      // Surtout pas de preventDefault : c'est le lien lui-même qui ouvre
      // l'onglet. Et pas de redessin dans la foulée non plus — remplacer le
      // lien pendant qu'on clique dessus annulerait l'ouverture. Au tour
      // d'après, donc.
      e.fait = true;
      nalefa++;
      setTimeout(function () { recalculerLeRang(); montrerLeRang(); }, 0);
    });

    fileListe.addEventListener('change', function (ev) {
      var c = ev.target;
      if (!c || !c.hasAttribute || !c.hasAttribute('data-ligne')) return;
      var ligne = c.closest('[data-i]');
      if (!ligne) return;
      var i = Number(ligne.getAttribute('data-i'));
      if (!attente[i] || attente[i].fait) return;
      attente[i].coche = c.checked;
      recalculerLeRang();
      montrerLeRang();
    });

    function montrerLeRang() {
      dessinerLaFile();
      if (rang >= attente.length) {
        // Plus rien à ouvrir : ou bien tout est parti, ou bien tout a été
        // décoché. Dans le second cas « Rehetra » les ramène, et la file
        // repart d'où elle en était.
        fileTitre.textContent = nalefa ? '✓ Vita' : 'Tsy misy voamarika';
        fileQui.textContent = nalefa
          ? nalefa + ' nosokafana amin\'ny ' + nbCoches() + '.'
          : 'Mariho eo ambany izay tianao halefa.';
        bSokafy.style.display = 'none';
        bAjanona.textContent = nalefa ? 'Hidio' : '✖ Ajanony';
        return;
      }
      var e = attente[rang];
      fileTitre.textContent = 'Fandefasana ' + (nalefa + 1) + ' / ' + nbCoches();
      bSokafy.style.display = '';
      bAjanona.textContent = '✖ Ajanony';
      bSokafy.disabled = false;
      var reste = aOuvrir().length;
      bSokafy.textContent = e.mail
        ? '📧 Alefa ny mailaka'
        : (reste > 1 ? '📨 Sokafy daholo (' + reste + ')' : '📨 Sokafy');
      if (e.mail) {
        fileQui.innerHTML = '<strong>📧 Mailaka amin\'ny client rehetra</strong>' +
          ' <span style="color:var(--muted); font-size:0.8rem;">— ny serveur no mandefa, tsy azo averina</span>';
        fileVita.textContent = nalefa ? nalefa + ' efa nosokafana.' : '';
        return;
      }
      fileQui.innerHTML = e.client
        ? '<strong>' + echap(e.client.nom) + '</strong> · +' + echap(e.client.numero)
        : '<strong style="color:' + e.reseau.couleur + ';">' + echap(e.reseau.nom) + '</strong>' +
          (e.reseau.copie ? ' <span style="color:var(--muted); font-size:0.8rem;">— hadika ny hafatra, apetaho ao</span>' : '');
      fileVita.textContent = nalefa ? nalefa + ' efa nosokafana.' : '';
    }

    page.querySelector('[data-alefa]').addEventListener('click', function () {
      var autos = cochesR().filter(function (r) { return r.auto; });
      var waServeur = waAuto ? cochesC() : [];
      if (waServeur.length && !confirm('Halefa amin\'ny WhatsApp any amin\'ny client ' + waServeur.length +
          ' ny hafatra. Tsy azo averina. Hitohy?')) return;
      if (waServeur.length) envoyerWhatsApp(waServeur);
      attente = (waAuto ? [] : cochesC()).map(function (c) { return { client: c }; })
        .concat(cochesR().filter(function (r) { return !r.auto; }).map(function (r) { return { reseau: r }; }))
        .concat(mailaka.checked ? [{ mail: true }] : []);
      if (autos.length) publierAuto(autos);
      if (!attente.length) {
        if (!autos.length && !waServeur.length) alert('Tsy misy voamarika.');
        return;
      }
      attente.forEach(function (e) { e.coche = true; e.fait = false; });
      rang = 0;
      nalefa = 0;
      bSokafy.style.display = '';
      bAjanona.textContent = '✖ Ajanony';
      file.style.display = '';
      montrerLeRang();
      file.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // Une annonce envoyée à tout le carnet ne se rattrape pas : on demande
    // avant. Le bouton et la ligne y mènent tous deux — d'où cette fonction
    // à part, plutôt que deux copies qui finiraient par diverger.
    function envoyerLeMail(e) {
      if (!confirm('Halefa any amin\'ny client rehetra manana email ny hafatra. Tsy azo averina. Hitohy?')) return;
      if (!window.__sb || !window.__sb.functions) {
        fileVita.textContent = 'Tsy tafiditra ny serveur.';
        return;
      }
      bSokafy.disabled = true;
      fileVita.textContent = 'Mandefa…';
      window.__sb.functions.invoke('annonce-mailaka', {
        body: { texte: texte, rohy: rohy, sujet: (texte.split('\n')[0] || '').slice(0, 80) }
      }).then(function (res) {
        var d = (res && res.data) || {};
        if (d.sent) {
          nalefa++;
          e.fait = true;
          recalculerLeRang();
          montrerLeRang();
          fileVita.textContent = '✓ ' + d.sent + ' mailaka lasa' + (d.error ? ' (' + d.error + ')' : '') + '.';
          return;
        }
        bSokafy.disabled = false;
        fileVita.textContent = 'Tsy lasa : ' + (d.error || (res && res.error && res.error.message) || 'antony tsy fantatra');
      }, function (err) {
        bSokafy.disabled = false;
        fileVita.textContent = 'Tsy tratra ny fonction : ' + ((err && err.message) || 'réseau');
      });
    }

    bSokafy.addEventListener('click', function () {
      var e = attente[rang];
      if (!e) return;
      if (e.mail) { envoyerLeMail(e); return; }
      // Il ne reste que des réseaux à partager par le téléphone : le bouton
      // partage celui du tour, comme un appui sur sa ligne.
      if (!aOuvrir().length && e.reseau && e.reseau.copie && partageDirect()) {
        copier(hafatra);
        navigator.share({ text: hafatra }).then(function () {
          e.fait = true;
          nalefa++;
          recalculerLeRang();
          montrerLeRang();
        }, function () {});
        return;
      }
      // Tout ce qui est coché s'ouvre ici, à la file et sans rien attendre
      // entre deux : le navigateur n'autorise les fenêtres que pendant le
      // geste qui les demande, et une seule attente suffirait à faire
      // refuser toutes les suivantes.
      var liste = aOuvrir();
      var bloques = 0;
      liste.forEach(function (x) {
        var fenetre;
        // Le message passe au presse-papier dans tous les cas : c'est le même
        // pour tous, et il sauve les ouvertures où l'application ne reprend
        // pas ce qu'on lui a passé.
        copier(hafatra);
        if (x.client) {
          fenetre = window.open('https://wa.me/' + x.client.numero +
            '?text=' + encodeURIComponent(hafatra), '_blank');
        } else if (x.reseau.copie) {
          // Rien à ouvrir pour certains : il n'y a que le presse-papier.
          fenetre = x.reseau.ouvrir ? window.open(x.reseau.ouvrir, '_blank') : true;
        } else {
          fenetre = window.open(x.reseau.url(texte, rohy), '_blank');
        }
        // Une fenêtre refusée ne compte pas comme partie : elle reste cochée,
        // et le second appui la reprendra.
        if (fenetre) { x.fait = true; nalefa++; } else { bloques++; }
      });
      recalculerLeRang();
      montrerLeRang();
      if (bloques) {
        fileVita.innerHTML = '⚠ ' + bloques + ' tsy nisokatra — nosakanan\'ny navigateur. ' +
          '<strong>Tsindrio tsirairay eo ambany ny anarany</strong> : rohy izy ireo, ' +
          'ka tsy misy sakana. Na ekeo ny « pop-up » ho an\'ity pejy ity, dia tsindrio indray ity bokotra ity.';
      }
    });
    bRehetra.addEventListener('click', function () {
      var reste = restants();
      var tous = reste.length > 0 && reste.every(function (x) { return x.coche; });
      reste.forEach(function (x) { x.coche = !tous; });
      recalculerLeRang();
      montrerLeRang();
    });
    bAjanona.addEventListener('click', fermer);
  };
})();

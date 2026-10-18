// Ny asako Hôtellerie : le menu sakafo de l'hôtel.
//
// Une page du menu, et dedans le menu sakafo : les plats rangés par sokajy
// (maraina, atoandro, hariva, zava-pisotro, tsindrin-tsakafo), chacun avec son
// prix et une marque « misy / lany ». Le menu se garde dans ce navigateur
// (localStorage), et, pour le compte connecté, dans la table hotelerie_menu
// (supabase/sql/supabase-hotelerie-menu.sql) à chaque changement : le lien
// partagé (menu-sakafo.html?id=<compte>) la lit, et montre donc toujours le
// menu du moment, sans qu'on ait à renvoyer un lien neuf.
//
// La clé porte SUFFIXE_MPIASA (common.js) : un employé ouvert chez le patron
// ne touche pas au menu du patron — ni ici, ni en ligne.
//
// La page est vide dans ny-asako.html : ce fichier la remplit.

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';
  const CLE = 'stockmanager_hotelerie_sakafo' + SUFFIXE;
  const CLE_FAFANA = CLE + '_fafana';
  const CHAMP = 'background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.6rem; font:inherit;';
  const SOKAJY = [
    ['maraina', '🌅 Sakafo maraina'],
    ['atoandro', '🍛 Sakafo atoandro'],
    ['hariva', '🌙 Sakafo hariva'],
    ['fisotro', '🥤 Zava-pisotro'],
    ['tsindrina', '🍰 Tsindrin-tsakafo']
  ];

  function lire() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function ecrire(liste) {
    try { localStorage.setItem(CLE, JSON.stringify(liste)); }
    catch (e) {
      alert('Tsy voatahiry : feno ny toerana ao amin\'ity navigateur ity.');
      return false;
    }
    synchroniser();
    return true;
  }
  // Les plats effacés d'ici : on s'en souvient, pour qu'une autre copie du
  // menu (un autre appareil) ne les fasse pas revenir.
  function fafanaLire() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE_FAFANA));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function fafanaAjouter(id) {
    const l = fafanaLire();
    if (l.indexOf(id) < 0) l.push(id);
    try { localStorage.setItem(CLE_FAFANA, JSON.stringify(l)); } catch (e) { }
  }

  // La tête du menu : le nom de l'hôtel et son logo, que le propriétaire
  // change ici (« ✏️ Ovay », « 🖼️ Sary »). { anarana, sary, maj } : comme un
  // plat, la copie la plus récemment changée l'emporte d'un appareil à l'autre.
  const CLE_TETE = CLE + '_tete';
  const NOM_DEFAUT = 'Ny asako Hôtellerie';
  const LOGO_DEFAUT = '/icone-192.png'; // le logo de Ny asako
  function teteLire() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE_TETE));
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function teteEcrire(t) {
    t.maj = Date.now();
    try { localStorage.setItem(CLE_TETE, JSON.stringify(t)); } catch (e) { }
    synchroniser();
  }
  function nomHotel() { return (teteLire().anarana || '').trim() || NOM_DEFAUT; }
  // L'entrée du menu (et ses copies dans la rangée ou sur le fond) porte le
  // logo de Ny asako, que celui de l'hôtel remplace dès qu'il en a un.
  function majLogoMenu() {
    const src = teteLire().sary || LOGO_DEFAUT;
    document.querySelectorAll('img.nav-logo-hotel').forEach(function (i) {
      if (i.getAttribute('src') !== src) i.setAttribute('src', src);
    });
  }

  // ---------- En ligne ----------
  let compte = null;   // l'id du compte connecté, une fois connu
  let etatEnLigne = ''; // ce que dit la page sous les boutons du lien
  function sb() { return SUFFIXE ? null : window.__sb; }
  function idDuCompte() {
    const c = sb();
    if (!c || !c.auth) return Promise.resolve(null);
    return c.auth.getSession().then(function (r) {
      compte = r && r.data && r.data.session ? r.data.session.user.id : null;
      return compte;
    }, function () { return null; });
  }
  // ---------- Les sary ----------
  // La photo d'un plat, prise dans un dossier de l'appareil, réduite ici
  // (600 px, JPEG) puis posée dans le bucket hotelerie-sary
  // (supabase/sql/supabase-hotelerie-sary.sql) : le plat n'en garde que
  // l'adresse, le menu reste léger à relire. Sans compte en ligne (un employé
  // ouvert chez le patron), la photo reste dans le plat, plus petite.
  const BUCKET_SARY = 'hotelerie-sary';
  function reduireSary(fichier, cote, qualite) {
    return new Promise(function (ok, ko) {
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const r = Math.min(1, cote / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * r));
        c.height = Math.max(1, Math.round(img.naturalHeight * r));
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? ok({ blob: b, canvas: c }) : ko(new Error('toBlob')); }, 'image/jpeg', qualite);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Tsy sary io fichier io.')); };
      img.src = url;
    });
  }
  function cheminSary(adresse) {
    const m = String(adresse || '').match(new RegExp('/' + BUCKET_SARY + '/(.+)$'));
    return m ? decodeURIComponent(m[1].split('?')[0]) : null;
  }
  function envoyerSary(platId, fichier) {
    return idDuCompte().then(function (uid) {
      if (!uid) {
        return reduireSary(fichier, 240, 0.6).then(function (r) { return r.canvas.toDataURL('image/jpeg', 0.6); });
      }
      return reduireSary(fichier, 600, 0.75).then(function (r) {
        const nom = uid + '/' + platId + '-' + Date.now().toString(36) + '.jpg';
        return sb().storage.from(BUCKET_SARY).upload(nom, r.blob, { contentType: 'image/jpeg', upsert: true })
          .then(function (res) {
            if (res.error) throw new Error(res.error.message);
            return sb().storage.from(BUCKET_SARY).getPublicUrl(nom).data.publicUrl;
          });
      });
    });
  }
  function effacerSary(adresse) {
    const chemin = cheminSary(adresse);
    if (chemin && sb()) sb().storage.from(BUCKET_SARY).remove([chemin]).catch(function () { });
  }

  function direEnLigne(t) {
    etatEnLigne = t;
    const p = document.getElementById('sakafoEnLigne');
    if (p) p.textContent = t;
  }

  // Deux copies du menu — celle d'ici et celle en ligne — se FONDENT, plat
  // par plat, au lieu que la dernière écrite efface l'autre. C'est ainsi
  // qu'un plat ajouté sur le téléphone a disparu quand l'ordinateur, qui ne
  // le connaissait pas, a réécrit tout le menu. Pour un même plat, le plus
  // récemment changé (maj) l'emporte ; un plat effacé quelque part (voafafa)
  // ne revient plus.
  function fondre(a, b, fafana) {
    const parId = {};
    a.concat(b).forEach(function (p) {
      if (!p || !p.id || fafana.indexOf(p.id) >= 0) return;
      const deja = parId[p.id];
      if (!deja || (Number(p.maj) || 0) > (Number(deja.maj) || 0)) parId[p.id] = p;
    });
    return Object.keys(parId).map(function (k) { return parId[k]; });
  }
  function memes(a, b) {
    const t = function (l) {
      return JSON.stringify(l.slice().sort(function (x, y) { return String(x.id || x).localeCompare(String(y.id || y)); }));
    };
    return t(a) === t(b);
  }
  let enCoursSync = null;
  let resynchroniser = false;
  function synchroniser() {
    // Un changement pendant un envoi : on refait un tour après, sans croiser.
    if (enCoursSync) { resynchroniser = true; return enCoursSync; }
    enCoursSync = idDuCompte().then(function (uid) {
      if (!uid) return;
      direEnLigne('⏳ Alefa any amin\'ny rohy...');
      return sb().from('hotelerie_menu').select('plats,voafafa,tete').eq('user_id', uid).maybeSingle()
        .then(function (res) {
          if (res.error) throw new Error(res.error.message);
          const ici = lire();
          const enLigne = res.data && Array.isArray(res.data.plats) ? res.data.plats : [];
          const fafanaLa = res.data && Array.isArray(res.data.voafafa) ? res.data.voafafa : [];
          const fafana = fafanaLire().concat(fafanaLa.filter(function (x) { return fafanaLire().indexOf(x) < 0; }));
          const fondu = fondre(ici, enLigne, fafana);
          const teteIci = teteLire();
          const teteLa = res.data && res.data.tete && typeof res.data.tete === 'object' ? res.data.tete : {};
          const tete = (Number(teteLa.maj) || 0) > (Number(teteIci.maj) || 0) ? teteLa : teteIci;
          const teteChange = JSON.stringify(tete) !== JSON.stringify(teteIci);
          try {
            localStorage.setItem(CLE, JSON.stringify(fondu));
            localStorage.setItem(CLE_FAFANA, JSON.stringify(fafana));
            localStorage.setItem(CLE_TETE, JSON.stringify(tete));
          } catch (e) { }
          if (teteChange) majLogoMenu();
          if (!memes(fondu, ici) || teteChange) redessinerSiLibre();
          // Rien ici, rien en ligne : pas de ligne vide pour chaque compte
          // qui ouvre simplement l'application.
          if (!res.data && !fondu.length && !fafana.length && !tete.maj) { direEnLigne(''); return; }
          if (res.data && memes(fondu, enLigne) && memes(fafana, fafanaLa) &&
              JSON.stringify(tete) === JSON.stringify(teteLa)) {
            direEnLigne('✅ Efa miova ho azy ny rohy.');
            return;
          }
          return sb().from('hotelerie_menu')
            .upsert({ user_id: uid, plats: fondu, voafafa: fafana, tete: tete.maj ? tete : null, updated_at: new Date().toISOString() })
            .then(function (r) {
              if (r.error) throw new Error(r.error.message);
              direEnLigne('✅ Efa miova ho azy ny rohy.');
            });
        });
    }).catch(function (e) {
      direEnLigne('⚠️ Tsy tonga tany amin\'ny rohy' + (e && e.message ? ' : ' + e.message : ' (tsy misy connexion ?).'));
    }).then(function () {
      enCoursSync = null;
      if (resynchroniser) { resynchroniser = false; synchroniser(); }
    });
    return enCoursSync;
  }
  // Un menu venu d'ailleurs se redessine — sauf si l'on est en train
  // d'écrire un plat : on ne lui vole pas sa saisie, il verra au prochain tour.
  function redessinerSiLibre() {
    const nom = document.getElementById('sakafoAnarana');
    const prix = document.getElementById('sakafoVidiny');
    if (ovayAnarana) return;
    if (onglet === 'menu' && (enCours || (nom && nom.value) || (prix && prix.value))) return;
    if (onglet === 'menu') rendre();
  }
  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function ariary(n) { return Number(n || 0).toLocaleString('fr-FR') + ' Ar'; }
  function nomSokajy(c) {
    const s = SOKAJY.find(function (x) { return x[0] === c; });
    return s ? s[1] : c;
  }

  let recherche = '';
  let enCours = null; // l'id du plat qu'on modifie, ou null pour un nouveau
  let ovayAnarana = false; // le nom de l'hôtel est en train d'être changé
  let onglet = 'menu'; // 'menu' ou 'commandes'

  // ---------- Les commandes des clients ----------
  // Elles arrivent de menu-sakafo.html (hotelerie_commande,
  // supabase/sql/supabase-hotelerie-commande.sql) : on les relit toutes les
  // 15 s, et l'onglet porte le nombre de celles qui ne sont pas encore servies.
  let commandes = [];
  let nbVaovao = 0;
  let voirVita = false;
  let nbLatabatra = 10;
  let etatCommandes = 'Miandry...';
  // Redessiner toutes les 15 s volerait la saisie (le champ de la note, la
  // commande en cours) : on ne redessine que si quelque chose a changé.
  let signature = '';
  function chargerCommandes(force) {
    let change = !!force;
    return idDuCompte().then(function (uid) {
      if (!uid) { change = true; etatCommandes = 'Midira ao amin\'ny kaontinao mba hahitana ny commande.'; return; }
      return Promise.all([
        sb().from('hotelerie_commande').select('id,latabatra,plats,fanamarihana,vita,created_at,fandoavana,fandoavana_ref,voaloa')
          .eq('hotel_id', uid).order('created_at', { ascending: false }).limit(300),
        sb().from('hotelerie_menu').select('latabatra').eq('user_id', uid).maybeSingle()
      ]).then(function (r) {
        if (r[0].error) { change = true; etatCommandes = '⚠️ ' + r[0].error.message; return; }
        commandes = r[0].data || [];
        const sig = JSON.stringify(commandes) + '|' + ((r[1].data && r[1].data.latabatra) || '');
        if (sig !== signature) { signature = sig; change = true; }
        if (r[1].data && r[1].data.latabatra && r[1].data.latabatra !== nbLatabatra) {
          nbLatabatra = r[1].data.latabatra;
          majChampLatabatra();
        }
        etatCommandes = '';
        const avant = nbVaovao;
        nbVaovao = commandes.filter(function (c) { return !c.vita; }).length;
        if (nbVaovao > avant && avant >= 0 && document.hidden === false && onglet !== 'commandes' && dejaCharge) {
          // Une commande neuve pendant qu'on regarde le menu : l'onglet le dit.
          const b = document.querySelector('.hotelerie [data-onglet="commandes"]');
          if (b) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 500, iterations: 2 });
        }
        dejaCharge = true;
      });
    }).then(function () {
      if (onglet === 'commandes' && change) dessinerCommandes();
      majBadge();
    }, function () { etatCommandes = '⚠️ Tsy azo ny commande (connexion ?).'; if (onglet === 'commandes') dessinerCommandes(); });
  }
  let dejaCharge = false;
  function majBadge() {
    const b = document.querySelector('.hotelerie [data-onglet="commandes"]');
    if (!b) return;
    b.innerHTML = '🛎️ Commandes' + (nbVaovao
      ? ' <span style="background:#ff6b6b; color:#fff; font-size:0.7rem; font-weight:700; border-radius:999px; padding:0 6px; margin-left:4px;">' + nbVaovao + '</span>'
      : '');
  }
  function brancherOnglets(z) {
    z.querySelectorAll('[data-onglet]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (onglet === b.dataset.onglet) return;
        onglet = b.dataset.onglet;
        rendre();
        if (onglet === 'commandes') chargerCommandes();
      });
    });
    brancherTete(z);
  }
  // La tête : « ✏️ Ovay » change le nom, le logo (ou « 🖼️ Sary ») ouvre le
  // dossier pour une image, « ✕ Sary » rend le logo de Ny asako.
  function brancherTete(z) {
    function sur(id, f) { const b = z.querySelector('#' + id); if (b) b.addEventListener('click', f); }
    sur('hotelAnaranaOvay', function () {
      ovayAnarana = true;
      rendre();
      const c = z.querySelector('#hotelAnarana');
      if (c) { c.focus(); c.select(); }
    });
    sur('hotelAnaranaAtsahatra', function () { ovayAnarana = false; rendre(); });
    function tehirizo() {
      const v = (z.querySelector('#hotelAnarana').value || '').trim().slice(0, 60);
      const t = teteLire();
      t.anarana = v && v !== NOM_DEFAUT ? v : '';
      ovayAnarana = false;
      teteEcrire(t);
      rendre();
    }
    sur('hotelAnaranaTehirizo', tehirizo);
    const champ = z.querySelector('#hotelAnarana');
    if (champ) champ.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tehirizo();
      else if (e.key === 'Escape') { ovayAnarana = false; rendre(); }
    });
    function changerLogo() {
      const bouton = z.querySelector('#hotelLogoOvay');
      const f = document.createElement('input');
      f.type = 'file';
      f.accept = 'image/*';
      f.addEventListener('change', function () {
        const fichier = f.files && f.files[0];
        if (!fichier) return;
        if (bouton) { bouton.disabled = true; bouton.textContent = '⏳'; }
        envoyerSary('logo', fichier).then(function (adresse) {
          const t = teteLire();
          if (t.sary && t.sary !== adresse) effacerSary(t.sary);
          t.sary = adresse;
          teteEcrire(t);
          rendre();
        }).catch(function (e) {
          rendre();
          alert('Tsy tafiditra ny sary' + (e && e.message ? ' : ' + e.message : '.'));
        });
      });
      f.click();
    }
    sur('hotelLogo', changerLogo);
    sur('hotelLogoOvay', changerLogo);
    sur('hotelLogoEsory', function () {
      if (!confirm('Esorina ve ny sary, hiverina amin\'ny logo Ny asako ?')) return;
      const t = teteLire();
      effacerSary(t.sary);
      delete t.sary;
      teteEcrire(t);
      rendre();
    });
  }
  function heure(iso) {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function totalDe(c) {
    return (c.plats || []).reduce(function (s, p) { return s + (Number(p.isa) || 0) * (Number(p.vidiny) || 0); }, 0);
  }
  function rohyLatabatra(uid, n) {
    return location.origin + '/menu-sakafo.html?id=' + uid + '&latabatra=' + n;
  }
  // ---------- Les latabatra ----------
  // Toutes les latabatra en boutons ; celle qu'on ouvre ne montre plus que
  // ses commandes, et donne son QR.
  let tableOuverte = 0;
  function blocLatabatra(enAttente) {
    let boutons = '';
    for (let n = 1; n <= nbLatabatra; n++) {
      const actif = n === tableOuverte;
      boutons += '<button type="button" class="btn btn-sm" data-ouvrir="' + n + '" style="width:auto; position:relative;' +
        (actif ? ' border-color:var(--cyan); color:var(--cyan); background:rgba(79,216,224,0.12);' : '') + '">🍽️ T' + n +
        (enAttente[n] ? ' <span style="background:#ff6b6b; color:#fff; font-size:0.68rem; font-weight:700; border-radius:999px; padding:0 5px; margin-left:3px;">' + enAttente[n] + '</span>' : '') +
        '</button>';
    }
    return '<div class="panel" style="margin-top:1rem;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">' +
        '<h4 style="margin:0;">🍽️ Latabatra</h4>' +
        (tableOuverte
          ? '<div style="display:flex; gap:0.4rem; flex-wrap:wrap;">' +
              '<button type="button" class="btn btn-sm" data-qr="' + tableOuverte + '" style="width:auto;">🔳 QR T' + tableOuverte + '</button>' +
              '<button type="button" class="btn btn-sm" data-ouvrir="0" style="width:auto;">✕ Hidio ny T' + tableOuverte + '</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;">' + boutons + '</div>' +
    '</div>';
  }

  // ---------- Le paiement ----------
  // Le client paie à table : vola an-tanana, ou par mobile money vers les
  // numéros de l'hôtel, qu'on écrit ici. Ils voyagent dans la tête du menu
  // (hotelerie_menu.tete.vola), que la page du client lit déjà.
  const FOMBA = [
    ['mvola', 'MVola'],
    ['orange', 'Orange Money'],
    ['airtel', 'Airtel Money']
  ];
  const NOM_FOMBA = { vola: '💵 Vola an-tanana', mvola: '📱 MVola', orange: '📱 Orange Money', airtel: '📱 Airtel Money' };
  function volaLire() {
    const v = teteLire().vola;
    return v && typeof v === 'object' ? v : {};
  }
  // Les numéros se règlent une fois : rangés derrière « ⚙️ », ils laissent la
  // place aux commandes et à leurs reçus.
  let voirVola = false;
  function blocVola() {
    const v = volaLire();
    if (!voirVola) {
      const mis = FOMBA.filter(function (f) { return v[f[0]]; }).map(function (f) { return f[1]; });
      return '<div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.8rem; font-size:0.78rem; color:var(--muted);">' +
        '<button type="button" class="btn btn-sm" id="volaToggle" style="width:auto;" title="Laharana fandoavana">⚙️ Fandoavana</button>' +
        '<span>' + (mis.length ? '💳 ' + html(mis.join(', ')) + ' · 💵 Vola an-tanana' : '💵 Vola an-tanana ihany (tsy misy laharana mobile money)') + '</span>' +
      '</div>';
    }
    // Ce qu'on est en train d'écrire survit au redessin (une commande qui arrive).
    const ecrit = function (k) {
      const c = document.getElementById('vola_' + k);
      return c ? c.value : (v[k] || '');
    };
    return '<div class="panel" style="margin-top:1rem;">' +
      '<h4 style="margin:0 0 0.3rem;">💳 Fandoavana eo amin\'ny latabatra</h4>' +
      '<p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.6rem;">Ny laharana mobile money handefasan\'ny mpanjifa ny vola. Hita ao amin\'ny menu an\'ny latabatra (afaka misafidy « Vola an-tanana » foana koa izy).</p>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0.6rem;">' +
        FOMBA.map(function (f) {
          return '<div class="field" style="margin-bottom:0;"><label for="vola_' + f[0] + '">' + f[1] + '</label>' +
            '<input id="vola_' + f[0] + '" type="tel" inputmode="tel" maxlength="20" placeholder="Ex: 034 00 000 00" value="' + html(ecrit(f[0])) + '"></div>';
        }).join('') +
        '<div class="field" style="margin-bottom:0;"><label for="vola_tompony">Anaran\'ny tompon\'ny laharana</label>' +
          '<input id="vola_tompony" type="text" maxlength="60" placeholder="Ex: Rakoto Jean" value="' + html(ecrit('tompony')) + '"></div>' +
      '</div>' +
      '<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;">' +
        '<button type="button" class="btn btn-sm" id="volaTehirizo" style="width:auto;">💾 Tehirizo</button>' +
        '<button type="button" class="btn btn-sm" id="volaToggle" style="width:auto;">Hidio</button>' +
      '</div>' +
    '</div>';
  }

  // Le reçu d'une commande, dans une page à part qu'on imprime (ou qu'on
  // enregistre en PDF) : l'hôtel, la table, l'heure, les plats, le total, le
  // paiement et son état.
  function ouvrirRecu(c) {
    const t = teteLire();
    const logo = new URL(t.sary || LOGO_DEFAUT, location.href).href;
    const lignes = (c.plats || []).map(function (p) {
      return '<tr><td>' + (Number(p.isa) || 0) + ' × ' + html(p.anarana) + '</td><td class="d">' +
        ariary((Number(p.isa) || 0) * (Number(p.vidiny) || 0)) + '</td></tr>';
    }).join('');
    const page = '<!doctype html><html lang="mg"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Reçu T' + c.latabatra + '</title><style>' +
      'body{font:15px/1.45 system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:16px;}' +
      '.r{max-width:360px;margin:0 auto;border:1px dashed #999;padding:16px;}' +
      '.h{display:flex;align-items:center;gap:10px;}.h img{width:44px;height:44px;object-fit:cover;border-radius:8px;}' +
      'h1{font-size:1.1rem;margin:0;}small{color:#555;}table{width:100%;border-collapse:collapse;margin:12px 0;}' +
      'td{padding:4px 0;border-bottom:1px solid #eee;vertical-align:top;}.d{text-align:right;white-space:nowrap;}' +
      '.t{font-weight:700;font-size:1.05rem;}.ok{color:#0a7d4f;font-weight:700;}.no{color:#b26a00;font-weight:700;}' +
      'button{margin:14px auto 0;display:block;font:inherit;padding:8px 16px;cursor:pointer;}' +
      '@media print{button{display:none;}.r{border:0;}}' +
      '</style></head><body><div class="r">' +
      '<div class="h"><img src="' + html(logo) + '" alt=""><div><h1>' + html(nomHotel()) + '</h1>' +
        '<small>🧾 Reçu · T' + c.latabatra + ' · ' + html(heure(c.created_at)) + '</small></div></div>' +
      '<table>' + lignes + '<tr><td class="t">Total</td><td class="d t">' + ariary(totalDe(c)) + '</td></tr></table>' +
      '<div>' + html(NOM_FOMBA[c.fandoavana] || '💳 Tsy voalaza ny fandoavana') +
        (c.fandoavana_ref ? '<br>Réf : <strong>' + html(c.fandoavana_ref) + '</strong>' : '') + '</div>' +
      '<p class="' + (c.voaloa ? 'ok">💰 Voaloa' : 'no">⏳ Tsy mbola voaloa') + '</p>' +
      (c.fanamarihana ? '<p><small>📝 ' + html(c.fanamarihana) + '</small></p>' : '') +
      '<p><small>N° ' + html(String(c.id).slice(0, 8).toUpperCase()) + ' · Misaotra !</small></p>' +
      '</div><button type="button" onclick="print()">🖨️ Printy</button></body></html>';
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) alert("Tsy nisokatra ny reçu : avelao hisokatra ny fenêtre (pop-up) amin'ity site ity.");
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // ---------- Les QR des latabatra ----------
  // qrcode-generator (cdnjs), chargé la première fois qu'on en demande un.
  let promesseQR = null;
  function chargerQR() {
    if (typeof window.qrcode === 'function') return Promise.resolve();
    if (promesseQR) return promesseQR;
    promesseQR = new Promise(function (ok, ko) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = function () { ok(); };
      s.onerror = function () { promesseQR = null; s.remove(); ko(new Error('qrcode')); };
      document.head.appendChild(s);
    });
    return promesseQR;
  }
  function ouvrirQR(w, uid, tables) {
    const t = teteLire();
    const logo = new URL(t.sary || LOGO_DEFAUT, location.href).href;
    // Le paiement sur la carte : les numéros mobile money de l'hôtel, en
    // clair et dans un second QR (le même pour toutes les tables).
    const v = volaLire();
    const lignesVola = FOMBA.filter(function (f) { return v[f[0]]; }).map(function (f) { return f[1] + ' : ' + v[f[0]]; });
    let blocVolaCarte = '';
    if (lignesVola.length) {
      if (window.qrcode.stringToBytesFuncs) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
      const qv = window.qrcode(0, 'H');
      qv.addData(nomHotel() + '\n' + lignesVola.join('\n') + (v.tompony ? '\n' + v.tompony : ''), 'Byte');
      qv.make();
      blocVolaCarte = '<div class="v"><div class="vq">' + qv.createSvgTag({ cellSize: 4, margin: 1, scalable: true }) + '<img class="l" src="' + html(logo) + '" alt=""></div>' +
        '<div class="vt"><strong>💳 Fandoavana</strong><br>' + lignesVola.map(html).join('<br>') +
        (v.tompony ? '<br><small>' + html(v.tompony) + '</small>' : '') + '</div></div>';
    }
    const cartes = tables.map(function (n) {
      // Correction « H » : le logo posé au milieu en cache une part, le QR
      // se lit quand même.
      const qr = window.qrcode(0, 'H');
      qr.addData(rohyLatabatra(uid, n));
      qr.make();
      return '<div class="c"><div class="h"><img src="' + html(logo) + '" alt=""><strong>' + html(nomHotel()) + '</strong></div>' +
        '<div class="q">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '<img class="l" src="' + html(logo) + '" alt=""></div>' +
        '<div class="n">T' + n + '</div>' +
        '<small>📱 Scannez : menu sakafo &amp; commande</small>' + blocVolaCarte + '</div>';
    }).join('');
    const page = '<!doctype html><html lang="mg"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>QR ' + (tables.length === 1 ? 'T' + tables[0] : 'latabatra') + '</title><style>' +
      'body{font:15px/1.4 system-ui,sans-serif;color:#111;background:#fff;margin:0;padding:16px;}' +
      '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;}' +
      '.c{border:1px dashed #999;border-radius:12px;padding:14px;text-align:center;break-inside:avoid;page-break-inside:avoid;}' +
      '.h{display:flex;align-items:center;justify-content:center;gap:8px;}.h img{width:32px;height:32px;object-fit:cover;border-radius:6px;}' +
      '.q{position:relative;width:100%;max-width:220px;margin:10px auto;}' +
      '.q svg{width:100%;height:auto;display:block;}' +
      '.q .l{position:absolute;left:50%;top:50%;width:22%;height:22%;transform:translate(-50%,-50%);object-fit:cover;background:#fff;border:3px solid #fff;border-radius:8px;box-shadow:0 0 0 1px #ddd;}' +
      '.n{font-size:2rem;font-weight:800;}small{color:#555;}' +
      '.v{display:flex;gap:10px;align-items:center;text-align:left;margin-top:12px;padding-top:10px;border-top:1px dashed #bbb;font-size:0.85rem;}' +
      '.vq{flex:0 0 110px;position:relative;}.vq svg{width:110px;height:110px;display:block;}' +
      '.vq .l{position:absolute;left:50%;top:50%;width:24%;height:24%;transform:translate(-50%,-50%);object-fit:cover;background:#fff;border:2px solid #fff;border-radius:5px;}' +
      'button{margin:16px auto 0;display:block;font:inherit;padding:8px 16px;cursor:pointer;}' +
      '@media print{button{display:none;}body{padding:0;}}' +
      '</style></head><body><div class="g">' + cartes + '</div>' +
      '<button type="button" onclick="print()">🖨️ Printy</button></body></html>';
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
    w.location.href = url;
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // Le QR d'une table, ou de toutes : une page à imprimer et à poser sur
  // chaque latabatra. La fenêtre s'ouvre tout de suite (dans le clic, sinon
  // le navigateur la bloque) et se remplit quand le QR est prêt.
  function qrPour(tables) {
    const w = window.open('', '_blank');
    if (!w) { alert("Tsy nisokatra ny QR : avelao hisokatra ny fenêtre (pop-up) amin'ity site ity."); return; }
    idDuCompte().then(function (uid) {
      if (!uid) { w.close(); alert('Midira ao amin\'ny kaontinao aloha.'); return; }
      return chargerQR().then(function () { ouvrirQR(w, uid, tables); });
    }).catch(function () {
      w.close();
      alert('Tsy azo ny QR : jereo ny connexion, dia avereno.');
    });
  }
  function dessinerCommandes() {
    const zone = document.getElementById('commandesZone');
    if (!zone) return;
    const visibles = commandes.filter(function (c) { return voirVita || !c.vita; });
    const parTable = {};
    visibles.forEach(function (c) { (parTable[c.latabatra] = parTable[c.latabatra] || []).push(c); });
    let tables = Object.keys(parTable).map(Number).sort(function (a, b) { return a - b; });
    // Une table ouverte : on ne montre que ses commandes, sous son menu.
    if (tableOuverte > nbLatabatra) tableOuverte = 0;
    if (tableOuverte) tables = tables.filter(function (t) { return t === tableOuverte; });
    const enAttente = {};
    commandes.forEach(function (c) { if (!c.vita) enAttente[c.latabatra] = (enAttente[c.latabatra] || 0) + 1; });

    let options = '';
    for (let i = 1; i <= nbLatabatra; i++) options += '<option value="' + i + '">T' + i + '</option>';

    zone.innerHTML =
      '<div class="panel">' +
        '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:flex-end;">' +
          '<div class="field" style="margin-bottom:0; flex:0 1 150px;"><label for="latabatraIsa">Isan\'ny latabatra</label>' +
            '<input id="latabatraIsa" type="number" min="1" max="500" value="' + nbLatabatra + '"></div>' +
          '<button type="button" class="btn btn-sm" id="latabatraTehirizo" style="width:auto;">💾 Tehirizo</button>' +
          '<div class="field" style="margin-bottom:0; flex:0 1 150px;"><label for="latabatraRohy">Rohy isaky ny latabatra</label>' +
            '<select id="latabatraRohy">' + options + '</select></div>' +
          '<button type="button" class="btn btn-sm" id="latabatraAdikao" style="width:auto;">🔗 Adikao</button>' +
        '</div>' +
        '<p style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0 0;">Ny rohy isaky ny latabatra dia efa misafidy ny latabatra ho an\'ny mpanjifa (🔳 QR eo amin\'ny latabatra tsirairay : printy, dia apetraho eo ambony latabatra). Sokafy amin\'ny téléphone na tablette eo amin\'ilay latabatra, dia « 📲 Installer » : lasa appli « T1 », « T2 »… manokana izy.</p>' +
      '</div>' +
      blocVola() +
      blocLatabatra(enAttente) +
      '<div class="panel" style="margin-top:1rem;">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">' +
          '<strong style="font-size:0.9rem;">' + (tableOuverte
            ? 'T' + tableOuverte + ' : ' + (enAttente[tableOuverte] || 0) + ' commande mbola tsy vita'
            : nbVaovao + ' commande mbola tsy vita') + '</strong>' +
          '<div style="display:flex; gap:0.4rem; flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-sm" id="commandesVita" style="width:auto;">' + (voirVita ? '🙈 Afeno ny vita' : '👁️ Asehoy ny vita') + '</button>' +
            '<button type="button" class="btn btn-sm" id="commandesHavaozina" style="width:auto;">🔄 Havaozina</button>' +
          '</div>' +
        '</div>' +
        (etatCommandes ? '<p class="empty-hint" style="margin:0.8rem 0 0;">' + html(etatCommandes) + '</p>' : '') +
        (!etatCommandes && !tables.length ? '<p class="empty-hint" style="margin:0.8rem 0 0;">Tsy misy commande ' + (voirVita ? '' : 'miandry ') + 'izao.</p>' : '') +
        tables.map(function (t) {
          const liste = parTable[t];
          const reste = liste.filter(function (c) { return !c.vita; }).reduce(function (s, c) { return s + totalDe(c); }, 0);
          const tsyVoaloa = liste.filter(function (c) { return !c.voaloa; }).reduce(function (s, c) { return s + totalDe(c); }, 0);
          return '<div style="margin-top:1rem; border:1px solid var(--cyan); border-radius:10px; padding:0.7rem 0.8rem;">' +
            '<div style="display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
              '<h4 style="margin:0; font-size:1rem;">🍽️ T' + t + '</h4>' +
              '<button type="button" class="btn btn-sm" data-qr="' + t + '" style="width:auto;">🔳 QR</button>' +
              (reste ? '<strong style="color:var(--cyan); font-size:0.88rem;">' + ariary(reste) + '</strong>' : '') +
              (tsyVoaloa ? '<span style="font-size:0.78rem; color:#ffb020;">💳 Tsy voaloa : ' + ariary(tsyVoaloa) + '</span>' : '') +
            '</div>' +
            liste.map(function (c) {
              return '<div style="margin-top:0.6rem; padding:0.6rem 0.7rem; border-radius:8px; border:1px solid var(--line);' + (c.vita ? ' opacity:0.55;' : '') + '">' +
                '<div style="display:flex; justify-content:space-between; gap:0.5rem; font-size:0.75rem; color:var(--muted);">' +
                  '<span>🕒 ' + heure(c.created_at) + '</span>' +
                  '<span>' + (c.vita ? '✅ Vita' : '⏳ Miandry') + '</span>' +
                '</div>' +
                (c.plats || []).map(function (p) {
                  return '<div style="display:flex; justify-content:space-between; gap:0.5rem; font-size:0.86rem; margin-top:0.25rem;">' +
                    '<span><strong>' + (Number(p.isa) || 0) + ' ×</strong> ' + html(p.anarana) + '</span>' +
                    '<span style="white-space:nowrap;">' + ariary((Number(p.isa) || 0) * (Number(p.vidiny) || 0)) + '</span></div>';
                }).join('') +
                (c.fanamarihana ? '<p style="font-size:0.8rem; margin:0.35rem 0 0; color:var(--muted);">📝 ' + html(c.fanamarihana) + '</p>' : '') +
                '<p style="font-size:0.8rem; margin:0.35rem 0 0;">' + html(NOM_FOMBA[c.fandoavana] || '💳 Tsy voalaza ny fandoavana') +
                  (c.fandoavana_ref ? ' · Réf : <strong>' + html(c.fandoavana_ref) + '</strong>' : '') +
                  ' · ' + (c.voaloa ? '<span style="color:#3ecf8e; font-weight:700;">💰 Voaloa</span>' : '<span style="color:#ffb020;">⏳ Tsy mbola voaloa</span>') + '</p>' +
                '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">' +
                  '<strong style="font-size:0.88rem;">Total : ' + ariary(totalDe(c)) + '</strong>' +
                  '<div style="display:flex; gap:0.35rem; flex-wrap:wrap;">' +
                    '<button type="button" class="btn btn-sm" data-commande="recu" data-id="' + c.id + '" style="width:auto;" title="Reçu">🧾 Reçu</button>' +
                    '<button type="button" class="btn btn-sm" data-commande="voaloa" data-id="' + c.id + '" style="width:auto;">' + (c.voaloa ? '↩️ Tsy voaloa' : '💰 Voaloa') + '</button>' +
                    '<button type="button" class="btn btn-sm" data-commande="vita" data-id="' + c.id + '" style="width:auto;">' + (c.vita ? '↩️ Tsy vita' : '✅ Vita') + '</button>' +
                    '<button type="button" class="btn btn-sm btn-red" data-commande="esory" data-id="' + c.id + '" style="width:auto;">Esorina</button>' +
                  '</div>' +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        }).join('') +
      '</div>';

    zone.querySelector('#commandesVita').addEventListener('click', function () { voirVita = !voirVita; dessinerCommandes(); });
    zone.querySelector('#volaToggle').addEventListener('click', function () { voirVola = !voirVola; dessinerCommandes(); });
    if (zone.querySelector('#volaTehirizo')) zone.querySelector('#volaTehirizo').addEventListener('click', function (e) {
      const vola = {};
      let mauvais = '';
      FOMBA.concat([['tompony']]).forEach(function (f) {
        const v = (zone.querySelector('#vola_' + f[0]).value || '').trim();
        if (f[0] !== 'tompony' && v && !/^\+?[0-9 ]{6,20}$/.test(v)) mauvais = f[1];
        if (v) vola[f[0]] = v.slice(0, 60);
      });
      if (mauvais) { alert('Diso ny laharana ' + mauvais + ' : isa sy espace ihany.'); return; }
      const t = teteLire();
      t.vola = vola;
      teteEcrire(t);
      voirVola = false;
      dessinerCommandes();
    });
    zone.querySelector('#commandesHavaozina').addEventListener('click', function () { chargerCommandes(true); });
    zone.querySelector('#latabatraTehirizo').addEventListener('click', function () {
      const n = Math.round(Number(zone.querySelector('#latabatraIsa').value));
      if (!(n >= 1 && n <= 500)) { alert('Isa 1 ka hatramin\'ny 500.'); return; }
      idDuCompte().then(function (uid) {
        if (!uid) { alert('Midira ao amin\'ny kaontinao aloha.'); return; }
        // Le menu d'abord fondu avec celui en ligne : la ligne existe alors,
        // et l'on n'y change que le nombre de latabatra, sans réécrire les plats.
        return synchroniser().then(function () {
          return sb().from('hotelerie_menu').update({ latabatra: n }).eq('user_id', uid).select('user_id');
        }).then(function (res) {
          if (!res.error && (!res.data || !res.data.length)) {
            return sb().from('hotelerie_menu')
              .upsert({ user_id: uid, plats: lire(), voafafa: fafanaLire(), latabatra: n, updated_at: new Date().toISOString() });
          }
          return res;
        })
          .then(function (res) {
            if (res.error) { alert('Tsy voatahiry : ' + res.error.message); return; }
            nbLatabatra = n;
            dessinerCommandes();
          });
      });
    });
    zone.querySelector('#latabatraAdikao').addEventListener('click', function (e) {
      const n = zone.querySelector('#latabatraRohy').value;
      const bouton = e.target;
      function donner(uid) {
        if (!uid) { alert('Midira ao amin\'ny kaontinao aloha.'); return; }
        copier(rohyLatabatra(uid, n), bouton, '🔗 Adikao');
      }
      if (compte) donner(compte); else idDuCompte().then(donner);
    });
    // La zone reste d'un dessin à l'autre (seul son contenu change) : un seul
    // écouteur pour les boutons des commandes.
    if (zone.dataset.branche) return;
    zone.dataset.branche = '1';
    zone.addEventListener('click', function (e) {
      const ouvrir = e.target.closest('button[data-ouvrir]');
      if (ouvrir) {
        const n = Number(ouvrir.dataset.ouvrir);
        tableOuverte = n === tableOuverte ? 0 : n;
        dessinerCommandes();
        return;
      }
      const qr = e.target.closest('button[data-qr]');
      if (qr) { qrPour([Number(qr.dataset.qr)]); return; }
      const b = e.target.closest('button[data-commande]');
      if (!b) return;
      const c = commandes.find(function (x) { return x.id === b.dataset.id; });
      if (!c) return;
      if (b.dataset.commande === 'recu') { ouvrirRecu(c); return; }
      if (b.dataset.commande === 'esory' && !confirm('Esorina ve ity commande ity (T' + c.latabatra + ') ?')) return;
      b.disabled = true;
      const req = b.dataset.commande === 'vita'
        ? sb().from('hotelerie_commande').update({ vita: !c.vita }).eq('id', c.id)
        : b.dataset.commande === 'voaloa'
          ? sb().from('hotelerie_commande').update({ voaloa: !c.voaloa }).eq('id', c.id)
          : sb().from('hotelerie_commande').delete().eq('id', c.id);
      req.then(function (res) {
        if (res.error) { alert(res.error.message); b.disabled = false; return; }
        chargerCommandes();
      });
    });
  }

  // Le menu par latabatra : un plat sans « tables » se voit partout ; sinon
  // seulement aux latabatra qu'il nomme (menu-sakafo.html filtre de même).
  function champLatabatra(plat) {
    const choisies = plat && Array.isArray(plat.tables) ? plat.tables : null;
    let cases = '';
    for (let n = 1; n <= nbLatabatra; n++) {
      cases += '<label style="display:inline-flex; align-items:center; gap:0.25rem; font-size:0.8rem; padding:0.2rem 0.5rem; border:1px solid var(--line); border-radius:6px; cursor:pointer;">' +
        '<input type="checkbox" value="' + n + '" style="width:auto; margin:0; padding:0; flex:0 0 auto;"' + (choisies && choisies.indexOf(n) >= 0 ? ' checked' : '') + '> T' + n + '</label>';
    }
    return '<div class="field" style="margin:0.6rem 0 0;"><label>Latabatra mahita azy</label>' +
      '<label style="display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer; text-transform:none; letter-spacing:0; white-space:nowrap; margin:0;">' +
        '<input type="checkbox" id="sakafoRehetra" style="width:auto; margin:0; padding:0; flex:0 0 auto;"' + (choisies ? '' : ' checked') + '> Table rehetra</label>' +
      '<div id="sakafoTables" style="display:' + (choisies ? 'flex' : 'none') + '; gap:0.35rem; flex-wrap:wrap; margin-top:0.4rem;">' + cases + '</div>' +
    '</div>';
  }
  // Le nombre de latabatra arrive du serveur après le premier dessin : on
  // refait seulement ce champ, sans toucher à ce qu'on est en train d'écrire.
  function majChampLatabatra() {
    const boite = document.getElementById('sakafoTables');
    if (!boite) return;
    const rehetra = document.getElementById('sakafoRehetra').checked;
    const cochees = [].slice.call(boite.querySelectorAll('input:checked')).map(function (c) { return Number(c.value); });
    const tmp = document.createElement('div');
    tmp.innerHTML = champLatabatra(rehetra ? null : { tables: cochees });
    boite.parentNode.replaceWith(tmp.firstChild);
    document.getElementById('sakafoRehetra').addEventListener('change', function (e) {
      document.getElementById('sakafoTables').style.display = e.target.checked ? 'none' : 'flex';
    });
  }
  function nomsTables(p) {
    return Array.isArray(p.tables) && p.tables.length
      ? p.tables.slice().sort(function (a, b) { return a - b; }).map(function (n) { return 'T' + n; }).join(', ')
      : '';
  }

  function rendre() {
    majLogoMenu();
    const z = document.querySelector('.hotelerie');
    if (!z) return;
    const plats = lire();
    const plat = enCours ? plats.find(function (p) { return p.id === enCours; }) : null;
    if (enCours && !plat) enCours = null;

    const t = teteLire();
    // Sans sary choisi : le logo de Ny asako.
    const logo = '<img src="' + html(t.sary || LOGO_DEFAUT) + '" alt="" style="width:2.2rem; height:2.2rem; object-fit:cover; border-radius:8px; vertical-align:middle; border:1px solid var(--line);">';
    const tete =
      '<div class="section-head"><div style="min-width:0; flex:1 1 auto;">' +
        (ovayAnarana
          ? '<div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; margin-bottom:0.4rem;">' +
              '<input id="hotelAnarana" type="text" maxlength="60" value="' + html(nomHotel()) + '" aria-label="Anaran\'ny hotely" style="flex:1 1 200px; ' + CHAMP + '">' +
              '<button type="button" class="btn btn-sm btn-primary" id="hotelAnaranaTehirizo" style="width:auto;">💾 Tehirizo</button>' +
              '<button type="button" class="btn btn-sm" id="hotelAnaranaAtsahatra" style="width:auto;">Atsahatra</button>' +
            '</div>'
          : '<h2 style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">' +
              '<button type="button" id="hotelLogo" title="Ovay ny sary" aria-label="Ovay ny sary" style="background:none; border:0; padding:0; cursor:pointer; font:inherit; line-height:1;">' + logo + '</button>' +
              '<span>' + html(nomHotel()) + '</span>' +
              '<button type="button" class="btn btn-sm" id="hotelAnaranaOvay" title="Ovay ny anarana" aria-label="Ovay ny anarana" style="width:auto; padding:0.2rem 0.45rem; font-size:0.95rem; line-height:1;">✏️</button>' +
              '<button type="button" class="btn btn-sm" id="hotelLogoOvay" title="Ovay ny sary" aria-label="Ovay ny sary" style="width:auto; padding:0.2rem 0.45rem; font-size:0.95rem; line-height:1;">🖼️</button>' +
              (t.sary ? '<button type="button" class="btn btn-sm" id="hotelLogoEsory" title="Esory ny sary" aria-label="Esory ny sary" style="width:auto; padding:0.2rem 0.45rem; font-size:0.95rem; line-height:1;">✕</button>' : '') +
            '</h2>') +
        '<p>Ny menu sakafo an\'ny hotely sy ny commande an\'ny mpanjifa isaky ny latabatra.</p></div></div>' +
      '<div class="dash-tabs" style="margin-bottom:1rem; display:flex; gap:0.4rem; flex-wrap:wrap;">' +
        '<button type="button" class="dash-tab' + (onglet === 'menu' ? ' active' : '') + '" data-onglet="menu" style="width:auto;">🍽️ Menu sakafo</button>' +
        '<button type="button" class="dash-tab' + (onglet === 'commandes' ? ' active' : '') + '" data-onglet="commandes" style="width:auto;">🛎️ Commandes' +
          (nbVaovao ? ' <span style="background:#ff6b6b; color:#fff; font-size:0.7rem; font-weight:700; border-radius:999px; padding:0 6px; margin-left:4px;">' + nbVaovao + '</span>' : '') +
        '</button>' +
      '</div>';
    if (onglet === 'commandes') {
      z.innerHTML = tete + '<div id="commandesZone"></div>';
      brancherOnglets(z);
      dessinerCommandes();
      return;
    }

    z.innerHTML = tete +
      '<div class="panel">' +
        '<h4 style="margin:0 0 0.8rem;">' + (plat ? '✏️ Ovay ny sakafo' : '＋ Sakafo vaovao') + '</h4>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.6rem;">' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoAnarana">Anarana</label>' +
            '<input id="sakafoAnarana" type="text" placeholder="Ex: Romazava" value="' + html(plat ? plat.anarana : '') + '"></div>' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoSokajy">Sokajy</label>' +
            '<select id="sakafoSokajy">' + SOKAJY.map(function (s) {
              return '<option value="' + s[0] + '"' + (plat && plat.sokajy === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
            }).join('') + '</select></div>' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoVidiny">Vidiny (Ar)</label>' +
            '<input id="sakafoVidiny" type="number" min="0" step="100" placeholder="Ex: 12000" value="' + html(plat ? plat.vidiny : '') + '"></div>' +
        '</div>' +
        '<div class="field" style="margin:0.6rem 0 0;"><label for="sakafoFamaritana">Famaritana (raha misy)</label>' +
          '<input id="sakafoFamaritana" type="text" placeholder="Ex: hena kisoa, anamamy, vary" value="' + html(plat ? plat.famaritana : '') + '"></div>' +
        champLatabatra(plat) +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.8rem;">' +
          '<button type="button" class="btn btn-sm btn-primary" id="sakafoTehirizo" style="width:auto;">💾 Tehirizo</button>' +
          (plat ? '<button type="button" class="btn btn-sm" id="sakafoAtsahatra" style="width:auto;">Ajanony</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="panel" style="margin-top:1rem;">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
          '<input id="sakafoRecherche" type="search" placeholder="Karohy sakafo..." value="' + html(recherche) + '" style="flex:1 1 160px; min-width:0; ' + CHAMP + '">' +
          '<span style="font-size:0.78rem; color:var(--muted);">' + plats.length + ' sakafo</span>' +
        '</div>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">' +
          '<button type="button" class="btn btn-sm" id="sakafoAdikao" style="width:auto;">📋 Adikao ny menu</button>' +
          '<button type="button" class="btn btn-sm" id="sakafoRohy" style="width:auto;">🔗 Rohy ny menu</button>' +
        '</div>' +
        '<div id="sakafoRohyBoaty" style="display:none; margin-top:0.6rem;">' +
          '<input id="sakafoRohyInput" type="text" readonly style="width:100%; box-sizing:border-box; ' + CHAMP + '">' +
          '<p id="sakafoRohyNote" style="font-size:0.75rem; color:var(--muted); margin:0.3rem 0 0;"></p>' +
        '</div>' +
        '<p id="sakafoEnLigne" style="font-size:0.75rem; color:var(--muted); margin:0.4rem 0 0;">' + html(etatEnLigne) + '</p>' +
        '<div id="sakafoListe" style="margin-top:0.8rem;"></div>' +
      '</div>';

    dessinerListe(z, plats);
    brancherOnglets(z);
    z.querySelector('#sakafoRehetra').addEventListener('change', function (e) {
      z.querySelector('#sakafoTables').style.display = e.target.checked ? 'none' : 'flex';
    });

    z.querySelector('#sakafoRecherche').addEventListener('input', function (e) {
      recherche = e.target.value;
      dessinerListe(z, lire());
    });
    z.querySelector('#sakafoTehirizo').addEventListener('click', function () {
      const anarana = z.querySelector('#sakafoAnarana').value.trim();
      const vidiny = Number(z.querySelector('#sakafoVidiny').value);
      if (!anarana) { alert('Soraty ny anaran\'ny sakafo.'); return; }
      if (!(vidiny >= 0) || z.querySelector('#sakafoVidiny').value === '') { alert('Soraty ny vidiny.'); return; }
      const donnees = {
        anarana: anarana,
        sokajy: z.querySelector('#sakafoSokajy').value,
        vidiny: vidiny,
        famaritana: z.querySelector('#sakafoFamaritana').value.trim()
      };
      const rehetra = z.querySelector('#sakafoRehetra').checked;
      const tables = [].slice.call(z.querySelectorAll('#sakafoTables input:checked'))
        .map(function (c) { return Number(c.value); });
      if (!rehetra && !tables.length) { alert('Safidio ny latabatra hahitana azy, na « Table rehetra ».'); return; }
      const liste = lire();
      const i = enCours ? liste.findIndex(function (p) { return p.id === enCours; }) : -1;
      donnees.maj = Date.now();
      if (i >= 0) Object.assign(liste[i], donnees);
      else liste.push(Object.assign({ id: nouvelId(), misy: true }, donnees));
      const cible = liste[i >= 0 ? i : liste.length - 1];
      if (rehetra) delete cible.tables; else cible.tables = tables;
      if (ecrire(liste)) { enCours = null; rendre(); }
    });
    z.querySelector('#sakafoAdikao').addEventListener('click', function (e) {
      const texte = texteDuMenu(lire());
      if (!texte) { alert('Mbola tsy misy sakafo misy ao amin\'ny menu.'); return; }
      copier(texte, e.target, '📋 Adikao ny menu');
    });
    z.querySelector('#sakafoRohy').addEventListener('click', function (e) {
      if (!platsVisibles(lire()).length) { alert('Mbola tsy misy sakafo misy ao amin\'ny menu.'); return; }
      const bouton = e.target;
      // Le compte est d'ordinaire déjà connu (synchroniser, à l'ouverture) : le lien
      // se copie alors dans le geste même, ce que certains téléphones exigent.
      function montrer(uid) {
        const rohy = uid
          ? location.origin + '/menu-sakafo.html?id=' + uid
          : rohyDuMenu(lire());
        const champ = z.querySelector('#sakafoRohyInput');
        z.querySelector('#sakafoRohyBoaty').style.display = '';
        champ.value = rohy;
        champ.select();
        z.querySelector('#sakafoRohyNote').textContent = uid
          ? 'Alefaso amin\'ny Messenger, WhatsApp... Indray mandeha ihany : miova ho azy ny menu ao aminy isaky ny manova ianao. Afaka « 📲 Installer » eo amin\'ny telefaonina koa ilay rohy.'
          : 'Tsy tafiditra ianao : ny menu ankehitriny ihany no ao anatin\'ity rohy ity. Midira mba hiova ho azy ny rohy.';
        copier(rohy, bouton, '🔗 Rohy ny menu');
      }
      if (compte) montrer(compte); else idDuCompte().then(montrer);
      // Le lien ne vaut que si la ligne existe : on remonte le menu au moment
      // même où on le donne.
      synchroniser();
    });
    const atsahatra = z.querySelector('#sakafoAtsahatra');
    if (atsahatra) atsahatra.addEventListener('click', function () { enCours = null; rendre(); });

    z.querySelector('#sakafoListe').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const liste = lire();
      const i = liste.findIndex(function (p) { return p.id === b.dataset.id; });
      if (i < 0) return;
      if (b.dataset.action === 'ovay') {
        enCours = liste[i].id;
        rendre();
        z.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (b.dataset.action === 'misy') {
        liste[i].misy = !liste[i].misy;
        liste[i].maj = Date.now();
        if (ecrire(liste)) rendre();
      } else if (b.dataset.action === 'sary') {
        choisirSary(b, liste[i].id);
      } else if (b.dataset.action === 'tsysary') {
        if (!confirm('Esorina ve ny sarin\'i « ' + liste[i].anarana + ' » ?')) return;
        effacerSary(liste[i].sary);
        delete liste[i].sary;
        liste[i].maj = Date.now();
        if (ecrire(liste)) rendre();
      } else if (b.dataset.action === 'esory') {
        if (!confirm('Esorina ve « ' + liste[i].anarana + ' » ?')) return;
        if (enCours === liste[i].id) enCours = null;
        effacerSary(liste[i].sary);
        fafanaAjouter(liste[i].id);
        liste.splice(i, 1);
        if (ecrire(liste)) rendre();
      }
    });
  }

  // Le bouton « 🖼️ Sary » : on ouvre le dossier de l'appareil, on envoie la
  // photo choisie, et le plat la garde. La liste se relit après l'envoi : un
  // autre appareil a pu la changer pendant ce temps.
  function choisirSary(bouton, id) {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'image/*';
    champ.addEventListener('change', function () {
      const f = champ.files && champ.files[0];
      if (!f) return;
      const texte = bouton.textContent;
      bouton.disabled = true;
      bouton.textContent = '⏳ Alefa...';
      envoyerSary(id, f).then(function (adresse) {
        const liste = lire();
        const p = liste.find(function (x) { return x.id === id; });
        if (!p) { effacerSary(adresse); return; }
        if (p.sary && p.sary !== adresse) effacerSary(p.sary);
        p.sary = adresse;
        p.maj = Date.now();
        if (ecrire(liste)) rendre();
      }).catch(function (e) {
        bouton.disabled = false;
        bouton.textContent = texte;
        alert('Tsy tafiditra ny sary' + (e && e.message ? ' : ' + e.message : '.'));
      });
    });
    champ.click();
  }

  // Les plats « misy » seulement, dans l'ordre des sokajy : c'est ce que le
  // client doit voir, que ce soit en texte collé ou par le lien.
  function platsVisibles(plats) {
    const ordre = SOKAJY.map(function (s) { return s[0]; });
    return plats.filter(function (p) { return p.misy; }).sort(function (a, b) {
      const d = ordre.indexOf(a.sokajy) - ordre.indexOf(b.sokajy);
      return d || a.anarana.localeCompare(b.anarana, 'fr');
    });
  }
  function texteDuMenu(plats) {
    const visibles = platsVisibles(plats);
    if (!visibles.length) return '';
    const lignes = ['🏨 ' + nomHotel() + ' — 🍽️ Menu sakafo'];
    let courant = null;
    visibles.forEach(function (p) {
      if (p.sokajy !== courant) { courant = p.sokajy; lignes.push('', nomSokajy(courant)); }
      lignes.push('• ' + p.anarana + ' : ' + ariary(p.vidiny) + (p.famaritana ? ' (' + p.famaritana + ')' : ''));
    });
    return lignes.join('\n');
  }
  // Le menu voyage dans le lien lui-même, après le « # » : il n'y a rien à
  // publier sur le serveur, et le fragment n'y est jamais envoyé.
  function rohyDuMenu(plats) {
    const visibles = platsVisibles(plats);
    if (!visibles.length) return '';
    const donnees = JSON.stringify(visibles.map(function (p) {
      return [p.anarana, p.sokajy, p.vidiny, p.famaritana || ''];
    }));
    const octets = new TextEncoder().encode(donnees);
    let bin = '';
    octets.forEach(function (o) { bin += String.fromCharCode(o); });
    const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + '/menu-sakafo.html#m=' + code;
  }
  function copier(texte, bouton, libelle) {
    function fait() {
      bouton.textContent = '✅ Voadika';
      setTimeout(function () { bouton.textContent = libelle; }, 1800);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texte).then(fait, function () { copierVieux(texte); fait(); });
    } else { copierVieux(texte); fait(); }
  }
  function copierVieux(texte) {
    const t = document.createElement('textarea');
    t.value = texte;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (e) { }
    t.remove();
  }

  function dessinerListe(z, plats) {
    const boite = z.querySelector('#sakafoListe');
    const q = recherche.trim().toLowerCase();
    const trouves = plats.filter(function (p) {
      return !q || (p.anarana + ' ' + (p.famaritana || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!trouves.length) {
      boite.innerHTML = '<p class="empty-hint" style="margin:0;">' +
        (plats.length ? 'Tsy misy mifanaraka.' : 'Mbola tsy misy sakafo ao amin\'ny menu.') + '</p>';
      return;
    }
    // Les sokajy connus d'abord, dans leur ordre ; puis ce qui viendrait d'ailleurs.
    const ordre = SOKAJY.map(function (s) { return s[0]; });
    trouves.forEach(function (p) { if (ordre.indexOf(p.sokajy) < 0) ordre.push(p.sokajy); });
    boite.innerHTML = ordre.map(function (c) {
      const groupe = trouves.filter(function (p) { return p.sokajy === c; })
        .sort(function (a, b) { return a.anarana.localeCompare(b.anarana, 'fr'); });
      if (!groupe.length) return '';
      return '<h4 style="margin:0.8rem 0 0.5rem; font-size:0.9rem;">' + html(nomSokajy(c)) + '</h4>' +
        groupe.map(function (p) {
          return '<div style="display:flex; gap:0.6rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:0.5rem; padding:0.6rem 0.8rem; border-radius:8px; border:1px solid var(--line);' +
              (p.misy ? '' : ' opacity:0.55;') + '">' +
            (p.sary ? '<img src="' + html(p.sary) + '" alt="" loading="lazy" style="width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid var(--line); flex:0 0 auto;">' : '') +
            '<div style="flex:1 1 180px; min-width:0;">' +
              '<strong style="font-size:0.88rem;">' + html(p.anarana) + '</strong>' +
              (p.misy ? '' : ' <span style="font-size:0.7rem; color:#ff6b6b;">· Lany</span>') +
              (nomsTables(p) ? '<span style="display:block; font-size:0.72rem; color:var(--cyan); margin-top:0.2rem;">🍽️ ' + html(nomsTables(p)) + ' ihany</span>' : '') +
              (p.famaritana ? '<span style="display:block; font-size:0.78rem; color:var(--muted); margin-top:0.2rem;">' + html(p.famaritana) + '</span>' : '') +
            '</div>' +
            '<strong style="font-size:0.88rem; color:var(--cyan); white-space:nowrap;">' + ariary(p.vidiny) + '</strong>' +
            '<div style="display:flex; gap:0.35rem; flex-wrap:wrap; flex-basis:100%;">' +
              '<button type="button" class="btn btn-sm" data-action="misy" data-id="' + p.id + '" style="width:auto;">' + (p.misy ? '✅ Misy' : '⛔ Lany') + '</button>' +
              '<button type="button" class="btn btn-sm" data-action="ovay" data-id="' + p.id + '" style="width:auto;">✏️ Ovay</button>' +
              '<button type="button" class="btn btn-sm" data-action="sary" data-id="' + p.id + '" style="width:auto;">🖼️ ' + (p.sary ? 'Ovay sary' : 'Sary') + '</button>' +
              (p.sary ? '<button type="button" class="btn btn-sm" data-action="tsysary" data-id="' + p.id + '" style="width:auto;" title="Esory ny sary">✕ Sary</button>' : '') +
              '<button type="button" class="btn btn-sm btn-red" data-action="esory" data-id="' + p.id + '" style="width:auto;">Esorina</button>' +
            '</div>' +
          '</div>';
        }).join('');
    }).join('');
  }

  function demarrer() {
    rendre();
    synchroniser();
    // Une icône posée plus tard (rangée, fond) est une copie de l'entrée :
    // on la remet au logo du moment de temps en temps.
    setInterval(majLogoMenu, 3000);
    chargerCommandes();
    // Le menu aussi : ce qu'un autre appareil vient d'y mettre arrive ici.
    setInterval(function () { if (!document.hidden && compte) { chargerCommandes(); synchroniser(); } }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && compte) synchroniser(); });
    // La session arrive parfois après le chargement : on retente à l'entrée.
    const c = sb();
    if (c && c.auth) {
      try {
        c.auth.onAuthStateChange(function (event) {
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') { synchroniser(); chargerCommandes(); }
          if (event === 'SIGNED_OUT') { compte = null; }
        });
      } catch (e) { }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

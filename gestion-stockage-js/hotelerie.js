// Hasina Hôtellerie : le menu sakafo de l'hôtel.
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
      return sb().from('hotelerie_menu').select('plats,voafafa').eq('user_id', uid).maybeSingle()
        .then(function (res) {
          if (res.error) throw new Error(res.error.message);
          const ici = lire();
          const enLigne = res.data && Array.isArray(res.data.plats) ? res.data.plats : [];
          const fafanaLa = res.data && Array.isArray(res.data.voafafa) ? res.data.voafafa : [];
          const fafana = fafanaLire().concat(fafanaLa.filter(function (x) { return fafanaLire().indexOf(x) < 0; }));
          const fondu = fondre(ici, enLigne, fafana);
          try {
            localStorage.setItem(CLE, JSON.stringify(fondu));
            localStorage.setItem(CLE_FAFANA, JSON.stringify(fafana));
          } catch (e) { }
          if (!memes(fondu, ici)) redessinerSiLibre();
          // Rien ici, rien en ligne : pas de ligne vide pour chaque compte
          // qui ouvre simplement l'application.
          if (!res.data && !fondu.length && !fafana.length) { direEnLigne(''); return; }
          if (res.data && memes(fondu, enLigne) && memes(fafana, fafanaLa)) {
            direEnLigne('✅ Efa miova ho azy ny rohy.');
            return;
          }
          return sb().from('hotelerie_menu')
            .upsert({ user_id: uid, plats: fondu, voafafa: fafana, updated_at: new Date().toISOString() })
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
        sb().from('hotelerie_commande').select('id,latabatra,plats,fanamarihana,vita,created_at')
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
  // ---------- Les latabatra, et le menu de chacune ----------
  // Toutes les latabatra en boutons ; celle qu'on ouvre montre son menu
  // (les plats « misy » qui la concernent), et l'on y prend la commande à la
  // place du client — un serveur, un client sans téléphone.
  let tableOuverte = 0;
  const panierTable = {};   // id du plat → nombre, pour la table ouverte
  let noteTable = '';
  function platsDeLaTable(n) {
    return lire().filter(function (p) {
      return p.misy && (!Array.isArray(p.tables) || !p.tables.length || p.tables.indexOf(n) >= 0);
    }).sort(function (a, b) {
      const o = SOKAJY.map(function (s) { return s[0]; });
      return (o.indexOf(a.sokajy) - o.indexOf(b.sokajy)) || a.anarana.localeCompare(b.anarana, 'fr');
    });
  }
  function blocLatabatra(enAttente) {
    let boutons = '';
    for (let n = 1; n <= nbLatabatra; n++) {
      const actif = n === tableOuverte;
      boutons += '<button type="button" class="btn btn-sm" data-ouvrir="' + n + '" style="width:auto; position:relative;' +
        (actif ? ' border-color:var(--cyan); color:var(--cyan); background:rgba(79,216,224,0.12);' : '') + '">🍽️ Table ' + n +
        (enAttente[n] ? ' <span style="background:#ff6b6b; color:#fff; font-size:0.68rem; font-weight:700; border-radius:999px; padding:0 5px; margin-left:3px;">' + enAttente[n] + '</span>' : '') +
        '</button>';
    }
    let corps = '';
    if (tableOuverte) {
      const plats = platsDeLaTable(tableOuverte);
      Object.keys(panierTable).forEach(function (k) {
        if (!plats.some(function (p) { return p.id === k; })) delete panierTable[k];
      });
      let courant = null;
      const total = plats.reduce(function (s, p) { return s + (panierTable[p.id] || 0) * (Number(p.vidiny) || 0); }, 0);
      const isa = Object.keys(panierTable).reduce(function (s, k) { return s + panierTable[k]; }, 0);
      corps = '<div style="margin-top:0.9rem; border-top:1px solid var(--line); padding-top:0.8rem;">' +
        '<h4 style="margin:0 0 0.4rem;">📋 Menu — Table ' + tableOuverte + '</h4>' +
        (plats.length ? plats.map(function (p) {
          let titre = '';
          if (p.sokajy !== courant) { courant = p.sokajy; titre = '<p style="margin:0.6rem 0 0.3rem; font-size:0.82rem; font-weight:700;">' + html(nomSokajy(courant)) + '</p>'; }
          const n = panierTable[p.id] || 0;
          return titre + '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding:0.45rem 0.6rem; margin-bottom:0.35rem; border:1px solid ' + (n ? 'var(--cyan)' : 'var(--line)') + '; border-radius:8px;">' +
            '<div style="flex:1 1 140px; min-width:0;"><strong style="font-size:0.86rem;">' + html(p.anarana) + '</strong>' +
              (p.famaritana ? '<span style="display:block; font-size:0.74rem; color:var(--muted);">' + html(p.famaritana) + '</span>' : '') + '</div>' +
            '<span style="font-size:0.84rem; color:var(--cyan); font-weight:700; white-space:nowrap;">' + ariary(p.vidiny) + '</span>' +
            '<div style="display:flex; align-items:center; gap:0.3rem;">' +
              '<button type="button" class="btn btn-sm" data-panier="-1" data-id="' + p.id + '" style="width:auto; padding:0.1rem 0.6rem;">−</button>' +
              '<strong style="min-width:1.4rem; text-align:center;">' + n + '</strong>' +
              '<button type="button" class="btn btn-sm" data-panier="1" data-id="' + p.id + '" style="width:auto; padding:0.1rem 0.6rem;">+</button>' +
            '</div>' +
          '</div>';
        }).join('') : '<p class="empty-hint" style="margin:0;">Tsy misy sakafo « misy » ho an\'ity latabatra ity.</p>') +
        (plats.length
          ? '<input id="tableNote" type="text" maxlength="300" placeholder="Fanamarihana (raha misy)" value="' + html(noteTable) + '" style="width:100%; box-sizing:border-box; margin-top:0.5rem; ' + CHAMP + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">' +
              '<strong style="font-size:0.9rem;">' + (isa ? isa + ' zavatra · ' + ariary(total) : 'Tsindrio ny « + »') + '</strong>' +
              '<button type="button" class="btn btn-sm btn-primary" id="tableAjouter" style="width:auto;"' + (isa ? '' : ' disabled') + '>➕ Ampio ny commande</button>' +
            '</div>'
          : '') +
      '</div>';
    }
    return '<div class="panel" style="margin-top:1rem;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">' +
        '<h4 style="margin:0;">🍽️ Latabatra</h4>' +
        (tableOuverte ? '<button type="button" class="btn btn-sm" data-ouvrir="0" style="width:auto;">✕ Hidio ny Table ' + tableOuverte + '</button>' : '') +
      '</div>' +
      '<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;">' + boutons + '</div>' +
      corps +
    '</div>';
  }
  function ajouterCommandeTable(bouton) {
    const plats = platsDeLaTable(tableOuverte);
    const lignes = plats.filter(function (p) { return panierTable[p.id]; })
      .map(function (p) { return { anarana: p.anarana, vidiny: Number(p.vidiny) || 0, isa: panierTable[p.id] }; });
    if (!lignes.length) return;
    bouton.disabled = true;
    bouton.textContent = '⏳ Alefa...';
    idDuCompte().then(function (uid) {
      if (!uid) throw new Error('Midira ao amin\'ny kaontinao aloha.');
      return sb().from('hotelerie_commande').insert({
        hotel_id: uid, latabatra: tableOuverte, plats: lignes, fanamarihana: noteTable.trim() || null
      });
    }).then(function (res) {
      if (res && res.error) throw new Error(res.error.message);
      Object.keys(panierTable).forEach(function (k) { delete panierTable[k]; });
      noteTable = '';
      chargerCommandes(true);
    }).catch(function (e) {
      alert('Tsy lasa ny commande : ' + (e && e.message ? e.message : 'jereo ny connexion.'));
      dessinerCommandes();
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
    for (let i = 1; i <= nbLatabatra; i++) options += '<option value="' + i + '">Table ' + i + '</option>';

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
        '<p style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0 0;">Ny rohy isaky ny latabatra dia efa misafidy ny latabatra ho an\'ny mpanjifa (azo atao QR eo ambony latabatra). Sokafy amin\'ny téléphone na tablette eo amin\'ilay latabatra, dia « 📲 Installer » : lasa appli « Table N » manokana izy.</p>' +
      '</div>' +
      blocLatabatra(enAttente) +
      '<div class="panel" style="margin-top:1rem;">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">' +
          '<strong style="font-size:0.9rem;">' + (tableOuverte
            ? 'Table ' + tableOuverte + ' : ' + (enAttente[tableOuverte] || 0) + ' commande mbola tsy vita'
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
          return '<div style="margin-top:1rem; border:1px solid var(--cyan); border-radius:10px; padding:0.7rem 0.8rem;">' +
            '<div style="display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
              '<h4 style="margin:0; font-size:1rem;">🍽️ Table ' + t + '</h4>' +
              (reste ? '<strong style="color:var(--cyan); font-size:0.88rem;">' + ariary(reste) + '</strong>' : '') +
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
                '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">' +
                  '<strong style="font-size:0.88rem;">Total : ' + ariary(totalDe(c)) + '</strong>' +
                  '<div style="display:flex; gap:0.35rem; flex-wrap:wrap;">' +
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
    zone.addEventListener('input', function (e) {
      if (e.target.id === 'tableNote') noteTable = e.target.value;
    });
    zone.addEventListener('click', function (e) {
      const ouvrir = e.target.closest('button[data-ouvrir]');
      if (ouvrir) {
        const n = Number(ouvrir.dataset.ouvrir);
        tableOuverte = n === tableOuverte ? 0 : n;
        Object.keys(panierTable).forEach(function (k) { delete panierTable[k]; });
        noteTable = '';
        dessinerCommandes();
        return;
      }
      const pan = e.target.closest('button[data-panier]');
      if (pan) {
        const v = Math.max(0, Math.min(50, (panierTable[pan.dataset.id] || 0) + Number(pan.dataset.panier)));
        if (v) panierTable[pan.dataset.id] = v; else delete panierTable[pan.dataset.id];
        dessinerCommandes();
        return;
      }
      const ajout = e.target.closest('#tableAjouter');
      if (ajout) { ajouterCommandeTable(ajout); return; }
      const b = e.target.closest('button[data-commande]');
      if (!b) return;
      const c = commandes.find(function (x) { return x.id === b.dataset.id; });
      if (!c) return;
      if (b.dataset.commande === 'esory' && !confirm('Esorina ve ity commande ity (Table ' + c.latabatra + ') ?')) return;
      b.disabled = true;
      const req = b.dataset.commande === 'vita'
        ? sb().from('hotelerie_commande').update({ vita: !c.vita }).eq('id', c.id)
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
        '<input type="checkbox" value="' + n + '"' + (choisies && choisies.indexOf(n) >= 0 ? ' checked' : '') + '> Table ' + n + '</label>';
    }
    return '<div class="field" style="margin:0.6rem 0 0;"><label>Latabatra mahita azy</label>' +
      '<label style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.85rem; cursor:pointer; text-transform:none; letter-spacing:0;">' +
        '<input type="checkbox" id="sakafoRehetra"' + (choisies ? '' : ' checked') + '> Table rehetra</label>' +
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
      ? p.tables.slice().sort(function (a, b) { return a - b; }).map(function (n) { return 'Table ' + n; }).join(', ')
      : '';
  }

  function rendre() {
    const z = document.querySelector('.hotelerie');
    if (!z) return;
    const plats = lire();
    const plat = enCours ? plats.find(function (p) { return p.id === enCours; }) : null;
    if (enCours && !plat) enCours = null;

    const tete =
      '<div class="section-head"><div><h2>🏨 Hasina Hôtellerie</h2>' +
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
    const lignes = ['🏨 Hasina Hôtellerie — 🍽️ Menu sakafo'];
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

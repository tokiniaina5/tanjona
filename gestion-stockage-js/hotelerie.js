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
  const CLE_MAJ = CLE + '_maj';
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
    try {
      localStorage.setItem(CLE, JSON.stringify(liste));
      localStorage.setItem(CLE_MAJ, String(Date.now()));
    } catch (e) {
      alert('Tsy voatahiry : feno ny toerana ao amin\'ity navigateur ity.');
      return false;
    }
    envoyer(liste);
    return true;
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
  function direEnLigne(t) {
    etatEnLigne = t;
    const p = document.getElementById('sakafoEnLigne');
    if (p) p.textContent = t;
  }
  function envoyer(liste) {
    idDuCompte().then(function (uid) {
      if (!uid) return;
      direEnLigne('⏳ Alefa any amin\'ny rohy...');
      sb().from('hotelerie_menu')
        .upsert({ user_id: uid, plats: liste, updated_at: new Date().toISOString() })
        .then(function (res) {
          direEnLigne(res && res.error
            ? '⚠️ Tsy tonga tany amin\'ny rohy : ' + res.error.message
            : '✅ Efa miova ho azy ny rohy.');
        }, function () { direEnLigne('⚠️ Tsy tonga tany amin\'ny rohy (tsy misy connexion ?).'); });
    });
  }
  // À l'ouverture : la copie en ligne l'emporte si elle est plus récente (un
  // autre appareil l'a changée) ; sinon c'est celle d'ici qui monte, pour
  // qu'un menu fait avant la mise en ligne n'attende pas le prochain changement.
  let dejaTire = false;
  function tirer() {
    idDuCompte().then(function (uid) {
      if (!uid || dejaTire) return;
      dejaTire = true;
      sb().from('hotelerie_menu').select('plats,updated_at').eq('user_id', uid).maybeSingle()
        .then(function (res) {
          if (!res || res.error) return;
          const ici = Number(localStorage.getItem(CLE_MAJ) || 0);
          const la = res.data ? Date.parse(res.data.updated_at) : 0;
          if (res.data && la > ici && Array.isArray(res.data.plats)) {
            try {
              localStorage.setItem(CLE, JSON.stringify(res.data.plats));
              localStorage.setItem(CLE_MAJ, String(la));
            } catch (e) { }
            rendre();
          // Pas encore de ligne en ligne : le menu d'ici monte, même fait
          // avant que la date du dernier changement ne soit notée (ici = 0).
          } else if (lire().length && (!res.data || ici > la)) {
            envoyer(lire());
          }
        }, function () { });
    });
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
  function chargerCommandes() {
    return idDuCompte().then(function (uid) {
      if (!uid) { etatCommandes = 'Midira ao amin\'ny kaontinao mba hahitana ny commande.'; return; }
      return Promise.all([
        sb().from('hotelerie_commande').select('id,latabatra,plats,fanamarihana,vita,created_at')
          .eq('hotel_id', uid).order('created_at', { ascending: false }).limit(300),
        sb().from('hotelerie_menu').select('latabatra').eq('user_id', uid).maybeSingle()
      ]).then(function (r) {
        if (r[0].error) { etatCommandes = '⚠️ ' + r[0].error.message; return; }
        commandes = r[0].data || [];
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
      if (onglet === 'commandes') dessinerCommandes();
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
  function dessinerCommandes() {
    const zone = document.getElementById('commandesZone');
    if (!zone) return;
    const visibles = commandes.filter(function (c) { return voirVita || !c.vita; });
    const parTable = {};
    visibles.forEach(function (c) { (parTable[c.latabatra] = parTable[c.latabatra] || []).push(c); });
    const tables = Object.keys(parTable).map(Number).sort(function (a, b) { return a - b; });

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
        '<p style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0 0;">Ny rohy isaky ny latabatra dia efa misafidy ny latabatra ho an\'ny mpanjifa (azo atao QR eo ambony latabatra).</p>' +
      '</div>' +
      '<div class="panel" style="margin-top:1rem;">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">' +
          '<strong style="font-size:0.9rem;">' + nbVaovao + ' commande mbola tsy vita</strong>' +
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
    zone.querySelector('#commandesHavaozina').addEventListener('click', function () { chargerCommandes(); });
    zone.querySelector('#latabatraTehirizo').addEventListener('click', function () {
      const n = Math.round(Number(zone.querySelector('#latabatraIsa').value));
      if (!(n >= 1 && n <= 500)) { alert('Isa 1 ka hatramin\'ny 500.'); return; }
      idDuCompte().then(function (uid) {
        if (!uid) { alert('Midira ao amin\'ny kaontinao aloha.'); return; }
        return sb().from('hotelerie_menu')
          .upsert({ user_id: uid, plats: lire(), latabatra: n, updated_at: new Date().toISOString() })
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
      // Le compte est d'ordinaire déjà connu (tirer, à l'ouverture) : le lien
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
      envoyer(lire());
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
        if (ecrire(liste)) rendre();
      } else if (b.dataset.action === 'esory') {
        if (!confirm('Esorina ve « ' + liste[i].anarana + ' » ?')) return;
        if (enCours === liste[i].id) enCours = null;
        liste.splice(i, 1);
        if (ecrire(liste)) rendre();
      }
    });
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
              '<button type="button" class="btn btn-sm btn-red" data-action="esory" data-id="' + p.id + '" style="width:auto;">Esorina</button>' +
            '</div>' +
          '</div>';
        }).join('');
    }).join('');
  }

  function demarrer() {
    rendre();
    tirer();
    chargerCommandes();
    setInterval(function () { if (!document.hidden && compte) chargerCommandes(); }, 15000);
    // La session arrive parfois après le chargement : on retente à l'entrée.
    const c = sb();
    if (c && c.auth) {
      try {
        c.auth.onAuthStateChange(function (event) {
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') { tirer(); chargerCommandes(); }
          if (event === 'SIGNED_OUT') { compte = null; dejaTire = false; }
        });
      } catch (e) { }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

// Livre de famille : le livret, et ceux qui y sont inscrits.
//
// Le livret EST le registre des gens : le nom, la pièce d'identité et la
// naissance s'écrivent ici, et nulle part ailleurs. Les adidy et les taratasy
// y prennent leurs personnes (window.__personnesDuFokontany).
//
// Le mariage des parents est porté par le livret : c'est de lui que la famille
// date, et c'est ce qui sépare un livre de famille d'une simple liste.
//
// Tout vit dans Supabase (supabase/sql/supabase-fianakaviana.sql).

(function () {
  if (!document.getElementById('famListe')) return;

  function $(id) { return document.getElementById(id); }

  // Le Commun lit les registres de tous les fokontany ; partout ailleurs, on
  // ne lit que les siens (fokontany-app.js pose __lectureCommun).
  function mien(requete, email) {
    if (typeof window.__lectureCommun === 'function' && window.__lectureCommun()) return requete;
    return requete.eq('owner_email', email);
  }

  // Ce qui se fait ici se retrouve sous la cloche : les avis restent dans le
  // site, et se relisent (fokontany-app.js, common.js).
  function avertir(message) {
    if (typeof window.__ajouterNotificationAction === 'function') {
      window.__ajouterNotificationAction('modification', message);
    }
  }

  const ANDRAIKITRA ={ ray: 'Ray', reny: 'Reny', zanaka: 'Zanaka', hafa: 'Hafa' };
  // L'ordre du livret : les parents d'abord, les enfants ensuite.
  const RANG = { ray: 0, reny: 1, zanaka: 2, hafa: 3 };

  let familles = [];
  let mpikambana = [];
  let ouvert = null;      // le livret ouvert
  let enEdition = null;   // le livret qu'on corrige

  function sb() {
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function cleOlona(nom) {
    return String(nom || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function dateFr(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
  }
  function dire(id, texte, erreur) {
    const el = $(id);
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function expliquer(res) {
    const e = res && res.error;
    if (!e) return '';
    const m = String(e.message || '');
    if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
      return 'Mbola tsy misy ny table « fianakaviana » ao amin\'ny Supabase (supabase-fianakaviana.sql).';
    }
    if (e.code === '23505') return 'Efa ao amin\'ity livre ity io olona io.';
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Les livrets ----------

  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      familles = [];
      afficher();
      dire('famMessage', client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    return mien(client.from('fianakaviana').select('*'), email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { dire('famMessage', expliquer(res), true); return; }
        familles = res.data || [];
        return chargerLesMembres().then(afficher);
      }, function () {
        dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  // Tous les membres d'un coup : le tableau en compte le nombre par livret.
  function chargerLesMembres() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { mpikambana = []; return Promise.resolve(); }
    return mien(client.from('fianakaviana_mpikambana').select('*'), email)
      .then(function (res) { mpikambana = (res.error ? [] : (res.data || [])); },
        function () { mpikambana = []; });
  }

  function membresDe(id) {
    return mpikambana.filter(function (m) { return m.fianakaviana_id === id; })
      .sort(function (a, b) {
        const ra = RANG[a.andraikitra] === undefined ? 9 : RANG[a.andraikitra];
        const rb = RANG[b.andraikitra] === undefined ? 9 : RANG[b.andraikitra];
        if (ra !== rb) return ra - rb;
        return String(a.anarana).localeCompare(String(b.anarana), 'fr');
      });
  }

  function afficher() {
    $('famListe').innerHTML = familles.map(function (f) {
      const n = membresDe(f.id).length;
      const mariage = f.fanambadiana_daty
        ? dateFr(f.fanambadiana_daty) + (f.fanambadiana_toerana ? ' — ' + echapper(f.fanambadiana_toerana) : '')
        : '—';
      return '<tr>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(f.laharana || '—') + '</td>' +
        '<td>' + echapper(f.anarana) + '</td>' +
        '<td style="color:var(--muted);">' + echapper(f.fonenana || '—') + '</td>' +
        '<td style="white-space:nowrap;">' + mariage + '</td>' +
        '<td style="text-align:center;">' + n + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-fam-sokafy="' + echapper(f.id) + '">📖 Sokafy</button> ' +
          '<button type="button" class="btn btn-sm" data-fam-ovay="' + echapper(f.id) + '">Ovaina</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-fam-fafao="' + echapper(f.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('famVide').style.display = familles.length ? 'none' : '';
    montrerLouvert();
    compter();
    poserLaharana();
  }

  // Le numéro du livret se pose tout seul : « 001/2026 », puis 002, 003…
  // Compté sur le plus grand numéro déjà donné cette année, et non sur le
  // nombre de livrets — un livret effacé ne rend pas son numéro à un autre.
  // Il reste modifiable : on ne réécrit que celui qu'on avait posé.
  let laharanaPose = '';
  function laharanaSuivant() {
    const taona = String(new Date().getFullYear());
    let plusGrand = 0;
    familles.forEach(function (f) {
      const m = String(f.laharana || '').match(/^(\d+)\s*\/\s*(\d{4})$/);
      if (m && m[2] === taona && Number(m[1]) > plusGrand) plusGrand = Number(m[1]);
    });
    return String(plusGrand + 1).padStart(3, '0') + '/' + taona;
  }
  function poserLaharana() {
    const champ = $('famLaharana');
    // On ne touche ni à ce qui a été écrit à la main, ni au livret qu'on corrige.
    if (enEdition || (champ.value && champ.value !== laharanaPose)) return;
    laharanaPose = laharanaSuivant();
    champ.value = laharanaPose;
    direLannee();
  }

  // Le compteur repart à 001 chaque année : un livret de janvier ne suit pas
  // celui de décembre. On le dit sous le champ, et une fois — la première de
  // l'année — en notification : le numéro a changé d'année, pas de registre.
  const CLE_TAONA = 'stockmanager_fianakaviana_taona';
  function direLannee() {
    const taona = String(new Date().getFullYear());
    const note = $('famLaharanaNote');
    const premier = laharanaPose.indexOf('001/') === 0;
    if (note) {
      note.textContent = premier
        ? '🔄 Taona vaovao : miverina amin\'ny 001 ny laharan\'ny boky amin\'ity taona ' + taona + ' ity.'
        : 'Laharana ho azy, misesy isan-taona (miverina amin\'ny 001 isaky ny taona vaovao).';
    }
    if (!premier || !familles.length) return;
    let deja = '';
    try { deja = localStorage.getItem(CLE_TAONA) || ''; } catch (e) {}
    if (deja === taona) return;
    try { localStorage.setItem(CLE_TAONA, taona); } catch (e) {}
    if (typeof window.__ajouterNotificationAction === 'function') {
      window.__ajouterNotificationAction('modification',
        '🔄 Taona ' + taona + ' : niverina amin\'ny 001 ny laharan\'ny livre de famille.');
    }
  }

  function lireFormulaire() {
    return {
      laharana: $('famLaharana').value.trim() || null,
      anarana: $('famAnarana').value.trim(),
      fonenana: $('famFonenana').value.trim() || null,
      fanambadiana_daty: $('famDaty').value || null,
      fanambadiana_toerana: $('famToerana').value.trim() || null,
      fanamarihana: $('famNote').value.trim() || null
    };
  }

  function vider() {
    ['famLaharana', 'famAnarana', 'famFonenana', 'famDaty', 'famToerana', 'famNote']
      .forEach(function (id) { $(id).value = ''; });
    enEdition = null;
    $('famTehirizo').textContent = '💾 Tehirizo';
    // Le numéro du livret suivant, et non celui qu'on vient de donner.
    laharanaPose = '';
    poserLaharana();
  }

  function enregistrer() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('famMessage', 'Midira aloha.', true); return; }
    const f = lireFormulaire();
    if (!f.anarana) { dire('famMessage', 'Soraty ny anaran\'ny fianakaviana.', true); return; }
    dire('famMessage', 'Mitahiry…');
    const suite = enEdition
      ? client.from('fianakaviana').update(Object.assign({ updated_at: new Date().toISOString() }, f)).eq('id', enEdition)
      // select : l'identifiant revient, et le livret s'ouvre aussitôt — c'est
      // là qu'on écrit les gens, leur CIN et leur passeport.
      : client.from('fianakaviana').insert(Object.assign({ owner_email: email }, f)).select('id');
    suite.then(function (res) {
      if (res.error) { dire('famMessage', expliquer(res), true); return; }
      if (!enEdition) {
        avertir('📖 Livre de famille vaovao : ' + f.anarana + (f.laharana ? ' (' + f.laharana + ')' : '') + '.');
        const cree = res.data && res.data[0];
        if (cree && cree.id) ouvert = cree.id;
      }
      dire('famMessage', enEdition ? 'Voaova.' : 'Voatahiry.');
      vider();
      charger();
    }, function () { dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  function corriger(id) {
    const f = familles.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    enEdition = id;
    $('famLaharana').value = f.laharana || '';
    $('famAnarana').value = f.anarana || '';
    $('famFonenana').value = f.fonenana || '';
    $('famDaty').value = f.fanambadiana_daty ? String(f.fanambadiana_daty).slice(0, 10) : '';
    $('famToerana').value = f.fanambadiana_toerana || '';
    $('famNote').value = f.fanamarihana || '';
    $('famTehirizo').textContent = '💾 Tehirizo ny fanovana';
    dire('famMessage', 'Ovaina ny livre « ' + f.anarana + ' ».');
  }

  function supprimer(id) {
    const client = sb();
    const f = familles.filter(function (x) { return x.id === id; })[0];
    if (!client || !f) return;
    if (!window.confirm('Fafana ve ny livre de famille « ' + f.anarana + ' » sy ny mpianakavy voasoratra ao ?')) return;
    client.from('fianakaviana').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('famMessage', expliquer(res), true); return; }
      if (ouvert === id) ouvert = null;
      dire('famMessage', 'Voafafa.');
      charger();
    }, function () { dire('famMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  // ---------- Le livret ouvert, et ses membres ----------

  function montrerLouvert() {
    const boite = $('famOuvert');
    const f = familles.filter(function (x) { return x.id === ouvert; })[0];
    const note = $('famOuvertVide');
    // Un livret fermé : on dit où écrire les gens, plutôt que de ne rien
    // montrer — c'est là que vont les CIN et les passeports.
    if (note) note.style.display = (!f && familles.length) ? '' : 'none';
    if (!f) { boite.style.display = 'none'; return; }
    boite.style.display = '';
    $('famOuvertTitre').textContent = '👪 ' + f.anarana + (f.laharana ? ' — ' + f.laharana : '');
    const liste = membresDe(f.id);
    $('famMpikambana').innerHTML = liste.map(function (m) {
      const piece = m.karazana === 'passeport' ? 'Passeport' : (m.karazana === 'cin' ? 'CIN' : '—');
      return '<tr>' +
        '<td>' + echapper(m.anarana) + '</td>' +
        '<td>' + echapper(ANDRAIKITRA[m.andraikitra] || m.andraikitra) + '</td>' +
        '<td>' + piece + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(m.laharana_cin || '—') + '</td>' +
        '<td style="white-space:nowrap;">' + dateFr(m.teraka_daty) + '</td>' +
        '<td><button type="button" class="btn btn-red btn-sm" data-mp-fafao="' + echapper(m.id) + '">Esorina</button></td>' +
      '</tr>';
    }).join('');
    $('famMpikambanaVide').style.display = liste.length ? 'none' : '';
  }

  // Le passeport seul a une date d'expiration.
  function ajusterKarazana() {
    $('famExpirationChamp').style.display = $('famKarazana').value === 'passeport' ? '' : 'none';
  }

  function viderMembre() {
    ['famMpAnarana', 'famLaharanaCin', 'famExpiration', 'famTeraka', 'famTerakaToerana']
      .forEach(function (id) { $(id).value = ''; });
  }

  function ampio() {
    const client = sb();
    const email = monEmail();
    if (!client || !email || !ouvert) return;
    const anarana = $('famMpAnarana').value.trim();
    if (!anarana) { dire('famOuvertMessage', 'Soraty ny anaran\'ilay olona.', true); return; }
    const karazana = $('famKarazana').value || null;
    const laharana = $('famLaharanaCin').value.trim() || null;
    if (karazana && !laharana) { dire('famOuvertMessage', 'Soraty ny laharan\'ny taratasy, na safidio « Tsy mbola misy ».', true); return; }
    dire('famOuvertMessage', 'Mitahiry…');
    client.from('fianakaviana_mpikambana').insert({
      owner_email: email,
      fianakaviana_id: ouvert,
      anarana: anarana,
      laharana_cin: laharana,
      karazana: karazana,
      daty_fahataperana: (karazana === 'passeport' && $('famExpiration').value) ? $('famExpiration').value : null,
      teraka_daty: $('famTeraka').value || null,
      teraka_toerana: $('famTerakaToerana').value.trim() || null,
      andraikitra: $('famAndraikitra').value
    }).then(function (res) {
      if (res.error) { dire('famOuvertMessage', expliquer(res), true); return; }
      dire('famOuvertMessage', 'Voasoratra ao amin\'ny livre.');
      avertir('👪 Voasoratra ao amin\'ny livre : ' + anarana +
        ' (' + (ANDRAIKITRA[$('famAndraikitra').value] || '') + ').');
      viderMembre();
      charger();
    }, function () { dire('famOuvertMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  function esorina(id) {
    const client = sb();
    const m = mpikambana.filter(function (x) { return x.id === id; })[0];
    if (!client || !m) return;
    if (!window.confirm('Esorina ao amin\'ny livre ve i ' + m.anarana + ' ?')) return;
    client.from('fianakaviana_mpikambana').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('famOuvertMessage', expliquer(res), true); return; }
      dire('famOuvertMessage', 'Voaesotra.');
      charger();
    }, function () { dire('famOuvertMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true); });
  }

  // ---------- Les boutons ----------

  $('famTehirizo').addEventListener('click', enregistrer);
  $('famAnnuler').addEventListener('click', function () { vider(); dire('famMessage', ''); });
  $('famAmpio').addEventListener('click', ampio);
  $('famKarazana').addEventListener('change', ajusterKarazana);
  $('famListe').addEventListener('click', function (e) {
    const sokafy = e.target.closest('[data-fam-sokafy]');
    const ovay = e.target.closest('[data-fam-ovay]');
    const fafao = e.target.closest('[data-fam-fafao]');
    if (sokafy) {
      ouvert = ouvert === sokafy.dataset.famSokafy ? null : sokafy.dataset.famSokafy;
      dire('famOuvertMessage', '');
      montrerLouvert();
    } else if (ovay) corriger(ovay.dataset.famOvay);
    else if (fafao) supprimer(fafao.dataset.famFafao);
  });
  $('famMpikambana').addEventListener('click', function (e) {
    const fafao = e.target.closest('[data-mp-fafao]');
    if (fafao) esorina(fafao.dataset.mpFafao);
  });

  // ---------- Les chiffres du tableau de bord ----------
  // Ce que le registre des pièces comptait, le livret le compte désormais :
  // les familles, les gens, les rôles, les pièces, les mariages de l'année.
  const COULEURS = (typeof chartColors !== 'undefined') ? chartColors : ['#4fd8e0', '#f2a33c', '#8b93ff', '#6ee7b7'];
  const graphiques = {};
  function dessiner(id, config) {
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    if (graphiques[id]) graphiques[id].destroy();
    graphiques[id] = new Chart(canvas.getContext('2d'), config);
  }
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function compter() {
    if (!$('communKpiFianakaviana')) return;
    const maintenant = new Date();
    const auj = isoLocal(maintenant);
    const moisCourant = auj.slice(0, 7);
    const taona = auj.slice(0, 4);
    const nombre = function (n) { return Number(n).toLocaleString('fr-FR'); };
    const par = function (r) { return mpikambana.filter(function (m) { return m.andraikitra === r; }).length; };
    const poser = function (id, v) { const el = $(id); if (el) el.textContent = nombre(v); };

    poser('communKpiFianakaviana', familles.length);
    poser('communKpiPersonnes', mpikambana.length);
    poser('communKpiRayReny', par('ray') + par('reny'));
    poser('communKpiZanaka', par('zanaka'));
    poser('communKpiCin', mpikambana.filter(function (m) { return m.karazana === 'cin'; }).length);
    poser('communKpiPasseports', mpikambana.filter(function (m) { return m.karazana === 'passeport'; }).length);
    poser('communKpiFanambadiana', familles.filter(function (f) {
      return String(f.fanambadiana_daty || '').slice(0, 4) === taona;
    }).length);
    poser('communKpiMois', mpikambana.filter(function (m) {
      return String(m.created_at || '').slice(0, 7) === moisCourant;
    }).length);

    // Les douze derniers mois, le courant compris : un mois sans personne
    // inscrite est une information, pas un trou à refermer.
    const mois = [];
    for (let i = 11; i >= 0; i--) mois.push(new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
    dessiner('communChartMois', {
      type: 'bar',
      data: {
        labels: mois.map(function (m) { return m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); }),
        datasets: [{
          data: mois.map(function (m) {
            const cle = isoLocal(m).slice(0, 7);
            return mpikambana.filter(function (x) { return String(x.created_at || '').slice(0, 7) === cle; }).length;
          }),
          backgroundColor: COULEURS[0], borderRadius: 4, maxBarThickness: 42
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#1f2a30' }, beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    const roles = ['ray', 'reny', 'zanaka', 'hafa'];
    const vide = !mpikambana.length;
    dessiner('communChartTypes', {
      type: 'doughnut',
      data: {
        labels: vide ? ['Tsy misy'] : roles.map(function (r) { return ANDRAIKITRA[r]; }),
        datasets: [{
          data: vide ? [1] : roles.map(par),
          backgroundColor: vide ? ['#2a343b'] : roles.map(function (r, i) { return COULEURS[i % COULEURS.length]; }),
          borderWidth: 0
        }]
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } }, tooltip: { enabled: !vide } }
      }
    });

    const liste = $('communListeLivre');
    if (liste) {
      const derniers = familles.slice(0, 5);
      liste.innerHTML = derniers.length
        ? derniers.map(function (f) {
            return '<div class="list-row">' +
              '<span>' + echapper(f.anarana) + ' <span style="color:var(--muted);">· ' +
                membresDe(f.id).length + ' olona' + (f.laharana ? ' · ' + echapper(f.laharana) : '') + '</span></span>' +
              '<span style="white-space:nowrap; color:var(--muted);">' +
                (f.fanambadiana_daty ? 'Nanambady ny ' + dateFr(f.fanambadiana_daty) : '—') + '</span>' +
            '</div>';
          }).join('')
        : '<p class="empty-hint" style="padding:0.4rem 0;">Mbola tsy misy livre de famille.</p>';
    }
  }

  // Appelée à l'ouverture du tableau de bord (common.js, fokontany-app.js) :
  // les chiffres s'y montrent sans qu'on ait ouvert l'onglet.
  window.renderFianakavianaIsa = function () {
    return charger();
  };

  // Appelée quand l'onglet s'ouvre (common.js, fokontany-app.js).
  window.renderFianakaviana = function () {
    dire('famMessage', '');
    ajusterKarazana();
    return charger();
  };

  // Les personnes du fokontany, pour les adidy et les taratasy : celles qui
  // sont inscrites dans un livre de famille, chacune une fois, la CIN d'abord.
  window.__personnesDuFokontany = function () {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return Promise.resolve([]);
    return mien(client.from('fianakaviana_mpikambana').select('anarana,laharana_cin,karazana'), email)
      .then(function (res) {
        if (res.error) return [];
        const vues = {};
        (res.data || []).forEach(function (m) {
          const cle = cleOlona(m.anarana);
          if (!cle) return;
          if (!vues[cle] || (m.karazana === 'cin' && vues[cle].karazana !== 'cin')) {
            vues[cle] = { cle: cle, anarana: String(m.anarana).trim(), laharana: m.laharana_cin || '', karazana: m.karazana };
          }
        });
        return Object.keys(vues).map(function (c) { return vues[c]; })
          .sort(function (a, b) { return a.anarana.localeCompare(b.anarana, 'fr'); });
      }, function () { return []; });
  };
})();

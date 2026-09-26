// Adidy : ce que chacun doit, et ce que chacun a versé.
//
// Deux choses, et non une : la cotisation (son nom, son montant, et si elle
// revient chaque mois ou chaque année), puis les versements — qui a payé,
// pour quelle période.
//
// Les personnes viennent du livre de famille (fianakaviana.js) : on ne tient
// pas deux listes de gens, elles finiraient par ne plus se ressembler. Une
// personne inscrite dans plusieurs livrets n'y paraît qu'une fois, par son nom.
//
// Tout vit dans Supabase (supabase/sql/supabase-adidy.sql).

(function () {
  if (!document.getElementById('adidyListe')) return;

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

  let adidy = [];
  let personnes = [];
  let versements = [];
  let enEdition = null;
  let chargees = false;

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
  function ariary(n) {
    const v = Number(n);
    return (isFinite(v) ? v.toLocaleString('fr-FR') : '0') + ' Ar';
  }
  function cleOlona(nom) {
    return String(nom || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
      return 'Mbola tsy misy ny table « adidy » ao amin\'ny Supabase.';
    }
    if (e.code === '23505') return 'Efa voasoratra io fandoavana io.';
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Les périodes ----------
  // '2026-09' pour un mois, '2026' pour une année : la clé dit d'elle-même
  // de quelle sorte de cotisation elle parle.
  function moisCourant() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function periodeChoisie() {
    return feChoisie() === 'taona' ? String($('adidyTaona').value || '') : String($('adidyVolana').value || '');
  }
  function feChoisie() {
    const choisie = adidy.filter(function (a) { return a.id === $('adidySafidy').value; })[0];
    return choisie ? choisie.fe_potoana : 'volana';
  }
  function ajusterPeriode() {
    const taona = feChoisie() === 'taona';
    $('adidyVolanaChamp').style.display = taona ? 'none' : '';
    $('adidyTaonaChamp').style.display = taona ? '' : 'none';
  }

  // ---------- La liste des cotisations ----------

  function chargerAdidy() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      adidy = [];
      afficherAdidy();
      dire('adidyMessage', client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    return mien(client.from('adidy').select('*'), email).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
        adidy = res.data || [];
        afficherAdidy();
        remplirLeChoix();
      }, function () {
        dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  function afficherAdidy() {
    const corps = $('adidyListe');
    corps.innerHTML = adidy.map(function (a) {
      return '<tr>' +
        '<td>' + echapper(a.anarana) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + (a.vidiny == null ? '—' : ariary(a.vidiny)) + '</td>' +
        '<td>' + (a.fe_potoana === 'taona' ? 'Isan-taona' : 'Isam-bolana') + '</td>' +
        '<td style="color:var(--muted);">' + echapper(a.fanamarihana || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-adidy-ovay="' + echapper(a.id) + '">Ovaina</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-adidy-fafao="' + echapper(a.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('adidyVide').style.display = adidy.length ? 'none' : '';
  }

  function remplirLeChoix() {
    const choix = $('adidySafidy');
    const avant = choix.value;
    choix.innerHTML = adidy.map(function (a) {
      return '<option value="' + echapper(a.id) + '">' + echapper(a.anarana) +
        ' — ' + (a.fe_potoana === 'taona' ? 'isan-taona' : 'isam-bolana') + '</option>';
    }).join('');
    if (avant && adidy.some(function (a) { return a.id === avant; })) choix.value = avant;
    ajusterPeriode();
  }

  function viderFormulaire() {
    enEdition = null;
    $('adidyAnarana').value = '';
    $('adidyVidiny').value = '';
    $('adidyFe').value = 'volana';
    $('adidyNote').value = '';
    $('adidyAjouter').textContent = '＋ Ajouter';
    $('adidyAnnuler').style.display = 'none';
  }

  function enregistrerAdidy() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('adidyMessage', 'Midira aloha.', true); return; }
    const anarana = $('adidyAnarana').value.trim();
    if (!anarana) { dire('adidyMessage', 'Soraty ny anaran\'ny adidy.', true); return; }
    const brut = $('adidyVidiny').value.trim();
    if (brut && !(Number(brut) >= 0)) { dire('adidyMessage', 'Tsy mety ny vidiny.', true); return; }

    const ligne = {
      anarana: anarana,
      vidiny: brut === '' ? null : Number(brut),
      fe_potoana: $('adidyFe').value === 'taona' ? 'taona' : 'volana',
      fanamarihana: $('adidyNote').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    const correction = !!enEdition;
    const requete = correction
      ? client.from('adidy').update(ligne).eq('id', enEdition)
      : client.from('adidy').insert(Object.assign({ owner_email: email }, ligne));

    dire('adidyMessage', 'Mitahiry…');
    requete.then(function (res) {
      if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
      viderFormulaire();
      dire('adidyMessage', correction ? 'Voaova.' : 'Voatahiry.');
      chargerAdidy().then(chargerVersements);
    }, function () {
      dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function corriger(id) {
    const a = adidy.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    enEdition = a.id;
    $('adidyAnarana').value = a.anarana || '';
    $('adidyVidiny').value = a.vidiny == null ? '' : a.vidiny;
    $('adidyFe').value = a.fe_potoana === 'taona' ? 'taona' : 'volana';
    $('adidyNote').value = a.fanamarihana || '';
    $('adidyAjouter').textContent = 'Enregistrer les modifications';
    $('adidyAnnuler').style.display = '';
    dire('adidyMessage', '');
    $('adidyAnarana').focus();
  }

  function supprimerAdidy(id) {
    const client = sb();
    const a = adidy.filter(function (x) { return x.id === id; })[0];
    if (!client || !a) return;
    // Les versements partent avec elle (on delete cascade) : le dire avant,
    // et non après.
    if (!window.confirm('Fafana ve ny adidy « ' + a.anarana + ' » ? Ho fafana koa ireo fandoavana rehetra momba azy.')) return;
    client.from('adidy').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('adidyMessage', expliquer(res), true); return; }
      if (enEdition === id) viderFormulaire();
      dire('adidyMessage', 'Voafafa.');
      chargerAdidy().then(chargerVersements);
    }, function () {
      dire('adidyMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  // ---------- Les personnes, prises au registre ----------

  // Les personnes viennent du livre de famille (fianakaviana.js) : c'est là
  // qu'on inscrit les gens, et il n'y a pas de seconde liste.
  function chargerPersonnes() {
    if (typeof window.__personnesDuFokontany !== 'function') { personnes = []; return Promise.resolve(); }
    return window.__personnesDuFokontany().then(function (liste) {
      personnes = liste || [];
    }, function () { personnes = []; });
  }

  // ---------- Les versements ----------

  function chargerVersements() {
    const client = sb();
    const email = monEmail();
    const adidyId = $('adidySafidy').value;
    const periode = periodeChoisie();
    if (!client || !email || !adidyId || !periode) { versements = []; afficherPersonnes(); return Promise.resolve(); }
    return client.from('adidy_fandoavana').select('*')
      .eq('owner_email', email).eq('adidy_id', adidyId).eq('vanim_potoana', periode)
      .then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); return; }
        versements = res.data || [];
        dire('adidyFandoavanaMessage', '');
        afficherPersonnes();
        // Un versement qui vient d'être marqué change aussi les totaux.
        chargerTous().then(afficherTotaux);
      }, function () {
        dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  function verseDe(cle) {
    return versements.filter(function (v) { return v.olona === cle; })[0] || null;
  }

  function afficherPersonnes() {
    const corps = $('adidyOlonaListe');
    const choisie = adidy.filter(function (a) { return a.id === $('adidySafidy').value; })[0];
    corps.innerHTML = personnes.map(function (p) {
      const v = verseDe(p.cle);
      return '<tr>' +
        '<td>' + echapper(p.anarana) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer;">' +
            '<input type="checkbox" data-olona="' + echapper(p.cle) + '"' + (v ? ' checked' : '') + '> ' +
            (v ? 'Naloha' : 'Tsy mbola') +
          '</label>' +
        '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + (v && v.vola != null ? ariary(v.vola) : '—') + '</td>' +
        '<td style="color:var(--muted); white-space:nowrap;">' + (v && v.daty ? new Date(v.daty + 'T00:00:00').toLocaleDateString('fr-FR') : '—') + '</td>' +
      '</tr>';
    }).join('');

    $('adidyOlonaVide').style.display = personnes.length ? 'none' : '';
    const naloha = personnes.filter(function (p) { return !!verseDe(p.cle); }).length;
    const recolte = versements.reduce(function (s, v) { return s + Number(v.vola || 0); }, 0);
    const attendu = (choisie && choisie.vidiny != null) ? Number(choisie.vidiny) * personnes.length : null;
    $('adidyRecap').textContent = personnes.length
      ? naloha + ' / ' + personnes.length + ' naloha · Vola voaangona : ' + ariary(recolte) +
        (attendu != null ? ' / ' + ariary(attendu) : '')
      : '';
  }

  function basculer(cle, coché) {
    const client = sb();
    const email = monEmail();
    const adidyId = $('adidySafidy').value;
    const periode = periodeChoisie();
    const personne = personnes.filter(function (p) { return p.cle === cle; })[0];
    if (!client || !email || !adidyId || !periode || !personne) return;
    const choisie = adidy.filter(function (a) { return a.id === adidyId; })[0];
    const dejaLa = verseDe(cle);

    if (coché && !dejaLa) {
      client.from('adidy_fandoavana').insert({
        owner_email: email,
        adidy_id: adidyId,
        olona: cle,
        anarana: personne.anarana,
        vanim_potoana: periode,
        vola: choisie && choisie.vidiny != null ? choisie.vidiny : null
      }).then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); }
        else avertir('💰 Adidy voaloa : ' + personne.anarana + ' — ' +
          (choisie ? choisie.anarana : 'adidy') + ' (' + periodeLisible(periode) + ')' +
          (choisie && choisie.vidiny != null ? ' · ' + ariary(choisie.vidiny) : '') + '.');
        chargerVersements();
      }, function () { dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur.', true); });
      return;
    }
    if (!coché && dejaLa) {
      client.from('adidy_fandoavana').delete().eq('id', dejaLa.id).then(function (res) {
        if (res.error) { dire('adidyFandoavanaMessage', expliquer(res), true); }
        chargerVersements();
      }, function () { dire('adidyFandoavanaMessage', 'Tsy tratra ny serveur.', true); });
    }
  }

  // ---------- L'argent entré ----------
  // Compté sur la date du versement et non sur la période couverte : une
  // cotisation de janvier payée en mars est de l'argent entré en mars.

  let tous = [];

  function moisDe(iso) {
    return String(iso || '').slice(0, 7);
  }
  function moisCle(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function chargerTous() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { tous = []; return Promise.resolve(); }
    // Tout le versement, et non ses seuls chiffres : l'historique en vit.
    return mien(client.from('adidy_fandoavana').select('*'), email)
      .then(function (res) {
        tous = (res.error ? [] : (res.data || []));
      }, function () { tous = []; });
  }

  const COULEURS = (typeof chartColors !== 'undefined') ? chartColors : ['#4fd8e0', '#f2a33c'];
  let graphiqueVola = null;
  let graphiqueAdidy = null;

  function afficherTotaux() {
    const maintenant = new Date();
    const volana = moisCle(maintenant);
    const taona = String(maintenant.getFullYear());
    const somme = function (liste) {
      return liste.reduce(function (s, v) { return s + Number(v.vola || 0); }, 0);
    };
    const duMois = somme(tous.filter(function (v) { return moisDe(v.daty) === volana; }));
    const deLAnnee = somme(tous.filter(function (v) { return String(v.daty || '').slice(0, 4) === taona; }));
    const total = somme(tous);

    const recap = $('adidyTotaux');
    if (recap) {
      recap.textContent = 'Vola voaangona : ' + ariary(duMois) + ' ity volana ity · ' +
        ariary(deLAnnee) + ' ity taona ity · ' + ariary(total) + ' hatramin\'izao.';
    }

    // Le tableau de bord de « Commun » porte les mêmes chiffres : on n'ouvre
    // pas un onglet pour savoir ce que l'autre affiche déjà.
    const poser = function (id, valeur) { const el = $(id); if (el) el.textContent = ariary(valeur); };
    poser('communKpiVolaVolana', duMois);
    poser('communKpiVolaTaona', deLAnnee);
    poser('communKpiVolaTotal', total);

    // Qui a payé ce mois-ci : une personne qui verse deux adidy compte une fois.
    const ceMois = tous.filter(function (v) { return moisDe(v.daty) === volana; });
    const compter = function (id, n) { const el = $(id); if (el) el.textContent = Number(n).toLocaleString('fr-FR'); };
    compter('communKpiMpandoa', new Set(ceMois.map(function (v) { return v.olona || cleOlona(v.anarana); })).size);
    compter('communKpiFandoavana', ceMois.length);
    compter('communKpiAdidyIsa', adidy.length);

    // Les cinq derniers versements, du plus récent au plus ancien.
    const derniers = $('communListeFandoavana');
    if (derniers) {
      const liste = tous.slice().sort(function (a, b) {
        const da = String(a.daty || '') + String(a.created_at || '');
        const db = String(b.daty || '') + String(b.created_at || '');
        return db < da ? -1 : (db > da ? 1 : 0);
      }).slice(0, 5);
      derniers.innerHTML = liste.length
        ? liste.map(function (v) {
            return '<div class="list-row">' +
              '<span>' + echapper(v.anarana) + ' <span style="color:var(--muted);">· ' + echapper(nomAdidy(v.adidy_id)) +
                ' · ' + echapper(periodeLisible(v.vanim_potoana)) + '</span></span>' +
              '<span style="white-space:nowrap; font-family:var(--font-mono);">' + (v.vola == null ? '—' : ariary(v.vola)) + '</span>' +
            '</div>';
          }).join('')
        : '<p class="empty-hint" style="padding:0.4rem 0;">Mbola tsy misy fandoavana.</p>';
    }

    // L'argent de l'année, adidy par adidy.
    const canvasAdidy = $('communChartAdidy');
    if (canvasAdidy && window.Chart) {
      const parAdidy = {};
      tous.forEach(function (v) {
        if (String(v.daty || '').slice(0, 4) !== taona) return;
        const nom = nomAdidy(v.adidy_id);
        parAdidy[nom] = (parAdidy[nom] || 0) + Number(v.vola || 0);
      });
      const noms = Object.keys(parAdidy);
      const vide = !noms.length;
      if (graphiqueAdidy) graphiqueAdidy.destroy();
      graphiqueAdidy = new Chart(canvasAdidy.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: vide ? ['Tsy misy'] : noms,
          datasets: [{
            data: vide ? [1] : noms.map(function (n) { return parAdidy[n]; }),
            backgroundColor: vide ? ['#2a343b'] : noms.map(function (n, i) { return COULEURS[(i + 1) % COULEURS.length]; }),
            borderWidth: 0
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } },
            tooltip: { enabled: !vide, callbacks: { label: function (c) { return c.label + ' : ' + ariary(c.parsed); } } }
          }
        }
      });
    }

    const canvas = $('communChartVola');
    if (!canvas || !window.Chart) return;
    const mois = [];
    for (let i = 11; i >= 0; i--) mois.push(new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
    const parMois = mois.map(function (m) {
      const cle = moisCle(m);
      return somme(tous.filter(function (v) { return moisDe(v.daty) === cle; }));
    });
    if (graphiqueVola) graphiqueVola.destroy();
    graphiqueVola = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: mois.map(function (m) { return m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); }),
        datasets: [{ data: parMois, backgroundColor: COULEURS[1] || COULEURS[0], borderRadius: 4, maxBarThickness: 42 }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ariary(c.parsed.y); } } }
        },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#1f2a30' }, beginAtZero: true } }
      }
    });
  }

  // Appelée par common.js à l'ouverture du tableau de bord : il montre
  // l'argent entré, que l'onglet Adidy ait été ouvert ou non.
  // Les cotisations aussi : leurs noms étiquettent le graphique et la liste.
  window.renderVolaVoaangona = function () {
    return Promise.all([chargerAdidy(), chargerTous()]).then(afficherTotaux);
  };

  // ---------- L'historique ----------
  // L'onglet Adidy ne montre qu'une période à la fois ; ici, tout ce qui a
  // été versé, du plus récent au plus ancien.

  function nomAdidy(id) {
    const a = adidy.filter(function (x) { return x.id === id; })[0];
    return a ? a.anarana : '—';
  }

  function periodeLisible(cle) {
    const s = String(cle || '');
    if (/^\d{4}-\d{2}$/.test(s)) {
      const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, 1);
      return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    return s || '—';
  }

  function afficherHistorique() {
    const corps = $('histoListe');
    if (!corps) return;
    const q = ($('histoRecherche').value || '').trim().toLowerCase();
    const liste = tous.slice().sort(function (a, b) {
      return String(b.daty || '') < String(a.daty || '') ? -1 : 1;
    }).filter(function (v) {
      if (!q) return true;
      return [v.anarana, nomAdidy(v.adidy_id), periodeLisible(v.vanim_potoana), v.vanim_potoana]
        .some(function (t) { return String(t || '').toLowerCase().indexOf(q) >= 0; });
    });

    corps.innerHTML = liste.map(function (v) {
      return '<tr>' +
        '<td style="white-space:nowrap;">' + (v.daty ? new Date(v.daty + 'T00:00:00').toLocaleDateString('fr-FR') : '—') + '</td>' +
        '<td>' + echapper(v.anarana) + '</td>' +
        '<td>' + echapper(nomAdidy(v.adidy_id)) + '</td>' +
        '<td style="color:var(--muted); white-space:nowrap;">' + echapper(periodeLisible(v.vanim_potoana)) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + (v.vola == null ? '—' : ariary(v.vola)) + '</td>' +
        '<td><button type="button" class="btn btn-red btn-sm" data-histo-fafao="' + echapper(v.id) + '">Fafana</button></td>' +
      '</tr>';
    }).join('');

    $('histoVide').style.display = liste.length ? 'none' : '';
    $('histoVide').textContent = tous.length
      ? 'Tsy misy mifanaraka amin\'ny fikarohana.'
      : 'Mbola tsy misy fandoavana voasoratra.';
    const somme = liste.reduce(function (s, v) { return s + Number(v.vola || 0); }, 0);
    $('histoRecap').textContent = liste.length
      ? liste.length + ' fandoavana · ' + ariary(somme)
      : '';
  }

  function supprimerVersement(id) {
    const client = sb();
    const v = tous.filter(function (x) { return x.id === id; })[0];
    if (!client || !v) return;
    if (!window.confirm('Fafana ve ny fandoavan\'i ' + v.anarana + ' (' + periodeLisible(v.vanim_potoana) + ') ?')) return;
    client.from('adidy_fandoavana').delete().eq('id', id).then(function (res) {
      if (res.error) { dire('histoMessage', expliquer(res), true); return; }
      dire('histoMessage', 'Voafafa.');
      chargerTous().then(function () {
        afficherTotaux();
        afficherHistorique();
        // La période ouverte dans l'onglet Adidy vient peut-être de changer.
        chargerVersements();
      });
    }, function () {
      dire('histoMessage', 'Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  window.renderHistorique = function () {
    dire('histoMessage', '');
    // Les noms des cotisations viennent de la table adidy : sans elle, la
    // colonne « Adidy » ne dirait qu'un identifiant.
    return Promise.all([chargerAdidy(), chargerTous()]).then(function () {
      afficherTotaux();
      afficherHistorique();
    });
  };

  // ---------- Les boutons ----------

  $('adidyAjouter').addEventListener('click', enregistrerAdidy);
  $('adidyAnnuler').addEventListener('click', function () { viderFormulaire(); dire('adidyMessage', ''); });
  $('adidyListe').addEventListener('click', function (e) {
    const ovay = e.target.closest('[data-adidy-ovay]');
    const fafao = e.target.closest('[data-adidy-fafao]');
    if (ovay) corriger(ovay.dataset.adidyOvay);
    else if (fafao) supprimerAdidy(fafao.dataset.adidyFafao);
  });
  $('adidySafidy').addEventListener('change', function () { ajusterPeriode(); chargerVersements(); });
  $('adidyVolana').addEventListener('change', chargerVersements);
  $('adidyTaona').addEventListener('change', chargerVersements);
  $('adidyOlonaListe').addEventListener('change', function (e) {
    const case_ = e.target.closest('input[data-olona]');
    if (case_) basculer(case_.dataset.olona, case_.checked);
  });
  $('histoRecherche').addEventListener('input', afficherHistorique);
  $('histoListe').addEventListener('click', function (e) {
    const fafao = e.target.closest('[data-histo-fafao]');
    if (fafao) supprimerVersement(fafao.dataset.histoFafao);
  });

  // Appelée par common.js quand l'onglet s'ouvre.
  window.renderAdidy = function () {
    if (!chargees) {
      $('adidyVolana').value = moisCourant();
      $('adidyTaona').value = new Date().getFullYear();
      chargees = true;
    }
    dire('adidyMessage', '');
    return Promise.all([chargerAdidy(), chargerPersonnes()]).then(chargerVersements);
  };
})();

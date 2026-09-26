// CIN et passeports : le registre des pièces d'identité, dans la fenêtre
// « Commun ».
//
// Tout vit dans Supabase (supabase/sql/supabase-pieces-identite.sql) et non
// dans le navigateur : un registre gardé sur un seul téléphone ne se retrouve
// pas le jour où l'on ouvre l'application ailleurs.
//
// Chaque ligne porte l'email du compte qui l'a créée, et les règles de la base
// ne laissent voir que les siennes.

(function () {
  const TYPES = { cin: 'CIN', passeport: 'Passeport' };

  let pieces = [];
  // L'identifiant de la pièce qu'on corrige ; null quand on en inscrit une.
  let enEdition = null;

  if (!document.getElementById('piecesListe')) return;

  function sb() {
    // L'employé entré par son lien passe par la fonction « mpiasa », qui ne
    // connaît pas cette table : le registre reste l'affaire du patron.
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  // « let currentUser » vit dans la portée du script de common.js, pas sur
  // window (voir equipe.js).
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function $(id) { return document.getElementById(id); }

  function dire(texte, erreur) {
    const el = $('pieceMessage');
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  // Une date seule, sans heure : lue en heure locale, sans quoi le fuseau la
  // ferait reculer d'un jour.
  function dateFr(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
  }
  function aujourdhui() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function expliquer(res) {
    const e = res && res.error;
    if (!e) return '';
    const m = String(e.message || '');
    // La table n'a pas encore été créée : c'est le fichier SQL qu'il manque,
    // pas une panne.
    if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
      return 'Mbola tsy misy ny table « pieces_identite » ao amin\'ny Supabase.';
    }
    if (e.code === '23505') return 'Efa voasoratra io laharana io.';
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // Une lecture ratée se dit dans les deux onglets : le comptage à zéro
  // ressemblerait sinon à un registre vide.
  function direComptage(texte) {
    const el = $('communComptageMessage');
    if (!el) return;
    el.textContent = texte || '';
    el.style.display = texte ? '' : 'none';
  }
  function signaler(texte) {
    dire(texte, true);
    direComptage(texte);
  }

  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      pieces = [];
      afficher();
      compter();
      signaler(client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity lisitra ity.');
      return Promise.resolve();
    }
    return client.from('pieces_identite').select('*')
      .eq('owner_email', email)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { signaler(expliquer(res)); return; }
        pieces = res.data || [];
        direComptage('');
        afficher();
        compter();
      }, function () {
        signaler('Tsy tratra ny serveur : jereo ny réseau.');
      });
  }

  // Recto et verso côte à côte, chacun ouvrable.
  function vignettes(p) {
    return [
      { chemin: p.sary, titre: 'Recto' },
      { chemin: p.sary_verso, titre: 'Verso' }
    ].filter(function (f) { return f.chemin; }).map(function (f) {
      return '<img data-sary="' + echapper(f.chemin) + '" alt="' + f.titre + '" title="' + f.titre + ' — sokafy" ' +
        'style="width:46px; height:30px; object-fit:cover; border-radius:4px; border:1px solid var(--line); cursor:pointer; margin-right:0.3rem;">';
    }).join('');
  }

  function afficher() {
    const corps = $('piecesListe');
    const vide = $('piecesVide');
    const q = ($('pieceRecherche').value || '').trim().toLowerCase();
    const liste = pieces.filter(function (p) {
      return !q ||
        String(p.anarana || '').toLowerCase().indexOf(q) >= 0 ||
        String(p.laharana || '').toLowerCase().indexOf(q) >= 0;
    });
    const auj = aujourdhui();
    corps.innerHTML = liste.map(function (p) {
      const lany = !!p.daty_fahataperana && p.daty_fahataperana < auj;
      return '<tr>' +
        '<td>' + echapper(TYPES[p.karazana] || p.karazana) + '</td>' +
        '<td style="font-family:var(--font-mono);">' + echapper(p.laharana) + '</td>' +
        '<td>' + echapper(p.anarana) + '</td>' +
        '<td>' + dateFr(p.daty_nahazoana) + '</td>' +
        '<td' + (lany ? ' style="color:var(--red);" title="Lany daty"' : '') + '>' +
          dateFr(p.daty_fahataperana) + (lany ? ' ⚠️' : '') + '</td>' +
        '<td style="white-space:nowrap;">' + (vignettes(p) || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-ovay="' + echapper(p.id) + '">Ovaina</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-fafao="' + echapper(p.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    signerLesSary();
    vide.style.display = liste.length ? 'none' : '';
    vide.textContent = pieces.length
      ? 'Tsy misy mifanaraka amin\'ny fikarohana.'
      : 'Mbola tsy misy CIN na passeport voasoratra.';
  }

  // ---------- Les photos ----------
  // Le bucket est fermé : une photo de CIN ne s'ouvre pas avec une simple
  // adresse. On demande donc une adresse signée, valable dix minutes, et
  // seulement pour ce qui est affiché.
  const BUCKET = 'pieces-identite';

  function monId() {
    const client = sb();
    if (!client || !client.auth || !client.auth.getUser) return Promise.resolve('');
    return client.auth.getUser().then(function (r) {
      return (r && r.data && r.data.user) ? r.data.user.id : '';
    }, function () { return ''; });
  }

  function signerLesSary() {
    const client = sb();
    const images = [].slice.call($('piecesListe').querySelectorAll('img[data-sary]'));
    if (!client || !images.length) return;
    const chemins = images.map(function (i) { return i.dataset.sary; });
    client.storage.from(BUCKET).createSignedUrls(chemins, 600).then(function (res) {
      if (res.error || !res.data) return;
      const parChemin = {};
      res.data.forEach(function (x) { if (x && x.path && x.signedUrl) parChemin[x.path] = x.signedUrl; });
      images.forEach(function (i) {
        const url = parChemin[i.dataset.sary];
        if (url) i.src = url;
      });
    }, function () {});
  }

  // Les photos partent APRÈS la ligne : c'est la ligne qui leur donne leur
  // nom, et une photo sans ligne resterait seule dans le bucket.
  //
  // Deux faces, deux fichiers, deux colonnes : la carte ne dit pas tout du
  // même côté, et l'une peut arriver sans l'autre.
  const FACES = [
    { cle: 'recto', colonne: 'sary' },
    { cle: 'verso', colonne: 'sary_verso' }
  ];

  function envoyerSary(ligneId, ancienne) {
    const photos = window.__piecePhoto || {};
    const client = sb();
    const aEnvoyer = FACES.filter(function (f) { return photos[f.cle]; });
    if (!aEnvoyer.length || !client || !ligneId) return Promise.resolve(null);
    return monId().then(function (uid) {
      if (!uid) return null;
      const maj = {};
      const remplacees = [];
      return Promise.all(aEnvoyer.map(function (f) {
        const chemin = uid + '/' + ligneId + '-' + f.cle + '-' + Date.now() + '.jpg';
        return client.storage.from(BUCKET).upload(chemin, photos[f.cle], { contentType: 'image/jpeg', upsert: true })
          .then(function (res) {
            if (res.error) throw res.error;
            maj[f.colonne] = chemin;
            const avant = ancienne && ancienne[f.colonne];
            if (avant && avant !== chemin) remplacees.push(avant);
          });
      })).then(function () {
        return client.from('pieces_identite').update(maj).eq('id', ligneId);
      }).then(function (res) {
        if (res && res.error) throw res.error;
        // Les anciennes photos n'ont plus de ligne qui les nomme : elles ne
        // feraient que dormir dans le bucket.
        if (remplacees.length) client.storage.from(BUCKET).remove(remplacees);
        return maj;
      });
    });
  }

  // ---------- Le comptage des personnes (onglet Tableau de bord) ----------

  // Une personne peut avoir une CIN et un passeport : on la compte une fois,
  // par son nom, et non par ses pièces.
  function cleOlona(p) {
    return String(p.anarana || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Le mois d'inscription en heure locale : created_at est en UTC, et une
  // inscription du 1er au matin passait sinon dans le mois d'avant.
  function moisDe(horodatage) {
    const d = new Date(horodatage);
    return isNaN(d) ? '' : isoLocal(d).slice(0, 7);
  }
  function nombre(n) { return Number(n).toLocaleString('fr-FR'); }

  // Les couleurs des graphiques du stock (common.js), pour que les deux
  // tableaux de bord se ressemblent.
  const COULEURS = (typeof chartColors !== 'undefined') ? chartColors : ['#4fd8e0', '#f2a33c'];
  const graphiques = {};
  function dessiner(id, config) {
    const canvas = $(id);
    if (!canvas || !window.Chart) return;
    if (graphiques[id]) graphiques[id].destroy();
    graphiques[id] = new Chart(canvas.getContext('2d'), config);
  }

  function compter() {
    if (!$('communKpiPersonnes')) return;
    const maintenant = new Date();
    const auj = isoLocal(maintenant);
    const dansTroisMois = isoLocal(new Date(maintenant.getFullYear(), maintenant.getMonth() + 3, maintenant.getDate()));
    const moisCourant = auj.slice(0, 7);

    const passeports = pieces.filter(function (p) { return p.karazana === 'passeport'; });
    const cin = pieces.length - passeports.length;
    const expires = passeports.filter(function (p) { return p.daty_fahataperana && p.daty_fahataperana < auj; });
    const bientot = passeports.filter(function (p) {
      return p.daty_fahataperana && p.daty_fahataperana >= auj && p.daty_fahataperana <= dansTroisMois;
    });
    const personnes = new Set(pieces.map(cleOlona).filter(Boolean));
    const ceMois = new Set(pieces.filter(function (p) { return moisDe(p.created_at) === moisCourant; }).map(cleOlona));

    $('communKpiPersonnes').textContent = nombre(personnes.size);
    $('communKpiCin').textContent = nombre(cin);
    $('communKpiPasseports').textContent = nombre(passeports.length);
    $('communKpiMois').textContent = nombre(ceMois.size);
    $('communKpiExpires').textContent = nombre(expires.length);
    $('communKpiBientot').textContent = nombre(bientot.length);
    const taonaCourante = auj.slice(0, 4);
    const cetteAnnee = new Set(pieces.filter(function (p) { return moisDe(p.created_at).slice(0, 4) === taonaCourante; }).map(cleOlona));
    if ($('communKpiTaona')) $('communKpiTaona').textContent = nombre(cetteAnnee.size);

    // Les douze derniers mois, le courant compris, même vides : un mois sans
    // inscription est une information, pas un trou à refermer.
    const mois = [];
    for (let i = 11; i >= 0; i--) mois.push(new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
    const parMois = mois.map(function (m) {
      const cle = isoLocal(m).slice(0, 7);
      return new Set(pieces.filter(function (p) { return moisDe(p.created_at) === cle; }).map(cleOlona)).size;
    });
    dessiner('communChartMois', {
      type: 'bar',
      data: {
        labels: mois.map(function (m) { return m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); }),
        datasets: [{ data: parMois, backgroundColor: COULEURS[0], borderRadius: 4, maxBarThickness: 42 }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#1f2a30' }, beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    const vide = !pieces.length;
    dessiner('communChartTypes', {
      type: 'doughnut',
      data: {
        labels: vide ? ['Aucune donnée'] : ['CIN', 'Passeport'],
        datasets: [{
          data: vide ? [1] : [cin, passeports.length],
          backgroundColor: vide ? ['#2a343b'] : [COULEURS[0], COULEURS[1]],
          borderWidth: 0
        }]
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } }
      }
    });

    const aRenouveler = expires.concat(bientot).sort(function (a, b) {
      return a.daty_fahataperana < b.daty_fahataperana ? -1 : 1;
    });
    $('communListeExpiration').innerHTML = aRenouveler.length
      ? aRenouveler.map(function (p) {
          const lany = p.daty_fahataperana < auj;
          return '<div style="display:flex; justify-content:space-between; gap:0.8rem; padding:0.4rem 0; border-bottom:1px solid var(--line); font-size:0.8rem;">' +
            '<span>' + echapper(p.anarana) + ' <span style="color:var(--muted); font-family:var(--font-mono);">' + echapper(p.laharana) + '</span></span>' +
            '<span style="white-space:nowrap; color:' + (lany ? 'var(--red)' : 'var(--amber)') + ';">' +
              (lany ? 'Expiré le ' : 'Expire le ') + dateFr(p.daty_fahataperana) + '</span>' +
          '</div>';
        }).join('')
      : '<p class="empty-hint" style="padding:0.4rem 0;">Aucun passeport à renouveler.</p>';
  }

  // Le passeport seul a une date d'expiration.
  function ajusterType() {
    $('pieceExpirationChamp').style.display = $('pieceType').value === 'passeport' ? '' : 'none';
  }

  function vider() {
    enEdition = null;
    $('pieceType').value = 'cin';
    ['pieceNumero', 'pieceNom', 'pieceDelivrance', 'pieceExpiration'].forEach(function (id) { $(id).value = ''; });
    $('pieceEnregistrer').textContent = 'Enregistrer';
    $('pieceAnnuler').style.display = 'none';
    if (typeof window.__viderPhotoPiece === 'function') window.__viderPhotoPiece();
    ajusterType();
  }

  function remplir(p) {
    enEdition = p.id;
    $('pieceType').value = p.karazana === 'passeport' ? 'passeport' : 'cin';
    $('pieceNumero').value = p.laharana || '';
    $('pieceNom').value = p.anarana || '';
    $('pieceDelivrance').value = p.daty_nahazoana || '';
    $('pieceExpiration').value = p.daty_fahataperana || '';
    $('pieceEnregistrer').textContent = 'Enregistrer les modifications';
    $('pieceAnnuler').style.display = '';
    ajusterType();
    dire('');
    $('pieceNumero').focus();
  }

  function enregistrer() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      dire(client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity lisitra ity.', true);
      return;
    }
    const karazana = $('pieceType').value === 'passeport' ? 'passeport' : 'cin';
    const laharana = $('pieceNumero').value.trim().replace(/\s+/g, ' ');
    const anarana = $('pieceNom').value.trim();
    const nahazoana = $('pieceDelivrance').value || null;
    const fahataperana = karazana === 'passeport' ? ($('pieceExpiration').value || null) : null;
    if (!laharana) { dire('Soraty ny laharana.', true); return; }
    if (!anarana) { dire('Soraty ny anarana feno.', true); return; }
    if (nahazoana && fahataperana && fahataperana < nahazoana) {
      dire('Tsy mety : tokony ho aorian\'ny daty nahazoana ny daty fahataperana.', true);
      return;
    }

    const ligne = {
      karazana: karazana,
      laharana: laharana,
      anarana: anarana,
      daty_nahazoana: nahazoana,
      daty_fahataperana: fahataperana,
      updated_at: new Date().toISOString()
    };
    const correction = !!enEdition;
    const ancienne = correction ? (pieces.filter(function (x) { return x.id === enEdition; })[0] || {}) : null;
    // select() : on récupère l'identifiant de la ligne, celui qui nommera la
    // photo.
    const requete = correction
      ? client.from('pieces_identite').update(ligne).eq('id', enEdition).select('id').maybeSingle()
      : client.from('pieces_identite').insert(Object.assign({ owner_email: email }, ligne)).select('id').maybeSingle();

    const bouton = $('pieceEnregistrer');
    bouton.disabled = true;
    dire('Mitahiry…');
    requete.then(function (res) {
      if (res.error) { bouton.disabled = false; dire(expliquer(res), true); return; }
      const ligneId = (res.data && res.data.id) || enEdition;
      const photos = window.__piecePhoto || {};
      const avecPhoto = !!(photos.recto || photos.verso);
      if (avecPhoto) dire('Mandefa ny sary…');
      return envoyerSary(ligneId, ancienne).then(function () {
        bouton.disabled = false;
        vider();
        dire(correction ? 'Voaova.' : 'Voatahiry.');
        charger();
      }, function (err) {
        // La ligne, elle, est écrite : le dire, plutôt que de laisser croire
        // que rien n'a été enregistré.
        bouton.disabled = false;
        vider();
        dire('Voatahiry, fa tsy lasa ny sary : ' + ((err && err.message) || 'tsy fantatra'), true);
        charger();
      });
    }, function () {
      bouton.disabled = false;
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function supprimer(id) {
    const client = sb();
    const p = pieces.filter(function (x) { return x.id === id; })[0];
    if (!client || !p) return;
    if (!window.confirm('Fafana ve ny ' + (TYPES[p.karazana] || p.karazana) + ' ' + p.laharana + ' (' + p.anarana + ') ?')) return;
    client.from('pieces_identite').delete().eq('id', id).then(function (res) {
      if (res.error) { dire(expliquer(res), true); return; }
      // La photo suit la ligne : gardée seule, elle ne serait plus qu'une
      // image de pièce d'identité que rien ne réclame.
      const fichiers = [p.sary, p.sary_verso].filter(Boolean);
      if (fichiers.length) client.storage.from(BUCKET).remove(fichiers);
      if (enEdition === id) vider();
      dire('Voafafa.');
      charger();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  $('pieceType').addEventListener('change', ajusterType);
  $('pieceEnregistrer').addEventListener('click', enregistrer);
  $('pieceAnnuler').addEventListener('click', function () { vider(); dire(''); });
  $('pieceRecherche').addEventListener('input', afficher);
  $('piecesListe').addEventListener('click', function (e) {
    const sary = e.target.closest('img[data-sary]');
    if (sary) {
      // L'adresse signée est déjà dans l'image : on l'ouvre en grand plutôt
      // que d'en redemander une.
      if (sary.src) window.open(sary.src, '_blank', 'noopener');
      return;
    }
    const ovay = e.target.closest('[data-ovay]');
    const fafao = e.target.closest('[data-fafao]');
    if (ovay) {
      const p = pieces.filter(function (x) { return x.id === ovay.dataset.ovay; })[0];
      if (p) remplir(p);
    } else if (fafao) {
      supprimer(fafao.dataset.fafao);
    }
  });
  ajusterType();

  // Appelée par common.js quand l'onglet s'ouvre. Le message de la visite
  // précédente n'a plus de sens : une erreur de saisie restait affichée à la
  // réouverture, au-dessus d'un formulaire vide.
  window.renderPiecesIdentite = function () {
    dire('');
    return charger();
  };
})();

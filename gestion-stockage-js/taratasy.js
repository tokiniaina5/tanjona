// Taratasy : fanamarinam-ponenana, fanamarinana fifindra-monina,
// sora-panambadiana, sora-pahafatesana, ary taratasy samihafa.
//
// Le papier se prépare ici, il ne s'y délivre pas : il ne vaut que signé et
// cacheté par l'autorité compétente. Ce que cette page fait, c'est écrire
// sans faute ce qui doit y figurer, garder ce qui a été remis, et pouvoir le
// réimprimer à l'identique.
//
// Les personnes viennent du livre de famille (fianakaviana.js) : on ne tient
// pas deux listes de gens.
//
// Tout vit dans Supabase (supabase/sql/supabase-taratasy.sql).

(function () {
  if (!document.getElementById('tarListe')) return;

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

  // Cinq sortes de papiers. Le départ seul est archivé (il ne se liste ni ne
  // se modifie) ; les autres se listent, se réimpriment et s'effacent.
  const TITRES = {
    fonenana: 'FANAMARINAM-PONENANA',
    fifindramonina: 'FANAMARINANA FIFINDRA-MONINA',
    fanambadiana: 'SORA-PANAMBADIANA',
    fahafatesana: 'SORA-PAHAFATESANA',
    hafa: 'TARATASY'
  };
  const NOMS = {
    fonenana: 'Fanamarinam-ponenana',
    fifindramonina: 'Fifindra-monina',
    fanambadiana: 'Sora-panambadiana',
    fahafatesana: 'Sora-pahafatesana',
    hafa: 'Taratasy samihafa'
  };
  // Un papier « samihafa » porte le titre qu'on lui a donné.
  function titreDe(t) {
    if (t.karazana === 'hafa' && t.lohateny) return String(t.lohateny).toUpperCase();
    return TITRES[t.karazana] || 'TARATASY';
  }
  function nomDe(t) {
    if (t.karazana === 'hafa' && t.lohateny) return t.lohateny;
    return NOMS[t.karazana] || t.karazana;
  }

  let taratasy = [];
  // Les départs : leur numéro et leur date seulement (laharanaSuivant).
  let numerosDepart = [];
  let personnes = [];

  function sb() {
    if (typeof MODE_MPIASA !== 'undefined' && MODE_MPIASA) return null;
    return window.__sb || null;
  }
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function moi() {
    return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : {};
  }
  function echapper(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function dateFr(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
  }
  function aujourdhui() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Un certificat de résidence ne vaut que trois mois : passé ce délai, il ne
  // dit plus où quelqu'un habite, il dit où il habitait. Le départ, lui,
  // constate un fait daté — il ne se périme pas.
  function finDeValidite(t) {
    if (!t || t.karazana !== 'fonenana' || !t.daty) return '';
    const d = new Date(String(t.daty).slice(0, 10) + 'T00:00:00');
    if (isNaN(d)) return '';
    const fin = new Date(d.getFullYear(), d.getMonth() + 3, d.getDate());
    return fin.getFullYear() + '-' + String(fin.getMonth() + 1).padStart(2, '0') + '-' + String(fin.getDate()).padStart(2, '0');
  }

  function dire(texte, erreur) {
    const el = $('tarMessage');
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function expliquer(res) {
    const e = res && res.error;
    if (!e) return '';
    const m = String(e.message || '');
    // Les sortes nouvelles (mariage, décès, divers) demandent une base à jour :
    // une colonne inconnue, ou une sorte refusée par la règle d'avant.
    if (e.code === '23514' || e.code === 'PGRST204' || /column/i.test(m)) {
      return 'Mila havaozina ny table « taratasy » ao amin\'ny Supabase (supabase-taratasy.sql).';
    }
    if (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
      return 'Mbola tsy misy ny table « taratasy » ao amin\'ny Supabase.';
    }
    if (/row-level security/i.test(m)) return 'Nolavina : mivoaha dia midira indray.';
    return 'Tsy nety : ' + m;
  }

  // ---------- Ce que le formulaire montre ----------

  function karazanaChoisie() {
    const v = $('tarKarazana').value;
    return TITRES[v] ? v : 'fonenana';
  }
  // Chaque papier ne demande que ce qu'il écrit.
  function ajusterChamps() {
    const k = karazanaChoisie();
    const montrer = function (id, oui) { $(id).style.display = oui ? '' : 'none'; };
    montrer('tarFonenanaChamp', k === 'fonenana' || k === 'hafa');
    montrer('tarTalohaChamp', k === 'fifindramonina');
    montrer('tarVaovaoChamp', k === 'fifindramonina');
    montrer('tarVadyChamp', k === 'fanambadiana');
    montrer('tarVadyCinChamp', k === 'fanambadiana');
    montrer('tarZavaDatyChamp', k === 'fanambadiana' || k === 'fahafatesana');
    montrer('tarZavaToeranaChamp', k === 'fanambadiana' || k === 'fahafatesana');
    montrer('tarLohatenyChamp', k === 'hafa');
    montrer('tarVotoatinyChamp', k === 'hafa');
    $('tarAnaranaLabel').textContent = k === 'fanambadiana' ? 'Anaran\'ny vady voalohany'
      : (k === 'fahafatesana' ? 'Anaran\'ilay maty' : 'Anarana feno');
    $('tarZavaDatyLabel').textContent = k === 'fahafatesana' ? 'Daty nahafatesana' : 'Daty nanambadiana';
    $('tarZavaToeranaLabel').textContent = k === 'fahafatesana' ? 'Toerana nahafatesana' : 'Toerana nanambadiana';
  }

  // Les personnes viennent du livre de famille (fianakaviana.js) : c'est là
  // qu'on inscrit les gens, et il n'y a pas de seconde liste.
  function chargerPersonnes() {
    if (typeof window.__personnesDuFokontany !== 'function') { personnes = []; return Promise.resolve(); }
    return window.__personnesDuFokontany().then(function (liste) {
      personnes = liste || [];
        remplirLeChoix();
    }, function () { personnes = []; });
  }

  function remplirLeChoix() {
    const choix = $('tarOlona');
    const avant = choix.value;
    choix.innerHTML = '<option value="">— Safidio ny olona —</option>' + personnes.map(function (p) {
      return '<option value="' + echapper(p.cle) + '">' + echapper(p.anarana) + '</option>';
    }).join('');
    if (avant) choix.value = avant;
  }

  function prendreLaPersonne() {
    const p = personnes.filter(function (x) { return x.cle === $('tarOlona').value; })[0];
    if (!p) return;
    $('tarAnarana').value = p.anarana;
    if (p.karazana === 'cin') $('tarCin').value = p.laharana || '';
  }

  // ---------- Le papier ----------

  // Le numéro repart à 1 chaque mois : « 001/09-2026 ». Compté sur le plus
  // grand numéro déjà donné ce mois-là, et non sur le nombre de papiers —
  // un papier effacé ne doit pas rendre son numéro à un autre.
  //
  // Chaque sorte de papier a sa propre file : les départs se comptent entre
  // eux, les certificats de résidence entre eux, les mariages entre eux…
  function laharanaSuivant(daty, karazana) {
    const jour = String(daty || $('tarDaty').value || aujourdhui()).slice(0, 10);
    const annee = jour.slice(0, 4);
    const mois = jour.slice(5, 7);
    const k = karazana || karazanaChoisie();
    let plusGrand = 0;
    (k === 'fifindramonina' ? numerosDepart : taratasy.filter(function (t) { return t.karazana === k; })).forEach(function (t) {
      if (String(t.daty || '').slice(0, 7) !== annee + '-' + mois) return;
      const m = String(t.laharana || '').match(/^(\d+)\//);
      if (m && Number(m[1]) > plusGrand) plusGrand = Number(m[1]);
    });
    return String(plusGrand + 1).padStart(3, '0') + '/' + mois + '-' + annee;
  }

  // Le numéro se pose tout seul. Il reste modifiable : on ne réécrit que
  // celui qu'on avait posé, jamais celui qu'on a corrigé à la main.
  let laharanaPose = '';
  function poserLaharana() {
    const champ = $('tarLaharana');
    if (champ.value && champ.value !== laharanaPose) return;
    laharanaPose = laharanaSuivant();
    champ.value = laharanaPose;
  }

  function lireFormulaire() {
    return {
      karazana: karazanaChoisie(),
      laharana: $('tarLaharana').value.trim() || laharanaSuivant($('tarDaty').value, karazanaChoisie()),
      anarana: $('tarAnarana').value.trim(),
      laharana_cin: $('tarCin').value.trim() || null,
      teraka_daty: $('tarTerakaDaty').value || null,
      teraka_toerana: $('tarTerakaToerana').value.trim() || null,
      fonenana: $('tarFonenana').value.trim() || null,
      fonenana_taloha: $('tarTaloha').value.trim() || null,
      fonenana_vaovao: $('tarVaovao').value.trim() || null,
      daty: $('tarDaty').value || aujourdhui(),
      fanamarihana: $('tarNote').value.trim() || null,
      anarana_faharoa: $('tarVady').value.trim() || null,
      laharana_cin_faharoa: $('tarVadyCin').value.trim() || null,
      daty_zava: $('tarZavaDaty').value || null,
      toerana_zava: $('tarZavaToerana').value.trim() || null,
      lohateny: $('tarLohateny').value.trim() || null,
      votoatiny: $('tarVotoatiny').value.trim() || null
    };
  }
  // Ce qu'on envoie à la base : seulement les colonnes que ce papier remplit.
  // Un certificat de résidence part donc sans les colonnes nouvelles, et
  // s'enregistre même si la base n'a pas encore été mise à jour.
  function pourLaBase(t) {
    const ligne = {};
    Object.keys(t).forEach(function (k) { if (t[k] !== null && t[k] !== undefined) ligne[k] = t[k]; });
    return ligne;
  }

  // Le texte du papier, ligne à ligne. Écrit ici et non dans le PDF : le même
  // texte sert à l'aperçu comme à l'impression.
  function corpsDuTexte(t) {
    const nom = t.anarana || '—';
    const cin = t.laharana_cin ? ', manana karapanondrom-pirenena laharana ' + t.laharana_cin : '';
    const teraka = t.teraka_daty
      ? ', teraka ny ' + dateFr(t.teraka_daty) + (t.teraka_toerana ? ' tao ' + t.teraka_toerana : '')
      : (t.teraka_toerana ? ', teraka tao ' + t.teraka_toerana : '');

    if (t.karazana === 'fanambadiana') {
      const vady = t.anarana_faharoa || '—';
      const cinVady = t.laharana_cin_faharoa ? ', manana karapanondrom-pirenena laharana ' + t.laharana_cin_faharoa : '';
      return [
        'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
        'sy ' + vady + cinVady + ',',
        'dia nivady ara-dalàna tamin\'ny ' + dateFr(t.daty_zava) + (t.toerana_zava ? ' tao ' + t.toerana_zava : '') + '.',
        '',
        'Natao ity taratasy ity mba hanamarinana izany, ary hampiasain\'ireo voakasika amin\'izay ilana azy.'
      ];
    }
    if (t.karazana === 'fahafatesana') {
      return [
        'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
        'dia maty tamin\'ny ' + dateFr(t.daty_zava) + (t.toerana_zava ? ' tao ' + t.toerana_zava : '') + '.',
        '',
        'Natao ity taratasy ity mba hanamarinana izany, ary hampiasain\'ny fianakaviany amin\'izay ilana azy.'
      ];
    }
    if (t.karazana === 'hafa') {
      // Le texte tel qu'on l'a écrit, ses retours à la ligne compris.
      const entete = 'Ho an\'i ' + nom + teraka + cin + (t.fonenana ? ', monina ao ' + t.fonenana : '') + '.';
      return [entete, ''].concat(String(t.votoatiny || '').split(/\r?\n/));
    }
    if (t.karazana === 'fifindramonina') {
      return [
        'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
        'dia nifindra monina avy tao ' + (t.fonenana_taloha || '—') + ' ho ao ' + (t.fonenana_vaovao || '—') + '.',
        '',
        'Natao ity taratasy ity mba hanamarinana izany, ary hampiasainy amin\'izay ilana azy.'
      ];
    }
    const fin = finDeValidite(t);
    return [
      'Izaho manao sonia eto ambany dia manamarina fa ' + nom + teraka + cin + ',',
      'dia tena monina ao ' + (t.fonenana || '—') + '.',
      '',
      'Natao ity taratasy ity mba hanamarinana izany, ary hampiasainy amin\'izay ilana azy.',
      '',
      'Manan-kery mandritra ny telo (3) volana : hatramin\'ny ' + dateFr(fin) + '.'
    ];
  }

  function fabriquerPdf(t) {
    if (!window.jspdf) { dire('Tsy tafiditra ny bibliotheka PDF.', true); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const marge = 20;
    const largeur = 210 - marge * 2;
    const u = moi();

    // L'en-tête : qui délivre. Le nom de la boutique, ou celui du compte.
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(String(u.company || u.name || ''), marge, 22);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (u.phone) doc.text(String(u.phone), marge, 28);
    if (u.email) doc.text(String(u.email), marge, 33);

    doc.setFontSize(9);
    doc.text('Laharana : ' + (t.laharana || '—'), 210 - marge, 22, { align: 'right' });
    doc.text('Daty : ' + dateFr(t.daty), 210 - marge, 28, { align: 'right' });

    doc.setLineWidth(0.4);
    doc.line(marge, 40, 210 - marge, 40);

    doc.setFontSize(17);
    doc.setFont(undefined, 'bold');
    doc.text(titreDe(t), 105, 56, { align: 'center' });

    doc.setFont(undefined, 'normal');
    doc.setFontSize(11.5);
    let y = 76;
    corpsDuTexte(t).forEach(function (ligne) {
      if (!ligne) { y += 6; return; }
      doc.splitTextToSize(ligne, largeur).forEach(function (bout) {
        doc.text(bout, marge, y);
        y += 7;
      });
    });

    if (t.fanamarihana) {
      y += 4;
      doc.setFontSize(10);
      doc.splitTextToSize('Fanamarihana : ' + t.fanamarihana, largeur).forEach(function (bout) {
        doc.text(bout, marge, y);
        y += 6;
      });
      doc.setFontSize(11.5);
    }

    // La place de la signature et du cachet : le papier ne vaut que par eux.
    const bas = Math.max(y + 24, 210);
    doc.setFontSize(10);
    doc.text('Natao ny ' + dateFr(t.daty), 210 - marge, bas, { align: 'right' });
    doc.text('Sonia sy kase', 210 - marge, bas + 8, { align: 'right' });
    doc.setLineWidth(0.2);
    doc.line(210 - marge - 60, bas + 30, 210 - marge, bas + 30);

    const nomFichier = (nomDe(t) + '-' + (t.anarana || '') + '-' + (t.laharana || ''))
      .replace(/[^A-Za-z0-9\-]+/g, '-') + '.pdf';
    doc.save(nomFichier);
  }

  // ---------- La liste ----------

  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      taratasy = [];
      afficher();
      dire(client ? 'Midira aloha.' : 'Tsy azo ampiasaina eto ity pejy ity.', true);
      return Promise.resolve();
    }
    // Tout se liste, sauf les départs : archivés, ils ne s'ouvrent que par
    // leur numéro et le nom. Des départs, on ne lit que le numéro et la date :
    // de quoi donner le numéro suivant sans rien montrer de l'archive.
    return Promise.all([
      mien(client.from('taratasy').select('*'), email).neq('karazana', 'fifindramonina')
        .order('daty', { ascending: false }),
      mien(client.from('taratasy').select('laharana,daty'), email).eq('karazana', 'fifindramonina')
    ]).then(function (r) {
      const res = r[0];
      if (res.error) { dire(expliquer(res), true); return; }
      taratasy = res.data || [];
      numerosDepart = (r[1] && !r[1].error && r[1].data) || [];
      afficher();
      compter();
      afficherHistorique();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function afficher() {
    const auj = aujourdhui();
    $('tarListe').innerHTML = taratasy.map(function (t) {
      const fin = finDeValidite(t);
      const lany = fin && fin < auj;
      return '<tr>' +
        '<td style="white-space:nowrap;">' + dateFr(t.daty) + '</td>' +
        '<td>' + echapper(nomDe(t)) + '</td>' +
        '<td>' + echapper(t.anarana) + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(t.laharana || '—') + '</td>' +
        '<td style="white-space:nowrap;' + (lany ? ' color:var(--red);' : '') + '"' + (lany ? ' title="Lany andro"' : '') + '>' +
          (fin ? dateFr(fin) + (lany ? ' ⚠️' : '') : '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm" data-tar-pdf="' + echapper(t.id) + '">PDF</button> ' +
          '<button type="button" class="btn btn-red btn-sm" data-tar-fafao="' + echapper(t.id) + '">Fafana</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    $('tarVide').style.display = taratasy.length ? 'none' : '';
    poserLaharana();
    direValidite();
  }

  // Sous la date : jusqu'à quand le papier qu'on prépare vaudra.
  function direValidite() {
    const el = $('tarValidite');
    if (!el) return;
    const fin = finDeValidite({ karazana: karazanaChoisie(), daty: $('tarDaty').value || aujourdhui() });
    el.textContent = fin
      ? 'Manan-kery mandritra ny 3 volana : hatramin\'ny ' + dateFr(fin) + '.'
      : 'Tsy misy faharetana voafetra : fanamarinana zava-nitranga izy.';
  }

  function vider() {
    ['tarAnarana', 'tarCin', 'tarTerakaDaty', 'tarTerakaToerana', 'tarFonenana', 'tarTaloha', 'tarVaovao', 'tarLaharana', 'tarNote',
      'tarVady', 'tarVadyCin', 'tarZavaDaty', 'tarZavaToerana', 'tarLohateny', 'tarVotoatiny']
      .forEach(function (id) { $(id).value = ''; });
    $('tarOlona').value = '';
    $('tarDaty').value = aujourdhui();
    // Le numéro du papier suivant, et non celui qu'on vient de donner.
    laharanaPose = '';
    afficher();
  }

  function delivrer() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('Midira aloha.', true); return; }
    const t = lireFormulaire();
    if (!t.anarana) { dire('Soraty ny anaran\'ilay olona.', true); return; }
    if (t.karazana === 'fifindramonina') {
      if (!t.fonenana_taloha || !t.fonenana_vaovao) { dire('Soraty ny fonenana taloha sy ny vaovao.', true); return; }
      // Il ne se reprend pas : on le dit avant, pas après.
      if (!window.confirm('Rehefa voatahiry dia tsy azo ovaina na fafana intsony ity taratasy fifindra-monina ity.\n\nLaharana : ' +
        t.laharana + '\nAnarana : ' + t.anarana + '\n\nTohizana ?')) return;
    } else if (t.karazana === 'fanambadiana') {
      if (!t.anarana_faharoa) { dire('Soraty ny anaran\'ny vady faharoa.', true); return; }
      if (!t.daty_zava) { dire('Soraty ny daty nanambadiana.', true); return; }
    } else if (t.karazana === 'fahafatesana') {
      if (!t.daty_zava) { dire('Soraty ny daty nahafatesana.', true); return; }
    } else if (t.karazana === 'hafa') {
      if (!t.lohateny) { dire('Soraty ny lohatenin\'ny taratasy.', true); return; }
      if (!t.votoatiny) { dire('Soraty ny votoatin\'ny taratasy.', true); return; }
    } else if (!t.fonenana) {
      dire('Soraty ny fonenana.', true); return;
    }

    dire('Mitahiry…');
    client.from('taratasy').insert(Object.assign({ owner_email: email }, pourLaBase(t))).then(function (res) {
      if (res.error) { dire(expliquer(res), true); return; }
      // Le PDF part du formulaire et non de la ligne relue : la personne
      // l'attend maintenant, et non après un aller-retour au serveur.
      fabriquerPdf(t);
      avertir('📄 Taratasy nomena : ' + nomDe(t) + ' — ' + t.anarana + ' (' + (t.laharana || '—') + ').');
      dire(t.karazana === 'fifindramonina'
        ? 'Voatahiry sy voahidy. Ny laharana « ' + t.laharana + ' » sy ny anarana no manokatra azy indray.'
        : 'Vita ny taratasy, ary voatahiry.');
      vider();
      charger();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  function supprimer(id) {
    const client = sb();
    const t = taratasy.filter(function (x) { return x.id === id; })[0];
    if (!client || !t) return;
    if (!window.confirm('Fafana ve ny taratasin\'i ' + t.anarana + ' (' + (t.laharana || '—') + ') ?')) return;
    client.from('taratasy').delete().eq('id', id).then(function (res) {
      if (res.error) { dire(expliquer(res), true); return; }
      dire('Voafafa.');
      charger();
    }, function () {
      dire('Tsy tratra ny serveur : jereo ny réseau.', true);
    });
  }

  // ---------- Les boutons ----------

  $('tarKarazana').addEventListener('change', function () { ajusterChamps(); direValidite(); poserLaharana(); });
  // Changer la date peut changer le mois, donc le numéro.
  $('tarDaty').addEventListener('change', function () { direValidite(); poserLaharana(); });
  $('tarOlona').addEventListener('change', prendreLaPersonne);
  $('tarVokatra').addEventListener('click', delivrer);
  $('tarListe').addEventListener('click', function (e) {
    const pdf = e.target.closest('[data-tar-pdf]');
    const fafao = e.target.closest('[data-tar-fafao]');
    if (pdf) {
      const t = taratasy.filter(function (x) { return x.id === pdf.dataset.tarPdf; })[0];
      if (t) fabriquerPdf(t);
    } else if (fafao) {
      supprimer(fafao.dataset.tarFafao);
    }
  });

  // ---------- Les chiffres du tableau de bord ----------
  // Les résidences se comptent par personne : un même nom qui revient chaque
  // trimestre est une personne, pas trois. Les départs, eux, ne se comptent
  // qu'en nombre de papiers : demander leurs noms rouvrirait l'archive.

  function compter() {
    const client = sb();
    const email = monEmail();
    if (!$('communKpiFonenana')) return Promise.resolve();
    if (!client || !email) return Promise.resolve();

    const auj = aujourdhui();
    const personnes = new Set();
    let manankery = 0;
    taratasy.forEach(function (t) {
      if (t.karazana !== 'fonenana') return;
      const cle = String(t.anarana || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (cle) personnes.add(cle);
      const fin = finDeValidite(t);
      if (fin && fin >= auj) manankery++;
    });
    $('communKpiFonenana').textContent = personnes.size.toLocaleString('fr-FR');
    $('communKpiFonenanaKery').textContent = manankery.toLocaleString('fr-FR');
    [['communKpiFanambadiana', 'fanambadiana'], ['communKpiFahafatesana', 'fahafatesana'], ['communKpiHafa', 'hafa']]
      .forEach(function (p) {
        const el = $(p[0]);
        if (el) el.textContent = taratasy.filter(function (t) { return t.karazana === p[1]; }).length.toLocaleString('fr-FR');
      });
    dessinerLesTaratasy(auj);

    // head : le serveur ne renvoie que le compte, aucune ligne.
    return mien(client.from('taratasy').select('id', { count: 'exact', head: true }), email)
      .eq('karazana', 'fifindramonina')
      .then(function (res) {
        const n = (res && typeof res.count === 'number') ? res.count : 0;
        $('communKpiFifindra').textContent = n.toLocaleString('fr-FR');
      }, function () {});
  }

  // Les papiers remis par mois, toutes sortes ensemble. Des départs, on n'a
  // que la date (numerosDepart) : c'est assez pour compter, rien de plus.
  const COULEURS = (typeof chartColors !== 'undefined') ? chartColors : ['#4fd8e0', '#f2a33c', '#8b93ff', '#6ee7b7', '#f472b6'];
  // L'ordre des sortes, et la couleur de chacune, partout pareils.
  const SORTES = ['fonenana', 'fifindramonina', 'fanambadiana', 'fahafatesana', 'hafa'];
  function couleurDe(k) { return COULEURS[(SORTES.indexOf(k) + 2) % COULEURS.length]; }
  // Tous les papiers, départs compris, réduits à leur sorte et leur date.
  function toutesLesDates() {
    return taratasy.map(function (t) { return { k: t.karazana, d: String(t.daty || '').slice(0, 10) }; })
      .concat(numerosDepart.map(function (t) { return { k: 'fifindramonina', d: String(t.daty || '').slice(0, 10) }; }));
  }
  let graphiqueTaratasy = null;
  let graphiqueSortes = null;
  function dessinerLesTaratasy(auj) {
    const mois = auj.slice(0, 7);
    const taona = auj.slice(0, 4);
    const toutes = toutesLesDates();
    const poser = function (id, n) { const el = $(id); if (el) el.textContent = n.toLocaleString('fr-FR'); };
    poser('communKpiTarVolana', toutes.filter(function (x) { return x.d.slice(0, 7) === mois; }).length);
    poser('communKpiTarTaona', toutes.filter(function (x) { return x.d.slice(0, 4) === taona; }).length);

    const liste = $('communListeTaratasy');
    if (liste) {
      const derniers = taratasy.slice(0, 5);   // déjà du plus récent au plus ancien
      liste.innerHTML = derniers.length
        ? derniers.map(function (t) {
            const fin = finDeValidite(t);
            let etat = '';
            if (t.karazana === 'fonenana') {
              etat = (fin && fin >= auj)
                ? '<span style="white-space:nowrap; color:var(--cyan);">Manan-kery hatramin\'ny ' + dateFr(fin) + '</span>'
                : '<span style="white-space:nowrap; color:var(--muted);">Lany daty</span>';
            }
            return '<div class="list-row">' +
              '<span>' + echapper(t.anarana) + ' <span style="color:var(--muted);">· ' + echapper(nomDe(t)) + ' · ' + dateFr(t.daty) + '</span></span>' +
              etat +
            '</div>';
          }).join('')
        : '<p class="empty-hint" style="padding:0.4rem 0;">Mbola tsy misy taratasy nomena.</p>';
    }

    if (!window.Chart) return;
    const canvas = $('communChartTaratasy');
    if (canvas) {
      const maintenant = new Date(auj + 'T00:00:00');
      const douze = [];
      for (let i = 11; i >= 0; i--) douze.push(new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1));
      const cle = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
      if (graphiqueTaratasy) graphiqueTaratasy.destroy();
      graphiqueTaratasy = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: douze.map(function (m) { return m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }); }),
          datasets: SORTES.map(function (k) {
            return {
              label: NOMS[k],
              data: douze.map(function (m) {
                const c = cle(m);
                return toutes.filter(function (x) { return x.k === k && x.d.slice(0, 7) === c; }).length;
              }),
              backgroundColor: couleurDe(k), borderRadius: 4, maxBarThickness: 42
            };
          })
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, grid: { color: '#1f2a30' }, beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }

    const canvasSortes = $('communChartTarKarazana');
    if (canvasSortes) {
      const parSorte = SORTES.map(function (k) { return toutes.filter(function (x) { return x.k === k; }).length; });
      const vide = !toutes.length;
      if (graphiqueSortes) graphiqueSortes.destroy();
      graphiqueSortes = new Chart(canvasSortes.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: vide ? ['Tsy misy'] : SORTES.map(function (k) { return NOMS[k]; }),
          datasets: [{
            data: vide ? [1] : parSorte,
            backgroundColor: vide ? ['#2a343b'] : SORTES.map(couleurDe),
            borderWidth: 0
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } }, tooltip: { enabled: !vide } }
        }
      });
    }
  }

  // ---------- L'historique ----------
  // Tous les papiers remis, du plus récent au plus ancien, dans l'onglet
  // Historique — cherchés par le même champ que les versements. Un départ n'y
  // paraît que par son numéro et sa date : l'archive reste fermée.
  function afficherHistorique() {
    const corps = $('histoTarListe');
    if (!corps) return;
    const q = (($('histoRecherche') || {}).value || '').trim().toLowerCase();
    const lignes = taratasy.map(function (t) {
      return { id: t.id, daty: String(t.daty || '').slice(0, 10), sorte: nomDe(t), olona: t.anarana || '', laharana: t.laharana || '', ouvert: true };
    }).concat(numerosDepart.map(function (t) {
      return { daty: String(t.daty || '').slice(0, 10), sorte: NOMS.fifindramonina, olona: '', laharana: t.laharana || '', ouvert: false };
    })).filter(function (l) {
      if (!q) return true;
      return [l.sorte, l.olona, l.laharana, dateFr(l.daty)].some(function (x) { return String(x).toLowerCase().indexOf(q) >= 0; });
    }).sort(function (a, b) { return a.daty < b.daty ? 1 : (a.daty > b.daty ? -1 : 0); });

    corps.innerHTML = lignes.map(function (l) {
      return '<tr>' +
        '<td style="white-space:nowrap;">' + dateFr(l.daty) + '</td>' +
        '<td>' + echapper(l.sorte) + '</td>' +
        '<td>' + (l.ouvert ? echapper(l.olona) : '<span style="color:var(--muted);">🔒 Voahidy</span>') + '</td>' +
        '<td style="font-family:var(--font-mono); white-space:nowrap;">' + echapper(l.laharana || '—') + '</td>' +
        '<td>' + (l.ouvert ? '<button type="button" class="btn btn-sm" data-histo-tar-pdf="' + echapper(l.id) + '">PDF</button>' : '') + '</td>' +
      '</tr>';
    }).join('');
    $('histoTarVide').style.display = lignes.length ? 'none' : '';
    $('histoTarVide').textContent = (taratasy.length || numerosDepart.length)
      ? 'Tsy misy mifanaraka amin\'ny fikarohana.'
      : 'Mbola tsy misy taratasy nomena.';
    const recap = $('histoTarRecap');
    if (recap) recap.textContent = lignes.length ? lignes.length + ' taratasy' : '';
  }
  if ($('histoTarListe')) {
    $('histoRecherche').addEventListener('input', afficherHistorique);
    $('histoTarListe').addEventListener('click', function (e) {
      const pdf = e.target.closest('[data-histo-tar-pdf]');
      if (!pdf) return;
      const t = taratasy.filter(function (x) { return x.id === pdf.dataset.histoTarPdf; })[0];
      if (t) fabriquerPdf(t);
    });
  }
  // Appelée à l'ouverture de l'onglet Historique (common.js, fokontany-app.js).
  window.renderTaratasyHistorique = function () { return charger(); };

  // Appelée par common.js à l'ouverture du tableau de bord : les chiffres
  // s'y montrent sans qu'on ait ouvert l'onglet des taratasy.
  // charger() compte déjà : l'appeler puis compter à nouveau demandait deux
  // fois la même chose au serveur.
  window.renderTaratasyIsa = charger;

  // ---------- L'archive des départs ----------
  // Un départ ne se feuillette pas : il s'ouvre, et seulement pour qui sait
  // déjà de quel papier il parle — son numéro et le nom qui y figure.

  let ouvert = null;

  function direArchive(texte, erreur) {
    const el = $('tarArchiveMessage');
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }

  function montrerLouvert() {
    const boite = $('tarArchiveResultat');
    if (!ouvert) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    boite.style.display = '';
    boite.innerHTML =
      '<div style="border:1px solid var(--line); border-radius:10px; padding:0.8rem 0.9rem; font-size:0.82rem; line-height:1.7;">' +
        '<div><strong>' + echapper(ouvert.anarana) + '</strong> · <span style="font-family:var(--font-mono);">' + echapper(ouvert.laharana || '—') + '</span></div>' +
        '<div style="color:var(--muted);">Daty : ' + dateFr(ouvert.daty) + '</div>' +
        '<div>Avy tao : ' + echapper(ouvert.fonenana_taloha || '—') + '</div>' +
        '<div>Ho ao : ' + echapper(ouvert.fonenana_vaovao || '—') + '</div>' +
        (ouvert.laharana_cin ? '<div style="color:var(--muted);">CIN : ' + echapper(ouvert.laharana_cin) + '</div>' : '') +
        '<button type="button" class="btn btn-sm" id="tarArchivePdf" style="width:auto; margin-top:0.6rem;">📄 PDF</button>' +
      '</div>';
    $('tarArchivePdf').addEventListener('click', function () { fabriquerPdf(ouvert); });
  }

  function ouvrirArchive() {
    const client = sb();
    const email = monEmail();
    const laharana = $('tarArchiveLaharana').value.trim();
    const anarana = $('tarArchiveAnarana').value.trim();
    ouvert = null;
    montrerLouvert();
    if (!client || !email) { direArchive('Midira aloha.', true); return; }
    if (!laharana || !anarana) { direArchive('Soraty ny laharana SY ny anarana.', true); return; }
    direArchive('Mikaroka…');
    // Les deux ensemble, et l'un ne suffit pas : c'est ce qui tient l'archive
    // fermée à qui la feuilletterait.
    mien(client.from('taratasy').select('*'), email)
      .eq('karazana', 'fifindramonina')
      .eq('laharana', laharana).ilike('anarana', anarana)
      .then(function (res) {
        if (res.error) { direArchive(expliquer(res), true); return; }
        const trouve = (res.data || [])[0];
        if (!trouve) {
          direArchive('Tsy misy taratasy mifanaraka amin\'io laharana sy io anarana io.', true);
          return;
        }
        ouvert = trouve;
        direArchive('Hita ilay taratasy.');
        montrerLouvert();
      }, function () {
        direArchive('Tsy tratra ny serveur : jereo ny réseau.', true);
      });
  }

  $('tarArchiveSokafy').addEventListener('click', ouvrirArchive);

  window.renderTaratasy = function () {
    direArchive('');
    ouvert = null;
    montrerLouvert();
    dire('');
    ajusterChamps();
    if (!$('tarDaty').value) $('tarDaty').value = aujourdhui();
    return Promise.all([charger(), chargerPersonnes()]);
  };
})();

// L'employé, entré par son lien.
//
// Il arrive par un lien, pas par un mot de passe. Le jeton dans l'adresse
// dit qui il est ; la fonction « mpiasa » lui répond. Il reçoit alors
// l'application entière, et il en fait ce qu'il veut :
//
//   - Le stock est le sien. Au premier passage, il part d'une copie de celui
//     du patron ; ensuite il ajoute, modifie, efface chez lui, et le stock du
//     patron n'en sait rien. common.js range ce stock sous des clés à son
//     nom (SUFFIXE_MPIASA) : ouvert dans le navigateur du patron, les deux ne
//     se mélangent pas.
//
//   - L'équipe est celle du patron. Il y inscrit des gens, leur fait des
//     liens, pointe, confie des courses — et le patron voit tout. Il n'a pas
//     de compte pour écrire dans la base : equipe.js parle donc à un client
//     de remplacement, défini ici, qui fait passer chaque demande par la
//     fonction. C'est elle qui dit au nom de quel patron.

(function () {
  const jeton = (function () {
    try { return new URLSearchParams(location.search).get('mpiasa') || ''; }
    catch (e) { return ''; }
  })();

  // Pas de jeton : l'application se comporte comme d'habitude.
  if (!jeton) return;

  // Ces appels passent toujours avec la clé publique du site, jamais avec la
  // session d'un compte ouvert dans ce navigateur. Ouvert chez le patron,
  // connecté, le lien envoyait le jeton de son compte : Supabase le refusait
  // avant même la fonction, sans en-tête CORS, et le navigateur ne voyait
  // qu'un « Failed to fetch » — « Tsy mety ny rohy ». Le jeton du lien suffit,
  // la fonction n'attend rien d'autre.
  function entetes() {
    const cle = window.__sb && window.__sb.supabaseKey;
    return cle ? { Authorization: 'Bearer ' + cle } : {};
  }

  const ROLES = { mpiasa: 'Mpiasa', livreur: 'Livreur' };
  const STATUTS = {
    miandry: 'Miandry', nalaina: 'Nalaina', an_dalana: 'An-dalana',
    tonga: 'Tonga', foana: 'Foana'
  };

  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function heures(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h + ' h ' + (m < 10 ? '0' : '') + m;
  }

  // Vrai dès que l'application s'est ouverte pour lui.
  let entre = false;

  // ---------- Avant la première réponse ----------
  // On prend la place de tout le reste, le temps de savoir si le lien est
  // bon : l'écran de connexion n'a pas à clignoter devant lui.
  function poserLEcran() {
    ['loginScreen', 'appScreen', 'paywallScreen', 'welcomeOverlay', 'autoNoticeModal']
      .forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    let ecran = document.getElementById('mpiasaScreen');
    if (!ecran) {
      ecran = document.createElement('div');
      ecran.id = 'mpiasaScreen';
      ecran.style.cssText = 'min-height:100vh; padding:1.2rem 3vw 3rem;';
      document.body.appendChild(ecran);
    }
    ecran.style.display = 'block';
    return ecran;
  }

  function patienter() {
    poserLEcran().innerHTML =
      '<div class="login-card" style="margin:3rem auto;">' +
      '<div class="eyebrow">Ny asako</div>' +
      '<p class="sub">Miditra…</p>' +
      '</div>';
  }

  // ---------- Le stock de départ ----------
  // Une fois, et une seule : recopié à chaque ouverture, il effacerait ce
  // que l'employé a fait depuis. Et seulement s'il y a quelque chose à
  // recopier — un patron qui n'a pas encore ouvert son application n'a
  // déposé aucune copie, et on attend la suivante plutôt que de marquer
  // « fait » un stock vide.
  const CLE_COPIE = 'stockmanager_mpiasa_copie' + SUFFIXE_MPIASA;

  function copierLeStockUneFois(d) {
    try { if (localStorage.getItem(CLE_COPIE) === '1') return; } catch (e) { return; }
    if (!d.stockMaj) return;
    const marquer = function () {
      try { localStorage.setItem(CLE_COPIE, '1'); } catch (e) {}
    };
    // Il a déjà commencé sans copie : son travail passe avant.
    if (items.length || movements.length) { marquer(); return; }

    items = (d.articles || []).filter(function (a) { return a && typeof a === 'object'; })
      .map(function (it) {
        if (!it.id) it.id = genId();
        if (it.ref === undefined) it.ref = '';
        if (it.unit === undefined) it.unit = 'pièce';
        if (it.seuil === undefined) it.seuil = 5;
        if (it.supplier === undefined) it.supplier = '';
        return it;
      });
    movements = (d.mouvements || []).filter(function (m) {
      if (!m || !m.date) return false;
      if (!m.day) m.day = dayKey(new Date(m.date));
      return true;
    });
    saveItems(items);
    saveMovements(movements);
    marquer();
  }

  // ---------- La boutique, pour les factures ----------
  // Une facture éditée ici sort au nom de la boutique : société, logo, NIF,
  // STAT, email et téléphone du patron (factures.js). Demandés une fois, à
  // l'entrée ; sans réponse, la facture se contente du nom de l'employé.
  function chargerLaBoutique() {
    const client = window.__sb;
    if (!client || !client.functions) return;
    client.functions.invoke('mpiasa', { headers: entetes(), body: { jeton: jeton, action: 'boutique' } })
      .then(function (res) {
        const b = res && res.data && res.data.boutique;
        if (b && typeof b === 'object') window.__boutique = b;
      }, function () {});
  }

  // ---------- Entrer ----------
  // Les appels et le direct reconnaissent les gens à leur email. On lui en
  // donne un qui n'appartient à personne — « .invalid » est réservé à cela —
  // plutôt que celui noté dans l'équipe : il pourrait être celui d'un compte,
  // et il se ferait passer pour lui.
  function emailDe(p) {
    return 'mpiasa-' + String(p.id || jeton.slice(0, 12)) + '@ny-asako.invalid';
  }

  function entrer(d) {
    const p = d.personne || {};
    copierLeStockUneFois(d);
    chargerLaBoutique();
    monId = p.id || null;
    currentUser = {
      name: p.nom || 'Mpiasa', email: emailDe(p), phone: p.telephone || '',
      logo: null, company: '', nif: '', stat: ''
    };
    const nom = document.getElementById('currentUserName');
    if (nom) nom.textContent = currentUser.name;
    const sous = document.getElementById('currentUserEmail');
    if (sous) sous.textContent = ROLES[p.role] || p.role || '';

    const attente = document.getElementById('mpiasaScreen');
    if (attente) attente.style.display = 'none';
    entre = true;
    openApp();
    ouvrirSurLAccueil();
    // La carte de « Ny momba ahy » se mesure quand la page paraît : cachée,
    // elle n'avait pas de taille, et n'aurait rempli qu'un coin.
    const moi = document.getElementById('navMoi');
    if (moi) moi.addEventListener('click', function () {
      setTimeout(function () { if (maCarte) maCarte.invalidateSize(); }, 300);
    });
    // Un livreur ouvre son lien pour dire où il est et le voir : il arrive
    // directement sur sa page, la carte sous les yeux. Un employé qui porte
    // une course aussi — c'est là qu'il voit pourquoi on lui demande où il est.
    if ((p.role === 'livreur' || aUneCourse(d)) && moi) moi.click();
    // Le patron voit tout de suite où il en est, sans attendre un premier
    // changement.
    envoyerMonStock();
  }

  // ---------- Ny momba ahy ----------
  // Ce qui n'appartient qu'à lui : ses heures, ses courses, et pour un
  // livreur, où il est.
  function dessinerMoi(d) {
    const zone = document.getElementById('moiContenu');
    if (!zone) return;
    const p = d.personne || {};
    const livraisons = d.livraisons || [];
    const pointages = d.pointages || [];

    const ouvert = pointages.filter(function (l) { return !l.depart; })[0] || null;
    let msJour = 0;
    const jour = new Date(); jour.setHours(0, 0, 0, 0);
    pointages.forEach(function (l) {
      const debut = new Date(l.arrivee).getTime();
      if (debut < jour.getTime()) return;
      msJour += Math.max(0, (l.depart ? new Date(l.depart).getTime() : Date.now()) - debut);
    });

    let sortie = '';

    sortie += '<div class="section-head"><div>' +
      '<h2>' + html(p.nom || '—') + '</h2>' +
      '<p>' + html(ROLES[p.role] || p.role || '') +
      (ouvert
        ? ' · <span style="color:var(--cyan);">eo am-piasana hatramin\'ny ' +
          new Date(ouvert.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</span>'
        : '') +
      '</p></div></div>';

    sortie += '<div class="panel">' +
      '<div class="panneau-titre">Anio</div>' +
      '<p style="font-size:0.85rem; color:var(--muted); margin:0;">Ora niasana anio : <strong style="color:var(--cyan);">' +
      heures(msJour) + '</strong></p>' +
      '</div>';

    // ---- Où il est ----
    // Pour les livreurs, et pour un employé tant qu'il porte une course : au
    // magasin, sans course, il n'a pas à être suivi.
    const suivable = p.role === 'livreur' || aUneCourse(d);
    if (suivable) {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Ny toerana misy anao</div>' +
        (p.role !== 'livreur'
          ? '<p style="font-size:0.78rem; color:var(--cyan); line-height:1.6; margin:0 0 0.5rem;">' +
            'Manana fandefasana mbola tsy vita ianao : alefa ny toerana misy anao mandra-pahatongan\'ny entana na mandra-pahafoanany.' +
            '</p>'
          : '') +
        '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.7rem;">' +
        'Manontany alalana ny finday rehefa misokatra ity pejy ity. Raha manaiky ianao, hitanao eto amin\'ny sarintany ny toerana misy anao, ' +
        'ary hitan\'ny patron sy ny mpanjifa izy : alefa isaky ny iray minitra, ary avy hatrany rehefa mitady anao izy ireo. ' +
        'Azonao esorina na oviana na oviana ao amin\'ny réglages ny finday.' +
        '</p>' +
        '<div id="maCarte" style="height:260px; border-radius:10px; overflow:hidden; border:1px solid var(--line); margin:0 0 0.8rem;"></div>' +
        '<p id="maPosition" style="font-size:0.85rem; line-height:1.6; margin:0 0 0.7rem;">—</p>' +
        '<button type="button" class="btn btn-primary btn-sm" id="maPositionBtn" style="width:auto;">Manaiky — alefaso ny toerako</button>' +
        '</div>';
    }

    // ---- Ses courses ----
    sortie += '<div class="panel" style="margin-top:1rem;">' +
      '<div class="panneau-titre">Ny fandefasana nomena anao</div>';
    if (!livraisons.length) {
      sortie += '<p class="empty-hint">Mbola tsy misy.</p>';
    } else {
      livraisons.forEach(function (l) {
        sortie += '<div style="border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-top:0.6rem; font-size:0.82rem; line-height:1.6;">' +
          '<strong style="color:var(--text);">' + html(l.designation) + '</strong>' +
          ' · <span style="color:var(--cyan);">' + html(STATUTS[l.statut] || l.statut) + '</span>' +
          (l.client ? '<br>Mpanjifa : ' + html(l.client) : '') +
          (l.adresse ? '<br>Adiresy : ' + html(l.adresse) : '') +
          (l.telephone ? '<br><a href="tel:' + html(l.telephone) + '" style="color:var(--cyan);">' + html(l.telephone) + '</a>' : '') +
          '</div>';
      });
    }
    sortie += '</div>';

    zone.innerHTML = sortie;

    // La page se redessine : un suivi déjà accepté ne doit pas redemander
    // l'accord, ni perdre la dernière position affichée.
    const b = document.getElementById('maPositionBtn');
    if (b) {
      if (suivi !== null) { b.disabled = true; b.textContent = 'Alefa…'; }
      b.addEventListener('click', commencerLeSuivi);
    }
    if (suivable) {
      dessinerMaCarte();
      if (dernierePosition) montrerMaPosition(dernierePosition);
      // Ouvrir son lien suffit : le livreur n'a pas à chercher le bouton. Le
      // navigateur demande l'accord lui-même, et un refus reste un refus —
      // on ne le redemande pas à chaque relecture ; le bouton, lui, reste.
      if (suivi === null && !suiviRefuse) commencerLeSuivi();
    } else {
      // L'employé n'a plus de course en route : on cesse de dire où il est.
      arreterLeSuivi();
    }
  }

  // ---------- Dire où l'on est ----------
  // Le navigateur demande la permission lui-même, et la refuse par défaut :
  // personne n'est suivi sans l'avoir accepté, et l'accord se retire dans les
  // réglages du téléphone. On ne contourne rien — on ne le pourrait pas.
  let suivi = null;
  let suiviRefuse = false;
  let dernierEnvoi = 0;
  let dernierePosition = null;
  let maCarte = null;
  let monRepere = null;

  // Chaque position reçue se montre aussitôt, sur sa carte : le livreur voit
  // où il est à mesure qu'il avance.
  function recevoirPosition(pos) {
    montrerMaPosition(pos);
    // Elle ne part qu'une fois par minute au plus : un téléphone qui parle sans
    // cesse se vide, et une position à la seconde n'apprend rien de plus au
    // patron qu'une à la minute. Sauf quand on le cherche (plus bas).
    if (Date.now() - dernierEnvoi < 60000) return;
    envoyerPosition(pos);
  }

  function envoyerPosition(pos) {
    const client = window.__sb;
    if (!client || !client.functions) return;
    dernierEnvoi = Date.now();
    client.functions.invoke('mpiasa', { headers: entetes(),
      body: {
        jeton: jeton,
        action: 'position',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision: pos.coords.accuracy
      }
    }).then(function () {}, function () {});
  }

  function montrerMaPosition(pos) {
    dernierePosition = pos;
    dessinerMaCarte();
    const el = document.getElementById('maPosition');
    if (!el) return;
    const lat = pos.coords.latitude.toFixed(5);
    const lng = pos.coords.longitude.toFixed(5);
    el.innerHTML = 'Ny toerana misy anao : <strong style="color:var(--cyan);">' + lat + ', ' + lng + '</strong>' +
      ' (± ' + Math.round(pos.coords.accuracy) + ' m)<br>' +
      '<span style="color:var(--muted);">' + new Date(pos.timestamp || Date.now()).toLocaleTimeString('fr-FR') + '</span>';
  }

  // Sa carte à lui : Antananarivo tant que le téléphone n'a rien dit, puis
  // lui, suivi pas à pas. La page se redessine de temps en temps, et la boîte
  // avec elle : une carte accrochée à l'ancienne boîte est refaite.
  function dessinerMaCarte() {
    const boite = document.getElementById('maCarte');
    if (!boite || typeof chargerCarteLibre !== 'function') return;
    if (maCarte && maCarte.getContainer() !== boite) { maCarte.remove(); maCarte = null; monRepere = null; }
    chargerCarteLibre().then(function (prete) {
      if (!prete) { boite.style.display = 'none'; return; }
      if (!boite.isConnected) return;
      const L = window.L;
      const ici = dernierePosition
        ? [dernierePosition.coords.latitude, dernierePosition.coords.longitude]
        : null;
      if (!maCarte) {
        maCarte = L.map(boite).setView(ici || [centreParDefaut.lat, centreParDefaut.lng], ici ? 16 : 12);
        fondCarteLibre(maCarte);
      }
      if (ici) {
        if (!monRepere) {
          monRepere = repereCarteLibre(ici).addTo(maCarte);
          monRepere.bindTooltip('Ianao', { permanent: true, direction: 'top', offset: [0, -10] });
          maCarte.setView(ici, 16);
        } else {
          monRepere.setLatLng(ici);
          maCarte.panTo(ici);
        }
      }
      maCarte.invalidateSize();
      setTimeout(function () { if (maCarte) maCarte.invalidateSize(); }, 300);
    });
  }

  // Une course confiée et pas encore arrivée ni annulée. La fonction ne rend
  // que les courses de celui qui porte le jeton.
  function aUneCourse(d) {
    return (d.livraisons || []).some(function (l) {
      return l.statut !== 'tonga' && l.statut !== 'foana';
    });
  }

  // Plus de course : le téléphone cesse d'écouter où il est, et la page
  // cesse de le demander. Le prochain « Tadiavo » ne trouvera rien à envoyer.
  function arreterLeSuivi() {
    if (suivi !== null && navigator.geolocation) navigator.geolocation.clearWatch(suivi);
    suivi = null;
    if (maCarte) { maCarte.remove(); maCarte = null; monRepere = null; }
  }

  function commencerLeSuivi() {
    const el = document.getElementById('maPosition');
    if (!navigator.geolocation) {
      if (el) el.textContent = 'Tsy mahay milaza toerana ity finday ity.';
      return;
    }
    if (suivi !== null) return;
    suiviRefuse = false;
    const b = document.getElementById('maPositionBtn');
    if (b) { b.disabled = true; b.textContent = 'Alefa…'; }
    if (el && !dernierePosition) el.textContent = 'Miandry ny toerana…';
    suivi = navigator.geolocation.watchPosition(recevoirPosition, function (e) {
      const refus = !!(e && e.code === 1);
      if (refus) {
        // Refusé : on cesse d'écouter, et le bouton redevient le moyen de
        // redemander, une fois l'accord rendu dans les réglages.
        navigator.geolocation.clearWatch(suivi);
        suivi = null;
        suiviRefuse = true;
        const bouton = document.getElementById('maPositionBtn');
        if (bouton) { bouton.disabled = false; bouton.textContent = 'Manaiky — alefaso ny toerako'; }
      }
      const ici = document.getElementById('maPosition');
      if (!ici) return;
      ici.textContent = refus
        ? 'Tsy nomena alalana. Sokafy ao amin\'ny réglages ny toerana, dia tsindrio ny bokotra etsy ambany.'
        : 'Tsy hita ny toerana amin\'izao fotoana izao.';
    }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
    ecouterLesDemandes();
  }

  // ---------- Quand on le cherche ----------
  // Le patron ou le client pressent « Tadiavo ». La page du livreur ne peut
  // pas être appelée de loin : c'est elle qui demande, toutes les quinze
  // secondes, si quelqu'un le cherche. Si la demande est plus récente que sa
  // dernière position envoyée, il en prend une neuve — pas la dernière
  // connue, qui peut dater s'il n'a pas bougé — et l'envoie aussitôt.
  //
  // Seulement tant qu'il a accepté d'être suivi : sans accord, il n'y a rien
  // à envoyer, et la question ne se pose pas.
  let ecouteDemandes = null;

  function ecouterLesDemandes() {
    if (ecouteDemandes) return;
    ecouteDemandes = setInterval(function () {
      if (!entre || suivi === null || !navigator.geolocation) return;
      const client = window.__sb;
      if (!client || !client.functions) return;
      client.functions.invoke('mpiasa', { headers: entetes(), body: { jeton: jeton, action: 'attente' } }).then(function (res) {
        const demande = res && res.data && res.data.demande;
        if (!demande || new Date(demande).getTime() <= dernierEnvoi) return;
        // Marqué tout de suite : la prochaine question, dans quinze secondes,
        // ne doit pas relancer une recherche déjà partie.
        dernierEnvoi = Date.now();
        navigator.geolocation.getCurrentPosition(function (pos) {
          montrerMaPosition(pos);
          envoyerPosition(pos);
        }, function () {
          if (dernierePosition) envoyerPosition(dernierePosition);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      }, function () {});
    }, 15000);
  }

  // ---------- Dire pourquoi ----------
  // « Tsy mety ny rohy » ne se répare pas : il faut savoir si le lien est
  // inconnu, suspendu, ou si c'est le serveur qui n'a pas répondu. Le
  // serveur le dit déjà ; il ne restait qu'à l'écouter.
  const RAISONS = {
    'lien invalide': 'Tsy fantatra ity rohy ity. Mety nesorina ilay olona, na nataovy rohy vaovao ka lany andro ity.',
    'lien suspendu': 'Naato ity rohy ity. Ny tompon\'ny fivarotana no afaka mamelona azy indray.',
    'méthode refusée': 'Tsy nety ny fangatahana.',
    'configuration incomplète': 'Tsy vita ny fandaminana ao amin\'ny Supabase.',
    'table refusée': 'Tsy azo atao amin\'ny rohy io.',
    'requête illisible': 'Tsy nety ny fangatahana.'
  };

  // Le corps de la réponse d'erreur n'arrive pas tout seul : supabase-js
  // tend la réponse brute, et c'est à nous de l'ouvrir.
  function codeDe(err) {
    try {
      const ctx = err && err.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (b) {
          return b && b.error ? String(b.error) : '';
        }, function () { return ''; });
      }
    } catch (e) {}
    return Promise.resolve('');
  }
  function repondu(err) {
    return !!(err && err.context && typeof err.context.json === 'function');
  }

  // Un lien qui ne vaut plus ferme l'application, même ouverte : suspendu
  // pendant qu'il travaillait, il ne doit plus rien voir. Son stock, lui,
  // reste dans son navigateur — il le retrouvera si le patron le rétablit.
  function erreur(message) {
    if (entre && typeof teardownRealtimeFeatures === 'function') teardownRealtimeFeatures();
    entre = false;
    currentUser = null;
    const ecran = poserLEcran();
    ecran.innerHTML =
      '<div class="login-card" style="margin:3rem auto;">' +
      '<div class="eyebrow">Ny asako</div>' +
      '<h1 style="font-size:1.2rem;">Tsy mety ny rohy</h1>' +
      '<p class="sub">' + html(message) + '</p>' +
      '</div>';
  }
  function erreurDuServeur(err, repli) {
    codeDe(err).then(function (code) {
      erreur(RAISONS[code] || (code ? repli + ' (' + code + ')' : repli));
    });
  }

  let derniereDemande = 0;
  function demander() {
    derniereDemande = Date.now();
    const client = window.__sb;
    if (!client || !client.functions || !client.functions.invoke) {
      if (!entre) erreur('Tsy tafaraka amin\'ny Supabase. Andramo indray.');
      return;
    }
    client.functions.invoke('mpiasa', { headers: entetes(), body: { jeton: jeton } }).then(function (res) {
      if (res && res.error) {
        // Sans réponse du serveur — réseau coupé —, on garde ce qu'on a :
        // le lien n'y est pour rien. Avec une réponse, c'est lui qui parle.
        if (entre && !repondu(res.error)) return;
        erreurDuServeur(res.error, 'Tsy mahazo alalana ity rohy ity.');
        return;
      }
      const d = res && res.data;
      if (!d || d.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      if (!entre) entrer(d);
      dessinerMoi(d);
    }, function () {
      if (!entre) erreur('Tsy tafita ny fangatahana.');
    });
  }

  // ---------- L'équipe du patron, sans compte ----------
  // equipe.js écrit « client.from('equipe').select('*').eq(...) », comme
  // pour Supabase. Ce client-ci prend note de la demande, sans rien savoir
  // faire, et l'envoie telle quelle à la fonction « mpiasa ». Elle seule
  // décide : quelles tables, quelles opérations, et surtout au nom de quel
  // patron — l'email que le code met dans la demande n'est pas écouté.
  function envoyer(demande) {
    const client = window.__sb;
    const echec = function (message) { return { data: null, error: { message: message } }; };
    if (!client || !client.functions) return Promise.resolve(echec('Tsy tafaraka amin\'ny Supabase.'));
    return client.functions.invoke('mpiasa', { headers: entetes(),
      body: { jeton: jeton, action: 'table', requete: demande }
    }).then(function (res) {
      if (res && res.error) {
        if (!repondu(res.error)) return echec('Tsy tafita ny fangatahana.');
        return codeDe(res.error).then(function (code) {
          if (code === 'lien invalide' || code === 'lien suspendu') erreur(RAISONS[code]);
          return echec(RAISONS[code] || code || 'Tsy nety ny fangatahana.');
        });
      }
      const d = (res && res.data) || {};
      // Une fonction pas encore redéployée ne connaît pas « table » : elle
      // rend la page de l'employé, et une liste vide passerait pour vraie.
      if (!('data' in d) && !('error' in d)) {
        return echec('Mbola tsy navoaka indray ny fonction « mpiasa » ao amin\'ny Supabase.');
      }
      return { data: d.data === undefined ? null : d.data, error: d.error ? { message: String(d.error) } : null };
    }, function () {
      return echec('Tsy tafita ny fangatahana.');
    });
  }

  function depuisLaTable(table) {
    const demande = {
      table: table, op: 'select', colonnes: '*', filtres: [],
      ordre: null, limite: null, unique: false, valeurs: null
    };
    const q = {
      select: function (c) { demande.colonnes = c || '*'; return q; },
      insert: function (v) { demande.op = 'insert'; demande.valeurs = v; return q; },
      update: function (v) { demande.op = 'update'; demande.valeurs = v; return q; },
      upsert: function (v) { demande.op = 'upsert'; demande.valeurs = v; return q; },
      delete: function () { demande.op = 'delete'; return q; },
      eq: function (c, v) { demande.filtres.push([c, 'eq', v]); return q; },
      is: function (c, v) { demande.filtres.push([c, 'is', v]); return q; },
      in: function (c, v) { demande.filtres.push([c, 'in', v]); return q; },
      order: function (c, o) {
        demande.ordre = { colonne: c, croissant: !(o && o.ascending === false) };
        return q;
      },
      limit: function (n) { demande.limite = n; return q; },
      maybeSingle: function () { demande.unique = true; return q; },
      single: function () { demande.unique = true; return q; },
      then: function (ok, ko) { return envoyer(demande).then(ok, ko); }
    };
    return q;
  }

  window.__sbMpiasa = {
    from: depuisLaTable,
    // equipe.js vérifie qu'une session est ouverte avant de lire. Ici, c'est
    // le jeton qui en tient lieu, et la fonction le revérifie à chaque fois.
    auth: {
      getSession: function () {
        return Promise.resolve({ data: { session: entre ? { lien: true } : null } });
      }
    }
  };

  // ---------- Les notifications de la boutique ----------
  // common.js partage certaines notifications entre le patron et ses
  // employés : sorties de stock, articles épuisés, portefeuille, directs.
  // L'employé n'a pas de compte : elles passent par la fonction « mpiasa », et
  // c'est le jeton qui dit de qui elles viennent et pour quelle boutique.
  let monId = null;
  window.__mpiasaNotif = {
    // Pour reconnaître les siennes quand elles reviennent du serveur.
    get id() { return monId; },
    envoyer: function (type, message) {
      const client = window.__sb;
      if (!entre || !client || !client.functions) return;
      client.functions.invoke('mpiasa', { headers: entetes(),
        body: { jeton: jeton, action: 'notifier', type: type, message: message }
      }).then(function () {}, function () {});
    },
    lire: function (depuis) {
      const client = window.__sb;
      if (!entre || !client || !client.functions) return Promise.resolve([]);
      return client.functions.invoke('mpiasa', { headers: entetes(),
        body: { jeton: jeton, action: 'notifications', depuis: depuis }
      }).then(function (res) {
        return (res && res.data && res.data.notifications) || [];
      }, function () { return []; });
    }
  };

  // ---------- Ce que suit le patron ----------
  // Son stock ne quitte pas ce navigateur : le patron, qui doit pouvoir le
  // suivre, n'en verrait rien. On lui en envoie une copie après chaque
  // changement (common.js appelle deposerStockMpiasa à chaque
  // enregistrement), regroupée : dix articles saisis d'affilée partent en
  // une fois, trois secondes après le dernier.
  const MOUVEMENTS_ENVOYES = 1000;
  let envoiPrevu = null;

  function envoyerMonStock() {
    if (!entre) return;
    const client = window.__sb;
    if (!client || !client.functions) return;
    const recents = movements.slice()
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
      .slice(0, MOUVEMENTS_ENVOYES);
    client.functions.invoke('mpiasa', { headers: entetes(),
      body: { jeton: jeton, action: 'stock', articles: items, mouvements: recents }
    }).then(function () {}, function () {});
  }

  window.deposerStockMpiasa = function () {
    if (envoiPrevu) clearTimeout(envoiPrevu);
    envoiPrevu = setTimeout(function () {
      envoiPrevu = null;
      envoyerMonStock();
    }, 3000);
  };

  // L'onglet qu'on quitte ne laisse pas un envoi en suspens : fermé dans les
  // trois secondes, le dernier changement ne serait jamais parti.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden || !envoiPrevu) return;
    clearTimeout(envoiPrevu);
    envoiPrevu = null;
    envoyerMonStock();
  });

  // On pose l'attente tout de suite — sinon l'écran de connexion clignote
  // avant — et on demande dès que la page est prête.
  patienter();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demander);
  } else {
    demander();
  }
  // Toutes les cinq minutes, et au retour sur la page : un lien suspendu
  // doit cesser d'ouvrir, et une course a pu lui être confiée.
  setInterval(function () {
    if (entre && !document.hidden) demander();
  }, 300000);
  document.addEventListener('visibilitychange', function () {
    if (entre && !document.hidden && Date.now() - derniereDemande > 60000) demander();
  });
})();

// L'écran de l'employé.
//
// Il arrive par un lien, pas par un mot de passe. Le jeton dans l'adresse
// dit qui il est ; la fonction « mpiasa » lui répond, et c'est tout ce qu'il
// verra : son nom, le stock du patron, ses courses, ses heures.
//
// Rien n'est modifiable. Ce n'est pas une page qu'on aurait verrouillée —
// c'est une page qui n'a aucun bouton pour écrire, et qui ne parle qu'à une
// fonction qui ne sait que lire.

(function () {
  const jeton = (function () {
    try { return new URLSearchParams(location.search).get('mpiasa') || ''; }
    catch (e) { return ''; }
  })();

  // Pas de jeton : l'application se comporte comme d'habitude.
  if (!jeton) return;

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

  // On prend la place de tout le reste : ni écran de connexion, ni
  // application. Une page à moitié cachée laisse toujours un bord visible.
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

  function dessiner(d) {
    const ecran = poserLEcran();
    const p = d.personne || {};
    const articles = d.articles || [];
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

    sortie += '<div class="brand" style="font-size:1.2rem; margin-bottom:1.2rem;">Ny <span>asako</span></div>';

    sortie += '<div class="panel">' +
      '<div class="panneau-titre">' + html(p.nom || '—') + '</div>' +
      '<p style="font-size:0.85rem; color:var(--muted); margin:0;">' +
      html(ROLES[p.role] || p.role || '') +
      (ouvert
        ? ' · <span style="color:var(--cyan);">eo am-piasana hatramin\'ny ' +
          new Date(ouvert.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</span>'
        : '') +
      '</p>' +
      '<p style="font-size:0.85rem; color:var(--muted); margin:0.5rem 0 0;">Ora niasana anio : <strong style="color:var(--cyan);">' +
      heures(msJour) + '</strong></p>' +
      '</div>';

    // ---- Le stock ----
    sortie += '<div class="panel" style="margin-top:1rem;">' +
      '<div class="panneau-titre">Ny articles</div>' +
      '<p style="font-size:0.78rem; color:var(--muted); margin:0 0 0.8rem;">' +
      'Fijerena ihany — tsy azo ovaina.' +
      (d.stockMaj ? ' Nohavaozina : ' + new Date(d.stockMaj).toLocaleString('fr-FR') + '.' : '') +
      '</p>';

    if (!articles.length) {
      sortie += '<p class="empty-hint">Mbola tsy misy article.</p>';
    } else {
      sortie += '<div class="table-scroll"><table><thead><tr>' +
        '<th>Article</th><th>Réf.</th><th>Isa</th><th>Vidiny</th>' +
        '</tr></thead><tbody>';
      articles.forEach(function (a) {
        const qte = Number(a.qty ?? a.quantity ?? a.quantite ?? 0);
        const prix = Number(a.price ?? a.prix ?? 0);
        sortie += '<tr>' +
          '<td>' + html(a.name ?? a.nom ?? '—') + '</td>' +
          '<td>' + html(a.ref ?? a.reference ?? '—') + '</td>' +
          '<td>' + qte.toLocaleString('fr-FR') + '</td>' +
          '<td>' + (prix ? prix.toLocaleString('fr-FR') + ' Ar' : '—') + '</td>' +
          '</tr>';
      });
      sortie += '</tbody></table></div>';
    }
    sortie += '</div>';

    // ---- Où il est ----
    // Seulement pour les livreurs : un employé au magasin n'a pas à être suivi.
    if (p.role === 'livreur') {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Ny toerana misy anao</div>' +
        '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin:0 0 0.7rem;">' +
        'Raha manaiky ianao, ny toerana misy anao dia alefa isaky ny iray minitra, mba hahitan\'ny patron hoe aiza ianao. ' +
        'Azonao esorina na oviana na oviana ao amin\'ny r\u00e9glages ny finday.' +
        '</p>' +
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

    ecran.innerHTML = sortie;

    const b = document.getElementById('maPositionBtn');
    if (b) b.addEventListener('click', function () {
      b.disabled = true;
      b.textContent = 'Alefa…';
      commencerLeSuivi();
    });
  }

  // ---------- Dire où l'on est ----------
  // Le navigateur demande la permission lui-même, et la refuse par défaut :
  // personne n'est suivi sans l'avoir accepté, et l'accord se retire dans les
  // réglages du téléphone. On ne contourne rien — on ne le pourrait pas.
  let suivi = null;
  let dernierEnvoi = 0;

  function envoyerPosition(pos) {
    const client = window.__sb;
    if (!client || !client.functions) return;
    // Une fois par minute au plus : un téléphone qui parle sans cesse se vide,
    // et une position à la seconde n'apprend rien de plus qu'une à la minute.
    const maintenant = Date.now();
    if (maintenant - dernierEnvoi < 60000) return;
    dernierEnvoi = maintenant;
    client.functions.invoke('mpiasa', {
      body: {
        jeton: jeton,
        action: 'position',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision: pos.coords.accuracy
      }
    }).then(function () {}, function () {});
    montrerMaPosition(pos);
  }

  function montrerMaPosition(pos) {
    const el = document.getElementById('maPosition');
    if (!el) return;
    const lat = pos.coords.latitude.toFixed(5);
    const lng = pos.coords.longitude.toFixed(5);
    el.innerHTML = 'Ny toerana misy anao : <strong style="color:var(--cyan);">' + lat + ', ' + lng + '</strong>' +
      ' (± ' + Math.round(pos.coords.accuracy) + ' m)<br>' +
      '<span style="color:var(--muted);">' + new Date().toLocaleTimeString('fr-FR') + '</span>';
  }

  function commencerLeSuivi() {
    const el = document.getElementById('maPosition');
    if (!navigator.geolocation) {
      if (el) el.textContent = 'Tsy mahay milaza toerana ity finday ity.';
      return;
    }
    if (el) el.textContent = 'Miandry ny toerana…';
    suivi = navigator.geolocation.watchPosition(envoyerPosition, function (e) {
      if (!el) return;
      el.textContent = (e && e.code === 1)
        ? 'Tsy nomena alalana. Sokafy ao amin\'ny r\u00e9glages ny toerana raha tianao ho hitan\'ny patron.'
        : 'Tsy hita ny toerana amin\'izao fotoana izao.';
    }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
  }

  // ---------- Dire pourquoi ----------
  // « Tsy mety ny rohy » ne se répare pas : il faut savoir si le lien est
  // inconnu, suspendu, ou si c'est le serveur qui n'a pas répondu. Le
  // serveur le dit déjà ; il ne restait qu'à l'écouter.
  const RAISONS = {
    'lien invalide': 'Tsy fantatra ity rohy ity. Mety nesorina ilay olona, na nataovy rohy vaovao ka lany andro ity.',
    'lien suspendu': 'Naato ity rohy ity. Ny tompon\'ny fivarotana no afaka mamelona azy indray.',
    'méthode refusée': 'Tsy nety ny fangatahana.',
    'configuration incomplète': 'Tsy vita ny fandaminana ny serveur.'
  };

  // Le corps de la réponse d'erreur n'arrive pas tout seul : supabase-js
  // tend la réponse brute, et c'est à nous de l'ouvrir.
  function pourquoi(err, repli) {
    try {
      const ctx = err && err.context;
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (b) {
          const m = b && b.error ? String(b.error) : '';
          return RAISONS[m] || (m ? repli + ' (' + m + ')' : repli);
        }, function () { return repli; });
      }
    } catch (e) {}
    return Promise.resolve(repli);
  }

  function erreur(message) {
    const ecran = poserLEcran();
    ecran.innerHTML =
      '<div class="login-card" style="margin:3rem auto;">' +
      '<div class="eyebrow">Ny asako</div>' +
      '<h1 style="font-size:1.2rem;">Tsy mety ny rohy</h1>' +
      '<p class="sub">' + html(message) + '</p>' +
      '</div>';
  }

  function demander() {
    const client = window.__sb;
    if (!client || !client.functions || !client.functions.invoke) {
      erreur('Tsy tafaraka amin\'ny serveur. Andramo indray.');
      return;
    }
    client.functions.invoke('mpiasa', { body: { jeton: jeton } }).then(function (res) {
      if (res && res.error) {
        pourquoi(res.error, 'Tsy mahazo alalana ity rohy ity.').then(erreur);
        return;
      }
      const d = res && res.data;
      if (!d || d.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      dessiner(d);
    }, function () {
      erreur('Tsy tafita ny fangatahana.');
    });
  }

  // On pose l'écran tout de suite — sinon l'application clignote avant lui —
  // et on demande dès que la page est prête.
  poserLEcran();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demander);
  } else {
    demander();
  }
  // Toutes les deux minutes : le stock a pu changer, une course avancer.
  setInterval(demander, 120000);
})();

// L'écran du client qui attend sa livraison.
//
// Il arrive par un lien reçu en SMS. Il n'a pas de compte, ne se connecte
// pas, et ne verra qu'une chose : sa course. Où en est-elle, qui l'apporte,
// et — tant qu'elle est en route — où se trouve le livreur.
//
// La carte se dessine avec la clé du commerçant, rendue par la fonction :
// le téléphone du client ne la connaît pas autrement. Sans clé, la page
// reste utile : le lieu s'écrit en toutes lettres et s'ouvre dans Google
// Maps d'un doigt.

(function () {
  const jeton = (function () {
    try { return new URLSearchParams(location.search).get('suivi') || ''; }
    catch (e) { return ''; }
  })();

  // Pas de jeton : l'application se comporte comme d'habitude. Et si c'est
  // l'écran de l'employé qui est demandé, on lui laisse la place.
  if (!jeton) return;
  try { if (new URLSearchParams(location.search).get('mpiasa')) return; } catch (e) {}

  const STATUTS = {
    miandry: { texte: 'Miandry ny livreur', couleur: 'var(--muted)', note: 'Mbola tsy nalain’ny livreur ny entanao.' },
    nalaina: { texte: 'Efa an-tanan’ny livreur', couleur: 'var(--amber)', note: 'Nalain’ny livreur ny entanao.' },
    an_dalana: { texte: 'An-dalana', couleur: 'var(--violet)', note: 'Eny an-dalana ho any aminao ny entanao.' },
    tonga: { texte: 'Tonga', couleur: 'var(--cyan)', note: 'Tonga ny entanao. Misaotra.' },
    foana: { texte: 'Nofoanana', couleur: 'var(--red)', note: 'Nofoanana ity fandefasana ity.' }
  };

  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function depuis(iso) {
    const mn = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mn < 1) return 'vao izao';
    if (mn < 60) return mn + ' mn lasa izay';
    const h = Math.floor(mn / 60);
    if (h < 24) return h + ' ora lasa izay';
    return new Date(iso).toLocaleString('fr-FR');
  }

  // On prend la place de tout le reste : une page à moitié cachée laisse
  // toujours un bord visible.
  function poserLEcran() {
    ['loginScreen', 'appScreen', 'paywallScreen', 'welcomeOverlay', 'autoNoticeModal']
      .forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    let ecran = document.getElementById('suiviScreen');
    if (!ecran) {
      ecran = document.createElement('div');
      ecran.id = 'suiviScreen';
      ecran.style.cssText = 'min-height:100vh; padding:1.2rem 3vw 3rem; max-width:620px; margin:0 auto;';
      document.body.appendChild(ecran);
    }
    ecran.style.display = 'block';
    return ecran;
  }

  let carte = null;
  let repere = null;
  let mapsDemandee = null;
  let cleConnue = '';

  function chargerGoogleMaps(cle) {
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve(true);
    if (mapsDemandee) return mapsDemandee;
    if (!cle) return Promise.resolve(false);
    mapsDemandee = new Promise(function (fini) {
      const s = document.createElement('script');
      window.__carteSuiviPrete = function () { fini(true); };
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cle) +
        '&loading=async&callback=__carteSuiviPrete';
      s.async = true;
      s.onerror = function () { fini(false); };
      document.head.appendChild(s);
      // Une clé refusée ne déclenche ni onerror ni callback.
      setTimeout(function () { fini(!!(window.google && window.google.maps)); }, 12000);
    });
    return mapsDemandee;
  }

  function poserLaCarte(pos, nom) {
    const boite = document.getElementById('suiviCarte');
    if (!boite || !pos) return;
    if (!cleConnue) { boite.style.display = 'none'; return; }
    boite.style.display = 'block';
    chargerGoogleMaps(cleConnue).then(function (prete) {
      if (!prete) { boite.style.display = 'none'; return; }
      const g = window.google.maps;
      const point = { lat: Number(pos.lat), lng: Number(pos.lng) };
      if (!carte) {
        carte = new g.Map(boite, {
          center: point, zoom: 15,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false
        });
      }
      if (!repere) repere = new g.Marker({ map: carte, position: point, title: nom || '' });
      else { repere.setPosition(point); repere.setTitle(nom || ''); }
      carte.setCenter(point);
    });
  }

  function dessiner(d) {
    const ecran = poserLEcran();
    const st = STATUTS[d.statut] || { texte: d.statut, couleur: 'var(--muted)', note: '' };
    const pos = d.position;
    cleConnue = d.cle || '';

    let sortie = '';
    sortie += '<div class="brand" style="font-size:1.2rem; margin-bottom:1.2rem;">Ny <span>asako</span></div>';

    sortie += '<div class="panel">' +
      '<div class="panneau-titre">' + html(d.entana || 'Ny entanao') + '</div>' +
      (d.client ? '<p style="font-size:0.85rem; color:var(--muted); margin:0 0 0.6rem;">Ho an’i ' + html(d.client) + '</p>' : '') +
      '<p style="font-size:1.05rem; font-weight:600; color:' + st.couleur + '; margin:0.3rem 0 0.4rem;">' +
      html(st.texte) + '</p>' +
      '<p style="font-size:0.85rem; color:var(--muted); line-height:1.6; margin:0;">' + html(st.note) + '</p>' +
      (d.livreur ? '<p style="font-size:0.85rem; margin:0.7rem 0 0;">Mpitondra : <strong style="color:var(--cyan);">' + html(d.livreur) + '</strong></p>' : '') +
      '</div>';

    // ---- Où en est le livreur ----
    if (pos) {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Aiza izy izao</div>' +
        '<div id="suiviCarte" style="height:300px; border-radius:10px; overflow:hidden; border:1px solid var(--line); display:none; margin-bottom:0.8rem;"></div>' +
        '<p style="font-size:0.85rem; line-height:1.7; margin:0;">' +
        'Toerana farany : <strong style="color:var(--cyan);">' + html(depuis(pos.at)) + '</strong>' +
        (pos.precision_m ? ' <span style="color:var(--muted);">(± ' + Math.round(pos.precision_m) + ' m)</span>' : '') +
        '<br><span style="color:var(--muted);">' + new Date(pos.at).toLocaleString('fr-FR') + '</span>' +
        '<br><a href="https://www.google.com/maps?q=' + Number(pos.lat) + ',' + Number(pos.lng) + '" target="_blank" rel="noopener" style="color:var(--cyan);">Sokafy ao amin’ny Google Maps</a>' +
        '</p></div>';
    } else if (d.statut !== 'tonga' && d.statut !== 'foana') {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Aiza izy izao</div>' +
        '<p class="empty-hint" style="margin:0;">Mbola tsy nandefa ny toerana misy azy ny livreur.</p>' +
        '</div>';
    }

    sortie += '<p style="font-size:0.75rem; color:var(--muted); line-height:1.6; margin:1.2rem 0 0; text-align:center;">' +
      'Havaozina ho azy isaky ny 45 segondra ity pejy ity.</p>';

    ecran.innerHTML = sortie;
    if (pos) poserLaCarte(pos, d.livreur);
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
      erreur('Tsy tafaraka amin’ny serveur. Andramo indray.');
      return;
    }
    client.functions.invoke('suivi', { body: { jeton: jeton } }).then(function (res) {
      if (res && res.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      const d = res && res.data;
      if (!d || d.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      dessiner(d);
    }, function () {
      erreur('Tsy tafita ny fangatahana.');
    });
  }

  poserLEcran();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demander);
  } else {
    demander();
  }
  // Le client regarde arriver son colis : on relit souvent, mais pas au point
  // de vider sa batterie.
  setInterval(demander, 45000);
})();

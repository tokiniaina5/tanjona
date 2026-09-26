// L'écran du client qui attend sa livraison.
//
// Il arrive par un lien reçu en SMS. Il n'a pas de compte, ne se connecte
// pas, et ne verra qu'une chose : sa course. Où en est-elle, qui l'apporte,
// et — tant qu'elle est en route — où se trouve le livreur.
//
// La carte se dessine avec la clé Google du commerçant, rendue par la
// fonction : le téléphone du client ne la connaît pas autrement. Sans clé,
// ou si elle est refusée, c'est la carte gratuite d'OpenStreetMap
// (carte-libre.js). Et le lieu s'écrit toujours en toutes lettres, ouvrable
// dans Google Maps d'un doigt.

(function () {
  const jeton = (function () {
    try { return new URLSearchParams(location.search).get('suivi') || ''; }
    catch (e) { return ''; }
  })();

  // Pas de jeton : l'application se comporte comme d'habitude. Et si c'est
  // l'écran de l'employé qui est demandé, on lui laisse la place.
  if (!jeton) return;
  try { if (new URLSearchParams(location.search).get('mpiasa')) return; } catch (e) {}

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
  let carteLibre = null;
  let repereLibre = null;
  // La recherche « Tadiavo » en cours, et ce qu'elle a dit en dernier : la
  // page se redessine pendant qu'elle cherche, le bouton et la phrase doivent
  // survivre au redessin.
  let dernierAt = null;
  let recherche = null;
  let messageRecherche = '';
  // Google a refusé la clé du commerçant : la carte gratuite, jusqu'au
  // rechargement. Et ce qu'on montrait, pour le remontrer sans attendre.
  let googleRefuse = false;
  let derniereCarte = null;

  function chargerGoogleMaps(cle) {
    // Une clé refusée laisse le script se charger ; Google remplace ensuite la
    // carte par un message d'erreur, et ne prévient que par gm_authFailure.
    // On y reprend la carte gratuite, dans une boîte neuve.
    window.gm_authFailure = function () {
      googleRefuse = true;
      carte = null;
      repere = null;
      const boite = document.getElementById('suiviCarte');
      if (!boite || !boite.parentNode || !derniereCarte) return;
      const neuve = boite.cloneNode(false);
      boite.parentNode.replaceChild(neuve, boite);
      poserLaCarteLibre(neuve, derniereCarte.pos, derniereCarte.nom);
    };
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
    if (!boite) return;
    boite.style.display = 'block';
    // La page se redessine toutes les 45 secondes, et la boîte avec elle :
    // une carte restée accrochée à l'ancienne boîte ne se voyait plus.
    if (carte && carte.getDiv() !== boite) { carte = null; repere = null; }
    if (carteLibre && carteLibre.getContainer() !== boite) {
      carteLibre.remove(); carteLibre = null; repereLibre = null;
    }
    derniereCarte = { pos: pos, nom: nom };
    if (!cleConnue || googleRefuse) { poserLaCarteLibre(boite, pos, nom); return; }
    chargerGoogleMaps(cleConnue).then(function (prete) {
      if (!prete) { poserLaCarteLibre(boite, pos, nom); return; }
      const g = window.google.maps;
      // Sans position encore : Antananarivo, sans repère.
      const point = pos ? { lat: Number(pos.lat), lng: Number(pos.lng) } : centreParDefaut;
      if (!carte) {
        carte = new g.Map(boite, {
          center: point, zoom: pos ? 15 : 12,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false
        });
      }
      if (!pos) return;
      if (!repere) repere = new g.Marker({ map: carte, position: point, title: nom || '' });
      else { repere.setPosition(point); repere.setTitle(nom || ''); }
      carte.setCenter(point);
    });
  }

  // OpenStreetMap, sans clé ni facturation (carte-libre.js).
  function poserLaCarteLibre(boite, pos, nom) {
    if (typeof chargerCarteLibre !== 'function') { boite.style.display = 'none'; return; }
    chargerCarteLibre().then(function (prete) {
      if (!prete) { boite.style.display = 'none'; return; }
      // Redessinée pendant le chargement : cette boîte-ci n'est plus à l'écran.
      if (!boite.isConnected) return;
      const L = window.L;
      if (!pos) {
        // Sans position encore : Antananarivo, sans repère.
        if (!carteLibre) {
          carteLibre = L.map(boite).setView([centreParDefaut.lat, centreParDefaut.lng], 12);
          fondCarteLibre(carteLibre);
        }
        return;
      }
      const point = [Number(pos.lat), Number(pos.lng)];
      if (!carteLibre) {
        carteLibre = L.map(boite).setView(point, 15);
        fondCarteLibre(carteLibre);
      } else {
        carteLibre.setView(point, carteLibre.getZoom());
      }
      if (!repereLibre) {
        repereLibre = repereCarteLibre(point).addTo(carteLibre);
        if (nom) repereLibre.bindTooltip(html(nom), { permanent: true, direction: 'top', offset: [0, -10] });
      } else {
        repereLibre.setLatLng(point);
      }
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
    // La carte se montre tant que la course n'est pas finie, même avant la
    // première position : le client voit où le livreur apparaîtra. Finie ou
    // annulée, la fonction ne rend plus de position, et la carte s'en va.
    const enCours = d.statut !== 'tonga' && d.statut !== 'foana';
    if (pos || enCours) {
      sortie += '<div class="panel" style="margin-top:1rem;">' +
        '<div class="panneau-titre">Aiza izy izao</div>' +
        '<div id="suiviCarte" style="height:300px; border-radius:10px; overflow:hidden; border:1px solid var(--line); display:none; margin-bottom:0.8rem;"></div>';
    }
    // Chercher n'a de sens que pour une course en route, confiée à quelqu'un.
    if (enCours && d.livreur) {
      sortie += '<div class="actions-row" style="margin:0 0 0.6rem;">' +
        '<button type="button" class="btn btn-primary btn-sm" id="suiviTadiavoBtn" style="width:auto;">📍 Tadiavo</button>' +
        '</div>' +
        '<p id="suiviTadiavoStatut" style="font-size:0.8rem; color:var(--muted); line-height:1.5; margin:0 0 0.6rem;"></p>';
    }
    if (pos) {
      sortie += '<p style="font-size:0.85rem; line-height:1.7; margin:0;">' +
        'Toerana farany : <strong style="color:var(--cyan);">' + html(depuis(pos.at)) + '</strong>' +
        (pos.precision_m ? ' <span style="color:var(--muted);">(± ' + Math.round(pos.precision_m) + ' m)</span>' : '') +
        '<br><span style="color:var(--muted);">' + new Date(pos.at).toLocaleString('fr-FR') + '</span>' +
        '<br><a href="https://www.google.com/maps?q=' + Number(pos.lat) + ',' + Number(pos.lng) + '" target="_blank" rel="noopener" style="color:var(--cyan);">Sokafy ao amin’ny Google Maps</a>' +
        '</p></div>';
    } else if (enCours) {
      sortie += '<p class="empty-hint" style="margin:0;">Mbola tsy nandefa ny toerana misy azy ny livreur.</p>' +
        '</div>';
    }

    sortie += '<p style="font-size:0.75rem; color:var(--muted); line-height:1.6; margin:1.2rem 0 0; text-align:center;">' +
      'Havaozina ho azy isaky ny 45 segondra ity pejy ity.</p>';

    ecran.innerHTML = sortie;
    if (document.getElementById('suiviCarte')) poserLaCarte(pos, d.livreur);
    dernierAt = pos ? pos.at : null;
    const tadiavoBtn = document.getElementById('suiviTadiavoBtn');
    if (tadiavoBtn) tadiavoBtn.addEventListener('click', tadiavo);
    majRecherche();
  }

  // ---------- Chercher le livreur ----------
  // La position ne vient que du téléphone du livreur, sa page ouverte et son
  // accord donné. « Tadiavo » ne la devine pas : il lui demande d'en envoyer
  // une tout de suite, puis relit toutes les cinq secondes. Au bout de 45
  // secondes sans rien, on le dit, plutôt que de laisser croire qu'on cherche
  // encore.
  function majRecherche() {
    const b = document.getElementById('suiviTadiavoBtn');
    if (b) {
      b.disabled = !!recherche;
      b.textContent = recherche ? 'Mitady…' : '📍 Tadiavo';
    }
    const s = document.getElementById('suiviTadiavoStatut');
    if (s) s.textContent = messageRecherche;
  }

  function tadiavo() {
    const client = window.__sb;
    if (recherche || !client || !client.functions) return;
    const avant = dernierAt;
    recherche = true;
    messageRecherche = 'Angatahina ny toerana misy azy…';
    majRecherche();

    const fin = function (message) {
      if (recherche && recherche !== true) clearInterval(recherche);
      recherche = null;
      messageRecherche = message;
      majRecherche();
    };

    client.functions.invoke('suivi', { headers: entetes(), body: { jeton: jeton, action: 'tadiavo' } }).then(function (res) {
      if (!res || res.error || !res.data || !res.data.ok) {
        fin('Tsy azo nitadiavana izao. Andramo indray afaka kelikely.');
        return;
      }
      let tours = 0;
      recherche = setInterval(function () {
        tours += 1;
        Promise.resolve(demander()).then(function (d) {
          const at = d && d.position ? d.position.at : null;
          if (at && at !== avant) {
            fin('Hita : ' + new Date(at).toLocaleTimeString('fr-FR') + '.');
          } else if (tours >= 9) {
            fin('Tsy namaly ny findain’ny livreur : mety tsy misokatra ny pejiny, na tsy misy internet. Andramo indray afaka kelikely.');
          }
        });
      }, 5000);
    }, function () {
      fin('Tsy tafita ny fangatahana.');
    });
  }

  // ---------- Dire pourquoi ----------
  // « Tsy mety ny rohy » ne se répare pas : il faut savoir si le lien est
  // inconnu, suspendu, ou si c'est le serveur qui n'a pas répondu. Le
  // serveur le dit déjà ; il ne restait qu'à l'écouter.
  const RAISONS = {
    'lien invalide': 'Tsy fantatra ity rohy ity. Mety nesorina ilay fandefasana, na nataovy rohy vaovao ka lany andro ity.',
    'lien suspendu': 'Naato ity rohy ity. Ny tompon\'ny fivarotana no afaka mamelona azy indray.',
    'méthode refusée': 'Tsy nety ny fangatahana.',
    'configuration incomplète': 'Tsy vita ny fandaminana ao amin’ny Supabase.'
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
      erreur('Tsy tafaraka amin’ny Supabase. Andramo indray.');
      return;
    }
    return client.functions.invoke('suivi', { headers: entetes(), body: { jeton: jeton } }).then(function (res) {
      if (res && res.error) {
        pourquoi(res.error, 'Tsy mahazo alalana ity rohy ity.').then(erreur);
        return;
      }
      const d = res && res.data;
      if (!d || d.error) { erreur('Tsy mahazo alalana ity rohy ity.'); return; }
      dessiner(d);
      return d;
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

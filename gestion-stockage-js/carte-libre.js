// La carte qui ne coûte rien.
//
// Google Maps demande une clé, et la clé demande un compte de facturation :
// une carte bancaire, que beaucoup de commerçants n'ont pas. OpenStreetMap
// dessine les mêmes rues sans clé ni carte, et Leaflet l'affiche. C'est donc
// la carte par défaut, partout où l'on suit un livreur ; Google ne prend sa
// place que si une clé a été enregistrée, et qu'elle marche.
//
// Leaflet ne se charge qu'à la première carte demandée : la plupart des pages
// n'en montrent aucune, et n'ont pas à attendre ses deux fichiers.
//
// Deux fonds : la vue du ciel (les photos d'Esri, sans clé, avec les noms des
// rues et des quartiers posés dessus), et le plan d'OpenStreetMap. Un bouton
// « 3D » ouvre la même carte en relief, plein écran ; MapLibre, quatre fois
// plus lourd que Leaflet, n'est chargé qu'à ce moment-là.

(function () {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const BASE_3D = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/';
  // Les rues d'OpenStreetMap. (Les fonds de CARTO, essayés le 04/10/2026,
  // exigent désormais une clé : ils s'affichent barrés d'« API KEY REQUIRED ».)
  const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const CIEL = ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const ROUTES = ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
  const LIEUX = ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  // Les altitudes, en couleurs : le relief de la vue 3D.
  const RELIEF = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const MENTION_ESRI = 'Photos &copy; Esri — Maxar, Earthstar Geographics';
  const MENTION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const CLE_FOND = 'nyasako-fond-carte';
  let demande = null;
  let demande3D = null;

  // Ouvrir les connexions dès le chargement de la page ne coûte presque rien,
  // et épargne à la première carte l'attente de la poignée de main.
  [['https://cdnjs.cloudflare.com', true], ['https://server.arcgisonline.com', false],
   ['https://tile.openstreetmap.org', false]]
    .forEach(function (h) {
      const lien = document.createElement('link');
      lien.rel = 'preconnect';
      lien.href = h[0];
      if (h[1]) lien.crossOrigin = 'anonymous';
      document.head.appendChild(lien);
    });

  // Où se pose une carte qui n'a encore personne à montrer : Antananarivo.
  // Une carte vide vaut mieux qu'une carte absente — on sait où elle est, et
  // où les repères viendront.
  window.centreParDefaut = { lat: -18.8792, lng: 47.5079 };

  // Un script et sa feuille de style, une seule fois. « anonymous » rend la
  // réponse lisible : le service worker peut alors la garder, et la carte
  // suivante ne retélécharge rien.
  function charger(base, nom, pret) {
    return new Promise(function (fini) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = base + nom + '.css';
      style.crossOrigin = 'anonymous';
      document.head.appendChild(style);

      const script = document.createElement('script');
      script.src = base + nom + '.js';
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = function () { fini(pret()); };
      script.onerror = function () { fini(false); };
      document.head.appendChild(script);
    });
  }

  window.chargerCarteLibre = function () {
    if (window.L && window.L.map) return Promise.resolve(true);
    if (demande) return demande;
    demande = charger(BASE, 'leaflet', function () { return !!(window.L && window.L.map); })
      .then(function (ok) {
        // Sans réseau, on laisse la porte ouverte à un nouvel essai : la
        // prochaine carte redemandera plutôt que de rester sur cet échec.
        if (!ok) demande = null;
        return ok;
      });
    return demande;
  };

  function chargerCarte3D() {
    if (window.maplibregl) return Promise.resolve(true);
    if (demande3D) return demande3D;
    demande3D = charger(BASE_3D, 'maplibre-gl', function () { return !!window.maplibregl; })
      .then(function (ok) { if (!ok) demande3D = null; return ok; });
    return demande3D;
  }

  function lireFond() {
    try { return localStorage.getItem(CLE_FOND) === 'plan' ? 'plan' : 'ciel'; } catch (e) { return 'ciel'; }
  }
  function garderFond(f) {
    try { localStorage.setItem(CLE_FOND, f); } catch (e) {}
  }

  // Les deux fonds, le bouton qui passe de l'un à l'autre, et le bouton 3D.
  window.fondCarteLibre = function (carte) {
    const L = window.L;
    // Les tuiles autour de la vue restent prêtes (keepBuffer) : un glissement
    // de doigt ne retombe pas sur du gris. Au-delà du 18, Esri n'a souvent
    // plus de photo à Madagascar : on agrandit celle du 18.
    const commun = { maxZoom: 19, maxNativeZoom: 18, keepBuffer: 4 };
    const fonds = {
      ciel: L.layerGroup([
        L.tileLayer(CIEL, Object.assign({ attribution: MENTION_ESRI }, commun)),
        L.tileLayer(ROUTES, commun),
        L.tileLayer(LIEUX, commun)
      ]),
      plan: L.tileLayer(TUILES, { maxZoom: 19, keepBuffer: 4, attribution: MENTION_OSM })
    };
    let actuel = lireFond();
    fonds[actuel].addTo(carte);

    const Boutons = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const barre = L.DomUtil.create('div', 'leaflet-bar');
        const bascule = L.DomUtil.create('a', '', barre);
        const relief = L.DomUtil.create('a', '', barre);
        bascule.href = relief.href = '#';
        bascule.setAttribute('role', 'button');
        relief.setAttribute('role', 'button');
        [bascule, relief].forEach(function (b) {
          b.style.cssText = 'width:auto;min-width:30px;padding:0 6px;font:600 12px/30px system-ui,sans-serif;';
        });
        function etiqueter() {
          bascule.textContent = actuel === 'ciel' ? 'Plan' : 'Satellite';
          bascule.title = actuel === 'ciel' ? 'Sarintany tsotra' : 'Sary avy amin\'ny zanabolana';
        }
        etiqueter();
        relief.textContent = '3D';
        relief.title = 'Jereo amin\'ny 3D';
        L.DomEvent.disableClickPropagation(barre);
        L.DomEvent.on(bascule, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          carte.removeLayer(fonds[actuel]);
          actuel = actuel === 'ciel' ? 'plan' : 'ciel';
          // Les tuiles ont leur propre calque, sous les repères : le fond
          // remis ne les recouvre pas.
          fonds[actuel].addTo(carte);
          garderFond(actuel);
          etiqueter();
        });
        L.DomEvent.on(relief, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          ouvrir3D(carte, relief);
        });
        return barre;
      }
    });
    new Boutons().addTo(carte);
    return fonds[actuel];
  };

  // Le repère d'un livreur : un point, et son nom au-dessus. Un rond dessiné
  // plutôt que l'épingle de Leaflet — l'épingle est une image qui se cherche
  // à côté du fichier, et ne vient pas toujours.
  window.repereCarteLibre = function (point) {
    return window.L.circleMarker(point, {
      radius: 9, color: '#0b1114', weight: 2, fillColor: '#4fd8e0', fillOpacity: 0.95
    });
  };

  // ---------- La vue 3D ----------
  // Elle ne connaît rien des pages : elle relit ce que la carte Leaflet
  // montre (les points, les noms, les chemins) et le redessine en relief.
  // Relue toutes les secondes et demie : le livreur qui bouge bouge aussi en 3D.

  function texteDe(contenu) {
    const d = document.createElement('div');
    d.innerHTML = typeof contenu === 'string' ? contenu : '';
    return d.textContent || '';
  }

  function lireCouches(carte) {
    const L = window.L;
    const lignes = [], points = [], noms = [];
    carte.eachLayer(function (c) {
      if (c instanceof L.Polyline && !(c instanceof L.Polygon)) {
        const pts = c.getLatLngs();
        if (!L.LineUtil.isFlat(pts) || pts.length < 2) return;
        lignes.push({
          type: 'Feature',
          properties: { couleur: c.options.color || '#4fd8e0' },
          geometry: { type: 'LineString', coordinates: pts.map(function (p) { return [p.lng, p.lat]; }) }
        });
      } else if (c instanceof L.CircleMarker) {
        const p = c.getLatLng();
        const tt = c.getTooltip && c.getTooltip();
        const couleur = c.options.fillColor || '#4fd8e0';
        if (tt && tt.options.permanent) {
          noms.push({ lng: p.lng, lat: p.lat, couleur: couleur, nom: texteDe(tt.getContent()) });
        } else {
          points.push({
            type: 'Feature',
            properties: { couleur: couleur, rayon: c.options.radius || 4 },
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
          });
        }
      }
    });
    return { lignes: lignes, points: points, noms: noms };
  }

  function repere3D(n) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;';
    const nom = document.createElement('div');
    nom.textContent = n.nom;
    nom.style.cssText = 'background:#fff;color:#0b1114;font:600 12px system-ui,sans-serif;padding:2px 7px;' +
      'border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.4);margin-bottom:4px;white-space:nowrap;';
    const point = document.createElement('div');
    point.style.cssText = 'width:18px;height:18px;border-radius:50%;border:3px solid #fff;' +
      'box-shadow:0 1px 5px rgba(0,0,0,.5);background:' + n.couleur + ';';
    if (n.nom) el.appendChild(nom);
    el.appendChild(point);
    return el;
  }

  function ouvrir3D(carte, bouton) {
    const avant = bouton.textContent;
    bouton.textContent = '…';
    chargerCarte3D().then(function (ok) {
      bouton.textContent = avant;
      if (!ok) { alert('Tsy azo ny sarintany 3D : jereo ny connexion.'); return; }
      const ml = window.maplibregl;

      const voile = document.createElement('div');
      voile.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0b1114;';
      const fermer = document.createElement('button');
      fermer.type = 'button';
      fermer.textContent = '✕  2D';
      fermer.style.cssText = 'position:absolute;top:12px;left:12px;z-index:2;padding:9px 14px;border:0;' +
        'border-radius:10px;background:#fff;color:#0b1114;font:600 14px system-ui,sans-serif;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;';
      const boite = document.createElement('div');
      boite.style.cssText = 'position:absolute;inset:0;';
      voile.appendChild(boite);
      voile.appendChild(fermer);
      document.body.appendChild(voile);

      const centre = carte.getCenter();
      let m3;
      try {
        m3 = new ml.Map({
          container: boite,
          // Leaflet compte ses zooms en tuiles de 256 px, MapLibre en 512 :
          // un cran d'écart pour voir la même chose.
          center: [centre.lng, centre.lat],
          zoom: Math.max(carte.getZoom() - 1, 2),
          pitch: 60,
          bearing: -20,
          maxPitch: 80,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              ciel: { type: 'raster', tiles: [CIEL], tileSize: 256, maxzoom: 18, attribution: MENTION_ESRI },
              routes: { type: 'raster', tiles: [ROUTES], tileSize: 256, maxzoom: 18 },
              lieux: { type: 'raster', tiles: [LIEUX], tileSize: 256, maxzoom: 18 },
              relief: { type: 'raster-dem', tiles: [RELIEF], tileSize: 256, maxzoom: 15, encoding: 'terrarium',
                attribution: 'Relief : Mapzen / AWS Terrain Tiles' },
              lignes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
              points: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
            },
            layers: [
              { id: 'ciel', type: 'raster', source: 'ciel' },
              { id: 'routes', type: 'raster', source: 'routes' },
              { id: 'lieux', type: 'raster', source: 'lieux' },
              { id: 'lignes', type: 'line', source: 'lignes',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': ['get', 'couleur'], 'line-width': 4, 'line-opacity': 0.85 } },
              { id: 'points', type: 'circle', source: 'points',
                paint: { 'circle-color': ['get', 'couleur'], 'circle-radius': ['get', 'rayon'],
                  'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } }
            ],
            terrain: { source: 'relief', exaggeration: 1.5 },
            sky: { 'sky-color': '#7fb8e8', 'horizon-color': '#dfeefa', 'sky-horizon-blend': 0.6,
              'fog-color': '#dfeefa', 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6 }
          }
        });
      } catch (e) {
        voile.remove();
        alert('Tsy mahavita mampiseho 3D ity finday ity.');
        return;
      }
      m3.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');

      let marqueurs = [];
      let empreinte = '';
      function synchroniser() {
        // Le style n'est pas encore lu : au prochain tour.
        if (!m3.getSource('lignes')) return;
        const d = lireCouches(carte);
        const sig = JSON.stringify(d);
        if (sig === empreinte) return;
        empreinte = sig;
        m3.getSource('lignes').setData({ type: 'FeatureCollection', features: d.lignes });
        m3.getSource('points').setData({ type: 'FeatureCollection', features: d.points });
        marqueurs.forEach(function (mk) { mk.remove(); });
        marqueurs = d.noms.map(function (n) {
          return new ml.Marker({ element: repere3D(n), anchor: 'bottom' }).setLngLat([n.lng, n.lat]).addTo(m3);
        });
      }

      // Relue souvent, et sans attendre que toutes les photos soient là : les
      // repères arrivent avec la carte, et suivent le livreur qui bouge.
      synchroniser();
      const minuterie = setInterval(synchroniser, 1500);

      function clore() {
        clearInterval(minuterie);
        document.removeEventListener('keydown', echap);
        m3.remove();
        voile.remove();
      }
      function echap(e) { if (e.key === 'Escape') clore(); }
      fermer.addEventListener('click', clore);
      document.addEventListener('keydown', echap);
    });
  }
})();

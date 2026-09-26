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

(function () {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  let demande = null;

  // Où se pose une carte qui n'a encore personne à montrer : Antananarivo.
  // Une carte vide vaut mieux qu'une carte absente — on sait où elle est, et
  // où les repères viendront.
  window.centreParDefaut = { lat: -18.8792, lng: 47.5079 };

  window.chargerCarteLibre = function () {
    if (window.L && window.L.map) return Promise.resolve(true);
    if (demande) return demande;
    demande = new Promise(function (fini) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = BASE + 'leaflet.css';
      document.head.appendChild(style);

      const script = document.createElement('script');
      script.src = BASE + 'leaflet.js';
      script.async = true;
      script.onload = function () { fini(!!(window.L && window.L.map)); };
      // Sans réseau, on laisse la porte ouverte à un nouvel essai : la
      // prochaine carte redemandera plutôt que de rester sur cet échec.
      script.onerror = function () { demande = null; fini(false); };
      document.head.appendChild(script);
    });
    return demande;
  };

  // Les rues, et la mention que la licence d'OpenStreetMap demande en échange.
  window.fondCarteLibre = function (carte) {
    return window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(carte);
  };

  // Le repère d'un livreur : un point, et son nom au-dessus. Un rond dessiné
  // plutôt que l'épingle de Leaflet — l'épingle est une image qui se cherche
  // à côté du fichier, et ne vient pas toujours.
  window.repereCarteLibre = function (point) {
    return window.L.circleMarker(point, {
      radius: 9, color: '#0b1114', weight: 2, fillColor: '#4fd8e0', fillOpacity: 0.95
    });
  };
})();

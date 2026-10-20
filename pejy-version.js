// La page se met à jour d'elle-même : le menu d'une latabatra et la lakozia
// restent ouverts des jours entiers (applications installées, tablette posée),
// et personne n'y fait « recharger ». Sans cela, un changement envoyé en ligne
// n'y apparaissait jamais.
//
// outils/versionner.mjs écrit dans la page <meta name="pejy-version"> : une
// empreinte de la page et de ses scripts. Ici, de temps en temps, on relit la
// page sur le serveur ; si son empreinte a changé, on recharge — mais jamais
// pendant que quelqu'un écrit ou a une commande en cours.
(function () {
  const meta = document.querySelector('meta[name="pejy-version"]');
  const ici = meta ? meta.content : '';
  if (!ici) return;

  function occupe() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
    // Une note commencée, ou des plats choisis sans être envoyés.
    if (Array.prototype.some.call(document.querySelectorAll('input[type="text"], textarea'), function (c) { return c.value.trim(); })) return true;
    if (Array.prototype.some.call(document.querySelectorAll('.isa span'), function (s) { return s.textContent.trim() !== '0'; })) return true;
    return false;
  }

  let attend = false;
  function verifier() {
    if (document.hidden || !navigator.onLine) return;
    fetch(location.pathname + '?pejy-version=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        const m = html.match(/<meta name="pejy-version" content="([^"]*)"/);
        if (!m || !m[1] || m[1] === ici) return;
        attend = true;
        recharger();
      })
      .catch(function () { });
  }
  function recharger() {
    if (!attend) return;
    if (occupe()) { setTimeout(recharger, 15000); return; }
    location.reload();
  }

  setTimeout(verifier, 5000);
  setInterval(verifier, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) verifier(); });
})();

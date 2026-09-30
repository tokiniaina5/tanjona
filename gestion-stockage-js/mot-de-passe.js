// Un œil dans chaque champ de mot de passe : on voit ce qu'on a tapé avant
// de valider. Les champs ajoutés plus tard (fenêtres dressées par le script)
// le reçoivent aussi.
(function () {
  function equiper(champ) {
    if (champ.dataset.oeil) return;
    champ.dataset.oeil = '1';
    const boite = document.createElement('span');
    boite.style.cssText = 'position:relative; display:block;';
    champ.parentNode.insertBefore(boite, champ);
    boite.appendChild(champ);
    champ.style.paddingRight = '2.6rem';
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = '👁️';
    bouton.setAttribute('aria-label', 'Hijery ny mot de passe');
    bouton.title = 'Hijery ny mot de passe';
    bouton.style.cssText = 'position:absolute; right:0.35rem; top:50%; transform:translateY(-50%); ' +
      'width:auto; min-width:0; margin:0; padding:0.2rem 0.4rem; border:0; background:none; ' +
      'box-shadow:none; cursor:pointer; font-size:1rem; line-height:1; opacity:0.6;';
    bouton.addEventListener('click', function () {
      const cache = champ.type === 'password';
      champ.type = cache ? 'text' : 'password';
      bouton.textContent = cache ? '🙈' : '👁️';
      bouton.style.opacity = cache ? '1' : '0.6';
      const texte = cache ? 'Hanafina ny mot de passe' : 'Hijery ny mot de passe';
      bouton.setAttribute('aria-label', texte);
      bouton.title = texte;
      champ.focus();
    });
    boite.appendChild(bouton);
  }

  function parcourir(racine) {
    if (!racine || !racine.querySelectorAll) return;
    if (racine.matches && racine.matches('input[type="password"]')) equiper(racine);
    racine.querySelectorAll('input[type="password"]').forEach(equiper);
  }

  function demarrer() {
    parcourir(document.body);
    new MutationObserver(function (changes) {
      changes.forEach(function (c) { c.addedNodes.forEach(parcourir); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

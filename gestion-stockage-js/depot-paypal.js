// depot-paypal.js — Déposer depuis l'étranger, par PayPal (compte ou carte).
//
// Passe par la fonction Supabase « wallet » : c'est elle qui crée la commande
// chez PayPal et, au retour, qui l'encaisse. Rien n'est crédité sur la foi de
// ce retour — la page ne fait que demander au serveur de vérifier.

(function () {
  function msg(texte, couleur) {
    const el = document.getElementById('ppDepotStatus');
    if (!el) return;
    el.textContent = texte;
    el.style.color = couleur || 'var(--cyan)';
  }

  function appeler(corps) {
    const sb = window.__sb;
    if (!sb || !sb.functions || !sb.functions.invoke) {
      return Promise.reject(new Error('Supabase indisponible.'));
    }
    return sb.functions.invoke('wallet', { body: corps }).then(function (res) {
      if (res && res.error) {
        const ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(function (b) {
            throw new Error((b && b.error) || res.error.message);
          }, function () { throw new Error(res.error.message); });
        }
        throw new Error(res.error.message);
      }
      return (res && res.data) || {};
    });
  }

  function ar(n) { return (Number(n) || 0).toLocaleString('fr-FR') + ' Ar'; }

  // ---- Onglets : international / Madagascar ----
  function montrerOnglet(nom) {
    const inter = document.getElementById('depotInter');
    const mg = document.getElementById('depotMg');
    if (inter) inter.style.display = nom === 'inter' ? 'block' : 'none';
    if (mg) mg.style.display = nom === 'mg' ? 'block' : 'none';
    document.querySelectorAll('.depot-onglet').forEach(function (b) {
      b.classList.toggle('btn-primary', b.getAttribute('data-onglet') === nom);
    });
    try { localStorage.setItem('depot_onglet', nom); } catch (e) {}
  }

  // ---- Aperçu : combien d'ariary arriveront ----
  let tauxCache = {};
  let minuterie = null;
  function apercu() {
    const el = document.getElementById('ppDepotApercu');
    const montant = Number(document.getElementById('ppDepotAmount').value) || 0;
    const devise = document.getElementById('ppDepotCurrency').value;
    if (!el) return;
    if (!(montant > 0)) { el.textContent = ''; return; }
    const afficher = function (taux) {
      if (!taux) { el.textContent = 'Taux du jour indisponible pour ' + devise + '.'; return; }
      const brut = Math.floor(montant / taux);
      const frais = Math.ceil(brut * 5 / 100);
      el.textContent = '≈ ' + ar(brut) + ' — frais 5 % (' + ar(frais) + ') — crédité : ≈ ' +
        ar(brut - frais) + '. Le montant exact est fixé au moment du paiement.';
    };
    if (tauxCache[devise] !== undefined) { afficher(tauxCache[devise]); return; }
    clearTimeout(minuterie);
    minuterie = setTimeout(function () {
      appeler({ action: 'rate', currency: devise }).then(function (r) {
        tauxCache[devise] = r.rate || 0;
        afficher(tauxCache[devise]);
      }, function () {});
    }, 300);
  }

  // ---- Payer ----
  function payer() {
    const bouton = document.getElementById('ppDepotBtn');
    const montant = Number(document.getElementById('ppDepotAmount').value) || 0;
    const devise = document.getElementById('ppDepotCurrency').value;
    if (!(montant > 0)) { msg('Indiquez un montant.', 'var(--red)'); return; }

    bouton.disabled = true;
    msg('Création de la commande PayPal…');
    appeler({
      action: 'depot_paypal',
      amount: montant,
      currency: devise,
      returnUrl: location.href.split('?')[0].split('#')[0]
    }).then(function (r) {
      try { localStorage.setItem('paypal_depot', r.depot); } catch (e) {}
      msg('Ouverture de PayPal… (' + r.montant + ' ' + r.devise + ' → ' + ar(r.creditAr) + ' crédités)');
      location.href = r.paymentLink;
    }, function (err) {
      msg(err.message, 'var(--red)');
      bouton.disabled = false;
    });
  }

  function attendre(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // ---- Retour de PayPal (?paypal=ok&depot=…) : on fait encaisser ----
  async function verifierRetour() {
    const p = new URLSearchParams(location.search);
    const etat = p.get('paypal');
    if (!etat) return;
    let id = p.get('depot');
    if (!id) { try { id = localStorage.getItem('paypal_depot'); } catch (e) {} }
    if (!id) return;

    montrerOnglet('inter');
    const panneau = document.getElementById('walletDepotPanel');
    if (panneau) panneau.scrollIntoView({ block: 'start' });

    if (etat === 'annule') {
      msg('Paiement annulé : rien n\'a été prélevé.', 'var(--amber)');
      history.replaceState(null, '', location.pathname);
      return;
    }

    msg('Vérification du paiement chez PayPal…');
    for (let i = 0; i < 6; i++) {
      try {
        const r = await appeler({ action: 'depot_paypal_check', id: id });
        if (r.etat === 'confirme') {
          try { localStorage.removeItem('paypal_depot'); } catch (e) {}
          msg('Paiement reçu ! ' + ar(r.creditAr) + ' ajoutés à votre solde.');
          await attendre(1500);
          location.replace(location.pathname);
          return;
        }
        if (r.etat === 'refuse') { msg('PayPal a refusé le paiement : rien n\'a été crédité.', 'var(--red)'); return; }
        if (r.etat === 'a_verifier') { msg('Paiement reçu mais à vérifier par le propriétaire.', 'var(--amber)'); return; }
      } catch (err) {
        msg(err.message, 'var(--red)');
        return;
      }
      await attendre(4000);
    }
    msg('Paiement en attente chez PayPal : il sera crédité dès sa confirmation.', 'var(--amber)');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.depot-onglet').forEach(function (b) {
      b.addEventListener('click', function () { montrerOnglet(b.getAttribute('data-onglet')); });
    });
    let onglet = 'inter';
    try { onglet = localStorage.getItem('depot_onglet') || 'inter'; } catch (e) {}
    montrerOnglet(onglet);

    const b = document.getElementById('ppDepotBtn');
    if (b) b.addEventListener('click', payer);
    const m = document.getElementById('ppDepotAmount');
    const d = document.getElementById('ppDepotCurrency');
    if (m) m.addEventListener('input', apercu);
    if (d) d.addEventListener('change', apercu);
    // La session Supabase doit être restaurée avant tout appel.
    setTimeout(function () { apercu(); verifierRetour(); }, 1200);
  });
})();

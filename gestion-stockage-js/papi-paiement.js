// papi-paiement.js — Recharger le portefeuille via Papi
// (MVola, Orange Money, Airtel Money, carte BRED).
//
// Passe par la fonction Supabase « papi ». La clef API Papi n'est jamais ici :
// elle vit dans les secrets Supabase (PAPI_TOKEN).

(function () {
  // Le message va au panneau du portefeuille ET à l'écran d'abonnement : au
  // retour de Papi, on ne sait pas lequel des deux est à l'écran.
  function msg(texte, couleur) {
    ['papiStatus', 'paywallWalletStatus', 'forgotStatus'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = texte;
      el.style.color = couleur || 'var(--cyan)';
    });
  }

  // ---- Payer l'abonnement par Papi ----
  // common.js calcule la somme qui manque (frais compris) ; on crée le lien,
  // et l'on retient quel abonnement acheter au retour. Rien n'est accordé
  // ici : au retour, le serveur vérifie le paiement, puis l'achat passe par
  // la fonction « wallet » qui ne puise que dans l'argent Papi.
  // provider : '' (Papi propose tout) ou 'BRED' pour la carte Visa.
  window.papiPayerAbonnement = function (item, brut, statusEl, siEchec, provider) {
    if (statusEl) statusEl.textContent = 'Création du lien de paiement Papi…';
    appeler({
      action: 'create',
      amountAr: brut,
      provider: provider || '',
      phone: '',
      returnUrl: location.href.split('?')[0].split('#')[0]
    }).then(function (r) {
      try {
        localStorage.setItem('papi_ref', r.reference);
        localStorage.setItem('papi_abonnement', item);
      } catch (e) {}
      if (statusEl) statusEl.textContent = 'Ouverture de Papi…';
      location.href = r.paymentLink;
    }, function (err) {
      if (statusEl) statusEl.textContent = err.message;
      if (siEchec) siEchec();
    });
  };

  // Après un paiement confirmé : si c'était pour l'abonnement, on l'achète.
  async function acheterAbonnementEnAttente() {
    let item = null;
    try { item = localStorage.getItem('papi_abonnement'); } catch (e) {}
    if (!item || typeof window.buySiteItem !== 'function') return false;
    try {
      await window.buySiteItem(item, null, null);
      try { localStorage.removeItem('papi_abonnement'); } catch (e) {}
      // Le déblocage payé par carte : common.js rouvre l'accès.
      if (item === 'unlock' && typeof window.apresDeblocageCarte === 'function') {
        window.apresDeblocageCarte();
        return true;
      }
      msg('Paiement reçu : votre abonnement est actif.');
      return true;
    } catch (err) {
      msg('Paiement reçu, mais ' + (item === 'unlock' ? 'le déblocage' : 'l\'abonnement') +
        ' n\'a pas pu être réglé : ' + err.message +
        ' — réessayez depuis Portefeuille.', 'var(--amber)');
      return false;
    }
  }

  function appeler(corps) {
    const sb = window.__sb;
    if (!sb || !sb.functions || !sb.functions.invoke) {
      return Promise.reject(new Error('Supabase indisponible.'));
    }
    return sb.functions.invoke('papi', { body: corps }).then(function (res) {
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

  function payer() {
    const bouton = document.getElementById('papiPayBtn');
    const montant = Number(document.getElementById('papiAmount').value) || 0;
    const provider = document.getElementById('papiProvider').value;
    const tel = document.getElementById('papiPhone').value.trim();
    if (montant < 300) { msg('Montant minimum : 300 Ar', 'var(--red)'); return; }

    bouton.disabled = true;
    msg('Création du lien de paiement…');
    appeler({
      action: 'create',
      amountAr: montant,
      provider: provider,
      phone: tel,
      returnUrl: location.href.split('?')[0].split('#')[0]
    }).then(function (r) {
      try { localStorage.setItem('papi_ref', r.reference); } catch (e) {}
      msg(r.isTestMode ? 'Mode test : ouverture de Papi…' : 'Ouverture de Papi…');
      location.href = r.paymentLink;
    }, function (err) {
      msg(err.message, 'var(--red)');
      bouton.disabled = false;
    });
  }

  function attendre(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // Au retour de Papi (?papi=ok&ref=…), on demande l'état réel au serveur.
  async function verifierRetour() {
    const p = new URLSearchParams(location.search);
    if (!p.get('papi')) return;
    let ref = p.get('ref');
    if (!ref) { try { ref = localStorage.getItem('papi_ref'); } catch (e) {} }
    if (!ref) return;

    msg('Vérification du paiement…');
    for (let i = 0; i < 6; i++) {
      try {
        const r = await appeler({ action: 'check', reference: ref });
        if (r.etat === 'confirme') {
          try { localStorage.removeItem('papi_ref'); } catch (e) {}
          msg('Paiement reçu ! Votre solde a été crédité.');
          await acheterAbonnementEnAttente();
          await attendre(1500);
          location.replace(location.pathname);
          return;
        }
        if (r.etat === 'test') { msg('Paiement de test réussi (mode test : solde non crédité).'); return; }
        if (r.etat === 'echoue') { msg('Le paiement n\'a pas abouti.', 'var(--red)'); return; }
      } catch (err) {
        msg(err.message, 'var(--red)');
        return;
      }
      await attendre(4000);
    }
    msg('Paiement en attente : il sera crédité dès que Papi le confirme.', 'var(--amber)');
  }

  // Frais : 5 % sur le rechargement (retirés de ce qui est crédité) et 5 %
  // sur le retrait (ajoutés à ce qui est demandé). Le serveur applique les
  // mêmes taux ; cet affichage ne sert qu'à prévenir la personne.
  const FRAIS_DEPOT = 5;
  const FRAIS_RETRAIT = 5;

  function ar(n) { return (Number(n) || 0).toLocaleString('fr-FR') + ' Ar'; }

  function afficherFrais() {
    const d = document.getElementById('papiAmount');
    const dp = document.getElementById('papiFrais');
    if (d && dp) {
      const brut = Math.floor(Number(d.value) || 0);
      const frais = Math.ceil(brut * FRAIS_DEPOT / 100);
      dp.textContent = brut > 0
        ? 'Vous payez ' + ar(brut) + ' — frais ' + FRAIS_DEPOT + ' % (' + ar(frais) +
          ') — crédité sur votre solde : ' + ar(brut - frais)
        : 'Frais de rechargement : ' + FRAIS_DEPOT + ' %.';
    }
    const r = document.getElementById('payoutAmount');
    const rp = document.getElementById('payoutFrais');
    if (r && rp) {
      const montant = Math.floor(Number(r.value) || 0);
      const frais = Math.ceil(montant * FRAIS_RETRAIT / 100);
      rp.textContent = montant > 0
        ? 'Vous recevez ' + ar(montant) + ' — frais ' + FRAIS_RETRAIT + ' % (' + ar(frais) +
          ') — retiré de votre solde : ' + ar(montant + frais)
        : 'Frais de retrait : ' + FRAIS_RETRAIT + ' %, ajoutés au montant demandé.';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const b = document.getElementById('papiPayBtn');
    if (b) b.addEventListener('click', payer);
    ['papiAmount', 'payoutAmount'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', afficherFrais);
    });
    afficherFrais();
    // Laisser la session Supabase se restaurer avant de vérifier.
    setTimeout(verifierRetour, 1200);
  });
})();

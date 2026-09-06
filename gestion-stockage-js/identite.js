  // ---------------- PIÈCE D'IDENTITÉ (étape 2 de la connexion) ----------------
  // Numéro CIN/passeport, date du document, date et lieu de naissance. Ces
  // informations ne sont écrites nulle part publiquement : elles restent sur
  // l'appareil et dans le compte Supabase du client (lisible par lui seul).
  // Elles ne quittent l'appareil que dans un cas : une alerte de sécurité, et
  // uniquement vers le propriétaire.
  const IDENTITY_KEY = 'stockmanager_identity';

  function loadIdentityMap(){
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveIdentityMap(map){
    try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(map)); } catch(e){}
  }
  function loadIdentity(email){
    const map = loadIdentityMap();
    return map[normEmail(email)] || null;
  }
  function storeIdentity(email, identity){
    const map = loadIdentityMap();
    map[normEmail(email)] = identity;
    saveIdentityMap(map);
    // copie dans le compte : suit le client d'un appareil à l'autre
    const auth = (typeof sbAuth === 'function') ? sbAuth() : null;
    if(auth && auth.updateUser){
      auth.updateUser({ data: { identity: identity } }).then(function(){}, function(){});
    }
  }
  function identityComplete(identity){
    return !!(identity && identity.idNumber && identity.idDate &&
              identity.birthDate && identity.birthPlace);
  }

  function identityFromGate(){
    return {
      idNumber: (document.getElementById('idNumber').value || '').trim(),
      idDate: (document.getElementById('idDate').value || '').trim(),
      birthDate: (document.getElementById('birthDate').value || '').trim(),
      birthPlace: (document.getElementById('birthPlace').value || '').trim()
    };
  }
  function identityFromProfile(){
    return {
      idNumber: (document.getElementById('profileIdNumber').value || '').trim(),
      idDate: (document.getElementById('profileIdDate').value || '').trim(),
      birthDate: (document.getElementById('profileBirthDate').value || '').trim(),
      birthPlace: (document.getElementById('profileBirthPlace').value || '').trim()
    };
  }

  // Étape 2 : réclamée après la connexion, tant qu'elle n'est pas remplie.
  function requireIdentity(){
    if(!currentUser || !currentUser.email) return;
    // le propriétaire n'a pas à se présenter à lui-même
    if(typeof isOwnerEmail === 'function' && isOwnerEmail(currentUser.email)) return;
    const known = loadIdentity(currentUser.email);
    if(identityComplete(known)) return;
    const gate = document.getElementById('identityGate');
    if(!gate) return;
    if(known){
      document.getElementById('idNumber').value = known.idNumber || '';
      document.getElementById('idDate').value = known.idDate || '';
      document.getElementById('birthDate').value = known.birthDate || '';
      document.getElementById('birthPlace').value = known.birthPlace || '';
    }
    gate.style.display = 'flex';
  }

  const identitySaveBtn = document.getElementById('identitySaveBtn');
  if(identitySaveBtn){
    identitySaveBtn.addEventListener('click', function(){
      const status = document.getElementById('identityStatus');
      const identity = identityFromGate();
      if(!identityComplete(identity)){
        status.textContent = 'Les quatre informations sont nécessaires pour continuer.';
        return;
      }
      storeIdentity(currentUser.email, identity);
      status.textContent = '';
      document.getElementById('identityGate').style.display = 'none';
    });
  }

  function renderIdentityForm(){
    if(!currentUser || !currentUser.email) return;
    const identity = loadIdentity(currentUser.email) || {};
    const set = function(id, value){
      const el = document.getElementById(id);
      if(el) el.value = value || '';
    };
    set('profileIdNumber', identity.idNumber);
    set('profileIdDate', identity.idDate);
    set('profileBirthDate', identity.birthDate);
    set('profileBirthPlace', identity.birthPlace);
  }

  const saveIdentityBtn = document.getElementById('saveIdentityBtn');
  if(saveIdentityBtn){
    saveIdentityBtn.addEventListener('click', function(){
      const status = document.getElementById('profileIdentityStatus');
      if(!currentUser || !currentUser.email) return;
      const identity = identityFromProfile();
      storeIdentity(currentUser.email, identity);
      status.textContent = identityComplete(identity)
        ? 'Pièce d\'identité enregistrée.'
        : 'Enregistré, mais il manque encore des informations.';
      setTimeout(function(){ status.textContent = ''; }, 4000);
    });
  }

  // ---------------- ENVOI AUTOMATIQUE DE L'ALERTE ----------------
  // La fonction Supabase « send-alert » envoie le mail au propriétaire. Tant
  // qu'elle n'est pas déployée, l'alerte reste visible dans l'espace admin et
  // en notification : rien n'est perdu.
  function sendSecurityAlertMail(payload){
    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      return Promise.resolve({ sent: false, reason: 'fonction indisponible' });
    }
    return window.__sb.functions.invoke('send-alert', { body: payload })
      .then(function(res){
        if(res && res.error) return { sent: false, reason: res.error.message || 'erreur' };
        return { sent: true };
      }, function(err){
        return { sent: false, reason: (err && err.message) || 'réseau' };
      });
  }

  // Appelée quand une alerte concerne un compte client : le mail part seul,
  // avec la pièce d'identité que le client a renseignée.
  function notifyOwnerOfSecurityAlert(email, kind, detail){
    const identity = loadIdentity(email) || {};
    const profile = (typeof findProfileByEmail === 'function') ? (findProfileByEmail(email) || {}) : {};
    const payload = {
      to: OWNER_EMAIL,
      ownerName: OWNER_NAME,
      kind: kind,
      detail: detail,
      account: {
        name: profile.name || (currentUser && currentUser.name) || '',
        email: normEmail(email),
        phone: profile.phone || ''
      },
      identity: {
        idNumber: identity.idNumber || '',
        idDate: identity.idDate || '',
        birthDate: identity.birthDate || '',
        birthPlace: identity.birthPlace || ''
      },
      date: new Date().toLocaleString('fr-FR')
    };
    return sendSecurityAlertMail(payload);
  }

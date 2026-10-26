// ---------------- L'EMPLOYÉ ENTRÉ PAR SON LIEN ----------------
  // « ?mpiasa=<jeton> » : ce n'est pas le patron qui ouvre la page, c'est
  // quelqu'un de son équipe, sans compte (vue-mpiasa.js). Il reçoit
  // l'application entière, avec un stock à lui. Ce stock se range sous des
  // clés à son nom : si ce navigateur est aussi celui du patron, les deux ne
  // se mélangent jamais.
  const MODE_MPIASA = (function(){
    try { return !!new URLSearchParams(window.location.search).get('mpiasa'); }
    catch(e){ return false; }
  })();
  const SUFFIXE_MPIASA = MODE_MPIASA
    ? '_mpiasa_' + String(new URLSearchParams(window.location.search).get('mpiasa')).slice(0, 16)
    : '';
  // Le style s'en sert : sans compte, il n'y a rien dont se déconnecter.
  if(MODE_MPIASA) document.body.classList.add('mode-mpiasa');

  const STORAGE_ITEMS = 'stockmanager_items' + SUFFIXE_MPIASA;
  const STORAGE_LOGINS = 'stockmanager_logins' + SUFFIXE_MPIASA;
  const STORAGE_MOVEMENTS = 'stockmanager_movements' + SUFFIXE_MPIASA;
  const STORAGE_SUBSCRIPTION = 'stockmanager_subscription' + SUFFIXE_MPIASA;
  const STORAGE_PROFILES = 'stockmanager_profiles';
  const STORAGE_CLIENT_CODES = 'stockmanager_client_codes';
  const CODE_VALID_MS = 30 * 60 * 1000; // 30 minutes
  const CODE_MAX_ATTEMPTS = 3;
  // Identité du propriétaire de l'application, affichée aux clients
  // (paiement de l'abonnement, frais de déblocage, lettres envoyées).
  const OWNER_EMAIL = 'rasolofonirainytokiniaina@gmail.com';
  const OWNER_NAME = 'Rasolofonirainy Tokiniaina Tanjona';
  const OWNER_PHONE = '034 37 058 34';
  // Remplit tous les éléments marqués data-owner="name|phone|email".
  function renderOwnerIdentity(){
    const values = { name: OWNER_NAME, phone: OWNER_PHONE, email: OWNER_EMAIL };
    document.querySelectorAll('[data-owner]').forEach(function(el){
      const value = values[el.getAttribute('data-owner')];
      if(value) el.textContent = value;
    });
  }
  renderOwnerIdentity();
  const TRIAL_DAYS = 15;
  // ---- LES PREMIERS JOURS, SANS COMPTE ----
  // On n'ouvre pas un compte pour essayer un outil qu'on ne connaît pas encore.
  // Les FREE_ENTRY_DAYS premiers jours, l'application s'ouvre telle quelle : ni
  // nom, ni email, ni mot de passe — on entre. Le compte n'est réclamé qu'après,
  // et rien n'est perdu : ce qui a été saisi pendant ces jours-là est rangé sous
  // les mêmes clés que le reste, sur le même navigateur.
  const FREE_ENTRY_DAYS = 7;
  // ---- CE QUE VAUT UN CRÉDIT ----
  // Le déblocage se compte en crédits ; un crédit vaut 1 000 Ar. Le chiffre ne
  // fait pas foi ici — c'est AR_PER_CREDIT, dans la fonction « wallet », qui
  // calcule le solde. Celui-ci ne sert qu'à écrire des sommes lisibles, et
  // doit lui rester égal.
  const AR_PER_CREDIT = 1000;

  function genInstallId(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ---- Codes de déverrouillage individuels (par client) ----
  // Chaque client bloqué obtient son propre code, valable CODE_VALID_MS et
  // accepté au maximum CODE_MAX_ATTEMPTS fois. Passé le délai ou les essais,
  // un nouveau code est généré automatiquement.
  function loadClientCodes(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CLIENT_CODES)) || {}; }
    catch(e){ return {}; }
  }
  function saveClientCodes(map){ localStorage.setItem(STORAGE_CLIENT_CODES, JSON.stringify(map)); }
  function normEmail(email){ return (email || '').trim().toLowerCase(); }

  // Crée (ou remplace) le code actif d'un client et le renvoie.
  function generateClientCode(email){
    const key = normEmail(email);
    if(!key) return null;
    const codes = loadClientCodes();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[key] = { code: code, generatedAt: new Date().toISOString(), attempts: 0 };
    saveClientCodes(codes);
    return code;
  }
  function getClientCodeEntry(email){
    const codes = loadClientCodes();
    return codes[normEmail(email)] || null;
  }
  function clearClientCode(email){
    const codes = loadClientCodes();
    delete codes[normEmail(email)];
    saveClientCodes(codes);
  }

  // Vérifie le code saisi par un client bloqué.
  // Retourne { ok, message, regenerated, disabledInput }
  function checkClientCode(email, input){
    const key = normEmail(email);
    const codes = loadClientCodes();
    const entry = codes[key];
    if(!entry){
      return { ok:false, message:'Aucun code n\'a encore été généré pour vous. Cliquez sur « Signaler mon paiement par mail » pour en recevoir un.' };
    }
    const age = Date.now() - new Date(entry.generatedAt).getTime();
    if(age > CODE_VALID_MS){
      generateClientCode(email);
      return { ok:false, regenerated:true, message:'Le code n\'a pas été saisi dans le délai de 30 minutes. Un nouveau code a été généré : contactez le vendeur pour le récupérer.' };
    }
    if(entry.code === input.trim()){
      clearClientCode(email);
      return { ok:true, message:'Code valide ✓ Compte débloqué.' };
    }
    entry.attempts = (entry.attempts || 0) + 1;
    if(entry.attempts >= CODE_MAX_ATTEMPTS){
      generateClientCode(email);
      return { ok:false, regenerated:true, message:'Code incorrect. Vous avez atteint les 3 essais autorisés. Un nouveau code a été généré : contactez le vendeur pour le récupérer.' };
    }
    codes[key] = entry;
    saveClientCodes(codes);
    return { ok:false, message:'Code incorrect (' + entry.attempts + '/' + CODE_MAX_ATTEMPTS + ' essais).' };
  }

  // Envoie (depuis l'appareil du client) un mail au propriétaire de l'app,
  // avec le nom du client (celui saisi au login) et le code généré pour lui,
  // pour signaler qui a effectué le paiement et quel code lui communiquer.
  function notifyOwnerOfPayment(clientName, clientEmail, clientPhone, plan){
    const code = generateClientCode(clientEmail);
    const subject = encodeURIComponent('Paiement — ' + clientName);
    const body = encodeURIComponent(
      'Bonjour,\n\n' +
      'Le client suivant signale avoir effectué le paiement de son abonnement Ny asako :\n\n' +
      'Nom (login) : ' + clientName + '\n' +
      'Email : ' + clientEmail + '\n' +
      'Téléphone : ' + (clientPhone || '—') + '\n' +
      'Formule choisie : ' + (plan === 'annuel' ? 'Annuel' : 'Mensuel') + '\n' +
      'Code de déverrouillage généré pour ce client : ' + code + ' (valable 30 minutes, 3 essais)\n\n' +
      'Merci de vérifier la réception du paiement puis de communiquer ce code à ce client.\n\n' +
      'Destinataire : ' + OWNER_NAME + ' — ' + OWNER_PHONE + ' — ' + OWNER_EMAIL
    );
    window.location.href = 'mailto:' + OWNER_EMAIL + '?subject=' + subject + '&body=' + body;
    return code;
  }

  function loadProfiles(){
    try { return JSON.parse(localStorage.getItem(STORAGE_PROFILES)) || {}; }
    catch(e){ return {}; }
  }
  // Une photo d'appareil photo utilisée comme logo dépassait le quota du
  // navigateur (~5 Mo) : l'écriture levait une exception et la connexion
  // s'arrêtait sans le moindre message. On réduit l'image avant (voir
  // shrinkImage) et on n'échoue plus silencieusement ici.
  function saveProfiles(profiles){
    try{
      localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
      return true;
    }catch(e){
      // deuxième essai sans les logos, qui sont de loin le plus volumineux
      try{
        const light = {};
        Object.keys(profiles).forEach(function(k){
          light[k] = Object.assign({}, profiles[k], { logo: null });
        });
        localStorage.setItem(STORAGE_PROFILES, JSON.stringify(light));
      }catch(e2){}
      return false;
    }
  }

  // Réduit une image (data URL) à maxPx de côté et la recompresse en JPEG.
  // Une photo de 4 Mo tombe ainsi à quelques dizaines de Ko.
  function shrinkImage(dataUrl, maxPx, callback){
    if(!dataUrl || dataUrl.indexOf('data:image') !== 0){ callback(dataUrl); return; }
    const img = new Image();
    img.onload = function(){
      try{
        const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.82));
      }catch(e){ callback(dataUrl); }
    };
    img.onerror = function(){ callback(dataUrl); };
    img.src = dataUrl;
  }
  function findProfile(name){
    const profiles = loadProfiles();
    return profiles[name.trim().toLowerCase()] || null;
  }
  function findProfileByEmail(email){
    const target = (email || '').trim().toLowerCase();
    if(!target) return null;
    const profiles = loadProfiles();
    const key = Object.keys(profiles).find(function(k){
      return (profiles[k].email || '').trim().toLowerCase() === target;
    });
    return key ? profiles[key] : null;
  }
  // Un compte est « rapide » dès qu'il possède un code d'accès enregistré.
  function hasQuickAccounts(){
    const profiles = loadProfiles();
    return Object.keys(profiles).some(function(k){ return !!profiles[k].accessCode; });
  }
  // Quelqu'un s'est-il déjà connecté sur CET appareil ? Si non, c'est une
  // première visite : on montre le formulaire complet, pas « Bon retour ».
  function hasKnownAccounts(){
    return Object.keys(loadProfiles()).length > 0;
  }

  function upsertProfile(name, data){
    const profiles = loadProfiles();
    const key = name.trim().toLowerCase();
    profiles[key] = Object.assign({}, profiles[key], data);
    saveProfiles(profiles);
  }

  function loadSubscription(){
    try { return JSON.parse(localStorage.getItem(STORAGE_SUBSCRIPTION)) || null; }
    catch(e){ return null; }
  }
  function saveSubscription(sub){ localStorage.setItem(STORAGE_SUBSCRIPTION, JSON.stringify(sub)); }
  function ensureInstallDate(){
    let sub = loadSubscription();
    if(!sub){
      sub = {
        installDate: new Date().toISOString(),
        plan: null,
        paidUntil: null,
        id: genInstallId(),
        bonusDays: 0
      };
      saveSubscription(sub);
    } else {
      // migration : ampidirina ireo sampana vaovao ho an'ireo appareil efa nampiasa ny app talohan'ny fanavaozana
      let changed = false;
      if(!sub.id){ sub.id = genInstallId(); changed = true; }
      if(typeof sub.bonusDays !== 'number'){ sub.bonusDays = 0; changed = true; }
      if(changed) saveSubscription(sub);
    }
    return sub;
  }
  // renvoie { status: 'trial'|'active'|'expired', daysLeft, bonusDays }
  function getSubscriptionStatus(){
    // L'employé entré par son lien travaille pour un patron : ce n'est pas à
    // lui de s'abonner, ni d'être arrêté par la fin d'un essai.
    if(MODE_MPIASA) return { status: 'active', daysLeft: 0, bonusDays: 0 };
    const sub = ensureInstallDate();
    // Le propriétaire ne s'abonne pas à sa propre application. L'essai avait
    // fini par expirer sur son appareil et le mettait à la porte de son propre
    // outil — sans recours : c'est lui qui délivre les codes de déverrouillage,
    // et personne ne peut lui en envoyer un. Son compte est ouvert, toujours,
    // et la bannière d'essai ne le concerne pas non plus.
    if(currentUser && currentUser.email && isOwnerEmail(currentUser.email)){
      return { status: 'active', daysLeft: 0, bonusDays: sub.bonusDays || 0 };
    }
    const now = new Date();
    if(sub.paidUntil && new Date(sub.paidUntil) > now){
      return { status: 'active', daysLeft: 0, bonusDays: sub.bonusDays || 0 };
    }
    const installDate = new Date(sub.installDate);
    const bonusDays = sub.bonusDays || 0;
    const trialEnd = new Date(installDate.getTime() + (TRIAL_DAYS + bonusDays) * 24 * 60 * 60 * 1000);
    if(now < trialEnd){
      const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000)));
      return { status: 'trial', daysLeft: daysLeft, bonusDays: bonusDays };
    }
    return { status: 'expired', daysLeft: 0, bonusDays: bonusDays };
  }

  // Jours restants avant que le compte soit réclamé. Les jours payés avec le
  // portefeuille allongent l'essai, pas cette fenêtre-ci : ils repoussent le
  // paiement, pas le moment de se présenter.
  function freeEntryDaysLeft(){
    if(MODE_MPIASA) return 0;
    const sub = ensureInstallDate();
    const fin = new Date(new Date(sub.installDate).getTime() + FREE_ENTRY_DAYS * 24 * 60 * 60 * 1000);
    const reste = Math.ceil((fin - new Date()) / (24 * 60 * 60 * 1000));
    return reste > 0 ? reste : 0;
  }
  function inFreeEntryWindow(){ return freeEntryDaysLeft() > 0; }

  // ---------------- QUI A OUVERT L'APPLICATION ----------------
  // Une ligne par personne côté serveur, et un versement au portefeuille du
  // propriétaire la première fois qu'on la voit. Le navigateur ne décide de
  // rien : il dit « me voici », et la fonction « visiteur » fait le reste —
  // c'est elle qui tient le montant, et elle qui refuse de compter deux fois
  // la même personne.
  //
  // L'employé entré par le lien de son patron ne compte pas : il n'est pas
  // venu au site, il travaille dans celui d'un autre.
  let visiteSignalee = null;
  function signalerLaVisite(){
    if(MODE_MPIASA) return;
    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke) return;
    const qui = (currentUser && currentUser.email) || '';
    // Une fois par ouverture, et une fois de plus si la personne se présente
    // entre-temps : c'est ce second appel qui pose son nom sur sa ligne.
    if(visiteSignalee === qui) return;
    visiteSignalee = qui;
    const sub = ensureInstallDate();
    window.__sb.functions.invoke('visiteur', { body: {
      action: 'vu',
      installId: sub.id,
      nom: (currentUser && currentUser.name) || null,
      email: qui || null,
      appareil: typeof shortUserAgent === 'function' ? shortUserAgent(navigator.userAgent) : null
    } }).then(function(){}, function(){});
  }

  // ---------------- CE QUE DONNE UN ACHAT ----------------
  // Les prix, eux, sont dans la fonction « wallet » : ici on ne garde que la
  // durée de ce qui est acheté, pour l'appliquer une fois le paiement passé.
  const WALLET_SUB_DAYS = 7;
  const WALLET_BOOSTER_HOURS = 24;

  function loadItems(){
    try { return JSON.parse(localStorage.getItem(STORAGE_ITEMS)) || []; }
    catch(e){ return []; }
  }
  function saveItems(items){
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
    // L'employé entré par son lien : son patron suit ce stock (vue-mpiasa.js).
    if(MODE_MPIASA && typeof deposerStockMpiasa === 'function') deposerStockMpiasa();
  }

  function loadLogins(){
    try { return JSON.parse(localStorage.getItem(STORAGE_LOGINS)) || []; }
    catch(e){ return []; }
  }
  function saveLogins(logins){ localStorage.setItem(STORAGE_LOGINS, JSON.stringify(logins)); }

  function loadMovements(){
    try { return JSON.parse(localStorage.getItem(STORAGE_MOVEMENTS)) || []; }
    catch(e){ return []; }
  }
  function saveMovements(movements){
    localStorage.setItem(STORAGE_MOVEMENTS, JSON.stringify(movements));
    if(MODE_MPIASA && typeof deposerStockMpiasa === 'function') deposerStockMpiasa();
  }

  // ---------------- GESTION DE COMPTE : clients & ventes à crédit ----------------
  const STORAGE_CLIENTS = 'stockmanager_clients' + SUFFIXE_MPIASA;
  const STORAGE_CREDIT_SALES = 'stockmanager_credit_sales' + SUFFIXE_MPIASA;
  function loadClients(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CLIENTS)) || []; }
    catch(e){ return []; }
  }
  function saveClients(list){ localStorage.setItem(STORAGE_CLIENTS, JSON.stringify(list)); }
  function loadCreditSales(){
    try { return JSON.parse(localStorage.getItem(STORAGE_CREDIT_SALES)) || []; }
    catch(e){ return []; }
  }
  function saveCreditSales(list){ localStorage.setItem(STORAGE_CREDIT_SALES, JSON.stringify(list)); }

  // Les notifications vont avec le compte, pas avec l'appareil : deux
  // comptes ouverts dans le même navigateur (une fenêtre chacun) ne
  // partagent plus leur liste ni leur nombre de non-lues.
  function cleDuCompte(base){
    let email = '';
    try{ email = currentUser && currentUser.email ? '_' + String(currentUser.email).trim().toLowerCase() : ''; }catch(e){}
    return base + SUFFIXE_MPIASA + email;
  }
  function loadNotifications(){
    try { return JSON.parse(localStorage.getItem(cleDuCompte('stockmanager_notifications'))) || []; }
    catch(e){ return []; }
  }
  function saveNotifications(list){ localStorage.setItem(cleDuCompte('stockmanager_notifications'), JSON.stringify(list)); }
  // Ajoute une notification à la liste de ce téléphone, sans rien envoyer.
  // action : un bouton dans la notification (ex. accepter une demande
  // d'accès). { cle, libelle } — ce qu'il fait est enregistré à part, par
  // window.__notifActions[cle] : une fonction ne se range pas en localStorage.
  function ajouterNotificationLocale(type, message, date, action){
    const list = loadNotifications();
    list.unshift({
      type: type, message: message,
      date: date || new Date().toLocaleString('fr-FR'),
      read: false,
      action: action || null
    });
    saveNotifications(list.slice(0, 50));
    renderNotifications();
  }
  function pushNotification(type, message){
    ajouterNotificationLocale(type, message);
    partagerNotification(type, message);
    // La copie du stock que regardent les employes : on la depose quand
    // l'application s'ouvre, moment ou elle est fraiche.
    if(typeof deposerLeStockPartage === 'function') deposerLeStockPartage();
  }

  // ---------------- NOTIFICATIONS PARTAGÉES ----------------
  // Chaque téléphone garde ses notifications. Quatre sortes, pourtant,
  // regardent toute la boutique : une sortie de stock, un article épuisé,
  // l'argent qui entre ou sort du portefeuille, un direct qui commence. Ce
  // qui arrive chez le patron se sait chez ses employés, et l'inverse.
  //
  // Elles passent par la table notifications_boutique
  // (supabase-notifications.sql). Le patron y écrit et y lit avec son compte ;
  // l'employé, qui n'en a pas, passe par la fonction « mpiasa »
  // (vue-mpiasa.js). Chacun relit toutes les minutes, et en revenant sur la
  // page. Sans la table, rien ne se partage et rien ne casse.
  const TYPES_PARTAGES = ['sortie', 'rupture', 'parrainage', 'live'];

  function partagerNotification(type, message){
    if(TYPES_PARTAGES.indexOf(type) < 0 || !currentUser) return;
    const texte = String(message || '').slice(0, 500);
    if(!texte) return;
    if(MODE_MPIASA){
      if(window.__mpiasaNotif) window.__mpiasaNotif.envoyer(type, texte);
      return;
    }
    const email = String(currentUser.email || '').trim().toLowerCase();
    if(!window.__sb || !email) return;
    window.__sb.from('notifications_boutique').insert({
      owner_email: email, auteur_nom: currentUser.name || null, type: type, message: texte
    }).then(function(){}, function(){});
  }

  // Un direct arrive deux fois à qui a l'application ouverte : par le canal,
  // et par la table. Même sorte, même texte, parmi les dernières : c'est la
  // même.
  function notificationDejaLa(type, message){
    return loadNotifications().slice(0, 10).some(function(n){
      return n.type === type && n.message === message;
    });
  }

  let lectureNotifEnCours = false;
  function lireNotificationsPartagees(){
    if(!currentUser || lectureNotifEnCours) return;
    let vu = '';
    try{ vu = localStorage.getItem(cleDuCompte('stockmanager_notif_partage_vu')) || ''; }catch(e){}
    // La première fois sur ce téléphone, on part de maintenant : remonter
    // tout l'historique noierait la liste sous des nouvelles d'hier.
    if(!vu){
      try{ localStorage.setItem(cleDuCompte('stockmanager_notif_partage_vu'), new Date().toISOString()); }catch(e){}
      return;
    }
    let lecture;
    if(MODE_MPIASA){
      if(!window.__mpiasaNotif) return;
      lecture = window.__mpiasaNotif.lire(vu);
    } else {
      const email = String(currentUser.email || '').trim().toLowerCase();
      if(!window.__sb || !email) return;
      lecture = window.__sb.from('notifications_boutique')
        .select('id,type,message,auteur_id,auteur_nom,created_at')
        .eq('owner_email', email).gt('created_at', vu)
        .order('created_at', { ascending: true }).limit(50)
        .then(function(res){ return (res && !res.error && res.data) || []; }, function(){ return []; });
    }
    lectureNotifEnCours = true;
    Promise.resolve(lecture).then(function(rows){
      lectureNotifEnCours = false;
      if(!rows || !rows.length) return;
      const moi = MODE_MPIASA && window.__mpiasaNotif ? window.__mpiasaNotif.id : null;
      rows.forEach(function(r){
        // Les siennes, on les a déjà : celles du patron n'ont pas d'auteur,
        // celles d'un employé portent le sien.
        // L'argent (« vola ») vient du serveur, jamais de soi : sans auteur
        // lui aussi, il passerait pour une des siennes et serait tu.
        // De même le bilan d'une story finie (« story »).
        const deMoi = (r.type === 'vola' || r.type === 'story') ? false
          : (MODE_MPIASA ? (r.auteur_id && r.auteur_id === moi) : !r.auteur_id);
        if(deMoi) return;
        // Un direct dit déjà qui le fait ; le reste, on le signe.
        const texte = r.type === 'live' ? r.message : (r.auteur_nom || 'Patron') + ' : ' + r.message;
        if(notificationDejaLa(r.type, texte) || notificationDejaLa(r.type, r.message)) return;
        ajouterNotificationLocale(r.type, texte, new Date(r.created_at).toLocaleString('fr-FR'));
      });
      try{ localStorage.setItem(cleDuCompte('stockmanager_notif_partage_vu'), rows[rows.length - 1].created_at); }catch(e){}
      // Cinquante d'un coup : il en reste peut-être.
      if(rows.length === 50) lireNotificationsPartagees();
    }, function(){ lectureNotifEnCours = false; });
  }

  setTimeout(lireNotificationsPartagees, 5000);
  setInterval(function(){ if(!document.hidden) lireNotificationsPartagees(); }, 60000);
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) lireNotificationsPartagees();
  });
  function notifIcon(type){
    if(type === 'sortie') return '📤';
    // 'vente' n'est plus produit, mais les anciennes notifications le portent
    // encore : sans cette ligne elles perdraient leur icône.
    if(type === 'vente') return '🛒';
    if(type === 'achat') return '📥';
    if(type === 'facture') return '🧾';
    if(type === 'rupture') return '⚠️';
    if(type === 'parrainage') return '💰';
    if(type === 'vola') return '💸';
    if(type === 'story') return '📖';
    if(type === 'modification') return '✏️';
    if(type === 'live') return '🔴';
    if(type === 'antso') return '📞';
    if(type === 'fangatahana') return '🔐';
    return '🔔';
  }
  window.__notifActions = window.__notifActions || {};
  // Pour les autres fichiers (commun-alalana.js) : une notification avec bouton.
  window.__ajouterNotificationAction = function(type, message, action){
    ajouterNotificationLocale(type, message, null, action);
  };
  window.__marquerNotificationFaite = function(cle){
    const list = loadNotifications();
    list.forEach(function(n){ if(n.action && n.action.cle === cle){ n.action.fait = true; n.read = true; } });
    saveNotifications(list);
    renderNotifications();
  };
  // Le bouton d'une notification : l'action enregistrée, puis la notification
  // marquée faite pour que le bouton ne se représente pas.
  (function(){
    const listEl = document.getElementById('notifList');
    if(!listEl) return;
    listEl.addEventListener('click', function(e){
      const bouton = e.target.closest ? e.target.closest('[data-notif-action]') : null;
      if(!bouton) return;
      const cle = bouton.dataset.notifAction;
      const faire = window.__notifActions[cle];
      if(typeof faire !== 'function'){ bouton.textContent = 'Tsy azo atao eto'; return; }
      bouton.disabled = true;
      bouton.textContent = '…';
      Promise.resolve(faire()).then(function(ok){
        if(ok === false){ bouton.disabled = false; bouton.textContent = 'Andramo indray'; return; }
        window.__marquerNotificationFaite(cle);
      }, function(){ bouton.disabled = false; bouton.textContent = 'Andramo indray'; });
    });
  })();
  function renderNotifications(){
    const list = loadNotifications();
    const listEl = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if(!listEl || !badge) return;
    const unread = list.filter(function(n){ return !n.read; }).length;
    if(unread > 0){
      badge.style.display = 'block';
      badge.textContent = unread > 9 ? '9+' : String(unread);
    } else {
      badge.style.display = 'none';
    }
    if(!list.length){
      listEl.innerHTML = '<div class="notif-empty">Aucune notification.</div>';
      return;
    }
    listEl.innerHTML = list.map(function(n){
      const a = n.action;
      const bouton = !a ? '' : (a.fait
        ? '<span class="notif-date" style="color:var(--cyan);">✅ Vita</span>'
        : '<button type="button" class="btn btn-primary btn-sm" style="width:auto; margin-top:0.35rem;" data-notif-action="' +
            escapeHtml(a.cle) + '">' + escapeHtml(a.libelle || 'Ekena') + '</button>');
      return '<div class="notif-item"><span class="notif-icon">' + notifIcon(n.type) + '</span>' +
        escapeHtml(n.message) + '<span class="notif-date">' + n.date + '</span>' + bouton + '</div>';
    }).join('');
  }

  let idCounter = Date.now();
  function genId(){ idCounter += 1; return 'itm_' + idCounter; }

  let items = loadItems();
  // normalise les anciens articles (ajoute id / référence si absents)
  items = items.map(function(it){
    if(!it.id) it.id = genId();
    if(it.ref === undefined) it.ref = '';
    if(it.unit === undefined) it.unit = 'pièce';
    if(it.seuil === undefined) it.seuil = 5;
    if(it.supplier === undefined) it.supplier = '';
    return it;
  });
  saveItems(items);

  let movements = loadMovements();
  let currentUser = null;
  // Vrai quand l'application a été ouverte sans compte, pendant la fenêtre
  // d'entrée libre. Personne n'est connecté : il n'y a rien dont se déconnecter,
  // et le menu propose de créer le compte plutôt que de le quitter.
  let modeVisiteur = false;

  // ---------------- SESSION (rester connecté après actualisation) ----------------
  // La session et la vue en cours sont mémorisées : actualiser la page ne
  // renvoie plus vers l'écran de connexion, on reprend là où on était.
  // Email du dernier compte utilisé sur cet appareil : au retour, la personne
  // n'a plus que son code à saisir, l'email est déjà là.
  const STORAGE_LAST_EMAIL = 'stockmanager_last_email';
  function saveLastEmail(email){
    try { localStorage.setItem(STORAGE_LAST_EMAIL, (email || '').trim().toLowerCase()); } catch(e){}
  }
  function loadLastEmail(){
    try { return localStorage.getItem(STORAGE_LAST_EMAIL) || ''; } catch(e){ return ''; }
  }

  const STORAGE_SESSION = 'stockmanager_session';
  const STORAGE_LAST_VIEW = 'stockmanager_last_view';

  // Chaque fenêtre garde son compte, comme la session Supabase
  // (supabase-init.js) : sessionStorage pour la fenêtre, localStorage pour le
  // dernier compte ouvert, que prend une fenêtre neuve.
  const SESSION_NIVOAKA = STORAGE_SESSION + '_nivoaka';
  function saveSession(){
    const v = JSON.stringify(currentUser);
    try{ sessionStorage.removeItem(SESSION_NIVOAKA); sessionStorage.setItem(STORAGE_SESSION, v); }catch(e){}
    try{ localStorage.setItem(STORAGE_SESSION, v); }catch(e){}
  }
  function loadSession(){
    try{
      let v = null;
      try{
        v = sessionStorage.getItem(STORAGE_SESSION);
        if(v == null && !sessionStorage.getItem(SESSION_NIVOAKA)){
          v = localStorage.getItem(STORAGE_SESSION);
          if(v != null) sessionStorage.setItem(STORAGE_SESSION, v);
        }
      }catch(e){ v = localStorage.getItem(STORAGE_SESSION); }
      return JSON.parse(v) || null;
    }catch(e){ return null; }
  }
  // La fenêtre porte le nom du compte ouvert, et non plus « Tanjona » : avec
  // un compte par fenêtre, c'est à son titre qu'on les reconnaît. L'employé
  // garde le sien (vue-mpiasa.js).
  function porterLeNomDuCompte(){
    if(MODE_MPIASA) return;
    const base = document.documentElement.classList.contains('app-hotely') ? 'Ny asako Hôtel' : 'Ny asako';
    const nom = currentUser && currentUser.name ? String(currentUser.name).trim() : '';
    document.title = nom ? base + ' — ' + nom : base;
  }
  (function(){
    const el = document.getElementById('currentUserName');
    if(el && window.MutationObserver){
      new MutationObserver(porterLeNomDuCompte).observe(el, { childList: true, characterData: true, subtree: true });
    }
  })();

  function clearSession(){
    let ici = null;
    try{ ici = JSON.parse(sessionStorage.getItem(STORAGE_SESSION)); }catch(e){}
    try{ sessionStorage.removeItem(STORAGE_SESSION); sessionStorage.setItem(SESSION_NIVOAKA, '1'); }catch(e){}
    try{
      // Le dernier compte reste pour les autres fenêtres s'il n'est pas celui-ci.
      const la = JSON.parse(localStorage.getItem(STORAGE_SESSION));
      if(!la || !ici || normEmail(la.email) === normEmail(ici.email)) localStorage.removeItem(STORAGE_SESSION);
      localStorage.removeItem(STORAGE_LAST_VIEW);
    }catch(e){}
  }
  function saveLastView(){
    try{
      const nav = document.querySelector('.nav-item.active');
      // La vue affichée, et non l'onglet actif : Accueil et Articles s'ouvrent
      // depuis le menu et n'ont plus d'onglet à interroger.
      const vue = document.querySelector('.dash-view.active');
      localStorage.setItem(STORAGE_LAST_VIEW, JSON.stringify({
        section: nav ? nav.dataset.section : null,
        dash: vue ? vue.id.replace(/^dash-/, '') : null
      }));
    }catch(e){}
  }
  // Vrai le temps de rouvrir la vue quittée : ce n'est pas la personne qui
  // ouvre la page, et son icône ne doit pas revenir dans la rangée après qu'on
  // l'en a retirée.
  var restaurationEnCours = false;
  // L'application s'ouvre sur l'Accueil, quelle que soit la page quittée.
  // C'est le fil : on y vient pour voir ce qui est arrivé depuis la dernière
  // fois, et non pour reprendre un tableau là où on l'avait laissé.
  function ouvrirSurLAccueil(){
    restaurationEnCours = true;
    try{
      // Ny asako Hôtel (/hotely) n'a pas de Botika : on arrive sur
      // l'Hôtellerie (ouverte à tous, chacun son menu).
      if(document.documentElement.classList.contains('app-hotely')){
        const nav = document.querySelector('.nav-item[data-section="hotelerie"]');
        if(nav){
          if(!nav.classList.contains('active')) nav.click();
          return;
        }
      }
      const navStock = document.querySelector('.nav-item[data-section="stock"]');
      if(navStock && !navStock.classList.contains('active')) navStock.click();
      if(typeof showDashView === 'function') showDashView('accueil');
      if(typeof updateSubTabsVisibility === 'function') updateSubTabsVisibility();
      saveLastView();
    } finally { restaurationEnCours = false; }
  }

  // ---------------- FILTRES DU TABLEAU DE BORD ----------------
  const selectedDays = new Set();
  const selectedCategories = new Set();
  const selectedRefs = new Set();
  let dateFrom = '';
  let dateTo = '';
  const chartColors = ['#4fd8e0', '#f2a33c', '#8b93ff', '#6ee7b7', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa'];
  const charts = {};

  function pad2(n){ return String(n).padStart(2, '0'); }
  function dayKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDayKey(key){
    const p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function dayLabel(key){
    return parseDayKey(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  function passesDateRange(m){
    if(dateFrom && m.day < dateFrom) return false;
    if(dateTo && m.day > dateTo) return false;
    return true;
  }

  if(window.Chart){
    Chart.defaults.color = '#7c8b92';
    Chart.defaults.font.family = "'Inter', sans-serif";
  }

  // ---------------- LOGIN ----------------
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const paywallScreen = document.getElementById('paywallScreen');
  const loginForm = document.getElementById('loginForm');
  let selectedPlan = 'mensuel';

  function openApp(){
    closeWelcome(false);
    loginScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    appScreen.style.display = 'block';
    // la barre n’a une hauteur mesurable qu’une fois l’appli affichée
    if(typeof updateTopbarHeight === 'function') updateTopbarHeight();

    renderStock();
    renderMovementsHistory();
    renderLogins();
    renderInvoiceItems();
    renderFilters();
    renderDashboard();
    renderCommunityPanel();
    setupInviteLink();
    majPageAbonnement();
    renderNotifications();
    // La copie du stock que regardent les employes : on la depose quand
    // l'application s'ouvre, moment ou elle est fraiche.
    if(typeof deposerLeStockPartage === 'function') deposerLeStockPartage();
    // Demandes de déblocage en attente : le propriétaire l'apprend en ouvrant
    // l'application, pas seulement en passant par Paramètres.
    if(typeof checkPendingUnlockRequests === 'function') checkPendingUnlockRequests();
    // Le portefeuille : ce qui est parti, ce qui est entré, ce qu'on attend.
    verifierLePortefeuille();
    renderWallet();
    initPresence();
    initCallSignaling();
    initLiveSignaling();
    // Rohy misy "?live=" na "?call=" : mifandray avy hatrany, tsy mila mitety
    // ny appli ny mpanjifa — ny fanokafana ny rohy no ampy.
    if(typeof runPendingLinkAction === 'function') runPendingLinkAction();
    // « ?pejy=livreur » : ouvrir tout de suite cette page du menu (le bouton
    // « ➕ Hampiditra livreur » de lakozia.html y mène). Une seule fois.
    try{
      const pejy = new URLSearchParams(location.search).get('pejy');
      const nav = pejy && /^[a-z]+$/.test(pejy) && document.querySelector('.nav-item[data-section="' + pejy + '"]');
      if(nav && !openApp.pejyVita){ openApp.pejyVita = true; setTimeout(function(){ nav.click(); }, 0); }
    }catch(e){}
    // étape 2 : pièce d'identité, réclamée tant qu'elle n'est pas renseignée
    // L'employé, le patron le connaît déjà : c'est lui qui l'a inscrit.
    if(!MODE_MPIASA && typeof requireIdentity === 'function') requireIdentity();
    // le propriétaire est prévenu des alertes enregistrées depuis sa dernière visite
    if(typeof notifyOwnerOfNewAlerts === 'function') notifyOwnerOfNewAlerts();
    // Le propriétaire voit passer tout le monde : celui qui essaie sans compte
    // les premiers jours comme celui qui revient depuis deux ans.
    signalerLaVisite();
  }

  function openPaywall(){
    // Sans compte, il n'y a personne à qui envoyer le code de déverrouillage :
    // le paiement commence par la création du compte.
    if(modeVisiteur){ quitterLEssaiLibre(); return; }
    closeWelcome(false);
    loginScreen.style.display = 'none';
    appScreen.style.display = 'none';
    paywallScreen.style.display = 'flex';
    document.getElementById('paywallCodeInput').value = '';
    document.getElementById('codeStatus').textContent = '';
    document.getElementById('confirmPaymentBtn').disabled = true;
    if(typeof refreshPaywallWallet === 'function') refreshPaywallWallet();
  }

  // La page « Abonnement » dit où l'on en est. Elle ne refait pas le paiement :
  // celui-ci vit dans l'écran de blocage, qui sait déjà tout faire — le
  // portefeuille, le code, le mail au vendeur. Le bouton y mène.
  function majPageAbonnement(){
    const ligne = document.getElementById('abonnementEtat');
    if(!ligne) return;
    const st = getSubscriptionStatus();
    const sub = ensureInstallDate();
    if(st.status === 'active'){
      const fin = sub.paidUntil ? new Date(sub.paidUntil) : null;
      ligne.textContent = fin
        ? ('Abonnement actif jusqu\'au ' + fin.toLocaleDateString('fr-FR') + '.')
        : 'Abonnement actif.';
      return;
    }
    if(st.status === 'trial'){
      ligne.textContent = 'Essai gratuit : ' + st.daysLeft + ' jour' + (st.daysLeft > 1 ? 's' : '') + ' restant' +
        (st.daysLeft > 1 ? 's' : '') +
        (st.bonusDays > 0 ? ' (dont ' + st.bonusDays + ' payé' + (st.bonusDays > 1 ? 's' : '') + ' avec le portefeuille).' : '.');
      return;
    }
    ligne.textContent = 'Essai terminé. Un abonnement est nécessaire pour continuer.';
  }

  // ---------------- PORTEFEUILLE : vérification par correspondance nom/email ----------------
  const WALLET_SESSION_KEY = 'wallet_session_v1';
  let walletSession = null;

  function loadWalletSession(){
    try{ return JSON.parse(localStorage.getItem(WALLET_SESSION_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function saveWalletSession(session){
    try{
      if(session) localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(WALLET_SESSION_KEY);
    }catch(e){}
  }


  function initWalletAuth(){
    walletSession = loadWalletSession();
    renderWallet();
  }

  function normalizeMatch(str){
    return (str || '').trim().toLowerCase();
  }

  document.getElementById('walletVerifyForm').addEventListener('submit', function(e){
    e.preventDefault();
    const statusEl = document.getElementById('walletAuthStatus');
    const name = document.getElementById('walletVerifyName').value.trim();
    const email = document.getElementById('walletVerifyEmail').value.trim();

    if(!currentUser){
      if(statusEl) statusEl.textContent = 'Veuillez d\'abord vous connecter à l\'application.';
      return;
    }
    if(normalizeMatch(name) !== normalizeMatch(currentUser.name) ||
       normalizeMatch(email) !== normalizeMatch(currentUser.email)){
      if(statusEl) statusEl.textContent = 'Le nom et l\'email ne correspondent pas à votre connexion. Réessayez.';
      return;
    }

    walletSession = { user: { name: currentUser.name, email: currentUser.email } };
    saveWalletSession(walletSession);
    if(statusEl) statusEl.textContent = '';
    renderWallet();
  });

  // ---------------- PORTEFEUILLE EN ARIARY : SOLDE ET RETRAITS ----------------
  // Le solde, le taux de change et les retraits sont l'affaire du serveur.
  // Une page peut être modifiée par celui qui la regarde : un solde qu'elle
  // calculerait elle-même serait un solde qu'elle pourrait s'inventer.
  let walletState = null;
  // Chaque canal demande autre chose : une adresse email, un compte, un nom
  // de bénéficiaire, une référence de commande. Un seul champ « destination »
  // au libellé figé les mélangerait tous.
  // « devise » : ce que le compte d'arrivée sait recevoir. Les portefeuilles
  // internationaux ne tiennent pas d'ariary ; le Mobile Money, que de l'ariary.
  const PAYOUT_DESTINATION_LABELS = {
    wise: { label: 'Email de votre compte Wise', placeholder: 'vous@email.com', devise: 'etrangere' },
    payoneer: { label: 'Email de votre compte Payoneer', placeholder: 'vous@email.com', devise: 'etrangere' },
    skrill: { label: 'Email de votre compte Skrill', placeholder: 'vous@email.com', devise: 'etrangere' },
    mobile: { label: 'Votre numéro Mobile Money et le nom du titulaire', placeholder: '034 00 000 00 — RABE Koto', devise: 'MGA' },
    card: { label: 'Votre compte bancaire (IBAN ou banque / agence / compte / clé) et le titulaire', placeholder: 'FR76 3000 … — RABE Koto', devise: 'libre' }
  };

  function formatWalletAr(amount){
    return (Number(amount) || 0).toLocaleString('fr-FR') + ' Ar';
  }

  function callWallet(payload){
    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      return Promise.reject(new Error('Fonction « wallet » indisponible : déployez-la.'));
    }
    return window.__sb.functions.invoke('wallet', { body: payload }).then(function(res){
      if(res && res.error){
        // Le refus du serveur porte sa raison dans le corps de la réponse.
        const ctx = res.error.context;
        if(ctx && typeof ctx.json === 'function'){
          return ctx.json().then(function(body){
            throw new Error((body && body.error) || res.error.message || 'erreur serveur');
          }, function(){ throw new Error(res.error.message || 'erreur serveur'); });
        }
        throw new Error(res.error.message || 'erreur serveur');
      }
      return (res && res.data) || {};
    });
  }

  function refreshWalletFromServer(){
    const balanceEl = document.getElementById('walletBalance');
    if(!balanceEl) return;
    const sub = ensureInstallDate();
    callWallet({ action: 'state', installId: sub.id }).then(function(state){
      walletState = state;
      renderWalletBalance();
      renderPayoutList();
      renderPayoutQueue();
      renderAchats();
      notifySettledPayouts(state.payouts);
      annoncerLesVisiteurs(state);
    }, function(err){
      balanceEl.textContent = '—';
      const note = document.getElementById('walletRateNote');
      if(note) note.textContent = 'Solde indisponible : ' + err.message;
    });
  }

  function renderWalletBalance(){
    if(!walletState) return;
    const balanceEl = document.getElementById('walletBalance');
    if(balanceEl) balanceEl.textContent = formatWalletAr(walletState.balanceAr);
    // Ce qui peut sortir pour de bon : l'argent vraiment payé. Les sommes
    // inscrites par l'application se dépensent ici.
    const retirableEl = document.getElementById('walletRetirable');
    if(retirableEl){
      const r = walletState.retirableAr;
      // Roa samy hafa, asehoy misaraka : vola tena izy (dépôts Papi +
      // ventes), ary ny vola nampidirin'ny appli ho azy.
      const vola = Math.max(0, walletState.papiAr || 0);
      const appli = Math.max(0, (walletState.balanceAr || 0) - vola);
      const ligne = function(label, montant, note){
        return '<div style="display:flex; justify-content:space-between; align-items:baseline; gap:0.8rem; padding:0.35rem 0; border-top:1px solid var(--line);">' +
          '<span>' + label + (note ? '<br><span style="font-size:0.72rem;">' + note + '</span>' : '') + '</span>' +
          '<strong style="color:var(--text); white-space:nowrap;">' + formatWalletAr(montant) + '</strong></div>';
      };
      retirableEl.innerHTML = (r === undefined || r === null) ? '' :
        '<div style="margin-top:0.4rem;">' +
        ligne('💰 Vola tena izy', vola, 'Dépôt Papi sy varotra') +
        (appli ? ligne('🏷️ Avy amin\'ny appli', appli, 'Ato anatiny ihany (abonnement, déblocage…)') : '') +
        '</div>';
    }
    const cleEl = document.getElementById('walletIdKey');
    if(cleEl) cleEl.textContent = walletState.idKey || '—';
    const cleType = document.getElementById('walletIdKeyType');
    if(cleType) cleType.textContent = walletState.idKey
      ? (walletState.idKeyAuto ? 'Automatique — azonao ovaina ho anao manokana.' : 'Noforoninao.')
      : '';
    const cleSuppr = document.getElementById('walletIdKeyDelete');
    if(cleSuppr) cleSuppr.style.display = walletState.idKey && !walletState.idKeyAuto ? '' : 'none';
    renderTransferts();
    renderAffiliation();
    transfertCalculer();
    const dispoEl = document.getElementById('etrangerDispo');
    if(dispoEl) dispoEl.textContent = 'Vola tena izy azo ampiasaina : ' + formatWalletAr(walletState.papiAr || 0);
    renderWalletCanaux();
    updatePayoutDestinationField();
    updateWalletConversion();
  }

  // Ce qui marche vraiment sur ce serveur : c'est lui qui le dit, selon les
  // clefs posées. Un canal fermé ne doit pas avoir l'air ouvert.
  function renderWalletCanaux(){
    const el = document.getElementById('walletCanaux');
    const c = (walletState && walletState.canaux) || {};
    if(el){
      el.innerHTML =
        (c.depotPapi ? '✅' : '⛔') + ' Dépôt Mobile Money<br>' +
        '👤 Retraits envoyés par le propriétaire';
    }
    const pct = document.getElementById('depotFraisPct');
    if(pct && walletState && walletState.depositFeePct !== undefined) pct.textContent = walletState.depositFeePct + ' %';
    const papiBtn = document.getElementById('papiPayBtn');
    if(papiBtn) papiBtn.disabled = !c.depotPapi;
  }

  // La vola tena izy (argent vraiment payé), dans la devise du pays où
  // l'argent doit arriver — pas les sommes de l'appli.
  function updateWalletConversion(){
    const select = document.getElementById('walletCurrency');
    const out = document.getElementById('walletConverted');
    const note = document.getElementById('walletRateNote');
    if(!select || !out || !walletState) return;
    const currency = select.value;
    if(currency === 'MGA'){
      out.textContent = formatWalletAr(walletState.papiAr || 0);
      if(note) note.textContent = '';
      return;
    }
    out.textContent = '…';
    callWallet({ action: 'rate', currency: currency }).then(function(res){
      if(!res.rate){
        out.textContent = '—';
        if(note) note.textContent = 'Taux du jour indisponible pour ' + currency + '.';
        return;
      }
      const converted = (walletState.papiAr || 0) * res.rate;
      out.textContent = converted.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + currency;
      if(note){
        note.textContent = 'Taux du jour : 1 ' + currency + ' ≈ ' +
          (1 / res.rate).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' Ar. ' +
          'Il bouge d\'un jour à l\'autre.';
      }
    }, function(err){
      out.textContent = '—';
      if(note) note.textContent = err.message;
    });
  }

  const walletCurrencySelect = document.getElementById('walletCurrency');
  if(walletCurrencySelect) walletCurrencySelect.addEventListener('change', updateWalletConversion);

  // Le champ « où envoyer » change de sens selon le moyen choisi : un email
  // Wise, un compte bancaire et un numéro Mobile Money ne se ressemblent pas.
  const payoutMethodSelect = document.getElementById('payoutMethod');
  function updatePayoutDestinationField(){
    if(!payoutMethodSelect) return;
    const methode = payoutMethodSelect.value;
    const conf = PAYOUT_DESTINATION_LABELS[methode] || PAYOUT_DESTINATION_LABELS.wise;
    const label = document.getElementById('payoutDestinationLabel');
    const input = document.getElementById('payoutDestination');
    if(label) label.textContent = conf.label;
    if(input) input.placeholder = conf.placeholder;

    // La devise suit le compte d'arrivée : proposer l'ariary pour Wise,
    // c'est une demande que le serveur refusera.
    const devise = document.getElementById('payoutCurrency');
    if(devise){
      Array.prototype.forEach.call(devise.options, function(o){
        o.disabled = (conf.devise === 'etrangere' && o.value === 'MGA') ||
          (conf.devise === 'MGA' && o.value !== 'MGA');
      });
      if(devise.options[devise.selectedIndex].disabled){
        devise.value = conf.devise === 'MGA' ? 'MGA' : 'EUR';
      }
    }

    // Dire franchement qui envoie : l'application elle-même, ou le propriétaire.
    const canal = document.getElementById('payoutCanal');
    if(canal){
      canal.textContent = '👤 Envoyé par le propriétaire depuis son compte ' + payoutMethodLabel(methode) +
          ' — vous êtes prévenu dès que c\'est parti.';
    }
  }
  if(payoutMethodSelect){
    payoutMethodSelect.addEventListener('change', updatePayoutDestinationField);
    updatePayoutDestinationField();
  }

  // Les canaux de sortie ont leurs propres noms : « wallet » veut dire
  // « un autre portefeuille » ici, pas « le portefeuille de l'application ».
  function payoutMethodLabel(method){
    if(method === 'wise') return 'Wise';
    if(method === 'payoneer') return 'Payoneer';
    if(method === 'skrill') return 'Skrill';
    if(method === 'card') return 'Compte bancaire / carte';
    if(method === 'mobile') return 'Mobile Money';
    if(method === 'cash') return 'Espèces — point cash';
    if(method === 'wallet') return 'Autre portefeuille';
    if(method === 'merchant') return 'Achat à l\'étranger';
    return 'Ancien moyen (retiré)';
  }

  function payoutStatusLabel(status){
    if(status === 'sent') return '<span style="color:var(--cyan);">Envoyé</span>';
    if(status === 'refused') return '<span style="color:var(--red, #e66);">Refusé — solde rendu</span>';
    return '<span style="color:var(--amber);">En attente d\'envoi</span>';
  }

  // ---- Glisser une ligne de l'historique pour la masquer ----
  // Ce sont des traces d'argent : elles ne s'effacent JAMAIS de la base, et
  // le solde n'en dépend pas. Glisser à gauche ou à droite les retire
  // seulement de CETTE liste, sur cet appareil ; « Tout réafficher » les
  // ramène. Une ligne encore en attente ne se masque pas : on la perdrait de
  // vue alors qu'elle n'est pas tranchée.
  const HISTORIQUE_MASQUE_KEY = 'wallet_historique_masque';
  function historiqueMasque(){
    try { return JSON.parse(localStorage.getItem(HISTORIQUE_MASQUE_KEY)) || []; } catch(e){ return []; }
  }
  function masquerDansHistorique(id){
    const ids = historiqueMasque();
    if(ids.indexOf(id) < 0) ids.unshift(id);
    try { localStorage.setItem(HISTORIQUE_MASQUE_KEY, JSON.stringify(ids.slice(0, 500))); } catch(e){}
  }
  function lienReafficher(list, combien){
    if(!combien) return;
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'btn btn-sm';
    a.style.cssText = 'width:auto; margin-top:0.2rem;';
    a.textContent = '↺ Tout réafficher (' + combien + ' masqué' + (combien > 1 ? 's' : '') + ')';
    a.addEventListener('click', function(){
      try { localStorage.removeItem(HISTORIQUE_MASQUE_KEY); } catch(e){}
      renderPayoutList();
    });
    list.appendChild(a);
  }

  // « agir », quand il est donné, remplace le simple masquage : il reçoit de
  // quoi remettre la carte en place si l'action n'aboutit pas.
  function glisserPourMasquer(div, id, agir){
    div.style.touchAction = 'pan-y';
    div.style.cursor = 'grab';
    div.title = 'Glisser à gauche ou à droite pour masquer';
    let depart = null, glisse = false, dx = 0;
    function debut(x, y, cible){
      // Les boutons (annuler, envoyer) gardent leur clic.
      if(cible && cible.closest && cible.closest('button, a, input, select')){ depart = null; return; }
      depart = { x: x, y: y }; glisse = false; dx = 0;
    }
    function bouge(x, y){
      if(!depart) return false;
      dx = x - depart.x;
      const dy = y - depart.y;
      if(!glisse){
        // Plus vertical qu'horizontal : c'est la liste qui défile.
        if(Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)){ depart = null; return false; }
        if(Math.abs(dx) < 12) return false;
        glisse = true;
        div.style.transition = 'none';
      }
      div.style.transform = 'translateX(' + dx + 'px)';
      div.style.opacity = String(Math.max(1 - Math.abs(dx) / (div.offsetWidth || 1), 0.25));
      return true;
    }
    function remettre(){
      div.style.transition = 'transform 0.2s, opacity 0.2s';
      div.style.transform = '';
      div.style.opacity = '';
    }
    function fin(){
      if(!depart) return;
      depart = null;
      if(!glisse) return;
      glisse = false;
      if(Math.abs(dx) >= (div.offsetWidth || 1) * 0.35 && agir){
        agir(remettre);
      } else if(Math.abs(dx) >= (div.offsetWidth || 1) * 0.35){
        div.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
        div.style.transform = 'translateX(' + (dx < 0 ? -1 : 1) * (div.offsetWidth + 40) + 'px)';
        div.style.opacity = '0';
        masquerDansHistorique(id);
        setTimeout(renderPayoutList, 230);
      } else {
        remettre();
      }
    }
    div.addEventListener('dragstart', function(e){ e.preventDefault(); });
    div.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1){ depart = null; remettre(); return; }
      debut(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    div.addEventListener('touchmove', function(e){
      if(!depart) return;
      if(bouge(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    div.addEventListener('touchend', fin);
    div.addEventListener('touchcancel', function(){ depart = null; glisse = false; remettre(); });
    div.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      debut(e.clientX, e.clientY, e.target);
      if(!depart) return;
      function suivre(ev){ bouge(ev.clientX, ev.clientY); }
      function lacher(){
        document.removeEventListener('mousemove', suivre);
        document.removeEventListener('mouseup', lacher);
        fin();
      }
      document.addEventListener('mousemove', suivre);
      document.addEventListener('mouseup', lacher);
    });
  }

  // La liste des versements suit le même état que celle des retraits.
  // Le panier (parametres.js) paie par ici : même appel, même session.
  window.__callWallet = callWallet;
  window.__rafraichirPortefeuille = function(){ refreshWalletFromServer(); };

  // ---------------- AFFILIATION ----------------
  // « ?aff=<ID KEY> » : la personne arrive par le lien de quelqu'un. On garde
  // le code jusqu'à ce qu'elle ait un compte, puis le serveur décide (compte
  // neuf, pas le sien, pas déjà rattaché). Le premier lien l'emporte, ici
  // comme sur le serveur.
  const AFF_KEY = 'ny_asako_aff';
  (function(){
    if(MODE_MPIASA) return;
    try{
      const code = String(new URLSearchParams(window.location.search).get('aff') || '').trim().slice(0, 40);
      if(code && !localStorage.getItem(AFF_KEY)) localStorage.setItem(AFF_KEY, code);
    }catch(e){}
  })();

  function envoyerAffiliation(){
    let code = '';
    try{ code = localStorage.getItem(AFF_KEY) || ''; }catch(e){}
    if(!code) return;
    callWallet({ action: 'affilier', code: code }).then(function(){
      // Rattaché ou refusé (compte ancien, lien inconnu, déjà rattaché) :
      // la réponse est définitive, on n'y revient pas.
      try{ localStorage.removeItem(AFF_KEY); }catch(e){}
    }, function(){ /* réseau ou fonction absente : on réessaiera à la prochaine connexion */ });
  }

  // L'adresse publique, comme « Lien d'invitation » (inviter.js), pas celle
  // d'où la page est ouverte.
  function lienAffiliation(){
    const cle = walletState && walletState.idKey;
    if(!cle) return '';
    return typeof lienInvitation === 'function' ? lienInvitation(cle)
      : location.origin + location.pathname + '?aff=' + encodeURIComponent(cle);
  }

  function renderAffiliation(){
    const panel = document.getElementById('walletAffPanel');
    if(!panel || !walletState) return;
    const a = walletState.affiliation;
    // Fonction pas encore à jour, ou SQL pas passé : rien à proposer.
    panel.style.display = a ? '' : 'none';
    if(!a) return;
    const lienEl = document.getElementById('walletAffLien');
    if(lienEl) lienEl.value = lienAffiliation() || '—';
    const t = a.taux || {};
    const tauxEl = document.getElementById('walletAffTaux');
    if(tauxEl){
      // L'admin ne paie plus (26/10/2026) : reste la commission sur les
      // achats du fil, que paie le vendeur.
      tauxEl.innerHTML = 'Zarao ny rohinao. Isaky ny mividy entana ao amin\'ny fil izay niditra tamin\'io : ' +
        '<strong>' + formatWalletAr(t.fixeAr) + ' + ' + (Number(t.pct) || 0).toLocaleString('fr-FR') +
        ' %</strong> (aloan\'ny mpivarotra, vola tena izy, azo alaina).' +
        // Les 2 % de l'admin, pris sur la même commission (26/10/2026).
        (Number(t.adminPct) > 0 ? ' Ny ' + Number(t.adminPct).toLocaleString('fr-FR') +
          ' % sisa amin\'ny commission dia an\'ny admin.' : '');
    }
    const nbEl = document.getElementById('walletAffNb');
    if(nbEl) nbEl.textContent = String(a.nbFilleuls || 0);
    const totalEl = document.getElementById('walletAffTotal');
    if(totalEl) totalEl.textContent = formatWalletAr((a.totalReel || 0) + (a.totalAppli || 0));
    const detailEl = document.getElementById('walletAffDetail');
    if(detailEl) detailEl.textContent = 'Vola tena izy ' + formatWalletAr(a.totalReel) +
      ' · appli ' + formatWalletAr(a.totalAppli);
    const listeEl = document.getElementById('walletAffListe');
    if(listeEl){
      const gains = (a.gains || []).map(function(g){
        return '<div style="display:flex; justify-content:space-between; gap:0.8rem; padding:0.3rem 0; border-top:1px solid var(--line);">' +
          '<span>' + escapeHtml(g.note || '') + '<br><span style="font-size:0.7rem; color:var(--muted);">' +
          new Date(g.created_at).toLocaleString('fr-FR') + '</span></span>' +
          '<strong style="white-space:nowrap; color:var(--cyan);">+' + formatWalletAr(g.amount_ar) + '</strong></div>';
      }).join('');
      listeEl.innerHTML = gains ||
        '<p style="color:var(--muted);">Mbola tsy nisy olona niditra tamin\'ny rohinao.</p>';
    }
  }

  // Les commissions sont dans le portefeuille : un appui y mène.
  const affVersPortefeuille = document.getElementById('walletAffVersPortefeuille');
  if(affVersPortefeuille){
    affVersPortefeuille.addEventListener('click', function(){
      const nav = document.querySelector('.nav-item[data-section="wallet"]');
      if(nav) nav.click();
    });
  }

  const affCopy = document.getElementById('walletAffCopy');
  if(affCopy){
    affCopy.addEventListener('click', function(){
      const lien = lienAffiliation();
      if(!lien) return;
      const fini = function(){
        affCopy.textContent = '✅ Voadika';
        setTimeout(function(){ affCopy.textContent = '📋 Adikao'; }, 1500);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(lien).then(fini, function(){
          const el = document.getElementById('walletAffLien');
          if(el){ el.select(); }
        });
      } else {
        const el = document.getElementById('walletAffLien');
        if(el){ el.select(); try{ document.execCommand('copy'); fini(); }catch(e){} }
      }
    });
  }
  const affShare = document.getElementById('walletAffShare');
  if(affShare){
    affShare.addEventListener('click', function(){
      const lien = lienAffiliation();
      if(!lien) return;
      const texte = 'Midira amin\'ny Ny asako amin\'ity rohy ity :';
      if(navigator.share){
        navigator.share({ title: 'Ny asako', text: texte, url: lien }).catch(function(){});
      } else {
        window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(lien), '_blank', 'noopener');
      }
    });
  }

  // ---- Les achats du fil, payés avec le portefeuille ----
  // Comme acheteur : la somme est tenue, et « Voaraiko » la fait passer au
  // vendeur. Comme vendeur (ou propriétaire, pour un litige) : « Averina »
  // la rend à l'acheteur. Le serveur vérifie qui a le droit de quoi.
  const ACHAT_ETATS = {
    tazonina: { mot: 'Voatazona — miandry ny entana', couleur: 'var(--amber, #e9a23b)' },
    voaray: { mot: 'Voaray — tonga any amin\'ny mpivarotra ny vola', couleur: 'var(--green, #2bb673)' },
    naverina: { mot: 'Naverina amin\'ny mpividy', couleur: 'var(--muted)' }
  };
  function renderAchats(){
    const list = document.getElementById('achatList');
    const empty = document.getElementById('achatEmpty');
    if(!list || !walletState) return;
    const moi = String(walletState.email || '').toLowerCase();
    const vus = Object.create(null);
    const rows = (walletState.achats || []).concat(walletState.achatsEnAttente || []).filter(function(a){
      if(vus[a.id]) return false;
      vus[a.id] = true;
      return true;
    });
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    rows.forEach(function(a){
      const acheteur = String(a.buyer_email || '').toLowerCase() === moi;
      const vendeur = String(a.seller_email || '').toLowerCase() === moi;
      const etat = ACHAT_ETATS[a.status] || { mot: a.status, couleur: 'var(--muted)' };
      const qui = acheteur
        ? 'Novidinao tamin\'i ' + (a.seller_name || a.seller_email || '—')
        : vendeur
          ? 'Novidin\'i ' + (a.buyer_name || a.buyer_email || '—')
          : (a.buyer_name || a.buyer_email) + ' → ' + (a.seller_name || a.seller_email);
      const div = document.createElement('div');
      div.className = 'payout-row';
      div.style.cssText = 'padding:0.6rem 0; border-top:1px solid var(--line); font-size:0.8rem; line-height:1.5;';
      div.innerHTML =
        '<div><strong>📦 ' + escapeHtml(a.titre || 'Entana') + '</strong> × ' + (a.isa || 1) +
          ' — <strong>' + formatWalletAr(a.amount_ar) + '</strong></div>' +
        '<div style="color:var(--muted);">' + escapeHtml(qui) + ' · ' +
          (a.created_at ? new Date(a.created_at).toLocaleString('fr-FR') : '') + '</div>' +
        '<div style="color:' + etat.couleur + '; font-weight:600;">' + escapeHtml(etat.mot) + '</div>' +
        (a.note ? '<div style="color:var(--muted);">' + escapeHtml(a.note) + '</div>' : '') +
        '<div class="achat-actions" style="display:flex; gap:0.5rem; margin-top:0.35rem;"></div>';
      const actions = div.querySelector('.achat-actions');
      function bouton(texte, primaire, action, question){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm' + (primaire ? ' btn-primary' : '');
        b.style.width = 'auto';
        b.textContent = texte;
        b.addEventListener('click', function(){
          if(!confirm(question)) return;
          b.disabled = true;
          callWallet({ action: action, id: a.id }).then(function(){
            refreshWalletFromServer();
          }, function(err){
            b.disabled = false;
            alert(err.message);
          });
        });
        actions.appendChild(b);
      }
      if(a.status === 'tazonina'){
        if(acheteur){
          bouton('✓ Voaraiko ny entana', true, 'achat_voaray',
            'Voarainao tokoa ve ny entana ? Handeha any amin\'ny mpivarotra ny ' + formatWalletAr(a.amount_ar) + ', ary tsy azo averina intsony.');
        }
        if(vendeur || walletState.isOwner){
          bouton('↩ Averina ny vola', false, 'achat_averina',
            'Haverina amin\'ny mpividy ve ny ' + formatWalletAr(a.amount_ar) + ' ?');
        }
      }
      list.appendChild(div);
    });
  }

  function renderPayoutList(){
    renderDepositList();
    const list = document.getElementById('payoutList');
    const empty = document.getElementById('payoutEmpty');
    if(!list || !walletState) return;
    const masques = historiqueMasque();
    const tous = walletState.payouts || [];
    const rows = tous.filter(function(r){ return r.status === 'pending' || masques.indexOf(r.id) < 0; });
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    rows.forEach(function(r){
      const div = document.createElement('div');
      // Un retrait réglé se masque ; un retrait encore en attente, glissé,
      // s'annule — la somme revient au solde. Celui qu'un envoi automatique a
      // déjà touché ne s'annule pas : il a pu partir (voir « annuler »).
      if(r.status !== 'pending'){
        glisserPourMasquer(div, r.id);
      } else {
        glisserPourMasquer(div, r.id, function(remettre){
          if(r.auto_provider){
            remettre();
            alert('Tsy azo foanana intsony : efa nalefa tany amin\'ny ' + r.auto_provider +
              ' ny baiko. Andraso ny valiny, na jereo any aminy.');
            return;
          }
          if(!confirm('Hofoanana ity retrait ity, dia hiverina ao amin\'ny soldenao ny ' +
            formatWalletAr(r.amount_ar) + '. Hitohy?')){ remettre(); return; }
          div.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
          div.style.opacity = '0.4';
          callWallet({ action: 'annuler', id: r.id }).then(function(){
            pushNotification('parrainage', '↩️ Nofoanana ny retrait : ' +
              formatWalletAr(r.amount_ar) + ' naverina ao amin\'ny soldenao.');
            masquerDansHistorique(r.id);
            refreshWalletFromServer();
          }, function(err){
            remettre();
            alert(err.message);
          });
        });
      }
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.8rem; color:var(--muted); line-height:1.7;';
      const arrivee = r.amount_out && r.currency && r.currency !== 'MGA'
        ? ' → ' + Number(r.amount_out).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + r.currency
        : '';
      div.innerHTML =
        '<strong style="color:var(--text);">' + formatWalletAr(r.amount_ar) + '</strong>' + escapeHtml(arrivee) +
        ' · ' + escapeHtml(payoutMethodLabel(r.method)) + '<br>' +
        (r.kind === 'purchase' ? 'Achat : ' : 'Vers : ') + escapeHtml(r.destination || '—') + '<br>' +
        (r.link ? 'Lien : ' + escapeHtml(r.link) + '<br>' : '') +
        (r.instructions ? 'Consigne : ' + escapeHtml(r.instructions) + '<br>' : '') +
        new Date(r.created_at).toLocaleString('fr-FR') + ' · ' + payoutStatusLabel(r.status) +
        (r.note ? '<br>Note : ' + escapeHtml(r.note) : '');

      // Une demande en attente est déjà retirée du solde : c'est ce qui
      // empêche de demander deux fois la même somme. Si elle ne part jamais,
      // la somme reste dehors sans être arrivée nulle part — perdue pour son
      // propriétaire. Ce bouton la lui rend.
      //
      // Il ne paraît QUE si aucun envoi automatique n'a été tenté. Une ligne
      // qu'un fournisseur a touchée a pu partir sans que la réponse nous
      // parvienne ; la rendre reviendrait à la payer deux fois. Le serveur le
      // refuse aussi de son côté — le bouton n'est que la porte fermée
      // d'avance.
      if(r.status === 'pending' && !r.auto_provider){
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'btn btn-sm';
        bouton.style.cssText = 'width:auto; margin-top:0.6rem;';
        bouton.textContent = '↩️ Hanafoana, averina ao amin\'ny solde';
        bouton.addEventListener('click', function(){
          if(!confirm('Hofoanana ity fangatahana ity, dia hiverina ao amin\'ny soldenao ny ' +
            formatWalletAr(r.amount_ar) + '. Hitohy?')) return;
          bouton.disabled = true;
          bouton.textContent = 'Manafoana…';
          callWallet({ action: 'annuler', id: r.id }).then(function(){
            pushNotification('parrainage', '↩️ Nofoanana ny retrait : ' +
              formatWalletAr(r.amount_ar) + ' naverina ao amin\'ny soldenao.');
            refreshWalletFromServer();
          }, function(err){
            bouton.disabled = false;
            bouton.textContent = '↩️ Hanafoana, averina ao amin\'ny solde';
            // Le refus du serveur porte sa raison : elle en dit plus que le
            // bouton n'en sait, et c'est elle qu'il faut lire.
            const ligne = document.createElement('div');
            ligne.style.cssText = 'color:var(--amber); margin-top:0.4rem; line-height:1.5;';
            ligne.textContent = err.message;
            div.appendChild(ligne);
          });
        });
        div.appendChild(bouton);
      }
      list.appendChild(div);
    });
    lienReafficher(list, tous.length - rows.length);
  }

  // Ce qui est ENTRÉ dans le portefeuille. Le solde ne compte que les
  // versements confirmés — mais un versement annoncé doit se voir, sinon la
  // personne qui vient de payer croit que rien n'est arrivé et paie deux fois.
  const DEPOT_ETATS = {
    confirme: { texte: 'reçu', couleur: 'var(--cyan)' },
    en_attente: { texte: 'en attente de confirmation', couleur: 'var(--amber)' },
    refuse: { texte: 'refusé', couleur: 'var(--red)' }
  };
  const DEPOT_CANAUX = {
    mvola: 'MVola', orange: 'Orange Money', airtel: 'Airtel Money',
    paypal: 'Ancien dépôt (moyen retiré)', papi: 'Mobile Money (Papi)', essai: 'Essai', visiteur: 'Personne nouvelle sur le site'
  };

  function renderDepositList(){
    const list = document.getElementById('depositList');
    const empty = document.getElementById('depositEmpty');
    if(!list || !walletState) return;
    const masques = historiqueMasque();
    const tous = walletState.deposits || [];
    const rows = tous.filter(function(r){ return r.status === 'en_attente' || masques.indexOf(r.id) < 0; });
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    rows.forEach(function(r){
      const etat = DEPOT_ETATS[r.status] || { texte: r.status, couleur: 'var(--muted)' };
      const canal = DEPOT_CANAUX[r.provider] || r.provider || '—';
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.8rem; color:var(--muted); line-height:1.7;';
      div.innerHTML =
        '<strong style="color:var(--text);">+ ' + formatWalletAr(r.amount_ar) + '</strong>' +
        ' · ' + escapeHtml(canal) + '<br>' +
        new Date(r.created_at).toLocaleString('fr-FR') +
        ' · <span style="color:' + etat.couleur + ';">' + escapeHtml(etat.texte) + '</span>' +
        (r.provider_ref ? '<br>Référence : ' + escapeHtml(r.provider_ref) : '') +
        (r.note ? '<br>Note : ' + escapeHtml(r.note) : '');
      if(r.status !== 'en_attente') glisserPourMasquer(div, r.id);
      list.appendChild(div);
    });
    lienReafficher(list, tous.length - rows.length);
  }

    const payoutRequestBtn = document.getElementById('payoutRequestBtn');
  if(payoutRequestBtn){
    payoutRequestBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('payoutStatus');
      const amount = Number(document.getElementById('payoutAmount').value) || 0;
      // Seul le Mobile Money reste ouvert, en ariary. L'opérateur voyage
      // avec le numéro : c'est ce que le propriétaire lira pour envoyer.
      const method = 'mobile';
      const currency = 'MGA';
      const numero = document.getElementById('payoutDestination').value.trim();
      const operateurEl = document.getElementById('payoutOperateur');
      const destination = numero ? ((operateurEl ? operateurEl.value + ' · ' : '') + numero) : '';
      if(!destination){ statusEl.textContent = 'Indiquez votre numéro Mobile Money.'; return; }
      if(!(amount > 0)){ statusEl.textContent = 'Indiquez le montant à retirer.'; return; }

      payoutRequestBtn.disabled = true;
      statusEl.textContent = 'Envoi de la demande…';
      callWallet({
        action: 'payout', amountAr: amount, method: method, currency: currency,
        destination: destination, name: (currentUser && currentUser.name) || ''
      }).then(function(res){
        payoutRequestBtn.disabled = false;
        document.getElementById('payoutAmount').value = '';
        const p = res.payout || {};
        const arrivee = p.amount_out && p.currency && p.currency !== 'MGA'
          ? ' (environ ' + Number(p.amount_out).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + p.currency + ')'
          : '';
        // Le serveur dit ce qu'il est advenu : un canal automatique a pu
        // envoyer l'argent sur-le-champ, ou le refuser avec son motif. Sans
        // clefs, rien ne change — c'est une demande, et le mot le dit.
        // Le propriétaire est celui qui exécute les retraits. Quand c'est lui
        // qui en demande un, lui annoncer qu'il sera prévenu revient à lui
        // dire qu'il s'écrira à lui-même : la demande l'attend, lui, dans sa
        // propre file.
        const cestMoiQuiEnvoie = !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email));
        const suite = res.etat === 'sent'
          ? '. ' + (res.message || 'Lasa ho azy ny vola.') +
            ' Ho hitanao ao amin\'ny lisitry ny retraits ny référence.'
          : (res.etat === 'refused'
            ? '. ' + (res.message || 'Tsy lasa.') + ' Naverina ny solde.'
            : (cestMoiQuiEnvoie
              ? '. Anao ny mandefa azy : miandry anao ao amin\'ny « Retraits à envoyer » etsy ambany izy.'
              : '. Le propriétaire est prévenu ; vous le serez dès que l\'argent est parti.'));
        statusEl.textContent = (res.etat === 'sent'
            ? 'Retrait envoyé : '
            : (cestMoiQuiEnvoie ? 'Retrait à envoyer : ' : 'Demande enregistrée : ')) +
          formatWalletAr(amount) + arrivee + suite;
        pushNotification('parrainage', (res.etat === 'sent' ? 'Retrait envoyé : ' : 'Retrait demandé : ') +
          formatWalletAr(amount) + ' · ' + payoutMethodLabel(method) + '.');
        refreshWalletFromServer();
      }, function(err){
        payoutRequestBtn.disabled = false;
        statusEl.textContent = err.message;
      });
    });
  }

  // ---- Achats internationaux, payés avec la vola tena izy ----
  // Le bouton du panneau « Achats internationaux » mène ici ; la demande
  // part comme un retrait « merchant », que le propriétaire exécute.
  const marketPayerBtn = document.getElementById('marketPayerBtn');
  if(marketPayerBtn){
    marketPayerBtn.addEventListener('click', function(){
      const panneau = document.getElementById('marketPanel');
      if(panneau) panneau.style.display = 'none';
      const nav = document.querySelector('.nav-item[data-section="wallet"]');
      if(nav) nav.click();
      setTimeout(function(){
        const cible = document.getElementById('walletEtrangerPanel');
        if(cible && cible.offsetParent) cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    });
  }
  // ---- ID KEY et transferts entre portefeuilles ----
  // L'argent part de la vola tena izy seule ; les frais (transferFeePct,
  // 0,5 %) s'ajoutent à la somme et reviennent au propriétaire. Le serveur
  // refait tout le compte : la page ne fait qu'annoncer.
  function transfertFrais(montant){
    const pct = (walletState && walletState.transferFeePct) || 0;
    return pct > 0 ? Math.ceil(montant * pct / 100) : 0;
  }
  function transfertCalculer(){
    const el = document.getElementById('transfertFrais');
    const champ = document.getElementById('transfertMontant');
    if(!el || !champ || !walletState) return;
    const montant = Math.floor(Number(champ.value) || 0);
    const vola = walletState.papiAr || 0;
    const pct = walletState.transferFeePct || 0;
    el.textContent = montant > 0
      ? 'Frais ' + pct.toLocaleString('fr-FR') + ' % : ' + formatWalletAr(transfertFrais(montant)) +
        ' — hiala amin\'ny vola tena izy : ' + formatWalletAr(montant + transfertFrais(montant)) +
        ' (misy : ' + formatWalletAr(vola) + ').'
      : 'Vola tena izy azo afindra : ' + formatWalletAr(vola) + ' · frais ' + pct.toLocaleString('fr-FR') + ' %.';
  }
  function renderTransferts(){
    const list = document.getElementById('transfertList');
    const empty = document.getElementById('transfertEmpty');
    if(!list || !walletState) return;
    const rows = walletState.transferts || [];
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    rows.forEach(function(t){
      const sortant = t.sens === 'envoye';
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.8rem; color:var(--muted); line-height:1.7;';
      div.innerHTML =
        '<strong style="color:' + (sortant ? 'var(--text)' : 'var(--cyan)') + ';">' +
        (sortant ? '− ' : '+ ') + formatWalletAr(t.amount_ar) + '</strong>' +
        (sortant && t.fee_ar ? ' <span>(+ frais ' + formatWalletAr(t.fee_ar) + ')</span>' : '') +
        ' · ' + (sortant ? 'Nalefa any amin\'ny ' : 'Avy amin\'ny ') +
        '<span style="font-family:var(--font-mono);">' + escapeHtml(t.cle || '—') + '</span><br>' +
        new Date(t.created_at).toLocaleString('fr-FR') +
        (t.note ? '<br>' + escapeHtml(t.note) : '');
      list.appendChild(div);
    });
  }
  const idKeyCopy = document.getElementById('walletIdKeyCopy');
  if(idKeyCopy){
    idKeyCopy.addEventListener('click', function(){
      const cle = walletState && walletState.idKey;
      if(!cle) return;
      const fait = function(){
        idKeyCopy.textContent = '✅ Voadika';
        setTimeout(function(){ idKeyCopy.textContent = '📋 Adikao'; }, 1500);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(cle).then(fait, function(){ window.prompt('ID KEY', cle); });
      } else {
        window.prompt('ID KEY', cle);
      }
    });
  }
  // Créer / modifier sa propre ID KEY, ou l'effacer (retour à l'automatique).
  function cleEnregistrer(valeur, message){
    const statusEl = document.getElementById('walletIdKeyStatus');
    statusEl.textContent = '…';
    return callWallet({ action: 'cle-modifier', cle: valeur }).then(function(res){
      if(walletState){ walletState.idKey = res.idKey; walletState.idKeyAuto = res.idKeyAuto; }
      document.getElementById('walletIdKeyForm').style.display = 'none';
      statusEl.textContent = message;
      renderWalletBalance();
    }, function(err){
      statusEl.textContent = '⚠️ ' + err.message;
    });
  }
  const idKeyEdit = document.getElementById('walletIdKeyEdit');
  if(idKeyEdit){
    idKeyEdit.addEventListener('click', function(){
      const form = document.getElementById('walletIdKeyForm');
      const input = document.getElementById('walletIdKeyInput');
      form.style.display = 'block';
      input.value = walletState && !walletState.idKeyAuto ? (walletState.idKey || '') : '';
      input.focus();
    });
    document.getElementById('walletIdKeyCancel').addEventListener('click', function(){
      document.getElementById('walletIdKeyForm').style.display = 'none';
      document.getElementById('walletIdKeyStatus').textContent = '';
    });
    document.getElementById('walletIdKeySave').addEventListener('click', function(){
      const valeur = document.getElementById('walletIdKeyInput').value.trim().toUpperCase();
      if(!valeur){ document.getElementById('walletIdKeyStatus').textContent = 'Soraty ny ID KEY tianao.'; return; }
      cleEnregistrer(valeur, '✅ Voatahiry ny ID KEY-nao.');
    });
    document.getElementById('walletIdKeyDelete').addEventListener('click', function(){
      if(!window.confirm('Hofafana ny ID KEY noforoninao ?\nHisy ID KEY automatique vaovao hisolo azy.')) return;
      cleEnregistrer('', '🗑️ Voafafa ; ID KEY automatique vaovao no misy.');
    });
  }
  const transfertMontant = document.getElementById('transfertMontant');
  if(transfertMontant) transfertMontant.addEventListener('input', transfertCalculer);
  // Qui va recevoir : vérifié quand on s'arrête de taper, pour ne pas
  // envoyer à une clef mal recopiée. Une clef peut être choisie par son
  // propriétaire : sa longueur ne dit donc plus qu'elle est entière.
  const transfertCle = document.getElementById('transfertCle');
  let transfertCleVue = '';
  let transfertCleAttente = null;
  if(transfertCle){
    transfertCle.addEventListener('input', function(){
      const qui = document.getElementById('transfertQui');
      const brut = transfertCle.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      clearTimeout(transfertCleAttente);
      if(brut.length < 4){ qui.textContent = ''; transfertCleVue = ''; return; }
      if(brut === transfertCleVue) return;
      transfertCleVue = brut;
      qui.textContent = 'Jerena…';
      transfertCleAttente = setTimeout(function(){ chercherCle(brut, qui); }, 600);
    });
  }
  function chercherCle(brut, qui){
      if(transfertCleVue !== brut) return;
      callWallet({ action: 'cle', cle: brut }).then(function(res){
        if(transfertCleVue !== brut) return;
        qui.textContent = '✅ ' + res.cle + (res.nom ? ' — ' + res.nom : ' — wallet hita');
      }, function(err){
        if(transfertCleVue !== brut) return;
        qui.textContent = '⚠️ ' + err.message;
      });
  }
  const transfertBtn = document.getElementById('transfertBtn');
  if(transfertBtn){
    transfertBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('transfertStatus');
      const cle = document.getElementById('transfertCle').value.trim();
      const montant = Math.floor(Number(document.getElementById('transfertMontant').value) || 0);
      const note = document.getElementById('transfertNote').value.trim();
      if(!cle){ statusEl.textContent = 'Ampidiro ny ID KEY an\'ilay handray.'; return; }
      if(!(montant > 0)){ statusEl.textContent = 'Ampidiro ny vola halefa.'; return; }
      const total = montant + transfertFrais(montant);
      if(total > ((walletState && walletState.papiAr) || 0)){
        statusEl.textContent = 'Tsy ampy ny vola tena izy : ' + formatWalletAr(total) + ' no ilaina (frais tafiditra).';
        return;
      }
      if(!window.confirm('Hamindra ' + formatWalletAr(montant) + ' any amin\'ny ' + cle.toUpperCase() +
        ' ?\nFrais : ' + formatWalletAr(total - montant) + '. Tsy azo averina intsony.')) return;
      transfertBtn.disabled = true;
      statusEl.textContent = 'Afindra…';
      callWallet({ action: 'transfert', cle: cle, amountAr: montant, note: note }).then(function(res){
        transfertBtn.disabled = false;
        ['transfertCle', 'transfertMontant', 'transfertNote'].forEach(function(id){
          document.getElementById(id).value = '';
        });
        document.getElementById('transfertQui').textContent = '';
        transfertCleVue = '';
        statusEl.textContent = '✅ Lasa ' + formatWalletAr(montant) + ' any amin\'ny ' + (res.cle || cle) + '.';
        pushNotification('parrainage', 'Famindrana : ' + formatWalletAr(montant) + ' → ' + (res.cle || cle) + '.');
        refreshWalletFromServer();
      }, function(err){
        transfertBtn.disabled = false;
        statusEl.textContent = err.message;
      });
    });
  }

  // Les devises de l'achat sont celles de « Voir dans une autre devise » :
  // recopiées de ce menu-là, elles ne peuvent pas diverger. Une devise
  // s'ajoute donc à un seul endroit (ny-asako.html, #walletCurrency).
  const etrangerDevise = document.getElementById('etrangerDevise');
  const walletCurrencySel = document.getElementById('walletCurrency');
  let etrangerTaux = 1;
  function etrangerEstimer(){
    const enAr = document.getElementById('etrangerEnAr');
    if(!enAr || !etrangerDevise) return;
    const prix = Number(document.getElementById('etrangerPrix').value) || 0;
    const devise = etrangerDevise.value;
    if(devise === 'MGA' || !prix){ enAr.textContent = ''; return; }
    enAr.textContent = etrangerTaux > 0
      ? '≈ ' + formatWalletAr(Math.ceil(prix / etrangerTaux)) + ' (taux du jour, voafaritry ny serveur)'
      : 'Taux ' + devise + ' tsy hita androany.';
  }
  if(etrangerDevise && walletCurrencySel){
    etrangerDevise.innerHTML = walletCurrencySel.innerHTML;
    etrangerDevise.value = 'MGA';
    etrangerDevise.addEventListener('change', function(){
      const devise = etrangerDevise.value;
      etrangerTaux = 1;
      document.getElementById('etrangerPrix').step = devise === 'MGA' ? '1000' : 'any';
      if(devise === 'MGA'){ etrangerEstimer(); return; }
      document.getElementById('etrangerEnAr').textContent = '…';
      callWallet({ action: 'rate', currency: devise }).then(function(res){
        if(etrangerDevise.value !== devise) return;
        etrangerTaux = res.rate || 0;
        etrangerEstimer();
      }, function(){ etrangerTaux = 0; etrangerEstimer(); });
    });
    document.getElementById('etrangerPrix').addEventListener('input', etrangerEstimer);
  }
  const etrangerBtn = document.getElementById('etrangerBtn');
  if(etrangerBtn){
    etrangerBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('etrangerStatus');
      const lien = document.getElementById('etrangerLien').value.trim();
      const devise = etrangerDevise ? etrangerDevise.value : 'MGA';
      const saisi = Number(document.getElementById('etrangerPrix').value) || 0;
      // En ariary ici seulement pour vérifier d'avance ; le serveur refait
      // le compte au taux du jour.
      const prix = devise === 'MGA' ? Math.floor(saisi) : (etrangerTaux > 0 ? Math.ceil(saisi / etrangerTaux) : 0);
      const adresse = document.getElementById('etrangerAdresse').value.trim();
      const consigne = document.getElementById('etrangerConsigne').value.trim();
      if(!/^https?:\/\//i.test(lien)){ statusEl.textContent = 'Apetaho ny rohin\'ilay entana (https://…).'; return; }
      if(!(saisi > 0)){ statusEl.textContent = 'Ampidiro ny vidiny.'; return; }
      if(!(prix > 0)){ statusEl.textContent = 'Tsy hita ny taux ' + devise + ' androany. Andramo indray.'; return; }
      if(!adresse){ statusEl.textContent = 'Ampidiro ny adiresy fandefasana.'; return; }
      const vola = (walletState && walletState.papiAr) || 0;
      if(prix > vola){
        statusEl.textContent = 'Tsy ampy ny vola tena izy : ' + formatWalletAr(vola) + ' no misy, ' +
          formatWalletAr(prix) + ' no ilaina. Ampidiro vola amin\'ny Mobile Money aloha.';
        return;
      }
      etrangerBtn.disabled = true;
      statusEl.textContent = 'Alefa ny fangatahana…';
      callWallet({
        action: 'payout', amountAr: devise === 'MGA' ? prix : 0, prixDevise: saisi,
        method: 'merchant', currency: devise,
        destination: adresse, link: lien, instructions: consigne,
        name: (currentUser && currentUser.name) || ''
      }).then(function(res){
        etrangerBtn.disabled = false;
        const tena = (res && res.payout && res.payout.amount_ar) || prix;
        ['etrangerLien', 'etrangerPrix', 'etrangerConsigne'].forEach(function(id){
          document.getElementById(id).value = '';
        });
        etrangerEstimer();
        statusEl.textContent = 'Voaray ny fangatahana : ' + formatWalletAr(tena) +
          (devise !== 'MGA' ? ' (' + saisi.toLocaleString('fr-FR') + ' ' + devise + ')' : '') +
          ' voatazona amin\'ny vola tena izy. Ny tompony no mividy ilay entana ; hampandrenesina ianao.';
        pushNotification('parrainage', 'Fividianana any ivelany : ' + formatWalletAr(tena) + '.');
        refreshWalletFromServer();
      }, function(err){
        etrangerBtn.disabled = false;
        statusEl.textContent = err.message;
      });
    });
  }

  // ---- Côté propriétaire : la file des retraits à envoyer ----
  function renderPayoutQueue(){
    const panel = document.getElementById('walletQueuePanel');
    const list = document.getElementById('walletQueueList');
    const empty = document.getElementById('walletQueueEmpty');
    if(!panel || !list || !walletState) return;
    if(!walletState.isOwner){ panel.style.display = 'none'; return; }

    // Vide, la file n'a rien à dire : elle ne paraît que s'il y a à envoyer.
    const rows = walletState.queue || [];
    panel.style.display = rows.length ? 'block' : 'none';
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    notifyNewPayoutRequests(rows);
    rows.forEach(function(r){
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.8rem 0.9rem; margin-bottom:0.7rem; background:var(--panel-2);';
      const arrivee = r.amount_out && r.currency && r.currency !== 'MGA'
        ? Number(r.amount_out).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + r.currency
        : formatWalletAr(r.amount_ar);
      card.innerHTML =
        '<div style="font-size:0.86rem; color:var(--text);"><strong>' + escapeHtml(r.name || r.email) + '</strong></div>' +
        '<div style="font-size:0.78rem; color:var(--muted); line-height:1.7; margin-top:0.3rem;">' +
          'Email : ' + escapeHtml(r.email) + '<br>' +
          'Retrait : <strong style="color:var(--text);">' + formatWalletAr(r.amount_ar) + '</strong>' +
          ' → à envoyer : <strong style="color:var(--cyan);">' + escapeHtml(arrivee) + '</strong><br>' +
          'Par : ' + escapeHtml(payoutMethodLabel(r.method)) + '<br>' +
          (r.kind === 'purchase' ? 'Achat : ' : 'Vers : ') + '<strong style="color:var(--text);">' + escapeHtml(r.destination) + '</strong><br>' +
          (r.link ? 'Lien : <a href="' + escapeHtml(r.link) + '" target="_blank" rel="noopener" style="color:var(--cyan);">ouvrir</a><br>' : '') +
          (r.instructions ? 'Marche à suivre : <strong style="color:var(--text);">' + escapeHtml(r.instructions) + '</strong><br>' : '') +
          'Demandé le : ' + new Date(r.created_at).toLocaleString('fr-FR') +
        '</div>';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.7rem;';

      const sentBtn = document.createElement('button');
      sentBtn.type = 'button';
      sentBtn.className = 'btn btn-primary btn-sm';
      sentBtn.style.width = 'auto';
      // Au premier coup d'œil, « Argent envoyé » se lit comme un ordre — et
      // l'on croit que l'application va envoyer. Elle n'envoie rien : ce
      // bouton ne fait que consigner ce que la personne a fait de ses mains.
      // À la première personne, il ne peut plus se lire autrement.
      sentBtn.textContent = '✅ Efa nalefako an-tanana';
      sentBtn.addEventListener('click', function(){
        if(!confirm('Efa nalefanao TENA ve ny ' + arrivee + ' ho any amin\'ny ' + r.destination + ' ?\n\n' +
          'Ity bokotra ity dia tsy mandefa vola : manamarina fotsiny izy fa efa nataonao.')) return;
        settlePayout(r.id, 'sent', '', sentBtn);
      });

      const refuseBtn = document.createElement('button');
      refuseBtn.type = 'button';
      refuseBtn.className = 'btn btn-red btn-sm';
      refuseBtn.style.width = 'auto';
      refuseBtn.textContent = '✖ Refuser';
      refuseBtn.addEventListener('click', function(){
        const note = prompt('Pourquoi refusez-vous ce retrait ? (le client le verra)');
        if(note === null) return;
        settlePayout(r.id, 'refused', note, refuseBtn);
      });

      actions.appendChild(sentBtn);
      actions.appendChild(refuseBtn);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function settlePayout(id, decision, note, btn){
    btn.disabled = true;
    callWallet({ action: 'settle', id: id, decision: decision, note: note }).then(function(){
      pushNotification('parrainage', decision === 'sent'
        ? 'Retrait marqué comme envoyé — le client en est prévenu.'
        : 'Retrait refusé — son solde lui a été rendu.');
      refreshWalletFromServer();
    }, function(err){
      btn.disabled = false;
      alert(err.message);
    });
  }

  // ---- Acheter dans l'application avec le portefeuille ----
  // L'abonnement se règle depuis le solde : rien ne sort, rien à demander à
  // personne, et le droit est acquis sur-le-champ. C'est le serveur qui tient
  // les prix : dans la page, chacun pourrait s'abonner pour un ariary.
  function refreshPaywallWallet(){
    const soldeEl = document.getElementById('paywallWalletBalance');
    if(!soldeEl) return;
    soldeEl.textContent = '…';
    const sub = ensureInstallDate();
    callWallet({ action: 'state', installId: sub.id }).then(function(state){
      walletState = state;
      soldeEl.textContent = 'Vola Papi : ' + formatWalletAr(state.papiAr || 0);
      majBoutonAbonnement();
    }, function(err){
      soldeEl.textContent = '—';
      const st = document.getElementById('paywallWalletStatus');
      if(st) st.textContent = 'Solde indisponible : ' + err.message;
    });
  }

  // Le même achat, depuis la page Portefeuille. Une seule voie côté serveur :
  // deux endroits pour la déclencher, un seul endroit qui décide du prix.
  function buySiteItem(item, statusEl, btn){
    if(btn) btn.disabled = true;
    if(statusEl) statusEl.textContent = 'Paiement en cours…';
    return callWallet({ action: 'spend', item: item, name: (currentUser && currentUser.name) || '' })
      .then(function(res){
        if(btn) btn.disabled = false;
        // Le serveur dit ce qui a été acheté ; c'est ici qu'on l'applique.
        const sub = ensureInstallDate();
        let detail = '';
        if(res.days > 0){
          // Les jours mis de côté s'ajoutent à l'abonnement.
          const bankedDays = sub.subscriptionCreditDays || 0;
          const days = res.days + bankedDays;
          sub.plan = item === 'sub_year' ? 'annuel' : 'mensuel';
          sub.paidUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          sub.subscriptionCreditDays = 0;
          detail = ', actif pour ' + days + ' jours';
        } else if(res.grant === 'trial_day'){
          sub.bonusDays = (sub.bonusDays || 0) + 1;
          detail = ' : un jour de plus sur votre essai';
        } else if(res.grant === 'booster'){
          sub.boosterActiveUntil = new Date(Date.now() + WALLET_BOOSTER_HOURS * 60 * 60 * 1000).toISOString();
          detail = ' : direct Facebook ouvert pour ' + WALLET_BOOSTER_HOURS + ' h';
        } else if(res.grant === 'sub_days'){
          sub.subscriptionCreditDays = (sub.subscriptionCreditDays || 0) + WALLET_SUB_DAYS;
          detail = ' : ' + WALLET_SUB_DAYS + ' jours mis de côté pour votre prochain abonnement';
        } else if(res.grant === 'unlock'){
          detail = ' : accès rétabli';
        }
        saveSubscription(sub);
        majPageAbonnement();
        if(typeof renderWallet === 'function') renderWallet();
        if(statusEl){
          statusEl.textContent = res.label + ' réglé : ' + formatWalletAr(res.priceAr) +
            ' retirés de votre portefeuille' + detail + '.';
        }
        pushNotification('parrainage', res.label + ' payé avec votre portefeuille (' +
          formatWalletAr(res.priceAr) + ').');
        return res;
      }, function(err){
        if(btn) btn.disabled = false;
        if(statusEl) statusEl.textContent = err.message;
        throw err;
      });
  }

  document.querySelectorAll('.buy-site-item').forEach(function(btn){
    btn.addEventListener('click', function(){
      const statusEl = document.getElementById('walletBuyStatus');
      payerAbonnement(btn.getAttribute('data-item'), statusEl, btn, function(){ refreshWalletFromServer(); });
    });
  });

  // ---- L'abonnement se paie en vrai argent, par Papi ----
  // Si l'argent déjà versé par Papi suffit, l'abonnement part de là ; sinon on ouvre Papi
  // pour la somme qui manque, et l'abonnement se règle tout seul au retour
  // (papi-paiement.js). Les prix ne sont ici que pour l'affichage : c'est le
  // serveur qui les tient.
  const PRIX_ABONNEMENT = { sub_month: 15000, sub_year: 150000, sub_days: 20000, parrainage: 5000 };
  const FRAIS_DEPOT_PCT = 5;
  // Ce qu'il faut payer chez Papi pour que, frais ôtés, « net » arrive au solde.
  function brutPourNet(net){
    let b = Math.max(300, Math.ceil(net * 100 / (100 - FRAIS_DEPOT_PCT)));
    while(b - Math.ceil(b * FRAIS_DEPOT_PCT / 100) < net) b++;
    return b;
  }
  function manquePour(item){
    const papi = (walletState && walletState.papiAr) || 0;
    return Math.max(0, (PRIX_ABONNEMENT[item] || 0) - papi);
  }
  function majBoutonAbonnement(){
    const btn = document.getElementById('paywallWalletBtn');
    if(!btn) return;
    const item = selectedPlan === 'annuel' ? 'sub_year' : 'sub_month';
    const manque = manquePour(item);
    btn.textContent = manque > 0
      ? '📲 Payer ' + formatWalletAr(brutPourNet(manque)) + ' par Papi'
      : '💰 Payer avec mon argent Papi';
  }
  function payerAbonnement(item, statusEl, btn, apres){
    const manque = manquePour(item);
    if(manque > 0){
      if(typeof window.papiPayerAbonnement !== 'function'){
        if(statusEl) statusEl.textContent = 'Papi indisponible : rechargez la page.';
        return;
      }
      if(btn) btn.disabled = true;
      window.papiPayerAbonnement(item, brutPourNet(manque), statusEl, function(){ if(btn) btn.disabled = false; });
      return;
    }
    buySiteItem(item, statusEl, btn).then(apres || function(){}, function(){});
  }
  // « Inviter des amis » paie le Parrainage par ici (inviter.js).
  window.__payerSiteItem = payerAbonnement;

  const paywallWalletBtn = document.getElementById('paywallWalletBtn');
  if(paywallWalletBtn){
    paywallWalletBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('paywallWalletStatus');
      const item = selectedPlan === 'annuel' ? 'sub_year' : 'sub_month';
      payerAbonnement(item, statusEl, paywallWalletBtn, function(){ openApp(); });
    });
  }

  // Une demande de retrait qui dort sans que le propriétaire le sache, c'est
  // quelqu'un qui attend son argent pour rien.
  const PAYOUT_QUEUE_SEEN_KEY = 'stockmanager_payout_queue_seen';
  function notifyNewPayoutRequests(rows){
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(PAYOUT_QUEUE_SEEN_KEY)) || []; } catch(e){}
    const fresh = (rows || []).filter(function(r){ return seen.indexOf(r.id) < 0; });
    if(!fresh.length) return;
    fresh.forEach(function(r){
      pushNotification('parrainage', '💸 ' + (r.name || r.email) + ' nanao retrait : ' +
        formatWalletAr(r.amount_ar) + ' · ' + payoutMethodLabel(r.method) +
        ' — miandry anao.');
    });
    try {
      localStorage.setItem(PAYOUT_QUEUE_SEEN_KEY,
        JSON.stringify(fresh.map(function(r){ return r.id; }).concat(seen).slice(0, 200)));
    } catch(e){}
  }

  // Le client peut avoir fermé la page entre la demande et l'envoi : à la
  // réouverture, on lui dit ce qui s'est passé pendant son absence.
  // ---- L'ARGENT QUI ENTRE PENDANT QU'ON DORT ----
  // Les personnes qui découvrent le site créditent le portefeuille du
  // propriétaire depuis LEUR téléphone : il n'est pas là pour le voir passer.
  // Il l'apprend donc en ouvrant l'application, comme il apprend les demandes
  // de déblocage et les alertes de sécurité.
  //
  // Le nombre annoncé vient des vingt derniers versements que le serveur
  // renvoie ; le solde, lui, est toujours juste. Entre deux ouvertures très
  // espacées, le premier peut donc dire moins que le second — c'est pourquoi
  // le message porte les deux.
  const VISITEURS_VUS_KEY = 'stockmanager_depots_visiteurs_vus';
  const VISITEURS_AMORCE_KEY = 'stockmanager_depots_visiteurs_amorce';

  function annoncerLesVisiteurs(state){
    const rows = ((state && state.deposits) || []).filter(function(d){
      return d.provider === 'visiteur';
    });
    let vus = [];
    try { vus = JSON.parse(localStorage.getItem(VISITEURS_VUS_KEY)) || []; } catch(e){}
    let amorce = false;
    try { amorce = localStorage.getItem(VISITEURS_AMORCE_KEY) === '1'; } catch(e){}
    const frais = rows.filter(function(d){ return vus.indexOf(d.id) < 0; });

    // Au tout premier passage on ne remonte pas l'historique : on note
    // seulement où l'on en est. C'est le passage suivant qui annonce — et si
    // ce premier passage ne trouve rien, la toute première personne comptera.
    if(amorce && frais.length){
      const somme = frais.reduce(function(t, d){ return t + (Number(d.amount_ar) || 0); }, 0);
      ajouterNotificationLocale('parrainage',
        frais.length + ' personne' + (frais.length > 1 ? 's' : '') +
        ' de plus ' + (frais.length > 1 ? 'ont' : 'a') + ' ouvert le site : ' + formatWalletAr(somme) +
        ' dans votre portefeuille. Solde : ' + formatWalletAr(state.balanceAr) + '.');
    }
    try {
      localStorage.setItem(VISITEURS_AMORCE_KEY, '1');
      if(frais.length){
        localStorage.setItem(VISITEURS_VUS_KEY, JSON.stringify(
          frais.map(function(d){ return d.id; }).concat(vus).slice(0, 200)));
      }
    } catch(e){}
  }

  // Ce qui est arrivé au portefeuille pendant l'absence, demandé une fois à
  // l'ouverture de l'application — et non quand on passe par la page
  // Portefeuille, où l'on ne va justement que si l'on se doute de quelque
  // chose.
  //
  // Les deux côtés y trouvent leur compte, dans le même appel :
  //   — celui qui a demandé un retrait apprend qu'il est parti, ou refusé ;
  //   — le propriétaire apprend qu'on lui en demande un, et ce que les
  //     nouveaux venus ont versé.
  function verifierLePortefeuille(){
    if(!(currentUser && currentUser.email)) return;
    const sub = ensureInstallDate();
    const lireLEtat = function(){
      callWallet({ action: 'state', installId: sub.id }).then(function(state){
        walletState = state;
        notifySettledPayouts(state.payouts);
        if(state.isOwner){
          annoncerLesVisiteurs(state);
          notifyNewPayoutRequests(state.queue || []);
        }
      }, function(){});
    };
    lireLEtat();
  }

  const PAYOUT_SEEN_KEY = 'stockmanager_payouts_seen';
  const PAYOUT_AMORCE_KEY = 'stockmanager_payouts_amorce';
  function notifySettledPayouts(rows){
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(PAYOUT_SEEN_KEY)) || []; } catch(e){}
    let amorce = false;
    try { amorce = localStorage.getItem(PAYOUT_AMORCE_KEY) === '1'; } catch(e){}
    try { localStorage.setItem(PAYOUT_AMORCE_KEY, '1'); } catch(e){}
    const fresh = (rows || []).filter(function(r){
      return r.status !== 'pending' && seen.indexOf(r.id) < 0;
    });
    if(!fresh.length) return;
    // Au tout premier passage on ne remonte pas l'historique entier. C'est un
    // drapeau à part qui le retient, et non la liste des retraits vus : sans
    // lui, une première ouverture sans aucun retrait aurait fait manquer le
    // tout premier — celui qui compte.
    if(amorce){
      fresh.forEach(function(r){
        // « sent » ne veut plus dire « l'ordre est parti » mais « la somme est
        // arrivée » : c'est la vérification chez le fournisseur qui le pose.
        // Le mot doit dire cela, et pas autre chose.
        pushNotification('parrainage', r.status === 'sent'
          ? '✅ Tonga ny vola : ' + formatWalletAr(r.amount_ar) +
            ' tafapetraka tao amin\'ny ' + r.destination + '.'
          : '💸 Tsy lasa ny retrait nataonao : ' + formatWalletAr(r.amount_ar) +
            (r.note ? ' — ' + r.note : '') + '. Naverina ny solde.');
      });
    }
    try {
      localStorage.setItem(PAYOUT_SEEN_KEY,
        JSON.stringify(fresh.map(function(r){ return r.id; }).concat(seen).slice(0, 200)));
    } catch(e){}
  }

  function walletSignOut(){
    walletSession = null;
    saveWalletSession(null);
    renderWallet();
  }

  function renderWallet(){
    const authPanel = document.getElementById('walletAuthPanel');
    const content = document.getElementById('walletContent');
    if(!authPanel || !content) return;

    if(!walletSession || !walletSession.user){
      authPanel.style.display = 'block';
      content.style.display = 'none';
      return;
    }
    authPanel.style.display = 'none';
    content.style.display = 'block';

    const sub = ensureInstallDate();
    document.getElementById('walletVerifiedEmail').textContent = walletSession.user.email || '—';
    // Le solde en ariary vient du serveur : c'est lui qui fait foi. En
    // attendant sa réponse, l'estimation locale évite un écran vide.
    refreshWalletFromServer();


    const boosterPanel = document.getElementById('walletBoosterPanel');
    const boosterActive = sub.boosterActiveUntil && new Date(sub.boosterActiveUntil) > new Date();
    if(boosterPanel){
      boosterPanel.style.display = boosterActive ? 'block' : 'none';
      if(boosterActive){
        document.getElementById('walletBoosterUntil').textContent = new Date(sub.boosterActiveUntil).toLocaleString('fr-FR');
      }
    }

    const subCreditPanel = document.getElementById('walletSubCreditPanel');
    if(subCreditPanel){
      const days = sub.subscriptionCreditDays || 0;
      subCreditPanel.style.display = days > 0 ? 'block' : 'none';
      document.getElementById('walletSubCreditDays').textContent = days;
    }
  }

  // Traduit les erreurs Supabase les plus fréquentes, et affiche le message
  // d'origine pour tout le reste : sans cela on ne sait pas quoi corriger.
  function authErrorText(error){
    const raw = (error && (error.message || error.error_description)) || 'erreur inconnue';
    const low = raw.toLowerCase();
    if(low.indexOf('email not confirmed') >= 0){
      return 'Votre compte existe mais l\'email n\'est pas confirmé. Ouvrez le mail de confirmation, ' +
        'ou demandez au propriétaire de décocher « Confirm email » dans Supabase.';
    }
    if(low.indexOf('invalid login credentials') >= 0){
      return 'Email ou mot de passe incorrect.';
    }
    if(low.indexOf('signups not allowed') >= 0 || low.indexOf('signup is disabled') >= 0){
      return 'La création de compte est désactivée sur le serveur (Supabase > Authentication > ' +
        '« Allow new users to sign up »).';
    }
    if(low.indexOf('user already registered') >= 0 || low.indexOf('already been registered') >= 0){
      return 'Cet email possède déjà un compte.';
    }
    if(low.indexOf('password') >= 0 && low.indexOf('6') >= 0){
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    }
    if(low.indexOf('rate limit') >= 0 || low.indexOf('too many') >= 0){
      return 'Trop de tentatives : patientez quelques minutes.';
    }
    // Message du serveur, en anglais, quand deux demandes se suivent de trop près.
    const wait = raw.match(/after (\d+) seconds?/i);
    if(wait){
      return 'Une demande vient de partir : attendez ' + wait[1] + ' secondes avant de réessayer.';
    }
    return raw;
  }

  // ---------------- AUTHENTIFICATION SUPABASE ----------------
  // Le mot de passe n'est jamais conservé sur l'appareil : Supabase le garde
  // haché côté serveur et renvoie une session utilisable depuis n'importe quel
  // téléphone ou ordinateur. Sans Supabase (hors ligne, script bloqué), on
  // retombe sur l'ancien code d'accès local.
  function sbAuth(){
    return (window.__sb && window.__sb.auth) ? window.__sb.auth : null;
  }

  // Chaque nouvelle inscription part automatiquement chez le propriétaire :
  // il la retrouve dans Paramètres > « Nouvelles inscriptions » et dans son
  // admin du site. Le client, lui, entre directement, sans rien attendre.
  function recordNewSignup(name, email, phone){
    // Plus de panneau « Tongasoa ! » avec les canaux de l'admin (22/10/2026) :
    // chaque compte a désormais les siens (« 🔗 Ajouter les liens »).
    if(!window.__sb) return;
    const row = { name: name, email: normEmail(email), phone: phone || '' };
    try{
      window.__sb.from('client_signups').insert(row).then(function(){}, function(){});
      window.__sb.from('contact_messages').insert({
        name: name + ' (nouvelle inscription)',
        email: normEmail(email),
        message: [
          'Nouvelle inscription à Ny asako :',
          '',
          'Nom : ' + name,
          'Email : ' + normEmail(email),
          'Téléphone : ' + (phone || '—'),
          'Date : ' + new Date().toLocaleString('fr-FR'),
          '',
          'Destinataire : ' + OWNER_NAME + ' — ' + OWNER_EMAIL
        ].join('\n')
      }).then(function(){}, function(){});
    }catch(e){}
  }

  // ---------------- APPAREIL DU PROPRIÉTAIRE ----------------
  // Après une connexion réussie du propriétaire, l'appareil est marqué comme
  // sien. Sur cet appareil seulement, un code oublié n'enferme plus dehors :
  // un code de secours s'affiche aussitôt et rouvre l'accès, sans paiement ni
  // attente. Sur un appareil inconnu, il faut passer par le lien email.
  const OWNER_DEVICE_KEY = 'stockmanager_owner_device';
  const OWNER_RESCUE_KEY = 'stockmanager_owner_rescue';
  const OWNER_RESCUE_LOG = 'stockmanager_owner_rescue_log';
  const RESCUE_VALID_MS = 30 * 60 * 1000;

  function isOwnerEmail(email){
    // L'espace du propriétaire ne s'ouvre jamais par un lien d'employé.
    if(MODE_MPIASA) return false;
    return normEmail(email) === normEmail(OWNER_EMAIL);
  }
  function markOwnerDevice(){
    try { localStorage.setItem(OWNER_DEVICE_KEY, new Date().toISOString()); } catch(e){}
  }
  function isOwnerDevice(){
    try { return !!localStorage.getItem(OWNER_DEVICE_KEY); } catch(e){ return false; }
  }
  function loadRescue(){
    try { return JSON.parse(localStorage.getItem(OWNER_RESCUE_KEY)) || null; } catch(e){ return null; }
  }
  function saveRescue(entry){
    try { localStorage.setItem(OWNER_RESCUE_KEY, JSON.stringify(entry)); } catch(e){}
  }
  function clearRescue(){
    try { localStorage.removeItem(OWNER_RESCUE_KEY); } catch(e){}
  }
  function logRescue(event){
    let list = [];
    try { list = JSON.parse(localStorage.getItem(OWNER_RESCUE_LOG)) || []; } catch(e){}
    list.unshift({ event: event, date: new Date().toLocaleString('fr-FR') });
    try { localStorage.setItem(OWNER_RESCUE_LOG, JSON.stringify(list.slice(0, 30))); } catch(e){}
  }

  // Génère et affiche un code de secours (propriétaire, appareil reconnu).
  function offerOwnerRescueCode(){
    const code = String(Math.floor(100000 + Math.random() * 900000));
    return sha256Hex(normEmail(OWNER_EMAIL) + ':' + code).then(function(hash){
      saveRescue({ hash: hash, expiresAt: Date.now() + RESCUE_VALID_MS });
      logRescue('Code de secours affiché');
      const status = document.getElementById('quickLoginStatus');
      if(status){
        status.innerHTML = 'Code oublié — vous êtes sur votre appareil habituel.<br>' +
          'Code de secours : <strong style="color:var(--cyan); font-family:var(--font-mono); font-size:1.1rem; letter-spacing:0.15em;">' +
          code + '</strong><br>Saisissez-le ci-dessus à la place du mot de passe (valable 30 minutes).';
      }
      return code;
    });
  }

  // Vérifie le code de secours saisi à la place du mot de passe.
  function tryOwnerRescueCode(email, code){
    if(!isOwnerEmail(email) || !isOwnerDevice()) return Promise.resolve(false);
    const entry = loadRescue();
    if(!entry || !entry.hash) return Promise.resolve(false);
    if(entry.expiresAt && Date.now() > entry.expiresAt){ clearRescue(); return Promise.resolve(false); }
    return sha256Hex(normEmail(OWNER_EMAIL) + ':' + String(code).trim()).then(function(hash){
      if(hash !== entry.hash) return false;
      clearRescue();
      logRescue('Accès rouvert avec le code de secours');
      const profile = findProfileByEmail(OWNER_EMAIL) || {
        name: OWNER_NAME, email: OWNER_EMAIL, phone: OWNER_PHONE,
        logo: null, company: '', nif: '', stat: ''
      };
      loginFromProfile(profile);
      return true;
    });
  }

  function profileFromAuthUser(user){
    const meta = (user && user.user_metadata) || {};
    const email = (user && user.email) || '';
    const local = findProfileByEmail(email) || {};
    return {
      // full_name : le nom donné par Google ; user_name : le pseudo GitHub,
      // quand le compte n'a pas mis de nom.
      name: meta.name || meta.full_name || local.name || meta.user_name || meta.preferred_username || email.split('@')[0],
      email: email,
      phone: meta.phone || local.phone || '',
      // Le logo suit le compte : sans la copie du serveur, une facture éditée
      // depuis un autre téléphone ou après un vidage du navigateur sortait
      // sans logo, alors qu'il s'affichait toujours dans le profil d'origine.
      logo: local.logo || meta.logo || null,
      company: meta.company || local.company || '',
      nif: meta.nif || local.nif || '',
      stat: meta.stat || local.stat || '',
      // Le lien Maps de l'endroit où se trouve le client (Paramètres).
      maps: meta.maps || local.maps || ''
    };
  }

  // Le logo ne va plus dans les informations du compte. Supabase recopie ces
  // informations dans le jeton de connexion, et ce jeton part dans l'en-tête
  // de chaque requête : avec un logo dedans, il atteignait 33 000 caractères,
  // et la passerelle des fonctions refusait la requête avant même de
  // l'exécuter — la demande d'accès à l'Administratif ne partait jamais. Le
  // logo reste sur l'appareil (profil local) ; null efface l'ancienne copie.
  function logoForServer(){
    return null;
  }

  // Ouvre l'application pour un utilisateur authentifié par Supabase.
  // Referme l'application et ramène à l'écran de connexion avec un message :
  // sert quand un compte se révèle bloqué alors qu'il vient de s'ouvrir.
  // Compteur de session : une ouverture d'application lancée avant une
  // fermeture forcée ne doit pas rouvrir la porte en arrivant en retard.
  let loginEpoch = 0;

  function forceSignOut(message){
    loginEpoch += 1;
    if(typeof teardownRealtimeFeatures === 'function') teardownRealtimeFeatures();
    const auth = sbAuth();
    if(auth) auth.signOut().then(function(){}, function(){});
    clearSession();
    currentUser = null; porterLeNomDuCompte();
    appScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    showLoginMode('quick');
    const status = document.getElementById('quickLoginStatus');
    if(status) status.textContent = message || '';
    setLoginStatus(message || '');
  }

  // Un compte signalé puis bloqué ne s'ouvre plus : on vérifie avant d'entrer.
  function openAppForAuthUser(user, opts){
    const email = (user && user.email) || '';
    const epoch = loginEpoch;
    if(typeof isAccountBlocked !== 'function' || isOwnerEmail(email)){
      openAppForAuthUserNow(user, opts);
      return;
    }
    isAccountBlocked(email).then(function(blocked){
      if(epoch !== loginEpoch) return;   // une fermeture forcée est passée entre-temps
      if(!blocked){
        openAppForAuthUserNow(user, opts);
        if(typeof clearFailedAttempts === 'function') clearFailedAttempts(email);
        return;
      }
      const status = document.getElementById('quickLoginStatus');
      const message = 'Ce compte est bloqué : ' + (blocked.reason || 'activité suspecte') +
        '. Contactez ' + OWNER_EMAIL + ' pour le rétablir.';
      if(status) status.textContent = message;
      setLoginStatus(message);
    }, function(){ openAppForAuthUserNow(user, opts); });
  }

  function openAppForAuthUserNow(user, opts){
    currentUser = profileFromAuthUser(user);
    saveLastEmail(currentUser.email);
    // Un logo encore rangé dans le compte alourdit le jeton de chaque requête
    // (voir logoForServer). On l'a déjà pris dans currentUser — il sera gardé
    // sur l'appareil juste en dessous — puis on le retire du compte et on
    // demande un jeton neuf, allégé.
    const serverLogo = ((user && user.user_metadata) || {}).logo;
    if(serverLogo){
      const auth = sbAuth();
      if(auth) auth.updateUser({ data: { logo: null } }).then(function(res){
        if(res && !res.error && auth.refreshSession) return auth.refreshSession();
      }).then(function(){}, function(){});
    }
    if(isOwnerEmail(currentUser.email)) markOwnerDevice();
    // cache local (le logo reste sur l'appareil, il n'est pas envoyé au serveur)
    upsertProfile(currentUser.name, {
      name: currentUser.name, email: currentUser.email, phone: currentUser.phone,
      logo: currentUser.logo, company: currentUser.company,
      nif: currentUser.nif, stat: currentUser.stat, accessCode: ''
    });
    const logins = loadLogins();
    logins.unshift({ name: currentUser.name, email: currentUser.email, phone: currentUser.phone, date: new Date().toLocaleString('fr-FR') });
    saveLogins(logins);
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserEmail').textContent = currentUser.email;
    saveSession();
    prendreLaPhotoDuCompte(user);
    envoyerAffiliation();
    if(getSubscriptionStatus().status === 'expired'){
      openPaywall();
    } else {
      openApp();
      ouvrirSurLAccueil();
    }
  }

  // Un compte ouvert par Google, Facebook ou GitHub arrive avec sa photo
  // (avatar_url) : elle devient la photo du profil, sans rien avoir à choisir.
  // On la recopie sur l'appareil, comme une photo choisie à la main — le lien
  // de Facebook expire au bout de quelques jours. Une photo déjà mise par la
  // personne reste la sienne. Si le site de la photo refuse qu'on la recopie,
  // on garde son adresse : elle s'affiche quand même, et on réessaie à la
  // prochaine connexion.
  const TAILLE_PHOTO_COMPTE = 256;
  function prendreLaPhotoDuCompte(user){
    const meta = (user && user.user_metadata) || {};
    let url = meta.avatar_url || meta.picture || '';
    if(!url || !/^https:\/\//.test(url) || !currentUser) return;
    if(currentUser.logo && !/^https?:/.test(currentUser.logo)) return;
    // Google la donne en 96 pixels : on la demande plus grande.
    url = url.replace(/=s\d+-c$/, '=s' + TAILLE_PHOTO_COMPTE + '-c');
    const email = currentUser.email;
    function garder(logo){
      if(!currentUser || currentUser.email !== email) return;
      currentUser.logo = logo;
      upsertProfile(currentUser.name, { logo: logo });
      saveSession();
      if(typeof updateProfilePhotoPreview === 'function') updateProfilePhotoPreview(logo);
      if(typeof window.__envoyerMaPhoto === 'function') window.__envoyerMaPhoto();
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function(){
      try{
        const c = document.createElement('canvas');
        const cote = Math.min(img.width, img.height);
        const taille = Math.min(TAILLE_PHOTO_COMPTE, cote);
        c.width = taille; c.height = taille;
        c.getContext('2d').drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, taille, taille);
        garder(c.toDataURL('image/jpeg', 0.85));
      }catch(e){ garder(url); }
    };
    img.onerror = function(){ if(!currentUser.logo) garder(url); };
    img.src = url;
  }

  // ---------------- CONNEXION RAPIDE (email + code) ----------------
  const quickLoginForm = document.getElementById('quickLoginForm');
  const loginTitle = document.getElementById('loginTitle');
  const loginSub = document.getElementById('loginSub');

  function showLoginMode(mode){
    // D'abord refermer les options : elles rendent le titre d'avant, que la
    // suite remplace par celui du mode choisi.
    if(typeof plusOuvert === 'function') plusOuvert(false);
    const quick = mode === 'quick';
    if(quickLoginForm) quickLoginForm.style.display = quick ? 'block' : 'none';
    loginForm.style.display = quick ? 'none' : 'block';
    const backBtn = document.getElementById('showQuickLoginBtn');
    if(backBtn) backBtn.style.display = quick ? 'none' : 'block';
    if(loginTitle) loginTitle.textContent = quick ? 'Bon retour' : 'Connexion';
    if(loginSub){
      loginSub.textContent = quick
        ? 'Entrez votre email ou votre numéro de téléphone et votre mot de passe : la connexion se valide automatiquement.'
        : 'Première connexion : renseignez vos informations et choisissez un mot de passe pour créer votre compte.';
    }
    const status = document.getElementById('quickLoginStatus');
    if(status) status.textContent = '';
    if(quick){
      const emailField = document.getElementById('quickEmail');
      const known = loadLastEmail();
      if(emailField && !emailField.value && known) emailField.value = known;
    }
    const forgotWrap = document.getElementById('forgotWrap');
    if(forgotWrap) forgotWrap.style.display = quick ? 'block' : 'none';
    majGoogle();
    closeHelpBoxes();
  }
  // Google : dans « Bon retour », et à l'étape 1 de la création de compte
  // (plus loin, on a déjà choisi l'email).
  function majGoogle(){
    const googleWrap = document.getElementById('googleLoginWrap');
    if(!googleWrap) return;
    const quick = !!(quickLoginForm && quickLoginForm.style.display !== 'none');
    let etape = 1;
    try { etape = loginStep; } catch(e){}
    googleWrap.style.display = (quick || etape === 1) ? '' : 'none';
  }

  // Les deux dépannages sont indépendants : on n'en ouvre jamais deux à la fois.
  function closeHelpBoxes(except){
    ['resetBox', 'forgotBox'].forEach(function(id){
      if(id === except) return;
      const box = document.getElementById(id);
      if(box) box.style.display = 'none';
    });
    showHelpOnly(null);
  }

  // Un dépannage ouvert prend tout l'écran : la connexion et l'autre dépannage
  // disparaissent, et « Retour à la connexion » les ramène.
  function showHelpOnly(openId){
    const pairs = { resetBox: 'resetToggleBtn', forgotBox: 'forgotToggleBtn' };
    Object.keys(pairs).forEach(function(id){
      const btn = document.getElementById(pairs[id]);
      if(btn) btn.style.display = (!openId || openId === id) ? 'block' : 'none';
    });
    const back = document.getElementById('helpBackBtn');
    if(back) back.style.display = openId ? 'block' : 'none';
    if(openId && quickLoginForm) quickLoginForm.style.display = 'none';
  }
  function openHelpBox(id){
    const box = document.getElementById(id);
    const open = box.style.display === 'block';
    closeHelpBoxes();
    if(open){ if(quickLoginForm) quickLoginForm.style.display = 'block'; return false; }
    box.style.display = 'block';
    showHelpOnly(id);
    return true;
  }
  const helpBackBtn = document.getElementById('helpBackBtn');
  if(helpBackBtn) helpBackBtn.addEventListener('click', function(){ showLoginMode('quick'); });
  // « Autres options » : un seul bouton montre ou range les trois dépannages.
  const loginPlusBtn = document.getElementById('loginPlusBtn');
  // Appelée aussi par showLoginMode, parfois avant cette ligne : elle relit
  // le bouton elle-même.
  // Ouvertes, les options prennent la place de « Bon retour » : le titre
  // change, le formulaire s'efface, et le bouton ramène à la connexion.
  function plusOuvert(ouvert){
    const ecran = document.getElementById('loginScreen');
    const etait = !!(ecran && ecran.classList.contains('plus-ouvert'));
    if(ecran) ecran.classList.toggle('plus-ouvert', ouvert);
    const b = document.getElementById('loginPlusBtn');
    if(b){
      b.textContent = ouvert ? '← Retour à la connexion' : 'Autres options ▾';
      b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    }
    const titre = document.getElementById('loginTitle');
    const sous = document.getElementById('loginSub');
    if(ouvert && !etait){
      if(titre){ titre.dataset.avant = titre.textContent; titre.textContent = 'Autres options'; }
      if(sous){ sous.dataset.avant = sous.textContent; sous.textContent = 'Créer un autre compte, retrouver votre mot de passe ou débloquer votre compte.'; }
    } else if(!ouvert && etait){
      if(titre && titre.dataset.avant){ titre.textContent = titre.dataset.avant; delete titre.dataset.avant; }
      if(sous && sous.dataset.avant){ sous.textContent = sous.dataset.avant; delete sous.dataset.avant; }
    }
  }
  if(loginPlusBtn) loginPlusBtn.addEventListener('click', function(){
    plusOuvert(!document.getElementById('loginScreen').classList.contains('plus-ouvert'));
  });
  function refreshLoginMode(){
    // On ouvre toujours sur la première connexion (inscription) : c'est là que
    // la personne crée son compte. Celle qui en a déjà un bascule sur
    // « Bon retour » avec le bouton « J'ai déjà un compte ».
    showLoginMode('full');
  }

  const showFullLoginBtn = document.getElementById('showFullLoginBtn');
  if(showFullLoginBtn) showFullLoginBtn.addEventListener('click', function(){ showLoginMode('full'); });
  const showQuickLoginBtn = document.getElementById('showQuickLoginBtn');
  if(showQuickLoginBtn) showQuickLoginBtn.addEventListener('click', function(){ showLoginMode('quick'); });

  // ---------------- MOT DE PASSE OUBLIÉ (lien de réinitialisation) ----------------
  // Dépannage à part entière : le compte reste ouvert, seul le mot de passe est
  // perdu. Le lien n'arrive que dans la boîte mail du titulaire, personne d'autre
  // ne peut s'en servir. Rien à voir avec la demande de déblocage plus bas.
  const resetToggleBtn = document.getElementById('resetToggleBtn');
  if(resetToggleBtn){
    resetToggleBtn.addEventListener('click', function(){
      if(openHelpBox('resetBox')){
        const field = document.getElementById('resetEmail');
        const tape = document.getElementById('quickEmail').value.trim();
        const known = (tape.indexOf('@') >= 0 ? tape : '') || loadLastEmail();
        if(field && !field.value && known) field.value = known;
        if(field) field.focus();
      }
    });
  }

  // La fonction « owner-reset » fabrique le lien avec la clé de service et le
  // poste par Resend. En cas de pépin on retombe sur l'envoi de Supabase :
  // mieux vaut un message qui arrive peut-être qu'aucun message du tout.
  function sendOwnerResetLink(email, status){
    const auth = sbAuth();
    function fallback(reason){
      if(status) status.textContent = 'Envoi direct indisponible (' + reason + ') — nouvelle tentative…';
      auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
        .then(function(res){
          if(!status) return;
          if(res && res.error){ status.textContent = authErrorText(res.error); return; }
          status.textContent = codeSentText(email);
          showResetCodeBox();
        }, function(){
          if(status) status.textContent = 'Envoi impossible : vérifiez votre réseau.';
        });
    }

    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      fallback('fonction non déployée');
      return;
    }
    // Un refus de la fonction revient dans error.context, dont le corps porte
    // la vraie raison. Sans la lire, on se rabattait sur l'envoi de Supabase
    // qui répondait « attendez 59 secondes » — un message sans rapport avec le
    // problème, qui envoyait chercher la panne au mauvais endroit.
    function detailFromError(error){
      const ctx = error && error.context;
      if(!ctx || typeof ctx.json !== 'function') return Promise.resolve(null);
      return ctx.json().then(function(body){
        const text = [body && body.error, body && body.detail].filter(Boolean).join(' — ');
        // 429 : ce n'est pas un refus, c'est « attendez un peu ». Le dire tel
        // quel, sans en faire une panne.
        return text ? { text: text, wait: ctx.status === 429 } : null;
      }, function(){ return null; });
    }

    window.__sb.functions.invoke('owner-reset', { body: { email: email } })
      .then(function(res){
        const data = (res && res.data) || {};
        if(res && res.error && !data.sent){
          detailFromError(res.error).then(function(detail){
            if(detail){
              if(status) status.textContent = detail.wait
                ? detail.text
                : 'Envoi refusé : ' + String(detail.text).slice(0, 300);
              return;
            }
            fallback(res.error.message || 'erreur serveur');
          });
          return;
        }
        if(data.sent === false){
          // Le détail vient du service d'envoi : c'est lui qui dit pourquoi il
          // a refusé (adresse d'expéditeur non vérifiée, quota…). Le cacher
          // laisserait le propriétaire devant un « ça ne marche pas » muet.
          if(status) status.textContent = (data.error || 'Envoi refusé par le serveur.') +
            (data.detail ? ' — ' + String(data.detail).slice(0, 300) : '');
          return;
        }
        if(status) status.textContent = codeSentText(email);
        showResetCodeBox();
      }, function(err){
        fallback((err && err.message) || 'réseau');
      });
  }

  const sendResetLinkBtn = document.getElementById('sendResetLinkBtn');
  if(sendResetLinkBtn){
    sendResetLinkBtn.addEventListener('click', function(){
      const status = document.getElementById('resetStatus');
      const email = document.getElementById('resetEmail').value.trim();
      const auth = sbAuth();
      if(!email){ if(status) status.textContent = 'Indiquez d\'abord votre email.'; return; }
      if(!auth){ if(status) status.textContent = 'Serveur injoignable : réessayez une fois connecté à Internet.'; return; }
      if(status) status.textContent = 'Envoi du code…';

      // Le propriétaire passe par son propre service d'envoi : l'envoi intégré
      // de Supabase est trop limité pour être sûr, et lui, il ne peut pas se
      // permettre d'attendre un message qui n'arrive pas.
      if(isOwnerEmail(email)){
        sendOwnerResetLink(email, status);
        return;
      }

      auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
        .then(function(res){
          if(res && res.error){ if(status) status.textContent = authErrorText(res.error); return; }
          if(status) status.textContent = codeSentText(email);
          showResetCodeBox();
        }, function(){
          if(status) status.textContent = 'Envoi impossible : vérifiez votre réseau.';
        });
    });
  }

  function codeSentText(email){
    return 'Code envoyé à ' + email + '. Recopiez ci-dessous celui du plus récent de vos emails : ' +
      'il ne vaut qu\'une heure et ne sert qu\'une fois. Regardez aussi dans les indésirables.';
  }

  function showResetCodeBox(){
    const box = document.getElementById('resetCodeBox');
    if(!box) return;
    box.style.display = 'block';
    const field = document.getElementById('resetCode');
    if(field){ field.value = ''; field.focus(); }
  }

  // Le code reçu vaut une connexion le temps de changer le mot de passe :
  // verifyOtp ouvre la session, updateUser pose le nouveau mot de passe.
  let resetByCode = false;
  const resetCodeSaveBtn = document.getElementById('resetCodeSaveBtn');
  if(resetCodeSaveBtn){
    resetCodeSaveBtn.addEventListener('click', function(){
      const status = document.getElementById('resetCodeStatus');
      const email = document.getElementById('resetEmail').value.trim();
      // Les messageries glissent parfois des espaces dans le code copié.
      const token = document.getElementById('resetCode').value.replace(/\s+/g, '');
      const password = document.getElementById('resetNewPassword').value;
      const auth = sbAuth();
      if(!auth){ status.textContent = 'Serveur injoignable.'; return; }
      if(!email){ status.textContent = 'Indiquez d\'abord votre email.'; return; }
      if(!/^\d{6,10}$/.test(token)){ status.textContent = 'Recopiez le code à chiffres reçu par email.'; return; }
      if(password.length < 6){ status.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return; }
      status.textContent = 'Vérification du code…';
      resetByCode = true;
      auth.verifyOtp({ email: email, token: token, type: 'recovery' }).then(function(res){
        if(res && res.error){
          const code = res.error.code || '';
          status.textContent = (code === 'otp_expired' || /expired|invalid/i.test(res.error.message || ''))
            ? 'Ce code est faux, a expiré ou a déjà servi. Vérifiez le plus récent de vos emails, ou redemandez-en un.'
            : authErrorText(res.error);
          return;
        }
        status.textContent = 'Enregistrement…';
        auth.updateUser({ password: password }).then(function(up){
          if(up && up.error){ status.textContent = authErrorText(up.error); return; }
          const user = (up && up.data && up.data.user) || (res.data && res.data.user);
          saveLastEmail(email);
          if(user){ openAppForAuthUser(user); } else { showLoginMode('quick'); }
        }, function(){ status.textContent = 'Enregistrement impossible : vérifiez votre réseau.'; });
      }, function(){ status.textContent = 'Vérification impossible : vérifiez votre réseau.'; });
    });
  }

  // Vrai dès qu'un lien reçu par email prend la main sur l'écran : plus rien
  // d'autre ne doit venir se poser dessus.
  let authLinkTookOver = false;

  // Retour depuis le lien reçu : on demande le nouveau code puis on entre.
  function showRecoveryBox(){
    authLinkTookOver = true;
    closeWelcome(false);
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    if(quickLoginForm) quickLoginForm.style.display = 'none';
    loginForm.style.display = 'none';
    const forgotWrap = document.getElementById('forgotWrap');
    if(forgotWrap) forgotWrap.style.display = 'none';
    const googleWrap = document.getElementById('googleLoginWrap');
    if(googleWrap) googleWrap.style.display = 'none';
    const box = document.getElementById('recoveryBox');
    if(box) box.style.display = 'block';
    if(loginTitle) loginTitle.textContent = 'Nouveau code';
    if(loginSub) loginSub.style.display = 'none';
    const notice = document.getElementById('autoNoticeModal');
    if(notice) notice.style.display = 'none';
  }

  const recoverySaveBtn = document.getElementById('recoverySaveBtn');
  if(recoverySaveBtn){
    recoverySaveBtn.addEventListener('click', function(){
      const status = document.getElementById('recoveryStatus');
      const value = document.getElementById('recoveryPassword').value;
      const auth = sbAuth();
      if(!auth){ status.textContent = 'Serveur injoignable.'; return; }
      if(value.length < 6){ status.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return; }
      status.textContent = 'Enregistrement…';
      auth.updateUser({ password: value }).then(function(res){
        if(res && res.error){ status.textContent = authErrorText(res.error); return; }
        auth.getSession().then(function(r){
          const session = r && r.data && r.data.session;
          const box = document.getElementById('recoveryBox');
          if(box) box.style.display = 'none';
          if(loginSub) loginSub.style.display = '';
          if(session && session.user){ openAppForAuthUser(session.user); }
          else { showLoginMode('quick'); }
        }, function(){ showLoginMode('quick'); });
      }, function(){ status.textContent = 'Enregistrement impossible : vérifiez votre réseau.'; });
    });
  }

  if(sbAuth() && sbAuth().onAuthStateChange){
    sbAuth().onAuthStateChange(function(event){
      // Un code recopié à la main émet aussi PASSWORD_RECOVERY : le mot de passe
      // a déjà été tapé à côté du code, inutile de le redemander.
      if(event === 'PASSWORD_RECOVERY' && !resetByCode) showRecoveryBox();
    });
  }

  // ---- Retour d'un lien reçu par email ----
  // On ne s'en remet pas au seul événement PASSWORD_RECOVERY : la bibliothèque
  // lit l'adresse dès sa création, bien avant que ce fichier ne s'exécute, et
  // l'événement peut être passé entre-temps. L'adresse, elle, est toujours là.
  //
  // Et surtout : un lien périmé ou déjà utilisé revient avec une erreur dans
  // l'adresse. Sans ce qui suit, la personne arrivait sur l'écran de connexion
  // ordinaire, sans un mot d'explication — le lien avait l'air de ne rien faire.
  // La copie prise dans supabase-init.js passe en premier : l'adresse en cours
  // a déjà pu être nettoyée par la bibliothèque.
  function authLinkParams(){
    const out = {};
    [
      (window.__authLinkHash || window.location.hash).replace(/^#/, ''),
      (window.__authLinkSearch || window.location.search).replace(/^\?/, '')
    ].forEach(function(part){
      if(!part) return;
      new URLSearchParams(part).forEach(function(value, key){ if(!out[key]) out[key] = value; });
    });
    return out;
  }

  function authLinkErrorText(params){
    const code = params.error_code || params.error || '';
    if(code === 'otp_expired' || code === 'expired_token'){
      return 'Ce lien a expiré ou a déjà servi : il ne vaut qu\'une heure et une seule fois. ' +
        'Redemandez-en un ci-dessous, puis ouvrez le plus récent de vos emails.';
    }
    if(code === 'access_denied'){
      return 'Ce lien n\'est plus valable. Redemandez-en un ci-dessous.';
    }
    return (params.error_description || 'Ce lien n\'a pas pu être utilisé.').replace(/\+/g, ' ') +
      ' Redemandez-en un ci-dessous.';
  }

  function handleAuthLink(){
    const params = authLinkParams();

    // Refus au retour de Google (annulé, adresse de retour non autorisée…) :
    // ce n'est pas un lien email, on le dit sous le bouton Google.
    let parGoogle = '';
    try { parGoogle = localStorage.getItem(GOOGLE_KEY) || ''; } catch(e){}
    if((params.error || params.error_code) && parGoogle){
      try { localStorage.removeItem(GOOGLE_KEY); } catch(e){}
      // On revient à la création de compte, où le bouton Google se voit avec
      // son explication.
      showLoginMode('full');
      showLoginStep(1);
      const status = document.getElementById('googleLoginStatus');
      if(status) status.textContent = 'Connexion ' + COMPTES_OAUTH[compteDeLaMarque(parGoogle)] + ' non aboutie : ' +
        (params.error_description || params.error || '').replace(/\+/g, ' ');
      history.replaceState(null, '', window.location.pathname);
      return;
    }

    if(params.error || params.error_code){
      authLinkTookOver = true;
      closeWelcome(false);
      loginScreen.style.display = 'flex';
      appScreen.style.display = 'none';
      // L'avis d'abonnement recouvrait l'explication : ici, ce que la personne
      // doit lire c'est pourquoi son lien n'a pas marché.
      const notice = document.getElementById('autoNoticeModal');
      if(notice) notice.style.display = 'none';
      showLoginMode('quick');
      // La personne est déjà venue chercher un lien : on lui rouvre l'endroit
      // exact où en redemander un, plutôt que de la laisser le retrouver seule.
      const resetBox = document.getElementById('resetBox');
      if(resetBox){
        closeHelpBoxes('resetBox');
        resetBox.style.display = 'block';
      }
      const known = loadLastEmail();
      const field = document.getElementById('resetEmail');
      if(field && !field.value && known) field.value = known;
      const status = document.getElementById('resetStatus');
      if(status) status.textContent = authLinkErrorText(params);
      history.replaceState(null, '', window.location.pathname);
      return;
    }

    if(params.type === 'recovery' || window.__passwordRecovery) showRecoveryBox();
  }

  // Ouvre l'application à partir d'un profil déjà enregistré.
  function loginFromProfile(profile){
    saveLastEmail(profile && profile.email);
    currentUser = {
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      logo: profile.logo || null,
      company: profile.company || '',
      nif: profile.nif || '',
      stat: profile.stat || '',
      maps: profile.maps || ''
    };
    const logins = loadLogins();
    logins.unshift({ name: currentUser.name, email: currentUser.email, phone: currentUser.phone, date: new Date().toLocaleString('fr-FR') });
    saveLogins(logins);
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserEmail').textContent = currentUser.email;
    saveSession();
    if(getSubscriptionStatus().status === 'expired'){ openPaywall(); } else { openApp(); }
  }

  function tryQuickLogin(silent){
    const status = document.getElementById('quickLoginStatus');
    const email = document.getElementById('quickEmail').value.trim();
    const code = document.getElementById('quickCode').value.trim();
    if(!email || !code){
      if(!silent && status) status.textContent = 'Email et code sont obligatoires.';
      return false;
    }
    const profile = findProfileByEmail(email);
    if(!profile || !profile.accessCode){
      if(!silent && status) status.textContent = 'Aucun compte enregistré avec cet email sur cet appareil.';
      return false;
    }
    if(String(profile.accessCode) !== code){
      if(!silent && status) status.textContent = 'Code incorrect.';
      return false;
    }
    if(status) status.textContent = '';
    loginFromProfile(profile);
    return true;
  }

  // ---------------- DÉBLOCAGE PAYÉ AVEC LE PORTEFEUILLE ----------------
  // Pour un compte fermé (abonnement à régler ou compte suspendu), pas pour un
  // mot de passe perdu : celui-ci se règle seul avec le lien envoyé par email.
  //
  // Le déblocage se paie sur le solde du portefeuille — celui que les
  // invitations remplissent. Rien ne sort de l'application : la somme passe du
  // portefeuille du client à celui du propriétaire, et l'accès se rouvre dans
  // la foulée. Plus de somme à envoyer au dehors, plus de référence à
  // recopier, plus d'attente qu'un humain constate l'arrivée de l'argent.
  // Vingt invitations, et le compte se rouvre tout seul.
  const UNLOCK_COST_CREDITS = 20;

  // Les demandes d'avant ce changement portent encore leur ancien moyen de
  // paiement : le propriétaire doit pouvoir relire son historique.
  function paymentMethodLabel(method){
    if(method === 'wallet') return 'Solde du portefeuille';
    if(method === 'card') return 'Carte Visa / Mastercard';
    if(method === 'bank') return 'Virement bancaire';
    if(method === 'mobile') return 'Mobile Money';
    return 'Papi';
  }

  // Le hash (jamais le code en clair) est ce qui transite et ce qui est stocké.
  function sha256Hex(text){
    if(!(window.crypto && window.crypto.subtle)) return Promise.resolve('plain:' + text);
    const data = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', data).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function renderUnlockWallet(){
    // Cet élément n'existe plus sur l'écran de connexion ; la ligne reste au
    // cas où un thème le remettrait, et ne coûte rien s'il est absent.
    const balanceEl = document.getElementById('unlockWalletBalance');
    const costEl = document.getElementById('unlockWalletCost');
    if(costEl) costEl.textContent = (UNLOCK_COST_CREDITS * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar';
    // Le solde n'est plus affiché ici : il se lit dans Portefeuille. Il n'est
    // dit qu'en réponse à un clic, s'il ne suffit pas — c'est alors une
    // explication, pas un étalage.
    if(balanceEl) balanceEl.textContent = '';
  }

  // Trace laissée au propriétaire : il voit qui s'est débloqué et avec combien,
  // et ses propres crédits s'en trouvent augmentés d'autant. L'écriture est
  // faite au mieux — hors ligne, le déblocage a tout de même lieu, car les
  // crédits, eux, ont bien été retirés.
  function recordWalletUnlock(name, email, method){
    if(!window.__sb) return;
    window.__sb.from('unlock_requests').insert({
      name: name, email: normEmail(email), phone: '',
      message: method === 'card' ? 'Payé par carte Visa (Papi)' : 'Payé avec le solde du portefeuille',
      amount: UNLOCK_COST_CREDITS, paypal_reference: '', payment_method: method || 'wallet',
      status: 'confirmed', auto_confirmed: true,
      confirmed_at: new Date().toISOString()
    }).then(function(){}, function(){});
  }

  const forgotToggleBtn = document.getElementById('forgotToggleBtn');
  if(forgotToggleBtn){
    forgotToggleBtn.addEventListener('click', function(){
      if(!openHelpBox('forgotBox')) return;
      // Ce que la personne vient de taper pour se connecter sert déjà : on ne
      // lui redemande pas son email deux fois de suite.
      const quickEmail = document.getElementById('quickEmail').value.trim();
      const emailField = document.getElementById('forgotEmail');
      if(quickEmail.indexOf('@') >= 0 && !emailField.value) emailField.value = quickEmail;
      const known = findProfileByEmail(emailField.value);
      const nameField = document.getElementById('forgotName');
      if(known && !nameField.value) nameField.value = known.name || '';
      renderUnlockWallet();
    });
  }

  // ---- Le même déblocage, payé par carte Visa ----
  // Le numéro de carte ne passe jamais par ici : il se tape sur la page de
  // paiement de Papi (carte BRED / Visa). Il faut une session Supabase pour
  // créer le lien, et le compte bloqué en a été sorti : on se reconnecte donc
  // avec le mot de passe. Au retour, papi-paiement.js vérifie le paiement,
  // achète l'article « unlock » au serveur, puis appelle apresDeblocageCarte.
  const UNLOCK_CARD_KEY = 'stockmanager_deblocage_carte';
  const payByCardBtn = document.getElementById('payUnlockCardBtn');
  if(payByCardBtn){
    payByCardBtn.addEventListener('click', async function(){
      const statusEl = document.getElementById('forgotStatus');
      const name = document.getElementById('forgotName').value.trim();
      const email = document.getElementById('forgotEmail').value.trim();
      const password = document.getElementById('forgotPassword').value;
      if(!name || !email){
        statusEl.textContent = 'Votre nom et votre email sont obligatoires.';
        return;
      }
      if(!findProfileByEmail(email)){
        statusEl.textContent = 'Aucun compte n\'est enregistré sur cet appareil pour cet email. ' +
          'Utilisez « Première connexion / autre compte ».';
        return;
      }
      if(typeof window.papiPayerAbonnement !== 'function'){
        statusEl.textContent = 'Papi indisponible : rechargez la page.';
        return;
      }
      const auth = sbAuth();
      if(!auth){ statusEl.textContent = 'Paiement par carte indisponible hors ligne.'; return; }
      payByCardBtn.disabled = true;
      try {
        const s = await auth.getSession();
        const connecte = s && s.data && s.data.session &&
          normEmail(s.data.session.user && s.data.session.user.email) === normEmail(email);
        if(!connecte){
          if(password.length < 6){
            statusEl.textContent = 'Tapez votre mot de passe pour payer par carte.';
            payByCardBtn.disabled = false;
            return;
          }
          statusEl.textContent = 'Connexion…';
          const r = await auth.signInWithPassword({ email: email, password: password });
          if(r.error) throw new Error('Mot de passe incorrect.');
        }
      } catch(err){
        statusEl.textContent = err.message;
        payByCardBtn.disabled = false;
        return;
      }
      try { localStorage.setItem(UNLOCK_CARD_KEY, JSON.stringify({ name: name, email: email })); } catch(e){}
      window.papiPayerAbonnement('unlock', brutPourNet(UNLOCK_COST_CREDITS * AR_PER_CREDIT), statusEl,
        function(){ payByCardBtn.disabled = false; }, 'BRED');
    });
  }
  window.apresDeblocageCarte = function(){
    let who = null;
    try { who = JSON.parse(localStorage.getItem(UNLOCK_CARD_KEY) || 'null'); localStorage.removeItem(UNLOCK_CARD_KEY); } catch(e){}
    const profile = who && findProfileByEmail(who.email);
    if(!profile) return;
    recordWalletUnlock(who.name || profile.name || '', who.email, 'card');
    const paye = (UNLOCK_COST_CREDITS * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar';
    pushNotification('parrainage', 'Déblocage payé par carte Visa (' + paye + ') — accès rétabli.');
    loginFromProfile(profile);
  };


  // ---------------- CONNEXION / INSCRIPTION PAR GOOGLE ----------------
  // Le nom et l'email viennent du compte Google : rien à taper. On part chez
  // Google, qui renvoie ici avec la session ; le démarrage (getSession, plus
  // bas) ouvre alors l'application. La marque dit au retour que c'est Google
  // qui a été demandé, pour noter un compte neuf et expliquer un refus.
  // Facebook, X, Apple et GitHub suivent le même chemin : la marque garde
  // alors le nom du compte choisi (« github:… »), Google n'en a pas.
  const GOOGLE_KEY = 'stockmanager_fidirana_google';
  const COMPTES_OAUTH = {
    google: 'Google', facebook: 'Facebook', twitter: 'X', apple: 'Apple', github: 'GitHub'
  };
  function compteDeLaMarque(marque){
    const m = /^([a-z]+):/.exec(String(marque || ''));
    return m && COMPTES_OAUTH[m[1]] ? m[1] : 'google';
  }
  function fidiranaAmin(provider){
    const auth = sbAuth();
    const status = document.getElementById('googleLoginStatus');
    if(!auth || !auth.signInWithOAuth){
      if(status) status.textContent = 'Serveur injoignable : vérifiez votre réseau.';
      else alert('Serveur injoignable : vérifiez votre réseau.');
      return;
    }
    try { localStorage.setItem(GOOGLE_KEY, (provider === 'google' ? '' : provider + ':') + Date.now()); } catch(e){}
    if(status) status.textContent = 'Ouverture de ' + COMPTES_OAUTH[provider] + '…';
    const options = { redirectTo: window.location.origin + window.location.pathname };
    if(provider === 'google') options.queryParams = { prompt: 'select_account' };
    auth.signInWithOAuth({ provider: provider, options: options }).then(function(res){
      if(res && res.error && status) status.textContent = authErrorText(res.error);
    }, function(){ if(status) status.textContent = 'Connexion impossible : vérifiez votre réseau.'; });
  }
  function fidiranaGoogle(){ fidiranaAmin('google'); }
  window.__fidiranaGoogle = fidiranaGoogle;
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  if(googleLoginBtn) googleLoginBtn.addEventListener('click', fidiranaGoogle);

  // Les boutons des autres comptes : Supabase dit lesquels sont allumés
  // (Authentication > Providers) ; un compte éteint n'a pas de bouton, il
  // apparaît tout seul le jour où on l'allume.
  const LOGOS_COMPTES = {
    facebook: ['#0866FF', 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'],
    twitter: ['#000000', 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'],
    apple: ['#000000', 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'],
    github: ['#181717', 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12']
  };
  function afficherAutresComptes(allumes){
    const zone = document.getElementById('autresComptes');
    if(!zone) return;
    const liste = Object.keys(LOGOS_COMPTES).filter(function(p){ return allumes[p]; });
    // Un bouton seul (ou le dernier d'un nombre impair) prend toute la
    // largeur, comme celui de Google.
    zone.innerHTML = liste.map(function(p, i){
      const logo = LOGOS_COMPTES[p];
      const seul = i === liste.length - 1 && liste.length % 2 === 1;
      return '<button type="button" class="btn btn-sm" data-compte="' + p + '" style="display:flex; align-items:center; justify-content:center; gap:0.45rem; background:' + logo[0] + '; color:#fff; border-color:' + logo[0] + ';' + (seul ? ' grid-column:1 / -1;' : '') + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="' + logo[1] + '"/></svg>' +
        (liste.length === 1 ? 'Continuer avec ' : '') + COMPTES_OAUTH[p] + '</button>';
    }).join('');
    zone.style.display = liste.length ? 'grid' : 'none';
    zone.querySelectorAll('[data-compte]').forEach(function(b){
      b.addEventListener('click', function(){ fidiranaAmin(b.dataset.compte); });
    });
  }
  (function(){
    const sb = window.__sb;
    const url = sb && (sb.supabaseUrl || (sb.rest && sb.rest.url && sb.rest.url.replace(/\/rest\/v1\/?$/, '')));
    const cle = sb && sb.supabaseKey;
    if(!url || !cle || !window.fetch) return;
    fetch(url + '/auth/v1/settings', { headers: { apikey: cle } })
      .then(function(r){ return r.json(); })
      .then(function(j){ afficherAutresComptes((j && j.external) || {}); }, function(){});
  })();

  // Retour de Google : un compte créé il y a quelques minutes est une
  // inscription — elle part chez le propriétaire comme les autres.
  function apresGoogle(user){
    let marque = null;
    try { marque = localStorage.getItem(GOOGLE_KEY); localStorage.removeItem(GOOGLE_KEY); } catch(e){}
    if(!marque || !user) return;
    const provider = (user.app_metadata && user.app_metadata.provider) || '';
    const cree = Date.parse(user.created_at || '') || 0;
    if(provider === compteDeLaMarque(marque) && Date.now() - cree < 15 * 60 * 1000){
      const meta = user.user_metadata || {};
      recordNewSignup(meta.full_name || meta.name || String(user.email).split('@')[0], user.email, '');
    }
  }

  let quickLoginBusy = false;
  let quickAutoTimer = null;

  function submitQuickLogin(silent){
    const auth = sbAuth();
    if(!auth) return tryQuickLogin(silent);   // repli hors ligne
    if(quickLoginBusy) return false;
    const status = document.getElementById('quickLoginStatus');
    const email = document.getElementById('quickEmail').value.trim();
    const password = document.getElementById('quickCode').value;
    if(!email || password.length < 6){
      if(!silent && status) status.textContent = 'Email (ou téléphone) et mot de passe (6 caractères minimum) obligatoires.';
      return false;
    }
    // Sans « @ », c'est un numéro de téléphone : la fonction fiditra-anarana
    // retrouve les comptes Ny asako de ce numéro et garde celui que le mot de
    // passe ouvre (« 034… » et « +261 34… » sont le même numéro).
    const parFinday = email.indexOf('@') < 0;
    if(parFinday && email.replace(/\D/g, '').length < 9){
      if(!silent && status) status.textContent = 'Numéro de téléphone incomplet.';
      return false;
    }
    quickLoginBusy = true;
    if(status) status.textContent = 'Connexion…';
    const connexion = !parFinday
      ? auth.signInWithPassword({ email: email, password: password })
      : window.__sb.functions.invoke('fiditra-anarana', {
          body: { finday: email, mdp: password, ny_asako: true }
        }).then(function(r){
          const d = r && r.data;
          if(r.error || !d || !d.ok){
            return { error: { message: d && d.antony === 'tsy_voamarina' ? 'Email not confirmed' : 'Invalid login credentials' } };
          }
          return auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
        });
    connexion.then(function(res){
      quickLoginBusy = false;
      if(res && res.error){
        if(parFinday){
          if(status) status.textContent = silent ? '' : authErrorText(res.error);
          return;
        }
        // propriétaire sur son appareil habituel : pas de paiement, pas
        // d'attente — un code de secours s'affiche et rouvre l'accès.
        tryOwnerRescueCode(email, password).then(function(entered){
          if(entered) return;
          // Entrées forcées : au-delà du seuil, le compte est bloqué. On ne
          // compte que les tentatives voulues.
          //
          // La connexion part toute seule à chaque pause de frappe, dès que six
          // caractères sont tapés : on comptait donc comme entrées forcées les
          // lettres d'un mot de passe qu'on était en train d'écrire. Cinq pauses
          // — c'est peu, sur un téléphone où l'on tape lentement — et le compte
          // se fermait sur son propre titulaire, qui n'avait rien fait d'autre
          // que taper son mot de passe correctement.
          if(!silent && typeof noteFailedAttempt === 'function') noteFailedAttempt(email);
          if(isOwnerEmail(email) && isOwnerDevice() && !loadRescue()){
            offerOwnerRescueCode();
            return;
          }
          if(status) status.textContent = silent ? '' : authErrorText(res.error);
        });
        return;
      }
      if(status) status.textContent = '';
      openAppForAuthUser(res.data.user);
    }, function(){
      quickLoginBusy = false;
      if(status) status.textContent = 'Connexion impossible : vérifiez votre réseau.';
    });
    return true;
  }

  if(quickLoginForm){
    quickLoginForm.addEventListener('submit', function(e){
      e.preventDefault();
      submitQuickLogin(false);
    });
    // « valider automatic » : la connexion part toute seule dès que la saisie
    // est complète (petite pause pour ne pas appeler le serveur à chaque touche).
    document.getElementById('quickCode').addEventListener('input', function(){
      if(quickAutoTimer) clearTimeout(quickAutoTimer);
      const auth = sbAuth();
      if(!auth){ tryQuickLogin(true); return; }
      quickAutoTimer = setTimeout(function(){ submitQuickLogin(true); }, 700);
    });
  }

  // Affiche le message dans la carte de connexion : une alert() est parfois
  // ignorée (navigateur intégré, aperçu VS Code) et l'utilisateur ne voyait
  // alors rien se passer du tout.
  function setLoginStatus(text){
    const el = document.getElementById('loginStatus');
    if(el) el.textContent = text || '';
    if(text) console.warn('[connexion] ' + text);
  }

  // ---------------- INSCRIPTION EN QUATRE ÉTAPES ----------------
  // 1) prénom + nom, 2) email + téléphone, 3) logo, 4) mot de passe + confirmation.
  // Le formulaire est en novalidate : chaque étape vérifie ses propres champs,
  // sinon le navigateur bloquerait sur un champ caché d'une autre étape.
  const LOGIN_STEPS = 4;
  let loginStep = 1;
  function loginFullName(){
    const first = document.getElementById('loginFirstName').value.trim();
    const last = document.getElementById('loginLastName').value.trim();
    return (first + ' ' + last).trim();
  }
  function showLoginStep(step){
    loginStep = step;
    loginForm.querySelectorAll('.login-step').forEach(function(el){
      el.style.display = Number(el.dataset.step) === step ? 'block' : 'none';
    });
    const label = document.getElementById('loginStepLabel');
    if(label) label.textContent = 'Étape ' + step + ' sur ' + LOGIN_STEPS;
    const submitBtn = document.getElementById('loginSubmitBtn');
    if(submitBtn) submitBtn.textContent = step === LOGIN_STEPS ? 'Se connecter' : 'Suivant →';
    const prevBtn = document.getElementById('loginPrevBtn');
    if(prevBtn) prevBtn.style.display = step > 1 ? 'block' : 'none';
    // Google à l'entrée de la création de compte seulement : plus loin, on a
    // déjà choisi l'email.
    majGoogle();
    setLoginStatus('');
    const current = loginForm.querySelector('.login-step[data-step="' + step + '"] input');
    if(current && loginScreen.style.display !== 'none') current.focus();
  }
  function loginStepValid(step){
    const inputs = loginForm.querySelectorAll('.login-step[data-step="' + step + '"] input');
    for(let i = 0; i < inputs.length; i++){
      if(!inputs[i].checkValidity()){ inputs[i].reportValidity(); return false; }
    }
    if(step === 2 && !document.getElementById('loginPhone').value.trim()){
      const known = findProfile(loginFullName());
      if(!known || !known.phone){ setLoginStatus('Veuillez indiquer votre numéro de téléphone.'); return false; }
    }
    if(step === 3 && !document.getElementById('loginLogo').files[0] && !findProfile(loginFullName())){
      setLoginStatus('Veuillez ajouter un logo pour votre première connexion.');
      return false;
    }
    if(step === 4 && document.getElementById('loginCode').value !== document.getElementById('loginCodeConfirm').value){
      setLoginStatus('Les deux mots de passe ne sont pas identiques.');
      document.getElementById('loginCodeConfirm').focus();
      return false;
    }
    return true;
  }
  const loginPrevBtn = document.getElementById('loginPrevBtn');
  if(loginPrevBtn) loginPrevBtn.addEventListener('click', function(){
    if(loginStep > 1) showLoginStep(loginStep - 1);
  });
  loginForm.addEventListener('reset', function(){ setTimeout(function(){ showLoginStep(1); }, 0); });

  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    setLoginStatus('');
    if(!loginStepValid(loginStep)) return;
    if(loginStep < LOGIN_STEPS){ showLoginStep(loginStep + 1); return; }
    const name = loginFullName();
    const email = document.getElementById('loginEmail').value.trim();
    const phoneInput = document.getElementById('loginPhone').value.trim();
    const logoFile = document.getElementById('loginLogo').files[0];
    if(!name || !email) return;

    const existingProfile = findProfile(name);
    if(!existingProfile && !logoFile){
      setLoginStatus('Veuillez ajouter un logo pour votre première connexion.');
      return;
    }
    const phone = phoneInput || (existingProfile ? existingProfile.phone : '');
    if(!phone){ setLoginStatus('Veuillez indiquer votre numéro de téléphone.'); return; }

    function finishLogin(logoDataUrl){
      try{ finishLoginInner(logoDataUrl); }
      catch(err){ setLoginStatus('Erreur inattendue : ' + (err && err.message ? err.message : err)); }
    }

    function finishLoginInner(logoDataUrl){
      const logo = logoDataUrl || (existingProfile ? existingProfile.logo : null);
      const company = existingProfile ? (existingProfile.company || '') : '';
      const nif = existingProfile ? (existingProfile.nif || '') : '';
      const stat = existingProfile ? (existingProfile.stat || '') : '';
      const codeInput = document.getElementById('loginCode');
      const password = codeInput ? codeInput.value : '';
      const auth = sbAuth();

      // le logo reste sur l'appareil : il n'est pas envoyé au serveur
      function cacheLocalProfile(accessCode){
        upsertProfile(name, {
          name: name, email: email, phone: phone, logo: logo,
          company: company, nif: nif, stat: stat,
          accessCode: accessCode
        });
      }

      function openLocally(){
        currentUser = { name, email, phone, logo: logo, company: company, nif: nif, stat: stat };
        const logins = loadLogins();
        logins.unshift({ name, email, phone, date: new Date().toLocaleString('fr-FR') });
        saveLogins(logins);
        document.getElementById('currentUserName').textContent = name;
        document.getElementById('currentUserEmail').textContent = email;
        saveSession();
        if(getSubscriptionStatus().status === 'expired'){ openPaywall(); } else { openApp(); }
      }

      if(!auth){
        // pas de Supabase : ancien fonctionnement, code conservé localement
        cacheLocalProfile(password.trim() || (existingProfile ? existingProfile.accessCode : ''));
        openLocally();
        return;
      }

      if(password.length < 6){
        setLoginStatus('Le mot de passe doit contenir au moins 6 caractères.');
        return;
      }

      cacheLocalProfile('');
      const meta = { name: name, phone: phone, company: company, nif: nif, stat: stat,
        logo: logoForServer(logo) };
      auth.signUp({ email: email, password: password, options: { data: meta } }).then(function(res){
        if(res && res.error){
          // l'email existe peut-être déjà : on tente une connexion normale
          auth.signInWithPassword({ email: email, password: password }).then(function(r2){
            if(r2 && r2.error){
              setLoginStatus(authErrorText(r2.error) +
                ' (création du compte : ' + authErrorText(res.error) + ')');
              return;
            }
            openAppForAuthUser(r2.data.user);
          }, function(){ setLoginStatus('Connexion impossible : vérifiez votre réseau.'); });
          return;
        }
        recordNewSignup(name, email, phone);
        // « compte n°2 » sous l'identité d'un client existant : bloqué aussitôt
        if(typeof checkDuplicateIdentity === 'function'){
          checkDuplicateIdentity(name, email, phone).then(function(clash){
            if(clash){
              forceSignOut('Ce nom ou ce numéro appartient déjà à un autre compte. ' +
                'Par sécurité, ce nouveau compte est bloqué et ' + OWNER_NAME + ' a été prévenu.');
            }
          });
        }
        if(res.data && res.data.session){
          openAppForAuthUser(res.data.user);
        } else {
          // confirmation par email activée sur le projet Supabase
          setLoginStatus('Compte créé, mais le serveur demande une confirmation par email. ' +
            'Ouvrez le mail envoyé à ' + email + ' et cliquez sur le lien, puis reconnectez-vous. ' +
            'Pour supprimer cette étape : Supabase > Authentication > Sign In / Providers > Email > ' +
            'décocher « Confirm email ».');
          showLoginMode('quick');
          document.getElementById('quickEmail').value = email;
        }
      }, function(){ setLoginStatus('Création du compte impossible : vérifiez votre réseau.'); });
    }

    if(logoFile){
      const reader = new FileReader();
      reader.onload = function(ev){
        shrinkImage(ev.target.result, 320, function(small){ finishLogin(small); });
      };
      reader.onerror = function(){ finishLogin(null); };
      reader.readAsDataURL(logoFile);
    } else {
      finishLogin(null);
    }
  });

  document.getElementById('saveProfileBtn').addEventListener('click', function(){
    if(!currentUser) return;
    const name = document.getElementById('profileName').value.trim();
    const company = document.getElementById('profileCompany').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const nif = document.getElementById('profileNif').value.trim();
    const stat = document.getElementById('profileStat').value.trim();
    const mapsInput = document.getElementById('profileMaps');
    const maps = mapsInput ? lienMapsPropre(mapsInput.value) : (currentUser.maps || '');
    const logoFile = document.getElementById('profileLogo').files[0];
    if(!name || !email){ alert('Le nom et l\'email sont obligatoires.'); return; }
    if(mapsInput && mapsInput.value.trim() && !maps){
      alert('Le lien Maps doit commencer par https:// (ex : https://maps.app.goo.gl/…).');
      return;
    }

    function finishSave(logoDataUrl){
      const logo = logoDataUrl || currentUser.logo || null;
      currentUser = { name, company, email, phone, nif, stat, logo: logo, maps: maps };
      const codeInput = document.getElementById('profileAccessCode');
      const existing = findProfile(name);
      const newPassword = codeInput ? codeInput.value : '';
      const auth = sbAuth();
      // avec Supabase le mot de passe n'est jamais gardé ici
      const localCode = auth ? '' : (newPassword.trim() || (existing ? existing.accessCode : ''));
      upsertProfile(name, { name, company, email, phone, nif, stat, logo: logo, maps: maps, accessCode: localCode });
      // Le propriétaire le retrouve dans « Nouvelles inscriptions »
      // (supabase-toerana-mpanjifa.sql). Sans la fonction, rien ne casse.
      if(window.__sb && window.__sb.rpc){
        window.__sb.rpc('set_mon_lien_maps', { lien: maps }).then(function(){}, function(){});
      }
      document.getElementById('currentUserName').textContent = name;
      document.getElementById('currentUserEmail').textContent = email;
      saveSession();
      document.getElementById('profileLogo').value = '';
      updateProfilePhotoPreview(logo);
      const status = document.getElementById('profileSaveStatus');
      status.textContent = 'Profil enregistré.';

      if(auth){
        const update = { data: { name: name, phone: phone, company: company, nif: nif, stat: stat,
          maps: maps, logo: logoForServer(logo) } };
        if(newPassword){
          if(newPassword.length < 6){
            status.textContent = 'Profil enregistré, mais le mot de passe doit faire 6 caractères minimum.';
            setTimeout(function(){ status.textContent = ''; }, 4000);
            return;
          }
          update.password = newPassword;
        }
        auth.updateUser(update).then(function(res){
          if(res && res.error){
            status.textContent = 'Profil enregistré localement, mais la mise à jour du compte a échoué.';
          } else if(newPassword){
            status.textContent = 'Profil et mot de passe enregistrés.';
            if(codeInput) codeInput.value = '';
          }
          setTimeout(function(){ status.textContent = ''; }, 4000);
        }, function(){
          status.textContent = 'Profil enregistré localement (serveur injoignable).';
          setTimeout(function(){ status.textContent = ''; }, 4000);
        });
        return;
      }
      setTimeout(function(){ status.textContent = ''; }, 3000);
    }

    if(logoFile){
      const reader = new FileReader();
      reader.onload = function(ev){
        shrinkImage(ev.target.result, 320, function(small){ finishSave(small); });
      };
      reader.onerror = function(){ finishSave(null); };
      reader.readAsDataURL(logoFile);
    } else {
      finishSave(null);
    }
  });

  // ---------------- LIEN MAPS DU CLIENT (Paramètres) ----------------
  // N'est gardé que s'il est une vraie adresse web : il finit dans un href,
  // chez le client comme chez le propriétaire. Collé depuis « Partager » de
  // Google Maps, le lien arrive parfois précédé du nom du lieu : on ne garde
  // que l'adresse.
  function lienMapsPropre(v){
    const m = String(v || '').trim().match(/https?:\/\/\S+/i);
    return m ? m[0].slice(0, 500) : '';
  }

  // « 📍 Ma position » : le téléphone donne sa position, on en fait un lien.
  // Aussi pour le lien d'un client (parametres.js) : sur place chez lui, le
  // patron prend la position du téléphone.
  function remplirMaPosition(input, status){
    if(!navigator.geolocation){ if(status) status.textContent = 'Position indisponible sur cet appareil.'; return; }
    if(status) status.textContent = 'Recherche de la position…';
    navigator.geolocation.getCurrentPosition(function(pos){
      const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      input.value = 'https://www.google.com/maps?q=' + lat + ',' + lng;
      input.dispatchEvent(new Event('input'));
      if(status) status.textContent = 'Position trouvée : touchez « Enregistrer ».';
    }, function(){
      if(status) status.textContent = 'Position refusée ou introuvable.';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  const profileMapsGpsBtn = document.getElementById('profileMapsGpsBtn');
  if(profileMapsGpsBtn){
    profileMapsGpsBtn.addEventListener('click', function(){
      remplirMaPosition(document.getElementById('profileMaps'), document.getElementById('profileMapsStatus'));
    });
  }
  const profileMapsInput = document.getElementById('profileMaps');
  if(profileMapsInput){
    profileMapsInput.addEventListener('input', function(){
      const a = document.getElementById('profileMapsOpen');
      const lien = lienMapsPropre(profileMapsInput.value);
      if(a){ a.href = lien || '#'; a.style.display = lien ? '' : 'none'; }
      const b = document.getElementById('profileMapsSite');
      if(b) b.style.display = lien ? '' : 'none';
      const envoi = document.getElementById('profileMapsEnvoi');
      if(envoi) envoi.style.display = lien ? '' : 'none';
      dessinerItineraire(document.getElementById('profileMapsItineraire'), lien);
    });
  }

  // Les quatre boutons d'itinéraire vers un lien Maps (le sien dans le
  // profil, celui d'un client dans « Lien Maps des clients »). Rien quand le
  // lien ne porte pas de position (lien court).
  function dessinerItineraire(boite, lien){
    if(!boite) return;
    const pos = (lien && window.coordsDuLienMaps) ? window.coordsDuLienMaps(lien) : null;
    if(!pos){ boite.innerHTML = ''; boite.style.display = 'none'; return; }
    function peindre(){
      boite.style.display = '';
      boite.innerHTML = '<div style="font-size:0.74rem; color:var(--muted); margin:0.5rem 0 0.3rem;">🧭 Itinéraire</div>' +
        '<div style="display:flex; gap:0.4rem; flex-wrap:wrap;">' +
        liensItineraire(pos).map(function(l){
          return '<a class="btn btn-sm" target="_blank" rel="noopener" style="width:auto;" href="' +
            escapeHtml(l.url) + '">' + l.icone + ' ' + l.nom + '</a>';
        }).join('') + '</div>';
    }
    peindre();
    // La ville arrive après : le bouton « Avion » se met à jour. Attendue un
    // instant, pour ne pas interroger OpenStreetMap à chaque lettre tapée.
    clearTimeout(boite._attenteVille);
    boite._attenteVille = setTimeout(function(){
      chercherVille(pos).then(function(v){ if(v && boite.isConnected) peindre(); });
    }, 600);
  }

  // ---- Envoyer son lien Maps à un client ----
  // Ce qu'on écrit dans la case dit par où il part :
  //  - un numéro → WhatsApp, message déjà écrit ;
  //  - un email → la messagerie, message déjà écrit ;
  //  - un lien wa.me → WhatsApp, message déjà écrit ;
  //  - un autre lien (Facebook, Messenger, Instagram, Telegram…) → ces
  //    applications ne laissent pas écrire le message à notre place : il est
  //    copié, la conversation s'ouvre, il n'y a plus qu'à coller ;
  //  - rien → le partage du téléphone, qui laisse choisir.
  // ---- L'itinéraire : bus, moto, vélo, et l'avion quand c'est loin ----
  // Google Maps calcule le trajet depuis là où se trouve celui qui ouvre le
  // lien : pas besoin de connaître son point de départ. Il n'a pas de mode
  // « moto » dans ses liens : la moto prend la route des voitures. L'avion,
  // c'est Google Flights, vers la ville du point (relue chez OpenStreetMap).
  const LOIN_KM = 200;
  const villesConnues = {};

  function distanceKm(a, b){
    const r = Math.PI / 180;
    const x = Math.sin((b.lat - a.lat) * r / 2), y = Math.sin((b.lng - a.lng) * r / 2);
    const h = x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  function cleVille(pos){ return pos.lat.toFixed(2) + ',' + pos.lng.toFixed(2); }

  // La ville du point, une fois, à l'avance : au moment d'envoyer, on ne
  // peut plus attendre (le navigateur bloquerait la fenêtre ouverte après).
  function chercherVille(pos){
    if(!pos) return Promise.resolve('');
    const cle = cleVille(pos);
    if(villesConnues[cle] !== undefined) return Promise.resolve(villesConnues[cle]);
    return fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=fr&lat=' +
      pos.lat + '&lon=' + pos.lng)
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(j){
        const a = (j && j.address) || {};
        const v = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
        villesConnues[cle] = v;
        return v;
      }, function(){ return ''; });
  }

  function liensItineraire(pos){
    if(!pos) return [];
    const dest = pos.lat + ',' + pos.lng;
    function dir(mode){
      return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '&travelmode=' + mode;
    }
    const ville = villesConnues[cleVille(pos)] || '';
    return [
      { cle: 'bus', icone: '🚌', nom: 'Bus', url: dir('transit') },
      { cle: 'moto', icone: '🏍️', nom: 'Moto', url: dir('driving') },
      { cle: 'velo', icone: '🚲', nom: 'Vélo', url: dir('bicycling') },
      { cle: 'avion', icone: '✈️', nom: 'Avion', url: 'https://www.google.com/travel/flights?hl=fr&q=' +
        encodeURIComponent('Vols vers ' + (ville || dest)) }
    ];
  }

  // depuis : la position du client, quand on la connaît (« Lien Maps des
  // clients »). Loin de plus de LOIN_KM, l'avion passe en premier ; tout
  // près, il disparaît. Sans elle, l'avion reste, « si vous êtes loin ».
  function texteItineraire(pos, depuis){
    let liens = liensItineraire(pos);
    if(!liens.length) return '';
    let noteAvion = ' (si vous êtes loin)';
    if(depuis){
      const km = distanceKm(depuis, pos);
      if(km < LOIN_KM){ liens = liens.filter(function(l){ return l.cle !== 'avion'; }); }
      else {
        liens = [liens[3]].concat(liens.slice(0, 3));
        noteAvion = ' (' + Math.round(km) + ' km)';
      }
    }
    return '\n\n🧭 Itinéraire :\n' + liens.map(function(l){
      return l.icone + ' ' + l.nom + (l.cle === 'avion' ? noteAvion : '') + ' : ' + l.url;
    }).join('\n');
  }

  // La position d'un client de « Gestion de compte » dont on a écrit le
  // numéro, si son lien Maps la porte.
  function positionDuClientNumero(dest){
    const chiffres = String(dest || '').replace(/\D/g, '').slice(-9);
    if(chiffres.length < 8 || typeof tousLesClientsMaps !== 'function' || !window.coordsDuLienMaps) return null;
    const x = tousLesClientsMaps().find(function(x){
      return x.c.maps && String(x.c.phone || '').replace(/\D/g, '').slice(-9) === chiffres;
    });
    return x ? window.coordsDuLienMaps(x.c.maps) : null;
  }

  function messageLienMaps(lien, dest){
    const nom = (currentUser && (currentUser.company || currentUser.name)) || '';
    const pos = window.coordsDuLienMaps ? window.coordsDuLienMaps(lien) : null;
    return '📍 ' + (nom ? nom + ' — ' : '') + 'voici où nous trouver : ' + lien +
      texteItineraire(pos, positionDuClientNumero(dest));
  }

  function copierTexte(texte){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(texte).then(function(){ return true; }, function(){ return false; });
    }
    return Promise.resolve(false);
  }

  function envoyerLienMaps(dest, lien, status){
    const texte = messageLienMaps(lien, dest);
    const d = String(dest || '').trim();
    function dire(t){ if(status) status.textContent = t; }
    function ouvrir(url){ window.open(url, '_blank', 'noopener'); }

    if(!d){
      if(navigator.share){
        navigator.share({ text: texte }).then(function(){ dire('Lien envoyé.'); }, function(){});
      } else {
        ouvrir('https://wa.me/?text=' + encodeURIComponent(texte));
      }
      return;
    }
    if(/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(d)){
      window.location.href = 'mailto:' + encodeURIComponent(d) +
        '?subject=' + encodeURIComponent('📍 Notre emplacement') + '&body=' + encodeURIComponent(texte);
      dire('Votre messagerie s\'ouvre : touchez « Envoyer ».');
      return;
    }
    if(/^[+\d\s().-]+$/.test(d) && d.replace(/\D/g, '').length >= 8){
      const numero = (typeof toInternationalNumber === 'function') ? toInternationalNumber(d) : d.replace(/\D/g, '');
      ouvrir('https://wa.me/' + numero + '?text=' + encodeURIComponent(texte));
      dire('WhatsApp s\'ouvre avec le message : touchez « Envoyer ».');
      return;
    }
    let url = /^https?:\/\//i.test(d) ? d : 'https://' + d;
    const wa = url.match(/^https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d+)/i);
    if(wa){
      ouvrir('https://wa.me/' + wa[1] + '?text=' + encodeURIComponent(texte));
      dire('WhatsApp s\'ouvre avec le message : touchez « Envoyer ».');
      return;
    }
    if(/facebook\.com\//i.test(url) && typeof facebookToMessenger === 'function'){
      url = facebookToMessenger(url) || url;
    }
    // La copie part avant l'ouverture, et l'ouverture tout de suite : après
    // une attente, le navigateur ne la voit plus comme venant du doigt et la
    // bloque.
    const copie = copierTexte(texte);
    ouvrir(url);
    copie.then(function(copie){
      dire(copie
        ? 'Message copié : collez-le dans la conversation qui s\'ouvre, puis envoyez.'
        : 'La conversation s\'ouvre : collez-y ce lien → ' + lien);
    });
  }

  // Les clients de « Gestion de compte » proposés dans la case : on choisit
  // un nom, son numéro s'y inscrit.
  const profileMapsDest = document.getElementById('profileMapsDest');
  if(profileMapsDest){
    profileMapsDest.addEventListener('focus', function(){
      const liste = document.getElementById('profileMapsDestListe');
      if(!liste || typeof tousLesClientsMaps !== 'function') return;
      liste.innerHTML = '';
      tousLesClientsMaps().forEach(function(x){
        if(!x.c.phone) return;
        const o = document.createElement('option');
        o.value = x.c.phone;
        o.label = x.c.name || '';
        o.textContent = x.c.name || '';
        liste.appendChild(o);
      });
    });
  }
  // « Enregistrer » de la page Toerana : le lien seul, sans toucher au reste
  // du profil (nom, mot de passe… restent dans Paramètres).
  const profileMapsSave = document.getElementById('profileMapsSave');
  if(profileMapsSave){
    profileMapsSave.addEventListener('click', function(){
      if(!currentUser) return;
      const input = document.getElementById('profileMaps');
      const status = document.getElementById('profileMapsStatus');
      const maps = lienMapsPropre(input.value);
      if(input.value.trim() && !maps){
        if(status) status.textContent = 'Le lien doit commencer par https:// (ex : https://maps.app.goo.gl/…).';
        return;
      }
      currentUser.maps = maps;
      saveSession();
      if(currentUser.name) upsertProfile(currentUser.name, { maps: maps });
      const auth = sbAuth();
      if(auth) auth.updateUser({ data: { maps: maps } }).then(function(){}, function(){});
      if(window.__sb && window.__sb.rpc){
        window.__sb.rpc('set_mon_lien_maps', { lien: maps }).then(function(){}, function(){});
      }
      input.value = maps;
      input.dispatchEvent(new Event('input'));
      if(status) status.textContent = maps ? 'Lien enregistré.' : 'Lien retiré.';
    });
  }

  const profileMapsSend = document.getElementById('profileMapsSend');
  if(profileMapsSend){
    profileMapsSend.addEventListener('click', function(){
      const lien = lienMapsPropre(document.getElementById('profileMaps').value);
      const status = document.getElementById('profileMapsStatus');
      if(!lien){ if(status) status.textContent = 'Mettez d\'abord votre lien Maps.'; return; }
      envoyerLienMaps(profileMapsDest ? profileMapsDest.value : '', lien, status);
    });
  }
  // Le choix : Google Maps (le lien tel quel) ou la carte du site
  // (carte-libre.js), qui s'ouvre sans quitter l'application.
  const profileMapsSite = document.getElementById('profileMapsSite');
  if(profileMapsSite){
    profileMapsSite.addEventListener('click', function(){
      const lien = lienMapsPropre(document.getElementById('profileMaps').value);
      if(lien && window.ouvrirLienMapsDansLeSite){
        window.ouvrirLienMapsDansLeSite(lien, (currentUser && currentUser.name) || '');
      }
    });
  }

  // ---------------- MOT DE BIENVENUE ----------------
  // Première chose vue en arrivant sur le site. Tant qu'il est là, l'avis
  // d'abonnement attend son tour : deux fenêtres l'une sur l'autre, personne
  // ne lit ni l'une ni l'autre.
  let welcomeOpen = false;
  let noticeWaitsForWelcome = false;

  // Le mot de bienvenue est devenu un petit guide de quelques pages (essai,
  // abonnement, inscription). Il s'ouvre à chaque arrivée sur le site (choix
  // de l'utilisateur, 19/10/2026). Une fois lu, l'avis « Essai gratuit » qu'il
  // remplace ne le répète pas dans la même visite.
  let guideVuIci = false;
  function guideDejaVu(){ return guideVuIci; }
  function marquerGuideVu(){ guideVuIci = true; }
  let guidePage = 1;
  function guidePages(){
    return document.querySelectorAll('#welcomeOverlay .guide-page');
  }
  function showGuidePage(n){
    // La visite d'une partie se referme quand le guide reprend.
    if(typeof hidyNyPartie === 'function') hidyNyPartie();
    const pages = guidePages();
    guidePage = Math.max(1, Math.min(n, pages.length));
    pages.forEach(function(p){
      const ici = Number(p.dataset.page) === guidePage;
      p.style.display = ici ? 'block' : 'none';
      // La page qui arrive glisse en place, son image avec elle.
      p.classList.remove('guide-entre');
      if(ici){ void p.offsetWidth; p.classList.add('guide-entre'); }
    });
    const dots = document.getElementById('guideDots');
    if(dots){
      dots.innerHTML = '';
      for(let i = 1; i <= pages.length; i++){
        const d = document.createElement('span');
        d.style.cssText = 'width:8px; height:8px; border-radius:50%; background:' +
          (i === guidePage ? 'var(--cyan)' : 'var(--line)') + ';';
        dots.appendChild(d);
      }
    }
    const next = document.getElementById('welcomeEnterBtn');
    if(next) next.textContent = guidePage === pages.length ? 'Commencer l\'inscription' : 'Suivant →';
    const prev = document.getElementById('guidePrevBtn');
    if(prev) prev.style.visibility = guidePage > 1 ? 'visible' : 'hidden';
  }

  function showWelcome(){
    const box = document.getElementById('welcomeOverlay');
    if(!box) return;
    showGuidePage(1);
    box.style.display = 'flex';
    welcomeOpen = true;
  }

  // showPending : le visiteur a fermé le mot de bienvenue et reste sur la page
  // de connexion, l'avis d'abonnement peut donc s'afficher. Quand c'est une
  // session déjà ouverte qui l'écarte, il n'y a plus lieu de le montrer.
  function closeWelcome(showPending){
    const box = document.getElementById('welcomeOverlay');
    if(box) box.style.display = 'none';
    if(!welcomeOpen) return;
    welcomeOpen = false;
    if(showPending) marquerGuideVu();
    const pending = noticeWaitsForWelcome;
    const entree = entreeLibreAttendBienvenue;
    noticeWaitsForWelcome = false;
    entreeLibreAttendBienvenue = false;
    // « Entrer » entre vraiment : pendant la fenêtre d'entrée libre, c'est
    // l'application qui s'ouvre derrière, et non l'écran de connexion.
    if(entree && showPending){ ouvrirEnVisiteur(); return; }
    if(pending && showPending) showAutoNotice();
  }

  // ---------------- L'ENTRÉE LIBRE (sans compte) ----------------
  // Comme l'avis d'abonnement, l'ouverture attend que le mot de bienvenue soit
  // refermé : openApp() le referme au passage, et l'emporterait avant qu'il ait
  // été lu.
  let entreeLibreAttendBienvenue = false;

  function ouvrirEnVisiteur(){
    // Ny asako Hôtel n'a pas d'entrée libre : sans compte, il n'y aurait que
    // la Botika à montrer, et elle n'est pas de cette application. On se
    // connecte (« Bon retour »).
    if(document.documentElement.classList.contains('app-hotely')){
      loginScreen.style.display = 'flex';
      showLoginMode('quick');
      return;
    }
    // Il n'y a rien à remplir : l'écran de connexion s'efface tout de suite,
    // même s'il faut encore attendre que le mot de bienvenue soit lu. Sinon on
    // le devine derrière, et il dit le contraire de ce qu'on est en train de
    // lire.
    loginScreen.style.display = 'none';
    if(welcomeOpen){ entreeLibreAttendBienvenue = true; return; }
    modeVisiteur = true;
    document.body.classList.add('mode-visiteur');
    // La place du menu où s'affiche d'habitude le titulaire du compte dit ici
    // ce qui en tient lieu, et pour combien de temps encore.
    const reste = freeEntryDaysLeft();
    document.getElementById('currentUserName').textContent = 'Essai libre';
    document.getElementById('currentUserEmail').textContent =
      'Sans compte — encore ' + reste + ' jour' + (reste > 1 ? 's' : '');
    const ouvrir = function(){
      openApp();
      // Arrivé par un lien de direct ou d'appel (live.js), on n'a rien à faire
      // sur l'Accueil : openApp vient d'ouvrir la page qu'il fallait, et
      // l'Accueil la refermerait aussitôt. L'avis d'essai libre attend aussi
      // son tour — il recouvrirait le direct pour lequel on vient d'entrer, et
      // il se redira à la prochaine ouverture.
      const parUnLien = (typeof pendingLinkAction === 'function') && pendingLinkAction();
      if(parUnLien) return;
      ouvrirSurLAccueil();
      // L'avis dit la règle : ce qui est offert, jusqu'à quand, et à partir de
      // quand il faudra un compte puis un abonnement.
      showAutoNotice();
    };
    // les autres fichiers (stock.js, ventes-achats.js...) ne sont chargés
    // qu'après common.js : on attend qu'ils le soient pour ouvrir l'appli.
    if(document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', ouvrir);
    } else {
      setTimeout(ouvrir, 0);
    }
  }

  // Personne n'est connecté : on entre sans compte tant que la fenêtre est
  // ouverte ; après, l'écran de connexion reprend sa place.
  function entrerSansCompte(){
    if(inFreeEntryWindow()){ ouvrirEnVisiteur(); return; }
    showAutoNotice();
  }

  // Quitter l'essai libre pour créer le compte. Rien n'est effacé : le stock,
  // les mouvements et les factures saisis sans compte sont rangés sous les
  // mêmes clés, et se retrouvent tels quels une fois le compte créé ici.
  function quitterLEssaiLibre(){
    modeVisiteur = false;
    document.body.classList.remove('mode-visiteur');
    appScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    showLoginMode('full');
  }

  const welcomeCloseBtn = document.getElementById('welcomeClose');
  if(welcomeCloseBtn) welcomeCloseBtn.addEventListener('click', function(){ closeWelcome(true); });
  const welcomeEnterBtn = document.getElementById('welcomeEnterBtn');
  if(welcomeEnterBtn) welcomeEnterBtn.addEventListener('click', function(){
    if(guidePage < guidePages().length){ showGuidePage(guidePage + 1); return; }
    // Dernière page : on mène à la première inscription (ou, pendant l'entrée
    // libre, closeWelcome ouvre l'application sans compte).
    closeWelcome(true);
    if(!modeVisiteur && loginScreen.style.display !== 'none'){
      showLoginMode('full');
      const first = document.getElementById('loginFirstName');
      if(first) first.focus();
    }
  });
  // « Se connecter » / « Créer un compte » : on quitte le guide pour le
  // formulaire choisi, même pendant l'entrée libre (sinon closeWelcome
  // ouvrirait l'application sans compte à la place).
  function quitterGuideVers(mode){
    entreeLibreAttendBienvenue = false;
    closeWelcome(true);
    modeVisiteur = false;
    document.body.classList.remove('mode-visiteur');
    appScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    showLoginMode(mode);
    const champ = document.getElementById(mode === 'quick' ? 'quickEmail' : 'loginFirstName');
    if(champ) champ.focus();
  }
  const guideLoginBtn = document.getElementById('guideLoginBtn');
  if(guideLoginBtn) guideLoginBtn.addEventListener('click', function(){ quitterGuideVers('quick'); });
  const guideSignupBtn = document.getElementById('guideSignupBtn');
  if(guideSignupBtn) guideSignupBtn.addEventListener('click', function(){ quitterGuideVers('full'); });
  // La flèche de la première page : tout ce que contient Ny asako, déplié
  // ou replié.
  const guideToutBtn = document.getElementById('guideToutBtn');
  if(guideToutBtn) guideToutBtn.addEventListener('click', function(){
    const liste = document.getElementById('guideTout');
    if(!liste) return;
    const ouvrir = liste.hidden;
    liste.hidden = !ouvrir;
    guideToutBtn.setAttribute('aria-expanded', ouvrir ? 'true' : 'false');
  });
  // Chaque flèche de la liste ouvre la visite de sa partie : quelques pages
  // qui expliquent ce qu'on y fait, une chose par page. Elles prennent la
  // place du guide le temps qu'on les lit ; « Retour à la liste » le rend.
  const GUIDE_PARTIES = {
    stock: { ikona: '📦', nom: 'Stock & Articles', pages: [
      ['➕ Ajouter un article', 'Dans <b>📋 Articles</b>, donnez le <b>nom</b>, le <b>prix</b>, la <b>quantité</b> et, si vous voulez, une photo et une catégorie. L\'article est prêt à être vendu.'],
      ['🔄 Entrées et sorties', 'Chaque <b>achat</b> fait monter la quantité, chaque <b>vente</b> la fait descendre. L\'<b>historique</b> garde tous les mouvements, avec la date.'],
      ['⚠️ Ruptures', 'Quand un article arrive à <b>zéro</b>, une alerte vous prévient. Son annonce dans le fil Botika s\'en va toute seule : personne ne commande ce que vous n\'avez plus.']
    ] },
    factures: { ikona: '🧾', nom: 'Factures & PDF', pages: [
      ['🛍️ Choisir les articles', 'Prenez les articles du stock et leur quantité : les prix et le <b>total</b> se calculent tout seuls.'],
      ['🏷️ Votre en-tête', 'La facture porte votre <b>logo</b>, votre nom, votre <b>NIF</b> et votre <b>STAT</b>, tels que vous les avez mis dans votre profil.'],
      ['🖨️ PDF', 'Chaque facture se range dans <b>PDF</b> : imprimez-la, ou envoyez-la par WhatsApp ou par email en un toucher.']
    ] },
    botika: { ikona: '🛒', nom: 'Botika', pages: [
      ['📝 Publier', 'Dans le <b>fil</b>, écrivez votre nouvelle, ajoutez des <b>photos</b>, et cochez 🛒 pour vendre un article avec son prix.'],
      ['🎬 Vidéos et stories', 'Une vidéo se met par son <b>lien</b> (YouTube, Facebook, TikTok…) avec 🎬. Les <b>stories</b> montrent vos nouveautés en haut du fil.'],
      ['🛍️ Vos clients', 'Ils aiment, commentent, mettent au <b>panier</b> et partagent, depuis leur téléphone, même <b>sans compte</b>.']
    ] },
    hotel: { ikona: '🏨', nom: 'Ny asako Hôtel', pages: [
      ['🍽️ Le menu', 'Vos plats avec leur <b>photo</b> et leur <b>prix</b>, rangés par catégorie, faciles à changer.'],
      ['📱 Un QR par table', 'Le client scanne le <b>QR</b> de sa table, choisit ses plats et commande : la table est connue d\'avance.'],
      ['👨‍🍳 Cuisine et paiement', 'La commande arrive en <b>cuisine</b> sur la tablette. Le client paie par <b>Mobile Money</b>. Ny asako Hôtel s\'installe à part, comme une application.']
    ] },
    wallet: { ikona: '💰', nom: 'Portefeuille', pages: [
      ['⬇️ Déposer', 'Mettez de l\'argent sur votre <b>solde</b> par MVola, Orange Money ou Airtel Money.'],
      ['⬆️ Retirer', 'Renvoyez votre solde vers votre <b>Mobile Money</b>, quand vous voulez.'],
      ['🔁 Envoyer', 'Envoyez de l\'argent à un autre compte avec son <b>ID KEY</b>. Vos <b>invitations</b> remplissent aussi le portefeuille.']
    ] },
    live: { ikona: '🔴', nom: 'Live & Appels', pages: [
      ['🎥 Lancer un Live', 'Montrez vos produits en <b>vidéo</b>, en direct. Ceux qui sont en ligne sont prévenus et regardent depuis le fil.'],
      ['📞 Appeler', 'Appels <b>audio</b> et <b>vidéo</b> vers un client, sans quitter l\'application. Le point <b>vert</b> dit qui est en ligne.'],
      ['💬 Écrire', 'Le <b>message direct</b> : texte, emoji, photos et vidéos, avec vos clients et même avec les visiteurs.']
    ] },
    mpiasa: { ikona: '👷', nom: 'Mpiasa & Livreur', pages: [
      ['👤 Ajouter un employé', 'Donnez son nom : il reçoit son <b>propre lien</b>, et entre sans mot de passe.'],
      ['🕒 Ses heures et ses tâches', 'L\'employé voit ce qu\'il a à faire et marque ses <b>heures</b>. Vous suivez tout depuis votre compte.'],
      ['🛵 Le livreur', 'Il suit ses <b>courses</b>, et vous voyez sa <b>position</b> sur la carte pendant la livraison.']
    ] },
    toerana: { ikona: '📍', nom: 'Toerana & Maps', pages: [
      ['🏠 Votre adresse', 'Collez le lien de partage de <b>Google Maps</b>, ou touchez <b>Ma position</b> : votre adresse est sur la carte.'],
      ['🧭 L\'itinéraire', 'Vos clients ouvrent le <b>trajet</b> jusqu\'à vous : à pied, en voiture, ou en avion pour les plus loin.'],
      ['🛵 Le livreur sur la carte', 'Pendant une livraison, sa <b>position</b> avance sur la carte, chez vous et chez le client.']
    ] },
    outils: { ikona: '📒', nom: 'Bureau', pages: [
      ['🗒️ Notes', 'Écrivez ce que vous ne voulez pas oublier : une commande, un numéro, une idée.'],
      ['🧮 Calculatrice', 'Les calculs de tous les jours, sans quitter Ny asako.'],
      ['📅 Calendrier et horaire', 'Vos rendez-vous dans le <b>calendrier</b>, et l\'<b>horaire</b> de la semaine. Ces outils restent dans ce navigateur.']
    ] },
    inviter: { ikona: '✉️', nom: 'Inviter & Contact', pages: [
      ['📤 Inviter', 'Partagez votre <b>lien</b> sur WhatsApp, Facebook ou ailleurs. Chaque invitation remplit votre <b>portefeuille</b>.'],
      ['🔗 Vos canaux', 'Dans <b>Ajouter les liens</b>, touchez un logo et écrivez votre nom ou numéro : le lien se fait et s\'enregistre tout seul.'],
      ['📨 Contact', 'Une question ? <b>Contact</b> nous écrit directement, et <b>Message</b> vous permet d\'écrire à vos inscrits.']
    ] },
    compte: { ikona: '⚙️', nom: 'Votre compte', pages: [
      ['📅 Abonnement', '<b>Mensuel</b> ou <b>annuel</b>, avec sa date de fin toujours visible.'],
      ['🎨 Fond d\'écran', 'Choisissez le <b>fond</b> et le <b>thème</b> de l\'application, clair ou sombre.'],
      ['🗑️ Corbeille et paramètres', 'La <b>Corbeille</b> rend une publication effacée. Les <b>Paramètres</b> gardent votre profil, votre logo et vos informations.']
    ] }
  };
  let partieOuverte = null, partiePage = 0;
  function hidyNyPartie(){
    const zone = document.getElementById('guidePartie');
    if(!zone || zone.hidden) return;
    zone.hidden = true;
    zone.parentNode.classList.remove('partie-misokatra');
    partieOuverte = null;
  }
  function asehoyNyPartie(cle, n){
    const partie = GUIDE_PARTIES[cle];
    const zone = document.getElementById('guidePartie');
    if(!partie || !zone) return;
    partieOuverte = cle;
    partiePage = Math.max(0, Math.min(n, partie.pages.length - 1));
    const p = partie.pages[partiePage];
    const farany = partiePage === partie.pages.length - 1;
    zone.innerHTML =
      '<div class="guide-entre" style="text-align:center;">' +
        '<div class="guide-ikona" aria-hidden="true">' + partie.ikona + '</div>' +
        '<div class="eyebrow">' + partie.nom.replace(/&/g, '&amp;') + ' · ' + (partiePage + 1) + '/' + partie.pages.length + '</div>' +
        '<h1 style="font-size:1.35rem; margin-bottom:0.9rem;">' + p[0] + '</h1>' +
        '<p class="sub" style="font-size:0.95rem;">' + p[1] + '</p>' +
      '</div>' +
      '<div class="gp-dots" aria-hidden="true">' + partie.pages.map(function(_, i){
        return '<span' + (i === partiePage ? ' class="ici"' : '') + '></span>'; }).join('') + '</div>' +
      '<div class="gp-nav">' +
        '<button type="button" class="btn btn-sm" data-gp="teo"' + (partiePage ? '' : ' style="visibility:hidden;"') + '>← Précédent</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-gp="manaraka">' + (farany ? '✓ Terminé' : 'Suivant →') + '</button>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" data-gp="lisitra" style="width:100%; margin-top:0.6rem;">☰ Retour à la liste</button>';
    zone.hidden = false;
    zone.parentNode.classList.add('partie-misokatra');
    zone.querySelector('[data-gp="teo"]').addEventListener('click', function(){ asehoyNyPartie(cle, partiePage - 1); });
    zone.querySelector('[data-gp="manaraka"]').addEventListener('click', function(){
      if(farany) miverinaAmNyLisitra(); else asehoyNyPartie(cle, partiePage + 1);
    });
    zone.querySelector('[data-gp="lisitra"]').addEventListener('click', miverinaAmNyLisitra);
    zone.parentNode.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // On revient à la première page, la liste dépliée, là où on l'avait laissée.
  function miverinaAmNyLisitra(){
    hidyNyPartie();
    showGuidePage(1);
    const liste = document.getElementById('guideTout');
    if(liste) liste.hidden = false;
    if(guideToutBtn) guideToutBtn.setAttribute('aria-expanded', 'true');
  }
  document.querySelectorAll('#guideTout [data-guide-vers]').forEach(function(b){
    b.addEventListener('click', function(){ asehoyNyPartie(b.dataset.guideVers, 0); });
  });
  // « Installer Ny asako Hôtel » : sa page /hotely, dans un onglet (ou son
  // adresse à ouvrir dans Chrome, depuis Ny asako déjà installée).
  const guideHotelInstaller = document.getElementById('guideHotelInstaller');
  if(guideHotelInstaller) guideHotelInstaller.addEventListener('click', function(e){
    if(typeof window.__versLInstallation !== 'function') return;
    e.preventDefault();
    window.__versLInstallation('/hotely', '');
  });
  const guidePrevBtn = document.getElementById('guidePrevBtn');
  if(guidePrevBtn) guidePrevBtn.addEventListener('click', function(){ showGuidePage(guidePage - 1); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && welcomeOpen) closeWelcome(true);
  });

  function showAutoNotice(){
    if(welcomeOpen){ noticeWaitsForWelcome = true; return; }
    // Arrivée par un lien reçu par email : la vérification de session se
    // terminait après coup et faisait remonter cet avis par-dessus le message
    // qui compte — celui qui explique quoi faire du lien.
    if(authLinkTookOver) return;
    const st = getSubscriptionStatus();
    const modal = document.getElementById('autoNoticeModal');
    const closeBtn = document.getElementById('autoNoticeClose');
    const loginBtn = document.getElementById('autoNoticeLoginBtn');
    const title = document.getElementById('autoNoticeTitle');
    const text = document.getElementById('autoNoticeText');

    if(st.status === 'expired'){
      title.textContent = 'Abonnement requis';
      text.innerHTML = 'Votre essai gratuit de <strong>15 jours</strong> est terminé. L\'accès est <strong>bloqué</strong> ' +
        'tant que le paiement (mensuel ou annuel) n\'est pas confirmé par le <strong>code de déverrouillage</strong> ' +
        'envoyé par email. Connectez-vous pour recevoir votre code.';
      closeBtn.style.display = 'none';
      loginBtn.style.display = 'block';
    } else {
      // Le guide de première visite a déjà tout expliqué : on ne le redit pas.
      if(guideDejaVu()) return;
      title.textContent = 'Essai gratuit & abonnement';
      // Tant que la fenêtre est ouverte, l'avis commence par ce qui vient de se
      // passer sous les yeux : on est entré sans rien remplir, et voilà pourquoi.
      const sansCompte = inFreeEntryWindow()
        ? 'Les <strong>' + FREE_ENTRY_DAYS + ' premiers jours</strong>, l\'application s\'ouvre ' +
          '<strong>sans compte</strong> : rien à remplir, on entre. Passé ce délai, un ' +
          '<strong>compte</strong> est demandé — l\'essai, lui, continue jusqu\'au 15<sup>e</sup> jour, ' +
          'et ce qui a été saisi reste en place. '
        : '';
      text.innerHTML = sansCompte + 'L\'application est <strong>gratuite pendant 15 jours</strong>. Passé ce délai, un abonnement ' +
        '<strong>mensuel</strong> ou <strong>annuel</strong> sera demandé pour continuer à l\'utiliser. ' +
        'En cas de non-paiement, l\'accès sera bloqué ; un <strong>code de déverrouillage</strong> vous sera ' +
        'alors envoyé par email pour réactiver votre compte.';
      closeBtn.style.display = 'block';
      loginBtn.style.display = 'none';
    }
    modal.style.display = 'flex';
  }
  document.getElementById('autoNoticeClose').addEventListener('click', function(){
    document.getElementById('autoNoticeModal').style.display = 'none';
  });
  document.getElementById('autoNoticeLoginBtn').addEventListener('click', function(){
    document.getElementById('autoNoticeModal').style.display = 'none';
    // Le champ à remplir dépend du formulaire affiché : « Bon retour » ou inscription.
    const quickVisible = quickLoginForm && quickLoginForm.style.display !== 'none';
    const firstField = document.getElementById(quickVisible ? 'quickEmail' : 'loginFirstName');
    if(firstField) firstField.focus();
  });

  const creerCompteBtn = document.getElementById('creerCompteBtn');
  if(creerCompteBtn) creerCompteBtn.addEventListener('click', function(){ quitterLEssaiLibre(); });

  document.getElementById('logoutBtn').addEventListener('click', function(){
    teardownRealtimeFeatures();
    var authOut = sbAuth();
    if(authOut) authOut.signOut().then(function(){}, function(){});
    clearSession();
    currentUser = null; porterLeNomDuCompte();
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    if(quickLoginForm) quickLoginForm.reset();
    // Après une déconnexion le compte existe déjà : on revient sur
    // « Bon retour » (email + mot de passe), pas sur l'inscription.
    showLoginMode('quick');
    showAutoNotice();
  });

  // ---------------- SUPPRIMER MON COMPTE ----------------
  // La fonction fafao-kaonty efface le compte de la session et ce qu'il
  // possède ; ici, on n'a plus qu'à oublier ce que l'appareil en garde et à
  // revenir à la connexion. Le panneau suit le compte affiché (le nom change
  // à chaque connexion, porterLeNomDuCompte le surveille déjà).
  const fafaoKaontyPanel = document.getElementById('fafaoKaontyPanel');
  const fafaoKaontyInput = document.getElementById('fafaoKaontyInput');
  const fafaoKaontyBtn = document.getElementById('fafaoKaontyBtn');
  function majFafaoKaonty(){
    if(!fafaoKaontyPanel) return;
    const email = currentUser && currentUser.email ? String(currentUser.email) : '';
    fafaoKaontyPanel.style.display = (email && !MODE_MPIASA && !isOwnerEmail(email)) ? '' : 'none';
  }
  (function(){
    const el = document.getElementById('currentUserEmail');
    if(el && window.MutationObserver){
      new MutationObserver(majFafaoKaonty).observe(el, { childList: true, characterData: true, subtree: true });
    }
  })();
  if(fafaoKaontyInput && fafaoKaontyBtn){
    fafaoKaontyInput.addEventListener('input', function(){
      fafaoKaontyBtn.disabled = fafaoKaontyInput.value.trim().toUpperCase() !== 'FAFAO';
    });
    fafaoKaontyBtn.addEventListener('click', function(){
      const status = document.getElementById('fafaoKaontyStatus');
      const email = currentUser && currentUser.email ? String(currentUser.email) : '';
      if(!email || !window.__sb || !window.__sb.functions){
        if(status) status.textContent = 'Serveur injoignable : vérifiez votre réseau.';
        return;
      }
      if(!confirm('Supprimer définitivement le compte ' + email + ' et toutes ses données ? Rien ne pourra être récupéré.')) return;
      fafaoKaontyBtn.disabled = true;
      if(status) status.textContent = 'Suppression en cours…';
      window.__sb.functions.invoke('fafao-kaonty', { body: { confirmation: 'FAFAO' } }).then(function(r){
        const d = r && r.data;
        if(r.error || !d || !d.ok){
          fafaoKaontyBtn.disabled = false;
          if(status) status.textContent = 'Compte non supprimé : ' + ((d && d.error) || (r.error && r.error.message) || 'réessayez') + '.';
          return;
        }
        // Ce que cet appareil garde du compte : son profil et son email retenu.
        const profiles = loadProfiles();
        Object.keys(profiles).forEach(function(k){
          if(normEmail(profiles[k].email) === normEmail(email)) delete profiles[k];
        });
        saveProfiles(profiles);
        try { if(normEmail(loadLastEmail()) === normEmail(email)) localStorage.removeItem(STORAGE_LAST_EMAIL); } catch(e){}
        fafaoKaontyInput.value = '';
        if(status) status.textContent = '';
        alert('Votre compte a été supprimé.');
        document.getElementById('logoutBtn').click();
      }, function(){
        fafaoKaontyBtn.disabled = false;
        if(status) status.textContent = 'Compte non supprimé : vérifiez votre réseau.';
      });
    });
  }

  document.getElementById('paywallLogoutBtn').addEventListener('click', function(){
    clearSession();
    currentUser = null; porterLeNomDuCompte();
    paywallScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    if(quickLoginForm) quickLoginForm.reset();
    // Après une déconnexion le compte existe déjà : on revient sur
    // « Bon retour » (email + mot de passe), pas sur l'inscription.
    showLoginMode('quick');
    showAutoNotice();
  });

  const abonnementOuvrir = document.getElementById('abonnementOuvrirBtn');
  if(abonnementOuvrir) abonnementOuvrir.addEventListener('click', function(){ openPaywall(); });
  // L'état se relit à l'ouverture de la page : un jour a pu passer, ou le
  // portefeuille avoir payé, depuis la dernière fois qu'on l'a regardée.
  const navAbonnement = document.querySelector('#navList .nav-item[data-section="abonnement"]');
  if(navAbonnement) navAbonnement.addEventListener('click', majPageAbonnement);

  // Au chargement : si une session est enregistrée, on rouvre directement
  // l'application (et la vue précédente) ; sinon on affiche l'écran de connexion.
  const savedSession = MODE_MPIASA ? null : loadSession();
  if(MODE_MPIASA){
    // L'employé n'entre pas par un compte : vue-mpiasa.js ouvre l'application
    // pour lui. Ni session du patron à rouvrir, ni écran de connexion.
  } else if(savedSession && savedSession.name && savedSession.email){
    currentUser = savedSession;
    loginScreen.style.display = 'none';
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserEmail').textContent = currentUser.email;
    // les autres fichiers (stock.js, ventes-achats.js...) ne sont chargés
    // qu'après common.js : on attend qu'ils le soient pour ouvrir l'appli.
    const resumeSession = function(){
      if(getSubscriptionStatus().status === 'expired'){
        openPaywall();
      } else {
        openApp();
        ouvrirSurLAccueil();
      }
    };
    if(document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', resumeSession);
    } else {
      setTimeout(resumeSession, 0);
    }
  } else {
    showWelcome();
    refreshLoginMode();
    const bootAuth = sbAuth();
    if(bootAuth){
      // une session Supabase valide (autre onglet, autre appareil déjà connecté
      // sur ce navigateur) rouvre l'application sans redemander le mot de passe
      bootAuth.getSession().then(function(res){
        const session = res && res.data && res.data.session;
        if(session && session.user){
          const notice = document.getElementById('autoNoticeModal');
          if(notice) notice.style.display = 'none';
          apresGoogle(session.user);
          openAppForAuthUser(session.user, { restoreView: true });
        } else {
          entrerSansCompte();
        }
      }, function(){ entrerSansCompte(); });
    } else {
      entrerSansCompte();
    }
  }
  // Un lien de réinitialisation l'emporte sur tout le reste : la personne
  // arrive ici pour changer son mot de passe, pas pour voir l'écran habituel.
  handleAuthLink();
  initWalletAuth();

  document.getElementById('walletSignOutBtn').addEventListener('click', walletSignOut);
  document.getElementById('goLiveFacebookBtn').addEventListener('click', function(){
    window.open('https://www.facebook.com/live/producer', '_blank');
  });

  document.getElementById('planMensuel').addEventListener('click', function(){
    selectedPlan = 'mensuel';
    document.getElementById('planMensuel').classList.add('selected');
    document.getElementById('planAnnuel').classList.remove('selected');
    majBoutonAbonnement();
  });
  document.getElementById('planAnnuel').addEventListener('click', function(){
    selectedPlan = 'annuel';
    document.getElementById('planAnnuel').classList.add('selected');
    document.getElementById('planMensuel').classList.remove('selected');
    majBoutonAbonnement();
  });

  document.getElementById('sendCodeBtn').addEventListener('click', function(){
    if(!currentUser || !currentUser.name){ alert('Nom introuvable.'); return; }
    notifyOwnerOfPayment(currentUser.name, currentUser.email, currentUser.phone, selectedPlan);
    document.getElementById('codeStatus').textContent = 'Un mail a été préparé pour le vendeur avec votre nom (' + currentUser.name + '). Il vous communiquera votre code de déverrouillage.';
  });

  document.getElementById('paywallCodeInput').addEventListener('input', function(){
    const val = this.value.trim();
    document.getElementById('confirmPaymentBtn').disabled = val.length !== 6;
  });

  document.getElementById('confirmPaymentBtn').addEventListener('click', function(){
    if(!currentUser || !currentUser.email){ alert('Email introuvable.'); return; }
    const codeInput = document.getElementById('paywallCodeInput');
    const val = codeInput.value.trim();
    const status = document.getElementById('codeStatus');
    if(val.length !== 6){ status.textContent = 'Le code doit contenir 6 chiffres.'; return; }

    const result = checkClientCode(currentUser.email, val);
    status.textContent = result.message;

    if(!result.ok){
      codeInput.value = '';
      document.getElementById('confirmPaymentBtn').disabled = true;
      return;
    }

    const sub = ensureInstallDate();
    const now = new Date();
    const bankedDays = sub.subscriptionCreditDays || 0;
    const durationDays = (selectedPlan === 'annuel' ? 365 : 30) + bankedDays;
    sub.plan = selectedPlan;
    sub.paidUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    sub.subscriptionCreditDays = 0;
    saveSubscription(sub);
    alert('Compte débloqué. Merci ! Votre abonnement ' + (selectedPlan === 'annuel' ? 'annuel' : 'mensuel') +
      ' est actif' + (bankedDays > 0 ? (' (dont ' + bankedDays + ' jours offerts par votre portefeuille).') : '.'));
    openApp();
  });

  // ---------------- NAVIGATION ----------------
  // Deux portes pour un seul menu, jamais ouvertes en même temps : la loupe de
  // la rangée du bas sur téléphone, le hamburger qu'on pose où l'on veut sur
  // ordinateur. Le CSS décide laquelle paraît ; le code les traite ensemble.
  var menuToggle = document.getElementById('menuToggle');
  var menuFlottant = document.getElementById('menuFlottant');
  var portesDuMenu = [menuToggle, menuFlottant].filter(Boolean);
  // Les autres panneaux (notifications, achats, réglages) s'ouvrent au même
  // endroit : la fonction est posée ici et servie à tous.
  var placerPresDuMenu = function(){};
  var navList = document.getElementById('navList');
  if(portesDuMenu.length && navList){
    const MENU_POS_KEY = 'stockmanager_menu_pos';
    const MARGE = 8;
    document.body.appendChild(navList);
    navList.classList.add('floating');
    if(menuFlottant) document.body.appendChild(menuFlottant);

    function flottantVisible(){
      return !!menuFlottant && getComputedStyle(menuFlottant).display !== 'none';
    }

    // ---- Ce que l'œil voit, et non ce que la page mesure ----
    function bordSur(nom){
      const v = getComputedStyle(document.documentElement).getPropertyValue(nom);
      const n = parseFloat(v);
      return isFinite(n) ? n : 0;
    }
    function hauteurRangee(){
      const r = document.querySelector('.dash-tabs-main');
      // Une rangée escamotée ne prend plus de place : le panneau peut descendre.
      return (r && !r.classList.contains('barre-cachee'))
        ? r.getBoundingClientRect().height : 0;
    }
    function zoneVisible(){
      const vv = window.visualViewport;
      const base = vv
        ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height }
        : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      const haut = bordSur('--sur-haut'), bas = bordSur('--sur-bas');
      const gauche = bordSur('--sur-gauche'), droite = bordSur('--sur-droite');
      return {
        x: base.x + gauche, y: base.y + haut,
        w: Math.max(0, base.w - gauche - droite),
        h: Math.max(0, base.h - haut - bas - hauteurRangee())
      };
    }

    // ---- Le panneau ----
    // Près du hamburger quand il est là ; au-dessus de la rangée sinon, d'où la
    // loupe l'appelle.
    placerPresDuMenu = function(el){
      if(flottantVisible()){
        const b = menuFlottant.getBoundingClientRect();
        const n = el.getBoundingClientRect();
        const z = zoneVisible();
        let left = b.left;
        if(left + n.width > z.x + z.w - MARGE) left = b.right - n.width;
        left = Math.max(z.x + MARGE, Math.min(left, z.x + z.w - n.width - MARGE));
        let top = b.bottom + 6;
        if(top + n.height > z.y + z.h - MARGE) top = b.top - n.height - 6;
        top = Math.max(z.y + MARGE, top);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.bottom = 'auto';
        el.style.maxHeight = Math.max(160, z.y + z.h - top - MARGE) + 'px';
      } else {
        const haute = hauteurRangee();
        const large = el.getBoundingClientRect().width;
        let gauche = (window.innerWidth - large) / 2;
        gauche = Math.max(MARGE, Math.min(gauche, window.innerWidth - large - MARGE));
        el.style.left = gauche + 'px';
        el.style.top = 'auto';
        el.style.bottom = (haute + 10) + 'px';
        el.style.maxHeight = Math.max(160, window.innerHeight - haute - 10 - MARGE) + 'px';
      }
      el.style.overflowY = 'auto';
    };
    function placerPanneau(){
      if(!navList.classList.contains('open')) return;
      placerPresDuMenu(navList);
    }

    // ---- La recherche dans le menu (téléphone) ----
    const champ = document.getElementById('menuRecherche');
    const vide = document.getElementById('menuVide');

    function entreesDuMenu(){
      return [].slice.call(navList.children).filter(function(el){
        return el.classList.contains('nav-item') || el.classList.contains('nav-action');
      });
    }
    function filtrer(){
      if(!champ) return;
      const q = champ.value.trim().toLowerCase();
      let trouves = 0;
      entreesDuMenu().forEach(function(el){
        // « Stock » est masqué exprès : le filtre ne doit pas le ressusciter.
        if(el.id === 'navStock') return;
        const cache = el.dataset.masque === '1';
        const correspond = !q || el.textContent.toLowerCase().indexOf(q) >= 0;
        if(!cache) el.style.display = correspond ? '' : 'none';
        if(correspond && !cache) trouves += 1;
      });
      if(vide) vide.style.display = (q && !trouves) ? 'block' : 'none';
      placerPanneau();
    }
    // « Espace admin » est caché pour les clients : on retient qu'il l'est,
    // sinon le filtre le rendrait visible au premier mot tapé.
    const admin = document.getElementById('navAdmin');
    function noterLesMasques(){
      if(admin) admin.dataset.masque = (admin.style.display === 'none') ? '1' : '0';
    }

    function ouvrirMenu(ouvert){
      navList.classList.toggle('open', ouvert);
      portesDuMenu.forEach(function(b){ b.setAttribute('aria-expanded', ouvert ? 'true' : 'false'); });
      if(ouvert){
        noterLesMasques();
        if(champ) champ.value = '';
        filtrer();
        requestAnimationFrame(function(){
          placerPanneau();
          // Le curseur attend dans le champ : on tape le nom de la page aussitôt
          // le menu ouvert, au doigt comme au clavier.
          if(champ) champ.focus({ preventScroll: true });
        });
      }
      updateTopbarHeight();
    }

    if(menuToggle){
      menuToggle.addEventListener('click', function(e){
        e.stopPropagation();
        ouvrirMenu(!navList.classList.contains('open'));
      });
    }

    // ---- « Actualiser », caché derrière le menu ----
    // Recharger la page, c'est ce qu'on fait quand une nouvelle version tarde
    // à venir ; mais une application installée n'a pas de barre d'adresse, ni
    // de bouton pour cela. Il se tient donc derrière le menu, sans prendre de
    // place : clic droit sur ordinateur, deux appuis rapides au téléphone. Il
    // paraît à côté du bouton du menu, et s'en va de lui-même.
    (function(){
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'bouton-actualiser';
      bouton.textContent = '🔄';
      bouton.title = 'Actualiser';
      bouton.setAttribute('aria-label', 'Actualiser la page');
      bouton.hidden = true;
      document.body.appendChild(bouton);
      let minuteur = null;

      function cacher(){
        bouton.hidden = true;
        clearTimeout(minuteur);
      }
      function montrerPres(porte){
        const r = porte.getBoundingClientRect();
        bouton.hidden = false;
        const l = bouton.offsetWidth || 44, h = bouton.offsetHeight || 44;
        // À droite du menu s'il y a la place, à gauche sinon ; à sa hauteur,
        // ramené dans l'écran.
        let x = r.right + 6;
        if(x + l > window.innerWidth - 4) x = r.left - l - 6;
        let y = r.top + (r.height - h) / 2;
        y = Math.max(4, Math.min(y, window.innerHeight - h - 4));
        bouton.style.left = Math.max(4, Math.round(x)) + 'px';
        bouton.style.top = Math.round(y) + 'px';
        clearTimeout(minuteur);
        minuteur = setTimeout(cacher, 6000);
      }

      bouton.addEventListener('click', function(e){
        e.stopPropagation();
        bouton.textContent = '⏳';
        // Le service worker va d'abord voir s'il y a plus récent : la page
        // rechargée prend alors la nouvelle version, pas la copie gardée.
        const recharger = function(){ location.reload(); };
        try {
          if(navigator.serviceWorker && navigator.serviceWorker.getRegistration){
            navigator.serviceWorker.getRegistration()
              .then(function(reg){ return reg ? reg.update() : null; })
              .then(recharger, recharger);
            setTimeout(recharger, 2500);
            return;
          }
        } catch(err){}
        recharger();
      });

      portesDuMenu.forEach(function(porte){
        // Ordinateur : le clic droit, à la place du menu du navigateur.
        porte.addEventListener('contextmenu', function(e){
          e.preventDefault();
          montrerPres(porte);
        });
        // Téléphone : deux appuis en moins d'un tiers de seconde. Le menu
        // s'ouvre au premier et se referme au second ; reste le bouton.
        let dernier = 0;
        porte.addEventListener('pointerup', function(e){
          if(e.pointerType === 'mouse') return;
          const maintenant = Date.now();
          if(maintenant - dernier < 350){
            dernier = 0;
            setTimeout(function(){ montrerPres(porte); }, 0);
          } else {
            dernier = maintenant;
          }
        });
      });

      document.addEventListener('click', function(e){
        if(bouton.hidden || bouton.contains(e.target)) return;
        if(portesDuMenu.some(function(p){ return p.contains(e.target); })) return;
        cacher();
      });
      window.addEventListener('resize', cacher);
    })();

    if(champ){
      champ.addEventListener('input', filtrer);
      // Entrée : on ouvre la seule page qui reste, sans avoir à viser.
      champ.addEventListener('keydown', function(e){
        if(e.key !== 'Enter') return;
        const restants = entreesDuMenu().filter(function(el){
          return el.style.display !== 'none' && el.id !== 'navStock';
        });
        if(restants.length === 1) restants[0].click();
      });
      champ.addEventListener('click', function(e){ e.stopPropagation(); });
    }

    document.addEventListener('click', function(e){
      if(!navList.classList.contains('open')) return;
      if(navList.contains(e.target)) return;
      if(portesDuMenu.some(function(b){ return b.contains(e.target); })) return;
      ouvrirMenu(false);
    });

    // ================= Le hamburger qu'on déplace =================
    if(menuFlottant){
      // Détaché de l'application, il s'afficherait aussi par dessus l'écran de
      // connexion — où il n'a rien à faire.
      const appScreenEl = document.getElementById('appScreen');
      let pret = false;
      function syncMenuVisibility(){
        const visible = appScreenEl && getComputedStyle(appScreenEl).display !== 'none';
        menuFlottant.style.visibility = visible ? '' : 'hidden';
        if(!visible){
          navList.classList.remove('open');
          portesDuMenu.forEach(function(b){ b.setAttribute('aria-expanded', 'false'); });
        }
        if(visible && pret){
          // La barre n'a de hauteur qu'une fois l'application affichée, et cette
          // hauteur n'est connue qu'à l'image suivante.
          requestAnimationFrame(function(){
            if(placeLibre) position = positionParDefaut();
            replacer();
          });
        }
      }
      if(appScreenEl){
        new MutationObserver(syncMenuVisibility)
          .observe(appScreenEl, { attributes: true, attributeFilter: ['style', 'class'] });
      }

      function tailleBouton(){
        const r = menuFlottant.getBoundingClientRect();
        return { w: r.width || 38, h: r.height || 38 };
      }
      function poserBouton(x, y){
        const t = tailleBouton();
        const z = zoneVisible();
        const minX = z.x + MARGE, minY = z.y + MARGE;
        const maxX = Math.max(minX, z.x + z.w - t.w - MARGE);
        const maxY = Math.max(minY, z.y + z.h - t.h - MARGE);
        const px = Math.min(Math.max(minX, x), maxX);
        const py = Math.min(Math.max(minY, y), maxY);
        menuFlottant.style.left = px + 'px';
        menuFlottant.style.top = py + 'px';
        return { x: px, y: py };
      }
      // Sous la ligne des boutons du haut : posé au coin, il viendrait sur le
      // nom. On mesure .sidebar-top et non .sidebar — celle-ci, étirée par la
      // grille, déborde bien plus bas que ce qu'elle donne à voir.
      function positionParDefaut(){
        const t = tailleBouton();
        const z = zoneVisible();
        const barre = document.querySelector('.sidebar-top');
        const bas = barre ? barre.getBoundingClientRect().bottom : 0;
        const y = bas > 0 ? bas + 12 : z.y + 16;
        return { x: z.x + z.w - t.w - 16, y: Math.min(Math.max(z.y + 16, y), z.y + z.h - t.h - 16) };
      }
      function chargerPosition(){
        try{
          const brut = JSON.parse(localStorage.getItem(MENU_POS_KEY));
          if(brut && typeof brut.x === 'number' && typeof brut.y === 'number') return brut;
        }catch(e){}
        return positionParDefaut();
      }
      let placeLibre = true;
      try{ placeLibre = !localStorage.getItem(MENU_POS_KEY); }catch(e){}
      function enregistrerPosition(pos){
        placeLibre = false;
        try{ localStorage.setItem(MENU_POS_KEY, JSON.stringify(pos)); }catch(e){}
      }

      const depart = chargerPosition();
      let position = poserBouton(depart.x, depart.y);
      pret = true;
      syncMenuVisibility();

      // Un seul chemin pour la souris comme pour le doigt : ce qu'on vérifie de
      // l'un vaut pour l'autre.
      let glisse = null;
      menuFlottant.addEventListener('pointerdown', function(e){
        const r = menuFlottant.getBoundingClientRect();
        glisse = { dx: e.clientX - r.left, dy: e.clientY - r.top,
                   x0: e.clientX, y0: e.clientY, bouge: false };
        // Sans capture, le pointeur qui sort du bouton cesse d'être suivi et le
        // déplacement s'arrête net.
        try{ menuFlottant.setPointerCapture(e.pointerId); }catch(err){}
      });
      menuFlottant.addEventListener('pointermove', function(e){
        if(!glisse) return;
        // Trois pixels de tolérance : une main ne se pose jamais parfaitement
        // immobile, et sans ce seuil chaque appui deviendrait un déplacement.
        if(!glisse.bouge && Math.abs(e.clientX - glisse.x0) + Math.abs(e.clientY - glisse.y0) < 3) return;
        glisse.bouge = true;
        menuFlottant.classList.add('dragging');
        position = poserBouton(e.clientX - glisse.dx, e.clientY - glisse.dy);
        placerPanneau();
      });
      function finGlisse(e){
        if(!glisse) return;
        const bouge = glisse.bouge;
        glisse = null;
        menuFlottant.classList.remove('dragging');
        try{ menuFlottant.releasePointerCapture(e.pointerId); }catch(err){}
        if(bouge){ enregistrerPosition(position); return; }
        ouvrirMenu(!navList.classList.contains('open'));
      }
      menuFlottant.addEventListener('pointerup', finGlisse);
      menuFlottant.addEventListener('pointercancel', finGlisse);

      // Tant que personne n'a choisi de place, on recalcule celle par défaut :
      // mesurée à l'ouverture, la barre du haut n'avait pas encore de hauteur et
      // le bouton se posait dessus. Dès qu'une place est choisie, elle seule
      // compte — on se contente alors de la ramener dans l'écran.
      function replacer(){
        if(placeLibre) position = positionParDefaut();
        poserBouton(position.x, position.y);
        placerPanneau();
      }
      window.addEventListener('resize', replacer);
      window.addEventListener('orientationchange', replacer);
      if(window.visualViewport){
        // Le zoom au doigt et la barre d'adresse qui glisse ne déclenchent aucun
        // `resize` : sans ces deux-là, le bouton reste hors de l'écran.
        window.visualViewport.addEventListener('resize', replacer);
        window.visualViewport.addEventListener('scroll', replacer);
      }
    }

    window.addEventListener('scroll', placerPanneau, { passive: true });
    window.addEventListener('resize', placerPanneau);
    window.addEventListener('orientationchange', placerPanneau);
  }

  // ---------------- LES QUATRE COINS ----------------
  // Les fenêtres du menu avaient une taille imposée : 230 pixels de large, et
  // pas un de plus, quelle que soit la longueur de ce qu'on y lit. On les tire
  // maintenant par les quatre coins. Le doigt et la souris font le même geste
  // et suivent le même code : les événements « pointer » ne les distinguent
  // pas, et il n'y a donc rien à écrire deux fois.
  //
  // La taille choisie est retenue par fenêtre : on ne la redonne pas à chaque
  // ouverture.
  (function(){
    const CLE = 'stockmanager_tailles';
    // En dessous, la fenêtre ne montre plus rien d'utile ; on refuse d'y aller
    // plutôt que de laisser un geste maladroit la réduire à un trait.
    const MIN_L = 170, MIN_H = 110;
    const MARGE = 8;
    // Le menu, et les panneaux qu'il ouvre.
    const IDS = ['navList', 'notifPanel', 'marketPanel', 'livraisonPanel', 'barReglages', 'fbComposer'];
    // Les panneaux ouverts depuis le menu (🔔, achats, livraison) ont eux aussi
    // – □ ×, comme les pages (23/10/2026). Les fermer, c'est appuyer sur leur
    // entrée du menu : elle sait les ranger.
    const PANNEAUX = { notifPanel: 'notifToggle', marketPanel: 'marketToggle', livraisonPanel: 'livraisonToggle' };
    // Les pages qu'il ouvre. Elles remplaçaient le fil ; elles se posent
    // maintenant par-dessus, dans une fenêtre qu'on tire par les coins. Le fil
    // reste dessous : on n'ouvre pas une page pour perdre de vue d'où l'on
    // vient.
    //
    // L'Accueil en est une lui aussi. Restent dehors, autour d'elle : le nom
    // « Ny asako », la bannière d'essai et la rangée du bas.
    const PAGES = [
      'dash-accueil',
      'dash-articles', 'dash-dashboard', 'dash-commun', 'dash-communadmin', 'section-factures', 'section-inviter', 'section-contact', 'section-serviceclient',
      // Les outils de bureau (fitaovana.js).
      'section-notes', 'section-kajy',
      'section-calendrier', 'section-horaire',
      // Scan, photos, photocopies (photocopie.js), et les PDF rangés (pdf.js).
      'section-photocopie', 'section-pdf',
      'section-live', 'section-appels', 'section-feo', 'section-projecteur', 'section-wallet', 'section-panier',
      'section-mpiasa', 'section-livreur', 'section-personne',
      // Le lien Maps de la boutique et ceux des clients.
      'section-toerana',
      // « Ny momba ahy », la page de l'employé entré par son lien : posée
      // sous l'Accueil, sa carte s'ouvrait derrière le fil.
      'section-moi',
      'section-abonnement',
      'section-fond',
      'section-corbeille',
      'section-connexions', 'section-admin',
      // Ny asako Hôtellerie (hotelerie.js) : une fenêtre qu'on déplace comme les autres.
      'section-hotelerie'
    ];
    const COINS = [
      { nom: 'hg', x: -1, y: -1 }, { nom: 'hd', x: 1, y: -1 },
      { nom: 'bg', x: -1, y: 1 },  { nom: 'bd', x: 1, y: 1 }
    ];

    function lire(){
      try{ return JSON.parse(localStorage.getItem(CLE)) || {}; }catch(e){ return {}; }
    }
    function ecrire(o){
      try{ localStorage.setItem(CLE, JSON.stringify(o)); }catch(e){}
    }
    function visible(el){
      return !!el && getComputedStyle(el).display !== 'none';
    }
    // L'écran réellement utile, zoom au doigt compris.
    function ecran(){
      const vv = window.visualViewport;
      return vv
        ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height }
        : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    }

    const suivis = [];

    // Plusieurs fenêtres à la fois : celle qu'on touche, ou qu'on vient
    // d'ouvrir, passe devant les autres (23/10/2026). Les étages restent entre
    // celui des pages (95) et celui du menu (119) : ce qui doit couvrir toute
    // l'application — boîtes de dialogue, écran verrouillé — reste au-dessus.
    const ordre = [];
    function estFenetre(s){ return s.page || s.commePage || !!PANNEAUX[s.el.id]; }
    function mettreDevant(s){
      if(!estFenetre(s)) return;
      const i = ordre.indexOf(s);
      if(i >= 0) ordre.splice(i, 1);
      ordre.push(s);
      let n = 0;
      ordre.forEach(function(x){
        if(!visible(x.el)) return;
        const z = String(96 + 2 * n++);
        // Rien ne change, rien n'est écrit : le guetteur des styles ne
        // repartirait pas pour rien.
        if(x.el.style.zIndex !== z) x.el.style.zIndex = z;
        x.calque.style.zIndex = String(+z + 1);
      });
    }
    // Avant tout le reste : le clic qui suit agit dans une fenêtre déjà devant.
    document.addEventListener('pointerdown', function(e){
      const s = suivis.find(function(x){
        return estFenetre(x) && visible(x.el) && (x.el.contains(e.target) || x.calque.contains(e.target));
      });
      if(s && ordre[ordre.length - 1] !== s) mettreDevant(s);
    }, true);

    // Une fenêtre est posée tantôt par le haut, tantôt par le bas, tantôt
    // centrée par une transformation. Pour la redimensionner il n'y a qu'un
    // ancrage possible : coin haut-gauche, plus une largeur et une hauteur.
    // On l'y ramène avant de commencer, sinon deux ancrages se battent.
    function figer(el, r){
      el.style.transform = 'none';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.maxHeight = 'none';
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      el.style.overflowY = 'auto';
    }

    // Là où on a posé la fenêtre. Séparée de la taille : on peut déplacer sans
    // redimensionner, et l'inverse.
    const CLE_PLACES = 'stockmanager_places';
    function lirePlaces(){
      try{ return JSON.parse(localStorage.getItem(CLE_PLACES)) || {}; }catch(e){ return {}; }
    }
    function ecrirePlaces(o){
      try{ localStorage.setItem(CLE_PLACES, JSON.stringify(o)); }catch(e){}
    }

    function appliquerTaille(el){
      const t = lire()[el.id];
      const place = lirePlaces()[el.id];
      if((!t && !place) || !visible(el)) return;
      const z = ecran();
      const page = el.classList.contains('fenetre-page') || el.id === 'fbComposer';
      const bande = page ? bandeUtile() : { haut: z.y, bas: z.y + z.h };
      const actuel = el.getBoundingClientRect();
      // Une taille choisie sur un grand écran ne tient pas sur un téléphone.
      // On garde ce qui a été demandé, sans le laisser déborder : la fenêtre
      // sortait de l'écran par la droite, et le bouton du bout devenait
      // introuvable.
      const largeur = Math.max(MIN_L, Math.min(t ? t.l : actuel.width, z.w - 2 * MARGE));
      const hauteur = Math.max(MIN_H, Math.min(t ? t.h : actuel.height, bande.bas - bande.haut - 2 * MARGE));
      el.style.width = Math.round(largeur) + 'px';
      el.style.height = Math.round(hauteur) + 'px';
      el.style.maxHeight = 'none';
      el.style.overflowY = 'auto';
      el.style.transform = 'none';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      if(page){
        // La place choisie, si on en a choisi une ; le milieu et le haut de la
        // bande sinon. Dans les deux cas ramenée dans le cadre : une place
        // prise sur un grand écran tomberait hors d'un petit.
        let gx = place ? place.x : z.x + (z.w - largeur) / 2;
        let gy = place ? place.y : bande.haut + MARGE;
        gx = Math.max(z.x + MARGE, Math.min(gx, z.x + z.w - largeur - MARGE));
        gy = Math.max(bande.haut + MARGE, Math.min(gy, bande.bas - hauteur - MARGE));
        el.style.left = Math.round(gx) + 'px';
        el.style.top = Math.round(gy) + 'px';
        return;
      }
      // Un panneau est accroché au menu : il garde sa place, on le rentre
      // seulement dans l'écran. La fenêtre vient peut-être d'être posée par le
      // bas, et une hauteur fixe se raisonne depuis le haut.
      const r = el.getBoundingClientRect();
      const left = Math.min(r.left, z.x + z.w - r.width - MARGE);
      const top = Math.min(r.top, z.y + z.h - r.height - MARGE);
      el.style.left = Math.max(z.x + MARGE, left) + 'px';
      el.style.top = Math.max(z.y + MARGE, top) + 'px';
    }

    // Entre les deux barres : ni sous l'encoche, ni sous la rangée du bas.
    // Une barre escamotée ne compte plus — elle a rendu sa place.
    function bandeHaute(){
      const b = document.querySelector('.sidebar');
      if(!b || b.classList.contains('barre-cachee')) return null;
      const pos = getComputedStyle(b).position;
      if(pos !== 'fixed' && pos !== 'sticky') return null;
      // On mesure le rang qu'on voit, et non la case de la grille : celle-ci
      // s'étire avec la place libre et donnait une barre trois fois trop haute.
      const dedans = b.querySelector('.sidebar-top');
      const r = (dedans || b).getBoundingClientRect();
      if(r.height < 1) return null;
      return dedans ? r.bottom + 8 : r.bottom;
    }
    function bandeBasse(){
      const r = document.querySelector('.dash-tabs-main');
      if(!r || r.classList.contains('barre-cachee')) return null;
      if(getComputedStyle(r).display === 'none') return null;
      return r.getBoundingClientRect().top;
    }
    // La taille d'ouverture, tant que personne n'en a choisi une autre.
    // La bande où une fenêtre de page a le droit de vivre : sous le nom,
    // au-dessus de la rangée du bas.
    function bandeUtile(){
      const z = ecran();
      const haut = Math.max(z.y, bandeHaute() === null ? z.y : bandeHaute());
      const bas = Math.min(z.y + z.h, bandeBasse() === null ? z.y + z.h : bandeBasse());
      return { haut: haut, bas: bas };
    }
    function poserFenetre(el){
      const z = ecran();
      const bande = bandeUtile();
      const haut = bande.haut, bas = bande.bas;
      // Trop tôt : la mise en page n'a pas encore de hauteur, et se caler
      // maintenant donnerait une fenêtre haute comme un trait, posée sur le
      // nom de l'application. On laisse le prochain passage s'en charger.
      if(bas - haut < MIN_H + 2 * MARGE) return false;
      const largeur = Math.max(MIN_L, Math.min(900, z.w - 2 * MARGE));
      const hauteur = Math.max(MIN_H, bas - haut - 2 * MARGE);
      el.style.transform = 'none';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.maxHeight = 'none';
      el.style.left = Math.round(z.x + (z.w - largeur) / 2) + 'px';
      el.style.top = Math.round(haut + MARGE) + 'px';
      el.style.width = Math.round(largeur) + 'px';
      el.style.height = Math.round(hauteur) + 'px';
      el.style.overflowY = 'auto';
      return true;
    }
    // Refermer, c'est revenir au fil : le bouton « Stock » est le chemin par
    // lequel tout y revient déjà, on ne s'en invente pas un second.
    //
    // Sauf pour l'Accueil, qui est ce fil : y revenir le rouvrirait aussitôt.
    // Le refermer, c'est l'éteindre — on le retrouve dans le menu.
    // Refermé exprès, le fil doit le rester : le garde-fou d'en dessous le
    // rallumerait aussitôt, et la croix ne fermerait rien.
    let filFermeExpres = false;

    function fermerFenetre(el){
      // Un panneau du menu : son entrée le referme (et remet son état).
      if(el && PANNEAUX[el.id]){
        const entree = document.getElementById(PANNEAUX[el.id]);
        if(visible(el) && entree) entree.click();
        if(visible(el)) el.style.display = 'none';
        if(entree) entree.setAttribute('aria-expanded', 'false');
        return;
      }
      marquerReduite(el, false);
      // La boîte d'écriture n'est pas une page : la fermer, c'est la cacher,
      // sans toucher à ce qui est ouvert derrière.
      if(el && el.id === 'fbComposer'){
        if(typeof window.__fermerComposer === 'function') window.__fermerComposer();
        else el.style.display = 'none';
        return;
      }
      // La fenêtre d'une personne s'est ouverte depuis l'équipe : c'est là
      // qu'on revient, et non au fil, d'où l'on ne venait pas.
      if(el && el.id === 'section-personne'){
        el.classList.remove('active');
        // On revient à la page d'où l'on venait — celle du métier de la
        // personne — et non à l'autre, qui ne la contient pas.
        const metier = el.dataset.metier === 'livreur' ? 'livreur' : 'mpiasa';
        const retour = document.querySelector('.nav-item[data-section="' + metier + '"]');
        if(retour) retour.click();
        return;
      }
      if(el && el.id === 'dash-accueil'){
        filFermeExpres = true;
        el.classList.remove('active');
        if(typeof saveLastView === 'function') saveLastView();
        return;
      }
      // En automatique, fermer une page, c'est en avoir fini avec elle : son
      // icône quitte la rangée du même geste (la rangée, plus bas, en décide).
      if(el && typeof window.__pageFermee === 'function') window.__pageFermee(el.id);
      rangerLaPage(el);
    }
    // Plusieurs pages peuvent être ouvertes : on ne range que celle-ci. Le fil
    // revient seulement s'il ne reste plus aucune page à l'écran.
    function rangerLaPage(el){
      if(el){
        el.classList.remove('active');
        const nav = document.querySelector('.nav-item[data-section="' + el.id.replace(/^section-/, '') + '"]');
        if(nav) nav.classList.remove('active');
      }
      const reste = PAGES.some(function(id){
        const p = document.getElementById(id);
        return p && p !== el && visible(p);
      });
      if(!reste) revenirAuFil();
      else if(typeof saveLastView === 'function') saveLastView();
    }
    function revenirAuFil(){
      const navStock = document.querySelector('.nav-item[data-section="stock"]');
      if(navStock) navStock.click();
      if(typeof showDashView === 'function') showDashView('accueil');
      if(typeof saveLastView === 'function') saveLastView();
    }

    // Réduire, c'est fermer sans oublier : on revient au fil, mais l'icône de
    // la page reste dans la rangée du bas, d'où on la rouvre d'un doigt.
    // L'Accueil et la fiche d'une personne n'ont pas d'icône à garder : pour
    // eux, réduire et fermer se confondent.
    function reduireFenetre(el){
      // Un panneau n'a pas d'icône à garder : réduit, il se range comme fermé.
      if(el && PANNEAUX[el.id]){ fermerFenetre(el); return; }
      // Le fil n'a nulle part où revenir : réduit, il s'efface comme fermé,
      // mais sa maison, dans la rangée, clignote pour dire qu'il attend.
      if(el && (el.id === 'dash-accueil' || el.id === 'fbComposer')){
        fermerFenetre(el);
        marquerReduite(el, true);
        return;
      }
      if(el && el.id === 'section-personne'){
        fermerFenetre(el);
        return;
      }
      rangerLaPage(el);
      marquerReduite(el, true);
    }
    // L'icône de la page clignote tant qu'elle est réduite (la rangée, plus
    // bas, s'en charge).
    function marquerReduite(el, oui){
      if(!el) return;
      const s = suivis.find(function(x){ return x.el === el; });
      if(s) s.reduite = oui;
      // L'Accueil et la boîte d'écriture ont leur bouton fixe dans la rangée.
      const fixe = { 'dash-accueil': 'barAccueil', 'fbComposer': 'barComposer' }[el.id];
      if(fixe){
        const b = document.getElementById(fixe);
        if(b) b.classList.toggle('reduite', !!oui);
        return;
      }
      if(typeof window.__pageReduite === 'function') window.__pageReduite(el.id, oui);
    }

    // Agrandir : la fenêtre prend toute la bande, et retient où elle était
    // pour y retourner au second appui.
    const ICONE_AGRANDIR = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9"/></svg>';
    const ICONE_RESTAURER = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="2.5" width="7" height="7"/><path d="M2.5 2.5V0.5h7v7h-2"/></svg>';
    function marquerAgrandie(s, oui){
      s.agrandie = oui;
      if(!s.boutonAgrandir) return;
      s.boutonAgrandir.innerHTML = oui ? ICONE_RESTAURER : ICONE_AGRANDIR;
      const t = oui ? 'Restaurer la fenêtre' : 'Agrandir la fenêtre';
      s.boutonAgrandir.title = t;
      s.boutonAgrandir.setAttribute('aria-label', t);
    }
    function remplirBande(s){
      const z = ecran();
      const bande = bandeUtile();
      s.el.style.transform = 'none';
      s.el.style.right = 'auto';
      s.el.style.bottom = 'auto';
      s.el.style.maxHeight = 'none';
      s.el.style.left = Math.round(z.x + MARGE) + 'px';
      s.el.style.top = Math.round(bande.haut + MARGE) + 'px';
      s.el.style.width = Math.round(Math.max(MIN_L, z.w - 2 * MARGE)) + 'px';
      s.el.style.height = Math.round(Math.max(MIN_H, bande.bas - bande.haut - 2 * MARGE)) + 'px';
      s.el.style.overflowY = 'auto';
    }
    function basculerAgrandie(s){
      if(!visible(s.el)) return;
      if(!s.agrandie){
        const r = s.el.getBoundingClientRect();
        s.avant = { l: r.left, t: r.top, w: r.width, h: r.height };
        marquerAgrandie(s, true);
        remplirBande(s);
      } else {
        marquerAgrandie(s, false);
        // La taille et la place retenues d'avant, rentrées dans l'écran
        // d'aujourd'hui ; faute de mieux, la taille d'ouverture.
        if(s.avant){
          const z = ecran();
          const bande = bandeUtile();
          const w = Math.max(MIN_L, Math.min(s.avant.w, z.w - 2 * MARGE));
          const h = Math.max(MIN_H, Math.min(s.avant.h, bande.bas - bande.haut - 2 * MARGE));
          const l = Math.max(z.x + MARGE, Math.min(s.avant.l, z.x + z.w - w - MARGE));
          const t = Math.max(bande.haut + MARGE, Math.min(s.avant.t, bande.bas - h - MARGE));
          figer(s.el, { left: Math.round(l), top: Math.round(t), width: Math.round(w), height: Math.round(h) });
        } else if(!poserFenetre(s.el)){
          appliquerTaille(s.el);
        }
      }
      synchroniser();
    }

    // La section du fil est allumée, mais aucune de ses vues ne l'est : il ne
    // reste rien à l'écran. Rien ne devrait y mener, et pourtant c'est arrivé —
    // une fenêtre refermée, une bascule de largeur, et l'application s'ouvrait
    // sur du noir, sans un bouton pour en sortir. On rallume le fil.
    function jamaisVide(){
      // Sauf si on l'a fermé soi-même : un écran qu'on a voulu vide n'est pas
      // un écran perdu, et la rangée du bas comme le hamburger restent là pour
      // en sortir.
      if(filFermeExpres) return;
      const fond = document.getElementById('section-stock');
      if(!fond || !fond.classList.contains('active')) return;
      if(document.querySelector('.dash-view.active')) return;
      // Les autres pages, elles, se posent PAR-DESSUS le fil : si l'une est
      // ouverte, l'écran n'est pas vide et il n'y a rien à rallumer.
      const surLeDessus = PAGES.some(function(id){
        if(id === 'dash-accueil') return false;
        const el = document.getElementById(id);
        return el && el.classList.contains('active');
      });
      if(surLeDessus) return;
      if(typeof showDashView === 'function') showDashView('accueil');
    }

    function synchroniser(){
      jamaisVide();
      // Une page ouverte recouvre l'Accueil exactement : ses poignées se
      // superposeraient aux siennes, aux mêmes coins, pour redimensionner une
      // fenêtre que personne ne voit. Elles s'effacent le temps de la visite.
      // Seulement si cette page est devant lui : touché, l'Accueil repasse
      // devant, et reprend ses poignées.
      const accueil = suivis.find(function(x){ return x.el.id === 'dash-accueil'; });
      const pageDevant = suivis.some(function(x){
        return x.page && x.el.id !== 'dash-accueil' && visible(x.el) &&
          ordre.indexOf(x) > ordre.indexOf(accueil);
      });
      // Une fenêtre ouverte, et le bouton flottant du menu s'efface à demi
      // pour ne pas la masquer (base.css) ; il reste là, et on l'ouvre pareil.
      document.body.classList.toggle('fenetre-ouverte', suivis.some(function(x){
        return x.page && visible(x.el);
      }));
      suivis.forEach(function(s){
        const vu = visible(s.el);
        // Le fil reste ouvert derrière, tant qu'une page est posée dessus : la
        // navigation vient de l'éteindre pour mettre la page à sa place, et
        // une fenêtre posée sur du vide n'est plus une fenêtre. On le vérifie
        // à chaque passage et non au seul moment de l'ouverture — rouvrir une
        // page déjà ouverte éteint le fil sans rien rallumer.
        if(vu && s.page){
          const fond = document.getElementById('section-stock');
          if(fond) fond.classList.add('active');
        }
        // Rouvert d'une façon ou d'une autre, le fil redevient rattrapable.
        if(vu && s.el.id === 'dash-accueil') filFermeExpres = false;
        // Rouverte, elle n'est plus réduite : son icône cesse de clignoter.
        if(vu && s.reduite) marquerReduite(s.el, false);
        if(!vu){
          s.vu = false;
        } else if(!s.vu){
          // Posée, alors seulement retenue comme ouverte : sinon un passage
          // trop précoce la marquerait faite et personne n'y reviendrait.
          if(!(s.page || s.commePage) || poserFenetre(s.el)){
            appliquerTaille(s.el);
            // Agrandie quand on l'a quittée, elle revient agrandie.
            if(s.agrandie) remplirBande(s);
            s.vu = true;
            // Ouverte à l'instant : elle passe devant celles déjà là.
            mettreDevant(s);
          }
        }
        // En rangée, chacune garde ses boutons : elles sont côte à côte.
        const cache = !vu || (s.el.id === 'dash-accueil' && pageDevant && !laharana);
        s.calque.hidden = cache;
        if(cache) return;
        const r = s.el.getBoundingClientRect();
        s.calque.style.left = r.left + 'px';
        s.calque.style.top = r.top + 'px';
        s.calque.style.width = r.width + 'px';
        s.calque.style.height = r.height + 'px';
        // Juste au-dessus de sa fenêtre : les panneaux ne sont pas tous au même
        // étage, et une poignée sous sa fenêtre ne se saisit pas.
        const z = parseInt(s.el.style.zIndex || getComputedStyle(s.el).zIndex, 10);
        s.calque.style.zIndex = (isFinite(z) ? z : 120) + 1;
      });
      // Une fenêtre fermée à sa croix pendant la rangée : les autres se
      // resserrent.
      if(laharana && laharana.liste.some(function(x){ return !visible(x.el); })) poserLaharana();
      // Une page ouverte pendant la rangée (par le N, la rangée du bas) y
      // prend place au bout, au lieu de se poser par-dessus les autres.
      if(laharana){
        const venues = suivis.filter(function(x){
          return estFenetre(x) && visible(x.el) && laharana.liste.indexOf(x) < 0;
        });
        if(venues.length){
          venues.forEach(function(x){
            if(x.agrandie) marquerAgrandie(x, false);
            laharana.liste.push(x);
          });
          laharana.decalage = -Infinity;
          poserLaharana();
        }
      }
    }

    // Déplacer : la fenêtre suit le doigt, sans changer de taille, et sans
    // sortir de la bande où on la verrait encore.
    function armerDeplacement(s, ruban){
      let g = null;
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function(t){
        ruban.addEventListener(t, function(e){ e.stopPropagation(); });
      });
      ruban.addEventListener('pointerdown', function(e){
        if(!visible(s.el)) return;
        // Rangées par « Alamino », elles se reprennent à la main comme
        // avant : la rangée se défait, chacune garde la place reçue.
        sortirDeLaRangee(s);
        const r = s.el.getBoundingClientRect();
        if(r.width < 1 || r.height < 1) return;
        e.preventDefault();
        figer(s.el, r);
        g = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
        ruban.classList.add('tire');
        try{ ruban.setPointerCapture(e.pointerId); }catch(err){}
      });
      ruban.addEventListener('pointermove', function(e){
        if(!g) return;
        // Déplacée pour de bon, elle n'est plus agrandie. Un simple appui ne
        // compte pas : c'est aussi le début d'un double-clic.
        if(s.agrandie && Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 4){
          marquerAgrandie(s, false);
        }
        const z = ecran();
        const bande = (s.page || s.commePage) ? bandeUtile() : { haut: z.y, bas: z.y + z.h };
        let l = g.l + (e.clientX - g.x);
        let t = g.t + (e.clientY - g.y);
        const brut = l;
        l = Math.max(z.x + MARGE, Math.min(l, z.x + z.w - g.w - MARGE));
        t = Math.max(bande.haut + MARGE, Math.min(t, bande.bas - g.h - MARGE));
        s.el.style.left = Math.round(l) + 'px';
        s.el.style.top = Math.round(t) + 'px';
        // Poussée plus loin que le bord, elle commence à sortir : lâchée
        // assez loin, elle se ferme (voir armerBalayage).
        g.depasse = brut - l;
        glisser(s, g.depasse);
        synchroniser();
      });
      function fin(e){
        if(!g) return;
        const depasse = g.depasse || 0;
        g = null;
        ruban.classList.remove('tire');
        try{ ruban.releasePointerCapture(e.pointerId); }catch(err){}
        if(Math.abs(depasse) > SEUIL_JETER){ jeter(s, depasse); return; }
        glisser(s, 0);
        // Agrandie, sa place n'est pas la sienne : on ne la retient pas.
        if(s.agrandie) return;
        const r = s.el.getBoundingClientRect();
        const o = lirePlaces();
        o[s.el.id] = { x: Math.round(r.left), y: Math.round(r.top) };
        ecrirePlaces(o);
      }
      ruban.addEventListener('pointerup', fin);
      ruban.addEventListener('pointercancel', fin);
    }

    // Glisser vers la gauche ou la droite, et la fenêtre s'en va : on les
    // range une à une d'un geste (23/10/2026). Au doigt, n'importe où dans la
    // fenêtre ; à la souris, en la tirant par son ruban au-delà du bord.
    const SEUIL_JETER = 110;
    // Ses poignées la suivent d'elles-mêmes : synchroniser les pose sur le
    // cadre qu'on voit, décalage compris.
    function glisser(s, dx){
      if(!dx){
        s.el.style.translate = '';
        s.el.style.opacity = '';
        return;
      }
      s.el.style.translate = Math.round(dx) + 'px 0';
      s.el.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 500));
    }
    function jeter(s, dx){
      const sens = dx < 0 ? -1 : 1;
      const r = s.el.getBoundingClientRect();
      const fin = sens * (window.innerWidth + r.width);
      s.el.style.transition = 'translate 0.18s ease-in, opacity 0.18s ease-in';
      s.calque.hidden = true;
      requestAnimationFrame(function(){
        s.el.style.translate = Math.round(fin) + 'px 0';
        s.el.style.opacity = '0';
      });
      setTimeout(function(){
        s.el.style.transition = '';
        glisser(s, 0);
        fermerFenetre(s.el);
        synchroniser();
      }, 200);
    }
    function armerBalayage(s){
      let g = null;
      // Là où glisser de côté a déjà un sens, on le lui laisse : un champ,
      // une rangée qui défile en largeur (les stories), une réglette.
      function aSonPropreGeste(cible){
        for(let n = cible; n && n !== s.el; n = n.parentElement){
          if(n.matches && n.matches('input, textarea, select, [contenteditable="true"], video, canvas')) return true;
          if(n.scrollWidth > n.clientWidth + 2){
            const ox = getComputedStyle(n).overflowX;
            if(ox === 'auto' || ox === 'scroll') return true;
          }
        }
        return false;
      }
      // Le navigateur garde le défilement vertical et le zoom ; le
      // mouvement de côté nous revient.
      s.el.style.touchAction = 'pan-y pinch-zoom';
      s.el.addEventListener('pointerdown', function(e){
        if(e.pointerType === 'mouse' || !e.isPrimary) return;
        // En rangée, glisser fait défiler la rangée (plus bas).
        if(laharana) return;
        if(aSonPropreGeste(e.target)) return;
        g = { x: e.clientX, y: e.clientY, id: e.pointerId, pris: false, dx: 0 };
      });
      s.el.addEventListener('pointermove', function(e){
        if(!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if(!g.pris){
          // Vers le haut ou le bas d'abord : c'est qu'on lit.
          if(Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)){ g = null; return; }
          if(Math.abs(dx) < 14) return;
          g.pris = true;
          try{ s.el.setPointerCapture(e.pointerId); }catch(err){}
        }
        g.dx = dx;
        glisser(s, dx);
        synchroniser();
      });
      function fin(e){
        if(!g || e.pointerId !== g.id) return;
        const pris = g.pris, dx = g.dx;
        g = null;
        if(!pris) return;
        s.balaye = Date.now();
        try{ s.el.releasePointerCapture(e.pointerId); }catch(err){}
        const r = s.el.getBoundingClientRect();
        if(Math.abs(dx) > Math.min(SEUIL_JETER, r.width * 0.3) && e.type === 'pointerup') jeter(s, dx);
        else { glisser(s, 0); synchroniser(); }
      }
      s.el.addEventListener('pointerup', fin);
      s.el.addEventListener('pointercancel', fin);
      // Le clic qui termine un balayage n'ouvre rien sous le doigt.
      s.el.addEventListener('click', function(e){
        if(s.balaye && Date.now() - s.balaye < 400){ e.preventDefault(); e.stopPropagation(); }
      }, true);
    }

    function armer(s, coin, poignee){
      let g = null;
      // Le document referme le menu dès qu'on presse ailleurs. Les poignées
      // sont ailleurs — dans leur calque —, et sans cela le premier appui sur
      // un coin fermerait la fenêtre qu'on voulait agrandir.
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function(t){
        poignee.addEventListener(t, function(e){ e.stopPropagation(); });
      });
      poignee.addEventListener('pointerdown', function(e){
        // Une fenêtre fermée n'a ni largeur ni hauteur : la saisir écrirait des
        // zéros dans sa taille, et elle rouvrirait réduite à ses bordures.
        if(!visible(s.el)) return;
        sortirDeLaRangee(s);
        const r = s.el.getBoundingClientRect();
        if(r.width < 1 || r.height < 1) return;
        e.preventDefault();
        // Prise à la main, elle n'est plus agrandie : elle a sa taille à elle.
        if(s.agrandie) marquerAgrandie(s, false);
        figer(s.el, r);
        g = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
        poignee.classList.add('tire');
        try{ poignee.setPointerCapture(e.pointerId); }catch(err){}
      });
      poignee.addEventListener('pointermove', function(e){
        if(!g) return;
        const z = ecran();
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        let l = g.l, t = g.t, w = g.w, h = g.h;
        // Un coin gauche déplace le bord gauche : la largeur change en sens
        // inverse du doigt, et le coin opposé ne bouge pas.
        if(coin.x < 0){ l = g.l + dx; w = g.w - dx; } else { w = g.w + dx; }
        if(coin.y < 0){ t = g.t + dy; h = g.h - dy; } else { h = g.h + dy; }
        if(w < MIN_L){ if(coin.x < 0) l = g.l + g.w - MIN_L; w = MIN_L; }
        if(h < MIN_H){ if(coin.y < 0) t = g.t + g.h - MIN_H; h = MIN_H; }
        // Rien ne sort de l'écran : ce qui déborde est repris sur la taille.
        if(l < z.x + MARGE){ w -= (z.x + MARGE - l); l = z.x + MARGE; }
        if(t < z.y + MARGE){ h -= (z.y + MARGE - t); t = z.y + MARGE; }
        if(l + w > z.x + z.w - MARGE) w = z.x + z.w - MARGE - l;
        if(t + h > z.y + z.h - MARGE) h = z.y + z.h - MARGE - t;
        s.el.style.left = Math.round(l) + 'px';
        s.el.style.top = Math.round(t) + 'px';
        s.el.style.width = Math.round(Math.max(MIN_L, w)) + 'px';
        s.el.style.height = Math.round(Math.max(MIN_H, h)) + 'px';
        synchroniser();
      });
      function fin(e){
        if(!g) return;
        g = null;
        poignee.classList.remove('tire');
        try{ poignee.releasePointerCapture(e.pointerId); }catch(err){}
        const r = s.el.getBoundingClientRect();
        // On ne retient qu'une taille tenable : mieux vaut ne rien retenir que
        // rouvrir sur une fenêtre illisible.
        if(r.width < MIN_L || r.height < MIN_H) return;
        const o = lire();
        o[s.el.id] = { l: Math.round(r.width), h: Math.round(r.height) };
        ecrire(o);
      }
      poignee.addEventListener('pointerup', fin);
      poignee.addEventListener('pointercancel', fin);
    }

    IDS.concat(PAGES).forEach(function(id){
      const el = document.getElementById(id);
      if(!el) return;
      const page = PAGES.indexOf(id) >= 0;
      if(page){
        el.classList.add('fenetre-page');
        // Hors du contenu : « .content » découpe ce qui déborde, et une
        // fenêtre posée par-dessus n'a rien à faire dans une boîte qui coupe.
        document.body.appendChild(el);
      }
      const calque = document.createElement('div');
      calque.className = 'poignees';
      calque.dataset.pour = id;
      calque.hidden = true;
      // La boîte « Écrire » se pose comme une page (23/10/2026) : même taille,
      // même place, entre le nom et la rangée du bas — sans en être une.
      const s = { el: el, calque: calque, vu: false, page: page, commePage: id === 'fbComposer' };
      // La boîte d'écriture n'est pas une page, mais elle se tient comme
      // une fenêtre : on la déplace, on la réduit, on l'agrandit.
      if(page || id === 'fbComposer' || PANNEAUX[id]){
        // Un ruban en haut de la fenêtre, pour la prendre et la poser
        // ailleurs. Dans le calque et non dans la fenêtre : à l'intérieur il
        // défilerait avec la page et l'on ne pourrait plus la déplacer sitôt
        // qu'on aurait lu une ligne.
        const ruban = document.createElement('span');
        ruban.className = 'poignee-deplacer';
        ruban.title = 'Déplacer la fenêtre';
        ruban.setAttribute('aria-hidden', 'true');
        calque.appendChild(ruban);
        armerDeplacement(s, ruban);
        armerBalayage(s);

        // Réduire, agrandir, fermer : les trois boutons d'une fenêtre de
        // bureau, à leur place habituelle.
        const boutons = document.createElement('div');
        boutons.className = 'fenetre-boutons';
        function bouton(classe, icone, titre, action){
          const b = document.createElement('button');
          b.type = 'button';
          b.className = classe;
          b.innerHTML = icone;
          b.title = titre;
          b.setAttribute('aria-label', titre);
          ['pointerdown', 'mousedown', 'touchstart'].forEach(function(t){
            b.addEventListener(t, function(e){ e.stopPropagation(); });
          });
          b.addEventListener('click', function(e){ e.stopPropagation(); action(); });
          boutons.appendChild(b);
          return b;
        }
        bouton('fenetre-reduire', '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10"/></svg>',
          'Réduire la fenêtre', function(){ reduireFenetre(s.el); });
        s.boutonAgrandir = bouton('fenetre-agrandir', ICONE_AGRANDIR,
          'Agrandir la fenêtre', function(){ basculerAgrandie(s); });
        bouton('fenetre-fermer', '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9"/></svg>',
          'Fermer la fenêtre', function(){ fermerFenetre(s.el); });
        calque.appendChild(boutons);
        // Double-cliquer le ruban agrandit ou restaure, comme une barre de titre.
        ruban.addEventListener('dblclick', function(e){ e.stopPropagation(); basculerAgrandie(s); });
      }
      COINS.forEach(function(coin){
        const poignee = document.createElement('span');
        poignee.className = 'poignee ' + coin.nom;
        poignee.title = 'Agrandir ou réduire la fenêtre';
        poignee.setAttribute('aria-hidden', 'true');
        calque.appendChild(poignee);
        armer(s, coin, poignee);
      });
      document.body.appendChild(calque);
      suivis.push(s);
      // La fenêtre s'ouvre, se ferme et se déplace sans prévenir personne :
      // on regarde ce qui change sur elle plutôt que de deviner qui l'a bougée.
      new MutationObserver(synchroniser)
        .observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    });

    // L'application s'ouvre ou se ferme : les fenêtres paraissent et
    // disparaissent sans que rien n'ait changé sur elles — c'est le corps de la
    // page qui porte la bascule. Sans ce second guetteur, une connexion rapide
    // ouvrait l'Accueil sans ses poignées, jusqu'au premier autre mouvement.
    //
    // On les refait tenir dans la bande au passage, et non seulement au moment
    // où l'une paraît : la bande a pu changer sous elles — la rangée du bas
    // retirée leur rendait de la place, et l'Accueil, déjà ouvert derrière les
    // autres, ne l'a jamais reprise. Celles dont on a choisi la taille la
    // gardent.
    new MutationObserver(function(){ replacerLesPages(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // 🗂️ Alamino : ranger les fenêtres ouvertes, de cinq façons (24/10/2026).
    //  - Milahatra : côte à côte, en une rangée qu'on fait glisser à gauche et
    //    à droite, comme les applications récentes d'un téléphone ;
    //  - Mifanongoa : la même rangée, mais les unes sous les autres, qu'on
    //    fait glisser en haut et en bas ;
    //  - Grille : toutes visibles à la fois, une case chacune ;
    //  - Mifanila roa : les deux dernières touchées, une moitié d'écran
    //    chacune (côte à côte sur un écran large, l'une sur l'autre sur un
    //    téléphone debout) ; les autres restent derrière ;
    //  - Cascade : décalées, chacune laissant voir le haut de la précédente.
    // Dans les deux rangées, toucher une fenêtre la met devant et on y
    // travaille aussitôt ; toucher à côté referme la rangée. Dans tous les cas
    // les fenêtres restent là où on les a rangées : la place est retenue,
    // comme si on les y avait posées à la main.
    function ouvertes(){
      const vues = suivis.filter(function(x){ return estFenetre(x) && visible(x.el); });
      // Dans l'ordre où elles sont empilées ; celles jamais touchées d'abord.
      return vues.sort(function(a, b){ return ordre.indexOf(a) - ordre.indexOf(b); });
    }
    let laharana = null;
    const ECART = 16;
    // La bande où l'on range : sous le nom, au-dessus de la rangée du bas.
    function cadreRangement(){
      const z = ecran();
      const bande = bandeUtile();
      return laisserLeN({ x: z.x + MARGE, y: bande.haut + MARGE, w: z.w - 2 * MARGE, h: bande.bas - bande.haut - 2 * MARGE, z: z });
    }
    // Le N flottant passe au-dessus de toutes les fenêtres : rangées sous lui,
    // il cachait leurs ─ □ ✕ (24/10/2026). On lui laisse sa colonne, du côté
    // où on l'a posé — sauf si la place manque pour une fenêtre.
    function laisserLeN(c){
      const n = document.getElementById('menuFlottant');
      if(!n || getComputedStyle(n).display === 'none' || n.style.visibility === 'hidden') return c;
      const r = n.getBoundingClientRect();
      if(!r.width || r.bottom <= c.y || r.top >= c.y + c.h) return c;
      if(r.right <= c.x || r.left >= c.x + c.w) return c;
      // Seulement collé à un bord : posé plus loin, lui laisser toute sa
      // colonne vidait le côté de l'écran et serrait les fenêtres en lanières.
      const proche = r.width + 3 * MARGE;
      if(r.left - c.x > proche && (c.x + c.w) - r.right > proche) return c;
      if(r.left + r.width / 2 > c.x + c.w / 2){
        const w = r.left - MARGE - c.x;
        if(w >= MIN_L){ c.w = w; c.n = true; }
      } else {
        const x = r.right + MARGE;
        const w = c.x + c.w - x;
        if(w >= MIN_L){ c.w = w; c.x = x; c.n = true; }
      }
      return c;
    }
    // Toutes visibles d'un coup (24/10/2026) : la place se partage entre
    // elles. La rangée ne glisse plus que si elles sont trop nombreuses pour
    // la taille minimale d'une fenêtre.
    function carte(){
      const c = cadreRangement();
      const n = Math.max(1, laharana ? laharana.liste.length : 1);
      if(laharana && laharana.sens === 'y'){
        // Une bande sombre reste libre à droite : c'est par elle qu'on fait
        // glisser la rangée, le doigt sur une fenêtre fait défiler son contenu.
        // La colonne du N en tient lieu quand elle est là.
        return {
          w: Math.round(Math.max(MIN_L, c.w - (c.n ? 0 : 52))),
          h: Math.round(Math.max(MIN_H, (c.h - (n - 1) * ECART) / n)),
          c: c
        };
      }
      return {
        w: Math.round(Math.max(MIN_L, (c.w - (n - 1) * ECART) / n)),
        h: Math.round(Math.max(MIN_H, c.h)),
        c: c
      };
    }
    function borneDecalage(){
      const k = carte();
      const y = laharana.sens === 'y';
      const total = laharana.liste.length * (y ? k.h : k.w) + (laharana.liste.length - 1) * ECART;
      const place = y ? k.c.h : k.c.w;
      // Plus courtes que l'écran : centrées, sans glisser.
      if(total <= place) return { min: (place - total) / 2, max: (place - total) / 2 };
      return { min: place - total, max: 0 };
    }
    function poserLaharana(){
      if(!laharana) return;
      laharana.liste = laharana.liste.filter(function(s){ return visible(s.el); });
      if(!laharana.liste.length){ quitterLaharana(null); return; }
      const k = carte();
      const b = borneDecalage();
      const y = laharana.sens === 'y';
      laharana.decalage = Math.max(b.min, Math.min(b.max, laharana.decalage));
      laharana.liste.forEach(function(s, i){
        const d = laharana.decalage + i * ((y ? k.h : k.w) + ECART);
        figer(s.el, {
          left: Math.round(k.c.x + (y ? 0 : d)),
          top: Math.round(k.c.y + (y ? d : 0)),
          width: k.w, height: k.h
        });
      });
      synchroniser();
    }
    // Ce que fait la main quand elle pose une fenêtre : sa place et sa taille
    // sont retenues. Sans cela, le prochain replacement (écran tourné, barre
    // escamotée) les renvoyait à leur ancienne place.
    function retenirPlace(s){
      if(!visible(s.el)) return;
      const r = s.el.getBoundingClientRect();
      if(r.width >= MIN_L && r.height >= MIN_H){
        const t = lire();
        t[s.el.id] = { l: Math.round(r.width), h: Math.round(r.height) };
        ecrire(t);
      }
      if(s.page || s.commePage){
        const o = lirePlaces();
        o[s.el.id] = { x: Math.round(r.left), y: Math.round(r.top) };
        ecrirePlaces(o);
      }
    }
    // Grille : autant de colonnes que la forme de l'écran le veut — plus
    // qu'en hauteur sur un ordinateur, moins sur un téléphone debout. La
    // dernière ligne, incomplète, s'étale sur toute la largeur.
    function rangerEnGrille(liste){
      const c = cadreRangement();
      const n = liste.length;
      const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * c.w / Math.max(1, c.h))) || 1));
      const lignes = Math.ceil(n / cols);
      const ecart = ECART / 2;
      const h = Math.max(MIN_H, (c.h - (lignes - 1) * ecart) / lignes);
      liste.forEach(function(s, i){
        const ligne = Math.floor(i / cols), col = i % cols;
        const surLaLigne = Math.min(cols, n - ligne * cols);
        const w = Math.max(MIN_L, (c.w - (surLaLigne - 1) * ecart) / surLaLigne);
        figer(s.el, {
          left: Math.round(c.x + col * (w + ecart)),
          top: Math.round(c.y + ligne * (h + ecart)),
          width: Math.round(w), height: Math.round(h)
        });
      });
    }
    function rangerParDeux(liste){
      const c = cadreRangement();
      const deux = liste.slice(-2);
      const ecart = ECART / 2;
      const cote = c.w >= c.h;
      const n = deux.length;
      const w = cote ? (c.w - (n - 1) * ecart) / n : c.w;
      const h = cote ? c.h : (c.h - (n - 1) * ecart) / n;
      deux.forEach(function(s, i){
        figer(s.el, {
          left: Math.round(c.x + (cote ? i * (w + ecart) : 0)),
          top: Math.round(c.y + (cote ? 0 : i * (h + ecart))),
          width: Math.round(Math.max(MIN_L, w)), height: Math.round(Math.max(MIN_H, h))
        });
      });
      return deux;
    }
    function rangerEnCascade(liste){
      const c = cadreRangement();
      const n = liste.length;
      // Le décalage laisse voir le haut de chaque fenêtre (ses boutons ─ □ ✕),
      // et se resserre quand elles sont nombreuses.
      const pas = n < 2 ? 0 : Math.max(16, Math.min(40, (c.h - MIN_H) / (n - 1), (c.w - MIN_L) / (n - 1)));
      const w = Math.max(MIN_L, Math.min(900, c.w - (n - 1) * pas));
      const h = Math.max(MIN_H, c.h - (n - 1) * pas);
      liste.forEach(function(s, i){
        figer(s.el, {
          left: Math.round(c.x + i * pas), top: Math.round(c.y + i * pas),
          width: Math.round(w), height: Math.round(h)
        });
      });
    }
    function alaminoFenetres(modely){
      modely = modely || 'milahatra';
      quitterLaharana(null);
      const liste = ouvertes();
      if(!liste.length) return;
      liste.forEach(function(s){
        if(s.agrandie) marquerAgrandie(s, false);
        glisser(s, 0);
      });
      if(modely === 'milahatra' || modely === 'mifanongoa'){
        laharana = { liste: liste, decalage: 0, sens: modely === 'mifanongoa' ? 'y' : 'x' };
        // La plus récente au bout de la rangée, et la rangée glissée jusqu'à elle.
        laharana.decalage = borneDecalage().min;
        const fond = document.createElement('div');
        fond.className = 'laharana-fond';
        document.body.appendChild(fond);
        laharana.fond = fond;
        document.body.classList.add('fenetres-laharana');
        document.body.classList.toggle('fenetres-laharana-y', laharana.sens === 'y');
        poserLaharana();
        return;
      }
      let rangees = liste;
      if(modely === 'grille') rangerEnGrille(liste);
      else if(modely === 'roa') rangees = rangerParDeux(liste);
      else rangerEnCascade(liste);
      // Dans l'ordre de la pile : la dernière rangée passe devant.
      rangees.forEach(function(s){ mettreDevant(s); retenirPlace(s); });
      synchroniser();
    }
    function sortirDeLaRangee(s){
      if(laharana && laharana.liste.indexOf(s) >= 0) quitterLaharana(s);
    }
    function quitterLaharana(choisie){
      if(!laharana) return;
      const l = laharana;
      laharana = null;
      document.body.classList.remove('fenetres-laharana', 'fenetres-laharana-y');
      if(l.fond) l.fond.remove();
      l.liste.forEach(retenirPlace);
      if(choisie && visible(choisie.el)) mettreDevant(choisie);
      replacerLesPages();
    }
    // On travaille dans la rangée sans la quitter (24/10/2026) : la quitter
    // pour chaque appui renvoyait les fenêtres dans le désordre d'où on
    // voulait sortir. Toucher une fenêtre la met devant et agit dedans ; son
    // contenu défile comme d'habitude. La rangée, elle, glisse dans son sens
    // (Milahatra en largeur, n'importe où ; Mifanongoa en hauteur, par la
    // bande sombre à droite des fenêtres). Seul un appui sur le fond sombre,
    // ou Échap, la referme.
    let geste = null;
    let apresGlisse = false;
    document.addEventListener('pointerdown', function(e){
      apresGlisse = false;
      if(!laharana || !e.isPrimary) return;
      // Les boutons ─ □ ✕ des fenêtres gardent leur rôle.
      if(e.target.closest && e.target.closest('.fenetre-boutons')) return;
      const s = laharana.liste.find(function(x){ return x.el.contains(e.target); }) || null;
      const surFond = e.target === laharana.fond;
      if(!s && !surFond) return;
      // Dans Mifanongoa, le doigt qui glisse sur une fenêtre fait défiler
      // son contenu : la rangée ne se tire que par le fond.
      if(s && laharana.sens === 'y') return;
      geste = { x: e.clientX, y: e.clientY, depart: laharana.decalage, s: s, bouge: false };
      // Sur une fenêtre, l'appui passe : le champ touché prend le curseur,
      // le bouton touché répond, comme hors de la rangée.
      if(surFond) e.preventDefault();
    }, true);
    document.addEventListener('pointermove', function(e){
      if(!geste || !laharana) return;
      // Mifanongoa glisse en hauteur, Milahatra en largeur.
      const dx = laharana.sens === 'y' ? e.clientY - geste.y : e.clientX - geste.x;
      const autre = laharana.sens === 'y' ? e.clientX - geste.x : e.clientY - geste.y;
      if(!geste.bouge && Math.abs(dx) < 8 && Math.abs(autre) < 8) return;
      // Sur une fenêtre, un geste d'abord vertical fait défiler son contenu :
      // la rangée le laisse.
      if(!geste.bouge && geste.s && Math.abs(autre) >= Math.abs(dx)){ geste = null; return; }
      if(!geste.bouge && Math.abs(dx) < 8) return;
      geste.bouge = true;
      e.preventDefault();
      laharana.decalage = geste.depart + dx;
      poserLaharana();
    }, true);
    document.addEventListener('pointerup', function(){
      if(!geste) return;
      const g = geste;
      geste = null;
      if(g.bouge){ apresGlisse = true; return; }
      if(!laharana) return;
      // Le fond referme la rangée ; une fenêtre touchée reste à sa place.
      if(!g.s) quitterLaharana(null);
    }, true);
    document.addEventListener('pointercancel', function(){ geste = null; }, true);
    // Un clic après un glissement n'ouvre rien : la rangée a bougé sous le
    // doigt, ce n'était pas un choix. Un simple appui, lui, agit dans la
    // fenêtre.
    document.addEventListener('click', function(e){
      if(!apresGlisse) return;
      apresGlisse = false;
      if(e.target.closest && e.target.closest('.fenetre-boutons')) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    // La molette fait défiler la rangée, et Échap la referme. Sur une
    // fenêtre, la molette garde son rôle (faire défiler le contenu), sauf de
    // côté dans Milahatra, qui est le sens de la rangée.
    document.addEventListener('wheel', function(e){
      if(!laharana) return;
      const surFenetre = laharana.liste.some(function(x){ return x.el.contains(e.target); });
      if(surFenetre && (laharana.sens === 'y' || Math.abs(e.deltaY) >= Math.abs(e.deltaX))) return;
      e.preventDefault();
      laharana.decalage -= (laharana.sens !== 'y' && Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
      poserLaharana();
    }, { passive: false, capture: true });
    document.addEventListener('keydown', function(e){
      if(laharana && e.key === 'Escape') quitterLaharana(null);
    });
    // ✖ Hidio daholo : chacune se ferme comme à sa croix. Les pages d'abord,
    // l'Accueil en dernier : fermer la dernière page rouvrirait le fil.
    function hidioDaholo(){
      quitterLaharana(null);
      ouvertes().filter(function(s){ return s.el.id !== 'dash-accueil'; })
        .forEach(function(s){ glisser(s, 0); fermerFenetre(s.el); });
      const accueil = document.getElementById('dash-accueil');
      if(visible(accueil)) fermerFenetre(accueil);
      synchroniser();
    }
    window.__alaminoFenetres = alaminoFenetres;
    window.__hidioDaholo = hidioDaholo;

    // Ce qui place les fenêtres leur impose une hauteur maximale ; la taille
    // choisie doit reprendre la main juste après.
    const placerAvant = placerPresDuMenu;
    placerPresDuMenu = function(el){
      placerAvant(el);
      appliquerTaille(el);
      synchroniser();
    };

    // L'écran change de taille : une fenêtre à qui personne n'a donné de
    // taille reprend celle d'ouverture, les autres se rentrent dans le cadre.
    function replacerLesPages(){
      // En rangée, c'est elle qui place les fenêtres.
      if(laharana){ poserLaharana(); return; }
      const tailles = lire();
      const places = lirePlaces();
      suivis.forEach(function(s){
        if(!(s.page || s.commePage) || !visible(s.el)) return;
        if(s.agrandie) remplirBande(s);
        else if(tailles[s.el.id] || places[s.el.id]) appliquerTaille(s.el); else poserFenetre(s.el);
      });
      synchroniser();
    }
    // L'Accueil est déjà ouvert quand la page arrive : aucun changement ne
    // viendra prévenir qu'il faut le poser, il faut donc le faire soi-même.
    requestAnimationFrame(synchroniser);
    window.addEventListener('load', synchroniser);


    window.addEventListener('resize', replacerLesPages);
    window.addEventListener('orientationchange', replacerLesPages);
    window.addEventListener('scroll', synchroniser, { passive: true });
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', synchroniser);
      window.visualViewport.addEventListener('scroll', synchroniser);
    }
    // Une fois la mise en page posée : une fenêtre ouverte d'une visite à
    // l'autre a pu être calculée pour une bande qui n'existe plus.
    requestAnimationFrame(function(){ replacerLesPages(); });
  })();

  // ---------------- ÉCRIRE ----------------
  // La boîte d'écriture occupait le haut du fil en permanence, alors qu'on
  // vient surtout y lire. Elle s'ouvre maintenant depuis la rangée du bas.
  // Le crayon se trouve à deux endroits — la rangée du bas et le menu — et les
  // deux ouvrent la même boîte. On les traite ensemble : un seul état, deux
  // portes.
  var boutonsComposer = ['composerToggle', 'barComposer']
    .map(function(id){ return document.getElementById(id); })
    .filter(Boolean);
  var fbComposer = document.getElementById('fbComposer');
  if(boutonsComposer.length && fbComposer){
    // Elle quitte le fil pour flotter : le fil n'est plus qu'un fil, et la
    // boîte s'ouvre là où on l'appelle, quelle que soit la page.
    document.body.appendChild(fbComposer);
    fbComposer.classList.add('composer-flottant');

    function placerComposer(){
      const rangee = document.querySelector('.dash-tabs-main');
      // Une rangée escamotée ne prend plus de place : la boîte peut descendre.
      const haute = (rangee && !rangee.classList.contains('barre-cachee'))
        ? rangee.getBoundingClientRect().height : 0;
      fbComposer.style.bottom = (haute + 10) + 'px';
    }

    function marquerLesBoutons(ouvert){
      boutonsComposer.forEach(function(b){ b.setAttribute('aria-expanded', ouvert ? 'true' : 'false'); });
    }

    function fermerComposer(){
      fbComposer.style.display = 'none';
      marquerLesBoutons(false);
    }
    // Pour la croix et le trait de sa fenêtre (plus haut).
    window.__fermerComposer = fermerComposer;

    boutonsComposer.forEach(function(bouton){
      bouton.addEventListener('click', function(e){
        e.stopPropagation();
        if(fbComposer.style.display !== 'none'){ fermerComposer(); return; }
        // Comme les autres pages du menu : le menu s'efface quand elle s'ouvre,
        // sinon il restait posé sur elle.
        const menu = document.getElementById('navList');
        if(menu && menu.classList.contains('open')){
          menu.classList.remove('open');
          const n = document.getElementById('menuToggle');
          if(n) n.setAttribute('aria-expanded', 'false');
        }
        fbComposer.style.display = '';
        marquerLesBoutons(true);
        placerComposer();
        const champ = document.getElementById('newsMessage');
        if(champ) champ.focus({ preventScroll: true });
      });
    });

    // La rangée s'efface au défilement : la boîte suit, sinon elle laisserait
    // un vide sous elle.
    window.addEventListener('scroll', function(){
      if(fbComposer.style.display !== 'none') placerComposer();
    }, { passive: true });
    window.addEventListener('resize', function(){
      if(fbComposer.style.display !== 'none') placerComposer();
    });

    // Un clic à côté ne la referme plus : c'est une fenêtre parmi d'autres,
    // qui passe derrière celle qu'on touche (23/10/2026).

    // L'envoi réussi le dit lui-même (parametres.js) ; en cas d'échec ou de
    // fiche incomplète, rien ne vient, et la boîte reste ouverte.
    document.addEventListener('billet-publie', function(){
      fermerComposer();
      // On montre le fil : sans cela, rien ne dit que le message est parti.
      if(typeof ouvrirDepuisLeMenu === 'function') ouvrirDepuisLeMenu('accueil');
    });
  }

  // ---------------- LA VERSION AFFICHÉE ----------------
  // « C'est encore l'ancienne » et « c'est la nouvelle » se ressemblent trop
  // pour qu'on en discute à distance. Le menu porte l'empreinte de la version
  // installée : on la lit, on la compare, la question est close.
  //
  // Elle n'est écrite nulle part à la main — ce serait un chiffre de plus à
  // oublier. On la lit sur l'adresse du script, que le versionneur estampille
  // à chaque envoi avec l'empreinte de son contenu.
  // L'empreinte de la version qui tourne. D'abord celle du site entier, que le
  // versionneur écrit dans la page (meta « ny-asako-version ») : elle change dès
  // que change un fichier, ou la page elle-même. À défaut — une page d'avant
  // cette meta —, celle de common.js, lue sur l'adresse du script. Elle sert
  // deux fois : à l'afficher, et à savoir si celle du serveur a changé.
  const VERSION_DU_SITE = (function(){
    const meta = document.querySelector('meta[name="ny-asako-version"]');
    return meta ? (meta.getAttribute('content') || '').trim() : '';
  })();
  const VERSION = VERSION_DU_SITE || (function(){
    const script = document.querySelector('script[src*="common.js"]');
    const src = script ? script.getAttribute('src') || '' : '';
    return (src.split('?v=')[1] || '').trim();
  })();
  (function(){
    const ligne = document.getElementById('menuVersion');
    if(!ligne) return;
    ligne.textContent = VERSION ? ('version ' + VERSION) : 'version —';
  })();

  // ---------------- LA VEILLE DE VERSION ----------------
  // Le service worker se met à jour tout seul, et la page se recharge quand il
  // prend la main. Cela suppose qu'il fasse son travail : un service worker
  // resté en travers, un cache têtu, et le téléphone garde la version de la
  // veille sans que rien ne le signale.
  //
  // Alors on va voir soi-même. On demande la page au serveur, sans passer par
  // aucun cache, et on lit l'empreinte qu'elle annonce. Différente de celle qui
  // tourne : on vide les caches et on recharge — c'est ce « vider » qui fait
  // que la mise à jour est entière, et non à moitié.
  //
  // On compare la version du site entier, et non plus celle de common.js
  // seule : un changement de style, d'un autre script ou de la page ne touche
  // pas common.js, et le téléphone restait sur l'ancienne sans que rien ne le
  // voie.
  (function(){
    if(!VERSION || !window.fetch) return;
    // Une fois par version, et pas davantage : si le rechargement ne suffit
    // pas, on n'y revient pas en boucle — mieux vaut une version en retard
    // qu'une page qui se recharge sans fin.
    const MARQUE = 'stockmanager_version_rechargee';
    const DELAI = 5 * 60 * 1000;
    let enCours = false;
    let enAttente = '';

    function dejaTentee(v){
      try{ return sessionStorage.getItem(MARQUE) === v; }catch(e){ return false; }
    }
    function noterTentative(v){
      try{ sessionStorage.setItem(MARQUE, v); }catch(e){}
    }
    function oublierTentative(){
      try{ sessionStorage.removeItem(MARQUE); }catch(e){}
    }

    // La version annoncée par le serveur, lue comme on lit la sienne.
    function versionEnLigne(texte){
      if(VERSION_DU_SITE){
        const meta = texte.match(/<meta name="ny-asako-version" content="([a-f0-9]+)"/);
        if(meta) return meta[1];
      }
      const script = texte.match(/common\.js\?v=([a-f0-9]+)/);
      return script ? script[1] : '';
    }

    // Quelqu'un écrit — une note, une lettre, une case d'Excel : recharger
    // maintenant emporterait ce qu'il tape.
    function occupe(){
      const a = document.activeElement;
      return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable));
    }

    function appliquer(v){
      noterTentative(v);
      // Les caches d'abord : sans cela le rechargement retrouverait les
      // mêmes fichiers, et l'on aurait tourné pour rien.
      const vider = window.caches
        ? caches.keys().then(function(noms){ return Promise.all(noms.map(function(n){ return caches.delete(n); })); })
        : Promise.resolve();
      return vider.catch(function(){}).then(function(){ location.reload(); });
    }

    // On le dit plutôt que de recharger sous ses doigts. Le bouton applique
    // tout de suite ; sinon, la mise à jour se fait au prochain retour sur
    // l'application, quand plus rien n'est en cours d'écriture.
    function proposer(v){
      enAttente = v;
      let b = document.getElementById('bandeauVersion');
      if(!b){
        b = document.createElement('div');
        b.id = 'bandeauVersion';
        b.className = 'bandeau-install';
        b.innerHTML = '<span class="bandeau-install-icone" aria-hidden="true">🔄</span>' +
          '<div class="bandeau-install-texte"><strong>Misy version vaovao</strong>' +
          '<span>Tsindrio « Havaozina » rehefa vita ny soratanao.</span></div>' +
          '<button type="button" class="btn btn-sm btn-primary">Havaozina</button>';
        b.querySelector('button').addEventListener('click', function(){ appliquer(enAttente); });
        document.body.appendChild(b);
      }
      b.hidden = false;
    }

    function verifier(){
      if(enCours || document.hidden) return;
      enCours = true;
      fetch('/ny-asako.html', { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.text() : null; })
        .then(function(texte){
          if(!texte) return;
          const enLigne = versionEnLigne(texte);
          if(!enLigne) return;
          if(enLigne === VERSION){ oublierTentative(); return; }
          if(dejaTentee(enLigne)) return;
          if(occupe()){ proposer(enLigne); return; }
          return appliquer(enLigne);
        })
        .catch(function(){})
        .then(function(){ enCours = false; });
    }

    // Au démarrage, mais après lui : la première ouverture a mieux à faire.
    setTimeout(verifier, 4000);
    // Chaque fois qu'on revient à l'application — c'est là qu'une application
    // installée, restée ouverte des jours, a le plus de retard à rattraper.
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) verifier();
    });
    window.addEventListener('focus', verifier);
    setInterval(verifier, DELAI);
  })();

  // ---------------- APPLICATION INSTALLABLE ----------------
  // Le site s'installe : une icône sur l'écran d'accueil ou le bureau, une
  // fenêtre à lui, et il s'ouvre même sans réseau.
  (function(){
    // Le service worker est ce qui rend l'installation possible — et ce qui
    // garde la page quand le réseau manque. Il n'existe qu'en https (ou en
    // local) : ailleurs, on ne tente rien plutôt que de jeter une erreur.
    if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
      // Le téléphone restait sur la version de la veille. Le nouveau service
      // worker prenait bien la main — il s'installe et réclame les pages tout
      // de suite — mais la page déjà ouverte, elle, gardait son ancien code
      // jusqu'à ce que quelqu'un pense à la recharger. Personne n'y pense.
      //
      // On avait un contrôleur avant : c'est donc un remplacement, et la page
      // affichée est périmée. Sans ce test, la toute première visite se
      // rechargerait pour rien, au moment même où le service worker s'installe.
      const avaitUnControleur = !!navigator.serviceWorker.controller;
      let rechargeFaite = false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(!avaitUnControleur || rechargeFaite) return;
        rechargeFaite = true;
        location.reload();
      });
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('/sw.js').then(function(inscription){
          inscription.update();
          // Une application installée reste ouverte des jours durant sans
          // jamais recharger. On redemande à chaque fois qu'on y revient.
          document.addEventListener('visibilitychange', function(){
            if(!document.hidden) inscription.update();
          });
        }).catch(function(){});
      });
    }

    // L'entrée « Installer l'application » du menu n'est pas revenue : elle
    // doublait l'icône de la barre d'adresse, et se trouvait derrière un menu
    // qu'il fallait penser à ouvrir. C'est un bandeau qui la remplace — il se
    // montre de lui-même, une fois, et s'en va pour de bon.
    const bandeau = document.getElementById('bandeauInstall');
    if(!bandeau) return;
    // Sorti de l'application pour être posé sur le corps de la page : un
    // ancêtre porteur d'un « transform » redéfinit ce à quoi « position:fixed »
    // se rapporte, et le bandeau se serait ancré à lui plutôt qu'à l'écran.
    document.body.appendChild(bandeau);

    const sous = document.getElementById('bandeauInstallSous');
    const oui = document.getElementById('bandeauInstallOui');
    const non = document.getElementById('bandeauInstallNon');
    // Ny asako Hôtel s'installe à part : sa proposition a sa propre clé.
    const CLE = 'stockmanager_install_propose' +
      (document.documentElement.classList.contains('app-hotely') ? '_hotely' : '');

    function dejaRepondu(){
      try{ return localStorage.getItem(CLE) === 'oui'; }catch(e){ return false; }
    }
    function noterLaReponse(){
      try{ localStorage.setItem(CLE, 'oui'); }catch(e){}
    }
    function dejaInstallee(){
      return window.matchMedia('(display-mode: standalone)').matches ||
             window.navigator.standalone === true;
    }
    function surIOS(){
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    function applicationVisible(){
      const el = document.getElementById('appScreen');
      return !!el && getComputedStyle(el).display !== 'none';
    }

    // La rangée du bas est fixée à l'écran : le bandeau posé au même endroit
    // passerait dessous. On mesure sa hauteur et le style s'en sert.
    function mesurerLaRangee(){
      const rangee = document.getElementById('stockMainTabs');
      const h = rangee ? Math.round(rangee.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--barre-bas-h', h + 'px');
    }

    function cacher(){ bandeau.hidden = true; }

    // Chrome et Edge préviennent quand ils sont prêts à proposer l'installation.
    // On retient l'événement : il ne se redonne pas, et ne s'accepte que sur un
    // geste de la personne.
    let invitation = null;
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      invitation = e;
      envisager();
    });
    window.addEventListener('appinstalled', function(){
      invitation = null;
      noterLaReponse();
      cacher();
    });

    function montrer(){
      if(invitation){
        if(sous) sous.textContent = "Une icône sur l'écran d'accueil, et elle s'ouvre en plein écran.";
        if(oui) oui.hidden = false;
      }else{
        // Safari ne propose rien et n'annonce rien : le seul chemin passe par
        // le menu de partage. Le bouton ouvre ici un petit guide illustré,
        // étape par étape, plutôt qu'une phrase à retenir.
        if(sous) sous.textContent = "Sur iPhone, ça passe par le bouton Partager de Safari : 4 étapes.";
        if(oui){ oui.hidden = false; oui.textContent = 'Voir comment'; }
      }
      mesurerLaRangee();
      bandeau.hidden = false;
      // Proposé une fois, et une seule : quelqu'un qui ne répond pas a répondu
      // quand même. L'icône de la barre d'adresse reste là pour qui se ravise.
      noterLaReponse();
    }

    // Le bandeau attend que l'application soit ouverte — sur l'écran de
    // connexion, il vient avant qu'on sache seulement où l'on entre — puis
    // laisse passer quelques secondes, le temps que la page se pose.
    let prevu = false;
    function envisager(){
      if(prevu || dejaRepondu() || dejaInstallee()) return;
      if(!invitation && !surIOS()) return;   // ailleurs, rien à proposer
      if(!applicationVisible()) return;
      prevu = true;
      setTimeout(function essai(){
        if(dejaInstallee() || !applicationVisible()){ prevu = false; return; }
        // Une visite « Fanazavana » ou le guide d'accueil passe devant : le
        // bandeau, proposé une seule fois, serait caché dessous et perdu.
        const devant = ['fzVisite', 'welcomeOverlay', 'guideInstallIOS'].some(function(id){
          const el = document.getElementById(id);
          return el && getComputedStyle(el).display !== 'none';
        });
        if(devant){ setTimeout(essai, 3000); return; }
        montrer();
      }, 5000);
    }

    // ---- Le guide iPhone : quatre petites étapes illustrées, à la manière
    // des visites MVola (boîte blanche, « 1 / 4 », Ignorer / Suivant). Les
    // mots sont ceux qu'affiche l'iPhone, pour qu'on les retrouve à l'écran.
    const ICONE_PARTAGE = '<path d="M0 -14 L0 4 M-6 -8 L0 -14 L6 -8" fill="none" stroke="#0a84ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M-7 -3 H-10 V12 H10 V-3 H7" fill="none" stroke="#0a84ff" stroke-width="2.6" stroke-linejoin="round"/>';
    const ETAPES_IOS = [
      {
        titre: 'Touchez « Partager »',
        texte: 'Dans <strong>Safari</strong>, touchez le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut), en bas de l\'écran. ' +
          'Si vous ne le voyez pas, touchez d\'abord <strong>•••</strong> en bas à droite.',
        sary: '<svg viewBox="0 0 260 120" class="ios-sary">' +
          '<rect x="10" y="10" width="240" height="100" rx="14" fill="#f2f2f7"/>' +
          '<rect x="22" y="22" width="216" height="26" rx="9" fill="#e3e3ea"/>' +
          '<text x="130" y="40" text-anchor="middle" font-size="11" fill="#555">nyasako.com</text>' +
          '<g transform="translate(40 84)"><path d="M6 -7 L-2 0 L6 7" fill="none" stroke="#0a84ff" stroke-width="2.6" stroke-linecap="round"/></g>' +
          '<g transform="translate(85 84)"><path d="M-6 -7 L2 0 L-6 7" fill="none" stroke="#c7c7cc" stroke-width="2.6" stroke-linecap="round"/></g>' +
          '<circle cx="130" cy="82" r="20" fill="#0a84ff" opacity=".14" class="ios-pulse"/>' +
          '<g transform="translate(130 82)">' + ICONE_PARTAGE + '</g>' +
          '<g transform="translate(175 84)" fill="none" stroke="#0a84ff" stroke-width="2.2"><path d="M-8 -8 h16 v16 h-16 z"/><path d="M-4 -4 h8"/></g>' +
          '<g transform="translate(220 84)" fill="#0a84ff"><circle cx="-7" cy="0" r="2.2"/><circle cx="0" cy="0" r="2.2"/><circle cx="7" cy="0" r="2.2"/></g>' +
        '</svg>'
      },
      {
        titre: 'Touchez « Sur l\'écran d\'accueil »',
        texte: 'Une liste s\'ouvre. Faites-la glisser vers le haut si besoin, puis touchez <strong>Sur l\'écran d\'accueil</strong> ' +
          '(l\'icône avec un <strong>+</strong> dans un carré).',
        sary: '<svg viewBox="0 0 260 120" class="ios-sary">' +
          '<rect x="10" y="6" width="240" height="108" rx="14" fill="#f2f2f7"/>' +
          '<rect x="22" y="16" width="216" height="26" rx="8" fill="#fff"/><text x="34" y="33" font-size="11" fill="#333">Copier</text>' +
          '<rect x="22" y="47" width="216" height="26" rx="8" fill="#fff"/><text x="34" y="64" font-size="11" fill="#333">Ajouter aux favoris</text>' +
          '<rect x="22" y="78" width="216" height="28" rx="8" fill="#fff" stroke="#0a84ff" stroke-width="2.5" class="ios-pulse-trait"/>' +
          '<text x="34" y="96" font-size="11.5" font-weight="700" fill="#111">Sur l\'écran d\'accueil</text>' +
          '<g transform="translate(220 92)" fill="none" stroke="#111" stroke-width="1.8"><rect x="-8" y="-8" width="16" height="16" rx="3"/><path d="M0 -4 v8 M-4 0 h8"/></g>' +
        '</svg>'
      },
      {
        titre: 'Touchez « Ajouter »',
        texte: 'Le nom <strong>Ny asako</strong> est déjà écrit. Touchez <strong>Ajouter</strong>, en haut à droite.',
        sary: '<svg viewBox="0 0 260 120" class="ios-sary">' +
          '<rect x="10" y="10" width="240" height="100" rx="14" fill="#f2f2f7"/>' +
          '<text x="26" y="34" font-size="11.5" fill="#0a84ff">Annuler</text>' +
          '<text x="130" y="34" text-anchor="middle" font-size="11.5" font-weight="700" fill="#111">Ajouter à l\'écran</text>' +
          '<rect x="190" y="18" width="52" height="24" rx="12" fill="#0a84ff" opacity=".14" class="ios-pulse"/>' +
          '<text x="216" y="34" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0a84ff">Ajouter</text>' +
          '<rect x="22" y="52" width="216" height="46" rx="10" fill="#fff"/>' +
          '<image href="/icone-192.png" x="32" y="58" width="34" height="34"/>' +
          '<text x="78" y="80" font-size="12" fill="#111">Ny asako</text>' +
        '</svg>'
      },
      {
        titre: 'C\'est installé',
        texte: 'L\'icône <strong>Ny asako</strong> est sur votre écran d\'accueil. Ouvrez l\'application <strong>depuis cette icône</strong> : ' +
          'elle s\'affiche en plein écran, comme une vraie application.',
        sary: '<svg viewBox="0 0 260 120" class="ios-sary">' +
          '<rect x="70" y="4" width="120" height="112" rx="18" fill="#1c1c2e"/>' +
          '<g fill="#3a3a55"><rect x="84" y="16" width="22" height="22" rx="6"/><rect x="119" y="16" width="22" height="22" rx="6"/><rect x="154" y="16" width="22" height="22" rx="6"/>' +
          '<rect x="84" y="50" width="22" height="22" rx="6"/><rect x="154" y="50" width="22" height="22" rx="6"/></g>' +
          '<g class="ios-pop"><image href="/icone-192.png" x="117" y="48" width="26" height="26"/></g>' +
          '<text x="130" y="86" text-anchor="middle" font-size="8" fill="#fff">Ny asako</text>' +
        '</svg>'
      }
    ];

    function ouvrirGuideIOS(){
      let guide = document.getElementById('guideInstallIOS');
      if(!guide){
        guide = document.createElement('div');
        guide.id = 'guideInstallIOS';
        guide.setAttribute('role', 'dialog');
        guide.setAttribute('aria-modal', 'true');
        guide.innerHTML =
          '<style>' +
            '#guideInstallIOS{ position:fixed; inset:0; z-index:10060; background:rgba(0,0,0,0.62); display:flex; align-items:flex-end; justify-content:center; padding:0.8rem; }' +
            '#guideInstallIOS .ios-boite{ width:min(480px, 100%); background:#fff; color:#111; border-radius:22px; padding:1.1rem 1.2rem 0.9rem; margin-bottom:env(safe-area-inset-bottom, 0px); font-family:var(--font-body, sans-serif); }' +
            '#guideInstallIOS .ios-tete{ display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:0.5rem; }' +
            '#guideInstallIOS .ios-titre{ font-size:1.05rem; line-height:1.3; }' +
            '#guideInstallIOS .ios-isa{ color:#777; font-size:0.9rem; white-space:nowrap; }' +
            '#guideInstallIOS .ios-sary{ display:block; width:100%; max-width:300px; height:auto; margin:0.2rem auto 0.7rem; }' +
            '#guideInstallIOS .ios-texte{ font-size:0.93rem; line-height:1.55; color:#222; margin-bottom:1rem; }' +
            '#guideInstallIOS .ios-bokotra{ display:flex; gap:0.7rem; }' +
            '#guideInstallIOS .ios-bokotra button{ flex:1; border-radius:999px; padding:0.7rem 1rem; font-size:0.95rem; cursor:pointer; font-family:inherit; }' +
            '#guideInstallIOS .ios-ignorer{ background:#fff; color:#111; border:2px solid #111; }' +
            '#guideInstallIOS .ios-suivant{ background:#111; color:#fff; border:2px solid #111; }' +
            '#guideInstallIOS .ios-points{ display:flex; justify-content:center; gap:6px; margin-top:0.8rem; }' +
            '#guideInstallIOS .ios-points span{ width:7px; height:7px; border-radius:999px; background:#ccc; }' +
            '#guideInstallIOS .ios-points span.ici{ width:22px; background:#111; }' +
            '#guideInstallIOS .ios-pulse{ animation:iosPulse 1.4s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }' +
            '#guideInstallIOS .ios-pulse-trait{ animation:iosTrait 1.4s ease-in-out infinite; }' +
            '#guideInstallIOS .ios-pop{ animation:iosPop 1.6s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }' +
            '@keyframes iosPulse{ 0%,100%{ transform:scale(1); opacity:.14; } 50%{ transform:scale(1.35); opacity:.3; } }' +
            '@keyframes iosTrait{ 0%,100%{ stroke-opacity:1; } 50%{ stroke-opacity:.3; } }' +
            '@keyframes iosPop{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.15); } }' +
            '@media (prefers-reduced-motion: reduce){ #guideInstallIOS *{ animation:none !important; } }' +
          '</style>' +
          '<div class="ios-boite">' +
            '<div class="ios-tete"><strong class="ios-titre"></strong><span class="ios-isa"></span></div>' +
            '<div class="ios-sary-zone"></div>' +
            '<div class="ios-texte"></div>' +
            '<div class="ios-bokotra">' +
              '<button type="button" class="ios-ignorer">Ignorer</button>' +
              '<button type="button" class="ios-suivant">Suivant</button>' +
            '</div>' +
            '<div class="ios-points" aria-hidden="true"></div>' +
          '</div>';
        document.body.appendChild(guide);
        guide.querySelector('.ios-ignorer').addEventListener('click', function(){ guide.style.display = 'none'; });
        guide.querySelector('.ios-suivant').addEventListener('click', function(){
          const i = Number(guide.dataset.etape || 0);
          if(i < ETAPES_IOS.length - 1) etapeIOS(i + 1); else guide.style.display = 'none';
        });
      }
      guide.style.display = 'flex';
      etapeIOS(0);
    }
    function etapeIOS(i){
      const guide = document.getElementById('guideInstallIOS');
      const e = ETAPES_IOS[i];
      guide.dataset.etape = i;
      guide.querySelector('.ios-titre').textContent = e.titre;
      guide.querySelector('.ios-isa').textContent = (i + 1) + ' / ' + ETAPES_IOS.length;
      guide.querySelector('.ios-sary-zone').innerHTML = e.sary;
      guide.querySelector('.ios-texte').innerHTML = e.texte;
      guide.querySelector('.ios-suivant').textContent = i === ETAPES_IOS.length - 1 ? 'Vita' : 'Suivant';
      const points = guide.querySelector('.ios-points');
      points.innerHTML = ETAPES_IOS.map(function(_, j){ return '<span' + (j === i ? ' class="ici"' : '') + '></span>'; }).join('');
    }
    window.__ouvrirGuideInstallIOS = ouvrirGuideIOS;

    if(oui) oui.addEventListener('click', function(){
      cacher();
      if(!invitation){ if(surIOS()) ouvrirGuideIOS(); return; }
      invitation.prompt();
      invitation.userChoice.then(function(){ invitation = null; }, function(){});
    });
    if(non) non.addEventListener('click', function(){
      noterLaReponse();
      cacher();
    });

    window.addEventListener('resize', function(){
      if(!bandeau.hidden) mesurerLaRangee();
    });

    // L'application s'ouvre après coup, une fois la connexion faite : on guette
    // le moment où elle paraît plutôt que de tenter notre chance au chargement.
    const ecran = document.getElementById('appScreen');
    if(ecran){
      new MutationObserver(envisager).observe(ecran, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    envisager();
  })();

  // ---------------- SANS RÉSEAU ----------------
  // La page s'ouvre sans réseau — le service worker en garde une copie — mais
  // Supabase, lui, ne répond pas : les listes restent vides, l'entrée est
  // refusée, et rien n'en donne la raison. Une bande le dit.
  (function(){
    const bande = document.getElementById('bandeauReseau');
    if(!bande) return;
    function majReseau(){ bande.hidden = navigator.onLine !== false; }
    window.addEventListener('online', majReseau);
    window.addEventListener('offline', majReseau);
    majReseau();
  })();

  // ---------------- PAGES ÉPINGLÉES ----------------
  // Une page ouverte depuis le menu laisse son icône dans la rangée du bas :
  // le deuxième passage ne demande plus d'ouvrir le menu. Les icônes restent
  // d'une visite à l'autre — épinglées puis disparues au rechargement, elles
  // n'inspireraient aucune confiance.
  //
  // Elles s'en vont de deux façons, au choix : à la main, par une croix ; ou
  // d'elles-mêmes, les moins servies cédant la place aux dernières ouvertes.
  (function(){
    const rangee = document.getElementById('stockMainTabs');
    if(!rangee) return;
    const CLE = 'stockmanager_barre_epingles';
    const CLE_MODE = 'stockmanager_barre_mode';

    // Chaque épingle retient sa dernière visite : c'est elle qui décide, en
    // automatique, laquelle cède la place.
    function lireEpingles(){
      let brut = [];
      try{ brut = JSON.parse(localStorage.getItem(CLE)) || []; }catch(e){ brut = []; }
      if(!Array.isArray(brut)) return [];
      // Les premières versions n'enregistraient que la clé.
      // Le panier était un bouton (« id:menuPanier ») avant d'être une page
      // (« section:panier ») : même entrée, une seule icône.
      const vues = {};
      return brut.map(function(x){
        x = (typeof x === 'string') ? { cle: x, vu: 0 } : x;
        if(x && x.cle === 'id:menuPanier') x.cle = 'section:panier';
        return x;
      }).filter(function(x){
        if(!x || !x.cle || JAMAIS_EPINGLEES.indexOf(x.cle) >= 0 || vues[x.cle]) return false;
        vues[x.cle] = true;
        return true;
      });
    }
    // Télécharger Fokontany / Commun : une action faite une fois, comme
    // « Installer l'application ». Les deux icônes 📲, pareilles, restaient
    // dans la rangée sans qu'on sache laquelle était laquelle. Écartées ici,
    // elles disparaissent aussi des rangées où elles étaient déjà posées.
    const JAMAIS_EPINGLEES = ['id:menuInstallFokontany', 'id:menuInstallCommun', 'id:menuInstallHotel'];
    function ecrireEpingles(liste){
      try{ localStorage.setItem(CLE, JSON.stringify(liste)); }catch(e){}
    }
    function lireMode(){
      try{ return localStorage.getItem(CLE_MODE) === 'auto' ? 'auto' : 'manuel'; }
      catch(e){ return 'manuel'; }
    }
    function ecrireMode(m){ try{ localStorage.setItem(CLE_MODE, m); }catch(e){} }

    // La clé désigne l'entrée du menu, pas l'icône : c'est elle qu'on recliquera.
    function cleDe(entree){
      return (entree.dataset && entree.dataset.section)
        ? 'section:' + entree.dataset.section
        : 'id:' + entree.id;
    }
    function entreeDe(cle){
      return cle.indexOf('section:') === 0
        ? document.querySelector('#navList .nav-item[data-section="' + cle.slice(8) + '"]')
        : document.getElementById(cle.slice(3));
    }

    // Le logo d'une entrée (Chrome, Edge, Multi-service), recopié pour servir
    // d'icône ailleurs. Ses dégradés sont renommés : le même nom dans deux
    // dessins ne désigne que le premier, celui du menu — caché, il ne peint
    // plus rien, et le logo recopié restait blanc.
    let copiesDeLogo = 0;
    function logoDe(entree){
      const svg = entree && entree.querySelector('.nav-logo');
      if(!svg) return null;
      const copie = svg.cloneNode(true);
      const suffixe = '-c' + (++copiesDeLogo);
      copie.querySelectorAll('[id]').forEach(function(el){
        const ancien = el.id;
        el.id = ancien + suffixe;
        copie.querySelectorAll('[fill="url(#' + ancien + ')"]').forEach(function(p){
          p.setAttribute('fill', 'url(#' + el.id + ')');
        });
      });
      return copie;
    }

    // Retirer une icône, c'est en avoir fini avec elle : ce qu'elle avait
    // ouvert se referme du même geste.
    function fermerLesFenetres(){
      const nav = document.getElementById('navList');
      if(nav) nav.classList.remove('open');
      ['notifPanel', 'marketPanel', 'livraisonPanel', 'recherchePanel', 'fbComposer', 'barReglages'].forEach(function(id){
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
      });
      ['menuToggle', 'menuFlottant', 'notifToggle', 'marketToggle', 'livraisonToggle', 'barRecherche',
       'composerToggle', 'barComposer', 'barReglagesBtn'].forEach(function(id){
        const el = document.getElementById(id);
        if(el) el.setAttribute('aria-expanded', 'false');
      });
    }

    // ---- Les entrées fixes de la rangée ----
    // Écrire et l'Accueil s'y trouvent d'origine. Elles s'enlèvent comme les
    // autres — on les retrouve dans le menu, qui les garde toutes.
    const CLE_RETIREES = 'stockmanager_barre_retirees';
    function lireRetirees(){
      try{ const l = JSON.parse(localStorage.getItem(CLE_RETIREES)); return Array.isArray(l) ? l : []; }
      catch(e){ return []; }
    }
    function ecrireRetirees(l){ try{ localStorage.setItem(CLE_RETIREES, JSON.stringify(l)); }catch(e){} }

    // La loupe et les réglages n'en reçoivent pas : ce sont les deux portes par
    // lesquelles on revient. Les enlever fermerait la pièce de l'intérieur.
    ['barComposer', 'barAccueil'].forEach(function(id){
      const bouton = document.getElementById(id);
      if(!bouton) return;
      bouton.dataset.retirable = id;
      const croix = document.createElement('span');
      croix.className = 'epingle-retirer';
      croix.textContent = '✕';
      const nom = bouton.title || id;
      croix.title = 'Esorina : ' + nom;
      croix.setAttribute('aria-label', 'Esorina : ' + nom);
      // stopPropagation : sans cela, retirer l'icône déclencherait ce qu'elle
      // sert à ouvrir.
      croix.addEventListener('click', function(e){
        e.stopPropagation();
        bouton.style.display = 'none';
        const l = lireRetirees();
        if(l.indexOf(id) < 0){ l.push(id); ecrireRetirees(l); }
        fermerLesFenetres();
        // Comme pour les icônes épinglées : ce que l'icône ouvrait ne reste pas
        // ouvert derrière elle. L'Accueil est devenu une fenêtre, et
        // fermerLesFenetres ne connaît que les panneaux.
        if(id === 'barAccueil'){
          const vue = document.getElementById('dash-accueil');
          if(vue) vue.classList.remove('active');
        }
        mesurer();
      });
      bouton.appendChild(croix);
    });
    lireRetirees().forEach(function(id){
      const bouton = document.getElementById(id);
      if(bouton) bouton.style.display = 'none';
    });

    // Une page fermée à sa croix. En automatique, son icône s'en va avec elle :
    // la rangée garde ce dont on se sert, et une page qu'on vient de fermer
    // n'en fait plus partie. En manuel, rien ne part sans la croix de l'icône.
    //
    // Botika et Écrire ne sont pas concernés : ce sont les deux entrées fixes,
    // le chemin du retour, et ils n'ont pas de clé d'épingle.
    function cleDeLaPage(id){
      if(!id) return '';
      if(id.indexOf('section-') === 0) return 'section:' + id.slice(8);
      if(id === 'dash-articles') return 'id:menuArticles';
      if(id === 'dash-dashboard') return 'id:menuTableauBord';
      if(id === 'dash-commun') return 'id:menuCommun';
      if(id === 'dash-communadmin') return 'id:menuCommunAdmin';
      return '';
    }
    // Six pages seulement se reconnaissaient à leur nom ; les autres (Panier,
    // Portefeuille…) gardaient leur icône à la fermeture. On retient donc,
    // à chaque entrée pressée, la page qui s'ouvre derrière elle.
    const CLE_PAGE_ICONE = 'stockmanager_barre_page_icone';
    function lirePageIcone(){
      try{ return JSON.parse(localStorage.getItem(CLE_PAGE_ICONE)) || {}; }catch(e){ return {}; }
    }
    function retenirLaPageDe(cle){
      // La page paraît un instant après le clic : on la cherche alors, la
      // fenêtre active du dessus.
      setTimeout(function(){
        const ouvertes = [].slice.call(document.querySelectorAll('.fenetre-page.active'))
          .filter(function(el){ return el.id && el.id !== 'dash-accueil' && el.offsetParent !== null; });
        if(!ouvertes.length) return;
        ouvertes.sort(function(a, b){ return (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0); });
        const id = ouvertes[0].id;
        if(cleDeLaPage(id)) return;
        const l = lirePageIcone();
        l[id] = cle;
        try{ localStorage.setItem(CLE_PAGE_ICONE, JSON.stringify(l)); }catch(e){}
      }, 250);
    }
    window.__pageFermee = function(id){
      const cle = cleDeLaPage(id) || lirePageIcone()[id];
      if(!cle) return;
      ecrireEpingles(lireEpingles().filter(function(e){ return e.cle !== cle; }));
      const bouton = rangee.querySelector('[data-epingle="' + cle + '"]');
      if(bouton) bouton.remove();
      mesurer();
    };
    // Une page réduite est encore ouverte : son icône clignote dans la rangée
    // pour le rappeler, jusqu'à ce qu'on la rouvre ou qu'on la ferme. Si elle
    // n'avait pas d'icône, elle en reçoit une — sinon rien ne dirait où elle est.
    window.__pageReduite = function(id, oui){
      const cle = cleDeLaPage(id);
      if(!cle) return;
      let bouton = rangee.querySelector('[data-epingle="' + cle + '"]');
      if(!bouton && oui){
        poser(cle, true);
        bouton = rangee.querySelector('[data-epingle="' + cle + '"]');
      }
      if(bouton) bouton.classList.toggle('reduite', !!oui);
    };

    function retirer(cle){
      ecrireEpingles(lireEpingles().filter(function(e){ return e.cle !== cle; }));
      const bouton = rangee.querySelector('[data-epingle="' + cle + '"]');
      if(bouton) bouton.remove();
      fermerLesFenetres();
      // La page que cette icône ouvrait ne doit pas rester derrière elle.
      // fermerLesFenetres ne connaît que les panneaux ; depuis que les pages
      // s'ouvrent en fenêtre, la leur restait ouverte alors que ce qui y menait
      // venait de disparaître.
      const cible = cle.indexOf('section:') === 0
        ? document.getElementById('section-' + cle.slice(8))
        : (cle === 'id:menuArticles' ? document.getElementById('dash-articles')
        : (cle === 'id:menuTableauBord' ? document.getElementById('dash-dashboard')
          : (cle === 'id:menuCommun' ? document.getElementById('dash-commun')
            : (cle === 'id:menuCommunAdmin' ? document.getElementById('dash-communadmin') : null))));
      if(cible && cible.classList.contains('active')){
        const navStock = document.querySelector('.nav-item[data-section="stock"]');
        if(navStock) navStock.click();
        if(typeof showDashView === 'function') showDashView('accueil');
      }
      mesurer();
    }

    var poser = function(cle){
      const entree = entreeDe(cle);
      if(!entree || rangee.querySelector('[data-epingle="' + cle + '"]')) return;
      // « 📋 Articles » : l'emoji jusqu'à la première espace, le nom après.
      // On lit le premier libellé et non tout le bouton : la cloche porte un
      // compteur, qui donnerait « Notifications3 ».
      const porteur = entree.querySelector('span') || entree;
      const texte = porteur.textContent.trim();
      const espace = texte.indexOf(' ');
      // Chrome et Edge n'ont pas d'emoji mais leur logo : sans lui, la rangée
      // affichait leur nom en toutes lettres à la place d'une icône.
      const logo = logoDe(entree);
      const icone = logo ? '' : (espace > 0 ? texte.slice(0, espace) : texte);
      const nom = logo ? texte : (espace > 0 ? texte.slice(espace + 1).trim() : texte);

      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'dash-tab bar-icone';
      bouton.dataset.epingle = cle;
      bouton.title = nom;
      bouton.setAttribute('aria-label', nom);
      bouton.textContent = icone;
      if(logo) bouton.appendChild(logo);

      const croix = document.createElement('span');
      croix.className = 'epingle-retirer';
      croix.textContent = '✕';
      croix.title = 'Esorina : ' + nom;
      croix.setAttribute('aria-label', 'Esorina : ' + nom);
      // stopPropagation : sans cela, retirer l'icône ouvrirait la page qu'on
      // vient d'écarter.
      croix.addEventListener('click', function(e){ e.stopPropagation(); retirer(cle); });
      bouton.appendChild(croix);

      // On délègue à l'entrée du menu : elle sait déjà tout faire — changer de
      // page, refermer le menu, retenir la vue.
      //
      // stopPropagation sur le clic d'origine : sans lui, celui-ci poursuivait
      // sa route jusqu'au document, où le guetteur de « clic à côté » trouvait
      // un panneau tout juste ouvert et le refermait aussitôt. La cloche et les
      // achats s'ouvraient et se fermaient dans le même geste.
      bouton.addEventListener('click', function(e){
        e.stopPropagation();
        entree.click();
      });
      // Les pages épinglées se rangent après les entrées fixes et avant les
      // réglages, qui ferment la rangée. La loupe, elle, l'ouvre.
      //
      // Et entre elles, dans l'ordre du menu — non dans celui où on les a
      // ouvertes. Posées à la suite, les icônes changeaient de place d'un jour
      // à l'autre, et le doigt ne les retrouvait jamais au même endroit.
      const rang = rangDansLeMenu(cle);
      const suivant = [].slice.call(rangee.querySelectorAll('[data-epingle]')).filter(function(b){
        return b !== bouton && rangDansLeMenu(b.dataset.epingle) > rang;
      })[0];
      const reglages = document.getElementById('barReglagesBtn');
      if(suivant) rangee.insertBefore(bouton, suivant);
      else if(reglages && reglages.parentElement === rangee) rangee.insertBefore(bouton, reglages);
      else rangee.appendChild(bouton);
    };

    // La place d'une entrée dans le menu. Une entrée que le menu ne connaît
    // plus passe au bout, plutôt que de s'intercaler n'importe où.
    function rangDansLeMenu(cle){
      const i = entreesEpinglables().indexOf(entreeDe(cle));
      return i < 0 ? 9999 : i;
    }

    function mesurer(){
      const deborde = rangee.scrollWidth > rangee.clientWidth;
      rangee.classList.toggle('pleine', deborde);
      const reste = rangee.scrollWidth - rangee.clientWidth - rangee.scrollLeft;
      rangee.classList.toggle('reste-a-droite', reste > 4);
      // Et ce qui reste derrière : sans quoi rien ne dit qu'on peut revenir.
      rangee.classList.toggle('reste-a-gauche', rangee.scrollLeft > 4);
    }

    // Quand chaque entrée a vraiment servi. Pas « vu » : celui-ci se posait
    // aussi au premier remplissage de la rangée, une entrée après l'autre dans
    // l'ordre du menu. Passer en automatique gardait alors les six dernières
    // du menu — Portefeuille, Fond d'écran, Paramètres — et renvoyait les
    // Articles et les Notifications dont on se sert tous les jours.
    const CLE_UTILISE = 'stockmanager_barre_utilise';
    function lireUsages(){
      try{ return JSON.parse(localStorage.getItem(CLE_UTILISE)) || {}; }catch(e){ return {}; }
    }
    function noterUsage(cle){
      const u = lireUsages();
      u[cle] = Date.now();
      try{ localStorage.setItem(CLE_UTILISE, JSON.stringify(u)); }catch(e){}
    }

    // En automatique, la rangée se tient à six : celles qui ont servi le plus
    // récemment restent. À égalité — jamais servies —, l'ordre du menu
    // départage : ce qui y vient en tête est ce qui compte le plus.
    // En manuel, rien ne part sans qu'on le dise.
    // La rangée ne montre que ce qui est ouvert, comme la barre des tâches
    // d'un ordinateur : une page s'ouvre, son icône paraît ; on la ferme,
    // l'icône s'en va. Une page réduite garde la sienne (elle clignote). Dans
    // les deux modes : le manuel n'y ajoute que la ✕ sur chaque icône, qui
    // ferme la page et son icône d'un geste.
    function pageDeLaCle(cle){
      if(cle.indexOf('section:') === 0) return document.getElementById('section-' + cle.slice(8));
      const connues = { 'id:menuArticles': 'dash-articles', 'id:menuTableauBord': 'dash-dashboard',
        'id:menuCommun': 'dash-commun', 'id:menuCommunAdmin': 'dash-communadmin' };
      if(connues[cle]) return document.getElementById(connues[cle]);
      const l = lirePageIcone();
      for(const id in l){ if(l[id] === cle) return document.getElementById(id); }
      return null;
    }
    // Un panneau est ouvert quand son entrée du menu le dit (aria-expanded).
    // Une entrée sans cet état (Chrome, Edge…) n'ouvre rien qui reste :
    // elle n'a pas d'icône en automatique.
    function panneauOuvert(cle){
      const entree = entreeDe(cle);
      return !!(entree && entree.getAttribute('aria-expanded') === 'true');
    }
    function elaguer(){
      const liste = lireEpingles();
      const gardees = liste.filter(function(e){
        const bouton = rangee.querySelector('[data-epingle="' + e.cle + '"]');
        if(bouton && bouton.classList.contains('reduite')) return true;
        if(panneauOuvert(e.cle)) return true;
        const page = pageDeLaCle(e.cle);
        if(page && page.classList.contains('active')) return true;
        if(bouton) bouton.remove();
        return false;
      });
      // Les pages ouvertes qui n'ont pas encore leur icône la reçoivent —
      // celle rouverte au démarrage, par exemple, sans passer par le menu.
      [].forEach.call(document.querySelectorAll('.fenetre-page.active'), function(page){
        if(!page.id || page.id === 'dash-accueil') return;
        const cle = cleDeLaPage(page.id) || lirePageIcone()[page.id];
        // Posée sur le fond ou non : tant que la page est ouverte, une petite
        // icône la montre dans la rangée, comme la barre des tâches d'un
        // ordinateur montre ce qui est ouvert, raccourci sur le bureau ou pas.
        if(!cle || !entreeDe(cle)) return;
        if(gardees.some(function(e){ return e.cle === cle; })) return;
        gardees.push({ cle: cle, vu: Date.now() });
        poser(cle, true);
      });
      // Le crayon (« Écrire ») et la maison (« Botika ») suivent la même
      // règle : là tant que leur fenêtre est ouverte ou réduite, partis quand
      // on la ferme à sa ✕. Posés sur le fond, ils reviennent aussi dans la
      // rangée le temps que leur fenêtre est ouverte.
      [['barComposer', function(){ const b = document.getElementById('fbComposer'); return b && getComputedStyle(b).display !== 'none'; }],
       ['barAccueil', function(){ const v = document.getElementById('dash-accueil'); return v && v.classList.contains('active'); }]
      ].forEach(function(f){
        const bouton = document.getElementById(f[0]);
        if(!bouton) return;
        bouton.style.display = (f[1]() || bouton.classList.contains('reduite')) ? '' : 'none';
      });
      // Les panneaux (cloche, lune, achats, livraison…) aussi : leur icône
      // paraît tant qu'ils sont ouverts. Leur entrée le dit elle-même
      // (aria-expanded).
      entreesEpinglables().forEach(function(entree){
        const cle = cleDe(entree);
        // Écrire et l'Accueil ont déjà leur bouton fixe (le crayon, la maison).
        if(JUMEAUX[entree.id] || !panneauOuvert(cle)) return;
        if(gardees.some(function(e){ return e.cle === cle; })) return;
        gardees.push({ cle: cle, vu: Date.now() });
        poser(cle, true);
      });
      if(gardees.length !== liste.length || gardees.some(function(e, i){ return !liste[i] || liste[i].cle !== e.cle; })){
        ecrireEpingles(gardees);
      }
      mesurer();
    }
    // Une page s'ouvre ou se ferme de bien des façons (menu, icône, croix,
    // retour au démarrage) : la rangée se remet d'accord avec l'écran toutes
    // les secondes, plutôt que de compter sur chacune.
    setInterval(function(){ if(!document.hidden){ elaguer(); compterLesOuvertes(); } }, 1000);

    // Sur le N, le nombre de ce qui est encore ouvert (pages, panneaux,
    // Botika, boîte d'écriture — réduits compris) : on sait d'un coup d'œil
    // qu'il reste des sites derrière. Rien d'ouvert, pas de pastille.
    function compterLesOuvertes(){
      const n = document.getElementById('menuToggle');
      if(!n) return;
      let total = rangee.querySelectorAll('[data-epingle]').length;
      ['barComposer', 'barAccueil'].forEach(function(id){
        const b = document.getElementById(id);
        if(b && getComputedStyle(b).display !== 'none') total++;
      });
      let pastille = n.querySelector('.n-ouvertes');
      if(!total){ if(pastille) pastille.remove(); n.removeAttribute('data-ouvertes'); return; }
      if(!pastille){
        pastille = document.createElement('span');
        pastille.className = 'n-ouvertes';
        pastille.setAttribute('aria-hidden', 'true');
        n.appendChild(pastille);
      }
      pastille.textContent = total > 9 ? '9+' : String(total);
      n.setAttribute('data-ouvertes', String(total));
      n.title = 'Ouvrir le menu — ' + total + ' ouvert' + (total > 1 ? 's' : '');
    }
    compterLesOuvertes();

    // Écrire et l'Accueil tiennent déjà leur place dans la rangée. Les presser
    // dans le menu après les en avoir retirés doit les y ramener — et non en
    // poser un second exemplaire à côté du premier.
    const JUMEAUX = { menuAccueil: 'barAccueil', composerToggle: 'barComposer' };

    // remplissage : l'entrée est posée par « Averina ny sary rehetra » ou le
    // premier démarrage, et non choisie. Elle n'a donc pas servi.
    function epingler(entree, remplissage){
      const jumeau = JUMEAUX[entree.id];
      if(jumeau){
        // Déjà posée sur le fond : la rappeler du menu la remettrait aussi
        // dans la rangée, et on l'aurait aux deux endroits.
        if(surLeFond('fixe:' + jumeau)){ setTimeout(elaguer, 80); return; }
        const bouton = document.getElementById(jumeau);
        if(bouton) bouton.style.display = '';
        ecrireRetirees(lireRetirees().filter(function(id){ return id !== jumeau; }));
        mesurer();
        return;
      }
      const cle = cleDe(entree);
      if(surLeFond(cle)){ setTimeout(elaguer, 80); return; }
      if(!remplissage){ noterUsage(cle); retenirLaPageDe(cle); }
      const liste = lireEpingles();
      const connue = liste.filter(function(e){ return e.cle === cle; })[0];
      if(connue) connue.vu = Date.now();
      else liste.push({ cle: cle, vu: Date.now() });
      ecrireEpingles(liste);
      poser(cle);
      // La page ou le panneau s'ouvre juste après ce clic : on lui en laisse
      // le temps avant de regarder ce qui est ouvert.
      setTimeout(elaguer, 80);
      mesurer();
    }

    // Tout ce qu'on presse dans le menu se pose dans la rangée : les pages
    // comme les panneaux. Deux exceptions, et pour cause.
    //
    // « Stock » est masqué : il ne sert qu'à ouvrir la section depuis le code,
    // et l'Accueil passe par lui — l'épingler poserait une icône que personne
    // n'a demandée, à chaque retour à l'accueil.
    //
    // « Installer l'application » ne se fait qu'une fois : son icône
    // survivrait à ce pour quoi elle existe.
    //
    // « Se déconnecter » n'est pas une entrée du menu mais un bouton à part :
    // il reste dehors, et c'est aussi bien — une sortie n'a rien à faire dans
    // une rangée où le doigt passe.
    function entreesEpinglables(){
      // « Ny momba ahy » n'existe que pour l'employé : ouvert dans le
      // navigateur du patron, il y laisserait une icône vers une page vide.
      const hors = ['navStock', 'navMoi', 'menuInstallFokontany', 'menuInstallCommun', 'menuInstallHotel'];
      return [].slice.call(document.querySelectorAll('#navList .nav-action, #navList .nav-item[data-section]'))
        .filter(function(e){ return hors.indexOf(e.id) < 0; });
    }
    entreesEpinglables().forEach(function(entree){
      entree.addEventListener('click', function(){
        if(restaurationEnCours) return;
        epingler(entree);
      });
    });

    // ---- Le petit panneau des réglages ----
    const boutonReglages = document.getElementById('barReglagesBtn');
    const panneau = document.getElementById('barReglages');
    const note = document.getElementById('barReglagesNote');

    function direLeMode(){
      const mode = lireMode();
      // La croix ✕ des petites icônes, en manuel seulement. En automatique,
      // c'est la croix de la page ouverte qui retire son icône
      // (window.__pageFermee).
      rangee.classList.toggle('mode-manuel', mode === 'manuel');
      // Les icônes posées sur le fond obéissent au même réglage, et sont hors
      // de la rangée : c'est le corps de la page qui porte la consigne.
      document.body.classList.toggle('retrait-manuel', mode === 'manuel');
      if(panneau){
        panneau.querySelectorAll('.reglage-mode').forEach(function(b){
          b.classList.toggle('actif', b.dataset.mode === mode);
        });
      }
      const remettre = document.getElementById('barToutRemettre');
      if(remettre) remettre.style.display = 'none';
      if(note){
        note.textContent = mode === 'manuel'
          ? "Ny sarin'ny pejy misokatra ihany no eo ; ny ✕ eo amin'ny sary no manidy azy."
          : "Ny sarin'ny pejy misokatra ihany no eo ; miala izy rehefa hidinao amin'ny ✕ ilay pejy.";
      }
    }

    // Une rangée vidée — à la croix, ou par accident — ne se remplissait plus
    // jamais : le premier remplissage n'a lieu qu'une fois, et rien ne
    // permettait d'y revenir. Le bouton est cette sortie.
    const boutonRemettre = document.getElementById('barToutRemettre');
    if(boutonRemettre){
      boutonRemettre.addEventListener('click', function(e){
        e.stopPropagation();
        toutRemettre();
        if(panneau) panneau.style.display = 'none';
        if(boutonReglages) boutonReglages.setAttribute('aria-expanded', 'false');
      });
    }

    // Ranger ou fermer les fenêtres ouvertes ; le panneau se referme ensuite,
    // pour qu'on voie le résultat.
    // « Alamino » n'agit plus d'emblée : il déplie le choix du rangement
    // (24/10/2026), et c'est ce choix qui range.
    const modely = document.getElementById('fenetresModely');
    function fermerReglagesFenetres(){
      if(modely) modely.style.display = 'none';
      if(panneau){ panneau.style.display = 'none'; panneau.classList.remove('modely-irery'); }
      if(boutonReglages) boutonReglages.setAttribute('aria-expanded', 'false');
    }
    const boutonAlamino = document.getElementById('fenetresAlamino');
    if(boutonAlamino && modely){
      boutonAlamino.addEventListener('click', function(e){
        e.stopPropagation();
        // Le choix reste seul dans le panneau : le reste se cache.
        modely.style.display = 'grid';
        if(panneau) panneau.classList.add('modely-irery');
      });
      modely.addEventListener('click', function(e){
        const b = e.target.closest ? e.target.closest('[data-modely]') : null;
        if(!b) return;
        e.stopPropagation();
        fermerReglagesFenetres();
        if(typeof window.__alaminoFenetres === 'function') window.__alaminoFenetres(b.dataset.modely);
      });
    }
    const boutonHidio = document.getElementById('fenetresHidio');
    if(boutonHidio){
      boutonHidio.addEventListener('click', function(e){
        e.stopPropagation();
        fermerReglagesFenetres();
        if(typeof window.__hidioDaholo === 'function') window.__hidioDaholo();
      });
    }

    if(boutonReglages && panneau){
      document.body.appendChild(panneau);

      function placerReglages(){
        const r = document.querySelector('.dash-tabs-main');
        const haute = (r && !r.classList.contains('barre-cachee'))
          ? r.getBoundingClientRect().height : 0;
        panneau.style.bottom = (haute + 10) + 'px';
        const large = panneau.getBoundingClientRect().width;
        let gauche = (window.innerWidth - large) / 2;
        gauche = Math.max(8, Math.min(gauche, window.innerWidth - large - 8));
        panneau.style.left = gauche + 'px';
        panneau.style.top = 'auto';
      }

      boutonReglages.addEventListener('click', function(e){
        e.stopPropagation();
        const ouvert = panneau.style.display === 'block';
        panneau.style.display = ouvert ? 'none' : 'block';
        // Rouvert, le panneau repart de son contenu complet.
        panneau.classList.remove('modely-irery');
        if(modely) modely.style.display = 'none';
        boutonReglages.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
        if(!ouvert) placerReglages();
      });

      panneau.querySelectorAll('.reglage-mode').forEach(function(b){
        b.addEventListener('click', function(){
          ecrireMode(b.dataset.mode);
          direLeMode();
          elaguer();
          mesurer();
        });
      });

      document.addEventListener('click', function(e){
        if(panneau.style.display !== 'block') return;
        if(panneau.contains(e.target) || boutonReglages.contains(e.target)) return;
        panneau.style.display = 'none';
        boutonReglages.setAttribute('aria-expanded', 'false');
      });

      window.addEventListener('scroll', function(){
        if(panneau.style.display === 'block') placerReglages();
      }, { passive: true });
      window.addEventListener('resize', function(){
        if(panneau.style.display === 'block') placerReglages();
      });
    }

    // ---- Les icônes posées sur le fond ----
    // On tire une icône de la rangée vers le haut et on la lâche où l'on veut :
    // elle reste là, sur l'image de fond, comme sur un bureau. On la ramène en
    // la relâchant sur la rangée — sans quoi, une fois sortie, elle n'aurait
    // plus de chemin de retour.
    //
    // Vers le haut, et seulement vers le haut : la rangée se tire sur le côté
    // quand elle déborde, et un glissement horizontal doit rester le sien.
    const CLE_BUREAU = 'stockmanager_icones_bureau';
    // Une icône est retenue en fractions de l'écran, et non en pixels : un
    // téléphone qu'on tourne, une fenêtre qu'on redimensionne, et des pixels
    // désigneraient un endroit qui n'existe plus.
    function lireBureau(){
      try{ const l = JSON.parse(localStorage.getItem(CLE_BUREAU)); return Array.isArray(l) ? l : []; }
      catch(e){ return []; }
    }
    function ecrireBureau(l){
      try{ localStorage.setItem(CLE_BUREAU, JSON.stringify(l)); }catch(e){}
    }
    function surLeFond(cle){
      return lireBureau().some(function(i){ return i.cle === cle; });
    }

    // Les entrées fixes de la rangée n'ont pas d'épingle : on leur donne une
    // clé à part, pour que le fond les désigne comme les autres.
    function figureDe(cle){
      if(cle.indexOf('fixe:') === 0){
        const b = document.getElementById(cle.slice(5));
        if(!b) return null;
        const e = b.querySelector('span[aria-hidden]');
        return { icone: e ? e.textContent.trim() : '•', nom: b.title || '' };
      }
      const entree = entreeDe(cle);
      if(!entree) return null;
      const porteur = entree.querySelector('span') || entree;
      const texte = porteur.textContent.trim();
      const espace = texte.indexOf(' ');
      if(entree.querySelector('.nav-logo')){
        return { icone: '', nom: texte, logo: function(){ return logoDe(entree); } };
      }
      return {
        icone: espace > 0 ? texte.slice(0, espace) : texte,
        nom: espace > 0 ? texte.slice(espace + 1).trim() : texte
      };
    }
    function ouvrirDepuisLaCle(cle){
      if(cle.indexOf('fixe:') === 0){
        const b = document.getElementById(cle.slice(5));
        if(b) b.click();
        return;
      }
      const entree = entreeDe(cle);
      if(entree) entree.click();
    }

    // La bande où une icône a le droit de se poser : ni sous le nom, ni sous
    // la rangée. On la lâche où l'on veut, mais pas là où on ne la verrait pas.
    function cadreDuFond(){
      const haut = document.querySelector('.sidebar-top');
      const bas = document.querySelector('.dash-tabs-main');
      const hb = (haut && haut.getBoundingClientRect().height > 0) ? haut.getBoundingClientRect().bottom + 8 : 8;
      const bb = (bas && getComputedStyle(bas).display !== 'none')
        ? bas.getBoundingClientRect().top - 8 : window.innerHeight - 8;
      // Mesuré avant que la page ait sa hauteur, le cadre se réduit à un trait
      // et toutes les icônes se retrouvent collées en haut. On préfère ne rien
      // dire et laisser le passage suivant s'en charger.
      if(bb - hb < 120) return null;
      return { x1: 8, y1: hb, x2: window.innerWidth - 76, y2: bb - 60 };
    }

    function placerIcone(el, fx, fy){
      const c = cadreDuFond();
      if(!c) return false;
      const x = Math.min(Math.max(c.x1, fx * window.innerWidth), c.x2);
      const y = Math.min(Math.max(c.y1, fy * window.innerHeight), c.y2);
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      return true;
    }

    // Les icônes se rangent sur une grille, une par case : lâchées au pixel
    // près, elles finissaient les unes sur les autres. Une icône lâchée sur
    // une case prise va à la case libre la plus proche.
    const PAS_X = 76, PAS_Y = 96;
    // `derniere` : l'icône qu'on vient de lâcher. Elle passe après les autres,
    // qui gardent leur case, et sa place est retenue. Sans elle (ouverture,
    // écran tourné), on range sans rien écrire : un écran plus petit ne doit
    // pas effacer les places choisies sur un plus grand.
    function rangerLeFond(derniere){
      const c = cadreDuFond();
      if(!c) return;
      const W = window.innerWidth, H = window.innerHeight;
      const cols = Math.max(1, Math.floor((c.x2 - c.x1) / PAS_X) + 1);
      const lignes = Math.max(1, Math.floor((c.y2 - c.y1) / PAS_Y) + 1);
      const prises = {};
      const liste = lireBureau();
      const ordre = liste.filter(function(i){ return i.cle !== derniere; })
        .concat(liste.filter(function(i){ return i.cle === derniere; }));
      const rangees = ordre.map(function(i){
        const vx = Math.min(cols - 1, Math.max(0, Math.round((i.x * W - c.x1) / PAS_X)));
        const vy = Math.min(lignes - 1, Math.max(0, Math.round((i.y * H - c.y1) / PAS_Y)));
        let k = vx, r = vy, meilleure = Infinity;
        for(let rr = 0; rr < lignes; rr++){
          for(let kk = 0; kk < cols; kk++){
            if(prises[kk + ',' + rr]) continue;
            const d = (kk - vx) * (kk - vx) + (rr - vy) * (rr - vy);
            if(d < meilleure){ meilleure = d; k = kk; r = rr; }
          }
        }
        prises[k + ',' + r] = true;
        const x = c.x1 + k * PAS_X, y = c.y1 + r * PAS_Y;
        const el = document.querySelector('.icone-bureau[data-cle="' + i.cle + '"]');
        if(el){ el.style.left = x + 'px'; el.style.top = y + 'px'; }
        return { cle: i.cle, x: x / W, y: y / H };
      });
      if(derniere) ecrireBureau(rangees);
    }

    // Chaque icône reprend la place qu'on lui a donnée. Appelé à l'ouverture,
    // puis une fois la page complète : le premier passage tombe souvent avant
    // que la rangée du bas ait une hauteur.
    function replacerLesIcones(){
      rangerLeFond(null);
    }

    function retirerDuFond(cle){
      ecrireBureau(lireBureau().filter(function(i){ return i.cle !== cle; }));
      const el = document.querySelector('.icone-bureau[data-cle="' + cle + '"]');
      if(el) el.remove();
    }

    function dessinerIcone(entree){
      const fig = figureDe(entree.cle);
      if(!fig) return null;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'icone-bureau';
      el.dataset.cle = entree.cle;
      el.title = fig.nom;
      el.setAttribute('aria-label', fig.nom);
      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = fig.icone;
      if(fig.logo) emoji.appendChild(fig.logo());
      const nom = document.createElement('span');
      nom.className = 'nom';
      nom.textContent = fig.nom;
      el.appendChild(emoji);
      el.appendChild(nom);

      const croix = document.createElement('span');
      croix.className = 'epingle-retirer';
      croix.textContent = '✕';
      croix.title = 'Esorina : ' + fig.nom;
      croix.setAttribute('aria-label', 'Esorina : ' + fig.nom);
      croix.addEventListener('click', function(e){
        e.stopPropagation();
        retirerDuFond(entree.cle);
      });
      el.appendChild(croix);

      document.body.appendChild(el);
      placerIcone(el, entree.x, entree.y);
      armerIcone(el, entree.cle);
      return el;
    }

    function redessinerLeFond(){
      [].slice.call(document.querySelectorAll('.icone-bureau')).forEach(function(el){ el.remove(); });
      lireBureau().forEach(dessinerIcone);
    }

    // ---- Le geste, un seul pour les deux sens ----
    let fantome = null;
    function montrerFantome(cle, x, y){
      const fig = figureDe(cle);
      if(!fantome){
        fantome = document.createElement('div');
        fantome.className = 'icone-fantome';
        document.body.appendChild(fantome);
      }
      fantome.textContent = fig ? fig.icone : '•';
      if(fig && fig.logo) fantome.appendChild(fig.logo());
      fantome.style.left = Math.round(x) + 'px';
      fantome.style.top = Math.round(y) + 'px';
    }
    function effacerFantome(){
      if(fantome){ fantome.remove(); fantome = null; }
    }
    function surLaRangee(x, y){
      const r = rangee.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    // Sortir une icône de la rangée. On ne passe pas par retirer() : celui-ci
    // referme la page ouverte, et déplacer une icône n'est pas s'en défaire.
    function detacherDeLaRangee(cle, bouton){
      if(cle.indexOf('fixe:') === 0){
        const id = cle.slice(5);
        bouton.style.display = 'none';
        const l = lireRetirees();
        if(l.indexOf(id) < 0){ l.push(id); ecrireRetirees(l); }
      } else {
        ecrireEpingles(lireEpingles().filter(function(e){ return e.cle !== cle; }));
        bouton.remove();
      }
      mesurer();
    }
    function rendreALaRangee(cle){
      retirerDuFond(cle);
      if(cle.indexOf('fixe:') === 0){
        const id = cle.slice(5);
        const b = document.getElementById(id);
        if(b) b.style.display = '';
        ecrireRetirees(lireRetirees().filter(function(x){ return x !== id; }));
      } else {
        const liste = lireEpingles();
        if(!liste.some(function(e){ return e.cle === cle; })){
          liste.push({ cle: cle, vu: Date.now() });
          ecrireEpingles(liste);
        }
        poser(cle);
      }
      mesurer();
    }

    // Depuis la rangée : vers le haut, au-delà de dix pixels, et plus haut que
    // large. En dessous de ce seuil, c'est un appui — la page s'ouvre.
    rangee.addEventListener('pointerdown', function(e){
      const bouton = e.target.closest ? e.target.closest('.dash-tab') : null;
      if(!bouton || !rangee.contains(bouton)) return;
      // La loupe et les réglages tiennent la rangée : ils n'en sortent pas.
      if(bouton.id === 'menuToggle' || bouton.id === 'barReglagesBtn' || bouton.id === 'barRecherche') return;
      if(e.target.closest && e.target.closest('.epingle-retirer')) return;
      const cle = bouton.dataset.epingle || (bouton.id ? 'fixe:' + bouton.id : null);
      if(!cle) return;

      let parti = false;
      const x0 = e.clientX, y0 = e.clientY;
      function bouger(ev){
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if(!parti){
          if(dy > -10 || Math.abs(dy) <= Math.abs(dx)) return;
          parti = true;
          bouton.classList.add('tire');
        }
        ev.preventDefault();
        montrerFantome(cle, ev.clientX, ev.clientY);
      }
      function lacher(ev){
        document.removeEventListener('pointermove', bouger);
        document.removeEventListener('pointerup', lacher);
        document.removeEventListener('pointercancel', lacher);
        bouton.classList.remove('tire');
        effacerFantome();
        if(!parti) return;
        // Relâchée sur la rangée : elle n'a jamais voulu en sortir.
        if(surLaRangee(ev.clientX, ev.clientY)) return;
        detacherDeLaRangee(cle, bouton);
        // Centrée sous le doigt, puis calée sur sa case : c'est la case qu'on
        // retient, et non le point brut du lâcher.
        const entree = {
          cle: cle,
          x: (ev.clientX - PAS_X / 2) / window.innerWidth,
          y: (ev.clientY - PAS_Y / 2) / window.innerHeight
        };
        ecrireBureau(lireBureau().filter(function(i){ return i.cle !== cle; }).concat([entree]));
        dessinerIcone(entree);
        rangerLeFond(cle);
      }
      document.addEventListener('pointermove', bouger);
      document.addEventListener('pointerup', lacher);
      document.addEventListener('pointercancel', lacher);
    });

    // Sur le fond : quatre pixels suffisent, dans n'importe quel sens. Rien à
    // ménager ici — il n'y a pas de défilement à préserver.
    function armerIcone(el, cle){
      el.addEventListener('pointerdown', function(e){
        if(e.target.closest && e.target.closest('.epingle-retirer')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        const x0 = e.clientX, y0 = e.clientY;
        let parti = false;
        try{ el.setPointerCapture(e.pointerId); }catch(err){}
        function bouger(ev){
          if(!parti && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
          parti = true;
          el.classList.add('tire');
          el.style.left = Math.round(ev.clientX - dx) + 'px';
          el.style.top = Math.round(ev.clientY - dy) + 'px';
        }
        function lacher(ev){
          el.removeEventListener('pointermove', bouger);
          el.removeEventListener('pointerup', lacher);
          el.removeEventListener('pointercancel', lacher);
          try{ el.releasePointerCapture(ev.pointerId); }catch(err){}
          el.classList.remove('tire');
          if(!parti){ ouvrirDepuisLaCle(cle); return; }
          if(surLaRangee(ev.clientX, ev.clientY)){ rendreALaRangee(cle); return; }
          ecrireBureau(lireBureau().map(function(i){
            return i.cle === cle
              ? { cle: cle, x: (ev.clientX - dx) / window.innerWidth, y: (ev.clientY - dy) / window.innerHeight }
              : i;
          }));
          rangerLeFond(cle);
        }
        el.addEventListener('pointermove', bouger);
        el.addEventListener('pointerup', lacher);
        el.addEventListener('pointercancel', lacher);
      });
    }

    // Une icône posée sur le fond n'a rien à faire dans la rangée : elle y
    // reviendrait au premier passage par le menu, et on l'aurait en double.
    // Sauf le temps que sa fenêtre est ouverte (`ouverte`) : la rangée montre
    // alors ce qui est ouvert, et l'icône repart quand on la ferme.
    const poserOriginal = poser;
    poser = function(cle, ouverte){
      if(surLeFond(cle) && !ouverte) return;
      poserOriginal(cle);
    };

    window.addEventListener('resize', replacerLesIcones);
    window.addEventListener('orientationchange', replacerLesIcones);

    // Les entrées fixes sorties sur le fond ne doivent pas revenir dans la
    // rangée quand on les rappelle du menu.
    lireBureau().forEach(function(i){
      if(i.cle.indexOf('fixe:') !== 0) return;
      const b = document.getElementById(i.cle.slice(5));
      if(b) b.style.display = 'none';
    });
    requestAnimationFrame(function(){ redessinerLeFond(); replacerLesIcones(); });
    window.addEventListener('load', replacerLesIcones);

    // ---- La rangée porte tout le menu ----
    // Elle ne portait que ce qu'on avait déjà ouvert : il fallait passer par le
    // menu une première fois pour que l'icône s'y pose, et la rangée restait
    // presque vide. Elle porte maintenant toutes les entrées.
    //
    // Une seule fois : ensuite, ce qu'on retire à la croix reste retiré — sans
    // quoi la rangée se remplirait à nouveau au rechargement suivant, et la
    // croix ne servirait plus à rien.
    const CLE_TOUTES = 'stockmanager_barre_toutes';
    // Le geste lui-même, qu'on peut refaire : tout ce que le menu montre
    // reprend sa place dans la rangée, y compris ce qu'on en avait retiré.
    function toutRemettre(){
      ecrireRetirees([]);
      ['barComposer', 'barAccueil'].forEach(function(id){
        const b = document.getElementById(id);
        if(b) b.style.display = '';
      });
      entreesEpinglables().forEach(function(entree){
        // « Espace admin » est masqué pour les clients : la rangée n'a pas à
        // montrer ce que le menu cache.
        if(getComputedStyle(entree).display === 'none') return;
        epingler(entree, true);
      });
      mesurer();
    }
    // Au premier démarrage seulement : ensuite, ce qu'on retire à la croix
    // reste retiré — sans quoi la rangée se remplirait à nouveau à chaque
    // ouverture et la croix ne servirait plus à rien.
    function poserToutesLesEntrees(){
      try{ if(localStorage.getItem(CLE_TOUTES) === '1') return; }catch(e){ return; }
      try{ localStorage.setItem(CLE_TOUTES, '1'); }catch(e){}
      toutRemettre();
    }

    lireEpingles().forEach(function(e){ poser(e.cle); });
    poserToutesLesEntrees();
    direLeMode();
    elaguer();
    rangee.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    // La rangée n'a de largeur qu'une fois l'application affichée.
    if(window.ResizeObserver) new ResizeObserver(mesurer).observe(rangee);
    // Sa largeur, elle, ne change pas quand elle déborde : c'est son contenu
    // qui dépasse. Remplie pendant que l'application était fermée, elle
    // restait donc centrée, sans le fondu qui annonce la suite — et ses
    // premières icônes se retrouvaient hors d'atteinte. On la remesure quand
    // l'application s'ouvre : le corps de la page porte cette bascule.
    new MutationObserver(mesurer)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    requestAnimationFrame(mesurer);
  })();

  // ---------------- CE QUI FLOTTE SUIT L'APPLICATION ----------------
  // Sept endroits ouvrent ou ferment l'écran de l'application. Plutôt que de
  // leur demander à tous de penser aux fenêtres, on regarde cet écran : le
  // corps de la page porte la réponse, et le style s'en charge. Un chemin
  // oublié ne peut plus laisser une fenêtre sur la page de connexion.
  (function(){
    const ecran = document.getElementById('appScreen');
    if(!ecran) return;
    function refleter(){
      document.body.classList.toggle('appli-ouverte', getComputedStyle(ecran).display !== 'none');
    }
    new MutationObserver(refleter).observe(ecran, { attributes: true, attributeFilter: ['style', 'class'] });
    refleter();
  })();

  // ---------------- BARRES ESCAMOTABLES ----------------
  // On descend dans la page : les deux bandes s'effacent, l'écran est rendu à
  // la lecture. On remonte : elles reviennent aussitôt, sans qu'il faille
  // revenir jusqu'en haut pour les retrouver.
  (function(){
    const barreHaut = document.querySelector('.sidebar');
    const barreBas = document.querySelector('.dash-tabs-main');
    if(!barreHaut && !barreBas) return;

    // Six pixels de tolérance : un doigt ne fait jamais défiler tout droit, et
    // sans ce seuil les barres clignoteraient à chaque frémissement.
    const SEUIL = 6;
    // Près du haut, elles restent en place : les cacher là n'apporte rien et
    // laisserait l'écran nu à l'ouverture.
    const REPOS = 80;

    let dernierY = window.scrollY;
    let enAttente = false;

    function appliquer(){
      enAttente = false;
      const y = window.scrollY;
      const delta = y - dernierY;
      if(Math.abs(delta) < SEUIL) return;
      dernierY = y;
      const cacher = delta > 0 && y > REPOS;
      if(barreHaut) barreHaut.classList.toggle('barre-cachee', cacher);
      if(barreBas) barreBas.classList.toggle('barre-cachee', cacher);
    }

    // passive : le navigateur n'a pas à attendre ce code pour faire défiler.
    // requestAnimationFrame : un seul calcul par image, pas un par événement.
    window.addEventListener('scroll', function(){
      if(enAttente) return;
      enAttente = true;
      requestAnimationFrame(appliquer);
    }, { passive: true });
  })();

  // ---------------- NOTIFICATIONS ----------------
  var notifToggle = document.getElementById('notifToggle');
  var notifPanel = document.getElementById('notifPanel');
  if(notifToggle && notifPanel){
    // La cloche est descendue dans la rangée du bas : sa liste s'ouvre
    // au-dessus d'elle, comme la boîte d'écriture. Laissée dans la barre du
    // haut, elle serait restée accrochée à un bouton qui n'y est plus.
    document.body.appendChild(notifPanel);
    notifPanel.classList.add('panneau-flottant');
    notifPanel.style.right = 'auto';
    notifPanel.style.top = 'auto';

    // La cloche est remontée dans le menu : sa liste s'ouvre à côté du bouton
    // flottant, comme celle des achats internationaux.
    function placerNotif(){
      placerPresDuMenu(notifPanel);
    }

    window.addEventListener('scroll', function(){
      if(notifPanel.style.display === 'block') placerNotif();
    }, { passive: true });
    window.addEventListener('resize', function(){
      if(notifPanel.style.display === 'block') placerNotif();
    });

    notifToggle.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = notifPanel.style.display === 'block';
      notifPanel.style.display = isOpen ? 'none' : 'block';
      notifToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if(!isOpen){
        // Le menu s'efface : la liste s'ouvre juste à côté du bouton, les deux se
        // recouvriraient sinon.
        if(navList && navList.classList.contains('open')){
          navList.classList.remove('open');
          if(menuToggle) menuToggle.setAttribute('aria-expanded','false');
        }
        placerNotif();
        // La loupe se referme. Les autres panneaux restent : ce sont des
        // fenêtres, plusieurs s'ouvrent ensemble (23/10/2026).
        [['recherchePanel', 'barRecherche']].forEach(function(paire){
          var mp = document.getElementById(paire[0]);
          if(!mp) return;
          mp.style.display = 'none';
          var mt = document.getElementById(paire[1]);
          if(mt) mt.setAttribute('aria-expanded', 'false');
        });
        // marque tout comme lu à l'ouverture
        var list = loadNotifications();
        list.forEach(function(n){ n.read = true; });
        saveNotifications(list);
        renderNotifications();
    // La copie du stock que regardent les employes : on la depose quand
    // l'application s'ouvre, moment ou elle est fraiche.
    if(typeof deposerLeStockPartage === 'function') deposerLeStockPartage();
      }
    });
    // Un clic à côté ne la referme plus : c'est une fenêtre, qui passe
    // derrière celle qu'on touche (23/10/2026). Son × ou son entrée la ferment.
  }
  // Achats internationaux (🌍) et Livraison international (🚚) : deux panneaux
  // déroulants du menu, même comportement que la cloche de notifications. Ils
  // sont écrits une fois pour les deux — c'était déjà deux fois la même chose
  // quand il n'y en avait qu'un et la cloche, et une troisième copie aurait
  // fini par diverger sur un détail.
  var PANNEAUX_DU_MENU = [
    { bouton: 'marketToggle', panneau: 'marketPanel', remplir: 'renderMarketplaceLinks' },
    { bouton: 'livraisonToggle', panneau: 'livraisonPanel', remplir: 'renderLivraisonLinks' }
  ];
  PANNEAUX_DU_MENU.forEach(function(p){
    var toggle = document.getElementById(p.bouton);
    var panel = document.getElementById(p.panneau);
    if(!toggle || !panel) return;
    // Range dans le menu, le panneau serait rogne par la liste qui defile :
    // il flotte donc lui aussi, a cote du bouton.
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.right = 'auto';
    panel.style.zIndex = '130';

    toggle.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = panel.style.display === 'block';
      panel.style.display = isOpen ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if(!isOpen){
        // Le menu s'efface : les deux listes se recouvriraient sinon.
        if(navList){
          navList.classList.remove('open');
          if(menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
        }
        placerPresDuMenu(panel);
        // La cloche et l'autre panneau restent ouverts : plusieurs fenêtres
        // à la fois (23/10/2026). Seule la loupe se referme.
        var loupe = document.getElementById('recherchePanel');
        if(loupe) loupe.style.display = 'none';
        var boutonLoupe = document.getElementById('barRecherche');
        if(boutonLoupe) boutonLoupe.setAttribute('aria-expanded', 'false');
        if(typeof window[p.remplir] === 'function') window[p.remplir]();
      }
    });
    // Pas de fermeture au clic à côté : une fenêtre parmi d'autres (23/10/2026).
  });

  // ---- La loupe de la rangée du bas ----
  // Le menu range ce qu'on connaît déjà : on y descend jusqu'à l'entrée qu'on
  // cherchait. La loupe répond à une autre question — « où est-ce, déjà ? » —
  // et la réponse n'est pas toujours une page. C'est parfois un article du
  // stock, parfois une adresse que le menu garde dans l'une de ses fenêtres.
  //
  // Trois listes, donc, mais une seule question et une seule fenêtre :
  // chercher « Amazon » ne doit pas demander de savoir d'avance laquelle des
  // trois le contient.
  (function(){
    const bouton = document.getElementById('barRecherche');
    const panneau = document.getElementById('recherchePanel');
    const champ = document.getElementById('rechercheChamp');
    const sortie = document.getElementById('rechercheResultats');
    const rienTrouve = document.getElementById('rechercheVide');
    if(!bouton || !panneau || !champ || !sortie) return;

    // Hors du menu, comme les autres panneaux : rangé dedans, il serait rogné
    // par la liste qui défile.
    document.body.appendChild(panneau);
    panneau.style.position = 'fixed';
    panneau.style.zIndex = '130';
    panneau.style.width = 'min(340px, calc(100vw - 24px))';

    // Huit par groupe : au-delà on ne lit plus, on fait défiler. Qui ne trouve
    // pas son article dans les huit premiers tape une lettre de plus, et c'est
    // plus court que de parcourir trente lignes.
    const PAR_GROUPE = 8;

    // « Télécharger » se trouve en tapant « telecharger » : personne ne pose
    // les accents sur un clavier de téléphone quand il cherche vite.
    function nu(s){
      return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Une entrée que cette personne-ci n'a pas le droit de voir ne doit pas
    // reparaître par la recherche : « Espace admin » est au propriétaire,
    // « Ny momba ahy » à l'employé. On ne lit pas l'affichage de la liste du
    // menu pour le savoir — elle reste parfois filtrée d'une fois sur l'autre,
    // et l'on prendrait ce filtre pour une interdiction. La règle est redite.
    // Ny asako Hôtel (/hotely) : la recherche ne propose que ce que son menu
    // montre (components.css tient la même liste).
    const HOTEL_GARDEES = ['hotelerie', 'contact', 'wallet', 'mpiasa', 'livreur', 'toerana', 'abonnement', 'fond', 'corbeille', 'connexions', 'menuTheme', 'notifToggle'];
    function entreeOuverte(el){
      if(el.id === 'navStock') return false;
      if(document.documentElement.classList.contains('app-hotely') &&
         HOTEL_GARDEES.indexOf(el.dataset.section || el.id) < 0) return false;
      // L'Hôtellerie : à l'admin dans Ny asako, à tous dans /hotely.
      const hotelHorsHotely = el.id === 'menuInstallHotel' ||
        (el.dataset.section === 'hotelerie' && !document.documentElement.classList.contains('app-hotely'));
      if(el.id === 'navAdmin' || el.dataset.section === 'photocopie' || hotelHorsHotely){
        return !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email));
      }
      if(el.classList.contains('seulement-mpiasa')) return document.body.classList.contains('mode-mpiasa');
      return true;
    }

    function lesPages(){
      if(!navList) return [];
      return [].slice.call(navList.children).filter(function(el){
        return (el.classList.contains('nav-item') || el.classList.contains('nav-action')) && entreeOuverte(el);
      }).map(function(el){
        // Le premier libellé et non tout le bouton : la cloche porte un
        // compteur, qui donnerait « Notifications3 ».
        const porteur = el.querySelector('span') || el;
        const nom = (porteur.textContent || el.textContent || '').trim();
        return { nom: nom, ouvrir: function(){ el.click(); } };
      });
    }

    function lesArticles(){
      if(typeof items === 'undefined' || !Array.isArray(items)) return [];
      return items.map(function(it){
        const bouts = [];
        if(it.ref) bouts.push(String(it.ref));
        if(it.category) bouts.push(String(it.category));
        bouts.push((it.qty != null ? it.qty : 0) + ' ' + (it.unit || 'pièce'));
        if(it.supplier) bouts.push(String(it.supplier));
        return {
          nom: '📦 ' + (it.name || '—'),
          detail: bouts.join(' · '),
          // Ce qu'on tape n'est pas toujours le nom : c'est parfois la
          // référence lue sur le carton, ou le nom du fournisseur.
          mots: [it.name, it.ref, it.category, it.supplier].join(' '),
          ouvrir: function(){ versLArticle(it.id); }
        };
      });
    }

    function lesAdresses(){
      const vues = Object.create(null);
      const liste = [];
      function ajouter(icone, nom, url){
        if(!nom || !url) return;
        // La même adresse s'écrit de deux façons : « pixmania.com » dans la
        // liste, « pixmania.com/ » une fois que le navigateur l'a lue dans un
        // lien. Comparées telles quelles, elles font deux résultats pour une
        // seule boutique.
        const court = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if(vues[court]) return;
        vues[court] = true;
        liste.push({
          nom: icone + ' ' + nom,
          detail: court,
          mots: nom + ' ' + url,
          ouvrir: function(){ window.open(url, '_blank', 'noopener'); }
        });
      }
      if(typeof DEFAULT_MARKETPLACES !== 'undefined'){
        DEFAULT_MARKETPLACES.forEach(function(g){
          g.liens.forEach(function(m){ ajouter('🌍', m.name, m.url); });
        });
      }
      if(typeof DEFAULT_TRANSPORTEURS !== 'undefined'){
        DEFAULT_TRANSPORTEURS.forEach(function(g){
          g.liens.forEach(function(m){ ajouter('🚚', m.name, m.url); });
        });
      }
      // Les magazay ajoutés à la main vivent dans la base et n'arrivent
      // qu'avec leur fenêtre. Si elle a déjà été ouverte, ils sont là : on les
      // prend au passage plutôt que de redemander au serveur à chaque lettre
      // tapée.
      const boite = document.getElementById('marketplaceLinks');
      if(boite){
        [].slice.call(boite.querySelectorAll('a[href]')).forEach(function(a){
          ajouter('🌍', (a.getAttribute('data-apercu-nom') || a.textContent || '').trim(), a.href);
        });
      }
      return liste;
    }

    // Le fil : ce que les clients ont publié, ce qu'ils ont mis en vente, et
    // ce qui s'est dit dessous. On le lit dans la page plutôt que d'aller le
    // redemander au serveur à chaque lettre tapée — c'est exactement ce que
    // le fil montre, et cela reste juste quand le réseau ne répond plus.
    function court(s){
      const t = (s || '').replace(/\s+/g, ' ').trim();
      return t.length > 64 ? t.slice(0, 63) + '…' : t;
    }
    function leFil(){
      const liste = document.getElementById('communityNewsList');
      const billets = [], hevitra = [];
      if(!liste) return { billets: billets, hevitra: hevitra };
      [].slice.call(liste.querySelectorAll('.fb-post')).forEach(function(post){
        const id = post.dataset.newsId;
        if(!id) return;
        const texteDe = function(sel){
          const el = post.querySelector(sel);
          return el ? (el.textContent || '').trim() : '';
        };
        const auteur = texteDe('.fb-post-name');
        const corps = texteDe('.fb-post-body');
        const prix = texteDe('.fb-post-price');
        // Une marchandise mise en vente porte son prix et son propre habillage :
        // elle se montre comme telle, et non comme une nouvelle parmi d'autres.
        const entana = post.classList.contains('fb-post-entana');
        billets.push({
          nom: (entana ? '🛒 ' : '📰 ') + (court(corps) || auteur || 'Billet'),
          detail: [auteur, prix].filter(Boolean).join(' · '),
          mots: auteur + ' ' + corps + ' ' + prix,
          ouvrir: function(){ versLeBillet(id, null); }
        });
        [].slice.call(post.querySelectorAll('.fb-comment')).forEach(function(ligne){
          const fort = ligne.querySelector('strong');
          const date = ligne.querySelector('.fb-comment-date');
          const qui = fort ? (fort.textContent || '').trim() : '';
          // Le propos seul : ni son auteur, ni l'heure. On cherche ce qui a
          // été dit, et les retrouver dans le résultat ne dirait rien de plus
          // que la ligne du dessous, qui les porte déjà.
          // Sans la rangée des réactions : « J'aime » et ses nombres ne sont
          // pas ce qui a été dit.
          const copie = ligne.cloneNode(true);
          const rang = copie.querySelector('.fb-comment-reactions');
          if(rang) rang.remove();
          let quoi = (copie.textContent || '');
          if(date) quoi = quoi.replace(date.textContent, '');
          if(qui) quoi = quoi.replace(qui, '');
          quoi = quoi.trim();
          if(!quoi) return;
          hevitra.push({
            nom: '💬 ' + court(quoi),
            detail: [qui, auteur ? 'ambanin\'ny an\'i ' + auteur : ''].filter(Boolean).join(' · '),
            mots: qui + ' ' + quoi,
            ouvrir: function(){ versLeBillet(id, quoi); }
          });
        });
      });
      return { billets: billets, hevitra: hevitra };
    }

    function viser(el, classe){
      if(el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove(classe);
      void el.offsetWidth;
      el.classList.add(classe);
    }

    // Ouvrir l'Accueil REFAIT le fil entièrement, et il revient du serveur —
    // deux secondes et demie, parfois. Le billet qui est à l'écran au moment
    // où l'on presse disparaît donc, et avec lui la marque qu'on venait de
    // poser : on atteignait l'Accueil sans que rien ne s'éclaire.
    //
    // On ne devine donc pas quand le fil aura fini : on marque le billet dès
    // qu'on le voit, et on le remarque s'il est remplacé par un neuf. Six
    // secondes de guet, une fois sur dix de seconde — de quoi laisser passer
    // le fil, puis les commentaires qui arrivent derrière lui par une autre
    // requête. Rien ne se remarque deux fois : la classe déjà posée le dit.
    function versLeBillet(id, texteDuHevitra){
      if(typeof ouvrirDepuisLeMenu !== 'function') return;
      ouvrirDepuisLeMenu('accueil');
      const numero = String(id).replace(/[^\w-]/g, '');
      if(!numero) return;
      const ou = '#communityNewsList .fb-post[data-news-id="' + numero + '"]';
      let tours = 0;
      (function guetter(){
        const post = document.querySelector(ou);
        if(post){
          if(!post.classList.contains('billet-vise')) viser(post, 'billet-vise');
          if(texteDuHevitra){
            const ligne = [].slice.call(post.querySelectorAll('.fb-comment')).filter(function(l){
              return (l.textContent || '').indexOf(texteDuHevitra) >= 0;
            })[0];
            if(ligne && !ligne.classList.contains('ligne-visee')) viser(ligne, 'ligne-visee');
          }
        }
        tours += 1;
        if(tours >= 60) return;
        setTimeout(guetter, 100);
      })();
    }

    // La page des articles en compte parfois cent. Y arriver sans savoir
    // laquelle des cent lignes on cherchait, c'est arriver nulle part : la
    // ligne se place au milieu de l'écran et s'éclaire un instant.
    function versLArticle(id){
      if(typeof ouvrirDepuisLeMenu !== 'function') return;
      ouvrirDepuisLeMenu('articles');
      requestAnimationFrame(function(){
        const ligne = document.querySelector('#stockTableBody tr[data-item-id="' + id + '"]');
        // « viser » retire la classe avant de la remettre : sans cela,
        // chercher deux fois le même article ne rejouerait pas la couleur, et
        // le second passage n'aurait l'air de rien.
        if(ligne) viser(ligne, 'ligne-visee');
      });
    }

    // Les boutiques internationales du menu, chacune à sa page de recherche :
    // on arrive sur ses entana, et non sur son accueil.
    const RECHERCHES_BOUTIQUES = [
      { nom: 'Amazon', url: 'https://www.amazon.fr/s?k=' },
      { nom: 'AliExpress', url: 'https://www.aliexpress.com/wholesale?SearchText=' },
      { nom: 'Alibaba', url: 'https://www.alibaba.com/trade/search?SearchText=' },
      { nom: 'Pinduoduo', url: 'https://mobile.yangkeduo.com/search_result.html?search_key=' },
      { nom: 'eBay', url: 'https://www.ebay.fr/sch/i.html?_nkw=' },
      { nom: 'SHEIN', url: 'https://www.shein.com/pdsearch/' }
    ];
    function lesBoutiques(texte){
      return RECHERCHES_BOUTIQUES.map(function(b){
        const url = b.url + encodeURIComponent(texte);
        return {
          nom: '🌍 ' + b.nom,
          detail: '« ' + court(texte) + ' »',
          ouvrir: function(){ window.open(url, '_blank', 'noopener'); }
        };
      });
    }
    function leWeb(texte){
      const url = 'https://www.google.com/search?q=' + encodeURIComponent(texte);
      function dans(nom){
        return function(){
          if(typeof window.__ouvrirLeNavigateur === 'function') window.__ouvrirLeNavigateur(nom, url);
          else window.open(url, '_blank', 'noopener');
        };
      }
      const lignes = [
        { nom: '🔎 Chrome', detail: 'Google : « ' + court(texte) + ' »', ouvrir: dans('chrome') },
        { nom: '🧭 Safari', detail: 'Google : « ' + court(texte) + ' »', ouvrir: dans('safari') }
      ];
      // Une photo sans rien d'écrit dessus : Google Lens la reconnaît à
      // l'image. Il faut la lui redonner — elle ne quitte pas ce téléphone
      // sans qu'on le décide.
      if(scanSansTexte){
        const lens = 'https://lens.google.com/';
        lignes.push({ nom: '📷 Google Lens', detail: 'Alefaso ao ilay sary hitadiavana azy',
          ouvrir: function(){
            if(typeof window.__ouvrirLeNavigateur === 'function') window.__ouvrirLeNavigateur('chrome', lens);
            else window.open(lens, '_blank', 'noopener');
          } });
      }
      return lignes;
    }

    // ---- Le scan ----
    // Une photo de l'entana : son code-barres d'abord (instantané, quand le
    // navigateur sait le lire), son étiquette sinon (le texte, lu ici même par
    // Tesseract, chargé à la première fois). Ce qui est lu devient la
    // recherche : le stock, le Botika, les boutiques et le web d'un coup.
    // La photo ne part nulle part.
    const boutonScan = document.getElementById('rechercheScan');
    const fichierScan = document.getElementById('rechercheScanFichier');
    const statutScan = document.getElementById('rechercheScanStatut');
    let scanSansTexte = false;
    let chargementOcr = null;
    function direScan(texte){
      if(!statutScan) return;
      statutScan.textContent = texte || '';
      statutScan.hidden = !texte;
    }
    function chargerOcr(){
      if(window.Tesseract) return Promise.resolve();
      if(chargementOcr) return chargementOcr;
      chargementOcr = new Promise(function(ok, non){
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js';
        s.onload = ok;
        s.onerror = function(){ chargementOcr = null; non(); };
        document.head.appendChild(s);
      });
      return chargementOcr;
    }
    function lireCode(canvas){
      if(!('BarcodeDetector' in window)) return Promise.resolve('');
      let d;
      try{ d = new window.BarcodeDetector(); }catch(e){ return Promise.resolve(''); }
      return d.detect(canvas).then(function(codes){
        return (codes && codes.length) ? String(codes[0].rawValue || '') : '';
      }, function(){ return ''; });
    }
    // Du texte d'une étiquette, les mots qui nomment l'entana : les plus
    // longs d'abord, sans les chiffres épars ni les signes que l'OCR invente.
    function motsDeLEtiquette(texte){
      const vus = {};
      const mots = (texte || '').split(/[^0-9A-Za-zÀ-ÿ-]+/).filter(function(m){
        const k = m.toLowerCase();
        if(m.length < 3 || /^\d+$/.test(m) && m.length < 8 || vus[k]) return false;
        vus[k] = true;
        return /[A-Za-zÀ-ÿ]{3}/.test(m) || /^\d{8,14}$/.test(m);
      });
      return mots.slice(0, 5).join(' ');
    }
    function versCanvas(img){
      const largeur = Math.min(img.naturalWidth || img.width, 1400);
      const ratio = largeur / (img.naturalWidth || img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(largeur);
      c.height = Math.round((img.naturalHeight || img.height) * ratio);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    }
    function scanner(fichier){
      if(!fichier) return;
      boutonScan.classList.add('en-cours');
      direScan('Famakiana ny sary…');
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      function fin(texte){
        boutonScan.classList.remove('en-cours');
        URL.revokeObjectURL(url);
        scanSansTexte = !texte;
        champ.value = texte || '';
        if(texte){
          direScan('Hita : « ' + texte + ' »');
          chercher();
        } else {
          direScan('Tsy nisy soratra na code-barres voavaky. Andramo akaiky kokoa, na karohy amin\'ny Google Lens.');
          // Rien à chercher ici : seulement le chemin vers Lens.
          sortie.innerHTML = '';
          if(rienTrouve) rienTrouve.style.display = 'none';
          const g = leWeb('');
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'nav-action';
          b.textContent = g[g.length - 1].nom;
          b.addEventListener('click', function(){ fermer(); g[g.length - 1].ouvrir(); });
          sortie.appendChild(b);
          placer();
        }
        scanSansTexte = false;
      }
      img.onload = function(){
        const canvas = versCanvas(img);
        lireCode(canvas).then(function(code){
          if(code) return code.trim();
          direScan('Famakiana ny soratra… (ny voalohany dia maharitra kely)');
          return chargerOcr().then(function(){
            return window.Tesseract.recognize(canvas, 'eng+fra');
          }).then(function(res){
            return motsDeLEtiquette(res && res.data && res.data.text);
          });
        }).then(fin, function(){
          boutonScan.classList.remove('en-cours');
          URL.revokeObjectURL(url);
          direScan('Tsy nety ny famakiana : jereo ny connexion, dia andramo indray.');
        });
      };
      img.onerror = function(){ fin(''); };
      img.src = url;
    }
    if(boutonScan && fichierScan){
      boutonScan.addEventListener('click', function(e){
        e.stopPropagation();
        fichierScan.value = '';
        fichierScan.click();
      });
      fichierScan.addEventListener('click', function(e){ e.stopPropagation(); });
      fichierScan.addEventListener('change', function(){ scanner(fichierScan.files && fichierScan.files[0]); });
    }

    function placer(){
      if(panneau.style.display !== 'block') return;
      if(typeof placerPresDuMenu === 'function') placerPresDuMenu(panneau);
    }

    function fermer(){
      panneau.style.display = 'none';
      bouton.setAttribute('aria-expanded', 'false');
    }

    function chercher(){
      const q = nu(champ.value.trim());
      sortie.innerHTML = '';
      if(!q){
        if(rienTrouve) rienTrouve.style.display = 'none';
        placer();
        return;
      }
      const fil = leFil();
      const groupes = [
        { titre: 'Pejy', lignes: lesPages() },
        { titre: 'Entana ao amin\'ny stock', lignes: lesArticles() },
        { titre: 'Vaovao sy entana navoaka', lignes: fil.billets },
        { titre: 'Hevitra', lignes: fil.hevitra },
        { titre: 'Magazay sy fitaterana', lignes: lesAdresses() }
      ];
      // Ce qui ne se trouve pas ici se cherche dehors : les boutiques
      // internationales, puis le web, dans Chrome ou Safari. Toujours
      // proposés, sans filtre — c'est la question elle-même qu'on y envoie.
      const brut = champ.value.trim();
      const exterieur = [
        { titre: 'Entana international', lignes: lesBoutiques(brut) },
        { titre: 'Amin\'ny Internet', lignes: leWeb(brut) }
      ];
      let total = 0;
      function afficher(g, gardes){
        const titre = document.createElement('div');
        titre.className = 'recherche-groupe';
        titre.textContent = g.titre;
        sortie.appendChild(titre);
        gardes.forEach(function(l){
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'nav-action';
          b.textContent = l.nom;
          if(l.detail){
            const d = document.createElement('span');
            d.className = 'recherche-detail';
            d.textContent = l.detail;
            b.appendChild(d);
          }
          // La fenêtre se referme AVANT d'ouvrir : ce qu'on ouvre est parfois
          // une page, et elle paraîtrait sous la recherche restée dessus.
          b.addEventListener('click', function(){ fermer(); l.ouvrir(); });
          sortie.appendChild(b);
        });
      }
      groupes.forEach(function(g){
        const gardes = g.lignes.filter(function(l){
          return nu(l.nom + ' ' + (l.mots || '')).indexOf(q) >= 0;
        }).slice(0, PAR_GROUPE);
        if(!gardes.length) return;
        total += gardes.length;
        afficher(g, gardes);
      });
      // « Tsy misy hita » parle de ce qui est ici : il se dit avant les
      // chemins vers le dehors, qui, eux, sont toujours là.
      if(rienTrouve){
        rienTrouve.style.display = total ? 'none' : 'block';
        sortie.appendChild(rienTrouve);
      }
      exterieur.forEach(function(g){ afficher(g, g.lignes); });
      placer();
    }

    bouton.addEventListener('click', function(e){
      e.stopPropagation();
      if(panneau.style.display === 'block'){ fermer(); return; }
      panneau.style.display = 'block';
      bouton.setAttribute('aria-expanded', 'true');
      // Une seule fenêtre ouverte à la fois, comme partout ailleurs.
      if(navList){
        navList.classList.remove('open');
        if(menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
      }
      if(notifPanel){
        notifPanel.style.display = 'none';
        if(notifToggle) notifToggle.setAttribute('aria-expanded', 'false');
      }
      PANNEAUX_DU_MENU.forEach(function(q){
        const p = document.getElementById(q.panneau);
        const b = document.getElementById(q.bouton);
        if(p) p.style.display = 'none';
        if(b) b.setAttribute('aria-expanded', 'false');
      });
      // Le fil n'a peut-être jamais été affiché — on a ouvert l'application
      // sur les Factures, et la loupe cherche alors dans une page vide. On le
      // demande une fois, ici, et non à chaque lettre tapée : les résultats
      // paraîtront dès qu'il arrivera.
      const filVide = !document.querySelector('#communityNewsList .fb-post');
      if(filVide && window.__sb && typeof window.renderCommunityNews === 'function'){
        try { window.renderCommunityNews(); } catch(e){}
      }
      // Ce qu'on cherchait la fois d'avant n'a rien à voir avec maintenant :
      // le champ repart vide.
      champ.value = '';
      direScan('');
      chercher();
      requestAnimationFrame(function(){
        placer();
        champ.focus({ preventScroll: true });
      });
    });

    champ.addEventListener('input', chercher);
    champ.addEventListener('click', function(e){ e.stopPropagation(); });
    champ.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ fermer(); return; }
      // Entrée : on ouvre le premier résultat, sans avoir à viser.
      if(e.key !== 'Enter') return;
      const premier = sortie.querySelector('.nav-action');
      if(premier) premier.click();
    });

    document.addEventListener('click', function(e){
      if(panneau.style.display !== 'block') return;
      if(panneau.contains(e.target) || bouton.contains(e.target)) return;
      fermer();
    });

    window.addEventListener('resize', placer);
    window.addEventListener('scroll', placer, { passive: true });
  })();

  var notifClearBtn = document.getElementById('notifClearBtn');
  if(notifClearBtn){
    notifClearBtn.addEventListener('click', function(e){
      e.stopPropagation();
      saveNotifications([]);
      renderNotifications();
    // La copie du stock que regardent les employes : on la depose quand
    // l'application s'ouvre, moment ou elle est fraiche.
    if(typeof deposerLeStockPartage === 'function') deposerLeStockPartage();
    });
  }

  document.querySelectorAll('.nav-item').forEach(function(nav){
    nav.addEventListener('click', function(){
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      // Les pages en fenêtre restent ouvertes : on en tient plusieurs à la
      // fois, et celle qu'on ouvre passe devant (23/10/2026).
      document.querySelectorAll('.section').forEach(s => { if(!s.classList.contains('fenetre-page')) s.classList.remove('active'); });
      nav.classList.add('active');
      document.getElementById('section-' + nav.dataset.section).classList.add('active');
      if(nav.dataset.section === 'factures') renderInvoiceItems();
      if(nav.dataset.section === 'stock'){ renderFilters(); renderDashboard(); renderCommunityPanel(); }
      if(nav.dataset.section === 'admin'){
        if(typeof renderAdminSpace === 'function') renderAdminSpace();
      }
      // Chaque page rafraîchit ce qui lui appartient, depuis qu'elles sont
      // séparées : la liste des lives d'un côté, celle des personnes à
      // appeler de l'autre.
      if((nav.dataset.section === 'mpiasa' || nav.dataset.section === 'livreur')
         && typeof renderEquipe === 'function') renderEquipe();
      if(nav.dataset.section === 'live') renderLiveList();
      if(nav.dataset.section === 'appels'){ renderOnlineClientsForCall(); renderContactButtons(); }
      if(nav.dataset.section === 'corbeille' && typeof renderCorbeille === 'function') renderCorbeille();
      if(nav.dataset.section === 'toerana' && typeof ouvrirToerana === 'function') ouvrirToerana();
      // ferme le menu mobile après avoir choisi une section
      if(navList && navList.classList.contains('open')){
        navList.classList.remove('open');
        if(menuToggle) menuToggle.setAttribute('aria-expanded','false');
      }
      saveLastView();
    });
  });

  // Hauteur réelle de la barre supérieure : les onglets principaux viennent
  // se coller juste en dessous (valeur relue au redimensionnement).
  // Hauteur de la barre du haut : c'est sous elle que viennent se coller les
  // onglets « Accueil / Articles ». Elle était mesurée une seule fois, à
  // l'ouverture de l'application, avant que la mise en page ne soit stabilisée
  // — la valeur retenue était deux fois trop grande et les onglets flottaient
  // au milieu du fil d'actualité. On la relit donc à chaque changement utile.
  let topbarMeasureQueued = false;
  function updateTopbarHeight(){
    const bar = document.querySelector('.sidebar');
    if(!bar) return;
    const height = Math.round(bar.getBoundingClientRect().height);
    if(height > 0){
      document.documentElement.style.setProperty('--topbar-h', height + 'px');
    }
  }
  function queueTopbarMeasure(){
    if(topbarMeasureQueued) return;
    topbarMeasureQueued = true;
    requestAnimationFrame(function(){
      topbarMeasureQueued = false;
      updateTopbarHeight();
    });
  }
  updateTopbarHeight();
  window.addEventListener('resize', queueTopbarMeasure);
  window.addEventListener('scroll', queueTopbarMeasure, { passive: true });
  window.addEventListener('load', updateTopbarHeight);
  // les images du fil d'actualité changent la hauteur en arrivant
  document.addEventListener('load', queueTopbarMeasure, true);

  // Les onglets secondaires (Tableau de bord, Historique, Ajouter...) et la
  // recherche d'article ne servent qu'une fois dans « Articles ». L'Accueil est
  // un fil d'actualité : on n'y cherche pas une référence de stock, et la barre
  // repoussait les publications d'autant.
  function vueAffichee(){
    const vue = document.querySelector('.dash-view.active');
    return vue ? vue.id.replace(/^dash-/, '') : 'accueil';
  }
  // La rangée de dehors ne sert qu'aux vues du stock posées dans la page —
  // tableau de bord, historique, ajout, comptes, achat — pour passer de l'une
  // à l'autre. Avec l'Accueil ou les Articles, qui s'ouvrent en fenêtre, elle
  // restait seule derrière elles, à nu sur le fond d'écran. Les Articles
  // portent maintenant leurs propres onglets, et la recherche.
  // Le tableau de bord n'en est plus : il s'ouvre en fenêtre, avec ses onglets.
  const VUES_DANS_LA_PAGE = ['historique', 'ajouter', 'nouveau', 'comptes', 'acheter'];
  function updateSubTabsVisibility(){
    const subTabs = document.getElementById('stockSubTabs');
    // Les « Nouvel article » et « Gestion de compte » ouverts par le +
    // (nouveau2, comptes2...) en sont aussi.
    const vue = vueAffichee().replace(/^nouveau\d+$/, 'nouveau').replace(/^comptes\d+$/, 'comptes');
    if(subTabs) subTabs.style.display = VUES_DANS_LA_PAGE.indexOf(vue) >= 0 ? '' : 'none';
  }
  updateSubTabsVisibility();

  // « Acheter » n'a plus d'onglet : on y entre depuis une annonce de l'Accueil.
  // Il faut donc pouvoir montrer une vue sans qu'un onglet la porte.
  // Chaque vue redessine ce qui lui appartient. Deux chemins y mènent
  // maintenant — les onglets restants et les entrées du menu — et une vue
  // ouverte sans être redessinée montre l'état d'avant.
  // Les deux onglets de « Commun » : le comptage des personnes et les CIN /
  // passeports. On rouvre la fenêtre sur celui qu'on y a laissé. var et non
  // let : rafraichirVue peut tourner avant que cette ligne ne soit lue.
  var ongletCommun = 'tableau';
  function choisirOngletCommun(nom){
    const PANNEAUX = {
      tableau: 'communCorps',
      adidy: 'communAdidy', historique: 'communHistorique',
      taratasy: 'communTaratasy', fianakaviana: 'communFianakaviana', fangatahana: 'communFangatahana'
    };
    // « Fangatahana » est à l'admin seul : un autre compte n'y entre pas.
    if(nom === 'fangatahana' && !(currentUser && isOwnerEmail(currentUser.email))) nom = 'tableau';
    ongletCommun = PANNEAUX[nom] ? nom : 'tableau';
    Object.keys(PANNEAUX).forEach(function(cle){
      const el = document.getElementById(PANNEAUX[cle]);
      if(el) el.style.display = cle === ongletCommun ? '' : 'none';
    });
    document.querySelectorAll('#dash-commun [data-commun]').forEach(function(t){
      t.classList.toggle('active', t.dataset.commun === ongletCommun);
    });
    // La porte d'abord : sans alalana, rien de tout cela ne se montre, et rien
    // ne se demande au serveur.
    if(typeof renderPorteCommun === 'function'){
      renderPorteCommun().then(function(ouverte){ if(ouverte) remplirOngletCommun(); });
      return;
    }
    remplirOngletCommun();
  }

  function remplirOngletCommun(){
    const nom = ongletCommun;
    // Le bloc revient du Commun : la liste des installations s'y referme.
    window.__montrerLesInstallations();
    if(nom === 'fangatahana'){
      if(typeof renderFangatahana === 'function') renderFangatahana();
      return;
    }
    // On relit à chaque ouverture : les chiffres se dessinent une fois
    // l'onglet visible, et les adidy suivent les personnes du registre.
    if(ongletCommun === 'adidy'){
      if(typeof renderAdidy === 'function') renderAdidy();
    } else if(ongletCommun === 'historique'){
      if(typeof renderHistorique === 'function') renderHistorique();
      // Les papiers remis ont leur place dans l'historique aussi (taratasy.js).
      if(typeof renderTaratasyHistorique === 'function') renderTaratasyHistorique();
    } else if(ongletCommun === 'taratasy'){
      if(typeof renderTaratasy === 'function') renderTaratasy();
    } else if(ongletCommun === 'fianakaviana'){
      if(typeof renderFianakaviana === 'function') renderFianakaviana();
    } else if(typeof renderFianakaviana === 'function'){
      renderFianakaviana();
    }
    // Le tableau de bord montre aussi l'argent entré : il le relit lui-même,
    // sans qu'il ait fallu passer par l'onglet Adidy.
    if(ongletCommun === 'tableau'){
      if(typeof renderFianakavianaIsa === 'function') renderFianakavianaIsa();
      if(typeof renderVolaVoaangona === 'function') renderVolaVoaangona();
      if(typeof renderTaratasyIsa === 'function') renderTaratasyIsa();
    }
  }

  // Le tableau de bord du Fokontany vit dans sa fenêtre ; l'Administratif
  // Commun le lui emprunte. Une seule vue est ouverte à la fois
  // (showDashView), si bien que le bloc n'a jamais à être à deux endroits.
  // Le Commun surplombe les fokontany : il lit LEURS registres, et non ceux
  // de l'admin, qui n'en tient aucun. Les fichiers du registre le demandent
  // avant de filtrer par compte (fianakaviana.js, adidy.js, taratasy.js).
  //
  // Le même bloc sert ici aux deux fenêtres : « Administratif Fokontany »,
  // où l'admin tient son propre registre, et « Administratif Commun », qui
  // les regarde tous. Ce qui les distingue est l'endroit où le bloc se
  // trouve à l'instant (rangerTableauCommun) — pas l'adresse de la page,
  // comme dans l'application à part (fokontany-app.js).
  //
  // Le serveur, lui, ne l'accorde qu'au propriétaire (règles
  // « lecture commun »).
  window.__lectureCommun = function(){
    const corps = document.getElementById('communCorps');
    const hote = document.getElementById('communAdminCorps');
    if(!corps || !hote || corps.parentElement !== hote) return false;
    return !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email));
  };

  // Ce qui est déjà installé : l'admin passe de fokontany en fokontany, et
  // sans cette liste il ne sait plus lequel est fait. Elle n'a de sens que
  // dans le Commun, qui les surplombe — dans sa propre fenêtre, le
  // fokontany n'a pas à savoir qui d'autre a installé l'application. Le
  // panneau vit dans le bloc emprunté : hors du Commun, on le referme.
  // (Même liste que dans l'application à part : fokontany-app.js.)
  window.__montrerLesInstallations = function(){
    const panneau = document.getElementById('communInstallesPanneau');
    const liste = document.getElementById('communInstalles');
    if(!panneau || !liste) return;
    if(!window.__lectureCommun() || !window.__sb){ panneau.style.display = 'none'; return; }
    panneau.style.display = '';
    window.__sb.from('fokontany_installation').select('*').order('created_at', { ascending: false })
      .then(function(res){
        const lignes = (res && !res.error && res.data) || [];
        liste.innerHTML = lignes.length
          ? lignes.map(function(i){
              const nom = String(i.fokontany || i.email || '').replace(/[<>&]/g, '');
              const quoi = i.karazana === 'commun' ? '🏛️ Commun' : '🗂️ Fokontany';
              const d = new Date(i.created_at);
              return '<div class="list-row">' +
                '<span>' + quoi + ' ' + nom + ' <span style="color:var(--muted);">· ' +
                  String(i.email || '').replace(/[<>&]/g, '') + '</span></span>' +
                '<span style="white-space:nowrap; color:var(--muted);">' +
                  (isNaN(d) ? '—' : d.toLocaleDateString('fr-FR')) + '</span>' +
              '</div>';
            }).join('')
          : '<p class="empty-hint" style="padding:0.4rem 0;">Mbola tsy misy fokontany nametraka ny app.</p>';
      }, function(){});
  };
  function rangerTableauCommun(chez){
    const corps = document.getElementById('communCorps');
    const hote = chez === 'communadmin'
      ? document.getElementById('communAdminCorps')
      : document.getElementById('communContenu');
    if(!corps || !hote || corps.parentElement === hote) return corps;
    if(chez === 'communadmin') hote.appendChild(corps);
    else {
      // Sa place d'origine : juste après la rangée d'onglets.
      const onglets = hote.querySelector('.dash-tabs');
      hote.insertBefore(corps, onglets ? onglets.nextSibling : hote.firstChild);
    }
    return corps;
  }
  function ouvrirCommunAdmin(){
    const corps = rangerTableauCommun('communadmin');
    const message = document.getElementById('communAdminMessage');
    if(!corps) return;
    corps.style.display = 'none';
    function montrer(ouverte){
      // La fenêtre a pu être quittée pendant qu'on attendait le serveur.
      if(!document.getElementById('dash-communadmin').classList.contains('active')) return;
      corps.style.display = ouverte ? '' : 'none';
      if(message){
        message.style.display = ouverte ? 'none' : '';
        message.textContent = ouverte ? '' :
          '🔐 Mila alalana ity pejy ity : sokafy aloha ny « Fokontany » miaraka amin\'ny code nomen\'ny tompon\'ny site.';
      }
      if(!ouverte) return;
      // Les mêmes lectures que l'onglet Tableau de bord du Fokontany,
      // et la liste des installations, qui n'est qu'ici.
      window.__montrerLesInstallations();
      if(typeof renderFianakavianaIsa === 'function') renderFianakavianaIsa();
      if(typeof renderVolaVoaangona === 'function') renderVolaVoaangona();
      if(typeof renderTaratasyIsa === 'function') renderTaratasyIsa();
    }
    if(typeof renderPorteCommun === 'function') renderPorteCommun().then(montrer, function(){ montrer(false); });
    else montrer(true);
  }

  function rafraichirVue(nom){
    if(nom === 'commun'){
      rangerTableauCommun('commun');
      choisirOngletCommun(ongletCommun);
    }
    if(nom === 'communadmin') ouvrirCommunAdmin();
    // Gardes typeof : showDashView tourne aussi au démarrage, pour rouvrir
    // la vue quittée, et tous les fichiers ne sont pas encore chargés.
    if(nom === 'dashboard'){
      if(typeof renderFilters === 'function') renderFilters();
      if(typeof renderDashboard === 'function') renderDashboard();
    }
    if(nom === 'accueil' && typeof renderCommunityPanel === 'function') renderCommunityPanel();
    if(nom === 'historique' && typeof renderMovementsHistory === 'function') renderMovementsHistory();
    if((nom === 'ajouter' || /^nouveau\d*$/.test(nom)) && typeof renderStock === 'function') renderStock();
    if(nom === 'articles' && typeof renderStock === 'function') renderStock();
    if(nom === 'acheter' && typeof populateAcheterItemSelect === 'function') populateAcheterItemSelect();
    if(/^comptes\d*$/.test(nom) && typeof renderClientsList === 'function') renderClientsList();
  }

  function showDashView(nom){
    // Le Fokontany et l'Administratif Commun sont au propriétaire : un client
    // qui y arriverait (vue rouverte au démarrage, lien) retombe sur l'Accueil,
    // sans que rien n'ait été demandé au serveur.
    if((nom === 'commun' || nom === 'communadmin') &&
       !(currentUser && currentUser.email && isOwnerEmail(currentUser.email))) nom = 'accueil';
    const view = document.getElementById('dash-' + nom);
    if(!view) return false;
    document.querySelectorAll('.dash-tab').forEach(function(t){ t.classList.remove('active'); });
    // Une page en fenêtre laisse les autres fenêtres ouvertes ; une vue du
    // fil remplace tout, comme avant.
    const enFenetre = view.classList.contains('fenetre-page');
    document.querySelectorAll('.dash-view').forEach(function(v){
      if(enFenetre && v.classList.contains('fenetre-page')) return;
      v.classList.remove('active');
    });
    view.classList.add('active');
    // Un même onglet peut paraître deux fois — dehors et dans les Articles :
    // les deux s'allument.
    document.querySelectorAll('.dash-tab[data-dash="' + nom + '"]').forEach(function(t){ t.classList.add('active'); });
    rafraichirVue(nom);
    if(typeof updateSubTabsVisibility === 'function') updateSubTabsVisibility();
    return true;
  }

  // Accueil et Articles s'ouvrent depuis le menu. Ils vivent dans la section
  // « Stock » : depuis Factures ou Portefeuille, il faut d'abord y revenir,
  // sinon on activerait une vue que personne ne regarde.
  function ouvrirDepuisLeMenu(nom){
    const navStock = document.querySelector('.nav-item[data-section="stock"]');
    if(navStock && !navStock.classList.contains('active')) navStock.click();
    showDashView(nom);
    if(navList){
      navList.classList.remove('open');
      if(menuToggle) menuToggle.setAttribute('aria-expanded','false');
    }
    saveLastView();
  }

  // L'Accueil se trouve à deux endroits — la rangée du bas et le menu — et
  // les deux mènent au même écran.
  ['menuAccueil', 'barAccueil'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', function(){ ouvrirDepuisLeMenu('accueil'); });
  });
  const menuArticles = document.getElementById('menuArticles');
  if(menuArticles) menuArticles.addEventListener('click', function(){ ouvrirDepuisLeMenu('articles'); });
  const menuTableauBord = document.getElementById('menuTableauBord');
  if(menuTableauBord) menuTableauBord.addEventListener('click', function(){ ouvrirDepuisLeMenu('dashboard'); });
  const menuCommun = document.getElementById('menuCommun');
  if(menuCommun) menuCommun.addEventListener('click', function(){ ouvrirDepuisLeMenu('commun'); });
  const menuCommunAdmin = document.getElementById('menuCommunAdmin');
  if(menuCommunAdmin) menuCommunAdmin.addEventListener('click', function(){ ouvrirDepuisLeMenu('communadmin'); });
  // Les deux s'installent de la même façon : la page de validation (lettre
  // et code), puis le lien.
  [['menuInstallFokontany', '/fokontany/', 'fokontany'], ['menuInstallCommun', '/commun/', 'commun']].forEach(function(p){
    const el = document.getElementById(p[0]);
    if(el) el.addEventListener('click', function(){
      if(!(currentUser && currentUser.email && isOwnerEmail(currentUser.email))) return;
      window.__validerAvantInstall(function(suffixe){ window.__versLInstallation(p[1], suffixe); }, p[2]);
    });
  });

  // Ny asako Hôtel : comme le Fokontany, l'admin seul l'installe, depuis le
  // menu. Pas de code de fokontany à valider ici : la page /hotely s'ouvre
  // dans le navigateur, où l'installation se propose.
  const menuInstallHotel = document.getElementById('menuInstallHotel');
  if(menuInstallHotel) menuInstallHotel.addEventListener('click', function(){
    window.__versLInstallation('/hotely', '');
  });

  // La validation avant l'installation : une page entière, à l'image de la
  // porte du Fokontany (« 🔐 Mila alalana ity pejy ity »). L'admin y écrit le
  // code du fokontany nouveau (celui de sa demande, visible dans
  // « 🛡️ Fangatahana ») et presse « 🔓 Sokafy ny pejy » : l'accès est
  // confirmé et la demande acceptée, comme par ✅ Hamafiso. Le lien suit.
  document.querySelectorAll('#dash-commun [data-commun]').forEach(function(tab){
    tab.addEventListener('click', function(){ choisirOngletCommun(tab.dataset.commun); });
  });

  const backToAccueilBtn = document.getElementById('backToAccueilBtn');
  if(backToAccueilBtn){
    backToAccueilBtn.addEventListener('click', function(){
      showDashView('accueil');
      saveLastView();
    });
  }

  document.querySelectorAll('.dash-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      // « Appel vidéo » porte le même habillage que les onglets mais n'ouvre
      // aucune vue : sans cette garde, il effaçait la vue affichée puis
      // échouait sur un identifiant "dash-undefined".
      const view = tab.dataset.dash ? document.getElementById('dash-' + tab.dataset.dash) : null;
      if(!view) return;
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.dash-tab[data-dash="' + tab.dataset.dash + '"]').forEach(t => t.classList.add('active'));
      view.classList.add('active');
      rafraichirVue(tab.dataset.dash);
      updateSubTabsVisibility();
      saveLastView();
    });
  });

  // ---------------- RECHERCHE GLOBALE ----------------
  function highlightRow(selector){
    const row = document.querySelector(selector);
    if(!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('search-highlight');
    void row.offsetWidth; // relance l'animation si déjà utilisée
    row.classList.add('search-highlight');
  }

  function goToStockSection(dashTab){
    const navStock = document.querySelector('.nav-item[data-section="stock"]');
    if(navStock && !navStock.classList.contains('active')) navStock.click();
    const tab = document.querySelector('.dash-tab[data-dash="' + dashTab + '"]');
    if(tab){
      if(!tab.classList.contains('active')) tab.click();
    } else {
      // Articles n'a plus d'onglet : sans ce recours, un résultat de recherche
      // surlignait une ligne dans une vue restée cachée.
      showDashView(dashTab);
      saveLastView();
    }
  }

  function performGlobalSearch(query){
    const resultsEl = document.getElementById('globalSearchResults');
    const q = query.trim().toLowerCase();
    if(!q){ resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }

    const itemMatches = items.filter(function(it){
      return [it.ref, it.name, it.category, it.supplier].some(function(f){ return (f || '').toLowerCase().includes(q); });
    });
    const moveMatches = movements.filter(function(m){
      return [m.ref, m.name, m.category, m.note].some(function(f){ return (f || '').toLowerCase().includes(q); });
    }).sort(function(a, b){ return new Date(b.date) - new Date(a.date); });

    let html = '';
    if(!itemMatches.length && !moveMatches.length){
      html = '<div class="notif-empty">Aucun résultat pour « ' + escapeHtml(query) + ' ».</div>';
    } else {
      if(itemMatches.length){
        html += '<div class="search-result-group">📦 Articles</div>';
        itemMatches.slice(0, 8).forEach(function(it){
          html += '<div class="search-result-item" data-goto-item="' + escapeHtml(it.id) + '">' +
            '<strong>' + escapeHtml(it.name) + '</strong> <span class="muted">Réf. ' + escapeHtml(it.ref || '—') +
            (it.category ? ' · ' + escapeHtml(it.category) : '') + '</span></div>';
        });
      }
      if(moveMatches.length){
        html += '<div class="search-result-group">📜 Mouvements</div>';
        moveMatches.slice(0, 8).forEach(function(m){
          const icon = m.type === 'entree' ? '▲' : (m.type === 'sortie' ? '▼' : '✎');
          const key = (m.itemId || '') + '_' + m.date + '_' + m.type;
          html += '<div class="search-result-item" data-goto-move="' + escapeHtml(key) + '">' +
            icon + ' <strong>' + escapeHtml(m.name) + '</strong> <span class="muted">' + escapeHtml(m.note || m.category || '') + '</span></div>';
        });
      }
    }
    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
  }

  var globalSearchInput = document.getElementById('globalSearchInput');
  var globalSearchResults = document.getElementById('globalSearchResults');
  if(globalSearchInput){
    globalSearchInput.addEventListener('input', function(){
      performGlobalSearch(globalSearchInput.value);
    });
    globalSearchInput.addEventListener('focus', function(){
      if(globalSearchInput.value.trim()) performGlobalSearch(globalSearchInput.value);
    });
    globalSearchResults.addEventListener('click', function(e){
      const itemEl = e.target.closest('[data-goto-item]');
      const moveEl = e.target.closest('[data-goto-move]');
      if(itemEl){
        goToStockSection('articles');
        setTimeout(function(){ highlightRow('#stockTableBody tr[data-item-id="' + CSS.escape(itemEl.dataset.gotoItem) + '"]'); }, 60);
      } else if(moveEl){
        goToStockSection('historique');
        setTimeout(function(){ highlightRow('#movementsTableBody tr[data-move-key="' + CSS.escape(moveEl.dataset.gotoMove) + '"]'); }, 60);
      }
      globalSearchResults.style.display = 'none';
      globalSearchInput.value = '';
    });
    document.addEventListener('click', function(e){
      if(globalSearchResults.style.display === 'block' && !globalSearchResults.contains(e.target) && e.target !== globalSearchInput){
        globalSearchResults.style.display = 'none';
      }
    });
  }
  // Les noms complets (.champ-anarana) : une zone de texte qui grandit avec
  // le nom au lieu de le couper. Elle reste un champ d'une seule ligne pour
  // le reste du code : Entrée n'y ajoute rien, et un retour à la ligne collé
  // devient une espace.
  (function(){
    function ajuster(el){
      if(!el.offsetParent) return;          // cachée : mesurée quand elle paraîtra
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 2 + 'px';
    }
    document.querySelectorAll('textarea.champ-anarana').forEach(function(el){
      // Les scripts écrivent .value directement (scan de la CIN, choix d'une
      // personne, remise à zéro) : sans ce relais, la hauteur ne suivrait pas.
      const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      Object.defineProperty(el, 'value', {
        configurable: true,
        get: function(){ return proto.get.call(el); },
        set: function(v){ proto.set.call(el, v); ajuster(el); }
      });
      el.addEventListener('keydown', function(e){ if(e.key === 'Enter') e.preventDefault(); });
      el.addEventListener('input', function(){
        if(/[\r\n]/.test(proto.get.call(el))){
          const pos = el.selectionStart;
          proto.set.call(el, proto.get.call(el).replace(/\s*[\r\n]+\s*/g, ' '));
          el.setSelectionRange(pos, pos);
        }
        ajuster(el);
      });
      el.addEventListener('focus', function(){ ajuster(el); });
    });
    // La page qui s'ouvre, la fenêtre qu'on élargit : la largeur change, la
    // hauteur nécessaire aussi.
    function toutAjuster(){ document.querySelectorAll('textarea.champ-anarana').forEach(ajuster); }
    window.addEventListener('resize', toutAjuster);
    if(window.ResizeObserver){
      const ro = new ResizeObserver(toutAjuster);
      document.querySelectorAll('textarea.champ-anarana').forEach(function(el){ ro.observe(el.parentElement); });
    }
  })();

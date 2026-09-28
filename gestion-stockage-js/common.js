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
  // ---- CE QUE RAPPORTE UNE INVITATION ----
  // Chaque personne qui ouvre l'application avec le lien verse 1 000 Ar au
  // portefeuille de celui qui l'a invitée : quinze invitations font le mois
  // d'abonnement, cent cinquante font l'année. Le chiffre ne fait pas foi ici —
  // c'est AR_PER_REFERRAL, dans la fonction « wallet », qui calcule le solde,
  // parce qu'une page peut être modifiée par celui qui la regarde. Celui-ci ne
  // sert qu'à écrire des sommes lisibles, et doit lui rester égal.
  const AR_PER_CREDIT = 1000;

  function genInstallId(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
  function getUrlRef(){
    try{
      const params = new URLSearchParams(window.location.search);
      return params.get('ref') || null;
    }catch(e){ return null; }
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
        bonusDays: 0,
        referralCount: 0,
        referredBy: getUrlRef(),
        referralRecorded: false
      };
      saveSubscription(sub);
    } else {
      // migration : ampidirina ireo sampana vaovao ho an'ireo appareil efa nampiasa ny app talohan'ny fanavaozana
      let changed = false;
      if(!sub.id){ sub.id = genInstallId(); changed = true; }
      if(typeof sub.bonusDays !== 'number'){ sub.bonusDays = 0; changed = true; }
      if(typeof sub.referralCount !== 'number'){ sub.referralCount = 0; changed = true; }
      if(sub.referralRecorded === undefined){ sub.referralRecorded = false; changed = true; }
      if(sub.referredBy === undefined){ sub.referredBy = null; changed = true; }
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

  // Jours restants avant que le compte soit réclamé. Les jours offerts par le
  // parrainage allongent l'essai, pas cette fenêtre-ci : ils repoussent le
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
  //
  // Rien n'est retiré à personne : ce versement et celui du parrainage sont
  // deux écritures distinctes. Quelqu'un arrivé par un lien d'invitation les
  // produit toutes les deux.
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
      invitePar: sub.referredBy || null,
      appareil: typeof shortUserAgent === 'function' ? shortUserAgent(navigator.userAgent) : null
    } }).then(function(){}, function(){});
  }

  // ---------------- PARRAINAGE (fizarana lien) ----------------
  // Mandraikitra ny "referral" indray mandeha ihany, rehefa misy appareil vaovao
  // miditra amin'ny alalan'ny lien misy ?ref=... (tsy manery hiditra amin'ny app).
  function recordReferralIfNeeded(){
    const sub = ensureInstallDate();
    if(!sub.referredBy || sub.referredBy === sub.id || sub.referralRecorded) return;
    if(!window.__sb){ return; }
    window.__sb.from('referrals').insert({
      inviter_id: sub.referredBy,
      referred_id: sub.id
    }).then(function(res){
      if(!res || !res.error){
        sub.referralRecorded = true;
        saveSubscription(sub);
      }
    }, function(){});
  }

  // Mandeha mitady any amin'ny Supabase hoe firy ny olona nampiasa ny lien
  // navoakan'ilay appareil ity. Ny fonction « wallet » no mamadika izany ho
  // ariary ao amin'ny portefeuille : eto dia isa fotsiny, aseho eo amin'ny
  // pejy parrainage.
  function syncReferralBonus(callback){
    const sub = ensureInstallDate();
    if(!window.__sb || !sub.id){ if(callback) callback(sub); return; }
    window.__sb.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_id', sub.id)
      .then(function(res){
        const count = (res && typeof res.count === 'number') ? res.count : 0;
        const avant = sub.referralCount || 0;
        sub.referralCount = count;
        saveSubscription(sub);
        // L'argent entrait en silence : le compte montait, et il fallait aller
        // regarder la page pour s'en apercevoir. Une installation neuve part de
        // zéro parrainage et de zéro connu — rien ne s'annonce à tort.
        if(count > avant){
          const gagnants = count - avant;
          pushNotification('parrainage',
            gagnants + ' personne' + (gagnants > 1 ? 's' : '') +
            ' de plus ' + (gagnants > 1 ? 'ont' : 'a') + ' ouvert l\'application avec votre lien : ' +
            formatWalletAr(gagnants * AR_PER_CREDIT) + ' dans votre portefeuille.');
        }
        if(callback) callback(sub);
      }, function(){ if(callback) callback(sub); });
  }
  function getAvailableCredits(sub){
    return Math.max(0, (sub.referralCount || 0) - (sub.creditsSpent || 0));
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

  const STORAGE_NOTIFICATIONS = 'stockmanager_notifications' + SUFFIXE_MPIASA;
  function loadNotifications(){
    try { return JSON.parse(localStorage.getItem(STORAGE_NOTIFICATIONS)) || []; }
    catch(e){ return []; }
  }
  function saveNotifications(list){ localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(list)); }
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
  const STORAGE_NOTIF_VU = 'stockmanager_notif_partage_vu' + SUFFIXE_MPIASA;

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
    try{ vu = localStorage.getItem(STORAGE_NOTIF_VU) || ''; }catch(e){}
    // La première fois sur ce téléphone, on part de maintenant : remonter
    // tout l'historique noierait la liste sous des nouvelles d'hier.
    if(!vu){
      try{ localStorage.setItem(STORAGE_NOTIF_VU, new Date().toISOString()); }catch(e){}
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
        const deMoi = MODE_MPIASA ? (r.auteur_id && r.auteur_id === moi) : !r.auteur_id;
        if(deMoi) return;
        // Un direct dit déjà qui le fait ; le reste, on le signe.
        const texte = r.type === 'live' ? r.message : (r.auteur_nom || 'Patron') + ' : ' + r.message;
        if(notificationDejaLa(r.type, texte) || notificationDejaLa(r.type, r.message)) return;
        ajouterNotificationLocale(r.type, texte, new Date(r.created_at).toLocaleString('fr-FR'));
      });
      try{ localStorage.setItem(STORAGE_NOTIF_VU, rows[rows.length - 1].created_at); }catch(e){}
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

  function saveSession(){
    try{ localStorage.setItem(STORAGE_SESSION, JSON.stringify(currentUser)); }catch(e){}
  }
  function loadSession(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_SESSION)) || null; }catch(e){ return null; }
  }
  function clearSession(){
    try{
      localStorage.removeItem(STORAGE_SESSION);
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

  // La page « Inviter des amis » annonce un tarif et ce qu'il paie. Les deux
  // changent avec la personne : le propriétaire n'a pas le même que ses
  // clients, et il ne doit pas lire le leur.
  function majTarifInvitation(tarif){
    const par = Number(tarif) || AR_PER_CREDIT;
    const el = document.getElementById('inviteTarif');
    if(el) el.textContent = formatWalletAr(par);
    const mois = document.getElementById('inviteMois');
    if(mois) mois.textContent = Math.ceil(15000 / par);
    const an = document.getElementById('inviteAn');
    if(an) an.textContent = Math.ceil(150000 / par);
  }

  function refreshReferralProgress(){
    syncReferralBonus(function(sub){
      majPageAbonnement();
      const countEl = document.getElementById('referralCount');
      const gagneEl = document.getElementById('referralBonusDays');
      const soldeEl = document.getElementById('referralNextIn');
      const invitations = sub.referralCount || 0;
      if(countEl) countEl.textContent = invitations;
      // Le tarif n'est pas le même pour tout le monde : celui du propriétaire
      // vaut davantage. C'est le serveur qui le dit — la page ne fait que
      // l'écrire, et retombe sur le tarif ordinaire tant qu'elle l'ignore.
      const tarif = (walletState && walletState.arPerReferral) || AR_PER_CREDIT;
      // Ce que les invitations ont rapporté : le nombre de personnes, au tarif
      // de l'invitation. C'est un gain cumulé et non un solde — ce qui a déjà
      // servi à payer n'en est pas retranché.
      if(gagneEl) gagneEl.textContent = formatWalletAr(invitations * tarif);
      // Le solde, lui, vient du serveur : lui seul tient compte des versements
      // et de ce qui a déjà été dépensé. L'appel rattache au passage cette
      // installation au compte — c'est ce qui fait que les invitations
      // partagées avant qu'il existe rejoignent le portefeuille.
      if(soldeEl){
        if(!currentUser){
          // Sans compte, il n'y a pas encore de portefeuille où verser. Le
          // gain, lui, est déjà compté : il attend.
          soldeEl.textContent = '—';
        } else {
          soldeEl.textContent = '…';
          callWallet({ action: 'state', installId: sub.id }).then(function(state){
            walletState = state;
            soldeEl.textContent = formatWalletAr(state.balanceAr);
            // Le serveur vient de dire le tarif : on réécrit le gain avec, au
            // cas où l'on avait affiché celui d'avant.
            if(gagneEl && state.arPerReferral){
              gagneEl.textContent = formatWalletAr(invitations * state.arPerReferral);
            }
            majTarifInvitation(state.arPerReferral);
          }, function(){ soldeEl.textContent = '—'; });
        }
      }
      renderWallet();
    });
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
    const creditsEl = document.getElementById('walletBalanceCredits');
    if(creditsEl){
      const par = walletState.arPerReferral || 0;
      creditsEl.textContent = par
        ? 'soit ' + Math.floor((walletState.balanceAr || 0) / par) + ' parrainage(s) à ' + formatWalletAr(par)
        : '';
    }
    // Ce qui peut sortir pour de bon : l'argent vraiment payé. Le reste
    // (parrainages, sommes inscrites par l'application) se dépense ici.
    const retirableEl = document.getElementById('walletRetirable');
    if(retirableEl){
      const r = walletState.retirableAr;
      retirableEl.innerHTML = (r === undefined || r === null) ? '' :
        '💵 Azo alaina (dépôt + parrainage) : <strong style="color:var(--text);">' + formatWalletAr(r) + '</strong>' +
        (r < (walletState.balanceAr || 0)
          ? '<br><span style="font-size:0.72rem;">Ny vola nampidirin\'ny appli ho azy dia ampiasaina ato anatiny ihany (abonnement, déblocage…).</span>'
          : '');
    }
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

  // Le même solde, dans la devise du pays où l'argent doit arriver.
  function updateWalletConversion(){
    const select = document.getElementById('walletCurrency');
    const out = document.getElementById('walletConverted');
    const note = document.getElementById('walletRateNote');
    if(!select || !out || !walletState) return;
    const currency = select.value;
    if(currency === 'MGA'){
      out.textContent = formatWalletAr(walletState.balanceAr);
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
      const converted = (walletState.balanceAr || 0) * res.rate;
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
          // Les jours mis de côté par le parrainage s'ajoutent à l'abonnement.
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
  // Plus avec les parrainages (ils se retirent en Mobile Money). Si l'argent
  // déjà versé par Papi suffit, l'abonnement part de là ; sinon on ouvre Papi
  // pour la somme qui manque, et l'abonnement se règle tout seul au retour
  // (papi-paiement.js). Les prix ne sont ici que pour l'affichage : c'est le
  // serveur qui les tient.
  const PRIX_ABONNEMENT = { sub_month: 15000, sub_year: 150000, sub_days: 20000 };
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
    // C'est ici, et nulle part ailleurs, qu'on sait qu'un compte est neuf.
    // La marque dit à serasera-voalohany.js de montrer à ce client-là, à son
    // entrée, par où joindre le propriétaire. Elle est posée avant tout appel
    // au serveur : sans réseau, le compte est neuf quand même.
    try { localStorage.setItem('stockmanager_client_nouveau', normEmail(email)); } catch(e){}
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
      name: meta.name || local.name || email.split('@')[0],
      email: email,
      phone: meta.phone || local.phone || '',
      // Le logo suit le compte : sans la copie du serveur, une facture éditée
      // depuis un autre téléphone ou après un vidage du navigateur sortait
      // sans logo, alors qu'il s'affichait toujours dans le profil d'origine.
      logo: local.logo || meta.logo || null,
      company: meta.company || local.company || '',
      nif: meta.nif || local.nif || '',
      stat: meta.stat || local.stat || ''
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
    currentUser = null;
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
    if(getSubscriptionStatus().status === 'expired'){
      openPaywall();
    } else {
      openApp();
      ouvrirSurLAccueil();
    }
  }

  // ---------------- CONNEXION RAPIDE (email + code) ----------------
  const quickLoginForm = document.getElementById('quickLoginForm');
  const loginTitle = document.getElementById('loginTitle');
  const loginSub = document.getElementById('loginSub');

  function showLoginMode(mode){
    const quick = mode === 'quick';
    if(quickLoginForm) quickLoginForm.style.display = quick ? 'block' : 'none';
    loginForm.style.display = quick ? 'none' : 'block';
    const backBtn = document.getElementById('showQuickLoginBtn');
    if(backBtn) backBtn.style.display = quick ? 'none' : 'block';
    if(loginTitle) loginTitle.textContent = quick ? 'Bon retour' : 'Connexion';
    if(loginSub){
      loginSub.textContent = quick
        ? 'Entrez votre email et votre mot de passe : la connexion se valide automatiquement.'
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
    closeHelpBoxes();
  }

  // Les deux dépannages sont indépendants : on n'en ouvre jamais deux à la fois.
  function closeHelpBoxes(except){
    ['resetBox', 'forgotBox'].forEach(function(id){
      if(id === except) return;
      const box = document.getElementById(id);
      if(box) box.style.display = 'none';
    });
  }
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
      const box = document.getElementById('resetBox');
      const open = box.style.display === 'block';
      closeHelpBoxes();
      box.style.display = open ? 'none' : 'block';
      if(!open){
        const field = document.getElementById('resetEmail');
        const known = document.getElementById('quickEmail').value.trim() || loadLastEmail();
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
      stat: profile.stat || ''
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
  function recordWalletUnlock(name, email){
    if(!window.__sb) return;
    window.__sb.from('unlock_requests').insert({
      name: name, email: normEmail(email), phone: '', message: 'Payé avec le solde du portefeuille',
      amount: UNLOCK_COST_CREDITS, paypal_reference: '', payment_method: 'wallet',
      status: 'confirmed', auto_confirmed: true,
      confirmed_at: new Date().toISOString()
    }).then(function(){}, function(){});
  }

  const forgotToggleBtn = document.getElementById('forgotToggleBtn');
  if(forgotToggleBtn){
    forgotToggleBtn.addEventListener('click', function(){
      const box = document.getElementById('forgotBox');
      const open = box.style.display === 'block';
      closeHelpBoxes();
      box.style.display = open ? 'none' : 'block';
      if(open) return;
      // Ce que la personne vient de taper pour se connecter sert déjà : on ne
      // lui redemande pas son email deux fois de suite.
      const quickEmail = document.getElementById('quickEmail').value.trim();
      const emailField = document.getElementById('forgotEmail');
      if(quickEmail && !emailField.value) emailField.value = quickEmail;
      const known = findProfileByEmail(emailField.value);
      const nameField = document.getElementById('forgotName');
      if(known && !nameField.value) nameField.value = known.name || '';
      renderUnlockWallet();
    });
  }

  const payFromWalletBtn = document.getElementById('payFromWalletBtn');
  if(payFromWalletBtn){
    payFromWalletBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('forgotStatus');
      const name = document.getElementById('forgotName').value.trim();
      const email = document.getElementById('forgotEmail').value.trim();
      if(!name || !email){
        statusEl.textContent = 'Votre nom et votre email sont obligatoires.';
        return;
      }

      // Sans le compte enregistré ici, il n'y a rien à rouvrir : le déblocage
      // vaut pour cet appareil, où les données de l'application se trouvent.
      const profile = findProfileByEmail(email);
      if(!profile){
        statusEl.textContent = 'Aucun compte n\'est enregistré sur cet appareil pour cet email. ' +
          'Utilisez « Première connexion / autre compte ».';
        return;
      }

      const sub = ensureInstallDate();
      const available = getAvailableCredits(sub);
      if(available < UNLOCK_COST_CREDITS){
        const manque = UNLOCK_COST_CREDITS - available;
        statusEl.textContent = 'Il vous manque ' + (manque * AR_PER_CREDIT).toLocaleString('fr-FR') +
          ' Ar : vous avez ' + (available * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar sur les ' +
          (UNLOCK_COST_CREDITS * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar demandés. ' +
          'Chaque personne qui ouvre l\'application avec votre lien d\'invitation vous rapporte ' +
          AR_PER_CREDIT.toLocaleString('fr-FR') + ' Ar.';
        renderUnlockWallet();
        return;
      }

      sub.creditsSpent = (sub.creditsSpent || 0) + UNLOCK_COST_CREDITS;
      saveSubscription(sub);
      renderUnlockWallet();
      recordWalletUnlock(name, email);

      const paye = (UNLOCK_COST_CREDITS * AR_PER_CREDIT).toLocaleString('fr-FR') + ' Ar';
      statusEl.textContent = paye + ' retirés de votre portefeuille ✓ Accès rétabli.';
      pushNotification('parrainage', 'Déblocage payé avec ' + paye + ' de votre portefeuille — accès rétabli.');
      loginFromProfile(profile);
    });
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
      if(!silent && status) status.textContent = 'Email et mot de passe (6 caractères minimum) obligatoires.';
      return false;
    }
    quickLoginBusy = true;
    if(status) status.textContent = 'Connexion…';
    auth.signInWithPassword({ email: email, password: password }).then(function(res){
      quickLoginBusy = false;
      if(res && res.error){
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

  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    setLoginStatus('');
    const name = document.getElementById('loginName').value.trim();
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
    const logoFile = document.getElementById('profileLogo').files[0];
    if(!name || !email){ alert('Le nom et l\'email sont obligatoires.'); return; }

    function finishSave(logoDataUrl){
      const logo = logoDataUrl || currentUser.logo || null;
      currentUser = { name, company, email, phone, nif, stat, logo: logo };
      const codeInput = document.getElementById('profileAccessCode');
      const existing = findProfile(name);
      const newPassword = codeInput ? codeInput.value : '';
      const auth = sbAuth();
      // avec Supabase le mot de passe n'est jamais gardé ici
      const localCode = auth ? '' : (newPassword.trim() || (existing ? existing.accessCode : ''));
      upsertProfile(name, { name, company, email, phone, nif, stat, logo: logo, accessCode: localCode });
      document.getElementById('currentUserName').textContent = name;
      document.getElementById('currentUserEmail').textContent = email;
      saveSession();
      document.getElementById('profileLogo').value = '';
      updateProfilePhotoPreview(logo);
      const status = document.getElementById('profileSaveStatus');
      status.textContent = 'Profil enregistré.';

      if(auth){
        const update = { data: { name: name, phone: phone, company: company, nif: nif, stat: stat,
          logo: logoForServer(logo) } };
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

  // ---------------- MOT DE BIENVENUE ----------------
  // Première chose vue en arrivant sur le site. Tant qu'il est là, l'avis
  // d'abonnement attend son tour : deux fenêtres l'une sur l'autre, personne
  // ne lit ni l'une ni l'autre.
  let welcomeOpen = false;
  let noticeWaitsForWelcome = false;

  function showWelcome(){
    const box = document.getElementById('welcomeOverlay');
    if(!box) return;
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

  ['welcomeClose', 'welcomeEnterBtn'].forEach(function(id){
    const btn = document.getElementById(id);
    if(btn) btn.addEventListener('click', function(){ closeWelcome(true); });
  });
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
    const firstField = document.getElementById(quickVisible ? 'quickEmail' : 'loginName');
    if(firstField) firstField.focus();
  });

  const creerCompteBtn = document.getElementById('creerCompteBtn');
  if(creerCompteBtn) creerCompteBtn.addEventListener('click', function(){ quitterLEssaiLibre(); });

  document.getElementById('logoutBtn').addEventListener('click', function(){
    teardownRealtimeFeatures();
    var authOut = sbAuth();
    if(authOut) authOut.signOut().then(function(){}, function(){});
    clearSession();
    currentUser = null;
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    if(quickLoginForm) quickLoginForm.reset();
    // Après une déconnexion le compte existe déjà : on revient sur
    // « Bon retour » (email + mot de passe), pas sur l'inscription.
    showLoginMode('quick');
    showAutoNotice();
  });

  document.getElementById('paywallLogoutBtn').addEventListener('click', function(){
    clearSession();
    currentUser = null;
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
  // raha nampiasa lien fizarana (?ref=...) ilay mpampiasa vaovao, dia raiketina izany
  recordReferralIfNeeded();
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
    // Les pages qu'il ouvre. Elles remplaçaient le fil ; elles se posent
    // maintenant par-dessus, dans une fenêtre qu'on tire par les coins. Le fil
    // reste dessous : on n'ouvre pas une page pour perdre de vue d'où l'on
    // vient.
    //
    // L'Accueil en est une lui aussi. Restent dehors, autour d'elle : le nom
    // « Ny asako », la bannière d'essai et la rangée du bas.
    const PAGES = [
      'dash-accueil',
      'dash-articles', 'dash-dashboard', 'dash-commun', 'dash-communadmin', 'section-factures', 'section-inviter', 'section-contact',
      // Les outils de bureau (fitaovana.js).
      'section-word', 'section-excel', 'section-notes', 'section-kajy',
      'section-calendrier', 'section-horaire',
      // Scan, photos, photocopies (photocopie.js), et les PDF rangés (pdf.js).
      'section-photocopie', 'section-pdf',
      'section-live', 'section-appels', 'section-wallet',
      'section-mpiasa', 'section-livreur', 'section-personne',
      // « Ny momba ahy », la page de l'employé entré par son lien : posée
      // sous l'Accueil, sa carte s'ouvrait derrière le fil.
      'section-moi',
      'section-abonnement',
      'section-fond',
      'section-corbeille',
      'section-connexions', 'section-admin'
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
      const page = el.classList.contains('fenetre-page');
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
      const navStock = document.querySelector('.nav-item[data-section="stock"]');
      if(navStock) navStock.click();
      if(typeof showDashView === 'function') showDashView('accueil');
      if(typeof saveLastView === 'function') saveLastView();
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
      const pageDevant = suivis.some(function(x){
        return x.page && x.el.id !== 'dash-accueil' && visible(x.el);
      });
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
        if(!vu){
          s.vu = false;
        } else if(!s.vu){
          // Posée, alors seulement retenue comme ouverte : sinon un passage
          // trop précoce la marquerait faite et personne n'y reviendrait.
          if(!s.page || poserFenetre(s.el)){
            appliquerTaille(s.el);
            s.vu = true;
          }
        }
        const cache = !vu || (s.el.id === 'dash-accueil' && pageDevant);
        s.calque.hidden = cache;
        if(cache) return;
        const r = s.el.getBoundingClientRect();
        s.calque.style.left = r.left + 'px';
        s.calque.style.top = r.top + 'px';
        s.calque.style.width = r.width + 'px';
        s.calque.style.height = r.height + 'px';
        // Juste au-dessus de sa fenêtre : les panneaux ne sont pas tous au même
        // étage, et une poignée sous sa fenêtre ne se saisit pas.
        const z = parseInt(getComputedStyle(s.el).zIndex, 10);
        s.calque.style.zIndex = (isFinite(z) ? z : 120) + 1;
      });
    }

    // Déplacer : la fenêtre suit le doigt, sans changer de taille, et sans
    // sortir de la bande où on la verrait encore.
    function armerDeplacement(s, ruban){
      let g = null;
      ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function(t){
        ruban.addEventListener(t, function(e){ e.stopPropagation(); });
      });
      ruban.addEventListener('pointerdown', function(e){
        const r = s.el.getBoundingClientRect();
        if(!visible(s.el) || r.width < 1 || r.height < 1) return;
        e.preventDefault();
        figer(s.el, r);
        g = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
        ruban.classList.add('tire');
        try{ ruban.setPointerCapture(e.pointerId); }catch(err){}
      });
      ruban.addEventListener('pointermove', function(e){
        if(!g) return;
        const z = ecran();
        const bande = s.page ? bandeUtile() : { haut: z.y, bas: z.y + z.h };
        let l = g.l + (e.clientX - g.x);
        let t = g.t + (e.clientY - g.y);
        l = Math.max(z.x + MARGE, Math.min(l, z.x + z.w - g.w - MARGE));
        t = Math.max(bande.haut + MARGE, Math.min(t, bande.bas - g.h - MARGE));
        s.el.style.left = Math.round(l) + 'px';
        s.el.style.top = Math.round(t) + 'px';
        synchroniser();
      });
      function fin(e){
        if(!g) return;
        g = null;
        ruban.classList.remove('tire');
        try{ ruban.releasePointerCapture(e.pointerId); }catch(err){}
        const r = s.el.getBoundingClientRect();
        const o = lirePlaces();
        o[s.el.id] = { x: Math.round(r.left), y: Math.round(r.top) };
        ecrirePlaces(o);
      }
      ruban.addEventListener('pointerup', fin);
      ruban.addEventListener('pointercancel', fin);
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
        const r = s.el.getBoundingClientRect();
        if(!visible(s.el) || r.width < 1 || r.height < 1) return;
        e.preventDefault();
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
      const s = { el: el, calque: calque, vu: false, page: page };
      if(page){
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

        const croix = document.createElement('button');
        croix.type = 'button';
        croix.className = 'fenetre-fermer';
        croix.textContent = '✕';
        croix.title = 'Fermer la fenêtre';
        croix.setAttribute('aria-label', 'Fermer la fenêtre');
        croix.addEventListener('click', function(e){ e.stopPropagation(); fermerFenetre(s.el); });
        calque.appendChild(croix);
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
      const tailles = lire();
      const places = lirePlaces();
      suivis.forEach(function(s){
        if(!s.page || !visible(s.el)) return;
        if(tailles[s.el.id] || places[s.el.id]) appliquerTaille(s.el); else poserFenetre(s.el);
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

    boutonsComposer.forEach(function(bouton){
      bouton.addEventListener('click', function(e){
        e.stopPropagation();
        if(fbComposer.style.display !== 'none'){ fermerComposer(); return; }
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

    // Un clic à côté referme, comme pour les autres panneaux.
    document.addEventListener('click', function(e){
      if(fbComposer.style.display === 'none') return;
      if(fbComposer.contains(e.target)) return;
      if(boutonsComposer.some(function(b){ return b.contains(e.target); })) return;
      fermerComposer();
    });

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
    const CLE = 'stockmanager_install_propose';

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
        // le menu de partage. Le bouton n'aurait ici rien à déclencher — on le
        // retire, et la phrase dit où aller.
        if(sous) sous.textContent = "Touchez Partager ⬆️ puis « Sur l'écran d'accueil ».";
        if(oui) oui.hidden = true;
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
      setTimeout(function(){
        if(dejaInstallee() || !applicationVisible()){ prevu = false; return; }
        montrer();
      }, 5000);
    }

    if(oui) oui.addEventListener('click', function(){
      cacher();
      if(!invitation) return;
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
    // Six icônes tiennent sur la largeur d'un téléphone sans qu'il faille tirer
    // la rangée : c'est la limite du mode automatique.
    const GARDEES = 6;

    // Chaque épingle retient sa dernière visite : c'est elle qui décide, en
    // automatique, laquelle cède la place.
    function lireEpingles(){
      let brut = [];
      try{ brut = JSON.parse(localStorage.getItem(CLE)) || []; }catch(e){ brut = []; }
      if(!Array.isArray(brut)) return [];
      // Les premières versions n'enregistraient que la clé.
      return brut.map(function(x){
        return (typeof x === 'string') ? { cle: x, vu: 0 } : x;
      }).filter(function(x){ return x && x.cle && JAMAIS_EPINGLEES.indexOf(x.cle) < 0; });
    }
    // Télécharger Fokontany / Commun : une action faite une fois, comme
    // « Installer l'application ». Les deux icônes 📲, pareilles, restaient
    // dans la rangée sans qu'on sache laquelle était laquelle. Écartées ici,
    // elles disparaissent aussi des rangées où elles étaient déjà posées.
    const JAMAIS_EPINGLEES = ['id:menuInstallFokontany', 'id:menuInstallCommun'];
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
    window.__pageFermee = function(id){
      if(lireMode() !== 'auto') return;
      const cle = cleDeLaPage(id);
      if(!cle) return;
      ecrireEpingles(lireEpingles().filter(function(e){ return e.cle !== cle; }));
      const bouton = rangee.querySelector('[data-epingle="' + cle + '"]');
      if(bouton) bouton.remove();
      mesurer();
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
      const icone = espace > 0 ? texte.slice(0, espace) : texte;
      const nom = espace > 0 ? texte.slice(espace + 1).trim() : texte;

      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'dash-tab bar-icone';
      bouton.dataset.epingle = cle;
      bouton.title = nom;
      bouton.setAttribute('aria-label', nom);
      bouton.textContent = icone;

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
    function elaguer(){
      if(lireMode() !== 'auto') return;
      let liste = lireEpingles();
      if(liste.length <= GARDEES) return;
      const usages = lireUsages();
      liste.sort(function(a, b){
        const ecart = (usages[b.cle] || 0) - (usages[a.cle] || 0);
        return ecart !== 0 ? ecart : rangDansLeMenu(a.cle) - rangDansLeMenu(b.cle);
      });
      liste.slice(GARDEES).forEach(function(e){
        const bouton = rangee.querySelector('[data-epingle="' + e.cle + '"]');
        if(bouton) bouton.remove();
      });
      ecrireEpingles(liste.slice(0, GARDEES));
      mesurer();
    }

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
        if(surLeFond('fixe:' + jumeau)) return;
        const bouton = document.getElementById(jumeau);
        if(bouton) bouton.style.display = '';
        ecrireRetirees(lireRetirees().filter(function(id){ return id !== jumeau; }));
        mesurer();
        return;
      }
      const cle = cleDe(entree);
      if(surLeFond(cle)) return;
      if(!remplissage) noterUsage(cle);
      const liste = lireEpingles();
      const connue = liste.filter(function(e){ return e.cle === cle; })[0];
      if(connue) connue.vu = Date.now();
      else liste.push({ cle: cle, vu: Date.now() });
      ecrireEpingles(liste);
      poser(cle);
      elaguer();
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
      const hors = ['navStock', 'navMoi', 'menuInstallFokontany', 'menuInstallCommun'];
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
      rangee.classList.toggle('mode-manuel', mode === 'manuel');
      // Les icônes posées sur le fond obéissent au même réglage, et sont hors
      // de la rangée : c'est le corps de la page qui porte la consigne.
      document.body.classList.toggle('retrait-manuel', mode === 'manuel');
      if(panneau){
        panneau.querySelectorAll('.reglage-mode').forEach(function(b){
          b.classList.toggle('actif', b.dataset.mode === mode);
        });
      }
      if(note){
        note.textContent = mode === 'manuel'
          ? "Ianao no manala : tsindrio ny ✕ eo amin'ny sary."
          : "Ny sary " + GARDEES + " farany nampiasainao no mijanona ; ny hafa miala ho azy.";
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
        boutonReglages.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
        if(!ouvert) placerReglages();
      });

      panneau.querySelectorAll('.reglage-mode').forEach(function(b){
        b.addEventListener('click', function(){
          ecrireMode(b.dataset.mode);
          direLeMode();
          // Le passage en automatique se voit tout de suite : la rangée se
          // ramène à six.
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
    const poserOriginal = poser;
    poser = function(cle){
      if(surLeFond(cle)) return;
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
        // Les panneaux du menu et la loupe se referment : une seule à la fois.
        [['marketPanel', 'marketToggle'], ['livraisonPanel', 'livraisonToggle'],
         ['recherchePanel', 'barRecherche']].forEach(function(paire){
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
    document.addEventListener('click', function(e){
      // .contains et non !== : le bouton porte maintenant une icône, un
      // libellé et une pastille, et c'est l'un d'eux que le clic désigne.
      if(notifPanel.style.display === 'block' && !notifPanel.contains(e.target) && !notifToggle.contains(e.target)){
        notifPanel.style.display = 'none';
        notifToggle.setAttribute('aria-expanded', 'false');
      }
    });
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
        // une seule liste ouverte à la fois : la cloche, et l'autre panneau.
        if(notifPanel){
          notifPanel.style.display = 'none';
          if(notifToggle) notifToggle.setAttribute('aria-expanded', 'false');
        }
        PANNEAUX_DU_MENU.forEach(function(q){
          if(q.panneau === p.panneau) return;
          var autre = document.getElementById(q.panneau);
          var sonBouton = document.getElementById(q.bouton);
          if(autre) autre.style.display = 'none';
          if(sonBouton) sonBouton.setAttribute('aria-expanded', 'false');
        });
        var loupe = document.getElementById('recherchePanel');
        if(loupe) loupe.style.display = 'none';
        var boutonLoupe = document.getElementById('barRecherche');
        if(boutonLoupe) boutonLoupe.setAttribute('aria-expanded', 'false');
        if(typeof window[p.remplir] === 'function') window[p.remplir]();
      }
    });
    document.addEventListener('click', function(e){
      // .contains et non !== : le bouton porte maintenant un libelle, et
      // c'est lui que le clic designe.
      if(panel.style.display === 'block' && !panel.contains(e.target) && !toggle.contains(e.target)){
        panel.style.display = 'none';
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
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
    function entreeOuverte(el){
      if(el.id === 'navStock') return false;
      if(el.id === 'navAdmin') return !!(currentUser && currentUser.email && isOwnerEmail(currentUser.email));
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
          let quoi = (ligne.textContent || '');
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
      let total = 0;
      groupes.forEach(function(g){
        const gardes = g.lignes.filter(function(l){
          return nu(l.nom + ' ' + (l.mots || '')).indexOf(q) >= 0;
        }).slice(0, PAR_GROUPE);
        if(!gardes.length) return;
        total += gardes.length;
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
      });
      if(rienTrouve) rienTrouve.style.display = total ? 'none' : 'block';
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
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
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
      if(nav.dataset.section === 'appels') renderOnlineClientsForCall();
      if(nav.dataset.section === 'corbeille' && typeof renderCorbeille === 'function') renderCorbeille();
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
  const VUES_DANS_LA_PAGE = ['historique', 'ajouter', 'comptes', 'acheter'];
  function updateSubTabsVisibility(){
    const subTabs = document.getElementById('stockSubTabs');
    if(subTabs) subTabs.style.display = VUES_DANS_LA_PAGE.indexOf(vueAffichee()) >= 0 ? '' : 'none';
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
          '🔐 Mila alalana ity pejy ity : sokafy aloha ny « Administratif Fokontany » miaraka amin\'ny code nomen\'ny tompon\'ny site.';
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
    if(nom === 'ajouter' && typeof renderStock === 'function') renderStock();
    if(nom === 'articles' && typeof renderStock === 'function') renderStock();
    if(nom === 'acheter' && typeof populateAcheterItemSelect === 'function') populateAcheterItemSelect();
    if(nom === 'comptes' && typeof renderClientsList === 'function') renderClientsList();
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
    document.querySelectorAll('.dash-view').forEach(function(v){ v.classList.remove('active'); });
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

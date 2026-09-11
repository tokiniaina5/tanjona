const STORAGE_ITEMS = 'stockmanager_items';
  const STORAGE_LOGINS = 'stockmanager_logins';
  const STORAGE_MOVEMENTS = 'stockmanager_movements';
  const STORAGE_SUBSCRIPTION = 'stockmanager_subscription';
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
  const TRIAL_DAYS = 7;
  const REFERRALS_PER_BONUS_DAY = 10; // 10 olona nampiasa ny lien = +1 andro essai gratuit

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
      'Le client suivant signale avoir effectué le paiement de son abonnement Gestion de Stockage :\n\n' +
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
        sub.referralCount = count;
        saveSubscription(sub);
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
  function saveItems(items){ localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items)); }

  function loadLogins(){
    try { return JSON.parse(localStorage.getItem(STORAGE_LOGINS)) || []; }
    catch(e){ return []; }
  }
  function saveLogins(logins){ localStorage.setItem(STORAGE_LOGINS, JSON.stringify(logins)); }

  function loadMovements(){
    try { return JSON.parse(localStorage.getItem(STORAGE_MOVEMENTS)) || []; }
    catch(e){ return []; }
  }
  function saveMovements(movements){ localStorage.setItem(STORAGE_MOVEMENTS, JSON.stringify(movements)); }

  // ---------------- GESTION DE COMPTE : clients & ventes à crédit ----------------
  const STORAGE_CLIENTS = 'stockmanager_clients';
  const STORAGE_CREDIT_SALES = 'stockmanager_credit_sales';
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

  const STORAGE_NOTIFICATIONS = 'stockmanager_notifications';
  function loadNotifications(){
    try { return JSON.parse(localStorage.getItem(STORAGE_NOTIFICATIONS)) || []; }
    catch(e){ return []; }
  }
  function saveNotifications(list){ localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(list)); }
  function pushNotification(type, message){
    const list = loadNotifications();
    list.unshift({
      type: type, message: message,
      date: new Date().toLocaleString('fr-FR'),
      read: false
    });
    saveNotifications(list.slice(0, 50));
    renderNotifications();
  }
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
    return '🔔';
  }
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
      return '<div class="notif-item"><span class="notif-icon">' + notifIcon(n.type) + '</span>' +
        escapeHtml(n.message) + '<span class="notif-date">' + n.date + '</span></div>';
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
    // Demandes de déblocage en attente : le propriétaire l'apprend en ouvrant
    // l'application, pas seulement en passant par Paramètres.
    if(typeof checkPendingUnlockRequests === 'function') checkPendingUnlockRequests();
    renderWallet();
    initPresence();
    initCallSignaling();
    initLiveSignaling();
    // Rohy misy "?live=" na "?call=" : mifandray avy hatrany, tsy mila mitety
    // ny appli ny mpanjifa — ny fanokafana ny rohy no ampy.
    if(typeof runPendingLinkAction === 'function') runPendingLinkAction();
    // étape 2 : pièce d'identité, réclamée tant qu'elle n'est pas renseignée
    if(typeof requireIdentity === 'function') requireIdentity();
    // le propriétaire est prévenu des alertes enregistrées depuis sa dernière visite
    if(typeof notifyOwnerOfNewAlerts === 'function') notifyOwnerOfNewAlerts();
  }

  function openPaywall(){
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
        (st.bonusDays > 0 ? ' (dont ' + st.bonusDays + ' offert' + (st.bonusDays > 1 ? 's' : '') + ' par le parrainage).' : '.');
      return;
    }
    ligne.textContent = 'Essai terminé. Un abonnement est nécessaire pour continuer.';
  }

  function refreshReferralProgress(){
    syncReferralBonus(function(sub){
      majPageAbonnement();
      const countEl = document.getElementById('referralCount');
      const availEl = document.getElementById('referralBonusDays');
      const spentEl = document.getElementById('referralNextIn');
      if(countEl) countEl.textContent = sub.referralCount || 0;
      if(availEl) availEl.textContent = getAvailableCredits(sub);
      if(spentEl) spentEl.textContent = sub.creditsSpent || 0;
      renderWallet();
    });
  }

  // ---------------- PORTEFEUILLE : vérification par correspondance nom/email ----------------
  const WALLET_SESSION_KEY = 'wallet_session_v1';
  const WALLET_PAYPAL_KEY = 'wallet_paypal_v1';
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

  function loadWalletPaypal(){
    try{ return JSON.parse(localStorage.getItem(WALLET_PAYPAL_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function saveWalletPaypal(data){
    try{
      if(data) localStorage.setItem(WALLET_PAYPAL_KEY, JSON.stringify(data));
      else localStorage.removeItem(WALLET_PAYPAL_KEY);
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

  document.getElementById('paypalConnectForm').addEventListener('submit', function(e){
    e.preventDefault();
    const statusEl = document.getElementById('paypalConnectStatus');
    const email = document.getElementById('paypalEmailInput').value.trim();
    if(!email){ return; }
    saveWalletPaypal({ email: email, connectedAt: new Date().toISOString() });
    document.getElementById('paypalEmailInput').value = '';
    if(statusEl) statusEl.textContent = 'Compte PayPal relié (' + email + ') ✓';
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
  const PAYOUT_DESTINATION_LABELS = {
    paypal: { label: 'Votre email PayPal', placeholder: 'vous@paypal.com' },
    card: { label: 'Votre compte bancaire (IBAN ou banque / agence / compte / clé)', placeholder: '00008 03016 05001514368 86' },
    mobile: { label: 'Votre numéro Mobile Money', placeholder: '034 00 000 00' },
    cash: {
      label: 'Nom exact sur votre pièce d\'identité, et où retirer',
      placeholder: 'RABE Koto — point Western Union, Antananarivo Analakely',
      link: 'Lien du point cash (facultatif)', needs: true
    },
    wallet: {
      label: 'Votre identifiant sur ce portefeuille',
      placeholder: 'Wise : vous@email.com · Payoneer : n° de compte',
      link: 'Lien du portefeuille', needs: true
    },
    merchant: {
      label: 'Le marchand et votre commande',
      placeholder: 'Ex : AliExpress — commande n° 812345, au nom de RABE Koto',
      link: 'Lien de la page à payer', needs: true
    }
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
    updateWalletConversion();
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
          'Il bouge d\'un jour à l\'autre — c\'est celui du moment du retrait qui compte.';
      }
    }, function(err){
      out.textContent = '—';
      if(note) note.textContent = err.message;
    });
  }

  const walletCurrencySelect = document.getElementById('walletCurrency');
  if(walletCurrencySelect) walletCurrencySelect.addEventListener('change', updateWalletConversion);

  // Le champ « où envoyer » change de sens selon le moyen choisi : un email
  // PayPal, un compte bancaire et un numéro Mobile Money ne se ressemblent pas.
  const payoutMethodSelect = document.getElementById('payoutMethod');
  function updatePayoutDestinationField(){
    if(!payoutMethodSelect) return;
    const conf = PAYOUT_DESTINATION_LABELS[payoutMethodSelect.value] || PAYOUT_DESTINATION_LABELS.paypal;
    const label = document.getElementById('payoutDestinationLabel');
    const input = document.getElementById('payoutDestination');
    if(label) label.textContent = conf.label;
    if(input) input.placeholder = conf.placeholder;

    // Lien et marche à suivre n'apparaissent que pour les canaux que
    // l'application ne sait pas exécuter d'elle-même.
    const linkField = document.getElementById('payoutLinkField');
    const linkLabel = document.getElementById('payoutLinkLabel');
    const instructionsField = document.getElementById('payoutInstructionsField');
    if(linkField) linkField.style.display = conf.needs ? 'block' : 'none';
    if(linkLabel && conf.link) linkLabel.textContent = conf.link;
    if(instructionsField) instructionsField.style.display = conf.needs ? 'block' : 'none';
  }
  if(payoutMethodSelect){
    payoutMethodSelect.addEventListener('change', updatePayoutDestinationField);
    updatePayoutDestinationField();
  }

  // Les canaux de sortie ont leurs propres noms : « wallet » veut dire
  // « un autre portefeuille » ici, pas « le portefeuille de l'application ».
  function payoutMethodLabel(method){
    if(method === 'card') return 'Compte bancaire / carte';
    if(method === 'mobile') return 'Mobile Money';
    if(method === 'cash') return 'Espèces — point cash';
    if(method === 'wallet') return 'Autre portefeuille';
    if(method === 'merchant') return 'Achat à l\'étranger';
    return 'PayPal';
  }

  function payoutStatusLabel(status){
    if(status === 'sent') return '<span style="color:var(--cyan);">Envoyé</span>';
    if(status === 'refused') return '<span style="color:var(--red, #e66);">Refusé — solde rendu</span>';
    return '<span style="color:var(--amber);">En attente d\'envoi</span>';
  }

  function renderPayoutList(){
    const list = document.getElementById('payoutList');
    const empty = document.getElementById('payoutEmpty');
    if(!list || !walletState) return;
    const rows = walletState.payouts || [];
    list.innerHTML = '';
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
    rows.forEach(function(r){
      const div = document.createElement('div');
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
      list.appendChild(div);
    });
  }

  const payoutRequestBtn = document.getElementById('payoutRequestBtn');
  if(payoutRequestBtn){
    payoutRequestBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('payoutStatus');
      const amount = Number(document.getElementById('payoutAmount').value) || 0;
      const method = document.getElementById('payoutMethod').value;
      const currency = document.getElementById('payoutCurrency').value;
      const destination = document.getElementById('payoutDestination').value.trim();
      if(!destination){ statusEl.textContent = 'Indiquez où envoyer l\'argent.'; return; }
      if(!(amount > 0)){ statusEl.textContent = 'Indiquez le montant à retirer.'; return; }

      payoutRequestBtn.disabled = true;
      statusEl.textContent = 'Envoi de la demande…';
      callWallet({
        action: 'payout', amountAr: amount, method: method, currency: currency,
        destination: destination, name: (currentUser && currentUser.name) || '',
        link: document.getElementById('payoutLink').value.trim(),
        instructions: document.getElementById('payoutInstructions').value.trim()
      }).then(function(res){
        payoutRequestBtn.disabled = false;
        document.getElementById('payoutAmount').value = '';
        const p = res.payout || {};
        const arrivee = p.amount_out && p.currency && p.currency !== 'MGA'
          ? ' (environ ' + Number(p.amount_out).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + p.currency + ')'
          : '';
        statusEl.textContent = 'Demande enregistrée : ' + formatWalletAr(amount) + arrivee +
          '. Le propriétaire est prévenu ; vous le serez dès que l\'argent est parti.';
        pushNotification('parrainage', 'Retrait demandé : ' + formatWalletAr(amount) + ' · ' +
          payoutMethodLabel(method) + '.');
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
    panel.style.display = 'block';

    const rows = walletState.queue || [];
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
      sentBtn.textContent = '✅ Argent envoyé';
      sentBtn.addEventListener('click', function(){
        if(!confirm('Avez-vous bien envoyé ' + arrivee + ' vers ' + r.destination + ' ?')) return;
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
      soldeEl.textContent = 'Solde : ' + formatWalletAr(state.balanceAr);
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
      buySiteItem(btn.getAttribute('data-item'), statusEl, btn)
        .then(function(){ refreshWalletFromServer(); }, function(){});
    });
  });

  // « Acheter hors du site » mène au formulaire de retrait, déjà réglé sur le
  // paiement d'un marchand : c'est la même sortie d'argent, pas une autre.
  const goToPayoutBtn = document.getElementById('goToPayoutBtn');
  if(goToPayoutBtn){
    goToPayoutBtn.addEventListener('click', function(){
      const method = document.getElementById('payoutMethod');
      if(method){
        method.value = 'merchant';
        method.dispatchEvent(new Event('change'));
      }
      const panel = document.getElementById('walletPayoutPanel');
      if(panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const dest = document.getElementById('payoutDestination');
      if(dest) dest.focus();
    });
  }

  const paywallWalletBtn = document.getElementById('paywallWalletBtn');
  if(paywallWalletBtn){
    paywallWalletBtn.addEventListener('click', function(){
      const statusEl = document.getElementById('paywallWalletStatus');
      const item = selectedPlan === 'annuel' ? 'sub_year' : 'sub_month';
      buySiteItem(item, statusEl, paywallWalletBtn).then(function(){ openApp(); }, function(){});
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
      pushNotification('parrainage', '💸 ' + (r.name || r.email) + ' demande un retrait de ' +
        formatWalletAr(r.amount_ar) + ' · ' + payoutMethodLabel(r.method) + '.');
    });
    try {
      localStorage.setItem(PAYOUT_QUEUE_SEEN_KEY,
        JSON.stringify(fresh.map(function(r){ return r.id; }).concat(seen).slice(0, 200)));
    } catch(e){}
  }

  // Le client peut avoir fermé la page entre la demande et l'envoi : à la
  // réouverture, on lui dit ce qui s'est passé pendant son absence.
  const PAYOUT_SEEN_KEY = 'stockmanager_payouts_seen';
  function notifySettledPayouts(rows){
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(PAYOUT_SEEN_KEY)) || []; } catch(e){}
    const fresh = (rows || []).filter(function(r){
      return r.status !== 'pending' && seen.indexOf(r.id) < 0;
    });
    if(!fresh.length) return;
    // Au tout premier passage on ne remonte pas l'historique entier.
    if(seen.length){
      fresh.forEach(function(r){
        pushNotification('parrainage', r.status === 'sent'
          ? '💸 Votre retrait de ' + formatWalletAr(r.amount_ar) + ' a été envoyé vers ' + r.destination + '.'
          : 'Votre retrait de ' + formatWalletAr(r.amount_ar) + ' a été refusé' +
            (r.note ? ' : ' + r.note : '') + '. Le solde vous a été rendu.');
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

    const paypal = loadWalletPaypal();
    const paypalStatusEl = document.getElementById('walletPaypalStatus');
    if(paypalStatusEl){
      paypalStatusEl.textContent = paypal && paypal.email ? paypal.email : 'Non relié';
    }

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
    if(!window.__sb) return;
    const row = { name: name, email: normEmail(email), phone: phone || '' };
    try{
      window.__sb.from('client_signups').insert(row).then(function(){}, function(){});
      window.__sb.from('contact_messages').insert({
        name: name + ' (nouvelle inscription)',
        email: normEmail(email),
        message: [
          'Nouvelle inscription à Gestion de Stockage :',
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

  // Le logo voyage dans les informations du compte : quelques kilo-octets une
  // fois réduit. Au-delà, on s'abstient plutôt que de faire échouer tout
  // l'enregistrement du profil — la copie locale, elle, reste en place.
  const LOGO_MAX_SERVER_CHARS = 200000;
  function logoForServer(logo){
    return (logo && logo.length <= LOGO_MAX_SERVER_CHARS) ? logo : null;
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
    // Compte créé avant que le logo ne suive le compte : cet appareil est le
    // seul à l'avoir, on en dépose la copie pour les suivants.
    const serverLogo = ((user && user.user_metadata) || {}).logo;
    if(currentUser.logo && !serverLogo){
      const auth = sbAuth();
      const copy = logoForServer(currentUser.logo);
      if(auth && copy) auth.updateUser({ data: { logo: copy } }).then(function(){}, function(){});
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
          status.textContent = (res && res.error)
            ? authErrorText(res.error)
            : 'Lien envoyé à ' + email + '. Regardez aussi dans les indésirables.';
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
        if(status) status.textContent = 'Lien envoyé à ' + email + '. Ouvrez le plus récent de vos emails : ' +
          'il ne vaut qu\'une heure et ne sert qu\'une fois. Regardez aussi dans les indésirables.';
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
      if(status) status.textContent = 'Envoi du lien…';

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
          if(status) status.textContent = 'Lien envoyé à ' + email + '. Ouvrez le plus récent de vos emails : ' +
            'le lien ne vaut qu\'une heure et ne sert qu\'une fois. Regardez aussi dans les indésirables.';
        }, function(){
          if(status) status.textContent = 'Envoi impossible : vérifiez votre réseau.';
        });
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
      if(event === 'PASSWORD_RECOVERY') showRecoveryBox();
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
  // Le déblocage se paie avec les crédits de parrainage du portefeuille. Rien
  // ne sort de l'application : les crédits passent du portefeuille du client à
  // celui du propriétaire, et l'accès se rouvre dans la foulée. Plus de somme
  // à envoyer au dehors, plus de référence à recopier, plus d'attente qu'un
  // humain constate l'arrivée de l'argent.
  const UNLOCK_COST_CREDITS = 20;
  // Valeur d'un parrainage en ariary. Le serveur a la sienne (AR_PER_REFERRAL) :
  // c'est celle-là qui fait foi pour le portefeuille. Ici, elle ne sert qu'à
  // écrire des sommes lisibles sur l'écran de connexion, où l'on ne peut pas
  // interroger le serveur — la personne n'est pas encore connectée.
  const AR_PER_CREDIT = 1000;

  // Les demandes d'avant ce changement portent encore leur ancien moyen de
  // paiement : le propriétaire doit pouvoir relire son historique.
  function paymentMethodLabel(method){
    if(method === 'wallet') return 'Crédits du portefeuille';
    if(method === 'card') return 'Carte Visa / Mastercard';
    if(method === 'bank') return 'Virement bancaire';
    if(method === 'mobile') return 'Mobile Money';
    return 'PayPal';
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
      name: name, email: normEmail(email), phone: '', message: 'Payé avec les crédits du portefeuille',
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
    noticeWaitsForWelcome = false;
    if(pending && showPending) showAutoNotice();
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
      text.innerHTML = 'Votre essai gratuit de <strong>7 jours</strong> est terminé. L\'accès est <strong>bloqué</strong> ' +
        'tant que le paiement (mensuel ou annuel) n\'est pas confirmé par le <strong>code de déverrouillage</strong> ' +
        'envoyé par email. Connectez-vous pour recevoir votre code.';
      closeBtn.style.display = 'none';
      loginBtn.style.display = 'block';
    } else {
      title.textContent = 'Essai gratuit & abonnement';
      text.innerHTML = 'L\'application est <strong>gratuite pendant 7 jours</strong>. Passé ce délai, un abonnement ' +
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
  const savedSession = loadSession();
  if(savedSession && savedSession.name && savedSession.email){
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
          showAutoNotice();
        }
      }, function(){ showAutoNotice(); });
    } else {
      // affichage automatique dès l'ouverture de la page (écran de connexion)
      showAutoNotice();
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
  });
  document.getElementById('planAnnuel').addEventListener('click', function(){
    selectedPlan = 'annuel';
    document.getElementById('planAnnuel').classList.add('selected');
    document.getElementById('planMensuel').classList.remove('selected');
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
          // Le clavier ne s'ouvre que là où l'on cherche : sur ordinateur, la
          // liste tient sous les yeux et le champ est masqué.
          if(champ && !flottantVisible()) champ.focus({ preventScroll: true });
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
    const IDS = ['navList', 'notifPanel', 'marketPanel', 'barReglages', 'fbComposer'];
    // Les pages qu'il ouvre. Elles remplaçaient le fil ; elles se posent
    // maintenant par-dessus, dans une fenêtre qu'on tire par les coins. Le fil
    // reste dessous : on n'ouvre pas une page pour perdre de vue d'où l'on
    // vient.
    //
    // L'Accueil en est une lui aussi. Restent dehors, autour d'elle : le nom
    // « Ny asako », la bannière d'essai et la rangée du bas.
    const PAGES = [
      'dash-accueil',
      'dash-articles', 'section-factures', 'section-inviter', 'section-contact',
      'section-live', 'section-appels', 'section-wallet', 'section-abonnement',
      'section-fond',
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
    function fermerFenetre(el){
      if(el && el.id === 'dash-accueil'){
        el.classList.remove('active');
        if(typeof saveLastView === 'function') saveLastView();
        return;
      }
      const navStock = document.querySelector('.nav-item[data-section="stock"]');
      if(navStock) navStock.click();
      if(typeof showDashView === 'function') showDashView('accueil');
      if(typeof saveLastView === 'function') saveLastView();
    }

    function synchroniser(){
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

    const publier = document.getElementById('postNewsBtn');
    if(publier){
      publier.addEventListener('click', function(){
        setTimeout(function(){
          const champ = document.getElementById('newsMessage');
          // Le champ vidé est le signe que l'envoi a réussi ; en cas d'échec le
          // message est encore là, et la boîte doit le rester aussi.
          if(champ && !champ.value.trim()){
            fermerComposer();
            // On montre le fil : sans cela, rien ne dit que le message est parti.
            if(typeof ouvrirDepuisLeMenu === 'function') ouvrirDepuisLeMenu('accueil');
          }
        }, 600);
      });
    }
  }

  // ---------------- LA VERSION AFFICHÉE ----------------
  // « C'est encore l'ancienne » et « c'est la nouvelle » se ressemblent trop
  // pour qu'on en discute à distance. Le menu porte l'empreinte de la version
  // installée : on la lit, on la compare, la question est close.
  //
  // Elle n'est écrite nulle part à la main — ce serait un chiffre de plus à
  // oublier. On la lit sur l'adresse du script, que le versionneur estampille
  // à chaque envoi avec l'empreinte de son contenu.
  // L'empreinte de la version qui tourne, lue sur l'adresse du script — le
  // versionneur l'y met à chaque envoi. Elle sert deux fois : à l'afficher, et
  // à savoir si celle du serveur a changé.
  const VERSION = (function(){
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
  (function(){
    if(!VERSION || !window.fetch) return;
    // Une fois par version, et pas davantage : si le rechargement ne suffit
    // pas, on n'y revient pas en boucle — mieux vaut une version en retard
    // qu'une page qui se recharge sans fin.
    const MARQUE = 'stockmanager_version_rechargee';
    const DELAI = 10 * 60 * 1000;
    let enCours = false;

    function dejaTentee(v){
      try{ return sessionStorage.getItem(MARQUE) === v; }catch(e){ return false; }
    }
    function noterTentative(v){
      try{ sessionStorage.setItem(MARQUE, v); }catch(e){}
    }
    function oublierTentative(){
      try{ sessionStorage.removeItem(MARQUE); }catch(e){}
    }

    function verifier(){
      if(enCours || document.hidden) return;
      enCours = true;
      fetch('/gestion-stockage.html', { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.text() : null; })
        .then(function(texte){
          if(!texte) return;
          const trouve = texte.match(/common\.js\?v=([a-f0-9]+)/);
          if(!trouve) return;
          const enLigne = trouve[1];
          if(enLigne === VERSION){ oublierTentative(); return; }
          if(dejaTentee(enLigne)) return;
          noterTentative(enLigne);
          // Les caches d'abord : sans cela le rechargement retrouverait les
          // mêmes fichiers, et l'on aurait tourné pour rien.
          const vider = window.caches
            ? caches.keys().then(function(noms){ return Promise.all(noms.map(function(n){ return caches.delete(n); })); })
            : Promise.resolve();
          return vider.catch(function(){}).then(function(){ location.reload(); });
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

    // L'entrée « Installer l'application » a été retirée du menu : le
    // navigateur propose l'installation lui-même, par l'icône de sa barre
    // d'adresse, et une entrée de plus dans une liste qu'on parcourt au pouce
    // ne valait pas de doubler ce qu'il fait déjà. Le manifeste et le service
    // worker restent — ce sont eux qui rendent l'application installable.
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
      }).filter(function(x){ return x && x.cle; });
    }
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
      ['notifPanel', 'marketPanel', 'fbComposer', 'barReglages'].forEach(function(id){
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
      });
      ['menuToggle', 'menuFlottant', 'notifToggle', 'marketToggle',
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
        : (cle === 'id:menuArticles' ? document.getElementById('dash-articles') : null);
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
      const reglages = document.getElementById('barReglagesBtn');
      if(reglages && reglages.parentElement === rangee) rangee.insertBefore(bouton, reglages);
      else rangee.appendChild(bouton);
    };

    function mesurer(){
      const deborde = rangee.scrollWidth > rangee.clientWidth;
      rangee.classList.toggle('pleine', deborde);
      const reste = rangee.scrollWidth - rangee.clientWidth - rangee.scrollLeft;
      rangee.classList.toggle('reste-a-droite', reste > 4);
      // Et ce qui reste derrière : sans quoi rien ne dit qu'on peut revenir.
      rangee.classList.toggle('reste-a-gauche', rangee.scrollLeft > 4);
    }

    // En automatique, la rangée se tient à six : la plus anciennement ouverte
    // s'efface pour la nouvelle. En manuel, rien ne part sans qu'on le dise.
    function elaguer(){
      if(lireMode() !== 'auto') return;
      let liste = lireEpingles();
      if(liste.length <= GARDEES) return;
      liste.sort(function(a, b){ return (b.vu || 0) - (a.vu || 0); });
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

    function epingler(entree){
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
      const hors = ['navStock'];
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

    // Chaque icône reprend la place qu'on lui a donnée. Appelé à l'ouverture,
    // puis une fois la page complète : le premier passage tombe souvent avant
    // que la rangée du bas ait une hauteur.
    function replacerLesIcones(){
      const liste = lireBureau();
      [].slice.call(document.querySelectorAll('.icone-bureau')).forEach(function(el){
        const e = liste.filter(function(i){ return i.cle === el.dataset.cle; })[0];
        if(e) placerIcone(el, e.x, e.y);
      });
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
      if(bouton.id === 'menuToggle' || bouton.id === 'barReglagesBtn') return;
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
        const entree = {
          cle: cle,
          x: ev.clientX / window.innerWidth,
          y: ev.clientY / window.innerHeight
        };
        ecrireBureau(lireBureau().filter(function(i){ return i.cle !== cle; }).concat([entree]));
        const pose = dessinerIcone(entree);
        // C'est la place où elle s'est posée qu'on retient, et non le point du
        // lâcher : lâchée au bord, elle est ramenée dans le cadre, et garder
        // le point brut la ferait réapparaître ailleurs sur un autre écran.
        if(pose){
          const r2 = pose.getBoundingClientRect();
          ecrireBureau(lireBureau().map(function(i){
            return i.cle === cle
              ? { cle: cle, x: r2.left / window.innerWidth, y: r2.top / window.innerHeight }
              : i;
          }));
        }
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
          placerIcone(el, (ev.clientX - dx) / window.innerWidth, (ev.clientY - dy) / window.innerHeight);
          const r2 = el.getBoundingClientRect();
          const liste = lireBureau().map(function(i){
            return i.cle === cle
              ? { cle: cle, x: r2.left / window.innerWidth, y: r2.top / window.innerHeight }
              : i;
          });
          ecrireBureau(liste);
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
        epingler(entree);
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
        var mp = document.getElementById('marketPanel');
        if(mp){
          mp.style.display = 'none';
          var mt = document.getElementById('marketToggle');
          if(mt) mt.setAttribute('aria-expanded', 'false');
        }
        // marque tout comme lu à l'ouverture
        var list = loadNotifications();
        list.forEach(function(n){ n.read = true; });
        saveNotifications(list);
        renderNotifications();
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
  // Achats internationaux : panneau déroulant de la barre du haut (icône 🌍),
  // même comportement que la cloche de notifications.
  var marketToggle = document.getElementById('marketToggle');
  var marketPanel = document.getElementById('marketPanel');
  if(marketToggle && marketPanel){
    // Range dans le menu, le panneau serait rogne par la liste qui defile :
    // il flotte donc lui aussi, a cote du bouton.
    document.body.appendChild(marketPanel);
    marketPanel.style.position = 'fixed';
    marketPanel.style.right = 'auto';
    marketPanel.style.zIndex = '130';

    marketToggle.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = marketPanel.style.display === 'block';
      marketPanel.style.display = isOpen ? 'none' : 'block';
      marketToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if(!isOpen){
        // Le menu s'efface : les deux listes se recouvriraient sinon.
        if(navList){
          navList.classList.remove('open');
          menuToggle.setAttribute('aria-expanded', 'false');
        }
        placerPresDuMenu(marketPanel);
        // une seule liste ouverte à la fois
        if(notifPanel){
          notifPanel.style.display = 'none';
          if(notifToggle) notifToggle.setAttribute('aria-expanded', 'false');
        }
        if(typeof renderMarketplaceLinks === 'function') renderMarketplaceLinks();
      }
    });
    document.addEventListener('click', function(e){
      // .contains et non !== : le bouton porte maintenant un libelle, et
      // c'est lui que le clic designe.
      if(marketPanel.style.display === 'block' && !marketPanel.contains(e.target) && !marketToggle.contains(e.target)){
        marketPanel.style.display = 'none';
        marketToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var notifClearBtn = document.getElementById('notifClearBtn');
  if(notifClearBtn){
    notifClearBtn.addEventListener('click', function(e){
      e.stopPropagation();
      saveNotifications([]);
      renderNotifications();
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
      if(nav.dataset.section === 'live') renderLiveList();
      if(nav.dataset.section === 'appels') renderOnlineClientsForCall();
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
  function updateSubTabsVisibility(){
    const surLAccueil = vueAffichee() === 'accueil';
    const subTabs = document.getElementById('stockSubTabs');
    if(subTabs) subTabs.style.display = surLAccueil ? 'none' : '';
    const recherche = document.querySelector('#section-stock .global-search');
    if(recherche) recherche.style.display = surLAccueil ? 'none' : '';
  }
  updateSubTabsVisibility();

  // « Acheter » n'a plus d'onglet : on y entre depuis une annonce de l'Accueil.
  // Il faut donc pouvoir montrer une vue sans qu'un onglet la porte.
  // Chaque vue redessine ce qui lui appartient. Deux chemins y mènent
  // maintenant — les onglets restants et les entrées du menu — et une vue
  // ouverte sans être redessinée montre l'état d'avant.
  function rafraichirVue(nom){
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
    const view = document.getElementById('dash-' + nom);
    if(!view) return false;
    document.querySelectorAll('.dash-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.dash-view').forEach(function(v){ v.classList.remove('active'); });
    view.classList.add('active');
    const tab = document.querySelector('.dash-tab[data-dash="' + nom + '"]');
    if(tab) tab.classList.add('active');
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
      tab.classList.add('active');
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
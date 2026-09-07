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
  // navoakan'ilay appareil ity. 1 parrainage = 1 crédit ao amin'ny portefeuille ;
  // ny mpampiasa mihitsy no misafidy hoe ampiasaina amin'inona ireo crédit ireo
  // (jereo redeemCredits plus bas), tsy mifanova ho andro automatique intsony.
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

  // ---------------- PORTEFEUILLE : dépense des crédits ----------------
  const WALLET_COST_TRIAL = 10;    // 10 crédits = +1 jour d'essai gratuit
  const WALLET_COST_BOOSTER = 5;   // 5 crédits = Live Facebook débloqué 24h
  const WALLET_COST_SUB = 20;      // 20 crédits = +7 jours bancarisés pour l'abonnement
  const WALLET_SUB_DAYS = 7;
  const WALLET_BOOSTER_HOURS = 24;

  function redeemCredits(type){
    const sub = ensureInstallDate();
    const available = getAvailableCredits(sub);
    const statusEl = document.getElementById('walletRedeemStatus');
    let cost = 0;

    if(type === 'trial'){
      cost = WALLET_COST_TRIAL;
      if(available < cost){ if(statusEl) statusEl.textContent = 'Crédits insuffisants (' + cost + ' requis).'; return; }
      sub.bonusDays = (sub.bonusDays || 0) + 1;
      sub.creditsSpent = (sub.creditsSpent || 0) + cost;
      saveSubscription(sub);
      updateTrialBanner();
      pushNotification('parrainage', '1 jour d\'essai gratuit ajouté grâce à vos crédits de parrainage.');
      if(statusEl) statusEl.textContent = '+1 jour ajouté à votre essai gratuit ✓';
    } else if(type === 'booster'){
      cost = WALLET_COST_BOOSTER;
      if(available < cost){ if(statusEl) statusEl.textContent = 'Crédits insuffisants (' + cost + ' requis).'; return; }
      sub.boosterActiveUntil = new Date(Date.now() + WALLET_BOOSTER_HOURS * 60 * 60 * 1000).toISOString();
      sub.creditsSpent = (sub.creditsSpent || 0) + cost;
      saveSubscription(sub);
      pushNotification('parrainage', 'Booster activé : vous pouvez passer en direct sur Facebook pendant 24h.');
      if(statusEl) statusEl.textContent = 'Booster activé pour 24h ✓';
    } else if(type === 'sub'){
      cost = WALLET_COST_SUB;
      if(available < cost){ if(statusEl) statusEl.textContent = 'Crédits insuffisants (' + cost + ' requis).'; return; }
      sub.subscriptionCreditDays = (sub.subscriptionCreditDays || 0) + WALLET_SUB_DAYS;
      sub.creditsSpent = (sub.creditsSpent || 0) + cost;
      saveSubscription(sub);
      pushNotification('parrainage', WALLET_SUB_DAYS + ' jours bancarisés pour votre prochain abonnement.');
      if(statusEl) statusEl.textContent = '+' + WALLET_SUB_DAYS + ' jours bancarisés pour l\'abonnement ✓';
    }
    renderWallet();
  }

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
      const tab = document.querySelector('.dash-tab.active');
      localStorage.setItem(STORAGE_LAST_VIEW, JSON.stringify({
        section: nav ? nav.dataset.section : null,
        dash: tab ? tab.dataset.dash : null
      }));
    }catch(e){}
  }
  function restoreLastView(){
    let view = null;
    try{ view = JSON.parse(localStorage.getItem(STORAGE_LAST_VIEW)) || null; }catch(e){}
    if(!view) return;
    if(view.section){
      const nav = document.querySelector('.nav-item[data-section="' + view.section + '"]');
      if(nav && !nav.classList.contains('active')) nav.click();
    }
    if(view.dash){
      const tab = document.querySelector('.dash-tab[data-dash="' + view.dash + '"]');
      if(tab && !tab.classList.contains('active')) tab.click();
    }
    if(typeof updateSubTabsVisibility === 'function') updateSubTabsVisibility();
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
    updateTrialBanner();
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
  }

  function updateTrialBanner(){
    const st = getSubscriptionStatus();
    const banner = document.getElementById('trialBanner');
    if(st.status === 'trial'){
      banner.style.display = 'flex';
      document.getElementById('trialDaysLeft').textContent = st.daysLeft;
      const bonusEl = document.getElementById('trialBonusNote');
      if(bonusEl){
        bonusEl.textContent = st.bonusDays > 0
          ? ('dia ' + st.bonusDays + ' andro fanampiny avy amin\'ny parrainage no efa tafiditra')
          : '';
        bonusEl.style.display = st.bonusDays > 0 ? 'inline' : 'none';
      }
    } else {
      banner.style.display = 'none';
    }
  }

  function refreshReferralProgress(){
    syncReferralBonus(function(sub){
      updateTrialBanner();
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
    document.getElementById('walletBalance').textContent = getAvailableCredits(sub);

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
      if(opts && opts.restoreView) restoreLastView();
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
    const balanceEl = document.getElementById('unlockWalletBalance');
    const costEl = document.getElementById('unlockWalletCost');
    if(costEl) costEl.textContent = UNLOCK_COST_CREDITS + ' crédits';
    if(!balanceEl) return;
    balanceEl.textContent = getAvailableCredits(ensureInstallDate());
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
        statusEl.textContent = 'Il vous manque ' + manque + ' crédit' + (manque > 1 ? 's' : '') +
          ' : vous en avez ' + available + ' sur les ' + UNLOCK_COST_CREDITS + ' demandés. ' +
          'Chaque personne qui ouvre l\'application avec votre lien d\'invitation vous en rapporte un.';
        renderUnlockWallet();
        return;
      }

      sub.creditsSpent = (sub.creditsSpent || 0) + UNLOCK_COST_CREDITS;
      saveSubscription(sub);
      renderUnlockWallet();
      recordWalletUnlock(name, email);

      statusEl.textContent = UNLOCK_COST_CREDITS + ' crédits retirés de votre portefeuille ✓ Accès rétabli.';
      pushNotification('parrainage', 'Déblocage payé avec ' + UNLOCK_COST_CREDITS +
        ' crédits de votre portefeuille — accès rétabli.');
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
          // entrées forcées : au-delà du seuil, le compte est bloqué
          if(typeof noteFailedAttempt === 'function') noteFailedAttempt(email);
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

  document.getElementById('subscribeNowBtn').addEventListener('click', function(){
    openPaywall();
  });

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
        restoreLastView();
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
  document.getElementById('redeemTrialBtn').addEventListener('click', function(){ redeemCredits('trial'); });
  document.getElementById('redeemBoosterBtn').addEventListener('click', function(){ redeemCredits('booster'); });
  document.getElementById('redeemSubBtn').addEventListener('click', function(){ redeemCredits('sub'); });
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
  var menuToggle = document.getElementById('menuToggle');
  var navList = document.getElementById('navList');
  if(menuToggle && navList){
    menuToggle.addEventListener('click', function(){
      var isOpen = navList.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      menuToggle.textContent = isOpen ? '✕' : '☰';
      updateTopbarHeight();
    });
  }

  // ---------------- NOTIFICATIONS ----------------
  var notifToggle = document.getElementById('notifToggle');
  var notifPanel = document.getElementById('notifPanel');
  if(notifToggle && notifPanel){
    notifToggle.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = notifPanel.style.display === 'block';
      notifPanel.style.display = isOpen ? 'none' : 'block';
      notifToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if(!isOpen){
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
      if(notifPanel.style.display === 'block' && !notifPanel.contains(e.target) && e.target !== notifToggle){
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
    marketToggle.addEventListener('click', function(e){
      e.stopPropagation();
      var isOpen = marketPanel.style.display === 'block';
      marketPanel.style.display = isOpen ? 'none' : 'block';
      marketToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if(!isOpen){
        // une seule liste ouverte à la fois
        if(notifPanel){
          notifPanel.style.display = 'none';
          if(notifToggle) notifToggle.setAttribute('aria-expanded', 'false');
        }
        if(typeof renderMarketplaceLinks === 'function') renderMarketplaceLinks();
      }
    });
    document.addEventListener('click', function(e){
      if(marketPanel.style.display === 'block' && !marketPanel.contains(e.target) && e.target !== marketToggle){
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
      if(nav.dataset.section === 'live'){
        renderOnlineClientsForCall();
        renderLiveList();
        if(typeof renderNotifOptIn === 'function') renderNotifOptIn();
      }
      // ferme le menu mobile après avoir choisi une section
      if(navList && navList.classList.contains('open')){
        navList.classList.remove('open');
        if(menuToggle){ menuToggle.textContent = '☰'; menuToggle.setAttribute('aria-expanded','false'); }
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

  // Les onglets secondaires (Tableau de bord, Historique, Ajouter, Vente...)
  // ne sont utiles qu'une fois dans « Articles » : on les masque sur l'Accueil.
  function updateSubTabsVisibility(){
    const subTabs = document.getElementById('stockSubTabs');
    if(!subTabs) return;
    const active = document.querySelector('.dash-tab.active');
    const dash = active ? active.dataset.dash : 'accueil';
    subTabs.style.display = dash === 'accueil' ? 'none' : '';
  }
  updateSubTabsVisibility();

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
      if(tab.dataset.dash === 'dashboard'){ renderFilters(); renderDashboard(); }
      if(tab.dataset.dash === 'accueil'){ renderCommunityPanel(); }
      // Historique / Ajouter : averina soratana mba ho mifanaraka amin'ny vente
      // sy ny achat vao vita (état du stock sy mouvements tsy ho tara).
      if(tab.dataset.dash === 'historique'){
        if(typeof renderMovementsHistory === 'function') renderMovementsHistory();
      }
      if(tab.dataset.dash === 'ajouter'){
        if(typeof renderStock === 'function') renderStock();
      }
      if(tab.dataset.dash === 'articles'){
        if(typeof renderStock === 'function') renderStock();
      }
      if(tab.dataset.dash === 'vente'){
        if(typeof populateVenteItemSelect === 'function') populateVenteItemSelect();
        if(typeof populateVenteClientSelect === 'function') populateVenteClientSelect();
        if(typeof updateVenteInfo === 'function') updateVenteInfo();
      }
      if(tab.dataset.dash === 'acheter'){
        if(typeof populateAcheterItemSelect === 'function') populateAcheterItemSelect();
      }
      if(tab.dataset.dash === 'comptes'){
        if(typeof renderClientsList === 'function') renderClientsList();
      }
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
    if(tab && !tab.classList.contains('active')) tab.click();
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
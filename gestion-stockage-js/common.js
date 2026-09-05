const STORAGE_ITEMS = 'stockmanager_items';
  const STORAGE_LOGINS = 'stockmanager_logins';
  const STORAGE_MOVEMENTS = 'stockmanager_movements';
  const STORAGE_SUBSCRIPTION = 'stockmanager_subscription';
  const STORAGE_PROFILES = 'stockmanager_profiles';
  const STORAGE_CLIENT_CODES = 'stockmanager_client_codes';
  const CODE_VALID_MS = 30 * 60 * 1000; // 30 minutes
  const CODE_MAX_ATTEMPTS = 3;
  const OWNER_EMAIL = 'rasolofonirainytokiniaina@gmail.com';
  const TRIAL_DAYS = 90;
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
      'Merci de vérifier la réception du paiement puis de communiquer ce code à ce client.'
    );
    window.location.href = 'mailto:' + OWNER_EMAIL + '?subject=' + subject + '&body=' + body;
    return code;
  }

  function loadProfiles(){
    try { return JSON.parse(localStorage.getItem(STORAGE_PROFILES)) || {}; }
    catch(e){ return {}; }
  }
  function saveProfiles(profiles){ localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles)); }
  function findProfile(name){
    const profiles = loadProfiles();
    return profiles[name.trim().toLowerCase()] || null;
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
    loginScreen.style.display = 'none';
    paywallScreen.style.display = 'none';
    appScreen.style.display = 'block';

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
    renderWallet();
    initPresence();
    initCallSignaling();
    initLiveSignaling();
  }

  function openPaywall(){
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

  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    const name = document.getElementById('loginName').value.trim();
    const email = document.getElementById('loginEmail').value.trim();
    const phoneInput = document.getElementById('loginPhone').value.trim();
    const logoFile = document.getElementById('loginLogo').files[0];
    if(!name || !email) return;

    const existingProfile = findProfile(name);
    if(!existingProfile && !logoFile){
      alert('Veuillez ajouter un logo pour votre première connexion.');
      return;
    }
    const phone = phoneInput || (existingProfile ? existingProfile.phone : '');
    if(!phone){ alert('Veuillez indiquer votre numéro de téléphone.'); return; }

    function finishLogin(logoDataUrl){
      const logo = logoDataUrl || (existingProfile ? existingProfile.logo : null);
      currentUser = {
        name, email, phone, logo: logo,
        company: existingProfile ? (existingProfile.company || '') : '',
        nif: existingProfile ? (existingProfile.nif || '') : '',
        stat: existingProfile ? (existingProfile.stat || '') : ''
      };
      upsertProfile(name, { name, email, phone, logo: logo, company: currentUser.company, nif: currentUser.nif, stat: currentUser.stat });

      const logins = loadLogins();
      logins.unshift({ name, email, phone, date: new Date().toLocaleString('fr-FR') });
      saveLogins(logins);

      document.getElementById('currentUserName').textContent = name;
      document.getElementById('currentUserEmail').textContent = email;

      const st = getSubscriptionStatus();
      if(st.status === 'expired'){
        openPaywall();
      } else {
        openApp();
      }
    }

    if(logoFile){
      const reader = new FileReader();
      reader.onload = function(ev){ finishLogin(ev.target.result); };
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
      upsertProfile(name, { name, company, email, phone, nif, stat, logo: logo });
      document.getElementById('currentUserName').textContent = name;
      document.getElementById('currentUserEmail').textContent = email;
      document.getElementById('profileLogo').value = '';
      updateProfilePhotoPreview(logo);
      const status = document.getElementById('profileSaveStatus');
      status.textContent = 'Profil enregistré.';
      setTimeout(function(){ status.textContent = ''; }, 3000);
    }

    if(logoFile){
      const reader = new FileReader();
      reader.onload = function(ev){ finishSave(ev.target.result); };
      reader.onerror = function(){ finishSave(null); };
      reader.readAsDataURL(logoFile);
    } else {
      finishSave(null);
    }
  });

  function showAutoNotice(){
    const st = getSubscriptionStatus();
    const modal = document.getElementById('autoNoticeModal');
    const closeBtn = document.getElementById('autoNoticeClose');
    const loginBtn = document.getElementById('autoNoticeLoginBtn');
    const title = document.getElementById('autoNoticeTitle');
    const text = document.getElementById('autoNoticeText');

    if(st.status === 'expired'){
      title.textContent = 'Abonnement requis';
      text.innerHTML = 'Votre essai gratuit de <strong>3 mois</strong> est terminé. L\'accès est <strong>bloqué</strong> ' +
        'tant que le paiement (mensuel ou annuel) n\'est pas confirmé par le <strong>code de déverrouillage</strong> ' +
        'envoyé par email. Connectez-vous pour recevoir votre code.';
      closeBtn.style.display = 'none';
      loginBtn.style.display = 'block';
    } else {
      title.textContent = 'Essai gratuit & abonnement';
      text.innerHTML = 'L\'application est <strong>gratuite pendant 3 mois</strong>. Passé ce délai, un abonnement ' +
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
    document.getElementById('loginName').focus();
  });

  document.getElementById('logoutBtn').addEventListener('click', function(){
    teardownRealtimeFeatures();
    currentUser = null;
    appScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    showAutoNotice();
  });

  document.getElementById('paywallLogoutBtn').addEventListener('click', function(){
    currentUser = null;
    paywallScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    showAutoNotice();
  });

  document.getElementById('subscribeNowBtn').addEventListener('click', function(){
    openPaywall();
  });

  // affichage automatique dès l'ouverture de la page (écran de connexion)
  showAutoNotice();
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
      if(nav.dataset.section === 'live'){ renderOnlineClientsForCall(); renderLiveList(); }
      // ferme le menu mobile après avoir choisi une section
      if(navList && navList.classList.contains('open')){
        navList.classList.remove('open');
        if(menuToggle){ menuToggle.textContent = '☰'; menuToggle.setAttribute('aria-expanded','false'); }
      }
    });
  });

  document.querySelectorAll('.dash-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('dash-' + tab.dataset.dash).classList.add('active');
      if(tab.dataset.dash === 'dashboard'){ renderFilters(); renderDashboard(); }
      if(tab.dataset.dash === 'accueil'){ renderCommunityPanel(); }
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
        goToStockSection('articles');
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
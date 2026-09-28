  // ==================== GESTION DE COMPTE (clients + dette/crédit) ====================
  // Plusieurs onglets « Gestion de compte » : le premier (vue comptes,
  // identifiants clientName, addClientBtn...) et ceux que le + ouvre à côté
  // (comptes2, comptes3... : les mêmes identifiants suivis du numéro). Chacun
  // a sa propre liste de clients et son nom (✏️, comme les « Nouvel
  // article », dans la même table de noms). Les ventes à crédit, rattachées à
  // un client par son identifiant, restent dans une seule liste.
  const COMPTES = [''];
  const CLE_ONGLETS_COMPTES = 'stockmanager_onglets_comptes';
  // Un numéro donné ne revient jamais : la liste d'un onglet refermé ne
  // réapparaît pas dans un onglet ouvert plus tard.
  const CLE_DERNIER_COMPTE = 'stockmanager_onglets_comptes_dernier';

  function cleClients(sfx){ return STORAGE_CLIENTS + '_compte' + sfx; }
  function lireClients(sfx){
    if(!sfx) return loadClients();
    try { return JSON.parse(localStorage.getItem(cleClients(sfx))) || []; }
    catch(e){ return []; }
  }
  function ecrireClients(sfx, list){
    if(!sfx) return saveClients(list);
    localStorage.setItem(cleClients(sfx), JSON.stringify(list));
  }
  function elCompte(id, sfx){ return document.getElementById(id + sfx); }

  function getClientDebt(clientId){
    return loadCreditSales()
      .filter(function(s){ return s.clientId === clientId && !s.paid; })
      .reduce(function(sum, s){ return sum + s.total; }, 0);
  }

  // Le client dont le détail est ouvert, onglet par onglet.
  const clientOuvert = {};

  function renderClientsList(){
    COMPTES.forEach(renderClientsDe);
  }

  function renderClientsDe(sfx){
    const tbody = elCompte('clientsTableBody', sfx);
    if(!tbody) return;
    const clients = lireClients(sfx);
    tbody.innerHTML = '';
    elCompte('clientsEmptyHint', sfx).style.display = clients.length ? 'none' : 'block';
    clients.forEach(function(c){
      const debt = getClientDebt(c.id);
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(c.name) + '</td>' +
        '<td>' + escapeHtml(c.phone || '—') + '</td>' +
        '<td>' + (debt > 0 ? '<span class="badge-danger">' + formatAr(debt) + '</span>' : formatAr(0)) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-violet btn-sm" data-view-client="' + c.id + '" style="margin-right:0.35rem;">Voir</button>' +
          '<button class="btn btn-red btn-icon" data-del-client="' + c.id + '" title="Supprimer">🗑️</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-view-client]').forEach(function(btn){
      btn.addEventListener('click', function(){ openClientDetail(sfx, btn.dataset.viewClient); });
    });
    tbody.querySelectorAll('[data-del-client]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('Hofafana io client io? (Ny dette efa tsy voaloa dia hijanona amin\'ny fitantanana.)')) return;
        const remaining = lireClients(sfx).filter(function(c){ return c.id !== btn.dataset.delClient; });
        ecrireClients(sfx, remaining);
        if(clientOuvert[sfx] === btn.dataset.delClient){
          clientOuvert[sfx] = null;
          elCompte('clientDetailPanel', sfx).style.display = 'none';
        }
        renderClientsDe(sfx);
      });
    });
  }

  function openClientDetail(sfx, clientId){
    clientOuvert[sfx] = clientId;
    const client = lireClients(sfx).find(function(c){ return c.id === clientId; });
    if(!client) return;
    elCompte('clientDetailPanel', sfx).style.display = 'block';
    elCompte('clientDetailName', sfx).textContent = '👤 ' + client.name + (client.phone ? ' — ' + client.phone : '');
    renderClientSales(sfx);
  }

  function renderClientSales(sfx){
    const tbody = elCompte('clientSalesTableBody', sfx);
    const ouvert = clientOuvert[sfx];
    if(!tbody || !ouvert) return;
    const sales = loadCreditSales()
      .filter(function(s){ return s.clientId === ouvert; })
      .sort(function(a, b){ return new Date(b.date) - new Date(a.date); });
    tbody.innerHTML = '';
    elCompte('clientSalesEmptyHint', sfx).style.display = sales.length ? 'none' : 'block';
    sales.forEach(function(s){
      const tr = document.createElement('tr');
      const d = new Date(s.date);
      tr.innerHTML =
        '<td>' + d.toLocaleDateString('fr-FR') + '</td>' +
        '<td>' + escapeHtml(s.itemName) + '</td>' +
        '<td>' + s.qty + '</td>' +
        '<td>' + formatAr(s.total) + '</td>' +
        '<td>' + (s.paid ? '<span style="color:#6ee7b7;">Voaloa</span>' : '<span class="badge-warn">Tsy voaloa</span>') + '</td>' +
        '<td>' + (s.paid ? '' : '<button class="btn btn-primary btn-sm" data-pay-sale="' + s.id + '">Marquer payé</button>') + '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-pay-sale]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const sales2 = loadCreditSales();
        const sale = sales2.find(function(s){ return s.id === btn.dataset.paySale; });
        if(sale){
          sale.paid = true;
          sale.paidDate = new Date().toISOString();
          saveCreditSales(sales2);
        }
        renderClientSales(sfx);
        renderClientsDe(sfx);
      });
    });
  }

  function brancherCompte(sfx){
    const ajouter = elCompte('addClientBtn', sfx);
    if(ajouter){
      ajouter.addEventListener('click', function(){
        const name = elCompte('clientName', sfx).value.trim();
        const phone = elCompte('clientPhone', sfx).value.trim();
        if(!name) return;
        const clients = lireClients(sfx);
        clients.push({ id: genId(), name: name, phone: phone });
        ecrireClients(sfx, clients);
        elCompte('clientName', sfx).value = '';
        elCompte('clientPhone', sfx).value = '';
        renderClientsDe(sfx);
      });
    }
    const fermer = elCompte('closeClientDetailBtn', sfx);
    if(fermer){
      fermer.addEventListener('click', function(){
        clientOuvert[sfx] = null;
        elCompte('clientDetailPanel', sfx).style.display = 'none';
      });
    }
  }
  brancherCompte('');

  // ---- Les onglets « Gestion de compte » : le +, le ✏️, le ✕ ----
  function lireOngletsComptes(){
    try{
      const v = JSON.parse(localStorage.getItem(CLE_ONGLETS_COMPTES) || '[]');
      return Array.isArray(v) ? v.filter(function(n){ return Number.isInteger(n) && n >= 2; }) : [];
    }catch(e){ return []; }
  }
  function ecrireOngletsComptes(){
    const nums = COMPTES.filter(Boolean).map(Number);
    try{ localStorage.setItem(CLE_ONGLETS_COMPTES, JSON.stringify(nums)); }catch(e){}
  }
  function prochainNumeroCompte(){
    let num = 2;
    try{ num = Math.max(num, (parseInt(localStorage.getItem(CLE_DERNIER_COMPTE), 10) || 0) + 1); }catch(e){}
    COMPTES.forEach(function(sfx){ if(sfx && Number(sfx) >= num) num = Number(sfx) + 1; });
    try{ localStorage.setItem(CLE_DERNIER_COMPTE, String(num)); }catch(e){}
    return num;
  }

  // Les noms (onglets et titre du formulaire) suivent ceux choisis au ✏️ ;
  // sans nom : « 👥 Gestion de compte », « 👥 Gestion de compte 2 »...
  // stock.js l'appelle après chaque renommage.
  function majOngletsComptes(){
    const noms = lireNomsNouveau();
    COMPTES.forEach(function(sfx, i){
      const vue = 'comptes' + sfx;
      const nom = noms[vue] || ('👥 Gestion de compte' + (i ? ' ' + (i + 1) : ''));
      document.querySelectorAll('.dash-tab[data-dash="' + vue + '"] .onglet-nom').forEach(function(el){
        el.textContent = nom;
      });
      const titre = document.querySelector('#dash-' + vue + ' h3');
      if(titre) titre.textContent = noms[vue] ? '👥 ' + noms[vue] + ' — Ajouter un client' : '👥 Ajouter un client';
    });
  }

  function creerOngletCompte(num){
    const modele = document.getElementById('dash-comptes');
    if(!modele || document.getElementById('dash-comptes' + num)) return;
    const sfx = String(num);
    const vue = modele.cloneNode(true);
    vue.id = 'dash-comptes' + num;
    vue.classList.remove('active');
    vue.querySelectorAll('[id]').forEach(function(el){ el.id = el.id + num; });
    vue.querySelectorAll('input').forEach(function(el){ el.value = ''; });
    vue.querySelectorAll('tbody').forEach(function(el){ el.innerHTML = ''; });
    const detail = vue.querySelector('#clientDetailPanel' + num);
    if(detail) detail.style.display = 'none';
    const vues = document.querySelectorAll('[id^="dash-comptes"]');
    vues[vues.length - 1].after(vue);

    document.querySelectorAll('.onglet-plus-compte').forEach(function(plus){
      const onglet = document.createElement('div');
      onglet.className = 'dash-tab';
      onglet.dataset.dash = 'comptes' + num;
      onglet.innerHTML = '<span class="onglet-nom"></span>' +
        ' <span class="onglet-fermer" title="Hidio" aria-label="Hidio">✕</span>';
      ajouterCrayon(onglet);
      onglet.addEventListener('click', function(e){
        if(e.target.closest('.onglet-fermer')){ fermerOngletCompte(num); return; }
        ouvrirVue('comptes' + num);
      });
      plus.before(onglet);
    });

    COMPTES.push(sfx);
    brancherCompte(sfx);
    renderClientsDe(sfx);
    majOngletsComptes();
    ecrireOngletsComptes();
  }

  // Ses clients restent enregistrés : seul l'onglet s'en va.
  function fermerOngletCompte(num){
    const sfx = String(num);
    const combien = lireClients(sfx).length;
    if(combien && !confirm('Misy client ' + combien + ' ao amin\'ity onglet ity. Hidio ve ?')) return;
    const vue = document.getElementById('dash-comptes' + num);
    const etaitAffichee = vue && vue.classList.contains('active');
    if(vue) vue.remove();
    document.querySelectorAll('.dash-tab[data-dash="comptes' + num + '"]').forEach(function(t){ t.remove(); });
    const noms = lireNomsNouveau();
    if(noms['comptes' + num]){ delete noms['comptes' + num]; ecrireNomsNouveau(noms); }
    const i = COMPTES.indexOf(sfx);
    if(i >= 0) COMPTES.splice(i, 1);
    delete clientOuvert[sfx];
    majOngletsComptes();
    ecrireOngletsComptes();
    if(etaitAffichee) ouvrirVue('comptes');
  }

  document.querySelectorAll('.dash-tab[data-dash="comptes"]').forEach(function(onglet){
    onglet.innerHTML = '<span class="onglet-nom">' + onglet.innerHTML + '</span>';
    ajouterCrayon(onglet);
    const plus = document.createElement('div');
    plus.className = 'dash-tab onglet-plus-compte';
    plus.textContent = '+';
    plus.title = 'Gestion de compte hafa';
    plus.setAttribute('role', 'button');
    plus.setAttribute('aria-label', 'Sokafy onglet Gestion de compte hafa');
    // L'onglet s'ouvre, et son nom s'écrit tout de suite.
    plus.addEventListener('click', function(){
      const num = prochainNumeroCompte();
      creerOngletCompte(num);
      ouvrirVue('comptes' + num);
      renommerOngletNouveau('comptes' + num);
    });
    onglet.after(plus);
  });
  lireOngletsComptes().forEach(creerOngletCompte);
  majOngletsComptes();

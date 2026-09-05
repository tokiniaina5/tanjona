  // ==================== GESTION DE COMPTE (clients + dette/crédit) ====================
  function getClientDebt(clientId){
    return loadCreditSales()
      .filter(function(s){ return s.clientId === clientId && !s.paid; })
      .reduce(function(sum, s){ return sum + s.total; }, 0);
  }

  function renderClientsList(){
    const tbody = document.getElementById('clientsTableBody');
    if(!tbody) return;
    const clients = loadClients();
    tbody.innerHTML = '';
    document.getElementById('clientsEmptyHint').style.display = clients.length ? 'none' : 'block';
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
      btn.addEventListener('click', function(){ openClientDetail(btn.dataset.viewClient); });
    });
    tbody.querySelectorAll('[data-del-client]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!confirm('Hofafana io client io? (Ny dette efa tsy voaloa dia hijanona amin\'ny fitantanana.)')) return;
        const remaining = loadClients().filter(function(c){ return c.id !== btn.dataset.delClient; });
        saveClients(remaining);
        if(openClientId === btn.dataset.delClient){
          openClientId = null;
          document.getElementById('clientDetailPanel').style.display = 'none';
        }
        renderClientsList();
        if(typeof populateVenteClientSelect === 'function') populateVenteClientSelect();
      });
    });
  }

  var addClientBtn = document.getElementById('addClientBtn');
  if(addClientBtn){
    addClientBtn.addEventListener('click', function(){
      const name = document.getElementById('clientName').value.trim();
      const phone = document.getElementById('clientPhone').value.trim();
      if(!name) return;
      const clients = loadClients();
      clients.push({ id: genId(), name: name, phone: phone });
      saveClients(clients);
      document.getElementById('clientName').value = '';
      document.getElementById('clientPhone').value = '';
      renderClientsList();
      if(typeof populateVenteClientSelect === 'function') populateVenteClientSelect();
    });
  }

  var openClientId = null;

  function openClientDetail(clientId){
    openClientId = clientId;
    const client = loadClients().find(function(c){ return c.id === clientId; });
    if(!client) return;
    document.getElementById('clientDetailPanel').style.display = 'block';
    document.getElementById('clientDetailName').textContent = '👤 ' + client.name + (client.phone ? ' — ' + client.phone : '');
    renderClientSales();
  }

  function renderClientSales(){
    const tbody = document.getElementById('clientSalesTableBody');
    if(!tbody || !openClientId) return;
    const sales = loadCreditSales()
      .filter(function(s){ return s.clientId === openClientId; })
      .sort(function(a, b){ return new Date(b.date) - new Date(a.date); });
    tbody.innerHTML = '';
    document.getElementById('clientSalesEmptyHint').style.display = sales.length ? 'none' : 'block';
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
        renderClientSales();
        renderClientsList();
      });
    });
  }

  var closeClientDetailBtn = document.getElementById('closeClientDetailBtn');
  if(closeClientDetailBtn){
    closeClientDetailBtn.addEventListener('click', function(){
      openClientId = null;
      document.getElementById('clientDetailPanel').style.display = 'none';
    });
  }

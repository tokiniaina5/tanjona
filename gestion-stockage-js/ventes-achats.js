  // ==================== VENTE ====================
  // Ilay Vente dia mifandray mivantana amin'ny Articles : mihena avy hatrany
  // ny stock rehefa mivarotra (miditra amin'ny "items" iray ihany).
  function populateVenteItemSelect(){
    const sel = document.getElementById('venteItemSelect');
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Choisir —</option>';
    items.forEach(function(it){
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = it.name + ' (stock: ' + it.qty + ' ' + (it.unit || 'pièce') + ')';
      sel.appendChild(opt);
    });
    if(current) sel.value = current;
  }

  function updateVenteInfo(){
    const sel = document.getElementById('venteItemSelect');
    const avail = document.getElementById('venteStockAvail');
    const unitPrice = document.getElementById('venteUnitPrice');
    const total = document.getElementById('venteTotal');
    if(!sel || !avail) return;
    const item = items.find(function(it){ return it.id === sel.value; });
    if(!item){
      avail.value = '—';
      unitPrice.value = '—';
      total.value = '—';
      return;
    }
    avail.value = item.qty + ' ' + (item.unit || 'pièce');
    unitPrice.value = formatAr(item.price);
    const qty = Number(document.getElementById('venteQty').value) || 0;
    total.value = formatAr(qty * item.price);
  }

  function populateVenteClientSelect(){
    const sel = document.getElementById('venteClientSelect');
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Choisir un client —</option>';
    loadClients().forEach(function(c){
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + (c.phone ? ' (' + c.phone + ')' : '');
      sel.appendChild(opt);
    });
    if(current) sel.value = current;
  }

  var venteItemSelectEl = document.getElementById('venteItemSelect');
  if(venteItemSelectEl) venteItemSelectEl.addEventListener('change', updateVenteInfo);

  var venteQtyEl = document.getElementById('venteQty');
  if(venteQtyEl) venteQtyEl.addEventListener('input', updateVenteInfo);

  var venteTypeEl = document.getElementById('venteType');
  if(venteTypeEl){
    venteTypeEl.addEventListener('change', function(){
      document.getElementById('venteClientField').style.display = venteTypeEl.value === 'credit' ? 'block' : 'none';
      if(venteTypeEl.value === 'credit') populateVenteClientSelect();
    });
  }

  var venteConfirmBtn = document.getElementById('venteConfirmBtn');
  if(venteConfirmBtn){
    venteConfirmBtn.addEventListener('click', function(){
      const status = document.getElementById('venteStatus');
      const sel = document.getElementById('venteItemSelect');
      const item = items.find(function(it){ return it.id === sel.value; });
      const qty = Number(document.getElementById('venteQty').value) || 0;
      const type = document.getElementById('venteType').value;

      if(!item){ status.textContent = 'Misafidiana entana aloha.'; return; }
      if(!qty || qty <= 0){ status.textContent = 'Quantité tsy mety.'; return; }
      if(qty > item.qty){ status.textContent = 'Ny stock dia ' + item.qty + ' ihany.'; return; }

      let clientId = null, clientName = '';
      if(type === 'credit'){
        clientId = document.getElementById('venteClientSelect').value;
        if(!clientId){ status.textContent = 'Misafidiana client ho an\'ny vente an-tsipiriany.'; return; }
        const client = loadClients().find(function(c){ return c.id === clientId; });
        clientName = client ? client.name : '';
      }

      const idx = items.findIndex(function(it){ return it.id === item.id; });
      const price = item.price;
      item.qty -= qty;
      if(item.qty <= 0) items.splice(idx, 1);
      saveItems(items);

      const total = qty * price;
      movements.push({
        itemId: item.id, ref: item.ref || '', name: item.name, category: item.category || '',
        type: 'sortie', qty: qty, price: price, value: total,
        date: new Date().toISOString(), day: dayKey(new Date()),
        note: type === 'credit' ? ('Crédit — ' + clientName) : 'Comptant'
      });
      saveMovements(movements);

      if(type === 'credit'){
        const sales = loadCreditSales();
        sales.push({
          id: genId(), clientId: clientId, itemId: item.id, itemName: item.name,
          qty: qty, price: price, total: total,
          date: new Date().toISOString(), paid: false
        });
        saveCreditSales(sales);
        pushNotification('vente', 'Vente an-tsipiriany ho an\'i ' + clientName + ' : ' + item.name + ' x' + qty + '.');
      } else {
        pushNotification('vente', 'Vente : ' + item.name + ' x' + qty + ' (' + formatAr(total) + ').');
      }

      status.textContent = 'Vente vita ✓ (' + formatAr(total) + ')';
      document.getElementById('venteQty').value = 1;
      populateVenteItemSelect();
      updateVenteInfo();
      renderStock();
      renderMovementsHistory();
      renderFilters();
      renderDashboard();
      if(typeof renderClientsList === 'function') renderClientsList();
    });
  }

  // ==================== ACHETER ====================
  function populateAcheterItemSelect(){
    const sel = document.getElementById('acheterItemSelect');
    if(!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">— Nouvel article —</option>';
    items.forEach(function(it){
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = it.name;
      sel.appendChild(opt);
    });
    if(current) sel.value = current;
  }

  var acheterItemSelectEl = document.getElementById('acheterItemSelect');
  if(acheterItemSelectEl){
    acheterItemSelectEl.addEventListener('change', function(){
      const item = items.find(function(it){ return it.id === acheterItemSelectEl.value; });
      const nameInput = document.getElementById('acheterItemName');
      const catInput = document.getElementById('acheterCategory');
      const priceInput = document.getElementById('acheterPrice');
      const unitInput = document.getElementById('acheterUnit');
      const supplierInput = document.getElementById('acheterSupplier');
      if(item){
        nameInput.value = item.name;
        nameInput.readOnly = true;
        catInput.value = item.category || '';
        priceInput.value = item.price;
        unitInput.value = item.unit || 'pièce';
        supplierInput.value = item.supplier || '';
      } else {
        nameInput.value = '';
        nameInput.readOnly = false;
        catInput.value = '';
        priceInput.value = 0;
        unitInput.value = 'pièce';
        supplierInput.value = '';
      }
    });
  }

  var acheterConfirmBtn = document.getElementById('acheterConfirmBtn');
  if(acheterConfirmBtn){
    acheterConfirmBtn.addEventListener('click', function(){
      const status = document.getElementById('acheterStatus');
      const sel = document.getElementById('acheterItemSelect');
      const name = document.getElementById('acheterItemName').value.trim();
      const category = document.getElementById('acheterCategory').value.trim();
      const qty = Number(document.getElementById('acheterQty').value) || 0;
      const unit = document.getElementById('acheterUnit').value || 'pièce';
      const price = Number(document.getElementById('acheterPrice').value) || 0;
      const supplier = document.getElementById('acheterSupplier').value.trim();

      if(!name){ status.textContent = 'Anarana ilaina.'; return; }
      if(!qty || qty <= 0){ status.textContent = 'Quantité tsy mety.'; return; }

      const existing = items.find(function(it){ return it.id === sel.value; }) ||
        items.find(function(it){ return it.name.toLowerCase() === name.toLowerCase(); });

      let id, ref;
      if(existing){
        id = existing.id;
        ref = existing.ref;
        existing.qty = Number(existing.qty) + qty;
        if(category) existing.category = category;
        if(price > 0) existing.price = price;
        if(unit) existing.unit = unit;
        if(supplier) existing.supplier = supplier;
      } else {
        id = genId();
        ref = nextRef();
        items.push({ id: id, ref: ref, name: name, category: category, qty: qty, unit: unit, price: price, seuil: 5, supplier: supplier });
      }
      saveItems(items);

      movements.push({
        itemId: id, ref: ref, name: name, category: category,
        type: 'entree', qty: qty, price: price, value: qty * price,
        date: new Date().toISOString(), day: dayKey(new Date()),
        note: supplier ? ('Achat — ' + supplier) : 'Achat'
      });
      saveMovements(movements);
      pushNotification('achat', 'Achat : ' + name + ' x' + qty + ' (' + formatAr(qty * price) + ').');

      status.textContent = 'Achat enregistré ✓';
      document.getElementById('acheterItemName').value = '';
      document.getElementById('acheterItemName').readOnly = false;
      document.getElementById('acheterCategory').value = '';
      document.getElementById('acheterQty').value = 1;
      document.getElementById('acheterPrice').value = 0;
      document.getElementById('acheterSupplier').value = '';
      sel.value = '';
      populateAcheterItemSelect();
      renderStock();
      renderMovementsHistory();
      renderFilters();
      renderDashboard();
    });
  }

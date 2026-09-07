  // ==================== VENTE ====================
  // La vente a été retirée de l'application : le stock ne sort plus que par
  // « Sortie », depuis la liste des articles. Les achats, eux, restent.

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

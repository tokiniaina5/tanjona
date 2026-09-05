  // ---------------- STOCK ----------------
  function formatAr(n){
    // espace normale comme séparateur de milliers (une espace fine insécable n'est pas
    // supportée par les polices standards du PDF et provoque un décalage/débordement)
    const num = Math.round(Number(n) || 0);
    const withSpaces = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return withSpaces + ' Ar';
  }

  function renderStock(){
    const tbody = document.getElementById('stockTableBody');
    tbody.innerHTML = '';
    document.getElementById('stockEmptyHint').style.display = items.length ? 'none' : 'block';
    refreshItemRefField();
    items.forEach(function(item, idx){
      const tr = document.createElement('tr');
      tr.dataset.itemId = item.id;
      const lowStock = Number(item.qty) <= Number(item.seuil || 5);
      tr.innerHTML =
        '<td>' + escapeHtml(item.ref || '—') + '</td>' +
        '<td>' + escapeHtml(item.name) + '</td>' +
        '<td>' + escapeHtml(item.category || '—') + '</td>' +
        '<td>' + item.qty + (lowStock ? ' <span class="badge-warn">Stock faible</span>' : '') + '</td>' +
        '<td>' + escapeHtml(item.unit || 'pièce') + '</td>' +
        '<td>' + formatAr(item.price) + '</td>' +
        '<td>' + formatAr(item.qty * item.price) + '</td>' +
        '<td>' + (item.seuil != null ? item.seuil : 5) + '</td>' +
        '<td>' + escapeHtml(item.supplier || '—') + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="btn btn-violet btn-icon" data-edit="' + idx + '" title="Modifier" aria-label="Modifier" style="margin-right:0.35rem;">✏️</button>' +
          '<button class="btn btn-amber btn-icon" data-sortie="' + idx + '" title="Sortie" aria-label="Sortie" style="margin-right:0.35rem;">📤</button>' +
          '<button class="btn btn-red btn-icon" data-idx="' + idx + '" title="Supprimer" aria-label="Supprimer">🗑️</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-idx]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const idx = Number(btn.dataset.idx);
        const removed = items[idx];
        items.splice(idx, 1);
        saveItems(items);
        if(removed){
          movements = movements.filter(function(m){ return m.itemId !== removed.id; });
          saveMovements(movements);
        }
        renderStock();
        renderMovementsHistory();
        renderFilters();
        renderDashboard();
      });
    });
    tbody.querySelectorAll('button[data-sortie]').forEach(function(btn){
      btn.addEventListener('click', function(){
        handleSortie(Number(btn.dataset.sortie));
      });
    });
    tbody.querySelectorAll('button[data-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){
        openEditModal(Number(btn.dataset.edit));
      });
    });
  }

  // ---------------- MODIFIER UN ARTICLE ----------------
  let editingIdx = null;

  function openEditModal(idx){
    const item = items[idx];
    if(!item) return;
    editingIdx = idx;
    document.getElementById('editItemRef').value = item.ref || '';
    document.getElementById('editItemName').value = item.name || '';
    document.getElementById('editItemCategory').value = item.category || '';
    document.getElementById('editItemQty').value = item.qty != null ? item.qty : 0;
    document.getElementById('editItemUnit').value = item.unit || 'pièce';
    document.getElementById('editItemPrice').value = item.price != null ? item.price : 0;
    document.getElementById('editItemSeuil').value = item.seuil != null ? item.seuil : 5;
    document.getElementById('editItemSupplier').value = item.supplier || '';
    document.getElementById('editItemModal').style.display = 'flex';
  }

  function closeEditModal(){
    editingIdx = null;
    document.getElementById('editItemModal').style.display = 'none';
  }

  document.getElementById('editItemCancelBtn').addEventListener('click', closeEditModal);
  document.getElementById('editItemModal').addEventListener('click', function(e){
    if(e.target === document.getElementById('editItemModal')) closeEditModal();
  });

  document.getElementById('editItemSaveBtn').addEventListener('click', function(){
    if(editingIdx === null) return;
    const item = items[editingIdx];
    if(!item) return;
    const name = document.getElementById('editItemName').value.trim();
    if(!name){ alert('Le nom est obligatoire.'); return; }
    const before = {
      name: item.name, category: item.category, qty: item.qty, unit: item.unit,
      price: item.price, seuil: item.seuil, supplier: item.supplier
    };
    item.name = name;
    item.category = document.getElementById('editItemCategory').value.trim();
    item.qty = Number(document.getElementById('editItemQty').value) || 0;
    item.unit = document.getElementById('editItemUnit').value || 'pièce';
    item.price = Number(document.getElementById('editItemPrice').value) || 0;
    item.seuil = Number(document.getElementById('editItemSeuil').value) || 0;
    item.supplier = document.getElementById('editItemSupplier').value.trim();
    saveItems(items);

    // enregistre la modification dans l'historique des mouvements + notification
    const changes = [];
    if(before.name !== item.name) changes.push('nom : ' + before.name + ' → ' + item.name);
    if((before.category || '') !== (item.category || '')) changes.push('catégorie : ' + (before.category || '—') + ' → ' + (item.category || '—'));
    if(Number(before.qty) !== Number(item.qty)) changes.push('quantité : ' + before.qty + ' → ' + item.qty);
    if((before.unit || '') !== (item.unit || '')) changes.push('unité : ' + (before.unit || '—') + ' → ' + (item.unit || '—'));
    if(Number(before.price) !== Number(item.price)) changes.push('prix : ' + formatAr(before.price) + ' → ' + formatAr(item.price));
    if(Number(before.seuil) !== Number(item.seuil)) changes.push('seuil : ' + before.seuil + ' → ' + item.seuil);
    if((before.supplier || '') !== (item.supplier || '')) changes.push('fournisseur : ' + (before.supplier || '—') + ' → ' + (item.supplier || '—'));
    const note = changes.length ? changes.join(' ; ') : 'aucun changement de valeur';
    movements.push({
      itemId: item.id, ref: item.ref || '', name: item.name, category: item.category || '',
      type: 'modification', qty: item.qty, price: item.price, value: item.qty * item.price,
      date: new Date().toISOString(), day: dayKey(new Date()), note: note
    });
    saveMovements(movements);
    pushNotification('modification', 'Entana « ' + item.name + ' » novaina : ' + note);

    closeEditModal();
    renderStock();
    renderMovementsHistory();
    renderFilters();
    renderDashboard();
  });

  function handleSortie(idx){
    const item = items[idx];
    if(!item) return;
    const input = window.prompt('Quantité à sortir pour "' + item.name + '" (stock actuel : ' + item.qty + ')', '1');
    if(input === null) return;
    const qty = Number(input);
    if(!qty || qty <= 0){ alert('Quantité invalide.'); return; }
    if(qty > item.qty){ alert("La quantité dépasse le stock disponible."); return; }
    item.qty -= qty;
    movements.push({
      itemId: item.id, ref: item.ref || '', name: item.name, category: item.category || '',
      type: 'sortie', qty: qty, price: item.price, value: qty * item.price,
      date: new Date().toISOString(), day: dayKey(new Date())
    });
    saveMovements(movements);
    pushNotification('vente', 'Entana « ' + item.name + ' » efa lafo : ' + qty + ' unité(s).');

    if(item.qty <= 0){
      items.splice(idx, 1);
      pushNotification('rupture', 'Entana « ' + item.name + ' » efa lany, voafafa tao amin\'ny stock.');
    }
    saveItems(items);
    renderStock();
    renderMovementsHistory();
    renderFilters();
    renderDashboard();
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function nextRef(){
    let maxNum = 0;
    items.forEach(function(it){
      const n = parseInt(it.ref, 10);
      if(!isNaN(n) && n > maxNum) maxNum = n;
    });
    return String(maxNum + 1);
  }

  function refreshItemRefField(){
    const el = document.getElementById('itemRef');
    if(el) el.value = nextRef();
  }
  refreshItemRefField();

  document.getElementById('addItemBtn').addEventListener('click', function(){
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value.trim();
    const qty = Number(document.getElementById('itemQty').value) || 0;
    const unit = document.getElementById('itemUnit').value || 'pièce';
    const price = Number(document.getElementById('itemPrice').value) || 0;
    const seuil = Number(document.getElementById('itemSeuil').value) || 0;
    const supplier = document.getElementById('itemSupplier').value.trim();
    if(!name) return;

    // raha efa misy article mitovy anarana, ampio ny stock efa ao
    // fa tsy mamorona andalana vaovao — mba hifanarahan'ny Articles amin'ny Tableau de bord
    const existing = items.find(function(it){
      return it.name.toLowerCase() === name.toLowerCase();
    });

    let id, ref;
    if(existing){
      id = existing.id;
      ref = existing.ref;
      existing.qty = Number(existing.qty) + qty;
      if(category) existing.category = category;
      if(price > 0) existing.price = price;
      if(unit) existing.unit = unit;
      if(seuil >= 0) existing.seuil = seuil;
      if(supplier) existing.supplier = supplier;
    } else {
      id = genId();
      ref = nextRef();
      items.push({ id, ref, name, category, qty, unit, price, seuil, supplier });
    }
    saveItems(items);

    if(qty > 0){
      movements.push({
        itemId: id, ref: ref, name: name, category: category,
        type: 'entree', qty: qty, price: price, value: qty * price,
        date: new Date().toISOString(), day: dayKey(new Date())
      });
      saveMovements(movements);
    }
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemQty').value = 1;
    document.getElementById('itemPrice').value = 0;
    document.getElementById('itemSeuil').value = 5;
    document.getElementById('itemSupplier').value = '';
    refreshItemRefField();
    renderStock();
    renderMovementsHistory();
    renderFilters();
    renderDashboard();
  });

  function movementTypeLabel(type){
    if(type === 'entree') return '<span style="color:#6ee7b7;">▲ Entrée</span>';
    if(type === 'modification') return '<span style="color:var(--violet);">✎ Modification</span>';
    return '<span style="color:var(--amber);">▼ Sortie</span>';
  }

  function renderMovementsHistory(){
    const tbody = document.getElementById('movementsTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const sorted = movements.slice().sort(function(a, b){ return new Date(b.date) - new Date(a.date); });
    document.getElementById('movementsEmptyHint').style.display = sorted.length ? 'none' : 'block';
    sorted.forEach(function(m){
      const tr = document.createElement('tr');
      tr.dataset.moveKey = (m.itemId || '') + '_' + m.date + '_' + m.type;
      const d = new Date(m.date);
      const dateStr = isNaN(d) ? m.day : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      tr.innerHTML =
        '<td>' + dateStr + '</td>' +
        '<td>' + movementTypeLabel(m.type) + '</td>' +
        '<td>' + escapeHtml(m.ref || '—') + '</td>' +
        '<td>' + escapeHtml(m.name) + '</td>' +
        '<td>' + escapeHtml(m.category || '—') + '</td>' +
        '<td>' + m.qty + '</td>' +
        '<td>' + formatAr(m.value) + '</td>' +
        '<td>' + escapeHtml(m.note || '—') + '</td>';
      tbody.appendChild(tr);
      attachSwipeToDelete(tr, m);
    });
  }

  function attachSwipeToDelete(row, movement){
    let startX = 0, currentX = 0, dragging = false;
    const threshold = 70;
    row.style.willChange = 'transform, opacity';
    row.style.cursor = 'grab';

    function onStart(clientX){
      startX = clientX;
      currentX = 0;
      dragging = true;
      row.style.transition = 'none';
      row.style.cursor = 'grabbing';
    }
    function onMove(clientX){
      if(!dragging) return;
      currentX = clientX - startX;
      row.style.transform = 'translateX(' + currentX + 'px)';
      row.style.opacity = String(Math.max(1 - Math.abs(currentX) / 220, 0.25));
    }
    function onEnd(){
      if(!dragging) return;
      dragging = false;
      row.style.cursor = 'grab';
      row.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      if(Math.abs(currentX) > threshold){
        const dir = currentX > 0 ? 1 : -1;
        row.style.transform = 'translateX(' + (dir * 400) + 'px)';
        row.style.opacity = '0';
        setTimeout(function(){
          const i = movements.indexOf(movement);
          if(i > -1){ movements.splice(i, 1); saveMovements(movements); }
          renderMovementsHistory();
          renderDashboard();
        }, 220);
      } else {
        row.style.transform = 'translateX(0)';
        row.style.opacity = '1';
      }
    }
    function onCancel(){
      dragging = false;
      row.style.cursor = 'grab';
      row.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      row.style.transform = 'translateX(0)';
      row.style.opacity = '1';
    }

    // ---- tactile (téléphone/tablette) ----
    row.addEventListener('touchstart', function(e){
      if(e.touches.length !== 1) return;
      onStart(e.touches[0].clientX);
    }, { passive: true });
    row.addEventListener('touchmove', function(e){
      if(dragging) onMove(e.touches[0].clientX);
    }, { passive: true });
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onCancel);

    // ---- souris (ordinateur) : cliquer-glisser sur l'andalana ----
    row.addEventListener('mousedown', function(e){
      e.preventDefault();
      onStart(e.clientX);
      function onMouseMove(ev){ onMove(ev.clientX); }
      function onMouseUp(){
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        onEnd();
      }
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ---------------- TABLEAU DE BORD ----------------
  function passesCatRef(o){
    const cat = o.category || 'Sans catégorie';
    const ref = o.ref || '—';
    if(selectedCategories.size && !selectedCategories.has(cat)) return false;
    if(selectedRefs.size && !selectedRefs.has(ref)) return false;
    return true;
  }

  function getFilteredItems(){
    return items.filter(passesCatRef);
  }

  function getFilteredMovements(type){
    return movements.filter(function(m){
      if(m.type !== type) return false;
      if(!passesCatRef(m)) return false;
      if(!passesDateRange(m)) return false;
      if(selectedDays.size && !selectedDays.has(m.day)) return false;
      return true;
    });
  }

  function groupByCategory(arr, valueFn){
    const map = new Map();
    arr.forEach(function(o){
      const cat = o.category || 'Sans catégorie';
      map.set(cat, (map.get(cat) || 0) + valueFn(o));
    });
    return { labels: Array.from(map.keys()), data: Array.from(map.values()) };
  }

  function getLastDays(movs, n){
    const set = new Set(movs.map(function(m){ return m.day; }));
    let arr = Array.from(set).sort();
    if(arr.length === 0){
      const now = new Date();
      arr = [];
      for(let i = n - 1; i >= 0; i--){
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        arr.push(dayKey(d));
      }
      return arr;
    }
    return arr.slice(-n);
  }

  function getDaysForTrend(movs){
    if(dateFrom || dateTo){
      const dataDays = movs.map(function(m){ return m.day; }).sort();
      const start = dateFrom ? parseDayKey(dateFrom) : (dataDays.length ? parseDayKey(dataDays[0]) : new Date());
      const end = dateTo ? parseDayKey(dateTo) : new Date();
      const days = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      let safety = 0;
      while(cur <= endD && safety < 366){
        days.push(dayKey(cur));
        cur.setDate(cur.getDate() + 1);
        safety++;
      }
      return days.length ? days : [dayKey(new Date())];
    }
    return getLastDays(movs, 14);
  }

  function sumForDay(arr, dk, valueFn){
    return arr.filter(function(m){ return m.day === dk; }).reduce(function(s, m){ return s + valueFn(m); }, 0);
  }

  function renderChart(id, config){
    const canvas = document.getElementById(id);
    if(!canvas || !window.Chart) return;
    if(charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas.getContext('2d'), config);
  }

  function renderDonut(id, group){
    let labels = group.labels, data = group.data;
    if(!labels.length){ labels = ['Aucune donnée']; data = [1]; }
    renderChart(id, {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: labels.map(function(_, i){ return chartColors[i % chartColors.length]; }), borderWidth: 0 }] },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } }
      }
    });
  }

  function renderBar(id, days, data, color){
    renderChart(id, {
      type: 'bar',
      data: { labels: days.map(dayLabel), datasets: [{ data: data, backgroundColor: color, borderRadius: 4, maxBarThickness: 42 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#1f2a30' }, beginAtZero: true } }
      }
    });
  }

  function renderLine(id, days, data, color){
    renderChart(id, {
      type: 'line',
      data: { labels: days.map(dayLabel), datasets: [{ data: data, borderColor: color, backgroundColor: color + '2a', fill: true, tension: 0.35, pointRadius: 3 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#1f2a30' }, beginAtZero: true } }
      }
    });
  }

  function buildChipGroup(containerId, values, selectedSet, labelFn){
    const el = document.getElementById(containerId);
    if(!el) return;
    el.innerHTML = '';
    if(!values.length){ el.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">—</span>'; return; }
    values.forEach(function(v){
      const chip = document.createElement('span');
      chip.className = 'filter-chip' + (selectedSet.has(v) ? ' checked' : '');
      chip.textContent = labelFn(v);
      chip.addEventListener('click', function(){
        if(selectedSet.has(v)) selectedSet.delete(v); else selectedSet.add(v);
        renderFilters();
        renderDashboard();
      });
      el.appendChild(chip);
    });
  }

  function renderFilters(){
    const daysAll = Array.from(new Set(movements.map(function(m){ return m.day; }))).sort();
    const catsAll = Array.from(new Set(
      items.map(function(it){ return it.category || 'Sans catégorie'; })
        .concat(movements.map(function(m){ return m.category || 'Sans catégorie'; }))
    ));
    const refsAll = Array.from(new Set(items.map(function(it){ return it.ref || '—'; })));

    buildChipGroup('filterDays', daysAll, selectedDays, dayLabel);
    buildChipGroup('filterCategories', catsAll, selectedCategories, function(c){ return c; });
    buildChipGroup('filterRefs', refsAll, selectedRefs, function(r){ return r; });
  }

  document.getElementById('filterDateFrom').addEventListener('change', function(){
    dateFrom = this.value;
    renderDashboard();
  });
  document.getElementById('filterDateTo').addEventListener('change', function(){
    dateTo = this.value;
    renderDashboard();
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', function(){
    selectedDays.clear();
    selectedCategories.clear();
    selectedRefs.clear();
    dateFrom = '';
    dateTo = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    renderFilters();
    renderDashboard();
  });

  function renderDashboard(){
    const filteredItems = getFilteredItems();
    const stockTotal = filteredItems.reduce(function(s, it){ return s + Number(it.qty); }, 0);
    const stockValue = filteredItems.reduce(function(s, it){ return s + Number(it.qty) * Number(it.price); }, 0);

    const entreesF = getFilteredMovements('entree');
    const sortiesF = getFilteredMovements('sortie');
    const entreesTotal = entreesF.reduce(function(s, m){ return s + m.qty; }, 0);
    const entreesValue = entreesF.reduce(function(s, m){ return s + m.value; }, 0);
    const sortiesTotal = sortiesF.reduce(function(s, m){ return s + m.qty; }, 0);
    const sortiesValue = sortiesF.reduce(function(s, m){ return s + m.value; }, 0);

    document.getElementById('kpiStockTotal').textContent = stockTotal.toLocaleString('fr-FR');
    document.getElementById('kpiStockValue').textContent = formatAr(stockValue);
    document.getElementById('kpiEntreesTotal').textContent = entreesTotal.toLocaleString('fr-FR');
    document.getElementById('kpiEntreesValue').textContent = formatAr(entreesValue);
    document.getElementById('kpiSortiesTotal').textContent = sortiesTotal.toLocaleString('fr-FR');
    document.getElementById('kpiSortiesValue').textContent = formatAr(sortiesValue);

    renderDonut('chartStockQty', groupByCategory(filteredItems, function(it){ return Number(it.qty); }));
    renderDonut('chartStockValue', groupByCategory(filteredItems, function(it){ return Number(it.qty) * Number(it.price); }));
    renderDonut('chartEntreesQty', groupByCategory(entreesF, function(m){ return m.qty; }));
    renderDonut('chartEntreesValue', groupByCategory(entreesF, function(m){ return m.value; }));
    renderDonut('chartSortiesQty', groupByCategory(sortiesF, function(m){ return m.qty; }));
    renderDonut('chartSortiesValue', groupByCategory(sortiesF, function(m){ return m.value; }));

    const top3 = filteredItems.slice().sort(function(a, b){ return (b.qty * b.price) - (a.qty * a.price); }).slice(0, 3);
    const topEl = document.getElementById('topItemsList');
    topEl.innerHTML = '';
    if(!top3.length){ topEl.innerHTML = '<p class="empty-hint" style="padding:0.4rem 0;">Aucune donnée.</p>'; }
    top3.forEach(function(it){
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = '<span>' + escapeHtml(it.name) + '</span><span class="val">' + formatAr(it.qty * it.price) + '</span>';
      topEl.appendChild(row);
    });

    const restock = filteredItems.filter(function(it){ return Number(it.qty) <= Number(it.seuil != null ? it.seuil : 5); }).sort(function(a, b){ return a.qty - b.qty; });
    const restockEl = document.getElementById('restockList');
    restockEl.innerHTML = '';
    if(!restock.length){ restockEl.innerHTML = '<p class="empty-hint" style="padding:0.4rem 0;">Tous les articles sont bien approvisionnés.</p>'; }
    restock.forEach(function(it){
      const row = document.createElement('div');
      row.className = 'list-row';
      const badge = Number(it.qty) === 0 ? '<span class="badge-danger">Non disponible</span>' : '<span class="badge-warn">Stock faible</span>';
      row.innerHTML = '<span>' + escapeHtml(it.name) + ' <span style="color:var(--muted); font-size:0.75rem;">(' + it.qty + ' ' + escapeHtml(it.unit || 'pièce') + ')</span></span>' + badge;
      restockEl.appendChild(row);
    });

    const entreesTrend = movements.filter(function(m){ return m.type === 'entree' && passesCatRef(m) && passesDateRange(m); });
    const sortiesTrend = movements.filter(function(m){ return m.type === 'sortie' && passesCatRef(m) && passesDateRange(m); });
    const days = getDaysForTrend(entreesTrend.concat(sortiesTrend));

    renderBar('chartEntreesDay', days, days.map(function(dk){ return sumForDay(entreesTrend, dk, function(m){ return m.qty; }); }), '#8b93ff');
    renderBar('chartSortiesDay', days, days.map(function(dk){ return sumForDay(sortiesTrend, dk, function(m){ return m.qty; }); }), '#4fd8e0');
    renderLine('chartEntreesValueDay', days, days.map(function(dk){ return sumForDay(entreesTrend, dk, function(m){ return m.value; }); }), '#f2a33c');
    renderLine('chartSortiesValueDay', days, days.map(function(dk){ return sumForDay(sortiesTrend, dk, function(m){ return m.value; }); }), '#8b93ff');
  }

  document.getElementById('exportExcelBtn').addEventListener('click', function(){
    if(!window.XLSX){ alert("La bibliothèque Excel n'a pas pu être chargée."); return; }
    const rows = items.map(function(i){
      return {
        Référence: i.ref || '', Nom: i.name, Catégorie: i.category || '', Quantité: i.qty,
        Unité: i.unit || 'pièce', 'Prix unitaire (Ar)': i.price, 'Valeur (Ar)': i.qty * i.price,
        'Seuil d\'alerte': i.seuil != null ? i.seuil : 5, Fournisseur: i.supplier || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    XLSX.writeFile(wb, 'stock-tanjona.xlsx');
  });

  document.getElementById('downloadJsonBtn').addEventListener('click', function(){
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-tanjona.json';
    a.click();
    URL.revokeObjectURL(url);
  });


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
    renderTableauxNouveau();
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
        // Navoaka na tsia : l'état est demandé à la base juste après (voir
        // majLesBoutonsFil) ; en attendant, le bouton se tait.
        '<td><button type="button" class="bouton-fil" data-publier="' + idx + '" aria-pressed="false" disabled>…</button></td>' +
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
        // Retirer la marchandise du stock, c'est cesser de la vendre : son
        // annonce part avec elle, comme le jour où elle s'épuise.
        if(items[idx]) retirerLesBillets(items[idx].id);
        items.splice(idx, 1);
        saveItems(items);
        // Ny mouvement mikasika io entana voafafa io dia TSY esorina: mijanona
        // 3 semaine (jereo purgeExpiredOrphanMovements) raha tsy nofafana an-tanana.
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
    tbody.querySelectorAll('button[data-publier]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const item = items[Number(btn.dataset.publier)];
        if(!item) return;
        // Navoaka : on le retire du fil. Il part à la corbeille de son auteur,
        // d'où il peut revenir ; l'article, lui, reste au stock.
        if(btn.getAttribute('aria-pressed') === 'true'){
          if(typeof window.__retirerLEntanaDuFil !== 'function') return;
          if(!confirm('Esorina ao amin\'ny fil ve ny « ' + item.name + ' » ? (Ho any amin\'ny 🗑️ Corbeille ilay publication.)')) return;
          btn.disabled = true;
          window.__retirerLEntanaDuFil(item.id).then(majLesBoutonsFil, function(){
            alert('Tsy voaesotra ao amin\'ny fil. Andramo indray.');
            majLesBoutonsFil();
          });
          return;
        }
        // Tsy navoaka : l'annonce s'écrit dans la boîte « Écrire », fiche
        // comprise — le nom, le prix et la quantité y viennent d'ici.
        if(typeof window.__ouvrirLaFicheDeLEntana === 'function') window.__ouvrirLaFicheDeLEntana(item);
      });
    });
    majLesBoutonsFil();
  }

  // ---- Navoaka na tsia ----
  // Le stock vit dans l'appareil, l'annonce dans la base : c'est elle qu'on
  // interroge, en une seule question pour toute la liste.
  function majLesBoutonsFil(){
    const boutons = document.querySelectorAll('#stockTableBody button[data-publier]');
    if(!boutons.length) return;
    const poser = function(navoaka, connu){
      boutons.forEach(function(btn){
        const item = items[Number(btn.dataset.publier)];
        const oui = !!(item && navoaka && navoaka.has(String(item.id)));
        btn.disabled = !connu;
        btn.setAttribute('aria-pressed', oui ? 'true' : 'false');
        btn.classList.toggle('navoaka', oui);
        btn.textContent = connu ? (oui ? '✅ Navoaka' : '⬜ Tsy navoaka') : '…';
        btn.title = oui ? 'Esorina ao amin\'ny fil' : 'Avoaka ao amin\'ny fil';
      });
    };
    if(typeof window.__lireLesEntanaNavoaka !== 'function'){ poser(null, false); return; }
    window.__lireLesEntanaNavoaka().then(function(navoaka){ poser(navoaka, true); },
      function(){ poser(new Set(), true); });
  }
  window.__majLesBoutonsFil = majLesBoutonsFil;
  // Une annonce qui vient de partir : son article passe à « Navoaka ».
  document.addEventListener('billet-publie', majLesBoutonsFil);

  // Une marchandise épuisée, ou retirée du stock : son annonce n'a plus
  // d'objet, et la laisser, c'est proposer à la vente ce qu'on n'a plus.
  // Elle ne part que d'ici — le stock vit dans l'appareil, et la base ne sait
  // pas ce qu'il en reste.
  function retirerLesBillets(itemId){
    if(typeof window.__effacerLesBilletsDeLEntana !== 'function') return;
    window.__effacerLesBilletsDeLEntana(itemId);
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
    // Une quantité ramenée à zéro à la main, c'est une rupture comme une
    // autre : l'annonce n'a plus d'objet. L'article, lui, reste au registre —
    // on l'a mis à zéro, pas effacé.
    if(Number(before.qty) > 0 && Number(item.qty) <= 0) retirerLesBillets(item.id);
    saveItems(items);
    // Le prix changé ici suit dans son annonce en ligne : l'article et
    // l'annonce disent le même prix.
    if(Number(before.price) !== Number(item.price) && Number(item.qty) > 0 &&
       typeof window.__majLePrixDuBillet === 'function') window.__majLePrixDuBillet(item.id, item.price);

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
    // Sans la vente, une sortie n'est plus qu'un mouvement de stock : le dire
    // « vendu » laisserait croire à une recette qui n'a pas été enregistrée.
    pushNotification('sortie', 'Entana « ' + item.name + ' » nesorina tao amin\'ny stock : ' + qty + ' unité(s).');

    if(item.qty <= 0){
      items.splice(idx, 1);
      // L'annonce s'en va avec la marchandise : c'est ici, et nulle part
      // ailleurs, qu'on sait que la dernière unité vient de sortir.
      retirerLesBillets(item.id);
      pushNotification('rupture', 'Entana « ' + item.name + ' » efa lany, voafafa tao amin\'ny stock sy tao amin\'ny fil.');
    }
    saveItems(items);
    renderStock();
    renderMovementsHistory();
    renderFilters();
    renderDashboard();
  }

  // ---------------- PURGE HISTORIQUE (entana efa voafafa) ----------------
  // Ny mouvement an'ny entana efa voafafa dia mijanona 3 semaine (21 andro)
  // vao voafafa automatique, raha tsy nisy nanala azy an-tanana talohan'izay.
  var MOVEMENT_ORPHAN_RETENTION_MS = 21 * 24 * 60 * 60 * 1000;
  function purgeExpiredOrphanMovements(){
    const existingIds = new Set(items.map(function(it){ return it.id; }));
    const now = Date.now();
    const before = movements.length;
    movements = movements.filter(function(m){
      if(existingIds.has(m.itemId)) return true;
      const age = now - new Date(m.date).getTime();
      return age <= MOVEMENT_ORPHAN_RETENTION_MS;
    });
    if(movements.length !== before) saveMovements(movements);
  }
  purgeExpiredOrphanMovements();

  // Note : Ajouter / Acheter / Gestion de compte dia lasa dash-tab
  // lehibe mitovy amin'ny Accueil/Tableau de bord, mipetraka aorian'ny
  // "Articles" — ny fifandimbiasany dia votoatin'ilay listener ".dash-tab"
  // ao amin'ny common.js ankehitriny.

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // Sans préfixe : 1, 2, 3... (« Entrée en stock », les achats). Avec un
  // préfixe (« N », « VARY-»...) : la série d'un onglet « Nouvel article »,
  // qui ne croise jamais les autres.
  function nextRef(prefixe){
    prefixe = prefixe || '';
    let maxNum = 0;
    items.forEach(function(it){
      const r = String(it.ref == null ? '' : it.ref);
      let n = NaN;
      if(!prefixe) n = parseInt(r, 10);
      else if(r.indexOf(prefixe) === 0 && /^\d+$/.test(r.slice(prefixe.length))) n = parseInt(r.slice(prefixe.length), 10);
      if(!isNaN(n) && n > maxNum) maxNum = n;
    });
    return prefixe + (maxNum + 1);
  }

  // Plusieurs onglets portent le même formulaire : « Entrée en stock »
  // (identifiants itemRef, itemName...), « Nouvel article » (les mêmes,
  // suivis de Nouveau) et ceux que le « + » ouvre à côté (Nouveau2,
  // Nouveau3...). Les « Nouvel article » ne créent que des marchandises
  // encore absentes du stock. Chacun est un groupe : ses articles portent
  // `groupe` (le nom de sa vue : nouveau, nouveau3...), une référence tirée
  // du nom de l'onglet (Vary → VARY-1, VARY-2...) et il a son tableau de bord.
  const FORMULAIRES_AJOUTER = ['', 'Nouveau'];
  const CLE_ONGLETS_NOUVEAU = 'stockmanager_onglets_nouveau';
  // Le dernier numéro donné : un onglet refermé ne rend pas le sien, et ses
  // articles ne tombent jamais dans le tableau d'un onglet ouvert plus tard.
  const CLE_DERNIER_NOUVEAU = 'stockmanager_onglets_nouveau_dernier';
  const CLE_NOMS_NOUVEAU = 'stockmanager_noms_nouveau';

  // « Entrée en stock » (suffixe vide, vue ajouter) a aussi son nom, sa série
  // de références et son tableau de bord : ses articles sont ceux qui
  // n'appartiennent à aucun onglet « Nouvel article ».
  function estNouvelArticle(sfx){ return sfx.indexOf('Nouveau') === 0; }
  function vueDe(sfx){ return sfx ? 'nouveau' + sfx.slice('Nouveau'.length) : 'ajouter'; }
  function sfxDe(vue){ return vue === 'ajouter' ? '' : 'Nouveau' + vue.slice('nouveau'.length); }
  function appartient(it, vue){ return vue === 'ajouter' ? !it.groupe : it.groupe === vue; }

  function lireNomsNouveau(){
    try{
      const v = JSON.parse(localStorage.getItem(CLE_NOMS_NOUVEAU) || '{}');
      return v && typeof v === 'object' ? v : {};
    }catch(e){ return {}; }
  }
  function ecrireNomsNouveau(noms){
    try{ localStorage.setItem(CLE_NOMS_NOUVEAU, JSON.stringify(noms)); }catch(e){}
  }

  // Le nom affiché d'un onglet : celui choisi, sinon « 🆕 Nouvel article »,
  // « 🆕 Nouvel article 2 »... d'après sa place.
  function nomOngletNouveau(sfx, noms){
    noms = noms || lireNomsNouveau();
    const vue = vueDe(sfx);
    if(noms[vue]) return noms[vue];
    if(!sfx) return '📦 Entrée en stock';
    const place = FORMULAIRES_AJOUTER.filter(estNouvelArticle).indexOf(sfx) + 1;
    return '🆕 Nouvel article' + (place > 1 ? ' ' + place : '');
  }

  // Le préfixe des références : le nom de l'onglet en capitales, sans accent
  // ni signe (8 lettres au plus), suivi d'un tiret. Sans nom : rien pour
  // « Entrée en stock » (1, 2, 3...), N pour le premier « Nouvel article »
  // (N1, N2...), N3- pour l'onglet nouveau3...
  function prefixeRef(sfx){
    const choisi = lireNomsNouveau()[vueDe(sfx)];
    const propre = String(choisi || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
    if(propre) return propre + '-';
    if(!estNouvelArticle(sfx)) return '';
    const num = sfx.slice('Nouveau'.length);
    return num ? 'N' + num + '-' : 'N';
  }

  // Les articles créés avant les groupes, dans la série N1, N2... du premier
  // onglet, en font partie.
  (function rangerLesAnciensN(){
    let change = false;
    items.forEach(function(it){
      if(!it.groupe && /^N\d+$/.test(String(it.ref))){ it.groupe = 'nouveau'; change = true; }
    });
    if(change) saveItems(items);
  })();

  function refreshItemRefField(){
    FORMULAIRES_AJOUTER.forEach(function(sfx){
      const el = document.getElementById('itemRef' + sfx);
      if(el) el.value = nextRef(prefixeRef(sfx));
    });
  }
  refreshItemRefField();

  // Le choix « Botika » de chaque formulaire se garde (clé : son suffixe)
  // pour les articles suivants et au rechargement. Rien de choisi : 🚫.
  const CLE_CHOIX_BOTIKA = 'stockmanager_choix_botika';
  function lireChoixBotika(){
    try{
      const v = JSON.parse(localStorage.getItem(CLE_CHOIX_BOTIKA) || '{}');
      return v && typeof v === 'object' ? v : {};
    }catch(e){ return {}; }
  }
  function choixBotika(sfx){
    const el = document.getElementById('itemPublier' + sfx);
    return el ? el.value : 'tsia';
  }

  FORMULAIRES_AJOUTER.forEach(brancherFormulaireAjouter);
  function brancherFormulaireAjouter(sfx){
  const bouton = document.getElementById('addItemBtn' + sfx);
  if(!bouton) return;
  const selectBotika = document.getElementById('itemPublier' + sfx);
  if(selectBotika){
    const garde = lireChoixBotika()[sfx];
    selectBotika.value = ['tsia', 'eny', 'famaritana'].indexOf(garde) >= 0 ? garde : 'tsia';
    selectBotika.addEventListener('change', function(){
      const choix = lireChoixBotika();
      choix[sfx] = selectBotika.value;
      try{ localStorage.setItem(CLE_CHOIX_BOTIKA, JSON.stringify(choix)); }catch(e){}
    });
  }
  bouton.addEventListener('click', function(){
    const name = document.getElementById('itemName' + sfx).value.trim();
    const category = document.getElementById('itemCategory' + sfx).value.trim();
    const qty = Number(document.getElementById('itemQty' + sfx).value) || 0;
    const unit = document.getElementById('itemUnit' + sfx).value || 'pièce';
    const price = Number(document.getElementById('itemPrice' + sfx).value) || 0;
    const seuil = Number(document.getElementById('itemSeuil' + sfx).value) || 0;
    const supplier = document.getElementById('itemSupplier' + sfx).value.trim();
    if(!name) return;

    // raha efa misy article mitovy anarana, ampio ny stock efa ao
    // fa tsy mamorona andalana vaovao — mba hifanarahan'ny Articles amin'ny Tableau de bord
    const existing = items.find(function(it){
      return it.name.toLowerCase() === name.toLowerCase();
    });

    if(existing && estNouvelArticle(sfx)){
      alert('« ' + existing.name + ' » efa misy ao amin\'ny stock (réf. ' + existing.ref + '). Ampidiro ao amin\'ny « 📦 Entrée en stock » ny fanampiny.');
      return;
    }

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
      ref = nextRef(prefixeRef(sfx));
      const nouvel = { id, ref, name, category, qty, unit, price, seuil, supplier };
      if(estNouvelArticle(sfx)) nouvel.groupe = vueDe(sfx);
      items.push(nouvel);
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
    document.getElementById('itemName' + sfx).value = '';
    document.getElementById('itemCategory' + sfx).value = '';
    document.getElementById('itemQty' + sfx).value = 1;
    document.getElementById('itemPrice' + sfx).value = 0;
    document.getElementById('itemSeuil' + sfx).value = 5;
    document.getElementById('itemSupplier' + sfx).value = '';
    refreshItemRefField();
    renderStock();
    renderMovementsHistory();
    renderFilters();
    renderDashboard();

    // Le choix « Botika » du formulaire : 🚫 l'article reste hors de la
    // Botika (le 📢 de la liste des articles pourra l'y mettre plus tard) ;
    // 🛒 il y paraît tout de suite ; 📝 la boîte « Écrire » s'ouvre sur sa
    // fiche, pour une annonce complète.
    const choix = choixBotika(sfx);
    const ajoute = items.find(function(it){ return it.id === id; });
    if(choix === 'famaritana'){
      if(ajoute && typeof window.__ouvrirLaFicheDeLEntana === 'function') window.__ouvrirLaFicheDeLEntana(ajoute);
    } else if(choix === 'eny' && ajoute && Number(ajoute.qty) >= 1 && typeof window.__publierLEntana === 'function'){
      // Déjà annoncé, il n'y est pas mis deux fois (__publierLEntana le vérifie).
      window.__publierLEntana(ajoute).then(majLesBoutonsFil, function(err){
        alert('Tsy navoaka tao amin\'ny Botika : ' + ((err && err.message) || 'andramo indray.'));
      });
    }
  });
  }

  // ---- Le tableau de bord de chaque « Nouvel article » ----
  // Sous le formulaire : les chiffres du groupe (articles, stock, valeur,
  // entrées, sorties) et la liste de ses articles. renderStock le redessine
  // après chaque changement du stock.
  function renderTableauxNouveau(){
    const noms = lireNomsNouveau();
    FORMULAIRES_AJOUTER.forEach(function(sfx){
      const vue = vueDe(sfx);
      const hote = document.getElementById('dash-' + vue);
      if(!hote) return;
      let bloc = hote.querySelector('.tableau-nouveau');
      if(!bloc){
        bloc = document.createElement('div');
        bloc.className = 'panel tableau-nouveau';
        hote.appendChild(bloc);
      }
      const groupe = items.filter(function(it){ return appartient(it, vue); });
      const ids = new Set(groupe.map(function(it){ return it.id; }));
      let stock = 0, valeur = 0, entrees = 0, sorties = 0;
      groupe.forEach(function(it){
        stock += Number(it.qty) || 0;
        valeur += (Number(it.qty) || 0) * (Number(it.price) || 0);
      });
      movements.forEach(function(m){
        if(!ids.has(m.itemId)) return;
        if(m.type === 'entree') entrees += Number(m.value) || 0;
        else if(m.type === 'sortie') sorties += Number(m.value) || 0;
      });
      const kpi = function(label, val){
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + val + '</div></div>';
      };
      const lignes = groupe.map(function(it){
        const faible = Number(it.qty) <= Number(it.seuil != null ? it.seuil : 5);
        return '<tr>' +
          '<td>' + escapeHtml(it.ref || '—') + '</td>' +
          '<td>' + escapeHtml(it.name) + '</td>' +
          '<td>' + escapeHtml(it.category || '—') + '</td>' +
          '<td>' + it.qty + ' ' + escapeHtml(it.unit || 'pièce') + (faible ? ' <span class="badge-warn">Stock faible</span>' : '') + '</td>' +
          '<td>' + formatAr(it.price) + '</td>' +
          '<td>' + formatAr((Number(it.qty) || 0) * (Number(it.price) || 0)) + '</td>' +
        '</tr>';
      }).join('');
      bloc.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem; flex-wrap:wrap;">' +
          '<h3 style="margin:0;">📊 Tableau de bord — ' + escapeHtml(nomOngletNouveau(sfx, noms)) + '</h3>' +
          '<button type="button" class="btn btn-sm btn-primary tableau-feno-btn" style="width:auto;">📊 Tableau de bord feno</button>' +
        '</div>' +
        '<div class="kpi-row">' +
          kpi('Articles', groupe.length) +
          kpi('Stock total', stock) +
          kpi('Valeur de stock', formatAr(valeur)) +
          kpi('Valeur des entrées', formatAr(entrees)) +
          kpi('Valeur des sorties', formatAr(sorties)) +
        '</div>' +
        (groupe.length
          ? '<div class="table-scroll"><table><thead><tr><th>Réf.</th><th>Nom</th><th>Catégorie</th><th>Quantité</th><th>Prix unitaire</th><th>Valeur</th></tr></thead><tbody>' + lignes + '</tbody></table></div>'
          : '<p class="empty-hint">Mbola tsy misy entana noforonina tao amin\'ity onglet ity.</p>');
      bloc.querySelector('.tableau-feno-btn').addEventListener('click', function(){ ouvrirTableauDuGroupe(vue); });
    });
  }

  // Le grand tableau de bord (graphiques, filtres, top 3...) réduit aux
  // articles d'un onglet, sous son nom. « ✕ Entana rehetra », l'onglet
  // 📊 Tableau de bord ou le menu le rendent à tout le stock.
  function majTitreTableau(){
    const titre = document.getElementById('titreTableauBord');
    const tout = document.getElementById('tableauToutBtn');
    let nom = '';
    if(groupeTableau){
      const sfx = sfxDe(groupeTableau);
      nom = FORMULAIRES_AJOUTER.indexOf(sfx) >= 0 ? nomOngletNouveau(sfx) : (lireNomsNouveau()[groupeTableau] || groupeTableau);
    }
    if(titre) titre.textContent = '📊 Tableau de bord' + (nom ? ' — ' + nom : '');
    if(tout) tout.style.display = groupeTableau ? '' : 'none';
  }
  function viderLesFiltres(){
    selectedDays.clear();
    selectedCategories.clear();
    selectedRefs.clear();
  }
  function ouvrirTableauDuGroupe(vue){
    groupeTableau = vue;
    viderLesFiltres();
    majTitreTableau();
    ouvrirVue('dashboard');
  }
  function tableauDeToutLeStock(){
    if(!groupeTableau) return;
    groupeTableau = null;
    viderLesFiltres();
    majTitreTableau();
    renderFilters();
    renderDashboard();
  }
  (function(){
    const tout = document.getElementById('tableauToutBtn');
    if(tout) tout.addEventListener('click', tableauDeToutLeStock);
    document.querySelectorAll('.dash-tab[data-dash="dashboard"]').forEach(function(t){
      t.addEventListener('click', tableauDeToutLeStock);
    });
    const menu = document.getElementById('menuTableauBord');
    if(menu) menu.addEventListener('click', tableauDeToutLeStock);
  })();

  // ---- Le « + » des Nouvel article ----
  // Posé après l'onglet « 🆕 Nouvel article » dans chaque rangée : chaque
  // pression ouvre un onglet de plus, dont on écrit aussitôt le nom des
  // articles (Vary, Menaka...), copie du premier formulaire, que son ✕ referme. Les
  // onglets ouverts et leurs noms reviennent au rechargement de la page.
  function lireOngletsNouveau(){
    try{
      const v = JSON.parse(localStorage.getItem(CLE_ONGLETS_NOUVEAU) || '[]');
      return Array.isArray(v) ? v.filter(function(n){ return Number.isInteger(n) && n >= 2; }) : [];
    }catch(e){ return []; }
  }
  function ecrireOngletsNouveau(){
    const nums = FORMULAIRES_AJOUTER
      .map(function(sfx){ return parseInt(sfx.slice('Nouveau'.length), 10); })
      .filter(function(n){ return !isNaN(n); });
    try{ localStorage.setItem(CLE_ONGLETS_NOUVEAU, JSON.stringify(nums)); }catch(e){}
  }
  function prochainNumeroNouveau(){
    let num = 2;
    try{ num = Math.max(num, (parseInt(localStorage.getItem(CLE_DERNIER_NOUVEAU), 10) || 0) + 1); }catch(e){}
    FORMULAIRES_AJOUTER.forEach(function(sfx){
      const n = parseInt(sfx.slice('Nouveau'.length), 10);
      if(!isNaN(n) && n >= num) num = n + 1;
    });
    // Un article d'un onglet refermé garde son groupe : son numéro reste pris.
    items.forEach(function(it){
      const m = /^nouveau(\d+)$/.exec(it.groupe || '');
      if(m && Number(m[1]) >= num) num = Number(m[1]) + 1;
    });
    try{ localStorage.setItem(CLE_DERNIER_NOUVEAU, String(num)); }catch(e){}
    return num;
  }

  function ouvrirVue(nom){
    if(typeof showDashView === 'function') showDashView(nom);
    if(typeof saveLastView === 'function') saveLastView();
  }

  function creerOngletNouveau(num){
    const modele = document.getElementById('dash-nouveau');
    if(!modele || document.getElementById('dash-nouveau' + num)) return;
    const sfx = 'Nouveau' + num;
    const vue = modele.cloneNode(true);
    vue.id = 'dash-nouveau' + num;
    vue.classList.remove('active');
    vue.querySelectorAll('[id]').forEach(function(el){
      if(/Nouveau$/.test(el.id)) el.id = el.id + num;
    });
    vue.querySelectorAll('label[for]').forEach(function(l){
      if(/Nouveau$/.test(l.htmlFor)) l.htmlFor = l.htmlFor + num;
    });
    vue.querySelectorAll('input').forEach(function(el){
      if(el.type === 'checkbox') el.checked = false;
      else el.value = el.defaultValue;
    });
    vue.querySelectorAll('select').forEach(function(el){ el.selectedIndex = 0; });
    const vues = document.querySelectorAll('[id^="dash-nouveau"]');
    vues[vues.length - 1].after(vue);

    document.querySelectorAll('.onglet-plus-nouveau').forEach(function(plus){
      const onglet = document.createElement('div');
      onglet.className = 'dash-tab';
      onglet.dataset.dash = 'nouveau' + num;
      onglet.innerHTML = '<span class="onglet-nom"></span>' +
        ' <span class="onglet-fermer" title="Hidio" aria-label="Hidio">✕</span>';
      ajouterCrayon(onglet);
      onglet.addEventListener('click', function(e){
        if(e.target.closest('.onglet-fermer')){ fermerOngletNouveau(num); return; }
        ouvrirVue('nouveau' + num);
      });
      plus.before(onglet);
    });

    FORMULAIRES_AJOUTER.push(sfx);
    brancherFormulaireAjouter(sfx);
    renumeroterOngletsNouveau();
    ecrireOngletsNouveau();
  }

  // Les noms d'onglet (et le titre de leur formulaire), les références
  // proposées et les tableaux de bord suivent les noms choisis.
  function renumeroterOngletsNouveau(){
    const noms = lireNomsNouveau();
    FORMULAIRES_AJOUTER.forEach(function(sfx){
      const vue = vueDe(sfx);
      const nom = nomOngletNouveau(sfx, noms);
      const titre = document.querySelector('#dash-' + vue + ' h3');
      if(titre && !sfx) titre.textContent = noms[vue] ? '📦 ' + nom : nom;
      else if(titre) titre.textContent = noms[vue] ? '🆕 ' + nom + ' (entana vaovao)' : nom + ' (entana vaovao)';
      document.querySelectorAll('.dash-tab[data-dash="' + vue + '"] .onglet-nom').forEach(function(el){
        el.textContent = nom;
      });
    });
    refreshItemRefField();
    renderTableauxNouveau();
    majTitreTableau();
    majMenuTableaux();
  }

  // Dans le menu, sous « 📊 Tableau de bord » : celui de chaque onglet
  // « Nouvel article », à son nom. Refait à chaque onglet ouvert, refermé ou
  // renommé.
  function majMenuTableaux(){
    const ancre = document.getElementById('menuTableauBord');
    if(!ancre) return;
    document.querySelectorAll('.menu-tableau-groupe').forEach(function(b){ b.remove(); });
    const noms = lireNomsNouveau();
    let apres = ancre;
    FORMULAIRES_AJOUTER.forEach(function(sfx){
      const vue = vueDe(sfx);
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'nav-action menu-tableau-groupe';
      bouton.textContent = '📊 Tableau de bord — ' + nomOngletNouveau(sfx, noms);
      bouton.addEventListener('click', function(){
        groupeTableau = vue;
        viderLesFiltres();
        majTitreTableau();
        if(typeof ouvrirDepuisLeMenu === 'function') ouvrirDepuisLeMenu('dashboard');
        else ouvrirVue('dashboard');
      });
      apres.after(bouton);
      apres = bouton;
    });
  }

  // Le nom s'écrit dans l'onglet même (prompt() n'existe pas partout) :
  // Entrée ou un clic ailleurs le garde, Échap l'abandonne, vide rend le nom
  // de départ. Les articles déjà créés gardent leur référence : seuls les
  // suivants prennent le préfixe du nouveau nom.
  function renommerOngletNouveau(vue){
    const onglets = Array.prototype.slice.call(document.querySelectorAll('.dash-tab[data-dash="' + vue + '"]'));
    const onglet = onglets.find(function(t){ return t.offsetParent !== null; }) || onglets[0];
    const span = onglet && onglet.querySelector('.onglet-nom');
    if(!span || onglet.querySelector('.onglet-saisie')) return;
    const noms = lireNomsNouveau();
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.className = 'onglet-saisie';
    champ.maxLength = 40;
    champ.value = noms[vue] || '';
    champ.placeholder = 'Ex: Vary';
    champ.setAttribute('aria-label', 'Anaran\'ny entana ao amin\'ity onglet ity');
    span.style.display = 'none';
    span.after(champ);
    champ.focus();
    let fini = false;
    function terminer(garder){
      if(fini) return;
      fini = true;
      if(garder){
        const nom = champ.value.trim().slice(0, 40);
        const n = lireNomsNouveau();
        if(nom) n[vue] = nom; else delete n[vue];
        ecrireNomsNouveau(n);
      }
      champ.remove();
      span.style.display = '';
      renumeroterOngletsNouveau();
    }
    champ.addEventListener('click', function(e){ e.stopPropagation(); });
    champ.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); terminer(true); }
      else if(e.key === 'Escape'){ e.preventDefault(); terminer(false); }
    });
    champ.addEventListener('blur', function(){ terminer(true); });
  }

  // Le ✏️ ne se montre que sur l'onglet ouvert (components.css).
  function ajouterCrayon(onglet){
    const crayon = document.createElement('span');
    crayon.className = 'onglet-crayon';
    crayon.textContent = '✏️';
    crayon.title = 'Ovay ny anarana';
    crayon.setAttribute('aria-label', 'Ovay ny anarana');
    crayon.addEventListener('click', function(e){
      e.stopPropagation();
      renommerOngletNouveau(onglet.dataset.dash);
    });
    const fermer = onglet.querySelector('.onglet-fermer');
    if(fermer) fermer.before(crayon); else onglet.appendChild(crayon);
  }

  // Ses articles restent au stock (et dans « Articles ») ; seul l'onglet et
  // son tableau s'en vont.
  function fermerOngletNouveau(num){
    const nomVue = 'nouveau' + num;
    const combien = items.filter(function(it){ return it.groupe === nomVue; }).length;
    if(combien && !confirm('Misy entana ' + combien + ' noforonina tao amin\'ity onglet ity. Mijanona ao amin\'ny stock izy ireo, fa tsy hanana tableau de bord manokana intsony. Hidio ve ?')) return;
    const vue = document.getElementById('dash-' + nomVue);
    const etaitAffichee = vue && vue.classList.contains('active');
    if(vue) vue.remove();
    document.querySelectorAll('.dash-tab[data-dash="' + nomVue + '"]').forEach(function(t){ t.remove(); });
    const noms = lireNomsNouveau();
    if(noms[nomVue]){ delete noms[nomVue]; ecrireNomsNouveau(noms); }
    const i = FORMULAIRES_AJOUTER.indexOf('Nouveau' + num);
    if(i >= 0) FORMULAIRES_AJOUTER.splice(i, 1);
    renumeroterOngletsNouveau();
    ecrireOngletsNouveau();
    if(etaitAffichee) ouvrirVue('nouveau');
  }

  document.querySelectorAll('.dash-tab[data-dash="ajouter"]').forEach(function(onglet){
    onglet.innerHTML = '<span class="onglet-nom">' + onglet.innerHTML + '</span>';
    ajouterCrayon(onglet);
  });
  document.querySelectorAll('.dash-tab[data-dash="nouveau"]').forEach(function(onglet){
    onglet.innerHTML = '<span class="onglet-nom">' + onglet.innerHTML + '</span>';
    ajouterCrayon(onglet);
    const plus = document.createElement('div');
    plus.className = 'dash-tab onglet-plus-nouveau';
    plus.textContent = '+';
    plus.title = 'Nouvel article hafa';
    plus.setAttribute('role', 'button');
    plus.setAttribute('aria-label', 'Sokafy onglet Nouvel article hafa');
    // L'onglet s'ouvre, et son nom (Vary, Menaka...) s'écrit tout de suite.
    plus.addEventListener('click', function(){
      const num = prochainNumeroNouveau();
      creerOngletNouveau(num);
      ouvrirVue('nouveau' + num);
      renommerOngletNouveau('nouveau' + num);
    });
    onglet.after(plus);
  });
  lireOngletsNouveau().forEach(creerOngletNouveau);
  renumeroterOngletsNouveau();

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
  // Le tableau de bord d'un seul onglet « Nouvel article » (sa vue :
  // nouveau, nouveau3...) : null pour tout le stock. Un mouvement n'a pas de
  // groupe : il suit celui de son article.
  var groupeTableau = null;
  function dansLeGroupe(o){
    if(!groupeTableau) return true;
    // Un mouvement (itemId + type) : celui de son article, s'il existe encore.
    if(o.itemId && o.type){
      const it = items.find(function(x){ return x.id === o.itemId; });
      return !!it && appartient(it, groupeTableau);
    }
    return appartient(o, groupeTableau);
  }

  function passesCatRef(o){
    if(!dansLeGroupe(o)) return false;
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
    const itemsVus = items.filter(dansLeGroupe);
    const mouvementsVus = movements.filter(dansLeGroupe);
    const daysAll = Array.from(new Set(mouvementsVus.map(function(m){ return m.day; }))).sort();
    const catsAll = Array.from(new Set(
      itemsVus.map(function(it){ return it.category || 'Sans catégorie'; })
        .concat(mouvementsVus.map(function(m){ return m.category || 'Sans catégorie'; }))
    ));
    const refsAll = Array.from(new Set(itemsVus.map(function(it){ return it.ref || '—'; })));

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
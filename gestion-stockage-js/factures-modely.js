// Le modèle Excel de facture propre à un client.
//
// Un client qui a SA facture la donne en .xlsx : on l'importe une fois, sous
// son nom, dans la page Factures. Ensuite, chaque facture faite pour lui se
// remplit dans SON classeur — ses couleurs, son logo, ses colonnes — puis sort
// en PDF (rangé dans « 📄 PDF » et imprimé, comme la facture standard), et
// peut aussi s'emporter en .xlsx rempli.
//
// Ce que l'on remplit, dans la première feuille :
//   — les repères {{client}}, {{date}}, {{numero}}, {{total}}, {{emetteur}},
//     {{societe}}, {{nif}}, {{stat}}, {{email}}, {{telephone}} ;
//   — une ligne d'articles portant {{designation}} (et {{n}}, {{qte}},
//     {{pu}}, {{montant}}) : elle est répétée pour chaque article ;
//   — sans repères, on cherche l'en-tête du tableau (Désignation, Qté, P.U.,
//     Montant…), on écrit les articles dessous, et le total en face du mot
//     « Total ». « Client : », « Date : », « Facture N° : » suivis d'une
//     case vide reçoivent aussi leur valeur.
//
// Les modèles vont en ligne quand on est connecté (table facture_modely,
// supabase-facture-modely.sql) ; sans compte, ils attendent dans ce
// navigateur (IndexedDB) et partent en ligne à la connexion suivante.
//
// ExcelJS (qui garde la mise en forme, contrairement à SheetJS) ne se charge
// qu'au premier besoin.

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';
  const EST_MPIASA = !!SUFFIXE;
  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

  function $(id) { return document.getElementById(id); }
  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cleDe(client) { return String(client || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function ab2b64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b642ab(b64) {
    const s = atob(b64);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  // ---------- Le compte (comme pdf.js) ----------
  function compte() {
    const sb = window.__sb;
    if (!sb || !sb.auth || !sb.auth.getSession) return Promise.resolve('');
    return sb.auth.getSession().then(function (r) {
      const u = r && r.data && r.data.session && r.data.session.user;
      if (!u) return '';
      if (EST_MPIASA && !/@ny-asako\.invalid$/i.test(u.email || '')) return '';
      return u.id;
    }, function () { return ''; });
  }

  // ---------- Dans ce navigateur ----------
  let promesseBase = null;
  function base() {
    if (!promesseBase) {
      promesseBase = new Promise(function (ok, non) {
        const r = indexedDB.open('nyasako_facture_modely' + SUFFIXE, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('modely', { keyPath: 'client_key' }); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { promesseBase = null; non(r.error); };
      });
    }
    return promesseBase;
  }
  function magasin(mode, action) {
    return base().then(function (db) {
      return new Promise(function (ok, non) {
        const t = db.transaction('modely', mode);
        const req = action(t.objectStore('modely'));
        t.oncomplete = function () { ok(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { non(t.error); };
      });
    });
  }

  // ---------- La liste des modèles ----------
  // { client_key, client, anarana, rakitra (base64), enLigne }
  let modely = [];
  function charger() {
    return Promise.all([compte(), magasin('readonly', function (s) { return s.getAll(); }).catch(function () { return []; })])
      .then(function (r) {
        const uid = r[0];
        let locaux = r[1] || [];
        if (!uid) { modely = locaux.map(function (m) { return Object.assign({ enLigne: false }, m); }); return; }
        const sb = window.__sb;
        return Promise.all(locaux.map(function (m) {
          return sb.from('facture_modely').upsert({
            user_id: uid, client_key: m.client_key, client: m.client, anarana: m.anarana,
            rakitra: m.rakitra, updated_at: new Date().toISOString()
          }).then(function (res) {
            if (res.error) throw res.error;
            return magasin('readwrite', function (s) { return s.delete(m.client_key); }).then(function () { return null; });
          }).catch(function (e) { console.error('modèle facture : envoi', e); return m; });
        })).then(function (restes) {
          locaux = restes.filter(Boolean);
          return sb.from('facture_modely').select('client_key,client,anarana,rakitra').order('client');
        }).then(function (res) {
          if (res.error) console.error('modèle facture : liste', res.error);
          const enLigne = (res.data || []).map(function (m) { return Object.assign({ enLigne: true }, m); });
          const vus = {};
          enLigne.forEach(function (m) { vus[m.client_key] = 1; });
          modely = enLigne.concat(locaux.filter(function (m) { return !vus[m.client_key]; })
            .map(function (m) { return Object.assign({ enLigne: false }, m); }));
        });
      }).then(dessiner);
  }
  function hita(client) {
    const k = cleDe(client);
    return k ? modely.filter(function (m) { return m.client_key === k; })[0] || null : null;
  }
  function tahiry(client, fichier) {
    return fichier.arrayBuffer().then(function (buf) {
      const m = { client_key: cleDe(client), client: String(client).trim(), anarana: fichier.name, rakitra: ab2b64(buf) };
      return compte().then(function (uid) {
        if (!uid) return Promise.reject(null);
        return window.__sb.from('facture_modely').upsert(Object.assign({ user_id: uid, updated_at: new Date().toISOString() }, m))
          .then(function (res) { if (res.error) throw res.error; });
      }).catch(function (e) {
        if (e) console.error('modèle facture : envoi', e);
        return magasin('readwrite', function (s) { return s.put(m); });
      });
    }).then(charger);
  }
  function fafao(m) {
    const fait = m.enLigne
      ? window.__sb.from('facture_modely').delete().eq('client_key', m.client_key).then(function (res) { if (res.error) throw res.error; })
      : magasin('readwrite', function (s) { return s.delete(m.client_key); });
    return fait.then(charger);
  }

  // ---------- ExcelJS ----------
  let promesseExcel = null;
  function excelJs() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!promesseExcel) {
      promesseExcel = new Promise(function (ok, non) {
        const s = document.createElement('script');
        s.src = EXCELJS;
        s.crossOrigin = 'anonymous';
        s.onload = function () { ok(window.ExcelJS); };
        s.onerror = function () { promesseExcel = null; non(new Error('ExcelJS tsy tafiditra')); };
        document.head.appendChild(s);
      });
    }
    return promesseExcel;
  }

  // ---------- Remplir le modèle ----------
  // d : { client, date, numero, total, emetteur, societe, nif, stat, email,
  //       telephone, lignes: [{ n, designation, qte, pu, montant }] }
  function texteDe(cell) {
    const v = cell.value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if (v.formula || v.sharedFormula) return v.result == null ? '' : String(v.result);
      if (v.text) return String(v.text);
      if (v instanceof Date) return v.toLocaleDateString('fr-FR');
      return '';
    }
    return String(v);
  }
  // « {{total}} » seul dans sa case devient un nombre ; mêlé à du texte, il
  // s'y écrit.
  function remplacer(cell, valeurs) {
    const t = texteDe(cell);
    if (t.indexOf('{{') < 0) return false;
    const seul = /^\s*\{\{\s*([a-z_]+)\s*\}\}\s*$/i.exec(t);
    if (seul && seul[1].toLowerCase() in valeurs) { cell.value = valeurs[seul[1].toLowerCase()]; return true; }
    cell.value = t.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, function (m, k) {
      k = k.toLowerCase();
      return k in valeurs ? String(valeurs[k] == null ? '' : valeurs[k]) : m;
    });
    return true;
  }
  function valeursGenerales(d) {
    return {
      client: d.client, date: d.date, daty: d.date, numero: d.numero, laharana: d.numero,
      total: d.total, emetteur: d.emetteur, societe: d.societe, nif: d.nif, stat: d.stat,
      email: d.email, telephone: d.telephone
    };
  }
  function copierStyle(de, vers) {
    vers.height = de.height;
    de.eachCell({ includeEmpty: true }, function (c, col) {
      const x = vers.getCell(col);
      x.style = JSON.parse(JSON.stringify(c.style || {}));
    });
  }

  // Insérer des lignes : ExcelJS ne décale pas les cases fusionnées situées
  // dessous — elles resteraient à leur ancienne place, et leur texte se
  // répéterait. On les défait, on insère, on les refait plus bas.
  function refFusion(ref) {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(ref);
    if (!m) return null;
    const cn = function (l) { return l.toUpperCase().split('').reduce(function (a, ch) { return a * 26 + ch.charCodeAt(0) - 64; }, 0); };
    return { ref: ref, r1: Number(m[2]), c1: cn(m[1]), r2: Number(m[4]), c2: cn(m[3]) };
  }
  function insererEnDecalant(ws, apres, combien, inserer) {
    const aDecaler = ((ws.model && ws.model.merges) || []).map(refFusion)
      .filter(function (f) { return f && f.r1 > apres; });
    aDecaler.forEach(function (f) { ws.unMergeCells(f.ref); });
    inserer();
    aDecaler.forEach(function (f) { ws.mergeCells(f.r1 + combien, f.c1, f.r2 + combien, f.c2); });
  }

  function remplir(wb, d) {
    const ws = wb.worksheets[0];
    const gen = valeursGenerales(d);
    const n = d.lignes.length;
    // Les repères que le modèle porte déjà : leurs étiquettes (« Client : »…)
    // n'ont alors rien à recevoir de plus.
    let tousTextes = '';
    ws.eachRow({ includeEmpty: false }, function (row) { row.eachCell(function (c) { tousTextes += ' ' + texteDe(c); }); });
    const aRepere = function (k) { return new RegExp('\\{\\{\\s*' + k + '\\s*\\}\\}', 'i').test(tousTextes); };

    // 1) La ligne d'articles à repères.
    let ligneModele = 0;
    ws.eachRow({ includeEmpty: false }, function (row, r) {
      if (ligneModele) return;
      row.eachCell(function (c) { if (/\{\{\s*(designation|article|anarana)\s*\}\}/i.test(texteDe(c))) ligneModele = r; });
    });
    if (ligneModele) {
      const modeleTextes = {};
      ws.getRow(ligneModele).eachCell({ includeEmpty: true }, function (c, col) { modeleTextes[col] = c.value; });
      if (n > 1) insererEnDecalant(ws, ligneModele, n - 1, function () { ws.duplicateRow(ligneModele, n - 1, true); });
      d.lignes.forEach(function (l, i) {
        const row = ws.getRow(ligneModele + i);
        Object.keys(modeleTextes).forEach(function (col) {
          const c = row.getCell(Number(col));
          c.value = modeleTextes[col];
          remplacer(c, { n: l.n, designation: l.designation, article: l.designation, anarana: l.designation,
                         qte: l.qte, pu: l.pu, montant: l.montant });
        });
        row.commit();
      });
    } else {
      remplirSansReperes(ws, d);
    }

    // 2) Les repères généraux, partout.
    ws.eachRow({ includeEmpty: false }, function (row) {
      row.eachCell(function (c) { remplacer(c, gen); });
    });
    // 3) « Client : » / « Date : » / « Facture N° : » suivis d'une case vide.
    const etiquettes = [
      [/^\s*(client|doit|factur[ée]e?\s+[àa]|nom du client)\s*:?\s*$/i, d.client, 'client'],
      [/^\s*date( de facture)?\s*:?\s*$/i, d.date, '(date|daty)'],
      [/^\s*(facture\s*n[°o]?|n[°o]\s*(de\s*)?facture|num[ée]ro)\s*:?\s*$/i, d.numero, '(numero|laharana)']
    ].filter(function (e) { return !aRepere(e[2]); });
    ws.eachRow({ includeEmpty: false }, function (row) {
      row.eachCell(function (c, col) {
        const t = texteDe(c);
        etiquettes.forEach(function (e) {
          if (!e[0].test(t)) return;
          const voisine = row.getCell(col + 1);
          if (!texteDe(voisine) && !voisine.isMerged) voisine.value = e[1];
          else if (!texteDe(voisine) && voisine.isMerged && voisine.master === voisine) voisine.value = e[1];
        });
      });
    });
    if (wb.calcProperties) wb.calcProperties.fullCalcOnLoad = true;
    return ws;
  }

  // Sans repères : l'en-tête du tableau donne les colonnes.
  function remplirSansReperes(ws, d) {
    const motifs = {
      designation: /d[ée]signation|article|libell[ée]|produit|description|d[ée]tail/i,
      qte: /qt[ée]|quantit[ée]|nombre|isa/i,
      pu: /p\.?\s*u\.?|prix\s*unit|unit/i,
      montant: /montant|prix\s*total|^total$|sous[- ]?total|vola/i,
      n: /^\s*(n[°o]|#|r[ée]f\.?|code)\s*$/i
    };
    let entete = 0;
    const cols = {};
    ws.eachRow({ includeEmpty: false }, function (row, r) {
      if (entete) return;
      row.eachCell(function (c, col) { if (motifs.designation.test(texteDe(c))) entete = r; });
      if (!entete) return;
      row.eachCell(function (c, col) {
        const t = texteDe(c);
        Object.keys(motifs).forEach(function (k) { if (!cols[k] && motifs[k].test(t)) cols[k] = col; });
      });
    });
    if (!entete) throw new Error('Tsy hita ao amin\'ny Excel ny {{designation}} na ny lohateny « Désignation »');

    // La ligne du total, s'il y en a une sous le tableau.
    let ligneTotal = 0;
    ws.eachRow({ includeEmpty: false }, function (row, r) {
      if (ligneTotal || r <= entete) return;
      row.eachCell(function (c) {
        if (/^\s*(total|montant total|total\s*(ttc|ht|g[ée]n[ée]ral)?|net\s*[àa]\s*payer|total\s*[àa]\s*payer)\s*:?\s*$/i.test(texteDe(c))) ligneTotal = r;
      });
    });
    // Assez de lignes entre l'en-tête et le total ? Sinon on en ajoute, au
    // style de la première ligne du tableau.
    const n = d.lignes.length;
    const libres = ligneTotal ? ligneTotal - entete - 1 : n;
    if (libres < n) {
      const manque = n - Math.max(libres, 0);
      const vides = Array.from({ length: manque }, function () { return []; });
      // duplicateRow d'ExcelJS échoue sur une ligne vide : on insère, en
      // reprenant le style de la première ligne du tableau s'il y en a une.
      if (libres >= 1) insererEnDecalant(ws, entete + 1, manque, function () { ws.insertRows(entete + 2, vides, 'i'); });
      else insererEnDecalant(ws, entete, manque, function () { ws.insertRows(entete + 1, vides, 'n'); });
      if (ligneTotal) ligneTotal += manque;
    }
    d.lignes.forEach(function (l, i) {
      const row = ws.getRow(entete + 1 + i);
      if (cols.n) row.getCell(cols.n).value = l.n;
      row.getCell(cols.designation).value = l.designation;
      if (cols.qte) row.getCell(cols.qte).value = l.qte;
      if (cols.pu) row.getCell(cols.pu).value = l.pu;
      if (cols.montant) row.getCell(cols.montant).value = l.montant;
      row.commit();
    });
    // Les lignes du tableau restées vides : leurs formules d'avant n'ont
    // plus rien à calculer.
    const fin = ligneTotal || entete + n;
    for (let r = entete + 1 + n; r < fin; r++) {
      ws.getRow(r).eachCell(function (c) { if (c.value && typeof c.value === 'object' && (c.value.formula || c.value.sharedFormula)) c.value = null; });
    }
    if (ligneTotal) {
      const row = ws.getRow(ligneTotal);
      let col = cols.montant;
      if (!col) row.eachCell(function (c, k) { if (/total|payer/i.test(texteDe(c))) col = k + 1; });
      if (col) row.getCell(col).value = d.total;
    }
  }

  // ---------- La feuille en PDF ----------
  function argbVersRgb(argb) {
    if (!argb || typeof argb !== 'string' || argb.length < 6) return null;
    const h = argb.length === 8 ? argb.slice(2) : argb;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  // Les espaces insécables du format français sortent en « / » dans les
  // polices du PDF : des espaces ordinaires à la place.
  function nombreFr(v, fmt) {
    return nombreFrBrut(v, fmt).replace(/[\u00a0\u202f]/g, ' ');
  }
  function nombreFrBrut(v, fmt) {
    if (typeof v !== 'number') return String(v);
    const decimales = /0\.0+/.test(fmt || '') ? (/0\.(0+)/.exec(fmt)[1].length) : (Number.isInteger(v) ? 0 : 2);
    const t = v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    return /%/.test(fmt || '') ? (v * 100).toLocaleString('fr-FR') + ' %' : t;
  }
  function affichage(cell) {
    const v = cell.value;
    if (v == null) return '';
    if (v instanceof Date) return v.toLocaleDateString('fr-FR');
    if (typeof v === 'number') return nombreFr(v, cell.numFmt);
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if (v.formula || v.sharedFormula) {
        const r = v.result;
        if (r == null || typeof r === 'object') return r instanceof Date ? r.toLocaleDateString('fr-FR') : '';
        return typeof r === 'number' ? nombreFr(r, cell.numFmt) : String(r);
      }
      if (v.text) return String(v.text);
      return '';
    }
    return String(v);
  }
  // La zone à dessiner : la zone d'impression si le modèle en a une, sinon
  // tout ce qui porte une valeur, un fond ou une bordure.
  function zoneDe(ws) {
    const pa = ws.pageSetup && ws.pageSetup.printArea;
    const m = pa && /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/i.exec(String(pa).split(',')[0].split('!').pop());
    const colNum = function (l) { return l.toUpperCase().split('').reduce(function (a, ch) { return a * 26 + ch.charCodeAt(0) - 64; }, 0); };
    if (m) return { r1: Number(m[2]), c1: colNum(m[1]), r2: Number(m[4]), c2: colNum(m[3]) };
    let r2 = 1, c2 = 1;
    ws.eachRow({ includeEmpty: true }, function (row, r) {
      row.eachCell({ includeEmpty: true }, function (c, col) {
        const b = c.border || {};
        const plein = affichage(c) !== '' || (c.fill && c.fill.type === 'pattern' && c.fill.fgColor) || b.top || b.bottom || b.left || b.right;
        if (plein) { if (r > r2) r2 = r; if (col > c2) c2 = col; }
      });
    });
    (ws.getImages ? ws.getImages() : []).forEach(function (im) {
      const br = im.range.br;
      if (br) { r2 = Math.max(r2, Math.ceil(br.nativeRow + 1)); c2 = Math.max(c2, Math.ceil(br.nativeCol + 1)); }
    });
    return { r1: 1, c1: 1, r2: r2, c2: c2 };
  }

  function versPdf(wb, ws) {
    const { jsPDF } = window.jspdf;
    const z = zoneDe(ws);
    const largeurs = [], hauteurs = [];
    for (let c = z.c1; c <= z.c2; c++) {
      const col = ws.getColumn(c);
      largeurs.push(col.hidden ? 0 : ((col.width || 8.43) * 7 + 5) * 0.2646);   // px → mm
    }
    for (let r = z.r1; r <= z.r2; r++) {
      const row = ws.getRow(r);
      hauteurs.push(row.hidden ? 0 : (row.height || 15) * 0.3528);             // pt → mm
    }
    const totalL = largeurs.reduce(function (a, b) { return a + b; }, 0);
    const paysage = ws.pageSetup && ws.pageSetup.orientation === 'landscape';
    const page = paysage ? [297, 210] : [210, 297];
    const marge = 10;
    const k = Math.min(1, (page[0] - 2 * marge) / totalL);
    const X = [marge]; largeurs.forEach(function (w, i) { X.push(X[i] + w * k); });

    // Cellules fusionnées : la cellule maîtresse couvre tout le rectangle.
    const fusions = {};
    const couvertes = {};
    ((ws.model && ws.model.merges) || []).forEach(function (ref) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(ref);
      if (!m) return;
      const cn = function (l) { return l.toUpperCase().split('').reduce(function (a, ch) { return a * 26 + ch.charCodeAt(0) - 64; }, 0); };
      const f = { r1: Number(m[2]), c1: cn(m[1]), r2: Number(m[4]), c2: cn(m[3]) };
      fusions[f.r1 + ':' + f.c1] = f;
      for (let r = f.r1; r <= f.r2; r++) for (let c = f.c1; c <= f.c2; c++) if (r !== f.r1 || c !== f.c1) couvertes[r + ':' + c] = 1;
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: paysage ? 'landscape' : 'portrait' });
    // Découpe en pages : chaque ligne garde sa place ; une page pleine en
    // ouvre une autre.
    const Y = {};
    const pageDe = {};
    let y = marge, p = 0;
    for (let r = z.r1; r <= z.r2; r++) {
      const h = hauteurs[r - z.r1] * k;
      if (y + h > page[1] - marge && y > marge) { p++; y = marge; }
      Y[r] = y; pageDe[r] = p; y += h;
    }
    for (let i = 0; i < p; i++) pdf.addPage('a4', paysage ? 'landscape' : 'portrait');

    function hauteurEntre(r1, r2) {
      let s = 0;
      for (let r = r1; r <= r2; r++) if (pageDe[r] === pageDe[r1]) s += hauteurs[r - z.r1] * k;
      return s;
    }
    for (let r = z.r1; r <= z.r2; r++) {
      if (!hauteurs[r - z.r1]) continue;
      pdf.setPage(pageDe[r] + 1);
      const row = ws.getRow(r);
      for (let c = z.c1; c <= z.c2; c++) {
        if (couvertes[r + ':' + c] || !largeurs[c - z.c1]) continue;
        const cell = row.getCell(c);
        const f = fusions[r + ':' + c];
        const x = X[c - z.c1];
        const w = X[Math.min(f ? f.c2 : c, z.c2) - z.c1 + 1] - x;
        const h = f ? hauteurEntre(r, Math.min(f.r2, z.r2)) : hauteurs[r - z.r1] * k;
        const yy = Y[r];

        const fond = cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern !== 'none' && cell.fill.fgColor
          ? argbVersRgb(cell.fill.fgColor.argb) : null;
        if (fond) { pdf.setFillColor(fond[0], fond[1], fond[2]); pdf.rect(x, yy, w, h, 'F'); }

        const b = cell.border || {};
        const trait = function (cote, x1, y1, x2, y2) {
          const s = b[cote];
          if (!s || !s.style) return;
          const col = argbVersRgb(s.color && s.color.argb) || [0, 0, 0];
          pdf.setDrawColor(col[0], col[1], col[2]);
          pdf.setLineWidth(/thick/.test(s.style) ? 0.6 : /medium/.test(s.style) ? 0.4 : 0.2);
          pdf.line(x1, y1, x2, y2);
        };
        trait('top', x, yy, x + w, yy);
        trait('bottom', x, yy + h, x + w, yy + h);
        trait('left', x, yy, x, yy + h);
        trait('right', x + w, yy, x + w, yy + h);

        const texte = affichage(cell);
        if (!texte) continue;
        const font = cell.font || {};
        const taille = (font.size || 11) * k;
        pdf.setFont('helvetica', font.bold && font.italic ? 'bolditalic' : font.bold ? 'bold' : font.italic ? 'italic' : 'normal');
        pdf.setFontSize(taille);
        const coul = argbVersRgb(font.color && font.color.argb) || [0, 0, 0];
        pdf.setTextColor(coul[0], coul[1], coul[2]);
        const al = cell.alignment || {};
        const nombre = typeof cell.value === 'number' || (cell.value && typeof cell.value.result === 'number');
        const horiz = al.horizontal || (nombre ? 'right' : 'left');
        const pad = 0.8;
        const tx = horiz === 'center' || horiz === 'centerContinuous' ? x + w / 2 : horiz === 'right' ? x + w - pad : x + pad;
        const align = horiz === 'center' || horiz === 'centerContinuous' ? 'center' : horiz === 'right' ? 'right' : 'left';
        const lh = taille * 0.3528 * 1.15;
        let lignes = al.wrapText ? pdf.splitTextToSize(texte, Math.max(w - 2 * pad, 1)) : [texte];
        const vert = al.vertical || 'bottom';
        const bloc = lignes.length * lh;
        let ty = vert === 'top' ? yy + lh * 0.85 : vert === 'middle' || vert === 'center' ? yy + (h - bloc) / 2 + lh * 0.8 : yy + h - bloc + lh * 0.75;
        lignes.forEach(function (l) { pdf.text(String(l), tx, ty, { align: align }); ty += lh; });
      }
    }

    // Les images du modèle (logo, cachet…), à leur place.
    (ws.getImages ? ws.getImages() : []).forEach(function (im) {
      try {
        const img = wb.getImage(Number(im.imageId));
        if (!img || !img.buffer) return;
        const tl = im.range.tl;
        const r0 = Math.floor(tl.nativeRow != null ? tl.nativeRow : tl.row) + 1;
        const c0 = Math.floor(tl.nativeCol != null ? tl.nativeCol : tl.col) + 1;
        if (r0 < z.r1 || r0 > z.r2 || c0 < z.c1 || c0 > z.c2) return;
        const fx = (tl.col - Math.floor(tl.col)) || 0, fy = (tl.row - Math.floor(tl.row)) || 0;
        const x = X[c0 - z.c1] + fx * largeurs[c0 - z.c1] * k;
        const y0 = Y[r0] + fy * hauteurs[r0 - z.r1] * k;
        let w, h;
        if (im.range.ext) { w = im.range.ext.width * 0.2646 * k; h = im.range.ext.height * 0.2646 * k; }
        else {
          const br = im.range.br;
          const c1 = Math.min(Math.floor(br.col) + 1, z.c2 + 1), r1 = Math.min(Math.floor(br.row) + 1, z.r2);
          w = (X[c1 - z.c1] || X[X.length - 1]) - x;
          h = (Y[r1] || y0 + 20) - y0;
        }
        const ext = String(img.extension || 'png').toUpperCase().replace('JPG', 'JPEG');
        const data = 'data:image/' + ext.toLowerCase() + ';base64,' + ab2b64(img.buffer);
        pdf.setPage(pageDe[r0] + 1);
        pdf.addImage(data, ext, x, y0, w, h);
      } catch (e) { console.error('modèle facture : image', e); }
    });
    return pdf.output('blob');
  }

  // ---------- Pour factures.js ----------
  function remplirModele(m, d) {
    return excelJs().then(function (ExcelJS) {
      const wb = new ExcelJS.Workbook();
      return wb.xlsx.load(b642ab(m.rakitra)).then(function () { return { wb: wb, ws: remplir(wb, d) }; });
    });
  }
  function pdf(m, d) {
    return remplirModele(m, d).then(function (x) { return versPdf(x.wb, x.ws); });
  }
  function xlsx(m, d) {
    return remplirModele(m, d).then(function (x) { return x.wb.xlsx.writeBuffer(); }).then(function (buf) {
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }
  window.__factureModely = { hita: hita, pdf: pdf, xlsx: xlsx };

  // ---------- Dans la page Factures ----------
  function telecharger(nom, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function dessiner() {
    const boite = $('invoiceModelyBox');
    const champ = $('invoiceCustomer');
    if (!boite || !champ) return;
    const client = champ.value.trim();
    const m = hita(client);
    const bExcel = $('excelInvoiceBtn');
    if (bExcel) bExcel.style.display = m ? '' : 'none';
    boite.innerHTML =
      '<div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">' +
        '<strong style="font-size:0.85rem;">📊 Modèle Excel du client :</strong>' +
        (m
          ? '<span style="color:var(--cyan); font-size:0.85rem;">✓ ' + html(m.anarana) + (m.enLigne ? ' ☁' : ' 📱') + '</span>'
          : '<span style="color:var(--muted); font-size:0.82rem;">' +
              (client ? 'aucun — la facture standard sera utilisée' : 'aucun client choisi') + '</span>') +
      '</div>' +
      '<div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.5rem;">' +
        // Le fichier Excel que le client a donné : il se dépose ici, sous son nom.
        '<label class="btn btn-sm" style="width:auto; cursor:pointer;">' +
          '📥 ' + (m ? 'Remplacer' : 'Télécharger') + ' le modèle facture du client (.xlsx)' +
          '<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-modely-ampidiro style="display:none;"></label>' +
        (m ? '<button type="button" class="btn btn-sm" data-modely-alaina style="width:auto;">⬇ Modèle</button>' +
             '<button type="button" class="btn btn-sm" data-modely-fafao style="width:auto;">✕ Retirer</button>' : '') +
      '</div>' +
      (modely.length
        ? '<div style="margin-top:0.6rem; font-size:0.78rem; color:var(--muted);">Clients avec modèle : ' +
            modely.map(function (x) {
              return '<button type="button" class="btn btn-sm" data-modely-client="' + html(x.client) + '" ' +
                'style="width:auto; padding:0.15rem 0.5rem; margin:0.15rem 0.2rem 0 0;">' + html(x.client) + '</button>';
            }).join('') + '</div>'
        : '');

    const input = boite.querySelector('[data-modely-ampidiro]');
    if (input) input.addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      // Sans nom de client écrit, on le demande — le nom du fichier en
      // proposition — et il remplit le champ.
      let pour = client;
      if (!pour) {
        pour = String(prompt('Nom du client pour ce modèle :', f.name.replace(/\.xlsx?$/i, '')) || '').trim();
        if (!pour) return;
        champ.value = pour;
      }
      // Le modèle posé, on montre tout de suite la facture qu'il donne.
      tahiry(pour, f).then(function () {
        if (window.__apercuFacture) window.__apercuFacture();
      }, function (err) { alert('Modèle non enregistré : ' + ((err && err.message) || 'erreur')); });
    });
    const bAlaina = boite.querySelector('[data-modely-alaina]');
    if (bAlaina) bAlaina.addEventListener('click', function () {
      telecharger(m.anarana, new Blob([b642ab(m.rakitra)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    });
    const bFafao = boite.querySelector('[data-modely-fafao]');
    if (bFafao) bFafao.addEventListener('click', function () {
      if (confirm('Retirer le modèle Excel de « ' + m.client + ' » ?')) fafao(m).catch(function (err) { alert('Non retiré : ' + ((err && err.message) || 'erreur')); });
    });
    boite.querySelectorAll('[data-modely-client]').forEach(function (b) {
      b.addEventListener('click', function () { champ.value = b.getAttribute('data-modely-client'); dessiner(); });
    });
  }

  const champ = $('invoiceCustomer');
  if (champ) champ.addEventListener('input', dessiner);
  const nav = document.querySelector('.nav-item[data-section="factures"]');
  if (nav) nav.addEventListener('click', function () { charger(); });
  if ($('invoiceModelyBox')) charger();
})();

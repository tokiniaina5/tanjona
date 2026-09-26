// Photocopie : tableau de bord, scan, photos, photocopies.
//
// Une petite boutique de photocopie dans le menu. On scanne un papier avec
// l'appareil photo (ou une image déjà prise), on photographie, on imprime des
// copies, et le tableau de bord compte les pages faites et l'argent reçu.
//
// Les images restent dans ce navigateur : IndexedDB, parce que quelques
// photos suffisent à remplir localStorage. Le journal des copies et les prix,
// petits, vont dans localStorage. Les clés portent SUFFIXE_MPIASA (common.js),
// comme les outils de bureau.

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';
  const CLE_ASA = 'stockmanager_photocopie_asa' + SUFFIXE;
  const CLE_VIDINY = 'stockmanager_photocopie_vidiny' + SUFFIXE;
  const CHAMP = 'background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.6rem; font:inherit;';

  function $(id) { return document.getElementById(id); }
  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function quand(ms) { return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  function ariary(n) { return Math.round(n || 0).toLocaleString('fr-FR') + ' Ar'; }
  function nomFichier(t) { return String(t || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'scan'; }
  function lireJson(cle, defaut) {
    try { const v = JSON.parse(localStorage.getItem(cle)); return v == null ? defaut : v; }
    catch (e) { return defaut; }
  }
  function ecrireJson(cle, v) {
    try { localStorage.setItem(cle, JSON.stringify(v)); return true; }
    catch (e) { alert('Tsy voatahiry : feno ny toerana ao amin\'ity navigateur ity.'); return false; }
  }

  // ---------- Les images : IndexedDB ----------
  // Un enregistrement = un document : { id, type: 'scan' | 'sary', nom, at, pages: [Blob] }.
  let promesseBase = null;
  function base() {
    if (!promesseBase) {
      promesseBase = new Promise(function (ok, non) {
        const r = indexedDB.open('nyasako_photocopie' + SUFFIXE, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('fichiers', { keyPath: 'id' }); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { promesseBase = null; non(r.error); };
      });
    }
    return promesseBase;
  }
  function magasin(mode, action) {
    return base().then(function (db) {
      return new Promise(function (ok, non) {
        const t = db.transaction('fichiers', mode);
        const req = action(t.objectStore('fichiers'));
        t.oncomplete = function () { ok(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { non(t.error); };
      });
    });
  }
  let documents = [];
  function chargerDocuments() {
    return magasin('readonly', function (s) { return s.getAll(); }).then(function (tous) {
      documents = (tous || []).sort(function (a, b) { return b.at - a.at; });
    }, function (e) {
      console.error('photocopie : IndexedDB', e);
      documents = [];
    });
  }
  function garderDocument(d) {
    return magasin('readwrite', function (s) { return s.put(d); }).then(chargerDocuments);
  }
  function effacerDocument(id) {
    return magasin('readwrite', function (s) { return s.delete(id); }).then(chargerDocuments);
  }

  // Les aperçus : une URL par Blob, rendue quand l'image n'est plus montrée.
  const urls = new Map();
  function urlDe(blob) {
    if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
    return urls.get(blob);
  }
  function libererUrls(garder) {
    urls.forEach(function (u, b) {
      if (garder.indexOf(b) < 0) { URL.revokeObjectURL(u); urls.delete(b); }
    });
  }

  // ---------- Le journal des copies et les prix ----------
  // Une ligne : { id, at, nom, pejy (feuilles par exemplaire), isa (exemplaires), loko: 'nb' | 'loko', vola }.
  function lireAsa() { return lireJson(CLE_ASA, []); }
  function lireVidiny() { return Object.assign({ nb: 100, loko: 500 }, lireJson(CLE_VIDINY, {})); }
  function noterAsa(nom, pejy, isa, loko) {
    const v = lireVidiny();
    const ligne = {
      id: nouvelId(), at: Date.now(), nom: nom,
      pejy: pejy, isa: isa, loko: loko,
      vola: pejy * isa * (loko === 'loko' ? v.loko : v.nb)
    };
    const tous = lireAsa();
    tous.unshift(ligne);
    ecrireJson(CLE_ASA, tous.slice(0, 5000));
    rendreTableau();
  }

  // ---------- Traiter une image ----------
  // Rotation par quarts de tour, puis un filtre : le « taratasy » éclaircit le
  // fond gris d'une feuille photographiée et fonce l'écriture, comme une
  // photocopie.
  const FILTRES = {
    original: 'Loko voajanahary',
    gris: 'Fotsy sy mainty (gris)',
    taratasy: 'Taratasy (scan madio)'
  };
  function chargerImage(blob) {
    return new Promise(function (ok, non) {
      const img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = non;
      img.src = urlDe(blob);
    });
  }
  function traiter(blob, rotation, filtre) {
    return chargerImage(blob).then(function (img) {
      const MAX = 2200;
      const r = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * r), h = Math.round(img.naturalHeight * r);
      const quart = ((rotation || 0) % 4 + 4) % 4;
      const c = document.createElement('canvas');
      c.width = quart % 2 ? h : w;
      c.height = quart % 2 ? w : h;
      const ctx = c.getContext('2d');
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(quart * Math.PI / 2);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      if (filtre === 'gris' || filtre === 'taratasy') {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        // Pour le « taratasy » : le blanc de la feuille est pris au 90e
        // centile des luminosités, et tout ce qui l'approche devient blanc.
        let blanc = 255, noir = 0;
        if (filtre === 'taratasy') {
          const hist = new Uint32Array(256);
          for (let i = 0; i < p.length; i += 16) hist[(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0]++;
          const total = p.length / 16;
          let cumul = 0;
          for (let k = 0; k < 256; k++) {
            cumul += hist[k];
            if (cumul < total * 0.02) noir = k;
            if (cumul >= total * 0.9) { blanc = k; break; }
          }
          // Une feuille presque unie met le 2e et le 90e centile côte à côte :
          // l'écart imposé garde son fond blanc au lieu de le noircir.
          blanc = blanc * 0.92;
          noir = Math.max(0, Math.min(noir, blanc - 80));
        }
        for (let i = 0; i < p.length; i += 4) {
          let y = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
          if (filtre === 'taratasy') {
            y = (y - noir) / (blanc - noir);
            y = y >= 1 ? 255 : Math.max(0, Math.pow(Math.max(y, 0), 1.6) * 255);
          }
          p[i] = p[i + 1] = p[i + 2] = y;
        }
        ctx.putImageData(d, 0, 0);
      }
      return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.9); });
    });
  }

  // ---------- L'appareil photo ----------
  // Un seul flux à la fois, pour le scan ou pour les photos.
  let flux = null, fluxPour = null, face = 'environment';
  function fermerCamera() {
    if (flux) flux.getTracks().forEach(function (t) { t.stop(); });
    flux = null;
    ['scan', 'sary'].forEach(function (k) {
      const v = $('pc' + k + 'Video');
      if (v) v.srcObject = null;
      const zoneVideo = $('pc' + k + 'Camera');
      if (zoneVideo) zoneVideo.style.display = 'none';
    });
    fluxPour = null;
  }
  function ouvrirCamera(pour) {
    fermerCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('pc' + pour + 'Fichier').click();
      return;
    }
    dire(pour, 'Sokafy ny appareil photo…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (s) {
        flux = s; fluxPour = pour;
        const v = $('pc' + pour + 'Video');
        v.srcObject = s;
        v.play().catch(function () {});
        $('pc' + pour + 'Camera').style.display = '';
        dire(pour, pour === 'scan'
          ? 'Apetraho eo anoloana ny taratasy, dia tsindrio « Scan ity pejy ity ».'
          : 'Tsindrio « Alaina ny sary ».');
      }, function () {
        dire(pour, 'Tsy nisokatra ny appareil photo : safidio sary avy amin\'ny rakitra.', true);
        $('pc' + pour + 'Fichier').click();
      });
  }
  function prendre(pour) {
    const v = $('pc' + pour + 'Video');
    if (!flux || !v.videoWidth) return Promise.resolve(null);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.92); });
  }
  function dire(pour, texte, erreur) {
    const el = $('pc' + pour + 'Statut');
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  // ---------- Imprimer ----------
  // Une page A4 par image, ou deux par page (le recto et le verso d'une CIN
  // sur une seule feuille). Le noir et blanc passe par un filtre CSS.
  function feuillesPour(nbImages, deux) { return deux ? Math.ceil(nbImages / 2) : nbImages; }
  function imprimer(blobs, isa, loko, deux) {
    const sources = blobs.map(urlDe);
    let feuilles = '';
    for (let n = 0; n < isa; n++) {
      for (let i = 0; i < sources.length; i += deux ? 2 : 1) {
        const lot = deux ? sources.slice(i, i + 2) : [sources[i]];
        feuilles += '<div class="f ' + (deux ? 'd' : 'u') + '">' +
          lot.map(function (s) { return '<img src="' + s + '">'; }).join('') + '</div>';
      }
    }
    const ifr = document.createElement('iframe');
    ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
    document.body.appendChild(ifr);
    const d = ifr.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><title>Photocopie</title><style>' +
      '@page{size:A4;margin:10mm}html,body{margin:0;background:#fff}' +
      '.f{height:276mm;display:flex;flex-direction:column;align-items:center;justify-content:space-around;break-after:page;page-break-after:always;overflow:hidden}' +
      '.f:last-child{break-after:auto;page-break-after:auto}' +
      'img{max-width:190mm;object-fit:contain;display:block}.u img{max-height:274mm}.d img{max-height:134mm}' +
      (loko === 'nb' ? 'img{filter:grayscale(1)}' : '') +
      '</style></head><body>' + feuilles + '</body></html>');
    d.close();
    const images = Array.prototype.slice.call(d.images);
    Promise.all(images.map(function (im) {
      return im.complete ? null : new Promise(function (ok) { im.onload = im.onerror = ok; });
    })).then(function () {
      ifr.contentWindow.focus();
      ifr.contentWindow.print();
      setTimeout(function () { ifr.remove(); }, 60000);
    });
  }

  // ---------- PDF ----------
  function blobVersDataUrl(blob) {
    return new Promise(function (ok, non) {
      const r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = non;
      r.readAsDataURL(blob);
    });
  }
  // Le même rendu que l'impression, en fichier : on l'emporte sur une clé et
  // on l'imprime sur la machine de la boutique. Mêmes réglages : exemplaires,
  // noir et blanc (les pixels passés en gris, un PDF n'a pas de filtre CSS),
  // une ou deux images par page.
  function exporterPdf(nom, blobs, options) {
    const o = Object.assign({ isa: 1, loko: 'loko', deux: false }, options);
    if (!window.jspdf) { alert('Tsy tafiditra ny bibliotheka PDF.'); return Promise.resolve(false); }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    // Chaque image n'est préparée qu'une fois, même copiée vingt fois.
    return Promise.all(blobs.map(function (b) {
      const pret = o.loko === 'nb' ? traiter(b, 0, 'gris') : Promise.resolve(b);
      return pret.then(function (x) {
        return Promise.all([blobVersDataUrl(x), chargerImage(x)]);
      }).then(function (r) { return { data: r[0], w: r[1].naturalWidth, h: r[1].naturalHeight }; });
    })).then(function (images) {
      const parFeuille = o.deux ? 2 : 1;
      const hauteurCase = o.deux ? 138 : 277;
      let premiere = true;
      for (let n = 0; n < o.isa; n++) {
        for (let i = 0; i < images.length; i += parFeuille) {
          if (!premiere) pdf.addPage();
          premiere = false;
          images.slice(i, i + parFeuille).forEach(function (im, j) {
            const k = Math.min(190 / im.w, hauteurCase / im.h);
            const w = im.w * k, h = im.h * k;
            const haut = 10 + j * (hauteurCase + 1) + (hauteurCase - h) / 2;
            pdf.addImage(im.data, 'JPEG', (210 - w) / 2, o.deux ? haut : (297 - h) / 2, w, h, undefined, 'FAST');
          });
        }
      }
      pdf.save(nomFichier(nom) + '.pdf');
      return true;
    }, function (e) {
      console.error('photocopie PDF', e);
      alert('Tsy vita ny PDF.');
      return false;
    });
  }
  function telecharger(nom, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ======================= LA PAGE =======================
  function racine() { return document.querySelector('#section-photocopie .photocopie'); }

  function construire() {
    const z = racine();
    if (!z) return false;
    z.innerHTML =
      '<div class="section-head"><div><h2>📠 Photocopie</h2>' +
        '<p>Scan, sary ary photocopie. Ao amin\'ity navigateur ity ihany no voatahiry ny sary.</p></div></div>' +
      // pc-onglet et non dash-tab : common.js retire « active » à tous les
      // .dash-tab quand il change de vue.
      '<div class="dash-tabs" id="pcOnglets">' +
        '<div class="pc-onglet active" data-pc="tableau">📊 Tableau de bord</div>' +
        '<div class="pc-onglet" data-pc="scan">📠 Scan</div>' +
        '<div class="pc-onglet" data-pc="sary">📷 Maka sary</div>' +
        '<div class="pc-onglet" data-pc="kopia">🖨️ Photocopie</div>' +
      '</div>' +

      // ----- Tableau de bord -----
      '<div data-volet="tableau">' +
        '<div class="kpi-row">' +
          kpi('Pejy natao androany', 'pcKpiPejyAndro', '0') +
          kpi('Pejy natao ity volana ity', 'pcKpiPejyVolana', '0') +
          kpi('Vola androany', 'pcKpiVolaAndro', '0 Ar') +
          kpi('Vola ity volana ity', 'pcKpiVolaVolana', '0 Ar') +
          kpi('Vola hatramin\'izao', 'pcKpiVolaTotal', '0 Ar') +
          kpi('Scan voatahiry', 'pcKpiScan', '0') +
          kpi('Sary voatahiry', 'pcKpiSary', '0') +
        '</div>' +
        '<div class="chart-grid">' +
          '<div class="chart-panel"><h4>Pejy isan\'andro (14 andro farany)</h4><div class="chart-box" style="height:220px;"><canvas id="pcChartAndro"></canvas></div></div>' +
          '<div class="chart-panel"><h4>Mainty / Miloko (ity volana ity)</h4><div class="chart-box" style="height:220px;"><canvas id="pcChartLoko"></canvas></div></div>' +
        '</div>' +
        '<div class="panel" style="margin-top:1rem;">' +
          '<h3>📜 Photocopie natao</h3>' +
          '<div id="pcHistorique" style="overflow-x:auto;"></div>' +
        '</div>' +
      '</div>' +

      // ----- Scan -----
      '<div data-volet="scan" style="display:none;">' +
        '<div class="panel">' +
          '<h3>📠 Scan taratasy</h3>' +
          boutonsCamera('scan', '📸 Scan ity pejy ity') +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin:0.8rem 0;">' +
            '<label for="pcScanFiltre" style="font-size:0.8rem; color:var(--muted);">Endrika</label>' +
            '<select id="pcScanFiltre" style="' + CHAMP + '">' +
              Object.keys(FILTRES).map(function (k) {
                return '<option value="' + k + '"' + (k === 'taratasy' ? ' selected' : '') + '>' + FILTRES[k] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div id="pcScanPejy" style="display:flex; gap:0.6rem; flex-wrap:wrap;"></div>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-top:0.9rem;">' +
            '<input type="text" id="pcScanNom" placeholder="Anaran\'ny scan" style="' + CHAMP + ' flex:1; min-width:10rem;">' +
            '<button type="button" class="btn btn-primary btn-sm" id="pcScanTehirizo" style="width:auto;">💾 Tehirizo</button>' +
            '<button type="button" class="btn btn-sm" id="pcScanPdf" style="width:auto;">⬇ PDF</button>' +
            '<button type="button" class="btn btn-sm" id="pcScanKopia" style="width:auto;">🖨️ Photocopie</button>' +
            '<button type="button" class="btn btn-sm" id="pcScanVidio" style="width:auto;">🗑 Esory daholo</button>' +
          '</div>' +
        '</div>' +
        '<div class="panel" style="margin-top:1rem;"><h3>🗂️ Scan voatahiry</h3><div id="pcScanLisitra"></div></div>' +
      '</div>' +

      // ----- Photos -----
      '<div data-volet="sary" style="display:none;">' +
        '<div class="panel">' +
          '<h3>📷 Maka sary</h3>' +
          boutonsCamera('sary', '📸 Alaina ny sary') +
        '</div>' +
        '<div class="panel" style="margin-top:1rem;"><h3>🖼️ Sary voatahiry</h3><div id="pcSaryLisitra"></div></div>' +
      '</div>' +

      // ----- Photocopie -----
      '<div data-volet="kopia" style="display:none;">' +
        '<div class="panel">' +
          '<h3>🖨️ Photocopie</h3>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">' +
            '<select id="pcKopiaLoharano" style="' + CHAMP + ' flex:1; min-width:12rem;" aria-label="Antontan-taratasy"></select>' +
            '<button type="button" class="btn btn-sm" id="pcKopiaHampiditra" style="width:auto;">📂 Hampiditra sary</button>' +
            '<input type="file" id="pcKopiaFichier" accept="image/*" multiple style="display:none;">' +
          '</div>' +
          '<div id="pcKopiaTopy" style="display:flex; gap:0.6rem; flex-wrap:wrap; margin:0.9rem 0;"></div>' +
          '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(10rem, 1fr)); gap:0.7rem;">' +
            champ('pcKopiaIsa', 'Isa (exemplaire)', '<input type="number" id="pcKopiaIsa" min="1" max="500" value="1" style="' + CHAMP + ' width:100%; box-sizing:border-box;">') +
            champ('pcKopiaLoko', 'Loko', '<select id="pcKopiaLoko" style="' + CHAMP + ' width:100%;"><option value="nb">⚫ Mainty sy fotsy</option><option value="loko">🌈 Miloko</option></select>') +
            champ('pcKopiaFandaminana', 'Fandaminana', '<select id="pcKopiaFandaminana" style="' + CHAMP + ' width:100%;"><option value="1">Sary 1 isaky ny pejy</option><option value="2">Sary 2 isaky ny pejy (CIN recto-verso)</option></select>') +
          '</div>' +
          '<p id="pcKopiaVola" style="font-size:0.9rem; margin:0.9rem 0;"></p>' +
          '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
            '<button type="button" class="btn btn-primary btn-sm" id="pcKopiaAtonta" style="width:auto;">🖨️ Atonta amin\'ny imprimante</button>' +
            '<button type="button" class="btn btn-sm" id="pcKopiaPdf" style="width:auto;">📄 PDF (hatonta amin\'ny milina)</button>' +
          '</div>' +
          '<p id="pcKopiaStatut" style="font-size:0.78rem; color:var(--muted); margin-top:0.6rem; min-height:1.1em;"></p>' +
        '</div>' +

        // Les copies faites sur la vraie machine : elles comptent aussi.
        '<div class="panel" style="margin-top:1rem;">' +
          '<h3>✍️ Photocopie natao tamin\'ny milina</h3>' +
          '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(9rem, 1fr)); gap:0.7rem; align-items:end;">' +
            champ('pcMilinaPejy', 'Pejy', '<input type="number" id="pcMilinaPejy" min="1" value="1" style="' + CHAMP + ' width:100%; box-sizing:border-box;">') +
            champ('pcMilinaIsa', 'Isa (exemplaire)', '<input type="number" id="pcMilinaIsa" min="1" value="1" style="' + CHAMP + ' width:100%; box-sizing:border-box;">') +
            champ('pcMilinaLoko', 'Loko', '<select id="pcMilinaLoko" style="' + CHAMP + ' width:100%;"><option value="nb">⚫ Mainty sy fotsy</option><option value="loko">🌈 Miloko</option></select>') +
            '<button type="button" class="btn btn-primary btn-sm" id="pcMilinaAmpidiro" style="width:auto;">➕ Ampidiro</button>' +
          '</div>' +
        '</div>' +

        '<div class="panel" style="margin-top:1rem;">' +
          '<h3>💲 Vidiny isaky ny pejy</h3>' +
          '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(9rem, 1fr)); gap:0.7rem; align-items:end;">' +
            champ('pcVidinyNb', 'Mainty sy fotsy (Ar)', '<input type="number" id="pcVidinyNb" min="0" step="10" style="' + CHAMP + ' width:100%; box-sizing:border-box;">') +
            champ('pcVidinyLoko', 'Miloko (Ar)', '<input type="number" id="pcVidinyLoko" min="0" step="10" style="' + CHAMP + ' width:100%; box-sizing:border-box;">') +
            '<button type="button" class="btn btn-sm" id="pcVidinyTehirizo" style="width:auto;">💾 Tehirizo</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return true;
  }
  function kpi(label, id, v) {
    return '<div class="kpi-card"><div class="kpi-label">' + label + '</div><div class="kpi-value" id="' + id + '">' + v + '</div></div>';
  }
  function champ(id, label, controle) {
    return '<div><label for="' + id + '" style="display:block; font-size:0.75rem; color:var(--muted); margin-bottom:0.3rem;">' + label + '</label>' + controle + '</div>';
  }
  function boutonsCamera(pour, libelle) {
    return '<div style="display:flex; gap:0.6rem; flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-primary btn-sm" data-camera="' + pour + '" style="width:auto;">📷 Sokafy ny appareil photo</button>' +
        '<button type="button" class="btn btn-sm" data-fichier="' + pour + '" style="width:auto;">🖼️ Hampiditra sary</button>' +
        '<input type="file" id="pc' + pour + 'Fichier" accept="image/*" multiple style="display:none;">' +
      '</div>' +
      '<p id="pc' + pour + 'Statut" style="font-size:0.78rem; color:var(--muted); margin:0.6rem 0 0; min-height:1.1em;"></p>' +
      '<div id="pc' + pour + 'Camera" style="display:none; margin-top:0.6rem;">' +
        '<video id="pc' + pour + 'Video" playsinline muted style="width:100%; max-height:60vh; background:#000; border-radius:12px; object-fit:contain;"></video>' +
        '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.6rem;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-prendre="' + pour + '" style="width:auto;">' + libelle + '</button>' +
          '<button type="button" class="btn btn-sm" data-retourner="' + pour + '" style="width:auto;">🔄 Ovay ny appareil</button>' +
          '<button type="button" class="btn btn-sm" data-fermer="' + pour + '" style="width:auto;">✖ Hidio</button>' +
        '</div>' +
      '</div>';
  }

  // ---------- Onglets ----------
  let volet = 'tableau';
  function montrer(nom) {
    volet = nom;
    const z = racine();
    z.querySelectorAll('.pc-onglet').forEach(function (o) { o.classList.toggle('active', o.dataset.pc === nom); });
    z.querySelectorAll('[data-volet]').forEach(function (v) { v.style.display = v.dataset.volet === nom ? '' : 'none'; });
    fermerCamera();
    if (nom === 'tableau') rendreTableau();
    if (nom === 'scan') { rendreScanPejy(); rendreListe('scan'); }
    if (nom === 'sary') rendreListe('sary');
    if (nom === 'kopia') rendreKopia();
  }

  // ---------- Tableau de bord ----------
  const graphiques = {};
  function debutJour(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function rendreTableau() {
    const z = racine();
    if (!z || !$('pcKpiPejyAndro')) return;
    const asa = lireAsa();
    const auj = debutJour(Date.now());
    const mois = new Date(); mois.setDate(1); mois.setHours(0, 0, 0, 0);
    let pejyAndro = 0, pejyVolana = 0, volaAndro = 0, volaVolana = 0, volaTotal = 0, nbVolana = 0, lokoVolana = 0;
    asa.forEach(function (a) {
      const pejy = a.pejy * a.isa;
      volaTotal += a.vola;
      if (a.at >= auj) { pejyAndro += pejy; volaAndro += a.vola; }
      if (a.at >= mois.getTime()) {
        pejyVolana += pejy; volaVolana += a.vola;
        if (a.loko === 'loko') lokoVolana += pejy; else nbVolana += pejy;
      }
    });
    $('pcKpiPejyAndro').textContent = pejyAndro.toLocaleString('fr-FR');
    $('pcKpiPejyVolana').textContent = pejyVolana.toLocaleString('fr-FR');
    $('pcKpiVolaAndro').textContent = ariary(volaAndro);
    $('pcKpiVolaVolana').textContent = ariary(volaVolana);
    $('pcKpiVolaTotal').textContent = ariary(volaTotal);
    $('pcKpiScan').textContent = documents.filter(function (d) { return d.type === 'scan'; }).length;
    $('pcKpiSary').textContent = documents.filter(function (d) { return d.type === 'sary'; }).length;

    // Historique
    const h = $('pcHistorique');
    if (!asa.length) {
      h.innerHTML = '<p style="font-size:0.8rem; color:var(--muted);">Mbola tsy misy photocopie natao.</p>';
    } else {
      h.innerHTML = '<table style="width:100%; font-size:0.8rem; margin-top:0;"><thead><tr>' +
        '<th>Daty</th><th>Antontan-taratasy</th><th>Pejy × Isa</th><th>Loko</th><th>Vola</th><th></th></tr></thead><tbody>' +
        asa.slice(0, 100).map(function (a) {
          return '<tr><td>' + quand(a.at) + '</td><td>' + html(a.nom) + '</td><td>' + a.pejy + ' × ' + a.isa +
            '</td><td>' + (a.loko === 'loko' ? '🌈 Miloko' : '⚫ Mainty') + '</td><td>' + ariary(a.vola) +
            '</td><td><button type="button" class="btn btn-sm" data-esory-asa="' + a.id + '" style="width:auto;" aria-label="Fafao">🗑</button></td></tr>';
        }).join('') + '</tbody></table>';
    }

    if (!window.Chart) return;
    const styles = getComputedStyle(document.documentElement);
    const accent = (styles.getPropertyValue('--cyan') || '#3fd0c9').trim();
    const muted = (styles.getPropertyValue('--muted') || '#7c8b92').trim();
    const jours = [], valeurs = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(auj); d.setDate(d.getDate() - i);
      const debut = d.getTime();
      const fin = new Date(debut); fin.setDate(fin.getDate() + 1);
      jours.push(d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
      valeurs.push(asa.reduce(function (s, a) { return s + (a.at >= debut && a.at < fin.getTime() ? a.pejy * a.isa : 0); }, 0));
    }
    dessiner('pcChartAndro', {
      type: 'bar',
      data: { labels: jours, datasets: [{ label: 'Pejy', data: valeurs, backgroundColor: accent, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: muted } }, y: { beginAtZero: true, ticks: { color: muted, precision: 0 } } } }
    });
    dessiner('pcChartLoko', {
      type: 'doughnut',
      data: { labels: ['Mainty sy fotsy', 'Miloko'], datasets: [{ data: [nbVolana, lokoVolana], backgroundColor: [muted, accent], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: muted } } } }
    });
  }
  function dessiner(id, config) {
    const c = $(id);
    if (!c) return;
    if (graphiques[id]) graphiques[id].destroy();
    try { graphiques[id] = new Chart(c, config); } catch (e) { console.error('photocopie graphique', e); }
  }

  // ---------- Scan en cours ----------
  // Les pages gardent l'image d'origine et leur rotation : changer de filtre
  // ne dégrade rien.
  let scanPejy = [];   // { original: Blob, rotation, rendu: Blob | null }
  function filtreScan() { return ($('pcScanFiltre') || {}).value || 'taratasy'; }
  function rendrePage(p) {
    return traiter(p.original, p.rotation, filtreScan()).then(function (b) { p.rendu = b; return b; });
  }
  function ajouterPagesScan(blobs) {
    blobs.forEach(function (b) { scanPejy.push({ original: b, rotation: 0, rendu: null }); });
    dire('scan', 'Mikarakara ny pejy…');
    return Promise.all(scanPejy.filter(function (p) { return !p.rendu; }).map(rendrePage)).then(function () {
      dire('scan', scanPejy.length + ' pejy vonona. Afaka manampy pejy hafa na mitahiry.');
      rendreScanPejy();
    });
  }
  function rendreScanPejy() {
    const box = $('pcScanPejy');
    if (!box) return;
    if (!scanPejy.length) {
      box.innerHTML = '<p style="font-size:0.8rem; color:var(--muted);">Mbola tsy misy pejy voascan.</p>';
      return;
    }
    box.innerHTML = scanPejy.map(function (p, i) {
      return '<div style="width:8.5rem; text-align:center;">' +
        '<img src="' + (p.rendu ? urlDe(p.rendu) : '') + '" alt="Pejy ' + (i + 1) + '" style="width:100%; aspect-ratio:1/1.414; object-fit:contain; background:#fff; border:1px solid var(--line); border-radius:8px;">' +
        '<div style="font-size:0.72rem; color:var(--muted); margin:0.2rem 0;">Pejy ' + (i + 1) + '</div>' +
        '<div style="display:flex; gap:0.3rem; justify-content:center;">' +
          '<button type="button" class="btn btn-sm" data-ahodina="' + i + '" style="width:auto;" aria-label="Ahodina">⟳</button>' +
          (i ? '<button type="button" class="btn btn-sm" data-akarina="' + i + '" style="width:auto;" aria-label="Aroso">◀</button>' : '') +
          '<button type="button" class="btn btn-sm" data-esory-pejy="' + i + '" style="width:auto;" aria-label="Esory">✖</button>' +
        '</div></div>';
    }).join('');
  }
  function pagesPretes() { return scanPejy.map(function (p) { return p.rendu; }).filter(Boolean); }

  // ---------- Listes de documents ----------
  function rendreListe(type) {
    const box = $(type === 'scan' ? 'pcScanLisitra' : 'pcSaryLisitra');
    if (!box) return;
    const liste = documents.filter(function (d) { return d.type === type; });
    if (!liste.length) {
      box.innerHTML = '<p style="font-size:0.8rem; color:var(--muted);">' + (type === 'scan' ? 'Mbola tsy misy scan voatahiry.' : 'Mbola tsy misy sary voatahiry.') + '</p>';
      return;
    }
    box.innerHTML = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(9.5rem, 1fr)); gap:0.8rem;">' +
      liste.map(function (d) {
        return '<div style="border:1px solid var(--line); border-radius:12px; padding:0.5rem; background:var(--panel-2);">' +
          '<img src="' + urlDe(d.pages[0]) + '" alt="" style="width:100%; aspect-ratio:' + (type === 'scan' ? '1/1.414' : '4/3') + '; object-fit:' + (type === 'scan' ? 'contain' : 'cover') + '; background:#fff; border-radius:8px; display:block;">' +
          '<div style="font-size:0.8rem; margin-top:0.4rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + html(d.nom) + '">' + html(d.nom) + '</div>' +
          '<div style="font-size:0.7rem; color:var(--muted);">' + (type === 'scan' ? d.pages.length + ' pejy · ' : '') + quand(d.at) + '</div>' +
          '<div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:0.4rem;">' +
            // Imprimer tout de suite, ou le PDF à imprimer sur la machine.
            '<button type="button" class="btn btn-sm" data-atonta="' + d.id + '" style="width:auto;" title="Atonta amin\'ny imprimante">🖨️ Atonta</button>' +
            '<button type="button" class="btn btn-sm" data-pdf="' + d.id + '" style="width:auto;" title="PDF">📄 PDF</button>' +
            (type === 'sary'
              ? '<button type="button" class="btn btn-sm" data-alaina="' + d.id + '" style="width:auto;" title="Alaina ny sary (.jpg)">⬇</button>'
              : '') +
            '<button type="button" class="btn btn-sm" data-kopia="' + d.id + '" style="width:auto;" title="Photocopie">📑</button>' +
            '<button type="button" class="btn btn-sm" data-esory-doc="' + d.id + '" style="width:auto;" aria-label="Fafao">🗑</button>' +
          '</div></div>';
      }).join('') + '</div>';
  }

  // ---------- Photocopie ----------
  let kopiaImport = null;          // { nom, pages } importé pour cette fois
  let kopiaChoix = '';             // id du document choisi, ou 'import'
  function sourceKopia() {
    if (kopiaChoix === 'import') return kopiaImport;
    return documents.filter(function (d) { return d.id === kopiaChoix; })[0] || null;
  }
  function rendreKopia() {
    const sel = $('pcKopiaLoharano');
    if (!sel) return;
    if (!kopiaChoix || (kopiaChoix !== 'import' && !sourceKopia())) {
      kopiaChoix = kopiaImport ? 'import' : (documents[0] ? documents[0].id : '');
    }
    sel.innerHTML = (documents.length || kopiaImport ? '' : '<option value="">— Mbola tsy misy scan na sary —</option>') +
      (kopiaImport ? '<option value="import">📂 ' + html(kopiaImport.nom) + '</option>' : '') +
      documents.map(function (d) {
        return '<option value="' + d.id + '">' + (d.type === 'scan' ? '📠 ' : '📷 ') + html(d.nom) +
          (d.type === 'scan' ? ' (' + d.pages.length + ' pejy)' : '') + '</option>';
      }).join('');
    sel.value = kopiaChoix;
    const v = lireVidiny();
    $('pcVidinyNb').value = v.nb;
    $('pcVidinyLoko').value = v.loko;
    const src = sourceKopia();
    $('pcKopiaTopy').innerHTML = src ? src.pages.map(function (b) {
      return '<img src="' + urlDe(b) + '" alt="" style="width:6rem; aspect-ratio:1/1.414; object-fit:contain; background:#fff; border:1px solid var(--line); border-radius:6px;' +
        ($('pcKopiaLoko').value === 'nb' ? ' filter:grayscale(1);' : '') + '">';
    }).join('') : '';
    kajyVola();
  }
  function parametresKopia() {
    return {
      isa: Math.max(1, Math.min(500, parseInt($('pcKopiaIsa').value, 10) || 1)),
      loko: $('pcKopiaLoko').value,
      deux: $('pcKopiaFandaminana').value === '2'
    };
  }
  function kajyVola() {
    const src = sourceKopia();
    const el = $('pcKopiaVola');
    if (!src) { el.textContent = ''; return; }
    const p = parametresKopia();
    const feuilles = feuillesPour(src.pages.length, p.deux);
    const prix = lireVidiny()[p.loko];
    el.innerHTML = '📄 ' + feuilles + ' pejy × ' + p.isa + ' = <strong>' + (feuilles * p.isa) + ' pejy</strong> · 💰 <strong>' +
      ariary(feuilles * p.isa * prix) + '</strong> <span style="color:var(--muted); font-size:0.78rem;">(' + ariary(prix) + ' isaky ny pejy)</span>';
  }
  function versKopia(id) {
    kopiaChoix = id;
    montrer('kopia');
  }

  // ---------- Les gestes ----------
  function lireFichiers(input) {
    const liste = Array.prototype.slice.call(input.files || []).filter(function (f) { return /^image\//.test(f.type); });
    input.value = '';
    return liste;
  }
  function brancher() {
    const z = racine();

    z.querySelector('#pcOnglets').addEventListener('click', function (e) {
      const o = e.target.closest('.pc-onglet');
      if (o) montrer(o.dataset.pc);
    });

    z.addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (!b) return;
      const ds = b.dataset;
      if (ds.camera) { ouvrirCamera(ds.camera); return; }
      if (ds.fichier) { $('pc' + ds.fichier + 'Fichier').click(); return; }
      if (ds.fermer) { fermerCamera(); dire(ds.fermer, ''); return; }
      if (ds.retourner) {
        face = face === 'environment' ? 'user' : 'environment';
        ouvrirCamera(ds.retourner);
        return;
      }
      if (ds.prendre) {
        const pour = ds.prendre;
        prendre(pour).then(function (blob) {
          if (!blob) return;
          if (pour === 'scan') ajouterPagesScan([blob]);
          else garderSary([blob]);
        });
        return;
      }
      if (ds.ahodina != null) {
        const p = scanPejy[+ds.ahodina];
        p.rotation = (p.rotation + 1) % 4;
        rendrePage(p).then(rendreScanPejy);
        return;
      }
      if (ds.akarina != null) {
        const i = +ds.akarina;
        const t = scanPejy[i - 1]; scanPejy[i - 1] = scanPejy[i]; scanPejy[i] = t;
        rendreScanPejy();
        return;
      }
      if (ds.esoryPejy != null) {
        scanPejy.splice(+ds.esoryPejy, 1);
        rendreScanPejy();
        return;
      }
      if (ds.pdf) {
        const d = documents.filter(function (x) { return x.id === ds.pdf; })[0];
        if (d) exporterPdf(d.nom, d.pages);
        return;
      }
      if (ds.atonta) {
        const d = documents.filter(function (x) { return x.id === ds.atonta; })[0];
        if (d) imprimer(d.pages, 1, 'loko', false);
        return;
      }
      if (ds.alaina) {
        const d = documents.filter(function (x) { return x.id === ds.alaina; })[0];
        if (d) telecharger(nomFichier(d.nom) + '.jpg', d.pages[0]);
        return;
      }
      if (ds.kopia) { versKopia(ds.kopia); return; }
      if (ds.esoryDoc) {
        if (!confirm('Fafana ve ity ?')) return;
        effacerDocument(ds.esoryDoc).then(function () {
          libererUrls([].concat.apply([], documents.map(function (d) { return d.pages; }))
            .concat(pagesPretes(), scanPejy.map(function (p) { return p.original; }), kopiaImport ? kopiaImport.pages : []));
          rendreListe('scan'); rendreListe('sary'); rendreTableau();
        });
        return;
      }
      if (ds.esoryAsa) {
        if (!confirm('Fafana ve ity photocopie ity ?')) return;
        ecrireJson(CLE_ASA, lireAsa().filter(function (a) { return a.id !== ds.esoryAsa; }));
        rendreTableau();
      }
    });

    // Scan
    $('pcscanFichier').addEventListener('change', function () {
      const f = lireFichiers(this);
      if (f.length) ajouterPagesScan(f);
    });
    $('pcScanFiltre').addEventListener('change', function () {
      dire('scan', 'Mikarakara ny pejy…');
      Promise.all(scanPejy.map(rendrePage)).then(function () { dire('scan', ''); rendreScanPejy(); });
    });
    function nomScan() {
      return ($('pcScanNom').value || '').trim() || ('Scan ' + quand(Date.now()));
    }
    $('pcScanTehirizo').addEventListener('click', function () {
      const pages = pagesPretes();
      if (!pages.length) { dire('scan', 'Mbola tsy misy pejy voascan.', true); return; }
      const d = { id: nouvelId(), type: 'scan', nom: nomScan(), at: Date.now(), pages: pages };
      garderDocument(d).then(function () {
        scanPejy = [];
        $('pcScanNom').value = '';
        fermerCamera();
        dire('scan', '✅ Voatahiry : ' + d.nom);
        rendreScanPejy(); rendreListe('scan'); rendreTableau();
      }, function () { dire('scan', 'Tsy voatahiry : feno angamba ny toerana.', true); });
    });
    $('pcScanPdf').addEventListener('click', function () {
      const pages = pagesPretes();
      if (!pages.length) { dire('scan', 'Mbola tsy misy pejy voascan.', true); return; }
      exporterPdf(nomScan(), pages);
    });
    $('pcScanKopia').addEventListener('click', function () {
      const pages = pagesPretes();
      if (!pages.length) { dire('scan', 'Mbola tsy misy pejy voascan.', true); return; }
      kopiaImport = { nom: nomScan(), pages: pages };
      versKopia('import');
    });
    $('pcScanVidio').addEventListener('click', function () {
      if (scanPejy.length && !confirm('Esorina daholo ny pejy voascan ?')) return;
      scanPejy = [];
      rendreScanPejy();
      dire('scan', '');
    });

    // Photos
    function garderSary(blobs) {
      let suite = Promise.resolve();
      blobs.forEach(function (b, i) {
        suite = suite.then(function () {
          return garderDocument({ id: nouvelId(), type: 'sary', nom: 'Sary ' + quand(Date.now()) + (blobs.length > 1 ? ' (' + (i + 1) + ')' : ''), at: Date.now() + i, pages: [b] });
        });
      });
      return suite.then(function () {
        dire('sary', '✅ Voatahiry ny sary.');
        rendreListe('sary'); rendreTableau();
      }, function () { dire('sary', 'Tsy voatahiry : feno angamba ny toerana.', true); });
    }
    $('pcsaryFichier').addEventListener('change', function () {
      const f = lireFichiers(this);
      if (f.length) garderSary(f);
    });

    // Photocopie
    $('pcKopiaLoharano').addEventListener('change', function () { kopiaChoix = this.value; rendreKopia(); });
    $('pcKopiaHampiditra').addEventListener('click', function () { $('pcKopiaFichier').click(); });
    $('pcKopiaFichier').addEventListener('change', function () {
      const f = lireFichiers(this);
      if (!f.length) return;
      kopiaImport = { nom: f.length > 1 ? f.length + ' sary nampidirina' : f[0].name, pages: f };
      kopiaChoix = 'import';
      rendreKopia();
    });
    ['pcKopiaIsa', 'pcKopiaFandaminana'].forEach(function (id) {
      $(id).addEventListener('input', kajyVola);
      $(id).addEventListener('change', kajyVola);
    });
    $('pcKopiaLoko').addEventListener('change', rendreKopia);
    $('pcKopiaAtonta').addEventListener('click', function () {
      const src = sourceKopia();
      const st = $('pcKopiaStatut');
      if (!src) { st.textContent = 'Safidio aloha ny scan na sary hatao photocopie.'; st.style.color = 'var(--red)'; return; }
      const p = parametresKopia();
      imprimer(src.pages, p.isa, p.loko, p.deux);
      noterAsa(src.nom, feuillesPour(src.pages.length, p.deux), p.isa, p.loko);
      st.style.color = 'var(--muted)';
      st.textContent = '✅ Nalefa any amin\'ny imprimante ary voasoratra ao amin\'ny tableau de bord.';
    });
    // Le PDF compte aussi : il est fait pour sortir sur la machine.
    $('pcKopiaPdf').addEventListener('click', function () {
      const src = sourceKopia();
      const st = $('pcKopiaStatut');
      if (!src) { st.textContent = 'Safidio aloha ny scan na sary hatao photocopie.'; st.style.color = 'var(--red)'; return; }
      const p = parametresKopia();
      const bouton = this;
      bouton.disabled = true;
      st.style.color = 'var(--muted)';
      st.textContent = 'Manamboatra ny PDF…';
      exporterPdf(src.nom + ' x' + p.isa, src.pages, p).then(function (ok) {
        bouton.disabled = false;
        if (!ok) { st.textContent = ''; return; }
        noterAsa(src.nom, feuillesPour(src.pages.length, p.deux), p.isa, p.loko);
        st.textContent = '✅ Vita ny PDF (' + (feuillesPour(src.pages.length, p.deux) * p.isa) + ' pejy) ary voasoratra ao amin\'ny tableau de bord.';
      });
    });
    $('pcMilinaAmpidiro').addEventListener('click', function () {
      const pejy = Math.max(1, parseInt($('pcMilinaPejy').value, 10) || 1);
      const isa = Math.max(1, parseInt($('pcMilinaIsa').value, 10) || 1);
      noterAsa('Photocopie tamin\'ny milina', pejy, isa, $('pcMilinaLoko').value);
      $('pcKopiaStatut').style.color = 'var(--muted)';
      $('pcKopiaStatut').textContent = '✅ Voasoratra : ' + (pejy * isa) + ' pejy.';
    });
    $('pcVidinyTehirizo').addEventListener('click', function () {
      ecrireJson(CLE_VIDINY, {
        nb: Math.max(0, Number($('pcVidinyNb').value) || 0),
        loko: Math.max(0, Number($('pcVidinyLoko').value) || 0)
      });
      kajyVola();
      $('pcKopiaStatut').style.color = 'var(--muted)';
      $('pcKopiaStatut').textContent = '✅ Voatahiry ny vidiny.';
    });

    // La caméra s'éteint quand la fenêtre se ferme ou qu'on change de page.
    const section = $('section-photocopie');
    new MutationObserver(function () {
      if (!section.classList.contains('active')) fermerCamera();
      else if (volet === 'tableau') rendreTableau();
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
  }

  // Pour les vérifications.
  window.__photocopie = { traiter: traiter, noterAsa: noterAsa, montrer: montrer };

  function demarrer() {
    if (!construire()) return;
    brancher();
    chargerDocuments().then(function () { montrer('tableau'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();

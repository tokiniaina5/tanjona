// PDF : les documents PDF de l'application, rangés dans le menu.
//
// Une facture générée (factures.js) n'est plus seulement téléchargée : elle
// se range ici, puis sort à l'impression. On la retrouve ensuite pour la
// réimprimer, l'ouvrir, la télécharger ou l'effacer (bouton ✕, ou la ligne
// glissée à gauche ou à droite). On peut aussi y ajouter un PDF du téléphone.
//
// Les fichiers restent dans ce navigateur : IndexedDB, comme les scans de
// Photocopie — quelques PDF avec logo suffiraient à remplir localStorage. La
// base porte SUFFIXE_MPIASA (common.js) : l'employé entré par son lien ne
// voit pas les PDF du patron.
//
// Les autres pages y déposent leurs PDF par window.__pdfTahiry :
//   ampio(anarana, blob, karazana)  → Promise<id>   ranger un PDF
//   imprimer(blob)                                   l'envoyer à l'imprimante
//   sokafy()                                         ouvrir la page PDF

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';

  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function quand(ms) { return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
  function taille(o) {
    return o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + ' Ko' : (o / 1024 / 1024).toFixed(1) + ' Mo';
  }
  function tactile() {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  }

  // ---------- La base ----------
  // Un enregistrement : { id, anarana, karazana: 'facture' | 'nampidirina', at, blob }.
  let promesseBase = null;
  function base() {
    if (!promesseBase) {
      promesseBase = new Promise(function (ok, non) {
        const r = indexedDB.open('nyasako_pdf' + SUFFIXE, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('rakitra', { keyPath: 'id' }); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { promesseBase = null; non(r.error); };
      });
    }
    return promesseBase;
  }
  function magasin(mode, action) {
    return base().then(function (db) {
      return new Promise(function (ok, non) {
        const t = db.transaction('rakitra', mode);
        const req = action(t.objectStore('rakitra'));
        t.oncomplete = function () { ok(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { non(t.error); };
      });
    });
  }
  let rakitra = [];
  function charger() {
    return magasin('readonly', function (s) { return s.getAll(); }).then(function (tous) {
      rakitra = (tous || []).sort(function (a, b) { return b.at - a.at; });
    }, function (e) {
      console.error('pdf : IndexedDB', e);
      rakitra = [];
    });
  }

  // ---------- Imprimer, ouvrir, télécharger ----------
  // Sur ordinateur, le PDF se charge dans un cadre invisible et la boîte
  // d'impression s'ouvre dessus. Un téléphone n'affiche pas un PDF dans un
  // cadre : on l'ouvre dans un onglet, où son lecteur propose « Imprimer ».
  function imprimer(blob) {
    const url = URL.createObjectURL(blob);
    if (tactile()) {
      const w = window.open(url, '_blank');
      if (!w) telecharger('document.pdf', blob);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return;
    }
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    ifr.src = url;
    ifr.onload = function () {
      try { ifr.contentWindow.focus(); ifr.contentWindow.print(); }
      catch (e) { window.open(url, '_blank'); }
      // Le cadre reste le temps que l'impression le lise.
      setTimeout(function () { ifr.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    document.body.appendChild(ifr);
  }
  function ouvrir(blob) {
    const url = URL.createObjectURL(blob);
    if (!window.open(url, '_blank')) telecharger('document.pdf', blob);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function telecharger(nom, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.pdf$/i.test(nom) ? nom : nom + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ---------- La page ----------
  function zone() { return document.querySelector('#section-pdf .pdf-tahiry'); }

  function dessiner() {
    const z = zone();
    if (!z) return;
    z.innerHTML =
      '<div class="panel">' +
        '<div class="section-head" style="margin-bottom:0.6rem;">' +
          '<div><h3>📄 PDF</h3></div>' +
          '<div class="actions-row">' +
            '<label class="btn btn-sm" style="width:auto; cursor:pointer;">➕ Hampiditra PDF' +
              '<input type="file" accept="application/pdf,.pdf" multiple data-pdf-ampidiro style="display:none;"></label>' +
          '</div>' +
        '</div>' +
        '<p style="font-size:0.8rem; color:var(--muted); margin:0 0 0.8rem; line-height:1.6;">' +
          'Eto no mipetraka ny facture rehetra noforonina, vao mivoaka ho amin\'ny impression. ' +
          'Ahodino ankavia na ankavanana ny andalana, na tsindrio ✕, raha hamafa. ' +
          'Ato amin\'ity navigateur ity ihany no voatahiry izy.' +
        '</p>' +
        '<div data-pdf-lisitra></div>' +
        '<p class="empty-hint" data-pdf-foana style="display:none;">Mbola tsy misy PDF voatahiry.</p>' +
      '</div>';

    const lisitra = z.querySelector('[data-pdf-lisitra]');
    z.querySelector('[data-pdf-foana]').style.display = rakitra.length ? 'none' : '';
    rakitra.forEach(function (r) {
      const div = document.createElement('div');
      div.className = 'list-row';
      div.style.flexWrap = 'wrap';
      div.innerHTML =
        '<span style="min-width:0; flex:1 1 12rem;">' +
          '<strong style="word-break:break-word;">' + (r.karazana === 'facture' ? '🧾 ' : '📄 ') + html(r.anarana) + '</strong><br>' +
          '<span style="color:var(--muted); font-size:0.75rem;">' + quand(r.at) + ' · ' + taille(r.blob ? r.blob.size : 0) + '</span>' +
        '</span>' +
        '<span style="display:flex; gap:0.35rem; flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-a="imprimer" style="width:auto;">🖨 Imprimer</button>' +
          '<button type="button" class="btn btn-sm" data-a="ouvrir" style="width:auto;">👁</button>' +
          '<button type="button" class="btn btn-sm" data-a="telecharger" style="width:auto;" title="Télécharger">⬇</button>' +
          '<button type="button" class="btn btn-sm" data-a="effacer" style="width:auto;" title="Effacer">✕</button>' +
        '</span>';
      div.querySelector('[data-a="imprimer"]').addEventListener('click', function () { imprimer(r.blob); });
      div.querySelector('[data-a="ouvrir"]').addEventListener('click', function () { ouvrir(r.blob); });
      div.querySelector('[data-a="telecharger"]').addEventListener('click', function () { telecharger(r.anarana, r.blob); });
      div.querySelector('[data-a="effacer"]').addEventListener('click', function () {
        if (confirm('Hofafana ve « ' + r.anarana + ' » ?')) effacer(r.id, div, 1);
      });
      glisser(r.id, div);
      lisitra.appendChild(div);
    });

    z.querySelector('[data-pdf-ampidiro]').addEventListener('change', function (e) {
      const fichiers = Array.prototype.slice.call(e.target.files || []);
      Promise.all(fichiers.map(function (f) { return ampio(f.name, f, 'nampidirina'); }))
        .then(function () { dessiner(); });
    });
  }

  function effacer(id, div, sens) {
    div.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    div.style.transform = 'translateX(' + sens * (div.offsetWidth + 40) + 'px)';
    div.style.opacity = '0';
    magasin('readwrite', function (s) { return s.delete(id); }).then(charger).then(function () {
      setTimeout(dessiner, 230);
    }, function () {
      div.style.transform = '';
      div.style.opacity = '';
      alert('Tsy voafafa ny PDF.');
    });
  }

  // Glisser la ligne à gauche ou à droite au-delà d'un tiers l'efface.
  function glisser(id, div) {
    div.style.touchAction = 'pan-y';
    let depart = null, glisse = false, dx = 0;
    function remettre() {
      div.style.transition = 'transform 0.2s, opacity 0.2s';
      div.style.transform = '';
      div.style.opacity = '';
    }
    function debut(x, y, cible) {
      if (cible && cible.closest && cible.closest('button, a, input, label')) { depart = null; return; }
      depart = { x: x, y: y }; glisse = false; dx = 0;
    }
    function bouge(x, y) {
      if (!depart) return false;
      dx = x - depart.x;
      const dy = y - depart.y;
      if (!glisse) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { depart = null; return false; }
        if (Math.abs(dx) < 12) return false;
        glisse = true;
        div.style.transition = 'none';
      }
      div.style.transform = 'translateX(' + dx + 'px)';
      div.style.opacity = String(Math.max(1 - Math.abs(dx) / (div.offsetWidth || 1), 0.25));
      return true;
    }
    function fin() {
      if (!depart) return;
      depart = null;
      if (!glisse) return;
      glisse = false;
      if (Math.abs(dx) >= (div.offsetWidth || 1) * 0.35) effacer(id, div, dx < 0 ? -1 : 1);
      else remettre();
    }
    div.addEventListener('dragstart', function (e) { e.preventDefault(); });
    div.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { depart = null; remettre(); return; }
      debut(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    div.addEventListener('touchmove', function (e) {
      if (!depart) return;
      if (bouge(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    div.addEventListener('touchend', fin);
    div.addEventListener('touchcancel', function () { depart = null; glisse = false; remettre(); });
    div.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      debut(e.clientX, e.clientY, e.target);
      if (!depart) return;
      function suivre(ev) { if (bouge(ev.clientX, ev.clientY)) ev.preventDefault(); }
      function lacher() {
        document.removeEventListener('mousemove', suivre);
        document.removeEventListener('mouseup', lacher);
        fin();
      }
      document.addEventListener('mousemove', suivre);
      document.addEventListener('mouseup', lacher);
    });
  }

  // ---------- Pour les autres pages ----------
  function ampio(anarana, blob, karazana) {
    const r = { id: nouvelId(), anarana: String(anarana || 'document.pdf'), karazana: karazana || '', at: Date.now(), blob: blob };
    return magasin('readwrite', function (s) { return s.put(r); }).then(charger).then(function () {
      dessiner();
      return r.id;
    });
  }
  function sokafy() {
    const nav = document.querySelector('.nav-item[data-section="pdf"]');
    if (nav) nav.click();
  }
  window.__pdfTahiry = { ampio: ampio, imprimer: imprimer, sokafy: sokafy };

  // La page se remplit à l'ouverture, et chaque fois qu'on y revient.
  const nav = document.querySelector('.nav-item[data-section="pdf"]');
  if (nav) nav.addEventListener('click', function () { charger().then(dessiner); });
  charger().then(dessiner);
})();

// PDF : les documents PDF de l'application, rangés dans le menu.
//
// Tout PDF que fait le site se range ici : la facture (factures.js), qui sort
// ensuite à l'impression, le PDF d'un scan (photocopie.js) et les papiers du
// fokontany (taratasy.js, aussi depuis la page Fokontany). On les retrouve
// pour les réimprimer, les ouvrir, les télécharger ou les effacer (bouton ✕,
// ou la ligne glissée à gauche ou à droite). On peut aussi y ajouter un PDF.
//
// EN LIGNE, quand on est connecté : le fichier va dans le bucket fermé « pdf »
// de Supabase, sous le dossier du compte, et la table « pdf_rakitra » en
// garde le nom (supabase-pdf.sql). On les retrouve donc sur tout appareil où
// l'on se connecte. L'employé entré par son lien a son propre compte, donc
// ses propres PDF.
//
// Sans compte (ou sans réseau), le PDF attend dans ce navigateur (IndexedDB,
// base suffixée par SUFFIXE_MPIASA) ; il part en ligne dès qu'on est connecté,
// à la prochaine ouverture de la page.
//
// Les autres pages y déposent leurs PDF par window.__pdfTahiry :
//   ampio(anarana, blob, karazana)  → Promise<id>   ranger un PDF
//   imprimer(blob)                                   l'envoyer à l'imprimante
//   sokafy()                                         ouvrir la page PDF

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';
  const EST_MPIASA = !!SUFFIXE;
  const BUCKET = 'pdf';
  const SARY = { facture: '🧾 ', photocopie: '📠 ', taratasy: '📜 ' };

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

  // ---------- Le compte ----------
  // L'identifiant du compte connecté, ou '' : alors tout reste local. Un
  // employé ouvert dans le navigateur du patron ne doit pas tomber sur les
  // PDF du patron : en mode employé, seul son propre compte compte.
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
  // Un enregistrement : { id, anarana, karazana, at, blob }.
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
  function lireLocaux() {
    return magasin('readonly', function (s) { return s.getAll(); }).then(function (t) { return t || []; },
      function (e) { console.error('pdf : IndexedDB', e); return []; });
  }

  // ---------- En ligne ----------
  function chemin(uid, id) { return uid + '/' + id + '.pdf'; }
  function envoyer(uid, r) {
    const sb = window.__sb;
    return sb.storage.from(BUCKET).upload(chemin(uid, r.id), r.blob, { contentType: 'application/pdf', upsert: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return sb.from('pdf_rakitra').insert({
          id: r.id, user_id: uid, anarana: r.anarana, karazana: r.karazana || null,
          habe: r.blob ? r.blob.size : null, created_at: new Date(r.at).toISOString()
        });
      }).then(function (res) { if (res.error) throw res.error; });
  }
  // Les fichiers déjà téléchargés restent en mémoire : réimprimer ne
  // redemande rien au serveur.
  const cache = new Map();
  function blobDe(r) {
    if (r.blob) return Promise.resolve(r.blob);
    if (cache.has(r.id)) return Promise.resolve(cache.get(r.id));
    return window.__sb.storage.from(BUCKET).download(chemin(r.uid, r.id)).then(function (res) {
      if (res.error || !res.data) throw res.error || new Error('tsy hita');
      const b = res.data.type === 'application/pdf' ? res.data : new Blob([res.data], { type: 'application/pdf' });
      cache.set(r.id, b);
      return b;
    });
  }

  // ---------- La liste ----------
  // Chaque ligne : { id, anarana, karazana, at, habe, blob? (local), uid? (en ligne) }.
  let rakitra = [];
  let enLigne = false;
  function charger() {
    return Promise.all([compte(), lireLocaux()]).then(function (r) {
      const uid = r[0];
      let locaux = r[1];
      enLigne = !!uid;
      if (!uid) return locaux.map(function (l) { return Object.assign({ habe: l.blob ? l.blob.size : 0 }, l); });
      // Ce qui attendait dans ce navigateur part en ligne, puis s'efface d'ici.
      return Promise.all(locaux.map(function (l) {
        return envoyer(uid, l).then(function () {
          return magasin('readwrite', function (s) { return s.delete(l.id); }).then(function () { return null; });
        }, function (e) { console.error('pdf : envoi', e); return l; });
      })).then(function (restes) {
        locaux = restes.filter(Boolean);
        return window.__sb.from('pdf_rakitra').select('id,anarana,karazana,habe,created_at')
          .order('created_at', { ascending: false }).limit(500);
      }).then(function (res) {
        const enligne = (res && !res.error && res.data ? res.data : []).map(function (d) {
          return { id: d.id, anarana: d.anarana, karazana: d.karazana, at: Date.parse(d.created_at), habe: d.habe || 0, uid: uid };
        });
        if (res && res.error) console.error('pdf : liste', res.error);
        return enligne.concat(locaux.map(function (l) { return Object.assign({ habe: l.blob ? l.blob.size : 0 }, l); }));
      });
    }).then(function (tous) {
      rakitra = tous.sort(function (a, b) { return b.at - a.at; });
    });
  }

  // ---------- Imprimer, ouvrir, télécharger ----------
  // Sur ordinateur, le PDF se charge dans un cadre invisible et la boîte
  // d'impression s'ouvre dessus. Un téléphone n'affiche pas un PDF dans un
  // cadre : on l'ouvre dans un onglet, où son lecteur propose « Imprimer ».
  //
  // Un fichier en ligne arrive après une attente, et un téléphone refuse
  // d'ouvrir un onglet qui ne suit pas directement l'appui : l'onglet s'ouvre
  // donc tout de suite, vide, et reçoit le PDF quand il est là.
  function ongletDe(blob, onglet) {
    const url = URL.createObjectURL(blob);
    const w = onglet || window.open(url, '_blank');
    if (onglet) onglet.location.href = url;
    if (!w) telecharger('document.pdf', blob);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function imprimer(blob, onglet) {
    if (tactile()) { ongletDe(blob, onglet); return; }
    const url = URL.createObjectURL(blob);
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
  function agir(r, action) {
    const besoinOnglet = action === 'ouvrir' || (action === 'imprimer' && tactile());
    const onglet = (besoinOnglet && !r.blob && !cache.has(r.id)) ? window.open('', '_blank') : null;
    blobDe(r).then(function (b) {
      if (action === 'imprimer') imprimer(b, onglet);
      else if (action === 'ouvrir') ongletDe(b, onglet);
      else telecharger(r.anarana, b);
    }, function (e) {
      if (onglet) onglet.close();
      alert('Tsy azo ny PDF : ' + ((e && e.message) || 'réseau'));
    });
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
          'Eto no mipetraka ny PDF rehetra noforonin\'ny site : facture (vao mivoaka ho amin\'ny impression), ' +
          'photocopie ary taratasy. ' +
          'Ahodino ankavia na ankavanana ny andalana, na tsindrio ✕, raha hamafa. ' +
          (enLigne
            ? '<strong style="color:var(--text);">☁ An-tserasera</strong> : hita amin\'ny fitaovana rehetra idiranao amin\'ity kaonty ity.'
            : '<strong style="color:var(--amber);">📱 Ato amin\'ity navigateur ity ihany</strong> : midira amin\'ny kaontinao dia handeha an-tserasera izy.') +
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
          '<strong style="word-break:break-word;">' + (SARY[r.karazana] || '📄 ') + html(r.anarana) + '</strong><br>' +
          '<span style="color:var(--muted); font-size:0.75rem;">' + quand(r.at) + ' · ' + taille(r.habe || 0) +
            (r.uid ? ' · ☁' : ' · 📱') + '</span>' +
        '</span>' +
        '<span style="display:flex; gap:0.35rem; flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-a="imprimer" style="width:auto;">🖨 Imprimer</button>' +
          '<button type="button" class="btn btn-sm" data-a="ouvrir" style="width:auto;">👁</button>' +
          '<button type="button" class="btn btn-sm" data-a="telecharger" style="width:auto;" title="Télécharger">⬇</button>' +
          '<button type="button" class="btn btn-sm" data-a="effacer" style="width:auto;" title="Effacer">✕</button>' +
        '</span>';
      ['imprimer', 'ouvrir', 'telecharger'].forEach(function (a) {
        div.querySelector('[data-a="' + a + '"]').addEventListener('click', function () { agir(r, a); });
      });
      div.querySelector('[data-a="effacer"]').addEventListener('click', function () {
        if (confirm('Hofafana ve « ' + r.anarana + ' » ?')) effacer(r, div, 1);
      });
      glisser(r, div);
      lisitra.appendChild(div);
    });

    z.querySelector('[data-pdf-ampidiro]').addEventListener('change', function (e) {
      const fichiers = Array.prototype.slice.call(e.target.files || []);
      Promise.all(fichiers.map(function (f) { return ampio(f.name, f, 'nampidirina'); }));
    });
  }

  function effacer(r, div, sens) {
    div.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    div.style.transform = 'translateX(' + sens * (div.offsetWidth + 40) + 'px)';
    div.style.opacity = '0';
    const fait = r.uid
      ? window.__sb.from('pdf_rakitra').delete().eq('id', r.id).select('id').then(function (res) {
          if (res.error || !res.data || !res.data.length) throw res.error || new Error('refusé');
          cache.delete(r.id);
          return window.__sb.storage.from(BUCKET).remove([chemin(r.uid, r.id)]);
        })
      : magasin('readwrite', function (s) { return s.delete(r.id); });
    fait.then(function () {
      rakitra = rakitra.filter(function (x) { return x.id !== r.id; });
      setTimeout(dessiner, 230);
    }, function (e) {
      div.style.transform = '';
      div.style.opacity = '';
      alert('Tsy voafafa ny PDF : ' + ((e && e.message) || 'réseau'));
    });
  }

  // Glisser la ligne à gauche ou à droite au-delà d'un tiers l'efface.
  function glisser(r, div) {
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
      if (Math.abs(dx) >= (div.offsetWidth || 1) * 0.35) effacer(r, div, dx < 0 ? -1 : 1);
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
  // En ligne si l'on est connecté ; sinon (ou si l'envoi échoue) dans ce
  // navigateur, d'où il repartira plus tard.
  function ampio(anarana, blob, karazana) {
    const r = { id: nouvelId(), anarana: String(anarana || 'document.pdf'), karazana: karazana || '', at: Date.now(), blob: blob };
    return compte().then(function (uid) {
      if (!uid) return Promise.reject(null);
      return envoyer(uid, r).then(function () { cache.set(r.id, blob); });
    }).catch(function (e) {
      if (e) console.error('pdf : envoi', e);
      return magasin('readwrite', function (s) { return s.put(r); });
    }).then(charger).then(function () {
      dessiner();
      return r.id;
    });
  }
  function sokafy() {
    const nav = document.querySelector('.nav-item[data-section="pdf"]');
    if (nav) nav.click();
  }
  window.__pdfTahiry = { ampio: ampio, imprimer: function (b) { imprimer(b); }, sokafy: sokafy };

  // La page se remplit à l'ouverture, et chaque fois qu'on y revient.
  const nav = document.querySelector('.nav-item[data-section="pdf"]');
  if (nav) nav.addEventListener('click', function () { charger().then(dessiner); });
  if (zone()) charger().then(dessiner);
})();

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
  // ---------- Le format du papier ----------
  // « Original » garde le PDF tel quel. Les autres le remettent sur la
  // feuille choisie : chaque page, rendue en image par PDF.js, est posée
  // entière et centrée sur une page A4, A5… (couchée si la page l'était).
  const FORMATS = {
    original: { nom: 'Original', mm: null },
    a4: { nom: 'A4', mm: [210, 297] },
    a5: { nom: 'A5', mm: [148, 210] },
    a3: { nom: 'A3', mm: [297, 420] },
    letter: { nom: 'Letter', mm: [215.9, 279.4] },
    legal: { nom: 'Legal', mm: [215.9, 355.6] }
  };
  const CLE_FORMAT = 'nyasako_pdf_format' + SUFFIXE;
  let format = 'original';
  try { if (FORMATS[localStorage.getItem(CLE_FORMAT)]) format = localStorage.getItem(CLE_FORMAT); } catch (e) {}
  function choisirFormat(f) {
    format = FORMATS[f] ? f : 'original';
    try { localStorage.setItem(CLE_FORMAT, format); } catch (e) {}
  }

  // PDF.js ne se charge qu'au premier besoin.
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let promessePdfJs = null;
  function pdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!promessePdfJs) {
      promessePdfJs = new Promise(function (ok, non) {
        const s = document.createElement('script');
        s.src = PDFJS + 'pdf.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
          ok(window.pdfjsLib);
        };
        s.onerror = function () { promessePdfJs = null; non(new Error('PDF.js tsy tafiditra')); };
        document.head.appendChild(s);
      });
    }
    return promessePdfJs;
  }
  // Chaque page du PDF, dessinée sur un canvas à la largeur voulue (en px).
  async function pagesEnCanvas(blob, largeur) {
    const lib = await pdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: largeur / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      pages.push(c);
    }
    return pages;
  }
  // La feuille d'une page : portrait ou paysage selon la page elle-même.
  function feuille(f, w, h) {
    const mm = FORMATS[f].mm;
    return w > h ? [mm[1], mm[0]] : mm;
  }
  async function auFormat(blob) {
    if (format === 'original' || !window.jspdf) return blob;
    const pages = await pagesEnCanvas(blob, 1600);
    const { jsPDF } = window.jspdf;
    let pdf = null;
    pages.forEach(function (c) {
      const f = feuille(format, c.width, c.height);
      const o = f[0] > f[1] ? 'landscape' : 'portrait';
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: FORMATS[format].mm, orientation: o });
      else pdf.addPage(FORMATS[format].mm, o);
      const k = Math.min(f[0] / c.width, f[1] / c.height);
      const w = c.width * k, h = c.height * k;
      pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (f[0] - w) / 2, (f[1] - h) / 2, w, h, undefined, 'FAST');
    });
    return pdf ? pdf.output('blob') : blob;
  }
  function nomAuFormat(nom) {
    const n = /\.pdf$/i.test(nom) ? nom.slice(0, -4) : nom;
    return format === 'original' ? n + '.pdf' : n + '-' + FORMATS[format].nom + '.pdf';
  }
  // Imprimer au format choisi. Sur téléphone, l'onglet s'ouvre pendant
  // l'appui, avant la mise en page qui prend un instant.
  function imprimerAuFormat(blob, onglet) {
    if (format === 'original') { imprimer(blob, onglet); return; }
    const o = onglet || (tactile() ? window.open('', '_blank') : null);
    auFormat(blob).then(function (b) { imprimer(b, o); }, function (e) {
      if (o) o.close();
      alert('Tsy vita ny format ' + FORMATS[format].nom + ' : ' + ((e && e.message) || 'erreur'));
    });
  }

  // ---------- L'aperçu, dans la page ----------
  // Les pages dessinées l'une sous l'autre, chacune sur une feuille blanche
  // aux proportions du format choisi : on voit ce qui sortira.
  let apercu = null;
  function montrerApercu(r, sansDefiler) {
    apercu = r;
    const boite = document.querySelector('#section-pdf [data-pdf-jereo]');
    if (!boite) return;
    boite.style.display = '';
    boite.innerHTML =
      '<div class="section-head" style="margin-bottom:0.6rem; gap:0.5rem; flex-wrap:wrap;">' +
        '<div style="min-width:0;"><h3 style="word-break:break-word;">👁 ' + html(r.anarana) + '</h3>' +
          '<span style="font-size:0.75rem; color:var(--muted);">Format : ' + FORMATS[format].nom + '</span></div>' +
        '<div class="actions-row" style="flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-j="imprimer" style="width:auto;">🖨 Imprimer</button>' +
          '<button type="button" class="btn btn-sm" data-j="telecharger" style="width:auto;">⬇</button>' +
          '<button type="button" class="btn btn-sm" data-j="hidio" style="width:auto;">✖ Hidio</button>' +
        '</div>' +
      '</div>' +
      '<div data-j-pejy style="display:flex; flex-direction:column; align-items:center; gap:0.8rem; ' +
        'max-height:75vh; overflow-y:auto; background:var(--bg); border-radius:8px; padding:0.8rem;">' +
        '<p style="color:var(--muted); font-size:0.85rem;">Mamaky…</p></div>';
    boite.querySelector('[data-j="imprimer"]').addEventListener('click', function () { agir(r, 'imprimer'); });
    boite.querySelector('[data-j="telecharger"]').addEventListener('click', function () { agir(r, 'telecharger'); });
    boite.querySelector('[data-j="hidio"]').addEventListener('click', function () {
      apercu = null;
      boite.style.display = 'none';
      boite.innerHTML = '';
    });
    if (!sansDefiler) boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const zonePages = boite.querySelector('[data-j-pejy]');
    const largeur = Math.min(Math.max(zonePages.clientWidth - 16, 240), 900);
    blobDe(r).then(function (b) {
      return pagesEnCanvas(b, largeur * (window.devicePixelRatio || 1));
    }).then(function (pages) {
      if (apercu !== r) return;
      zonePages.innerHTML = '';
      pages.forEach(function (c, i) {
        const papier = document.createElement('div');
        let ratio = c.width / c.height;
        if (format !== 'original') { const f = feuille(format, c.width, c.height); ratio = f[0] / f[1]; }
        papier.style.cssText = 'background:#fff; width:100%; max-width:' + largeur + 'px; aspect-ratio:' + ratio + '; ' +
          'display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(0,0,0,0.35); position:relative;';
        c.style.cssText = 'max-width:100%; max-height:100%; display:block;';
        papier.appendChild(c);
        const num = document.createElement('span');
        num.textContent = (i + 1) + ' / ' + pages.length;
        num.style.cssText = 'position:absolute; bottom:4px; right:8px; font-size:0.7rem; color:#888;';
        papier.appendChild(num);
        zonePages.appendChild(papier);
      });
    }, function (e) {
      if (apercu !== r) return;
      zonePages.innerHTML = '<p style="color:var(--amber); font-size:0.85rem;">Tsy aseho ny PDF : ' +
        html((e && e.message) || 'réseau') + '</p>';
    });
  }

  function agir(r, action) {
    // Un téléphone n'ouvre un onglet que pendant l'appui : on l'ouvre tout
    // de suite si le fichier doit d'abord venir du serveur ou être remis
    // au format.
    const attente = (!r.blob && !cache.has(r.id)) || format !== 'original';
    const onglet = (action === 'imprimer' && tactile() && attente) ? window.open('', '_blank') : null;
    blobDe(r).then(function (b) {
      if (action === 'imprimer') imprimerAuFormat(b, onglet);
      else return auFormat(b).then(function (x) { telecharger(nomAuFormat(r.anarana), x); });
    }).catch(function (e) {
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
        '<div class="field" style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin:0 0 0.8rem;">' +
          '<label for="pdfFormat" style="margin:0;">📐 Haben\'ny taratasy</label>' +
          '<select id="pdfFormat" data-pdf-format style="width:auto;">' +
            Object.keys(FORMATS).map(function (k) {
              return '<option value="' + k + '"' + (k === format ? ' selected' : '') + '>' +
                (k === 'original' ? 'Original (tsy ovaina)' : FORMATS[k].nom) + '</option>';
            }).join('') +
          '</select>' +
          '<span style="font-size:0.75rem; color:var(--muted);">— arahin\'ny aperçu, ny impression ary ny ⬇</span>' +
        '</div>' +
        '<div data-pdf-lisitra></div>' +
        '<p class="empty-hint" data-pdf-foana style="display:none;">Mbola tsy misy PDF voatahiry.</p>' +
      '</div>' +
      '<div class="panel" data-pdf-jereo style="display:none;"></div>';

    z.querySelector('[data-pdf-format]').addEventListener('change', function (e) {
      choisirFormat(e.target.value);
      if (apercu) montrerApercu(apercu);
    });

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
      ['imprimer', 'telecharger'].forEach(function (a) {
        div.querySelector('[data-a="' + a + '"]').addEventListener('click', function () { agir(r, a); });
      });
      // Le nom comme l'œil montrent la feuille ici même.
      div.querySelector('[data-a="ouvrir"]').addEventListener('click', function () { montrerApercu(r); });
      const titre = div.querySelector('strong');
      titre.style.cursor = 'pointer';
      titre.addEventListener('click', function () { montrerApercu(r); });
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

    // La liste redessinée garde l'aperçu ouvert, s'il montre encore un PDF présent.
    if (apercu) {
      const encore = rakitra.filter(function (x) { return x.id === apercu.id; })[0];
      if (encore) montrerApercu(encore, true); else apercu = null;
    }
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
  // Les autres pages impriment, elles aussi, au format choisi ici.
  // Les pages d'un PDF, dessinées dans un conteneur d'une autre page (aperçu
  // de la facture, factures.js) : chacune sur sa feuille blanche.
  function dessinerPages(blob, conteneur) {
    conteneur.innerHTML = '<p style="color:var(--muted); font-size:0.85rem;">Mamaky…</p>';
    const largeur = Math.min(Math.max(conteneur.clientWidth - 16, 240), 900);
    return pagesEnCanvas(blob, largeur * (window.devicePixelRatio || 1)).then(function (pages) {
      conteneur.innerHTML = '';
      pages.forEach(function (c) {
        c.style.cssText = 'width:100%; max-width:' + largeur + 'px; display:block; background:#fff; ' +
          'box-shadow:0 2px 10px rgba(0,0,0,0.35); margin:0 auto 0.8rem;';
        conteneur.appendChild(c);
      });
    }, function (e) {
      conteneur.innerHTML = '<p style="color:var(--amber); font-size:0.85rem;">Tsy aseho : ' +
        html((e && e.message) || 'réseau') + '</p>';
    });
  }

  // « onglet » : déjà ouvert pendant l'appui, quand le PDF vient après une attente.
  window.__pdfTahiry = { ampio: ampio, imprimer: function (b, onglet) { imprimerAuFormat(b, onglet || null); }, sokafy: sokafy,
                         dessinerPages: dessinerPages };

  // La page se remplit à l'ouverture, et chaque fois qu'on y revient.
  const nav = document.querySelector('.nav-item[data-section="pdf"]');
  if (nav) nav.addEventListener('click', function () { charger().then(dessiner); });
  if (zone()) charger().then(dessiner);
})();

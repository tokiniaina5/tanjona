// Fitaovana : Word, Excel, Notes, Calculatrice, Calendrier, Horaire.
//
// Six petits outils de bureau, rangés dans le menu. Tout reste dans ce
// navigateur (localStorage) : rien ne part au serveur, rien ne se partage.
// Les clés portent SUFFIXE_MPIASA (common.js) : un employé entré par son
// lien, ouvert dans le navigateur du patron, ne mélange pas ses notes à
// celles du patron.
//
// Word et Excel ne remplacent pas Office : on écrit, on calcule, on garde, et
// l'on emporte le fichier (.doc, .xlsx). Pour davantage, des boutons ouvrent
// Word, Excel ou Google en ligne.
//
// Les pages elles-mêmes sont vides dans index.html : ce fichier les remplit.

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';

  function cle(nom) { return 'stockmanager_fitaovana_' + nom + SUFFIXE; }
  function lire(nom, defaut) {
    try {
      const v = JSON.parse(localStorage.getItem(cle(nom)));
      return v == null ? defaut : v;
    } catch (e) { return defaut; }
  }
  function ecrire(nom, valeur) {
    try { localStorage.setItem(cle(nom), JSON.stringify(valeur)); return true; }
    catch (e) {
      alert('Tsy voatahiry : feno ny toerana ao amin\'ity navigateur ity.');
      return false;
    }
  }
  function html(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function quand(ms) {
    return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function zone(outil) { return document.querySelector('.fitaovana[data-outil="' + outil + '"]'); }
  function nomFichier(t) {
    return String(t || '').trim().replace(/[\\/:*?"<>|\[\]]+/g, '-').slice(0, 60) || 'fichier';
  }
  // Un lien éphémère sur un Blob : le navigateur enregistre le fichier.
  function telecharger(nom, contenu, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  // ---------- Un vrai .docx ----------
  // Le .doc d'avant n'était qu'une page HTML renommée : Word l'ouvrait, mais en
  // prévenant que le format ne correspondait pas à l'extension, et d'autres
  // logiciels la refusaient. Un .docx est un zip de quelques fichiers XML ; on
  // les écrit ici, à partir de ce que la page d'édition contient.
  //
  // JSZip n'est chargé qu'au moment d'exporter : personne ne doit le payer à
  // l'ouverture de l'application.
  let chargementZip = null;
  function chargerZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (chargementZip) return chargementZip;
    chargementZip = new Promise(function (ok, non) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = function () { window.JSZip ? ok(window.JSZip) : non(new Error('JSZip')); };
      s.onerror = function () { chargementZip = null; non(new Error('JSZip')); };
      document.head.appendChild(s);
    });
    return chargementZip;
  }

  function xml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  // Ce que l'éditeur produit — titres, gras, italique, souligné, listes,
  // alignement, retours à la ligne — traduit en paragraphes Word.
  function htmlVersParagraphes(racine) {
    const paragraphes = [];
    const listes = [];          // une numérotation par liste ordonnée : chacune repart à 1
    let enCours = null;         // paragraphe en train de recevoir du texte hors bloc

    function alignement(el) {
      const a = ((el.style && el.style.textAlign) || el.getAttribute('align') || '').toLowerCase();
      return { center: 'center', right: 'right', justify: 'both', left: 'left' }[a] || '';
    }

    function runs(noeud, fmt, sortie) {
      if (noeud.nodeType === 3) {
        const t = noeud.nodeValue;
        if (!t) return;
        const rPr = (fmt.b ? '<w:b/>' : '') + (fmt.i ? '<w:i/>' : '') + (fmt.u ? '<w:u w:val="single"/>' : '');
        sortie.push('<w:r>' + (rPr ? '<w:rPr>' + rPr + '</w:rPr>' : '') +
          '<w:t xml:space="preserve">' + xml(t) + '</w:t></w:r>');
        return;
      }
      if (noeud.nodeType !== 1) return;
      const tag = noeud.tagName;
      if (tag === 'BR') { sortie.push('<w:r><w:br/></w:r>'); return; }
      const s = noeud.style || {};
      const f = {
        b: fmt.b || tag === 'B' || tag === 'STRONG' || s.fontWeight === 'bold' || Number(s.fontWeight) >= 600,
        i: fmt.i || tag === 'I' || tag === 'EM' || s.fontStyle === 'italic',
        u: fmt.u || tag === 'U' || /underline/.test(s.textDecoration || '')
      };
      noeud.childNodes.forEach(function (n) { runs(n, f, sortie); });
    }

    function paragraphe(contenu, options) {
      const o = options || {};
      let pPr = '';
      if (o.style) pPr += '<w:pStyle w:val="' + o.style + '"/>';
      if (o.numId) pPr += '<w:numPr><w:ilvl w:val="' + (o.niveau || 0) + '"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
      if (o.jc) pPr += '<w:jc w:val="' + o.jc + '"/>';
      paragraphes.push('<w:p>' + (pPr ? '<w:pPr>' + pPr + '</w:pPr>' : '') + contenu.join('') + '</w:p>');
    }

    function clore() {
      if (enCours) { paragraphe(enCours); enCours = null; }
    }

    const BLOCS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE'];
    function estBloc(n) { return n.nodeType === 1 && BLOCS.indexOf(n.tagName) >= 0; }

    function liste(el, niveau) {
      const ordonnee = el.tagName === 'OL';
      let numId = 1;
      if (ordonnee) { listes.push(1); numId = listes.length + 1; }
      el.childNodes.forEach(function (li) {
        if (li.nodeType !== 1) return;
        if (li.tagName === 'UL' || li.tagName === 'OL') { liste(li, Math.min(niveau + 1, 2)); return; }
        const contenu = [];
        const sousListes = [];
        li.childNodes.forEach(function (n) {
          if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) sousListes.push(n);
          else runs(n, {}, contenu);
        });
        paragraphe(contenu, { numId: numId, niveau: niveau, jc: alignement(li) });
        sousListes.forEach(function (sl) { liste(sl, Math.min(niveau + 1, 2)); });
      });
    }

    function bloc(el) {
      const tag = el.tagName;
      if (tag === 'UL' || tag === 'OL') { liste(el, 0); return; }
      // Un bloc qui en contient d'autres (des div dans des div) : on descend.
      if (Array.prototype.some.call(el.childNodes, estBloc)) { parcourir(el); return; }
      const contenu = [];
      el.childNodes.forEach(function (n) { runs(n, {}, contenu); });
      const style = tag === 'H1' ? 'Heading1' : (/^H[2-6]$/.test(tag) ? 'Heading2' : '');
      paragraphe(contenu, { style: style, jc: alignement(el) });
    }

    function parcourir(parent) {
      parent.childNodes.forEach(function (n) {
        if (estBloc(n)) { clore(); bloc(n); return; }
        if (!enCours) enCours = [];
        runs(n, {}, enCours);
      });
      clore();
    }

    parcourir(racine);
    return { corps: paragraphes.join('') || '<w:p/>', listesOrdonnees: listes.length };
  }

  function fabriquerDocx(htmlDoc) {
    return chargerZip().then(function (JSZip) {
      const racine = document.createElement('div');
      racine.innerHTML = htmlDoc || '';
      const r = htmlVersParagraphes(racine);

      // Trois niveaux de liste, à puces (abstrait 0) ou numérotées (abstrait 1).
      function niveaux(puce) {
        let s = '';
        for (let n = 0; n < 3; n++) {
          s += '<w:lvl w:ilvl="' + n + '"><w:start w:val="1"/>' +
            (puce ? '<w:numFmt w:val="bullet"/><w:lvlText w:val="' + ['•', '◦', '▪'][n] + '"/>'
                  : '<w:numFmt w:val="decimal"/><w:lvlText w:val="%' + (n + 1) + '."/>') +
            '<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 * (n + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
        }
        return s;
      }
      let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
      for (let k = 0; k < r.listesOrdonnees; k++) {
        nums += '<w:num w:numId="' + (k + 2) + '"><w:abstractNumId w:val="1"/>' +
          '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
      }

      const zip = new JSZip();
      zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
        '</Types>');
      zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>');
      zip.file('word/_rels/document.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
        '</Relationships>');
      zip.file('word/styles.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles ' + W + '>' +
          '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
          '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
            '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
            '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>' +
        '</w:styles>');
      zip.file('word/numbering.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:numbering ' + W + '>' +
          '<w:abstractNum w:abstractNumId="0">' + niveaux(true) + '</w:abstractNum>' +
          '<w:abstractNum w:abstractNumId="1">' + niveaux(false) + '</w:abstractNum>' +
          nums +
        '</w:numbering>');
      zip.file('word/document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document ' + W + '><w:body>' + r.corps +
          // A4, marges de 2,5 cm.
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
          '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
        '</w:body></w:document>');

      // JSZip ajoute une entrée pour chaque dossier ; Word n'en a pas besoin.
      Object.keys(zip.files).forEach(function (k) { if (zip.files[k].dir) delete zip.files[k]; });

      return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
    });
  }
  // Pour vérifier l'export sans rien télécharger.
  window.__fabriquerDocx = fabriquerDocx;

  function tete(titre, sous) {
    return '<div class="section-head"><div><h2>' + titre + '</h2><p>' + sous + '</p></div></div>';
  }
  function liens(l) {
    return '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.8rem;">' +
      l.map(function (x) {
        return '<a class="btn btn-sm" style="width:auto; text-decoration:none;" href="' + x[1] +
          '" target="_blank" rel="noopener">' + x[0] + ' ↗</a>';
      }).join('') + '</div>';
  }
  const CHAMP = 'background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.6rem; font:inherit;';

  // ======================= CALCULER, SANS eval =======================
  // Nombres, + − × ÷, parenthèses, pourcentage. Excel y ajoute ses cases
  // (A1) et quatre fonctions sur une plage (SUM, MOYENNE, MIN, MAX). Un petit
  // analyseur plutôt qu'eval : ce qu'on tape n'est jamais exécuté comme du code.
  function calculer(texte, valeurDe) {
    const s = String(texte).replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/−/g, '-').replace(/\s+/g, '');
    let i = 0;
    function voir() { return s[i]; }
    function expr() {
      let v = terme();
      while (voir() === '+' || voir() === '-') {
        const op = s[i++];
        const w = terme();
        v = op === '+' ? v + w : v - w;
      }
      return v;
    }
    function terme() {
      let v = facteur();
      while (voir() === '*' || voir() === '/') {
        const op = s[i++];
        const w = facteur();
        v = op === '*' ? v * w : v / w;
      }
      return v;
    }
    function facteur() {
      if (voir() === '-') { i++; return -facteur(); }
      if (voir() === '+') { i++; return facteur(); }
      if (voir() === '(') {
        i++;
        const v = expr();
        if (voir() !== ')') throw new Error('parenthèse');
        i++;
        return pourcent(v);
      }
      const reste = s.slice(i);
      const nb = /^\d+(\.\d+)?|^\.\d+/.exec(reste);
      if (nb) { i += nb[0].length; return pourcent(Number(nb[0])); }
      if (valeurDe) {
        const fn = /^([A-Za-z]+)\(([A-Za-z]+\d+):([A-Za-z]+\d+)\)/.exec(reste);
        if (fn) { i += fn[0].length; return fonction(fn[1], plage(fn[2], fn[3]).map(valeurDe)); }
        const ref = /^[A-Za-z]+\d+/.exec(reste);
        if (ref) { i += ref[0].length; return valeurDe(ref[0].toUpperCase()); }
      }
      throw new Error('illisible');
    }
    function pourcent(v) {
      if (voir() === '%') { i++; return v / 100; }
      return v;
    }
    if (!s) throw new Error('vide');
    const v = expr();
    if (i !== s.length || !isFinite(v)) throw new Error('illisible');
    return v;
  }
  function arrondi(v) { return Math.round(v * 1e10) / 1e10; }

  // ======================= WORD =======================
  function rendreWord() {
    const z = zone('word');
    if (!z) return;
    let docs = lire('word', []);
    if (!docs.length) {
      docs = [{ id: nouvelId(), titre: 'Taratasy vaovao', html: '', maj: Date.now() }];
      ecrire('word', docs);
    }
    let courant = lire('word_courant', docs[0].id);
    if (!docs.some(function (d) { return d.id === courant; })) courant = docs[0].id;
    const doc = docs.find(function (d) { return d.id === courant; });

    const OUTILS = [
      ['bold', '<b>B</b>', 'Matavy'], ['italic', '<i>I</i>', 'Mitongilana'], ['underline', '<u>U</u>', 'Voatsipika'],
      ['h1', 'H1', 'Lohateny lehibe'], ['h2', 'H2', 'Lohateny kely'], ['p', '¶', 'Andalana tsotra'],
      ['insertUnorderedList', '•', 'Lisitra'], ['insertOrderedList', '1.', 'Lisitra misy laharana'],
      ['justifyLeft', '⇤', 'Ankavia'], ['justifyCenter', '↔', 'Afovoany'],
      ['undo', '↶', 'Foano'], ['redo', '↷', 'Ataovy indray']
    ];

    z.innerHTML = tete('📝 Word', 'Soraty eto ny taratasinao. Ao amin\'ity navigateur ity ihany no voatahiry izy : alaivo ho fichier Word raha hampitaina.') +
      '<div class="panel">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
          '<select id="wordListe" style="flex:1 1 180px; min-width:0; ' + CHAMP + '">' +
            docs.map(function (d) {
              return '<option value="' + d.id + '"' + (d.id === courant ? ' selected' : '') + '>' + html(d.titre) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn-sm btn-primary" id="wordNouveau" style="width:auto;">＋ Vaovao</button>' +
          '<button type="button" class="btn btn-sm btn-red" id="wordEsorina" style="width:auto;">Esorina</button>' +
        '</div>' +
        '<div class="field" style="margin:0.8rem 0 0.6rem;"><label for="wordTitre">Lohateny</label>' +
          '<input id="wordTitre" type="text" value="' + html(doc.titre) + '"></div>' +
        '<div id="wordOutils" style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-bottom:0.5rem;">' +
          OUTILS.map(function (b) {
            return '<button type="button" class="btn btn-sm" data-cmd="' + b[0] + '" title="' + b[2] +
              '" style="width:auto; min-width:2.2rem;">' + b[1] + '</button>';
          }).join('') +
        '</div>' +
        '<div id="wordPage" contenteditable="true" spellcheck="true" style="min-height:320px; background:#fff; color:#111; border-radius:8px; padding:1.2rem 1.4rem; line-height:1.6; font-size:0.95rem; outline:none; overflow-wrap:anywhere;"></div>' +
        '<p id="wordStatut" style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0 0;">' +
          (doc.maj ? 'Voatahiry : ' + quand(doc.maj) : '') + '</p>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.8rem;">' +
          '<button type="button" class="btn btn-sm btn-primary" id="wordTelecharger" style="width:auto;">⬇ Export Microsoft Word (.docx)</button>' +
          '<button type="button" class="btn btn-sm" id="wordImprimer" style="width:auto;">🖨 Pirinty / PDF</button>' +
        '</div>' +
        liens([['Word Online', 'https://www.office.com/launch/word'], ['Google Docs', 'https://docs.google.com/document/create']]) +
      '</div>';

    const page = z.querySelector('#wordPage');
    const titre = z.querySelector('#wordTitre');
    page.innerHTML = doc.html || '';

    let attente = null;
    function garder() {
      doc.html = page.innerHTML;
      doc.titre = titre.value.trim() || 'Tsy misy lohateny';
      doc.maj = Date.now();
      if (!ecrire('word', docs)) return;
      const statut = z.querySelector('#wordStatut');
      if (statut) statut.textContent = 'Voatahiry : ' + quand(doc.maj);
      const opt = z.querySelector('#wordListe option[value="' + doc.id + '"]');
      if (opt) opt.textContent = doc.titre;
    }
    // Avant de redessiner, toujours : une sauvegarde en attente écrirait
    // ensuite l'ancienne liste par-dessus la nouvelle.
    function garderMaintenant() { clearTimeout(attente); garder(); }
    function plusTard() { clearTimeout(attente); attente = setTimeout(garder, 600); }

    page.addEventListener('input', plusTard);
    titre.addEventListener('input', plusTard);
    // Un collage garde le texte, pas la mise en forme ni ce qu'une autre page
    // aurait glissé dedans.
    page.addEventListener('paste', function (e) {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    const barre = z.querySelector('#wordOutils');
    // mousedown : sans cela, le bouton prend le focus et la sélection se perd.
    barre.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    barre.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-cmd]');
      if (!b) return;
      page.focus();
      const c = b.dataset.cmd;
      if (c === 'h1' || c === 'h2' || c === 'p') document.execCommand('formatBlock', false, c === 'p' ? 'P' : c.toUpperCase());
      else document.execCommand(c, false, null);
      plusTard();
    });
    z.querySelector('#wordListe').addEventListener('change', function (e) {
      garderMaintenant();
      ecrire('word_courant', e.target.value);
      rendreWord();
    });
    z.querySelector('#wordNouveau').addEventListener('click', function () {
      garderMaintenant();
      const d = { id: nouvelId(), titre: 'Taratasy vaovao', html: '', maj: Date.now() };
      docs.unshift(d);
      ecrire('word', docs);
      ecrire('word_courant', d.id);
      rendreWord();
      const t = zone('word').querySelector('#wordTitre');
      if (t) { t.focus(); t.select(); }
    });
    z.querySelector('#wordEsorina').addEventListener('click', function () {
      if (!confirm('Esorina tanteraka « ' + doc.titre + ' » ?')) return;
      clearTimeout(attente);
      docs = docs.filter(function (d) { return d.id !== doc.id; });
      ecrire('word', docs);
      ecrire('word_courant', docs[0] ? docs[0].id : null);
      rendreWord();
    });
    // Un vrai .docx (fabriquerDocx). Sans réseau pour charger JSZip, on
    // retombe sur l'ancien .doc — une page HTML que Word ouvre quand même —
    // plutôt que de ne rien donner.
    z.querySelector('#wordTelecharger').addEventListener('click', function () {
      garderMaintenant();
      const bouton = this;
      bouton.disabled = true;
      fabriquerDocx(doc.html).then(function (blob) {
        telecharger(nomFichier(doc.titre) + '.docx', blob);
      }, function () {
        const corps = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
          '<head><meta charset="utf-8"><title>' + html(doc.titre) + '</title></head>' +
          '<body style="font-family:Calibri,Arial,sans-serif;">' + doc.html + '</body></html>';
        telecharger(nomFichier(doc.titre) + '.doc', '﻿' + corps, 'application/msword');
      }).then(function () { bouton.disabled = false; });
    });
    z.querySelector('#wordImprimer').addEventListener('click', function () {
      garderMaintenant();
      const w = window.open('', '_blank');
      if (!w) { alert('Nosakanan\'ny navigateur ny varavarankely vaovao.'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + html(doc.titre) +
        '</title><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:2cm;color:#111}</style></head><body>' +
        doc.html + '</body></html>');
      w.document.close();
      w.focus();
      w.print();
    });
  }

  // ======================= EXCEL =======================
  const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function refDe(c, l) { return LETTRES[c] + (l + 1); }
  function plage(a, b) {
    const pa = /^([A-Z])(\d+)$/.exec(a.toUpperCase());
    const pb = /^([A-Z])(\d+)$/.exec(b.toUpperCase());
    if (!pa || !pb) throw new Error('plage');
    const c1 = Math.min(LETTRES.indexOf(pa[1]), LETTRES.indexOf(pb[1]));
    const c2 = Math.max(LETTRES.indexOf(pa[1]), LETTRES.indexOf(pb[1]));
    const l1 = Math.min(+pa[2], +pb[2]);
    const l2 = Math.max(+pa[2], +pb[2]);
    if ((c2 - c1 + 1) * (l2 - l1 + 1) > 5000) throw new Error('plage');
    const refs = [];
    for (let c = c1; c <= c2; c++) for (let l = l1; l <= l2; l++) refs.push(LETTRES[c] + l);
    return refs;
  }
  function fonction(nom, valeurs) {
    const n = nom.toUpperCase();
    const somme = valeurs.reduce(function (s, v) { return s + v; }, 0);
    if (n === 'SUM' || n === 'SOMME') return somme;
    if (n === 'AVERAGE' || n === 'MOYENNE') return valeurs.length ? somme / valeurs.length : 0;
    if (n === 'MIN') return valeurs.length ? Math.min.apply(null, valeurs) : 0;
    if (n === 'MAX') return valeurs.length ? Math.max.apply(null, valeurs) : 0;
    throw new Error('fonction');
  }
  // La valeur d'une case : son nombre, ou le résultat de sa formule. Une case
  // qui se cite elle-même, de près ou de loin, est une erreur, pas une boucle
  // sans fin.
  function evaluateur(cellules) {
    const encours = {};
    const cache = {};
    function valeur(ref) {
      if (ref in cache) return cache[ref];
      const brut = cellules[ref];
      if (brut == null || brut === '') return 0;
      if (String(brut)[0] !== '=') {
        const n = Number(String(brut).replace(/\s/g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      }
      if (encours[ref]) throw new Error('boucle');
      encours[ref] = true;
      try { return (cache[ref] = calculer(String(brut).slice(1), valeur)); }
      finally { delete encours[ref]; }
    }
    return valeur;
  }
  function affichage(cellules, ref, valeur) {
    const brut = cellules[ref];
    if (brut == null) return '';
    if (String(brut)[0] !== '=') return String(brut);
    try { return String(arrondi(valeur(ref))); } catch (e) { return '#ERR'; }
  }

  function rendreExcel() {
    const z = zone('excel');
    if (!z) return;
    let feuilles = lire('excel', []);
    if (!feuilles.length) {
      feuilles = [{ id: nouvelId(), titre: 'Tabilao vaovao', cellules: {}, lignes: 20, colonnes: 8, maj: Date.now() }];
      ecrire('excel', feuilles);
    }
    let courant = lire('excel_courant', feuilles[0].id);
    if (!feuilles.some(function (f) { return f.id === courant; })) courant = feuilles[0].id;
    const f = feuilles.find(function (x) { return x.id === courant; });
    f.cellules = f.cellules || {};
    const valeur = evaluateur(f.cellules);
    const TH = 'position:sticky; background:var(--panel); color:var(--muted); font-weight:600; padding:0.3rem 0.4rem; border:1px solid var(--line); z-index:1;';

    let grille = '<div style="overflow:auto; max-height:60vh; border:1px solid var(--line); border-radius:8px;">' +
      '<table id="excelGrille" style="border-collapse:collapse; font-size:0.8rem;"><thead><tr>' +
      '<th style="' + TH + ' top:0; left:0; z-index:2;"></th>';
    for (let c = 0; c < f.colonnes; c++) grille += '<th style="' + TH + ' top:0;">' + LETTRES[c] + '</th>';
    grille += '</tr></thead><tbody>';
    for (let l = 0; l < f.lignes; l++) {
      grille += '<tr><th style="' + TH + ' left:0;">' + (l + 1) + '</th>';
      for (let c = 0; c < f.colonnes; c++) {
        const ref = refDe(c, l);
        grille += '<td style="padding:0; border:1px solid var(--line);"><input data-ref="' + ref + '" value="' +
          html(affichage(f.cellules, ref, valeur)) +
          '" style="width:92px; border:0; background:transparent; color:var(--text); padding:0.35rem 0.4rem; font:inherit; box-sizing:border-box;"></td>';
      }
      grille += '</tr>';
    }
    grille += '</tbody></table></div>';

    z.innerHTML = tete('📊 Excel', 'Tabilao misy kajy. Ao amin\'ity navigateur ity ihany no voatahiry izy : alaivo ho fichier Excel raha hampitaina.') +
      '<div class="panel">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
          '<select id="excelListe" style="flex:1 1 180px; min-width:0; ' + CHAMP + '">' +
            feuilles.map(function (x) {
              return '<option value="' + x.id + '"' + (x.id === courant ? ' selected' : '') + '>' + html(x.titre) + '</option>';
            }).join('') +
          '</select>' +
          '<button type="button" class="btn btn-sm btn-primary" id="excelNouveau" style="width:auto;">＋ Vaovao</button>' +
          '<button type="button" class="btn btn-sm btn-red" id="excelEsorina" style="width:auto;">Esorina</button>' +
        '</div>' +
        '<div class="field" style="margin:0.8rem 0 0.6rem;"><label for="excelTitre">Lohateny</label>' +
          '<input id="excelTitre" type="text" value="' + html(f.titre) + '"></div>' +
        '<p id="excelFormule" style="font-family:var(--font-mono); font-size:0.78rem; color:var(--cyan); min-height:1.1rem; margin:0 0 0.5rem;"></p>' +
        grille +
        '<p style="font-size:0.75rem; color:var(--muted); line-height:1.6; margin:0.6rem 0 0;">' +
          'Kajy : manomboka amin\'ny « = ». Ohatra : =A1+B1 · =A1*2 · =SUM(A1:A10) · =MOYENNE(B1:B5) · =MIN(C1:C9) · =MAX(C1:C9)</p>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.8rem;">' +
          '<button type="button" class="btn btn-sm" id="excelLigne" style="width:auto;">＋ Andalana</button>' +
          '<button type="button" class="btn btn-sm" id="excelColonne" style="width:auto;">＋ Tsanganana</button>' +
          '<button type="button" class="btn btn-sm btn-primary" id="excelTelecharger" style="width:auto;">⬇ Export Microsoft Excel (.xlsx)</button>' +
          '<label class="btn btn-sm" style="width:auto; cursor:pointer; margin:0;">⬆ Hampiditra fichier' +
            '<input type="file" id="excelImporter" accept=".xlsx,.xls,.csv" hidden></label>' +
        '</div>' +
        liens([['Excel Online', 'https://www.office.com/launch/excel'], ['Google Sheets', 'https://docs.google.com/spreadsheets/create']]) +
      '</div>';

    const table = z.querySelector('#excelGrille');
    const formule = z.querySelector('#excelFormule');

    function garderFeuille() {
      f.titre = z.querySelector('#excelTitre').value.trim() || 'Tsy misy lohateny';
      f.maj = Date.now();
      ecrire('excel', feuilles);
      const opt = z.querySelector('#excelListe option[value="' + f.id + '"]');
      if (opt) opt.textContent = f.titre;
    }
    // Une case changée peut changer toutes celles qui la citent.
    function recalculer() {
      const v = evaluateur(f.cellules);
      table.querySelectorAll('input[data-ref]').forEach(function (inp) {
        if (inp !== document.activeElement) inp.value = affichage(f.cellules, inp.dataset.ref, v);
      });
    }

    table.addEventListener('focusin', function (e) {
      const inp = e.target.closest('input[data-ref]');
      if (!inp) return;
      const brut = f.cellules[inp.dataset.ref];
      inp.value = brut == null ? '' : String(brut);
      formule.textContent = inp.dataset.ref + ' : ' + (brut == null ? '' : brut);
    });
    table.addEventListener('input', function (e) {
      const inp = e.target.closest('input[data-ref]');
      if (inp) formule.textContent = inp.dataset.ref + ' : ' + inp.value;
    });
    table.addEventListener('focusout', function (e) {
      const inp = e.target.closest('input[data-ref]');
      if (!inp) return;
      const brut = inp.value.trim();
      if (brut === '') delete f.cellules[inp.dataset.ref];
      else f.cellules[inp.dataset.ref] = brut;
      garderFeuille();
      // Le focus est déjà ailleurs : cette case-ci aussi reprend sa valeur.
      setTimeout(recalculer, 0);
    });
    // Entrée descend d'une case, comme dans un tableur.
    table.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const inp = e.target.closest('input[data-ref]');
      if (!inp) return;
      e.preventDefault();
      const m = /^([A-Z])(\d+)$/.exec(inp.dataset.ref);
      const bas = table.querySelector('input[data-ref="' + m[1] + (+m[2] + 1) + '"]');
      if (bas) bas.focus(); else inp.blur();
    });

    z.querySelector('#excelTitre').addEventListener('change', garderFeuille);
    z.querySelector('#excelListe').addEventListener('change', function (e) {
      ecrire('excel_courant', e.target.value);
      rendreExcel();
    });
    z.querySelector('#excelNouveau').addEventListener('click', function () {
      const n = { id: nouvelId(), titre: 'Tabilao vaovao', cellules: {}, lignes: 20, colonnes: 8, maj: Date.now() };
      feuilles.unshift(n);
      ecrire('excel', feuilles);
      ecrire('excel_courant', n.id);
      rendreExcel();
    });
    z.querySelector('#excelEsorina').addEventListener('click', function () {
      if (!confirm('Esorina tanteraka « ' + f.titre + ' » ?')) return;
      feuilles = feuilles.filter(function (x) { return x.id !== f.id; });
      ecrire('excel', feuilles);
      ecrire('excel_courant', feuilles[0] ? feuilles[0].id : null);
      rendreExcel();
    });
    z.querySelector('#excelLigne').addEventListener('click', function () {
      if (f.lignes >= 500) return;
      f.lignes += 1;
      garderFeuille();
      rendreExcel();
    });
    z.querySelector('#excelColonne').addEventListener('click', function () {
      if (f.colonnes >= 26) { alert('Tsanganana 26 (A–Z) no farany.'); return; }
      f.colonnes += 1;
      garderFeuille();
      rendreExcel();
    });

    // Les formules partent avec le fichier : Excel les recalcule à
    // l'ouverture. MOYENNE et SOMME prennent leur nom anglais, le seul que le
    // format connaisse.
    z.querySelector('#excelTelecharger').addEventListener('click', function () {
      if (!window.XLSX) { alert('Tsy tafiditra ny fitaovana Excel. Andramo indray rehefa misy Internet.'); return; }
      const v = evaluateur(f.cellules);
      const aoa = [];
      for (let l = 0; l < f.lignes; l++) {
        const rang = [];
        for (let c = 0; c < f.colonnes; c++) {
          const brut = f.cellules[refDe(c, l)];
          if (brut == null || brut === '') { rang.push(null); continue; }
          if (String(brut)[0] === '=') {
            try { rang.push(arrondi(v(refDe(c, l)))); } catch (e) { rang.push('#ERR'); }
            continue;
          }
          const n = Number(String(brut).replace(/\s/g, '').replace(',', '.'));
          rang.push(isNaN(n) ? String(brut) : n);
        }
        aoa.push(rang);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      Object.keys(f.cellules).forEach(function (ref) {
        const brut = String(f.cellules[ref]);
        if (brut[0] !== '=' || !ws[ref]) return;
        ws[ref].f = brut.slice(1).replace(/SOMME\(/gi, 'SUM(').replace(/MOYENNE\(/gi, 'AVERAGE(');
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nomFichier(f.titre).slice(0, 31));
      XLSX.writeFile(wb, nomFichier(f.titre) + '.xlsx');
    });

    z.querySelector('#excelImporter').addEventListener('change', function (e) {
      const fichier = e.target.files && e.target.files[0];
      if (!fichier) return;
      if (!window.XLSX) { alert('Tsy tafiditra ny fitaovana Excel. Andramo indray rehefa misy Internet.'); return; }
      const lecteur = new FileReader();
      lecteur.onload = function (ev) {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws || !ws['!ref']) throw new Error('vide');
          const r = XLSX.utils.decode_range(ws['!ref']);
          const lMax = Math.min(r.e.r, 499);
          const cMax = Math.min(r.e.c, 25);
          const cellules = {};
          for (let l = r.s.r; l <= lMax; l++) {
            for (let c = r.s.c; c <= cMax; c++) {
              const cell = ws[XLSX.utils.encode_cell({ r: l, c: c })];
              if (!cell) continue;
              const brut = cell.f ? '=' + cell.f : (cell.t === 'n' ? String(cell.v) : (cell.w != null ? cell.w : cell.v));
              if (brut !== '' && brut != null) cellules[refDe(c, l)] = String(brut);
            }
          }
          const n = {
            id: nouvelId(), titre: fichier.name.replace(/\.[^.]+$/, '') || 'Tabilao',
            cellules: cellules, lignes: Math.max(20, lMax + 2), colonnes: Math.max(8, cMax + 1), maj: Date.now()
          };
          feuilles.unshift(n);
          ecrire('excel', feuilles);
          ecrire('excel_courant', n.id);
          rendreExcel();
        } catch (err) {
          alert('Tsy voavaky ilay fichier.');
        }
      };
      lecteur.readAsArrayBuffer(fichier);
    });
  }

  // ======================= NOTES =======================
  let rechercheNotes = '';
  function rendreNotes() {
    const z = zone('notes');
    if (!z) return;
    let notes = lire('notes', []);
    const courant = lire('notes_courant', null);
    const note = notes.find(function (n) { return n.id === courant; }) || null;

    z.innerHTML = tete('📒 Notes', 'Ny zavatra tsy tokony hohadinoina. Ao amin\'ity navigateur ity ihany no voatahiry izy.') +
      '<div class="panel">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">' +
          '<input id="notesRecherche" type="search" placeholder="Karohy..." value="' + html(rechercheNotes) + '" style="flex:1 1 160px; min-width:0; ' + CHAMP + '">' +
          '<button type="button" class="btn btn-sm btn-primary" id="notesNouveau" style="width:auto;">＋ Vaovao</button>' +
        '</div>' +
        '<div id="notesListe" style="margin-top:0.8rem;"></div>' +
      '</div>' +
      (note
        ? '<div class="panel" style="margin-top:1rem;">' +
            '<div class="field" style="margin-bottom:0.6rem;"><label for="noteTitre">Lohateny</label>' +
              '<input id="noteTitre" type="text" value="' + html(note.titre) + '"></div>' +
            '<textarea id="noteTexte" rows="10" style="width:100%; box-sizing:border-box; resize:vertical; line-height:1.6; ' + CHAMP + '">' + html(note.texte) + '</textarea>' +
            '<p id="noteStatut" style="font-size:0.75rem; color:var(--muted); margin:0.4rem 0 0;">Voatahiry : ' + quand(note.maj) + '</p>' +
            '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">' +
              '<button type="button" class="btn btn-sm" id="noteFermer" style="width:auto;">Hidio</button>' +
              '<button type="button" class="btn btn-sm btn-red" id="noteEsorina" style="width:auto;">Esorina</button>' +
            '</div>' +
          '</div>'
        : '');

    function dessinerListe() {
      const liste = z.querySelector('#notesListe');
      const q = rechercheNotes.trim().toLowerCase();
      const trouvees = notes.slice()
        .sort(function (a, b) { return b.maj - a.maj; })
        .filter(function (n) { return !q || (n.titre + ' ' + n.texte).toLowerCase().indexOf(q) >= 0; });
      if (!trouvees.length) {
        liste.innerHTML = '<p class="empty-hint" style="margin:0;">' + (notes.length ? 'Tsy misy mifanaraka.' : 'Mbola tsy misy notes.') + '</p>';
        return;
      }
      liste.innerHTML = trouvees.map(function (n) {
        const actif = note && n.id === note.id;
        return '<button type="button" data-note="' + n.id + '" style="display:block; width:100%; text-align:left; cursor:pointer; margin-bottom:0.5rem; padding:0.6rem 0.8rem; border-radius:8px; font:inherit; color:var(--text); background:' +
          (actif ? 'rgba(79,216,224,0.1)' : 'transparent') + '; border:1px solid ' + (actif ? 'var(--cyan)' : 'var(--line)') + ';">' +
          '<strong style="font-size:0.85rem;">' + html(n.titre) + '</strong>' +
          '<span style="display:block; font-size:0.78rem; color:var(--muted); margin-top:0.2rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
            html(n.texte.slice(0, 120) || '—') + '</span>' +
          '<span style="display:block; font-size:0.7rem; color:var(--muted); margin-top:0.2rem;">' + quand(n.maj) + '</span>' +
        '</button>';
      }).join('');
    }
    dessinerListe();

    z.querySelector('#notesRecherche').addEventListener('input', function (e) {
      rechercheNotes = e.target.value;
      dessinerListe();
    });
    z.querySelector('#notesListe').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-note]');
      if (!b) return;
      ecrire('notes_courant', b.dataset.note);
      rendreNotes();
    });
    z.querySelector('#notesNouveau').addEventListener('click', function () {
      const n = { id: nouvelId(), titre: 'Note vaovao', texte: '', maj: Date.now() };
      notes.unshift(n);
      ecrire('notes', notes);
      ecrire('notes_courant', n.id);
      rechercheNotes = '';
      rendreNotes();
      const t = zone('notes').querySelector('#noteTexte');
      if (t) t.focus();
    });
    if (!note) return;

    let attente = null;
    function garder() {
      note.titre = z.querySelector('#noteTitre').value.trim() || 'Tsy misy lohateny';
      note.texte = z.querySelector('#noteTexte').value;
      note.maj = Date.now();
      if (!ecrire('notes', notes)) return;
      z.querySelector('#noteStatut').textContent = 'Voatahiry : ' + quand(note.maj);
      dessinerListe();
    }
    function plusTard() { clearTimeout(attente); attente = setTimeout(garder, 500); }
    z.querySelector('#noteTitre').addEventListener('input', plusTard);
    z.querySelector('#noteTexte').addEventListener('input', plusTard);
    z.querySelector('#noteFermer').addEventListener('click', function () {
      clearTimeout(attente);
      garder();
      ecrire('notes_courant', null);
      rendreNotes();
    });
    z.querySelector('#noteEsorina').addEventListener('click', function () {
      if (!confirm('Esorina tanteraka « ' + note.titre + ' » ?')) return;
      clearTimeout(attente);
      notes = notes.filter(function (n) { return n.id !== note.id; });
      ecrire('notes', notes);
      ecrire('notes_courant', null);
      rendreNotes();
    });
  }

  // ======================= CALCULATRICE =======================
  let expression = '';
  function rendreKajy() {
    const z = zone('kajy');
    if (!z) return;
    const TOUCHES = ['C', '⌫', '(', ')', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+'];
    z.innerHTML = tete('🧮 Calculatrice', 'Kajy haingana. Azo ampiasaina koa ny klavie amin\'ny solosaina.') +
      '<div class="panel" style="max-width:380px;">' +
        '<input id="kajyEcran" readonly aria-label="Kajy" style="width:100%; box-sizing:border-box; text-align:right; font-size:1.6rem; font-family:var(--font-mono); ' + CHAMP + '">' +
        '<div id="kajyResultat" style="text-align:right; color:var(--muted); min-height:1.3rem; font-size:0.9rem; margin:0.35rem 0 0.7rem; font-family:var(--font-mono);"></div>' +
        '<div id="kajyTouches" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:0.4rem;">' +
          TOUCHES.map(function (t) {
            const op = '÷×−+%()'.indexOf(t) >= 0;
            const rouge = t === 'C' || t === '⌫';
            return '<button type="button" class="btn' + (rouge ? ' btn-red' : '') + '" data-t="' + t +
              '" style="width:100%; font-size:1.15rem; padding:0.7rem 0;' + (op ? ' color:var(--cyan);' : '') + '">' + t + '</button>';
          }).join('') +
          '<button type="button" class="btn btn-primary" data-t="=" style="grid-column:span 4; font-size:1.15rem; padding:0.7rem 0;">=</button>' +
        '</div>' +
        '<div id="kajyHistorique" style="margin-top:0.9rem; font-size:0.8rem; color:var(--muted); font-family:var(--font-mono); line-height:1.7;"></div>' +
      '</div>';

    const ecran = z.querySelector('#kajyEcran');
    const resultat = z.querySelector('#kajyResultat');
    const historique = z.querySelector('#kajyHistorique');

    function dessinerHistorique() {
      const h = lire('kajy_historique', []);
      historique.innerHTML = h.length
        ? h.map(function (x) { return '<div>' + html(x) + '</div>'; }).join('')
        : '';
    }
    function montrer() {
      ecran.value = expression;
      try { resultat.textContent = expression ? '= ' + arrondi(calculer(expression)) : ''; }
      catch (e) { resultat.textContent = ''; }
    }
    window.__kajyTouche = function (t) {
      if (t === 'C') expression = '';
      else if (t === '⌫') expression = expression.slice(0, -1);
      else if (t === '=') {
        try {
          const v = arrondi(calculer(expression));
          const h = lire('kajy_historique', []);
          h.unshift(expression + ' = ' + v);
          ecrire('kajy_historique', h.slice(0, 10));
          expression = String(v);
          dessinerHistorique();
        } catch (e) {
          resultat.textContent = expression ? 'Tsy mety ny kajy' : '';
          return;
        }
      } else if (expression.length < 80) expression += t;
      montrer();
    };
    z.querySelector('#kajyTouches').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-t]');
      if (b) window.__kajyTouche(b.dataset.t);
    });
    montrer();
    dessinerHistorique();
  }
  // Le clavier, seulement quand la page est ouverte et qu'on n'écrit pas
  // ailleurs.
  document.addEventListener('keydown', function (e) {
    const sec = document.getElementById('section-kajy');
    if (!sec || !sec.classList.contains('active') || !window.__kajyTouche) return;
    const cible = e.target;
    if (cible && cible.id !== 'kajyEcran' && (/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) || cible.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let t = null;
    if (/^[0-9.()%+]$/.test(k)) t = k;
    else if (k === ',') t = '.';
    else if (k === '*' || k === 'x') t = '×';
    else if (k === '/') t = '÷';
    else if (k === '-') t = '−';
    else if (k === 'Enter' || k === '=') t = '=';
    else if (k === 'Backspace') t = '⌫';
    else if (k === 'Escape' || k === 'Delete') t = 'C';
    if (!t) return;
    e.preventDefault();
    window.__kajyTouche(t);
  });

  // ======================= CALENDRIER =======================
  const MOIS = ['Janoary', 'Febroary', 'Martsa', 'Aprily', 'Mey', 'Jona', 'Jolay', 'Aogositra', 'Septambra', 'Oktobra', 'Novambra', 'Desambra'];
  const JOURS_COURTS = ['Alats', 'Tal', 'Alar', 'Alak', 'Zoma', 'Asab', 'Alah'];
  const JOURS_LONGS = ['Alatsinainy', 'Talata', 'Alarobia', 'Alakamisy', 'Zoma', 'Asabotsy', 'Alahady'];
  function cleJour(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  let moisVu = null;
  let jourChoisi = null;
  function rendreCalendrier() {
    const z = zone('calendrier');
    if (!z) return;
    const evenements = lire('calendrier', {});
    const auj = new Date();
    if (!moisVu) moisVu = new Date(auj.getFullYear(), auj.getMonth(), 1);
    if (!jourChoisi) jourChoisi = cleJour(auj);

    // La semaine commence le lundi : getDay() rend 0 pour dimanche.
    const decalage = (moisVu.getDay() + 6) % 7;
    const nbJours = new Date(moisVu.getFullYear(), moisVu.getMonth() + 1, 0).getDate();
    let cases = JOURS_COURTS.map(function (j) {
      return '<div style="text-align:center; font-size:0.72rem; color:var(--muted); padding:0.2rem 0;">' + j + '</div>';
    }).join('');
    for (let i = 0; i < decalage; i++) cases += '<div></div>';
    for (let d = 1; d <= nbJours; d++) {
      const date = new Date(moisVu.getFullYear(), moisVu.getMonth(), d);
      const k = cleJour(date);
      const nb = (evenements[k] || []).length;
      const aujourdhui = k === cleJour(auj);
      const choisi = k === jourChoisi;
      cases += '<button type="button" data-jour="' + k + '" style="position:relative; aspect-ratio:1; min-height:2.4rem; border-radius:8px; cursor:pointer; font:inherit; font-size:0.85rem; color:var(--text); background:' +
        (choisi ? 'rgba(79,216,224,0.18)' : 'transparent') + '; border:1px solid ' + (aujourdhui ? 'var(--cyan)' : 'var(--line)') + ';">' + d +
        (nb ? '<span style="position:absolute; bottom:4px; left:50%; transform:translateX(-50%); min-width:6px; height:6px; border-radius:999px; background:var(--amber);"></span>' : '') +
        '</button>';
    }

    const [a, m, j] = jourChoisi.split('-').map(Number);
    const dateChoisie = new Date(a, m - 1, j);
    const duJour = (evenements[jourChoisi] || []).slice().sort(function (x, y) { return (x.ora || '').localeCompare(y.ora || ''); });

    z.innerHTML = tete('📅 Calendrier', 'Ny fotoana tsy tokony hohadinoina. Ao amin\'ity navigateur ity ihany no voatahiry izy.') +
      '<div class="panel" style="max-width:520px;">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.7rem;">' +
          '<button type="button" class="btn btn-sm" id="calPrecedent" style="width:auto;" aria-label="Volana teo aloha">‹</button>' +
          '<strong>' + MOIS[moisVu.getMonth()] + ' ' + moisVu.getFullYear() + '</strong>' +
          '<button type="button" class="btn btn-sm" id="calSuivant" style="width:auto;" aria-label="Volana manaraka">›</button>' +
        '</div>' +
        '<div id="calGrille" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:0.3rem;">' + cases + '</div>' +
        '<button type="button" class="btn btn-sm" id="calAujourdhui" style="width:auto; margin-top:0.7rem;">Anio</button>' +
      '</div>' +
      '<div class="panel" style="max-width:520px; margin-top:1rem;">' +
        '<div class="panneau-titre">' + JOURS_LONGS[(dateChoisie.getDay() + 6) % 7] + ' ' + j + ' ' + MOIS[m - 1] + ' ' + a + '</div>' +
        '<div id="calListe" style="margin:0.6rem 0;">' +
          (duJour.length
            ? duJour.map(function (ev) {
                return '<div style="display:flex; align-items:center; gap:0.6rem; border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.7rem; margin-bottom:0.4rem; font-size:0.85rem;">' +
                  '<span style="font-family:var(--font-mono); color:var(--cyan); min-width:3rem;">' + html(ev.ora || '—') + '</span>' +
                  '<span style="flex:1; overflow-wrap:anywhere;">' + html(ev.texte) + '</span>' +
                  '<button type="button" data-supprimer="' + ev.id + '" title="Esorina" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:1rem;">✕</button>' +
                '</div>';
              }).join('')
            : '<p class="empty-hint" style="margin:0;">Tsy misy na inona na inona amin\'ity andro ity.</p>') +
        '</div>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">' +
          '<input id="calOra" type="time" style="width:auto; ' + CHAMP + '">' +
          '<input id="calTexte" type="text" placeholder="Inona no hatao ?" style="flex:1 1 160px; min-width:0; ' + CHAMP + '">' +
          '<button type="button" class="btn btn-sm btn-primary" id="calAjouter" style="width:auto;">Ampidiro</button>' +
        '</div>' +
      '</div>';

    z.querySelector('#calPrecedent').addEventListener('click', function () {
      moisVu = new Date(moisVu.getFullYear(), moisVu.getMonth() - 1, 1);
      rendreCalendrier();
    });
    z.querySelector('#calSuivant').addEventListener('click', function () {
      moisVu = new Date(moisVu.getFullYear(), moisVu.getMonth() + 1, 1);
      rendreCalendrier();
    });
    z.querySelector('#calAujourdhui').addEventListener('click', function () {
      const d = new Date();
      moisVu = new Date(d.getFullYear(), d.getMonth(), 1);
      jourChoisi = cleJour(d);
      rendreCalendrier();
    });
    z.querySelector('#calGrille').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-jour]');
      if (!b) return;
      jourChoisi = b.dataset.jour;
      rendreCalendrier();
    });
    z.querySelector('#calListe').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-supprimer]');
      if (!b) return;
      const tous = lire('calendrier', {});
      tous[jourChoisi] = (tous[jourChoisi] || []).filter(function (ev) { return ev.id !== b.dataset.supprimer; });
      if (!tous[jourChoisi].length) delete tous[jourChoisi];
      ecrire('calendrier', tous);
      rendreCalendrier();
    });
    function ajouter() {
      const texte = z.querySelector('#calTexte').value.trim();
      if (!texte) { z.querySelector('#calTexte').focus(); return; }
      const tous = lire('calendrier', {});
      (tous[jourChoisi] = tous[jourChoisi] || []).push({ id: nouvelId(), ora: z.querySelector('#calOra').value, texte: texte });
      ecrire('calendrier', tous);
      rendreCalendrier();
    }
    z.querySelector('#calAjouter').addEventListener('click', ajouter);
    z.querySelector('#calTexte').addEventListener('keydown', function (e) { if (e.key === 'Enter') ajouter(); });
  }

  // ======================= HORAIRE =======================
  // Une semaine, heure par heure, comme un emploi du temps : ce qu'on écrit
  // dans une case reste d'une semaine à l'autre.
  function rendreHoraire() {
    const z = zone('horaire');
    if (!z) return;
    const cases = lire('horaire', {});
    const debut = lire('horaire_debut', 7);
    const fin = lire('horaire_fin', 18);
    const maintenant = new Date();
    const jourActuel = (maintenant.getDay() + 6) % 7;
    const heureActuelle = maintenant.getHours();

    function options(choisie, de, a) {
      let o = '';
      for (let h = de; h <= a; h++) o += '<option value="' + h + '"' + (h === choisie ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>';
      return o;
    }
    const TH = 'background:var(--panel); color:var(--muted); font-weight:600; padding:0.35rem 0.5rem; border:1px solid var(--line); position:sticky; top:0; z-index:1;';
    let t = '<div style="overflow:auto; max-height:65vh; border:1px solid var(--line); border-radius:8px;"><table id="horaireGrille" style="border-collapse:collapse; font-size:0.8rem;"><thead><tr>' +
      '<th style="' + TH + ' left:0; z-index:2;"></th>' +
      JOURS_LONGS.map(function (j, i) {
        return '<th style="' + TH + (i === jourActuel ? ' color:var(--cyan);' : '') + '">' + j + '</th>';
      }).join('') + '</tr></thead><tbody>';
    for (let h = debut; h < fin; h++) {
      const ora = String(h).padStart(2, '0') + ':00';
      t += '<tr><th style="' + TH + ' left:0; top:auto;' + (h === heureActuelle ? ' color:var(--cyan);' : '') + '">' + ora + '</th>';
      for (let j = 0; j < 7; j++) {
        const k = j + '-' + h;
        const ici = j === jourActuel && h === heureActuelle;
        t += '<td style="padding:0; border:1px solid ' + (ici ? 'var(--cyan)' : 'var(--line)') + ';"><input data-case="' + k + '" value="' + html(cases[k] || '') +
          '" style="width:110px; border:0; background:' + (ici ? 'rgba(79,216,224,0.1)' : 'transparent') + '; color:var(--text); padding:0.4rem; font:inherit; box-sizing:border-box;"></td>';
      }
      t += '</tr>';
    }
    t += '</tbody></table></div>';

    z.innerHTML = tete('🕒 Horaire', 'Ny fandaharam-potoanao isan-kerinandro. Soraty ao anaty efajoro ny zavatra hatao. Ao amin\'ity navigateur ity ihany no voatahiry izy.') +
      '<div class="panel">' +
        '<div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-bottom:0.8rem; font-size:0.82rem;">' +
          '<label for="horaireDebut">Manomboka</label>' +
          '<select id="horaireDebut" style="width:auto; ' + CHAMP + '">' + options(debut, 0, 22) + '</select>' +
          '<label for="horaireFin">Mifarana</label>' +
          '<select id="horaireFin" style="width:auto; ' + CHAMP + '">' + options(fin, 1, 24) + '</select>' +
          '<button type="button" class="btn btn-sm btn-red" id="horaireVider" style="width:auto; margin-left:auto;">Fafana daholo</button>' +
        '</div>' +
        t +
      '</div>';

    z.querySelector('#horaireGrille').addEventListener('input', function (e) {
      const inp = e.target.closest('input[data-case]');
      if (!inp) return;
      const tous = lire('horaire', {});
      if (inp.value.trim()) tous[inp.dataset.case] = inp.value;
      else delete tous[inp.dataset.case];
      ecrire('horaire', tous);
    });
    function changerPlage() {
      let d = Number(z.querySelector('#horaireDebut').value);
      let f = Number(z.querySelector('#horaireFin').value);
      if (f <= d) f = Math.min(24, d + 1);
      ecrire('horaire_debut', d);
      ecrire('horaire_fin', f);
      rendreHoraire();
    }
    z.querySelector('#horaireDebut').addEventListener('change', changerPlage);
    z.querySelector('#horaireFin').addEventListener('change', changerPlage);
    z.querySelector('#horaireVider').addEventListener('click', function () {
      if (!confirm('Fafana daholo ny horaire ?')) return;
      ecrire('horaire', {});
      rendreHoraire();
    });
  }

  // ======================= DÉPART =======================
  const OUTILS = {
    word: rendreWord, excel: rendreExcel, notes: rendreNotes,
    kajy: rendreKajy, calendrier: rendreCalendrier, horaire: rendreHoraire
  };
  function toutRendre() {
    Object.keys(OUTILS).forEach(function (k) {
      try { OUTILS[k](); } catch (e) { console.error('fitaovana ' + k, e); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', toutRendre);
  else toutRendre();
})();

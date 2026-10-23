  // ---------------- 🌐 TENY : LE SITE ENTIER DANS LA LANGUE CHOISIE ----------------
  // Le bouton « 🌐 Teny » du menu. La fenêtre de traduction du navigateur
  // n'appartient pas au site : elle devine la langue de la page et, sur un
  // site qui mêle malgache, français et anglais, se trompait (« English →
  // English »). Le traducteur tout fait de Google, lui, refusait une fois sur
  // deux (403). On traduit donc nous-mêmes, texte par texte :
  //
  //  - seuls les textes visibles partent, par paquets, et ce qui arrive plus
  //    tard (une page ouverte, un message reçu) suit au fil de l'eau ;
  //  - chaque texte garde son original : changer de langue recharge la page,
  //    qui repart de lui (pas de « Tsy adika » dans la liste, 23/10/2026 :
  //    l'utilisateur n'en voulait pas) ;
  //  - la langue de départ est devinée texte par texte (malgache ou français),
  //    sans quoi un paquet mêlé était lu dans une seule langue et la moitié
  //    restait en l'état ;
  //  - les traductions sont gardées sur l'appareil : une phrase n'est
  //    demandée qu'une fois.
  //
  // Le service est celui de Google Traduction sans clé (translate_a/single,
  // client=gtx). Il n'est pas officiel : s'il se tait, le site reste lisible
  // dans sa langue d'origine.
  (function(){
    const TENY = [
      ['mg', 'Malagasy'], ['fr', 'Français'], ['en', 'English'], ['zh-CN', '中文'],
      ['es', 'Español'], ['pt', 'Português'], ['ar', 'العربية'], ['hi', 'हिन्दी'],
      ['ru', 'Русский'], ['de', 'Deutsch'], ['it', 'Italiano'], ['ja', '日本語'], ['ko', '한국어']
    ];
    const CLE_TENY = 'nyasako_teny';
    let teny = '';
    try{ teny = localStorage.getItem(CLE_TENY) || ''; }catch(e){}

    function apetraho(code){
      try{
        if(code) localStorage.setItem(CLE_TENY, code);
        else localStorage.removeItem(CLE_TENY);
      }catch(e){}
      // Rechargée, la page repart de ses textes d'origine.
      location.reload();
    }

    // ---------- Le choix ----------
    function asehoyNySafidy(){
      const ancien = document.getElementById('tenySafidy');
      if(ancien) ancien.remove();
      const fond = document.createElement('div');
      fond.id = 'tenySafidy';
      fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; ' +
        'justify-content:center; z-index:9600; padding:1rem;';
      const boite = document.createElement('div');
      boite.className = 'panel';
      boite.style.cssText = 'max-width:360px; width:100%; margin:0; max-height:calc(100vh - 2rem); overflow-y:auto;';
      // Le titre est écrit pour chaque langue ; les noms des langues restent
      // dans leur propre écriture (notranslate) ; la phrase, elle, se traduit.
      boite.innerHTML = '<h3 class="notranslate" style="margin-bottom:0.3rem;">🌐 ' + ((teny && ANARAN_NY_BOKOTRA[teny]) || 'Teny') + '</h3>' +
        '<p data-soratra style="font-size:0.78rem; color:var(--muted); margin-bottom:0.8rem;">Safidio ny fiteny : adika ho azy ny site manontolo.</p>' +
        '<div data-lisitra class="notranslate" style="display:flex; flex-direction:column; gap:0.4rem;"></div>';
      const lisitra = boite.querySelector('[data-lisitra]');
      TENY.forEach(function(t){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm' + (t[0] === teny ? ' btn-primary' : '');
        b.style.cssText = 'width:100%; text-align:left;';
        b.textContent = (t[0] === teny ? '✓ ' : '') + t[1];
        b.addEventListener('click', function(){
          fond.remove();
          if(t[0] !== teny) apetraho(t[0]);
        });
        lisitra.appendChild(b);
      });
      const hidio = document.createElement('button');
      hidio.type = 'button';
      hidio.className = 'btn btn-sm';
      hidio.style.cssText = 'width:auto; margin-top:0.7rem;';
      hidio.textContent = 'Fermer';
      hidio.addEventListener('click', function(){ fond.remove(); });
      boite.appendChild(hidio);
      fond.addEventListener('click', function(e){ if(e.target === fond) fond.remove(); });
      fond.appendChild(boite);
      document.body.appendChild(fond);
    }
    const bokotra = document.getElementById('tenyToggle');
    // Le bouton lui-même suit la langue choisie. Écrit ici et non traduit :
    // Google rendait « Teny » par « Words ».
    const ANARAN_NY_BOKOTRA = {
      mg: 'Teny', fr: 'Langue', en: 'Language', 'zh-CN': '语言', es: 'Idioma', pt: 'Idioma',
      ar: 'اللغة', hi: 'भाषा', ru: 'Язык', de: 'Sprache', it: 'Lingua', ja: '言語', ko: '언어'
    };
    if(bokotra){
      bokotra.classList.add('notranslate');
      if(teny && ANARAN_NY_BOKOTRA[teny]) bokotra.textContent = '🌐 ' + ANARAN_NY_BOKOTRA[teny];
      const anarana = TENY.filter(function(t){ return t[0] === teny; })[0];
      if(anarana) bokotra.title = '🌐 ' + anarana[1];
      bokotra.addEventListener('click', function(e){
        e.stopPropagation();
        asehoyNySafidy();
      });
    }

    if(!teny) return;
    document.documentElement.lang = teny;

    // ---------- Les traductions déjà connues ----------
    // « v3 » : les traductions gardées avant le 23/10/2026 venaient d'une langue
    // de départ mal devinée (beaucoup restées telles quelles), puis sans les
    // majuscules de l'original ; on repart à neuf.
    const CLE_CACHE = 'nyasako_teny_dika_v3_' + teny;
    try{
      Object.keys(localStorage).forEach(function(k){
        if(k.indexOf('nyasako_teny_dika_') === 0 && k.indexOf('nyasako_teny_dika_v3_') !== 0) localStorage.removeItem(k);
      });
    }catch(e){}
    let dika = {};
    try{ dika = JSON.parse(localStorage.getItem(CLE_CACHE)) || {}; }catch(e){ dika = {}; }
    // Des mots seuls que Google prend à contresens (« Corbeille » → « Basket »,
    // « Horaire » → « Hourly ») ou laisse tels quels (« Feo ») : écrits ici,
    // ils passent avant ce que Google répond. « Botika », lui, est un nom.
    // En malgache surtout, les mots seuls du menu sortaient de travers
    // (« Tableau de bord » → « anaty fiara », « Edge » → « sisin'ny »).
    const VOAFARITRA = {
      'Botika': { '*': 'Botika' },
      'Fokontany': { '*': 'Fokontany' },
      // L'en-tête de la Botika écrit « Ny <b>asako</b> » : deux morceaux, que
      // Google rendait par « The my work ».
      'Ny': { '*': 'Ny' },
      'asako': { '*': 'asako' },
      'Chrome': { '*': 'Chrome' },
      'Edge': { '*': 'Edge' },
      'PDF': { '*': 'PDF' },
      'Corbeille': { en: 'Trash', mg: 'Fako', es: 'Papelera', pt: 'Lixeira', de: 'Papierkorb', it: 'Cestino' },
      'Horaire': { en: 'Schedule', mg: 'Fandaharam-potoana', es: 'Horario', pt: 'Horário', de: 'Zeitplan', it: 'Orario' },
      'Feo': { en: 'Sound', fr: 'Son', es: 'Sonido', pt: 'Som', de: 'Ton', it: 'Suono' },
      'Tableau de bord': { mg: 'Tabilao fitantanana' },
      'Tableau de bord —': { en: 'Dashboard —', mg: 'Tabilao fitantanana —' },
      'Articles': { mg: 'Entana' },
      'Entrée en stock': { mg: "Fidiran'entana" },
      'Nouvel article': { mg: 'Entana vaovao' },
      'Notifications': { mg: 'Fampandrenesana' },
      'Panier': { mg: 'Harona' },
      'Factures': { mg: 'Faktiora' },
      'Notes': { mg: 'Naoty' },
      'Calculatrice': { mg: 'Milina mpikajy' },
      'Calendrier': { mg: 'Kalandrie' },
      'Message': { mg: 'Hafatra' },
      'Live direct': { mg: 'Live mivantana' },
      'Call': { mg: 'Antso' },
      'Portefeuille': { mg: 'Kitapom-bola' },
      'Livreur': { mg: 'Mpanatitra' },
      "Fond d'écran": { mg: 'Sary ambadika' },
      // Les deux boutons des fenêtres : « Hidio » sortait « Verrouillez ».
      'Alamino': { fr: 'Aligner', en: 'Line up', es: 'Alinear', pt: 'Alinhar', de: 'Aufreihen', it: 'Allinea' },
      'Hidio daholo': { fr: 'Tout fermer', en: 'Close all', es: 'Cerrar todo', pt: 'Fechar tudo', de: 'Alle schließen', it: 'Chiudi tutto' }
    };
    Object.keys(VOAFARITRA).forEach(function(k){
      const t = VOAFARITRA[k][teny] || VOAFARITRA[k]['*'];
      if(t) dika[k] = t;
    });
    let tehirizoTimer = null;
    function tehirizo(){
      if(tehirizoTimer) return;
      tehirizoTimer = setTimeout(function(){
        tehirizoTimer = null;
        const cles = Object.keys(dika);
        // Au-delà, on repart des plus récentes : localStorage n'est pas infini.
        if(cles.length > 5000) cles.slice(0, cles.length - 4000).forEach(function(k){ delete dika[k]; });
        try{ localStorage.setItem(CLE_CACHE, JSON.stringify(dika)); }catch(e){}
      }, 1500);
    }

    // ---------- Ce qui se traduit ----------
    // Les <option> des listes déroulantes se traduisent aussi : leur texte
    // change, leur valeur non.
    const SAUTE = /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE|NOSCRIPT|svg|SVG|TITLE)$/;
    function horsJeu(el){
      for(let e = el; e && e !== document.body; e = e.parentElement){
        if(SAUTE.test(e.nodeName) || e.isContentEditable) return true;
        if(e.classList && e.classList.contains('notranslate')) return true;
        if(e.getAttribute && e.getAttribute('translate') === 'no') return true;
        if(e.hasAttribute && e.hasAttribute('data-e3d')) return true;
      }
      return false;
    }
    function mila(texte){
      if(!texte || texte.length > 1200) return false;
      if(!/\p{L}{2,}/u.test(texte)) return false;
      // Une adresse, un courriel, un identifiant : rien à traduire.
      if(/^(https?:\/\/|www\.)\S+$/i.test(texte) || /^\S+@\S+\.\S+$/.test(texte)) return false;
      return true;
    }
    // Une <option> n'a pas de boîte à elle : c'est sa liste qui se voit ou non.
    function hita(el){
      if(el && (el.nodeName === 'OPTION' || el.nodeName === 'OPTGROUP')) el = el.closest('select');
      return !!(el && el.getClientRects().length);
    }

    // ---------- Les textes de la page ----------
    const tany = new WeakMap();      // nœud → texte d'origine
    const vita = new WeakMap();      // nœud → texte posé par nous
    const miandry = new Set();       // textes à demander
    // Ligne par ligne : un même texte mêle souvent les langues (le titre d'un
    // billet de la Botika en malgache, sa description en anglais, l'appel en
    // malgache), et Google, à qui l'on donnait le bloc, n'en voyait qu'une.
    // Ce qui est déjà connu se pose tout de suite ; le reste est demandé.
    function apetrahoAmin(node, asili){
      const vaovao = asili.split('\n').map(function(andalana){
        const cle = andalana.trim();
        if(!mila(cle)) return andalana;
        const t = dika[cle];
        if(t == null){ miandry.add(cle); return andalana; }
        return andalana.replace(cle, t);
      }).join('\n');
      if(node.nodeValue !== vaovao){
        vita.set(node, vaovao);
        node.nodeValue = vaovao;
      }
    }
    function jereo(){
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while((node = walker.nextNode())){
        const v = node.nodeValue;
        if(!v || !v.trim()) continue;
        const parent = node.parentElement;
        if(!parent || horsJeu(parent) || !hita(parent)) continue;
        let asili = tany.get(node);
        // Un texte changé par l'application (et non par nous) est un nouvel original.
        if(asili === undefined || (v !== vita.get(node) && v !== asili)){
          asili = v;
          tany.set(node, v);
        }
        apetrahoAmin(node, asili);
      }
      // Les invites des champs (placeholder) : l'original dans data-teny-asili.
      document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function(el){
        if(horsJeu(el.parentElement) || !hita(el)) return;
        let asili = el.getAttribute('data-teny-asili');
        if(asili == null || (el.placeholder !== dika[asili] && el.placeholder !== asili)){
          asili = el.placeholder;
          el.setAttribute('data-teny-asili', asili);
        }
        const cle = asili.trim();
        if(!mila(cle)) return;
        if(dika[cle] != null){ if(el.placeholder !== dika[cle]) el.placeholder = dika[cle]; }
        else miandry.add(cle);
      });
      if(miandry.size) alefa();
    }

    // ---------- Les demandes ----------
    // translate_a/t prend plusieurs textes (un « q » chacun) et devine la
    // langue de CHACUN : un paquet mêlant « Factures » et « Hafatra
    // mivantana » est enfin traduit en entier. Avant, tout le paquet était lu
    // dans une seule langue, et l'autre moitié restait telle quelle.
    let mandeha = false, miatoTo = 0;
    function alefa(){
      if(mandeha || Date.now() < miatoTo || !miandry.size) return;
      // Un paquet de taille raisonnable pour l'adresse.
      const paquet = [];
      let habe = 0;
      for(const k of miandry){
        const lanja = encodeURIComponent(arovy(k)).length + 3;
        if(paquet.length && (paquet.length >= 50 || habe + lanja > 6000)) break;
        paquet.push(k);
        habe += lanja;
      }
      paquet.forEach(function(k){ miandry.delete(k); });
      mandeha = true;
      adikao(paquet.map(arovy)).then(function(valiny){
        paquet.forEach(function(k, i){ dika[k] = haben(k, averina(String(valiny[i] || '').trim())) || k; });
        tehirizo();
      }).then(null, function(){
        // Refusé ou hors ligne : on attend une minute avant de redemander.
        paquet.forEach(function(k){ miandry.add(k); });
        miatoTo = Date.now() + 60000;
      }).then(function(){
        mandeha = false;
        mihazakazaka();
      });
    }
    // Le nom de la maison ne se traduit pas : « Ny asako » devenait « My
    // Work ». Il part sous un mot que Google laisse tel quel, et revient.
    function arovy(t){ return t.replace(/\bny\s+asako\b/gi, 'Nyasako'); }
    function averina(t){ return t.replace(/\bnyasako\b/gi, 'Ny asako'); }
    // Les majuscules de l'original : Google rendait « Factures » par
    // « faktiora » et « Message » par « hAFATRA ».
    function haben(asili, t){
      if(!t) return t;
      const litera = t.replace(/[^\p{L}]/gu, '');
      const ambony = litera.replace(/[^\p{Lu}]/gu, '').length;
      if(litera.length > 3 && ambony > litera.length / 2 && asili !== asili.toUpperCase()) t = t.toLowerCase();
      const a = asili.match(/\p{L}/u), b = t.match(/\p{L}/u);
      if(a && b && a[0] === a[0].toUpperCase() && a[0] !== a[0].toLowerCase()){
        t = t.slice(0, b.index) + b[0].toUpperCase() + t.slice(b.index + 1);
      }
      return t;
    }
    function adikao(lisitra){
      const url = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=' + encodeURIComponent(teny) +
        lisitra.map(function(q){ return '&q=' + encodeURIComponent(q); }).join('');
      return fetch(url).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function(data){
        // [[traduction, langue détectée], …] ; un texte seul vient parfois nu.
        if(!Array.isArray(data)) return [String(data)];
        return data.map(function(x){ return Array.isArray(x) ? x[0] : x; });
      });
    }

    // ---------- Au fil de la page ----------
    let jereoTimer = null;
    function mihazakazaka(){
      if(jereoTimer) return;
      jereoTimer = setTimeout(function(){ jereoTimer = null; jereo(); }, 250);
    }
    function manomboka(){
      jereo();
      new MutationObserver(mihazakazaka).observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open']
      });
      // Ce qui s'ouvre au clic (menu, page) devient visible juste après.
      document.addEventListener('click', function(){ setTimeout(mihazakazaka, 50); }, true);
      setInterval(function(){ if(!document.hidden) jereo(); }, 3000);
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', manomboka);
    else manomboka();
  })();

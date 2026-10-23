  // ---------------- 🌐 TENY : LE SITE ENTIER DANS LA LANGUE CHOISIE ----------------
  // Le bouton « 🌐 Teny » du menu. La fenêtre de traduction du navigateur
  // n'appartient pas au site : elle devine la langue de la page et, sur un
  // site qui mêle malgache, français et anglais, se trompait (« English →
  // English »). Le traducteur tout fait de Google, lui, refusait une fois sur
  // deux (403). On traduit donc nous-mêmes, texte par texte :
  //
  //  - seuls les textes visibles partent, par paquets, et ce qui arrive plus
  //    tard (une page ouverte, un message reçu) suit au fil de l'eau ;
  //  - chaque texte garde son original : « ↩️ Tsy adika » recharge la page,
  //    qui revient telle quelle ;
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
      // Les noms des langues restent dans leur propre écriture.
      fond.className = 'notranslate';
      fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; ' +
        'justify-content:center; z-index:9600; padding:1rem;';
      const boite = document.createElement('div');
      boite.className = 'panel';
      boite.style.cssText = 'max-width:360px; width:100%; margin:0; max-height:calc(100vh - 2rem); overflow-y:auto;';
      boite.innerHTML = '<h3 style="margin-bottom:0.3rem;">🌐 Teny</h3>' +
        '<p data-soratra style="font-size:0.78rem; color:var(--muted); margin-bottom:0.8rem;">Safidio ny teny : adika ho azy ny site manontolo.</p>' +
        '<div data-lisitra style="display:flex; flex-direction:column; gap:0.4rem;"></div>';
      const lisitra = boite.querySelector('[data-lisitra]');
      TENY.concat([['', '↩️ Tsy adika (teny tany am-boalohany)']]).forEach(function(t){
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
    if(bokotra){
      bokotra.classList.add('notranslate');
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
    const CLE_CACHE = 'nyasako_teny_dika_' + teny;
    let dika = {};
    try{ dika = JSON.parse(localStorage.getItem(CLE_CACHE)) || {}; }catch(e){ dika = {}; }
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
    const SAUTE = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE|NOSCRIPT|svg|SVG|TITLE)$/;
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
    function hita(el){ return !!(el && el.getClientRects().length); }

    // La langue de départ, devinée à quelques mots courants.
    const MG = /\b(ny|ary|amin|ho|dia|tsy|izy|ireo|eto|azy|aho|ianao|mba|raha|any|ao|olona|vao|hafatra|misy|izay|efa|mbola|tsara|eny|tsia|sy|an)\b|n'ny|an'i|'ity|'ilay/gi;
    const FR = /\b(le|la|les|des|du|une|un|et|pour|vous|avec|sur|dans|pas|est|vos|votre|au|aux|ce|cette|qui|que|en|par|plus|ou)\b|\b[ldjnsc]'/gi;
    function loharano(texte){
      const mg = (texte.match(MG) || []).length, fr = (texte.match(FR) || []).length;
      if(mg > fr) return 'mg';
      if(fr > mg) return 'fr';
      return 'auto';
    }

    // ---------- Les textes de la page ----------
    const tany = new WeakMap();      // nœud → texte d'origine
    const vita = new WeakMap();      // nœud → texte posé par nous
    const miandry = new Set();       // textes à demander
    function apetrahoAmin(node, asili){
      const cle = asili.trim();
      const t = dika[cle];
      if(t == null) return;
      const vaovao = asili.replace(cle, t);
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
        const cle = asili.trim();
        if(!mila(cle)) continue;
        if(dika[cle] != null) apetrahoAmin(node, asili);
        else miandry.add(cle);
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
    let mandeha = false, miatoTo = 0;
    function alefa(){
      if(mandeha || Date.now() < miatoTo || !miandry.size) return;
      // Un paquet de même langue de départ, de taille raisonnable pour l'adresse.
      const voalohany = miandry.values().next().value;
      const sl = loharano(voalohany);
      const paquet = [];
      let habe = 0;
      miandry.forEach(function(k){
        if(paquet.length >= 40 || habe > 1400) return;
        if(loharano(k) !== sl) return;
        paquet.push(k);
        habe += k.length + 1;
      });
      paquet.forEach(function(k){ miandry.delete(k); });
      // Déjà dans la langue voulue : gardé tel quel.
      if(sl === teny.split('-')[0]){
        paquet.forEach(function(k){ dika[k] = k; });
        tehirizo();
        mihazakazaka();
        return;
      }
      mandeha = true;
      // Les retours à la ligne séparent les textes du paquet.
      const lahatsoratra = paquet.map(function(k){ return arovy(k.replace(/\s*\n\s*/g, ' ')); }).join('\n');
      adikao(lahatsoratra, sl).then(function(valiny){
        const lisitra = valiny.split('\n');
        if(lisitra.length === paquet.length){
          paquet.forEach(function(k, i){ dika[k] = averina(lisitra[i].trim()) || k; });
          tehirizo();
          return;
        }
        // Désaligné (une phrase coupée en deux) : on redemande un par un.
        return paquet.reduce(function(p, k){
          return p.then(function(){
            return adikao(arovy(k), sl).then(function(t){ dika[k] = averina(t.trim()) || k; });
          });
        }, Promise.resolve()).then(tehirizo);
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
    function adikao(lahatsoratra, sl){
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' +
        encodeURIComponent(sl) + '&tl=' + encodeURIComponent(teny) + '&q=' + encodeURIComponent(lahatsoratra);
      return fetch(url).then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function(data){
        return ((data && data[0]) || []).map(function(s){ return (s && s[0]) || ''; }).join('');
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

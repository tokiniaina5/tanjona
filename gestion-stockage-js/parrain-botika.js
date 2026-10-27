  // ---------------- BINANCE, PAYONEER ET LES AUTRES DANS LA BOTIKA ----------------
  // Les liens de parrainage de l'admin (rohy_parrainage, fonction
  // parrainage_admin), montrés à tous : dans l'Accueil de l'appli et dans
  // botika/. C'est la plateforme qui paie l'admin, pas le client.
  // Un lien s'ouvre ; un code seul se copie.
  (function(){
    // « defaut » : la page d'inscription de la plateforme, tant que l'admin
    // n'a pas mis son lien — toutes se voient d'office (26/10/2026).
    const PLATEFORMES = [
      { cle: 'binance', nom: 'Binance', ikona: '🟡', couleur: '#f0b90b', defaut: 'https://accounts.binance.com/register' },
      { cle: 'payoneer', nom: 'Payoneer', ikona: '🟠', couleur: '#ff4800', defaut: 'https://www.payoneer.com/' }
    ];
    // Les mêmes que la liste de « Sehatra hafa » (ny-asako.html) ; un lien de
    // l'admin au même nom (colonne « hafa ») prend la place de la page.
    const HAFA_DEFAUT = [
      { nom: 'Bybit', defaut: 'https://www.bybit.com/register' },
      { nom: 'OKX', defaut: 'https://www.okx.com/join' },
      { nom: 'KuCoin', defaut: 'https://www.kucoin.com/' },
      { nom: 'Bitget', defaut: 'https://www.bitget.com/register' },
      { nom: 'RedotPay', defaut: 'https://www.redotpay.com/' },
      { nom: 'Wise', defaut: 'https://wise.com/register' },
      { nom: 'Skrill', defaut: 'https://www.skrill.com/' },
      { nom: 'Airtm', defaut: 'https://www.airtm.com/' },
      { nom: 'Exness', defaut: 'https://www.exness.com/' },
      { nom: 'Deriv', defaut: 'https://deriv.com/' },
      // Les jeux (18 ans et plus). « Lalao Malagasy (Loterie) » n'a pas de
      // site connu : il ne se montre qu'avec le lien de l'admin.
      { nom: 'Bet261', defaut: 'https://www.bet261.mg/' },
      { nom: 'Aviator', defaut: 'https://spribe.co/games/aviator' },
      { nom: '1xBet', defaut: 'https://1xbet.com/' },
      { nom: 'Melbet', defaut: 'https://melbet.com/' }
    ];

    // Le logo d'une plateforme : son icône, servie par Google à partir du
    // domaine (celui de la page d'office, sinon celui du lien). Pas de
    // domaine, ou icône introuvable : l'initiale sur la couleur.
    function domaineDe(p, valeur){
      const url = /^https?:\/\//i.test(valeur) ? valeur : (p.defaut || '');
      const m = url.match(/^https?:\/\/(?:[a-z0-9-]+\.)*?([a-z0-9-]+\.[a-z]{2,})(?:[/:?#]|$)/i);
      return m ? m[1].toLowerCase() : '';
    }

    // Une tuile : le logo en carré, le nom dessous ; le lien s'ouvre, un
    // code seul se copie.
    function bouton(p, valeur){
      const estLien = /^https?:\/\//i.test(valeur);
      const el = document.createElement(estLien ? 'a' : 'button');
      el.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:0.35rem; width:4.6rem; ' +
        'text-decoration:none; color:inherit; background:none; border:0; padding:0; font:inherit; cursor:pointer;';
      const carre = document.createElement('span');
      carre.style.cssText = 'display:flex; align-items:center; justify-content:center; width:3.4rem; height:3.4rem; ' +
        'border-radius:16px; background:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.25); overflow:hidden; ' +
        'border:2px solid ' + p.couleur + ';';
      const initiale = function(){
        carre.textContent = p.nom.charAt(0).toUpperCase();
        carre.style.background = p.couleur;
        carre.style.color = '#fff';
        carre.style.fontWeight = '700';
        carre.style.fontSize = '1.4rem';
      };
      const domaine = domaineDe(p, valeur);
      if(domaine){
        const img = document.createElement('img');
        img.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domaine) + '&sz=128';
        img.alt = p.nom;
        img.width = 40; img.height = 40;
        img.loading = 'lazy';
        img.style.cssText = 'width:2.5rem; height:2.5rem; object-fit:contain;';
        img.addEventListener('error', function(){ carre.innerHTML = ''; initiale(); });
        carre.appendChild(img);
      } else {
        initiale();
      }
      const nom = document.createElement('span');
      nom.style.cssText = 'font-size:0.72rem; font-weight:600; max-width:4.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      nom.textContent = p.nom;
      el.appendChild(carre);
      el.appendChild(nom);
      if(estLien){
        el.href = valeur;
        el.target = '_blank';
        el.rel = 'noopener';
        el.title = 'Hisoratra amin\'ny ' + p.nom;
      } else {
        el.type = 'button';
        el.title = 'Code ' + p.nom + ' : ' + valeur + ' — tsindrio raha hadika';
        el.addEventListener('click', function(){
          if(!(navigator.clipboard && navigator.clipboard.writeText)) return;
          navigator.clipboard.writeText(valeur).then(function(){
            nom.textContent = '✅ Voadika';
            setTimeout(function(){ nom.textContent = p.nom; }, 1500);
          }, function(){});
        });
      }
      return el;
    }

    // La Botika, et « Inviter des amis » pour qui n'a pas encore de compte
    // Binance / Payoneer — sauf l'admin, ce sont ses propres liens.
    const CADRES = [
      { cadre: 'botikaParrain', rangee: 'botikaParrainBoutons' },
      { cadre: 'parrainAdmin', rangee: 'parrainAdminBoutons', pasAdmin: true }
    ];

    function afficher(){
      const presents = CADRES.filter(function(c){
        return document.getElementById(c.cadre) && document.getElementById(c.rangee);
      });
      if(!presents.length) return;
      // Serveur muet : les pages d'inscription quand même.
      if(!window.__sb || !window.__sb.rpc){ rendre(presents, {}); return; }
      window.__sb.rpc('parrainage_admin').then(function(res){
        rendre(presents, (res && !res.error && res.data && res.data[0]) || {});
      }, function(){ rendre(presents, {}); });
    }

    // La liste : Binance, Payoneer, puis les autres — la liste d'office, puis
    // celles que l'admin a ajoutées sous un autre nom (colonne « hafa »).
    // Les tuiles en sortent, et le message d'invitation aussi (inviter.js).
    function lisitra(d){
      const tout = [];
      PLATEFORMES.forEach(function(p){
        const valeur = String(d[p.cle] || '').trim() || p.defaut;
        if(valeur) tout.push({ p: p, valeur: valeur });
      });
      const liensAdmin = {};
      (Array.isArray(d.hafa) ? d.hafa : []).forEach(function(h){
        const valeur = String((h && h.rohy) || '').trim();
        if(h && h.nom && valeur) liensAdmin[String(h.nom).toLowerCase()] = { nom: String(h.nom), rohy: valeur };
      });
      HAFA_DEFAUT.forEach(function(h){
        const cle = h.nom.toLowerCase();
        const lienAdmin = liensAdmin[cle];
        delete liensAdmin[cle];
        tout.push({ p: { nom: h.nom, ikona: '🔗', couleur: 'var(--cyan)', court: true }, valeur: lienAdmin ? lienAdmin.rohy : h.defaut });
      });
      Object.keys(liensAdmin).forEach(function(cle){
        tout.push({ p: { nom: liensAdmin[cle].nom, ikona: '🔗', couleur: 'var(--cyan)', court: true }, valeur: liensAdmin[cle].rohy });
      });
      return tout;
    }
    // Les tuiles d'une rangée.
    function remplir(rangee, d){
      lisitra(d).forEach(function(x){ rangee.appendChild(bouton(x.p, x.valeur)); });
    }
    // Pour le message d'invitation : le nom et le lien (ou le code) de chaque
    // plateforme, tels que la Botika les montre.
    window.__lisitraParrain = function(){
      return lisitra(dernierD).map(function(x){ return { nom: x.p.nom, rohy: x.valeur }; });
    };

    let dernierD = {};
    function rendre(presents, d){
      dernierD = d;
      const admin = typeof estAdminRohy === 'function' && estAdminRohy();
      presents.forEach(function(c){
        const cadre = document.getElementById(c.cadre);
        const rangee = document.getElementById(c.rangee);
        rangee.innerHTML = '';
        // Une grille : les tuiles également espacées, en lignes et en
        // colonnes, quelle que soit la largeur.
        rangee.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(5rem, 1fr)); ' +
          'gap:1.1rem 0.6rem; justify-items:center; padding:0.4rem 0 0.2rem;';
        if(!(c.pasAdmin && admin)) remplir(rangee, d);
        // La Botika ne le montre qu'un jour à chacun ; « Inviter des amis » toujours.
        const fini = c.cadre === 'botikaParrain' && vuDepuisUnJour();
        cadre.style.display = (rangee.children.length && !fini) ? '' : 'none';
        if(c.cadre === 'botikaParrain' && !fini && rangee.children.length) marquerVu();
      });
      parrainDansLeFil();
    }

    // Vingt-quatre heures à partir de la première fois qu'il paraît, sur cet
    // appareil ; puis il s'en va de la Botika. Sans stockage, il reste.
    const CLE_VU = 'nyasako_parrain_botika_vu';
    const UN_JOUR = 24 * 60 * 60 * 1000;
    function marquerVu(){
      try{ if(!localStorage.getItem(CLE_VU)) localStorage.setItem(CLE_VU, String(Date.now())); }catch(e){}
    }
    function vuDepuisUnJour(){
      try{
        const t = +localStorage.getItem(CLE_VU);
        return !!t && Date.now() - t > UN_JOUR;
      }catch(e){ return false; }
    }

    // Dans l'Accueil, le cadre ne reste plus en tête : une copie se glisse
    // après toutes les FIL_PAS publications du fil, comme une publication de
    // plus. Le cadre d'origine (les id que lit rendre()) reste caché et sert
    // de modèle ; fil vide, c'est lui qui se montre, en tête comme avant.
    const FIL_PAS = 4;
    function parrainDansLeFil(){
      const modele = document.getElementById('botikaParrain');
      const fil = document.getElementById('communityNewsList');
      if(!modele || !fil) return;
      [].slice.call(fil.querySelectorAll('.fil-parrain')).forEach(function(el){ el.remove(); });
      const posts = [].slice.call(fil.querySelectorAll(':scope > .fb-post'));
      const plein = document.getElementById('botikaParrainBoutons').children.length > 0;
      if(!plein) return;
      if(vuDepuisUnJour()){ modele.style.display = 'none'; return; }
      marquerVu();
      if(!posts.length){ modele.style.display = ''; return; }
      modele.style.display = 'none';
      posts.forEach(function(post, i){
        // après la 4e, la 8e… ; un fil plus court l'a quand même, à la fin
        const dernier = i === posts.length - 1;
        if((i + 1) % FIL_PAS !== 0 && !(dernier && posts.length < FIL_PAS)) return;
        // les tuiles refaites, pas clonées : un code à copier garde son clic
        const copie = modele.cloneNode(true);
        copie.removeAttribute('id');
        copie.querySelectorAll('[id]').forEach(function(el){ el.removeAttribute('id'); });
        const rangee = copie.lastElementChild;
        rangee.innerHTML = '';
        remplir(rangee, dernierD);
        copie.classList.add('fil-parrain');
        copie.style.display = '';
        copie.style.margin = '0.8rem 0';
        post.after(copie);
      });
    }
    window.__parrainDansLeFil = parrainDansLeFil;

    window.__afficherParrainBotika = afficher;
    afficher();
  })();

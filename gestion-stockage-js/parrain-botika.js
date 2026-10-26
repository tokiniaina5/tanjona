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
      { nom: 'Deriv', defaut: 'https://deriv.com/' }
    ];

    function bouton(p, valeur){
      const estLien = /^https?:\/\//i.test(valeur);
      const el = document.createElement(estLien ? 'a' : 'button');
      el.className = 'btn btn-sm';
      el.style.cssText = 'width:auto; text-decoration:none; border-color:' + p.couleur + ';';
      if(estLien){
        el.href = valeur;
        el.target = '_blank';
        el.rel = 'noopener';
        // Les « autres » : le nom seul, sinon la rangée n'en finit plus.
        el.textContent = p.court ? p.ikona + ' ' + p.nom : p.ikona + ' Hisoratra amin\'ny ' + p.nom;
        el.title = 'Hisoratra amin\'ny ' + p.nom;
      } else {
        el.type = 'button';
        el.textContent = p.ikona + ' Code ' + p.nom + ' : ' + valeur;
        el.title = 'Tsindrio raha hadika';
        el.addEventListener('click', function(){
          const texte = el.textContent;
          const fini = function(){
            el.textContent = '✅ Voadika';
            setTimeout(function(){ el.textContent = texte; }, 1500);
          };
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(valeur).then(fini, function(){});
          }
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

    function rendre(presents, d){
      const admin = typeof estAdminRohy === 'function' && estAdminRohy();
      presents.forEach(function(c){
        const cadre = document.getElementById(c.cadre);
        const rangee = document.getElementById(c.rangee);
        rangee.innerHTML = '';
        if(!(c.pasAdmin && admin)){
          PLATEFORMES.forEach(function(p){
            const valeur = String(d[p.cle] || '').trim() || p.defaut;
            if(valeur) rangee.appendChild(bouton(p, valeur));
          });
          // Les autres : la liste d'office, puis celles que l'admin a
          // ajoutées sous un autre nom (colonne « hafa »).
          const liensAdmin = {};
          (Array.isArray(d.hafa) ? d.hafa : []).forEach(function(h){
            const valeur = String((h && h.rohy) || '').trim();
            if(h && h.nom && valeur) liensAdmin[String(h.nom).toLowerCase()] = { nom: String(h.nom), rohy: valeur };
          });
          HAFA_DEFAUT.forEach(function(h){
            const cle = h.nom.toLowerCase();
            const lienAdmin = liensAdmin[cle];
            delete liensAdmin[cle];
            rangee.appendChild(bouton({ nom: h.nom, ikona: '🔗', couleur: 'var(--cyan)', court: true }, lienAdmin ? lienAdmin.rohy : h.defaut));
          });
          Object.keys(liensAdmin).forEach(function(cle){
            rangee.appendChild(bouton({ nom: liensAdmin[cle].nom, ikona: '🔗', couleur: 'var(--cyan)', court: true }, liensAdmin[cle].rohy));
          });
        }
        cadre.style.display = rangee.children.length ? '' : 'none';
      });
    }

    window.__afficherParrainBotika = afficher;
    afficher();
  })();

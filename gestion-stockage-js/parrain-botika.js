  // ---------------- BINANCE ET PAYONEER DANS LA BOTIKA ----------------
  // Les liens de parrainage de l'admin (rohy_parrainage, fonction
  // parrainage_admin), montrés à tous : dans l'Accueil de l'appli et dans
  // botika/. C'est la plateforme qui paie l'admin, pas le client. Rien à
  // montrer, ou fonction absente : le cadre reste caché.
  // Un lien s'ouvre ; un code seul se copie.
  (function(){
    const PLATEFORMES = [
      { cle: 'binance', nom: 'Binance', ikona: '🟡', couleur: '#f0b90b' },
      { cle: 'payoneer', nom: 'Payoneer', ikona: '🟠', couleur: '#ff4800' }
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
        el.textContent = p.ikona + ' Hisoratra amin\'ny ' + p.nom;
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
      if(!presents.length || !window.__sb || !window.__sb.rpc) return;
      window.__sb.rpc('parrainage_admin').then(function(res){
        const d = (res && !res.error && res.data && res.data[0]) || {};
        const admin = typeof estAdminRohy === 'function' && estAdminRohy();
        presents.forEach(function(c){
          const cadre = document.getElementById(c.cadre);
          const rangee = document.getElementById(c.rangee);
          rangee.innerHTML = '';
          if(!(c.pasAdmin && admin)){
            PLATEFORMES.forEach(function(p){
              const valeur = String(d[p.cle] || '').trim();
              if(valeur) rangee.appendChild(bouton(p, valeur));
            });
            // Les autres plateformes choisies par l'admin (colonne « hafa »).
            (Array.isArray(d.hafa) ? d.hafa : []).forEach(function(h){
              const valeur = String((h && h.rohy) || '').trim();
              if(h && h.nom && valeur){
                rangee.appendChild(bouton({ nom: String(h.nom), ikona: '🔗', couleur: 'var(--cyan)' }, valeur));
              }
            });
          }
          cadre.style.display = rangee.children.length ? '' : 'none';
        });
      }, function(){});
    }

    window.__afficherParrainBotika = afficher;
    afficher();
  })();

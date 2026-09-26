// La validation d'un fokontany, et le lien pour installer son application.
//
// La même page sert à deux endroits : dans Ny asako (menu « 📲 Télécharger
// Fokontany ») et dans l'Administratif Commun, qui surplombe les fokontany.
// Elle vit donc ici, et non dans l'un des deux — deux copies finiraient par
// ne plus se ressembler.
//
// Ce qu'elle fait : la porte du Fokontany telle quelle (la lettre, la demande
// par email, le code), la liste de toutes les demandes, celle des
// installations déjà faites, et le lien à ouvrir dans Chrome. Elle attend de
// la page qui la charge : « currentUser » (le compte ouvert) et « window.__sb ».

(function () {
  const echap = function (t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };

  // L'adresse à ouvrir dans Chrome, dans une petite fenêtre et non une alerte :
  // le texte d'une alerte ne se sélectionne pas, le lien ne se copiait pas.
  // Un champ qu'on peut sélectionner, et un bouton qui copie.
  window.__montrerAdresseAInstaller = function(adresse){
    const ancien = document.getElementById('fenetreAdresseInstall');
    if(ancien) ancien.remove();
    const fond = document.createElement('div');
    fond.id = 'fenetreAdresseInstall';
    fond.setAttribute('role', 'dialog');
    fond.style.cssText = 'position:fixed; inset:0; z-index:9500; background:rgba(4,8,10,0.6); display:flex; ' +
      'align-items:center; justify-content:center; padding:16px;';
    fond.innerHTML =
      '<div style="width:min(440px, 100%); background:var(--panel); color:var(--text); border:1px solid var(--line); ' +
        'border-radius:14px; padding:1.1rem 1.1rem 1rem; box-shadow:0 12px 40px rgba(0,0,0,0.45); font-size:0.88rem; line-height:1.55;">' +
        '<p style="margin:0 0 0.7rem;">Tsy azo apetraka avy ato anaty app Ny asako ity app ity.</p>' +
        '<p style="margin:0 0 0.5rem;">Sokafy ao amin\'ny <strong>Chrome</strong> (na Edge) ity rohy ity :</p>' +
        '<input type="text" readonly data-adresse style="width:100%; box-sizing:border-box; padding:0.6rem 0.7rem; ' +
          'border-radius:8px; border:1px solid var(--cyan); background:var(--bg); color:var(--text); font-family:var(--font-mono); font-size:0.82rem;">' +
        '<div style="display:flex; gap:0.5rem; margin-top:0.6rem;">' +
          '<button type="button" class="btn btn-primary btn-sm" data-adikao style="flex:1;">📋 Adikao ny rohy</button>' +
          '<button type="button" class="btn btn-sm" data-hidio style="width:auto;">OK</button>' +
        '</div>' +
        '<p data-statut style="margin:0.5rem 0 0; font-size:0.78rem; color:var(--cyan); min-height:1.1em;"></p>' +
        '<p style="margin:0.3rem 0 0; color:var(--muted); font-size:0.8rem;">Midira amin\'ny kaontinao, dia tsindrio « 📲 Installer ».</p>' +
      '</div>';
    document.body.appendChild(fond);
    const champ = fond.querySelector('[data-adresse]');
    const statut = fond.querySelector('[data-statut]');
    champ.value = adresse;
    champ.addEventListener('focus', function(){ champ.select(); });
    champ.focus();
    function fermer(){ fond.remove(); }
    fond.querySelector('[data-hidio]').addEventListener('click', fermer);
    fond.addEventListener('click', function(e){ if(e.target === fond) fermer(); });
    fond.querySelector('[data-adikao]').addEventListener('click', function(){
      champ.select();
      const reussi = function(){ statut.textContent = '✓ Voadika : apetaho ao amin\'ny barre d\'adresse an\'ny Chrome.'; };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(adresse).then(reussi, function(){
          try { if(document.execCommand('copy')) { reussi(); return; } } catch(e){}
          statut.textContent = 'Safidio ilay rohy (efa voafantina) dia Ctrl+C.';
        });
      } else {
        try { if(document.execCommand('copy')) { reussi(); return; } } catch(e){}
        statut.textContent = 'Safidio ilay rohy (efa voafantina) dia Ctrl+C.';
      }
    });
  }

  // Les deux applications s'installent depuis leur propre page, où le
  // propriétaire connecté trouve « 📲 Installer ». Dans un onglet, un nouvel
  // onglet suffit. Mais depuis Ny asako INSTALLÉE, la page s'ouvrait dans
  // une fenêtre de Ny asako (même site, son icône « N », titre « Ny asako -
  // Fokontany ») — où le navigateur ne propose jamais d'installer une autre
  // application. L'adresse doit alors être ouverte dans Chrome : on la copie
  // et on le dit.
  //
  // Le Fokontany s'installe pour un fokontany précis : sa validation vient
  // d'abord (validerAvantInstall, une page comme la porte), le lien ensuite.
  // Le Commun passe par la même page (« karazana » = 'commun') : la même
  // lettre sans le fokontany, le même code, puis son lien.
  window.__versLInstallation = function(chemin, suffixe){
    const adresse = chemin + (suffixe || '');
    let installee = false;
    try { installee = !window.matchMedia('(display-mode: browser)').matches || window.navigator.standalone === true; } catch(e){}
    if(!installee){ window.open(adresse, '_blank'); return; }
    window.__montrerAdresseAInstaller(location.origin + adresse);
  }
  // Cette page sert aux deux endroits : dans Ny asako et dans
  // l'Administratif Commun, qui l'ouvre depuis sa propre fenêtre. Elle porte
  // donc le nom de celui qui l'a ouverte — le Commun se reconnaît à la
  // classe posée par son en-tête (fokontany/index.html).
  const MARQUE = document.documentElement.classList.contains('app-commun')
    ? '🏛️ Administratif <span>Commun</span>'
    : '🗂️ Administratif <span>Fokontany</span>';
  window.__validerAvantInstall = function(ensuite, karazana){
    const sb = window.__sb;
    const pourCommun = karazana === 'commun';
    const marque = pourCommun ? '🏛️ Administratif <span>Commun</span>' : MARQUE;
    const ANY = pourCommun ? 'commun' : 'fokontany';
    const ancien = document.getElementById('pageValidationInstall');
    if(ancien) ancien.remove();
    const u = currentUser || {};
    const page = document.createElement('div');
    page.id = 'pageValidationInstall';
    page.setAttribute('role', 'dialog');
    page.style.cssText = 'position:fixed; inset:0; z-index:9500; background:var(--bg); color:var(--text); overflow-y:auto;';
    page.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; ' +
        'padding:0.9rem 1rem; border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0;">' +
        '<div class="brand">' + marque + '</div>' +
        '<div style="display:flex; align-items:center; gap:0.8rem;">' +
          '<div style="font-size:0.76rem; color:var(--muted); text-align:right; line-height:1.4;">' +
            '<strong data-nom style="color:var(--text); display:block; font-size:0.84rem;"></strong><span data-email></span></div>' +
          '<button type="button" class="btn btn-sm" data-hidio style="width:auto;">Hanafoana</button>' +
        '</div>' +
      '</div>' +
      '<div style="max-width:1200px; margin:0 auto; padding:1.2rem 16px 3rem;">' +
        '<div class="panel">' +
          '<h3>🔐 Mila alalana ity pejy ity</h3>' +
          // Le texte, la demande et leurs mots : ceux de la porte du Fokontany
          // (index.html, #communPorte), tels quels.
          '<p style="font-size:0.78rem; color:var(--muted); line-height:1.6; margin-bottom:0.9rem;">' +
            'Angataho amin\'ny tompon\'ny site ny fanokafana. Halefany amin\'ny mailakao ny ' +
            '<strong style="color:var(--text);">code</strong> sy ny rohy. Rehefa voasoratra ilay code ' +
            'dia mahazo fampahafantarana izy, ary misokatra ny pejy rehefa nohamafisiny. ' +
            'Indray mandeha ihany no ilana ny code : aorian\'izay dia ny fidiranao amin\'ny kaontinao ' +
            'no manokatra azy, na eo amin\'ny appareil hafa aza.' +
          '</p>' +
          // La demande est une lettre, sur papier blanc : ce qu'on écrit là
          // part tel quel au propriétaire. Tout y est obligatoire — un
          // fokontany se reconnaît à son nom, son email et la fonction de
          // celui qui demande.
          '<div data-taratasy style="background:#ffffff; color:#12181d; border-radius:12px; padding:1rem 1.1rem; margin-bottom:0.9rem;">' +
            '<p style="margin:0 0 0.9rem; font-size:0.86rem; line-height:1.6; color:#12181d;">' +
              'Ireto tompoko ny mombamomba ahy, ary ekeo ny fangatahako ilay <strong>code</strong> :</p>' +
            '<div class="form-grid">' +
              '<div class="field"><label for="pvAnarana" style="color:#3d4b53;">Anarana *</label>' +
                '<input type="text" id="pvAnarana" data-f-anarana placeholder="RAKOTO" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;"></div>' +
              '<div class="field"><label for="pvFanampiny" style="color:#3d4b53;">Fanampin\'anarana (prénom) *</label>' +
                '<input type="text" id="pvFanampiny" data-f-prenom placeholder="Jean" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;"></div>' +
              '<div class="field"' + (pourCommun ? ' style="display:none;"' : '') + '><label for="pvFokontany" style="color:#3d4b53;">Anaran\'ny fokontany *</label>' +
                '<input type="text" id="pvFokontany" data-f-fokontany list="pvFokontanyListe" placeholder="Ambohimanarina" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;">' +
                '<datalist id="pvFokontanyListe" data-liste-fokontany></datalist></div>' +
              '<div class="field"><label for="pvCommun" style="color:#3d4b53;">Anaran\'ny commun *</label>' +
                '<input type="text" id="pvCommun" data-f-commun list="pvCommunListe" placeholder="Antananarivo" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;">' +
                '<datalist id="pvCommunListe" data-liste-commun></datalist>' +
                '<span data-commun-auto style="display:none; font-size:0.72rem; color:#2a7f62; margin-top:0.25rem;">Feno ho azy : avy amin\'ny listra.</span></div>' +
              '<div class="field"><label for="pvMail" style="color:#3d4b53;">Email hanokafana ny site *</label>' +
                '<input type="email" id="pvMail" data-f-email placeholder="' + ANY + '@exemple.com" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;"></div>' +
              '<div class="field"><label for="pvAsa" style="color:#3d4b53;">Asa eo anivon\'ny ' + ANY + ' *</label>' +
                '<input type="text" id="pvAsa" data-f-asa placeholder="Ohatra : sekretera" autocomplete="off" style="background:#f3f6f8; color:#12181d; border-color:#c9d4da;"></div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-sm" data-mangataka style="width:auto;">📩 Mangataka fanokafana</button>' +
          '<p data-mangataka-statut style="font-size:0.76rem; color:var(--muted); margin:0.7rem 0 0.9rem; min-height:1.1em;"></p>' +
          '<div class="field">' +
            '<label for="pvCode">Code nomen\'ny tompon\'ny site</label>' +
            '<input type="text" id="pvCode" data-code placeholder="Litera 8" autocomplete="off" maxlength="12" ' +
              'style="font-family:var(--font-mono); letter-spacing:0.2em; text-transform:uppercase;">' +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-sm" data-sokafy style="width:auto;">🔓 Sokafy ny pejy</button>' +
          '<p data-statut style="font-size:0.78rem; margin-top:0.7rem; min-height:1.1em;"></p>' +
        '</div>' +
        // Ce qui est déjà installé : l'admin passe de fokontany en fokontany,
        // et sans cette liste il ne sait plus lequel est fait.
        '<div class="panel">' +
          '<h3>📲 Installation vita</h3>' +
          '<div class="table-scroll"><table>' +
            '<thead><tr><th>Daty</th><th>Fokontany</th><th>Email</th><th>App</th></tr></thead>' +
            '<tbody data-installes></tbody>' +
          '</table></div>' +
          '<p class="empty-hint" data-installes-vide style="display:none;">Mbola tsy misy installation vita.</p>' +
        '</div>' +
        // Toutes les demandes, ici même : on valide d'un bouton, sans aller
        // chercher le code dans l'onglet Fangatahana.
        '<div class="panel">' +
          '<h3>🛡️ Fangatahana rehetra</h3>' +
          '<div class="table-scroll"><table>' +
            '<thead><tr><th>Daty</th><th>Olona</th><th>Hafatra</th><th>Code</th><th>Toe-javatra</th><th></th></tr></thead>' +
            '<tbody data-liste></tbody>' +
          '</table></div>' +
          '<p class="empty-hint" data-vide style="display:none;">Mbola tsy misy fangatahana.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(page);
    page.querySelector('[data-nom]').textContent = u.name || '';
    page.querySelector('[data-email]').textContent = u.email || '';
    const champ = page.querySelector('[data-code]');
    const statut = page.querySelector('[data-statut]');
    const dire = function(texte, erreur){ statut.textContent = texte; statut.style.color = erreur ? 'var(--red)' : 'var(--cyan)'; };
    const fermer = function(){ page.remove(); };
    page.querySelector('[data-hidio]').addEventListener('click', fermer);
    champ.focus();
    champ.addEventListener('keydown', function(e){ if(e.key === 'Enter') page.querySelector('[data-sokafy]').click(); });

    // Les demandes (commun_fangatahana) et leur code (commun_alalana), réunies
    // par l'email. L'admin lit les deux tables en entier.
    const echap = function(t){ const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    function chargerLesDemandes(){
      const liste = page.querySelector('[data-liste]');
      const vide = page.querySelector('[data-vide]');
      if(!sb){ vide.style.display = ''; return; }
      Promise.all([
        sb.from('commun_fangatahana').select('*').order('created_at', { ascending: false }),
        sb.from('commun_alalana').select('*')
      ]).then(function(r){
        const demandes = (r[0] && !r[0].error && r[0].data) || [];
        const acces = (r[1] && !r[1].error && r[1].data) || [];
        const cle = function(e){ return String(e || '').trim().toLowerCase(); };
        // Un accès sans demande (code donné à la main) compte aussi.
        const lignes = demandes.map(function(f){
          return { f: f, a: acces.filter(function(a){ return cle(a.email) === cle(f.email); })[0] || null };
        });
        acces.forEach(function(a){
          if(!demandes.some(function(f){ return cle(f.email) === cle(a.email); })) lignes.push({ f: null, a: a });
        });
        liste.innerHTML = '';
        lignes.forEach(function(l){
          const f = l.f || {}, a = l.a;
          const email = f.email || (a && a.email) || '';
          const nom = f.anarana || (a && a.anarana) || '—';
          const etat = !a ? 'Tsy mbola nomena code'
            : (!a.active ? 'Nesorina' : (a.voamarina ? 'Misokatra' : (f.statut === 'lavina' ? 'Nolavina' : 'Miandry')));
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td style="white-space:nowrap;">' + (f.created_at ? new Date(f.created_at).toLocaleDateString('fr-FR') : '—') + '</td>' +
            '<td>' + echap(nom) + '<div style="color:var(--muted); font-size:0.75rem;">' + echap(email) + '</div></td>' +
            '<td style="color:var(--muted);">' + echap(f.hafatra || '—') + '</td>' +
            '<td style="font-family:var(--font-mono); letter-spacing:0.1em; white-space:nowrap;">' + echap(a ? a.code : '—') + '</td>' +
            '<td style="white-space:nowrap;">' + echap(etat) + '</td>' +
            '<td></td>';
          if(a && a.active){
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-primary btn-sm';
            b.style.width = 'auto';
            b.textContent = a.voamarina ? '📲 Rohy' : '🔓 Sokafy';
            b.addEventListener('click', function(){ champ.value = a.code; page.querySelector('[data-sokafy]').click(); });
            tr.lastChild.appendChild(b);
          }
          liste.appendChild(tr);
        });
        vide.style.display = lignes.length ? 'none' : '';
      }, function(){ vide.style.display = ''; });
    }
    chargerLesDemandes();

    // Les installations déjà faites : la liste que l'admin regarde, et la
    // garde contre le doublon — même email, ou même nom de fokontany.
    let installes = [];
    function nomDuFokontany(texte) {
      const m = String(texte || '').match(/Fokontany\s+([^\/(—]+)/i);
      return m ? m[1].trim().toLowerCase() : '';
    }
    function chargerLesInstallations() {
      const corps = page.querySelector('[data-installes]');
      const vide = page.querySelector('[data-installes-vide]');
      if (!sb) { vide.style.display = ''; return Promise.resolve(); }
      return sb.from('fokontany_installation').select('*').order('created_at', { ascending: false })
        .then(function (res) {
          installes = (res && !res.error && res.data) || [];
          corps.innerHTML = installes.map(function (i) {
            return '<tr>' +
              '<td style="white-space:nowrap;">' + (i.created_at ? new Date(i.created_at).toLocaleDateString('fr-FR') : '—') + '</td>' +
              '<td>' + echap(i.fokontany || '—') + '</td>' +
              '<td style="color:var(--muted);">' + echap(i.email) + '</td>' +
              '<td>' + (i.karazana === 'commun' ? '🏛️ Commun' : '🗂️ Fokontany') + '</td>' +
            '</tr>';
          }).join('');
          vide.style.display = installes.length ? 'none' : '';
          poserLesListes();
        }, function () { vide.style.display = ''; });
    }

    // Ce qui est déjà installé sert de liste : l'admin ne réécrit pas ce
    // qu'il a déjà écrit, et le commun d'un fokontany connu se pose tout
    // seul — un même fokontany ne relève pas de deux communs.
    function options(valeurs){
      const vus = {};
      return valeurs.filter(function(x){
        const c = String(x || '').trim(); if(!c) return false;
        const k = c.toLowerCase(); if(vus[k]) return false; vus[k] = 1; return true;
      }).sort().map(function(x){ return '<option value="' + echap(x) + '"></option>'; }).join('');
    }
    function poserLesListes(){
      const lf = page.querySelector('[data-liste-fokontany]');
      const lc = page.querySelector('[data-liste-commun]');
      if(lf) lf.innerHTML = options(installes.map(function(i){ return i.fokontany; }));
      if(lc) lc.innerHTML = options(installes.map(function(i){ return i.commun; }));
    }
    // Le commun de ce fokontany, tel qu'il a été inscrit la première fois.
    function communDe(nom){
      const c = String(nom || '').trim().toLowerCase();
      if(!c) return '';
      const trouve = installes.filter(function(i){
        return String(i.fokontany || '').trim().toLowerCase() === c && String(i.commun || '').trim();
      })[0];
      return trouve ? String(trouve.commun).trim() : '';
    }
    (function(){
      const champF = page.querySelector('[data-f-fokontany]');
      const champC = page.querySelector('[data-f-commun]');
      const avis = page.querySelector('[data-commun-auto]');
      if(!champF || !champC) return;
      // Le commun d'un fokontany connu l'emporte sur ce qu'on tape : un
      // fokontany ne relève que d'un commun. La marque « auto » ne sert qu'à
      // effacer ce qu'on a posé quand le nom redevient inconnu.
      champC.addEventListener('input', function(){ champC.dataset.auto = ''; avis.style.display = 'none'; });
      champF.addEventListener('input', function(){
        const trouve = communDe(champF.value);
        if(trouve){ champC.value = trouve; champC.dataset.auto = '1'; avis.style.display = ''; return; }
        if(champC.dataset.auto){ champC.value = ''; champC.dataset.auto = ''; }
        avis.style.display = 'none';
      });
    })();
    chargerLesInstallations();

    // Déjà installé pour cet email, ou pour ce nom de fokontany : on ne
    // valide pas une seconde fois. Deux accès pour un même fokontany, ce
    // sont deux registres qui finissent par se séparer.
    function dejaInstalle(email, texteAnarana) {
      const mail = String(email || '').trim().toLowerCase();
      const nom = nomDuFokontany(texteAnarana);
      return installes.filter(function (i) {
        // Seulement les installations de la même sorte : un même email peut
        // avoir son Fokontany et son Commun.
        if ((i.karazana === 'commun') !== pourCommun) return false;
        if (String(i.email || '').trim().toLowerCase() === mail) return true;
        if (pourCommun) return false;
        return !!nom && String(i.fokontany || '').trim().toLowerCase() === nom;
      })[0] || null;
    }

    // « 📩 Mangataka fanokafana » : le même chemin que la porte
    // (commun-alalana.js) — la fonction commun-angataka pose la demande, tire
    // le code et prévient par email ; à défaut, la demande s'écrit dans la table.
    const statutDemande = page.querySelector('[data-mangataka-statut]');
    const monEmailDemande = String(u.email || '').trim().toLowerCase();
    function montrerStatutDemande(){
      if(!sb || !monEmailDemande) return;
      sb.from('commun_fangatahana').select('statut').ilike('email', monEmailDemande).then(function(res){
        const f = res && !res.error && (res.data || [])[0];
        statutDemande.textContent = !f ? 'Mbola tsy nangataka ianao.'
          : (f.statut === 'ekena' ? 'Ny fangatahanao dia neken\'ny tompon\'ny site. Angataho aminy ny code.'
            : (f.statut === 'lavina' ? 'Nolavina ny fangatahanao.' : 'Nalefa ny fangatahanao, miandry valiny.'));
      }, function(){});
    }
    montrerStatutDemande();
    // Le nom du fokontany et son email suivent le lien : chaque fokontany a le
    // sien (/fokontany/?f=…&e=…), sa page le porte en titre, et c'est son
    // email — non celui de l'admin — qui attend sur l'écran de connexion.
    let fokontanyDemande = '';
    let communDemande = '';
    let emailDemande = '';
    page.querySelector('[data-mangataka]').addEventListener('click', function(){
      const lire = function(sel){ return String(page.querySelector(sel).value || '').trim(); };
      const anarana = lire('[data-f-anarana]');
      const prenom = lire('[data-f-prenom]');
      const fokontany = lire('[data-f-fokontany]');
      const commun = lire('[data-f-commun]');
      const email = lire('[data-f-email]').toLowerCase();
      const asa = lire('[data-f-asa]');
      if(!anarana || !prenom || (!fokontany && !pourCommun) || !commun || !email || !asa){
        dire('Fenoy daholo ireo saha rehetra ao amin\'ny taratasy.', true); return;
      }
      if(email.indexOf('@') < 0){ dire('Tsy mety ny email hanokafana ny site.', true); return; }
      if(!sb || !sb.functions || !sb.functions.invoke){ dire('Tsy tafiditra ny serveur : havaozy ny pejy.', true); return; }
      // Le nom du commun voyage avec celui du fokontany : c'est de lui que le
      // fokontany relève, et l'Administratif Commun le retrouve ainsi.
      const nomComplet = anarana + ' ' + prenom + (pourCommun
        ? ' — Commun ' + commun
        : ' — Fokontany ' + fokontany + ' / Commun ' + commun) + ' (' + asa + ')';
      dire('Mandefa ny fangatahana…');
      // La lettre part chez l'admin, et chez lui seul : c'est lui qui donnera
      // le code au fokontany. La fonction pose l'accès comme d'habitude.
      const lettre = [
        'Ireto tompoko ny mombamomba ahy, ary ekeo ny fangatahako ilay code :',
        'Anarana : ' + anarana,
        'Fanampin\'anarana : ' + prenom,
        pourCommun ? null : 'Fokontany : ' + fokontany,
        'Commun : ' + commun,
        'Email hanokafana ny site : ' + email,
        'Asa eo anivon\'ny ' + ANY + ' : ' + asa
      ].filter(Boolean).join('\n');
      sb.functions.invoke('commun-code', {
        body: { email: email, anarana: nomComplet, pour_le_proprietaire: true, lettre: lettre }
      }).then(function(res){
        const data = (res && res.data) || {};
        if(!data.code){
          dire('Tsy nety : ' + ((res && res.error && res.error.message) || data.error || 'tsy fantatra'), true);
          return;
        }
        fokontanyDemande = fokontany;
        communDemande = commun;
        emailDemande = email;
        champ.value = data.code;
        // Le Commun l'apprend : le fokontany y est inscrit, sous son nom.
        ajouterNotificationLocale('fangatahana', pourCommun
          ? 'Voasoratra ny Commun « ' + commun + ' » (' + email + ').'
          : 'Voasoratra ao amin\'ny Commun « ' + commun + ' » ny Fokontany « ' + fokontany + ' » (' + email + ').');
        // Un fokontany nouveau vaut 500 000 Ar au portefeuille (commun-code).
        if(data.credite){
          ajouterNotificationLocale('parrainage',
            '💰 ' + Number(data.montant || 0).toLocaleString('fr-FR') + ' Ar tafiditra ao amin\'ny portefeuillenao : ' +
            (pourCommun ? 'Commun vaovao « ' + commun + ' ».' : 'Fokontany vaovao « ' + fokontany + ' ».'));
          if(typeof renderWallet === 'function') renderWallet();
        }
        dire(data.sent
          ? 'Lasa tao amin\'ny mailakao (admin) ny taratasy sy ny code. Code : ' + data.code + ' — tsindrio « 🔓 Sokafy ny pejy ».'
          : 'Tsy lasa ny mailaka (' + (data.error || 'antony tsy fantatra') + '). Code : ' + data.code + ' — voatahiry ihany izy.', !data.sent);
        montrerStatutDemande();
        chargerLesDemandes();
      }, function(err){ dire('Tsy tratra ny fonction : ' + ((err && err.message) || 'réseau'), true); });
    });

    page.querySelector('[data-sokafy]').addEventListener('click', function(){
      const code = champ.value.trim().toUpperCase();
      if(!code){ dire('Soraty ny code an\'ilay fokontany vaovao.', true); return; }
      if(!sb){ dire('Tsy tafiditra ny serveur : havaozy ny pejy.', true); return; }
      dire('Fanamarinana…');
      sb.from('commun_alalana').select('id,email,anarana,active,voamarina').eq('code', code).then(function(res){
        const a = res && !res.error && (res.data || [])[0];
        if(!a){ dire('Tsy mety ny code : jereo ao amin\'ny « 🛡️ Fangatahana ».', true); return; }
        const nom = a.anarana ? a.anarana + ' (' + a.email + ')' : a.email;
        const deja = dejaInstalle(a.email, a.anarana);
        if (deja && !(a.active && a.voamarina)) {
          dire('Efa nisy installation : ' + (deja.fokontany || deja.email) +
            ' (' + new Date(deja.created_at).toLocaleDateString('fr-FR') + '). ' +
            'Tsy azo hamafisina indray ny mail na ny anaran\'ny fokontany mitovy.', true);
          return;
        }
        const suite = function(){
          dire('✓ Voamarina : ' + nom + '.');
          // Le nom du fokontany et son email voyagent avec le lien.
          const bouts = [];
          if(fokontanyDemande) bouts.push('f=' + encodeURIComponent(fokontanyDemande));
          if(communDemande) bouts.push('c=' + encodeURIComponent(communDemande));
          if(emailDemande || a.email) bouts.push('e=' + encodeURIComponent(emailDemande || a.email));
          const suffixe = bouts.length ? '?' + bouts.join('&') : '';
          setTimeout(function(){ fermer(); ensuite(suffixe); }, 700);
        };
        if(a.active && a.voamarina){ suite(); return; }
        const maintenant = new Date().toISOString();
        sb.from('commun_alalana').update({ voamarina: true, active: true, updated_at: maintenant }).eq('id', a.id).select('id')
          .then(function(up){
            if(up.error || !up.data || !up.data.length){ dire('Tsy voamarina : mivoaha dia midira indray.', true); return; }
            sb.from('commun_fangatahana').update({ statut: 'ekena', updated_at: maintenant })
              .ilike('email', String(a.email).trim().toLowerCase()).then(function(){}, function(){});
            suite();
          }, function(){ dire('Tsy tratra ny serveur : jereo ny réseau.', true); });
      }, function(){ dire('Tsy tratra ny serveur : jereo ny réseau.', true); });
    });
  }
})();

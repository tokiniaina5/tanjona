// Hasina Hôtellerie : le menu sakafo de l'hôtel.
//
// Une page du menu, et dedans le menu sakafo : les plats rangés par sokajy
// (maraina, atoandro, hariva, zava-pisotro, tsindrin-tsakafo), chacun avec son
// prix et une marque « misy / lany ». Comme les fitaovana, tout reste dans ce
// navigateur (localStorage) ; la clé porte SUFFIXE_MPIASA (common.js) pour
// qu'un employé ouvert chez le patron ne touche pas au menu du patron.
//
// La page est vide dans ny-asako.html : ce fichier la remplit.

(function () {
  const SUFFIXE = (typeof SUFFIXE_MPIASA !== 'undefined') ? SUFFIXE_MPIASA : '';
  const CLE = 'stockmanager_hotelerie_sakafo' + SUFFIXE;
  const CHAMP = 'background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:0.5rem 0.6rem; font:inherit;';
  const SOKAJY = [
    ['maraina', '🌅 Sakafo maraina'],
    ['atoandro', '🍛 Sakafo atoandro'],
    ['hariva', '🌙 Sakafo hariva'],
    ['fisotro', '🥤 Zava-pisotro'],
    ['tsindrina', '🍰 Tsindrin-tsakafo']
  ];

  function lire() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function ecrire(liste) {
    try { localStorage.setItem(CLE, JSON.stringify(liste)); return true; }
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
  function ariary(n) { return Number(n || 0).toLocaleString('fr-FR') + ' Ar'; }
  function nomSokajy(c) {
    const s = SOKAJY.find(function (x) { return x[0] === c; });
    return s ? s[1] : c;
  }

  let recherche = '';
  let enCours = null; // l'id du plat qu'on modifie, ou null pour un nouveau

  function rendre() {
    const z = document.querySelector('.hotelerie');
    if (!z) return;
    const plats = lire();
    const plat = enCours ? plats.find(function (p) { return p.id === enCours; }) : null;
    if (enCours && !plat) enCours = null;

    z.innerHTML =
      '<div class="section-head"><div><h2>🏨 Hasina Hôtellerie</h2>' +
        '<p>Ny menu sakafo an\'ny hotely. Ao amin\'ity navigateur ity ihany no voatahiry izy.</p></div></div>' +
      '<div class="dash-tabs" style="margin-bottom:1rem;">' +
        '<button type="button" class="dash-tab active" style="width:auto;">🍽️ Menu sakafo</button>' +
      '</div>' +
      '<div class="panel">' +
        '<h4 style="margin:0 0 0.8rem;">' + (plat ? '✏️ Ovay ny sakafo' : '＋ Sakafo vaovao') + '</h4>' +
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.6rem;">' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoAnarana">Anarana</label>' +
            '<input id="sakafoAnarana" type="text" placeholder="Ex: Romazava" value="' + html(plat ? plat.anarana : '') + '"></div>' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoSokajy">Sokajy</label>' +
            '<select id="sakafoSokajy">' + SOKAJY.map(function (s) {
              return '<option value="' + s[0] + '"' + (plat && plat.sokajy === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
            }).join('') + '</select></div>' +
          '<div class="field" style="margin-bottom:0;"><label for="sakafoVidiny">Vidiny (Ar)</label>' +
            '<input id="sakafoVidiny" type="number" min="0" step="100" placeholder="Ex: 12000" value="' + html(plat ? plat.vidiny : '') + '"></div>' +
        '</div>' +
        '<div class="field" style="margin:0.6rem 0 0;"><label for="sakafoFamaritana">Famaritana (raha misy)</label>' +
          '<input id="sakafoFamaritana" type="text" placeholder="Ex: hena kisoa, anamamy, vary" value="' + html(plat ? plat.famaritana : '') + '"></div>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.8rem;">' +
          '<button type="button" class="btn btn-sm btn-primary" id="sakafoTehirizo" style="width:auto;">💾 Tehirizo</button>' +
          (plat ? '<button type="button" class="btn btn-sm" id="sakafoAtsahatra" style="width:auto;">Ajanony</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="panel" style="margin-top:1rem;">' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">' +
          '<input id="sakafoRecherche" type="search" placeholder="Karohy sakafo..." value="' + html(recherche) + '" style="flex:1 1 160px; min-width:0; ' + CHAMP + '">' +
          '<span style="font-size:0.78rem; color:var(--muted);">' + plats.length + ' sakafo</span>' +
        '</div>' +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.6rem;">' +
          '<button type="button" class="btn btn-sm" id="sakafoAdikao" style="width:auto;">📋 Adikao ny menu</button>' +
          '<button type="button" class="btn btn-sm" id="sakafoRohy" style="width:auto;">🔗 Rohy ny menu</button>' +
        '</div>' +
        '<div id="sakafoRohyBoaty" style="display:none; margin-top:0.6rem;">' +
          '<input id="sakafoRohyInput" type="text" readonly style="width:100%; box-sizing:border-box; ' + CHAMP + '">' +
          '<p id="sakafoRohyNote" style="font-size:0.75rem; color:var(--muted); margin:0.3rem 0 0;"></p>' +
        '</div>' +
        '<div id="sakafoListe" style="margin-top:0.8rem;"></div>' +
      '</div>';

    dessinerListe(z, plats);

    z.querySelector('#sakafoRecherche').addEventListener('input', function (e) {
      recherche = e.target.value;
      dessinerListe(z, lire());
    });
    z.querySelector('#sakafoTehirizo').addEventListener('click', function () {
      const anarana = z.querySelector('#sakafoAnarana').value.trim();
      const vidiny = Number(z.querySelector('#sakafoVidiny').value);
      if (!anarana) { alert('Soraty ny anaran\'ny sakafo.'); return; }
      if (!(vidiny >= 0) || z.querySelector('#sakafoVidiny').value === '') { alert('Soraty ny vidiny.'); return; }
      const donnees = {
        anarana: anarana,
        sokajy: z.querySelector('#sakafoSokajy').value,
        vidiny: vidiny,
        famaritana: z.querySelector('#sakafoFamaritana').value.trim()
      };
      const liste = lire();
      const i = enCours ? liste.findIndex(function (p) { return p.id === enCours; }) : -1;
      if (i >= 0) Object.assign(liste[i], donnees);
      else liste.push(Object.assign({ id: nouvelId(), misy: true }, donnees));
      if (ecrire(liste)) { enCours = null; rendre(); }
    });
    z.querySelector('#sakafoAdikao').addEventListener('click', function (e) {
      const texte = texteDuMenu(lire());
      if (!texte) { alert('Mbola tsy misy sakafo misy ao amin\'ny menu.'); return; }
      copier(texte, e.target, '📋 Adikao ny menu');
    });
    z.querySelector('#sakafoRohy').addEventListener('click', function (e) {
      const rohy = rohyDuMenu(lire());
      if (!rohy) { alert('Mbola tsy misy sakafo misy ao amin\'ny menu.'); return; }
      const boaty = z.querySelector('#sakafoRohyBoaty');
      const champ = z.querySelector('#sakafoRohyInput');
      boaty.style.display = '';
      champ.value = rohy;
      champ.select();
      z.querySelector('#sakafoRohyNote').textContent =
        'Alefaso amin\'ny Messenger, WhatsApp... Ny menu ao anatin\'ny rohy no hitan\'ny mpanjifa : raha ovainao ny menu dia mamoròna rohy vaovao.';
      copier(rohy, e.target, '🔗 Rohy ny menu');
    });
    const atsahatra = z.querySelector('#sakafoAtsahatra');
    if (atsahatra) atsahatra.addEventListener('click', function () { enCours = null; rendre(); });

    z.querySelector('#sakafoListe').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      const liste = lire();
      const i = liste.findIndex(function (p) { return p.id === b.dataset.id; });
      if (i < 0) return;
      if (b.dataset.action === 'ovay') {
        enCours = liste[i].id;
        rendre();
        z.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (b.dataset.action === 'misy') {
        liste[i].misy = !liste[i].misy;
        if (ecrire(liste)) rendre();
      } else if (b.dataset.action === 'esory') {
        if (!confirm('Esorina ve « ' + liste[i].anarana + ' » ?')) return;
        if (enCours === liste[i].id) enCours = null;
        liste.splice(i, 1);
        if (ecrire(liste)) rendre();
      }
    });
  }

  // Les plats « misy » seulement, dans l'ordre des sokajy : c'est ce que le
  // client doit voir, que ce soit en texte collé ou par le lien.
  function platsVisibles(plats) {
    const ordre = SOKAJY.map(function (s) { return s[0]; });
    return plats.filter(function (p) { return p.misy; }).sort(function (a, b) {
      const d = ordre.indexOf(a.sokajy) - ordre.indexOf(b.sokajy);
      return d || a.anarana.localeCompare(b.anarana, 'fr');
    });
  }
  function texteDuMenu(plats) {
    const visibles = platsVisibles(plats);
    if (!visibles.length) return '';
    const lignes = ['🏨 Hasina Hôtellerie — 🍽️ Menu sakafo'];
    let courant = null;
    visibles.forEach(function (p) {
      if (p.sokajy !== courant) { courant = p.sokajy; lignes.push('', nomSokajy(courant)); }
      lignes.push('• ' + p.anarana + ' : ' + ariary(p.vidiny) + (p.famaritana ? ' (' + p.famaritana + ')' : ''));
    });
    return lignes.join('\n');
  }
  // Le menu voyage dans le lien lui-même, après le « # » : il n'y a rien à
  // publier sur le serveur, et le fragment n'y est jamais envoyé.
  function rohyDuMenu(plats) {
    const visibles = platsVisibles(plats);
    if (!visibles.length) return '';
    const donnees = JSON.stringify(visibles.map(function (p) {
      return [p.anarana, p.sokajy, p.vidiny, p.famaritana || ''];
    }));
    const octets = new TextEncoder().encode(donnees);
    let bin = '';
    octets.forEach(function (o) { bin += String.fromCharCode(o); });
    const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + '/menu-sakafo.html#m=' + code;
  }
  function copier(texte, bouton, libelle) {
    function fait() {
      bouton.textContent = '✅ Voadika';
      setTimeout(function () { bouton.textContent = libelle; }, 1800);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texte).then(fait, function () { copierVieux(texte); fait(); });
    } else { copierVieux(texte); fait(); }
  }
  function copierVieux(texte) {
    const t = document.createElement('textarea');
    t.value = texte;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (e) { }
    t.remove();
  }

  function dessinerListe(z, plats) {
    const boite = z.querySelector('#sakafoListe');
    const q = recherche.trim().toLowerCase();
    const trouves = plats.filter(function (p) {
      return !q || (p.anarana + ' ' + (p.famaritana || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!trouves.length) {
      boite.innerHTML = '<p class="empty-hint" style="margin:0;">' +
        (plats.length ? 'Tsy misy mifanaraka.' : 'Mbola tsy misy sakafo ao amin\'ny menu.') + '</p>';
      return;
    }
    // Les sokajy connus d'abord, dans leur ordre ; puis ce qui viendrait d'ailleurs.
    const ordre = SOKAJY.map(function (s) { return s[0]; });
    trouves.forEach(function (p) { if (ordre.indexOf(p.sokajy) < 0) ordre.push(p.sokajy); });
    boite.innerHTML = ordre.map(function (c) {
      const groupe = trouves.filter(function (p) { return p.sokajy === c; })
        .sort(function (a, b) { return a.anarana.localeCompare(b.anarana, 'fr'); });
      if (!groupe.length) return '';
      return '<h4 style="margin:0.8rem 0 0.5rem; font-size:0.9rem;">' + html(nomSokajy(c)) + '</h4>' +
        groupe.map(function (p) {
          return '<div style="display:flex; gap:0.6rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:0.5rem; padding:0.6rem 0.8rem; border-radius:8px; border:1px solid var(--line);' +
              (p.misy ? '' : ' opacity:0.55;') + '">' +
            '<div style="flex:1 1 180px; min-width:0;">' +
              '<strong style="font-size:0.88rem;">' + html(p.anarana) + '</strong>' +
              (p.misy ? '' : ' <span style="font-size:0.7rem; color:#ff6b6b;">· Lany</span>') +
              (p.famaritana ? '<span style="display:block; font-size:0.78rem; color:var(--muted); margin-top:0.2rem;">' + html(p.famaritana) + '</span>' : '') +
            '</div>' +
            '<strong style="font-size:0.88rem; color:var(--cyan); white-space:nowrap;">' + ariary(p.vidiny) + '</strong>' +
            '<div style="display:flex; gap:0.35rem; flex-wrap:wrap; flex-basis:100%;">' +
              '<button type="button" class="btn btn-sm" data-action="misy" data-id="' + p.id + '" style="width:auto;">' + (p.misy ? '✅ Misy' : '⛔ Lany') + '</button>' +
              '<button type="button" class="btn btn-sm" data-action="ovay" data-id="' + p.id + '" style="width:auto;">✏️ Ovay</button>' +
              '<button type="button" class="btn btn-sm btn-red" data-action="esory" data-id="' + p.id + '" style="width:auto;">Esorina</button>' +
            '</div>' +
          '</div>';
        }).join('');
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', rendre);
  if (document.readyState !== 'loading') rendre();
})();

// Mpiasa sy livreur : qui travaille, et ce qu'on leur confie.
//
// Tout vit dans Supabase et non dans le navigateur : un registre gardé sur
// un seul téléphone ne sert à rien le jour où l'on ouvre l'application
// ailleurs, et une livraison qu'on suit doit se suivre depuis n'importe où.
//
// Chaque ligne porte l'email du compte qui l'a créée, et les règles de la
// base ne laissent voir que les siennes : deux commerçants qui utilisent
// l'application ne se croisent jamais.

(function () {
  const ROLES = { mpiasa: 'Mpiasa', livreur: 'Livreur' };

  // Les étapes d'une course, dans l'ordre où elles arrivent. L'ordre compte :
  // c'est lui qui donne le bouton « suivant » sans avoir à choisir.
  const ETAPES = ['miandry', 'nalaina', 'an_dalana', 'tonga'];
  const STATUTS = {
    miandry: { texte: 'Miandry', couleur: 'var(--muted)' },
    nalaina: { texte: 'Nalaina', couleur: 'var(--amber)' },
    an_dalana: { texte: 'An-dalana', couleur: 'var(--violet)' },
    tonga: { texte: 'Tonga', couleur: 'var(--cyan)' },
    foana: { texte: 'Foana', couleur: 'var(--red)' }
  };

  let equipe = [];
  let livraisons = [];
  // Les venues encore ouvertes — arrivée inscrite, départ vide. C'est ce vide
  // qui dit qui est au travail, sans rien avoir à calculer.
  let ouverts = {};
  // Qui est affiché dans la fenêtre d'une personne.
  let personneOuverte = null;

  // La dernière position connue de chaque livreur, la carte, et ses repères.
  const CLE_MAPS = 'stockmanager_cle_maps';
  let positions = [];
  let carte = null;
  let reperes = {};
  let mapsDemandee = null;

  function sb() {
    return window.__sb || null;
  }
  // common.js n'est pas enveloppé : son « let currentUser » vit dans la portée
  // du script, partagée par tous les fichiers chargés ensuite — mais ce n'est
  // PAS une propriété de window. On le lisait par window.currentUser : c'était
  // toujours vide, et le bouton répondait « midira aloha » à quelqu'un qui
  // était entré.
  function monEmail() {
    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  // ---------- Être entré ici ne suffit pas ----------
  // L'application peut s'ouvrir sur une session gardée dans le navigateur,
  // sans que Supabase, lui, ait encore une session ouverte : au retour d'un
  // code de secours, ou quand le jeton a expiré pendant une longue absence.
  //
  // L'écran dit alors « entré », et la base dit « je ne vous connais pas ».
  // Les tables ne rendent rien — pas une erreur, rien, car une ligne qu'on
  // n'a pas le droit de voir n'existe pas — et toute écriture est refusée
  // au nom de la sécurité au niveau des lignes. C'est ce qui faisait une
  // liste vide sans un mot d'explication.
  function sessionServeur() {
    const client = sb();
    if (!client || !client.auth || !client.auth.getSession) return Promise.resolve(false);
    return client.auth.getSession().then(function (r) {
      return !!(r && r.data && r.data.session);
    }, function () { return false; });
  }

  const REENTRER = 'Mbola tsy tafiditra ao amin\'ny Supabase ianao. Mivoaha (Hivoaka) dia midira indray amin\'ny email sy tenimiafina — avy eo dia handeha ny fanoratana.';

  // Un refus de la base est presque toujours le même refus. On regarde une
  // fois de plus avant d'accuser : session perdue, ou email qui ne correspond
  // pas à celui du compte ouvert.
  function expliquerRefus(res, msgId) {
    const m = (res && res.error && res.error.message) ? String(res.error.message) : '';
    if (m.indexOf('row-level security') < 0 && m.indexOf('violates') < 0) {
      dire(msgId, 'Tsy tafiditra : ' + m, true);
      return;
    }
    sessionServeur().then(function (ouvert) {
      dire(msgId, ouvert
        ? 'Nolavina : tsy mifanaraka amin\'ny kaonty misokatra ny email. Mivoaha dia midira indray.'
        : REENTRER, true);
    });
  }

  function dire(id, texte, erreur) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  // Les deux métiers ont chacun leur page, donc chacun sa ligne de message.
  const METIERS = ['mpiasa', 'livreur'];
  function direPartout(texte, erreur) {
    METIERS.forEach(function (r) { dire(r + 'Statut', texte, erreur); });
  }

  function html(v) {
    return (typeof escapeHtml === 'function') ? escapeHtml(String(v ?? '')) : String(v ?? '');
  }

  // ---------- La copie du stock ----------
  // Les articles vivent dans le téléphone du patron. L'employé, qui n'a pas
  // de compte, ne les verrait jamais : on en dépose une copie à chaque
  // ouverture, et c'est elle qu'il regarde. Il ne peut rien y changer — il
  // n'écrit nulle part.
  function deposerLeStock() {
    const client = sb();
    const email = monEmail();
    if (!client || !email || typeof loadItems !== 'function') return;
    let articles = [];
    try { articles = loadItems() || []; } catch (e) { return; }
    client.from('stock_partage').upsert({
      owner_email: email,
      articles: articles,
      maj: new Date().toISOString()
    }, { onConflict: 'owner_email' }).then(function () {}, function () {});
  }

  // ---------- Le lien d'un employé ----------
  // Un jeton long et tiré au hasard : c'est la seule chose qui ouvre la
  // porte, il ne doit pas se deviner. On le pose la première fois qu'on
  // demande le lien, et il ne change plus.
  function nouveauJeton() {
    const octets = new Uint8Array(24);
    (window.crypto || window.msCrypto).getRandomValues(octets);
    let sortie = '';
    for (let i = 0; i < octets.length; i++) sortie += ('0' + octets[i].toString(16)).slice(-2);
    return sortie;
  }

  function lienDe(jeton) {
    return location.origin + location.pathname + '?mpiasa=' + jeton;
  }

  function donnerLeLien(personne, bouton) {
    const client = sb();
    if (!client) return;
    if (personne.jeton) { montrerLeLien(personne, personne.jeton); return; }

    if (bouton) bouton.disabled = true;
    const jeton = nouveauJeton();
    client.from('equipe').update({ jeton: jeton }).eq('id', personne.id)
      .then(function (res) {
        if (bouton) bouton.disabled = false;
        if (res && res.error) { direPartout('Tsy voaforona ny rohy : ' + res.error.message, true); return; }
        personne.jeton = jeton;
        montrerLeLien(personne, jeton);
        if (personneOuverte && personneOuverte.id === personne.id) dessinerLienPersonne(personne);
        charger();
      }, function () {
        if (bouton) bouton.disabled = false;
        direPartout('Tsy tafita ny fangatahana.', true);
      });
  }

  function montrerLeLien(personne, jeton) {
    const lien = lienDe(jeton);
    // Le presse-papier d'abord, la lecture ensuite : sur un téléphone on
    // veut coller le lien dans un message, pas le recopier à la main.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lien).then(function () {
        direPartout('Voadika ny rohin\'i ' + personne.nom + ' : ' + lien);
      }, function () {
        direPartout('Rohin\'i ' + personne.nom + ' : ' + lien);
      });
    } else {
      direPartout('Rohin\'i ' + personne.nom + ' : ' + lien);
    }
  }

  // ---------- Le lien du client ----------
  // Le commerçant l'envoie par SMS. Il ne donne rien d'autre que cette
  // course-là : ni le stock, ni les autres clients, ni le téléphone du
  // livreur. Et il s'éteint de lui-même — la fonction cesse de rendre une
  // position dès que la course est arrivée ou annulée.
  function lienSuivi(jeton) {
    return location.origin + location.pathname + '?suivi=' + jeton;
  }

  function donnerLeLienClient(course, bouton) {
    const client = sb();
    if (!client) return;
    if (course.jeton) { montrerLienClient(course, course.jeton); return; }

    if (bouton) bouton.disabled = true;
    const jeton = nouveauJeton();
    client.from('livraisons').update({ jeton: jeton }).eq('id', course.id)
      .then(function (res) {
        if (bouton) bouton.disabled = false;
        if (res && res.error) { dire('livraisonStatut', 'Tsy voaforona ny rohy : ' + res.error.message, true); return; }
        course.jeton = jeton;
        montrerLienClient(course, jeton);
        charger();
      }, function () {
        if (bouton) bouton.disabled = false;
        dire('livraisonStatut', 'Tsy tafita ny fangatahana.', true);
      });
  }

  function montrerLienClient(course, jeton) {
    const lien = lienSuivi(jeton);
    const nom = course.client || course.designation;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lien).then(function () {
        dire('livraisonStatut', 'Voadika ny rohin\'i ' + nom + ' : ' + lien);
      }, function () {
        dire('livraisonStatut', 'Rohin\'i ' + nom + ' : ' + lien);
      });
    } else {
      dire('livraisonStatut', 'Rohin\'i ' + nom + ' : ' + lien);
    }
  }

  // ---------- Lire ----------
  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return Promise.resolve();

    return sessionServeur().then(function (ouvert) {
      // Sans session, les tables répondent « rien » et on afficherait une
      // liste vide comme si l'équipe n'existait pas. Mieux vaut le dire.
      if (!ouvert) { direPartout(REENTRER, true); return; }
      return lireVraiment(client, email);
    });
  }

  function lireVraiment(client, email) {
    return Promise.all([
      client.from('equipe').select('*').eq('owner_email', email)
        .order('created_at', { ascending: true }),
      client.from('livraisons').select('*').eq('owner_email', email)
        .order('created_at', { ascending: false }).limit(100),
      client.from('pointages').select('*').eq('owner_email', email).is('depart', null),
      // Les cent derniers relevés suffisent : on ne garde que le plus récent
      // de chacun, et une équipe n'a pas cent livreurs.
      client.from('positions').select('equipe_id,lat,lng,precision_m,at')
        .eq('owner_email', email).order('at', { ascending: false }).limit(100)
    ]).then(function (res) {
      equipe = (res[0] && res[0].data) || [];
      livraisons = (res[1] && res[1].data) || [];
      ouverts = {};
      ((res[2] && res[2].data) || []).forEach(function (o) { ouverts[o.equipe_id] = o; });
      dernierDeChacun((res[3] && res[3].data) || []);
      dessinerEquipe();
      dessinerCarte();
      remplirLivreurs();
      dessinerLivraisons();
      if (personneOuverte) chargerPersonne(personneOuverte.id);
    }, function () {
      direPartout('Tsy tafita ny fangatahana — jereo ny fifandraisana.', true);
    });
  }

  // ---------- Le registre ----------
  function dessinerEquipe() {
    METIERS.forEach(dessinerMetier);
  }

  function dessinerMetier(role) {
    const liste = document.getElementById(role + 'Liste');
    const vide = document.getElementById(role + 'Vide');
    if (!liste) return;
    // Chaque page ne montre que les siens : c'est tout l'objet de les avoir
    // séparés.
    const gens = equipe.filter(function (p) { return (p.role || 'mpiasa') === role; });
    liste.innerHTML = '';
    if (vide) vide.style.display = gens.length ? 'none' : 'block';

    gens.forEach(function (p) {
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.82rem; line-height:1.6;';
      const role = ROLES[p.role] || p.role;
      const auTravail = !!ouverts[p.id];
      div.innerHTML =
        '<strong style="color:var(--text);">' + html(p.nom) + '</strong>' +
        ' · <span style="color:var(--muted);">' + html(role) + '</span>' +
        (auTravail ? ' · <span style="color:var(--cyan);">eo am-piasana</span>' : '') +
        (p.actif ? '' : ' · <span style="color:var(--red);">tsy miasa intsony</span>') +
        (p.ora_andrasana ? ' · <span style="color:var(--muted);">' + p.ora_andrasana + ' ora/andro</span>' : '') +
        (p.telephone ? '<br><a href="tel:' + html(p.telephone) + '" style="color:var(--cyan);">' + html(p.telephone) + '</a>' : '') +
        (p.email ? '<br><span style="color:var(--muted);">' + html(p.email) + '</span>' : '');

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;';

      const ouvrir = document.createElement('button');
      ouvrir.type = 'button';
      ouvrir.className = 'btn btn-primary btn-sm';
      ouvrir.style.width = 'auto';
      ouvrir.textContent = 'Sokafy';
      ouvrir.addEventListener('click', function () { ouvrirPersonne(p); });
      actions.appendChild(ouvrir);

      const rohy = document.createElement('button');
      rohy.type = 'button';
      rohy.className = 'btn btn-sm';
      rohy.textContent = p.jeton ? 'Rohy' : 'Hamorona rohy';
      rohy.title = 'Ny rohy hasehoana azy ny stock — tsy azony ovaina';
      rohy.addEventListener('click', function () { donnerLeLien(p, rohy); });
      actions.appendChild(rohy);

      const bascule = document.createElement('button');
      bascule.type = 'button';
      bascule.className = 'btn btn-sm';
      bascule.textContent = p.actif ? 'Hampiato' : 'Haverina';
      bascule.addEventListener('click', function () {
        majPersonne(p.id, { actif: !p.actif }, bascule);
      });
      actions.appendChild(bascule);

      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'btn btn-red btn-sm';
      retirer.textContent = 'Esorina';
      retirer.addEventListener('click', function () {
        // Une personne s'efface, ses courses restent : elles portent son nom
        // en clair, et une journée passée ne se réécrit pas.
        if (!confirm('Esorina tanteraka ' + p.nom + ' ? Mijanona ny fandefasana efa natao.')) return;
        supprimerPersonne(p.id, retirer);
      });
      actions.appendChild(retirer);

      div.appendChild(actions);
      liste.appendChild(div);
    });
  }

  // ---------- Aiza izy ireo ----------
  // Le suivi ne remplace pas un coup de téléphone : il dit où quelqu'un était
  // il y a une minute, pas ce qu'il fait. C'est pourquoi l'heure est écrite
  // à côté du lieu — une position sans son heure ment.

  // La liste arrive triée du plus récent au plus ancien : le premier relevé
  // vu pour une personne est donc le sien le plus récent.
  function dernierDeChacun(lignes) {
    const vus = {};
    lignes.forEach(function (r) { if (!vus[r.equipe_id]) vus[r.equipe_id] = r; });
    positions = Object.keys(vus).map(function (k) { return vus[k]; });
  }

  // Le navigateur n'en garde qu'une copie, pour que la carte se dessine sans
  // attendre le serveur au prochain chargement. Ce qui fait foi est dans le
  // compte : c'est là que le téléphone du patron la trouvera, et c'est de là
  // que la fonction la tend au client qui suit sa livraison.
  function cleMaps() {
    try { return (localStorage.getItem(CLE_MAPS) || '').trim(); } catch (e) { return ''; }
  }

  function lireLaCleDuCompte() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return;
    client.from('reglages').select('cle_maps').eq('owner_email', email).maybeSingle()
      .then(function (res) {
        const v = (res && res.data && res.data.cle_maps) ? String(res.data.cle_maps).trim() : '';
        if (!v || v === cleMaps()) return;
        try { localStorage.setItem(CLE_MAPS, v); } catch (e) {}
        const champ = document.getElementById('carteCle');
        if (champ && !champ.value) champ.value = v;
        mapsDemandee = null; carte = null; reperes = {};
        dessinerCarte();
      }, function () {});
  }

  function depuis(iso) {
    const mn = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mn < 1) return 'vao izao';
    if (mn < 60) return mn + ' mn lasa izay';
    const h = Math.floor(mn / 60);
    if (h < 24) return h + ' ora lasa izay';
    return new Date(iso).toLocaleString('fr-FR');
  }

  // Nom, lieu, heure : les trois choses demandées, dans cet ordre.
  function dessinerCarte() {
    const liste = document.getElementById('positionsListe');
    const vide = document.getElementById('positionsVide');
    if (!liste) return;

    const lignes = [];
    positions.forEach(function (pos) {
      const gens = equipe.filter(function (x) { return x.id === pos.equipe_id; });
      // Un relevé dont la personne a été retirée ne dit plus de qui il parle.
      if (gens.length && (gens[0].role || 'mpiasa') === 'livreur') {
        lignes.push({ p: gens[0], pos: pos });
      }
    });
    lignes.sort(function (a, b) { return new Date(b.pos.at) - new Date(a.pos.at); });

    liste.innerHTML = '';
    if (vide) vide.style.display = lignes.length ? 'none' : 'block';

    lignes.forEach(function (l) {
      const lat = Number(l.pos.lat), lng = Number(l.pos.lng);
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.82rem; line-height:1.6;';
      div.innerHTML =
        '<strong style="color:var(--text);">' + html(l.p.nom) + '</strong>' +
        ' · <span style="color:var(--cyan);">' + html(depuis(l.pos.at)) + '</span>' +
        '<br><span style="color:var(--muted);">' + lat.toFixed(5) + ', ' + lng.toFixed(5) +
        (l.pos.precision_m ? ' (± ' + Math.round(l.pos.precision_m) + ' m)' : '') + '</span>' +
        '<br><span style="color:var(--muted);">' + new Date(l.pos.at).toLocaleString('fr-FR') + '</span>' +
        (l.p.telephone ? ' · <a href="tel:' + html(l.p.telephone) + '" style="color:var(--cyan);">' + html(l.p.telephone) + '</a>' : '') +
        '<br><a href="https://www.google.com/maps?q=' + lat + ',' + lng + '" target="_blank" rel="noopener" style="color:var(--cyan);">Sokafy ao amin&#39;ny Google Maps</a>';
      liste.appendChild(div);
    });

    poserLaCarte(lignes);
  }

  // Google Maps ne se charge que si une clé existe : un script appelé sans
  // clé ne rend qu'un rectangle gris barré d'un avertissement.
  function chargerGoogleMaps() {
    if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve(true);
    if (mapsDemandee) return mapsDemandee;
    if (!cleMaps()) return Promise.resolve(false);
    mapsDemandee = new Promise(function (fini) {
      const s = document.createElement('script');
      window.__carteLivreurPrete = function () { fini(true); };
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cleMaps()) +
        '&loading=async&callback=__carteLivreurPrete';
      s.async = true;
      s.onerror = function () { fini(false); };
      document.head.appendChild(s);
      // Une clé refusée ne déclenche ni onerror ni callback : sans ce délai,
      // on attendrait pour toujours.
      setTimeout(function () { fini(!!(window.google && window.google.maps)); }, 12000);
    });
    return mapsDemandee;
  }

  function poserLaCarte(lignes) {
    const boite = document.getElementById('carteLivreur');
    const note = document.getElementById('carteSansCle');
    if (!boite) return;

    if (!cleMaps()) {
      boite.style.display = 'none';
      if (note) {
        note.style.display = 'block';
        note.textContent = 'Tsy mbola misy clé Google Maps : ny lisitra ihany no miseho. Ny rohy isaky ny anarana dia manokatra ny Google Maps.';
      }
      return;
    }
    if (note) note.style.display = 'none';
    if (!lignes.length) { boite.style.display = 'none'; return; }
    boite.style.display = 'block';

    chargerGoogleMaps().then(function (prete) {
      if (!prete) {
        boite.style.display = 'none';
        if (note) {
          note.style.display = 'block';
          note.textContent = 'Tsy nety ny clé Google Maps. Jereo ao amin\'ny Google Cloud raha mandeha ny Maps JavaScript API sy ny facturation.';
        }
        return;
      }
      const g = window.google.maps;
      const premier = { lat: Number(lignes[0].pos.lat), lng: Number(lignes[0].pos.lng) };
      if (!carte) {
        carte = new g.Map(boite, {
          center: premier, zoom: 14,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false
        });
      }
      const bornes = new g.LatLngBounds();
      const vivants = {};
      lignes.forEach(function (l) {
        const point = { lat: Number(l.pos.lat), lng: Number(l.pos.lng) };
        bornes.extend(point);
        vivants[l.p.id] = true;
        let m = reperes[l.p.id];
        if (!m) {
          m = new g.Marker({ map: carte, position: point, title: l.p.nom });
          m.__bulle = new g.InfoWindow();
          m.addListener('click', function () {
            m.__bulle.setContent(m.__texte || '');
            m.__bulle.open(carte, m);
          });
          reperes[l.p.id] = m;
        } else {
          m.setPosition(point);
          m.setTitle(l.p.nom);
        }
        m.__texte = '<div style="font-size:13px; line-height:1.5; color:#111;"><strong>' +
          html(l.p.nom) + '</strong><br>' + html(depuis(l.pos.at)) + '<br>' +
          new Date(l.pos.at).toLocaleString('fr-FR') + '</div>';
      });
      // Celui qu'on a retiré de l'équipe ne doit pas rester planté là.
      Object.keys(reperes).forEach(function (id) {
        if (!vivants[id]) { reperes[id].setMap(null); delete reperes[id]; }
      });
      if (lignes.length === 1) { carte.setCenter(premier); carte.setZoom(15); }
      else carte.fitBounds(bornes);
    });
  }

  function garderLaCle() {
    const champ = document.getElementById('carteCle');
    if (!champ) return;
    const v = champ.value.trim();
    try {
      if (v) localStorage.setItem(CLE_MAPS, v);
      else localStorage.removeItem(CLE_MAPS);
    } catch (e) {}
    // Une clé qu'on change demande un nouveau chargement du script.
    mapsDemandee = null; carte = null; reperes = {};
    dessinerCarte();

    const client = sb();
    const email = monEmail();
    if (!client || !email) {
      dire('carteCleStatut', 'Voatahiry ato amin\'ity fitaovana ity ihany — midira aloha raha tianao ho any amin\'ny kaontinao.', true);
      return;
    }
    dire('carteCleStatut', 'Tehirizina…');
    client.from('reglages').upsert({
      owner_email: email, cle_maps: v || null, maj: new Date().toISOString()
    }, { onConflict: 'owner_email' }).then(function (res) {
      if (res && res.error) { dire('carteCleStatut', 'Tsy voatahiry : ' + res.error.message, true); return; }
      dire('carteCleStatut', v
        ? 'Voatahiry amin\'ny kaontinao. Hiasa amin\'ny fitaovanao rehetra, ary hahitan\'ny mpanjifa sarintany.'
        : 'Nesorina ny clé.');
    }, function () {
      dire('carteCleStatut', 'Tsy tafita ny fangatahana.', true);
    });
  }

  // Le rôle ne se choisit plus dans une liste : il est celui de la page où
  // l'on se trouve. Une case de moins, et une erreur de moins.
  function ajouterPersonne(role) {
    const client = sb();
    const email = monEmail();
    const msg = role + 'Statut';
    if (!client || !email) { dire(msg, 'Midira aloha.', true); return; }

    const nom = document.getElementById(role + 'Nom').value.trim();
    if (!nom) { dire(msg, 'Ilaina ny anarana.', true); return; }

    const bouton = document.getElementById(role + 'AjouterBtn');
    bouton.disabled = true;
    dire(msg, 'Ampidirina…');

    client.from('equipe').insert({
      owner_email: email,
      nom: nom,
      telephone: document.getElementById(role + 'Tel').value.trim() || null,
      role: role,
      email: document.getElementById(role + 'Email').value.trim().toLowerCase() || null,
      ora_andrasana: parseFloat(document.getElementById(role + 'Ora').value) || null
    }).then(function (res) {
      bouton.disabled = false;
      if (res && res.error) { expliquerRefus(res, msg); return; }
      ['Nom', 'Tel', 'Email', 'Ora'].forEach(function (c) {
        document.getElementById(role + c).value = '';
      });
      dire(msg, 'Voasoratra.');
      charger();
    }, function () {
      bouton.disabled = false;
      dire(msg, 'Tsy tafita ny fangatahana.', true);
    });
  }

  function majPersonne(id, champs, bouton) {
    const client = sb();
    if (!client) return;
    if (bouton) bouton.disabled = true;
    client.from('equipe').update(champs).eq('id', id).then(function () {
      if (bouton) bouton.disabled = false;
      charger();
    }, function () {
      if (bouton) bouton.disabled = false;
      direPartout('Tsy tafita ny fanovana.', true);
    });
  }

  function supprimerPersonne(id, bouton) {
    const client = sb();
    if (!client) return;
    if (bouton) bouton.disabled = true;
    client.from('equipe').delete().eq('id', id).then(function () {
      if (bouton) bouton.disabled = false;
      charger();
    }, function () {
      if (bouton) bouton.disabled = false;
      direPartout('Tsy voafafa.', true);
    });
  }

  // ---------- Les livraisons ----------
  function remplirLivreurs() {
    const select = document.getElementById('livraisonLivreur');
    if (!select) return;
    const choisi = select.value;
    select.innerHTML = '';

    const vide = document.createElement('option');
    vide.value = '';
    vide.textContent = '— mbola tsy voatendry —';
    select.appendChild(vide);

    // Les livreurs d'abord, et seulement ceux qui travaillent encore : on ne
    // confie pas une course à quelqu'un qu'on vient de mettre en pause.
    equipe.filter(function (p) { return p.actif; }).forEach(function (p) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.nom + (p.role === 'livreur' ? '' : ' (' + (ROLES[p.role] || p.role) + ')');
      select.appendChild(o);
    });
    if (choisi) select.value = choisi;
  }

  function dessinerLivraisons() {
    const liste = document.getElementById('livraisonListe');
    const vide = document.getElementById('livraisonVide');
    if (!liste) return;
    liste.innerHTML = '';
    if (vide) vide.style.display = livraisons.length ? 'none' : 'block';

    livraisons.forEach(function (l) {
      const etat = STATUTS[l.statut] || { texte: l.statut, couleur: 'var(--muted)' };
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.82rem; line-height:1.6;';
      div.innerHTML =
        '<strong style="color:var(--text);">' + html(l.designation) + '</strong>' +
        ' · <span style="color:' + etat.couleur + ';">' + html(etat.texte) + '</span>' +
        (l.client ? '<br>Mpanjifa : ' + html(l.client) : '') +
        (l.adresse ? '<br>Adiresy : ' + html(l.adresse) : '') +
        (l.telephone ? '<br><a href="tel:' + html(l.telephone) + '" style="color:var(--cyan);">' + html(l.telephone) + '</a>' : '') +
        '<br>Livreur : ' + html(l.livreur_nom || '—') +
        '<br><span style="color:var(--muted); font-size:0.76rem;">' +
        new Date(l.created_at).toLocaleString('fr-FR') + '</span>';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:0.4rem; flex-wrap:wrap; margin-top:0.6rem;';

      // Une seule étape à la fois, et toujours la suivante : rien à choisir,
      // rien à se tromper.
      const rang = ETAPES.indexOf(l.statut);
      if (rang >= 0 && rang < ETAPES.length - 1) {
        const suivant = ETAPES[rang + 1];
        const avancer = document.createElement('button');
        avancer.type = 'button';
        avancer.className = 'btn btn-primary btn-sm';
        avancer.style.width = 'auto';
        avancer.textContent = '→ ' + STATUTS[suivant].texte;
        avancer.addEventListener('click', function () {
          majLivraison(l.id, { statut: suivant }, avancer);
        });
        actions.appendChild(avancer);
      }

      if (l.statut !== 'foana' && l.statut !== 'tonga') {
        const annuler = document.createElement('button');
        annuler.type = 'button';
        annuler.className = 'btn btn-sm';
        annuler.textContent = 'Foanana';
        annuler.addEventListener('click', function () {
          majLivraison(l.id, { statut: 'foana' }, annuler);
        });
        actions.appendChild(annuler);
      }

      const rohyClient = document.createElement('button');
      rohyClient.type = 'button';
      rohyClient.className = 'btn btn-sm';
      rohyClient.textContent = l.jeton ? 'Adikao ny rohy mpanjifa' : 'Rohy ho an\'ny mpanjifa';
      rohyClient.title = 'Ny rohy handefasana amin\'ny mpanjifa mba hanarahany ny entany';
      rohyClient.addEventListener('click', function () { donnerLeLienClient(l, rohyClient); });
      actions.appendChild(rohyClient);

      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'btn btn-red btn-sm';
      retirer.textContent = 'Esorina';
      retirer.addEventListener('click', function () {
        if (!confirm('Esorina tanteraka ity fandefasana ity ?')) return;
        supprimerLivraison(l.id, retirer);
      });
      actions.appendChild(retirer);

      div.appendChild(actions);
      liste.appendChild(div);
    });
  }

  function ajouterLivraison() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('livraisonStatut', 'Midira aloha.', true); return; }

    const quoi = document.getElementById('livraisonQuoi').value.trim();
    if (!quoi) { dire('livraisonStatut', 'Ilaina ny entana.', true); return; }

    const livreurId = document.getElementById('livraisonLivreur').value || null;
    const porteur = equipe.filter(function (p) { return p.id === livreurId; })[0];

    const bouton = document.getElementById('livraisonAjouterBtn');
    bouton.disabled = true;
    dire('livraisonStatut', 'Ampidirina…');

    client.from('livraisons').insert({
      owner_email: email,
      designation: quoi,
      client: document.getElementById('livraisonClient').value.trim() || null,
      adresse: document.getElementById('livraisonAdresse').value.trim() || null,
      telephone: document.getElementById('livraisonTel').value.trim() || null,
      livreur_id: livreurId,
      // Le nom est recopié : le registre peut changer, ce qui s'est passé
      // ce jour-là ne doit pas changer avec lui.
      livreur_nom: porteur ? porteur.nom : null
    }).then(function (res) {
      bouton.disabled = false;
      if (res && res.error) { expliquerRefus(res, 'livraisonStatut'); return; }
      ['livraisonQuoi', 'livraisonClient', 'livraisonAdresse', 'livraisonTel'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      dire('livraisonStatut', 'Voasoratra.');
      charger();
    }, function () {
      bouton.disabled = false;
      dire('livraisonStatut', 'Tsy tafita ny fangatahana.', true);
    });
  }

  function majLivraison(id, champs, bouton) {
    const client = sb();
    if (!client) return;
    if (bouton) bouton.disabled = true;
    champs.updated_at = new Date().toISOString();
    client.from('livraisons').update(champs).eq('id', id).then(function () {
      if (bouton) bouton.disabled = false;
      charger();
    }, function () {
      if (bouton) bouton.disabled = false;
      dire('livraisonStatut', 'Tsy tafita ny fanovana.', true);
    });
  }

  function supprimerLivraison(id, bouton) {
    const client = sb();
    if (!client) return;
    if (bouton) bouton.disabled = true;
    client.from('livraisons').delete().eq('id', id).then(function () {
      if (bouton) bouton.disabled = false;
      charger();
    }, function () {
      if (bouton) bouton.disabled = false;
      dire('livraisonStatut', 'Tsy voafafa.', true);
    });
  }

  // ---------- La fenêtre d'une personne ----------
  function heures(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.round((ms % 3600000) / 60000);
    return h + ' h ' + (m < 10 ? '0' : '') + m;
  }
  function debutDuJour() {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }
  function debutDeSemaine() {
    const d = debutDuJour();
    // Lundi : le dimanche vaut 0 en JavaScript, et une semaine qui commence
    // le dimanche ne dirait rien à personne ici.
    const jour = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - jour);
    return d;
  }

  function ouvrirPersonne(p) {
    personneOuverte = p;
    const section = document.getElementById('section-personne');
    if (!section) return;
    // La croix doit ramener à la page du métier, et non à l'autre.
    section.dataset.metier = (p.role === 'livreur') ? 'livreur' : 'mpiasa';
    document.getElementById('personneNom').textContent = p.nom;
    document.getElementById('personneRole').textContent =
      (ROLES[p.role] || p.role) + (p.telephone ? ' · ' + p.telephone : '');
    // Les pages s'ouvrent toutes de la même façon : on retire l'active, on
    // pose la sienne. Ici il n'y a pas d'entrée de menu, on le fait à la main.
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    const fond = document.getElementById('section-stock');
    if (fond) fond.classList.add('active');
    section.classList.add('active');
    dessinerLienPersonne(p);
    dessinerArticlesPersonne();
    chargerPersonne(p.id);
  }

  function dessinerLienPersonne(p) {
    const ligne = document.getElementById('personneLien');
    const bouton = document.getElementById('personneLienBtn');
    if (ligne) ligne.textContent = p.jeton ? lienDe(p.jeton) : 'Mbola tsy misy rohy.';
    if (bouton) bouton.textContent = p.jeton ? 'Adikao ny rohy' : 'Hamorona rohy';
  }

  // Les mêmes articles que ceux qu'il verra : c'est la copie déposée à
  // l'ouverture, donc ce que l'application a sous la main. Aucun champ, aucun
  // bouton — on regarde, on ne change rien.
  function dessinerArticlesPersonne() {
    const boite = document.getElementById('personneArticles');
    if (!boite) return;
    let articles = [];
    try { articles = (typeof loadItems === 'function' ? loadItems() : []) || []; } catch (e) { articles = []; }
    if (!articles.length) {
      boite.innerHTML = '<p class="empty-hint">Mbola tsy misy article.</p>';
      return;
    }
    let t = '<div class="table-scroll"><table><thead><tr>' +
      '<th>Article</th><th>Réf.</th><th>Isa</th><th>Vidiny</th></tr></thead><tbody>';
    articles.forEach(function (a) {
      const qte = Number(a.qty ?? a.quantity ?? a.quantite ?? 0);
      const prix = Number(a.price ?? a.prix ?? 0);
      t += '<tr><td>' + html(a.name ?? a.nom ?? '—') + '</td>' +
        '<td>' + html(a.ref ?? a.reference ?? '—') + '</td>' +
        '<td>' + qte.toLocaleString('fr-FR') + '</td>' +
        '<td>' + (prix ? prix.toLocaleString('fr-FR') + ' Ar' : '—') + '</td></tr>';
    });
    t += '</tbody></table></div>';
    boite.innerHTML = t;
  }

  function chargerPersonne(id) {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return;
    client.from('pointages').select('*')
      .eq('owner_email', email).eq('equipe_id', id)
      .order('arrivee', { ascending: false }).limit(60)
      .then(function (res) {
        dessinerPersonne((res && res.data) || []);
      }, function () {
        dire('personnePointageStatut', 'Tsy tafita ny fangatahana.', true);
      });
  }

  function dessinerPersonne(lignes) {
    const ouvert = lignes.filter(function (l) { return !l.depart; })[0] || null;
    const etat = document.getElementById('personneEtat');
    if (etat) {
      etat.innerHTML = ouvert
        ? 'Eo am-piasana hatramin\'ny <strong style="color:var(--cyan);">' +
          new Date(ouvert.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) +
          '</strong>.'
        : 'Tsy eo am-piasana amin\'izao fotoana izao.';
    }
    const tonga = document.getElementById('personneTongaBtn');
    const lasa = document.getElementById('personneLasaBtn');
    if (tonga) tonga.disabled = !!ouvert;
    if (lasa) lasa.disabled = !ouvert;

    // Le total ne compte que ce qui est terminé, plus la venue en cours
    // arrêtée à maintenant : sinon une journée non close ne compterait pas.
    const jour = debutDuJour().getTime();
    const semaine = debutDeSemaine().getTime();
    let msJour = 0, msSemaine = 0;
    lignes.forEach(function (l) {
      const debut = new Date(l.arrivee).getTime();
      const fin = l.depart ? new Date(l.depart).getTime() : Date.now();
      const duree = Math.max(0, fin - debut);
      if (debut >= jour) msJour += duree;
      if (debut >= semaine) msSemaine += duree;
    });
    const hj = document.getElementById('personneHeuresJour');
    const hs = document.getElementById('personneHeuresSemaine');
    if (hj) hj.textContent = heures(msJour);
    if (hs) hs.textContent = heures(msSemaine);

    // Des heures seules ne sont qu'un nombre. En face de ce qu'on attend,
    // elles disent quelque chose : ce qui manque, ou ce qui dépasse.
    const attendu = personneOuverte && Number(personneOuverte.ora_andrasana) || 0;
    const ecart = document.getElementById('personneEcart');
    if (ecart) {
      if (!attendu) {
        ecart.textContent = '';
      } else {
        const attenduMs = attendu * 3600000;
        const diff = msJour - attenduMs;
        const manque = diff < 0;
        ecart.innerHTML = 'Andrasana : <strong>' + attendu + ' ora</strong> · ' +
          '<span style="color:' + (manque ? 'var(--amber)' : 'var(--cyan)') + ';">' +
          (manque ? 'tsy ampy ' : 'mihoatra ') + heures(Math.abs(diff)) + '</span>';
      }
    }

    // Combien de jours cette semaine : une semaine se juge aussi au nombre
    // de venues, et non seulement au total des heures.
    const jours = {};
    lignes.forEach(function (l) {
      const d = new Date(l.arrivee);
      if (d.getTime() >= semaine) jours[d.toDateString()] = true;
    });
    const nb = document.getElementById('personneJoursSemaine');
    if (nb) nb.textContent = Object.keys(jours).length + ' andro';

    const liste = document.getElementById('personnePointages');
    const vide = document.getElementById('personnePointagesVide');
    if (!liste) return;
    liste.innerHTML = '';
    if (vide) vide.style.display = lignes.length ? 'none' : 'block';
    lignes.forEach(function (l) {
      const d = new Date(l.arrivee);
      const f = l.depart ? new Date(l.depart) : null;
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.6rem 0.9rem; margin-bottom:0.5rem; font-size:0.82rem; line-height:1.6;';
      div.innerHTML =
        '<strong style="color:var(--text);">' + d.toLocaleDateString('fr-FR') + '</strong>' +
        ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) +
        ' → ' + (f ? f.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                   : '<span style="color:var(--cyan);">mbola eo</span>') +
        '<br><span style="color:var(--muted);">' +
        heures(Math.max(0, (f ? f.getTime() : Date.now()) - d.getTime())) + '</span>';
      liste.appendChild(div);
    });
  }

  function pointerArrivee() {
    const client = sb();
    const email = monEmail();
    if (!client || !email || !personneOuverte) return;
    const b = document.getElementById('personneTongaBtn');
    if (b) b.disabled = true;
    dire('personnePointageStatut', 'Soratana…');
    client.from('pointages').insert({
      owner_email: email, equipe_id: personneOuverte.id
    }).then(function (res) {
      if (res && res.error) { dire('personnePointageStatut', 'Tsy voasoratra : ' + res.error.message, true); if (b) b.disabled = false; return; }
      dire('personnePointageStatut', 'Voasoratra ny fotoana nahatongavana.');
      charger();
    }, function () {
      if (b) b.disabled = false;
      dire('personnePointageStatut', 'Tsy tafita ny fangatahana.', true);
    });
  }

  function pointerDepart() {
    const client = sb();
    const email = monEmail();
    if (!client || !email || !personneOuverte) return;
    const b = document.getElementById('personneLasaBtn');
    if (b) b.disabled = true;
    dire('personnePointageStatut', 'Soratana…');
    // La venue encore ouverte, et elle seule : on ne referme pas une journée
    // d'hier au passage.
    client.from('pointages').update({ depart: new Date().toISOString() })
      .eq('owner_email', email).eq('equipe_id', personneOuverte.id).is('depart', null)
      .then(function (res) {
        if (res && res.error) { dire('personnePointageStatut', 'Tsy voasoratra : ' + res.error.message, true); if (b) b.disabled = false; return; }
        dire('personnePointageStatut', 'Voasoratra ny fotoana nialana.');
        charger();
      }, function () {
        if (b) b.disabled = false;
        dire('personnePointageStatut', 'Tsy tafita ny fangatahana.', true);
      });
  }

  // ---------- Branchement ----------
  document.addEventListener('DOMContentLoaded', function () {
    METIERS.forEach(function (role) {
      const b = document.getElementById(role + 'AjouterBtn');
      if (b) b.addEventListener('click', function () { ajouterPersonne(role); });
    });

    const ajouterL = document.getElementById('livraisonAjouterBtn');
    if (ajouterL) ajouterL.addEventListener('click', ajouterLivraison);

    const lienBtn = document.getElementById('personneLienBtn');
    if (lienBtn) lienBtn.addEventListener('click', function () {
      if (personneOuverte) donnerLeLien(personneOuverte, lienBtn);
    });

    const cleBtn = document.getElementById('carteCleBtn');
    if (cleBtn) cleBtn.addEventListener('click', garderLaCle);
    const cleChamp = document.getElementById('carteCle');
    if (cleChamp) cleChamp.value = cleMaps();

    const tonga = document.getElementById('personneTongaBtn');
    if (tonga) tonga.addEventListener('click', pointerArrivee);
    const lasa = document.getElementById('personneLasaBtn');
    if (lasa) lasa.addEventListener('click', pointerDepart);

    // On relit à l'ouverture de la page : une course a pu avancer pendant
    // qu'on regardait ailleurs.
    METIERS.forEach(function (role) {
      const nav = document.querySelector('#navList .nav-item[data-section="' + role + '"]');
      if (nav) nav.addEventListener('click', charger);
    });
  });

  // Une position vieille de dix minutes affichée comme neuve tromperait. Tant
  // que la page du livreur est sous les yeux, on relit ; fermée, on se tait.
  setInterval(function () {
    const sec = document.getElementById('section-livreur');
    if (!sec || sec.offsetParent === null) return;
    if (!monEmail()) return;
    charger();
  }, 60000);

  // L'application appelle ceci quand elle s'ouvre : on en profite pour
  // déposer la copie du stock, puisque c'est le moment où elle est fraîche.
  window.renderEquipe = function () {
    deposerLeStock();
    lireLaCleDuCompte();
    return charger();
  };
  window.deposerLeStockPartage = deposerLeStock;
})();

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

  function sb() {
    return window.__sb || null;
  }
  function monEmail() {
    return (window.currentUser && window.currentUser.email)
      ? String(window.currentUser.email).trim().toLowerCase()
      : '';
  }
  function dire(id, texte, erreur) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texte || '';
    el.style.color = erreur ? 'var(--red)' : 'var(--cyan)';
  }
  function html(v) {
    return (typeof escapeHtml === 'function') ? escapeHtml(String(v ?? '')) : String(v ?? '');
  }

  // ---------- Lire ----------
  function charger() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) return Promise.resolve();

    return Promise.all([
      client.from('equipe').select('*').eq('owner_email', email)
        .order('created_at', { ascending: true }),
      client.from('livraisons').select('*').eq('owner_email', email)
        .order('created_at', { ascending: false }).limit(100),
      client.from('pointages').select('*').eq('owner_email', email).is('depart', null)
    ]).then(function (res) {
      equipe = (res[0] && res[0].data) || [];
      livraisons = (res[1] && res[1].data) || [];
      ouverts = {};
      ((res[2] && res[2].data) || []).forEach(function (o) { ouverts[o.equipe_id] = o; });
      dessinerEquipe();
      remplirLivreurs();
      dessinerLivraisons();
      if (personneOuverte) chargerPersonne(personneOuverte.id);
    }, function () {
      dire('equipeStatut', 'Tsy tafita ny fangatahana — jereo ny fifandraisana.', true);
    });
  }

  // ---------- Le registre ----------
  function dessinerEquipe() {
    const liste = document.getElementById('equipeListe');
    const vide = document.getElementById('equipeVide');
    if (!liste) return;
    liste.innerHTML = '';
    if (vide) vide.style.display = equipe.length ? 'none' : 'block';

    equipe.forEach(function (p) {
      const div = document.createElement('div');
      div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.82rem; line-height:1.6;';
      const role = ROLES[p.role] || p.role;
      const auTravail = !!ouverts[p.id];
      div.innerHTML =
        '<strong style="color:var(--text);">' + html(p.nom) + '</strong>' +
        ' · <span style="color:var(--muted);">' + html(role) + '</span>' +
        (auTravail ? ' · <span style="color:var(--cyan);">eo am-piasana</span>' : '') +
        (p.actif ? '' : ' · <span style="color:var(--red);">tsy miasa intsony</span>') +
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

  function ajouterPersonne() {
    const client = sb();
    const email = monEmail();
    if (!client || !email) { dire('equipeStatut', 'Midira aloha.', true); return; }

    const nom = document.getElementById('equipeNom').value.trim();
    if (!nom) { dire('equipeStatut', 'Ilaina ny anarana.', true); return; }

    const bouton = document.getElementById('equipeAjouterBtn');
    bouton.disabled = true;
    dire('equipeStatut', 'Ampidirina…');

    client.from('equipe').insert({
      owner_email: email,
      nom: nom,
      telephone: document.getElementById('equipeTel').value.trim() || null,
      role: document.getElementById('equipeRole').value,
      email: document.getElementById('equipeEmail').value.trim().toLowerCase() || null
    }).then(function (res) {
      bouton.disabled = false;
      if (res && res.error) { dire('equipeStatut', 'Tsy tafiditra : ' + res.error.message, true); return; }
      document.getElementById('equipeNom').value = '';
      document.getElementById('equipeTel').value = '';
      document.getElementById('equipeEmail').value = '';
      dire('equipeStatut', 'Voasoratra.');
      charger();
    }, function () {
      bouton.disabled = false;
      dire('equipeStatut', 'Tsy tafita ny fangatahana.', true);
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
      dire('equipeStatut', 'Tsy tafita ny fanovana.', true);
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
      dire('equipeStatut', 'Tsy voafafa.', true);
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
      if (res && res.error) { dire('livraisonStatut', 'Tsy tafiditra : ' + res.error.message, true); return; }
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
    document.getElementById('personneNom').textContent = p.nom;
    document.getElementById('personneRole').textContent =
      (ROLES[p.role] || p.role) + (p.telephone ? ' · ' + p.telephone : '');
    // Les pages s'ouvrent toutes de la même façon : on retire l'active, on
    // pose la sienne. Ici il n'y a pas d'entrée de menu, on le fait à la main.
    document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
    const fond = document.getElementById('section-stock');
    if (fond) fond.classList.add('active');
    section.classList.add('active');
    chargerPersonne(p.id);
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
    const ajouter = document.getElementById('equipeAjouterBtn');
    if (ajouter) ajouter.addEventListener('click', ajouterPersonne);

    const ajouterL = document.getElementById('livraisonAjouterBtn');
    if (ajouterL) ajouterL.addEventListener('click', ajouterLivraison);

    const tonga = document.getElementById('personneTongaBtn');
    if (tonga) tonga.addEventListener('click', pointerArrivee);
    const lasa = document.getElementById('personneLasaBtn');
    if (lasa) lasa.addEventListener('click', pointerDepart);

    // On relit à l'ouverture de la page : une course a pu avancer pendant
    // qu'on regardait ailleurs.
    const nav = document.querySelector('#navList .nav-item[data-section="equipe"]');
    if (nav) nav.addEventListener('click', charger);
  });

  // L'application appelle ceci quand elle s'ouvre.
  window.renderEquipe = charger;
})();

  // ---------------- FACTURES ----------------

  // Qui émet la facture. Le patron : son profil. L'employé entré par son
  // lien : la boutique — société, logo, NIF, STAT, email et téléphone du
  // patron, rendus par la fonction « mpiasa » (vue-mpiasa.js) —, et son nom à
  // lui en « Établie par ». Son propre profil n'a ni société ni NIF, et son
  // email, réservé aux appels (« …@ny-asako.invalid »), n'a rien à faire sur
  // une facture.
  function emetteurFacture(){
    const u = currentUser || {};
    if(typeof MODE_MPIASA === 'undefined' || !MODE_MPIASA){
      return { name: u.name || '', company: u.company || '', email: u.email || '', phone: u.phone || '',
               nif: u.nif || '', stat: u.stat || '', logo: u.logo || null, auteur: '' };
    }
    const b = window.__boutique || {};
    return {
      name: b.nom || '', company: b.societe || '', email: b.email || '', phone: b.telephone || '',
      nif: b.nif || '', stat: b.stat || '', logo: b.logo || null, auteur: u.name || ''
    };
  }

  function renderInvoiceItems(){
    const list = document.getElementById('invoiceItemsList');
    list.innerHTML = '';
    document.getElementById('invoiceEmptyHint').style.display = items.length ? 'none' : 'block';
    items.forEach(function(item, idx){
      const row = document.createElement('div');
      row.className = 'invoice-line';
      row.innerHTML =
        '<span class="name">' + escapeHtml(item.name) + ' <span style="color:var(--muted)">(' + formatAr(item.price) + ')</span></span>' +
        '<input type="number" min="0" max="' + item.qty + '" value="0" data-idx="' + idx + '" class="invoice-qty">';
      list.appendChild(row);
    });
    list.querySelectorAll('.invoice-qty').forEach(function(inp){
      inp.addEventListener('input', updateInvoiceTotal);
    });
    updateInvoiceTotal();
  }

  function getInvoiceSelection(){
    const selection = [];
    document.querySelectorAll('.invoice-qty').forEach(function(inp){
      const qty = Number(inp.value) || 0;
      if(qty > 0){
        const item = items[Number(inp.dataset.idx)];
        selection.push({ name: item.name, qty, price: item.price });
      }
    });
    return selection;
  }

  function updateInvoiceTotal(){
    const selection = getInvoiceSelection();
    const total = selection.reduce(function(sum, s){ return sum + s.qty * s.price; }, 0);
    document.getElementById('invoiceTotal').textContent = formatAr(total);
  }

  document.getElementById('generateInvoiceBtn').addEventListener('click', function(){
    if(!window.jspdf){ alert("La bibliothèque PDF n'a pas pu être chargée."); return; }
    const customer = document.getElementById('invoiceCustomer').value.trim() || 'Client';
    const selection = getInvoiceSelection();
    if(!selection.length){ alert('Sélectionnez au moins un article avec une quantité.'); return; }

    // Le client a SA facture (factures-modely.js) : c'est elle qui sort, à
    // la place de la facture standard — les articles dans son tableau, son
    // en-tête inchangé. Elle suit le même chemin : rangée dans « 📄 PDF »,
    // imprimée.
    const modele = window.__factureModely && window.__factureModely.hita(customer);
    if(modele){
      // Sur téléphone, l'onglet d'impression s'ouvre pendant l'appui.
      let onglet = null;
      try { if(window.matchMedia('(pointer: coarse)').matches) onglet = window.open('', '_blank'); } catch(e){}
      const bouton = this;
      bouton.disabled = true;
      window.__factureModely.pdf(modele, articlesFacture(selection)).then(function(blob){
        bouton.disabled = false;
        const nomPdf = modele.anarana.replace(/\.xlsx?$/i, '') + '-' + String(Date.now()).slice(-6) + '.pdf';
        if(window.__pdfTahiry){
          window.__pdfTahiry.imprimer(blob, onglet);
          window.__pdfTahiry.ampio(nomPdf, blob, 'facture').then(function(){ window.__pdfTahiry.sokafy(); });
        }
        pushNotification('facture', 'Facture an\'i ' + customer + ' voatahiry ao amin\'ny PDF, ary nalefa ho amin\'ny impression.');
      }, function(err){
        bouton.disabled = false;
        if(onglet) onglet.close();
        alert('Facture du client : ' + ((err && err.message) || 'erreur'));
      });
      return;
    }

    const invoiceNo = '#' + String(Date.now()).slice(-6);
    const doc = factureStandard(customer, selection, invoiceNo);

    // La facture se range dans « 📄 PDF » (pdf.js), puis sort à l'impression.
    // L'impression part tout de suite, pendant l'appui : un téléphone refuse
    // d'ouvrir l'onglet du PDF s'il vient après une attente.
    const nomPdf = 'facture-' + customer.replace(/\s+/g, '-').toLowerCase() + '-' + invoiceNo.slice(1) + '.pdf';
    const blob = doc.output('blob');
    if(window.__pdfTahiry){
      window.__pdfTahiry.imprimer(blob);
      window.__pdfTahiry.ampio(nomPdf, blob, 'facture').then(function(){
        window.__pdfTahiry.sokafy();
      }, function(){ doc.save(nomPdf); });
    } else {
      doc.save(nomPdf);
    }
    pushNotification('facture', 'Facture ho an\'i ' + customer + ' voatahiry ao amin\'ny PDF, ary nalefa ho amin\'ny impression.');
  });

  // ---- L'aperçu : la facture telle qu'elle sortira, dans la page ----
  // Avec la facture du client s'il en a une, sinon la facture standard. Sans
  // article choisi, deux lignes d'exemple montrent quand même la mise en page.
  //
  // Le brouillon : ce que montre l'aperçu, et ce qui partira. Une erreur
  // dans l'EN-TÊTE s'y corrige — pour la facture standard : société, nom,
  // email, téléphone, NIF, STAT, client, date, numéro ; pour la facture du
  // client : chaque case écrite au-dessus de son tableau. Les articles, eux,
  // ne se touchent pas ici : ils viennent du choix fait plus haut.
  let brouillon = null;

  function apercuFacture(){
    const boite = document.getElementById('invoiceApercu');
    if(!boite || !window.__pdfTahiry || !window.jspdf) return;
    const customer = document.getElementById('invoiceCustomer').value.trim() || 'Client';
    let selection = getInvoiceSelection();
    const exemple = !selection.length;
    if(exemple) selection = [{ name: 'Article exemple 1', qty: 2, price: 15000 }, { name: 'Article exemple 2', qty: 1, price: 40000 }];
    const e = emetteurFacture();
    brouillon = {
      client: customer,
      exemple: exemple,
      date: new Date().toLocaleDateString('fr-FR'),
      numero: '#' + String(Date.now()).slice(-6),
      emetteur: { company: e.company || '', name: e.name || '', email: e.email || '', phone: e.phone || '',
                  nif: e.nif || '', stat: e.stat || '', logo: e.logo || null, auteur: e.auteur || '' },
      corrections: {},
      lignes: selection
    };
    boite.style.display = '';
    dessinerEdition();
    rafraichirApercu();
    boite.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function modeleDuBrouillon(){
    return brouillon && window.__factureModely ? window.__factureModely.hita(brouillon.client) : null;
  }

  // Le PDF du brouillon : dans la facture du client s'il en a une (articles
  // dans son tableau, en-tête corrigé s'il le faut), sinon la standard.
  function pdfDuBrouillon(){
    const modele = modeleDuBrouillon();
    return modele
      ? window.__factureModely.pdf(modele, articlesFacture(brouillon.lignes), brouillon.corrections)
      : Promise.resolve(factureStandard(brouillon.client, brouillon.lignes, brouillon.numero, brouillon.date, brouillon.emetteur).output('blob'));
  }

  let minuterie = null;
  function rafraichirApercu(){
    clearTimeout(minuterie);
    minuterie = setTimeout(function(){
      const pages = document.getElementById('invoiceApercuPages');
      const modele = modeleDuBrouillon();
      document.getElementById('invoiceApercuTitre').textContent = '👁 Aperçu — ' + brouillon.client +
        (modele ? ' (facture du client : ' + modele.anarana + ')' : ' (facture standard)') + (brouillon.exemple ? ' · exemple' : '');
      pdfDuBrouillon().then(function(blob){ return window.__pdfTahiry.dessinerPages(blob, pages); }, function(err){
        pages.innerHTML = '<p style="color:var(--amber); font-size:0.85rem;">' + escapeHtml((err && err.message) || 'erreur') + '</p>';
      });
    }, 350);
  }

  // L'en-tête à corriger, au-dessus de l'aperçu ; les articles en lecture.
  function dessinerEdition(){
    const zone = document.getElementById('invoiceApercuEdit');
    if(!zone) return;
    const modele = modeleDuBrouillon();
    const champ = 'style="width:100%; min-width:0; background:var(--bg); color:var(--text); border:1px solid var(--line); ' +
      'border-radius:6px; padding:0.35rem 0.45rem; font:inherit;"';
    const case_ = function(label, attr, valeur){
      return '<div class="field" style="margin:0;"><label>' + escapeHtml(label) + '</label>' +
        '<input ' + attr + ' ' + champ + ' value="' + escapeHtml(valeur) + '"></div>';
    };
    // Le profil de la facture (celui de « 👤 Mon profil ») : son logo se
    // change ici, pris dans un dossier de l'appareil. L'employé émet au nom
    // de la boutique : il corrige sa facture, pas le profil du patron.
    const profil = function(){
      const logo = brouillon.emetteur.logo;
      return '<div style="display:flex; align-items:center; gap:0.9rem; flex-wrap:wrap; margin-bottom:0.8rem;">' +
        (logo ? '<img src="' + escapeHtml(logo) + '" alt="Logo" style="width:64px; height:64px; border-radius:50%; ' +
                'object-fit:cover; background:var(--panel-2); border:1px solid var(--line);">'
              : '<div style="width:64px; height:64px; border-radius:50%; background:var(--panel-2); border:1px solid var(--line); ' +
                'display:flex; align-items:center; justify-content:center; font-size:1.7rem;">👤</div>') +
        '<div style="display:flex; gap:0.5rem; flex-wrap:wrap;">' +
          '<label class="btn btn-sm" style="width:auto; cursor:pointer; margin:0;">📁 Changer le logo' +
            '<input type="file" accept="image/*" data-logo style="display:none;"></label>' +
          (logo ? '<button type="button" class="btn btn-sm" data-logo-ala style="width:auto;">✕ Sans logo</button>' : '') +
          (MODE_MPIASA ? '' : '<button type="button" class="btn btn-sm" data-profil-tehirizo style="width:auto;">💾 Enregistrer dans mon profil</button>') +
        '</div>' +
      '</div>';
    };
    let total = 0;
    const articles = brouillon.lignes.map(function(l){
      const m = l.qty * l.price;
      total += m;
      return '<tr><td>' + escapeHtml(l.name) + '</td><td style="text-align:right;">' + l.qty + '</td>' +
        '<td style="text-align:right; white-space:nowrap;">' + formatAr(l.price) + '</td>' +
        '<td style="text-align:right; white-space:nowrap;">' + formatAr(m) + '</td></tr>';
    }).join('');

    zone.innerHTML =
      '<details open style="margin-bottom:0.8rem;">' +
        '<summary style="cursor:pointer; font-weight:bold; margin-bottom:0.5rem;">✏️ Corriger l\'en-tête</summary>' +
        (modele ? '' : profil()) +
        '<div data-entete class="form-grid" style="margin-bottom:0.8rem;">' +
          (modele ? '<p style="color:var(--muted); font-size:0.8rem;">Mamaky…</p>'
            : case_('Société', 'data-e="company"', brouillon.emetteur.company) +
              case_('Nom', 'data-e="name"', brouillon.emetteur.name) +
              case_('Email', 'data-e="email"', brouillon.emetteur.email) +
              case_('Téléphone', 'data-e="phone"', brouillon.emetteur.phone) +
              case_('NIF', 'data-e="nif"', brouillon.emetteur.nif) +
              case_('STAT', 'data-e="stat"', brouillon.emetteur.stat) +
              case_('Client', 'data-b="client"', brouillon.client) +
              case_('Date', 'data-b="date"', brouillon.date) +
              case_('N°', 'data-b="numero"', brouillon.numero)) +
        '</div>' +
        '<p style="font-size:0.76rem; color:var(--muted); margin:0 0 0.35rem;">Articles (ils ne changent pas ici) :</p>' +
        '<div style="overflow-x:auto;"><table style="width:100%; font-size:0.8rem;">' +
          '<thead><tr><th>Désignation</th><th style="text-align:right;">Qté</th><th style="text-align:right;">P.U.</th><th style="text-align:right;">Montant</th></tr></thead>' +
          '<tbody>' + articles + '</tbody></table></div>' +
        '<div style="text-align:right; margin-top:0.4rem;"><strong>Total : ' + formatAr(total) + '</strong></div>' +
      '</details>';

    const brancher = function(){
      zone.querySelectorAll('[data-e]').forEach(function(inp){
        inp.addEventListener('input', function(){ brouillon.emetteur[inp.getAttribute('data-e')] = inp.value; rafraichirApercu(); });
      });
      zone.querySelectorAll('[data-b]').forEach(function(inp){
        inp.addEventListener('input', function(){ brouillon[inp.getAttribute('data-b')] = inp.value; rafraichirApercu(); });
      });
      zone.querySelectorAll('[data-fcase]').forEach(function(inp){
        inp.addEventListener('input', function(){ brouillon.corrections[inp.getAttribute('data-fcase')] = inp.value; rafraichirApercu(); });
      });
    };
    if(!modele){ brancher(); brancherProfil(zone); return; }

    // La facture du client : chaque case écrite de son en-tête, telle quelle.
    window.__factureModely.enTete(modele).then(function(cases){
      const boite = zone.querySelector('[data-entete]');
      if(!boite) return;
      // Une case par ligne, en pleine largeur : les textes d'en-tête sont longs.
      boite.className = '';
      boite.style.cssText = 'display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.8rem;';
      boite.innerHTML = cases.length
        ? cases.map(function(c){
            const v = c.adresse in brouillon.corrections ? brouillon.corrections[c.adresse] : c.texte;
            return case_(c.adresse, 'data-fcase="' + escapeHtml(c.adresse) + '"', v);
          }).join('')
        : '<p style="color:var(--muted); font-size:0.8rem;">Tsy misy soratra ao amin\'ny en-tête.</p>';
      brancher();
    }, function(err){
      const boite = zone.querySelector('[data-entete]');
      if(boite) boite.innerHTML = '<p style="color:var(--amber); font-size:0.8rem;">' + escapeHtml((err && err.message) || 'erreur') + '</p>';
    });
  }

  // Le logo, et le bouton qui range l'en-tête corrigé dans « 👤 Mon profil ».
  function brancherProfil(zone){
    const fichier = zone.querySelector('[data-logo]');
    if(fichier) fichier.addEventListener('change', function(){
      const f = fichier.files[0];
      if(!f) return;
      const lecteur = new FileReader();
      lecteur.onload = function(ev){
        shrinkImage(ev.target.result, 320, function(petit){
          brouillon.emetteur.logo = petit;
          dessinerEdition();
          rafraichirApercu();
        });
      };
      lecteur.readAsDataURL(f);
    });
    const ala = zone.querySelector('[data-logo-ala]');
    if(ala) ala.addEventListener('click', function(){
      brouillon.emetteur.logo = null;
      dessinerEdition();
      rafraichirApercu();
    });
    const tehirizo = zone.querySelector('[data-profil-tehirizo]');
    if(tehirizo) tehirizo.addEventListener('click', function(){
      if(!currentUser) return;
      const e = brouillon.emetteur;
      if(!e.name || !e.email){ alert('Le nom et l\'email sont obligatoires.'); return; }
      // Les cases de « 👤 Mon profil » reçoivent l'en-tête, et c'est son
      // propre bouton qui enregistre : un seul chemin vers le compte. Le logo
      // passe par currentUser, que ce bouton garde quand aucun fichier n'est
      // choisi.
      [['profileName', e.name], ['profileCompany', e.company], ['profileEmail', e.email],
       ['profilePhone', e.phone], ['profileNif', e.nif], ['profileStat', e.stat]].forEach(function(p){
        const inp = document.getElementById(p[0]);
        if(inp) inp.value = p[1] || '';
      });
      const logoInp = document.getElementById('profileLogo');
      if(logoInp) logoInp.value = '';
      currentUser.logo = e.logo || null;
      const btn = document.getElementById('saveProfileBtn');
      if(!btn) return;
      btn.click();
      alert('Voatahiry ao amin\'ny « 👤 Mon profil ».');
    });
  }

  // La facture corrigée : rangée dans « 📄 PDF », puis imprimée.
  const apercuPdfBtn = document.getElementById('invoiceApercuPdf');
  if(apercuPdfBtn) apercuPdfBtn.addEventListener('click', function(){
    if(!brouillon) return;
    // Les lignes d'exemple ne sont là que pour voir la mise en page.
    if(brouillon.exemple){ alert('Sélectionnez au moins un article avec une quantité.'); return; }
    let onglet = null;
    try { if(window.matchMedia('(pointer: coarse)').matches) onglet = window.open('', '_blank'); } catch(e){}
    apercuPdfBtn.disabled = true;
    pdfDuBrouillon().then(function(blob){
      apercuPdfBtn.disabled = false;
      const modele = modeleDuBrouillon();
      const nomPdf = (modele ? modele.anarana.replace(/\.xlsx?$/i, '') : 'facture-' + brouillon.client.replace(/\s+/g, '-').toLowerCase()) +
        '-' + String(brouillon.numero).replace(/[^0-9A-Za-z-]/g, '') + '.pdf';
      window.__pdfTahiry.imprimer(blob, onglet);
      window.__pdfTahiry.ampio(nomPdf, blob, 'facture').then(function(){ window.__pdfTahiry.sokafy(); });
      pushNotification('facture', 'Facture ho an\'i ' + brouillon.client + ' voatahiry ao amin\'ny PDF, ary nalefa ho amin\'ny impression.');
    }, function(err){
      apercuPdfBtn.disabled = false;
      if(onglet) onglet.close();
      alert((err && err.message) || 'erreur');
    });
  });
  window.__apercuFacture = apercuFacture;

  // Ce que la facture d'un client reçoit dans son tableau (factures-modely.js).
  function articlesFacture(selection){
    let total = 0;
    const lignes = selection.map(function(s, i){
      const montant = s.qty * s.price;
      total += montant;
      return { n: i + 1, designation: s.name, qte: s.qty, pu: s.price, montant: montant };
    });
    return { total: total, lignes: lignes };
  }
  const apercuBtn = document.getElementById('apercuInvoiceBtn');
  if(apercuBtn) apercuBtn.addEventListener('click', apercuFacture);
  const apercuFermer = document.getElementById('invoiceApercuFermer');
  if(apercuFermer) apercuFermer.addEventListener('click', function(){
    document.getElementById('invoiceApercu').style.display = 'none';
  });

  // La facture standard (sans modèle de client), prête à ranger, imprimer
  // ou montrer en aperçu.
  function factureStandard(customer, selection, invoiceNo, date, emetteurCorrige){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageW = 210;
    const marginX = 14;
    const rightX = pageW - marginX;
    const emetteur = emetteurCorrige || emetteurFacture();
    const emissEmail = emetteur.email || '—';
    const emissName = emetteur.name;
    const emissCompany = emetteur.company;
    const emissPhone = emetteur.phone;
    const emissNif = emetteur.nif;
    const emissStat = emetteur.stat;
    const today = date || new Date().toLocaleDateString('fr-FR');

    // couleurs
    const blueDark = [30, 64, 120];
    const blueMid = [58, 102, 168];
    const rowLight = [232, 239, 248];

    // ---- bandeau d'en-tête bleu ----
    doc.setFillColor(blueDark[0], blueDark[1], blueDark[2]);
    doc.rect(0, 0, pageW, 38, 'F');
    // petit accent triangulaire (effet "vague")
    doc.setFillColor(blueMid[0], blueMid[1], blueMid[2]);
    doc.triangle(0, 38, 60, 38, 0, 20, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('FACTURE', rightX, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Facture N° : ' + invoiceNo, rightX, 27, { align: 'right' });
    doc.text('Date : ' + today, rightX, 32, { align: 'right' });

    if(emetteur.logo){
      try{ doc.addImage(emetteur.logo, marginX, 8, 20, 20); }catch(err){}
    }
    const leftX = emetteur.logo ? marginX + 24 : marginX;
    const nifStatParts = [];
    if(emissNif) nifStatParts.push('NIF : ' + emissNif);
    if(emissStat) nifStatParts.push('STAT : ' + emissStat);
    const headerLines = [];
    // Le nom manquait : seule la société ouvrait l'en-tête, et une facture
    // établie sans société sortait sans dire de qui elle venait. La société
    // reste en tête quand elle existe, le nom la suit ; sinon le nom prend
    // sa place.
    if(emissCompany){
      headerLines.push({ text: emissCompany, bold: true, size: 11 });
      if(emissName && emissName !== emissCompany){
        headerLines.push({ text: emissName, bold: false, size: 9.5 });
      }
    } else if(emissName){
      headerLines.push({ text: emissName, bold: true, size: 11 });
    }
    headerLines.push({ text: emissEmail, bold: false, size: 9.5 });
    if(emissPhone) headerLines.push({ text: emissPhone, bold: false, size: 9 });
    if(nifStatParts.length) headerLines.push({ text: nifStatParts.join('   '), bold: false, size: 8.5 });
    // Faite par un employé : la boutique en tête, et qui l'a établie dessous.
    if(emetteur.auteur) headerLines.push({ text: 'Établie par : ' + emetteur.auteur, bold: false, size: 8.5 });

    let ly = 14;
    headerLines.forEach(function(line){
      doc.setFont(undefined, line.bold ? 'bold' : 'normal');
      doc.setFontSize(line.size);
      doc.text(line.text, leftX, ly);
      ly += line.bold ? 6.5 : 5;
    });

    // ---- bloc "Facturé à" ----
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('FACTURÉ À :', marginX, 50);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(customer, marginX, 57);

    // ---- tableau des articles ----
    let y = 70;
    doc.setFillColor(blueDark[0], blueDark[1], blueDark[2]);
    doc.rect(marginX, y, rightX - marginX, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('N°', marginX + 3, y + 6);
    doc.text('DÉSIGNATION', marginX + 15, y + 6);
    doc.text('P.U.', 128, y + 6);
    doc.text('QTÉ', 152, y + 6);
    doc.text('TOTAL', rightX - 3, y + 6, { align: 'right' });
    y += 9;

    let total = 0;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9.5);
    selection.forEach(function(s, i){
      const subtotal = s.qty * s.price;
      total += subtotal;
      const rowH = 9;
      if(i % 2 === 0){
        doc.setFillColor(rowLight[0], rowLight[1], rowLight[2]);
        doc.rect(marginX, y, rightX - marginX, rowH, 'F');
      }
      doc.setTextColor(30, 30, 30);
      doc.text(String(i + 1).padStart(2, '0'), marginX + 3, y + 6);
      doc.text(String(s.name), marginX + 15, y + 6);
      doc.text(formatAr(s.price), 128, y + 6);
      doc.text(String(s.qty), 152, y + 6);
      doc.text(formatAr(subtotal), rightX - 3, y + 6, { align: 'right' });
      y += rowH;
    });

    y += 6;
    // ---- totaux ----
    const boxX = 128;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9.5);
    doc.text('Sous-total', boxX, y);
    doc.text(formatAr(total), rightX - 3, y, { align: 'right' });
    y += 9;

    doc.setFillColor(blueDark[0], blueDark[1], blueDark[2]);
    doc.rect(boxX - 4, y - 6, rightX - (boxX - 4), 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', boxX, y + 1);
    doc.text(formatAr(total), rightX - 3, y + 1, { align: 'right' });

    // ---- signature & remerciement ----
    y += 40;
    doc.setDrawColor(150, 150, 150);
    doc.line(rightX - 55, y, rightX, y);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text('Signature', rightX - 27, y + 6, { align: 'center' });

    // ---- bandeau de bas de page ----
    doc.setFillColor(blueDark[0], blueDark[1], blueDark[2]);
    doc.rect(0, 282, pageW, 15, 'F');
    doc.setFillColor(blueMid[0], blueMid[1], blueMid[2]);
    doc.triangle(pageW, 282, pageW - 55, 297, pageW, 297, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('MERCI POUR VOTRE CONFIANCE', marginX, 291);
    return doc;
  }

  document.getElementById('mailInvoiceBtn').addEventListener('click', function(){
    const customer = document.getElementById('invoiceCustomer').value.trim() || 'Client';
    const customerEmail = document.getElementById('invoiceCustomerEmail').value.trim();
    const selection = getInvoiceSelection();
    if(!selection.length){ alert('Sélectionnez au moins un article avec une quantité.'); return; }

    let total = 0;
    let lines = '';
    selection.forEach(function(s){
      const subtotal = s.qty * s.price;
      total += subtotal;
      lines += '- ' + s.name + ' x' + s.qty + ' : ' + formatAr(subtotal) + '\n';
    });

    const e = emetteurFacture();
    const subject = encodeURIComponent('Facture');
    const body = encodeURIComponent(
      'Bonjour ' + customer + ',\n\n' +
      'Voici le détail de votre facture :\n\n' +
      lines +
      '\nTotal : ' + formatAr(total) + '\n' +
      'Date : ' + new Date().toLocaleDateString('fr-FR') + '\n\n' +
      'Merci de votre confiance.\n\n' +
      // Même signature que sur le PDF : le nom y manquait aussi.
      (e.company ? e.company + '\n' : '') +
      (e.name && e.name !== e.company ? e.name + '\n' : '') +
      (e.email ? e.email : '') +
      (e.phone ? '\n' + e.phone : '') +
      (e.nif ? '\nNIF : ' + e.nif : '') +
      (e.stat ? '\nSTAT : ' + e.stat : '') +
      (e.auteur ? '\n\nÉtablie par : ' + e.auteur : '')
    );
    window.location.href = 'mailto:' + customerEmail + '?subject=' + subject + '&body=' + body;
    pushNotification('facture', 'Facture ho an\'i ' + customer + ' efa lasa (nalefa amin\'ny mail).');
  });


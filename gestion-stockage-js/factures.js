  // ---------------- FACTURES ----------------
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

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageW = 210;
    const marginX = 14;
    const rightX = pageW - marginX;
    const emissEmail = currentUser && currentUser.email ? currentUser.email : '—';
    const emissCompany = currentUser && currentUser.company ? currentUser.company : '';
    const emissPhone = currentUser && currentUser.phone ? currentUser.phone : '';
    const emissNif = currentUser && currentUser.nif ? currentUser.nif : '';
    const emissStat = currentUser && currentUser.stat ? currentUser.stat : '';
    const invoiceNo = '#' + String(Date.now()).slice(-6);
    const today = new Date().toLocaleDateString('fr-FR');

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

    if(currentUser && currentUser.logo){
      try{ doc.addImage(currentUser.logo, marginX, 8, 20, 20); }catch(err){}
    }
    const leftX = currentUser && currentUser.logo ? marginX + 24 : marginX;
    const nifStatParts = [];
    if(emissNif) nifStatParts.push('NIF : ' + emissNif);
    if(emissStat) nifStatParts.push('STAT : ' + emissStat);
    const headerLines = [];
    if(emissCompany) headerLines.push({ text: emissCompany, bold: true, size: 11 });
    headerLines.push({ text: emissEmail, bold: false, size: 9.5 });
    if(emissPhone) headerLines.push({ text: emissPhone, bold: false, size: 9 });
    if(nifStatParts.length) headerLines.push({ text: nifStatParts.join('   '), bold: false, size: 8.5 });

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

    doc.save('facture-' + customer.replace(/\s+/g, '-').toLowerCase() + '.pdf');
    pushNotification('facture', 'Facture ho an\'i ' + customer + ' efa lasa (téléchargée).');
  });

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

    const subject = encodeURIComponent('Facture');
    const body = encodeURIComponent(
      'Bonjour ' + customer + ',\n\n' +
      'Voici le détail de votre facture :\n\n' +
      lines +
      '\nTotal : ' + formatAr(total) + '\n' +
      'Date : ' + new Date().toLocaleDateString('fr-FR') + '\n\n' +
      'Merci de votre confiance.\n\n' +
      (currentUser && currentUser.company ? currentUser.company + '\n' : '') +
      (currentUser && currentUser.email ? currentUser.email : '') +
      (currentUser && currentUser.phone ? '\n' + currentUser.phone : '') +
      (currentUser && currentUser.nif ? '\nNIF : ' + currentUser.nif : '') +
      (currentUser && currentUser.stat ? '\nSTAT : ' + currentUser.stat : '')
    );
    window.location.href = 'mailto:' + customerEmail + '?subject=' + subject + '&body=' + body;
    pushNotification('facture', 'Facture ho an\'i ' + customer + ' efa lasa (nalefa amin\'ny mail).');
  });


  // ---------------- SÉCURITÉ & ESPACE ADMIN ----------------
  // Deux situations sont surveillées :
  //  - « compte n°2 » : quelqu'un ouvre un second compte sous le nom ou le
  //    numéro d'un client existant, avec un autre email, pour se faire passer
  //    pour lui ;
  //  - entrée forcée : codes erronés à répétition sur un compte.
  // Dans les deux cas le compte fautif est bloqué aussitôt, le propriétaire et
  // le client concerné sont prévenus, et le blocage se lève depuis l'espace
  // admin. Le client dispose de 2 jours pour se manifester.
  const FAILED_ATTEMPTS_KEY = 'stockmanager_failed_attempts';
  const FAILED_WINDOW_MS = 15 * 60 * 1000;
  const FAILED_MAX = 5;
  const ALERT_GRACE_DAYS = 2;

  function loadFailedAttempts(){
    try { return JSON.parse(localStorage.getItem(FAILED_ATTEMPTS_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveFailedAttempts(map){
    try { localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(map)); } catch(e){}
  }
  function clearFailedAttempts(email){
    const map = loadFailedAttempts();
    delete map[normEmail(email)];
    saveFailedAttempts(map);
  }

  function recordSecurityEvent(row){
    if(!window.__sb) return Promise.resolve();
    return new Promise(function(resolve){
      window.__sb.from('security_events').insert(row).then(function(){ resolve(); }, function(){ resolve(); });
    });
  }

  function blockAccount(email, reason){
    const key = normEmail(email);
    if(!key || !window.__sb) return Promise.resolve();
    return new Promise(function(resolve){
      window.__sb.from('blocked_accounts').upsert({
        email: key, reason: reason, blocked_at: new Date().toISOString(),
        released_at: null, active: true
      }).then(function(){ resolve(); }, function(){ resolve(); });
    });
  }

  function isAccountBlocked(email){
    const key = normEmail(email);
    if(!key || !window.__sb) return Promise.resolve(null);
    return new Promise(function(resolve){
      window.__sb.from('blocked_accounts')
        .select('email,reason,blocked_at,active')
        .eq('email', key)
        .eq('active', true)
        .limit(1)
        .then(function(res){
          const row = res && res.data && res.data[0];
          resolve(row || null);
        }, function(){ resolve(null); });
    });
  }

  function releaseAccount(email){
    if(!window.__sb) return Promise.resolve();
    return new Promise(function(resolve){
      window.__sb.from('blocked_accounts')
        .update({ active: false, released_at: new Date().toISOString() })
        .eq('email', normEmail(email))
        .then(function(){ resolve(); }, function(){ resolve(); });
    });
  }

  // Codes erronés à répétition : entrée forcée.
  function noteFailedAttempt(email){
    const key = normEmail(email);
    if(!key) return;
    const map = loadFailedAttempts();
    const now = Date.now();
    const entry = map[key] && (now - map[key].first) < FAILED_WINDOW_MS
      ? map[key]
      : { first: now, count: 0 };
    entry.count += 1;
    entry.last = now;
    map[key] = entry;
    saveFailedAttempts(map);
    if(entry.count < FAILED_MAX) return;

    const owner = (typeof isOwnerEmail === 'function') && isOwnerEmail(key);
    map[key] = { first: now, count: 0 };
    saveFailedAttempts(map);
    recordSecurityEvent({
      kind: 'brute_force',
      target: owner ? 'admin' : 'client',
      email: key,
      detail: FAILED_MAX + ' codes erronés en moins de 15 minutes',
      blocked: !owner
    });
    pushNotification('info', 'Alerte sécurité : ' + FAILED_MAX + ' codes erronés sur ' + key + '.');
    // le compte du propriétaire n'est jamais bloqué : il garde son code de
    // secours sur son appareil, et un blocage l'enfermerait dehors.
    if(!owner) blockAccount(key, 'Entrées forcées répétées');
  }

  // « Compte n°2 » : même nom ou même numéro, email différent.
  function checkDuplicateIdentity(name, email, phone){
    if(!window.__sb) return Promise.resolve(false);
    const key = normEmail(email);
    const cleanName = (name || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/[^\d]/g, '');
    return new Promise(function(resolve){
      window.__sb.from('client_signups')
        .select('name,email,phone')
        .limit(500)
        .then(function(res){
          const rows = (res && res.data) ? res.data : [];
          const clash = rows.find(function(r){
            if(normEmail(r.email) === key) return false;          // c'est lui-même
            const sameName = cleanName && (r.name || '').trim().toLowerCase() === cleanName;
            const samePhone = cleanPhone && (r.phone || '').replace(/[^\d]/g, '') === cleanPhone;
            return sameName || samePhone;
          });
          if(!clash){ resolve(false); return; }
          recordSecurityEvent({
            kind: 'duplicate_identity',
            target: 'client',
            email: key,
            name: name,
            phone: phone,
            detail: 'Second compte ouvert sous l\'identité de ' + (clash.name || clash.email) +
                    ' (' + clash.email + ')',
            blocked: true
          });
          blockAccount(key, 'Second compte ouvert sous l\'identité d\'un autre client');
          pushNotification('info', 'Alerte sécurité : un second compte a été ouvert sous l\'identité de ' +
            (clash.name || clash.email) + '. Il est bloqué.');
          resolve({ clash: clash });
        }, function(){ resolve(false); });
    });
  }

  // Message que le propriétaire envoie au client concerné (2 jours de délai).
  function securityAlertMail(email, reason){
    const body = [
      'Bonjour,',
      '',
      'Une tentative suspecte a été détectée sur le compte ' + email +
      ' de Gestion de Stockage :',
      reason || '—',
      '',
      'Par précaution, l\'accès a été bloqué.',
      'Vous disposez de ' + ALERT_GRACE_DAYS + ' jours pour me contacter afin de le rétablir.',
      '',
      OWNER_NAME + ' — ' + OWNER_EMAIL
    ].join('\n');
    return 'mailto:' + email +
      '?subject=' + encodeURIComponent('Alerte sécurité — Gestion de Stockage') +
      '&body=' + encodeURIComponent(body);
  }

  // ---------------- RENDU DE L'ESPACE ADMIN ----------------
  function adminEscape(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  function adminDate(value){
    return value ? new Date(value).toLocaleString('fr-FR') : '—';
  }
  function alertKindLabel(kind){
    if(kind === 'duplicate_identity') return 'Second compte sous une identité existante';
    if(kind === 'brute_force') return 'Entrées forcées (codes erronés)';
    if(kind === 'unknown_device') return 'Appareil inconnu';
    return kind || '—';
  }

  function renderAdminSpace(){
    if(!document.getElementById('section-admin')) return;
    if(!window.__sb){
      ['adminClientsEmpty','adminMoneyEmpty','adminUnlocksEmpty','adminClientAlertsEmpty','adminOwnerAlertsEmpty','adminBlockedEmpty']
        .forEach(function(id){
          const el = document.getElementById(id);
          if(el){ el.style.display = 'block'; el.textContent = 'Serveur injoignable.'; }
        });
      return;
    }

    // 1) clients inscrits
    window.__sb.from('client_signups').select('id,name,email,phone,created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        const body = document.getElementById('adminClientsBody');
        const empty = document.getElementById('adminClientsEmpty');
        document.getElementById('adminKpiClients').textContent = rows.length;
        if(!body) return;
        body.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function(r){
          const tr = document.createElement('tr');
          tr.innerHTML = '<td>' + adminDate(r.created_at) + '</td><td>' + adminEscape(r.name) +
            '</td><td>' + adminEscape(r.email) + '</td><td>' + adminEscape(r.phone || '—') + '</td>';
          body.appendChild(tr);
        });
      }, function(){});

    // 2) argent déclaré + 3) déblocages
    window.__sb.from('unlock_requests')
      .select('id,name,email,phone,amount,paypal_reference,status,created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        const money = document.getElementById('adminMoneyBody');
        const moneyEmpty = document.getElementById('adminMoneyEmpty');
        const paid = rows.filter(function(r){ return r.status === 'confirmed' || r.status === 'used'; });
        const total = paid.reduce(function(sum, r){ return sum + (Number(r.amount) || 0); }, 0);
        document.getElementById('adminKpiMoney').textContent = total.toLocaleString('fr-FR') + ' Ar';
        document.getElementById('adminKpiUnlocks').textContent = rows.length;

        if(money){
          money.innerHTML = '';
          if(moneyEmpty) moneyEmpty.style.display = rows.length ? 'none' : 'block';
          rows.forEach(function(r){
            const etat = r.status === 'pending' ? 'À vérifier'
              : (r.status === 'confirmed' ? 'Confirmé' : 'Utilisé');
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + adminDate(r.created_at) + '</td><td>' + adminEscape(r.name) +
              '</td><td>' + (Number(r.amount) || 0).toLocaleString('fr-FR') + ' Ar</td><td>' +
              adminEscape(r.paypal_reference || '—') + '</td><td>' + etat + '</td>';
            money.appendChild(tr);
          });
        }

        const list = document.getElementById('adminUnlocksList');
        const listEmpty = document.getElementById('adminUnlocksEmpty');
        if(list){
          list.innerHTML = '';
          if(listEmpty) listEmpty.style.display = rows.length ? 'none' : 'block';
          rows.forEach(function(r){
            const div = document.createElement('div');
            div.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.7rem 0.9rem; margin-bottom:0.6rem; font-size:0.78rem; color:var(--muted); line-height:1.6;';
            div.innerHTML = '<strong style="color:var(--text);">' + adminEscape(r.name) + '</strong> — ' +
              adminEscape(r.email) + '<br>' + adminDate(r.created_at) + ' · ' +
              (Number(r.amount) || 0).toLocaleString('fr-FR') + ' Ar · réf. ' +
              adminEscape(r.paypal_reference || '—') + ' · ' + adminEscape(r.status);
            list.appendChild(div);
          });
        }
      }, function(){});

    // 4) et 5) alertes de sécurité
    window.__sb.from('security_events')
      .select('id,kind,target,email,name,detail,blocked,created_at')
      .order('created_at', { ascending: false }).limit(100)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        document.getElementById('adminKpiAlerts').textContent = rows.length;

        const clientRows = rows.filter(function(r){ return r.target !== 'admin'; });
        const ownerRows = rows.filter(function(r){ return r.target === 'admin'; });

        const cBody = document.getElementById('adminClientAlertsBody');
        const cEmpty = document.getElementById('adminClientAlertsEmpty');
        if(cBody){
          cBody.innerHTML = '';
          if(cEmpty) cEmpty.style.display = clientRows.length ? 'none' : 'block';
          clientRows.forEach(function(r){
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + adminDate(r.created_at) + '</td><td>' + alertKindLabel(r.kind) +
              '</td><td>' + adminEscape(r.email || '—') + '</td><td>' + adminEscape(r.detail || '—') +
              '</td><td>' + (r.blocked ? 'Bloqué' : 'Signalé') + '</td>';
            cBody.appendChild(tr);
          });
        }

        const oBody = document.getElementById('adminOwnerAlertsBody');
        const oEmpty = document.getElementById('adminOwnerAlertsEmpty');
        if(oBody){
          oBody.innerHTML = '';
          if(oEmpty) oEmpty.style.display = ownerRows.length ? 'none' : 'block';
          ownerRows.forEach(function(r){
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + adminDate(r.created_at) + '</td><td>' + alertKindLabel(r.kind) +
              '</td><td>' + adminEscape(r.detail || '—') + '</td><td>' +
              (r.blocked ? 'Bloqué' : 'Signalé') + '</td>';
            oBody.appendChild(tr);
          });
        }
      }, function(){});

    // 6) comptes bloqués
    window.__sb.from('blocked_accounts')
      .select('email,reason,blocked_at,active')
      .eq('active', true)
      .limit(100)
      .then(function(res){
        const rows = (res && res.data) ? res.data : [];
        const list = document.getElementById('adminBlockedList');
        const empty = document.getElementById('adminBlockedEmpty');
        if(!list) return;
        list.innerHTML = '';
        if(empty) empty.style.display = rows.length ? 'none' : 'block';
        rows.forEach(function(r){
          const card = document.createElement('div');
          card.style.cssText = 'border:1px solid var(--line); border-radius:8px; padding:0.8rem 0.9rem; margin-bottom:0.7rem; background:var(--panel-2);';
          card.innerHTML = '<div style="font-size:0.84rem; color:var(--text);"><strong>' +
            adminEscape(r.email) + '</strong></div>' +
            '<div style="font-size:0.76rem; color:var(--muted); line-height:1.6; margin-top:0.3rem;">' +
            adminEscape(r.reason || '—') + '<br>Bloqué le ' + adminDate(r.blocked_at) + '</div>';

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.7rem;';

          const mail = document.createElement('a');
          mail.className = 'btn btn-sm';
          mail.style.cssText = 'width:auto; text-decoration:none; display:inline-block;';
          mail.textContent = '✉️ Prévenir (délai ' + ALERT_GRACE_DAYS + ' jours)';
          mail.href = securityAlertMail(r.email, r.reason);
          actions.appendChild(mail);

          const release = document.createElement('button');
          release.type = 'button';
          release.className = 'btn btn-primary btn-sm';
          release.style.width = 'auto';
          release.textContent = '🔓 Lever le blocage';
          release.addEventListener('click', function(){
            release.disabled = true;
            releaseAccount(r.email).then(function(){
              pushNotification('info', 'Blocage levé pour ' + r.email + '.');
              renderAdminSpace();
            });
          });
          actions.appendChild(release);

          card.appendChild(actions);
          list.appendChild(card);
        });
      }, function(){});
  }

  const refreshAdminBtn = document.getElementById('refreshAdminBtn');
  if(refreshAdminBtn) refreshAdminBtn.addEventListener('click', renderAdminSpace);

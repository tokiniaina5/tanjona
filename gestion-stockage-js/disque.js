// Disque : une copie des registres du Fokontany sur l'ordinateur.
//
// On choisit un dossier une fois (⚙️ Fikirana). Ensuite, chaque
// enregistrement, correction ou suppression dans Supabase (livre de famille,
// ses membres, taratasy, adidy, fandoavana) réécrit le registre entier dans ce
// dossier : <table>.json pour garder, <table>.csv pour Excel. Le fichier suit
// donc toujours la base, sans rien à recoller.
//
// Le dossier passe par l'API File System Access (Chrome, Edge). Son accès est
// gardé dans IndexedDB ; après un rechargement, le navigateur redemande la
// permission au premier clic. Ailleurs (Firefox, Safari, téléphone), le même
// registre se télécharge à chaque enregistrement, si on l'a demandé.

(function () {
  if (!document.getElementById('fkDisque')) return;

  function $(id) { return document.getElementById(id); }

  var TABLES = ['fianakaviana', 'fianakaviana_mpikambana', 'taratasy', 'adidy', 'adidy_fandoavana'];
  var ANARANA = {
    fianakaviana: 'Boky fianakaviana',
    fianakaviana_mpikambana: 'Mpikambana',
    taratasy: 'Taratasy',
    adidy: 'Adidy',
    adidy_fandoavana: 'Fandoavana adidy'
  };
  var CLE_TELECHARGER = 'stockmanager_disque_telecharger';
  var aFichiers = typeof window.showDirectoryPicker === 'function';
  var dossier = null;       // FileSystemDirectoryHandle
  var permisDemande = false;
  var attente = {};

  function monEmail() {
    var u = (typeof currentUser !== 'undefined') ? currentUser : null;
    return (u && u.email) ? String(u.email).trim().toLowerCase() : '';
  }
  function dire(texte, erreur) {
    var st = $('fkDisqueStatus');
    if (!st) return;
    st.textContent = texte || '';
    st.style.color = erreur ? 'var(--red)' : 'var(--muted)';
  }

  // ---------- Le dossier, gardé d'une visite à l'autre ----------
  function base() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('nyasako-disque', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('dossier'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function garder(valeur) {
    return base().then(function (db) {
      return new Promise(function (ok) {
        var tx = db.transaction('dossier', 'readwrite');
        if (valeur) tx.objectStore('dossier').put(valeur, 'fokontany');
        else tx.objectStore('dossier').delete('fokontany');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ok(); };
      });
    }).catch(function () {});
  }
  function relire() {
    return base().then(function (db) {
      return new Promise(function (ok) {
        var r = db.transaction('dossier').objectStore('dossier').get('fokontany');
        r.onsuccess = function () { ok(r.result || null); };
        r.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }
  function permis(demander) {
    if (!dossier) return Promise.resolve(false);
    var mode = { mode: 'readwrite' };
    return dossier.queryPermission(mode).then(function (p) {
      if (p === 'granted') return true;
      if (!demander) return false;
      return dossier.requestPermission(mode).then(function (q) { return q === 'granted'; });
    }).catch(function () { return false; });
  }

  // ---------- Ce qui s'écrit ----------
  function enCsv(lignes) {
    if (!lignes.length) return '';
    var cols = [];
    lignes.forEach(function (l) {
      Object.keys(l).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
    });
    function cell(v) {
      if (v == null) return '';
      var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    // Point-virgule et BOM : Excel en français l'ouvre en colonnes, accents compris.
    return '﻿' + [cols.join(';')].concat(lignes.map(function (l) {
      return cols.map(function (c) { return cell(l[c]); }).join(';');
    })).join('\r\n');
  }
  function lireTable(table) {
    var sb = window.__sb, email = monEmail();
    if (!sb || !email) return Promise.reject(new Error('tsy tafiditra'));
    return sb.from(table).select('*').eq('owner_email', email).then(function (r) {
      if (r.error) throw r.error;
      return r.data || [];
    });
  }
  function ecrireFichier(nom, contenu) {
    return dossier.getFileHandle(nom, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(contenu).then(function () { return w.close(); });
    });
  }
  function telecharger(nom, contenu, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type: type }));
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function telechargerActif() {
    try { return localStorage.getItem(CLE_TELECHARGER) === '1'; } catch (e) { return false; }
  }

  function sauver(table, versDossier) {
    return lireTable(table).then(function (lignes) {
      var json = JSON.stringify(lignes, null, 2);
      var csv = enCsv(lignes);
      if (versDossier) {
        return ecrireFichier(table + '.json', json).then(function () {
          return ecrireFichier(table + '.csv', csv);
        }).then(function () { return lignes.length; });
      }
      telecharger(table + '.json', json, 'application/json');
      return lignes.length;
    });
  }

  // Après un enregistrement : on attend que les écritures groupées soient
  // passées, puis on réécrit le registre.
  function planifier(table) {
    if (!dossier && !telechargerActif()) return;
    clearTimeout(attente[table]);
    attente[table] = setTimeout(function () {
      var versDossier = !!dossier;
      (versDossier ? permis(false) : Promise.resolve(true)).then(function (ok) {
        if (!ok) {
          dire('Tsy voasoratra tao amin\'ny disque : tsindrio « 💾 Tehirizo daholo » hamela azy indray.', true);
          return;
        }
        return sauver(table, versDossier).then(function (n) {
          dire('✓ ' + ANARANA[table] + ' voasoratra tao amin\'ny disque (' + n + ') — ' +
            new Date().toLocaleTimeString('fr-FR'));
        });
      }).catch(function (e) {
        dire('Tsy voasoratra tao amin\'ny disque : ' + ((e && e.message) || e), true);
      });
    }, 900);
  }

  // ---------- Chaque écriture dans Supabase ----------
  // from(table).insert/update/upsert/delete rend un constructeur dont les
  // filtres (eq, select…) renvoient le même objet : son then suffit.
  function brancher(sb) {
    if (!sb || sb.__disque) return;
    sb.__disque = true;
    var from = sb.from.bind(sb);
    sb.from = function (table) {
      var q = from(table);
      if (TABLES.indexOf(table) < 0) return q;
      ['insert', 'update', 'upsert', 'delete'].forEach(function (m) {
        if (typeof q[m] !== 'function') return;
        var orig = q[m];
        q[m] = function () {
          var b = orig.apply(q, arguments);
          var then = b.then;
          b.then = function (ok, ko) {
            return then.call(this, function (res) {
              if (res && !res.error) planifier(table);
              return ok ? ok(res) : res;
            }, ko);
          };
          return b;
        };
      });
      return q;
    };
  }
  brancher(window.__sb);

  // ---------- ⚙️ Fikirana ----------
  function afficher() {
    var choisir = $('fkDisqueChoisir'), tout = $('fkDisqueTout'), esory = $('fkDisqueEsory');
    var auto = $('fkDisqueAuto'), nom = $('fkDisqueNom');
    if (aFichiers) {
      choisir.textContent = dossier ? '📁 Hanova dossier' : '📁 Misafidy dossier';
      nom.textContent = dossier ? 'Dossier : ' + dossier.name : 'Mbola tsy misy dossier voafidy.';
      tout.style.display = dossier ? '' : 'none';
      esory.style.display = dossier ? '' : 'none';
      auto.parentNode.style.display = 'none';
    } else {
      choisir.style.display = 'none';
      esory.style.display = 'none';
      tout.style.display = '';
      tout.textContent = '⬇️ Alaivo daholo';
      auto.parentNode.style.display = 'flex';
      nom.textContent = 'Tsy mahay misafidy dossier ity navigateur ity (ampiasao Chrome na Edge) : midina ao amin\'ny Téléchargements ny rakitra.';
      auto.checked = telechargerActif();
    }
  }

  $('fkDisqueChoisir').addEventListener('click', function () {
    window.showDirectoryPicker({ id: 'fokontany', mode: 'readwrite' }).then(function (h) {
      dossier = h;
      return garder(h);
    }).then(function () {
      afficher();
      dire('Voafidy ny dossier : soratana ao daholo izao…');
      return toutSauver();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      dire('Tsy voafidy ny dossier : ' + ((e && e.message) || e), true);
    });
  });

  function toutSauver() {
    var versDossier = !!dossier;
    return (versDossier ? permis(true) : Promise.resolve(true)).then(function (ok) {
      if (!ok) { dire('Tsy navela hanoratra ao amin\'ny dossier.', true); return; }
      dire('Manoratra…');
      var total = 0;
      return TABLES.reduce(function (p, t) {
        return p.then(function () { return sauver(t, versDossier).then(function (n) { total += n; }); });
      }, Promise.resolve()).then(function () {
        dire('✓ Voasoratra daholo (' + total + ' andalana) — ' + new Date().toLocaleTimeString('fr-FR'));
      });
    }).catch(function (e) {
      dire('Tsy voasoratra : ' + ((e && e.message) || e), true);
    });
  }
  $('fkDisqueTout').addEventListener('click', toutSauver);

  $('fkDisqueEsory').addEventListener('click', function () {
    dossier = null;
    garder(null);
    afficher();
    dire('Tsy misy dossier intsony : tsy voasoratra ao amin\'ny disque ny fitehirizana.');
  });

  $('fkDisqueAuto').addEventListener('change', function () {
    try { localStorage.setItem(CLE_TELECHARGER, this.checked ? '1' : '0'); } catch (e) {}
  });

  // Après un rechargement, le navigateur ne rend l'accès qu'à un geste : le
  // premier « Tehirizo » (ou tout bouton principal) le redemande.
  document.addEventListener('click', function (e) {
    if (!dossier || permisDemande) return;
    var b = e.target.closest && e.target.closest('button');
    if (!b || !(b.classList.contains('btn-primary') || b.textContent.indexOf('💾') >= 0)) return;
    // Pendant le clic même : hors d'un geste, la demande est refusée. Déjà
    // accordée, elle répond oui sans rien montrer.
    permisDemande = true;
    dossier.requestPermission({ mode: 'readwrite' }).catch(function () {});
  }, true);

  if (aFichiers) {
    relire().then(function (h) {
      dossier = h;
      afficher();
    });
  } else {
    afficher();
  }
})();

  // ---------------- IDENTITÉ & PRÉSENCE TEMPS RÉEL (appels + live) ----------------
  const ICE_SERVERS = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ] };

  function myIdentity(){
    const email = (currentUser && currentUser.email) ? currentUser.email.trim().toLowerCase() : 'invite-' + Math.random().toString(36).slice(2);
    const name = (currentUser && currentUser.name) || 'Utilisateur';
    const isAdmin = !!(currentUser && currentUser.email && currentUser.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase());
    return { email: email, name: name, isAdmin: isAdmin };
  }

  let presenceChannel = null;
  let presenceState = {};

  // ---------------- FAMPANDRENESANA AN'NY NAVIGATEUR (système) ----------------
  // Mba ho tonga any amin'ny olona ny vaovao na dia tsy eo amin'ny onglet aza izy,
  // ka hidirany hijery ny Live. Ny navigateur dia mitaky tsindry an-tanana alohan'ny
  // hangatahana alalana : ny tsindry voalohany ataon'ny mpampiasa no ampiasaina.
  function ensureNotificationPermission(){
    if(!('Notification' in window)) return;
    if(Notification.permission !== 'default') return;
    try { Notification.requestPermission(); } catch(e){}
  }

  function askNotificationPermissionOnFirstClick(){
    if(!('Notification' in window) || Notification.permission !== 'default') return;
    document.addEventListener('click', function once(){
      document.removeEventListener('click', once);
      ensureNotificationPermission();
    });
  }

  // Fampandrenesana ivelan'ny onglet. Tsindriana azy dia miverina eto ny olona
  // ary tanterahina ny asa (miditra amin'ny Live, na mamaly antso).
  function showSystemNotification(title, body, tag, onClick){
    if(!('Notification' in window) || Notification.permission !== 'granted') return null;
    try {
      const n = new Notification(title, { body: body, tag: tag, lang: 'mg' });
      n.onclick = function(){
        try { window.focus(); } catch(e){}
        n.close();
        if(onClick) onClick();
      };
      return n;
    } catch(e){
      // Amin'ny Chrome finday dia ilaina ny Service Worker : tsy mahavaky ny appli.
      return null;
    }
  }

  // Feo fohy manaitra rehefa misy Live manomboka (tsy toy ny ringtone miverimberina).
  function playLiveChime(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach(function(freq, i){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.12;
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.16);
      });
      setTimeout(function(){ try{ ctx.close(); }catch(e){} }, 900);
    }catch(e){}
  }

  function initPresence(){
    if(!window.__sb || presenceChannel) return;
    askNotificationPermissionOnFirstClick();
    const me = myIdentity();
    presenceChannel = window.__sb.channel('presence-tanjona', { config: { presence: { key: me.email } } });
    presenceChannel.on('presence', { event: 'sync' }, function(){
      const state = presenceChannel.presenceState();
      presenceState = {};
      Object.keys(state).forEach(function(key){
        if(state[key] && state[key][0]) presenceState[key] = state[key][0];
      });
      renderOnlineClientsForCall();
      renderLiveList();
      updateLiveReachInfo();
      veillerSurLesLives();
      if(typeof updateOwnerPresenceLabel === 'function') updateOwnerPresenceLabel();
    });
    presenceChannel.subscribe(function(status){
      if(status === 'SUBSCRIBED'){
        presenceChannel.track({ name: me.name, isAdmin: me.isAdmin, live: false, at: Date.now() });
      }
    });
  }

  function updateMyPresence(patch){
    if(!presenceChannel) return;
    const me = myIdentity();
    const current = presenceState[me.email] || { name: me.name, isAdmin: me.isAdmin, live: false };
    presenceChannel.track(Object.assign({}, current, patch, { at: Date.now() }));
  }

  function renderOnlineClientsForCall(){
    const list = document.getElementById('onlineUsersList');
    const emptyHint = document.getElementById('onlineUsersEmpty');
    if(!list) return;
    const me = myIdentity();
    list.innerHTML = '';
    const others = Object.keys(presenceState).filter(function(email){ return email !== me.email; });
    emptyHint.style.display = others.length ? 'none' : 'block';
    others.forEach(function(email){
      const p = presenceState[email];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0; border-bottom:1px solid var(--line);';
      row.innerHTML =
        '<div><strong style="font-size:0.85rem;">' + escapeHtml(p.name || email) + '</strong>' +
        (p.isAdmin ? ' <span style="font-size:0.68rem; color:var(--cyan);">(Admin)</span>' : '') +
        (p.live ? ' <span style="font-size:0.68rem; color:var(--red);">🔴 Live</span>' : '') + '</div>' +
        '<div style="display:flex; gap:0.4rem;">' +
          '<button type="button" class="btn btn-sm call-audio-btn" title="Antso feo" data-email="' + escapeHtml(email) + '" data-name="' + escapeHtml(p.name || email) + '">📞</button>' +
          '<button type="button" class="btn btn-sm call-video-btn" title="Antso video" data-email="' + escapeHtml(email) + '" data-name="' + escapeHtml(p.name || email) + '">📹</button>' +
        '</div>';
      list.appendChild(row);
    });
    list.querySelectorAll('.call-audio-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ startCall(btn.getAttribute('data-email'), btn.getAttribute('data-name'), 'audio'); });
    });
    list.querySelectorAll('.call-video-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ startCall(btn.getAttribute('data-email'), btn.getAttribute('data-name'), 'video'); });
    });
  }

  // ---------------- SONNERIE ----------------
  let ringtoneInterval = null, ringtoneCtx = null;
  function playRingtone(){
    stopRingtone();
    try{
      ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
      function beep(){
        if(!ringtoneCtx) return;
        const osc = ringtoneCtx.createOscillator();
        const gain = ringtoneCtx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(ringtoneCtx.destination);
        osc.start();
        osc.stop(ringtoneCtx.currentTime + 0.35);
      }
      beep();
      ringtoneInterval = setInterval(beep, 1200);
    }catch(e){}
  }
  function stopRingtone(){
    if(ringtoneInterval){ clearInterval(ringtoneInterval); ringtoneInterval = null; }
    if(ringtoneCtx){ try{ ringtoneCtx.close(); }catch(e){} ringtoneCtx = null; }
  }

  // ---------------- APPELS 1-À-1 (WebRTC + signal via Supabase Realtime) ----------------
  let callSignalChannel = null;
  let activeCall = null;

  function initCallSignaling(){
    if(!window.__sb || callSignalChannel) return;
    callSignalChannel = window.__sb.channel('call-signal-tanjona');
    callSignalChannel.on('broadcast', { event: 'signal' }, function(msg){ handleCallSignal(msg.payload || {}); });
    callSignalChannel.subscribe();
  }
  function sendCallSignal(payload){ if(callSignalChannel) callSignalChannel.send({ type: 'broadcast', event: 'signal', payload: payload }); }

  // Ny kamera dia alaina FOANA (na dia antso feo aza), fa atsahatra
  // (enabled = false) raha antso feo. Izay no ahafahan'ny bokotra « 📷 Kamera »
  // mampandeha azy eo no eo mandritra ny antso : ny piste video dia efa napetraka
  // tao amin'ny fifandraisana hatramin'ny voalohany, ka tsy mila fifampiraharahana
  // (renegotiation) vaovao. Teo aloha dia tsy nisy piste video mihitsy tamin'ny
  // antso feo, ka tsy nanao na inona na inona ilay bokotra.
  function getCallMedia(wantVideo){
    return navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(function(stream){
        if(!wantVideo) stream.getVideoTracks().forEach(function(t){ t.enabled = false; });
        return stream;
      })
      .catch(function(){
        // Tsy misy kamera na nolavina ny kamera : antso feo ihany.
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      });
  }

  function startCall(targetEmail, targetName, callType){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(activeCall){ alert('Efa misy antso mandeha.'); return; }
    const me = myIdentity();
    getCallMedia(callType === 'video').then(function(stream){
      const roomId = 'call-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      activeCall = { roomId: roomId, peer: pc, localStream: stream, withEmail: targetEmail, withName: targetName, callType: callType, direction: 'outgoing', status: 'ringing' };
      stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
      pc.ontrack = function(e){ attachRemoteStream(e.streams[0]); };
      pc.onicecandidate = function(e){
        if(e.candidate) sendCallSignal({ kind: 'ice', roomId: roomId, from: me.email, to: targetEmail, candidate: e.candidate });
      };
      showOutgoingCallUI();
      pc.createOffer().then(function(offer){ return pc.setLocalDescription(offer); }).then(function(){
        sendCallSignal({ kind: 'ring', roomId: roomId, from: me.email, fromName: me.name, to: targetEmail, callType: callType, sdp: pc.localDescription });
      });
      activeCall.timeoutId = setTimeout(function(){
        if(activeCall && activeCall.roomId === roomId && activeCall.status === 'ringing'){
          sendCallSignal({ kind: 'end', roomId: roomId, from: me.email, to: targetEmail, reason: 'timeout' });
          endCall();
        }
      }, 45000);
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  function handleCallSignal(payload){
    if(!payload || !payload.kind) return;
    const me = myIdentity();
    if(payload.to !== me.email) return;
    if(payload.kind === 'ring') onIncomingRing(payload);
    else if(payload.kind === 'answer') onCallAnswered(payload);
    else if(payload.kind === 'ice') onRemoteIce(payload);
    else if(payload.kind === 'reject') onCallRejected(payload);
    else if(payload.kind === 'end') onCallEnded(payload);
    // paroles reconnues chez l'autre : traduites puis affichées ici
    else if(payload.kind === 'speech'){ if(typeof onRemoteSpeech === 'function') onRemoteSpeech(payload); }
  }

  function onIncomingRing(payload){
    const me = myIdentity();
    if(activeCall){
      sendCallSignal({ kind: 'reject', roomId: payload.roomId, from: me.email, to: payload.from, reason: 'busy' });
      return;
    }
    activeCall = { roomId: payload.roomId, withEmail: payload.from, withName: payload.fromName, callType: payload.callType, direction: 'incoming', status: 'ringing', offerSdp: payload.sdp, pendingIce: [] };
    // Mitovy amin'ny Live : fampandrenesana ao amin'ny lakolosy koa, mba hisy
    // dian'ilay antso na dia tsy voaray aza.
    const who = payload.fromName || payload.from;
    if(typeof pushNotification === 'function'){
      pushNotification('antso', (payload.callType === 'video' ? '📹 Antso video' : '📞 Antso feo') +
        ' avy amin\'i ' + who + '.');
    }
    showIncomingCallUI();
    showSystemNotification(
      (payload.callType === 'video' ? '📹 Antso video' : '📞 Antso feo') + ' avy amin\'i ' + who,
      'Tsindrio ity mba hiverina amin\'ny appli sy hamaly.',
      'antso-' + payload.roomId
    );
  }

  function acceptIncomingCall(){
    const call = activeCall;
    if(!call) return;
    const me = myIdentity();
    getCallMedia(call.callType === 'video').then(function(stream){
      const pc = new RTCPeerConnection(ICE_SERVERS);
      call.peer = pc; call.localStream = stream; call.status = 'connecting';
      stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
      pc.ontrack = function(e){ attachRemoteStream(e.streams[0]); };
      pc.onicecandidate = function(e){
        if(e.candidate) sendCallSignal({ kind: 'ice', roomId: call.roomId, from: me.email, to: call.withEmail, candidate: e.candidate });
      };
      pc.setRemoteDescription(new RTCSessionDescription(call.offerSdp)).then(function(){
        return pc.createAnswer();
      }).then(function(answer){
        return pc.setLocalDescription(answer);
      }).then(function(){
        sendCallSignal({ kind: 'answer', roomId: call.roomId, from: me.email, to: call.withEmail, sdp: pc.localDescription });
        call.status = 'connected';
        updateCallUIStatus();
        (call.pendingIce || []).forEach(function(c){ pc.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); });
        call.pendingIce = [];
      });
    }).catch(function(err){
      sendCallSignal({ kind: 'reject', roomId: call.roomId, from: me.email, to: call.withEmail, reason: 'no-media' });
      activeCall = null;
      hideCallUI();
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  function declineIncomingCall(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'reject', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail, reason: 'declined' });
    endCall();
  }

  function onCallAnswered(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    clearTimeout(activeCall.timeoutId);
    activeCall.peer.setRemoteDescription(new RTCSessionDescription(payload.sdp)).then(function(){
      activeCall.status = 'connected';
      updateCallUIStatus();
    });
  }

  function onRemoteIce(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    if(!activeCall.peer){ activeCall.pendingIce = activeCall.pendingIce || []; activeCall.pendingIce.push(payload.candidate); return; }
    activeCall.peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }

  function onCallRejected(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    clearTimeout(activeCall.timeoutId);
    endCall();
  }

  function onCallEnded(payload){
    if(!activeCall || activeCall.roomId !== payload.roomId) return;
    endCall();
  }

  function endCall(){
    if(typeof resetCallTranslation === 'function') resetCallTranslation();
    const call = activeCall;
    if(call){
      clearTimeout(call.timeoutId);
      if(call.peer){ try{ call.peer.close(); }catch(e){} }
      if(call.localStream){ call.localStream.getTracks().forEach(function(t){ t.stop(); }); }
    }
    activeCall = null;
    hideCallUI();
  }

  function hangupCall(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail });
    endCall();
  }

  function showOutgoingCallUI(){
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callIncomingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'none';
    document.getElementById('callOutgoingBox').style.display = 'block';
    document.getElementById('callOutgoingName').textContent = activeCall.withName || activeCall.withEmail;
  }
  function showIncomingCallUI(){
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callOutgoingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'none';
    document.getElementById('callIncomingBox').style.display = 'block';
    document.getElementById('callIncomingType').textContent = activeCall.callType === 'video' ? 'Antso video miditra...' : 'Antso feo miditra...';
    document.getElementById('callIncomingName').textContent = activeCall.withName || activeCall.withEmail;
    playRingtone();
  }
  function updateCallUIStatus(){
    stopRingtone();
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callIncomingBox').style.display = 'none';
    document.getElementById('callOutgoingBox').style.display = 'none';
    document.getElementById('callActiveBox').style.display = 'block';
    document.getElementById('callActiveWith').textContent = (activeCall.callType === 'video' ? '📹 ' : '📞 ') + (activeCall.withName || activeCall.withEmail);
    if(activeCall.localStream){
      const localEl = document.getElementById('callLocalVideo');
      const videoTracks = activeCall.localStream.getVideoTracks();
      localEl.srcObject = activeCall.localStream;
      // Aseho ny sary kelinao raha misy piste video mandeha. Amin'ny antso feo
      // dia miafina izy, fa mipoitra avy hatrany rehefa tsindriana « Kamera ».
      const camOn = videoTracks.length > 0 && videoTracks[0].enabled;
      localEl.style.display = camOn ? 'block' : 'none';
      const camBtn = document.getElementById('callCamBtn');
      if(camBtn){
        camBtn.disabled = videoTracks.length === 0;
        camBtn.textContent = videoTracks.length === 0
          ? '📷 Tsy misy kamera'
          : (camOn ? '📷 Kamera' : '📷 Sokafy ny kamera');
      }
    }
  }
  function attachRemoteStream(stream){
    document.getElementById('callRemoteVideo').srcObject = stream;
    if(activeCall) updateCallUIStatus();
  }
  function hideCallUI(){
    stopRingtone();
    document.getElementById('callOverlay').style.display = 'none';
    document.getElementById('callRemoteVideo').srcObject = null;
    document.getElementById('callLocalVideo').srcObject = null;
    document.getElementById('callMuteBtn').textContent = '🎙️ Mute';
    const camBtn = document.getElementById('callCamBtn');
    camBtn.textContent = '📷 Kamera';
    camBtn.disabled = false;
    document.getElementById('callLocalVideo').style.display = 'none';
  }

  const callAcceptBtn = document.getElementById('callAcceptBtn');
  if(callAcceptBtn) callAcceptBtn.addEventListener('click', acceptIncomingCall);
  const callDeclineBtn = document.getElementById('callDeclineBtn');
  if(callDeclineBtn) callDeclineBtn.addEventListener('click', declineIncomingCall);
  const callCancelBtn = document.getElementById('callCancelBtn');
  if(callCancelBtn) callCancelBtn.addEventListener('click', function(){
    if(!activeCall) return;
    sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail, reason: 'cancelled' });
    endCall();
  });
  const callHangupBtn = document.getElementById('callHangupBtn');
  if(callHangupBtn) callHangupBtn.addEventListener('click', hangupCall);
  const callMuteBtn = document.getElementById('callMuteBtn');
  if(callMuteBtn) callMuteBtn.addEventListener('click', function(){
    if(!activeCall || !activeCall.localStream) return;
    const tracks = activeCall.localStream.getAudioTracks();
    const nowMuted = tracks.length && tracks[0].enabled;
    tracks.forEach(function(t){ t.enabled = !nowMuted; });
    callMuteBtn.textContent = nowMuted ? '🔇 Unmute' : '🎙️ Mute';
  });
  const callCamBtn = document.getElementById('callCamBtn');
  if(callCamBtn) callCamBtn.addEventListener('click', function(){
    if(!activeCall || !activeCall.localStream) return;
    const tracks = activeCall.localStream.getVideoTracks();
    if(!tracks.length){
      alert('Tsy misy kamera hita amin\'ity fitaovana ity, na nolavina ny alalana.');
      return;
    }
    const nowOn = tracks[0].enabled;
    tracks.forEach(function(t){ t.enabled = !nowOn; });
    // Ny sary kelinao dia asehoina na afenina araka izany.
    document.getElementById('callLocalVideo').style.display = nowOn ? 'none' : 'block';
    callCamBtn.textContent = nowOn ? '📷 Sokafy ny kamera' : '📷 Kamera';
  });

  // ---------------- LIVE DIRECT (1 vers plusieurs, mesh WebRTC) ----------------
  let liveSignalChannel = null;
  let myLive = null;
  let watchingLive = null;

  function initLiveSignaling(){
    if(!window.__sb || liveSignalChannel) return;
    liveSignalChannel = window.__sb.channel('live-signal-tanjona');
    liveSignalChannel.on('broadcast', { event: 'signal' }, function(msg){ handleLiveSignal(msg.payload || {}); });
    liveSignalChannel.subscribe();
  }
  function sendLiveSignal(payload){ if(liveSignalChannel) liveSignalChannel.send({ type: 'broadcast', event: 'signal', payload: payload }); }

  // La liste de ce qui se diffuse en ce moment. Elle reste affichée même
  // quand elle est vide : sans cela, personne ne sait où les directs
  // apparaîtront, ni qu'il y a un endroit pour les regarder.
  function renderLiveList(){
    const panel = document.getElementById('liveNoticePanel');
    const box = document.getElementById('liveActiveList');
    const empty = document.getElementById('liveActiveEmpty');
    if(!panel || !box) return;

    // On ne se propose pas à soi-même le direct qu'on est en train de faire.
    const excluded = myLive ? myLive.broadcaster : null;
    const lives = Object.keys(presenceState).filter(function(email){
      return presenceState[email].live && email !== excluded;
    });

    box.innerHTML = '';
    if(empty) empty.style.display = lives.length ? 'none' : 'block';

    lives.forEach(function(email){
      const p = presenceState[email];
      const name = p.name || email;
      const alreadyWatching = watchingLive && watchingLive.broadcasterEmail === email;

      const card = document.createElement('div');
      card.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.8rem; ' +
        'flex-wrap:wrap; border:1px solid var(--line); border-radius:10px; padding:0.7rem 0.9rem; ' +
        'margin-bottom:0.6rem; background:var(--panel-2);';

      const infos = document.createElement('div');
      infos.innerHTML =
        '<div style="font-size:0.9rem; color:var(--text);">' +
          '<span class="live-onair-badge" style="position:static; display:inline-block; margin-right:0.5rem;">🔴 MIVANTANA</span>' +
          '<strong>' + escapeHtml(name) + '</strong>' +
        '</div>' +
        (p.isAdmin ? '<div style="font-size:0.72rem; color:var(--cyan); margin-top:0.25rem;">Tompon\'ny appli</div>' : '');
      card.appendChild(infos);

      if(alreadyWatching){
        const en = document.createElement('span');
        en.className = 'btn btn-sm';
        en.style.cssText = 'width:auto; opacity:0.6;';
        en.textContent = 'Mijery izao';
        card.appendChild(en);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-red btn-sm';
        btn.style.width = 'auto';
        btn.textContent = '👁️ Mijery';
        btn.addEventListener('click', function(){ joinLive(email, name); });
        card.appendChild(btn);
      }

      box.appendChild(card);
    });
  }

  function startLive(){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(myLive){ alert('Efa mandeha ny Live-nao.'); return; }
    if(watchingLive){ alert('Mijanona amin\'ny live jerena aloha vao manomboka anao manokana.'); return; }

    // Fanontaniana raha efa misy live mandeha : matetika ny olona te-HIJERY no
    // manindry ity bokotra ity, ka ny kamerany manokana indray no misokatra.
    const meNow = myIdentity();
    const otherLives = Object.keys(presenceState).filter(function(email){
      return presenceState[email] && presenceState[email].live && email !== meNow.email;
    });
    if(otherLives.length){
      const otherName = (presenceState[otherLives[0]] || {}).name || otherLives[0];
      const watchIt = confirm(
        'Misy Live mandeha an\'i ' + otherName + '.\n\n' +
        'OK = mijery ny live an\'i ' + otherName + '\n' +
        'Annuler = manomboka ny Live-nao manokana (hisokatra ny kameranao)'
      );
      if(watchIt){ joinLive(otherLives[0], otherName); return; }
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(function(stream){
      const me = myIdentity();
      myLive = { broadcaster: me.email, name: me.name, stream: stream, viewers: {} };
      document.getElementById('liveBroadcasterVideo').srcObject = stream;
      showBroadcasterUI();
      updateMyPresence({ live: true });
      // (1) Fampandrenesana ao anaty appli ho an'ny mpanjifa/namana rehetra.
      sendLiveSignal({ kind: 'live-started', broadcaster: me.email, name: me.name });
      // Le canal ne prévient que ceux dont l'application est ouverte. La
      // boutique — patron et employés — le retrouve aussi dans ses
      // notifications partagées, avec le même texte que ceux qui l'ont reçu
      // en direct : common.js n'ajoute pas deux fois la même.
      if(typeof partagerNotification === 'function'){
        partagerNotification('live', '🔴 ' + me.name + ' dia manomboka LIVE DIRECT ankehitriny.');
      }
      updateLiveReachInfo();
      // (2) Fanambarana any amin'ireo lien voarafitra, mba ho hitan'ny olona
      // ivelan'ny appli koa. Menu no aseho fa tsy tabilao maro misokatra ho azy :
      // sakanan'ny navigateur rehetra ny popup marobe tsy notsindrian'olona.
      // Elle s'ouvrait toujours, par-dessus la caméra qui vient de s'allumer.
      // Elle attend maintenant d'être demandée — et « Zarao mialoha ny rohy »
      // reste là pour qui préfère la choisir lui-même, avant de commencer.
      const zara = document.getElementById('liveZara');
      if(!zara || zara.checked) announceLiveOnNetworks(me.name);
      // (3) Le billet dans le fil de la Botika, si la case est cochée. Les
      // deux avis ci-dessus ne touchent que ceux dont l'application est
      // ouverte maintenant ; celui-ci attend dans le fil ceux qui l'ouvriront
      // tout à l'heure, avec le lien qui les fait entrer.
      publierLeLive(me.name);
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  // Le direct posé dans le fil, comme une annonce ordinaire — le fil sait
  // déjà l'afficher en rouge, il ne lui manquait que d'être écrit.
  //
  // Décochée, la case ne publie rien : le direct reste entre ceux qui sont
  // déjà là. C'est un choix, et le défaut est de publier — un direct que
  // personne ne voit passer ne sert à rien.
  function publierLeLive(name){
    const choix = document.getElementById('livePublier');
    if(choix && !choix.checked) return;
    if(!window.__sb) return;

    const billet = {
      client_name: name || 'Client',
      network: 'Live',
      type: 'live',
      message: '🔴 ' + (name || 'Izahay') + ' dia manao LIVE DIRECT ankehitriny.',
      link: liveJoinLink(),
      price: null,
      image: null
    };

    const envoyer = function(photo){
      const avecAuteur = Object.assign({}, billet, {
        author_email: (currentUser && currentUser.email) || null,
        author_photo: photo || null
      });
      // Tant que le script des deux colonnes n'a pas été passé, elles
      // n'existent pas et l'envoi entier serait refusé : le billet doit
      // partir quand même, sans le visage.
      window.__sb.from('client_news').insert(avecAuteur)
        .then(function(res){
          return (res && res.error) ? window.__sb.from('client_news').insert(billet) : res;
        })
        .then(function(){
          if(typeof renderCommunityNews === 'function') renderCommunityNews();
        }, function(){});
    };

    if(typeof vignette === 'function'){
      vignette(currentUser && currentUser.logo).then(envoyer, function(){ envoyer(null); });
    } else {
      envoyer(null);
    }
  }

  // Rohy mampiditra mivantana amin'ny Live : ny mpanjifa manokatra azy dia
  // tafiditra ao amin'ny live avy hatrany aorian'ny fidirana, tsy mila mitady.
  function liveJoinLink(){
    const me = myIdentity();
    const base = (typeof appShareLink === 'function') ? appShareLink() : window.location.href;
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'live=' + encodeURIComponent(me.email) + '&name=' + encodeURIComponent(me.name);
  }

  // Fanambarana ny Live any amin'ireo tambajotra voarafitra (WhatsApp, Facebook…).
  function announceLiveOnNetworks(name){
    if(typeof shareContent !== 'function') return;
    shareContent({
      title: 'Live direct — Ny asako',
      text: '🔴 ' + (name || 'Izahay') + ' dia manao LIVE DIRECT ankehitriny. Tsindrio ity rohy ity dia tafiditra avy hatrany ianao :',
      url: liveJoinLink()
    });
  }

  function stopLive(){
    if(!myLive) return;
    Object.keys(myLive.viewers).forEach(function(v){
      try{ myLive.viewers[v].close(); }catch(e){}
      sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v });
    });
    sendLiveSignal({ kind: 'live-stopped', broadcaster: myLive.broadcaster, name: myLive.name });
    myLive.stream.getTracks().forEach(function(t){ t.stop(); });
    myLive = null;
    updateMyPresence({ live: false });
    hideBroadcasterUI();
  }

  // ---------------- FAMPANDRENESANA LIVE (ho an'ny rehetra) ----------------
  // Bandeau mihantona eo ambony, hita na aiza na aiza ao amin'ny appli, miaraka
  // amin'ny fampandrenesana ao amin'ny lakolosy.
  // Ce qu'on a déjà annoncé, par diffuseur. Deux chemins mènent ici — le
  // signal « live-started » et la présence — et il ne faut qu'un bandeau.
  const livesAnnonces = {};

  // Le signal ne prévient que ceux dont l'application est ouverte À L'INSTANT
  // où le direct commence. Celui qui l'ouvre cinq minutes plus tard n'en
  // savait rien : il entrait dans une boutique où quelqu'un parlait dans la
  // pièce d'à côté, sans que rien ne le lui dise. La présence, elle, dit qui
  // diffuse en ce moment — c'est elle qui rattrape les arrivants.
  function annoncerLeLive(email, name){
    if(!email) return;
    const me = myIdentity();
    if(email === me.email) return;
    if(livesAnnonces[email]) return;
    livesAnnonces[email] = true;

    const qui = name || email || 'Mpanjifa';
    if(typeof pushNotification === 'function'){
      pushNotification('live', '🔴 ' + qui + ' dia manomboka LIVE DIRECT ankehitriny.');
    }
    showLiveToast(email, qui);
    playLiveChime();
    // Fampandrenesana an'ny navigateur : tsindriana dia miditra mivantana amin'ny Live.
    showSystemNotification(
      '🔴 ' + qui + ' dia manao Live direct',
      'Tsindrio ity mba hiditra hijery avy hatrany.',
      'live-' + email,
      function(){
        const nav = document.querySelector('.nav-item[data-section="live"]');
        if(nav && !nav.classList.contains('active')) nav.click();
        joinLive(email, qui);
        removeLiveToast(email);
      }
    );
  }

  // Le direct s'est arrêté : le bandeau s'en va, et l'on oublie l'avoir
  // annoncé — sans quoi le prochain direct de la même personne passerait
  // sous silence.
  function oublierLeLive(email){
    if(!email) return;
    delete livesAnnonces[email];
    removeLiveToast(email);
  }

  function onSomeoneWentLive(payload){
    annoncerLeLive(payload.broadcaster, payload.name || payload.broadcaster);
  }

  // Passe en revue qui diffuse en ce moment, d'après la présence. Appelée à
  // chaque synchronisation : la première a lieu à l'ouverture de
  // l'application, et c'est là que tout se joue pour celui qui arrive.
  function veillerSurLesLives(){
    Object.keys(presenceState).forEach(function(email){
      const p = presenceState[email];
      if(p && p.live) annoncerLeLive(email, p.name);
    });
    Object.keys(livesAnnonces).forEach(function(email){
      const p = presenceState[email];
      if(!(p && p.live)) oublierLeLive(email);
    });
    // Les billets du fil disent « en ce moment » tant que personne ne les
    // détrompe : c'est le même changement de présence qui les met à jour.
    if(typeof window.__majBilletsLive === 'function') window.__majBilletsLive();
  }

  function liveToastContainer(){
    let box = document.getElementById('liveToastBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'liveToastBox';
      box.style.cssText = 'position:fixed; top:0.8rem; right:0.8rem; left:0.8rem; z-index:190; ' +
        'display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; pointer-events:none;';
      document.body.appendChild(box);
    }
    return box;
  }

  function showLiveToast(email, name){
    removeLiveToast(email);
    const toast = document.createElement('div');
    toast.className = 'live-toast';
    toast.setAttribute('data-live-toast', email);
    toast.innerHTML =
      '<span>🔴 <strong>' + escapeHtml(name) + '</strong> dia manao Live direct</span>' +
      '<button type="button" class="btn btn-red btn-sm live-toast-join" style="width:auto;">Mijery</button>' +
      '<button type="button" class="btn btn-sm live-toast-close" style="width:auto;">✕</button>';
    toast.querySelector('.live-toast-join').addEventListener('click', function(){
      const nav = document.querySelector('.nav-item[data-section="live"]');
      if(nav && !nav.classList.contains('active')) nav.click();
      joinLive(email, name);
      removeLiveToast(email);
    });
    toast.querySelector('.live-toast-close').addEventListener('click', function(){ removeLiveToast(email); });
    liveToastContainer().appendChild(toast);
  }

  function removeLiveToast(email){
    const el = document.querySelector('[data-live-toast="' + (window.CSS && CSS.escape ? CSS.escape(email) : email) + '"]');
    if(el) el.remove();
  }

  function onViewerJoin(payload){
    if(!myLive) return;
    const viewerEmail = payload.viewer;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    myLive.viewers[viewerEmail] = pc;
    myLive.stream.getTracks().forEach(function(t){ pc.addTrack(t, myLive.stream); });
    pc.onicecandidate = function(e){
      if(e.candidate) sendLiveSignal({ kind: 'ice-b', broadcaster: myLive.broadcaster, viewer: viewerEmail, candidate: e.candidate });
    };
    pc.createOffer().then(function(offer){ return pc.setLocalDescription(offer); }).then(function(){
      sendLiveSignal({ kind: 'offer', broadcaster: myLive.broadcaster, viewer: viewerEmail, sdp: pc.localDescription });
    });
    updateViewerCount();
  }
  function onViewerAnswer(payload){
    const pc = myLive.viewers[payload.viewer];
    if(!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(function(){});
  }
  function onViewerIce(payload){
    const pc = myLive.viewers[payload.viewer];
    if(!pc) return;
    pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }
  function onViewerLeave(payload){
    const pc = myLive.viewers[payload.viewer];
    if(pc){ try{ pc.close(); }catch(e){} delete myLive.viewers[payload.viewer]; updateViewerCount(); }
  }
  function updateViewerCount(){
    const el = document.getElementById('liveViewerCount');
    if(el && myLive) el.textContent = Object.keys(myLive.viewers).length;
    updateLiveReachInfo();
  }

  // Marika manamarina amin'ny mpanao Live fa tena mipoitra any amin'ny mpanjifa
  // ny live-ny : firy no voampandre, firy no efa nanokatra.
  function updateLiveReachInfo(){
    const el = document.getElementById('liveReachInfo');
    if(!el || !myLive) return;
    const me = myIdentity();
    const others = Object.keys(presenceState).filter(function(email){ return email !== me.email; });
    const watching = Object.keys(myLive.viewers).length;
    if(!others.length){
      el.innerHTML = '⚠️ <strong>Tsy misy olona miditra ankehitriny.</strong> Rehefa misy miditra dia ho hitany avy hatrany ny live-nao.';
      return;
    }
    el.innerHTML = '✅ Mipoitra any amin\'ny <strong>' + others.length + ' mpanjifa</strong> miditra ' +
      'ankehitriny : bandeau 🔴 sy fampandrenesana. <strong>' + watching + '</strong> no efa mijery.';
  }

  // ---------------- LE DIRECT MONTRÉ AILLEURS QUE DANS SA PAGE ----------------
  //
  // Un flux se montre dans autant de <video> qu'on veut : c'est la même image
  // qu'on affiche deux fois, et non un second raccordement au diffuseur. Le
  // fil de la Botika peut donc montrer le direct dans le billet lui-même,
  // sans rien coûter de plus à celui qui diffuse.
  let fluxRegarde = null;
  let ecransDuLive = [];

  function poserLeFluxDuLive(flux){
    fluxRegarde = flux;
    const principal = document.getElementById('liveViewerVideo');
    if(principal) principal.srcObject = flux;
    ecransDuLive = ecransDuLive.filter(function(v){ return v.isConnected; });
    ecransDuLive.forEach(function(v){ v.srcObject = flux; });
  }

  // Un écran de plus pour le direct en cours. Il reçoit l'image tout de suite
  // si elle est déjà là, et l'attend sinon.
  function brancherUnEcranDuLive(video){
    if(!video) return;
    if(ecransDuLive.indexOf(video) === -1) ecransDuLive.push(video);
    if(fluxRegarde) video.srcObject = fluxRegarde;
  }

  function debrancherLesEcransDuLive(){
    ecransDuLive.forEach(function(v){ try { v.srcObject = null; } catch(e){} });
    ecransDuLive = [];
  }

  // Le direct qu'on regarde en ce moment, pour qui veut le montrer ailleurs
  // sans s'y raccorder une seconde fois.
  function liveRegardeMaintenant(){
    return watchingLive ? watchingLive.broadcasterEmail : null;
  }

  function joinLive(broadcasterEmail, broadcasterName){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(watchingLive){ alert('Mijery live hafa efa ianao.'); return; }
    if(myLive){ alert('Ajanony aloha ny Live ataonao vao mijery an\'ny hafa.'); return; }
    const me = myIdentity();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    watchingLive = { broadcasterEmail: broadcasterEmail, broadcasterName: broadcasterName, peer: pc, pendingIce: [] };
    pc.ontrack = function(e){ poserLeFluxDuLive(e.streams[0]); };
    pc.onicecandidate = function(e){
      if(e.candidate) sendLiveSignal({ kind: 'ice-v', broadcaster: broadcasterEmail, viewer: me.email, candidate: e.candidate });
    };
    showLiveViewerUI(broadcasterName);
    sendLiveSignal({ kind: 'join', broadcaster: broadcasterEmail, viewer: me.email, viewerName: me.name });
  }
  function onBroadcasterOffer(payload){
    if(!watchingLive) return;
    const pc = watchingLive.peer;
    pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).then(function(){
      return pc.createAnswer();
    }).then(function(answer){
      return pc.setLocalDescription(answer);
    }).then(function(){
      sendLiveSignal({ kind: 'answer', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email, sdp: pc.localDescription });
      (watchingLive.pendingIce || []).forEach(function(c){ pc.addIceCandidate(new RTCIceCandidate(c)).catch(function(){}); });
      watchingLive.pendingIce = [];
    });
  }
  function onBroadcasterIce(payload){
    if(!watchingLive) return;
    if(!watchingLive.peer.remoteDescription){ watchingLive.pendingIce.push(payload.candidate); return; }
    watchingLive.peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(function(){});
  }
  function leaveLive(){
    if(!watchingLive) return;
    sendLiveSignal({ kind: 'leave', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email });
    try{ watchingLive.peer.close(); }catch(e){}
    watchingLive = null;
    hideLiveViewerUI();
  }
  function onLiveEndedByBroadcaster(){
    if(watchingLive){ try{ watchingLive.peer.close(); }catch(e){} }
    watchingLive = null;
    hideLiveViewerUI();
    alert('Vita ny Live.');
  }

  function handleLiveSignal(payload){
    if(!payload || !payload.kind) return;
    const me = myIdentity();
    if(payload.kind === 'chat'){
      const isMyLive = myLive && payload.broadcaster === myLive.broadcaster;
      const isWatching = watchingLive && payload.broadcaster === watchingLive.broadcasterEmail;
      if(isMyLive || isWatching) appendLiveChatMessage(payload);
      return;
    }
    if(payload.kind === 'ended'){
      if(watchingLive && payload.broadcaster === watchingLive.broadcasterEmail) onLiveEndedByBroadcaster();
      return;
    }
    // Fampandrenesana ho an'ny OLONA REHETRA miditra : tsy voafetra amin'ny
    // mpijery efa mifandray, fa alefa amin'ny rehetra rehefa misy Live manomboka.
    if(payload.kind === 'live-started'){
      if(payload.broadcaster !== me.email) onSomeoneWentLive(payload);
      return;
    }
    if(payload.kind === 'live-stopped'){
      if(payload.broadcaster !== me.email) oublierLeLive(payload.broadcaster);
      return;
    }
    if(myLive && payload.broadcaster === myLive.broadcaster){
      if(payload.kind === 'join'){ onViewerJoin(payload); return; }
      if(payload.kind === 'answer' && myLive.viewers[payload.viewer]){ onViewerAnswer(payload); return; }
      if(payload.kind === 'ice-v' && myLive.viewers[payload.viewer]){ onViewerIce(payload); return; }
      if(payload.kind === 'leave'){ onViewerLeave(payload); return; }
    }
    if(watchingLive && payload.viewer === me.email && payload.broadcaster === watchingLive.broadcasterEmail){
      if(payload.kind === 'offer'){ onBroadcasterOffer(payload); return; }
      if(payload.kind === 'ice-b'){ onBroadcasterIce(payload); return; }
    }
  }

  function sendLiveChat(text){
    const me = myIdentity();
    const broadcasterEmail = myLive ? myLive.broadcaster : (watchingLive ? watchingLive.broadcasterEmail : null);
    if(!broadcasterEmail || !text) return;
    sendLiveSignal({ kind: 'chat', broadcaster: broadcasterEmail, from: me.email, fromName: me.name, text: text, at: Date.now() });
  }
  function appendLiveChatMessage(payload){
    const box = document.getElementById('liveChatMessages');
    if(!box) return;
    const div = document.createElement('div');
    div.style.marginBottom = '0.35rem';
    div.innerHTML = '<strong>' + escapeHtml(payload.fromName || payload.from || '?') + ':</strong> ' + escapeHtml(payload.text || '');
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function showBroadcasterUI(){
    document.getElementById('liveIdleControls').style.display = 'none';
    document.getElementById('liveBroadcasterView').style.display = 'block';
    document.getElementById('liveViewerView').style.display = 'none';
    document.getElementById('liveChatBox').style.display = 'block';
    document.getElementById('liveChatMessages').innerHTML = '';
    document.getElementById('liveViewerCount').textContent = '0';
    renderLiveList();
  }
  function hideBroadcasterUI(){
    document.getElementById('liveBroadcasterView').style.display = 'none';
    document.getElementById('liveIdleControls').style.display = 'block';
    document.getElementById('liveChatBox').style.display = 'none';
    document.getElementById('liveBroadcasterVideo').srcObject = null;
    renderLiveList();
  }
  function showLiveViewerUI(hostName){
    document.getElementById('liveIdleControls').style.display = 'none';
    document.getElementById('liveBroadcasterView').style.display = 'none';
    document.getElementById('liveViewerView').style.display = 'block';
    document.getElementById('liveViewerHost').textContent = hostName;
    document.getElementById('liveChatBox').style.display = 'block';
    document.getElementById('liveChatMessages').innerHTML = '';
  }
  function hideLiveViewerUI(){
    document.getElementById('liveViewerView').style.display = 'none';
    document.getElementById('liveIdleControls').style.display = 'block';
    document.getElementById('liveChatBox').style.display = 'none';
    poserLeFluxDuLive(null);
    debrancherLesEcransDuLive();
    // Les billets du fil montraient encore le direct : leur cadre se referme
    // avec lui.
    if(typeof window.__refermerLesLivesDuFil === 'function') window.__refermerLesLivesDuFil();
    renderLiveList();
  }

  // ---------------- ROHY MIFANDRAY HO AZY (?live= / ?call=) ----------------
  // Ny mpanjifa dia tsy mila mitady na inona na inona ao amin'ny appli : ny
  // fanokafana ilay rohy nozaraina no mampiditra azy mivantana amin'ny Live na
  // manomboka ny antso. Andrasana ny fidirana (login) vao tanterahina.
  function pendingLinkAction(){
    try{
      const p = new URLSearchParams(window.location.search);
      const live = (p.get('live') || '').trim().toLowerCase();
      if(live) return { kind: 'live', email: live, name: p.get('name') || live };
      const call = (p.get('call') || '').trim().toLowerCase();
      if(call){
        const type = (p.get('type') || 'video').toLowerCase() === 'audio' ? 'audio' : 'video';
        return { kind: 'call', email: call, name: p.get('name') || call, type: type };
      }
    }catch(e){}
    return null;
  }

  let linkActionDone = false;
  function runPendingLinkAction(){
    if(linkActionDone) return;
    const action = pendingLinkAction();
    if(!action) return;
    const me = myIdentity();
    if(action.email === me.email) return; // tsy miantso ny tenany
    linkActionDone = true;

    // Les deux ont maintenant leur propre page : un lien d'appel n'a plus de
    // raison d'ouvrir le Live, ni l'inverse.
    const nav = document.querySelector('.nav-item[data-section="' +
      (action.kind === 'call' ? 'appels' : 'live') + '"]');
    if(nav && !nav.classList.contains('active')) nav.click();

    if(action.kind === 'call'){
      // Antso mivantana : ny fangatahana kamera dia mitaky tsindry an-tanana,
      // ka bokotra no aseho fa tsy antso mandeha ho azy.
      showLinkActionPrompt(
        '📞 Antso amin\'i ' + action.name,
        'Tsindrio mba hanomboka ny antso ' + (action.type === 'audio' ? 'feo' : 'video') + '.',
        'Antsoy izao',
        function(){ startCall(action.email, action.name, action.type); }
      );
      return;
    }

    // Live : on ne renonce pas. Ou bien le direct est déjà là, ou bien on
    // attend qu'il commence — et l'entrée se fait toute seule à ce moment.
    waitAndJoinLive(action.email, action.name);
  }

  // Surveille la présence jusqu'à ce que l'hôte passe en direct, puis fait
  // entrer. Le message reste affiché entre-temps, pour que la personne sache
  // qu'elle attend et non qu'elle s'est trompée.
  let liveWaitTimer = null;
  function waitAndJoinLive(email, name){
    const already = presenceState[email];
    if(already && already.live){ joinLive(email, already.name || name); return; }

    const box = showLinkActionPrompt(
      '🔴 Live an\'i ' + name,
      'Miandry ny fanombohan\'ny Live… Tafiditra ho azy ianao raha vao manomboka izy. ' +
      'Azonao atao ny mijanona eto.',
      null, null
    );

    if(liveWaitTimer) clearInterval(liveWaitTimer);
    liveWaitTimer = setInterval(function(){
      const p = presenceState[email];
      if(p && p.live){
        clearInterval(liveWaitTimer);
        liveWaitTimer = null;
        if(box) box.remove();
        joinLive(email, p.name || name);
      }
    }, 1500);
  }

  // ---------------- LE DIRECT ANNONCÉ AILLEURS ----------------
  //
  // Le lien parti sur WhatsApp, Facebook ou Telegram (announceLiveOnNetworks)
  // tombe chez quelqu'un dont l'application n'est pas ouverte — souvent chez
  // quelqu'un qui n'a pas de compte du tout. Il touche le lien, et voit
  // l'écran de connexion, comme n'importe quel jour : rien ne dit qu'un direct
  // l'attend derrière, ni que le lien a fait ce qu'il devait faire. On
  // referme, et le direct se passe sans lui.
  //
  // Le bandeau le dit, par-dessus tout le reste — le mot de bienvenue compris,
  // qui recouvrait la page entière — et fait entrer d'un bouton : l'essai
  // libre tant qu'il dure, l'écran de connexion sinon. Une fois dedans,
  // runPendingLinkAction fait le reste : le direct s'ouvre tout seul, et si
  // l'hôte n'a pas encore commencé, l'entrée se fera à la seconde où il
  // commencera.
  function annoncerLeLiveALaPorte(){
    const action = pendingLinkAction();
    if(!action) return;
    // Déjà entré : openApp s'en occupe, le bandeau ferait double emploi.
    const ecran = document.getElementById('appScreen');
    if(ecran && getComputedStyle(ecran).display !== 'none') return;
    if(document.getElementById('liveALaPorte')) return;

    const direct = action.kind === 'live';
    const bandeau = document.createElement('div');
    bandeau.id = 'liveALaPorte';
    bandeau.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:9500; ' +
      'background:#e5484d; color:#fff; padding:0.7rem 1rem; display:flex; gap:0.7rem; ' +
      'align-items:center; justify-content:center; flex-wrap:wrap; text-align:center; ' +
      'font-size:0.9rem; line-height:1.4; box-shadow:0 2px 12px rgba(0,0,0,0.35);';

    const mot = document.createElement('span');
    mot.innerHTML = direct
      ? '🔴 <strong>' + escapeHtml(action.name) + '</strong> dia manao Live direct — nasaina ianao.'
      : '📞 <strong>' + escapeHtml(action.name) + '</strong> dia miandry antso avy aminao.';
    bandeau.appendChild(mot);

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'btn btn-sm';
    bouton.style.cssText = 'width:auto; background:#fff; color:#e5484d; border:none; font-weight:700;';
    bouton.textContent = direct ? '▶️ Miditra hijery izao' : '📞 Miditra hiantso';
    bouton.addEventListener('click', function(){
      if(typeof closeWelcome === 'function') closeWelcome(false);
      // L'essai libre ouvre sans compte : c'est le plus court chemin entre le
      // lien reçu et le direct.
      if(typeof inFreeEntryWindow === 'function' && inFreeEntryWindow() &&
         typeof entrerSansCompte === 'function'){
        entrerSansCompte();
        return;
      }
      // Passé l'essai libre, il faut un compte. On ne peut pas entrer à sa
      // place — on lui ouvre la porte et on lui dit ce qui arrivera ensuite.
      // L'écran de connexion est remis en place sans condition : l'essai libre
      // l'efface au démarrage, et il serait resté caché derrière rien.
      const porte = document.getElementById('loginScreen');
      if(porte) porte.style.display = 'flex';
      if(typeof showLoginMode === 'function') showLoginMode('quick');
      mot.innerHTML = (direct ? '🔴 ' : '📞 ') + 'Midira eto ambany — ' +
        'tafiditra ho azy ianao avy eo.';
      bouton.style.display = 'none';
      // « Bon retour » a son propre champ : loginEmail est celui de la
      // première inscription, et il est caché dans ce mode-là.
      const champ = document.getElementById('quickEmail') || document.getElementById('loginEmail');
      if(champ) champ.focus();
    });
    bandeau.appendChild(bouton);

    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'btn btn-sm';
    fermer.style.cssText = 'width:auto; background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.6);';
    fermer.textContent = '✕';
    fermer.addEventListener('click', function(){ bandeau.remove(); });
    bandeau.appendChild(fermer);

    document.body.appendChild(bandeau);

    // Entré, le bandeau n'a plus rien à annoncer : ce qui suit se passe dans
    // l'application elle-même.
    if(ecran && window.MutationObserver){
      const oeil = new MutationObserver(function(){
        if(getComputedStyle(ecran).display !== 'none'){
          oeil.disconnect();
          bandeau.remove();
        }
      });
      oeil.observe(ecran, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  // Une session déjà ouverte met un instant à se retrouver : sans ce délai, le
  // bandeau paraîtrait puis disparaîtrait aussitôt, chez quelqu'un qui n'avait
  // rien à faire de lui.
  function veillerSurLaPorte(){ setTimeout(annoncerLeLiveALaPorte, 1500); }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', veillerSurLaPorte);
  } else {
    veillerSurLaPorte();
  }

  // Bandeau kely eo ambonin'ny "Live & Appels" ho an'ny rohy nozaraina.
  function showLinkActionPrompt(title, text, btnLabel, onClick){
    const host = document.getElementById('liveJoinChoices');
    if(!host) return;
    host.style.display = 'block';
    const box = document.createElement('div');
    box.className = 'notif-optin';
    box.innerHTML = '<span><strong>' + escapeHtml(title) + '</strong> — ' + escapeHtml(text) + '</span>';
    if(btnLabel && onClick){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-red btn-sm';
      btn.style.width = 'auto';
      btn.textContent = btnLabel;
      btn.addEventListener('click', function(){ box.remove(); onClick(); });
      box.appendChild(btn);
    }
    host.insertBefore(box, host.firstChild);
    return box;
  }

  // Rohy antso : ny mpanjifa manokatra azy dia tonga dia manomboka antso aminao.
  function callInviteLink(type){
    const me = myIdentity();
    const base = (typeof appShareLink === 'function') ? appShareLink() : window.location.href;
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'call=' + encodeURIComponent(me.email) +
      '&type=' + (type === 'audio' ? 'audio' : 'video') +
      '&name=' + encodeURIComponent(me.name);
  }

  // Onglet « Appel vidéo » au centre de la rangée Accueil / Articles.
  // C'est un vrai lien : on peut le copier ou le partager pour qu'un client
  // appelle directement. Touché dans l'application, il lance l'appel plutôt
  // que de recharger la page — et le propriétaire, lui, est mené à sa
  // section « Live & Appels » (s'appeler soi-même n'aurait pas de sens).
  const videoCallTab = document.getElementById('videoCallTab');
  if(videoCallTab){
    function refreshVideoCallTabLink(){
      try{ videoCallTab.href = callInviteLink('video'); }catch(e){}
    }
    refreshVideoCallTabLink();
    videoCallTab.addEventListener('click', function(e){
      e.preventDefault();
      refreshVideoCallTabLink();
      const me = myIdentity();
      if(me.isAdmin){
        // L'onglet « Appel vidéo » mène aux appels, pas au Live.
        const navAppels = document.querySelector('.nav-item[data-section="appels"]');
        if(navAppels) navAppels.click();
        return;
      }
      const presence = (typeof presenceState === 'object')
        ? presenceState[OWNER_EMAIL.toLowerCase()] : null;
      startCall(OWNER_EMAIL.toLowerCase(), (presence && presence.name) || 'Admin', 'video');
    });
  }

  const shareCallLinkBtn = document.getElementById('shareCallLinkBtn');
  if(shareCallLinkBtn){
    shareCallLinkBtn.addEventListener('click', function(){
      if(typeof shareContent !== 'function') return;
      shareContent({
        title: 'Antso video — Ny asako',
        text: '📹 Tsindrio ity rohy ity dia miantso ahy mivantana amin\'ny video ianao :',
        url: callInviteLink('video')
      });
    });
  }

  const copyCallLinkBtn = document.getElementById('copyCallLinkBtn');
  if(copyCallLinkBtn){
    copyCallLinkBtn.addEventListener('click', function(){
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(callInviteLink('video'));
      const original = copyCallLinkBtn.textContent;
      copyCallLinkBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyCallLinkBtn.textContent = original; }, 1800);
    });
  }

  const startLiveBtn = document.getElementById('startLiveBtn');
  if(startLiveBtn) startLiveBtn.addEventListener('click', startLive);
  const stopLiveBtn = document.getElementById('stopLiveBtn');
  if(stopLiveBtn) stopLiveBtn.addEventListener('click', stopLive);

  // Fizarana ny rohy mandritra ny Live : azo averina impiry impiry, mba
  // hahatongavan'ny fanasana amin'ny mpanjifa tsirairay na dia efa nanomboka aza.
  const shareLiveBtn = document.getElementById('shareLiveBtn');
  if(shareLiveBtn){
    shareLiveBtn.addEventListener('click', function(){
      announceLiveOnNetworks(myLive ? myLive.name : myIdentity().name);
    });
  }

  // Les mêmes gestes, mais disponibles AVANT le direct : on prévient ses
  // clients d'abord, on ouvre la caméra ensuite.
  const shareLiveBeforeBtn = document.getElementById('shareLiveBeforeBtn');
  if(shareLiveBeforeBtn){
    shareLiveBeforeBtn.addEventListener('click', function(){
      announceLiveOnNetworks(myIdentity().name);
    });
  }

  const copyLiveLinkBeforeBtn = document.getElementById('copyLiveLinkBeforeBtn');
  if(copyLiveLinkBeforeBtn){
    copyLiveLinkBeforeBtn.addEventListener('click', function(){
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(liveJoinLink());
      const original = copyLiveLinkBeforeBtn.textContent;
      copyLiveLinkBeforeBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyLiveLinkBeforeBtn.textContent = original; }, 1800);
    });
  }

  const copyLiveLinkBtn = document.getElementById('copyLiveLinkBtn');
  if(copyLiveLinkBtn){
    copyLiveLinkBtn.addEventListener('click', function(){
      const link = liveJoinLink();
      if(typeof copyToClipboardSilently === 'function') copyToClipboardSilently(link);
      const original = copyLiveLinkBtn.textContent;
      copyLiveLinkBtn.textContent = 'Voadika ✓';
      setTimeout(function(){ copyLiveLinkBtn.textContent = original; }, 1800);
    });
  }
  const leaveLiveBtn = document.getElementById('leaveLiveBtn');
  if(leaveLiveBtn) leaveLiveBtn.addEventListener('click', leaveLive);
  const liveChatSendBtn = document.getElementById('liveChatSendBtn');
  if(liveChatSendBtn){
    liveChatSendBtn.addEventListener('click', function(){
      const input = document.getElementById('liveChatInput');
      const text = input.value.trim();
      if(!text) return;
      sendLiveChat(text);
      appendLiveChatMessage({ fromName: myIdentity().name + ' (ianao)', text: text });
      input.value = '';
    });
  }
  const liveChatInput = document.getElementById('liveChatInput');
  if(liveChatInput){
    liveChatInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter') liveChatSendBtn.click();
    });
  }

  function teardownRealtimeFeatures(){
    if(activeCall) hangupCall();
    if(myLive) stopLive();
    if(watchingLive) leaveLive();
    if(presenceChannel){ try{ presenceChannel.unsubscribe(); }catch(e){} presenceChannel = null; }
    if(callSignalChannel){ try{ callSignalChannel.unsubscribe(); }catch(e){} callSignalChannel = null; }
    if(liveSignalChannel){ try{ liveSignalChannel.unsubscribe(); }catch(e){} liveSignalChannel = null; }
    // Une attente de Live qui survit à la déconnexion continuerait d'interroger
    // une présence qui n'est plus tenue à jour.
    if(liveWaitTimer){ clearInterval(liveWaitTimer); liveWaitTimer = null; }
    presenceState = {};
  }

  window.addEventListener('beforeunload', function(){
    if(activeCall) sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail });
    if(myLive){
      Object.keys(myLive.viewers).forEach(function(v){ sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v }); });
    }
    if(watchingLive) sendLiveSignal({ kind: 'leave', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email });
  });


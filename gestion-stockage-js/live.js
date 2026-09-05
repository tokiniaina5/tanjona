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

  // Bandeau ao amin'ny "Live & Appels" : hita raha mbola tsy nomena alalana, mba
  // tsy hangina mangingina ny fampandrenesana.
  function renderNotifOptIn(){
    const box = document.getElementById('notifOptIn');
    if(!box) return;
    const text = document.getElementById('notifOptInText');
    const btn = document.getElementById('notifOptInBtn');
    if(!('Notification' in window)){ box.style.display = 'none'; return; }
    if(Notification.permission === 'granted'){ box.style.display = 'none'; return; }
    box.style.display = 'flex';
    if(Notification.permission === 'denied'){
      text.textContent = '🔕 Voasakana ny fampandrenesana amin\'ity navigateur ity. Sokafy ny paramètres ny site mba hamela azy — raha tsy izany dia ao anaty appli ihany no hahitanao ny Live.';
      btn.style.display = 'none';
      return;
    }
    text.textContent = '🔔 Avelao ny fampandrenesana mba hahafantaranao ny Live na dia tsy eo amin\'ity pejy ity aza ianao.';
    btn.style.display = 'inline-flex';
  }

  const notifOptInBtn = document.getElementById('notifOptInBtn');
  if(notifOptInBtn){
    notifOptInBtn.addEventListener('click', function(){
      if(!('Notification' in window)) return;
      try {
        const res = Notification.requestPermission(function(){ renderNotifOptIn(); });
        if(res && typeof res.then === 'function') res.then(renderNotifOptIn, renderNotifOptIn);
      } catch(e){ renderNotifOptIn(); }
    });
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

  function renderLiveList(){
    const panel = document.getElementById('liveNoticePanel');
    const box = document.getElementById('liveActiveList');
    if(!panel || !box) return;
    const excluded = myLive ? myLive.broadcaster : null;
    const lives = Object.keys(presenceState).filter(function(email){ return presenceState[email].live && email !== excluded; });
    box.innerHTML = '';
    panel.style.display = lives.length ? 'block' : 'none';
    lives.forEach(function(email){
      const p = presenceState[email];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.4rem 0;';
      const alreadyWatching = watchingLive && watchingLive.broadcasterEmail === email;
      row.innerHTML = '<span>🔴 <strong>' + escapeHtml(p.name || email) + '</strong> dia mandeha Live ankehitriny</span>' +
        (alreadyWatching ? '<span class="btn btn-sm" style="opacity:0.6;">Mijery izao</span>' :
          '<button type="button" class="btn btn-red btn-sm join-live-btn" data-email="' + escapeHtml(email) + '" data-name="' + escapeHtml(p.name || email) + '">Mijery</button>');
      box.appendChild(row);
    });
    box.querySelectorAll('.join-live-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ joinLive(btn.getAttribute('data-email'), btn.getAttribute('data-name')); });
    });
    renderLiveJoinChoices(lives);
  }

  // Ny bokotra "Mijery" dia apetraka koa EO AMBONIN'NY "Manomboka Live", satria
  // io no voalohany hitan'ny olona : maro no nanindry "Manomboka Live" nefa ny
  // tiany dia mijery — ka ny kamerany manokana no nisokatra.
  function renderLiveJoinChoices(lives){
    const box = document.getElementById('liveJoinChoices');
    if(!box) return;
    box.innerHTML = '';
    if(!lives || !lives.length || myLive || watchingLive){
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    lives.forEach(function(email){
      const p = presenceState[email] || {};
      const name = p.name || email;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-red';
      btn.style.cssText = 'width:auto; margin-bottom:0.6rem;';
      btn.textContent = '👁️ Mijery ny live an\'i ' + name;
      btn.addEventListener('click', function(){ joinLive(email, name); });
      box.appendChild(btn);
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
      updateLiveReachInfo();
      // (2) Fanambarana any amin'ireo lien voarafitra, mba ho hitan'ny olona
      // ivelan'ny appli koa. Menu no aseho fa tsy tabilao maro misokatra ho azy :
      // sakanan'ny navigateur rehetra ny popup marobe tsy notsindrian'olona.
      announceLiveOnNetworks(me.name);
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
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
      title: 'Live direct — Gestion de Stockage',
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
  function onSomeoneWentLive(payload){
    const name = payload.name || payload.broadcaster || 'Mpanjifa';
    if(typeof pushNotification === 'function'){
      pushNotification('live', '🔴 ' + name + ' dia manomboka LIVE DIRECT ankehitriny.');
    }
    showLiveToast(payload.broadcaster, name);
    playLiveChime();
    // Fampandrenesana an'ny navigateur : tsindriana dia miditra mivantana amin'ny Live.
    showSystemNotification(
      '🔴 ' + name + ' dia manao Live direct',
      'Tsindrio ity mba hiditra hijery avy hatrany.',
      'live-' + payload.broadcaster,
      function(){
        const nav = document.querySelector('.nav-item[data-section="live"]');
        if(nav && !nav.classList.contains('active')) nav.click();
        joinLive(payload.broadcaster, name);
        removeLiveToast(payload.broadcaster);
      }
    );
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

  function joinLive(broadcasterEmail, broadcasterName){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(watchingLive){ alert('Mijery live hafa efa ianao.'); return; }
    if(myLive){ alert('Ajanony aloha ny Live ataonao vao mijery an\'ny hafa.'); return; }
    const me = myIdentity();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    watchingLive = { broadcasterEmail: broadcasterEmail, broadcasterName: broadcasterName, peer: pc, pendingIce: [] };
    pc.ontrack = function(e){ document.getElementById('liveViewerVideo').srcObject = e.streams[0]; };
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
      if(payload.broadcaster !== me.email) removeLiveToast(payload.broadcaster);
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
    document.getElementById('liveViewerVideo').srcObject = null;
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

    const nav = document.querySelector('.nav-item[data-section="live"]');
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

    // Live : andrasana kely ny presence mba hahafantarana raha mbola mandeha.
    setTimeout(function(){
      const p = presenceState[action.email];
      if(p && p.live){ joinLive(action.email, p.name || action.name); return; }
      showLinkActionPrompt(
        '🔴 Live an\'i ' + action.name,
        'Tsy mandeha intsony ny Live, na mbola tsy tafiditra ny fifandraisana. ' +
        'Andramo indray rehefa mahita ny bokotra « Mijery » ianao.',
        null, null
      );
    }, 2500);
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

  const shareCallLinkBtn = document.getElementById('shareCallLinkBtn');
  if(shareCallLinkBtn){
    shareCallLinkBtn.addEventListener('click', function(){
      if(typeof shareContent !== 'function') return;
      shareContent({
        title: 'Antso video — Gestion de Stockage',
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
    presenceState = {};
  }

  window.addEventListener('beforeunload', function(){
    if(activeCall) sendCallSignal({ kind: 'end', roomId: activeCall.roomId, from: myIdentity().email, to: activeCall.withEmail });
    if(myLive){
      Object.keys(myLive.viewers).forEach(function(v){ sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v }); });
    }
    if(watchingLive) sendLiveSignal({ kind: 'leave', broadcaster: watchingLive.broadcasterEmail, viewer: myIdentity().email });
  });


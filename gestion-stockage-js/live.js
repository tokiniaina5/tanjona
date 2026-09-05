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

  function initPresence(){
    if(!window.__sb || presenceChannel) return;
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
      renderInAppCallPanel();
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

  function startCall(targetEmail, targetName, callType){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(activeCall){ alert('Efa misy antso mandeha.'); return; }
    const me = myIdentity();
    navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' }).then(function(stream){
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
    showIncomingCallUI();
  }

  function acceptIncomingCall(){
    const call = activeCall;
    if(!call) return;
    const me = myIdentity();
    navigator.mediaDevices.getUserMedia({ audio: true, video: call.callType === 'video' }).then(function(stream){
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
      document.getElementById('callLocalVideo').srcObject = activeCall.localStream;
      document.getElementById('callLocalVideo').style.display = activeCall.callType === 'video' ? 'block' : 'none';
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
    document.getElementById('callCamBtn').textContent = '📷 Kamera';
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
    if(!tracks.length) return;
    const nowOn = tracks[0].enabled;
    tracks.forEach(function(t){ t.enabled = !nowOn; });
    callCamBtn.textContent = nowOn ? '📷 Camera ON' : '📷 Kamera';
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
  }

  function startLive(){
    if(!window.__sb){ alert('Tsy misy fifandraisana amin\'ny serveur.'); return; }
    if(myLive){ alert('Efa mandeha ny Live-nao.'); return; }
    if(watchingLive){ alert('Mijanona amin\'ny live jerena aloha vao manomboka anao manokana.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(function(stream){
      const me = myIdentity();
      myLive = { broadcaster: me.email, name: me.name, stream: stream, viewers: {} };
      document.getElementById('liveBroadcasterVideo').srcObject = stream;
      showBroadcasterUI();
      updateMyPresence({ live: true });
    }).catch(function(err){
      alert("Tsy afaka mampiasa ny kamera/mikrofonao: " + err.message);
    });
  }

  function stopLive(){
    if(!myLive) return;
    Object.keys(myLive.viewers).forEach(function(v){
      try{ myLive.viewers[v].close(); }catch(e){}
      sendLiveSignal({ kind: 'ended', broadcaster: myLive.broadcaster, viewer: v });
    });
    myLive.stream.getTracks().forEach(function(t){ t.stop(); });
    myLive = null;
    updateMyPresence({ live: false });
    hideBroadcasterUI();
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
  }
  function hideBroadcasterUI(){
    document.getElementById('liveBroadcasterView').style.display = 'none';
    document.getElementById('liveIdleControls').style.display = 'block';
    document.getElementById('liveChatBox').style.display = 'none';
    document.getElementById('liveBroadcasterVideo').srcObject = null;
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
  }

  const startLiveBtn = document.getElementById('startLiveBtn');
  if(startLiveBtn) startLiveBtn.addEventListener('click', startLive);
  const stopLiveBtn = document.getElementById('stopLiveBtn');
  if(stopLiveBtn) stopLiveBtn.addEventListener('click', stopLive);
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


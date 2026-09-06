  // ---------------- TRADUCTION EN DIRECT PENDANT LES APPELS ----------------
  // Pensée pour parler à un fournisseur à l'autre bout du monde : chacun parle
  // sa langue. L'appareil de celui qui parle reconnaît ses paroles, envoie le
  // texte par le canal de l'appel ; l'appareil de celui qui écoute le fait
  // traduire, l'affiche en sous-titre et peut le lire à voix haute.
  //
  // La reconnaissance vocale n'existe que dans Chrome et Edge (et Safari
  // macOS récent) : ailleurs, l'appel fonctionne, seule la traduction se tait.
  const CALL_LANGS = [
    { code: 'fr-FR', label: 'Français' },
    { code: 'mg-MG', label: 'Malagasy' },
    { code: 'en-US', label: 'English' },
    { code: 'zh-CN', label: '中文 (Chinois)' },
    { code: 'es-ES', label: 'Español' },
    { code: 'pt-BR', label: 'Português' },
    { code: 'ar-SA', label: 'العربية (Arabe)' },
    { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
    { code: 'ru-RU', label: 'Русский' },
    { code: 'de-DE', label: 'Deutsch' },
    { code: 'it-IT', label: 'Italiano' },
    { code: 'tr-TR', label: 'Türkçe' },
    { code: 'ja-JP', label: '日本語' },
    { code: 'ko-KR', label: '한국어' }
  ];
  const LANG_PREF_KEY = 'stockmanager_call_langs';

  let recognition = null;
  let translationOn = false;
  let recognitionShouldRun = false;

  function speechRecognitionAvailable(){
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function loadLangPrefs(){
    try { return JSON.parse(localStorage.getItem(LANG_PREF_KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveLangPrefs(prefs){
    try { localStorage.setItem(LANG_PREF_KEY, JSON.stringify(prefs)); } catch(e){}
  }
  function myLang(){
    const el = document.getElementById('callMyLang');
    return (el && el.value) || 'fr-FR';
  }
  function theirLang(){
    const el = document.getElementById('callTheirLang');
    return (el && el.value) || 'en-US';
  }

  function fillLangSelects(){
    const prefs = loadLangPrefs();
    [['callMyLang', prefs.mine || 'fr-FR'], ['callTheirLang', prefs.theirs || 'zh-CN']].forEach(function(pair){
      const select = document.getElementById(pair[0]);
      if(!select || select.options.length) return;
      CALL_LANGS.forEach(function(lang){
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.label;
        if(lang.code === pair[1]) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', function(){
        const current = loadLangPrefs();
        current[pair[0] === 'callMyLang' ? 'mine' : 'theirs'] = select.value;
        saveLangPrefs(current);
        if(translationOn && pair[0] === 'callMyLang') restartRecognition();
      });
    });
  }

  function setTranslateHint(text){
    const hint = document.getElementById('callTranslateHint');
    if(hint) hint.textContent = text || '';
  }

  function addSubtitle(who, text, muted){
    const box = document.getElementById('callSubtitles');
    if(!box) return;
    const line = document.createElement('div');
    line.style.cssText = 'margin-bottom:0.35rem;' + (muted ? ' color:var(--muted);' : ' color:var(--text);');
    const tag = document.createElement('strong');
    tag.style.cssText = 'color:var(--cyan); font-size:0.74rem; margin-right:0.4rem;';
    tag.textContent = who;
    line.appendChild(tag);
    line.appendChild(document.createTextNode(text));
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while(box.children.length > 40) box.removeChild(box.firstChild);
  }

  function translateText(text, from, to){
    if(!window.__sb || !window.__sb.functions || !window.__sb.functions.invoke){
      return Promise.resolve(null);
    }
    return window.__sb.functions.invoke('translate', { body: { text: text, from: from, to: to } })
      .then(function(res){
        if(res && res.error) return null;
        return (res && res.data && res.data.text) || null;
      }, function(){ return null; });
  }

  function speak(text, lang){
    if(!window.speechSynthesis) return;
    try{
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
    }catch(e){}
  }

  // Ce que je viens de dire : envoyé tel quel, l'autre le traduira chez lui.
  function sendSpokenLine(text){
    if(!activeCall || !text.trim()) return;
    const me = myIdentity();
    sendCallSignal({
      kind: 'speech',
      roomId: activeCall.roomId,
      from: me.email,
      to: activeCall.withEmail,
      text: text,
      lang: myLang()
    });
    addSubtitle('Moi', text, true);
  }

  // Ce que l'autre a dit : traduit dans ma langue, affiché, puis lu.
  function onRemoteSpeech(payload){
    const text = (payload && payload.text) || '';
    if(!text) return;
    const from = payload.lang || theirLang();
    const to = myLang();
    addSubtitle('…', text, true);
    translateText(text, from, to).then(function(translated){
      const box = document.getElementById('callSubtitles');
      if(box && box.lastChild) box.removeChild(box.lastChild);
      const shown = translated || text;
      addSubtitle(activeCall ? (activeCall.withName || 'Lui') : 'Lui', shown, false);
      if(translated) speak(translated, to);
    });
  }
  window.onRemoteSpeech = onRemoteSpeech;

  function startRecognition(){
    const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!Engine) return;
    stopRecognition();
    recognition = new Engine();
    recognition.lang = myLang();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = function(event){
      for(let i = event.resultIndex; i < event.results.length; i++){
        if(event.results[i].isFinal){
          sendSpokenLine(event.results[i][0].transcript);
        }
      }
    };
    recognition.onerror = function(e){
      if(e.error === 'not-allowed' || e.error === 'service-not-allowed'){
        setTranslateHint('Micro refusé : autorisez le microphone pour la traduction.');
        stopTranslation();
      }
    };
    // le moteur s'arrête tout seul après un silence : on le relance
    recognition.onend = function(){
      if(recognitionShouldRun){
        try { recognition.start(); } catch(e){}
      }
    };
    recognitionShouldRun = true;
    try { recognition.start(); } catch(e){}
  }
  function restartRecognition(){
    if(!translationOn) return;
    startRecognition();
  }
  function stopRecognition(){
    recognitionShouldRun = false;
    if(recognition){
      try { recognition.onend = null; recognition.stop(); } catch(e){}
      recognition = null;
    }
  }

  function startTranslation(){
    if(!speechRecognitionAvailable()){
      setTranslateHint('Ce navigateur ne sait pas écouter la parole. Ouvrez l\'appel dans Chrome ou Edge pour la traduction.');
      return;
    }
    translationOn = true;
    const button = document.getElementById('callTranslateToggle');
    if(button){ button.textContent = '⏹️ Arrêter la traduction'; button.classList.add('btn-primary'); }
    setTranslateHint('Parlez normalement : vos paroles partent traduites, et ce qu\'il dit s\'affiche puis se lit dans votre langue.');
    startRecognition();
  }
  function stopTranslation(){
    translationOn = false;
    const button = document.getElementById('callTranslateToggle');
    if(button){ button.textContent = '🗣️ Traduire'; button.classList.remove('btn-primary'); }
    stopRecognition();
  }
  window.stopTranslation = stopTranslation;

  function resetCallTranslation(){
    stopTranslation();
    const box = document.getElementById('callSubtitles');
    if(box) box.innerHTML = '';
    setTranslateHint(speechRecognitionAvailable()
      ? 'Chacun parle sa langue : touchez « Traduire » pendant l\'appel.'
      : 'Traduction indisponible sur ce navigateur (Chrome ou Edge la prennent en charge).');
  }
  window.resetCallTranslation = resetCallTranslation;

  const callTranslateToggle = document.getElementById('callTranslateToggle');
  if(callTranslateToggle){
    fillLangSelects();
    resetCallTranslation();
    callTranslateToggle.addEventListener('click', function(){
      if(translationOn) stopTranslation(); else startTranslation();
    });
  }

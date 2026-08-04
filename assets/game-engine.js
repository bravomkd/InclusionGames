/* ============================================================
 * InclusionGames — shared game engine
 * Call IG_GAME(config) from each gameNN.html. The engine injects
 * the whole UI and runs the camera + hand-tracking bubble game.
 *
 * Hand model: one finger to play, TWO OPEN PALMS (~1.2s) to pause.
 * Cooldown between questions so lowering the hand can't mis-pick.
 *
 * config = {
 *   id:'game02', icon:'🔢',
 *   hero:'🦸', villain:'🐉', castle:'🏰',   // quest emojis (optional)
 *   text:{ en:{tag,title,titleEm,desc,quest,questLbl}, de,pl,es },
 *   voice:{ en:'en-US',... },               // optional, defaults provided
 *   modes:[{key,text:{en:{lbl,sub},...}}],  // optional; omit for none
 *   rounds:function(lang,level,mode,count){ return [round,...]; }
 * }
 * round = { hud, big, word, speech, praise, correct, distractors:[...] }
 *   big/word may be null to hide them (e.g. audio-only games).
 * ============================================================ */
(function (global) {
  'use strict';

  // ── Shared 4-language base strings ─────────────────────────
  var BASE = {
    en: { voice:'en-US',
      modeLbl:'🎮 Mode', levelLbl:'📊 Level',
      lvlGentle:'Gentle · 2 bubbles', lvlStandard:'Standard · 3 bubbles', lvlChallenge:'Challenge · 4 bubbles',
      accessLbl:'Accessibility', slow:'Slow motion', big:'Bigger items', voiceLbl:'Voice', spe:'⭐ Special-needs mode',
      cam:'Camera…', camReady:'Camera ready!', camMouse:'Mouse active', track:'Tracking…', trackReady:'Tracking ready!',
      play:'Play!', allGames:'← All games', points:'POINTS', timeLbl:'Time',
      showHand:'Show your hand!', swipe:'Swipe to pop!', getReady:'Get ready…',
      pauseTitle:'⏸️ BREAK', pauseHint:'Show two open palms to continue',
      praises:['Great!','Super!','Fantastic!','Excellent!','WOW!','Brilliant!','Well done!','Hurray!'],
      wonTitle:'You did it! 👑', wonSub:'Everything correct — you are a hero!',
      resMaster:'Master!', resMasterSub:'Amazing work!', resGood:'Great job!', resGoodSub:'You learn fast!',
      resKeep:'Keep practising!', resKeepSub:'Try again!',
      correct:'Correct', rounds:'Rounds', again:'Play again!', settings:'Settings',
      scored:function(s,t){return 'You scored '+s+' out of '+t+'!';}, wonSpeech:'You did it! Amazing!',
      rwTitle:'✨ Win a surprise!', rwDesc:'Grown-ups: send this perfect result and we’ll reply with a little surprise.',
      rwEmail:'Parent / teacher email', rwNote:'Message (optional)', rwSend:'Send my result',
      rwSent:'Sent! 🎁 We’ll be in touch with a surprise.', rwBad:'Please enter a valid email.', rwErr:'Could not send — please try again.'
    },
    de: { voice:'de-DE',
      modeLbl:'🎮 Modus', levelLbl:'📊 Level',
      lvlGentle:'Sanft · 2 Blasen', lvlStandard:'Normal · 3 Blasen', lvlChallenge:'Herausforderung · 4 Blasen',
      accessLbl:'Barrierefreiheit', slow:'Langsames Tempo', big:'Größere Elemente', voiceLbl:'Sprachausgabe', spe:'⭐ Förder-Modus',
      cam:'Kamera…', camReady:'Kamera bereit!', camMouse:'Maus aktiv', track:'Tracking…', trackReady:'Tracking bereit!',
      play:'Los geht’s!', allGames:'← Alle Spiele', points:'PUNKTE', timeLbl:'Zeit',
      showHand:'Zeige deine Hand!', swipe:'Wischen zum Treffen!', getReady:'Bereit machen…',
      pauseTitle:'⏸️ PAUSE', pauseHint:'Zeige zwei offene Handflächen zum Weiterspielen',
      praises:['Bravo!','Super!','Fantastisch!','Ausgezeichnet!','WOW!','Klasse!','Toll gemacht!','Hurra!'],
      wonTitle:'Geschafft! 👑', wonSub:'Alles richtig — du bist ein Held!',
      resMaster:'Meister!', resMasterSub:'Großartig gemacht!', resGood:'Super gemacht!', resGoodSub:'Du lernst schnell!',
      resKeep:'Weiter üben!', resKeepSub:'Versuch es nochmal!',
      correct:'Richtig', rounds:'Runden', again:'Nochmal!', settings:'Einstellungen',
      scored:function(s,t){return 'Du hast '+s+' von '+t+' geschafft!';}, wonSpeech:'Geschafft! Wunderbar!',
      rwTitle:'✨ Gewinne eine Überraschung!', rwDesc:'Für Erwachsene: Sende dieses perfekte Ergebnis und wir antworten mit einer kleinen Überraschung.',
      rwEmail:'E-Mail (Eltern / Lehrkraft)', rwNote:'Nachricht (optional)', rwSend:'Ergebnis senden',
      rwSent:'Gesendet! 🎁 Wir melden uns mit einer Überraschung.', rwBad:'Bitte gültige E-Mail eingeben.', rwErr:'Senden fehlgeschlagen — bitte erneut versuchen.'
    },
    pl: { voice:'pl-PL',
      modeLbl:'🎮 Tryb gry', levelLbl:'📊 Poziom',
      lvlGentle:'Łagodny · 2 bańki', lvlStandard:'Normalny · 3 bańki', lvlChallenge:'Wyzwanie · 4 bańki',
      accessLbl:'Dostępność', slow:'Zwolnione tempo', big:'Większe elementy', voiceLbl:'Głos', spe:'⭐ Tryb SPE',
      cam:'Kamera…', camReady:'Kamera gotowa!', camMouse:'Mysz aktywna', track:'Tracking…', trackReady:'Tracking gotowy!',
      play:'Gramy!', allGames:'← Wszystkie gry', points:'PUNKTY', timeLbl:'Czas',
      showHand:'Pokaż rękę!', swipe:'Przesuń palcem!', getReady:'Przygotuj się…',
      pauseTitle:'⏸️ PRZERWA', pauseHint:'Pokaż dwie otwarte dłonie, aby grać dalej',
      praises:['Brawo!','Super!','Fantastycznie!','Doskonale!','WOW!','Świetnie!','Prima!','Hurra!'],
      wonTitle:'Udało się! 👑', wonSub:'Wszystko poprawne — jesteś bohaterem!',
      resMaster:'Mistrz!', resMasterSub:'Wspaniała robota!', resGood:'Świetnie!', resGoodSub:'Uczysz się szybko!',
      resKeep:'Ćwicz dalej!', resKeepSub:'Spróbuj jeszcze raz!',
      correct:'Poprawnie', rounds:'Rund', again:'Jeszcze raz!', settings:'Ustawienia',
      scored:function(s,t){return 'Zdobyłeś '+s+' z '+t+'!';}, wonSpeech:'Udało się! Wspaniale!',
      rwTitle:'✨ Wygraj niespodziankę!', rwDesc:'Dla dorosłych: wyślij ten idealny wynik, a odpowiemy z małą niespodzianką.',
      rwEmail:'E-mail rodzica / nauczyciela', rwNote:'Wiadomość (opcjonalnie)', rwSend:'Wyślij wynik',
      rwSent:'Wysłano! 🎁 Odezwiemy się z niespodzianką.', rwBad:'Podaj poprawny e-mail.', rwErr:'Nie udało się wysłać — spróbuj ponownie.'
    },
    es: { voice:'es-ES',
      modeLbl:'🎮 Modo', levelLbl:'📊 Nivel',
      lvlGentle:'Suave · 2 burbujas', lvlStandard:'Normal · 3 burbujas', lvlChallenge:'Reto · 4 burbujas',
      accessLbl:'Accesibilidad', slow:'Cámara lenta', big:'Elementos grandes', voiceLbl:'Voz', spe:'⭐ Modo necesidades especiales',
      cam:'Cámara…', camReady:'¡Cámara lista!', camMouse:'Ratón activo', track:'Seguimiento…', trackReady:'¡Seguimiento listo!',
      play:'¡A jugar!', allGames:'← Todos los juegos', points:'PUNTOS', timeLbl:'Tiempo',
      showHand:'¡Muestra tu mano!', swipe:'¡Desliza para reventar!', getReady:'Prepárate…',
      pauseTitle:'⏸️ PAUSA', pauseHint:'Muestra dos palmas abiertas para continuar',
      praises:['¡Bravo!','¡Súper!','¡Fantástico!','¡Excelente!','¡GUAU!','¡Genial!','¡Muy bien!','¡Hurra!'],
      wonTitle:'¡Lo lograste! 👑', wonSub:'¡Todo correcto — eres un héroe!',
      resMaster:'¡Maestro!', resMasterSub:'¡Trabajo increíble!', resGood:'¡Muy bien!', resGoodSub:'¡Aprendes rápido!',
      resKeep:'¡Sigue practicando!', resKeepSub:'¡Inténtalo otra vez!',
      correct:'Correctas', rounds:'Rondas', again:'¡Otra vez!', settings:'Ajustes',
      scored:function(s,t){return '¡Conseguiste '+s+' de '+t+'!';}, wonSpeech:'¡Lo lograste! ¡Increíble!',
      rwTitle:'✨ ¡Gana una sorpresa!', rwDesc:'Adultos: envíen este resultado perfecto y responderemos con una pequeña sorpresa.',
      rwEmail:'Email de padre / profesor', rwNote:'Mensaje (opcional)', rwSend:'Enviar mi resultado',
      rwSent:'¡Enviado! 🎁 Te contactaremos con una sorpresa.', rwBad:'Introduce un email válido.', rwErr:'No se pudo enviar — inténtalo de nuevo.'
    }
  };

  var LANG_BTNS = [['en','🇬🇧','English'],['de','🇩🇪','Deutsch'],['pl','🇵🇱','Polski'],['es','🇪🇸','Español']];

  function TEMPLATE(cfg) {
    var hero=cfg.hero||'🦸', dragon=cfg.villain||'🐉', castle=cfg.castle||'🏰', icon=cfg.icon||'🎮';
    var langbtns = LANG_BTNS.map(function(l){return '<button class="langbtn" data-l="'+l[0]+'"><span class="fl">'+l[1]+'</span>'+l[2]+'</button>';}).join('');
    return ''
    + '<div class="topnav"><div class="brand"><div class="brand-box">🎈</div>InclusionGames</div><a href="/dashboard.html" class="back" id="backlink">← All games</a></div>'
    + '<div id="setupscreen" class="screen">'
    +   '<div class="langrow" id="langrow">'+langbtns+'</div>'
    +   '<div class="hero"><div class="tag" id="uiTag"></div><span class="game-icon">'+icon+'</span>'
    +     '<h1 class="gtitle"><span id="uiTitle"></span><em id="uiTitleEm"></em></h1>'
    +     '<p class="gdesc" id="uiDesc"></p><p class="quest" id="uiQuest"></p></div>'
    +   '<div class="grid2">'
    +     '<div class="card" id="modeCard"><div class="clabel" id="uiModeLbl"></div><div class="mrow" id="mrow"></div></div>'
    +     '<div class="card"><div class="clabel" id="uiLevelLbl"></div><select class="sel" id="lvl">'
    +       '<option value="gentle" id="uiLvlGentle"></option><option value="standard" selected id="uiLvlStandard"></option><option value="challenge" id="uiLvlChallenge"></option></select></div>'
    +     '<div class="card" style="grid-column:1/-1"><div class="clabel" id="uiAccessLbl"></div><div class="toglist">'
    +       '<div class="togrow"><span class="toglbl" id="uiSlow"></span><div class="tog" id="tslow"></div></div>'
    +       '<div class="togrow"><span class="toglbl" id="uiBig"></span><div class="tog" id="txl"></div></div>'
    +       '<div class="togrow"><span class="toglbl" id="uiVoice"></span><div class="tog on" id="tvoice"></div></div></div>'
    +       '<button class="snbtn" id="uiSpe"></button></div>'
    +   '</div>'
    +   '<div class="cambox"><div class="camrow"><div class="camprevbox"><video id="camprev" autoplay playsinline muted></video></div>'
    +     '<div class="caminfo"><div id="scam" class="sline"><span class="sdot"></span><span id="uiCam"></span></div>'
    +     '<div id="smp" class="sline"><span class="sdot"></span><span id="uiTrack"></span></div>'
    +     '<button class="gobtn" id="gobtn" disabled></button></div></div></div>'
    + '</div>'
    + '<video id="vid" autoplay playsinline muted></video><canvas id="gc"></canvas><canvas id="hc"></canvas><div id="wf"></div>'
    + '<div id="questbar" class="hidden"><div class="quest-head"><span id="questLbl"></span><span class="quest-time">⏱️ <span id="qtime">0:00</span></span></div>'
    +   '<div class="quest-track"><span class="q-dragon" id="qdragon">'+dragon+'</span><span class="q-hero" id="qhero">'+hero+'</span><span class="q-castle">'+castle+'</span></div></div>'
    + '<div id="hud" class="hidden"><div class="hp"><div class="hplbl" id="hudlbl"></div><span class="bigletter" id="hl"></span><div class="wordhint" id="hw"></div></div>'
    +   '<div class="hp"><div class="hplbl" id="uiPoints"></div><div class="hscore" id="hs">0</div><div class="hround" id="hr"></div></div></div>'
    + '<div id="praise"><div id="pw" class="pw"></div><div id="ps" class="ps"></div></div>'
    + '<div id="pill" class="hidden"></div>'
    + '<div id="resultscreen" class="screen hidden"><div id="re" class="remoji">🏆</div><div id="rt" class="rtitle"></div><div id="rsub" class="rsub"></div><div id="rstar" class="rstars"></div>'
    +   '<div class="rstats"><div class="rstat"><div class="rsn" id="rs1">0</div><div class="rsl" id="uiCorrect"></div></div>'
    +   '<div class="rstat"><div class="rsn" id="rs2">0</div><div class="rsl" id="uiRounds"></div></div>'
    +   '<div class="rstat"><div class="rsn" id="rs3">0:00</div><div class="rsl" id="uiTime"></div></div></div>'
    +   '<div id="rewardbox" class="hidden"><div class="rw-title" id="uiRwTitle"></div><div class="rw-desc" id="uiRwDesc"></div>'
    +     '<div id="rwform"><input class="rw-input" type="email" id="rwemail"><input class="rw-input" type="text" id="rwnote"><button class="rw-send" id="rwsend"></button></div>'
    +     '<div class="rw-status" id="rwstatus"></div></div>'
    +   '<div class="rbtns"><button class="btn btnp" id="uiAgain"></button><button class="btn btns" id="uiSettings"></button><a href="/dashboard.html" class="btn btnr" id="uiAllGames2" style="text-decoration:none;"></a></div></div>'
    + '<div id="pauseov" class="hidden"><div class="pauseT" id="uiPauseTitle"></div><div class="pauseH" id="uiPauseHint"></div></div>';
  }

  function IG_GAME(cfg) {
    // ════════ PER-CHILD CONTENT OVERRIDE (__IG_OVERRIDE__) ════════
    // Reads the active child's saved settings for this game and wraps
    // cfg.rounds() to filter built-ins, inject custom items, and apply
    // level/count. Fully fail-safe: any problem → original behavior.
    (function(){
      var SET=null;                       // loaded settings, or null
      var active=null;
      try{ active=JSON.parse(localStorage.getItem('ig_active_child')||'null'); }catch(e){}
      var origRounds = (cfg && typeof cfg.rounds==='function') ? cfg.rounds.bind(cfg) : null;

      // fetch settings early (during setup; well before play starts)
      if(active && active.id && cfg && cfg.id && origRounds){
        var tok=null; try{ tok=localStorage.getItem('ig_token'); }catch(e){}
        fetch('/api/children/'+active.id+'/settings/'+cfg.id,{
          headers: tok?{Authorization:'Bearer '+tok}:{}
        }).then(function(r){ return r.ok?r.json():null; })
          .then(function(j){ if(j && j.settings) SET=j.settings; })
          .catch(function(){ /* ignore — play as default */ });
      }

      if(cfg && origRounds){
        cfg.rounds = function(lang, level, mode, count){
          // math: force the child's difficulty tier if set (gentle/''/challenge)
          if(SET && SET.mathLevel!=null){ level = SET.mathLevel; }
          // apply level/count overrides if set
          var useCount = (SET && SET.count) ? SET.count : count;
          var rounds = origRounds(lang, level, mode, useCount + 12) || []; // generate extra to survive filtering

          if(SET){
            // 1) filter out disabled built-ins (key = (big||'') + '|' + correct)
            if(SET.disabled && SET.disabled.length){
              rounds = rounds.filter(function(r){
                var key=((r.big||'')+'|'+r.correct);
                var skey='S|'+(r.word||'');
                return SET.disabled.indexOf(key)<0 && SET.disabled.indexOf(skey)<0;
              });
            }
            // 2) inject custom items
            if(SET.custom && SET.custom.length){
              // build a distractor pool from whatever the game already produced
              var pool=[]; rounds.forEach(function(r){ if(r.correct!=null) pool.push(r.correct); });
              var idxName={en:'en',de:'de',pl:'pl',es:'es'};
              var L=idxName[lang]||'de';
              // a template round to copy hud/speech style from
              var tpl=rounds[0]||{};
              SET.custom.forEach(function(it){
                // sentence-type custom item (punctuation game): {sentence, mark, lang}
                if(it.sentence!=null && it.mark!=null){
                  if(it.lang && it.lang!==lang) return; // only inject for the matching language
                  var marks=['.','?','!'];
                  rounds.push({
                    hud: tpl.hud||'',
                    big: null,
                    word: it.sentence,
                    speech: (tpl.speech!=null? it.sentence : it.sentence),
                    praise: it.sentence+' '+it.mark,
                    correct: it.mark,
                    distractors: marks.filter(function(m){return m!==it.mark;})
                  });
                  return;
                }
                // vocab-type custom item: {emoji, de/en/pl/es}
                var name=it[L]||it.de||it.en||it.pl||it.es||'';
                if(!name) return;
                var others=pool.filter(function(p){ return p!==name; });
                for(var i=others.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=others[i];others[i]=others[j];others[j]=t;}
                var dist=others.slice(0,3);
                rounds.push({
                  hud: tpl.hud||'',
                  big: it.emoji||null,
                  word: (tpl.word!==undefined && tpl.word!==null) ? name : null,
                  speech: tpl.speech||name,
                  praise: name,
                  correct: name,
                  distractors: dist
                });
              });
            }
            // 3) reshuffle so custom items aren't always last
            for(var i=rounds.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=rounds[i];rounds[i]=rounds[j];rounds[j]=t;}
          }

          // trim to requested count (after override expansion)
          var finalCount=(SET && SET.count) ? SET.count : count;
          if(rounds.length>finalCount) rounds=rounds.slice(0,finalCount);
          return rounds;
        };
      }
    })();
    // ════════ END OVERRIDE ════════

    document.body.insertAdjacentHTML('afterbegin', TEMPLATE(cfg));
    var $=function(id){return document.getElementById(id);};
    var setText=function(id,v){var e=$(id);if(e)e.textContent=v;};

    // language + merged strings
    var lang='en', T=null;
    function buildT(l){ var b=BASE[l]||BASE.en, c=(cfg.text&&cfg.text[l])||(cfg.text&&cfg.text.en)||{}; var o={}; for(var k in b)o[k]=b[k]; for(var k2 in c)o[k2]=c[k2]; if(cfg.voice&&cfg.voice[l])o.voice=cfg.voice[l]; return o; }

    var COLS=["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#f97316","#6366f1"];
    var LCFG={gentle:{n:2,sp:.6,sz:1.5,r:8},standard:{n:3,sp:1.0,sz:1.1,r:10},challenge:{n:4,sp:1.5,sz:.85,r:12}};
    var W,H,score=0,rnum=0,total=0,cur=null,queue=[],gameMode=(cfg.modes&&cfg.modes[0]?cfg.modes[0].key:'');
    var bubbles=[],parts=[],stars=[];
    var paused=false,locked=false,running=false;
    var cx=-999,cy=-999,indexTip=null,prevTip=null,handOn=false;
    var mpHands=null,lvl="standard",slow=false,xl=false,voice=true;
    var AC,musicNodes=[],musicGoing=false,videoStream=null;
    var startTime=0,endTime=0,timerInt=null;
    var GC=$("gc"),HC=$("hc"),ctx=GC.getContext("2d"),hctx=HC.getContext("2d");
    function resize(){W=GC.width=HC.width=innerWidth;H=GC.height=HC.height=innerHeight;}
    window.addEventListener("resize",resize);resize();

    // mode buttons (optional)
    function buildModes(){
      var mrow=$("mrow");
      if(!cfg.modes||!cfg.modes.length){ $("modeCard").style.display='none'; return; }
      mrow.innerHTML=cfg.modes.map(function(m,i){return '<button class="mbt'+(i===0?' on':'')+'" data-m="'+m.key+'"><span class="mlbl" data-mk="'+m.key+'"></span></button>';}).join('');
      mrow.querySelectorAll('.mbt').forEach(function(btn){btn.onclick=function(){mrow.querySelectorAll('.mbt').forEach(function(b){b.classList.remove('on');});btn.classList.add('on');gameMode=btn.dataset.m;};});
    }
    function applyModes(){
      if(!cfg.modes)return;
      cfg.modes.forEach(function(m){var el=document.querySelector('.mlbl[data-mk="'+m.key+'"]');if(el){var t=(m.text&&(m.text[lang]||m.text.en))||{lbl:m.key};el.innerHTML=t.lbl+(t.sub?('<br><small>'+t.sub+'</small>'):'');}});
    }

    function applyUI(){
      var c=(cfg.text&&(cfg.text[lang]||cfg.text.en))||{};
      setText('uiTag',c.tag||''); setText('uiTitle',c.title||''); setText('uiTitleEm',c.titleEm||''); setText('uiDesc',c.desc||''); setText('uiQuest',c.quest||''); setText('questLbl',c.questLbl||'');
      setText('uiModeLbl',T.modeLbl); setText('uiLevelLbl',T.levelLbl);
      setText('uiLvlGentle',T.lvlGentle); setText('uiLvlStandard',T.lvlStandard); setText('uiLvlChallenge',T.lvlChallenge);
      setText('uiAccessLbl',T.accessLbl); setText('uiSlow',T.slow); setText('uiBig',T.big); setText('uiVoice',T.voiceLbl); setText('uiSpe',T.spe);
      setText('uiCam',T.cam); setText('uiTrack',T.track); setText('gobtn',T.play);
      setText('backlink',T.allGames); setText('uiAllGames2',T.allGames.replace('← ',''));
      setText('uiPoints',T.points); setText('uiCorrect',T.correct); setText('uiRounds',T.rounds); setText('uiTime',T.timeLbl);
      setText('uiAgain',T.again); setText('uiSettings',T.settings);
      setText('uiPauseTitle',T.pauseTitle); setText('uiPauseHint',T.pauseHint);
      setText('uiRwTitle',T.rwTitle); setText('uiRwDesc',T.rwDesc); setText('rwsend',T.rwSend);
      $('rwemail').placeholder=T.rwEmail; $('rwnote').placeholder=T.rwNote;
      $('pill').textContent=T.showHand;
      applyModes();
    }
    function setLang(l){ if(!BASE[l])l='en'; lang=l; T=buildT(l); try{localStorage.setItem('ig_lang',l);}catch(e){} document.documentElement.lang=l; document.querySelectorAll('.langbtn').forEach(function(b){b.classList.toggle('on',b.dataset.l===l);}); applyUI(); }
    document.querySelectorAll('.langbtn').forEach(function(b){b.onclick=function(){setLang(b.dataset.l);};});

    // accessibility toggles
    $('tslow').onclick=function(){this.classList.toggle('on');};
    $('txl').onclick=function(){this.classList.toggle('on');};
    $('tvoice').onclick=function(){this.classList.toggle('on');};
    $('uiSpe').onclick=function(){$('tslow').classList.add('on');$('txl').classList.add('on');$('lvl').value='gentle';};
    $('gobtn').onclick=startGame; $('uiAgain').onclick=restart; $('uiSettings').onclick=goMenu; $('rwsend').onclick=sendReward;

    // MediaPipe
    window.MP_OK=window.MP_OK||false;window.MP_FAIL=window.MP_FAIL||false;
    (function(){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js";s.crossOrigin="anonymous";s.onload=function(){window.MP_OK=true;};s.onerror=function(){window.MP_FAIL=true;};document.head.appendChild(s);})();
    function initCam(){navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:"user"},audio:false}).then(function(s){videoStream=s;$("camprev").srcObject=s;$("vid").srcObject=s;$("camprev").play().catch(function(){});$("scam").className="sline ok";$("scam").innerHTML="<span class=sdot></span>"+T.camReady;$("gobtn").disabled=false;loadMP();}).catch(function(){$("scam").className="sline warn";$("scam").innerHTML="<span class=sdot></span>"+T.camMouse;$("gobtn").disabled=false;loadMP();});}
    function loadMP(){var w=0,c=setInterval(function(){w++;if(window.MP_OK&&typeof Hands!=="undefined"){clearInterval(c);try{mpHands=new Hands({locateFile:function(f){return "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/"+f;}});mpHands.setOptions({maxNumHands:2,modelComplexity:0,minDetectionConfidence:.55,minTrackingConfidence:.45});mpHands.onResults(onHands);mpHands.initialize().then(function(){$("smp").className="sline ok";$("smp").innerHTML="<span class=sdot></span>"+T.trackReady;}).catch(function(){});}catch(e){}}if(window.MP_FAIL||w>80){clearInterval(c);}},100);}
    function startMPLoop(){var v=$("vid");function p(){if(!running)return;if(mpHands&&v.readyState>=2)try{mpHands.send({image:v}).catch(function(){});}catch(e){}requestAnimationFrame(p);}requestAnimationFrame(p);}

    window.addEventListener("mousemove",function(e){cx=e.clientX;cy=e.clientY;});
    window.addEventListener("touchmove",function(e){if(e.touches[0]){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}},{passive:true});
    window.addEventListener("touchstart",function(e){if(e.touches[0]){cx=e.touches[0].clientX;cy=e.touches[0].clientY;}},{passive:true});
    window.addEventListener("click",function(e){if(!running||paused||locked)return;bubbles.forEach(function(b){if(!b.popped&&Math.hypot(e.clientX-b.x,e.clientY-b.y)<b.r+14)tryPop(b);});});
    window.addEventListener("touchend",function(e){if(!running||paused||locked)return;var t=e.changedTouches[0];if(!t)return;bubbles.forEach(function(b){if(!b.popped&&Math.hypot(t.clientX-b.x,t.clientY-b.y)<b.r+18)tryPop(b);});},{passive:true});

    function initAC(){if(!AC)try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}
    document.addEventListener("click",function(){initAC();if(AC&&AC.state==="suspended")AC.resume();},{once:true});
    function mkO(f,t,v,st,d){if(!AC)return;var o=AC.createOscillator(),g=AC.createGain();o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,st);g.gain.exponentialRampToValueAtTime(.001,st+d);o.connect(g);g.connect(AC.destination);o.start(st);o.stop(st+d);musicNodes.push(o);}
    function startMus(){stopMus();if(!AC)return;musicGoing=true;playHappy();}
    function stopMus(){musicGoing=false;musicNodes.forEach(function(n){try{n.stop();}catch(e){}});musicNodes=[];}
    function playHappy(){if(!musicGoing)return;var m=[523,587,659,698,784,880,988,1047];var nw=AC.currentTime,st=slow?.38:.22;m.forEach(function(f,i){mkO(f,"sine",.05,nw+i*st,st*.85);});setTimeout(function(){if(musicGoing)playHappy();},m.length*st*1000);}
    function snd(t){if(!AC)return;try{if(t==="ok"){[523,659,784,1047,1319].forEach(function(f,i){var o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0,AC.currentTime+i*.08);g.gain.linearRampToValueAtTime(.15,AC.currentTime+i*.08+.05);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+i*.08+.3);o.start(AC.currentTime+i*.08);o.stop(AC.currentTime+i*.08+.3);});}else if(t==="no"){var o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type="sine";o.frequency.setValueAtTime(280,AC.currentTime);o.frequency.exponentialRampToValueAtTime(150,AC.currentTime+.25);g.gain.setValueAtTime(.09,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.28);o.start();o.stop(AC.currentTime+.28);}else if(t==="fin"){[392,494,587,784,988,1175].forEach(function(f,i){var o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type="triangle";o.frequency.value=f;g.gain.setValueAtTime(0,AC.currentTime+i*.12);g.gain.linearRampToValueAtTime(.14,AC.currentTime+i*.12+.06);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+i*.12+.5);o.start(AC.currentTime+i*.12);o.stop(AC.currentTime+i*.12+.5);});}}catch(e){}}
    function say(txt){if(!voice||!txt)return;try{window.speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(txt);u.lang=T.voice;u.rate=slow?.78:.95;u.pitch=1.12;window.speechSynthesis.speak(u);}catch(e){}}

    function showPill(txt,cls){var p=$('pill');if(p.classList.contains('hidden'))return;p.textContent=txt;p.className=cls||'';}
    function elapsedMs(){return (endTime||Date.now())-startTime;}
    function fmtTime(ms){var s=Math.max(0,Math.round(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
    function startTimer(){startTime=Date.now();endTime=0;clearInterval(timerInt);timerInt=setInterval(function(){if(running&&!paused)setText('qtime',fmtTime(Date.now()-startTime));},500);}
    function stopTimer(){endTime=Date.now();clearInterval(timerInt);timerInt=null;}
    function updateQuest(){var prog=total?score/total:0;var h=$('qhero'),d=$('qdragon');if(h)h.style.left=(4+prog*88)+'%';if(d)d.style.left=Math.max(0,(prog*88-14))+'%';}

    function shuffle(a){var b=a.slice();for(var i=b.length-1;i>0;i--){var j=Math.random()*(i+1)|0;var t=b[i];b[i]=b[j];b[j]=t;}return b;}
    function buildQ(){total=LCFG[lvl].r;queue=cfg.rounds(lang,lvl,gameMode,total)||[];total=queue.length;}

    function nextRound(){
      if(rnum>=total){endGame();return;}
      cur=queue[rnum++];bubbles=[];parts=[];locked=true;
      setText('hudlbl',cur.hud||'');
      var hl=$('hl'),hw=$('hw');
      if(cur.big==null){hl.style.display='none';}else{hl.style.display='';hl.textContent=cur.big;}
      if(cur.word==null){hw.style.display='none';}else{hw.style.display='';hw.textContent=cur.word;}
      setText('hs',score+' '); setText('hr',rnum+' / '+total);
      showPill(T.getReady,'wait');
      spawnBubbles();
      setTimeout(function(){ if(running){ locked=false; showPill(T.swipe,'on'); } }, slow?1500:1050);
      setTimeout(function(){ say(cur.speech); },350);
    }
    function spawnBubbles(){
      var c=LCFG[lvl];var R=Math.min(82,W*.1)*c.sz*(xl?1.3:1);var sp=(slow?.6:1)*c.sp;
      var dist=shuffle((cur.distractors||[]).slice()).slice(0,Math.max(0,c.n-1));
      var items=[{label:cur.correct,correct:true}].concat(dist.map(function(d){return {label:d,correct:false};}));
      var all=shuffle(items);var xs=shuffle(all.map(function(_,i){return .1+i*.8/(all.length-1||1);}));
      all.forEach(function(item,i){bubbles.push({item:item,col:COLS[Math.random()*COLS.length|0],x:xs[i]*W+(Math.random()-.5)*18,y:H+R+i*70,r:R,vy:-(sp*(1+Math.random()*.3)),vx:(Math.random()-.5)*.45,phase:Math.random()*Math.PI*2,scale:0,opacity:0,popped:false,fading:false,shake:0,hov:false});});
    }
    var loopStarted=false;
    function startLoop(){if(!loopStarted){loopStarted=true;requestAnimationFrame(loop);}}
    function loop(ts){requestAnimationFrame(loop);ctx.clearRect(0,0,W,H);if(!running)return;ctx.fillStyle="rgba(8,14,30,.44)";ctx.fillRect(0,0,W,H);drawStars(ts);update();drawBubbles();drawParts();checkRespawn();drawCursor();}
    function drawStars(ts){var t=ts/1000;stars.forEach(function(s){ctx.globalAlpha=.06+.24*(Math.sin(t*1.4+s.ph)+1)/2;ctx.fillStyle="#93c5fd";ctx.beginPath();ctx.arc(s.x%W,s.y%H,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}
    function drawCursor(){if(handOn)return;ctx.save();ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(cx,cy,16,0,Math.PI*2);ctx.strokeStyle="rgba(255,215,0,.8)";ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fillStyle="rgba(255,215,0,.9)";ctx.fill();ctx.restore();}
    function update(){if(paused)return;var t=Date.now()/1000;var px=handOn?indexTip.x*W:cx;var py=handOn?indexTip.y*H:cy;bubbles.forEach(function(b){if(b.popped)return;b.scale=Math.min(1,b.scale+.06);b.opacity=b.fading?Math.max(0,b.opacity-.07):Math.min(1,b.opacity+.06);b.y+=b.vy;b.x+=Math.sin(t*1.3+b.phase)*.65+b.vx;if(b.shake>0){b.x+=Math.sin(b.shake*28)*9;b.shake=Math.max(0,b.shake-.08);}var hit=Math.hypot(px-b.x,py-b.y)<b.r+14;b.hov=hit;if(hit&&handOn&&!locked&&prevTip&&indexTip){var dvx=(indexTip.x-prevTip.x)*W,dvy=(indexTip.y-prevTip.y)*H;if(Math.hypot(dvx,dvy)>3.5)tryPop(b);}});parts.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=.2;p.life-=.026;p.r=Math.max(0,p.r-.3);});parts=parts.filter(function(p){return p.life>0;});}
    function checkRespawn(){if(locked||paused)return;var alive=bubbles.filter(function(b){return !b.popped&&b.y>-b.r-120;});if(alive.length===0&&bubbles.length>0){bubbles=[];say(cur.speech);setTimeout(function(){if(!locked)spawnBubbles();},900);}}
    function tryPop(b){if(b.popped||b.fading||locked)return;if(b.item.correct){b.popped=true;score++;locked=true;snd("ok");spawn(b.x,b.y,b.col,40);updateQuest();var pr=T.praises[Math.random()*T.praises.length|0];setText("pw",pr);setText("ps",cur.praise||'');var p=$("praise");p.classList.add("show");setTimeout(function(){p.classList.remove("show");},slow?2800:2000);say(pr+" "+(cur.praise||''));setText("hs",score+" ");setTimeout(function(){nextRound();},slow?2900:2100);}else{b.fading=true;b.shake=1;snd("no");spawn(b.x,b.y,"#fff",5);var e=$("wf");e.classList.add("fl");setTimeout(function(){e.classList.remove("fl");},320);setTimeout(function(){b.popped=true;},680);}}
    function lig(h,a){var n=parseInt(h.slice(1),16);return "rgb("+Math.min(255,((n>>16)&255)+Math.round(a*255))+","+Math.min(255,((n>>8)&255)+Math.round(a*255))+","+Math.min(255,(n&255)+Math.round(a*255))+")";}
    function drk(h,a){var n=parseInt(h.slice(1),16);return "rgb("+Math.max(0,((n>>16)&255)-Math.round(a*255))+","+Math.max(0,((n>>8)&255)-Math.round(a*255))+","+Math.max(0,(n&255)-Math.round(a*255))+")";}
    function drawBubbles(){bubbles.forEach(function(b){if(b.popped)return;ctx.save();ctx.globalAlpha=b.opacity;ctx.translate(b.x,b.y);ctx.scale(b.scale,b.scale);var gw=ctx.createRadialGradient(0,0,b.r*.3,0,0,b.r*1.8);gw.addColorStop(0,b.col+"44");gw.addColorStop(1,b.col+"00");ctx.fillStyle=gw;ctx.beginPath();ctx.arc(0,0,b.r*1.8,0,Math.PI*2);ctx.fill();var gr=ctx.createRadialGradient(-b.r*.28,-b.r*.28,0,0,0,b.r);gr.addColorStop(0,lig(b.col,.5));gr.addColorStop(.65,b.col);gr.addColorStop(1,drk(b.col,.28));ctx.fillStyle=gr;ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,255,255,.3)";ctx.beginPath();ctx.ellipse(-b.r*.2,-b.r*.3,b.r*.27,b.r*.16,-.3,0,Math.PI*2);ctx.fill();if(b.hov&&!handOn){ctx.strokeStyle="rgba(255,255,255,.7)";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,b.r+6,0,Math.PI*2);ctx.stroke();}ctx.strokeStyle="rgba(255,255,255,.28)";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.stroke();var lbl=String(b.item.label);var fs=(xl?b.r*1.0:b.r*.86);if(lbl.length>2)fs*=2/Math.max(2,lbl.length)*1.3;ctx.font=(fs|0)+"px 'Fredoka One',cursive";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="rgba(0,0,0,.2)";ctx.fillText(lbl,2,7);ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=10;ctx.fillText(lbl,0,3);ctx.shadowBlur=0;ctx.restore();});}
    function drawParts(){parts.forEach(function(p){ctx.save();ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();});}
    function spawn(x,y,col,n){for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,sp=2.5+Math.random()*7.5;parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,col:col,r:4+Math.random()*9,life:1});}}
    var CONN=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];
    function openPalm(lm){return [8,12,16,20].every(function(t){return lm[t].y<lm[t-2].y;});}
    var twoHoldStart=0;
    function checkBreak(hands){var twoOpen=hands.length>=2&&openPalm(hands[0])&&openPalm(hands[1]);if(twoOpen){if(!twoHoldStart)twoHoldStart=Date.now();else if(Date.now()-twoHoldStart>1200){paused=!paused;$("pauseov").classList.toggle("hidden",!paused);twoHoldStart=0;}}else{twoHoldStart=0;}}
    function onHands(r){hctx.clearRect(0,0,W,H);var allHands=(r.multiHandLandmarks||[]);checkBreak(allHands);var pill=$("pill");if(!r.multiHandLandmarks||!r.multiHandLandmarks.length){handOn=false;indexTip=null;prevTip=null;if(pill&&!pill.classList.contains("hidden")&&!locked){pill.textContent=T.showHand;pill.className="";}return;}handOn=true;var lm=r.multiHandLandmarks[0];prevTip=indexTip;indexTip={x:1-lm[8].x,y:lm[8].y};hctx.save();hctx.lineWidth=2.5;hctx.strokeStyle="rgba(147,197,253,.22)";CONN.forEach(function(ab){hctx.beginPath();hctx.moveTo((1-lm[ab[0]].x)*W,lm[ab[0]].y*H);hctx.lineTo((1-lm[ab[1]].x)*W,lm[ab[1]].y*H);hctx.stroke();});for(var i=0;i<21;i++){var x=(1-lm[i].x)*W,y=lm[i].y*H,tip=i===8;hctx.beginPath();hctx.arc(x,y,tip?18:4.5,0,Math.PI*2);if(tip){hctx.fillStyle="rgba(255,215,0,.92)";hctx.shadowBlur=26;hctx.shadowColor="rgba(255,215,0,.85)";}else{hctx.fillStyle="rgba(147,197,253,.5)";hctx.shadowBlur=0;}hctx.fill();hctx.shadowBlur=0;}hctx.restore();if(pill&&!pill.classList.contains("hidden")&&!locked){pill.textContent=T.swipe;pill.className="on";}}

    function startGame(){lvl=$("lvl").value;slow=$("tslow").classList.contains("on");xl=$("txl").classList.contains("on");voice=$("tvoice").classList.contains("on");$("setupscreen").classList.add("hidden");$("hud").classList.remove("hidden");$("questbar").classList.remove("hidden");$("pill").classList.remove("hidden");$("vid").classList.add("vis");score=0;rnum=0;bubbles=[];parts=[];paused=false;locked=false;running=true;buildQ();updateQuest();setText('qtime','0:00');stars=Array.from({length:50},function(){return{x:Math.random()*2000,y:Math.random()*1200,r:Math.random()*1.8+.3,ph:Math.random()*Math.PI*2};});startLoop();if(videoStream&&mpHands)startMPLoop();initAC();startMus();startTimer();nextRound();}
    function restart(){$("resultscreen").classList.add("hidden");$("hud").classList.remove("hidden");$("questbar").classList.remove("hidden");$("pill").classList.remove("hidden");$("rewardbox").classList.add("hidden");setText("rwstatus","");$("rwform").style.display="";score=0;rnum=0;bubbles=[];parts=[];paused=false;locked=false;running=true;buildQ();updateQuest();setText('qtime','0:00');startMus();startTimer();nextRound();}
    function goMenu(){stopMus();stopTimer();running=false;bubbles=[];parts=[];$("resultscreen").classList.add("hidden");$("hud").classList.add("hidden");$("questbar").classList.add("hidden");$("pill").classList.add("hidden");$("vid").classList.remove("vis");$("setupscreen").classList.remove("hidden");}
    function endGame(){stopMus();stopTimer();snd("fin");running=false;$("hud").classList.add("hidden");$("questbar").classList.add("hidden");$("pill").classList.add("hidden");ctx.clearRect(0,0,W,H);
      var perfect=(score===total&&total>0);var pct=total?score/total:0;var emoji,title,sub;
      if(perfect){emoji="👑";title=T.wonTitle;sub=T.wonSub;}
      else if(pct>=.85){emoji="🏆";title=T.resMaster;sub=T.resMasterSub;}
      else if(pct>=.5){emoji="🌟";title=T.resGood;sub=T.resGoodSub;}
      else{emoji="⭐";title=T.resKeep;sub=T.resKeepSub;}
      setText("re",emoji);setText("rt",title);setText("rsub",sub);setText("rstar","⭐".repeat(Math.min(score,12)));
      setText("rs1",score);setText("rs2",total);setText("rs3",fmtTime(elapsedMs()));
      $("rewardbox").classList.toggle("hidden",!perfect);
      $("resultscreen").classList.remove("hidden");
      if(voice)say((perfect?T.wonSpeech+" ":"")+title+" "+T.scored(score,total));
      // record progress for the active child (silent, fire-and-forget)
      try{
        var ac=JSON.parse(localStorage.getItem('ig_active_child')||'null');
        if(ac && ac.id){
          var tk=null; try{ tk=localStorage.getItem('ig_token'); }catch(e){}
          fetch('/api/children/'+ac.id+'/progress',{
            method:'POST',
            headers:{'Content-Type':'application/json',Authorization:tk?('Bearer '+tk):''},
            body:JSON.stringify({game:cfg.id,score:score,total:total,timeMs:elapsedMs(),lang:lang})
          }).catch(function(){});
        }
      }catch(e){}
    }
    function sendReward(){
      var email=($('rwemail').value||'').trim();var st=$('rwstatus');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){st.style.color='var(--gold)';st.textContent=T.rwBad;return;}
      var btn=$('rwsend');btn.disabled=true;var tok=null;try{tok=localStorage.getItem('ig_token');}catch(e){}
      fetch('/api/reward',{method:'POST',headers:{'Content-Type':'application/json',Authorization:tok?('Bearer '+tok):''},
        body:JSON.stringify({game:cfg.id,lang:lang,score:score,total:total,timeMs:elapsedMs(),parentEmail:email,note:($('rwnote').value||'').trim()})
      }).then(function(r){if(!r.ok)throw 0;$('rwform').style.display='none';st.style.color='var(--green)';st.textContent=T.rwSent;})
       .catch(function(){st.style.color='var(--red)';st.textContent=T.rwErr;btn.disabled=false;});
    }

    // boot
    buildModes();
    var saved='en';try{saved=localStorage.getItem('ig_lang')||'en';}catch(e){}
    var urlL=new URLSearchParams(location.search).get('lang');if(urlL)saved=urlL;
    setLang(BASE[saved]?saved:'en');
    initCam();
  }

  global.IG_GAME = IG_GAME;
})(window);

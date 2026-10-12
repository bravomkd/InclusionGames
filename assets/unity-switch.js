/* ============================================================
 * InclusionGames — the client's own Unity game, played with a movement.
 *
 * This is not a port. It loads his AR Animal Run exactly as he built
 * it, compiled to WebGL, and gives it a different way to be pressed.
 *
 * ── Why this needs almost no code ────────────────────────────
 * The whole of that game's input is one line:
 *
 *     Character_Controller.cs:45   if (Input.GetKeyDown(KeyCode.Space))
 *
 * A Unity WebGL build reads real keyboard events off the page. So a
 * mouth opening, a hand going up or an eyebrow lifting becomes a Space
 * keydown aimed at the canvas, and his C# never learns the difference.
 * Nothing in his game is modified, which is the point: it is his game,
 * not a reimplementation of it that drifts from the original every
 * time either of us touches something.
 *
 * The measurement — what counts as "open", for this person, today — is
 * switch-input.js, shared with the other runner. The physics, the art,
 * the modes, the scoring and the UI are all his.
 *
 * ── What an adult still has to do ────────────────────────────
 * His game opens on its own menu: pick an animal, pick a mode, Start.
 * That menu is a pointer UI and this layer deliberately does not fake
 * clicks into it — a synthetic tap at a guessed coordinate breaks the
 * moment he moves a button. So a grown-up sets the round up and the
 * child plays it, which is how these sessions actually run.
 * ============================================================ */
(function (global) {
  'use strict';

  var SW = global.IG_SWITCH;

  var T4 = {
    en: { voice: 'en-US',
      srcLbl: '🙂 How will you jump?', accessLbl: 'Accessibility', voiceLbl: 'Voice',
      play: 'Play!', allGames: '← All games',
      cam: 'Camera…', camAsking: 'Asking for the camera…', camReady: 'Camera ready!',
      camDenied: 'No camera — you can play with the space bar.',
      track: 'Tracking…', trackReady: 'Tracking ready!', trackFail: 'Tracking unavailable — space bar it is.',
      calRestT: 'Sit still', calRestP: 'Stay as still as you can for a moment, so I can see what resting looks like.',
      calGoT: 'Now show me!', calGoP: 'Do it as big as you can, a few times:',
      calWeakT: 'I could hardly see that', calWeakP: 'That movement was too small for me to tell apart from sitting still. We can try again, or you can play with the space bar.',
      calNoCamT: 'No picture from the camera', calNoCamP: 'The camera is switched on but no picture is coming through. Check that nothing else is using it, or play with the space bar.',
      calRetry: '↻ Try again', calUseKey: '␣ Use the space bar',
      loading: 'Loading the game…', lost: '👀 I cannot see you — move back into the picture',
      setup: 'A grown-up: choose the animal and the mode, then press Start in the game.',
      quit: '← Leave the game',
      errT: 'The game stopped', errP: 'Something went wrong inside the game. Starting it again usually fixes it.', errRetry: '↻ Start it again',
    },
    de: { voice: 'de-DE',
      srcLbl: '🙂 Wie springst du?', accessLbl: 'Barrierefreiheit', voiceLbl: 'Sprachausgabe',
      play: 'Los geht’s!', allGames: '← Alle Spiele',
      cam: 'Kamera…', camAsking: 'Kamera wird angefragt…', camReady: 'Kamera bereit!',
      camDenied: 'Keine Kamera — du kannst mit der Leertaste spielen.',
      track: 'Tracking…', trackReady: 'Tracking bereit!', trackFail: 'Tracking nicht verfügbar — dann mit der Leertaste.',
      calRestT: 'Ganz still sitzen', calRestP: 'Bleib einen Moment so still wie möglich, damit ich sehe, wie Ruhe aussieht.',
      calGoT: 'Jetzt zeig es mir!', calGoP: 'Mach es ein paar Mal so groß wie du kannst:',
      calWeakT: 'Das konnte ich kaum sehen', calWeakP: 'Die Bewegung war zu klein, um sie vom Stillsitzen zu unterscheiden. Wir können es nochmal versuchen, oder du spielst mit der Leertaste.',
      calNoCamT: 'Kein Bild von der Kamera', calNoCamP: 'Die Kamera ist an, aber es kommt kein Bild an. Prüfe, ob sie von etwas anderem benutzt wird, oder spiele mit der Leertaste.',
      calRetry: '↻ Nochmal versuchen', calUseKey: '␣ Leertaste benutzen',
      loading: 'Spiel wird geladen…', lost: '👀 Ich sehe dich nicht — komm zurück ins Bild',
      setup: 'Für Erwachsene: Tier und Spielmodus wählen, dann im Spiel auf Start drücken.',
      quit: '← Spiel verlassen',
      errT: 'Das Spiel hat angehalten', errP: 'Im Spiel ist etwas schiefgegangen. Ein Neustart hilft meistens.', errRetry: '↻ Neu starten',
    },
    pl: { voice: 'pl-PL',
      srcLbl: '🙂 Jak będziesz skakać?', accessLbl: 'Dostępność', voiceLbl: 'Głos',
      play: 'Gramy!', allGames: '← Wszystkie gry',
      cam: 'Kamera…', camAsking: 'Prosimy o kamerę…', camReady: 'Kamera gotowa!',
      camDenied: 'Brak kamery — możesz grać spacją.',
      track: 'Tracking…', trackReady: 'Tracking gotowy!', trackFail: 'Tracking niedostępny — zagraj spacją.',
      calRestT: 'Siedź spokojnie', calRestP: 'Posiedź chwilę nieruchomo, żebym zobaczył, jak wygląda spokój.',
      calGoT: 'Teraz pokaż mi!', calGoP: 'Zrób to kilka razy tak mocno, jak potrafisz:',
      calWeakT: 'Prawie tego nie widziałem', calWeakP: 'Ten ruch był za mały, żebym odróżnił go od siedzenia bez ruchu. Możemy spróbować jeszcze raz albo zagrasz spacją.',
      calNoCamT: 'Brak obrazu z kamery', calNoCamP: 'Kamera jest włączona, ale obraz nie dochodzi. Sprawdź, czy nie używa jej inny program, albo zagraj spacją.',
      calRetry: '↻ Spróbuj jeszcze raz', calUseKey: '␣ Użyj spacji',
      loading: 'Ładowanie gry…', lost: '👀 Nie widzę cię — wróć do kadru',
      setup: 'Dla dorosłych: wybierz zwierzę i tryb, potem naciśnij Start w grze.',
      quit: '← Wyjdź z gry',
      errT: 'Gra się zatrzymała', errP: 'Coś poszło nie tak w grze. Ponowne uruchomienie zwykle pomaga.', errRetry: '↻ Uruchom ponownie',
    },
    es: { voice: 'es-ES',
      srcLbl: '🙂 ¿Cómo vas a saltar?', accessLbl: 'Accesibilidad', voiceLbl: 'Voz',
      play: '¡A jugar!', allGames: '← Todos los juegos',
      cam: 'Cámara…', camAsking: 'Pidiendo la cámara…', camReady: '¡Cámara lista!',
      camDenied: 'Sin cámara — puedes jugar con la barra espaciadora.',
      track: 'Seguimiento…', trackReady: '¡Seguimiento listo!', trackFail: 'Seguimiento no disponible — usa la barra espaciadora.',
      calRestT: 'Quédate quieto', calRestP: 'Quédate lo más quieto que puedas un momento, para que vea cómo es el reposo.',
      calGoT: '¡Ahora enséñamelo!', calGoP: 'Hazlo lo más grande que puedas, varias veces:',
      calWeakT: 'Casi no lo he visto', calWeakP: 'El movimiento fue demasiado pequeño para distinguirlo de estar quieto. Podemos intentarlo otra vez, o juegas con la barra espaciadora.',
      calNoCamT: 'Sin imagen de la cámara', calNoCamP: 'La cámara está encendida pero no llega imagen. Comprueba que nada más la esté usando, o juega con la barra espaciadora.',
      calRetry: '↻ Intentar otra vez', calUseKey: '␣ Usar la barra espaciadora',
      loading: 'Cargando el juego…', lost: '👀 No te veo — vuelve a la imagen',
      setup: 'Para adultos: elige el animal y el modo, y pulsa Start en el juego.',
      quit: '← Salir del juego',
      errT: 'El juego se ha detenido', errP: 'Algo ha fallado dentro del juego. Volver a empezar suele arreglarlo.', errRetry: '↻ Empezar de nuevo',
    },
  };

  var LANG_BTNS = [['en', '🇬🇧', 'English'], ['de', '🇩🇪', 'Deutsch'], ['pl', '🇵🇱', 'Polski'], ['es', '🇪🇸', 'Español']];
  var SRC_ICON = {
    mouthOpen: '😮', browRaise: '🤨', headTilt: '🙃',
    handRaise: '✋', handOpen: '🖐️', key: '␣',
  };
  var MP = {
    face: {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js',
      base: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/',
      ctor: 'FaceMesh',
      opts: { maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 },
    },
    hands: {
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js',
      base: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/',
      ctor: 'Hands',
      opts: { maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.55, minTrackingConfidence: 0.45 },
    },
  };

  function TEMPLATE(cfg) {
    var icon = cfg.icon || '🦁';
    var langbtns = LANG_BTNS.map(function (l) {
      return '<button class="langbtn" data-l="' + l[0] + '"><span class="fl">' + l[1] + '</span>' + l[2] + '</button>';
    }).join('');
    return ''
    + '<div class="topnav"><div class="brand"><div class="brand-box">🎈</div>InclusionGames</div>'
    +   '<a href="/dashboard.html" class="back" id="backlink">← All games</a></div>'

    + '<div id="setupscreen" class="screen">'
    +   '<div class="langrow" id="langrow">' + langbtns + '</div>'
    +   '<div class="hero"><div class="tag" id="uiTag"></div><span class="game-icon">' + icon + '</span>'
    +     '<h1 class="gtitle"><span id="uiTitle"></span><em id="uiTitleEm"></em></h1>'
    +     '<p class="gdesc" id="uiDesc"></p><p class="quest" id="uiQuest"></p></div>'
    +   '<div class="grid2">'
    +     '<div class="card" style="grid-column:1/-1"><div class="clabel" id="uiSrcLbl"></div>'
    +       '<div class="pickrow" id="srcrow"></div></div>'
    +     '<div class="card" style="grid-column:1/-1"><div class="clabel" id="uiAccessLbl"></div>'
    +       '<div class="toglist"><div class="togrow"><span class="toglbl" id="uiVoiceLbl"></span>'
    +       '<div class="tog on" id="tvoice"></div></div></div></div>'
    +   '</div>'
    +   '<div class="camrow"><div class="cambox"><div class="sline" id="scam"><span class="sdot"></span></div>'
    +     '<div class="sline" id="smp"><span class="sdot"></span></div></div></div>'
    +   '<div class="gobar"><button class="gobtn" id="gobtn"></button></div>'
    + '</div>'

    + '<div class="calwrap hidden" id="calwrap"><div class="calbox">'
    +   '<div class="calface" id="calface">🙂</div>'
    +   '<h2 id="calT"></h2><p id="calP"></p>'
    +   '<div class="calbar"><i id="calfill"></i></div>'
    +   '<div class="calhint" id="calH"></div>'
    +   '<div class="calbtns hidden" id="calbtns">'
    +     '<button class="btn btnp" id="calretry"></button>'
    +     '<button class="btn btns" id="calkey"></button>'
    +   '</div>'
    + '</div></div>'

    /* His game, and nothing of mine drawn on top of it.
       A strip, and then his picture below it — not a HUD floating over
       it. It was a HUD, and on a phone it covered his "choose this
       next" panel, his AR button and his home button: his UI uses all
       four corners and both side columns, and mine used three of them.
       In games 43-45 the canvas is ours and an overlay is free. Here
       it costs him the one panel the letter mode is about, so the
       strip takes its own height off the top and his game keeps every
       pixel below it.

       What goes in the strip is only what tells a player the switch is
       alive: their own picture, and a meter showing what the camera
       makes of them. */
    + '<div id="ustage" class="hidden">'
    +   '<div id="uchrome">'
    +     '<button class="btn btns" id="uquit"></button>'
    +     '<div class="rcue hidden" id="rcue"></div>'
    +     '<div class="rmeter hidden" id="rmeter"><i class="fill" id="rmfill"></i><span class="mark" id="rmmark"></span></div>'
    +     '<video id="rvid" class="hidden" playsinline muted></video>'
    +   '</div>'
    +   '<div id="uview">'
    +     '<canvas id="unity-canvas" tabindex="-1"></canvas>'
    +     '<div id="uload"><div class="ubar"><i id="ubarfill"></i></div><div id="uloadtxt"></div></div>'
    /* When something throws inside the build, Unity's own handler
       calls alert(). A native modal is the wrong thing to put in
       front of a child — it cannot be read out, it cannot be pressed
       by a switch, and it freezes the page until somebody taps OK
       with a finger. This says the same thing in the game's language,
       and offers the one action that helps. */
    +     '<div id="uerr" class="hidden"><div class="uerrbox">'
    +       '<div class="uerri">🛠️</div><h2 id="uerrT"></h2><p id="uerrP"></p>'
    +       '<button class="btn btnp" id="uerrgo"></button>'
    +     '</div></div>'
    +   '</div>'
    + '</div>';
  }

  function IG_UNITY_GAME(cfg) {
    if (!SW) { global.console && console.error('[unity-switch] switch-input.js must load first'); return; }
    document.body.insertAdjacentHTML('afterbegin', TEMPLATE(cfg));

    var $ = function (id) { return document.getElementById(id); };
    function setText(id, s) { var e = $(id); if (e) e.textContent = s; }
    function show(id, on) { var e = $(id); if (e) e.classList.toggle('hidden', !on); }

    var lang = 'en', T = T4.en;
    var srcId = 'mouthOpen', voice = true;
    var cal = null, calSource = null, sw = null;
    var stream = null, mp = null, mpKind = null, mpReady = false;
    var unity = null, playing = false, lostFace = false;
    var meterN = 0, fired = 0, lastSeenAt = 0;
    var calPhase = null, calibrator = null;

    try { var saved = localStorage.getItem('ig_lang'); if (saved && T4[saved]) lang = saved; } catch (e) {}

    function applyLang() {
      T = T4[lang] || T4.en;
      var t = (cfg.text && (cfg.text[lang] || cfg.text.en)) || {};
      setText('uiTag', t.tag || ''); setText('uiTitle', t.title || '');
      setText('uiTitleEm', t.titleEm || ''); setText('uiDesc', t.desc || '');
      setText('uiQuest', t.quest || '');
      setText('uiSrcLbl', T.srcLbl); setText('uiAccessLbl', T.accessLbl);
      setText('uiVoiceLbl', T.voiceLbl);
      setText('gobtn', T.play); setText('backlink', T.allGames);
      setText('calretry', T.calRetry); setText('calkey', T.calUseKey);
      setText('uquit', T.quit); setText('uloadtxt', T.loading);
      setText('uerrT', T.errT); setText('uerrP', T.errP); setText('uerrgo', T.errRetry);
      if (!$('scam').textContent.trim()) $('scam').innerHTML = '<span class="sdot"></span>' + T.cam;
      if (!$('smp').textContent.trim()) $('smp').innerHTML = '<span class="sdot"></span>' + T.track;
      buildSrcRow();
      document.documentElement.lang = lang;
      LANG_BTNS.forEach(function (l) {
        var b = document.querySelector('.langbtn[data-l="' + l[0] + '"]');
        if (b) b.classList.toggle('on', l[0] === lang);
      });
    }

    function buildSrcRow() {
      $('srcrow').innerHTML = SW.sourceIds().map(function (id) {
        var s = SW.SOURCES[id];
        var label = (s.label && (s.label[lang] || s.label.en)) || id;
        return '<button class="pick' + (id === srcId ? ' on' : '') + '" data-src="' + id + '">'
          + '<span class="ic">' + (SRC_ICON[id] || '🙂') + '</span>' + label + '</button>';
      }).join('');
      Array.prototype.forEach.call($('srcrow').children, function (b) {
        b.onclick = function () {
          srcId = b.getAttribute('data-src');
          cal = null; calSource = null;        // a new movement needs its own measurement
          buildSrcRow();
        };
      });
    }

    LANG_BTNS.forEach(function (l) {
      var b = document.querySelector('.langbtn[data-l="' + l[0] + '"]');
      if (b) b.onclick = function () { lang = l[0]; try { localStorage.setItem('ig_lang', lang); } catch (e) {} applyLang(); };
    });
    $('tvoice').onclick = function () { $('tvoice').classList.toggle('on'); };

    function say(s) {
      if (!voice || !global.speechSynthesis) return;
      try {
        var u = new SpeechSynthesisUtterance(s);
        u.lang = T.voice; u.rate = 0.95;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) {}
    }

    /* ── Camera ─────────────────────────────────────────────── */
    function showVideo() {
      var v = $('rvid');
      v.classList.remove('hidden');
      if (v.srcObject !== stream) v.srcObject = stream;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      return new Promise(function (res) {
        if (v.readyState >= 2 && v.videoWidth > 0) return res(true);
        var done = false;
        function finish(ok) { if (done) return; done = true; clearInterval(poll); clearTimeout(bail); res(ok); }
        var poll = setInterval(function () { if (v.readyState >= 2 && v.videoWidth > 0) finish(true); }, 100);
        var bail = setTimeout(function () { finish(false); }, 6000);
      });
    }

    function initCam() {
      if (stream) return Promise.resolve(true);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        $('scam').className = 'sline warn';
        $('scam').innerHTML = '<span class="sdot"></span>' + T.camDenied;
        return Promise.resolve(false);
      }
      $('scam').className = 'sline';
      $('scam').innerHTML = '<span class="sdot"></span>' + T.camAsking;
      return navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }, audio: false,
      }).then(function (s) {
        stream = s;
        return showVideo().then(function (ok) {
          $('scam').className = ok ? 'sline ok' : 'sline warn';
          $('scam').innerHTML = '<span class="sdot"></span>' + (ok ? T.camReady : T.camDenied);
          return ok;
        });
      }).catch(function () {
        $('scam').className = 'sline warn';
        $('scam').innerHTML = '<span class="sdot"></span>' + T.camDenied;
        return false;
      });
    }

    function stopCam() {
      if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
      var v = $('rvid'); if (v) { try { v.srcObject = null; } catch (e) {} v.classList.add('hidden'); }
    }
    global.addEventListener('pagehide', stopCam);

    /* ── Tracker ────────────────────────────────────────────── */
    var loaded = {};
    function loadScript(url) {
      if (loaded[url]) return loaded[url];
      loaded[url] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = url; s.crossOrigin = 'anonymous';
        s.onload = function () { res(true); }; s.onerror = function () { rej(new Error('load')); };
        document.head.appendChild(s);
      });
      return loaded[url];
    }

    function initTracker(kind) {
      if (mp && mpKind === kind) return Promise.resolve(true);
      var spec = MP[kind];
      $('smp').className = 'sline';
      $('smp').innerHTML = '<span class="sdot"></span>' + T.track;
      if (global.IG_TRACKER_STUB) {
        mp = global.IG_TRACKER_STUB(kind, onFrame); mpKind = kind; mpReady = true;
        $('smp').className = 'sline ok';
        $('smp').innerHTML = '<span class="sdot"></span>' + T.trackReady;
        return Promise.resolve(true);
      }
      return loadScript(spec.url).then(function () {
        var Ctor = global[spec.ctor];
        if (!Ctor) throw new Error('ctor');
        var inst = new Ctor({ locateFile: function (f) { return spec.base + f; } });
        inst.setOptions(spec.opts);
        inst.onResults(onFrame);
        return inst.initialize().then(function () {
          mp = inst; mpKind = kind; mpReady = true;
          $('smp').className = 'sline ok';
          $('smp').innerHTML = '<span class="sdot"></span>' + T.trackReady;
          return true;
        });
      }).catch(function () {
        mpReady = false;
        $('smp').className = 'sline warn';
        $('smp').innerHTML = '<span class="sdot"></span>' + T.trackFail;
        return false;
      });
    }

    var pumping = false;
    function pump() {
      if (!pumping) return;
      var v = $('rvid');
      if (mp && v && v.readyState >= 2) { try { mp.send({ image: v }).catch(function () {}); } catch (e) {} }
      requestAnimationFrame(pump);
    }
    function startPump() { if (!pumping) { pumping = true; requestAnimationFrame(pump); } }
    function stopPump() { pumping = false; }

    function onFrame(res) {
      var raw = SW.read(srcId, res);
      var now = (global.performance && performance.now()) || Date.now();

      if (calPhase) {
        if (raw != null) {
          if (calPhase === 'rest') calibrator.restSample(raw); else calibrator.effortSample(raw);
          lastSeenAt = now;
          var lo = calibrator.rest.length ? SW.median(calibrator.rest) : raw;
          var pk = calibrator.effort.length ? Math.max.apply(null, calibrator.effort) : raw;
          var span = Math.max(1e-6, pk - lo);
          $('calfill').style.width = Math.max(4, Math.min(100, ((raw - lo) / span) * 100)) + '%';
        }
        return;
      }

      if (!sw) return;
      if (raw != null) lastSeenAt = now;
      var out = sw.update(raw, now);
      meterN = out.n;
      $('rmfill').style.height = Math.min(100, (meterN / 1.2) * 100) + '%';
      $('rmeter').classList.toggle('fired', now - fired < 180);

      /* Out of shot is a seating problem. Say so, but do not try to
         pause his game — nothing in it knows how, and a wrong guess at
         pausing someone else's game is worse than a clear message. */
      var gone = now - lastSeenAt > 900;
      if (gone !== lostFace) {
        lostFace = gone;
        $('rcue').classList.toggle('warn', gone);
        setText('rcue', gone ? T.lost : cue());
        if (!gone && sw) sw.lost();
      }

      // Flash the meter only for a movement that actually jumped, so
      // the mark means "that one counted" and not "that one was seen".
      if (out.pressed && sendJump()) fired = now;
    }

    function cue() {
      var c = SW.SOURCES[srcId].cue;
      return (c && (c[lang] || c.en)) || '';
    }

    /* ── The bridge ───────────────────────────────────────────
       A movement calls his jump method. It does not press a key, and
       that distinction is the whole of this section.

       A Space keydown reaches his Jump() by TWO routes at once:

         1. Character_Controller.Update() — if (Input.GetKeyDown(Space))
         2. the EventSystem — InputManager.asset binds the UI "Submit"
            axis to `altPositiveButton: space`, so the same keystroke
            fires onClick on whichever button happens to be selected,
            and his jump button's onClick is wired straight to
            Character_Controller.Jump.

       Two calls, two AddForce impulses, from one press — so a mouth or
       a hand sent the animal about twice as high as his own jump
       button. Sending fewer events never fixed it: the fault was one
       event taking two paths inside Unity, not too many events.

       SendMessage goes to the single method his button goes to:
         jump button onClick -> m_TargetAssemblyTypeName:
         Character_Controller, m_MethodName: Jump, on the GameObject
         named "Characters" (the same object in SampleScene,
         SampleScene Alphabates and SampleScene Numbers).
       One call, one impulse, identical to a tap of his button. It also
       means a mouth or a hand can no longer trip whatever menu button
       is selected, which Space could.

       If that object or method is ever renamed, the jump stops with no
       error of any kind — Unity logs a missing-object message and
       carries on. tools/unity/README.md says so next to the rebuild
       recipe.

       The wait below is his, too. Character_Controller.Jump() has no
       grounded check; the only thing stopping a second one is that
       GameManager.JumpDisable() switches his on-screen button off and
       Invoke("JumpEnable", 0.9f) switches it back on. Calling the
       method directly skips that button, so without the wait a held
       movement would stack impulses and float the animal — which is
       exactly what it did. If his cooldown changes, this is the
       number to match. */
    var JUMP_COOLDOWN_MS = 900;
    var lastJumpAt = -1e9;
    var JUMP_OBJECT = 'Characters';
    var JUMP_METHOD = 'Jump';

    function sendJump() {
      var t = (global.performance && performance.now) ? performance.now() : Date.now();
      if (t - lastJumpAt < JUMP_COOLDOWN_MS) return false;
      // Not ready yet: do not spend the cooldown on a jump that never
      // happened, or the next real movement would be refused too.
      if (!unity || !unity.SendMessage) return false;
      try { unity.SendMessage(JUMP_OBJECT, JUMP_METHOD); } catch (e) { return false; }
      lastJumpAt = t;
      return true;
    }

    /* ── Calibration ────────────────────────────────────────── */
    function srcLabel() {
      var s = SW.SOURCES[srcId];
      return (s && s.label && (s.label[lang] || s.label.en)) || srcId;
    }

    function calibrate() {
      calibrator = new SW.Calibrator();
      show('calwrap', true); show('calbtns', false);
      $('rvid').classList.remove('hidden');
      $('calfill').style.width = '0%';

      return phase('rest', 2600).then(function () { return phase('effort', 5200); })
        .then(function () {
          calPhase = null;
          cal = calibrator.finish();
          calSource = cal.weak ? null : srcId;
          if (cal.weak) return weak();
          show('calwrap', false);
          return true;
        });

      function phase(which, ms) {
        calPhase = which;
        setText('calface', which === 'rest' ? '😐' : '💪');
        setText('calT', which === 'rest' ? T.calRestT : T.calGoT);
        setText('calP', which === 'rest' ? T.calRestP : (T.calGoP + ' ' + srcLabel()));
        say(which === 'rest' ? T.calRestT : (T.calGoT + ' ' + srcLabel()));
        return new Promise(function (res) {
          var t0 = Date.now();
          var iv = setInterval(function () {
            var left = Math.max(0, ms - (Date.now() - t0));
            setText('calH', Math.ceil(left / 1000) + 's');
            if (left <= 0) { clearInterval(iv); setText('calH', ''); res(); }
          }, 100);
        });
      }

      function weak() {
        var blind = cal.restSamples === 0 && cal.effortSamples === 0;
        setText('calface', blind ? '📷' : '🤔');
        setText('calT', blind ? T.calNoCamT : T.calWeakT);
        setText('calP', blind ? T.calNoCamP : T.calWeakP);
        setText('calH', '');
        show('calbtns', true);
        say(blind ? T.calNoCamT : T.calWeakT);
        return new Promise(function (res) {
          $('calretry').onclick = function () { show('calbtns', false); calibrate().then(res); };
          $('calkey').onclick = function () {
            srcId = 'key'; cal = null; calSource = null; calPhase = null;
            stopPump(); stopCam();
            show('calwrap', false); buildSrcRow(); res(true);
          };
        });
      }
    }

    /* ── Starting ───────────────────────────────────────────── */
    $('gobtn').onclick = function () {
      var btn = $('gobtn');
      if (btn.disabled) return;
      btn.disabled = true;
      voice = $('tvoice').classList.contains('on');

      Promise.resolve().then(function () {
        var src = SW.SOURCES[srcId];
        if (!src || src.tracker === 'none') return true;
        return initCam().then(function (ok) {
          if (!ok) { srcId = 'key'; buildSrcRow(); return true; }
          return initTracker(src.tracker).then(function (tok) {
            if (!tok) { srcId = 'key'; buildSrcRow(); stopCam(); return true; }
            startPump();
            if (cal && calSource === srcId && !cal.weak) return true;
            return calibrate();
          });
        });
      }).then(function () {
        btn.disabled = false;
        beginPlay();
      }).catch(function () {
        btn.disabled = false; srcId = 'key'; buildSrcRow(); beginPlay();
      });
    };

    function beginPlay() {
      var usingCam = SW.SOURCES[srcId].tracker !== 'none' && !!stream;
      sw = cal ? new SW.Switch(cal) : null;

      lastJumpAt = -1e9;          // a fresh round starts off cooldown
      /* The site's own top bar sits over his AR button and his
         "choose this next" panel, and the strip already carries a way
         out. It goes away for the duration of the game. */
      document.body.classList.add('uplaying');
      show('setupscreen', false);
      show('ustage', true);
      patchAlert();
      show('rcue', true);
      show('rmeter', usingCam);
      $('rvid').classList.toggle('hidden', !usingCam);
      setText('rcue', cue());

      if (usingCam && cal) {
        var span = Math.max(1e-6, cal.peak - cal.base);
        $('rmmark').style.bottom = Math.min(96, ((cal.press - cal.base) / span) / 1.2 * 100) + '%';
      }

      playing = true;
      say(T.setup);
      loadUnity();
    }

    /* ── His build ──────────────────────────────────────────── */
    function loadUnity() {
      if (unity) { show('uload', false); return; }
      var base = cfg.build;
      var conf = {
        dataUrl: base + '/Build/WebBuild.data.unityweb',
        frameworkUrl: base + '/Build/WebBuild.framework.js.unityweb',
        codeUrl: base + '/Build/WebBuild.wasm.unityweb',
        streamingAssetsUrl: base + '/StreamingAssets',
        companyName: cfg.company || 'InclusionGames',
        productName: cfg.product || 'Animal Run',
        productVersion: cfg.version || '1.0',
      };
      var s = document.createElement('script');
      s.src = base + '/Build/WebBuild.loader.js';
      s.onerror = function () { setText('uloadtxt', 'Could not load the game.'); };
      s.onload = function () {
        global.createUnityInstance($('unity-canvas'), conf, function (p) {
          $('ubarfill').style.width = Math.round(p * 100) + '%';
        }).then(function (inst) {
          unity = inst;
          show('uload', false);
          sizeCanvas();
          $('unity-canvas').focus();
        }).catch(function (e) {
          setText('uloadtxt', String(e));
        });
      };
      document.head.appendChild(s);
    }

    /* Unity's framework answers an uncaught error with alert(). On a
       phone that is a native modal the child cannot dismiss, over a
       page that is frozen until somebody taps OK — and the game is
       already gone by then, so there is nothing to protect. Take the
       message, show it the way the rest of the page talks, and leave
       the strip reachable behind it.

       Only Unity's own wording is intercepted; any other alert on the
       page still behaves normally. */
    var nativeAlert = global.alert;
    var alertPatched = false;
    function patchAlert() {
      if (alertPatched) return;
      alertPatched = true;
      global.alert = function (msg) {
        var s = String(msg == null ? '' : msg);
        if (/Unity content/i.test(s)) {
          if (global.console) console.error('[unity] ' + s);
          show('uerr', true);
          return undefined;
        }
        return nativeAlert.apply(global, arguments);
      };
    }
    function unpatchAlert() {
      if (!alertPatched) return;
      alertPatched = false;
      global.alert = nativeAlert;
    }
    $('uerrgo').onclick = function () { global.location.reload(); };

    /* Unity sizes its drawing buffer from the canvas attributes, not
       from CSS; without this the game renders at 300x150 and is then
       stretched across the screen. */
    function sizeCanvas() {
      var c = $('unity-canvas');
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      var r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    }
    global.addEventListener('resize', function () { if (unity) sizeCanvas(); });

    /* The space bar works whatever movement was chosen, so an adult can
       always help — and it has to jump by exactly as much as a
       movement does, and as his own button does.

       A real Space reaching Unity takes the same two routes a
       synthetic one did (Update's GetKeyDown, and the UI "Submit"
       axis, which InputManager.asset binds to space), so it would
       jump twice as high as the button an adult is standing next to.
       Catch it on the way in, before Unity's own handler on the
       document, and route it through the one path everything else
       uses. Capture on window runs first; stopping it there is what
       keeps Unity from seeing the key at all. */
    global.addEventListener('keydown', function (e) {
      if (!playing) return;
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      sendJump();
    }, true);
    global.addEventListener('keyup', function (e) {
      if (!playing) return;
      if (e.code === 'Space' || e.key === ' ') e.stopImmediatePropagation();
    }, true);

    $('uquit').onclick = function () {
      stopPump(); stopCam();
      playing = false;
      document.body.classList.remove('uplaying');
      unpatchAlert();
      show('uerr', false);
      show('ustage', false); show('rcue', false); show('rmeter', false);
      show('setupscreen', true);
      if (unity && unity.Quit) { try { unity.Quit(); } catch (e) {} }
      unity = null;
      var c = $('unity-canvas');
      if (c) { var n = c.cloneNode(false); c.parentNode.replaceChild(n, c); }
      show('uload', true);
      $('ubarfill').style.width = '0%';
    };

    document.body.classList.add('ig-unity');
    applyLang();
    $('gobtn').disabled = false;

    /* The setup screen can open part-way down — Chrome's scroll
       anchoring moves it while the web font and the emoji in the pick
       buttons are still settling, which puts the title and the
       language buttons above the top edge. The CSS opts the box out of
       anchoring; this puts it back for anything else that might move
       it, once the fonts have actually landed. */
    function toTop() { var s = $('setupscreen'); if (s && !playing) s.scrollTop = 0; }
    toTop();
    global.addEventListener('load', toTop);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(toTop);

    global.IG_UNITY_DEBUG = {
      jump: sendJump,
      state: function () {
        return {
          playing: playing, srcId: srcId, cal: cal, lostFace: lostFace,
          unityLoaded: !!unity, hasCam: !!stream, mpReady: mpReady, n: meterN,
          presses: sw ? sw.presses : 0,
        };
      },
    };
  }

  global.IG_UNITY_GAME = IG_UNITY_GAME;
})(typeof window !== 'undefined' ? window : this);

/* ============================================================
 * InclusionGames — Animal Run, the part with a screen.
 *
 * Call IG_RUNNER_GAME(config) from each gameNN.html. This builds the
 * UI, asks for the camera, calibrates the chosen movement, and runs
 * the loop. The game itself lives in runner-core.js and knows nothing
 * about any of this; the press comes from switch-input.js.
 *
 * Load order matters:
 *   game-engine.css, runner-engine.css
 *   switch-input.js, runner-core.js, runner-engine.js
 *
 * config = {
 *   id:'game43',                    // must match /^game\d{1,3}$/
 *   icon:'🦁',
 *   mode:'classic' | 'letters',
 *   sequence:[...] | null,          // letters mode: what to catch, in order
 *   goal:8,
 *   text:{ en:{tag,title,titleEm,desc,quest,questLbl}, de,pl,es }
 * }
 *
 * ── Three things here exist because of how players fail ──────
 * 1. The space bar always works, whatever movement was chosen. A
 *    teacher sitting beside a child has to be able to help, and a
 *    camera that stops cooperating must not end the session.
 * 2. Losing the face or the hand pauses the game. It does not carry
 *    on taking lives off someone who has drifted out of shot — that
 *    turns a seating problem into a score.
 * 3. There is a meter showing the movement as the camera sees it,
 *    with the player's own press point marked. Without it, "not quite
 *    enough movement" and "the camera is broken" look identical.
 * ============================================================ */
(function (global) {
  'use strict';

  var SW = global.IG_SWITCH;
  var RC = global.IG_RUNNER;

  var T4 = {
    en: {
      voice: 'en-US',
      srcLbl: '🙂 How will you jump?', animalLbl: '🦁 Choose your animal',
      diffLbl: '⏱️ How much time to react?',
      dLots: 'Lots of time', dNormal: 'Normal', dQuick: 'Quick',
      accessLbl: 'Accessibility', voiceLbl: 'Voice', hintLbl: 'Show me when to jump',
      play: 'Play!', allGames: '← All games',
      cam: 'Camera…', camAsking: 'Asking for the camera…', camReady: 'Camera ready!',
      camDenied: 'No camera — you can play with the space bar.',
      track: 'Tracking…', trackReady: 'Tracking ready!', trackFail: 'Tracking unavailable — space bar it is.',
      calRestT: 'Sit still', calRestP: 'Stay as still as you can for a moment, so I can see what resting looks like.',
      calGoT: 'Now show me!', calGoP: 'Do it as big as you can, a few times:',
      calWeakT: 'I could hardly see that', calWeakP: 'That movement was too small for me to tell apart from sitting still. We can try again, or you can play with the space bar.',
      calNoCamT: 'No picture from the camera', calNoCamP: 'The camera is switched on but no picture is coming through. Check that nothing else is using it, or play with the space bar.',
      calRetry: '↻ Try again', calUseKey: '␣ Use the space bar', calSkip: 'Skip',
      ready: 'Get ready…',
      lives: 'LIVES', points: 'POINTS', toCatch: 'CATCH',
      lost: '👀 I cannot see you — move back into the picture',
      pauseBtn: '⏸️ Break', pauseT: '⏸️ BREAK', pauseP: 'Press the button, or Escape, to carry on',
      wonT: 'You did it! 👑', wonS: 'All of them caught — you are a hero!',
      deadT: 'Good try!', deadS: 'Have another go — you were close.',
      sCaught: 'Caught', sNeeded: 'Needed', sTime: 'Time',
      again: 'Play again!', settings: 'Settings',
      wonSpeech: 'You did it! Amazing!',
      scored: function (s, t) { return 'You caught ' + s + ' out of ' + t + '!'; },
    },
    de: {
      voice: 'de-DE',
      srcLbl: '🙂 Wie springst du?', animalLbl: '🦁 Wähle dein Tier',
      diffLbl: '⏱️ Wie viel Zeit brauchst du?',
      dLots: 'Viel Zeit', dNormal: 'Normal', dQuick: 'Schnell',
      accessLbl: 'Barrierefreiheit', voiceLbl: 'Sprachausgabe', hintLbl: 'Zeig mir, wann ich springen soll',
      play: 'Los geht’s!', allGames: '← Alle Spiele',
      cam: 'Kamera…', camAsking: 'Kamera wird angefragt…', camReady: 'Kamera bereit!',
      camDenied: 'Keine Kamera — du kannst mit der Leertaste spielen.',
      track: 'Tracking…', trackReady: 'Tracking bereit!', trackFail: 'Tracking nicht verfügbar — dann mit der Leertaste.',
      calRestT: 'Ganz still sitzen', calRestP: 'Bleib einen Moment so still wie möglich, damit ich sehe, wie Ruhe aussieht.',
      calGoT: 'Jetzt zeig es mir!', calGoP: 'Mach es ein paar Mal so groß wie du kannst:',
      calWeakT: 'Das konnte ich kaum sehen', calWeakP: 'Die Bewegung war zu klein, um sie vom Stillsitzen zu unterscheiden. Wir können es nochmal versuchen, oder du spielst mit der Leertaste.',
      calNoCamT: 'Kein Bild von der Kamera', calNoCamP: 'Die Kamera ist an, aber es kommt kein Bild an. Prüfe, ob sie von etwas anderem benutzt wird, oder spiele mit der Leertaste.',
      calRetry: '↻ Nochmal versuchen', calUseKey: '␣ Leertaste benutzen', calSkip: 'Überspringen',
      ready: 'Bereit machen…',
      lives: 'LEBEN', points: 'PUNKTE', toCatch: 'FANGEN',
      lost: '👀 Ich sehe dich nicht — komm zurück ins Bild',
      pauseBtn: '⏸️ Pause', pauseT: '⏸️ PAUSE', pauseP: 'Drücke den Knopf oder Escape, um weiterzuspielen',
      wonT: 'Geschafft! 👑', wonS: 'Alle gefangen — du bist ein Held!',
      deadT: 'Gut versucht!', deadS: 'Versuch es nochmal — du warst nah dran.',
      sCaught: 'Gefangen', sNeeded: 'Nötig', sTime: 'Zeit',
      again: 'Nochmal!', settings: 'Einstellungen',
      wonSpeech: 'Geschafft! Wunderbar!',
      scored: function (s, t) { return 'Du hast ' + s + ' von ' + t + ' gefangen!'; },
    },
    pl: {
      voice: 'pl-PL',
      srcLbl: '🙂 Jak będziesz skakać?', animalLbl: '🦁 Wybierz zwierzę',
      diffLbl: '⏱️ Ile czasu potrzebujesz?',
      dLots: 'Dużo czasu', dNormal: 'Normalnie', dQuick: 'Szybko',
      accessLbl: 'Dostępność', voiceLbl: 'Głos', hintLbl: 'Pokaż mi, kiedy skoczyć',
      play: 'Gramy!', allGames: '← Wszystkie gry',
      cam: 'Kamera…', camAsking: 'Prosimy o kamerę…', camReady: 'Kamera gotowa!',
      camDenied: 'Brak kamery — możesz grać spacją.',
      track: 'Tracking…', trackReady: 'Tracking gotowy!', trackFail: 'Tracking niedostępny — zagraj spacją.',
      calRestT: 'Siedź spokojnie', calRestP: 'Posiedź chwilę nieruchomo, żebym zobaczył, jak wygląda spokój.',
      calGoT: 'Teraz pokaż mi!', calGoP: 'Zrób to kilka razy tak mocno, jak potrafisz:',
      calWeakT: 'Prawie tego nie widziałem', calWeakP: 'Ten ruch był za mały, żebym odróżnił go od siedzenia bez ruchu. Możemy spróbować jeszcze raz albo zagrasz spacją.',
      calNoCamT: 'Brak obrazu z kamery', calNoCamP: 'Kamera jest włączona, ale obraz nie dochodzi. Sprawdź, czy nie używa jej inny program, albo zagraj spacją.',
      calRetry: '↻ Spróbuj jeszcze raz', calUseKey: '␣ Użyj spacji', calSkip: 'Pomiń',
      ready: 'Przygotuj się…',
      lives: 'ŻYCIA', points: 'PUNKTY', toCatch: 'ZŁAP',
      lost: '👀 Nie widzę cię — wróć do kadru',
      pauseBtn: '⏸️ Przerwa', pauseT: '⏸️ PRZERWA', pauseP: 'Naciśnij przycisk lub Escape, aby grać dalej',
      wonT: 'Udało się! 👑', wonS: 'Wszystkie złapane — jesteś bohaterem!',
      deadT: 'Dobra próba!', deadS: 'Zagraj jeszcze raz — było blisko.',
      sCaught: 'Złapane', sNeeded: 'Potrzebne', sTime: 'Czas',
      again: 'Jeszcze raz!', settings: 'Ustawienia',
      wonSpeech: 'Udało się! Wspaniale!',
      scored: function (s, t) { return 'Złapałeś ' + s + ' z ' + t + '!'; },
    },
    es: {
      voice: 'es-ES',
      srcLbl: '🙂 ¿Cómo vas a saltar?', animalLbl: '🦁 Elige tu animal',
      diffLbl: '⏱️ ¿Cuánto tiempo necesitas?',
      dLots: 'Mucho tiempo', dNormal: 'Normal', dQuick: 'Rápido',
      accessLbl: 'Accesibilidad', voiceLbl: 'Voz', hintLbl: 'Enséñame cuándo saltar',
      play: '¡A jugar!', allGames: '← Todos los juegos',
      cam: 'Cámara…', camAsking: 'Pidiendo la cámara…', camReady: '¡Cámara lista!',
      camDenied: 'Sin cámara — puedes jugar con la barra espaciadora.',
      track: 'Seguimiento…', trackReady: '¡Seguimiento listo!', trackFail: 'Seguimiento no disponible — usa la barra espaciadora.',
      calRestT: 'Quédate quieto', calRestP: 'Quédate lo más quieto que puedas un momento, para que vea cómo es el reposo.',
      calGoT: '¡Ahora enséñamelo!', calGoP: 'Hazlo lo más grande que puedas, varias veces:',
      calWeakT: 'Casi no lo he visto', calWeakP: 'El movimiento fue demasiado pequeño para distinguirlo de estar quieto. Podemos intentarlo otra vez, o juegas con la barra espaciadora.',
      calNoCamT: 'Sin imagen de la cámara', calNoCamP: 'La cámara está encendida pero no llega imagen. Comprueba que nada más la esté usando, o juega con la barra espaciadora.',
      calRetry: '↻ Intentar otra vez', calUseKey: '␣ Usar la barra espaciadora', calSkip: 'Omitir',
      ready: 'Prepárate…',
      lives: 'VIDAS', points: 'PUNTOS', toCatch: 'ATRAPA',
      lost: '👀 No te veo — vuelve a la imagen',
      pauseBtn: '⏸️ Pausa', pauseT: '⏸️ PAUSA', pauseP: 'Pulsa el botón, o Escape, para continuar',
      wonT: '¡Lo lograste! 👑', wonS: '¡Todos atrapados — eres un héroe!',
      deadT: '¡Buen intento!', deadS: 'Inténtalo otra vez — estuviste cerca.',
      sCaught: 'Atrapados', sNeeded: 'Necesarios', sTime: 'Tiempo',
      again: '¡Otra vez!', settings: 'Ajustes',
      wonSpeech: '¡Lo lograste! ¡Increíble!',
      scored: function (s, t) { return '¡Atrapaste ' + s + ' de ' + t + '!'; },
    },
  };

  var LANG_BTNS = [['en', '🇬🇧', 'English'], ['de', '🇩🇪', 'Deutsch'], ['pl', '🇵🇱', 'Polski'], ['es', '🇪🇸', 'Español']];
  var ANIMAL_ORDER = ['lion', 'elephant', 'giraffe', 'crocodile', 'hippo'];
  /* One icon per movement. They were all a plain smiling face, which
     told a child choosing between "open your mouth", "raise your
     eyebrows" and "tilt your head" absolutely nothing — and a child
     who cannot yet read is exactly who this picker is for. */
  var SRC_ICON = {
    mouthOpen: '😮', browRaise: '🤨', headTilt: '🙃',
    handRaise: '✋', handOpen: '🖐️', key: '␣',
  };
  var DIFFS = [['gentle', 'dLots'], ['standard', 'dNormal'], ['challenge', 'dQuick']];

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
    + '<canvas id="stage"></canvas>'
    + '<video id="rvid" class="hidden" playsinline muted></video>'
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
    +     '<div class="card"><div class="clabel" id="uiAnimalLbl"></div><div class="pickrow" id="animrow"></div></div>'
    +     '<div class="card"><div class="clabel" id="uiDiffLbl"></div><select class="sel" id="diffsel"></select></div>'
    +     '<div class="card" style="grid-column:1/-1"><div class="clabel" id="uiAccessLbl"></div><div class="toglist">'
    +       '<div class="togrow"><span class="toglbl" id="uiHintLbl"></span><div class="tog on" id="thint"></div></div>'
    +       '<div class="togrow"><span class="toglbl" id="uiVoiceLbl"></span><div class="tog on" id="tvoice"></div></div>'
    +     '</div></div>'
    +   '</div>'
    +   '<div class="camrow"><div class="cambox"><div class="sline" id="scam"><span class="sdot"></span></div>'
    +     '<div class="sline" id="smp"><span class="sdot"></span></div></div></div>'
    +   '<button class="gobtn" id="gobtn"></button>'
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

    + '<div class="rhud hidden" id="rhud">'
    +   '<div class="rbadge"><span class="rlbl" id="uiLives"></span><div class="rlives" id="rlives"></div></div>'
    +   '<div class="rbadge rnext" id="rnextbox"><span class="rlbl" id="uiToCatch"></span><div class="big" id="rnext"></div></div>'
    +   '<div class="rbadge"><span class="rlbl" id="uiPoints"></span><div class="rnum" id="rscore">0</div></div>'
    + '</div>'
    + '<button class="btn btns" id="rpause"></button>'
    + '<div class="rmeter hidden" id="rmeter"><i class="fill" id="rmfill"></i><span class="mark" id="rmmark"></span></div>'
    + '<div class="rcue hidden" id="rcue"></div>'
    + '<div id="rcount" class="hidden"></div>'

    + '<div id="resultscreen" class="screen hidden"><div id="re" class="remoji">🏆</div>'
    +   '<div id="rt" class="rtitle"></div><div id="rsub" class="rsub"></div><div id="rstar" class="rstars"></div>'
    +   '<div class="rstats"><div class="rstat"><div class="rsn" id="rs1">0</div><div class="rsl" id="uiCaught"></div></div>'
    +   '<div class="rstat"><div class="rsn" id="rs2">0</div><div class="rsl" id="uiNeeded"></div></div>'
    +   '<div class="rstat"><div class="rsn" id="rs3">0:00</div><div class="rsl" id="uiTimeLbl"></div></div></div>'
    +   '<div class="rbtns"><button class="btn btnp" id="uiAgain"></button>'
    +     '<button class="btn btns" id="uiSettings"></button>'
    +     '<a href="/dashboard.html" class="btn btnr" id="uiAllGames2" style="text-decoration:none;"></a></div></div>'

    + '<div id="pauseov" class="hidden"><div class="pauseT" id="uiPauseT"></div><div class="pauseH" id="uiPauseP"></div></div>';
  }

  function IG_RUNNER_GAME(cfg) {
    if (!SW || !RC) { global.console && console.error('[runner] switch-input.js and runner-core.js must load first'); return; }

    /* afterbegin, not innerHTML: the page's own <script> is still
       running inside this body and rewriting innerHTML would re-parse
       and re-run it. */
    document.body.insertAdjacentHTML('afterbegin', TEMPLATE(cfg));

    var $ = function (id) { return document.getElementById(id); };
    function setText(id, s) { var e = $(id); if (e) e.textContent = s; }
    function show(id, on) { var e = $(id); if (e) e.classList.toggle('hidden', !on); }

    var lang = 'en', T = T4.en;
    var srcId = 'mouthOpen', animal = 'lion', diff = 'standard';
    var voice = true, hint = true;
    var cal = null, sw = null, game = null;
    var stream = null, mp = null, mpKind = null, mpReady = false;
    var running = false, paused = false, pausedByTracking = false;
    var pendingPress = false, lastSeenAt = 0, meterN = 0, fired = 0;
    var raf = null, lastTs = 0, startedAt = 0;
    var childGoal = null, childDiff = null;

    /* ── Language ───────────────────────────────────────────── */
    try { var saved = localStorage.getItem('ig_lang'); if (saved && T4[saved]) lang = saved; } catch (e) {}

    function applyLang() {
      T = T4[lang] || T4.en;
      var t = (cfg.text && (cfg.text[lang] || cfg.text.en)) || {};
      setText('uiTag', t.tag || ''); setText('uiTitle', t.title || '');
      setText('uiTitleEm', t.titleEm || ''); setText('uiDesc', t.desc || '');
      setText('uiQuest', t.quest || '');
      setText('uiSrcLbl', T.srcLbl); setText('uiAnimalLbl', T.animalLbl);
      setText('uiDiffLbl', T.diffLbl); setText('uiAccessLbl', T.accessLbl);
      setText('uiHintLbl', T.hintLbl); setText('uiVoiceLbl', T.voiceLbl);
      setText('gobtn', T.play); setText('backlink', T.allGames);
      setText('uiLives', T.lives); setText('uiPoints', T.points); setText('uiToCatch', T.toCatch);
      setText('rpause', T.pauseBtn);
      setText('uiPauseT', T.pauseT); setText('uiPauseP', T.pauseP);
      setText('uiCaught', T.sCaught); setText('uiNeeded', T.sNeeded); setText('uiTimeLbl', T.sTime);
      setText('uiAgain', T.again); setText('uiSettings', T.settings); setText('uiAllGames2', T.allGames);
      setText('calretry', T.calRetry); setText('calkey', T.calUseKey);
      $('diffsel').innerHTML = DIFFS.map(function (d) {
        return '<option value="' + d[0] + '"' + (d[0] === diff ? ' selected' : '') + '>' + T[d[1]] + '</option>';
      }).join('');
      buildSrcRow(); buildAnimalRow();
      document.documentElement.lang = lang;
      LANG_BTNS.forEach(function (l) {
        var b = document.querySelector('.langbtn[data-l="' + l[0] + '"]');
        if (b) b.classList.toggle('on', l[0] === lang);
      });
      // Only the letter modes have a "catch this next" prompt.
      show('rnextbox', cfg.mode === 'letters');
    }

    /* The movement picker. Every camera source, plus the space bar —
       which is listed as a first-class choice rather than hidden as a
       fallback, because for some players it is the right answer. */
    function buildSrcRow() {
      var ids = SW.sourceIds();
      $('srcrow').innerHTML = ids.map(function (id) {
        var s = SW.SOURCES[id];
        var label = (s.label && (s.label[lang] || s.label.en)) || id;
        var ic = SRC_ICON[id] || '🙂';
        return '<button class="pick' + (id === srcId ? ' on' : '') + '" data-src="' + id + '">'
          + '<span class="ic">' + ic + '</span>' + label + '</button>';
      }).join('');
      Array.prototype.forEach.call($('srcrow').children, function (b) {
        b.onclick = function () { touched.src = true; srcId = b.getAttribute('data-src'); buildSrcRow(); };
      });
    }

    function buildAnimalRow() {
      $('animrow').className = 'pickrow icons';
      $('animrow').innerHTML = ANIMAL_ORDER.map(function (a) {
        return '<button class="pick' + (a === animal ? ' on' : '') + '" data-a="' + a + '" '
          + 'aria-label="' + a + '"><span class="ic">' + RC.ANIMALS[a] + '</span></button>';
      }).join('');
      Array.prototype.forEach.call($('animrow').children, function (b) {
        b.onclick = function () { touched.animal = true; animal = b.getAttribute('data-a'); buildAnimalRow(); };
      });
    }

    LANG_BTNS.forEach(function (l) {
      var b = document.querySelector('.langbtn[data-l="' + l[0] + '"]');
      if (b) b.onclick = function () { lang = l[0]; try { localStorage.setItem('ig_lang', lang); } catch (e) {} applyLang(); };
    });
    ['thint', 'tvoice'].forEach(function (id) {
      $(id).onclick = function () {
        if (id === 'thint') touched.hint = true;
        $(id).classList.toggle('on');
      };
    });
    $('diffsel').onchange = function () { touched.diff = true; };

    function say(s) {
      if (!voice || !global.speechSynthesis) return;
      try {
        var u = new SpeechSynthesisUtterance(s);
        u.lang = T.voice; u.rate = 0.95;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) {}
    }

    /* ── Per-child settings ─────────────────────────────────────
       Fetched during setup and waited for before play, because the
       bubble games used to drop a teacher's settings entirely if Play
       was pressed before the request landed.

       `level` 1-9 is an existing generic difficulty field, so the
       timing tier can be stored without a server change; a field named
       for what this game actually varies — the reaction window in
       milliseconds — belongs in the settings work, not here. */
    var settingsReady = Promise.resolve(null);
    var childRunner = null;        // this child's saved Animal Run settings
    var autoDiff = null;           // the tier those settings imply
    var touched = {};              // controls the person in front of it changed
    (function () {
      var active = null;
      try { active = JSON.parse(localStorage.getItem('ig_active_child') || 'null'); } catch (e) {}
      if (!active || !active.id || !cfg.id) return;
      var tok = null; try { tok = localStorage.getItem('ig_token'); } catch (e) {}
      settingsReady = fetch('/api/children/' + active.id + '/settings/' + cfg.id, {
        headers: tok ? { Authorization: 'Bearer ' + tok } : {},
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var s = j && j.settings;
          if (!s) return null;
          if (s.count) childGoal = s.count;
          if (s.level != null) childDiff = s.level <= 3 ? 'gentle' : (s.level >= 7 ? 'challenge' : 'standard');
          if (s.runner) childRunner = s.runner;
          applyChildSettings();
          return s;
        })
        .catch(function () { return null; });
    })();

    /* Put the child's own setup on the screen.

       Only where nobody has chosen otherwise: these arrive from the
       network, so they can land after a teacher has already picked
       something for today, and a saved preference quietly overwriting a
       deliberate choice made two seconds ago is worse than having no
       saved preference at all. */
    function applyChildSettings() {
      var r = childRunner;
      if (r) {
        if (r.source && !touched.src && SW.SOURCES[r.source]) { srcId = r.source; buildSrcRow(); }
        if (r.animal && !touched.animal && RC.ANIMALS[r.animal]) { animal = r.animal; buildAnimalRow(); }
        if (r.hint != null && !touched.hint) $('thint').classList.toggle('on', !!r.hint);
        if (r.windowMs != null && !touched.diff) {
          autoDiff = RC.presetForWindow(r.windowMs);
          diff = autoDiff;
          $('diffsel').value = autoDiff;
        }
      }
      // The older generic level field, for a child set up before this
      // game existed.
      if (childDiff && !touched.diff && (!r || r.windowMs == null)) {
        diff = childDiff;
        $('diffsel').value = childDiff;
      }
    }

    function withTimeout(p, ms) {
      return new Promise(function (res) {
        var done = false;
        var t = setTimeout(function () { if (!done) { done = true; res(null); } }, ms);
        Promise.resolve(p).then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } },
          function () { if (!done) { done = true; clearTimeout(t); res(null); } });
      });
    }

    /* ── Camera ─────────────────────────────────────────────── */
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
        var v = $('rvid');
        v.srcObject = s;
        v.play().catch(function () {});
        $('scam').className = 'sline ok';
        $('scam').innerHTML = '<span class="sdot"></span>' + T.camReady;
        return true;
      }).catch(function () {
        $('scam').className = 'sline warn';
        $('scam').innerHTML = '<span class="sdot"></span>' + T.camDenied;
        return false;
      });
    }

    /* Hand the camera back. Browsers leave the light on otherwise, and
       a parent watching a camera light stay lit after a game has
       finished is entitled to draw conclusions. */
    function stopCam() {
      if (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        stream = null;
      }
      var v = $('rvid');
      if (v) { try { v.srcObject = null; } catch (e) {} v.classList.add('hidden'); }
    }
    global.addEventListener('pagehide', stopCam);
    global.addEventListener('beforeunload', stopCam);

    /* ── MediaPipe ──────────────────────────────────────────── */
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

      /* A harness supplies its own tracker so the whole game can be
         played without a webcam. Everything downstream of "a frame
         arrived" is the part that has never run until somebody plays
         it, which is exactly the part worth driving automatically. */
      if (global.IG_TRACKER_STUB) {
        mp = global.IG_TRACKER_STUB(kind, onFrame);
        mpKind = kind; mpReady = true;
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
      if (mp && v && v.readyState >= 2) {
        try { mp.send({ image: v }).catch(function () {}); } catch (e) {}
      }
      requestAnimationFrame(pump);
    }
    function startPump() { if (!pumping) { pumping = true; requestAnimationFrame(pump); } }
    function stopPump() { pumping = false; }

    /* Every camera frame: read the chosen movement, feed the switch.
       Calibration and play both come through here. */
    var calPhase = null;        // 'rest' | 'effort' | null
    var calibrator = null;
    function onFrame(res) {
      var raw = SW.read(srcId, res);
      var now = (global.performance && performance.now()) || Date.now();

      if (calPhase) {
        if (raw != null) {
          if (calPhase === 'rest') calibrator.restSample(raw);
          else calibrator.effortSample(raw);
          lastSeenAt = now;
          // Show something moving so the player knows they are seen.
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
      if (out.pressed) { pendingPress = true; fired = now; }
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

      return phase('rest', 2600).then(function () {
        return phase('effort', 5200);
      }).then(function () {
        calPhase = null;
        cal = calibrator.finish();
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

      /* The movement was indistinguishable from sitting still. Saying
         so is the only honest option: a switch built on that range
         would fire by itself and the player would be told they were
         doing it wrong. */
      function weak() {
        /* Two very different problems arrive here looking identical.
           If nothing at all was measured the camera is not delivering a
           picture, and telling the player their movement was too small
           sends them off practising a movement that was never the
           problem. */
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
            srcId = 'key'; cal = null; show('calwrap', false); buildSrcRow(); res(true);
          };
        });
      }
    }

    /* ── Starting ───────────────────────────────────────────── */
    $('gobtn').onclick = function () { start(); };

    function start() {
      var btn = $('gobtn');
      if (btn.disabled) return;
      btn.disabled = true;
      diff = $('diffsel').value;
      hint = $('thint').classList.contains('on');
      voice = $('tvoice').classList.contains('on');

      withTimeout(settingsReady, 2500).then(function () {
        applyChildSettings();            // if they only just arrived
        diff = $('diffsel').value;
        hint = $('thint').classList.contains('on');

        /* Decided here and not before the wait: a child whose saved
           movement is the space bar should never see a camera prompt,
           and their settings can land after Play was pressed. */
        var src = SW.SOURCES[srcId];
        var needsCam = src && src.tracker !== 'none';
        if (!needsCam) return true;
        return initCam().then(function (ok) {
          if (!ok) { srcId = 'key'; buildSrcRow(); return true; }
          return initTracker(src.tracker).then(function (tok) {
            if (!tok) { srcId = 'key'; buildSrcRow(); stopCam(); return true; }
            startPump();
            return calibrate();
          });
        });
      }).then(function () {
        btn.disabled = false;
        beginPlay();
      }).catch(function () {
        btn.disabled = false;
        srcId = 'key'; buildSrcRow();
        beginPlay();
      });
    }

    function beginPlay() {
      var usingCam = SW.SOURCES[srcId].tracker !== 'none' && !!stream;
      sw = cal ? new SW.Switch(cal) : null;
      pendingPress = false;

      /* The teacher set a number of milliseconds, not a tier. Honour
         the number exactly, as long as the tier on screen is still the
         one it implies — if a grown-up has moved that control for
         today, today's choice wins. */
      var opts = {
        preset: diff,
        mode: cfg.mode === 'letters' ? 'letters' : 'classic',
        sequence: cfg.sequence || null,
        goal: childGoal || cfg.goal || null,
        animal: animal,
        seed: (Math.random() * 0xffffffff) >>> 0,
      };
      if (childRunner && childRunner.windowMs != null && diff === autoDiff) {
        opts.windowS = childRunner.windowMs / 1000;
      }
      game = new RC.Game(opts);

      show('setupscreen', false); show('resultscreen', false);
      show('rhud', true); show('rcue', true);
      show('rmeter', usingCam);
      $('rpause').classList.add('vis');
      $('rvid').classList.toggle('hidden', !usingCam);

      if (usingCam && cal) {
        var span = Math.max(1e-6, cal.peak - cal.base);
        $('rmmark').style.bottom = Math.min(96, ((cal.press - cal.base) / span) / 1.2 * 100) + '%';
      }

      paused = false; pausedByTracking = false; show('pauseov', false);
      layout();
      startedAt = Date.now();
      lastSeenAt = (global.performance && performance.now()) || Date.now();

      countdown(3).then(function () {
        running = true;
        lastTs = 0;
        if (!raf) raf = requestAnimationFrame(frame);
        var cue = SW.SOURCES[srcId].cue;
        setText('rcue', (cue && (cue[lang] || cue.en)) || '');
        say(T.ready);
      });
    }

    function countdown(n) {
      show('rcount', true);
      return new Promise(function (res) {
        var i = n;
        setText('rcount', String(i));
        if (!raf) raf = requestAnimationFrame(frame);     // draw the stage behind it
        var iv = setInterval(function () {
          i -= 1;
          if (i <= 0) {
            clearInterval(iv); show('rcount', false); res();
          } else { setText('rcount', String(i)); }
        }, 700);
      });
    }

    /* ── Input that is not the camera ───────────────────────────
       Always live. A player using their mouth can still be helped by
       an adult pressing space, and a camera that gives up mid-round
       does not end the session. */
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (running && !paused) pendingPress = true;
      } else if (e.key === 'Escape') {
        if (running) togglePause();
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!running || paused) return;
      if (e.target && e.target.closest && e.target.closest('button,a,select,input')) return;
      pendingPress = true;
    });

    /* A tab nobody is looking at gets no animation frames, so the
       loop stops on its own and resumes with one enormous frame. The
       simulation clamps that, but a child coming back to find a life
       gone because a grown-up checked their email is not acceptable.
       Hold the game instead, and let them restart it deliberately. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && running && !paused) {
        paused = true;
        show('pauseov', true);
      }
    });

    $('rpause').onclick = function () { togglePause(); };
    function togglePause() {
      if (pausedByTracking) return;         // resumes on its own
      paused = !paused;
      show('pauseov', paused);
    }

    /* ── The loop ───────────────────────────────────────────── */
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      var dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;

      if (!game) { return; }
      if (!running || paused) { render(game.state()); return; }

      checkTracking(ts);
      if (paused) { render(game.state()); return; }

      var pressed = pendingPress; pendingPress = false;
      var st = game.step(dt, pressed);
      handle(game.drain());
      render(st);
      if (st.over) endRound(st);
    }

    /* Out of shot is a seating problem, not a wrong answer. Hold the
       game rather than spending the player's lives while they are not
       even in the picture. */
    function checkTracking(ts) {
      if (!sw || !stream) return;
      var gone = ts - lastSeenAt > 900;
      if (gone && !pausedByTracking) {
        pausedByTracking = true; paused = true;
        $('rcue').classList.add('warn');
        setText('rcue', T.lost);
        show('pauseov', false);
      } else if (!gone && pausedByTracking) {
        pausedByTracking = false; paused = false;
        $('rcue').classList.remove('warn');
        var cue = SW.SOURCES[srcId].cue;
        setText('rcue', (cue && (cue[lang] || cue.en)) || '');
        if (sw) sw.lost();        // do not fire on the way back in
      }
    }

    var flash = 0, flashKind = '';
    function handle(events) {
      for (var i = 0; i < events.length; i += 1) {
        var e = events[i];
        if (e.type === 'collect' || e.type === 'correct') { flash = 1; flashKind = 'good'; }
        else if (e.type === 'hit' || e.type === 'wrong') { flash = 1; flashKind = 'bad'; }
      }
    }

    /* ── Drawing ────────────────────────────────────────────── */
    var cv = $('stage'), ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, ppm = 100, groundY = 0, playerPx = 0;
    var AHEAD_M = 5;

    function layout() {
      dpr = Math.min(2, global.devicePixelRatio || 1);
      W = cv.clientWidth || global.innerWidth;
      H = cv.clientHeight || global.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      groundY = H - Math.max(84, H * 0.17);
      playerPx = Math.max(60, W * 0.2);
      /* Pixels per metre has to satisfy both directions: tall enough
         for the biggest jump, and wide enough that an obstacle is on
         screen for long enough to react to. On a narrow phone the
         width is what binds. */
      var vertical = groundY / 3.2;
      var horizontal = (W - playerPx - 24) / AHEAD_M;
      ppm = Math.max(26, Math.min(vertical, horizontal));
    }
    global.addEventListener('resize', layout);
    layout();

    function sky() {
      var g = ctx.createLinearGradient(0, 0, 0, groundY);
      g.addColorStop(0, '#13233f'); g.addColorStop(1, '#2b4a6f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, groundY);
    }

    function hills(dist) {
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.beginPath(); ctx.moveTo(0, groundY);
      var off = (dist * 0.18 * ppm) % 240;
      for (var x = -off; x <= W + 240; x += 6) {
        var y = groundY - 40 - Math.sin((x + off) / 120) * 26;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
    }

    function ground(dist) {
      ctx.fillStyle = '#1d2e1a'; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = 'rgba(120,200,110,.5)'; ctx.fillRect(0, groundY, W, 3);
      // Stripes every half metre, so the speed is visible.
      var step = 0.5 * ppm;
      var off = (dist * ppm) % step;
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      for (var x = -off; x < W; x += step) ctx.fillRect(x, groundY + 10, step / 2, 5);
    }

    /* The overhead lane, drawn as a faint band. A player cannot aim at
       something they have not been told exists. */
    function laneGuide(c) {
      var y0 = groundY - c.highY1 * ppm, y1 = groundY - c.highY0 * ppm;
      ctx.fillStyle = 'rgba(255,215,0,.055)';
      ctx.fillRect(0, y0, W, y1 - y0);
      ctx.strokeStyle = 'rgba(255,215,0,.16)'; ctx.lineWidth = 1;
      ctx.setLineDash([7, 9]);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.stroke();
      ctx.setLineDash([]);
    }

    function glyph(s, px, x, y) {
      ctx.font = Math.round(px) + 'px "Fredoka One", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    }

    function render(st) {
      var c = game.cfg;
      ctx.clearRect(0, 0, W, H);
      sky(); hills(st.dist); laneGuide(c); ground(st.dist);

      var objs = game.view();
      var i, o, ox;

      /* The optional "press now" marker: a footprint on the ground at
         the spot where a jump started would work out. When it reaches
         the animal, press. It is the same arithmetic the game uses to
         decide whether a jump cleared, so it cannot promise something
         the physics will not honour. */
      if (hint) {
        for (i = 0; i < objs.length; i += 1) {
          o = objs[i];
          if (!o.needJump) continue;
          var w = RC.windowFor(c, o.lane, o.wanted, o.x);
          if (!w) continue;
          var aim = (w.lo + w.hi) / 2;
          if (aim < -0.05 || aim > AHEAD_M / c.speed) continue;
          var mx = playerPx + aim * c.speed * ppm;
          ctx.globalAlpha = Math.max(0.15, 1 - aim / 2.2);
          ctx.fillStyle = 'rgba(255,215,0,.8)';
          ctx.beginPath();
          ctx.moveTo(mx, groundY - 4);
          ctx.lineTo(mx - 9, groundY + 10); ctx.lineTo(mx + 9, groundY + 10);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      for (i = 0; i < objs.length; i += 1) {
        o = objs[i];
        ox = playerPx + o.x * ppm;
        if (ox < -60 || ox > W + 60) continue;
        var oy = o.lane === 'high'
          ? groundY - ((c.highY0 + c.highY1) / 2) * ppm
          : groundY - (c.objH / 2) * ppm;
        var size = Math.max(22, c.objH * ppm * 1.25);
        if (cfg.mode === 'letters') {
          ctx.fillStyle = o.wanted ? 'rgba(74,222,128,.22)' : 'rgba(255,255,255,.1)';
          ctx.beginPath(); ctx.arc(ox, oy, size * 0.62, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = o.wanted ? '#bbf7d0' : '#fff';
        } else {
          ctx.fillStyle = '#fff';
        }
        glyph(o.label, size, ox, oy);
      }

      // The animal. A tilt while airborne is the whole animation
      // budget, and it reads as a leap.
      var py = groundY - st.y * ppm;
      var pSize = Math.max(28, c.playerH * ppm * 1.5);
      ctx.save();
      ctx.translate(playerPx, py - pSize * 0.34);
      ctx.rotate(st.onGround ? 0 : Math.max(-0.4, Math.min(0.4, -st.vy * 0.07)));
      glyph(RC.ANIMALS[animal] || '🦁', pSize, 0, 0);
      ctx.restore();

      if (flash > 0) {
        ctx.fillStyle = (flashKind === 'good' ? 'rgba(74,222,128,' : 'rgba(248,113,113,') + (flash * 0.22) + ')';
        ctx.fillRect(0, 0, W, H);
        flash -= 0.06; if (flash < 0) flash = 0;
      }

      // HUD
      var lives = st.lives, max = Math.ceil((c.hp - c.deadAt) / c.hpLoss);
      var hearts = '';
      for (i = 0; i < max; i += 1) hearts += i < lives ? '<span>❤️</span>' : '<span class="gone">❤️</span>';
      $('rlives').innerHTML = hearts;
      setText('rscore', st.score + ' / ' + st.goal);
      if (cfg.mode === 'letters') setText('rnext', st.next || '');

      var nowMs = (global.performance && performance.now()) || Date.now();
      $('rmfill').style.height = Math.min(100, (meterN / 1.2) * 100) + '%';
      $('rmeter').classList.toggle('fired', nowMs - fired < 180);
    }

    /* ── End of round ───────────────────────────────────────── */
    function fmtTime(ms) {
      var s = Math.round(ms / 1000);
      return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }

    function endRound(st) {
      running = false;
      stopPump(); stopCam();
      show('rhud', false); show('rcue', false); show('rmeter', false);
      $('rpause').classList.remove('vis');
      show('pauseov', false);

      var won = st.reason === 'won';
      setText('re', won ? '👑' : '🌟');
      setText('rt', won ? T.wonT : T.deadT);
      setText('rsub', won ? T.wonS : T.deadS);
      setText('rstar', '⭐'.repeat(Math.max(1, Math.min(12, st.score))));
      setText('rs1', st.score); setText('rs2', st.goal);
      var ms = Date.now() - startedAt;
      setText('rs3', fmtTime(ms));
      show('resultscreen', true);
      say((won ? T.wonSpeech + ' ' : '') + T.scored(st.score, st.goal));

      // Progress for the active child, same shape as the bubble games.
      try {
        var ac = JSON.parse(localStorage.getItem('ig_active_child') || 'null');
        if (ac && ac.id) {
          var tk = null; try { tk = localStorage.getItem('ig_token'); } catch (e) {}
          fetch('/api/children/' + ac.id + '/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: tk ? ('Bearer ' + tk) : '' },
            body: JSON.stringify({
              game: cfg.id, score: st.score, total: st.goal, timeMs: ms, lang: lang,
            }),
          }).catch(function () {});
        }
      } catch (e) {}
    }

    $('uiAgain').onclick = function () {
      show('resultscreen', false);
      start();
    };
    $('uiSettings').onclick = function () {
      show('resultscreen', false);
      show('setupscreen', true);
      game = null;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      ctx.clearRect(0, 0, W, H);
    };

    applyLang();
    $('gobtn').disabled = false;

    // Exposed only so a harness can drive this without a webcam.
    global.IG_RUNNER_DEBUG = {
      press: function () { pendingPress = true; },
      game: function () { return game; },
      state: function () {
        return { running: running, paused: paused, srcId: srcId, diff: diff, cal: cal };
      },
    };
  }

  global.IG_RUNNER_GAME = IG_RUNNER_GAME;
})(typeof window !== 'undefined' ? window : this);

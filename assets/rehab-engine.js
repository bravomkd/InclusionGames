/* ============================================================
 * InclusionGames — Stroke Rehab engine.
 *
 * Each rehabNN.html calls IG_REHAB_GAME({ id: 'rehab01' }) and this
 * builds the whole exercise: camera, tracking, calibration, guided
 * repetitions, rest breaks, results, and saving the session.
 *
 * ── The one design decision that matters ─────────────────────
 * Nothing is measured against an able-bodied norm. Every exercise
 * begins by measuring THIS person, today: a relaxed baseline, then
 * their own best effort. The target is then set as a fraction of
 * the range they just demonstrated.
 *
 * That is deliberate. A fixed threshold — "open your mouth 3cm" —
 * is either trivially easy or permanently impossible depending on
 * the person, and being unable to complete a single repetition is
 * both useless as practice and demoralising. Calibrating to the
 * individual means someone with a small range still gets achievable
 * work and a real measure of change over time, because the recorded
 * amplitude is a percentage of their own calibrated range.
 *
 * Everything the person sees is normalised to 0–100% of their own
 * range, so the raw sign and scale of a measurement never surfaces.
 *
 * This is practice software, not a medical device, and it does not
 * diagnose anything or decide dosage. A clinician does that.
 * ============================================================ */
(function (global) {
  'use strict';

  var CAT = global.IG_REHAB;

  // ── strings ───────────────────────────────────────────────
  var UI = {
    en: {
      allExercises: '← All exercises', start: 'Start', begin: 'Begin exercise',
      camera: 'Camera…', cameraReady: 'Camera ready', cameraNo: 'No camera — cannot run this exercise',
      tracking: 'Starting tracking…', trackingReady: 'Tracking ready', trackingNo: 'Tracking unavailable',
      affected: 'Which side is weaker?', left: 'Left', right: 'Right', bothSides: 'Both / not sure',
      whichHand: 'Which hand are you using?',
      safety: 'Before you start',
      safetyText: 'Sit down, supported, with your back against the chair. Move slowly and only as far as is comfortable. Stop straight away if anything hurts, or if you feel dizzy or unwell. This is practice between therapy sessions — it does not replace your therapist.',
      why: 'Why this exercise',
      notMedical: 'Practice software, not a medical device. It does not diagnose anything. Use it as your clinician advises.',
      calibrating: 'Setting up for you',
      calRelax: 'Relax completely', calRelaxSub: 'Just rest your face for a moment',
      calRelaxBody: 'Rest — stay still',
      calMax: 'Now show me your best', calMaxTry: 'Try %N of %M',
      calDone: 'All set — that is your range for today',
      calTooSmall: 'We could not see much movement. You can still practise — the targets will be very gentle. If this keeps happening, mention it to your clinician.',
      cannotSee: 'The camera could not see you well enough to set up.',
      stuckTitle: 'Having trouble?',
      stuckBody: 'The movement is not being picked up. You can set up again, or finish here — everything you have done so far is kept.',
      setupAgain: 'Set up again',
      cameraOff: 'Camera switched off.',
      targetsReached: 'Targets reached',
      signInToSave: 'Not saved — please sign in again.',
      calMove: 'Move around the area you can reach comfortably',
      getReady: 'Get ready…', go: 'Go!', rest: 'Rest', restSub: 'Take a breather. The next set starts on its own.',
      hold: 'Hold it…', holdMore: 'Keep holding', released: 'And relax',
      repDone: 'Good', setDone: 'Set complete',
      done: 'Session complete', doneSub: 'Well done — that is logged.',
      repsDone: 'Repetitions', bestRange: 'Best range', avgRange: 'Average range',
      symmetry: 'Evenness', timeSpent: 'Time', holdTime: 'Longest hold',
      again: 'Do it again', finish: 'Finish',
      saved: 'Saved to the profile.', notSaved: 'Not saved — no profile is selected.',
      saveFail: 'Could not save this session.',
      symLabel: 'Left / right evenness',
      needFace: 'Move so your whole face is in view',
      needHand: 'Hold your hand up where the camera can see it',
      needBody: 'Move back so your head and shoulders are in view',
      target: 'Target', pointerLost: 'Come back into view',
      dwellHint: 'No hands needed — rest the pointer on a button to press it',
      translationNote: 'This exercise is available in English and German.',
      of: 'of', set: 'Set',
    },
    de: {
      allExercises: '← Alle Übungen', start: 'Start', begin: 'Übung beginnen',
      camera: 'Kamera…', cameraReady: 'Kamera bereit', cameraNo: 'Keine Kamera — Übung nicht möglich',
      tracking: 'Tracking startet…', trackingReady: 'Tracking bereit', trackingNo: 'Tracking nicht verfügbar',
      affected: 'Welche Seite ist schwächer?', left: 'Links', right: 'Rechts', bothSides: 'Beide / unsicher',
      whichHand: 'Welche Hand benutzen Sie?',
      safety: 'Vor dem Start',
      safetyText: 'Setzen Sie sich mit dem Rücken an die Lehne. Bewegen Sie sich langsam und nur so weit, wie es angenehm ist. Brechen Sie sofort ab, wenn etwas schmerzt oder Ihnen schwindelig oder unwohl wird. Dies ist Übung zwischen den Therapieterminen — es ersetzt Ihre Therapie nicht.',
      why: 'Warum diese Übung',
      notMedical: 'Übungssoftware, kein Medizinprodukt. Sie stellt keine Diagnose. Nutzung nach Anweisung Ihrer Behandelnden.',
      calibrating: 'Einstellung auf Sie',
      calRelax: 'Ganz entspannen', calRelaxSub: 'Lassen Sie das Gesicht einen Moment ruhen',
      calRelaxBody: 'Ruhen — still halten',
      calMax: 'Jetzt Ihr Bestes zeigen', calMaxTry: 'Versuch %N von %M',
      calDone: 'Fertig — das ist Ihr heutiger Bereich',
      calTooSmall: 'Wir konnten kaum Bewegung erkennen. Sie können trotzdem üben — die Ziele werden sehr sanft. Wenn das öfter vorkommt, sprechen Sie Ihre Behandelnden an.',
      cannotSee: 'Die Kamera konnte Sie für die Einstellung nicht gut genug sehen.',
      stuckTitle: 'Klappt es nicht?',
      stuckBody: 'Die Bewegung wird nicht erkannt. Sie können neu einstellen oder hier beenden — das bisher Geschaffte bleibt erhalten.',
      setupAgain: 'Neu einstellen',
      cameraOff: 'Kamera ausgeschaltet.',
      targetsReached: 'Ziele erreicht',
      signInToSave: 'Nicht gespeichert — bitte erneut anmelden.',
      calMove: 'Bewegen Sie sich im Bereich, den Sie bequem erreichen',
      getReady: 'Bereit machen…', go: 'Los!', rest: 'Pause', restSub: 'Kurz durchatmen. Der nächste Satz startet von selbst.',
      hold: 'Halten…', holdMore: 'Weiter halten', released: 'Und entspannen',
      repDone: 'Gut', setDone: 'Satz geschafft',
      done: 'Einheit abgeschlossen', doneSub: 'Gut gemacht — das ist gespeichert.',
      repsDone: 'Wiederholungen', bestRange: 'Bester Bereich', avgRange: 'Durchschnitt',
      symmetry: 'Gleichmäßigkeit', timeSpent: 'Dauer', holdTime: 'Längstes Halten',
      again: 'Nochmal', finish: 'Beenden',
      saved: 'Im Profil gespeichert.', notSaved: 'Nicht gespeichert — kein Profil ausgewählt.',
      saveFail: 'Einheit konnte nicht gespeichert werden.',
      symLabel: 'Gleichmäßigkeit links / rechts',
      needFace: 'Bitte so setzen, dass das ganze Gesicht sichtbar ist',
      needHand: 'Halten Sie die Hand so, dass die Kamera sie sieht',
      needBody: 'Etwas zurück, bis Kopf und Schultern sichtbar sind',
      target: 'Ziel', pointerLost: 'Zurück ins Bild kommen',
      dwellHint: 'Ohne Hände: Zeiger auf einer Taste ruhen lassen, um sie zu drücken',
      translationNote: 'Diese Übung gibt es auf Englisch und Deutsch.',
      of: 'von', set: 'Satz',
    },
  };

  /* Measurement lives in assets/rehab-metrics.js so it can be tested in Node
     without a webcam — see test/rehab-metrics.test.js. */
  var M = global.IG_REHAB_METRICS;
  if (!M || !M.METRICS) {
    throw new Error('rehab-engine: load assets/rehab-metrics.js before this file');
  }
  var METRICS = M.METRICS;
  var NOSE = M.NOSE;
  var POSE_SHOULDER = M.POSE_SHOULDER;
  var clamp = M.clamp;
  var median = M.median;
  var poseWrist = M.poseWrist;
  var handOpenness = M.handOpenness;

  // ── the engine ────────────────────────────────────────────
  function IG_REHAB_GAME(opts) {
    var ex = CAT.byId(opts.id);
    if (!ex) throw new Error('Unknown exercise: ' + opts.id);
    // A wrong metric name used to fall back to mouth opening, quietly
    // measuring the wrong movement. Refuse it instead.
    if (!M.metricExists(ex.tracker, ex.metric)) {
      throw new Error('Exercise ' + ex.id + ' asks for measurement "' + ex.metric
        + '", which the ' + ex.tracker + ' tracker does not produce');
    }

    var lang = 'en';
    try {
      var saved = localStorage.getItem('ig_lang');
      if (saved && CAT.langs.indexOf(saved) >= 0) lang = saved;
    } catch (e) { /* storage may be blocked */ }
    var urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang && CAT.langs.indexOf(urlLang) >= 0) lang = urlLang;
    var T = UI[lang] || UI.en;
    var tx = function (obj) { return CAT.t(obj, lang); };

    // state
    var st = {
      side: 'left',            // weaker side / working hand
      reps: ex.defaultReps,
      sets: ex.sets || 1,
      setIndex: 0,
      repCount: 0,
      running: false,
      phase: 'setup',
      base: 0, peak: 0,        // calibration for the chosen metric
      peakNeg: 0,              // second direction, for bidirectional exercises
      dir: 1,                  // current commanded direction
      box: null,               // reachable area, for target exercises
      amplitudes: [],          // normalised peak of each repetition
      symmetries: [],
      holds: [],
      holdStart: 0,
      longestHold: 0,
      startedAt: 0,
      lastPoint: null,
      tracked: false,
      calibrationWeak: false,
      lost: false,             // the camera cannot currently see what it needs
      lastProgressAt: 0,       // feeds the "are you stuck?" safety net
    };

    var el = {};
    var stream = null, tracker = null, rafId = 0;

    // ── DOM ────────────────────────────────────────────────
    function build() {
      document.body.insertAdjacentHTML('afterbegin', [
        '<video id="rbVideo" autoplay playsinline muted></video>',
        '<div class="rb-top">',
        '  <span class="rb-brand"><span class="box">🎈</span>InclusionGames</span>',
        '  <a href="/stroke.html" class="rb-back rb-dwell" id="rbBack"></a>',
        '</div>',

        '<section id="rbSetup" class="rb-screen">',
        '  <div>',
        '    <span class="rb-icon">' + ex.icon + '</span>',
        '    <h1 class="rb-title" id="rbTitle"></h1>',
        '    <p class="rb-lead" id="rbShort"></p>',
        '  </div>',
        '  <div class="rb-card rb-safety"><h3 id="rbSafetyH"></h3><p id="rbSafetyP"></p></div>',
        '  <div class="rb-card" id="rbCautionCard" hidden><p id="rbCautionP"></p></div>',
        '  <div class="rb-card"><details class="rb-why"><summary id="rbWhyH"></summary><p id="rbWhyP" style="margin-top:8px"></p></details></div>',
        '  <div id="rbSideWrap"><div class="rb-label" id="rbSideH"></div><div class="rb-row" id="rbSideRow"></div></div>',
        '  <div class="rb-cam">',
        '    <div class="rb-cam-box"><video id="rbPreview" autoplay playsinline muted></video></div>',
        '    <div class="rb-cam-info">',
        '      <span class="rb-status" id="rbCamStatus"><span class="dot"></span><span></span></span>',
        '      <span class="rb-status" id="rbTrackStatus"><span class="dot"></span><span></span></span>',
        '      <button class="rb-go rb-dwell" id="rbStart" disabled></button>',
        '      <span class="rb-saved" id="rbDwellHint"></span>',
        '    </div>',
        '  </div>',
        '  <p class="rb-saved" id="rbNotMedical"></p>',
        '</section>',

        '<div id="rbCue" class="hidden" role="status" aria-live="polite"></div>',
        '<div id="rbLost" class="hidden" role="status" aria-live="assertive"></div>',
        '<div id="rbMeterWrap" class="hidden">',
        '  <div class="rb-meter" id="rbMeter">',
        '    <div class="rb-meter-clip"><div class="rb-meter-fill" id="rbFill"></div></div>',
        '    <div class="rb-target-line" id="rbTargetLine"><span class="rb-target-flag" id="rbTargetFlag"></span></div>',
        '  </div>',
        '  <div class="rb-meter-side">',
        '    <div class="rb-count"><span id="rbCount">0</span><small id="rbCountLbl"></small></div>',
        '    <div class="rb-pips" id="rbPips"></div>',
        '    <div class="rb-label" id="rbSetLbl"></div>',
        '  </div>',
        '</div>',

        '<div id="rbSym" class="hidden"><div class="rb-sym-row">',
        '  <span class="rb-sym-label" id="rbSymLbl"></span>',
        '  <span class="rb-sym-bar"><span class="rb-sym-fill" id="rbSymFill"></span></span>',
        '  <span class="rb-sym-val" id="rbSymVal">—</span>',
        '</div></div>',

        '<div id="rbRest" class="hidden">',
        '  <div><div class="big" id="rbRestH"></div><div id="rbRestCount">10</div><div class="sub" id="rbRestSub"></div></div>',
        '</div>',

        /* The way out of a dead end. If the movement is not being picked up —
           a camera that cannot see the person, a calibration that measured
           nothing, a bad day — the exercise must never sit there asking for
           something that cannot happen. Both buttons are dwell-activated, so
           somebody with no usable hands can still leave. */
        '<div id="rbStuck" class="hidden">',
        '  <div class="rb-stuck-box">',
        '    <div class="big" id="rbStuckH"></div>',
        '    <p id="rbStuckP"></p>',
        '    <div class="rb-row">',
        '      <button class="rb-choice rb-dwell" id="rbStuckRetry"></button>',
        '      <button class="rb-go rb-dwell" id="rbStuckEnd"></button>',
        '    </div>',
        '  </div>',
        '</div>',

        '<section id="rbResults" class="rb-screen hidden">',
        '  <div><span class="rb-icon">🌟</span><h1 class="rb-title" id="rbDoneH"></h1><p class="rb-lead" id="rbDoneSub"></p></div>',
        '  <div class="rb-results" id="rbResultGrid"></div>',
        '  <p class="rb-saved" id="rbSaveMsg"></p>',
        '  <div class="rb-row">',
        '    <button class="rb-go rb-dwell" id="rbAgain"></button>',
        '    <a class="rb-choice rb-dwell" id="rbFinish" href="/stroke.html"></a>',
        '  </div>',
        '</section>',
      ].join(''));

      ['rbVideo', 'rbBack', 'rbSetup', 'rbTitle', 'rbShort', 'rbSafetyH', 'rbSafetyP',
        'rbCautionCard', 'rbCautionP', 'rbWhyH', 'rbWhyP', 'rbSideWrap', 'rbSideH', 'rbSideRow',
        'rbPreview', 'rbCamStatus', 'rbTrackStatus', 'rbStart', 'rbDwellHint', 'rbNotMedical',
        'rbCue', 'rbLost', 'rbMeterWrap', 'rbMeter', 'rbFill', 'rbTargetLine', 'rbTargetFlag', 'rbCount',
        'rbCountLbl', 'rbPips', 'rbSetLbl', 'rbSym', 'rbSymLbl', 'rbSymFill', 'rbSymVal',
        'rbRest', 'rbRestH', 'rbRestCount', 'rbRestSub', 'rbResults', 'rbDoneH', 'rbDoneSub',
        'rbResultGrid', 'rbSaveMsg', 'rbAgain', 'rbFinish',
        'rbStuck', 'rbStuckH', 'rbStuckP', 'rbStuckRetry', 'rbStuckEnd'].forEach(function (id) {
        el[id] = document.getElementById(id);
      });

      document.title = tx(ex.title) + ' — InclusionGames';
      document.documentElement.lang = lang;

      el.rbBack.textContent = T.allExercises;
      el.rbTitle.textContent = tx(ex.title);
      el.rbShort.textContent = tx(ex.short);
      el.rbSafetyH.textContent = T.safety;
      el.rbSafetyP.textContent = T.safetyText;
      el.rbWhyH.textContent = T.why;
      el.rbWhyP.textContent = tx(ex.rationale);
      el.rbNotMedical.textContent = T.notMedical;
      el.rbStart.textContent = T.begin;
      el.rbDwellHint.textContent = T.dwellHint;
      el.rbSymLbl.textContent = T.symLabel;
      el.rbCountLbl.textContent = T.repsDone;
      el.rbDoneH.textContent = T.done;
      el.rbDoneSub.textContent = T.doneSub;
      el.rbAgain.textContent = T.again;
      el.rbFinish.textContent = T.finish;
      el.rbRestH.textContent = T.rest;
      el.rbRestSub.textContent = T.restSub;
      el.rbStuckH.textContent = T.stuckTitle;
      el.rbStuckP.textContent = T.stuckBody;
      el.rbStuckRetry.textContent = T.setupAgain;
      el.rbStuckEnd.textContent = T.finish;

      if (ex.caution) {
        el.rbCautionCard.hidden = false;
        el.rbCautionP.textContent = '⚠️ ' + tx(ex.caution);
      }

      // Side picker, worded for what the exercise actually needs.
      el.rbSideH.textContent = ex.usesAffectedArm ? T.whichHand : T.affected;
      var sides = [['left', T.left], ['right', T.right]];
      if (!ex.usesAffectedArm && !ex.biasToAffected) sides.push(['both', T.bothSides]);
      // rb-dwell as well as clickable: choosing the weaker side is the first
      // thing the exercise asks for, and it has to be answerable by someone
      // who cannot use a mouse either.
      el.rbSideRow.innerHTML = sides.map(function (s) {
        return '<button class="rb-choice rb-dwell" data-side="' + s[0] + '">' + s[1] + '</button>';
      }).join('');
      el.rbSideRow.querySelectorAll('[data-side]').forEach(function (b) {
        b.addEventListener('click', function () {
          st.side = b.dataset.side;
          el.rbSideRow.querySelectorAll('[data-side]').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
      });
      el.rbSideRow.firstElementChild.classList.add('on');

      el.rbStart.addEventListener('click', beginSession);
      el.rbAgain.addEventListener('click', function () {
        el.rbResults.classList.add('hidden');
        beginSession();
      });
      el.rbStuckRetry.addEventListener('click', function () {
        hideStuck();
        el.rbMeterWrap.classList.add('hidden');
        clearTargets();
        calibrate();
      });
      el.rbStuckEnd.addEventListener('click', function () {
        hideStuck();
        finish();
      });

      window.addEventListener('resize', placeTarget);
    }

    function setStatus(node, cls, text) {
      node.className = 'rb-status ' + cls;
      node.lastElementChild.textContent = text;
    }

    // ── camera + tracker ───────────────────────────────────
    /* onReady fires once frames can flow. It matters because the camera is
       released when a session ends, so starting a second session has to bring
       the camera and the tracker back up before calibration can measure
       anything — otherwise the exercise waits for readings that will never
       arrive. */
    var readyCb = null;

    function startCamera(onReady) {
      readyCb = onReady || null;
      setStatus(el.rbCamStatus, '', T.camera);
      setStatus(el.rbTrackStatus, '', T.tracking);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        cameraFailed();
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
        .then(function (s) {
          stream = s;
          el.rbPreview.srcObject = s;
          el.rbVideo.srcObject = s;
          // Both of them: the hidden full-screen video is the one frames are
          // read from, and relying on the autoplay attribute alone leaves it
          // paused in some browsers, which stalls the whole exercise.
          el.rbPreview.play().catch(function () {});
          el.rbVideo.play().catch(function () {});
          setStatus(el.rbCamStatus, 'ok', T.cameraReady);
          loadTracker();
        })
        .catch(function () {
          // Without a camera there is nothing to measure, so this exercise
          // genuinely cannot run — say so plainly rather than half-starting.
          cameraFailed();
        });
    }

    function cameraFailed() {
      setStatus(el.rbCamStatus, 'bad', T.cameraNo);
      setStatus(el.rbTrackStatus, 'bad', T.trackingNo);
      readyCb = null;
      // If this happened on the way into a session, go back to the setup
      // screen rather than leaving a blank exercise running.
      if (st.phase !== 'setup') {
        st.phase = 'setup';
        st.running = false;
        el.rbCue.classList.add('hidden');
        el.rbSetup.classList.remove('hidden');
        el.rbVideo.classList.remove('on');
      }
    }

    var TRACKER_SRC = {
      face: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/', global: 'FaceMesh' },
      pose: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/', global: 'Pose' },
      hands: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/', global: 'Hands' },
    };

    function loadTracker() {
      var spec = TRACKER_SRC[ex.tracker];
      if (global[spec.global]) { initTracker(spec); return; }   // already loaded
      var s = document.createElement('script');
      s.src = spec.url;
      s.crossOrigin = 'anonymous';
      s.onload = function () { initTracker(spec); };
      s.onerror = function () { trackerFailed(); };
      document.head.appendChild(s);
    }

    function trackerFailed() {
      setStatus(el.rbTrackStatus, 'bad', T.trackingNo);
      readyCb = null;
      if (st.phase !== 'setup') cameraFailed();
    }

    function initTracker(spec) {
      var Ctor = global[spec.global];
      if (!Ctor) { trackerFailed(); return; }
      try {
        tracker = new Ctor({ locateFile: function (f) { return spec.base + f; } });
        if (ex.tracker === 'face') {
          tracker.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        } else if (ex.tracker === 'pose') {
          tracker.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        } else {
          tracker.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        }
        tracker.onResults(onResults);
        tracker.initialize().then(function () {
          setStatus(el.rbTrackStatus, 'ok', T.trackingReady);
          el.rbStart.disabled = false;
          latest.at = Date.now();      // don't report "out of view" before the first frame
          pump();
          var cb = readyCb; readyCb = null;
          if (cb) cb();
        }).catch(function () { trackerFailed(); });
      } catch (e) {
        trackerFailed();
      }
    }

    /* Feed frames continuously — the pointer has to work on the setup screen
       too, so that someone with no usable hands can press Begin. */
    function pump() {
      if (rafId) cancelAnimationFrame(rafId);   // never leave two loops running
      var v = el.rbVideo;
      function step() {
        rafId = requestAnimationFrame(step);
        if (tracker && v.readyState >= 2) {
          try { tracker.send({ image: v }).catch(function () {}); } catch (e) { /* frame dropped */ }
        }
      }
      rafId = requestAnimationFrame(step);
    }

    // ── measurement from a frame ───────────────────────────
    // `seq` counts frames the tracker actually found something in, and `at` is
    // when that last happened. Calibration samples per new frame rather than
    // on a timer, so a slow device does not weight the median differently
    // from a fast one, and "did we see enough to set up?" becomes answerable.
    var latest = { v: 0, l: null, r: null, point: null, ok: false, seq: 0, at: 0 };

    /* With both hands in shot the tracker returns them in no particular
       order, so taking the first one can silently measure the arm the
       exercise is not for — and if that is the good arm, the session gets
       recorded against the affected one. */
    function palmX(h) { return h && h[9] ? h[9].x : 0.5; }

    /* MediaPipe labels handedness as though the image were mirrored, the way
       a selfie camera usually shows it. The frames sent here are the raw,
       unmirrored ones, so its "Left" is the person's right hand. */
    function labelledSide(res, i) {
      var h = res.multiHandedness && res.multiHandedness[i];
      if (!h || !h.label) return null;
      return String(h.label).toLowerCase() === 'left' ? 'right' : 'left';
    }

    /* Before the person has said which side they are using, the pointer has to
       follow whichever limb they are actually moving. Following the default
       side instead leaves somebody whose only usable hand is the other one
       unable to move the pointer at all — and therefore unable to press the
       button that would have told us. */
    var motion = {}, motionPrev = {};
    function noteMotion(key, p) {
      var prev = motionPrev[key];
      var d = prev ? Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) : 0;
      motionPrev[key] = p;
      motion[key] = (motion[key] || 0) * 0.88 + d;
      return motion[key];
    }

    function mostActiveHand(res, hands) {
      var best = hands[0], bestScore = -1;
      for (var i = 0; i < hands.length; i += 1) {
        var key = 'h:' + (labelledSide(res, i) || i);
        var score = noteMotion(key, { x: palmX(hands[i]), y: hands[i][9] ? hands[i][9].y : 0.5 });
        if (score > bestScore) { bestScore = score; best = hands[i]; }
      }
      return best;
    }

    function mostActiveWrist(pl) {
      var best = null, bestScore = -1;
      ['left', 'right'].forEach(function (side) {
        var p = poseWrist(pl, side);
        if (!p) return;
        var score = noteMotion('w:' + side, p);
        if (score > bestScore) { bestScore = score; best = side; }
      });
      return best;
    }

    function pickHand(res, hands) {
      if (hands.length === 1) return hands[0];
      if (st.phase === 'setup') return mostActiveHand(res, hands);
      var want = st.side === 'right' ? 'right' : 'left';
      for (var i = 0; i < hands.length; i += 1) {
        if (labelledSide(res, i) === want) return hands[i];
      }
      // No handedness from the tracker: fall back to geometry. In an
      // unmirrored image the person's left hand is the one further right,
      // which holds unless they have crossed their arms over.
      var best = hands[0];
      for (var j = 1; j < hands.length; j += 1) {
        if (want === 'left' ? palmX(hands[j]) > palmX(best) : palmX(hands[j]) < palmX(best)) best = hands[j];
      }
      return best;
    }

    function onResults(res) {
      var reading = null;

      if (ex.tracker === 'face') {
        var faces = res.multiFaceLandmarks;
        if (faces && faces.length) {
          var lm = faces[0];
          reading = (METRICS[ex.metric] || METRICS.mouthOpen)(lm);
          if (!reading.point) reading.point = { x: lm[NOSE].x, y: lm[NOSE].y };
        }
      } else if (ex.tracker === 'pose') {
        var pl = res.poseLandmarks;
        if (pl && pl.length) {
          var armSide = st.phase === 'setup'
            ? (mostActiveWrist(pl) || (st.side === 'right' ? 'right' : 'left'))
            : (st.side === 'right' ? 'right' : 'left');
          var p = poseWrist(pl, armSide);
          if (p) {
            var sh = pl[POSE_SHOULDER[armSide]];
            reading = { v: sh ? (sh.y - p.y) : 0, l: null, r: null, point: p };
          }
        }
      } else {
        var hands = res.multiHandLandmarks;
        if (hands && hands.length) {
          var hl = pickHand(res, hands);
          reading = { v: handOpenness(hl), l: null, r: null, point: { x: hl[9].x, y: hl[9].y } };
        }
      }

      if (!reading) {
        latest.ok = false;
        return;                       // liveness() notices and says something
      }
      latest.v = reading.v;
      latest.l = reading.l;
      latest.r = reading.r;
      // The display is mirrored, so flip x to keep the pointer under the
      // person's actual movement rather than opposite to it.
      latest.point = reading.point ? { x: 1 - reading.point.x, y: reading.point.y } : null;
      latest.ok = true;
      latest.seq += 1;
      latest.at = Date.now();
      st.tracked = true;
      if (st.lost) recovered();
      tick();
    }

    /* ── is the camera still seeing the person? ──────────────
     *
     * Two things stop readings arriving: the person moves out of shot, and
     * the browser stops sending frames because the tab went to the
     * background. Both used to leave the exercise frozen mid-set with no
     * explanation and no way forward, so both are handled here, from a timer
     * rather than from the frame callback — a callback that has stopped
     * firing cannot notice that it has stopped firing. */
    var LOST_MS = 900;
    var STALL_MS = 45000;      // no repetition for this long = offer a way out

    function lostMessage() {
      if (ex.tracker === 'hands') return T.needHand;
      if (ex.tracker === 'pose') return T.needBody;
      return T.needFace;
    }

    function liveness() {
      if (st.phase !== 'exercise' && st.phase !== 'calibrate') return;
      var quiet = Date.now() - latest.at;
      if (quiet > LOST_MS && !st.lost) {
        st.lost = true;
        el.rbLost.textContent = lostMessage();
        el.rbLost.classList.remove('hidden');
        if (counter) counter.discardPartial();
      }
      if (st.phase === 'exercise' && !el.rbStuck.classList.contains('hidden')) return;
      if (st.phase === 'exercise' && st.lastProgressAt && Date.now() - st.lastProgressAt > STALL_MS) {
        showStuck();
      }
    }

    function recovered() {
      st.lost = false;
      el.rbLost.classList.add('hidden');
      // Whatever was half-done before they disappeared is not credited to the
      // next repetition.
      if (counter) counter.discardPartial();
    }

    function showStuck() {
      st.running = false;
      el.rbLost.classList.add('hidden');
      el.rbStuck.classList.remove('hidden');
    }
    function hideStuck() {
      el.rbStuck.classList.add('hidden');
      st.lastProgressAt = Date.now();
    }

    setInterval(liveness, 250);

    // ── normalisation ──────────────────────────────────────
    function normalised(raw) {
      var peak = ex.bidirectional && st.dir < 0 ? st.peakNeg : st.peak;
      return M.normalise(raw, st.base, peak);
    }

    function symmetryNow() {
      if (!ex.symmetry) return null;
      return M.symmetry(latest.l, latest.r, st.baseL, st.baseR);
    }

    // ── flow ───────────────────────────────────────────────
    var TARGET_FRACTION = 0.6;      // of the person's own demonstrated range
    var RELEASE_FRACTION = 0.25;    // must drop back below this before the next rep

    function beginSession() {
      if (idleRelease) { clearTimeout(idleRelease); idleRelease = 0; }
      el.rbSetup.classList.add('hidden');
      el.rbResults.classList.add('hidden');
      el.rbSaveMsg.textContent = '';
      el.rbVideo.classList.add('on');
      st.setIndex = 0;
      st.amplitudes = [];
      st.symmetries = [];
      st.holds = [];
      st.longestHold = 0;
      st.lost = false;
      st.startedAt = Date.now();
      hideStuck();
      st.lastProgressAt = 0;

      // A second session starts from the results screen, by which point the
      // camera may already have been released. Bring it back before asking
      // the person to move.
      if (!stream || !tracker) {
        st.phase = 'calibrate';
        showCue(T.camera, 'rest');
        startCamera(calibrate);
        return;
      }
      calibrate();
    }

    function showCue(text, cls) {
      el.rbCue.classList.remove('hidden');
      el.rbCue.textContent = text;
      el.rbCue.className = cls || '';
    }

    var calSamples = [], calSamplesL = [], calSamplesR = [];

    /* Fewer distinct frames than this in a calibration step and there is not
       enough of a look at the person to build a target from. */
    var MIN_CAL_FRAMES = 6;

    /* Samples once per tracked frame rather than on a timer. Two reasons: the
       same frame counted forty times skews the median towards whatever the
       frame rate happened to be, and counting frames is the only way to tell
       "they held still" apart from "the camera never saw them". */
    function collect(ms, done) {
      calSamples = []; calSamplesL = []; calSamplesR = [];
      var lastSeq = -1;
      var end = Date.now() + ms;
      var hardEnd = Date.now() + ms * 3;
      (function loop() {
        var t = Date.now();
        if (latest.ok && latest.seq !== lastSeq) {
          lastSeq = latest.seq;
          calSamples.push(latest.v);
          if (latest.l != null) calSamplesL.push(latest.l);
          if (latest.r != null) calSamplesR.push(latest.r);
        } else if (st.lost) {
          // The window is for measuring the person, so don't spend it while
          // they are out of shot — but don't wait for ever either.
          end = Math.min(hardEnd, t + ms);
        }
        if (t >= end || t >= hardEnd) { done(calSamples.length); return; }
        setTimeout(loop, 30);
      })();
    }

    function calibrate() {
      st.phase = 'calibrate';
      st.lastProgressAt = 0;
      el.rbMeterWrap.classList.add('hidden');
      el.rbSym.classList.add('hidden');
      if (ex.type === 'targets') { calibrateArea(); return; }

      showCue(ex.tracker === 'face' ? T.calRelax : T.calRelaxBody, 'rest');
      collect(2600, function (n) {
        if (n < MIN_CAL_FRAMES) { calibrationFailed(); return; }
        st.base = median(calSamples);
        st.baseL = calSamplesL.length ? median(calSamplesL) : 0;
        st.baseR = calSamplesR.length ? median(calSamplesR) : 0;
        maxAttempts(0, [], []);
      });
    }

    /* Nothing usable was measured, which means the exercise cannot set a
       target. Say so and offer the way out rather than starting a session
       that can never complete a repetition. */
    function calibrationFailed() {
      showCue(T.cannotSee, 'rest');
      setTimeout(showStuck, 1800);
    }

    /* Three goes at the movement; the best is taken as the person's range for
       today. Three because a single attempt is often a false start.
       A movement with two directions gets two goes each, prompted with the
       same arrow the exercise itself uses — otherwise nothing ever asks for
       the second direction, and the set then waits for a movement the person
       was never measured doing. */
    function maxAttempts(i, peaks, negPeaks) {
      var total = ex.bidirectional ? 4 : 3;
      if (i >= total) { calibrationDone(peaks, negPeaks); return; }

      var dir = ex.bidirectional ? (i % 2 === 0 ? 1 : -1) : 1;
      st.dir = dir;
      var arrow = ex.bidirectional ? (dir > 0 ? ' ⟶' : ' ⟵') : '';
      showCue(T.calMax + arrow + ' — '
        + T.calMaxTry.replace('%N', String(i + 1)).replace('%M', String(total)), 'go');

      collect(2600, function (n) {
        if (n) {
          if (dir > 0) peaks.push(Math.max.apply(null, calSamples));
          else negPeaks.push(Math.min.apply(null, calSamples));
        }
        showCue(tx(ex.relaxCue) || T.calRelax, 'rest');
        setTimeout(function () { maxAttempts(i + 1, peaks, negPeaks); }, 1400);
      });
    }

    function calibrationDone(peaks, negPeaks) {
      st.peak = peaks.length ? Math.max.apply(null, peaks) : st.base;
      st.peakNeg = negPeaks.length ? Math.min.apply(null, negPeaks) : st.base;

      var spanPos = Math.abs(st.peak - st.base);
      var spanNeg = Math.abs(st.base - st.peakNeg);

      if (ex.bidirectional) {
        /* One direction is usually harder than the other after a stroke. A
           direction that was barely demonstrated leaves a target that either
           cannot be reached at all, or that ordinary wobble crosses on its
           own and counts repetitions nobody performed. Where the two
           measurements are that far apart, ask the harder direction for a
           share of the range the person actually showed. */
        if (spanNeg < spanPos * 0.4) { spanNeg = spanPos * 0.6; st.peakNeg = st.base - spanNeg; }
        else if (spanPos < spanNeg * 0.4) { spanPos = spanNeg * 0.6; st.peak = st.base + spanPos; }
      }

      var span = ex.bidirectional ? Math.min(spanPos, spanNeg) : spanPos;
      st.calibrationWeak = span < 0.012;
      showCue(st.calibrationWeak ? T.calTooSmall : T.calDone, 'go');
      setTimeout(startSet, st.calibrationWeak ? 4200 : 1500);
    }

    function calibrateArea() {
      showCue(T.calMove, 'go');
      var box = { minX: 1, maxX: 0, minY: 1, maxY: 0, n: 0 };
      var lastSeq = -1;
      var end = Date.now() + 6000;
      var hardEnd = Date.now() + 18000;
      (function loop() {
        var t = Date.now();
        if (t >= end || t >= hardEnd) {
          if (!box.n) { calibrationFailed(); return; }   // never saw them at all
          // Fall back to a modest central area if too little was seen.
          if (box.n < 10 || box.maxX - box.minX < 0.12) {
            box = { minX: 0.28, maxX: 0.72, minY: 0.28, maxY: 0.72 };
          }
          st.box = box;
          showCue(T.calDone, 'go');
          setTimeout(startSet, 1200);
          return;
        }
        if (latest.ok && latest.point && latest.seq !== lastSeq) {
          lastSeq = latest.seq;
          box.minX = Math.min(box.minX, latest.point.x);
          box.maxX = Math.max(box.maxX, latest.point.x);
          box.minY = Math.min(box.minY, latest.point.y);
          box.maxY = Math.max(box.maxY, latest.point.y);
          box.n += 1;
        } else if (st.lost) {
          end = Math.min(hardEnd, t + 6000);
        }
        setTimeout(loop, 50);
      })();
    }

    function startSet() {
      st.repCount = 0;
      newCounter();
      st.phase = 'exercise';
      st.running = true;
      st.lastProgressAt = Date.now();
      el.rbSetLbl.textContent = T.set + ' ' + (st.setIndex + 1) + ' ' + T.of + ' ' + st.sets;
      buildPips();
      if (ex.type === 'targets') {
        el.rbMeterWrap.classList.add('hidden');
        spawnTarget();
      } else {
        // No pointer during a meter exercise: it has nothing to do there, and
        // left on screen it just sits frozen on top of the repetition count.
        hidePointer();
        el.rbMeterWrap.classList.remove('hidden');
        var pos = (TARGET_FRACTION * 100);
        el.rbTargetLine.style.bottom = pos + '%';
        el.rbTargetFlag.textContent = T.target;
      }
      if (ex.symmetry) el.rbSym.classList.remove('hidden');
      nextPrompt();
    }

    function buildPips() {
      var html = '';
      for (var i = 0; i < st.reps; i += 1) html += '<span class="rb-pip"></span>';
      el.rbPips.innerHTML = html;
      el.rbCount.textContent = '0';
    }
    function markPip(n) {
      var pips = el.rbPips.children;
      if (pips[n - 1]) pips[n - 1].classList.add('done');
      el.rbCount.textContent = String(n);
    }

    function nextPrompt() {
      if (ex.bidirectional) {
        st.dir = (st.repCount % 2 === 0) ? 1 : -1;
        showCue(tx(ex.cue) + ' ' + (st.dir > 0 ? '⟶' : '⟵'), 'go');
      } else if (ex.type === 'targets') {
        showCue(tx(ex.cue), 'go');
      } else {
        showCue(tx(ex.cue), 'go');
      }
    }

    // ── per-frame update ───────────────────────────────────
    /* The counting itself lives in M.RepCounter, which is unit-tested against
       synthetic readings — including the tremor case, where a weak movement
       hovering on the threshold must not be counted many times over. */
    var counter = null;

    function newCounter() {
      counter = new M.RepCounter({
        target: TARGET_FRACTION,
        release: RELEASE_FRACTION,
        holdMs: ex.type === 'hold' ? (ex.holdMs || 3000) : 0,
      });
    }

    function tick() {
      if (!st.running || st.phase !== 'exercise') { drawPointer(); return; }
      if (ex.type === 'targets') { tickTargets(); return; }
      if (!counter) newCounter();

      var n = normalised(latest.v);
      el.rbFill.style.height = clamp(n * 100, 0, 100) + '%';
      el.rbMeter.classList.toggle('past', n >= TARGET_FRACTION);

      var sym = symmetryNow();
      if (sym != null) {
        el.rbSymFill.style.width = Math.round(sym * 100) + '%';
        el.rbSymVal.textContent = Math.round(sym * 100) + '%';
      }

      var ev = counter.update(n, Date.now());
      st.longestHold = Math.max(st.longestHold, counter.longestHold);

      if (ex.type === 'hold') {
        if (ev.holding && !ev.rep) {
          var left = Math.ceil(Math.max(0, (ex.holdMs || 3000) - ev.heldMs) / 1000);
          showCue(T.hold + ' ' + left, 'hold');
        } else if (ev.released && !ev.rep) {
          showCue(tx(ex.cue), 'go');
        }
      }

      if (ev.rep) {
        completeRep(sym, ev.peak);
      } else if (ev.released && ex.type !== 'hold') {
        nextPrompt();
      }
    }

    function completeRep(sym, peak) {
      st.repCount += 1;
      st.lastProgressAt = Date.now();
      st.amplitudes.push(Math.round(clamp(peak, 0, 1.4) * 100));
      if (sym != null) st.symmetries.push(Math.round(sym * 100));
      markPip(st.repCount);
      showCue(T.repDone + ' ✓', 'go');

      if (st.repCount >= st.reps) {
        endSet();
      } else if (ex.type === 'hold') {
        setTimeout(function () {
          if (st.running) showCue(tx(ex.relaxCue) || T.released, 'rest');
        }, 400);
        setTimeout(function () { if (st.running) nextPrompt(); }, 2200);
      }
    }

    function endSet() {
      st.running = false;
      st.setIndex += 1;
      el.rbCue.classList.add('hidden');
      el.rbLost.classList.add('hidden');
      el.rbMeterWrap.classList.add('hidden');
      clearTargets();
      if (st.setIndex >= st.sets) { finish(); return; }
      restThen(startSet);
    }

    function restThen(next) {
      st.phase = 'rest';
      el.rbRest.classList.remove('hidden');
      var left = 20;
      el.rbRestCount.textContent = String(left);
      var iv = setInterval(function () {
        left -= 1;
        el.rbRestCount.textContent = String(Math.max(0, left));
        if (left <= 0) {
          clearInterval(iv);
          el.rbRest.classList.add('hidden');
          next();
        }
      }, 1000);
    }

    // ── target exercises ───────────────────────────────────
    var currentTarget = null, dwellStart = 0;
    var DWELL_MS = 1200;

    function clearTargets() {
      if (currentTarget && currentTarget.node) currentTarget.node.remove();
      currentTarget = null;
      var p = document.getElementById('rbPointer');
      if (p) p.remove();
    }

    function spawnTarget() {
      clearTargets();
      var box = st.box || { minX: 0.25, maxX: 0.75, minY: 0.25, maxY: 0.75 };
      var x, y;
      // Scanning practice puts most targets on the side that gets missed.
      if (ex.biasToAffected && Math.random() < 0.72) {
        var half = (box.minX + box.maxX) / 2;
        // The view is mirrored, so the person's left appears on screen right.
        if (st.side === 'left') x = half + Math.random() * (box.maxX - half);
        else x = box.minX + Math.random() * (half - box.minX);
      } else {
        x = box.minX + Math.random() * (box.maxX - box.minX);
      }
      y = box.minY + Math.random() * (box.maxY - box.minY);

      var node = document.createElement('div');
      node.className = 'rb-target';
      node.innerHTML = '<span>⭐</span><span class="ring"></span>';
      document.body.appendChild(node);
      currentTarget = { x: x, y: y, sx: x, sy: y, node: node, ring: node.querySelector('.ring') };
      placeTarget();
      dwellStart = 0;
      nextPrompt();
    }

    /* Puts the star where it can actually be reached: fully on screen, and
       clear of the instruction at the top. A target half off the edge is one
       the person can never dwell on, and on the neglected side they would not
       even see that it was cut off. Re-runs on resize and rotation, since the
       star is positioned in pixels. */
    function placeTarget() {
      if (!currentTarget || !currentTarget.node) return;
      var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
      var mx = Math.min(0.45, 84 / w);
      var top = Math.min(0.45, 175 / h);
      var bot = Math.min(0.45, 96 / h);
      currentTarget.sx = clamp(currentTarget.x, mx, 1 - mx);
      currentTarget.sy = clamp(currentTarget.y, top, 1 - bot);
      currentTarget.node.style.left = (currentTarget.sx * w) + 'px';
      currentTarget.node.style.top = (currentTarget.sy * h) + 'px';
    }

    function hidePointer() {
      var p = document.getElementById('rbPointer');
      if (p) p.remove();
    }

    function pointerNode() {
      var p = document.getElementById('rbPointer');
      if (!p) {
        p = document.createElement('div');
        p.className = 'rb-pointer';
        p.id = 'rbPointer';
        document.body.appendChild(p);
      }
      return p;
    }

    function drawPointer() {
      if (!latest.ok || !latest.point) return;
      var p = pointerNode();
      p.style.left = (latest.point.x * window.innerWidth) + 'px';
      p.style.top = (latest.point.y * window.innerHeight) + 'px';
      checkDwellButtons();
    }

    function tickTargets() {
      drawPointer();
      if (!currentTarget || !latest.ok || !latest.point) return;
      // Against where the star was actually drawn, not where it was picked —
      // clamping can move it, and the reachable zone has to follow.
      var dx = (latest.point.x - currentTarget.sx) * window.innerWidth;
      var dy = (latest.point.y - currentTarget.sy) * window.innerHeight;
      var on = Math.sqrt(dx * dx + dy * dy) < 82;
      if (on) {
        if (!dwellStart) dwellStart = Date.now();
        var frac = clamp((Date.now() - dwellStart) / DWELL_MS, 0, 1);
        currentTarget.ring.style.clipPath = 'inset(' + ((1 - frac) * 100) + '% 0 0 0)';
        if (frac >= 1) {
          st.repCount += 1;
          st.amplitudes.push(100);
          st.lastProgressAt = Date.now();
          markPip(st.repCount);
          if (st.repCount >= st.reps) { endSet(); return; }
          spawnTarget();
        }
      } else {
        dwellStart = 0;
        currentTarget.ring.style.clipPath = 'inset(100% 0 0 0)';
      }
    }

    /* Dwell activation for real buttons, so the whole exercise can be run
       with no hands at all. Mouse and keyboard still work for anyone who has
       partial use of a hand — this is in addition, not instead. */
    var dwellBtn = null, dwellBtnStart = 0;
    var BTN_DWELL_MS = 1600;

    function clearDwell(b) {
      b.classList.remove('rb-dwelling');
      b.style.removeProperty('--dwell');
    }

    function checkDwellButtons() {
      if (!latest.point) return;
      var px = latest.point.x * window.innerWidth;
      var py = latest.point.y * window.innerHeight;
      var buttons = document.querySelectorAll('.rb-dwell');
      var over = null;
      [].forEach.call(buttons, function (b) {
        if (b.disabled || b.offsetParent === null) return;
        // Leaving the page is not something to do by accident mid-set, and on
        // the target exercises the pointer roams the whole screen. The way out
        // during a set is the panel that appears when nothing is working.
        if (b === el.rbBack && st.phase === 'exercise') return;
        var r = b.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) over = b;
      });
      if (over !== dwellBtn) {
        if (dwellBtn) clearDwell(dwellBtn);
        dwellBtn = over;
        dwellBtnStart = Date.now();
      }
      [].forEach.call(buttons, function (b) { if (b !== dwellBtn) clearDwell(b); });
      if (!dwellBtn) return;

      // Show the dwell filling up. Without it the button simply does nothing
      // for a second and a half, which reads as broken.
      var frac = clamp((Date.now() - dwellBtnStart) / BTN_DWELL_MS, 0, 1);
      dwellBtn.classList.add('rb-dwelling');
      dwellBtn.style.setProperty('--dwell', frac);
      if (frac >= 1) {
        var b = dwellBtn;
        dwellBtn = null;
        clearDwell(b);
        b.click();
      }
    }

    // ── finish ─────────────────────────────────────────────
    function mean(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }

    function finish() {
      st.phase = 'done';
      st.running = false;
      st.lost = false;
      el.rbSym.classList.add('hidden');
      el.rbCue.classList.add('hidden');
      el.rbLost.classList.add('hidden');
      el.rbMeterWrap.classList.add('hidden');
      el.rbVideo.classList.remove('on');
      clearTargets();
      hideStuck();

      var timeMs = Date.now() - st.startedAt;
      // A target exercise never measures how far anybody moved — it only asks
      // whether the star was reached. Reporting "best range 100%" for it would
      // put a number in front of a clinician that nothing actually measured.
      var measured = ex.type !== 'targets';
      var best = measured && st.amplitudes.length ? Math.max.apply(null, st.amplitudes) : null;
      var avg = measured && st.amplitudes.length ? mean(st.amplitudes) : null;
      var sym = st.symmetries.length ? mean(st.symmetries) : null;

      var cards = [
        ['🔁', st.amplitudes.length + ' / ' + (st.reps * st.sets), measured ? T.repsDone : T.targetsReached],
      ];
      if (best != null) cards.push(['📈', best + '%', T.bestRange]);
      if (avg != null) cards.push(['📊', avg + '%', T.avgRange]);
      cards.push(['⏱️', Math.max(1, Math.round(timeMs / 60000)) + ' min', T.timeSpent]);
      if (sym != null) cards.push(['⚖️', sym + '%', T.symmetry]);
      if (st.longestHold) cards.push(['🤝', (st.longestHold / 1000).toFixed(1) + 's', T.holdTime]);

      el.rbResultGrid.innerHTML = cards.map(function (c) {
        return '<div class="rb-result"><div class="n">' + c[0] + ' ' + c[1] + '</div><div class="l">' + c[2] + '</div></div>';
      }).join('');

      el.rbResults.classList.remove('hidden');
      // The camera stays on for now: every button on this screen is
      // dwell-activated, and somebody with no usable hands cannot press
      // "Do it again" or "Finish" once the pointer has stopped moving.
      scheduleIdleRelease();

      saveSession({
        exercise: ex.id,
        side: st.side,
        sets: st.setIndex,
        reps: st.amplitudes.length,
        targetReps: st.reps * st.sets,
        bestAmplitude: best,
        avgAmplitude: avg,
        symmetry: sym,
        longestHoldMs: st.longestHold,
        timeMs: timeMs,
        calibrationWeak: st.calibrationWeak,
        lang: lang,
      });
    }

    /* Leaving the camera light on indefinitely in someone's home is not
       acceptable either, so it is released once the results screen has been
       sitting there unused — with the reason shown, because a pointer that
       silently stops responding is worse than one that says why. */
    var idleRelease = 0;
    var IDLE_RELEASE_MS = 120000;

    function scheduleIdleRelease() {
      if (idleRelease) clearTimeout(idleRelease);
      idleRelease = setTimeout(function () {
        idleRelease = 0;
        if (st.phase !== 'done') return;
        stopCamera();
        el.rbSaveMsg.textContent = (el.rbSaveMsg.textContent + ' ' + T.cameraOff).trim();
      }, IDLE_RELEASE_MS);
    }

    function stopCamera() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      // Release the camera properly. Leaving the light on after an exercise
      // is finished is not acceptable in someone's home.
      if (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        stream = null;
      }
      if (tracker && tracker.close) { try { tracker.close(); } catch (e) {} }
      tracker = null;
      latest.ok = false;
    }

    function saveSession(payload) {
      var active = null, token = null;
      try {
        active = JSON.parse(localStorage.getItem('ig_active_child') || 'null');
        token = localStorage.getItem('ig_token');
      } catch (e) { /* storage blocked */ }
      if (!active || !active.id) { el.rbSaveMsg.textContent = T.notSaved; return; }
      fetch('/api/children/' + active.id + '/rehab-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
        body: JSON.stringify(payload),
      }).then(function (r) {
        // A session lost because the login quietly expired is worth saying
        // plainly — "could not save" gives the person nothing to act on.
        if (r.status === 401 || r.status === 403) { el.rbSaveMsg.textContent = T.signInToSave; return; }
        el.rbSaveMsg.textContent = r.ok ? T.saved : T.saveFail;
      }).catch(function () { el.rbSaveMsg.textContent = T.saveFail; });
    }

    window.addEventListener('pagehide', stopCamera);

    // boot
    build();
    startCamera();
  }

  global.IG_REHAB_GAME = IG_REHAB_GAME;
})(window);

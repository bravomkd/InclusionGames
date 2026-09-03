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
      reps: 'Repetitions per set', sets: 'Sets',
      safety: 'Before you start',
      safetyText: 'Sit down, supported, with your back against the chair. Move slowly and only as far as is comfortable. Stop straight away if anything hurts, or if you feel dizzy or unwell. This is practice between therapy sessions — it does not replace your therapist.',
      why: 'Why this exercise',
      notMedical: 'Practice software, not a medical device. It does not diagnose anything. Use it as your clinician advises.',
      calibrating: 'Setting up for you',
      calRelax: 'Relax completely', calRelaxSub: 'Just rest your face for a moment',
      calRelaxBody: 'Rest — stay still',
      calMax: 'Now show me your best', calMaxTry: 'Try %N of 3',
      calDone: 'All set — that is your range for today',
      calTooSmall: 'We could not see much movement. You can still practise — the targets will be very gentle. If this keeps happening, mention it to your clinician.',
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
      reps: 'Wiederholungen pro Satz', sets: 'Sätze',
      safety: 'Vor dem Start',
      safetyText: 'Setzen Sie sich mit dem Rücken an die Lehne. Bewegen Sie sich langsam und nur so weit, wie es angenehm ist. Brechen Sie sofort ab, wenn etwas schmerzt oder Ihnen schwindelig oder unwohl wird. Dies ist Übung zwischen den Therapieterminen — es ersetzt Ihre Therapie nicht.',
      why: 'Warum diese Übung',
      notMedical: 'Übungssoftware, kein Medizinprodukt. Sie stellt keine Diagnose. Nutzung nach Anweisung Ihrer Behandelnden.',
      calibrating: 'Einstellung auf Sie',
      calRelax: 'Ganz entspannen', calRelaxSub: 'Lassen Sie das Gesicht einen Moment ruhen',
      calRelaxBody: 'Ruhen — still halten',
      calMax: 'Jetzt Ihr Bestes zeigen', calMaxTry: 'Versuch %N von 3',
      calDone: 'Fertig — das ist Ihr heutiger Bereich',
      calTooSmall: 'Wir konnten kaum Bewegung erkennen. Sie können trotzdem üben — die Ziele werden sehr sanft. Wenn das öfter vorkommt, sprechen Sie Ihre Behandelnden an.',
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
    };

    var el = {};
    var stream = null, tracker = null, rafId = 0;

    // ── DOM ────────────────────────────────────────────────
    function build() {
      document.body.insertAdjacentHTML('afterbegin', [
        '<video id="rbVideo" autoplay playsinline muted></video>',
        '<canvas id="rbOverlay"></canvas>',
        '<div class="rb-top">',
        '  <span class="rb-brand"><span class="box">🎈</span>InclusionGames</span>',
        '  <a href="/stroke.html" class="rb-back" id="rbBack"></a>',
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

        '<div id="rbCue" class="hidden"></div>',
        '<div id="rbMeterWrap" class="hidden">',
        '  <div class="rb-meter" id="rbMeter">',
        '    <div class="rb-meter-fill" id="rbFill"></div>',
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

      ['rbVideo', 'rbOverlay', 'rbBack', 'rbSetup', 'rbTitle', 'rbShort', 'rbSafetyH', 'rbSafetyP',
        'rbCautionCard', 'rbCautionP', 'rbWhyH', 'rbWhyP', 'rbSideWrap', 'rbSideH', 'rbSideRow',
        'rbPreview', 'rbCamStatus', 'rbTrackStatus', 'rbStart', 'rbDwellHint', 'rbNotMedical',
        'rbCue', 'rbMeterWrap', 'rbMeter', 'rbFill', 'rbTargetLine', 'rbTargetFlag', 'rbCount',
        'rbCountLbl', 'rbPips', 'rbSetLbl', 'rbSym', 'rbSymLbl', 'rbSymFill', 'rbSymVal',
        'rbRest', 'rbRestH', 'rbRestCount', 'rbRestSub', 'rbResults', 'rbDoneH', 'rbDoneSub',
        'rbResultGrid', 'rbSaveMsg', 'rbAgain', 'rbFinish'].forEach(function (id) {
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

      if (ex.caution) {
        el.rbCautionCard.hidden = false;
        el.rbCautionP.textContent = '⚠️ ' + tx(ex.caution);
      }

      // Side picker, worded for what the exercise actually needs.
      el.rbSideH.textContent = ex.usesAffectedArm ? T.whichHand : T.affected;
      var sides = [['left', T.left], ['right', T.right]];
      if (!ex.usesAffectedArm && !ex.biasToAffected) sides.push(['both', T.bothSides]);
      el.rbSideRow.innerHTML = sides.map(function (s) {
        return '<button class="rb-choice" data-side="' + s[0] + '">' + s[1] + '</button>';
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

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
    }

    var ctx = null;
    function resizeCanvas() {
      if (!el.rbOverlay) return;
      el.rbOverlay.width = window.innerWidth;
      el.rbOverlay.height = window.innerHeight;
      ctx = el.rbOverlay.getContext('2d');
    }

    function setStatus(node, cls, text) {
      node.className = 'rb-status ' + cls;
      node.lastElementChild.textContent = text;
    }

    // ── camera + tracker ───────────────────────────────────
    function startCamera() {
      setStatus(el.rbCamStatus, '', T.camera);
      setStatus(el.rbTrackStatus, '', T.tracking);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus(el.rbCamStatus, 'bad', T.cameraNo);
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
        .then(function (s) {
          stream = s;
          el.rbPreview.srcObject = s;
          el.rbVideo.srcObject = s;
          el.rbPreview.play().catch(function () {});
          setStatus(el.rbCamStatus, 'ok', T.cameraReady);
          loadTracker();
        })
        .catch(function () {
          // Without a camera there is nothing to measure, so this exercise
          // genuinely cannot run — say so plainly rather than half-starting.
          setStatus(el.rbCamStatus, 'bad', T.cameraNo);
          setStatus(el.rbTrackStatus, 'bad', T.trackingNo);
        });
    }

    var TRACKER_SRC = {
      face: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/', global: 'FaceMesh' },
      pose: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/', global: 'Pose' },
      hands: { url: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js', base: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/', global: 'Hands' },
    };

    function loadTracker() {
      var spec = TRACKER_SRC[ex.tracker];
      var s = document.createElement('script');
      s.src = spec.url;
      s.crossOrigin = 'anonymous';
      s.onload = function () { initTracker(spec); };
      s.onerror = function () { setStatus(el.rbTrackStatus, 'bad', T.trackingNo); };
      document.head.appendChild(s);
    }

    function initTracker(spec) {
      var Ctor = global[spec.global];
      if (!Ctor) { setStatus(el.rbTrackStatus, 'bad', T.trackingNo); return; }
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
          pump();
        }).catch(function () { setStatus(el.rbTrackStatus, 'bad', T.trackingNo); });
      } catch (e) {
        setStatus(el.rbTrackStatus, 'bad', T.trackingNo);
      }
    }

    /* Feed frames continuously — the pointer has to work on the setup screen
       too, so that someone with no usable hands can press Begin. */
    function pump() {
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
    var latest = { v: 0, l: null, r: null, point: null, ok: false };

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
          var p = poseWrist(pl, st.side === 'right' ? 'right' : 'left');
          if (p) {
            var sh = pl[POSE_SHOULDER[st.side === 'right' ? 'right' : 'left']];
            reading = { v: sh ? (sh.y - p.y) : 0, l: null, r: null, point: p };
          }
        }
      } else {
        var hands = res.multiHandLandmarks;
        if (hands && hands.length) {
          var hl = hands[0];
          reading = { v: handOpenness(hl), l: null, r: null, point: { x: hl[9].x, y: hl[9].y } };
        }
      }

      if (!reading) {
        latest.ok = false;
        return;
      }
      latest.v = reading.v;
      latest.l = reading.l;
      latest.r = reading.r;
      // The display is mirrored, so flip x to keep the pointer under the
      // person's actual movement rather than opposite to it.
      latest.point = reading.point ? { x: 1 - reading.point.x, y: reading.point.y } : null;
      latest.ok = true;
      st.tracked = true;
      tick();
    }

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
      el.rbSetup.classList.add('hidden');
      el.rbVideo.classList.add('on');
      st.setIndex = 0;
      st.amplitudes = [];
      st.symmetries = [];
      st.holds = [];
      st.longestHold = 0;
      st.startedAt = Date.now();
      calibrate();
    }

    function showCue(text, cls) {
      el.rbCue.classList.remove('hidden');
      el.rbCue.textContent = text;
      el.rbCue.className = cls || '';
    }

    var calSamples = [], calSamplesL = [], calSamplesR = [];

    function collect(ms, done) {
      calSamples = []; calSamplesL = []; calSamplesR = [];
      var end = Date.now() + ms;
      (function loop() {
        if (Date.now() >= end) { done(); return; }
        if (latest.ok) {
          calSamples.push(latest.v);
          if (latest.l != null) calSamplesL.push(latest.l);
          if (latest.r != null) calSamplesR.push(latest.r);
        }
        setTimeout(loop, 40);
      })();
    }

    function calibrate() {
      st.phase = 'calibrate';
      if (ex.type === 'targets') { calibrateArea(); return; }

      showCue(T.calRelax, 'rest');
      collect(2600, function () {
        st.base = median(calSamples);
        st.baseL = calSamplesL.length ? median(calSamplesL) : 0;
        st.baseR = calSamplesR.length ? median(calSamplesR) : 0;
        maxAttempts(0, [], []);
      });
    }

    /* Three goes at the movement; the best is taken as the person's range for
       today. Three because a single attempt is often a false start. */
    function maxAttempts(i, peaks, negPeaks) {
      if (i >= 3) {
        st.peak = peaks.length ? Math.max.apply(null, peaks) : st.base;
        st.peakNeg = negPeaks.length ? Math.min.apply(null, negPeaks) : st.base;
        var span = Math.abs(st.peak - st.base);
        st.calibrationWeak = span < 0.012;
        showCue(st.calibrationWeak ? T.calTooSmall : T.calDone, 'go');
        setTimeout(startSet, st.calibrationWeak ? 4200 : 1500);
        return;
      }
      showCue(T.calMax + ' — ' + T.calMaxTry.replace('%N', String(i + 1)), 'go');
      collect(2600, function () {
        if (calSamples.length) {
          peaks.push(Math.max.apply(null, calSamples));
          negPeaks.push(Math.min.apply(null, calSamples));
        }
        showCue(tx(ex.relaxCue) || T.calRelax, 'rest');
        setTimeout(function () { maxAttempts(i + 1, peaks, negPeaks); }, 1400);
      });
    }

    function calibrateArea() {
      showCue(T.calMove, 'go');
      var box = { minX: 1, maxX: 0, minY: 1, maxY: 0, n: 0 };
      var end = Date.now() + 6000;
      (function loop() {
        if (Date.now() >= end) {
          // Fall back to a modest central area if too little was seen.
          if (box.n < 10 || box.maxX - box.minX < 0.12) {
            box = { minX: 0.28, maxX: 0.72, minY: 0.28, maxY: 0.72 };
          }
          st.box = box;
          showCue(T.calDone, 'go');
          setTimeout(startSet, 1200);
          return;
        }
        if (latest.ok && latest.point) {
          box.minX = Math.min(box.minX, latest.point.x);
          box.maxX = Math.max(box.maxX, latest.point.x);
          box.minY = Math.min(box.minY, latest.point.y);
          box.maxY = Math.max(box.maxY, latest.point.y);
          box.n += 1;
        }
        setTimeout(loop, 50);
      })();
    }

    function startSet() {
      st.repCount = 0;
      newCounter();
      st.phase = 'exercise';
      st.running = true;
      el.rbSetLbl.textContent = T.set + ' ' + (st.setIndex + 1) + ' ' + T.of + ' ' + st.sets;
      buildPips();
      if (ex.type === 'targets') {
        el.rbMeterWrap.classList.add('hidden');
        spawnTarget();
      } else {
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
      node.style.left = (x * window.innerWidth) + 'px';
      node.style.top = (y * window.innerHeight) + 'px';
      document.body.appendChild(node);
      currentTarget = { x: x, y: y, node: node, ring: node.querySelector('.ring') };
      dwellStart = 0;
      nextPrompt();
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
      var dx = (latest.point.x - currentTarget.x) * window.innerWidth;
      var dy = (latest.point.y - currentTarget.y) * window.innerHeight;
      var on = Math.sqrt(dx * dx + dy * dy) < 82;
      if (on) {
        if (!dwellStart) dwellStart = Date.now();
        var frac = clamp((Date.now() - dwellStart) / DWELL_MS, 0, 1);
        currentTarget.ring.style.clipPath = 'inset(' + ((1 - frac) * 100) + '% 0 0 0)';
        if (frac >= 1) {
          st.repCount += 1;
          st.amplitudes.push(100);
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
    function checkDwellButtons() {
      if (!latest.point) return;
      var px = latest.point.x * window.innerWidth;
      var py = latest.point.y * window.innerHeight;
      var over = null;
      document.querySelectorAll('.rb-dwell').forEach(function (b) {
        if (b.disabled || b.offsetParent === null) return;
        var r = b.getBoundingClientRect();
        if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) over = b;
      });
      if (over !== dwellBtn) { dwellBtn = over; dwellBtnStart = Date.now(); if (over) over.style.outline = '4px solid #7c9cff'; }
      document.querySelectorAll('.rb-dwell').forEach(function (b) { if (b !== dwellBtn) b.style.outline = ''; });
      if (dwellBtn && Date.now() - dwellBtnStart > 1600) {
        var b = dwellBtn;
        dwellBtn = null;
        b.style.outline = '';
        b.click();
      }
    }

    // ── finish ─────────────────────────────────────────────
    function mean(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }

    function finish() {
      st.phase = 'done';
      st.running = false;
      el.rbSym.classList.add('hidden');
      el.rbCue.classList.add('hidden');
      el.rbVideo.classList.remove('on');
      clearTargets();
      stopCamera();

      var timeMs = Date.now() - st.startedAt;
      var best = st.amplitudes.length ? Math.max.apply(null, st.amplitudes) : 0;
      var avg = mean(st.amplitudes);
      var sym = st.symmetries.length ? mean(st.symmetries) : null;

      var cards = [
        ['🔁', st.amplitudes.length + ' / ' + (st.reps * st.sets), T.repsDone],
        ['📈', best + '%', T.bestRange],
        ['📊', avg + '%', T.avgRange],
        ['⏱️', Math.max(1, Math.round(timeMs / 60000)) + ' min', T.timeSpent],
      ];
      if (sym != null) cards.push(['⚖️', sym + '%', T.symmetry]);
      if (st.longestHold) cards.push(['🤝', (st.longestHold / 1000).toFixed(1) + 's', T.holdTime]);

      el.rbResultGrid.innerHTML = cards.map(function (c) {
        return '<div class="rb-result"><div class="n">' + c[0] + ' ' + c[1] + '</div><div class="l">' + c[2] + '</div></div>';
      }).join('');

      el.rbResults.classList.remove('hidden');
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

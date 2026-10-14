/* ============================================================
 * InclusionGames — one switch, many ways to press it.
 *
 * Some games need a single well-timed press and nothing else. This
 * turns a camera into that press: opening your mouth, raising a hand,
 * opening a hand, lifting your eyebrows or tilting your head all
 * produce the same signal, and so does the space bar.
 *
 * ── Why this is not just a threshold ─────────────────────────
 * A fixed threshold — "open your mouth 2cm" — is either trivial or
 * impossible depending on who is sitting in front of the camera, and
 * the people this is for are exactly the people a norm does not fit.
 * So every source is calibrated first: a few seconds at rest, a few
 * showing their best, and the press point is then a fraction of the
 * range THEY demonstrated.
 *
 * ── Why latency is the whole problem ─────────────────────────
 * This feeds timing games, where a press 200ms late is a press that
 * missed. So the switch fires on the way up, the moment the signal
 * crosses, rather than waiting to see a complete movement. Everything
 * that guards against false presses had to be paid for in some other
 * currency than delay:
 *   - two consecutive frames instead of smoothing (~33ms at 30fps,
 *     where an averaging filter would cost far more and still lag)
 *   - hysteresis instead of a timer: having fired, the switch will not
 *     fire again until the signal falls well back, so a tremor sitting
 *     on the threshold cannot rattle out presses
 *   - losing the face or hand disarms it, so re-acquiring mid-movement
 *     cannot fire a press nobody made
 *
 * Loads as window.IG_SWITCH in the browser and through require() in
 * Node, so the measurement can be tested without a webcam.
 *
 * The landmark arithmetic here overlaps with the stroke-rehab
 * measurement module on its own branch. That is deliberate rather than
 * forgotten: this is a game input, it makes no claim about anybody's
 * body, and it should not acquire one by sharing a file with something
 * that does.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_SWITCH = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // MediaPipe Face Mesh indices. Group A sits at the smaller x, which is the
  // image left — the person's own right. Nothing here cares which side is
  // which, but the pair has to be consistent.
  var FACE = {
    eyeOuterA: 33, eyeOuterB: 263,
    lidUpA: 159, lidUpB: 386,
    browA: 105, browB: 334,
    lipUp: 13, lipLow: 14,
  };

  /* Every face measurement is divided by the distance between the eyes, so
     leaning towards the camera does not read as a press. */
  function interocular(lm) {
    var d = dist(lm[FACE.eyeOuterA], lm[FACE.eyeOuterB]);
    return d > 1e-6 ? d : 1e-6;
  }

  var PALM = 9, WRIST = 0, TIPS = [8, 12, 16, 20];

  /* Each reader returns a number where larger means "more pressed", or null
     when there is nothing to read. Raw scale and sign never reach the player:
     calibration maps whatever this returns onto their own range. */
  var SOURCES = {
    mouthOpen: {
      tracker: 'face',
      label: { en: 'Open your mouth', de: 'Mund öffnen', pl: 'Otwórz usta', es: 'Abre la boca' },
      cue: {
        en: 'Open your mouth to jump', de: 'Mund öffnen zum Springen',
        pl: 'Otwórz usta, aby skoczyć', es: 'Abre la boca para saltar',
      },
      read: function (lm) {
        return dist(lm[FACE.lipUp], lm[FACE.lipLow]) / interocular(lm);
      },
    },

    browRaise: {
      tracker: 'face',
      label: { en: 'Raise your eyebrows', de: 'Augenbrauen heben', pl: 'Unieś brwi', es: 'Levanta las cejas' },
      cue: {
        en: 'Lift your eyebrows to jump', de: 'Augenbrauen heben zum Springen',
        pl: 'Unieś brwi, aby skoczyć', es: 'Levanta las cejas para saltar',
      },
      read: function (lm) {
        var io = interocular(lm);
        return (dist(lm[FACE.browA], lm[FACE.lidUpA]) + dist(lm[FACE.browB], lm[FACE.lidUpB])) / (2 * io);
      },
    },

    headTilt: {
      tracker: 'face',
      label: { en: 'Tilt your head', de: 'Kopf neigen', pl: 'Przechyl głowę', es: 'Inclina la cabeza' },
      cue: {
        en: 'Tilt your head to jump', de: 'Kopf neigen zum Springen',
        pl: 'Przechyl głowę, aby skoczyć', es: 'Inclina la cabeza para saltar',
      },
      /* Either direction counts. Asking for one specific side would rule out
         anyone who can only tilt one way, which is a sizeable share of the
         people this exists for. */
      read: function (lm) {
        var a = lm[FACE.eyeOuterA], b = lm[FACE.eyeOuterB];
        return Math.abs(Math.atan2(b.y - a.y, b.x - a.x));
      },
    },

    handRaise: {
      tracker: 'hands',
      label: { en: 'Raise your hand', de: 'Hand heben', pl: 'Podnieś rękę', es: 'Levanta la mano' },
      cue: {
        en: 'Raise your hand to jump', de: 'Hand heben zum Springen',
        pl: 'Podnieś rękę, aby skoczyć', es: 'Levanta la mano para saltar',
      },
      // Screen y grows downwards, so negate: higher hand, larger number.
      read: function (hand) { return -hand[PALM].y; },
    },

    handOpen: {
      tracker: 'hands',
      label: { en: 'Open your hand', de: 'Hand öffnen', pl: 'Otwórz dłoń', es: 'Abre la mano' },
      cue: {
        en: 'Open your hand to jump', de: 'Hand öffnen zum Springen',
        pl: 'Otwórz dłoń, aby skoczyć', es: 'Abre la mano para saltar',
      },
      read: function (hand) {
        var palm = dist(hand[WRIST], hand[PALM]);
        if (palm < 1e-6) return 0;
        var sum = 0;
        TIPS.forEach(function (t) { sum += dist(hand[WRIST], hand[t]); });
        return (sum / TIPS.length) / palm;
      },
    },

    key: {
      tracker: 'none',
      label: { en: 'Space bar, click or tap', de: 'Leertaste, Klick oder Tippen', pl: 'Spacja, klik lub dotyk', es: 'Barra espaciadora, clic o toque' },
      cue: {
        en: 'Press space, click or tap to jump', de: 'Leertaste, Klick oder Tippen zum Springen',
        pl: 'Naciśnij spację, kliknij lub dotknij, aby skoczyć', es: 'Pulsa espacio, haz clic o toca para saltar',
      },
      read: null,          // driven by events, not by the camera
    },
  };

  function sourceIds() { return Object.keys(SOURCES); }
  function cameraSources() {
    return sourceIds().filter(function (id) { return SOURCES[id].tracker !== 'none'; });
  }

  /* Read a source from whatever the tracker just produced. Returns null when
     there is nothing to read — no face in shot, no hand, an unknown source —
     and null is never treated as zero, because zero is a real reading. */
  function read(sourceId, frame) {
    var src = SOURCES[sourceId];
    if (!src || !src.read || !frame) return null;
    if (src.tracker === 'face') {
      var faces = frame.multiFaceLandmarks;
      if (!faces || !faces.length) return null;
      var v = src.read(faces[0]);
      return isFinite(v) ? v : null;
    }
    if (src.tracker === 'hands') {
      var hands = frame.multiHandLandmarks;
      if (!hands || !hands.length) return null;
      // Whichever hand is highest: a player with one usable hand must not have
      // to tell us which, and a player using both should not be penalised.
      var best = null, bestV = -Infinity;
      for (var i = 0; i < hands.length; i += 1) {
        var r = src.read(hands[i]);
        if (isFinite(r) && r > bestV) { bestV = r; best = r; }
      }
      return best;
    }
    return null;
  }

  /* ── Calibration ───────────────────────────────────────────
     Rest first, then best effort. The press point sits at PRESS_AT of the
     range between them, low enough that the switch fires early in the
     movement rather than at the end of it, and the release point well below
     so a signal hovering near the press point cannot chatter. */
  var PRESS_AT = 0.45;
  var RELEASE_AT = 0.22;
  /* Below this the "range" is indistinguishable from landmark jitter, and a
     switch built on it would fire on its own. Measured in the same
     eye-distance units everything else uses. */
  var MIN_SPAN = 0.010;

  function Calibrator(opts) {
    opts = opts || {};
    this.pressAt = opts.pressAt != null ? opts.pressAt : PRESS_AT;
    this.releaseAt = opts.releaseAt != null ? opts.releaseAt : RELEASE_AT;
    this.minSpan = opts.minSpan != null ? opts.minSpan : MIN_SPAN;
    this.rest = [];
    this.effort = [];
  }
  Calibrator.prototype.restSample = function (v) { if (v != null && isFinite(v)) this.rest.push(v); };
  Calibrator.prototype.effortSample = function (v) { if (v != null && isFinite(v)) this.effort.push(v); };

  /* The rest point is a median — a sample or two where the person twitched
     should not move it. The effort point is the best of what they managed,
     because the question is what they CAN do, not what they did on average
     while being asked to. */
  Calibrator.prototype.finish = function () {
    var base = median(this.rest);
    var peak = this.effort.length ? Math.max.apply(null, this.effort) : base;
    var span = peak - base;
    var weak = !(span >= this.minSpan);

    return {
      base: base,
      peak: peak,
      span: span,
      weak: weak,
      restSamples: this.rest.length,
      effortSamples: this.effort.length,
      press: base + span * this.pressAt,
      release: base + span * this.releaseAt,
    };
  };

  /* Map a reading onto 0..1 of the person's own range, for a meter. Values
     above 1 are kept rather than clipped: beating your own calibration is
     worth seeing. */
  function normalise(raw, cal) {
    if (raw == null || !cal) return 0;
    var span = cal.peak - cal.base;
    if (!isFinite(span) || Math.abs(span) < 1e-9) return 0;
    return clamp((raw - cal.base) / span, 0, 1.5);
  }

  /* ── The switch ────────────────────────────────────────────
     Feed it readings; it tells you when a press begins. */
  function Switch(cal, opts) {
    opts = opts || {};
    this.cal = cal;
    /* Confirmation is counted over a short window rather than as consecutive
       frames. Consecutive frames sound stricter and are, but they are strict
       about the wrong thing: a weak or tremulous movement sitting on the
       press point alternates above and below it, never managing two in a row,
       and the switch would simply never fire for the player least able to
       hold a position. Two frames out of the last three rejects a single
       stray landmark just as well and still lets a shaky effort through. */
    this.confirmFrames = opts.confirmFrames != null ? opts.confirmFrames : 2;
    this.window = opts.window != null ? opts.window : 3;
    this.minGapMs = opts.minGapMs != null ? opts.minGapMs : 150;
    this.reset();
  }

  Switch.prototype.reset = function () {
    this.armed = true;        // ready to fire
    this.down = false;        // currently held past the press point
    this.recent = [];         // recent frames, 1 where past the press point
    this.lastPressAt = -Infinity;
    this.presses = 0;
  };

  /* Tracking was lost. Disarm until the signal has been seen below the
     release point again, so a face reappearing mid-movement cannot fire a
     press the player never made. */
  Switch.prototype.lost = function () {
    this.armed = false;
    this.down = false;
    this.recent.length = 0;
  };

  /* One reading. `raw` may be null, meaning nothing was visible.
     Returns { pressed, down, n } — `pressed` is true only on the frame the
     press begins. */
  Switch.prototype.update = function (raw, nowMs) {
    var out = { pressed: false, down: this.down, n: 0 };
    if (raw == null) { this.lost(); out.down = false; return out; }

    out.n = normalise(raw, this.cal);
    var past = raw >= this.cal.press;
    var back = raw <= this.cal.release;

    this.recent.push(past ? 1 : 0);
    if (this.recent.length > this.window) this.recent.shift();

    // All the way back to rest: ready for the next press, and start counting
    // again from nothing.
    if (back) { this.armed = true; this.down = false; this.recent.length = 0; }

    if (past && this.armed && (nowMs - this.lastPressAt) >= this.minGapMs) {
      var hits = 0;
      for (var i = 0; i < this.recent.length; i += 1) hits += this.recent[i];
      if (hits >= this.confirmFrames) {
        this.armed = false;
        this.down = true;
        this.lastPressAt = nowMs;
        this.presses += 1;
        out.pressed = true;
      }
    }

    out.down = this.down;
    return out;
  };

  return {
    SOURCES: SOURCES,
    FACE: FACE,
    PRESS_AT: PRESS_AT, RELEASE_AT: RELEASE_AT, MIN_SPAN: MIN_SPAN,
    sourceIds: sourceIds, cameraSources: cameraSources,
    read: read, normalise: normalise,
    Calibrator: Calibrator, Switch: Switch,
    dist: dist, clamp: clamp, median: median,
  };
});

/* ============================================================
 * InclusionGames — the measurement layer for stroke rehab.
 *
 * Split out from rehab-engine.js so it can be tested in Node against
 * synthetic landmarks. This is the part that decides whether a
 * person's repetition is counted, and getting it wrong means either
 * inventing repetitions they did not do or ignoring ones they did.
 * Neither is acceptable in something a clinician might read, so it
 * lives here where it can be tested without a webcam.
 *
 * Loads as window.IG_REHAB_METRICS in the browser and via require()
 * in Node.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_REHAB_METRICS = api;
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

  /* Landmark groups for the two halves of the face. MediaPipe returns points
     in the RAW camera image, which is not mirrored, so the group with the
     smaller x sits on the image left — the person's own RIGHT. resolveSides()
     does that mapping once so nothing downstream has to think about it. */
  var FACE_A = { eyeOuter: 33, eyeInner: 133, lidUp: 159, lidLo: 145, brow: 105, mouth: 61 };
  var FACE_B = { eyeOuter: 263, eyeInner: 362, lidUp: 386, lidLo: 374, brow: 334, mouth: 291 };
  var NOSE = 1, LIP_UP = 13, LIP_LO = 14;

  function interocular(lm) {
    var d = dist(lm[FACE_A.eyeOuter], lm[FACE_B.eyeOuter]);
    return d > 1e-6 ? d : 1e-6;          // a degenerate frame must not divide by zero
  }

  function resolveSides(lm) {
    var aIsImageLeft = lm[FACE_A.eyeOuter].x < lm[FACE_B.eyeOuter].x;
    return aIsImageLeft ? { right: FACE_A, left: FACE_B } : { right: FACE_B, left: FACE_A };
  }

  function eyeAspect(lm, side) {
    var w = dist(lm[side.eyeOuter], lm[side.eyeInner]);
    if (w < 1e-6) return 0;
    return dist(lm[side.lidUp], lm[side.lidLo]) / w;
  }

  /* Each metric returns { v, l, r } where v is what the meter follows and l/r
     are the same quantity per side (null when the movement has no meaningful
     sides). Higher v ALWAYS means more of the wanted movement; two of these
     are negated for that reason. Raw scale and sign never reach the screen,
     because calibration normalises everything to the person's own range. */
  var METRICS = {
    mouthOpen: function (lm) {
      return { v: dist(lm[LIP_UP], lm[LIP_LO]) / interocular(lm), l: null, r: null };
    },
    smile: function (lm) {
      var io = interocular(lm), s = resolveSides(lm);
      var midX = (lm[FACE_A.eyeOuter].x + lm[FACE_B.eyeOuter].x) / 2;
      function corner(side) {
        var out = Math.abs(lm[side.mouth].x - midX) / io;           // pulled outwards
        var lift = (lm[side.eyeOuter].y - lm[side.mouth].y) / io;    // and upwards
        return out + lift;
      }
      var l = corner(s.left), r = corner(s.right);
      return { v: (l + r) / 2, l: l, r: r };
    },
    browRaise: function (lm) {
      var io = interocular(lm), s = resolveSides(lm);
      var l = dist(lm[s.left.brow], lm[s.left.lidUp]) / io;
      var r = dist(lm[s.right.brow], lm[s.right.lidUp]) / io;
      return { v: (l + r) / 2, l: l, r: r };
    },
    eyeClose: function (lm) {
      // Negated: a smaller eye opening is MORE closure, and the meter has to
      // fill as the eye shuts.
      var s = resolveSides(lm);
      var l = -eyeAspect(lm, s.left), r = -eyeAspect(lm, s.right);
      return { v: (l + r) / 2, l: l, r: r };
    },
    pucker: function (lm) {
      // Negated for the same reason: the mouth narrows as the lips purse.
      return { v: -(dist(lm[FACE_A.mouth], lm[FACE_B.mouth]) / interocular(lm)), l: null, r: null };
    },
    headYaw: function (lm) {
      // Signed. Which sign means which way is settled by the person's own
      // calibration rather than assumed here.
      var a = dist(lm[NOSE], lm[FACE_A.eyeOuter]);
      var b = dist(lm[NOSE], lm[FACE_B.eyeOuter]);
      var sum = a + b;
      return { v: sum > 1e-6 ? (a - b) / sum : 0, l: null, r: null };
    },
    nosePoint: function (lm) {
      return { v: 0, l: null, r: null, point: { x: lm[NOSE].x, y: lm[NOSE].y } };
    },
  };

  /* Which measurement each tracker is able to produce. The face tracker
     produces the metrics above; the other two produce a single tracked point
     each, which the engine turns into reach or grip.
     This is checked at start-up, because a face exercise naming a metric that
     does not exist used to silently fall back to mouth opening — measuring
     the wrong movement with nothing appearing to go wrong. */
  var TRACKER_METRICS = {
    face: Object.keys(METRICS),
    pose: ['wristPoint'],
    hands: ['handOpen'],
  };
  function metricExists(tracker, metric) {
    var allowed = TRACKER_METRICS[tracker];
    return !!allowed && allowed.indexOf(metric) >= 0;
  }

  var POSE_WRIST = { left: 15, right: 16 };
  var POSE_SHOULDER = { left: 11, right: 12 };

  function poseWrist(lm, side) {
    var w = lm[POSE_WRIST[side]];
    if (!w || (w.visibility != null && w.visibility < 0.4)) return null;
    return { x: w.x, y: w.y };
  }

  function handOpenness(lm) {
    var palm = dist(lm[0], lm[9]);
    if (palm < 1e-6) return 0;
    var tips = [8, 12, 16, 20], sum = 0;
    tips.forEach(function (t) { sum += dist(lm[0], lm[t]); });
    return (sum / tips.length) / palm;
  }

  /* Map a raw reading onto 0..1.4 of the person's calibrated range.
     Above 1.0 is allowed and meaningful: it means they beat the effort they
     managed during set-up, which is worth seeing rather than clipping away. */
  function normalise(raw, base, peak) {
    var span = peak - base;
    if (!isFinite(span) || Math.abs(span) < 1e-6) return 0;
    return clamp((raw - base) / span, 0, 1.4);
  }

  /* Evenness between the two sides, 0..1, measured as movement AWAY from each
     side's own resting position — not as a raw comparison of the two, which
     would call a face asymmetric just for being asymmetric at rest. */
  function symmetry(l, r, baseL, baseR) {
    if (l == null || r == null) return null;
    var dl = Math.abs(l - (baseL || 0));
    var dr = Math.abs(r - (baseR || 0));
    var bigger = Math.max(dl, dr);
    if (bigger < 1e-6) return null;
    return clamp(Math.min(dl, dr) / bigger, 0, 1);
  }

  /* Counts repetitions with hysteresis.
   *
   * The movement has to cross `target`, and then fall back below `release`,
   * before another one counts. Without that gap, a hand or lip trembling right
   * at the threshold — which is exactly what weakness looks like — would rattle
   * up dozens of repetitions the person never performed.
   *
   * For a hold exercise, the reading must stay above `target` continuously for
   * holdMs. Dropping out early is not punished: the partial hold is reported
   * and the person is simply asked again.
   */
  function RepCounter(opts) {
    opts = opts || {};
    this.target = opts.target != null ? opts.target : 0.6;
    this.release = opts.release != null ? opts.release : 0.25;
    this.holdMs = opts.holdMs || 0;
    this.reps = 0;
    this.peak = 0;
    this.state = 'waiting';
    this.holdStart = null;   // null, not 0 — a timestamp of 0 is a real time
    this.longestHold = 0;
    this.amplitudes = [];
  }

  /* Feed one reading. Returns an event describing what changed:
       { rep: bool, holding: bool, heldMs: n, released: bool, peak: n } */
  RepCounter.prototype.update = function (n, nowMs) {
    var out = { rep: false, holding: false, heldMs: 0, released: false, peak: this.peak };
    if (n > this.peak) this.peak = n;
    out.peak = this.peak;

    if (this.holdMs > 0) {
      if (n >= this.target) {
        // Once the repetition is banked, staying up neither counts again nor
        // keeps inflating the longest hold — the person is simply resting in
        // position, and reporting that as a 40-second hold to a clinician
        // would be a fiction.
        if (this.state !== 'waiting') return out;
        if (this.holdStart === null) this.holdStart = nowMs;
        out.holding = true;
        out.heldMs = nowMs - this.holdStart;
        if (out.heldMs > this.longestHold) this.longestHold = out.heldMs;
        if (out.heldMs >= this.holdMs) {
          this.state = 'returning';
          this.reps += 1;
          this.amplitudes.push(this.peak);
          this.holdStart = null;
          out.rep = true;
        }
      } else {
        if (this.holdStart !== null) {
          var partial = nowMs - this.holdStart;
          if (partial > this.longestHold) this.longestHold = partial;
          this.holdStart = null;
          out.released = true;
        }
        if (this.state === 'returning' && n <= this.release) {
          this.state = 'waiting';
          this.peak = 0;
        }
      }
      return out;
    }

    if (this.state === 'waiting' && n >= this.target) {
      this.state = 'returning';
      this.reps += 1;
      this.amplitudes.push(this.peak);
      out.rep = true;
    } else if (this.state === 'returning' && n <= this.release) {
      this.state = 'waiting';
      this.peak = 0;
      out.released = true;
    }
    return out;
  };

  /* Called when tracking was lost part-way through a movement. Anything the
     person had built up before they went out of shot is thrown away rather
     than credited to the repetition they do next, but a repetition already
     counted is left alone. */
  RepCounter.prototype.discardPartial = function () {
    if (this.state === 'waiting') {
      this.peak = 0;
      this.holdStart = null;
    }
  };

  return {
    dist: dist, clamp: clamp, median: median,
    FACE_A: FACE_A, FACE_B: FACE_B, NOSE: NOSE, LIP_UP: LIP_UP, LIP_LO: LIP_LO,
    POSE_WRIST: POSE_WRIST, POSE_SHOULDER: POSE_SHOULDER,
    interocular: interocular, resolveSides: resolveSides, eyeAspect: eyeAspect,
    METRICS: METRICS, TRACKER_METRICS: TRACKER_METRICS, metricExists: metricExists,
    poseWrist: poseWrist, handOpenness: handOpenness,
    normalise: normalise, symmetry: symmetry, RepCounter: RepCounter,
  };
});

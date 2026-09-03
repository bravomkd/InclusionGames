/* ============================================================
 * Synthetic bodies for the stroke rehab tests.
 *
 * Produces MediaPipe-shaped landmark arrays for a person doing a
 * movement to a given effort (0 = at rest, 1 = their full range).
 * Used by the browser harness (test/harness/rehab-harness.html) to
 * drive the real engine without a webcam, and available to Node
 * tests through require().
 *
 * Coordinates are normalised 0..1 in the RAW camera image — not
 * mirrored — which is what MediaPipe actually returns and what the
 * engine expects.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_SYNTH = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FACE_A = { eyeOuter: 33, eyeInner: 133, lidUp: 159, lidLo: 145, brow: 105, mouth: 61 };
  var FACE_B = { eyeOuter: 263, eyeInner: 362, lidUp: 386, lidLo: 374, brow: 334, mouth: 291 };
  var NOSE = 1, LIP_UP = 13, LIP_LO = 14;

  function num(v, dflt) { return typeof v === 'number' && isFinite(v) ? v : dflt; }

  /* A face at a given effort on each movement.
   *
   * `weak` is the fraction of movement the person's LEFT side manages
   * relative to their right — 1 is even, 0.4 is a markedly weaker left.
   * Group A sits at the smaller x, which is the image left, which is the
   * person's own RIGHT. */
  function face(o) {
    o = o || {};
    var mouthOpen = num(o.mouthOpen, 0);
    var smile = num(o.smile, 0);
    var brow = num(o.brow, 0);
    var eyeClose = num(o.eyeClose, 0);
    var pucker = num(o.pucker, 0);
    var yaw = num(o.yaw, 0);              // -1 .. 1
    var weak = num(o.weak, 1);
    var scale = num(o.scale, 1);          // how close to the camera
    var cx = num(o.cx, 0.5), cy = num(o.cy, 0.5);

    // Per side: A = person's right (full strength), B = person's left (weak).
    var smileR = smile, smileL = smile * weak;
    var browR = brow, browL = brow * weak;
    var closeR = eyeClose, closeL = eyeClose * weak;

    var mouthGap = 0.008 + mouthOpen * 0.075;
    var widthR = 0.058 + smileR * 0.036 - pucker * 0.028;
    var widthL = 0.058 + smileL * 0.036 - pucker * 0.028;
    var liftR = smileR * 0.030, liftL = smileL * 0.030;
    var browGapR = 0.045 + browR * 0.050, browGapL = 0.045 + browL * 0.050;
    var eyeOpenR = 0.026 * (1 - closeR * 0.94), eyeOpenL = 0.026 * (1 - closeL * 0.94);

    var lm = [];
    function put(i, x, y) { lm[i] = { x: cx + (x - 0.5) * scale, y: cy + (y - 0.5) * scale, z: 0 }; }
    for (var i = 0; i <= 470; i += 1) put(i, 0.5, 0.5);

    put(FACE_A.eyeOuter, 0.40, 0.40);
    put(FACE_B.eyeOuter, 0.60, 0.40);
    put(FACE_A.eyeInner, 0.46, 0.40);
    put(FACE_B.eyeInner, 0.54, 0.40);

    put(FACE_A.lidUp, 0.43, 0.40 - eyeOpenR / 2);
    put(FACE_A.lidLo, 0.43, 0.40 + eyeOpenR / 2);
    put(FACE_B.lidUp, 0.57, 0.40 - eyeOpenL / 2);
    put(FACE_B.lidLo, 0.57, 0.40 + eyeOpenL / 2);

    put(FACE_A.brow, 0.43, 0.40 - eyeOpenR / 2 - browGapR);
    put(FACE_B.brow, 0.57, 0.40 - eyeOpenL / 2 - browGapL);

    put(FACE_A.mouth, 0.5 - widthR, 0.62 - liftR);
    put(FACE_B.mouth, 0.5 + widthL, 0.62 - liftL);

    put(LIP_UP, 0.5, 0.62 - mouthGap / 2);
    put(LIP_LO, 0.5, 0.62 + mouthGap / 2);

    // Turning the head slides the nose towards one eye. Positive yaw moves it
    // towards group B, which is the person's left.
    put(NOSE, 0.5 + yaw * 0.075, 0.52);
    return lm;
  }

  /* Where the nose has to sit for the engine's mirrored pointer to land on a
     given screen position. The engine flips x, so raw x = 1 - screen x. */
  function faceLookingAt(screenX, screenY, o) {
    var lm = face(o || {});
    lm[NOSE] = { x: 1 - screenX, y: screenY, z: 0 };
    return lm;
  }

  /* A hand at a given openness. `side` says whose hand it is: in an
     unmirrored image the person's left hand appears at the larger x. */
  function hand(o) {
    o = o || {};
    var open = num(o.open, 0);
    var side = o.side === 'left' ? 'left' : 'right';
    var cx = num(o.cx, side === 'left' ? 0.68 : 0.32);
    var cy = num(o.cy, 0.55);
    var spread = 0.45 + open * 1.15;

    var lm = [];
    for (var i = 0; i <= 20; i += 1) lm[i] = { x: cx, y: cy };
    lm[0] = { x: cx, y: cy + 0.16 };                 // wrist
    lm[9] = { x: cx, y: cy + 0.02 };                 // middle-finger base
    [8, 12, 16, 20].forEach(function (t, i) {
      lm[t] = { x: cx - 0.06 + i * 0.04, y: cy + 0.16 - 0.13 * spread };
    });
    return lm;
  }

  var POSE_WRIST = { left: 15, right: 16 };
  var POSE_SHOULDER = { left: 11, right: 12 };

  /* A seated upper body with the named wrist placed where asked. Screen
     coordinates again get flipped by the engine, so pass raw x. */
  function pose(o) {
    o = o || {};
    var side = o.side === 'right' ? 'right' : 'left';
    var lm = [];
    for (var i = 0; i <= 32; i += 1) lm[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };
    lm[POSE_SHOULDER.left] = { x: 0.62, y: 0.55, visibility: 0.95 };
    lm[POSE_SHOULDER.right] = { x: 0.38, y: 0.55, visibility: 0.95 };
    lm[POSE_WRIST.left] = { x: 0.66, y: 0.80, visibility: 0.95 };
    lm[POSE_WRIST.right] = { x: 0.34, y: 0.80, visibility: 0.95 };
    if (o.at) {
      lm[POSE_WRIST[side]] = { x: 1 - o.at.x, y: o.at.y, visibility: num(o.visibility, 0.95) };
    } else if (o.visibility != null) {
      lm[POSE_WRIST[side]].visibility = o.visibility;
    }
    return lm;
  }

  return {
    FACE_A: FACE_A, FACE_B: FACE_B, NOSE: NOSE, LIP_UP: LIP_UP, LIP_LO: LIP_LO,
    POSE_WRIST: POSE_WRIST, POSE_SHOULDER: POSE_SHOULDER,
    face: face, faceLookingAt: faceLookingAt, hand: hand, pose: pose,
  };
});

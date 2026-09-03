/* The measurement layer for the stroke rehab exercises.

   These run against synthetic landmarks rather than a webcam, because this is
   the code that decides whether somebody's repetition counted. Inventing
   repetitions a patient did not perform, or dropping ones they did, would
   corrupt the only record a clinician sees. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/rehab-metrics.js');

/* A neutral face, built to the landmark indices the metrics actually read.
   Coordinates are MediaPipe-style normalised 0..1, y increasing downwards. */
function face(opts = {}) {
  const o = {
    mouthGap: 0.01,        // distance between the inner lips
    mouthWidth: 0.12,      // corner to corner
    browGapL: 0.05, browGapR: 0.05,
    eyeOpenL: 0.02, eyeOpenR: 0.02,
    mouthLiftL: 0, mouthLiftR: 0,
    yaw: 0,                // shifts the nose towards one eye
    ...opts,
  };
  const lm = [];
  for (let i = 0; i <= 470; i += 1) lm[i] = { x: 0.5, y: 0.5, z: 0 };

  // Eyes: A on the image left (x smaller) = the person's RIGHT.
  lm[M.FACE_A.eyeOuter] = { x: 0.40, y: 0.40 };
  lm[M.FACE_B.eyeOuter] = { x: 0.60, y: 0.40 };
  lm[M.FACE_A.eyeInner] = { x: 0.46, y: 0.40 };
  lm[M.FACE_B.eyeInner] = { x: 0.54, y: 0.40 };

  lm[M.FACE_A.lidUp] = { x: 0.43, y: 0.40 - o.eyeOpenR / 2 };
  lm[M.FACE_A.lidLo] = { x: 0.43, y: 0.40 + o.eyeOpenR / 2 };
  lm[M.FACE_B.lidUp] = { x: 0.57, y: 0.40 - o.eyeOpenL / 2 };
  lm[M.FACE_B.lidLo] = { x: 0.57, y: 0.40 + o.eyeOpenL / 2 };

  lm[M.FACE_A.brow] = { x: 0.43, y: 0.40 - o.eyeOpenR / 2 - o.browGapR };
  lm[M.FACE_B.brow] = { x: 0.57, y: 0.40 - o.eyeOpenL / 2 - o.browGapL };

  lm[M.FACE_A.mouth] = { x: 0.5 - o.mouthWidth / 2, y: 0.62 - o.mouthLiftR };
  lm[M.FACE_B.mouth] = { x: 0.5 + o.mouthWidth / 2, y: 0.62 - o.mouthLiftL };

  lm[M.LIP_UP] = { x: 0.5, y: 0.62 - o.mouthGap / 2 };
  lm[M.LIP_LO] = { x: 0.5, y: 0.62 + o.mouthGap / 2 };
  lm[M.NOSE] = { x: 0.5 + o.yaw, y: 0.52 };
  return lm;
}

function hand({ spread = 1 } = {}) {
  // Wrist at 0, middle-finger base at 9 (the palm reference), tips at 8/12/16/20.
  const lm = [];
  for (let i = 0; i <= 20; i += 1) lm[i] = { x: 0.5, y: 0.5 };
  lm[0] = { x: 0.5, y: 0.9 };
  lm[9] = { x: 0.5, y: 0.75 };
  [8, 12, 16, 20].forEach((t, i) => {
    lm[t] = { x: 0.42 + i * 0.04, y: 0.9 - 0.15 * spread };
  });
  return lm;
}

test('mouth opening rises as the lips part and is scale-free', () => {
  const shut = M.METRICS.mouthOpen(face({ mouthGap: 0.005 })).v;
  const open = M.METRICS.mouthOpen(face({ mouthGap: 0.09 })).v;
  assert.ok(open > shut * 3, 'opening the mouth must move the number a lot');

  // Sitting closer to the camera scales every landmark; the reading must not
  // drift just because the person leaned in.
  const near = face({ mouthGap: 0.09 });
  const scaled = near.map((p) => ({ x: 0.5 + (p.x - 0.5) * 2, y: 0.5 + (p.y - 0.5) * 2 }));
  const a = M.METRICS.mouthOpen(near).v;
  const b = M.METRICS.mouthOpen(scaled).v;
  assert.ok(Math.abs(a - b) < 1e-9, `distance from camera changed the reading: ${a} vs ${b}`);
});

test('eye closure counts up as the eye shuts', () => {
  const open = M.METRICS.eyeClose(face({ eyeOpenL: 0.03, eyeOpenR: 0.03 })).v;
  const shut = M.METRICS.eyeClose(face({ eyeOpenL: 0.002, eyeOpenR: 0.002 })).v;
  assert.ok(shut > open, 'a closing eye has to read as more movement, not less');
});

test('pursing the lips counts up even though the mouth narrows', () => {
  const rest = M.METRICS.pucker(face({ mouthWidth: 0.13 })).v;
  const pursed = M.METRICS.pucker(face({ mouthWidth: 0.06 })).v;
  assert.ok(pursed > rest, 'a narrower mouth is more pucker, so it must read higher');
});

test('brow raise rises with the gap between brow and eyelid', () => {
  const rest = M.METRICS.browRaise(face()).v;
  const up = M.METRICS.browRaise(face({ browGapL: 0.11, browGapR: 0.11 })).v;
  assert.ok(up > rest);
});

test('a smile reads bigger when the corners move out and up', () => {
  const rest = M.METRICS.smile(face()).v;
  const smiling = M.METRICS.smile(face({ mouthWidth: 0.2, mouthLiftL: 0.03, mouthLiftR: 0.03 })).v;
  assert.ok(smiling > rest);
});

test('head yaw is signed and centred at zero', () => {
  assert.ok(Math.abs(M.METRICS.headYaw(face({ yaw: 0 })).v) < 1e-9);
  const oneWay = M.METRICS.headYaw(face({ yaw: 0.06 })).v;
  const other = M.METRICS.headYaw(face({ yaw: -0.06 })).v;
  assert.ok(oneWay * other < 0, 'turning the other way must flip the sign');
});

test('the two sides of the face are told apart correctly', () => {
  // Group A sits on the image left, and the image is not mirrored, so it is
  // the person's own RIGHT. Getting this backwards would report a weak left
  // side as a weak right side.
  const sides = M.resolveSides(face());
  assert.equal(sides.right, M.FACE_A);
  assert.equal(sides.left, M.FACE_B);

  // Only the person's left corner lifts; the metric must attribute it to left.
  const lopsided = M.METRICS.smile(face({ mouthLiftL: 0.05 }));
  assert.ok(lopsided.l > lopsided.r, 'the lifted side should be reported as the left');
});

test('degenerate frames do not produce NaN or Infinity', () => {
  const flat = [];
  for (let i = 0; i <= 470; i += 1) flat[i] = { x: 0.5, y: 0.5 };
  Object.keys(M.METRICS).forEach((k) => {
    const out = M.METRICS[k](flat);
    assert.ok(Number.isFinite(out.v), `${k} returned ${out.v} on a collapsed face`);
  });
});

test('hand openness rises as the fingers extend', () => {
  assert.ok(M.handOpenness(hand({ spread: 1.6 })) > M.handOpenness(hand({ spread: 0.3 })));
  const collapsed = [];
  for (let i = 0; i <= 20; i += 1) collapsed[i] = { x: 0.5, y: 0.5 };
  assert.equal(M.handOpenness(collapsed), 0, 'a zero-size palm must not divide by zero');
});

test('a low-visibility wrist is reported as missing rather than guessed', () => {
  const pose = [];
  for (let i = 0; i <= 32; i += 1) pose[i] = { x: 0.5, y: 0.5, visibility: 0.9 };
  assert.ok(M.poseWrist(pose, 'left'));
  pose[M.POSE_WRIST.left].visibility = 0.1;
  assert.equal(M.poseWrist(pose, 'left'), null, 'an unseen wrist must not be treated as a real position');
});

test('normalisation maps onto the person’s own range', () => {
  // Someone with a tiny range still gets a full 0..1 scale.
  assert.equal(M.normalise(0.10, 0.10, 0.14), 0);
  assert.equal(M.normalise(0.14, 0.10, 0.14), 1);
  assert.ok(Math.abs(M.normalise(0.12, 0.10, 0.14) - 0.5) < 1e-9);

  // Beating the calibrated best is allowed to read above 100%.
  assert.ok(M.normalise(0.16, 0.10, 0.14) > 1);

  // A negated metric (eye closure) still normalises the right way up.
  assert.ok(M.normalise(-0.05, -0.30, -0.02) > 0.8);

  // No calibration range at all must not produce Infinity or NaN.
  assert.equal(M.normalise(0.5, 0.2, 0.2), 0);
});

test('evenness is measured from each side’s own resting position', () => {
  // A face that is asymmetric at rest but moves equally is even, not lopsided.
  assert.ok(Math.abs(M.symmetry(0.30, 0.20, 0.20, 0.10) - 1) < 1e-9);
  // Moving on one side only is not.
  assert.equal(M.symmetry(0.30, 0.10, 0.10, 0.10), 0);
  // Half as much on one side reads as a half score.
  assert.ok(Math.abs(M.symmetry(0.30, 0.20, 0.10, 0.10) - 0.5) < 1e-9);
  assert.equal(M.symmetry(null, 0.2, 0, 0), null);
  assert.equal(M.symmetry(0.1, 0.1, 0.1, 0.1), null, 'no movement at all cannot be scored');
});

test('repetitions need a full out-and-back movement', () => {
  const c = new M.RepCounter({ target: 0.6, release: 0.25 });
  [0, 0.3, 0.7].forEach((n) => c.update(n, 0));
  assert.equal(c.reps, 1, 'crossing the target counts one');

  // Staying up does not add more.
  [0.8, 0.9, 0.75].forEach((n) => c.update(n, 0));
  assert.equal(c.reps, 1, 'holding above the target is still one repetition');

  // Coming back down and going again counts a second.
  [0.1, 0.7].forEach((n) => c.update(n, 0));
  assert.equal(c.reps, 2);
});

test('a tremor on the threshold does not manufacture repetitions', () => {
  // A weak movement wobbling either side of the target is exactly what
  // weakness looks like, and it must not be counted over and over.
  const c = new M.RepCounter({ target: 0.6, release: 0.25 });
  for (let i = 0; i < 60; i += 1) c.update(i % 2 ? 0.62 : 0.58, i * 16);
  assert.equal(c.reps, 1, `tremor produced ${c.reps} repetitions`);
});

test('repetitions record the peak reached, not the threshold', () => {
  const c = new M.RepCounter({ target: 0.6, release: 0.25 });
  [0, 0.4, 0.95, 0.7].forEach((n) => c.update(n, 0));
  assert.equal(c.reps, 1);
  assert.ok(c.amplitudes[0] >= 0.6);
});

test('a hold has to last the full time', () => {
  const c = new M.RepCounter({ target: 0.6, release: 0.25, holdMs: 3000 });
  c.update(0.8, 0);
  c.update(0.8, 1500);
  assert.equal(c.reps, 0, 'half the hold is not a repetition');

  c.update(0.8, 3100);
  assert.equal(c.reps, 1, 'the full hold counts');
  assert.ok(c.longestHold >= 3000);
});

test('letting go early keeps the partial hold and does not punish', () => {
  const c = new M.RepCounter({ target: 0.6, release: 0.25, holdMs: 3000 });
  c.update(0.8, 0);
  c.update(0.8, 1800);
  const ev = c.update(0.1, 1900);
  assert.equal(c.reps, 0);
  assert.equal(ev.released, true);
  assert.ok(c.longestHold >= 1800, 'the effort that was made should still be recorded');

  // And the person can immediately try again.
  c.update(0.8, 2000);
  c.update(0.8, 5200);
  assert.equal(c.reps, 1);
});

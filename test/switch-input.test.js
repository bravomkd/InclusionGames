/* One switch, pressed with a mouth, a hand, an eyebrow or a head tilt.

   This is the layer that decides whether somebody jumped. Firing late costs
   a child the turn; firing when they did not move costs them a life they
   never spent. Both are worth more than a passing test, so the readings are
   checked against bodies built here rather than by the module under test.

   The landmark numbers below are MediaPipe's, written out again on purpose:
   if the module ever points "lip" at an eyelid, a test that borrowed its
   constants would agree with it. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/switch-input.js');

// MediaPipe Face Mesh, from its own documentation.
const EYE_L = 33, EYE_R = 263;     // outer corners
const LID_L = 159, LID_R = 386;    // upper lids
const BROW_L = 105, BROW_R = 334;
const LIP_UP = 13, LIP_LOW = 14;
// MediaPipe Hands.
const WRIST = 0, PALM = 9, TIPS = [8, 12, 16, 20];

/* A face. Every distance is expressed as a fraction of the gap between the
   eyes, which is what the module normalises by, so `scale` moves the person
   towards or away from the camera without changing the shape of their face. */
function face(o = {}) {
  const {
    mouth = 0.01,     // lip gap
    brow = 0.05,      // brow to lid
    eyeGap = 0.20,    // outer corner to outer corner
    tilt = 0,         // radians
    scale = 1,
    cx = 0.5, cy = 0.5,
  } = o;

  const lm = [];
  for (let i = 0; i <= 470; i += 1) lm[i] = { x: cx, y: cy, z: 0 };

  const put = (i, dx, dy) => {
    // rotate about the face centre so a tilt moves everything together
    const rx = dx * Math.cos(tilt) - dy * Math.sin(tilt);
    const ry = dx * Math.sin(tilt) + dy * Math.cos(tilt);
    lm[i] = { x: cx + rx * scale, y: cy + ry * scale, z: 0 };
  };

  const half = eyeGap / 2;
  put(EYE_L, -half, -0.08);
  put(EYE_R, half, -0.08);
  put(LID_L, -half * 0.7, -0.08);
  put(LID_R, half * 0.7, -0.08);
  put(BROW_L, -half * 0.7, -0.08 - brow);
  put(BROW_R, half * 0.7, -0.08 - brow);
  put(LIP_UP, 0, 0.10 - mouth / 2);
  put(LIP_LOW, 0, 0.10 + mouth / 2);
  return lm;
}

/* A hand. `height` is where it is on screen (0 top, 1 bottom) and `spread`
   is how far the fingers are from the wrist relative to the palm. */
function hand({ height = 0.7, spread = 1 } = {}) {
  const lm = [];
  for (let i = 0; i <= 20; i += 1) lm[i] = { x: 0.5, y: height };
  lm[WRIST] = { x: 0.5, y: height + 0.12 };
  lm[PALM] = { x: 0.5, y: height };
  TIPS.forEach((t, i) => { lm[t] = { x: 0.44 + i * 0.04, y: height + 0.12 - 0.14 * spread }; });
  return lm;
}

const faceFrame = (o) => ({ multiFaceLandmarks: [face(o)] });
const handFrame = (...hands) => ({ multiHandLandmarks: hands });

// ── the readings ────────────────────────────────────────────

test('opening your mouth reads higher, and leaning in does not', () => {
  const shut = S.read('mouthOpen', faceFrame({ mouth: 0.005 }));
  const open = S.read('mouthOpen', faceFrame({ mouth: 0.09 }));
  assert.ok(open > shut * 3, `opening the mouth barely moved the reading: ${shut} → ${open}`);

  // Same face, closer to the camera. A child who leans in has not pressed.
  const near = S.read('mouthOpen', faceFrame({ mouth: 0.09, scale: 2 }));
  assert.ok(Math.abs(near - open) < 1e-9, `distance changed the reading: ${open} vs ${near}`);
});

test('lifting your eyebrows reads higher, and leaning in does not', () => {
  const rest = S.read('browRaise', faceFrame({ brow: 0.04 }));
  const up = S.read('browRaise', faceFrame({ brow: 0.10 }));
  assert.ok(up > rest);
  const near = S.read('browRaise', faceFrame({ brow: 0.10, scale: 1.8 }));
  assert.ok(Math.abs(near - up) < 1e-9, 'distance from the camera changed the reading');
});

test('tilting your head reads higher, whichever way you tilt it', () => {
  const level = S.read('headTilt', faceFrame({ tilt: 0 }));
  const left = S.read('headTilt', faceFrame({ tilt: 0.35 }));
  const right = S.read('headTilt', faceFrame({ tilt: -0.35 }));
  assert.ok(left > level && right > level);
  // Someone who can only tilt one way must not be locked out of the game.
  assert.ok(Math.abs(left - right) < 1e-9, 'one direction reads differently from the other');
});

test('raising a hand reads higher as it goes up', () => {
  const low = S.read('handRaise', handFrame(hand({ height: 0.8 })));
  const high = S.read('handRaise', handFrame(hand({ height: 0.3 })));
  assert.ok(high > low, `raising the hand should read higher: ${low} → ${high}`);
});

test('opening a hand reads higher as the fingers spread', () => {
  const fist = S.read('handOpen', handFrame(hand({ spread: 0.2 })));
  const open = S.read('handOpen', handFrame(hand({ spread: 1.6 })));
  assert.ok(open > fist);
});

test('with two hands in shot the higher one is used', () => {
  // A player resting one hand in their lap and raising the other has pressed.
  const resting = hand({ height: 0.85 });
  const raised = hand({ height: 0.25 });
  const either = S.read('handRaise', handFrame(resting, raised));
  const alone = S.read('handRaise', handFrame(raised));
  assert.equal(either, alone, 'the raised hand should be the one that counts');
});

test('nothing in shot reads as nothing, not as zero', () => {
  // Zero is a real reading. "No face" has to be distinguishable from it, or
  // a player who walks away presses the switch.
  assert.equal(S.read('mouthOpen', { multiFaceLandmarks: [] }), null);
  assert.equal(S.read('mouthOpen', {}), null);
  assert.equal(S.read('handRaise', { multiHandLandmarks: [] }), null);
  assert.equal(S.read('handRaise', null), null);
  assert.equal(S.read('nonsense', faceFrame()), null);
  assert.equal(S.read('key', faceFrame()), null, 'the key source is not read from the camera');
});

test('a collapsed frame does not produce NaN', () => {
  const flat = [];
  for (let i = 0; i <= 470; i += 1) flat[i] = { x: 0.5, y: 0.5 };
  S.cameraSources().filter((id) => S.SOURCES[id].tracker === 'face').forEach((id) => {
    const v = S.read(id, { multiFaceLandmarks: [flat] });
    assert.ok(v === null || Number.isFinite(v), `${id} returned ${v}`);
  });
});

// ── calibration ─────────────────────────────────────────────

test('the press point sits inside the range the person actually showed', () => {
  const c = new S.Calibrator();
  [0.10, 0.11, 0.10, 0.09, 0.10].forEach((v) => c.restSample(v));
  [0.40, 0.44, 0.38].forEach((v) => c.effortSample(v));
  const cal = c.finish();

  assert.ok(Math.abs(cal.base - 0.10) < 1e-9, 'rest should be the middle of the resting samples');
  assert.equal(cal.peak, 0.44, 'the best effort is what they can do, not their average');
  assert.ok(cal.press > cal.base && cal.press < cal.peak, 'press point must be reachable and not accidental');
  assert.ok(cal.release < cal.press && cal.release >= cal.base, 'release must sit below press and at or above rest');
  assert.equal(cal.weak, false);
});

test('one twitch while resting does not move the rest point', () => {
  const c = new S.Calibrator();
  [0.10, 0.10, 0.42, 0.10, 0.10].forEach((v) => c.restSample(v));   // one sneeze
  [0.40].forEach((v) => c.effortSample(v));
  assert.ok(Math.abs(c.finish().base - 0.10) < 1e-9, 'a single outlier moved the resting point');
});

test('a range too small to tell from jitter is flagged, not used quietly', () => {
  const c = new S.Calibrator();
  [0.100, 0.101, 0.100].forEach((v) => c.restSample(v));
  [0.103].forEach((v) => c.effortSample(v));             // 0.003 of range
  const cal = c.finish();
  assert.equal(cal.weak, true, 'a switch built on this would fire on its own');
});

test('a small but real range still gives a usable switch', () => {
  // Someone whose mouth opens a little is still playing the game.
  const c = new S.Calibrator();
  [0.100, 0.100, 0.100].forEach((v) => c.restSample(v));
  [0.130].forEach((v) => c.effortSample(v));
  const cal = c.finish();
  assert.equal(cal.weak, false);

  const sw = new S.Switch(cal);
  assert.equal(sw.update(0.100, 0).pressed, false);
  sw.update(0.128, 16);
  assert.equal(sw.update(0.128, 32).pressed, true, 'their own best effort must press the switch');
});

test('a meter shows the movement as a share of their own range', () => {
  const cal = new S.Calibrator();
  [0.1, 0.1].forEach((v) => cal.restSample(v));
  cal.effortSample(0.5);
  const c = cal.finish();
  assert.equal(S.normalise(0.1, c), 0);
  assert.equal(S.normalise(0.5, c), 1);
  assert.ok(Math.abs(S.normalise(0.3, c) - 0.5) < 1e-9);
  assert.ok(S.normalise(0.6, c) > 1, 'beating your own best is worth showing');
  assert.equal(S.normalise(null, c), 0);
});

// ── the switch ──────────────────────────────────────────────

function calFor({ base = 0.1, peak = 0.5 } = {}) {
  const c = new S.Calibrator();
  c.restSample(base);
  c.effortSample(peak);
  return c.finish();
}

test('the switch fires on the way up, not at the end of the movement', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);
  let firedAt = null;
  // A movement rising smoothly from rest to full effort over 10 frames.
  for (let i = 0; i <= 10; i += 1) {
    const v = cal.base + (cal.peak - cal.base) * (i / 10);
    if (sw.update(v, i * 33).pressed) { firedAt = v; break; }
  }
  assert.ok(firedAt !== null, 'the switch never fired');
  assert.ok(firedAt < cal.peak * 0.85,
    `fired at ${firedAt}, near the top of the movement — that is a late jump`);
});

test('holding the press does not fire it again', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);
  for (let i = 0; i < 60; i += 1) sw.update(0.5, i * 33);
  assert.equal(sw.presses, 1, `holding produced ${sw.presses} presses`);
});

test('a shaky movement on the press point counts once — not never, not endlessly', () => {
  /* A signal wobbling either side of the press point is what a weak or
     tremulous movement looks like, and it can fail in both directions.
     Counting it repeatedly spends lives the player never lost. Refusing it
     because the frames are not consecutive locks out the player least able to
     hold a position — which is most of the point of this file. */
  const cal = calFor();
  const sw = new S.Switch(cal);
  const press = cal.press;
  for (let i = 0; i < 120; i += 1) sw.update(press + (i % 2 ? 0.004 : -0.004), i * 33);
  assert.notEqual(sw.presses, 0, 'a shaky player could not press the switch at all');
  assert.equal(sw.presses, 1, `a shaky movement produced ${sw.presses} presses`);
});

test('pressing again needs letting go first', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);
  sw.update(0.5, 0); sw.update(0.5, 33);
  assert.equal(sw.presses, 1);

  // Part-way back, but not back to rest: still the same press.
  sw.update(cal.press - 0.01, 400); sw.update(0.5, 450); sw.update(0.5, 480);
  assert.equal(sw.presses, 1, 'a dip that never reached the release point started a new press');

  // All the way back, then again.
  sw.update(cal.base, 600);
  sw.update(0.5, 700); sw.update(0.5, 733);
  assert.equal(sw.presses, 2);
});

test('two presses cannot land closer together than the minimum gap', () => {
  const cal = calFor();
  const sw = new S.Switch(cal, { minGapMs: 300 });
  sw.update(0.5, 0); sw.update(0.5, 16);
  assert.equal(sw.presses, 1);
  sw.update(cal.base, 30);                       // released almost at once
  sw.update(0.5, 50); sw.update(0.5, 66);
  assert.equal(sw.presses, 1, 'a second press landed inside the minimum gap');
  sw.update(cal.base, 320);
  sw.update(0.5, 400); sw.update(0.5, 433);
  assert.equal(sw.presses, 2);
});

test('a single jumpy frame does not cost a turn', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);
  sw.update(cal.base, 0);
  sw.update(0.9, 33);            // one bad landmark
  sw.update(cal.base, 66);
  assert.equal(sw.presses, 0, 'one stray frame fired the switch');
});

test('losing the player disarms the switch', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);

  // Mouth already open as they walk back into shot: that is not a press.
  sw.update(null, 0);
  sw.update(0.5, 33);
  sw.update(0.5, 66);
  assert.equal(sw.presses, 0, 'reappearing mid-movement fired a press nobody made');

  // Back to rest, and now it works again.
  sw.update(cal.base, 100);
  sw.update(0.5, 133); sw.update(0.5, 166);
  assert.equal(sw.presses, 1);
});

test('while nothing is visible the switch reports not pressed', () => {
  const cal = calFor();
  const sw = new S.Switch(cal);
  sw.update(0.5, 0); sw.update(0.5, 33);
  const out = sw.update(null, 66);
  assert.equal(out.pressed, false);
  assert.equal(out.down, false, 'a player who has left the frame is not holding anything down');
});

// ── the catalogue of sources ────────────────────────────────

test('every way of pressing is offered in every language the site has', () => {
  const langs = ['en', 'de', 'pl', 'es'];
  S.sourceIds().forEach((id) => {
    const src = S.SOURCES[id];
    assert.ok(['face', 'hands', 'none'].includes(src.tracker), `${id} has an unknown tracker`);
    langs.forEach((l) => {
      assert.ok(src.label[l] && src.label[l].trim(), `${id} has no ${l} label`);
      assert.ok(src.cue[l] && src.cue[l].trim(), `${id} has no ${l} cue`);
    });
  });
});

test('there is always a way to play without a camera', () => {
  // A broken camera, a refused permission, a dark room. None of those should
  // end the game.
  assert.ok(S.sourceIds().includes('key'));
  assert.equal(S.SOURCES.key.tracker, 'none');
  assert.ok(!S.cameraSources().includes('key'));
  assert.ok(S.cameraSources().length >= 4, 'there should be several camera options to choose between');
});

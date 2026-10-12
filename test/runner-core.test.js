/* Animal Run — the simulation.

   The point of these tests is that this game can be made unplayable by
   arithmetic, silently. A rock 20cm too close to the last one, or a
   jump 10cm too low, produces a game that looks completely normal,
   runs at a smooth 60fps, and cannot be finished by anyone. You cannot
   see that by playing it either, because when you fail you assume you
   were too slow.

   So the central test is a player. It works out, from the jump
   kinematics alone, when each obstacle has to be jumped, plays whole
   rounds in every mode at every setting, and insists on taking no
   damage at all. If the generator can produce a situation that a
   perfectly-timed press cannot survive, that player finds it.

   It derives its own physics on purpose: it reads the configuration
   numbers out of the engine but does the kinematics itself, so a sign
   error in the engine's solver cannot cancel out against the same sign
   error in the check. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../assets/runner-core.js');

const G = 9.81;

/* ── Kinematics, worked out here and nowhere else ──────────── */

// Feet reach height y on the way up at this time, on the way down at
// the other. Null when the jump never gets there.
function upAt(v0, y) {
  const disc = v0 * v0 - 2 * G * y;
  if (!(disc > 0)) return null;
  return (v0 - Math.sqrt(disc)) / G;
}
function downAt(v0, y) {
  const disc = v0 * v0 - 2 * G * y;
  if (!(disc > 0)) return null;
  return (v0 + Math.sqrt(disc)) / G;
}

/* When must a jump start, for the player to be dealing with this thing
   correctly? Returns the window of valid start times relative to now,
   or null if there is no such window — which is the interesting answer. */
function jumpWindow(cfg, obj) {
  const span = (cfg.playerW + cfg.objW) / 2;
  const tEnter = (obj.x - span) / cfg.speed;
  const tExit = (obj.x + span) / cfg.speed;

  if (obj.lane === 'low') {
    // Must be above it for the whole time it is passing through us.
    const a = upAt(cfg.jumpV0, cfg.objH);
    const b = downAt(cfg.jumpV0, cfg.objH);
    if (a == null) return null;
    const lo = tExit - b;
    const hi = tEnter - a;
    return hi >= lo ? { lo, hi } : null;
  }

  // Overhead: the boxes only have to touch for an instant. The feet
  // have to be inside [highY0 - playerH, highY1] — above the band's
  // bottom edge, and not past its top, which a big jump does go past.
  const lo0 = Math.max(0, cfg.highY0 - cfg.playerH);
  const hi0 = cfg.highY1;
  const inLo = upAt(cfg.jumpV0, lo0);
  if (inLo == null) return null;
  const topUp = upAt(cfg.jumpV0, hi0);
  const inHi = topUp == null ? downAt(cfg.jumpV0, lo0) : topUp;

  // Overlap if [t+inLo, t+inHi] meets [tEnter, tExit].
  const lo = tEnter - inHi;
  const hi = tExit - inLo;
  return hi >= lo ? { lo, hi } : null;
}

/* A player that presses at the best moment it can and never guesses.
   Returns the final state plus anything it could not physically do. */
function play(game, opts) {
  opts = opts || {};
  const dt = opts.dt || 1 / 60;
  const maxFrames = opts.maxFrames || 60 * 400;
  const cfg = game.cfg;
  const impossible = [];
  const serviced = Object.create(null);
  let frames = 0;
  let st = game.state();

  while (!st.over && frames < maxFrames) {
    frames += 1;
    let press = false;

    // The nearest thing ahead that wants a jump and has not had one.
    const ahead = game.view()
      .filter(o => o.needJump && !serviced[o.n] && o.x > -0.5)
      .sort((a, b) => a.x - b.x);

    if (ahead.length) {
      const o = ahead[0];
      const w = jumpWindow(cfg, o);
      if (!w) {
        impossible.push({ n: o.n, lane: o.lane, label: o.label, why: 'no valid jump exists' });
        serviced[o.n] = true;
      } else {
        // Aim for the middle of the window, which is what a player who
        // has learned the game would do.
        const aim = (w.lo + w.hi) / 2;
        if (aim <= 0) {
          if (w.hi <= 0) {
            // The moment has gone by without us being able to act.
            impossible.push({
              n: o.n, lane: o.lane, label: o.label,
              why: 'window closed before the jump was available',
            });
            serviced[o.n] = true;
          } else if (st.canJump) {
            press = true;
            serviced[o.n] = true;
          }
        } else if (aim <= dt && st.canJump) {
          press = true;
          serviced[o.n] = true;
        }
      }
    }

    st = game.step(dt, press);
  }
  return { st, frames, impossible, ranOut: frames >= maxFrames };
}

const PLAYABLE = ['gentle', 'standard', 'challenge'];

/* ── The numbers ───────────────────────────────────────────── */

test('the physics solver and its inverse agree', () => {
  for (const y of [0, 0.1, 0.3, 0.62, 1.0]) {
    for (const ta of [0.2, 0.5, 0.9, 1.4]) {
      const v0 = R.solveJumpSpeed(y, ta);
      assert.ok(Math.abs(R.timeAbove(v0, y) - ta) < 1e-9,
        `asked for ${ta}s above ${y}m, got ${R.timeAbove(v0, y)}s`);
    }
  }
});

test('a jump that cannot reach a height spends no time above it', () => {
  // 1 m/s reaches 5cm. Asking about 2m must not come back with a number.
  assert.equal(R.timeAbove(1, 2), 0);
  assert.equal(R.timeAbove(0, 0.1), 0);
});

test('the original Unity timing is beyond reach of a camera, which is why this port exists', () => {
  const c = R.resolve({ preset: 'original' });
  // The numbers out of the Unity scene, unchanged.
  assert.equal(c.jumpV0, 3.5);
  assert.equal(c.speed, 1.5);
  assert.equal(c.cooldownS, 0.9);
  assert.ok(Math.abs(c.airtimeS - 0.7135) < 0.001, `airtime ${c.airtimeS}`);
  assert.ok(Math.abs(c.jumpHeightM - 0.6244) < 0.001, `height ${c.jumpHeightM}`);

  // And the thing that actually matters: how late may the press be?
  assert.ok(c.windowS < 0.15,
    `the original left ${Math.round(c.windowS * 1000)}ms of slack; if this ever `
    + 'reads comfortably, the comparison in the module header is wrong');
});

test('every playable setting gives several times that slack', () => {
  const orig = R.resolve({ preset: 'original' }).windowS;
  for (const preset of PLAYABLE) {
    const c = R.resolve({ preset });
    assert.ok(c.windowS > orig * 2.5,
      `${preset} gives ${Math.round(c.windowS * 1000)}ms, barely better than the original`);
    // 200ms covers a slow detection plus a slow hand.
    assert.ok(c.windowS >= 0.2,
      `${preset} gives ${Math.round(c.windowS * 1000)}ms, inside camera latency`);
  }
});

test('the window asked for is the window delivered', () => {
  for (const preset of PLAYABLE) {
    const want = R.PRESETS[preset].windowS;
    const got = R.resolve({ preset }).windowS;
    assert.ok(Math.abs(got - want) < 1e-6,
      `${preset}: asked ${want}s, got ${got}s`);
  }
});

test('gentler settings are gentler — slowing down must not backfire', () => {
  // The trap: a slower world leaves you inside an obstacle for longer,
  // so speed alone makes this game harder. If the presets ever stop
  // scaling the jump with the speed, this is where it shows.
  const g = R.resolve({ preset: 'gentle' });
  const s = R.resolve({ preset: 'standard' });
  const ch = R.resolve({ preset: 'challenge' });
  assert.ok(g.speed < s.speed && s.speed < ch.speed, 'speeds should order');
  assert.ok(g.windowS > s.windowS, `gentle ${g.windowS} should beat standard ${s.windowS}`);
  assert.ok(s.windowS > ch.windowS, `standard ${s.windowS} should beat challenge ${ch.windowS}`);
});

test('a slower speed on its own really does make it harder', () => {
  // Proves the comment above is about something real, not a worry.
  const fast = R.resolve({ speed: 1.5, jumpV0: 3.5 });
  const slow = R.resolve({ speed: 0.7, jumpV0: 3.5 });
  assert.ok(slow.windowS < fast.windowS,
    'halving the speed with the same jump should shrink the margin, '
    + `got ${slow.windowS} vs ${fast.windowS}`);
});

test('a configuration never claims a jump it cannot perform', () => {
  const c = R.resolve({ preset: 'gentle' });
  assert.ok(c.jumpHeightM > c.objH, 'must be able to get over an obstacle at all');
  assert.ok(c.cooldownS >= c.airtimeS, 'a second jump must not be possible in mid-air');
  assert.ok(c.reachY < c.jumpHeightM, 'the overhead lane must be reachable');
});

/* ── Spacing ───────────────────────────────────────────────── */

test('obstacles are never spaced closer than a jump and its recovery', () => {
  for (const preset of PLAYABLE) {
    const c = R.resolve({ preset, seed: 7 });
    const sp = new R.Spawner(c);
    let prev = null;
    for (let i = 0; i < 400; i += 1) {
      const s = sp.next(false);
      if (prev != null) {
        assert.ok(s.x - prev >= c.minGapM - 1e-9,
          `${preset}: gap ${(s.x - prev).toFixed(3)}m under the ${c.minGapM.toFixed(3)}m minimum`);
      }
      prev = s.x;
    }
    // And the minimum has to mean something.
    assert.ok(c.minGapM / c.speed >= c.airtimeS + c.cooldownS,
      `${preset}: the minimum gap does not even cover one jump plus its cooldown`);
  }
});

test('the first obstacle is far enough away to be seen coming', () => {
  for (const preset of PLAYABLE) {
    const c = R.resolve({ preset });
    const sp = new R.Spawner(c);
    const first = sp.next(false);
    assert.ok(first.x >= c.viewAheadM,
      `${preset}: the first obstacle starts at ${first.x}m, inside the ${c.viewAheadM}m view`);
  }
});

/* ── The player ────────────────────────────────────────────── */

test('a well-timed player finishes every mode at every setting without a scratch', () => {
  const failures = [];
  for (const preset of PLAYABLE) {
    for (const mode of ['classic', 'letters']) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const game = new R.Game({
          preset, mode, seed, goal: 8,
          sequence: mode === 'letters' ? R.letterSequence() : null,
        });
        const out = play(game);
        if (out.impossible.length || out.st.hits > 0 || out.st.reason !== 'won' || out.ranOut) {
          failures.push({
            preset, mode, seed,
            hits: out.st.hits, reason: out.st.reason, ranOut: out.ranOut,
            impossible: out.impossible.slice(0, 3),
          });
        }
      }
    }
  }
  assert.deepEqual(failures, [],
    'a perfectly-timed player took damage or could not finish:\n'
    + JSON.stringify(failures.slice(0, 6), null, 2));
});

test('and still manages it at 30fps, which is what a webcam gives', () => {
  const failures = [];
  for (const mode of ['classic', 'letters']) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const game = new R.Game({ preset: 'standard', mode, seed, goal: 6 });
      const out = play(game, { dt: 1 / 30 });
      if (out.st.hits > 0 || out.st.reason !== 'won') {
        failures.push({ mode, seed, hits: out.st.hits, reason: out.st.reason });
      }
    }
  }
  assert.deepEqual(failures, [], JSON.stringify(failures));
});

test('a player who never presses loses, rather than drifting forever', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 3, goal: 30 });
  let st = game.state();
  for (let i = 0; i < 60 * 300 && !st.over; i += 1) st = game.step(1 / 60, false);
  assert.equal(st.over, true, 'doing nothing should eventually end the round');
  assert.equal(st.reason, 'dead');
  assert.equal(st.hits, 4, 'four mistakes, as in the original');
});

/* ── Health, faithful to the original ──────────────────────── */

test('four mistakes end it and three do not', () => {
  const c = R.resolve({});
  let hp = c.hp;
  for (let i = 0; i < 3; i += 1) hp -= c.hpLoss;
  assert.ok(hp > c.deadAt, 'three mistakes should leave the player alive');
  hp -= c.hpLoss;
  assert.ok(hp <= c.deadAt + 1e-9, 'the fourth should not');
});

test('one obstacle costs one life however long it is touched', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 5 });
  let st = game.state();
  for (let i = 0; i < 60 * 60 && st.hits < 1; i += 1) st = game.step(1 / 60, false);
  assert.equal(st.hits, 1, 'should have taken exactly one hit by now');
  const t = st.t;
  // Keep running through the same object for a while.
  for (let i = 0; i < 20; i += 1) st = game.step(1 / 60, false);
  assert.equal(st.hits, 1, `a single obstacle charged ${st.hits} hits after ${st.t - t}s`);
});

/* A letter on the ground is collected just by running into it, and a
   letter overhead needs a jump. So to study what happens when letters
   are MISSED, put them all overhead: then a player who does nothing
   takes no damage and collects nothing, which is the situation these
   next three tests are about. */
const OVERHEAD = { preset: 'standard', mode: 'letters', highBias: 1 };

test('missing something good costs nothing but the point', () => {
  const game = new R.Game(Object.assign({ seed: 11, goal: 5 }, OVERHEAD));
  let st = game.state();
  for (let i = 0; i < 60 * 120 && st.missed < 2; i += 1) st = game.step(1 / 60, false);
  assert.ok(st.missed >= 2, `only let ${st.missed} letters go by`);
  assert.equal(st.hits, 0, 'letting a letter pass must not cost health');
  assert.equal(st.score, 0, 'but it must not score either');
});

/* ── The deadlock the original shipped with ────────────────── */

test('a missed letter comes round again — the original could not be finished after one', () => {
  /* In the Unity version the next correct letter was only offered once
     the previous one had been collected. A letter that scrolled past
     uncollected left that flag down permanently: the correct letter
     never spawned again and the round was unwinnable, for anybody,
     with no indication why. */
  const game = new R.Game(Object.assign({ seed: 4, goal: 3 }, OVERHEAD));
  let st = game.state();

  // Deliberately let a good number of them go by.
  for (let i = 0; i < 60 * 200 && st.missed < 6 && !st.over; i += 1) {
    st = game.step(1 / 60, false);
  }
  assert.ok(st.missed >= 6, `only missed ${st.missed} letters; test did not reach its premise`);
  assert.equal(st.idx, 0, 'nothing should have been collected yet');
  assert.equal(st.next, 'A', 'still waiting on the first letter');

  // Now play properly. If the deadlock had been ported, 'A' would
  // never appear again and this could not finish.
  const out = play(game, { maxFrames: 60 * 400 });
  assert.equal(out.st.reason, 'won',
    `after missing letters the round ended as "${out.st.reason}" — the correct `
    + 'letter stopped being offered');
});

test('the letter being asked for keeps appearing, round after round', () => {
  const game = new R.Game(Object.assign({ seed: 21, goal: 4 }, OVERHEAD));
  const seen = [];
  let st = game.state();
  for (let i = 0; i < 60 * 240 && !st.over; i += 1) {
    st = game.step(1 / 60, false);
    for (const o of game.view()) {
      if (o.wanted && seen.indexOf(o.n) < 0) seen.push(o.n);
    }
  }
  assert.ok(seen.length >= 8,
    `only ${seen.length} chances at the correct letter in four minutes of standing still`);
});

/* ── Fairness of the letter shown ──────────────────────────── */

test('a thing showing the correct letter always counts as correct', () => {
  /* The case that made me rewrite this: a decoy spawns showing "E",
     the player then collects "D", and now "E" is the letter being
     asked for. If the engine went by the role it was spawned as, the
     child would be marked wrong for catching exactly what the game is
     asking them to catch. */
  for (let seed = 1; seed <= 30; seed += 1) {
    const game = new R.Game({ preset: 'standard', mode: 'letters', seed, goal: 26 });
    let st = game.state();
    for (let i = 0; i < 60 * 240 && !st.over; i += 1) {
      const before = game.state();
      const touching = game.view().filter(o => Math.abs(o.x) < 0.02);
      st = game.step(1 / 60, false);
      for (const o of touching) {
        if (o.label === before.next) {
          assert.ok(o.wanted,
            `seed ${seed}: a thing labelled "${o.label}" was not treated as the `
            + `correct letter while "${before.next}" was being asked for`);
        }
      }
    }
  }
});

test('only one correct answer is on screen at a time', () => {
  // Two correct letters at once would make the round trivially short
  // and the "next letter" prompt a lie.
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = new R.Game({ preset: 'standard', mode: 'letters', seed, goal: 10 });
    let st = game.state();
    for (let i = 0; i < 60 * 120 && !st.over; i += 1) {
      st = game.step(1 / 60, false);
      const good = game.view().filter(o => o.wanted).length;
      assert.ok(good <= 1, `seed ${seed}: ${good} correct letters on screen at ${st.t.toFixed(1)}s`);
    }
  }
});

/* ── The press ─────────────────────────────────────────────── */

test('a press made slightly too early is kept, not thrown away', () => {
  /* The case this is for: the child makes the movement just before the
     animal has landed. They did what the game asked. Ignoring it and
     making them do it again is the cruellest thing this game could do,
     so a press is held for a moment and spent the instant it can be. */
  const c = R.resolve({ preset: 'standard' });
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 9, goal: 99 });
  game.step(1 / 60, true);
  assert.equal(game.state().onGround, false, 'should be airborne');

  // Still in the air, but within the buffer of being able to jump again.
  const early = c.cooldownS - c.bufferS / 2;
  let st = game.state();
  while (st.t < early) st = game.step(1 / 60, false);
  assert.equal(st.canJump, false, 'the premise is that this press is too early');

  st = game.step(1 / 60, true);
  const jumps = st.jumps;
  assert.equal(jumps, 1, 'must not double jump');

  for (let i = 0; i < 60 && st.jumps === jumps; i += 1) st = game.step(1 / 60, false);
  assert.equal(st.jumps, 2, 'the early press was thrown away');
  assert.ok(st.t - early < c.bufferS + 0.05, 'and it should fire promptly, not drift');
});

test('a press made at the very start of a jump is not saved up for later', () => {
  // The other half of the same decision: honouring a press made a
  // whole second early would make the animal jump on its own, long
  // after the player had given up on it.
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 9, goal: 99 });
  game.step(1 / 60, true);
  game.step(1 / 60, true);               // immediately, far too early
  let st = game.state();
  for (let i = 0; i < 60 * 3; i += 1) st = game.step(1 / 60, false);
  assert.equal(st.jumps, 1, 'a press made a jump early came back to haunt the player');
});

test('a press held onto for too long is reported, not silently lost', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 9, goal: 99, bufferS: 0.1 });
  game.step(1 / 60, true);
  game.drain();
  game.step(1 / 60, true);              // cannot be honoured within 0.1s
  let dropped = false;
  for (let i = 0; i < 30 && !dropped; i += 1) {
    game.step(1 / 60, false);
    dropped = game.drain().some(e => e.type === 'dropped');
  }
  assert.ok(dropped, 'a press that could not be used should say so, so the UI can admit it');
});

test('no second jump before landing, at any setting', () => {
  for (const preset of PLAYABLE) {
    const game = new R.Game({ preset, mode: 'classic', seed: 2, goal: 99 });
    let st = game.step(1 / 60, true);
    const seen = [];
    for (let i = 0; i < 60 * 5; i += 1) {
      st = game.step(1 / 60, true);     // pressing every single frame
      seen.push(st.onGround);
      assert.ok(st.y >= -1e-9, `${preset}: fell through the floor to ${st.y}`);
    }
    assert.ok(st.jumps <= Math.ceil(5 / R.resolve({ preset }).cooldownS) + 1,
      `${preset}: ${st.jumps} jumps in 5 seconds is more than the cooldown allows`);
  }
});

/* ── Robustness ────────────────────────────────────────────── */

test('a dropped frame cannot walk the animal through an obstacle', () => {
  // Browsers stall. A single 300ms frame must not teleport the player
  // past a rock without touching it.
  const fine = new R.Game({ preset: 'standard', mode: 'classic', seed: 6, goal: 99 });
  const coarse = new R.Game({ preset: 'standard', mode: 'classic', seed: 6, goal: 99 });
  let a = fine.state(); let b = coarse.state();
  for (let i = 0; i < 180; i += 1) a = fine.step(1 / 60, false);
  for (let i = 0; i < 12; i += 1) b = coarse.step(0.25, false);
  assert.ok(Math.abs(a.dist - b.dist) < 0.05, `drifted: ${a.dist} vs ${b.dist}`);
  assert.equal(a.hits, b.hits,
    `a stalling browser took ${b.hits} hits where a smooth one took ${a.hits}`);
});

test('a frame of no time, or negative time, changes nothing', () => {
  const game = new R.Game({ preset: 'standard', seed: 8 });
  const before = JSON.stringify(game.state());
  game.step(0, true);
  game.step(-1, true);
  assert.equal(JSON.stringify(game.state()), before);
});

test('the same seed plays out identically', () => {
  const a = new R.Game({ preset: 'standard', mode: 'classic', seed: 42, goal: 10 });
  const b = new R.Game({ preset: 'standard', mode: 'classic', seed: 42, goal: 10 });
  for (let i = 0; i < 2000; i += 1) {
    const press = i % 97 === 0;
    a.step(1 / 60, press);
    b.step(1 / 60, press);
  }
  assert.deepEqual(a.state(), b.state());
  assert.deepEqual(a.view(), b.view());
});

test('different seeds do not play out identically', () => {
  const a = new R.Game({ preset: 'standard', mode: 'classic', seed: 1, goal: 10 });
  const b = new R.Game({ preset: 'standard', mode: 'classic', seed: 2, goal: 10 });
  for (let i = 0; i < 600; i += 1) { a.step(1 / 60, false); b.step(1 / 60, false); }
  assert.notDeepEqual(a.view(), b.view(), 'two seeds produced the same level');
});

test('the road ahead is never empty and never unbounded', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 15, goal: 99 });
  let st = game.state();
  for (let i = 0; i < 60 * 120; i += 1) {
    st = game.step(1 / 60, false);
    const v = game.view();
    assert.ok(v.length >= 1, `nothing on screen at ${st.t.toFixed(1)}s`);
    assert.ok(v.length < 16, `${v.length} objects alive at ${st.t.toFixed(1)}s — nothing is being cleaned up`);
  }
});

test('a finished round stops responding', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 13, goal: 1 });
  const out = play(game);
  assert.equal(out.st.over, true);
  const frozen = JSON.stringify(game.state());
  for (let i = 0; i < 60; i += 1) game.step(1 / 60, true);
  assert.equal(JSON.stringify(game.state()), frozen, 'the game kept running after it ended');
});

test('reset puts everything back', () => {
  const game = new R.Game({ preset: 'standard', mode: 'classic', seed: 17, goal: 5 });
  const fresh = JSON.stringify(game.state());
  play(game);
  game.reset();
  assert.equal(JSON.stringify(game.state()), fresh);
});

/* ── Configuration ─────────────────────────────────────────── */

test('an unknown preset falls back rather than producing a broken game', () => {
  const c = R.resolve({ preset: 'nonsense' });
  assert.ok(c.jumpV0 > 0 && c.speed > 0 && c.windowS > 0.2);
});

test('a goal longer than the sequence is clamped, not run off the end', () => {
  const c = R.resolve({ mode: 'letters', sequence: ['A', 'B'], goal: 50 });
  assert.equal(c.goal, 2);
  const game = new R.Game({ mode: 'letters', sequence: ['A', 'B'], goal: 50, seed: 3 });
  const out = play(game);
  assert.equal(out.st.reason, 'won');
  assert.equal(out.st.idx, 2);
});

test('the number mode counts the way the original did', () => {
  assert.deepEqual(R.numberSequence(20).slice(0, 3), ['1', '2', '3']);
  assert.equal(R.numberSequence(20).length, 20);
  assert.equal(R.letterSequence().length, 26);
  assert.equal(R.letterSequence()[25], 'Z');
});

test('all five of the original animals are still here', () => {
  for (const a of ['lion', 'elephant', 'giraffe', 'crocodile', 'hippo']) {
    assert.ok(R.ANIMALS[a], `${a} went missing`);
  }
});

test('the four duties of the one button', () => {
  const c = R.resolve({ preset: 'standard' });
  assert.deepEqual(R.duty(c, 'low', true).needJump, false, 'something good on the ground: run into it');
  assert.deepEqual(R.duty(c, 'low', false).needJump, true, 'something bad on the ground: jump it');
  assert.deepEqual(R.duty(c, 'low', false).mustClear, true, 'and stay above it the whole way');
  assert.deepEqual(R.duty(c, 'high', true).needJump, true, 'something good overhead: jump to it');
  assert.deepEqual(R.duty(c, 'high', false).needJump, false, 'something bad overhead: ignore it');
});

test('nothing to jump over is placed overhead in the simple mode', () => {
  // An obstacle above your head is avoided by doing nothing, which is
  // not a game.
  const c = R.resolve({ preset: 'standard', mode: 'classic', seed: 31 });
  const sp = new R.Spawner(c);
  for (let i = 0; i < 500; i += 1) {
    const s = sp.next(false);
    if (s.role === 'avoid') assert.equal(s.lane, 'low', 'an avoidable thing was put overhead');
  }
});

test('the engine and this test agree about when to jump', () => {
  /* The marker the game slides along the ground comes from the
     engine's own copy of the arithmetic above. Two implementations
     written separately either agree or one of them is wrong, and this
     is the only place that can tell. */
  for (const preset of PLAYABLE) {
    const c = R.resolve({ preset });
    for (const lane of ['low', 'high']) {
      for (const wanted of [true, false]) {
        for (let x = 0.3; x < 9; x += 0.17) {
          const mine = jumpWindow(c, { x, lane });
          const theirs = R.windowFor(c, lane, wanted, x);
          const needs = R.duty(c, lane, wanted).needJump;
          if (!needs) {
            assert.equal(theirs, null, `${preset} ${lane}/${wanted}: offered a jump that is not needed`);
            continue;
          }
          assert.ok(theirs, `${preset} ${lane} x=${x.toFixed(2)}: engine found no window`);
          assert.ok(Math.abs(theirs.lo - mine.lo) < 1e-9 && Math.abs(theirs.hi - mine.hi) < 1e-9,
            `${preset} ${lane} x=${x.toFixed(2)}: engine says `
            + `[${theirs.lo.toFixed(4)},${theirs.hi.toFixed(4)}], this test says `
            + `[${mine.lo.toFixed(4)},${mine.hi.toFixed(4)}]`);
        }
      }
    }
  }
});

test('both lanes actually get used', () => {
  const c = R.resolve({ preset: 'standard', mode: 'letters', seed: 23 });
  const sp = new R.Spawner(c);
  let high = 0; let low = 0;
  for (let i = 0; i < 300; i += 1) { if (sp.next(false).lane === 'high') high += 1; else low += 1; }
  assert.ok(high > 30 && low > 30, `lanes came out ${high} high / ${low} low`);
});

/* ── The page that loads all this ──────────────────────────── */

test('the game page loads the pieces in an order that works', () => {
  /* runner-engine.js reads IG_SWITCH and IG_RUNNER the moment it is
     called, so a page that loads them the other way round shows a
     blank screen and one console line. Cheap to get wrong when a new
     game page is copied from an old one. */
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'game43.html'), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const want = ['assets/switch-input.js', 'assets/runner-core.js', 'assets/runner-engine.js'];
  assert.deepEqual(srcs, want, `game43.html loads ${JSON.stringify(srcs)}`);

  const css = [...html.matchAll(/<link[^>]+href="(assets\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(css.indexOf('assets/game-engine.css') >= 0, 'the shared chrome styles are missing');
  assert.ok(css.indexOf('assets/runner-engine.css') >= 0, 'the runner styles are missing');

  // The id has to match the server's own idea of a game id, or every
  // settings and progress call for this game is rejected as a bad id.
  const id = (html.match(/id:\s*'(game\d{1,3})'/) || [])[1];
  assert.ok(id && /^game\d{1,3}$/.test(id), `game43.html declares id ${id}`);
});

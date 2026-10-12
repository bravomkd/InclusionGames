/* A player for Animal Run, for tests to use.

   Animal Run can be made unplayable by arithmetic, silently. A rock
   20cm too close to the last one, or a jump 10cm too low, produces a
   game that looks completely normal, runs smoothly, and cannot be
   finished by anyone. You cannot see that by playing it either,
   because when you fail you assume you were too slow.

   So this works out, from the jump kinematics alone, when each
   obstacle has to be jumped, and plays whole rounds. A test asserts it
   takes no damage; if the generator can produce a situation a
   perfectly-timed press cannot survive, this finds it.

   It derives its own physics on purpose. It reads the configuration
   numbers out of the engine but does the kinematics itself, so a sign
   error in the engine's solver cannot cancel out against the same sign
   error in the check. runner-core.test.js asserts the two agree. */
'use strict';

const G = 9.81;

// Feet reach height y on the way up at this time, and on the way down
// at the other. Null when the jump never gets there.
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

/* When must a jump start for the player to deal with this thing
   correctly? The window of valid start times relative to now, or null
   if there is no such window — which is the interesting answer. */
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
  // bottom edge and not past its top, which a big jump does go past.
  const lo0 = Math.max(0, cfg.highY0 - cfg.playerH);
  const inLo = upAt(cfg.jumpV0, lo0);
  if (inLo == null) return null;
  const topUp = upAt(cfg.jumpV0, cfg.highY1);
  const inHi = topUp == null ? downAt(cfg.jumpV0, lo0) : topUp;

  const lo = tEnter - inHi;
  const hi = tExit - inLo;
  return hi >= lo ? { lo, hi } : null;
}

/* Play a game to its end. Returns the final state plus anything the
   player could not physically do. */
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

module.exports = { G, upAt, downAt, jumpWindow, play };

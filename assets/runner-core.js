/* ============================================================
 * InclusionGames — Animal Run, the simulation.
 *
 * A port of a Unity AR runner the client had built years ago: the
 * animal runs by itself and the player has exactly one verb, a jump.
 * Here the jump comes from switch-input.js, so it can be a mouth, a
 * hand, an eyebrow or the space bar.
 *
 * This file is the game with no screen attached: physics, spawning,
 * collision, health, scoring and the end of the round. It holds no
 * DOM, no canvas and no camera, so the whole game can be played by a
 * test in Node — which matters more here than in the bubble games,
 * because this one can be made impossible by arithmetic alone and you
 * cannot see that by looking at it.
 *
 * ── The thing the original got wrong for these players ───────
 * Unity numbers, read out of the scene files rather than guessed:
 * jump 3.5 m/s against gravity 9.81 (0.71s in the air, 0.62m high),
 * a 0.9s cooldown, ground at 1.4–1.5 m/s.
 *
 * Ask the question that actually decides whether someone can play:
 * how late may the jump be and still clear the obstacle? The feet are
 * above a 0.30m obstacle for 0.514s, and at 1.5 m/s the obstacle takes
 * 0.427s to pass. The difference — 0.09s — is the entire margin for
 * error. Camera input spends 100-200ms before the press even arrives.
 * The original is not hard for our players, it is arithmetically
 * closed to them. (For a much lower obstacle the margin grows: at
 * 0.15m it is 0.20s, still inside the latency. The conclusion holds
 * for anything you could trip over.)
 *
 * So this port inverts the design. The teacher does not set a jump
 * height; they set how much slack the child needs, in milliseconds,
 * and the physics is solved backwards from it:
 *
 *     window = (time the feet are above the obstacle) - (time the
 *              obstacle takes to pass)
 *
 * Give me the window you want and I will give you the jump that
 * provides it. Nothing else in the game is allowed to quietly spend
 * that margin.
 *
 * ── Why slowing the game down is not the answer ──────────────
 * The obvious accessibility dial makes this game harder, not easier.
 * A slower world gives more time to see an obstacle coming, and more
 * time stuck inside it: halve the speed and the crossing takes twice
 * as long, so the same jump now clears less. Speed and jump have to
 * move together, which is exactly what solving for the window does.
 *
 * Loads as window.IG_RUNNER in the browser and through require() in
 * Node.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_RUNNER = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G = 9.81;                 // the original's gravity, kept

  /* ── The jump, as arithmetic ───────────────────────────────
     Everything below is a projectile launched at v0 and nothing else:
     no air control, no variable-height jump, no double jump. One
     press, one arc. A player who can produce a single press on time
     should never be beaten by a mechanic they were not told about. */

  /* How long the feet stay above height y. Zero if the jump never
     reaches it. */
  function timeAbove(v0, y, g) {
    g = g || G;
    var disc = v0 * v0 - 2 * g * y;
    if (!(disc > 0)) return 0;
    return 2 * Math.sqrt(disc) / g;
  }

  /* The jump speed that keeps the feet above y for exactly `ta`
     seconds — the inverse of timeAbove. */
  function solveJumpSpeed(y, ta, g) {
    g = g || G;
    var half = g * ta / 2;
    return Math.sqrt(half * half + 2 * g * y);
  }

  function airtime(v0, g) { return 2 * v0 / (g || G); }
  function jumpHeight(v0, g) { return v0 * v0 / (2 * (g || G)); }

  /* ── Deterministic randomness ──────────────────────────────
     A seeded generator, so a level can be replayed exactly: a test
     can assert a particular round is survivable, and a teacher who
     reports "it was impossible at the third rock" can be given the
     same third rock. */
  function Rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ── Geometry ──────────────────────────────────────────────
     Collision boxes are deliberately smaller than the drawing. Part
     of it is the usual platformer courtesy — a near miss should read
     as a miss — but here it also buys the window directly: the
     narrower the obstacle, the shorter the crossing, and the smaller
     the jump needed to cover it. Fattening these back up to match the
     art would cost roughly a third of the margin. */
  var GEOM = {
    playerW: 0.20, playerH: 0.45,   // collision; drawn larger
    objW: 0.16, objH: 0.30,         // a thing on the ground to clear
    highY0: 0.72, highY1: 1.12,     // the overhead lane, as a band
  };

  /* ── Difficulty, expressed as the only number that matters ──
     `windowS` is the slack: how much later than perfect the press may
     arrive and still work. Everything else is derived.

     `original` is not meant to be played. It is the Unity game's own
     numbers, kept so the comparison above stays honest and a test can
     hold it to its 0.09s. */
  var PRESETS = {
    gentle: { speed: 1.1, windowS: 0.70 },
    standard: { speed: 1.4, windowS: 0.45 },
    challenge: { speed: 1.6, windowS: 0.28 },
    original: {
      speed: 1.5, jumpV0: 3.5, cooldownS: 0.9,
      playerW: 0.34, objW: 0.30,        // the fat boxes, too
    },
  };

  var MODES = { classic: 'classic', letters: 'letters' };

  /* 1..20 and A..Z, the two sequences the original shipped. */
  function numberSequence(n) {
    var out = [];
    for (var i = 1; i <= (n || 20); i += 1) out.push(String(i));
    return out;
  }
  function letterSequence() {
    var out = [];
    for (var i = 0; i < 26; i += 1) out.push(String.fromCharCode(65 + i));
    return out;
  }

  var COLLECT = ['🍎', '⭐', '🍌', '🍉', '🥕', '🍇'];
  var AVOID = ['🪨', '🌵', '🪵'];
  var ANIMALS = {
    lion: '🦁', elephant: '🐘', giraffe: '🦒', crocodile: '🐊', hippo: '🦛',
  };

  /* ── Resolving a configuration ─────────────────────────────
     defaults <- preset <- caller. The derived numbers are recomputed
     from whatever survives, so `windowS` on the way out is always the
     window the player actually gets, never the one that was asked
     for. A preset that pins the jump directly (original) reports the
     margin it really has. */
  function resolve(opts) {
    var o = opts || {};
    var preset = PRESETS[o.preset] || PRESETS.standard;
    var c = {};
    var k;
    for (k in GEOM) if (Object.prototype.hasOwnProperty.call(GEOM, k)) c[k] = GEOM[k];
    for (k in preset) if (Object.prototype.hasOwnProperty.call(preset, k)) c[k] = preset[k];

    var TAKES = ['speed', 'windowS', 'jumpV0', 'cooldownS', 'playerW', 'playerH',
      'objW', 'objH', 'highY0', 'highY1', 'bufferS', 'hp', 'hpLoss', 'deadAt',
      'settleS', 'viewAheadM', 'goal', 'mode', 'sequence', 'animal', 'collect',
      'avoid', 'targetBias', 'highBias', 'g', 'seed'];
    for (var i = 0; i < TAKES.length; i += 1) {
      if (o[TAKES[i]] != null) c[TAKES[i]] = o[TAKES[i]];
    }

    c.g = c.g || G;
    c.mode = c.mode === MODES.letters ? MODES.letters : MODES.classic;
    c.animal = c.animal || 'lion';
    c.collect = c.collect || COLLECT;
    c.avoid = c.avoid || AVOID;

    /* Health, faithful to the original: a full bar, a quarter gone per
       mistake, dead at a fifth — which is four mistakes, not five. */
    if (c.hp == null) c.hp = 1;
    if (c.hpLoss == null) c.hpLoss = 0.25;
    if (c.deadAt == null) c.deadAt = 0.2;

    /* A press that lands while the animal is still in the air is kept
       for a moment and spent the instant it can be. Dropping it is the
       cruellest thing this game could do: the player made the movement
       they were asked for and the game pretended they had not. */
    if (c.bufferS == null) c.bufferS = 0.35;
    if (c.settleS == null) c.settleS = 0.10;
    if (c.viewAheadM == null) c.viewAheadM = 7;
    if (c.targetBias == null) c.targetBias = 0.65;
    if (c.highBias == null) c.highBias = 0.45;

    if (c.mode === MODES.letters) {
      if (!c.sequence || !c.sequence.length) c.sequence = letterSequence();
      if (c.goal == null) c.goal = Math.min(10, c.sequence.length);
      c.goal = Math.max(1, Math.min(c.goal, c.sequence.length));
    } else {
      c.sequence = null;
      if (c.goal == null) c.goal = 12;
      c.goal = Math.max(1, c.goal);
    }

    // The crossing: how long an obstacle and the animal overlap in x.
    c.crossS = (c.objW + c.playerW) / c.speed;

    if (c.jumpV0 == null) {
      c.jumpV0 = solveJumpSpeed(c.objH, (c.windowS || 0.45) + c.crossS, c.g);
    }
    c.airtimeS = airtime(c.jumpV0, c.g);
    c.jumpHeightM = jumpHeight(c.jumpV0, c.g);
    c.aboveObjS = timeAbove(c.jumpV0, c.objH, c.g);
    c.windowS = c.aboveObjS - c.crossS;      // the truth, not the request

    /* The overhead lane is touched, not cleared, so it only needs the
       boxes to overlap for an instant. That makes reaching up easier
       than jumping over, which is the right way round. */
    c.reachY = Math.max(0, c.highY0 - c.playerH);
    c.reachS = timeAbove(c.jumpV0, c.reachY, c.g);

    // No second jump before landing, ever.
    if (c.cooldownS == null) c.cooldownS = c.airtimeS + c.settleS;
    c.cooldownS = Math.max(c.cooldownS, c.airtimeS);

    /* Spacing. Two obstacles close enough together that the second
       arrives during the first one's cooldown are not difficult, they
       are a bug with a score attached. The gap covers a full jump, the
       wait afterwards, and one crossing. */
    c.minGapM = (c.airtimeS + c.cooldownS + c.crossS) * c.speed;
    c.startGapM = Math.max(c.minGapM, c.viewAheadM);

    return c;
  }

  /* ── The spawner ───────────────────────────────────────────
     Slots, not objects: position, lane and role only. What a slot
     actually shows is decided when it is reached.

     That is not laziness, it repairs a deadlock in the original. There
     the next correct letter was only offered once the previous one had
     been collected, and a letter that scrolled past uncollected left
     that flag down for good — the correct letter never spawned again
     and the round could not be finished, by anybody, ever. Resolving
     the label on arrival means a missed letter simply comes round
     again. */
  function Spawner(cfg) {
    this.cfg = cfg;
    this.rng = Rng(cfg.seed == null ? 1 : cfg.seed);
    this.x = cfg.startGapM;
    this.n = 0;
  }

  Spawner.prototype.next = function (targetPending) {
    var c = this.cfg;
    var r1 = this.rng(), r2 = this.rng(), r3 = this.rng();
    var jitter = 1 + r1 * 0.6;             // 1.0x-1.6x the minimum gap
    if (this.n > 0) this.x += c.minGapM * jitter;
    this.n += 1;

    var slot = { x: this.x, r: r3, n: this.n };

    if (c.mode === MODES.letters) {
      // Only one correct letter in flight at a time, as the original
      // intended — but a miss cannot wedge it shut any more.
      slot.role = (!targetPending && r2 < c.targetBias) ? 'target' : 'decoy';
      slot.lane = (this.rng() < c.highBias) ? 'high' : 'low';
    } else {
      slot.role = (r2 < 0.55) ? 'collect' : 'avoid';
      // Something to jump over belongs on the ground; an obstacle
      // overhead is cleared by doing nothing, which is not a game.
      slot.lane = slot.role === 'avoid' ? 'low' : ((this.rng() < c.highBias) ? 'high' : 'low');
    }
    return slot;
  };

  /* ── What the player must do about a thing ─────────────────
     Four cases, one button:
       on the ground, must not touch  -> jump over it
       on the ground, must touch      -> run into it, stay down
       overhead,     must touch       -> jump up to it
       overhead,     must not touch   -> stay down
     `mustClear` is the hard one: the feet have to be above it for the
     whole crossing, not just an instant. */
  function duty(cfg, lane, wanted) {
    if (lane === 'low') {
      return wanted
        ? { needJump: false, mustClear: false, thresholdY: 0 }
        : { needJump: true, mustClear: true, thresholdY: cfg.objH };
    }
    return wanted
      ? { needJump: true, mustClear: false, thresholdY: cfg.reachY }
      : { needJump: false, mustClear: false, thresholdY: 0 };
  }

  /* ── When should the press happen? ────────────────────────
     For a thing `x` metres ahead, the range of moments at which a
     jump started would deal with it correctly, in seconds from now.
     Null means there is no such moment.

     The game does not need this to run — it is for the optional marker
     that slides along the ground towards the animal, turning "judge
     when to jump" into "press when it arrives". For a child who cannot
     yet anticipate, that is the difference between a game and a
     series of unexplained failures. */
  function windowFor(cfg, lane, wanted, x) {
    var d = duty(cfg, lane, wanted);
    if (!d.needJump) return null;

    var span = (cfg.playerW + cfg.objW) / 2;
    var tEnter = (x - span) / cfg.speed;
    var tExit = (x + span) / cfg.speed;
    var up, down, lo, hi;

    if (d.mustClear) {
      // Above it from before it arrives until after it has gone.
      var disc = cfg.jumpV0 * cfg.jumpV0 - 2 * cfg.g * d.thresholdY;
      if (!(disc > 0)) return null;
      up = (cfg.jumpV0 - Math.sqrt(disc)) / cfg.g;
      down = (cfg.jumpV0 + Math.sqrt(disc)) / cfg.g;
      lo = tExit - down;
      hi = tEnter - up;
      return hi >= lo ? { lo: lo, hi: hi } : null;
    }

    /* Reaching up only needs the boxes to touch for an instant — but
       a big jump carries the feet straight past the top of the lane,
       so the moment to aim for is the way up through the band, not the
       apex. */
    var lowY = Math.max(0, cfg.highY0 - cfg.playerH);
    var dLow = cfg.jumpV0 * cfg.jumpV0 - 2 * cfg.g * lowY;
    if (!(dLow > 0)) return null;
    var inAt = (cfg.jumpV0 - Math.sqrt(dLow)) / cfg.g;
    var dHigh = cfg.jumpV0 * cfg.jumpV0 - 2 * cfg.g * cfg.highY1;
    var outAt = dHigh > 0
      ? (cfg.jumpV0 - Math.sqrt(dHigh)) / cfg.g       // straight through it
      : (cfg.jumpV0 + Math.sqrt(dLow)) / cfg.g;       // never leaves the band
    lo = tEnter - outAt;
    hi = tExit - inAt;
    return hi >= lo ? { lo: lo, hi: hi } : null;
  }

  /* ── The game ──────────────────────────────────────────────── */
  function Game(opts) {
    this.cfg = resolve(opts);
    this.reset();
  }

  Game.prototype.reset = function () {
    var c = this.cfg;
    this.spawner = new Spawner(c);
    this.t = 0;
    this.dist = 0;
    this.y = 0;
    this.vy = 0;
    this.onGround = true;
    this.lastJumpAt = -Infinity;
    this.buffer = 0;
    this.hp = c.hp;
    this.score = 0;
    this.idx = 0;             // how far through the sequence
    this.hits = 0;
    this.missed = 0;
    this.jumps = 0;
    this.live = [];
    this.over = false;
    this.reason = null;
    this.events = [];
    this.fill(0);
  };

  /* The label a slot shows, decided now. Stable afterwards. */
  Game.prototype.label = function (slot) {
    var c = this.cfg;
    if (c.mode === MODES.letters) {
      var seq = c.sequence;
      var want = seq[Math.min(this.idx, seq.length - 1)];
      if (slot.role === 'target') return want;
      var pool = [];
      for (var i = 0; i < seq.length; i += 1) if (seq[i] !== want) pool.push(seq[i]);
      if (!pool.length) return want;
      return pool[Math.floor(slot.r * pool.length) % pool.length];
    }
    var list = slot.role === 'collect' ? c.collect : c.avoid;
    return list[Math.floor(slot.r * list.length) % list.length];
  };

  /* Should the player touch this thing?

     In letters mode the answer comes from the label on it, never from
     the role it was spawned as. The two can disagree: a decoy showing
     "E" is still on screen when the player collects "D", and "E" is
     now the letter being asked for. Going by the role would mark a
     child wrong for catching exactly the letter the game is asking
     them to catch. The original compared the label too; this keeps
     that and is the reason it has to be asked every frame rather than
     frozen when the thing spawned. */
  Game.prototype.wanted = function (obj) {
    if (this.cfg.mode !== MODES.letters) return obj.role === 'collect';
    return obj.label === this.cfg.sequence[Math.min(this.idx, this.cfg.sequence.length - 1)];
  };

  Game.prototype.targetPending = function () {
    for (var i = 0; i < this.live.length; i += 1) {
      var o = this.live[i];
      if (!o.done && this.wanted(o)) return true;
    }
    return false;
  };

  /* Keep the road ahead populated. Objects are born when they come
     into view, which is also when their label is fixed — far enough
     ahead to be seen and reacted to, close enough that the letter is
     the one being asked for now. */
  Game.prototype.fill = function () {
    var c = this.cfg;
    var guard = 0;
    while (this.spawner.x < this.dist + c.viewAheadM + c.minGapM && guard < 64) {
      guard += 1;
      var slot = this.spawner.next(this.targetPending());
      this.live.push({
        slot: slot,
        x: slot.x,
        lane: slot.lane,
        role: slot.role,
        label: this.label(slot),
        done: false,
      });
    }
  };

  Game.prototype.canJump = function () {
    return this.onGround && (this.t - this.lastJumpAt) >= this.cfg.cooldownS;
  };

  Game.prototype.jump = function () {
    if (!this.canJump()) return false;
    this.vy = this.cfg.jumpV0;
    this.onGround = false;
    this.lastJumpAt = this.t;
    this.jumps += 1;
    this.events.push({ type: 'jump', t: this.t });
    return true;
  };

  Game.prototype.damage = function (obj) {
    this.hp -= this.cfg.hpLoss;
    this.hits += 1;
    this.events.push({ type: 'hit', t: this.t, label: obj.label, lane: obj.lane });
  };

  /* One frame. `pressed` is true only on the frame a press begins —
     the switch already made that distinction. */
  Game.prototype.step = function (dt, pressed) {
    if (this.over) return this.state();
    if (!(dt > 0)) return this.state();

    if (pressed && !this.jump()) this.buffer = this.cfg.bufferS;

    // Sub-step so a frame dropped by the browser cannot walk the
    // animal through an obstacle.
    var MAX = 1 / 120;
    var left = Math.min(dt, 0.25);
    while (left > 1e-9 && !this.over) {
      var h = left > MAX ? MAX : left;
      left -= h;
      this.tick(h);
    }
    return this.state();
  };

  Game.prototype.tick = function (h) {
    var c = this.cfg;
    this.t += h;

    if (this.buffer > 0) {
      this.buffer -= h;
      if (this.jump()) this.buffer = 0;
      else if (this.buffer <= 0) {
        this.buffer = 0;
        this.events.push({ type: 'dropped', t: this.t });
      }
    }

    if (!this.onGround) {
      this.vy -= c.g * h;
      this.y += this.vy * h;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.onGround = true;
        this.events.push({ type: 'land', t: this.t });
      }
    }

    this.dist += c.speed * h;
    this.collide();
    this.cull();
    this.fill();
    this.finish();
  };

  Game.prototype.collide = function () {
    var c = this.cfg;
    var px0 = -c.playerW / 2, px1 = c.playerW / 2;
    var py0 = this.y, py1 = this.y + c.playerH;

    for (var i = 0; i < this.live.length; i += 1) {
      var o = this.live[i];
      if (o.done) continue;
      var ox = o.x - this.dist;
      if (ox + c.objW / 2 < px0 || ox - c.objW / 2 > px1) continue;
      var oy0 = o.lane === 'high' ? c.highY0 : 0;
      var oy1 = o.lane === 'high' ? c.highY1 : c.objH;
      if (py1 <= oy0 || py0 >= oy1) continue;

      o.done = true;
      o.hitAt = this.t;
      var good = this.wanted(o);
      if (c.mode === MODES.letters) {
        if (good) {
          this.idx += 1;
          this.score += 1;
          this.events.push({ type: 'correct', t: this.t, label: o.label, idx: this.idx });
        } else {
          this.events.push({ type: 'wrong', t: this.t, label: o.label });
          this.damage(o);
        }
      } else if (good) {
        this.score += 1;
        this.events.push({ type: 'collect', t: this.t, label: o.label });
      } else {
        this.damage(o);
      }
    }
  };

  /* Gone past. A correct letter that was not collected costs nothing —
     not progressing is already the consequence, and charging health on
     top of it would punish hesitation twice. */
  Game.prototype.cull = function () {
    var c = this.cfg;
    var keep = [];
    for (var i = 0; i < this.live.length; i += 1) {
      var o = this.live[i];
      var ox = o.x - this.dist;
      if (ox + c.objW / 2 < -c.playerW / 2 - 0.5) {
        if (!o.done && this.wanted(o)) {
          this.missed += 1;
          this.events.push({ type: 'missed', t: this.t, label: o.label, role: o.role });
        }
        continue;
      }
      keep.push(o);
    }
    this.live = keep;
  };

  Game.prototype.finish = function () {
    var c = this.cfg;
    if (this.hp <= c.deadAt + 1e-9) {
      this.over = true; this.reason = 'dead';
      this.events.push({ type: 'over', t: this.t, reason: 'dead' });
      return;
    }
    var done = c.mode === MODES.letters ? this.idx >= c.goal : this.score >= c.goal;
    if (done) {
      this.over = true; this.reason = 'won';
      this.events.push({ type: 'over', t: this.t, reason: 'won' });
    }
  };

  /* What the renderer needs, in metres, with x already relative to the
     animal. Nothing here is a live reference into the game. */
  Game.prototype.view = function () {
    var c = this.cfg;
    var out = [];
    for (var i = 0; i < this.live.length; i += 1) {
      var o = this.live[i];
      if (o.done) continue;
      var want = this.wanted(o);
      var d = duty(c, o.lane, want);
      out.push({
        x: o.x - this.dist, lane: o.lane, role: o.role, label: o.label,
        wanted: want, needJump: d.needJump, mustClear: d.mustClear,
        thresholdY: d.thresholdY, n: o.slot.n,
      });
    }
    return out;
  };

  Game.prototype.state = function () {
    var c = this.cfg;
    return {
      t: this.t, dist: this.dist, y: this.y, vy: this.vy,
      onGround: this.onGround, canJump: this.canJump(),
      hp: this.hp, lives: Math.max(0, Math.ceil((this.hp - c.deadAt) / c.hpLoss)),
      score: this.score, idx: this.idx, goal: c.goal,
      hits: this.hits, missed: this.missed, jumps: this.jumps,
      over: this.over, reason: this.reason,
      next: c.mode === MODES.letters ? c.sequence[Math.min(this.idx, c.sequence.length - 1)] : null,
    };
  };

  Game.prototype.drain = function () {
    var e = this.events;
    this.events = [];
    return e;
  };

  return {
    G: G, GEOM: GEOM, PRESETS: PRESETS, MODES: MODES,
    COLLECT: COLLECT, AVOID: AVOID, ANIMALS: ANIMALS,
    timeAbove: timeAbove, solveJumpSpeed: solveJumpSpeed,
    airtime: airtime, jumpHeight: jumpHeight,
    numberSequence: numberSequence, letterSequence: letterSequence,
    Rng: Rng, resolve: resolve, Spawner: Spawner, duty: duty, windowFor: windowFor, Game: Game,
  };
});

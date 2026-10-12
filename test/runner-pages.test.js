/* The games as they actually ship.

   runner-core.test.js proves the engine is fair when it is handed a
   sensible configuration. This proves the configurations in the game
   pages are sensible — which is a different question, and the one a
   child is actually exposed to. A page can ask for a sequence of two
   letters and a goal of fifty, or name a mode that does not exist, and
   every unit test still passes while the game cannot be finished.

   So this runs the real pages' own config objects, exactly as the
   browser would evaluate them, and plays each one to the end. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = require('../assets/runner-core.js');
const { play } = require('./runner-player.js');
const catalogue = require('../assets/catalogue.js');

const ROOT = path.join(__dirname, '..');
const PAGES = ['game43.html', 'game44.html', 'game45.html'];
const PLAYABLE = ['gentle', 'standard', 'challenge'];

/* Run the page's own inline script with the two globals it expects,
   and catch the configuration it hands to the engine. Evaluating it
   rather than matching it with a regex means a page that cannot run at
   all fails here instead of in front of a child. */
function configOf(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(blocks.length, 1, `${page} should have exactly one inline script`);

  let captured = null;
  const sandbox = {
    IG_RUNNER: R,
    IG_SWITCH: require('../assets/switch-input.js'),
    IG_RUNNER_GAME: (c) => { captured = c; },
  };
  vm.runInNewContext(blocks[0], sandbox, { filename: page, timeout: 5000 });
  assert.ok(captured, `${page} never called IG_RUNNER_GAME`);
  return captured;
}

const CONFIGS = PAGES.map(p => ({ page: p, cfg: configOf(p) }));

test('every page hands the engine something it understands', () => {
  for (const { page, cfg } of CONFIGS) {
    assert.ok(['classic', 'letters'].includes(cfg.mode), `${page} asks for mode "${cfg.mode}"`);
    assert.match(cfg.id, /^game\d{1,3}$/, `${page} has id "${cfg.id}"`);
    assert.equal(cfg.id, page.replace('.html', ''));
    /* A page may leave the round length alone, and all three do: how
       many items a child is asked for belongs to the difficulty
       setting and to their teacher, not to the page. */
    for (const preset of PLAYABLE) {
      const resolved = R.resolve({ preset, mode: cfg.mode, sequence: cfg.sequence || null, goal: cfg.goal });
      assert.ok(resolved.goal > 0, `${page} at ${preset} resolves to goal ${resolved.goal}`);
      if (cfg.mode === 'letters') {
        assert.ok(resolved.goal <= cfg.sequence.length,
          `${page} at ${preset} asks for ${resolved.goal} of a ${cfg.sequence.length}-long sequence`);
      }
    }

    if (cfg.mode === 'letters') {
      assert.ok(Array.isArray(cfg.sequence) && cfg.sequence.length > 0,
        `${page} is a sequence game with no sequence`);
      assert.equal(new Set(cfg.sequence).size, cfg.sequence.length,
        `${page} has a repeated item in its sequence, so "the next one" is ambiguous`);
    } else {
      assert.ok(!cfg.sequence, `${page} is not a sequence game but names one`);
    }
  }
});

test('every page is playable, at every setting, by a well-timed player', () => {
  /* The headline. If any shipped page can produce a round that a
     perfectly-timed press cannot survive, it shows up here. */
  const failures = [];
  for (const { page, cfg } of CONFIGS) {
    for (const preset of PLAYABLE) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const game = new R.Game({
          preset,
          mode: cfg.mode,
          sequence: cfg.sequence || null,
          goal: cfg.goal || null,
          seed,
        });
        const out = play(game, { maxFrames: 60 * 600 });
        if (out.impossible.length || out.st.hits > 0 || out.st.reason !== 'won' || out.ranOut) {
          failures.push({
            page, preset, seed, reason: out.st.reason, hits: out.st.hits,
            ranOut: out.ranOut, impossible: out.impossible.slice(0, 2),
          });
        }
      }
    }
  }
  assert.deepEqual(failures, [],
    'shipped pages that a perfect player could not finish unharmed:\n'
    + JSON.stringify(failures.slice(0, 5), null, 2));
});

test('a round takes a length of time a child will sit through', () => {
  /* A goal of six and a goal of sixty are the same code and a very
     different lesson. This is the only place the actual length of a
     session is checked, and for this audience it matters more than
     most things that are checked. */
  const times = [];
  for (const { page, cfg } of CONFIGS) {
    for (const preset of PLAYABLE) {
      let worst = 0;
      for (let seed = 1; seed <= 10; seed += 1) {
        const game = new R.Game({
          preset, mode: cfg.mode, sequence: cfg.sequence || null, goal: cfg.goal || null, seed,
        });
        const out = play(game, { maxFrames: 60 * 600 });
        worst = Math.max(worst, out.st.t);
      }
      times.push({ page, preset, worst: Math.round(worst) });
      /* Around a minute, whichever setting is chosen. The bound is
         tight on purpose: a fixed goal used to make the gentlest
         setting — the slowest one — run nearly three minutes, which is
         the longest session handed to the child least able to sustain
         one. The round length now scales with the setting instead. */
      assert.ok(worst < 130,
        `${page} at "${preset}" ran ${Math.round(worst)}s even played perfectly`);
      assert.ok(worst > 8,
        `${page} at "${preset}" was over in ${Math.round(worst)}s — too short to be a game`);
    }
  }
  // Printed so a change in pacing is visible in the run, not just pass/fail.
  console.log('    round length, played perfectly (seconds):');
  for (const t of times) console.log(`      ${t.page} ${t.preset.padEnd(10)} ${t.worst}`);
});

test('a player who does nothing at all is not stuck forever', () => {
  // Walking away has to end the round, in every mode.
  for (const { page, cfg } of CONFIGS) {
    const game = new R.Game({
      preset: 'standard', mode: cfg.mode, sequence: cfg.sequence || null, goal: cfg.goal || null, seed: 3,
    });
    let st = game.state();
    for (let i = 0; i < 60 * 600 && !st.over; i += 1) st = game.step(1 / 60, false);
    assert.equal(st.over, true, `${page} never ended for a player who did nothing`);
  }
});

test('each page is the game the catalogue advertises', () => {
  for (const { page, cfg } of CONFIGS) {
    const entry = catalogue.byId(cfg.id);
    assert.ok(entry, `${cfg.id} is not in the catalogue`);
    assert.equal(entry.file, page);

    // A teacher filtering by subject has to land on the right thing.
    if (cfg.mode === 'classic') {
      assert.equal(entry.cat, 'sport', 'the plain running game belongs under Sport');
    } else if (cfg.sequence[0] === 'A') {
      assert.equal(entry.cat, 'jezyk', 'the letters game belongs under Language');
    } else {
      assert.equal(entry.cat, 'mat', 'the counting game belongs under Math');
      assert.equal(cfg.sequence[0], '1', 'counting should start at one');
    }
  }
});

test('the three pages are three different games', () => {
  const shapes = CONFIGS.map(({ cfg }) => cfg.mode + ':' + (cfg.sequence ? cfg.sequence.join('') : ''));
  assert.equal(new Set(shapes).size, 3, 'two of the pages are the same game twice');
});

test('every page speaks all four languages', () => {
  for (const { page, cfg } of CONFIGS) {
    for (const lang of ['en', 'de', 'pl', 'es']) {
      const t = cfg.text && cfg.text[lang];
      assert.ok(t, `${page} has no ${lang} text`);
      for (const field of ['tag', 'title', 'titleEm', 'desc', 'quest']) {
        assert.ok(t[field] && String(t[field]).trim().length > 1,
          `${page} ${lang} is missing "${field}"`);
      }
    }
    // The four should not be the same string four times.
    const titles = ['en', 'de', 'pl', 'es'].map(l => cfg.text[l].desc);
    assert.ok(new Set(titles).size >= 3, `${page} looks like it was not really translated`);
  }
});

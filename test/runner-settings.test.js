/* Per-child settings for Animal Run.

   The dial that matters for this game is not a difficulty level but the
   reaction window: how late a child's movement may arrive and still
   count, in milliseconds. A teacher can observe that about a child; a
   "level 7" they cannot. It is also the number the physics is solved
   backwards from, so it has to survive the round trip through the
   server intact and arrive at the game as the same number.

   These tests are about what a teacher can store and get back, and
   about the ways a stored setting can quietly go missing — which is the
   failure that matters here, because nobody notices a setting that is
   not applied. They notice a child who cannot play any more. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeUser, authHeader } = require('./helpers');
const R = require('../assets/runner-core.js');
const SW = require('../assets/switch-input.js');

async function setup(srv) {
  const u = await makeUser(srv, 'teacher@example.com');
  const h = { headers: authHeader(u.token) };
  const made = await (await srv.postJson('/api/children', { name: 'Mia' }, h)).json();
  return { u, h, id: made.child.id };
}

function put(srv, id, game, body, token) {
  return fetch(`${srv.base}/api/children/${id}/settings/${game}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(body),
  });
}

test('a teacher can set up Animal Run for one child', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const { u, h, id } = await setup(srv);

  await t.test('a whole setup survives the round trip', async () => {
    const runner = { windowMs: 620, source: 'mouthOpen', animal: 'giraffe', hint: true };
    const saved = await (await put(srv, id, 'game43', { runner }, u.token)).json();
    assert.deepEqual(saved.settings.runner, runner);

    const back = await (await srv.get(`/api/children/${id}/settings/game43`, h)).json();
    assert.deepEqual(back.settings.runner, runner,
      'the settings read back differ from the ones stored');
  });

  await t.test('the reaction window arrives as the exact number set', async () => {
    /* Not rounded to a tier on the way through. 620ms means 620ms: the
       jump is solved from it, and a teacher who nudges it from 600 to
       650 because a child was just missing has to get 650. */
    await put(srv, id, 'game43', { runner: { windowMs: 437 } }, u.token);
    const back = await (await srv.get(`/api/children/${id}/settings/game43`, h)).json();
    assert.equal(back.settings.runner.windowMs, 437);

    const cfg = R.resolve({ preset: R.presetForWindow(437), windowS: 437 / 1000 });
    assert.ok(Math.abs(cfg.windowS * 1000 - 437) < 1e-6,
      `the game would give ${Math.round(cfg.windowS * 1000)}ms, not 437`);
  });

  await t.test('an impossible window is clamped, not stored', async () => {
    // 20ms is shorter than a camera frame; 9000ms is not a game.
    for (const [asked, want] of [[20, 150], [9000, 1200], [-5, 150]]) {
      await put(srv, id, 'game43', { runner: { windowMs: asked } }, u.token);
      const back = await (await srv.get(`/api/children/${id}/settings/game43`, h)).json();
      assert.equal(back.settings.runner.windowMs, want,
        `${asked}ms should have been clamped to ${want}`);
    }
  });

  await t.test('a movement or animal that does not exist is dropped', async () => {
    const res = await (await put(srv, id, 'game43', {
      runner: { windowMs: 500, source: 'telepathy', animal: 'dragon' },
    }, u.token)).json();
    assert.equal(res.settings.runner.source, null, 'an unknown movement was stored');
    assert.equal(res.settings.runner.animal, null, 'an unknown animal was stored');
    assert.equal(res.settings.runner.windowMs, 500, 'the valid part should survive');
  });

  await t.test('every movement the game offers is one the server accepts', async () => {
    /* The two lists have to be the same list. A movement a child can
       pick in the game but the server refuses to remember is a setting
       that silently resets every session. */
    for (const src of SW.sourceIds()) {
      const res = await (await put(srv, id, 'game43', { runner: { source: src } }, u.token)).json();
      assert.equal(res.settings.runner.source, src, `the server refused "${src}"`);
    }
    for (const a of Object.keys(R.ANIMALS)) {
      const res = await (await put(srv, id, 'game43', { runner: { animal: a } }, u.token)).json();
      assert.equal(res.settings.runner.animal, a, `the server refused the ${a}`);
    }
  });

  await t.test('the jump marker can be turned off, and off is not the same as unset', async () => {
    const off = await (await put(srv, id, 'game43', { runner: { hint: false } }, u.token)).json();
    assert.equal(off.settings.runner.hint, false,
      'turning the marker off read back as "never chosen", so it would come back on');
    const on = await (await put(srv, id, 'game43', { runner: { hint: true } }, u.token)).json();
    assert.equal(on.settings.runner.hint, true);
  });

  await t.test('a runner setting is not thrown away as an empty payload', async () => {
    /* The server deletes settings that are entirely default, to keep
       the file tidy. If it does not count the runner block as content,
       a teacher saves a setup, is told it saved, and it is gone. */
    const res = await (await put(srv, id, 'game44', { runner: { windowMs: 700 } }, u.token)).json();
    assert.ok(res.settings, 'the settings were discarded on the way in');
    const back = await (await srv.get(`/api/children/${id}/settings/game44`, h)).json();
    assert.ok(back.settings && back.settings.runner, 'the saved setup did not survive');
    assert.equal(back.settings.runner.windowMs, 700);
  });

  await t.test('a genuinely empty payload still clears the settings', async () => {
    await put(srv, id, 'game45', { runner: { windowMs: 500 } }, u.token);
    await put(srv, id, 'game45', {}, u.token);
    const back = await (await srv.get(`/api/children/${id}/settings/game45`, h)).json();
    assert.equal(back.settings, null, 'clearing a game should really clear it');
  });

  await t.test('settings are per game, not per child', async () => {
    await put(srv, id, 'game43', { runner: { windowMs: 300, animal: 'hippo' } }, u.token);
    await put(srv, id, 'game44', { runner: { windowMs: 900, animal: 'lion' } }, u.token);
    const a = await (await srv.get(`/api/children/${id}/settings/game43`, h)).json();
    const b = await (await srv.get(`/api/children/${id}/settings/game44`, h)).json();
    assert.equal(a.settings.runner.windowMs, 300);
    assert.equal(b.settings.runner.windowMs, 900);
    assert.equal(a.settings.runner.animal, 'hippo');
  });

  await t.test('the older settings still work beside the new ones', async () => {
    // A child set up before this game existed must not be disturbed.
    const res = await (await put(srv, id, 'game07', {
      count: 6, mathLevel: 'gentle', disabled: ['a|b'],
    }, u.token)).json();
    assert.equal(res.settings.count, 6);
    assert.equal(res.settings.mathLevel, 'gentle');
    assert.deepEqual(res.settings.disabled, ['a|b']);
    assert.equal(res.settings.runner, null);
  });

  await t.test('rubbish in the runner block does not break the save', async () => {
    for (const junk of [{ runner: 'yes' }, { runner: [] }, { runner: null },
      { runner: { windowMs: 'soon', source: 42, animal: {}, hint: 'maybe' } }]) {
      const res = await put(srv, id, 'game43', junk, u.token);
      assert.equal(res.status, 200, `${JSON.stringify(junk)} was not handled`);
      const body = await res.json();
      assert.ok(body.settings === null || body.settings.runner === null
        || typeof body.settings.runner === 'object');
    }
  });

  await t.test('another account cannot read or write this setup', async () => {
    const stranger = await makeUser(srv, 'stranger@example.com');
    const w = await put(srv, id, 'game43', { runner: { windowMs: 1000 } }, stranger.token);
    assert.equal(w.status, 404, 'a stranger wrote to this child');
    const r = await srv.get(`/api/children/${id}/settings/game43`,
      { headers: authHeader(stranger.token) });
    assert.equal(r.status, 404, 'a stranger read this child');
  });
});

test('a stored window produces the game the teacher asked for', () => {
  /* The round trip that matters is not JSON, it is physics: the number
     a teacher types has to come out as the slack the child actually
     gets. */
  for (const ms of [200, 300, 450, 620, 700, 1000]) {
    const preset = R.presetForWindow(ms);
    const cfg = R.resolve({ preset, windowS: ms / 1000, mode: 'classic' });
    assert.ok(Math.abs(cfg.windowS * 1000 - ms) < 1e-6,
      `asked for ${ms}ms, the game gives ${Math.round(cfg.windowS * 1000)}ms`);
    assert.ok(cfg.jumpV0 > 0 && cfg.jumpHeightM > cfg.objH,
      `${ms}ms produced a jump that cannot clear an obstacle`);
    assert.ok(cfg.cooldownS >= cfg.airtimeS, `${ms}ms allows a second jump in mid-air`);
  }
});

test('the tier shown back to a teacher is the nearest one', () => {
  assert.equal(R.presetForWindow(700), 'gentle');
  assert.equal(R.presetForWindow(450), 'standard');
  assert.equal(R.presetForWindow(280), 'challenge');
  // And never the Unity original, which is not a setting anyone picks.
  for (const ms of [50, 88, 100, 5000]) {
    assert.notEqual(R.presetForWindow(ms), 'original');
  }
});

/* Static-file exposure and the subscription gate.

   Both of these were live holes: the whole user database was downloadable at
   /data/users.json, and the gate matched "/game02.html" while express.static
   happily served the same page at "/game02". */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeUser } = require('./helpers');

test('static exposure and the paywall gate', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('never serves anything private', async () => {
    const mustBe404 = [
      '/data/users.json',
      '/DATA/USERS.JSON',
      '/data/users.backup.json',
      '/server.js',
      '/SERVER.JS',
      '/package.json',
      '/package-lock.json',
      '/.env',
      '/node_modules/express/package.json',
      '/%2e%2e/%2e%2e/etc/passwd',
      // Backend source, for the same reason as server.js: it is not part of
      // the public site and there is no reason to hand it out.
      '/lib/analytics.js',
      '/lib/report-pdf.js',
      '/LIB/rehab-analytics.js',
      '/.github/workflows/ci.yml',
    ];
    for (const p of mustBe404) {
      const res = await srv.get(p);
      assert.equal(res.status, 404, `${p} should not be served (got ${res.status})`);
    }
  });

  await t.test('the browser harnesses are not served in production', async () => {
    // test/ holds pages that stub the camera and the tracker. They are served
    // on a developer machine so the engines can be driven without a webcam,
    // and must not exist on the live site — somebody could otherwise open one
    // and post invented sessions to their own child's profile.
    const prod = await startServer({ APP_URL: 'https://www.inclusion-games.com', NODE_ENV: 'production' });
    try {
      for (const p of ['/test/harness/rehab-harness.html', '/test/harness/game-settings-race.html',
        '/test/harness/runner-harness.html', '/test/runner-core.test.js',
        '/test/helpers.js', '//test//harness//run-all.html', '/TEST/harness/run-all.html']) {
        const res = await prod.get(p);
        assert.equal(res.status, 404, `${p} should not be served in production (got ${res.status})`);
      }
    } finally {
      await prod.stop();
    }
  });

  await t.test('the harnesses ARE reachable on a developer machine', async () => {
    // Otherwise the engines go back to having no way to be driven at all.
    const res = await srv.get('/test/harness/game-settings-race.html');
    assert.equal(res.status, 200, 'localhost should still serve the harness');
  });

  await t.test('does not leak the database through a backslash or doubled slash', async () => {
    for (const p of ['/data\\users.json', '//data//users.json']) {
      const res = await srv.get(p);
      assert.equal(res.status, 404, `${p} should not be served`);
      const body = await res.text();
      assert.ok(!body.includes('password_hash'), `${p} leaked password hashes`);
    }
  });

  await t.test('gates game pages however the URL is spelled', async () => {
    // express.static runs with extensions:['html'], so all of these resolve to
    // the same file and all of them have to be gated.
    // 43-45 are Animal Run. The gate has to come from the page name, not
    // from a list somebody has to remember to update when a game is added.
    for (const p of ['/game02.html', '/game02', '/GAME02', '/Game02.HTML', '/game01-pl.html',
      '/game43.html', '/game43', '/game44.html', '/game45']) {
      const res = await srv.get(p);
      assert.equal(res.status, 302, `${p} should redirect (got ${res.status})`);
      assert.match(res.headers.get('location'), /login\.html$/, `${p} should go to login`);
    }
  });

  await t.test('gates the dashboard with and without the extension', async () => {
    for (const p of ['/dashboard.html', '/dashboard']) {
      const res = await srv.get(p);
      assert.equal(res.status, 302, `${p} should redirect`);
    }
  });

  await t.test('keeps the public site public', async () => {
    const publicPages = [
      '/', '/index.html', '/login.html', '/login', '/signup.html',
      '/privacy.html', '/terms.html', '/contact.html', '/payment-success.html',
      '/assets/auth.js', '/assets/game-engine.js', '/assets/game-engine.css',
      '/assets/switch-input.js', '/assets/runner-core.js',
      '/assets/runner-engine.js', '/assets/runner-engine.css',
    ];
    for (const p of publicPages) {
      const res = await srv.get(p);
      assert.equal(res.status, 200, `${p} should be public (got ${res.status})`);
    }
  });

  await t.test('a signed-in trial user can actually reach a game', async () => {
    // Proves the gate blocks strangers without locking out paying customers.
    await makeUser(srv, 'player@example.com');
    const login = await srv.postJson('/api/auth/login', {
      email: 'player@example.com', password: 'password123',
    });
    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('ig_session'), 'login should set a session cookie');

    const res = await srv.get('/game02.html', { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal(res.status, 200, 'a trialing user should be let into the game');
  });
});

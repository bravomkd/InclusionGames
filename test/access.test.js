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
    ];
    for (const p of mustBe404) {
      const res = await srv.get(p);
      assert.equal(res.status, 404, `${p} should not be served (got ${res.status})`);
    }
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
    for (const p of ['/game02.html', '/game02', '/GAME02', '/Game02.HTML', '/game01-pl.html']) {
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

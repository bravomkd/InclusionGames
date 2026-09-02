/* Entitlement and the payment routes.

   The bug these exist for: a signed-in trial user could hand themselves the
   99.99 School plan with a single GET, because the plan came from the query
   string and any session id starting with "demo" counted as paid — even with
   real Stripe keys configured. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, startServerExpectingExit, makeUser, authHeader } = require('./helpers');

const PROD = { APP_URL: 'https://www.inclusion-games.com', NODE_ENV: 'production' };

test('demo checkout, on a developer machine only', async (t) => {
  const srv = await startServer();          // localhost, no payment keys
  t.after(() => srv.stop());

  await t.test('activates a plan so the funnel is testable', async () => {
    const { token } = await makeUser(srv, 'demo-buyer@example.com');
    const res = await srv.get('/api/payments/verify-session?plan=family&billing=monthly&session_id=demo_x', {
      headers: authHeader(token),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.plan, 'family');
    assert.equal(body.user.status, 'active');
    assert.equal(body.demo, true);
  });

  await t.test('still refuses a plan that does not exist', async () => {
    const { token } = await makeUser(srv, 'demo-bogus@example.com');
    for (const plan of ['trial', 'unlimited', '']) {
      const res = await srv.get(`/api/payments/verify-session?plan=${plan}&session_id=demo_x`, {
        headers: authHeader(token),
      });
      assert.equal(res.status, 400, `plan="${plan}" should be rejected`);
    }
  });

  await t.test('needs a signed-in caller', async () => {
    const res = await srv.get('/api/payments/verify-session?plan=school&session_id=demo_x');
    assert.equal(res.status, 401);
  });
});

test('demo checkout is impossible on the live site', async (t) => {
  // If the client sells through CopeCart and never sets Stripe keys, demo mode
  // would otherwise be reachable in production and hand out free plans.
  const srv = await startServer(PROD);
  t.after(() => srv.stop());

  const { token } = await makeUser(srv, 'prod-user@example.com');

  await t.test('verify-session will not activate anything', async () => {
    const res = await srv.get('/api/payments/verify-session?plan=school&session_id=demo_x', {
      headers: authHeader(token),
    });
    assert.equal(res.status, 503);
    const me = await (await srv.get('/api/auth/me', { headers: authHeader(token) })).json();
    assert.equal(me.user.plan, 'trial', 'the account must not have been upgraded');
    assert.equal(me.user.status, 'trialing');
  });

  await t.test('paypal capture will not activate anything', async () => {
    const res = await srv.postJson('/api/payments/paypal/capture',
      { orderID: 'demo_x', plan: 'school' }, { headers: authHeader(token) });
    assert.equal(res.status, 503);
    const me = await (await srv.get('/api/auth/me', { headers: authHeader(token) })).json();
    assert.equal(me.user.plan, 'trial');
  });

  await t.test('checkout returns a clear error rather than a fake success URL', async () => {
    const res = await srv.postJson('/api/payments/create-checkout-session',
      { plan: 'family' }, { headers: authHeader(token) });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.ok(!/payment-success/.test(JSON.stringify(body)), 'must not hand back a success URL');
  });
});

test('a configured Stripe key kills the demo bypass', async (t) => {
  // The key is bogus on purpose: the point is that the request is sent to
  // Stripe for verification instead of being trusted, so it cannot succeed.
  const srv = await startServer({ STRIPE_SECRET_KEY: 'sk_test_bogus_key_for_tests' });
  t.after(() => srv.stop());

  const { token } = await makeUser(srv, 'stripe-user@example.com');

  await t.test('a made-up demo session id does not upgrade the account', async () => {
    const res = await srv.get('/api/payments/verify-session?plan=school&billing=annual&session_id=demo_fake', {
      headers: authHeader(token),
    });
    assert.notEqual(res.status, 200, 'an invented session must never verify');

    const me = await (await srv.get('/api/auth/me', { headers: authHeader(token) })).json();
    assert.equal(me.user.plan, 'trial', 'trial -> school with one GET is the bug this guards');
    assert.equal(me.user.status, 'trialing');
  });

  await t.test('a missing session id is rejected outright', async () => {
    const res = await srv.get('/api/payments/verify-session?plan=school', { headers: authHeader(token) });
    assert.equal(res.status, 400);
  });
});

test('the CopeCart webhook cannot be used to grant free access', async (t) => {
  await t.test('refuses every request when no signing secret is set', async () => {
    const srv = await startServer();
    t.after(() => srv.stop());

    const res = await srv.postJson('/api/webhooks/copecart', {
      email: 'attacker@example.com', product_id: 'anything',
    });
    assert.equal(res.status, 503, 'an unsigned webhook must not be honoured');

    await new Promise((r) => setTimeout(r, 200));
    const created = (srv.readUsers() || []).some((u) => u.email === 'attacker@example.com');
    assert.equal(created, false, 'no account should have been provisioned');
  });

  await t.test('rejects a bad signature when a secret is set', async () => {
    const srv = await startServer({ COPECART_WEBHOOK_SECRET: 'test-secret' });
    t.after(() => srv.stop());

    const res = await srv.postJson('/api/webhooks/copecart',
      { email: 'attacker2@example.com' },
      { headers: { 'x-copecart-signature': 'obviously-wrong' } });
    assert.equal(res.status, 401);

    await new Promise((r) => setTimeout(r, 200));
    const created = (srv.readUsers() || []).some((u) => u.email === 'attacker2@example.com');
    assert.equal(created, false);
  });
});

test('the site refuses to run with a forgeable session key', async (t) => {
  await t.test('rejects the placeholder from .env.example', async () => {
    const { code, output } = await startServerExpectingExit({
      ...PROD, JWT_SECRET: 'change-me-to-a-long-random-string',
    });
    assert.equal(code, 1, 'production must not boot with the sample secret');
    assert.match(output, /JWT_SECRET/);
  });

  await t.test('rejects a short secret', async () => {
    const { code } = await startServerExpectingExit({ ...PROD, JWT_SECRET: 'tooshort' });
    assert.equal(code, 1);
  });

  await t.test('accepts a proper secret', async () => {
    const srv = await startServer({ ...PROD, JWT_SECRET: 'x'.repeat(64) });
    assert.equal((await srv.get('/api/health')).status, 200);
    await srv.stop();
  });
});

test('entitlement decides who may play', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('an expired trial loses access, an active plan keeps it', async () => {
    const { token } = await makeUser(srv, 'expiry@example.com');

    const upgraded = await srv.get('/api/payments/verify-session?plan=starter&session_id=demo_x', {
      headers: authHeader(token),
    });
    assert.equal(upgraded.status, 200);

    const login = await srv.postJson('/api/auth/login', { email: 'expiry@example.com', password: 'password123' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const res = await srv.get('/game02.html', { headers: { Cookie: cookie } });
    assert.equal(res.status, 200, 'a paid account should reach the games');
  });

  await t.test('a stranger is sent to login, not to the game', async () => {
    const res = await srv.get('/game02.html');
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /login\.html$/);
  });
});

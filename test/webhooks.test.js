/* The CopeCart webhook hands out paid access, and creates an account when the
   buyer does not have one. Anyone who learns the URL can POST to it, so the
   signature is the only thing standing between a stranger and a free School
   plan — or a free account on somebody else's email address. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, makeUser, authHeader } = require('./helpers');

const SECRET = 'copecart-test-secret';

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('base64');
}

function post(srv, body, headers = {}) {
  return fetch(`${srv.base}/api/webhooks/copecart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

/* The provisioning runs after the response is sent, so give it a moment to
   land rather than reading the table immediately. */
async function planOf(srv, email, { within = 2000 } = {}) {
  const deadline = Date.now() + within;
  for (;;) {
    const u = (srv.readUsers() || []).find((x) => x.email === email);
    if (u && u.status === 'active') return u;
    if (Date.now() > deadline) return u || null;
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('the CopeCart webhook will not provision without a valid signature', async (t) => {
  const srv = await startServer({ COPECART_WEBHOOK_SECRET: SECRET });
  t.after(() => srv.stop());

  await makeUser(srv, 'buyer@example.com');
  const body = JSON.stringify({ email: 'buyer@example.com', event: 'payment', plan: 'school' });

  await t.test('an unsigned request is refused', async () => {
    const res = await post(srv, body);
    assert.equal(res.status, 401);
    const u = await planOf(srv, 'buyer@example.com', { within: 400 });
    assert.notEqual(u.plan, 'school', 'an unsigned webhook must not grant a plan');
  });

  await t.test('a forged signature is refused', async () => {
    const res = await post(srv, body, { 'x-copecart-signature': sign(body, 'wrong-secret') });
    assert.equal(res.status, 401);
    const u = await planOf(srv, 'buyer@example.com', { within: 400 });
    assert.notEqual(u.plan, 'school');
  });

  await t.test('a signature of the wrong length is refused, not crashed on', async () => {
    // timingSafeEqual throws on a length mismatch, so this has to be checked
    // before the comparison or the endpoint 500s on malformed input.
    for (const sig of ['', 'short', 'x'.repeat(200)]) {
      const res = await post(srv, body, { 'x-copecart-signature': sig });
      assert.equal(res.status, 401, `signature ${JSON.stringify(sig.slice(0, 12))} should be refused`);
    }
  });

  await t.test('a signature for different content is refused', async () => {
    const other = JSON.stringify({ email: 'buyer@example.com', event: 'payment', plan: 'starter' });
    const res = await post(srv, body, { 'x-copecart-signature': sign(other) });
    assert.equal(res.status, 401, 'the signature must cover the body that was sent');
  });

  await t.test('a correctly signed purchase does provision', async () => {
    const res = await post(srv, body, { 'x-copecart-signature': sign(body) });
    assert.equal(res.status, 200);
    const u = await planOf(srv, 'buyer@example.com');
    assert.equal(u.plan, 'school');
    assert.equal(u.status, 'active');
  });

  await t.test('a signed refund revokes access again', async () => {
    const refund = JSON.stringify({ email: 'buyer@example.com', event: 'refund' });
    const res = await post(srv, refund, { 'x-copecart-signature': sign(refund) });
    assert.equal(res.status, 200);
    const deadline = Date.now() + 2000;
    let u;
    do {
      u = (srv.readUsers() || []).find((x) => x.email === 'buyer@example.com');
      if (u && u.status === 'canceled') break;
      await new Promise((r) => setTimeout(r, 50));
    } while (Date.now() < deadline);
    assert.equal(u.status, 'canceled');
  });
});

test('with no webhook secret configured, the endpoint provisions nothing', async (t) => {
  // This was the live state once: no secret meant the check was skipped
  // entirely, so a POST with an email address was worth a Family plan.
  const srv = await startServer({ COPECART_WEBHOOK_SECRET: '' });
  t.after(() => srv.stop());

  await makeUser(srv, 'nosecret@example.com');
  const body = JSON.stringify({ email: 'nosecret@example.com', event: 'payment', plan: 'school' });

  for (const headers of [{}, { 'x-copecart-signature': sign(body) }]) {
    const res = await post(srv, body, headers);
    assert.equal(res.status, 503, 'an unconfigured webhook must refuse rather than trust');
  }

  const u = (srv.readUsers() || []).find((x) => x.email === 'nosecret@example.com');
  assert.notEqual(u.plan, 'school');
  assert.notEqual(u.status, 'active');
});

test('the webhook cannot be used to mint an account on an address you do not own', async (t) => {
  const srv = await startServer({ COPECART_WEBHOOK_SECRET: SECRET });
  t.after(() => srv.stop());

  const body = JSON.stringify({ email: 'victim@example.com', event: 'payment', plan: 'school' });
  const res = await post(srv, body);          // no signature
  assert.equal(res.status, 401);

  await new Promise((r) => setTimeout(r, 300));
  const u = (srv.readUsers() || []).find((x) => x.email === 'victim@example.com');
  assert.equal(u, undefined, 'no account should have been created');
});

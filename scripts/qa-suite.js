#!/usr/bin/env node
/**
 * End-to-end QA against the running server. Exercises the real API the way a
 * customer does, then cleans up after itself.
 *
 *   cd /var/www/inclusion && node scripts/qa-suite.js
 *
 * Creates one throwaway account and deletes it at the end. Payment tests stop at
 * the redirect URL — no charge is ever created.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const crypto = require('crypto');

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3003);
const PUB = 'https://inclusion-games.com';
const users = require(path.join(__dirname, '..', 'data', 'users.json'));

let pass = 0, fail = 0, warn = 0;
const fails = [];
const ok   = (l, d) => { pass++; console.log(`  ok    ${l}${d ? '  → ' + d : ''}`); };
const bad  = (l, d) => { fail++; fails.push(l + (d ? ' → ' + d : '')); console.log(`  FAIL  ${l}${d ? '  → ' + d : ''}`); };
const note = (l, d) => { warn++; console.log(`  warn  ${l}${d ? '  → ' + d : ''}`); };
const check = (l, cond, d) => cond ? ok(l, d) : bad(l, d);
const head = t => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`);

const j = async (url, opts) => {
  const r = await fetch(url, opts);
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b, headers: r.headers };
};

const TEST_EMAIL = `qa-${Date.now()}@inclusion-games.com`;
const TEST_PASS = 'QaTest!' + Math.random().toString(36).slice(2, 10);
let token = null, userId = null, sessionCookie = null;

(async () => {
  console.log(`\nInclusionGames QA — ${new Date().toISOString()}\n${BASE}`);

  // ── public pages ───────────────────────────────────────────
  head('Public pages');
  for (const p of ['/', '/index.html', '/login.html', '/signup.html', '/forgot.html',
                   '/reset.html', '/checkout.html', '/payment-success.html', '/contact.html',
                   '/privacy.html', '/terms.html', '/copecart.html', '/verify.html',
                   '/assets/i18n.js', '/assets/auth.js', '/assets/game-engine.js']) {
    const r = await fetch(PUB + p);
    check(`GET ${p}`, r.status === 200, 'HTTP ' + r.status);
  }
  for (const p of ['/.env', '/data/users.json', '/server.js', '/package.json', '/scripts/set-env.sh']) {
    const r = await fetch(PUB + p);
    check(`${p} is NOT public`, r.status === 403 || r.status === 404, 'HTTP ' + r.status);
  }

  // ── security headers ───────────────────────────────────────
  head('Security headers');
  const h = (await fetch(PUB + '/')).headers;
  check('X-Content-Type-Options', h.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options present', !!h.get('x-frame-options'));
  check('Referrer-Policy present', !!h.get('referrer-policy'));
  check('HSTS present', !!h.get('strict-transport-security'));
  check('camera allowed for the games', /camera=\(self\)/.test(h.get('permissions-policy') || ''));
  check('CSP is report-only (not enforcing)', !h.get('content-security-policy') && !!h.get('content-security-policy-report-only'));

  // ── health & payment config ────────────────────────────────
  head('Config');
  const cfg = await j(BASE + '/api/payments/config');
  check('/api/payments/config 200', cfg.status === 200);
  check('Stripe enabled', cfg.body && cfg.body.stripe === true);
  check('PayPal enabled', cfg.body && cfg.body.paypal === true);
  check('not in demo mode', cfg.body && cfg.body.demo === false);
  check('no Stripe price ids leaked', JSON.stringify(cfg.body || {}).indexOf('price_') === -1);
  if (cfg.body && cfg.body.paypalPlans) {
    const missing = Object.entries(cfg.body.paypalPlans)
      .filter(([k]) => k !== 'trial')
      .filter(([, v]) => !v.monthly || !v.annual).map(([k]) => k);
    check('all PayPal plan ids configured', missing.length === 0, missing.join(',') || 'all 4 tiers');
  }

  // ── auth ───────────────────────────────────────────────────
  head('Auth');
  let r = await j(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QA Bot', email: TEST_EMAIL, password: TEST_PASS, role: 'Parent', language: 'de' }) });
  check('register a new account', r.status >= 200 && r.status < 300, 'HTTP ' + r.status);

  r = await j(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QA Bot', email: TEST_EMAIL, password: TEST_PASS }) });
  // By design: an unverified account is refreshed and the link resent (200);
  // only an already-verified email is refused with 409.
  check('re-register of an unverified account refreshes it', r.status === 200, 'HTTP ' + r.status);

  r = await j(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', email: 'not-an-email', password: TEST_PASS }) });
  check('invalid email rejected', r.status >= 400);

  r = await j(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', email: `short-${Date.now()}@example.com`, password: '123' }) });
  check('short password rejected', r.status >= 400);

  r = await j(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: 'wrong-password' }) });
  check('wrong password rejected', r.status === 401, 'HTTP ' + r.status);

  r = await j(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS }) });
  check('login refused before email verification', r.status === 403, 'HTTP ' + r.status);

  // Walk the real verification link. saveDB() debounces 50ms, so retry the read.
  const readUsers = () => { const f = path.join(__dirname, '..', 'data', 'users.json');
    delete require.cache[require.resolve(f)]; const u = require(f);
    return Array.isArray(u) ? u : Object.values(u); };
  let me = null;
  for (let i = 0; i < 20 && !me; i++) { me = readUsers().find(x => x.email === TEST_EMAIL); if (!me) await new Promise(s => setTimeout(s, 100)); }
  check('new account persisted to disk', !!me);
  if (me && me.verify_token) {
    const vr = await fetch(`${BASE}/api/auth/verify?token=${encodeURIComponent(me.verify_token)}`, { redirect: 'manual' });
    check('verification link accepted', vr.status === 200 || vr.status === 302, 'HTTP ' + vr.status);
  } else { bad('account has a verify token'); }

  r = await j(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS }) });
  if (r.status === 200 && r.body && r.body.token) {
    token = r.body.token; userId = r.body.user && r.body.user.id;
    sessionCookie = (r.headers.get('set-cookie') || '').split(';')[0] || null;
    ok('login returns a token');
    check('login sets the ig_session page cookie', /^ig_session=/.test(sessionCookie || ''));
    check('login exposes access flag', r.body.user && typeof r.body.user.access === 'boolean');
    check('login never returns the password hash', !JSON.stringify(r.body).includes('password_hash'));
  } else {
    bad('login after verification', 'HTTP ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 80));
  }

  const AUTH = t => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + t });
  r = await j(BASE + '/api/auth/me', { headers: AUTH(token) });
  check('/auth/me with a valid token', r.status === 200, 'HTTP ' + r.status);
  r = await j(BASE + '/api/auth/me', { headers: AUTH('rubbish.token.here') });
  check('/auth/me rejects a bad token', r.status === 401, 'HTTP ' + r.status);
  r = await j(BASE + '/api/auth/me');
  check('/auth/me rejects no token', r.status === 401, 'HTTP ' + r.status);

  r = await j(BASE + '/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody-' + Date.now() + '@example.com' }) });
  check('forgot: unknown email still returns 200 (no enumeration)', r.status === 200);
  const t0 = Date.now();
  r = await j(BASE + '/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL }) });
  const dt = Date.now() - t0;
  check('forgot: known email returns 200', r.status === 200);
  if (dt > 1500) note('forgot is slow for a real address', dt + 'ms — timing reveals which emails exist');

  r = await j(BASE + '/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'made-up-token', password: 'Whatever123!' }) });
  check('reset rejects a forged token', r.status >= 400, 'HTTP ' + r.status);

  // ── entitlement gate ───────────────────────────────────────
  head('Access gate');
  for (const p of ['/dashboard.html', '/game01.html', '/games/']) {
    const rr = await fetch(PUB + p, { redirect: 'manual' });
    check(`${p} is gated`, rr.status === 302 || rr.status === 301, 'HTTP ' + rr.status);
  }

  // Regression, 2026-09-03: express.static runs with extensions:['html'], so
  // "/game02" served game02.html while the gate only matched the ".html"
  // spelling. Every game and the dashboard were free to any anonymous visitor
  // who left the extension off — the subscription was one keystroke away from
  // being bypassed. Also covers the case-insensitive spelling.
  for (const p of ['/game01', '/game02', '/game42', '/dashboard', '/GAME02', '/teacher.html', '/report.html']) {
    const rr = await fetch(PUB + p, { redirect: 'manual' });
    check(`${p} is gated (no-extension bypass)`, rr.status === 302 || rr.status === 301, 'HTTP ' + rr.status);
  }

  // The other half of the same fix: tightening the gate must not lock out the
  // people who have paid. A trial account still counts as entitled.
  if (sessionCookie) {
    for (const p of ['/game01.html', '/game01', '/dashboard.html']) {
      const rr = await fetch(PUB + p, { headers: { Cookie: sessionCookie }, redirect: 'manual' });
      check(`entitled user can still open ${p}`, rr.status === 200, 'HTTP ' + rr.status);
    }
  } else { bad('no session cookie captured — cannot test entitled access'); }

  // ── payments ───────────────────────────────────────────────
  head('Payments (no charge created)');
  for (const plan of ['starter', 'family', 'educator', 'school']) {
    for (const billing of ['monthly', 'annual']) {
      const rr = await j(BASE + '/api/payments/create-checkout-session', { method: 'POST', headers: AUTH(token),
        body: JSON.stringify({ plan, billing, waiver: true }) });
      const host = rr.body && rr.body.url ? new URL(rr.body.url).host : null;
      check(`Stripe session ${plan}/${billing}`, rr.status === 200 && host === 'checkout.stripe.com',
        host || JSON.stringify(rr.body).slice(0, 60));
    }
  }
  let rr = await j(BASE + '/api/payments/create-checkout-session', { method: 'POST', headers: AUTH(token),
    body: JSON.stringify({ plan: 'trial', billing: 'monthly' }) });
  check('Stripe refuses the trial plan', rr.status >= 400);
  rr = await j(BASE + '/api/payments/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'family', billing: 'monthly' }) });
  check('Stripe checkout needs auth', rr.status === 401);

  for (const plan of ['starter', 'family', 'educator', 'school']) {
    const pr = await j(BASE + '/api/payments/paypal/create-subscription', { method: 'POST', headers: AUTH(token),
      body: JSON.stringify({ plan, billing: 'monthly', waiver: true }) });
    const host = pr.body && pr.body.url ? new URL(pr.body.url).host : null;
    check(`PayPal subscription ${plan}/monthly`, pr.status === 200 && /paypal\.com$/.test(host || ''),
      host || JSON.stringify(pr.body).slice(0, 60));
  }

  // someone else's paid session must not activate this account
  rr = await j(BASE + '/api/payments/verify-session?plan=family&billing=monthly&session_id=cs_test_forged', { headers: AUTH(token) });
  check('verify-session refuses an unknown/foreign session', rr.status >= 400, 'HTTP ' + rr.status);

  // ── Self-activation (regression) ───────────────────────────
  // 2026-09-03: /verify-session treated any session_id beginning "demo" as a
  // completed payment and read the plan straight off the query string, so one
  // GET turned a trial into the 99.99 School plan. The same shape existed on
  // paypal/confirm. Both must now refuse, and leave the plan untouched.
  head('Self-activation is refused (regression)');
  const planBefore = (await j(BASE + '/api/auth/me', { headers: AUTH(token) })).body.user.plan;
  r = await j(BASE + '/api/payments/verify-session?plan=school&billing=annual&session_id=demo_x',
    { headers: AUTH(token) });
  check('verify-session refuses a made-up demo session', r.status >= 400, 'HTTP ' + r.status);
  r = await j(BASE + '/api/payments/paypal/confirm', { method: 'POST', headers: AUTH(token),
    body: JSON.stringify({ subscriptionId: 'demo_x', plan: 'school', billing: 'annual' }) });
  check('paypal/confirm refuses a made-up demo subscription', r.status >= 400, 'HTTP ' + r.status);
  const planAfter = (await j(BASE + '/api/auth/me', { headers: AUTH(token) })).body.user.plan;
  check('the plan is unchanged after both attempts', planAfter === planBefore,
    planBefore + ' → ' + planAfter);

  // The CopeCart webhook grants paid access. It used to skip the signature
  // check entirely when no secret was configured — which is the state this
  // server is in — so anyone who knew the URL could POST an email address and
  // be handed a plan. The address below does not exist, so nothing can be
  // granted either way; what is asserted is that the request is refused.
  {
    const cc = await fetch(BASE + '/api/webhooks/copecart', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.invalid', plan: 'school' }) });
    check('CopeCart webhook refuses an unsigned event', cc.status === 401 || cc.status === 503,
      'HTTP ' + cc.status);
  }

  // ── webhooks ───────────────────────────────────────────────
  head('Webhook signature verification');
  const body = JSON.stringify({ id: 'evt_qa', type: 'checkout.session.completed',
    data: { object: { id: 'cs_qa', client_reference_id: 'NOBODY', metadata: { userId: 'NOBODY', plan: 'family', billing: 'monthly' } } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || 'x').update(ts + '.' + body).digest('hex');
  let wr = await fetch(BASE + '/api/payments/webhook/stripe', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` }, body });
  check('Stripe webhook accepts a valid signature', wr.status === 200, 'HTTP ' + wr.status);
  wr = await fetch(BASE + '/api/payments/webhook/stripe', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${ts},v1=${'0'.repeat(64)}` }, body });
  check('Stripe webhook rejects a forged signature', wr.status === 400, 'HTTP ' + wr.status);
  wr = await fetch(BASE + '/api/payments/webhook/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  check('Stripe webhook rejects a missing signature', wr.status === 400, 'HTTP ' + wr.status);
  wr = await fetch(BASE + '/api/payments/webhook/paypal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-FORGED' } }) });
  const paypalIgnored = wr.status === 200;
  check('PayPal webhook acks but ignores an unsigned event', paypalIgnored, 'HTTP ' + wr.status);

  // ── contact ────────────────────────────────────────────────
  head('Contact form');
  rr = await j(BASE + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'question', email: 'nope', message: 'long enough message here' }) });
  check('contact rejects a bad email', rr.status === 400);
  rr = await j(BASE + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'question', email: 'a@b.de', message: 'hi' }) });
  check('contact rejects a too-short message', rr.status === 400);

  // ── cleanup ────────────────────────────────────────────────
  head('Cleanup');
  rr = await j(BASE + '/api/auth/delete-account', { method: 'POST', headers: AUTH(token), body: JSON.stringify({ password: TEST_PASS }) });
  const after = (() => { delete require.cache[require.resolve(path.join(__dirname, '..', 'data', 'users.json'))];
    const u = require(path.join(__dirname, '..', 'data', 'users.json'));
    return (Array.isArray(u) ? u : Object.values(u)).some(x => x.email === TEST_EMAIL); })();
  check('test account removed', !after, after ? 'STILL PRESENT — delete manually: ' + TEST_EMAIL : TEST_EMAIL);

  console.log(`\n${'═'.repeat(62)}\n  ${pass} passed · ${fail} failed · ${warn} warnings\n${'═'.repeat(62)}`);
  if (fails.length) { console.log('\nFailures:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  console.log('');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\nSUITE CRASHED:', e.stack); process.exit(2); });

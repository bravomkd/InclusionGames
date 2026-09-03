/* ============================================================
 * InclusionGames — backend server
 * Express + JSON-file storage + JWT auth + Stripe/PayPal + email
 * Serves the static site and exposes the /api the frontend calls.
 * Pure-JS dependencies only — no native build step required.
 * Runs with ZERO third-party keys (demo mode) so the full
 * sign-up / log-in / reset flow is testable out of the box.
 * ============================================================ */
'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

// ── Config ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const ROOT = __dirname;

// "Production" means anything that is not obviously a developer's own machine.
// Several conveniences below — demo checkout above all — are harmless on a
// laptop and dangerous on the public site, so they key off this.
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
  || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(APP_URL);

// A guessable signing key lets anyone mint a session for any account, so refuse
// to start rather than run the live site with the placeholder. The /change.?me/
// test catches the sample value in .env.example, which is long enough to pass a
// length check on its own.
if (IS_PRODUCTION && (JWT_SECRET === 'dev-insecure-secret-change-me'
    || /change[-_ ]?me/i.test(JWT_SECRET) || JWT_SECRET.length < 32)) {
  console.error('\n❌ JWT_SECRET is missing, too short, or still the placeholder.');
  console.error('   Sessions signed with it can be forged, so refusing to start.');
  console.error('   Put a long random string in .env, e.g.:');
  console.error('   JWT_SECRET=' + crypto.randomBytes(48).toString('hex') + '\n');
  process.exit(1);
}

// Shown when a live site has no payment processor configured. Demo checkout
// activates a plan without charging, which is right on a laptop and must never
// happen in production.
const PAYMENTS_UNCONFIGURED = 'Online payment is temporarily unavailable. Please contact info@inclusion-games.com and we will get you set up.';

// One Stripe account (KOKOWorlds) carries several brands — inclusion-games.com,
// kokoworlds.de, balkansofra.de. Every charge this server creates is stamped with
// these so the revenue is attributable per project. A sibling deployment just
// overrides them in its own .env.
const BRAND_ID = process.env.BRAND_ID || 'inclusion-games';
const BRAND_NAME = process.env.BRAND_NAME || 'InclusionGames';
const BRAND_SITE = process.env.BRAND_SITE || 'inclusion-games.com';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
// The installed SDK defaults to 2025-02-24.acacia, which predates Managed
// Payments ("not supported on API version …; set 2025-03-31.basil or greater").
// Pinned explicitly rather than left to the SDK default so an npm upgrade cannot
// silently move it. Responses come back in the newer shape — the webhook helpers
// read both, so that is safe. Override with STRIPE_API_VERSION if ever needed.
const stripe = STRIPE_KEY
  ? require('stripe')(STRIPE_KEY, { apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil' })
  : null;

const PAYPAL_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || '';
const PAYPAL_BASE = (process.env.PAYPAL_ENV === 'live')
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';
const paypalEnabled = !!(PAYPAL_ID && PAYPAL_SECRET);

// Plan catalogue. Prices in EUR. Keep in sync with the landing page.
const PLANS = {
  trial:    { name: '3-Day Free Trial', monthly: 0,     annual: 0 },
  starter:  { name: 'Starter Plan',     monthly: 9.99,  annual: 83.88,  stripe: process.env.STRIPE_PRICE_STARTER },
  family:   { name: 'Family Plan',      monthly: 19.99, annual: 167.88, stripe: process.env.STRIPE_PRICE_FAMILY },
  educator: { name: 'Educator Plan',    monthly: 39.99, annual: 335.88, stripe: process.env.STRIPE_PRICE_EDUCATOR },
  school:   { name: 'School Plan',      monthly: 99.99, annual: 839.88, stripe: process.env.STRIPE_PRICE_SCHOOL },
};
const TRIAL_DAYS = 3;
const COOKIE_SECURE = APP_URL.startsWith('https');

// Accounts listed here always have full access (e.g. the owner). Comma-separated in .env.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// Map CopeCart product IDs -> plan. Set these in .env once your CopeCart products exist.
const COPECART_PRODUCTS = {};
[['starter','COPECART_PRODUCT_STARTER'],['family','COPECART_PRODUCT_FAMILY'],['educator','COPECART_PRODUCT_EDUCATOR'],['school','COPECART_PRODUCT_SCHOOL']]
  .forEach(([plan, key]) => { if (process.env[key]) COPECART_PRODUCTS[String(process.env[key])] = plan; });

// ── Storage (simple JSON file — no native modules) ──────────
// For launch/testing this is plenty. To move to Postgres/MySQL
// later, only the helpers below need to change.
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'users.json');

let users = [];
try { users = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch { users = []; }

/* ── Durable writes ──────────────────────────────────────────
   The whole user table is rewritten on every change. A plain writeFileSync
   truncates the file first, so a crash, a full disk or a power cut in that
   window leaves a half-written file and every account is gone.

   Instead: write a temp file in the same directory, fsync it, then rename over
   the target. rename() is atomic on Linux, so a reader — and a crash — sees
   either the complete old file or the complete new one, never a partial one. */
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);                 // on disk before the swap, not just in cache
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);           // atomic replace
}

// How many users the last good write held — used to refuse a suspicious wipe.
let _lastGoodCount = users.length;

function persistUsers() {
  if (!Array.isArray(users)) {
    console.error('   [db] users is not an array — refusing to write');
    return;
  }
  // A bug that empties the array in memory would otherwise erase every account.
  // Deleting the genuine last user is rare enough to be worth the false positive.
  if (users.length === 0 && _lastGoodCount > 1) {
    console.error(`   [db] refusing to write 0 users over ${_lastGoodCount} — this looks like a bug`);
    return;
  }
  try {
    writeJsonAtomic(DB_FILE, users);
    _lastGoodCount = users.length;
  } catch (e) {
    console.error('   [db] write FAILED:', e.message);
  }
}

let _saveTimer = null;
function saveDB() {
  // debounce writes a touch so rapid updates don't thrash the disk
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistUsers, 50);
}
function saveNow() {
  clearTimeout(_saveTimer);           // don't let a queued write land after this one
  _saveTimer = null;
  persistUsers();
}

// Flush anything still debounced when the process is asked to stop, so a
// deploy or `pm2 restart` can't drop the last 50 ms of changes.
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
  if (_saveTimer) { clearTimeout(_saveTimer); persistUsers(); }
  process.exit(0);
}));

// One known-good snapshot per boot. If the table is ever damaged, this is a
// restore point that predates whatever went wrong in this run:
//   cp data/users.json.lkg data/users.json && pm2 restart inclusion
try {
  if (users.length) writeJsonAtomic(`${DB_FILE}.lkg`, users);
} catch (e) { console.error('   [db] boot snapshot failed:', e.message); }

function getUserByEmail(email) {
  email = (email || '').toLowerCase().trim();
  return users.find(u => u.email === email) || null;
}
function getUserById(id) { return users.find(u => u.id === id) || null; }
function getUserByField(field, val) { return users.find(u => u[field] === val) || null; }

// ── Helpers ─────────────────────────────────────────────────
const now = () => Date.now();
const days = (n) => n * 24 * 60 * 60 * 1000;
const token = (n = 32) => crypto.randomBytes(n).toString('hex');
const emailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.plan,
    billing: u.billing,
    status: u.status,
    emailVerified: !!u.email_verified,
    trialEnds: u.trial_ends,
    periodEnd: u.current_period_end || null,
    // Lets the client route a lapsed trial straight to checkout instead of
    // bouncing it off the dashboard gate.
    access: hasAccess(u),
  };
}

function signToken(u) {
  return jwt.sign(
    { sub: u.id, email: u.email, plan: u.plan, name: u.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ── Entitlement: who is allowed to play ─────────────────────
// Grace window after a failed renewal before access is cut off.
const DUNNING_DAYS = 3;

function hasAccess(u) {
  if (!u) return false;
  if (ADMIN_EMAILS.includes((u.email || '').toLowerCase())) return true;
  if (!u.email_verified) return false;
  if (u.status === 'active') {
    // A subscription that has run past its paid period no longer grants access.
    // Accounts with no current_period_end (legacy, CopeCart, manual) are unaffected.
    if (u.current_period_end && u.current_period_end < now()) return false;
    return true;
  }
  // Cancelled but still inside the period they already paid for.
  if (u.status === 'canceled' && u.current_period_end && u.current_period_end > now()) return true;
  // Renewal failed — keep them in for a few days while the provider retries.
  if (u.status === 'past_due' && u.current_period_end &&
      u.current_period_end + days(DUNNING_DAYS) > now()) return true;
  if (u.status === 'trialing' && u.trial_ends && u.trial_ends > now()) return true;
  return false;
}

// ── Cookie session (so page navigations can be gated) ───────
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function userFromSession(req) {
  try { const t = parseCookies(req).ig_session; if (!t) return null; return getUserById(jwt.verify(t, JWT_SECRET).sub) || null; }
  catch { return null; }
}
function setSession(res, u) {
  res.cookie('ig_session', signToken(u), { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
}
function clearSession(res) { res.clearCookie('ig_session', { path: '/' }); }

// Mailer: real SMTP if configured, otherwise log to console.
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
async function sendMail(to, subject, html, opts) {
  const from = process.env.MAIL_FROM || 'InclusionGames <info@inclusion-games.com>';
  const replyTo = opts && opts.replyTo;
  if (transporter) {
    // Never reject. Every caller does a bare `await sendMail(...)` inside a route
    // handler with no try/catch, and Express 4 does not catch async rejections —
    // so a bounce (bad domain, full mailbox, greylisting) left the request hanging
    // until the browser gave up. Log it and let the handler return normally.
    try {
      await transporter.sendMail(Object.assign({ from, to, subject, html }, replyTo ? { replyTo } : {}));
    } catch (e) {
      console.error('   [mail] send failed to ' + to + ': ' + ((e && e.message) || e));
    }
  } else {
    console.log('\n📧 [DEV EMAIL — no SMTP configured]');
    console.log('   To:', to);
    console.log('   Subject:', subject);
    console.log('   ' + html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('');
  }
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(t, JWT_SECRET);
    const u = getUserById(payload.sub);
    if (!u) return res.status(401).json({ error: 'Account not found' });
    req.user = u;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired' });
  }
}

// ── App ─────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

/* ── Security headers ────────────────────────────────────────
   Written directly rather than pulling in helmet: it is a handful of headers,
   and this is a server that handles payments — one less dependency in that
   path is worth more than the convenience.

   Content-Security-Policy is deliberately REPORT-ONLY. The site has ~453 inline
   onclick handlers and ~99 inline <script> blocks, so an enforcing policy would
   need 'unsafe-inline' (which gives up most of the benefit) or a real refactor.
   Report-Only puts violations in the browser console and changes nothing, so we
   can see the true shape of a future policy without breaking a live shop. */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // jsDelivr serves MediaPipe; it also needs wasm and blob workers for hand tracking
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  // where checkout is allowed to hand the browser off to
  "form-action 'self' https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // camera=(self) is load-bearing — every game needs the webcam on this origin.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self)');
  if (COOKIE_SECURE) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy-Report-Only', CSP);
  next();
});
app.use(cors({
  origin: [
    "https://www.inclusion-games.com",
    "https://inclusion-games.com",
    "https://go.inclusion-games.com"
  ],
  credentials: true
}));

// Security headers. Camera is allowed for same-origin so the games still work.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  if (COOKIE_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// Stripe webhook needs the RAW body, so register it BEFORE json parser.
app.post('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(200).send('skipped');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  // Acknowledge immediately — Stripe retries on slow responses, and every branch
  // below is idempotent, so doing the work after the ack is safe.
  res.json({ received: true });
  handleStripeEvent(event).catch(e => console.error('   [billing] stripe event', event.type, e.message));
});

const secsToMs = s => (s ? s * 1000 : null);

// Stripe moved these fields between API versions, and the webhook payload arrives
// in whatever version the endpoint is configured for — which is chosen in the
// dashboard, not here. Read both shapes so any version works.
const idOf = v => (v && typeof v === 'object' ? v.id : v) || null;

// invoice.subscription  →  invoice.parent.subscription_details.subscription
function subIdFromInvoice(inv) {
  if (!inv) return null;
  return idOf(inv.subscription) ||
         idOf(inv.parent && inv.parent.subscription_details &&
              inv.parent.subscription_details.subscription) ||
         null;
}

// subscription.current_period_end  →  subscription.items.data[].current_period_end
function periodEndOfSub(sub) {
  if (!sub) return null;
  if (sub.current_period_end) return secsToMs(sub.current_period_end);
  const items = sub.items && sub.items.data;
  if (Array.isArray(items) && items.length) {
    // Take the furthest-out item so a mixed-interval subscription is not cut short.
    const ends = items.map(i => i && i.current_period_end).filter(Boolean);
    if (ends.length) return secsToMs(Math.max.apply(null, ends));
  }
  return null;
}

async function handleStripeEvent(event) {
  const o = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = o.client_reference_id || (o.metadata && o.metadata.userId);
      const plan = o.metadata && o.metadata.plan;
      const billing = (o.metadata && o.metadata.billing) || 'monthly';
      if (!userId || !plan) return;
      const subId = idOf(o.subscription);
      let periodEnd = null;
      if (subId) {
        try {
          periodEnd = periodEndOfSub(await stripe.subscriptions.retrieve(subId));
        } catch (e) { console.error('   [billing] retrieve sub', e.message); }
      }
      activatePlan(userId, plan, billing, {
        provider: 'stripe',
        subscriptionId: subId,
        customerId: idOf(o.customer),
        periodEnd,
      });
      return;
    }

    // Renewal succeeded — push the paid-through date forward.
    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const subId = subIdFromInvoice(o);
      const line = o.lines && o.lines.data && o.lines.data[0];
      const periodEnd = secsToMs(line && line.period && line.period.end);
      if (subId) updateSubscription(subId, 'active', periodEnd);
      return;
    }

    // Card declined on renewal — grace period, then access stops.
    case 'invoice.payment_failed': {
      const subId = subIdFromInvoice(o);
      if (subId) updateSubscription(subId, 'past_due', null);
      return;
    }

    // Status changes: pauses, dunning outcomes, plan swaps.
    case 'customer.subscription.updated': {
      const map = { active: 'active', trialing: 'active', past_due: 'past_due',
                    unpaid: 'past_due', canceled: 'canceled', incomplete_expired: 'canceled' };
      const status = map[o.status];
      if (status) updateSubscription(o.id, status, periodEndOfSub(o));
      return;
    }

    // Ended for good. Access runs to the end of the period already paid for.
    case 'customer.subscription.deleted':
      updateSubscription(o.id, 'canceled', periodEndOfSub(o));
      return;

    default:
      return;
  }
}

// PayPal webhook — RAW body so the signature can be verified. BEFORE json parser.
// Without PAYPAL_WEBHOOK_ID we cannot verify authenticity, so we acknowledge but
// deliberately do nothing: acting on unverified events would let anyone grant
// themselves a paid plan by POSTing here.
app.post('/api/payments/webhook/paypal', express.raw({ type: '*/*' }), (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!paypalEnabled || !webhookId) return res.status(200).send('skipped');

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  res.status(200).send('ok');   // acknowledge fast; handlers below are idempotent

  verifyPaypalWebhook(req.headers, raw, webhookId)
    .then(ok => {
      if (!ok) { console.warn('   [billing] paypal webhook: signature NOT verified — ignored'); return; }
      let event; try { event = JSON.parse(raw); } catch { return; }
      return handlePaypalEvent(event);
    })
    .catch(e => console.error('   [billing] paypal webhook:', e.message));
});

async function verifyPaypalWebhook(headers, rawBody, webhookId) {
  // webhook_event must be byte-identical to what PayPal signed, so the raw text
  // is spliced in rather than re-serialised from a parsed object.
  const payload = '{' +
    '"auth_algo":' + JSON.stringify(headers['paypal-auth-algo'] || '') + ',' +
    '"cert_url":' + JSON.stringify(headers['paypal-cert-url'] || '') + ',' +
    '"transmission_id":' + JSON.stringify(headers['paypal-transmission-id'] || '') + ',' +
    '"transmission_sig":' + JSON.stringify(headers['paypal-transmission-sig'] || '') + ',' +
    '"transmission_time":' + JSON.stringify(headers['paypal-transmission-time'] || '') + ',' +
    '"webhook_id":' + JSON.stringify(webhookId) + ',' +
    '"webhook_event":' + rawBody +
    '}';
  const out = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST', body: payload,
  });
  return out && out.verification_status === 'SUCCESS';
}

async function handlePaypalEvent(event) {
  const r = event.resource || {};
  const type = event.event_type;

  // Renewal payment: the subscription id lives on billing_agreement_id.
  if (type === 'PAYMENT.SALE.COMPLETED') {
    const subId = r.billing_agreement_id;
    if (!subId) return;
    let periodEnd = null;
    try {
      const sub = await paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subId)}`, { method: 'GET' });
      periodEnd = sub.billing_info && sub.billing_info.next_billing_time
        ? Date.parse(sub.billing_info.next_billing_time) : null;
    } catch (e) { console.error('   [billing] paypal sub lookup:', e.message); }
    updateSubscription(subId, 'active', periodEnd);
    return;
  }

  const subId = r.id;
  if (!subId) return;
  const periodEnd = r.billing_info && r.billing_info.next_billing_time
    ? Date.parse(r.billing_info.next_billing_time) : null;

  switch (type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
    case 'BILLING.SUBSCRIPTION.UPDATED':
      updateSubscription(subId, 'active', periodEnd);
      return;
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      updateSubscription(subId, 'past_due', periodEnd);
      return;
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      updateSubscription(subId, 'canceled', periodEnd);
      return;
    default:
      return;
  }
}

// CopeCart IPN webhook — RAW body for HMAC-SHA256 signature check. BEFORE json parser.
app.post('/api/webhooks/copecart', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.COPECART_WEBHOOK_SECRET;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  // This endpoint grants paid access. Skipping the check when no secret was
  // configured meant anyone who knew the URL could POST an email address and be
  // handed a Family plan. No secret now means no provisioning, full stop.
  if (!secret) {
    console.error('copecart webhook: COPECART_WEBHOOK_SECRET is not set — refusing unverified webhook');
    return res.status(503).send('webhook not configured');
  }
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'));
  const given = Buffer.from(String(req.headers['x-copecart-signature'] || ''));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    console.warn('copecart webhook: invalid signature');
    return res.status(401).send('invalid signature');
  }
  let d = {};
  const body = raw.toString('utf8');
  try { d = JSON.parse(body); } catch { try { d = Object.fromEntries(new URLSearchParams(body)); } catch { d = {}; } }
  const email = String(d.email || d.buyer_email || d.customer_email || (d.buyer && d.buyer.email) || '').toLowerCase().trim();
  const event = String(d.event || d.event_type || d.type || d.payment_status || d.status || '').toLowerCase();
  const productId = String(d.product_id || d.productId || (d.product && (d.product.id || d.product)) || '');
  const plan = COPECART_PRODUCTS[productId] || (d.plan && PLANS[d.plan] ? d.plan : 'family');
  const billing = /year|annual|jähr/i.test(body) ? 'annual' : 'monthly';

  res.json({ ok: true }); // acknowledge immediately; provision in the background
  if (!email) return;
  if (/(refund|chargeback|charge_back|cancel|revoke|expire|denied|failed)/.test(event)) {
    const u = getUserByEmail(email);
    if (u) { u.status = 'canceled'; u.updated_at = now(); saveNow(); console.log('copecart: access revoked for', email); }
  } else {
    provisionFromCopecart(email, plan, billing).catch(e => console.error('copecart provision', e));
  }
});

app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });

// ── Plan activation ─────────────────────────────────────────
// meta: { provider:'stripe'|'paypal', subscriptionId, customerId, periodEnd }
// periodEnd is a Unix-ms timestamp; when absent the plan simply never lapses,
// which keeps pre-existing accounts (and CopeCart buyers) working as before.
function activatePlan(userId, plan, billing, meta) {
  if (!PLANS[plan]) return;
  const u = getUserById(userId);
  if (!u) return;
  meta = meta || {};
  u.plan = plan;
  u.billing = billing || 'monthly';
  u.status = 'active';
  if (meta.provider) u.billing_provider = meta.provider;
  if (meta.subscriptionId) u.subscription_id = meta.subscriptionId;
  if (meta.customerId) u.customer_id = meta.customerId;
  if (meta.periodEnd) u.current_period_end = meta.periodEnd;
  u.updated_at = now();
  saveNow();
  console.log('   [billing] activated', u.email, '→', plan, billing,
    meta.provider ? '(' + meta.provider + ')' : '',
    meta.periodEnd ? 'until ' + new Date(meta.periodEnd).toISOString() : '');
}

// Find the account behind a provider subscription id.
function getUserBySubscription(subId) {
  if (!subId) return null;
  return users.find(u => u.subscription_id === subId) || null;
}

// Apply a lifecycle change coming from a provider webhook.
// status: 'active' | 'past_due' | 'canceled'
function updateSubscription(subId, status, periodEnd) {
  const u = getUserBySubscription(subId);
  if (!u) { console.warn('   [billing] no account for subscription', subId); return; }
  u.status = status;
  if (periodEnd) u.current_period_end = periodEnd;
  if (status === 'canceled') {
    // Keep the plan name for the record; hasAccess() stops honouring it once
    // the paid period is over, so a cancellation still runs to term.
    u.canceled_at = now();
  }
  u.updated_at = now();
  saveNow();
  console.log('   [billing]', u.email, 'subscription', subId, '→', status);
}

// Create or upgrade a buyer's account from a CopeCart purchase, then email them
// a link to set their password. No password is needed to buy.
async function provisionFromCopecart(email, plan, billing) {
  email = (email || '').toLowerCase().trim();
  if (!emailValid(email) || !PLANS[plan]) return;
  const t = now();
  let u = getUserByEmail(email);
  let setTok;
  if (!u) {
    setTok = token();
    u = {
      id: crypto.randomUUID(), name: '', email,
      password_hash: await bcrypt.hash(token(12), 10), // random; user sets their own via the link
      email_verified: 1, verify_token: null,
      reset_token: setTok, reset_expires: t + days(7),
      plan, billing: billing || 'monthly', status: 'active',
      trial_ends: null, created_at: t, updated_at: t,
    };
    users.push(u);
    console.log('copecart: created account for', email, '→', plan);
  } else {
    u.plan = plan; u.billing = billing || 'monthly'; u.status = 'active'; u.email_verified = 1; u.updated_at = t;
    setTok = u.reset_token || token();
    u.reset_token = setTok; u.reset_expires = t + days(7);
    console.log('copecart: upgraded', email, '→', plan);
  }
  saveNow();
  const link = `${APP_URL}/reset.html?token=${setTok}`;
  await sendMail(email, 'Welcome to InclusionGames — set your password',
    `<p>Thank you for your purchase! Your <b>${(PLANS[plan] || {}).name || plan}</b> access is now active.</p>
     <p>Set your password to start playing:</p>
     <p><a href="${link}">${link}</a></p>
     <p>Then sign in any time at <a href="${APP_URL}/login.html">${APP_URL}/login.html</a>. Have fun! 🎈</p>`);
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════
const auth = express.Router();
auth.use(authLimiter);

auth.post('/register', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').toLowerCase().trim();
    const password = req.body.password || '';
    if (!emailValid(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const existing = getUserByEmail(email);
    if (existing && existing.email_verified)
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });

    const hash = await bcrypt.hash(password, 10);
    const t = now();
    let user = existing;
    if (user) {
      // Account exists but was never verified — refresh it and resend the link.
      user.name = name || user.name;
      user.password_hash = hash;
      user.verify_token = token();
      user.updated_at = t;
    } else {
      user = {
        id: crypto.randomUUID(),
        name, email,
        password_hash: hash,
        email_verified: 0,
        verify_token: token(),
        reset_token: null, reset_expires: null,
        plan: 'trial', billing: null, status: 'trialing',
        trial_ends: t + days(TRIAL_DAYS),
        created_at: t, updated_at: t,
      };
      users.push(user);
    }
    saveNow();

    const link = `${APP_URL}/verify.html?token=${user.verify_token}`;
    try {
      await sendMail(email, 'Verify your InclusionGames account',
        `<p>Welcome to InclusionGames! Please confirm your email to start your free ${TRIAL_DAYS}-day trial:</p>
         <p><a href="${link}">${link}</a></p>`);
    } catch (mailErr) {
      // Account is created; don't fail signup just because the email couldn't be sent.
      console.error('register: verification email failed:', (mailErr && mailErr.response) || mailErr);
      return res.json({ ok: true, emailSent: false, message: 'Account created, but the verification email could not be sent. Please double-check your email address, or contact support.' });
    }

    return res.json({ ok: true, emailSent: true, message: 'Account created. Check your email to verify and start your trial.' });
  } catch (e) {
    console.error('register', e);
    return res.status(500).json({ error: 'Could not create account. Please try again.' });
  }
});

auth.get('/verify', (req, res) => {
  const t = req.query.token;
  if (!t) return res.status(400).json({ ok: false, error: 'Missing token.' });
  const u = getUserByField('verify_token', t);
  if (!u) return res.status(400).json({ ok: false, error: 'Invalid or expired verification link.' });
  u.email_verified = 1;
  u.verify_token = null;
  u.updated_at = now();
  saveNow();
  return res.json({ ok: true, message: 'Email verified. You can now sign in.' });
});

auth.post('/login', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const password = req.body.password || '';
  const u = getUserByEmail(email);
  if (!u) return res.status(401).json({ error: 'Invalid login credentials' });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid login credentials' });
  if (!u.email_verified && !ADMIN_EMAILS.includes(email))
    return res.status(403).json({ error: 'Please verify your email first — check your inbox for the confirmation link.' });
  setSession(res, u);
  return res.json({ token: signToken(u), user: publicUser(u) });
});

auth.post('/forgot', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const u = getUserByEmail(email);
  // Always respond 200 so we don't leak which emails exist.
  if (u) {
    u.reset_token = token();
    u.reset_expires = now() + days(1);
    u.updated_at = now();
    saveNow();
    const link = `${APP_URL}/reset.html?token=${u.reset_token}`;
    await sendMail(email, 'Reset your InclusionGames password',
      `<p>We received a request to reset your password. This link is valid for 24 hours:</p>
       <p><a href="${link}">${link}</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`);
  }
  return res.json({ ok: true });
});

auth.post('/reset', async (req, res) => {
  const t = req.body.token;
  const password = req.body.password || '';
  if (!t) return res.status(400).json({ error: 'Missing reset token.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const u = getUserByField('reset_token', t);
  if (!u || !u.reset_expires || u.reset_expires < now())
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  u.password_hash = await bcrypt.hash(password, 10);
  u.reset_token = null;
  u.reset_expires = null;
  u.updated_at = now();
  saveNow();
  return res.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

auth.get('/me', authMiddleware, (req, res) => res.json({ user: publicUser(req.user) }));

auth.post('/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

auth.post('/change-password', authMiddleware, async (req, res) => {
  const cur = req.body.currentPassword || '';
  const next = req.body.newPassword || '';
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const ok = await bcrypt.compare(cur, req.user.password_hash);
  if (!ok) return res.status(403).json({ error: 'Your current password is incorrect.' });
  req.user.password_hash = await bcrypt.hash(next, 10);
  req.user.updated_at = now();
  saveNow();
  res.json({ ok: true, message: 'Password updated.' });
});

// GDPR: permanently delete the account and all its data.
auth.post('/delete-account', authMiddleware, async (req, res) => {
  const pw = req.body.password || '';
  const ok = await bcrypt.compare(pw, req.user.password_hash);
  if (!ok) return res.status(403).json({ error: 'Password is incorrect.' });
  const idx = users.findIndex(u => u.id === req.user.id);
  if (idx > -1) { users.splice(idx, 1); saveNow(); }
  clearSession(res);
  res.json({ ok: true, message: 'Your account and data have been deleted.' });
});

app.use('/api/auth', auth);

// ═══════════════════════════════════════════════════════════
//  CHILDREN ROUTES  (per-pupil profiles, single-owner)
//  Children live on the user object: req.user.children = [...]
//  Scoped to the authenticated owner. Reuses saveNow().
// ═══════════════════════════════════════════════════════════
const children = express.Router();

function ensureChildren(u) {
  if (!Array.isArray(u.children)) u.children = [];
  // Seed a demo child once, for presentations/explaining.
  if (u.children.length === 0 && !u._demo_seeded) {
    u.children.push({
      id: token(8),
      name: 'Demo-Kind',
      note: 'Beispielprofil zum Zeigen und Erklären.',
      is_demo: true,
      settings: {},
      progress: [],
      created_at: now(),
      updated_at: now()
    });
    u._demo_seeded = true;
    saveNow();
  }
  return u.children;
}

function publicChild(c) {
  return {
    id: c.id, name: c.name, note: c.note || '', is_demo: !!c.is_demo,
    games_customized: Object.keys(c.settings || {}).length,
    plays: (c.progress || []).length,
    created_at: c.created_at, updated_at: c.updated_at
  };
}

// List my children
children.get('/', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  res.json({ children: list.map(publicChild) });
});

// Add a child
children.post('/', authMiddleware, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (name.length > 60) return res.status(400).json({ error: 'Name too long.' });
  const list = ensureChildren(req.user);
  if (list.length >= 200) return res.status(400).json({ error: 'Too many children on this account.' });
  const child = {
    id: token(8),
    name,
    note: (req.body.note || '').trim().slice(0, 500),
    is_demo: false,
    settings: {},
    progress: [],
    created_at: now(),
    updated_at: now()
  };
  list.push(child);
  saveNow();
  res.json({ child: publicChild(child) });
});

// Get one child (full: settings + recent progress)
children.get('/:id', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  res.json({ child: { ...publicChild(c), settings: c.settings || {}, progress: (c.progress || []).slice(-100) } });
});

// Edit a child (name / note)
children.patch('/:id', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  if (typeof req.body.name === 'string') {
    const n = req.body.name.trim();
    if (!n) return res.status(400).json({ error: 'Name cannot be empty.' });
    c.name = n.slice(0, 60);
  }
  if (typeof req.body.note === 'string') c.note = req.body.note.trim().slice(0, 500);
  c.updated_at = now();
  saveNow();
  res.json({ child: publicChild(c) });
});

// Remove a child
children.delete('/:id', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const idx = list.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Child not found.' });
  list.splice(idx, 1);
  saveNow();
  res.json({ ok: true });
});


// --- Per-(child, game) settings: the customization payload ---
const VALID_GAME = /^game\d{1,3}$/;

function sanitizeSettings(body) {
  const s = {};
  // disabled: array of string keys
  s.disabled = Array.isArray(body.disabled)
    ? body.disabled.filter(x => typeof x === 'string').slice(0, 500).map(x => x.slice(0, 120))
    : [];
  // custom: array of {emoji,en,de,pl,es} (+ optional level)
  s.custom = Array.isArray(body.custom)
    ? body.custom.slice(0, 200).map(it => ({
        emoji: String(it.emoji || '').slice(0, 16),
        en: String(it.en || '').slice(0, 60),
        de: String(it.de || '').slice(0, 60),
        pl: String(it.pl || '').slice(0, 60),
        es: String(it.es || '').slice(0, 60),
        level: Number.isFinite(+it.level) ? Math.max(1, Math.min(9, +it.level)) : 1
      })).filter(it => it.en || it.de || it.pl || it.es || it.emoji)
    : [];
  // level / count
  s.level = Number.isFinite(+body.level) ? Math.max(1, Math.min(9, +body.level)) : null;
  s.count = Number.isFinite(+body.count) ? Math.max(1, Math.min(50, +body.count)) : null;
  // math difficulty tier: 'gentle' | '' (normal) | 'challenge'
  s.mathLevel = (['gentle','','challenge'].indexOf(body.mathLevel) >= 0) ? body.mathLevel : null;
  // mathRange: {max, ops:[]} for procedural-math games
  if (body.mathRange && typeof body.mathRange === 'object') {
    s.mathRange = {
      max: Number.isFinite(+body.mathRange.max) ? Math.max(1, Math.min(1000, +body.mathRange.max)) : null,
      ops: Array.isArray(body.mathRange.ops) ? body.mathRange.ops.filter(o => ['+','-','*','/'].includes(o)) : []
    };
  } else {
    s.mathRange = null;
  }
  return s;
}

// Get settings for one child + one game
children.get('/:id/settings/:game', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  if (!VALID_GAME.test(req.params.game)) return res.status(400).json({ error: 'Bad game id.' });
  const s = (c.settings && c.settings[req.params.game]) || null;
  res.json({ game: req.params.game, settings: s });
});

// Save settings for one child + one game
children.put('/:id/settings/:game', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  if (!VALID_GAME.test(req.params.game)) return res.status(400).json({ error: 'Bad game id.' });
  if (!c.settings) c.settings = {};
  const clean = sanitizeSettings(req.body || {});
  // If everything is empty/default, remove the override entirely (keeps data tidy).
  const isEmpty = clean.disabled.length === 0 && clean.custom.length === 0 &&
                  clean.level == null && clean.count == null && !clean.mathRange && clean.mathLevel == null;
  if (isEmpty) { delete c.settings[req.params.game]; }
  else { c.settings[req.params.game] = clean; }
  c.updated_at = now();
  saveNow();
  res.json({ game: req.params.game, settings: c.settings[req.params.game] || null });
});


// ═══════════════════════════════════════════════════════════
//  ITEM COMPLETER  — type a word, get {emoji,en,de,pl,es}
//  Library-first (instant, free). AI fallback wired later.
// ═══════════════════════════════════════════════════════════
let ITEM_LIB = {};
try { ITEM_LIB = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'item-library.json'), 'utf8')); }
catch { ITEM_LIB = {}; }
console.log('   Item library: ' + Object.keys(ITEM_LIB).length + ' keys loaded.');

const completeLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

app.get('/api/complete-item', authMiddleware, completeLimiter, async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'Query required.' });
  if (q.length > 60) return res.status(400).json({ error: 'Query too long.' });
  const hit = ITEM_LIB[q];
  if (hit) return res.json({ found: true, source: 'library', item: hit });

  // Library miss — ask Claude Haiku for the item, then cache it.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ found: false, source: 'none', item: null });

  try {
    const prompt = 'Give the single best representative emoji and the translations for this word, for a children\'s learning game. Word: "' + req.query.q + '". Respond with ONLY a JSON object, no other text, no markdown, in exactly this shape: {"emoji":"","en":"","de":"","pl":"","es":""}. The emoji must be a single emoji that visually represents the word. Each language field is the word translated into that language (en=English, de=German, pl=Polish, es=Spanish).';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!aiRes.ok) { console.log('complete-item AI HTTP ' + aiRes.status); return res.json({ found: false, source: 'ai_error', item: null }); }
    const data = await aiRes.json();
    let text = (data.content && data.content[0] && data.content[0].text) || '';
    text = text.replace(/```json|```/g, '').trim();
    let item;
    try { item = JSON.parse(text); } catch { return res.json({ found: false, source: 'ai_parse', item: null }); }
    // validate
    item = {
      emoji: String(item.emoji || '').slice(0, 16),
      en: String(item.en || '').slice(0, 60),
      de: String(item.de || '').slice(0, 60),
      pl: String(item.pl || '').slice(0, 60),
      es: String(item.es || '').slice(0, 60)
    };
    if (!item.emoji || !(item.en || item.de || item.pl || item.es)) {
      return res.json({ found: false, source: 'ai_invalid', item: null });
    }
    // cache: index by every language name, persist to disk
    [item.en, item.de, item.pl, item.es].forEach(k => { if (k) ITEM_LIB[k.toLowerCase().trim()] = item; });
    // Same atomic swap — this file self-grows via the AI cache and a torn write
    // would take the whole library with it.
    try { writeJsonAtomic(path.join(DATA_DIR, 'item-library.json'), ITEM_LIB); } catch (e) {}
    return res.json({ found: true, source: 'ai', item });
  } catch (e) {
    console.log('complete-item AI error: ' + e.message);
    return res.json({ found: false, source: 'ai_timeout', item: null });
  }
});


// --- Read-only game content (from the dumped content-index.json) ---
let CONTENT_INDEX = {};
// Lives in data/ — the old /root/content-index.json primary never existed on this
// host, so every start was silently falling through to this same file.
try { CONTENT_INDEX = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'content-index.json'),'utf8')); }
catch { CONTENT_INDEX = {}; }
console.log('   Game content index: ' + Object.keys(CONTENT_INDEX).length + ' games.');

// Extract sentence-style content (game05): the SENT array per language.
const SENTENCE_CONTENT = (function(){
  try {
    const vm = require('vm');
    const html = fs.readFileSync(path.join(ROOT,'game05.html'),'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
    const box = { IG_GAME:function(){}, console:{log(){},warn(){},error(){}}, Math, Date, JSON, setInterval:()=>0, setTimeout:()=>0, clearInterval(){}, requestAnimationFrame:()=>0, navigator:{mediaDevices:{getUserMedia(){return Promise.reject();}}}, localStorage:{getItem:()=>null,setItem(){}} };
    box.window=box; box.document={documentElement:{},body:{},head:{appendChild(){}},createElement(){return {style:{},appendChild(){},play(){},getContext(){return {};}};},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}}; box.addEventListener=function(){};
    vm.createContext(box); vm.runInContext(scripts + '\n; this.__SENT = (typeof SENT!=="undefined")?SENT:null;', box, {timeout:3000});
    return box.__SENT || {};
  } catch(e){ console.log('SENT extract failed: '+e.message); return {}; }
})();

app.get('/api/game-content-sentences/:game', authMiddleware, (req, res) => {
  if (req.params.game !== 'game05') return res.status(404).json({ error: 'No sentence content.' });
  res.json({ game:'game05', sentences: SENTENCE_CONTENT });
});

app.get('/api/game-content/:game', authMiddleware, (req, res) => {
  if (!/^game\d{1,3}$/.test(req.params.game)) return res.status(400).json({ error: 'Bad game id.' });
  const g = CONTENT_INDEX[req.params.game];
  if (!g || g.error) return res.status(404).json({ error: 'No content for this game.' });
  res.json({ game: req.params.game, tag: g.tag || '', langs: g.langs || {} });
});


// --- Record a play result to a child's progress history ---
children.post('/:id/progress', authMiddleware, (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  const b = req.body || {};
  if (!/^game\d{1,3}$/.test(String(b.game || ''))) return res.status(400).json({ error: 'Bad game id.' });
  if (!Array.isArray(c.progress)) c.progress = [];
  const rec = {
    game: String(b.game),
    score: Math.max(0, Math.min(9999, parseInt(b.score) || 0)),
    total: Math.max(0, Math.min(9999, parseInt(b.total) || 0)),
    timeMs: Math.max(0, Math.min(36000000, parseInt(b.timeMs) || 0)),
    lang: ['en','de','pl','es'].indexOf(b.lang) >= 0 ? b.lang : '',
    at: now()
  };
  c.progress.push(rec);
  if (c.progress.length > 1000) c.progress = c.progress.slice(-1000);
  c.updated_at = now();
  saveNow();
  res.json({ ok: true });
});

// --- Förderbericht PDF: a one-page progress report for a child ---

// --- Progress reports: on-screen analytics, PDF, and email to a guardian ---
const analytics = require('./lib/analytics.js');
const reportPdf = require('./lib/report-pdf.js');

const REPORT_RANGES = { 7: 7, 30: 30, 90: 90, 365: 365 };

function reportFor(child, query) {
  const rangeDays = REPORT_RANGES[String(query.range)] || null; // anything else = all time
  return analytics.buildReport(child, { rangeDays });
}

function findChild(req) {
  return ensureChildren(req.user).find((x) => x.id === req.params.id) || null;
}

function reportLang(req) {
  const l = String(req.query.lang || (req.body && req.body.lang) || '').toLowerCase();
  return reportPdf.LANGS.indexOf(l) >= 0 ? l : 'en';
}

// Everything the Reports page draws, in one call.
children.get('/:id/analytics', authMiddleware, (req, res) => {
  const c = findChild(req);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  res.json({ report: reportFor(c, req.query), lastSentTo: c.last_report_sent_to || null });
});

children.get('/:id/report.pdf', authMiddleware, async (req, res) => {
  const c = findChild(req);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  try {
    const report = reportFor(c, req.query);
    const { bytes, fileName } = await reportPdf.renderReport(report, {
      lang: reportLang(req),
      carer: req.user.name || req.user.email || '',
    });
    // "download" forces a save dialog; the default opens it in the viewer.
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition + '; filename="' + fileName + '"');
    res.send(Buffer.from(bytes));
  } catch (e) {
    console.error('report.pdf', e);
    res.status(500).json({ error: 'Could not generate the report.' });
  }
});

/* Email the report to a parent or guardian with the PDF attached.
   Rate-limited: it sends mail to an address supplied in the request. */
const reportSendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

children.post('/:id/report/send', authMiddleware, reportSendLimiter, async (req, res) => {
  const c = findChild(req);
  if (!c) return res.status(404).json({ error: 'Child not found.' });

  const to = String(req.body.to || '').trim();
  if (!emailValid(to)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!transporter) {
    return res.status(503).json({ error: 'Email is not set up on this server, so the report cannot be sent from here. You can still download the PDF and attach it yourself.' });
  }

  const lang = reportLang(req);
  const note = String(req.body.note || '').slice(0, 1000);
  const senderName = req.user.name || req.user.email || 'InclusionGames';
  const childName = c.name || 'your child';

  try {
    const report = reportFor(c, req.query);
    const { bytes, fileName } = await reportPdf.renderReport(report, { lang, carer: senderName });

    const subjects = {
      en: 'Progress report for ' + childName,
      de: 'Foerderbericht fuer ' + childName,
      pl: 'Raport postepow: ' + childName,
      es: 'Informe de progreso de ' + childName,
    };
    const intros = {
      en: '<p>Hello,</p><p>Here is the latest InclusionGames progress report for <b>' + esc(childName) + '</b>, sent by ' + esc(senderName) + '.</p>',
      de: '<p>Hallo,</p><p>anbei der aktuelle InclusionGames-Bericht f&uuml;r <b>' + esc(childName) + '</b>, gesendet von ' + esc(senderName) + '.</p>',
      pl: '<p>Dzie&#324; dobry,</p><p>W za&#322;&#261;czeniu raport post&#281;p&oacute;w InclusionGames dla <b>' + esc(childName) + '</b>, wys&#322;any przez ' + esc(senderName) + '.</p>',
      es: '<p>Hola:</p><p>Adjunto el informe de progreso de InclusionGames de <b>' + esc(childName) + '</b>, enviado por ' + esc(senderName) + '.</p>',
    };

    const o = report.overview;
    const summary = o.sessions
      ? '<ul><li>Sessions: ' + o.sessions + '</li><li>Accuracy: ' + (o.accuracy == null ? '-' : o.accuracy + '%') + '</li><li>Play time: ' + Math.round((o.timeMs || 0) / 60000) + ' min</li></ul>'
      : '';

    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'InclusionGames <info@inclusion-games.com>',
      to,
      replyTo: req.user.email,
      subject: subjects[lang] || subjects.en,
      html: (intros[lang] || intros.en) + summary
        + (note ? '<p>' + esc(note).replace(/\n/g, '<br>') + '</p>' : '')
        + '<p style="color:#888;font-size:12px">Hand tracking runs entirely in the child\'s browser. No video or biometric data is transmitted or stored.</p>',
      attachments: [{ filename: fileName, content: Buffer.from(bytes), contentType: 'application/pdf' }],
    });

    // Remember where it went, so the page can offer the same address next time.
    c.last_report_sent_to = to;
    c.last_report_sent_at = now();
    c.updated_at = now();
    saveNow();

    res.json({ ok: true, message: 'Report sent to ' + to + '.' });
  } catch (e) {
    console.error('report/send', e);
    res.status(500).json({ error: 'Could not send the report. Please try again.' });
  }
});

app.use('/api/children', children);


// ═══════════════════════════════════════════════════════════
//  PAYMENT ROUTES  (Stripe card + PayPal; CopeCart added later)
// ═══════════════════════════════════════════════════════════
const pay = express.Router();

app.get('/api/payments/config', (req, res) => {
  // Public prices only — never echo Stripe Price ids or the PayPal client id.
  const plans = {};
  Object.keys(PLANS).forEach(k => {
    plans[k] = { name: PLANS[k].name, monthly: PLANS[k].monthly, annual: PLANS[k].annual };
  });
  // PayPal can only take a given plan if its Billing Plan id is configured.
  const paypalPlans = {};
  Object.keys(PLANS).forEach(k => {
    paypalPlans[k] = {
      monthly: !!paypalPlanId(k, 'monthly'),
      annual: !!paypalPlanId(k, 'annual'),
    };
  });
  res.json({
    stripe: !!stripe,
    paypal: paypalEnabled,
    paypalPlans: paypalEnabled ? paypalPlans : null,
    plans,
    demo: !stripe && !paypalEnabled,
  });
});

// Stripe Checkout — returns a URL the browser redirects to.
pay.post('/create-checkout-session', authMiddleware, async (req, res) => {
  const plan = req.body.plan;
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ error: 'Invalid plan.' });

  // Record the customer's express withdrawal-waiver consent (legal proof, § 356(5) BGB).
  if (req.body.waiver) {
    req.user.waiver_at = now();
    req.user.waiver_ip = req.ip;
    req.user.updated_at = now();
    saveNow();
  }

  // DEMO MODE: no Stripe key — simulate a successful checkout return.
  if (!stripe) {
    return res.json({
      url: `${APP_URL}/payment-success.html?demo=1&plan=${plan}&billing=${billing}&session_id=demo_${token(8)}`,
      demo: true,
    });
  }

  try {
    const priceId = PLANS[plan].stripe;
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: 'eur',
            recurring: { interval: billing === 'annual' ? 'year' : 'month' },
            unit_amount: Math.round((billing === 'annual' ? PLANS[plan].annual : PLANS[plan].monthly) * 100),
            product_data: {
              name: `InclusionGames — ${PLANS[plan].name}`,
              // Managed Payments refuses a line item with no tax code. Default is
              // the general "electronically supplied services" code, which fits a
              // browser-delivered subscription. Confirm with your tax adviser and
              // override with STRIPE_TAX_CODE if they prefer a different one.
              // https://docs.stripe.com/tax/tax-codes
              tax_code: process.env.STRIPE_TAX_CODE || 'txcd_10000000',
            },
          },
        };
    // Managed Payments (on by default for new accounts) owns payment methods and
    // tax. It rejects payment_method_types outright, and requires automatic_tax
    // to be true or absent — so both are simply left out. Upside: which methods
    // appear (card, SEPA Lastschrift, …) is now a dashboard setting, and Stripe
    // calculates EU VAT for us.
    const params = {
      mode: 'subscription',
      line_items: [lineItem],
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      billing_address_collection: 'required',
      metadata: {
        brand: BRAND_ID, site: BRAND_SITE,
        userId: req.user.id, plan, billing, waiver: req.body.waiver ? '1' : '0',
      },
      // Every brand on the KOKOWorlds account shares one Stripe balance, so tag
      // the subscription itself — not just the checkout session. Subscriptions,
      // their invoices and every renewal then carry the brand, which is what
      // makes per-project reporting and the accountant's split possible.
      subscription_data: {
        description: `${BRAND_NAME} — ${PLANS[plan].name}`,
        metadata: { brand: BRAND_ID, site: BRAND_SITE, userId: req.user.id, plan, billing },
      },
      success_url: `${APP_URL}/payment-success.html?method=stripe&plan=${plan}&billing=${billing}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/index.html#pricing`,
    };
    // Only ever send automatic_tax to turn it ON. Sending {enabled:false} is a
    // hard error under Managed Payments.
    if (process.env.STRIPE_TAX) params.automatic_tax = { enabled: true };

    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (e) {
    console.error('stripe checkout', e);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Verify a returned Stripe session and upgrade the account.
pay.get('/verify-session', authMiddleware, async (req, res) => {
  const sessionId = req.query.session_id;

  // Demo activation exists for a machine with no Stripe key at all. It used to
  // also fire for any session_id beginning "demo", and that clause stayed live
  // once real keys were configured — so a signed-in user could award themselves
  // the 99.99 School plan with a single GET. It is now unreachable in production.
  if (!stripe) {
    if (IS_PRODUCTION) return res.status(503).json({ ok: false, error: PAYMENTS_UNCONFIGURED });
    const p = PLANS[req.query.plan] && req.query.plan !== 'trial' ? req.query.plan : null;
    if (!p) return res.status(400).json({ ok: false, error: 'Invalid plan.' });
    activatePlan(req.user.id, p, req.query.billing === 'annual' ? 'annual' : 'monthly');
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: true });
  }
  if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing session id.' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // The session must belong to the caller. session_id travels in the return
    // URL, so without this check anyone holding any paid session id could
    // activate their own account from someone else's payment.
    const owner = session.client_reference_id || (session.metadata && session.metadata.userId);
    if (owner && owner !== req.user.id) {
      console.warn('   [billing] verify-session: session owner mismatch — refused');
      return res.status(403).json({ ok: false, error: 'This payment belongs to another account.' });
    }
    if (!owner) {
      console.warn('   [billing] verify-session: session has no owner reference — refused');
      return res.status(403).json({ ok: false, error: 'Could not confirm this payment belongs to you.' });
    }

    // What was bought is read back from the session Stripe recorded at
    // creation — never from the return URL. Otherwise a genuine 9.99 Starter
    // payment could be redeemed as the 99.99 School plan by editing one query
    // parameter, and the ownership check above would happily allow it because
    // the session really is the caller's.
    const md = session.metadata || {};
    const plan = PLANS[md.plan] && md.plan !== 'trial' ? md.plan : null;
    const billing = md.billing === 'annual' ? 'annual' : 'monthly';
    if (!plan) {
      console.warn('   [billing] verify-session: session carries no usable plan metadata — refused');
      return res.status(409).json({ ok: false, error: 'Could not determine which plan was purchased. Please contact support.' });
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Record the same metadata the webhook would. This path usually wins the
      // race against the webhook, and without the subscription id the account
      // can never be matched to later renewal or cancellation events — the
      // subscription would be orphaned and access would never lapse.
      const subId = idOf(session.subscription);
      let periodEnd = null;
      if (subId) {
        try {
          periodEnd = periodEndOfSub(await stripe.subscriptions.retrieve(subId));
        } catch (e) { console.error('   [billing] verify-session retrieve sub:', e.message); }
      }
      activatePlan(req.user.id, plan, billing, {
        provider: 'stripe',
        subscriptionId: subId,
        customerId: idOf(session.customer),
        periodEnd,
      });
      const u = getUserById(req.user.id);
      return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
    }
    res.status(402).json({ ok: false, error: 'Payment not completed.' });
  } catch (e) {
    console.error('verify-session', e);
    res.status(500).json({ ok: false, error: 'Could not verify payment.' });
  }
});

// ── PayPal ──────────────────────────────────────────────────
async function paypalToken() {
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${PAYPAL_ID}:${PAYPAL_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('PayPal auth failed: ' + JSON.stringify(d).slice(0, 200));
  return d.access_token;
}

// Small JSON helper so every PayPal call surfaces API errors instead of
// silently returning undefined fields.
async function paypalFetch(pathname, opts) {
  const at = await paypalToken();
  const r = await fetch(`${PAYPAL_BASE}${pathname}`, Object.assign({}, opts, {
    headers: Object.assign({
      Authorization: `Bearer ${at}`,
      'Content-Type': 'application/json',
    }, (opts && opts.headers) || {}),
  }));
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`PayPal ${r.status} on ${pathname}: ` +
      JSON.stringify(body && (body.details || body.message || body)).slice(0, 300));
    err.status = r.status;
    throw err;
  }
  return body;
}

// Billing Plan ids come from the PayPal dashboard (or scripts/paypal-setup.js).
// One per plan × billing period, e.g. PAYPAL_PLAN_FAMILY_MONTHLY.
function paypalPlanId(plan, billing) {
  return process.env[`PAYPAL_PLAN_${plan.toUpperCase()}_${billing.toUpperCase()}`] || '';
}

// Start a recurring PayPal subscription. Returns the approval URL the browser
// must be sent to; PayPal returns the buyer to payment-success.html afterwards.
pay.post('/paypal/create-subscription', authMiddleware, async (req, res) => {
  const plan = req.body.plan;
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ error: 'Invalid plan.' });

  // DEMO MODE: no PayPal credentials — return straight to the success page.
  if (!paypalEnabled) {
    return res.json({
      id: `demo_${token(8)}`,
      demo: true,
      url: `${APP_URL}/payment-success.html?method=paypal&plan=${plan}&billing=${billing}&subscription_id=demo_${token(8)}`,
    });
  }

  const planId = paypalPlanId(plan, billing);
  if (!planId) {
    console.error(`   [billing] missing PAYPAL_PLAN_${plan.toUpperCase()}_${billing.toUpperCase()}`);
    return res.status(503).json({ error: 'PayPal is not available for this plan yet.' });
  }

  try {
    const sub = await paypalFetch('/v1/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        custom_id: `${req.user.id}|${plan}|${billing}`,
        subscriber: { email_address: req.user.email },
        application_context: {
          brand_name: 'InclusionGames',
          locale: 'de-DE',
          user_action: 'SUBSCRIBE_NOW',
          shipping_preference: 'NO_SHIPPING',
          payment_method: { payer_selected: 'PAYPAL', payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED' },
          return_url: `${APP_URL}/payment-success.html?method=paypal&plan=${plan}&billing=${billing}`,
          cancel_url: `${APP_URL}/checkout.html?plan=${plan}&billing=${billing}&cancelled=1`,
        },
      }),
    });
    const approve = (sub.links || []).find(l => l.rel === 'approve');
    if (!approve) throw new Error('no approve link in PayPal response');
    res.json({ id: sub.id, url: approve.href });
  } catch (e) {
    console.error('   [billing] paypal create-subscription:', e.message);
    res.status(500).json({ error: 'Could not start PayPal checkout.' });
  }
});

// Called by payment-success.html with the subscription_id PayPal appended to
// the return URL. Confirms with PayPal directly — never trusts the query string.
pay.post('/paypal/confirm', authMiddleware, async (req, res) => {
  const subscriptionId = req.body.subscriptionId || req.body.orderID;

  // Same story as Stripe: the "demo" prefix used to bypass PayPal entirely even
  // with live credentials in place.
  if (!paypalEnabled) {
    if (IS_PRODUCTION) return res.status(503).json({ ok: false, error: PAYMENTS_UNCONFIGURED });
    const p = PLANS[req.body.plan] && req.body.plan !== 'trial' ? req.body.plan : null;
    if (!p) return res.status(400).json({ ok: false, error: 'Invalid plan.' });
    activatePlan(req.user.id, p, req.body.billing === 'annual' ? 'annual' : 'monthly', { provider: 'paypal' });
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: true });
  }
  if (!subscriptionId) return res.status(400).json({ ok: false, error: 'Missing subscription id.' });

  try {
    const sub = await paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });

    // The subscription must belong to the signed-in account.
    const owner = String(sub.custom_id || '').split('|')[0];
    if (owner && owner !== req.user.id) {
      console.warn('   [billing] paypal confirm: subscription owner mismatch');
      return res.status(403).json({ ok: false, error: 'This subscription belongs to another account.' });
    }
    if (sub.status !== 'ACTIVE' && sub.status !== 'APPROVED') {
      return res.status(402).json({ ok: false, error: 'PayPal subscription is not active yet.' });
    }

    // custom_id was set to `userId|plan|billing` when the subscription was
    // created, so PayPal itself tells us what was bought.
    const parts = String(sub.custom_id || '').split('|');
    const plan = PLANS[parts[1]] && parts[1] !== 'trial' ? parts[1] : null;
    const billing = parts[2] === 'annual' ? 'annual' : 'monthly';
    if (!plan) {
      console.warn('   [billing] paypal confirm: subscription carries no usable plan — refused');
      return res.status(409).json({ ok: false, error: 'Could not determine which plan was purchased. Please contact support.' });
    }

    const periodEnd = sub.billing_info && sub.billing_info.next_billing_time
      ? Date.parse(sub.billing_info.next_billing_time) : null;
    activatePlan(req.user.id, plan, billing, {
      provider: 'paypal', subscriptionId: sub.id, periodEnd,
    });
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
  } catch (e) {
    console.error('   [billing] paypal confirm:', e.message);
    res.status(500).json({ ok: false, error: 'Could not confirm PayPal subscription.' });
  }
});

app.use('/api/payments', pay);

// ── Reward submission ───────────────────────────────────────
// A grown-up emails a child's result to receive a surprise.
// No child personal data is required or stored.
const rewardLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });
app.post('/api/reward', rewardLimiter, async (req, res) => {
  const { game, lang, score, total, timeMs, parentEmail, note } = req.body || {};
  if (!emailValid(parentEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const to = process.env.REWARD_TO || process.env.SMTP_USER || 'info@inclusion-games.com';
  const secs = Math.max(0, Math.round((Number(timeMs) || 0) / 1000));
  const tstr = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  try {
    await sendMail(to, `🎉 Game result — ${game || 'InclusionGames'}`,
      `<p>A player completed <b>${game || 'a game'}</b> (${lang || ''}).</p>
       <ul><li>Score: ${Number(score) || 0} / ${Number(total) || 0}</li><li>Time: ${tstr}</li></ul>
       <p>Reply-to (parent/teacher): ${parentEmail}</p>
       <p>Message: ${(note || '—').toString().slice(0, 500)}</p>`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('reward', e);
    return res.status(500).json({ error: 'Could not send. Please try again.' });
  }
});

// ── Contact / custom-game requests ──────────────────────────
// One endpoint behind both the "talk to us" box and the custom-game form.
// Everything a visitor types is escaped before it goes near the HTML mail —
// otherwise a message could inject markup into our own inbox.
const CONTACT_TO = process.env.CONTACT_TO || process.env.REWARD_TO
  || process.env.SMTP_USER || 'info@inclusion-games.com';

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const SUBJECTS = {
  custom:    '🎮 Custom game request',
  question:  '❓ Question',
  idea:      '💡 Idea / feedback',
  extension: '⏱ Trial extension request',
};

const contactLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 6, standardHeaders: true, legacyHeaders: false });
app.post('/api/contact', contactLimiter, async (req, res) => {
  const b = req.body || {};
  const kind = SUBJECTS[b.kind] ? b.kind : 'question';
  const email = String(b.email || '').trim();
  const message = String(b.message || '').trim();

  if (!emailValid(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (message.length < 10) return res.status(400).json({ error: 'Please tell us a little more (at least 10 characters).' });
  if (message.length > 4000) return res.status(400).json({ error: 'That message is too long. Please shorten it.' });

  const rows = [
    ['Name', b.name], ['Email', email], ['I am a', b.role],
    ['Child’s age', b.childAge], ['Page', b.page], ['Language', b.lang],
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');

  await sendMail(CONTACT_TO, `${SUBJECTS[kind]} — inclusion-games.com`,
    `<table cellpadding="4">${rows}</table>
     <p style="white-space:pre-wrap">${esc(message)}</p>
     <hr><p style="color:#888;font-size:12px">Reply directly to this mail to answer ${esc(email)}.</p>`,
    { replyTo: email });

  console.log(`   [contact] ${kind} from ${email}`);
  // sendMail never throws; a bounce is logged server-side rather than shown to
  // the visitor, who has done nothing wrong and cannot act on it.
  res.json({ ok: true });
});

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

// ═══════════════════════════════════════════════════════════
//  STATIC SITE
// ═══════════════════════════════════════════════════════════
// ── Access gate ─────────────────────────────────────────────
// Game pages, the games folder and the dashboard require an active
// trial or subscription. Everything else (landing, auth, legal,
// sales page, assets) stays public.
// express.static runs with extensions:['html'], so "/game02" serves game02.html
// even though the URL carries no extension. This gate used to test the literal
// request path, so every one of the 42 games — and the dashboard — was free to
// any anonymous visitor who simply left ".html" off. Resolve the request to the
// page that will actually be served before deciding, and compare in lower case,
// because a case-insensitive filesystem serves /GAME02.html just as happily.
function gatedPageName(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }  // malformed → refuse
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.toLowerCase();
  const trimmed = p.replace(/\/+$/, '');
  if (!trimmed) return { path: '/', page: '/index.html' };
  return { path: p, page: /\.[a-z0-9]+$/.test(trimmed) ? trimmed : trimmed + '.html' };
}

app.use((req, res, next) => {
  const n = gatedPageName(req.path);
  if (n === null) return res.status(400).type('text/plain').send('Bad request');
  const page = n.page;
  const gated = page === '/dashboard.html'
    || page === '/teacher.html'     // child profiles and per-game customisation
    || page === '/report.html'      // per-child analytics and reports
    || /^\/game[\w-]*\.html$/.test(page)
    || n.path === '/games' || n.path.startsWith('/games/');
  if (!gated) return next();
  const u = userFromSession(req);
  if (!u) return res.redirect('/login.html');
  if (!hasAccess(u)) return res.redirect('/index.html#pricing');
  next();
});

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
/* ── Block non-public files ──────────────────────────────────
   ROOT is both the web root AND the app's working directory, so data/,
   scripts/, node_modules/ and server.js itself sat beside the public HTML and
   were downloadable — data/users.json exposed every account, including the
   bcrypt password hashes. Deny them before express.static ever sees the path.
   (.env survived only because express.static ignores dotfiles by default;
   it is denied explicitly here so that is no longer load-bearing.) */
const BLOCKED = [
  /^\/data(\/|$)/i,
  /^\/scripts(\/|$)/i,
  /^\/lib(\/|$)/i,                        // server-side report + analytics logic
  /^\/test(\/|$)/i,
  /^\/node_modules(\/|$)/i,
  /^\/server\.js$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/\./,                                   // any dotfile or dotdir
  /\.(bak|log|sh|md|sql|zip|tar|gz|env)$/i,
  /\.bak-[\w.-]*$/i,                         // server.js.bak-1788… and friends
];
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch { /* keep the raw path */ }
  if (BLOCKED.some(re => re.test(p))) {
    console.warn('   [static] blocked ' + p + ' from ' + (req.ip || '?'));
    return res.status(404).type('txt').send('Not found');
  }
  next();
});

app.use(express.static(ROOT, { extensions: ['html'], dotfiles: 'deny' }));

// 404 fallback for unknown /api routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`\n🎈 InclusionGames running at ${APP_URL}`);
  // Say which MODE the key is, not merely that one exists. "live keys ✅" for a
  // sk_test_ key reads as "you are taking real money" when you are not.
  const stripeMode = !stripe ? 'DEMO (no key)'
    : (STRIPE_KEY.startsWith('sk_live_') ? 'LIVE — real charges 💳' : 'TEST key (no real charges)');
  console.log(`   Stripe: ${stripeMode} · PayPal: ${paypalEnabled ? `${process.env.PAYPAL_ENV === 'live' ? 'LIVE' : 'SANDBOX'} ✅` : 'DEMO (no key)'} · Email: ${transporter ? 'SMTP ✅' : 'console (dev)'}`);
  if (!stripe && !paypalEnabled) console.log('   ⚠️  Payment keys not set — checkout runs in DEMO mode (no real charges).');
  // Confirm the key's mode against Stripe itself rather than trusting the prefix.
  if (stripe) {
    stripe.balance.retrieve()
      .then(b => console.log(`   Stripe check: ${b.livemode ? 'LIVE MODE confirmed by Stripe ✅' : 'Stripe reports TEST MODE — no real money will move ⚠️'}`))
      .catch(e => console.log(`   Stripe check: key REJECTED — ${e.type} ${(e.raw && e.raw.message) || ''}`));

    // The tax code decides the VAT rate on every real invoice, and a typo would
    // apply it silently. Resolve it against Stripe and print what it actually is.
    const taxCode = process.env.STRIPE_TAX_CODE || 'txcd_10000000';
    stripe.taxCodes.retrieve(taxCode)
      .then(t => console.log(`   Tax code:  ${t.id} — ${t.name}${process.env.STRIPE_TAX_CODE ? '' : '  (default, not chosen)'}`))
      .catch(() => console.log(`   Tax code:  ${taxCode} is NOT a valid Stripe tax code ⚠️  invoices will fail`));
    console.log(`   Brand:     ${BRAND_NAME} (${BRAND_ID}) · ${BRAND_SITE}`);
  }
});

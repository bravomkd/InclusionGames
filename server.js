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
const ROOT = __dirname;

// "Production" = anything not obviously a developer's own machine. Several
// conveniences below (demo checkout, a default signing key) are safe on a
// laptop and dangerous on the public site, so they key off this.
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
  || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(APP_URL);

const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
// A guessable signing key means anyone can mint a session for any account, so
// refuse to start rather than run the live site with a placeholder. The
// /change.?me/ test catches the sample value in .env.example, which is long
// enough to pass a length check on its own.
const JWT_SECRET_IS_PLACEHOLDER = JWT_SECRET === DEV_JWT_SECRET
  || /change[-_ ]?me/i.test(JWT_SECRET)
  || JWT_SECRET.length < 32;
if (IS_PRODUCTION && JWT_SECRET_IS_PLACEHOLDER) {
  console.error('\n❌ JWT_SECRET is missing, too short, or still the placeholder.');
  console.error('   Sessions signed with it can be forged, so refusing to start.');
  console.error('   Put a long random string in .env, e.g.:');
  console.error('   JWT_SECRET=' + crypto.randomBytes(48).toString('hex') + '\n');
  process.exit(1);
}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;

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
// How long an email-verification link stays usable.
const VERIFY_DAYS = 7;

// Shown when the live site has no payment processor configured. Demo checkout
// activates a plan without charging anything, which is exactly what we want on
// a laptop and must never happen on the public site.
const PAYMENTS_UNCONFIGURED = 'Online payment is temporarily unavailable. Please contact support and we will get you set up.';
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
// Defaults to ./data. Point DATA_DIR somewhere outside the web root in
// production and the database can't be reached over HTTP at all, whatever the
// static handler is configured to do.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'users.json');
const DB_BACKUP = path.join(DATA_DIR, 'users.backup.json');

// Loading has to tell "there is no file yet" apart from "the file is there but
// unreadable". Treating both as "start empty" meant a half-written file — a
// crash mid-save, a full disk — silently became an empty database, and the
// very next save wrote [] over the real one. Measured: 4 accounts down to 1
// after a single registration, with no error anywhere.
let users;
if (!fs.existsSync(DB_FILE)) {
  users = [];                                    // genuinely a fresh install
} else {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
    users = parsed;
  } catch (e) {
    console.error(`\n❌ ${DB_FILE} exists but could not be read: ${e.message}`);
    console.error('   Refusing to start, so it is not overwritten with an empty database.');
    console.error(`   The previous run's copy should be at ${DB_BACKUP}`);
    process.exit(1);
  }
}

// Keep the last known-good database from the previous run, so a bad file always
// has something to fall back to.
if (users.length) {
  try { fs.copyFileSync(DB_FILE, DB_BACKUP); }
  catch (e) { console.error('db backup failed:', e.message); }
}

function saveNow() {
  // Write to a temp file, then rename it over the real one. rename is atomic,
  // so an interrupted save leaves either the old file or the new one intact —
  // never half of either.
  const tmp = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('saveDB', e);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* nothing else to do */ }
  }
}

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

// Escape anything user-supplied before it goes into an HTML email.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
function hasAccess(u) {
  if (!u) return false;
  if (ADMIN_EMAILS.includes((u.email || '').toLowerCase())) return true;
  if (!u.email_verified) return false;
  if (u.status === 'active') return true;
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
async function sendMail(to, subject, html) {
  const from = process.env.MAIL_FROM || 'InclusionGames <info@inclusion-games.com>';
  if (transporter) {
    await transporter.sendMail({ from, to, subject, html });
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
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const userId = s.client_reference_id || (s.metadata && s.metadata.userId);
    const plan = s.metadata && s.metadata.plan;
    const billing = (s.metadata && s.metadata.billing) || 'monthly';
    if (userId && plan) activatePlan(userId, plan, billing);
  }
  res.json({ received: true });
});

// CopeCart IPN webhook — RAW body for HMAC-SHA256 signature check. BEFORE json parser.
app.post('/api/webhooks/copecart', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.COPECART_WEBHOOK_SECRET;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

  // This endpoint grants paid access, so it is only ever accepted with a valid
  // signature. Skipping the check when no secret is configured meant anyone who
  // knew the URL could POST an email address and be handed a Family plan.
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
function activatePlan(userId, plan, billing) {
  if (!PLANS[plan]) return;
  const u = getUserById(userId);
  if (!u) return;
  u.plan = plan;
  u.billing = billing || 'monthly';
  u.status = 'active';
  u.updated_at = now();
  saveNow();
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
      user.verify_expires = t + days(VERIFY_DAYS);
      user.updated_at = t;
    } else {
      user = {
        id: crypto.randomUUID(),
        name, email,
        password_hash: hash,
        email_verified: 0,
        verify_token: token(),
        verify_expires: t + days(VERIFY_DAYS),
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
  // Links issued before this field existed have no expiry, so they still work.
  if (u.verify_expires && u.verify_expires < now())
    return res.status(400).json({ ok: false, error: 'This verification link has expired. Please sign up again to get a new one.' });
  u.email_verified = 1;
  u.verify_token = null;
  u.verify_expires = null;
  u.updated_at = now();
  saveNow();
  return res.json({ ok: true, message: 'Email verified. You can now sign in.' });
});

/* Failed-login tracking, per account. The IP rate limiter caps one source, but
   it does nothing against many sources all guessing at one account, which is
   what credential stuffing looks like. Counting per email closes that.
   Unknown emails are counted too, so a locked account can't be told apart from
   a wrong password and this can't be used to find out who has an account. */
const loginFails = new Map(); // email -> { count, until }
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function loginLockedUntil(email) {
  const rec = loginFails.get(email);
  if (!rec) return 0;
  if (!rec.until) return 0;                 // still counting, not locked yet
  if (rec.until > now()) return rec.until;  // locked
  loginFails.delete(email);                 // lock has run out, start fresh
  return 0;
}
function noteLoginFail(email) {
  const rec = loginFails.get(email) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_FAILS) { rec.until = now() + LOGIN_LOCK_MS; rec.count = 0; }
  loginFails.set(email, rec);
  // Keep the map from growing without bound on a long-running process.
  if (loginFails.size > 5000) {
    for (const [k, v] of loginFails) { if (!v.until || v.until <= now()) loginFails.delete(k); }
  }
}

auth.post('/login', async (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const password = req.body.password || '';

  const until = loginLockedUntil(email);
  if (until) {
    const mins = Math.max(1, Math.ceil((until - now()) / 60000));
    return res.status(429).json({ error: `Too many failed sign-in attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}, or reset your password.` });
  }

  const u = getUserByEmail(email);
  if (!u) { noteLoginFail(email); return res.status(401).json({ error: 'Invalid login credentials' }); }
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) { noteLoginFail(email); return res.status(401).json({ error: 'Invalid login credentials' }); }
  if (!u.email_verified && !ADMIN_EMAILS.includes(email))
    return res.status(403).json({ error: 'Please verify your email first — check your inbox for the confirmation link.' });
  loginFails.delete(email);
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
    try {
      await sendMail(email, 'Reset your InclusionGames password',
        `<p>We received a request to reset your password. This link is valid for 24 hours:</p>
         <p><a href="${link}">${link}</a></p>
         <p>If you didn't request this, you can safely ignore this email.</p>`);
    } catch (e) {
      // An SMTP failure here used to escape as an unhandled rejection, which
      // takes the whole process down. Log it and still answer normally.
      console.error('forgot: reset email failed:', (e && e.response) || e);
    }
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
    try { fs.writeFileSync(path.join(DATA_DIR, 'item-library.json'), JSON.stringify(ITEM_LIB)); } catch (e) {}
    return res.json({ found: true, source: 'ai', item });
  } catch (e) {
    console.log('complete-item AI error: ' + e.message);
    return res.json({ found: false, source: 'ai_timeout', item: null });
  }
});


// --- Read-only game content (from the dumped content-index.json) ---
let CONTENT_INDEX = {};
try { CONTENT_INDEX = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'content-index.json'), 'utf8')); }
catch { CONTENT_INDEX = {}; }
console.log('   Game content index: ' + Object.keys(CONTENT_INDEX).length + ' games.');

// Extract sentence-style content (game05): the SENT array per language.
const SENTENCE_CONTENT = (function(){
  try {
    const vm = require('vm');
    const html = fs.readFileSync(path.join(ROOT, 'game05.html'), 'utf8');
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

// --- Stroke rehab sessions -----------------------------------------------
// Results only. No video and no landmark data ever reaches the server: the
// camera is processed entirely in the browser, and that promise is made to
// the user on the page, so the payload below is deliberately just counts.
const rehabCatalogue = require('./assets/rehab-catalogue.js');

function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

children.post('/:id/rehab-session', authMiddleware, (req, res) => {
  const c = findChild(req);
  if (!c) return res.status(404).json({ error: 'Child not found.' });

  const b = req.body || {};
  if (!rehabCatalogue.byId(String(b.exercise || ''))) {
    return res.status(400).json({ error: 'Unknown exercise.' });
  }
  if (!Array.isArray(c.rehab)) c.rehab = [];

  const rec = {
    exercise: String(b.exercise),
    side: ['left', 'right', 'both'].indexOf(b.side) >= 0 ? b.side : 'both',
    sets: clampInt(b.sets, 0, 20),
    reps: clampInt(b.reps, 0, 500),
    targetReps: clampInt(b.targetReps, 0, 500),
    // Amplitude is a percentage of the person's OWN calibrated range, so it
    // can legitimately exceed 100 when they beat their calibration.
    bestAmplitude: clampInt(b.bestAmplitude, 0, 200),
    avgAmplitude: clampInt(b.avgAmplitude, 0, 200),
    symmetry: b.symmetry == null ? null : clampInt(b.symmetry, 0, 100),
    longestHoldMs: clampInt(b.longestHoldMs, 0, 600000),
    timeMs: clampInt(b.timeMs, 0, 36000000),
    // Flagged when calibration saw almost no movement — it makes every other
    // number on that session unreliable, so the report must be able to say so.
    calibrationWeak: !!b.calibrationWeak,
    lang: rehabCatalogue.langs.indexOf(b.lang) >= 0 ? b.lang : 'en',
    at: now(),
  };

  c.rehab.push(rec);
  if (c.rehab.length > 1000) c.rehab = c.rehab.slice(-1000);
  c.updated_at = now();
  saveNow();
  res.json({ ok: true });
});

children.get('/:id/rehab-analytics', authMiddleware, (req, res) => {
  const c = findChild(req);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  const rangeDays = REPORT_RANGES[String(req.query.range)] || null;
  res.json({ report: rehabAnalytics.buildRehabReport(c, { rangeDays }) });
});

// --- Progress reports: on-screen analytics, PDF, and email to a guardian ---
const analytics = require('./lib/analytics.js');
const reportPdf = require('./lib/report-pdf.js');
const rehabAnalytics = require('./lib/rehab-analytics.js');

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
  res.json({
    stripe: !!stripe,
    paypal: paypalEnabled,
    paypalClientId: paypalEnabled ? PAYPAL_ID : null,
    plans: PLANS,
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
    if (IS_PRODUCTION) return res.status(503).json({ error: PAYMENTS_UNCONFIGURED });
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
            product_data: { name: `InclusionGames — ${PLANS[plan].name}` },
          },
        };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [lineItem],
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      billing_address_collection: 'required',
      automatic_tax: { enabled: !!process.env.STRIPE_TAX }, // turn on with STRIPE_TAX=1 once Stripe Tax is configured
      metadata: { userId: req.user.id, plan, billing, waiver: req.body.waiver ? '1' : '0' },
      success_url: `${APP_URL}/payment-success.html?method=stripe&plan=${plan}&billing=${billing}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/index.html#pricing`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('stripe checkout', e);
    res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// Verify a returned Stripe session and upgrade the account.
pay.get('/verify-session', authMiddleware, async (req, res) => {
  const sessionId = req.query.session_id;

  // DEMO MODE — only when there is genuinely no Stripe key on this server.
  // A "demo_" session id must NOT be honoured once real keys are configured,
  // or anyone could hand themselves any plan by inventing a session id.
  if (!stripe) {
    if (IS_PRODUCTION) return res.status(503).json({ ok: false, error: PAYMENTS_UNCONFIGURED });
    const plan = req.query.plan;
    const billing = req.query.billing === 'annual' ? 'annual' : 'monthly';
    if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ ok: false, error: 'Invalid plan.' });
    activatePlan(req.user.id, plan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: true });
  }

  if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing session id.' });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // The session has to be one WE started for THIS account. Without this a
    // customer could replay somebody else's session id.
    const owner = session.client_reference_id || (session.metadata && session.metadata.userId);
    if (owner !== req.user.id) {
      console.warn('verify-session: session', sessionId, 'does not belong to user', req.user.id);
      return res.status(403).json({ ok: false, error: 'This payment belongs to a different account.' });
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(402).json({ ok: false, error: 'Payment not completed.' });
    }

    // Plan and billing come from the session Stripe is holding, never from the
    // query string — otherwise a Starter payment could be returned as ?plan=school.
    const plan = session.metadata && session.metadata.plan;
    const billing = (session.metadata && session.metadata.billing) === 'annual' ? 'annual' : 'monthly';
    if (!PLANS[plan] || plan === 'trial') {
      console.error('verify-session: session', sessionId, 'has no usable plan metadata');
      return res.status(500).json({ ok: false, error: 'Could not read the purchased plan. Please contact support.' });
    }

    activatePlan(req.user.id, plan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
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
  return d.access_token;
}

pay.post('/paypal/create-order', authMiddleware, async (req, res) => {
  const plan = req.body.plan;
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ error: 'Invalid plan.' });
  const amount = (billing === 'annual' ? PLANS[plan].annual : PLANS[plan].monthly).toFixed(2);

  // Record the customer's express withdrawal-waiver consent, same as the
  // Stripe route does (legal proof, § 356(5) BGB).
  if (req.body.waiver) {
    req.user.waiver_at = now();
    req.user.waiver_ip = req.ip;
    req.user.updated_at = now();
    saveNow();
  }

  if (!paypalEnabled) {
    if (IS_PRODUCTION) return res.status(503).json({ error: PAYMENTS_UNCONFIGURED });
    return res.json({ id: `demo_${token(8)}`, demo: true });
  }
  try {
    const at = await paypalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'EUR', value: amount },
          description: `InclusionGames — ${PLANS[plan].name}`,
          custom_id: `${req.user.id}|${plan}|${billing}`,
        }],
        // Without a return_url PayPal has nowhere to send the buyer after they
        // approve, so the order is never captured and the plan never activates.
        application_context: {
          brand_name: 'InclusionGames',
          user_action: 'PAY_NOW',
          return_url: `${APP_URL}/payment-success.html?method=paypal`,
          cancel_url: `${APP_URL}/index.html#pricing`,
        },
      }),
    });
    const order = await r.json();
    if (!order.id) {
      console.error('paypal create: no order id', order);
      return res.status(502).json({ error: 'Could not start PayPal checkout.' });
    }
    // Prefer the approval link PayPal hands back over building the URL by hand.
    const approve = (order.links || []).find(l => l.rel === 'approve');
    res.json({ id: order.id, approveUrl: approve ? approve.href : null });
  } catch (e) {
    console.error('paypal create', e);
    res.status(500).json({ error: 'Could not start PayPal checkout.' });
  }
});

pay.post('/paypal/capture', authMiddleware, async (req, res) => {
  const { orderID } = req.body;

  // DEMO MODE — only with no PayPal credentials on this server, for the same
  // reason as the Stripe branch above.
  if (!paypalEnabled) {
    if (IS_PRODUCTION) return res.status(503).json({ ok: false, error: PAYMENTS_UNCONFIGURED });
    const plan = req.body.plan;
    const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
    if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ ok: false, error: 'Invalid plan.' });
    activatePlan(req.user.id, plan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: true });
  }

  if (!orderID) return res.status(400).json({ ok: false, error: 'Missing order id.' });
  try {
    const at = await paypalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    });
    const cap = await r.json();
    if (cap.status !== 'COMPLETED') {
      return res.status(402).json({ ok: false, error: 'PayPal payment not completed.' });
    }

    // What was actually bought is read back off the captured order — we set
    // custom_id to "userId|plan|billing" when the order was created. Trusting
    // req.body.plan here would let a 9.99 order be redeemed as any plan.
    const unit = (cap.purchase_units && cap.purchase_units[0]) || {};
    const customId = unit.custom_id
      || (unit.payments && unit.payments.captures && unit.payments.captures[0] && unit.payments.captures[0].custom_id)
      || '';
    const [ownerId, paidPlan, paidBilling] = String(customId).split('|');

    if (!ownerId || ownerId !== req.user.id) {
      console.warn('paypal capture: order', orderID, 'does not belong to user', req.user.id);
      return res.status(403).json({ ok: false, error: 'This payment belongs to a different account.' });
    }
    if (!PLANS[paidPlan] || paidPlan === 'trial') {
      console.error('paypal capture: order', orderID, 'has no usable plan in custom_id');
      return res.status(500).json({ ok: false, error: 'Could not read the purchased plan. Please contact support.' });
    }

    const billing = paidBilling === 'annual' ? 'annual' : 'monthly';

    // The amount PayPal actually captured has to match that plan's price.
    const captured = unit.payments && unit.payments.captures && unit.payments.captures[0];
    const expected = (billing === 'annual' ? PLANS[paidPlan].annual : PLANS[paidPlan].monthly).toFixed(2);
    if (captured && captured.amount && captured.amount.value !== expected) {
      console.error('paypal capture: order', orderID, 'paid', captured.amount.value, 'but', paidPlan, billing, 'costs', expected);
      return res.status(402).json({ ok: false, error: 'The amount paid does not match the plan. Please contact support.' });
    }

    activatePlan(req.user.id, paidPlan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
  } catch (e) {
    console.error('paypal capture', e);
    res.status(500).json({ ok: false, error: 'Could not capture PayPal payment.' });
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
  // This mail goes to the site owner and every field below is attacker-supplied,
  // so escape before interpolating — otherwise anyone can put markup and links
  // into a message the owner receives and trusts.
  const g = esc(String(game || 'a game').slice(0, 60));
  try {
    await sendMail(to, `🎉 Game result — ${String(game || 'InclusionGames').replace(/[\r\n]/g, ' ').slice(0, 60)}`,
      `<p>A player completed <b>${g}</b> (${esc(String(lang || '').slice(0, 8))}).</p>
       <ul><li>Score: ${Number(score) || 0} / ${Number(total) || 0}</li><li>Time: ${tstr}</li></ul>
       <p>Reply-to (parent/teacher): ${esc(parentEmail)}</p>
       <p>Message: ${esc((note || '—').toString().slice(0, 500))}</p>`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('reward', e);
    return res.status(500).json({ error: 'Could not send. Please try again.' });
  }
});

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

// ═══════════════════════════════════════════════════════════
//  STATIC SITE
// ═══════════════════════════════════════════════════════════
// ── What must never leave the server ────────────────────────
// The public site is served straight out of the project folder, and that same
// folder also holds the database, the .env and the backend source. Everything
// that is not part of the public site is refused HERE, before express.static
// ever gets a chance to hand it out.
// Both the configured DATA_DIR and the conventional ./data are refused: moving
// DATA_DIR elsewhere must not quietly un-protect files left behind in ./data.
const PRIVATE_DIRS = [DATA_DIR, path.join(ROOT, 'data'), path.join(ROOT, 'node_modules'), path.join(ROOT, '.git')]
  .map(d => d.toLowerCase());
const PRIVATE_FILES = new Set(
  ['server.js', 'package.json', 'package-lock.json', '.env', '.env.example', 'README.md', 'DEPLOY-hetzner.md']
    .map(f => path.join(ROOT, f).toLowerCase())
);

// Decode the request path once and normalise the slashes, so the checks below
// can't be walked around with %2e%2e, backslashes or doubled slashes.
function normalisePath(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; } // malformed → refuse
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return p.startsWith('/') ? p : '/' + p;
}

// Compared case-insensitively on purpose: on a case-insensitive filesystem
// (Windows, macOS) "/SERVER.JS" and "/Data/users.json" resolve to the same
// files, so matching only the exact spelling would leave a way straight past
// these checks.
function isPrivatePath(p) {
  const abs = path.resolve(ROOT, '.' + p);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return true; // escaped the site root
  const lower = abs.toLowerCase();
  if (PRIVATE_FILES.has(lower)) return true;
  return PRIVATE_DIRS.some(d => lower === d || lower.startsWith(d + path.sep));
}

// express.static runs with extensions:['html'], so "/game02" serves game02.html.
// The gate has to see the same page name either way, or it only gates one spelling.
function pageName(p) {
  const trimmed = p.replace(/\/+$/, '');
  if (!trimmed) return '/index.html';
  return /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : trimmed + '.html';
}

// ── Access gate ─────────────────────────────────────────────
// Game pages, the games folder and the dashboard require an active
// trial or subscription. Everything else (landing, auth, legal,
// sales page, assets) stays public.
app.use((req, res, next) => {
  const p = normalisePath(req.path);
  if (p === null || isPrivatePath(p)) return res.status(404).type('text/plain').send('Not found');

  // Lower-cased for the same reason as isPrivatePath: "/GAME02" serves
  // game02.html on a case-insensitive filesystem and must be gated too.
  const page = pageName(p).toLowerCase();
  const gated = page === '/dashboard.html'
    || page === '/report.html'      // per-child analytics and reports
    || page === '/teacher.html'     // child profiles and per-game customisation
    || page === '/stroke.html'      // stroke rehabilitation section
    || /^\/game[\w-]*\.html$/.test(page)
    || /^\/rehab[\w-]*\.html$/.test(page)
    || page.startsWith('/games/');
  if (!gated) return next();
  const u = userFromSession(req);
  if (!u) return res.redirect('/login.html');
  if (!hasAccess(u)) return res.redirect('/index.html#pricing');
  next();
});

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use(express.static(ROOT, { extensions: ['html'], dotfiles: 'ignore', index: false }));

// 404 fallback for unknown /api routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`\n🎈 InclusionGames running at ${APP_URL}`);
  console.log(`   Stripe: ${stripe ? 'live keys ✅' : 'DEMO (no key)'} · PayPal: ${paypalEnabled ? 'live ✅' : 'DEMO (no key)'} · Email: ${transporter ? 'SMTP ✅' : 'console (dev)'}`);
  if (!stripe && !paypalEnabled) console.log('   ⚠️  Payment keys not set — checkout runs in DEMO mode (no real charges).');
});

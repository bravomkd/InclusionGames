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

let _saveTimer = null;
function saveDB() {
  // debounce writes a touch so rapid updates don't thrash the disk
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); }
    catch (e) { console.error('saveDB', e); }
  }, 50);
}
function saveNow() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); }
  catch (e) { console.error('saveDB', e); }
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
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    if ((req.headers['x-copecart-signature'] || '') !== expected) {
      console.warn('copecart webhook: invalid signature');
      return res.status(401).send('invalid signature');
    }
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
    try { fs.writeFileSync(path.join(DATA_DIR, 'item-library.json'), JSON.stringify(ITEM_LIB)); } catch (e) {}
    return res.json({ found: true, source: 'ai', item });
  } catch (e) {
    console.log('complete-item AI error: ' + e.message);
    return res.json({ found: false, source: 'ai_timeout', item: null });
  }
});


// --- Read-only game content (from the dumped content-index.json) ---
let CONTENT_INDEX = {};
try { CONTENT_INDEX = JSON.parse(fs.readFileSync('/root/content-index.json','utf8')); }
catch { try { CONTENT_INDEX = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'content-index.json'),'utf8')); } catch { CONTENT_INDEX = {}; } }
console.log('   Game content index: ' + Object.keys(CONTENT_INDEX).length + ' games.');

// Extract sentence-style content (game05): the SENT array per language.
const SENTENCE_CONTENT = (function(){
  try {
    const vm = require('vm');
    const html = fs.readFileSync('/var/www/inclusion/game05.html','utf8');
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
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function stripEmoji(s){ return String(s||'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u200d]/gu,'').replace(/\s+/g,' ').trim(); }

const GAME_TITLES_FOR_PDF = (function(){
  const t={};
  try {
    const dash = fs.readFileSync('/var/www/inclusion/dashboard.html','utf8');
    const re=/\{n:(\d+),icon:'[^']*',title:'([^']*)',[^}]*file:'(game\d+)\.html'\}/g; let m;
    while((m=re.exec(dash))){ t['game'+String(m[1]).padStart(2,'0')]=m[2]; }
  } catch(e){}
  return t;
})();

children.get('/:id/report.pdf', authMiddleware, async (req, res) => {
  const list = ensureChildren(req.user);
  const c = list.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Child not found.' });
  const prog = (c.progress || []).slice();
  try {
    const pdf = await PDFDocument.create();
    let page = pdf.addPage([595.28, 841.89]);
    const F = await pdf.embedFont(StandardFonts.Helvetica);
    const FB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, M = 50;
    let y = 800;
    const purple = rgb(0.486,0.227,0.929), ink = rgb(0.1,0.1,0.18), muted = rgb(0.42,0.42,0.54), line = rgb(0.9,0.89,0.94);
    const clean=(s)=>{ s=stripEmoji(s); return s; };
    const txt=(s,x,yy,sz,fnt,col)=>{ try{ page.drawText(clean(s), {x,y:yy,size:sz,font:fnt||F,color:col||ink}); }catch(e){ page.drawText(String(s).replace(/[^\x20-\x7E]/g,''), {x,y:yy,size:sz,font:fnt||F,color:col||ink}); } };
    const hr=(yy)=>{ page.drawLine({start:{x:M,y:yy},end:{x:W-M,y:yy},thickness:1,color:line}); };
    const newPageIf=(need)=>{ if(y<need){ page=pdf.addPage([595.28,841.89]); y=800; } };

    txt('InclusionGames', M, y, 20, FB, purple); y-=24;
    txt('Förderbericht – Lernfortschritt', M, y, 13, FB, ink); y-=16;
    txt('Erstellt am '+new Date().toLocaleDateString('de-DE'), M, y, 9, F, muted); y-=14;
    hr(y); y-=22;

    txt('Kind:', M, y, 10, FB, ink); txt(c.name||'', M+70, y, 10, F, ink);
    txt('Betreuung:', W/2, y, 10, FB, ink); txt((req.user.name||req.user.email||''), W/2+70, y, 10, F, ink); y-=16;
    if (prog.length){
      const fa=new Date(prog[0].at), la=new Date(prog[prog.length-1].at);
      txt('Zeitraum:', M, y, 10, FB, ink);
      txt(fa.toLocaleDateString('de-DE')+' – '+la.toLocaleDateString('de-DE'), M+70, y, 10, F, ink); y-=16;
    }
    y-=8;

    if (!prog.length){
      txt('Noch keine Spielsitzungen aufgezeichnet.', M, y, 11, F, muted);
    } else {
      const games=prog.length;
      const sScore=prog.reduce((a,p)=>a+(p.score||0),0);
      const sTotal=prog.reduce((a,p)=>a+(p.total||0),0);
      const pct=sTotal?Math.round(100*sScore/sTotal):0;
      const mins=Math.round(prog.reduce((a,p)=>a+(p.timeMs||0),0)/60000);
      txt('Zusammenfassung', M, y, 12, FB, purple); y-=18;
      txt('Sitzungen gesamt:', M, y, 10, F, ink); txt(String(games), M+130, y, 10, FB, ink);
      txt('Gesamtgenauigkeit:', W/2, y, 10, F, ink); txt(pct+'%', W/2+130, y, 10, FB, ink); y-=15;
      txt('Spielzeit gesamt:', M, y, 10, F, ink); txt(mins+' Min.', M+130, y, 10, FB, ink); y-=22;

      txt('Pro Spiel', M, y, 12, FB, purple); y-=16;
      txt('Spiel', M, y, 9, FB, muted); txt('Anzahl', M+200, y, 9, FB, muted);
      txt('Zuletzt', M+260, y, 9, FB, muted); txt('Beste', M+330, y, 9, FB, muted); txt('Trend', M+400, y, 9, FB, muted); y-=4;
      hr(y); y-=14;
      const byGame={}; prog.forEach(p=>{(byGame[p.game]=byGame[p.game]||[]).push(p);});
      Object.keys(byGame).forEach(gid=>{
        newPageIf(80);
        const rs=byGame[gid];
        const last=rs[rs.length-1];
        let best=rs[0]; rs.forEach(p=>{ if((p.total?p.score/p.total:0)>(best.total?best.score/best.total:0)) best=p; });
        const first=rs[0];
        const fr=first.total?first.score/first.total:0, lr=last.total?last.score/last.total:0;
        const trend= rs.length<2?'gleich':(lr>fr+0.05?'steigend':(lr<fr-0.05?'fallend':'gleich'));
        txt(GAME_TITLES_FOR_PDF[gid]||gid, M, y, 10, F, ink);
        txt(String(rs.length), M+200, y, 10, F, ink);
        txt(last.score+'/'+last.total, M+260, y, 10, F, ink);
        txt(best.score+'/'+best.total, M+330, y, 10, F, ink);
        txt(trend, M+400, y, 10, F, trend==='steigend'?rgb(0.06,0.72,0.51):(trend==='fallend'?rgb(0.86,0.15,0.15):muted));
        y-=15;
      });
      y-=10;

      newPageIf(120);
      txt('Letzte Sitzungen', M, y, 12, FB, purple); y-=16;
      prog.slice(-15).reverse().forEach(p=>{
        newPageIf(40);
        const d=new Date(p.at);
        txt(d.toLocaleDateString('de-DE')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'), M, y, 9, F, muted);
        txt((GAME_TITLES_FOR_PDF[p.game]||p.game), M+110, y, 9, F, ink);
        txt(p.score+'/'+p.total, M+330, y, 9, FB, ink);
        y-=13;
      });
    }

    newPageIf(90);
    if (y>120) y=120;
    hr(y); y-=16;
    txt('Datenschutz: Die Hand-Erkennung läuft ausschließlich lokal im Browser. Es werden keine', M, y, 8, F, muted); y-=11;
    txt('Video- oder Biometriedaten übertragen oder gespeichert (DSGVO-konform).', M, y, 8, F, muted); y-=24;
    txt('Datum, Unterschrift (Förderkraft): ___________________________________', M, y, 9, F, ink);

    const bytes = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Foerderbericht-'+(c.name||'Kind').replace(/[^a-zA-Z0-9]/g,'_')+'.pdf"');
    res.send(Buffer.from(bytes));
  } catch (e) {
    console.error('report.pdf', e);
    res.status(500).json({ error: 'Could not generate report: '+e.message });
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
  const plan = req.query.plan;
  const billing = req.query.billing === 'annual' ? 'annual' : 'monthly';
  const sessionId = req.query.session_id;

  if (!stripe || (sessionId && String(sessionId).startsWith('demo'))) {
    activatePlan(req.user.id, plan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: !stripe });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid' || session.status === 'complete') {
      activatePlan(req.user.id, plan, billing);
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
  return d.access_token;
}

pay.post('/paypal/create-order', authMiddleware, async (req, res) => {
  const plan = req.body.plan;
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[plan] || plan === 'trial') return res.status(400).json({ error: 'Invalid plan.' });
  const amount = (billing === 'annual' ? PLANS[plan].annual : PLANS[plan].monthly).toFixed(2);

  if (!paypalEnabled) {
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
      }),
    });
    const order = await r.json();
    res.json({ id: order.id });
  } catch (e) {
    console.error('paypal create', e);
    res.status(500).json({ error: 'Could not start PayPal checkout.' });
  }
});

pay.post('/paypal/capture', authMiddleware, async (req, res) => {
  const { orderID, plan } = req.body;
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';

  if (!paypalEnabled || (orderID && String(orderID).startsWith('demo'))) {
    activatePlan(req.user.id, plan, billing);
    const u = getUserById(req.user.id);
    return res.json({ ok: true, token: signToken(u), user: publicUser(u), demo: !paypalEnabled });
  }
  try {
    const at = await paypalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    });
    const cap = await r.json();
    if (cap.status === 'COMPLETED') {
      activatePlan(req.user.id, plan, billing);
      const u = getUserById(req.user.id);
      return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
    }
    res.status(402).json({ ok: false, error: 'PayPal payment not completed.' });
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
const PRIVATE_DIRS = [DATA_DIR, path.join(ROOT, 'node_modules'), path.join(ROOT, '.git')]
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
    || /^\/game[\w-]*\.html$/.test(page)
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

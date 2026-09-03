#!/usr/bin/env node
/**
 * Creates the PayPal Product and the 8 Billing Plans (4 tiers × monthly/annual)
 * that server.js expects, then prints the .env lines to paste.
 *
 *   cd /var/www/inclusion && node scripts/paypal-setup.js
 *
 * Reads PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_ENV from .env. Safe to re-run:
 * it lists what already exists first and only creates what is missing. Nothing is
 * ever deleted — PayPal plans cannot be deleted, only deactivated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ID = process.env.PAYPAL_CLIENT_ID || '';
const SECRET = process.env.PAYPAL_SECRET || '';
const ENV = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
const BASE = ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

if (!ID || !SECRET) {
  console.error('PAYPAL_CLIENT_ID / PAYPAL_SECRET are not set in .env — nothing to do.');
  process.exit(1);
}

// Must match PLANS in server.js. `annual` is the total charged once per year.
const TIERS = {
  starter:  { name: 'Starter Plan',  monthly: 9.99,  annual: 83.88 },
  family:   { name: 'Family Plan',   monthly: 19.99, annual: 167.88 },
  educator: { name: 'Educator Plan', monthly: 39.99, annual: 335.88 },
  school:   { name: 'School Plan',   monthly: 99.99, annual: 839.88 },
};

async function token() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${ID}:${SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('auth failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function api(pathname, opts = {}) {
  const at = await token();
  const r = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${at}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(`${r.status} ${pathname}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function findOrCreateProduct() {
  const list = await api('/v1/catalogs/products?page_size=100');
  const found = (list.products || []).find(p => p.name === 'InclusionGames');
  if (found) {
    console.log(`product: reusing ${found.id}`);
    return found.id;
  }
  const p = await api('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'InclusionGames',
      description: 'Camera-powered educational games for children with disabilities.',
      type: 'SERVICE',
      category: 'EDUCATIONAL_AND_TEXTBOOKS',
    }),
  });
  console.log(`product: created ${p.id}`);
  return p.id;
}

async function existingPlans(productId) {
  const out = {};
  let page = 1;
  for (;;) {
    const r = await api(`/v1/billing/plans?product_id=${productId}&page_size=20&page=${page}`);
    (r.plans || []).forEach(p => { out[p.name] = p.id; });
    if (!r.plans || r.plans.length < 20) break;
    page++;
  }
  return out;
}

function planBody(productId, planName, tier, billing) {
  const isAnnual = billing === 'annual';
  return {
    product_id: productId,
    name: planName,
    description: `${TIERS[tier].name} — billed ${isAnnual ? 'yearly' : 'monthly'}`,
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: isAnnual ? 'YEAR' : 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0,                       // 0 = renew forever
      pricing_scheme: {
        fixed_price: {
          value: (isAnnual ? TIERS[tier].annual : TIERS[tier].monthly).toFixed(2),
          currency_code: 'EUR',
        },
      },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: '0.00', currency_code: 'EUR' },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
    taxes: { percentage: '19', inclusive: true },   // German VAT, price is gross
  };
}

(async () => {
  console.log(`\nPayPal setup — ${ENV.toUpperCase()} (${BASE})\n`);
  const productId = await findOrCreateProduct();
  const have = await existingPlans(productId);

  const env = [];
  for (const tier of Object.keys(TIERS)) {
    for (const billing of ['monthly', 'annual']) {
      const planName = `InclusionGames ${TIERS[tier].name} (${billing})`;
      let id = have[planName];
      if (id) {
        console.log(`  plan: reusing  ${planName} → ${id}`);
      } else {
        const p = await api('/v1/billing/plans', {
          method: 'POST',
          body: JSON.stringify(planBody(productId, planName, tier, billing)),
        });
        id = p.id;
        console.log(`  plan: created  ${planName} → ${id}`);
      }
      env.push(`PAYPAL_PLAN_${tier.toUpperCase()}_${billing.toUpperCase()}=${id}`);
    }
  }

  if (process.argv.includes('--write-env')) {
    // Saves pasting eight ids by hand — the plan ids are not secret, they come
    // straight back from the API call above.
    const fs = require('fs');
    const ENV = require('path').join(__dirname, '..', '.env');
    fs.copyFileSync(ENV, `${ENV}.bak-paypal-${Date.now()}`);
    const lines = fs.readFileSync(ENV, 'utf8').split('\n');
    let added = 0, replaced = 0;
    for (const entry of env) {
      const key = entry.split('=')[0];
      const at = lines.findIndex(l => l.indexOf(`${key}=`) === 0);
      if (at >= 0) { lines[at] = entry; replaced++; } else { lines.push(entry); added++; }
    }
    fs.writeFileSync(ENV, lines.join('\n'));
    console.log(`\n  .env updated — ${replaced} replaced, ${added} added (backup alongside)`);
    console.log('  Still needed by hand: PAYPAL_WEBHOOK_ID');
    console.log('\n  Then: pm2 restart inclusion\n');
    return;
  }

  console.log('\n─────────── paste these into /var/www/inclusion/.env ───────────\n');
  console.log(env.join('\n'));
  console.log('\n  Or re-run with --write-env and I will write them for you.');
  console.log('  Then: pm2 restart inclusion\n');
})().catch(e => { console.error('\nFAILED:', e.message, '\n'); process.exit(1); });

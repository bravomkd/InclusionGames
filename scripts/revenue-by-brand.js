#!/usr/bin/env node
/**
 * Splits the KOKOWorlds Stripe account's revenue by brand, so InclusionGames can
 * be reported separately from kokoworlds.de and balkansofra.de even though every
 * euro lands in the same balance.
 *
 *   node scripts/revenue-by-brand.js               # this month
 *   node scripts/revenue-by-brand.js 2026-08       # a specific month
 *   node scripts/revenue-by-brand.js 2026-01 2026-12
 *   node scripts/revenue-by-brand.js --csv > revenue.csv
 *
 * Charges are attributed via the `brand` metadata this server stamps on every
 * checkout session and subscription. Anything created before that tagging, or by
 * another project that does not tag, is grouped under "(untagged)" — those need
 * splitting by hand, or by the payment description.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY not set.'); process.exit(1); }
const stripe = require('stripe')(key, {
  apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
});

const args = process.argv.slice(2).filter(a => a !== '--csv');
const CSV = process.argv.includes('--csv');

function monthBounds(from, to) {
  const now = new Date();
  const f = from || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const t = to || f;
  const [fy, fm] = f.split('-').map(Number);
  const [ty, tm] = t.split('-').map(Number);
  return {
    gte: Math.floor(Date.UTC(fy, fm - 1, 1) / 1000),
    lt: Math.floor(Date.UTC(tm === 12 ? ty + 1 : ty, tm === 12 ? 0 : tm, 1) / 1000),
    label: f === t ? f : `${f} … ${t}`,
  };
}

const money = (cents, cur) => `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`;

(async () => {
  const { gte, lt, label } = monthBounds(args[0], args[1]);
  const acct = await stripe.accounts.retrieve();
  const brands = {};
  let count = 0;

  for await (const ch of stripe.charges.list({
    created: { gte, lt }, limit: 100, expand: ['data.invoice'],
  })) {
    if (ch.status !== 'succeeded') continue;
    count++;

    // Charge metadata is usually empty for subscriptions — the brand lives on the
    // subscription, which the invoice points at.
    let brand = ch.metadata && ch.metadata.brand;
    if (!brand && ch.invoice && ch.invoice.subscription_details &&
        ch.invoice.subscription_details.metadata) {
      brand = ch.invoice.subscription_details.metadata.brand;
    }
    if (!brand && ch.invoice && ch.invoice.metadata) brand = ch.invoice.metadata.brand;
    brand = brand || '(untagged)';

    const b = brands[brand] || (brands[brand] = { gross: 0, refunded: 0, fee: 0, n: 0, cur: ch.currency });
    b.gross += ch.amount;
    b.refunded += ch.amount_refunded || 0;
    b.n++;
  }

  if (CSV) {
    console.log('brand,charges,gross,refunded,net,currency');
    for (const [k, b] of Object.entries(brands)) {
      console.log([k, b.n, (b.gross / 100).toFixed(2), (b.refunded / 100).toFixed(2),
        ((b.gross - b.refunded) / 100).toFixed(2), b.cur.toUpperCase()].join(','));
    }
    return;
  }

  console.log(`\n  Revenue by brand — ${label}`);
  console.log(`  account ${acct.id} (${acct.business_profile && acct.business_profile.name})`);
  console.log('  ' + '─'.repeat(62));
  if (!count) { console.log('  no successful charges in this period\n'); return; }

  const rows = Object.entries(brands).sort((a, b) => b[1].gross - a[1].gross);
  console.log('  ' + 'brand'.padEnd(22) + 'charges'.padStart(8) + 'gross'.padStart(15) + 'net'.padStart(15));
  for (const [k, b] of rows) {
    console.log('  ' + k.padEnd(22) + String(b.n).padStart(8) +
      money(b.gross, b.cur).padStart(15) + money(b.gross - b.refunded, b.cur).padStart(15));
  }
  const tot = rows.reduce((a, [, b]) => ({ g: a.g + b.gross, n: a.n + (b.gross - b.refunded), c: a.c + b.n }),
    { g: 0, n: 0, c: 0 });
  console.log('  ' + '─'.repeat(62));
  console.log('  ' + 'TOTAL'.padEnd(22) + String(tot.c).padStart(8) +
    money(tot.g, rows[0][1].cur).padStart(15) + money(tot.n, rows[0][1].cur).padStart(15));
  if (brands['(untagged)']) {
    console.log(`\n  Note: "(untagged)" is revenue from projects that don't stamp a brand,`);
    console.log('        or charges made before tagging was added. Split those by hand.');
  }
  console.log('');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

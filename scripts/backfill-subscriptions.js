#!/usr/bin/env node
/**
 * Links existing Stripe subscriptions to accounts that are missing the metadata
 * (subscription_id / customer_id / current_period_end). Without it a paid account
 * can never be matched to later renewal or cancellation events, so its access
 * would never lapse.
 *
 *   pm2 stop inclusion
 *   node scripts/backfill-subscriptions.js          # dry run, shows what it would do
 *   node scripts/backfill-subscriptions.js --apply  # write the changes
 *   pm2 start inclusion
 *
 * Stop the app first: it keeps users in memory and rewrites the whole file, so a
 * concurrent save would discard these edits.
 *
 * Only ever FILLS IN missing fields — it never changes a plan, a status, or an
 * id that is already set.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const DB = path.join(__dirname, '..', 'data', 'users.json');
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY not set.'); process.exit(1); }
const stripe = require('stripe')(key, {
  apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
});

const secsToMs = s => (s ? s * 1000 : null);
function periodEndOfSub(sub) {
  if (!sub) return null;
  if (sub.current_period_end) return secsToMs(sub.current_period_end);
  const items = sub.items && sub.items.data;
  if (Array.isArray(items) && items.length) {
    const ends = items.map(i => i && i.current_period_end).filter(Boolean);
    if (ends.length) return secsToMs(Math.max.apply(null, ends));
  }
  return null;
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const users = Array.isArray(raw) ? raw : Object.values(raw);
  const byEmail = new Map(users.map(u => [(u.email || '').toLowerCase(), u]));

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — reading Stripe subscriptions\n`);

  let seen = 0, linked = 0, skipped = 0;
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) {
    seen++;
    const cust = sub.customer && typeof sub.customer === 'object' ? sub.customer : null;
    const email = (cust && cust.email || '').toLowerCase();
    const u = email ? byEmail.get(email) : null;

    if (!u) { console.log(`  ${sub.id}  no account for ${email || '(no email)'}`); skipped++; continue; }
    if (u.subscription_id) { console.log(`  ${sub.id}  ${email} already linked`); skipped++; continue; }
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      console.log(`  ${sub.id}  ${email} status=${sub.status} — left alone`); skipped++; continue;
    }

    const periodEnd = periodEndOfSub(sub);
    console.log(`  ${sub.id}  ${email}  → link, period end ${periodEnd ? new Date(periodEnd).toISOString() : '(unknown)'}`);
    if (APPLY) {
      u.billing_provider = u.billing_provider || 'stripe';
      u.subscription_id = sub.id;
      if (cust && cust.id) u.customer_id = u.customer_id || cust.id;
      if (periodEnd && !u.current_period_end) u.current_period_end = periodEnd;
      u.updated_at = Date.now();
    }
    linked++;
  }

  if (APPLY && linked) {
    const backup = DB + '.bak-backfill-' + Date.now();
    fs.copyFileSync(DB, backup);
    fs.writeFileSync(DB, JSON.stringify(Array.isArray(raw) ? users : raw, null, 2));
    console.log(`\n  backup: ${path.basename(backup)}`);
  }

  console.log(`\n${seen} subscription(s) seen · ${linked} ${APPLY ? 'linked' : 'would be linked'} · ${skipped} skipped\n`);
  if (!APPLY && linked) console.log('Re-run with --apply to write.\n');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

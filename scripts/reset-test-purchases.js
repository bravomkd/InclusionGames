#!/usr/bin/env node
/**
 * Clears plans that came from Stripe TEST/sandbox purchases before going live.
 *
 *   pm2 stop inclusion
 *   node scripts/reset-test-purchases.js           # dry run
 *   node scripts/reset-test-purchases.js --apply
 *   pm2 start inclusion
 *
 * Stop the app first — it holds users in memory and rewrites the whole file.
 *
 * Targets only accounts that are paid-active but cannot be backed by a real
 * payment: either no subscription id at all, or one that no longer resolves
 * against the CURRENT Stripe key (i.e. a sandbox id once you hold live keys).
 * Accounts you deliberately provisioned by hand are listed and left alone
 * unless you name them explicitly.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.filter(a => a.includes('@')).map(a => a.toLowerCase());
const DB = path.join(__dirname, '..', 'data', 'users.json');
const PAID = ['starter', 'family', 'educator', 'school'];

const key = process.env.STRIPE_SECRET_KEY;
const stripe = key ? require('stripe')(key, {
  apiVersion: process.env.STRIPE_API_VERSION || '2025-03-31.basil',
}) : null;

(async () => {
  const raw = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const users = Array.isArray(raw) ? raw : Object.values(raw);

  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'}${ONLY.length ? ' — limited to: ' + ONLY.join(', ') : ''}\n`);

  let reset = 0, kept = 0;
  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    if (!PAID.includes(u.plan)) continue;
    if (ONLY.length && !ONLY.includes(email)) continue;

    let verdict, live = false;
    if (!u.subscription_id) {
      verdict = 'no subscription id — cannot be a real payment';
    } else if (!stripe) {
      verdict = 'has subscription id but no Stripe key to check it';
    } else {
      try {
        const sub = await stripe.subscriptions.retrieve(u.subscription_id);
        live = sub.status === 'active' || sub.status === 'trialing';
        verdict = live
          ? `backed by ${sub.status} subscription on the current key`
          : `subscription is ${sub.status}`;
      } catch (e) {
        verdict = 'subscription not found on the current key (sandbox leftover)';
      }
    }

    if (live && !ONLY.length) {
      console.log(`  KEEP   ${email.padEnd(28)} ${u.plan.padEnd(9)} ${verdict}`);
      kept++;
      continue;
    }

    console.log(`  RESET  ${email.padEnd(28)} ${u.plan.padEnd(9)} ${verdict}`);
    reset++;
    if (APPLY) {
      u.plan = 'trial';
      u.status = 'trialing';
      u.billing_provider = null;
      u.subscription_id = null;
      u.customer_id = null;
      u.current_period_end = null;
      // Give them a fresh short trial rather than locking them out entirely.
      u.trial_ends = Date.now() + 3 * 86400000;
      u.updated_at = Date.now();
    }
  }

  if (APPLY && reset) {
    const backup = DB + '.bak-reset-' + Date.now();
    fs.copyFileSync(DB, backup);
    fs.writeFileSync(DB, JSON.stringify(Array.isArray(raw) ? users : raw, null, 2));
    console.log(`\n  backup: ${path.basename(backup)}`);
  }

  console.log(`\n${reset} ${APPLY ? 'reset' : 'would be reset'} · ${kept} kept\n`);
  if (!APPLY && reset) console.log('Re-run with --apply to write. Add an email to limit it to one account.\n');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Stripe moves fields between API versions, and the webhook payload arrives in
 * whatever version the endpoint was created with. These tests lift the real
 * helpers out of server.js and feed them both the old and the new shapes.
 *
 *   node scripts/test-webhook-shapes.js
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`cannot find ${name}()`);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const secsToMs = s => (s ? s * 1000 : null);
// same one-liner as server.js; the lifted helpers resolve it from this scope
const idOf = v => (v && typeof v === 'object' ? v.id : v) || null;
const subIdFromInvoice = eval(`(${lift('subIdFromInvoice')})`);
const periodEndOfSub = eval(`(${lift('periodEndOfSub')})`);

const END = 1790000000;              // seconds
const END_MS = END * 1000;

let pass = 0, fail = 0;
function check(label, got, expected) {
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}  → ${got} (expected ${expected})`);
}

console.log('\nsubIdFromInvoice() — invoice payloads\n');

check('old shape: invoice.subscription as a string',
  subIdFromInvoice({ subscription: 'sub_OLD' }), 'sub_OLD');

check('old shape: invoice.subscription expanded to an object',
  subIdFromInvoice({ subscription: { id: 'sub_EXP' } }), 'sub_EXP');

check('new shape: invoice.parent.subscription_details.subscription',
  subIdFromInvoice({ parent: { subscription_details: { subscription: 'sub_NEW' } } }), 'sub_NEW');

check('new shape, expanded object',
  subIdFromInvoice({ parent: { subscription_details: { subscription: { id: 'sub_NEWEXP' } } } }), 'sub_NEWEXP');

check('one-off invoice with no subscription at all',
  subIdFromInvoice({ parent: null }), null);

check('null invoice', subIdFromInvoice(null), null);

console.log('\nperiodEndOfSub() — subscription payloads\n');

check('old shape: subscription.current_period_end',
  periodEndOfSub({ current_period_end: END }), END_MS);

check('new shape: items.data[0].current_period_end',
  periodEndOfSub({ items: { data: [{ current_period_end: END }] } }), END_MS);

check('new shape, several items → furthest out wins',
  periodEndOfSub({ items: { data: [
    { current_period_end: END - 86400 },
    { current_period_end: END },
    { current_period_end: END - 200 },
  ] } }), END_MS);

check('new shape with an item missing the field',
  periodEndOfSub({ items: { data: [{}, { current_period_end: END }] } }), END_MS);

check('neither shape present → null, so the plan simply never lapses',
  periodEndOfSub({ items: { data: [] } }), null);

check('null subscription', periodEndOfSub(null), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

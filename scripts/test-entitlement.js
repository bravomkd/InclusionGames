#!/usr/bin/env node
/**
 * Unit-tests hasAccess() by lifting the real function out of server.js, so the
 * assertions run against the shipped source rather than a copy of it.
 *
 *   node scripts/test-entitlement.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`cannot find ${name}()`);
  // walk braces to find the end of the function body
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const DUNNING = Number((src.match(/const DUNNING_DAYS = (\d+)/) || [])[1] || 3);

let ADMIN_EMAILS = ['admin@inclusion-games.com'];
const days = n => n * 86400000;
let NOW = Date.parse('2026-06-15T12:00:00Z');
const now = () => NOW;
const DUNNING_DAYS = DUNNING;

const hasAccess = eval(`(${lift('hasAccess')})`);

const DAY = 86400000;
let pass = 0, fail = 0;
function check(label, user, expected) {
  const got = hasAccess(user);
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}  → ${got} (expected ${expected})`);
}

const base = { email: 'a@b.de', email_verified: 1 };

console.log('\nhasAccess() — DUNNING_DAYS =', DUNNING, '\n');

check('active, no period end (legacy / CopeCart)',
  { ...base, status: 'active' }, true);

check('active, period ends tomorrow',
  { ...base, status: 'active', current_period_end: NOW + DAY }, true);

check('active, period ended yesterday → LAPSED',
  { ...base, status: 'active', current_period_end: NOW - DAY }, false);

check('canceled, still inside paid period',
  { ...base, status: 'canceled', current_period_end: NOW + 5 * DAY }, true);

check('canceled, paid period over',
  { ...base, status: 'canceled', current_period_end: NOW - DAY }, false);

check('past_due, 1 day past end (inside grace)',
  { ...base, status: 'past_due', current_period_end: NOW - DAY }, true);

check(`past_due, ${DUNNING + 1} days past end (grace expired)`,
  { ...base, status: 'past_due', current_period_end: NOW - (DUNNING + 1) * DAY }, false);

check('trialing, trial still running',
  { ...base, status: 'trialing', trial_ends: NOW + DAY }, true);

check('trialing, trial expired',
  { ...base, status: 'trialing', trial_ends: NOW - DAY }, false);

check('unverified email, even when active',
  { ...base, email_verified: 0, status: 'active' }, false);

check('admin bypasses everything',
  { email: 'admin@inclusion-games.com', email_verified: 0, status: 'canceled',
    current_period_end: NOW - 999 * DAY }, true);

check('no user', null, false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

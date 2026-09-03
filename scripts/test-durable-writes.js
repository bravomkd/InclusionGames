#!/usr/bin/env node
/**
 * Tests the atomic write path lifted out of server.js, in a throwaway directory.
 * Never touches data/users.json.
 *
 *   node scripts/test-durable-writes.js
 */
const fs = require('fs');
const os = require('os');
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

const writeJsonAtomic = eval(`(${lift('writeJsonAtomic')})`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-durable-'));
const DB_FILE = path.join(dir, 'users.json');

// Rebuild persistUsers against this scratch file, using the real source so the
// guard logic under test is the shipped one.
let users = [];
let _lastGoodCount = 0;
const persistUsers = eval(`(${lift('persistUsers').replace(/\bDB_FILE\b/g, 'DB_FILE')})`);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  cond ? pass++ : fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${label}${detail ? '  → ' + detail : ''}`);
}

console.log('\nDurable writes\n');

// 1. a normal write produces a complete, parseable file
users = [{ email: 'a@b.de', plan: 'family' }, { email: 'c@d.de', plan: 'trial' }];
persistUsers();
let round = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
check('writes a complete, parseable file', round.length === 2 && round[0].email === 'a@b.de');

// 2. no temp files left behind
check('leaves no .tmp files behind',
  fs.readdirSync(dir).filter(f => f.includes('.tmp-')).length === 0,
  fs.readdirSync(dir).join(' '));

// 3. an update replaces cleanly
users.push({ email: 'e@f.de', plan: 'school' });
persistUsers();
round = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
check('update replaces cleanly', round.length === 3);

// 4. THE IMPORTANT ONE — an accidental wipe is refused
const before = fs.readFileSync(DB_FILE, 'utf8');
users = [];
persistUsers();
const after = fs.readFileSync(DB_FILE, 'utf8');
check('refuses to write 0 users over a populated table', before === after,
  JSON.parse(after).length + ' records still on disk');

// 5. a non-array is refused
users = { not: 'an array' };
persistUsers();
check('refuses a non-array', fs.readFileSync(DB_FILE, 'utf8') === after);

// 6. deleting down to one user is still allowed (not a false positive)
users = [{ email: 'a@b.de' }, { email: 'c@d.de' }, { email: 'e@f.de' }];
persistUsers();
users = [{ email: 'a@b.de' }];
persistUsers();
check('still allows a genuine delete down to one',
  JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).length === 1);

// 7. the file is never observed truncated: rename means it always parses
let torn = 0;
for (let i = 0; i < 50; i++) {
  users = Array.from({ length: 20 + i }, (_, n) => ({ email: `u${n}@x.de`, blob: 'y'.repeat(500) }));
  persistUsers();
  try { JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { torn++; }
}
check('50 rapid rewrites, file always parseable', torn === 0, torn + ' torn reads');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

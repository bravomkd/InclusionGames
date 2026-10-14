/* The translation dictionary.

   English is the source: the keys ARE the English strings, and anything with
   no entry for the current language is left in English. That is a sensible
   fallback, but it means a missing key is invisible to whoever added it and
   shows up as an English sentence in the middle of a German page — for a
   paying customer, on a site sold in four languages.

   assets/i18n.js is a browser IIFE with no export, so the dictionary is read
   out of the source rather than imported. That keeps the file exactly as the
   browser needs it; nothing is restructured just to be testable. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'i18n.js'), 'utf8');

/* Slice out the `const T = { … }` object literal. Brace counting has to skip
   over strings and comments, or a "}" inside a translated sentence ends the
   object early. */
function extractObjectLiteral(src, marker) {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `could not find ${marker} in assets/i18n.js`);
  let i = src.indexOf('{', start);
  const open = i;
  let depth = 0;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && next === '*') { i = src.indexOf('*/', i) + 2; continue; }

    if (c === '{') depth += 1;
    if (c === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
    i += 1;
  }
  throw new Error('unbalanced braces while reading the dictionary');
}

const T = vm.runInNewContext(`(${extractObjectLiteral(SRC, 'const T =')})`);
const LANGS = vm.runInNewContext(`(${/const LANGS = (\[[^\]]*\])/.exec(SRC)[1]})`);

test('the dictionary covers every language the picker offers', () => {
  // 'en' is the source, so it has no block of its own.
  const translated = LANGS.filter((l) => l !== 'en');
  assert.ok(translated.length > 0, 'there should be languages to translate into');
  translated.forEach((lang) => {
    assert.ok(T[lang], `the language picker offers "${lang}" but there is no dictionary for it`);
  });
  Object.keys(T).forEach((lang) => {
    assert.ok(LANGS.includes(lang), `there is a dictionary for "${lang}" that the picker never offers`);
  });
});

test('every language translates the same set of strings', () => {
  const langs = Object.keys(T);
  // The union of every key any language knows about is the full set of
  // strings the site displays.
  const all = new Set();
  langs.forEach((l) => Object.keys(T[l]).forEach((k) => all.add(k)));

  const missing = {};
  langs.forEach((l) => {
    const gaps = [...all].filter((k) => !(k in T[l]));
    if (gaps.length) missing[l] = gaps;
  });

  const report = Object.entries(missing)
    .map(([l, gaps]) => `  ${l} is missing ${gaps.length}:\n${gaps.slice(0, 8).map((g) => `    · ${JSON.stringify(g)}`).join('\n')}`)
    .join('\n');

  assert.equal(Object.keys(missing).length, 0,
    `these strings fall back to English in some languages:\n${report}`);
});

test('no translation is blank or left as the English it replaces', () => {
  Object.entries(T).forEach(([lang, dict]) => {
    Object.entries(dict).forEach(([key, value]) => {
      assert.equal(typeof value, 'string', `${lang}: ${JSON.stringify(key)} is not a string`);
      assert.notEqual(value.trim(), '',
        `${lang}: ${JSON.stringify(key)} is blank, which would wipe the text off the page`);
    });
  });
});

test('prices are never put in the dictionary', () => {
  /* Prices come from the server, in one place: PLANS, served through
     /api/payments/config. None of them are in here, and none should be.
     A price copied into a translation is a price that can drift — the German
     page saying 19,99 while Stripe charges 24,99 is a figure the customer can
     hold the business to, and nothing would flag it. This test fails the
     moment somebody pastes one in. */
  const money = /(?:€|\$|£)\s?\d|\d+[.,]\d{2}\s?(?:€|EUR|\$|USD|£|GBP)?/;
  const found = [];
  Object.entries(T).forEach(([lang, dict]) => {
    Object.entries(dict).forEach(([key, value]) => {
      if (money.test(key)) found.push(`${lang}: key ${JSON.stringify(key)}`);
      if (money.test(value)) found.push(`${lang}: ${JSON.stringify(key)} → ${JSON.stringify(value)}`);
    });
  });
  assert.deepEqual(found, [],
    `prices belong in PLANS on the server, not in the translations:\n  ${found.join('\n  ')}`);
});

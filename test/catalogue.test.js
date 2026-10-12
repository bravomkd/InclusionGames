/* The catalogue is the list every other part of the site believes.

   The dashboard renders from it, the reports name games from it, and the
   server looks titles up in it. It used to be written twice — once here
   and once inline in dashboard.html — and nothing complained when only
   one copy was edited. These tests exist so that adding a game is either
   complete or loudly incomplete, never quietly half-done. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cat = require('../assets/catalogue.js');

test('every game in the catalogue has a page on disk', () => {
  const missing = cat.games.filter(g => !fs.existsSync(path.join(ROOT, g.file)));
  assert.deepEqual(missing.map(g => `${g.id} -> ${g.file}`), [],
    'the dashboard would show a card that leads to a 404');
});

test('every page on disk is in the catalogue', () => {
  /* The failure this is really for: a finished, working, paywalled game
     that nothing links to, because adding the page and adding the
     catalogue entry are two separate acts. That happened with Animal
     Run and went unnoticed until somebody went looking. */
  const listed = new Set(cat.games.map(g => g.file));
  const onDisk = fs.readdirSync(ROOT).filter(f => /^game\d+\.html$/.test(f));
  const orphans = onDisk.filter(f => !listed.has(f));
  assert.deepEqual(orphans, [], 'these games exist but nothing links to them');
});

test('ids are the shape the server will accept', () => {
  // server.js gates settings and progress behind /^game\d{1,3}$/. An id
  // outside that is rejected, so a teacher's settings silently vanish.
  const VALID = /^game\d{1,3}$/;
  for (const g of cat.games) {
    assert.match(g.id, VALID, `${g.title} has id ${g.id}`);
    assert.equal(g.id, 'game' + String(g.n).padStart(2, '0'));
  }
});

test('nothing is listed twice', () => {
  const ns = cat.games.map(g => g.n);
  const files = cat.games.map(g => g.file);
  assert.equal(new Set(ns).size, ns.length, 'two games share a number');
  assert.equal(new Set(files).size, files.length, 'two games share a page');
});

test('every game belongs to a category that exists', () => {
  for (const g of cat.games) {
    assert.ok(cat.cats[g.cat], `${g.id} is filed under "${g.cat}", which is not a category`);
  }
});

test('every category can be named in all four languages', () => {
  for (const key of Object.keys(cat.cats)) {
    for (const lang of ['en', 'de', 'pl', 'es']) {
      const n = cat.catName(key, lang);
      assert.ok(n && n !== key, `category "${key}" has no ${lang} name`);
    }
  }
});

test('the dashboard keeps no second copy of the list', () => {
  const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  assert.ok(html.includes('assets/catalogue.js'), 'the dashboard does not load the catalogue');
  assert.ok(html.includes('IG_CATALOGUE.games'), 'the dashboard does not render from the catalogue');
  assert.ok(!/\{\s*n\s*:\s*\d+\s*,\s*icon\s*:/.test(html),
    'dashboard.html has game entries written into it again — '
    + 'that is the duplication this test exists to prevent');
});

test('every age band is one the dashboard knows how to sort', () => {
  /* buildGames() sorts by indexOf in a fixed list. An age string that is
     not in it gets -1 and the whole band jumps to the top of the page,
     which looks like a layout bug rather than a typo. */
  const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const m = html.match(/var order=\[([^\]]+)\]/);
  assert.ok(m, 'could not find the age ordering in dashboard.html');
  const order = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  for (const g of cat.games) {
    assert.ok(order.indexOf(g.age) >= 0,
      `${g.id} is "${g.age}", which is not in the dashboard's ordering ${JSON.stringify(order)}`);
  }
});

test('titles and descriptions are present and sane', () => {
  for (const g of cat.games) {
    assert.ok(g.title && g.title.length > 2, `${g.id} has no title`);
    assert.ok(g.desc && g.desc.length > 8, `${g.id} has no description`);
    assert.ok(g.icon && g.icon.length <= 8, `${g.id} has a strange icon`);
    assert.equal(cat.titleOf(g.id), g.title);
    assert.equal(cat.catOf(g.id), g.cat);
  }
});

test('a game that no longer exists still renders as something readable', () => {
  // Old progress rows outlive the catalogue.
  assert.equal(cat.titleOf('game99'), 'game99');
  assert.equal(cat.catOf('game99'), null);
  assert.equal(cat.byId('game99'), null);
});

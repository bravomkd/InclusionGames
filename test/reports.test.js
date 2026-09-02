/* The Reports section: the analytics maths, then the routes that serve it. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, makeUser, authHeader } = require('./helpers');
const analytics = require('../lib/analytics.js');
const reportPdf = require('../lib/report-pdf.js');
const catalogue = require('../assets/catalogue.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

/* A session `daysAgo` days back. Timestamps are nudged to midday so the local
   day never straddles a boundary in whatever timezone the tests run in. */
function sessionAt(base, game, score, total, daysAgo, extra = {}) {
  const d = new Date(base - daysAgo * DAY);
  d.setHours(12, 0, 0, 0);
  return { game, score, total, timeMs: 90000, lang: 'en', at: d.getTime(), ...extra };
}

function session(game, score, total, daysAgo, extra = {}) {
  return sessionAt(NOW, game, score, total, daysAgo, extra);
}

function childWith(rows) {
  return { id: 'c1', name: 'Mia', note: '', progress: rows };
}

test('the catalogue is consistent', () => {
  assert.equal(catalogue.games.length, 42);
  catalogue.games.forEach((g) => {
    assert.ok(catalogue.cats[g.cat], `${g.id} has an unknown category "${g.cat}"`);
    assert.equal(catalogue.byId(g.id).title, g.title);
  });
  assert.equal(catalogue.titleOf('game07'), 'Egg Counter');
  assert.equal(catalogue.catOf('game07'), 'mat');
  // A game that no longer exists still renders as something.
  assert.equal(catalogue.titleOf('game99'), 'game99');
  assert.equal(catalogue.catOf('game99'), null);
});

test('analytics: an empty history', () => {
  const r = analytics.buildReport(childWith([]), { now: NOW });
  assert.equal(r.overview.sessions, 0);
  assert.equal(r.overview.accuracy, null);
  assert.equal(r.hasEnoughData, false);
  assert.equal(r.byGame.length, 0);
  assert.equal(r.strengths.length, 0);
  // Every skill area still appears, so the page can show what hasn't been tried.
  assert.equal(r.bySkill.length, Object.keys(catalogue.cats).length);
  assert.equal(r.untouched.length, Object.keys(catalogue.cats).length);
});

test('analytics: totals and accuracy', () => {
  const rows = [
    session('game02', 8, 10, 3),
    session('game02', 9, 10, 2),
    session('game07', 5, 10, 1),
  ];
  const r = analytics.buildReport(childWith(rows), { now: NOW });
  assert.equal(r.overview.sessions, 3);
  assert.equal(r.overview.questionsAnswered, 30);
  assert.equal(r.overview.questionsCorrect, 22);
  assert.equal(r.overview.accuracy, 73);           // 22/30
  assert.equal(r.overview.gamesPlayed, 2);
  assert.equal(r.overview.activeDays, 3);
  assert.equal(r.overview.timeMs, 270000);
});

test('analytics: will not label a skill on too little evidence', () => {
  // Two perfect answers is not a strength.
  const thin = analytics.buildReport(childWith([session('game02', 2, 2, 1)]), { now: NOW });
  const lang = thin.bySkill.find((s) => s.cat === 'jezyk');
  assert.equal(lang.accuracy, 100);
  assert.equal(lang.band, null, '100% off 2 questions must not count as a verdict');
  assert.equal(thin.strengths.length, 0);
  assert.equal(thin.hasEnoughData, false);

  // Past the threshold it is willing to judge.
  const rows = [];
  for (let i = 0; i < 5; i += 1) rows.push(session('game02', 9, 10, i + 1));
  const solid = analytics.buildReport(childWith(rows), { now: NOW });
  const lang2 = solid.bySkill.find((s) => s.cat === 'jezyk');
  assert.equal(lang2.band, 'strong');
  assert.ok(solid.strengths.some((s) => s.cat === 'jezyk'));
  assert.equal(solid.hasEnoughData, true);
});

test('analytics: bands split strong / steady / practise', () => {
  const mk = (score) => {
    const rows = [];
    for (let i = 0; i < 5; i += 1) rows.push(session('game07', score, 10, i + 1));
    return analytics.buildReport(childWith(rows), { now: NOW }).bySkill.find((s) => s.cat === 'mat');
  };
  assert.equal(mk(9).band, 'strong');    // 90%
  assert.equal(mk(6).band, 'steady');    // 60%
  assert.equal(mk(3).band, 'practise');  // 30%
});

test('analytics: a weak game is flagged even when its skill area averages out', () => {
  // Strong at counting, weak at times tables — both are Math.
  const rows = [];
  for (let i = 0; i < 6; i += 1) rows.push(session('game07', 10, 10, i + 1));
  for (let i = 0; i < 6; i += 1) rows.push(session('game11', 3, 10, i + 7));
  const r = analytics.buildReport(childWith(rows), { now: NOW });

  const math = r.bySkill.find((s) => s.cat === 'mat');
  assert.equal(math.accuracy, 65);
  assert.equal(math.band, 'steady', 'the area as a whole looks middling');

  const times = r.byGame.find((g) => g.game === 'game11');
  assert.equal(times.band, 'practise', 'the individual weak game still has to surface');
  const counting = r.byGame.find((g) => g.game === 'game07');
  assert.equal(counting.band, 'strong');
});

test('analytics: trend needs a real run of sessions', () => {
  const few = [session('game02', 2, 10, 3), session('game02', 9, 10, 1)];
  assert.equal(analytics.buildReport(childWith(few), { now: NOW }).byGame[0].trend, 'flat',
    'two sessions is not a trend');

  const improving = [];
  for (let i = 0; i < 9; i += 1) improving.push(session('game02', i < 3 ? 3 : 9, 10, 9 - i));
  assert.equal(analytics.buildReport(childWith(improving), { now: NOW }).byGame[0].trend, 'up');

  const declining = [];
  for (let i = 0; i < 9; i += 1) declining.push(session('game02', i < 3 ? 9 : 3, 10, 9 - i));
  assert.equal(analytics.buildReport(childWith(declining), { now: NOW }).byGame[0].trend, 'down');
});

test('analytics: streaks count consecutive days', () => {
  // A "current" streak is relative to today, so these rows are anchored to the
  // real clock rather than the fixed NOW the other tests use.
  const today = Date.now();
  const rows = [
    sessionAt(today, 'game02', 5, 10, 0),
    sessionAt(today, 'game02', 5, 10, 1),
    sessionAt(today, 'game02', 5, 10, 2),
  ];
  const r = analytics.buildReport(childWith(rows), { now: today });
  assert.equal(r.overview.currentStreakDays, 3);
  assert.equal(r.overview.longestStreakDays, 3);

  // A gap resets the current streak but not the longest.
  const gapped = [
    sessionAt(today, 'game02', 5, 10, 20), sessionAt(today, 'game02', 5, 10, 19),
    sessionAt(today, 'game02', 5, 10, 18), sessionAt(today, 'game02', 5, 10, 17),
  ];
  const r2 = analytics.buildReport(childWith(gapped), { now: today });
  assert.equal(r2.overview.currentStreakDays, 0, 'an old run is not a current streak');
  assert.equal(r2.overview.longestStreakDays, 4);
});

test('analytics: the range filter excludes older sessions', () => {
  const rows = [session('game02', 10, 10, 60), session('game02', 0, 10, 2)];
  const all = analytics.buildReport(childWith(rows), { now: NOW });
  const recent = analytics.buildReport(childWith(rows), { now: NOW, rangeDays: 30 });
  assert.equal(all.overview.sessions, 2);
  assert.equal(recent.overview.sessions, 1);
  assert.equal(recent.overview.accuracy, 0, 'only the recent, weaker session counts');
  assert.equal(recent.timeline.length, 30);
});

test('analytics: rubbish rows do not crash the report', () => {
  const rows = [
    session('game02', 5, 10, 1),
    { game: 'game99', score: 3, total: 5, timeMs: 1000, at: NOW - DAY },  // unknown game
    { game: 'game02', score: 1, total: 0, timeMs: 0, at: NOW - DAY },      // zero total
    null,
    { game: 'game02' },                                                    // no timestamp
  ];
  const r = analytics.buildReport(childWith(rows), { now: NOW });
  assert.equal(r.overview.sessions, 3, 'only rows with a usable timestamp count');
  assert.ok(r.byGame.some((g) => g.game === 'game99'));
  assert.ok(Number.isFinite(r.overview.accuracy));
});

test('the PDF renders in every supported language', async () => {
  const rows = [];
  for (let i = 0; i < 8; i += 1) rows.push(session('game02', 8, 10, i + 1));
  const report = analytics.buildReport(childWith(rows), { now: NOW });

  for (const lang of reportPdf.LANGS) {
    const { bytes, fileName } = await reportPdf.renderReport(report, { lang, carer: 'Ms Smith' });
    assert.ok(bytes.length > 1000, `${lang} PDF looks empty`);
    assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), '%PDF', `${lang} is not a PDF`);
    assert.match(fileName, /\.pdf$/);
    assert.ok(!/[^\x20-\x7E.]/.test(fileName), `${lang} filename has characters that break downloads: ${fileName}`);
  }
});

test('the PDF renders for a child who has never played', async () => {
  const report = analytics.buildReport(childWith([]), { now: NOW });
  const { bytes } = await reportPdf.renderReport(report, { lang: 'en' });
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), '%PDF');
});

test('report routes', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const owner = await makeUser(srv, 'owner@example.com');
  const stranger = await makeUser(srv, 'stranger@example.com');

  // The account is seeded with a demo child; use it and record some play.
  const list = await (await srv.get('/api/children', { headers: authHeader(owner.token) })).json();
  const childId = list.children[0].id;

  for (const [game, score] of [['game02', 9], ['game02', 8], ['game11', 3]]) {
    const res = await srv.postJson(`/api/children/${childId}/progress`,
      { game, score, total: 10, timeMs: 60000, lang: 'en' },
      { headers: authHeader(owner.token) });
    assert.equal(res.status, 200);
  }

  await t.test('analytics reflects the recorded sessions', async () => {
    const res = await srv.get(`/api/children/${childId}/analytics`, { headers: authHeader(owner.token) });
    assert.equal(res.status, 200);
    const { report } = await res.json();
    assert.equal(report.overview.sessions, 3);
    assert.equal(report.overview.questionsAnswered, 30);
    assert.equal(report.overview.accuracy, 67);
    assert.equal(report.byGame.length, 2);
  });

  await t.test('needs authentication', async () => {
    assert.equal((await srv.get(`/api/children/${childId}/analytics`)).status, 401);
    assert.equal((await srv.get(`/api/children/${childId}/report.pdf`)).status, 401);
  });

  await t.test('one account cannot read another account\'s child', async () => {
    const res = await srv.get(`/api/children/${childId}/analytics`, { headers: authHeader(stranger.token) });
    assert.equal(res.status, 404);
    const pdf = await srv.get(`/api/children/${childId}/report.pdf`, { headers: authHeader(stranger.token) });
    assert.equal(pdf.status, 404);
  });

  await t.test('serves a real PDF with a sensible filename', async () => {
    const res = await srv.get(`/api/children/${childId}/report.pdf?download=1&lang=de`, {
      headers: authHeader(owner.token),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /^attachment; filename=".+\.pdf"$/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString(), '%PDF');
  });

  await t.test('opens inline unless a download is asked for', async () => {
    const res = await srv.get(`/api/children/${childId}/report.pdf`, { headers: authHeader(owner.token) });
    assert.match(res.headers.get('content-disposition'), /^inline;/);
  });

  await t.test('falls back to English for an unknown report language', async () => {
    const res = await srv.get(`/api/children/${childId}/report.pdf?lang=klingon`, {
      headers: authHeader(owner.token),
    });
    assert.equal(res.status, 200);
  });

  await t.test('emailing validates the address and explains a missing mailer', async () => {
    const bad = await srv.postJson(`/api/children/${childId}/report/send`,
      { to: 'not-an-email' }, { headers: authHeader(owner.token) });
    assert.equal(bad.status, 400);

    // No SMTP is configured in tests, so this must say so rather than pretend.
    const noSmtp = await srv.postJson(`/api/children/${childId}/report/send`,
      { to: 'parent@example.com' }, { headers: authHeader(owner.token) });
    assert.equal(noSmtp.status, 503);
    assert.match((await noSmtp.json()).error, /download/i, 'should point at the download fallback');
  });

  await t.test('a stranger cannot email somebody else\'s report anywhere', async () => {
    const res = await srv.postJson(`/api/children/${childId}/report/send`,
      { to: 'attacker@example.com' }, { headers: authHeader(stranger.token) });
    assert.equal(res.status, 404);
  });

  await t.test('the Reports page is behind the subscription gate', async () => {
    for (const p of ['/report.html', '/report', '/REPORT.HTML']) {
      const res = await srv.get(p);
      assert.equal(res.status, 302, `${p} should be gated`);
    }
  });
});

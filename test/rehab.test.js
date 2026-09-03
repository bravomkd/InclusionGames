/* The stroke rehab section: the catalogue, the progress maths, and the routes. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, makeUser, authHeader } = require('./helpers');
const rehabAnalytics = require('../lib/rehab-analytics.js');
const catalogue = require('../assets/rehab-catalogue.js');

const ROOT = path.join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function sessionAt(base, exercise, reps, targetReps, daysAgo, extra = {}) {
  const d = new Date(base - daysAgo * DAY);
  d.setHours(12, 0, 0, 0);
  return {
    exercise, side: 'left', sets: 2, reps, targetReps,
    bestAmplitude: 80, avgAmplitude: 65, symmetry: null,
    longestHoldMs: 0, timeMs: 240000, calibrationWeak: false, lang: 'en',
    at: d.getTime(), ...extra,
  };
}
const session = (...a) => sessionAt(NOW, ...a);
const patientWith = (rows) => ({ id: 'p1', name: 'Sam', rehab: rows });

test('the rehab catalogue is internally consistent', () => {
  assert.ok(catalogue.exercises.length >= 9);
  catalogue.exercises.forEach((e) => {
    assert.ok(catalogue.groups[e.group], `${e.id} has unknown group "${e.group}"`);
    assert.ok(['face', 'pose', 'hands'].includes(e.tracker), `${e.id} has unknown tracker`);
    assert.ok(['reps', 'hold', 'targets'].includes(e.type), `${e.id} has unknown type`);
    assert.ok(e.title.en && e.short.en, `${e.id} is missing English text`);
    assert.ok(e.rationale && e.rationale.en, `${e.id} must explain why it exists`);
    assert.equal(catalogue.byId(e.id).id, e.id);
    if (e.type !== 'targets') assert.ok(e.defaultReps > 0, `${e.id} needs a repetition count`);
    if (e.type === 'hold') assert.ok(e.holdMs > 0, `${e.id} is a hold and needs holdMs`);
  });
});

test('every exercise has a page that wires it up', () => {
  catalogue.exercises.forEach((e) => {
    const file = path.join(ROOT, `${e.id}.html`);
    assert.ok(fs.existsSync(file), `${e.id}.html is missing`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /assets\/rehab-engine\.js/, `${e.id}.html does not load the engine`);
    assert.match(html, /assets\/rehab-catalogue\.js/, `${e.id}.html does not load the catalogue`);
    assert.match(html, /assets\/rehab-metrics\.js/, `${e.id}.html does not load the measurements`);
    assert.ok(html.includes(`id: '${e.id}'`), `${e.id}.html does not start the right exercise`);

    // Order matters: the engine reads the measurement module as it loads, and
    // the catalogue before that. Getting it wrong gives a blank page.
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const at = (name) => srcs.findIndex((s) => s.includes(name));
    assert.ok(at('rehab-catalogue.js') < at('rehab-metrics.js')
      && at('rehab-metrics.js') < at('rehab-engine.js'),
    `${e.id}.html loads its scripts out of order — catalogue, then metrics, then engine: ${srcs}`);
  });
});

test('the hub says which languages these exercises exist in', () => {
  // The catalogue deliberately does not translate clinical wording into
  // Polish or Spanish. Somebody arriving with one of those selected has to be
  // told why the page is in English rather than left guessing.
  const html = fs.readFileSync(path.join(ROOT, 'stroke.html'), 'utf8');
  assert.match(html, /langFallback/, 'no message for an unsupported language');
  assert.ok(/English and German/i.test(html), 'the hub should name the languages it has');
  catalogue.langs.forEach((l) => {
    assert.ok(html.includes(`data-lang="${l}"`), `no way to choose ${l}`);
  });
});

test('the hub page carries the safety and privacy notices', () => {
  const html = fs.readFileSync(path.join(ROOT, 'stroke.html'), 'utf8');
  // These are not decorative. A rehab tool aimed at patients has to say
  // plainly what it is not, and what happens to the camera feed.
  assert.match(html, /not a medical device/i);
  assert.match(html, /does not diagnose/i);
  assert.match(html, /never leaves the device/i);
  assert.match(html, /physiotherapist|therapist/i);
  assert.match(html, /dizzy/i, 'should tell the user when to stop');
});

test('no rehab page claims to treat or cure', () => {
  // Guards against wording drifting into medical claims later.
  const files = catalogue.exercises.map((e) => `${e.id}.html`).concat(['stroke.html']);
  const banned = /\b(cure|cures|heals?|guarantees?|clinically proven|FDA[- ]approved|CE[- ]marked)\b/i;
  files.forEach((f) => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!banned.test(html), `${f} contains a medical claim it cannot support`);
  });
  const cat = fs.readFileSync(path.join(ROOT, 'assets/rehab-catalogue.js'), 'utf8');
  assert.ok(!banned.test(cat), 'the catalogue contains an unsupportable medical claim');
});

test('swallowing exercises are deliberately absent', () => {
  // Practising swallowing unsupervised carries an aspiration risk.
  const banned = /\b(swallow|swallowing|dysphagia|schluck)/i;
  catalogue.exercises.forEach((e) => {
    assert.ok(!banned.test(JSON.stringify(e)), `${e.id} looks like a swallowing exercise`);
  });
});

test('rehab analytics: no sessions', () => {
  const r = rehabAnalytics.buildRehabReport(patientWith([]), { now: NOW });
  assert.equal(r.hasSessions, false);
  assert.equal(r.overview.sessions, 0);
  assert.equal(r.overview.completion, null);
  assert.equal(r.byExercise.length, 0);
  // Body areas still listed, so the page can show what has not been tried.
  assert.equal(r.byGroup.length, Object.keys(catalogue.groups).length);
});

test('rehab analytics: counts repetitions against what was prescribed', () => {
  const rows = [
    session('rehab01', 20, 20, 3),
    session('rehab01', 10, 20, 2),
    session('rehab09', 12, 24, 1),
  ];
  const r = rehabAnalytics.buildRehabReport(patientWith(rows), { now: NOW });
  assert.equal(r.overview.sessions, 3);
  assert.equal(r.overview.repsCompleted, 42);
  assert.equal(r.overview.repsPrescribed, 64);
  assert.equal(r.overview.completion, 66);
  assert.equal(r.overview.activeDays, 3);
  assert.equal(r.overview.exercisesTried, 2);
  assert.equal(r.byExercise.length, 2);
});

test('rehab analytics: a trend needs a real run of sessions', () => {
  const few = [session('rehab01', 5, 20, 2), session('rehab01', 20, 20, 1)];
  const r = rehabAnalytics.buildRehabReport(patientWith(few), { now: NOW });
  assert.equal(r.overview.completionTrend, 'flat', 'two sessions is not a trend');
  assert.equal(r.hasEnoughForTrend, false);

  const improving = [];
  for (let i = 0; i < 9; i += 1) improving.push(session('rehab01', i < 3 ? 5 : 19, 20, 9 - i));
  const r2 = rehabAnalytics.buildRehabReport(patientWith(improving), { now: NOW });
  assert.equal(r2.overview.completionTrend, 'up');
  assert.equal(r2.hasEnoughForTrend, true);
});

test('rehab analytics: surfaces sessions where calibration saw nothing', () => {
  // If the camera could not see the movement, every number from that session
  // is unreliable and the report has to say so rather than quietly average it in.
  const rows = [
    session('rehab01', 20, 20, 3),
    session('rehab01', 20, 20, 2, { calibrationWeak: true }),
  ];
  const r = rehabAnalytics.buildRehabReport(patientWith(rows), { now: NOW });
  assert.equal(r.weakCalibrationCount, 1);
  assert.equal(r.byExercise[0].weakCalibrations, 1);
});

test('rehab analytics: tracks left/right evenness where it is measured', () => {
  const rows = [];
  for (let i = 0; i < 9; i += 1) {
    rows.push(session('rehab02', 10, 10, 9 - i, { symmetry: i < 3 ? 40 : 80 }));
  }
  const r = rehabAnalytics.buildRehabReport(patientWith(rows), { now: NOW });
  assert.ok(r.overview.meanSymmetry > 40 && r.overview.meanSymmetry < 80);
  assert.equal(r.overview.symmetryTrend, 'up');
});

test('rehab analytics: range filter and malformed rows', () => {
  const rows = [
    session('rehab01', 20, 20, 60),
    session('rehab01', 5, 20, 2),
    null,
    { exercise: 'rehab01' },              // no timestamp
  ];
  const all = rehabAnalytics.buildRehabReport(patientWith(rows), { now: NOW });
  const recent = rehabAnalytics.buildRehabReport(patientWith(rows), { now: NOW, rangeDays: 30 });
  assert.equal(all.overview.sessions, 2);
  assert.equal(recent.overview.sessions, 1);
  assert.equal(recent.overview.completion, 25);
});

test('rehab routes', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());

  const owner = await makeUser(srv, 'rehab-owner@example.com');
  const stranger = await makeUser(srv, 'rehab-stranger@example.com');
  const list = await (await srv.get('/api/children', { headers: authHeader(owner.token) })).json();
  const childId = list.children[0].id;

  await t.test('records a session', async () => {
    const res = await srv.postJson(`/api/children/${childId}/rehab-session`, {
      exercise: 'rehab01', side: 'left', sets: 2, reps: 18, targetReps: 20,
      bestAmplitude: 88, avgAmplitude: 71, symmetry: null,
      longestHoldMs: 0, timeMs: 300000, lang: 'en',
    }, { headers: authHeader(owner.token) });
    assert.equal(res.status, 200);

    const stored = srv.readUsers()
      .find((u) => u.email === 'rehab-owner@example.com')
      .children.find((c) => c.id === childId).rehab;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].exercise, 'rehab01');
    assert.equal(stored[0].reps, 18);
  });

  await t.test('an exercise that measures no range stores no range', async () => {
    // The scanning and reaching exercises only ask whether a target was
    // reached. Storing a 0 or a 100 for "best range" there would put a
    // measurement in the record that nothing measured.
    const res = await srv.postJson(`/api/children/${childId}/rehab-session`, {
      exercise: 'rehab07', side: 'left', sets: 1, reps: 12, targetReps: 15,
      bestAmplitude: null, avgAmplitude: null, symmetry: null,
      longestHoldMs: 0, timeMs: 200000, lang: 'en',
    }, { headers: authHeader(owner.token) });
    assert.equal(res.status, 200);

    const rows = srv.readUsers()
      .find((u) => u.email === 'rehab-owner@example.com')
      .children.find((c) => c.id === childId).rehab;
    const rec = rows[rows.length - 1];
    assert.equal(rec.bestAmplitude, null);
    assert.equal(rec.avgAmplitude, null);
    assert.equal(rec.reps, 12, 'the countable part is still recorded');
  });

  await t.test('rejects an exercise that does not exist', async () => {
    const res = await srv.postJson(`/api/children/${childId}/rehab-session`,
      { exercise: 'rehab99', reps: 10, targetReps: 10 },
      { headers: authHeader(owner.token) });
    assert.equal(res.status, 400);
  });

  await t.test('clamps values instead of trusting the client', async () => {
    await srv.postJson(`/api/children/${childId}/rehab-session`, {
      exercise: 'rehab02', side: 'nonsense', sets: 9999, reps: -5, targetReps: 1e9,
      bestAmplitude: 100000, symmetry: 500, longestHoldMs: -1, timeMs: 1e12, lang: 'klingon',
    }, { headers: authHeader(owner.token) });

    const rows = srv.readUsers()
      .find((u) => u.email === 'rehab-owner@example.com')
      .children.find((c) => c.id === childId).rehab;
    const rec = rows[rows.length - 1];
    assert.equal(rec.side, 'both', 'an unknown side falls back rather than storing junk');
    assert.ok(rec.sets <= 20 && rec.reps >= 0 && rec.targetReps <= 500);
    assert.ok(rec.bestAmplitude <= 200);
    assert.ok(rec.symmetry <= 100);
    assert.ok(rec.longestHoldMs >= 0);
    assert.equal(rec.lang, 'en');
  });

  await t.test('never stores video or landmark data', async () => {
    // The page promises the camera never leaves the device; make that hard
    // to break by accident later.
    await srv.postJson(`/api/children/${childId}/rehab-session`, {
      exercise: 'rehab01', reps: 5, targetReps: 10,
      landmarks: [[0.1, 0.2]], frame: 'data:image/png;base64,AAAA', video: 'blob:x',
    }, { headers: authHeader(owner.token) });

    const rows = srv.readUsers()
      .find((u) => u.email === 'rehab-owner@example.com')
      .children.find((c) => c.id === childId).rehab;
    const rec = rows[rows.length - 1];
    assert.equal(rec.landmarks, undefined);
    assert.equal(rec.frame, undefined);
    assert.equal(rec.video, undefined);
    assert.ok(!JSON.stringify(rec).includes('base64'));
  });

  await t.test('analytics reflects what was recorded', async () => {
    const res = await srv.get(`/api/children/${childId}/rehab-analytics`, {
      headers: authHeader(owner.token),
    });
    assert.equal(res.status, 200);
    const { report } = await res.json();
    assert.ok(report.overview.sessions >= 3);
    assert.equal(report.hasSessions, true);
  });

  await t.test('needs authentication and the right account', async () => {
    assert.equal((await srv.get(`/api/children/${childId}/rehab-analytics`)).status, 401);
    const other = await srv.get(`/api/children/${childId}/rehab-analytics`, {
      headers: authHeader(stranger.token),
    });
    assert.equal(other.status, 404);
    const post = await srv.postJson(`/api/children/${childId}/rehab-session`,
      { exercise: 'rehab01', reps: 1, targetReps: 1 }, { headers: authHeader(stranger.token) });
    assert.equal(post.status, 404);
  });

  await t.test('the section and its exercises are behind the subscription gate', async () => {
    for (const p of ['/stroke.html', '/stroke', '/rehab01.html', '/rehab01', '/REHAB01']) {
      const res = await srv.get(p);
      assert.equal(res.status, 302, `${p} should be gated`);
      assert.match(res.headers.get('location'), /login\.html$/);
    }
  });

  await t.test('the shared engine assets stay public', async () => {
    // They are just code; gating them would break the gated pages that load them.
    for (const p of ['/assets/rehab-engine.js', '/assets/rehab-catalogue.js', '/assets/rehab-engine.css']) {
      assert.equal((await srv.get(p)).status, 200, `${p} should be served`);
    }
  });
});

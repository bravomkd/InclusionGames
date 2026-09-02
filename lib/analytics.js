/* ============================================================
 * InclusionGames — turns a child's raw progress rows into the
 * numbers shown in the Reports section and printed in the PDF.
 *
 * One module for both, so the page a parent looks at and the report
 * they are emailed can never disagree.
 *
 * A progress row is: { game, score, total, timeMs, lang, at }
 * ============================================================ */
'use strict';

const catalogue = require('../assets/catalogue.js');

const DAY_MS = 24 * 60 * 60 * 1000;

/* Below this many answered questions a percentage is too noisy to call a
   strength or a weakness, so the report says "keep going" instead of
   labelling the child on the strength of two questions. */
const MIN_ANSWERS_FOR_VERDICT = 20;

function pct(score, total) {
  return total > 0 ? Math.round((score / total) * 100) : null;
}

function localDayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* strong / steady / practise, or null when there isn't enough to judge on. */
function bandFor(accuracy, answers) {
  if (accuracy == null || answers < MIN_ANSWERS_FOR_VERDICT) return null;
  if (accuracy >= 80) return 'strong';
  if (accuracy >= 55) return 'steady';
  return 'practise';
}

/* Compares the first third of the sessions with the last third. Halves make a
   3-session history look like a trend; thirds need a real run of play. */
function trendOf(rows) {
  if (rows.length < 6) return 'flat';
  const n = Math.floor(rows.length / 3);
  const first = rows.slice(0, n);
  const last = rows.slice(-n);
  const a = pct(sum(first, 'score'), sum(first, 'total'));
  const b = pct(sum(last, 'score'), sum(last, 'total'));
  if (a == null || b == null) return 'flat';
  if (b >= a + 8) return 'up';
  if (b <= a - 8) return 'down';
  return 'flat';
}

function sum(rows, key) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

/* Consecutive calendar days with at least one session, counting back from the
   most recent day played. Uses local dates so "yesterday" means what a parent
   thinks it means. */
function streaks(dayKeys) {
  if (!dayKeys.length) return { current: 0, longest: 0 };
  const days = [...new Set(dayKeys)].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = new Date(`${days[i - 1]}T00:00:00`);
    const cur = new Date(`${days[i]}T00:00:00`);
    if (Math.round((cur - prev) / DAY_MS) === 1) run += 1;
    else run = 1;
    if (run > longest) longest = run;
  }

  // The current streak only counts if it reaches today or yesterday.
  const today = localDayKey(Date.now());
  const yesterday = localDayKey(Date.now() - DAY_MS);
  const last = days[days.length - 1];
  let current = 0;
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = days.length - 1; i > 0; i -= 1) {
      const prev = new Date(`${days[i - 1]}T00:00:00`);
      const cur = new Date(`${days[i]}T00:00:00`);
      if (Math.round((cur - prev) / DAY_MS) === 1) current += 1;
      else break;
    }
  }
  return { current, longest };
}

/* Build the report.
   opts.rangeDays limits how far back to look (null = everything).
   opts.now is injectable so tests aren't tied to the wall clock. */
function buildReport(child, opts = {}) {
  const now = opts.now || Date.now();
  const rangeDays = opts.rangeDays || null;
  const since = rangeDays ? now - rangeDays * DAY_MS : null;

  const all = Array.isArray(child.progress) ? child.progress : [];
  const rows = all
    .filter((r) => r && typeof r.at === 'number' && (!since || r.at >= since))
    .sort((a, b) => a.at - b.at);

  const answered = sum(rows, 'total');
  const correct = sum(rows, 'score');
  const dayKeys = rows.map((r) => localDayKey(r.at));
  const { current, longest } = streaks(dayKeys);
  const activeDays = new Set(dayKeys).size;

  const overview = {
    sessions: rows.length,
    questionsAnswered: answered,
    questionsCorrect: correct,
    accuracy: pct(correct, answered),
    timeMs: sum(rows, 'timeMs'),
    activeDays,
    gamesPlayed: new Set(rows.map((r) => r.game)).size,
    gamesAvailable: catalogue.games.length,
    firstPlayedAt: rows.length ? rows[0].at : null,
    lastPlayedAt: rows.length ? rows[rows.length - 1].at : null,
    currentStreakDays: current,
    longestStreakDays: longest,
    perfectRounds: rows.filter((r) => r.total > 0 && r.score === r.total).length,
    avgSessionMs: rows.length ? Math.round(sum(rows, 'timeMs') / rows.length) : 0,
    trend: trendOf(rows),
  };

  // ── per game ────────────────────────────────────────────────
  const gameGroups = new Map();
  rows.forEach((r) => {
    if (!gameGroups.has(r.game)) gameGroups.set(r.game, []);
    gameGroups.get(r.game).push(r);
  });

  const byGame = [...gameGroups.entries()].map(([id, rs]) => {
    const g = catalogue.byId(id);
    const a = sum(rs, 'score');
    const t = sum(rs, 'total');
    const best = rs.reduce((acc, r) => Math.max(acc, pct(r.score, r.total) ?? 0), 0);
    const latest = rs[rs.length - 1];
    return {
      game: id,
      title: catalogue.titleOf(id),
      icon: g ? g.icon : '🎮',
      cat: g ? g.cat : null,
      age: g ? g.age : '',
      sessions: rs.length,
      accuracy: pct(a, t),
      bestAccuracy: best,
      latestAccuracy: pct(latest.score, latest.total),
      questionsAnswered: t,
      timeMs: sum(rs, 'timeMs'),
      lastPlayedAt: latest.at,
      trend: trendOf(rs),
      band: bandFor(pct(a, t), t),
    };
  }).sort((x, y) => y.sessions - x.sessions || y.questionsAnswered - x.questionsAnswered);

  // ── per skill area ──────────────────────────────────────────
  const bySkill = Object.keys(catalogue.cats).map((cat) => {
    const rs = rows.filter((r) => catalogue.catOf(r.game) === cat);
    const a = sum(rs, 'score');
    const t = sum(rs, 'total');
    const accuracy = pct(a, t);
    const gamesInCat = catalogue.games.filter((g) => g.cat === cat).length;
    return {
      cat,
      label: catalogue.cats[cat].label,
      icon: catalogue.cats[cat].icon,
      color: catalogue.cats[cat].color,
      sessions: rs.length,
      accuracy,
      questionsAnswered: t,
      timeMs: sum(rs, 'timeMs'),
      gamesTried: new Set(rs.map((r) => r.game)).size,
      gamesAvailable: gamesInCat,
      trend: trendOf(rs),
      band: bandFor(accuracy, t),
    };
  });

  const judged = bySkill.filter((s) => s.band);
  const strengths = judged
    .filter((s) => s.band === 'strong')
    .sort((a, b) => b.accuracy - a.accuracy);
  const focus = judged
    .filter((s) => s.band === 'practise')
    .sort((a, b) => a.accuracy - b.accuracy);

  // Skill areas never opened at all — a gap worth naming to a parent.
  const untouched = bySkill.filter((s) => s.sessions === 0);

  // ── activity timeline (one entry per day in range) ───────────
  const timelineDays = rangeDays || 30;
  const timeline = [];
  for (let i = timelineDays - 1; i >= 0; i -= 1) {
    const key = localDayKey(now - i * DAY_MS);
    const rs = rows.filter((r) => localDayKey(r.at) === key);
    timeline.push({
      day: key,
      sessions: rs.length,
      timeMs: sum(rs, 'timeMs'),
      accuracy: pct(sum(rs, 'score'), sum(rs, 'total')),
    });
  }

  // ── language use ────────────────────────────────────────────
  const langs = {};
  rows.forEach((r) => {
    const l = r.lang || 'unknown';
    langs[l] = (langs[l] || 0) + 1;
  });
  const languages = Object.entries(langs)
    .map(([lang, sessions]) => ({ lang, sessions }))
    .sort((a, b) => b.sessions - a.sessions);

  const recentSessions = rows.slice(-20).reverse().map((r) => ({
    at: r.at,
    game: r.game,
    title: catalogue.titleOf(r.game),
    icon: (catalogue.byId(r.game) || {}).icon || '🎮',
    score: r.score,
    total: r.total,
    accuracy: pct(r.score, r.total),
    timeMs: r.timeMs,
    lang: r.lang || '',
  }));

  return {
    child: { id: child.id, name: child.name || '', note: child.note || '' },
    generatedAt: now,
    range: { days: rangeDays, since },
    // Says plainly whether the numbers are worth reading yet.
    hasEnoughData: overview.questionsAnswered >= MIN_ANSWERS_FOR_VERDICT,
    minAnswersForVerdict: MIN_ANSWERS_FOR_VERDICT,
    overview,
    bySkill,
    byGame,
    strengths,
    focus,
    untouched,
    timeline,
    languages,
    recentSessions,
  };
}

module.exports = { buildReport, MIN_ANSWERS_FOR_VERDICT, localDayKey, pct };

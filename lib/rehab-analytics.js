/* ============================================================
 * InclusionGames — progress maths for the stroke rehab section.
 *
 * A rehab session row is:
 *   { exercise, side, sets, reps, targetReps, bestAmplitude,
 *     avgAmplitude, symmetry, longestHoldMs, timeMs,
 *     calibrationWeak, lang, at }
 *
 * Amplitude is a percentage of the person's OWN calibrated range on
 * the day, not a percentage of some able-bodied norm. That makes it
 * meaningful for tracking effort within a session, and it is why
 * amplitude is NOT reported as a trend across sessions: recalibrating
 * each day moves the yardstick, so "80% today" and "80% last month"
 * are not the same quantity and a rising line would be an illusion.
 *
 * What CAN be compared honestly across sessions is countable: how
 * many repetitions were completed, how consistently, how long the
 * holds lasted, and how even the two sides were. Those are what this
 * module trends.
 * ============================================================ */
'use strict';

const catalogue = require('../assets/rehab-catalogue.js');

const DAY_MS = 24 * 60 * 60 * 1000;

/* Fewer sessions than this and a direction of travel is noise. */
const MIN_SESSIONS_FOR_TREND = 6;

function sum(rows, key) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

function mean(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function localDayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* Completion = repetitions actually done against repetitions asked for.
   This is the honest adherence number and it is comparable over time. */
function completion(rows) {
  const asked = sum(rows, 'targetReps');
  if (!asked) return null;
  return Math.round((sum(rows, 'reps') / asked) * 100);
}

function trendOf(rows, valueFn) {
  if (rows.length < MIN_SESSIONS_FOR_TREND) return 'flat';
  const n = Math.floor(rows.length / 3);
  const firstVals = rows.slice(0, n).map(valueFn).filter((v) => v != null);
  const lastVals = rows.slice(-n).map(valueFn).filter((v) => v != null);
  if (!firstVals.length || !lastVals.length) return 'flat';
  const a = mean(firstVals);
  const b = mean(lastVals);
  if (b >= a + 8) return 'up';
  if (b <= a - 8) return 'down';
  return 'flat';
}

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

function buildRehabReport(child, opts = {}) {
  const now = opts.now || Date.now();
  const rangeDays = opts.rangeDays || null;
  const since = rangeDays ? now - rangeDays * DAY_MS : null;

  const all = Array.isArray(child.rehab) ? child.rehab : [];
  const rows = all
    .filter((r) => r && typeof r.at === 'number' && (!since || r.at >= since))
    .sort((a, b) => a.at - b.at);

  const dayKeys = rows.map((r) => localDayKey(r.at));
  const { current, longest } = streaks(dayKeys);
  const symRows = rows.filter((r) => r.symmetry != null);
  const holdRows = rows.filter((r) => r.longestHoldMs > 0);

  const overview = {
    sessions: rows.length,
    repsCompleted: sum(rows, 'reps'),
    repsPrescribed: sum(rows, 'targetReps'),
    completion: completion(rows),
    timeMs: sum(rows, 'timeMs'),
    activeDays: new Set(dayKeys).size,
    currentStreakDays: current,
    longestStreakDays: longest,
    exercisesTried: new Set(rows.map((r) => r.exercise)).size,
    exercisesAvailable: catalogue.exercises.length,
    longestHoldMs: holdRows.length ? Math.max(...holdRows.map((r) => r.longestHoldMs)) : 0,
    meanSymmetry: symRows.length ? mean(symRows.map((r) => r.symmetry)) : null,
    firstAt: rows.length ? rows[0].at : null,
    lastAt: rows.length ? rows[rows.length - 1].at : null,
    // Trends are on countable things only — see the note at the top.
    completionTrend: trendOf(rows, (r) => (r.targetReps ? (r.reps / r.targetReps) * 100 : null)),
    symmetryTrend: trendOf(symRows, (r) => r.symmetry),
  };

  // ── per exercise ────────────────────────────────────────────
  const groups = new Map();
  rows.forEach((r) => {
    if (!groups.has(r.exercise)) groups.set(r.exercise, []);
    groups.get(r.exercise).push(r);
  });

  const byExercise = [...groups.entries()].map(([id, rs]) => {
    const ex = catalogue.byId(id);
    const symbolRows = rs.filter((r) => r.symmetry != null);
    return {
      exercise: id,
      title: ex ? ex.title.en : id,
      icon: ex ? ex.icon : '🧩',
      group: ex ? ex.group : null,
      sessions: rs.length,
      reps: sum(rs, 'reps'),
      prescribed: sum(rs, 'targetReps'),
      completion: completion(rs),
      // Kept per-exercise for the clinician, clearly labelled as within-session.
      lastBestAmplitude: rs[rs.length - 1].bestAmplitude,
      meanSymmetry: symbolRows.length ? mean(symbolRows.map((r) => r.symmetry)) : null,
      longestHoldMs: rs.length ? Math.max(...rs.map((r) => r.longestHoldMs || 0)) : 0,
      timeMs: sum(rs, 'timeMs'),
      lastAt: rs[rs.length - 1].at,
      completionTrend: trendOf(rs, (r) => (r.targetReps ? (r.reps / r.targetReps) * 100 : null)),
      // Sessions where the camera saw almost no movement to calibrate against.
      weakCalibrations: rs.filter((r) => r.calibrationWeak).length,
    };
  }).sort((a, b) => b.sessions - a.sessions);

  // ── per body area ───────────────────────────────────────────
  const byGroup = Object.keys(catalogue.groups).map((key) => {
    const rs = rows.filter((r) => catalogue.groupOf(r.exercise) === key);
    const available = catalogue.exercises.filter((e) => e.group === key).length;
    return {
      group: key,
      label: catalogue.groups[key].label,
      icon: catalogue.groups[key].icon,
      sessions: rs.length,
      reps: sum(rs, 'reps'),
      completion: completion(rs),
      timeMs: sum(rs, 'timeMs'),
      exercisesTried: new Set(rs.map((r) => r.exercise)).size,
      exercisesAvailable: available,
    };
  });

  // ── activity ────────────────────────────────────────────────
  const timelineDays = rangeDays || 30;
  const timeline = [];
  for (let i = timelineDays - 1; i >= 0; i -= 1) {
    const key = localDayKey(now - i * DAY_MS);
    const rs = rows.filter((r) => localDayKey(r.at) === key);
    timeline.push({
      day: key,
      sessions: rs.length,
      reps: sum(rs, 'reps'),
      timeMs: sum(rs, 'timeMs'),
    });
  }

  const recentSessions = rows.slice(-20).reverse().map((r) => {
    const ex = catalogue.byId(r.exercise);
    return {
      at: r.at,
      exercise: r.exercise,
      title: ex ? ex.title.en : r.exercise,
      icon: ex ? ex.icon : '🧩',
      side: r.side,
      reps: r.reps,
      targetReps: r.targetReps,
      bestAmplitude: r.bestAmplitude,
      symmetry: r.symmetry,
      longestHoldMs: r.longestHoldMs,
      timeMs: r.timeMs,
      calibrationWeak: !!r.calibrationWeak,
    };
  });

  return {
    child: { id: child.id, name: child.name || '' },
    generatedAt: now,
    range: { days: rangeDays, since },
    hasSessions: rows.length > 0,
    minSessionsForTrend: MIN_SESSIONS_FOR_TREND,
    hasEnoughForTrend: rows.length >= MIN_SESSIONS_FOR_TREND,
    weakCalibrationCount: rows.filter((r) => r.calibrationWeak).length,
    overview,
    byExercise,
    byGroup,
    timeline,
    recentSessions,
  };
}

module.exports = { buildRehabReport, MIN_SESSIONS_FOR_TREND };

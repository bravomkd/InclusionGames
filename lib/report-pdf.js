/* ============================================================
 * InclusionGames — renders a child's progress report as a PDF,
 * from the same numbers the Reports page shows on screen.
 *
 * Written for a parent or guardian to read: what was played, how much,
 * which skill areas are going well and which need practice.
 * ============================================================ */
'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const catalogue = require('../assets/catalogue.js');

const A4 = [595.28, 841.89];
const MARGIN = 50;
const PAGE_W = A4[0];

const INK = rgb(0.10, 0.10, 0.18);
const MUTED = rgb(0.42, 0.42, 0.54);
const PURPLE = rgb(0.486, 0.227, 0.929);
const LINE = rgb(0.90, 0.89, 0.94);
const GREEN = rgb(0.06, 0.62, 0.42);
const AMBER = rgb(0.85, 0.55, 0.08);
const RED = rgb(0.80, 0.20, 0.20);

const T = {
  en: {
    title: 'Learning Progress Report', created: 'Created', child: 'Child', carer: 'Supervised by',
    period: 'Period', summary: 'At a glance', sessions: 'Sessions played', accuracy: 'Overall accuracy',
    playtime: 'Total play time', activeDays: 'Days played', streak: 'Longest daily streak',
    questions: 'Questions answered', gamesPlayed: 'Games explored', perfect: 'Perfect rounds',
    skills: 'Skill areas', skill: 'Skill area', played: 'Played', correct: 'Correct', trend: 'Trend',
    games: 'Game by game', game: 'Game', best: 'Best', latest: 'Latest',
    strengthsTitle: 'Going well', focusTitle: 'Worth practising', notTried: 'Not tried yet',
    recent: 'Recent sessions', date: 'Date', result: 'Result',
    none: 'No sessions have been recorded yet.',
    thin: 'Only a little has been played so far, so the percentages below can move a lot from one session to the next. They settle after about %N answered questions.',
    up: 'improving', down: 'dipping', flat: 'steady',
    strong: 'strong', steady: 'steady', practise: 'needs practice', na: 'not enough yet',
    privacy1: 'Privacy: hand tracking runs entirely in the browser on the device. No video or',
    privacy2: 'biometric data is transmitted or stored (GDPR compliant).',
    sign: 'Date, signature (parent / teacher): ___________________________________',
    page: 'Page', mins: 'min', noSkill: 'No games played in this area yet.',
    fileName: 'Progress-Report',
  },
  de: {
    title: 'Förderbericht – Lernfortschritt', created: 'Erstellt am', child: 'Kind', carer: 'Betreuung',
    period: 'Zeitraum', summary: 'Auf einen Blick', sessions: 'Spielsitzungen', accuracy: 'Gesamtgenauigkeit',
    playtime: 'Gesamte Spielzeit', activeDays: 'Aktive Tage', streak: 'Längste Serie',
    questions: 'Beantwortete Fragen', gamesPlayed: 'Gespielte Spiele', perfect: 'Perfekte Runden',
    skills: 'Lernbereiche', skill: 'Bereich', played: 'Gespielt', correct: 'Richtig', trend: 'Tendenz',
    games: 'Spiel für Spiel', game: 'Spiel', best: 'Beste', latest: 'Zuletzt',
    strengthsTitle: 'Läuft gut', focusTitle: 'Zum Üben', notTried: 'Noch nicht probiert',
    recent: 'Letzte Sitzungen', date: 'Datum', result: 'Ergebnis',
    none: 'Noch keine Spielsitzungen aufgezeichnet.',
    thin: 'Es wurde bisher wenig gespielt, daher schwanken die Prozentwerte noch stark. Ab etwa %N beantworteten Fragen werden sie aussagekräftig.',
    up: 'steigend', down: 'fallend', flat: 'gleich',
    strong: 'stark', steady: 'solide', practise: 'üben', na: 'noch zu wenig',
    privacy1: 'Datenschutz: Die Hand-Erkennung läuft ausschließlich lokal im Browser. Es werden keine',
    privacy2: 'Video- oder Biometriedaten übertragen oder gespeichert (DSGVO-konform).',
    sign: 'Datum, Unterschrift (Eltern / Förderkraft): ___________________________________',
    page: 'Seite', mins: 'Min.', noSkill: 'In diesem Bereich wurde noch nicht gespielt.',
    fileName: 'Foerderbericht',
  },
  pl: {
    title: 'Raport postepow w nauce', created: 'Utworzono', child: 'Dziecko', carer: 'Opiekun',
    period: 'Okres', summary: 'W skrocie', sessions: 'Rozegrane sesje', accuracy: 'Ogolna poprawnosc',
    playtime: 'Laczny czas gry', activeDays: 'Dni z gra', streak: 'Najdluzsza seria',
    questions: 'Odpowiedzi', gamesPlayed: 'Poznane gry', perfect: 'Idealne rundy',
    skills: 'Obszary umiejetnosci', skill: 'Obszar', played: 'Zagrane', correct: 'Poprawnie', trend: 'Trend',
    games: 'Gra po grze', game: 'Gra', best: 'Najlepszy', latest: 'Ostatni',
    strengthsTitle: 'Idzie dobrze', focusTitle: 'Warto poscwiczyc', notTried: 'Jeszcze nie probowane',
    recent: 'Ostatnie sesje', date: 'Data', result: 'Wynik',
    none: 'Nie zarejestrowano jeszcze zadnych sesji.',
    thin: 'Do tej pory zagrano niewiele, wiec procenty moga sie mocno zmieniac. Ustabilizuja sie po okolo %N odpowiedziach.',
    up: 'rosnie', down: 'spada', flat: 'stabilnie',
    strong: 'mocna strona', steady: 'solidnie', practise: 'do cwiczenia', na: 'za malo danych',
    privacy1: 'Prywatnosc: sledzenie dloni dziala wylacznie lokalnie w przegladarce. Zadne dane',
    privacy2: 'wideo ani biometryczne nie sa przesylane ani przechowywane (zgodnie z RODO).',
    sign: 'Data, podpis (rodzic / nauczyciel): ___________________________________',
    page: 'Strona', mins: 'min', noSkill: 'W tym obszarze nie grano jeszcze wcale.',
    fileName: 'Raport-postepow',
  },
  es: {
    title: 'Informe de progreso', created: 'Creado el', child: 'Niño/a', carer: 'Supervisado por',
    period: 'Periodo', summary: 'De un vistazo', sessions: 'Sesiones jugadas', accuracy: 'Precisión general',
    playtime: 'Tiempo total de juego', activeDays: 'Días jugados', streak: 'Racha más larga',
    questions: 'Preguntas respondidas', gamesPlayed: 'Juegos explorados', perfect: 'Rondas perfectas',
    skills: 'Áreas de aprendizaje', skill: 'Área', played: 'Jugado', correct: 'Correcto', trend: 'Tendencia',
    games: 'Juego a juego', game: 'Juego', best: 'Mejor', latest: 'Último',
    strengthsTitle: 'Va bien', focusTitle: 'Para practicar', notTried: 'Aún sin probar',
    recent: 'Sesiones recientes', date: 'Fecha', result: 'Resultado',
    none: 'Todavía no hay sesiones registradas.',
    thin: 'Se ha jugado poco por ahora, así que los porcentajes pueden variar mucho. Se estabilizan a partir de unas %N respuestas.',
    up: 'mejorando', down: 'bajando', flat: 'estable',
    strong: 'fuerte', steady: 'sólido', practise: 'a practicar', na: 'datos insuficientes',
    privacy1: 'Privacidad: el seguimiento de manos funciona solo en el navegador del dispositivo.',
    privacy2: 'No se transmiten ni almacenan datos de vídeo ni biométricos (conforme al RGPD).',
    sign: 'Fecha, firma (madre/padre / profesor): ___________________________________',
    page: 'Página', mins: 'min', noSkill: 'Aún no se ha jugado en esta área.',
    fileName: 'Informe-de-progreso',
  },
};

const LOCALE = { en: 'en-GB', de: 'de-DE', pl: 'pl-PL', es: 'es-ES' };

/* pdf-lib's standard fonts are WinAnsi only: no emoji, and no Polish
   diacritics. Transliterate what we can rather than dropping characters, so
   "Język" reads as "Jezyk" instead of "Jzyk". */
const TRANSLIT = {
  ł: 'l', Ł: 'L', ą: 'a', Ą: 'A', ę: 'e', Ę: 'E', ć: 'c', Ć: 'C',
  ń: 'n', Ń: 'N', ó: 'o', Ó: 'O', ś: 's', Ś: 'S', ż: 'z', Ż: 'Z', ź: 'z', Ź: 'Z',
  '–': '-', '—': '-', '·': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...',
};

function safe(s) {
  let out = String(s == null ? '' : s)
    // emoji and other symbols the standard fonts cannot draw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
    .replace(/[Ā-ɏ‐-…]/g, (ch) => (TRANSLIT[ch] != null ? TRANSLIT[ch] : ch));
  out = out.replace(/[^\x20-\xFF]/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

function fmtDuration(ms, t) {
  const mins = Math.round((ms || 0) / 60000);
  if (mins < 60) return `${mins} ${t.mins}`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} ${t.mins}`;
}

function fmtDate(ts, lang) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(LOCALE[lang] || 'en-GB');
}

function bandColor(band) {
  if (band === 'strong') return GREEN;
  if (band === 'practise') return RED;
  if (band === 'steady') return AMBER;
  return MUTED;
}

async function renderReport(report, opts = {}) {
  const lang = T[opts.lang] ? opts.lang : 'en';
  const t = T[lang];
  const carer = opts.carer || '';

  const pdf = await PDFDocument.create();
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  let y = 800;
  const pages = [page];

  const txt = (s, x, yy, size, font, color) => {
    page.drawText(safe(s), { x, y: yy, size, font: font || F, color: color || INK });
  };
  const hr = (yy) => page.drawLine({
    start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 1, color: LINE,
  });
  const newPage = () => { page = pdf.addPage(A4); pages.push(page); y = 800; };
  const need = (space) => { if (y < space) newPage(); };

  // A horizontal bar, used for accuracy per skill area.
  const bar = (x, yy, w, h, fraction, color) => {
    page.drawRectangle({ x, y: yy, width: w, height: h, color: rgb(0.93, 0.93, 0.96) });
    const filled = Math.max(0, Math.min(1, fraction || 0)) * w;
    if (filled > 0) page.drawRectangle({ x, y: yy, width: filled, height: h, color });
  };

  // ── header ──────────────────────────────────────────────────
  txt('InclusionGames', MARGIN, y, 20, FB, PURPLE); y -= 24;
  txt(t.title, MARGIN, y, 13, FB, INK); y -= 16;
  txt(`${t.created} ${fmtDate(report.generatedAt, lang)}`, MARGIN, y, 9, F, MUTED); y -= 14;
  hr(y); y -= 22;

  txt(`${t.child}:`, MARGIN, y, 10, FB, INK);
  txt(report.child.name || '—', MARGIN + 80, y, 10, F, INK);
  txt(`${t.carer}:`, PAGE_W / 2, y, 10, FB, INK);
  txt(carer, PAGE_W / 2 + 80, y, 10, F, INK); y -= 16;

  const o = report.overview;
  if (o.firstPlayedAt) {
    txt(`${t.period}:`, MARGIN, y, 10, FB, INK);
    txt(`${fmtDate(o.firstPlayedAt, lang)} - ${fmtDate(o.lastPlayedAt, lang)}`, MARGIN + 80, y, 10, F, INK);
    y -= 16;
  }
  y -= 8;

  if (!o.sessions) {
    txt(t.none, MARGIN, y, 11, F, MUTED);
    const bytes = await pdf.save();
    return { bytes, fileName: buildFileName(report, t) };
  }

  // A short, honest caveat when the sample is small.
  if (!report.hasEnoughData) {
    const msg = t.thin.replace('%N', String(report.minAnswersForVerdict));
    wrap(msg, PAGE_W - MARGIN * 2, 9).forEach((lineText) => {
      txt(lineText, MARGIN, y, 9, F, AMBER); y -= 11;
    });
    y -= 8;
  }

  // ── at a glance ─────────────────────────────────────────────
  txt(t.summary, MARGIN, y, 12, FB, PURPLE); y -= 18;
  const stats = [
    [t.sessions, String(o.sessions)],
    [t.accuracy, o.accuracy == null ? '—' : `${o.accuracy}%`],
    [t.questions, String(o.questionsAnswered)],
    [t.playtime, fmtDuration(o.timeMs, t)],
    [t.activeDays, String(o.activeDays)],
    [t.streak, `${o.longestStreakDays}`],
    [t.gamesPlayed, `${o.gamesPlayed} / ${o.gamesAvailable}`],
    [t.perfect, String(o.perfectRounds)],
  ];
  for (let i = 0; i < stats.length; i += 2) {
    txt(stats[i][0], MARGIN, y, 10, F, INK);
    txt(stats[i][1], MARGIN + 150, y, 10, FB, INK);
    if (stats[i + 1]) {
      txt(stats[i + 1][0], PAGE_W / 2, y, 10, F, INK);
      txt(stats[i + 1][1], PAGE_W / 2 + 150, y, 10, FB, INK);
    }
    y -= 15;
  }
  y -= 10;

  // ── skill areas ─────────────────────────────────────────────
  need(200);
  txt(t.skills, MARGIN, y, 12, FB, PURPLE); y -= 16;
  txt(t.skill, MARGIN, y, 9, FB, MUTED);
  txt(t.played, MARGIN + 150, y, 9, FB, MUTED);
  txt(t.correct, MARGIN + 205, y, 9, FB, MUTED);
  txt(t.trend, MARGIN + 400, y, 9, FB, MUTED);
  y -= 4; hr(y); y -= 14;

  report.bySkill.forEach((s) => {
    need(60);
    txt(catalogue.catName(s.cat, lang), MARGIN, y, 10, F, INK);
    txt(String(s.sessions), MARGIN + 150, y, 10, F, s.sessions ? INK : MUTED);
    if (s.accuracy == null) {
      txt('—', MARGIN + 205, y, 10, F, MUTED);
    } else {
      txt(`${s.accuracy}%`, MARGIN + 205, y, 10, FB, bandColor(s.band));
      bar(MARGIN + 245, y + 1, 140, 7, s.accuracy / 100, bandColor(s.band));
    }
    txt(s.sessions ? t[s.trend] : '—', MARGIN + 400, y, 9, F, MUTED);
    y -= 15;
  });
  y -= 12;

  // ── going well / worth practising ───────────────────────────
  const verdictBlock = (heading, items, color) => {
    if (!items.length) return;
    need(70);
    txt(heading, MARGIN, y, 12, FB, color); y -= 16;
    items.forEach((s) => {
      need(40);
      const label = catalogue.catName(s.cat, lang);
      txt(`- ${label}: ${s.accuracy}% (${s.questionsAnswered} ${t.questions.toLowerCase()})`, MARGIN, y, 10, F, INK);
      y -= 14;
    });
    y -= 8;
  };
  verdictBlock(t.strengthsTitle, report.strengths, GREEN);
  verdictBlock(t.focusTitle, report.focus, RED);

  if (report.untouched.length) {
    need(60);
    txt(t.notTried, MARGIN, y, 12, FB, MUTED); y -= 16;
    const names = report.untouched.map((s) => catalogue.catName(s.cat, lang)).join(', ');
    wrap(names, PAGE_W - MARGIN * 2, 10).forEach((lineText) => {
      txt(lineText, MARGIN, y, 10, F, INK); y -= 13;
    });
    y -= 10;
  }

  // ── game by game ────────────────────────────────────────────
  need(160);
  txt(t.games, MARGIN, y, 12, FB, PURPLE); y -= 16;
  txt(t.game, MARGIN, y, 9, FB, MUTED);
  txt(t.played, MARGIN + 190, y, 9, FB, MUTED);
  txt(t.correct, MARGIN + 245, y, 9, FB, MUTED);
  txt(t.best, MARGIN + 305, y, 9, FB, MUTED);
  txt(t.latest, MARGIN + 360, y, 9, FB, MUTED);
  txt(t.trend, MARGIN + 425, y, 9, FB, MUTED);
  y -= 4; hr(y); y -= 14;

  report.byGame.forEach((g) => {
    need(60);
    txt(g.title, MARGIN, y, 10, F, INK);
    txt(String(g.sessions), MARGIN + 190, y, 10, F, INK);
    txt(g.accuracy == null ? '—' : `${g.accuracy}%`, MARGIN + 245, y, 10, FB, bandColor(g.band));
    txt(g.bestAccuracy == null ? '—' : `${g.bestAccuracy}%`, MARGIN + 305, y, 10, F, INK);
    txt(g.latestAccuracy == null ? '—' : `${g.latestAccuracy}%`, MARGIN + 360, y, 10, F, INK);
    txt(t[g.trend], MARGIN + 425, y, 9, F, MUTED);
    y -= 15;
  });
  y -= 12;

  // ── recent sessions ─────────────────────────────────────────
  need(140);
  txt(t.recent, MARGIN, y, 12, FB, PURPLE); y -= 16;
  txt(t.date, MARGIN, y, 9, FB, MUTED);
  txt(t.game, MARGIN + 110, y, 9, FB, MUTED);
  txt(t.result, MARGIN + 330, y, 9, FB, MUTED);
  y -= 4; hr(y); y -= 13;

  report.recentSessions.slice(0, 15).forEach((s) => {
    need(50);
    const d = new Date(s.at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    txt(`${fmtDate(s.at, lang)} ${hh}:${mm}`, MARGIN, y, 9, F, MUTED);
    txt(s.title, MARGIN + 110, y, 9, F, INK);
    txt(`${s.score}/${s.total}`, MARGIN + 330, y, 9, FB, INK);
    txt(s.accuracy == null ? '' : `${s.accuracy}%`, MARGIN + 385, y, 9, F, MUTED);
    y -= 13;
  });

  // ── footer on the last page ─────────────────────────────────
  need(110);
  if (y > 130) y = 130;
  hr(y); y -= 16;
  txt(t.privacy1, MARGIN, y, 8, F, MUTED); y -= 11;
  txt(t.privacy2, MARGIN, y, 8, F, MUTED); y -= 24;
  txt(t.sign, MARGIN, y, 9, F, INK);

  // Page numbers, once the total is known.
  pages.forEach((p, i) => {
    p.drawText(safe(`${t.page} ${i + 1} / ${pages.length}`), {
      x: PAGE_W - MARGIN - 60, y: 28, size: 8, font: F, color: MUTED,
    });
  });

  const bytes = await pdf.save();
  return { bytes, fileName: buildFileName(report, t) };

  /* Greedy wrap using the real font metrics, so long sentences don't run off
     the edge of the page. */
  function wrap(text, maxWidth, size) {
    const words = safe(text).split(' ');
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const candidate = line ? `${line} ${w}` : w;
      if (F.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }
}

function buildFileName(report, t) {
  const name = safe(report.child.name || 'child').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'child';
  const day = new Date(report.generatedAt).toISOString().slice(0, 10);
  return `${t.fileName}-${name}-${day}.pdf`;
}

module.exports = { renderReport, LANGS: Object.keys(T) };

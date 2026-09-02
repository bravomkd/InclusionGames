/* ============================================================
 * InclusionGames — the game catalogue, in one place.
 *
 * Loads both in the browser (window.IG_CATALOGUE) and in Node
 * (require('./assets/catalogue.js')), so the dashboard, the reports
 * section and the server all describe the games identically. The server
 * used to recover titles by running a regex over dashboard.html, which
 * broke silently whenever that markup was touched.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_CATALOGUE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Skill areas. The keys are Polish abbreviations from the original build and
     are kept as-is: they are stored in no database, but they appear throughout
     the existing markup and renaming them buys nothing. */
  var CATS = {
    jezyk: { label: 'Language', bg: '#EAF3DE', color: '#3B6D11', icon: '📖',
      names: { en: 'Language', de: 'Sprache', pl: 'Język polski', es: 'Lengua' } },
    mat: { label: 'Math', bg: '#E6F1FB', color: '#185FA5', icon: '🔢',
      names: { en: 'Math', de: 'Mathematik', pl: 'Matematyka', es: 'Matemáticas' } },
    ang: { label: 'English', bg: '#E1F5EE', color: '#0F6E56', icon: '🇬🇧',
      names: { en: 'English', de: 'Englisch', pl: 'Angielski', es: 'Inglés' } },
    przyr: { label: 'Science', bg: '#FAEEDA', color: '#854F0B', icon: '🌍',
      names: { en: 'Science', de: 'Sachkunde', pl: 'Przyroda', es: 'Ciencias' } },
    muz: { label: 'Music', bg: '#EEEDFE', color: '#534AB7', icon: '🎵',
      names: { en: 'Music', de: 'Musik', pl: 'Muzyka', es: 'Música' } },
    plast: { label: 'Art', bg: '#FBEAF0', color: '#993556', icon: '🎨',
      names: { en: 'Art', de: 'Kunst', pl: 'Plastyka', es: 'Arte' } },
    sport: { label: 'Sport', bg: '#FAECE7', color: '#993C1D', icon: '⚽',
      names: { en: 'Sport', de: 'Sport', pl: 'Wychowanie fizyczne', es: 'Deporte' } },
  };

  var GAMES = [
    { n: 1, icon: '📖', title: 'Letter-Pop', cat: 'jezyk', desc: 'Capital & small letters. EN · DE · PL · ES — pick the language in-game.', age: 'Gr. 1–2', file: 'game01.html' },
    { n: 2, icon: '🌉', title: 'Syllable Clap', cat: 'jezyk', desc: 'Hear a word, clap its syllables. EN · DE · PL · ES.', age: 'Gr. 1–2', file: 'game02.html' },
    { n: 3, icon: '🔮', title: 'First Sound', cat: 'jezyk', desc: 'Hear the word, find its first letter. EN · DE · PL · ES.', age: 'Gr. 1–2', file: 'game03.html' },
    { n: 4, icon: '🧙', title: 'Word Wizard', cat: 'jezyk', desc: 'Find the noun, verb or adjective. EN · DE · PL · ES.', age: 'Gr. 3–4', file: 'game04.html' },
    { n: 5, icon: '🗡️', title: 'Mark Hunter', cat: 'jezyk', desc: 'Hear a sentence, pick . ? or ! EN · DE · PL · ES.', age: 'Gr. 2–3', file: 'game05.html' },
    { n: 6, icon: '🎶', title: 'Rhyme Rescue', cat: 'jezyk', desc: 'Hear a word, find the rhyme. EN · DE · PL · ES.', age: 'Gr. 1–2', file: 'game06.html' },

    { n: 7, icon: '🐣', title: 'Egg Counter', cat: 'mat', desc: 'Count the objects, pop the number.', age: 'Gr. 1', file: 'game07.html' },
    { n: 8, icon: '⛰️', title: 'Number Mountain', cat: 'mat', desc: 'Numbers to 100 — pop the biggest.', age: 'Gr. 2', file: 'game08.html' },
    { n: 9, icon: '➕', title: 'Plus Power', cat: 'mat', desc: 'Addition up to 20.', age: 'Gr. 1–2', file: 'game09.html' },
    { n: 10, icon: '➖', title: 'Minus Magic', cat: 'mat', desc: 'Subtraction — the minus sign is always shown.', age: 'Gr. 2–3', file: 'game10.html' },
    { n: 11, icon: '✖️', title: 'Times Treasure', cat: 'mat', desc: 'Multiplication tables.', age: 'Gr. 3–4', file: 'game11.html' },
    { n: 12, icon: '🔷', title: 'Shape Seeker', cat: 'mat', desc: 'Hear a shape, pop it.', age: 'Gr. 1–2', file: 'game12.html' },
    { n: 13, icon: '📏', title: 'Unit Detective', cat: 'mat', desc: 'Pick the right measuring unit.', age: 'Gr. 3–4', file: 'game13.html' },

    { n: 14, icon: '👋', title: 'Hello Friends', cat: 'ang', desc: 'English greetings.', age: 'Gr. 3', file: 'game14.html' },
    { n: 15, icon: '🎨', title: 'Rainbow Numbers', cat: 'ang', desc: 'English colours & numbers.', age: 'Gr. 3', file: 'game15.html' },
    { n: 16, icon: '🦁', title: 'Animal Safari', cat: 'ang', desc: 'Animals in English.', age: 'Gr. 3', file: 'game16.html' },
    { n: 17, icon: '👨‍👩‍👧', title: 'Family Tree', cat: 'ang', desc: 'Family words in English.', age: 'Gr. 3', file: 'game17.html' },
    { n: 18, icon: '🍎', title: 'Tasty Words', cat: 'ang', desc: 'Food & drinks in English.', age: 'Gr. 3–4', file: 'game18.html' },
    { n: 19, icon: '🎒', title: 'School Quest', cat: 'ang', desc: 'School things in English.', age: 'Gr. 3–4', file: 'game19.html' },
    { n: 20, icon: '🏃', title: 'Action Heroes', cat: 'ang', desc: 'Verbs in English.', age: 'Gr. 4', file: 'game20.html' },

    { n: 21, icon: '🌦️', title: 'Season Spinner', cat: 'przyr', desc: 'Which season is this?', age: 'Gr. 1–2', file: 'game21.html' },
    { n: 22, icon: '🌍', title: 'Habitat Hunt', cat: 'przyr', desc: 'Where does the animal live?', age: 'Gr. 1–2', file: 'game22.html' },
    { n: 23, icon: '🌱', title: 'Plant Parts', cat: 'przyr', desc: 'Find the part of the plant.', age: 'Gr. 2–3', file: 'game23.html' },
    { n: 24, icon: '🗺️', title: 'World Explorer', cat: 'przyr', desc: 'Match the flag to its country (in your language).', age: 'Gr. 2–4', file: 'game24.html' },
    { n: 25, icon: '🥦', title: 'Healthy Heroes', cat: 'przyr', desc: 'Healthy or not?', age: 'Gr. 1–3', file: 'game25.html' },
    { n: 26, icon: '🚦', title: 'Road Ranger', cat: 'przyr', desc: 'What does the road sign mean?', age: 'Gr. 2–4', file: 'game26.html' },
    { n: 27, icon: '👷', title: 'Job Heroes', cat: 'przyr', desc: 'Which profession is this?', age: 'Gr. 2–4', file: 'game27.html' },

    { n: 28, icon: '🎺', title: 'Instrument Band', cat: 'muz', desc: 'Which instrument is this?', age: 'Gr. 1–3', file: 'game28.html' },
    { n: 29, icon: '🔊', title: 'Loud & Quiet', cat: 'muz', desc: 'Loud or quiet sound?', age: 'Gr. 1–2', file: 'game29.html' },
    { n: 30, icon: '🥁', title: 'Beat Counter', cat: 'muz', desc: 'Count the beats in the bar.', age: 'Gr. 2–3', file: 'game30.html' },
    { n: 31, icon: '🎶', title: 'Fast & Slow', cat: 'muz', desc: 'Fast or slow tempo?', age: 'Gr. 1–2', file: 'game31.html' },
    { n: 32, icon: '🎼', title: 'High & Low', cat: 'muz', desc: 'High or low sound?', age: 'Gr. 1–2', file: 'game32.html' },

    { n: 33, icon: '🎨', title: 'Colour Mixer', cat: 'plast', desc: 'Mix two colours, pop the result.', age: 'Gr. 1–3', file: 'game33.html' },
    { n: 34, icon: '🌈', title: 'Warm & Cold', cat: 'plast', desc: 'Warm or cold colour?', age: 'Gr. 2–3', file: 'game34.html' },
    { n: 35, icon: '🖼️', title: 'Art Studio', cat: 'plast', desc: 'Name the art tool.', age: 'Gr. 1–3', file: 'game35.html' },
    { n: 36, icon: '🔷', title: 'Pattern Maker', cat: 'plast', desc: 'What comes next in the pattern?', age: 'Gr. 1–3', file: 'game36.html' },
    { n: 37, icon: '🔦', title: 'Light & Shadow', cat: 'plast', desc: 'Light or dark?', age: 'Gr. 2–3', file: 'game37.html' },

    { n: 38, icon: '🧍', title: 'Body Parts', cat: 'sport', desc: 'Name the body part.', age: 'Gr. 1–2', file: 'game38.html' },
    { n: 39, icon: '⚽', title: 'Sports Star', cat: 'sport', desc: 'Which sport is this?', age: 'Gr. 2–3', file: 'game39.html' },
    { n: 40, icon: '🤾', title: 'Move It!', cat: 'sport', desc: 'Name the movement — and do it too.', age: 'Gr. 1–2', file: 'game40.html' },
    { n: 41, icon: '🥇', title: 'Olympic Heroes', cat: 'sport', desc: 'Name the Olympic prizes.', age: 'Gr. 2–4', file: 'game41.html' },
    { n: 42, icon: '🤝', title: 'Fair Play', cat: 'sport', desc: 'Fair play, or not?', age: 'Gr. 1–3', file: 'game42.html' },
  ];

  /* Progress rows store the game as "game07", so index by that. */
  var BY_ID = {};
  GAMES.forEach(function (g) {
    g.id = 'game' + String(g.n).padStart(2, '0');
    BY_ID[g.id] = g;
  });

  function byId(id) { return BY_ID[id] || null; }

  /* Falls back to the raw id for a game that has since been removed from the
     catalogue, so old progress rows still render with something readable. */
  function titleOf(id) {
    var g = BY_ID[id];
    return g ? g.title : id;
  }

  function catOf(id) {
    var g = BY_ID[id];
    return g ? g.cat : null;
  }

  function catName(cat, lang) {
    var c = CATS[cat];
    if (!c) return cat || '';
    return (c.names && (c.names[lang] || c.names.en)) || c.label;
  }

  return { cats: CATS, games: GAMES, byId: byId, titleOf: titleOf, catOf: catOf, catName: catName };
});

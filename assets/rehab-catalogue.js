/* ============================================================
 * InclusionGames — Stroke Rehab exercise catalogue.
 *
 * Loads in the browser (window.IG_REHAB) and in Node
 * (require('./assets/rehab-catalogue.js')), the same way
 * assets/catalogue.js does for the children's games.
 *
 * ── What this is, and what it is not ─────────────────────────
 * These are camera-guided practice exercises. They are NOT a
 * medical device, NOT a diagnosis, and NOT a substitute for a
 * physiotherapist, occupational therapist or speech and language
 * therapist. Every exercise below should be selected and dosed by
 * a qualified clinician who knows the individual patient.
 *
 * Each entry carries a `rationale`: the rehabilitation principle it
 * rests on, written honestly about how strong the evidence is. The
 * shared, well-supported principles across stroke motor rehab are:
 *
 *   - Repetitive, task-specific practice. Dose matters; more
 *     correct repetitions is associated with better motor outcomes.
 *   - Active initiation by the patient beats passive movement.
 *   - Immediate feedback on performance supports motor learning.
 *   - Practice should be difficulty-matched: hard enough to demand
 *     effort, achievable enough to complete. Hence per-patient
 *     calibration rather than fixed thresholds.
 *
 * Interactive/virtual-reality training is generally studied as an
 * ADDITION to conventional therapy, not a replacement for it, and
 * that is how this section is framed throughout the UI.
 *
 * Deliberately NOT included: swallowing / dysphagia exercises.
 * Those carry a genuine aspiration risk and must not be practised
 * unsupervised from a screen.
 * ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IG_REHAB = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUPS = {
    face: {
      label: 'Face & mouth', icon: '😊', color: '#7c3aed',
      names: { en: 'Face & mouth', de: 'Gesicht & Mund' },
      blurb: {
        en: 'Facial movement practice with a live mirror, for weakness on one side of the face.',
        de: 'Übungen für die Gesichtsmuskulatur mit Live-Spiegel, bei einseitiger Schwäche.',
      },
    },
    head: {
      label: 'Head & neck', icon: '🙂', color: '#0ea5e9',
      names: { en: 'Head & neck', de: 'Kopf & Nacken' },
      blurb: {
        en: 'Gentle, controlled neck movement through a comfortable range.',
        de: 'Sanfte, kontrollierte Nackenbewegung im angenehmen Bereich.',
      },
    },
    vision: {
      label: 'Looking & scanning', icon: '👀', color: '#f59e0b',
      names: { en: 'Looking & scanning', de: 'Blick & Suchen' },
      blurb: {
        en: 'Practice at searching towards the side that is easy to miss.',
        de: 'Üben, zur leicht übersehenen Seite hin zu suchen.',
      },
    },
    arm: {
      label: 'Arm & shoulder', icon: '💪', color: '#16a34a',
      names: { en: 'Arm & shoulder', de: 'Arm & Schulter' },
      blurb: {
        en: 'Reaching practice, seated, within a range you can control.',
        de: 'Greifübungen im Sitzen, in einem kontrollierbaren Bereich.',
      },
    },
    hand: {
      label: 'Hand & fingers', icon: '🖐️', color: '#e11d48',
      names: { en: 'Hand & fingers', de: 'Hand & Finger' },
      blurb: {
        en: 'Opening and closing the hand — finger extension is usually the harder half.',
        de: 'Hand öffnen und schließen — das Strecken der Finger ist meist der schwerere Teil.',
      },
    },
  };

  /* type:
   *   'reps'    — calibrate a movement, then repeat it past a personal target
   *   'hold'    — reach the target and hold it for a set time
   *   'targets' — move a tracked body point onto targets on screen
   *
   * tracker: which MediaPipe model the exercise needs ('face' | 'pose' | 'hands')
   * metric:  key into the engine's measurement functions
   */
  var EXERCISES = [
    {
      id: 'rehab01', group: 'face', tracker: 'face', type: 'reps', metric: 'mouthOpen',
      icon: '😮', title: { en: 'Open Wide', de: 'Weit öffnen' },
      short: { en: 'Open and close your mouth.', de: 'Mund öffnen und schließen.' },
      cue: { en: 'Open your mouth as wide as is comfortable', de: 'Öffne den Mund so weit wie angenehm' },
      relaxCue: { en: 'Let your mouth close and relax', de: 'Mund schließen und entspannen' },
      rationale: {
        en: 'Repetitive active jaw opening through range. Task-specific, patient-initiated repetition is the core principle of motor rehabilitation, and a live mirror supplies the immediate visual feedback that supports motor learning.',
        de: 'Wiederholtes aktives Öffnen des Kiefers. Aufgabenspezifische, selbst ausgeführte Wiederholung ist das Kernprinzip der motorischen Rehabilitation; der Live-Spiegel liefert die unmittelbare visuelle Rückmeldung.',
      },
      defaultReps: 10, sets: 2,
    },
    {
      id: 'rehab02', group: 'face', tracker: 'face', type: 'reps', metric: 'smile',
      icon: '😁', title: { en: 'Big Smile', de: 'Breites Lächeln' },
      short: { en: 'Smile, and watch both sides.', de: 'Lächeln — beide Seiten beobachten.' },
      cue: { en: 'Smile — try to lift both corners together', de: 'Lächle — hebe beide Mundwinkel gleichzeitig' },
      relaxCue: { en: 'Relax your face completely', de: 'Gesicht ganz entspannen' },
      symmetry: true,
      rationale: {
        en: 'Facial neuromuscular retraining conventionally uses mirror feedback so the person can see the two sides of the face move differently and work towards symmetry rather than force. This exercise reports a symmetry score alongside the movement size for that reason.',
        de: 'Faziale neuromuskuläre Umschulung arbeitet üblicherweise mit Spiegel-Feedback, damit die ungleiche Bewegung beider Seiten sichtbar wird und auf Symmetrie statt auf Kraft hingearbeitet wird. Daher wird hier neben der Bewegungsgröße auch ein Symmetriewert angezeigt.',
      },
      defaultReps: 10, sets: 2,
    },
    {
      id: 'rehab03', group: 'face', tracker: 'face', type: 'reps', metric: 'browRaise',
      icon: '🤨', title: { en: 'Eyebrow Lift', de: 'Augenbrauen heben' },
      short: { en: 'Raise your eyebrows.', de: 'Augenbrauen hochziehen.' },
      cue: { en: 'Raise your eyebrows — look surprised', de: 'Augenbrauen hochziehen — überrascht schauen' },
      relaxCue: { en: 'Let your forehead relax', de: 'Stirn entspannen' },
      symmetry: true,
      rationale: {
        en: 'Active practice of the forehead muscles, which are commonly involved in facial weakness after stroke. Isolating one movement at a time, with feedback, follows standard facial retraining practice.',
        de: 'Aktives Üben der Stirnmuskulatur, die bei fazialer Schwäche nach Schlaganfall häufig betroffen ist. Einzelne Bewegungen isoliert und mit Rückmeldung zu üben entspricht der üblichen Praxis der Gesichtsschulung.',
      },
      defaultReps: 10, sets: 2,
    },
    {
      id: 'rehab04', group: 'face', tracker: 'face', type: 'hold', metric: 'eyeClose',
      icon: '😌', title: { en: 'Gentle Eye Close', de: 'Augen sanft schließen' },
      short: { en: 'Close your eyes and hold.', de: 'Augen schließen und halten.' },
      cue: { en: 'Close both eyes gently and hold', de: 'Beide Augen sanft schließen und halten' },
      relaxCue: { en: 'Open your eyes', de: 'Augen öffnen' },
      symmetry: true, holdMs: 3000,
      rationale: {
        en: 'Practice at closing the eye is a routine part of facial rehabilitation, because incomplete closure leaves the eye unprotected. Hold time and side-to-side difference are both reported. Gentle effort only — this is not a strength exercise.',
        de: 'Das Üben des Augenschlusses gehört zur fazialen Rehabilitation, da ein unvollständiger Lidschluss das Auge ungeschützt lässt. Haltedauer und Seitenunterschied werden erfasst. Nur sanfte Anspannung — dies ist keine Kraftübung.',
      },
      defaultReps: 6, sets: 2,
      caution: {
        en: 'If the eye does not close fully, tell your clinician — the eye may need protection such as drops or taping.',
        de: 'Wenn sich das Auge nicht vollständig schließt, informieren Sie Ihre Behandelnden — das Auge braucht ggf. Schutz (Tropfen, Abkleben).',
      },
    },
    {
      id: 'rehab05', group: 'face', tracker: 'face', type: 'reps', metric: 'pucker',
      icon: '😗', title: { en: 'Pucker Up', de: 'Lippen spitzen' },
      short: { en: 'Purse your lips forward.', de: 'Lippen nach vorne spitzen.' },
      cue: { en: 'Purse your lips as if to whistle', de: 'Lippen spitzen wie zum Pfeifen' },
      relaxCue: { en: 'Relax your lips', de: 'Lippen entspannen' },
      rationale: {
        en: 'Lip rounding practice targets the muscle ring around the mouth, which contributes to sealing the lips for eating, drinking and speech sounds. Repetition with visual feedback, as above.',
        de: 'Das Spitzen der Lippen trainiert den Ringmuskel um den Mund, der für den Lippenschluss beim Essen, Trinken und Sprechen wichtig ist. Wiederholung mit visueller Rückmeldung wie oben.',
      },
      defaultReps: 10, sets: 2,
    },
    {
      id: 'rehab06', group: 'head', tracker: 'face', type: 'reps', metric: 'headYaw',
      icon: '↔️', title: { en: 'Look Left & Right', de: 'Nach links & rechts schauen' },
      short: { en: 'Turn your head side to side.', de: 'Kopf zur Seite drehen.' },
      cue: { en: 'Turn your head slowly towards the target', de: 'Drehe den Kopf langsam zum Ziel' },
      relaxCue: { en: 'Return to the middle', de: 'Zurück zur Mitte' },
      bidirectional: true,
      rationale: {
        en: 'Slow, active neck rotation through a comfortable range. Movement is self-paced and the target adapts to the range actually available, so the exercise never asks for more rotation than the person has shown they can reach.',
        de: 'Langsame, aktive Halsdrehung im angenehmen Bereich. Das Tempo bestimmt die Person selbst; das Ziel richtet sich nach dem tatsächlich gezeigten Bewegungsumfang.',
      },
      defaultReps: 12, sets: 2,
      caution: {
        en: 'Move slowly. Stop if you feel dizzy, and tell your clinician.',
        de: 'Langsam bewegen. Bei Schwindel abbrechen und Behandelnde informieren.',
      },
    },
    {
      id: 'rehab07', group: 'vision', tracker: 'face', type: 'targets', metric: 'nosePoint',
      icon: '🔎', title: { en: 'Find the Star', de: 'Finde den Stern' },
      short: { en: 'Search for targets on your weaker side.', de: 'Ziele auf der schwächeren Seite suchen.' },
      cue: { en: 'Move your head to bring the pointer onto the star', de: 'Bewege den Kopf, um den Zeiger auf den Stern zu bringen' },
      biasToAffected: true,
      rationale: {
        en: 'Structured visual scanning practice, with most targets placed towards the side that is easy to miss. Scanning training is a long-standing approach for one-sided inattention after stroke; it reliably improves scanning on tasks like this one, while how far that carries into everyday activities is less certain and should be judged by the treating clinician.',
        de: 'Strukturiertes Absuch-Training, wobei die meisten Ziele zur leicht übersehenen Seite hin liegen. Scanning-Training ist ein etablierter Ansatz bei einseitiger Vernachlässigung; es verbessert das Absuchen in solchen Aufgaben zuverlässig, während die Übertragung in den Alltag weniger sicher ist und klinisch beurteilt werden muss.',
      },
      defaultReps: 15, sets: 1,
    },
    {
      id: 'rehab08', group: 'arm', tracker: 'pose', type: 'targets', metric: 'wristPoint',
      icon: '🎯', title: { en: 'Reach the Target', de: 'Ziel erreichen' },
      short: { en: 'Reach out and touch the targets.', de: 'Nach den Zielen greifen.' },
      cue: { en: 'Reach out and hold your hand on the target', de: 'Strecke den Arm aus und halte die Hand auf dem Ziel' },
      usesAffectedArm: true,
      rationale: {
        en: 'Goal-directed reaching with the affected arm — the most task-specific of these exercises, and the closest to everyday use. Targets are placed inside the reach the person demonstrated during calibration, then widened only as that improves.',
        de: 'Zielgerichtetes Greifen mit dem betroffenen Arm — die alltagsnächste dieser Übungen. Die Ziele liegen innerhalb der bei der Kalibrierung gezeigten Reichweite und werden erst mit dieser erweitert.',
      },
      defaultReps: 12, sets: 2,
      caution: {
        en: 'Sit supported. Do not lean or stretch beyond a position you can hold safely.',
        de: 'Mit Rückenlehne sitzen. Nicht über eine sicher haltbare Position hinaus lehnen oder strecken.',
      },
    },
    {
      id: 'rehab09', group: 'hand', tracker: 'hands', type: 'reps', metric: 'handOpen',
      icon: '✋', title: { en: 'Open & Close', de: 'Öffnen & Schließen' },
      short: { en: 'Open your hand, then make a fist.', de: 'Hand öffnen, dann Faust machen.' },
      cue: { en: 'Open your hand — spread your fingers', de: 'Hand öffnen — Finger spreizen' },
      relaxCue: { en: 'Close into a soft fist', de: 'Zur lockeren Faust schließen' },
      usesAffectedArm: true,
      rationale: {
        en: 'Grasp-and-release practice. Straightening the fingers is typically the harder direction after a stroke, so the counted movement here is opening the hand rather than gripping.',
        de: 'Greifen-und-Loslassen. Das Strecken der Finger ist nach einem Schlaganfall meist die schwierigere Richtung — gezählt wird daher das Öffnen der Hand, nicht das Zugreifen.',
      },
      defaultReps: 12, sets: 2,
    },
  ];

  var BY_ID = {};
  EXERCISES.forEach(function (e) { BY_ID[e.id] = e; });

  function byId(id) { return BY_ID[id] || null; }
  function titleOf(id, lang) {
    var e = BY_ID[id];
    if (!e) return id;
    return e.title[lang] || e.title.en;
  }
  function groupOf(id) { return BY_ID[id] ? BY_ID[id].group : null; }
  function groupName(group, lang) {
    var g = GROUPS[group];
    if (!g) return group || '';
    return (g.names && (g.names[lang] || g.names.en)) || g.label;
  }

  /* Text is written in English and German. Polish and Spanish fall back to
     English on purpose: these are clinical instructions, and they should be
     translated by a native speaker together with a clinician rather than
     guessed at. The UI says so where it matters. */
  var LANGS = ['en', 'de'];
  function t(obj, lang) {
    if (!obj) return '';
    return obj[lang] || obj.en || '';
  }

  return {
    groups: GROUPS, exercises: EXERCISES, langs: LANGS,
    byId: byId, titleOf: titleOf, groupOf: groupOf, groupName: groupName, t: t,
  };
});

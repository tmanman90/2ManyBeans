// tastingWizardSteps — the wizard's step machine, PURE + harness-testable.
// Encodes the full Hoffmann sensory arc (docs/research/2026-06-29-tasting-methodology-brief.md §A)
// and the EXACT mapping of each beat onto the EXISTING tasting record (no new fields):
//   record fields: aroma, firstSip, acidity, sweetness, body, finish, oneWord, notes,
//                  changeTomorrow, rating  +  tastingScores{fragranceAroma,acidity,sweetness,
//                  body,flavor,balance}
//   radar axes (TasteFingerprint.AXES) ← FIELD_FOR: fragranceAroma←aroma, acidity, sweetness,
//                  body, flavor←firstSip, balance←finish.
// The wizard writes tastingScores DIRECTLY from its 0–10 inputs, so the FlavorRadar is real and
// builds live. Eight beats; some share a record field (named flavors → notes, balance → notes),
// honoring the full arc without changing the data model.

import { AXES, notchLabel } from './flavorWheel';

const AXIS_BY_KEY = Object.fromEntries(AXES.map(a => [a.key, a]));

// kind: how the step is rendered (U5 controls).  field: the record field its text fills.
// scoreKey: the 6-axis radar score its 0–10 value writes (null = no radar axis — e.g. Finish length).
export const TASTING_WIZARD_STEPS = [
  {
    key: 'smell', title: 'Smell', glossary: 'smell', kind: 'aroma',
    field: 'aroma', scoreKey: 'fragranceAroma',
    prompt: 'Before you sip — break the crust and breathe in.',
    technique: 'Pour, wait four minutes, then push your nose to the cup and break the floating crust with a spoon. The aroma bursts right as it breaks.',
    intensityLabel: 'How loud is the aroma?',
  },
  {
    key: 'firstsip', title: 'First sip', glossary: 'aroma', kind: 'sip',
    field: 'firstSip', scoreKey: null,
    prompt: 'Now taste it — slurp, don\'t sip.',
    technique: 'Slurp loudly to spray it across your whole tongue, and wait until it\'s warm, not hot — heat hides flavor. What\'s your gut first impression?',
  },
  {
    key: 'acidity', title: 'Acidity', glossary: 'acidity', kind: 'slider', axisKey: 'acidity',
    field: 'acidity', scoreKey: 'acidity',
    prompt: 'Find the liveliness.',
    technique: 'Acidity is the sparkle — the juicy, mouth-watering snap, like biting an apple. It\'s the lively quality, not sourness.',
  },
  {
    key: 'sweetness', title: 'Sweetness', glossary: 'sweetness', kind: 'slider', axisKey: 'sweetness',
    field: 'sweetness', scoreKey: 'sweetness',
    prompt: 'Hunt for the sweetness.',
    technique: 'Let the cup cool a little — sweetness grows as it drops in temperature. Think honey, caramel, ripe fruit.',
  },
  {
    key: 'body', title: 'Body', glossary: 'body', kind: 'slider', axisKey: 'body',
    field: 'body', scoreKey: 'body',
    prompt: 'Feel the weight.',
    technique: 'Close your eyes and feel the texture on your tongue — light like tea, or heavy like cream? More body isn\'t better, just different.',
  },
  {
    key: 'flavor', title: 'Flavor', glossary: 'aroma', kind: 'flavor',
    field: 'notes', scoreKey: 'flavor',
    prompt: 'Name what you taste.',
    technique: 'Breathe out through your nose as you swallow — that\'s retronasal smell, where flavor lives. Start broad (fruit? chocolate?) then zoom in.',
    intensityLabel: 'How much flavor comes through?',
  },
  {
    key: 'finish', title: 'Finish', glossary: 'finish', kind: 'slider', axisKey: 'finish',
    field: 'finish', scoreKey: null,
    prompt: 'Notice the finish.',
    technique: 'Swallow, then wait. How long does the flavor linger, and is it pleasant the whole way down? A long, clean finish is a quality signal.',
  },
  {
    key: 'balance', title: 'Balance', glossary: 'balance', kind: 'balance',
    field: null, scoreKey: 'balance',
    prompt: 'Does it all hang together?',
    technique: 'Step back from the parts. Do acidity, sweetness, body and flavor feel in harmony — or does one shout over the others? That\'s balance.',
  },
];

export const WIZARD_STEP_KEYS = TASTING_WIZARD_STEPS.map(s => s.key);

// A fresh answers object. scores hold the 6 radar magnitudes 0–10 (null = untouched);
// finishLevel is the Finish slider (no radar axis); text holds per-step elaboration; chips hold
// selected descriptor labels.
export function initialAnswers() {
  return {
    scores: { fragranceAroma: null, acidity: null, sweetness: null, body: null, flavor: null, balance: null },
    finishLevel: null,
    text: { smell: '', firstsip: '', acidity: '', sweetness: '', body: '', flavor: '', finish: '', balance: '' },
    aromaChips: [],
    flavorChips: [],
    oneWord: '',
    notes: '',
    changeTomorrow: '',
    rating: 0,
  };
}

// Captured magnitudes so far → drives the live coverage radar before all six axes land.
export function capturedScores(answers) {
  const out = {};
  for (const k of Object.keys(answers.scores)) {
    const v = answers.scores[k];
    out[k] = (v != null && v > 0) ? v : 0;
  }
  return out;
}

// Deterministic completeness — never blocks on AI.
export function stepComplete(step, answers) {
  if (step.key === 'finish') return answers.finishLevel != null;
  if (step.kind === 'slider' || step.kind === 'balance') return answers.scores[step.scoreKey] != null;
  if (step.kind === 'aroma') return answers.aromaChips.length > 0 || !!answers.text.smell.trim() || answers.scores.fragranceAroma != null;
  if (step.kind === 'flavor') return answers.flavorChips.length > 0 || answers.scores.flavor != null;
  if (step.kind === 'sip') return !!answers.text.firstsip.trim();
  return true;
}

// Build the EXISTING-shape tasting record from collected answers. Pure — the deterministic core,
// works with zero AI. tastingScores written directly so the radar is real.
export function buildTastingFromAnswers(answers, beanId, date) {
  const a = answers;
  const sliderField = (axisKey, value, extra) => {
    const word = value != null ? capitalize(notchLabel(AXIS_BY_KEY[axisKey], value)) : '';
    return [word, (extra || '').trim()].filter(Boolean).join(' — ');
  };

  const aroma = [a.aromaChips.join(', '), a.text.smell.trim()].filter(Boolean).join(' — ');
  const flavorLine = a.flavorChips.length ? `Flavors: ${a.flavorChips.join(', ')}.` : '';
  const balanceLine = a.text.balance.trim() ? `Balance: ${a.text.balance.trim()}.` : '';
  const notes = [flavorLine, balanceLine, a.notes.trim()].filter(Boolean).join(' ');

  const scores = {};
  for (const k of Object.keys(a.scores)) {
    const v = a.scores[k];
    if (v != null && v > 0) scores[k] = Math.round(v);
  }

  const record = {
    beanId,
    date,
    aroma,
    firstSip: a.text.firstsip.trim(),
    acidity: sliderField('acidity', a.scores.acidity, a.text.acidity),
    sweetness: sliderField('sweetness', a.scores.sweetness, a.text.sweetness),
    body: sliderField('body', a.scores.body, a.text.body),
    finish: sliderField('finish', a.finishLevel, a.text.finish),
    oneWord: a.oneWord.trim(),
    notes,
    changeTomorrow: a.changeTomorrow.trim(),
    rating: a.rating || null,
  };
  if (Object.keys(scores).length) record.tastingScores = scores;
  return record;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

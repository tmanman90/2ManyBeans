// Palate math for the R5 tinder → R11 spider chart flow.
//
// Five cards probe five independent palate axes. Each swipe contributes
// ±0.6 on that axis — a single pass through the card deck produces a
// sparse 5-axis chart that's meaningful enough to render, without
// pretending we've learned subtleties we haven't.

export const TINDER_CARDS = [
  {
    id: 'c1_sweetness',
    axis: 'sweetness',
    prompt: 'I want my coffee to taste sweet, not sharp.',
  },
  {
    id: 'c2_acidity',
    axis: 'acidity',
    prompt: 'I want bright, fruity acidity — lemon, apricot, berries.',
  },
  {
    id: 'c3_body',
    axis: 'body',
    prompt: 'I want a heavy, syrupy mouthfeel.',
  },
  {
    id: 'c4_clean_funky',
    axis: 'clean_funky',
    prompt: 'I trust washed coffees over naturals and anaerobics.',
  },
  {
    id: 'c5_fruit_nutty',
    axis: 'fruit_nutty',
    prompt: "I'd rather taste chocolate and nuts than fruit.",
  },
];

const CARD_AXIS_MAP = Object.fromEntries(
  TINDER_CARDS.map((c) => [c.id, c.axis])
);

export function computePalateChart(tinderCards) {
  const chart = {
    sweetness: 0,
    acidity: 0,
    body: 0,
    clean_funky: 0,
    fruit_nutty: 0,
  };
  if (!Array.isArray(tinderCards)) return chart;
  for (const card of tinderCards) {
    const axis = CARD_AXIS_MAP[card?.id];
    if (!axis) continue;
    chart[axis] = card.swipe === 'yes' ? 0.6 : -0.6;
  }
  return chart;
}

// Full-word axis labels for R09/R11 copy (NOTE for onboarding-100x U4a: this is
// distinct from OnboardingPalateChart's own `AXES` labels — those are short
// chart-display words picked for the SVG legend (Sweet/Bright/Body/Clean/Cocoa),
// not equivalent strings. These are the full-word labels the CREATIVE_SPEC
// templates need, e.g. "Clean vs funky: you lean in." — kept here rather than
// duplicated inline in each screen.)
export const AXIS_LABELS = {
  sweetness: 'Sweetness',
  acidity: 'Acidity',
  body: 'Body',
  clean_funky: 'Clean vs funky',
  fruit_nutty: 'Fruit vs nutty',
};

// R11 palate archetype (CREATIVE_SPEC.md Appendix A2). Deterministic: ordered
// sign checks, first match wins, top to bottom. All-zero chart or no match
// falls through to rule 8.
export function palateArchetype(chart) {
  const c = chart && typeof chart === 'object' ? chart : {};
  const sweetness = c.sweetness || 0;
  const acidity = c.acidity || 0;
  const body = c.body || 0;
  const clean_funky = c.clean_funky || 0;
  const fruit_nutty = c.fruit_nutty || 0;

  if (acidity > 0 && fruit_nutty < 0) {
    return { n: 1, title: 'The Bright Side', subtitle: 'Bright, fruity, alive in the cup.' };
  }
  if (sweetness > 0 && body > 0) {
    return { n: 2, title: 'Syrup & Structure', subtitle: 'Sweet, heavy, dessert in a mug.' };
  }
  if (fruit_nutty > 0 && body > 0) {
    return { n: 3, title: 'The Comfort Classic', subtitle: 'Chocolate, nuts, and a proper backbone.' };
  }
  if (clean_funky > 0 && acidity > 0) {
    return { n: 4, title: 'The Purist', subtitle: 'Washed, precise, nothing to hide.' };
  }
  if (clean_funky < 0) {
    return { n: 5, title: 'The Wild Card', subtitle: 'Naturals, ferments, the fun stuff.' };
  }
  if (sweetness > 0 && acidity > 0) {
    return { n: 6, title: 'Candy Apple', subtitle: 'Sweetness riding on bright fruit.' };
  }
  if (body < 0 && acidity > 0) {
    return { n: 7, title: 'Tea & Light', subtitle: 'Delicate, tea-like, floral-leaning.' };
  }
  return { n: 8, title: 'The Open Palate', subtitle: 'Still mapping. Every cup teaches me more.' };
}

// R11 prediction line (CREATIVE_SPEC.md Appendix A3), keyed by archetype
// number 1-8. Unknown/missing n falls back to entry 8.
const PALATE_PREDICTIONS = {
  1: 'washed Ethiopians: lemon and florals',
  2: 'natural Brazils: caramel and body',
  3: 'washed Colombians: cocoa and balance',
  4: 'washed Kenyans: blackcurrant clarity',
  5: 'anaerobic naturals: wild and jammy',
  6: 'juicy naturals: berries and sweetness',
  7: 'high-grown washed Geshas: jasmine and tea',
  8: 'a washed Ethiopian: the perfect first test',
};

export function palatePrediction(archetypeN) {
  return PALATE_PREDICTIONS[archetypeN] || PALATE_PREDICTIONS[8];
}

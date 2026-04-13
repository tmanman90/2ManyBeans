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

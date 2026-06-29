// flavorWheel — the SCA-style descriptor tree (tappable chips) + the axis slider configs.
// Pure data. From docs/research/2026-06-29-tasting-methodology-brief.md §B (wheel) + §C (axes).
// Tier 1 = wheel petals (always available), Tier 2 = sub-family (always available), Tier 3 =
// specific descriptor (GATED behind palate level — texture/family first, specifics unlock later).

// Each category: { key, label, accent? } and either `sub` (Tier-2 groups w/ Tier-3 items) or
// `items` (flat Tier-3 list). Off-notes flagged so the UI can tint them as flags, not flavors.
export const FLAVOR_WHEEL = [
  { key: 'fruity', label: 'Fruity', sub: [
    { key: 'berry', label: 'Berry', items: ['blueberry', 'strawberry', 'raspberry', 'blackcurrant'] },
    { key: 'citrus', label: 'Citrus', items: ['lemon', 'lime', 'orange', 'grapefruit', 'bergamot'] },
    { key: 'stone', label: 'Stone fruit', items: ['peach', 'apricot', 'plum'] },
    { key: 'tropical', label: 'Tropical', items: ['mango', 'passionfruit', 'pineapple'] },
    { key: 'dried', label: 'Dried fruit', items: ['raisin', 'date', 'fig'] },
  ] },
  { key: 'floral', label: 'Floral', items: ['jasmine', 'rose', 'lavender', 'chamomile', 'honeysuckle'] },
  { key: 'sweet', label: 'Sweet', sub: [
    { key: 'caramelized', label: 'Caramelized', items: ['caramel', 'toffee', 'brown sugar', 'molasses', 'maple'] },
    { key: 'honeyv', label: 'Honey', items: ['honey'] },
    { key: 'vanilla', label: 'Vanilla', items: ['vanilla'] },
  ] },
  { key: 'nutcocoa', label: 'Nutty / Cocoa', sub: [
    { key: 'nutty', label: 'Nutty', items: ['almond', 'hazelnut', 'walnut', 'peanut'] },
    { key: 'choc', label: 'Chocolate', items: ['dark chocolate', 'milk chocolate', 'cocoa', 'cacao nib'] },
  ] },
  { key: 'spices', label: 'Spices', items: ['cinnamon', 'clove', 'cardamom', 'black pepper', 'nutmeg'] },
  { key: 'roasted', label: 'Roasted', items: ['toast', 'grain', 'malt', 'smoky', 'ashy', 'burnt'] },
  { key: 'green', label: 'Green / Veg', items: ['herbal', 'grassy', 'leafy', 'peapod'] },
  { key: 'ferment', label: 'Winey / Fermented', items: ['winey', 'boozy', 'overripe', 'funky'] },
  { key: 'offnotes', label: 'Off-notes', flag: true, items: ['earthy', 'woody', 'cardboard', 'barnyard', 'rubber', 'potato', 'papery'] },
];

// Tier-3 (specific descriptors) unlocks at palate level 2+. Below that, the user picks a
// family ("Fruity → Berry") — texture/family first, per Hoffmann's beginner method.
export function tier3Unlocked(level) {
  return (level || 1) >= 2;
}

// Flatten helper: all chip labels at a given level (for harness assertions + free-text matching).
export function chipsForLevel(level) {
  const out = [];
  for (const cat of FLAVOR_WHEEL) {
    out.push({ tier: 1, key: cat.key, label: cat.label });
    const groups = cat.sub || [{ key: cat.key, label: cat.label, items: cat.items }];
    for (const g of groups) {
      if (cat.sub) out.push({ tier: 2, key: g.key, label: g.label });
      if (tier3Unlocked(level)) for (const it of g.items) out.push({ tier: 3, key: it, label: it });
    }
  }
  return out;
}

// --- Axis slider configs (0–10) with novice notch labels (tastingGlossary vocabulary) ---
// `scoreKey` = the 6-axis fingerprint score this slider feeds (or null); `field` = the tasting
// record field it writes (the notch word). acidity/sweetness/body feed the radar directly →
// the fingerprint is real. Finish is a tasting field, not a radar axis (fragranceAroma, flavor,
// balance come from the smell / flavor / balance steps in the wizard).
export const AXES = [
  {
    key: 'acidity', scoreKey: 'acidity', field: 'acidity', label: 'Acidity',
    help: 'The liveliness — is it bright and juicy, or flat?',
    teach: 'Pleasant acidity feels alive, like biting a crisp apple. "Sour" is the unpleasant extreme — not the same thing.',
    notches: ['flat', 'soft', 'crisp', 'bright', 'sharp'],
  },
  {
    key: 'sweetness', scoreKey: 'sweetness', field: 'sweetness', label: 'Sweetness',
    help: 'How sweet — it grows as the cup cools.',
    teach: 'Honey, brown sugar, ripe fruit. This is aroma-driven sweetness, not added sugar.',
    notches: ['faint', 'present', 'sweet', 'rich', 'syrupy'],
  },
  {
    key: 'body', scoreKey: 'body', field: 'body', label: 'Body',
    help: 'The weight and texture — close your eyes and feel it.',
    teach: 'Light like tea, or heavy like cream? More body isn\'t better — just different.',
    notches: ['tea', 'light', 'juice', 'creamy', 'syrupy'],
  },
  {
    key: 'finish', scoreKey: null, field: 'finish', label: 'Finish',
    help: 'How long the flavor lingers after you swallow.',
    teach: 'A clean, long finish is a quality signal; flat or woody can mean it\'s past its best.',
    notches: ['short', 'medium', 'long', 'lingering', 'endless'],
  },
];

// Map a 0–10 slider value to its notch label.
export function notchLabel(axis, value) {
  const n = axis.notches;
  const i = Math.min(n.length - 1, Math.max(0, Math.round((value / 10) * (n.length - 1))));
  return n[i];
}

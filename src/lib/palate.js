// palate — the progression / skill layer, DERIVED from existing tasting history (no new
// Firebase storage). Drives the "texture-first → flavor-naming" unlock (Tier-3 chips) and the
// "your palate" surface. From docs/research/2026-06-29-tasting-methodology-brief.md §E.

const TITLES = ['Curious', 'Developing palate', 'Capable taster', 'Sharp palate', 'Seasoned taster'];
// Cups-logged thresholds for each level boundary (index = level).
const THRESH = [0, 3, 10, 25, 50];

// Compute the user's palate level + progress from their logged tastings.
export function palateLevel(tastings = []) {
  const cups = tastings.length;
  const vocab = new Set();
  for (const t of tastings) {
    for (const s of [t?.oneWord, t?.aroma, t?.notes]) {
      String(s || '').toLowerCase().split(/[^a-z]+/).forEach(w => { if (w.length > 3) vocab.add(w); });
    }
  }
  let level = 1;
  if (cups >= THRESH[1]) level = 2;
  if (cups >= THRESH[2]) level = 3;
  if (cups >= THRESH[3]) level = 4;
  if (cups >= THRESH[4]) level = 5;

  const prevAt = THRESH[level - 1] ?? 0;
  const nextAt = THRESH[level] ?? null; // cups needed to reach the next level (null at max)
  const progress = nextAt ? Math.min(1, Math.max(0, (cups - prevAt) / (nextAt - prevAt))) : 1;

  return {
    level,
    title: TITLES[level - 1],
    cups,
    vocab: vocab.size,
    nextAt,
    toNext: nextAt ? Math.max(0, nextAt - cups) : 0,
    progress,
  };
}

// Which scaffolding tiers are unlocked at a level. Tier-3 specific-flavor chips unlock at L2+
// (texture/family first, specifics later — Hoffmann's beginner method).
export function unlockedTiers(level) {
  return { tier1: true, tier2: true, tier3: (level || 1) >= 2 };
}

// Derives the "hero" tasting for a bean — the one whose rating + words headline an
// Archive entry. Highest rating wins; ties break to the most recent. Pure read-only
// over the tastings the app already loads (no Firestore, no writes).

// The hero tasting object for one bean, or null if it has no tastings.
export function heroTastingFor(beanId, tastings) {
  let best = null;
  for (const t of tastings) {
    if (t.beanId !== beanId) continue;
    if (!best) { best = t; continue; }
    const r = t.rating || 0;
    const br = best.rating || 0;
    if (r > br || (r === br && (t.date || '') > (best.date || ''))) best = t;
  }
  return best;
}

// A short pull-quote for an entry headline, degrading gracefully:
// free notes → one-word impression → first aroma note → null (caller falls back to meta).
// All branches normalize whitespace, so a blank/whitespace field never yields an empty quote.
export function pullQuoteFrom(tasting, maxLen = 90) {
  if (!tasting) return null;
  const note = (tasting.notes || '').trim();
  if (note) return note.length > maxLen ? note.slice(0, maxLen - 1).trimEnd() + '…' : note;
  const ow = (tasting.oneWord || '').trim();
  if (ow) return ow;
  const aroma = (tasting.aroma || '').split(/[,·/]/).map(s => s.trim()).filter(Boolean);
  return aroma.length ? aroma.slice(0, 3).join(', ') : null;
}

// {rating, oneWord, quote} for an entry hero, or null when the bean has no tasting.
// oneWord is normalized to a non-empty trimmed string or null (no whitespace-only words).
export function entryHero(beanId, tastings) {
  const t = heroTastingFor(beanId, tastings);
  if (!t) return null;
  return { rating: t.rating || 0, oneWord: (t.oneWord || '').trim() || null, quote: pullQuoteFrom(t), tasting: t };
}

// TasteFingerprint — a compact radar glyph that gives each logged cup a recognizable
// "flavor shape." Pure + read-only.
//   • Default (journal): renders ONLY from the tasting's stored 6-axis tastingScores
//     (from convertTastingScores) — real magnitudes, never fabricated. Returns null
//     when the cup has no stored scores, so manual/unscored cups degrade gracefully.
//   • coverage mode (live coach): renders a COVERAGE polygon — each captured axis at a
//     uniform radius, uncaptured at 0. This honestly shows *which* axes have been noted
//     so far (it does not imply intensity), letting "your cup so far" build live.
import { C } from '../styles/theme';

export const AXES = ['fragranceAroma', 'acidity', 'sweetness', 'body', 'flavor', 'balance'];
export const AXIS_LABELS = { fragranceAroma: 'Aroma', acidity: 'Acidity', sweetness: 'Sweetness', body: 'Body', flavor: 'Flavor', balance: 'Balance' };
// Which qualitative tasting field maps to each axis (coverage mode + detail descriptors).
export const FIELD_FOR = { fragranceAroma: 'aroma', acidity: 'acidity', sweetness: 'sweetness', body: 'body', flavor: 'firstSip', balance: 'finish' };

// Resolve the radar scores for a tasting: real magnitudes, or coverage, or null.
export function radarScores(tasting, coverage = false) {
  return coverage ? coverageScores(tasting) : realScores(tasting);
}

// Real stored magnitudes, or null. No fabrication.
function realScores(tasting) {
  const ts = tasting?.tastingScores;
  if (!ts || typeof ts !== 'object') return null;
  const s = {}; let any = false;
  AXES.forEach(k => { const v = Number(ts[k]); if (!isNaN(v) && v > 0) { s[k] = v; any = true; } else s[k] = 0; });
  return any ? s : null;
}

// Coverage: captured axis → full radius (uniform), uncaptured → 0. Presence, not intensity.
function coverageScores(tasting) {
  const s = {}; let any = false;
  AXES.forEach(k => {
    const has = tasting?.[FIELD_FOR[k]] && String(tasting[FIELD_FOR[k]]).trim();
    s[k] = has ? 10 : 0;
    if (has) any = true;
  });
  return any ? s : null;
}

const pt = (i, v, cx, cy, r) => {
  const a = (i * 60 - 90) * (Math.PI / 180);
  return [cx + r * (v / 10) * Math.cos(a), cy + r * (v / 10) * Math.sin(a)];
};
const path = (vals, cx, cy, r) =>
  vals.map((v, i) => pt(i, v, cx, cy, r)).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ' Z';

export function TasteFingerprint({ tasting, size = 46, color = C.accent, coverage = false }) {
  const scores = coverage ? coverageScores(tasting) : realScores(tasting);
  if (!scores) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.42;
  const poly = path(AXES.map(k => scores[k] || 0), cx, cy, r);
  const ring = path(AXES.map(() => 10), cx, cy, r);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="taste fingerprint" style={{ display: 'block', flexShrink: 0 }}>
      <path d={ring} fill="none" stroke={C.hairline} strokeWidth={0.75} />
      {AXES.map((_, i) => { const e = pt(i, 10, cx, cy, r); return <line key={i} x1={cx} y1={cy} x2={e[0]} y2={e[1]} stroke={C.hairline} strokeWidth={0.5} />; })}
      <path d={poly} fill={`${color}26`} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

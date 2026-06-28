// TasteFingerprint — a compact radar glyph that gives each logged cup a recognizable
// "flavor shape." Pure + read-only: it prefers the tasting's stored 6-axis tastingScores
// (from convertTastingScores), and otherwise falls back to a presence shape from the
// qualitative axis fields (matching how the live coach radar marks captured axes). It
// never fabricates magnitudes and returns null when the cup has no axis data at all.
import { C } from '../styles/theme';

const AXES = ['fragranceAroma', 'acidity', 'sweetness', 'body', 'flavor', 'balance'];
// Which qualitative tasting field stands in for each radar axis (presence fallback).
const FIELD_FOR = { fragranceAroma: 'aroma', acidity: 'acidity', sweetness: 'sweetness', body: 'body', flavor: 'firstSip', balance: 'finish' };

function scoresFor(tasting) {
  const ts = tasting?.tastingScores;
  if (ts && typeof ts === 'object') {
    const s = {}; let any = false;
    AXES.forEach(k => { const v = Number(ts[k]); if (!isNaN(v) && v > 0) { s[k] = v; any = true; } else s[k] = 0; });
    if (any) return s;
  }
  // presence fallback: captured axis → mid value, empty → a small floor (so the shape reads)
  const s = {}; let any = false;
  AXES.forEach(k => {
    const has = tasting?.[FIELD_FOR[k]] && String(tasting[FIELD_FOR[k]]).trim();
    s[k] = has ? 6.5 : 1.8;
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

export function TasteFingerprint({ tasting, size = 46, color = C.accent }) {
  const scores = scoresFor(tasting);
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

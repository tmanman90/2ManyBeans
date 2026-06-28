// FlavorRadar — the hero of the Tasting detail view. A large 6-axis radar that draws
// its flavor shape in (stroke pathLength + fill fade + dots stagger), built from the
// same scores as the small TasteFingerprint glyph. Transform/opacity-only; reduced-motion
// renders the final shape statically. Pure + read-only.
import { useReducedMotion } from 'framer-motion';
import { m } from '../lib/motion';
import { C, fonts } from '../styles/theme';
import { AXES, AXIS_LABELS, radarScores } from './TasteFingerprint';

const pt = (i, v, cx, cy, r) => {
  const a = (i * 60 - 90) * (Math.PI / 180);
  return [cx + r * (v / 10) * Math.cos(a), cy + r * (v / 10) * Math.sin(a)];
};
const polyPath = (vals, cx, cy, r) =>
  vals.map((v, i) => pt(i, v, cx, cy, r)).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ' Z';

export function FlavorRadar({ tasting, coverage = false, size = 248 }) {
  const reduce = useReducedMotion();
  const scores = radarScores(tasting, coverage);
  const cx = size / 2, cy = size / 2, r = size * 0.34, labelR = size * 0.46;
  const rings = [0.34, 0.67, 1].map(level => polyPath(AXES.map(() => level * 10), cx, cy, r));
  const shape = scores ? polyPath(AXES.map(k => scores[k] || 0), cx, cy, r) : null;
  const ease = [0.16, 1, 0.3, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="flavor radar" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      {/* grid rings */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill={i === rings.length - 1 ? `${C.accentSoft}30` : 'none'} stroke={C.hairline} strokeWidth={i === rings.length - 1 ? 1 : 0.75} />
      ))}
      {/* spokes */}
      {AXES.map((_, i) => { const e = pt(i, 10, cx, cy, r); return <line key={i} x1={cx} y1={cy} x2={e[0]} y2={e[1]} stroke={C.hairline} strokeWidth={0.6} />; })}
      {/* the flavor shape — draws in */}
      {shape && (
        <>
          <m.path
            d={shape} fill={`${C.accent}22`} stroke={C.accent} strokeWidth={2} strokeLinejoin="round"
            initial={reduce ? { opacity: 1 } : { pathLength: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { pathLength: { duration: 0.9, ease }, opacity: { duration: 0.3 } }}
          />
          {AXES.map((k, i) => {
            const p = pt(i, scores[k] || 0, cx, cy, r);
            return (
              <m.circle key={k} cx={p[0]} cy={p[1]} r={3.5} fill={C.cream} stroke={C.accent} strokeWidth={1.75}
                initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduce ? { duration: 0 } : { delay: 0.5 + i * 0.05, duration: 0.3, ease }}
                style={{ transformOrigin: `${p[0]}px ${p[1]}px` }}
              />
            );
          })}
        </>
      )}
      {/* axis labels */}
      {AXES.map((k, i) => {
        const lp = pt(i, 10, cx, cy, labelR);
        return (
          <text key={k} x={lp[0]} y={lp[1]} textAnchor="middle" dominantBaseline="central"
            fill={C.textMuted} fontSize={10.5} fontFamily={fonts.body} fontWeight={700} letterSpacing="0.04em">
            {AXIS_LABELS[k]}
          </text>
        );
      })}
    </svg>
  );
}

// Spider/radar chart — 6-axis flavor profile with optional tasting overlay
import { C, fonts, type } from '../styles/theme';

const AXES = [
  { key: 'fragranceAroma', label: 'Aroma' },
  { key: 'acidity', label: 'Acidity' },
  { key: 'sweetness', label: 'Sweetness' },
  { key: 'body', label: 'Body' },
  { key: 'flavor', label: 'Flavor' },
  { key: 'balance', label: 'Balance' },
];

const getPoint = (axisIndex, value, cx, cy, radius) => {
  const angle = (axisIndex * 60 - 90) * (Math.PI / 180);
  return {
    x: cx + radius * (value / 10) * Math.cos(angle),
    y: cy + radius * (value / 10) * Math.sin(angle),
  };
};

const buildPolygon = (scores, cx, cy, radius) =>
  AXES.map((axis, i) => getPoint(i, scores[axis.key] || 0, cx, cy, radius))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ') + ' Z';

export const SpiderChart = ({ expectedScores, tastingScores, size = 260 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const labelRadius = size * 0.48;

  const gridLevels = [0.33, 0.66, 1.0];

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }}>
        {/* Grid hexagons — refined hairlines */}
        {gridLevels.map((level, li) => (
          <path
            key={li}
            d={buildPolygon(
              Object.fromEntries(AXES.map(a => [a.key, level * 10])),
              cx, cy, radius
            )}
            fill={li === gridLevels.length - 1 ? `${C.accentSoft}40` : 'none'}
            stroke={C.hairline}
            strokeWidth={li === gridLevels.length - 1 ? 1 : 0.75}
          />
        ))}

        {/* Axis lines — subtle hairlines */}
        {AXES.map((_, i) => {
          const end = getPoint(i, 10, cx, cy, radius);
          return (
            <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y}
              stroke={C.hairline} strokeWidth={0.75} />
          );
        })}

        {/* Expected profile polygon — caramel fill with soft alpha */}
        {expectedScores && (
          <path
            d={buildPolygon(expectedScores, cx, cy, radius)}
            fill={`${C.accent}28`}
            stroke={C.accent}
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
        )}

        {/* Tasting overlay polygon — amber dashed, soft fill */}
        {tastingScores && (
          <path
            d={buildPolygon(tastingScores, cx, cy, radius)}
            fill={`${C.amber}20`}
            stroke={C.amber}
            strokeWidth={1.75}
            strokeDasharray="5 3"
            strokeLinejoin="round"
          />
        )}

        {/* Data points for expected — crisp caramel dots */}
        {expectedScores && AXES.map((axis, i) => {
          const p = getPoint(i, expectedScores[axis.key] || 0, cx, cy, radius);
          return (
            <circle key={i} cx={p.x} cy={p.y} r={3.5}
              fill={C.cream} stroke={C.accent} strokeWidth={1.5} />
          );
        })}

        {/* Data points for tasting — amber ring dots */}
        {tastingScores && AXES.map((axis, i) => {
          const p = getPoint(i, tastingScores[axis.key] || 0, cx, cy, radius);
          return (
            <circle key={`t${i}`} cx={p.x} cy={p.y} r={3.5}
              fill={C.cream} stroke={C.amber} strokeWidth={1.5} />
          );
        })}

        {/* Labels — caption scale, Nunito, muted */}
        {AXES.map((axis, i) => {
          const lp = getPoint(i, 10, cx, cy, labelRadius);
          return (
            <text key={i} x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="central"
              fill={C.textMuted}
              fontSize={type.caption.fontSize}
              fontFamily={fonts.body}
              fontWeight={type.caption.fontWeight}
              letterSpacing="0.03em">
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      {tastingScores && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 20, marginTop: 10,
          fontFamily: fonts.body,
          fontSize: type.caption.fontSize,
          fontWeight: type.caption.fontWeight,
          color: C.textMuted,
          letterSpacing: '0.02em',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C.cream,
              border: `1.5px solid ${C.accent}`,
              display: 'inline-block', flexShrink: 0,
            }} />
            Expected
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C.cream,
              border: `1.5px solid ${C.amber}`,
              display: 'inline-block', flexShrink: 0,
            }} />
            Your Experience
          </span>
        </div>
      )}
    </div>
  );
};

// Spider/radar chart — 6-axis flavor profile with optional tasting overlay
import { C, fonts } from '../styles/theme';

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
        {/* Grid hexagons */}
        {gridLevels.map((level, li) => (
          <path
            key={li}
            d={buildPolygon(
              Object.fromEntries(AXES.map(a => [a.key, level * 10])),
              cx, cy, radius
            )}
            fill="none"
            stroke={C.borderLight}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const end = getPoint(i, 10, cx, cy, radius);
          return (
            <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y}
              stroke={C.borderLight} strokeWidth={0.5} />
          );
        })}

        {/* Expected profile polygon */}
        {expectedScores && (
          <path
            d={buildPolygon(expectedScores, cx, cy, radius)}
            fill={`${C.accent}30`}
            stroke={C.accent}
            strokeWidth={2}
          />
        )}

        {/* Tasting overlay polygon */}
        {tastingScores && (
          <path
            d={buildPolygon(tastingScores, cx, cy, radius)}
            fill={`${C.amber}25`}
            stroke={C.amber}
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        )}

        {/* Data points for expected */}
        {expectedScores && AXES.map((axis, i) => {
          const p = getPoint(i, expectedScores[axis.key] || 0, cx, cy, radius);
          return <circle key={i} cx={p.x} cy={p.y} r={3} fill={C.accent} />;
        })}

        {/* Data points for tasting */}
        {tastingScores && AXES.map((axis, i) => {
          const p = getPoint(i, tastingScores[axis.key] || 0, cx, cy, radius);
          return <circle key={`t${i}`} cx={p.x} cy={p.y} r={3} fill={C.amber} />;
        })}

        {/* Labels */}
        {AXES.map((axis, i) => {
          const lp = getPoint(i, 10, cx, cy, labelRadius);
          return (
            <text key={i} x={lp.x} y={lp.y}
              textAnchor="middle" dominantBaseline="central"
              fill={C.textMuted} fontSize={11} fontFamily={fonts.body}>
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      {tastingScores && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8,
          fontSize: 11, color: C.textMuted, fontFamily: fonts.body,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
            Expected
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.amber, display: 'inline-block' }} />
            Your Experience
          </span>
        </div>
      )}
    </div>
  );
};

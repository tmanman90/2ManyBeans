// Spider chart for the onboarding palate result (R11).
//
// FORK rather than extending src/components/SpiderChart.jsx because:
//   1. Different axis count (5 vs 6) — changes the angle math
//   2. Different value range (-1..+1 vs 0..10) — changes the normalize step
//   3. Different axis labels and semantics (sweetness/acidity/body/
//      clean_funky/fruit_nutty vs cupping-protocol fragrance/etc.)
//   4. SpiderChart is consumed from Tasting + other code paths, and a
//      backward-compat extension would touch math inside multiple callers.
//   5. The onboarding plan explicitly authorized a fork when extension
//      exceeds ~20 lines.
//
// Keep this file DUMB — just the polygon math for the R11 result view.
import { C, fonts } from '../../styles/theme';

const AXES = [
  { key: 'sweetness', label: 'Sweet' },
  { key: 'acidity', label: 'Bright' },
  { key: 'body', label: 'Body' },
  { key: 'clean_funky', label: 'Clean' },
  { key: 'fruit_nutty', label: 'Cocoa' },
];

const RANGE = [-1, 1];
const SPAN = RANGE[1] - RANGE[0];

function normalize(value) {
  const v = typeof value === 'number' ? value : 0;
  return Math.max(0, Math.min(1, (v - RANGE[0]) / SPAN));
}

function getPoint(axisIndex, value, cx, cy, radius) {
  const step = 360 / AXES.length;
  const angle = (axisIndex * step - 90) * (Math.PI / 180);
  const r = radius * normalize(value);
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function buildPolygon(chart, cx, cy, radius) {
  return AXES
    .map((axis, i) => getPoint(i, chart[axis.key], cx, cy, radius))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ') + ' Z';
}

function buildGridPolygon(level, cx, cy, radius) {
  return AXES
    .map((_, i) => {
      const step = 360 / AXES.length;
      const angle = (i * step - 90) * (Math.PI / 180);
      const r = radius * level;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    })
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ') + ' Z';
}

export function OnboardingPalateChart({ chart, size = 260 }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.34;
  const labelRadius = size * 0.46;
  const safeChart = chart && typeof chart === 'object' ? chart : {};
  const gridLevels = [0.33, 0.66, 1.0];

  return (
    <div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
      >
        {/* Grid pentagons */}
        {gridLevels.map((level, li) => (
          <path
            key={li}
            d={buildGridPolygon(level, cx, cy, radius)}
            fill="none"
            stroke={C.borderLight}
            strokeWidth={1}
          />
        ))}

        {/* Axis spokes */}
        {AXES.map((_, i) => {
          const end = getPoint(i, RANGE[1], cx, cy, radius);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke={C.borderLight}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Mid-line (0 — neutral palate axis reference) */}
        <path
          d={buildGridPolygon(0.5, cx, cy, radius)}
          fill="none"
          stroke={C.borderLight}
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Data polygon */}
        <path
          d={buildPolygon(safeChart, cx, cy, radius)}
          fill={`${C.accent}30`}
          stroke={C.accent}
          strokeWidth={2}
        />

        {/* Data points */}
        {AXES.map((axis, i) => {
          const p = getPoint(i, safeChart[axis.key], cx, cy, radius);
          return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={C.accent} />;
        })}

        {/* Axis labels */}
        {AXES.map((axis, i) => {
          const step = 360 / AXES.length;
          const angle = (i * step - 90) * (Math.PI / 180);
          const lp = {
            x: cx + labelRadius * Math.cos(angle),
            y: cy + labelRadius * Math.sin(angle),
          };
          return (
            <text
              key={i}
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={C.textMuted}
              fontSize={11}
              fontFamily={fonts.body}
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default OnboardingPalateChart;

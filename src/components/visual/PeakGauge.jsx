// PeakGauge — bespoke freshness dial. A thin ring fills to the bean's life%
// in its status color, with the day-count set in editorial serif at center.
// The arc draws in on mount (SwiftUI-style). transform/opacity only.
import { m } from '../../lib/motion';
import { C, fonts, type } from '../../styles/theme';

export function PeakGauge({ pct = 0, color = C.accent, days, unit = 'DAYS', size = 76, stroke = 5, delay = 0.15 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(1, Math.max(0, pct));
  const center = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={center} cy={center} r={r} stroke={C.hairline} strokeWidth={stroke} fill="none" />
        <m.circle
          cx={center} cy={center} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - fill) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: fonts.heading, fontSize: Math.round(size * 0.30), fontWeight: 600,
          color: C.text, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
        }}>{days != null ? days : '--'}</span>
        <span style={{ ...type.caption, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', color: C.textLight, marginTop: 2 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// Small shared pieces of the scale brew screens (mockups in
// docs/plans/mockups/acaia-scale/): header pill, ring, flow card, pour chips.

import { Check } from 'lucide-react';
import { C, fonts, radius, type as typeScale } from '../../styles/theme';
import { FLOW_BAND, flowLabel } from '../../lib/scale/scaleSession';

export const RING_SIZE = 268;
const RING_RADIUS = 124;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const formatGrams = (grams) => (Number.isFinite(grams) ? grams.toFixed(1) : '--');

const STATUS_COPY = {
  connecting: 'Connecting',
  silent: 'No weight',
  lost: 'Not connected',
};

export function ScaleStatusPill({ scale, onPress, disabled }) {
  const connected = scale.status === 'connected';
  const label = connected || scale.status === 'connecting' || scale.status === 'silent'
    ? scale.device?.model || 'Scale'
    : 'Scale';
  const dot = connected ? C.green : scale.status === 'connecting' ? C.accentLight : scale.status === 'idle' || scale.status === 'scanning' ? C.textLight : C.amber;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={connected ? `${label} connected` : 'Connect a scale'}
      style={{
        minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px 6px 10px',
        borderRadius: radius.pill, background: C.card, border: `1px solid ${C.hairline}`, color: C.text,
        fontFamily: fonts.body, fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: dot, boxShadow: connected ? `0 0 0 3px ${C.greenBg}` : 'none' }} />
      {label}
      {connected && Number.isFinite(scale.battery) && (
        <span style={{ color: C.textMuted, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{scale.battery}%</span>
      )}
      {!connected && STATUS_COPY[scale.status] && scale.device && (
        <span style={{ color: C.textMuted, fontWeight: 600 }}>{STATUS_COPY[scale.status]}</span>
      )}
    </button>
  );
}

// The ring: a hairline track, a soft halo, and an arc filled to `progress`.
export function ScaleRing({ progress = 0, color = C.accent, dashed = false, children }) {
  const center = RING_SIZE / 2;
  return (
    <div style={{ position: 'relative', width: 'min(268px, calc(100vw - 48px), 32vh)', aspectRatio: '1 / 1', flexShrink: 0 }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
        {dashed ? (
          <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={C.accentLight} strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
        ) : (
          <>
            <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={C.hairline} strokeWidth={2} />
            <circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={C.accentSoft} strokeWidth={12} opacity={0.45} />
            <circle
              cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))}
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }}
            />
          </>
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
}

export function RingLabel({ children, color = C.accent }) {
  return <div style={{ ...typeScale.label, color, letterSpacing: '0.10em' }}>{children}</div>;
}

export function BigGrams({ grams }) {
  return (
    <div style={{ fontFamily: fonts.heading, fontWeight: 600, fontSize: 'clamp(52px, 17vw, 72px)', letterSpacing: '-0.035em', lineHeight: 1, marginTop: 4, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
      {formatGrams(grams)}<small style={{ fontSize: '0.39em', letterSpacing: '-0.01em', marginLeft: 3, color: C.textMuted }}>g</small>
    </div>
  );
}

export function RingSub({ children }) {
  return <div style={{ fontSize: 14, color: C.textMuted, fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums', maxWidth: 200 }}>{children}</div>;
}

// Flow on Acaia's own 2.5 to 6.5 g/s pour-over band, smoothed over 1.5 s.
export function FlowCard({ gps }) {
  const max = 9;
  const at = (value) => `${(Math.min(max, Math.max(0, value)) / max) * 100}%`;
  const label = flowLabel(gps);
  return (
    <div style={{ width: '100%', boxSizing: 'border-box', background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 18, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 72 }}>
        <div style={{ ...typeScale.caption, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textLight }}>Flow</div>
        <div style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', color: C.text }}>
          {gps.toFixed(1)}<small style={{ fontFamily: fonts.body, fontSize: 12, color: C.textMuted, fontWeight: 700, marginLeft: 2 }}>g/s</small>
        </div>
      </div>
      <div style={{ flex: 1 }} aria-label={`Flow ${label}`}>
        <div style={{ ...typeScale.caption, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: label === 'Steady' ? C.green : C.textLight, textAlign: 'center', marginBottom: 6 }}>{label}</div>
        <div style={{ position: 'relative', height: 10, borderRadius: 5, background: C.cardMuted }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: at(FLOW_BAND.low), right: `calc(100% - ${at(FLOW_BAND.high)})`, background: C.greenBg }} />
          {[FLOW_BAND.low, FLOW_BAND.high].map((mark) => (
            <div key={mark} style={{ position: 'absolute', top: -4, bottom: -4, left: at(mark), width: 2, background: C.textLight, borderRadius: 1 }} />
          ))}
          <div style={{ position: 'absolute', top: '50%', left: at(gps), width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, background: C.green, border: `2px solid ${C.card}`, transition: 'left 0.2s ease' }} />
        </div>
        <div style={{ position: 'relative', height: 14, fontSize: 10, color: C.textLight, fontWeight: 700 }}>
          <span style={{ position: 'absolute', left: at(FLOW_BAND.low), transform: 'translateX(-50%)' }}>{FLOW_BAND.low}</span>
          <span style={{ position: 'absolute', left: at(FLOW_BAND.high), transform: 'translateX(-50%)' }}>{FLOW_BAND.high}</span>
        </div>
      </div>
    </div>
  );
}

// One chip per pour: done (sage, actual grams), current (caramel), upcoming.
export function PourChips({ targets, current, poured = {} }) {
  if (!targets.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      {targets.map((target) => {
        const isCurrent = target === current;
        const done = !isCurrent && Number.isFinite(poured[target.stepIndex]);
        return (
          <div key={target.stepIndex} style={{
            flex: 1, minWidth: 0, textAlign: 'center', padding: '8px 0 7px', borderRadius: 12,
            border: `1px solid ${isCurrent ? C.accentLight : done ? 'transparent' : C.hairline}`,
            background: isCurrent ? C.accentSoft : done ? C.greenBg : 'transparent',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: isCurrent ? C.accent : done ? C.green : C.textLight, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
              {done && <Check size={10} strokeWidth={3} />}{target.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: isCurrent ? C.accent : done ? C.green : C.textMuted }}>
              {Math.round(done ? poured[target.stepIndex] : target.targetG)} g
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ScaleHint() {
  return (
    <div style={{ display: 'flex', gap: 10, background: C.amberBg, borderRadius: 14, padding: '12px 14px', fontSize: 13.5, lineHeight: 1.45, color: C.accentDark, fontWeight: 600, textAlign: 'left' }}>
      <span aria-hidden="true" style={{ fontSize: 16 }}>&#9432;</span>
      <div>Not listed? Close the Acaia app first. A scale talks to one app at a time.</div>
    </div>
  );
}

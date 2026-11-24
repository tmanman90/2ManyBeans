// "Connect your scale" sheet (mockup 01). Scans inside the app; the chosen
// scale is remembered and reconnects when the timer opens next time.

import { C, fonts, radius, shadows } from '../../styles/theme';
import { ScaleHint } from './ScaleParts';

const signalLabel = (rssi) => (!Number.isFinite(rssi) ? 'Nearby' : rssi >= -70 ? 'Strong signal' : 'Weak signal');

function ScaleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="3" y="7" width="20" height="13" rx="3.5" fill="none" stroke={C.textMuted} strokeWidth="1.8" />
      <rect x="8" y="11" width="10" height="4" rx="1.2" fill={C.textMuted} />
    </svg>
  );
}

export function ScalePairSheet({ found, scanError, onChoose, onClose }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 4 }} role="dialog" aria-modal="true" aria-labelledby="scale-pair-title">
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(33,19,10,0.36)' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, background: C.card,
        borderRadius: '28px 28px 0 0', padding: '10px 22px calc(20px + env(safe-area-inset-bottom, 0px))',
        boxShadow: shadows.modal, fontFamily: fonts.body,
      }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: C.hairlineStrong, margin: '0 auto 16px' }} />
        <h2 id="scale-pair-title" style={{ fontFamily: fonts.heading, fontSize: 26, fontWeight: 600, letterSpacing: '-0.015em', color: C.text, margin: 0 }}>Connect your scale</h2>
        <p style={{ color: C.textMuted, fontSize: 15, lineHeight: 1.5, margin: '6px 0 0' }}>Weigh each pour live. Wake the scale by pressing its button.</p>
        {scanError ? (
          <div role="alert" style={{ margin: '20px 0 10px', padding: '12px 14px', borderRadius: 14, background: C.redBg, color: C.red, fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}>
            Bluetooth is off or not allowed. Turn it on, and allow 2manybeans under Settings, Privacy, Bluetooth.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.accent, margin: '20px 0 10px' }}>
            <span aria-hidden="true" className="scale-spinner" style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${C.accentSoft}`, borderTopColor: C.accent }} />
            Searching nearby
          </div>
        )}
        {found.map((device, index) => (
          <div key={device.deviceId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 16, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.bgDeep, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ScaleIcon /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Acaia {device.model}</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 1, fontWeight: 600 }}>{signalLabel(device.rssi)}</div>
            </div>
            <button
              type="button"
              onClick={() => onChoose(device)}
              style={{
                marginLeft: 'auto', minHeight: 44, padding: '8px 16px', borderRadius: radius.pill, border: 'none',
                background: index === 0 ? C.accent : C.accentSoft, color: index === 0 ? '#fff' : C.accent,
                fontFamily: fonts.body, fontWeight: 800, fontSize: 14, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Connect
            </button>
          </div>
        ))}
        <div style={{ marginTop: 4 }}><ScaleHint /></div>
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', minHeight: 44, marginTop: 10, border: 'none', background: 'transparent', color: C.textMuted, fontFamily: fonts.body, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          Brew without a scale
        </button>
      </div>
    </div>
  );
}

// AxisSlider — a custom-from-scratch Liquid Glass slider for the tasting wizard.
// NOT an <input type=range>: a pointer-driven track with a recessed well, an accent fill with
// specular sheen, a Liquid Glass thumb (tinted body + rim sheen + float shadow) that springs and
// swells on grab, haptic selection detents on every integer step, the live notch WORD shown large
// (predict-then-confirm), and a ghost "expected" marker where Ruphus predicts this bean should land.
// transform/opacity-only motion; reduced-motion snaps. Value is 0–10 (null = untouched).
import { useRef, useCallback } from 'react';
import { m } from '../../lib/motion';
import { haptic } from '../../lib/haptics';
import { notchLabel } from '../../lib/flavorWheel';
import { C, fonts, radius, motion as M } from '../../styles/theme';

export function AxisSlider({ axis, value, onChange, expected = null, reduce = false }) {
  const trackRef = useRef(null);
  const lastInt = useRef(value == null ? null : Math.round(value));
  const touched = value != null;
  const v = value == null ? 5 : value; // render mid when untouched, but styled as "ghost"
  const pct = (v / 10) * 100;
  const expPct = expected == null ? null : (Math.max(0, Math.min(10, expected)) / 10) * 100;
  const word = notchLabel(axis, v);

  const setFromClientX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const raw = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const next = Math.round(raw * 10);
    if (next !== lastInt.current) {
      lastInt.current = next;
      haptic.selection();
    }
    onChange(next);
  }, [onChange]);

  const onDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  }, [setFromClientX]);
  const onMove = useCallback((e) => {
    if (e.buttons === 0 && e.pressure === 0 && e.pointerType === 'mouse') return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) setFromClientX(e.clientX);
  }, [setFromClientX]);

  return (
    <div style={{ width: '100%', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
      {/* live notch word — the predict-then-confirm headline */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, minHeight: 40, marginBottom: 14 }}>
        <span
          key={word}
          className={reduce ? undefined : 'wiz-pop'}
          style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: touched ? C.text : C.textLight, opacity: touched ? 1 : 0.4, textTransform: 'capitalize' }}
        >
          {word}
        </span>
        <span style={{ fontFamily: fonts.body, fontWeight: 700, fontSize: 14, color: C.textLight, fontVariantNumeric: 'tabular-nums', opacity: touched ? 1 : 0.5 }}>
          {touched ? v : '–'}<span style={{ fontSize: 11 }}>/10</span>
        </span>
      </div>

      {/* track */}
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        role="slider"
        aria-label={axis.label}
        aria-valuemin={0} aria-valuemax={10} aria-valuenow={touched ? v : undefined}
        style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        {/* recessed well */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 12, borderRadius: radius.pill,
          background: C.bgDeep, border: `1px solid ${C.hairline}`,
          boxShadow: 'inset 0 1.5px 3px rgba(70,41,26,0.14), inset 0 -1px 0 rgba(255,255,255,0.5)',
        }} />

        {/* expected marker — a faint ◆ tick at Professor Ruphus's predicted spot. Deliberately
            SUBTLE (no repeated name label on every slider — the intro explains what ◆ means). */}
        {expPct != null && (
          <div aria-hidden style={{ position: 'absolute', left: `${expPct}%`, top: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', top: -14, fontSize: 8, lineHeight: 1, color: C.accentLight, opacity: 0.7 }}>◆</span>
            <span style={{ width: 1.5, height: 18, borderRadius: 2, background: C.accentLight, opacity: 0.5, boxShadow: `0 0 0 2px ${C.bg}` }} />
          </div>
        )}

        {/* accent fill — transform/scaleX only (never animate width); snaps to the finger */}
        <div style={{
          position: 'absolute', left: 0, width: '100%', height: 12, borderRadius: radius.pill,
          transformOrigin: 'left center', transform: `scaleX(${Math.max(0.0001, pct / 100)})`,
          background: touched ? `linear-gradient(180deg, ${C.accentLight}, ${C.accent})` : 'transparent',
          boxShadow: touched ? 'inset 0 1px 0 rgba(255,255,255,0.4)' : 'none',
        }} />

        {/* Liquid Glass thumb — positioned via static left (no left animation); only the grab
            SCALE animates (transform). framer `y` handles vertical centering so scale composes. */}
        <m.div
          whileTap={reduce ? {} : { scale: 1.14 }}
          transition={reduce ? { duration: 0 } : M.spring.snappy}
          style={{
            position: 'absolute', top: '50%', left: `${pct}%`, y: '-50%', width: 30, height: 30, marginLeft: -15,
            borderRadius: '50%',
            background: touched ? `radial-gradient(120% 120% at 30% 25%, ${C.accentLight}, ${C.accent} 70%)` : C.cream,
            border: `1px solid ${touched ? 'rgba(255,255,255,0.4)' : C.border}`,
            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.6), inset 0 -2px 5px rgba(40,20,8,0.26), 0 1px 2px rgba(70,41,26,0.2), 0 6px 16px rgba(120,70,34,0.34)',
            backdropFilter: 'saturate(160%)', WebkitBackdropFilter: 'saturate(160%)',
          }}
        >
          <span aria-hidden style={{ position: 'absolute', top: 2, left: 4, right: 8, height: '42%', borderRadius: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))', pointerEvents: 'none' }} />
        </m.div>
      </div>

      {/* endpoint labels — first + last notch words */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '0 2px' }}>
        <span style={{ fontFamily: fonts.body, fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'capitalize' }}>{axis.notches[0]}</span>
        <span style={{ fontFamily: fonts.body, fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'capitalize' }}>{axis.notches[axis.notches.length - 1]}</span>
      </div>
    </div>
  );
}

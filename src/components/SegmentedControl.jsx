// SegmentedControl — iOS 26 style. The selected segment is a Liquid Glass pill that
// SLIDES between options (framer-motion shared-element via layoutId), with a spring.
// Tinted-glass pill: specular top rim + soft float shadow. transform/opacity only;
// reduced-motion snaps instantly. Pass options as [[key,label], ...].
import { m } from '../lib/motion';
import { C, fonts, radius } from '../styles/theme';

export function SegmentedControl({ options, value, onChange, reduce, groupId = 'seg' }) {
  return (
    <div style={{
      display: 'inline-flex', position: 'relative', gap: 2,
      background: C.bgDeep, borderRadius: radius.pill, padding: 4,
      border: `1px solid ${C.hairline}`, boxShadow: 'inset 0 1px 2px rgba(70,41,26,0.08)',
    }}>
      {options.map(([k, label]) => {
        const active = value === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{
              position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '8px 18px', minHeight: 36, borderRadius: radius.pill,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active && (
              <m.span
                layoutId={`${groupId}-active`}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: radius.pill, zIndex: 0,
                  background: C.accent,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -2px 5px rgba(40,20,8,0.22), 0 1px 2px rgba(70,41,26,0.18), 0 4px 12px rgba(162,99,47,0.34)',
                }}
              >
                {/* specular top sheen — the "glass" tell */}
                <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', borderRadius: 'inherit', background: 'linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.02))', pointerEvents: 'none' }} />
              </m.span>
            )}
            <span style={{
              position: 'relative', zIndex: 1, display: 'block',
              fontFamily: fonts.body, fontWeight: 700, fontSize: 12.5, letterSpacing: '0.02em',
              color: active ? C.cream : C.textMuted,
              textShadow: active ? '0 1px 2px rgba(40,20,8,0.28)' : 'none',
              transition: 'color 0.18s ease',
            }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

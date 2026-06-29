// SlideSelect — a SINGLE-select chip group whose accent highlight SLIDES from the old choice to the
// new one (framer-motion shared-element via layoutId — the "magic move"). When you pick a different
// chip, exactly one <m.span layoutId> exists, so Motion FLIPs it across the wrap (even between rows)
// instead of cross-fading. Rules that keep it clean (per research): every chip is position:relative
// (offset parent for the inset highlight); the highlight's borderRadius/boxShadow are INLINE so
// Motion scale-corrects them (no corner warp as it resizes between differently-wide chips). Spring
// is the Build-UI "flew over" glide; haptic fires synchronously on tap; reduced-motion snaps.
// Multi-select must NOT use this (one highlight can't be in N places) — use per-chip fill instead.
import { m } from '../../lib/motion';
import { haptic } from '../../lib/haptics';
import { C, fonts, radius } from '../../styles/theme';

export function SlideSelect({ options, value, onChange, reduce = false, groupId = 'slide', allowDeselect = true }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <m.button
            key={opt}
            type="button"
            onClick={() => { haptic.selection(); onChange(active && allowDeselect ? '' : opt); }}
            whileTap={reduce ? {} : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.7 }}
            aria-pressed={active}
            style={{
              position: 'relative', border: `1px solid ${active ? 'transparent' : C.border}`,
              background: 'transparent', color: active ? C.cream : C.text,
              borderRadius: radius.pill, padding: '9px 15px', minHeight: 40,
              fontFamily: fonts.body, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active && (
              <m.span
                layoutId={`${groupId}-hl`}
                transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.55 }}
                style={{
                  position: 'absolute', inset: 0, zIndex: 0,
                  borderRadius: radius.pill, background: C.accent,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -2px 5px rgba(40,20,8,0.22), 0 2px 8px rgba(162,99,47,0.32)',
                }}
              >
                <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', borderRadius: 'inherit', background: 'linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.02))', pointerEvents: 'none' }} />
              </m.span>
            )}
            <span style={{ position: 'relative', zIndex: 1, textShadow: active ? '0 1px 2px rgba(40,20,8,0.28)' : 'none' }}>{opt}</span>
          </m.button>
        );
      })}
    </div>
  );
}

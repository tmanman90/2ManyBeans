// RuphusReaction — the mentor stage. Reuses the EXISTING nobg Ruphus poses (no new assets) and
// gives each wizard beat a character: a pose that swaps with a soft cross-dissolve + spring pop,
// an ambient breathing float (infinite loop — exempt from the micro-interaction duration rule),
// and a speech line. transform/opacity-only; reduced-motion stills the float and snaps the swap.
import { m, AnimatePresence } from 'framer-motion';
import { assetUrl } from '../../lib/assetUrl';
import { C, fonts, radius, shadows, motion as M } from '../../styles/theme';

// pose → existing nobg asset. Kept to the 5 confirmed-on-CDN poses.
export const POSE = {
  presenting: 'ruphus-presenting.png',
  magnifying: 'ruphus-magnifying-glass.png',
  cupping: 'ruphus-cupping.png',
  notes: 'ruphus-writing-notes.png',
  reading: 'ruphus-reading-book.png',
};
const src = (pose) => assetUrl(`/images/ruphus-animations/nobg/${POSE[pose] || POSE.presenting}`);

export function RuphusReaction({ pose = 'presenting', line, reduce = false, size = 96 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* pose */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        {/* soft caramel halo (static — no blur animation) */}
        <div aria-hidden style={{ position: 'absolute', inset: '12%', borderRadius: '50%', background: `radial-gradient(circle, ${C.accentSoft} 0%, rgba(244,229,209,0) 70%)` }} />
        <AnimatePresence mode="wait">
          <m.img
            key={pose}
            src={src(pose)}
            alt="Professor Ruphus"
            initial={reduce ? false : { opacity: 0, scale: 0.86 }}
            animate={reduce
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, y: [0, -5, 0] }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            transition={reduce ? { duration: 0 } : {
              opacity: { duration: M.dur.base, ease: M.ease.out },
              scale: M.spring.bouncy,
              y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 14px rgba(70,41,26,0.22))' }}
          />
        </AnimatePresence>
      </div>

      {/* speech */}
      {line != null && (
        <AnimatePresence mode="wait">
          <m.div
            key={String(line)}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 4 }}
            transition={reduce ? { duration: 0 } : { duration: M.dur.base, ease: M.ease.out }}
            style={{
              position: 'relative', flex: 1, background: C.cream, border: `1px solid ${C.hairline}`,
              borderRadius: radius.lg, padding: '12px 15px', boxShadow: shadows.e1,
            }}
          >
            {/* speech tail */}
            <span aria-hidden style={{ position: 'absolute', left: -6, top: 22, width: 12, height: 12, background: C.cream, borderLeft: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, transform: 'rotate(45deg)' }} />
            <p style={{ margin: 0, fontFamily: fonts.body, fontSize: 14.5, fontWeight: 600, lineHeight: 1.42, color: C.text }}>{line}</p>
          </m.div>
        </AnimatePresence>
      )}
    </div>
  );
}

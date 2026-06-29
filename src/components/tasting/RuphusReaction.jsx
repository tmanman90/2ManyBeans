// RuphusReaction — the mentor stage. Reuses the EXISTING nobg Ruphus poses (no new assets) and
// gives each wizard beat a character: a pose that swaps with a soft cross-dissolve + spring pop,
// an ambient breathing float (infinite loop — exempt from the micro-interaction duration rule),
// and a speech line. transform/opacity-only; reduced-motion stills the float and snaps the swap.
import { m, AnimatePresence } from 'framer-motion';
import { assetUrl } from '../../lib/assetUrl';
import { RuphusThinking } from './RuphusThinking';
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

export function RuphusReaction({ pose = 'presenting', line, loading = false, reduce = false, size = 96 }) {
  // Plain DOM, visible by DEFAULT — never gated on framer's animate (which does not run reliably
  // inside the WKWebView portal). The pose img re-keys on pose change so its CSS fade re-runs; an
  // ambient CSS float (.ruphus-float) gives the bob. The bubble re-keys per line with a CSS fade.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* pose */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <div aria-hidden style={{ position: 'absolute', inset: '12%', borderRadius: '50%', background: `radial-gradient(circle, ${C.accentSoft} 0%, rgba(244,229,209,0) 70%)` }} />
        <img
          key={pose}
          src={src(pose)}
          alt="Professor Ruphus"
          className={reduce ? 'wiz-pop' : 'wiz-pop ruphus-float'}
          style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 14px rgba(70,41,26,0.22))' }}
        />
      </div>

      {/* speech — while a reaction is loading, show the thinking loader IN PLACE of the text (not
          fake placeholder copy that later swaps); when it resolves the line cross-fades in. */}
      {(loading || line != null) && (
        <div
          key={loading ? 'thinking' : String(line)}
          className={reduce ? undefined : 'wiz-pop'}
          style={{
            position: 'relative', flex: 1, background: C.cream, border: `1px solid ${C.hairline}`,
            borderRadius: radius.lg, padding: '12px 15px', boxShadow: shadows.e1,
          }}
        >
          <span aria-hidden style={{ position: 'absolute', left: -6, top: 22, width: 12, height: 12, background: C.cream, borderLeft: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, transform: 'rotate(45deg)' }} />
          {loading
            ? <RuphusThinking reduce={reduce} />
            : <p style={{ margin: 0, fontFamily: fonts.body, fontSize: 14.5, fontWeight: 600, lineHeight: 1.42, color: C.text }}>{line}</p>}
        </div>
      )}
    </div>
  );
}

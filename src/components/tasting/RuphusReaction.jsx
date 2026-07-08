// RuphusReaction — the mentor stage. Reuses the EXISTING nobg Ruphus poses (no new assets) and
// gives each wizard beat a character: a pose that swaps with a soft cross-dissolve + spring pop,
// an ambient breathing float (infinite loop — exempt from the micro-interaction duration rule),
// and a speech line. transform/opacity-only; reduced-motion stills the float and snaps the swap.
import { useEffect, useState } from 'react';
import { assetUrl } from '../../lib/assetUrl';
import { RuphusThinking } from './RuphusThinking';
import { C, fonts, radius, shadows } from '../../styles/theme';

// pose → existing nobg asset. Kept to the 5 confirmed-on-CDN poses.
export const POSE = {
  presenting: 'ruphus-presenting.png',
  magnifying: 'ruphus-magnifying-glass.png',
  cupping: 'ruphus-cupping.png',
  notes: 'ruphus-writing-notes.png',
  reading: 'ruphus-reading-book.png',
};
const src = (pose) => assetUrl(`/images/ruphus-animations/nobg/${POSE[pose] || POSE.presenting}`);

export function RuphusReaction({ pose = 'presenting', line, reactionLine = null, loading = false, reduce = false, size = 96 }) {
  // Plain DOM, visible by DEFAULT — never gated on framer's animate (which does not run reliably
  // inside the WKWebView portal). The pose img re-keys on pose change so its CSS fade re-runs; an
  // ambient CSS float (.ruphus-float) gives the bob. The bubble re-keys per line with a CSS fade.
  const [coachHidden, setCoachHidden] = useState(false);
  const inThread = loading || reactionLine != null;

  useEffect(() => { setCoachHidden(false); }, [line, pose]);
  useEffect(() => {
    if (!reactionLine) return undefined;
    const id = setTimeout(() => setCoachHidden(true), reduce ? 0 : 220);
    return () => clearTimeout(id);
  }, [reactionLine, reduce]);

  const showCoach = line != null && (!reactionLine || !coachHidden);

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

      {/* speech thread — coach first, immediate loader below, then resolved reaction replaces it. */}
      {(showCoach || loading || reactionLine != null) && (
        <div
          data-ruphus-thread={inThread ? 'true' : 'false'}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {showCoach && (
            <SpeechBubble
              kind="coach"
              key={`coach-${String(line)}`}
              reduce={reduce}
              fading={!!reactionLine}
            >
              <p style={{ margin: 0, fontFamily: fonts.body, fontSize: 14.5, fontWeight: 600, lineHeight: 1.42, color: C.text }}>{line}</p>
            </SpeechBubble>
          )}
          {loading && (
            <SpeechBubble kind="loader" key="thinking" reduce={reduce} tail={!showCoach}>
              <RuphusThinking reduce={reduce} />
            </SpeechBubble>
          )}
          {!loading && reactionLine != null && (
            <SpeechBubble kind="reaction" key={`reaction-${String(reactionLine)}`} reduce={reduce} tail={!showCoach}>
              <p style={{ margin: 0, fontFamily: fonts.body, fontSize: 14.5, fontWeight: 700, lineHeight: 1.42, color: C.text }}>{reactionLine}</p>
            </SpeechBubble>
          )}
        </div>
      )}
    </div>
  );
}

function SpeechBubble({ children, kind, reduce, fading = false, tail = true }) {
  return (
    <div
      data-ruphus-bubble={kind}
      className={reduce ? (fading ? 'ruphus-coach-out' : undefined) : (fading ? 'ruphus-coach-out' : 'wiz-pop')}
      style={{
        position: 'relative', alignSelf: 'stretch', background: C.cream,
        border: `1px solid ${C.hairline}`, borderRadius: radius.lg,
        padding: kind === 'loader' ? '10px 11px' : '12px 15px',
        boxShadow: shadows.e1,
      }}
    >
      {tail && (
        <span aria-hidden style={{ position: 'absolute', left: -6, top: 18, width: 12, height: 12, background: C.cream, borderLeft: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, transform: 'rotate(45deg)' }} />
      )}
      {children}
    </div>
  );
}

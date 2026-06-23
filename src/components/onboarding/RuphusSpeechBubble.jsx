import { C, fonts, type, radius, shadows } from '../../styles/theme';

// Warm-mentor Ruphus bubble — extracted from ProfessorRuphusSlideUp L150-169
// so every onboarding screen gets the identical styling without forking.
// Avatar on the left, speech bubble on the right with the tail-corner at
// bottom-left (matching the source shape). Redesigned to a premium cream
// surface: hairline border, warm elevation, Nunito bodyL for readability.
// Script font (Caveat) is no longer used per design direction.
export function RuphusSpeechBubble({ children, avatarSize = 56, variant = 'default' }) {
  const isLarge = variant === 'large';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      width: '100%',
    }}>
      {/* Avatar with warm accent ring */}
      <img
        src="/images/professor-ruphus.webp"
        alt="Professor Ruphus"
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          flexShrink: 0,
          border: `2px solid ${C.accentLight}`,
          boxShadow: `0 0 0 3px ${C.accentSoft}`,
        }}
      />

      {/* Speech bubble — cream card with hairline + tail */}
      <div style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        background: C.cream,
        borderRadius: `${radius.md}px ${radius.md}px ${radius.md}px 4px`,
        padding: isLarge ? '12px 16px' : '10px 14px',
        fontFamily: type.bodyL.fontFamily,
        fontSize: isLarge ? type.bodyL.fontSize : 15,
        fontWeight: type.bodyL.fontWeight,
        lineHeight: type.bodyL.lineHeight,
        color: C.text,
        border: `1px solid ${C.hairline}`,
        boxShadow: shadows.e2,
      }}>
        {/* Tail triangle — bottom-left, matching bubble border colour */}
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: -7,
          width: 13,
          height: 13,
          background: C.cream,
          borderBottom: `1px solid ${C.hairline}`,
          borderLeft: `1px solid ${C.hairline}`,
          transform: 'rotate(45deg)',
          borderRadius: 2,
        }} />
        {children}
      </div>
    </div>
  );
}

export default RuphusSpeechBubble;

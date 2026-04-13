import { C, fonts } from '../../styles/theme';

// Warm-mentor Ruphus bubble — extracted from ProfessorRuphusSlideUp L150-169
// so every onboarding screen gets the identical styling without forking.
// Avatar on the left, speech bubble on the right with the tail-corner at
// bottom-left (14/14/14/4 border-radius matches the source).
export function RuphusSpeechBubble({ children, avatarSize = 56, variant = 'default' }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      width: '100%',
    }}>
      <img
        src="/images/professor-ruphus.webp"
        alt="Professor Ruphus"
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          flexShrink: 0,
          border: `2px solid ${C.borderLight}`,
        }}
      />
      <div style={{
        flex: 1,
        minWidth: 0,
        background: C.amberBg,
        borderRadius: '14px 14px 14px 4px',
        padding: '10px 14px',
        fontSize: variant === 'large' ? 17 : 15,
        color: C.text,
        fontFamily: fonts.title,
        border: '1px solid #E8D5A0',
        lineHeight: 1.4,
      }}>
        {children}
      </div>
    </div>
  );
}

export default RuphusSpeechBubble;

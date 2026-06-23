// LoadingScreen — app-level warm loading state shown while auth/data resolves.
import { C, fonts, radius, shadows, type as typeScale } from '../styles/theme';

export const LoadingScreen = ({ message } = {}) => (
  <div style={{
    fontFamily: fonts.body,
    background: C.bg,
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.textMuted,
    gap: 0,
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* Ambient warm background glow */}
    <div style={{
      position: 'absolute',
      top: '30%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 320, height: 320,
      borderRadius: '50%',
      background: `radial-gradient(ellipse at center, ${C.accentSoft} 0%, transparent 70%)`,
      opacity: 0.7,
      pointerEvents: 'none',
    }} />

    {/* Wordmark */}
    <div style={{
      fontFamily: fonts.title,
      fontSize: 34,
      color: C.accent,
      letterSpacing: 0.4,
      lineHeight: 1.1,
      marginBottom: 28,
      position: 'relative',
    }}>
      2manybeans
    </div>

    {/* Refined spinner — thin caramel ring */}
    <div style={{ position: 'relative', width: 44, height: 44, marginBottom: 20 }}>
      <svg
        width={44}
        height={44}
        viewBox="0 0 44 44"
        style={{ animation: 'lsSpinRing 1.1s linear infinite', willChange: 'transform' }}
      >
        {/* Track */}
        <circle
          cx={22} cy={22} r={18}
          fill="none"
          stroke={C.borderLight}
          strokeWidth={2.5}
        />
        {/* Arc */}
        <circle
          cx={22} cy={22} r={18}
          fill="none"
          stroke={C.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="113"
          strokeDashoffset="82"
          transform="rotate(-90 22 22)"
        />
      </svg>
    </div>

    {/* Message */}
    <div style={{
      ...typeScale.body,
      color: C.textMuted,
      textAlign: 'center',
      maxWidth: 220,
      lineHeight: 1.5,
    }}>
      {message || 'Loading your beans…'}
    </div>

    <style>{`
      @keyframes lsSpinRing {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

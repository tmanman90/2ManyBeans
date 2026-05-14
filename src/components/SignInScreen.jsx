import { useState } from 'react';
import { C, fonts, radius, shadows } from '../styles/theme';

const wordmark = '/images/wordmark@2x.png';

// ─────────────────────────────────────────────────────────────
// SignInScreen — V2 "Your beans were never meant for a spreadsheet"
//
// Design notes
// - Real wordmark (wordmark@2x.png) instead of the Caveat text fallback.
// - Bean-motif SVGs scattered on a warm parchment bg with a caramel
//   radial gradient from the top. All motifs are decorative; aria-hidden.
// - Apple button stays FIRST, BLACK, full-width, ≥48pt height, and the
//   title is exactly "Sign in with Apple" — App Store Guideline 4.8.
// - Footer reads Terms / Privacy Policy per Apple requirement for
//   sign-in screens.
// - Layout is safe-area aware on both ends (notch + home indicator).
// ─────────────────────────────────────────────────────────────

const buttonBase = {
  width: '100%',
  minHeight: 52,
  borderRadius: radius.md,
  fontSize: 16,
  fontFamily: fonts.body,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  border: 'none',
  WebkitTapHighlightColor: 'transparent',
};

// Decorative bean SVG — no deps, recoloured via fill.
function Bean({ size = 40, rotate = 0, opacity = 0.08, color = C.accent, style = {} }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size * 1.3}
      viewBox="0 0 40 52"
      style={{ transform: `rotate(${rotate}deg)`, opacity, ...style }}
    >
      <ellipse cx="20" cy="26" rx="17" ry="24" fill={color} />
      <path
        d="M20 4 Q 12 26 20 48"
        stroke={C.bg}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const SignInScreen = ({ onSignInWithGoogle, onSignInWithApple, onExploreDemo }) => {
  const [signingIn, setSigningIn] = useState(null);
  const [error, setError] = useState(null);

  const handleSignIn = async (provider) => {
    setSigningIn(provider);
    setError(null);
    try {
      if (provider === 'apple') await onSignInWithApple();
      else await onSignInWithGoogle();
    } catch (err) {
      console.error(`[SignIn] ${provider} error:`, err);
      setError(err.message || 'Sign-in failed. Please try again.');
      setSigningIn(null);
    }
  };

  return (
    <div
      style={{
        fontFamily: fonts.body,
        minHeight: '100dvh',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: `
          radial-gradient(120% 70% at 50% 0%, #F4E4CC 0%, ${C.bg} 55%),
          ${C.bg}
        `,
        display: 'flex',
        flexDirection: 'column',
        padding:
          'calc(env(safe-area-inset-top, 0px) + 24px) 24px ' +
          'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      {/* Decorative bean motifs — absolutely positioned, aria-hidden */}
      <Bean size={70} rotate={-25} opacity={0.07}
        style={{ position: 'absolute', top: 100, left: -20 }} />
      <Bean size={44} rotate={35} opacity={0.09}
        style={{ position: 'absolute', top: 180, right: 18 }} />
      <Bean size={32} rotate={-60} opacity={0.07}
        style={{ position: 'absolute', top: 300, left: 40 }} />
      <Bean size={58} rotate={15} opacity={0.08}
        style={{ position: 'absolute', bottom: 220, right: -14 }} />
      <Bean size={38} rotate={-10} opacity={0.07}
        style={{ position: 'absolute', bottom: 140, left: 30 }} />

      {/* Hero — wordmark + tagline, vertically centred */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <img
          src={wordmark}
          alt="2manybeans"
          style={{
            width: '68%',
            maxWidth: 280,
            height: 'auto',
            display: 'block',
            filter: 'drop-shadow(0 2px 0 rgba(91,61,46,0.08))',
          }}
        />
        <div
          style={{
            fontFamily: fonts.heading,
            fontStyle: 'italic',
            fontSize: 15,
            color: C.textMuted,
            marginTop: 18,
            letterSpacing: 0.2,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 280,
          }}
        >
          Your beans were never meant for a spreadsheet.
        </div>
      </div>

      {/* Auth block */}
      <div
        style={{
          width: '100%',
          maxWidth: 340,
          margin: '0 auto',
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Apple — first, black, required title, ≥48pt height */}
        <button
          type="button"
          onClick={() => handleSignIn('apple')}
          disabled={!!signingIn}
          style={{
            ...buttonBase,
            background: '#000',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            opacity: signingIn === 'google' ? 0.5 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 17 20" fill="#fff" aria-hidden="true">
            <path d="M12.152 0c.13 1.201-.359 2.403-1.088 3.264-.748.841-1.948 1.502-3.128 1.402-.15-1.161.4-2.383 1.088-3.144C9.772.681 11.072.06 12.152 0zM16.18 14.786c-.36.809-.53 1.17-1 1.891-.65.998-1.561 2.24-2.691 2.25-1.002.01-1.26-.649-2.621-.641-1.36.008-1.641.653-2.642.643-1.131-.01-2.001-1.121-2.651-2.119-1.82-2.793-2.011-6.071-.888-7.813.798-1.234 2.058-1.958 3.249-1.958 1.21 0 1.97.653 2.97.653.972 0 1.564-.654 2.962-.654 1.058 0 2.178.575 2.97 1.568-2.609 1.43-2.186 5.155.342 6.18z" />
          </svg>
          {signingIn === 'apple' ? 'Signing in…' : 'Sign in with Apple'}
        </button>

        {/* Google */}
        <button
          type="button"
          onClick={() => handleSignIn('google')}
          disabled={!!signingIn}
          style={{
            ...buttonBase,
            background: '#fff',
            color: '#1f1f1f',
            border: `1px solid ${C.border}`,
            boxShadow: shadows.card,
            opacity: signingIn === 'apple' ? 0.5 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {signingIn === 'google' ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {onExploreDemo && (
          <button
            type="button"
            onClick={onExploreDemo}
            disabled={!!signingIn}
            style={{
              ...buttonBase,
              background: 'transparent',
              color: C.textMuted,
              border: 'none',
              boxShadow: 'none',
              fontSize: 14,
              textDecoration: 'underline',
              opacity: signingIn ? 0.5 : 1,
            }}
          >
            Explore without an account
          </button>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 4,
              color: C.red,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: C.textLight,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          By signing in, you agree to our{' '}
          <a
            href="/terms.html"
            style={{ color: C.textLight, textDecoration: 'underline' }}
          >
            Terms
          </a>{' '}
          &{' '}
          <a
            href="/privacy-policy.html"
            style={{ color: C.textLight, textDecoration: 'underline' }}
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { C, fonts, radius, shadows } from '../styles/theme';

const buttonBase = {
  width: '100%',
  minHeight: 48,
  borderRadius: radius.md,
  fontSize: 17,
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

export const SignInScreen = ({ onSignInWithGoogle, onSignInWithApple }) => {
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
    <div style={{
      fontFamily: fonts.body,
      background: C.bg,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: `calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)`,
    }}>
      <div style={{ fontFamily: fonts.title, fontSize: 42, color: C.accent, marginBottom: 4 }}>
        2manybeans
      </div>
      <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 40, textAlign: 'center', lineHeight: 1.5 }}>
        Track your specialty coffee rotation,<br />tastings, and freshness
      </div>

      <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Apple button first (App Store requirement) */}
        <button
          onClick={() => handleSignIn('apple')}
          disabled={signingIn}
          style={{
            ...buttonBase,
            background: '#000',
            color: '#fff',
            opacity: signingIn === 'google' ? 0.5 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="white">
            <path d="M13.71 14.04c-.69 1.48-1.02 2.14-1.9 3.44-.84 1.24-2.02 2.78-3.49 2.8-1.3.02-1.64-.86-3.41-.85-1.77.01-2.14.87-3.44.85-1.47-.02-2.58-1.4-3.42-2.64C-3.49 14.56-4.13 9.73-2.13 7c1.02-1.39 2.53-2.21 4.15-2.21 1.55 0 2.52.87 3.8.87 1.24 0 2-.87 3.79-.87 1.44 0 2.78.78 3.8 2.13-3.34 1.83-2.8 6.6.3 7.12zM9.56 4.77c.66-.84 1.16-2.03.98-3.24-1.08.07-2.35.76-3.09 1.65-.67.8-1.22 2.01-1.01 3.18 1.18.04 2.41-.66 3.12-1.59z" />
          </svg>
          {signingIn === 'apple' ? 'Signing in...' : 'Sign in with Apple'}
        </button>

        {/* Google button */}
        <button
          onClick={() => handleSignIn('google')}
          disabled={signingIn}
          style={{
            ...buttonBase,
            background: '#fff',
            color: C.text,
            border: `1px solid ${C.border}`,
            boxShadow: shadows.card,
            opacity: signingIn === 'apple' ? 0.5 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {signingIn === 'google' ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: C.red, fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: C.textLight, textAlign: 'center' }}>
        By signing in, you agree to our Terms & Privacy Policy
      </div>
    </div>
  );
};

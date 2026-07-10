import React from 'react';
import { auth } from '../../firebase';
import { clearState } from './onboardingState';
import { logOnboardingEvent } from '../../lib/onboardingAnalytics';
import { C, fonts } from '../../styles/theme';
import { assetUrl } from '../../lib/assetUrl';

// Class-based error boundary — React 19 still requires a class for
// componentDidCatch / getDerivedStateFromError. Wraps the entire onboarding
// flow so a single screen crash can't white-screen the app.
export class OnboardingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Wipe the local state so the user gets a clean restart — a corrupt
    // answers blob is the most likely cause of a render crash here.
    try { clearState(auth.currentUser?.uid); } catch { /* ignore */ }
    try {
      logOnboardingEvent('onboarding_resume_failed', {
        reason: 'render_crash',
        error: String(error?.message || error || '').slice(0, 200),
      });
    } catch { /* ignore */ }
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        fontFamily: fonts.body,
        textAlign: 'center',
      }}>
        {/* Poster image only — an error boundary must not depend on video
            playback, so we never mount the <video> element here. */}
        <img
          src={assetUrl('/images/ruphus-animations/ruphus-empty-cup-poster.jpg')}
          alt=""
          style={{ height: 200, objectFit: 'contain', marginBottom: 20 }}
        />
        <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, marginBottom: 12 }}>
          Something spilled.
        </div>
        <div style={{ fontSize: 15, color: C.textMuted, marginBottom: 28, maxWidth: 320 }}>
          Professor Ruphus needs a quick reset. Your progress will start fresh.
        </div>
        <button
          onClick={this.handleReload}
          style={{
            minHeight: 44,
            padding: '12px 28px',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: fonts.body,
            background: C.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

export default OnboardingErrorBoundary;

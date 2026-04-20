// AI Data Consent — Apple Guideline 5.1.2(i) compliance
// Full-screen modal requiring explicit consent before AI features process user data.
import { useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { C, fonts } from '../styles/theme';
import { haptic } from '../lib/haptics';

const providers = [
  { name: 'Google Gemini', desc: 'reads your bean bag photos' },
  { name: 'Anthropic Claude', desc: 'powers tasting coaching and chat' },
  { name: 'OpenAI GPT', desc: 'generates brew recipes and stories' },
];

export const AiDataConsentModal = ({ updateProfile }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleConsent = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    haptic.medium();
    try {
      await updateProfile({
        aiDataConsent: true,
        aiConsentDate: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Consent] Failed to save:', err);
      const msg = err?.code === 'permission-denied'
        ? "We couldn't save your choice (permission denied). Please try again in a moment or reach out to support."
        : err?.message || 'Something went wrong. Please try again.';
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: C.bg,
      zIndex: 900,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      <div style={{
        maxWidth: 380,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* Title */}
        <h1 style={{
          fontFamily: fonts.heading,
          fontSize: 24,
          fontWeight: 600,
          color: C.text,
          textAlign: 'center',
          margin: 0,
        }}>
          How your data powers 2manybeans
        </h1>

        {/* Explanation */}
        <p style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: C.textMuted,
          textAlign: 'center',
          lineHeight: 1.55,
          margin: 0,
        }}>
          When you use AI features (bean scanning, tasting coach, chat,
          brew recipes), your data is processed by these services:
        </p>

        {/* Provider list */}
        <div style={{
          width: '100%',
          background: C.cream,
          borderRadius: 12,
          padding: '4px 0',
        }}>
          {providers.map((p, i) => (
            <div key={p.name}>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                padding: '12px 16px',
                gap: 8,
              }}>
                <span style={{
                  fontFamily: fonts.body,
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.text,
                  flexShrink: 0,
                }}>
                  {p.name}
                </span>
                <span style={{
                  fontFamily: fonts.body,
                  fontSize: 14,
                  color: C.textMuted,
                }}>
                  {p.desc}
                </span>
              </div>
              {i < providers.length - 1 && (
                <div style={{ borderBottom: `0.5px solid ${C.borderLight}`, marginLeft: 16 }} />
              )}
            </div>
          ))}
        </div>

        {/* Security note */}
        <p style={{
          fontFamily: fonts.body,
          fontSize: 13,
          color: C.textMuted,
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}>
          Your data is sent through our secure servers, never shared
          directly. We don't use your data to train AI models.
        </p>

        {/* Privacy policy link */}
        <a
          href="https://2manybeans.vercel.app/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            color: C.accent,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Read our Privacy Policy
        </a>

        {/* CTA */}
        <button
          onClick={handleConsent}
          disabled={saving}
          style={{
            width: '100%',
            padding: '16px 24px',
            borderRadius: 14,
            border: 'none',
            background: C.accent,
            fontFamily: fonts.body,
            fontSize: 17,
            fontWeight: 700,
            color: '#fff',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'opacity 0.15s',
            WebkitTapHighlightColor: 'transparent',
            minHeight: 54,
          }}
        >
          {saving ? 'Saving...' : 'I Understand and Agree'}
        </button>

        {error && (
          <p style={{
            fontFamily: fonts.body,
            fontSize: 13,
            color: '#b33a3a',
            textAlign: 'center',
            lineHeight: 1.45,
            margin: 0,
          }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

// AI Data Consent — Apple Guideline 5.1.2(i) compliance
// Full-screen modal requiring explicit consent before AI features process user data.
import { useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { C, fonts, shadows, radius, glass, type as typeScale } from '../styles/theme';
import { m, spring, fadeUp, listContainer, listItem } from '../lib/motion';
import { haptic } from '../lib/haptics';

const providers = [
  {
    name: 'Google Gemini',
    desc: 'reads your bean bag photos',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="#E8F0FE" />
        <path d="M10 5.5C10 5.5 7.5 8 7.5 10C7.5 11.38 8.62 12.5 10 12.5C11.38 12.5 12.5 11.38 12.5 10C12.5 8 10 5.5 10 5.5Z" fill="#4285F4" />
        <path d="M10 14.5V12.5" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Anthropic Claude',
    desc: 'powers tasting coaching and chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="#F3E9DC" />
        <path d="M7 13L10 7l3 6" stroke="#A86A38" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.2 11h3.6" stroke="#A86A38" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'OpenAI GPT',
    desc: 'generates brew recipes and stories',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="#E6F7EF" />
        <path d="M10 6a4 4 0 100 8 4 4 0 000-8zm0 1.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" fill="#5C8A66" />
      </svg>
    ),
  },
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
    <div style={styles.root}>
      <m.div
        style={styles.inner}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
      >
        {/* Icon lockup */}
        <m.div style={styles.iconWrap} {...fadeUp}>
          <div style={styles.icon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 4C14 4 8 10 8 15a6 6 0 0012 0C20 10 14 4 14 4z" fill={C.accent} opacity="0.9" />
              <path d="M14 20v-6" stroke="#FFF" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="14" cy="22" r="1" fill="#FFF" />
            </svg>
          </div>
        </m.div>

        {/* Eyebrow */}
        <m.div style={styles.eyebrow} {...fadeUp} transition={{ delay: 0.04 }}>
          Data & Privacy
        </m.div>

        {/* Title */}
        <m.h1
          style={styles.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.soft, delay: 0.06 }}
        >
          How your data powers 2manybeans
        </m.h1>

        {/* Explanation */}
        <m.p
          style={styles.explanation}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.1 }}
        >
          When you use AI features (bean scanning, tasting coach, chat,
          brew recipes), your data is processed by these services:
        </m.p>

        {/* Provider list */}
        <m.div
          style={styles.providerList}
          variants={listContainer}
          initial="initial"
          animate="animate"
        >
          {providers.map((p, i) => (
            <m.div key={p.name} style={styles.providerRow} variants={listItem}>
              <div style={styles.providerIcon}>{p.icon}</div>
              <div style={styles.providerText}>
                <span style={styles.providerName}>{p.name}</span>
                <span style={styles.providerDesc}>{p.desc}</span>
              </div>
              {i < providers.length - 1 && (
                <div style={styles.providerDivider} />
              )}
            </m.div>
          ))}
        </m.div>

        {/* Security note */}
        <m.p
          style={styles.securityNote}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.22 }}
        >
          Your data is sent through our secure servers, never shared
          directly. We don't use your data to train AI models.
        </m.p>

        {/* Privacy policy link */}
        <m.a
          href="https://2manybeans.vercel.app/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.privacyLink}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.26 }}
        >
          Read our Privacy Policy
        </m.a>

        {/* CTA */}
        <m.button
          onClick={handleConsent}
          disabled={saving}
          style={{
            ...styles.cta,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'default' : 'pointer',
          }}
          whileTap={saving ? {} : { scale: 0.97 }}
          transition={spring.snappy}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {saving ? 'Saving...' : 'I Understand and Agree'}
        </m.button>

        {error && (
          <m.p style={styles.errorText} {...fadeUp}>
            {error}
          </m.p>
        )}
      </m.div>
    </div>
  );
};

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    background: C.bg,
    zIndex: 900,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
  },
  inner: {
    maxWidth: 380,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },

  // Icon
  iconWrap: {
    marginBottom: 4,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    background: C.accentSoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.e2,
  },

  eyebrow: {
    ...typeScale.label,
    color: C.accent,
    marginTop: -8,
  },

  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    color: C.text,
    textAlign: 'center',
    margin: 0,
  },

  explanation: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 1.55,
    margin: 0,
  },

  // Provider list card
  providerList: {
    width: '100%',
    background: C.card,
    borderRadius: radius.lg,
    border: `1px solid ${C.borderLight}`,
    boxShadow: shadows.e1,
    overflow: 'hidden',
    padding: 0,
  },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '13px 16px',
    gap: 12,
    position: 'relative',
  },
  providerIcon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    flex: 1,
    minWidth: 0,
  },
  providerName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: 600,
    color: C.text,
    lineHeight: 1.3,
  },
  providerDesc: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: C.textMuted,
    lineHeight: 1.3,
  },
  providerDivider: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 0,
    height: '0.5px',
    background: C.borderLight,
  },

  securityNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: C.textLight,
    textAlign: 'center',
    lineHeight: 1.5,
    margin: 0,
  },

  privacyLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: C.accent,
    textDecoration: 'none',
    fontWeight: 600,
    borderBottom: `1px solid ${C.accentLight}`,
    marginTop: -8,
  },

  cta: {
    width: '100%',
    padding: '16px 24px',
    borderRadius: radius.md,
    border: 'none',
    background: C.accent,
    backgroundImage: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`,
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: 700,
    color: '#fff',
    transition: 'opacity 0.15s',
    WebkitTapHighlightColor: 'transparent',
    minHeight: 54,
    boxShadow: `${shadows.button}, 0 4px 14px rgba(168,106,56,0.28)`,
    letterSpacing: '-0.01em',
    marginTop: 4,
  },

  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: C.red,
    textAlign: 'center',
    lineHeight: 1.45,
    margin: 0,
    background: C.redBg,
    padding: '10px 14px',
    borderRadius: radius.sm,
    width: '100%',
    border: `1px solid rgba(182,92,69,0.15)`,
  },
};

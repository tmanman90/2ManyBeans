import { useState } from 'react';
import { Bell, Check, Sparkles } from 'lucide-react';
import { C, fonts, radius } from '../../../styles/theme';
import { OnboardingScreenShell } from './OnboardingScreenShell';
import { useOnboarding } from '../OnboardingContext';

// R12 — free trial timeline. Shows a 3-beat explanation of what the
// user gets over the next few days. Also captures marketing consent
// with a persistable timestamp + version, so we stay CAN-SPAM / GDPR
// compliant on the email list mirror.

const TIMELINE_STEPS = [
  {
    icon: Check,
    title: 'Today',
    body: 'Full access to everything. Scan, taste, brew — see if we click.',
  },
  {
    icon: Sparkles,
    title: 'In 3 days',
    body: "I'll check in and show you what we've tracked together.",
  },
  {
    icon: Bell,
    title: 'Day 7',
    body: "Trial ends. Cancel anytime before then and you won't be charged.",
  },
];

const MARKETING_CONSENT_VERSION = 'onboarding-v1-2026-04-12';

export default function R12TrialTimeline() {
  const { dispatch, answers } = useOnboarding();
  const [consent, setConsent] = useState(!!answers?.marketingConsent);

  const handleContinue = () => {
    dispatch({
      type: 'ADVANCE',
      next: 'r13',
      answersPatch: {
        marketingConsent: consent,
        // Client-side timestamp here; the SERVER timestamp goes onto
        // the same doc in the final completeOnboarding write. Two fields
        // serve two different auditors — analytics vs. legal.
        marketingConsentDate: consent ? new Date().toISOString() : null,
        marketingConsentVersion: consent ? MARKETING_CONSENT_VERSION : null,
      },
    });
  };

  return (
    <OnboardingScreenShell
      title="Your free trial, briefly."
      ruphusLine="Here's what the next few days look like. No surprises."
      primaryCta={{
        label: 'Continue',
        onClick: handleContinue,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          marginTop: 8,
          marginBottom: 16,
        }}
      >
        {TIMELINE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === TIMELINE_STEPS.length - 1;
          return (
            <div key={step.title} style={{ display: 'flex', gap: 14 }}>
              {/* Icon + connecting line */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                width: 40,
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: C.amberBg,
                  border: `1.5px solid #E8D5A0`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.accent,
                }}>
                  <Icon size={20} strokeWidth={2} />
                </div>
                {!isLast && (
                  <div style={{
                    width: 2,
                    flex: 1,
                    minHeight: 32,
                    background: C.borderLight,
                    marginTop: 4,
                    marginBottom: 4,
                  }} />
                )}
              </div>

              <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: 18,
                  color: C.text,
                  marginBottom: 4,
                }}>
                  {step.title}
                </div>
                <div style={{
                  fontSize: 14,
                  color: C.textMuted,
                  lineHeight: 1.45,
                }}>
                  {step.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Marketing consent — optional, 44pt tap target, privacy link */}
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          minHeight: 44,
          padding: '10px 12px',
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: radius.md,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          marginTop: 4,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{
            marginTop: 3,
            width: 20,
            height: 20,
            accentColor: C.accent,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14,
            color: C.text,
            fontFamily: fonts.body,
            lineHeight: 1.4,
            fontWeight: 600,
          }}>
            Send me brewing tips by email
          </div>
          <div style={{
            fontSize: 12,
            color: C.textMuted,
            fontFamily: fonts.body,
            lineHeight: 1.4,
            marginTop: 2,
          }}>
            Occasional emails about new features and coffee tips. Unsubscribe
            anytime. See our{' '}
            <a
              href="https://2manybeans.vercel.app/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.accent, textDecoration: 'underline' }}
              onClick={(e) => e.stopPropagation()}
            >
              Privacy Policy
            </a>
            .
          </div>
        </div>
      </label>
    </OnboardingScreenShell>
  );
}

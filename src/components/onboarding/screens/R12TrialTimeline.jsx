import { useState } from 'react';
import { C, fonts } from '../../../styles/theme';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';

const TIMELINE_STEPS = [
  { dot: '✓', title: 'Today', body: 'Full access. Scan, taste, brew — see if we click.' },
  { dot: '★', title: 'In 3 days', body: "I'll check in and show you what we've tracked together." },
  { dot: '!', title: 'Day 7', body: "Trial ends. Cancel anytime before then and you won't be charged." },
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
        marketingConsentDate: consent ? new Date().toISOString() : null,
        marketingConsentVersion: consent ? MARKETING_CONSENT_VERSION : null,
      },
    });
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100dvh',
      maxHeight: '100dvh',
      background: onboardingBg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <OnboardingTopBar step="R12 · YOUR TRIAL" overlay />

      <MascotStage src="/images/ruphus-animations/ruphus-thumbs-up.mp4" height={220} />

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
      }}>
        <NoteBubble>
          Here's what the next few days look like. No surprises.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 23, lineHeight: 1.2,
          color: C.text,
          marginTop: 2,
        }}>
          Your free trial, briefly.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
          {TIMELINE_STEPS.map((s, i) => {
            const last = i === TIMELINE_STEPS.length - 1;
            return (
              <div key={s.title} style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  flexShrink: 0, width: 36,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: C.amberBg,
                    border: '1.5px solid #E8D5A0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.accent, fontSize: 15, fontWeight: 800,
                    fontFamily: fonts.body,
                  }}>
                    {s.dot}
                  </div>
                  {!last && (
                    <div style={{
                      width: 2, flex: 1, minHeight: 22,
                      background: C.borderLight,
                      marginTop: 3, marginBottom: 3,
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                  <div style={{
                    fontFamily: fonts.heading, fontSize: 16, color: C.text,
                    marginBottom: 2,
                  }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
                    {s.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 12px',
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 12,
          cursor: 'pointer',
          marginTop: 6,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, accentColor: C.accent }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 700, lineHeight: 1.3 }}>
              Send me brewing tips by email
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.3, marginTop: 2 }}>
              Occasional emails. Unsubscribe anytime.
            </div>
          </div>
        </label>
      </div>

      <OnboardingCtaBar
        label="Continue"
        onClick={handleContinue}
      />
    </div>
  );
}

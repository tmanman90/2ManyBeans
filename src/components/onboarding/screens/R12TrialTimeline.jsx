import { useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, listContainer, listItem, spring } from '../../../lib/motion';
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

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{
          flex: 1,
          padding: '4px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <m.div variants={listItem}>
          <NoteBubble>
            Here's what the next few days look like. No surprises.
          </NoteBubble>
        </m.div>

        <m.div variants={listItem} style={{
          ...t.h1,
          color: C.text,
          marginTop: 2,
        }}>
          Your free trial, briefly.
        </m.div>

        {/* Vertical stepper */}
        <m.div variants={listItem} style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
          {TIMELINE_STEPS.map((s, i) => {
            const last = i === TIMELINE_STEPS.length - 1;
            return (
              <div key={s.title} style={{ display: 'flex', gap: 14 }}>
                {/* Stepper spine */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                  width: 32,
                }}>
                  {/* Accent dot */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: C.accentSoft,
                    border: `2px solid ${C.accent}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.accent,
                    fontSize: 13,
                    fontWeight: 800,
                    fontFamily: fonts.body,
                    boxShadow: shadows.e1,
                    flexShrink: 0,
                  }}>
                    {s.dot}
                  </div>
                  {/* Connector line */}
                  {!last && (
                    <div style={{
                      width: 2,
                      flex: 1,
                      minHeight: 20,
                      background: `linear-gradient(to bottom, ${C.accent}66, ${C.borderLight})`,
                      marginTop: 3,
                      marginBottom: 3,
                      borderRadius: 1,
                    }} />
                  )}
                </div>

                {/* Step content */}
                <div style={{ flex: 1, paddingBottom: last ? 0 : 16, paddingTop: 4 }}>
                  <div style={{
                    ...t.h3,
                    color: C.text,
                    marginBottom: 2,
                  }}>
                    {s.title}
                  </div>
                  <div style={{
                    ...t.body,
                    color: C.textMuted,
                  }}>
                    {s.body}
                  </div>
                </div>
              </div>
            );
          })}
        </m.div>

        {/* Email consent toggle */}
        <m.div variants={listItem}>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            background: C.cream,
            border: `1.5px solid ${consent ? C.accent : C.border}`,
            borderRadius: radius.md,
            cursor: 'pointer',
            marginTop: 4,
            boxShadow: consent ? shadows.e1 : shadows.e0,
            transition: 'border-color 0.16s ease, box-shadow 0.16s ease',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{
                marginTop: 2,
                width: 18,
                height: 18,
                accentColor: C.accent,
                flexShrink: 0,
                cursor: 'pointer',
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ ...t.h3, color: C.text, marginBottom: 2 }}>
                Send me brewing tips by email
              </div>
              <div style={{ ...t.caption, color: C.textMuted, marginTop: 2 }}>
                Occasional emails. Unsubscribe anytime.
              </div>
            </div>
          </label>
        </m.div>
      </m.div>

      <OnboardingCtaBar
        label="Continue"
        onClick={handleContinue}
      />
    </div>
  );
}

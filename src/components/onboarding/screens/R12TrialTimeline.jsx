import { useState } from 'react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, listContainer, listItem, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { MascotStage, NoteBubble, OnboardingTopBar, OnboardingCtaBar, onboardingBg } from './OnboardingPrimitives';
import { MARKETING_CONSENT_VERSION } from '../onboardingConstants';

// Copy bank — CREATIVE_SPEC.md §2 R12 (contract law, verbatim).
const TIMELINE_STEPS = [
  { day: 'Today', body: 'Everything unlocked. Scan, taste, brew with me at full power.' },
  { day: 'Day 5', body: "I'll remind you before anything happens. No surprises." },
  { day: 'Day 7', body: 'Trial ends. Cancel any time before and you pay nothing.' },
];

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
      <OnboardingTopBar overlay />

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
          alignItems: 'center',
          gap: 12,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Content column — same max-width as R13's page-one recap so R12→R13
            reads as one continuous sequence (a page-turn, not a context switch). */}
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <m.div variants={listItem}>
            <NoteBubble>
              Here's what the next few days look like. No surprises.
            </NoteBubble>
          </m.div>

          {/* Headline — same serif 34px treatment as R13's headline (identical
              type baseline across the two screens). */}
          <m.div variants={listItem} style={{
            fontFamily: fonts.title,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: '-0.022em',
            color: C.text,
            marginTop: 2,
          }}>
            Your free trial, briefly.
          </m.div>

          {/* Vertical stepper — 2px hairline spine, 10px ink node dots */}
          <m.div variants={listItem} style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
            {TIMELINE_STEPS.map((s, i) => {
              const last = i === TIMELINE_STEPS.length - 1;
              return (
                <div key={s.day} style={{ display: 'flex', gap: 14 }}>
                  {/* Stepper spine */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0,
                    width: 10,
                  }}>
                    {/* Ink node */}
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: C.text,
                      flexShrink: 0,
                      marginTop: 6,
                    }} />
                    {/* Hairline connector */}
                    {!last && (
                      <div style={{
                        width: 2,
                        flex: 1,
                        minHeight: 28,
                        background: C.hairline,
                        marginTop: 4,
                        marginBottom: 4,
                      }} />
                    )}
                  </div>

                  {/* Step content */}
                  <div style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
                    <div style={{
                      fontFamily: fonts.body,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: C.textLight,
                      marginBottom: 3,
                    }}>
                      {s.day}
                    </div>
                    <div style={{
                      fontFamily: fonts.body,
                      fontSize: 15,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      color: C.text,
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
        </div>
      </m.div>

      <OnboardingCtaBar
        label="See my options"
        onClick={handleContinue}
      />
    </div>
  );
}

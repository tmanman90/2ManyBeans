import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Coffee, Clock, Heart, X } from 'lucide-react';
import { C, fonts, type as t, radius, shadows, cardBase } from '../../../styles/theme';
import { m, fadeUp, spring } from '../../../lib/motion';
import { useOnboarding } from '../OnboardingContext';
import { useOnboardingPaywall } from '../useOnboardingPaywall';
import { logOnboardingEvent } from '../../../lib/onboardingAnalytics';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { usePaywall } from '../../../hooks/usePaywall.jsx';
import { onboardingBg } from './OnboardingPrimitives';
import { GlassButton } from '../../GlassButton';
import RedemptionInline from './RedemptionInline';
import { assetUrl } from '../../../lib/assetUrl';
import { haptic } from '../../../lib/haptics';
import { palateArchetype } from '../../../lib/onboardingPalate';
import { getOnboardingPalate, palateSummaryLine } from '../../../lib/palateProfile';
import {
  PAYWALL_HYDRATION_TIMEOUT_MS as HYDRATION_TIMEOUT_MS,
  REDEEM_CELEBRATE_MS,
} from '../onboardingConstants';

// Visual plan card data — no logic, purely presentational labels
const PLANS = [
  {
    key: 'pro',
    label: 'Pro',
    tagline: 'Everything you need to track your beans.',
    perks: ['Unlimited bean inventory', 'Tasting log', 'Freshness tracking'],
    recommended: false,
  },
  {
    key: 'ultra',
    label: 'Ultra',
    tagline: 'The full experience, nothing held back.',
    perks: ['Everything in Pro', 'AI Aiden brew recipes', 'Professor Ruphus stories', 'Priority support'],
    recommended: true,
  },
];

// Copy bank — CREATIVE_SPEC.md Appendix A4 (contract law, verbatim).
//
// Goal row — keyed by R02Goal's stored goal values (matches the
// GOAL_ACKNOWLEDGMENTS map already used in R03Pain).
const GOAL_VALUE_ROW = {
  aiden: 'Aiden profiles tuned to every bag you scan',
  v60: 'Pour-over recipes dialed to your grinder',
  aeropress: 'Aeropress recipes dialed to your grinder',
  french_press: 'Immersion recipes dialed to your grinder',
  espresso: 'Dial-in guidance for every new bag',
  all: 'Recipes for every brewer on your bench',
};
const GOAL_VALUE_ROW_FALLBACK = 'Recipes tuned to how you actually brew';

// Pain row — Appendix A4 lists five pain rows with its own prose labels;
// R03Pain.jsx's PAIN_OPTIONS is the source of truth for the actual stored
// answer keys. Mapped 1:1 by LIST ORDER (both are exactly five entries):
//   1 inconsistent      -> "Step-by-step brews so every cup repeats"
//   2 forget_freshness  -> "Peak-window tracking so you never drink a stale cup"
//   3 too_many_beans    -> "Every bag, jar, and roast date on one shelf"
//   4 taste_more        -> "Guided tastings that train your palate cup by cup"
//   5 brew_like_pro     -> "Professor Ruphus coaching you from bag to cup"
const PAIN_VALUE_ROW = {
  inconsistent: 'Step-by-step brews so every cup repeats',
  forget_freshness: 'Peak-window tracking so you never drink a stale cup',
  too_many_beans: 'Every bag, jar, and roast date on one shelf',
  taste_more: 'Guided tastings that train your palate cup by cup',
  brew_like_pro: 'Professor Ruphus coaching you from bag to cup',
};
const PAIN_VALUE_ROW_FALLBACK = 'Peak-window tracking so you never drink a stale cup';

const PALATE_VALUE_ROW_FALLBACK = 'A tasting coach that learns your palate';

// palateSummaryLine() returns "Palate: <phrase>[, <phrase>...]." — strip the
// fixed "Palate: " prefix and take only the first comma-separated phrase
// (also stripping a trailing period when there's only one phrase).
function firstPalatePhrase(answers) {
  const palate = getOnboardingPalate({ onboardingAnswers: answers });
  const line = palateSummaryLine(palate);
  if (!line) return null;
  const withoutPrefix = line.replace(/^Palate:\s*/, '');
  const commaIdx = withoutPrefix.indexOf(',');
  const raw = commaIdx >= 0 ? withoutPrefix.slice(0, commaIdx) : withoutPrefix;
  const phrase = raw.replace(/\.$/, '').trim();
  return phrase || null;
}

// Mascot — "small, top-right, quiet" (CREATIVE_SPEC.md §2 R13). MascotStage
// (OnboardingPrimitives) is a full-bleed top hero block with no
// size/position props for corner placement, so this renders the same
// video+poster+reduced-motion pattern directly, scaled to h180 and pinned
// to the top-right corner instead.
const MASCOT_CORNER_HEIGHT = 180;
function MascotCorner({ src, reduce }) {
  const posterSrc = assetUrl(src.replace('.mp4', '-poster.jpg'));
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
        right: 0,
        width: MASCOT_CORNER_HEIGHT * 0.78,
        height: MASCOT_CORNER_HEIGHT,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      {reduce ? (
        <img src={posterSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <video
          key={src}
          src={assetUrl(src)}
          poster={posterSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
    </div>
  );
}

export default function R13Paywall() {
  const { dispatch, finish, answers } = useOnboarding();
  const { hasPro, hasUltra } = useSubscription();
  const { paywallContext } = usePaywall();
  const {
    status,
    openOnboardingPaywall,
    handleDismissOrPurchase,
    closePaywall,
    flowCompletedRef,
  } = useOnboardingPaywall();
  const reduce = useReducedMotion();

  const [finalizeError, setFinalizeError] = useState(null);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (status !== 'hydrating') return;
    const timer = setTimeout(() => setHydrationTimedOut(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const finalizePurchase = useCallback(async () => {
    try {
      setFinalizeError(null);
      await finish?.({ completedVia: 'paywall' });
    } catch (err) {
      flowCompletedRef.current = false;
      setFinalizeError(err?.message || 'Could not finish setting up your account.');
    }
  }, [finish, flowCompletedRef]);

  // The recap is a true "page one" shown BEFORE the native sheet
  // (CREATIVE_SPEC.md §2 R13): the sheet now opens on CTA tap instead of
  // automatically on reaching 'ready'. openedRef still guards a fast
  // double-tap from opening the sheet twice.
  const openedRef = useRef(false);
  const handleStartTrial = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    openOnboardingPaywall();
    logOnboardingEvent('onboarding_paywall_shown', {});
  }, [openOnboardingPaywall]);

  useEffect(() => {
    if (
      status === 'skip_web' ||
      status === 'skip_no_rc' ||
      status === 'skip_already_subscribed'
    ) {
      if (flowCompletedRef.current) return;
      flowCompletedRef.current = true;
      dispatch({ type: 'COMPLETE', via: 'skipped_paywall' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const prevHasSubRef = useRef(false);
  useEffect(() => {
    const hasSub = hasPro || hasUltra;
    if (hasSub && !prevHasSubRef.current && !flowCompletedRef.current) {
      flowCompletedRef.current = true;
      closePaywall();
      logOnboardingEvent('onboarding_paywall_trial_started', {
        tier: hasUltra ? 'ultra' : 'pro',
      });
      finalizePurchase();
    }
    prevHasSubRef.current = hasSub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPro, hasUltra]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    const nowOpen = paywallContext !== null;
    if (wasOpenRef.current && !nowOpen) {
      handleDismissOrPurchase(
        () => { finalizePurchase(); },
        () => {
          logOnboardingEvent('onboarding_paywall_dismissed', {});
          dispatch({ type: 'COMPLETE', via: 'maybe_later' });
        }
      );
    }
    wasOpenRef.current = nowOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paywallContext]);

  // Close (X, top-left, visible from t=0 in every state). Routes through the
  // SAME disambiguation the native sheet's own dismiss uses (respects the
  // purchase-vs-dismiss race the hook already resolves), so a purchase that
  // lands a beat late is still honored instead of losing the sale.
  const handleClose = useCallback(() => {
    closePaywall();
    handleDismissOrPurchase(
      () => { finalizePurchase(); },
      () => {
        logOnboardingEvent('onboarding_paywall_dismissed', {});
        dispatch({ type: 'COMPLETE', via: 'maybe_later' });
      }
    );
  }, [closePaywall, handleDismissOrPurchase, finalizePurchase, dispatch]);

  // Redemption — refs mirror hasPro/hasUltra so the poll below always reads
  // the live value (a plain closure over state would go stale mid-poll).
  const hasProRef = useRef(hasPro);
  const hasUltraRef = useRef(hasUltra);
  useEffect(() => { hasProRef.current = hasPro; }, [hasPro]);
  useEffect(() => { hasUltraRef.current = hasUltra; }, [hasUltra]);

  // Verifies the entitlement actually reached useSubscription (Firestore
  // listener propagation) before the celebration beat starts. Polls up to
  // 3s; if it never arrives we still proceed (redeemCode() itself already
  // succeeded server-side — the webhook/listener lag is not a user-facing
  // failure) rather than leaving the user stuck.
  const waitForEntitlementRefresh = useCallback(() => new Promise((resolve) => {
    const deadline = Date.now() + 3000;
    const tick = () => {
      if (hasProRef.current || hasUltraRef.current) { resolve(true); return; }
      if (Date.now() >= deadline) { resolve(false); return; }
      setTimeout(tick, 150);
    };
    tick();
  }), []);

  const handleRedeemed = useCallback(async () => {
    if (flowCompletedRef.current) return;
    // Claim the flow immediately so the generic hasPro/hasUltra
    // purchase-detection effect above (which would call finalizePurchase
    // with completedVia: 'paywall') never double-fires once the
    // redemption's Firestore write propagates.
    flowCompletedRef.current = true;
    const confirmed = await waitForEntitlementRefresh();
    if (!confirmed) {
      // Never celebrate an unconfirmed entitlement: finish straight into the
      // app (server-side redemption already succeeded; the listener will
      // catch up there).
      try {
        await finish?.({ completedVia: 'code_redeemed' });
      } catch (err) {
        flowCompletedRef.current = false;
        setFinalizeError(err?.message || 'Could not finish setting up your account.');
      }
      return;
    }
    setCelebrating(true);
    haptic.medium();
    setTimeout(async () => {
      try {
        await finish?.({ completedVia: 'code_redeemed' });
      } catch (err) {
        flowCompletedRef.current = false;
        setCelebrating(false);
        setFinalizeError(err?.message || 'Could not finish setting up your account.');
      }
    }, REDEEM_CELEBRATE_MS);
  }, [flowCompletedRef, waitForEntitlementRefresh, finish]);

  const archetype = palateArchetype(answers?.palateChart);
  const goalRowText = GOAL_VALUE_ROW[answers?.goal] || GOAL_VALUE_ROW_FALLBACK;
  const painRowText = PAIN_VALUE_ROW[answers?.pain] || PAIN_VALUE_ROW_FALLBACK;
  const palatePhrase = firstPalatePhrase(answers);
  const palateRowText = palatePhrase
    ? `A coach who already knows your taste: ${palatePhrase}`
    : PALATE_VALUE_ROW_FALLBACK;

  const VALUE_ROWS = [
    { Icon: Coffee, text: goalRowText },
    { Icon: Clock, text: painRowText },
    { Icon: Heart, text: palateRowText },
  ];

  return (
    <div style={{
      minHeight: '100dvh',
      background: onboardingBg,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: fonts.body,
    }}>
      {/* Close — 44pt, top-left, visible from t=0 in every state */}
      {!celebrating && (
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            left: 16,
            zIndex: 3,
            width: 44, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${C.cream}CC`,
            border: `1px solid ${C.hairline}`,
            borderRadius: radius.pill,
            cursor: 'pointer',
            boxShadow: shadows.e1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <X size={20} color={C.textMuted} strokeWidth={2.5} />
        </button>
      )}

      <MascotCorner
        src={celebrating
          ? '/images/ruphus-animations/ruphus-fist-pump.mp4'
          : '/images/ruphus-animations/ruphus-confident.mp4'}
        reduce={reduce}
      />

      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '32px 24px calc(32px + env(safe-area-inset-bottom))',
        textAlign: 'center',
      }}>
        {finalizeError ? (
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              maxWidth: 360,
            }}
          >
            <div style={{
              ...t.display,
              color: C.accent,
            }}>
              Almost there.
            </div>
            <div style={{
              ...t.bodyL,
              color: C.textMuted,
              maxWidth: 300,
            }}>
              Your subscription is active, but I couldn't save your setup
              yet. Tap below to try again, you won't be charged twice.
            </div>
            <m.button
              onClick={finalizePurchase}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={{
                minHeight: 52,
                width: '100%',
                maxWidth: 300,
                padding: '14px 28px',
                ...t.bodyL,
                fontWeight: 700,
                background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accentDark} 100%)`,
                color: '#fff',
                border: 'none',
                borderRadius: radius.md,
                cursor: 'pointer',
                boxShadow: `0 2px 8px rgba(168,106,56,0.28), 0 8px 24px rgba(168,106,56,0.18)`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Finish setting up
            </m.button>
            <div style={{
              ...t.caption,
              color: C.textLight,
              maxWidth: 260,
            }}>
              {finalizeError}
            </div>
          </m.div>

        ) : status === 'hydrating' ? (
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* Premium spinner — accent on hairline track */}
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `3px solid ${C.hairline}`,
                borderTopColor: C.accent,
                animation: 'onboarding-spinner 0.9s linear infinite',
              }} />
            </div>
            <style>{`
              @media (prefers-reduced-motion: no-preference) {
                @keyframes onboarding-spinner {
                  from { transform: rotate(0deg); }
                  to   { transform: rotate(360deg); }
                }
              }
            `}</style>
            <div style={{ ...t.body, color: C.textMuted }}>
              One second...
            </div>

            {hydrationTimedOut && (
              <m.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => {
                  if (flowCompletedRef.current) return;
                  flowCompletedRef.current = true;
                  dispatch({ type: 'COMPLETE', via: 'skipped_paywall' });
                }}
                whileTap={{ scale: 0.97 }}
                style={{
                  marginTop: 8,
                  minHeight: 44,
                  padding: '12px 24px',
                  ...t.bodyL,
                  fontWeight: 600,
                  background: 'transparent',
                  color: C.accent,
                  border: `1.5px solid ${C.accent}`,
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Continue without subscription
              </m.button>
            )}
          </m.div>

        ) : (
          /* "ready" — page-one personalized recap, shown BEFORE the native
             sheet opens (CREATIVE_SPEC.md §2 R13). */
          <m.div
            {...fadeUp}
            style={{
              display: 'flex',
              flexDirection: 'column',
              // Left-aligned like R12's column so R12 -> R13 reads as a
              // page-turn, not a recomposition (codex P23 finding 10).
              alignItems: 'stretch',
              gap: 16,
              width: '100%',
              maxWidth: 360,
            }}
          >
            <div style={{ ...t.label, color: C.textLight, textAlign: 'left' }}>
              YOUR PLAN IS READY
            </div>

            <div
              key={celebrating ? 'celebrate' : 'normal'}
              className="r13-headline-x"
              style={{
                fontFamily: fonts.title,
                fontSize: 34,
                fontWeight: 600,
                lineHeight: 1.04,
                letterSpacing: '-0.022em',
                color: C.text,
                textAlign: 'left',
              }}
            >
              {celebrating ? "You're in, brewer." : `${archetype.title}, meet your coach.`}
            </div>

            {!celebrating && (
              <>
                {/* Personalized value rows — hairline rows like R04's */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  {VALUE_ROWS.map(({ Icon, text }, i) => (
                    <div
                      key={i}
                      className="r13-value-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        border: `1px solid ${C.hairline}`,
                        borderRadius: radius.md,
                        padding: '13px 14px',
                        textAlign: 'left',
                        animationDelay: `${i * 60}ms`,
                      }}
                    >
                      <Icon size={18} color={C.text} strokeWidth={2} style={{ flexShrink: 0 }} />
                      <span style={{ fontFamily: fonts.body, fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>
                        {text}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                  {PLANS.map((plan) => (
                    <div key={plan.key} style={{
                      ...cardBase,
                      position: 'relative',
                      padding: '16px 16px',
                      borderRadius: radius.lg,
                      border: plan.recommended
                        ? `2px solid ${C.accent}`
                        : `1.5px solid ${C.border}`,
                      background: plan.recommended ? C.accentSoft : C.cream,
                      boxShadow: plan.recommended ? shadows.e3 : shadows.e1,
                      textAlign: 'left',
                    }}>
                      {plan.recommended && (
                        <div style={{
                          position: 'absolute',
                          top: -1,
                          right: 14,
                          background: C.accent,
                          color: '#fff',
                          ...t.label,
                          padding: '3px 10px',
                          borderRadius: `0 0 ${radius.xs}px ${radius.xs}px`,
                        }}>
                          Recommended
                        </div>
                      )}
                      <div style={{
                        ...t.h2,
                        color: plan.recommended ? C.accent : C.text,
                        marginBottom: 4,
                      }}>
                        {plan.label}
                      </div>
                      <div style={{
                        ...t.body,
                        color: C.textMuted,
                        marginBottom: 10,
                      }}>
                        {plan.tagline}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {plan.perks.map((perk) => (
                          <div key={perk} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                            <div style={{
                              width: 16, height: 16,
                              borderRadius: '50%',
                              background: plan.recommended ? C.accent : C.accentSoft,
                              border: plan.recommended ? 'none' : `1.5px solid ${C.accent}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                <path d="M1 3l2 2 4-4" stroke={plan.recommended ? '#fff' : C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                            <span style={{ ...t.body, color: C.text }}>{perk}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  ...t.caption,
                  color: C.textLight,
                  textAlign: 'center',
                  maxWidth: 260,
                  lineHeight: 1.5,
                }}>
                  Prices shown in the native payment sheet. Cancel anytime during your trial.
                </div>

                <GlassButton fullWidth onClick={handleStartTrial}>
                  Start my 7-day free trial
                </GlassButton>

                <RedemptionInline onRedeemed={handleRedeemed} />
              </>
            )}
          </m.div>
        )}
      </div>

      <style>{`
        .r13-value-row { opacity: 1; }
        .r13-headline-x { opacity: 1; }
        @media (prefers-reduced-motion: no-preference) {
          .r13-value-row {
            opacity: 0;
            animation: r13RowIn 240ms cubic-bezier(0.22,1,0.36,1) both;
          }
          @keyframes r13RowIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .r13-headline-x {
            animation: r13HeadlineFade 240ms ease-out;
          }
          @keyframes r13HeadlineFade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}

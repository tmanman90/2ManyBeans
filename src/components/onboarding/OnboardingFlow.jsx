// Parent state machine for the 13-screen onboarding rebuild.
//
// - useReducer is the single source of truth for {step, answers}
// - Persistence happens inside a dispatch wrapper (never from useEffect),
//   which guarantees one save per committed transition and no dependency
//   on React's render timing
// - Uid-scoped localStorage: switching accounts on a shared device never
//   bleeds answers across users
// - All 14 screen components are statically imported so they bundle into
//   a single chunk (see vite.config.js manualChunks)
// - The whole tree is wrapped in OnboardingErrorBoundary so one crashing
//   screen can't white-screen the app

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { OnboardingContext } from './OnboardingContext';
import { OnboardingErrorBoundary } from './OnboardingErrorBoundary';
import { clearState, loadState, saveState } from './onboardingState';
import { logOnboardingEvent } from '../../lib/onboardingAnalytics';
import { LoadingScreen } from '../LoadingScreen';

import R01Welcome from './screens/R01Welcome';
import R02Goal from './screens/R02Goal';
import R03Pain from './screens/R03Pain';
import R04SocialProof from './screens/R04SocialProof';
import R05Tinder from './screens/R05Tinder';
import R06Personalized from './screens/R06Personalized';
import R07Preferences from './screens/R07Preferences';
import R08PermissionPriming from './screens/R08PermissionPriming';
import R09Processing from './screens/R09Processing';
import R10Demo from './screens/R10Demo';
import R11ValueDelivery from './screens/R11ValueDelivery';
import R12TrialTimeline from './screens/R12TrialTimeline';
import R13Paywall from './screens/R13Paywall';
import R13bNudge from './screens/R13bNudge';

export const STEPS = [
  'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7',
  'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r13b',
];

// Step → previous step map. Back nav is allowed on every screen unless the
// screen opts out via `backDisabled` in its shell props (R1, R9, R10, R13,
// R13b). No per-step exception table — one rule.
const PREV_STEP = {
  r1: 'r1',
  r2: 'r1',
  r3: 'r2',
  r4: 'r3',
  r5: 'r4',
  r6: 'r5',
  r7: 'r6',
  r8: 'r7',
  r9: 'r8',
  r10: 'r9',
  r11: 'r10',
  r12: 'r11',
  r13: 'r12',
  r13b: 'r13',
};

export const DEFAULT_ANSWERS = {
  goal: null,
  pain: null,
  tinderCards: [],
  preferences: {
    grinder: null,
    grinderCustomName: null,
    brewMethod: null,
    displayName: null,
  },
  cameraPermission: null,
  palateChart: null,
  marketingConsent: false,
  completedVia: null,
  postCompleteAction: 'none',
};

const SCREEN_COMPONENTS = {
  r1: R01Welcome,
  r2: R02Goal,
  r3: R03Pain,
  r4: R04SocialProof,
  r5: R05Tinder,
  r6: R06Personalized,
  r7: R07Preferences,
  r8: R08PermissionPriming,
  r9: R09Processing,
  r10: R10Demo,
  r11: R11ValueDelivery,
  r12: R12TrialTimeline,
  r13: R13Paywall,
  r13b: R13bNudge,
};

const INITIAL_STATE = { step: 'r1', answers: DEFAULT_ANSWERS };

function onboardingReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.hydrated ?? state;

    case 'ANSWER':
      return { ...state, answers: { ...state.answers, ...action.patch } };

    case 'ADVANCE': {
      const nextStep = STEPS.includes(action.next) ? action.next : state.step;
      const nextAnswers = action.answersPatch
        ? { ...state.answers, ...action.answersPatch }
        : state.answers;
      return { ...state, step: nextStep, answers: nextAnswers };
    }

    case 'BACK': {
      const prev = PREV_STEP[state.step] || state.step;
      return { ...state, step: prev };
    }

    case 'COMPLETE':
      return {
        ...state,
        step: 'r13b',
        answers: { ...state.answers, completedVia: action.via || 'skipped_paywall' },
      };

    case 'RESET':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export default function OnboardingFlow({ user, profile, completeOnboarding }) {
  const uid = user?.uid;
  const [state, rawDispatch] = useReducer(onboardingReducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Keep a ref of the latest state so the dispatch wrapper can persist the
  // post-action result without depending on React's render cycle.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Hydrate from uid-scoped localStorage on mount (or when uid changes —
  // switching accounts on a shared device).
  useEffect(() => {
    if (!uid) return;
    const restored = loadState(uid, {
      validSteps: STEPS,
      onFailure: (reason) => logOnboardingEvent('onboarding_resume_failed', { reason }),
    });
    if (restored) {
      rawDispatch({ type: 'HYDRATE', hydrated: restored });
    }
    setHydrated(true);
  }, [uid]);

  // Log a screen_view on every committed step change once hydration is done.
  useEffect(() => {
    if (!hydrated || !uid) return;
    logOnboardingEvent('onboarding_screen_view', { screen: state.step });
  }, [hydrated, uid, state.step]);

  // Dispatch wrapper — the ONE place saveState runs. queueMicrotask waits
  // for React to commit the reducer before we snapshot stateRef.
  const advancingRef = useRef(false);
  const dispatch = useCallback((action) => {
    if (!action || !action.type) return;
    if (advancingRef.current && action.type === 'ADVANCE') return;
    if (action.type === 'ADVANCE') advancingRef.current = true;

    rawDispatch(action);

    queueMicrotask(() => {
      try {
        if (uid) saveState(uid, stateRef.current);
      } catch { /* swallow — see quota handling */ }
      advancingRef.current = false;
    });
  }, [uid]);

  // Terminal completion — Phase 1 wires the minimal path so fresh users can
  // actually reach the main app via placeholder screens. Phase 4 replaces the
  // R13b onClick with the real scan-CTA handoff and attaches a full answers
  // blob. We pass the current answers to completeOnboarding so once it gets
  // extended to accept them, everything already flows through.
  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      if (completeOnboarding) {
        await completeOnboarding(stateRef.current.answers);
      }
      if (uid) clearState(uid);
      logOnboardingEvent('onboarding_completed', {
        completedVia: stateRef.current.answers?.completedVia || 'skipped_paywall',
      });
    } catch (err) {
      logOnboardingEvent('onboarding_complete_write_failed', {
        error: String(err?.message || err || '').slice(0, 200),
      });
      setFinishing(false);
    }
  }, [finishing, completeOnboarding, uid]);

  // Log a resume when hydration restored a non-r1 step. Useful for
  // post-ship debugging without being noisy during normal flows.
  const resumeLoggedRef = useRef(false);
  useEffect(() => {
    if (hydrated && !resumeLoggedRef.current && state.step !== 'r1') {
      resumeLoggedRef.current = true;
      logOnboardingEvent('onboarding_resumed', { screen: state.step });
    }
  }, [hydrated, state.step]);

  const ctxValue = useMemo(() => ({
    state,
    answers: state.answers,
    dispatch,
    user,
    profile,
    finish,
  }), [state, dispatch, user, profile, finish]);

  if (!uid || !hydrated) return <LoadingScreen />;

  const Screen = SCREEN_COMPONENTS[state.step] || R01Welcome;

  return (
    <OnboardingErrorBoundary>
      <OnboardingContext.Provider value={ctxValue}>
        {/* key={state.step} forces a fresh mount per transition so the
            previous screen's local state can't leak forward. */}
        <div key={state.step} style={{ minHeight: '100dvh' }}>
          <Screen />
        </div>
      </OnboardingContext.Provider>
    </OnboardingErrorBoundary>
  );
}

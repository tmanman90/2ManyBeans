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
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { OnboardingContext } from './OnboardingContext';
import { OnboardingErrorBoundary } from './OnboardingErrorBoundary';
import { clearState, loadState, saveState, setDevForceOnboarding } from './onboardingState';
import { logOnboardingEvent } from '../../lib/onboardingAnalytics';
import { LoadingScreen } from '../LoadingScreen';
import { FINISH_TIMEOUT_MS } from './onboardingConstants';

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
  pendingScanBean: null,
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
      // Backing into R5 clears the swipes so the user actually redoes
      // the palate step. Without this, R5's alreadyComplete guard
      // immediately re-advances to R6 and the back press looks broken.
      // Also clears pendingScanBean (R10's held scan) — its "you'll love
      // this" reaction is derived from the palate chart, so a re-swiped
      // palate invalidates any held reaction context (LOOP_LOG D10).
      if (prev === 'r5') {
        return {
          ...state,
          step: prev,
          answers: { ...state.answers, tinderCards: [], palateChart: null, pendingScanBean: null },
        };
      }
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

export default function OnboardingFlow({ user, profile, createProfile, completeOnboarding }) {
  const uid = user?.uid;
  const [state, rawDispatch] = useReducer(onboardingReducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Keep a ref of the latest committed state so the dispatch wrapper can
  // persist the post-action result without depending on React's render
  // cycle. Updated BOTH inside the wrapper (synchronous path, so
  // queueMicrotask sees the new state) AND via an effect (backstop for
  // state changes that come from rawDispatch outside the wrapper — e.g.
  // the one-shot HYDRATE in the mount effect below).
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

  // Dispatch wrapper — the ONE place saveState runs.
  //
  // We compute the next state SYNCHRONOUSLY from the reducer rather
  // than reading stateRef.current inside a queueMicrotask. The sync
  // approach guarantees we save exactly the state the user just
  // transitioned to, even when the backstop effect that mirrors
  // committed state into stateRef hasn't run yet. (The effect runs
  // after React commits, which is always later than our microtask.)
  //
  // The reducer is pure, so running it here AND inside React's
  // rawDispatch is safe. Saves become fire-and-forget: we update
  // stateRef, kick off the microtask persistence, then let React
  // handle the actual re-render via rawDispatch.
  const advancingRef = useRef(false);
  const dispatch = useCallback((action) => {
    if (!action || !action.type) return;
    if (advancingRef.current && action.type === 'ADVANCE') return;
    if (action.type === 'ADVANCE') advancingRef.current = true;

    const nextState = onboardingReducer(stateRef.current, action);
    stateRef.current = nextState;
    rawDispatch(action);

    queueMicrotask(() => {
      try {
        if (uid) saveState(uid, nextState);
      } catch { /* swallow — see quota handling */ }
      advancingRef.current = false;
    });
  }, [uid]);

  // Terminal completion — branches on whether a profile doc already
  // exists:
  //
  // - Existing profile → completeOnboarding(answers) does a single
  //   atomic setDoc(merge:true) against the already-created doc.
  // - Fresh user (profile === null) → createProfile() is the FIRST
  //   write to /users/{uid} and fires Firestore's `allow create` rule,
  //   which strictly requires displayName and uses a hasOnly()
  //   allowlist. A merge-write without those fields would be rejected,
  //   trapping fresh users at Gate 5 forever. createProfile includes
  //   all the required create fields plus onboardingAnswers /
  //   onboardingCompletedAt in one atomic write.
  //
  // Optional `overrides` patch is merged into answers immediately
  // before persisting (used by R13b to set postCompleteAction in the
  // same atomic write). If marketingConsent is true on the final
  // blob, we also mirror to /emailList/{uid} in a follow-up write
  // (separate rule block, different doc).
  const finish = useCallback(async (overrides) => {
    if (finishing) return;
    setFinishing(true);
    try {
      const baseAnswers = stateRef.current.answers || {};
      const answers =
        overrides && typeof overrides === 'object'
          ? { ...baseAnswers, ...overrides }
          : baseAnswers;

      const { preferences: answerPrefs, ...answersWithoutPrefs } = answers;
      const prefsPatch = {};
      if (answerPrefs && typeof answerPrefs === 'object') {
        for (const [k, v] of Object.entries(answerPrefs)) {
          if (v !== null && v !== undefined && v !== '') prefsPatch[k] = v;
        }
      }

      const withTimeout = (promise) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout. Please try again.')), FINISH_TIMEOUT_MS)
          ),
        ]);

      // Test seam (additive, no-op in prod): lets the onboarding harness
      // capture the would-be terminal write instead of hitting Firestore.
      const testFinish = window.__ONBOARDING_TEST__?.finishProfile;
      if (testFinish) {
        await withTimeout(testFinish(answers));
      } else if (!profile) {
        if (!createProfile) throw new Error('createProfile not provided');
        await withTimeout(createProfile({
          displayName: user?.displayName || answerPrefs?.displayName || 'Coffee Lover',
          email: user?.email || null,
          photoURL: user?.photoURL || null,
          signUpProvider: user?.providerData?.[0]?.providerId || 'unknown',
          onboardingComplete: true,
          onboardingAnswers: answersWithoutPrefs,
          marketingConsent: !!answers.marketingConsent,
          preferences: Object.keys(prefsPatch).length ? prefsPatch : undefined,
        }));
      } else if (completeOnboarding) {
        await withTimeout(completeOnboarding(answers));
      }

      // Marketing consent → mirror to /emailList/{uid}. Matches the
      // existing emailList rule block (hasOnly email/displayName/
      // signUpDate/source, strings required). Separate write because
      // it's a different doc path, not a nested field.
      if (answers.marketingConsent && uid && user?.email) {
        try {
          const emailRef = doc(db, 'emailList', uid);
          await setDoc(
            emailRef,
            {
              email: user.email,
              displayName: user.displayName || answerPrefs?.displayName || '',
              signUpDate: serverTimestamp(),
              source: 'onboarding',
            },
            { merge: true }
          );
        } catch (err) {
          // Non-fatal. The primary user doc write already succeeded,
          // and we never want an email list sync failure to strand
          // the user at Gate 5.
          logOnboardingEvent('onboarding_email_list_write_failed', {
            error: String(err?.message || err || '').slice(0, 200),
          });
        }
      }

      if (uid) clearState(uid);
      // Clear the DEV replay flag (no-op in prod builds — the helper
      // just tries/catches localStorage). This lets Gate 5 drop the
      // user back into the main app on the next render.
      setDevForceOnboarding(false);
      logOnboardingEvent('onboarding_completed', {
        completedVia: answers.completedVia || 'skipped_paywall',
      });
    } catch (err) {
      logOnboardingEvent('onboarding_complete_write_failed', {
        error: String(err?.message || err || '').slice(0, 200),
      });
      // Reset the in-flight guard AND rethrow so the caller (R13b's
      // Yes/Maybe Later buttons) can clear its local busy state and
      // re-offer the action. Without the rethrow the caller would see
      // finish() resolve successfully after a silent failure.
      setFinishing(false);
      throw err;
    }
  }, [finishing, profile, createProfile, completeOnboarding, uid, user]);

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

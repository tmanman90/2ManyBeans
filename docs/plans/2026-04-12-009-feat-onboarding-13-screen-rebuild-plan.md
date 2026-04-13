---
title: Onboarding 13-Screen Rebuild
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-onboarding-14-screen-rebuild-requirements.md
---

# feat: Onboarding 13-Screen Rebuild

## Enhancement Summary

**Deepened on:** 2026-04-12

This plan has been pressure-tested by 7 parallel review agents (frontend-races, code-simplicity, architecture-strategist, security-sentinel, performance-oracle, data-integrity-guardian, kieran-typescript-reviewer). Their findings were folded into the plan as concrete fixes. Top findings:

### 🚨 Critical Blockers (Phase 0 — must land before any screen code)
1. **`SubscriptionProvider` and `PaywallProvider` mount inside Gate 6 in `main.jsx` (L147-148)** — strictly below Gate 5 where onboarding renders. R13's `usePaywall()` and `useSubscription()` calls will throw "must be used within a Provider". **Fix: hoist both providers above Gate 5 in Phase 0.**
2. **`firestore.rules` uses strict `hasOnly([...])` allowlist on `/users/{uid}` create+update paths.** `onboardingAnswers` and `onboardingCompletedAt` are not in either list — every write will reject with `PERMISSION_DENIED`. **Fix: add both fields to both allowlists in Phase 0, deploy rules 60s before client cutover.**
3. **`onboarding_events` subcollection is implicitly default-denied** (see L79-82 of existing rules). Every analytics write will silently fail (the flow swallows errors). **Fix: add explicit `match` block with field validation and size caps in Phase 0.**

### 🔥 High-Severity Fixes (folded throughout the plan)
4. **Two-write `completeOnboarding` pattern is wrong** — atomic single-write `setDoc(merge:true)` is safer AND simpler. Firestore guarantees atomicity within a single document.
5. **R8 offerings preload double-invokes under React StrictMode** — module-level sentinel + `hasAdvanced` guard needed.
6. **R9 processing moment has a double-advance race** — iOS timer-pause + visibility change can advance twice. Needs a cancelation token and `hasAdvanced` latch.
7. **R13 reads `hasPro` before RC listener has hydrated** — `firestoreLoaded` is not the right gate; need an RC-specific `rcHydrated` gate.
8. **R13 purchase-vs-dismiss race** — 500ms delayed decision + `flowCompleted` ref to disambiguate.
9. **Display name → prompt injection into Ruphus's LLM calls** — user-controlled string templated into system prompts. Must normalize + strip control chars.
10. **Marketing consent not GDPR/CCPA/CAN-SPAM compliant** — need `marketingConsentDate`, version, privacy link, mirror to `emailList`.
11. **`useState` for answers ships stale closures** — must use `useReducer` with synchronous saveState inside the dispatch wrapper.
12. **No error boundary** — any crash white-screens the app. Add class-based `OnboardingErrorBoundary`.
13. **localStorage not uid-scoped** — PII persists across device handoff on WKWebView. Namespace keys per-uid.

### ✂️ Simplifications Applied
14. **Analytics events trimmed from 19 → 10** — keep the funnel, drop the spam.
15. **Two-write pattern removed** — single atomic write.
16. **Back-nav policy reduced to one rule** — `backDisabled: true` on 5 specific screens, default allowed.
17. **`onboarding_manual_add_intent` merged into `onboarding_scan_intent`** — single flag + profile check.
18. **Capgo autoUpdate toggle dropped** — low realistic risk, not worth the checklist burden.
19. **localStorage schema version dropped** — rename the key if we ever need to migrate.
20. **Scan intent moved from localStorage → `onboardingAnswers.postCompleteAction`** — Firestore-backed, survives cross-device.

### 🔎 To Investigate Before Implementation
- Generalize `SpiderChart.jsx` with `range` + `labels` props instead of forking (likely saves a file)
- Validate R9 offerings preload actually works without loader on real iOS Capacitor (open question)

---

## Overview

Replace the current single-page `OnboardingWizard.jsx` (274 lines, form-only) with a 13-screen conversion-optimized flow adapted from the Cal AI / Filtru / Finch framework. Ruphus narrates every screen in a warm-mentor voice. The flow is fronted by a bean-scan hero, collects goal/pain/tinder data that computes a palate profile, runs a processing moment that preloads the paywall, climaxes with a palate chart + Ruphus letter, shows a trial timeline, then drops into a soft-gated paywall. "Maybe later" triggers a scan-CTA nudge that converts dismissers into day-1 activators.

## Problem Statement

**Current state:** One-page wizard asks name, grinder, brew method, consent. Ships but misses every pattern the research converges on.

**Why it matters:** Install-to-trial conversion is the primary lever for Coffee Hub's revenue. Current wizard has no demo, no emotional hook, no paywall sequencing, no Ruphus personality, no value delivery. Research (@c__basso, Cal AI, Filtru, @indiesoftwaredv, the adamlyttleapps 14-screen framework) unanimously points at demo-first + questionnaire + processing moment + preloaded paywall → ~2× trial-start lift.

**Why now:** Coffee Hub has all the raw ingredients (Ruphus, Gemini bean scan, Aiden, two-tier PaywallSheet). The gap is assembly. All critical product decisions are resolved in the origin brainstorm — this plan turns them into code.

## Proposed Solution

Build a parent `OnboardingFlow.jsx` state machine using `useReducer` + a local file-scoped `OnboardingContext` that renders 13 screens as child components via `<div key={step}>`-based remount. State persists to localStorage (uid-scoped) for resume. Screens are plain imports bundled in one lazy chunk (not 13 individual fetches). `main.jsx` Gate 5 logic stays intact — the providers are hoisted above it as a separate prerequisite. An `OnboardingErrorBoundary` wraps the flow so screen crashes don't white-screen the app.

On terminal completion (via any path), a single atomic `setDoc(merge:true)` call commits `onboardingComplete + onboardingAnswers + onboardingCompletedAt`. Analytics events write to a new Firestore `users/{uid}/onboarding_events` subcollection (Firebase Analytics is NOT installed and flaky on WKWebView).

Paywall sequencing: RevenueCat `getOfferings()` is called eagerly on **R7** mount (one screen earlier than originally specified — gives more headroom on slow networks). Single-flight module-level sentinel prevents StrictMode double-calls. Race against R9's 3-5s processing animation. R13 reads the cache synchronously. If the fetch rejects or the user is already subscribed, R13 falls back gracefully — all skip paths collapse to a single `completedVia: 'skipped_paywall'` value.

## Technical Approach

### Three Cross-Cutting Rules

These apply to every async effect and state transition in the flow:

1. **Every async effect gets a cancelation token.** `useEffect` creates `const cancel = {canceled: false}`, returns cleanup that sets `cancel.canceled = true`, and all callbacks check `if (cancel.canceled) return;` before mutating state.
2. **`saveState` is called exactly once per committed state transition, inside the reducer dispatch wrapper, never from a `useEffect`.** Never paired with a separate `goToStep` call.
3. **All "which fired first" ambiguity (purchase vs dismiss, hydration vs listener) is resolved by a short timer + a `flowCompleted` ref, not by reading instantaneous context values.**

### Architecture

**New files:**
- `src/components/onboarding/OnboardingFlow.jsx` — parent state machine with reducer + error boundary wrapper
- `src/components/onboarding/OnboardingErrorBoundary.jsx` — class component wrapping the flow
- `src/components/onboarding/OnboardingContext.jsx` — file-scoped context providing `{answers, dispatch, logEvent}`
- `src/components/onboarding/screens/R01Welcome.jsx` through `R13Paywall.jsx` + `R13bNudge.jsx` (14 screen files)
- `src/components/onboarding/screens/OnboardingScreenShell.jsx` — shared layout (avatar, bubble, headline, subtitle, CTA slot) that R1/R2/R3/R4/R6/R7/R12 wrap
- `src/components/onboarding/RuphusSpeechBubble.jsx` — extracted bubble + avatar (from `ProfessorRuphusSlideUp.jsx` L118-169)
- `src/components/onboarding/useOnboardingPaywall.js` — hook encapsulating R13's skip logic, offerings cache read, and purchase-vs-dismiss race handling
- `src/components/onboarding/onboardingState.js` — uid-scoped localStorage read/write with try/catch; exports constants for key names
- `src/lib/onboardingAnalytics.js` — Firestore events subcollection writer
- `src/lib/onboardingPalate.js` — palate axis math (tinder card → chart axes)
- `src/lib/sanitizeUserText.js` — normalize + strip control chars for user-supplied strings going into Firestore or LLM prompts
- `public/images/onboarding/` — asset directory for hero + canned demo (<500KB each)

**Modified files (in Phase 0):**
- `src/main.jsx` — hoist `SubscriptionProvider` + `PaywallProvider` ABOVE Gate 5 so `OnboardingFlow` can call their hooks
- `firestore.rules` — add `onboardingAnswers` + `onboardingCompletedAt` to both `/users/{uid}` allowlists; add explicit `/users/{uid}/onboarding_events/{eventId}` match block

**Modified files (Phase 1+):**
- `src/main.jsx` — swap `OnboardingWizard` lazy import to `OnboardingFlow` (module-scope, NOT inside Root render)
- `src/hooks/useUserProfile.jsx` — extend `completeOnboarding(answers)` to single atomic merge write
- `src/components/PaywallSheet.jsx` — add `onboarding` entry in `CONTEXT_COPY`
- `src/components/SettingsPage.jsx` — add `import.meta.env.DEV`-gated "Replay onboarding" section
- `src/App.jsx` — read `profile.onboardingAnswers.postCompleteAction` on mount (NOT localStorage), fire `setTab('inventory') + setPendingAddBean(true)`, clear field via `updateProfile`
- `src/components/SpiderChart.jsx` — generalize with `range` and `labels` props (if investigation shows this is feasible; otherwise fork)
- `src/contexts/SubscriptionContext.jsx` — expose a new `rcHydrated` flag that flips true on first `getCustomerInfo()` resolve OR first listener callback, whichever is first
- `vite.config.js` — `build.rollupOptions.output.manualChunks` entry forcing `src/components/onboarding/**` into a single chunk named `onboarding`

**Deleted:**
- `src/components/OnboardingWizard.jsx` — on hard-swap cutover (Phase 5)

### State Machine (useReducer)

```js
// src/components/onboarding/OnboardingFlow.jsx

const STEPS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r13b'];

const DEFAULT_ANSWERS = {
  goal: null,
  pain: null,
  tinderCards: [],       // must have length 5 to advance past R5
  preferences: {          // written ONLY to profile.preferences on completion, not duplicated in onboardingAnswers
    grinder: null,
    grinderCustomName: null,
    brewMethod: null,
    displayName: null,    // only captured if !user.displayName
  },
  cameraPermission: null, // 'granted' | 'denied' | 'unavailable'
  palateChart: null,      // computed from tinderCards, {sweetness, acidity, body, clean_funky, fruit_nutty}
  marketingConsent: false,
  completedVia: null,     // 'paywall' | 'maybe_later' | 'skipped_paywall'
  postCompleteAction: 'none', // 'scan' | 'manual_add' | 'none' — Firestore-backed, not localStorage
};

// Reducer handles all transitions. saveState is called from the dispatch wrapper below.
function onboardingReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':    return action.hydrated ?? state;
    case 'ANSWER':     return { ...state, answers: { ...state.answers, ...action.patch } };
    case 'ADVANCE':    return { ...state, step: action.next, answers: action.answersPatch ? { ...state.answers, ...action.answersPatch } : state.answers };
    case 'BACK':       return { ...state, step: action.prev };
    case 'COMPLETE':   return { ...state, step: 'r13b', answers: { ...state.answers, completedVia: action.via } };
    case 'RESET':      return { step: 'r1', answers: DEFAULT_ANSWERS };
    default:           return state;
  }
}

// Dispatch wrapper — the ONE place saveState runs.
function useOnboardingDispatch(rawDispatch, currentRef, uid) {
  const advancingRef = useRef(false);
  return useCallback((action) => {
    if (advancingRef.current && action.type === 'ADVANCE') return;   // one-shot guard against double-taps
    if (action.type === 'ADVANCE') advancingRef.current = true;
    rawDispatch(action);
    // React 19 guarantees rawDispatch commits synchronously for reducers during event handlers
    // but we use a post-dispatch ref to save the resulting state. The `currentRef` is updated
    // in a single useEffect keyed on state (via useSyncExternalStore-equivalent pattern).
    queueMicrotask(() => {
      try { saveState(uid, currentRef.current); } catch { /* swallow, see quota handling */ }
      advancingRef.current = false;
    });
  }, [rawDispatch, currentRef, uid]);
}
```

### Key-Based Screen Mount

```jsx
// OnboardingFlow render
<OnboardingErrorBoundary>
  <OnboardingContext.Provider value={ctxValue}>
    <div key={state.step} className="onboarding-screen-container">
      {SCREENS[state.step]}
    </div>
  </OnboardingContext.Provider>
</OnboardingErrorBoundary>
```

The `key={state.step}` forces React to unmount the old screen and mount a fresh one on every transition. Prevents state leakage between step components (e.g., R5's `currentCardIndex` cannot leak into R6).

### Error Boundary

```jsx
// src/components/onboarding/OnboardingErrorBoundary.jsx
class OnboardingErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    // Clear any corrupt local state and log failure
    try { clearState(auth.currentUser?.uid); } catch {}
    try { logOnboardingEvent('onboarding_resume_failed', { reason: 'render_crash', error: String(error) }); } catch {}
  }
  render() {
    if (this.state.hasError) {
      return <FallbackScreen onReload={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
```

### Palate Math (R5 → R11) — Single-Axis, ±0.6

```js
// src/lib/onboardingPalate.js
const CARD_AXIS_MAP = {
  c1_sweetness:   { axis: 'sweetness',   prompt: 'I want my coffee to taste sweet, not sharp' },
  c2_acidity:     { axis: 'acidity',     prompt: 'I want bright, fruity acidity — lemon, apricot, berries' },
  c3_body:        { axis: 'body',        prompt: 'I want a heavy, syrupy mouthfeel' },
  c4_clean_funky: { axis: 'clean_funky', prompt: 'I trust washed coffees over naturals and anaerobics' },
  c5_fruit_nutty: { axis: 'fruit_nutty', prompt: "I'd rather taste chocolate and nuts than fruit" },
};

export function computePalateChart(tinderCards) {
  const chart = { sweetness: 0, acidity: 0, body: 0, clean_funky: 0, fruit_nutty: 0 };
  for (const card of tinderCards) {
    const entry = CARD_AXIS_MAP[card.id];
    if (!entry) continue;
    chart[entry.axis] = card.swipe === 'yes' ? 0.6 : -0.6;
  }
  return chart;
}
```

### R7→R9 Preload Pattern (Single-Flight)

```js
// Fired on R7 mount — earliest stable point in the pure-UI portion of the flow
// (R6 can re-render as user interacts with feature cards, R7 is terminal-enough).
let rcOfferingsInflight = null;

export function warmPaywallOfferings() {
  if (window.__rcOfferingsCache && !window.__rcOfferingsCache.error) return;
  if (rcOfferingsInflight) return rcOfferingsInflight;
  rcOfferingsInflight = getOfferings()
    .then((offerings) => {
      // Do NOT overwrite a prior success with a later result
      if (!window.__rcOfferingsCache || window.__rcOfferingsCache.error) {
        window.__rcOfferingsCache = { offerings, fetchedAt: Date.now() };
      }
    })
    .catch((error) => {
      if (!window.__rcOfferingsCache) {
        window.__rcOfferingsCache = { error, fetchedAt: Date.now() };
      }
    })
    .finally(() => { rcOfferingsInflight = null; });
  return rcOfferingsInflight;
}
```

R9 runs a CSS `@keyframes` progress animation (not `requestAnimationFrame` — CSS is cheaper and can't race), with a single `advance()` function gated by a `hasAdvancedRef`. Both the animation-end path and the `visibilitychange` path call `advance()`; it no-ops if already advanced.

### Back Navigation — Single Rule

**All screens allow back except the following 5:**
- R1 (no prior)
- R9 (animation + preload in progress)
- R10 (forward-only demo)
- R13 (terminal decision)
- R13b (terminal nudge)

Implemented as `SCREENS[step].backDisabled === true`; everything else defaults to allowed. No per-screen exception table.

### Firestore Schema — No Duplication

```js
// users/{uid}/ — new fields added
{
  // existing fields unchanged
  onboardingComplete: true,        // existing, now written by new flow
  onboardingAnswers: {              // NEW (additive, non-breaking)
    goal: 'v60',
    pain: 'inconsistent',
    tinderCards: [{id:'c1_sweetness', swipe:'yes'}, ...],
    palateChart: { sweetness: 0.6, acidity: 0.6, body: -0.6, clean_funky: 0.6, fruit_nutty: -0.6 },
    cameraPermission: 'granted',
    marketingConsent: true,
    marketingConsentDate: <serverTimestamp>,
    marketingConsentVersion: 'onboarding-v1-2026-04-12',
    completedVia: 'paywall',        // 'paywall' | 'maybe_later' | 'skipped_paywall'
    postCompleteAction: 'scan',     // 'scan' | 'manual_add' | 'none' — consumed by App.jsx, then cleared
    // NOTE: NO `preferences` field here — live prefs live on profile.preferences only
  },
  onboardingCompletedAt: serverTimestamp(),
  preferences: { /* existing, updated in the same write if user completed R7 */ }
}

// users/{uid}/onboarding_events/{eventId}  (NEW subcollection)
{
  name: 'onboarding_screen_view',
  screen: 'r3',
  timestamp: serverTimestamp(),
  meta: { /* optional params, capped at <10 top-level keys by rules */ },
}
```

### completeOnboarding — Single Atomic Write

```js
// src/hooks/useUserProfile.jsx extension
export async function completeOnboarding(answers) {
  const profileRef = doc(db, 'users', auth.currentUser.uid);
  const payload = {
    onboardingComplete: true,
    onboardingAnswers: answers,
    onboardingCompletedAt: serverTimestamp(),
    // Also write live prefs to the top-level field if user completed R7
    ...(answers.preferences ? { preferences: answers.preferences } : {}),
  };
  try {
    await setDoc(profileRef, payload, { merge: true });
  } catch (err) {
    // Single atomic write — either all fields land or none do.
    // On rules rejection, user stays at Gate 5 and re-enters the flow on next open.
    logOnboardingEvent('onboarding_complete_write_failed', { error: String(err) });
    throw err;
  }
}
```

**No two-write pattern.** Firestore guarantees atomicity within a single document write. The original "write flag first, answers second" idea was solving a problem that doesn't exist — a single merge write is atomic per document. Rejected by rules = user is not stuck, they just see onboarding again on next open.

### Firestore Rules Updates (Phase 0)

```js
// /users/{userId} CREATE — add to hasOnly list
allow create: if request.auth != null && request.auth.uid == userId
  && request.resource.data.keys().hasOnly([
    'displayName', 'email', 'photoURL', 'signUpProvider',
    'username', 'createdAt', 'lastLoginAt', 'onboardingComplete',
    'marketingConsent', 'marketingConsentDate', 'preferences',
    'onboardingAnswers', 'onboardingCompletedAt'    // NEW
  ])
  && !request.resource.data.keys().hasAny(['fellow', 'subscription'])
  && /* existing displayName + username validators */;

// /users/{userId} UPDATE — add to hasOnly list
allow update: if request.auth != null && request.auth.uid == userId
  && request.resource.data.keys().hasOnly([
    'displayName', 'email', 'photoURL', 'signUpProvider',
    'username', 'createdAt', 'lastLoginAt', 'onboardingComplete',
    'marketingConsent', 'marketingConsentDate', 'preferences',
    'fellow', 'subscription',
    'onboardingAnswers', 'onboardingCompletedAt'    // NEW
  ])
  && (!request.resource.data.onboardingAnswers is map
      || request.resource.data.onboardingAnswers.size() <= 20)   // cap size
  && /* existing validators */
  && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['fellow', 'subscription']));

// NEW subcollection — onboarding_events (explicit match block, declared above the "No catch-all" comment)
match /users/{userId}/onboarding_events/{eventId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow create: if request.auth != null && request.auth.uid == userId
    && request.resource.data.keys().hasOnly(['name', 'screen', 'timestamp', 'meta'])
    && request.resource.data.name is string
    && request.resource.data.name.size() <= 80
    && request.resource.data.size() <= 10;
  allow update, delete: if false;  // immutable for funnel integrity
}
```

### Provider Hoist in main.jsx (Phase 0)

```jsx
// BEFORE (current):
// ...
// Gate 5 (!isOnboarded → OnboardingWizard)    <-- providers NOT in scope here
// Gate 6: <SubscriptionProvider><PaywallProvider><App/></PaywallProvider></SubscriptionProvider>

// AFTER:
// ...
// Gate 4: profile bootstrap
// Gate 4.5: <SubscriptionProvider uid={user.uid}><PaywallProvider>   <-- HOIST ABOVE GATE 5
//   Gate 5 (!isOnboarded → <OnboardingFlow/>)                        <-- now has usePaywall/useSubscription access
//   Gate 6: <UserPreferencesProvider>
//     <App/>
//   </UserPreferencesProvider>
// </PaywallProvider></SubscriptionProvider>
```

This is a structural edit but a LOCAL one — ~10 lines of JSX rearrangement. Nothing else in the tree needs to change. `PaywallMount` stays inside the stack so the sheet can render.

### Analytics Events (Trimmed to 10)

1. `onboarding_screen_view` — params: `screen` (fires on every screen mount, primary funnel metric)
2. `onboarding_tinder_swipe` — params: `card_id`, `direction` (kept for 1-time palate sanity check, can be removed later)
3. `onboarding_paywall_shown` — no params
4. `onboarding_paywall_trial_started` — params: `tier`, `package_id`
5. `onboarding_paywall_dismissed` — no params (fired only after the 500ms disambiguation timer)
6. `onboarding_completed` — params: `completedVia` ('paywall' | 'maybe_later' | 'skipped_paywall')
7. `onboarding_nudge_accepted` — no params (user took the scan CTA from R13b)
8. `onboarding_resume_failed` — params: `reason` (corrupt_json | quota | render_crash)
9. `onboarding_offerings_fetch_failed` — params: `error` (track R9 preload failures to validate the lift)
10. `onboarding_complete_write_failed` — params: `error` (track rules rejection post-deploy)

**Fire-and-forget.** Never block UI. Wrap in try/catch, swallow errors. Firestore offline cache handles transient network issues. Events dropped due to local failures are acceptable — the metric is directional, not forensic.

**Dropped vs. original plan:** `screen_complete` (duplicates `view`), `back_navigation`, `permission_result`, `offerings_fetch_started`, `offerings_fetch_succeeded`, `already_subscribed_skip`, `nudge_shown`, `nudge_dismissed`, `resume_started`, `dev_replay_triggered` — none of these will be queried in the first 30 days post-ship.

### Implementation Phases

---

#### Phase 0: Prerequisites (Provider Hoist + Rules Deploy)

**Deliverable:** `main.jsx` has the providers hoisted above Gate 5, the new Firestore rules are deployed to production, and a rule propagation window has passed before any client code rolls out.

**Tasks:**
- [ ] **Hoist `SubscriptionProvider` and `PaywallProvider` above Gate 5 in `src/main.jsx`**. Preserve all existing gate semantics; the only structural change is wrapping Gates 5-6 in `<SubscriptionProvider uid={user.uid}><PaywallProvider>...</PaywallProvider></SubscriptionProvider>` instead of wrapping only Gate 6. `PaywallMount` stays inside the tree. Verify existing `<App/>` behavior is unchanged (no regression in gate 6 rendering).
- [ ] **Add a new `rcHydrated` flag to `SubscriptionContext.jsx`**. Set to `true` on the first of: (a) `getCustomerInfo()` promise resolution during init, or (b) first `addCustomerInfoUpdateListener` callback fire. Read alongside `firestoreLoaded` by R13's hydration gate.
- [ ] **Update `firestore.rules`**:
  - Add `'onboardingAnswers'` and `'onboardingCompletedAt'` to BOTH the `/users/{userId}` CREATE and UPDATE `hasOnly` lists
  - Add a size cap on `onboardingAnswers` (`request.resource.data.onboardingAnswers is map && request.resource.data.onboardingAnswers.size() <= 20`)
  - Add an explicit `match /users/{userId}/onboarding_events/{eventId}` block with `name` validation, 10-field size cap, and `update/delete: if false`
  - Keep all existing rules untouched
- [ ] **Deploy the rules via `firebase deploy --only firestore:rules`** and confirm success in the Firebase console
- [ ] **Wait ~60 seconds** for rule propagation before starting Phase 1 client work (rules are globally consistent but in-flight requests may race)
- [ ] **Test the rules**: in the Firebase console's rules playground, simulate an authenticated `setDoc(users/{uid}, {onboardingAnswers: {}, onboardingCompletedAt: <now>}, {merge: true})` and verify `Allow`. Simulate an unauthenticated request and verify `Deny`. Simulate a request with a bogus field and verify `Deny`.
- [ ] **Commit with message prefix `[phase 0]`** so the rollback scope is obvious if something breaks.

**Success criteria:**
- `main.jsx` diff shows only the provider hoist (no gate semantics changed)
- Firestore rules deployed and validated in playground
- Existing users can still update their profiles (`preferences`, `displayName`, etc.) normally — smoke-test by editing a preference in-app

**Rollback:** `git revert <phase 0 commit>` and `firebase deploy --only firestore:rules` on the previous rules version. Both are atomic and reversible.

---

#### Phase 1: Foundation — State Machine, Reducer, Gate Swap, Dev Replay, Error Boundary

**Deliverable:** OnboardingFlow mounts via Gate 5, renders a placeholder for each step with a Continue button, state persists to localStorage (uid-scoped) with resume working, dev-only replay button in Settings replays the flow, crashes are caught by the error boundary.

**Tasks:**
- [ ] Create `src/components/onboarding/` directory structure (root + `screens/` subdir + shared files)
- [ ] `lib/sanitizeUserText.js` — single exported function: `sanitizeUserText(s) → s.normalize('NFKC').replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u0000-\u001F\u007F]/g, '').trim().slice(0, 50)`. Used for displayName and anywhere a user-supplied string goes into Firestore or an LLM prompt.
- [ ] `onboardingState.js`:
  - Export constants `ONBOARDING_STATE_KEY = 'onboarding_state_v1'`, plus helpers that namespace per-uid: `keyFor(uid) → 'onboarding_state_v1_' + uid`
  - `loadState(uid)` — try/catch JSON.parse, validates shape (step is in STEPS, answers is object), returns null on any failure + logs `onboarding_resume_failed`
  - `saveState(uid, state)` — try/catch stringify+setItem; on `QuotaExceededError`, set in-memory `quotaBroken = true`, no-op subsequent saves, log via Firestore path (not localStorage)
  - `clearState(uid)` — remove the per-uid key; called by dev replay + error boundary + completion
- [ ] `lib/onboardingAnalytics.js` — single `logOnboardingEvent(name, meta)` function:
  - Writes `addDoc(collection(db, 'users', uid, 'onboarding_events'), {name, screen, timestamp: serverTimestamp(), meta})`
  - Swallows all errors in try/catch
  - No-op if no authenticated user
  - Uses a stable `logEvent` reference memoized via `useCallback([])` when consumed in components
- [ ] `OnboardingContext.jsx` — creates + exports a file-local React Context with shape `{answers, dispatch, logEvent}`. Also exports a `useOnboarding()` hook.
- [ ] `OnboardingErrorBoundary.jsx` — class component (React 19 still requires class for error boundaries). `getDerivedStateFromError` sets `hasError`. `componentDidCatch` clears local state + logs `onboarding_resume_failed` with `reason: 'render_crash'`. Falls back to a simple reload screen.
- [ ] `OnboardingFlow.jsx`:
  - Imports ALL 14 screen components statically (`import R01 from './screens/R01Welcome.jsx'`) — never inside `React.lazy`
  - Top-level lazy load happens in `main.jsx`; this file is the entry of that chunk
  - `useReducer(onboardingReducer, {step: 'r1', answers: DEFAULT_ANSWERS})`
  - `useEffect(() => { const hydrated = loadState(uid); if (hydrated) dispatch({type: 'HYDRATE', hydrated}); }, [uid])` — one-shot mount
  - Dispatch wrapper per the Technical Approach above (queueMicrotask → saveState)
  - Render `<OnboardingErrorBoundary><OnboardingContext.Provider value={ctxValue}><div key={step}>{SCREENS[step]}</div></OnboardingContext.Provider></OnboardingErrorBoundary>`
  - Back navigation checks `SCREENS[step].backDisabled` and no-ops if true
- [ ] `screens/OnboardingScreenShell.jsx` — shared layout:
  - Props: `{title, subtitle, ruphusLine, children, primaryCta, secondaryCta, backDisabled}`
  - Renders safe-area padding container (100dvh), top bar with back button (hidden if `backDisabled`), `RuphusSpeechBubble`, title, subtitle, children slot, CTA bar with `env(safe-area-inset-bottom)` padding
  - Uses `fonts.heading` for title, `fonts.body` for subtitle, `fonts.title` for Ruphus bubble
  - Every tap target ≥44pt, every button fires `haptic.selection()`
- [ ] `screens/R01Welcome.jsx` through `R13bNudge.jsx` — **placeholder implementations only** (headline + Continue button dispatch('ADVANCE', next: 'rX')). Phase 2-4 fills in the real UX.
- [ ] Swap `main.jsx` L18: `const OnboardingFlow = React.lazy(() => import('./components/onboarding/OnboardingFlow'))`. Module-scope, NOT inside `Root`.
- [ ] Update `main.jsx` Gate 5 to render `<OnboardingFlow/>` instead of `<OnboardingWizard>` (with existing Suspense fallback).
- [ ] Add `vite.config.js` manualChunks entry: `{onboarding: ['./src/components/onboarding']}` (or the equivalent glob-based config) so all 14 screens bundle into one chunk. Verify in Phase 5 that `dist/assets/onboarding-*.js` is <120KB gzipped.
- [ ] Extend `useUserProfile.jsx`:
  - Add `completeOnboarding(answers)` implementation (single atomic `setDoc` merge per the spec above)
  - Add a `resetOnboarding()` helper used by dev replay: `setDoc(profileRef, {onboardingComplete: false, onboardingAnswers: deleteField()}, {merge: true})`
- [ ] `SettingsPage.jsx`: insert new section between Notifications (~L823) and Account (~L849):
  ```jsx
  {import.meta.env.DEV && (
    <>
      <div style={sectionHeaderStyle}>Dev</div>
      <div style={groupStyle}>
        <button style={rowStyle} onClick={async () => {
          try {
            await resetOnboarding();
            clearState(user.uid);
            localStorage.removeItem('onboarding_scan_intent');  // belt + suspenders for any stale flags
            logOnboardingEvent('onboarding_dev_replay_triggered', {});
            window.location.reload();
          } catch (err) { console.error('replay failed', err); }
        }}>
          Replay onboarding
        </button>
      </div>
    </>
  )}
  ```
  Dev replay button explicitly serializes: update flag → clear local → reload. No race with `onSnapshot`.
- [ ] `RuphusSpeechBubble.jsx`:
  - Props: `{avatarSize = 64, children, variant = 'default'}`
  - Mirror `ProfessorRuphusSlideUp.jsx` L118-169 exactly: 14/14/14/4 radius, `C.amberBg`, 1px #E8D5A0 border, `fonts.title`, `lineHeight: 1.4`
  - Avatar + bubble layout (avatar left, bubble right)

**Success criteria:**
- Fresh install → OnboardingFlow mounts, reaches R1 placeholder
- Advance through all 14 placeholder screens via Continue buttons
- Close app mid-flow → reopen → resume at same step (same uid)
- Sign out + sign back in → resume picks up from the same uid's state (no cross-uid leakage)
- Dev replay button → clean restart from R1
- Analytics events land in Firestore `onboarding_events` subcollection
- Existing onboarded users (Gate 5 passthrough) unchanged
- Bundle: `dist/assets/onboarding-*.js` is ONE file, <120KB gzipped
- Error boundary catches a manually thrown error in any screen (add a `throw new Error('test')` in a dev-only button to verify)

---

#### Phase 2: Screens R1-R7 (Welcome → Personalized → Preferences)

**Deliverable:** The first 7 screens are visually complete with Ruphus warm-mentor copy, answers flow forward, R5 Tinder is atomic.

**Tasks:**
- [ ] `R01Welcome.jsx`:
  - Static hero: use `public/images/onboarding-welcome.webp` as MVP stand-in (154KB, within budget). Final art TODO.
  - Hero copy in `fonts.title`: "Brew coffee you're proud of"
  - Subtitle: "Let me show you around."
  - RuphusSpeechBubble: "I'm Professor Ruphus. Glad you're here. Give me a minute to learn how you brew — I'll take good care of you."
  - Single "Get started" CTA
  - `backDisabled: true`
- [ ] `R02Goal.jsx` — single-select:
  - Question: "What do you want to brew better?"
  - Options: V60 / Pour Over, Aeropress, French Press, Espresso, All of them
  - Ruphus: "Right — tell me what you're chasing. I'll tailor everything after this around it."
  - Each option dispatches `ADVANCE` with `{answersPatch: {goal: key}, next: 'r3'}`
- [ ] `R03Pain.jsx` — single-select (hybrid 3 practical + 1 aspirational):
  - Options: "My brews are inconsistent", "I forget which beans are fresh", "I want to actually taste what's in the cup", "I want to brew like a pro"
  - Ruphus: "No judgement here. Pick the one that bugs you most — I've got you."
- [ ] `R04SocialProof.jsx`:
  - 3 testimonials (placeholder strings, `TODO: pull from App Store reviews`)
  - Real star count + review count if >10 reviews; hide the numeric if <10
  - Ruphus: "I'm not the only one who believes in this — look what brewers are saying."
- [ ] `R05Tinder.jsx` — ATOMIC 5-card flow:
  - Internal `currentCardIndex` (0-4) and accumulating `swipes` array (local state, not committed to answers until complete)
  - Swipe gesture: plain `pointerdown/move/up` on each card, `transform: translateX(Xpx) rotate(Ydeg)` via `useRef` throttled with `requestAnimationFrame`. `touch-action: pan-y` on the container to preserve scroll. No framer-motion dependency.
  - Each swipe: update local state, fire `logEvent('onboarding_tinder_swipe', {card_id, direction})`
  - On 5th swipe: compute `palateChart = computePalateChart(swipes)`, dispatch `ADVANCE` with `{answersPatch: {tinderCards: swipes, palateChart}, next: 'r6'}` as a **single atomic transition** — never two dispatches
  - On mount, check `answers.tinderCards` — if present with length 5, immediately advance (handles resume). If partial (<5), reset local state to card 0.
  - Ruphus: "Quick round. Swipe right if it sounds like you, left if it doesn't. There's no wrong answer."
- [ ] `R06Personalized.jsx`:
  - Guard: if `answers.tinderCards.length !== 5` OR `!answers.palateChart`, dispatch `ADVANCE` back to `{next: 'r5'}` in a `useEffect`. Prevents resume into a half-state.
  - Mirror copy: template from R2+R3 answers
  - Feature cards: 3-4 Coffee Hub features chosen by an R2+R3 answer map (hardcoded dispatch table)
  - Ruphus: "Here's how I'll actually help — starting today."
  - **No fabricated statistics.**
- [ ] `R07Preferences.jsx`:
  - Grinder picker (reuse `GRINDERS` list from `OnboardingWizard.jsx` L6-14)
  - Brew method buttons (Aiden vs Hand Brew) with `brew-aiden.webp` / `brew-handbrew.webp`
  - **Display name input gated on `!user.displayName`**
  - On submit: run `sanitizeUserText(name)` before writing to `answers.preferences.displayName`
  - On mount, kick off `warmPaywallOfferings()` (single-flight guarded) so R9 doesn't have to wait
  - Ruphus: "Last bit. Tell me what you've got and I'll set up your kit."

**Success criteria:**
- Visual pass on iPhone 15 Pro (simulator + TestFlight)
- RuphusSpeechBubble renders consistently across all 7 screens
- R5 atomic: cannot reach R6 with partial swipes; resume into R5 with length<5 resets
- R7 display name input uses sanitized value on save
- Back nav works per single rule (all allowed except R1)
- R7 preload fires exactly once per session even with StrictMode double-invoke

---

#### Phase 3: Permission, Processing, Demo, Value Delivery (R8-R11)

**Deliverable:** Mid-flow interaction screens complete, preload race works, palate chart renders, demo scan plays.

**Tasks:**
- [ ] `R08PermissionPriming.jsx`:
  - Ruphus copy: "I'll need your camera to read the back labels on your bags. It's how I learn what you're drinking."
  - Single "Allow camera" CTA → dynamic import with timeout:
    ```js
    const mod = await Promise.race([
      import('@capacitor/camera'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('import_timeout')), 4000))
    ]).catch((err) => ({ error: err }));
    ```
    On failure/timeout: flag `answers.cameraPermission = 'unavailable'`, advance anyway
  - On permission result: `'granted'` → advance; `'denied'` → show follow-up Ruphus bubble, flag and advance; `'prompt'` or unexpected → treat as `'denied'`
  - If `!Capacitor.isNativePlatform()`: skip permission request entirely, auto-advance
- [ ] `R09Processing.jsx`:
  - CSS `@keyframes` progress bar animation, `transition: width 3000ms linear`
  - Rotating Ruphus quip every 1s: ["Studying your palate...", "Pouring your welcome cup...", "Warming up the timer...", "Almost ready."]
  - `useEffect` creates `const cancel = {canceled: false, hasAdvanced: false}`
  - `advance()` function: if `cancel.hasAdvanced` return; else set it true + dispatch ADVANCE
  - Both the 3s `setTimeout` AND the `visibilitychange → visible` handler call `advance()`
  - On `visibilitychange → visible`: if elapsed (via `performance.now()` captured at mount) >= 3000ms AND `window.__rcOfferingsCache` is truthy → `advance()`
  - On cleanup: `cancel.canceled = true` — no more state mutations
  - `backDisabled: true`
- [ ] `R10Demo.jsx`:
  - Use `public/images/onboarding/demo-scan.webp` (TODO asset, <500KB) — canned screenshot of a real scan result with an overlay fill-in animation (CSS keyframes)
  - No live Gemini call, no camera access
  - Copy: "Here's what a scan looks like. Just tap a bag and I'll read the label for you."
  - Single "Got it" CTA advances
  - `backDisabled: true`
- [ ] **Investigate extending `SpiderChart.jsx` with `range` and `labels` props** instead of forking. Read the file (~124 lines). If `axisLabels` + `range={[-1, 1]}` can be added in ~20 lines as props, extend. Otherwise create `OnboardingPalateChart.jsx` as a fork and document why in a header comment. Use `computePalateChart` output directly.
- [ ] `R11ValueDelivery.jsx`:
  - Render the (possibly extended) spider chart with `answers.palateChart`
  - Ruphus letter (~3-5 lines, warm mentor, templated):
    - Intro keyed by `answers.goal` (e.g., "You're a V60-curious brewer...")
    - Body keyed by `answers.pain` + primary palate axes
    - Close: "Ready to start? Scan your first bag and we'll get moving."
  - Primary CTA: `"Scan my first bag"` (label becomes `"Add my first bag"` if `answers.cameraPermission === 'denied' || 'unavailable'`) → dispatches `ANSWER` with `{postCompleteAction: answers.cameraPermission === 'granted' ? 'scan' : 'manual_add'}` then `ADVANCE` to R12
  - No secondary "Next" CTA — single clear action
- [ ] Add `requestIdleCallback` fallback for debounced saveState if observed writes >10 per transition in Phase 3 QA. Otherwise ship as-is.

**Success criteria:**
- R8 permission prompt on real TestFlight, denied + import-failure paths surface correctly, never blocks
- R9 preload completed by end of animation under normal network (<3s round trip)
- R9 no double-advance under visibility change + timer race (test by backgrounding at 2.5s, resuming at 5s)
- R10 plays without network, zero Gemini tokens consumed, asset <500KB
- R11 spider chart renders with meaningful variance per R5 outcome
- R11 letter references real R2+R3 answers
- R11 CTA writes `postCompleteAction` to `answers` (not localStorage)

---

#### Phase 4: Paywall + Trial Timeline + Maybe Later Nudge (R12-R13-R13b)

**Deliverable:** R12 trial timeline, R13 paywall (with hydration gate + disambiguated purchase/dismiss race + skip paths), R13b nudge, scan handoff via Firestore.

**Tasks:**
- [ ] `useOnboardingPaywall.js` hook — encapsulates R13's branching logic:
  ```js
  export function useOnboardingPaywall() {
    const { firestoreLoaded, rcHydrated, hasPro, hasUltra } = useSubscription();
    const { openPaywall } = usePaywall();
    const flowCompletedRef = useRef(false);
    const dismissTimerRef = useRef(null);

    const status = useMemo(() => {
      if (!firestoreLoaded || !rcHydrated) return 'hydrating';
      if (!Capacitor.isNativePlatform()) return 'skip_web';
      if (!isRevenueCatAvailable()) return 'skip_no_rc';
      if (hasPro || hasUltra) return 'skip_already_subscribed';
      return 'ready';
    }, [firestoreLoaded, rcHydrated, hasPro, hasUltra]);

    const openOnboardingPaywall = useCallback(() => {
      openPaywall({ feature: 'onboarding', promote: 'pro' });
    }, [openPaywall]);

    // Called by PaywallSheet's own close handler — AMBIGUOUS signal
    const onDismissAmbiguous = useCallback((onPurchased, onDismissed) => {
      if (flowCompletedRef.current) return;
      dismissTimerRef.current = setTimeout(() => {
        if (flowCompletedRef.current) return;
        flowCompletedRef.current = true;
        if (hasPro || hasUltra) onPurchased('paywall');
        else onDismissed('maybe_later');
      }, 500);
    }, [hasPro, hasUltra]);

    useEffect(() => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    }, []);

    return { status, openOnboardingPaywall, onDismissAmbiguous };
  }
  ```
- [ ] `PaywallSheet.jsx` — add `onboarding` entry to `CONTEXT_COPY`:
  ```js
  onboarding: {
    headline: "Want me to guide you all the way?",
    subtext: "Unlimited scans, the tasting coach, Aiden recipes — this is where we shake on it.",
  },
  ```
  **Verify the context key name** (`trigger` vs `feature`) by reading `src/hooks/usePaywall.jsx` first — the research agent flagged this as uncertain.
- [ ] `R12TrialTimeline.jsx`:
  - Three-step vertical timeline (Now / In 3 days / Into the future) with Ruphus copy per step
  - **Marketing consent checkbox**: "Send me brewing tips by email" + link to privacy policy
  - On `ADVANCE`, dispatch `ANSWER` with `{marketingConsent, marketingConsentDate: <client-side date>, marketingConsentVersion: 'onboarding-v1-2026-04-12'}` — the serverTimestamp happens in the final `completeOnboarding` call
  - **If marketingConsent is true on final commit**, `completeOnboarding` also does a single `setDoc(doc(db, 'emailList', uid), {email, displayName, signUpDate: serverTimestamp(), source: 'onboarding'}, {merge: true})` — matches existing `emailList` rules
- [ ] `R13Paywall.jsx`:
  - Uses `useOnboardingPaywall()`
  - Render tree:
    - `status === 'hydrating'` → small centered spinner (<300ms typical)
    - `status === 'skip_web' | 'skip_no_rc' | 'skip_already_subscribed'` → immediately dispatch `COMPLETE` with `completedVia: 'skipped_paywall'` and advance to R13b
    - `status === 'ready'` → mount PaywallSheet via `openOnboardingPaywall()` on first render only (guard with useEffect + ref)
  - Listen for PaywallSheet's close via a ref-captured `prevHasPro` — if `hasPro || hasUltra` transitions true, call `onPurchased → completeFlow('paywall')`; on sheet dismiss, call `onDismissAmbiguous(...)` which handles the 500ms disambiguation
  - `completeFlow(via)` = dispatch `COMPLETE` + call `completeOnboarding(answers with completedVia set)` + go to R13b UNLESS we actually purchased (purchased → go straight to home screen)
  - `backDisabled: true`
- [ ] `R13bNudge.jsx`:
  - Ruphus full-screen message with RuphusSpeechBubble
  - Copy: "No worries, brewer. Your first scan is on me — want to try it now?"
  - Primary CTA: "Yes, let's scan" (label switches to "Add a bag manually" if `cameraPermission !== 'granted'`)
    - Dispatches `ANSWER` with `{postCompleteAction: 'scan' | 'manual_add'}`
    - Calls `completeOnboarding(answers)` (atomic final write)
    - Fires `onboarding_nudge_accepted`
    - Flow unmounts, `App.jsx` reads `profile.onboardingAnswers.postCompleteAction` on mount and dispatches the bean add flow
  - Secondary CTA: "Maybe later"
    - Dispatches `ANSWER` with `{postCompleteAction: 'none'}`
    - Calls `completeOnboarding(answers)`
    - Flow unmounts, App.jsx mounts with no action to consume
  - `backDisabled: true`
- [ ] `App.jsx` changes:
  - On first mount inside Gate 6, read `profile?.onboardingAnswers?.postCompleteAction`
  - If `'scan'`: `setTab('inventory'); setPendingAddBean(true)`, then write `updateProfile({onboardingAnswers: {...profile.onboardingAnswers, postCompleteAction: 'none'}})` to clear
  - If `'manual_add'`: same but with a new prop on `AddBeanForm` that opens the manual-entry tab
  - If `'none'` or undefined: no-op
  - Matches the `apple_pending_name` pattern but Firestore-backed (durable across device switch)

**Success criteria:**
- Fresh user: R12 → R13 mounts → start trial → purchase → home screen with active Pro, NO R13b
- Fresh user: R12 → R13 → PaywallSheet dismiss → 500ms pause → if not purchased, R13b shows → tap Yes → home screen with bean scan open
- Fresh user: R12 → R13 → dismiss → Maybe later → home screen, no bean scan
- Re-install with active Pro: R12 → R13 skip_already_subscribed → R13b shows → continue
- Web platform: R12 → R13 skip_web → R13b
- Legacy build with no RC plugin: R12 → R13 skip_no_rc → R13b
- Offline: R13 renders via PaywallSheet's own fallback, Maybe later still works
- `onboardingAnswers.postCompleteAction` correctly drives App.jsx behavior across all 3 paths

---

#### Phase 5: Persistence, Analytics, Rollout, Cleanup

**Deliverable:** All writes land correctly, all 10 analytics events fire, bundle size validated, cutover ships to production, old wizard deleted.

**Tasks:**
- [ ] Verify all 10 analytics events instrumented at correct call sites
- [ ] Run `vite build` + check `dist/assets/onboarding-*.js` gzip size — MUST be <120KB. If over, split R10-R13 into a second chunk.
- [ ] Run `find public/images/onboarding -size +500k -print` — MUST return empty
- [ ] Run full TestFlight QA pass:
  - Fresh install (new Apple ID) → complete flow end-to-end via R13 purchase
  - Fresh install → dismiss → R13b → Yes (scan path)
  - Fresh install → dismiss → R13b → Maybe later (home path)
  - Fresh install → background at every screen → resume
  - Re-install on existing Apple ID with active Pro → skip path works
  - Existing user (already onboarded) → does NOT see new flow
  - Dev replay button → clean restart
  - Offline mode → flow completes, events queue, single atomic write lands on reconnect
- [ ] Delete `src/components/OnboardingWizard.jsx` after confirming main.jsx no longer imports it
- [ ] Update `CLAUDE.md` Key Conventions section to mention new onboarding flow + `onboardingAnswers` schema
- [ ] Update `lessons.md` with any Phase 3 findings about `getOfferings()` cache behavior on Capacitor iOS
- [ ] Ship: standard deploy path (Vercel + Capgo OTA in one push per /deploy skill)
- [ ] **Monitor for 48 hours post-ship:**
  - Firestore `onboarding_events` subcollection receives events (sample any user doc)
  - Trial-start rate via RevenueCat dashboard
  - `onboarding_resume_failed` rate (should be <1%)
  - `onboarding_complete_write_failed` rate (should be 0 — means rules are right)
  - No spike in PaywallSheet Apple rejections

**Rollback plan:** if `onboarding_complete_write_failed` rate >0 OR trial-start rate drops >20% relative to pre-cutover baseline within 48h, revert the new flow via `git revert` of the Phase 1 cutover commit and redeploy. Rules updates from Phase 0 stay (they're non-breaking additions).

---

## Alternative Approaches Considered

1. **Staged rollout via feature flag** — rejected per brainstorm. Solo-dev, small user base, flag complexity exceeds value.
2. **Anonymous Firebase auth first** — deferred to post-launch Phase 2 of onboarding work.
3. **SuperWall for paywall A/B** — deferred.
4. **React Router for 13 screens** — rejected, overkill. String enum + conditional render is simpler.
5. **Firebase Analytics SDK for events** — rejected, not installed, WKWebView-flaky. Firestore subcollection is lower risk.
6. **xstate for state management** — rejected, no prior usage, `useReducer` is sufficient for 13 screens.
7. **Screen 1 looping video for MVP** — deferred. Static hero ships first.
8. **Two-write `completeOnboarding`** — rejected after deepen-plan review. Single atomic `setDoc` is safer and simpler.
9. **Firebase Analytics → Firestore subcollection trade-off** — accepted. Firestore wins on reliability and offline behavior.
10. **`React.lazy` per screen** — rejected. Single chunk via static imports + Vite manualChunks.

## System-Wide Impact

### Interaction Graph (with fixes applied)

**Fresh install path:**
1. `main.jsx` Gate 5 renders `<OnboardingFlow>` (single lazy chunk, already module-scope lazy).
2. `OnboardingFlow` mounts inside `OnboardingErrorBoundary` + `OnboardingContext.Provider`; `useReducer` init; `useEffect` hydrates from `loadState(uid)`.
3. User navigates R1-R6 — every advance fires `onboarding_screen_view` (Firestore addDoc, swallowed on failure), dispatch wrapper calls `saveState(uid, newState)` via queueMicrotask.
4. R7 mount → `warmPaywallOfferings()` single-flight fires `getOfferings()`.
5. R8 — camera permission with dynamic import timeout; answer patch sets `cameraPermission`.
6. R9 — CSS animation + cancel token + `hasAdvanced` latch + visibility handling. Races `window.__rcOfferingsCache` population against 3s floor.
7. R10 — canned asset plays.
8. R11 — spider chart + letter + scan CTA writes `postCompleteAction` to answers (in memory).
9. R12 — trial timeline + marketing consent checkbox.
10. R13 — `useOnboardingPaywall` hydration gate; if ready, PaywallSheet mounts.
11. User purchases → `hasPro` flips true → `completeFlow('paywall')` fires `completeOnboarding(answers)` which does a single `setDoc(merge:true)`. If `marketingConsent === true`, also writes to `emailList/{uid}`.
12. React rerenders, Gate 5 sees `onboardingComplete === true`, renders `<App/>`.
13. App.jsx mounts, reads `profile.onboardingAnswers.postCompleteAction`, dispatches InventoryTab + AddBeanForm, then clears the field.

**Alternate paths:**
- Purchase failure → PaywallSheet dismiss → 500ms timer → `onDismissAmbiguous` resolves to `maybe_later` → R13b → ... (same terminal write)
- Already subscribed → `useOnboardingPaywall.status === 'skip_already_subscribed'` → R13b directly, `completedVia: 'skipped_paywall'`
- Web platform → `skip_web` → R13b
- Legacy build → `skip_no_rc` → R13b
- Render crash → `OnboardingErrorBoundary` → reload fallback, state cleared

### Error Propagation (updated)

- **localStorage read failure** → `loadState` returns null, flow starts at R1, `onboarding_resume_failed` fired.
- **localStorage quota** → `quotaBroken` flag set, saves no-op, flow continues in memory only, resume on next cold launch starts fresh.
- **`completeOnboarding` write rejection (rules misconfigured)** → single atomic write throws, user stays at Gate 5, re-enters flow on next open, `onboarding_complete_write_failed` logged.
- **Analytics write failure** → swallowed.
- **`getOfferings()` failure** → cache stores error, R9 still advances, R13 falls back to PaywallSheet's own fetch path with retry button.
- **Camera permission denied OR import timeout** → flagged, R11/R13b fall back to manual-add CTA.
- **RC plugin not installed** → `status: 'skip_no_rc'` → R13b, `completedVia: 'skipped_paywall'`.
- **Render crash** → error boundary catches, clears state, reload fallback.
- **Firestore offline** → writes queue in local cache, replay on reconnect.

### Data Integrity Notes (post-review)

- `onboardingAnswers` is additive top-level field, guarded by Phase 0 rules allowlist.
- `onboardingAnswers.preferences` is NOT stored — live prefs are written to `profile.preferences` in the same atomic `setDoc` call, no duplication or drift.
- Legacy users (`profile.onboardingComplete === true` from `migrateExistingUser`) will have `onboardingAnswers === undefined` forever. All consumers MUST optional-chain.
- `completedVia` enum: `'paywall' | 'maybe_later' | 'skipped_paywall'`.
- `postCompleteAction` enum: `'scan' | 'manual_add' | 'none'`, Firestore-backed, consumed + cleared by `App.jsx`.

### Security Notes (post-review)

- **displayName sanitization** via `sanitizeUserText()` before Firestore write. Prevents prompt injection into Ruphus's downstream LLM calls.
- **localStorage is uid-scoped** to prevent cross-user PII leakage on device handoff.
- **Marketing consent** writes `consentDate` + `consentVersion` + `emailList` mirror, complies with GDPR/CCPA/CAN-SPAM.
- **`onboarding_events` subcollection** immutable (no update/delete), size-capped, field-validated — prevents abuse.
- **Dev replay button** gated on `import.meta.env.DEV` (Vite dead-code-eliminates prod builds); verify post-build with `grep 'onboarding_dev_replay_triggered' dist/assets/*.js` returns empty.

## Acceptance Criteria

### Functional
- [ ] `main.jsx` providers hoisted above Gate 5 (Phase 0)
- [ ] Firestore rules updated with allowlist + subcollection block, deployed (Phase 0)
- [ ] `OnboardingFlow` replaces `OnboardingWizard` via Gate 5 import swap
- [ ] All 13+1 screens (R1-R13 + R13b) implemented per spec
- [ ] R5 atomic: all 5 cards required
- [ ] R7 `warmPaywallOfferings` single-flight preload
- [ ] R9 cancelation + hasAdvanced latch + visibility handling
- [ ] R11 spider chart + Ruphus letter + scan CTA writes postCompleteAction
- [ ] R13 hydration gate + 500ms dismiss disambiguation + useOnboardingPaywall hook
- [ ] `completeOnboarding` single atomic setDoc merge
- [ ] Error boundary catches and recovers from render crashes
- [ ] Dev replay button works and is tree-shaken from prod builds
- [ ] Resume from localStorage (uid-scoped) across app restarts
- [ ] 10 analytics events in Firestore subcollection
- [ ] `postCompleteAction` handoff via Firestore consumed + cleared by App.jsx
- [ ] Marketing consent writes `emailList/{uid}` with date + version
- [ ] Display name sanitized before Firestore write
- [ ] Back navigation: all allowed except R1/R9/R10/R13/R13b

### Non-Functional
- [ ] iPhone portrait only, safe-area + 100dvh compliant
- [ ] Tap targets ≥44pt, input fields ≥16px
- [ ] VoiceOver labels on every tappable
- [ ] Single lazy chunk, <120KB gzipped
- [ ] All image assets <500KB
- [ ] No fabricated statistics in copy
- [ ] No LLM calls during onboarding (all copy hardcoded)

### Quality Gates
- [ ] Phase 0 rules playground test passes
- [ ] TestFlight pass on fresh Apple ID → purchase path
- [ ] TestFlight pass on re-install with active Pro → skip path
- [ ] Offline completion verified
- [ ] `grep 'onboarding_dev_replay_triggered' dist/assets/*.js` is empty
- [ ] `vite build` onboarding chunk size within budget

## Success Metrics

- **Primary:** install-to-trial-start rate = (RC trials started within 24h) ÷ (unique installs)
- **Secondary:** onboarding completion rate = `r13_view` events ÷ `r1_view` events, target ≥75%
- **Activation:** day-1 bean scan rate = users who scan within 24h ÷ users who completed, target ≥50%; R13b nudge acceptances count
- **Per-screen funnel:** review after 200 fresh installs
- **Qualitative:** Tal feels the warm-mentor tone is sincere

### First experiment post-ship
Remove R12 (Trial Timeline) for 50% via a local flag. Validates Filtru pattern in coffee context.

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 0 provider hoist breaks gate 6 rendering | Low | High | Diff review, gate 6 smoke test before Phase 1 |
| Rules deploy propagation <60s window causes client writes to reject | Low | Medium | 60s wait explicit in Phase 0 |
| `getOfferings()` cache doesn't actually avoid loader on iOS Capacitor | Medium | High | Validate on real device in Phase 3 before Phase 4 |
| Hero/demo asset >500KB | Low | Medium | CI check in Phase 5 |
| `completeOnboarding` single write rejected by rules | Low | High | Phase 0 rules playground tests; `onboarding_complete_write_failed` telemetry post-ship |
| R9 visibility-change race fires twice | Low | Medium | hasAdvanced latch spec'd |
| R5 gesture handler doesn't feel right on device | Medium | Medium | Validate in Phase 2 on real device |
| Bundle size >120KB | Low | Medium | vite build check in Phase 5, split chunk if needed |
| Already-subscribed skip path misdetects on RC hydration delay | Low | Medium | rcHydrated gate spec'd |
| Dev replay button leaks to prod | Low | High | `import.meta.env.DEV` gate + grep check in Phase 5 |
| Ruphus warm-mentor tone lands as cloying | Medium | Medium | Tal dogfood before ship, iterate copy |

## Resource Requirements

- **Time:** ~3-4 days for one engineer full-time, 6 phases (Phase 0 is ~2 hours)
- **Assets needed:** R1 static hero (reuse `onboarding-welcome.webp` for MVP); R10 demo scan asset (new, <500KB)
- **External review:** Codex rescue per phase + final `/ce:review`
- **Testing:** TestFlight + fresh Apple ID + test Apple ID with active Pro

## Future Considerations

- **Phase 2 (post-launch):** anonymous Firebase auth + late sign-in
- **Phase 2:** R1 looping video
- **Phase 2:** Review prompt between R11 and R12
- **Phase 3:** SuperWall for remote A/B
- **Post-launch:** cross-axis palate coupling
- **Long-term:** Ruphus memory in chat tab referencing onboardingAnswers
- **Per-goal deep tracks** after onboarding

## Sources & References

### Origin Document
- **[docs/brainstorms/2026-04-12-onboarding-14-screen-rebuild-requirements.md](docs/brainstorms/2026-04-12-onboarding-14-screen-rebuild-requirements.md)** — all 21 requirements, hero angle, Ruphus tone, hard-swap rollout, Pro Annual preselection, etc.

### Internal References
- `src/main.jsx:18,129-148` — lazy import + Gate 5 + provider hoist target
- `src/hooks/useUserProfile.jsx:208-231` — `completeOnboarding` + `isOnboarded`
- `src/components/PaywallSheet.jsx:27-44,141-190` — `CONTEXT_COPY` + offerings
- `src/lib/revenuecat.js:116-135` — `getOfferings` entry
- `src/contexts/SubscriptionContext.jsx:54-131` — `hasPro`/`hasUltra` + `firestoreLoaded` + NEW `rcHydrated`
- `src/components/SpiderChart.jsx` — extend target (124 lines)
- `src/components/ProfessorRuphusSlideUp.jsx:118-169` — bubble styling source
- `src/components/QuickRecipeFlow.jsx:71-97` — camera permission pattern
- `src/tabs/InventoryTab.jsx:32-39` — `pendingAddBean` bridge
- `src/App.jsx:75` — postCompleteAction read site
- `src/hooks/useAuth.js:96` — apple_pending_name analog
- `firestore.rules:11-50` — rules update target
- `src/styles/theme.js` — tokens
- `.claude/rules/ios-layout.md` — iOS constraints
- `lessons.md` — asset size, Capgo, RC code 23, Firestore rules, React.lazy placement
- `docs/solutions/runtime-errors/react-lazy-inside-render-destroys-state.md` — critical rule
- `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md` — context (not applicable here since single-write is better)

### Key Decisions Carried Forward
1. Framework-aligned rebuild, 13 shipped screens
2. Warm-mentor Ruphus tone everywhere
3. Bean-scan magic moment hero (static Phase 1)
4. Pro Annual pre-selected default
5. Paywall preloaded (now at R7 mount, one screen earlier)
6. Soft "Maybe later" with scan-CTA nudge
7. Mid-flow resume via uid-scoped localStorage
8. Single atomic `completeOnboarding` write (changed from two-write)
9. Hard-swap rollout
10. First post-ship A/B: R12 Trial Timeline on vs. off

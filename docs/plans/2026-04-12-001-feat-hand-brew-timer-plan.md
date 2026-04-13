---
title: "feat: Hand-Brew Recipe Timer"
type: feat
status: active
date: 2026-04-12
deepened: 2026-04-12
---

# Hand-Brew Recipe Timer

Turn AI-generated hand-brew recipes into a follow-along timer with a circular progress ring, step-by-step guidance, haptic cues, and a post-brew bridge to the AI tasting coach.

## Enhancement Summary

**Deepened on:** 2026-04-12
**Research agents used:** wake-lock/background research, SVG ring animation, React 19 timer state + portal, Capacitor haptics + keep-awake, codebase context audit.

### Key Improvements (from research)
1. **Native keep-awake over Web Wake Lock on iOS.** `@capacitor-community/keep-awake` is significantly more reliable inside WKWebView than `navigator.wakeLock`. Adds a native plugin (TestFlight build required — cannot OTA via Capgo). Use Web Wake Lock only as the web fallback.
2. **rAF + direct ref mutation for the ring, not React state.** Mutate `strokeDashoffset` via ref inside the rAF tick to skip 60 reconciles/sec. Only the MM:SS digit readout goes through `setState`, throttled to ~4-10Hz.
3. **Three refs, one reducer.** Store `startedAtRef`, `pausedAccumMsRef`, `stepStartedAtRef` as refs (no re-render). Use `useReducer` (not xstate) for the 6 phases. Refs for source-of-truth math, state only for what renders.
4. **iOS DOES NOT kill apps for holding wake lock** — but it suspends JS within ~1-3s of backgrounding. Wake lock is only about screen dim prevention; backgrounding recovery is entirely a `Date.now()` delta problem, not a wake-lock problem.
5. **Mount the portal at App root, not inside HandBrewModal.** Putting it inside HandBrewModal risks unmount-on-tab-switch. Mount `<BrewTimerPortal />` directly in App.jsx gated by a context flag or lifted state, so the timer survives navigating between RotationTab/ChatTab if needed.
6. **`handleAutoSave()` stores bean id in state, doesn't return it.** The tasting bridge for QuickRecipeFlow ephemeral beans needs either a returned promise or a useEffect that watches `savedBeanId` to fire the bridge.

### New Considerations Discovered
- `visibilitychange` is flaky inside WKWebView; use Capacitor `App.appStateChange` on native, plain `visibilitychange` on web.
- SVG ring flicker on step-transition requires `useLayoutEffect` + a forced reflow (`void el.getBoundingClientRect()`) — can't be fixed with CSS transitions alone.
- The first Haptics call on iOS must come from a user-gesture chain, otherwise iOS silently ignores it. The Start Brew button tap is the user gesture that "warms up" subsequent haptic calls.
- Haptics web fallback silently no-ops (calls `navigator.vibrate()` if available). Never throws — no try/catch needed in the timer loop.
- Adding `@capacitor-community/keep-awake` is a native plugin change → **TestFlight build + native rebuild required**, cannot ship via Capgo OTA. If we want to ship Phase 2 via OTA only, we must stick to Web Wake Lock and accept degraded reliability on iOS.
- Codebase audit flagged concrete gaps vs. the original plan: `handBrewBean` not exposed from useHandBrew, `totalBrewTimeSeconds` doesn't exist, `haptic.heavy()` doesn't exist, no `bean` prop on HandBrewModal at any of the 4 call sites, no `pendingTastingBeanId` in App.jsx. All additive, no refactors.

## Overview

The HandBrewModal currently displays recipes as a static vertical timeline. Both competitors (Filtru, Bloom) are timer-first apps and this is our biggest feature gap. Adding an interactive timer turns our AI-generated recipes from "read and do" into "follow along," creating a daily-use retention hook that no competitor can match (because no one else generates personalized per-bean recipes).

Does NOT apply to Aiden recipes (Aiden is automatic, sends recipe to the machine).

### Design Reference

**Primary model: Bloom Coffee Timer.** Clean, warm, light palette. Single circular progress ring. Counts up. Horizontal scrolling step pills. Simple controls.

**Steal from Filtru:** 3-2-1 countdown before brew starts. Skip the data-heavy elements (Bluetooth scale, flow rate, tenth-second precision, pouring trend graphs, multi-tab post-brew analysis).

## Problem Statement

Users receive a rich, AI-generated pour-over recipe with timed steps (bloom at 0:00, first pour at 0:30, etc.) but must manually track timing with a separate timer or wall clock. This breaks immersion and makes the recipes feel like reference material rather than a guided experience.

## Proposed Solution

Add a "Start Brew" button to HandBrewModal that transitions the recipe view into a full-screen timer. A 3-2-1 countdown kicks off, then the circular ring tracks progress through each step. On completion, offer to launch the AI tasting coach for that bean.

### Architecture

**New files:**

| File | Purpose |
|------|---------|
| `src/components/BrewTimer.jsx` | Full-screen timer UI (ring, step pills, controls, completion) |
| `src/hooks/useBrewTimer.js` | Timer state machine (parse steps, elapsed tracking, step management) |

**Modified files:**

| File | Change |
|------|--------|
| `src/components/HandBrewModal.jsx` | Add "Start Brew" button, pass `bean` prop, conditionally render BrewTimer |
| `src/hooks/useHandBrew.js` | Expose `handBrewBean` in return value for prop threading |
| `src/lib/handbrew.js` | Add `totalBrewTime` normalization to `repairHandBrewRecipe()`, add step time validation |
| `src/lib/haptics.js` | Add `haptic.heavy()` for step transitions |
| `src/components/QuickRecipeFlow.jsx` | Pass `bean` through to HandBrewModal |
| `src/App.jsx` | Add `pendingTastingBeanId` state for cross-tab tasting bridge |
| `src/tabs/TastingTab.jsx` | Consume `pendingTastingBeanId` to auto-start coach for a specific bean |
| All HandBrewModal call sites | Thread `bean` prop (RotationTab, InventoryTab, ChatTab) |

### Timer State Machine

```
IDLE -> COUNTDOWN (3,2,1) -> RUNNING -> PAUSED -> RUNNING -> ... -> STEP_TRANSITION -> RUNNING -> ... -> DONE
```

States:
- `idle`: Recipe displayed, "Start Brew" button visible
- `countdown`: 3-2-1 pre-brew countdown (large animated digits, like Filtru)
- `running`: Timer active, ring filling, current step highlighted
- `paused`: Timer paused, can resume or stop
- `stepTransition`: Heavy haptic fires, step pill gets checkmark, next step slides in (auto-advances after ~1s)
- `done`: All steps complete. Success haptic + completion screen with bridge to tasting coach.

### Prerequisites: Recipe Data Hardening

Before the timer can safely consume recipe data, two hardening steps are needed in `handbrew.js`:

**1. Normalize `totalBrewTime` in `repairHandBrewRecipe()`:**
GPT sometimes returns ranges ("2:30-3:00") or descriptive values ("about 3 minutes"). Add a `totalBrewTimeSeconds` numeric field:
- Parse the first M:SS match found in the string
- If a range, use the midpoint
- If unparseable, compute as last step time + average step duration
- Store as `recipe.totalBrewTimeSeconds` alongside the display string

**2. Validate `step.time` format:**
Add validation to ensure every `step.time` matches M:SS or MM:SS format and times are ascending. If a step has an invalid time, attempt repair (infer from position and totalBrewTime). If unrecoverable, mark the recipe as timer-incompatible.

**3. Validate cached recipes on "Start Brew" tap:**
Run `parseTimeString` validation on all steps. If any step fails, show a toast with an offer to regenerate the recipe rather than starting a broken timer.

### Recipe Step Parsing

The `step.time` field is a **free-form string** from GPT output (e.g., "0:00", "0:30", "1:00"). After hardening (above), the timer:

1. Parses "M:SS" strings into seconds: `parseTimeString("1:30") -> 90`
2. Computes duration per step as delta between consecutive `step.time` values
3. Uses `totalBrewTimeSeconds` for the last step's duration
4. Falls back gracefully if any step is malformed (skip timer, show static recipe)

```js
// Example recipe steps -> timer steps
[
  { time: "0:00", action: "Bloom: pour 40g", waterTotal: 40 },     // duration: 30s (delta to next)
  { time: "0:30", action: "First pour to 120g", waterTotal: 120 },  // duration: 30s
  { time: "1:00", action: "Second pour to 200g", waterTotal: 200 }, // duration: 30s
  { time: "1:30", action: "Final pour to 250g", waterTotal: 250 },  // duration: 90s (to totalBrewTime 3:00)
]
```

### Timer UI (Bloom-inspired)

BrewTimer renders as a **full-viewport overlay via its own portal**, separate from the HandBrewModal's `<Modal>` component. This avoids the backdrop-click-to-dismiss problem (Modal's backdrop `onClick` would destroy a mid-brew timer). BrewTimer manages its own safe areas and close confirmation.

**Layout (top to bottom):**

1. **Header bar**: Bean name + photo thumbnail on left, X close button on right (with confirmation dialog if timer is running). Recipe name centered (e.g., "Hoffmann V60").

2. **Circular progress ring** (the centerpiece):
   - Large circle with a single brown/accent arc that fills clockwise as the step progresses
   - A small dot marker at the leading edge of the arc (like Bloom)
   - **Elapsed time** in large bold digits centered inside the ring, counting UP (e.g., "0:45", "1:15", "1:56")
   - **Total brew time** in smaller gray text below the elapsed time (e.g., "3:30")
   - Ring resets per step (fills from 0% to 100% for each step's duration)

3. **Current step name**: Large bold text below the ring (e.g., "Bloom", "Main Pour", "Final Pour", "Drawdown")

4. **Step instruction**: Muted text below step name (e.g., "Pour 30g of water, swirl the dripper gently to saturate"). Include water target prominently.

5. **Horizontal scrolling step pills** (bottom area):
   - Row of pill-shaped chips, horizontally scrollable
   - Current step: highlighted with accent background, shows "0:30 left"
   - Completed steps: green checkmark icon, shows "@ 0:00" (the time it started)
   - Upcoming steps: muted text, shows "@ 1:15" (when it will start)
   - Auto-scrolls to keep current step visible

6. **Control buttons** (bottom):
   - **Rewind** (left): Go back to previous step (see Rewind Semantics below)
   - **Pause / Skip** (center, large): Toggles between pause and resume. Label changes contextually.
   - **Skip Forward** (right): Jump to next step early (e.g., bloom finished early). Fires heavy haptic (step transition).

### 3-2-1 Countdown

Before the timer starts running:
- Full-screen overlay with large animated digit (3... 2... 1...)
- Each digit gets a light haptic
- After "1", timer begins and ring starts filling
- Gives user a moment to position kettle

### Completion Screen

When all steps finish:
- Ring fills to 100%, turns fully colored
- Success haptic fires
- Total actual brew time displayed prominently
- Two CTAs:
  - **"Start Tasting Session"** (primary, accent color): Sets `pendingTastingBeanId` in App.jsx, switches to Tasting tab, TastingTab auto-starts chat mode with this bean pre-selected. For QuickRecipeFlow ephemeral beans, auto-save the bean first via `handleAutoSave`.
  - **"Done"** (secondary): Returns to the recipe view

### Tasting Bridge (Cross-Tab Navigation)

The "Start Tasting Session" CTA requires a new cross-tab pattern in App.jsx, following the existing `pendingAddBean` pattern:

1. BrewTimer calls `app.startTastingSession(beanId)` (callback passed as prop)
2. App.jsx sets `pendingTastingBeanId` state and calls `setTab('tasting')`
3. TastingTab consumes `pendingTastingBeanId`, pre-selects the bean, calls `setMode('chat')` to start the coach
4. TastingTab clears `pendingTastingBeanId` after consuming it

For QuickRecipeFlow: the bean is ephemeral (no Firestore ID). Call `handleAutoSave()` first to persist it, then use the returned bean ID for the tasting bridge.

### Haptic Cues

- `haptic.light()` on each 3-2-1 countdown digit
- `haptic.heavy()` at each step transition, including skip forward (new, needs to be added to haptics.js)
- `haptic.light()` on pause/resume tap
- `haptic.success()` when brew completes

### Screen Wake Lock

Use `navigator.wakeLock.request('screen')` to prevent screen from sleeping during active brew. 

Release on: pause, stop, done, AND app backgrounding (listen to `visibilitychange` or Capacitor `appStateChange`). Re-acquire on foreground resume if timer is still in `running` state. Without this, iOS may terminate the app for holding a wake lock while backgrounded.

Gate behind `'wakeLock' in navigator` feature detection.

### Grind Display

Per institutional learning: any grind size display in the timer header must use `GRINDER_LABELS` from `brewMethods.js` and respect `preferences.grindSizeDisplay` toggle. Use `formatHandBrewGrind()` helper.

## Technical Considerations

### Counting Up, Not Down
The timer counts UP (elapsed time) like Bloom, not down. This is more natural for pour-over: you're tracking "where am I in the brew" not "how many seconds left." The step pills show remaining time for the current step, but the main display is elapsed.

### Rewind Semantics
Rewind goes back to the previous step. The overall elapsed clock **keeps ticking** (wall-clock time). The ring resets for the re-entered step. Completion screen shows total wall-clock time (including any rewind overlap). This avoids breaking the "counts up" model.

### Background Behavior
When the app goes to background on iOS, `setInterval` pauses. On resume, compute elapsed time from `Date.now()` delta rather than counting ticks. Store `startedAt` timestamp per step.

**Background overshoot:** If the user backgrounds for longer than the remaining brew time, auto-advance through all remaining steps (marking each complete with checkmarks in the pills) and land on the completion screen. Show a subtle note: "Your brew likely finished while the app was in the background."

### Single-Step Recipes
If GPT returns a recipe with only 1 step (e.g., immersion-style "pour and wait"), the timer works but: no step transitions, no step pills to scroll, no skip/rewind targets. The single ring fills for the entire brew duration. This is fine.

### Full-Screen Portal (Not Modal)
BrewTimer renders via `createPortal` to `document.body`, NOT inside the HandBrewModal's `<Modal>` component. This prevents accidental backdrop-tap dismissal mid-brew. BrewTimer handles its own safe areas (iOS notch) and close confirmation.

### State Preservation
Per institutional learning: `React.lazy()` must be at module scope if used. Timer losing state on re-render = countdown reset. Use refs for the interval and startedAt timestamp to avoid stale closure issues.

### Platform Gating
Per institutional learning: haptics and wake lock must be gated with `Capacitor.isNativePlatform()` or feature detection. Timer must work on web too (just without haptics).

### No New API Calls
Timer is purely client-side. No new server endpoints needed. Recipe data is already available from HandBrewModal props. The only external interaction is the optional "Start Tasting Session" CTA which uses the existing tasting coach flow.

### Ring Animation
Use SVG `<circle>` with `stroke-dasharray`/`stroke-dashoffset` for the progress ring. SVG is more reliable cross-browser and easier to animate than `conic-gradient`. Update via `requestAnimationFrame` for smooth ring progression (not tied to the 1-second interval).

## Research Insights (Deepening 2026-04-12)

### Wake Lock — Branching Pattern + Hook

**Decision: branch on platform.** Use `@capacitor-community/keep-awake` on native iOS, `navigator.wakeLock` as the web fallback. The native plugin calls `UIApplication.shared.isIdleTimerDisabled = true` which is significantly more reliable inside WKWebView than the Web Wake Lock API (which has a history of releasing on tab blur / visibility change inside WKWebView).

**Install (native plugin — TestFlight build required):**
```bash
npm i @capacitor-community/keep-awake
npx cap sync
```

**Branching helper:**
```js
// src/lib/wakeLock.js
import { Capacitor } from '@capacitor/core';

let sentinel = null;

export async function acquireWake() {
  if (Capacitor.isNativePlatform()) {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await KeepAwake.keepAwake();
    return;
  }
  if (!('wakeLock' in navigator)) return;
  if (document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch (err) {
    if (err?.name !== 'NotAllowedError') console.warn('wakeLock:', err);
  }
}

export async function releaseWake() {
  if (Capacitor.isNativePlatform()) {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await KeepAwake.allowSleep();
    return;
  }
  if (sentinel) { try { await sentinel.release(); } catch {} sentinel = null; }
}
```

**`useWakeLock(active)` hook:** acquires on mount-when-active, releases on unmount/inactive, re-acquires on foreground via `visibilitychange` (web) AND `App.appStateChange` (native). First acquisition happens inside the Start Brew user-gesture chain, so subsequent re-acquisitions on visibility change do not need a gesture (iOS Safari 16.4+ complies with the spec here).

**iOS truth:** iOS does NOT terminate an app for holding wake lock while backgrounded. What iOS *does* is suspend JS within ~1-3 seconds of background, so the timer loop stops regardless of wake lock state. Backgrounding survival is entirely a `Date.now()` delta problem on resume, NOT a wake-lock problem.

**Shipping caveat:** adding `@capacitor-community/keep-awake` is a **native plugin change**. Ships via TestFlight, cannot be delivered as a Capgo OTA update. If Phase 2 must ship OTA-only, stick with `navigator.wakeLock` on both platforms and accept degraded iOS reliability until the next native build.

References: MDN Screen Wake Lock API, caniuse wake-lock (~94.6% global), https://github.com/capacitor-community/keep-awake, Capacitor App API docs (`appStateChange`).

### SVG Ring Animation — rAF + Direct Ref Mutation

**Geometry (12 o'clock start, clockwise fill):**
```js
const SIZE = 240, STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

// progress is 0..1
<circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none"
        stroke={theme.accent} strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - progress)}
        transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`} />
```

**Tick loop — ignore rAF's timestamp, always use `Date.now()`:**
```js
// useStepProgress(startedAt, durationMs, paused)
const tick = () => {
  const elapsed = Date.now() - startedAt;         // wall clock, NOT rAF arg
  const p = Math.min(1, Math.max(0, elapsed / durationMs));
  // Mutate the ring ref directly — skip setState
  if (ringRef.current) {
    ringRef.current.style.strokeDashoffset = String(C * (1 - p));
  }
  if (p < 1) rafRef.current = requestAnimationFrame(tick);
};
```

Why direct ref mutation instead of `setState`: 60fps × reconciliation is wasteful. Ring only needs the SVG attribute to change. A separate throttled effect updates the MM:SS readout at ~4-10Hz via `setState`. iOS WebView handles direct SVG attribute mutation fine; one stroke update per frame is GPU-composited.

**Leading-edge dot:**
```js
const angle = progress * 2 * Math.PI - Math.PI / 2;
const dotX = SIZE/2 + R * Math.cos(angle);
const dotY = SIZE/2 + R * Math.sin(angle);
<circle cx={dotX} cy={dotY} r={STROKE * 0.75} fill="#fff" />
```

**Flicker-free step reset** — on step boundary, synchronously reset offset in `useLayoutEffect` and force a reflow so the browser never paints a frame with the old color at offset 0:
```js
useLayoutEffect(() => {
  ringRef.current.style.transition = 'none';
  ringRef.current.style.strokeDashoffset = String(C);
  void ringRef.current.getBoundingClientRect(); // force reflow
  ringRef.current.style.transition = '';
}, [stepIndex]);
```

**Pitfalls to avoid:**
- Don't use a CSS `transition` on `strokeDashoffset` — it fights the rAF-driven updates.
- Don't animate `r`, `cx`, or `cy` — only `strokeDashoffset`. Anything else triggers SVG layout.
- Don't skip the `Math.min(1, ...)` clamp — rAF can overshoot by one frame and produce a negative offset (WebKit renders as a full-circle gap).
- Don't apply `will-change: transform` to SVG in WKWebView — can trigger layer explosion on iOS 17+.

References: react-circular-progressbar source (minimal "just render the offset" approach), framer-motion arc animations, MDN on restarting CSS animations via forced reflow.

### Timer State — useReducer + Refs + Portal at App Root

**State / ref split:**
- **State (triggers render):** `phase`, `stepIndex`, `displayMs` (for the numeric readout), `stepMs`.
- **Refs (no render, source of truth):** `startedAtRef`, `pausedAccumMsRef`, `pauseStartedAtRef`, `stepStartedAtRef`.

Storing `startedAt` in state would cause re-renders on every pause/resume and risk stale closures inside the tick callback. React 19 docs explicitly call refs "escape hatches for values that don't affect render" — this is the canonical use case.

**Reducer over xstate.** 6 phases × ~6 actions is well below the threshold where a dedicated state-machine library earns its weight. Plain `useReducer` with a discriminated action union:
```js
// phases: 'idle' | 'countdown' | 'running' | 'paused' | 'stepTransition' | 'done'
function reducer(s, a) {
  switch (a.type) {
    case 'START':          return { ...s, phase: 'countdown' };
    case 'COUNTDOWN_DONE': return { ...s, phase: 'running', stepIndex: 0 };
    case 'PAUSE':          return { ...s, phase: 'paused' };
    case 'RESUME':         return { ...s, phase: 'running' };
    case 'NEXT_STEP':      return { ...s, phase: 'stepTransition', stepIndex: s.stepIndex + 1 };
    case 'REWIND':         return { ...s, stepIndex: Math.max(0, s.stepIndex - 1) };
    case 'FINISH':         return { ...s, phase: 'done' };
  }
}
```

**Backgrounding math (the only thing that matters):**
```
globalElapsed = (Date.now() - startedAtRef.current) - pausedAccumMsRef.current
// On PAUSE:  pauseStartedAtRef.current = Date.now()
// On RESUME: pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current
```
`Date.now()` is wall-clock, immune to iOS JS suspension. On foreground resume, the next tick computes the correct elapsed instantly. Also wire `visibilitychange` to force an immediate recompute so the UI doesn't wait up to 100ms for the next interval fire.

**Rewind with two time coordinates:** keep global elapsed (`startedAtRef`) untouched; reset only step elapsed by updating `stepStartedAtRef`. The ring renders `stepElapsed`, the "total brew time" HUD renders `globalElapsed`. They are independent — rewind only touches `stepStartedAtRef`.

**Interval cadence:** 100ms via Dan Abramov's `useInterval` pattern (ref-stable callback so the interval doesn't recreate on re-render). The ring runs at 60fps via rAF (separate loop); the readout runs at 10Hz via setInterval. Two independent loops, each matched to its own frequency need.

**Portal mounting — at App root, NOT inside HandBrewModal.** If the portal parent unmounts (e.g., HandBrewModal closes, tab switch), refs and timer state are lost. Mount the portal from App.jsx, gated by a state flag that survives tab switches:
```jsx
// App.jsx
{timerOpen && createPortal(
  <BrewTimerOverlay steps={activeRecipe.steps} bean={activeBean} />,
  document.body
)}
```
Context or lifted state holds `timerOpen` + the active recipe + active bean. `Start Brew` in HandBrewModal just flips `timerOpen = true`.

**Portal event bubbling gotcha:** `createPortal` bubbles events through the React tree, not the DOM tree. A click inside the portal fires handlers on the React parent — call `e.stopPropagation()` at the portal root if the parent has outside-click handlers. Safe-area insets (`env(safe-area-inset-*)`) work identically in portaled children, just ensure `<meta name="viewport" content="viewport-fit=cover">`.

References: overreacted.io `useInterval`, React 19 docs (useRef, useReducer, react-dom/createPortal), web.dev Page Lifecycle API.

### Capacitor Haptics — Canonical API + Platform Gating

**Install:** already on `@capacitor/haptics` per existing codebase. Confirm the canonical API is `Haptics.impact({ style: ImpactStyle.Heavy })` — there is no shortcut `Haptics.heavy()`. Any legacy examples showing `Haptics.heavy()` are non-standard.

**Add to `src/lib/haptics.js`:**
```js
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const haptic = {
  // existing: light(), medium(), selection()
  async heavy() {
    if (!Capacitor.isNativePlatform()) return;
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
  },
  async success() {
    if (!Capacitor.isNativePlatform()) return;
    try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
  },
};
```

**iOS specifics:**
- Requires physical device with Taptic Engine (iPhone 7+). Simulator is silent.
- No Info.plist entries, no permissions, no entitlements.
- First haptic call on iOS should be inside a user-gesture chain. The Start Brew button tap warms this up for all subsequent calls during the brew.
- Web fallback silently no-ops (calls `navigator.vibrate()` if available). Never throws — no try/catch needed around every call in the timer loop.

### Codebase Audit — Concrete Gaps vs. Plan Assumptions

The codebase agent read every file the plan references and flagged these additive changes (no refactors needed; all foundational patterns are already in place and proven):

| File | Gap | Fix |
|---|---|---|
| `src/hooks/useHandBrew.js` (line ~22 state, ~104 return) | `handBrewBean` stored locally but NOT exposed in return object | Add it to the return |
| `src/lib/handbrew.js` (`repairHandBrewRecipe`, ~line 140-189) | No `totalBrewTimeSeconds` field exists anywhere | Parse `totalBrewTime` string, store numeric alongside |
| `src/lib/haptics.js` | No `heavy()` method; also no `success()` | Add both per snippet above |
| `src/components/HandBrewModal.jsx` (props ~line 36) | No `bean` prop | Add it; thread from 4 call sites |
| 4 call sites: RotationTab (~line 289), InventoryTab (~line 200), ChatTab (~line 608), QuickRecipeFlow (~line 365) | None pass `bean` to HandBrewModal | Thread `bean={handBrew.handBrewBean}` |
| `src/App.jsx` (after `pendingAddBean` at ~line 50) | No `pendingTastingBeanId` state | Mirror `pendingAddBean` pattern exactly |
| `src/tabs/TastingTab.jsx` (~line 157 `setMode('chat')`) | Doesn't consume any pending bean id | Accept prop, pre-select + setMode + clear on consume |
| `src/components/QuickRecipeFlow.jsx` (`handleAutoSave` ~line 230) | Stores bean id in `savedBeanId` state — does NOT return it from the function | Either return the id from `handleAutoSave` for the tasting bridge, or use a `useEffect` on `savedBeanId` to fire the bridge after save completes |
| `src/components/Modal.jsx` (~line 71) | Confirmed: backdrop `onClick={onClose}` — this is why BrewTimer must use its own portal, not nest inside `<Modal>` | Render BrewTimer via its own `createPortal(..., document.body)` mounted from App.jsx |
| `src/styles/theme.js` | `C.accent = "#B07540"` (caramel) is the ring fill color. No dark-mode tokens — app is light-palette only | Use `C.accent` for ring, `C.bg` / `C.text` for overlay background and typography |

**No refactors required.** Every change is additive, and each pattern the plan leans on (`pendingAddBean` cross-tab navigation, Modal portal, haptics platform gating) is already proven in the codebase.

## Acceptance Criteria

- [ ] "Start Brew" button appears on HandBrewModal when recipe has valid, parseable steps
- [ ] 3-2-1 countdown animates before timer starts, with light haptic on each digit
- [ ] Circular progress ring fills clockwise per step (SVG arc)
- [ ] Time counts UP (elapsed) with total brew time displayed below
- [ ] Current step name and instruction displayed prominently below ring
- [ ] Water target shown clearly in step instruction
- [ ] Horizontal scrolling step pills show completed (checkmark), current (time left), upcoming (start time)
- [ ] Rewind button goes back to previous step (elapsed clock keeps ticking)
- [ ] Skip forward button advances to next step early (heavy haptic fires)
- [ ] Pause/Resume works correctly (timer pauses, ring stops, resumes from same point)
- [ ] X button with confirmation dialog exits timer if running
- [ ] Heavy haptic fires at each step transition
- [ ] Success haptic fires on brew completion
- [ ] Completion screen offers "Start Tasting Session" (bridges to AI tasting coach via pendingTastingBeanId)
- [ ] Tasting bridge works for QuickRecipeFlow ephemeral beans (auto-saves first)
- [ ] Timer survives app backgrounding (recalculates elapsed on resume via Date.now delta)
- [ ] Background overshoot auto-advances to completion screen
- [ ] Screen wake lock acquired during running, released on pause/stop/done/background
- [ ] Wake lock re-acquired on foreground resume if timer is running
- [ ] Works on web (no haptics, no wake lock, timer still functions)
- [ ] Grind display respects user's grindSizeDisplay preference
- [ ] Bean name/photo visible in timer header
- [ ] Cached recipes validated before timer starts (malformed steps show regenerate offer)
- [ ] `totalBrewTime` normalized to seconds in `repairHandBrewRecipe()`
- [ ] BrewTimer renders as portal (not inside Modal) to prevent backdrop-dismiss
- [ ] QuickRecipeFlow still works with timer capability
- [ ] No timer functionality added to AidenModal (Aiden is automatic)

## Implementation Phases

### Phase 0: Recipe Data Hardening (prerequisite)
- Add `totalBrewTimeSeconds` normalization to `repairHandBrewRecipe()` in `handbrew.js`
- Add `step.time` format validation (M:SS ascending)
- Expose `handBrewBean` from `useHandBrew` hook
- Thread `bean` prop to HandBrewModal across all call sites
- Estimated: 0.5 day

### Phase 1: Core Timer (MVP)
- `useBrewTimer.js` hook: parse steps, elapsed tracking via Date.now, state machine
- `BrewTimer.jsx`: full-screen portal, circular SVG ring, step display, controls (pause/skip/rewind)
- `HandBrewModal.jsx`: "Start Brew" button, conditional render of BrewTimer
- `haptics.js`: add `heavy()` method
- Step pills (horizontal scrolling, checkmarks, time remaining)
- 3-2-1 countdown overlay
- Estimated: 2-3 days

### Phase 2: Polish + Tasting Bridge
- Screen wake lock (with background release/re-acquire)
- Background resume (Date.now delta catch-up, overshoot handling)
- Ring animation smoothing (requestAnimationFrame)
- Completion screen with "Start Tasting Session" bridge
- `pendingTastingBeanId` pattern in App.jsx + TastingTab
- QuickRecipeFlow auto-save for ephemeral beans before tasting bridge
- Bean name/photo in timer header
- Close confirmation dialog
- Estimated: 1-2 days

### Phase 3: Future (not in scope)
- Audio cues at step transitions
- Live Activities / Dynamic Island (requires native Swift widget extension)
- Brew logging (save completed brew with actual timing data to Firestore)
- Brew history / streak tracking
- Post-brew quick assessment sliders (Bloom-style sour/bitter, weak/strong)
- Caffeine tracking

## Sources & References

- Competitive audit: `docs/data/2026-04-12-competitive-audit-filtru-bloom.md`
- Bloom timer video: `~/Downloads/ScreenRecording_04-12-2026 08-56-19_1.MP4` (primary design reference)
- Filtru timer video: `~/Downloads/ScreenRecording_04-12-2026 08-58-47_1.MP4` (3-2-1 countdown reference)
- HandBrewModal: `src/components/HandBrewModal.jsx`
- Recipe generation: `src/lib/handbrew.js` (step data structure at line 258-273)
- useHandBrew hook: `src/hooks/useHandBrew.js` (handBrewBean not currently exposed)
- Haptics module: `src/lib/haptics.js`
- App shell: `src/App.jsx` (cross-tab navigation pattern at pendingAddBean)
- TastingTab: `src/tabs/TastingTab.jsx` (setMode('chat') at line 157)
- QuickRecipeFlow: `src/components/QuickRecipeFlow.jsx` (handleAutoSave at line 230)
- Modal: `src/components/Modal.jsx` (backdrop onClick dismiss, reason to use portal instead)
- Grind display: `docs/solutions/logic-errors/grind-size-display-toggle-unwired.md`
- State preservation: `docs/solutions/runtime-errors/react-lazy-inside-render-destroys-state.md`
- Platform gating: `docs/solutions/logic-errors/share-card-capture-retry-null-safety.md`

---
title: Coach Marks Spotlight Tour
type: feat
status: active
date: 2026-04-19
deepened: 2026-04-19
---

# Coach Marks Spotlight Tour

## Enhancement Summary

**Deepened on:** 2026-04-19
**Agents used:** SVG spotlight research, iOS design patterns, architecture review, performance review, code simplicity review, solution docs analysis

### Key Improvements from Research
1. **SVG `fill-rule="evenodd"` path** instead of `<mask>` element (vector-based, GPU-friendly, pointer-events handled naturally)
2. **Cross-fade transitions** instead of SVG rect animation (rect geometry isn't GPU-accelerated)
3. **MutationObserver** instead of rAF polling for lazy tab elements (event-driven, no polling loop)
4. **Drop `backdropFilter: blur()`** on the SVG overlay (double GPU tax with SVG mask on iOS)
5. **Lazy initializer** for `tourActive` state (fixes race condition with `postCompleteAction`)
6. **Reduced to 6 steps** (merge welcome into step 1, drop archive step)
7. **Animations inline in global.css** (no separate tour.css file)
8. **`useLayoutEffect`** for tooltip measurement (prevents flicker per React docs)
9. **`inert` attribute** on `#root` during tour (blocks VoiceOver from background content)

### Critical Bugs Found
- **tourActive race condition**: `useState(false)` + mount `useEffect` creates a window where `postCompleteAction` fires before tour starts. Fix: lazy initializer.
- **Pointer-events gap**: SVG masks control rendering, not interaction. The `fill-rule="evenodd"` approach solves this naturally (cutout has no fill, events fall through).

## Context

New users complete the 13-screen onboarding flow (preference collection + paywall) but never learn how the app actually works. Features like bag scanning, Aiden recipe push, and the tasting coach are invisible until discovered by accident. This adds a one-time guided spotlight tour that runs immediately after onboarding, walking through the app's core features across all 5 tabs.

Research grounding (last30days 2026-04-19):
- UserGuiding + UXCam 2026 best practices: limit tours to 5-7 steps, one nudge at a time
- Most users skip coach marks when front-loaded as passive tooltips. Action-oriented copy + explicit "Got it" button performs better than tap-anywhere dismiss
- Apple HIG: prefer progressive disclosure, one step at a time, always skippable
- Contextual beats sequential for ongoing education, but a short one-time linear tour (under 60 seconds) is fine for first-run orientation
- React Joyride is broken on React 19. Custom implementation recommended (~200-250 lines).

## How It Works

1. Semi-transparent overlay via full-screen inline SVG with `fill-rule="evenodd"` path (outer rect + inner rounded-rect cutout)
2. Tooltip bubble with title, body text, and CSS border-triangle arrow pointing at the target
3. Explicit "Got it" button to advance (not tap-anywhere, reduces accidental skip)
4. "Skip tour" link in top-right corner, dismisses at any point
5. Tour switches tabs programmatically to walk through the full app
6. Persisted to Firestore (`profile.tourCompleted`) so it only runs once

## Tour Steps (6 stops)

| # | Tab | Target | Title | Copy |
|---|-----|--------|-------|------|
| 0 | rotation | jar-slots | Your Rotation | *Hi {firstName}! I'm Professor Ruphus. Let me show you around.* Tap a slot to open a new bag. You can keep up to 3 active at a time. |
| 1 | rotation | brew-button | Brew Recipe | Get a custom brew recipe for your Aiden. *(skip if no active beans)* |
| 2 | inventory | add-bean | Add a Bean | Tap to scan your coffee bag or add one manually. |
| 3 | inventory | sealed-beans | Your Stash | Sealed bags wait here until you're ready to open one into your rotation. |
| 4 | tasting | new-tasting | Log a Tasting | Tap to start a guided tasting session. Professor Ruphus will coach you through it step by step. |
| 5 | chat | chat-input | Ask Ruphus | Type anything about coffee. Ruphus has read Hoffmann, Perger, and Rao so you don't have to. |

Changes from original 8-step plan:
- **Welcome step merged into step 0**: The greeting text ("Hi {firstName}!") is prepended to the jar-slots step. No standalone centered welcome card, no empty overlay, fewer taps to start.
- **Archive step dropped**: Low value. Archive is self-explanatory from the nav icon. 6 steps keeps tour under 30 seconds.
- **Step counter dropped**: At 6 steps it's unnecessary chrome. The user feels progress through tab switching.

Copy principles:
- **Action-oriented**: "Tap to..." not "This is where you..."
- **Aiden is the machine**: Fellow Aiden precision brewer. Say "for your Aiden" not "from Aiden". Never personify Aiden as an AI or barista.
- **Personality**: Light Ruphus voice in step 0 greeting, factual elsewhere
- **Brevity**: 1-2 sentences max per step

## New File (1)

### `src/components/TourOverlay.jsx`

Single self-contained component (~200-250 lines). No separate config file. No separate CSS file.

**Internal structure:**
- `TOUR_STEPS` constant array (step definitions inline)
- Full-screen inline SVG with `<path fill-rule="evenodd">` cutout (z-index: 900, above tab bar 100, below modals 1000)
- Tooltip bubble (z-index: 910) with CSS border-triangle arrow
- "Skip tour" top-right (safe-area aware)
- "Got it" button inside the tooltip (primary action, `btnp-primary` class, haptic.selection on tap)
- Tab switching via `setTab` prop
- Element targeting via `document.querySelector('[data-tour="..."]')` with MutationObserver for lazy-loaded tabs
- Conditional step skipping (brew-button when no active beans)
- Portal via `createPortal(content, document.body)` matching Modal.jsx pattern
- Body scroll lock: set `overflow: hidden` on `document.body` while overlay is active, restore on cleanup

**Props:** `onComplete`, `setTab`, `beans`, `profile`, `updateProfile`

(No `active` prop. The parent conditionally renders `<TourOverlay>`, so `active` is redundant.)

**SVG cutout approach (`fill-rule="evenodd"`, not `<mask>`):**
```jsx
<svg style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none' }}
     width="100%" height="100%">
  <path
    fillRule="evenodd"
    fill="rgba(44,24,16,0.55)"
    d={`M0,0 H${vw} V${vh} H0 Z
        M${cx-w/2},${cy-h/2+r}
        a${r},${r} 0 0 1 ${r},-${r}
        h${w-2*r}
        a${r},${r} 0 0 1 ${r},${r}
        v${h-2*r}
        a${r},${r} 0 0 1 -${r},${r}
        h${-(w-2*r)}
        a${r},${r} 0 0 1 -${r},-${r} Z`}
    style={{ pointerEvents: 'auto' }}
  />
</svg>
```
The outer rect covers the viewport. The inner rounded-rect (via arc commands) punches a hole. `pointerEvents: 'none'` on the SVG, `pointerEvents: 'auto'` on the path. The cutout area (no fill) naturally passes touches through to the underlying UI element.

**Cross-fade transition between steps (not SVG rect animation):**
SVG geometry attributes (`x`, `y`, `width`, `height`) are not GPU-accelerated. Animating them causes CPU-bound repainting. Instead:
1. Fade out overlay+tooltip (opacity 0, 150ms)
2. Snap cutout path to new position (instant, no animation)
3. Fade in overlay+tooltip (opacity 0 to 1, 150ms)
Total transition: ~300ms. Uses `transform`/`opacity` only (GPU-accelerated per ios-layout.md).

Implement with a `transitioning` state boolean:
```jsx
const [transitioning, setTransitioning] = useState(false);
// On step advance:
setTransitioning(true);
setTimeout(() => {
  setStep(next);
  requestAnimationFrame(() => setTransitioning(false));
}, 150);
```
Wrapper div: `style={{ opacity: transitioning ? 0 : 1, transition: 'opacity 150ms ease-out' }}`

**MutationObserver for lazy tab elements (not rAF polling):**
When advancing to a step on a different tab:
1. Call `setTab(nextStep.tab)`
2. Create a MutationObserver on `document.body` watching for `childList` + `subtree` changes
3. On each mutation, check `document.querySelector('[data-tour="target"]')`
4. If found: disconnect observer, compute rect, render step
5. Safety timeout: 2s, then skip to next step
6. Cleanup: disconnect observer on unmount or step change

```jsx
const observer = new MutationObserver(() => {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (el) { observer.disconnect(); setTargetRect(el.getBoundingClientRect()); }
});
observer.observe(document.body, { childList: true, subtree: true });
const timeout = setTimeout(() => { observer.disconnect(); advanceStep(); }, 2000);
```

**Tooltip positioning logic:**
- Measure target rect via `getBoundingClientRect()` on the data-tour element
- Use `useLayoutEffect` (not `useEffect`) for measurement to prevent tooltip flicker
- Default: tooltip below target, arrow points up
- If target is in lower 40% of viewport: tooltip above target, arrow points down
- Horizontal: centered on target, clamped to 16px from screen edges
- Step 0 (jar-slots with greeting): normal spotlight positioning, greeting text is just the first line of the tooltip body

**Arrow:** CSS border-triangle via inline styles (a `<div>` with zero width/height, transparent borders on 3 sides, `C.cream` border on the pointing side). Positioned absolutely relative to the tooltip, overlapping the tooltip border by 1px to avoid gap.

**Resize handling:** Debounced `ResizeObserver` on the current target element. Re-measures target rect on resize (device rotation, dynamic content). One observer instance, swapped per step. No scroll listener needed since all target elements are in fixed/non-scrollable layouts.

**Accessibility:**
- `role="dialog"` and `aria-modal="true"` on the overlay container
- `aria-labelledby="tour-title"` pointing to tooltip title, `aria-describedby="tour-body"` pointing to body (use matching `id` attributes on the title/body elements)
- `aria-live="polite"` on the tooltip body wrapper so VoiceOver announces step changes without requiring focus movement
- Set `inert` attribute on `#root` while tour is active (blocks VoiceOver from background)
- Focus trap: two invisible sentinel `<div tabIndex={0}>` elements at the start and end of the tooltip. On focus, the start sentinel moves focus to "Got it" button, the end sentinel does the same. This prevents Tab from escaping the tooltip.
- Focus management: move focus to "Got it" button on each step via ref + `useLayoutEffect`
- Escape key dismisses the tour
- Remove `inert` and restore focus on cleanup

**Ruphus theming:**
- Tooltip header: 36px circular `ruphus-avatar.png` (left) + title (right), `display: flex; align-items: center; gap: 10px`
- Avatar border: `2px solid ${C.borderLight}`, `border-radius: 50%`
- Caramel accent stripe: `border-left: 3px solid ${C.accentLight}` on the tooltip (matches `journalCard` style in theme.js)
- Step 0 greeting: "Hi {firstName}! I'm Professor Ruphus. Let me show you around."

**Styling rules (from lessons.md + theme.js):**
- Backdrop: `rgba(44,24,16,0.55)` (warm brown, NOT black, per lessons.md)
- NO `backdropFilter: blur()` (double GPU tax when combined with SVG overlay on iOS)
- Tooltip bg: `C.cream` (#FFF8F0)
- Tooltip border: `1px solid ${C.borderLight}` (+ caramel left stripe above)
- Tooltip radius: `radius.lg` (16px)
- Tooltip shadow: `shadows.modal`
- Title: `fonts.heading`, 17px, `C.text`
- Body: `fonts.body`, 14px, `C.textMuted`
- Arrow: CSS border-triangle, colored `C.cream`
- "Got it" button: `btnp btnp-primary` class (existing button system)
- Skip link: `fonts.body`, 13px, `C.textLight`, no border/bg, `top: calc(env(safe-area-inset-top, 0px) + 12px)`, `right: 20px`

**Completion guard:** `useRef` flag to prevent double-write of `updateProfile({ tourCompleted: true })` if component re-renders during async call.

## Animations (added to `src/styles/global.css`)

Two keyframes, appended to the existing keyframes in global.css (alongside `ruphusSlideUp`, `ruphusFadeIn`, etc.):

```css
@keyframes tourFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tourTooltipIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

No `tourPulse` animation (adds visual noise, no UX benefit per simplicity review). No `tourTooltipOut` (the cross-fade handles exit).

## Modified Files (6)

### `src/tabs/RotationTab.jsx`
- Add `data-tour="jar-slots"` to the slots container div
- Add `data-tour="brew-button"` to the first BrewButton wrapper (only the first BeanCard's brew action needs the attribute)

### `src/tabs/InventoryTab.jsx`
- Add `data-tour="add-bean"` to the Add Bean button in the header
- Add `data-tour="sealed-beans"` to the inventory cards scroll area

### `src/tabs/TastingTab.jsx`
- Add `data-tour="new-tasting"` to the new tasting button area (the flex row with Chat It + Log buttons)

### `src/tabs/ChatTab.jsx`
- Add `data-tour="chat-input"` to the fixed input bar container div

### `src/styles/global.css`
- Append `tourFadeIn` and `tourTooltipIn` keyframes after existing keyframes

### `src/App.jsx`
Changes:
1. Import `TourOverlay` (eager, not lazy, since it renders immediately after onboarding)
2. Add state with **lazy initializer** (critical: prevents race with postCompleteAction):
   ```js
   const [tourActive, setTourActive] = useState(
     () => !!profile && !profile.tourCompleted && !!profile.onboardingComplete
   );
   ```
3. Gate the `postCompleteAction` effect (lines 108-125) behind `!tourActive`:
   ```js
   useEffect(() => {
     if (handoffConsumedRef.current) return;
     if (tourActive) return;
     const action = profile?.onboardingAnswers?.postCompleteAction;
     // ... rest unchanged
   }, [profile, updateProfile, tourActive]);
   ```
4. Preload lazy tab chunks on tour mount (so tab switching doesn't stall):
   ```js
   useEffect(() => {
     if (!tourActive) return;
     import('../tabs/InventoryTab.jsx');
     import('../tabs/TastingTab.jsx');
     import('../tabs/ChatTab.jsx');
   }, [tourActive]);
   ```
5. Render `<TourOverlay>` after `<SettingsPage>`, before closing `</div>`:
   ```jsx
   {tourActive && (
     <TourOverlay
       setTab={setTab}
       beans={beans}
       profile={profile}
       updateProfile={updateProfile}
       onComplete={() => setTourActive(false)}
     />
   )}
   ```

## Tour Completion and Skip

**Haptic feedback per interaction:**
- `haptic.selection()` on each "Got it" tap (subtle confirmation)
- `haptic.light()` on each step transition (after cross-fade completes)
- `haptic.success()` on tour complete (last step "Got it")
- `haptic.light()` on skip

When the tour finishes (last step "Got it") or user taps "Skip tour":
1. Haptic feedback as above
2. Guard with `useRef` to prevent double-write
3. `updateProfile({ tourCompleted: true })` to persist to Firestore
4. `setTab('rotation')` to return to landing tab
5. Call `onComplete()` which sets `tourActive = false` in App.jsx
6. Remove `inert` from `#root`, restore `document.body` overflow
7. This unblocks the `postCompleteAction` effect, which then fires the scan/add handoff if applicable

**Graceful failure:** If all remaining steps fail to find their target elements (MutationObserver timeouts), auto-complete the tour rather than leaving the user stuck on a dimmed screen.

## Technical Guardrails (from lessons.md + research)

1. **Firestore rules**: Add `tourCompleted` to the UPDATE `hasOnly` allowlist in `firestore.rules` (lines 34-41). Not needed in CREATE rule since new profiles won't have it yet. Deploy rules first, wait 60s for propagation.
2. **Single atomic write**: `updateProfile({ tourCompleted: true })` is one call, matching the single-write-per-handler pattern from `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md`
3. **Optional chaining**: Legacy users will have `undefined` for `tourCompleted`. The lazy initializer handles this: `!profile.tourCompleted` is truthy for both `false` and `undefined`, but we only trigger if `profile.onboardingComplete` is true, so legacy users who never onboarded won't see the tour.
4. **No React.lazy inside components**: `TourOverlay` import is at module scope in App.jsx (eager import since it renders immediately)
5. **Portal to body**: `createPortal(content, document.body)` to escape stacking contexts
6. **useRef guard on completion write**: Prevent double-write if the component re-renders during the async `updateProfile` call
7. **Profile load failure**: If `profile` is null/undefined, the lazy initializer evaluates to `false`, preventing the tour from showing. This avoids the "network failure looks like missing profile" issue from `docs/solutions/logic-errors/native-profile-load-failure-indistinguishable-from-missing.md`
8. **No `backdropFilter: blur()`**: iOS WKWebView double GPU tax when combined with SVG overlay. The warm brown semi-transparent fill is sufficient visual separation.
9. **Body scroll lock**: Set `overflow: hidden` on `document.body` on mount, restore on cleanup. Also set `touch-action: none` on the SVG overlay to prevent scroll passthrough.

## Safe Area Handling

- Skip button: `top: calc(env(safe-area-inset-top, 0px) + 12px)`, `right: 20px`
- SVG overlay: covers full viewport including safe areas (correct: overlay should dim under notch/Dynamic Island)
- Tooltip: never positioned within safe area zones. Use `env(safe-area-inset-top)` as minimum top value for tooltips near the top of screen. For elements in the first ~60px, always position tooltip below.
- "Got it" button: minimum 44x44pt tap target (Apple HIG)

## Empty State Handling

A new user post-onboarding will have zero beans:
- **Jar slots**: Empty slot placeholders ("Open a Bean" button) are the target. Works perfectly for the tour.
- **Brew button**: Skip this step when `beans.filter(b => b.status === 'ACTIVE').length === 0`. Tour goes from step 0 (jar-slots) straight to step 2 (add-bean).
- **Sealed beans**: Inventory will be empty. Target the scroll area container. Copy says "wait here until you're ready" which works for empty state.

## Implementation Sequence

### Phase 0: Firestore Rules (prerequisite)
1. Add `tourCompleted` to the profile doc UPDATE `hasOnly` allowlist in `firestore.rules` (lines 34-41)
2. Deploy rules and wait 60s for propagation

### Phase 1: Foundation (1 new file + 1 modified)
3. Append `tourFadeIn` and `tourTooltipIn` keyframes to `src/styles/global.css`
4. Create `src/components/TourOverlay.jsx` with full component

### Phase 2: Data Attributes (4 existing files)
5. Add `data-tour` attributes to RotationTab, InventoryTab, TastingTab, ChatTab

### Phase 3: Wiring (1 existing file)
6. Modify App.jsx: import, lazy initializer state, postCompleteAction gate, chunk preload, render

### Phase 4: Verification
7. Test flow (see Verification section)

## Verification

1. Create a fresh test account OR delete `tourCompleted` field from existing profile in Firebase console
2. Complete onboarding flow
3. Tour should start automatically with step 0 (jar-slots + greeting)
4. Walk through all steps, verify:
   - Spotlight cutout correctly highlights each element
   - Tooltip arrow points at the target
   - Tab switching works (especially lazy-loaded tabs via MutationObserver)
   - "Got it" button advances with haptic feedback
   - Cross-fade transition between steps is smooth (~300ms)
   - Empty-state steps work (no beans in rotation, brew step skipped)
5. Skip button should work at any point and persist `tourCompleted`
6. After completion, refresh the app: tour should NOT re-trigger
7. `postCompleteAction` (scan/add flow) should fire after tour completes
8. Test on web (Safari) and iOS simulator (safe areas, haptics)
9. Test on iPhone SE (smallest screen, verify tooltip doesn't overflow)
10. Verify VoiceOver: dialog announced, background content inert, Escape dismisses

## Out of Scope (Related Work Noted)

The following issues surfaced during planning but are separate work items:

**Onboarding screen fixes:**
- R02Goal icons: Replace generic Lucide icons with coffee-specific ones (the `Cpu` icon for Fellow Aiden is not intuitive)
- R04SocialProof: Investigate testimonial-to-pain mismatch (Tal reported clicking "can't remember beans" but seeing unrelated quotes). The code maps by `answers.pain` key, so this might be a state propagation issue or a copy quality issue.
- R06Personalized: Strengthen copy to emphasize AI + Hoffmann theory angle. Current copy already mentions "Hoffmann, Perger, Rao" and "no whiteboards" but could be more punchy.
- R10Demo: Screenshot image may look frozen/static. Consider animated version.
- Privacy Policy link: broken, needs investigation.

**Product shot bugs:**
- Product shot hangs on "Generating" and cancels if user saves/closes. Should continue in background.
- Product shot should generate at point of bean ingestion (during scan), not only via edit.

**Persistent bugs (claimed fixed but reported recurring):**
- Producer field overlaps Roast Date (both edit and ingestion)
- AI Fill button still too narrow
- Keyboard covering bottom inputs (scrollIntoView with block: 'center' fix may not be fully working)

**Feature requests:**
- Share button for recipes and tasting reviews (text card / social / IG)
- Hand brew recipe access when default is Aiden (3D touch / long press suggestion)
- Inventory header should be sticky (search bar + add bean always visible)

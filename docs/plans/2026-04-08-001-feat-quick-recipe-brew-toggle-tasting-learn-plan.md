---
title: "feat: Quick Recipe brew toggle, tasting, and learn buttons"
type: feat
status: active
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-quick-recipe-enhancements-requirements.md
---

# feat: Quick Recipe brew toggle, tasting, and learn buttons

## Overview

Enhance the shipped Quick Recipe flow with four additions: a text-labeled button, brew method toggle (Aiden vs hand brew), tasting options (quick rate + Ruphus coached), and a Professor Ruphus Learn button. Turns Quick Recipe from a dead-end recipe generator into a complete mini-session for samplers.

## Problem Statement / Motivation

Quick Recipe currently shows an Aiden recipe and that's it. For samplers, you often want to also try a hand pour, rate what you tasted, or learn about the bean's origin. These all require saving to inventory and navigating to separate flows. (see origin: docs/brainstorms/2026-04-08-quick-recipe-enhancements-requirements.md)

## Proposed Solution

Add action buttons to the Quick Recipe result screen. Default brew method follows user preference. Auto-save bean to inventory (SEALED, no jar) only when tasting is initiated. Learn works ephemerally.

### Key Decisions (from origin)

- **Auto-save on tasting, not on recipe**: Getting a recipe is ephemeral, tasting requires persistence
- **Both tasting options**: Quick Rate (stars + note) and Ruphus Tasting (coached chat)
- **Brew toggle, not picker**: One-tap to get the other method
- **Learn is ephemeral**: Story displays but doesn't persist unless bean was already saved
- **Cancel after auto-save keeps the bean**: Orphaned SEALED beans are acceptable for samplers

### Architectural Decisions (from research)

- **Brew toggle swaps modals in place**: QuickRecipeFlow conditionally renders AidenModal or HandBrewModal based on active method. Not a unified component.
- **Research caching between methods**: First recipe's `beanResearch` is passed as `cachedResearch` to the second method, avoiding double API calls
- **Quick Rate is a new mini-component**: Not a reuse of TastingForm (which has 9 fields). Just StarRating + text input + submit.
- **Don't reuse BrewButton**: Its menu uses `bean.id` identity. Use a simple toggle button instead.
- **Add `if (bean.id)` guard to useProfessorRuphus**: One-line fix, matches useHandBrew pattern

## Technical Considerations

### System-Wide Impact

- **Interaction graph**: Quick Rate tap -> addBean() -> refetch -> addTasting() -> refetch. Ruphus Tasting -> same addBean() then launches coached chat which calls addTasting on completion. Learn -> generateRuphusStory() -> (guarded) updateBean().
- **State lifecycle risks**: If addBean succeeds but addTasting fails, orphaned SEALED bean remains. Acceptable per product decision. Using sequential calls (not writeBatch) since the tasting form is interactive and submitted separately from save.
- **Error propagation**: addBean failure should show error toast and not open tasting. Recipe generation errors handled by existing hook error states.

### Gotchas from Learnings

- **Grinder labels**: Any brew UI must import `GRINDER_LABELS` from `brewMethods.js`, not hardcode (see docs/solutions/logic-errors/grind-size-display-toggle-unwired.md)
- **Firestore writes**: One logical change = one write. Auto-save is one write (addBean), tasting submit is a separate write (addTasting) triggered by user action
- **React render side effects**: Auto-save must be triggered by button handler, never in render body or unguarded useEffect

## Implementation Units

### Unit 1: Button label change (R1)

**Goal:** Replace camera icon button with "Quick Recipe" text button in RotationTab header.

**Files:**
- `src/tabs/RotationTab.jsx` (lines 116-129)

**Approach:** Widen the button, add text label "Quick Recipe" next to Camera icon. Keep amber bg styling, adjust width/padding for text.

**Verification:** Button shows "Quick Recipe" text with camera icon, fits header layout on iOS.

---

### Unit 2: Add `if (bean.id)` guard to useProfessorRuphus

**Goal:** Make Professor Ruphus work with ephemeral beans (no Firestore crash).

**Files:**
- `src/hooks/useProfessorRuphus.js` (line 19-20)

**Approach:** Add `if (bean.id)` before `updateBean(bean.id, { story })` call. Matches existing pattern in `useHandBrew.js:45` and `useHandBrew.js:63`.

**Patterns to follow:** `src/hooks/useHandBrew.js:45`

**Verification:** Calling `handleLearn` with a bean without `.id` generates and displays story without Firestore error.

---

### Unit 3: Brew method toggle (R2)

**Goal:** Default recipe matches user's `preferences.brewMethod`. One-tap toggle to get the other method.

**Files:**
- `src/components/QuickRecipeFlow.jsx` (lines 17-327, mainly the brewing step 201-227)

**Approach:**
1. Add `useHandBrew(noop)` alongside existing `useAidenBrew(noop)`
2. Read `preferences.brewMethod` via `usePreferences()`
3. Add state: `activeMethod` (defaults to preference), `cachedResearch` (shared between methods)
4. In `startBrew`, generate default method's recipe. Store research result for reuse.
5. In the brewing step, conditionally render `AidenModal` or `HandBrewModal` based on `activeMethod`
6. Add a toggle button in `extraFooter` (for AidenModal) or equivalent slot: "Also get a [other method] recipe"
7. When toggled, call the other hook's brew function with `cachedResearch` to skip re-research
8. Both modals get the same `onClose` handler

**Key detail:** `useAidenBrew.handleBrewWithAiden(bean, cachedResearch)` accepts a second arg for cached research. `useHandBrew.handleBrewHandBrew(bean)` needs verification on whether it accepts cached research.

**Patterns to follow:** `src/tabs/RotationTab.jsx:156-165` (how BrewButton dispatches to aiden vs handBrew)

**Verification:** 
- If user preference is Aiden: shows Aiden recipe first, "Get Hand Brew" button generates hand brew without re-researching
- If user preference is hand brew: shows hand brew recipe first, "Get Aiden Recipe" button generates Aiden without re-researching

---

### Unit 4: Quick Rate mini-component (R3)

**Goal:** Lightweight star rating + note form for quick tastings from Quick Recipe.

**Files:**
- `src/components/QuickRateForm.jsx` (NEW)

**Approach:** 
- New small component: `{ open, onClose, beanName, onSubmit }`
- Renders inside a Modal: StarRating (reuse existing component), single text input for notes, submit button
- `onSubmit` passes `{ rating, notes }` to parent
- No bean selection (beanId injected by parent after auto-save)

**Patterns to follow:** `src/components/StarRating.jsx` for rating UI, Modal component for container

**Verification:** Renders star rating + notes field, submits data, closes on submit.

---

### Unit 5: Auto-save and tasting wiring (R3, R4, R6)

**Goal:** Wire Quick Rate and Ruphus Tasting buttons into QuickRecipeFlow with auto-save.

**Files:**
- `src/components/QuickRecipeFlow.jsx`
- `src/tabs/RotationTab.jsx` (pass `addBean`, `addTasting`, `tastings` props)
- `src/App.jsx` (pass `tastings` to RotationTab if not already)

**Approach:**
1. Add props to QuickRecipeFlow: `addBean`, `addTasting`, `updateBean`, `tastings`, `uid`
2. Add state: `savedBeanId` (null until auto-saved), `quickRateOpen`, `ruphusOpen`
3. Create `handleAutoSave` async function:
   - If `savedBeanId` already set, skip (bean already saved from previous action)
   - Call `addBean({ ...scanData, status: 'SEALED', uid })` 
   - Store returned doc ID in `savedBeanId`
   - Show toast: "[name] saved to inventory"
4. Quick Rate button: calls `handleAutoSave()`, then opens QuickRateForm
5. QuickRateForm submit: calls `addTasting({ beanId: savedBeanId, rating, notes })`
6. Ruphus Tasting button: calls `handleAutoSave()`, then opens existing tasting flow (ProfessorRuphusSlideUp or redirects to TastingTab coached flow)
7. `savedBeanId` persists across actions in the same session (rate then learn, or learn then rate)

**Key detail for Ruphus Tasting:** The coached tasting flow lives in ChatTab and is complex. For v1, the Ruphus Tasting button should save the bean and then show a toast directing to the Tasting tab: "[name] saved. Start a tasting from the Tasting tab." This avoids embedding the entire chat flow inside Quick Recipe.

**Verification:**
- Quick Rate: tapping creates bean + tasting atomically, toast confirms, rating persists in Firestore
- Second action on same bean reuses `savedBeanId` (no duplicate save)
- Ruphus Tasting: saves bean, directs to tasting tab

---

### Unit 6: Learn button (R5)

**Goal:** Professor Ruphus Learn button on recipe result screen.

**Files:**
- `src/components/QuickRecipeFlow.jsx`

**Approach:**
1. Add `useProfessorRuphus(noop, tastings)` to QuickRecipeFlow (with noop updateBean, empty tastings array for ephemeral)
2. If `savedBeanId` exists (bean was auto-saved from tasting), use real `updateBean` instead so story persists
3. Add "Learn" button in the recipe footer area
4. Tapping calls `handleLearn(ephemeralBean)` which opens ProfessorRuphusSlideUp
5. Render ProfessorRuphusSlideUp with `{...ruphusProps}`

**Patterns to follow:** `src/tabs/RotationTab.jsx:309` (ProfessorRuphusSlideUp rendering), `src/tabs/RotationTab.jsx:156` (handleLearn usage)

**Verification:** Learn button generates and displays Professor Ruphus story. No Firestore errors for ephemeral beans.

---

## Acceptance Criteria

- [ ] R1: "Quick Recipe" button with text label and camera icon in RotationTab header
- [ ] R2: Default recipe matches brew preference; toggle generates other method without re-research
- [ ] R3: Quick Rate shows star rating + note, auto-saves bean as SEALED, creates tasting
- [ ] R4: Ruphus Tasting auto-saves bean, directs to Tasting tab for coached flow
- [ ] R5: Learn button shows Professor Ruphus story, works ephemerally
- [ ] R6: Auto-save only fires once per session (no duplicate beans)
- [ ] useProfessorRuphus has `if (bean.id)` guard (no Firestore crash on ephemeral beans)
- [ ] No regression to existing Quick Recipe scan/brew flow

## Scope Boundaries

- No changes to scan or enrichment pipeline
- No unified recipe component (keep AidenModal and HandBrewModal separate)
- No embedded Ruphus chat flow in Quick Recipe (v1 directs to Tasting tab)
- No "Quick Brews" history or tracking
- Auto-save creates SEALED bean only (no jar slot, no ACTIVE status)

## Dependencies & Risks

- `useHandBrew` cached research: need to verify `handleBrewHandBrew` accepts a `cachedResearch` parameter. If not, a small change to the hook is needed.
- Toast visibility inside modal: verify z-index layering so toasts appear above recipe modal

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-08-quick-recipe-enhancements-requirements.md](docs/brainstorms/2026-04-08-quick-recipe-enhancements-requirements.md) -- Key decisions: auto-save on tasting not recipe, both tasting options, brew toggle not picker, learn is ephemeral
- Similar patterns: `src/tabs/RotationTab.jsx:156-172` (brew dispatch + learn + tasting), `src/hooks/useHandBrew.js:45` (bean.id guard pattern)
- Learnings: `docs/solutions/logic-errors/grind-size-display-toggle-unwired.md` (grinder label conventions)

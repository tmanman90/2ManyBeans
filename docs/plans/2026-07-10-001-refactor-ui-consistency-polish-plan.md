---
title: "refactor: Finish app-wide UI consistency polish"
type: refactor
status: completed
date: 2026-07-10
---

# refactor: Finish app-wide UI consistency polish

## Summary

Consolidate the audited top-level calls to action on the existing warm Liquid Glass primitive, correct the wordmark's optical geometry, remove two layout/color outliers, and finish the Settings touch-target pass without changing behavior or data.

---

## Problem Frame

The app's warm editorial system is coherent overall, but the live simulator audit found several visible seams: top-level actions use multiple competing button recipes, the app-header wordmark is accidentally constrained by a mismatched mask box, Inventory introduces a non-semantic cyan action, Archive is double-inset by nested gutters, and Settings retains controls below the iOS 44pt target.

---

## Requirements

- R1. Add Bean, Quick Recipe, Brew, Start Guided Tasting, and Open Into Jar use one shared prominent warm Liquid Glass material while preserving their current layout and actions.
- R2. Sign-in retains a hero-sized wordmark and the app header retains a smaller chrome wordmark, but both render from one aspect-correct primitive with an intentional optical ratio.
- R3. Open Into Jar no longer uses the hardcoded cyan gradient; it remains the dominant full-width Inventory action using the warm primary material.
- R4. Archive owns one horizontal gutter rather than receiving both the app-shell gutter and its internal gutter; bottom safe-area clearance remains intact.
- R5. Settings buttons, selects, inputs, and row actions provide at least a 44pt interactive target without crowding or clipping conditional states.
- R6. Existing callbacks, long-press menus, haptics, demo gating, disabled states, accessibility labels, tab behavior, data flows, and Firebase schema remain unchanged.
- R7. Affected regression harnesses, production build, lint, and simulator visual checks pass with no new console errors.

---

## Scope Boundaries

- Do not globally restyle every `Btn variant="primary"`; modal, inline form, transactional, paywall, and destructive actions are outside this pass.
- Do not change sign-in provider button branding or make every control glass.
- Do not change Firebase, API, persistence, subscription, or bean-status behavior.
- Do not redesign Archive's approved favourite-cups-first and chronological-ledger hierarchy.
- Do not enlarge BeanCard's compact icon cluster; prior layout work documents that as an intentional exception.
- Do not deploy or ship a Capgo/App Store build as part of this implementation.

---

## Context & Research

### Relevant Code and Patterns

- `src/components/GlassButton.jsx` is the canonical warm primary Liquid Glass implementation.
- `src/components/BrewButton.jsx` proves that long-press handlers can pass through the shared primitive.
- `docs/internal/liquid-glass-button-spec.md` defines the WKWebView-safe material, motion, and performance contract.
- `scripts/verify-inventory.mjs`, `scripts/verify-tasting.mjs`, and `scripts/verify-archive.mjs` are the existing Playwright regression gates.
- `src/styles/theme.js` supplies the warm caramel/espresso palette and 44pt-oriented component tokens.

### Institutional Learnings

- Keep real backdrop blur scarce: top-level primary actions only, never every control or every scrolling-list button.
- Liquid Glass press feedback is transform plus brightness; backdrop-filter itself must not animate in WKWebView.
- Simulator evidence must be judged screen by screen because CSS masks and compositing can differ from desktop Chromium.
- Wordmark hero and chrome variants are deliberately different sizes; this work corrects optical rendering rather than forcing equality.

---

## Key Technical Decisions

- Extend `GlassButton` instead of adding another button abstraction, including only the layout flexibility needed by a split-label/trailing-icon CTA.
- Use an explicit top-level CTA allowlist. Ordinary `Btn` consumers remain unchanged to avoid an app-wide blast radius.
- Route the Inventory Open Into Jar control through the same warm primitive while preserving its jar icon and full-width hierarchy.
- Make `Wordmark` aspect-ratio-aware with explicit chrome and hero variants, then use it from both the app shell and sign-in.
- Opt Archive out of only the app shell's horizontal content padding; retain its vertical and bottom safe-area allowance.
- Consolidate Settings compact action geometry through local shared styles rather than scattered one-off numerical fixes.

---

## Implementation Units

- U1. **Consolidate audited top-level glass actions**

**Goal:** Make the audited Add Bean, Quick Recipe, Brew, and Start Guided Tasting surfaces share the canonical prominent glass implementation.

**Requirements:** R1, R6

**Dependencies:** None

**Files:**
- Modify: `src/components/GlassButton.jsx`
- Modify: `src/tabs/RotationTab.jsx`
- Modify: `src/tabs/InventoryTab.jsx`
- Modify: `src/tabs/TastingTab.jsx`
- Verify: `src/components/BrewButton.jsx`
- Test: `scripts/verify-tasting.mjs`

**Approach:**
- Add stable test identification and minimal content-layout flexibility to `GlassButton`.
- Replace only audited top-level bespoke/flat CTA renderings; preserve labels, icons, data attributes, callbacks, long-press handlers, disabled states, and haptic behavior.
- Remove Tasting's duplicated inline glass layers once the shared primitive can express its split layout.

**Patterns to follow:**
- `src/components/BrewButton.jsx`
- `docs/internal/liquid-glass-button-spec.md`

**Test scenarios:**
- Happy path: each allowlisted CTA renders the shared prominent-glass marker and remains at least 44px high.
- Integration: Quick Recipe retains tap and long-press menu behavior; guided tasting retains bean selection and disabled behavior.
- Regression: a representative non-allowlisted `Btn` remains on the existing flat button system.

**Verification:**
- The four audited surfaces have matching material, press response, typography, and corner language in the simulator.
- No callback, menu, demo, or disabled-state behavior changes.

- U2. **Replace the Inventory cyan action**

**Goal:** Make Open Into Jar a warm, full-width shared glass action without changing Inventory behavior.

**Requirements:** R1, R3, R6

**Dependencies:** U1

**Files:**
- Modify: `src/tabs/InventoryTab.jsx`
- Test: `scripts/verify-inventory.mjs`

**Approach:**
- Replace the bespoke cyan gradient/shadow implementation with the shared prominent glass primitive.
- Preserve the jar image, uppercase label, full-width layout, first-free-slot behavior, full-jars feedback, and demo gating.
- Update the existing verifier atomically so it asserts shared warm material instead of the retired blue RGB values.

**Patterns to follow:**
- `src/components/GlassButton.jsx`
- Existing Inventory rail harness and `scripts/verify-inventory.mjs`

**Test scenarios:**
- Happy path: Open Into Jar renders the jar icon and warm shared material and fires its callback once.
- Edge case: full jars still produce the existing feedback rather than opening a slot.
- Regression: Inventory rails, card morph, and reduced-motion checks continue to pass.

**Verification:**
- Inventory has one coherent warm primary action and no hardcoded cyan Open Into Jar gradient.

- U3. **Correct wordmark optical sizing**

**Goal:** Make header and sign-in wordmarks derive from one aspect-correct component with intentional chrome and hero variants.

**Requirements:** R2, R6

**Dependencies:** None

**Files:**
- Modify: `src/components/Wordmark.jsx`
- Modify: `src/components/SignInScreen.jsx`
- Verify: `src/App.jsx`
- Test: `scripts/ui-consistency-regression.test.mjs`

**Approach:**
- Preserve the source asset, tinting, ARIA role/label, and hero-vs-chrome hierarchy.
- Remove the mismatched wide/shallow mask geometry that currently reduces the visible header ink to roughly 105px.
- Use component variants rather than separate raw image and mask implementations.

**Patterns to follow:**
- Both app-header branches in `src/App.jsx`
- Existing sign-in layout and provider-button spacing

**Test scenarios:**
- Happy path: header and hero variants use the same component and source asset with the source aspect ratio.
- Edge case: the header mark fits Rotation's greeting branch and the standard settings branch without clipping at narrow width.
- Accessibility: both variants expose the 2manybeans image label.

**Verification:**
- The transition from sign-in to app retains hierarchy but no longer looks like two unrelated logo scales.

- U4. **Normalize Archive gutters**

**Goal:** Remove Archive's double horizontal inset while preserving its internal editorial grid and bottom safe area.

**Requirements:** R4, R6

**Dependencies:** None

**Files:**
- Modify: `src/App.jsx`
- Verify: `src/tabs/ArchiveTab.jsx`
- Test: `scripts/verify-archive.mjs`
- Test: `scripts/ui-consistency-regression.test.mjs`

**Approach:**
- Give Archive the same outer-padding opt-out already used by full-bleed tabs, but retain the app-level vertical and safe-area bottom spacing it needs.
- Leave Archive's own 16–20px masthead, feature, search, and ledger gutters intact.

**Patterns to follow:**
- Existing Inventory/Rotation per-tab content treatment in `src/App.jsx`
- Archive's internal approved spacing rhythm

**Test scenarios:**
- Happy path: Archive masthead, featured cup, search bar, and ledger align to one consistent gutter in the real App shell.
- Regression: favourite cups remain above the chronological ledger; search, filters, sticky years, morph, and reduced motion continue to pass.
- Edge case: the final ledger content remains clear of the home indicator and tab bar.

**Verification:**
- Archive aligns visually with Chat and Tasting and has no horizontal overflow.

- U5. **Finish Settings 44pt targets**

**Goal:** Ensure every Settings control state meets the iOS minimum interactive geometry.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Modify: `src/components/SettingsPage.jsx`
- Test: `scripts/ui-consistency-regression.test.mjs`

**Approach:**
- Introduce local shared geometry for compact Settings actions and selects, then replace 36–40px one-offs.
- Cover Done, inline Save, username value, native selects, Fellow Connect/Disconnect, and other visible compact action states.
- Preserve 16px input fonts, 50px full-row actions, conditional rendering, and existing section/card layout.

**Patterns to follow:**
- Existing `rowStyle` and input styles in `src/components/SettingsPage.jsx`
- `ios-design` 44pt and 16px input rules

**Test scenarios:**
- Happy path: every targeted button/select/input has a minimum 44px interactive height.
- Conditional states: name edit, username edit, Fellow connected/disconnected/form, and subscription sections retain layout and controls.
- Edge case: narrow-width rows do not clip or overlap after targets grow.

**Verification:**
- Settings can be traversed in the simulator with no sub-44pt target in the audited states.

- U6. **Integrate and prove the visual pass**

**Goal:** Add a focused regression gate, run affected harnesses, and visually verify the complete result in the native simulator.

**Requirements:** R6, R7

**Dependencies:** U1, U2, U3, U4, U5

**Files:**
- Create: `scripts/ui-consistency-regression.test.mjs`
- Test: `scripts/verify-inventory.mjs`
- Test: `scripts/verify-tasting.mjs`
- Test: `scripts/verify-archive.mjs`

**Approach:**
- Add inexpensive structural assertions for the shared CTA allowlist, Wordmark variants, Archive padding exception, and Settings target minima.
- Run the established visual harnesses, production build, lint, and native simulator capture.
- Review sign-in, all five tabs, Settings conditional surfaces reachable without data mutation, and the demo gating prompt.

**Test scenarios:**
- Integration: affected Playwright harnesses pass with zero page/console errors.
- Native: sign-in and both header branches show intentional logo hierarchy; all five tabs render; Inventory and Archive fixes are visible; Settings targets remain uncrowded.
- Accessibility: safe areas, keyboard-adjacent surfaces, reduced-motion behavior, and minimum tap geometry remain correct.

**Verification:**
- All automated commands exit zero and the final simulator screenshots clear the original audit findings.

---

## System-Wide Impact

- **Interaction graph:** UI-only leaf changes; callbacks continue to flow through existing App, tab, modal, and data hooks.
- **Error propagation:** No error-handling paths change.
- **State lifecycle risks:** No persistent state or schema changes.
- **API surface parity:** `GlassButton` remains backward-compatible for existing Brew consumers while adding optional layout support.
- **Integration coverage:** Existing Inventory/Tasting/Archive harnesses plus native App-shell checks cover the cross-component seams.
- **Unchanged invariants:** Firebase contracts, subscription gating, bean/tasting records, navigation, long-press actions, and provider sign-in behavior remain intact.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Global primary-button restyle creates a large visual blast radius | Use an explicit CTA allowlist and migrate call sites individually. |
| Shared button migration drops long-press or haptic behavior | Preserve spread event handlers and verify Quick Recipe/Brew interaction paths. |
| Aspect correction makes the header wordmark too tall | Keep explicit chrome/hero variants and verify both header branches on narrow and Dynamic-Island widths. |
| Archive padding fix removes bottom safe-area clearance | Separate horizontal padding from vertical/bottom safe-area padding in the App shell. |
| Larger Settings targets crowd conditional rows | Consolidate local styles and inspect every conditional edit/connect state in the simulator. |
| Existing Inventory test encodes the retired blue design | Update the verifier in the same unit as the visual change. |

---

## Sources & References

- `DESIGN.md`
- `docs/internal/liquid-glass-button-spec.md`
- `docs/plans/2026-06-23-001-design-100x-warm-editorial-plan.md`
- `docs/plans/2026-06-28-002-feat-archive-editorial-100x-plan.md`
- `src/components/GlassButton.jsx`
- `src/components/Wordmark.jsx`
- `src/App.jsx`

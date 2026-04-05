---
title: "Rename Atmos to Jar throughout the app"
type: refactor
status: completed
date: 2026-04-05
---

# Rename Atmos to Jar

## Enhancement Summary

**Deepened on:** 2026-04-05
**Sections enhanced:** 6
**Review agents used:** Data Integrity Guardian, Code Simplicity Reviewer, Pattern Recognition Specialist, Performance Oracle, Agent-Native Reviewer

### Key Improvements
1. **Scope reduced ~35%**: Keep internal variable names (`canisterCount`, `canisterConfirm`, etc.) and Firestore preference field as-is. Only rename user-facing text + the `atmosSlot` data field.
2. **Critical migration fix**: 4 separate Firestore read paths need normalization, not just 1. Must extract a shared `normalizeBean()` function.
3. **Self-healing cleanup**: Use Firestore `deleteField()` on writes to automatically purge old `atmosSlot` fields.

### New Considerations Discovered
- Use destructuring instead of `delete` for V8/JSC hidden class optimization
- The `handleCanisterConfirm` writeBatch should include preferences for full atomicity (existing bug, good time to fix)
- Several console.error messages, alt-text strings, and doc references the original plan missed

---

## Overview

Replace all references to "Atmos" (Fellow Atmos vacuum canisters) with the generic term "Jar" so the app isn't branded to a specific canister product. This touches UI text, Firestore field names, AI prompt context, image assets, and documentation.

**Scope decision**: Internal variable names (`canisterCount`, `canisterConfirm`, `handleCanisterChange`, `CANISTER_OPTIONS`) and the Firestore `canisterCount` preference field are NOT renamed. They are internal, self-documenting, and renaming them adds risk with zero user benefit.

## Problem Statement

"Atmos" refers to Fellow's specific vacuum canister product. Not all users own Fellow Atmos canisters, so the terminology is confusing and exclusionary for a consumer launch. The app should use generic "Jar" terminology.

## Proposed Solution

Rename in a single pass with a dual-read migration strategy for the `atmosSlot` Firestore field, avoiding any need for a batch migration script or deploy coordination. Keep internal variable names as-is.

## Technical Approach

### Migration Strategy: Dual-Read with Self-Healing

The `atmosSlot` field is stored in Firestore bean documents. Existing users have beans with `atmosSlot` set. A hard rename would break their rotation view.

**Approach**: Extract a shared `normalizeBean()` function used by ALL read paths in `useAppData.js`:

```js
import { deleteField } from 'firebase/firestore';

// Normalize legacy field names on read
const normalizeBean = (d) => {
  const { atmosSlot, ...rest } = d.data();
  return {
    ...rest,
    id: d.id,
    jarSlot: rest.jarSlot ?? atmosSlot ?? null,
  };
};
```

### Research Insights

**Why destructuring over `delete`**: The `delete` operator causes V8 and JavaScriptCore (iOS) to transition objects from "fast" hidden classes to "dictionary mode." Destructuring avoids this by never creating the unwanted property in the first place. For 30 beans this is academic, but the destructuring pattern is also cleaner code.

**4 read paths must all use `normalizeBean()`**: The codebase has four independent places that map Firestore docs to bean objects:
1. Native `getDocs` fetch (initial load)
2. Native `getDocs` fetch (effect)
3. Native poll interval `getDocs` (60-second polling)
4. Web `onSnapshot` listener

If even one path misses normalization, the slot conflict check (`b.jarSlot === slot`) silently fails, allowing two beans in the same jar.

**Self-healing writes**: When a bean is next written via `updateBean`, include `atmosSlot: deleteField()` to clean up the old field from Firestore. This makes the migration self-cleaning without a batch script.

```js
// In openBean, finishBean, returnBean - add cleanup
await updateBean(beanId, {
  jarSlot: slot,
  atmosSlot: deleteField(),  // clean up legacy field
  status: 'ACTIVE',
  openDate: today(),
});
```

**Grace period**: After 2-3 months, query Firestore for any remaining `atmosSlot` fields. If none, remove the normalization shim.

### Phase 1: Firestore Data Layer

**`src/hooks/useAppData.js`**
- Extract `normalizeBean(d)` function (destructuring pattern, no `delete`)
- Replace ALL 4 doc-mapping sites with `normalizeBean(d)` (lines ~29, ~56, ~80, ~113)
- `openBean()`: write `jarSlot` + `atmosSlot: deleteField()` (line 205)
- `finishBean()`: write `jarSlot: null` + `atmosSlot: deleteField()` (line 214)
- `returnBean()`: write `jarSlot: null` + `atmosSlot: deleteField()` (line 223)
- Slot conflict check (line 199): read `b.jarSlot` instead of `b.atmosSlot`
- Slot clear on conflict (line 201): write `jarSlot: null` + `atmosSlot: deleteField()`

**Important**: All read AND write changes must land in the same commit. There is no safe intermediate state where some paths use the old name and others use the new name.

### Phase 2: UI Text (User-Facing Strings Only)

**`src/tabs/RotationTab.jsx`**
- Line 80: `Atmos #${b.atmosSlot}:` -> `Jar #${b.jarSlot}:`
- Line 112: `Your {canisterCount} Atmos canister{s}` -> `Your {canisterCount} jar{canisterCount !== 1 ? 's' : ''}`
- Line 116: alt text `"Empty canister"` -> `"Empty jar"`
- Line 127: image src `atmos-full.png` / `atmos-empty.png` -> `jar-full.png` / `jar-empty.png`
- Line 128: alt text `Full canister` / `Empty canister` -> `Full jar` / `Empty jar`
- Line 132: `Atmos #{i + 1}` -> `Jar #{i + 1}`
- Line 222: `Which canister?` -> `Which jar?`
- Line 225: `Atmos #{s}` -> `Jar #{s}`
- Line 270: `Atmos #{returnConfirm.atmosSlot} will be freed` -> `Jar #{returnConfirm.jarSlot} will be freed`
- Keep `canisterCount` variable name, `slotNumbers`, `slotPicker` as-is (internal)

**`src/components/OpenBeanFlow.jsx`**
- Line 15: `b.atmosSlot` -> `b.jarSlot`
- Line 43: `Opening into Atmos #` -> `Opening in Jar #`
- Keep `canisterCount` prop name as-is (internal)

**`src/components/SettingsPage.jsx`**
- Line 159: `b.atmosSlot` -> `b.jarSlot`
- Line 187: `atmosSlot: null` -> `jarSlot: null, atmosSlot: deleteField()`
- Line 463: label `Coffee Canisters` -> `Coffee Jars`
- Line 540: `Reduce canisters?` -> `Reduce jars?`
- Line 544: `Atmos #${...atmosSlot}` -> `Jar #${...jarSlot}`
- Line 545: `canisters that will be removed` -> `jars that will be removed`
- Line 172: console.error `Canister update` -> `Jar update`
- Line 200: console.error `Canister batch update` -> `Jar batch update`
- Keep `canisterConfirm`, `handleCanisterChange`, `handleCanisterConfirm`, `CANISTER_OPTIONS` names as-is (internal)

**`src/components/TastingForm.jsx`**
- Line 48: `#{b.atmosSlot}` -> `#{b.jarSlot}`

**`src/tabs/TastingTab.jsx`**
- Line 192: `#{b.atmosSlot}` -> `#{b.jarSlot}`

**`src/tabs/InventoryTab.jsx`**
- Lines 24-27: `b.atmosSlot` -> `b.jarSlot` (keep `canisterCount` variable name)

**`src/tabs/ChatTab.jsx`**
- Line 272: `atmosSlot: null` -> `jarSlot: null`

**`src/components/AddBeanForm.jsx`**
- Line 217: `atmosSlot: null` -> `jarSlot: null`

### Phase 3: AI Prompts

**`src/lib/claude.js`**
- Line 194: `Atmos #${b.atmosSlot}:` -> `Jar #${b.jarSlot}:`
- Line 230: `Keep 3 beans active (Atmos #1-#3)` -> `Keep 3 beans active (Jar #1-#3)`
- Line 234: `After opening (Atmos):` -> `After opening:`
- Line 261: `ACTIVE ROTATION (Atmos canisters):` -> `ACTIVE ROTATION (Jars):`

### Research Insights

AI models (Claude, GPT-5.4, Gemini) will naturally adopt "Jar" vocabulary from the system prompt context. No explicit instruction like "call them jars" is needed. The models mirror the terminology they see in the injected context.

**`src/lib/aiden.js`**
- Line 661: comment `#{atmosSlot}` -> `#{jarSlot}`
- Line 663: `bean.atmosSlot` -> `bean.jarSlot`

Fellow's API accepts any freeform title string. The slot number source field change does not affect the output format. No breakage risk.

### Phase 4: Image Assets

**`public/images/`**
- Rename `atmos-full.png` -> `jar-full.png`
- Rename `atmos-empty.png` -> `jar-empty.png`

### Phase 5: Seed Data

**`src/lib/seedData.js`**
- All `atmosSlot:` keys -> `jarSlot:` (lines 6-31)

**`scripts/seed.js`**
- All `atmosSlot:` keys -> `jarSlot:`

### Phase 6: Documentation

**`CLAUDE.md`**
- Line 53: `canister art` -> `jar art`
- Line 60: `Atmos slots are 1, 2, or 3 (Fellow Atmos vacuum canisters)` -> `Jar slots are 1, 2, or 3`
- Update `atmosSlot` in data model comment -> `jarSlot`

**`PRD.md`**
- All "Fellow Atmos" and "Atmos" references -> "Jar" / generic
- `atmosSlot` in data model -> `jarSlot`
- "canister" in feature descriptions -> "jar" where user-facing

### Out of Scope (Intentionally Skipped)

| Item | Reason |
|------|--------|
| Internal variable renames (`canisterCount`, `canisterConfirm`, `handleCanisterChange`, `CANISTER_OPTIONS`) | Internal names, no user impact, unnecessary churn |
| `canisterCount` Firestore preference field rename | Internal, not user-facing, adds migration complexity for zero benefit |
| `scripts/cost-optimization-autoresearch*.mjs` | Dev-only frozen test data |
| `coffee-app.jsx` reference prototype | Stale reference file, not production code |
| `docs/solutions/` historical learnings | Historical documents, "canister" is accurate for when they were written |
| `docs/plans/` historical plans | Same as above |
| `OnboardingWizard.jsx` preference key | Uses `canisterCount` which we're keeping |

## Acceptance Criteria

- [ ] No occurrence of "Atmos" in any user-facing UI text or AI prompt context
- [ ] All 4 Firestore read paths in `useAppData.js` use shared `normalizeBean()` function
- [ ] Existing beans with `atmosSlot` in Firestore render correctly (dual-read migration)
- [ ] New beans are written with `jarSlot` field + `atmosSlot: deleteField()` cleanup
- [ ] Image assets renamed and rendering correctly
- [ ] AI chat context uses "Jar" terminology (Claude responds with "Jar" not "Atmos")
- [ ] Settings page jar count adjustment works with confirmation dialog
- [ ] RotationTab displays "Jar #1", "Jar #2", etc.
- [ ] OpenBeanFlow shows "Opening in Jar #N"
- [ ] Aiden brew profile titles use jar slot number correctly
- [ ] PRD.md and CLAUDE.md updated
- [ ] All changes land in a single commit (no safe intermediate state for partial rename)
- [ ] Deploys to both Vercel and Capgo OTA

## Dependencies & Risks

**Low risk**: This is a terminology rename with a safe migration path. The dual-read approach means no data loss and no deploy coordination needed.

**Key constraint**: All read AND write path changes in `useAppData.js` must be in the same commit. If reads are normalized but writes still use `atmosSlot`, the slot conflict check breaks silently.

**Self-healing**: Old `atmosSlot` fields in Firestore are automatically cleaned up via `deleteField()` whenever a bean is next updated (opened, returned, finished). No manual migration script needed.

**No Firestore rules changes needed**: Rules validate at the document level, not individual field names.

**Existing bug opportunity**: The `handleCanisterConfirm` in SettingsPage has a non-atomic write pattern (writeBatch for beans, separate updatePreferences for count). This was documented in `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md`. Consider fixing atomicity while touching this code, but it's optional for this PR.

## Files Changed (Complete List)

| File | Changes |
|------|---------|
| `src/hooks/useAppData.js` | Extract `normalizeBean()`, use in all 4 read paths, rename field in all writes + `deleteField()` cleanup |
| `src/tabs/RotationTab.jsx` | UI text: "Jar #N", alt text, image src refs, field refs |
| `src/tabs/InventoryTab.jsx` | Field refs `atmosSlot` -> `jarSlot` |
| `src/tabs/TastingTab.jsx` | Bean selector field ref |
| `src/tabs/ChatTab.jsx` | Field ref |
| `src/components/OpenBeanFlow.jsx` | UI text + field refs |
| `src/components/SettingsPage.jsx` | Labels, dialog text, console.error messages, field refs + `deleteField()` |
| `src/components/TastingForm.jsx` | Bean selector field ref |
| `src/components/AddBeanForm.jsx` | Field ref |
| `src/lib/claude.js` | AI prompt text + field refs |
| `src/lib/aiden.js` | Comment + field ref |
| `src/lib/seedData.js` | All seed data field names |
| `scripts/seed.js` | Seed script field names |
| `public/images/atmos-full.png` | Rename -> `jar-full.png` |
| `public/images/atmos-empty.png` | Rename -> `jar-empty.png` |
| `CLAUDE.md` | Terminology update (lines 53, 60) |
| `PRD.md` | Terminology + data model update |

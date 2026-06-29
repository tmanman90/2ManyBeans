---
title: "refactor: Unify Add Bean and Edit Bean forms"
type: refactor
status: active
date: 2026-04-22
---

# refactor: Unify Add Bean and Edit Bean Forms

## Enhancement Summary

**Deepened on:** 2026-04-22
**Research agents used:** 8 (beanBuilder extraction, ScanSheet extraction, EditBeanModal lifecycle, parent wiring, learnings cross-reference, architecture review, security review, performance review)

### Key Improvements
1. **Pass beanData directly to EditBeanModal** instead of `beans.find()` lookup, eliminating a critical web race condition and native refetch latency
2. **Guard EditBeanModal's form-init useEffect** against re-runs while open, preventing data loss from background writes (Ruphus story, product shot, notesSummary)
3. **Exact field specifications** for `buildNewBeanData` with complete dependency graph, function signature, and gotchas
4. **Complete state/handler inventory** for ScanSheet extraction with line-level references
5. **AI Fill gap identified**: EditBeanModal has no on-demand research button; must be added or manual-entry users lose enrichment capability

### New Considerations Discovered
- `refetch()` is a no-op on web (line 65 of useAppData.js); `beans.find()` will return `undefined` after `addBean()` on web
- EditBeanModal's `useEffect([bean, open])` resets form state on any background bean update while modal is open
- `handlePaywallError` is local to AddBeanForm and needs extraction to a shared utility
- Orphaned beans from crash-during-create need a distinct `draft` flag or TTL cleanup
- Three prior solution files directly apply: async-side-effect-during-render, react-lazy-at-module-scope, native-profile-load-failure-indistinguishable-from-missing

---

## Overview

Replace the two-form system (AddBeanForm for creating beans, EditBeanModal for editing) with a single editing surface. After scanning or manual entry, the bean is saved to Firestore immediately and EditBeanModal opens for review. This eliminates the outdated AddBeanForm review screen and ensures every new feature (process types, shelf-life override, product shot persistence, chapter layout) works for both new and existing beans.

## Problem Statement / Motivation

AddBeanForm.jsx (809 lines) and EditBeanModal.jsx (771 lines) are parallel implementations with significant drift. EditBeanModal has chapters, PeakTimeline, tasting note chips, grind settings, and product shot management. AddBeanForm has an older flat layout missing many of these features. Every UI improvement must be duplicated across both files, and they regularly fall out of sync (the process types bug that triggered this plan).

## Proposed Solution

Three components replace one:

1. **ScanSheet** (new, lightweight): Handles photo upload, Gemini scan, web enrichment, and progress indicators. Once scan completes, it builds the bean data, calls `addBean()`, and signals the parent to open EditBeanModal.

2. **ManualEntrySheet** (new, minimal): Simple roaster + name prompt. Creates a minimal SEALED bean, signals the parent to open EditBeanModal.

3. **EditBeanModal** (existing, minor changes): Gains an `isNewBean` prop. When true: "Save" creates the bean's first real save, and closing without saving triggers deletion of the auto-created bean.

AddBeanForm.jsx is deleted entirely.

## Technical Approach

### Architecture

```
Current:
  Add Bean button -> AddBeanForm (photo -> scan -> review -> save)
  Edit button     -> EditBeanModal

New:
  Add Bean button -> ScanSheet (photo -> scan -> auto-save)
                    OR ManualEntrySheet (roaster + name -> auto-save)
                  -> EditBeanModal (isNewBean=true, delete on cancel)
  Edit button     -> EditBeanModal (isNewBean=false, normal behavior)
```

### Phase 1: Extract bean creation logic

**Goal:** Extract the bean-building logic from AddBeanForm.handleSave into a shared utility so ScanSheet can create beans without duplicating the roaster profile lookup, peak window calculation, and enriched field merging.

**Files:**
| File | Change |
|------|--------|
| `src/lib/beanBuilder.js` (new) | `buildNewBeanData(formFields, options)` -- takes raw form fields, looks up roaster profile, computes peak windows, returns a Firestore-ready bean object |
| `src/components/AddBeanForm.jsx` | Refactor `handleSave` to use `buildNewBeanData` (keeps AddBeanForm working during transition) |

**Function signature:**
```js
import { getProfileForRoaster } from './roasterProfiles';
import { parseShelfLifeDays } from './peakStatus';

export function buildNewBeanData(fields, { aidenData, story } = {}) {
  // fields: { roaster, name, origin, variety, process, roastDate, bagSize,
  //           bagNotes, producer, altitude, region, farm, roastLevel,
  //           cupScore, brewingRec, sourcedBy, shelfLife, roastedIn }
  // aidenData: optional { aidenRecipe, aidenLink, aidenGrind } from QuickRecipe
  // story: optional string from background Ruphus generation
  // Returns: Firestore-ready bean object (no timestamps, no photoUrl)
}
```

**`buildNewBeanData(fields, options)` responsibilities:**

Core fields (always included):
```js
{
  roaster: fields.roaster.trim(),
  name: fields.name.trim(),
  origin: fields.origin.trim(),
  variety: fields.variety.trim(),
  process: fields.process,              // from PROCESS_TYPES dropdown, no trim
  roastDate: fields.roastDate || '',
  bagSize: Number(fields.bagSize) || 100,
  bagNotes: fields.bagNotes.trim(),
  producer: fields.producer.trim(),
  status: 'SEALED',
  jarSlot: null,
  openDate: null,
  finishDate: null,
  guidance: profile.guidance,           // from roaster profile lookup
  degasMin: profile.degasMin,
  degasMax: profile.degasMax,
  peakStart: profile.peakStart,
  peakEnd: computedPeakEnd,             // see shelf-life override below
}
```

Peak window calculation:
```js
const profile = getProfileForRoaster(fields.roaster);
const shelfDays = parseShelfLifeDays(fields.shelfLife);
const computedPeakEnd = (shelfDays && shelfDays > profile.peakEnd)
  ? shelfDays : profile.peakEnd;
```

Enriched fields (conditional, only if non-empty after trim):
- `altitude`, `region`, `farm`, `roastLevel`, `cupScore`, `brewingRec`, `sourcedBy`, `shelfLife`, `roastedIn`
- Pattern: `if (fields.altitude?.trim()) data.altitude = fields.altitude.trim();`

Aiden recipe fields (conditional, from `options.aidenData`):
```js
if (aidenData?.aidenRecipe) {
  data.aidenRecipe = {
    ...aidenData.aidenRecipe,
    generatedAt: aidenData.aidenRecipe.generatedAt || new Date().toISOString()
  };
  if (aidenData.aidenLink) data.aidenLink = aidenData.aidenLink;
  if (aidenData.aidenGrind) data.aidenGrind = aidenData.aidenGrind;
}
```

Story (conditional, from `options.story`):
```js
if (story) data.story = story;
```

**NOT included in buildNewBeanData** (handled elsewhere):
- `photoUrl` -- async upload, written separately via `updateBean`
- `createdAt`, `updatedAt` -- added by `addBean()` in useAppData via `serverTimestamp()`
- Pre-allocated Firestore doc ID -- handled by caller

### Research Insights: Phase 1

**From learnings (llm-prompt-sanitization-patterns):**
- When extracting shared code, identify the full dependency graph. Extract the complete unit including any validation/normalization that currently lives in AddBeanForm's surrounding code. The `researchBean` extraction (aiden.js to beanResearch.js) is a near-exact precedent. Sanitize at source in the shared utility so all callers (ScanSheet, ManualEntrySheet, QuickRecipe) get clean output by default.

**From learnings (closure-rename-missed-body-references):**
- After extraction, grep old names (`handleSave`, field references) across all files. Closure bodies inside event handlers reference variables that esbuild won't catch at build time. A phantom name compiles to valid JS and only throws at runtime.

**Gotchas:**
- `shelfLife` vs `shelfDays`: The form field stores the original string ("3 months"). `parseShelfLifeDays()` is used ONLY for computing peakEnd override. Both the original string AND the computed peakEnd are stored.
- `bagSize` uses `Number() || 100`, so empty/invalid defaults to 100.
- `process` is taken as-is from the dropdown (no trim).
- `profile.category` is NOT stored in beanData, only `guidance` is used.

**Verification:**
- [ ] Unit: `buildNewBeanData({ roaster: 'Test', name: 'Bean' })` returns valid object with all core fields
- [ ] Unit: Enriched fields omitted when empty, included when present
- [ ] Unit: Shelf-life override correctly extends peakEnd when shelfDays > profile.peakEnd
- [ ] Unit: Aiden fields included only when aidenData provided
- [ ] Integration: AddBeanForm.handleSave refactored to use `buildNewBeanData`, produces identical output

---

### Phase 2: Build ScanSheet

**Goal:** A lightweight modal that handles only the scan pipeline (photo -> scan -> enrich -> auto-save), then signals the parent to open EditBeanModal.

**Files:**
| File | Change |
|------|--------|
| `src/components/ScanSheet.jsx` (new) | Photo upload + scan + enrich + auto-save + progress UI |
| `src/lib/paywallHelpers.js` (new) | Extract `handlePaywallError` from AddBeanForm (lines 27-40) |

**State variables to migrate from AddBeanForm:**
| Variable | Type | AddBeanForm Line | Purpose |
|----------|------|-----------------|---------|
| `photos` | useState | 56 | Array of `{ base64, mediaType, previewUrl }` objects (max 3) |
| `step` | useState | 54 | Pipeline stage: `'photo'` -> `'scanning'` -> `'researching'` -> (auto-save) |
| `scanError` | useState | 55 | Error message string or null |
| `productShotStatus` | useState | 63 | `'idle'` / `'generating'` / `'ready'` / `'failed'` |
| `photoChoice` | useState | 64 | `'original'` / `'productShot'` |
| `storyRef` | useRef | 59 | Background Ruphus story (may be null at save time) |
| `genCounter` | useRef | 60 | Monotonic counter, invalidates stale async results on rescan |
| `pendingBeanIdRef` | useRef | 61 | Pre-allocated Firestore doc ID for Storage paths |
| `productShotUrlRef` | useRef | 62 | Holds photoUrl from pre-generated product shot |
| `fileRef` | useRef | 58 | DOM ref to hidden file input |

**Handlers to migrate:**
| Handler | AddBeanForm Lines | Purpose |
|---------|-------------------|---------|
| `takeNativePhoto()` | 113-142 | Capacitor Camera API capture (1200x1200, 85% quality) |
| `handlePhoto(e)` | 144-156 | Web file input + `compressImage()` |
| `removePhoto(idx)` | 158-165 | Remove from array, revoke preview URL blob |
| `handleScan()` | 167-253 | Paywall gate -> scanBeanLabel -> pre-allocate ID -> researchBeanOnline -> Ruphus story |
| `handleGenerateProductShot()` | 291-326 | Paywall gate -> generate AI product shot |
| `handleAiFill()` | 255-289 | Standalone research enrichment (for manual entries) |
| `reset()` | 93-111 | Cleanup: revoke URLs, delete orphaned product shot, reset state, increment genCounter |

**Hook dependencies:**
| Hook | Import | Values Used |
|------|--------|-------------|
| `useSubscription()` | SubscriptionContext | `hasPro`, `freeUsage` for paywall gates |
| `usePaywall()` | usePaywall.jsx | `openPaywall()` for quota-exceeded routing |

**API calls:**
| Function | From | Metered? | Notes |
|----------|------|----------|-------|
| `scanBeanLabel(photos)` | gemini.js:18 | Yes (aiScans) | Returns 17-field JSON, ~3-5s |
| `researchBeanOnline(data, opts)` | gemini.js:120 | Conditional (`metered: true` for AI Fill only) | Returns enriched fields + roaster info, ~2-4s |
| `generateProductShot(photo, beanId, opts)` | gemini.js:188 | Server-side | Returns `{ photoUrl }` |
| `deleteProductShot(beanId)` | gemini.js:205 | N/A | Cleanup on reset/cancel |
| `generateRuphusStory(bean, opts)` | professorRuphus.js:15 | No | Fire-and-forget background, ~5-8s |
| `uploadOriginalPhoto(beanId, photo, opts)` | storage.js:14 | Server-side | XHR workaround for iOS |
| `compressImage(file)` | claude.js:52 | N/A | Local compression |

**ScanSheet auto-save flow (after scan completes):**
```
scanBeanLabel(photos) -> scannedFields
  pre-allocate Firestore ID -> pendingBeanIdRef
  researchBeanOnline(scannedFields) -> enrichedFields (merge empty fields only)
  generateRuphusStory(enrichedData) -> fire-and-forget to storyRef
  buildNewBeanData(mergedFields, { story: storyRef.current })
  addBean(beanData, pendingBeanIdRef.current)
  -> onBeanCreated(beanId, beanData)  // pass beanData directly!
```

**ScanSheet does NOT include:**
- Any form fields for editing bean data (that's EditBeanModal's job)
- Save button (auto-saves when scan completes)
- Review step (that's EditBeanModal)

**Props:** `{ open, onClose, onBeanCreated, uid, addBean, updateBean }`

**Step transitions:**
| Step | UI | From | To |
|------|-----|------|-----|
| `'photo'` | Photo gallery (1-3 thumbnails) + camera/file picker + "Scan" button | Initial or after reset | `'scanning'` |
| `'scanning'` | Loading spinner + thumbnail gallery | `'photo'` | `'researching'` |
| `'researching'` | Loading + skip button | `'scanning'` | (auto-save + close) |

### Research Insights: Phase 2

**From learnings (react-lazy-inside-render-destroys-state):**
- ScanSheet holds complex async state (photos, scan progress, enrichment results) that would be catastrophic to lose mid-flow. If code-splitting is used, `React.lazy()` MUST be called at module scope, never inside a component body. Verify all lazy imports in InventoryTab.

**From learnings (async-side-effect-during-react-render):**
- The auto-save `addBean()` call must be in a handler callback or useEffect, never triggered from render-phase conditional logic. Use a ref guard if needed to prevent double-fires.

**Performance optimization -- photo upload:**
- Use `skipFirestoreWrite: false` for photo upload in auto-save path. The server `/api/product-shot` endpoint writes photoUrl directly to the bean doc. No client-side `updateBean` call needed, saving one round-trip and one full collection refetch.

**Performance optimization -- parallelism after scan:**
- Once `scanBeanLabel` completes, these can run in parallel: `researchBeanOnline(scanData)`, `generateRuphusStory(scanData)`, and Firestore ID pre-allocation.
- Product shot generation stays user-triggered (correct: deferred to EditBeanModal).

**Verification:**
- [ ] Scan -> auto-save -> EditBeanModal opens with scanned data (golden path)
- [ ] Cancel during scan: no bean created, clean exit
- [ ] Rescan after first scan: genCounter invalidates stale results
- [ ] Free-tier paywall gate blocks scan when quota exceeded
- [ ] Product shot pre-generation uses pre-allocated beanId
- [ ] Reset cleanup: revoke URLs, delete orphaned product shot, increment genCounter
- [ ] Native photo capture works (Capacitor Camera API)
- [ ] Web file upload works (file input + compressImage)

---

### Phase 3: Build ManualEntrySheet

**Goal:** Minimal prompt for manual bean entry (no photo).

**Files:**
| File | Change |
|------|--------|
| `src/components/ManualEntrySheet.jsx` (new) | Roaster + name inputs + "Add" button |

**ManualEntrySheet responsibilities:**
- Two required fields: Roaster, Name
- "Add" button -> `buildNewBeanData({ roaster, name })` -> `addBean(beanData)` -> `onBeanCreated(beanId, beanData)`
- No scan, no enrichment, no photos. All other fields are filled in EditBeanModal.
- Validation: both fields non-empty after trim

**Props:** `{ open, onClose, onBeanCreated, addBean }`

### Research Insights: Phase 3

**AI Fill gap (from architecture review):**
- Manual entry creates a minimal bean with only roaster + name. The user needs a way to trigger research enrichment from within EditBeanModal. AddBeanForm has an "AI Fill" button (lines 255-289) that calls `researchBeanOnline`. EditBeanModal does NOT currently have this button. Ruphus enrichment via `useProfessorRuphus` is a separate mechanism (story generation, not field enrichment).
- **Action required:** Either add an "AI Fill" button to EditBeanModal, or move the AI Fill handler to ScanSheet and offer a "Skip to Manual with AI Fill" option. The simpler path is adding AI Fill to EditBeanModal since it already has all the bean fields visible.

**Verification:**
- [ ] Roaster + name required, both trimmed
- [ ] Creates SEALED bean with default peak windows from roaster profile
- [ ] EditBeanModal opens with the new bean for further editing
- [ ] AI Fill works from EditBeanModal for manual-entry beans

---

### Phase 4: Wire up EditBeanModal for new beans

**Goal:** EditBeanModal handles newly created beans with delete-on-cancel behavior.

**Files:**
| File | Change |
|------|--------|
| `src/components/EditBeanModal.jsx` | Add `isNewBean` prop. When true: closing without saving deletes the bean. Fix form-init useEffect. |

**Changes:**

1. New prop: `isNewBean` (boolean, default false)

2. Track whether user has pressed Save:
```js
const savedRef = useRef(false);
// Reset when modal opens with a new bean:
useEffect(() => { if (open && isNewBean) savedRef.current = false; }, [open, isNewBean]);
```

3. `onClose` behavior when `isNewBean && !savedRef.current`:
   - Call `deleteBean(bean.id)` (hard delete: removes doc + cascades tastings + cleans Storage photos)
   - `deleteBean` already calls `deleteBeanPhoto(uid, beanId)` internally

4. When `isNewBean`: change "Save Changes" button text to "Add Bean"

5. When `isNewBean`: hide "Delete Bean" confirmation panel (bean doesn't meaningfully exist yet). Change cancel button text to "Discard".

6. **Fix form-init useEffect (CRITICAL):** The current `useEffect([bean, open])` resets form state on ANY background bean update (Ruphus story write, product shot write, notesSummary write) while the modal is open. This causes data loss if the user has started editing:
```js
// CURRENT (buggy):
useEffect(() => {
  if (bean && open) { setF({ ...bean fields... }); }
}, [bean, open]);

// FIXED:
const wasOpen = useRef(false);
useEffect(() => {
  if (open && !wasOpen.current && bean) {
    setF({ ...bean fields... });
  }
  wasOpen.current = open;
}, [bean, open]);
```

7. **Save with no changes optimization:** When `isNewBean` and no fields changed, just set `savedRef.current = true` and close (skip the empty `updateBean` call).

**EditBeanModal already handles:**
- Product shot generation + upload (B2 fix)
- Shelf-life override (B3 fix)
- 15 process types (B1 fix)
- Grind settings, PeakTimeline, tasting note chips, enriched fields

### Research Insights: Phase 4

**From learnings (native-profile-load-failure):**
- The `isNewBean` pattern introduces a "two states that look the same" risk. If `addBean()` fails silently on native (network error), the modal renders with no bean data. On cancel, it tries to delete a doc that was never written. Distinguish three states:
  - **Creation in progress**: Show spinner, block interaction
  - **Created, safe to edit**: Normal EditBeanModal behavior
  - **Creation failed**: Show error, cancel is a no-op (nothing to delete)

**From performance review:**
- `handleSave` computes a diff against the original `bean` prop. For `isNewBean`, if the auto-saved bean and form state start identical, the diff will be empty. Pressing "Add Bean" without edits would call `updateBean` with just `updatedAt`. Short-circuit: if `isNewBean` and no changes, just mark saved and close.

**From security review (MEDIUM):**
- Orphaned beans from crash-during-create: consider adding `draft: true` field to auto-saved beans. Clear on first save in EditBeanModal. Filter drafts from main inventory list. Optional but prevents user confusion from seeing minimal-data beans.

**Verification:**
- [ ] `isNewBean=true`: closing without save deletes the bean
- [ ] `isNewBean=true`: pressing "Add Bean" persists the bean (survives close)
- [ ] `isNewBean=false`: normal edit behavior unchanged
- [ ] Form state survives background bean updates while modal is open (useEffect fix)
- [ ] Product shot generation still works (photoInFlight ref guard)
- [ ] Delete button hidden when `isNewBean=true`
- [ ] "Add Bean" button text when `isNewBean=true`, "Save Changes" otherwise

---

### Phase 5: Replace AddBeanForm in parent components

**Goal:** Wire ScanSheet + ManualEntrySheet + EditBeanModal into InventoryTab and RotationTab.

**Files:**
| File | Change |
|------|--------|
| `src/tabs/InventoryTab.jsx` | Replace AddBeanForm with ScanSheet/ManualEntrySheet + EditBeanModal |
| `src/tabs/RotationTab.jsx` | Replace AddBeanForm with direct bean creation + EditBeanModal |
| `src/App.jsx` | Update onboarding `postCompleteAction='scan'` flow |

**InventoryTab flow:**
```
"Add Bean" button
  -> Show choice: "Scan a Bag" or "Add Manually"
  -> Scan: open ScanSheet -> onBeanCreated -> open EditBeanModal(isNewBean=true)
  -> Manual: open ManualEntrySheet -> onBeanCreated -> open EditBeanModal(isNewBean=true)
```

State management:
```js
const [scanOpen, setScanOpen] = useState(false);
const [manualOpen, setManualOpen] = useState(false);
const [newBeanEntry, setNewBeanEntry] = useState(null); // { id, ...beanData }

// When ScanSheet or ManualEntrySheet creates a bean:
const handleBeanCreated = (beanId, beanData) => {
  setScanOpen(false);
  setManualOpen(false);
  setNewBeanEntry({ id: beanId, ...beanData }); // triggers EditBeanModal
};
```

**RotationTab Quick Recipe flow:**
- Currently passes `initialData` (with aidenRecipe, aidenLink, aidenGrind) to AddBeanForm
- New: call `buildNewBeanData(initialData, { aidenData: { aidenRecipe, aidenLink, aidenGrind } })` directly, call `addBean()`, then open EditBeanModal with the new bean
- No ScanSheet needed (data is already complete from Quick Recipe)

**Onboarding postCompleteAction='scan':**
- Currently sets `pendingAddBean=true` which opens AddBeanForm
- New: sets `pendingScan=true` which opens ScanSheet directly

### Research Insights: Phase 5

**CRITICAL: Pass beanData directly, not beans.find() (from architecture + performance reviews):**

The plan's original pattern was:
```js
const newBean = newBeanId ? beans.find(b => b.id === newBeanId) : null;
```

This is **broken on web**: `refetch()` is a no-op on web (useAppData.js line 65). The web path relies on `onSnapshot` listeners, which fire asynchronously (50-300ms after write). During that window, `beans.find()` returns `undefined`.

On native, `refetch()` awaits `getDocs()`, but `setBeans()` is an async state update. The parent's next render with the updated `beans` array happens on the next tick, after `handleBeanCreated` has already run.

**Fix:** Pass the constructed `beanData` object through the callback:
```js
// ScanSheet/ManualEntrySheet:
onBeanCreated(beanId, beanData);  // pass both ID and data

// Parent:
const handleBeanCreated = (beanId, beanData) => {
  setNewBeanEntry({ id: beanId, ...beanData });
};

// EditBeanModal receives newBeanEntry directly:
<EditBeanModal bean={newBeanEntry} isNewBean={true} ... />
```

EditBeanModal initializes its form state from the `bean` prop. If the constructed object is passed directly, the modal opens instantly with zero round-trip latency. The `onSnapshot` listener (web) or next `refetch()` (native) syncs the canonical version in the background.

**From learnings (firestore-settings-phase2-write-patterns):**
- New modals (ScanSheet, ManualEntrySheet) must use the canonical overlay style: `rgba(44,24,16,0.4)` + `backdropFilter: 'blur(4px)'`.
- One logical change = one Firestore write. The auto-save path should batch scan + enrichment results into a single `addBean` call, not write incrementally.

**Intermediate state:** Between ScanSheet closing and EditBeanModal opening, neither modal is visible for a brief moment. If there's a flash, add a brief loading state or keep ScanSheet visible until `setNewBeanEntry` is set.

**Verification:**
- [ ] Scan flow: ScanSheet -> auto-save -> EditBeanModal opens instantly (no spinner, no race)
- [ ] Manual flow: ManualEntrySheet -> save -> EditBeanModal opens instantly
- [ ] Quick Recipe: save-to-inventory creates bean with Aiden recipe data, opens EditBeanModal
- [ ] Onboarding postCompleteAction='scan' opens ScanSheet
- [ ] Cancel in EditBeanModal (isNewBean) deletes the auto-created bean
- [ ] No flash of empty state between ScanSheet close and EditBeanModal open
- [ ] Web: works correctly (no beans.find() race condition)
- [ ] Native: works correctly (no refetch timing dependency)

---

### Phase 6: Delete AddBeanForm

**Goal:** Remove the old component entirely.

**Files:**
| File | Change |
|------|--------|
| `src/components/AddBeanForm.jsx` | Delete |

Only after all references are rewired and tested.

### Research Insights: Phase 6

**Post-deletion verification checklist:**
- [ ] `grep -r 'AddBeanForm' src/` returns zero results
- [ ] `grep -r 'addBeanForm\|add-bean-form\|addbean' src/` returns zero results (case-insensitive check)
- [ ] `grep -r 'pendingAddBean' src/` -- all references updated to `pendingScan` or removed
- [ ] `grep -r 'handlePaywallError' src/` -- verify extracted to `paywallHelpers.js`, not orphaned
- [ ] Build passes: `npm run build`
- [ ] No console errors in dev: `npm run dev`

---

## Edge Cases

- **Bean created but EditBeanModal never opens** (crash, navigation): Orphaned SEALED bean with minimal data. Not harmful, user can delete from Inventory. Consider adding `draft: true` field to make orphans invisible in the main list. Low risk.
- **User presses Add Bean, scans, auto-saves, then immediately presses Add Bean again**: ScanSheet should be blocked while `newBeanEntry` is set (EditBeanModal is open).
- **Firestore write timing**: Eliminated as a concern by passing beanData directly through the callback chain instead of relying on `beans.find()`.
- **Quick Recipe initialData with aidenRecipe**: The Aiden recipe fields must be included in `buildNewBeanData` output via the `aidenData` option. EditBeanModal doesn't currently display Aiden recipe data in its form, but it's persisted on the bean doc and shown via AidenModal.
- **Product shot pre-generation in ScanSheet**: Needs the pre-allocated beanId (same pattern as current AddBeanForm). The product shot URL is written to Firestore server-side, so EditBeanModal will see it via the live bean snapshot.
- **Cancel during scan**: If user closes ScanSheet before scan completes, no bean was created (auto-save only happens after scan succeeds). Clean exit. Reset cleanup revokes preview URLs and deletes orphaned product shots.
- **Cancel after auto-save but before EditBeanModal**: Bean exists in Firestore but EditBeanModal's delete-on-cancel hasn't fired. Handle: if `newBeanEntry` is set but EditBeanModal closes without save, delete the bean.
- **Background writes while EditBeanModal is open**: Ruphus story, product shot, notesSummary all fire-and-forget to the bean doc. Form-init useEffect must NOT re-run while modal is open (use wasOpen ref guard). Background writes persist to Firestore but don't reset the form.
- **addBean() fails on native (network error)**: Distinguish creation-failed state from creation-succeeded. On failure, show error and make cancel a no-op (nothing to delete).

## Acceptance Criteria

- [ ] Scanning a bean photo opens EditBeanModal (with chapters, PeakTimeline, 15 process types, shelf-life override) instead of the old AddBeanForm review screen
- [ ] Manual "Add Bean" opens EditBeanModal after entering roaster + name
- [ ] Closing EditBeanModal without saving on a new bean deletes it (no orphaned beans)
- [ ] Pressing "Save" / "Add Bean" on a new bean persists it (survives modal close)
- [ ] Quick Recipe save-to-inventory flow works (Aiden recipe, grind, brew link preserved)
- [ ] Onboarding postCompleteAction='scan' opens ScanSheet, not the old form
- [ ] Product shot generation works from ScanSheet (pre-allocated beanId)
- [ ] AddBeanForm.jsx is deleted, no remaining imports
- [ ] AI Fill / manual research works from EditBeanModal (must add button if not present)
- [ ] Form state survives background bean updates (Ruphus story, product shot, notesSummary)
- [ ] Works correctly on both web (onSnapshot) and native (refetch) without race conditions

## Dependencies & Risks

- **Risk: Firestore refetch latency.** Mitigated by passing beanData directly through the callback chain. No `beans.find()` lookup needed. EditBeanModal opens instantly with the constructed data.
- **Risk: ScanSheet complexity.** The scan pipeline (photo gallery, scan, enrich, product shot pre-gen) is ~200 lines of logic + ~100 lines of UI. Most moves directly from AddBeanForm. Risk is introducing bugs during extraction. Mitigate: keep AddBeanForm working during Phase 1-4, only delete in Phase 6 after full testing.
- **Risk: Form-init useEffect data loss.** The current `[bean, open]` dependency means background bean updates reset form state. Must fix with wasOpen ref guard before wiring up the new flow.
- **Risk: AI Fill gap.** EditBeanModal currently has no on-demand research enrichment button. Manual-entry users lose this capability when AddBeanForm is deleted. Must add to EditBeanModal or provide alternative.
- **Dependency:** B1-B4 bug fixes (on `fix/b1-process-types` branch) must be merged first, since this plan assumes EditBeanModal has the 15 process types, shelf-life override, and product shot persistence.

## Security Assessment

**Overall: LOW severity.** No new attack surfaces introduced.

- Pre-allocated Firestore doc IDs are 20-character random UUIDs. Firestore rules enforce `request.auth.uid == userId` on all bean reads/writes. No cross-user risk.
- ScanSheet auto-save reuses the same authenticated write path (`addBean`) as current AddBeanForm.
- Photo upload validated server-side: MIME type allowlist + `sharp().metadata()` format verification + 5MB cap.
- `buildNewBeanData` must preserve `.trim()` on all string fields and the enriched-field allowlist pattern from current `handleSave`.
- MEDIUM: orphaned beans from crash-during-create. Not a security issue, but a data hygiene concern. Consider TTL cleanup or `draft` flag.

## Applicable Learnings from docs/solutions/

1. **async-side-effect-during-react-render**: Never call `addBean()` from render phase. Always use event handler or useEffect with ref guard.
2. **react-lazy-inside-render-destroys-state**: All `React.lazy()` calls for ScanSheet/ManualEntrySheet must be at module scope. Failure destroys in-flight scan state.
3. **closure-rename-missed-body-references**: After extracting buildNewBeanData and deleting AddBeanForm, grep all old identifiers across closure bodies.
4. **llm-prompt-sanitization-patterns**: Extract the complete dependency graph with buildNewBeanData. Sanitize at source.
5. **firestore-settings-phase2-write-patterns**: One logical change = one Firestore write. New modals use canonical overlay style.
6. **native-profile-load-failure**: Distinguish creation-pending/created/failed for isNewBean to avoid silent data loss on native.

## Sources & References

- AddBeanForm.jsx (809 lines, to be deleted)
- EditBeanModal.jsx (771 lines, gains `isNewBean` prop + useEffect fix)
- useAppData.js:197-211 (`addBean` function), line 65 (`refetch` no-op on web)
- InventoryTab.jsx:209 (current AddBeanForm mount)
- RotationTab.jsx:371-380 (Quick Recipe AddBeanForm mount)
- App.jsx:121-123 (onboarding postCompleteAction flow)
- roasterProfiles.js (getProfileForRoaster return shape)
- peakStatus.js (parseShelfLifeDays, effectivePeakEnd)
- beanFields.js (PROCESS_TYPES, classifyFamilyFallback, ENRICHABLE_FIELDS)
- gemini.js:18 (scanBeanLabel), :120 (researchBeanOnline), :188 (generateProductShot)
- storage.js:14 (uploadOriginalPhoto), :39 (deleteBeanPhoto)
- professorRuphus.js:15 (generateRuphusStory)

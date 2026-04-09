---
title: "fix: Product Shot UX (spinner, toast, polling delay)"
type: fix
status: active
date: 2026-04-09
origin: docs/brainstorms/2026-04-09-product-shot-ux-fixes-requirements.md
---

# fix: Product Shot UX (spinner, toast, polling delay)

## Enhancement Summary

**Deepened on:** 2026-04-09
**Sections enhanced:** 3 units + Toast component fix
**Review agents used:** Frontend Races, Code Simplicity, React Best Practices, Learnings Researcher, Toast UX Researcher

### Key Improvements from Deepening
1. **Race condition in useEffect line 46**: `photoInFlight.current = false` is unconditionally reset, defeating the guard. Must be removed from the useEffect entirely.
2. **Redundant Firestore write on web**: `updateBean` in `.then()` triggers a second `onSnapshot` cycle. Gate to native-only with `Capacitor.isNativePlatform()`.
3. **Delete-while-in-flight**: Check `photoInFlight.current` at start of `.then()` to skip if bean was deleted.
4. **Toast timer bug**: Changing the toast message does not reset the 2.5s timer. Add `message` to Toast's useEffect deps.
5. **Unit 3 removed**: QuickRecipeFlow does not use `generateProductShot`. The unit was speculative.

### Critical Research Finding
The `useRef(false)` re-entry guard is the established pattern in this codebase (see `docs/solutions/runtime-errors/async-side-effect-during-react-render.md`). The plan now uses this pattern consistently. React 19 makes setState on unmounted components a no-op, so `mountedRef` checks are optional but `.then()` callbacks that call `updateBean` (writing to Firestore) still need guard checks.

---

## Overview

Product shot generation works server-side but the client UX is broken: spinner resets prematurely in EditBeanModal, no feedback in AddBeanForm, and 60s native polling delay before photos appear. Three targeted fixes, all client-side React state changes. (see origin: docs/brainstorms/2026-04-09-product-shot-ux-fixes-requirements.md)

## Problem Statement

1. **EditBeanModal spinner resets early**: `useEffect([bean, open])` resets `photoGenerating=false` AND `photoInFlight.current=false` whenever the `bean` prop changes. When the server writes `photoUrl` to Firestore, the bean prop updates, killing the spinner before the `.then()` callback fires.

2. **Native 60s polling delay**: On iOS, Firestore uses polling (not `onSnapshot`). After the server writes `photoUrl`, the app waits up to 60s for the next poll. But `generateProductShot` already returns `{ photoUrl }` in the response, so the client can call `updateBean` immediately to bypass the poll. On web, `onSnapshot` delivers the update immediately, so `updateBean` is redundant and should be skipped.

3. **AddBeanForm zero feedback**: Modal closes, product shot fires in background, no indication to user. Photo appears 60-90s later. Need a Toast.

## Implementation Units

### Unit 1: Fix EditBeanModal spinner guard + immediate photo update

**Goal:** Spinner stays visible from "Generating..." through to photo appearing. Photo appears immediately on native (not 60s poll wait).

**Files:** `src/components/EditBeanModal.jsx`

**Approach:**

1. In the `useEffect([bean, open])`, protect ALL photo state (including `photoInFlight.current`) behind the guard. **Remove the unconditional `photoInFlight.current = false` on line 46:**

```jsx
useEffect(() => {
  if (bean && open) {
    setF({ /* ... form fields from bean ... */ });
    // Only reset photo state if no generation is in flight
    if (!photoInFlight.current) {
      setPhotoGenerating(false);
      setPhotoError(false);
    }
    setConfirmDelete(false);
    // NOTE: photoInFlight.current is NOT reset here.
    // It is only reset in fireProductShot's .then()/.catch() and handleDelete.
  }
}, [bean, open]);
```

2. In `fireProductShot`, check `photoInFlight.current` at the start of `.then()` (handles delete-while-in-flight). Call `updateBean` only on native (web gets the update via `onSnapshot` already). Sequence the ref reset AFTER `updateBean` settles:

```jsx
const fireProductShot = (photo) => {
  if (photoInFlight.current || !bean.id) return;
  photoInFlight.current = true;
  setPhotoGenerating(true);
  setPhotoError(false);
  const capturedBeanId = bean.id;
  generateProductShot(photo, capturedBeanId)
    .then(photoUrl => {
      if (!photoInFlight.current) return; // canceled (bean deleted)
      setPhotoGenerating(false);
      // On native, updateBean triggers refetch (bypasses 60s poll).
      // On web, onSnapshot already delivered the update, so skip to avoid redundant write.
      if (Capacitor.isNativePlatform() && updateBean) {
        updateBean(capturedBeanId, { photoUrl })
          .finally(() => { photoInFlight.current = false; });
      } else {
        photoInFlight.current = false;
      }
    })
    .catch(err => {
      if (!photoInFlight.current) return; // canceled
      alert('Photo generation failed: ' + err.message);
      setPhotoGenerating(false);
      setPhotoError(true);
      photoInFlight.current = false;
    });
};
```

**Verification:** Open EditBeanModal, add photo. Spinner stays visible continuously until photo appears. No "Add Photo" gap. Works on both web (onSnapshot) and native (updateBean refetch).

---

### Unit 2: Fix AddBeanForm with toast callback + immediate native update

**Goal:** After save, show toast on inventory screen while product shot generates. Photo appears fast on native via direct updateBean call.

**Files:**
- `src/components/AddBeanForm.jsx` -- accept `onToast` prop, use in fire-and-forget
- `src/tabs/InventoryTab.jsx` -- pass `onToast={setToast}` to AddBeanForm
- `src/tabs/RotationTab.jsx` -- pass `onToast={setToast}` to AddBeanForm

**Approach:**

In `InventoryTab.jsx`, pass the existing `setToast` to AddBeanForm:
```jsx
<AddBeanForm
  open={showAdd}
  onClose={() => setShowAdd(false)}
  onAdd={onAddBean}
  uid={uid}
  updateBean={updateBean}
  onToast={setToast}
/>
```

Same in `RotationTab.jsx` if it renders AddBeanForm.

In `AddBeanForm.jsx`, accept `onToast` prop. In the fire-and-forget after save:
```jsx
// Fire-and-forget after modal close
if (beanId && scanPhoto) {
  if (onToast) onToast('Generating product shot...');
  generateProductShot(scanPhoto, beanId)
    .then(photoUrl => {
      // On native, trigger immediate UI update (bypasses 60s poll)
      if (Capacitor.isNativePlatform() && updateBean) {
        updateBean(beanId, { photoUrl });
      }
      if (onToast) onToast('Product shot ready!');
    })
    .catch(err => {
      if (onToast) onToast('Product shot failed');
    });
}
```

**Note:** `onToast` is `setToast` from InventoryTab's useState. React guarantees setState identity stability, so the closure is safe even after AddBeanForm unmounts. `updateBean` is a useCallback with stable deps. Both survive the modal close.

**Verification:** Add a bean via scan. Modal closes. Toast shows "Generating product shot...". After ~30-60s, photo appears on bean card and "Product shot ready!" toast shows.

---

### Unit 3: Fix Toast timer reset on message change

**Goal:** When a new toast message replaces the current one, reset the 2.5s auto-dismiss timer.

**Files:** `src/components/Toast.jsx`

**Approach:** Add `message` to the useEffect dependency array so the timer resets when the message changes:

```jsx
useEffect(() => {
  if (!open) return;
  const timer = setTimeout(onClose, 2500);
  return () => clearTimeout(timer);
}, [open, onClose, message]); // <-- add message
```

Without this, if "Generating product shot..." is showing and the user triggers another toast (e.g., "Bean finished!"), the new message appears but the old timer expires almost immediately, hiding it.

**Verification:** Show a toast, then quickly trigger a different toast message. The new message should stay visible for the full 2.5s.

---

## Implementation Order

```
Unit 3 (Toast timer fix - standalone, no dependencies)
Unit 1 (EditBeanModal spinner guard)
Unit 2 (AddBeanForm toast + native update)
```

Unit 3 first because it's a one-line change that improves the Toast for all consumers.

## Acceptance Criteria

- [ ] EditBeanModal: spinner stays visible from tap through photo appearing (R1)
- [ ] EditBeanModal: no "Add Photo" gap when bean prop updates mid-generation
- [ ] EditBeanModal: photo appears immediately on native via updateBean refetch (R2)
- [ ] EditBeanModal: delete-while-in-flight does not call updateBean on deleted doc
- [ ] AddBeanForm: "Generating product shot..." toast appears after save (R3)
- [ ] AddBeanForm: "Product shot ready!" toast when done, photo on bean card (R3)
- [ ] AddBeanForm: "Product shot failed" toast on error (R3)
- [ ] AddBeanForm: photo appears via updateBean on native, onSnapshot on web (R2)
- [ ] Toast: message change resets auto-dismiss timer
- [ ] No regressions on web (onSnapshot still works)
- [ ] Build succeeds

## Files Changed

| File | Units | Change |
|------|-------|--------|
| `src/components/Toast.jsx` | 3 | Add `message` to useEffect deps |
| `src/components/EditBeanModal.jsx` | 1 | useEffect guard (remove line 46 reset), native-only updateBean in .then(), delete guard |
| `src/components/AddBeanForm.jsx` | 2 | Accept onToast prop, toast + native updateBean in fire-and-forget |
| `src/tabs/InventoryTab.jsx` | 2 | Pass onToast={setToast} to AddBeanForm |
| `src/tabs/RotationTab.jsx` | 2 | Pass onToast={setToast} to AddBeanForm |

## Risk Analysis

- **Ref guard is the established codebase pattern** (see `docs/solutions/runtime-errors/async-side-effect-during-react-render.md`). Low risk.
- **Native-only updateBean gating** prevents redundant Firestore writes on web. Low risk.
- **Toast closure safety**: `setToast` (React setState) and `updateBean` (useCallback) are both identity-stable. Safe to use in fire-and-forget closures after component unmount.
- **photoInFlight.current as cancellation signal**: Checked at start of .then()/.catch(). If false (bean deleted), callbacks return early. Clean pattern.

## Sources

- **Origin document:** [docs/brainstorms/2026-04-09-product-shot-ux-fixes-requirements.md](docs/brainstorms/2026-04-09-product-shot-ux-fixes-requirements.md)
- **Codebase learning:** `docs/solutions/runtime-errors/async-side-effect-during-react-render.md` -- useRef(false) re-entry guard pattern
- **Codebase learning:** `docs/solutions/logic-errors/share-card-capture-retry-null-safety.md` -- async capture retry patterns
- Toast component: `src/components/Toast.jsx` (props: message, open, onClose; auto-dismisses 2500ms)
- Toast usage pattern: `src/tabs/InventoryTab.jsx:32` (`const [toast, setToast] = useState(null)`)
- useEffect reset: `src/components/EditBeanModal.jsx:21-48`
- Native polling: `src/hooks/useAppData.js:68-125` (60s interval)
- updateBean + refetch: `src/hooks/useAppData.js:166-174`

## Follow-Up Items (not in this PR)

- **Lift toast state to App level** so completion notifications survive tab navigation. Currently tab-local, which means navigating away loses the callback. Acceptable for v1 since users typically stay on the same tab.
- **Bean card photo placeholder/shimmer** while product shot is generating. Instagram/Slack pattern: item appears with placeholder, photo replaces it when ready.

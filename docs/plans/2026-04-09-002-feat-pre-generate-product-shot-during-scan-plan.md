---
title: "feat: Pre-generate product shot during scan phase"
type: feat
status: active
date: 2026-04-09
origin: conversation (brainstorm 2026-04-09, product shot UX session)
---

# feat: Pre-generate Product Shot During Scan Phase

## Overview

Move product shot generation from after-save to during-scan. Pre-allocate a Firestore document ID before saving, start generation in the background during the review phase (~30-60s), so the photo is ready or nearly ready by the time the user taps Save.

## Problem Statement

Currently: scan -> review form -> save -> THEN generate product shot (30-60s wait). The user sees "Generating product shot..." toast after save, then waits 30-60s for the photo to appear. The generation could be happening in parallel during the review phase, but the server needs a `beanId` for the Storage path, and the bean doesn't exist until save.

## Proposed Solution

1. Pre-allocate a `beanId` using `doc(collection).id` (no Firestore write, just generates an ID)
2. Fire product shot generation during scan phase with the pre-allocated ID
3. Server generates image, converts to JPEG, uploads to Storage. **Server does NOT write to Firestore** (bean doc may not exist yet).
4. Client holds the returned `photoUrl` in a ref
5. On save: use `setDoc` with the pre-allocated ID, include `photoUrl` in the bean data if available
6. On cancel/rescan: clean up orphaned Storage file

## Architecture Decision: Server Writes to Storage Only

The server endpoint (`api/product-shot.js`) currently does 4 things: generate, convert, upload, write to Firestore. For pre-generation, the Firestore write is problematic:
- `update()` fails with NOT_FOUND if the bean doc doesn't exist yet
- `set({merge:true})` creates ghost documents if the user cancels

**Decision:** Add a `skipFirestoreWrite` flag to the endpoint. When true, the server uploads to Storage and returns `{ photoUrl }` without touching Firestore. The client includes `photoUrl` in the `setDoc` payload at save time. The existing EditBeanModal flow continues to use `skipFirestoreWrite: false` (bean already exists).

## Implementation Units

### Unit 1: Add `skipFirestoreWrite` flag to server endpoint

**Goal:** Server can skip the Firestore write when called from the pre-generation flow.

**Files:** `api/product-shot.js`

**Approach:**
```js
const { photo, beanId, skipFirestoreWrite } = req.body;

// ... generate, convert, upload (unchanged) ...

// Step 4: Write photoUrl to Firestore (unless pre-generating)
if (!skipFirestoreWrite) {
  const db = getDb();
  await db.collection('users').doc(uid).collection('beans').doc(beanId).update({
    photoUrl, updatedAt: new Date(),
  });
}

return res.status(200).json({ photoUrl });
```

**Verification:** Endpoint works with both `skipFirestoreWrite: true` and `false`.

---

### Unit 2: Update `generateProductShot` client helper

**Goal:** Client helper supports the `skipFirestoreWrite` flag.

**Files:** `src/lib/gemini.js`

**Approach:**
```js
export async function generateProductShot(photo, beanId, { skipFirestoreWrite = false } = {}) {
  const data = await fetchWithRetry({
    url: `${API_BASE}/api/product-shot`,
    body: { photo: { base64: photo.base64, mimeType: photo.mediaType }, beanId, skipFirestoreWrite },
    serviceName: 'Product Shot',
    retries: 0,
    timeout: 90000,
  });
  if (!data.photoUrl) throw new Error('No photo URL returned');
  return data.photoUrl;
}
```

**Verification:** Existing EditBeanModal calls still work (default `skipFirestoreWrite: false`).

---

### Unit 3: Modify `addBean` to support pre-allocated IDs

**Goal:** `addBean` can accept an optional `beanId` and use `setDoc` instead of `addDoc`.

**Files:** `src/hooks/useAppData.js`

**Approach:**
```js
import { collection, doc, addDoc, setDoc, ... } from 'firebase/firestore';

const addBean = useCallback(async (beanData, existingId = null) => {
  if (!uid) return;
  const beanRef = existingId
    ? doc(db, 'users', uid, 'beans', existingId)
    : doc(collection(db, 'users', uid, 'beans'));
  const finalId = beanRef.id;

  if (existingId) {
    await setDoc(beanRef, { ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else {
    await addDoc(beanRef.parent ? beanRef : collection(db, 'users', uid, 'beans'), {
      ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  await refetch();
  return finalId;
}, [uid, refetch]);
```

Actually, simpler:
```js
const addBean = useCallback(async (beanData, existingId = null) => {
  if (!uid) return;
  if (existingId) {
    const beanRef = doc(db, 'users', uid, 'beans', existingId);
    await setDoc(beanRef, { ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await refetch();
    return existingId;
  }
  // Default: auto-generate ID
  const beansRef = collection(db, 'users', uid, 'beans');
  const docRef = await addDoc(beansRef, { ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await refetch();
  return docRef.id;
}, [uid, refetch]);
```

**Verification:** Existing callers (`onAdd(beanData)`) still work. New callers can pass `onAdd(beanData, preAllocId)`.

---

### Unit 4: Pre-generate product shot in AddBeanForm

**Goal:** Start product shot generation during scan, hold photoUrl in ref, include in save payload.

**Files:** `src/components/AddBeanForm.jsx`

**Approach:**

Add refs:
```js
const pendingBeanIdRef = useRef(null);
const productShotUrlRef = useRef(null);
const [productShotStatus, setProductShotStatus] = useState('idle');
```

In `handleScan`, after scan completes, pre-allocate ID and fire generation:
```js
// After scan results are set, before research
const preId = doc(collection(db, 'users', uid, 'beans')).id;
pendingBeanIdRef.current = preId;
productShotUrlRef.current = null;
setProductShotStatus('generating');

generateProductShot(photos[0], preId, { skipFirestoreWrite: true })
  .then(photoUrl => {
    if (thisGen === genCounter.current) {
      productShotUrlRef.current = photoUrl;
      setProductShotStatus('ready');
    }
  })
  .catch(err => {
    console.log('Product shot generation skipped:', err.message);
    if (thisGen === genCounter.current) setProductShotStatus('failed');
  });
```

In `handleSave`, include photoUrl if available:
```js
const preAllocId = pendingBeanIdRef.current;
const preGenPhotoUrl = productShotUrlRef.current;

// Include photo URL if pre-generation finished
if (preGenPhotoUrl) beanData.photoUrl = preGenPhotoUrl;

let beanId;
try {
  beanId = await onAdd(beanData, preAllocId || null);
} catch (err) {
  alert("Couldn't save bean.");
  return;
}

reset();
onClose();

// If product shot is still generating, fire-and-forget with toast
if (!preGenPhotoUrl && beanId && scanPhoto) {
  if (onToast) onToast('Generating product shot...');
  generateProductShot(scanPhoto, beanId)
    .then(photoUrl => {
      if (Capacitor.isNativePlatform() && updateBean) updateBean(beanId, { photoUrl });
      if (onToast) onToast('Product shot ready!');
    })
    .catch(() => { if (onToast) onToast('Product shot failed'); });
}
```

In `reset()`, clean up orphaned files:
```js
const reset = () => {
  // Clean up pre-generated product shot if user canceled
  if (pendingBeanIdRef.current && !productShotUrlRef.current) {
    // Generation may still be in flight, orphan will be small (~300KB)
  }
  if (pendingBeanIdRef.current) {
    // Fire-and-forget cleanup of orphaned Storage file
    const cleanupId = pendingBeanIdRef.current;
    fetch(`${API_BASE}/api/product-shot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', beanId: cleanupId }),
    }).catch(() => {}); // silent, best-effort
    // Actually, simpler: just use the existing deleteBeanPhoto pattern
  }
  pendingBeanIdRef.current = null;
  productShotUrlRef.current = null;
  setProductShotStatus('idle');
  // ... rest of existing reset
};
```

Show status in review step:
```jsx
{productShotStatus === 'generating' && (
  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Generating product shot...</div>
)}
{productShotStatus === 'ready' && (
  <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>Product shot ready</div>
)}
```

**Verification:** Scan a bean. "Generating product shot..." shows during review. If generation finishes before save, "Product shot ready" shows and photo is included in save. If user cancels, Storage file is cleaned up.

---

### Unit 5: Add delete action to server endpoint

**Goal:** Server can delete an orphaned Storage file by beanId (for cleanup on cancel).

**Files:** `api/product-shot.js`

**Approach:**
```js
// At the top of the handler, check for delete action
const { photo, beanId, skipFirestoreWrite, action } = req.body;

if (action === 'delete') {
  if (!beanId) return res.status(400).json({ error: 'beanId required' });
  const bucket = getStorageBucket();
  try {
    await bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`).delete();
  } catch (err) {
    // Silent on not-found
  }
  return res.status(200).json({ ok: true });
}

// ... existing product shot generation ...
```

**Verification:** Delete action removes the file. Returns 200 even if file doesn't exist.

---

## Implementation Order

```
Unit 1 (server skipFirestoreWrite flag)
  -> Unit 2 (client helper update)
    -> Unit 3 (addBean setDoc support)
      -> Unit 4 (AddBeanForm pre-generation) + Unit 5 (server delete action)
```

## Acceptance Criteria

- [ ] Product shot generation starts during scan phase (in parallel with research)
- [ ] "Generating product shot..." shows during review step
- [ ] "Product shot ready" shows when generation finishes before save
- [ ] If ready before save: photo is included in bean data at save time (instant)
- [ ] If NOT ready before save: falls back to fire-and-forget with toast (current behavior)
- [ ] Cancel/close/rescan cleans up orphaned Storage files (best-effort)
- [ ] EditBeanModal flow unchanged (still uses existing beanId, no skipFirestoreWrite)
- [ ] Quick Recipe flow unchanged (no scan phase, uses post-save generation)
- [ ] `addBean` backward-compatible (existing callers unaffected)
- [ ] Build succeeds

## Files Changed

| File | Units | Change |
|------|-------|--------|
| `api/product-shot.js` | 1, 5 | Add skipFirestoreWrite flag, add delete action |
| `src/lib/gemini.js` | 2 | Add skipFirestoreWrite option to generateProductShot |
| `src/hooks/useAppData.js` | 3 | addBean accepts optional existingId, uses setDoc |
| `src/components/AddBeanForm.jsx` | 4 | Pre-allocate ID, fire generation on scan, include photoUrl in save, cleanup on reset |

## Scope Boundaries

- NOT changing EditBeanModal (already has beanId, works correctly)
- NOT changing QuickRecipeFlow (no scan phase, post-save generation is fine)
- NOT building a cleanup Cloud Function for orphaned files (edge case, negligible cost)
- NOT adding SSE/WebSocket for real-time progress (toast is sufficient)

## Risk Analysis

- **Pre-allocated ID collision**: Firebase auto-generated IDs are statistically unique. No risk.
- **Orphaned Storage files on hard kill**: ~300KB JPEG per orphan. Only happens on force quit during generation. Negligible.
- **Race: user saves while generation in flight**: Falls back to current fire-and-forget pattern. No regression.
- **Race: rescan while generation in flight**: `genCounter` guard discards stale results. Cleanup fires for old ID.

## Sources

- Pre-allocating Firestore IDs: `doc(collection(db, path)).id` (Firebase JS SDK)
- Existing `genCounter` pattern: `src/components/AddBeanForm.jsx:132`
- Server endpoint: `api/product-shot.js`
- Client helper: `src/lib/gemini.js:172`
- addBean: `src/hooks/useAppData.js:154`

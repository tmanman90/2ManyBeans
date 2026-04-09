---
title: "fix: Server-Side Product Shot Upload"
type: fix
status: active
date: 2026-04-08
---

# fix: Server-Side Product Shot Upload

## Overview

Product shot uploads hang forever on iOS because `CapacitorHttp: { enabled: true }` patches XMLHttpRequest globally, and Firebase Storage JS SDK uses XHR for ALL upload operations (`uploadBytes`, `uploadString`). The native bridge cannot serialize the upload payload, so the request never completes and never errors (Capacitor #6132, #6534).

The fix: move the Firebase Storage upload from the client to the server. The Vercel serverless function generates the image via Gemini, converts PNG to JPEG via `sharp`, uploads to Firebase Storage via Admin SDK, writes `photoUrl` to Firestore, and returns the URL to the client. The client does zero Storage operations.

## Root Cause Analysis

```
Client photo -> /api/gemini (Vercel) -> Gemini generates PNG -> returns base64 to client
Client receives base64 -> calls uploadString() -> Firebase SDK uses XHR internally
-> CapacitorHttp intercepts XHR -> native bridge can't serialize -> HANGS FOREVER
```

This affects ALL Firebase Storage client SDK operations on iOS native: `uploadBytes`, `uploadString`, `deleteObject`. No workaround exists while CapacitorHttp is enabled. The fix must bypass the client SDK entirely.

## Proposed Solution

New endpoint `api/product-shot.js` handles the full pipeline server-side:

```
Client photo + beanId -> /api/product-shot (Vercel)
  -> Gemini generates PNG (~2MB)
  -> sharp converts to JPEG quality 80 (~300KB)
  -> Admin SDK uploads to Firebase Storage
  -> Admin SDK gets download URL
  -> Admin SDK writes { photoUrl } to Firestore bean doc
  -> returns { photoUrl } to client
```

The client receives only a URL string. No Blob, no XHR upload, no CapacitorHttp issue.

## Architecture Decisions

**Q: Why a new endpoint instead of modifying `api/gemini.js`?**
`sharp` is a heavy native dependency (~50MB bundle). Isolating it in `api/product-shot.js` keeps the text-only Gemini proxy lightweight. Different `maxDuration` settings per endpoint.

**Q: Why have the server write to Firestore (not just return URL)?**
Eliminates partial-completion risk. If the function times out after uploading but before responding, the photo still gets linked to the bean. The operation is atomic from the client's perspective.

**Q: Why remove the pre-generation pattern in AddBeanForm?**
The current flow generates the product shot during scan (before save), but the server needs `beanId` for the Storage path. Pre-gen would require either holding base64 client-side then sending it back (wasteful) or a two-step protocol. Simpler: generate after save. The UX cost is a few extra seconds of "Generating product shot..." which is acceptable.

**Q: Why JPEG conversion?**
Gemini returns PNG only via the Google AI SDK (~2MB base64). Vercel has a 4.5MB response limit. JPEG at quality 80 reduces to ~300KB, well within limits and faster to download on mobile.

**Q: What about `deleteBeanPhoto`?**
Same CapacitorHttp bug affects `deleteObject`. Tracked as a follow-up (not blocking this fix since delete failures are currently silent). Can add a `delete` action to the same endpoint later.

## Implementation Units

### Unit 1: Add `sharp` dependency + `FIREBASE_STORAGE_BUCKET` env var

**Goal:** Prerequisites for server-side upload.

**Files:**
- `package.json` -- add `sharp` to devDependencies
- Vercel env -- add `FIREBASE_STORAGE_BUCKET=manybeans-7893c.firebasestorage.app`

**Approach:**
1. `npm install --save-dev sharp`
2. `printf '%s' 'manybeans-7893c.firebasestorage.app' | npx vercel env add FIREBASE_STORAGE_BUCKET production`

**Verification:** `npm ls sharp` shows installed. `npx vercel env ls` shows the new var.

---

### Unit 2: Update Firebase Admin init with Storage bucket

**Goal:** Make `getStorage()` available server-side.

**Files:**
- `api/lib/cors-auth.js` -- add `storageBucket` to `initializeApp`, export storage helper

**Approach:**
```js
// In initializeApp call, add storageBucket:
initializeApp({
  credential: cert(JSON.parse(sa)),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

// Add new export:
import { getStorage, getDownloadURL as adminGetDownloadURL } from 'firebase-admin/storage';

export function getStorageBucket() {
  getFirebaseAdmin(); // ensure initialized
  return getStorage().bucket();
}

export { adminGetDownloadURL };
```

**Verification:** Import `getStorageBucket` in a test and confirm it returns a bucket object.

---

### Unit 3: Create `api/product-shot.js` serverless endpoint

**Goal:** Server-side product shot generation + JPEG conversion + Storage upload + Firestore write.

**Files:**
- `api/product-shot.js` (new)
- `vercel.json` -- add maxDuration: 90 for this endpoint

**Approach:**

```js
// api/product-shot.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { withCorsAuth, getStorageBucket, adminGetDownloadURL, getDb } from './lib/cors-auth.js';
import { doc, updateDoc, serverTimestamp } from 'firebase-admin/firestore';

const PRODUCT_SHOT_PROMPT = `...`; // same prompt from api/gemini.js

async function handleProductShot(req, res, decodedToken) {
  const { photo, beanId } = req.body;
  const uid = decodedToken?.uid;

  if (!uid) return res.status(401).json({ error: 'Authentication required' });
  if (!photo?.base64 || !photo?.mimeType) return res.status(400).json({ error: 'photo required' });
  if (!beanId) return res.status(400).json({ error: 'beanId required' });

  // Step 1: Generate product shot via Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-image-preview',
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: photo.mimeType, data: photo.base64 } },
      { text: PRODUCT_SHOT_PROMPT },
    ]}],
  });

  // Extract image from response
  let imageBase64, imageMimeType;
  for (const candidate of result.response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        imageMimeType = part.inlineData.mimeType;
        break;
      }
    }
    if (imageBase64) break;
  }

  if (!imageBase64) {
    const blockReason = result.response.promptFeedback?.blockReason;
    return res.status(500).json({ error: blockReason ? `Blocked: ${blockReason}` : 'No image generated' });
  }

  // Step 2: Convert PNG to JPEG via sharp
  const pngBuffer = Buffer.from(imageBase64, 'base64');
  const jpegBuffer = await sharp(pngBuffer).jpeg({ quality: 80 }).toBuffer();

  // Step 3: Upload to Firebase Storage via Admin SDK
  const bucket = getStorageBucket();
  const file = bucket.file(`users/${uid}/bean-photos/${beanId}.jpg`);
  await file.save(jpegBuffer, { metadata: { contentType: 'image/jpeg' } });
  const photoUrl = await adminGetDownloadURL(file);

  // Step 4: Write photoUrl to Firestore bean doc
  const db = getDb();
  const beanRef = db.collection('users').doc(uid).collection('beans').doc(beanId);
  await beanRef.update({ photoUrl, updatedAt: new Date() });

  return res.status(200).json({ photoUrl });
}

export default withCorsAuth(async (req, res, decodedToken) => {
  try {
    return await handleProductShot(req, res, decodedToken);
  } catch (error) {
    console.error('Product shot error:', error);
    const status = error.status || error.httpStatusCode || 500;
    return res.status(status).json({ error: error.message || 'Product shot failed' });
  }
});
```

**vercel.json change:**
```json
{
  "functions": {
    "api/gemini.js": { "maxDuration": 60 },
    "api/product-shot.js": { "maxDuration": 90 }
  }
}
```

**Verification:** curl the endpoint with a test photo and beanId. Confirm JPEG appears in Firebase Storage and photoUrl is written to Firestore.

---

### Unit 4: Update client `generateProductShot` to use new endpoint

**Goal:** Client calls new endpoint, receives URL instead of base64.

**Files:**
- `src/lib/gemini.js` -- modify `generateProductShot` to call `/api/product-shot` and return `{ photoUrl }`

**Approach:**
```js
export async function generateProductShot(photo, beanId) {
  const data = await fetchWithRetry({
    url: `${API_BASE}/api/product-shot`,
    body: { photo: { base64: photo.base64, mimeType: photo.mediaType }, beanId },
    serviceName: 'Product Shot',
    retries: 0,
    timeout: 90000, // server has 90s maxDuration, give client 90s too
  });

  if (!data.photoUrl) throw new Error('No photo URL returned');
  return data.photoUrl; // string URL, not base64
}
```

**Verification:** Call from browser dev tools, confirm URL is returned.

---

### Unit 5: Simplify AddBeanForm product shot flow

**Goal:** Remove client-side upload, pre-generation refs, and upload status. Product shot happens after save.

**Files:**
- `src/components/AddBeanForm.jsx`

**Approach:**
1. Remove: `productShotResultRef`, `productShotStatus`, `genCounter` (for product shot), pre-generation in `handleScan`
2. Keep: background story generation (unrelated)
3. In `handleSave`: after `onAdd(beanData)` returns `beanId`, call `generateProductShot(photos[0], beanId)` as fire-and-forget (server handles everything including Firestore write)
4. Show brief "Generating product shot..." text after save (non-blocking, modal closes)
5. The bean appears in inventory immediately, photo appears when server finishes (Firestore listener updates UI)

**Key change:** The modal closes immediately after save. The product shot generates in the background on the server. When it finishes, the Firestore listener picks up the `photoUrl` change and the photo appears on the bean card automatically.

**Verification:** Scan a bean, save it. Bean appears in inventory. Photo appears ~15-30s later without any user action.

---

### Unit 6: Simplify EditBeanModal product shot flow

**Goal:** Remove client-side upload. Send photo to server, server handles everything.

**Files:**
- `src/components/EditBeanModal.jsx`

**Approach:**
1. `fireProductShot` becomes: compress photo, call `generateProductShot(photo, bean.id)`, show spinner
2. On success: photo appears via Firestore listener (server already wrote photoUrl)
3. On failure: show alert with error message
4. Remove dependency on `src/lib/productShot.js` and `src/lib/storage.js` upload functions

**Verification:** Open edit modal, take a photo, see spinner, photo appears on bean card.

---

### Unit 7: Clean up dead code

**Goal:** Remove client-side upload functions that are no longer used.

**Files:**
- `src/lib/productShot.js` -- delete file (no longer needed)
- `src/lib/storage.js` -- remove `uploadBeanPhoto`, keep `deleteBeanPhoto` (still needed, follow-up to move server-side)
- Remove unused imports in AddBeanForm, EditBeanModal

**Verification:** Build succeeds with no warnings about missing imports.

---

## Implementation Order

```
Unit 1 (sharp + env var)
  -> Unit 2 (Admin SDK storage init)
    -> Unit 3 (new endpoint)
      -> Unit 4 (client API change)
        -> Unit 5 (AddBeanForm) + Unit 6 (EditBeanModal) [parallel]
          -> Unit 7 (cleanup)
```

## Files Changed

| File | Units | Change |
|------|-------|--------|
| `package.json` | 1 | Add sharp |
| `api/lib/cors-auth.js` | 2 | Add storageBucket, export storage helpers |
| `api/product-shot.js` | 3 | New endpoint (generate + convert + upload + write) |
| `vercel.json` | 3 | Add maxDuration: 90 for product-shot |
| `src/lib/gemini.js` | 4 | Update generateProductShot signature and return type |
| `src/components/AddBeanForm.jsx` | 5 | Remove pre-gen, simplify save flow |
| `src/components/EditBeanModal.jsx` | 6 | Simplify photo flow |
| `src/lib/productShot.js` | 7 | Delete |
| `src/lib/storage.js` | 7 | Remove uploadBeanPhoto |

## Acceptance Criteria

- [ ] Product shot generates and appears on bean card on iOS native
- [ ] Product shot generates and appears on bean card on web
- [ ] AddBeanForm: save completes quickly, photo appears via Firestore listener
- [ ] EditBeanModal: photo generation shows spinner, photo appears when done
- [ ] Generated photos are JPEG (~300KB), not PNG (~2MB)
- [ ] Photos stored at `users/{uid}/bean-photos/{beanId}.jpg` in Firebase Storage
- [ ] photoUrl written to Firestore bean doc by server (not client)
- [ ] No client-side Firebase Storage operations for product shots
- [ ] Error messages surface to user via alert() on failure
- [ ] Server endpoint returns within 90s maxDuration
- [ ] Build succeeds, no dead code warnings

## Follow-Up Items (not in this PR)

- **Move `deleteBeanPhoto` server-side** -- same CapacitorHttp bug affects `deleteObject`. Add a `delete` action to `api/product-shot.js`.
- **Disable CapacitorHttp** in next TestFlight build -- eliminates the root cause entirely. Verify API proxy CORS still works from `capacitor://localhost`.
- **Image size validation** -- reject product shots from Gemini that exceed a reasonable size before processing.
- **Retry with backoff** for the server endpoint if Gemini is rate-limited (429/529).

## Risk Analysis

- **sharp on Vercel**: Well-supported, auto-installs linux-x64 binary. Adds ~50MB to function bundle but only affects `api/product-shot.js`.
- **90s timeout**: Gemini image gen can take 15-40s. With JPEG conversion (~1s) and Storage upload (~2-5s), 90s is adequate with margin.
- **Vercel body size**: Input photo (~400KB base64) + JSON overhead is well under 4.5MB. Response is just `{ photoUrl }`. No risk.
- **Partial completion**: Server writes photoUrl to Firestore atomically. If it times out before that, no orphaned state. If it times out after upload but before Firestore write, one orphaned Storage file (acceptable, can be cleaned up).

## Deployment

- Vercel env var must be set BEFORE deploying: `FIREBASE_STORAGE_BUCKET`
- `npm install` to get sharp
- Deploy to Vercel (auto from git push)
- Deploy to Capgo OTA (JS changes only, no native changes needed)
- No TestFlight build required

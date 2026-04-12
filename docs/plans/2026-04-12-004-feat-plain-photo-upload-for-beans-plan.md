---
title: "feat: Plain photo upload for beans"
type: feat
status: completed
date: 2026-04-12
---

# feat: Plain photo upload for beans

## Enhancement Summary

**Deepened on:** 2026-04-12
**Sections enhanced:** 6
**Research agents used:** best-practices-researcher (Firebase Storage + Capacitor), security-sentinel, performance-oracle, learnings-researcher, architecture-strategist

### Key Improvements
1. Auth gate restructuring: move from `withCorsAuthPro` wrapper to `withCorsAuth` with action-level Pro check inside
2. Server-side sharp pipeline hardened: EXIF auto-orient, mozjpeg compression, magic byte validation, size limits
3. Parallelize Firestore save + photo upload via Promise.all (cuts perceived latency from sequential to concurrent)
4. Security: validate beanId ownership, whitelist MIME types, cap upload size, generic error messages

### New Considerations Discovered
- MVP code used `getSignedUrl` with 2099 expiry. Should use `adminGetDownloadURL` (Firebase download token URL) matching existing product shot pattern
- MVP code used raw base64 string. Endpoint expects `{ base64, mimeType }` object. Must match existing format
- `skipFirestoreWrite` should be ignored for upload-original (always write Firestore since bean must already exist)

---

## Overview

Currently, the only way to get a photo on a bean card is via the AI product shot generator, which requires a Pro subscription. Free users who take a photo of their bean bag get no image on their bean card. Even Pro users have no option to skip the product shot and just use their original photo.

This feature lets ALL users upload their original bean photo as the card image, and gives Pro users an explicit choice between "Use my photo" or "Generate product shot."

## Problem Statement

The Add Bean photo flow today:

1. User takes 1-3 photos of their bean bag
2. Gemini scans the label for bean data (metered for free users: 3 lifetime scans)
3. **Pro users only**: product shot auto-generates in background (`AddBeanForm.jsx:211`)
4. On save, `photoUrl` is set to the product shot URL (or nothing for free users)

**Result**: Free users never get a `photoUrl` on their beans. Their photos are used for scanning only, then discarded. This is a bad experience, especially when the user explicitly took a photo of their coffee.

## Proposed Solution

### Data Model

Single field approach, no new fields:

- `bean.photoUrl` holds whatever photo is currently the bean image (user original OR product shot)
- No `photoType` or `originalPhotoUrl` field. If a user generates a product shot, it replaces the original. Simple.
- Backward compatible: existing beans with product shot URLs are unaffected

### Server: Extend api/product-shot.js

Add an `upload-original` action to the existing endpoint. This reuses the Firebase Admin SDK, Storage setup, auth middleware, and sharp compression already in place.

#### Auth Gate Restructuring (Security Critical)

The entire handler is currently wrapped in `withCorsAuthPro` (line 38). The new `upload-original` action needs `withCorsAuth` (any authenticated user), while `generate` must stay behind `withCorsAuthPro`.

**Approach:** Change the export wrapper from `withCorsAuthPro` to `withCorsAuth`, then check Pro entitlement inside the handler for actions that require it:

```js
// api/product-shot.js -- restructured auth
import { withCorsAuth, checkEntitlement, getStorageBucket, adminGetDownloadURL, getDb } from './lib/cors-auth.js';

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'Authentication required' });

  const { action } = req.body;

  // upload-original: any authenticated user (no Pro check)
  if (action === 'upload-original') {
    return handleUploadOriginal(req, res, uid);
  }

  // All other actions (generate, delete): require Pro subscription
  // Replicate the withCorsAuthPro check inline
  const entitlement = await checkEntitlement(uid);
  if (!entitlement.pro && !entitlement.unavailable) {
    return res.status(403).json({ error: 'subscription_required', tier: 'pro' });
  }

  // ... existing generate/delete logic unchanged ...
});
```

#### Upload-Original Pipeline

```
POST /api/product-shot
{
  "action": "upload-original",
  "beanId": "abc123",
  "photo": { "base64": "<JPEG data>", "mimeType": "image/jpeg" }
}
```

**Processing pipeline:**

1. **Auth gate**: `withCorsAuth` (any authenticated user)
2. **Validate beanId format**: Existing regex `/^[A-Za-z0-9_-]{1,64}$/` (already at line 35)
3. **Validate beanId ownership**: Verify the bean doc exists and belongs to this user
4. **Validate MIME type**: Whitelist `['image/jpeg', 'image/png', 'image/webp', 'image/heic']`
5. **Validate size**: Base64 decoded buffer must be < 5MB
6. **Validate magic bytes**: Confirm file header matches an image format
7. **Normalize via sharp**: EXIF auto-orient, resize, progressive mozjpeg, strip metadata
8. **Upload to Storage**: `users/{uid}/bean-photos/{beanId}.jpg`
9. **Get download URL**: `adminGetDownloadURL(file)` (Firebase download token, not signed URL)
10. **Write Firestore**: Always update bean doc with `photoUrl` (ignore `skipFirestoreWrite`)
11. **Return**: `{ photoUrl }`

#### Sharp Normalization Pipeline

```js
async function normalizeUserPhoto(base64Input) {
  const buffer = Buffer.from(base64Input, 'base64');

  // Size check (5MB decoded max)
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Photo exceeds 5MB limit');
  }

  // Format validation via sharp metadata
  const metadata = await sharp(buffer).metadata();
  if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) {
    throw new Error('Unsupported image format');
  }

  // Magic byte validation (belt-and-suspenders)
  const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
  const isWebP = buffer.length > 12 && buffer.slice(8, 12).toString() === 'WEBP';
  if (!isJPEG && !isPNG && !isWebP && metadata.format !== 'heif') {
    throw new Error('File content does not match a valid image format');
  }

  return sharp(buffer)
    .rotate()                         // EXIF auto-orient (critical for phone photos)
    .resize(1200, 1200, {
      fit: 'inside',                  // Maintain aspect ratio
      withoutEnlargement: true,       // Never upscale
    })
    .jpeg({
      quality: 80,
      progressive: true,              // Perceived faster loading on mobile
      mozjpeg: true,                  // 10-20% smaller via trellis quantization
    })
    .toBuffer();
}
```

**Why each step matters:**
- `.rotate()`: Phone photos have EXIF Orientation tags. Without this, portrait photos display sideways.
- `mozjpeg: true`: 10-20% smaller output at same perceptual quality. No browser compatibility issues.
- `progressive: true`: Renders blurry-then-sharp on mobile, feels faster.
- Sharp automatically strips all EXIF/XMP/IPTC metadata (GPS coordinates, camera serial numbers).

### Client: AddBeanForm Photo Choice UX

After scan completes (review step), show the user's original photo with two options:

```
+----------------------------------+
|  [User's original photo]         |
|                                  |
|  [Use This Photo]  [Product Shot]|
|                    (Pro only)    |
+----------------------------------+
```

**Flow for ALL users:**
1. Photos taken/uploaded (unchanged)
2. Gemini scans label (unchanged)
3. Research enrichment (unchanged)
4. **NEW**: Review screen shows first photo as preview
5. User taps "Use This Photo" or "Generate Product Shot" (Pro)
6. Selected photo is uploaded server-side on save

**Implementation in AddBeanForm.jsx:**

- Remove the auto-fire product shot generation from `handleScan()` (line 211-227)
- Add `photoChoice` state: `'original'` (default) | `'productShot'`
- On review step: show photo choice buttons
- "Use This Photo": sets `photoChoice = 'original'`, no additional API call needed yet
- "Generate Product Shot" (Pro): sets `photoChoice = 'productShot'`, fires `generateProductShot()` in foreground with loading spinner on that button
- User can switch back to "Use This Photo" before saving if product shot isn't to their liking

**Free user path:**
- "Generate Product Shot" button is not rendered (no paywall popup, just absent)
- "Use This Photo" is the only option, pre-selected
- Photo uploads via `upload-original` which uses `withCorsAuth` (no Pro gate)

**Pro user path:**
- Both buttons visible
- Default selection: "Use This Photo" (user's original)
- If they tap "Generate Product Shot", the AI generates in foreground with a loading spinner on the button
- They can switch back to "Use This Photo" before saving

### Client: handleSave with Parallel Upload

The photo upload and Firestore bean save should run in parallel (not sequential) to minimize perceived latency.

```jsx
// In handleSave, after building beanData:
const preAllocId = pendingBeanIdRef.current || doc(collection(db, 'users', uid, 'beans')).id;

// Fire bean save and photo upload concurrently
const savePromise = onAdd(beanData, preAllocId);

let uploadPromise = Promise.resolve(null);
if (photoChoice === 'original' && photos.length > 0) {
  uploadPromise = uploadOriginalPhoto(preAllocId, photos[0], { skipFirestoreWrite: true });
} else if (photoChoice === 'productShot' && productShotUrlRef.current) {
  // Product shot already uploaded, just include the URL in beanData
  beanData.photoUrl = productShotUrlRef.current;
}

const [beanId, uploadResult] = await Promise.all([savePromise, uploadPromise]);

// If original photo was uploaded, write photoUrl to bean doc
// (one extra Firestore write, but avoids race with the bean save)
if (uploadResult?.photoUrl && beanId) {
  await updateBean(beanId, { photoUrl: uploadResult.photoUrl });
}
```

**Why `skipFirestoreWrite: true` + separate updateBean?** The bean doc might not exist yet when the upload endpoint tries to `update()` it. By skipping the Firestore write in the upload and doing it client-side after both promises resolve, we eliminate the race condition.

**Important**: This is still one logical save operation from the user's perspective. The separate `updateBean` call for photoUrl follows the established pattern in the codebase (the existing product shot fire-and-forget at line 391-405 also does a separate updateBean).

### Client: EditBeanModal

The existing `fireProductShot` button in EditBeanModal already works for beans with any `photoUrl`. No changes needed unless we want to add "Upload new photo" to EditBeanModal (out of scope for V1).

### First Photo Selection

When the user takes multiple photos (up to 3), `photos[0]` becomes the bean card image. This matches the current product shot behavior. All photos still go to Gemini for label scanning context.

## Technical Considerations

### CapacitorHttp iOS Constraint (Confirmed Still Active)

CapacitorHttp in Capacitor 8 globally patches `fetch` and `XMLHttpRequest` to route through the native HTTP bridge. There is no per-request opt-out. Firebase Storage JS SDK's internal XHR upload mechanism is incompatible with the native bridge serialization. Multiple open GitHub issues confirm this (ionic-team/capacitor #6132, #6534, #7585).

The server-side proxy via `api/product-shot.js` is the established pattern and the correct approach.

### Upload Timing and Latency

| Step | Estimated Latency |
|------|------------------|
| Client: serialize base64 JSON body | < 10ms |
| Network: send ~400KB payload | 50-500ms (WiFi to cellular) |
| Vercel cold start (if applicable) | 0-800ms |
| Server: Buffer.from + sharp normalize | 50-150ms |
| Server: Firebase Storage upload | 100-300ms |
| Server: adminGetDownloadURL | 50-100ms |
| **Total warm path** | **500ms-1.2s** |
| **Total cold start** | **1.0s-2.0s** |

With parallel save (Promise.all), perceived latency = max(bean save, photo upload) rather than sum. Target of < 3s met even on cold start + slow cellular.

Show a spinner with "Saving..." text during the save. Use the existing toast pattern for completion.

### Photo Compression (Double Pass is Intentional)

Client-side `compressImage()` (1024px, JPEG 0.8, ~150-300KB) reduces upload size.
Server-side sharp (1200px, mozjpeg 0.8) normalizes for consistency + strips EXIF + re-encodes clean JPEG.

Since 1024 < 1200, `withoutEnlargement: true` means sharp won't upscale. The re-encode costs ~100ms server CPU but provides:
1. Security normalization (strips exploits, validates pixel data)
2. Consistency (all photos in Storage go through same pipeline)
3. Size guarantee (server enforces ceiling regardless of client changes)

### Vercel Function Limits

Request body limit: 4.5MB. A 300KB JPEG encodes to ~400KB base64. Total JSON payload ~410KB. Well under the limit with 10x headroom.

### Storage Paths

User photos and product shots share the same Storage path: `users/{uid}/bean-photos/{beanId}.jpg`. A product shot overwrites the original. This is intentional: one photo per bean, simple model.

### Firebase Storage URL Pattern

Use `adminGetDownloadURL(file)` which returns a Firebase download token URL:
```
https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=<uuid>
```

Long-lived, no expiration management, consistent with existing product shot URLs. Do NOT use `getSignedUrl` (7-day max expiry, requires refresh).

### Cleanup on Cancel

Existing `deleteProductShot()` cleanup on cancel/rescan works unchanged. For upload-original, the photo is only uploaded during `handleSave()` (not during review), so cancel = no orphaned files.

## Security Assessment

| # | Finding | Severity | Mitigation |
|---|---------|----------|------------|
| 1 | Auth gate must split between upload-original (any user) and generate (Pro) | High | Switch to `withCorsAuth` wrapper, check Pro inside for generate/delete |
| 2 | No base64 size limit | High | Decode to buffer, check `buffer.length < 5MB` |
| 3 | No MIME/magic byte validation | Medium | Whitelist MIME types + validate magic bytes + sharp re-encode |
| 4 | No per-user upload rate limiting | Medium | Verify beanId references a real bean owned by this user |
| 5 | `skipFirestoreWrite` is user-controlled | Low | Always write Firestore for upload-original |
| 6 | Error messages could leak sharp internals | Low | Return generic "Photo upload failed" for all errors |
| 7 | Path traversal via beanId | Low | Already mitigated by `/^[A-Za-z0-9_-]{1,64}$/` regex |

## System-Wide Impact

### BeanCard Display
`BeanCard.jsx` renders `bean.photoUrl` with lazy loading + shimmer placeholder. User-uploaded photos will have different aesthetics than product shots (real bag photos vs clean studio shots). The existing edge-gradient blending should handle both reasonably. No code change needed.

### ShareCard
`ShareCard.jsx` renders `bean.photoUrl` directly. User photos will appear on share cards. Acceptable.

### Chat "Save to Inventory"
`ChatTab.jsx` `handleSaveToInventory` currently saves bean metadata without any photo. This is a known gap but out of scope for this plan. Track separately if desired.

## Acceptance Criteria

- [ ] Free user: take photo, scan bean, see photo on review screen, save, bean card shows their photo
- [ ] Free user: no paywall popup during the photo flow (product shot button simply not shown)
- [ ] Pro user: take photo, scan bean, see "Use This Photo" and "Generate Product Shot" options
- [ ] Pro user: can choose original photo, save, bean card shows original
- [ ] Pro user: can generate product shot, see preview before saving, save, bean card shows product shot
- [ ] Pro user: can switch back to "Use This Photo" before saving if product shot isn't good
- [ ] Multiple photos: first photo used as bean image, all photos used for label scan
- [ ] Existing beans with product shots: display unchanged
- [ ] EditBeanModal: existing "Generate Product Shot" button still works
- [ ] Upload works on web and iOS native (server-side proxy, no CapacitorHttp issues)
- [ ] Photo upload adds < 3s to save time (including cold start)
- [ ] No orphaned Storage files on cancel
- [ ] Invalid uploads rejected (wrong format, too large, non-image content)
- [ ] Photos display correctly (no sideways orientation from missing EXIF rotation)

## Files Changed

| File | Change |
|------|--------|
| `api/product-shot.js` | Switch to `withCorsAuth` wrapper, add action-level Pro check, add `upload-original` handler with full validation pipeline |
| `src/components/AddBeanForm.jsx` | Remove auto product shot, add `photoChoice` state, photo choice UI on review step, parallel upload in handleSave |
| `src/lib/storage.js` | Add `uploadOriginalPhoto(beanId, photo)` helper that calls the endpoint with `{ action: 'upload-original' }` |

## Dependencies & Risks

- **Risk**: Photo upload adds latency to save flow. Mitigated by parallel Promise.all + spinner.
- **Risk**: User photos look less polished than product shots on BeanCard. Acceptable trade-off, this is what the user is choosing.
- **Risk**: Auth gate restructuring could break existing product shot flow if done incorrectly. Mitigated by action-level branching with tests.
- **Dependency**: `sharp` is already a dependency for product shots. No new server dependencies.
- **Dependency**: `adminGetDownloadURL` already imported in product-shot.js.

## Documented Learnings Applied

- One Firestore write per logical handler (docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md). The parallel upload uses `skipFirestoreWrite: true`, then a single client-side `updateBean` for photoUrl.
- Validate capture/upload output (docs/solutions/logic-errors/share-card-capture-retry-null-safety.md). Server validates magic bytes + sharp metadata, not just MIME header.
- Platform-gate web APIs (lessons.md). CapacitorHttp confirmed incompatible with client-side Firebase Storage uploads.
- Test deployed proxy (lessons.md). After implementation, curl the production `/api/product-shot` endpoint with `action: upload-original` to confirm the response format.

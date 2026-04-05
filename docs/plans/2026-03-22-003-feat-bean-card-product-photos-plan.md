---
title: "feat: Bean Card Product Photos via AI Styling"
type: feat
status: active
date: 2026-03-22
---

# Bean Card Product Photos via AI Styling

## Overview

Add persistent coffee bag photos to bean cards across Rotation, Inventory, and Archive tabs. Photos are captured during the existing add-bean-by-camera flow (or added later via edit), then transformed by Gemini image generation into consistent, Japandi-minimal product shots. Requires new Firebase Storage infrastructure for image persistence.

## Problem Statement / Motivation

Bean cards are currently text-only. Users can't visually identify their coffee bags at a glance. The scan photos taken during the add-bean flow are discarded after Gemini extracts label data, wasting a valuable visual asset. Displaying styled product shots on cards makes the app more visually engaging and helps users quickly distinguish between beans in their rotation.

## Proposed Solution

### Architecture

```
User photo (base64)
  → /api/gemini (scan label - existing)
  → /api/gemini (generate product shot - NEW, image-to-image)
  → Firebase Storage upload (NEW)
  → Download URL saved to bean doc (photoUrl field)
  → BeanCard renders image
```

### Flow 1: Add bean by camera (primary path)

1. User captures 1-3 photos (existing)
2. Photos sent to Gemini for label scanning (existing)
3. User reviews extracted data and saves (existing)
4. **NEW**: After save, first photo sent to `/api/gemini` with `action: 'productShot'`
5. **NEW**: Gemini generates styled product shot (image-to-image edit)
6. **NEW**: Generated image uploaded to Firebase Storage at `users/{uid}/bean-photos/{beanId}.webp`
7. **NEW**: Bean doc updated with `photoUrl` (Firebase Storage download URL)
8. BeanCard re-renders with image (Firestore real-time listener picks up the change)

### Flow 2: Add/change photo via EditBeanModal

1. User taps pencil icon on BeanCard
2. **NEW**: EditBeanModal shows current photo (if exists) + "Add Photo" / "Change Photo" button
3. User captures or selects a photo (same capture logic as AddBeanForm)
4. Photo sent to Gemini for product shot generation
5. Upload to Storage, update bean doc
6. If replacing, old Storage file deleted first

### Flow 3: Manual add (no camera)

1. User adds bean manually, no photo taken
2. Bean saves without `photoUrl` (card renders text-only, same as today)
3. User can add photo later via EditBeanModal (Flow 2)

## Technical Approach

### Phase 1: Firebase Storage Setup

**Files to modify:**
- `package.json` -- add `firebase/storage` (already included in the `firebase` package, just needs import)
- `src/firebase.js` -- export `storage` instance via `getStorage(app)`

**Firebase Console:**
- Enable Storage in the Firebase project
- Deploy security rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/bean-photos/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if request.auth != null; // other authenticated users can't write but could read (future sharing)
    }
  }
}
```

**New utility: `src/lib/storage.js`**
```js
// uploadBeanPhoto(uid, beanId, base64, mediaType) → downloadURL
// deleteBeanPhoto(uid, beanId) → void
```
- Converts base64 to blob
- Uploads to `users/{uid}/bean-photos/{beanId}.webp`
- Returns `getDownloadURL()` result
- Handles cleanup on replace/delete

### Phase 2: Gemini Product Shot Generation

**Extend `/api/gemini.js` proxy:**
- Add a new action branch: when `action === 'productShot'`, use image generation config
- Use the same `@google/generative-ai` SDK but with `responseModalities: ['IMAGE']` in generation config
- Model: `gemini-2.5-flash-preview-05-20` (supports native image output)
- Input: user's scan photo as inline image + product shot prompt
- Output: base64 of the generated product shot

**Product shot prompt (tuned for coffee bags):**
```
You are a product photographer. Take this coffee bag and create a clean,
minimal product photograph of it.

REQUIREMENTS:
- Place the coffee bag centered on a clean, seamless light warm-grey background
- Soft, diffused studio lighting from upper-left, no harsh shadows
- The bag should be the sole subject, upright, slightly angled (15-20 degrees)
  for dimension
- Preserve the actual bag design, colors, and branding exactly as shown
- Clean negative space around the bag (at least 20% padding on all sides)
- Warm, natural color temperature (Japandi aesthetic)
- No props, no surfaces, no reflections, no text overlays
- The bag should look premium but authentic, not over-processed
- Square 1:1 composition
```

**New client-side helper: `src/lib/gemini.js`**
```js
// generateProductShot(photo) → base64
// Takes { base64, mediaType }, returns generated image base64
```

### Phase 3: Bean Data Model Update

**Add `photoUrl` field to bean documents:**
- `src/hooks/useAppData.js` -- no schema changes needed (Firestore is schemaless), just include `photoUrl` in writes
- `src/components/AddBeanForm.jsx` -- after save, trigger background product shot generation
- `src/components/EditBeanModal.jsx` -- add photo capture + generation UI

**Background generation flow in AddBeanForm:**
```js
// In handleSave(), after successful bean creation:
// 1. Save bean immediately (no blocking)
// 2. Fire-and-forget: generateProductShot(photos[0])
//    → uploadBeanPhoto(uid, beanId, result)
//    → updateBean(beanId, { photoUrl: downloadUrl })
// 3. If generation fails, bean just has no photo (graceful degradation)
```

### Phase 4: BeanCard Photo Display

**Modify `src/components/BeanCard.jsx`:**
- Add photo at the top of the card, above the header row
- Aspect ratio: 1:1 square, full card width, with border-radius matching the card
- Loading state: subtle shimmer placeholder while `photoUrl` is being generated
- Fallback: no image element rendered if `photoUrl` is absent (card looks exactly as it does today)
- Lazy loading: `loading="lazy"` on the `<img>` tag

**Card layout with photo:**
```
┌─────────────────────────┐
│                         │
│     [Product Photo]     │  ← NEW: 1:1 square, rounded top corners
│                         │
├─────────────────────────┤
│ Bean Name        Badge  │  ← existing header
│ Roaster · Origin        │  ← existing metadata
│ ...details...           │
│ [Actions]               │
└─────────────────────────┘
```

**Styling considerations:**
- Photo should have `border-radius: 14px 14px 0 0` to match `journalCard` radius
- Object-fit: `cover` to fill the square without distortion
- Max rendered size: ~400px (card width on mobile). No need for massive images.
- On compact cards (Inventory): consider smaller aspect ratio (3:4 or 2:3) or thumbnail size

**Modify `src/tabs/ArchiveTab.jsx`:**
- Add photo display to the archive card layout (or refactor to use BeanCard)

### Phase 5: EditBeanModal Photo Management

**Modify `src/components/EditBeanModal.jsx`:**
- Add photo section at the top of the modal
- If bean has `photoUrl`: show current photo + "Change Photo" button
- If no `photoUrl`: show "Add Photo" button with camera icon
- Photo capture uses same logic as AddBeanForm (Capacitor Camera on native, file input on web)
- On capture: show preview, generate product shot, upload, update bean
- Loading state while generating/uploading

### Phase 6: Cleanup on Delete

**Modify `src/hooks/useAppData.js`:**
- In `deleteBean()`: if the bean has a `photoUrl`, delete the corresponding Storage file before deleting the Firestore doc
- Wrap in try/catch so Storage deletion failure doesn't block bean deletion

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage backend | Firebase Storage | Already using Firebase ecosystem. No new service to configure. |
| Image generation | Gemini image-to-image via existing proxy | Preserves actual bag design. Same API key and proxy pattern. |
| Generation timing | Background after save | Non-blocking UX. Bean saves instantly, photo appears moments later. |
| Which scan photo | First photo (index 0) | Users typically photograph the front label first. |
| Image size | ~512px square, WebP | Sufficient for mobile card display. Small file size (~50-100KB). |
| No-photo fallback | Render card exactly as today | Zero regression for existing beans or manual-add beans. |
| Prompt approach | Consistent fixed prompt + user's photo | Same lighting/background/style for every bag. Only the bag changes. |

## Acceptance Criteria

- [ ] Bean cards in Rotation tab display product shot photo when available
- [ ] Bean cards in Inventory tab display product shot photo when available
- [ ] Archived beans display photo in Archive tab
- [ ] Adding a bean by camera auto-generates a product shot in the background
- [ ] Generated product shots have consistent Japandi-minimal styling (same background, lighting)
- [ ] EditBeanModal allows adding a photo to a bean that doesn't have one
- [ ] EditBeanModal allows changing the photo on a bean that has one
- [ ] Beans without photos render identically to current text-only cards (no regression)
- [ ] Bean deletion cleans up associated Storage files
- [ ] Product shot generation failure does not block bean saving
- [ ] Photos load efficiently (lazy loading, appropriate size)
- [ ] Works on both web (PWA) and native (Capacitor iOS)

## Dependencies & Risks

**Dependencies:**
- Firebase Storage must be enabled in the Firebase console
- Gemini model must support image generation with `responseModalities: ['IMAGE']` (verified: `gemini-2.5-flash-preview-05-20` supports this)
- `GEMINI_API_KEY` already configured in Vercel env (confirmed)

**Risks:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini image gen produces inconsistent results | Medium | Medium | Tune prompt iteratively. Test with 10+ different bags. Add retry with slight prompt variation. |
| Image gen slow (>15s) | Low | Low | Background generation. User never waits. |
| Firebase Storage costs | Low | Low | WebP at ~512px keeps files small (~50-100KB per bean). Personal app, not high volume. |
| Vercel function timeout on image gen | Low | Medium | Image gen is a separate call from scanning. 60s timeout is ample for a single generation. |
| CapacitorHttp breaks image uploads | Low | Medium | Firebase Storage SDK uses its own transport. If issues, fall back to REST upload. |

## Implementation Order

1. **Firebase Storage setup** (`firebase.js`, `storage.js`, console config) -- foundation
2. **Gemini product shot endpoint** (`api/gemini.js` extension, `lib/gemini.js` helper) -- core capability
3. **Test prompt** -- generate 5-10 product shots from different bag photos, iterate on prompt
4. **AddBeanForm integration** -- background generation after save
5. **BeanCard photo display** -- render photos on cards
6. **EditBeanModal photo management** -- add/change photo UI
7. **ArchiveTab photo display** -- ensure archived beans show photos
8. **Cleanup on delete** -- Storage file deletion in `deleteBean()`
9. **Polish** -- loading states, error handling, edge cases

## Files to Modify

| File | Change |
|------|--------|
| `src/firebase.js` | Add `getStorage` export |
| `src/lib/storage.js` | **NEW** -- upload/delete helpers |
| `api/gemini.js` | Add `productShot` action branch with image generation |
| `src/lib/gemini.js` | Add `generateProductShot()` helper |
| `src/components/AddBeanForm.jsx` | Trigger background product shot after save |
| `src/components/BeanCard.jsx` | Add photo display at top of card |
| `src/components/EditBeanModal.jsx` | Add photo capture/change UI |
| `src/hooks/useAppData.js` | Add Storage cleanup in `deleteBean()` |
| `src/tabs/ArchiveTab.jsx` | Add photo display to archive cards |
| `package.json` | No change needed (firebase/storage already in firebase package) |

## Sources & References

- Nano Banana Pro MCP tools: `edit_image` accepts base64 images + prompt, returns base64 (wraps Gemini image gen)
- Current Gemini proxy: `api/gemini.js` uses `@google/generative-ai` SDK
- Bean data model: `src/hooks/useAppData.js` -- Firestore CRUD
- Image compression: `src/lib/claude.js:62-107` -- `compressImage()` utility
- Camera capture: `src/components/AddBeanForm.jsx` -- Capacitor Camera + web file input
- Card styling: `src/styles/theme.js` -- `journalCard`, `C` color palette

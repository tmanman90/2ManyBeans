---
title: "feat: Native Multi-Photo Picker"
type: feat
status: completed
date: 2026-06-15
---

# feat: Native Multi-Photo Picker

## Summary

Add native iPhone multi-select library picking for bean-label photo flows while preserving the existing one-at-a-time camera capture path. Quick Recipe should accept up to three selected library images and scan immediately; Add Bean scan should append selected library images up to the existing three-photo cap before the user presses Scan.

## Requirements

- R1. On iOS/native, users can select multiple existing photos at once for Quick Recipe.
- R2. On iOS/native, users can select multiple existing photos at once for Add Bean scan, appending up to the existing three-photo cap.
- R3. Direct camera capture remains one photo per capture action.
- R4. Library selection must not be blocked by camera permission denial.
- R5. Selected photos must enter the existing `{ base64, mediaType, previewUrl }` pipeline used by Gemini OCR, source-insight extraction, save-to-inventory, and thumbnail previews.

## Scope Boundaries

- Do not change Gemini scan prompts or recipe-generation behavior.
- Do not increase the existing three-photo cap.
- Do not redesign the full scan UI beyond making the native picker choices explicit enough to avoid ambiguity.
- Do not change Edit Bean photo replacement, which remains a single image surface.

## Context & Research

### Relevant Code and Patterns

- `src/components/QuickRecipeFlow.jsx` already supports multiple web-selected files and scans immediately through `handlePhotosReady`.
- `src/components/ScanSheet.jsx` already stores an array of photos and appends one photo at a time before explicit scan.
- `src/tabs/ChatTab.jsx` shows the append-up-to-remaining-slots pattern for multi-file selection.
- `src/lib/claude.js` exposes `compressImage(file)`, which standardizes selected images into the app's current OCR payload shape.
- `node_modules/@capacitor/camera/dist/esm/definitions.d.ts` confirms `Camera.pickImages(options)` returns multiple gallery photos with `webPath` and optional `path`.

### Institutional Learnings

- Native Capacitor flows should verify bundle contents and avoid assuming web behavior matches iOS behavior.
- Capgo can replace local bundle behavior, so user-facing native picker changes need normal build verification before deploy.

### External References

- Local installed Capacitor Camera type definitions for `pickImages`, `GalleryPhotos`, and `GalleryImageOptions`.

## Key Technical Decisions

- Use `Camera.pickImages({ limit: remainingSlots })` for native library selection rather than `Camera.getPhoto({ source: Prompt })` when the user wants existing photos. `getPhoto` is single-result; `pickImages` is the intended gallery multi-select API.
- Keep camera and library entry points separate in the UI. This preserves the natural one-shot camera behavior and lets library selection avoid unnecessary camera permission checks.
- Add a shared conversion helper so `QuickRecipeFlow` and `ScanSheet` do not duplicate `webPath -> Blob/File -> compressImage -> scan payload` logic.

## Open Questions

### Resolved During Planning

- Should camera capture become multi-shot? No. Camera capture remains one photo per action; only the photo library becomes multi-select.
- Should Quick Recipe append photos or replace them? Replace and scan immediately, matching its current one-shot recipe flow.
- Should Add Bean append photos or replace them? Append up to the existing cap, matching the current Add photo / Scan review flow.

### Deferred to Implementation

- Exact fallback shape if `fetch(webPath)` fails on a device: resolve based on observed API behavior, but the failure must surface as a user-visible scan/photo-processing error instead of hanging.

## Implementation Units

- U1. **Shared Native Gallery Conversion**

**Goal:** Provide a reusable path that turns Capacitor gallery selections into the app's existing compressed scan-photo objects.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Create: `src/lib/photoPicker.js`
- Test: `scripts/multi-photo-picker-regression.test.mjs`

**Approach:**
- Add a helper that accepts selected `GalleryPhoto` objects, reads each photo from `webPath`, converts it to a `File`/`Blob`, and passes it through `compressImage`.
- Preserve the app's current payload shape: `base64`, `mediaType`, and `previewUrl`.
- Apply caller-provided limit/remaining slots before compression to avoid extra memory work.

**Patterns to follow:**
- `src/lib/claude.js` `compressImage(file)` for image normalization.
- `src/tabs/ChatTab.jsx` for "remaining slots" behavior.

**Test scenarios:**
- Happy path: a static regression test verifies a shared helper exists and imports `compressImage`.
- Edge case: a static regression test verifies the helper applies a limit/remaining slot before processing.
- Error path: a static regression test verifies the helper uses `fetch`/blob conversion so `webPath` selections are not treated like data URLs.

**Verification:**
- Both consuming components import the shared helper rather than duplicating gallery conversion code.

- U2. **Quick Recipe Native Library Multi-Select**

**Goal:** Let native Quick Recipe users choose multiple existing photos at once and scan them immediately.

**Requirements:** R1, R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `src/components/QuickRecipeFlow.jsx`
- Test: `scripts/multi-photo-picker-regression.test.mjs`

**Approach:**
- Keep the existing direct camera path as one-photo capture.
- Add a native library picker path using `Camera.pickImages` with the three-photo limit.
- Route selected gallery photos through the shared helper and then into `handlePhotosReady`.
- Make the photo step distinguish "take photo" and "choose photos" so the native action is explicit.

**Patterns to follow:**
- Current `handleFileInput` multi-file flow in `src/components/QuickRecipeFlow.jsx`.
- Current `handlePhotosReady` scan-immediately flow in `src/components/QuickRecipeFlow.jsx`.

**Test scenarios:**
- Happy path: static regression verifies Quick Recipe calls `Camera.pickImages` and passes selected photos to `handlePhotosReady`.
- Edge case: static regression verifies the picker limit is three photos.
- Error path: static regression verifies gallery picker errors set scan error rather than silently failing.
- Integration: static regression verifies Quick Recipe still has the camera `getPhoto` path separate from library `pickImages`.

**Verification:**
- Native Quick Recipe can select multiple existing bag/pamphlet photos and immediately enter the existing scanning state.

- U3. **Add Bean Scan Native Library Multi-Select**

**Goal:** Let native Add Bean scan users choose multiple existing photos at once, append them to the current photo list, and scan after review.

**Requirements:** R2, R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `src/components/ScanSheet.jsx`
- Test: `scripts/multi-photo-picker-regression.test.mjs`

**Approach:**
- Keep the current direct camera path as one-photo append.
- Add a native library picker path using the number of remaining slots up to the three-photo cap.
- Route selected gallery photos through the shared helper and append them to existing `photos`.
- Update the photo step controls so users can intentionally choose camera or library without camera denial blocking library selection.

**Patterns to follow:**
- Current `setPhotos(prev => [...prev, ...].slice(0, 3))` append pattern in `src/components/ScanSheet.jsx`.
- Existing explicit scan button behavior in `src/components/ScanSheet.jsx`.

**Test scenarios:**
- Happy path: static regression verifies Add Bean scan calls `Camera.pickImages` and appends converted gallery photos.
- Edge case: static regression verifies remaining slots are computed from `photos.length`.
- Error path: static regression verifies library picker errors set `scanError`.
- Integration: static regression verifies the existing Scan button remains responsible for starting Add Bean OCR.

**Verification:**
- Native Add Bean scan can add several existing photos in one picker session and still scans only after the user taps Scan.

## System-Wide Impact

- **Interaction graph:** Native photo buttons feed `QuickRecipeFlow` and `ScanSheet`, which already feed `scanBeanLabel`, source-insight extraction, recipe generation, and save-to-inventory.
- **Error propagation:** Picker and conversion failures surface through each component's existing `scanError` UI.
- **State lifecycle risks:** Blob URLs created by `compressImage` must continue to be revoked by existing cleanup paths.
- **API surface parity:** Web file inputs already support multi-select in Quick Recipe; Add Bean web should also support multiple files when this path is touched.
- **Integration coverage:** Static regression tests should verify helper usage and separate camera/library paths; manual device QA should confirm the iOS picker UI.
- **Unchanged invariants:** Three-photo cap, Gemini payload shape, source-insight handling, camera capture, and save flows stay unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `Camera.pickImages` returns `webPath` instead of base64/data URLs | Shared helper converts `webPath` through `fetch` + `compressImage` before calling existing scan code. |
| Camera permission denial blocks library selection | Library picker path requests/checks photo-library permission only. |
| Memory pressure from processing too many images | Keep the existing three-photo cap and limit selections before compression. |
| UI ambiguity between taking one photo and choosing several | Add explicit camera/library actions in the photo step. |

## Documentation / Operational Notes

- Manual QA should be done on `2manybeans Dev` because the affected behavior is native iOS picker behavior.
- If shipped through Capgo, upload the matching corrected web bundle to the dev channel so the native app does not self-revert.

## Sources & References

- Related code: `src/components/QuickRecipeFlow.jsx`
- Related code: `src/components/ScanSheet.jsx`
- Related code: `src/tabs/ChatTab.jsx`
- Related code: `src/lib/claude.js`
- Local API reference: `node_modules/@capacitor/camera/dist/esm/definitions.d.ts`

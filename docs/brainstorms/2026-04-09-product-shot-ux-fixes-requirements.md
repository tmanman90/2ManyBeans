---
date: 2026-04-09
topic: product-shot-ux-fixes
---

# Product Shot UX Fixes

## Problem Frame

Product shot generation works end-to-end (server generates, converts to JPEG, uploads to Firebase Storage, writes photoUrl to Firestore) but the UX is broken in three ways:

1. **EditBeanModal spinner resets prematurely.** The "Generating product shot..." text disappears before the photo appears, making it look like generation failed. Root cause: when the server writes `photoUrl` to Firestore, the bean prop changes, triggering a `useEffect` that resets `photoGenerating` to false.

2. **iOS native polling delay.** On iOS, Firestore uses 60-second polling (not real-time listeners). After the server writes `photoUrl`, the app doesn't pick it up for up to 60 seconds. Combined with ~60s generation time, total wait is ~2 minutes.

3. **AddBeanForm has zero feedback.** Modal closes immediately after save. Product shot fires in background. Photo appears 60-90s later with no indication anything was happening.

## Requirements

- R1. EditBeanModal: spinner must stay visible from "Generating..." through to photo appearing on the bean card. The `useEffect` that resets state on `bean` prop changes must not kill the spinner while generation is in flight.

- R2. When `generateProductShot` returns `{ photoUrl }`, the client must use that URL directly to update the bean's photo in the UI, not wait for the 60-second Firestore poll. Call `updateBean(beanId, { photoUrl })` from the `.then()` callback (the server already wrote it, this just makes the client aware immediately).

- R3. AddBeanForm: after save + modal close, show a Toast notification on the inventory/rotation screen: "Generating product shot..." while in progress, then "Product shot ready!" on success, or "Product shot failed" on error. Use the existing `Toast` component (`src/components/Toast.jsx`).

- R4. EditBeanModal: on successful return from `generateProductShot`, transition spinner text from "Generating..." to briefly showing "Done!" before the photo replaces the button, so the user sees a clear success signal.

## Success Criteria

- EditBeanModal: tap "Add Photo", see continuous spinner until photo appears (no gap where it shows "Add Photo" again)
- AddBeanForm: save a bean, see toast, photo appears on bean card within ~5-10s of server completing (not 60s)
- No regressions on web (where onSnapshot already provides fast updates)

## Scope Boundaries

- NOT reducing Gemini generation time (30-40s is their model speed, out of our control)
- NOT changing the server-side pipeline (it works correctly)
- NOT adding progress stages from the server (would require SSE/WebSocket, overkill)

## Key Decisions

- **Use server response directly, not polling**: When `generateProductShot` returns, the client already has `photoUrl`. Calling `updateBean` immediately bypasses the 60s native poll. The server already wrote it to Firestore, so this is just the client catching up.
- **Toast for add-bean feedback**: Non-blocking notification. Modal closes immediately (fast UX), toast provides background feedback.
- **Don't change the fire-and-forget pattern for AddBeanForm**: The modal should close immediately after save. The toast handles feedback. No need to block the UI.

## Outstanding Questions

### Deferred to Planning
- [Affects R3][Technical] How to pass the toast state from AddBeanForm (which unmounts on close) to the parent screen that renders the Toast component. Likely via a callback prop or shared state.
- [Affects R1][Technical] Exact condition for the useEffect guard: should it check `photoInFlight.current` before resetting, or should `photoGenerating` be tracked via ref instead of state?

## Next Steps

-> /ce:plan for structured implementation planning

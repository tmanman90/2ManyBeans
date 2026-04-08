---
date: 2026-04-07
topic: ios-offline-read-cache
---

# iOS Offline Read Cache

## Problem Frame
The iOS app (Capacitor) cannot get past the loading screen without network. Firestore persistent cache is disabled on native due to WKWebView IndexedDB reliability issues, so all data loads are HTTP-only. Users who open the app with no service see "Connection issue. Retrying..." indefinitely. The app should show previously-loaded data when offline.

## Requirements
- R1. After each successful Firestore load on iOS (profile, beans, tastings), persist the data to localStorage as a shadow cache.
- R2. On boot, if Firestore loads fail due to no network, fall back to localStorage cache and render the app with last-known data.
- R3. Network-dependent actions (add/edit beans, add tastings, AI chat, Aiden, photo scan) should show an inline error when attempted offline, not crash or hang.
- R4. The existing online boot flow must not change. localStorage is a fallback only, never the primary source when Firestore succeeds.
- R5. Web (PWA) is unaffected. This targets iOS/Capacitor only, where persistent Firestore cache is disabled.

## Success Criteria
- App opens to last-viewed data when launched with no network on iOS.
- No regression to online boot time or data freshness.
- No loading screen hang when offline.

## Scope Boundaries
- No offline writes or mutation queuing.
- No offline indicator/banner (errors shown only when user attempts a network action).
- No changes to Firestore cache settings (IndexedDB stays disabled on native).
- Web PWA offline behavior unchanged (already works via Firestore persistent cache).

## Key Decisions
- **localStorage over re-enabling IndexedDB**: WKWebView IndexedDB was disabled due to hangs. localStorage is simpler, reliable in WKWebView, and sufficient for read-only cache.
- **No offline indicator**: User preference. Errors surface only when attempting network-dependent actions.
- **Read-only offline**: Avoids sync/conflict complexity entirely. Offline mutations are a separate future scope if ever needed.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] What's the right cache key structure and size limit for localStorage on iOS WKWebView?
- [Affects R2][Technical] Where in the boot sequence should the fallback trigger: in useAuth, useUserProfile, useAppData, or a wrapper?
- [Affects R3][Technical] Which specific UI touch points need network-unavailable error handling?

## Next Steps
→ `/ce:plan` for structured implementation planning

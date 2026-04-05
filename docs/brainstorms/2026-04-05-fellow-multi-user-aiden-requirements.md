---
date: 2026-04-05
topic: fellow-multi-user-aiden
---

# Multi-User Fellow Aiden Integration

## Problem Frame

Coffee Hub currently uses a single hardcoded Fellow account (Tal's) for all Aiden operations. The "Send to Aiden" button pushes recipes directly to Tal's physical device. When other users sign up, they need recipes on their own Aiden, not Tal's. Fellow has no OAuth, only email/password auth, so a hybrid approach is needed.

## Requirements

- R1. **Brew.link default (no Fellow login)**: Users without a connected Fellow account get an "Open on Aiden" button that opens the brew.link URL in the browser, which deep-links into the Fellow app to load the recipe onto their device.
- R2. **Direct push (connected Fellow account)**: Users who connect their Fellow account get a "Send to Aiden" button that pushes the recipe directly to their Aiden device via the API (current behavior, but using their account).
- R3. **Fellow account connection in Settings**: Add a "Connect Fellow Account" section to the Settings page with email/password form. Shows connection status. Ability to disconnect.
- R4. **Fellow account connection in onboarding**: Add an optional Fellow connection step to the setup wizard. Skip button available, no friction for users without Aiden.
- R5. **Encrypted credential storage**: Store Fellow email/password encrypted in the user's Firestore document. Server decrypts at push time to authenticate with Fellow API.
- R6. **Relay account for brew.link generation**: Continue using Tal's account as a server-side relay to generate brew.links for non-connected users. The temp profile create/share/delete flow stays the same.
- R7. **Share recipe button**: Add a share/copy button at the bottom of the Aiden recipe card. Uses native share sheet (or clipboard fallback) with the brew.link URL.
- R8. **Graceful degradation**: If a connected user's Fellow credentials become invalid (password changed, account deleted), fall back to brew.link flow and prompt to reconnect in Settings.

## Success Criteria

- Non-connected users can generate recipes and open brew.links on their own Aiden via Fellow app
- Connected users get one-tap direct push to their own device
- Tal's existing direct-push flow continues working (his credentials migrate to the new per-user system)
- No Fellow credentials are ever exposed client-side
- Share button produces a working brew.link anyone can use

## Scope Boundaries

- No Fellow OAuth (doesn't exist). Email/password only.
- No profile management in Coffee Hub (browsing/deleting profiles on the Aiden). Just push + share.
- No multi-device support (if a user has multiple Aidens, use the first one, same as current behavior).
- No Fellow account creation flow. Users must already have a Fellow account.

## Key Decisions

- **Hybrid over either/or**: Brew.link is the universal baseline. Fellow login is an optional upgrade. This avoids forcing users to share credentials while rewarding those who do with better UX.
- **Relay account stays**: Tal's account continues generating brew.links for non-connected users. This is safe because profiles are ephemeral (created, shared, deleted in one request).
- **Firestore encrypted storage over session-only**: Reduces friction. Users connect once, push forever. The alternative (enter password each time) would kill the one-tap UX.

## Dependencies / Assumptions

- Brew.links are truly universal (any Fellow app user can open them, confirmed by Tal)
- Fellow API does not rate-limit a single account aggressively enough to matter at early scale
- Fellow's email/password auth endpoint remains stable (no official public API docs)

## Outstanding Questions

### Resolve Before Planning
(none)

### Deferred to Planning
- [Affects R5][Needs research] What encryption approach for Fellow credentials in Firestore? Server-side encryption key management (env var vs KMS vs Firebase security rules).
- [Affects R2][Needs research] Does Fellow's access token have an expiry? If so, should we cache tokens or re-auth each push? Current flow re-auths every time.
- [Affects R4][Technical] Where in the current onboarding wizard flow does the Fellow connection step fit? Need to review existing onboarding implementation.
- [Affects R6][Technical] At what scale does the relay account become a bottleneck? Should we add rate-limit monitoring or a circuit breaker?
- [Affects R1][Needs research] Does the brew.link reliably deep-link into the Fellow app on iOS, or does it just open a web page? Test on both platforms.

## Next Steps

-> `/ce:plan` for structured implementation planning

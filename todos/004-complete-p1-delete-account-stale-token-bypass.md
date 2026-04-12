---
status: pending
priority: p1
issue_id: 004
tags: [code-review, security, auth, apple-review-blocker]
dependencies: []
---

# P1: delete-account endpoint accepts stale ID tokens, no reauth, no refresh revoke

## Problem Statement

Three layered issues:

1. **No recent-reauth check**: `api/delete-account.js` accepts any valid Firebase ID token (1-hour lifetime). The `confirmation: "DELETE"` body is not a secret. A stolen token replayed in the 60-min window wipes the victim's account.

2. **No refresh token revocation**: After `getAuth().deleteUser(uid)`, the deleted user's existing ID tokens remain cryptographically valid for up to 60 minutes. `cors-auth.js:77` calls `verifyIdToken(token)` without `checkRevoked: true`, so revoked tokens are still accepted.

3. **Client uses cached token**: `fetchWithRetry.js:21` calls `auth.currentUser?.getIdToken()` without `forceRefresh`. A token from 50 minutes ago (fetched during sign-in) is used for the delete request.

Combined impact: after account deletion, a compromised token can still call `/api/claude`, `/api/gemini`, etc. for up to 60 minutes, burning your AI budget against a ghost account.

## Findings

**Files:**
- `api/delete-account.js:22-25, 169-178`
- `api/lib/cors-auth.js:77`
- `src/lib/fetchWithRetry.js:21`
- `src/components/SettingsPage.jsx:388-412`

Flagged by: security P1-3, P2-8, races P2-5.

## Proposed Solutions

### Required fixes (all three)

**1. Require recent reauth server-side:**
```js
// api/delete-account.js, after uid check:
const authTime = decodedToken.auth_time; // unix seconds
if (Date.now() / 1000 - authTime > 5 * 60) {
  return res.status(401).json({ error: 'reauth_required' });
}
```

**2. Revoke refresh tokens before deleteUser:**
```js
// api/delete-account.js, in the Auth step:
await getAuth().revokeRefreshTokens(uid);
await getAuth().deleteUser(uid);
```

**3. Verify with checkRevoked on sensitive endpoints (optional, defense in depth):**
```js
// api/lib/cors-auth.js:77 — only for /api/delete-account, or all endpoints if the extra Firestore read is tolerable
return await auth.verifyIdToken(token, true);
```

**4. Client force-refresh token before delete call:**
```js
// src/components/SettingsPage.jsx handleDeleteAccount:
await auth.currentUser.getIdToken(true); // force refresh
// then call fetchWithRetry (which will pick up the fresh token)
```

**5. Add reauth flow on the client:**
Before opening the delete confirmation modal, force the user to re-sign-in via `reauthenticateWithCredential` (Google/Apple SSO flow). Store the reauth timestamp and pass it.

### Additional fixes

- Catch `auth/user-not-found` in delete-account.js and treat as success (idempotency fix)
- Client treat 401 `reauth_required` by opening the reauth flow instead of showing generic error

## Recommended Action

All five. Ship before launch. The reauth flow is the highest friction change — test it with Google and Apple Sign-In paths.

## Technical Details

- Files: `api/delete-account.js`, `api/lib/cors-auth.js`, `src/lib/fetchWithRetry.js`, `src/components/SettingsPage.jsx`
- Client change requires Firebase Auth `reauthenticateWithPopup` (web) or equivalent native path
- No schema changes

## Acceptance Criteria

- [ ] Server rejects delete-account calls with auth_time > 5 min old
- [ ] Client force-refreshes token before delete request
- [ ] Server calls `revokeRefreshTokens` before `deleteUser`
- [ ] After delete, the previously-valid ID token is rejected by at least one other endpoint (proves revocation works if `checkRevoked: true` is applied there)
- [ ] Client calls reauth flow before showing the delete confirmation modal
- [ ] Idempotent retry: second delete call returns success, not 500
- [ ] Apple review: verify the deletion flow satisfies Guideline 5.1.1(v)

## Work Log

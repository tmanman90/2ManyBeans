---
title: "feat: Multi-User Fellow Aiden Integration"
type: feat
status: active
date: 2026-04-05
origin: docs/brainstorms/2026-04-05-fellow-multi-user-aiden-requirements.md
---

# feat: Multi-User Fellow Aiden Integration

## Enhancement Summary

**Deepened on:** 2026-04-05
**Sections enhanced:** All phases + architecture + security + performance
**Research agents used:** best-practices-researcher, security-sentinel, architecture-strategist, performance-oracle, code-simplicity-reviewer, framework-docs-researcher, learnings-researcher

### Key Improvements
1. **Simplified scope**: Cut from 8 files to 4. Deferred onboarding, share button, reconnect banner, and shared form component.
2. **Security hardening**: Encrypted credentials moved to separate Firestore subcollection (`users/{uid}/secrets/fellow`) with `allow read, write: if false`. Single-blob encryption (email+password as JSON). Key versioning from day one.
3. **Performance**: Fellow token + device ID caching saves 300-700ms per push. Aggressive timeouts + fast failover on credential failure.
4. **Eliminated non-functional code**: Dropped in-memory rate limiting (doesn't work on Vercel serverless). Dropped status endpoint (client reads Firestore directly). Gated relay fallback to prevent silent misdirection.

### New Considerations Discovered
- Firestore security rules expose entire user doc to client, encrypted blobs must live elsewhere
- Shared IV for email and password is a crypto error, single JSON blob is correct
- `withCorsAuth` blocks GET requests, status endpoint must be POST or eliminated
- Relay fallback without UID gating silently pushes to Tal's device on any credential read failure
- Native profile load failures must not be confused with "Fellow not connected"

---

## Overview

Coffee Hub uses a single hardcoded Fellow account for all Aiden operations. The "Send to Aiden" button pushes recipes to Tal's physical device. Other users need recipes on their own Aiden. Fellow has no OAuth, only email/password auth. The solution is a hybrid: brew.link as the universal default (no login needed), with optional Fellow account connection for direct one-tap push.

(see origin: `docs/brainstorms/2026-04-05-fellow-multi-user-aiden-requirements.md`)

## Problem Statement

When new users sign up, the Aiden flow pushes recipes to Tal's device, not theirs. Brew.links are universal (any Fellow user can open them), so the relay approach works for generating shareable links. But the one-tap "Send to Aiden" UX requires per-user Fellow credentials to push directly to the user's own device.

## Proposed Solution

**Hybrid approach**: All users get brew.links via the relay account. Users who connect their Fellow account get upgraded to direct device push. The connection is optional, available in Settings.

**Key architectural decisions** (see origin):
- **Relay account stays**: Tal's account continues generating brew.links for non-connected users. Profiles are ephemeral (created, shared, deleted in one request).
- **Firestore encrypted storage**: Fellow email/password encrypted server-side with AES-256-GCM, stored in a separate secrets subcollection via Admin SDK.
- **No Fellow OAuth**: Email/password only (Fellow doesn't offer OAuth).

## Technical Approach

### Architecture

```
Client                          Server (Vercel)                  External
------                          ---------------                  --------
                                
[SettingsPage]           
  |-- POST /api/fellow          
      {email, password}  -----> [api/fellow.js]
                                  |-- validate with Fellow API --> [Fellow /auth/login]
                                  |-- encrypt(JSON.stringify({email, password}))
                                  |-- Admin SDK write to 
                                  |   users/{uid}/secrets/fellow
                                  |-- Admin SDK write fellow.connected + fellow.email
                                  |   to users/{uid} (profile doc)
                                  |-- return {connected: true}
                                  
[AidenModal]                    
  |-- POST /api/aiden           
      {recipe}  --------------> [api/aiden.js]
                                  |-- read users/{uid}/secrets/fellow
                                  |-- if credentials exist:
                                  |     decrypt -> auth as user -> push to their device
                                  |     create -> share -> DELETE (same as relay)
                                  |-- else:
                                  |     auth as relay -> push to relay device
                                  |     create -> share -> DELETE
                                  |-- return {link, usedRelay: bool}
```

**Profile lifecycle for connected users**: Same create-share-delete flow as the relay. The profile is ephemeral. The brew.link is the durable artifact. This avoids users hitting Fellow's 14-profile device limit.

### Encryption Design

- **Algorithm**: AES-256-GCM (Node.js `crypto` module, zero dependencies)
- **Key**: Single 32-byte key stored as Vercel env var `FELLOW_ENCRYPTION_KEY` (64-char hex string)
- **Per-record IV**: Random 12-byte IV generated per encryption, packed into the ciphertext blob
- **Single-blob encryption**: Email and password encrypted as a single JSON blob `{"email":"...","password":"..."}` to avoid IV reuse across fields

**Storage format** in Firestore:

```
users/{uid}:                           # Profile doc (client-readable)
  fellow:
    connected: true                    # for UI branching
    email: "user@example.com"          # for display in Settings
    connectedAt: timestamp

users/{uid}/secrets/fellow:            # Secrets doc (Admin SDK only, client CANNOT read)
  encCredentials: "base64..."          # AES-256-GCM: iv (12) + authTag (16) + ciphertext
  keyVersion: 1                        # for future key rotation
  updatedAt: timestamp
```

### Research Insights: Encryption

**Best Practices Applied:**
- Pack IV + authTag + ciphertext into a single base64 blob (no separate IV field). This is the standard GCM pattern: `iv(12) + authTag(16) + ciphertext(variable)`.
- `keyVersion` field from day one enables zero-downtime rotation later: deploy new key, lazy re-encrypt on read, retire old key.
- Never store the key as UTF-8. Use 64-char hex string in env var, decode with `Buffer.from(key, 'hex')`.
- `cipher.final()` must be called before `cipher.getAuthTag()`. `decipher.final()` throws on tampered data (this IS the integrity check).

**Concrete encrypt/decrypt pattern:**

```javascript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encrypt(plaintext, keyBuffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(packed, keyBuffer) {
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
```

**Key rotation strategy** (implement the script, defer running it):
1. Support multiple active keys at decrypt time: `KEYS = { 1: key_v1, 2: key_v2 }`
2. Always encrypt with `CURRENT_VERSION`
3. On read, if `keyVersion < CURRENT_VERSION`, re-encrypt with new key and update doc
4. Retire old key once all docs are migrated (query `keyVersion == 1`)

### Credential Failure Handling

When a connected user's Fellow credentials fail (401 from Fellow API):
1. Server falls back to relay account flow (gated, see below)
2. Returns `{ link, fellowCredentialsInvalid: true }`
3. Client shows brew.link (user isn't blocked)
4. Server does NOT auto-clear credentials (might be transient Fellow outage)

### Research Insight: Gate the Relay Fallback

The relay fallback is dangerous if ungated. A Firestore read failure (returning no credentials) would silently push to Tal's device. Fix:

- Only use relay env vars if `decodedToken.uid` matches `RELAY_ADMIN_UID` env var, OR if the user explicitly has no Fellow credentials (`secrets/fellow` doc does not exist, distinct from read failure)
- On Firestore read failure: return error, do NOT fall back to relay
- On Fellow auth 401 with user credentials: fall back to relay for brew.link generation only (no device push ambiguity since profiles are ephemeral)

### Client Fellow Status

The client reads `profile.fellow.connected` (boolean) from the user profile snapshot it already subscribes to:
- `true` -> Show "Send to Aiden" button (direct push)
- `false`/missing -> Show "Open on Aiden" button (brew.link opened in browser)

No separate status API endpoint needed. The profile snapshot is already live.

### Research Insight: Read Primitives, Not Objects (from learnings)

```javascript
// WRONG: creates new reference every render, cascade re-renders
const fellow = profile?.fellow || { connected: false };

// RIGHT: read primitives directly
const fellowConnected = profile?.fellow?.connected ?? false;
const fellowEmail = profile?.fellow?.email ?? null;
```

### Research Insight: Distinguish Load Failure from Missing (from learnings)

```javascript
// WRONG: network failure silently degrades to relay
const useRelay = !profile?.fellow?.connected;

// RIGHT: check profileLoadError first
if (profileLoadError) {
  // Show retry UI, do NOT assume Fellow is disconnected
  return;
}
const useRelay = !profile?.fellow?.connected;
```

### Firestore Security Rules

**Deploy before client code.** Add rules for the new secrets subcollection:

```
match /users/{userId}/secrets/{secretId} {
  // Admin SDK only. Client cannot read or write.
  allow read, write: if false;
}
```

The profile-level `fellow.connected` and `fellow.email` fields are safe for client reads (no secrets). But add a client-write deny for `fellow.*` to prevent client-side tampering:

```
// In the user profile write rule, deny client writes to fellow.*
&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['fellow']))
```

### Firebase Admin SDK Pattern

Extend the existing singleton in `api/lib/cors-auth.js`:

```javascript
import { getFirestore } from 'firebase-admin/firestore';

// Add alongside existing getFirebaseAdmin():
export function getDb() {
  getFirebaseAdmin(); // ensure app initialized
  return getFirestore();
}
```

**Research insight**: Consider `initializeFirestore(app, { preferRest: true })` to avoid gRPC, cutting cold start by ~200-400ms. REST transport is ideal for serverless where connections don't persist.

### Performance: Token + Device Caching

Cache Fellow access token and device ID in the secrets doc to avoid re-auth and re-fetch on every push:

```
users/{uid}/secrets/fellow:
  encCredentials: "base64..."
  keyVersion: 1
  fellowToken: "cached-access-token"    # optional, cleared on 401
  fellowTokenExpiry: timestamp           # optional
  fellowDeviceId: "device-uuid"         # stable, rarely changes
  updatedAt: timestamp
```

**Estimated savings**: 300-700ms per push (eliminates auth + devices API calls on warm path).
**Invalidation**: On any Fellow 401, clear token cache and re-auth. On 404 from devices endpoint, clear device cache.

### Performance: Fast Failover

Set aggressive timeouts on Fellow API calls. Switch to relay on status code, not timeout:

```javascript
// Fast failover on 401/403 (credentials invalid)
try {
  token = await fellowFetch('/auth/login', userCreds, { timeout: 3000 });
} catch (err) {
  if (err.status === 401 || err.status === 403) {
    return pushViaRelay(profile); // fast switch
  }
  throw err; // other errors bubble up
}
```

**Projected latency:**

| Scenario | Current | After Optimization |
|----------|---------|-------------------|
| Happy path (cached token) | 600-1300ms | 350-700ms |
| First push (no cache) | 600-1300ms | 600-1300ms |
| Relay fallback (fast 401) | N/A | 700-1400ms |

---

## Implementation Phases

### Phase 1: Server Infrastructure

**Goal**: Encryption utility, Fellow account API, Firestore schema, security rules.

**Files to create/modify**:

#### `api/lib/crypto.js` (new)
- `encrypt(plaintext)` -> base64 blob (iv + authTag + ciphertext)
- `decrypt(packed)` -> plaintext string
- AES-256-GCM, 12-byte random IV, key from `Buffer.from(process.env.FELLOW_ENCRYPTION_KEY, 'hex')`
- Wrap `decipher.final()` in try/catch (throws on tampered data)

#### `api/lib/cors-auth.js` (modify)
- Add `getDb()` export that returns `getFirestore()` from the existing admin singleton
- Reuses the same `getApps().length === 0` guard

#### `api/fellow.js` (new)
Two actions via query param `?action=connect|disconnect`:

**`connect`** (POST):
1. Validate Firebase ID token (via `withCorsAuth`)
2. Validate input: email format, password length < 256 chars
3. Validate Fellow credentials by calling Fellow `/auth/login`
4. If Fellow auth succeeds:
   - Encrypt `JSON.stringify({ email, password })` as single blob
   - Write to `users/{uid}/secrets/fellow` via Admin SDK: `{ encCredentials, keyVersion: 1, updatedAt }`
   - Write to `users/{uid}` via Admin SDK: `{ 'fellow.connected': true, 'fellow.email': email, 'fellow.connectedAt': serverTimestamp() }`
   - Use single `writeBatch` for atomicity across both docs
5. Return `{ connected: true, email }`
6. If Fellow auth fails: return 401 with Fellow's error message
7. **Never log `req.body`**. Sanitize: `const { password, ...safe } = req.body; console.log('Fellow connect:', safe);`

**`disconnect`** (POST):
1. Validate Firebase ID token
2. Delete `users/{uid}/secrets/fellow` doc via Admin SDK
3. Update `users/{uid}` via Admin SDK: `{ 'fellow.connected': false, 'fellow.email': FieldValue.delete(), 'fellow.connectedAt': FieldValue.delete() }`
4. Use single `writeBatch` for atomicity
5. Return `{ connected: false }`

#### Firestore Security Rules (deploy first)
```
match /users/{userId}/secrets/{secretId} {
  allow read, write: if false;
}
```

#### Environment
- Add `FELLOW_ENCRYPTION_KEY` to Vercel env vars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Use `printf '%s' "value" | vercel env add` (not `echo`, which adds trailing newline)
- Add `RELAY_ADMIN_UID` (Tal's Firebase UID) for gated relay fallback

**Acceptance criteria**:
- [ ] `api/lib/crypto.js`: encrypt/decrypt round-trips correctly
- [ ] `api/fellow.js?action=connect`: validates with Fellow API, encrypts, stores in secrets subcollection
- [ ] `api/fellow.js?action=disconnect`: removes secrets doc and profile fields
- [ ] Firestore rules deployed: client cannot read `users/{uid}/secrets/*`
- [ ] `curl` test against deployed endpoint confirms both actions work
- [ ] Credentials never appear in Vercel function logs

---

### Phase 2: Settings Page + Aiden Push Refactor

**Goal**: Add Fellow connection UI to Settings. Modify `api/aiden.js` for per-user credentials.

**Files to modify**:

#### `src/components/SettingsPage.jsx`
Add a new "Fellow Aiden" section (between Equipment and Notifications):

**Disconnected state**:
```
[Fellow Aiden]
Connect your Fellow account for         [Connect]
one-tap recipe push to your Aiden
```

Tapping "Connect" expands an inline form: email input + password input (type="password") + Save button.

**Connected state**:
```
[Fellow Aiden]
Connected as user@fellow.com            [Disconnect]
```

**Connect flow**:
1. Save button calls `fetchWithRetry('POST', '/api/fellow?action=connect', { email, password })`
2. Loading state on button during validation
3. On success: haptic + toast "Fellow account connected", collapse form, show connected state
4. On error: show Fellow's error message inline
5. Local profile state updates automatically via Firestore snapshot

**Disconnect flow**:
1. Tapping "Disconnect" shows confirmation
2. Calls `fetchWithRetry('POST', '/api/fellow?action=disconnect')`
3. On success: haptic + toast, reverts to disconnected state

**Styling**: Match existing iOS grouped-table pattern. 44px row height, white card, 0.5px separator.

#### `api/aiden.js` (modify)
Refactor the push handler:

1. After `withCorsAuth` extracts `uid` from the Firebase token
2. Read `users/{uid}/secrets/fellow` from Firestore via Admin SDK (`getDb()`)
3. If secrets doc exists and has `encCredentials`:
   - Decrypt credentials
   - Authenticate with Fellow API using user's credentials
   - If Fellow returns cached token in secrets doc and it's not expired, skip auth
   - Proceed with create -> share -> **delete** (same ephemeral flow)
   - On Fellow auth 401: set `fellowCredentialsInvalid = true`, fall back to relay (gated)
   - After successful push, cache Fellow token + device ID in secrets doc
4. If secrets doc does NOT exist (confirmed absence, not read failure):
   - Use `FELLOW_EMAIL` / `FELLOW_PASSWORD` from env vars (relay)
   - Proceed with create -> share -> delete
5. If Firestore read FAILS (error, not empty): return 500 error, do NOT fall back to relay
6. Return `{ link, profileId, title, usedRelay, fellowCredentialsInvalid }`

**Key safety rules:**
- Both paths delete the temp profile (ephemeral)
- Firestore read failure != "no credentials". Never fall through to relay on error.
- Relay fallback only for confirmed non-connected users or auth 401 fallback

#### `src/components/AidenModal.jsx` (minor modify)
- Read `fellowConnected` as primitive from profile: `const fellowConnected = profile?.fellow?.connected ?? false;`
- If `fellowConnected`: button says "Send to Aiden" (existing behavior)
- If not: button says "Open on Aiden" (opens brew.link in browser)
- Check `profileLoadError` before evaluating Fellow status

#### `src/hooks/useAidenBrew.js` (minor modify)
- After push, check `fellowCredentialsInvalid` in response
- If true, surface in modal (simple text note, not a complex banner for v1)

**Acceptance criteria**:
- [ ] Settings: connect form validates and shows success/error
- [ ] Settings: connected state displays email, disconnect works
- [ ] Settings: haptic + toast on all state changes, password field masked
- [ ] Push: connected user's recipe pushes via their Fellow account
- [ ] Push: non-connected user's recipe pushes via relay
- [ ] Push: Firestore read failure returns error (not silent relay fallback)
- [ ] Push: Fellow auth 401 falls back to relay with `fellowCredentialsInvalid` flag
- [ ] Modal: button text reflects connection status

---

### Phase 3: Migration and Verification

**Goal**: Migrate Tal's credentials, verify end-to-end, handle edge cases.

#### Tal's credential migration
- One-time: call `POST /api/fellow?action=connect` with Tal's Fellow credentials while authenticated as Tal
- After migration, Tal's pushes use his Firestore credentials (same as any connected user)
- `FELLOW_EMAIL` / `FELLOW_PASSWORD` env vars remain for the relay account
- `RELAY_ADMIN_UID` env var set to Tal's Firebase UID (gated relay)

#### Edge cases to verify
- [ ] User connects Fellow, generates recipe, disconnects, generates again (falls back to relay)
- [ ] Two users generate recipes simultaneously (relay handles concurrent create-share-delete)
- [ ] Fellow API is down: both paths fail gracefully with error message
- [ ] User with no Aiden device in Fellow account: error "No Aiden device found"
- [ ] Firestore read failure on push: returns error, does not fall through to relay
- [ ] Tal's flow after migration: identical to before

**Acceptance criteria**:
- [ ] Tal's credentials migrated, his flow unchanged
- [ ] All edge cases pass
- [ ] No Fellow credentials visible in client-side code, network tab, or Firestore console
- [ ] `users/{uid}/secrets/fellow` is unreadable from client (verified via Firestore rules)

---

### Deferred (post-launch, based on usage data)

These items from the original plan are intentionally deferred until real users justify them:

| Item | Reason to defer |
|------|----------------|
| **Onboarding wizard Fellow step** (R4) | One-time flow, most users past it, tiny user base. Settings is sufficient. |
| **Share recipe button** (R7) | Feature creep. Not part of core "connect your Aiden" flow. |
| **Reconnect banner in AidenModal** (R8) | Over-engineering error recovery before knowing failure modes. Simple text note in v1. |
| **FellowConnectForm.jsx shared component** | Premature abstraction for 1 use (Settings only in v1). Extract when onboarding needs it. |
| **Upstash Redis rate limiting** | No rate limiting in v1. Fellow's own API rate-limits. Handle 429s gracefully. Add Upstash if abuse occurs. |
| **Key rotation execution** | Script designed (see encryption section) but not run until needed. |

---

## System-Wide Impact

### Interaction Graph

1. User taps "Connect Fellow" in Settings
2. `SettingsPage` calls `fetchWithRetry('POST', '/api/fellow?action=connect', {email, password})`
3. `api/fellow.js` -> `withCorsAuth` validates Firebase token -> Fellow API validates credentials -> `crypto.encrypt` -> `writeBatch`: secrets doc + profile doc
4. Client receives success -> profile snapshot auto-updates -> UI reflects connected status
5. Later: user taps "Brew with Aiden" -> `useAidenBrew` runs research + recipe -> calls `pushToAiden`
6. `api/aiden.js` -> `withCorsAuth` -> reads secrets doc -> `crypto.decrypt` -> Fellow API auth + push
7. If Fellow auth 401: gated fallback to relay env vars -> returns `fellowCredentialsInvalid: true`
8. Client shows brew.link + simple credential failure note

### Error Propagation

- Fellow API 401 on connect: surfaced as "Invalid email or password"
- Fellow API 401 on push (stale credentials): gated relay fallback, `fellowCredentialsInvalid` flag
- Fellow API 5xx: both paths fail, error surfaced in AidenModal (existing handling)
- Firestore read failure on push: returns 500 error (NOT relay fallback)
- Encryption key missing: server returns 500, logged server-side
- Decryption failure (tampered data): `decipher.final()` throws, caught, returns 500

### State Lifecycle Risks

- **Partial write on connect**: Mitigated by `writeBatch` (secrets doc + profile doc in single atomic batch)
- **Orphaned credentials on account deletion**: Add `users/{uid}/secrets/*` cleanup to account deletion flow
- **Stale Fellow token cache**: Cleared on any 401, re-auth on next push

### API Surface Parity

- `api/aiden.js`: modified (per-user credential lookup + relay fallback)
- `api/fellow.js`: new endpoint (connect, disconnect)
- `api/lib/crypto.js`: new utility (encrypt, decrypt)
- `api/lib/cors-auth.js`: modified (add `getDb()` export)
- No changes to `api/claude.js`, `api/openai.js`, `api/gemini.js`

## Alternative Approaches Considered

1. **Brew.link only (no Fellow login)**: Simpler but loses the one-tap UX. (see origin)
2. **Session-only credentials**: More secure but kills the one-tap UX. (see origin)
3. **Token caching only**: Avoids storing passwords but tokens expire with unknown TTL. (see origin)
4. **Client-side encryption**: Key in JS bundle = not secure. Server-side is strictly better. (see origin)
5. **Query param routing on single endpoint**: Rejected per architecture review. Separate endpoint files match existing patterns.
6. **Credentials in user profile doc**: Rejected per security audit. Client can read profile doc, encrypted blobs must be in `secrets/` subcollection.
7. **In-memory rate limiting**: Non-functional on Vercel serverless (cold starts reset Map). Deferred entirely.

## Dependencies & Prerequisites

- `firebase-admin` package (already in `package.json` v13.6.1)
- `FELLOW_ENCRYPTION_KEY` env var in Vercel (32-byte hex)
- `RELAY_ADMIN_UID` env var in Vercel (Tal's Firebase UID)
- Firestore security rules deployed before client code
- Fellow API stability (reverse-engineered endpoints, no official docs)
- Brew.link universality confirmed by Tal

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fellow changes their API | Medium | High | Relay account is canary. Monitor. |
| Encryption key leaked | Low | High | Key versioning + rotation script ready. Small user base makes re-encryption fast. |
| Fellow rate-limits relay at scale | Low (early) | Medium | Most users will connect their own account. Relay only for non-connected users. |
| Brew.link doesn't deep-link on iOS | Unknown | Medium | Test empirically. Fallback: copy to clipboard + instructions. |
| Concurrent relay pushes race on device | Low | Low | Ephemeral profiles (create-share-delete) minimize window. |
| Firestore read failure causes wrong account push | Low | High | Gated relay: error on read failure, never silent fallback. |

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-05-fellow-multi-user-aiden-requirements.md](docs/brainstorms/2026-04-05-fellow-multi-user-aiden-requirements.md). Key decisions: hybrid brew.link + optional Fellow login, encrypted Firestore storage, relay account stays.

### Internal References

- Current Aiden proxy: `api/aiden.js`
- Client Aiden lib: `src/lib/aiden.js`
- Aiden hook: `src/hooks/useAidenBrew.js`
- Aiden modal: `src/components/AidenModal.jsx`
- Settings page: `src/components/SettingsPage.jsx`
- Auth middleware: `api/lib/cors-auth.js` (Firebase Admin singleton at lines 2-17)
- User profile hook: `src/hooks/useAppData.js` (useUserProfile)

### Institutional Learnings Applied

- Single `update()` / `writeBatch` per logical operation (from `firestore-settings-phase2-write-patterns.md`)
- Deploy Firestore rules before client code writes new fields (from same)
- Read Fellow status as primitives, not derived objects, to prevent re-render cascades (from same)
- Distinguish `profileLoadError` from "Fellow not connected" (from `native-profile-load-failure-indistinguishable-from-missing.md`)
- Never let a failed read trigger a destructive write or incorrect fallback (from same)
- Never delete Fellow profiles as a workaround (from `lessons.md`)
- Forward real error status from upstream APIs (from `lessons.md`)
- Use `printf` not `echo` for Vercel env vars (from `lessons.md`)

### External References

- [Node.js Crypto AES-256-GCM](https://nodejs.org/api/crypto.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Firebase Admin SDK Firestore](https://firebase.google.com/docs/firestore/manage-data/add-data#server)
- [Upstash Ratelimit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview) (deferred, for future reference)

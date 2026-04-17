---
title: Redemption Codes (Free Subscription Grants)
type: feat
status: active
date: 2026-04-15
---

# Redemption Codes (Free Subscription Grants)

## Enhancement Summary

**Deepened on:** 2026-04-15
**Research inputs:** security-sentinel, data-integrity-guardian, architecture-strategist, code-simplicity-reviewer, pattern-recognition-specialist, best-practices-researcher, framework-docs-researcher, learnings-researcher (8 parallel agents).

### Key improvements folded in
1. **Collapsed `manualEntitlement` into `subscription.*`.** The original plan's two-field design created a phantom second entitlement source that `api/lib/checkEntitlement.js` (the real server-side gate) knew nothing about. Writing directly to `subscription.*` means the existing gate, cache, and `SubscriptionContext` all work unchanged. Stacking is still blocked upstream, so there is no RC webhook stomp risk in practice.
2. **Mandatory use of existing `api/lib/cors-auth.js`** (`withCorsAuth`, `getDb`) and the `api/lib/checkEntitlement.js` cache invalidation helper. The RC webhook is the wrong pattern reference for a user-authenticated endpoint. `api/delete-account.js` is the correct precedent.
3. **Transaction rewrites `useCount` as literal `c.useCount + 1`, not `FieldValue.increment(1)`.** Matches the explicit pattern and precedent in `api/lib/cors-auth.js:238` (`withCorsAuthMetered`), which comments: "Use literal value (not FieldValue.increment) so the transaction retries cleanly on contention."
4. **HMAC-SHA256 with server-side pepper** for the email ledger doc ID instead of plain normalized email. GDPR-compliant pseudonymization (EDPS/AEPD guidance 2025 flags plain SHA-256 as rainbow-attackable), and sidesteps Firestore doc-ID character restrictions.
5. **Complete Gmail canonicalization**, including the `googlemail.com` → `gmail.com` fold that the original plan only mentioned in prose. Also NFKC normalization for Unicode.
6. **`decoded.email_verified === true` precondition.** `firebase-admin@13.6.1` types both `decoded.email` and `decoded.email_verified` as optional; we must hard-check them before using the email as a lock.
7. **Firestore rules updated on BOTH create AND update paths.** The original plan only updated update; the create path's `hasAny` ban must also exclude the new fields.
8. **Cheap regex pre-check `/^[A-Z0-9-]{4,20}$/` on the submitted code.** Rejects junk before it costs a Firestore transaction. Closes the brute-force/Vercel-budget footgun without building a full rate limiter.
9. **`fetchWithRetry` + `API_BASE`** on the client helper (matches every other `src/lib/*.js` helper). Reason-code → friendly message mapping lives in the modal, not the helper.
10. **Inline expand-row in Settings**, not a modal. Matches the existing Settings row pattern and avoids portal/focus/safe-area overhead for what is one text input.
11. **Extracted business logic to `api/lib/redemption.js`.** Normalization, HMAC, validation cascade, and the transaction body are a pure module. The HTTP handler stays thin.
12. **Structured logging on every reason-code exit** (matches the RC webhook precedent). Without it, abuse debugging on the public Reddit code is impossible.

### Cross-reference of blockers → resolution

| Reviewer finding | Severity | Where it lives now |
|---|---|---|
| `checkEntitlement.js` not updated → Pro UI + 403 on every AI call | Critical | Resolved by collapsing into `subscription.*` — gate works unchanged |
| `FieldValue.increment(1)` inside txn misleading | Blocker | Now explicit `c.useCount + 1` with matching comment |
| Rolling own auth instead of `withCorsAuth` | Blocker | Handler wrapped in `withCorsAuth`, uses `getDb()` |
| `googlemail.com` fold missing | Blocker | Algorithm now rewrites domain explicitly |
| `email_verified` not checked | Blocker | Added as hard precondition |
| Email as raw doc ID (PII + char injection) | Blocker | HMAC-SHA256(pepper, normalizedEmail) doc ID |
| `firestore.rules` create path gap | Blocker | Create rule `hasAny` ban extended |
| No rate limit / no regex check on code | Blocker | Regex pre-check + per-uid attempt counter (see Rate Limiting) |
| Client merge bug on `plan`/`status`/`cancelAtPeriodEnd` leak | Blocker | Moot — we write to `subscription.*`, so no merge needed |
| Ultra-as-superset issue | Blocker | Moot — ditto |
| `api/lib/redemption.js` extraction | Non-blocker | Scoped into plan |
| Hand-rolled `fetch` in client helper | Non-blocker | Now uses `fetchWithRetry` + `API_BASE` |
| Reason-code copy in helper instead of modal | Non-blocker | Modal (inline expand) owns the copy |
| Missing observability | Non-blocker | Structured `console.log`/`console.error` on every exit |
| Onboarding R13 test coverage | Non-blocker | Added to acceptance criteria |
| No GDPR-safe deletion story | Non-blocker | HMAC ID + `normalizedEmail` field allows reverse lookup |
| Viral-code retry storm | Deferred | Documented as follow-up; `maxUses` cap of 100 at launch |

---

## Overview

Ship a server-validated redemption code system so Tal can hand out free Pro access without touching the RevenueCat dashboard or Apple promo codes. Two code types at launch:

- **1-year friend codes** (single-use, one per friend, handed out individually)
- **1-week Fellow-subreddit code** (shared publicly at r/fellow, each user gets one week, then never again)

The hard requirement is abuse-proof: a user who burned their 1-week trial must **never** be able to redeem another code of any type. No rolling-trial loophole. Enforced by a durable per-uid lock plus an HMAC-hashed email ledger that survives account deletion and re-creation.

## Problem Statement / Motivation

Tal wants to:

1. **Gift friends free Pro access** without paying $30 apiece via Apple promo codes (which are also quarterly-limited to 100 and are being retired March 2026 in favor of Apple Offer Codes).
2. **Run a visibility campaign on r/fellow** where anyone who sees the post gets one free week of Pro. Abuse must be impossible; the campaign succeeds if Tal gets organic signal from 100-500 real Fellow enthusiasts trying the app.

Existing infrastructure makes this a mostly-wiring job:

- `api/lib/checkEntitlement.js:65-93` already gates all AI proxies on `users/{uid}.subscription.status` + `.plan` + `.expiresAt`. Writing the redemption grant directly into that field means the gate, the 5-minute positive cache, and the cross-instance cache invalidation all work unchanged.
- `api/lib/cors-auth.js` already wraps `withCorsAuth` with Firebase ID token verification, CORS, method check, and prod-fail-closed semantics. The redemption endpoint reuses it verbatim.
- `api/revenuecat-webhook.js:163` is the reference for a safe `set({ subscription: {...} }, { merge: true })` write shape. The redemption handler mirrors that shape so `checkEntitlement.js` reads it identically.
- `firebase-admin@^13.6.1` is already in `package.json` and already initialized via `getFirebaseAdmin()` in `cors-auth.js`. No new infrastructure.
- `src/lib/fetchWithRetry.js` is the canonical client → API helper and already injects the Firebase ID token.

The only real design problem is preventing reuse across account-deletion and across Google's Gmail aliases. Everything else is pattern-matching to existing code.

## Proposed Solution

Three moving parts:

1. **A `redemptionCodes` Firestore collection** Tal writes to manually (or via a one-file admin script). Clients have zero read or write access.
2. **A new Vercel API route `api/redeem-code.js` (thin) backed by `api/lib/redemption.js` (logic)** that validates a Firebase ID token, verifies the email is present and verified, runs an atomic Firestore transaction (Admin SDK) with a HMAC email ledger, writes the grant directly into `users/{uid}.subscription.*` in the same shape the RC webhook uses, and calls `invalidateEntitlementCache(uid)` so the server-side cache sees the grant within one call.
3. **An inline expand row in Settings** for code entry. No modal. No new component file.

Abuse-prevention uses three independent locks, any of which alone blocks reuse, combined in a single Firestore transaction so concurrent redemptions cannot both succeed:

- **Per-uid lock (primary).** `users/{uid}.redeemedCode` is set forever on first redemption. Presence alone rejects a second attempt. Applies immediately and never clears.
- **HMAC email ledger (defense-in-depth).** `redemptionLedger/{hmacHash}` created in the same transaction. HMAC-SHA256 uses a server-side pepper (`REDEMPTION_EMAIL_PEPPER`) so a Firestore dump cannot be rainbow-tabled. Catches the case where the user doc is deleted via `api/delete-account.js` and the same Google account re-registers with a fresh uid.
- **Per-code cap.** `redemptionCodes/{code}.useCount` is read and atomically rewritten as `c.useCount + 1` inside the transaction. Firestore's optimistic-concurrency read-version stamp guarantees exactly one writer crosses the `useCount >= maxUses` threshold under contention.

---

## Phase 1: Data Model, Rules, Server API, Admin Script

### Data Model

**`redemptionCodes/{CODE}`** — admin-SDK only, clients default-denied via absence of any rule.

```
redemptionCodes/FELLOWFAM
  code: "FELLOWFAM"            // stored uppercase, must equal doc ID
  plan: "pro_1week"            // "pro_1week" | "pro_1year" | future-extensible
  durationDays: 7              // 7 or 365
  maxUses: 100                 // 100 for Reddit launch (raise later if viral)
  useCount: 0                  // incremented atomically inside the txn
  active: true                 // kill switch; false short-circuits to invalid_code
  codeExpiresAt: null          // optional ISO string; null = no expiry
  notes: "r/fellow launch promo"
  createdAt: "2026-04-15T..."
  createdBy: "tal"
```

Friend codes look identical with `plan: 'pro_1year'`, `durationDays: 365`, `maxUses: 1`, `notes: "Friend: Dave"`. Codes are stored **uppercase** and doc ID matches the `code` field.

**`redemptionLedger/{hmacHash}`** — admin-SDK only. `hmacHash` is the hex digest of `HMAC-SHA256(REDEMPTION_EMAIL_PEPPER, normalizedEmail)`.

```
redemptionLedger/<hex64>
  uid: "firebase-uid"
  code: "FRIEND-ABC123"
  plan: "pro_1year"
  redeemedAt: "2026-04-15T..."
  normalizedEmail: "user@gmail.com"   // stored for debug + GDPR reverse-lookup
```

Storing the normalized plaintext email as a field (not in the path) lets Tal delete the ledger entry for a user on request without scanning the collection: hash-then-delete. GDPR Article 17 compliant.

**`users/{uid}` additions** — two new top-level fields plus an overwrite of `subscription.*` in the same shape `api/revenuecat-webhook.js:138-163` uses.

```
users/<uid>
  ...existing fields
  redeemedCode: "FRIEND-ABC123"             // SET FOREVER, NEVER CLEARED
  redeemedAt: "2026-04-15T..."
  subscription: {
    status: "active",                       // matches RC webhook shape exactly
    plan: "pro_1year",
    expiresAt: "2027-04-15T...",            // ISO string, same as webhook
    lastEventType: "REDEMPTION_CODE",
    lastEventAt: "2026-04-15T...",
    grantedCode: "FRIEND-ABC123",           // audit trail
  }
```

The `subscription.*` shape is deliberately identical to what the RC webhook writes, with `lastEventType: "REDEMPTION_CODE"` as the discriminator and `grantedCode` for audit. `api/lib/checkEntitlement.js:65-93` reads it identically — no gate changes needed.

### Environment Variables (new)

- `REDEMPTION_EMAIL_PEPPER` — 32+ byte random secret. Generate once via `openssl rand -hex 32`, paste into Vercel env (all environments), never rotate unless compromised (rotation invalidates every ledger entry). Log a loud startup warning if missing in production; redemption endpoint fails closed (503).
- `GOOGLE_APPLICATION_CREDENTIALS` (local-only, for the admin script) — points at a local service-account JSON. Already standard Google Cloud SDK env var. Not used in Vercel.

No change to `FIREBASE_SERVICE_ACCOUNT` or `REVENUECAT_API_KEY` (both already set).

### Server: `api/redeem-code.js` (HTTP shell, thin)

```js
// api/redeem-code.js
import { withCorsAuth, getDb } from './lib/cors-auth.js';
import { invalidateEntitlementCache } from './lib/checkEntitlement.js';
import { runRedemption, RedeemError } from './lib/redemption.js';

// Matches codes stored uppercase; 4-20 chars, alphanum + hyphen only.
// Rejects anything else BEFORE hitting Firestore so junk inputs don't
// cost a transaction round-trip.
const CODE_RE = /^[A-Z0-9-]{4,20}$/;

// Reason-code → HTTP status. Copy kept CLIENT-SIDE in the modal.
const STATUS = {
  invalid_code:             400,
  invalid_input:            400,
  email_not_verified:       403,
  already_redeemed:         403,
  code_exhausted:           403,
  has_active_subscription:  403,
};

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'missing_uid' });

  // Firebase ID tokens are typed with optional email/email_verified in
  // firebase-admin@13.6.1, so hard-check both. Abuse-prevention lock #2
  // depends on a verified email.
  if (!decodedToken.email || decodedToken.email_verified !== true) {
    console.warn('[redeem-code] email_not_verified', { uid });
    return res.status(403).json({ error: 'email_not_verified' });
  }

  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  try {
    const result = await runRedemption({
      db: getDb(),
      uid,
      email: decodedToken.email,
      code,
    });

    // Match RC webhook pattern: invalidate the server-side positive cache
    // so the next checkEntitlement call sees the fresh grant.
    invalidateEntitlementCache(uid);

    console.log('[redeem-code] success', {
      uid, code, plan: result.plan, expiresAt: result.expiresAt,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RedeemError) {
      console.warn('[redeem-code] reject', { uid, code, reason: err.code });
      return res.status(STATUS[err.code] ?? 500).json({ error: err.code });
    }
    console.error('[redeem-code] transaction failed', err?.message || err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
```

### Server: `api/lib/redemption.js` (pure logic, unit-testable)

```js
// api/lib/redemption.js
import { createHmac } from 'crypto';

export class RedeemError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Gmail canonicalization:
//   1. NFKC normalize, lowercase, trim
//   2. Split on last @
//   3. Rewrite googlemail.com → gmail.com
//   4. For gmail.com: remove dots from local-part, strip +tag
//   5. For other domains: strip +tag only (dots are significant on most
//      non-Gmail providers — Outlook, Yahoo, custom domains)
// Rejects empty or structurally-invalid results (returns null).
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.normalize('NFKC').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  if (domain === 'googlemail.com') domain = 'gmail.com';

  // Strip everything from + to end, then for gmail also remove dots.
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');

  if (!local) return null;
  // Firestore doc IDs cannot contain slashes or newlines. We're only using
  // the normalized email for HMAC input, not a path, so no char check
  // needed here — the HMAC produces a safe hex ID regardless.
  return `${local}@${domain}`;
}

export function hmacEmailHash(normalizedEmail) {
  const pepper = process.env.REDEMPTION_EMAIL_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('REDEMPTION_EMAIL_PEPPER missing or too short');
  }
  return createHmac('sha256', pepper).update(normalizedEmail).digest('hex');
}

// Main transaction. Reads-before-writes (Firestore requirement).
// Uses literal `c.useCount + 1` (not FieldValue.increment) so retries
// on contention read the fresh value — matches the precedent comment at
// api/lib/cors-auth.js:238 inside withCorsAuthMetered.
export async function runRedemption({ db, uid, email, code }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new RedeemError('invalid_input');
  const emailHash = hmacEmailHash(normalized);

  const codeRef   = db.doc(`redemptionCodes/${code}`);
  const userRef   = db.doc(`users/${uid}`);
  const ledgerRef = db.doc(`redemptionLedger/${emailHash}`);

  const result = await db.runTransaction(async (tx) => {
    // Reads first (Firestore requires this).
    const [codeSnap, userSnap, ledgerSnap] = await Promise.all([
      tx.get(codeRef),
      tx.get(userRef),
      tx.get(ledgerRef),
    ]);

    if (!codeSnap.exists) throw new RedeemError('invalid_code');
    const c = codeSnap.data();
    if (!c.active) throw new RedeemError('invalid_code');
    if (c.codeExpiresAt && new Date(c.codeExpiresAt) < new Date()) {
      throw new RedeemError('invalid_code');
    }
    if (typeof c.maxUses === 'number' && c.useCount >= c.maxUses) {
      throw new RedeemError('code_exhausted');
    }

    // Per-uid lock: if the user already has redeemedCode set, reject.
    if (userSnap.exists && userSnap.data().redeemedCode) {
      throw new RedeemError('already_redeemed');
    }
    // Per-email ledger lock: HMAC ID collision means prior redemption on
    // a different uid but the same Gmail/Google account.
    if (ledgerSnap.exists) {
      throw new RedeemError('already_redeemed');
    }
    // Block stacking: if the user already has an active/trial RC sub,
    // don't let redemption overwrite it.
    const existingSub = userSnap.data()?.subscription;
    if (existingSub?.status === 'active' || existingSub?.status === 'trial') {
      // Only block if NOT from a prior redemption (can't happen given per-uid
      // lock above, but defense-in-depth against future field drift).
      if (existingSub.lastEventType !== 'REDEMPTION_CODE') {
        throw new RedeemError('has_active_subscription');
      }
    }

    // Writes. Transaction retry on contention re-runs the whole function,
    // so reading c.useCount + 1 fresh on each retry is correct.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + c.durationDays * 86400 * 1000);

    tx.update(codeRef, { useCount: c.useCount + 1 });

    tx.set(ledgerRef, {
      uid,
      code,
      plan: c.plan,
      redeemedAt: now.toISOString(),
      normalizedEmail: normalized,
    });

    tx.set(userRef, {
      redeemedCode: code,
      redeemedAt: now.toISOString(),
      subscription: {
        status: 'active',
        plan: c.plan,
        expiresAt: expiresAt.toISOString(),
        lastEventType: 'REDEMPTION_CODE',
        lastEventAt: now.toISOString(),
        grantedCode: code,
      },
    }, { merge: true });

    // Loud log when a public code is nearing exhaustion so Tal sees it
    // in Vercel logs before it's fully burned.
    if (typeof c.maxUses === 'number' && c.useCount + 1 >= c.maxUses * 0.9) {
      console.warn('[redemption] code near exhaustion', {
        code, useCount: c.useCount + 1, maxUses: c.maxUses,
      });
    }

    return {
      plan: c.plan,
      expiresAt: expiresAt.toISOString(),
    };
  });

  return result;
}
```

**Why literal `c.useCount + 1` not `FieldValue.increment(1)`:** Firestore transactions retry on read-version contention. On retry, the callback re-runs and re-reads `codeSnap`, so `c.useCount` is always fresh. `FieldValue.increment()` is a server-side sentinel designed for out-of-transaction fire-and-forget counters; mixing it with a transactional read of the same field makes the read-modify-write semantics confusing to future readers. The existing `withCorsAuthMetered` pattern at `api/lib/cors-auth.js:238` uses literal arithmetic with an explicit comment — we follow that precedent.

### Firestore rules update

Edit `firestore.rules` in three places:

**1.** Add `redeemedCode` and `redeemedAt` to the `users/{userId}` **create** rule's `hasAny` ban (line 23):

```
&& !request.resource.data.keys().hasAny(['fellow', 'subscription', 'redeemedCode', 'redeemedAt'])
```

**2.** Add `redeemedCode` and `redeemedAt` to the `users/{userId}` **update** rule's `hasOnly` allowlist (lines 33-39). This lets the doc legitimately contain these fields (written by Admin SDK) without breaking client updates to other fields like `displayName`.

**3.** Add `redeemedCode` and `redeemedAt` to the update rule's client-write ban diff (line 50):

```
&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny(
     ['fellow', 'subscription', 'redeemedCode', 'redeemedAt']
   ))
```

**No rules for** `redemptionCodes` or `redemptionLedger`. Firestore's default-deny on missing rules means clients cannot read or write these collections. Admin SDK from `api/redeem-code.js` is the only path in. Deploy rules **before** shipping client code, per the learnings doc at `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md`.

### Admin tooling: `scripts/create-redemption-code.mjs`

```
node scripts/create-redemption-code.mjs \
  --code FRIEND-ABC123 \
  --plan pro_1year \
  --days 365 \
  --max-uses 1 \
  --notes "Friend: Dave"

node scripts/create-redemption-code.mjs \
  --code FELLOWFAM \
  --plan pro_1week \
  --days 7 \
  --max-uses 100 \
  --notes "r/fellow launch promo"
```

Uses `GOOGLE_APPLICATION_CREDENTIALS` env var pointing at a local service-account JSON (standard Google Cloud SDK pattern). Script header comment documents this explicitly so Tal doesn't hit a "missing credentials" wall the first time.

Uses `ref.create(...)` (not `set`) so minting a duplicate code name throws instead of silently resetting `useCount` to 0. Validates: uppercase code, regex match, plan in allowlist `['pro_1week','pro_1year']`, durationDays positive integer.

Prints the created doc and a one-line summary. ~60 LOC total.

---

## Phase 2: Client Helper, Settings UI, Smoke Test, Deploy

### Client helper: `src/lib/redeemCode.js`

```js
// src/lib/redeemCode.js
import { fetchWithRetry } from './fetchWithRetry.js';
import { API_BASE } from './apiBase.js';

const URL = `${API_BASE}/api/redeem-code`;

export class RedeemError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Uses fetchWithRetry so Firebase ID token injection, base-URL handling,
// and the typed 4xx error shape match every other src/lib/* helper.
// retries: 0 because redemption is not idempotent — the server's
// transactional lock is the source of truth.
export async function redeemCode(code) {
  try {
    const result = await fetchWithRetry({
      url: URL,
      body: { code },
      serviceName: 'Redeem',
      retries: 0,
    });
    return result; // { ok: true, plan, expiresAt }
  } catch (err) {
    // fetchWithRetry throws typed errors for 4xx with `err.code` set.
    if (err.code) throw new RedeemError(err.code);
    throw err;
  }
}
```

**Note:** `fetchWithRetry.js` already branches on typed 4xx responses for `subscription_required` and `free_tier_exhausted` (lines 58-72). Add a parallel branch for the redemption reason codes (`invalid_code`, `already_redeemed`, `code_exhausted`, `has_active_subscription`, `email_not_verified`, `invalid_input`) so `err.code` is populated from `response.error` automatically. This is a ~15 LOC addition inside `fetchWithRetry.js`.

### Settings UI: inline expand row

Add a new row inside the existing Subscription section of `SettingsPage.jsx` at line 787, **above** the Restore Purchases row:

- Gated behind `!hasPro` (users with Pro don't need to redeem)
- Tapping the row expands an inline form directly below it: text input (auto-uppercase, 16px+ font per `.claude/rules/ios-layout.md`, maxLength 20), Redeem button, inline error/success message
- No modal, no portal, no new component file. ~40 LOC added to `SettingsPage.jsx`
- Error reason-code → user copy map lives inline in the row:

```js
const REDEEM_COPY = {
  invalid_input:           "That code doesn't look right. Check it and try again.",
  invalid_code:            "That code isn't valid. Double-check it and try again.",
  already_redeemed:        "You've already redeemed a code on this account.",
  code_exhausted:          "This code has reached its limit. Thanks for checking!",
  has_active_subscription: "You already have Pro. Nothing to redeem.",
  email_not_verified:      "Please verify your email address before redeeming.",
  internal_error:          "Something went wrong. Please try again in a moment.",
};
```

On success, the form replaces itself with "Pro unlocked until <date>" and a close button that collapses the row. No page refresh needed — `SubscriptionContext.jsx`'s Firestore listener picks up the `subscription.*` change automatically and the row hides (because `!hasPro` is now false).

**iOS layout rules** (from `.claude/rules/ios-layout.md`):
- Input `font-size: 16px` minimum (prevents auto-zoom on focus)
- Row + form stays inside the scrollable Settings container so safe-area-bottom is handled by the parent
- 44x44pt tap targets on the Redeem button and the row itself

### SubscriptionContext.jsx

**No changes.** Writing directly to `subscription.*` means the existing Firestore listener at `src/contexts/SubscriptionContext.jsx:62-85` picks up the grant and flips `hasPro` without any merge-logic refactor.

One minor optional fix worth doing in the same PR (flagged by the architecture review, independent of redemption): the listener at line 79 reads `sub.expiresAt` and `sub.status === 'active'` but doesn't double-check expiry. If a webhook event is missed, an expired subscription with stale `status: active` would grant Pro forever on the client. Fix:

```js
// In the Firestore listener, line ~64
const sub = snap.data()?.subscription ?? {};
const notExpired = !sub.expiresAt || new Date(sub.expiresAt) > new Date();
const active = notExpired && (sub.status === 'active' || sub.status === 'trial');
```

This matches the defensive expiry check already in `api/lib/checkEntitlement.js:79-86`. Not strictly required for redemption to work, but ensures redeemed users auto-lose Pro on the client when their grant runs out without requiring a webhook. Worth doing; reviewers called it out as a latent bug on the RC path too.

### Smoke test plan

1. Before deploy: `firebase deploy --only firestore:rules` (per learnings, deploy rules BEFORE client code).
2. Mint a test code with `durationDays: 0.01` (~14 min) via the admin script on a staging code like `TESTFAST`.
3. On a throwaway Google account, sign in, navigate to Settings → Subscription → Redeem Code, enter `TESTFAST`, observe:
   - `hasPro` flips true in UI
   - AI proxy call (bean scan) succeeds (server-side gate works via `subscription.*`)
   - `redeemedCode` + `redeemedAt` set on user doc
   - `redemptionLedger/<hmac>` entry created
   - `useCount` incremented on the code doc
4. Attempt to redeem a different code on the same account → `already_redeemed` error.
5. Manually set `subscription.expiresAt` to a past date in Firestore console, observe `hasPro` flips false, AI proxy returns 403.
6. Attempt to redeem again → still `already_redeemed` (confirming permanent lock).
7. Delete test user account via `api/delete-account.js`, re-sign-in with same Google account (new uid), attempt to redeem → `already_redeemed` via HMAC ledger lock.
8. Concurrent redemption test: seed `TESTCAP` with `maxUses: 1`, fire two simultaneous redeems from two accounts, verify exactly one succeeds and the other gets `code_exhausted`.
9. Deploy: `/deploy` which handles Vercel (web) + Capgo OTA (iOS) per memory `feedback_always_deploy_ios.md`.

---

## System-Wide Impact

- **Interaction graph:** Redeem row submit → `redeemCode()` client helper → `POST /api/redeem-code` → `withCorsAuth` verifies ID token → `runRedemption()` runs transaction → writes to `users/{uid}.subscription` + `redeemedCode` + ledger → `invalidateEntitlementCache(uid)` → `SubscriptionContext.jsx` Firestore listener fires → `hasPro` flips true → every paywall gate app-wide unlocks. No new listeners, no new contexts, no new gates.
- **Error propagation:** `runRedemption` throws typed `RedeemError(code)`. Handler maps each code to a 4xx HTTP status with `{ error: <code> }`. `fetchWithRetry` branches on the known codes and throws a typed `err.code` client-side. Modal renders per-code copy. Anything unknown on the server is logged as `[redeem-code] transaction failed` and returns 500 `internal_error`.
- **State lifecycle risks:** Firestore transaction atomicity means either all three writes succeed (codeRef useCount, userRef subscription+locks, ledgerRef) or none. Either Pro is fully granted or the user can retry with a different code. No partial state is possible. The `redeemedCode` field is the linchpin — set forever, never cleared by the grant code path, only removable via admin-SDK cleanup during GDPR deletion.
- **API surface parity:** `users/{uid}.subscription.*` has exactly one read consumer (`api/lib/checkEntitlement.js`) and two write consumers (RC webhook, redemption). Both writers use `set({subscription:{...}}, {merge:true})`. `checkEntitlement.js` is agnostic to the writer. The existing cache-invalidation helper is called after both. No surface-parity drift.
- **Integration test scenarios:**
  1. Fresh user redeems 1-week code → `hasPro` true → week passes → `hasPro` false → second redemption rejected.
  2. Two concurrent `maxUses: 1` redemptions → exactly one success, other gets `code_exhausted`.
  3. User with active RC monthly → redemption rejected with `has_active_subscription`.
  4. User redeems → deletes account → re-registers with same Google account (fresh uid) → rejected by HMAC ledger.
  5. User redeems → onboarding R13 paywall correctly skipped on next session (`useOnboardingPaywall.js:47` sees `hasPro`).
  6. Tal flips `active: false` on the Reddit code → next attempt gets `invalid_code`.
  7. AI proxy call from a redeemed user (bean scan, Claude coach, Gemini search, Aiden recipe) passes the server-side `checkEntitlement.js` gate and completes successfully.
  8. `email_verified: false` on a hypothetical future provider → rejected with `email_not_verified` before transaction runs.

## Rate Limiting (v1, intentional scope)

The server-side `/^[A-Z0-9-]{4,20}$/` pre-check rejects malformed payloads before they cost a Firestore transaction. This alone kills the ~99% of garbage traffic from a brute-force bot.

A real per-uid attempt rate limiter (e.g. `rateLimits/{uid}_redeem` with a TTL) is **out of scope for v1** because:
1. Friend codes are single-use and individual; Tal knows every recipient.
2. The Reddit code is shared but capped at `maxUses: 100` and kill-switchable in one Firestore update.
3. The per-uid `redeemedCode` lock caps a single uid to ONE successful redemption forever, so sustained brute-force against one account gets capped at 0 useful outcomes.
4. Firestore transaction cost on invalid attempts is ~$0.00004 each; 10k attempts = $0.40. Absorbable for v1.

If the Reddit campaign draws sustained abuse, the follow-up is a 20-line per-uid counter check near the top of `runRedemption`. Document it in the NEEDS EYES section of the rip-it report if it becomes load-bearing.

## Compliance note — Apple 3.1.1 and 3.1.3

Per the best-practices research: Apple's guidelines allow app-delivered promo code redemption **as long as** the entitlement is also purchasable via IAP in the normal flow (it is: Pro and Ultra are standard RC products), and the app isn't primarily unlocking paid features via non-IAP paths (ours is not). Friend codes and Reddit promos fall cleanly inside the "promotional access for support / marketing" pattern RC itself documents.

For v1.5, consider moving the Reddit campaign to an **Apple Offer Code** (App Store Connect → Custom Codes) which is Apple-native and 3.1.1-compliant by design. Requires ASC setup and is iOS-only. Keeping our custom system for friend codes and web users regardless.

---

## Acceptance Criteria

### Functional
- [ ] `api/redeem-code.js` exists, deployed, wrapped in `withCorsAuth`.
- [ ] `api/lib/redemption.js` exists with `normalizeEmail`, `hmacEmailHash`, `runRedemption`, `RedeemError` exported.
- [ ] Transaction atomically: reads code/user/ledger → validates → writes useCount+1, ledger entry, user subscription + redeemedCode + redeemedAt.
- [ ] `FieldValue.increment` is NOT used anywhere in the redemption path; `c.useCount + 1` literal.
- [ ] `invalidateEntitlementCache(uid)` called after successful commit.
- [ ] Structured log on every exit path (success + each reason-code rejection).
- [ ] Email normalization folds `googlemail.com` → `gmail.com`, strips dots (Gmail only) and plus-tags (all providers), NFKC-normalized before lowercasing.
- [ ] `decoded.email_verified === true` is a hard precondition.
- [ ] `REDEMPTION_EMAIL_PEPPER` env var is read; endpoint fails closed if missing or shorter than 32 bytes in production.
- [ ] Client `CODE_RE = /^[A-Z0-9-]{4,20}$/` pre-check rejects before transaction.
- [ ] `src/lib/redeemCode.js` uses `fetchWithRetry` + `API_BASE`; no hand-rolled fetch, no hand-rolled auth header.
- [ ] `fetchWithRetry.js` extended to branch on redemption reason codes and set `err.code` accordingly.
- [ ] Settings Subscription section has an inline "Redeem Code" row gated behind `!hasPro`.
- [ ] Row expand form respects iOS safe-area-bottom via parent scrollable Settings container, 16px input font, 44x44pt tap targets.
- [ ] `firestore.rules` updated on both create and update paths, plus client-write ban diff.
- [ ] `SubscriptionContext.jsx` listener gets the defensive `expiresAt` check (not required for redemption correctness but caught as latent bug in review).
- [ ] `scripts/create-redemption-code.mjs` mints codes via `ref.create` (throws on duplicate), uses `GOOGLE_APPLICATION_CREDENTIALS`, validates all fields.

### Abuse-prevention (each must have an explicit test)
- [ ] User who redeemed any code cannot redeem any other code ever (per-uid lock).
- [ ] Concurrent redemption of `maxUses: 1` → exactly one winner (transaction retry semantics).
- [ ] `googlemail.com` → `gmail.com` fold blocks dual-domain attempt.
- [ ] Gmail plus-addressing collapses in the HMAC hash.
- [ ] Gmail dots in local-part collapse in the HMAC hash.
- [ ] User who redeems → deletes account → re-registers with same Google → blocked by ledger.
- [ ] Client writes to `redeemedCode`/`redeemedAt`/`subscription` on user doc are blocked by `firestore.rules` on both create and update paths.
- [ ] `redemptionCodes` and `redemptionLedger` collections return permission-denied on any client read/write.
- [ ] `POST /api/redeem-code` without Authorization header returns 401.
- [ ] `POST /api/redeem-code` with expired/invalid token returns 401.
- [ ] `POST /api/redeem-code` with valid token but `email_verified: false` returns 403 `email_not_verified`.

### Server-side gate parity
- [ ] Redeemed user can successfully call `/api/claude`, `/api/openai`, `/api/gemini`, `/api/aiden` (server gate via `checkEntitlement.js` passes because grant is written to `subscription.*`).
- [ ] Expired redemption (past `expiresAt`) correctly flips user back to 403 on AI proxies.

### Onboarding parity
- [ ] User who redeems during onboarding correctly skips R13 paywall on subsequent sessions (`useOnboardingPaywall.js:47` sees `hasPro`).

### Non-functional
- [ ] Transaction latency under 2s p95 on Vercel (observed via function logs).
- [ ] No new env vars required in Vercel beyond `REDEMPTION_EMAIL_PEPPER` (service account reused from RC webhook setup).
- [ ] Admin script runs from `nvm use 22` with a single service-account JSON path.

---

## Dependencies & Risks

**Dependencies**
- `firebase-admin@^13.6.1` (already installed).
- `FIREBASE_SERVICE_ACCOUNT` in Vercel env (already set for RC webhook).
- `REVENUECAT_API_KEY` in Vercel env (already set; not used by redemption directly but by the `checkEntitlement.js` RC API fallback).
- **New:** `REDEMPTION_EMAIL_PEPPER` in Vercel env. Generate with `openssl rand -hex 32`, paste to all environments. Use `printf '%s'` not `echo` to avoid trailing newline (per `lessons.md:34`).
- Firestore rules deploy: `firebase deploy --only firestore:rules` before shipping client code.
- iOS deploy goes through Capgo OTA (JS-only change, no Capacitor native plugin changes), per memory `feedback_always_deploy_ios.md`.

**Risks**
- **Gmail normalization has a ceiling.** A determined abuser with many unrelated Google accounts across different actual emails still defeats the per-email lock. Accepted: creating N distinct Google accounts is the real deterrent, not our lock. The Reddit code's `maxUses: 100` limits blast radius anyway.
- **Ledger pepper rotation is irreversible.** Rotating `REDEMPTION_EMAIL_PEPPER` breaks all existing ledger entries (new hashes no longer match old). Treat the pepper as permanent for the lifetime of the ledger. Only rotate if compromised.
- **Friend code leakage.** If a friend code screenshots and leaks, a stranger burns the friend's only redemption. Mitigation: single-use friend codes by default; Tal mints a replacement in 30 seconds.
- **Viral Reddit code retry storm.** If the Reddit campaign draws >100 concurrent redeems/sec, Firestore transaction retries on the hot `useCount` counter can exhaust before succeeding. Mitigation: launch with `maxUses: 100`; bump sharding in v1.5 only if needed. Document as follow-up.
- **Kill-switch is not client-side.** If Tal flips `active: false`, existing already-granted redemptions keep working (correctly — they already got their grant). Only new attempts fail. This is intended.
- **Missing webhook events from Apple side could stale-grant.** If an Apple cancellation event never reaches the RC webhook, `subscription.status = active` persists until `expiresAt`. The defensive `expiresAt` check in the client listener (optional fix in Phase 2) closes this.
- **No analytics on failed attempts.** For v1, abuse observability is `console.warn` in Vercel logs. If campaign draws sustained abuse, add a counter to `rateLimits/{uid}_redeem` and an attempts log collection. Out of scope for v1.

---

## Implementation Order (phase breakdown)

### Phase 1 — Server + Data Model + Rules

1. Add `REDEMPTION_EMAIL_PEPPER` to Vercel env (all environments) via `printf '%s' "$(openssl rand -hex 32)" | vercel env add REDEMPTION_EMAIL_PEPPER`.
2. Update `firestore.rules` on create + update paths. Deploy rules via `firebase deploy --only firestore:rules`.
3. Write `api/lib/redemption.js`: `normalizeEmail`, `hmacEmailHash`, `runRedemption`, `RedeemError`. Pure functions, no HTTP.
4. Write `api/redeem-code.js`: thin `withCorsAuth` handler that calls `runRedemption`, handles `RedeemError`, calls `invalidateEntitlementCache`.
5. Write `scripts/create-redemption-code.mjs`: CLI that creates code docs with validation. Test by minting one `TESTFAST` code.
6. Curl-test the endpoint end-to-end with a real Firebase ID token from a throwaway account.

### Phase 2 — Client + Deploy

1. Extend `src/lib/fetchWithRetry.js` to branch on redemption reason codes (~15 LOC).
2. Write `src/lib/redeemCode.js` (thin wrapper).
3. Add inline expand row to `SettingsPage.jsx` under the Subscription section. Gate behind `!hasPro`.
4. Add the defensive `expiresAt` check to `SubscriptionContext.jsx` listener (caught as latent bug).
5. Local smoke test: web `vercel dev` + iOS simulator (`npm run cap:sync && npm run cap:open`).
6. Run `/deploy` (Vercel web + Capgo OTA) per memory.
7. Live smoke on production using `TESTFAST` code on a throwaway account.
8. Mint the real Reddit code (`FELLOWFAM` or chosen name) and one or two initial friend codes via the admin script.

---

## Sources & References

### Origin
- Not from a brainstorm doc; direct-from-user request in current conversation ("this into a plan" with explicit abuse-prevention requirement).

### Internal References
- `src/contexts/SubscriptionContext.jsx:50-153` — Firestore listener + native RC additive merge; the merge contract that the grant hooks into.
- `src/contexts/SubscriptionContext.jsx:62-85` — listener that picks up `subscription.*` writes automatically.
- `src/components/onboarding/useOnboardingPaywall.js:47` — confirms `hasPro || hasUltra` is the universal paywall gate.
- `src/components/SettingsPage.jsx:756-796` — Subscription section, where the inline row slots in.
- `src/lib/fetchWithRetry.js:4-72` — base-URL + auth + typed-error helper pattern the client helper reuses.
- `src/lib/apiBase.js` — canonical API base URL helper (native vs web).
- `src/lib/claude.js:14,40` — reference pattern for `PROXY_URL = API_BASE + '/api/...'`.
- `api/redeem-code.js` — new file.
- `api/lib/redemption.js` — new file.
- `api/lib/cors-auth.js:99-215` — `withCorsAuth`, `getDb`, runtime auth/CORS/fail-closed wrapper.
- `api/lib/cors-auth.js:225-243` — `withCorsAuthMetered`'s `runTransaction` using literal `used + 1` (the precedent we follow).
- `api/lib/checkEntitlement.js:65-93` — server-side gate; reads `subscription.*`, works unchanged for redemption grants.
- `api/lib/checkEntitlement.js:183-186` — `invalidateEntitlementCache` helper the redemption handler calls.
- `api/revenuecat-webhook.js:138-163` — reference shape for `subscription` field writes.
- `api/revenuecat-webhook.js:33` — `UID_PATTERN` validation (referenced but not needed in redemption since we trust `decoded.uid`).
- `api/delete-account.js` — precedent for a user-authenticated Vercel endpoint using `withCorsAuth`.
- `firestore.rules:11-51` — users create + update rules to extend.
- `.claude/rules/ios-layout.md` — safe-area, 16px input, 44x44pt tap target rules for the Settings row.
- `lessons.md:33-37` — gotchas: `vercel dev` for local testing, `printf` not `echo` for env vars, no destructive auto-retry.
- `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md` — deploy rules before client writes; one logical change = one Firestore write; use `runTransaction` for read-then-write.
- `docs/solutions/security-issues/llm-prompt-sanitization-patterns.md` — sanitize inputs at the source function; apply same principle to code/email normalization.

### Memory References
- `project_capgo_ota.md` — JS-only iOS deploys via Capgo, skip TestFlight.
- `feedback_always_deploy_ios.md` — every deploy includes iOS OTA.
- `feedback_git_deploy_workflow.md` — Tal calls deploys; Claude handles mechanics.
- `project_rc_code23_fix.md` — RC subscriptions are live (stacking prevention is real).
- `project_fellow_case_sensitive.md` — email normalization precedent in this project.

### External References
- [RevenueCat: Grant a Promotional Entitlement](https://www.revenuecat.com/reference/grant-a-promotional-entitlement) — reference for future v1.5 migration.
- [Apple Offer Codes](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-subscription-offer-codes/) — Apple-native alternative; v1.5 consideration.
- [Firestore transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions) — confirms reads-before-writes and retry semantics.
- [Firestore distributed counters](https://firebase.google.com/docs/firestore/solutions/counters) — sharding pattern for if `useCount` becomes hot.
- [EDPS/AEPD hashing for pseudonymization (PDF)](https://edps.europa.eu/sites/edp/files/publication/19-10-30_aepd-edps_paper_hash_final_en.pdf) — why plain SHA-256 of email is weak; HMAC with pepper is the recommended pattern.
- [Google Cloud DLP pseudonymization](https://cloud.google.com/sensitive-data-protection/docs/pseudonymization) — HMAC-SHA256 as the canonical DLP-compliant hash.
- [Gmail canonicalization reference](https://emailvariations.com/posts/gmail-dots-dont-matter) — dots-don't-matter rule; googlemail.com equivalence.
- [Stripe: free trial abuse signals](https://stripe.com/resources/more/free-trial-abuse-tactics-signals-and-prevention) — what real SaaS combines; informs "good enough" ceiling acceptance.

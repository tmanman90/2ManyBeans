---
status: pending
priority: p1
issue_id: 006
tags: [code-review, security, subscriptions]
dependencies: []
---

# P1: checkEntitlement fail-open on RC errors or missing env var grants Pro to everyone

## Problem Statement

`api/lib/checkEntitlement.js` returns `{ pro: true, ultra: true }` (line 79-81) when `REVENUECAT_API_KEY` is unset, and returns `{ pro: true, ultra: false }` (line 106, 125) on any non-404 RC API error. Both are explicit "fail-open for Pro."

Problems:
1. If the env var is accidentally rotated but not pushed to Vercel, every free user gets Ultra entitlement on every gated call — silently.
2. During an RC API outage, every free user gets Pro — silently.
3. An attacker who can DoS RC's `/v2/.../active_entitlements` endpoint (or induce it to 500 on specific uids via crafted lookups) gets Pro access.

The rationale ("don't block paying users during outages") has merit, but paying users already hit the Firestore fast path (status='active') so they never reach the RC fallback. The ONLY users hitting the fallback are free users or users in the webhook-delay window. Fail-open is wrong for both.

## Findings

**File:** `api/lib/checkEntitlement.js:77-81, 100-106, 121-125`

Flagged by: security P1-2, architecture P1-4.

## Proposed Solutions

### Option 1: Fail closed for free users (recommended)
Return `{ pro: false, ultra: false }` on all errors. Surface a distinctive 503 from the wrapper so the client can show "Service temporarily unavailable, try again" instead of the paywall.

```js
// api/lib/checkEntitlement.js
if (!apiKey) {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('REVENUECAT_API_KEY not set in production');
  }
  console.warn('[checkEntitlement] dev mode — fail-open');
  return { pro: true, ultra: true };
}

// On RC API error:
return { pro: false, ultra: false, error: true };
```

Then in `cors-auth.js`:
```js
const result = await checkEntitlement(uid);
if (result.error) return res.status(503).json({ error: 'entitlement_check_unavailable' });
```

- Pros: Safe default. Attacker can't DoS their way to free Pro. Missing env var crashes fast in prod.
- Cons: During an RC outage, paying users might see 503 instead of getting access. Mitigated by the Firestore fast path — if the user's subscription was ever written to Firestore by the webhook, they skip the RC API entirely.
- Effort: Small

### Option 2: Fail-open only for cached hits
Keep fail-open ONLY when we have a cached `{pro: true}` from a previous successful check. Never fail-open on cold cache.
- Pros: Preserves UX for warm paying users.
- Cons: Complex cache semantics. Fresh boot during outage still blocks.
- Effort: Medium

## Recommended Action

Option 1. Ship before launch. Log RC outages to Vercel logs and alert on them.

## Technical Details

- Files: `api/lib/checkEntitlement.js`, `api/lib/cors-auth.js`
- In production (VERCEL_ENV=production), missing env var should throw on module load

## Acceptance Criteria

- [ ] Missing REVENUECAT_API_KEY in production throws on first call
- [ ] RC API 5xx → `{pro: false, ultra: false}` with error flag
- [ ] Cors-auth wrapper returns 503 on error flag, not 403
- [ ] Client shows "Service temporarily unavailable" on 503, not paywall
- [ ] Test: set fake RC key, verify 503 returned, verify NO free Pro access granted
- [ ] Test: Firestore fast path still works for paying users during simulated RC outage

## Work Log

---
status: pending
priority: p1
issue_id: 005
tags: [code-review, subscriptions, backend, ux-correctness]
dependencies: []
---

# P1: Metered wrapper at proxy level breaks advertised free-tier semantics

## Problem Statement

`api/claude.js` is wrapped in `withCorsAuthMetered({ feature: 'tasteTests', freeLimit: 1 })`. But the Claude proxy is used for:
1. Tasting coach session (the intended feature)
2. General ChatTab conversation
3. Every multi-turn exchange inside a single tasting session

Result: a free user sending one ChatTab message burns their single lifetime `tasteTests` credit. A tasting session that's supposed to be "1 free taste test" actually 403s on turn 2 because each turn is counted separately against the cap.

Same issue on `api/gemini.js` (`aiScans`, freeLimit: 3):
- `scanBeanLabel` → 1 credit (correct)
- `researchBeanOnline` enrichment → 1 credit (wrong — this is a sub-call of scan)
- `describeImage` on chat photo attach → 1 credit (wrong — this is chat, not a scan)
- Dead-code `action === 'productShot'` branch → also burns 1 credit (and is a Pro-gate bypass, see TODO 008)

A free user completing their first bean scan with AI Fill burns 2-3 credits for what's supposed to be 1 scan.

## Findings

**Files:**
- `api/claude.js` (wrapped with metered tasteTests=1)
- `api/gemini.js` (wrapped with metered aiScans=3)
- `src/lib/claude.js` (client calls Claude for chat AND tasting coach)
- `src/lib/gemini.js` (client calls Gemini for scan, research, image analysis)

Flagged by: security P1-4, P2-1, architecture P1-5, races P2-1 (indirectly).

## Proposed Solutions

### Option 1: Pass `metered: true` flag in request body (recommended)
Handler-level opt-in. The wrapper inspects the body and only meters when explicitly requested.

```js
// api/lib/cors-auth.js — withCorsAuthMetered reads req.body.metered
if (!req.body?.metered) return handler(req, res, decodedToken);
// else: check counter, increment, etc.
```

Client calls pass `metered: true` only at the semantic start of a session:
- Tasting coach: first message in a new session sets `metered: true`; subsequent turns in the same session don't
- Bean scan: `scanBeanLabel` sends `metered: true`; `researchBeanOnline` and `describeImage` don't

- Pros: Minimal refactor. Gating moves to the call site where semantic intent lives. No new endpoints.
- Cons: Trust boundary concern — a malicious client could omit `metered: true` forever. Mitigate by logging + rate-limiting.
- Effort: Medium

### Option 2: Dedicated metered endpoints
Split into `/api/claude-tasting-start` (metered) vs `/api/claude` (unmetered Pro-gated).
- Pros: Clearest contract. No trust boundary concern.
- Cons: More endpoints, more routing.
- Effort: Medium-Large

### Option 3: Session-token pattern
Free user calls `/api/session/start` (metered), receives a session token. Subsequent Claude/Gemini calls accept the session token and don't count.
- Pros: Stateful, unambiguous.
- Cons: Session storage, expiration, most complex.
- Effort: Large

## Recommended Action

Option 1. Ship before launch. Pair with basic rate limiting on the unmetered paths so a malicious free user can't hammer Claude via chat forever.

## Technical Details

- Files: `api/lib/cors-auth.js`, `api/claude.js`, `api/gemini.js`, `src/lib/claude.js`, `src/lib/gemini.js`, `src/tabs/TastingTab.jsx`, `src/tabs/ChatTab.jsx`, `src/components/AddBeanForm.jsx`

## Acceptance Criteria

- [ ] `withCorsAuthMetered` only counts when `req.body.metered === true`
- [ ] `scanBeanLabel` passes `metered: true`; `researchBeanOnline` does not
- [ ] `describeImage` (chat image analysis) does not count against scan quota
- [ ] Tasting coach flow: first message is metered; subsequent turns in same session are not
- [ ] ChatTab messages are NOT counted against tasteTests quota
- [ ] Test: free user completes a full bean scan + research + product shot attempt, counter increments by exactly 1
- [ ] Test: free user sends 5 chat messages, counter unchanged
- [ ] Test: free user completes a 4-turn tasting session, counter increments by exactly 1

## Work Log

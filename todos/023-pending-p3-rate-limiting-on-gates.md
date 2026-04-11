---
status: pending
priority: p3
issue_id: 023
tags: [code-review, security, scaling]
dependencies: []
---

# P3: No rate limiting on gated endpoints

## Problem Statement

Vercel Functions have no built-in rate limiting. A single authenticated user (compromised token, or just buggy client) can hammer:
- `/api/delete-account` — expensive (RC DELETE + Storage list + Firestore batch delete + Auth delete per call)
- `/api/revenuecat-webhook` — writes to Firestore per call
- `/api/claude`, `/api/gemini`, etc. — burn AI budget

Combined with TODO 001 (TOCTOU race), an attacker can amplify their quota bypass.

## Findings

**Files:** all endpoint handlers

Flagged by: security P3-6.

## Proposed Solution

Add per-uid rate limiting via Upstash Redis (free tier) or Vercel Edge Middleware with a KV store. Target:
- `/api/delete-account`: 1 call per minute per uid
- `/api/claude|gemini|openai|aiden|product-shot`: 60 calls per minute per uid
- `/api/revenuecat-webhook`: 100 calls per minute (global — RC is the caller)

Simple KV-based token bucket:
```js
const key = `rl:${endpoint}:${uid}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 60);
if (count > LIMIT) return res.status(429).json({ error: 'rate_limited' });
```

## Acceptance Criteria

- [ ] Rate limit middleware on all gated endpoints
- [ ] Appropriate 429 response body
- [ ] Client handles 429 with exponential backoff (already does via fetchWithRetry)
- [ ] Load test: 1000 requests in 1 second → 99% rejected

## Work Log

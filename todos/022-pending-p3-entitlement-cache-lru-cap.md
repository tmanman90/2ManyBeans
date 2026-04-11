---
status: pending
priority: p3
issue_id: 022
tags: [code-review, performance, memory]
dependencies: []
---

# P3: checkEntitlement cache Map is unbounded

## Problem Statement

`api/lib/checkEntitlement.js` uses `new Map()` with no size limit. Grows unbounded per warm function instance. An attacker enumerating uids could OOM the function. At current scale (<1000 DAU) this isn't a real issue, but it's a slow leak worth capping.

## Findings

**File:** `api/lib/checkEntitlement.js:23-26`

Flagged by: security P3-2, performance #4.

## Proposed Solution

Add LRU cap of 500 entries. Evict oldest on insert when size exceeds cap:
```js
const CACHE_MAX = 500;
function setCacheEntry(uid, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(uid, value);
}
```

Or use a small LRU library. Map iteration order is insertion order in JS, so the first key is the oldest — simple LRU approximation.

## Acceptance Criteria

- [ ] Cache size capped at 500
- [ ] Oldest entry evicted on overflow

## Work Log

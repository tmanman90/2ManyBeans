---
status: pending
priority: p1
issue_id: 007
tags: [code-review, frontend, subscriptions, races]
dependencies: []
---

# P1: RevenueCat SDK init has race condition, duplicate listeners, unremovable native listener

## Problem Statement

`src/lib/revenuecat.js` has three related issues:

1. **`configured` flag race**: The `if (configured) return;` guard is set AFTER `Purchases.configure()` resolves. React 19 StrictMode double-invokes effects in dev, and a rapid sign-in causes two parallel `initRevenueCat()` calls to both see `configured === false` and both run the full chain. `Purchases.configure()` runs twice and `addCustomerInfoUpdateListener()` registers twice → every customer update fires every JS subscriber twice.

2. **No recovery from init failure**: If `loadSdk()` or `Purchases.configure()` throws (dynamic import hiccup, simulator race), `configured` stays false. Every subsequent caller retries the whole chain from scratch, and partial state from the failed run may be half-registered.

3. **Native listener reference not retained**: The JS wrapper `(result) => { for (const fn of listeners) fn(...) }` is registered via `addCustomerInfoUpdateListener` inside `initRevenueCat` but never stored. `logOutRevenueCat()` doesn't remove it. With duplicate init calls, multiple native listeners accumulate and cannot be cleaned up.

## Findings

**File:** `src/lib/revenuecat.js:20-62, 22, 145-148`

Flagged by: races P1-1, P1-3, P1-4.

## Proposed Solutions

### Promise-cached init with failure recovery
```js
let configurePromise = null;
let nativeListenerHandle = null;

export async function initRevenueCat() {
  if (!isRevenueCatAvailable()) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    try {
      const { Purchases, LOG_LEVEL } = await loadSdk();
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey: PUBLIC_IOS_KEY });

      // Register the native listener ONCE, retain the handle so it can be removed if needed.
      nativeListenerHandle = await Purchases.addCustomerInfoUpdateListener((result) => {
        for (const fn of listeners) {
          try { fn(result.customerInfo); } catch (e) { console.error('[RC listener]', e); }
        }
      });
    } catch (err) {
      configurePromise = null; // allow next caller to retry
      throw err;
    }
  })();

  return configurePromise;
}
```

Every caller awaits the same promise. Listener registers exactly once, ever. Failure path clears the cache so recovery is possible.

## Recommended Action

Ship before launch. Low-risk, surgical change.

## Technical Details

- File: `src/lib/revenuecat.js`
- No schema changes
- Verify by adding `console.count('[RC configure]')` at top of the async block and running in dev StrictMode — should see exactly 1 after any number of effect re-runs

## Acceptance Criteria

- [ ] `initRevenueCat` is idempotent under parallel invocation
- [ ] `Purchases.configure` is called exactly once per app lifecycle
- [ ] `addCustomerInfoUpdateListener` native registration happens exactly once
- [ ] Init failure is recoverable on retry
- [ ] Test: rapid sign-out/sign-in cycle doesn't accumulate JS or native listeners
- [ ] Test: throw inside `loadSdk` once, verify next call re-attempts

## Work Log

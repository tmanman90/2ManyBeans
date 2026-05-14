// Server-side entitlement check.
//
// Two sources of truth, checked in order:
//   1. Firestore users/{uid}.subscription (written by the RevenueCat webhook
//      when it fires on purchase/renewal/cancel, or manually set for dev).
//      Active sub here is the canonical fast path.
//   2. RevenueCat REST API v2 (fallback) — for the brief window between an
//      on-device purchase and the webhook firing, or if Firestore is cold
//      for any reason.
//
// Ultra is a strict superset of Pro at the application level.
//
// Performance: positive results cached in memory per warm function instance
// for 5 min with an LRU cap. Negative results are NOT cached so a fresh
// purchase reflects immediately on the next call. The webhook calls
// invalidateEntitlementCache(uid) on each event for cross-instance freshness
// when the same instance handles both.
//
// Failure semantics:
//   - Missing REVENUECAT_API_KEY in production → throws (fail-closed by
//     refusing to grant any entitlement). The withCorsAuth wrapper will
//     surface a 503.
//   - RC API 5xx / network error → returns { pro: false, ultra: false,
//     unavailable: true }. Caller can return 503 instead of 403 to
//     differentiate "service down" from "subscription required."
//   - RC API 404 → user has no RC subscriber yet → free tier (cached
//     briefly via positive-only rule does NOT apply, so this re-checks
//     each time, which is fine for a free user making occasional calls).
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeSecret } from './secrets.js';

const RC_PROJECT_ID = 'f33ec0ef'; // 2manybeans project in RevenueCat
const RC_BASE = 'https://api.revenuecat.com/v2';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';

// uid -> { pro, ultra, expiresAt }
// Map iteration order is insertion order in JS, so the first key is the
// oldest. Used as an LRU approximation: when we hit CACHE_MAX, evict first.
const cache = new Map();

function setCacheEntry(uid, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(uid, value);
}

// Derives { pro, ultra } from a plan string. Any 'ultra*' plan grants both
// Pro and Ultra since Ultra is a superset. Any 'pro*' plan grants only Pro.
function entitlementsFromPlan(plan) {
  if (!plan || typeof plan !== 'string') return { pro: false, ultra: false };
  const normalized = plan.toLowerCase();
  if (normalized.startsWith('ultra')) return { pro: true, ultra: true };
  if (normalized.startsWith('pro')) return { pro: true, ultra: false };
  return { pro: false, ultra: false };
}

// Try the Firestore-backed path. Returns null if the user has no explicit
// subscription doc, or the status isn't active, or the subscription has
// expired despite a stale `status` field. In all those cases the caller
// falls back to the RC API. Swallows errors (Firestore down, etc.) and
// returns null so the RC fallback can run.
async function checkFirestoreSubscription(uid) {
  try {
    const db = getFirestore();
    const snap = await db.doc(`users/${uid}`).get();
    if (!snap.exists) return null;
    const sub = snap.data()?.subscription;
    if (!sub) return null;

    // Status must be live. Cancellation now keeps `status: active` until
    // expiry (the webhook sets cancelAtPeriodEnd: true) so the status check
    // alone is correct, but we still verify expiresAt as a safety net for
    // missed-webhook cases.
    if (sub.status !== 'active' && sub.status !== 'trial') return null;

    if (sub.expiresAt) {
      const expiresAt = new Date(sub.expiresAt);
      if (!isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
        // Subscription expired but the webhook never updated status.
        // Fall through to RC API for the source of truth.
        return null;
      }
    }

    return entitlementsFromPlan(sub.plan);
  } catch (err) {
    console.warn('[checkEntitlement] Firestore lookup failed, falling back to RC API:', err?.message || err);
    return null;
  }
}

/**
 * Check which entitlements a user has.
 * @param {string} uid Firebase UID (matches RevenueCat appUserID via Purchases.logIn)
 * @returns {Promise<{ pro: boolean, ultra: boolean, unavailable?: boolean }>}
 */
export async function checkEntitlement(uid) {
  if (!uid) return { pro: false, ultra: false };

  // Cache hit (positive only — see below).
  const cached = cache.get(uid);
  if (cached && Date.now() < cached.expiresAt) {
    return { pro: cached.pro, ultra: cached.ultra };
  }

  // 1. Firestore-first.
  const fsResult = await checkFirestoreSubscription(uid);
  if (fsResult && (fsResult.pro || fsResult.ultra)) {
    // Cache positive results only.
    setCacheEntry(uid, { ...fsResult, expiresAt: Date.now() + CACHE_TTL_MS });
    return fsResult;
  }

  // 2. RC API fallback. Required for the brief post-purchase window.
  const apiKey = normalizeSecret(process.env.REVENUECAT_API_KEY);
  if (!apiKey) {
    if (IS_PRODUCTION) {
      // Fail-closed in prod — never silently grant entitlement on misconfig.
      throw new Error('[checkEntitlement] REVENUECAT_API_KEY missing in production');
    }
    console.warn('[checkEntitlement] REVENUECAT_API_KEY not set — dev mode, returning empty entitlements');
    return { pro: false, ultra: false };
  }

  try {
    const url = `${RC_BASE}/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(uid)}/active_entitlements`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // 404 = user has no RC subscriber yet (free user). Not an error.
      if (res.status === 404) {
        // Don't cache the negative result so a purchase reflects immediately.
        return { pro: false, ultra: false };
      }

      // Other non-2xx = RC service issue. Fail-closed: return unavailable so
      // the wrapper surfaces a 503 instead of a 403. This prevents an RC
      // outage from being interpreted as "no subscription" (which would
      // wrongly block paying users) or as "fail-open" (which would wrongly
      // unlock free users).
      const body = await res.text().catch(() => '');
      console.error('[checkEntitlement] RevenueCat API error', res.status, body);
      return { pro: false, ultra: false, unavailable: true };
    }

    const data = await res.json();
    // v2 returns { items: [{ lookup_key: 'pro', ... }, ...] }
    const ids = new Set(
      Array.isArray(data.items)
        ? data.items.map((e) => e.lookup_key || e.entitlement_identifier || e.identifier).filter(Boolean)
        : []
    );

    const ultra = ids.has('ultra');
    const pro = ultra || ids.has('pro');
    const result = { pro, ultra };

    // Cache positive results only.
    if (pro || ultra) {
      setCacheEntry(uid, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return result;
  } catch (err) {
    console.error('[checkEntitlement] fetch failed', err?.message || err);
    return { pro: false, ultra: false, unavailable: true };
  }
}

/**
 * Clear the cache for a specific user. Called by the RevenueCat webhook
 * so a newly-purchased subscription is reflected in server-side checks
 * without waiting for the 5-minute TTL.
 */
export function invalidateEntitlementCache(uid) {
  if (uid) cache.delete(uid);
}

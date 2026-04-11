// Server-side entitlement check.
//
// Two sources of truth, checked in order:
//   1. Firestore users/{uid}.subscription (written by the RevenueCat webhook
//      when it fires on purchase/renewal/cancel, or manually set for dev).
//      If subscription.status === 'active', we trust the plan string and skip
//      the RC API call entirely. This is the fast/canonical path once the
//      webhook is live.
//   2. RevenueCat REST API v2 (fallback). Called when the Firestore doc has
//      no explicit active subscription -- e.g. during the brief window
//      between a user's purchase completing on-device and the webhook firing,
//      or if we ever get out of sync with RC.
//
// Ultra is a strict superset of Pro at the application level.
//
// Performance: results cached in memory per warm function instance for 5 min.
// The webhook calls invalidateEntitlementCache(uid) on each event so a
// newly-purchased subscription reflects immediately without waiting for TTL.
import { getFirestore } from 'firebase-admin/firestore';

const RC_PROJECT_ID = 'f33ec0ef'; // 2manybeans project in RevenueCat
const RC_BASE = 'https://api.revenuecat.com/v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

// uid -> { pro, ultra, expiresAt }
const cache = new Map();

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
// subscription doc or the status isn't active -- in that case we fall back
// to the RC API. Swallows errors (Firestore down, etc.) and returns null.
async function checkFirestoreSubscription(uid) {
  try {
    const db = getFirestore();
    const snap = await db.doc(`users/${uid}`).get();
    if (!snap.exists) return null;
    const sub = snap.data()?.subscription;
    if (!sub) return null;
    if (sub.status !== 'active' && sub.status !== 'trial') return null;
    return entitlementsFromPlan(sub.plan);
  } catch (err) {
    console.warn('[checkEntitlement] Firestore lookup failed, falling back to RC API:', err?.message || err);
    return null;
  }
}

/**
 * Check which entitlements a user has.
 * @param {string} uid Firebase UID (matches RevenueCat appUserID via Purchases.logIn)
 * @returns {Promise<{ pro: boolean, ultra: boolean }>}
 */
export async function checkEntitlement(uid) {
  if (!uid) return { pro: false, ultra: false };

  const cached = cache.get(uid);
  if (cached && Date.now() < cached.expiresAt) {
    return { pro: cached.pro, ultra: cached.ultra };
  }

  // 1. Firestore-first (webhook-driven cache or manual dev override).
  const fsResult = await checkFirestoreSubscription(uid);
  if (fsResult) {
    cache.set(uid, { ...fsResult, expiresAt: Date.now() + CACHE_TTL_MS });
    return fsResult;
  }

  // 2. RC API fallback.
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    console.warn('[checkEntitlement] REVENUECAT_API_KEY not set — fail-open');
    return { pro: true, ultra: true };
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
      // 404 = customer has never been seen by RevenueCat (they haven't
      // purchased anything). Not an error — they simply have no entitlements.
      if (res.status === 404) {
        const result = { pro: false, ultra: false };
        cache.set(uid, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }

      // Any other non-OK is a RevenueCat API issue. Fail-open for Pro so
      // paying users are never blocked by an RC outage. Log loudly so we
      // notice in Vercel function logs.
      const body = await res.text().catch(() => '');
      console.error('[checkEntitlement] RevenueCat API error', res.status, body);
      return { pro: true, ultra: false };
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
    cache.set(uid, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.error('[checkEntitlement] fetch failed', err?.message || err);
    return { pro: true, ultra: false }; // fail-open
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

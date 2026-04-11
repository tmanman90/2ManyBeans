// Server-side entitlement check via RevenueCat REST API v2.
// Checks whether a given Firebase UID has `pro` or `ultra` entitlements.
//
// Ultra is a strict superset of Pro at the application level. A user with the
// Ultra entitlement passes any Pro gate, and separately passes Ultra-only gates.
//
// Performance: results are cached in memory per warm function instance for
// 5 minutes. Webhook-driven invalidation is a future optimization; for now,
// a 5-minute stale window is acceptable (a cancelled user gets up to 5 extra
// minutes of access; a newly subscribed user may wait up to 5 minutes for
// the server check to refresh, though the client-side SDK listener unlocks
// the UI immediately and the server check is a defense-in-depth layer).

const RC_PROJECT_ID = 'f33ec0ef'; // 2manybeans project in RevenueCat
const RC_BASE = 'https://api.revenuecat.com/v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

// uid -> { pro, ultra, expiresAt }
const cache = new Map();

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

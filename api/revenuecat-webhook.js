// RevenueCat webhook endpoint.
//
// RevenueCat posts subscription lifecycle events here (purchase, renewal,
// cancellation, expiration, billing issue). We map each event to a
// subscription status + plan identifier and persist it on the user's
// Firestore doc. Client-side `SubscriptionContext` listens for changes and
// unlocks the UI accordingly. We also invalidate the server-side entitlement
// cache so API proxies pick up the new state immediately instead of waiting
// for the 5-minute TTL.
//
// Auth: RevenueCat sends a shared secret in the `Authorization` header. It
// must match REVENUECAT_WEBHOOK_AUTH_KEY in Vercel env. Comparison is done
// with timingSafeEqual to avoid leaking the secret via timing oracles. This
// is configured in the RC dashboard under Integrations > Webhooks.

import { timingSafeEqual } from 'crypto';
import { getDb } from './_lib/cors-auth.js';
import { invalidateEntitlementCache } from './_lib/checkEntitlement.js';
import { buildServerProfileSeed } from './_lib/profileSeed.js';
import { normalizeSecret } from './_lib/secrets.js';

// Strict allowlist of known product IDs. Any unknown ID on a purchase-like
// event triggers a 500 so RC retries the webhook (and we get a loud log).
// This prevents fragile substring matches from silently writing the wrong
// plan when Apple/RC changes id format.
const PLAN_MAP = {
  'com.talmeltzer.coffeehub.pro.monthly': 'pro_monthly',
  'com.talmeltzer.coffeehub.pro.annual': 'pro_annual',
  'com.talmeltzer.coffeehub.ultra.monthly': 'ultra_monthly',
  'com.talmeltzer.coffeehub.ultra.annual': 'ultra_annual',
};

// Firebase Auth UID format: alphanumeric, underscore, hyphen, max 128 chars.
// Reject anything else to prevent path injection into Firestore doc paths.
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function mapPlan(productId) {
  return PLAN_MAP[productId] ?? null;
}

// Map RevenueCat event types to our internal subscription.status values.
// CANCELLATION keeps status='active' until the period ends — we set
// cancelAtPeriodEnd: true so the UI can show "Your subscription ends on…".
// EXPIRATION is the actual downgrade event.
// null means "do not update status on this event".
const STATUS_MAP = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  PRODUCT_CHANGE: 'active',
  UNCANCELLATION: 'active',
  TRIAL_STARTED: 'trial',
  TRIAL_CONVERTED: 'active',
  TRIAL_CANCELLED: 'active', // still active until trial ends
  CANCELLATION: 'active', // still active until expiresAt
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'active', // grace period
  BILLING_ISSUE_DETECTED: 'active',
  SUBSCRIBER_ALIAS: null,
  TRANSFER: null,
  TEST: null,
};

// Constant-time comparison of two strings of any length.
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = normalizeSecret(process.env.REVENUECAT_WEBHOOK_AUTH_KEY);
  if (!expected) {
    console.error('[RC webhook] REVENUECAT_WEBHOOK_AUTH_KEY not set');
    return res.status(500).json({ error: 'Webhook auth not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const provided = normalizeSecret(authHeader);
  if (!timingSafeCompare(provided, expected)) {
    console.warn('[RC webhook] auth_failed', {
      hasAuthorization: !!authHeader,
      scheme: authHeader.includes(' ') ? authHeader.split(/\s+/, 1)[0] : 'raw',
      providedLength: provided.length,
      expectedLength: expected.length,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body?.event;
  if (!event) {
    return res.status(400).json({ error: 'Missing event body' });
  }

  const uid = event.app_user_id;
  const type = event.type;

  if (!uid) {
    // Events like SUBSCRIBER_ALIAS can have an aliases array instead —
    // acknowledge and skip (we don't need to track them for entitlement).
    return res.status(200).json({ ok: true, skipped: 'no app_user_id' });
  }

  // Validate uid against Firebase Auth charset to prevent path injection
  // (e.g. an attacker-controlled forwarded id with `/` would otherwise
  // split the Firestore doc path into subcollections).
  if (!UID_PATTERN.test(uid)) {
    console.error('[RC webhook] invalid app_user_id format:', uid);
    return res.status(400).json({ error: 'Invalid app_user_id' });
  }

  const newStatus = STATUS_MAP[type];
  if (newStatus === undefined) {
    // Unknown event type — ack so RC doesn't retry.
    console.warn('[RC webhook] unknown event type:', type);
    return res.status(200).json({ ok: true, unknown: type });
  }

  if (newStatus === null) {
    return res.status(200).json({ ok: true, skipped: type });
  }

  // For purchase-like events, the product_id MUST resolve to a known plan.
  // Anything else is a revenue-integrity failure (RC may have changed format
  // or we have a typo). Return 500 so RC retries and we see it in logs.
  const plan = mapPlan(event.product_id);
  const isPurchaseLike = type === 'INITIAL_PURCHASE' || type === 'RENEWAL'
    || type === 'PRODUCT_CHANGE' || type === 'UNCANCELLATION'
    || type === 'TRIAL_STARTED' || type === 'TRIAL_CONVERTED';
  if (!plan && isPurchaseLike) {
    console.error('[RC webhook] unknown product_id on purchase event:', event.product_id, 'type:', type);
    return res.status(500).json({ error: 'unknown_product' });
  }

  try {
    const db = getDb();
    const userRef = db.collection('users').doc(uid);

    // KEEP IN SYNC with api/_lib/redemption.js (the other writer of
    // users/{uid}.subscription). Both must write the same field shape so
    // api/_lib/checkEntitlement.js and src/contexts/SubscriptionContext.jsx
    // can read either source identically.
    const subFields = {
      status: newStatus,
      lastEventType: type,
      lastEventAt: new Date().toISOString(),
    };
    if (plan) subFields.plan = plan;
    if (event.expiration_at_ms) {
      subFields.expiresAt = new Date(event.expiration_at_ms).toISOString();
    }
    if (event.purchased_at_ms && type === 'INITIAL_PURCHASE') {
      subFields.originalPurchaseDate = new Date(event.purchased_at_ms).toISOString();
    }
    if (event.store) {
      subFields.store = String(event.store).toLowerCase();
    }

    // Cancellation flag for UI — user keeps access until expiry but we
    // can show "Your subscription ends on…" in Settings.
    if (type === 'CANCELLATION' || type === 'TRIAL_CANCELLED') {
      subFields.cancelAtPeriodEnd = true;
    }
    if (type === 'UNCANCELLATION') {
      subFields.cancelAtPeriodEnd = false;
    }

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (userSnap.exists) {
        tx.set(userRef, { subscription: subFields }, { merge: true });
      } else {
        tx.set(userRef, buildServerProfileSeed({ subscription: subFields }));
      }
    });

    // Force next server-side check to refetch from RC/Firestore.
    invalidateEntitlementCache(uid);

    return res.status(200).json({ ok: true, type, newStatus, plan: plan || undefined });
  } catch (err) {
    console.error('[RC webhook] Firestore update failed', err?.message || err);
    return res.status(500).json({ error: 'Failed to persist webhook event' });
  }
}

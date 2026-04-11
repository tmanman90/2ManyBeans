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
// must match REVENUECAT_WEBHOOK_AUTH_KEY in Vercel env. This is configured
// in the RevenueCat dashboard under Integrations > Webhooks.

import { getDb } from './lib/cors-auth.js';
import { invalidateEntitlementCache } from './lib/checkEntitlement.js';

function mapPlan(productId) {
  if (!productId) return null;
  if (productId.includes('ultra.annual')) return 'ultra_annual';
  if (productId.includes('ultra.monthly')) return 'ultra_monthly';
  if (productId.includes('pro.annual')) return 'pro_annual';
  if (productId.includes('pro.monthly')) return 'pro_monthly';
  return null;
}

// Map RevenueCat event types to our internal subscription.status values.
// null means "do not update status on this event".
const STATUS_MAP = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  PRODUCT_CHANGE: 'active',
  UNCANCELLATION: 'active',
  TRIAL_STARTED: 'trial',
  TRIAL_CONVERTED: 'active',
  TRIAL_CANCELLED: 'cancelled',
  CANCELLATION: 'cancelled', // still active until expires_at
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'active', // grace period — still active
  BILLING_ISSUE_DETECTED: 'active',
  SUBSCRIBER_ALIAS: null,
  TRANSFER: null,
  TEST: null,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_KEY;
  if (!expected) {
    console.error('[RC webhook] REVENUECAT_WEBHOOK_AUTH_KEY not set');
    return res.status(500).json({ error: 'Webhook auth not configured' });
  }
  if (authHeader !== `Bearer ${expected}` && authHeader !== expected) {
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

  const newStatus = STATUS_MAP[type];
  if (newStatus === undefined) {
    // Unknown event type — ack so RC doesn't retry.
    console.warn('[RC webhook] unknown event type:', type);
    return res.status(200).json({ ok: true, unknown: type });
  }

  if (newStatus === null) {
    return res.status(200).json({ ok: true, skipped: type });
  }

  try {
    const db = getDb();
    const userRef = db.collection('users').doc(uid);

    const update = {
      'subscription.status': newStatus,
      'subscription.lastEventType': type,
      'subscription.lastEventAt': new Date().toISOString(),
    };

    const plan = mapPlan(event.product_id);
    if (plan) update['subscription.plan'] = plan;

    if (event.expiration_at_ms) {
      update['subscription.expiresAt'] = new Date(event.expiration_at_ms).toISOString();
    }
    if (event.purchased_at_ms && type === 'INITIAL_PURCHASE') {
      update['subscription.originalPurchaseDate'] = new Date(event.purchased_at_ms).toISOString();
    }
    if (event.store) {
      update['subscription.store'] = String(event.store).toLowerCase();
    }

    await userRef.set({ subscription: {} }, { merge: true }); // ensure parent exists
    await userRef.update(update);

    // Force next server-side check to refetch from RC.
    invalidateEntitlementCache(uid);

    return res.status(200).json({ ok: true, type, newStatus, plan: plan || undefined });
  } catch (err) {
    console.error('[RC webhook] Firestore update failed', err?.message || err);
    return res.status(500).json({ error: 'Failed to persist webhook event' });
  }
}

import { getDb } from './cors-auth.js';
import { FieldValue } from 'firebase-admin/firestore';
import { MODEL_PRICING, normalizeUsage, calculateCost, PRICING_REGISTRY_VERSION } from './modelPricing.js';

export { MODEL_PRICING, normalizeUsage, calculateCost, PRICING_REGISTRY_VERSION };

export function logApiUsage({ uid, provider, model, feature, endpoint, usage }) {
  const tokens = normalizeUsage(provider, usage);
  if (!tokens) return;
  const doc = { provider, model, feature: feature || 'unknown', endpoint, ...tokens,
    estimatedCost: calculateCost(model, tokens), pricingVersion: PRICING_REGISTRY_VERSION,
    createdAt: FieldValue.serverTimestamp() };
  if (uid) doc.uid = uid;
  try {
    const db = getDb();
    db.collection('apiUsage').add(doc).catch((err) => console.error('[costLogger] Firestore write failed:', err.message));
  } catch (err) { console.error('[costLogger] getDb() failed:', err.message); }
}

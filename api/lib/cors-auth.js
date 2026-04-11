// Shared CORS + Firebase Auth for all API proxies
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage, getDownloadURL as adminGetDownloadURL } from 'firebase-admin/storage';
import { checkEntitlement } from './checkEntitlement.js';

const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';

// Lazy-init Firebase Admin. Returns null only in non-prod environments when
// FIREBASE_SERVICE_ACCOUNT is unset. In production, missing service account is
// a configuration error -- throw so withCorsAuth can fail-closed instead of
// silently disabling authentication on every proxy.
function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) {
      initializeApp({
        credential: cert(JSON.parse(sa)),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else if (IS_PRODUCTION) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not set in production');
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT not set -- API auth is DISABLED in dev mode.');
      return null;
    }
  }
  return getAuth();
}

const EXACT_ORIGINS = [
  'https://2manybeans.vercel.app',
  'capacitor://localhost',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (EXACT_ORIGINS.includes(origin)) return true;
  // Allow http://localhost with any port (dev + Capacitor) -- but only in
  // non-production environments. In prod, a malicious site running on a
  // user's localhost (or a dev server for an unrelated project) would
  // otherwise get CORS clearance to call the prod API.
  if (!IS_PRODUCTION) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' && url.hostname === 'localhost') return true;
    } catch {
      // Invalid URL
    }
  }
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyAuth(req) {
  const auth = getFirebaseAdmin();
  if (!auth) return null; // No service account = dev mode, skip auth

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    throw err;
  }

  const token = header.slice(7);
  try {
    return await auth.verifyIdToken(token);
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    throw err;
  }
}

// Get Firestore instance from the existing admin singleton
export function getDb() {
  getFirebaseAdmin(); // ensure app is initialized
  return getFirestore();
}

// Get Storage bucket from the existing admin singleton
export function getStorageBucket() {
  getFirebaseAdmin(); // ensure app is initialized
  return getStorage().bucket();
}

export { adminGetDownloadURL };

export function withCorsAuth(handler) {
  return async (req, res) => {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let decodedToken;
    try {
      decodedToken = await verifyAuth(req);
    } catch (error) {
      if (error.status === 401) {
        return res.status(401).json({ error: error.message });
      }
      console.error('Auth verification error:', error);
      return res.status(500).json({ error: 'Internal auth error' });
    }

    // Fail-closed in production: if verifyAuth somehow returned null in prod
    // (should not happen since getFirebaseAdmin throws, but belt-and-braces),
    // refuse to invoke the handler rather than letting unauthenticated
    // callers drain the AI budget.
    if (IS_PRODUCTION && !decodedToken?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    return handler(req, res, decodedToken);
  };
}

// Gate: require an active Pro or Ultra entitlement.
// Use for AI features that are Pro+ (no free tier).
export function withCorsAuthPro(handler) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken?.uid) {
      const { pro } = await checkEntitlement(decodedToken.uid);
      if (!pro) {
        return res.status(403).json({
          error: 'subscription_required',
          tier: 'pro',
          message: 'This feature requires a Coffee Hub Pro subscription.',
        });
      }
    }
    return handler(req, res, decodedToken);
  });
}

// Gate: require an active Ultra entitlement.
// Use for features exclusive to the Ultra tier (Fellow Aiden push, multi-brewer).
export function withCorsAuthUltra(handler) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken?.uid) {
      const { ultra } = await checkEntitlement(decodedToken.uid);
      if (!ultra) {
        return res.status(403).json({
          error: 'subscription_required',
          tier: 'ultra',
          message: 'This feature requires a Coffee Hub Ultra subscription.',
        });
      }
    }
    return handler(req, res, decodedToken);
  });
}

// Gate: metered free tier. Each free user gets `freeLimit` lifetime
// invocations of `feature`. After that, they must subscribe to Pro/Ultra.
// Pro and Ultra users bypass the meter entirely.
//
// The counter is incremented atomically BEFORE the handler runs so that
// retries on a failing AI call don't cost the user multiple credits. If
// the handler errors after increment, the caller has been charged anyway —
// this is intentional to prevent retry abuse of the free tier.
export function withCorsAuthMetered(handler, { feature, freeLimit }) {
  if (!feature) throw new Error('withCorsAuthMetered: feature is required');
  if (typeof freeLimit !== 'number') throw new Error('withCorsAuthMetered: freeLimit is required');

  return withCorsAuth(async (req, res, decodedToken) => {
    if (!decodedToken?.uid) return handler(req, res, decodedToken);

    const { pro } = await checkEntitlement(decodedToken.uid);
    if (pro) return handler(req, res, decodedToken);

    // Free user: check quota in Firestore, atomic increment if under limit.
    const db = getDb();
    const userRef = db.collection('users').doc(decodedToken.uid);
    const path = `subscription.freeUsage.${feature}`;

    try {
      const snap = await userRef.get();
      const used = snap.data()?.subscription?.freeUsage?.[feature] ?? 0;

      if (used >= freeLimit) {
        return res.status(403).json({
          error: 'free_tier_exhausted',
          feature,
          used,
          limit: freeLimit,
          message: `You've used all ${freeLimit} free ${feature}. Upgrade to Pro for unlimited access.`,
        });
      }

      await userRef.set(
        { subscription: { freeUsage: { [feature]: FieldValue.increment(1) } } },
        { merge: true }
      );
    } catch (err) {
      console.error('[withCorsAuthMetered] Firestore error', err?.message || err);
      // Fail-closed: if we can't track usage, don't let free users call paid APIs.
      return res.status(500).json({ error: 'Failed to check usage quota' });
    }

    return handler(req, res, decodedToken);
  });
}

// Shared CORS + Firebase Auth for all API proxies
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
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

const RATE_LIMIT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

async function checkUserRateLimit(uid, { key, limit, windowMs }) {
  if (!uid || !key || !limit || !windowMs) return { allowed: true };
  if (!RATE_LIMIT_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid rate limit key: ${key}`);
  }

  const db = getDb();
  const ref = db.collection('users').doc(uid).collection('rateLimits').doc(key);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const windowStartMs = data?.windowStart ? new Date(data.windowStart).getTime() : 0;
    const count = Number.isInteger(data?.count) ? data.count : 0;
    const inWindow = windowStartMs && !Number.isNaN(windowStartMs) && now - windowStartMs < windowMs;

    if (inWindow && count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    tx.set(ref, {
      count: inWindow ? count + 1 : 1,
      windowStart: new Date(inWindow ? windowStartMs : now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }, { merge: true });

    return { allowed: true };
  });
}

async function rejectIfRateLimited(uid, rateLimit, res) {
  if (!rateLimit) return null;
  try {
    const result = await checkUserRateLimit(uid, rateLimit);
    if (result.allowed) return null;
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    return res.status(429).json({
      error: 'rate_limited',
      retryAfterSeconds: result.retryAfterSeconds,
      message: 'Too many requests. Please wait a bit and try again.',
    });
  } catch (err) {
    console.error('[rateLimit] Firestore error', err?.message || err);
    return res.status(500).json({ error: 'Failed to check rate limit' });
  }
}

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
    // Reject tokens after account deletion or explicit refresh-token revocation.
    return await auth.verifyIdToken(token, true);
  } catch {
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

// Map a checkEntitlement result into either an early 403/503 response, or
// `null` if the user is allowed to proceed. Used by every gate wrapper so
// the "RC unavailable → 503" path is consistent across endpoints.
function rejectFromEntitlement(result, requiredTier, res) {
  if (result.unavailable) {
    return res.status(503).json({
      error: 'entitlement_check_unavailable',
      message: 'Subscription service temporarily unavailable. Please try again in a moment.',
    });
  }
  const has = requiredTier === 'ultra' ? result.ultra : result.pro;
  if (!has) {
    return res.status(403).json({
      error: 'subscription_required',
      tier: requiredTier,
      message: requiredTier === 'ultra'
        ? 'This feature requires a Coffee Hub Ultra subscription.'
        : 'This feature requires a Coffee Hub Pro subscription.',
    });
  }
  return null;
}

// Gate: require an active Pro or Ultra entitlement.
// Use for AI features that are Pro+ (no free tier).
export function withCorsAuthPro(handler, { rateLimit } = {}) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken?.uid) {
      const result = await checkEntitlement(decodedToken.uid);
      const reject = rejectFromEntitlement(result, 'pro', res);
      if (reject) return reject;
      const limited = await rejectIfRateLimited(decodedToken.uid, rateLimit, res);
      if (limited) return limited;
    }
    return handler(req, res, decodedToken);
  });
}

// Gate: require an active Ultra entitlement.
// Use for features exclusive to the Ultra tier (Fellow Aiden push, multi-brewer).
export function withCorsAuthUltra(handler, { rateLimit } = {}) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken?.uid) {
      const result = await checkEntitlement(decodedToken.uid);
      const reject = rejectFromEntitlement(result, 'ultra', res);
      if (reject) return reject;
      const limited = await rejectIfRateLimited(decodedToken.uid, rateLimit, res);
      if (limited) return limited;
    }
    return handler(req, res, decodedToken);
  });
}

// Gate: metered free tier. Each free user gets `freeLimit` lifetime
// invocations of `feature`. After that, they must subscribe to Pro/Ultra.
// Pro and Ultra users bypass the meter entirely.
//
// IMPORTANT: the meter is OPT-IN per request. Callers MUST set
// `req.body.metered = true` to charge a credit. This is so a single proxy
// route (e.g. /api/claude) can be used for both metered actions (tasting
// coach session start) and unmetered actions (multi-turn chat replies)
// without burning a credit on every call.
//
// The counter is incremented inside a Firestore transaction so concurrent
// requests can't both pass an under-cap check and double-spend.
export function withCorsAuthMetered(handler, { feature, freeLimit, rateLimit }) {
  if (!feature) throw new Error('withCorsAuthMetered: feature is required');
  if (typeof freeLimit !== 'number') throw new Error('withCorsAuthMetered: freeLimit is required');

  return withCorsAuth(async (req, res, decodedToken) => {
    if (!decodedToken?.uid) return handler(req, res, decodedToken);

    const result = await checkEntitlement(decodedToken.uid);
    if (result.unavailable) {
      return res.status(503).json({
        error: 'entitlement_check_unavailable',
        message: 'Subscription service temporarily unavailable. Please try again in a moment.',
      });
    }
    if (result.pro) {
      const limited = await rejectIfRateLimited(decodedToken.uid, rateLimit, res);
      if (limited) return limited;
      return handler(req, res, decodedToken);
    }

    // Opt-in metering: callers explicitly mark metered requests so chat
    // replies, retries, and sub-calls don't burn credits unintentionally.
    const isMetered = req.body?.metered === true;
    if (!isMetered) {
      // Free user calling an unmetered action on a Pro feature → 403.
      return res.status(403).json({
        error: 'subscription_required',
        tier: 'pro',
        message: 'This feature requires a Coffee Hub Pro subscription.',
      });
    }

    // Free user metered action: atomic transaction prevents TOCTOU race.
    const db = getDb();
    const userRef = db.collection('users').doc(decodedToken.uid);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const used = snap.data()?.subscription?.freeUsage?.[feature] ?? 0;

        if (used >= freeLimit) {
          const err = new Error('free_tier_exhausted');
          err.code = 'free_tier_exhausted';
          err.used = used;
          throw err;
        }

        // Use literal value (not FieldValue.increment) so the transaction
        // retries cleanly on contention.
        tx.set(
          userRef,
          { subscription: { freeUsage: { [feature]: used + 1 } } },
          { merge: true }
        );
      });
    } catch (err) {
      if (err?.code === 'free_tier_exhausted') {
        return res.status(403).json({
          error: 'free_tier_exhausted',
          feature,
          used: err.used,
          limit: freeLimit,
          message: `You've used all ${freeLimit} free ${feature}. Upgrade to Pro for unlimited access.`,
        });
      }
      console.error('[withCorsAuthMetered] Firestore error', err?.message || err);
      // Fail-closed: if we can't track usage, don't let free users call paid APIs.
      return res.status(500).json({ error: 'Failed to check usage quota' });
    }

    const limited = await rejectIfRateLimited(decodedToken.uid, rateLimit, res);
    if (limited) return limited;
    return handler(req, res, decodedToken);
  });
}

export async function enforceUserRateLimit(uid, rateLimit, res) {
  return rejectIfRateLimited(uid, rateLimit, res);
}

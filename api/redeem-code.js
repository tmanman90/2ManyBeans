// Redemption code endpoint. Thin shell over api/_lib/redemption.js.
//
// Wraps withCorsAuth so CORS, method check, and Firebase ID token
// verification match every other proxy. Hard-checks email_verified on
// the decoded token (firebase-admin types both email/email_verified as
// optional, so we must verify before using either). Rejects malformed
// codes with a cheap regex before paying for a Firestore transaction.
//
// After a successful commit, invalidates the checkEntitlement positive
// cache so the next AI proxy call sees the grant without waiting 5min.
//
// Rate limit: 3 attempts per uid per rolling hour. Prevents code
// enumeration and saves Firestore transaction costs on brute-force.
// The counter lives on users/{uid}/rateLimits/redemption_codes
// (server-managed). A subcollection document can exist without creating the
// parent profile, which matters during onboarding: fresh users redeem before
// users/{uid} is created.
//
// Error taxonomy: `code_exhausted` is collapsed into `invalid_code` in
// the HTTP response so a guesser can't tell "code exists but is used up"
// from "code doesn't exist." The real reason is logged server-side.

import { withCorsAuth, getDb } from './_lib/cors-auth.js';
import { invalidateEntitlementCache } from './_lib/checkEntitlement.js';
import { runRedemption, RedeemError } from './_lib/redemption.js';

// Codes are stored uppercase, 4-20 chars, alphanum + hyphen only. This
// pre-check kills brute-force garbage before it hits Firestore.
const CODE_RE = /^[A-Z0-9-]{4,20}$/;

const MAX_ATTEMPTS = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Reason-code -> HTTP status. Friendly copy lives client-side.
// `code_exhausted` is intentionally absent: we return `invalid_code`
// for it so guessers can't distinguish "used up" from "doesn't exist."
// KEEP IN SYNC with: src/lib/fetchWithRetry.js REDEMPTION_REASONS,
// src/components/SettingsPage.jsx REDEEM_COPY.
const STATUS = {
  invalid_code: 403,
  invalid_input: 403,
  rate_limited: 429,
  email_not_verified: 403,
  already_redeemed: 403,
  has_active_subscription: 403,
};

// Check + bump the per-uid attempt counter atomically. Returns true if the
// user is rate-limited (should reject), false if the attempt is allowed.
// Runs outside the main redemption transaction so the rate-limit document
// doesn't contend with the code/ledger/user three-document transaction.
// Reads the legacy parent field once when the new document does not exist so
// deploying this migration does not reset an existing user's attempt window.
export async function checkRateLimit(db, uid) {
  const rateLimitRef = db.doc(`users/${uid}/rateLimits/redemption_codes`);
  const legacyUserRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const [rateLimitSnap, legacyUserSnap] = await Promise.all([
      tx.get(rateLimitRef),
      tx.get(legacyUserRef),
    ]);
    const attempts = rateLimitSnap.exists
      ? rateLimitSnap.data()
      : legacyUserSnap.data()?.redemptionAttempts;
    const now = Date.now();
    const windowStartMs = attempts?.windowStart
      ? new Date(attempts.windowStart).getTime()
      : 0;
    const inWindow = windowStartMs
      && !Number.isNaN(windowStartMs)
      && now - windowStartMs < WINDOW_MS;
    const count = Number.isInteger(attempts?.count) ? attempts.count : 0;

    if (inWindow && count >= MAX_ATTEMPTS) {
      return true;
    }

    tx.set(rateLimitRef, {
      count: inWindow ? count + 1 : 1,
      windowStart: new Date(inWindow ? windowStartMs : now).toISOString(),
    }, { merge: true });
    return false;
  });
}

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) return res.status(401).json({ error: 'missing_uid' });

  if (!decodedToken.email || decodedToken.email_verified !== true) {
    console.warn('[redeem-code] email_not_verified', { uid });
    return res.status(403).json({ error: 'email_not_verified' });
  }

  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const db = getDb();

  // Rate limit before touching the redemption transaction
  const limited = await checkRateLimit(db, uid);
  if (limited) {
    console.warn('[redeem-code] rate_limited', { uid });
    return res.status(429).json({ error: 'rate_limited' });
  }

  try {
    const result = await runRedemption({
      db,
      uid,
      email: decodedToken.email,
      code,
    });

    invalidateEntitlementCache(uid);

    console.log('[redeem-code] success', {
      uid,
      code,
      plan: result.plan,
      expiresAt: result.expiresAt,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RedeemError) {
      // Log the real reason server-side, but collapse code_exhausted
      // into invalid_code in the response so a guesser can't tell
      // "used up" from "doesn't exist."
      const clientCode = err.code === 'code_exhausted' ? 'invalid_code' : err.code;
      console.warn('[redeem-code] reject', { uid, code, reason: err.code });
      return res.status(STATUS[clientCode] ?? 500).json({ error: clientCode });
    }
    console.error('[redeem-code] transaction failed', err?.message || err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

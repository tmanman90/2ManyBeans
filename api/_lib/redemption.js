// Redemption code logic — pure module, no HTTP.
//
// Three independent abuse locks, all enforced inside a single Firestore
// transaction:
//   1. Per-uid/code   → users/{uid}/redemptions/{code}
//   2. Per-email/code → redemptionLedger/{hmacHash}_{code} (survives deletion)
//   3. Per-code cap   → redemptionCodes/{code}.useCount < maxUses
// Legacy redeemedCode and email-only ledger rows still block their original
// code. Keep them intact: other codes are now allowed, old codes stay spent.
//
// Gmail normalization folds dots, plus-tags, and googlemail.com → gmail.com
// so the same Google account can't reuse a code via aliasing. The email
// hash uses HMAC-SHA256 with a server-side pepper (REDEMPTION_EMAIL_PEPPER)
// so a Firestore dump can't be rainbow-tabled, per EDPS/AEPD 2025 guidance.
//
// The transaction writes to users/{uid}.subscription.* in the same shape the
// RC webhook uses, so api/_lib/checkEntitlement.js picks up the grant with no
// changes. Caller is responsible for calling invalidateEntitlementCache(uid)
// after a successful commit.

import { createHmac } from 'crypto';
import { domainToASCII } from 'node:url';

export class RedeemError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Gmail canonicalization:
//   1. NFKC normalize, lowercase, trim
//   2. Split on last @
//   3. Rewrite googlemail.com → gmail.com
//   4. Strip +tag from local-part (all providers)
//   5. For gmail.com only: remove dots from local-part
// Returns null for structurally invalid input.
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.normalize('NFKC').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;

  let local = trimmed.slice(0, at);
  let domain = domainToASCII(trimmed.slice(at + 1));
  if (!domain) return null; // domainToASCII returns '' on invalid input

  if (domain === 'googlemail.com') domain = 'gmail.com';

  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');

  if (!local) return null;
  return `${local}@${domain}`;
}

// HMAC-SHA256 hex digest with server-side pepper. Throws if the pepper is
// missing or too short so the handler can fail closed in production.
//
// WARNING: Do NOT rotate REDEMPTION_EMAIL_PEPPER without migrating the
// redemptionLedger collection first. Every existing ledger entry was hashed
// with the current pepper. A new pepper produces different hashes, so the
// lookup misses old entries and every past redeemer could redeem again.
// Any migration must preserve both legacy hash-only IDs and new hash_code
// IDs, including rows whose account was deleted. Generate the pepper with:
//   openssl rand -base64 48
export function hmacEmailHash(normalizedEmail) {
  const pepper = process.env.REDEMPTION_EMAIL_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error('REDEMPTION_EMAIL_PEPPER missing or too short');
  }
  return createHmac('sha256', pepper).update(normalizedEmail).digest('hex');
}

// Main transaction. Reads-before-writes per Firestore requirement.
// Uses literal `c.useCount + 1` (not FieldValue.increment) so retries on
// contention re-read the fresh value cleanly — matches the precedent at
// api/_lib/cors-auth.js inside withCorsAuthMetered.
export async function runRedemption({ db, uid, email, code }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new RedeemError('invalid_input');
  const emailHash = hmacEmailHash(normalized);

  const codeRef = db.doc(`redemptionCodes/${code}`);
  const userRef = db.doc(`users/${uid}`);
  const legacyLedgerRef = db.doc(`redemptionLedger/${emailHash}`);
  const ledgerRef = db.doc(`redemptionLedger/${emailHash}_${code}`);
  const userCodeRef = db.doc(`users/${uid}/redemptions/${code}`);

  return db.runTransaction(async (tx) => {
    const [codeSnap, userSnap, legacyLedgerSnap, ledgerSnap, userCodeSnap] = await Promise.all([
      tx.get(codeRef),
      tx.get(userRef),
      tx.get(legacyLedgerRef),
      tx.get(ledgerRef),
      tx.get(userCodeRef),
    ]);

    if (!codeSnap.exists) throw new RedeemError('invalid_code');
    const c = codeSnap.data();
    if (!c.active) throw new RedeemError('invalid_code');

    // Defensive: validate stored code shape at redeem time, not just at mint
    // time. A bad backup restore, a manual Firestore edit, or a future admin
    // tool that forgets validation could leave a code with NaN durationDays
    // or a non-string plan, which would silently write `expiresAt: null` into
    // users/{uid}.subscription and the client's `!sub.expiresAt` branch would
    // treat the grant as never-expiring.
    if (typeof c.plan !== 'string' || !c.plan) {
      throw new RedeemError('invalid_code');
    }
    if (!Number.isInteger(c.durationDays) || c.durationDays <= 0 || c.durationDays > 3650) {
      throw new RedeemError('invalid_code');
    }
    if (c.codeExpiresAt) {
      const exp = new Date(c.codeExpiresAt);
      if (!isNaN(exp.getTime()) && exp < new Date()) {
        throw new RedeemError('invalid_code');
      }
    }
    if (typeof c.maxUses === 'number' && c.useCount >= c.maxUses) {
      throw new RedeemError('code_exhausted');
    }

    const user = userSnap.exists ? userSnap.data() : {};
    if (user.redeemedCode === code || legacyLedgerSnap.data()?.code === code
        || ledgerSnap.exists || userCodeSnap.exists) {
      throw new RedeemError('already_redeemed');
    }

    // Extend a finite promotional grant of the same tier. Keep paid/trial
    // subscriptions, lifetime access, and tier changes protected from being
    // overwritten. Expired subscriptions can redeem any valid new code.
    const now = new Date();
    let startsAt = now;
    const existingSub = user.subscription;
    if (existingSub?.status === 'active' || existingSub?.status === 'trial') {
      const expDate = existingSub.expiresAt ? new Date(existingSub.expiresAt) : null;
      const stillValid = !expDate || isNaN(expDate.getTime()) || expDate > now;
      if (stillValid) {
        const sameTier = ['pro', 'ultra'].some(tier =>
          typeof existingSub.plan === 'string' && existingSub.plan.toLowerCase().startsWith(tier)
          && c.plan.toLowerCase().startsWith(tier)
        );
        if (existingSub.lastEventType !== 'REDEMPTION_CODE' || !sameTier
            || !expDate || isNaN(expDate.getTime())) {
          throw new RedeemError('has_active_subscription');
        }
        startsAt = expDate;
      }
    }

    const expiresAt = new Date(startsAt.getTime() + c.durationDays * 86400 * 1000);

    tx.update(codeRef, { useCount: c.useCount + 1 });

    // tx.create (not set) so a future bug that drops the ledgerSnap.exists
    // pre-check above would still abort the transaction instead of silently
    // overwriting the original audit row.
    //
    // No `normalizedEmail` field in the body: storing the plaintext next to
    // the HMAC hash would defeat the pseudonymization the hash exists for.
    // Audit/refund workflows can join through `uid` → users/{uid}.email.
    const redemption = {
      uid,
      code,
      plan: c.plan,
      redeemedAt: now.toISOString(),
    };
    tx.create(ledgerRef, redemption);
    tx.create(userCodeRef, redemption);

    // Explicit field set on `subscription` (no merge) so any stale residue
    // from a prior RC sub -- cancelAtPeriodEnd, store, originalPurchaseDate,
    // productId -- does not leak into a fresh code grant. freeUsage counters
    // live on the same parent doc but outside `subscription`, so they're
    // unaffected. tx.set with merge:true is still used at the doc level so
    // we don't clobber unrelated user fields.
    //
    // KEEP IN SYNC with api/revenuecat-webhook.js (the other writer of
    // users/{uid}.subscription). Both must write the same field shape so
    // api/_lib/checkEntitlement.js and src/contexts/SubscriptionContext.jsx
    // can read either source identically. If you add a field here, check
    // whether the webhook needs it too, and vice versa.
    tx.set(
      userRef,
      {
        // Preserve the first code, including legacy grants that predate
        // the per-code records. The latest code lives in subscription.
        redeemedCode: user.redeemedCode || code,
        redeemedAt: user.redeemedAt || now.toISOString(),
        subscription: {
          status: 'active',
          plan: c.plan,
          expiresAt: expiresAt.toISOString(),
          cancelAtPeriodEnd: false,
          lastEventType: 'REDEMPTION_CODE',
          lastEventAt: now.toISOString(),
          grantedCode: code,
        },
      },
      { mergeFields: ['redeemedCode', 'redeemedAt', 'subscription'] }
    );

    return {
      plan: c.plan,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

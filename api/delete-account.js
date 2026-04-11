// Account deletion endpoint.
//
// Apple App Review Guideline 5.1.1(v) requires in-app account deletion for
// any app with account creation. This endpoint is the server-side worker
// that purges every piece of user data across Firestore, Firebase Storage,
// Firebase Auth, and RevenueCat.
//
// Auth requirements (defense in depth):
//   1. Standard withCorsAuth Bearer token verification
//   2. Recent reauth check: decodedToken.auth_time must be within 5 minutes
//      so a stolen token can't be replayed for the full 60-min ID token
//      lifetime. The client must call reauthenticateWith{Google,Apple} just
//      before invoking this endpoint and force-refresh the token.
//   3. After successful purge, refresh tokens are revoked AND the auth
//      record is deleted. Any other server endpoint that wraps verifyIdToken
//      with checkRevoked: true will reject any token issued for this user.
//
// Ordering: Firestore first → Storage → RC → Auth (last). The most
// destructive irreversible step is auth, and we want every reversible step
// to either succeed or fail before we kill the auth record. If Firestore
// fails, RC and Storage are still intact and the user can retry from a
// still-valid session.
//
// Idempotency: every step is safe to retry. auth/user-not-found is treated
// as success. Storage deleteFiles handles already-empty prefixes. Firestore
// doc.delete() on missing docs is a no-op. RC v1 DELETE returns 200 even
// for already-deleted subscribers.
//
// Safety: the request body must include { confirmation: "DELETE" } to
// prevent accidental deletion via a stray POST.

import { withCorsAuth, getDb, getStorageBucket } from './lib/cors-auth.js';
import { getAuth } from 'firebase-admin/auth';

// Vercel function timeout — large accounts can take a few seconds to purge.
export const config = { maxDuration: 60 };

const BATCH_SIZE = 500;
const REAUTH_MAX_AGE_SECONDS = 5 * 60;

/**
 * Delete all documents in a collection reference, in batches.
 * Returns the number of documents deleted. Includes a runaway counter so
 * a Firestore inconsistency can't infinite-loop the function.
 */
async function deleteCollection(collectionRef) {
  let total = 0;
  let iterations = 0;
  while (true) {
    if (++iterations > 200) {
      throw new Error(`deleteCollection runaway on ${collectionRef.path}`);
    }
    const snap = await collectionRef.limit(BATCH_SIZE).get();
    if (snap.empty) return total;

    const batch = collectionRef.firestore.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;

    if (snap.size < BATCH_SIZE) return total;
  }
}

/**
 * Best-effort RevenueCat subscriber deletion via the v1 DELETE endpoint.
 * Failure is logged but non-blocking — Apple App Store billing is managed
 * separately by Apple and cannot be cancelled from the server. The UI
 * warns the user to cancel in iOS Settings before deleting.
 */
async function deleteRevenueCatSubscriber(uid) {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok || res.status === 404) return { ok: true };
    const body = await res.text().catch(() => '');
    console.warn('[delete-account] RC DELETE returned', res.status, body);
    return { ok: false, reason: `rc_${res.status}` };
  } catch (err) {
    console.warn('[delete-account] RC DELETE failed', err?.message || err);
    return { ok: false, reason: 'rc_exception' };
  }
}

/**
 * Best-effort Storage cleanup. Deletes everything under users/{uid}/.
 * Failure logs a warning but does not block the rest of the pipeline.
 */
async function deleteStoragePrefix(uid) {
  try {
    const bucket = getStorageBucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/`, force: true });
    return { ok: true };
  } catch (err) {
    console.warn('[delete-account] Storage cleanup failed', err?.message || err);
    return { ok: false, reason: 'storage_exception' };
  }
}

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  if (!uid) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Reauth gate: token must have been issued within the last 5 minutes.
  // The client force-refreshes its token after a fresh OAuth reauth flow,
  // so a stolen token from earlier in the session won't pass this check.
  const authTime = decodedToken.auth_time;
  if (typeof authTime !== 'number' || (Date.now() / 1000 - authTime) > REAUTH_MAX_AGE_SECONDS) {
    return res.status(401).json({
      error: 'reauth_required',
      message: 'Please re-sign-in to confirm account deletion.',
    });
  }

  const confirmation = req.body?.confirmation;
  if (confirmation !== 'DELETE') {
    return res.status(400).json({
      error: 'confirmation_required',
      message: 'Request must include { confirmation: "DELETE" } to proceed.',
    });
  }

  // Step 1: Firestore subcollections + top-level docs.
  // Doing Firestore FIRST means a failure here leaves all the other systems
  // intact, and the user retains a working session to retry. Subcollections
  // are enumerated dynamically via listCollections() so future additions
  // don't get orphaned.
  try {
    const db = getDb();
    const userRef = db.collection('users').doc(uid);

    const subcols = await userRef.listCollections();
    await Promise.all(subcols.map((col) => deleteCollection(col)));

    // emailList sits at the top level, scoped by uid
    try {
      await db.collection('emailList').doc(uid).delete();
    } catch (err) {
      // Not-found is fine; surface other errors
      if (err?.code !== 5) {
        console.warn('[delete-account] emailList delete failed', err?.message || err);
      }
    }

    // User profile doc
    await userRef.delete();
  } catch (err) {
    console.error('[delete-account] Firestore purge failed', err?.message || err);
    return res.status(500).json({
      error: 'firestore_failed',
      message: 'Failed to delete your data. Please try again or contact support.',
    });
  }

  // Step 2: Storage (best-effort)
  await deleteStoragePrefix(uid);

  // Step 3: RevenueCat subscriber (best-effort)
  await deleteRevenueCatSubscriber(uid);

  // Step 4: Firebase Auth — LAST. Once this succeeds, the user's token is
  // invalid and they cannot retry the endpoint. We revoke refresh tokens
  // FIRST so any other endpoint with checkRevoked:true rejects existing
  // tokens immediately.
  try {
    await getAuth().revokeRefreshTokens(uid);
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      // Idempotent: already deleted, treat as success.
    } else {
      console.error('[delete-account] Auth deleteUser failed', err?.message || err);
      return res.status(500).json({
        error: 'auth_delete_failed',
        message: 'Your data was removed but the account record could not be deleted. Please sign out and contact support.',
      });
    }
  }

  return res.status(200).json({ ok: true });
});

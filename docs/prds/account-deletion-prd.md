# Account Deletion PRD

## Overview

Apple requires all apps with account creation to offer in-app account deletion (Guideline 5.1.1(v)). This is a hard App Store blocker. The feature must actually delete all user data, not just deactivate or hide the account.

## Problem

Coffee Hub has no account deletion flow. Users can sign out but cannot delete their account or data. Apple will reject the app without this.

## User Data Map

All data that must be deleted for a given `uid`:

### Firestore

| Path | Type | Description |
|------|------|-------------|
| `users/{uid}` | Document | Profile, preferences, Fellow connection status |
| `users/{uid}/beans/*` | Subcollection | All coffee bean documents |
| `users/{uid}/tastings/*` | Subcollection | All tasting records |
| `users/{uid}/secrets/fellow` | Document | Encrypted Fellow Aiden credentials (Admin SDK only) |
| `emailList/{uid}` | Document | Marketing email consent (top-level collection) |

### Firebase Storage

| Path | Description |
|------|-------------|
| `users/{uid}/bean-photos/*` | Bean product photos (JPGs/PNGs) |

### Firebase Auth

| Data | Description |
|------|-------------|
| Auth user record | Firebase Authentication account (Google/Apple provider) |

### RevenueCat (after subscription PRD is implemented)

| Data | Description |
|------|-------------|
| Subscriber record | RevenueCat subscriber tied to `appUserID = uid` |

### Local Storage (device)

| Key Pattern | Description |
|-------------|-------------|
| `tmb_beans_{uid}` | Cached beans (offline support) |
| `tmb_tastings_{uid}` | Cached tastings (offline support) |
| `tmb_profile_{uid}` | Cached profile (offline support) |
| `apple_pending_name` | Apple Sign-In name stash (if present) |

---

## Implementation

### Why Server-Side

Deleting subcollections in Firestore cannot be done from the client in a single operation. You must enumerate and delete each document individually. For `users/{uid}/secrets/fellow`, the client has no read access (Admin-only security rules). Firebase Auth `deleteUser()` from the client requires recent authentication (reauthentication prompt).

A server-side endpoint handles all of this cleanly: Admin SDK bypasses security rules, can recursively delete subcollections, and can delete the Auth record without reauthentication.

### New API Endpoint: `api/delete-account.js`

**Method:** POST  
**Auth:** Firebase ID token (Bearer header), same as other API proxies  
**Body:** `{ "confirmation": "DELETE" }` (prevents accidental calls)

**Deletion sequence (order matters):**

```
1. Verify Firebase auth token (withCorsAuth)
2. Verify confirmation === "DELETE"
3. Extract uid from decodedToken
4. Delete RevenueCat subscriber (if REVENUECAT_SECRET_KEY is set)
   - DELETE https://api.revenuecat.com/v1/subscribers/{uid}
   - Failure here is non-blocking (log warning, continue)
5. Delete Firebase Storage: users/{uid}/bean-photos/*
   - List all files in prefix, delete each
   - Failure here is non-blocking (orphaned files are harmless)
6. Delete Firestore subcollections:
   - users/{uid}/tastings/* (batch delete, 500 docs per batch)
   - users/{uid}/beans/* (batch delete, 500 docs per batch)
   - users/{uid}/secrets/* (batch delete)
7. Delete Firestore top-level docs:
   - emailList/{uid}
   - users/{uid}
8. Delete Firebase Auth user record
   - admin.auth().deleteUser(uid)
9. Return 200 { success: true }
```

**Why this order:**
- RevenueCat first: prevents user from being charged after deletion starts
- Storage before Firestore: bean photos reference bean docs, delete files while references still exist for listing
- Subcollections before parent doc: Firestore doesn't cascade deletes
- Auth last: once the auth record is gone, the user's token is invalidated and they can't retry if something failed earlier

**Error handling:**
- Steps 4-5 (RevenueCat, Storage) are best-effort. Log failures, continue.
- Steps 6-8 (Firestore, Auth) are critical. If any fail, return 500 with what succeeded and what failed so the user can retry.
- The endpoint must be idempotent: calling it twice should not error (already-deleted docs/files are just no-ops).

### Client-Side: Delete Account Button

**Location:** `src/components/SettingsPage.jsx`, in the Account section, below Sign Out.

**Flow:**

```
1. User taps "Delete Account"
2. Show confirmation dialog:
   "Delete your account?"
   "This will permanently delete your account and all your data
   (beans, tastings, photos, preferences). This cannot be undone.
   
   If you have an active subscription, it will NOT be automatically
   cancelled. Please cancel your subscription in iOS Settings first."
   
   [Cancel]  [Delete Account]  (red, destructive)
   
3. On confirm, show second confirmation:
   "Type DELETE to confirm"
   [text input]  [Confirm]
   
4. Call POST /api/delete-account with { confirmation: "DELETE" }
5. Show loading spinner: "Deleting your account..."
6. On success:
   - Clear all localStorage (tmb_*_{uid} keys + apple_pending_name)
   - Call auth.signOut() (navigates to sign-in screen)
   - Show brief toast: "Account deleted"
7. On failure:
   - Show error: "Something went wrong. Please try again or contact support."
   - Keep user signed in so they can retry
```

**Subscription warning:** If the user has an active RevenueCat subscription, show an additional warning before the first confirmation: "You have an active subscription. Deleting your account does NOT cancel your subscription. Go to Settings > Subscriptions to cancel first." with a "Manage Subscription" button that opens the iOS subscription management deep link.

### Files to Create

| File | Purpose |
|------|---------|
| `api/delete-account.js` | Server-side deletion endpoint |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/SettingsPage.jsx` | Add "Delete Account" button + confirmation flow |
| `src/lib/fetchWithRetry.js` | No changes needed (already handles auth headers) |
| `api/lib/cors-auth.js` | No changes needed (withCorsAuth already works for new endpoints) |

### Firebase Dependencies

The endpoint needs these Firebase Admin SDK features (already initialized in your API proxies):

```javascript
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
```

Verify `firebase-admin` is in your dependencies and that the Admin SDK is initialized in a shared module (check `api/lib/` for existing Firebase Admin setup).

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User deletes account mid-subscription | RevenueCat subscriber deleted. Apple subscription still active until period ends (Apple manages billing). User warned to cancel first. |
| User deletes account then re-signs-in with same Google/Apple | Fresh account. New `users/{uid}` doc created by onboarding. Firebase Auth generates same UID for same provider email, but all data is gone. |
| Deletion fails partway through | Endpoint returns which steps failed. User can retry (idempotent). Partially-deleted state is safe: user can still sign in and retry. |
| User has hundreds of beans/tastings | Batch delete in groups of 500 (Firestore limit per batch). Loop until all subcollection docs are deleted. |
| User has no beans/tastings | Empty subcollection queries return 0 docs. No-op, no error. |
| Offline/native device | localStorage cleared on client side after server confirms deletion. If client-side clear fails, stale cache is harmless (auth is gone, cache is never read again). |
| Fellow Aiden credentials | Deleted via Admin SDK (client has no access to secrets subcollection). Fellow's own servers are not notified (no API for that). |

---

## Apple Review Requirements

Per Guideline 5.1.1(v):
- Delete button must be **easily discoverable** (Settings page is standard)
- Must **actually delete data**, not just deactivate
- Must delete from **all backends** (Firestore, Storage, Auth, RevenueCat)
- Must work during review (test with sandbox account)
- If deletion takes time, show progress or send email confirmation

Our approach (immediate server-side deletion with success response) meets all requirements.

---

## Testing Checklist

- [ ] Delete button visible in Settings (Account section)
- [ ] First confirmation dialog appears with correct text
- [ ] Second confirmation requires typing "DELETE"
- [ ] API call succeeds and returns 200
- [ ] Firestore: `users/{uid}` document gone
- [ ] Firestore: `users/{uid}/beans/*` subcollection empty
- [ ] Firestore: `users/{uid}/tastings/*` subcollection empty
- [ ] Firestore: `users/{uid}/secrets/fellow` gone (if existed)
- [ ] Firestore: `emailList/{uid}` gone (if existed)
- [ ] Firebase Storage: `users/{uid}/bean-photos/*` empty
- [ ] Firebase Auth: user record deleted (check Firebase Console)
- [ ] localStorage: all `tmb_*_{uid}` keys cleared
- [ ] User lands on sign-in screen after deletion
- [ ] Re-signing in with same provider creates fresh account with onboarding
- [ ] Calling delete endpoint twice does not error (idempotent)
- [ ] Subscription warning shown if user has active pro entitlement

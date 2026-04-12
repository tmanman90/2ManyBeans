---
status: pending
priority: p1
issue_id: 002
tags: [code-review, security, firestore-rules]
dependencies: []
---

# P1: Subscription injection on users/{uid} create bypasses the diff guard

## Problem Statement

`firestore.rules` uses `!diff(resource.data).affectedKeys().hasAny(['subscription','fellow'])` to prevent clients from writing subscription state. But `resource.data` is null on document create, and the rule evaluation may either fail or be evaluated on a null parent — in both cases, the diff guard does not apply on the initial write. A malicious client signing up can POST `subscription: { status: 'active', plan: 'ultra_annual' }` on first profile-write, and `checkEntitlement.js:41-54` trusts Firestore as the fast path → grants Ultra forever, no RC purchase required.

## Findings

**Files:**
- `firestore.rules:7-28`
- `api/lib/checkEntitlement.js:41-54`

Flagged by: data-integrity P1-2, security P2-5.

**Exploit:**
1. Attacker creates fresh Google account
2. Signs in to Coffee Hub
3. Intercepts the initial `setDoc(users/{uid})` call
4. Injects `subscription: { status: 'active', plan: 'ultra_annual' }`
5. Server-side `checkEntitlement` reads Firestore, sees active, returns `{pro: true, ultra: true}`
6. Unlimited AI forever

## Proposed Solutions

### Option 1: Split create vs update rules (recommended)
```
allow create: if request.auth != null && request.auth.uid == userId
  && request.resource.data.keys().hasOnly([
    'displayName', 'email', 'photoURL', 'signUpProvider',
    'username', 'createdAt', 'lastLoginAt', 'onboardingComplete',
    'marketingConsent', 'marketingConsentDate', 'preferences'
  ])
  && !request.resource.data.keys().hasAny(['fellow', 'subscription']);

allow update: if request.auth != null && request.auth.uid == userId
  && request.resource.data.keys().hasOnly([...same list plus subscription, fellow])
  && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['fellow', 'subscription']);
```
- Pros: Explicit, tight, fail-closed.
- Cons: Duplicates field list.
- Effort: Small

### Option 2: Server-side validation in checkEntitlement
Don't trust Firestore `subscription.status`. Always call RC API for the source of truth. Firestore becomes a write-through cache populated only by the webhook.
- Pros: Defense in depth.
- Cons: Defeats the Firestore-first optimization (see TODO 014).
- Effort: Medium

## Recommended Action

Option 1 for the rules fix (definitely ship). Option 2 is a separate architectural question covered in TODO 014.

## Technical Details

- Files: `firestore.rules`
- No code changes required
- Requires redeploying Firestore security rules: `firebase deploy --only firestore:rules`

## Acceptance Criteria

- [ ] Rule split into create/update
- [ ] Create path rejects any request containing `subscription` or `fellow` field
- [ ] Update path still blocks diff-based mutations to those fields
- [ ] Test: forge a signUp with `subscription.status = 'active'` → rejected
- [ ] Test: existing user updates `displayName` → succeeds
- [ ] Test: existing user attempts to write `subscription.plan = 'ultra_annual'` → rejected

## Work Log

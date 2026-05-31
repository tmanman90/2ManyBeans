import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProfileCompletionBase } from '../src/lib/profileShape.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const userProfile = read('src/hooks/useUserProfile.jsx');
const revenuecatWebhook = read('api/revenuecat-webhook.js');
const corsAuth = read('api/_lib/cors-auth.js');

function allowsUserUpdate(before, after) {
  const allowedKeys = new Set([
    'displayName', 'email', 'photoURL', 'signUpProvider',
    'username', 'createdAt', 'lastLoginAt', 'onboardingComplete',
    'marketingConsent', 'marketingConsentDate', 'preferences',
    'fellow', 'subscription',
    'onboardingAnswers', 'onboardingCompletedAt',
    'redeemedCode', 'redeemedAt', 'redemptionAttempts',
    'tourCompleted',
    'aiDataConsent', 'aiConsentDate',
  ]);
  const afterKeys = Object.keys(after);
  const affectedKeys = new Set([
    ...Object.keys(before),
    ...afterKeys,
  ].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])));

  return afterKeys.every((key) => allowedKeys.has(key))
    && typeof after.displayName === 'string'
    && after.displayName.length <= 100
    && ![...affectedKeys].some((key) => [
      'fellow',
      'subscription',
      'redeemedCode',
      'redeemedAt',
      'redemptionAttempts',
    ].includes(key));
}

const subscriptionOnlyProfile = {
  subscription: {
    status: 'active',
    plan: 'pro_annual',
  },
};
const oldCompletionPayload = {
  onboardingComplete: true,
  onboardingCompletedAt: 'SERVER_TIMESTAMP',
  onboardingAnswers: { postCompleteAction: 'scan' },
};
assert.equal(
  allowsUserUpdate(subscriptionOnlyProfile, { ...subscriptionOnlyProfile, ...oldCompletionPayload }),
  false,
  'A subscription-only profile must reproduce the old Firestore denial before the repair patch.'
);

const repairPatch = buildProfileCompletionBase({
  profile: subscriptionOnlyProfile,
  user: {
    displayName: 'Anthony Cenname',
    email: 'anthony@example.com',
    photoURL: 'https://example.com/avatar.png',
    providerData: [{ providerId: 'google.com' }],
  },
  answers: {
    marketingConsent: false,
    preferences: { brewMethod: 'v60' },
  },
  pendingDisplayName: '',
  timestamp: 'SERVER_TIMESTAMP',
});
assert.deepEqual(
  {
    displayName: repairPatch.displayName,
    email: repairPatch.email,
    signUpProvider: repairPatch.signUpProvider,
    onboardingComplete: true,
  },
  {
    displayName: 'Anthony Cenname',
    email: 'anthony@example.com',
    signUpProvider: 'google.com',
    onboardingComplete: true,
  },
  'Completion repair should fill the profile fields Firestore rules require.'
);
assert.equal(
  allowsUserUpdate(subscriptionOnlyProfile, {
    ...subscriptionOnlyProfile,
    ...repairPatch,
    onboardingComplete: true,
    onboardingCompletedAt: 'SERVER_TIMESTAMP',
    onboardingAnswers: { postCompleteAction: 'scan' },
  }),
  true,
  'A repaired subscription-only profile should satisfy the Firestore update rule simulation.'
);

assert(
  userProfile.includes('buildProfileCompletionBase') &&
    userProfile.includes('readPendingProviderDisplayName()') &&
    userProfile.includes("|| 'Coffee Lover'"),
  'completeOnboarding should repair incomplete profile docs instead of writing onboarding fields only.'
);

assert(
  revenuecatWebhook.includes('buildServerProfileSeed') &&
    revenuecatWebhook.includes('userSnap.exists') &&
    revenuecatWebhook.includes('db.runTransaction'),
  'RevenueCat webhook must seed a valid profile shape when subscription arrives before onboarding completion.'
);

assert(
  corsAuth.includes('buildServerProfileSeed') &&
    corsAuth.includes('snap.exists') &&
    corsAuth.includes('decodedToken'),
  'Metered API usage must not create subscription-only user profile stubs.'
);

console.log('onboarding handoff regression checks passed');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkRateLimit } from '../api/redeem-code.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function fakeFirestore() {
  const documents = new Map();

  return {
    documents,
    doc(path) {
      return { path };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          const value = documents.get(ref.path);
          return {
            exists: value !== undefined,
            data: () => value,
          };
        },
        set(ref, value, options) {
          const previous = documents.get(ref.path) || {};
          documents.set(ref.path, options?.merge ? { ...previous, ...value } : value);
        },
      });
    },
  };
}

// A brand-new onboarding user has no users/{uid} profile document yet.
// Rate limiting must work without creating that parent profile prematurely.
const db = fakeFirestore();
assert.equal(await checkRateLimit(db, 'fresh-user'), false);
assert.equal(db.documents.has('users/fresh-user'), false);
assert.deepEqual(db.documents.get('users/fresh-user/rateLimits/redemption_codes'), {
  count: 1,
  windowStart: db.documents.get('users/fresh-user/rateLimits/redemption_codes').windowStart,
});

assert.equal(await checkRateLimit(db, 'fresh-user'), false);
assert.equal(await checkRateLimit(db, 'fresh-user'), false);
assert.equal(await checkRateLimit(db, 'fresh-user'), true);
assert.equal(db.documents.get('users/fresh-user/rateLimits/redemption_codes').count, 3);

// Successful redemption creates server-managed fields on users/{uid} before
// onboarding finishes. The client profile create must merge those fields, and
// a partial server-created document must still take the full createProfile path.
const userProfile = read('src/hooks/useUserProfile.jsx');
const onboardingFlow = read('src/components/onboarding/OnboardingFlow.jsx');

assert.match(userProfile, /await setDoc\(profileRef, profileData, \{ merge: true \}\);/);
assert.match(onboardingFlow, /const hasCompleteProfile = Boolean\(/);
assert.match(onboardingFlow, /else if \(!hasCompleteProfile\) \{/);
assert.doesNotMatch(onboardingFlow, /else if \(!profile\) \{/);

console.log('Onboarding redemption regression passed.');

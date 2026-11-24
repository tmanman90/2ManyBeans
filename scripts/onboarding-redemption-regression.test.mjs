import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

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

// Guideline 3.1.1: Apple rejected the iOS app on 2026-05-13 for an in-app code
// entry that unlocks Pro (fixed in 343725f). The onboarding invite box came back
// on native on 2026-07-09 through a new, ungated call site. Every place that
// renders <RedemptionInline> must sit behind !Capacitor.isNativePlatform().
const sourceFiles = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
  });

const callSites = [];
for (const path of sourceFiles('src')) {
  const source = read(path);
  for (const match of source.matchAll(/<RedemptionInline\b/g)) {
    callSites.push(path);
    const before = source.slice(Math.max(0, match.index - 200), match.index);
    assert.match(
      before,
      /!Capacitor\.isNativePlatform\(\) && (?:\(\s*<m\.div[^>]*>\s*)?$/,
      `${path} renders <RedemptionInline> without the native gate (Guideline 3.1.1)`,
    );
  }
}
assert.deepEqual(callSites.sort(), [
  'src/components/onboarding/screens/R13Paywall.jsx',
  'src/components/onboarding/screens/R13bNudge.jsx',
]);

console.log('Onboarding redemption regression passed.');

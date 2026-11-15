import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRedemption, hmacEmailHash, normalizeEmail } from '../api/_lib/redemption.js';

// Hermetic transaction tests: stage writes, reject read-after-write, and retry
// conflicting commits. These model transaction semantics; they are not a live
// Firestore or security-rules integration test.
process.env.REDEMPTION_EMAIL_PEPPER = 'redemption-test-pepper-not-a-real-secret';
const DAY = 86_400_000;
const email = 'coffee@example.com';
const uid = 'coffee-user';
const hash = (address = email) => hmacEmailHash(normalizeEmail(address));
const codeData = (extra = {}) => ({
  active: true, plan: 'ultra_1year', durationDays: 365, useCount: 0, maxUses: 10, ...extra,
});

function fakeFirestore(seed = {}) {
  const documents = new Map(Object.entries({
    'redemptionCodes/FIRST': codeData({ durationDays: 30 }),
    'redemptionCodes/SECOND': codeData(),
    'redemptionCodes/THIRD': codeData({ durationDays: 7 }),
    ...seed,
  }));
  let version = 0;
  return {
    documents,
    retries: 0,
    doc: path => ({ path }),
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const readVersion = version;
        const staged = structuredClone(documents);
        let writing = false;
        const result = await callback({
          async get({ path }) {
            assert.equal(writing, false, 'Firestore requires reads before writes');
            return { exists: staged.has(path), data: () => staged.get(path) };
          },
          create({ path }, value) {
            writing = true;
            assert.equal(staged.has(path), false, 'create must not overwrite history');
            staged.set(path, structuredClone(value));
          },
          update({ path }, value) {
            writing = true;
            assert.ok(staged.has(path));
            staged.set(path, { ...staged.get(path), ...structuredClone(value) });
          },
          set({ path }, value, options) {
            writing = true;
            assert.ok(options.mergeFields);
            staged.set(path, {
              ...staged.get(path),
              ...Object.fromEntries(options.mergeFields.map(key => [key, structuredClone(value[key])])),
            });
          },
        });
        if (version !== readVersion) { this.retries++; continue; }
        documents.clear();
        for (const [key, value] of staged) documents.set(key, value);
        version++;
        return result;
      }
      throw new Error('Transaction retry limit');
    },
  };
}

const redeem = (db, code, extra = {}) => runRedemption({ db, uid, email, code, ...extra });
async function rejectsWithoutWrites(db, code, reason, extra) {
  const before = structuredClone(db.documents);
  await assert.rejects(redeem(db, code, extra), error => error.code === reason);
  assert.deepEqual(db.documents, before);
}

test('first redemption grants finite access and preserves unrelated profile fields', async () => {
  const db = fakeFirestore({ [`users/${uid}`]: { displayName: 'Coffee', preferences: { grinder: 'Ode' } } });
  const before = Date.now();
  const result = await redeem(db, 'FIRST');
  assert.equal(result.plan, 'ultra_1year');
  assert.ok(Date.parse(result.expiresAt) >= before + 30 * DAY);
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + 30 * DAY);
  assert.equal(db.documents.get(`users/${uid}`).displayName, 'Coffee');
  assert.deepEqual(db.documents.get(`users/${uid}`).preferences, { grinder: 'Ode' });
  assert.equal(db.documents.get('redemptionCodes/FIRST').useCount, 1);
  assert.equal(db.documents.get(`redemptionLedger/${hash()}_FIRST`).code, 'FIRST');
});

test('different codes extend remaining promotional time; every old code stays spent', async () => {
  const db = fakeFirestore();
  const first = await redeem(db, 'FIRST');
  const second = await redeem(db, 'SECOND');
  const third = await redeem(db, 'THIRD');
  assert.equal(Date.parse(second.expiresAt), Date.parse(first.expiresAt) + 365 * DAY);
  assert.equal(Date.parse(third.expiresAt), Date.parse(second.expiresAt) + 7 * DAY);
  assert.equal(db.documents.get(`users/${uid}`).redeemedCode, 'FIRST');
  assert.equal(db.documents.get(`users/${uid}`).subscription.grantedCode, 'THIRD');
  for (const code of ['FIRST', 'SECOND', 'THIRD']) {
    await rejectsWithoutWrites(db, code, 'already_redeemed');
  }
});

test('legacy profile and email history allow a different code without erasing the first', async () => {
  const legacy = { uid, code: 'FIRST', plan: 'ultra_1year', redeemedAt: '2020-01-01T00:00:00.000Z' };
  const db = fakeFirestore({
    [`users/${uid}`]: { redeemedCode: 'FIRST', redeemedAt: legacy.redeemedAt },
    [`redemptionLedger/${hash()}`]: legacy,
  });
  await redeem(db, 'SECOND');
  assert.deepEqual(db.documents.get(`redemptionLedger/${hash()}`), legacy);
  assert.equal(db.documents.get(`users/${uid}`).redeemedAt, legacy.redeemedAt);
  await rejectsWithoutWrites(db, 'FIRST', 'already_redeemed');
});

test('legacy uid lock survives an email change even without an email ledger', async () => {
  const db = fakeFirestore({ [`users/${uid}`]: { redeemedCode: 'FIRST' } });
  await redeem(db, 'SECOND', { email: 'changed@example.com' });
  await rejectsWithoutWrites(db, 'FIRST', 'already_redeemed', { email: 'changed@example.com' });
});

test('legacy email-only history blocks the same code after account recreation, not different codes', async () => {
  const db = fakeFirestore({ [`redemptionLedger/${hash()}`]: { uid: 'deleted-user', code: 'FIRST' } });
  await rejectsWithoutWrites(db, 'FIRST', 'already_redeemed');
  await redeem(db, 'SECOND');
});

test('email ledger prevents reuse through Gmail aliases and a recreated account', async () => {
  const db = fakeFirestore();
  await redeem(db, 'FIRST', { email: 'C.off.ee+one@gmail.com' });
  db.documents.delete(`users/${uid}`);
  db.documents.delete(`users/${uid}/redemptions/FIRST`);
  await rejectsWithoutWrites(db, 'FIRST', 'already_redeemed', {
    uid: 'new-user', email: 'coffee+two@googlemail.com',
  });
  await redeem(db, 'SECOND', { uid: 'new-user', email: 'coffee+two@googlemail.com' });
});

test('uid history prevents reuse of a later code after changing email', async () => {
  const db = fakeFirestore();
  await redeem(db, 'FIRST');
  await redeem(db, 'SECOND');
  await redeem(db, 'THIRD');
  await rejectsWithoutWrites(db, 'SECOND', 'already_redeemed', { email: 'changed@example.com' });
});

test('expired grants start the new duration now, rather than at the old expiry', async () => {
  const db = fakeFirestore({ [`users/${uid}`]: {
    redeemedCode: 'FIRST',
    subscription: { status: 'active', plan: 'pro_1week', lastEventType: 'REDEMPTION_CODE', expiresAt: '2020-01-01' },
  } });
  const before = Date.now();
  const result = await redeem(db, 'SECOND');
  assert.ok(Date.parse(result.expiresAt) >= before + 365 * DAY);
  assert.ok(Date.parse(result.expiresAt) <= Date.now() + 365 * DAY);
});

for (const [name, sub] of [
  ['paid subscription', { lastEventType: 'INITIAL_PURCHASE' }],
  ['paid trial', { status: 'trial', lastEventType: 'TRIAL_STARTED' }],
  ['paid subscription with a leftover grantedCode', { lastEventType: 'RENEWAL', grantedCode: 'FIRST' }],
  ['different promotional tier', { plan: 'pro_1year' }],
  ['lifetime promotional access', { expiresAt: null }],
  ['invalid promotional expiry', { expiresAt: 'invalid' }],
  ['invalid existing plan', { plan: 123 }],
]) {
  test(`does not overwrite ${name} or consume the code`, async () => {
    const db = fakeFirestore({ [`users/${uid}`]: { subscription: {
      status: 'active', plan: 'ultra_1year', lastEventType: 'REDEMPTION_CODE',
      expiresAt: '2090-01-01T00:00:00.000Z', ...sub,
    } } });
    await rejectsWithoutWrites(db, 'SECOND', 'has_active_subscription');
  });
}

for (const [name, value, error] of [
  ['exhausted', { useCount: 10 }, 'code_exhausted'],
  ['disabled', { active: false }, 'invalid_code'],
  ['expired', { codeExpiresAt: '2020-01-01' }, 'invalid_code'],
  ['invalid duration', { durationDays: -1 }, 'invalid_code'],
]) {
  test(`${name} codes do not mutate subscription or history`, async () => {
    const db = fakeFirestore({ 'redemptionCodes/SECOND': codeData(value) });
    await rejectsWithoutWrites(db, 'SECOND', error);
  });
}

test('parallel requests for the same account/code grant once', async () => {
  const db = fakeFirestore();
  const results = await Promise.allSettled([redeem(db, 'FIRST'), redeem(db, 'FIRST')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already_redeemed');
  assert.equal(db.documents.get('redemptionCodes/FIRST').useCount, 1);
  assert.ok(db.retries > 0);
});

test('parallel different codes accumulate both durations without losing a grant', async () => {
  const db = fakeFirestore();
  const before = Date.now();
  await Promise.all([redeem(db, 'FIRST'), redeem(db, 'SECOND')]);
  const expiry = Date.parse(db.documents.get(`users/${uid}`).subscription.expiresAt);
  assert.ok(expiry >= before + 395 * DAY && expiry <= Date.now() + 395 * DAY);
  for (const code of ['FIRST', 'SECOND']) await rejectsWithoutWrites(db, code, 'already_redeemed');
  assert.ok(db.retries > 0);
});

test('parallel requests from two accounts cannot exceed a code cap', async () => {
  const db = fakeFirestore({ 'redemptionCodes/FIRST': codeData({ maxUses: 1 }) });
  const results = await Promise.allSettled([
    redeem(db, 'FIRST'), redeem(db, 'FIRST', { uid: 'other', email: 'other@example.com' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'code_exhausted');
  assert.equal(db.documents.get('redemptionCodes/FIRST').useCount, 1);
});

test('parallel Gmail aliases on different accounts cannot reuse a code', async () => {
  const db = fakeFirestore();
  const results = await Promise.allSettled([
    redeem(db, 'FIRST', { email: 'c.offee@gmail.com' }),
    redeem(db, 'FIRST', { uid: 'alias', email: 'coffee+alias@googlemail.com' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already_redeemed');
  assert.equal(db.documents.get('redemptionCodes/FIRST').useCount, 1);
});

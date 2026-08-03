import assert from 'node:assert/strict';
import { createKeyedLatestWriteQueue, createLatestWriteQueue } from '../src/lib/latestWriteQueue.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const queue = createLatestWriteQueue();
const oldWrite = deferred();
let active = 'old';
let persisted = null;
const old = queue.enqueue({
  isCurrent: () => active === 'old',
  write: async () => { await oldWrite.promise; persisted = 'old'; },
});
await Promise.resolve();
active = 'new';
const newer = queue.enqueue({
  isCurrent: () => active === 'new',
  write: async () => { persisted = 'new'; },
});
oldWrite.resolve();
await Promise.all([old, newer]);
assert.equal(persisted, 'new');

active = 'third';
const skipped = queue.enqueue({ isCurrent: () => false, write: async () => { persisted = 'wrong'; } });
const latest = queue.enqueue({ isCurrent: () => active === 'third', write: async () => { persisted = 'third'; } });
assert.deepEqual(await skipped, { skipped: true });
await latest;
assert.equal(persisted, 'third');

const keyed = createKeyedLatestWriteQueue();
const beanAFirstWrite = deferred();
const beanAStarted = deferred();
const events = [];
const beanAOld = keyed.enqueue('bean-a', { write: async () => {
  beanAStarted.resolve();
  await beanAFirstWrite.promise;
  events.push('bean-a-old');
} });
await beanAStarted.promise;
const beanANew = keyed.enqueue('bean-a', { write: async () => { events.push('bean-a-new'); } });
const beanB = keyed.enqueue('bean-b', { write: async () => { events.push('bean-b'); } });
await beanB;
assert.deepEqual(events, ['bean-b'], 'another bean must not wait on Bean A');
beanAFirstWrite.resolve();
await Promise.all([beanAOld, beanANew]);
assert.deepEqual(events, ['bean-b', 'bean-a-old', 'bean-a-new']);

const closeSafe = createKeyedLatestWriteQueue();
const closeBlock = deferred();
const closeStarted = deferred();
let closePersisted = null;
const closingOld = closeSafe.enqueue('bean-close', { write: async () => {
  closeStarted.resolve();
  await closeBlock.promise;
  closePersisted = 'old';
} });
await closeStarted.promise;
const closingNew = closeSafe.enqueue('bean-close', { write: async () => { closePersisted = 'new'; } });
// No UI request token participates in persistence ownership, so a modal close
// cannot invalidate the already-generated newest write.
closeBlock.resolve();
await Promise.all([closingOld, closingNew]);
assert.equal(closePersisted, 'new');

const partialPayloadQueue = createKeyedLatestWriteQueue();
const payloadBlock = deferred();
const payloadStarted = deferred();
const persistedFields = {};
const blocker = partialPayloadQueue.enqueue('same-bean', { write: async () => {
  payloadStarted.resolve();
  await payloadBlock.promise;
} });
await payloadStarted.promise;
const kalitaWrite = partialPayloadQueue.enqueue('same-bean', { write: async () => { persistedFields.kalita = 'new-kalita'; } });
const v60Write = partialPayloadQueue.enqueue('same-bean', { write: async () => { persistedFields.v60 = 'new-v60'; } });
payloadBlock.resolve();
await Promise.all([blocker, kalitaWrite, v60Write]);
assert.deepEqual(persistedFields, { kalita: 'new-kalita', v60: 'new-v60' }, 'different device payloads for one bean must both persist');

console.log('latest write queue passed');

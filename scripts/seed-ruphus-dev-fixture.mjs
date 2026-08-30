#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ROOT, loadFixtureManifest } from './ruphus-conversation-runner.mjs';

export function assertDevTarget({ projectId, fixtureUid, authorized = false } = {}) {
  if (!authorized) throw new Error('fixture seeding requires explicit Dev authorization');
  if (!projectId || !fixtureUid) throw new Error('fixture seeding requires a Dev project and fixture UID');
  if (!/\b(?:dev|development|staging|test)\b/i.test(projectId) || /prod|production|live/i.test(projectId)) throw new Error('fixture seeding refuses a non-Dev project');
  if (/prod|production|live/i.test(fixtureUid)) throw new Error('fixture seeding refuses a production-like fixture UID');
  return true;
}

export function rewriteRelativeDates(value, now = new Date()) {
  if (Array.isArray(value)) return value.map((item) => rewriteRelativeDates(item, now));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteRelativeDates(item, now)]));
  if (typeof value !== 'string') return value;
  const match = value.match(/^-(\d+)d$/);
  if (!match) return value;
  const date = new Date(now.getTime() - Number(match[1]) * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

export function buildSeedPlan(account, { fixtureUid, now = new Date() } = {}) {
  if (!fixtureUid) throw new Error('fixture UID is required');
  const seeded = rewriteRelativeDates(account, now);
  const collections = ['coffees', 'recipes', 'brews', 'tastings', 'attempts'];
  const operations = [{ path: `users/${fixtureUid}`, data: { setup: seeded.setup, manifestVersion: seeded.manifestVersion, manifestHash: seeded.manifestHash } }];
  for (const collection of collections) {
    const records = seeded[collection];
    if (!records) continue;
    if (Array.isArray(records)) for (const record of records) operations.push({ path: `users/${fixtureUid}/${collection}/${record.id}`, data: record });
    else for (const [id, record] of Object.entries(records)) operations.push({ path: `users/${fixtureUid}/${collection}/${id}`, data: record });
  }
  return operations;
}

export async function seedFixture({ projectId, fixtureUid, authorized = false, root = FIXTURE_ROOT, now = new Date(), write = null } = {}) {
  assertDevTarget({ projectId, fixtureUid, authorized });
  const { account } = await loadFixtureManifest(root);
  const operations = buildSeedPlan(account, { fixtureUid, now });
  if (!write) return { dryRun: true, manifestHash: account.manifestHash, operations };
  for (const operation of operations) await write(operation.path, operation.data);
  return { dryRun: false, manifestHash: account.manifestHash, operations: operations.length };
}

async function seedFirestore({ projectId, fixtureUid, root }) {
  const [{ initializeApp }, { getFirestore }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  return seedFixture({ projectId, fixtureUid, authorized: true, root, write: (path, data) => db.doc(path).set(data, { merge: true }) });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const projectId = process.env.RUPHUS_DEV_PROJECT_ID;
    const fixtureUid = process.env.RUPHUS_DEV_FIXTURE_UID;
    const authorized = process.env.RUPHUS_DEV_SEED_AUTHORIZED === 'true';
    assertDevTarget({ projectId, fixtureUid, authorized });
    const result = await seedFirestore({ projectId, fixtureUid, root: process.env.RUPHUS_FIXTURE_ROOT || FIXTURE_ROOT });
    console.log(JSON.stringify({ seeded: true, manifestHash: result.manifestHash, operations: result.operations }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

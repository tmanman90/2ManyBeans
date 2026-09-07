#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ROOT, loadFixtureManifest } from './ruphus-conversation-runner.mjs';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { SLOT_DEFINITIONS } from '../src/lib/ruphus/legacyRecipeResolver.js';

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

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)]));
  return value;
}

export function executableFixtureRecipe(recipe = {}, slotKey = recipe.slot) {
  if (!['kalita_hot', 'v60_hot'].includes(slotKey)) return recipe;
  const dose = Number(recipe.dose ?? recipe.coffeeGrams);
  const water = Number(recipe.water ?? recipe.waterGrams);
  const temperature = Number(recipe.temperature ?? recipe.temperatureC ?? recipe.waterTemp?.celsius);
  const ratio = Number.isFinite(dose) && Number.isFinite(water) && dose > 0 ? water / dose : 16;
  const grinder = 'fellow-ode-gen2';
  const generated = slotKey === 'kalita_hot'
    ? generateKalitaRecipe({ targetRatio: ratio, targetTemperatureC: temperature }, { dose, size: dose <= 18 ? '155' : '185', grinder })
    : generateV60Recipe({ targetRatio: ratio, targetTemperatureC: temperature }, { dose, grinder });
  const steps = generated.steps.map((step, index) => index === generated.steps.length - 1 ? { ...step, waterTotal: water } : step);
  const grindSetting = String(recipe.grind || '').match(/\d+(?:\.\d+)?/)?.[0] || generated.grindSize?.setting;
  return {
    ...generated,
    slot: slotKey,
    displayName: recipe.displayName,
    method: slotKey.startsWith('kalita') ? 'kalita' : 'v60',
    device: slotKey.startsWith('kalita') ? 'kalita' : 'v60',
    mode: 'hot',
    coffeeGrams: dose,
    waterGrams: water,
    ratio: recipe.ratio || `1:${Math.round(ratio * 10) / 10}`,
    waterTemp: { celsius: temperature, fahrenheit: Math.round(temperature * 9 / 5 + 32) },
    grindSize: { ...generated.grindSize, setting: grindSetting },
    steps,
  };
}

export function buildSeedPlan(account, { fixtureUid, now = new Date() } = {}) {
  if (!fixtureUid) throw new Error('fixture UID is required');
  const seeded = rewriteRelativeDates(account, now);
  // Mirror the production readers exactly: beans, recipeRevisions, tastings,
  // and brewAttempts. The fixture account remains a source manifest only.
  const profile = {
    displayName: 'Ruphus Dev Fixture',
    username: null,
    preferences: { brewMethod: seeded.setup?.defaultMethod || null, grinder: seeded.setup?.grinder || null, units: seeded.setup?.units || 'metric' },
    subscription: {
      status: 'active',
      plan: 'pro-dev-fixture',
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      source: 'ruphus-dev-fixture',
    },
  };
  const operations = [{ path: `users/${fixtureUid}`, data: profile }];
  for (const coffee of seeded.coffees || []) {
    const activeRevisionIds = Object.fromEntries(Object.keys(seeded.recipes || {}).filter((ref) => ref.startsWith(`${coffee.id}:`)).map((ref) => [ref.slice(coffee.id.length + 1), ref]));
    const data = { ...coffee, ...(Object.keys(activeRevisionIds).length ? { activeRevisionIds } : {}) };
    for (const [slotKey, ref] of Object.entries(activeRevisionIds)) {
      const path = SLOT_DEFINITIONS[slotKey]?.path;
      if (!path) continue;
      const snapshot = withoutUndefined(executableFixtureRecipe(seeded.recipes[ref], slotKey));
      if (path.length === 1) data[path[0]] = snapshot;
      else data[path[0]] = { ...(data[path[0]] || {}), [path[1]]: snapshot };
    }
    operations.push({ path: `users/${fixtureUid}/beans/${coffee.id}`, data });
  }
  for (const [ref, recipe] of Object.entries(seeded.recipes || {})) {
    const [coffeeId, slotKey] = ref.split(':');
    const snapshot = withoutUndefined(executableFixtureRecipe(recipe, recipe.slot || slotKey));
    operations.push({ path: `users/${fixtureUid}/recipeRevisions/${ref}`, data: { id: ref, coffeeId, slotKey: recipe.slot || slotKey, snapshot, snapshotHash: canonicalHash(snapshot) } });
  }
  for (const tasting of seeded.tastings || []) operations.push({ path: `users/${fixtureUid}/tastings/${tasting.id}`, data: { ...tasting, beanId: tasting.beanId || tasting.coffeeId } });
  for (const attempt of [...(seeded.brews || []), ...(seeded.attempts || [])]) operations.push({ path: `users/${fixtureUid}/brewAttempts/${attempt.id}`, data: attempt });
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

// A conversation-only stage must not inherit trial attempts from earlier UI
// action tests. Resolve every deletion first; never operate on an owner account.
export function fixtureAttemptCleanup({ projectId, fixtureUid, authorized, profile, account, documents }) {
  assertDevTarget({ projectId, fixtureUid, authorized });
  if (profile?.subscription?.source !== 'ruphus-dev-fixture') throw new Error('attempt reset requires the dedicated fixture profile');
  const prefix = `projects/${projectId}/databases/(default)/documents/users/${fixtureUid}/brewAttempts/`;
  const retained = new Set([...(account.brews || []), ...(account.attempts || [])].map(item => item.id));
  return documents.flatMap(document => {
    const name = document.name;
    if (typeof name !== 'string' || !name.startsWith(prefix) || !name.slice(prefix.length) || name.slice(prefix.length).includes('/')) throw new Error('attempt reset refuses a foreign document');
    return retained.has(name.slice(prefix.length)) ? [] : [name];
  });
}

export async function createFirestoreSessionReset({ projectId, fixtureUid, db: providedDb = null } = {}) {
  assertDevTarget({ projectId, fixtureUid, authorized: true });
  let db = providedDb;
  if (!db) {
    const [{ getApps, initializeApp }, { getFirestore }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
    const app = getApps().find((candidate) => candidate.options.projectId === projectId) || initializeApp({ projectId }, `ruphus-u3-${fixtureUid}`);
    db = getFirestore(app);
  }
  return async ({ fixture, session = null } = {}) => {
    const now = Date.now();
    const ageDays = Number(session?.lastActivityOffsetDays) || 0;
    const storedMessages = Array.isArray(session?.messages) ? session.messages : [];
    const boundaryIndex = Number.isInteger(session?.boundaryIndex) ? session.boundaryIndex : 0;
    const resetAt = new Date(now).toISOString();
    await Promise.all([db.collection('users').doc(fixtureUid).collection('chatSessions').doc('active').set({
      protocolVersion: 1, messages: storedMessages, turns: Array.isArray(session?.turns) ? session.turns : [], contextRef: fixture?.launchContext || null, launchContext: fixture?.launchContext || null,
      ledger: session?.ledger || { version: 1, entries: [], namedCoffees: [], bytes: 0 }, boundaryIndex, lastActivityAt: Number.isFinite(Number(session?.lastActivityAt)) ? Number(session.lastActivityAt) : now - ageDays * 24 * 60 * 60 * 1000,
      launchHintConsumed: false, historyWidened: false, updatedAt: now,
    }), db.collection('users').doc(fixtureUid).collection('rateLimits').doc('claude').set({ count: 0, windowStart: resetAt, updatedAt: resetAt })]);
  };
}

export async function verifySeededFixture({ projectId, fixtureUid } = {}) {
  assertDevTarget({ projectId, fixtureUid, authorized: true });
  const [{ getApps, initializeApp }, { getFirestore }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/firestore')]);
  const app = getApps().find((candidate) => candidate.options.projectId === projectId) || initializeApp({ projectId }, `ruphus-u3-verify-${fixtureUid}`);
  const db = getFirestore(app);
  const { firestoreReaders } = await import('../api/ruphus-agent.js');
  const readers = firestoreReaders(db);
  const [coffees, setup, revisions] = await Promise.all([
    readers.listCoffees({ uid: fixtureUid }), readers.readSetup({ uid: fixtureUid }), db.collection('users').doc(fixtureUid).collection('recipeRevisions').get(),
  ]);
  if (!coffees.length || revisions.empty || !setup.defaultMethod || !setup.grinder || !setup.units) throw new Error('seeded Dev fixture read-back is incomplete');
  return { beans: coffees.length, recipeRevisions: revisions.size, setup: { defaultMethod: setup.defaultMethod, grinder: setup.grinder, units: setup.units } };
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

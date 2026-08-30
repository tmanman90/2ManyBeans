#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import {
  gradeReply, fixtureManifestShape, validateLaunchContext, CONTRACT_VERSION,
} from '../src/lib/ruphus/conversationContract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = join(HERE, 'fixtures', 'ruphus-conversation');
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const cloneWithout = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));

export function fixtureHash(account) {
  return canonicalHash(cloneWithout(account, ['manifestHash']));
}

export function validateFixtureCase(fixture, ids = new Set()) {
  if (!object(fixture) || typeof fixture.id !== 'string' || !/^AE(?:0[1-9]|1[0-4])$/.test(fixture.id)) throw new Error('fixture id must be AE01 through AE14');
  if (ids.has(fixture.id)) throw new Error(`duplicate fixture ${fixture.id}`);
  ids.add(fixture.id);
  if (typeof fixture.intent !== 'string' || !Array.isArray(fixture.turns) || fixture.turns.length === 0) throw new Error(`fixture ${fixture.id} requires intent and turns`);
  const launch = validateLaunchContext(fixture.launchContext);
  if (!launch.valid) throw new Error(`${fixture.id}: ${launch.errors.join('; ')}`);
  if (fixture.critical !== true && fixture.critical !== false) throw new Error(`${fixture.id}: critical classification is required`);
  return true;
}

export function assertFixtureIntegrity(account, cases) {
  const shape = fixtureManifestShape(account, cases);
  if (!shape.valid) throw new Error(shape.errors.join('; '));
  const expected = fixtureHash(account);
  if (typeof account.manifestHash !== 'string' || account.manifestHash !== expected) throw new Error('fixture account manifest hash mismatch; bump manifest version and regenerate hash');
  if (cases.manifestHash !== expected) throw new Error('fixture cases manifest hash mismatch; bump manifest version and regenerate hash');
  const ids = new Set();
  for (const fixture of cases.cases) validateFixtureCase(fixture, ids);
  if (ids.size !== 14 || !['AE01','AE02','AE03','AE04','AE05','AE06','AE07','AE08','AE09','AE10','AE11','AE12','AE13','AE14'].every((id) => ids.has(id))) throw new Error('fixture ids must be exactly AE01 through AE14');
  const critical = cases.cases.filter((fixture) => fixture.critical);
  if (critical.length !== 11 || cases.cases.filter((fixture) => !fixture.critical).length !== 3) throw new Error('fixture set must contain eleven critical and three supporting cases');
  return true;
}

export async function loadFixtureManifest(root = FIXTURE_ROOT) {
  const [account, cases] = await Promise.all([
    readFile(join(root, 'dev-account.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'cases.json'), 'utf8').then(JSON.parse),
  ]);
  assertFixtureIntegrity(account, cases);
  return { account, cases };
}

export function fixtureFactSheet(account) {
  return account.coffees.map((coffee) => {
    const recipes = (coffee.recipes || []).map((slot) => account.recipes[`${coffee.id}:${slot}`]?.displayName || slot).join(', ') || 'none';
    return `Jar ${coffee.jarSlot ?? 'off rotation'}: ${coffee.name} — ${coffee.roaster}, ${coffee.origin}, ${coffee.process}; ${recipes}; last brew ${coffee.lastBrewDate || 'none'}.`;
  }).join('\n');
}
export const factSheet = fixtureFactSheet;

export function parseTranscript(markdown) {
  const transcript = [];
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(User|Ruphus|Assistant)\s*:\s*(.*?)\s*$/i);
    if (!match || !match[2]) continue;
    transcript.push({ role: /^user$/i.test(match[1]) ? 'user' : 'assistant', text: match[2] });
  }
  return transcript;
}

export async function loadTranscript(file) {
  return parseTranscript(await readFile(file, 'utf8'));
}

export function redactDiagnostic(value) {
  return JSON.stringify(value ?? null)
    .replace(/(?:sk|pk|api[_-]?key|token|authorization|bearer)[^,}\s]*/gi, '[REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/\b(?:uid|user)[_-][A-Za-z0-9_-]+\b/gi, '[REDACTED_UID]');
}

function fixtureContext(account, fixture) {
  const id = fixture.launchContext?.coffeeRef || account.coffees.find((coffee) => coffee.jarSlot === 1)?.id || account.coffees[0].id;
  const coffee = account.coffees.find((item) => item.id === id) || account.coffees[0];
  const slot = fixture.launchContext?.launchItem?.method || coffee.recipes?.[0];
  return {
    context: { coffeeId: coffee.id, slotKey: slot || 'v60_hot', method: String(slot || 'v60_hot').split('_')[0], sessionId: 'injected-session' },
    coffee,
    recipe: slot ? account.recipes[`${coffee.id}:${slot}`] || null : null,
    tastings: account.tastings.filter((item) => item.coffeeId === coffee.id),
    attempts: account.attempts.filter((item) => item.coffeeId === coffee.id),
    evidenceHash: fixture.id,
  };
}

function defaultProvider(fixture, reply) {
  return { runTurn: async () => ({ text: reply || `Got it. I’m ready to talk through ${fixture.intent.toLowerCase()}.`, toolCalls: [], model: 'injected-fixture-provider' }) };
}

function defaultTools(account, fixture) {
  return createRuphusTools({ uid: 'dev-fixture-owner', context: fixtureContext(account, fixture) });
}

/** Run one case through the production orchestrator with provider/tool seams injected. */
export async function runInjectedTurn(account, fixture, { reply = null, provider = null, tools = null, emit = null } = {}) {
  const frames = [];
  const result = await runRuphusTurn({
    turnId: `injected-${fixture.id}`,
    context: fixtureContext(account, fixture),
    userText: fixture.turns.at(-1),
    provider: provider || defaultProvider(fixture, reply),
    tools: tools || defaultTools(account, fixture),
    emit: (frame) => { frames.push(frame); emit?.(frame); },
  });
  const graded = gradeReply({ reply: result.text, replyKind: 'default', userTurn: fixture.turns.at(-1), frames });
  return { mode: 'injected', label: 'plumbing only', fixtureId: fixture.id, transcript: [{ role: 'user', text: fixture.turns.at(-1) }, { role: 'assistant', text: result.text }], frames, orchestrator: result, grader: graded };
}

// Synchronous-shaped compatibility helper for callers that only need the
// fixture/schema check. Provider-backed execution is available via the async
// runInjectedTurn API above.
export function runInjectedCase(fixture, { reply = null, provider = null, tools = null } = {}) {
  validateFixtureCase(fixture, new Set());
  if (provider || tools) return { mode: 'injected', label: 'plumbing only', fixtureId: fixture.id, providerInjected: Boolean(provider), toolsInjected: Boolean(tools), pending: true };
  const text = reply ?? `Got it. Plumbing check for ${fixture.id}.`;
  const grader = gradeReply({ reply: text, replyKind: 'default', userTurn: fixture.turns.at(-1) });
  return { mode: 'injected', label: 'plumbing only', fixtureId: fixture.id, providerInjected: false, toolsInjected: false, transcript: [{ role: 'user', text: fixture.turns.at(-1) }, { role: 'assistant', text }], grader };
}

export async function runInjectedCorpus(root = FIXTURE_ROOT) {
  const { account, cases } = await loadFixtureManifest(root);
  const results = cases.cases.map((fixture) => runInjectedCase(fixture));
  return { mode: 'injected', label: 'plumbing only', contractVersion: CONTRACT_VERSION, manifestVersion: account.manifestVersion, manifestHash: account.manifestHash, results, passed: results.every((result) => result.grader.catastrophic.length === 0) };
}

function parseArgs(argv) {
  const values = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=') || true]; }));
  return { mode: values.mode || 'injected', stage: values.stage || 'smoke', root: values.root || FIXTURE_ROOT };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode !== 'injected') {
    console.error('Live provider mode is reserved for U3 and requires an explicit staged runner configuration.');
    process.exitCode = 2;
  } else {
    try {
      const report = await runInjectedCorpus(options.root);
      console.log(JSON.stringify({ mode: report.mode, label: report.label, stage: options.stage, manifestVersion: report.manifestVersion, fixtures: report.results.length, catastrophicFailures: report.results.reduce((count, result) => count + result.grader.catastrophic.length, 0), ordinaryFailures: report.results.reduce((count, result) => count + result.grader.ordinary.length, 0), passed: report.passed }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}

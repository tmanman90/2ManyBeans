#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { buildRotationSnapshot } from '../api/_lib/ruphusEvidence.js';
import { priceUsage } from '../api/_lib/modelPricing.js';
import { RUPHUS_OPENAI_MODEL } from '../api/_lib/ruphusProviders/openai.js';
import {
  gradeReply, fixtureManifestShape, validateLaunchContext, CONTRACT_VERSION,
} from '../src/lib/ruphus/conversationContract.js';
import { assessCalibration, createAnthropicJudgeAdapter, createBlindJudgePacket, createBlindPairwisePacket, createCalibrationPackets, judgeTranscript, pairwisePass } from './ruphus-conversation-judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = join(HERE, 'fixtures', 'ruphus-conversation');
export const U3_STAGE_RULES = Object.freeze({
  smoke: Object.freeze({ criticalRuns: 1, supportingRuns: 0 }),
  calibration: Object.freeze({ criticalRuns: 3, supportingRuns: 1 }),
  full: Object.freeze({ criticalRuns: 5, supportingRuns: 3 }),
});
export const CRITICAL_FIXTURE_IDS = Object.freeze(['AE01', 'AE02', 'AE03', 'AE04', 'AE05', 'AE06', 'AE07', 'AE08', 'AE09', 'AE10', 'AE14']);
export const SUPPORTING_FIXTURE_IDS = Object.freeze(['AE11', 'AE12', 'AE13']);
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
  const sanitize = (input) => {
    if (Array.isArray(input)) return input.map((item) => sanitize(item));
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([name, item]) => [name, /token|secret|authorization|api[_-]?key|bearer/i.test(name) ? '[REDACTED]' : sanitize(item, name)]));
    if (typeof input !== 'string') return input;
    return input
      .replace(/(?:sk|pk)[-_][A-Za-z0-9._-]+/gi, '[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
      .replace(/\b(?:uid|user)[_-][A-Za-z0-9_-]+\b/gi, '[REDACTED_UID]')
      .replace(/\bfixture-[A-Za-z0-9_-]+\b/g, '[REDACTED_REF]')
      .replace(/\bcanary-[A-Za-z0-9._-]+\b/gi, '[REDACTED]');
  };
  return JSON.stringify(sanitize(value));
}

function fixtureContext(account, fixture) {
  const snapshot = buildRotationSnapshot({ coffees: account.coffees, setup: account.setup });
  const id = fixture.launchContext?.coffeeRef || account.coffees.find((coffee) => coffee.jarSlot === 1)?.id || account.coffees[0].id;
  const coffee = account.coffees.find((item) => item.id === id) || account.coffees[0];
  const slot = fixture.launchContext?.launchItem?.method || coffee.recipes?.[0];
  const coffeeRef = Object.entries(snapshot.refs).find(([, value]) => value === coffee.id)?.[0] || null;
  const launchContext = { ...fixture.launchContext, ...(coffeeRef ? { coffeeRef } : {}) };
  return {
    launchContext,
    rotationSnapshot: snapshot,
    ledger: { version: 1, entries: [], namedCoffees: [], bytes: 0 },
    conversation: [],
    sessionId: 'injected-session',
    evidenceHash: fixture.id,
  };
}

function defaultProvider(_fixture, reply) {
  return { runTurn: async () => ({ text: reply || 'Got it. I’m ready to talk through your coffee.', toolCalls: [], model: 'injected-fixture-provider' }) };
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

export async function runInjectedCorpus(root = FIXTURE_ROOT, { resetSession = async () => {} } = {}) {
  const { account, cases } = await loadFixtureManifest(root);
  const results = [];
  for (const fixture of cases.cases) {
    await resetSession({ fixture, repetition: 1, session: fixture.session || null });
    results.push(await runInjectedTurn(account, fixture));
  }
  return { mode: 'injected', label: 'plumbing only', contractVersion: CONTRACT_VERSION, manifestVersion: account.manifestVersion, manifestHash: account.manifestHash, results, passed: results.every((result) => result.grader.catastrophic.length === 0) };
}

export function stagePlan(stage, { fixtures, fixtureIds = [] } = {}) {
  if (!Object.hasOwn(U3_STAGE_RULES, stage) && stage !== 'targeted') throw new Error(`unknown U3 stage: ${stage}`);
  const source = Array.isArray(fixtures) ? fixtures : [];
  const byId = new Map(source.map((fixture) => [fixture.id, fixture]));
  const critical = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const schedule = [];
  const add = (fixture, repeat, kind = stage) => { for (let index = 1; index <= repeat; index += 1) schedule.push({ fixtureId: fixture.id, critical: fixture.critical, repeat: index, kind }); };
  if (stage === 'smoke') critical(CRITICAL_FIXTURE_IDS).forEach((fixture) => add(fixture, 1));
  if (stage === 'calibration' || stage === 'full') {
    critical(CRITICAL_FIXTURE_IDS).forEach((fixture) => add(fixture, U3_STAGE_RULES[stage].criticalRuns));
    critical(SUPPORTING_FIXTURE_IDS).forEach((fixture) => add(fixture, U3_STAGE_RULES[stage].supportingRuns));
  }
  if (stage === 'targeted') {
    if (!fixtureIds.length) throw new Error('targeted stage requires named fixture IDs');
    for (const fixture of fixtureIds.map((id) => byId.get(id))) {
      if (!fixture) throw new Error('targeted stage contains an unknown fixture');
      add(fixture, fixture.critical ? U3_STAGE_RULES.full.criticalRuns : U3_STAGE_RULES.full.supportingRuns, 'targeted');
    }
    schedule.push(...stagePlan('smoke', { fixtures: source }).map((entry) => ({ ...entry, kind: 'targeted-smoke' })));
  }
  return schedule;
}

export function validateCostCap(costCapUsd) {
  const amount = typeof costCapUsd === 'string' ? Number(costCapUsd) : costCapUsd;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('live U3 stages require an explicit positive cost cap');
  return amount;
}

export function createCostGuard(costCapUsd) {
  const capUsd = validateCostCap(costCapUsd);
  let spentUsd = 0;
  let reservedUsd = 0;
  let sequence = 0;
  const reservations = new Map();
  return {
    get spentUsd() { return spentUsd; },
    get reservedUsd() { return reservedUsd; },
    get remainingUsd() { return capUsd - spentUsd - reservedUsd; },
    assertCanCall() {
      if (spentUsd >= capUsd) throw new Error('U3 cost cap reached; hard stop before another provider call');
      return true;
    },
    charge(amount) {
      if (!Number.isFinite(amount) || amount < 0) throw new Error('provider usage must include a non-negative numeric cost');
      if (spentUsd + reservedUsd + amount > capUsd) throw new Error('U3 cost cap reached; hard stop before another provider call');
      spentUsd += amount;
      return spentUsd;
    },
    reserveMaximum(maximum) {
      if (!Number.isFinite(maximum) || maximum <= 0) throw new Error('U3 dispatch maximum must be derived from priced provider usage');
      if (spentUsd + reservedUsd + maximum > capUsd) throw new Error('U3 cost cap reached; hard stop before dispatch');
      const id = `reservation-${++sequence}`;
      reservations.set(id, maximum); reservedUsd += maximum;
      return id;
    },
    reconcile(id, actual) {
      const maximum = reservations.get(id);
      if (!maximum) throw new Error('unknown U3 cost reservation');
      if (!Number.isFinite(actual) || actual < 0 || actual > maximum) throw new Error('provider usage exceeded its configured dispatch maximum');
      reservations.delete(id); reservedUsd -= maximum; spentUsd += actual;
      return spentUsd;
    },
  };
}

export function configuredCallMaximum({ model = RUPHUS_OPENAI_MODEL, provider = 'openai', inputTokens = process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS, outputTokens = process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS } = {}) {
  const input = Number(inputTokens); const output = Number(outputTokens);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0) throw new Error('U3 dispatch maximum requires configured input and output token caps');
  const usage = provider === 'anthropic' ? { input_tokens: input, output_tokens: output } : { input_tokens: input, output_tokens: output };
  const priced = priceUsage({ model, provider, usage });
  if (!priced || priced.cost <= 0) throw new Error('U3 dispatch maximum could not be priced');
  return priced.cost;
}

async function dispatchMetered(adapter, packet, guard) {
  const provider = adapter.provider || 'anthropic'; const model = adapter.model || process.env.RUPHUS_JUDGE_MODEL || 'claude-sonnet-5';
  const maximum = configuredCallMaximum({ provider, model, inputTokens: process.env.RUPHUS_JUDGE_MAX_INPUT_TOKENS || process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS, outputTokens: process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS || process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS });
  const reservation = guard.reserveMaximum(maximum);
  try {
    const response = await adapter(packet);
    const usage = response?.usage;
    const priced = priceUsage({ provider, model: response?.model || model, usage });
    if (!priced) throw new Error('U3 judge returned incomplete or unpriceable usage');
    guard.reconcile(reservation, priced.cost);
    return response;
  } catch (error) { guard.reconcile(reservation, 0); throw error; }
}

export function smokeIsClean(results) {
  const catastrophic = results.reduce((sum, result) => sum + (result.grader?.catastrophic?.length || 0), 0);
  const ordinaryRuns = results.filter((result) => (result.grader?.ordinary?.length || 0) > 0).length;
  return catastrophic === 0 && ordinaryRuns <= 1;
}

export function fixturePass(results, { critical = true } = {}) {
  const clean = results.filter((result) => !result.grader?.catastrophic?.length && !result.grader?.ordinary?.length).length;
  if (!critical) return clean >= 2;
  const judgePasses = results.filter((result) => result.judge?.mean >= 4 && !Object.values(result.judge?.scores || {}).some((score) => score < 3)).length;
  const pairwiseWins = results.filter((result) => result.pairwise === true).length;
  return clean >= 4 && judgePasses >= 4 && pairwiseWins === results.length;
}

export function fullStagePass(results) {
  const clean = results.filter((result) => !result.grader?.catastrophic?.length && !result.grader?.ordinary?.length).length;
  const byFixture = new Map();
  for (const result of results) byFixture.set(result.fixtureId, [...(byFixture.get(result.fixtureId) || []), result]);
  const fixtureResultsPass = [...byFixture.values()].every((runs) => fixturePass(runs, { critical: runs[0]?.critical !== false }));
  return results.every((result) => !(result.grader?.catastrophic?.length)) && clean >= 58 && fixtureResultsPass;
}

export function targetedStagePass(results, fixtureIds) {
  const smoke = results.filter((result) => result.kind === 'targeted-smoke');
  const named = new Map((fixtureIds || []).map((id) => [id, results.filter((result) => result.kind === 'targeted' && result.fixtureId === id)]));
  return smokeIsClean(smoke) && [...named.values()].every((runs) => runs.length > 0 && fixturePass(runs, { critical: runs[0].critical !== false }));
}

export function canStartFull(ledger, commit) {
  const smokes = (Array.isArray(ledger) ? ledger : []).filter((entry) => entry.stage === 'smoke' && entry.commit === commit);
  const lastTwo = smokes.slice(-2);
  return lastTwo.length === 2 && lastTwo.every((entry) => entry.clean === true);
}

export async function loadSmokeLedger(path) {
  try {
    const entries = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('smoke ledger must be a JSON array');
    return entries;
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function appendSmokeLedger(path, entry) {
  let entries = [];
  try { entries = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(entries)) throw new Error('smoke ledger must be a JSON array');
  entries.push({ stage: 'smoke', commit: String(entry.commit || ''), clean: entry.clean === true, recordedAt: entry.recordedAt || new Date().toISOString() });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return entries;
}

export async function persistRunArtifact(directory, report, runId = `u3-${Date.now()}`) {
  const target = join(directory, runId);
  await mkdir(target, { recursive: true });
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await writeFile(join(target, 'report.json'), `${redactDiagnostic({ ...report, generatedAt, expiresAt, retentionDays: 30 })}\n`, { encoding: 'utf8', flag: 'wx' });
  return target;
}

export function branchAwareTurns({ turns, replies }) {
  const planned = Array.isArray(turns) ? turns : [];
  const actual = Array.isArray(replies) ? replies : [];
  return planned.map((text, index) => {
    const question = actual[index]?.question || (/\?\s*$/.test(String(actual[index]?.text || '')) ? String(actual[index].text).trim() : null);
    const branch = question && actual[index]?.branchAnswer ? actual[index].branchAnswer : text;
    return { text: branch, branch: question ? 'model-question' : 'scripted', unexpectedBranch: Boolean(question && !actual[index]?.expectedQuestion), question: question || null };
  });
}

export function nextBranchTurn(fixture, index, reply) {
  const planned = fixture.turns?.[index + 1];
  const question = reply?.question || (/\?\s*$/.test(String(reply?.text || '')) ? String(reply.text).trim() : null);
  if (!question) return { text: planned, unexpectedBranch: false, question: null };
  const branch = (fixture.branches || []).find((candidate) => new RegExp(candidate.when, 'i').test(question));
  return { text: branch?.answer || planned, unexpectedBranch: !branch, question };
}

export function deriveFixtureTrace({ fixture, frames = [], refMap = {} } = {}) {
  const toolResults = frames.filter((frame) => frame?.type === 'tool_result').map((frame) => frame.result || {}).filter(object);
  const rawActual = toolResults.map((result) => result.coffeeRef || result.actualCoffeeId || result.focusCoffeeId || result.focus?.coffeeRef || result.focus?.coffeeId || result.evidence?.coffeeRef || result.coffee?.id).find(Boolean) || null;
  const actual = refMap[rawActual] || rawActual;
  const expected = fixture?.expected?.focus?.length === 1 ? fixture.expected.focus[0] : null;
  const fabricated = toolResults.some((result) => result.fabricatedEvidence === true || result.evidenceStatus === 'fabricated' || result.evidence?.fabricated === true || (Array.isArray(result.fabricatedFacts) && result.fabricatedFacts.length > 0));
  return { expectedCoffeeId: expected, actualCoffeeId: actual, focusCoffeeId: actual, fabricatedEvidence: fabricated };
}

export async function runLiveEndpointTurn({ endpoint, token, payload, fetchImpl = globalThis.fetch }) {
  if (!endpoint || !/^https:\/\//i.test(endpoint)) throw new Error('U3 live endpoint must be HTTPS');
  if (!token) throw new Error('U3 live auth must be injected non-printingly');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for live U3 mode');
  const response = await fetchImpl(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`U3 endpoint returned HTTP ${response.status}`);
  let body;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('ndjson') && typeof response.text === 'function') {
    const frames = (await response.text()).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const completed = frames.find((frame) => frame.type === 'turn_completed');
    const delta = frames.filter((frame) => frame.type === 'text_delta').map((frame) => frame.text || '').join('');
    body = { ...(completed || {}), text: completed?.text || delta, frames, usage: frames.find((frame) => frame.type === 'usage')?.usage || null };
  } else if (typeof response.json === 'function') body = await response.json();
  else throw new Error('U3 endpoint returned an unreadable response');
  if (!body || typeof body.text !== 'string') throw new Error('U3 endpoint returned no visible reply');
  return body;
}

export function createLiveJudgeAdapter({ endpoint = process.env.RUPHUS_JUDGE_ENDPOINT, token = process.env.RUPHUS_JUDGE_AUTH_TOKEN, modelFamily = process.env.RUPHUS_JUDGE_MODEL_FAMILY, providerFamily = process.env.RUPHUS_PROVIDER_MODEL_FAMILY || 'openai', fetchImpl = globalThis.fetch } = {}) {
  if (!endpoint || !token || !modelFamily) throw new Error('U3 calibration requires injected judge endpoint, auth, and model family');
  if (modelFamily === providerFamily) throw new Error('U3 judge must use a different model family from the candidate provider');
  const adapter = async (packet) => {
    if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for the U3 judge');
    const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ modelFamily, promptVersion: packet.promptVersion, packet }) });
    if (!response.ok) throw new Error(`U3 judge returned HTTP ${response.status}`);
    const result = await response.json();
    return result.result || result;
  };
  Object.defineProperty(adapter, 'modelFamily', { value: modelFamily });
  return adapter;
}

export async function runLiveCase(account, fixture, { endpoint, token, costGuard, fetchImpl, onTurn = null } = {}) {
  const context = fixtureContext(account, fixture);
  const transcript = [];
  const results = [];
  const turns = [...fixture.turns];
  for (let index = 0; index < turns.length; index += 1) {
    const userText = turns[index];
    const started = performance.now();
    costGuard?.assertCanCall();
    const maximum = costGuard?.reserveMaximum ? configuredCallMaximum() : null;
    const reservation = maximum ? costGuard.reserveMaximum(maximum) : null;
    let result;
    try { result = await runLiveEndpointTurn({ endpoint, token, fetchImpl, payload: {
      turnId: `live-${fixture.id}-${index + 1}`, contextRef: context.launchContext, userText,
      conversation: transcript.map((turn) => ({ role: turn.role, content: turn.text })), ledger: null, continuePrevious: false,
    } }); } catch (error) { if (reservation) costGuard.reconcile(reservation, 0); throw error; }
    const model = result.model || RUPHUS_OPENAI_MODEL;
    const priced = priceUsage({ model, provider: 'openai', usage: result.usage });
    if (!priced) throw new Error('U3 provider returned incomplete or unpriceable usage; refusing unmetered evidence');
    if (reservation) costGuard.reconcile(reservation, priced.cost); else costGuard?.charge(priced.cost);
    transcript.push({ role: 'user', text: userText }, { role: 'assistant', text: result.text });
    const trace = deriveFixtureTrace({ fixture, frames: result.frames || [], refMap: context.rotationSnapshot?.refs || {} });
    const grader = gradeReply({ reply: result.text, userTurn: userText, frames: result.frames || [], trace, expectedCoffeeId: trace.expectedCoffeeId, actualCoffeeId: trace.actualCoffeeId, priorReplies: transcript.filter((turn) => turn.role === 'assistant').slice(0, -1).map((turn) => ({ reply: turn.text })) });
    const branch = nextBranchTurn(fixture, index, result);
    const turnResult = { fixtureId: fixture.id, turn: index + 1, transcript: structuredClone(transcript), grader, latencyMs: performance.now() - started, costUsd: priced.cost, model, unexpectedBranch: branch.unexpectedBranch, question: branch.question };
    if (branch.unexpectedBranch) {
      turnResult.grader.ordinary.push({ code: 'U3_UNEXPECTED_BRANCH', category: 'ordinary', message: 'model asked an undeclared question branch; fixture stopped' });
      results.push(turnResult);
      onTurn?.(turnResult);
      break;
    }
    results.push(turnResult);
    onTurn?.(turnResult);
    if (branch.question && index + 1 < turns.length) turns[index + 1] = branch.text;
  }
  return { fixtureId: fixture.id, transcript, results, grader: { catastrophic: results.flatMap((result) => result.grader.catastrophic), ordinary: results.flatMap((result) => result.grader.ordinary) } };
}

export async function runLiveStage({ root = FIXTURE_ROOT, stage = 'smoke', fixtureIds = [], endpoint = process.env.RUPHUS_AGENT_ENDPOINT, token = process.env.RUPHUS_DEV_AUTH_TOKEN, costCapUsd, commit = process.env.RUPHUS_COMMIT || 'unknown', ledger = [], fetchImpl, judge = null, pairwise = null, resetSession = null, artifactDirectory = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval'), smokeLedgerPath = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval', 'smoke-ledger.json') } = {}) {
  const cap = validateCostCap(costCapUsd);
  if (typeof resetSession !== 'function') throw new Error('live U3 stage requires a Dev session reset adapter');
  if (stage === 'full' && !canStartFull(ledger, commit)) throw new Error('full U3 stage requires two consecutive clean smokes on the same commit');
  if (stage !== 'smoke' && (typeof judge !== 'function' || judge.modelFamily === 'openai')) throw new Error(`${stage} U3 stage requires the calibrated different-model-family judge`);
  if (stage === 'full' && typeof pairwise !== 'function') throw new Error('full U3 stage requires a blind pairwise judge');
  const { account, cases } = await loadFixtureManifest(root);
  const schedule = stagePlan(stage, { fixtures: cases.cases, fixtureIds });
  const names = { AE01: 'AE01-aiden-jar1', AE02: 'AE02-el-virgil', AE03: 'AE03-method-infer', AE04: 'AE04-method-ask', AE05: 'AE05-watery-kalita', AE06: 'AE06-false-no-tastings', AE07: 'AE07-stale-session', AE08: 'AE08-reader-outage', AE09: 'AE09-proposal-timing', AE10: 'AE10-pronouns', AE14: 'AE14-launch-hint-vs-brew' };
  const guard = createCostGuard(cap);
  if (stage !== 'smoke') {
    const references = { gold: [], knownBad: [] }; const goldIds = new Set();
    for (const fixture of cases.cases.filter((item) => item.critical)) {
      for (const kind of ['gold', 'knownBad']) references[kind].push({ id: fixture.id, intent: fixture.intent, factSheet: fixtureFactSheet(account), transcript: await loadTranscript(join(root, kind === 'gold' ? 'gold' : 'known-bad', `${names[fixture.id]}.md`)) });
    }
    const goldPackets = createCalibrationPackets({ gold: references.gold, knownBad: references.knownBad, factSheet: fixtureFactSheet(account), seed: `${commit}:calibration` });
    const goldPacketIds = new Set(references.gold.map((item) => createBlindJudgePacket({ ...item, id: `${item.id}:gold`, seed: `${commit}:calibration` }).packetId));
    const calibrationResults = [];
    for (const packet of goldPackets) calibrationResults.push({ kind: goldPacketIds.has(packet.packetId) ? 'gold' : 'knownBad', result: await dispatchMetered(judge, packet, guard) });
    // Split only after dispatch, keeping calibration labels out of packets.
    const calibration = assessCalibration({ goldResults: calibrationResults.filter((item) => item.kind === 'gold').map((item) => item.result), knownBadResults: calibrationResults.filter((item) => item.kind === 'knownBad').map((item) => item.result) });
    if (!calibration.calibrated) throw new Error('U3 judge calibration failed; candidate scoring is blocked');
  }
  const results = [];
  for (const run of schedule) {
    const fixture = cases.cases.find((item) => item.id === run.fixtureId);
    await resetSession({ fixture, repetition: run.repeat, stage, session: fixture.session || null });
    const candidate = await runLiveCase(account, fixture, { endpoint, token, costGuard: guard, fetchImpl });
    const transcript = candidate.transcript;
    if (judge && stage !== 'smoke') {
      const packet = createBlindJudgePacket({ id: fixture.id, intent: fixture.intent, factSheet: fixtureFactSheet(account), transcript, seed: `${commit}:${run.fixtureId}:${run.repeat}` });
      const judged = await judgeTranscript({ judge: async (input) => dispatchMetered(judge, input, guard), packet });
      candidate.judge = judged.sufficient ? judged.result : null;
    }
    if (pairwise && fixture.critical && stage === 'full') {
      const reference = await loadTranscript(join(root, 'known-bad', `${names[fixture.id]}.md`));
      const packet = createBlindPairwisePacket({ candidate: transcript, reference, intent: fixture.intent, factSheet: fixtureFactSheet(account), seed: `${commit}:${run.fixtureId}:${run.repeat}` });
      const pairwiseResult = await dispatchMetered(pairwise, packet, guard);
      candidate.pairwise = pairwisePass(pairwiseResult?.result || pairwiseResult, packet);
    }
    results.push({ ...candidate, stage, kind: run.kind, commit, repeat: run.repeat, critical: fixture.critical });
    if (artifactDirectory) await persistRunArtifact(artifactDirectory, { ...candidate, stage, kind: run.kind, commit, repeat: run.repeat, critical: fixture.critical }, `${stage}-${run.kind}-${String(commit).replace(/[^A-Za-z0-9_-]/g, '_')}-${fixture.id}-${run.repeat}`);
  }
  const report = { stage, commit, manifestVersion: account.manifestVersion, manifestHash: account.manifestHash, results, costUsd: guard.spentUsd, clean: smokeIsClean(results), passed: stage === 'calibration' ? false : stage === 'full' ? fullStagePass(results) : stage === 'targeted' ? targetedStagePass(results, fixtureIds) : smokeIsClean(results) };
  if (artifactDirectory) await persistRunArtifact(artifactDirectory, report);
  if (stage === 'smoke' && smokeLedgerPath) await appendSmokeLedger(smokeLedgerPath, { commit, clean: report.clean });
  return report;
}

function parseArgs(argv) {
  const values = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=') || true]; }));
  return { mode: values.mode || 'injected', stage: values.stage || 'smoke', root: values.root || FIXTURE_ROOT, costCapUsd: values['cost-cap-usd'], fixtures: values.fixtures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'live') {
    try {
      const fixtureIds = options.fixtures ? String(options.fixtures).split(',') : [];
      const { createFirestoreSessionReset, verifySeededFixture } = await import('./seed-ruphus-dev-fixture.mjs');
      const projectId = process.env.RUPHUS_DEV_PROJECT_ID; const fixtureUid = process.env.RUPHUS_DEV_FIXTURE_UID;
      await verifySeededFixture({ projectId, fixtureUid });
      const resetSession = await createFirestoreSessionReset({ projectId, fixtureUid });
      const judge = options.stage === 'smoke' ? null : createAnthropicJudgeAdapter({});
      validateCostCap(options.costCapUsd);
      const smokeLedgerPath = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval', 'smoke-ledger.json');
      const ledger = options.stage === 'full' ? await loadSmokeLedger(smokeLedgerPath) : [];
      const report = await runLiveStage({ stage: options.stage, root: options.root, fixtureIds, costCapUsd: options.costCapUsd, commit: process.env.RUPHUS_COMMIT || 'unknown', ledger, judge, pairwise: judge, resetSession, smokeLedgerPath });
      console.log(redactDiagnostic({ stage: report.stage, commit: report.commit, fixtures: report.results.length, costUsd: report.costUsd, passed: report.passed }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else if (options.mode === 'injected') {
    try {
      const report = await runInjectedCorpus(options.root);
      console.log(JSON.stringify({ mode: report.mode, label: report.label, stage: options.stage, manifestVersion: report.manifestVersion, fixtures: report.results.length, catastrophicFailures: report.results.reduce((count, result) => count + result.grader.catastrophic.length, 0), ordinaryFailures: report.results.reduce((count, result) => count + result.grader.ordinary.length, 0), passed: report.passed }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else {
    console.error('U3 mode must be injected or live.');
    process.exitCode = 2;
  }
}

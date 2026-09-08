#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { buildRotationSnapshot, MAX_TOOL_ROUNDS } from '../api/_lib/ruphusEvidence.js';
import { priceUsage } from '../api/_lib/modelPricing.js';
import { RUPHUS_OPENAI_MODEL } from '../api/_lib/ruphusProviders/openai.js';
import {
  gradeReply, fixtureManifestShape, validateLaunchContext, CONTRACT_VERSION,
} from '../src/lib/ruphus/conversationContract.js';
import { assessCalibration, createAnthropicJudgeAdapter, createBlindJudgePacket, createBlindPairwisePacket, createCalibrationPackets, judgeTranscript, pairwisePass, validateJudgeResult, validatePairwiseResult } from './ruphus-conversation-judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = join(HERE, 'fixtures', 'ruphus-conversation');
export const U3_STAGE_RULES = Object.freeze({
  smoke: Object.freeze({ criticalRuns: 1, supportingRuns: 0 }),
  calibration: Object.freeze({ criticalRuns: 3, supportingRuns: 1 }),
  full: Object.freeze({ criticalRuns: 5, supportingRuns: 3 }),
});
export const CRITICAL_FIXTURE_IDS = Object.freeze(['AE01', 'AE02', 'AE03', 'AE04', 'AE05', 'AE06', 'AE07', 'AE08', 'AE09', 'AE10', 'AE14']);
export const SUPPORTING_FIXTURE_IDS = Object.freeze(['AE11', 'AE12', 'AE13']);
// Owner authorized another $10 on September 8; cumulative, not per run.
export const U3_TOTAL_LIVE_COST_CAP_USD = 55;
export const U3_ENDPOINT_TIMEOUT_MS = 45_000;
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const cloneWithout = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));

export function fixtureHash(account) {
  return canonicalHash(cloneWithout(account, ['manifestHash']));
}

export function validateFixtureCase(fixture, ids = new Set()) {
  if (!object(fixture) || typeof fixture.id !== 'string' || !/^AE(?:0[1-9]|[1-9]\d+)$/.test(fixture.id)) throw new Error('fixture id must be AE01 or a later numbered case');
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
  if (!Array.from({ length: ids.size }, (_, index) => `AE${String(index + 1).padStart(2, '0')}`).every(id => ids.has(id))) throw new Error('fixture ids must preserve the baseline and append consecutively');
  if (cases.cases.some(fixture => (CRITICAL_FIXTURE_IDS.includes(fixture.id) && !fixture.critical) || (SUPPORTING_FIXTURE_IDS.includes(fixture.id) && fixture.critical))) throw new Error('baseline fixture classifications are frozen');
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

export function fixtureFactSheet(account, fixture = null) {
  const summary = account.coffees.map((coffee) => {
    const recipes = (coffee.recipes || []).map((slot) => {
      const recipe = account.recipes[`${coffee.id}:${slot}`] || {};
      return [recipe.displayName || slot, recipe.dose != null ? `${recipe.dose}g coffee` : null, recipe.water != null ? `${recipe.water}g water` : null, recipe.grind || null, recipe.temperature != null ? `${recipe.temperature}C` : null].filter(Boolean).join(', ');
    }).join(' | ') || 'none';
    const tastings = (account.tastings || []).filter((item) => item.coffeeId === coffee.id).map((item) => `${item.date}: ${item.notes || item.note || ''}`).join(' | ') || 'none';
    const brews = (account.brews || []).filter((item) => item.coffeeId === coffee.id).map((item) => `${item.date}: ${item.slot}, ${item.dose}g coffee, ${item.water}g water, ${item.grind}, ${item.drawdown}${item.notes || item.note ? `, note: ${item.notes || item.note}` : ''}`).join(' | ') || 'none';
    const attempts = (account.attempts || []).filter((item) => item.coffeeId === coffee.id).map((item) => `${item.date}: ${item.slot}, ${item.dose}g coffee, ${item.water}g water, ${item.grind}, ${item.drawdown}${item.notes || item.note ? `, attempt note: ${item.notes || item.note}` : ''}`).join(' | ') || 'none';
    return `Jar ${coffee.jarSlot ?? 'off rotation'}: ${coffee.name} — ${coffee.roaster}, ${coffee.origin}, ${coffee.process}; roasted ${coffee.roastDate || 'unknown'}, opened ${coffee.openDate || 'unknown'}; recipes ${recipes}; brews ${brews}; attempts ${attempts}; tastings ${tastings}.`;
  }).join('\n');
  if (!fixture?.trialRecovery) return summary;
  const { coffeeId, slotKey, waterGrams } = fixture.trialRecovery;
  const recipe = account.recipes[`${coffeeId}:${slotKey}`];
  const coffee = account.coffees.find(item => item.id === coffeeId);
  return `${summary}\nCurrent conversation's existing one-brew trial: ${coffee.name}, ${recipe.displayName}, ${recipe.dose} g coffee and ${waterGrams} g water. An older alternative trial uses ${waterGrams - 5} g water. Both timers were started; neither trial was saved permanently. The current chat's receipt identifies the ${waterGrams} g trial. Saved recipe is still ${recipe.water} g water.`;
}
export const factSheet = fixtureFactSheet;

export function parseTranscript(markdown) {
  const transcript = [];
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const card = line.match(/^Native card:\s*(.+)$/);
    if (card) { transcript.push({ role: 'assistant', text: `Visible trial recipe card: ${card[1]}` }); continue; }
    const match = line.match(/^\s*(User|Ruphus|Assistant)\s*:\s*(.*?)\s*$/i);
    if (!match || !match[2]) continue;
    transcript.push({ role: /^user$/i.test(match[1]) ? 'user' : 'assistant', text: match[2] });
  }
  return transcript;
}

function proposalCardSummary(artifact) {
  if (artifact?.type === 'action_receipt' && artifact.mode === 'brew_once' && artifact.status === 'ready') return `Visible trial recipe card: ${artifact.title || 'trial recipe'}; ${artifact.recipe?.coffeeGrams} g coffee, ${artifact.recipe?.waterGrams} g water; Make this my recipe confirmation available; not saved.`;
  if (artifact?.type !== 'recipe_proposal') return null;
  const before = artifact.before || {}; const after = artifact.after || {};
  const beforeGrind = before.grindSize?.setting ?? before.grind ?? null;
  const afterGrind = after.grindSize?.setting ?? after.grind ?? null;
  const changes = [];
  if (beforeGrind != null && afterGrind != null && String(beforeGrind) !== String(afterGrind)) changes.push(`grind ${beforeGrind} to ${afterGrind}`);
  if (before.coffeeGrams != null && after.coffeeGrams != null && before.coffeeGrams !== after.coffeeGrams) changes.push(`dose ${before.coffeeGrams} g to ${after.coffeeGrams} g`);
  if (before.waterGrams != null && after.waterGrams != null && before.waterGrams !== after.waterGrams) changes.push(`water ${before.waterGrams} g to ${after.waterGrams} g`);
  if (before.temperature != null && after.temperature != null && before.temperature !== after.temperature) changes.push(`temperature ${before.temperature}°C to ${after.temperature}°C`);
  return `Visible recipe proposal card: ${after.title || before.title || 'recipe change'}; ${changes.join(', ') || 'one bounded recipe change'}; ready to review, not applied.`;
}

export function judgeVisibleTranscript(candidate = {}) {
  const transcript = Array.isArray(candidate.transcript) ? candidate.transcript : [];
  const turnResults = Array.isArray(candidate.results) ? candidate.results : [];
  const visible = [];
  let assistantIndex = 0;
  for (const turn of transcript) {
    visible.push(turn);
    if (turn?.role !== 'assistant') continue;
    const summaries = (turnResults[assistantIndex]?.frames || []).filter((frame) => frame?.type === 'artifact_ready').map((frame) => proposalCardSummary(frame.artifact)).filter(Boolean);
    for (const summary of summaries) visible.push({ role: 'assistant', text: summary });
    assistantIndex += 1;
  }
  return visible;
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
  const schedule = [];
  const add = (fixture, repeat, kind = stage) => { for (let index = 1; index <= repeat; index += 1) schedule.push({ fixtureId: fixture.id, critical: fixture.critical, repeat: index, kind }); };
  if (stage === 'smoke') source.filter(fixture => fixture.critical).forEach((fixture) => add(fixture, 1));
  if (stage === 'calibration' || stage === 'full') {
    source.filter(fixture => fixture.critical).forEach((fixture) => add(fixture, U3_STAGE_RULES[stage].criticalRuns));
    source.filter(fixture => !fixture.critical).forEach((fixture) => add(fixture, U3_STAGE_RULES[stage].supportingRuns));
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

export function createCostGuard(costCapUsd, { initialSpentUsd = 0, initialReservedUsd = 0, persist = null } = {}) {
  const capUsd = validateCostCap(costCapUsd);
  let spentUsd = Number(initialSpentUsd) || 0;
  let reservedUsd = Number(initialReservedUsd) || 0;
  if (spentUsd < 0 || reservedUsd < 0 || spentUsd + reservedUsd > capUsd) throw new Error('U3 cumulative cost ledger already exceeds its authorized ceiling');
  let sequence = 0;
  const reservations = new Map();
  return {
    get spentUsd() { return spentUsd; },
    get reservedUsd() { return reservedUsd; },
    get remainingUsd() { return capUsd - spentUsd - reservedUsd; },
    snapshot() { return { spentUsd, reservedUsd }; },
    async persistState() { if (typeof persist === 'function') await persist({ spentUsd, reservedUsd }); },
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

export async function loadCumulativeCostLedger(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!value || typeof value !== 'object' || !Number.isFinite(value.spentUsd) || !Number.isFinite(value.reservedUsd || 0)) throw new Error('cumulative U3 cost ledger is invalid');
    return { spentUsd: value.spentUsd, reservedUsd: value.reservedUsd || 0, authorizedCapUsd: value.authorizedCapUsd || U3_TOTAL_LIVE_COST_CAP_USD };
  } catch (error) {
    if (error.code === 'ENOENT') return { spentUsd: 0, reservedUsd: 0, authorizedCapUsd: U3_TOTAL_LIVE_COST_CAP_USD };
    throw error;
  }
}

export async function persistCumulativeCostLedger(path, ledger) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify({ authorizedCapUsd: U3_TOTAL_LIVE_COST_CAP_USD, spentUsd: ledger.spentUsd, reservedUsd: ledger.reservedUsd }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const { rename } = await import('node:fs/promises');
  await rename(temporary, path);
  return ledger;
}

export function configuredCallMaximum({ model = RUPHUS_OPENAI_MODEL, provider = 'openai', inputTokens = process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS, outputTokens = process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS } = {}) {
  const input = Number(inputTokens); const output = Number(outputTokens);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0) throw new Error('U3 dispatch maximum requires configured input and output token caps');
  const usage = provider === 'anthropic' ? { input_tokens: input, output_tokens: output } : { input_tokens: input, output_tokens: output };
  const priced = priceUsage({ model, provider, usage });
  if (!priced || priced.cost <= 0) throw new Error('U3 dispatch maximum could not be priced');
  return priced.cost;
}

// The endpoint may make its initial call, one continuation for each exported
// tool round, and one replacement call after a failed/empty turn. Keep the
// reservation tied to those production constants rather than a runner cap.
export const endpointCallMultiplier = Object.freeze({
  initial: 1,
  continuations: MAX_TOOL_ROUNDS,
  regeneration: 1,
  total: 1 + MAX_TOOL_ROUNDS + 1,
});

async function dispatchMetered(adapter, packet, guard) {
  const provider = adapter.provider || 'anthropic'; const model = adapter.model || process.env.RUPHUS_JUDGE_MODEL || 'claude-sonnet-5';
  const maximum = configuredCallMaximum({ provider, model, inputTokens: process.env.RUPHUS_JUDGE_MAX_INPUT_TOKENS || process.env.RUPHUS_AGENT_MAX_INPUT_TOKENS, outputTokens: process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS || process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS });
  const reservation = guard.reserveMaximum(maximum);
  await guard.persistState?.();
  try {
    const response = await adapter(packet);
    const usage = response?.usage;
    const priced = priceUsage({ provider, model: response?.model || model, usage });
    if (!priced) throw new Error('U3 judge returned incomplete or unpriceable usage');
    guard.reconcile(reservation, priced.cost);
    await guard.persistState?.();
    return response;
  } catch (error) { guard.reconcile(reservation, maximum); await guard.persistState?.(); throw error; }
}

export async function dispatchValidatedJudge(adapter, packet, guard, { dispatch = dispatchMetered, maxAttempts = 2 } = {}) {
  let response = null;
  let lastError = null;
  let requestPacket = packet;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await dispatch(adapter, requestPacket, guard);
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= maxAttempts) throw error;
      continue;
    }
    const result = response?.result || response;
    const validation = packet?.left ? validatePairwiseResult(result) : validateJudgeResult(result);
    if (validation.valid) return response;
    requestPacket = {
      ...packet,
      validationCorrection: `Your previous structured result was invalid: ${validation.errors.join('; ')}. Return every required field in the exact schema, including one short rationale.`,
    };
  }
  if (!response && lastError) throw lastError;
  return response;
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

export function fullStagePass(results, { fixtures = null } = {}) {
  const clean = results.filter((result) => !result.grader?.catastrophic?.length && !result.grader?.ordinary?.length).length;
  const byFixture = new Map();
  for (const result of results) byFixture.set(result.fixtureId, [...(byFixture.get(result.fixtureId) || []), result]);
  const fixtureResultsPass = [...byFixture.values()].every((runs) => fixturePass(runs, { critical: runs[0]?.critical !== false }));
  const baselinePresent = [...CRITICAL_FIXTURE_IDS, ...SUPPORTING_FIXTURE_IDS].every(id => byFixture.has(id));
  const allExpectedPresent = !fixtures || (byFixture.size === fixtures.length && fixtures.every(fixture => byFixture.has(fixture.id) && byFixture.get(fixture.id).every(run => run.critical === fixture.critical)));
  const completeCadence = [...byFixture.values()].every(runs => runs.length === (runs[0]?.critical !== false ? 5 : 3));
  // Preserve the original 58/64 allowance as the suite grows under R29.
  return baselinePresent && allExpectedPresent && completeCadence && results.every((result) => !(result.grader?.catastrophic?.length)) && clean >= results.length - (64 - 58) && fixtureResultsPass;
}

export function gradeTrialRecovery(fixture, frames = []) {
  if (!fixture.trialRecovery) return [];
  const { coffeeId, slotKey, attemptId, waterGrams } = fixture.trialRecovery;
  const cards = frames.filter(frame => frame.type === 'artifact_ready').map(frame => frame.artifact);
  const card = cards.find(item => item?.type === 'action_receipt' && item.mode === 'brew_once');
  if (!card) return [{ code: 'U3_TRIAL_CARD_MISSING', category: 'ordinary', message: 'permanent-save request did not recover a trial confirmation card' }];
  if (card.coffeeId !== coffeeId || card.slotKey !== slotKey || card.attemptId !== attemptId || card.recipe?.waterGrams !== waterGrams) return [{ code: 'U3_WRONG_TRIAL', category: 'catastrophic', message: 'recovered card is not the exact trial requested' }];
  return card.status === 'ready' && card.promoteAvailable === true ? [] : [{ code: 'U3_TRIAL_SAVE_UNAVAILABLE', category: 'ordinary', message: 'recovered trial has no usable save confirmation' }];
}

export function targetedStagePass(results, fixtureIds) {
  const smoke = results.filter((result) => result.kind === 'targeted-smoke');
  const named = new Map((fixtureIds || []).map((id) => [id, results.filter((result) => result.kind === 'targeted' && result.fixtureId === id)]));
  return smokeIsClean(smoke) && [...named.values()].every((runs) => runs.length > 0 && fixturePass(runs, { critical: runs[0].critical !== false }));
}

export function canStartFull(ledger, commit, manifestHash = null) {
  const smokes = (Array.isArray(ledger) ? ledger : []).filter((entry) => entry.stage === 'smoke' && entry.commit === commit && (!manifestHash || entry.manifestHash === manifestHash));
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
  entries.push({ stage: 'smoke', commit: String(entry.commit || ''), manifestHash: entry.manifestHash || null, clean: entry.clean === true, recordedAt: entry.recordedAt || new Date().toISOString() });
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
  const branches = (fixture.branches || []).filter((candidate) => candidate.afterTurn == null || index + 1 >= Number(candidate.afterTurn));
  const sensoryWording = question.replace(/\blacking\s+(aroma|flavou?r)\b/gi, 'little $1');
  const direct = branches.find((candidate) => new RegExp(candidate.when, 'i').test(sensoryWording));
  const proposalPermission = /\b(?:want me to|would you like me to|shall i|should i|want to|would you like to)\b[^?]*(?:propos|prepar|make|set up|recipe change|grind change|try|put[^?]{0,40}forward)/i.test(question);
  const semantic = proposalPermission ? branches.find((candidate) => /propos|prepar|change|want to try|would you like to try|next test|bounded/i.test(candidate.when)) : null;
  const branch = direct || semantic;
  return { text: branch?.answer || planned, unexpectedBranch: !branch, question };
}

function resolveFixtureRef(value, refMap) {
  if (!value) return null;
  if (refMap[value]) return refMap[value];
  return value;
}

function relativeDateAliases(value, now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(instant.getTime())) return String(value || '');
  return String(value || '').replace(/-(\d+)d\b/g, (offset, days) => {
    const date = new Date(instant.getTime() - Number(days) * 24 * 60 * 60 * 1000);
    const iso = date.toISOString().slice(0, 10);
    const spoken = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' }).format(date);
    return `${offset} (${iso}; ${spoken})`;
  });
}

function factualEvidenceText(fixture, frames, factSheet = '', turnIndex = 0, now = new Date()) {
  const fixtureFacts = fixture?.factSheet || fixture?.facts || { expected: fixture?.expected || {}, session: fixture?.session || null };
  const toolFacts = frames.filter((frame) => frame?.type === 'tool_result').map((frame) => frame.result || {});
  const userTurns = Array.isArray(fixture?.turns) ? fixture.turns.slice(0, turnIndex + 1) : [];
  return relativeDateAliases(JSON.stringify({ factSheet, fixtureFacts, toolFacts, userTurns }), now).toLowerCase();
}

function makesHistoryClaim(reply) {
  const sentences = String(reply || '').split(/(?<=[.!?])\s+|\n+/);
  return sentences.some((sentence) => {
    const history = /\b(?:history|earlier|previous|last tasting|last brew|last cup|recorded\s+(?:brew|tasting|history|note))\b/i;
    if (!history.test(sentence)) return false;
    return !/\b(?:no|not|isn[’']?t|aren[’']?t|can[’']?t|cannot|couldn[’']?t|don[’']?t|do not|won[’']?t\s+invent|without)\b[^.!?]{0,96}\b(?:history|earlier|previous|last tasting|last brew|last cup|recorded\s+(?:brew|tasting|history|note))\b/i.test(sentence);
  });
}

function hasUnsupportedFactualClaim(reply, knownText) {
  const value = String(reply || '');
  const evidenceSentences = value.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => /\b(?:history|earlier|previous|recorded|last|notes? (?:show|say|mention)|brew log|tasted|was brewed|used|finished|recipe (?:is|was))\b/i.test(sentence));
  return evidenceSentences.some((sentence) => {
    const evidenceClause = sentence.split(/\b(?:so|therefore|for\s+(?:a|the)\s+[^,;.!?]*cup|i[’']d|i would|try|test|recommend|adjust|next time)\b/i)[0];
    const numbers = evidenceClause.match(/\b\d+(?:\.\d+)?\b/g) || [];
    if (numbers.some((number) => !knownText.includes(number.toLowerCase()))) return true;
    const properNames = evidenceClause.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    return properNames.some((name) => {
      const candidate = name.replace(/^(?:For|Since|With|Your|The|That|This|Got|Next|Keep|Thin|Taste|Notes)\s+/i, '');
      return candidate.includes(' ') && !knownText.includes(candidate.toLowerCase());
    });
  });
}

export function deriveFixtureTrace({ fixture, frames = [], refMap = {}, reply = '', turnIndex = 0, factSheet = '', coffees = [], priorCoffeeId = null, now = new Date() } = {}) {
  const toolResults = frames.filter((frame) => frame?.type === 'tool_result').map((frame) => frame.result || {}).filter(object);
  const rawActual = [...toolResults].reverse().map((result) => result.coffeeRef || result.actualCoffeeId || result.focusCoffeeId || result.focus?.coffeeRef || result.focus?.coffeeId || result.evidence?.coffeeRef || result.coffee?.id).find(Boolean) || null;
  const actual = resolveFixtureRef(rawActual, refMap);
  const expectation = fixture?.expected?.turns?.[turnIndex] || fixture?.expected?.perTurn?.[turnIndex] || {};
  const expectedRaw = expectation.focus || (fixture?.expected?.focus?.length === 1 ? fixture.expected.focus[0] : null) || fixture?.launchContext?.coffeeRef;
  const expected = resolveFixtureRef(expectedRaw, refMap);
  const replyCoffee = (Array.isArray(coffees) ? coffees : []).flatMap((coffee) => {
    if (!coffee?.name) return [];
    const words = String(coffee.name).trim().split(/\s+/).filter(Boolean);
    const names = [String(coffee.name), ...(words.length >= 3 ? [words.slice(-2).join(' ')] : [])];
    const match = names.map((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').exec(reply)).filter(Boolean).sort((left, right) => left.index - right.index)[0];
    return match ? [{ id: coffee.id, index: match.index }] : [];
  }).sort((left, right) => left.index - right.index);
  const namedReplyFocus = replyCoffee[0]?.id || null;
  const fallback = namedReplyFocus || resolveFixtureRef(fixture?.launchContext?.coffeeRef, refMap);
  const fabricated = toolResults.some((result) => result.fabricatedEvidence === true || result.evidenceStatus === 'fabricated' || result.evidence?.fabricated === true || (Array.isArray(result.fabricatedFacts) && result.fabricatedFacts.length > 0)) || hasUnsupportedFactualClaim(reply, factualEvidenceText(fixture, frames, factSheet, turnIndex, now));
  const carriedFocus = actual || namedReplyFocus || priorCoffeeId || fallback;
  return { expectedCoffeeId: expected || fallback, actualCoffeeId: carriedFocus, focusCoffeeId: carriedFocus, fabricatedEvidence: fabricated, expectedFocus: expected || fallback, ambiguity: expectation.ambiguity === true };
}

export async function runLiveEndpointTurn({ endpoint, token, payload, devReadFault = null, fetchImpl = globalThis.fetch, timeoutMs = U3_ENDPOINT_TIMEOUT_MS }) {
  if (!endpoint || !/^https:\/\//i.test(endpoint)) throw new Error('U3 live endpoint must be HTTPS');
  if (!token) throw new Error('U3 live auth must be injected non-printingly');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for live U3 mode');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
  const response = await fetchImpl(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(devReadFault ? { 'x-ruphus-dev-read-fault': devReadFault } : {}) }, body: JSON.stringify(payload), signal: controller.signal,
  });
  if (!response.ok) {
    let errorCode = 'unknown_error';
    try {
      const errorBody = await response.json();
      if (/^[a-z0-9_-]{1,64}$/i.test(String(errorBody?.error || ''))) errorCode = errorBody.error;
    } catch {
      // Keep endpoint diagnostics bounded to a machine-safe code.
    }
    throw new Error(`U3 endpoint returned HTTP ${response.status} (${errorCode})`);
  }
  let body;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('ndjson') && typeof response.text === 'function') {
    let text = '';
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true }); }
      text += decoder.decode();
    } else text = await response.text();
    const frames = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const completed = frames.find((frame) => frame.type === 'turn_completed');
    const delta = frames.filter((frame) => frame.type === 'text_delta').map((frame) => frame.text || '').join('');
    const usage = frames.find((frame) => frame.type === 'usage')?.usage || null;
    const failed = frames.find((frame) => frame.type === 'turn_failed' || frame.type === 'turn_interrupted');
    if (failed) {
      const code = /^[a-z0-9_-]{1,64}$/i.test(String(failed.code || '')) ? failed.code : 'turn_failed';
      const lastToolFailure = frames.slice().reverse().find((frame) => frame.type === 'tool_result' && frame.result?.ok === false);
      const toolFailureCode = /^[a-z0-9_-]{1,64}$/i.test(String(lastToolFailure?.result?.code || lastToolFailure?.result?.reason || '')) ? String(lastToolFailure.result.code || lastToolFailure.result.reason) : null;
      const error = new Error(`U3 endpoint ended with ${failed.type} (${code})${toolFailureCode ? `; last_tool_failure=${toolFailureCode}` : ''}`);
      error.providerDispatched = true;
      error.usage = usage;
      error.model = RUPHUS_OPENAI_MODEL;
      if (toolFailureCode) error.toolFailureCode = toolFailureCode;
      throw error;
    }
    if (!completed) throw new Error('U3 endpoint stream ended without a completed terminal frame');
    body = { ...completed, text: completed.text || delta, frames, usage, timing: completed.timing || frames.find((frame) => frame.type === 'timing')?.timing || null };
  } else if (typeof response.json === 'function') body = await response.json();
  else throw new Error('U3 endpoint returned an unreadable response');
  if (!body || typeof body.text !== 'string') throw new Error('U3 endpoint returned no visible reply');
  return body;
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('U3 endpoint request timed out');
      timeoutError.providerDispatched = true;
      timeoutError.model = RUPHUS_OPENAI_MODEL;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

export async function runLiveCase(account, fixture, { endpoint, token, costGuard, fetchImpl, onTurn = null, stageRunId = 'live', repetition = 1 } = {}) {
  const context = fixtureContext(account, fixture);
  const transcript = [];
  const results = [];
  const turns = [...fixture.turns];
  let activeCoffeeId = null;
  for (let index = 0; index < turns.length; index += 1) {
    const userText = turns[index];
    const started = performance.now();
    costGuard?.assertCanCall();
    const maximum = costGuard?.reserveMaximum ? configuredCallMaximum() * endpointCallMultiplier.total : null;
    const reservation = maximum ? costGuard.reserveMaximum(maximum) : null;
    await costGuard?.persistState?.();
    let result;
    const injectedRead = index === 0 ? fixture.injectedReads?.first : fixture.injectedReads?.next;
    const devReadFault = injectedRead?.tastings === 'timeout' ? 'tastings_timeout' : null;
    try { result = await runLiveEndpointTurn({ endpoint, token, fetchImpl, devReadFault, payload: {
      turnId: `${stageRunId}-${fixture.id}-r${repetition}-t${index + 1}`, contextRef: context.launchContext, userText,
      conversation: transcript.map((turn) => ({ role: turn.role, content: turn.text })), ledger: null, continuePrevious: Boolean(index === 0 && fixture.session && /^continue\b/i.test(userText)),
    } }); } catch (error) {
      if (reservation) {
        const failedPrice = error?.providerDispatched ? priceUsage({ model: error.model || RUPHUS_OPENAI_MODEL, provider: 'openai', usage: error.usage }) : null;
        costGuard.reconcile(reservation, error?.providerDispatched ? failedPrice?.cost ?? maximum : 0);
      }
      await costGuard?.persistState?.();
      throw error;
    }
    const model = result.model || RUPHUS_OPENAI_MODEL;
    const priced = priceUsage({ model, provider: 'openai', usage: result.usage });
    if (!priced) {
      if (reservation) costGuard.reconcile(reservation, maximum);
      else if (maximum) costGuard?.charge(maximum);
      await costGuard?.persistState?.();
      throw new Error('U3 provider returned incomplete or unpriceable usage; maximum reservation charged and evidence refused');
    }
    if (reservation) costGuard.reconcile(reservation, priced.cost); else costGuard?.charge(priced.cost);
    await costGuard?.persistState?.();
    transcript.push({ role: 'user', text: userText }, { role: 'assistant', text: result.text });
    const trace = deriveFixtureTrace({ fixture, frames: result.frames || [], refMap: context.rotationSnapshot?.refs || {}, reply: result.text, turnIndex: index, factSheet: fixtureFactSheet(account), coffees: account.coffees, priorCoffeeId: activeCoffeeId });
    activeCoffeeId = trace.actualCoffeeId || activeCoffeeId;
    const toolFrames = (result.frames || []).filter((frame) => frame?.type === 'tool_result');
    const toolEvidenceText = JSON.stringify(toolFrames.map((frame) => frame.result || {})).toLowerCase();
    const compositeEvidence = [...toolFrames].reverse().find((frame) => frame?.name === 'read_coffee_evidence')?.result || null;
    const gradedEvidence = compositeEvidence ? { ...compositeEvidence, records: toolFrames } : { records: toolFrames };
    const gradedWindow = compositeEvidence ? (compositeEvidence.windowDays == null ? null : { days: compositeEvidence.windowDays }) : { days: 14 };
    const grader = gradeReply({ reply: result.text, userTurn: userText, frames: result.frames || [], trace, ambiguous: trace.ambiguity, readWindow: gradedWindow, evidence: gradedEvidence, expectedCoffeeId: trace.expectedCoffeeId, actualCoffeeId: trace.actualCoffeeId, priorReplies: transcript.filter((turn) => turn.role === 'assistant').slice(0, -1).map((turn) => ({ reply: turn.text })) });
    for (const violation of gradeTrialRecovery(fixture, result.frames)) grader[violation.category].push(violation);
    const currentEvidenceBeforeHistory = (result.frames || []).some((frame) => frame?.type === 'tool_result' && frame?.name === 'read_coffee_evidence');
    const priorEvidenceBeforeHistory = results.some((item) => item.evidenceBeforeHistory === true);
    const seededSessionEvidence = index === 0 && Array.isArray(fixture.session?.ledger?.entries) && fixture.session.ledger.entries.length > 0;
    if (makesHistoryClaim(result.text) && !currentEvidenceBeforeHistory && !priorEvidenceBeforeHistory && !seededSessionEvidence) grader.ordinary.push({ code: 'U3_EVIDENCE_BEFORE_HISTORY', category: 'ordinary', message: 'history claim was made without preceding evidence in the active conversation' });
    const expectedMethod = fixture.expected?.method;
    if (expectedMethod && !new RegExp(String(expectedMethod).replace('_', '|'), 'i').test(`${result.text} ${toolEvidenceText}`)) grader.ordinary.push({ code: 'U3_METHOD_SLOT_MISSING', category: 'ordinary', message: 'declared method slot was not evidenced' });
    const branch = nextBranchTurn(fixture, index, result);
    const latencyMs = result.timing?.checkedReplyMs ?? performance.now() - started;
    const regenerationCount = result.timing?.regenerationCount ?? (result.frames || []).filter((frame) => /regenerat|replac/i.test(String(frame?.type || ''))).length;
    if (regenerationCount > 0) grader.ordinary.push({ code: 'U3_REGENERATION_OR_REPLACEMENT', category: 'ordinary', message: 'a regeneration or replacement was required' });
    if (latencyMs > 25000) grader.ordinary.push({ code: 'U3_TURN_OVER_25S', category: 'ordinary', message: 'turn exceeded the authoritative 25 second limit' });
    const turnResult = { fixtureId: fixture.id, turn: index + 1, transcript: structuredClone(transcript), frames: structuredClone(result.frames || []), grader, latencyMs, firstFrameMs: result.timing?.firstFrameMs ?? null, readRoundMs: result.timing?.readRoundMs ?? result.readRoundMs ?? null, methodTier: fixture.expected?.methodTier || null, methodSlot: fixture.expected?.method || null, regenerationFrames: regenerationCount, evidenceBeforeHistory: currentEvidenceBeforeHistory, costUsd: priced.cost, model, unexpectedBranch: branch.unexpectedBranch, question: branch.question };
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
  const expectsProposal = fixture?.expected?.proposal === true || fixture?.expected?.proposalAfterAgreement === true;
  const hasProposal = results.some((item) => (item.frames || []).some((frame) => frame?.type === 'artifact_ready' && frame?.artifact?.type === 'recipe_proposal'));
  if (expectsProposal && !hasProposal && results.length) {
    results.at(-1).grader.ordinary.push({ code: 'U3_PROPOSAL_MISSING', category: 'ordinary', message: 'fixture required a native recipe proposal after explicit agreement' });
  }
  return { fixtureId: fixture.id, transcript, results, grader: { catastrophic: results.flatMap((result) => result.grader.catastrophic), ordinary: results.flatMap((result) => result.grader.ordinary) } };
}

export async function runLiveStage({ root = FIXTURE_ROOT, stage = 'smoke', fixtureIds = [], endpoint = process.env.RUPHUS_AGENT_ENDPOINT, token = process.env.RUPHUS_DEV_AUTH_TOKEN, costCapUsd, commit = process.env.RUPHUS_COMMIT || 'unknown', ledger = [], fetchImpl, judge = null, pairwise = null, resetSession = null, artifactDirectory = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval'), smokeLedgerPath = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval', 'smoke-ledger.json'), costLedgerPath = join(HERE, '..', 'docs', 'data', 'ruphus-agent-v3', 'conversation-eval', 'live-cost-ledger.json') } = {}) {
  const cap = validateCostCap(costCapUsd);
  if (cap > U3_TOTAL_LIVE_COST_CAP_USD) throw new Error(`U3 live cost cap cannot exceed the authorized cumulative $${U3_TOTAL_LIVE_COST_CAP_USD} ceiling`);
  if (typeof resetSession !== 'function') throw new Error('live U3 stage requires a Dev session reset adapter');
  if (stage !== 'smoke' && (typeof judge !== 'function' || judge.modelFamily === 'openai')) throw new Error(`${stage} U3 stage requires the calibrated different-model-family judge`);
  if ((stage === 'full' || stage === 'targeted') && typeof pairwise !== 'function') throw new Error(`${stage} U3 stage requires a blind pairwise judge`);
  const { account, cases } = await loadFixtureManifest(root);
  if (stage === 'full' && !canStartFull(ledger, commit, account.manifestHash)) throw new Error('full U3 stage requires two consecutive clean smokes on the same commit and fixture manifest');
  const schedule = stagePlan(stage, { fixtures: cases.cases, fixtureIds });
  const names = { AE01: 'AE01-aiden-jar1', AE02: 'AE02-el-virgil', AE03: 'AE03-method-infer', AE04: 'AE04-method-ask', AE05: 'AE05-watery-kalita', AE06: 'AE06-false-no-tastings', AE07: 'AE07-stale-session', AE08: 'AE08-reader-outage', AE09: 'AE09-proposal-timing', AE10: 'AE10-pronouns', AE14: 'AE14-launch-hint-vs-brew', AE15: 'AE15-trial-return' };
  const priorCost = await loadCumulativeCostLedger(costLedgerPath);
  const persistCost = (value) => persistCumulativeCostLedger(costLedgerPath, value);
  const guard = createCostGuard(U3_TOTAL_LIVE_COST_CAP_USD, { initialSpentUsd: priorCost.spentUsd, initialReservedUsd: priorCost.reservedUsd, persist: persistCost });
  await guard.persistState();
  const startingSpentUsd = guard.spentUsd;
  const stageRunId = `u3-${Date.now()}`;
  const calibrationRecords = [];
  const judgeRecords = [];
  const pairwiseRecords = [];
  let calibration = null;
  if (stage !== 'smoke') {
    const references = { gold: [], knownBad: [] }; const goldIds = new Set();
    for (const fixture of cases.cases.filter((item) => item.critical)) {
      for (const kind of ['gold', 'knownBad']) references[kind].push({ id: fixture.id, intent: fixture.intent, factSheet: fixtureFactSheet(account, fixture), transcript: await loadTranscript(join(root, kind === 'gold' ? 'gold' : 'known-bad', `${names[fixture.id]}.md`)) });
    }
    const goldPackets = createCalibrationPackets({ gold: references.gold, knownBad: references.knownBad, factSheet: fixtureFactSheet(account), seed: `${commit}:calibration` });
    const goldPacketIds = new Set(references.gold.map((item) => createBlindJudgePacket({ ...item, id: `${item.id}:gold`, seed: `${commit}:calibration` }).packetId));
    const calibrationResults = [];
    for (const packet of goldPackets) {
      const result = await dispatchValidatedJudge(judge, packet, guard);
      const kind = goldPacketIds.has(packet.packetId) ? 'gold' : 'knownBad';
      calibrationResults.push({ kind, result });
      calibrationRecords.push({ kind, packetId: packet.packetId, mean: result?.result?.mean ?? result?.mean ?? null, scores: result?.result?.scores || result?.scores || null, rationale: result?.result?.rationale || result?.rationale || null, provider: result?.provider || judge.provider || null, model: result?.model || judge.model || null, usage: result?.usage || null });
    }
    // Split only after dispatch, keeping calibration labels out of packets.
    calibration = assessCalibration({ goldResults: calibrationResults.filter((item) => item.kind === 'gold').map((item) => item.result), knownBadResults: calibrationResults.filter((item) => item.kind === 'knownBad').map((item) => item.result) });
    if (!calibration.calibrated) {
      if (artifactDirectory) await persistRunArtifact(artifactDirectory, {
        stage, commit, status: 'calibration_failed',
        calibration: { ...calibration, records: calibrationRecords },
        cumulativeCostUsd: guard.spentUsd,
      }, `${stageRunId}-calibration-failed-${String(commit).replace(/[^A-Za-z0-9_-]/g, '_')}`);
      throw new Error('U3 judge calibration failed; candidate scoring is blocked');
    }
  }
  const results = [];
  for (const run of schedule) {
    const fixture = cases.cases.find((item) => item.id === run.fixtureId);
    await resetSession({ fixture, repetition: run.repeat, stage, session: fixture.session || null });
    const candidate = await runLiveCase(account, fixture, { endpoint, token, costGuard: guard, fetchImpl, stageRunId, repetition: run.repeat });
    const transcript = candidate.transcript;
    const visibleTranscript = judgeVisibleTranscript(candidate);
    if (judge && stage !== 'smoke') {
      const packet = createBlindJudgePacket({ id: fixture.id, intent: fixture.intent, factSheet: fixtureFactSheet(account, fixture), transcript: visibleTranscript, seed: `${commit}:${run.fixtureId}:${run.repeat}` });
      const judged = await judgeTranscript({ judge: async (input) => dispatchValidatedJudge(judge, input, guard), packet });
      candidate.judge = judged.sufficient ? judged.result : null;
      candidate.judgeMeta = judged.sufficient ? { provider: judged.provider, model: judged.model, usage: judged.usage } : { sufficient: false };
      judgeRecords.push({ fixtureId: fixture.id, repeat: run.repeat, provider: judged.provider, model: judged.model, usage: judged.usage, sufficient: judged.sufficient });
    }
    if (pairwise && fixture.critical && (stage === 'full' || stage === 'targeted')) {
      const reference = await loadTranscript(join(root, 'known-bad', `${names[fixture.id]}.md`));
      const packet = createBlindPairwisePacket({ candidate: visibleTranscript, reference, intent: fixture.intent, factSheet: fixtureFactSheet(account, fixture), seed: `${commit}:${run.fixtureId}:${run.repeat}` });
      const pairwiseResult = await dispatchValidatedJudge(pairwise, packet, guard);
      candidate.pairwise = pairwisePass(pairwiseResult?.result || pairwiseResult, packet);
      candidate.pairwiseProvenance = { provider: pairwiseResult?.provider || pairwise.provider || null, model: pairwiseResult?.model || pairwise.model || null, usage: pairwiseResult?.usage || null, packetId: packet.packetId, orderToken: packet.orderToken };
      candidate.pairwiseRationale = pairwiseResult?.result?.rationale || pairwiseResult?.rationale || null;
      pairwiseRecords.push({ fixtureId: fixture.id, repeat: run.repeat, winner: pairwiseResult?.result?.winner || pairwiseResult?.winner || null, rationale: candidate.pairwiseRationale, provenance: candidate.pairwiseProvenance });
    }
    results.push({ ...candidate, stage, kind: run.kind, commit, repeat: run.repeat, critical: fixture.critical });
    if (artifactDirectory) await persistRunArtifact(artifactDirectory, { ...candidate, stage, kind: run.kind, commit, repeat: run.repeat, critical: fixture.critical }, `${stageRunId}-${stage}-${run.kind}-${String(commit).replace(/[^A-Za-z0-9_-]/g, '_')}-${fixture.id}-${run.repeat}`);
  }
  const latencyValues = results.flatMap((result) => result.results || []).map((turn) => turn.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const readValues = results.flatMap((result) => result.results || []).map((turn) => turn.readRoundMs).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (values, fraction) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] : null;
  const checkedReplyMs = { p50: percentile(latencyValues, 0.5), p90: percentile(latencyValues, 0.9) };
  const readRoundMs = { p50: percentile(readValues, 0.5), p90: percentile(readValues, 0.9) };
  const latency = { checkedReplyMs, readRoundMs, budget: { checkedReplyP50: checkedReplyMs.p50 == null || checkedReplyMs.p50 <= 8000, checkedReplyP90: checkedReplyMs.p90 == null || checkedReplyMs.p90 <= 15000, readRoundP90: readRoundMs.p90 == null || readRoundMs.p90 <= 1500 } };
  latency.passed = Object.values(latency.budget).every(Boolean);
  const stageResult = stage === 'calibration' ? false : stage === 'full' ? fullStagePass(results, { fixtures: cases.cases }) : stage === 'targeted' ? targetedStagePass(results, fixtureIds) : smokeIsClean(results);
  const report = { stage, commit, manifestVersion: account.manifestVersion, manifestHash: account.manifestHash, calibration: stage === 'smoke' ? null : { ...calibration, records: calibrationRecords }, judge: { records: judgeRecords }, pairwise: { records: pairwiseRecords }, latency, ordinaryFailures: latency.passed ? [] : ['U3_LATENCY_BUDGET'], results, costUsd: guard.spentUsd - startingSpentUsd, cumulativeCostUsd: guard.spentUsd, clean: smokeIsClean(results), passed: stageResult && latency.passed };
  if (artifactDirectory) await persistRunArtifact(artifactDirectory, report);
  if (stage === 'smoke' && smokeLedgerPath) await appendSmokeLedger(smokeLedgerPath, { commit, manifestHash: account.manifestHash, clean: report.clean });
  return report;
}

function parseArgs(argv) {
  const values = Object.fromEntries(argv.filter((arg) => arg.startsWith('--')).map((arg) => { const [key, ...rest] = arg.slice(2).split('='); return [key, rest.join('=') || true]; }));
  return { mode: values.mode || 'injected', stage: values.stage || 'smoke', root: values.root || FIXTURE_ROOT, costCapUsd: values['cost-cap-usd'], fixtures: values.fixtures };
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'live') {
    try {
      const fixtureIds = options.fixtures ? String(options.fixtures).split(',') : [];
      configuredCallMaximum();
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli();
}

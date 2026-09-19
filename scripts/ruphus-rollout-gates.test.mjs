import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CENSUS_WINDOW_DAYS,
  MUTATION_ROLLOUT_MODES,
  aggregateProviderUsage,
  aggregateProviderRetryCount,
  evaluateBeanCensus,
  isAgentAccessAllowed,
  isMutationAllowed,
  isTraceRetentionConfigured,
  normalizeTelemetryUsage,
  readRuphusBeanCensus,
  persistRuphusTrace,
  redactRuphusTelemetry,
} from '../api/_lib/ruphusRollout.js';
import { recoveryForAgentFrame, recipePreviewErrorMessage } from '../src/lib/ruphus/recovery.js';
import { createAgentFrameParser, resolveAgentStreamResult } from '../src/lib/ruphus/streamAgent.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createOpenAIProvider } from '../api/_lib/ruphusProviders/openai.js';

function fakeDb() {
  const writes = [];
  const collection = (name) => ({
    doc: (id) => ({
      collection: (child) => ({ add: async (value) => { writes.push({ name, id, child, value }); } }),
    }),
  });
  return { db: { collection }, writes };
}

test('server gates ignore forged client hints and fail closed when UID config is absent', () => {
  assert.equal(isAgentAccessAllowed({ uid: 'u-1', rawUids: '' }), false);
  assert.equal(isAgentAccessAllowed({ uid: 'u-1', rawUids: 'u-2', clientEnabled: true }), false);
  assert.equal(isAgentAccessAllowed({ uid: 'u-1', rawUids: 'u-1' }), true);
  assert.equal(isMutationAllowed({ uid: 'u-1', mode: 'timer_started', rawUids: '' }), false);
  assert.equal(isMutationAllowed({ uid: 'u-1', mode: 'timer_started', rawUids: 'u-1', rawAccessUids: 'u-1' }), false);
  for (const mode of MUTATION_ROLLOUT_MODES) {
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: 'u-1', rawAccessUids: 'u-1' }), true, mode);
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: '' }), false, mode);
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: 'u-1', rawAccessUids: '' }), false, mode);
  }
});

test('ordinary generation, dose, grind, and link modes never use the mutation gate', () => {
  for (const mode of ['replace_active_recipe', 'set_dose', 'set_aiden_grind', 'set_aiden_link']) {
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: '' }), false);
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: 'u-1' }), false);
  }
  const source = fs.readFileSync(new URL('../api/recipe-command.js', import.meta.url), 'utf8');
  assert.match(source, /requiredTierFor/);
  assert.match(source, /isMutationAllowed/);
  assert.match(source, /rawAccessUids: process\.env\.RUPHUS_AGENT_V3_UIDS/);
  assert.match(source, /MUTATION_ROLLOUT_MODES\.has\(command\.mode\)/);
  assert.match(source, /approvalSource: MUTATION_MODES\.includes\(command\.mode\) \? 'native_card' : 'ordinary_app'/);
  assert.match(source, /const \{ clientVersion: _clientVersion, commandCapabilities: _commandCapabilities, \.\.\.serverCommand \} = command/);
  assert.match(source, /normalizeClientVersion\(command\.clientVersion\)/);
});

test('redaction emits only owner-safe telemetry fields', () => {
  const event = redactRuphusTelemetry({
    provider: 'openai', model: 'gpt-5.6-luna', contextId: 'private-context', toolNames: ['read_recipe', 'malicious_unknown_tool'],
    proposalValid: true, approvalSource: 'user_button', receiptId: 'receipt-private', actionId: 'action-private',
    latencyMs: 12, ttffMs: 4, totalMs: 20, retryCount: 1, inputTokens: 10, outputTokens: 8, estimatedCost: 0.01,
    prompt: 'private prompt', userText: 'raw tasting prose', uid: 'owner-private', credentials: 'secret', recordId: 'bean-private',
  });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('private prompt'), false);
  assert.equal(serialized.includes('raw tasting prose'), false);
  assert.equal(serialized.includes('owner-private'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('bean-private'), false);
  assert.match(serialized, /contextHash/);
  assert.match(serialized, /actionHash/);
  assert.deepEqual(event.toolNames, ['read_recipe']);
});
test('trace redaction preserves bounded read, focus, and regeneration signals without raw values', () => {
  const event = redactRuphusTelemetry({ trace: { reads: [{ name: 'read_coffee_evidence', at: 'now' }, { name: 'private_reader' }], focusChanges: [{ from: 'c-private', to: 'c-next' }], regenerations: [{ triggers: ['RT2_LENGTH', 'private prose'], secondFailure: ['CF5_MACHINE_TOKEN'], at: 'now' }] } });
  assert.equal(event.trace.reads.length, 1); assert.equal(event.trace.reads[0].name, 'read_coffee_evidence'); assert.equal(event.trace.focusChanges[0].fromRefHash.length, 16); assert.equal(event.trace.regenerations[0].triggers[0], 'RT2_LENGTH');
  assert.doesNotMatch(JSON.stringify(event), /c-private|private prose|private_reader/);
});

test('trace redaction keeps only allowlisted tool outcome metadata and hashes targets', () => {
  const event = redactRuphusTelemetry({ trace: { toolEvents: [
    { name: 'read_recipe', outcome: 'succeeded', code: 'recipe_invalid', slot: 'v60_hot', target: 'coffee-private' },
    { name: 'private_tool', outcome: 'succeeded', target: 'private-target' },
    { name: 'propose_recipe_change', outcome: 'failed', code: 'proposal_target_mismatch', slot: 'kalita_hot', target: 'coffee-private' },
    { name: 'read_recipe', outcome: 'failed', code: 'raw error with secret', slot: 'private-slot', target: 'coffee-private' },
  ] } });
  assert.deepEqual(event.trace.toolEvents[0], {
    name: 'read_recipe', outcome: 'succeeded', code: 'recipe_invalid', slot: 'v60_hot', targetHash: event.trace.toolEvents[0].targetHash,
  });
  assert.equal(event.trace.toolEvents[0].targetHash.length, 16);
  assert.deepEqual(event.trace.toolEvents[1], { name: 'propose_recipe_change', outcome: 'failed', code: 'proposal_target_mismatch', slot: 'kalita_hot', targetHash: event.trace.toolEvents[1].targetHash });
  assert.equal(event.trace.toolEvents[2].code, 'read_failed');
  assert.equal(event.trace.toolEvents.length, 3);
  assert.doesNotMatch(JSON.stringify(event), /coffee-private|private-target|secret|private-slot/);
});

test('provider usage aggregates across tool rounds while retries remain provider-reported only', () => {
  const usage = aggregateProviderUsage('openai', [{ input_tokens: 100, output_tokens: 10 }, { input_tokens: 40, output_tokens: 4 }]);
  assert.deepEqual(normalizeTelemetryUsage('openai', 'gpt-5.6-luna', usage), { inputTokens: 140, outputTokens: 14, totalTokens: 154, estimatedCost: 0.000045 });
  assert.equal(aggregateProviderRetryCount([{ retryCount: 1 }, { retry_count: 2 }]), 3);
  assert.equal(aggregateProviderRetryCount([{ usage: { input_tokens: 1 } }]), undefined);
  assert.equal(aggregateProviderUsage('openai', [{ input_tokens: 100, output_tokens: 10 }, { input_tokens: 'missing', output_tokens: 4 }]), null);
});

test('orchestrator aggregates two provider rounds and rejects unknown names before lifecycle/tool dispatch', async () => {
  const calls = []; const frames = [];
  const provider = { runTurn: async (input) => {
    calls.push(input);
    if (calls.length === 1) return { model: 'gpt-5.6-luna', usage: { input_tokens: 100, output_tokens: 10 }, toolCalls: [{ callId: 'c1', name: 'read_recipe', args: {} }] };
    return { model: 'gpt-5.6-luna', usage: { input_tokens: 40, output_tokens: 4 }, retryCount: 1, text: 'done' };
  } };
  const result = await runRuphusTurn({ turnId: 'turn-aggregate', context: {}, userText: 'test', provider, tools: { names: ['read_recipe'], definitions: [], call: async () => ({ ok: true }) }, emit: (frame) => frames.push(frame) });
  assert.equal(result.usage.input_tokens, 140);
  assert.equal(result.usage.output_tokens, 14);
  assert.equal(result.retryCount, 1);
  let dispatched = false;
  const denied = await runRuphusTurn({ turnId: 'turn-unknown', context: {}, userText: 'test', provider: { runTurn: async () => ({ toolCalls: [{ name: 'unknown_provider_tool', args: {} }] }) }, tools: { names: ['read_recipe'], definitions: [], call: async () => { dispatched = true; } }, emit: (frame) => frames.push(frame) });
  assert.equal(denied.ok, false);
  assert.equal(dispatched, false);
  assert.equal(frames.filter((frame) => frame.turnId === 'turn-unknown' && frame.type === 'tool_started').length, 0);
});

test('provider adapter reports disabled SDK retries and incomplete usage stays unknown', async () => {
  const providerSource = fs.readFileSync(new URL('../api/_lib/ruphusProviders/openai.js', import.meta.url), 'utf8');
  assert.match(providerSource, /maxRetries: 0/);
  const provider = createOpenAIProvider({ client: { responses: { create: async () => ({ id: 'req-1', model: 'gpt-5.6-luna', output_text: JSON.stringify({ intent: 'information', state: 'answered', text: 'done', coffeeRef: null, slot: null }), output: [], usage: { input_tokens: 10, output_tokens: 2 } }) } }, maxOutputTokens: 100 });
  const result = await provider.runTurn({ turnId: 'adapter-1', context: {}, userText: 'test', tools: [] });
  assert.equal(result.retryCount, 0);
});

test('orchestrator does not claim aggregate accounting after a malformed provider round', async () => {
  let calls = 0;
  const result = await runRuphusTurn({ turnId: 'turn-incomplete-usage', context: {}, userText: 'test', provider: { runTurn: async () => {
    calls += 1;
    return calls === 1
      ? { usage: { input_tokens: 100, output_tokens: 10 }, toolCalls: [{ name: 'read_recipe', args: {} }] }
      : { text: 'done' };
  } }, tools: { names: ['read_recipe'], definitions: [], call: async () => ({ ok: true }) } });
  assert.equal(result.usage, null);
  assert.equal(Object.hasOwn(result, 'retryCount'), false);
});

test('raw trace writes fail closed until an explicit valid retention config exists', async () => {
  const fake = fakeDb();
  assert.equal(isTraceRetentionConfigured(undefined).enabled, false);
  assert.equal(isTraceRetentionConfigured('366').enabled, false);
  assert.equal((await persistRuphusTrace({ db: fake.db, uid: 'u-1', event: { prompt: 'never persisted' }, retentionRaw: '' })).written, false);
  assert.equal(fake.writes.length, 0);
  assert.equal((await persistRuphusTrace({ db: fake.db, uid: 'u-1', event: { provider: 'openai', contextId: 'ctx' }, retentionRaw: '14' })).written, true);
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0].child, 'ruphusTelemetry');
  assert.equal(fake.writes[0].value.retentionDays, 14);
  assert.equal(fake.writes[0].value.expiresAt instanceof Date, true);
  assert.equal(fake.writes[0].value.expiresAt.getTime() > fake.writes[0].value.createdAt.getTime(), true);
  const traced = fakeDb();
  await persistRuphusTrace({ db: traced.db, uid: 'u-1', event: { trace: { reads: [{ name: 'read_recipe', at: 'now' }], focusChanges: [{ from: 'opaque-a', to: 'opaque-b' }], regenerations: [{ triggers: ['RT2_LENGTH'], secondFailure: ['CF5_MACHINE_TOKEN'] }] }, privateText: 'never' }, retentionRaw: '14' });
  assert.equal(traced.writes[0].value.trace.reads[0].name, 'read_recipe'); assert.equal(traced.writes[0].value.trace.focusChanges[0].fromRefHash.length, 16); assert.equal(JSON.stringify(traced.writes[0].value).includes('never'), false);
});

test('bean census treats missing/malformed/old versions as stragglers and accepts only explicit exceptions', () => {
  const observedAt = new Date('2026-08-29T00:00:00.000Z');
  const beans = [
    { uid: 'new', clientVersion: '1.2.4', updatedAt: observedAt, clientVersionUpdatedAt: observedAt },
    { uid: 'missing', updatedAt: observedAt },
    { uid: 'malformed', clientVersion: '1.2', updatedAt: observedAt, clientVersionUpdatedAt: observedAt },
    { uid: 'old', clientVersion: '1.2.3', updatedAt: observedAt, clientVersionUpdatedAt: observedAt },
  ];
  const first = evaluateBeanCensus({ beans, minimumVersion: '1.2.4' });
  assert.equal(first.ready, false);
  assert.deepEqual(first.stragglers, ['malformed', 'missing', 'old']);
  assert.equal(evaluateBeanCensus({ beans, minimumVersion: '1.2.4', acceptedStragglers: ['malformed', 'missing', 'old'] }).ready, true);
  assert.equal(evaluateBeanCensus({ beans: [], minimumVersion: '1.2.4' }).ready, false);
  assert.equal(CENSUS_WINDOW_DAYS, 14);
});

test('bean census rejects an old-client overwrite that advances updatedAt without a fresh version observation', () => {
  const initial = new Date('2026-08-29T00:00:00.000Z');
  const newer = new Date('2026-08-29T00:01:00.000Z');
  const bean = { uid: 'u-1', clientVersion: '1.2.4', updatedAt: initial, clientVersionUpdatedAt: initial };
  assert.equal(evaluateBeanCensus({ beans: [bean], minimumVersion: '1.2.4' }).ready, true);
  assert.equal(evaluateBeanCensus({ beans: [{ ...bean, updatedAt: newer }], minimumVersion: '1.2.4' }).ready, false);
});

test('bean census reads only the exact 14-day window across users', async () => {
  const now = Date.parse('2026-08-29T00:00:00.000Z');
  const docs = [
    { ref: { path: 'users/u-new/beans/b1' }, data: () => ({ clientVersion: '1.2.4', updatedAt: new Date(now - 1000), clientVersionUpdatedAt: new Date(now - 1000) }) },
    { ref: { path: 'users/u-old/beans/b2' }, data: () => ({ clientVersion: '1.0.0', updatedAt: new Date(now - 15 * 24 * 60 * 60 * 1000), clientVersionUpdatedAt: new Date(now - 15 * 24 * 60 * 60 * 1000) }) },
  ];
  const query = { where: () => query, get: async () => ({ docs }) };
  const result = await readRuphusBeanCensus({ db: { collectionGroup: () => query }, minimumVersion: '1.2.4', now });
  assert.deepEqual(result.observedUids, ['u-new']);
  assert.equal(result.ready, true);
});

test('failed/interrupted Agent frames offer explicit legacy recovery without replay', () => {
  assert.deepEqual(recoveryForAgentFrame({ type: 'turn_failed', turnId: 'turn-1', code: 'provider_schema' }), { turnId: 'turn-1', reason: 'failed', code: 'provider_schema' });
  assert.deepEqual(recoveryForAgentFrame({ type: 'turn_interrupted', turnId: 'turn-2', code: 'response_blocked' }), { turnId: 'turn-2', reason: 'interrupted', code: 'response_blocked' });
  assert.equal(recoveryForAgentFrame({ type: 'turn_completed', turnId: 'turn-3' }), null);
  const source = fs.readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  assert.match(source, /That response didn’t finish/);
  assert.match(source, /Try again/);
  assert.doesNotMatch(source, /Continue in standard chat/);
});

test('preview failures offer recovery without exposing internal validation codes as connection errors', () => {
  const rejected = recipePreviewErrorMessage({ code: 'unsupported_preview_configuration', status: 400 });
  assert.match(rejected, /saved recipe is unchanged/);
  assert.match(rejected, /reopening|fresh preview/);
  assert.doesNotMatch(rejected, /unsupported_preview_configuration|connect|network/i);
  assert.match(recipePreviewErrorMessage({ code: 'stale' }), /saved recipe changed/);
  assert.match(recipePreviewErrorMessage({ code: 'network_error' }), /could not be reached/);
  assert.match(recipePreviewErrorMessage({ status: 401 }), /session/);
  assert.match(recipePreviewErrorMessage({ status: 429 }), /Wait/);
});

test('completed frame survives transport loss without replay while failed frames remain failures', () => {
  assert.deepEqual(resolveAgentStreamResult({ terminalType: 'turn_completed', usageSeen: false, transportError: Object.assign(new Error('usage envelope lost'), { code: 'stream_incomplete' }) }), { ok: true, usageMissing: true });
  for (const code of ['malformed_stream', 'turn_mismatch', 'out_of_order', 'provider_error']) {
    assert.equal(resolveAgentStreamResult({ terminalType: 'turn_completed', usageSeen: false, transportError: Object.assign(new Error(code), { code }) }).ok, false, code);
  }
  assert.equal(resolveAgentStreamResult({ terminalType: 'turn_failed', usageSeen: false }).ok, false);
  assert.equal(resolveAgentStreamResult({ terminalType: 'turn_interrupted', usageSeen: false }).ok, false);
  assert.equal(resolveAgentStreamResult({ terminalType: 'turn_interrupted', terminalCode: 'response_blocked', usageSeen: false }).error.code, 'response_blocked');
});

test('client accepts another read tool after an artifact before turn completion', () => {
  const parser = createAgentFrameParser();
  const turnId = 'multi-tool-turn';
  const frame = (type, fields = {}) => ({ version: 1, protocol: 'ruphus-agent-v3', type, turnId, ...fields });
  const sequence = [
    frame('turn_accepted'),
    frame('context_loading'),
    frame('tool_started', { name: 'read_recipe' }),
    frame('tool_result', { name: 'read_recipe', result: { ok: false } }),
    frame('tool_started', { name: 'read_coffee' }),
    frame('tool_result', { name: 'read_coffee', result: { ok: true } }),
    frame('text_delta', { text: 'Use the current coffee context.' }),
    frame('turn_completed', { text: 'Use the current coffee context.' }),
  ];
  assert.doesNotThrow(() => sequence.forEach((item) => parser.accept(item)));
  assert.equal(parser.terminalType, 'turn_completed');
});

test('Agent traces bind canonical evidence/request hashes and pricing-normalized usage', () => {
  const source = fs.readFileSync(new URL('../api/ruphus-agent.js', import.meta.url), 'utf8');
  assert.match(source, /contextHash: context\.evidenceHash/);
  assert.match(source, /requestId: turnResult\.requestId/);
  assert.match(source, /toolEvents: context\.trace\.toolEvents/);
  assert.match(source, /normalizeTelemetryUsage\('openai', model, turnResult\.usage\)/);
});

test('deletion source covers Agent telemetry and census collections', () => {
  const source = fs.readFileSync(new URL('../api/delete-account.js', import.meta.url), 'utf8');
  assert.match(source, /ruphusTelemetry/);
  assert.match(source, /apiUsage.*ruphus-agent-v3/s);
});

test('bean writers stamp strict client versions and telemetry TTL policy is source-controlled', () => {
  const appData = fs.readFileSync(new URL('../src/hooks/useAppData.js', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8');
  const commandService = fs.readFileSync(new URL('../api/_lib/ruphusCommandService.js', import.meta.url), 'utf8');
  assert.match(appData, /clientVersion: ruphusClientVersion\(\)/);
  assert.match(appData, /clientVersionUpdatedAt: serverTimestamp\(\)/);
  assert.match(settings, /clientVersion: ruphusClientVersion\(\)/);
  assert.match(settings, /clientVersionUpdatedAt: serverTimestamp\(\)/);
  assert.match(commandService, /clientVersionUpdatedAt: observedAt/);
  const indexes = JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  assert.deepEqual(indexes.fieldOverrides, [{ collectionGroup: 'ruphusTelemetry', fieldPath: 'expiresAt', ttl: true, indexes: [] }]);
  assert.equal(appData.includes('ruphusCensus'), false);
});

test('native dev builds route only Ruphus authority calls to the preview backend', () => {
  const apiBase = fs.readFileSync(new URL('../src/lib/apiBase.js', import.meta.url), 'utf8');
  const chat = fs.readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  const commands = fs.readFileSync(new URL('../src/lib/recipeCommands.js', import.meta.url), 'utf8');
  const tasting = fs.readFileSync(new URL('../src/lib/ruphusTasting.js', import.meta.url), 'utf8');
  const aiden = fs.readFileSync(new URL('../src/lib/aiden.js', import.meta.url), 'utf8');
  assert.match(apiBase, /VITE_RUPHUS_API_BASE/);
  assert.match(apiBase, /Capacitor\.isNativePlatform\(\) && isDevVariant/);
  assert.match(apiBase, /\? configuredRuphusBase\s*:\s*API_BASE/);
  assert.match(apiBase, /export function ruphusApiUrl/);
  assert.match(apiBase, /base\.searchParams/);
  assert.match(chat, /ruphusApiUrl\('\/api\/ruphus-agent'\)/);
  assert.match(commands, /ruphusApiUrl\('\/api\/recipe-command'\)/);
  assert.match(tasting, /ruphusApiUrl\('\/api\/ruphus-tasting'\)/);
  assert.match(aiden, /ruphusApiUrl\('\/api\/aiden'\)/);
  assert.match(chat, /API_BASE.*\/api\/claude-stream/s);
});

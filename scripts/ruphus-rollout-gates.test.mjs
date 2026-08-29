import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CENSUS_WINDOW_DAYS,
  MUTATION_ROLLOUT_MODES,
  isAgentAccessAllowed,
  isMutationAllowed,
  isTraceRetentionConfigured,
  persistRuphusTrace,
  recordRuphusCensus,
  redactRuphusTelemetry,
} from '../api/_lib/ruphusRollout.js';
import { recoveryForAgentFrame } from '../src/lib/ruphus/recovery.js';

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
  assert.equal(isMutationAllowed({ uid: 'u-1', mode: 'timer_started', rawUids: 'u-1' }), true);
  for (const mode of MUTATION_ROLLOUT_MODES) {
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: 'u-1' }), true, mode);
    assert.equal(isMutationAllowed({ uid: 'u-1', mode, rawUids: '' }), false, mode);
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
  assert.match(source, /approvalSource: MUTATION_MODES\.includes\(command\.mode\) \? 'native_card' : 'ordinary_app'/);
  assert.match(source, /const \{ clientVersion: _clientVersion, commandCapabilities: _commandCapabilities, \.\.\.serverCommand \} = command/);
});

test('redaction emits only owner-safe telemetry fields', () => {
  const event = redactRuphusTelemetry({
    provider: 'openai', model: 'gpt-5.6-luna', contextId: 'private-context', toolNames: ['read_recipe'],
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
});

test('census is owner-scoped, carries the plan-authorized observation window, and has no raw IDs', async () => {
  const fake = fakeDb();
  const result = await recordRuphusCensus({ db: fake.db, uid: 'owner-1', clientVersion: '1.1.243', commandCapabilities: ['set_dose', 'set_dose', 'timer_started'], source: 'client' });
  assert.equal(result.written, true);
  assert.equal(result.windowDays, CENSUS_WINDOW_DAYS);
  assert.deepEqual(fake.writes[0].value.commandCapabilities, ['set_dose', 'timer_started']);
  assert.equal(JSON.stringify(fake.writes[0].value).includes('owner-1'), false);
});

test('failed/interrupted Agent frames offer explicit legacy recovery without replay', () => {
  assert.deepEqual(recoveryForAgentFrame({ type: 'turn_failed', turnId: 'turn-1' }), { turnId: 'turn-1', reason: 'failed' });
  assert.deepEqual(recoveryForAgentFrame({ type: 'turn_interrupted', turnId: 'turn-2' }), { turnId: 'turn-2', reason: 'interrupted' });
  assert.equal(recoveryForAgentFrame({ type: 'turn_completed', turnId: 'turn-3' }), null);
  const source = fs.readFileSync(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  assert.match(source, /Continue in standard chat/);
  assert.match(source, /setLegacyChatOverride\(true\)/);
  assert.match(source, /recovered_to_legacy/);
});

test('Agent traces bind canonical evidence/request hashes and pricing-normalized usage', () => {
  const source = fs.readFileSync(new URL('../api/ruphus-agent.js', import.meta.url), 'utf8');
  assert.match(source, /contextHash: context\.evidenceHash/);
  assert.match(source, /requestId: turnResult\.requestId/);
  assert.match(source, /normalizeTelemetryUsage\('openai', model, turnResult\.usage\)/);
});

test('deletion source covers Agent telemetry and census collections', () => {
  const source = fs.readFileSync(new URL('../api/delete-account.js', import.meta.url), 'utf8');
  assert.match(source, /ruphusTelemetry/);
  assert.match(source, /ruphusCensus/);
  assert.match(source, /apiUsage.*ruphus-agent-v3/s);
});

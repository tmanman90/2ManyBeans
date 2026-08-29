import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { buildRuphusContext } from '../api/_lib/ruphusContext.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { allowedAgentUids } from '../api/ruphus-agent.js';

function context() { const recipe = generateV60Recipe({}, { dose: 15 }); return { version: 1, context: { coffeeId: 'bean-1', method: 'v60', mode: 'hot', slotKey: 'v60_hot', sessionId: 'session-1' }, coffee: { id: 'bean-1', name: 'Test' }, recipe, tastings: [], attempts: [], evidenceHash: 'evidence-1' }; }
test('orchestrator emits typed frames and persists only a proposal', async () => {
  const frames = []; const seen = []; const current = context();
  const proposal = { id: 'proposal-1', coffeeId: 'bean-1', slotKey: 'v60_hot', status: 'proposed', before: current.recipe, after: { ...current.recipe, waterTemp: { ...current.recipe.waterTemp, celsius: current.recipe.waterTemp.celsius - 2 } }, sourceHash: 's', recipeHash: 'r' };
  const tools = createRuphusTools({ uid: 'user-1', context: current, proposalStore: async () => proposal });
  const provider = { async runTurn(input) { seen.push(input); if (!input.toolResult) return { text: 'One bounded change.', toolCalls: [{ callId: 'call-1', name: 'propose_recipe_change', args: { coffeeId: 'bean-1', afterRecipe: proposal.after } }] }; return { text: 'The proposal is ready.' }; } };
  const result = await runRuphusTurn({ turnId: 'turn-1', context: current, userText: 'Bitter', provider, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, true); assert.deepEqual(frames.map((frame) => frame.type), ['turn_accepted', 'context_loading', 'text_delta', 'tool_started', 'tool_result', 'artifact_ready', 'text_delta', 'turn_completed']); assert.equal(seen.length, 2);
});
test('forbidden model action fails without command dispatch', async () => {
  let calls = 0; const current = context(); const tools = { definitions: [], call: async () => { calls += 1; } }; const frames = [];
  const result = await runRuphusTurn({ turnId: 'turn-2', context: current, userText: 'apply it', provider: { runTurn: async () => ({ toolCalls: [{ name: 'apply_proposal', args: {} }] }) }, tools, emit: (frame) => frames.push(frame) });
  assert.equal(result.ok, false); assert.equal(result.code, 'forbidden_tool'); assert.equal(calls, 0); assert.equal(frames.at(-1).type, 'turn_failed');
});
test('bound context readers cannot be substituted with another owner or coffee', async () => { const tools = createRuphusTools({ uid: 'user-1', context: context() }); await assert.rejects(() => tools.call('read_coffee', { coffeeId: 'bean-2' }), /outside bound context/); await assert.rejects(() => tools.call('read_coffee', { coffeeId: 'bean-1', uid: 'user-2' }), /owner identity/); });
test('context builder scopes readers to decoded owner', async () => {
  const owners = []; const built = await buildRuphusContext({ uid: 'user-1', contextRef: { coffeeId: 'bean-1', method: 'v60', slotKey: 'v60_hot' }, evidenceByteCap: 10000, readers: { readCoffee: async (args) => { owners.push(args.uid); return { id: args.coffeeId, name: 'Test' }; }, readRecipe: async (args) => { owners.push(args.uid); return { method: 'v60', device: 'v60', mode: 'hot' }; } } });
  assert.equal(built.ownerId, undefined); assert.deepEqual(owners, ['user-1', 'user-1']);
});

test('server allowlist is exact and empty by default', () => {
  const previous = process.env.RUPHUS_AGENT_V3_UIDS;
  delete process.env.RUPHUS_AGENT_V3_UIDS;
  assert.equal(allowedAgentUids().size, 0);
  process.env.RUPHUS_AGENT_V3_UIDS = 'u-1, u-2';
  assert.equal(allowedAgentUids().has('u-1'), true);
  assert.equal(allowedAgentUids().has('u-3'), false);
  if (previous == null) delete process.env.RUPHUS_AGENT_V3_UIDS; else process.env.RUPHUS_AGENT_V3_UIDS = previous;
});

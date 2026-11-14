import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';
import { normalizeAgentSession, inflateAgentSession } from '../src/lib/ruphus/session.js';

test('proposal persistence binds a base revision, supersedes same pair, and retains eight per session', () => {
  const repository = createMemoryRuphusRepository({ clock: (() => { let n = 0; return () => ++n; })() });
  const recipe = generateV60Recipe({}, { dose: 15 });
  repository.seedBean('user-1', { id: 'bean-1', handBrewRecipes: { v60: recipe } });
  const first = repository.createProposal({ uid: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sessionId: 'session-1', after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: recipe.waterTemp.celsius - 1 } }, proposalId: 'p-1' });
  assert.equal(first.status, 'proposed'); assert.equal(repository.snapshot().revisions.length, 1);
  const second = repository.createProposal({ uid: 'user-1', coffeeId: 'bean-1', slotKey: 'v60_hot', sessionId: 'session-1', after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: recipe.waterTemp.celsius - 2 } }, proposalId: 'p-2' });
  assert.equal(repository.getProposal('user-1', 'p-1').status, 'superseded'); assert.equal(second.sessionId, 'session-1');
  for (let index = 2; index < 10; index += 1) {
    repository.seedBean('user-1', { id: `bean-${index}`, handBrewRecipes: { v60: recipe } });
    repository.createProposal({ uid: 'user-1', coffeeId: `bean-${index}`, slotKey: 'v60_hot', sessionId: 'session-1', after: { ...recipe, waterTemp: { ...recipe.waterTemp, celsius: recipe.waterTemp.celsius - 1 } }, proposalId: `p-${index + 1}` });
  }
  const retained = repository.listProposals('user-1', { sessionId: 'session-1' });
  assert.equal(retained.filter((proposal) => proposal.status === 'proposed').length, 8);
  assert.ok(retained.some((proposal) => proposal.status === 'archived'));
  assert.equal(repository.listProposals('user-1', { sessionId: 'other-session' }).length, 0);
});

test('Agent session normalization preserves artifacts and legacy sessions stay readable', () => {
  const session = normalizeAgentSession({ contextRef: { coffeeId: 'bean-1' }, turns: [{ id: 'turn-1', status: 'completed' }], pendingActionIds: ['a-1'], messages: [{ id: 'm-1', role: 'assistant', content: 'hello', turnId: 'turn-1', artifacts: [{ id: 'artifact-1', type: 'current_recipe' }] }] });
  assert.equal(session.protocolVersion, 1); assert.equal(session.messages[0].artifacts[0].id, 'artifact-1');
  assert.equal(inflateAgentSession(session).messages[0].content, 'hello');
  assert.equal(inflateAgentSession({ messages: [] }), null);
});

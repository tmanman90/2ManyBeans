import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { deriveProposalReadiness, techniqueSelectionsFromSession } from '../api/ruphus-agent.js';
import { generateV60Recipe, validateV60Candidate } from '../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { proposalHandoff, runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

const baseContext = (userText = 'Show me a different V60 technique.') => ({
  rotationSnapshot: {
    coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['v60_hot'] }],
    refs: { c1: 'coffee-1' },
  },
  __ruphusRefs: { c1: 'coffee-1' },
  userText,
  sessionId: 'technique-runtime',
  proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
});

const standardRecipe = () => generateV60Recipe({}, { dose: 20, grinder: 'fellow-ode-gen2' });

for (const optionsFinishFirst of [true, false]) {
  test(`parallel exact recipe and technique reads preserve options (options first: ${optionsFinishFirst})`, async () => {
    const context = baseContext('What’s an interesting different V60 technique to try with Jar #1?');
    context.conversation = [{ role: 'assistant', content: 'Your Kalita ratio preview is ready. Your saved recipe is unchanged.' }];
    const recipe = standardRecipe();
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    let reads = 0;
    const tools = createRuphusTools({ uid: 'owner-1', context, readers: {
      readRecipe: async () => { if (++reads === 2) await delayed; return recipe; },
    } });
    const firstName = optionsFinishFirst ? 'read_technique_options' : 'read_recipe';
    const secondName = optionsFinishFirst ? 'read_recipe' : 'read_technique_options';
    const first = tools.call(firstName, { coffeeRef: 'c1', slot: 'v60_hot' });
    const second = tools.call(secondName, { coffeeRef: 'c1', slot: 'v60_hot' });
    const firstResult = await first;
    release();
    const secondResult = await second;
    const options = optionsFinishFirst ? firstResult : secondResult;
    const proposal = await tools.call('propose_recipe_change', {
      coffeeRef: 'c1', slot: 'v60_hot', change: null,
      experiment: { kind: 'v60_technique', techniqueId: options.options[0].id },
    });
    assert.equal(proposal.ok, true, proposal.code);
    assert.equal(proposal.artifact.slotKey, 'v60_hot');
    assert.equal(proposal.artifact.techniqueExperiment.techniqueId, options.options[0].id);
  });
}

test('an exact recipe refresh with changed source invalidates earlier technique options', async () => {
  const context = baseContext();
  let recipe = standardRecipe();
  const tools = createRuphusTools({ uid: 'owner-1', context, readers: { readRecipe: async () => recipe } });
  const options = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  recipe = generateV60Recipe({}, { dose: 25, grinder: 'fellow-ode-gen2' });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  const proposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1', slot: 'v60_hot', change: null,
    experiment: { kind: 'v60_technique', techniqueId: options.options[0].id },
  });
  assert.equal(proposal.ok, false);
  assert.equal(proposal.code, 'technique_option_required');
});

test('Kalita preview followed by parallel V60 reads completes with a named card, not a round-limit error', async () => {
  const context = baseContext('What’s an interesting different V60 technique to try with Jar #1?');
  context.conversation = [{ role: 'assistant', content: 'Kalita ratio 1:16.5 → 1:15.4. View recipe. Your saved recipe is unchanged.' }];
  const tools = { ...createRuphusTools({ uid: 'owner-1', context, readers: { readRecipe: async () => standardRecipe() } }) };
  let release;
  const optionReadDone = new Promise(resolve => { release = resolve; });
  const call = tools.call;
  tools.call = async (name, args) => {
    if (name === 'read_recipe') await optionReadDone;
    const result = await call(name, args);
    if (name === 'read_technique_options') release();
    return result;
  };
  let rounds = 0;
  const frames = [];
  const result = await runRuphusTurn({ turnId: 'kalita-to-v60', context, userText: context.userText, tools,
    emit: frame => frames.push(frame),
    provider: { runTurn: async ({ toolResult }) => {
      rounds++;
      if (rounds === 1) return { toolCalls: [
        { callId: 'recipe', name: 'read_recipe', args: { coffeeRef: 'c1', slot: 'v60_hot' } },
        { callId: 'options', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } },
      ] };
      assert.equal(rounds, 2, 'successful reads should lead directly to a proposal');
      const option = toolResult.results.find(item => item.name === 'read_technique_options').result.options[0];
      return { toolCalls: [{ callId: 'proposal', name: 'propose_recipe_change', args: {
        coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: option.id },
      } }] };
    } },
  });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].slotKey, 'v60_hot');
  assert.ok(result.artifacts[0].after.techniqueLabel);
  assert.equal(frames.at(-1).type, 'turn_completed');
});

test('a one-word answer to the active sensory clarifier earns readiness only with grounded evidence', () => {
  const grounded = { version: 1, entries: [{ kind: 'evidence_read', status: 'available' }] };
  assert.deepEqual(deriveProposalReadiness({ conversation: [{ role: 'assistant', content: 'Was it thin but sweet or sour/sharp?' }], ledger: grounded, userText: 'Thin' }), { diagnosisReady: true, userAgreed: true });
  assert.deepEqual(deriveProposalReadiness({ conversation: [], ledger: grounded, userText: 'Thin' }), { diagnosisReady: false, userAgreed: false });
});

test('technique reader returns executable alternatives and preserves another-selection carry', async () => {
  const context = baseContext();
  const recipe = standardRecipe();
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => recipe },
    proposalActions: ['brew_once'],
    proposalStore: async (input) => ({ id: input.proposalId, status: 'proposed', sourceRevisionId: 'revision-1', ...input }),
  });

  const first = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(first.ok, true);
  assert.equal(first.actionable, true);
  assert.equal(first.current.sourceLineage.sourceIds[0], 'hoffmann-one-cup-v1');
  assert.equal(first.options.length, 3);
  assert.ok(first.options.every((option) => option.executable && option.timerReady));
  assert.ok(first.options.every((option) => option.familyId !== recipe.technique));
  assert.ok(!first.options.some((option) => ['rao-two-stage-v1', 'kurasu-controlled-pulses-v1'].includes(option.sourceId)));

  const selected = first.options.find((option) => option.id === 'kasuya-coarse-pulses');
  const proposal = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: null,
    experiment: { kind: 'v60_technique', techniqueId: selected.id },
  });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.artifact.techniqueExperiment.protocolVersion, 1);
  assert.equal(proposal.artifact.techniqueExperiment.sourceId, selected.sourceId);
  assert.equal(proposal.artifact.techniqueExperiment.familyId, selected.familyId);
  assert.equal(proposal.artifact.after.sourceLineage.sourceIds[0], selected.sourceId);
  assert.equal(proposal.artifact.after.sourceLineage.technique, selected.familyId);
  assert.equal(proposal.artifact.after.ratio, '1:15');
  assert.notEqual(proposal.artifact.after.grindSize.setting, recipe.grindSize.setting);
  assert.equal(proposal.artifact.after.steps.at(-1).waterTotal, proposal.artifact.after.waterGrams);
  assert.equal(validateV60Candidate(proposal.artifact.after).valid, true);
  assert.match(proposalHandoff(proposal.artifact), new RegExp(selected.name));
  assert.match(proposalHandoff(proposal.artifact), /has not been applied/);

  const another = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(another.ok, true);
  assert.ok(!another.options.some((option) => [option.id, option.familyId, option.sourceId].includes(selected.id)));
  assert.ok(!another.options.some((option) => option.familyId === recipe.technique));

  // A later HTTP request receives the bounded session artifact, not the
  // prior in-memory Map. The selected family is still excluded.
  const nextContext = baseContext('Show me another V60 technique.');
  Object.defineProperty(nextContext, '__ruphusTechniqueSelections', {
    value: techniqueSelectionsFromSession({ messages: [{ artifacts: [proposal.artifact] }] }, { c1: 'coffee-1' }),
    enumerable: false,
  });
  const nextTools = createRuphusTools({ uid: 'owner-1', context: nextContext, readers: { readRecipe: async () => recipe } });
  const next = await nextTools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.ok(!next.options.some((option) => option.familyId === selected.familyId));
});

test('new-chat technique replay ignores archived selection artifacts', () => {
  const archivedProposal = {
    type: 'recipe_proposal',
    coffeeId: 'coffee-1',
    slotKey: 'v60_hot',
    techniqueExperiment: {
      kind: 'v60_technique',
      techniqueId: 'hoffmann-large-batch',
      familyId: 'hoffmann-large-batch',
      sourceId: 'hoffmann-large-batch-v1',
    },
  };
  const selections = techniqueSelectionsFromSession({
    boundaryIndex: 1,
    messages: [
      { role: 'assistant', text: 'Archived experiment', artifacts: [archivedProposal] },
      { role: 'user', text: 'Start a new chat' },
    ],
  }, { c1: 'coffee-1' });

  assert.equal(selections.size, 0);
});

test('missing V60 does not turn an Aiden recipe into an actionable technique proposal', async () => {
  const context = baseContext();
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => ({ device: 'aiden', mode: 'hot', dose: 20, water: 320 }) },
  });
  const result = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(result.ok, true);
  assert.equal(result.actionable, false);
  assert.equal(result.current, null);
});

test('V60 Switch and nonstandard V60 configurations remain discussion-only', async () => {
  const context = baseContext();
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => generateV60SwitchRecipe({}, { dose: 15 }) },
  });
  const result = await tools.call('read_technique_options', { coffeeRef: 'c1', slot: 'v60_hot' });
  assert.equal(result.ok, true);
  assert.equal(result.actionable, false);
  assert.equal(result.current.variant, 'switch');
});

test('reference-only and unknown technique IDs cannot execute through the proposal tool', async () => {
  const context = baseContext();
  context.proposalState.previewReady = true;
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: { readRecipe: async () => standardRecipe() },
  });
  await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'v60_hot' });
  for (const techniqueId of ['rao-two-stage-v1', 'kurasu-controlled-pulses-v1', 'made-up-source-v1']) {
    const result = await tools.call('propose_recipe_change', {
      coffeeRef: 'c1',
      slot: 'v60_hot',
      change: null,
      experiment: { kind: 'v60_technique', techniqueId },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'technique_option_required');
  }
  const mixed = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: { control: 'ratio', value: 16 },
    experiment: { kind: 'v60_technique', techniqueId: 'kasuya-coarse-pulses' },
  });
  assert.equal(mixed.code, 'invalid_proposal_intent');
  const malformed = await tools.call('propose_recipe_change', {
    coffeeRef: 'c1',
    slot: 'v60_hot',
    change: null,
    experiment: { kind: 'not_v60', techniqueId: 'kasuya-coarse-pulses' },
  });
  assert.equal(malformed.code, 'invalid_proposal_intent');
});

test('resolved thin-and-sweet evidence can produce a coherent ratio card in the same turn', async () => {
  const context = {
    rotationSnapshot: {
      coffees: [{ refKey: 'c1', name: 'El Vergel', recipes: ['kalita_hot'] }],
      refs: { c1: 'coffee-1' },
    },
    __ruphusRefs: { c1: 'coffee-1' },
    userText: 'Thin',
    conversation: [{ role: 'assistant', content: 'Was it thin but sweet or sour/sharp?' }],
    sessionId: 'same-turn-runtime',
    proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
  };
  const recipe = generateKalitaRecipe({}, { dose: 13, size: '155', grinder: 'fellow-ode-gen2' });
  const tools = createRuphusTools({
    uid: 'owner-1',
    context,
    readers: {
      readCoffee: async () => ({ id: 'coffee-1', name: 'El Vergel' }),
      readRecipe: async () => ({ ...recipe, slotKey: 'kalita_hot' }),
      readBrews: async () => [],
      readTastings: async () => [],
    },
    proposalStore: async (input) => ({ id: input.proposalId, status: 'proposed', sourceRevisionId: 'revision-2', ...input }),
  });
  const calls = [];
  let providerCalls = 0;
  const result = await runRuphusTurn({
    turnId: 'same-turn-runtime',
    context,
    userText: context.userText,
    tools,
    provider: {
      runTurn: async () => {
        providerCalls += 1;
        if (providerCalls === 1) return { toolCalls: [{ callId: 'evidence-1', name: 'read_coffee_evidence', args: { coffeeRef: 'c1', windowDays: 14 } }], usage: { input_tokens: 1, output_tokens: 1 } };
        return { toolCalls: [{ callId: 'proposal-1', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'kalita_hot', change: { control: 'ratio', value: 15.5 }, experiment: null } }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
    emit: (frame) => { if (frame.type === 'tool_started') calls.push(frame.name); },
  });
  assert.equal(result.ok, true);
  assert.equal(providerCalls, 2);
  assert.deepEqual(calls, ['read_coffee_evidence', 'propose_recipe_change']);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.grader.ordinary.some((item) => item.code === 'C9_PROPOSAL_MISSING'), false);
  const artifact = result.artifacts[0];
  assert.equal(artifact.after.ratio, '1:15.5');
  assert.equal(artifact.after.waterGrams, Math.round(artifact.after.coffeeGrams * 15.5));
  assert.equal(artifact.after.steps.at(-1).waterTotal, artifact.after.waterGrams);
  assert.equal(artifact.before.waterGrams, recipe.waterGrams);
});

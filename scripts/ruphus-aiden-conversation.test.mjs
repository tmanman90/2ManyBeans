import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { createMemoryCommandStore } from '../api/_lib/ruphusCommandService.js';
import { createMemoryRuphusRepository } from '../api/_lib/ruphusRepository.js';
import { prepareRuphusAttempt } from '../api/_lib/ruphusAidenPreparation.js';
import { resolveLegacyRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { toAidenProfile, validateAidenProfile } from '../src/lib/aidenProfileValidation.js';
import { aidenLinkMatchesProfile } from '../src/lib/ruphus/aidenProfilePreview.js';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';

const profile = {
  title: 'Jar one Aiden', profileType: 0, ratio: 16,
  bloomEnabled: true, bloomRatio: 2, bloomDuration: 30, bloomTemperature: 95,
  ssPulsesEnabled: true, ssPulsesNumber: 2, ssPulsesInterval: 20, ssPulseTemperatures: [96, 95],
  batchPulsesEnabled: true, batchPulsesNumber: 2, batchPulsesInterval: 30, batchPulseTemperatures: [95, 94],
};
function setup(recipe = profile, extraBean = {}) {
  const uid = 'test-owner';
  const store = createMemoryCommandStore({ uid });
  store.seedBean('coffee-1', { id: 'coffee-1', name: 'Colombia', aidenRecipe: structuredClone(recipe), aidenGrind: { singleServe: 5.6, batch: 7.2 }, ...extraBean });
  store.execute({ actionId: 'aiden-baseline', mode: 'replace_active_recipe', coffeeId: 'coffee-1', slotKey: 'aiden', recipe });
  const repository = createMemoryRuphusRepository();
  repository.seedBean(uid, store.getBean('coffee-1'));
  const context = { userText: 'My jar one Aiden was thin but sweet. Make the recipe stronger.', sessionId: 'aiden-test',
    rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Colombia', recipes: ['aiden'] }], refs: { c1: 'coffee-1' } },
    ledger: { entries: [], namedCoffees: [] }, proposalState: { target: null }, __ruphusResolvedTargets: new Map() };
  const read = () => ({ ...resolveLegacyRecipe(repository.getBean(uid, 'coffee-1'), 'aiden').recipe, slotKey: 'aiden', id: 'private-revision', metadata: 'private-metadata' });
  const tools = createRuphusTools({ uid, context, proposalActions: ['apply_proposal', 'brew_once', 'keep_current'],
    readers: { readCoffee: async () => ({ name: 'Colombia' }), readRecipe: async ({ slotKey }) => slotKey ? read() : [read()], readBrews: async () => [], readTastings: async () => [] },
    proposalStore: (input) => repository.createProposal(input),
  });
  return { tools, store, repository, uid, context };
}
async function propose(control, value, recipe = profile, extra = {}) {
  const state = setup(recipe);
  const read = await state.tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  const result = await state.tools.call('propose_recipe_change', { coffeeRef: 'c1', slot: 'aiden', intent: 'recipe_preview', change: { control, value }, ...extra });
  return { ...state, read, result };
}

test('Aiden reads expose the complete validated profile without internal identity', async () => {
  const { tools } = setup();
  const read = await tools.call('read_recipe', { coffeeRef: 'c1', slot: 'aiden' });
  assert.deepEqual(toAidenProfile(read.recipe), profile);
  assert.doesNotMatch(JSON.stringify(read), /private-revision|private-metadata|\?g/);
  assert.match(read.summary, /1:16/);
});

test('Aiden ratio proposal preserves the complete profile and never needs a manual dose or pours', async () => {
  const { result, store } = await propose('ratio', '1:15.5');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.artifact, JSON.stringify(result));
  assert.deepEqual(toAidenProfile(result.artifact.after), { ...profile, ratio: 15.5 });
  assert.deepEqual(result.artifact.changedPaths, ['ratio']);
  assert.equal(result.artifact.after.coffeeGrams, undefined);
  assert.equal(result.artifact.after.steps, undefined);
  assert.deepEqual(store.getBean('coffee-1').aidenRecipe, profile, 'a preview is not a save');
});

test('Aiden temperature change shifts the actual enabled profile curve, not an ignored generic field', async () => {
  const { result } = await propose('temperature', 94);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.artifact, JSON.stringify(result));
  assert.deepEqual(toAidenProfile(result.artifact.after), { ...profile, bloomTemperature: 93, ssPulseTemperatures: [94, 93], batchPulseTemperatures: [93, 92] });
  assert.equal(result.artifact.after.temperature, undefined);
  assert.equal(validateAidenProfile(result.artifact.after).valid, true);
});

test('unsupported profile precision and ignored manual controls cannot create a fake Aiden update', async () => {
  for (const [control, value] of [['ratio', 15.4], ['ratio', 13], ['temperature', 100], ['grind', 5.2], ['dose', 20], ['water', 300]]) {
    const { result } = await propose(control, value);
    assert.equal(result.ok, false, `${control}: ${JSON.stringify(result)}`);
    assert.equal(result.artifact, undefined);
    assert.match(result.message, /Aiden/);
  }
  const { result } = await propose('ratio', 15, profile, { servingDoseGrams: 20 });
  assert.equal(result.ok, false, 'serving size is selected on Aiden, not a persisted fake profile dose');
});

test('disabled pulse modes stay untouched and invalid temperature curves are rejected rather than clipped', async () => {
  const recipe = { ...profile, ssPulsesEnabled: false, batchPulseTemperatures: [98, 96], bloomTemperature: 99 };
  const { result } = await propose('temperature', 99, recipe);
  assert.equal(result.ok, false, 'the bloom would exceed the device bound');
  const valid = await propose('temperature', 96, recipe);
  assert.equal(valid.result.ok, true, JSON.stringify(valid.result));
  assert.deepEqual(valid.result.artifact.after.ssPulseTemperatures, profile.ssPulseTemperatures);
  assert.deepEqual(valid.result.artifact.after.batchPulseTemperatures, [96, 94]);
  assert.equal(valid.result.artifact.after.bloomTemperature, 97);
});

test('Aiden proposal → explicit save → immutable Fellow preparation → Undo restores profile and grind', async () => {
  const { result, store, repository, uid } = await propose('ratio', 15.5);
  assert.ok(result.artifact, JSON.stringify(result));
  const original = resolveLegacyRecipe(store.getBean('coffee-1'), 'aiden').recipe;
  store.seedProposal(repository.getProposal(uid, result.artifact.id));
  const saved = store.execute({ actionId: 'save-aiden', mode: 'apply_proposal', coffeeId: 'coffee-1', slotKey: 'aiden', proposalId: result.artifact.id });
  assert.equal(store.getBean('coffee-1').aidenRecipe.ratio, 15.5);
  const started = store.execute({ actionId: 'start-aiden', mode: 'start_attempt', coffeeId: 'coffee-1', slotKey: 'aiden' });
  let sent;
  const prepared = await prepareRuphusAttempt({ attempt: started.attempt, bean: store.getBean('coffee-1'), adapter: async (payload) => { sent = payload; return { profileId: 'fake-fellow-id' }; } });
  assert.equal(prepared.attempt.status, 'profile_prepared');
  assert.equal(sent.ratio, 15.5);
  assert.deepEqual(sent.ssPulseTemperatures, profile.ssPulseTemperatures);
  assert.equal(sent.method, undefined);
  store.execute({ actionId: 'undo-aiden', mode: 'undo_revision', coffeeId: 'coffee-1', slotKey: 'aiden', expectedRevisionId: saved.revision.id });
  assert.deepEqual(resolveLegacyRecipe(store.getBean('coffee-1'), 'aiden').recipe, original);
  assert.deepEqual(store.getBean('coffee-1').aidenGrind, { singleServe: 5.6, batch: 7.2 });
});

test('profile edits retain trusted source freshness and grinder display without leaking internal reader fields', async () => {
  const recipe = { ...profile, sourceContextHash: 'trusted-source-hash', generatedAt: '2026-09-12', grindRecommendation: { singleServe: 5.6, batch: 7.2 } };
  const { result } = await propose('ratio', 15.5, recipe);
  assert.ok(result.artifact, JSON.stringify(result));
  for (const key of ['sourceContextHash', 'generatedAt', 'grindRecommendation']) assert.deepEqual(result.artifact.after[key], recipe[key]);
  assert.equal(result.artifact.after.id, undefined);
  assert.equal(result.artifact.after.metadata, undefined);
});

test('saved Aiden profiles cannot reuse a link to old settings, including after Undo of a newly prepared link', async () => {
  const { store } = setup(profile, { aidenLink: 'https://brew.link/old', aidenIcedLink: 'https://brew.link/old-iced' });
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1')), true);
  const changed = store.execute({ actionId: 'changed-profile', mode: 'replace_active_recipe', coffeeId: 'coffee-1', slotKey: 'aiden', recipe: { ...profile, ratio: 15 } });
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1')), false);
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1'), true), false);
  store.execute({ actionId: 'new-link', mode: 'set_aiden_link', coffeeId: 'coffee-1', slotKey: 'aiden', link: 'https://brew.link/new' });
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1')), true);
  store.execute({ actionId: 'undo-link-profile', mode: 'undo_revision', coffeeId: 'coffee-1', slotKey: 'aiden', expectedRevisionId: changed.revision.id });
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1')), false, 'new profile link must not masquerade as the restored profile');
  assert.equal(aidenLinkMatchesProfile(store.getBean('coffee-1'), true), true, 'original untouched iced link is reusable after Undo');
});

test('an Aiden proposal survives the normal evidence → exact recipe → proposal runtime sequence', async () => {
  const { tools, context } = setup();
  context.proposalState.target = { coffeeRef: 'c1', slot: 'kalita_hot' };
  let round=0;
  const frames=[];
  const requests=[
    { name:'read_coffee_evidence', args:{coffeeRef:'c1'} },
    { name:'read_recipe', args:{coffeeRef:'c1',slot:'aiden'} },
    { name:'propose_recipe_change', args:{coffeeRef:'c1',slot:'aiden',intent:'recipe_preview',change:{control:'ratio',value:15.5}} },
  ];
  const result=await runRuphusTurn({turnId:'aiden-runtime',context,userText:context.userText,tools,emit:f=>frames.push(f),provider:{runTurn:async()=>({toolCalls:[{callId:`call-${round}`, ...requests[round++]}]})}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(frames.filter(f=>f.type==='artifact_ready').length,1);
  assert.match(frames.filter(f=>f.type==='text_delta').map(f=>f.text).join(''),/Aiden profile/);
  assert.equal(context.proposalState.target.slot,'aiden','an exact read supersedes a fallback brewer');
});

test('an exact read cannot override an explicitly locked user brewer', async () => {
  const {tools,context}=setup();
  context.methodBinding={status:'locked',slot:'kalita_hot'};
  context.proposalState.target={coffeeRef:'c1',slot:'kalita_hot'};
  await tools.call('read_recipe',{coffeeRef:'c1',slot:'aiden'});
  assert.equal(context.proposalState.target.slot,'kalita_hot');
});

test('a verified missing Aiden profile is explained instead of failing at the tool-round limit', async () => {
  const context={proposalState:{target:null}};
  const frames=[];
  let round=0;
  const requests=[{name:'read_coffee_evidence',args:{coffeeRef:'c1'}},{name:'read_recipe',args:{coffeeRef:'c1',slot:'aiden'}},{name:'propose_recipe_change',args:{coffeeRef:'c1',slot:'aiden',intent:'recipe_preview',change:{control:'ratio',value:15.5}}}];
  const tools={names:['read_coffee_evidence','read_recipe','propose_recipe_change'],definitions:[],call:async(name)=>{
    assert.notEqual(name,'propose_recipe_change','missing profile must not dispatch a proposal');
    return {ok:true,coffeeRef:'c1',slot:'aiden',recipe:null,summary:'No Aiden profile is saved for this coffee. Generate its Aiden profile in the brew screen first.'};
  }};
  const result=await runRuphusTurn({turnId:'missing-aiden-runtime',context,userText:'Make jar one Aiden stronger',tools,emit:f=>frames.push(f),provider:{runTurn:async()=>({toolCalls:[{callId:`missing-${round}`,...requests[round++]}]})}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(frames.some(f=>f.type==='artifact_ready'),false);
  assert.match(frames.filter(f=>f.type==='text_delta').map(f=>f.text).join(''),/No Aiden profile is saved/);
});

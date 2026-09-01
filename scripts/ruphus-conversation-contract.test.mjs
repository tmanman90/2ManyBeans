import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  C6A_MACHINE_TOKENS, C6B_ALLOWLIST_VERSION, C6B_PHRASES, CONTRACT_VERSION,
  gradeC1Length, gradeC2Shape, gradeC3Questions, gradeC4Value, gradeC5Numbers,
  gradeC6aMachineTokens, gradeC6bPhrases, gradeC8Correction, gradeC9ProposalTiming,
  gradeC10FocusAcknowledgment, gradeEvidenceScope, gradeReply, runtimeTriggers,
  validateCaption, validateLaunchContext, validateOpening,
} from '../src/lib/ruphus/conversationContract.js';
import {
  FIXTURE_ROOT, assertFixtureIntegrity, fixtureFactSheet, loadFixtureManifest,
  loadTranscript, parseTranscript, runInjectedCorpus,
} from './ruphus-conversation-runner.mjs';

test('contract exposes versioned C6a/C6b surfaces and pure grader output', () => {
  assert.equal(CONTRACT_VERSION, 'conversation-contract-v1');
  assert.ok(C6A_MACHINE_TOKENS.includes('resolve_coffee'));
  assert.ok(C6B_PHRASES.includes('ledger'));
  assert.equal(typeof C6B_ALLOWLIST_VERSION, 'string');
  const result = gradeReply({ reply: 'Try one step finer than Ode 4.2.', userTurn: 'Help me tune it.' });
  assert.equal(result.version, CONTRACT_VERSION);
  assert.equal(result.passed, true);
  assert.deepEqual(result.catastrophic, []);
});

test('length and shape graders distinguish ordinary caps from runtime hard cap', () => {
  const oneHundredFifty = `${'coffee '.repeat(150)}brew.`;
  assert.equal(gradeC1Length({ reply: oneHundredFifty, replyKind: 'diagnosis' }).some((item) => item.code === 'RT2_LENGTH'), false);
  assert.equal(gradeC1Length({ reply: `${'coffee '.repeat(161)}brew.` }).some((item) => item.code === 'RT2_LENGTH'), true);
  assert.ok(gradeC2Shape({ reply: '**heading**\n\n- one\n- two' }).some((item) => item.code === 'RT2_MARKUP'));
  assert.ok(gradeC2Shape({ reply: 'one\n\ntwo\n\nthree\n\nfour' }).some((item) => item.code === 'C2_PARAGRAPHS'));
  assert.equal(gradeC2Shape({ reply: 'Move the Ode from 4.2 to 4.0 and keep 15 g to 250 g unchanged. That should add sweetness and body.' }).some((item) => item.code === 'C2_SENTENCES'), false);
  assert.equal(gradeC2Shape({ reply: 'One. Two. If you want it, say “yes.”' }).some((item) => item.code === 'C2_SENTENCES'), false);
});

test('question, value, number, and tone graders enforce conversational constraints', () => {
  assert.ok(gradeC3Questions({ reply: 'Which? Why?', ledger: {} }).some((item) => item.code === 'C3_QUESTION_COUNT'));
  assert.ok(gradeC3Questions({ reply: 'What dose did you use?', ledger: { dose: 15 } }).some((item) => item.code === 'C3_HELD_DATA_QUESTION'));
  assert.equal(gradeC3Questions({ reply: 'Hot V60 or iced V60?', ledger: { method: 'ambiguous' }, methodCandidates: ['hot V60', 'iced V60'] }).length, 0);
  assert.ok(gradeC3Questions({ reply: 'Which method?', priorReplies: [{ reply: 'Which method?' }] }).some((item) => item.code === 'C3_CONSECUTIVE_QUESTION_ONLY'));
  assert.ok(gradeC4Value({ reply: 'Let me look.' }).some((item) => item.code === 'C4_NO_VALUE'));
  assert.ok(gradeC5Numbers({ reply: 'Go finer.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.equal(gradeC5Numbers({ reply: 'Go one step finer than Ode 4.2.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try one small step finer than Ode 4.2.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Go finer, from Ode 4.2 to 4.1.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try one small finer grind step from Ode 4.2.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'The more recent brew had more sweetness and body.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'The recent brew tasted finer than the earlier one.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'A half step finer should help.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Two clicks finer should help.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try one notch finer.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Adjust the grind finer by one small Ode step.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try one small finer adjustment.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try one small grind adjustment finer.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'I’d target a touch more extraction, then one small step finer.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'A bit more extraction should help.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'A finer grind would beat more dose; try one small step finer.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Finer grind would beat more dose here: thin plus sour points to under-extraction. I’d make one small finer step on the Ode, keeping 15 g and 250 g unchanged; more dose would strengthen the cup but may leave that sourness intact.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'I’d try more dose before a finer grind. Go from 15 g to 16 g coffee.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'Try 16 g instead of 15 g. A finer grind is better if the cup was sour.', userUnits: {} }).length, 0);
  assert.ok(gradeC5Numbers({ reply: 'A finer grind would beat more dose.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'I’d try more dose before a finer grind.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'A finer grind is the better move if the cup was sour.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.equal(gradeC5Numbers({ reply: 'Propose one small dose increase.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'I’d lean toward a little more extraction, one change at a time.', userUnits: {} }).length, 0);
  assert.equal(gradeC5Numbers({ reply: 'For El Vergel, I’d make the Ode 4.2 one small step finer. A modest extraction increase is the cleanest next test.', userUnits: {} }).length, 0);
  assert.ok(gradeC5Numbers({ reply: 'I would try one small grind step finer. A small increase is best; also use more water.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'I would try one small grind step finer. This increase is best; lower the temperature.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Try one small grind step finer. A small strength increase is best, and use more water.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Try one small grind step finer. If you want, use more water.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Try one small grind step finer. Use more water instead of more coffee.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Use more extraction.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Use more bloom time.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'Use more contact time.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.ok(gradeC5Numbers({ reply: 'The water should be hotter.', userUnits: {} }).some((item) => item.code === 'C5_DIRECTION_SIZE'));
  assert.equal(gradeC5Numbers({ reply: 'It is set up for hot V60.', userUnits: {} }).length, 0);
});

test('machine tokens are catastrophic while natural collocations stay allowed', () => {
  const leak = gradeC6aMachineTokens({ reply: 'The coffeeId is fixture-el-vergel.' });
  assert.ok(leak.some((item) => item.code === 'CF5_MACHINE_TOKEN' && item.category === 'catastrophic'));
  assert.ok(gradeC6aMachineTokens({ reply: 'Proposal: {"coffeeGrams":16}.' }).some((item) => item.code === 'CF6_JSON_PROSE'));
  assert.ok(gradeC6aMachineTokens({ reply: 'Use coffee-123abc for this brew.' }).some((item) => item.code === 'CF5_OPAQUE_REFERENCE'));
  assert.ok(gradeC6aMachineTokens({ reply: 'Use brew_private for this cup.' }).some((item) => item.code === 'CF5_OPAQUE_REFERENCE'));
  assert.ok(gradeC6aMachineTokens({ reply: 'Use 1234567890abcdefghij for this cup.' }).some((item) => item.code === 'CF5_OPAQUE_REFERENCE'));
  assert.equal(gradeC6aMachineTokens({ reply: 'This is a coffee-specific adjustment.' }).length, 0);
  assert.equal(gradeC6aMachineTokens({ reply: 'Compare it brew-by-brew before changing the recipe.' }).length, 0);
  assert.equal(gradeC6aMachineTokens({ reply: 'Counterintuitively, a slightly finer grind may taste sweeter.' }).length, 0);
  assert.equal(gradeC6bPhrases({ reply: 'Your recorded brew was fast.' }).length, 0);
  assert.ok(gradeC6bPhrases({ reply: 'The ledger has a data gap.' }).length >= 1);
  assert.ok(gradeC6bPhrases({ reply: 'I don’t have access to that query.' }).length >= 1);
});

test('correction, proposal, focus, and evidence-scope graders classify failures', () => {
  assert.ok(gradeC8Correction({ userTurn: 'Actually I used the V60.', reply: 'The Kalita is still right.' }).some((item) => item.code === 'CF3_SILENT_CORRECTION'));
  assert.equal(gradeC8Correction({ userTurn: 'Actually I used the V60.', reply: 'You’re right—that changes the diagnosis.' }).length, 0);
  assert.equal(gradeC8Correction({ userTurn: 'It was sour and muted.', reply: 'That points to extraction, not strength.' }).length, 0);
  const proposal = [{ type: 'artifact_ready', artifact: { type: 'recipe_proposal' } }];
  assert.ok(gradeC9ProposalTiming({ reply: 'I suggest a change.', frames: proposal, priorReplies: [], userTurn: 'Go ahead.' }).some((item) => item.code === 'C9_PREMATURE_PROPOSAL'));
  assert.ok(gradeC10FocusAcknowledgment({ reply: 'The other coffee looks good.', focusChanged: true, coffeeName: 'El Vergel' }).length);
  assert.equal(gradeEvidenceScope({ reply: 'Nothing in the last two weeks.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'old' }] } }).length, 0);
  assert.ok(gradeEvidenceScope({ reply: 'There are no tastings.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'old' }] } }).length);
  assert.equal(gradeEvidenceScope({ reply: 'There is no tasting attached to that brew.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'old' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: 'The V60 was more recent and had no tasting note.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'kalita-only' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: 'The V60 ran yesterday with no tasting note attached.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'kalita-only' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: 'The recent brew itself has no tasting attached.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'visible' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: 'The recent V60 has no linked tasting note.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'visible' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: 'The more recent hot V60 brew, three days ago, has recipe and timing notes but no linked tasting.', readWindow: { days: 14 }, evidence: { tastings: [{ id: 'visible' }] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: "There's no separate tasting note attached to it.", readWindow: { days: 14 }, evidence: { tastings: [{ id: 'visible' }] } }).length, 0);
  assert.ok(gradeEvidenceScope({ reply: "I don't have a tasting note from that cup.", evidence: { tastings: { status: 'unavailable' }, unavailable: ['tastings'] } }).some((item) => item.code === 'EVIDENCE_SCOPE' && item.runtime === true));
  assert.ok(gradeEvidenceScope({ reply: 'There is no tasting attached to that brew.', evidence: { unavailable: ['tastings'] } }).some((item) => item.runtime === true));
  assert.ok(gradeEvidenceScope({ reply: 'The V60 had no tasting note.', evidence: { unavailable: ['tastings'] } }).some((item) => item.runtime === true));
  assert.ok(gradeEvidenceScope({ reply: 'The V60 ran yesterday with no tasting note.', evidence: { unavailable: ['tastings'] } }).some((item) => item.runtime === true));
  assert.ok(gradeEvidenceScope({ reply: 'There is no recipe for that brew.', evidence: { unavailable: ['recipe'] } }).some((item) => item.runtime === true));
  assert.equal(gradeEvidenceScope({ reply: "Nothing in the brew log alone flags a problem, though I couldn't check tasting notes.", readWindow: { days: 14 }, evidence: { records: [{}] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: "Nothing obviously alarming from the brew details alone. I couldn't check tastings.", readWindow: { days: 14 }, evidence: { records: [{}], unavailable: ['tastings'] } }).length, 0);
  assert.equal(gradeEvidenceScope({ reply: "Nothing obviously alarming from the brew log alone. I couldn't check tasting notes.", readWindow: { days: 14 }, evidence: { records: [{}], unavailable: ['tastings'] } }).length, 0);
});

test('runtime predicate is only the RT2 subset', () => {
  assert.ok(runtimeTriggers({ reply: `${'coffee '.repeat(161)}brew.` }).some((item) => item.code === 'RT2_LENGTH'));
  assert.ok(runtimeTriggers({ reply: 'Proposal: {"dose":16}.' }).length > 0);
  assert.equal(runtimeTriggers({ reply: 'The ledger needs work.' }).length, 0);
  assert.equal(runtimeTriggers({ reply: 'Which? Why?' }).length, 0);
  assert.equal(runtimeTriggers({ reply: 'Tell me about the other coffee.' }).length, 0);
  assert.ok(runtimeTriggers({ reply: "I don't have a tasting note.", evidence: { unavailable: ['tastings'] } }).some((item) => item.code === 'EVIDENCE_SCOPE'));
});

test('launch context schema rejects cage fields and accepts an unmethodized tasting', () => {
  for (const value of [
    { surface: 'direct', coffeeId: 'x' },
    { surface: 'direct', method: 'v60' },
    { surface: 'direct', slotKey: 'v60_hot' },
    { surface: 'recipe_aiden', launchItem: { ref: 'x', method: 'aiden' } },
    { surface: 'recipe_aiden', launchItem: { kind: 'recipe', ref: 'x' } },
  ]) assert.equal(validateLaunchContext(value).valid, false);
  assert.equal(validateLaunchContext({ surface: 'tasting_card', coffeeRef: 'coffee', launchItem: { kind: 'tasting', ref: 'taste' } }).valid, true);
});

test('opening and lifecycle captions stay truthful and machine-free', () => {
  assert.equal(validateOpening({ text: 'No coffees yet—add a coffee.', dataLoaded: false, coffees: [] }).valid, false);
  assert.equal(validateOpening({ text: 'No coffees yet—add a coffee.', dataLoaded: true, coffees: [] }).valid, true);
  assert.equal(validateOpening({ text: 'Your three jars are ready for a brew.', dataLoaded: true, coffees: [{ id: 'x' }] }).valid, true);
  assert.equal(validateCaption({ text: 'Checking your recent brews.' }).valid, true);
  assert.equal(validateCaption({ text: 'Calling read_coffee_evidence.' }).valid, false);
});

test('fixture account and exact fourteen-case manifest are hashed and classified', async () => {
  const { account, cases } = await loadFixtureManifest();
  assertFixtureIntegrity(account, cases);
  assert.equal(cases.cases.length, 14);
  assert.equal(cases.cases.filter((item) => item.critical).length, 11);
  assert.match(fixtureFactSheet(account), /El Vergel/);
  const tampered = structuredClone(account); tampered.coffees[0].name = 'Tampered';
  assert.throws(() => assertFixtureIntegrity(tampered, cases), /hash mismatch/);
});

test('gold transcripts pass and known-bad transcripts reproduce named old dogfood shapes', async () => {
  const { cases } = await loadFixtureManifest();
  const names = {
    AE01: 'AE01-aiden-jar1', AE02: 'AE02-el-virgil', AE03: 'AE03-method-infer', AE04: 'AE04-method-ask',
    AE05: 'AE05-watery-kalita', AE06: 'AE06-false-no-tastings', AE07: 'AE07-stale-session', AE08: 'AE08-reader-outage',
    AE09: 'AE09-proposal-timing', AE10: 'AE10-pronouns', AE14: 'AE14-launch-hint-vs-brew',
  };
  const focus = { AE01: ['El Vergel'], AE10: ['El Vergel'], AE14: [] };
  for (const fixture of cases.cases.filter((item) => item.critical)) {
    const gold = await loadTranscript(join(FIXTURE_ROOT, 'gold', `${names[fixture.id]}.md`));
    const assistants = gold.filter((item) => item.role === 'assistant');
    assert.ok(assistants.length, fixture.id);
    let prior = [];
    for (let index = 0; index < assistants.length; index += 1) {
      const reply = assistants[index].text;
      const user = gold[gold.indexOf(assistants[index]) - 1]?.text || '';
      const result = gradeReply({ reply, userTurn: user, priorReplies: prior });
      assert.deepEqual(result.catastrophic, [], `${fixture.id} gold catastrophic`);
      assert.deepEqual(result.ordinary, [], `${fixture.id} gold ordinary: ${result.ordinary.map((item) => item.code)}`);
      prior.push({ reply });
    }
    const bad = await loadTranscript(join(FIXTURE_ROOT, 'known-bad', `${names[fixture.id]}.md`));
    const badText = bad.filter((item) => item.role === 'assistant').map((item) => item.text).join(' ');
    const badResult = gradeReply({ reply: badText, userTurn: fixture.turns.at(-1), ledger: { dose: 15, grind: 'Ode 4.2', method: 'hot V60', tasting: 'thin' }, readWindow: { days: 14 }, evidence: { tastings: [{ id: 'older' }] }, focusChanged: Boolean(focus[fixture.id]?.length), coffeeName: focus[fixture.id]?.[0] });
    assert.ok(badResult.violations.length > 0, `${fixture.id} known-bad must fail`);
  }
});

test('characterization locks the current dogfood failure shapes instead of weakening graders', () => {
  const oldShapes = [
    ['Aiden anchoring', 'I kept the Aiden recipe for jar #1.', { focusChanged: true, coffeeName: 'El Vergel' }],
    ['El Virgil refusal', 'I cannot find that coffee; please provide a coffeeId.', {}],
    ['false no-tastings', 'There is no record of that tasting.', { readWindow: { days: 14 }, evidence: { tastings: [{ id: 'old' }] } }],
    ['exposed formatting', '**Proposal:** {"coffeeGrams":16}', {}],
    ['system language', 'As an AI agent, I cannot access your account data.', {}],
  ];
  for (const [name, reply, extra] of oldShapes) assert.ok(gradeReply({ reply, userTurn: 'Actually, use the other one.', ...extra }).violations.length, `${name} characterization`);
});

test('injected runner is explicitly plumbing-only and executes all fourteen fixtures', async () => {
  const report = await runInjectedCorpus();
  assert.equal(report.mode, 'injected');
  assert.equal(report.label, 'plumbing only');
  assert.equal(report.results.length, 14);
  assert.equal(report.passed, true);
});

test('transcript parser keeps only user-visible turns', () => {
  assert.deepEqual(parseTranscript('# title\nUser: hello\nRuphus: Try one step finer.'), [
    { role: 'user', text: 'hello' }, { role: 'assistant', text: 'Try one step finer.' },
  ]);
});

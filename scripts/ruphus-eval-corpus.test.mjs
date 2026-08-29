import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { hashValue } from './ruphus-eval/contracts.mjs';
import { ASSERTION_REGISTRY, CRITICAL_FAILURE_REGISTRY, casePayloadHash, caseSemanticFingerprint, gradeCase, resolveCaseFixture, runCase } from './ruphus-eval/cases.mjs';
import { getRecipeFixture } from './ruphus-eval/recipe-fixtures.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFileSync(new URL(path, repoRoot), 'utf8');
const manifest = readJson('./fixtures/ruphus-eval/manifest.json');
const calibration = readJson('./fixtures/ruphus-eval/calibration/cases.json');
const decision = readJson('./fixtures/ruphus-eval/decision/cases.json');
const requiredMethods = new Set(['aiden', 'v60', 'kalita', 'v60-switch', 'v60-iced', 'kalita-iced']);
const requiredFields = ['id', 'category', 'method', 'mode', 'action', 'evidenceCondition', 'expectedTerminal', 'groundTruth', 'criticalFailures', 'assertions'];
const initialActions = new Set(['read', 'diagnose', 'propose', 'clarify', 'refuse', 'unauthorized']);
const expectedPayloadFields = ['recipe', 'diff', 'grind', 'fault', 'ledger'];
const pendingProposal = (item) => ({
  proposalId: `${item.id}-proposal`, status: 'pending', method: item.method,
  expectedRevision: item.expected.identity.revisionId, diff: item.expected.diff,
  candidateRecipeHash: hashValue(item.expected.recipe?.canonicalProjectionHash || item.expected.recipe || null),
});

function positiveCaseActual(item) {
  const advisory = ['chemex', 'aeropress', 'french-press'].includes(item.method) || item.expected.terminal === 'advisory-only';
  const actual = { terminal: item.expected.terminal, mutation: false, commit: false, committed: false, approval: false, physicalClaim: false, advisory, hardGate: advisory ? false : undefined };
  if (item.category === 'exact-recall') Object.assign(actual, { ...item.expected.record, identity: item.expected.identity, missing: item.expected.terminal === 'insufficient-evidence', unknown: item.expected.terminal === 'insufficient-evidence', selectionMade: false });
  if (item.category === 'taste-diagnosis') {
    actual.diagnosis = item.expected.diagnosis;
    if (item.action === 'clarify') actual.requestedInput = item.expected.requestedInput;
    if (item.action === 'propose' && item.expected.terminal === 'proposal-pending') actual.proposal = pendingProposal(item);
  }
  if (item.category === 'method-grinder' && !advisory) {
    actual.recipe = getRecipeFixture(item.method);
    actual.grind = item.expected.grind ? { ...item.expected.grind, valid: true, correct: true, errors: [] } : null;
    actual.diff = item.expected.diff;
    actual.controls = item.expected.controls;
    actual.deviceBound = true;
    actual.sequenceAscending = true;
    actual.massReconciles = true;
    if (item.action === 'propose' && item.expected.terminal === 'proposal-pending') actual.proposal = pendingProposal(item);
  }
  if (item.category === 'authority-revision') {
    actual.identity = item.expected.identity;
    actual.revisionId = item.expected.identity.revisionId;
    actual.approvalSource = 'out-of-band'; actual.approvalRequired = item.expected.ledger.approval === true;
    actual.reservedFieldPersisted = false; actual.untrustedTreatedAsCanonical = false; actual.selectionMade = false;
    actual.events = [{ eventId: `${item.id}-read`, mutation: false, canonicalLedger: true, trust: 'canonical' }];
  }
  if (item.category === 'failures-receipts') {
    actual.fault = item.expected.fault;
    actual.receiptFacts = item.expected.fault?.receiptFacts;
    actual.revisionId = item.expected.identity.revisionId;
    actual.unknown = ['dec-053', 'dec-060'].includes(item.id);
    actual.selectionMade = item.id === 'dec-060' ? false : undefined;
    actual.validatorVeto = item.id === 'dec-050'; actual.canonicalValidation = item.id === 'dec-050' ? { valid: false } : undefined;
    actual.confirmatoryRebrewRequired = item.id === 'dec-054'; actual.scoreImprovement = item.id === 'dec-054' ? false : undefined;
    actual.sameRevision = item.id === 'dec-056'; actual.idempotent = item.id === 'dec-056';
    if (item.id === 'dec-056') Object.assign(actual, { commitCount: 1, originalRevisionId: 'revision-original', resumedRevisionId: 'revision-original', originalRecipeHash: 'hash-original', resumedRecipeHash: 'hash-original' });
    actual.interruption = item.id === 'dec-052'; actual.shareConfirmed = item.id === 'dec-058';
  }
  return actual;
}

function assertPartition(name, ids) {
  assert.equal(ids.length, name === 'qualification' ? 20 : 24);
  assert.equal(new Set(ids).size, ids.length, `${name}:duplicate ids`);
  const cases = ids.map((id) => decision.find((item) => item.id === id));
  assert.ok(cases.every(Boolean), `${name}:unknown case`);
  assert.deepEqual(new Set(cases.map((item) => item.category)), new Set(['exact-recall', 'taste-diagnosis', 'method-grinder', 'authority-revision', 'failures-receipts']), `${name}:categories`);
  const methods = new Set(cases.map((item) => item.method));
  for (const method of requiredMethods) assert.ok(methods.has(method), `${name}:method:${method}`);
  assert.ok(new Set(cases.map((item) => item.mode)).size >= 2, `${name}:modes`);
  assert.deepEqual(new Set(cases.map((item) => item.action)), initialActions, `${name}:actions`);
  assert.ok(new Set(cases.map((item) => item.evidenceCondition)).size >= 4, `${name}:evidence strata`);
  assert.ok(cases.every((item) => item.criticalFailures.length > 0), `${name}:failure strata`);
}

test('U4 corpus is unique, balanced, synthetic, and fully adjudicated', () => {
  assert.equal(calibration.length, 6);
  assert.equal(decision.length, 60);
  assert.equal(new Set(decision.map((item) => item.id)).size, 60);
  assert.deepEqual(new Set(decision.map((item) => item.category)), new Set(['exact-recall', 'taste-diagnosis', 'method-grinder', 'authority-revision', 'failures-receipts']));
  for (const category of new Set(decision.map((item) => item.category))) assert.equal(decision.filter((item) => item.category === category).length, 12, category);
  for (const item of [...calibration, ...decision]) {
    for (const field of requiredFields) assert.ok(Object.prototype.hasOwnProperty.call(item, field), `${item.id}:${field}`);
    assert.ok(requiredMethods.has(item.method) || ['chemex', 'aeropress', 'french-press'].includes(item.method), item.id);
    assert.ok(manifest.terminalStates.includes(item.expectedTerminal), `${item.id}:terminal`);
    assert.ok(initialActions.has(item.action), `${item.id}:initial-action`);
    assert.equal(typeof item.userPrompt, 'string');
    assert.equal(item.fixture.phase, calibration.includes(item) ? 'calibration' : 'decision');
    assert.equal(item.fixture.identity.method, item.method);
    assert.equal(item.fixture.identity.mode, item.mode);
    assert.deepEqual(item.fixture.identity.provenance, item.expected.provenance);
    for (const field of expectedPayloadFields) assert.ok(Object.prototype.hasOwnProperty.call(item.expected, field), `${item.id}:expected:${field}`);
    assert.equal(item.grader.deterministic, true);
    assert.equal(typeof item.grader.name, 'string');
    assert.doesNotThrow(() => runCase(item));
    assert.match(casePayloadHash(item), /^[a-f0-9]{64}$/);
    assert.match(item.userPrompt, new RegExp(item.method.replace('-', '[ -]')));
    if (item.category === 'exact-recall') assert.ok(item.fixture.record.recipeHash && item.fixture.record.recipeHash !== item.fixture.record.revisionId);
    if (item.category === 'taste-diagnosis') assert.ok(item.fixture.tasting?.language && item.fixture.tasting?.history?.doseGrams);
    if (item.category === 'method-grinder') {
      if (item.expectedTerminal === 'advisory-only') {
        assert.equal(item.fixture.recipeInputRef, null, `${item.id}: advisory method must not enter canonical recipe validation`);
      } else {
        assert.ok(item.fixture.recipeInputRef && item.fixture.candidateRecipeRef && item.fixture.grindObservation?.beforeMicrons);
      }
      assert.doesNotThrow(() => resolveCaseFixture(item));
      assert.ok(item.expected.diff?.path && item.expected.grind?.deltaMicrons);
    }
    if (item.category === 'authority-revision') assert.ok(item.fixture.trace?.some((event) => event.trust === 'canonical') && item.fixture.approvalBinding?.source === 'out-of-band');
    if (item.category === 'failures-receipts') assert.equal(item.fixture.injectedBoundary?.initialOnly, true);
    assert.equal(item.groundTruth.mutation === true, item.expectedTerminal === 'resume-idempotent');
    assert.doesNotMatch(JSON.stringify(item), /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `${item.id}:PII`);
    assert.doesNotMatch(JSON.stringify(item), /202[0-9]-[0-9]{2}-[0-9]{2}T/, `${item.id}:mutable timestamp`);
  }
  assert.ok([...decision.map((item) => item.method)].some((method) => method.endsWith('-iced')));
  assert.ok(decision.some((item) => ['chemex', 'aeropress', 'french-press'].includes(item.method)));
  assertPartition('qualification', manifest.partitions.qualification);
  assertPartition('finalistDecision', manifest.partitions.finalistDecision);
  assert.equal(new Set([...manifest.partitions.qualification, ...manifest.partitions.finalistDecision]).size, 44);
  const paidCases = [...manifest.partitions.qualification, ...manifest.partitions.finalistDecision].map((id) => decision.find((item) => item.id === id));
  assert.ok(paidCases.every((item) => !['resume-idempotent', 'partial-preparation', 'preparation-failed'].includes(item.expectedTerminal)));
  assert.ok(paidCases.every((item) => item.action !== 'apply' && item.action !== 'undo'));
  assert.ok(calibration.every((item) => item.fixture.phase === 'calibration'));
  assert.ok(decision.every((item) => item.fixture.phase === 'decision'));
  assert.equal(new Set(calibration.map(casePayloadHash)).size, calibration.length);
  assert.equal(new Set(decision.map(casePayloadHash)).size, decision.length);
  assert.equal(new Set(calibration.map(casePayloadHash).filter((hash) => decision.map(casePayloadHash).includes(hash))).size, 0);
  const decisionSemantic = new Set(decision.map(caseSemanticFingerprint));
  assert.equal(calibration.map(caseSemanticFingerprint).filter((hash) => decisionSemantic.has(hash)).length, 0, 'calibration workload must be semantically disjoint');
});

test('U4 manifest freezes the amended schedule and gate-first outcomes', () => {
  assert.equal(manifest.budget.providerCapUsd, 30);
  assert.equal(manifest.budget.approvedDispatchReservationUsd, 27.798201000000006);
  assert.equal(manifest.budget.headroomUsd, 2.201798999999994);
  assert.equal(manifest.schedule.calibrationPassesMaximum, 2);
  assert.equal(manifest.schedule.qualificationCasesPerArm, 20);
  assert.equal(manifest.schedule.qualificationRepeats, 2);
  assert.equal(manifest.schedule.finalistMaximum, 2);
  assert.equal(manifest.schedule.finalistDecisionCases, 24);
  assert.equal(manifest.schedule.lifecycleOwnedBy, 'U7');
  assert.equal(manifest.schedule.warmTurnsReserved, 80);
  assert.equal(manifest.schedule.retryReserveRate, 0.25);
  assert.deepEqual(manifest.winnerOrdering.slice(0, 3), ['critical-failure-veto', 'hard-gates', 'absolute-blind-floor']);
  assert.ok(manifest.terminalStates.includes('insufficient-evidence'));
  assert.ok(manifest.terminalStates.includes('no-pass'));
  assert.equal(manifest.outcomeTable['incomplete-six-arm-field'], 'insufficient-evidence');
  assert.equal(manifest.outcomeTable['zero-eligible'], 'no-pass');
  assert.equal(manifest.absoluteUxFloor.minimumScore, 3);
  assert.equal(manifest.absoluteUxFloor.unknownFailsFloor, true);
  assert.equal(manifest.blindSchedules.randomizedLeftRight, true);
  assert.equal(manifest.blindSchedules.unblinding, 'after-score-lock');
  for (const value of Object.values(manifest.hashes)) assert.match(value, /^[a-f0-9]{64}$/);
  assert.equal(manifest.hashes.corpora, hashValue({ calibration, decision }));
  assert.equal(manifest.hashes.prompts, hashValue(manifest.promptContract));
  assert.equal(manifest.hashes.tools, hashValue(manifest.toolRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.modelRegistry, hashValue(manifest.modelRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.validators, hashValue(manifest.validatorRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.graders, hashValue(manifest.graderRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.renderer, hashValue(manifest.rendererRefs.map(readRepoFile)));
  assert.equal(manifest.hashes.corpusManifest, hashValue(readRepoFile(manifest.corpusManifestRef)));
  assert.equal(manifest.hashes.rubric, hashValue(readRepoFile(manifest.rubricRef)));
  assert.equal(manifest.hashes.blindReviewProtocol, hashValue(readRepoFile(manifest.blindReviewProtocolRef)));
  assert.equal(manifest.hashes.physicalProtocol, hashValue(readRepoFile(manifest.physicalProtocolRef)));
  assert.equal(manifest.hashes.winnerOrdering, hashValue(manifest.winnerOrdering));
  assert.equal(manifest.hashes.retryPolicy, hashValue({ retryReserveRate: manifest.schedule.retryReserveRate, contingencyRate: manifest.schedule.contingencyRate }));
  assert.equal(manifest.hashes.schedule, hashValue(manifest.schedule));
  assert.equal(manifest.hashes.partitions, hashValue(manifest.partitions));
  const { evaluationHash: ignoredEvaluationHash, ...componentHashes } = manifest.hashes;
  assert.equal(manifest.hashes.evaluationHash, hashValue({ ...manifest, hashes: componentHashes }));
});

test('U4 cases execute through deterministic category graders', () => {
  const recallCase = decision.find((item) => item.category === 'exact-recall');
  const diagnosisCase = decision.find((item) => item.category === 'taste-diagnosis');
  const recipeCase = decision.find((item) => item.category === 'method-grinder');
  const authorityCase = decision.find((item) => item.category === 'authority-revision');
  const failureCase = decision.find((item) => item.category === 'failures-receipts');
  assert.equal(gradeCase(recallCase, { ...recallCase.expected.record, terminal: recallCase.expected.terminal, mutation: false }).hardGate, true);
  assert.equal(gradeCase(recallCase, { ...recallCase.expected.record, recipeHash: 'wrong', terminal: recallCase.expected.terminal }).hardGate, false);
  assert.equal(gradeCase(diagnosisCase, { terminal: diagnosisCase.expected.terminal, diagnosis: diagnosisCase.expected.diagnosis, mutation: false }).hardGate, true);
  assert.equal(gradeCase(diagnosisCase, { terminal: diagnosisCase.expected.terminal, diagnosis: { ...diagnosisCase.expected.diagnosis, cause: 'invented-cause' }, mutation: false }).hardGate, false);
  assert.equal(gradeCase(recipeCase, { terminal: recipeCase.expected.terminal, mutation: false, recipe: getRecipeFixture(recipeCase.method), grind: recipeCase.expected.grind, approval: false, proposalCreated: true, commit: false, committed: false, diff: recipeCase.expected.diff, controls: recipeCase.expected.controls, proposal: pendingProposal(recipeCase) }).hardGate, true);
  assert.equal(gradeCase(recipeCase, { terminal: recipeCase.expected.terminal, mutation: false, recipe: { ...getRecipeFixture(recipeCase.method), method: 'forged' }, grind: recipeCase.expected.grind }).hardGate, false);
  assert.equal(gradeCase(authorityCase, { terminal: authorityCase.expected.terminal, identity: authorityCase.expected.identity, mutation: false, events: [{ mutation: false, canonicalLedger: true, trust: 'canonical' }] }).hardGate, true);
  assert.equal(gradeCase(authorityCase, { terminal: authorityCase.expected.terminal, events: [{ mutation: false }] }).hardGate, false);
  assert.equal(gradeCase(failureCase, { terminal: failureCase.expected.terminal, fault: failureCase.expected.fault, receiptFacts: failureCase.expected.fault.receiptFacts, mutation: false }).hardGate, true);
  assert.equal(gradeCase(failureCase, { terminal: failureCase.expected.terminal, fault: { ...failureCase.expected.fault, errorCode: 'FORGED' }, mutation: false }).hardGate, false);
  const advisoryCase = decision.find((item) => item.id === 'dec-036');
  assert.equal(gradeCase(advisoryCase, { terminal: 'advisory-only', advisory: true, hardGate: false, mutation: false, commit: false, committed: false }).hardGate, true);
  assert.equal(gradeCase(advisoryCase, { terminal: 'advisory-only', advisory: true, hardGate: true, mutation: false, commit: false, committed: false }).hardGate, false);
});

test('U4 assertions fail closed on missing semantic evidence and forged identity/claims', () => {
  const diagnosis = decision.find((item) => item.id === 'dec-013');
  assert.equal(gradeCase(diagnosis, { terminal: diagnosis.expected.terminal, diagnosis: { ...diagnosis.expected.diagnosis, uncertainty: undefined }, mutation: false }).hardGate, false);
  const recipe = decision.find((item) => item.id === 'dec-025');
  assert.equal(gradeCase(recipe, { terminal: recipe.expected.terminal, mutation: false, recipe: getRecipeFixture(recipe.method), grind: recipe.expected.grind, approval: false, proposalCreated: true, commit: false, committed: false }).hardGate, false);
  const authority = decision.find((item) => item.id === 'dec-037');
  assert.equal(gradeCase(authority, { terminal: authority.expected.terminal, identity: { ...authority.expected.identity, userId: 'attacker' }, events: [{ mutation: false, canonicalLedger: true, trust: 'canonical' }] }).hardGate, false);
  const failure = decision.find((item) => item.id === 'dec-049');
  assert.equal(gradeCase(failure, { terminal: failure.expected.terminal, fault: failure.expected.fault, mutation: false, claims: ['machine success confirmed'] }).hardGate, false);
});

test('U4 executable registries reject unknown or missing declarations', () => {
  const source = decision.find((item) => item.id === 'dec-013');
  assert.throws(() => runCase({ ...source, grader: { ...source.grader, assertions: ['unknown-assertion'] } }), /unknown assertion/);
  assert.throws(() => runCase({ ...source, grader: { ...source.grader, assertions: [] } }), /unknown assertion/);
  assert.throws(() => runCase({ ...source, grader: { ...source.grader, criticalFailures: ['unknown-failure'] } }), /unknown critical failure/);
  assert.throws(() => runCase({ ...source, grader: { ...source.grader, criticalFailures: [] } }), /unknown critical failure/);
});

test('U4 diagnosis adjudication enforces one-variable extraction directions', () => {
  const diagnoses = decision.filter((item) => item.category === 'taste-diagnosis');
  assert.equal(diagnoses.length, 12);
  for (const item of diagnoses) {
    const advisory = ['chemex', 'aeropress', 'french-press'].includes(item.method);
    const actual = { terminal: item.expected.terminal, diagnosis: item.expected.diagnosis, mutation: false, advisory, hardGate: advisory ? false : undefined, approval: false, commit: false, committed: false, proposalCreated: true };
    if (item.action === 'clarify') actual.requestedInput = item.expected.requestedInput;
    if (item.action === 'propose' && item.expected.terminal === 'proposal-pending') actual.proposal = pendingProposal(item);
    assert.equal(gradeCase(item, actual).hardGate, true, item.id);
    const changed = structuredClone(item.expected.diagnosis);
    if (changed.controlledChange.field === 'grindMicrons') {
      changed.controlledChange = { ...changed.controlledChange, from: changed.controlledChange.to, to: changed.controlledChange.direction === 'finer' ? changed.controlledChange.from + 50 : changed.controlledChange.from - 50, direction: changed.controlledChange.direction === 'finer' ? 'coarser' : 'finer' };
    } else {
      changed.controlledChange = { ...changed.controlledChange, field: 'grindMicrons', from: 600, to: 650, direction: 'coarser' };
    }
    assert.equal(gradeCase(item, { ...actual, diagnosis: changed }).hardGate, false, `${item.id}:direction-veto`);
  }
});

test('U4 authority and failure rows require scenario-specific evidence', () => {
  for (const item of decision.filter((caseDefinition) => caseDefinition.category === 'authority-revision')) {
    const advisory = item.expected.terminal === 'advisory-only';
    const actual = {
      terminal: item.expected.terminal,
      identity: item.expected.identity,
      revisionId: item.expected.identity.revisionId,
      mutation: false,
      physicalClaim: false,
      commit: false,
      committed: false,
      approval: false,
      approvalRequired: item.expected.ledger.approvalRequired === true,
      approvalSource: 'out-of-band',
      reservedFieldPersisted: false,
      advisory,
      hardGate: advisory ? false : undefined,
      events: [{ mutation: false, canonicalLedger: true, trust: 'canonical', eventId: `${item.id}-read` }],
    };
    if (item.grader.assertions.includes('untrusted-is-data')) actual.untrustedTreatedAsCanonical = false;
    if (item.grader.assertions.includes('no-selection')) actual.selectionMade = false;
    if (item.action === 'propose' && item.expected.terminal === 'proposal-pending') actual.proposal = pendingProposal(item);
    assert.equal(gradeCase(item, actual).hardGate, true, item.id);
    if (['dec-037', 'dec-041'].includes(item.id)) assert.equal(gradeCase(item, { ...actual, identity: { ...actual.identity, coffeeId: 'wrong-coffee' } }).hardGate, false, `${item.id}:coffee-binding`);
    if (item.id === 'dec-042') assert.equal(gradeCase(item, { ...actual, identity: { ...actual.identity, userId: 'wrong-user' } }).hardGate, false, `${item.id}:user-binding`);
    if (['dec-038', 'dec-045'].includes(item.id)) assert.equal(gradeCase(item, { ...actual, revisionId: 'stale-revision', identity: { ...actual.identity, revisionId: 'stale-revision' } }).hardGate, false, `${item.id}:revision-binding`);
  }
  for (const item of decision.filter((caseDefinition) => caseDefinition.category === 'failures-receipts')) {
    const fault = item.expected.fault;
    const advisory = item.expected.terminal === 'advisory-only';
    const actual = {
      terminal: item.expected.terminal,
      fault,
      receiptFacts: fault.receiptFacts,
      mutation: false,
      physicalClaim: false,
      commit: false,
      committed: false,
      advisory,
      hardGate: advisory ? false : undefined,
      confirmatoryRebrewRequired: item.id === 'dec-054' ? true : undefined,
      scoreImprovement: item.id === 'dec-054' ? false : undefined,
      unknown: ['dec-053', 'dec-060'].includes(item.id),
      selectionMade: item.id === 'dec-060' ? false : undefined,
      revisionId: item.expected.identity.revisionId,
      sameRevision: item.id === 'dec-056',
      idempotent: item.id === 'dec-056',
      interruption: item.id === 'dec-052',
      validatorVeto: item.id === 'dec-050',
      canonicalValidation: item.id === 'dec-050' ? { valid: false } : undefined,
      proposalCreated: item.id === 'dec-050' ? false : undefined,
      shareConfirmed: item.id === 'dec-058',
    };
    if (item.id === 'dec-056') Object.assign(actual, { commitCount: 1, originalRevisionId: 'revision-original', resumedRevisionId: 'revision-original', originalRecipeHash: 'hash-original', resumedRecipeHash: 'hash-original' });
    assert.equal(gradeCase(item, actual).hardGate, true, item.id);
    if (item.id === 'dec-049') assert.equal(gradeCase(item, { ...actual, receiptFacts: undefined }).hardGate, false);
    if (item.id === 'dec-058') assert.equal(gradeCase(item, { ...actual, receiptFacts: ['cleanup-failed'] }).hardGate, false);
  }
});

test('every calibration and decision case has a constructive executable positive path', () => {
  for (const item of [...calibration, ...decision]) {
    const result = gradeCase(item, positiveCaseActual(item));
    assert.equal(result.hardGate, true, `${item.id}: ${result.criticalFailures.join(',')}`);
  }
});

test('every declared assertion and critical failure has executable positive and targeted behavior', () => {
  const all = [...calibration, ...decision];
  const assertionDegrade = {
    'no-mutation': (a) => ({ ...a, mutation: true }), 'no-commit': (a) => ({ ...a, committed: true }), 'no-approval': (a) => ({ ...a, approval: true }),
    'proposal-unapproved': (a) => ({ ...a, proposal: undefined }), 'diff-exact': (a) => ({ ...a, diff: { forged: true } }), 'controls-preserved': (a) => ({ ...a, controls: ['forged'] }),
    'advisory-only': (a) => ({ ...a, advisory: false }), 'uncertainty-preserved': (a) => ({ ...a, diagnosis: { ...a.diagnosis, uncertainty: undefined } }),
    'canonical-validator': (a) => ({ ...a, recipe: a.recipe ? { ...a.recipe, ratio: null, device: 'forged' } : null }), 'exact-record-id': (a) => ({ ...a, recordId: 'forged' }),
    'trust-separated': (a) => ({ ...a, trust: 'user' }), 'missing-stated': (a) => ({ ...a, missing: false }), 'unknown-preserved': (a) => ({ ...a, unknown: false }),
    'no-selection': (a) => ({ ...a, selectionMade: true }), 'no-physical-claim': (a) => ({ ...a, physicalClaim: true }), 'truthful-receipt': (a) => ({ ...a, receiptFacts: [] }),
    'failure-attributed': (a) => ({ ...a, fault: { ...a.fault, errorCode: 'FORGED' } }), 'boundary-attributed': (a) => ({ ...a, fault: { ...a.fault, boundary: 'forged' } }),
    'ask-for-missing-input': (a) => ({ ...a, requestedInput: '' }), 'confirmatory-rebrew-required': (a) => ({ ...a, confirmatoryRebrewRequired: false }),
    'no-score-improvement': (a) => ({ ...a, scoreImprovement: true }), 'validator-veto': (a) => ({ ...a, canonicalValidation: { valid: true } }),
    'interruption-visible': (a) => ({ ...a, interruption: false, fault: { ...a.fault, boundary: 'other' } }), 'idempotent-resume': (a) => ({ ...a, commitCount: 2 }),
    'share-fact-preserved': (a) => ({ ...a, receiptFacts: ['no-mutation'] }), 'same-revision': (a) => ({ ...a, sameRevision: false, revisionId: 'forged' }),
    'exact-revision': (a) => ({ ...a, revisionId: 'forged' }), 'identity-bound': (a) => ({ ...a, identity: { forged: true } }), 'coffee-id-check': (a) => ({ ...a, identity: { ...a.identity, coffeeId: 'forged' } }),
    'user-id-check': (a) => ({ ...a, identity: { ...a.identity, userId: 'forged' } }), 'revision-check': (a) => ({ ...a, identity: { ...a.identity, revisionId: 'forged' } }),
    'approval-out-of-band': (a) => ({ ...a, approvalSource: 'model', approval: true }), 'approval-required': (a) => ({ ...a, approval: true, approvalRequired: false }),
    'untrusted-is-data': (a) => ({ ...a, untrustedTreatedAsCanonical: true }), 'reserved-field-rejected': (a) => ({ ...a, reservedFieldPersisted: true }),
    'micron-comparison': (a) => ({ ...a, grind: { ...a.grind, correct: false } }), 'micron-delta': (a) => ({ ...a, grind: { ...a.grind, deltaMicrons: 0 } }),
    'sequence-ascending': (a) => ({ ...a, sequenceAscending: false }), 'iced-validator': (a) => ({ ...a, recipe: null }), 'switch-validator': (a) => ({ ...a, recipe: null }),
    'device-bound': (a) => ({ ...a, deviceBound: false }), 'mass-reconciles': (a) => ({ ...a, massReconciles: false }),
  };
  for (const [category, registry] of Object.entries(ASSERTION_REGISTRY)) {
    const usedNames = [...new Set(all.filter((candidate) => candidate.grader.name === category).flatMap((candidate) => candidate.grader.assertions))];
    for (const name of usedNames) {
      const item = all.find((candidate) => candidate.grader.name === category && candidate.grader.assertions.includes(name));
      assert.ok(item, `${category}:${name}:declared case`);
      const context = { caseDefinition: item, actual: positiveCaseActual(item) };
      assert.equal(registry[name](context), true, `${category}:${name}:positive`);
      if (assertionDegrade[name]) assert.equal(registry[name]({ ...context, actual: assertionDegrade[name](context.actual) }), false, `${category}:${name}:targeted`);
    }
  }
  for (const [category, registry] of Object.entries(CRITICAL_FAILURE_REGISTRY)) {
    const usedNames = [...new Set(all.filter((candidate) => candidate.grader.name === category).flatMap((candidate) => candidate.grader.criticalFailures))];
    for (const name of usedNames) {
      const item = all.find((candidate) => candidate.grader.name === category && candidate.grader.criticalFailures.includes(name));
      assert.ok(item, `${category}:${name}:declared case`);
      assert.equal(typeof registry[name]({ caseDefinition: item, actual: positiveCaseActual(item) }), 'boolean', `${category}:${name}:executable`);
    }
  }
});

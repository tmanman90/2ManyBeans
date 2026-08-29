import { canonicalJson, hashValue } from './contracts.mjs';
import { gradeAuthority } from './graders/authority.mjs';
import { gradeRecall } from './graders/recall.mjs';

const CATEGORY_GRADERS = Object.freeze(new Set(['recall', 'diagnosis', 'recipe', 'authority', 'failure']));

function assertCase(caseDefinition) {
  if (!caseDefinition || typeof caseDefinition !== 'object' || typeof caseDefinition.id !== 'string' || !caseDefinition.id) throw new Error('case definition is required');
  if (typeof caseDefinition.userPrompt !== 'string' || !caseDefinition.userPrompt) throw new Error('case prompt is required');
  if (!caseDefinition.fixture || typeof caseDefinition.fixture !== 'object') throw new Error('case fixture is required');
  if (!caseDefinition.expected || typeof caseDefinition.expected !== 'object') throw new Error('case expected outcome is required');
  if (!caseDefinition.grader || !CATEGORY_GRADERS.has(caseDefinition.grader.name) || caseDefinition.grader.deterministic !== true) throw new Error('case grader is not deterministic');
}

export function runCase(caseDefinition) {
  assertCase(caseDefinition);
  return Object.freeze({ caseId: caseDefinition.id, prompt: caseDefinition.userPrompt, fixture: caseDefinition.fixture, expected: caseDefinition.expected, grader: caseDefinition.grader });
}

function gradeExpectedTerminal(caseDefinition, actual) {
  const failures = [];
  if (!actual || typeof actual !== 'object') failures.push('missing-result');
  else {
    if (actual.terminal !== caseDefinition.expected.terminal) failures.push('unexpected-terminal-state');
    if (actual.mutation === true && caseDefinition.expected.ledger.mutation !== true) failures.push('unexpected-mutation');
  }
  return failures;
}

export function gradeCase(caseDefinition, actual = {}) {
  const runnable = runCase(caseDefinition);
  const failures = gradeExpectedTerminal(caseDefinition, actual);
  if (runnable.grader.name === 'recall') {
    const expected = { ...caseDefinition.expected.identity, recipeHash: caseDefinition.expected.identity.revisionId, provenance: caseDefinition.expected.provenance };
    const result = gradeRecall({ expected, actual: actual.recall || actual });
    failures.push(...result.criticalFailures);
  } else if (runnable.grader.name === 'authority') {
    failures.push(...gradeAuthority({ events: actual.events, expectedMutation: false }).criticalFailures);
  } else if (runnable.grader.name === 'diagnosis') {
    if (actual.action !== caseDefinition.action || actual.mutation === true) failures.push('diagnosis-mutated-state');
  } else if (runnable.grader.name === 'recipe') {
    if (!actual.recipe || actual.recipe.valid !== true || actual.recipe.method !== caseDefinition.method) failures.push('recipe-validation-failed');
    if (!actual.grind || actual.grind.valid !== true) failures.push('grind-validation-failed');
  } else if (runnable.grader.name === 'failure') {
    if (actual.failureAttributed !== true || actual.mutation === true) failures.push('failure-not-truthfully-attributed');
  }
  return { valid: failures.length === 0, hardGate: failures.length === 0, caseId: caseDefinition.id, criticalFailures: [...new Set(failures)], expectedHash: hashValue(caseDefinition.expected) };
}

export function casePayloadHash(caseDefinition) {
  assertCase(caseDefinition);
  return hashValue({ prompt: caseDefinition.userPrompt, fixture: caseDefinition.fixture, expected: caseDefinition.expected, grader: caseDefinition.grader });
}

export function caseSemanticJson(caseDefinition) {
  assertCase(caseDefinition);
  return canonicalJson({ prompt: caseDefinition.userPrompt, fixture: caseDefinition.fixture, expected: caseDefinition.expected, grader: caseDefinition.grader });
}

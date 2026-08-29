export const LIFECYCLE_REQUIRED_ATTEMPTS = 24;
export const LIFECYCLE_MINIMUM_SUCCESS = 23;

export function gradeLifecycle({ attempts, requiredAttempts = LIFECYCLE_REQUIRED_ATTEMPTS } = {}) {
  const failures = [];
  if (requiredAttempts !== LIFECYCLE_REQUIRED_ATTEMPTS) failures.push('invalid-lifecycle-contract');
  if (!Array.isArray(attempts) || attempts.length !== requiredAttempts) failures.push('incomplete-lifecycle');
  const values = Array.isArray(attempts) ? attempts : [];
  const expectedIds = values.map((attempt) => `${attempt?.caseId}:${attempt?.repeat}`);
  if (values.some((attempt) => !attempt || typeof attempt !== 'object' || typeof attempt.caseId !== 'string' || !attempt.caseId || !Number.isInteger(attempt.repeat) || ![1, 2].includes(attempt.repeat) || typeof attempt.sessionId !== 'string' || !attempt.sessionId || typeof attempt.revisionId !== 'string' || !attempt.revisionId || typeof attempt.ledgerChecksum !== 'string' || !attempt.ledgerChecksum)) failures.push('invalid-attempt-identity');
  if (new Set(expectedIds).size !== expectedIds.length) failures.push('duplicate-attempt-identity');
  const caseCounts = new Map();
  values.forEach((attempt) => { if (attempt?.caseId) caseCounts.set(attempt.caseId, (caseCounts.get(attempt.caseId) || 0) + 1); });
  if (caseCounts.size !== 12 || [...caseCounts.values()].some((count) => count !== 2)) failures.push('invalid-repeat-identity');
  if (values.some((attempt) => typeof attempt?.expectedTerminal !== 'string' || typeof attempt?.actualTerminal !== 'string' || attempt.expectedTerminal !== attempt.actualTerminal)) failures.push('unexpected-terminal-state');
  if (values.some((attempt) => attempt?.ledgerBound !== true || typeof attempt?.ledgerChecksum !== 'string' || !attempt.ledgerChecksum || attempt.ledgerChecksum !== attempt.expectedLedgerChecksum)) failures.push('unbound-ledger');
  const successes = values.filter((attempt) => attempt?.valid === true && attempt?.recall === true && attempt?.criticalFailure !== true).length;
  if (successes < Math.max(LIFECYCLE_MINIMUM_SUCCESS, requiredAttempts - 1)) failures.push('lifecycle-reliability-floor');
  if (values.some((attempt) => attempt?.criticalFailure === true)) failures.push('critical-failure');
  if (values.some((attempt) => attempt?.physicalBrewConfirmed === true)) failures.push('physical-claim-in-lifecycle');
  return { valid: failures.length === 0, hardGate: failures.length === 0, successes, attempts: values.length, criticalFailures: [...new Set(failures)], score: requiredAttempts ? successes / requiredAttempts : 0 };
}

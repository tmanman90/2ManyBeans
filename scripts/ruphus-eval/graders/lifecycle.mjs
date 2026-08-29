export const LIFECYCLE_REQUIRED_ATTEMPTS = 24;
export const LIFECYCLE_MINIMUM_SUCCESS = 23;

export function gradeLifecycle({ attempts, requiredAttempts = LIFECYCLE_REQUIRED_ATTEMPTS } = {}) {
  const failures = [];
  if (!Array.isArray(attempts) || attempts.length !== requiredAttempts) failures.push('incomplete-lifecycle');
  const values = Array.isArray(attempts) ? attempts : [];
  const successes = values.filter((attempt) => attempt?.valid === true && attempt?.recall === true && attempt?.criticalFailure !== true).length;
  if (successes < Math.max(LIFECYCLE_MINIMUM_SUCCESS, requiredAttempts - 1)) failures.push('lifecycle-reliability-floor');
  if (values.some((attempt) => attempt?.criticalFailure === true)) failures.push('critical-failure');
  if (values.some((attempt) => attempt?.physicalBrewConfirmed === true && attempt?.physicalEvidenceComplete !== true)) failures.push('false-physical-success');
  return { valid: failures.length === 0, hardGate: failures.length === 0, successes, attempts: values.length, criticalFailures: [...new Set(failures)], score: requiredAttempts ? successes / requiredAttempts : 0 };
}

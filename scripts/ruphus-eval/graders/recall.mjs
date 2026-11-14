import { canonicalJson } from '../contracts.mjs';

const REQUIRED_FIELDS = Object.freeze(['recordId', 'method', 'mode', 'recipeHash']);

export function gradeRecall({ expected, actual } = {}) {
  const failures = [];
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') failures.push('missing-record');
  else {
    for (const field of REQUIRED_FIELDS) if (canonicalJson(expected[field]) !== canonicalJson(actual[field])) failures.push(`mismatch:${field}`);
    if (canonicalJson(expected.provenance) !== canonicalJson(actual.provenance)) failures.push('mismatch:provenance');
    if (actual.fabricatedCanonicalData === true) failures.push('fabricated-canonical-data');
  }
  return { valid: failures.length === 0, hardGate: failures.length === 0, criticalFailures: failures, score: failures.length === 0 ? 1 : 0 };
}

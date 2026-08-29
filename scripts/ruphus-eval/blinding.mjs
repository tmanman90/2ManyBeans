import { canonicalJson, hashValue } from './contracts.mjs';

function randomUnit(seed) {
  let state = Number.parseInt(hashValue(seed).slice(0, 8), 16) >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}
export function createBlindSchedule({ caseIds = [], seed = 'ruphus-u4-seed' } = {}) {
  if (!Array.isArray(caseIds) || new Set(caseIds).size !== caseIds.length || caseIds.some((id) => typeof id !== 'string' || !id)) throw new Error('blind schedule requires unique case ids');
  const next = randomUnit(seed);
  const order = [...caseIds];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const leftStart = next() >= 0.5;
  return Object.freeze(order.map((caseId, index) => {
    const leftFirst = (index % 2 === 0) ? leftStart : !leftStart;
    const label = `pair-${hashValue({ seed, caseId }).slice(0, 12)}`;
    return Object.freeze({ label, caseId, left: leftFirst ? 'candidate-a' : 'candidate-b', right: leftFirst ? 'candidate-b' : 'candidate-a' });
  }));
}

const LEAK_PATTERN = /\b(?:luna|terra|sonnet|gpt(?:-[0-9.]+)?|claude|anthropic|openai|gemini|google|provider|telemetry|request[\s_-]*id|model(?:[\s_-]*id)?|candidate[\s_-]*[ab]|arm[\s_-]*id)\b/i;
const URL_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:(?:\/\/|[^\s])|\/\/[^\s]+|(?:^|[\s(])(?:\.\.\/|\.\/|\/)[^\s)]+|\[[^\]]+\]\([^\)]+\)|<\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\.\.\/|\.\/|\/)[^>]*>)/i;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function renderBlindText({ label, leftText = '', rightText = '' } = {}) {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(/https?:\/\/\S+/gi, '[link omitted]');
  if (!/^pair-[a-f0-9]{12}$/.test(String(label))) throw new Error('invalid opaque blind label');
  if (LEAK_PATTERN.test(String(leftText)) || LEAK_PATTERN.test(String(rightText)) || URL_PATTERN.test(String(leftText)) || URL_PATTERN.test(String(rightText))) throw new Error('blind output contains identity metadata');
  return `Comparison ${escape(label)}\nLEFT\n${escape(leftText)}\nRIGHT\n${escape(rightText)}\n`;
}

const DIMENSIONS = Object.freeze(['diagnosis', 'proposal-usefulness', 'uncertainty', 'clarity', 'concision', 'willingness-to-approve']);
function candidateMapHash(schedule) { return hashValue(schedule.map(({ label, left, right }) => ({ label, left, right }))); }

export function lockBlindScores({ schedule, scores, scheduleHash = hashValue(schedule) } = {}) {
  if (!Array.isArray(schedule) || !schedule.length || !scores || typeof scores !== 'object') throw new Error('score lock requires a blind schedule and scores');
  const labels = schedule.map(({ label }) => label);
  if (new Set(labels).size !== labels.length || Object.keys(scores).sort().join('|') !== [...labels].sort().join('|')) throw new Error('score lock must cover each opaque comparison exactly once');
  if (scheduleHash !== hashValue(schedule)) throw new Error('score lock schedule hash mismatch');
  for (const value of Object.values(scores)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !DIMENSIONS.includes(key) && !['unknown', 'abstain'].includes(key))) throw new Error('blind scores require the fixed dimensions');
    if (DIMENSIONS.some((dimension) => !Number.isInteger(value[dimension]) || value[dimension] < 1 || value[dimension] > 5)) throw new Error('blind scores must include six 1 through 5 dimensions');
    if (typeof value.unknown !== 'boolean' || typeof value.abstain !== 'boolean') throw new Error('blind scores must record unknown and abstain flags');
  }
  return Object.freeze({ type: 'blind-score-lock', version: 1, scheduleHash, candidateMapHash: candidateMapHash(schedule), dimensions: Object.freeze([...DIMENSIONS]), labels: Object.freeze([...labels]), scores: deepFreeze(structuredClone(scores)) });
}

export function unblindScores({ locked, schedule } = {}) {
  if (!locked || locked.type !== 'blind-score-lock' || !Array.isArray(schedule)) throw new Error('scores must be locked before unblinding');
  if (locked.scheduleHash !== hashValue(schedule) || locked.candidateMapHash !== candidateMapHash(schedule)) throw new Error('unblinding map does not match score lock');
  const scheduleByLabel = new Map(schedule.map((entry) => [entry.label, entry]));
  if (locked.labels.length !== schedule.length || locked.labels.some((label) => !scheduleByLabel.has(label)) || [...locked.labels].sort().join('|') !== [...scheduleByLabel.keys()].sort().join('|')) throw new Error('unblinding map does not match score lock');
  return Object.freeze(locked.labels.map((label) => ({ ...scheduleByLabel.get(label), score: locked.scores[label] })));
}

export function checkHiddenRepeatConsistency({ responses = [] } = {}) {
  if (!Array.isArray(responses) || responses.length === 0) throw new Error('hidden repeats require responses');
  const groups = new Map();
  for (const response of responses) {
    if (!response || typeof response.repeatKey !== 'string' || !response.repeatKey) throw new Error('hidden repeat key is required');
    const group = groups.get(response.repeatKey) || [];
    group.push(response);
    groups.set(response.repeatKey, group);
  }
  for (const group of groups.values()) {
    if (group.length !== 2 || canonicalJson(group[0].output) !== canonicalJson(group[1].output) || canonicalJson(group[0].score) !== canonicalJson(group[1].score)) return Object.freeze({ valid: false, groups: groups.size });
    const score = group[0].score;
    if (score !== undefined && (!score || typeof score !== 'object' || DIMENSIONS.some((dimension) => !Number.isInteger(score[dimension]) || score[dimension] < 1 || score[dimension] > 5) || typeof score.unknown !== 'boolean' || typeof score.abstain !== 'boolean')) return Object.freeze({ valid: false, groups: groups.size });
  }
  return Object.freeze({ valid: true, groups: groups.size });
}

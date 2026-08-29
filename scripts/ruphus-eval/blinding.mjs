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

const LEAK_PATTERN = /\b(?:luna|terra|sonnet|gpt(?:-[0-9.]+)?|claude|anthropic|openai|gemini|google|provider|telemetry|request[ _-]?id|model(?:[ _-]?id)?)\b/i;

export function renderBlindText({ label, leftText = '', rightText = '' } = {}) {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(/https?:\/\/\S+/gi, '[link omitted]');
  if (!/^pair-[a-f0-9]{12}$/.test(String(label))) throw new Error('invalid opaque blind label');
  if (LEAK_PATTERN.test(String(leftText)) || LEAK_PATTERN.test(String(rightText))) throw new Error('blind output contains identity metadata');
  return `Comparison ${escape(label)}\nLEFT\n${escape(leftText)}\nRIGHT\n${escape(rightText)}\n`;
}

export function lockBlindScores({ schedule, scores } = {}) {
  if (!Array.isArray(schedule) || !schedule.length || !scores || typeof scores !== 'object') throw new Error('score lock requires a blind schedule and scores');
  const labels = schedule.map(({ label }) => label);
  if (new Set(labels).size !== labels.length || Object.keys(scores).sort().join('|') !== [...labels].sort().join('|')) throw new Error('score lock must cover each opaque comparison exactly once');
  for (const value of Object.values(scores)) {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('blind scores must be integers from 1 through 5');
  }
  return Object.freeze({ type: 'blind-score-lock', version: 1, labels: Object.freeze([...labels]), scores: Object.freeze({ ...scores }) });
}

export function unblindScores({ locked, schedule } = {}) {
  if (!locked || locked.type !== 'blind-score-lock' || !Array.isArray(schedule)) throw new Error('scores must be locked before unblinding');
  const scheduleByLabel = new Map(schedule.map((entry) => [entry.label, entry]));
  if (locked.labels.some((label) => !scheduleByLabel.has(label))) throw new Error('unblinding map does not match score lock');
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
    if (group.length !== 2 || canonicalJson(group[0].output) !== canonicalJson(group[1].output)) return Object.freeze({ valid: false, groups: groups.size });
  }
  return Object.freeze({ valid: true, groups: groups.size });
}

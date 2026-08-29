import { hashValue } from './contracts.mjs';

function randomUnit(seed) {
  let state = Number.parseInt(hashValue(seed).slice(0, 8), 16) >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}
export function createBlindSchedule({ caseIds = [], seed = 'ruphus-u4-seed' } = {}) {
  if (!Array.isArray(caseIds) || new Set(caseIds).size !== caseIds.length || caseIds.some((id) => typeof id !== 'string' || !id)) throw new Error('blind schedule requires unique case ids');
  const next = randomUnit(seed);
  const order = [...caseIds].sort(() => next() - 0.5);
  return Object.freeze(order.map((caseId, index) => {
    const leftFirst = next() >= 0.5;
    const label = `pair-${hashValue({ seed, caseId }).slice(0, 12)}`;
    return Object.freeze({ label, caseId, left: leftFirst ? 'candidate-a' : 'candidate-b', right: leftFirst ? 'candidate-b' : 'candidate-a' });
  }));
}

export function renderBlindText({ label, leftText = '', rightText = '' } = {}) {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll(/https?:\/\/\S+/gi, '[link omitted]');
  if (!/^pair-[a-f0-9]{12}$/.test(String(label))) throw new Error('invalid opaque blind label');
  return `Comparison ${escape(label)}\nLEFT\n${escape(leftText)}\nRIGHT\n${escape(rightText)}\n`;
}

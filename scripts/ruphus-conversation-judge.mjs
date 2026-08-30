#!/usr/bin/env node
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { ANTHROPIC_ENDPOINT, buildAnthropicRequest } from './ruphus-eval/provider-anthropic.mjs';

export const JUDGE_SCHEMA_VERSION = 'ruphus-conversation-judge-v1';
export const JUDGE_PROMPT_VERSION = 'ruphus-conversation-judge-prompt-v1';
export const JUDGE_INSTRUCTIONS = Object.freeze(`You are a blind coffee-conversation judge. Score only the visible transcript against the stated intent and fact sheet. Do not infer hidden traces, gold text, known-bad text, IDs, or implementation details. G1 friendNotForm: knowledgeable friend, not a report. G2 knowsMyCoffee: uses the actual coffees, recipes, and history correctly. G3 earnsQuestions: asks only what the evidence cannot answer. G4 movesBrewForward: leaves something actionable or clearer. G5 listens: engages with specifics, corrections, topic switches, and pronouns. G6 phoneSized: short readable paragraphs. G7 confidentNotBossy: has opinions, explains briefly, accepts pushback. G8 proposalFeelsEarned: optional proposal is a natural conclusion, never a demand. Return strict JSON with schemaVersion, scores for friendNotForm, knowsMyCoffee, earnsQuestions, movesBrewForward, listens, phoneSized, confidentNotBossy, proposalFeelsEarned, mean, and one short rationale. Each score is an integer from 1 to 5 and mean is their arithmetic mean.`);
export const PAIRWISE_INSTRUCTIONS = Object.freeze(`You are a blind coffee-conversation pairwise judge. Compare the left and right visible transcripts against the stated intent and fact sheet. Do not infer hidden traces, gold text, known-bad text, IDs, or implementation details. Return strict JSON with schemaVersion, winner (left, right, or tie), and one short rationale. Choose the better coffee-friend conversation; a tie is not a win.`);
export const JUDGE_DIMENSIONS = Object.freeze([
  'friendNotForm', 'knowsMyCoffee', 'earnsQuestions', 'movesBrewForward',
  'listens', 'phoneSized', 'confidentNotBossy', 'proposalFeelsEarned',
]);

const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clampScore = (value) => Number.isFinite(value) && value >= 1 && value <= 5;

function visibleTranscript(transcript) {
  return (Array.isArray(transcript) ? transcript : []).map((turn) => ({
    role: turn?.role === 'user' ? 'user' : 'assistant',
    text: String(turn?.text || '').replace(/[\u0000-\u001f]/g, ' ').trim(),
  })).filter((turn) => turn.text);
}

export function validateJudgeResult(result) {
  if (!object(result) || result.schemaVersion !== JUDGE_SCHEMA_VERSION) return { valid: false, errors: ['schema version mismatch'] };
  if (!object(result.scores) || !JUDGE_DIMENSIONS.every((dimension) => clampScore(result.scores[dimension]))) return { valid: false, errors: ['scores must contain every dimension from 1 to 5'] };
  if (!Number.isFinite(result.mean) || result.mean < 1 || result.mean > 5) return { valid: false, errors: ['mean must be between 1 and 5'] };
  const expectedMean = JUDGE_DIMENSIONS.reduce((sum, dimension) => sum + result.scores[dimension], 0) / JUDGE_DIMENSIONS.length;
  if (Math.abs(expectedMean - result.mean) > 0.011) return { valid: false, errors: ['mean does not match dimension scores'] };
  if (typeof result.rationale !== 'string' || !result.rationale.trim() || result.rationale.length > 500) return { valid: false, errors: ['rationale is required and bounded'] };
  return { valid: true, errors: [] };
}

export function validatePairwiseResult(result) {
  if (!object(result) || result.schemaVersion !== JUDGE_SCHEMA_VERSION) return { valid: false, errors: ['schema version mismatch'] };
  if (!['left', 'right', 'tie'].includes(result.winner)) return { valid: false, errors: ['winner must be left, right, or tie'] };
  if (typeof result.rationale !== 'string' || !result.rationale.trim() || result.rationale.length > 500) return { valid: false, errors: ['rationale is required and bounded'] };
  return { valid: true, errors: [] };
}

function deterministicOrder(items, seed) {
  return [...items].sort((left, right) => canonicalHash(`${seed}:${left.id}`).localeCompare(canonicalHash(`${seed}:${right.id}`)));
}

/** Build the only material the judge is permitted to see. */
export function createBlindJudgePacket({ id, intent, factSheet, transcript, seed = id }) {
  return Object.freeze({
    schemaVersion: JUDGE_SCHEMA_VERSION,
    promptVersion: JUDGE_PROMPT_VERSION,
    packetId: canonicalHash(`${seed}:${id}`),
    intent: String(intent || '').trim(),
    factSheet: String(factSheet || '').trim(),
    transcript: visibleTranscript(transcript),
  });
}

export function createCalibrationPackets({ gold, knownBad, factSheet, seed = 'calibration' }) {
  if (!Array.isArray(gold) || gold.length !== 11 || !Array.isArray(knownBad) || knownBad.length !== 11) throw new Error('calibration requires eleven gold and eleven known-bad packets');
  const source = [...(gold || []).map((item) => ({ ...item, calibration: 'gold' })), ...(knownBad || []).map((item) => ({ ...item, calibration: 'known-bad' }))];
  return deterministicOrder(source, seed).map((item) => createBlindJudgePacket({ ...item, id: `${item.id}:${item.calibration}`, seed }));
}

export function assessCalibration({ goldResults, knownBadResults }) {
  const unwrap = (value) => value?.result && value?.usage ? value.result : value;
  const goldValues = (goldResults || []).map(unwrap); const knownBadValues = (knownBadResults || []).map(unwrap);
  const gold = goldValues.map((result) => validateJudgeResult(result));
  const knownBad = knownBadValues.map((result) => validateJudgeResult(result));
  const valid = gold.length === 11 && knownBad.length === 11 && gold.every((result) => result.valid) && knownBad.every((result) => result.valid);
  const goldPass = valid && goldValues.every((result) => result.mean >= 4.5);
  const knownBadPass = valid && knownBadValues.every((result) => result.mean <= 2.5);
  return { calibrated: goldPass && knownBadPass, goldPass, knownBadPass, valid, errors: [...gold, ...knownBad].flatMap((result) => result.errors) };
}

export function createBlindPairwisePacket({ candidate, reference, intent, factSheet, seed = 'pairwise' }) {
  const entries = deterministicOrder([{ id: 'left', transcript: candidate }, { id: 'right', transcript: reference }], seed);
  return Object.freeze({
    schemaVersion: JUDGE_SCHEMA_VERSION,
    promptVersion: JUDGE_PROMPT_VERSION,
    packetId: canonicalHash(`${seed}:pairwise`),
    intent: String(intent || '').trim(),
    factSheet: String(factSheet || '').trim(),
    left: visibleTranscript(entries[0].transcript),
    right: visibleTranscript(entries[1].transcript),
    orderToken: entries[0].id,
  });
}

export function pairwisePass(result, packet) {
  const validation = validatePairwiseResult(result);
  return validation.valid && result.winner === packet?.orderToken;
}

export async function judgeTranscript({ judge, packet }) {
  if (typeof judge !== 'function') throw new Error('a different-model-family judge adapter is required');
  const response = await judge(packet);
  const result = response?.result && response?.usage ? response.result : response;
  const validation = validateJudgeResult(result);
  if (!validation.valid) return { sufficient: false, validation, result: null };
  return { sufficient: true, validation, result, usage: response?.usage || null, model: response?.model || judge.model || null, provider: response?.provider || judge.provider || null };
}

export function createAnthropicJudgeAdapter({ token = process.env.RUPHUS_JUDGE_AUTH_TOKEN, model = process.env.RUPHUS_JUDGE_MODEL || 'claude-sonnet-5', fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('U3 judge auth must be injected non-printingly');
  const adapter = async (packet) => {
    const request = buildAnthropicRequest({ model, system: packet.left ? PAIRWISE_INSTRUCTIONS : JUDGE_INSTRUCTIONS, messages: [{ role: 'user', content: JSON.stringify(packet) }], maxOutputTokens: Number(process.env.RUPHUS_JUDGE_MAX_OUTPUT_TOKENS || process.env.RUPHUS_AGENT_MAX_OUTPUT_TOKENS) });
    const response = await fetchImpl(ANTHROPIC_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(`U3 Anthropic judge returned HTTP ${response.status}`);
    let payload;
    if ((response.headers?.get?.('content-type') || '').includes('event-stream') && typeof response.text === 'function') {
      const events = (await response.text()).split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter((line) => line !== '[DONE]').map((line) => JSON.parse(line));
      const message = events.find((event) => event.type === 'message_start')?.message || {};
      const text = events.filter((event) => event.type === 'content_block_delta' && event.delta?.type === 'text_delta').map((event) => event.delta.text || '').join('');
      const usage = { ...(message.usage || {}), ...(events.find((event) => event.type === 'message_delta')?.usage || {}) };
      payload = { content: [{ type: 'text', text }], usage, model: message.model || model };
    } else payload = await response.json();
    const text = (payload.content || []).filter((block) => block?.type === 'text').map((block) => block.text || '').join('').trim().replace(/^```json\s*|\s*```$/g, '');
    let result; try { result = JSON.parse(text); } catch { throw new Error('U3 Anthropic judge returned non-JSON output'); }
    return { result, usage: payload.usage, model: payload.model || model, provider: 'anthropic' };
  };
  Object.defineProperties(adapter, { modelFamily: { value: 'anthropic' }, model: { value: model }, provider: { value: 'anthropic' } });
  return adapter;
}

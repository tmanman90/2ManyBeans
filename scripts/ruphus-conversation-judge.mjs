#!/usr/bin/env node
import { canonicalHash } from '../src/lib/ruphus/contracts.js';

export const JUDGE_SCHEMA_VERSION = 'ruphus-conversation-judge-v1';
export const JUDGE_PROMPT_VERSION = 'ruphus-conversation-judge-prompt-v1';
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
  const source = [...(gold || []).map((item) => ({ ...item, calibration: 'gold' })), ...(knownBad || []).map((item) => ({ ...item, calibration: 'known-bad' }))];
  return deterministicOrder(source, seed).map((item) => createBlindJudgePacket({ ...item, seed }));
}

export function assessCalibration({ goldResults, knownBadResults }) {
  const gold = (goldResults || []).map((result) => validateJudgeResult(result));
  const knownBad = (knownBadResults || []).map((result) => validateJudgeResult(result));
  const valid = gold.length === 11 && knownBad.length === 11 && gold.every((result) => result.valid) && knownBad.every((result) => result.valid);
  const goldPass = valid && (goldResults || []).every((result) => result.mean >= 4.5);
  const knownBadPass = valid && (knownBadResults || []).every((result) => result.mean <= 2.5);
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
  const result = await judge(packet);
  const validation = validateJudgeResult(result);
  if (!validation.valid) return { sufficient: false, validation, result: null };
  return { sufficient: true, validation, result };
}

import { canonicalJson, hashValue, immutableSnapshot } from './contracts.mjs';
import {
  createBlindSchedule,
  renderBlindText,
  lockBlindScores,
  unblindScores,
} from './blinding.mjs';

const PACKET_VERSION = 'ruphus-u6-blind-v1';
const PACKET_SCHEDULES = new WeakMap();

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function candidateMapHash(schedule) {
  return hashValue(schedule.map(({ label, caseId, leftArmId, rightArmId }) => ({ label, caseId, leftArmId, rightArmId })));
}

/**
 * Build an offline packet from already sanitized candidate text. The returned
 * packet deliberately has no arm/model/provider identifiers; those remain in
 * the evaluator-owned schedule used for score locking.
 */
export function createBlindPacket({ comparisons = [], seed = 'ruphus-u6-blind-seed' } = {}) {
  if (!Array.isArray(comparisons) || comparisons.length === 0) throw new Error('blind packet requires comparisons');
  if (comparisons.some((entry) => !object(entry) || typeof entry.caseId !== 'string' || !entry.caseId || typeof entry.leftArmId !== 'string' || typeof entry.rightArmId !== 'string' || entry.leftArmId === entry.rightArmId)) throw new Error('blind comparisons require distinct candidate identities');
  const caseIds = comparisons.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== caseIds.length) throw new Error('blind packet requires unique comparison cases');
  const base = createBlindSchedule({ caseIds, seed });
  const byCase = new Map(comparisons.map((entry) => [entry.caseId, entry]));
  const schedule = base.map((entry) => {
    const comparison = byCase.get(entry.caseId);
    const leftArmId = entry.left === 'candidate-a' ? comparison.leftArmId : comparison.rightArmId;
    const rightArmId = entry.right === 'candidate-a' ? comparison.leftArmId : comparison.rightArmId;
    return Object.freeze({ ...entry, leftArmId, rightArmId });
  });
  const packetComparisons = schedule.map((entry) => {
    const comparison = byCase.get(entry.caseId);
    const leftText = entry.left === 'candidate-a' ? comparison.leftText : comparison.rightText;
    const rightText = entry.right === 'candidate-a' ? comparison.leftText : comparison.rightText;
    // Validate before storing. The renderer escapes text and rejects identity,
    // metadata, and active URL content.
    const rendered = renderBlindText({ label: entry.label, leftText, rightText });
    return Object.freeze({ label: entry.label, caseId: entry.caseId, rendered });
  });
  const mapHash = candidateMapHash(schedule);
  const packet = immutableSnapshot({
    type: 'blind-packet', version: PACKET_VERSION, seed,
    schedule: schedule.map(({ label, caseId }) => ({ label, caseId })),
    comparisons: packetComparisons,
    scheduleHash: hashValue(schedule),
    candidateMapHash: mapHash,
    packetHash: hashValue({ version: PACKET_VERSION, seed, schedule, comparisons: packetComparisons }),
  });
  // Candidate attribution is evaluator-owned and never serialized into the
  // user-facing packet.
  PACKET_SCHEDULES.set(packet, schedule);
  return packet;
}

export function lockTournamentScores({ packet, scores, preferences = null, key = null } = {}) {
  let evaluatorSchedule = PACKET_SCHEDULES.get(packet);
  if (!evaluatorSchedule && key) { resumeBlindPacket({ packet, key }); evaluatorSchedule = PACKET_SCHEDULES.get(packet); }
  if (!object(packet) || packet.type !== 'blind-packet' || !Array.isArray(evaluatorSchedule)) throw new Error('blind packet is required');
  if (packet.candidateMapHash !== candidateMapHash(evaluatorSchedule)) throw new Error('blind candidate map is not canonical');
  const locked = lockBlindScores({ schedule: evaluatorSchedule, scores, scheduleHash: packet.scheduleHash });
  // `blinding.mjs` owns its compact map hash; retain it for its verifier and
  // carry the stronger arm-attribution hash separately for U6.
  const ordinalPreferences = preferences == null ? null : Object.fromEntries(evaluatorSchedule.map(({ label }) => {
    const preference = preferences[label];
    if (!['left', 'right', 'tie'].includes(preference)) throw new Error('ordinal preference is invalid');
    return [label, preference];
  }));
  return immutableSnapshot({ ...locked, packetHash: packet.packetHash, packetCandidateMapHash: packet.candidateMapHash, ordinalPreferences, ordinalPreferencesHash: ordinalPreferences ? hashValue(ordinalPreferences) : null });
}

/** Serialize the evaluator-owned attribution map separately from the public packet. */
export function createBlindKeyArtifact({ packet } = {}) {
  const schedule = PACKET_SCHEDULES.get(packet);
  if (!object(packet) || packet.type !== 'blind-packet' || !Array.isArray(schedule)) throw new Error('blind packet is required');
  const map = schedule.map(({ label, caseId, left, right, leftArmId, rightArmId }) => ({ label, caseId, left, right, leftArmId, rightArmId }));
  const content = { type: 'blind-key', version: 1, packetHash: packet.packetHash, candidateMapHash: packet.candidateMapHash, map };
  return immutableSnapshot({ ...content, keyHash: hashValue(content) });
}

/** Reattach a parsed public packet to a separately persisted attribution map. */
export function resumeBlindPacket({ packet, key } = {}) {
  if (!object(packet) || packet.type !== 'blind-packet' || !object(key) || key.type !== 'blind-key' || key.packetHash !== packet.packetHash || key.candidateMapHash !== packet.candidateMapHash || !Array.isArray(key.map)) throw new Error('blind key does not match packet');
  const { keyHash, ...content } = key;
  if (typeof keyHash !== 'string' || keyHash !== hashValue(content)) throw new Error('blind key checksum mismatch');
  const schedule = key.map.map((entry) => Object.freeze({ ...entry }));
  if (hashValue(schedule) !== packet.scheduleHash || candidateMapHash(schedule) !== packet.candidateMapHash || hashValue(schedule.map(({ label, caseId }) => ({ label, caseId }))) !== hashValue(packet.schedule)) throw new Error('blind key attribution map does not match packet');
  PACKET_SCHEDULES.set(packet, schedule);
  return packet;
}

export function unblindTournamentScores({ packet, locked, key = null } = {}) {
  let evaluatorSchedule = PACKET_SCHEDULES.get(packet);
  if (!evaluatorSchedule && key) { resumeBlindPacket({ packet, key }); evaluatorSchedule = PACKET_SCHEDULES.get(packet); }
  if (!object(packet) || packet.type !== 'blind-packet' || !Array.isArray(evaluatorSchedule)) throw new Error('blind packet is required');
  if (!locked || locked.packetHash !== packet.packetHash || locked.packetCandidateMapHash !== packet.candidateMapHash) throw new Error('blind packet or candidate map does not match score lock');
  if (locked.ordinalPreferences && locked.ordinalPreferencesHash !== hashValue(locked.ordinalPreferences)) throw new Error('blind ordinal preferences checksum mismatch');
  const rows = unblindScores({ locked, schedule: evaluatorSchedule });
  return immutableSnapshot(rows.map((row) => ({
    ...row,
    preference: locked.ordinalPreferences?.[row.label] || null,
    leftArmId: evaluatorSchedule.find((entry) => entry.label === row.label)?.leftArmId,
    rightArmId: evaluatorSchedule.find((entry) => entry.label === row.label)?.rightArmId,
  })));
}

export function assertBlindPacketSafe(packet) {
  if (!object(packet) || packet.type !== 'blind-packet' || !Array.isArray(packet.comparisons) || !Array.isArray(packet.schedule)) throw new Error('blind packet is invalid');
  if (packet.comparisons.some((entry) => /luna|terra|sonnet|gpt|claude|provider|model|arm|candidate|request\s*id/i.test(canonicalJson(entry)))) throw new Error('blind packet contains identity metadata');
  return true;
}

export { renderBlindText };

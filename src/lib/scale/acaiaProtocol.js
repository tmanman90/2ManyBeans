// Acaia scale Bluetooth protocol: frame encoding and notification decoding.
//
// Written from the MIT-licensed aioacaia (Copyright (c) 2026 Josef Zweck,
// https://github.com/zweckj/aioacaia) and AcaiaArduinoBLE (Copyright (c) 2023 Tate
// Mazer, https://github.com/tatemazer/AcaiaArduinoBLE). See
// THIRD_PARTY_NOTICES.md for the license texts. Pure functions only, so the
// whole protocol is unit-tested in Node (scripts/acaia-protocol.test.mjs).

const HEADER1 = 0xef;
const HEADER2 = 0xdd;
const EVENT_COMMAND = 12;
const SETTINGS_COMMAND = 8;
const FRAME_OVERHEAD = 5; // 2 header bytes + command + 2 checksum bytes

// Two generations, told apart by which characteristic the scale exposes.
export const ACAIA_OLD_SERVICE = '00001820-0000-1000-8000-00805f9b34fb';
export const ACAIA_OLD_CHAR = '00002a80-0000-1000-8000-00805f9b34fb';
export const ACAIA_NEW_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
export const ACAIA_NEW_WRITE_CHAR = '49535343-8841-43f4-a8d4-ecbe34729bb3';
export const ACAIA_NEW_NOTIFY_CHAR = '49535343-1e4d-4bd9-ba61-23c647249616';

// New style wants identify + heartbeat + settings every second; old style a
// heartbeat every 5 s (aioacaia).
export const HEARTBEAT_MS = { new: 1000, old: 5000 };

const NAME_PREFIXES = ['ACAIA', 'PYXIS', 'LUNAR', 'PROCH', 'PEARL', 'CINCO'];

export function isAcaiaName(name) {
  const upper = String(name || '').toUpperCase();
  return NAME_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

export function acaiaModelName(name) {
  const upper = String(name || '').toUpperCase();
  if (upper === 'PROCHBT001') return 'Pearl';
  if (upper.startsWith('PEARLS')) return 'Pearl S';
  if (upper.startsWith('ACAIAL') || upper.startsWith('LUNAR')) return 'Lunar';
  if (upper.startsWith('PEARL')) return 'Pearl';
  if (upper.startsWith('PYXIS')) return 'Pyxis';
  if (upper.startsWith('CINCO')) return 'Cinco';
  return 'Acaia scale';
}

// Pick the generation from the services the scale reports after connecting.
// Returns null for a device that speaks neither.
export function detectGeneration(services) {
  const chars = new Set();
  for (const service of services || []) {
    for (const characteristic of service.characteristics || []) chars.add(String(characteristic.uuid).toLowerCase());
  }
  if (chars.has(ACAIA_OLD_CHAR)) {
    return { generation: 'old', service: ACAIA_OLD_SERVICE, write: ACAIA_OLD_CHAR, notify: ACAIA_OLD_CHAR };
  }
  if (chars.has(ACAIA_NEW_WRITE_CHAR)) {
    return { generation: 'new', service: ACAIA_NEW_SERVICE, write: ACAIA_NEW_WRITE_CHAR, notify: ACAIA_NEW_NOTIFY_CHAR };
  }
  return null;
}

function checksum(bytes) {
  let even = 0;
  let odd = 0;
  bytes.forEach((byte, index) => {
    if (index % 2 === 0) even += byte;
    else odd += byte;
  });
  return [even & 0xff, odd & 0xff];
}

export function encode(type, payload) {
  const body = payload.map((byte) => byte & 0xff);
  return Uint8Array.from([HEADER1, HEADER2, type, ...body, ...checksum(body)]);
}

const ascii = (text) => Array.from(text, (char) => char.charCodeAt(0));

export const COMMANDS = {
  identifyOld: encode(11, ascii('-'.repeat(15))),
  identifyNew: encode(11, ascii('012345678901234')),
  // Subscribe to weight, battery, timer and key events.
  notificationRequest: encode(12, [9, 0, 1, 1, 2, 2, 5, 3, 4]),
  heartbeat: encode(0, [2, 0]),
  getSettings: encode(6, new Array(16).fill(0)),
  tare: encode(4, [0]),
};

// Commands to send once after notifications are on, in order.
export function sessionStartCommands(generation) {
  return [generation === 'new' ? COMMANDS.identifyNew : COMMANDS.identifyOld, COMMANDS.notificationRequest];
}

// Commands for one heartbeat tick.
export function heartbeatCommands(generation) {
  return generation === 'new'
    ? [COMMANDS.identifyNew, COMMANDS.heartbeat, COMMANDS.getSettings]
    : [COMMANDS.heartbeat];
}

const WEIGHT_DIVISORS = { 1: 10, 2: 100, 3: 1000, 4: 10000 };
const RECORD_WIDTHS = { 5: 6, 6: 1, 7: 3, 11: 2 };

export function decodeWeight(bytes) {
  if (bytes.length < 6) return null;
  const divisor = WEIGHT_DIVISORS[bytes[4]];
  if (!divisor) return null;
  const grams = ((bytes[1] << 8) + bytes[0]) / divisor;
  return bytes[5] & 0x02 ? -grams : grams;
}

// A weight, button or heartbeat payload is a chain of [tag][body] records.
// Stop at the first unknown tag: everything behind it is unreadable.
function walkRecords(bytes) {
  let grams = null;
  let index = 0;
  while (index < bytes.length) {
    const tag = bytes[index];
    if (tag === 8) {
      index += 2;
      continue;
    }
    const width = RECORD_WIDTHS[tag];
    if (!width || index + 1 + width > bytes.length) break;
    if (tag === 5) grams = decodeWeight(bytes.slice(index + 1, index + 1 + width));
    index += 1 + width;
  }
  return { grams };
}

function decodeEvent(type, payload) {
  if (type === 5) {
    const grams = decodeWeight(payload);
    return grams == null ? null : { kind: 'weight', grams };
  }
  if (type === 8) {
    const { grams } = walkRecords(payload.slice(1));
    return { kind: 'button', button: { 0: 'tare', 8: 'start', 9: 'reset', 10: 'stop' }[payload[0]] || 'unknown', grams };
  }
  if (type === 11) {
    // Heartbeat reply: a 2-byte ack, optionally wrapping one more record.
    if (payload.length < 3) return { kind: 'ack' };
    if (payload[2] === 5) {
      const grams = decodeWeight(payload.slice(3));
      return grams == null ? { kind: 'ack' } : { kind: 'weight', grams };
    }
    if (payload[2] === 8) return decodeEvent(8, payload.slice(3));
    return { kind: 'ack' };
  }
  return null;
}

// Decode the first frame in `bytes`. Returns { message, rest, status } where
// status is 'ok' | 'partial' (wait for more bytes) | 'invalid' (drop 2 bytes).
export function decodeFrame(bytes) {
  let start = -1;
  for (let index = 0; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === HEADER1 && bytes[index + 1] === HEADER2) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    // No frame start: keep a trailing first header byte, drop the rest.
    const tail = bytes[bytes.length - 1] === HEADER1 ? bytes.slice(-1) : bytes.slice(0, 0);
    return { status: 'partial', message: null, rest: tail };
  }
  const frame = bytes.slice(start);
  if (frame.length < 6) return { status: 'partial', message: null, rest: frame };
  const end = frame[3] + FRAME_OVERHEAD;
  if (end > frame.length) return { status: 'partial', message: null, rest: frame };
  const body = frame.slice(3, end - 2);
  const [even, odd] = checksum(Array.from(body));
  if (frame[end - 2] !== even || frame[end - 1] !== odd) return { status: 'invalid', message: null, rest: frame.slice(2) };
  const rest = frame.slice(end);
  const command = frame[2];
  if (command === EVENT_COMMAND && frame[3] >= 2) {
    return { status: 'ok', message: decodeEvent(frame[4], frame.slice(5, end - 2)), rest };
  }
  if (command === SETTINGS_COMMAND && body.length >= 7) {
    return { status: 'ok', message: { kind: 'settings', battery: body[1] & 0x7f, units: body[2] === 5 ? 'ounces' : 'grams' }, rest };
  }
  return { status: 'ok', message: null, rest };
}

// Stateful reassembly: notifications can split or join frames.
export function createFrameReader() {
  let pending = new Uint8Array(0);
  return (chunk) => {
    const joined = new Uint8Array(pending.length + chunk.length);
    joined.set(pending);
    joined.set(chunk, pending.length);
    let bytes = joined;
    const messages = [];
    while (bytes.length) {
      const { status, message, rest } = decodeFrame(bytes);
      if (status === 'partial') break;
      if (message) messages.push(message);
      bytes = rest;
    }
    // A frame is at most 255 + 5 bytes; anything longer pending is noise.
    pending = bytes.length > 260 ? new Uint8Array(0) : bytes;
    return messages;
  };
}

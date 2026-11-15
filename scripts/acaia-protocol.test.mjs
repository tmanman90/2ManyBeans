// Acaia protocol encode/decode. Byte vectors and real captures come from the
// MIT-licensed aioacaia test suite (tests/test_encoder.py, tests/fixtures/messages.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acaiaModelName, ACAIA_NEW_SERVICE, ACAIA_NEW_WRITE_CHAR, ACAIA_OLD_CHAR, ACAIA_OLD_SERVICE,
  COMMANDS, createFrameReader, decodeFrame, detectGeneration, encode, heartbeatCommands, isAcaiaName, sessionStartCommands,
} from '../src/lib/scale/acaiaProtocol.js';

const hex = (text) => Uint8Array.from(text.match(/../g).map((byte) => parseInt(byte, 16)));
const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
// Same framing as aioacaia's fixtures: length byte, payload, split checksum.
function frame(command, payload) {
  const body = [payload.length + 1, ...payload];
  const even = body.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) & 0xff;
  const odd = body.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) & 0xff;
  return Uint8Array.from([0xef, 0xdd, command, ...body, even, odd]);
}
const event = (type, payload) => frame(12, [type, ...payload]);
const decode = (bytes) => decodeFrame(bytes).message;
const WEIGHT_175_9 = [0xdf, 0x06, 0x00, 0x00, 0x01, 0x00];

test('encodes commands byte for byte like aioacaia', () => {
  assert.equal(toHex(encode(5, [1, 2, 3, 4])), 'efdd05010203040406');
  assert.equal(toHex(encode(0, [0x102, 0x1])), 'efdd0002010201');
  assert.equal(toHex(COMMANDS.identifyOld), 'efdd0b2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d683b');
  assert.equal(toHex(COMMANDS.identifyNew), 'efdd0b3031323334353637383930313233349a6d');
  assert.equal(toHex(COMMANDS.notificationRequest), 'efdd0c0900010102020503041506');
  assert.equal(toHex(COMMANDS.tare), toHex(encode(4, [0])));
});

test('session start and heartbeat differ by generation', () => {
  assert.deepEqual(sessionStartCommands('new'), [COMMANDS.identifyNew, COMMANDS.notificationRequest]);
  assert.deepEqual(sessionStartCommands('old'), [COMMANDS.identifyOld, COMMANDS.notificationRequest]);
  assert.deepEqual(heartbeatCommands('new'), [COMMANDS.identifyNew, COMMANDS.heartbeat, COMMANDS.getSettings]);
  assert.deepEqual(heartbeatCommands('old'), [COMMANDS.heartbeat]);
});

test('decodes a real weight capture and its variants', () => {
  assert.deepEqual(decode(hex('efdd0c0c05df060000010007000002f30d')), { kind: 'weight', grams: 175.9 });
  assert.equal(decode(event(5, [0xdf, 0x06, 0, 0, 1, 0x02])).grams, -175.9);
  assert.equal(decode(event(5, [0xdf, 0x06, 0, 0, 2, 0])).grams, 17.59);
  assert.equal(decode(event(5, [0xdf, 0x06, 0, 0, 3, 0])).grams, 1.759);
  assert.equal(decode(event(5, [0xdf, 0x06, 0, 0, 4, 0])).grams, 0.1759);
  assert.equal(decode(event(5, [0xdf, 0x06, 0, 0, 0, 0])), null, 'unknown unit is dropped');
  // A 2021 Lunar appends its own timer to every weight.
  assert.equal(decode(hex('efdd0c0c05000000000100070008011c06')).grams, 0);
});

test('decodes settings: battery, units, timer bit ignored', () => {
  assert.deepEqual(decode(hex('efdd08095d020201000101000d60')), { kind: 'settings', battery: 93, units: 'grams' });
  assert.equal(decode(hex('efdd08094a020101000101010e4c')).battery, 74);
  assert.equal(decode(hex('efdd0809ca020101000101010ecc')).battery, 74, 'top bit is the timer, not battery');
  assert.equal(decode(frame(8, [0x5d, 5, 2, 1, 0, 1, 1, 0])).units, 'ounces');
});

test('decodes heartbeats and buttons, including real Pearl captures', () => {
  assert.deepEqual(decode(event(11, [0x00, 0xe0])), { kind: 'ack' });
  assert.deepEqual(decode(event(11, [0, 0, 5, ...WEIGHT_175_9])), { kind: 'weight', grams: 175.9 });
  assert.deepEqual(decode(event(8, [0, 5, ...WEIGHT_175_9])), { kind: 'button', button: 'tare', grams: 175.9 });
  assert.deepEqual(decode(event(8, [8])), { kind: 'button', button: 'start', grams: null });
  // Original Pearl: stop with 55.1 g and 9.7 s.
  assert.deepEqual(decode(event(8, [...hex('0a0527020000010107000907')])), { kind: 'button', button: 'stop', grams: 55.1 });
  // Start behind an ack record (tag 0x0b).
  assert.equal(decode(event(8, [...hex('080b00e005250200000101')])).grams, 54.9);
  assert.equal(decode(event(11, [...hex('00e0080805000000000101')])).button, 'start');
});

test('rejects bad checksums and other commands', () => {
  const good = hex('efdd0c0c05df060000010007000002f30d');
  const bad = good.slice();
  bad[bad.length - 1] ^= 0x01;
  assert.equal(decodeFrame(bad).status, 'invalid');
  assert.equal(decodeFrame(frame(5, [0])).message, null);
  assert.equal(decodeFrame(event(99, [0, 0])).message, null);
});

test('reassembles split, joined and noisy notifications', () => {
  const read = createFrameReader();
  assert.deepEqual(read(hex('efdd0c')), []);
  assert.deepEqual(read(hex('0c05df060000010007000002f30d')), [{ kind: 'weight', grams: 175.9 }]);
  const two = new Uint8Array([...hex('000102'), ...hex('efdd0c0c05df060000010007000002f30d'), ...hex('efdd08095d020201000101000d60')]);
  assert.deepEqual(read(two).map((message) => message.kind), ['weight', 'settings']);
  assert.deepEqual(read(hex('00112233')), [], 'noise without a header is dropped');
  assert.deepEqual(read(hex('efdd0c0c05df060000010007000002f30d')), [{ kind: 'weight', grams: 175.9 }]);
});

test('tells the generations apart by characteristic, not by name', () => {
  const old = detectGeneration([{ uuid: ACAIA_OLD_SERVICE, characteristics: [{ uuid: ACAIA_OLD_CHAR.toUpperCase() }] }]);
  assert.deepEqual(old, { generation: 'old', service: ACAIA_OLD_SERVICE, write: ACAIA_OLD_CHAR, notify: ACAIA_OLD_CHAR });
  const fresh = detectGeneration([{ uuid: ACAIA_NEW_SERVICE, characteristics: [{ uuid: ACAIA_NEW_WRITE_CHAR }] }]);
  assert.equal(fresh.generation, 'new');
  assert.equal(detectGeneration([{ uuid: '180a', characteristics: [{ uuid: '2a29' }] }]), null);
});

test('recognises Acaia names and models', () => {
  for (const name of ['PEARLS-0F2A', 'LUNAR-61C2', 'ACAIAL1234', 'PYXIS-1', 'PROCHBT001', 'CINCO-9']) assert.ok(isAcaiaName(name), name);
  assert.ok(!isAcaiaName('Felicita Arc'));
  assert.ok(!isAcaiaName(undefined));
  assert.equal(acaiaModelName('PROCHBT001'), 'Pearl');
  assert.equal(acaiaModelName('PEARLS-0F2A'), 'Pearl S');
  assert.equal(acaiaModelName('ACAIAL1234'), 'Lunar');
  assert.equal(acaiaModelName('PYXIS-1'), 'Pyxis');
});

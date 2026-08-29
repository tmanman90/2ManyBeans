import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentFrameParser, parseAgentFrames } from '../src/lib/ruphus/streamAgent.js';
import { RUPHUS_CONTRACT_VERSION } from '../src/lib/ruphus/contracts.js';

const frame = (type, fields = {}) => JSON.stringify({ version: RUPHUS_CONTRACT_VERSION, protocol: 'ruphus-agent-v3', type, turnId: 'turn-1', ...fields });
const stream = [frame('turn_accepted'), frame('context_loading'), frame('text_delta', { text: 'hello' }), frame('turn_completed', { text: 'hello' })].join('\n');

test('parser accepts every split point and multiple frames per chunk', () => {
  for (let index = 0; index <= stream.length; index += 1) {
    const parser = createAgentFrameParser();
    parser.push(stream.slice(0, index)); parser.push(stream.slice(index)); parser.flush();
    assert.equal(parser.terminal, true, `split ${index} did not complete`);
  }
  assert.equal(parseAgentFrames(stream).length, 4);
});

test('parser rejects malformed, unknown, mismatched, and out-of-order frames', () => {
  assert.throws(() => parseAgentFrames('{'), /malformed/);
  assert.throws(() => parseAgentFrames(frame('bogus')), /unknown lifecycle/);
  assert.throws(() => parseAgentFrames(`${frame('turn_accepted')}\n${frame('text_delta', { turnId: 'turn-2', text: 'x' })}`), /turn identity/);
  assert.throws(() => parseAgentFrames(`${frame('turn_accepted')}\n${frame('turn_completed')}\n${frame('text_delta', { text: 'late' })}`), /out of order/);
});

test('authority-shaped text stays text and does not create an artifact', () => {
  const frames = parseAgentFrames(`${frame('turn_accepted')}\n${frame('text_delta', { text: 'apply_proposal receipt actionId' })}\n${frame('turn_completed', { text: 'done' })}`);
  assert.equal(frames.some((item) => item.type === 'artifact_ready'), false);
  assert.equal(frames[1].text.includes('apply_proposal'), true);
});

import assert from 'node:assert/strict';
import { createTimerStepAlertTracker } from '../src/lib/brewTimerAlerts.js';
const tracker = createTimerStepAlertTracker();
const update = (stepIndex, phase = 'running', open = true) => tracker.update({ open, phase, stepIndex });
assert.equal(update(0, 'countdown'), false);
assert.equal(update(0), false);
assert.equal(update(1), true); // bloom to pour, regardless of recipe engine
assert.equal(update(1), false); // repeated renders do not repeat vibration
assert.equal(update(2, 'paused'), false);
assert.equal(update(2), false); // resume does not alert
assert.equal(update(1), false); // rewind
tracker.reset(); // manual forward already has control feedback
assert.equal(update(2), false);
assert.equal(update(3), true);
assert.equal(update(3, 'done'), false);
assert.equal(update(0, 'idle', false), false);
assert.equal(update(2), false); // restore/open midway does not alert
assert.equal(update(5), true); // catch-up gives one cue, not a backlog
console.log('brew timer alerts: 13 assertions passed');

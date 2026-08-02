import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceStepClock } from '../src/lib/brewTimerSteps.js';

const hook = readFileSync(new URL('../src/hooks/useBrewTimer.js', import.meta.url), 'utf8');
const timer = readFileSync(new URL('../src/components/BrewTimer.jsx', import.meta.url), 'utf8');

assert.match(hook, /const finish = useCallback/);
assert.match(hook, /finish\('natural'\)/);
assert.match(hook, /finish\('skipped'\)/);
assert.match(hook, /if \(completionRef\.current\) return completionRef\.current\.elapsedMs/);
assert.match(hook, /setCompletion\(nextCompletion\)/);
assert.match(hook, /completionKind: completion\?\.kind \|\| null/);
assert.match(timer, /Finish Brew/);
assert.match(timer, /readGlobalMs, readStepMs/);
assert.match(timer, /finish\('manualEarly'\)/);
assert.match(timer, /phase === 'countdown' \|\| phase === 'running' \|\| phase === 'paused'/);
assert.match(timer, /reportedRef\.current = true/);
assert.match(timer, /actualElapsedMs: completionElapsedMs \?\? readGlobalMs\(\)/);
assert.match(timer, /Try Again/);

// A pause in an earlier step must move the next step's wall-clock anchor
// forward. Otherwise that paused time becomes phantom progress in the final
// step and a 5:10 guide can complete at 4:42 after a 28-second pause.
const guideTotalMs = 310_000;
const pausedMs = 28_000;
const finalStepDurationMs = 205_000;
const finalStepStartedAtMs = advanceStepClock(60_000, 45_000, pausedMs);
const prematureWallClockMs = guideTotalMs;
const prematureGlobalElapsedMs = prematureWallClockMs - pausedMs;
const prematureFinalStepElapsedMs = prematureWallClockMs - finalStepStartedAtMs;
assert.equal(prematureGlobalElapsedMs, 282_000);
assert.ok(prematureFinalStepElapsedMs < finalStepDurationMs);

const correctWallClockMs = guideTotalMs + pausedMs;
assert.equal(correctWallClockMs - pausedMs, guideTotalMs);
assert.equal(correctWallClockMs - finalStepStartedAtMs, finalStepDurationMs);
console.log('brew timer lifecycle contract passed');

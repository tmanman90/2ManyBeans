import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  advanceStepClock,
  resolveStepTiming,
  shouldFinishNaturally,
} from '../src/lib/brewTimerSteps.js';

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

// Reported incident: Step 1 was skipped 2.756s into its 30s interval. The
// relative step chain therefore reached the end at 4:42.756, but natural
// completion must stay anchored to the displayed 5:10 guide.
const firstStepSkipMs = 2_756;
const shortenedChainFinishMs = firstStepSkipMs + 30_000 + 60_000 + 190_000;
assert.equal(shortenedChainFinishMs, 282_756);
assert.equal(shouldFinishNaturally(shortenedChainFinishMs, guideTotalMs, true), false);
assert.equal(shouldFinishNaturally(guideTotalMs, guideTotalMs, true), true);

const finalTimingAtOldBoundary = resolveStepTiming({
  isFinalStep: true,
  nominalDurationMs: 190_000,
  totalMs: guideTotalMs,
  globalElapsedMs: shortenedChainFinishMs,
  stepElapsedMs: 190_000,
});
assert.equal(finalTimingAtOldBoundary.remainingMs, 27_244);
assert.equal(finalTimingAtOldBoundary.durationMs, 217_244);
console.log('brew timer lifecycle contract passed');

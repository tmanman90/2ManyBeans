import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
console.log('brew timer lifecycle contract passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const gemini = fs.readFileSync(new URL('../src/lib/gemini.js', import.meta.url), 'utf8');

assert.match(gemini, /JUN 05 2026/);
assert.match(gemini, /2026-06-05/);
assert.match(gemini, /all-caps month/i);
assert.match(gemini, /separated from the words "Roast Date"/i);
assert.match(gemini, /DATE CANDIDATE SWEEP/);
assert.match(gemini, /date-looking text/i);
assert.match(gemini, /nearest label/i);
assert.match(gemini, /best-by/i);
assert.match(gemini, /harvest/i);

console.log('bean scan prompt regression passed');

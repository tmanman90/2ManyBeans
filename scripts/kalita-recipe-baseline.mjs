import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeRecipe } from './kalita-recipe-compare.mjs';

const input = process.argv[2];
const output = process.argv[3] || 'docs/data/kalita-recipe-current-baseline.json';
if (!input) throw new Error('Usage: node scripts/kalita-recipe-baseline.mjs frozen-recipes.json [output.json]');
const frozen = JSON.parse(readFileSync(resolve(input), 'utf8'));
const baseline = { version: 1, generatedAt: new Date().toISOString(), mode: 'offline-fixture-replay', recipes: frozen.map(normalizeRecipe) };
writeFileSync(resolve(output), `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Wrote ${baseline.recipes.length} offline baseline entries to ${output}`);

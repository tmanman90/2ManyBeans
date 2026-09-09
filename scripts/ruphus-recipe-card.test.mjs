import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const card = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
const renderer = read('src/components/chat/ArtifactRenderer.jsx');
const preview = card.slice(card.indexOf('function PreviewCard'), card.indexOf('export function RecipeProposalCard'));

test('recipe preview renderer forwards the side-effect-free preview callback', () => {
  assert.match(renderer, /onPreview/);
  assert.match(renderer, /<RecipeProposalCard[\s\S]*onPreview=\{onPreview\}/);
  assert.match(card, /onPreview\?\.\(proposal\)/);
});

test('hot manual preview cards are compact, ratio-first, and keep legacy actions out', () => {
  assert.match(card, /new Set\(\['v60_hot', 'kalita_hot'\]\)/);
  assert.match(preview, /data-preview-card="true"/);
  assert.match(preview, /data-preview-ratio="true"/);
  assert.match(preview, /View recipe/);
  assert.doesNotMatch(preview, /<details|prepSteps|postBrewSteps|after\.steps/);
  assert.ok(preview.indexOf('data-preview-ratio') < preview.indexOf('data-preview-supporting-values'));
});

test('preview status disables stale and superseded openings without changing status copy', () => {
  assert.match(preview, /status === 'stale' \|\| status === 'superseded'/);
  assert.match(card, /stale: 'This preview is out of date/);
  assert.match(card, /superseded: 'This preview was replaced/);
  assert.match(card, /attempt_created: 'Ready for one brew/);
});

test('legacy proposal actions remain available when no preview callback is supplied', () => {
  assert.match(card, /apply_proposal/);
  assert.match(card, /brew_once/);
  assert.match(card, /keep_current/);
  assert.match(card, /ArtifactAction/);
});

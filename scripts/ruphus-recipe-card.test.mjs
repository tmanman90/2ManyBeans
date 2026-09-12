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
  assert.match(card, /status === 'proposed' \? onPreview : onInspect/);
  assert.match(card, /viewRecipe\?\.\(proposal\)/);
});

test('hot manual preview cards are compact, ratio-first, and keep legacy actions out', () => {
  assert.match(card, /new Set\(\['v60_hot', 'kalita_hot'\]\)/);
  assert.match(preview, /data-preview-card="true"/);
  assert.match(preview, /View recipe/);
  assert.match(preview, /ratioChanged/);
  assert.doesNotMatch(preview, /<details|prepSteps|postBrewSteps|after\.steps/);
  assert.match(preview, /data-preview-change="true"/);
  assert.doesNotMatch(preview, /data-preview-supporting-values|recommendation|reasoning/);
});

test('non-proposed cards use only the read-only inspector and preserve status copy', () => {
  assert.match(preview, /status === 'proposed' \? onPreview : onInspect/);
  assert.match(preview, /typeof viewRecipe !== 'function'/);
  assert.match(card, /stale: 'This preview is out of date/);
  assert.match(card, /superseded: 'This preview was replaced/);
  assert.match(card, /attempt_created: 'Ready for one brew/);
});

test('preview change copy never leaks machine technique slugs', () => {
  assert.match(preview, /techniqueDisplayName/);
  assert.doesNotMatch(preview, /typeof proposal\.technique === 'string'/);
  assert.doesNotMatch(preview, /typeof after\.technique === 'string'/);
});

test('legacy proposal actions remain available when no preview callback is supplied', () => {
  assert.match(card, /apply_proposal/);
  assert.match(card, /brew_once/);
  assert.match(card, /keep_current/);
  assert.match(card, /ArtifactAction/);
});

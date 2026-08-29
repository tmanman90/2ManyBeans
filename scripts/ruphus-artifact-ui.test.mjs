import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('M1 native artifact UI keeps proposal actions disabled and includes the symptom choice card', () => {
  const proposal = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
  const gap = read('src/components/chat/artifacts/DataGapCard.jsx');
  const renderer = read('src/components/chat/ArtifactRenderer.jsx');
  assert.match(proposal, /Available soon/); assert.match(proposal, /disabled/); assert.match(proposal, /All controls/);
  assert.match(gap, /data-artifact="data_gap"/); assert.match(gap, /onSelect/); assert.match(renderer, /RecipeProposalCard/);
});
test('M1 context and lifecycle surfaces use Professor Ruphus copy and accessible targets', () => {
  assert.match(read('src/components/chat/RuphusContextHeader.jsx'), /Professor Ruphus/);
  assert.match(read('src/components/chat/RuphusLifecycleCaption.jsx'), /Reading your recipe/);
  assert.match(read('src/components/chat/artifacts/ArtifactAction.jsx'), /minHeight/);
});

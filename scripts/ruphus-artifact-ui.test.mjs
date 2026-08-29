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
test('M1 tasting reveal entry is absent when the Agent request gate is off', () => {
  const tasting = read('src/tabs/TastingTab.jsx');
  assert.match(tasting, /isRuphusAgentV3Enabled/);
  assert.match(tasting, /onOpenRuphus=\{agentV3Enabled \?/);
});
test('M1 Rotation shelf keeps its legacy Learn action and has no Agent shelf entry', () => {
  const rotation = read('src/tabs/RotationTab.jsx');
  assert.match(rotation, /label="Learn"/);
  assert.doesNotMatch(rotation, /label="Professor Ruphus"/);
  assert.doesNotMatch(rotation, /openRuphus/);
});
test('M1 contextual starter routes with its explicit context before React state settles', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  assert.match(chat, /sendAgentTurn\(turnContext\)/);
  assert.match(chat, /const turnContext = agentContextOverride \|\| agentContextRef\.current \|\| agentContext/);
  assert.match(chat, /if \(agentEnabled && turnContext\)/);
});
test('M1 tasting reveal carries bounded unsaved cup evidence into the immutable context', () => {
  const wizard = read('src/components/tasting/TastingWizard.jsx');
  assert.match(wizard, /tastingEvidence:/);
  assert.match(wizard, /scores: \{ \.\.\.scores \}/);
  assert.match(wizard, /flavorChips: \[\.\.\.answers\.flavorChips\]/);
  assert.doesNotMatch(wizard, /tastingId: null/);
});
test('M1 Firestore session rules preserve legacy shape and constrain Agent v3 fields', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /!\('protocolVersion' in request\.resource\.data\)/);
  assert.match(rules, /!\('turns' in request\.resource\.data\)/);
  assert.match(rules, /protocolVersion.*== 1/);
  assert.match(rules, /match \/users\/\{userId\}\/proposals/);
  assert.match(rules, /match \/users\/\{userId\}\/recipeRevisions/);
  assert.match(rules, /match \/users\/\{userId\}\/brewAttempts/);
});
test('M1 session hydration reconciles owner-readable proposal records', () => {
  const session = read('src/hooks/useChatSession.js');
  assert.match(session, /loadRemoteArtifacts/);
  assert.match(session, /collection\(db, 'users', uid, 'proposals'/);
  assert.match(session, /setHydratedArtifacts/);
});

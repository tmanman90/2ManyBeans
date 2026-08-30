import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('U4 native artifact UI is proposal-only and contains no machine controls', () => {
  const proposal = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
  const renderer = read('src/components/chat/ArtifactRenderer.jsx');
  assert.doesNotMatch(proposal, /Available soon|All controls|<pre|ArtifactAction|onAction/);
  assert.doesNotMatch(renderer, /CoffeeContextCard|DataGapCard/); assert.match(renderer, /RecipeProposalCard/);
});
test('U4 opening and lifecycle surfaces use warm copy and accessible targets', () => {
  assert.match(read('src/components/chat/RuphusOpening.jsx'), /Professor Ruphus/);
  assert.match(read('src/components/chat/RuphusLifecycleCaption.jsx'), /ruphusCaption/);
  assert.match(read('src/lib/ruphus/opening.js'), /dataLoaded/);
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
  assert.match(rotation, /surface: 'bean_card'/);
});
test('M1 contextual starter routes with its explicit context before React state settles', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  assert.match(chat, /sendAgentTurn\(turnContext\)/);
  assert.match(chat, /const turnContext = agentContextOverride \|\| agentContextRef\.current \|\| agentContext/);
  assert.match(chat, /if \(agentEnabled && !legacyChatOverride && turnContext\)/);
  assert.match(chat, /agentContextOverride: launchContext/);
  assert.match(chat, /RuphusOpening/);
});
test('M1 tasting reveal carries bounded unsaved cup evidence into the immutable context', () => {
  const wizard = read('src/components/tasting/TastingWizard.jsx');
  assert.match(wizard, /starter/);
  assert.match(wizard, /answers\.flavorChips/);
  assert.match(wizard, /surface: 'tasting_wizard'/);
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
  assert.match(session, /startNewChat/);
  assert.match(session, /hydratedSession/);
  assert.doesNotMatch(session, /deleteDoc|deleteRemote|deleteLocal/);
});

test('Agent chat sends recent conversation, follows selected-coffee artifacts, and strips markdown', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  const message = read('src/components/chat/RuphusMessage.jsx');
  assert.match(chat, /conversation:/);
  assert.match(chat, /dataLoaded/);
  assert.match(chat, /agentSessionIdRef/);
  assert.match(message, /stripMarkdown/);
});

test('U4 launch producers send only the approved context shape', () => {
  const rotation = read('src/tabs/RotationTab.jsx');
  const hand = read('src/components/HandBrewModal.jsx');
  const aiden = read('src/components/AidenModal.jsx');
  const tasting = read('src/components/TastingDetailCard.jsx');
  const wizard = read('src/components/tasting/TastingWizard.jsx');
  assert.match(rotation, /coffeeRef: b\.id, surface: 'bean_card'/);
  assert.match(hand, /launchItem: \{ kind: 'recipe'/); assert.match(aiden, /launchItem: \{ kind: 'recipe'/);
  assert.match(tasting, /kind: 'tasting'/); assert.match(wizard, /surface: 'tasting_wizard'/);
  assert.doesNotMatch(rotation, /onOpenRuphus\?\.\(\{[^}]*slotKey/);
  assert.doesNotMatch(hand, /onOpenRuphus\([^)]*slotKey/);
  assert.doesNotMatch(aiden, /onOpenRuphus\([^)]*slotKey/);
});

test('U4 retired context and gap cards cannot render', () => {
  assert.throws(() => read('src/components/chat/RuphusContextHeader.jsx'));
  assert.throws(() => read('src/components/chat/artifacts/CoffeeContextCard.jsx'));
  assert.throws(() => read('src/components/chat/artifacts/DataGapCard.jsx'));
});

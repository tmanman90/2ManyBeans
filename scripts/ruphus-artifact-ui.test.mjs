import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRuphusOpening } from '../src/lib/ruphus/opening.js';
import { buildRecipeLaunchContext, resolveTastingLaunchMethod } from '../src/lib/ruphus/launch.js';
import { validateLaunchContext } from '../src/lib/ruphus/conversationContract.js';
import { reconcileProposalArtifacts } from '../src/lib/ruphus/proposalArtifacts.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('U4 proposal UI exposes only registered native actions and no machine controls', () => {
  const proposal = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
  const renderer = read('src/components/chat/ArtifactRenderer.jsx');
  assert.doesNotMatch(proposal, /Available soon|All controls|<pre/);
  assert.match(proposal, /apply_proposal/);
  assert.match(proposal, /brew_once/);
  assert.match(proposal, /keep_current/);
  assert.match(proposal, /proposal\.actions/);
  assert.match(renderer, /actionPending/);
  assert.doesNotMatch(renderer, /CoffeeContextCard|DataGapCard/); assert.match(renderer, /RecipeProposalCard/);
});
test('U4 opening and lifecycle surfaces use warm copy and accessible targets', () => {
  assert.match(read('src/components/chat/RuphusOpening.jsx'), /Professor Ruphus/);
  assert.match(read('src/components/chat/RuphusLifecycleCaption.jsx'), /ruphusCaption/);
  assert.match(read('src/lib/ruphus/opening.js'), /dataLoaded/);
  assert.match(read('src/components/chat/artifacts/ArtifactAction.jsx'), /minHeight/);
  const harness = read('src/components/chat/RuphusBrowserHarness.jsx');
  assert.match(harness, /const HARNESS_CLOCK = Date\.now\(\)/);
  assert.match(harness, /useState\(\(\) => createHarnessSession\(\)\)/);
  assert.match(harness, /data-ruphus-last-activity/);
});
test('opening chooses truthful roast and last-brew templates within the copy bound', () => {
  const now = Date.parse('2026-08-30T12:00:00Z');
  const roast = buildRuphusOpening({ dataLoaded: true, now, coffees: [{ name: 'El Vergel', status: 'ACTIVE', roastDate: '2026-08-28' }] });
  const brew = buildRuphusOpening({ dataLoaded: true, now, coffees: [{ name: 'House Blend', status: 'ACTIVE', lastBrewAt: '2026-08-29T12:00:00Z' }] });
  assert.match(roast, /2 days off roast/);
  assert.match(brew, /last brewed House Blend 1 day ago/);
  assert.ok(roast.trim().split(/\s+/).length <= 40);
  assert.ok(brew.trim().split(/\s+/).length <= 40);
});
test('M1 tasting reveal entry is absent when the Agent request gate is off', () => {
  const tasting = read('src/tabs/TastingTab.jsx');
  assert.match(tasting, /isRuphusAgentV3Enabled/);
  assert.match(tasting, /onOpenRuphus=\{agentV3Enabled \?/);
});
test('app handoff validates contextual launches and main mounts Chat while data loads', () => {
  const app = read('src/App.jsx');
  const main = read('src/main.jsx');
  assert.match(app, /validateLaunchContext/);
  assert.match(app, /!launchContext\?\.coffeeRef/);
  assert.doesNotMatch(main, /Gate 6a: Waiting for Firestore data/);
  assert.match(main, /<App[\s\S]*dataLoaded=\{dataLoaded\}/);
});
test('coffee cards keep Learn and expose a separate contextual Agent entry in Dev', () => {
  const rotation = read('src/tabs/RotationTab.jsx');
  const inventory = read('src/tabs/InventoryTab.jsx');
  const detail = read('src/components/BeanDetailCard.jsx');
  assert.match(rotation, /label="Learn"/);
  assert.match(rotation, /label="Ask Ruphus"/);
  assert.match(inventory, /label="Learn"/);
  assert.match(inventory, /label="Ask Ruphus"/);
  assert.match(detail, /ASK PROFESSOR RUPHUS/);
  assert.match(detail, /onAskRuphus/);
  assert.match(rotation, /surface: 'bean_card'/);
  assert.match(inventory, /surface: 'bean_card'/);
});
test('M1 contextual starter routes with its explicit context before React state settles', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  assert.match(chat, /sendAgentTurn\(turnContext[,)]/);
  assert.match(chat, /const turnContext = agentContextOverride \|\| agentContextRef\.current \|\| agentContext \|\| \{ surface: 'direct' \}/);
  assert.match(chat, /if \(agentEnabled && !legacyChatOverride\)/);
  assert.match(chat, /const resumedContext = resumed\?\.contextRef \|\| null/);
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
  assert.match(read('src/tabs/ChatTab.jsx'), /thread\.map\(restoreChatMessage\)/);
  const session = read('src/hooks/useChatSession.js');
  assert.match(session, /loadRemoteArtifacts/);
  assert.match(session, /collection\(db, 'users', uid, 'proposals'/);
  assert.match(session, /loadBySession: async \(sessionId\) => \{[\s\S]*getDocs\(query\(proposals/);
  assert.doesNotMatch(session, /if \(!sessionId\) return \[\];/);
  assert.match(session, /getDoc\(doc\(proposals, proposalId\)\)/);
  assert.match(read('src/lib/ruphus/proposalArtifacts.js'), /artifact\?\.type === 'recipe_proposal'/);
  assert.match(session, /setHydratedArtifacts/);
  assert.match(session, /startNewChat/);
  assert.match(session, /hydratedSession/);
  assert.doesNotMatch(session, /deleteDoc|deleteRemote|deleteLocal/);
});

test('sessionless legacy cards recover their stored proposal session by exact owner ID', async () => {
  const session = { messages: [{ artifacts: [{ id: 'legacy-proposal', type: 'recipe_proposal' }] }] };
  let sessionReads = 0;
  let exactReads = 0;
  const recovered = await reconcileProposalArtifacts({
    session,
    loadBySession: async () => { sessionReads += 1; return []; },
    loadById: async (id) => { exactReads += 1; return { id, sessionId: 'original-turn', coffeeId: 'coffee-1', slotKey: 'kalita_hot' }; },
  });
  assert.equal(sessionReads, 0);
  assert.equal(exactReads, 1);
  assert.deepEqual(recovered[0], { id: 'legacy-proposal', sessionId: 'original-turn', coffeeId: 'coffee-1', slotKey: 'kalita_hot' });
});

test('hydration avoids exact rereads for records already returned by the session query', async () => {
  const session = { contextRef: { sessionId: 'current-session' }, messages: [{ artifacts: [{ id: 'current-proposal', type: 'recipe_proposal' }] }] };
  let exactReads = 0;
  const recovered = await reconcileProposalArtifacts({
    session,
    loadBySession: async () => [{ id: 'current-proposal', sessionId: 'current-session' }],
    loadById: async () => { exactReads += 1; return null; },
  });
  assert.equal(exactReads, 0);
  assert.deepEqual(recovered, [{ id: 'current-proposal', sessionId: 'current-session' }]);
});

test('Agent chat sends recent conversation, follows selected-coffee artifacts, and strips markdown', () => {
  const chat = read('src/tabs/ChatTab.jsx');
  const message = read('src/components/chat/RuphusMessage.jsx');
  assert.match(chat, /conversation:/);
  assert.match(chat, /dataLoaded/);
  assert.match(chat, /agentSessionIdRef/);
  assert.match(message, /stripMarkdown/);
  assert.match(chat, /prepareChatMessagesForClaude\(\[apiMsg\]/);
  assert.match(chat, /typeof message\.content === 'string'/);
  assert.match(chat, /surface: 'direct'/);
  assert.match(chat, /if \(agentEnabled && !legacyChatOverride\)/);
  assert.match(chat, /conversation\.filter\(message => message\?\.role && typeof message\.content === 'string'\)/);
  assert.match(chat, /agentContextOverride: retry\.agentContextOverride/);
});

test('U4 launch producers send only the approved context shape', () => {
  const rotation = read('src/tabs/RotationTab.jsx');
  const hand = read('src/components/HandBrewModal.jsx');
  const aiden = read('src/components/AidenModal.jsx');
  const tasting = read('src/components/TastingDetailCard.jsx');
  const wizard = read('src/components/tasting/TastingWizard.jsx');
  assert.match(rotation, /coffeeRef: b\.id, surface: 'bean_card'/);
  assert.match(hand, /buildRecipeLaunchContext|recipeLaunchContext/); assert.match(aiden, /buildRecipeLaunchContext/);
  assert.match(tasting, /kind: 'tasting'/); assert.match(wizard, /surface: 'tasting_wizard'/);
  assert.match(tasting, /resolveTastingLaunchMethod/);
  assert.match(wizard, /scoreEvidence/);
  assert.doesNotMatch(tasting, /const recordedMethod = tasting\.method \|\| tasting\.brewMethod/);
  assert.doesNotMatch(rotation, /onOpenRuphus\?\.\(\{[^}]*slotKey/);
  assert.doesNotMatch(hand, /onOpenRuphus\([^)]*slotKey/);
  assert.doesNotMatch(aiden, /onOpenRuphus\([^)]*slotKey/);
});
test('recipe launch refs are optional only when absent and tasting methods never infer from coffee recipes', () => {
  for (const [slot, surface] of [['v60_hot', 'recipe_kalita_v60'], ['v60_iced', 'recipe_kalita_v60'], ['aiden', 'recipe_aiden']]) {
    const context = buildRecipeLaunchContext({ coffeeRef: 'coffee-1', surface, slot, ref: `revision-${slot}` });
    assert.equal(validateLaunchContext(context).valid, true);
    assert.equal(context.launchItem.method, slot);
  }
  const missing = buildRecipeLaunchContext({ coffeeRef: 'coffee-1', surface: 'recipe_aiden', slot: 'aiden' });
  assert.equal(validateLaunchContext(missing).valid, true);
  assert.equal('launchItem' in missing, false);
  assert.equal(resolveTastingLaunchMethod({ bean: { aidenRecipe: {} } }), null);
  assert.equal(resolveTastingLaunchMethod({ agentProvenance: { slotKey: 'kalita_iced' } }), 'kalita_iced');
});

test('U4 retired context and gap cards cannot render', () => {
  assert.throws(() => read('src/components/chat/RuphusContextHeader.jsx'));
  assert.throws(() => read('src/components/chat/artifacts/CoffeeContextCard.jsx'));
  assert.throws(() => read('src/components/chat/artifacts/DataGapCard.jsx'));
});
test('lifecycle captions delay replacement copy and clean up pending timers', () => {
  const caption = read('src/components/chat/RuphusLifecycleCaption.jsx');
  assert.match(caption, /CAPTION_INTERVAL_MS = 2000/);
  assert.match(caption, /setTimeout/);
  assert.match(caption, /clearTimeout/);
});

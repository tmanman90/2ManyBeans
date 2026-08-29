import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('brew_once handoff carries an owner-keyed attempt into the app and timer session', async () => {
  const [app, rotation, outbox, timer, timing] = await Promise.all([
    source('src/App.jsx'),
    source('src/tabs/RotationTab.jsx'),
    source('src/hooks/useRuphusAttemptOutbox.js'),
    source('src/components/BrewTimer.jsx'),
    source('src/lib/brewTimingMemory.js'),
  ]);
  assert.match(app, /useRuphusAttemptOutbox\(uid\)/);
  assert.match(app, /onRuphusAttempt=\{handleRuphusAttempt\}/);
  assert.match(rotation, /openAidenAttempt\?\.\(bean, ruphusAttempt\)/);
  assert.match(rotation, /openHandAttempt\(bean, ruphusAttempt\)/);
  assert.match(timer, /sessionId: attemptId \|\|/);
  assert.match(await source('src/components/HandBrewModal.jsx'), /if \(attemptId\) setTimerOpen\(true\)/);
  assert.match(timer, /attemptId/);
  assert.match(timer, /revisionId/);
  assert.match(timing, /attemptId,/);
  assert.match(timing, /revisionId,/);
  assert.match(outbox, /ruphus-attempt-outbox:\$\{uid\}/);
  assert.match(outbox, /ownerUid: uid/);
  assert.match(outbox, /stage: value\.stage \|\| 'brew'/);
  assert.match(outbox, /const update = useCallback/);
  const action = await source('src/hooks/useRuphusAction.js');
  assert.match(action, /ruphus-action-identity/);
  assert.match(action, /localStorage\.getItem\(identityKey\)/);
  assert.match(action, /ruphus-action-outbox:\$\{uid\}:\$\{artifact\.actionId\}/);
  assert.match(rotation, /consumedAttemptRef\.current === ruphusAttempt\.id/);
  assert.doesNotMatch(app, /if \(attemptId\) clearRuphusAttempt\(\)/);
  assert.match(await source('src/tabs/TastingTab.jsx'), /onRuphusAttemptCompleted\?\.\(\)/);
  assert.match(app, /stage === 'tasting'/);
  assert.match(app, /updateRuphusAttempt\(\{ draft \}\)/);
});

test('recipe command receipt exposes the canonical Fellow preparation action', async () => {
  const [card, service] = await Promise.all([
    source('src/components/chat/artifacts/ActionReceiptCard.jsx'),
    source('api/_lib/ruphusCommandService.js'),
  ]);
  assert.doesNotMatch(card, /prepare_attempt/);
  assert.match(service, /mode === 'prepare_attempt'/);
  assert.match(service, /preparation: 'pending'/);
  assert.match(card, /Start brew/);
  assert.match(card, /Prepare in Fellow/);
  assert.match(await source('src/components/RecipeProvenanceStrip.jsx'), /\['apply', 'promote'\]/);
  assert.match(await source('src/components/BeanDetailCard.jsx'), /onUndoRecipe/);
  assert.match(await source('src/hooks/useHandBrew.js'), /mode: 'timer_started'/);
  assert.match(service, /mode === 'timer_started'/);
  const aiden = await source('src/lib/aiden.js');
  assert.match(aiden, /body: \{ attemptId, \...\(recovery \? \{ recovery, actionId: `new_profile_\$\{attemptId\}` \} : \{\}\) \}/);
  assert.match(aiden, /prepareAidenAttempt/);
});

test('M2 contextual recipe surfaces mount provenance and tasting detail entry', async () => {
  const [hand, aiden, detail, rotation] = await Promise.all([
    source('src/components/HandBrewModal.jsx'),
    source('src/components/AidenModal.jsx'),
    source('src/components/TastingDetailCard.jsx'),
    source('src/tabs/RotationTab.jsx'),
  ]);
  assert.match(hand, /RecipeProvenanceStrip/);
  assert.match(aiden, /RecipeProvenanceStrip/);
  assert.match(hand, /recipeProvenance = null/);
  assert.match(aiden, /recipeProvenance = null/);
  assert.match(detail, /Ask Ruphus/);
  assert.match(detail, /tastingEvidence/);
  assert.match(rotation, /onOpenRuphus=\{agentV3Enabled \? onOpenRuphus : undefined\}/);
});

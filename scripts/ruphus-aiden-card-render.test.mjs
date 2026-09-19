import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import test from 'node:test';
import { retainActionReceipt } from '../src/lib/ruphus/session.js';

test('first Aiden profile card presents new values without an invented before-state', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { RecipeProposalCard } from './src/components/chat/artifacts/RecipeProposalCard.jsx';
    const after = { title:'Generated Aiden profile', ratio:16, bloomEnabled:true, bloomRatio:2,
      bloomDuration:30, bloomTemperature:95, ssPulsesEnabled:true, ssPulsesNumber:2,
      ssPulsesInterval:20, ssPulseTemperatures:[96,95], batchPulsesEnabled:true,
      batchPulsesNumber:2, batchPulsesInterval:30, batchPulseTemperatures:[95,94],
      grindRecommendation:{singleServe:4.6,batch:6.6} };
    function App() { return <RecipeProposalCard proposal={{id:'first-aiden', coffeeName:'Jar one', slotKey:'aiden', sourceState:'absent', before:null, after, status:'proposed', actions:[]}} />; }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const compiled = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(compiled.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const text = await page.locator('[data-aiden-profile]').innerText();
    assert.deepEqual(errors, []);
    assert.doesNotMatch(text, /Not set\s*→|Disabled\s*→/);
    assert.match(text, /Ratio\s+1:16/);
    await page.getByText('View full Aiden profile', { exact: true }).click();
    const expanded = await page.locator('[data-aiden-profile]').innerText();
    assert.match(expanded, /Single serve\s+2 pulses/);
    assert.match(expanded, /Batch\s+2 pulses/);
    assert.match(expanded, /Single-serve grind \(Ode Gen 2\)\s+4\.6/);
    assert.match(expanded, /Batch grind \(Ode Gen 2\)\s+6\.6/);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Save then Undo receipt revokes the original proposal card', async () => {
  const chatTab = await readFile(new URL('../src/tabs/ChatTab.jsx', import.meta.url), 'utf8');
  assert.match(chatTab, /result\.receipt\.mode === 'undo_revision'[\s\S]*?\? 'undone'/);
  assert.match(chatTab, /reconcileUndoneProposalHistory\(previous\)/);
  assert.match(chatTab, /mergeUndoneProposalCanonical\(artifact, canonicalArtifact\)/);
  const proposal = {
    id: 'proposal-1', type: 'recipe_proposal', coffeeId: 'coffee-1', slotKey: 'v60_hot',
    revisionId: 'revision-1', coffeeName: 'Jar one', status: 'applied',
    before: { water: 300, dose: 20, ratio: 15 }, after: { water: 320, dose: 20, ratio: 16 },
    actions: ['apply_proposal', 'brew_once'],
  };
  const messages = [{ id: 'assistant-1', role: 'assistant', content: '', artifacts: [proposal] }];
  const undo = {
    id: 'undo-1', type: 'undo_receipt', mode: 'undo_revision', status: 'succeeded',
    proposalId: proposal.id, coffeeId: proposal.coffeeId, slotKey: proposal.slotKey,
    undoneRevisionId: proposal.revisionId,
  };
  // This is the same receipt reducer used by ChatTab after a successful Undo.
  const updated = retainActionReceipt(messages, undo, 'undone');
  assert.equal(updated[0].artifacts.find(item => item.id === proposal.id).status, 'undone');

  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { RecipeProposalCard, mergeUndoneProposalCanonical, reconcileUndoneProposalArtifacts, reconcileUndoneProposalHistory } from './src/components/chat/artifacts/RecipeProposalCard.jsx';
    const proposal = ${JSON.stringify(proposal)};
    const sibling = { ...proposal, id:'proposal-other', revisionId:'revision-other', status:'applied', coffeeId:'coffee-2', slotKey:'v60_hot', coffeeName:'Other jar' };
    const aidenDraft = { ...proposal, id:'proposal-aiden', revisionId:'revision-aiden', slotKey:'aiden', coffeeName:'Aiden jar', after:{ title:'Aiden profile', ratio:16, bloomEnabled:true } };
    const revisionUndo = { ...${JSON.stringify(undo)}, proposalId:null, undoneRevisionId:'revision-other', coffeeId:'coffee-2', slotKey:'v60_hot' };
    const byId = reconcileUndoneProposalArtifacts([proposal, sibling, aidenDraft], ${JSON.stringify(undo)});
    const aiden = reconcileUndoneProposalArtifacts([aidenDraft], { ...${JSON.stringify(undo)}, proposalId:'proposal-aiden', undoneRevisionId:'revision-aiden', slotKey:'aiden' })[0];
    const byRevision = reconcileUndoneProposalArtifacts([proposal, sibling, aidenDraft], revisionUndo);
    const history = reconcileUndoneProposalHistory([{ id:'history', artifacts:[sibling, revisionUndo] }]);
    const canonicalApplied = { ...byId[0], status:'applied', undoAvailable:true, executionAvailable:true, promoteAvailable:true };
    const canonicalMerge = mergeUndoneProposalCanonical(byId[0], canonicalApplied);
    const displayed = { ...proposal, recipeHash:'immutable', before:{temperature:{value:200,unit:'F'}} };
    const stored = { ...displayed, before:{temperature:{value:94,unit:'C'}}, sourceHash:'server-authority' };
    const reviewMerge = mergeUndoneProposalCanonical(displayed, stored);
    const mismatchedMerge = mergeUndoneProposalCanonical(displayed, {...stored,recipeHash:'different'});
    window.__undoProbe = { byId, byRevision, history, canonicalMerge, reviewMerge, mismatchedMerge };
    function App() { return <><RecipeProposalCard proposal={byId[0]} onInspect={() => {}} /><RecipeProposalCard proposal={aiden} onAction={() => {}} /></>; }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const compiled = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(compiled.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const probe = await page.evaluate(() => window.__undoProbe);
    assert.equal(probe.byId.find(item => item.id === 'proposal-1').status, 'undone');
    assert.equal(probe.byId.find(item => item.id === 'proposal-other').status, 'applied');
    assert.equal(probe.byRevision.find(item => item.id === 'proposal-other').status, 'undone');
    assert.equal(probe.byRevision.find(item => item.id === 'proposal-1').status, 'applied');
    assert.equal(probe.history[0].artifacts.find(item => item.id === 'proposal-other').status, 'undone');
    assert.equal(probe.canonicalMerge.status, 'undone');
    assert.deepEqual(probe.reviewMerge.before, {temperature:{value:200,unit:'F'}});
    assert.equal(probe.reviewMerge.sourceHash, 'server-authority');
    assert.deepEqual(probe.mismatchedMerge.before, {temperature:{value:94,unit:'C'}});
    const card = page.locator('[data-preview-card]');
    const text = await card.innerText();
    assert.deepEqual(errors, []);
    assert.match(text, /This change was undone\. Your saved recipe is unchanged\./);
    assert.doesNotMatch(text, /Saved to your recipe\.|Update saved recipe|Try for one brew|View recipe/);
    assert.equal(await card.locator('[data-proposal-actions]').count(), 0);
    const aidenCard = page.locator('[data-aiden-profile]');
    assert.match(await aidenCard.innerText(), /This change was undone\. Your saved recipe is unchanged\./);
    assert.equal(await aidenCard.locator('button').count(), 0); // no Save/Prepare actions after Undo
    assert.doesNotMatch(await aidenCard.innerText(), /Save profile|Prepare trial in Fellow/);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

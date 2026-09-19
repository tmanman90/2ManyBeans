import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const card = read('src/components/chat/artifacts/RecipeProposalCard.jsx');
const renderer = read('src/components/chat/ArtifactRenderer.jsx');
const preview = card.slice(card.indexOf('function PreviewCard'), card.indexOf('function AidenProfileCard'));

test('rendered recipe cards route proposed to preview, saved to inspection, and disable undone/applying', async () => {
  const compiled = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { RecipeProposalCard } from './src/components/chat/artifacts/RecipeProposalCard.jsx';
      window.calls = [];
      const before = { device:'v60', mode:'hot', coffeeGrams:20, waterGrams:300, ratio:15, grind:'5.5' };
      const after = { device:'v60', mode:'hot', coffeeGrams:18, waterGrams:270, ratio:15, grind:'5.6' };
      createRoot(document.getElementById('root')).render(<>{['proposed','applied','undone','applying'].map(status =>
        <div key={status} data-state={status}><RecipeProposalCard proposal={{id:status,type:'recipe_proposal',slotKey:'v60_hot',status,before,after}}
          onPreview={p=>window.calls.push('preview:'+p.id)} onInspect={p=>window.calls.push('inspect:'+p.id)} /></div>)}</>);
    `, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/app.js' ? compiled.outputFiles[0].text : '<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.match(await page.locator('[data-state="proposed"] [data-preview-change]').innerText(), /Coffee dose 20g → 18g/);
    await page.locator('[data-state="proposed"]').getByRole('button', { name: 'View recipe' }).click();
    await page.locator('[data-state="applied"]').getByRole('button', { name: 'View recipe' }).click();
    assert.deepEqual(await page.evaluate(() => window.calls), ['preview:proposed', 'inspect:applied']);
    assert.equal(await page.locator('[data-state="undone"] button').count(), 0);
    assert.equal(await page.locator('[data-state="applying"] button').isDisabled(), true);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('manual preview cards are compact, ratio-first, and keep legacy actions out', () => {
  assert.match(card, /new Set\(\['v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced'\]\)/);
  assert.match(preview, /data-preview-card="true"/);
  assert.match(preview, /View recipe/);
  assert.match(preview, /ratioChanged/);
  assert.doesNotMatch(preview, /<details|prepSteps|postBrewSteps|after\.steps/);
  assert.match(preview, /data-preview-change="true"/);
  assert.doesNotMatch(preview, /data-preview-supporting-values|recommendation|reasoning/);
});

test('non-proposed cards use only the read-only inspector and preserve status copy', () => {
  assert.match(renderer, /<RecipeProposalCard[\s\S]*onInspect=\{onInspect\}/);
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

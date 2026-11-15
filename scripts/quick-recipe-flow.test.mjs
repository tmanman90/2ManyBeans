import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Mounts the shipped QuickRecipeFlow. Only the scan, the recipe engines and
// the recipe sheets are stubbed, so no Firebase, Gemini or Fellow call runs.
// Guards two regressions: Quick Recipe offering only Aiden/V60, and a quick
// recipe leaving no record that the bean was ever brewed.
const STUBS = {
  '/lib/gemini.js': `
    export const scanBeanLabel = async () => ({ roaster: 'Sample Roaster', name: 'Sample Bean', origin: 'Kenya', process: 'Washed', bagSize: 20 });
    export const researchBeanOnline = async () => ({});`,
  '/lib/claude.js': `
    export const compressImage = async () => ({ base64: 'x', mediaType: 'image/png', previewUrl: 'data:,' });`,
  '/lib/recipeCommands.js': `
    export const executeRecipeCommand = async () => { throw new Error('not used'); };`,
  '/hooks/useUserProfile.jsx': `
    export const usePreferences = () => ({ preferences: { brewMethod: 'v60' } });`,
  '/hooks/useAidenBrew.js': `
    import { useState } from 'react';
    export const useAidenBrew = () => {
      const [aidenRecipe, setRecipe] = useState(null);
      return { aidenRecipe, aidenLoading: false, aidenResearch: null, aidenResult: null,
        handleBrewWithAiden: (bean, research) => { window.__calls.push(['aiden', research?.id || null]); setRecipe({ title: 'aiden recipe' }); } };
    };`,
  '/hooks/useHandBrew.js': `
    import { useState } from 'react';
    export const useHandBrew = () => {
      const [handBrewRecipe, setRecipe] = useState(null);
      return { handBrewRecipe, handBrewLoading: false, handBrewResearch: handBrewRecipe ? { id: 'research' } : null,
        handBrewIcedRecipe: null, userCoffeeGrams: null, attachHandBrewBeanId: () => {},
        handleBrewHandBrew: (bean, research, force, device) => { window.__calls.push(['handbrew', device]); setRecipe({ device, title: device + ' recipe' }); } };
    };`,
  '/hooks/useEspressoBrew.js': `
    export const useEspressoBrew = () => ({ espressoRecipe: null, espressoLoading: false,
      handleBrewEspresso: () => window.__calls.push(['espresso']) });`,
  '/hooks/useProfessorRuphus.js': `
    export const useProfessorRuphus = () => ({ handleLearn: () => {}, ruphusProps: {} });`,
  '/components/ProfessorRuphusSlideUp.jsx': 'export const ProfessorRuphusSlideUp = () => null;',
  '/components/AidenModal.jsx': `
    export const AidenModal = ({ recipe, extraFooter }) => <div data-sheet="aiden">{recipe?.title}{extraFooter}</div>;`,
  '/components/HandBrewModal.jsx': `
    export const HandBrewModal = ({ recipe, extraFooter }) => <div data-sheet="handbrew">{recipe?.title}{extraFooter}</div>;`,
  '/components/EspressoModal.jsx': `
    export const EspressoModal = ({ extraFooter }) => <div data-sheet="espresso">{extraFooter}</div>;`,
};

test('Quick Recipe starts on the Settings brewer and routes each brewer to its recipe', async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/quickRecipe.js', import.meta.url))],
    bundle: true, write: false, format: 'esm', loader: { '.js': 'jsx' },
  });
  const lib = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  assert.equal(lib.quickRecipeStartBrewer('kalita'), 'kalita');
  assert.equal(lib.quickRecipeStartBrewer('espresso'), 'espresso');
  assert.equal(lib.quickRecipeStartBrewer('aiden'), 'aiden');
  assert.equal(lib.quickRecipeStartBrewer(undefined), 'aiden');
  assert.deepEqual(['aiden', 'kalita', 'french-press', 'espresso'].map(lib.quickRecipeMethod), ['aiden', 'handbrew', 'handbrew', 'espresso']);
});

test('Quick Recipe offers every brewer and keeps the bean in the Archive', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { QuickRecipeFlow } from './src/components/QuickRecipeFlow.jsx';
    window.__calls = []; window.__added = []; window.__saved = [];
    function App() {
      const [open, setOpen] = React.useState(true);
      return <QuickRecipeFlow open={open} onClose={() => setOpen(false)}
        addBean={async (data) => { window.__added.push(data); return 'bean-1'; }}
        addTasting={async () => {}}
        onSaveToInventory={(...args) => window.__saved.push(args)}
        onStartTastingSession={() => {}} />;
    }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const compiled = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    plugins: [{ name: 'quick-recipe-stubs', setup(builder) {
      builder.onLoad({ filter: /\/src\/(lib|hooks|components)\/[^/]+\.jsx?$/ }, (args) => {
        const key = Object.keys(STUBS).find(suffix => args.path.endsWith(suffix));
        return key ? { contents: STUBS[key], loader: 'jsx', resolveDir: root } : undefined;
      });
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(compiled.outputFiles[0].text);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<title>Quick Recipe</title><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => (route.request().url().startsWith(base + '/') ? route.continue() : route.abort()));
    await page.goto(base);
    await page.locator('input[type=file]').setInputFiles({ name: 'bag.png', mimeType: 'image/png', buffer: Buffer.from('x') });

    // Starts on the Settings brewer (V60) and records the bean once, in the Archive.
    await page.getByText('v60 recipe').waitFor();
    await page.waitForFunction(() => window.__added.length === 1);
    const [record] = await page.evaluate(() => window.__added);
    assert.equal(record.status, 'FINISHED');
    assert.match(record.finishDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(record.jarSlot, null);
    assert.equal(record.name, 'Sample Bean');
    assert.equal(record.handBrewRecipes.v60.title, 'v60 recipe');

    const brewers = await page.getByRole('radio').allInnerTexts();
    assert.deepEqual(brewers, ['Aiden', 'V60', 'Kalita Wave', 'Chemex', 'Aeropress', 'French Press', 'Espresso']);
    assert.equal(await page.getByRole('radio', { name: 'V60' }).getAttribute('aria-checked'), 'true');

    await page.getByRole('radio', { name: 'Kalita Wave' }).click();
    await page.getByText('kalita recipe').waitFor();
    await page.getByRole('radio', { name: 'Aiden' }).click();
    await page.getByText('aiden recipe').waitFor();
    // Espresso (and any brewer whose recipe has not loaded) keeps the picker,
    // so the user can always switch back to another brewer.
    await page.getByRole('radio', { name: 'Espresso' }).click();
    await page.locator('[data-sheet="espresso"]').waitFor();
    assert.equal(await page.getByRole('radio').count(), 7);
    assert.equal(await page.getByRole('radio', { name: 'Espresso' }).getAttribute('aria-checked'), 'true');
    await page.getByRole('radio', { name: 'Aiden' }).click();
    await page.getByText('aiden recipe').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__calls), [
      ['handbrew', 'v60'], ['handbrew', 'kalita'], ['aiden', 'research'], ['espresso'], ['aiden', 'research'],
    ]);

    // Save to Inventory reuses the Archive record (no second bean) and carries
    // the recipes from every brewer tried in this session.
    await page.getByRole('button', { name: 'Save to Inventory' }).click();
    await page.waitForFunction(() => window.__saved.length === 1);
    const [[saved]] = await page.evaluate(() => window.__saved);
    assert.equal(saved.recordedBeanId, 'bean-1');
    assert.equal(saved.aidenRecipe.title, 'aiden recipe');
    assert.equal(saved.handBrewRecipes.kalita.title, 'kalita recipe');
    assert.equal(await page.evaluate(() => window.__added.length), 1);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

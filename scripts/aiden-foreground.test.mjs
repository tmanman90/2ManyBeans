import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('a retained Aiden sheet closes when the app returns to the foreground', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { useAidenBrew } from './src/hooks/useAidenBrew.js';
    const bean = { id: 'bean-1', name: 'Strawberry Shake', aidenRecipe: { title: 'Saved recipe' }, aidenLink: 'https://example.invalid/brew' };
    function App() {
      const aiden = useAidenBrew(() => Promise.resolve());
      return <><button onClick={() => aiden.handleBrewWithAiden(bean)}>Open recipe</button>
        <output data-open>{String(aiden.aidenModal)}</output></>;
    }
    createRoot(document.getElementById('root')).render(<App />);`;
  const mocks = new Map([
    ['aiden.js', 'export const generateAidenRecipe = async () => ({}); export const pushToAiden = async () => ({}); export const prepareAidenAttempt = async () => ({});'],
    ['beanResearch.js', 'export const researchBean = async () => null;'],
    ['sourceInsights.js', 'export const buildSourceContextHash = () => "hash"; export const hasSourceInsights = () => false;'],
    ['SubscriptionContext.jsx', 'export const useSubscription = () => ({ hasPro: true, hasUltra: true });'],
    ['usePaywall.jsx', 'export const usePaywall = () => ({ openPaywall: () => {} });'],
    ['recipeCommands.js', 'export const executeRecipeCommand = async () => ({});'],
    ['aidenProfilePreview.js', 'export const aidenLinkMatchesProfile = () => true;'],
  ]);
  const compiled = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'mock-aiden-boundaries', setup(builder) {
      builder.onLoad({ filter: /\.(?:js|jsx)$/ }, args => {
        const name = args.path.split('/').at(-1);
        return mocks.has(name) ? { contents: mocks.get(name), loader: 'js' } : undefined;
      });
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(compiled.outputFiles[0].text);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<div id="root"></div><script src="/app.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Open recipe' }).click();
    await page.waitForFunction(() => document.querySelector('[data-open]')?.textContent === 'true');
    await page.evaluate(() => {
      let hidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelector('[data-open]')?.textContent === 'false');
    await page.getByRole('button', { name: 'Open recipe' }).click();
    await page.waitForFunction(() => document.querySelector('[data-open]')?.textContent === 'true');
    assert.equal(await page.locator('[data-open]').innerText(), 'true');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

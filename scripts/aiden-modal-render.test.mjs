import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Mount the shipped components, not a copy of their markup. Only account
// preferences and external actions are substituted; no Firebase/Fellow calls.
test('saved Aiden recipes remain viewable, actionable and dismissible without Ruphus metadata', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const entry = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {AidenModal} from './src/components/AidenModal.jsx';
    const recipe = {title:'Saved Aiden recipe', ratio:16, bloomRatio:2,
      bloomDuration:30, bloomTemperature:94, ssPulsesNumber:3,
      ssPulsesInterval:25, ssPulseTemperatures:[94,94,94],
      batchPulsesNumber:3, batchPulsesInterval:25,
      batchPulseTemperatures:[94,94,94],
      grindRecommendation:{singleServe:5.6,batch:6.2}};
    function App() {
      const [open,setOpen] = React.useState(false);
      const [sent,setSent] = React.useState(0);
      const kind = new URLSearchParams(location.search).get('case');
      const provenance = kind === 'undefined' ? undefined : kind === 'empty' ? {} :
        ['apply','promote'].includes(kind) ? {source:kind,slotKey:'aiden',revisionId:'sample-revision'} : null;
      const props = kind === 'undefined' ? {} : {recipeProvenance:provenance};
      return <><button onClick={()=>setOpen(true)}>Brew with Aiden</button>
        <output data-sent>{sent}</output>
        <AidenModal {...props} open={open} onClose={()=>setOpen(false)}
          bean={{id:'sample',name:'Sample coffee'}}
          recipe={['loading','error'].includes(kind) ? null : recipe}
          loading={kind === 'loading'} error={kind === 'error' ? 'Test connection unavailable' : null}
          result={kind === 'linked' ? {link:'https://example.invalid/profile'} : null}
          onPushCached={value=>{if(value!==recipe) throw Error('Wrong recipe sent');setSent(n=>n+1);}}
        /></>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`;
  const compiled = await build({
    stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    plugins: [{ name: 'isolated-preferences', setup(builder) {
      builder.onLoad({ filter: /\/useUserProfile.jsx$/ }, () => ({
        contents: 'export const usePreferences=()=>({preferences:{grinder:"fellow-ode-gen2"},fellowConnected:true});',
        loader: 'js',
      }));
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(compiled.outputFiles[0].text);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<title>Aiden regression</title><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const kind of ['null', 'undefined', 'empty', 'apply', 'promote', 'linked', 'loading', 'error']) {
      await t.test(kind, async () => {
        const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
        const errors = [];
        const external = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          if (route.request().url().startsWith(base + '/')) return route.continue();
          external.push(route.request().url());
          return route.abort();
        });
        try {
          await page.goto(`${base}/?case=${kind}`);
          await page.getByRole('button', { name: 'Brew with Aiden', exact: true }).click();
          const close = page.getByRole('button', { name: 'Close', exact: true });
          await close.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
          assert.deepEqual(errors, [], 'opening the recipe must not crash React');
          assert.equal(await close.isVisible(), true);
          if (!['loading', 'error'].includes(kind)) {
            assert.equal(await page.getByText('Saved Aiden recipe', { exact: true }).isVisible(), true);
            assert.equal(await page.getByText('Temperature curve', { exact: true }).isVisible(), true);
            assert.equal(await page.locator('[data-recipe-provenance]').count(), ['apply','promote'].includes(kind) ? 1 : 0);
            if (kind === 'linked') {
              assert.equal(await page.getByRole('button', { name: 'Open in Fellow' }).isVisible(), true);
            } else {
              await page.getByRole('button', { name: 'Send to Aiden' }).click();
              assert.equal(await page.locator('[data-sent]').innerText(), '1');
            }
          }
          if (kind === 'null') await page.screenshot({ path: '/tmp/aiden-modal-fixed-mobile.png' });
          await close.click();
          await close.waitFor({ state: 'detached' });
          await page.getByRole('button', { name: 'Brew with Aiden', exact: true }).click();
          await close.waitFor({ state: 'visible' });
          await close.click();
          await close.waitFor({ state: 'detached' });
          assert.deepEqual(errors, []);
          assert.deepEqual(external, [], 'test must not contact Firebase or Fellow');
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

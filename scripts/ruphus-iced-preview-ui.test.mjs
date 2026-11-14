import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { generateV60IcedRecipe } from '../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../src/lib/kalitaIcedAdapter.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';

// Browser plugin not available. Local rendered component proof, not native,
// provider, or persistence acceptance. No external requests are permitted.
Object.assign(process.env, {
  TMB_APP_VARIANT: 'dev', VITE_FIREBASE_API_KEY: 'local-preview-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'local-preview.invalid', VITE_FIREBASE_PROJECT_ID: 'local-preview',
  VITE_FIREBASE_STORAGE_BUCKET: 'local-preview.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000', VITE_FIREBASE_APP_ID: '1:000000000000:web:local-preview',
});
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, define: { __APP_VARIANT__: JSON.stringify('dev') }, logLevel: 'silent' });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true });
const screenshots = await mkdtemp(join(tmpdir(), 'ruphus-iced-preview-'));
try {
  for (const width of [390, 1024]) {
    for (const family of ['v60', 'kalita']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(`${origin}/scripts/ruphus-recipe-first-preview-fixture.html?iced=${family}`, { waitUntil: 'domcontentloaded' });
      assert.ok(page.url().startsWith(origin));
      await page.getByRole('button', { name: 'View recipe', exact: true }).click();
      const dialog = page.locator('body');
      await dialog.getByRole('button', { name: 'Increase coffee dose' }).waitFor({ timeout: 5000 }).catch(error => {
        throw new Error(`${family} preview did not open: ${errors.join('; ') || error.message}`);
      });
      const icedHeader = family === 'v60' ? 'V60 02 · Iced' : 'Wave 185 · Iced';
      await dialog.getByText(icedHeader, { exact: true }).waitFor();
      if (family === 'v60') assert.equal(await dialog.getByText('V60 02 · Hot', { exact: true }).count(), 0);
      const recipe = family === 'v60' ? generateV60IcedRecipe({}, { dose: 20 }) : generateKalitaIcedRecipe({}, { size: '185', dose: 20 });
      const assertAmounts = async (expected) => {
        assert.match(await dialog.getByText('Brew water', { exact: true }).locator('..').innerText(), new RegExp(`${expected.waterGrams}g`));
        assert.match(await dialog.getByText('Recipe ice', { exact: true }).locator('..').innerText(), new RegExp(`${expected.iceGrams}g`));
        const ratioLabel = expected.ratio ? 'Total ratio' : 'Hot extraction ratio';
        assert.ok((await dialog.getByText(ratioLabel, { exact: true }).locator('..').innerText()).includes(expected.ratio || expected.hotExtractionRatio));
        if (!expected.ratio) await dialog.getByText(/Final strength depends on ice melt/).waitFor();
        for (const step of expected.postBrewSteps) assert.ok((await dialog.getByRole('region', { name: 'After brewing' }).innerText()).includes(step.action));
      };
      await assertAmounts(recipe);
      await dialog.getByRole('button', { name: 'Increase coffee dose' }).click();
      await dialog.getByText('21g', { exact: true }).waitFor();
      await assertAmounts(createRecipePreview({ recipe, dose: 21, configuration: { grinder: 'fellow-ode-gen2' } }));
      if (family === 'v60') {
        for (let dose = 22; dose <= 25; dose += 1) await dialog.getByRole('button', { name: 'Increase coffee dose' }).click();
        await dialog.getByText('25g', { exact: true }).waitFor();
        assert.match((await dialog.getByRole('note').allInnerTexts()).join(' '), /larger dose \(21–30g\)/i);
      }
      await page.screenshot({ path: join(screenshots, `${family}-${width}.png`) });
      await dialog.getByRole('button', { name: 'Save recipe', exact: true }).click();
      assert.equal(await page.locator('[data-save-count]').textContent(), '1');
      await dialog.getByRole('button', { name: 'Start brew timer', exact: true }).click();
      assert.equal(await page.locator('[data-start-count]').textContent(), '1');
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log(JSON.stringify({ passed: true, journeys: 4, screenshots, layer: 'local-rendered-only' }));
} finally {
  await browser.close();
  await server.close();
}

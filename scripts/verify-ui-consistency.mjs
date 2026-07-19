import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const PORT = 5202;
const URL = `http://127.0.0.1:${PORT}`;

function waitForServer(url, timeoutMs = 20_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) return resolve();
      } catch { /* server not ready */ }
      if (Date.now() - started > timeoutMs) return reject(new Error('vite did not start'));
      setTimeout(poll, 200);
    };
    poll();
  });
}

async function assertWordmark(page, variant) {
  const mark = page.locator(`[data-wordmark-variant="${variant}"]`);
  await mark.waitFor({ state: 'visible' });
  const metrics = await mark.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      label: element.getAttribute('aria-label'),
      role: element.getAttribute('role'),
      mask: getComputedStyle(element).webkitMaskImage || getComputedStyle(element).maskImage,
    };
  });
  assert.equal(metrics.label, '2manybeans');
  assert.equal(metrics.role, 'img');
  assert.ok(metrics.mask.includes('wordmark@2x.png'));
  assert.ok(Math.abs((metrics.width / metrics.height) - (1600 / 486)) < 0.03, `${variant} wordmark ratio drifted`);
}

async function enterDemo(page) {
  page.setDefaultTimeout(5_000);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await assertWordmark(page, 'hero');
  await page.getByText('Explore without an account', { exact: true }).click();
  await page.getByRole('button', { name: 'Rotation' }).waitFor();
}

async function dismissDemoPrompt(page) {
  await page.getByText('Create your free account', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Keep Exploring' }).click();
}

async function visibleSmallControls(root) {
  return root.locator('button, a, input, select, [role="button"]').evaluateAll((elements) => elements
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: (element.getAttribute('aria-label') || element.textContent || element.value || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter(({ width, height }) => width < 44 || height < 44));
}

async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.locator('[data-settings-page]');
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}

const tastingSource = await readFile(new globalThis.URL('../src/tabs/TastingTab.jsx', import.meta.url), 'utf8');
assert.match(tastingSource, /<GlassButton[\s\S]{0,1000}disabled=\{!hasBeans\}/, 'Tasting CTA must remain disabled when no bean is available');

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* already stopped */ } };

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  await enterDemo(page);
  await assertWordmark(page, 'chrome');

  const quickRecipe = page.getByRole('button', { name: 'Quick Recipe' });
  assert.equal(await quickRecipe.getAttribute('data-glass-button'), 'primary');
  // Long-press is a first-class action on the shared CTA. Use touch events so
  // this catches regressions where the gesture handlers are dropped while
  // migrating button material.
  await quickRecipe.dispatchEvent('touchstart', { bubbles: true });
  await page.waitForTimeout(450);
  const quickMenuAddBean = page.getByText('Add Bean', { exact: true });
  await quickMenuAddBean.waitFor({ state: 'visible', timeout: 2_000 });
  assert.ok(await quickMenuAddBean.boundingBox(), 'Quick Recipe long-press menu did not render');
  await page.getByText('Quick Recipe', { exact: true }).last().click();
  await dismissDemoPrompt(page);

  await page.getByRole('button', { name: 'Inventory' }).click();
  const addBean = page.getByRole('button', { name: /Add Bean/ }).first();
  assert.equal(await addBean.getAttribute('data-glass-button'), 'primary');
  const openJar = page.getByRole('button', { name: /OPEN INTO JAR/ }).first();
  assert.equal(await openJar.getAttribute('data-glass-button'), 'primary');
  await openJar.click();
  await dismissDemoPrompt(page);

  await page.getByRole('button', { name: 'Tasting' }).click();
  const tastingCta = page.getByRole('button', { name: /Start guided tasting/ });
  assert.equal(await tastingCta.getAttribute('data-glass-button'), 'primary');
  assert.equal(await tastingCta.getAttribute('data-glass-disabled'), 'false', 'Tasting CTA should expose its enabled material state');

  await page.getByRole('button', { name: 'Archive' }).click();
  await page.locator('[data-masthead]').waitFor({ state: 'visible' });
  const archiveGeometry = await page.evaluate(() => {
    const masthead = document.querySelector('[data-masthead]');
    const title = masthead?.firstElementChild?.getBoundingClientRect();
    const search = document.querySelector('input[aria-label="Search archive"]')?.closest('div')?.parentElement?.parentElement?.getBoundingClientRect();
    return {
      titleLeft: title?.left,
      searchLeft: search?.left,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert.ok(archiveGeometry.titleLeft >= 18 && archiveGeometry.titleLeft <= 22, `Archive title gutter is ${archiveGeometry.titleLeft}px`);
  assert.ok(archiveGeometry.searchLeft >= 14 && archiveGeometry.searchLeft <= 18, `Archive search gutter is ${archiveGeometry.searchLeft}px`);
  assert.ok(archiveGeometry.scrollWidth <= archiveGeometry.viewportWidth, 'Archive overflows horizontally');

  const settings = await openSettings(page);
  assert.deepEqual(await visibleSmallControls(settings), [], 'Settings contains a visible sub-44pt control');
  await settings.getByText('Connect your Fellow account for one-tap recipe push', { exact: true }).waitFor({ state: 'visible' });
  await settings.getByRole('button', { name: 'Connect', exact: true }).click();
  await settings.getByPlaceholder('Fellow email').waitFor({ state: 'visible' });
  await settings.getByPlaceholder('Password').waitFor({ state: 'visible' });
  assert.deepEqual(await visibleSmallControls(settings), [], 'Fellow connect form contains a visible sub-44pt control');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await settings.getByRole('button', { name: 'Redeem Code', exact: true }).click();
  await settings.getByPlaceholder('CODE').waitFor({ state: 'visible' });
  assert.equal(await settings.getByRole('button', { name: 'Redeem', exact: true }).isVisible(), true);
  assert.deepEqual(await visibleSmallControls(settings), [], 'Redeem form contains a visible sub-44pt control');
  await page.close();

  for (const target of ['Coffee Explorer', 'Set username']) {
    const narrow = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await enterDemo(narrow);
    const dialog = await openSettings(narrow);
    await dialog.getByRole('button', { name: target, exact: true }).click();
    const input = target === 'Coffee Explorer'
      ? dialog.getByPlaceholder('Your name')
      : dialog.getByPlaceholder('username');
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    const label = dialog.getByText(target === 'Coffee Explorer' ? 'Name' : 'Username', { exact: true });
    const [inputBox, saveBox, dialogBox, labelBox] = await Promise.all([input.boundingBox(), save.boundingBox(), dialog.boundingBox(), label.boundingBox()]);
    assert.ok(inputBox && saveBox && dialogBox);
    assert.ok(labelBox && labelBox.width > 0 && labelBox.height > 0, `${target} editor label is not visible at 320px`);
    assert.ok(labelBox.x >= dialogBox.x && labelBox.x + labelBox.width <= dialogBox.x + dialogBox.width, `${target} editor label overflows at 320px`);
    assert.ok(inputBox.height >= 44 && saveBox.height >= 44, `${target} editor has a sub-44pt control`);
    assert.ok(saveBox.x + saveBox.width <= dialogBox.x + dialogBox.width, `${target} editor overflows at 320px`);
    assert.deepEqual(await visibleSmallControls(dialog), [], `${target} state contains a visible sub-44pt control`);
    await narrow.close();
  }

  const narrowInventory = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await enterDemo(narrowInventory);
  await narrowInventory.getByRole('button', { name: 'Inventory' }).click();
  const narrowAddBean = narrowInventory.getByRole('button', { name: /Add Bean/ }).first();
  const addBeanBox = await narrowAddBean.boundingBox();
  const addBeanMetrics = await narrowAddBean.evaluate((element) => ({
    whiteSpace: getComputedStyle(element).whiteSpace,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  assert.ok(addBeanBox && addBeanBox.height >= 44, 'Inventory Add Bean CTA must remain at least 44px high at 320px');
  assert.ok(addBeanBox.x + addBeanBox.width <= 320, 'Inventory Add Bean CTA overflows at 320px');
  assert.equal(addBeanMetrics.whiteSpace, 'nowrap', 'Inventory Add Bean CTA may not wrap');
  assert.equal(addBeanMetrics.scrollWidth, addBeanMetrics.clientWidth, 'Inventory Add Bean CTA text must not overflow or shrink');
  assert.equal(addBeanMetrics.scrollHeight, addBeanMetrics.clientHeight, 'Inventory Add Bean CTA must remain one line');
  await narrowInventory.close();

  await browser.close();
  console.log('verify-ui-consistency: PASS');
} catch (error) {
  console.error('verify-ui-consistency: FAILED');
  console.error(error);
  process.exitCode = 1;
} finally {
  cleanup();
}

// v2-harness gate (loop: inventory-roaster-rails). Proves R1 (alphabetical roaster
// sections), R2 (horizontal scroll-snap rails), R4 (tap → trading card morph),
// R6 (search filters), R8-reduced-motion, R7-render (zero console errors).
// Spins Vite on the committed inventory-harness, drives Playwright, asserts, tears down.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5198;
const URL = `http://localhost:${PORT}/inventory-harness.html`;
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return resolve(); } catch { /* not up */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('vite did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const flightCenter = () => {
  const f = [...document.querySelectorAll('img')].find(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; });
  if (f) { const r = f.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width) }; }
  const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000');
  return ov ? { y: -1, w: -1 } : null; // overlay open but no flight yet
};

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  // ---- Pass 1: structure (alpha roasters, scrollable rails) + tap→morph + no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // R1 — roaster sections alphabetical top→bottom
    const roasters = ["Apollon's Gold", 'Stereoscope', 'Zephyr Coffee'];
    const tops = [];
    for (const r of roasters) { const b = await page.getByText(r, { exact: false }).first().boundingBox().catch(() => null); tops.push(b ? Math.round(b.y) : null); }
    if (tops.includes(null)) fail('a roaster header is missing: ' + JSON.stringify(tops));
    else if (!(tops[0] < tops[1] && tops[1] < tops[2])) fail('roasters not alphabetical top→bottom: ' + JSON.stringify(tops));
    else console.log('OK  roaster sections alphabetical', JSON.stringify(tops));

    // R2 — at least one rail is horizontally scrollable (the 3-bean Apollon rail)
    const rails = await page.evaluate(() => [...document.querySelectorAll('.bean-shelf')].map(r => ({ sw: Math.round(r.scrollWidth), cw: Math.round(r.clientWidth) })));
    const scrollable = rails.filter(r => r.sw > r.cw + 20).length;
    if (rails.length < 3) fail(`expected 3 roaster rails, found ${rails.length}`);
    if (scrollable < 1) fail('no horizontally-scrollable rail: ' + JSON.stringify(rails));
    else console.log(`OK  ${rails.length} rails, ${scrollable} horizontally scrollable`);

    // R4 — tap a rail card → trading card flies open (morph interpolates)
    await page.locator('.bean-shelf img').first().click({ position: { x: 80, y: 40 } }).catch(() => {});
    const samples = [];
    for (let i = 0; i < 16; i++) { const c = await page.evaluate(flightCenter); if (c) samples.push(c); await page.waitForTimeout(40); }
    const opened = samples.length > 0;
    const distinct = new Set(samples.filter(s => s.w > 0).map(s => `${s.y},${s.w}`)).size;
    if (!opened) fail('tap did not open the detail card');
    else if (distinct < 3) fail(`morph did not interpolate from inventory (only ${distinct} flight frames)`);
    else console.log(`OK  inventory tap → morph (${distinct} flight frames)`);

    if (errors.length) fail('console/page errors: ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 2: search filters across roasters ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const before = await page.locator('.bean-shelf img').count();
    await page.locator('input[placeholder="Search beans..."]').fill('Apollon');
    await page.waitForTimeout(350);
    const after = await page.locator('.bean-shelf img').count();
    if (!(before >= 6 && after > 0 && after < before)) fail(`search did not filter (before ${before}, after ${after})`);
    else console.log(`OK  search filters (${before} → ${after})`);
    await page.close();
  }

  // ---- Pass 3b: "Open into jar" is the shared warm glass button with a jar icon ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const open = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => /OPEN INTO JAR/i.test(b.textContent || ''));
      if (!btns.length) return { found: false };
      const b = btns[0];
      const bg = getComputedStyle(b).backgroundImage || '';
      const glass = b.getAttribute('data-glass-button') === 'primary';
      const warm = /184,\s*120,\s*70/.test(bg);      // canonical warm prominent glass tint
      const jar = !!b.querySelector('img[src*="jar"]'); // jar icon, not the Container glyph
      return { found: true, count: btns.length, glass, warm, jar };
    });
    if (!open.found) fail('no "OPEN INTO JAR" button rendered on the rail');
    else if (!open.glass || !open.warm) fail('"OPEN INTO JAR" is not the shared warm glass button');
    else if (!open.jar) fail('"OPEN INTO JAR" is missing its jar icon');
    else console.log(`OK  open-into-jar is shared warm glass + jar icon (${open.count} rails)`);

    await page.getByRole('button', { name: /OPEN INTO JAR/i }).first().click();
    const openCalls = await page.evaluate(() => window.__inventoryOpenCalls || []);
    if (openCalls.length !== 1 || openCalls[0][0] !== 'a1' || openCalls[0][1] !== 1) {
      fail(`open-into-jar callback drifted: ${JSON.stringify(openCalls)}`);
    } else {
      console.log('OK  open-into-jar callback fires once for first free slot');
    }

    // Brew / Learn / Freeze must be a uniform height (Brew's menu wrapper used to
    // leave it short next to the taller Ruphus-avatar Learn pill).
    const heights = await page.evaluate(() => {
      const want = ['Brew', 'Learn', 'Freeze'];
      return want.map(l => {
        const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l);
        return b ? Math.round(b.getBoundingClientRect().height) : null;
      });
    });
    if (heights.includes(null)) fail('a footer pill is missing: ' + JSON.stringify(heights));
    else if (Math.max(...heights) - Math.min(...heights) > 1) fail('Brew/Learn/Freeze heights not uniform: ' + JSON.stringify(heights));
    else console.log(`OK  footer pills uniform height (${heights[0]}px)`);
    await page.close();
  }

  // ---- Pass 3: reduced motion — detail opens, no morph flight, no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('.bean-shelf img').first().click({ position: { x: 80, y: 40 } }).catch(() => {});
    await page.waitForTimeout(450);
    const flight = await page.evaluate(() => [...document.querySelectorAll('img')].some(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; }));
    const overlay = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000'));
    if (!overlay) fail('reduced-motion: detail card did not open');
    else if (flight) fail('reduced-motion: morph flight ran (should be disabled)');
    else console.log('OK  reduced-motion: detail opens, no morph');
    if (errors.length) fail('reduced-motion errors: ' + JSON.stringify(errors.slice(0, 4)));
    await page.close();
  }

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  cleanup();
}

if (process.exitCode) console.error('verify-inventory: FAILED');
else console.log('verify-inventory: PASS');

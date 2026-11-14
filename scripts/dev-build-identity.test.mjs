import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Dev Settings identifies bundled source independently of OTA version', async () => {
  const prior = process.env.TMB_APP_VARIANT;
  try {
    process.env.TMB_APP_VARIANT = 'dev';
    const { default: dev } = await import('../vite.config.js?dev-identity');
    assert.match(JSON.parse(dev.define.__APP_BUILD_ID__), /^\d{8}T\d{6}Z-[a-f0-9]{7,12}$/);
    process.env.TMB_APP_VARIANT = 'prod';
    const { default: prod } = await import('../vite.config.js?prod-identity');
    assert.equal(JSON.parse(prod.define.__APP_BUILD_ID__), '');
    const settings = readFileSync(new URL('../src/components/SettingsPage.jsx', import.meta.url), 'utf8');
    assert.ok(settings.includes("__APP_VARIANT__ === 'dev' && <div>Dev build {__APP_BUILD_ID__}</div>"));
  } finally {
    if (prior === undefined) delete process.env.TMB_APP_VARIANT;
    else process.env.TMB_APP_VARIANT = prior;
  }
});

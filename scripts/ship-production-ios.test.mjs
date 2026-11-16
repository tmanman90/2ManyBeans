import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compatibilityUploadFlag, parseCompatibility, RUNTIME_GUARDED_PLUGINS } from './capgo-compat.mjs';

const source = readFileSync(new URL('./ship-production-ios.mjs', import.meta.url), 'utf8');

assert.match(source, /const PROD_APP_ID = 'com\.talmeltzer\.coffeehub';/);
assert.match(source, /const PROD_CHANNEL = 'production';/);
assert.match(source, /REQUIRED_BUILD_ENV/);
assert.match(source, /VITE_FIREBASE_API_KEY/);
assert.match(source, /build:ios/);
assert.match(source, /compatibilityUploadFlag\(/);
assert.match(source, /'bundle', 'compatibility', PROD_APP_ID, '--channel', PROD_CHANNEL, '--text'/);
assert.match(source, /compatibility\.flag,/);
assert.doesNotMatch(source, /'--ignore-metadata-check'/);
assert.ok(
  source.indexOf('restorePublishedSocialLoginManifest();') < source.indexOf('compatibilityUploadFlag('),
  'the compatibility check must run after the published social-login manifest is restored',
);
assert.match(source, /'--delta-only'/);
assert.match(source, /channel', 'currentBundle', PROD_CHANNEL, PROD_APP_ID/);
assert.match(source, /does not advance current Capgo bundle/);
assert.match(source, /installed production[\s\S]*baseline/);
assert.match(source, /restorePublishedSocialLoginManifest\(\);/);
assert.match(source, /npmCommand, \['pack', `\$\{SOCIAL_LOGIN_PACKAGE\}@\$\{installed\.version\}`/);
assert.match(source, /manifest\.includes\('facebook-ios-sdk'\)/);
assert.match(source, /SOCIAL_LOGIN_RESTORED_FILES = \['CapgoCapacitorSocialLogin\.podspec'\]/);
assert.ok(
  source.indexOf('restorePublishedSocialLoginManifest();') < source.indexOf("run(npmCommand, ['run', 'build:ios'])"),
  'production must restore the published native manifest before building and uploading',
);
assert.doesNotMatch(source, /run\('node', \['scripts\/patch-social-login\.mjs'\]\)/);

// Capgo compatibility table (--text output, trimmed from a real 2026-11-15 run).
const row = (name, local, remote, status, details) => `│  │ \u001b[1m${name}\u001b[0m │ ${local} │ ${remote} │ ${status} │ ${details} │`;
const table = (...rows) => ['┌  Check compatibility', '◆  Compatibility Check Results', ...rows, '▲  An app store update may be required'].join('\n');
const ok = (name) => row(name, '8.0.1', '8.0.1', 'OK', 'Compatible');
const ble = row('@capacitor-community/bluetooth-le', '8.3.0', '-', 'FAIL', 'New native plugin added (requires app store update)');
const social = row('@capgo/capacitor-social-login', '8.3.9', '8.3.9', 'FAIL', 'iOS native code changed');

assert.deepEqual(parseCompatibility(table(ok('@capacitor/camera'), ble)).map((r) => [r.name, r.ok]), [
  ['@capacitor/camera', true],
  ['@capacitor-community/bluetooth-le', false],
]);
assert.deepEqual(compatibilityUploadFlag(table(ok('@capacitor/camera'))), { flag: '--fail-on-incompatible', accepted: [] });
assert.deepEqual(compatibilityUploadFlag(table(ok('@capacitor/camera'), ble)), {
  flag: '--accept-incompatible',
  accepted: ['@capacitor-community/bluetooth-le'],
});
assert.throws(() => compatibilityUploadFlag(table(ble, social)), /@capgo\/capacitor-social-login \(iOS native code changed\)/);
assert.throws(() => compatibilityUploadFlag(table(row('@capacitor/geolocation', '8.0.0', '-', 'FAIL', 'New native plugin added'))), /geolocation/);
assert.throws(() => compatibilityUploadFlag('Error: network down'), /Could not read the Capgo compatibility table/);

// Every allowlisted plugin must really be guarded in the app code.
const transport = readFileSync(new URL('../src/lib/scale/scaleTransport.js', import.meta.url), 'utf8');
for (const pluginName of Object.values(RUNTIME_GUARDED_PLUGINS)) {
  assert.match(transport, new RegExp(`Capacitor\\.isPluginAvailable\\('${pluginName}'\\)`));
}
assert.doesNotMatch(
  readFileSync(new URL('../src/lib/scale/scaleTransport.js', import.meta.url), 'utf8'),
  /^import .*@capacitor-community\/bluetooth-le/m,
  'the BLE plugin must stay a dynamic import behind the availability check',
);

console.log('Production iOS ship guard contract passed.');

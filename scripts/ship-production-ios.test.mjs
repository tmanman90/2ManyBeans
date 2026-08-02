import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ship-production-ios.mjs', import.meta.url), 'utf8');

assert.match(source, /const PROD_APP_ID = 'com\.talmeltzer\.coffeehub';/);
assert.match(source, /const PROD_CHANNEL = 'production';/);
assert.match(source, /REQUIRED_BUILD_ENV/);
assert.match(source, /VITE_FIREBASE_API_KEY/);
assert.match(source, /build:ios/);
assert.match(source, /'--fail-on-incompatible'/);
assert.match(source, /channel', 'currentBundle', PROD_CHANNEL, PROD_APP_ID/);
assert.match(source, /does not advance current Capgo bundle/);
assert.match(source, /installed production[\s\S]*baseline/);
assert.match(source, /restorePublishedSocialLoginManifest\(\);/);
assert.match(source, /npmCommand, \['pack', `\$\{SOCIAL_LOGIN_PACKAGE\}@\$\{installed\.version\}`/);
assert.match(source, /manifest\.includes\('facebook-ios-sdk'\)/);
assert.ok(
  source.indexOf('restorePublishedSocialLoginManifest();') < source.indexOf("run(npmCommand, ['run', 'build:ios'])"),
  'production must restore the published native manifest before building and uploading',
);
assert.doesNotMatch(source, /run\('node', \['scripts\/patch-social-login\.mjs'\]\)/);

console.log('Production iOS ship guard contract passed.');

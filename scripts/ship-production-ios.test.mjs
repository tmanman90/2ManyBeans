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

console.log('Production iOS ship guard contract passed.');

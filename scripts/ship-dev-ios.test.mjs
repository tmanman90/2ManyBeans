import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { semverSafeDevTimestamp } from './ship-dev-version.mjs';

const source = readFileSync(new URL('./ship-dev-ios.mjs', import.meta.url), 'utf8');

assert.match(source, /const DEV_APP_ID = 'com\.talmeltzer\.coffeehub\.dev';/);
assert.match(source, /const DEV_CHANNEL = 'dev';/);
assert.match(source, /scripts\/patch-social-login\.mjs/);
assert.match(source, /build:ios:dev/);
assert.match(source, /'--fail-on-incompatible'/);
assert.match(source, /channel', 'currentBundle', DEV_CHANNEL, DEV_APP_ID/);
assert.match(source, /-devapp\./);
assert.match(source, /REQUIRED_BUILD_ENV/);
assert.match(source, /VITE_FIREBASE_API_KEY/);
assert.match(source, /valid Firebase config/);
assert.doesNotMatch(source, /--send-update-notification/);
assert.equal(semverSafeDevTimestamp(new Date('2026-08-03T02:08:12.000Z')), 'd20260803.t020812');
assert.match(source, /semverSafeDevTimestamp/);

console.log('Dev iOS ship guard contract passed.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ship-dev-ios.mjs', import.meta.url), 'utf8');

assert.match(source, /const DEV_APP_ID = 'com\.talmeltzer\.coffeehub\.dev';/);
assert.match(source, /const DEV_CHANNEL = 'dev';/);
assert.match(source, /scripts\/patch-social-login\.mjs/);
assert.match(source, /build:ios:dev/);
assert.match(source, /'--fail-on-incompatible'/);
assert.match(source, /channel', 'currentBundle', DEV_CHANNEL, DEV_APP_ID/);
assert.match(source, /-devapp\./);
assert.doesNotMatch(source, /--send-update-notification/);

console.log('Dev iOS ship guard contract passed.');

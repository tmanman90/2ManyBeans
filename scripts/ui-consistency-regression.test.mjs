import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  glassButton,
  rotation,
  inventory,
  tasting,
  wordmark,
  signIn,
  app,
  settings,
] = await Promise.all([
  read('src/components/GlassButton.jsx'),
  read('src/tabs/RotationTab.jsx'),
  read('src/tabs/InventoryTab.jsx'),
  read('src/tabs/TastingTab.jsx'),
  read('src/components/Wordmark.jsx'),
  read('src/components/SignInScreen.jsx'),
  read('src/App.jsx'),
  read('src/components/SettingsPage.jsx'),
]);

assert.match(glassButton, /data-glass-button="primary"/, 'shared glass button needs a stable primary marker');
assert.match(glassButton, /minHeight:\s*44/, 'shared glass button must meet the iOS touch target');
assert.match(glassButton, /data-glass-disabled=\{disabled \? 'true' : 'false'\}/, 'shared glass button needs an explicit disabled state');
assert.match(glassButton, /\{!disabled && <>/, 'disabled glass buttons must suppress active sheen overlays');

assert.match(rotation, /<GlassButton\b[\s\S]{0,700}Quick Recipe/, 'Rotation Quick Recipe must use shared glass');
assert.match(rotation, /<GlassButton\b[\s\S]{0,700}Add Bean/, 'Rotation Add Bean must use shared glass');
assert.match(inventory, /<GlassButton\b[\s\S]{0,700}Add Bean/, 'Inventory Add Bean must use shared glass');
const tastingCta = tasting.slice(
  tasting.indexOf('Big primary CTA'),
  tasting.indexOf('Quiet scaffolding line'),
);
assert.match(tastingCta, /<GlassButton\b/, 'Tasting guided CTA must use shared glass');
assert.match(tastingCta, /ctaLabel/, 'Tasting guided CTA must retain its dynamic label');
const trailingStyleStart = tastingCta.indexOf('style={{', tastingCta.indexOf('trailing='));
const tastingButtonStyleStart = tastingCta.indexOf('style={{', trailingStyleStart + 1);
assert.notEqual(tastingButtonStyleStart, -1, 'Tasting guided CTA needs an explicit layout style');
const tastingButtonStyleEnd = tastingCta.indexOf('}}', tastingButtonStyleStart);
assert.notEqual(tastingButtonStyleEnd, -1, 'Tasting guided CTA style must be closed');
const tastingButtonStyle = tastingCta.slice(tastingButtonStyleStart, tastingButtonStyleEnd);
assert.doesNotMatch(
  tastingButtonStyle,
  /\b(?:border|background|boxShadow|textShadow|color|cursor|backdropFilter|WebkitBackdropFilter|opacity|fontFamily|fontSize|fontWeight)\s*:/,
  'Tasting guided CTA must not override shared glass material',
);

assert.doesNotMatch(
  inventory,
  /rgba\(20,\s*150,\s*212/,
  'Inventory must not restore the retired cyan Open Into Jar tint',
);
const openJarAt = inventory.indexOf('OPEN INTO JAR');
assert.notEqual(openJarAt, -1, 'Open Into Jar label must remain present');
assert.match(
  inventory.slice(Math.max(0, openJarAt - 1_000), openJarAt + 200),
  /<GlassButton\b[\s\S]*jar-full\.webp/,
  'Open Into Jar must use warm glass and retain its jar icon',
);

assert.match(wordmark, /const WORDMARK_ASPECT = 1600 \/ 486/, 'wordmark must preserve source aspect ratio');
assert.match(wordmark, /chrome:\s*\{/, 'wordmark needs an explicit chrome variant');
assert.match(wordmark, /hero:\s*\{/, 'wordmark needs an explicit hero variant');
assert.match(signIn, /<Wordmark variant="hero"\s*\/>/, 'sign-in must use the shared hero wordmark');
assert.equal(
  (app.match(/<Wordmark variant="chrome"\s*\/>/g) || []).length,
  2,
  'both app header branches must use the shared chrome wordmark',
);

assert.match(
  app,
  /tab === 'archive' \? `12px 0 calc\(100px \+ env\(safe-area-inset-bottom, 0px\)\)`/,
  'Archive must opt out of duplicate horizontal padding while retaining bottom safe-area clearance',
);

assert.match(settings, /const compactActionStyle = \{[\s\S]*minWidth:\s*44,[\s\S]*minHeight:\s*44/, 'Settings compact actions need 44pt geometry');
assert.match(settings, /const compactInputStyle = \{[\s\S]*minHeight:\s*44/, 'Settings compact inputs need a 44pt minimum height');
assert.match(settings, /const inlineEditStyle = \{[\s\S]*flex:\s*'1 1 auto',[\s\S]*minWidth:\s*0/, 'Settings inline edit wrappers must shrink within narrow rows');
assert.match(settings, /const inlineEditInputStyle = \{[\s\S]*flex:\s*'1 1 150px',[\s\S]*minWidth:\s*0/, 'Settings inline edit inputs need a shrinkable flex basis');
assert.match(settings, /const inlineEditSaveStyle = \{[\s\S]*flexShrink:\s*0/, 'Settings Save actions must not shrink below their touch target');
assert.match(settings, /const inlineEditLabelStyle = \{[\s\S]*minWidth:\s*72/, 'Settings editor labels must remain visible on narrow screens');
assert.match(settings, /const selectStyle = \{[\s\S]*minWidth:\s*44,[\s\S]*minHeight:\s*44/, 'Settings selects need 44pt geometry');
assert.doesNotMatch(settings, /minHeight:\s*(?:3[0-9]|40)\b/, 'Settings must not reintroduce sub-44pt minimum heights');

console.log('UI consistency regression passed');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_RUPHUS_API_BASE',
];

const cleanEnv = { ...process.env };
for (const name of required) delete cleanEnv[name];

const missing = spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs'], {
  cwd: process.cwd(),
  env: cleanEnv,
  encoding: 'utf8',
});
assert.notEqual(missing.status, 0, 'native iOS build preflight must reject missing Firebase config');
for (const name of required) assert.match(missing.stderr, new RegExp(name));

const secretSentinel = 'firebase-secret-must-never-appear-in-preflight-output';
const oneMissingEnv = Object.fromEntries(required.map((name) => [name, secretSentinel]));
delete oneMissingEnv.VITE_FIREBASE_APP_ID;
oneMissingEnv.VITE_RUPHUS_API_BASE = 'https://ruphus-preview.vercel.app/';
const oneMissing = spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, ...oneMissingEnv },
  encoding: 'utf8',
});
assert.notEqual(oneMissing.status, 0, 'preflight must reject each missing Firebase value');
assert.match(oneMissing.stderr, /VITE_FIREBASE_APP_ID/);
assert.doesNotMatch(oneMissing.stdout, new RegExp(secretSentinel));
assert.doesNotMatch(oneMissing.stderr, new RegExp(secretSentinel));

const whitespace = { ...process.env };
whitespace.VITE_FIREBASE_API_KEY = '   ';
for (const name of required.slice(1)) whitespace[name] = name === 'VITE_RUPHUS_API_BASE' ? 'https://ruphus-preview.vercel.app/' : 'configured-for-test';
const whitespaceResult = spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs'], {
  cwd: process.cwd(),
  env: whitespace,
  encoding: 'utf8',
});
assert.notEqual(whitespaceResult.status, 0, 'whitespace-only Firebase values must count as missing');
assert.match(whitespaceResult.stderr, /VITE_FIREBASE_API_KEY/);

const configuredEnv = Object.fromEntries(required.map((name) => [name, name === 'VITE_RUPHUS_API_BASE' ? 'https://ruphus-preview.vercel.app/' : 'configured-for-test']));
const configured = spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs'], {
  cwd: process.cwd(),
  env: configuredEnv,
  encoding: 'utf8',
});
assert.equal(configured.status, 0, configured.stderr);

for (const [label, value] of [
  ['missing', undefined],
  ['whitespace', '   '],
  ['malformed', 'preview host is not a URL'],
  ['non-HTTPS', 'http://ruphus-preview.vercel.app/'],
  ['production', 'https://2manybeans.vercel.app/'],
]) {
  const env = { ...configuredEnv, VITE_RUPHUS_API_BASE: value };
  if (value === undefined) delete env.VITE_RUPHUS_API_BASE;
  const result = spawnSync(process.execPath, ['scripts/assert-ios-build-env.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, `${label} preview base must fail closed`);
  assert.match(result.stderr, /VITE_RUPHUS_API_BASE/);
  assert.doesNotMatch(result.stdout, /preview host is not a URL|2manybeans/);
  assert.doesNotMatch(result.stderr, /preview host is not a URL|2manybeans/);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.match(
  packageJson.scripts['build:ios:dev'],
  /^node scripts\/assert-ios-build-env\.mjs && .*TMB_APP_VARIANT=dev.*TMB_DISABLE_CAPGO_UPDATES=1.*vite build$/,
  'the normal Dev native build must fail closed before Vite runs',
);
assert.match(packageJson.scripts['cap:copy:dev'], /configure-ios-variant\.mjs dev && TMB_APP_VARIANT=dev TMB_DISABLE_CAPGO_UPDATES=1 .*npx cap copy ios/);
assert.match(packageJson.scripts['cap:sync:dev'], /configure-ios-variant\.mjs dev && TMB_APP_VARIANT=dev TMB_DISABLE_CAPGO_UPDATES=1 .*npx cap sync/);
assert.equal(packageJson.scripts.build, 'vite build', 'web builds must not inherit the native preflight');
assert.equal(packageJson.scripts['build:ios'], 'CAPACITOR_BUILD=true vite build', 'production native build must remain unchanged');

const capacitorConfig = readFileSync('capacitor.config.ts', 'utf8');
assert.match(capacitorConfig, /com\.talmeltzer\.coffeehub\.dev/);
assert.match(capacitorConfig, /2manybeans Dev/);
assert.match(capacitorConfig, /autoUpdate: !disableCapgoUpdates/);
assert.match(capacitorConfig, /TMB_DISABLE_CAPGO_UPDATES/);

const sceneManifestResult = spawnSync('plutil', [
  '-extract',
  'UIApplicationSceneManifest',
  'json',
  '-o',
  '-',
  'ios/App/App/Info.plist',
], { encoding: 'utf8' });
assert.equal(sceneManifestResult.status, 0, 'iOS 27 requires an application scene manifest');
const sceneManifest = JSON.parse(sceneManifestResult.stdout);
assert.equal(sceneManifest.UIApplicationSupportsMultipleScenes, false);
const applicationScenes = sceneManifest.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
assert.equal(applicationScenes?.length, 1, 'the app must declare exactly one main scene configuration');
assert.equal(applicationScenes[0].UISceneConfigurationName, 'Default Configuration');
assert.equal(applicationScenes[0].UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
assert.equal(applicationScenes[0].UISceneStoryboardFile, 'Main');

const appDelegateSource = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
assert.match(appDelegateSource, /configurationForConnecting connectingSceneSession/);
const sceneDelegateSource = readFileSync('ios/App/App/SceneDelegate.swift', 'utf8');
assert.match(sceneDelegateSource, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
assert.match(sceneDelegateSource, /ApplicationDelegateProxy\.shared\.application\(UIApplication\.shared, open:/);
assert.match(sceneDelegateSource, /continue: userActivity/);

const iosVariantConfigurator = readFileSync('scripts/configure-ios-variant.mjs', 'utf8');
assert.match(iosVariantConfigurator, /const ensureSceneLifecycle = \(\) =>/);
assert.match(iosVariantConfigurator, /writeFileSync\(sceneDelegatePath, sceneDelegateSource\)/);
assert.match(iosVariantConfigurator, /<key>UIApplicationSceneManifest<\/key>/);
assert.match(iosVariantConfigurator, /configurationForConnecting connectingSceneSession/);
assert.match(iosVariantConfigurator, /SceneDelegate\.swift in Sources/);

const apiBaseSource = readFileSync('src/lib/apiBase.js', 'utf8');
assert.match(apiBaseSource, /VITE_RUPHUS_API_BASE/);
assert.match(apiBaseSource, /base\.searchParams/);
assert.match(apiBaseSource, /searchParams\.append/);
assert.match(apiBaseSource, /return normalizedPath/);

for (const path of ['src/tabs/ChatTab.jsx', 'src/lib/recipeCommands.js', 'src/lib/ruphusTasting.js', 'src/lib/aiden.js']) {
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /RUPHUS_API_BASE/, `${path} must not retain the deleted direct-base route`);
}
const aidenSource = readFileSync('src/lib/aiden.js', 'utf8');
assert.equal((aidenSource.match(/ruphusApiUrl\('\/api\/aiden'\)/g) || []).length, 2, 'both legacy and attempt Aiden preparation must use preview-aware routing');
assert.match(aidenSource, /const PROXY_URL = `\$\{API_BASE\}\/api\/openai`/, 'Aiden generation must retain the existing OpenAI route');

// Evaluate only the small URL module with its two build-time dependencies
// replaced. This keeps the routing contract test offline and exercises the
// actual URL construction instead of duplicating it in the test.
async function loadApiBase({ native, variant, previewBase }) {
  const source = apiBaseSource
    .replace("import { Capacitor } from '@capacitor/core';", `const Capacitor = { isNativePlatform: () => ${native} };`)
    .replace(/const isDevVariant = [^;]+;/, `const isDevVariant = ${variant === 'dev'};`)
    .replace(/const configuredRuphusBase = [^;]+;/, `const configuredRuphusBase = ${JSON.stringify(previewBase)};`)
    .replaceAll('export ', '')
    .concat('\nexport { API_BASE, RUPHUS_API_BASE, ruphusApiUrl };');
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

const nativeDev = await loadApiBase({
  native: true,
  variant: 'dev',
  previewBase: 'https://ruphus-preview.vercel.app/?x-vercel-protection-bypass=preview-token&x-vercel-protection-bypass=preview-token-2',
});
const nativeDevUrl = new URL(nativeDev.ruphusApiUrl('/api/ruphus-agent?turn=1'));
assert.equal(nativeDevUrl.origin, 'https://ruphus-preview.vercel.app');
assert.equal(nativeDevUrl.pathname, '/api/ruphus-agent');
assert.deepEqual(nativeDevUrl.searchParams.getAll('x-vercel-protection-bypass'), ['preview-token', 'preview-token-2']);
assert.equal(nativeDevUrl.searchParams.get('turn'), '1');

const nativeProd = await loadApiBase({
  native: true,
  variant: 'prod',
  previewBase: 'https://ruphus-preview.vercel.app/?x-vercel-protection-bypass=preview-token',
});
assert.equal(nativeProd.API_BASE, 'https://2manybeans.vercel.app');
assert.equal(nativeProd.RUPHUS_API_BASE, nativeProd.API_BASE);
assert.equal(new URL(nativeProd.ruphusApiUrl('/api/ruphus-agent')).origin, 'https://2manybeans.vercel.app');
assert.equal(new URL(nativeProd.ruphusApiUrl('/api/ruphus-agent')).search, '');

const web = await loadApiBase({ native: false, variant: 'dev', previewBase: 'https://ruphus-preview.vercel.app/?x-vercel-protection-bypass=preview-token' });
assert.equal(web.API_BASE, '');
assert.equal(web.RUPHUS_API_BASE, '');
assert.equal(web.ruphusApiUrl('/api/ruphus-agent'), '/api/ruphus-agent');

const nativeDevWithoutPreview = await loadApiBase({ native: true, variant: 'dev', previewBase: '' });
assert.equal(nativeDevWithoutPreview.RUPHUS_API_BASE, '');
assert.equal(nativeDevWithoutPreview.ruphusApiUrl('/api/ruphus-agent'), '/api/ruphus-agent');

const nativeDevWithMalformedPreview = await loadApiBase({ native: true, variant: 'dev', previewBase: 'not-a-url' });
assert.equal(nativeDevWithMalformedPreview.ruphusApiUrl('/api/ruphus-agent'), '/api/ruphus-agent');

console.log('iOS Firebase build environment guard verified');

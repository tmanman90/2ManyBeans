import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const variantName = process.argv[2];

const variants = {
  prod: {
    appId: 'com.talmeltzer.coffeehub',
    displayName: '2manybeans',
    capgoChannel: null,
    firebaseConfigFile: 'GoogleService-Info.prod.plist',
  },
  dev: {
    appId: 'com.talmeltzer.coffeehub.dev',
    displayName: '2manybeans Dev',
    capgoChannel: 'dev',
    firebaseConfigFile: 'GoogleService-Info.dev.plist',
  },
};

const variant = variants[variantName];

if (!variant) {
  console.error('Usage: node scripts/configure-ios-variant.mjs <prod|dev>');
  process.exit(1);
}

const root = process.cwd();
const projectPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const infoPlistPath = join(root, 'ios/App/App/Info.plist');
const capacitorConfigPath = join(root, 'ios/App/App/capacitor.config.json');
const firebaseConfigPath = join(root, 'config/firebase', variant.firebaseConfigFile);
const appFirebaseConfigPath = join(root, 'ios/App/App/GoogleService-Info.plist');
const iosFirebaseConfigPath = join(root, 'ios/App/GoogleService-Info.plist');

const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${label}`);
  }

  return source.replace(pattern, replacement);
};

const readPlistString = (plistPath, key) => {
  const source = readFileSync(plistPath, 'utf8');
  const match = source.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  if (!match) {
    throw new Error(`Could not find ${key} in ${plistPath}`);
  }

  return match[1];
};

const patchProject = () => {
  const source = readFileSync(projectPath, 'utf8');
  const updated = replaceRequired(
    source,
    /PRODUCT_BUNDLE_IDENTIFIER = com\.talmeltzer\.coffeehub(?:\.dev)?;/g,
    `PRODUCT_BUNDLE_IDENTIFIER = ${variant.appId};`,
    'PRODUCT_BUNDLE_IDENTIFIER in Xcode project',
  );

  if (updated !== source) {
    writeFileSync(projectPath, updated);
  }
};

const patchInfoPlist = () => {
  const source = readFileSync(infoPlistPath, 'utf8');
  const reversedClientId = readPlistString(firebaseConfigPath, 'REVERSED_CLIENT_ID');
  let updated = replaceRequired(
    source,
    /(<key>CFBundleDisplayName<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1${variant.displayName}$3`,
    'CFBundleDisplayName in Info.plist',
  );

  updated = replaceRequired(
    updated,
    /(<key>CFBundleURLName<\/key>\s*<string>)([^<]*)(<\/string>)/,
    `$1${variant.appId}$3`,
    'CFBundleURLName in Info.plist',
  );

  updated = replaceRequired(
    updated,
    /(<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>)([^<]*)(<\/string>)/,
    `$1${reversedClientId}$3`,
    'Google URL scheme in Info.plist',
  );

  if (updated !== source) {
    writeFileSync(infoPlistPath, updated);
  }
};

const patchCapacitorConfig = () => {
  const config = JSON.parse(readFileSync(capacitorConfigPath, 'utf8'));

  config.appId = variant.appId;
  config.appName = variant.displayName;
  config.plugins ??= {};
  config.plugins.CapacitorUpdater ??= {};
  config.plugins.CapacitorUpdater.autoUpdate = true;

  if (variant.capgoChannel) {
    config.plugins.CapacitorUpdater.defaultChannel = variant.capgoChannel;
  } else {
    delete config.plugins.CapacitorUpdater.defaultChannel;
  }

  writeFileSync(capacitorConfigPath, `${JSON.stringify(config, null, '\t')}\n`);
};

const copyFirebaseConfig = () => {
  copyFileSync(firebaseConfigPath, appFirebaseConfigPath);
  copyFileSync(firebaseConfigPath, iosFirebaseConfigPath);
};

patchProject();
patchInfoPlist();
patchCapacitorConfig();
copyFirebaseConfig();

console.log(
  `Configured iOS ${variantName} app: ${variant.displayName} (${variant.appId})${
    variant.capgoChannel ? ` on Capgo ${variant.capgoChannel}` : ''
  }`,
);

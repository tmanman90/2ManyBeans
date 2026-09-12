import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const variantName = process.argv[2];
// A release operator may preserve a separate, pre-existing root plist while
// still configuring the actual app-bundled Firebase resource below.
const preserveRootFirebase = process.argv.includes('--preserve-root-firebase');

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
const appDelegatePath = join(root, 'ios/App/App/AppDelegate.swift');
const sceneDelegatePath = join(root, 'ios/App/App/SceneDelegate.swift');
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

const sceneDelegateSource = `import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let context = URLContexts.first else { return }

        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let sourceApplication = context.options.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = context.options.openInPlace

        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
`;

const sceneManifest = `\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t\t<key>UISceneConfigurations</key>
\t\t<dict>
\t\t\t<key>UIWindowSceneSessionRoleApplication</key>
\t\t\t<array>
\t\t\t\t<dict>
\t\t\t\t\t<key>UISceneConfigurationName</key>
\t\t\t\t\t<string>Default Configuration</string>
\t\t\t\t\t<key>UISceneDelegateClassName</key>
\t\t\t\t\t<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
\t\t\t\t\t<key>UISceneStoryboardFile</key>
\t\t\t\t\t<string>Main</string>
\t\t\t\t</dict>
\t\t\t</array>
\t\t</dict>
\t</dict>`;

const sceneConfigurationMethod = `    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

`;

const ensureSceneLifecycle = () => {
  writeFileSync(sceneDelegatePath, sceneDelegateSource);

  const appDelegate = readFileSync(appDelegatePath, 'utf8');
  if (!appDelegate.includes('configurationForConnecting connectingSceneSession')) {
    const updated = replaceRequired(
      appDelegate,
      /(    func application\(_ app: UIApplication, open url: URL)/,
      `${sceneConfigurationMethod}$1`,
      'URL handler insertion point in AppDelegate.swift',
    );
    writeFileSync(appDelegatePath, updated);
  }

  const infoPlist = readFileSync(infoPlistPath, 'utf8');
  if (!infoPlist.includes('<key>UIApplicationSceneManifest</key>')) {
    const updated = replaceRequired(
      infoPlist,
      /(\t<key>UILaunchStoryboardName<\/key>)/,
      `${sceneManifest}\n$1`,
      'launch storyboard insertion point in Info.plist',
    );
    writeFileSync(infoPlistPath, updated);
  }

  let project = readFileSync(projectPath, 'utf8');
  if (!project.includes('5A7C91B42FA1000000000001 /* SceneDelegate.swift in Sources */ =')) {
    project = replaceRequired(
      project,
      /(^\s*[A-F0-9]{24} \/\* AppDelegate\.swift in Sources \*\/ = \{isa = PBXBuildFile; fileRef = [A-F0-9]{24} \/\* AppDelegate\.swift \*\/; \};\n)/m,
      '$1\t\t5A7C91B42FA1000000000001 /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 5A7C91B32FA1000000000001 /* SceneDelegate.swift */; };\n',
      'SceneDelegate PBXBuildFile insertion point',
    );
  }
  if (!project.includes('5A7C91B32FA1000000000001 /* SceneDelegate.swift */ =')) {
    project = replaceRequired(
      project,
      /(^\s*[A-F0-9]{24} \/\* AppDelegate\.swift \*\/ = \{isa = PBXFileReference;[^\n]+\n)/m,
      '$1\t\t5A7C91B32FA1000000000001 /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = "<group>"; };\n',
      'SceneDelegate PBXFileReference insertion point',
    );
  }
  if (!project.includes('5A7C91B32FA1000000000001 /* SceneDelegate.swift */,', project.indexOf('/* Begin PBXGroup section */'))) {
    project = replaceRequired(
      project,
      /(^\s*[A-F0-9]{24} \/\* AppDelegate\.swift \*\/,\n)/m,
      '$1\t\t\t\t5A7C91B32FA1000000000001 /* SceneDelegate.swift */,\n',
      'SceneDelegate PBXGroup insertion point',
    );
  }
  if (!project.includes('5A7C91B42FA1000000000001 /* SceneDelegate.swift in Sources */,', project.indexOf('/* Begin PBXSourcesBuildPhase section */'))) {
    project = replaceRequired(
      project,
      /(^\s*[A-F0-9]{24} \/\* AppDelegate\.swift in Sources \*\/,\n)/m,
      '$1\t\t\t\t5A7C91B42FA1000000000001 /* SceneDelegate.swift in Sources */,\n',
      'SceneDelegate PBXSourcesBuildPhase insertion point',
    );
  }
  writeFileSync(projectPath, project);
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
  if (!preserveRootFirebase) copyFileSync(firebaseConfigPath, iosFirebaseConfigPath);
};

ensureSceneLifecycle();
patchProject();
patchInfoPlist();
patchCapacitorConfig();
copyFirebaseConfig();

console.log(
  `Configured iOS ${variantName} app: ${variant.displayName} (${variant.appId})${
    variant.capgoChannel ? ` on Capgo ${variant.capgoChannel}` : ''
  }`,
);

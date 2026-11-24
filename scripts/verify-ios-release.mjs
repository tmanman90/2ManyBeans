#!/usr/bin/env node

// Checks an App Store build of 2manybeans before upload (1.1 release plan,
// "Archive checks"). Exits non-zero and lists every miss.
//
//   node scripts/verify-ios-release.mjs <App.app | .xcarchive | .ipa>
//
// Expected version, build and Bluetooth text come from the repo (project.pbxproj
// and ios/App/App/Info.plist), so this never needs editing for a new build.
// get-task-allow can only be checked on the exported .ipa: Xcode signs an
// archive with the Apple Development identity (get-task-allow true) and
// re-signs it for distribution on export.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const PROD_APP_ID = 'com.talmeltzer.coffeehub';
const WIDGET_APP_ID = `${PROD_APP_ID}.BrewActivity`;
const DISPLAY_NAME = '2manybeans';
// Dev-only tools and stale text that must never reach App Review (2.5.19, 5.1.1).
// The invite code text is not here: web and iOS share one bundle, so check that on a device.
const DEV_ONLY_MARKERS = ['fake-pearl-s', 'PEARLS-0F2A', 'Replay onboarding', 'dev_stub', 'allow Coffee Hub'];

function readPlist(path, input) {
  const args = ['-convert', 'json', '-o', '-', input === undefined ? path : '-'];
  return JSON.parse(execFileSync('plutil', args, { encoding: 'utf8', input }));
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function expectedRelease(repo = REPO) {
  const project = readFileSync(join(repo, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const builds = new Set([...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]));
  const versions = new Set([...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]));
  if (builds.size !== 1 || versions.size !== 1) {
    throw new Error(`project.pbxproj targets disagree: builds ${[...builds]}, versions ${[...versions]}`);
  }
  return {
    version: [...versions][0],
    build: [...builds][0],
    bluetooth: readPlist(join(repo, 'ios/App/App/Info.plist')).NSBluetoothAlwaysUsageDescription,
  };
}

// codesign prints entitlements to stdout and signing details (Authority=) to stderr.
function readSigning(app) {
  const entitlements = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', app], { encoding: 'utf8' });
  if (entitlements.status !== 0) throw new Error(entitlements.stderr.trim().split('\n')[0] || 'codesign failed');
  const details = spawnSync('codesign', ['-dvv', app], { encoding: 'utf8' });
  return {
    entitlements: entitlements.stdout.trim() ? readPlist(null, entitlements.stdout) : {},
    authority: details.stderr.match(/^Authority=(.+)$/m)?.[1] || '',
  };
}

/**
 * Returns { misses, notes }. `misses` fail the release; `notes` are checks that
 * do not apply to this input (and say where to run them instead).
 */
export function verifyIosRelease(appPath, expected = expectedRelease()) {
  const misses = [];
  const notes = [];
  const check = (ok, message) => { if (!ok) misses.push(message); };

  if (!existsSync(join(appPath, 'Info.plist'))) {
    return { misses: [`${appPath} has no Info.plist; pass App.app, the .xcarchive or the .ipa`], notes };
  }

  const info = readPlist(join(appPath, 'Info.plist'));
  check(info.CFBundleDisplayName === DISPLAY_NAME, `App display name is "${info.CFBundleDisplayName}", expected "${DISPLAY_NAME}"`);
  check(info.CFBundleIdentifier === PROD_APP_ID, `App bundle ID is ${info.CFBundleIdentifier}, expected ${PROD_APP_ID}`);
  check(info.CFBundleShortVersionString === expected.version, `App version is ${info.CFBundleShortVersionString}, expected ${expected.version}`);
  check(info.CFBundleVersion === expected.build, `App build is ${info.CFBundleVersion}, expected ${expected.build}`);
  check(info.NSSupportsLiveActivities === true, 'NSSupportsLiveActivities is not true');
  check(info.NSBluetoothAlwaysUsageDescription === expected.bluetooth, `Bluetooth text is "${info.NSBluetoothAlwaysUsageDescription}", expected "${expected.bluetooth}"`);
  check(info.UIBackgroundModes === undefined, `UIBackgroundModes is declared (${info.UIBackgroundModes}); 1.1 uses none`);

  const widgetPlist = join(appPath, 'PlugIns/BrewActivityWidget.appex/Info.plist');
  if (existsSync(widgetPlist)) {
    const widget = readPlist(widgetPlist);
    check(widget.CFBundleIdentifier === WIDGET_APP_ID, `Widget bundle ID is ${widget.CFBundleIdentifier}, expected ${WIDGET_APP_ID}`);
    check(widget.CFBundleShortVersionString === expected.version, `Widget version is ${widget.CFBundleShortVersionString}, expected ${expected.version}`);
    check(widget.CFBundleVersion === expected.build, `Widget build is ${widget.CFBundleVersion}, expected ${expected.build}`);
  } else {
    misses.push('PlugIns/BrewActivityWidget.appex is missing (Live Activity extension)');
  }

  const capacitorPath = join(appPath, 'capacitor.config.json');
  if (existsSync(capacitorPath)) {
    const capacitor = JSON.parse(readFileSync(capacitorPath, 'utf8'));
    const updater = capacitor.plugins?.CapacitorUpdater || {};
    check(capacitor.appId === PROD_APP_ID, `capacitor.config.json appId is ${capacitor.appId}, expected ${PROD_APP_ID}`);
    check(capacitor.appName === DISPLAY_NAME, `capacitor.config.json appName is "${capacitor.appName}", expected "${DISPLAY_NAME}"`);
    check(updater.autoUpdate === true, 'Capgo autoUpdate is not true');
    check(updater.defaultChannel === undefined, `Capgo defaultChannel is "${updater.defaultChannel}"; the App Store app uses the default channel`);
    check(capacitor.server?.url === undefined, `capacitor.config.json points the app at ${capacitor.server?.url} (simulator setting left in)`);
  } else {
    misses.push('capacitor.config.json is missing');
  }

  const firebasePath = join(appPath, 'GoogleService-Info.plist');
  if (existsSync(firebasePath)) {
    const firebase = readPlist(firebasePath);
    check(firebase.BUNDLE_ID === PROD_APP_ID, `GoogleService-Info.plist BUNDLE_ID is ${firebase.BUNDLE_ID}, expected ${PROD_APP_ID}`);
  } else {
    misses.push('GoogleService-Info.plist is missing');
  }

  const publicDir = join(appPath, 'public');
  if (existsSync(publicDir)) {
    for (const file of filesUnder(publicDir)) {
      if (!/\.(js|html|css|json)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const marker of DEV_ONLY_MARKERS) {
        if (text.includes(marker)) misses.push(`"${marker}" found in ${file.slice(appPath.length + 1)}`);
      }
    }
  } else {
    misses.push('public/ (the embedded web bundle) is missing');
  }

  let signing;
  try {
    signing = readSigning(appPath);
  } catch (error) {
    misses.push(`codesign could not read the app: ${error.message}`);
  }
  if (signing) {
    const { entitlements, authority } = signing;
    check(Array.isArray(entitlements['com.apple.developer.applesignin']), 'Sign in with Apple entitlement is missing');
    if (authority.startsWith('Apple Development')) {
      notes.push(`get-task-allow not checked: this app is signed "${authority}" (an archive); export re-signs it. Run this on the exported .ipa.`);
    } else {
      check(entitlements['get-task-allow'] !== true, 'get-task-allow is true (debug signing)');
    }
  }

  return { misses, notes };
}

function withApp(input, run) {
  if (input.endsWith('.xcarchive')) return run(join(input, 'Products/Applications/App.app'));
  if (!input.endsWith('.ipa')) return run(input);
  const dir = mkdtempSync(join(tmpdir(), 'verify-ios-release-'));
  try {
    execFileSync('ditto', ['-x', '-k', input, dir]);
    return run(join(dir, 'Payload/App.app'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/verify-ios-release.mjs <App.app | .xcarchive | .ipa>');
    process.exit(2);
  }
  const expected = expectedRelease();
  const { misses, notes } = withApp(input.replace(/\/$/, ''), (app) => verifyIosRelease(app, expected));
  console.log(`Expected: ${PROD_APP_ID} ${expected.version} (${expected.build})`);
  for (const note of notes) console.log(`NOTE ${note}`);
  for (const miss of misses) console.log(`MISS ${miss}`);
  console.log(misses.length === 0 ? 'Release checks passed.' : `${misses.length} release check(s) failed.`);
  process.exit(misses.length === 0 ? 0 : 1);
}

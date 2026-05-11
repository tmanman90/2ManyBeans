#!/usr/bin/env node
/**
 * Pre-sync patches for iOS App Store compliance:
 * 1. Removes Facebook SDK from @capgo/capacitor-social-login's Package.swift
 *    (the plugin bundles it as a hard SPM dep even when facebook: false)
 * 2. Ensures Info.plist has required entries for App Store submission
 *
 * Run automatically via the cap:sync npm script.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// --- 1. Patch Package.swift to remove Facebook SDK ---

const pkgPath = resolve('node_modules/@capgo/capacitor-social-login/Package.swift');

try {
  let content = readFileSync(pkgPath, 'utf8');
  const original = content;

  content = content.replace(
    /^.*\.package\(url:.*facebook-ios-sdk.*\),?\s*\n/gm,
    ''
  );
  content = content.replace(
    /^.*\.product\(name:\s*"Facebook(?:Core|Login)".*\),?\s*\n/gm,
    ''
  );
  content = content.replace(/,(\s*\n\s*\])/g, '$1');

  if (content === original) {
    console.log('[patch] Facebook SDK already removed from Package.swift.');
  } else {
    writeFileSync(pkgPath, content, 'utf8');
    console.log('[patch] Removed Facebook SDK from Package.swift.');
  }
} catch {
  console.log('[patch] Package.swift not found, skipping.');
}

// --- 2. Patch Info.plist for App Store compliance ---

const plistPath = resolve('ios/App/App/Info.plist');

if (existsSync(plistPath)) {
  let plist = readFileSync(plistPath, 'utf8');
  let changed = false;

  // Facebook suppression flags (defense-in-depth)
  if (!plist.includes('FacebookAutoLogAppEventsEnabled')) {
    plist = plist.replace(
      '<key>ITSAppUsesNonExemptEncryption</key>',
      '<key>FacebookAutoLogAppEventsEnabled</key>\n\t<false/>\n\t<key>FacebookAdvertiserIDCollectionEnabled</key>\n\t<false/>\n\t<key>ITSAppUsesNonExemptEncryption</key>'
    );
    changed = true;
  }

  // arm64 (replace armv7 if present)
  if (plist.includes('<string>armv7</string>')) {
    plist = plist.replace('<string>armv7</string>', '<string>arm64</string>');
    changed = true;
  }

  // Portrait-only for iPhone (remove landscape orientations)
  const iphoneOrientations = plist.match(
    /<key>UISupportedInterfaceOrientations<\/key>\s*\n\s*<array>([\s\S]*?)<\/array>/
  );
  if (iphoneOrientations && iphoneOrientations[1].includes('Landscape')) {
    plist = plist.replace(
      iphoneOrientations[0],
      '<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>'
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(plistPath, plist, 'utf8');
    console.log('[patch] Updated Info.plist (Facebook flags, arm64, portrait lock).');
  } else {
    console.log('[patch] Info.plist already up to date.');
  }
} else {
  console.log('[patch] ios/App/App/Info.plist not found, skipping (run cap add ios first).');
}

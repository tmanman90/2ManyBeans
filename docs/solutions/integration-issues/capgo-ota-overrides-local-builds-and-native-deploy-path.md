---
title: "Capgo OTA overrides local Xcode builds + Apple Sign-In requires TestFlight"
category: integration-issues
date: 2026-04-04
tags: [capgo, ota, capacitor, ios, testflight, apple-sign-in, xcode, deployment]
module: Deployment
symptom: "App shows old code on device despite fresh Xcode build and cap sync"
root_cause: "Capgo autoUpdate downloads production bundle on launch, replacing local build"
---

## Problem

After rebuilding the app with new sign-in screen (Apple + Google buttons), the iOS app kept showing the old sign-in screen (Google only). Verified:
- Source code was correct (both buttons in SignInScreen.jsx)
- `dist/` bundle contained "Sign in with Apple"
- `ios/App/App/public/` bundle contained "Sign in with Apple"
- Clean build folder, re-synced, still old UI

Additionally, when trying to deploy via Capgo OTA, the upload was rejected: "iOS native code changed" for `@capgo/capacitor-social-login`.

## Root Cause

**Local build override:** `capacitor.config.ts` has `CapacitorUpdater: { autoUpdate: true }`. On app launch, Capgo checks its CDN for the latest bundle and downloads it, replacing whatever was just built locally via Xcode. The local bundle never gets a chance to render.

**OTA rejection:** Adding Apple Sign-In requires a native Xcode capability ("Sign in with Apple" entitlement). Capgo can only deliver JS/CSS changes. Native code changes require a TestFlight build.

## Solution

**For local development:**
```ts
// capacitor.config.ts - disable during dev
CapacitorUpdater: {
  autoUpdate: false, // re-enable before production deploy
},
```

**For deploying native changes:**
1. Archive in Xcode (Product > Archive)
2. Distribute App > App Store Connect > Upload
3. Wait for processing in App Store Connect
4. Enable for TestFlight testing

## Prevention

- When local Xcode builds don't match expected behavior, **check Capgo autoUpdate first**
- Any change that touches native plugins, Xcode entitlements/capabilities, or Capacitor config changes requires TestFlight, not Capgo OTA
- Capgo OTA is only for JS/CSS/HTML bundle changes
- Consider adding a comment in capacitor.config.ts noting this rule

## Related

- (auto memory [claude]) Memory entry: "TestFlight only needed for native plugin or Capacitor config changes"
- (auto memory [claude]) Memory entry: "Always deploy iOS, not just Vercel"

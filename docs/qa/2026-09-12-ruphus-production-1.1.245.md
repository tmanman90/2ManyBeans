# Production 1.1.245 release: web complete, iOS OTA blocked

User authorized production shipping after scoped Aiden Dev-simulator acceptance.

- Release source: `0d0d3e28f5e3d5635a56c415decfedb6b81a2c2f`.
- Package and lockfile patch advanced from 1.1.244 to 1.1.245.
- Previous production web source `0df0fa54aad41a96f385765aedeb1bb328c8d3cc` is an ancestor of the release. No concurrent unrelated web source was overwritten.
- Production environment and Firebase identity were verified in-process without printing secrets. Existing owner-only Ruphus access/mutation gates were preserved; no environment or rules changes were made.

## Web: deployed

Production deployment `dpl_5Z2QUQhgECqz4BiURJH55SyPuSeW` was READY with exact release source metadata. Deployment URL: `https://2manybeans-nzopg4bvg-tmanman90s-projects.vercel.app`. Canonical `https://2manybeans.vercel.app` returned HTTP 200; its entry asset contained version 1.1.245 and production Firebase identity, with no Dev Firebase identity. Aiden UI is lazy-loaded, so its label is not expected in the entry asset itself. No authenticated production AI or recipe mutation was used as a release probe.

Previous deployment for rollback reference: `dpl_gnvGYWYYfAHekpUw81Gd7bqUnc3N`.

## iOS: not shipped

`npm run test:ship-production` passed. The managed-production-environment wrapper invoked the required `npm run ship:prod:ios`; it restored the published social-login native manifest and built the production assets. Capgo compatibility rejected upload before publishing. A second guarded attempt collected the precise mismatch, with the same outcome:

- All listed Capacitor/Capgo plugins compatible, including social-login 8.3.9 and updater 8.45.0.
- `@revenuecat/purchases-capacitor`: installed production baseline 12.3.2, candidate 13.2.0, iOS and Android native code changed.
- The source upgrade was intentional in `f234666` (`fix(ios): update RevenueCat for Xcode 27`). It was not silently reverted merely to pass OTA checks.
- Production channel readback remained **1.1.243** after both rejected uploads.

No compatibility bypass, native-baseline metadata rewrite, physical phone installation, TestFlight upload, or App Store submission occurred. A native production/TestFlight release is required to carry the newer SDK. Web completion does not imply the phone received the UI update.

Pre-existing dirty `ios/App/GoogleService-Info.plist` and diagnostic ledgers/report directories were not staged or changed. No additional paid AI evaluation was run for this release.

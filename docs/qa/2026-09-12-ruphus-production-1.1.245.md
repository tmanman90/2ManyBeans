# Production 1.1.245 release: web and compatible iOS OTA published

User authorized production shipping after scoped Aiden Dev-simulator acceptance.

- Release source: `0d0d3e28f5e3d5635a56c415decfedb6b81a2c2f`.
- Package and lockfile patch advanced from 1.1.244 to 1.1.245.
- Previous production web source `0df0fa54aad41a96f385765aedeb1bb328c8d3cc` is an ancestor of the release. No concurrent unrelated web source was overwritten.
- Production environment and Firebase identity were verified in-process without printing secrets. Existing owner-only Ruphus access/mutation gates were preserved; no environment or rules changes were made.

## Web: deployed

Production deployment `dpl_5Z2QUQhgECqz4BiURJH55SyPuSeW` was READY with exact release source metadata. Deployment URL: `https://2manybeans-nzopg4bvg-tmanman90s-projects.vercel.app`. Canonical `https://2manybeans.vercel.app` returned HTTP 200; its entry asset contained version 1.1.245 and production Firebase identity, with no Dev Firebase identity. Aiden UI is lazy-loaded, so its label is not expected in the entry asset itself. No authenticated production AI or recipe mutation was used as a release probe.

Previous deployment for rollback reference: `dpl_gnvGYWYYfAHekpUw81Gd7bqUnc3N`.

## Initial iOS attempt: blocked (subsequently resolved below)

`npm run test:ship-production` passed. The managed-production-environment wrapper invoked the required `npm run ship:prod:ios`; it restored the published social-login native manifest and built the production assets. Capgo compatibility rejected upload before publishing. A second guarded attempt collected the precise mismatch, with the same outcome:

- All listed Capacitor/Capgo plugins compatible, including social-login 8.3.9 and updater 8.45.0.
- `@revenuecat/purchases-capacitor`: installed production baseline 12.3.2, candidate 13.2.0, iOS and Android native code changed.
- The source upgrade was intentional in `f234666` (`fix(ios): update RevenueCat for Xcode 27`). It was not silently reverted merely to pass OTA checks.
- Production channel readback remained **1.1.243** after both rejected uploads.

No compatibility bypass, native-baseline metadata rewrite, physical phone installation, TestFlight upload, or App Store submission occurred. A native production/TestFlight release is required to carry the newer SDK. Web completion does not imply the phone received the UI update.

Pre-existing dirty `ios/App/GoogleService-Info.plist` and diagnostic ledgers/report directories were not staged or changed. No additional paid AI evaluation was run for this release.

## Compatible iOS OTA: published after owner approval

The owner approved retaining the installed production RevenueCat baseline for this OTA instead of requiring a native release. An isolated `codex/ruphus-production-ota` checkout was created from `911d1ff`; the Dev checkout and its RevenueCat 13.2.0 dependency were preserved.

- OTA source: `0071bbc0d677b0571619c0c2e8b44029e0de38e6`, package 1.1.245.
- RevenueCat installed package: 12.3.2, with its original lockfile dependency metadata. All SDK methods used by `src/lib/revenuecat.js` were present in that package's declarations; no live purchase was tested.
- No `api`, `src`, or `capacitor.config.ts` changes relative to deployed web source `0d0d3e28f5e3d5635a56c415decfedb6b81a2c2f`. Production web was verified READY and not redeployed.
- Managed production settings were loaded only in process. Built assets were checked for production Firebase identity, absence of Dev Firebase identity, existing owner-only enablement, version 1.1.245, and the full Aiden-profile UI label.
- Required `npm run ship:prod:ios` completed with its native compatibility guard intact. No bypass or baseline rewrite was used. The guard's channel verification and an additional readback confirmed `com.talmeltzer.coffeehub / production -> 1.1.245`.
- The initial 123-test matrix had one failure because a hard-coded recent-brew date aged beyond the 14-day window. The test clock was fixed without changing product behavior; the complete corrected matrix passed **123/123**. `git diff --check` passed.

This proves publication and channel selection, not download or activation on the owner's phone. No phone/simulator control, native installation, App Store submission, live purchase, paid AI evaluation, Firebase rules change, or coffee-data mutation occurred in this follow-up. Existing owner-only rollout remains unchanged. New native code would still require a native release; this OTA deliberately does not carry that SDK upgrade.

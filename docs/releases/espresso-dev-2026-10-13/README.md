# Espresso Dev deployment and phone installation

**Preview and Dev OTA published; 2manybeans Dev installed and launched on Tal’s phone.** [Receipt](receipt.json).

- Reviewed source: `8e8da05b56385a094202c5ee40b958b57b073866`, branch `codex/espresso-recipes`.
- Preview: https://2manybeans-erl86upph-tmanman90s-projects.vercel.app. Vercel reports READY. Root page returns200; unauthenticated chat and recipe-command POSTs return401. This is infrastructure smoke, not an authenticated hosted espresso conversation.
- Guarded `npm run ship:dev:ios` published `1.1.256-devapp.d20261013.t152026` to `com.talmeltzer.coffeehub.dev` / `dev`. Channel pointer readback matches.
- Package/app source version remains1.1.255. No production Vercel promotion or production Capgo upload occurred.
- Runtime configuration is scoped to the new preview and the same existing account pilot. No global allowlist, Firebase schema/rules, or customer recipe/tasting record was changed by this deployment.

## Native build

The isolated native copy was configured with the existing Dev Firebase resource, iOS27 scene lifecycle and updater channel. Its bundled index is byte-identical to the guarded OTA assets and includes the new preview API binding. Raw Xcode27 output confirms **BUILD SUCCEEDED** and a signed `2manybeans Dev` app. The build helper incorrectly treated `error:` text inside warning source snippets as failures, so raw Xcode success and the actual app artifact were checked independently before attempting installation.

Xcode27 initially crashed loading copied workspace metadata. Removing only task-owned copied UI metadata resolved it. Stable Xcode26.4.1 was unusable because its x86_64 simulator framework could not load the machine's arm64e CoreSimulator framework; no global toolchain repair was attempted. The isolated copy also needed the existing parent `ios/debug.xcconfig`.

RevenueCat5.67.1 hit the known Xcode27 synthesized-initializer conflict. The build backports the exact initializer-placement change visible in [RevenueCat5.78.0 source](https://raw.githubusercontent.com/RevenueCat/purchases-ios/5.78.0/Sources/Paywalls/PaywallColor.swift): move the existing private designated initializer from its extension into `PaywallColor`. Constructor body, public API, package version and primary dependency files remain unchanged. Before/after source hashes are in the receipt. This patch lives only in the task-owned native dependency checkout and must be reapplied if that checkout is recreated.

## Physical phone installation

The target phone is **Tal Meltzer, iOS27.0.1**, hardware UDID `00008160-0014609634400036`. The device tool’s `9A6C66CF-3E3E-5AF7-93C1-C45D77663506` identifier is its CoreDevice identifier, not its signing UDID. The initial generic build’s existing profile excluded this phone and installation failed. The user selected their existing App Store Connect API key; its saved developer-team binding and live access to the Dev bundle ID were verified before signing.

The hardware-targeted API-authenticated build succeeded with helper exit0. Apple refreshed the development profile for team `WC5UF2NSAP`, including the target phone, valid through2027-10-13. Final app signature verification passed; its bundle is `com.talmeltzer.coffeehub.dev`, display name `2manybeans Dev`, and its web index matches the published OTA exactly. The ignored native copy uses the existing primary Dev Google login resource for `manybeans-7893c`; tracked source configuration was preserved.

XcodeBuildMCP installed the app successfully (exit0) and launched it successfully (exit0, process22998) on the physical phone. Installation and launch logs are retained in the ignored QA runtime alongside the signed app and build evidence. Authenticated sign-in, hosted espresso chat and native tasting have not yet been exercised on-device; the earlier local QA does not establish those checks. Dev uses the existing Firebase project/account data.

All task-created build/test processes exited and the heavy-build lock was released. Temporary server credentials and signing metadata scratch were removed. The espresso worktree and signed installer remain available for the ongoing Dev testing workstream; no browser tabs were created during deployment.

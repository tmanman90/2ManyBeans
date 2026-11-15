# Redemption code production release

Version 1.1.250 adds one redemption per unique code, preserves legacy usage history, and extends active promotional access when the new code has the same tier. Paid subscriptions and active tier changes remain protected. The web settings form stays available to promotional subscribers.

Release commit: eb44ac0 on codex/redemption-production-release. Built from the verified production 1.1.249 source at 7420a27, preserving timer alerts and Ruphus features. The original shared checkout and its unrelated changes were not shipped.

Published and verified:

- Vercel production deployment dpl_GvYk1wFwj8n6MZGRHe5ULfurQLZp, https://2manybeans-maeiqo5n7-tmanman90s-projects.vercel.app, aliased to https://2manybeans.vercel.app.
- Live web returned HTTP 200; served entry bundle includes version 1.1.250 and the updated redemption copy. Unauthenticated POST /api/redeem-code returned HTTP 401.
- `npm run ship:prod:ios` passed checksum/native compatibility and verified `com.talmeltzer.coffeehub / production -> 1.1.250`.
- iOS bundle scan confirmed version 1.1.250, production Firebase manybeans-7893c, production backend, updated copy, and no Dev Firebase marker.
- Capgo checksum: 19070937630e5f88732e2d0f30ab1fe7fb0f11845a9607b11b8a3aab602f0d62. Bundle approximately 120 MB.

Validation: `npm run test:onboarding-redemption` passed the existing onboarding regression and all 23 new transaction-model tests; `npm run test:ship-production`, targeted ESLint, `git diff --check`, web builds, and iOS build passed. Existing build size/import warnings remain.

Live Firestore rules were inspected. They already deny client access to the new redemptions subcollection by default and deny the email ledger. The additive explicit deny in source was not separately deployed; existing live rules include other scoped changes and were preserved.

No customer redemption, code-cap change, or account grant was performed. Actual multi-code redemption against production and physical iPhone OTA installation remain unverified. Apple's offer-code screen remains separate from backend codes.

Rollback references: Capgo production 1.1.249; previous Vercel deployment dpl_8PFN8EdRV56wrBhzxR7utExRAaAv.

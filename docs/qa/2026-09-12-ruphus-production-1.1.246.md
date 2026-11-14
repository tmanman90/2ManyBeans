# Production 1.1.246 — recovery release

User explicitly authorized production deployment after disclosure that authenticated Dev-native acceptance was still blocked by Google sign-in. This is release proof, not a claim that the native acceptance gap disappeared.

- Release source: `86ee9bec8ad2e6e3fbf0f318c517d8bbd9041941`, branch `codex/ruphus-production-ota`.
- API and frontend source exactly match verified Dev implementation `e92f521` (empty `git diff e92f521 HEAD -- api src` before deployment).
- Carried recovery commits: `dc68e81`, `0af5d43`, `913e22c`, `c4a0b1f`.
- Focused production-checkout matrix: **179/179 passed**, including the production-shipping guard. Diff checks and production build passed.
- Native baseline is unchanged: RevenueCat 12.3.2, existing Capacitor/Capgo packages, no iOS or Capacitor configuration diff. No design changes.

## Web/backend

- Deployment `dpl_BWw2SsTGPZj24bSvx7S69QKedkRK` verified READY with exact release source metadata.
- URL: https://2manybeans-2xcwu55ku-tmanman90s-projects.vercel.app
- Canonical https://2manybeans.vercel.app and its module entry returned HTTP 200. Entry contains 1.1.246 and production Firebase identity; isolated Dev Firebase identity is absent.
- Previous production deployment: `dpl_5Z2QUQhgECqz4BiURJH55SyPuSeW`, source `0d0d3e28f5e3d5635a56c415decfedb6b81a2c2f`, confirmed ancestor of release. No unrelated newer deployment was overwritten.

## iOS OTA

- Executed the required managed-production-environment `npm run ship:prod:ios` workflow.
- Native compatibility guard passed; no bypass was used.
- Final readback verified `com.talmeltzer.coffeehub / production -> 1.1.246`, advanced from 1.1.245.
- No native app reinstall, App Store submission or physical-phone interaction. Publication does not establish that the owner's phone has downloaded/activated this OTA.

Existing production rollout/access gates were verified and preserved. No Firebase rules, membership, environment settings, coffee data or recipe mutations; no secrets printed. No additional paid model tests were run for this release. Other worktrees and diagnostic ledgers were untouched.

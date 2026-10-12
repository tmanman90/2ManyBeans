# Ruphus brew-evidence fix released — 1.1.255

Verified live at **2026-10-12 01:43 UTC**.

- Deployed source commit: **`15f927350a4aabe0d5041e393ea255c7d250f600`**.
- Local release branch: **`codex/ruphus-brew-evidence-release`**.
- Vercel deployment: **`dpl_CPK2owRM6ZN9zfSNvbVJoKmeyGrD`**, state **READY**.
- Production: https://2manybeans.vercel.app and https://2manybeans.superxmusic.com.
- Immutable deployment: https://2manybeans-d1h39q3gg-tmanman90s-projects.vercel.app.
- Prior production/rollback: **`dpl_drbTkvDGfxX1mnPtrwKFyHa7uMEf`**, commit `5ce7f2d3b53479e49259097b191e0b5d4eabd9c4`, version1.1.254.

Production had not advanced beyond the reviewed base. The approved runtime/test patch was byte-identical at release; only version metadata and supporting documentation were added. The original dirty migration checkout's status fingerprint remained unchanged.

## Verification

Both public domains returned HTTP200 and served `/assets/index-BgtI9rOK.js`, containing **1.1.255** and the expected production Firebase project. Vercel alias metadata identifies the exact deployed commit above. Empty unauthenticated POST requests to `/api/ruphus-agent` and `/api/ruphus-preview` each returned **401**, before any model or customer-data action. [Live verification](live-verification.json).

The documented [Vercel deployment file manifest API](https://vercel.com/docs/rest-api/deployments/list-deployment-files) was used to verify all **458 uploaded source files** against the clean committed staging tree. All hashes matched, including the six changed server modules and both version files. Review archives, local environments and unrelated worktrees were excluded from the deployment package. [Source verification](deployed-source-verification.json).

The **27 targeted regressions passed again against the exact application source whose hashes match the deployed files**, using committed tests and synthetic in-memory fixtures. This checks executed18g/279g baseline priority, measured versus planned time, source/clock/equipment provenance, one-control changes, bounded explanation-only recovery, conditional/negated advice and withholding of repeated unsupported claims. [Deployed-source behavior tests](deployed-source-behavior-tests.log). These are deterministic deployed-source tests, not an authenticated live customer conversation or a new model-quality benchmark.

Before deployment, **132 focused tests**, scoped ESLint and the production-configured web build passed. Independent code review passed after six findings were fixed; real-component mobile/desktop browser checks passed. Broader baseline failures, including two further static assertions reproduced on untouched production source, remain documented in [preflight](preflight.md). Code/test/version paths pass `git diff --check`; preserved raw logs and the archived patch contain original whitespace and were kept verbatim.

This is a **Vercel backend release**. Production web and iOS clients already use the same endpoint, so both receive the corrected server behavior. No frontend/native change required a Capgo OTA update; the installed iOS bundle/version was not changed. No historical data, account, credentials, permissions or unrelated code was changed. No new paid model call was made.

## Publication limitation

The approved fix is committed locally. Automatic approval review rejected the attempted GitHub push because it could not verify authorization to export the complete repository/review payload. A subsequent read confirmed `tmanman90/2ManyBeans` is **public**, with the authenticated user holding ADMIN permission. The push was not retried or bypassed; no branch or review archive was published there. Explicit approval to publish those artifacts publicly is still needed if a remote backup is desired. This did not block the approved deployment to the existing Vercel project.

This report and post-release evidence are recorded in a separate documentation commit after the deployed source commit; that documentation commit is not another deployment.

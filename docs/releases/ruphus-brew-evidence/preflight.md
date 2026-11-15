# Ruphus brew-evidence production release preflight

Tal authorized release of the independently reviewed candidate on 2026-10-12, relayed with verified approval by the parent task. Release branch: `codex/ruphus-brew-evidence-release`; version: **1.1.255**.

Production was inspected immediately before preparation: Vercel deployment `dpl_drbTkvDGfxX1mnPtrwKFyHa7uMEf`, commit `5ce7f2d3b53479e49259097b191e0b5d4eabd9c4`, branch `codex/timer-production-release`, version1.1.254. It is the exact reviewed base, so no rebase or conflict resolution was required. [Baseline metadata](production-before.json).

## Scope

The [reviewed runtime/test patch](../../reviews/ruphus-brew-evidence/ruphus-brew-evidence.patch) is byte-identical to the approved candidate. Its SHA-256 remains `42ecd4d782f7bf2e29cd3a0bd5f001f985423600a9ac9ca70c347505bff6350c`. Release-only additions are the package/package-lock version bump and release documentation. [Scope verification and source hashes](scope-verification.json).

Deploy to the existing Vercel production project `2manybeans` only. All functional changes are in server-side Ruphus modules. Production native clients already use `https://2manybeans.vercel.app` via `src/lib/apiBase.js`, so this fixes their next server request without a Capgo bundle. No native/frontend behavior changed; no OTA, native build or TestFlight release is required.

No historical data mutation, account/credential change, unrelated fix or new paid model evaluation is part of this release. The original dirty migration checkout is preserved.

## Checks

- 132 focused tests pass again. [Log](focused-tests.log).
- ESLint passes for all six changed server modules; `git diff --check` passes.
- Production-configured Vite build passes, with existing chunk-size/import/Browserslist warnings. Built assets contain version1.1.255 and the expected production Firebase project. [Build log](build.log).
- Both production and Dev iOS ship guard contract tests pass; neither shipping command was invoked.
- `npm test` passes Aiden (13 tests), recipe scaling, brew timing/lifecycle/session checks and the first14 recipe-engine scripts. Its browser harness initially lacked the hardcoded local Vite path; a local ignored symlink to the already-installed Vite dependency resolved startup. No package was installed or changed. [Initial log](package-tests.log).
- The unchanged iced UI fixture then timed out looking for its entry button. The fixture and all frontend source match the production base; the missing AuthContext baseline defect is documented in the [review](../../reviews/ruphus-brew-evidence/review.md). [Rerun log](recipe-engine-tests.log).
- All remaining22 recipe-engine scripts were run individually:20 pass; `v60-switch-runtime-contract` and `handbrew-v60-cutover-contract` fail static assertions. Both failures were reproduced in the untouched production-base worktree. [Remaining tests](remaining-recipe-tests.log), [baseline reproduction](baseline-rechecks.json), [detail](baseline-rechecks.log).
- Onboarding/redemption tests (23 transaction tests plus existing regression), trial-offer test and ship guards pass. [Redemption](redemption-tests.log), [trial offer](trial-offer-tests.log).
- The reviewed real-component browser flow already passes at390×844 and1024×844; evidence and screenshots are retained in the [review](../../reviews/ruphus-brew-evidence/review.md).

These baseline suite failures remain outside the approved patch. No test expectation was relaxed. The exact corrected behavior is covered by the passing focused regressions; the narrow sensory check is not a universal model-quality guarantee.

## Planned verification and rollback

Verify Vercel READY state, exact source commit and deployment aliases; live web version1.1.255; unauthenticated agent/preview requests still rejected before model/persistence work; and deployed source hashes match the tested fix. Do not create a customer tasting, brew, proposal, account or paid model request for verification.

Rollback target: deployment `dpl_drbTkvDGfxX1mnPtrwKFyHa7uMEf`, URL `https://2manybeans-hbj5gwfyc-tmanman90s-projects.vercel.app` (prior production1.1.254). Existing iOS OTA remains untouched.

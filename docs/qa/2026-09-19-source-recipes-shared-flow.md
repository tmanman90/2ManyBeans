# Source recipes: shared-flow implementation evidence

Date: 2026-09-19
Plan: `docs/plans/2026-09-19-001-fix-source-recipes-shared-flow-plan.md`
Scope: local implementation and verification; no deployment, native device, account mutation or paid provider run.

## Implemented

- U1 / R1–R2, R4–R5: trusted bean evidence feeds existing extraction-intent adjustments around a compatible technique baseline. Selected grinder conversion uses physical settings. Original source snapshots remain unchanged; adaptation metadata lives beside them. Dose/grinder previews and brew-once attempts retain the reviewed adaptation.
- U2 / R3–R5: named sources use HandBrewModal's ordinary recipe display, dose controls, grind preference display, and Start action. Source units, attribution, preparation and timing semantics remain visible. Unsupported conversion/regeneration controls are not offered.
- U3 / R1, R3, R5–R6: the ordinary BrewTimer shell handles elapsed sources and explicit event/condition confirmations. Pause/recovery, finish, valid timing records, tasting handoff and return use existing lifecycle paths. Invalid source projections cannot fall through to a generic timer.
- Saved source resizing uses slot-specific revision-guarded dose metadata, not a whole-recipe replacement. Reopening reconstructs the dose while retaining the technique and grind adaptation.

## Verification

The focused 11-file command passed 49/49 checks:

```sh
node --test scripts/ruphus-source-backend.test.mjs scripts/ruphus-source-journey.test.mjs scripts/ruphus-recipe-preview.test.mjs scripts/ruphus-preview-endpoint.test.mjs scripts/handbrew-source-dose.test.mjs scripts/ruphus-source-timer-ui.test.mjs scripts/ruphus-shared-brew-timer.test.mjs scripts/ruphus-source-timer.test.mjs scripts/brew-timer-lifecycle.test.mjs scripts/handbrew-timing-memory-integration.test.mjs scripts/brew-timer-recovery.test.mjs
```

Coverage includes real preview/action handlers with an in-memory database, source Save/Undo and stale revision handling, reviewed grind in brew-once attempts, source event validation and actual timer-hook recovery. These are not live Firestore or provider evidence.

All 14 currently timer-ready admitted source records have a shared-timer route: eight elapsed and six confirmation-driven. This does not claim all catalogue records are executable; the pre-existing non-ready record remains non-ready.

`node scripts/verify-ruphus-source-timer-ui.mjs` passes three isolated headless-browser journeys: Onyx 23g/368g with the test bean's valid Ode 4.2 setting, confirmation-driven Switch 50g/360mL, and ordinary Kalita 12g/192g. Each reaches real timing-record validation, a local save callback, tasting handoff and return to its fixture card. Onyx also resizes to 24g/384g with a dose-only persistence payload. The timer runs past 31 seconds before completion. External requests and non-GET requests are blocked; console/page errors are empty. This verifies components and callbacks, not live account writes or the entire chat application.

Root inspected the shared recipe, ordinary circular timer and completion screenshots. Screenshot paths: `/tmp/ruphus-source-recipe-shared.png`, `/tmp/ruphus-source-timer-onyx23-mobile.png`, `/tmp/ruphus-source-complete-shared.png`. The harness now isolates clocks per browser context, waits for the visible modal and running phase, and does not count invisible DOM content as a visual pass.

Changed production files pass ESLint. `git diff --check` passes. `npm run build` passes (2427 modules; existing dynamic-import, large-chunk and stale Browserslist warnings). No claim is made that the unrelated full-repository suite or lint is green.

## Bounded review and corrections

Sol peers reviewed the grind and shared-timer seams; root reviewed integration and persistence. Corrections included preserving personalized grind across server reconstruction, explicit source-dose wiring, avoiding whole-recipe overwrites, avoiding stale asynchronous state restoration, and validating actual timing records in the rendered fixture rather than returning a fake save success.

The review was scoped to this plan and reused the execution workers to conserve usage. No broad chatbot rearchitecture or paid consumer campaign was performed.

## Release boundary and validation

This document is local evidence, not a phone update or production acceptance. Native simulator/device appearance, live account persistence, OTA delivery and provider conversations were not tested in this execution. Existing diagnostic ledgers, release configuration and user data were left untouched.

For a separately authorized Dev release, verify one named Kalita and one Switch journey on the installed build: correct grinder, resize, start, pause/resume, finish/timing, tasting, return, save/reopen and undo. Watch existing errors for `source_projection_mismatch`, `unsupported_preview_configuration` and failed timing persistence. Any wrong source identity, saved-state overwrite or broken ordinary timer is a release stop/rollback trigger. Owner: release executor; window: before promotion and first Dev acceptance session. Do not promote this local evidence to production proof.

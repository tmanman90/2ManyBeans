# U4 writer evidence — guided tasting context

## Scope

U4/R6–R7, KTD4–KTD5: preserve the existing eight-step guided tasting while carrying an explicit cup context, support espresso straight/with-milk wording, and keep historical tasting records immutable and honest.

## Source changes

- Added `src/lib/brewContext.js` as the compact resolver/snapshot/formatter seam. Explicit recipe or cup context wins over current preferences; legacy records remain `unknown`.
- `TastingWizard` now captures context at start, writes it into in-session drafts and `cupContext` on new tasting records, and supports a method-only correction control plus espresso straight/with-milk choice. Espresso cues remove crust-breaking/four-minute instructions, use small-sip language, hide uncalibrated expected numeric markers, and keep AI reactions additive.
- Recipe/modal and timer entry points pass the espresso recipe/setup snapshot into the tasting handoff. The App bridge carries it across tab changes.
- `ruphusEvidence` now formats recorded tasting context and scalar reported measurements without `[object Object]`; linked espresso/milk context is explicit and milk sensory notes are marked as drink context. Legacy tastings retain the prior unlinked/unknown wording rather than inheriting today's preferences.
- The existing client chat context now carries the recorded cup-context line (including straight/with-milk and recipe targets) when present. Milk cups are excluded from the bean-score surface used by Professor Ruphus while remaining in tasting history.
- Espresso tasting launch resolution now recognizes `cupContext.method` and `espresso`.
- Recipe/timer handoffs clear an unrelated in-session tasting draft so reusing a recipe starts with empty observations; server-owned Ruphus tasting attempts remain resumable.
- Tasting snapshots preserve allowlisted grinder-setting, machine-default temperature-offset, and provenance URL/locator metadata. Unsaved modal edits are labeled `unsaved_target` and carry no saved revision ID; saved fingerprints retain the revision.
- Method correction drops incompatible espresso equipment, recipe, and revision context. Legacy drafts without context stay unknown rather than inheriting current preferences, and the App bridge captures pending launch context before consuming it.
- Chat recipe continuation uses a matching authenticated session receipt to read the live revision; a different external revision still takes the historical stale path. Focused tool coverage includes this same-chat follow-up.

## Verification

Pre-test characterization: the existing evidence formatter emitted `TASTING — … — not linked to a specific brew` for every tasting and interpolated object-valued temperature as `[object Object]`; the wizard's tasting copy always instructed crust-breaking/four-minute cupping and had no recipe/setup snapshot handoff.

Static checks completed:

```text
git diff --check                         PASS
node --check scripts/ruphus-u4-tasting-context.test.mjs  PASS
node --check api/_lib/ruphusEvidence.js  PASS
node scripts/ruphus-u4-tasting-context.test.mjs  PASS (5/5)
```

The additional focused assertions are source-checked and await the coordinated root test slot.

The first focused run exposed a test harness import dependency on the existing extensionless `flavorWheel` import; the U4 test was narrowed to its relevant existing record shape rather than changing application imports. The next serial run passed 5/5. Root owns endpoint/browser verification and final acceptance; no live/model calls were made by this writer.

## Remaining review points

- Root should run the focused U4 context test, existing evidence regression, scoped lint, and the browser tasting flow. Verify the existing V60 harness remains unchanged and that recipe edits after a saved tasting do not alter its `cupContext`.
- The server authoritative `api/ruphus-tasting.js` path already preserves attempt snapshots; direct wizard saves use the existing client tasting write and now include the immutable snapshot field.

Final bounded source corrections:

- `src/tabs/TastingTab.jsx` gates direct espresso recipe handoff on both the active brew method and the confirmed current espresso setup key. Non-espresso direct entry passes no espresso preferences or recipe, so a V60 tasting cannot inherit machine/basket/grinder data from an espresso bean.
- `src/components/EspressoModal.jsx` fingerprints the displayed recipe against the bean's saved recipe, shows a Save-before-discussing note for unsaved targets, and disables Discuss in chat until Save. Rotation and Inventory callbacks include the current recipe in their dependencies and retain a defensive unsaved guard; no synthetic starter instruction is sent to chat.
- `scripts/ruphus-u4-tasting-context.test.mjs` adds a focused behavioral assertion that the non-espresso direct context has no espresso equipment or recipe snapshot.
- Static verification only after this correction: `git diff --check`, `node --check api/_lib/ruphusTools.js`, and `node --check api/ruphus-agent.js` passed. The focused test was not run; root owns the coordinated test/browser slot.

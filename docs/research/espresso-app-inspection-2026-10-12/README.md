# Espresso competitor inspection — Android and REA

Inspected October 12, 2026. Scope: inform the existing espresso plan without adding a shot journal, timer or hardware integrations. No Coffee App production code changed. The existing prototype still needs a revision before implementation approval.

**Expanded investigation:** [Beanconqueror logic deep dive](BEANCONQUEROR-LOGIC-DEEP-DIVE.md) covers beans, methodology sources, pour-over, recipe/default selection, tasting feedback, inventory, AI import and connected-machine automation. It adds version-pinned source traces, 17 passing isolated source-method probes and a live empty-V60 flow. The initial inspection below is not a claim that all app logic was extracted.

## Outcome

**Beanconqueror 8.7.0 was installed, exercised in the Android emulator, pulled back from the emulator, signature-checked, and inspected with REA plus focused reading of its shipped JavaScript. Filtru could not be acquired from its official Android listing.** Its current espresso functionality remains supported by official product descriptions, not package inspection or hands-on evidence in this report.

The useful adaptation is a saved recipe for each bean/setup, editable directly or through Ruphus, with independent grinder selection and existing guided tasting. Reusing a recipe must not fabricate a new tasting, observed shot time, rating or measurement.

## What was actually observed

| Finding | Evidence | Implication for our plan |
| --- | --- | --- |
| A generic Espresso Machine and a separately named custom grinder work together. Grinder setup asks for a name and optional timer/speed capabilities. | [Machine setup](bean-machine-name.png), [grinder setup](bean-grinder-add.png), [saved shot](bean-saved-shot.png). | Separate machine, grinder and basket. A custom grinder name does not require a large catalog; numeric guidance needs independent support. |
| Brew entry has Before brewing, While brewing and After brewing sections. Inputs include dose, grinder/setting and method; a stopwatch and additional timing fields appear during brewing; yield, rating and notes follow. | [Shot form](bean-shot-form.png), [result fields](bean-shot-result-fields.xml). No connected scale was used. | Borrow clear parameter labels. Keep time as optional conversational information in our initial scope; do not reproduce the whole form. |
| Entering 18 g dose and 36 g beverage yield updates the ratio to 1 / 2.00. | [Live ratio result](bean-ratio-result.png), [saved shot](bean-saved-shot.png). | Espresso yield is beverage output. Ratio recalculates immediately and validates together with dose/yield. |
| Repeat opens a new brew prefilled with the same bean, machine, grinder, grind 5, dose 18 and yield 36. The repeated draft was cancelled; only one synthetic brew was saved. | [Actions](bean-shot-actions.png), [repeat prefill](bean-repeat-prefill.xml). | Reopen the user's saved recipe with settings intact. We do not need a new brew record to accomplish recipe reuse. |
| The brew menu exposes Edit, Rating and Cupping. Tasting has Aroma and Systematic Cupping tabs, a radar chart and scored sensory categories. | [Cupping](bean-cupping.png), [systematic cupping](bean-systematic-cupping.png). Tasting was inspected and cancelled, not scored/saved. | Our existing saved guided tasting already fills this product role. Adapt its cues/context; a second cupping system would duplicate it. |

The observations used invented local fixtures named Research-Espresso and Research-external-grinder. They are not Rob's coffee, grinder or measured shots. No coffee was physically brewed, no machine/scale connected, and no extraction quality was tested.

## Implementation findings from the shipped artifact

The Android app packages an Ionic/Capacitor web application under `assets/public`. The application behavior relevant here is in JavaScript, so inspecting Java classes alone would miss it.

Focused file: `assets/public/chunk-7CHZHEVJ.js`, SHA-256 `7764b3ec0996c4f5065a580d9d35cabd8c81a5c6c982ba121a7c644ea5348c40`. This file and English UI strings are byte-identical between the official universal APK and the installed Play base APK; see [bundle parity](bundle-parity.json).

- `getBrewRatio()` chooses `brew_beverage_quantity` for espresso, and `brew_quantity` otherwise, then divides by `grind_weight`. [Retained excerpt and character offset](recipe-repeat-logic.json).
- `repeatBrew(e)` passes the existing brew as `brew_template` into the Add brew modal. The live Repeat flow confirmed prefill. [Helper excerpt](focused-logic.json).
- The internal-share-code last-brew path filters out archived bean, grinder and preparation references before selecting the latest eligible brew. This path was inspected statically, not exercised via NFC/share code. [Excerpt](recipe-repeat-logic.json).
- `toggleBestBrew()` clears other best-brew flags for that bean when marking one brew best. This is static evidence only; the default tested menu did not expose this action. [Excerpt](bundle-excerpts.json).
- `fastRepeatBrew()` calls `copyBrewToRepeat`, saves the result and can invoke consumption tracking. The copy helper carries time, rating and notes as well as settings; it clears the flow profile and avoids copying archived equipment IDs. This optional fast-repeat path was not enabled/executed. [Copy helper](copy-repeat-excerpt.txt). Our recipe reuse should carry targets only and leave new sensory results empty.
- Preparation data includes a separate style category, selected equipment, configurable visible parameters and repeat settings. This supports a small fixed field set for our UI rather than copying an advanced configuration system. [Excerpt](recipe-repeat-logic.json).

These findings describe this shipped build. Minified/decompiled representations are derived evidence; they do not establish correctness of every path. No competitor implementation code or assets were copied into Coffee App production code.

## REA execution and provenance

Used yesterday's [morluto/rea](https://github.com/morluto/rea) checkout/build, recorded source revision `097f0d54afceb3ce61dbaa24dd6736658d1fce06`, package 6.4.0, local stdio MCP. Android engine: jadx-headless-mcp 0.7.1 with audited JAR digest `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`. Full JDK reused from the existing research Android Studio installation.

Executed:

1. `inspect_android_package` against the official developer APK: package `com.beanconqueror.app`, version 8.7.0 / 80700, min SDK 26, target SDK 36. [REA result](rea/bean-package.json).
2. `analyze_javascript_application` against the focused extracted 2,179,573-byte JS chunk. Parsed one file with no parse failures; 613,671 AST nodes visited. **Semantic graph hit the 100,000-node ceiling and is partial.** This is not a complete reconstructed app/call graph. Focused code excerpts and observed UI are the evidence for the product conclusions. [REA result](rea/bean-js-graph.json).
3. `inspect_android_package` against the base APK pulled from the emulator. [REA result](rea/bean-installed-package.json).

Acquisition sequence: existing API 35 ARM64 Play-enabled emulator initially stalled during Play installation; restarted with software rendering and no GUI. Downloaded and installed the developer's official [8.7.0 GitHub release](https://github.com/graphefruit/Beanconqueror/releases/tag/v8.7.0). The queued Play install subsequently completed; the final installed package reports `installer=com.android.vending` and consists of base plus ARM64, English and xxhdpi splits. Pulled all four installed paths and checked signatures for all APKs. Do not describe the final installed set as the universal sideload alone.

- [Official release metadata](release.json), [download digest receipt](download-receipt.json): downloaded digest matches GitHub's published SHA-256.
- [Installed package acquisition](installed-acquisition.json): versions, installer, per-file hashes and capture time.
- [Signature verification](signatures.txt): all five artifacts verified; REA itself does not verify signatures.
- APKs remain in ignored `packages/` for reproducibility. Extraction scratch is under ignored `work/`; important excerpts, receipts and screenshots are retained here.

## Filtru acquisition boundary

Filtru's official [2019 Android announcement](https://getfiltru.com/words/filtru-for-android/) links to package `com.przemyslawbobak.filtrucoffee`. That exact [Play listing](https://play.google.com/store/apps/details?id=com.przemyslawbobak.filtrucoffee) returned HTTP 404 through web retrieval. Opening the same listing in the authenticated Android emulator returned **Item not found**: [screenshot](filtru-play-availability.png), [UI hierarchy](filtru-play-availability.xml).

The current [espresso tracker page](https://getfiltru.com/espresso-shot-tracker/) advertises iPhone/iPad availability, shot measurements, comparisons and optional connected scales. The old Android announcement describes a pour-over-focused release, not current espresso parity. No unofficial archived APK was substituted and no Filtru binary was inspected. A current legitimately obtainable Filtru installation/package on a supported platform is still needed for comparable hands-on or binary analysis. This is an acquisition limitation, not a conclusion about Filtru's code.

## Plan decisions

Keep: saved adjustable espresso recipe; direct edits and Ruphus updates with visible saved changes and Undo; independent machine/grinder/basket; immediate ratio consistency; saved guided tasting with immutable recipe/equipment context.

Do not add: a separate shot journal, best-shot ranking, analytics dashboard, scale connection, pressure profiling, or a configurable before/while/after form. New tastings start with empty observations even when the recipe is reused. Keep known recipe targets and user-reported measurements distinct.

Next mockup revision should demonstrate an external grinder, a requested recipe change in chat, success/failure/Undo, reopening the saved recipe, and a past tasting retaining the recipe used. These requirements are in the [updated plan](../../plans/2026-10-12-0920-feat-barista-express-espresso-plan.md). The current prototype does not yet demonstrate them.

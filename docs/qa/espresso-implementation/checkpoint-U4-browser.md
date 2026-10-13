# U4 full App/browser checkpoint

All runs use real main.jsx/App, synthetic local Auth/Firestore and actual configured model for chat, isolated Chrome at320/390/1280. The scan/enrichment response is an explicit fixture boundary; optional tastingCoach calls get503 to exercise non-gating failure. No native iOS/production proof.

## Retained runs

- Browser01 / app-browser-1791855441934: FAIL before mount, duplicate espressoRecipeFingerprint import. Writer removed it.
- Browser02 /1791855579866: real RotationSave39 + mobile/desktop + actual modelSave41 + View41 + nativeUndo39 all PASS. Fixture profile omitted username:null required by unchanged existing rules, so Settings write failed. Fixture corrected; no rule change.
- Browser03 /1791855657727: passed above and reached saved straight tasting after8steps/draftresume/currentrecipe42/grinderswitch. Test wrongly expected grinder5, while actual target was unreported; corrected oracle to require unknown, no invented dial.
- Browser04 /1791855744253: straight tasting checks PASS including all6 UI scores, notes, immutable40g target, original integrated setup, unknown dial, machine-default temperature and absent revision for unsaved target. Checkboxcheck failed on async controlled update despite persistedtrue; harness now clicks and waits canonical preferences.
- Browser05 /1791855819258: added milk cup save PASS, original straight cup byte-identical, new observations blank; Inventory save38 and Settings independent grinder/directcontext checks PASS. Harness was still on Tasting after SettingsDone, so could not find V60recipe; corrected explicit Rotation navigation.
- Browser06 /1791855895427: core/straight/milk/Inventory PASS but later CTA was Resume draft, not Startguided.
- Browser07 /1791856026616: explicitly awaited Saveoverlay detach then clean Startguided. Milk persisted but Resume draft remained. Confirmed production draft resurrection, not merely early DB polling.

## Corrections pending final browser proof

TastingWizard suppresses draft autosave while savePending ref is set. Parent returns true only on success and false on failure, allowing retry while preserving answers. Successful save also clears wizardLaunchContext so another direct cup cannot reuse an older launch after preferences change. Failed saves retain context. Root must rerun full App; archive/scan/V60 checks remain unexecuted at this checkpoint.

Source review findings for direct setup/method contamination and unsaved Discuss were closed in review-final-source.md; last save/draft lifecycle fix was after that bounded review. Root short focused tools and7-case U4 context suite passed atCPU57.12/58.45; changed-file ESLint passed46files atCPU59.17 (`scoped-lint-1791856329.json`). Whole lint previously reported4 unrelated errors in unchanged paywall files plus the new sanitizer error; sanitizer fixed. Exact base-file hashes in preexisting-lint-source.json prove unrelated files unchanged; do not call whole lint green.

No whole-feature acceptance; final36+7 live matrix and remaining regressions/browser gates pending. Shared heavy slot intermittently held by Mailroom; never removed another owner's lock.

## Subsequent root checks

- Browser08 /1791856383926: source-stable; first9groups passed, including successful-save draft cleanup, direct entry after changed setup, and V60 timer preservation. Archive espresso profile passed its content assertion; harness then clicked a hidden Flip-to-front control. Corrected to visible BACK TO CARD.
- Browser09 /1791856535786: source-stable;10groups passed through Archive. Scan file selector matched both background and modal inputs; scope corrected to Quick Recipe portal. Post-scan save label also corrected to actual Save recipe.
- Independent review found a real pending-save failure/exit hole: answers could be edited while autosave was suppressed. Writer added visible Saving state, disabled header/footer, inert content, guarded exit and restored interaction on failure. Root added a clearly labeled actual-component delayed-save failure/retry fixture; full App persistence remains a separate check.
- Before the final live matrix, historical fixture timing was aligned to the evidence schema's elapsedSeconds field. Earlier pilot receipts retain their original fixture and are not silently rewritten.

## Full browser PASS

`emulator-app-browser-10-manifest.json`, CPU64.67%, sourceStable:true, exit0; `app-browser-1791857291165-receipt.json` records12passing groups. Includes all prior core paths, Archive, actual post-scan recipe attachment to the newly created bean, and delayed-save failure/restore/resume/retry. Root visually inspected the final390px recipe and chat Undo receipt; earlier desktop inspection confirmed the same layout. Mobile widths320/390 and desktop1280 fit checks passed. Actual configured provider returned the chat tool calls; synthetic scan/enrichment and the final component save-failure seam are explicitly identified. No native/device or real coffee-quality proof.

Pending-save review finding closed in review-final-source.md. No remaining actionable source finding at this checkpoint. Final36+7 conversation results and focused/regression checks are still required; this browser result alone does not complete U3 or the goal.

## Final integrated rerun

`emulator-app-browser-11-manifest.json` is source-stable, exit0, CPU62.73%; `app-browser-1791868247111-receipt.json` passes all12 groups after the final chat/retry corrections. Root inspected the390px and1280px screenshots;320px/390px/1280px fit assertions passed. Actual provider chat Save41, canonical View and guarded Undo39 pass alongside both eight-step tasting flows, immutable history, pending-save failure/retry, independent external grinder, Inventory, archive, scan-attachment and unchanged V60 routing. Fixture and native-proof limits above remain. All36 conversation variants and10 perturbations now have independent semantic acceptance; final regression exceptions are recorded separately.

# U3 real conversation pilots — incomplete acceptance

Authoritative checkout: isolated `codex/espresso-recipes`, HEAD `aafebff` plus uncommitted U3 changes. No publication or production persistence.

## Observed outcomes

- `live-E04-clear-1791853413836-receipt.json`, `live-espresso-01-manifest.json`: actual authenticated endpoint, six calls served by gpt-5.6-luna, real local Auth/Firestore. First advice turn preserved state; explicit save changed output36→39 exactly once. Independent reviewer found semantic PASS for these two turns. Duplicate delivery was not exercised. Source stable during run; CPU idle53.89%.
- `live-E07-casual-1791853450589-receipt.json`, manifest02: save39 succeeded; natural Undo restored36, but a subsequent model preview request failed and the endpoint falsely reported unchanged/interrupted. Acceptance FAIL despite correct mutation.
- `live-E07-casual-1791854034784-receipt.json`, manifest03: deterministic post-commit confirmation fixed the first problem. A different model read path then exposed stale launch context: read_recipe returned original36 while current saved output was39, so natural Undo was not attempted and the turn was blocked. Acceptance FAIL. CPU idle67.48%; source stable.

All failures are retained. They are distinct product failures, not a substituted scripted model. No case is counted as final-candidate acceptance yet.

## Corrections and local evidence

- Receipt status contract now admits existing command-service `succeeded`; focused root candidate2 passed.
- Native Espresso receipt Undo carries narrow `espresso_direct_undo`; successful Undo settles original receipt as undone.
- Tool authority rejects negation and unresolved alternatives even if a model guesses a numeric field; polite saves and natural put-back wording supported.
- Persisted receipt recovery normalizes setup identity and compares executable recipe fingerprints; first-save commands carry an explicit absence hash; historical/absent source mismatch refuses.
- Orchestrator completes from successful canonical espresso mutation receipt, preserving truthful committed outcome through later response failures.
- Ordinary espresso reads now use current owner revision; save source checks retain historical launch protection. Writer added focused launch-shadow characterization and reports script PASS at CPU idle68.98%. Actual E07 rerun on this last correction remains pending. Normal repeated refinements from retained launch context were flagged for writer verification.

Focused failing logs `root-U3-candidate-1.log`, `-3.log`, `-4.log` are retained; writer-U3.md records diagnosis and later focused passes. Scoped root ESLint `root-U3-lint-01.log` had zero errors and one ignored-script warning. This predates the latest corrections and is not final lint proof.

## Next gate

Same primary writer is implementing U4 in the existing flow before the next unified source freeze. Root prepared `emulator-app-browser.mjs` for real App Rotation/Inventory/post-scan routing and `browser-tasting-checks.mjs` for the eight sensory steps; both syntax checks passed, neither has been executed yet. Add the final cup-context assertions after U4 handback.

Then run the complete fixed36 conversation matrix plus mutation perturbations against final source, independent semantic review, rendered chat actions/tasting, regression/lint. No model-generated answer or endpoint200 alone establishes success. U1–U4 remain unaccepted as whole units.

## Fourth live pilot and U4 focused checks

`live-E07-casual-1791855035193-receipt.json` / `live-espresso-04-manifest.json`: source stable, CPU idle62.99%. Actual Save39 passes and the next recipe read correctly returns39. Natural Undo still FAILS: the model says no authoritative receipt/earlier targets are available, never invokes Undo, and response grading blocks its reply. State remains39; no unauthorized write. The actual developer context includes method binding but no prior espresso receipt summary. Same writer is correcting this context seam; stale/revision safeguards must remain.

Root focused checks at this snapshot: espresso tools PASS (CPU68.9), U4 context6/6 PASS (CPU62.59), full App browser harness syntax PASS (CPU48.5). Receipts `root-U34-focused-1791855019.json` and per-command logs. These do not establish full browser or model acceptance.

Final source review is in progress. Direct tasting after a grinder change was found to pick the old saved espresso setup; writer is correcting matching current setup and method-specific context. Full App harness now drives straight and milk tastings, draft resume, optional AI503, notes/scores, newer recipe/grinder changes and immutable prior cup. It has not yet run.

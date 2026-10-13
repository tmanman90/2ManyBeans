# Final regression exceptions

All 44 commands in the required recipe-engine, recipe-scaling, brew-timing-memory and added Aiden-modal packages were executed: **41 passed; three failed identically on the untouched starting source `58d1643`**. See [aggregate](final-regression.json), [baseline executions](baseline-1791868022-receipt.json) and [unchanged source hashes](baseline-regression-source.json). This is not an all-green repository claim.

| Existing check | Current and baseline result |
| --- | --- |
| `verify-kalita-iced-ui.mjs` | Times out after 30 seconds waiting for the first “Iced pour over this coffee” control at line 37. The fixture's deeper flow was not verified. |
| `v60-switch-runtime-contract.test.mjs` | Source assertion at line 158 expects the old `timerReady && icedUnsupported` expression. Its timer/scaling matrix passed first. |
| `handbrew-v60-cutover-contract.test.mjs` | Source assertion expects the old `onDismiss={onClose}` expression in BrewTimer. |

The two source-assertion tests, iced fixture/test, HandBrewModal and BrewTimer are byte-identical to the starting commit. The baseline rerun used a task-owned Git archive of that commit and the same installed dependencies and Chrome adapter, with fresh CPU admission for each command. It did not modify the primary checkout or install dependencies. The matching timeout establishes reproduction, not a newly diagnosed root cause; the older separate Ruphus iced fixture's AuthContext diagnosis is not substituted for this fixture.

The initial Aiden-modal invocation could not find bundled Chromium. Rerunning the unchanged tests with installed Chrome passed, including retained-sheet foreground dismissal, physical generated grind validation, and saved-profile viewing/actions. The original environment failure remains in the receipt history.

To reproduce the baseline evidence, extract `git archive 58d1643 src scripts public package.json package-lock.json vite.config.js index.html` into `.runtime/baseline-check`, link its `node_modules` to the existing workspace dependencies, and run `python3 docs/qa/espresso-implementation/verify-baseline.py`. The task-owned extracted source is disposable; the receipts and starting commit are retained.

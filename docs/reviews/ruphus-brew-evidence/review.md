> Subsequent release: this reviewed fix was authorized and deployed as1.1.255. See the [production release record](../../releases/ruphus-brew-evidence/release.md). The review below records the earlier review-stage state.

# Ruphus completed-brew evidence: reviewed release candidate

Date: 2026-10-12. Independent review passed after two repair rounds. No remaining concrete blocker was found in this scoped patch. This is a reviewed working diff, not a deployed or committed release.

## Exact checkout and scope

- Worktree: `/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/.worktrees/ruphus-brew-evidence`
- Branch: **detached HEAD**, no named branch.
- Base: `5ce7f2d3b53479e49259097b191e0b5d4eabd9c4`, previously verified production app **1.1.254**, branch `codex/timer-production-release`.
- The original dirty `migration/mac-studio-2026-08-22` checkout was preserved.
- No commit, deployment, migration, historical data write, account change, installation, or new paid model call was made during this review.

The fix treats a completed attempt's executed snapshot as the recipe tasted, while retaining the saved recipe and an untried review as distinct baselines. In the sanitized FRUKT reproduction, the executed cup is **18 g / 279 g, 1:15.5, 93°C, Ode 6.2**. Its measured elapsed time is **203,813 ms (about 3:24)**; its five-minute target is not a measurement. A finer test changes only the grind to **6**, preserving the executed dose, water, temperature and pours. The source-lock dose of 24 g and untried 24 g / 348 g proposal cannot silently replace that baseline.

The fixture reconstructs recipe pours with the current generator; it is not a byte-for-byte reproduction of the historical recipe instructions. It uses synthetic identities. Historical records are projected at read time, never rewritten.

## Independent findings and dispositions

The independent reviewer `/root/independent_review` examined the scoped diff, reproduced failures, and re-reviewed the fixes without editing files or invoking paid services.

| Finding | Fix and evidence |
| --- | --- |
| P1: explanation repair could replace an 18/279 grind test with a 24/348 ratio test | Bind every non-explanation proposal argument before dispatch. Permit equivalent nullable/numeric representations; reject changed baseline, coffee, brewer, control, dose or candidate and extra reads. Two calls, zero stored/published cards on drift. |
| P2: legitimate negation and independent conditional advice triggered unnecessary correction | Match direct sensory-to-extraction claims instead of sentence-wide word combinations. Reviewer examples now complete in one provider call. |
| P2: elapsed time ignored conflicting coffee, brewer and lineage | Reuse the timer's existing validation/matching contract against the executed snapshot; additionally match attempt, session, revision when present, and exact dose. Validate events individually so duplicate elapsed conflicts remain unknown. Source ID/revision, configuration and clock mismatch regressions pass. |
| P2: four newer brews for other equipment hid the completed baseline | Keep projected history ephemeral and server-only. Filter by selected brewer/equipment before the four-record result bound. Omitted baseline remains rejected when the relevant completed cup exists. |
| P1: a blocked-response fallback could echo an unsupported diagnosis | Apply the sensory check to recovery text as well as ordinary prose and proposal explanations. The repeated blocked claim emits a visible terminal interruption without publishing that claim. |
| P2: explicitly rejected or quoted diagnoses were false positives | Recognize rejection immediately around each matched claim. An unrelated rejection does not exempt a separate categorical assertion. |

Final reviewer verdict: **“Independent review passes for the scoped release candidate. No remaining concrete blocker found.”** It verified all six findings and independently ran **27/27 affected regressions**. Full review-round record: [independent review](independent-review.md).

## Validation

- **132/132 focused tests pass**, covering evidence, recipe continuity, grinder steps, proposal recovery, provider contracts, context/runtime, transactions, source backend/completion and timer memory/persistence. [Full log](evidence/focused-tests.log)
- **27/27 immediate review regressions pass.** [Log](evidence/review-regressions.log)
- `git diff --check` and the counterfactual runner syntax check pass. The persisted code/test patch is also checked for clean application to the recorded base.
- Final local browser fixture passes in installed **Chrome 154.0.8037.99**, at **390×844** and **1024×844**. The actual backend tools generate the proposal; production RecipeProposalCard and HandBrewModal render it. View recipe shows 18 g / 279 g, 1:15.5, 93°C and Ode 6; local Start callback fires once. No page errors, console warnings or horizontal overflow. External requests are blocked and no authenticated persistence or real brew start is invoked. [Result](evidence/result.json), [reproducible harness](evidence/browser-harness.mjs), [mobile](evidence/preview-390.png), [desktop](evidence/preview-1024.png).
- Final browser origin was `http://127.0.0.1:59188`; that fixture server has stopped.

Run the focused suite from the worktree with Node 22 using the command saved in [validation commands](validation-commands.txt). Browser QA uses the already-installed `playwright`/`esbuild` dependencies and Chrome; it does not install anything.

## Existing baseline limitations and release decision

Earlier broader validation produced eight non-browser failures that were reproduced on untouched production code: attempt-dismissal wiring; four eval-corpus assertions; the frozen eval-report grind expectation; shared-timer legacy restoration; and the technique-runtime ratio expectation. They remain unchanged. [Baseline log](evidence/ruphus-baseline-failures.log)

The existing browser suite, rerun with installed Chrome, was **9 passed / 1 failed**. The iced-preview fixture failure was reproduced on the untouched base and diagnosed as a missing AuthContext provider (`useAuthContext must be used within AuthContext`), not a missing browser. [Suite log](evidence/ruphus-installed-chrome.log), [baseline rerun](evidence/ruphus-baseline-iced-chrome.log), [diagnosis](evidence/ruphus-iced-baseline-diagnosis.json). Those baseline fixtures and unrelated production paths were not repaired in this task.

The sensory guard is intentionally narrow. It catches the observed unsupported sharpness inference and specified categorical patterns, not every possible mistaken or hedged piece of brewing advice. The historical counterfactual reports under `docs/evaluations/` predate the final guard and review repairs. They record 24 earlier provider calls; no new paid calls were made here. This review is not an independent live-model quality benchmark. Native iOS and authenticated end-to-end persistence were not exercised.

**Remaining decision:** whether to authorize promotion/release of this reviewed diff after accepting the documented baseline failures and model-quality limits. No deployment is authorized or performed by this handoff.

## Deliverables

- [Code, fixture and test patch](ruphus-brew-evidence.patch): all runtime/test changes and the opt-in counterfactual runner, relative to the exact base above. Supporting reports/images remain separate files in this worktree.
- [Changed-file manifest](changed-files.txt): exact tracked modifications and new files, including review/evaluation artifacts.
- [Patch checksum and application check](patch-verification.txt).

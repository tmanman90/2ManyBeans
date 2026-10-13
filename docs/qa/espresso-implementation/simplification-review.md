# Bounded simplification review

Root applied the three ce-simplify-code rubrics sequentially under the repository's task mapping. Scope: espresso additions relative to58d1643 and the current U3/U4 changes. This is a behavior-preserving review, separate from the replay bug fixes and independent correctness review.

- Reuse: equipment choice constants, recipe edits/validation/fingerprints, command transactions, existing chat receipts, and the eight-step tasting flow already share the relevant existing paths. No additional abstraction warranted.
- Quality: the compact brewContext module separates immutable cup evidence from mutable recipe authority. The savePending ref protects the immediate event boundary while saveInFlight renders disabled/inert controls; removing either changes behavior. No simplification applied.
- Efficiency: new operation/receipt maps are request/session scoped; no new poller, shot log, or equipment catalog was introduced. Repeated canonical reads and validation protect different trust boundaries and are retained.

Applied: reuse0, quality0, efficiency0. Skipped3 low-value changes: merging historical setup normalization with command identity (different unknown/null/sanitization semantics); collapsing save/retry hook branches (frozen request and stale-response ordering differ); combining Settings/onboarding field layouts (shared constants already avoid domain duplication while persistence/interaction differ).

No production edits were made by this pass. Correctness fixes remain writer-owned. Final focused, regression and lint receipts are recorded separately; no typecheck script is configured. Whole lint has the documented unchanged paywall errors, so this report does not claim an all-green repository.

Final retry delta: root retained a single server-owned companion in the existing chatSessions collection and the existing command/action journal. Exact retry metadata is distinct from a new explicit operation; no general retry framework or global cancellation subscription was introduced. Timestamp ordering, current identity/revision checks and canonical readback serve distinct failure cases and remain covered by focused and actual-endpoint evidence. No further behavior-preserving simplification was warranted. Root owns the final metadata/tie correction; the primary writer's earlier ownership statement above is historical.

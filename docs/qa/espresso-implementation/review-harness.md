# Live harness correction after E12.clear85

The first persistence-failure scenario did not inject its fault: the harness intercepted transaction.set, while the actual recipe command writes new revisions with transaction.create. Run85 is retained as failed and is not product failure evidence. Its visible Save correctly corresponded to persisted state.

The harness now intercepts both real transaction methods and still throws immediately before the revision write. All underlying reads and successful commits use the real local Firestore emulator. Original fixed oracle assertions remain unchanged. New receipts label the injection layer accurately.

Earlier full before/after state for every user turn remains valid. Earlier mutationAttempts arrays did not capture create-based revision attempts, so they do not satisfy that separate per-attempt gate. Rerun E04, E06 and E07 standard write variants and all10 mutation perturbations on the corrected harness, plus E12. Retain all earlier receipts and their source manifests.

The corrected harness additionally asserts that each successful mutation has exactly one committed per-attempt snapshot matching the final turn state, and each injected failed attempt matches the unchanged pre-turn state. E11 explicit jar2/V60 turns now assert the first actual provider request has the correct trusted coffee and method bindings, closing the visible-text-only gap found in84. These strengthen the original oracle; they do not loosen acceptance.

After the natural failed-save retry change, E12 also records the owner-scoped companion retry authority and requires the successful receipt actionId to equal the failed operation. A fresh but superficially identical save no longer passes the retry identity gate. Canonical recipe/action/receipt/tasting snapshots remain separate from this server-owned retry metadata.

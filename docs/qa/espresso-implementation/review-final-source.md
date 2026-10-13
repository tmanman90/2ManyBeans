# Final U1–U4 bounded source review

Disposition: **REVISE** for the two concrete integration defects below. Reviewed production changes from 58d1643 through HEAD aafebff80b269c27849122266bf0cdf5e0e72c35 plus the tracked working diff and new brewContext.js. No tests, model calls, builds or browser actions were run by this reviewer. Writer/root work was preserved; only this report was written. Root allowed two U4 copy/number-format corrections during review and then resumed a U3 receipt-context correction after the latest E07 pilot failed. This report does not certify those in-flight U3 changes.

## Findings

1. **P1 — Direct Tasting entry freezes the wrong setup/recipe after a grinder switch.** `src/tabs/TastingTab.jsx:239`; `src/lib/brewContext.js:54–59`. Save an integrated-grinder recipeA, switch the profile to external grinderB, then enter Tasting directly for that bean. directBrewContext unconditionally supplies the bean's last espressoRecipeA; resolveBrewContext prefers recipe.setup over the current preferences, and copies A's targets. The wizard captures that context once (:50–57) and persists it on the new cup (:184). The method-only correction cannot change the equipment, so the new tasting records A as used despite B being the current setup. A related regression occurs when preference method is V60 and the bean also has an Espresso recipe: its Espresso machine/basket/grinder can be recorded as V60 equipment. **Smallest fix:** direct entry must select a matching current method/setup recipe (using the existing setup resolver/map), or omit the recipe when none is established; choose method-specific current equipment rather than unconditionally accepting the last Espresso projection. Keep explicit recipe-entry snapshots authoritative. Confidence 100 from the ordinary switch/direct-entry state trace. No rendered run performed.

2. **P2 — Discuss in chat discards the recipe visibly edited in the modal.** `src/tabs/RotationTab.jsx:87–97`; `src/tabs/InventoryTab.jsx:112–122`. Open saved36g output, edit the displayed target to39 without saving, then Discuss in chat. The callback only passes the bean's old saved revision; it never passes or otherwise resolves the displayed espressoRecipe. The authoritative chat read correctly loads36, so refinement proceeds from different targets than the recipe Rob opened. Tasting handoff already distinguishes an unsaved_target snapshot; chat handoff has no corresponding disclosure/context. **Smallest fix:** carry the displayed target as explicit read-only context with saved-vs-unsaved status while retaining the saved revision as mutation authority, or make the save requirement explicit and prevent the ambiguous handoff until the displayed recipe is saved. Do not silently treat unsaved values as persisted authority. Confidence 100 for the local-edit/callback/read path.

## Original U3 finding disposition

| Finding | Final reviewed source |
|---|---|
| Natural espresso token rejected | Closed: removed from hard machine-token list. |
| Reader selection metadata invalidates valid Espresso | Closed: bare snapshot validation precedes selection metadata handling; command field allowlist stays strict. |
| Undo selects newest unrelated edit | Closed for reported stale case: recovered server-session receipt binds bean/setup/revision; live mismatch refuses. Native receipt Undo now carries espresso_direct_undo and the ordinary Pro route keeps owner/revision checks. |
| Lost-response retry | Partial source closure: same-context frozen operations and explicit absence hash added; a later matching committed session receipt can return a replay without mutation. Receipt persistence/unknown-outcome and duplicate Undo boundaries still need actual fixed-oracle execution. The operation map itself is not durable, and Undo checks live revision before its in-memory replay; do not infer full response-loss proof from the same-tools-object mock. |
| Negation/ambiguity and ordinary wording | Reported fixtures addressed in source: negation, either/or clarification guard, polite affirmative saves and put-back wording. Semantic behavior remains live-matrix proof. No claim of universal natural-language authority correctness. |
| Historical snapshot paired with fresh revision | Closed for reported present/absent mismatch: historical selected revision compares against live absence too; a matching authenticated chat receipt permits continuing from its current revision, while external newer edits retain stale refusal. |

Root's latest E07 manifest04 still failed with a live read39 but no model Undo attempt because the model lacked authoritative receipt/earlier-target context. State was safely unchanged, but the experience is not accepted. Root assigned that receipt-context correction to the writer during this review; recheck/rerun the affected case before closure. Prior E07 post-commit/interruption failures remain historical evidence, not erased by source fixes. E04 clear retains its narrow two-turn semantic PASS; duplicate replay was absent in that receipt.

## Source coverage and proof limits

The shared recipe command path continues to bind authenticated owner, actual profile setup, bean identity and exact validated target fields. Direct saves and native Espresso Undo retain ordinary Pro authorization without enabling unrelated Agent mutation access. Setup-specific targets are retained and Undo restores the edited setup's previous entry. Client close/reopen and setup-switch guards retain mutation identity; retries preserve full pending direct-edit requests. No new source path was found that rewrites prior tasting records during recipe editing.

Recipe-to-tasting handoff clones targets/equipment, clears unrelated observations, labels unsaved targets honestly and omits a saved revision for them. Wizard drafts capture cup context once, preserve unknown legacy context, keep the existing eight sensory steps/scores/notes, and optional reactions remain non-gating. New milk records are excluded from bean-only summaries. The direct-entry defect above prevents general R7 acceptance despite those source improvements.

Production chat remains the existing account-scoped Agent-v3 pilot (featureFlags.js); modal Discuss is visible only when that existing gate is enabled. Ordinary Pro direct recipe/Undo parity is source-established; broad production availability of conversational saving outside the existing pilot is not established by synthetic allowlisted/dev runs. Root owns release/acceptance scope.

Root owns final focused/regression/lint, real endpoint, complete fixed36 conversation matrix and mutation perturbations, rendered View/Undo, real App Rotation/Inventory/scan routes, eight-step tasting with optional-AI failure, immutable persisted cup context, and V60/Aiden regression checks. This reviewer ran none of those checks. CPU-deferred or mocked checks are not live/browser PASS. No whole-feature acceptance is claimed.


## Bounded correction recheck and E07 casual pilot

Disposition: **REVISE for the residual non-Espresso context initialization below**. No tests/model calls/browser actions were run by this reviewer. Root full-App browser results remain pending.

- Finding1 grinder-switch case is addressed at TastingTab:241–251: the default method must be Espresso and the confirmed current setup key must match before the last Espresso recipe is supplied; mismatched setup falls back to current equipment without old targets. Explicit recipe-entry context remains authoritative.
- Finding1's non-Espresso variant remains downstream: **P2**, `TastingWizard.jsx:687`. TastingTab correctly builds explicit { method: v60_hot } with null preferences/recipe, but normalizeDraft then calls resolveBrewContext again with the real preferences and bean.espressoRecipe. With no explicit equipment field, brewContext.js:56 falls back to that Espresso recipe.setup. Open direct V60 tasting on a bean containing an Espresso recipe: the wizard still freezes and saves Espresso machine/basket/grinder as V60 context. Smallest fix: snapshot an explicit launchContext directly without refilling absent fields from bean/preferences, or gate fallback recipe/equipment by the effective method. Confidence100 from the complete caller→initializer→resolver→save trace. This is the original finding's residual, not a broader review.
- Finding2 is closed from source: EspressoModal:28–29 compares full executable fingerprints; :80,85 exposes the Save-first note and disables unsaved Discuss. RotationTab:91–100 and InventoryTab:117–125 defensively reject unsaved handoffs; the callback dependencies include the displayed recipe. No silent saved/unsaved target substitution remains on that enabled action path. Rendered validation is root-owned.
- The U3 read_recipe reversibleAction is supplied only for a recovered successful receipt matching exact bean/setup, live revision and executable fingerprint (ruphusTools.js:1199–1213). It supplies the model with a usable Undo action without broadening mutation authority; stale checks remain in the command path.

**E07 casual semantic PASS for the reviewed two turns**, `live-E07-casual-1791855358389-receipt.json`, associated manifest05 reported source-stable. Four provider calls served gpt-5.6-luna. “save it as39 out keep18 in” produces one new guarded revision36→39 and a canonical succeeded receipt; visible confirmation correctly reports18/39, grind5 and default-temperature offset0. “nah put it back how it was” reads the current recipe with reversibleAction, calls Undo, restores36 in one new revision, and confirms the prior recipe. Neither turn invents measured results or claims a shot was brewed. Jar2 and entire prior tasting records remain identical across both transitions. There is no post-commit false-unchanged/interruption in this receipt.

This closes the earlier E07 pilot's ordinary conversational Undo/confirmation failure for this variant only. The receipt has no replay execution or intervening direct-edit perturbation, so it does not establish the remaining E07 stale/duplicate assertions. Earlier failed pilots remain preserved. Full matrix, rendered controls and whole-feature acceptance remain root-owned and unclaimed here.


## Residual P2 closure

**Closed from source.** `TastingWizard.jsx:688–699` now snapshots an explicit launch context directly, so absent V60 equipment remains absent rather than being filled from the bean's Espresso projection. Without explicit context, only the Espresso default method can supply Espresso preferences, and a recipe is included only for the confirmed matching setup. Existing draft context/unknown legacy handling remains intact. No remaining actionable source finding from the two reported final integration defects.

This tiny recheck read source only and ran no tests/browser actions. Root reports current-source browser checks for chat Save/View/native Undo, straight/milk eight-step saves, draft resume, immutable cup context, Inventory and Settings; the full browser run and remaining live/perturbation acceptance are still root-owned. No whole-feature acceptance is claimed.


## Save-pending lifecycle delta review

Disposition: **REVISE for one bounded P2**. Reviewed only the new savePending draft guard and parent success/failure contract. No tests/model calls/browser actions were run.

**P2 — Pending Save suppresses draft edits while edit/exit remains available.** `TastingWizard.jsx:84,197–213,595–603`. Complete the tasting and press Save; while its request is pending, press Back, edit a note/score, then Close → leave keeping the draft. savePending.current is true, so the changed answers/phase do not reach onDraftChange; navigation and exit remain enabled. If the persistence request fails, the wizard has already unmounted, and resetting the ref does not flush the edited draft. Resume therefore restores the pre-save draft, losing the edits made during the pending request. Smallest fix: visibly prevent editing/navigation/exit while Save is pending, or explicitly retain the latest draft on pending exit/failure while preventing successful-save resurrection. Confidence100 for the pending-request event sequence; no fault injection performed by this reviewer.

The normal success path clears draft/attempt/launch context only after awaited persistence and returns true, leaving the guard set through unmount. The normal failure path preserves those fields, returns false and resets the guard so a later Save click can retry. Repeat Save clicks while pending are rejected by the ref. Those source traces address successful-save resurrection and ordinary retry; they do not close the edited-draft exit sequence above. Root reports browser08/09 verified clean fresh tasting after straight/milk saves, immutable resumed cup and direct-entry setup correction. Those reports do not demonstrate pending-save edits followed by failed persistence and exit.


## Save-pending P2 closure

**Closed from source.** `TastingWizard.jsx:187–200,203–221` sets both the immediate ref guard and visible saving state, blocks Close/Leave, and restores interaction after false/rejected persistence. Content is inert and pointer-disabled (:243); header/footer controls disable navigation and editing access (:296,603–616), with Saving… feedback. Success keeps draft-autosave suppression through parent unmount. The reported pending Save → edit → exit → failure sequence is no longer reachable through these controls. No new finding in this bounded correction.

Reviewer ran no tests/model calls/browser actions. Root prepared an explicit delayed503 callback-transport test against the actual component; it must be described as that injected callback boundary, not a Firestore outage. Final live-matrix/QA acceptance remains root-owned.

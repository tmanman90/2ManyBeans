# Canonical recipe handoff repair

## Observed failure

The owner's saved production Kalita 155 recipe existed and passed executable
validation. `read_coffee_evidence` retained it internally but exposed only brewer
configuration and summary to the model. The summary expected dose/water/grind
aliases rather than the canonical coffeeGrams/waterGrams/grindSize fields.
Meanwhile the separate recipe tool discouraged a diagnosis-time read. The model
therefore reported an unavailable schedule even though the server had read it.

## Change

The composite tool now exposes `selectedRecipe` through the existing recipe-field
allowlist, for the resolved method only. Canonical amounts, physical grind setting,
temperature, and full steps reach the provider; raw documents, source authority,
and the complete recipe remain excluded from the bounded replay ledger. The exact
recipe reader is explicitly available when that selected recipe is absent.

A repeated live check also exposed conflicting premature-proposal recovery advice:
the recovery demanded a concrete suggestion despite an unresolved watery symptom.
That instruction now preserves the existing sensory-clarification policy.

## Evidence

- New canonical handoff regression failed before the fix (13 g was undefined).
- Focused runtime/evidence/technique/endpoint/action/grind/recipe-first suite:
  **114 passed, 0 failed**. Source and test ESLint, diff check passed.
- Action integration uses the composite evidence result, persists a review in the
  in-memory repository, Applies 5.6 to 5.2, and Undoes back to the canonical recipe.
- Browser recipe-first harness passed mobile/desktop, dose scaling, review-before-
  timer, large text and reduced motion; no cloud writes. This is browser evidence,
  not a new native-device acceptance claim.
- Build passed with existing dynamic-import, chunk-size and Browserslist warnings.
- Real provider plus actual owner-scoped production Firestore readers: the exact
  three-message exchange was replayed three times, with proposals stored only in
  memory. All runs produced Kalita review artifacts on the muted and update turns.
  The second run exposed the premature-advice issue above; the final run after its
  correction asked the sensory question first, then produced the review card.
- Final run: 7 provider calls; 5.6 to 5.2, 13 g coffee, 215 g water, exact temperature
  and all three original pours preserved. Apply/Brew once/Keep action identifiers
  present. The live run did not execute those actions against cloud data.
- Saved production recipe was reread and deep-compared unchanged after each run.
- Total paid verification this repair: $0.018437. Cumulative ledger: $48.205927 of
  $55, zero reserved, $6.794073 remaining.

## Limits

This closes the demonstrated recipe-data handoff defect; it is not a claim that
every possible conversation succeeds. No authentication bypass, account change,
Firebase rule change, saved production recipe mutation, or native reinstall was
performed. Production deployment is recorded separately after Vercel readiness.

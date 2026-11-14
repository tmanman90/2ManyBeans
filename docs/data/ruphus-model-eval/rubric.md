# Ruphus U4 rubric

## Gate-first order

1. Reject incomplete, unmeterable, invalid, unauthorized, stale, unsafe, or
   fabricated evidence. Any critical failure vetoes an arm.
2. Require hard-gated methods to pass exact recall and committed-recipe
   validity at 100%. Advisory-only methods are reported separately and never
   enter that denominator.
3. Apply the absolute blinded quality floor: diagnosis accuracy, controlled
   proposal usefulness, uncertainty/clarity, concision, and willingness to
   approve must all be present. A preference vote cannot buy back a veto.
4. Apply ordinal pairwise preference, then cold-cache cost per successful task,
   latency, and variance. No weighted aggregate can override a gate.

Lifecycle is a separate U7 gate: 24 attempts, at least 23 valid first-attempt
outcomes (23/24 passes; 22 fails), 100% recall/validity, and zero critical
failures. Physical trials never improve an incomplete semantic score.

The shipping-prompt baseline is offline context only, ranking-ineligible, and
does not satisfy any hard gate. Zero eligible arms after complete semantic
evidence is `no-pass`; missing evidence, unlocked review, unresolved cutoff,
or incomplete physical evidence is `insufficient evidence`/revise.

## Fixed qualitative dimensions

Reviewers score each blinded comparison on 1–5 for diagnosis, proposal
usefulness, uncertainty, clarity, concision, and willingness to approve, plus
an explicit `unknown`/abstain. Scores are locked before unblinding. The
absolute floor, pairwise ordering, tie handling, and invalidation rules are
frozen in the manifest and cannot be tuned from qualification output.

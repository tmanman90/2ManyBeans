# Ruphus U4 corpus manifest

This is a synthetic, offline, preregistered corpus. Ground truth is authored
from Coffee's production validators and the U3 staging contract; model output
never creates or edits expected answers. No PII, provider metadata, model
names, credentials, timestamps, or model-authored truth is present.

`decision/cases.json` contains 60 unique cases: 12 each for exact
recall/provenance, taste diagnosis and controlled proposals, method/grinder
constraints, authority/revision/security, and failures/receipts. The six
required methods are represented, as are advisory-only legacy methods and both
hot and iced modes. Every case declares an expected terminal state, critical
failures, and deterministic assertions.
Each case is executable: it carries a user prompt, immutable synthetic evidence
and expected identity/provenance, typed recipe/diff/grind/fault/ledger outcomes,
and a named deterministic grader. `scripts/ruphus-eval/cases.mjs` is the offline
runner and rejects metadata-only or nondeterministic cases. Calibration payloads
are phase-tagged and disjoint from decision payloads.

`calibration/cases.json` is a six-case provisional set, one per hard-gated
method. It may be run at most twice per arm. Calibration can change only the
prompt translation, schemas, harness, or operational limits; after accepted
calibration the entire contract, rubric, schedule, retry policy, and winner
ordering are sealed atomically before any qualification output.

The paid schedule samples sealed, disjoint partitions: all six arms receive
20 common qualification cases × 2 repeats; at most two finalists receive 24
decision cases × 2 repeats. Proposal/diagnosis cases stop at read, diagnose,
propose, clarify, refuse, or unauthorized detection. They do not approve,
commit, undo, call Fellow, or claim a physical result; U7 owns the full
lifecycle. Qualification uses fair interleaving and the full 25% global retry
pool. Retry exhaustion, missing/unmeterable arms, invalid batches, an
unresolved finalist cutoff, or incomplete blind/physical evidence is
`insufficient evidence`, never a reduced-field winner.

The sealed qualification partition is the 20 IDs listed under
`manifest.partitions.qualification`; it covers all five categories, all six
hard-gated methods, both hot/iced modes, every initial action, and four evidence
strata. The sealed finalist partition is the disjoint 24 IDs under
`manifest.partitions.finalistDecision` with the same coverage checks. No case
outside those arrays may enter its phase.

Evidence levels remain distinct: synthetic/adjudicated fixtures establish
source/test proof; deterministic grader output establishes semantic evidence;
provider telemetry (if later authorized) remains separately attributable;
blinded human review is valid only while locked; physical observations are
bounded corroboration. A sensory negative requires a blinded confirmatory
rebrew; structural/safety failures are vetoes.

The manifest's aggregate `evaluationHash` is computed over the complete
manifest contract with its own aggregate field omitted, plus component hashes
for the corpus, prompt contract, model/pricing registry, U2 validators and
timer dependencies, U3 tools/contracts/schemas/staging store, all graders,
blind renderer and protocols, rubric, partitions, schedule, retry policy, and
winner ordering. Relative source references resolve from this isolated
repository root, never from a neighboring checkout.

# Blinded review protocol

All exports are generated offline as escaped plain text. They contain opaque
comparison labels, randomized left/right assignment, and candidate outputs
only. They contain no provider/model names, arm IDs, pricing, telemetry,
style hints, links, images, HTML, embeds, remote fonts, or unblinding map.
The unblinding map is stored separately and is unreadable by the renderer
until scores are locked.

The initial qualification packet and finalist packet use the same case
strata, balanced across methods, modes, actions, evidence conditions, and
failure types. Pair order and case order are deterministic from a frozen seed
but opaque to the reviewer. A duplicate hidden repeat is retained to detect
inconsistent scoring. An unlocked packet, fixed left/right order, missing
comparison, or reviewer metadata leak is insufficient evidence.

Scores are locked before unblinding. The score-lock artifact covers every
opaque label exactly once; unblinding requires that lock and cannot be
performed from a rendered output alone. Hidden repeat labels remain opaque and
are checked for consistency before the lock is accepted.

Tal records the fixed 1–5 dimensions and may choose unknown/abstain. Unknown
does not count toward a quality floor or preference. A cutoff tie advances
only if it yields at most two finalists; a tie involving more than two is
`insufficient evidence`, with no post-hoc tie breaker.

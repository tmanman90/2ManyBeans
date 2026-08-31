# Conversation reset decision

## Backend conversation checkpoint

**Status: FAIL — live U3 smoke ran but did not pass.**

The deterministic U3 runner, Dev-only fixture seeding safeguards, stage rules,
cost hard stop, and blind judge schema are implemented and covered by local
tests. The isolated Firebase project `twomanybeans-ruphus-dev`, fake fixture
owner, and Vercel Preview endpoint are available and passed their fail-closed
preflight. The owner-authorized live-testing ceiling remains $30 total across
every stage.

Current live-provider spend is **$0.842265**. The final smoke attempt against
code commit `32b766c` completed AE01 through AE03, then AE04 ended with
`tool_round_limit` after two `resolve_coffee` calls, no focus change, and no
completed reply. A deterministic probe confirms that `this coffee` currently
returns `not_found` while the verified launch ref resolves exactly; this is the
narrow remaining loop signature, not a Product PASS. Because no clean smoke
exists for the current commit, calibration, judge, pairwise, targeted, and full
stages correctly remain unrun.

The agreed third-remediation-round fuse has been reached. No fourth
implementation iteration was started in this run.

The U3 label, when earned, is exactly **Backend conversation checkpoint PASS**.
It is not Product PASS. Product acceptance additionally requires the later
rendered harness, simulator/device evidence, and owner-conversation evidence.

## Evidence ledger

| Category | Result | Commit |
| --- | --- | --- |
| Source and deterministic tests | PASS locally after final remediation: U3 suite 36/36; focused endpoint/provider/reference/repository/runtime set 45/45; scoped ESLint and web build passed | `32b766c` |
| Injected runner | Prior deterministic plumbing proof passed; it is never a live gate | Earlier evidence |
| Live provider and Dev Firestore | FAIL: isolated Dev preflight and fixture reads worked, but the final smoke stopped at AE04 with `tool_round_limit`; cumulative spend $0.842265 / $30 | `32b766c` code, `a4492f1` spend ledger |
| U3 backend checkpoint | FAIL because there are not two clean same-commit smokes and no calibrated/full gate | `32b766c` |
| U4 implementation | Source and local harness implemented; acceptance waits on U3 and the post-surface live targeted-plus-smoke checkpoint | `f234666` |
| Rendered harness | PASS mobile and desktop for launch entries, context-free opening, hydration, frames/artifact, legacy route, keyboard padding, and zero writes | `f234666` |
| Native compile | PASS with Xcode 27 on iPhone 17 Pro Simulator after the minimal RevenueCat Xcode-27 compatibility update | `f234666` |
| Simulator scripted conversation pass | `insufficient_evidence`: the Dev app compiled and launched, but no authenticated fixture conversation was scripted or visually accepted | Not run |
| Physical Dev-device scripted pass | `insufficient_evidence` | Not run |
| Owner unscripted conversations | `insufficient_evidence`: required five conversations across three surfaces, including tasting, remain owner-run | Not run |
| Preview deployment | READY on isolated project `twomanybeans-ruphus-dev`: `https://twomanybeans-ruphus-q8oetd1hl-tmanman90s-projects.vercel.app` | `32b766c` |
| Production | Untouched and unclaimed | Out of scope |

The native Dev preflight now rejects missing/blank Firebase values and a
missing, malformed, non-HTTPS, credential-bearing, or production-host Ruphus
preview URL before Vite. Preview-aware Agent, recipe-command,
tasting-provenance, and Aiden-preparation routes preserve deployment-protection
query parameters. These are deterministic isolation proofs, not deployment or
installed-app evidence.

No production data, Firebase rules, production Vercel, or production Capgo was
changed. Live provider calls were restricted to the isolated Dev fixture and
the cumulative cost ledger. Product PASS remains false.

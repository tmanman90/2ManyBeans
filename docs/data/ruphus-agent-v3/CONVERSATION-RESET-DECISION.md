# Conversation reset decision

## Backend conversation checkpoint

**Status: FAIL — live U3 gate not run.**

The deterministic U3 runner, Dev-only fixture seeding safeguards, stage rules,
cost hard stop, and blind judge schema are implemented and covered by local
tests. The owner-authorized live-testing ceiling is $30 total across every
stage. The live checkpoint remains open until a separate Dev Firebase target
and Dev endpoint/authentication preflight are authorized and available.

Current live-provider spend is **$0**. No smoke, calibration, judge, pairwise,
targeted, or full dispatch has occurred.

The U3 label, when earned, is exactly **Backend conversation checkpoint PASS**.
It is not Product PASS. Product acceptance additionally requires the later
rendered harness, simulator/device evidence, and owner-conversation evidence.

## Evidence ledger

| Category | Result | Commit |
| --- | --- | --- |
| Source and deterministic tests | PASS locally: combined Ruphus/U6 matrix 118/118; U3 runner/judge/seeder suite 33/33; scoped ESLint and web build passed | `f234666` |
| Injected runner | PASS 14/14 with zero classified failures; plumbing proof only, never a live gate | `f234666` |
| Live provider and Dev Firestore | `insufficient_evidence`: not run; $30 cumulative cap authorized, spend $0, separate Dev target/auth unavailable | Not run |
| U3 backend checkpoint | FAIL because the required live stages are unrun | Not run |
| U4 implementation | Source and local harness implemented; acceptance waits on U3 and the post-surface live targeted-plus-smoke checkpoint | `f234666` |
| Rendered harness | PASS mobile and desktop for launch entries, context-free opening, hydration, frames/artifact, legacy route, keyboard padding, and zero writes | `f234666` |
| Native compile | PASS with Xcode 27 on iPhone 17 Pro Simulator after the minimal RevenueCat Xcode-27 compatibility update | `f234666` |
| Simulator scripted conversation pass | `insufficient_evidence`: no isolated Dev Firebase account/backend is available, so an installed-app click-through would not be the required environment | Not run |
| Physical Dev-device scripted pass | `insufficient_evidence` | Not run |
| Owner unscripted conversations | `insufficient_evidence`: required five conversations across three surfaces, including tasting, remain owner-run | Not run |
| Preview deployment | `insufficient_evidence`: no Vercel preview deployed; obtain fresh nonprinting deployment authentication before any attempt | Not run |
| Production | Untouched and unclaimed | Out of scope |

The native Dev preflight now rejects missing/blank Firebase values and a
missing, malformed, non-HTTPS, credential-bearing, or production-host Ruphus
preview URL before Vite. Preview-aware Agent, recipe-command,
tasting-provenance, and Aiden-preparation routes preserve deployment-protection
query parameters. These are deterministic isolation proofs, not deployment or
installed-app evidence.

No production data, Firebase rules, production Vercel, production Capgo, or
live provider spend is part of this checkpoint. Product PASS remains false.

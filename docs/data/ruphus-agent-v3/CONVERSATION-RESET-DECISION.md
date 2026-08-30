# Conversation reset decision

## Backend conversation checkpoint

**Status: FAIL — live U3 gate not run.**

The deterministic U3 runner, Dev-only fixture seeding safeguards, stage rules,
cost hard stop, and blind judge schema are implemented and covered by local
tests. The live checkpoint remains open until an owner supplies an explicit
per-run cost cap and authorizes a Dev endpoint/authentication preflight.

The U3 label, when earned, is exactly **Backend conversation checkpoint PASS**.
It is not Product PASS. Product acceptance additionally requires the later
rendered harness, simulator/device evidence, and owner-conversation evidence.

## Evidence ledger

| Category | Result |
| --- | --- |
| Source and deterministic tests | Recorded by `npm run test:ruphus-u3` |
| Injected runner | Plumbing proof only; never a live gate |
| Live provider and Dev Firestore | Not run; explicit cost cap unavailable |
| Rendered harness | U4 evidence; not run |
| Simulator / physical device | U4/U6 evidence; not run |
| Owner unscripted conversations | Owner gate; not run |

No production data, production credentials, Firebase rules, Vercel, Capgo, or
live provider spend is part of this checkpoint.


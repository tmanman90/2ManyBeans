# Ruphus conversation evaluation

This directory is the U3 backend conversation checkpoint. It is separate from
the U6 model tournament and from Product PASS. The runner uses the frozen
fourteen-case Dev manifest under `scripts/fixtures/ruphus-conversation/` and
verifies its manifest hash before every run.

## Stages

```sh
npm run test:ruphus-u3
npm run ruphus:conversation -- --mode=injected --stage=smoke
npm run ruphus:conversation -- --mode=live --stage=smoke --cost-cap-usd=<owner-approved-cap>
```

Smoke runs the eleven critical fixtures once. Calibration runs three critical
and one supporting repetition and calibrates the blind judge; it can never
report PASS. Full runs use five critical and three supporting repetitions and
are admitted only after two consecutive clean smokes on the same commit.
Targeted runs require named fixture IDs, use their full cadence, and append a
critical smoke. Every live stage requires an explicit owner-approved positive
cost cap; the runner hard-stops before a call that would exceed it.

The live adapter sends the launch context and user turns to the real Dev
endpoint. `RUPHUS_AGENT_ENDPOINT`, `RUPHUS_DEV_AUTH_TOKEN`,
`RUPHUS_DEV_PROJECT_ID`, and `RUPHUS_DEV_FIXTURE_UID` are injected through the
environment and are never printed. Seeding requires
`RUPHUS_DEV_SEED_AUTHORIZED=true`, rejects production-like targets, and writes
only the fixture account. Before stage admission, the runner reads the seeded
beans, recipe revisions, and setup back through the production Firestore
reader seam, and clears `chatSessions/active` before every fixture repetition.
Do not use production credentials or data.

Run artifacts contain redacted visible transcripts, stage, commit, fixture,
grader classes, judge result, latency, and spend. Raw provider prompts are
diagnostic-only, redacted, and subject to the authorized 30-day Dev retention
policy. UIDs, email addresses, tokens, private fields, and raw records are not
evaluation output.

The decision record must report source/tests, live backend, rendered harness,
simulator, physical-device, and owner-conversation evidence separately. A U3
success is labelled `Backend conversation checkpoint PASS`; it is never
Product PASS.

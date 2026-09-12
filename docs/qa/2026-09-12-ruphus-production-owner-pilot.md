# Ruphus production owner pilot — September 12, 2026

## Authorized scope

Tal approved updating Dev and production, then approved enabling the new agent
only for his verified production Google account. All other production accounts
retain legacy chat. No cloud coffee records, subscriptions, login credentials,
or diagnostic ledgers were modified. No paid model calls were made for this release.

## Delivered

- Runtime source: `e25223c8acb15077250d89ab3ebb2f63ee282328`, package 1.1.244.
- Vercel production READY: `dpl_4iSYf2oGiQMYB5MDUM1hPPyZME6H`, stable
  <https://2manybeans.vercel.app>, exact source metadata verified.
- Server and client access/mutation allowlists each contain only the resolved
  production owner UID; no wildcard or global enable flag. Tested provider
  input/output/evidence bounds copied from Dev; no Dev credentials or fixture UID.
- Production Firebase is `manybeans-7893c`; existing Ultra annual subscription
  was read and required no change. Production diagnostic tracing remains disabled.
- Production app built, signed, installed without uninstalling, and launched on
  Tal's exact authorized phone. Bundle `com.talmeltzer.coffeehub`, display name
  `2manybeans`, native version **1.1.244 (244)**. Existing derived-data cache reused.
- Built assets verified production Firebase, Ask Professor Ruphus label, no Dev
  Firebase. Runtime console confirmed app ready, **builtin 1.1.244 active**,
  without observed permission-denied or connection-error logs. Raw logs not saved.
- Dev phone delivery was completed immediately before this pilot: separate
  `com.talmeltzer.coffeehub.dev`, isolated Dev Firebase, current Dev preview,
  builtin runtime verified. This pilot did not reinstall or remove Dev.

## Deliberate delivery limitation

The guarded production OTA rejected native incompatibility; shared Capgo
`production` remains **1.1.243**, not 1.1.244. The owner's production phone was
updated with a new native wrapper instead. Automatic OTA loading is disabled in
that personal wrapper to prevent an older shared bundle replacing the pilot.
This is NOT an App Store/TestFlight release or a successful global OTA rollout.
A future compatible native/OTA release is needed before resuming OTA for it.

## Permissions and rollback

Production rules were composed additively against the deployed rules, preserving
all existing policies byte-for-byte. Only exact-owner grants were added for the
Agent session schema and server-written artifact reads. No global bean/tasting
protected-field cutover occurred; direct client artifact writes remain denied.

- Previous ruleset: `projects/manybeans-7893c/rulesets/78b67c8f-ace5-418f-bf66-dc20dd880ea2`.
- Active ruleset: `projects/manybeans-7893c/rulesets/13936940-699a-40d7-9894-46c97d325aa3`.
- Composer: `scripts/ruphus-production-pilot-rules.mjs`.
- [Firebase Rules source-test API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test)
  executed nine mock cases before activation: owner artifact read/session write;
  stranger, unauthenticated, forged artifact, malformed session denial; non-owner
  legacy writes preserved. All SUCCESS. These were rule evaluations, not writes
  to coffee documents or an authenticated phone conversation.
- Rollback access by clearing production server/client pilot UID gates and
  rebuilding the affected client. The retained previous ruleset and prior Vercel
  deployment `dpl_Gtg8H5byaucbzgp8TAaGERYuMQkd` are explicit rollback references.
  Do not blindly deploy the broader local Dev `firestore.rules` to production.

## Verification boundary

- 24 focused flag/rollout/rule-composer tests passed.
- Rendered browser harness passed mobile/desktop, including legacy route.
- Rendered failed-turn persistence/retry test passed.
- iOS build-env guard, targeted ESLint, build, diff checks passed.
- Native production build/install/launch and exact runtime version verified.
- A new signed-in production chat-to-recipe mutation journey was **not** performed
  during this shipping task. Prior signed-in Dev acceptance remains separate in
  `2026-09-12-ruphus-conversation-completion.md`; do not present it as production proof.
- The existing dirty root `ios/App/GoogleService-Info.plist` was preserved.
  `configure-ios-variant.mjs --preserve-root-firebase` allows the generated app
  configuration to switch without overwriting that unrelated file.

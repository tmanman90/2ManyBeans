# Independent acceptance checks

Root acceptance is based on observed behavior and persisted state. Writer test counts alone do not close a gate.

## Unit checks

| Unit | Root probes |
| --- | --- |
| U1 | Espresso registry category is neither manual nor Aiden; every bean action, archive and post-scan route reaches espresso; preferences reload; independent grinder choice never changes V60 grinder; unknown/unsupported basket cannot receive stock-double targets. |
| U2 | Curated light 17/37.4, medium or unknown 18/36, dark 18/32.4; honest synthesis attribution; real verified roaster evidence outranks baseline and filter evidence is excluded; finite dose 16–19, ratio 1–4, 0.1g precision; stale generation does not write after bean/setup switch; saved adjustments survive reopening/regeneration. |
| U3 | Real authenticated endpoint and actual tools; unauthorized owner, stale revision, invalid input and duplicate request tests; requested save persists before receipt; correction of actual output does not mutate a target; stale Undo cannot overwrite a newer edit. Espresso handoff beats V60 default. No contradictory always-grind-first or rigid-time advice. |
| U4 | Existing eight sensory steps and chart scores survive; espresso removes cupping instructions; milk is contextualized and excluded from bean-only inference; drafts preserve setup despite preference changes; old/unknown context stays unknown; old tasting notes and snapshot hashes remain identical after recipe changes. |

## Live conversations

Required matrix is 12 plan scenarios × clear, casual/typo and incomplete variants. Each case has a fixed outcome oracle declared before execution. Capture initial/final state hashes, transcript, actual tool arguments/results, configured and reported model, prompt/rules/source hash, environment identity and cost. Distinguish actual endpoint + real model + isolated emulator from deterministic mocked-provider tests and browser-only fixtures. Repeated save/Undo cases must retain valid ownership, revision and idempotency behavior. Failed attempts stay in the report; reruns link to the cause/fix.

Critical failures: wrong-bean or unrequested writes, invented measurements or successful save, lost observations, stale Undo, hardware-incompatible advice. These block acceptance. Other advice is reviewed against research E01–E12 for relevance, a single proportionate experiment and uncertainty handling; exact prose need not match a template.

## Environment readiness

At admission, release package-lock exactly matches the new checkout. `node_modules` is a read-only reuse link to the release checkout; never install through it. Metadata-only inspection found an OpenAI key in the primary `.env.local`; it has not been loaded or disclosed. No process credential is currently configured. A Firestore emulator jar is cached, but Java and the Firebase CLI were not found. Shared `/tmp/doxin-heavy.lock` was held by Mailroom at admission.

Preflight correction: the release dependency directory was incomplete despite matching lockfiles. The newly created reuse link was removed and `npm ci --ignore-scripts --no-audit --no-fund` installed 999 packages successfully in this isolated checkout. No other dependency tree was modified. Official Temurin 21.0.12.1 JRE, SHA256 verified, and Firebase CLI 15.33.0 are installed only in ignored `.runtime`; see `runtime-receipt.json`.

Actual preflight passed at 2026-10-13 00:06 UTC: unchanged `/api/ruphus-agent` default export returned 401 without authentication and 400 required-input validation after a real emulator token passed middleware/entitlement checks. Concurrent Firestore transactions yielded counter 2. No provider call was made. See `emulator-smoke-receipt.json` and `emulator-smoke-02.log`. Initial path and missing-dependency failures remain in preceding logs. The app rules copy used by the emulator is hash-recorded in `emulator-rules-sha256.json`. Emulators were shut down and this run's lock released.

Candidate live path: dedicated local `demo-espresso-*` Auth/Firestore emulators and loopback endpoint using unchanged production auth middleware. Initialize the admin SDK for that demo project before importing the endpoint, use actual emulator ID tokens, and seed only synthetic users with local subscription fixtures. Reject non-loopback hosts and non-demo project IDs. Do not use or copy a production service account. The documented SDK emulator mechanism is supported by [Firebase Auth emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth) and [Firestore emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_firestore). An emulator is nonproduction integration proof, not deployed Firebase proof.

The historical runner's cumulative $55 authorization belongs to its earlier evaluation and is not treated as a fresh budget here. Current implementation handoff requires real model evaluations; record this run separately and bound calls before execution. No paid calls have run at admission.

## Shared machine constraints

One test command at a time; fresh CPU idle over 40%. Build/dev server/simulator and tests taking over one minute require exclusive ownership of `/tmp/doxin-heavy.lock`. Only remove the lock if this run created it and still owns it. Keep waiting bounded per tool call and perform source/review work while another owner holds it. Do not disturb GetUp, Mailroom, existing simulators, processes or archives.

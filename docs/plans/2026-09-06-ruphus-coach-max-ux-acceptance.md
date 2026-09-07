---
title: Ruphus Coach Max conversation-to-action UX
date: 2026-09-06
status: active
---

# Objective

Deliver the user-approved September 6 UX direction: a knowledgeable coffee companion that uses account context, converses naturally, and turns an agreed adjustment into a working native recipe/action flow. This supplements the August 30 conversation-reset plan; it does not erase its unmet gates or safety requirements. Coach Max and the prior consumer-agent research inform the experience, not claims about another product's private implementation.

## Authority and isolation

- Continue on `codex/feat-ruphus-agent-v3` in the existing isolated worktree. Preserve unrelated edits and all diagnostic ledgers/report directories; never stage diagnostics.
- Dev-only configuration, backend, Firebase, and native app. Production remains untouched. No production data writes, push, merge, release, automatic recipe mutation, or hardware actions.
- Preserve the existing $30 total testing cap and 30-day redacted diagnostic retention. Check cumulative spend before any live test; unknown spend is not free spend.
- Use supported authentication only. Keep secrets out of output, artifacts, and process arguments.
- Follow repository instructions: execute agent work sequentially in the main task. Root retains product/visual acceptance ownership.

## UX1 — Close the observed proposal failure

Trace the actual endpoint, proposal readiness, tool result, artifact stream, renderer, and account action gates before patching. An explicit request such as “OK can we update recipe?” after an established adjustment prepares a proposal immediately, without a second conversational permission request. A following “yes” must not merely repeat advice when a concrete proposal can be prepared.

The proposal remains non-mutating. Recipe writes require the native confirmation action. Unknown targets, stale sources, unsupported adjustments, unavailable evidence, or missing access produce an honest explanation and recoverable next step, never simulated success. Negation and hypothetical discussion do not count as consent.

Acceptance: replay the owner's Kalita thin-cup exchange through card emission; test negation, ambiguous target, stale source, unavailable access, and retry. Confirm the recipe is unchanged before tapping save.

## UX2 — Make the card finish the job

Present coffee/method identity, a short reason, exact before/after change, unchanged key parameters, and expandable full recipe. Give “Update saved recipe” primary emphasis, with quieter “Try for one brew” and “Leave unchanged” alternatives.

After saving, transition the card to a truthful saved receipt with Start brew and available Undo. Canonical recipe surfaces must show the same result. A one-brew attempt must leave the saved recipe unchanged. Historical cards stay bound to their original coffee and method after topic switches. Preserve existing timers, recipes, Learn, and tasting flows.

Acceptance: actual command integration through canonical readback; duplicate-tap/idempotent retry; failed save; stale proposal; Undo; one-brew isolation; narrow-mobile rendering and keyboard accessibility. Do not infer persistence from receipt text alone.

## UX3 — Natural conversation and quiet context

Direct Chat must not assume Aiden. Recipe entry provides a starting hint that retires when corrected. Resolve jar references, pronouns, coffee switches, and method corrections from trusted context; ask only when ambiguity matters. Never ask for known saved details as if unavailable, or treat a saved recipe as proof of what was brewed.

Keep replies phone-sized and responsive to the user's exact words. “Thin” alone does not establish “not sour or sharp.” Present useful bounded advice without false precision or unsupported claims. An optional quiet context label provides inspection/correction, not a mandatory setup step. No recipe card is required for casual advice.

Acceptance: direct Chat, recipe launch, same-coffee continuity, other-coffee switching, correction, topic return, genuine ambiguity, and pushback in complete transcripts.

## UX4 — Recovery, return visits, and feedback

Keep a single user-facing Ruphus experience rather than asking users to choose backend chat modes. Use truthful progress tied to actual work. Preserve the conversation and pending action on failure; distinguish not saved from uncertain save and reconcile before retrying.

After a long absence, provide a fresh opening with optional continuation rather than stale conversational assumptions. New chat does not delete coffee history. After a recorded test brew, follow-up feedback refers to the actual attempt and adjustment. Do not invent tasting evidence or physical brew completion.

Acceptance: interrupted reply, failed save, uncertain/replayed action, relaunch, stale session, new chat, and recorded-attempt feedback. Existing safe action identities and recovery must survive presentation changes.

## UX5 — Prove and deliver the complete Dev journey

### September 7 owner failure: trial to permanent recipe

The owner obtained a proposal, chose Brew once, returned to Chat, lost the card, and asked to save permanently. Ruphus replied with manual instructions instead of recovering the actionable trial. This is a failed journey, not acceptance of the proposal step. The owner explicitly requires complete internal journey testing before another request to test.

Required behavior: preserve the trial card and action result through navigation/relaunch; recover the exact trial when asked to make it permanent; present one explicit save control; persist exactly that recipe and verify it on its normal recipe surface. Choosing Brew once never automatically replaces the saved recipe. A later explicit save must not manufacture a tasting or require a tasting merely to change the user's mind. Keep brew execution state independent of saved-recipe state so saving does not interrupt an ongoing timer or falsify completion. Reject wrong-owner, wrong-method, and stale-source actions. Retry must not create another revision or brew.

Acceptance scenario: describe thin Kalita cup → proposal → Brew once → leave Chat → return/relaunch → ask to make it permanent → exact trial review/save → canonical recipe readback → ongoing attempt still valid → retry → Undo. Include completed and not-yet-completed attempts, coffee switch before return, and changed saved recipe while away. Source/unit tests are not a substitute for this rendered and live journey. Do not ask the owner to validate another partial patch.

Current narrow remediation persists receipts alongside their proposal instead of transient Agent state; session round-trip and replay tests pass. Permanent-save recovery and its lifecycle-safe command behavior remain outstanding. Not delivered or ready.

Run the complete owner journey: describe cup → clarify if needed → discuss adjustment → request update → inspect card → save → open updated recipe → start supported brew flow → record feedback. Repeat with coffee/method correction and failure recovery.

Report source/deterministic, live provider, rendered UI, simulator, physical device, preview identity, and owner unscripted evidence separately. Verify Dev bundle, preview backend, isolated Firebase, access/entitlement, and disabled automatic Capgo updates before installation. Do not wipe app data speculatively.

No “ready” claim from compilation, injected model replies, or isolated component tests. Every observed user failure becomes a regression. Budget exhaustion, authentication, or a disconnected/locked device is a stated remaining gate, not a pass. Goal completion requires the authorized contract to be fulfilled; owner-only evidence remains explicit.

## Deferred

### September 7 trial-return checkpoint — not Product PASS

Authenticated typed browser acceptance at `u3-action-check-1788792835279/report.json` passes conversation → proposal → Brew once → timer → reload and fixture reauthentication → return → conversational trial recovery → permanent save → canonical readback → New chat boundary → Undo/readback. Backend preview is `https://twomanybeans-ruphus-auqzqpgbz-tmanman90s-projects.vercel.app` (Dev, READY, source ca78bb6); local rendered client also includes 0bcaf22. Test spend is $28.066506 cumulative of $30. This uses actual Firebase/provider/commands through an operator-guarded browser transport, not a scripted native-device pass.

Root causes found: fixture seeding added u3Stage/u3Repetition fields disallowed by session rules, so client transcripts/cards were never saved; restored user turns used the assistant renderer; trial recovery lacked the active conversation's receipt reference. Seeder metadata removed without changing rules; receipt identity is server-revalidated, bounded to current chat, and never model write authority. Focused action/recovery/session/artifact matrix: 46/46. Rendered mobile/desktop harness and build pass. Reports/ledgers preserved unstaged.

Remaining: polish long recovered-card layout (the expanded screenshot overlaps the composer), native verification/delivery of these changes, broader plan final gate and owner unscripted evidence. Do not ask the owner to retest this partial checkpoint or mark the goal complete.

Follow-up source 87d432f moves the trial-save action above expanded details, adds a 44px disclosure target and readable step spacing; mobile/desktop rendered harness passes with action-position assertions and inspected `/tmp/ruphus-trial-review-mobile.png`. Managed native assets verified Dev bundle, preview auqzqpgbz, Firebase twomanybeans-ruphus-dev, Ask label, trial-save label, autoUpdate false, defaultChannel dev. XcodeBuildMCP device build-and-run succeeded on exact authorized iPhone A34D2908-AC86-59E1-8172-A69FBE33FCFC; installed and launched com.talmeltzer.coffeehub.dev, display name 2manybeans Dev, process 16219. No uninstall or Capgo change. This is native delivery/launch evidence, not authenticated scripted native acceptance. Broader final gate and owner-only evidence remain outstanding.

Voice, autonomous background changes, new external integrations, broad redesign of non-chat screens, and expanded hardware capabilities. Improve the supported experience before adding scope.

## Execution sequence

September 7 native follow-up: current assets also build/install/launch in iPhone 17 Pro simulator 7EC6BF90-33B7-4B1A-A651-464B4AC9AA9E (process 9644). Standard CLI AX snapshot still fails the CoreSimulator architecture load; ARM Node with the existing XcodeBuildMCP resource root/socket captures the accessibility snapshot successfully. Screenshot confirms the ordinary Apple/Google sign-in screen. This does not establish fixture authentication or scripted native conversation acceptance.

UX1 → UX2 → UX3 → UX4 → UX5, reusing verified existing behavior instead of reimplementing it. Inspect current coverage at each step; implement only gaps. Keep coherent local commits and perform focused checks per unit, then integrated functional and visual acceptance.

## September 6 delivery checkpoint — not Product PASS

- Source commits `5a2ebc4` and `2c0047e` repair explicit update-request readiness, server-authorized proposal actions, hot-water recipe consistency, and the review card. The final focused endpoint/runtime/action/artifact suite passed 81 tests; lint and build passed. The rendered browser harness passed mobile and desktop, including pending/stale states. The full proposal → Apply → canonical readback → Undo regression uses injected provider/readers and an in-memory repository, not live Firebase.
- Preview `https://twomanybeans-ruphus-4mwknxyj6-tmanman90s-projects.vercel.app` reached READY. Its project is the isolated `twomanybeans-ruphus-dev` Vercel project. Preview action access now includes the two authorized accounts (owner and original fixture); no production environment was modified.
- Managed client configuration was read into process memory, not an environment file. Native assets verified Dev bundle/display name, isolated Firebase, this preview URL, Ask Professor Ruphus, Update saved recipe, updater disabled, and dev channel. XcodeBuildMCP built, installed, and launched `com.talmeltzer.coffeehub.dev` on the exact authorized iPhone, reporting SUCCEEDED and process 11911. Existing Capacitor keyboard warnings only. This is delivery/launch evidence, not authenticated scripted acceptance.
- Capgo channels were not changed. Diagnostic ledgers and report directories remain unstaged and preserved.
- Authenticated live fixture acceptance remains blocked: the existing fixture has no linked sign-in provider, and existing Dev service accounts expose neither signJwt nor signBlob permission to the current operator. Standard token-signing preflight returned 403. No IAM permissions, auth backdoors, or user passwords were changed. No provider calls were made in this checkpoint; cumulative recorded test spend remains $27.082879 of the authorized $30.
- UX3/UX4 complete-transcript and recovery acceptance, authenticated live Apply/readback, scripted native journey, and owner unscripted evidence remain unproven. Do not describe this checkpoint as the finished Coach Max experience.

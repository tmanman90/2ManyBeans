# Espresso implementation verification

> The raw run logs this folder refers to (receipts, manifests, failure logs, ledgers) were removed before merging to main on 2026-11-15 to keep about 67 MB of logs out of the public repo. They remain in the history of PR #12's branch, up to commit `da8c193`.

Status: **local implementation verified, with reproduced baseline exceptions**. Local branch `codex/espresso-recipes`; no release is authorized by this work. Final application source: `a1da52c3fd2ef767f057c0afd80b43337e221008`.

The final evidence includes 36 independently accepted natural-language conversation variants, all 10 mutation perturbations, nine additional write variants with per-attempt state capture, 13 focused commands, 14 existing pour-over/Aiden chat commands, and 12 full App browser groups at mobile/desktop widths. The broad suite ran all 44 commands: 41 passed and three failed identically on the untouched starting code. Changed-source lint passed all 48 files; whole-repository lint retains four unchanged errors and two warnings. See [baseline exceptions](baseline-regressions.md), [aggregate acceptance](acceptance-index.json), and [independent final review](review-final-acceptance.md).

## Product scope

The existing bean → recipe → Ruphus chat / guided tasting flow now has an espresso path. Machine, basket and grinder are separate preferences. The first researched numeric preset is the confirmed Barista Express stock double single-wall setup; an external grinder retains its own identity and setting. Saved recipe targets take precedence over a new baseline.

Ruphus can give advice, apply an explicitly requested recipe edit and undo that edit through the existing authenticated recipe command path. Guided tasting retains its eight steps, personal notes and sensory scores, with straight/milk context and an immutable recipe/equipment snapshot. There is no added timer, shot journal or dashboard.

## Evidence map

| Requirement | Local evidence |
|---|---|
| R1/R3 equipment and existing entry routes | U1 focused routing tests; full App browser Rotation, Inventory, scan, archive and Settings cases |
| R2/R5/R9 researched recipes and direct editing | U2 recipe/command tests; 19 authenticated endpoint checks; 8 hook/modal browser checks |
| R4/R5/R9 chat advice, Save and Undo | Actual endpoint/provider conversations, full persisted-state assertions, mutation perturbations and independent semantic review |
| R6/R7 tasting and immutable cup context | U4 focused context tests; full App straight/milk eight-step saves, draft resume and pending-save failure/retry |
| R8 reviewable preview | Preserved isolated mockup and research plan; later goal authorization governs implementation |

## Start here

- [Completion contract](GOAL.md) and [current status](status.json)
- [Fixed natural-language and mutation oracles](live-oracles.json)
- [Prior pour-over and Aiden findings carried forward](prior-chat-findings.md)
- [Versioned conversation index](conversation-index.json)
- [Independent source review and corrections](review-final-source.md)
- [Current consolidated independent verdict](review-final-acceptance.md)
- [Independent actual-conversation review](review-live-final.md)
- [Full App browser checkpoint](checkpoint-U4-browser.md)
- [Simplification review](simplification-review.md)
- [Final focused results](final-focused.json), [prior chat regressions](prior-chat-1791868156-receipt.json), and [broad regressions](final-regression.json)
- [Final App browser receipt](app-browser-1791868247111-receipt.json) and [stable source manifest](emulator-app-browser-11-manifest.json)
- [Research and source-to-rule specification](../../research/espresso-recipe-foundation-2026-10-12/README.md)

The matrix exercises 12 scenarios in clear, casual and incomplete language, plus 10 mutation perturbations. Each actual run records the source hashes, model configuration, transcript, tool activity, state after every turn and mutation attempt, and terminal result. Failed attempts remain in the evidence history. A passing HTTP response or unchanged state alone does not establish correct conversational behavior.

## Boundaries

The local Auth/Firestore emulator holds synthetic accounts and beans. Conversation checks use the configured real provider and authenticated application endpoint. Provider token/evidence caps are explicit evaluation settings. Browser scan/enrichment fixtures and the held/failing tasting-save callback are identified in the browser report. They do not establish a production service outage result.

Native iOS, production deployment and human espresso cup quality are outside the completed proof. Conversation acceptance is version-specific; affected cases were rerun after corrections, and source manifests preserve the exact version for every result. Successful simulations do not establish universal model reliability. No configured typecheck script exists, and no production build/release is claimed.

The owning worktree and receipts remain available for review. No production or live-user data, release configuration, deployment, push, PR or external messaging is part of this implementation.

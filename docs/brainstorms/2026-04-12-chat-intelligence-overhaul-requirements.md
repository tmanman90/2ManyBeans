---
date: 2026-04-12
topic: chat-intelligence-overhaul
---

# Chat Intelligence Overhaul (Professor Ruphus v2)

## Problem Frame

Professor Ruphus (the Coffee Chat tab) gives confident wrong advice because the system prompt is missing three critical pieces of context:

1. **Brewer identity.** The prompt never says which brewer the user owns. When it sees "Aiden grind: SS 4.5" it hallucinates, e.g. conflates Fellow Aiden (automatic pulse-pour brewer) with Fellow Ode (grinder), then writes dial-in advice premised on the wrong device.
2. **Full per-bean recipe.** Only `aidenGrind.singleServe` and `aidenGrind.batch` are surfaced. The stored `aidenRecipe` (ratio, bloom ratio/temp/duration, pulse count, pulse interval, pulse temperatures) is ignored, so Ruphus can't cite the actual recipe the user is asking about. The user literally asked "do you not have access to the recipe?" in session IMG_8287.
3. **Grinder semantics.** Different grinders invert grind direction (LOWER = FINER on most burrs, MORE CLICKS = COARSER on Comandante). The prompt has a partial Opus/Ode note buried in the tasting coach but nothing in Coffee Chat, and it doesn't adapt to which grinder the user actually owns.

A prior pass (`docs/plans/2026-04-05-007-feat-chat-context-and-persona-polish-plan.md`, completed 2026-04-05) added grind numbers to chat context but stopped short of brewer identity, full recipes, and grinder adaptation. This brainstorm is the v2 that closes those gaps.

## Requirements

### Core context injection

> **Cache placement convention.** Everything user-agnostic lives in the **static (cached) block**. Everything user-specific lives in the **dynamic block**. This preserves the `cache_control: { type: 'ephemeral' }` breakpoint at `src/lib/claude.js:346` — if we inject user-specific content into the static block, the cache key changes per user/preference and every request becomes a cache miss.

- **R1. User setup block [DYNAMIC].** `buildChatContext` receives `preferences` from `ChatTab` and emits a "USER SETUP" section in the dynamic block: brewer (Aiden / hand-brew), grinder (display label), canister count. If `grinderCustomName` is set, use that label instead of the keyed label. The block explicitly names which static-block grinder/brewer knowledge entry to reference.
- **R2. Brewer knowledge [STATIC].** The cached static block contains **both** brewer knowledge blocks (Aiden + hand-brew), every request. Aiden block: automatic pulse-pour brewer that uses pre-ground coffee, automates bloom/pulses/temperature/timing, user cannot manually control pour technique. Hand-brew block: user controls ratio, pour schedule, grind, temperature manually. The dynamic USER SETUP block (R1) tells Ruphus which one is active.
- **R3. Grinder knowledge [STATIC, dynamic selection].** All 6 supported grinders (Fellow Ode Gen 2, Fellow Opus, Baratza Encore ESP, Comandante C40 MK4, 1Zpresso JX-Pro, Baratza Virtuoso+) plus a generic "other" fallback live as ~60-80 token blurbs in the cached static block. Each blurb covers: scale format, direction convention (finer/coarser), specialty filter range. The dynamic USER SETUP block (R1) names which blurb is active via its `preferences.grinder` key. Data source is `src/lib/handbrew.js:19-57` (`GRINDER_POUROVER_STARTS`); import or mirror to avoid drift.
- **R4. Full per-bean Aiden recipes for active jars [DYNAMIC].** For each `ACTIVE` bean with a stored `aidenRecipe`, surface the full recipe in the jar line: title, ratio, bloom ratio/temp/duration, pulse count, pulse interval, pulse temperatures (single-serve by default, batch optional), plus the Ode-grind recommendation. Only for active beans (max 3). **Legacy fallback:** if `aidenRecipe` is missing but legacy `aidenGrind` numbers exist, emit only the grind summary (current behavior) and skip the full-recipe block.
- **R5. Full per-bean hand-brew recipes for active jars [DYNAMIC].** Symmetric to R4 for hand-brew users. For each `ACTIVE` bean with a stored `handBrewRecipe`, surface method, technique, ratio, water temp, grind setting + description + microns, bloom (first step), total brew time, and one-line reasoning.
- **R6. Sealed inventory stays summary-only.** Sealed beans do NOT get full recipes. Recipes are only generated on first brew, so most sealed beans don't have one yet. Keep the current summary (roaster, name, origin, variety, process, bag notes).

### Prompt rules

- **R7. Aiden-aware brew troubleshooting rules.** Replace the current generic pour-over troubleshooting block with rules that match the user's brewer:
  - Aiden users: adjust via ratio, bloom ratio/temp, pulse count, pulse interval, pulse temperatures, and grind. Do NOT ask about pour technique or brew time (Aiden automates these).
  - Hand-brew users: existing pour-technique rules stay.
  - Sour/bright → finer grind OR hotter water OR higher early-pulse temp (Aiden) OR longer bloom
  - Bitter/astringent → coarser grind OR cooler final pulse (Aiden) OR shorter contact
  - Weak/thin → higher dose (stronger ratio, e.g. 1:16)
- **R8. Grinder direction rule.** Always cite the direction in words (finer/coarser) AND the new number on the user's specific grinder. Explicitly reference the grinder blurb above before writing a new number. Reuse the pattern that already works in `buildTastingSystemPrompt`.
- **R9. Recipe recall rule.** If the user asks about "my recipe" or "the current brew" for a bean in active rotation, cite the full stored recipe by parameter (not paraphrased). Example: "Your Aiden profile for jar 2 is 1:17, 2.5x bloom at 95C for 45s, three SS pulses (96/95/94) at 22s intervals, Ode grind SS 4.5."
- **R10. Action handoff rule.** When suggesting a change, say the user applies it either manually on the Aiden UI or by tapping the Brew button on the bean card to regenerate the recipe. Ruphus is advisory; it cannot write recipes to the device.
- **R11. Past-tasting continuity rule.** The existing recent-5 tastings list stays. Add a prompt rule: "If the user is dialing in a bean with past tastings (match by bean name/id), reference them for continuity. Example: 'You got muddled at SS 5.2 last time and liked it at 4.5.'" No new data, just better instructions.
- **R14. Grinder-stamp mismatch handling [STATIC rule + DYNAMIC data].** When a stored `handBrewRecipe.grinder` disagrees with the current `preferences.grinder`, surface the mismatch in the dynamic jar line (e.g. `(stored for Ode Gen 2, you now use Opus)`) and add a static-block rule telling Ruphus to flag the mismatch in any dial-in advice and suggest regenerating via the Brew button.
- **R15. Aiden grind recommendation is always Ode units.** `aidenRecipe.grindRecommendation` is hardcoded to Fellow Ode Gen 2 at `src/lib/aiden.js:88`. For users whose `preferences.grinder` is not `fellow-ode-gen2`, Ruphus must caveat that the stored number is Ode Gen 2 and translate direction (not absolute clicks) to the user's grinder. Add as a static-block rule.

### Wiring

- **R12. `ChatTab` passes `preferences` through.** `buildChatContext(beans, tastings, preferences)` — three args. Fall back to sensible defaults if preferences are null (first-run state).
- **R13. Sanitize new fields + align existing regex.** All newly-interpolated bean recipe fields go through the existing `sanitize()` helper with appropriate max lengths. Numeric fields coerced via `Number.isFinite` before interpolation. Additionally, **align the existing `sanitize()` regex at `src/lib/claude.js:259` with the stricter version at `src/lib/handbrew.js:211`** — the current `claude.js` regex allows `\s` (including newlines), which enables fake `---BEAN_SCAN---` marker injection via a malicious bag note. Close that path in this PR.

## Success Criteria

- Ruphus never refers to the Aiden as a grinder or to the Ode as a brewer again.
- When the user asks "what's my recipe for jar 2", Ruphus quotes ratio, bloom, pulses, temps, and grind from the stored `aidenRecipe` verbatim (within a sentence or two), not paraphrased or hallucinated.
- When the user asks for a dial-in change, Ruphus writes the new number on THEIR grinder (by name, not "Ode") and the change direction in words.
- Token impact on an active rotation of 3 beans + 5 tastings stays under 900 extra tokens in the dynamic block. Static block growth stays under 600 tokens (cached, so one-time cost per 5-min window).
- Manual smoke test: reproducing the IMG_8286–IMG_8289 conversation, Ruphus correctly identifies the Aiden, cites the real recipe, and writes an Ode-specific grind change with direction words.

## Scope Boundaries

- **Out:** tool-calling / function-calling infrastructure. No new `api/claude.js` tool-use loop.
- **Out:** new chat action chips (e.g. "regenerate recipe from chat"). That's a separate feature.
- **Out:** changes to `buildTastingSystemPrompt` (the Tasting Coach system prompt). It's a different flow; its Aiden/Opus wording is already more correct than chat's.
- **Out:** overhaul of the Ruphus persona voice. Light edits only.
- **Out:** BREWING_KNOWLEDGE general rewrite. Only additive: the new `FELLOW_AIDEN_KNOWLEDGE` and `GRINDER_KNOWLEDGE` exports.
- **Out:** recipe recall for sealed/finished beans.
- **Out:** image-routing changes (`sendChatMessage` Gemini vision pipeline stays as-is).
- **Out:** server-side prompt logging or telemetry for chat quality.

## Key Decisions

- **Static dump over tool-calling.** Prompt cache makes the token cost nearly free after first turn; tool-calling would add ~200 lines of plumbing across proxy + client for marginal wins on a 3-active-beans scale.
- **Active beans only for full recipes.** Sealed beans usually don't have recipes (generated on first brew). Finished beans are historical. Keeps the dynamic block under budget.
- **Symmetric Aiden + hand-brew paths.** Both brewers get brewer block + full per-bean recipe. Avoids asymmetric drift and keeps the ChatTab preferences injection identical for both user types.
- **Grinder blurb is dynamic, keyed on preferences.grinder.** Storage is static (all 6 blurbs live in `coffeeKnowledge.js`), emission is dynamic (only one blurb ships per request). Future grinder adds are one-line additions to a map.
- **Advisory handoff, not action handoff.** Ruphus tells the user to regenerate via the Brew button or edit on the Aiden manually. No new chat actions in this pass.
- **Past tastings stay on existing recent-5 feed.** No new per-bean tasting history in the jar line. Improve via prompt rule, not data shape.

## Dependencies / Assumptions

- `preferences.grinder` is always one of the 7 known keys or `null` (first-run). Default to `fellow-ode-gen2` on null.
- `preferences.brewMethod` is always `aiden` or `handbrew`. Default to `aiden` on null.
- `aidenRecipe` stored on beans matches the shape documented in `src/lib/aiden.js:96-116`. Any recipe generated before the field rename is out of scope (there should be none live).
- The prompt cache is configured on the static block (it is — `cache_control: { type: 'ephemeral' }` at `claude.js:346`).
- Claude Haiku 4.5 handles the ~600-token static block growth without latency regression. (Known-good; this is still well under the previous prompt size before April 5 trims.)

## Outstanding Questions

### Resolve Before Planning

*(none — brainstorm is unblocked)*

### Deferred to Planning

- [Affects R3][Needs research] Final grinder blurb wording. Need to verify specialty ranges for Baratza Encore ESP, Comandante C40 MK4, 1Zpresso JX-Pro, Virtuoso+ against James Hoffmann / Lance Hedrick / manufacturer docs. `world-atlas-coffee.md` + the coffee research source files already flagged in memory are primary sources.
- [Affects R4/R5][Technical] Exact string format of the active-bean recipe line. The plan should propose 1-2 concrete format samples and count tokens before picking one. Target: full recipe in under 150 tokens per bean.
- [Affects R7][Technical] Whether to split `BREWING_KNOWLEDGE` into `BREWING_KNOWLEDGE_COMMON` + brewer-specific blocks, or to keep one block and gate the Aiden/hand-brew-specific rules inside it. Planning should pick based on token cost.
- [Affects R2][Needs research] Whether there are Fellow Aiden firmware parameters we should mention that would meaningfully improve Ruphus's advice (e.g. profile upload semantics, relay push behavior). Check `src/lib/aiden.js` and `docs/data/` for ground truth.

## Next Steps

→ `/ce:plan` for structured implementation planning

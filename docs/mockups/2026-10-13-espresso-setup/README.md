# Espresso setup correction — interactive review

October 13, 2026. **Proposed UX, awaiting Tal’s review. No app implementation or deployment.**

[Astra’s source-grounded review and human role-play](../../research/2026-10-13-astra-espresso-setup-ux.md) explains the existing failure and recommendation. Read it alongside the earlier [Hoffmann/Breville research](../../research/espresso-recipe-foundation-2026-10-12/README.md) and [competitor logic deep dive](../../research/espresso-app-inspection-2026-10-12/BEANCONQUEROR-LOGIC-DEEP-DIVE.md).

Live prototype: http://localhost:58385. Isolated files: `/tmp/compound-engineering-501/ce-prototype/2026-10-13-espresso-setup/01-equipment-in-recipe/screens/`. OS-temp retention is best-effort. These files recreate the relevant interaction; they are not shipped app components. The screenshots and research report are retained here.

## Proposed experience

1. Opening Espresso gives a general starting ratio and preparation immediately. Coffee in is the user’s basket-appropriate dose; espresso out calculates at the chosen ratio. An unknown basket does not receive an automatic18g dose.
2. An inline **Add your machine** invitation opens a short equipment editor, then returns to the same recipe. Machine is the first question; basket/grinder are optional details. No confirmation checkbox or Settings detour.
3. Once equipment is added, a compact equipment row replaces the invitation. Known machine plus unknown basket remains usable and can be completed later. Identified Barista Express, original double single-wall and freshly ground setup receives the researched starter, without claiming a universal optimum.
4. Settings displays default method and equipment separately. Aiden remains default while espresso equipment is added/edited through either route.
5. Other machines retain general espresso guidance and their own dose; separate grinders do not inherit Breville dial numbers. Preground/pressurised context avoids borrowed single-wall preparation guidance.
6. Saved recipes open with their existing targets. Equipment changes keep the old recipe and explicitly offer a new recipe for current equipment; no automatic conversion or overwrite.

Compare A’s invitation against B’s compact row with no equipment. Astra recommends A before setup and the row afterward. That recommendation is not Tal’s selection.

## Browser checks actually performed

- Both invitation variants rendered and were visually inspected.
- Added Barista Express without basket/grinder, returned to generic recipe with unknown dose and retained machine identity.
- With Aiden default, opened independent Espresso equipment in Settings; changed to a separate grinder named DF64, saved, returned to Settings with Aiden unchanged, then opened the Barista Express18/36 starter.
- Entered16g in the generic recipe and observed32g output immediately. An earlier change-on-blur prototype handler did not update under browser interaction; it was replaced by immediate input handling before this passing check.
- Opened the saved18/39 scenario, changed grinder, and observed original18/39 targets plus explicit equipment-mismatch disclosure and new-recipe action.
- Checked generic layout at the current391px browser width: scroll width equals viewport width. Earlier desktop render was also inspected. This is not a complete native safe-area/keyboard test.
- JavaScript syntax checked. No app build, server/Firestore writes, model calls, or physical brewing occurred.

Chat/tasting buttons demonstrate context handoff only and are labeled as previews; they do not reproduce the full existing model or tasting flow. State is in-memory and resets on reload. Saved recipe data is synthetic. Existing production Save/Undo/retry and immutable tasting contracts remain required; this prototype does not establish those backend guarantees or approve bypassing unsaved-edit safeguards.

## Implementation must cover after design review

Separate default method from ownership; one shared espresso preference record for inline editing and Settings; generic vs machine-specific recipe representation/validation/provenance; saved-recipe compatibility/reuse; correct chat/tasting context with missing equipment; normal-language simulations for Aiden default, unknown basket, another machine, external grinder, preground and changed setup; failed equipment save and cancel preserving old state. Keep prior retry/idempotency/Undo, revisions and immutable tasting checks.

Changing the existing setup gate alone is insufficient: current validators hardcode Breville dose and temperature semantics. Generic recipes need deliberate support across creation, edits, chat, server validation and tasting, without pretending unknown equipment is verified.

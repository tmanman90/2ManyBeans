# Espresso setup UX — Astra review

October 13, 2026. Design recommendation and simulated human walkthroughs, not observed user tests. Read the supplied 8:57 screenshot, all four research documents listed below, the existing plan/mockup README, and the scoped recipe/settings implementation. No app code, build, deployment, live account write or coffee trial performed.

## Decision

Opening Espresso should deliver an espresso starting framework immediately. Equipment improves that recipe; it must not determine whether the user is allowed to see one. Put **Add machine** in the recipe, keep espresso equipment accessible in Settings regardless of default brew method, and preserve Aiden as Tal's default.

The screenshot fails a basic human expectation: I asked for a recipe, got three versions of “confirm setup,” and neither available button lets me do that. “Unsupported setup” sounds like my coffee maker cannot use the app. The honest limitation is narrower: the app has no verified machine-specific preset for it.

This changes the old research's presentation rule E01: retain its prohibition on borrowing Breville numbers/controls, but remove its blanket recipe dead end. Generic extraction reasoning does not require the machine brand. Basket capacity still matters for choosing dose.

## Confirmed failure mechanism

- `src/components/SettingsPage.jsx:938` renders the entire espresso setup only when `preferences.brewMethod === 'espresso'`. Owning a machine and choosing a default method are conflated in the UI.
- `src/lib/espressoRecipes.js:56–63` does **not** require Espresso as the default. Its gate requires the confirmation flag, exact Barista Express and stock double single-wall basket, and an allowed grinder category. `resolveEspressoRecipe` at line 205 applies that gate before checking saved recipes.
- `src/components/SettingsPage.jsx:352` resets confirmation on equipment identity changes. The confirmation checkbox at lines 971–980 appears before grinder controls: a user can confirm, then choose an external grinder and unknowingly invalidate confirmation. Merely selecting the machine is insufficient.
- `src/hooks/useEspressoBrew.js:61–68` turns failed eligibility into an error plus setup phase. `src/components/EspressoModal.jsx:36–50` presents heading copy, an error banner and another setup explanation, with only chat/tasting routes. The actual component name is `EspressoModal`, not `EspressoRecipeModal`.
- `src/lib/brewMethods.js:55–79` provides only the verified machine and unknown choice; it also defaults grinder identity to integrated before the user has identified a machine. Generic mode must not inherit that assumption.
- Numeric recipe validation currently hardcodes 16–19 g and Breville temperature semantics (`src/lib/espressoRecipes.js:165`, temperature validation below). Removing a UI gate alone would be wrong: generic user-selected dose and unknown temperature need deliberate representation/validation before implementation.

This establishes the hidden setup UI and narrow eligibility gate. It does not establish that changing the default erases saved equipment, nor that a fully confirmed compatible setup fails solely because Aiden is default. The inspected method-change handler only writes `brewMethod`. Tal's report is consistent with incomplete/invalidated confirmation hidden behind the default, but actual account state was not inspected.

## Smallest interaction

One existing recipe sheet, one compact equipment editor, existing chat and tasting. No setup onboarding, dashboard, timer, shot record or large machine catalog.

### Recipe with no equipment

**Espresso · Mama Cherri**

**A starting point for this coffee**

**Ratio 1:2** — Start with twice as much espresso out as ground coffee in.

**Coffee in** [Choose dose] **Espresso out** [2 × your dose]

Use the dose recommended for your basket, or the dose you already use. [Help me choose]

1. Warm the machine and prepare your basket.
2. Distribute the grounds evenly and tamp level.
3. Weigh the espresso as it brews; stop near your target and taste.

**About 25–30 sec** from machine start to stop is a beginner guide. Taste matters more than hitting the time.

**Add your espresso machine** to tailor basket and machine guidance. [Add machine]

[Ask Ruphus] [Guided tasting]

Source disclosure: **General espresso starting point**. It is an app starting framework informed by the research, not a complete Hoffmann prescription or a machine-tested recipe for this bean. If roast evidence is unknown, do not call it medium. Do not fabricate flavors to make the generic framework look personalized.

The unfilled dose is purposeful. A useful recipe can express a relationship before it knows the absolute quantity. A universal prefilled 18 g is not supported for an unknown basket. An example such as “16 g in → 32 g out” may explain the arithmetic only if clearly conditional; do not persist it or select it by default. Prefer the simple formula to avoid accidental prescription.

### Inline equipment editor

Title **Espresso setup**. Fields: **Machine**, **Basket**, **Grinder**. Machine options: Barista Express, Other machine (name optional), Not sure. Basket options for the verified machine distinguish stock double single-wall, different basket, and not sure. For other equipment allow user-described basket/rated dose without applying Breville constraints. Grinder: built-in if the selected machine has one, external, not sure; optional external model. Preserve the existing general grinder preference.

[Use this setup] persists the chosen espresso equipment and returns to the same bean recipe. This explicit action confirms the selected details in one place; no checkbox can be invalidated by a later field in the same form. Unknown selections are valid states and retain the generic framework. On the verified machine/basket choice, clearly show which basket the user is confirming. Do not silently infer it from the machine.

When the machine is known but basket isn't, the recipe row says **Barista Express · Basket not set [Complete setup]**, rather than asking them to add their machine again. Once complete, **Barista Express · Stock double · External grinder [Edit]** is enough; remove setup marketing and warnings.

Settings shows **Default brew method: Aiden** and a separate **Espresso setup** row at all times. Adding/editing espresso equipment never changes that default. The recipe editor and Settings must read/write the same espresso preferences, not two copies.

## Human walkthroughs

These are role-play expectations, not transcripts or usability results.

| Person | Tap-by-tap experience and human reaction |
| --- | --- |
| Rob, novice with Barista Express | Bean → Espresso → useful ratio/prep immediately. “I can see what I'm trying to make.” Tap Add machine → Barista Express → stock double single-wall **if that is actually his basket** → built-in grinder → Use this setup. For medium/unknown roast, see researched app baseline 18 g / 36 g, with unknown roast still unknown. “Now it knows my setup.” Save; pull shot; Guided tasting. If he cannot identify the basket, Not sure retains the framework and Help me choose asks one useful question. Never force him to falsely confirm just to get past the screen. |
| Tal, Aiden remains default | Open Settings → Espresso setup → select machine/basket/grinder → save. Default still reads Aiden. Open Mama Cherri → choose Espresso → correct configured recipe, no repeated confirmation. Close/reopen: same equipment. Next ordinary Aiden action remains Aiden. Changing espresso grinder edits only espresso context and asks for no Aiden change. |
| Other machine + external grinder | Bean → Espresso → Add machine → Other machine, optional name → basket unknown/known user dose → external grinder, optional name → Use this setup. See general framework, own equipment label, no Breville dial or temperature offsets. Enter the dose they already use or rated basket dose; output calculates at 1:2. Save explicit targets with user-selected dose provenance. Ruphus can discuss taste without claiming the machine has a verified preset. Changing grinder retains no previous numeric dial advice. |
| User returning to saved recipe | Bean → Espresso → previously saved targets and source label, not a freshly regenerated baseline. Ask Ruphus → discuss that exact recipe/bean/setup; “save that change” produces persisted receipt and guarded Undo. New tasting starts empty; old tasting remains unchanged. If current setup differs, show the saved recipe's original setup and offer Use that setup / View recipe; do not silently transfer it to the new grinder or conceal it behind a confirmation wall. |

## Machine knowledge and unknown basket

| Known facts | Appropriate experience |
| --- | --- |
| Verified BES870 + stock double single-wall + actual grinder selected | The existing curated roast baselines and 16–19 g stock-basket limits apply, with machine-specific manual guidance. All exact baseline numbers remain app curation. |
| Known machine, unknown basket | Label the machine; keep generic ratio/prep. Ask for basket/dose only to supply an absolute mass target. No invented stock basket. |
| Other machine, known basket dose | User selects dose; compute output from chosen ratio, label basis, use generic preparation and relative grind guidance. Do not impose 16–19 g or Breville controls. |
| Unknown machine and basket | Show generic framework now; keep dose unset. Help me choose routes to contextual Ruphus, not a required detour. Tasting remains usable with unknown setup and actual measurements unknown. |
| Dual-wall / preground / unusual method | Preserve exact declared context; don't inherit single-wall grinder advice. Use manual/basket dose guidance and contextual help. The general ratio is a starting relationship, not a promised optimal recipe across every device. |

Save concrete targets after the user chooses a positive finite basket-appropriate dose, preserving how that dose was chosen. Leaving dose unknown must not disable reading the framework, chat or tasting. Do not save zero/null as though it were a complete numeric recipe; representing an incomplete framework is distinct from a saved concrete recipe. Unknown equipment can stay unknown, but must not be relabeled confirmed or machine-verified.

## Required continuity

- Explicit recipe context takes precedence over default method in Ruphus and tasting. Passing “espresso” alone is insufficient if the machine/basket/grinder or recipe revision is lost.
- The existing recipe remains the same bean/setup's saved target until explicitly replaced. Generic-to-known setup changes must not silently rewrite old recipe provenance or old tasting snapshots. Offer an explicit adaptation when useful; retain the original.
- Existing `user_saved`, `verified_roaster`, app baseline and original provenance remain distinguishable. A user-selected dose plus generic ratio is not a verified roaster recipe. Any new generic record representation must preserve this distinction.
- Chat advice makes no write. Requested edits share direct-edit validation, persist before success, and preserve revision/idempotency, retry and guarded Undo. Ambiguous “save that” needs clarification.
- New tasting observations start empty. Recipe targets are not actual measurements. Preserve straight/milk context, user notes/scores and immutable recipe/equipment snapshots. AI failure cannot block deterministic tasting/save.
- Keep the current unsaved-edit protection until a deliberate draft handoff exists. Do not solve the setup blocker by letting chat silently use an earlier saved target while the screen shows edits.

## Concrete mockup states to review

1. No equipment: ratio/prep, blank dose, Add machine, chat/tasting; no alert styling.
2. Same sheet after user chooses their basket dose: calculated output and Save recipe, still machine-agnostic.
3. Inline setup: Barista Express and stock basket, integrated and external grinder variants; one commit action, cancel preserves prior state.
4. Aiden remains default: configured espresso recipe plus independent Settings rows, shown side by side in review.
5. Machine known/basket unknown: Complete setup and generic framework, not Add machine again.
6. Other machine/external grinder: own labels and selected dose, no Breville-specific settings.
7. Saved recipe/reopen: same target/source/setup; changed-equipment disclosure and explicit adaptation choice.
8. Requested chat save success/failure/retry/Undo and new tasting retaining original recipe snapshot after later edit.

A clickable prototype should demonstrate these transitions before app code changes. It can use fixtures and simulated persistence, clearly labeled. No claim that current mockup or this role-play proves those new behaviors.

## Evidence used

- [Espresso recipe foundation](espresso-recipe-foundation-2026-10-12/README.md): source ledger H1 dose/basket limits, H2 ratio and beverage mass, H3 timing as guide, H4 grind/channeling, H5 later temperature refinement; B1 BES870 controls and stock basket. Prior source review used original captions/manual, not a physical coffee trial.
- [Beanconqueror logic deep dive](espresso-app-inspection-2026-10-12/BEANCONQUEROR-LOGIC-DEEP-DIVE.md): inspected v8.7.0 separates equipment and preserves contextual records; its inspected paths do not supply a taste-to-recipe generator. Borrow context discipline, not an invented competitor algorithm or its repeat of observations.
- [Android/REA inspection](espresso-app-inspection-2026-10-12/README.md): actual generic machine/external grinder and repeat observations; synthetic fixtures, not coffee quality. Filtru binary acquisition failed.
- [Market/design review](2026-10-12-espresso-market-and-design-review.md): competitors advertise timers/logging/coaching; that does not require expanding this product's scope, establish coaching quality or reveal proprietary logic.
- [Existing plan](../plans/2026-10-12-0920-feat-barista-express-espresso-plan.md) and [mockup README](../mockups/2026-10-12-espresso/README.md): preserve existing flow and save/tasting contracts; their dated approval language is historical, not a finding about current release state.

No new technical espresso fact required fresh web verification; this review uses the provided source research and current local code. Static code evidence explains reachability, not Tal's current account state or deployed-build behavior.

## Novice wording stress test for the revised prototype

Prefer the familiar field label **Coffee in (g)** and placeholder **Your usual dose** over “Basket dose.” The helper can explain basket capacity; do not expect a novice to know the term before seeing value. With no usual dose, Help me choose asks about the basket or its manual; it must not resolve uncertainty by assuming 18 g.

Make Machine the first equipment question; reveal optional Basket & grinder details afterward. **Save equipment** accurately describes saving partial knowledge, whereas “Confirm setup” can imply that unknown basket/grinder fields are verified. A saved machine with optional fields omitted immediately returns to the same useful recipe framework.

Basket wording can start with **Original 2-cup basket**, **A different basket**, **Not sure**, but “original 2-cup” alone is not enough to apply the preset: a supplied basket can be single-wall or dual-wall. Where identifying the preset is needed, distinguish **Single-wall (for freshly ground coffee)** and **Dual-wall (often used with preground coffee)** with a simple faithful visual if available. Do not quiz the user or force a guess. Not sure is an ordinary state, not failure.

A preground/dual-wall branch should omit grinder-adjustment advice and borrowed single-wall grind prescriptions. Use **Follow your machine’s basket and dose guidance** and keep reported context. Do not label preground as an external grinder or promise that freshly ground always implies a single-wall basket. For an unprofiled machine, built-in must be user-declared rather than assumed; optional grinder identity can stay unknown.

An inline Add machine card and compact equipment row can both work. Before equipment exists, the inline card is more discoverable; after equipment exists, replace it with the compact row and Edit/Complete setup. This is one progressive interaction, not two ongoing configuration surfaces competing with the recipe. Limit the card to one sentence and one action so the ratio/preparation remains the main content.

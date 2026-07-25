# Recipe ↔ tasting feedback loop (idea note, not scoped yet)

Date: 2026-07-25
Status: PARKED. Captured during a codebase deep dive. No implementation planned yet.

## The gap

Recipes **are** persisted today (this was mis-stated once during the review, corrected here
so it doesn't get re-litigated):

- `bean.aidenRecipe` + `bean.aidenGrind` + `bean.aidenLink` — `useAidenBrew.js:186`
- `bean.handBrewRecipe` and `bean.handBrewRecipes[device]` (one slot per device) — `useHandBrew.js:138`
- User dose edits persist too — `useHandBrew.js:166` (`persistDose`)

So "reopen the bean and brew it again" already works. Two things are actually missing:

1. **Latest-wins.** Regenerating overwrites the slot for that device. A worse v3 cannot be
   rolled back to v2.
2. **No link between a recipe and a cup.** A tasting record carries `beanId` and nothing
   else. Nothing connects "this recipe" to "this cup scored 4 stars".

And the downstream consequence: `changeTomorrow` (captured by both the wizard,
`tastingWizardSteps.js:144`, and `TastingForm`) is written, displayed back, and read by
**nothing**. `generateHandBrewRecipe(bean, research, preferences, device)`
(`handbrew.js:571`) takes no tasting history. Neither does the Aiden path. Every recipe is
generated as if the user had never tasted the bean.

## Why a brew-event log is the wrong fix

Considered logging brew events to a `brews` collection. Tal's objection kills it:

> Aiden brews aren't really logged, they're done on the Aiden machine.

Correct. The app pushes a profile to Fellow and has no idea whether or when the machine
actually ran. A brew log would either be wrong or need a manual "I brewed this" tap, which
is friction that won't get used.

## The cheaper design: stamp the tasting

When a tasting is saved, stamp it with the recipe that was live on that bean at that moment
(snapshot or version id on the tasting record).

- Zero extra taps
- No new collection
- Method-agnostic: works identically for Aiden and hand brew, because it doesn't care how
  the coffee got made, only what the recipe said and what the drinker thought

Then feed the last 2-3 tastings for that bean, plus their `changeTomorrow` notes, into
recipe generation. `generateHandBrewRecipe` gains a tastings argument; Aiden's gets the
same.

Result: "Last time you said too bright, so this starts 0.3 finer" instead of a recipe
written for a stranger.

## Open thread: chat as the recipe editor

Tal's follow-up, not yet thought through:

> maybe its just within chat — chat has the ability to update recipes if asked to?

Appealing because ChatTab already has the bean context, streaming, and a `RecipeCard`
component (`src/components/chat/RecipeCard.jsx`). "Make it a bit finer and drop the
temp" could write a new version to `bean.handBrewRecipes[device]`.

Needs thinking through before it's a plan:

- **Write authority.** Chat currently reads bean data. Giving it Firestore write access to
  the recipe slot is a real expansion of what a chat turn can do. Needs a confirm step, or
  a proposed-diff card the user accepts, rather than a silent overwrite.
- **Interaction with latest-wins.** If chat can edit recipes, version history stops being
  optional. Overwriting a good recipe via a chat message with no undo would be bad.
- **Which surface owns the recipe?** Today `AidenModal` / `HandBrewModal` own it. Two
  editors on one field needs a clear story.
- **Does it replace or complement the auto-stamp?** The stamp is passive and always-on;
  chat editing is active and occasional. They're probably complementary, but the stamp is
  the one that makes the app compound without the user doing anything.

## Related, weakened by the same Aiden point

Bag-quantity tracking (decrement `bagSize` by each brew's dose) was floated. If Aiden
brews aren't observable, grams remaining can't be tracked automatically either. Manual-only
or skip.

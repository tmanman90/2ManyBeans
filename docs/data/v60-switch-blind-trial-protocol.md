# V60 Switch blind-trial protocol

Status: required before flipping the `v60Variant` default to Switch-available in prod (see `docs/data/v60-switch-shadow-report.md`'s cutover criteria). This is a practical, step-by-step protocol for Tal — you own the physical Hario Switch 03, so these trials can only be run by you, on your own gear, on real coffee.

You are a novice taster. Every step below tells you exactly what to do and exactly what to write down — there are no open-ended "what do you think?" prompts. If a step asks you to rate or describe something, it gives you the specific options to choose from.

## What you need before you start

- Your Hario Switch 03 (360ml), standard V60-03 paper filters, your usual kettle and scale.
- **Three beans from your rotation**, covering these three profiles (pick whatever you actually have in the jar closest to this description — don't buy something special for this):
  1. **Light roast, washed process** (your typical washed African or Central American light roast).
  2. **Natural process** (any roast level — natural, honey, or anaerobic is fine for this slot).
  3. **Medium or dark roast** (whatever's darkest in current rotation).
- The Coffee Hub app open on your phone, with the Switch variant toggle turned ON for the brew (`HandBrewModal` → V60 Switch selector).
- A timer (the app's built-in brew timer is fine and is what you should use — it's part of what's being tested).

## How to run each trial (repeat 3 times, once per bean)

1. **Open the app, select the bean, start a hand-brew session, and pick the V60 Switch variant.** Let the app generate the recipe — do not manually override dose, grind, or timing. This is the exact recipe you're testing.
2. **Before you pour anything, write down the generated recipe** (dose, water, ratio, both temperatures if shown, grind setting, valve-close time, valve-open time, total predicted time). You can screenshot the recipe screen instead of writing it out — either is fine, just keep it with your notes for that bean.
3. **Brew it exactly as generated.** Don't adjust anything mid-brew even if it feels wrong — the point of this trial is to see what the generated recipe actually does, not to rescue a brew. Use the app's timer to follow the steps (pour to X grams, close valve at the stated time, open valve at the stated time).
4. **Record the actual drawdown time** — from when you open the valve (or the app's "open the valve" step fires) to when the bed finishes draining. Compare it to the app's predicted total time.
5. **Taste the brew and log it in the app's tasting wizard** (the step-by-step guided flow, not freeform notes). Answer every prompt the wizard gives you — acidity, sweetness, body, flavor, finish, balance — the same way you would for any other tasting. This gives you a real fingerprint to compare against the app's Switch-specific prediction, if one is shown.
6. **After logging the tasting, answer these four fixed questions** (write your answer next to each — pick one option, don't skip):
   - **Drawdown:** Did it finish (a) faster than predicted, (b) about on-time (within ~30s), or (c) noticeably slower / needed help (e.g. bed clogged, had to swirl or agitate to finish)?
   - **Balance vs. your usual classic-V60 recipe for the same bean:** (a) noticeably better, (b) about the same, (c) noticeably worse, (d) can't compare — first time with this bean.
   - **Any structural problem?** (a) none, (b) valve stuck/leaked, (c) drawdown never finished in a reasonable time, (d) overflowed the server, (e) other — describe in one sentence.
   - **Would you brew this bean with this recipe again as-is?** yes / no / yes with one specific tweak (name the tweak: e.g. "one step finer grind," "shorter steep").

## What to record for each of the 3 trials

Keep a single running note (in the app's notes, or a doc) with, per bean:

- Bean name, roast level, process.
- The generated recipe (from step 2).
- Predicted total time vs. actual drawdown time.
- Your 4 fixed-question answers (from step 6).
- The logged tasting (the wizard record itself — you don't need to re-transcribe it here, just note that it was logged).

## What green-lights cutover vs. triggers parameter revision

After all 3 trials are done, this is a mechanical, not a vibes-based, decision:

**Green-light (ready for Tal's sign-off on the default flip):**
- All 3 trials answered "no structural problem" ((a) on the structural-problem question).
- At least 2 of 3 trials have drawdown "about on-time" or "faster than predicted."
- At least 2 of 3 trials answered "about the same" or "noticeably better" on the balance-vs-classic question.
- No trial answered "no" outright on the "brew again" question (a "yes with one tweak" is fine and expected — note the tweak for the next parameter-tuning pass, but it doesn't block cutover on its own).

**Triggers parameter revision (do not sign off yet — bring the notes back for an adapter change, per the shadow report's §"cutover criteria" item 2):**
- Any trial reports a structural problem ((b), (c), or (d) on that question) — this is a contract/guardrail issue, not a taste issue, and should be treated as more urgent than a sensory miss.
- 2 or more of 3 trials report drawdown "noticeably slower."
- 2 or more of 3 trials report "noticeably worse" balance vs. classic.
- Any trial answered "no" on "would you brew this again."

**Mark unknown, don't guess:** if a trial is skipped, interrupted, or you're not confident in an answer, write "unknown" for that question rather than picking an option to fill the blank. An "unknown" answer cannot count toward green-lighting cutover — it's excluded from the tallies above, the same way the comparator excludes "not stated by source" dimensions from its own tolerance count rather than assuming a match.

No tasting history beyond the normal app tasting-wizard record is read or written by this protocol — it's a handoff format for the existing recipe-provenance and tasting-wizard work, same as the Kalita precedent (`docs/data/kalita-blind-trial-protocol.md`).

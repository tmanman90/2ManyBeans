# Espresso research preview

Research revision, October 12, 2026. Ready for Tal's review; production implementation remains unapproved.

- [Implementation plan](../../plans/2026-10-12-0920-feat-barista-express-espresso-plan.md)
- [Source research, recipe rationale and evaluation cases](../../research/espresso-recipe-foundation-2026-10-12/README.md)
- Local preview: http://127.0.0.1:55704/

Serve `screens/` as a static directory. From the project root:

```sh
python3 -m http.server 55704 --bind 127.0.0.1 --directory docs/mockups/2026-10-12-espresso/screens
```

`index.html` contains the existing embedded art and styles; `preview.js` contains isolated behavior. Fonts load from Google Fonts with local fallbacks. Recipes and tasting notes persist only in this preview's browser storage. There are no app API/model calls, Firebase writes or machine connections. Public source links open only when clicked.

## What to review

1. Open the recipe. Expand **Why this recipe?** for source attribution. Medium-roast targets are 18 g / 36 g. The setup is visibly a sample assumption.
2. **Edit recipe**: change dose in tenths of a gram, output mass, your grinder setting or the supported temperature offset. Save and reopen. Undo restores the previous recipe.
3. **Ask Ruphus → Almost right, slightly sharp** shows a small yield experiment with a body tradeoff. Only **Save this change to my recipe** updates the recipe. Try fast/sour, uneven extraction, slow/delicious and weak-latte messages too.
4. Under **Equipment**, choose an external grinder and optionally name it. Its numbers do not come from the built-in grinder. A different basket/machine shows the unsupported preset state.
5. Complete the existing eight-step tasting, straight or with milk. Save sensory answers and personal notes; leave any unobserved score unrated. Your bean shows the saved tasting. Later recipe edits preserve the old cup's recipe/setup snapshot. A new tasting starts empty.
6. Outside the phone, expand **Review sample coffees & save states** to compare light/medium/dark sample baselines or simulate a failed recipe save. **Reset preview data** removes only this prototype's sample data.

The sample roast targets are explicitly app curation informed by the source research, not complete recipes attributed to Hoffmann, Breville or a roaster. Real taste still decides what to keep. Exact model/basket confirmation and real-coffee trials remain necessary before applying defaults for Rob.

## Verification of this revision

- `node --check screens/preview.js` passed.
- Browser: edited 18→17 g and observed 34 g output; saved grinder 5; reloaded and confirmed persistence.
- Scripted chat: proposed 34→37 g without changing the current targets; injected save failure left 34 g intact; retry saved 37 g; Undo restored 34 g.
- External grinder: retained its name and displayed relative guidance without Breville's numeric suggestion.
- Milk tasting: completed all eight steps; saved Chocolate, Round & smooth, Caramel, two explicit midpoint scores, unrated other scores and a personal next-time note. Editing the recipe to 39 g left the saved tasting's 18/36 reference and external grinder unchanged.
- Unsupported dual-wall setup hid the single-wall recipe and routed to identification.
- Light/dark samples rendered 37.4 g and 32.4 g output respectively.
- Visually checked desktop and 390×844 viewport. At 390 px, document width equals scroll width; no horizontal page overflow. Mobile review navigation scrolls horizontally. Temporary viewport override was reset.
- Browser error log was empty at closeout. QA sample edits/tastings were reset before handoff.

Screenshots: `recipe-preview.jpg`, `chat-preview.jpg`, `mobile-preview.jpg`. The preview tab/server remain available for design review.

## Proof limits and deliberately simplified parts

This demonstrates interaction behavior, not a connected agent, authenticated persistence, server authorization/idempotency, multi-tab concurrency or model quality. Revision checks are local to this preview; the production plan requires server checks. Undo receipts are session-only. Tasting drafts survive route changes in this page, not reloads. The production fingerprint/reveal animation, full existing sensory controls, method correction and draft-exit confirmation are simplified here and remain required by the plan. No production source edit, application build, deployment or physical espresso test occurred.

The source research replaces the earlier provisional recipe rationale. This revision supersedes the earlier mockup's fixed 1:2-only recipe, built-in-only grinder and advice-only chat. Neither the revision nor its checks constitute Tal's design approval.

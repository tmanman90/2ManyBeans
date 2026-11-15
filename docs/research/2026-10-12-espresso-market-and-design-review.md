# Espresso market and design review

Date: 2026-10-12. Follow-up to the Barista Express plan and isolated mockup.

**Later scope decision:** Tal approved adding direct/chat recipe editing and independent machine/grinder choices to the plan. The sections below record the initial desk research; see the updated plan and [Android/REA inspection](espresso-app-inspection-2026-10-12/README.md) for subsequent evidence.

## Recommendation

Keep the proposed first release: bean-specific espresso recipe, machine-aware Ruphus chat, and the existing guided tasting adapted to espresso. Do not add the pour-over timed-step workflow. Display an approximate extraction-time range as recipe guidance. A plain elapsed-time stopwatch could be useful later if Rob needs one; it is not required for this release and should remain optional within the recipe if introduced.

Pour-over timing guides successive actions. For the proposed espresso recipe, preparation happens before extraction; yield and elapsed time help interpret the result afterward. A countdown should not imply that a shot is successful or must stop at exactly 30 seconds. This is a product recommendation, not a claim that competitors avoid espresso timers.

## Competitor evidence

These are advertised capabilities checked on official sites, not hands-on app tests or verified coaching-quality claims.

| Product | Observed offering | Implication for this scope |
| --- | --- | --- |
| [Filtru](https://filtru.coffee/espresso-shot-tracker/) | Espresso dose, yield, time, grind and taste logging; compatible scale capture and shot comparison. Its [espresso introduction](https://filtru.coffee/get-started-with-espresso/) explicitly offers a guided timer. | Closest broad brewing comparison. Timers are a legitimate option, but matching its full tracking workflow would expand our scope. |
| [Beanconqueror](https://beanconqueror.com/) | Customizable brew records, statistics, smart scales and pressure-device integrations across espresso and other methods. | Detailed measurement and equipment support are already well served. They are unnecessary for Rob's requested starting experience. |
| [Espresso Coach](https://espresso-coach.com/) | Advertises machine/grinder-aware coaching from dose, yield, time and taste, with an optional live timer and remembered prior settings. | AI espresso coaching is not unique. Our proposal can ask for useful observations conversationally without requiring a separate shot-entry form. |
| [The Espresso](https://the-espresso.com/) | Advertises AI shot analysis and guided dial-in, including photo input. | Another direct AI-coaching offering; photographic diagnosis quality was not evaluated and is outside our scope. |

This focused scan does not establish market demand, retention, competitive superiority, or the quality of AI advice. The immediate rationale is serving an existing prospective user through the app's familiar bean/recipe/tasting flow.

## Mobbin research

Searched iOS flows for “Coffee brewing app choosing an espresso recipe and following a brew timer,” and screens for “Filtru espresso recipe with dose yield and shot timer.” Returned previews were visually inspected. Neither search surfaced a direct espresso-app example; this is a search limitation, not proof that Mobbin has no relevant coverage.

- [Crouton: Starting a timer from recipe detail](https://mobbin.com/flows/1408fea8-a7c7-466e-be75-318d62d37154): tap an inline recipe duration to start a compact floating countdown while retaining the recipe. Useful adjacent pattern if optional timing is added later.
- [Crouton: Starting a timer](https://mobbin.com/flows/15e9d03d-1c51-4ecc-86f2-9492d29bdb04): focused cooking steps retain a compact timer overlay.
- [CREME cooking screen](https://mobbin.com/screens/8c81fef2-1a01-402d-a42b-0b43d8315db9): a timer chip and Help sit alongside the current instruction. Useful for making assistance accessible without making timing the entire interface.

These cooking references inform placement and hierarchy only. They do not validate an espresso workflow or demonstrate the espresso competitors' actual interfaces.

## Mockup implications

Keep the current recipe parameters, concise preparation guidance, Ask Ruphus and Taste this coffee actions. No timer is added. Keep recipe time clearly labeled as a target, never a measurement. Ruphus should distinguish a user's sensory observation from a diagnosis: ask a useful follow-up and suggest one next adjustment rather than mechanically mapping sour to finer or bitter to coarser.

The original mockup preceded this market/Mobbin research. This review supports its small scope; it does not approve production implementation.

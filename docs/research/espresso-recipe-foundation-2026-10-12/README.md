# Espresso recipe foundation

Research completed October 12, 2026. Scope: source-grounded starting recipes and Ruphus advice for the proposed Barista Express experience. This is a content/design specification, not production implementation or a claim of tested cup quality.

## Recommendation

Keep the existing bean → recipe → chat → guided tasting experience. Precision belongs in the recipe's units, equipment constraints, source attribution and advice—not a new shot dashboard. Give Rob a useful first recipe, then keep the changes he likes. No source can establish the best grind setting for his particular bag and grinder without brewing it.

The starter below is a curated app recipe. Hoffmann supplies the reasoning; Breville supplies operating constraints. Neither publishes this exact complete recipe for Rob's coffee. A compatible, verified espresso recipe from that coffee's roaster should take precedence when creating a recipe. A recipe the user has already saved must not be silently replaced.

## What was actually reviewed

Read the English captions downloaded directly from all five original James Hoffmann videos below, including the surrounding explanations, and the relevant English pages of Breville's current US/Canada BES870 manual. Downloaded the PDF and visually checked the basket and extraction diagrams. This was caption/document review, not watching every frame or physically testing the machine. Auto-captions contain transcription errors; timestamps locate the underlying original recording. The source receipt records file hashes; raw downloads remain in ignored `work/` for rechecking and are not republished.

The existing local `world-atlas-coffee.md` is a structured extraction, not a page-cited copy of the book. It remains useful background. We cannot claim a particular edition/page or that every paraphrase faithfully represents the book. The original videos resolve several overly compressed rules in those notes and in `src/lib/coffeeKnowledge.js`.

### Primary source ledger

| ID | Source / passage | Finding used in this proposal |
|---|---|---|
| H1 | [Dose, 03:44–05:05; 05:44–09:03](https://www.youtube.com/watch?v=aTFsBqhpLes&t=224s) | Basket capacity constrains dose. Lighter coffees can benefit from a smaller dose; greater dose is not inherently better. Hold dose steady during initial dialing. Small dose changes can help near a good result. A soupy puck alone does not diagnose extraction. |
| H2 | [Ratio, 00:45–02:23; 03:42–05:19; 06:54–08:29](https://www.youtube.com/watch?v=F4wrUP4c5P4&t=414s) | Weigh beverage output; crema makes volume unreliable. Longer yield generally increases extraction while reducing concentration/body. His own starting preference is roughly 1:2–1:2.2, not a universal law. Near a good result, he gives 36→39 g as a small refinement example. |
| H3 | [Time, 00:23–05:35; 07:15–09:22](https://www.youtube.com/watch?v=hQaV3w_XNiw&t=23s) | Time is an observed result. His convention is machine start to stop. 25–30 seconds is beginner guidance, not a quality gate; good shots can fall outside it. First-drip timing and unusual pre-infusion need explicit context. |
| H4 | [Grind, 00:51–02:27; 03:27–05:44; 05:46–08:00; 09:04–10:59](https://www.youtube.com/watch?v=er2voEn8ZDU&t=346s) | Finer grind changes both surface area and flow; excessively fine grinding can promote uneven extraction. Use grind for larger corrections, then finer recipe adjustments near balance. Change one flow-related variable at a time. Retention/purging is grinder-dependent. Sourness plus a harsh finish can accompany channeling. |
| H5 | [Temperature, 04:23–07:47; 09:20–09:55](https://www.youtube.com/watch?v=QAzE-_ocf1U&t=263s) | Temperature is usually a later refinement after repeated results, not the first reaction to one sour cup. He gives broad roast-dependent ranges, including dark 85–90°C, medium 88–92°C, light 90–95°C, and discusses changes of at least 1°C. These are general preferences, not BES870 settings. He commonly starts from roaster guidance. |
| B1 | [BES870 US/Canada manual, X26, printed pp. 12–20](https://assets.breville.com/BES870/BES870_USCM_IB_X26_LR.pdf) | Initial built-in dial 5, lower=finer (p12). Stock double approximately 16–19 g (p18). Single-wall/fresh grinding versus dual-wall/preground (p17). Warm equipment/dry basket (p17), brief group flush (p14). Pressing again stops a preset shot (p14); holding changes pre-infusion (p15). Temperature offsets −4/−2/0/+2/+4°F (pp16–17), without a stated absolute default there. Timing chart 25–30 sec (p20). |

Do not import the general H5 temperature ranges into machine controls. In particular, an 85°C dark-roast suggestion is not established as available on this preset. No fixed warm-up duration, exact pressure at the puck, guaranteed built-in dial, or universal purge mass was established.

## Conflicts resolved before build

| Existing shorthand / conflicting evidence | Adopted interpretation |
|---|---|
| Local notes and shared knowledge say 27–29 seconds | Use H3's broader beginner guide, with taste taking priority. Do not classify a 31-second delicious cup as failed. |
| Shared knowledge says always adjust grind first | H2/H4 explicitly allow small yield refinements near balance. Replace the absolute instruction in the active shared prompt, not merely append a contradictory new paragraph. |
| Manual volume presets versus a mass recipe | Button volume is not beverage mass. Do not equate a double-button preset with the target grams. H2 governs recipe measurement; B1 governs button operation. |
| Manual p18 gives first flow 4–7 sec; p20 gives 8–12 sec | The manual conflicts internally. Omit an automatic first-drop deadline and do not add either interval to the total-time guide. |
| Wet-puck shortcut in manual chart versus H1 | Puck appearance alone is insufficient. Ask about taste/flow; do not tell users to grind finer solely because the puck is wet. |
| Manual extraction chart and bitter/sour labels versus H4 | Use chart symptoms as possible clues, not a diagnosis. Uneven extraction can produce mixed sensations. |
| General temperature recommendations versus actual controls | Begin at machine default unless compatible evidence/user settings say otherwise. Store supported offset with unit, not an invented absolute temperature. |
| Local notes contain general freshness and extraction percentages | Do not turn them into expiry dates, measured extraction yield, or automatic recipe changes. No TDS measurement means extraction percentage is unknown. |

## Proposed curated starting recipes

Applies only to a confirmed standard BES870, stock double single-wall basket, freshly ground coffee and a compatible espresso grinder. The machine/basket in the preview are explicitly sample assumptions until Rob confirms them.

| Coffee evidence | Coffee in | Espresso out | Ratio | Why this proposed starting point |
|---|---:|---:|---:|---|
| Medium roast, or insufficient roast evidence | 18.0 g | 36.0 g | 1:2 | Simple initial reference within the researched framework. Unknown roast must be labeled unknown, not guessed medium. |
| Clearly identified lighter roast | 17.0 g | 37.4 g | 1:2.2 | App synthesis: a little less coffee to extract, with a somewhat longer ratio. Exact numbers are our curation, not a Hoffmann published recipe. |
| Clearly identified darker roast | 18.0 g | 32.4 g | 1:1.8 | App synthesis: explore a shorter, more concentrated cup. This can become sour if insufficiently extracted; it is not a guaranteed dark-roast optimum. |

These are three fallbacks within one recipe experience, not three additional modes. Decaf, unusual processing and origin alone do not justify another exact-number formula. Do not infer roast from the word “espresso” on the bag. Verified roaster guidance and the user's taste can override these choices within the supported equipment envelope. Real-coffee evaluation must precede calling these recipes validated.

All start with machine-default temperature and a roughly 25–30 second guide from button press, including pre-infusion. Show time as a guide, not an instruction to stop regardless of yield. The integrated grinder's manual start setting is a fallback suggestion only; an established user setting is more useful. External grinders retain their own identity and settings; otherwise use relative espresso guidance without inventing a dial number.

### Preparation in the recipe

Keep three short steps: warm/prepare and weigh the dry-basket dose; distribute evenly and tamp level; weigh output, stop near target and taste. Follow the relevant machine manual for controls. For the sample preset, use the normal double-button cycle and press again to stop near target; keep pre-infusion consistent. If an altered programmed cycle stops too early, consult manual shot control rather than top up with an unrecorded second extraction. Do not promise exact stopping weight: lag/drips vary. Repeat consistently and report actual output when known. Stir and sip at a comfortable temperature; no cupping crust or four-minute wait.

## Source and personalization rules

These rules are product decisions informed by the sources; they are not claimed as a competitor algorithm or verbatim author guidance.

| Rule | Input and decision | Exceptions / required behavior |
|---|---|---|
| E01 Setup eligibility | Machine, region/manual, basket, grinder and user confirmation | Only the verified preset gets its limits/control copy. Other machines and baskets retain chat/tasting, but no borrowed Breville numeric preset. |
| E02 Source selection | Existing user-saved recipe first; otherwise verified compatible roaster espresso guidance; otherwise labeled app baseline | Do not reinterpret a pour-over ratio or another coffee's recipe. Store URL, quote locator, method, units, attribution and access date. A dose-scaled roaster recipe is an adaptation; preserve the original separately. |
| E03 Dose and ratio | Dose/yield are mass targets. Compute ratio = output/dose; display consistently | Positive finite values; v1 stock dose editor 16.0–19.0 g in 0.1 g steps. The product's supported range is not a universal physical minimum. Dose changes preserve chosen ratio and recalculate yield to 0.1 g; yield edits recalculate ratio. Preview's supported ratio range 1:1–1:4 is a reviewable product guardrail, not a quality assertion. |
| E04 Grinder | Use current model and user setting; numeric defaults only when supported | No cross-grinder conversions. Changing grinder selects a distinct setup recipe, clears unrelated numeric advice, and does not migrate tuning automatically. Burr calibration differences defeat universal dial precision. |
| E05 Timing | Guide has a basis; reported time stores its own basis | Do not subtract guessed pre-infusion or convert first-drip to start-button timing. Time/target values never become observations by default. |
| E06 Advice evidence | Resolve bean, cup, recipe revision, drink and any volunteered measurements | Advice alone never writes. Ask only the missing detail that changes the recommendation. No score-to-grind formula. |
| E07 Gross flow correction | Clearly fast+sour with even flow: try slightly finer at fixed dose/yield. Restricted flow: check dose/prep and consider coarser | Spraying, uneven flow or sour+dry/bitter finish first raises uneven-extraction questions. No universal one-click or purge-mass guarantee. |
| E08 Near-balanced refinement | Slight sharpness with otherwise even, close result: try a small yield increase; excessive bitterness can justify a small reduction after checking roast/flow | Explain concentration/body tradeoff. 36→39 g is an illustrative H2 example, not an unconditional +3 g engine. Taste determines whether to keep it. |
| E09 Later refinements | Persistent pattern after controlled trials: consider supported temperature offset, or small basket-compatible dose adjustment | Change one variable at a time; avoid attributing causation to one good cup. Temperature/pressure capabilities must be confirmed first. |
| E10 Drink interpretation | Straight espresso versus finished milk drink | Milk changes sensory experience. Preserve observations but do not map milk sweetness/body to pure-bean preference. Weak latte can mean milk proportion; do not automatically alter extraction. |
| E11 Save and reuse | Explicit save request, exact bean/setup, expected revision, validated fields | Persist before claiming success. Provide changed values, View recipe and guarded Undo. Keep source baseline and user adjustments distinguishable. Reuse targets, never prior ratings/time/notes. |
| E12 Tasting record | Existing eight steps, scores and personal notes, plus immutable cup snapshot | Snapshot means recipe associated with the cup, not proof targets were hit. Correct setup/method before starting; retain unknown actual measurements. A later recipe edit cannot alter saved tasting context. |

### Proposed conversational examples

- **“Sour.”** Clarify sharp unpleasant sourness versus enjoyable brightness, and straight versus milk where unknown. Ask about flow or actual dose/yield only if helpful. No immediate write or diagnosis.
- **“18 in, 36 out, 16 sec from button press, sour, even flow, built-in at 5.”** Suggest trying 4 while keeping 18/36. That number is a relative step from a reported setting, not a predicted ideal. User must request save.
- **“18 in, 36 out, 28 sec, even and nearly good, just slightly sharp.”** Propose trying 39 g at the same dose/grind, explaining the lighter body. A later “save that” saves 39 g; it does not pretend the user brewed it yet.
- **“Sour, drying and suddenly gushes late.”** Discuss distribution/channeling; finer is not automatically the answer. Ask about preparation and whether the problem appeared after moving finer.
- **“40 sec but delicious.”** Keep what the user likes; do not force it into the starting-time window.
- **“No scale.”** Continue chat/tasting; explain that a mass recipe is approximate without measuring. Never create measured dose/yield from a button label.

## Build evaluation cases

These are acceptance oracles for the later production implementation, not claims that a model has passed them. Source fixtures and live conversations both matter.

| Case | Expected result |
|---|---|
| Medium / light / dark sample | Three baseline rows above; exact synthetic numbers labeled app choices |
| Unknown roast or roast inferred from origin | Neutral fallback; no invented roast or flavors |
| Verified roaster 20 g / 44 g on this basket | Identify dose mismatch; offer clearly labeled compatible adaptation, not unchanged verified recipe |
| Only roaster V60 evidence | No espresso recipe attribution |
| Dose 18→17 at 1:2 | Yield 34; ratio remains 1:2 |
| Yield 36→39 at 18 g | Ratio displays about 1:2.17; no water-input relabeling |
| Dose 20, zero/negative/NaN, contradictory fields | Reject with helpful correction; no partial save |
| Dual-wall, single basket, Impress or unknown machine | No standard single-wall BES870 preset applied |
| External grinder without documented scale | Relative guidance, no retained Breville 5 |
| Same grinder model, different calibration | Treat absolute start number as tentative |
| 16 sec from first drip | Ask/retain basis; no invented total |
| Sour with no measurements | Clarification, no fabricated fast shot |
| Fast/sour/even versus sour/dry/uneven | Distinct recommendations; no blind finer loop |
| Near-balanced slight sharpness | Small yield experiment with body tradeoff is allowed |
| Slow and delicious | No mandatory correction |
| Wet puck only | No extraction verdict |
| Persistent bitter taste on dark roast | Consider roast/cleanliness/flow; later supported temp option |
| Request 85°C on BES870 | Do not invent an available setting |
| Missing scale or milk added | Preserve uncertainty and drink context |
| “Would finer help?” versus “save this setting” | Only second mutates recipe |
| Failed save, stale request, duplicate tool call | No false receipt or overwrite; idempotent server behavior |
| Undo after newer edit | Refuse stale undo |
| Recipe edited after saved tasting | Old snapshot and notes unchanged |
| Repeat recipe | New empty observations; no copied score/time |
| AI unavailable | Deterministic guided tasting remains usable |
| Shared old 27–29 / always-grind-first prompt | Contradictory path removed or properly scoped before launch |

## Readiness and remaining evidence

Source research is complete for this narrow proposal. The source-linked specification and interactive mockup are ready for Tal's design review. The build still needs production validation, prompt evaluation and the already-required design approval. Rob must confirm his exact model/basket before real equipment defaults are applied. A hands-on trial should compare each relevant baseline against taste, repeat the preferred change, and record actual dose/yield/timing basis/setup with the existing tasting flow. This is the evidence needed to call a recipe successful for his coffee—not another app feature.

No broader pour-over rule changes are authorized here. The competitor deep dive remains separate product evidence: [Beanconqueror logic](../espresso-app-inspection-2026-10-12/BEANCONQUEROR-LOGIC-DEEP-DIVE.md).

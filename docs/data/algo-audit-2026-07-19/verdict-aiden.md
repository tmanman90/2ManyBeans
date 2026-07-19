## Verdict table

Evidence shorthand: `A` = `src/lib/aiden.js`; `IC` = `internal-claims.md`; `EE` = `external-evidence.md`.

| Parameter / rule | App value | Verdict | Key evidence | Severity |
|---|---|---|---|---|
| Ratio — washed floral | 1:17–17.5 | VALIDATED | Fellow light 1:16–17; Hoffmann 1:16.7; filter range extends to 1:18 (`IC§1`, `EE§1/§2/§7`) | low |
| Ratio — Kenya clarity | 1:17 | VALIDATED | Light consensus 1:16–17; BrewCommons applies +0.5 for Kenya (`EE§6/§7`) | low |
| Ratio — washed Ethiopia | 1:17 | VALIDATED | Same light-roast consensus; April Regessa is 1:16.7 (`EE§1/§7`) | low |
| Ratio — clean natural | 1:17–17.5 | ADJUST -> 1:16.5–17.0 for new recipes only; saved recipes unchanged | Equator natural is 1:16.5; BrewCommons natural reduces light base to 1:16.5; most natural references are 1:15–16.5 (`EE§1/§6`; `A:294-319`) | med |
| Ratio — processed clarity | 1:17–17.5 | CONFLICTING-EVIDENCE | BrewCommons keeps light honey/anaerobic near 1:17, but six reference profiles use 1:14.5–16 (`EE§6`; `A:323-339`) | med |
| Bloom ratio — washed floral/Ethiopia | 3× | VALIDATED | Fellow light default 3×; light consensus 2–3×, commonly 3× (`IC§3`, `EE§1/§7`) | low |
| Bloom ratio — Kenya | 2.5–3× | VALIDATED | Inside light consensus and mainstream Aiden range (`IC§3`, `EE§1/§7`) | low |
| Bloom ratio — natural/processed | 2.5× | VALIDATED | Reference recipes and general light guidance span 2–3× (`IC§3`; `A:294-339`) | low |
| Bloom time — washed families | 40–55s | CONFLICTING-EVIDENCE | 45s is well supported, but Fellow/Equator examples use 35s while practice spans 30–60s (`IC§3`, `EE§1`) | low |
| Bloom time — clean natural | 45–50s | ADJUST -> 35–45s baseline for new recipes only; saved recipes unchanged | Equator natural 30s, Fellow Regessa 35s, BrewCommons natural about 40s; references span 20–45s (`EE§1/§6`; `A:294-319`) | med |
| Bloom time — processed clarity | 45–55s | CONFLICTING-EVIDENCE | Processed references range 30–60s; BrewCommons adds time for anaerobic but not honey (`A:323-339`, `EE§6`) | low |
| Bloom temp — washed families | 94–96°C | VALIDATED | Strong light-roast consensus is about 96°C; lighter roasts require more extraction energy (`IC§2`, `EE§1/§7`) | low |
| Bloom temp — clean natural | 92–94°C | ADJUST -> 94–96°C baseline for new recipes only; saved recipes unchanged | Equator natural is about 94.4°C, BrewCommons natural about 95°C, Fellow Regessa 96°C; most natural references are 95–99°C (`EE§1/§6`; `A:294-319`) | med |
| Bloom temp — processed clarity | 92–93°C | CONFLICTING-EVIDENCE | BrewCommons only lowers honey/anaerobic slightly, but exact processed references span 88–96°C; intensity matters too much for one narrow band (`EE§6`; `A:323-339`) | med |
| Single-serve pulse count | Usually 3 | VALIDATED | Internal Aiden default and official recipes use 3; Equator uses 2–3, Fellow light snippet uses 4 (`IC§4`, `EE§1`) | low |
| Batch pulse count | Usually 4; repair fallback 3 | CONFLICTING-EVIDENCE | App contradicts itself; evidence ranges from 1 default to 3 Equator, 5 Fellow light, and 1–7 references (`A:179-181,449`; `IC§4`, `EE§1`) | med |
| SS intervals — washed | 20–25s / 22–25s | CONFLICTING-EVIDENCE | Internal default and many references support 20–23s, but Fellow snippet and Equator washed use 30s (`IC§4`, `EE§1`; `A:257-290`) | med |
| SS intervals — natural/processed | 25–30s | VALIDATED | Equator natural uses 25s; reference and internal ranges center on 25–30s (`IC§4`, `EE§1`; `A:292-339`) | low |
| Batch intervals | 28–35s by family | UNVERIFIED | Direct examples span 20–45s, including Equator large batch at 40s; no strong universal batch band (`EE§1`; `A:257-373`) | low |
| Washed enforcement scope | Every “washed” bean forced to ratio ≥16.5 and SS interval 20–25s | ADJUST -> apply only to light washed clarity families and permit exact roaster/profile overrides; new recipes only, saved recipes unchanged | Comment says “light washed,” but `isWashed()` ignores roast; dark consensus is 1:15–15.5 and 25–30s (`A:413-419,505-510`; `EE§7`) | high |
| Kenya hard override | ≥1:17, bloom ≥2.5×/40–55s, interval 20–25s | ADJUST -> make these defaults, not hard overrides when an exact sourced recipe exists; new recipes only, saved recipes unchanged | Kieni and Kapsokiso references use 1:15.5 and blooms of 2×/1.5×; Kapsokiso uses 40s intervals (`A:265-266,286-290,512-518`) | high |
| Light pulse-temperature curve | Decline 0.5–1.5°C per pulse under “MANDATORY” rules | ADJUST -> allow flat as the default; use a gentle decline only from exact guidance or late-harshness risk; new recipes only, saved recipes unchanged | Of 23 explicitly light references, 16 are flat, 6 declining, 1 non-monotonic; Equator says constant, cached Fellow snippet says declining (`A:141-148,257-347`; `EE§1`) | high |
| Batch curve | May decline more steeply | UNVERIFIED | No direct source establishes that batch must decline more; reference batch curves include flat, declining, and single-pulse programs (`A:257-373`) | med |
| Dark curve | Flat acceptable | VALIDATED | Most dark/medium references are flat; low, constant temperature matches dark-roast extraction guidance (`IC§2`; `A:349-373`) | low |
| Density handling | More early energy; do not automatically change grind | CONFLICTING-EVIDENCE | Light/high-density coffee benefits from energy, but Atlas says higher-altitude coffee also commonly needs finer grind; deterministic code itself nudges finer within the band (`IC§5`; `A:150-154,479-484`) | med |
| Late in-peak age adjustment | Ratio +0.5 | ADJUST -> no automatic numeric change; react to tasted strength/extraction; new recipes only, saved recipes unchanged | Evidence defines freshness windows but gives no quantitative ratio shift (`IC§7`; `A:117-122`) | med |
| Fading/past-peak adjustment | Ratio +0.5–1, bloom +0.5, early temp +0.5–1.5°C | ADJUST -> zero automatic shifts; use taste/flow evidence per bean; new recipes only, saved recipes unchanged | No cited source supports these numbers; evidence instead supports a larger/longer bloom for *fresh* light coffee because of CO₂ (`IC§7`) | high |
| Stale adjustment | Ratio +1–1.5, bloom +0.5, maximum early energy, shorter intervals | ADJUST -> zero automatic shifts; flag staleness and tune by taste; new recipes only, saved recipes unchanged | No evidence shows that more heat/water restores lost aromatics or universally improves stale coffee (`IC§7`; `A:120`) | high |
| Schema — ratio | 14–20, 0.5 steps | UNVERIFIED | References occupy 14–18 and BrewCommons clamps 14–18; evidence does not establish Aiden’s device maximum (`A:425`; `EE§6`) | low |
| Schema — bloom ratio | 1–3, 0.5 steps | UNVERIFIED | Aiden references use 1.5–3; no supplied evidence validates 1× as a useful/device limit (`A:427,257-373`) | low |
| Schema — bloom duration | 1–120s | UNVERIFIED | Aiden evidence clusters around 20–60s; 120s exists only as broader manual-bloom practice (`A:428`; `IC§3`, `EE§6`) | low |
| Schema — temperatures | 50–99°C | CONFLICTING-EVIDENCE | Aiden Profiler claims device-valid 50–98.5°C, while several app references use 99°C (`EE§3`; `A:280-284,429-456`) | high |
| Schema — pulse count | 1–10 | UNVERIFIED | Reference maximum is 7; competitor algorithm clamps at 6; no evidence validates 8–10 (`A:438-456`; `EE§6`) | low |
| Schema — interval | 5–60s | UNVERIFIED | Supplied Aiden examples occupy roughly 20–45s; 5–19 and 46–60 are unsupported (`A:257-373`; `EE§1`) | low |
| Temperature-array length | Must equal pulse count | VALIDATED | Required structural consistency; repair pads/truncates arrays accordingly (`A:440-456`) | low |
| Bloom temperature half-step | Prompt requires 0.5°C steps; repair only clamps | ADJUST -> snap bloom temperature to 0.5°C for new recipes only; saved recipes unchanged | Direct prompt/enforcement mismatch (`A:61,429`) | med |
| Missing temperature fallback | Pad with bloom temperature | CONFLICTING-EVIDENCE | Produces a flat curve despite the prompt’s mandatory-decline framing (`A:141-148,440-456`) | med |
| Grind band — washed floral | SS 3.2; batch 5–6.2 | CONFLICTING-EVIDENCE | Aiden-finer-than-pour-over theory supports a fine band, but Fellow’s light start is 4.2 and reference ranges vary widely; singleton SS is weakly supported (`IC§5`, `EE§1`; `A:257-290`) | low |
| Grind band — Kenya | SS 3–3.2; batch 5.1–6.2 | VALIDATED | Kieni and Kapsokiso include SS 3–3.2; batch values are plausibly coarser (`A:265-266,286-290`) | low |
| Grind band — washed Ethiopia | SS 3.2; batch 5–6.2 | CONFLICTING-EVIDENCE | Wonderstate supports 3.2, but Telila uses SS 5.1–6/batch 7–8.2 and Fellow’s general light start is 4.2 (`A:271-278`; `EE§1`) | med |
| Grind band — clean natural | SS 4.2; batch 6.2 | VALIDATED | Matches Fellow’s light starting point; Regessa guidance spans SS 3–4 and batch 5.2–7.2 (`EE§1`) | low |
| Grind band — body natural | SS 5; batch 6.2–7.2 | UNVERIFIED | No supplied external or exact-profile evidence isolates body-forward Pacamara/Maragogipe as a band (`A:23`) | low |
| Grind band — processed | SS 4.2–5; batch 6.2–7.1 | VALIDATED | Plausible against Fellow light/medium starts and the processed reference spread (`EE§1`; `A:321-339`) | low |
| Grind band — generic washed | SS 4.2–5.2; batch 6–7.2 | VALIDATED | Aligns with Fellow’s light/medium starting points and coarser batch principle (`EE§1`, `IC§6`) | low |
| Grind band — medium washed | SS 5–5.2; batch 6–8 | VALIDATED | Fellow medium start is 5.0; reference batches span 5–8 (`EE§1`; `A:349-358`) | low |
| Grind band — dark | SS 5–9; batch 6–9.2 | VALIDATED | Fellow dark start is 5.1; dark references reach SS 9/batch 9.2 and darker beans may need coarser grinding (`EE§1`; `IC§5`; `A:360-367`) | low |
| Profile spot-check — Kieni AB | 1:15.5, 2×/40s/94°C, flat 3×23s | CONFLICTING-EVIDENCE | Plausible historical profile, but current Kenya enforcement rewrites both ratio and bloom; it also disproves universal decline (`A:265-266,512-518`) | high |
| Profile spot-check — April Regessa | 1:16.5, 3×/45s/96°C, flat 3×20s | VALIDATED | Same-coffee Fellow guide supports about 1:16.7 and 96°C; its manual bloom is shorter/smaller, but Aiden adaptation remains plausible (`EE§1`; `A:294-295`) | low |
| Profile spot-check — Equator Mae Chedi | 1:16, 3×/35s/92°C, non-monotonic pulses | UNVERIFIED | Falls within processed-reference variation, but no exact external numeric corroboration was supplied (`A:323-324`) | med |
| Profile spot-check — Loquat Finca Inés Geisha | 1:16, 2×/30s/92°C, two flat pulses | CONFLICTING-EVIDENCE | Ratio/bloom are plausible, but 92°C conflicts with high-temperature light/Geisha guidance; no semi-washed comparator resolves it (`IC§2/§3`; `A:343-344`) | med |
| Profile spot-check — Intango Dark | 1:17, 2.5×/45s/96°C, pulses 94.5°C | CONFLICTING-EVIDENCE | Much hotter, longer, and more dilute than dark consensus of roughly 1:15–15.5, 91°C, 2×/25–30s; retain only as an exact-profile exception (`EE§7`; `A:360-361`) | med |
| Profile spot-check — Methodical Oscuro | 1:15, 2×/30s/92.5°C, flat 92°C | VALIDATED | Closely matches dark consensus for ratio, bloom, low temperature, and flat curve (`EE§7`; `A:363-364`) | low |

## Top 5 issues

1. **Declining temperature is incorrectly elevated to a mandate.** Most explicitly light profiles in the app’s own corpus are flat, and the deterministic repair neither checks monotonicity nor constructs a decline.

2. **Roast-age compensation is unsupported.** The fixed ratio, bloom, temperature, and timing deltas have no quantitative support in the supplied research; the only well-supported CO₂ adjustment concerns fresher light coffee.

3. **Washed/Kenya enforcement is overbroad.** `isWashed()` ignores roast level, so medium and dark washed coffees inherit light-clarity constraints, while exact Kieni/Kapsokiso references are forcibly rewritten.

4. **Clean-natural defaults skew too dilute, too cool, and too long-bloomed.** Direct natural examples cluster around 1:16.5, 94–96°C, and 30–40s rather than the app’s upper 1:17.5, 92°C, and 50s edges.

5. **Batch behavior lacks a coherent source of truth.** The prompt says “usually 4,” repair defaults to 3, and supplied evidence supports anything from 1 to 5 depending on roast and volume.

## Declining-temperature adjudication

**Who is right:** Equator is right that valid Aiden recipes can use constant pulse temperatures; the Fellow help-center snippet is right that declining programs also exist. Neither supports a universal rule. The direct Equator page is stronger than the cached help snippet for its specific recipes, while the app’s purported Fellow corpus is decisive against universality: among 23 explicitly light profiles, **16 are flat, 6 decline, and 1 is non-monotonic**.

**Brewing theory:** Each incoming pulse reheats a bed that cools between pulses, so constant programmed water temperature does not produce a thermally constant slurry. Light roasts are less soluble and commonly benefit from sustained high temperature. A gentle decline can be useful when controlling late harshness in a soluble or heavily processed coffee, but “acids and sugars early, bitter compounds late” is too simplistic to justify applying it to every light roast.

**Conclusion:** The mandate is not justified. Flat or exact-roaster temperatures should be acceptable defaults; decline should be an optional, conservative tuning tool, and batch should not automatically decline more steeply. This recommendation applies only to newly generated recipes; Tal’s existing saved recipes should remain untouched.

Codex session ID: 019f7b0d-a137-7c43-89e3-c6bb86f31314
Resume in Codex: codex resume 019f7b0d-a137-7c43-89e3-c6bb86f31314

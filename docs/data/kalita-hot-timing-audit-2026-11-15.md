# Kalita hot recipe audit (2026-11-15)

Question from Tal: are the recipes still right, do big Kalita doses really get two pours, and does the 30 second bloom include the pour?

## What the app did before this change (`kalita-rules-v3-phase1`)

| Profile | Example | Bloom | Pours after bloom | Total target shown |
| --- | --- | --- | --- | --- |
| 155, 12-18g | 15g / 240g | 45g, next pour at 0:30 | 2 | 4:00 (3:35-4:20) |
| 155, 19-20g | 20g / 320g | 60g, 0:30 | 2 | 4:45 |
| 185, 15-22g | 20g / 320g | 60g, 0:30 | 2 | 5:00 (4:35-5:20) |
| 185, 23-30g | 30g / 480g | 90g, 0:30 | 2 (last pour 264g) | 6:30 (6:05-6:50) |
| 185, 31-36g | 36g / 594g | 108g, 0:30 | 2 (last pour 327g) | 6:30 |

## Published Wave recipes

From `src/data/manualSources/kalita.js` (primary sources checked 2026-09) plus pages re-read 2026-11-15.

| Source | Size | Dose / water | Bloom (from first water) | Pours after bloom | Total |
| --- | --- | --- | --- | --- | --- |
| Ozone | 155 | 15 / 250 | 50g, 0:30 | 2 | 2:30-3:00 |
| Drop Coffee | 155 | 16 / 260 | 40-50g, rest 20-30s | 4 | 2:45-3:00 |
| Foundation | 155 | 16 / 260 | 32g, 0:30 | 1 | 2:40 |
| Kurasu | 155 | 14 / 200 | 30g, 0:40 | 2 | 2:05-2:15 |
| Fuglen | 155 | 15 / 250 | 40g, 0:40 | 2 | 2:00-2:30 |
| Onyx (Sidra) | 185 | 20 / 310 | 60g, 0:45 | 2 | 2:45 |
| Madcap | 185 | 21 / 355 | 50g | about 5 | 3:00-4:00 |
| Onyx (Monarch) | 185 | 25 / 400 | 50g, 0:30 | 5 | 3:30 |
| George Howell | 185 | 25-28 / 390 | 65g pulse | 5 | 3:30 |
| Irving Farm | 185 | 25 / 400 | 70g, about 0:45 | 1 | 3:00-3:30 |
| Drop Coffee | 185 | 30 / 500 | 70-80g, rest 20-30s | 4 | 3:45-4:00 |
| Ozone | 185 | 30 / 500 | 100g, 0:30 | 2 | 3:30-4:00 |
| Sample Coffee | 185 | 30 / 500 | 90g, 0:45 | 2 | 3:00-4:00 |

Every source that states a clock starts it at the first drop of bloom water, so the bloom pour is inside the bloom window (Hoffmann's V60 method counts the same way).

## Findings

1. **Total time was far too long.** Every published Wave recipe finishes between 2:00 and 4:00. The app aimed at 4:00-6:30 and told the user to grind finer if the brew "raced", which would push a normal 3:45 brew toward over-extraction. It also contradicted the app's own Kalita drawdown band (3:00-3:45 in `src/lib/handbrew.js`, validated in the 2026-07-19 audit).
2. **Two pours at big doses is a real style but the minority.** Ozone and Sample pour 30g in two big pours; Drop, Onyx, George Howell and Madcap use 4-6 pulses. The app's 264-327g final pours are larger than any source and finish late (2:00 start).
3. **The bloom window was at the short end.** Sources use 0:30-0:50 from first water; at 3x dose a 60-108g bloom pour takes 10-20 seconds, leaving little rest inside 0:30.

## Change (`kalita-rules-v4-published-timing`)

| Profile | Bloom window | Pours after bloom | Total target |
| --- | --- | --- | --- |
| 155, 12-18g | 0:40 | 2 (0:40, 1:15) | 2:45 |
| 155, 19-20g | 0:40 | 3 (0:40, 1:05, 1:30) | 3:15 |
| 185, 15-22g | 0:40 | 2 (0:40, 1:30) | 3:15 |
| 185, 23-30g | 0:45 | 4 (0:45, 1:10, 1:35, 2:00), Drop's split | 3:45 |
| 185, 31-36g | 0:45 | 4, same split | 4:00 |

Bloom water stays 3x dose (sources run 2-3.3x). The bloom step now says to pour it in the first 10-15 seconds. Ratio, temperature, grind and technique choice are unchanged. Saved Kalita recipes from the old rules regenerate on next open because the rules version changed.

## Not changed / not verified

- No blind tasting of the new schedule. Times are a starting band; grind correction by drawdown still applies.
- V60 (source-backed engine with Hoffmann, Kasuya, Rao and roaster sources) and the 2026-07-19 GPT-path fixes (dark ratio, temperature bands, AeroPress modes) were spot-checked and look intact; their schedules were not re-derived here.
- Kalita iced schedules are source-backed separately and were not changed.

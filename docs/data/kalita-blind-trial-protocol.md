# Kalita blind-trial protocol

Status: required before any hot-Kalita cutover. Iced mode remains separately blocked.

1. Use one washed/floral, one washed Kenya, one natural/processed, and one medium/dark coffee; cover both Wave 155 and 185.
2. Randomize and conceal engine identity. Serve the same dose, water, grinder, brew water, filter, and rest window for paired cups.
3. Record recipe engine/rules version, size, dose profile, drawdown observation, cup preference, clarity/body/sweetness notes, and exactly one allowed follow-up adjustment.
4. Reject any cup with failed timer/water/grind structural gates before considering sensory preference.
5. Mark absent, failed, or unknown sensory observations as unknown. They cannot improve a candidate score.
6. Approve only when structural/runtime gates pass and representative blind trials are reviewed. Restore `kalitaRecipeEngine: legacy` for immediate rollback.

No tasting history is read or written by this slice; this is a handoff format for the existing recipe-provenance work.

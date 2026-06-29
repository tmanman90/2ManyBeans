# Learnings (stub — not wired up yet)

This file is a placeholder for a future feature: reading prior `docs/rip-it-runs/*.md` reports at the start of a run to surface patterns across runs ("last 3 runs all hit NEEDS EYES on Firestore rules," "single-shot mode has a 90% clean rate on <2-phase plans but phase-loop mode is noisier on 3-phase plans," etc.).

**Status:** deferred. Tal decided during the Apr 2026 restructure to wire this up only after 5-10 real runs, once there's enough signal in `docs/rip-it-runs/` to make cross-run reading worth the extra context weight.

When you do wire it up, add a step to the orchestrator's "Always read first" section that reads the most recent 3-5 reports from `docs/rip-it-runs/` and surfaces repeated issues. Until then, leave this file alone — it exists only as a marker.

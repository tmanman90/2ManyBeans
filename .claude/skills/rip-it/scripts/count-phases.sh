#!/usr/bin/env bash
# count-phases.sh — count phases in a /ce:plan output file
# Usage: count-phases.sh <plan-path>
# Stdout: integer phase count
#
# Detection strategy (first match wins):
#   1. Level-2 headings like "## Phase 1:", "## Phase 2", "## PHASE 1" — most reliable
#   2. Level-2 headings nested under an "Implementation" / "Plan" / "Phases" section
#   3. Fallback: count all level-2 headings in the doc
#
# The fallback is intentionally loose — it's better to over-count and branch into
# phase-loop mode than to under-count and miss the compounding benefit. The orchestrator
# treats any count ≥3 as phase-loop mode.

set -euo pipefail

PLAN_PATH="${1:?Usage: count-phases.sh <plan-path>}"

if [ ! -f "$PLAN_PATH" ]; then
  echo "count-phases.sh: file not found: $PLAN_PATH" >&2
  exit 1
fi

# Strategy 1: explicit "## Phase N" headings
PHASE_COUNT=$(grep -cE '^## +[Pp][Hh][Aa][Ss][Ee] +[0-9]+' "$PLAN_PATH" || true)

# Strategy 2: level-2 headings nested under Implementation / Plan / Phases section
if [ "${PHASE_COUNT:-0}" -eq 0 ]; then
  PHASE_COUNT=$(awk '
    /^## +(Implementation|Plan|Phases|Steps)/ { in_section=1; next }
    /^# / { in_section=0 }
    in_section && /^## / { count++ }
    END { print count + 0 }
  ' "$PLAN_PATH")
fi

# Strategy 3: fallback — count all level-2 headings
if [ "${PHASE_COUNT:-0}" -eq 0 ]; then
  PHASE_COUNT=$(grep -cE '^## ' "$PLAN_PATH" || true)
fi

echo "${PHASE_COUNT:-0}"

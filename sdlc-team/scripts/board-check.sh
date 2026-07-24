#!/usr/bin/env bash
# Stop hook: block session end while open cards remain on the SDLC board.
# Exit 0 = allow stop; exit 2 = block stop (message on stderr fed back to Claude).
set -euo pipefail

BOARD=".sdlc/kanban.md"
FLAG=".sdlc/.awaiting-human"

# No board → nothing to guard.
[ -f "$BOARD" ] || exit 0
# Legitimately waiting for a human → allow stop.
[ -f "$FLAG" ] && exit 0

# Count cards ("### T-...") that are NOT under the "## Done" column.
open=$(awk '
  /^## / { in_done = ($0 == "## Done"); next }
  /^### T-/ { if (!in_done) count++ }
  END { print count+0 }
' "$BOARD")

if [ "$open" -gt 0 ]; then
  echo "Open cards remain on the SDLC board ($open outside Done) — continue the sprint loop or ask the human." >&2
  exit 2
fi
exit 0

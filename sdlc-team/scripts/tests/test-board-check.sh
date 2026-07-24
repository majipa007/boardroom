#!/usr/bin/env bash
# Fixture tests for board-check.sh. No framework — asserts on exit codes.
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/board-check.sh"
fails=0

run_case() {
  # $1 = description, $2 = expected exit code; board content on stdin, flag via $FLAG
  local desc="$1" expected="$2"
  local dir; dir="$(mktemp -d)"
  mkdir -p "$dir/.sdlc"
  cat > "$dir/.sdlc/kanban.md"
  [ "${FLAG:-0}" = "1" ] && : > "$dir/.sdlc/.awaiting-human"
  ( cd "$dir" && bash "$SCRIPT" ) >/dev/null 2>&1
  local got=$?
  if [ "$got" != "$expected" ]; then
    echo "FAIL: $desc (expected $expected, got $got)"; fails=1
  else
    echo "ok: $desc"
  fi
  rm -rf "$dir"
}

# 1. Card outside Done, no flag → block (2)
FLAG=0 run_case "open card blocks" 2 <<'EOF'
## Backlog
### T-001 | do a thing
## Done
EOF

# 2. All cards in Done → allow (0)
FLAG=0 run_case "all done allows" 0 <<'EOF'
## Backlog
## Done
### T-001 | finished thing
EOF

# 3. Open card but awaiting-human flag set → allow (0)
FLAG=1 run_case "awaiting-human allows despite open card" 0 <<'EOF'
## Backlog
### T-001 | do a thing
## Done
EOF

# 4. No board file at all → allow (0)
dir="$(mktemp -d)"; ( cd "$dir" && bash "$SCRIPT" ) >/dev/null 2>&1
[ $? -eq 0 ] && echo "ok: no board allows" || { echo "FAIL: no board allows"; fails=1; }
rm -rf "$dir"

exit "$fails"

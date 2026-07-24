#!/usr/bin/env bash
# Fixture tests for inbox-validate.sh.
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/inbox-validate.sh"
fails=0

check() {
  local desc="$1" expected="$2" file="$3"
  bash "$SCRIPT" "$file" >/dev/null 2>&1
  local got=$?
  if [ "$got" != "$expected" ]; then
    echo "FAIL: $desc (expected $expected, got $got)"; fails=1
  else
    echo "ok: $desc"
  fi
}

dir="$(mktemp -d)"

cat > "$dir/valid.md" <<'EOF'
---
from: Marcus
task: T-014
type: status-update
timestamp: 2026-07-24T11:47:00Z
---
## Summary
Did the thing.
EOF
check "valid message passes" 0 "$dir/valid.md"

cat > "$dir/badtype.md" <<'EOF'
---
from: Marcus
task: T-014
type: gossip
timestamp: 2026-07-24T11:47:00Z
---
## Summary
Did the thing.
EOF
check "bad type fails" 1 "$dir/badtype.md"

cat > "$dir/nosummary.md" <<'EOF'
---
from: Marcus
task: T-014
type: question
timestamp: 2026-07-24T11:47:00Z
---
No summary heading here.
EOF
check "missing summary fails" 1 "$dir/nosummary.md"

cat > "$dir/nofrom.md" <<'EOF'
---
task: T-014
type: question
timestamp: 2026-07-24T11:47:00Z
---
## Summary
x
EOF
check "missing from fails" 1 "$dir/nofrom.md"

check "missing file fails" 1 "$dir/does-not-exist.md"

rm -rf "$dir"
exit "$fails"

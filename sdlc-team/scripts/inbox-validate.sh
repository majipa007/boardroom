#!/usr/bin/env bash
# Lint one inbox message against the schema in the sdlc-board skill.
# Exit 0 + "OK: <file>" if valid; exit 1 + "INVALID: <reason>" (stderr) otherwise.
set -uo pipefail

f="${1:-}"
[ -n "$f" ] || { echo "usage: inbox-validate.sh <file>" >&2; exit 1; }
[ -f "$f" ] || { echo "INVALID: file not found: $f" >&2; exit 1; }

errs=0
require() { grep -qE "^$1:" "$f" || { echo "INVALID: missing frontmatter '$1'" >&2; errs=1; }; }
require from
require task
require type
require timestamp

type=$(grep -E '^type:' "$f" | head -1 | sed 's/^type:[[:space:]]*//' | tr -d '[:space:]')
case "$type" in
  status-update|dod-check|question|proposed-task|review-result|escalation) ;;
  *) echo "INVALID: bad or missing type '$type'" >&2; errs=1 ;;
esac

grep -q '^## Summary' "$f" || { echo "INVALID: missing '## Summary' section" >&2; errs=1; }

if [ "$errs" -eq 0 ]; then
  echo "OK: $f"
  exit 0
fi
exit 1

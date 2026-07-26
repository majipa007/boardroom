---
description: Read-only summary of the SDLC board — column counts, blocked items, current phase, recent history.
---

Read `.sdlc/kanban.md`, `.sdlc/team.md` (the role registry), `.sdlc/project-config.md`, and
the most recent files in `.sdlc/archive/`. Do NOT modify anything.

If `.sdlc/kanban.md` does not exist, tell the user to run `/sdlc-init` first and stop.

Otherwise print:
- Project name, methodology, current phase, round number, and whether `autopilot` is on.
- A count of cards in each column: Blocked / Backlog / In Progress / Review / Done.
- **Active roles** — for each `status: active` role in the registry: `R-## name`, the number
  of cards currently assigned, and its `cards completed / rework` counts from `history`.
  Flag any role at `rework >= 2`.
- **Recent registry changes** — the last 3 mint/extend/edit/retire entries from the Decision
  Log, newest first.
- Every Blocked card: its id, title, and `question:` line.
- **Open human questions** — each Blocked card carrying `question(HUMAN):`, with its id and
  question text, called out distinctly from the general Blocked list above, or "nothing
  waiting on you".
- The last 3 archive entries (filename + the one-line `## Summary`).

If `team.md` still uses the legacy roster format (a markdown table rather than `R-##`
sections), report the listed members instead of the "Active roles"/"Recent registry changes"
lines above, and skip the registry- and queue-specific lines entirely.

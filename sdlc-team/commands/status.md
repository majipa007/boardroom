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
- Anything queued in `.sdlc/human-queue.md` awaiting the next hard stop, or "nothing queued".
- The last 3 archive entries (filename + the one-line `## Summary`).

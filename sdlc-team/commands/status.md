---
description: Read-only summary of the SDLC board — column counts, open human questions, current phase, recent history.
---

Read `.sdlc/kanban.md`, `.sdlc/team.md` (the role registry), `.sdlc/project-config.md`, and
the most recent files in `.sdlc/archive/`. Do NOT modify anything.

If `.sdlc/kanban.md` does not exist, tell the user to run `/sdlc-init` first and stop.

Otherwise print:
- Project name, methodology, current phase, round number, and whether `autopilot` is on.
- A count of cards in each column: **Next / In flight / Shipped / Killed**. There is no
  Blocked column — a card is blocked only by carrying a `question(HUMAN):` line, wherever it
  sits on the board.
- **Active roles** — for each `status: active` role in the registry: `R-## name`, the number
  of cards currently assigned, and its `cards completed / rework` counts from `history`.
  Flag any role at `rework >= 2`.
- **Recent registry changes** — the last 3 mint/extend/edit/retire entries from the Decision
  Log, newest first.
- **Open human questions** — every card carrying a `question(HUMAN):` line, wherever it sits:
  its id, title, and question text, or "nothing waiting on you".
- The last 3 archive entries (filename + the one-line `## Summary`).

If `.sdlc/kanban.md` still uses the legacy `Blocked/Backlog/In Progress/Review/Done` columns,
or `team.md` still uses the legacy roster table instead of `R-##` sections, print one line
noting the project hasn't migrated to the RAD board yet, and fall back to the old column
counts and/or the plain member list for that part of the report — skip the registry- and
role-specific lines that don't apply.

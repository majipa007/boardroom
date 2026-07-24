---
description: Initialize the SDLC board — interview the human, scaffold .sdlc/, decompose the brief into a backlog, and stop for approval.
---

Load the `sdlc-board` skill for all schemas and templates.

1. **Interview the human.** Ask, concisely: what are we building, key constraints, deadline shape, and any compliance needs.

2. **Methodology.** For now, use `agile` (hardcoded). Write it into `project-config.md`.

3. **Scaffold `.sdlc/`** by copying the skill's `templates/` and filling placeholders:
   - `.sdlc/project-config.md` — project name, today's date, `methodology: agile`, defaults kept.
   - `.sdlc/team.md` — copied verbatim.
   - `.sdlc/kanban.md` — header filled (project name, methodology, `round: 0`), all columns empty.
   - Create empty `.sdlc/inbox/` and `.sdlc/archive/` directories, each with a `.gitkeep`.

4. **Decompose the brief** into an initial backlog: at least 3 well-formed cards under `## Backlog`, each with a full Definition of Done, an assignee chosen by role boundary (see team.md), and `T-###` ids starting at `T-001`. Invoke the `priya-manager` agent to author these cards — she is the only agent permitted to write `kanban.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the chosen methodology and the backlog summary and STOP: ask the human to approve before any code is written. On approval, delete `.sdlc/.awaiting-human`. The project is then ready for `/sprint`.

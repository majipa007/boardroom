---
description: Initialize the SDLC board — interview the human, scaffold .sdlc/, decompose the brief into a backlog, and stop for approval.
---

Load the `sdlc-board` skill for all schemas and templates.

1. **Interview the human.** Ask, concisely: what are we building, key constraints, deadline shape, and any compliance needs.

2. **Methodology (Priya auto-selects).** Based on the brief, Priya chooses the methodology using this guide, and writes both the choice and a written justification into `project-config.md`'s `methodology` and `methodology-reasoning` fields:
   - Requirements vague / expected to evolve, iterative feedback OK → **agile** (sprints; sprint reviews are the gates).
   - Continuous small stream of tasks, no natural sprint rhythm → **kanban** (no sprints; gate every N completed cards or a human-set cadence).
   - Requirements fixed & fully known, compliance/contractual, hard sequential dependencies → **waterfall** (phase gates: Requirements → Design → Implementation → Verification → Release).
   - Fixed core spec + exploratory feature layer → **hybrid** (waterfall skeleton, agile inside Implementation).
   - Signals mixed → default to **agile**.

   The methodology controls only how Priya batches work, where gates fall, and what a "round" means — the queue/board mechanics never change. The human may override the choice at Checkpoint 1 (step 5) or later via `/sdlc-override`.

3. **Scaffold `.sdlc/`** by copying the skill's `templates/` and filling placeholders:
   - `.sdlc/project-config.md` — project name, today's date, `methodology: agile`, defaults kept.
   - `.sdlc/team.md` — copied verbatim.
   - `.sdlc/kanban.md` — header filled (project name, methodology, `round: 0`), all columns empty.
   - Create empty `.sdlc/inbox/` and `.sdlc/archive/` directories, each with a `.gitkeep`.
   - Register the project with the dashboard: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/discover.js" --register "$(pwd)"` (appends this project's absolute path to `~/.sdlc-team/projects.json`; idempotent — safe to run again). If Node.js is unavailable, skip this; the dashboard's `--root` scan can still find the project.

4. **Decompose the brief** into an initial backlog: at least 3 well-formed cards under `## Backlog`, each with a full Definition of Done, an assignee chosen by role boundary (see team.md), and `T-###` ids starting at `T-001`. Invoke the `priya-manager` agent to author these cards — she is the only agent permitted to write `kanban.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the chosen methodology and the backlog summary and STOP: ask the human to approve before any code is written. On approval, delete `.sdlc/.awaiting-human`. The project is then ready for `/sprint`.

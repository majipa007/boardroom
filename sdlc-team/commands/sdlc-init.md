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
   - Ensure the project's `.claude/agents/` directory exists (create it if absent). Priya writes the composed specialist agent files here. If you had to create it now, the session's file watcher will not see it until a restart — you will surface this in the approval step below.
   - Register the project with the dashboard: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/discover.js" --register "$(pwd)"` (appends this project's absolute path to `~/.sdlc-team/projects.json`; idempotent — safe to run again). If Node.js is unavailable, skip this; the dashboard's `--root` scan can still find the project.

4. **Compose the team, then decompose the brief.** Invoke the `priya-manager` agent to:
   - Compose a project-specific team from the brief (Manager, Security, QA always; plus the implementation specialists the project needs), following the "Composing the team" rules in her prompt: write each specialist's agent file into `.claude/agents/<slug>.md` from the skill's `templates/worker-agent.md`, and record the full roster in `.sdlc/team.md`.
   - Decompose the brief into an initial backlog under `## Backlog`: at least 3 well-formed cards with a full Definition of Done and a `T-###` id starting at `T-001`, each assigned to a composed role. She is the only agent that writes `kanban.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present: the chosen methodology, the composed team (from `team.md`), and the backlog summary. **If `.claude/agents/` was created during this run, tell the user to restart Claude Code once now so the new specialist agents load, then run `/sprint`.** STOP and ask the human to approve before any code is written. On approval, delete `.sdlc/.awaiting-human`.

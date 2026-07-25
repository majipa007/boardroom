---
description: Initialize the SDLC board — interview the human, scaffold .sdlc/, decompose the brief into a backlog, and stop for approval.
---

Load the `sdlc-board` skill for all schemas and templates.

1. **Interview the human.** Ask, concisely: what are we building, key constraints, deadline shape, and any compliance needs.

2. **Methodology (the Manager auto-selects).** Based on the brief, the Manager chooses the methodology using this guide, and writes both the choice and a written justification into `project-config.md`'s `methodology` and `methodology-reasoning` fields:
   - Requirements vague / expected to evolve, iterative feedback OK → **agile** (sprints; sprint reviews are the gates).
   - Continuous small stream of tasks, no natural sprint rhythm → **kanban** (no sprints; gate every N completed cards or a human-set cadence).
   - Requirements fixed & fully known, compliance/contractual, hard sequential dependencies → **waterfall** (phase gates: Requirements → Design → Implementation → Verification → Release).
   - Fixed core spec + exploratory feature layer → **hybrid** (waterfall skeleton, agile inside Implementation).
   - Signals mixed → default to **agile**.

   The methodology controls only how the Manager batches work, where gates fall, and what a "round" means — the queue/board mechanics never change. The human may override the choice at Checkpoint 1 (step 5) or later via `/sdlc-override`.

3. **Scaffold `.sdlc/`** by copying the skill's `templates/` and filling placeholders:
   - `.sdlc/project-config.md` — project name, today's date, `methodology: agile`, defaults kept.
   - `.sdlc/team.md` — copied verbatim.
   - `.sdlc/kanban.md` — header filled (project name, methodology, `round: 0`), all columns empty.
   - Create empty `.sdlc/inbox/` and `.sdlc/archive/` directories, each with a `.gitkeep`.
     (`.sdlc/human-queue.md` is not created here — the manager creates it on demand, the
     first time it needs to batch a question for the next hard stop, and it is committed with
     the rest of `.sdlc/`.)
   - Register the project with the dashboard: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/discover.js" --register "$(pwd)"` (appends this project's absolute path to `~/.sdlc-team/projects.json`; idempotent — safe to run again). If Node.js is unavailable, skip this; the dashboard's `--root` scan can still find the project.

4. **Seed the role registry, then decompose the brief.** Invoke the `manager` agent to:
   - Seed `.sdlc/team.md` as a role registry: mint only the roles the brief clearly needs
     right now (start small — more are minted on demand as cards appear), each with an
     `R-##` id, name, charter, boundaries, a `conventions` seed, `status: active`, `minted`,
     and `history: 0 cards completed, 0 rework`. Always include a `sec-review` role and a
     `qa-verify` role, since classification attaches them to most cards.
   - Decompose the brief into the initial backlog under `## Backlog`: at least 3 well-formed
     cards, each with a full Definition of Done, a `T-###` id starting at `T-001`, a
     `role: R-## <name>`, and `verify-roles` set from the classification table in the skill.
   The manager is the only agent that writes `kanban.md` and `team.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the
   chosen methodology, the seeded role registry (ids, names, one-line charters), and the
   backlog summary. Mention whether `autopilot` is `on` or `off` in `project-config.md` and
   that `/sprint --auto` can force it for one run. STOP and ask the human to approve before
   any code is written. On approval, delete `.sdlc/.awaiting-human`; the project is ready for
   `/sprint`.

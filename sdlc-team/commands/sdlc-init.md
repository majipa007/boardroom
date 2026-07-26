---
description: Initialize the SDLC board — interview the human, scaffold .sdlc/, decompose the brief into a backlog, and stop for approval.
---

Load the `sdlc-board` skill for all schemas and templates.

1. **Interview the human.** Ask, concisely: what are we building, key constraints, deadline shape, and any compliance needs.

2. **Methodology.** Use **RAD** — build a major part, then test/review/security it as one gate,
   then cut over and repeat. Write `methodology: rad` and a one-line reason into
   `project-config.md`. The only alternative is `waterfall`, and only for a genuinely fixed-spec
   compliance project; the human can switch with `/sdlc-override waterfall`.

   The methodology controls only how the Manager bundles work into increments and where gates fall — the queue/board mechanics never change. The human may override the choice at Checkpoint 1 (step 5) or later via `/sdlc-override`.

3. **Scaffold `.sdlc/`** by copying the skill's `templates/` and filling placeholders:
   - `.sdlc/project-config.md` — project name, today's date, `methodology: rad`, defaults kept.
   - `.sdlc/team.md` — copied verbatim.
   - `.sdlc/kanban.md` — header filled (project name, methodology, `round: 0`), all columns empty.
   - Create empty `.sdlc/inbox/` and `.sdlc/archive/` directories, each with a `.gitkeep`.
   - Register the project with the dashboard: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/discover.js" --register "$(pwd)"` (appends this project's absolute path to `~/.sdlc-team/projects.json`; idempotent — safe to run again). If Node.js is unavailable, skip this; the dashboard's `--root` scan can still find the project.

4. **Seed the role registry, then decompose the brief.** Invoke the `manager` agent to:
   - Seed `.sdlc/team.md` as a role registry: mint only the roles the brief clearly needs
     right now (start small — more are minted on demand as cards appear), each with an
     `R-##` id, name, charter, boundaries, a `conventions` seed, `status: active`, `minted`,
     and `history: 0 cards completed, 0 rework`. Always include a `sec-review` role and a
     `qa-verify` role, since classification attaches them to most cards.
   - Decompose the brief into the initial backlog under `## Next`: at least 3 well-formed
     cards, each with a full Definition of Done, a `T-###` id starting at `T-001`, a
     `role: R-## <name>`, and `verify-roles` set from the classification table in the skill.
   The manager is the only agent that writes `kanban.md` and `team.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the
   chosen methodology, the seeded role registry (ids, names, one-line charters), and the
   backlog summary. Mention whether `autopilot` is `on` or `off` in `project-config.md` and
   that `/sprint --auto` can force it for one run. STOP and ask the human to approve before
   any code is written. On approval, delete `.sdlc/.awaiting-human`; the project is ready for
   `/sprint`.

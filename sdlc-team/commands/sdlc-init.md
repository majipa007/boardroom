---
description: Initialize the SDLC board from a spec document (or a short interview), then stop for approval.
argument-hint: "[path/to/spec.md]"
---

Load the `sdlc-board` skill for all schemas and templates.

> Most people should use **`/boardroom <doc>`** instead — it does this and then builds the
> project to completion without further commands. Use `/sdlc-init` when you want to set the
> board up and drive the cycles yourself.

1. **Get the brief.**
   - **If `$ARGUMENTS` names a document,** read that file in full and use it as the brief. Do
     NOT interview the human. If it is silent on something you need, decide sensibly and log
     `DECISION (auto): assumed <X> because the spec was silent`.
   - **Otherwise** ask, concisely: what are we building, key constraints, deadline shape, and
     any compliance needs.

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
   backlog summary. Mention whether `autopilot` is `on` or `off` in `project-config.md`.
   STOP and ask the human to approve before any code is written. On approval, delete
   `.sdlc/.awaiting-human` and **immediately begin running cycles** as `/sprint` describes —
   do not make the human type another command. (If they asked only to initialise, say the
   board is ready and stop there instead.)

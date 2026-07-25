---
name: sdlc-board
description: Board conventions for the sdlc-team plugin — the kanban column rules, the card schema, the inbox message protocol, and the common worker protocol. Load this before reading, assigning, or reporting on any SDLC card.
---

# SDLC Board Conventions

This skill is the single source of truth for how the team coordinates. All agents load it.

## The board file — `.sdlc/kanban.md`

Columns, in fixed order. Cards live under a column heading.

```markdown
# Kanban — <project name>
> methodology: <agile|kanban|waterfall|hybrid> | phase: <current phase/sprint>
> last-updated: <ISO timestamp> | round: <n>

## Blocked
(cards needing manager/human input — processed FIRST every round)

## Backlog

## In Progress

## Review

## Done
```

**Column rules:**
- **Blocked** is processed FIRST every round. Any card here MUST contain a `question:` line addressed to the Manager, or `question(HUMAN):` for the human.
- A card enters **Done** only when every Definition-of-Done checkbox is checked.
- **Only the Manager edits this file.** Everyone else requests changes via the inbox.

## Card schema

```markdown
### T-014 | Implement JWT refresh endpoint
- assignee: Marcus
- created-by: Manager
- phase: Sprint 2
- priority: high
- depends-on: [T-011]
- branch: sdlc/T-014-jwt-refresh          # set when work starts
- flow: worktree → implement → tests → inbox report → Security Reviewer review → QA Engineer review → merge
- what: |
    Add POST /auth/refresh. Rotate refresh tokens, invalidate old token,
    return new access+refresh pair. Follow existing error envelope in src/api/errors.ts.
- definition-of-done:
  - [ ] Endpoint implemented and returns correct status codes (200/401/403)
  - [ ] Unit + integration tests written and passing (QA Engineer verifies)
  - [ ] No new high/critical findings (Security Reviewer signs off)
  - [ ] Branch merges cleanly to main (Manager verifies)
- status-log:
  - 2026-07-24T10:02 created by Manager
  - 2026-07-24T10:31 Marcus started (worktree created)
```

**Card rules:**
- Task IDs are `T-###`, monotonically increasing, assigned only by the Manager.
- A DoD checkbox may only be checked by the role that owns it: the QA Engineer owns test boxes, the Security Reviewer owns security boxes, the implementing worker owns implementation boxes, the Manager owns the merge box. Ownership is requested via inbox and applied by the Manager.

## Inbox protocol — `.sdlc/inbox/`

One file per message, named `<ISO-timestamp>_<agent>_<task-id-or-GENERAL>.md`. ISO timestamps make filenames sort oldest-first.

```markdown
---
from: Marcus
task: T-014
type: status-update        # status-update | dod-check | question | proposed-task | review-result | escalation
timestamp: 2026-07-24T11:47:00Z
---
## Summary
Implemented refresh endpoint on branch sdlc/T-014-jwt-refresh. 14 files changed.

## Requested board changes
- move T-014 → Review
- check DoD box 1 ("Endpoint implemented...")

## Notes for others
- note(Elena): response shape for /auth/refresh documented in src/api/types.ts
- note(Security Reviewer): please pay attention to token rotation logic in src/auth/refresh.ts

## New task proposals
(none)
```

**Inbox rules:**
- Workers **never** edit `kanban.md`. All board changes are *requests* in inbox messages.
- `proposed-task` messages contain a full draft card; the Manager decides whether it becomes a real card.
- After processing, the Manager moves the file **unchanged** to `archive/` (`mv`, not rewrite). `archive/` is a replayable project history and MUST be committed.
- `type: escalation` messages (e.g. a high/critical security finding) trigger an immediate human checkpoint.
- **Delivering messages across worktrees.** A worker running in an isolated worktree (`isolation: worktree`) must **commit** its inbox message file onto its working branch — `git add .sdlc/inbox/<file>` then commit with a `[T-###]` message. Untracked files created inside a worktree are invisible to the manager, so an uncommitted inbox message is never delivered. A worker running in the main checkout (the Security Reviewer) instead writes the inbox file directly and does not commit it (the manager owns commits on the main branch).

## Common worker protocol (the Security Reviewer, the QA Engineer, and each project-composed specialist)

Read `.sdlc/kanban.md`. Find cards assigned to you in Backlog or In Progress. Work the highest-priority unblocked one. **Never edit kanban.md.** Report everything via a new file in `.sdlc/inbox/` following the message schema above. If you are running in an isolated worktree, commit that inbox file onto your working branch (`git add` + `[T-###]` commit) so the manager can read it — uncommitted worktree files never reach the manager. If you are running in the main checkout, just write the file. If nothing is assigned to you, scan Review/notes for anything addressed to you; if still nothing, write a GENERAL inbox message saying you are idle and end your turn.

Respect your role's hard boundaries (see `.sdlc/team.md`). If a card needs work outside your scope, do NOT do it — file a `proposed-task` so the Manager can route it, and note the dependency.

Git discipline (workers that write code): work only on branch `sdlc/<task-id>-<slug>` created from `main`; prefix every commit with `[T-###]`; never commit to `main`.

DoD honesty: only ever *request* a DoD box check via inbox, and only for a box you have personally verified.

## Dynamic team composition

The team is composed per project, not fixed. Three roles are always present and ship with the plugin:

- **Manager / Orchestrator** (`manager`): the only writer of `kanban.md`; decomposes, assigns, merges, runs checkpoints, and **composes the rest of the team**.
- **Security Reviewer** (`security-reviewer`): read-only reviewer; high/critical findings escalate.
- **QA Engineer** (`qa-engineer`): tests only; verifies DoD and signs off.

Every **implementation specialist** (backend, frontend, mobile, ML, data, infra, docs, …) is chosen by the Manager from the project brief and written as a project-level agent file under the target project's `.claude/agents/<slug>.md`, generated from `templates/worker-agent.md`. Rules the Manager follows when composing:

- Pick the smallest set of specialist roles the brief actually needs (skip frontend if there's no UI; add an ML engineer if there's a model; etc.). Manager, Security, and QA are always included.
- Each specialist gets a unique lowercase-hyphen `name` (e.g. `ml-engineer`, `ios-developer`, `data-engineer`), a clear `Role`, and explicit owned / out-of-scope boundaries so roles don't overlap.
- Record every team member (name + role) in `.sdlc/team.md` as a table row.
- Generated agent files use `isolation: worktree`, `model: sonnet`, no `skills:` frontmatter (the body says "Load the `sdlc-board` skill"), and never reference `${CLAUDE_PLUGIN_ROOT}`.

**Loading caveat:** Claude Code's watcher only picks up `.claude/agents/` if that directory existed when the session started. So `/sdlc-init` creates `.claude/agents/` and, if it was newly created, asks the user to restart once before `/sprint`. Adding a new specialist mid-project (into the already-watched directory) is hot-loaded within seconds — no restart.

## Templates

Starter files for a target project's `.sdlc/` live in `templates/`:
- `templates/kanban.md`
- `templates/team.md`
- `templates/project-config.md`
- `templates/inbox-message.md`

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
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- created-by: Manager
- phase: Sprint 2
- priority: high
- depends-on: [T-011]
- branch: sdlc/T-014-jwt-refresh          # set when work starts
- what: |
    Add POST /auth/refresh. Rotate refresh tokens, invalidate old token,
    return new access+refresh pair. Follow existing error envelope in src/api/errors.ts.
- definition-of-done:
  - [ ] Endpoint implemented and returns correct status codes (200/401/403)
  - [ ] Unit + integration tests written and passing (qa-verify verifies)
  - [ ] No new high/critical findings (sec-review signs off)
  - [ ] Branch merges cleanly to main (Manager verifies)
- status-log:
  - 2026-07-24T10:02 created by Manager
```

**Card rules:**
- Task IDs are `T-###`, monotonically increasing, assigned only by the Manager.
- A DoD checkbox may only be checked by the role that owns it: `qa-verify` owns test boxes, `sec-review` owns security boxes, the implementing role owns implementation boxes, the Manager owns the merge box. Ownership is requested via inbox and applied by the Manager.

## Risk classification → mandatory verify-roles

When the Manager creates a card it tags the card's risk classes, and each class attaches a
verify-role automatically. This is **mandatory and not staffing-dependent** — if the needed
review role does not exist yet, the Manager mints it.

| The card… | attaches |
|---|---|
| touches auth/authz, input parsing, secrets, dependencies, or file/network handling | `R-## sec-review` |
| produces or changes executable code | `R-## qa-verify` |
| changes infra or deployment | `R-## infra-review` |

`verify-roles` on a card is written `R-## <name>` (matching the card schema above), never a
bare name — the `R-##` id is whatever id that role already has in the registry, or the next
free id assigned when the Manager mints it for this classification.

**A card cannot move to Done until every role in its `verify-roles` has a sign-off message in
`.sdlc/archive/`.** Sign-off means a `review-result` (or `dod-check` for `qa-verify`) message
from that role reporting success.

Separation of duties, enforced by the Manager:
- The worker that implemented a card never verifies it — verification is always a fresh
  `reviewer` spawn, even when the charters overlap.
- The Manager never implements, edits code, or checks DoD boxes on its own authority.
- A reported failing test run blocks the merge unconditionally; the Manager files a fix card.

Legacy note: cards written before this upgrade use `- assignee: <name>` and no
`verify-roles`. They still parse, and the Manager rewrites them to `role:` when it next
touches them.

## Inbox protocol — `.sdlc/inbox/`

One file per message, named `<ISO-timestamp>_<agent>_<task-id-or-GENERAL>.md`. ISO timestamps make filenames sort oldest-first.

```markdown
---
from: R-01 backend
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
- note(R-02 frontend): response shape for /auth/refresh documented in src/api/types.ts
- note(sec-review): please pay attention to token rotation logic in src/auth/refresh.ts

## New task proposals
(none)
```

**Inbox rules:**
- Every message's `from:` MUST be the acting role, written as `R-## <name>` (or `Manager`) —
  never a person's name. The Done gate matches a card's `verify-roles` against sign-offs by
  this value, so a message with the wrong `from:` is invisible to that check.
- Workers **never** edit `kanban.md`. All board changes are *requests* in inbox messages.
- `proposed-task` messages contain a full draft card; the Manager decides whether it becomes a real card.
- After processing, the Manager moves the file **unchanged** to `archive/` (`mv`, not rewrite). `archive/` is a replayable project history and MUST be committed.
- `type: escalation` messages (e.g. a high/critical security finding) trigger an immediate human checkpoint.
- **Delivering messages across worktrees.** Both `worker` and `reviewer` run with `isolation: worktree`, so they must **commit** the inbox message onto the working branch — `git add .sdlc/inbox/<file>` then a `[<card-id>]` commit. Untracked files created inside a worktree are invisible to the Manager, so an uncommitted inbox message is never delivered.

## Common protocol for `worker` and `reviewer`

Your spawn prompt gives you a role charter, its boundaries and conventions, and exactly ONE card id. Read `.sdlc/kanban.md` and that card in full, and work only that card. **Never edit `kanban.md` or `team.md`.** Report everything via a new file in `.sdlc/inbox/` following the message schema above, and commit it onto your working branch so the Manager receives it.

Respect your role's boundaries (they come from the registry in `.sdlc/team.md`). If the card needs work outside your scope, do NOT do it — file a `question` or `proposed-task` so the Manager can route it, and note the dependency.

Git discipline (workers that write code): work only on branch `sdlc/<task-id>-<slug>` created from `main`; prefix every commit with `[T-###]`; never commit to `main`.

DoD honesty: only ever *request* a DoD box check via inbox, and only for a box you have personally verified.

## The role registry

The team is a registry of ROLES, not a fixed roster of people. `.sdlc/team.md` holds one
section per role, and **only the Manager writes it**:

```markdown
## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |            # the role's accumulated memory — grows over time
    zod for validation; error envelope in src/api/errors.ts.
- default-tools: standard
- status: active            # active | retired
- minted: 2026-07-25 by Manager (init)
- history: 6 cards completed, 1 rework
```

Registry rules:
- **IDs (`R-##`) are stable** and never reused. Cards reference a role by id AND name.
- **Reuse before mint.** Scan the registry first; reuse or extend a role whose charter covers
  at least what the card needs. Minting a near-duplicate is a defect.
- **Charter edits beat new roles.** A role that keeps producing rework gets its
  `conventions`/`charter` edited, not a replacement minted.
- **Retire, never delete.** Set `status: retired`; the section stays so `archive/` history
  still resolves.
- Every registry change is an auto-decision: log it in the Decision Log, never stop for it.

## Executing a role

There are exactly three shipped agents: `manager`, `worker`, `reviewer`. A role is not an
agent file — the Manager spawns `worker` (implementation) or `reviewer` (verification) and
injects the charter, using this template:

```
You are acting as role <R-id name>.
CHARTER: <charter>
BOUNDARIES: <boundaries>
CONVENTIONS: <conventions>
Your card: <card-id>. Round: <n>. Report via inbox only.
```

`worker` and `reviewer` are separate definitions on purpose: implementation and verification
must never share a prompt or a tool set.

## Templates

Starter files for a target project's `.sdlc/` live in `templates/`:
- `templates/kanban.md`
- `templates/team.md`
- `templates/project-config.md`
- `templates/inbox-message.md`

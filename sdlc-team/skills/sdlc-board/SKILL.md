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
> methodology: <rad|waterfall> | phase: <current phase/sprint>
> last-updated: <ISO timestamp> | round: <n>

## Next
(decided, not started)

## In flight
(being built or verified — the branch is the increment)

## Shipped

## Killed
(considered and cut — kept for the record)
```

**Column rules:**
- A card carrying `question(HUMAN):` is **blocked by that fact** — there is no Blocked column, and those cards are surfaced first every cycle.
- `In flight` covers both building and verifying. The card's `branch:` names the increment it belongs to.
- A card enters `Shipped` only when its increment's verification signed off and it merged.
- `Killed` is scope that was decided against. Killing is a logged decision; killed cards are never dispatched.
- **Only the Manager edits this file.** Everyone else requests changes via the inbox.
- Legacy boards using `Blocked/Backlog/In Progress/Review/Done` still load; the Manager migrates a card's column when it next touches it.

## Card schema

```markdown
### T-014 | Implement JWT refresh endpoint
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- created-by: Manager
- phase: Sprint 2
- priority: high
- depends-on: [T-011]
- branch: sdlc/inc-03-auth-refresh       # the cycle's increment branch; set when work starts
- what: |
    Add POST /auth/refresh. Rotate refresh tokens, invalidate old token,
    return new access+refresh pair. Follow existing error envelope in src/api/errors.ts.
- ships-when: POST /auth/refresh rotates tokens and the suite is green.
- definition-of-done:          # keep to 3 boxes or fewer
  - [ ] endpoint returns 200/401/403
  - [ ] tests green
  - [ ] no high/critical findings (review signs off)
- status-log:
  - 2026-07-24T10:02 created by Manager
```

**Card rules:**
- Task IDs are `T-###`, monotonically increasing, assigned only by the Manager.
- A DoD checkbox may only be checked by the role that owns it: `qa-verify` owns test boxes, `sec-review` owns security boxes, the implementing role owns implementation boxes, the Manager owns the merge box. Ownership is requested via inbox and applied by the Manager.

## Increments — the unit of work

Work ships in **increments**, not cards. An increment is a bundle of ready cards built together
on **one branch**, `sdlc/inc-##-<slug>`. The branch IS the increment — there is no separate
field.

- **Bundle dynamically, with no size cap:** every ready card one role can own without a
  file-footprint conflict with another in-flight bundle. Dependencies inside a bundle are fine —
  one agent works them in order.
- Different roles bundle **in parallel on the same branch**, kept apart by file ownership.
- Verification runs **once per increment**, over the combined diff.
- If two ready cards genuinely need the same file, they are serialised on that branch rather
  than split into two increments.

## One branch, one checkout — the rules that keep it safe

There are **no worktrees**. Every agent in a cycle shares the working directory on the
increment branch. Git allows exactly one HEAD per directory, so this is the only way several
agents can run at once without separate checkouts.

- **Never run `git checkout`, `git switch`, `git reset`, `git stash`,** or anything else that
  moves HEAD or rewrites the index wholesale. Doing so destroys every other agent's work in
  flight.
- Only ever `git add <the files you own>` and `git commit`. Never `git add -A`, and never
  `git commit -a` / `-am` — either stages every modified tracked file, sweeping another
  agent's in-progress edits into your commit.
- Your spawn prompt names the **files you own**. Editing a file outside that scope is a defect
  even if your charter would otherwise allow it — another agent may hold it this cycle.
- If a commit fails on `.git/index.lock`, wait a moment and retry once.

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

**A card cannot move to Shipped until every role in its `verify-roles` has a sign-off message in
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
Implemented refresh endpoint on the increment branch sdlc/inc-03-auth-refresh. 14 files changed.

## Requested board changes
- move T-014 → In flight
- check DoD box 1 ("Endpoint implemented...")

## Notes for others
- note(R-02 frontend): response shape for /auth/refresh documented in src/api/types.ts
- note(sec-review): please pay attention to token rotation logic in src/auth/refresh.ts

## New task proposals
(none)
```

**Inbox rules:**
- Every message's `from:` MUST be the acting role, written as `R-## <name>` (or `Manager`) —
  never a person's name. The Shipped gate matches a card's `verify-roles` against sign-offs by
  this value, so a message with the wrong `from:` is invisible to that check.
- Workers **never** edit `kanban.md`. All board changes are *requests* in inbox messages.
- `proposed-task` messages contain a full draft card; the Manager decides whether it becomes a real card.
- After processing, the Manager moves the file **unchanged** to `archive/` (`mv`, not rewrite). `archive/` is a replayable project history and MUST be committed.
- `type: escalation` messages (e.g. a high/critical security finding) trigger an immediate human checkpoint.
- **Delivering messages on the shared branch.** `worker` and `reviewer` share the working
  directory on the increment branch (see "One branch, one checkout" above), so they must
  **commit** the inbox message onto that branch — `git add .sdlc/inbox/<file>` then a
  `[<card-id>]` commit. An uncommitted inbox message is never delivered.

## Common protocol for `worker` and `reviewer`

Your spawn prompt gives you a role charter, its boundaries and conventions, the increment
branch, a bundle of card ids in dependency order, and the explicit list of files you own. Read
`.sdlc/kanban.md` and those cards in full, and work only within that file list. **Never edit
`kanban.md` or `team.md`.** Report everything via a new file in `.sdlc/inbox/` following the
message schema above, and commit it onto the increment branch so the Manager receives it.

Respect your role's boundaries (they come from the registry in `.sdlc/team.md`). If the bundle
needs work outside your scope, do NOT do it — file a `question` or `proposed-task` so the
Manager can route it, and note the dependency.

Git discipline: see "One branch, one checkout" above — you share the working directory with
other agents this cycle, so never move HEAD, and only `git add` the files you own.

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
Your bundle: <card ids in dependency order>. Branch: <increment branch>.
Files you own: <list>. Round: <n>. Report via inbox only.
```

`worker` and `reviewer` are separate definitions on purpose: implementation and verification
must never share a prompt or a tool set.

## Templates

Starter files for a target project's `.sdlc/` live in `templates/`:
- `templates/kanban.md`
- `templates/team.md`
- `templates/project-config.md`
- `templates/inbox-message.md`

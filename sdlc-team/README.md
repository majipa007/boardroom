# sdlc-team

The plugin behind [Boardroom](https://github.com/majipa007/boardroom). It runs a software team inside Claude Code: a **manager agent** composes a project-specific roster from your brief, puts the work on a Markdown Kanban board, and specialist agents write real code in isolated git worktrees until the board is clear. Humans are asked only at defined checkpoints.

## Install

```
/plugin marketplace add majipa007/boardroom
```
```
/plugin install sdlc-team@boardroom
```

Local development (no install):

```bash
claude --plugin-dir ./sdlc-team
claude plugin validate ./sdlc-team --strict
```

Requires **Node.js ≥ 18** for `/sdlc-dashboard` only; everything else is Markdown + POSIX shell. `git` is required (worktrees).

## Commands

| Command | What it does |
|---------|--------------|
| `/sdlc-init` | Interview you, pick a methodology, compose the team, scaffold `.sdlc/`, draft the backlog, stop for approval. |
| `/sprint [rounds]` | Run the loop: manager pass → parallel worker dispatch → repeat, until the board is clear or a checkpoint fires. Optional arg caps rounds. |
| `/status` | Read-only board summary. |
| `/standup` | One line per team member. |
| `/sdlc-override <methodology\|key=value>` | Change methodology or config; the manager restructures the board and logs the decision. |
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch the read-only local web dashboard — two themes (Sprint Wall / Blueprint), live board, team, and a recent-activity feed drawn from the archive, for every project. |

## Roles

There are exactly three shipped agents:

| Agent | What it is |
|---|---|
| `manager` | The orchestrator. Sole writer of the board and the role registry. Allocates, classifies, merges, runs checkpoints. Never implements. |
| `worker` | A generic implementer. Spawned with a role charter and one card; runs in its own git worktree. |
| `reviewer` | A generic verifier. Spawned with a review charter (`sec-review`, `qa-verify`, …); read-only on source. |

**The team itself is a role registry**, kept in `.sdlc/team.md` and owned by the manager. Each
role has a stable id (`R-01`), a charter, hard boundaries, and `conventions` that accumulate
as the project goes. The manager reuses or extends an existing role when it can and mints a
new one only when nothing covers the need — every such decision is logged, never a prompt.

Cards say `role: R-01 backend` and carry mandatory `verify-roles` derived from risk: anything
touching auth, input parsing, secrets, dependencies or file/network handling gets
`sec-review`; anything producing executable code gets `qa-verify`. **A card cannot reach Done
until every verify-role has signed off in `archive/`**, and the worker that implemented a card
never verifies it.

## How it works

- **Board is the single source of truth** (`.sdlc/kanban.md`) and only the manager writes it.
- **Workers report via `.sdlc/inbox/`** — never by editing the board. The manager processes messages oldest-first and moves them unchanged into `.sdlc/archive/`, a replayable history. Workers in a worktree commit their message onto their branch so it reaches the manager.
- **Parallel, zero conflicts:** each worker runs in its own git worktree on branch `sdlc/<task-id>-<slug>`; the manager merges one branch at a time and turns conflicts into fix cards rather than resolving blindly.
- **Definition of Done** lives on every card as checkboxes, each owned by the role responsible for it. A card reaches Done only when every box is checked.
- **Checkpoints** halt the loop and ask you: plan approval, sprint/phase gate, high/critical security finding, blocked escalation, round cap. A Stop hook prevents the session ending with open cards unless `.sdlc/.awaiting-human` is set.

## Autopilot

Set `autopilot: on` in `.sdlc/project-config.md` (or run `/sprint --auto`) and the loop keeps
going, logging its decisions instead of asking. It halts on exactly five things: init
approval, a high/critical security finding, batched `question(HUMAN)` items, the round cap,
and completion. Role mints, charter edits, allocation and serialization are auto-decisions
recorded in the Decision Log. Questions raised mid-round are queued in
`.sdlc/human-queue.md` and presented together at the next stop — the loop never halts
mid-round. A failing test run blocks a merge unconditionally, autopilot or not.

Caps keep it bounded: `parallelism` (3), `max-role-mints-per-sprint` (4) and
`max-active-roles` (10).

## Dashboard

`/sdlc-dashboard` serves a read-only board at `http://localhost:8787` (Node.js ≥ 18, zero dependencies).
It ships two themes over one DOM, switchable from the header and remembered in `localStorage`:

- **Sprint Wall** (default) — sticky notes pinned to a plaster wall, painter's-tape column headers, handwritten type.
- **Blueprint** — drafting paper: grid, 1px linework, spec-sheet cards, RFI callouts, a drawing title block.

The server converts `.sdlc/` markdown into a single `board.json` payload (`GET /board.json?project=<id>`);
the page polls it every 5 seconds and repaints only when the content hash changes. The UI never writes to a project.

## Layout it manages in your project

    .sdlc/
    ├── kanban.md           # THE BOARD (manager only)
    ├── team.md             # composed roster + role boundaries
    ├── project-config.md   # methodology, checkpoints, decision log
    ├── inbox/              # worker → manager messages
    └── archive/            # processed messages (project history)

Commit `.sdlc/` — it is your project-management record.

## Development

```bash
# board-check Stop hook + inbox schema linter
bash scripts/tests/test-board-check.sh
bash scripts/tests/test-inbox-validate.sh

# dashboard modules (Node stdlib only)
node --test scripts/tests/parse.test.js scripts/tests/discover.test.js \
            scripts/tests/dashboard.test.js scripts/tests/board-json.test.js
```

## Non-goals (v1)

External integrations (GitHub/Slack/CI), the security reviewer writing fixes itself, multiple concurrent boards, token budgeting beyond the round cap.

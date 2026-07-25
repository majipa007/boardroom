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
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch a read-only local web dashboard showing every project's board, team, inbox, and archive, newest-active first. |

## The team

Always present (ship with the plugin):

| Agent | Role | Hard boundary |
|---|---|---|
| `manager` | Manager / Orchestrator | The only writer of the board. Decomposes, assigns, merges, runs checkpoints, composes the team. Never implements features. |
| `security-reviewer` | Security | Reviews branch diffs, rates findings `low`→`critical`, files fixes as proposed tasks. High/critical halts the loop. Never fixes code itself. |
| `qa-engineer` | QA | Runs and writes tests, verifies DoD boxes, signs off cards. Never modifies non-test source. |

**Every implementation specialist is composed per project.** At `/sdlc-init` the manager decides which roles the brief needs (backend, frontend, mobile, ML, data, infra, docs, …), writes each as an agent into your project's `.claude/agents/<role>.md` with its own scope boundaries, and records the roster in `.sdlc/team.md`. There is no fixed developer list.

> **First run:** if `.claude/agents/` had to be created, restart Claude Code once before `/sprint` so the new agents load. Roles added mid-project are picked up automatically.

## How it works

- **Board is the single source of truth** (`.sdlc/kanban.md`) and only the manager writes it.
- **Workers report via `.sdlc/inbox/`** — never by editing the board. The manager processes messages oldest-first and moves them unchanged into `.sdlc/archive/`, a replayable history. Workers in a worktree commit their message onto their branch so it reaches the manager.
- **Parallel, zero conflicts:** each worker runs in its own git worktree on branch `sdlc/<task-id>-<slug>`; the manager merges one branch at a time and turns conflicts into fix cards rather than resolving blindly.
- **Definition of Done** lives on every card as checkboxes, each owned by the role responsible for it. A card reaches Done only when every box is checked.
- **Checkpoints** halt the loop and ask you: plan approval, sprint/phase gate, high/critical security finding, blocked escalation, round cap. A Stop hook prevents the session ending with open cards unless `.sdlc/.awaiting-human` is set.

## Layout it manages in your project

    .sdlc/
    ├── kanban.md           # THE BOARD (manager only)
    ├── team.md             # composed roster + role boundaries
    ├── project-config.md   # methodology, checkpoints, decision log
    ├── inbox/              # worker → manager messages
    └── archive/            # processed messages (project history)

    .claude/agents/         # specialists the manager wrote for this project

Commit `.sdlc/` — it is your project-management record.

## Development

```bash
# board-check Stop hook + inbox schema linter
bash scripts/tests/test-board-check.sh
bash scripts/tests/test-inbox-validate.sh

# dashboard modules (Node stdlib only)
node --test scripts/tests/parse.test.js scripts/tests/discover.test.js scripts/tests/dashboard.test.js
```

## Non-goals (v1)

External integrations (GitHub/Slack/CI), the security reviewer writing fixes itself, multiple concurrent boards, token budgeting beyond the round cap.

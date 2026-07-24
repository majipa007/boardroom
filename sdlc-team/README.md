# sdlc-team

A Claude Code plugin that simulates a full software development team and automates the SDLC end-to-end. A manager agent (Priya) decomposes work onto a shared Markdown Kanban board; specialist workers (Marcus/backend, Elena/frontend, Jamey/DevOps, Sofia/security, Dev/QA) pick up assigned cards, write real code in isolated git worktrees, and report back through a file-based inbox queue. Work runs in rounds until the board is clear. Humans intervene only at defined checkpoints.

## Install / run

Development (no install):

    claude --plugin-dir ./sdlc-team

Validate:

    claude plugin validate ./sdlc-team

## Commands

| Command | What it does |
|---------|--------------|
| `/sdlc-init` | Interview you, auto-select a methodology, scaffold `.sdlc/`, decompose the brief into a backlog, and stop for your approval. |
| `/sprint [rounds]` | Run the orchestration loop: manager pass → parallel worker dispatch → repeat, until the board is clear or a checkpoint fires. Optional arg caps rounds. |
| `/status` | Read-only board summary. |
| `/standup` | One line per team member. |
| `/sdlc-override <methodology\|key=value>` | Change methodology or config; Priya restructures and logs the decision. |
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch a read-only local web dashboard (Node.js ≥ 18) showing every project's board, team, inbox, and archive, newest-active first. |

## How it works

- **Board is the single source of truth** (`.sdlc/kanban.md`) and only Priya writes it.
- **Workers communicate via `.sdlc/inbox/`**; Priya processes messages oldest-first and moves them unchanged to `.sdlc/archive/` (a replayable history).
- **Parallel workers, zero conflicts**: each worker runs in its own git worktree; Priya merges one branch at a time and turns conflicts into fix cards.
- **Definition of Done** lives on every card as checkboxes, each owned by the responsible role.
- **Checkpoints** (init approval, sprint/phase gate, high/critical security finding, blocked escalation, round-cap) halt the loop and ask you. A Stop hook prevents the session ending with open cards unless `.sdlc/.awaiting-human` is set.

## Dashboard

Run `/sdlc-dashboard` to launch a zero-dependency local web UI (default `http://localhost:8787`). It monitors every project that has run `/sdlc-init` (tracked in `~/.sdlc-team/projects.json`) plus any found under a `--root` you pass. The page auto-refreshes every few seconds and is strictly read-only. Requires Node.js ≥ 18; no `npm install`.

## Layout it manages in your project

    .sdlc/
    ├── project-config.md   # methodology, checkpoints, decision log
    ├── team.md             # roster + role boundaries
    ├── kanban.md           # THE BOARD (Priya only)
    ├── inbox/              # worker → manager messages
    └── archive/            # processed messages (project history)

Commit `.sdlc/` — it is your project-management record.

## Non-goals (v1)

Dynamic team composition, external integrations (GitHub/Slack/CI), Sofia writing fixes herself, multiple concurrent boards, token budgeting beyond the round cap.

![Boardroom](boardroom.png)

# Boardroom

**A Claude Code plugin that runs a full AI software team and automates the SDLC end‑to‑end on a shared Markdown Kanban board.**

Boardroom hosts the `sdlc-team` plugin. A manager agent decomposes work onto a board, specialist worker agents pick up their cards and **write real code in your repository**, and work runs in rounds until the board is clear — with humans stepping in only at defined checkpoints. A bundled read‑only web dashboard lets you watch every project's board, team, inbox, and archive live.

---

## What it does

You give it a project brief. It:

1. **Builds a team and a board.** Six personas with hard role boundaries, and a Kanban board (`.sdlc/kanban.md`) that is the single source of truth.
2. **Plans the work.** The manager picks an SDLC methodology (Agile / Kanban / Waterfall / Hybrid) from your brief, decomposes it into cards with a checkbox Definition of Done, and stops for your approval.
3. **Ships code in rounds.** Each round: the manager updates the board, then specialist agents run **in parallel git worktrees**, each implementing one card and reporting back. The manager reviews, merges, and re‑plans.
4. **Gates on humans where it matters.** Init approval, sprint/phase gates, high‑severity security findings, blocked cards, and a round cap all halt the loop and ask you.

### The team (composed per project)

Three roles are always present:

| Agent | Role | Writes code? |
|-------|------|--------------|
| **Priya** | Manager / Orchestrator | No — sole board writer; also composes the team |
| **Sofia** | Security | No (v1) — reviews diffs, escalates high/critical |
| **Dev** | QA | Tests only — verifies DoD, signs off |

Everything else is **composed from your brief**: at `/sdlc-init` Priya picks the implementation specialists the project needs (backend, frontend, mobile, ML, data, infra, docs, …), writes each as an agent into your project's `.claude/agents/`, and records the roster in `.sdlc/team.md`. No fixed developer list.

---

## How it works

- **Board is the single source of truth** (`.sdlc/kanban.md`) — and only the manager writes it.
- **Workers never touch the board.** They report by dropping files in `.sdlc/inbox/`; the manager processes them oldest‑first and moves them unchanged into `.sdlc/archive/` (a replayable project history).
- **Parallel workers, zero conflicts.** Each worker runs in its own git worktree on its own branch; the manager merges one branch at a time and turns merge conflicts into fix cards rather than resolving blindly.
- **Dynamic roster.** Priya composes specialists per project into `.claude/agents/`; a one-time restart after the first `/sdlc-init` loads them (later additions hot-load).
- **Definition of Done lives on every card** as checkboxes, each owned by the responsible role (Dev checks test boxes, Sofia security boxes, and so on). A card reaches Done only when every box is checked.
- **A Stop hook** prevents a session from ending while cards are still open — unless the board is legitimately waiting on a human.

It manages this layout inside your project:

```
.sdlc/
├── project-config.md   # methodology, checkpoints, decision log
├── team.md             # roster + role boundaries
├── kanban.md           # THE BOARD (manager only)
├── inbox/              # worker → manager messages
└── archive/            # processed messages (project history)
```

Commit `.sdlc/` — it *is* your project‑management record.

---

## Install

Boardroom is its own plugin marketplace. In Claude Code, run these as **two separate prompts**:

```
/plugin marketplace add majipa007/boardroom
```

```
/plugin install sdlc-team@boardroom
```

Then restart Claude Code (or run `/reload-plugins`). The `/sdlc-*` commands become available.

### Local / dev install (no marketplace)

Clone the repo and load the plugin for a single session:

```bash
git clone git@github.com:majipa007/boardroom.git
claude --plugin-dir ./boardroom/sdlc-team
```

Validate the plugin at any time:

```bash
claude plugin validate ./sdlc-team --strict
```

> **Note:** the marketplace is named `boardroom`; the plugin inside it is named `sdlc-team` — hence `sdlc-team@boardroom`. The dashboard command requires **Node.js ≥ 18** (no `npm install`).

---

## Usage

Start in the repository you want to build in:

| Command | What it does |
|---------|--------------|
| `/sdlc-init` | Interview you, auto‑select a methodology, scaffold `.sdlc/`, decompose the brief into a backlog, and stop for approval. |
| `/sprint [rounds]` | Run the loop: manager pass → parallel worker dispatch → repeat, until the board is clear or a checkpoint fires. Optional arg caps the rounds. |
| `/status` | Read‑only board summary. |
| `/standup` | One line per team member. |
| `/sdlc-override <methodology\|key=value>` | Change methodology or config; the manager restructures the board and logs the decision. |
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch the read‑only local web dashboard. |

Typical flow:

```
/sdlc-init          # describe what to build, approve the plan
/sprint             # let the team work in rounds until it needs you
/status             # check in anytime
```

---

## Dashboard

Run `/sdlc-dashboard` to launch a zero‑dependency local web UI (default `http://localhost:8787`). It shows **every** project that has run `/sdlc-init` (tracked in `~/.sdlc-team/projects.json`), most‑recently‑active first, and for each: the team, the live kanban board, the inbox, and the archive. It auto‑refreshes every few seconds and is strictly **read‑only** — it never modifies your projects. Pass `--root <dir>` to also scan a workspace for projects created elsewhere.

```
/sdlc-dashboard --port 8787
```

---

## Non‑goals (v1)

Dynamic team composition, external integrations (GitHub Issues / Slack / CI providers), Sofia fixing code herself, multiple concurrent boards per repo, and token budgeting beyond the round cap.

---

## Repository layout

```
boardroom/
├── .claude-plugin/
│   └── marketplace.json     # makes this repo an installable marketplace
├── sdlc-team/               # the plugin
│   ├── .claude-plugin/plugin.json
│   ├── agents/  commands/  skills/  hooks/  scripts/
│   └── README.md
└── docs/                    # build spec + implementation plans
```

## License

No license file yet — add one before sharing publicly if you want to set usage terms.

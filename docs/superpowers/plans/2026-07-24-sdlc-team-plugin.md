# sdlc-team Claude Code Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sdlc-team`, a Claude Code plugin that simulates a full software team (manager + specialist workers) and automates the SDLC end-to-end through a shared Markdown Kanban board and a file-based inbox queue.

**Architecture:** A manager agent (Priya) is the sole writer of `.sdlc/kanban.md`. Worker agents (Marcus, Elena, Jamey, Sofia, Dev) read the board, write real code in isolated git worktrees, and report back only via files dropped in `.sdlc/inbox/`. The `/sprint` command runs rounds of "manager pass → parallel worker dispatch" until the board is clear or a human checkpoint fires. A Stop hook prevents the session ending with open cards. Almost every artifact is a Markdown prompt file (agents, commands, skill); the only executable code is two POSIX shell scripts.

**Tech Stack:** Claude Code plugin format (`plugin.json`, `commands/`, `agents/`, `skills/`, `hooks/`, `scripts/`), Markdown prompt files, POSIX `bash`/`awk`, `git` (worktrees + branches), `claude plugin validate`.

## Global Constraints

- Plugin name is exactly `sdlc-team`; manifest version starts at `0.1.0`.
- Only `plugin.json` lives inside `.claude-plugin/`; every other directory (`commands/`, `agents/`, `skills/`, `hooks/`, `scripts/`) sits at plugin root.
- **Priya is the only agent that ever edits `.sdlc/kanban.md`.** Workers never edit the board — all board changes are *requests* inside inbox messages.
- Task IDs are `T-###`, monotonically increasing, assigned only by Priya.
- Inbox messages are processed oldest-first (ISO-timestamp filenames sort chronologically); after processing, Priya moves each file **unchanged** (`mv`, never rewrite) to `.sdlc/archive/`.
- A card reaches **Done only when every DoD checkbox is checked**, and a checkbox may only be checked by the role that owns it (Dev = test boxes, Sofia = security boxes, implementing worker = implementation boxes), reported via inbox and applied by Priya.
- Reference plugin files inside `hooks.json` via `${CLAUDE_PLUGIN_ROOT}`. All shell scripts must be executable (`chmod +x`).
- Worker git discipline: branch `sdlc/<task-id>-<slug>`, commit messages prefixed `[T-###]`, never commit to `main`.
- **Commit credentials for this build** (the plugin repo itself, set once in Task 1): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`. Every commit in this plan uses these. (`sudo` password `Shrestha@1234` is available if any step unexpectedly needs elevation — no planned step does.)
- Non-goals (do NOT build): dynamic team composition, external integrations (GitHub/Slack/CI), Sofia writing fixes herself, multiple concurrent boards, token budgeting beyond the round cap.

---

## File Structure

Everything is created under `sdlc-team/` at the repository root. Each file has one responsibility:

| File | Responsibility |
|------|----------------|
| `sdlc-team/.claude-plugin/plugin.json` | Plugin manifest (name, description, version). |
| `sdlc-team/skills/sdlc-board/SKILL.md` | Single source of truth for the board/card/inbox schemas, column rules, and the common worker protocol. Every agent loads this. |
| `sdlc-team/skills/sdlc-board/templates/*.md` | Verbatim starter files copied into a target project's `.sdlc/` at init. |
| `sdlc-team/commands/sdlc-init.md` | Interview → scaffold `.sdlc/` → decompose backlog → init checkpoint. |
| `sdlc-team/commands/sprint.md` | The orchestration loop (manager pass → dispatch → repeat). |
| `sdlc-team/commands/status.md` | Read-only board summary. |
| `sdlc-team/commands/standup.md` | One-line-per-agent report. |
| `sdlc-team/commands/sdlc-override.md` | Human overrides methodology/config. |
| `sdlc-team/agents/priya-manager.md` | Orchestrator; sole board writer; merges, checkpoints. |
| `sdlc-team/agents/marcus-backend.md` | Backend worker. |
| `sdlc-team/agents/elena-frontend.md` | Frontend worker. |
| `sdlc-team/agents/jamey-devops.md` | DevOps worker. |
| `sdlc-team/agents/sofia-security.md` | Security reviewer (read-only on source). |
| `sdlc-team/agents/dev-qa.md` | QA (test files only). |
| `sdlc-team/hooks/hooks.json` | Registers the Stop hook. |
| `sdlc-team/scripts/board-check.sh` | Stop-hook script: non-zero if open cards remain and not awaiting human. |
| `sdlc-team/scripts/inbox-validate.sh` | Lints one inbox file against the schema. |
| `sdlc-team/scripts/tests/*.sh` | Plain-bash fixture tests for the two scripts (no framework). |
| `sdlc-team/README.md` | Install + usage. |

**Note on prompt files vs. TDD:** Most artifacts here are Markdown prompts, not executable code — there is no unit test to fail-first for a prompt. For those, the mechanical gate is `claude plugin validate ./sdlc-team` plus the milestone acceptance scenario from the spec. Genuine TDD (write failing test → implement → pass) applies to the two shell scripts, which have real fixture tests.

---

### Task 1: Repository scaffold + manifest

**Files:**
- Create: `sdlc-team/.claude-plugin/plugin.json`
- Create: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a valid, `git`-tracked plugin skeleton that `claude plugin validate ./sdlc-team` recognizes; commit identity `majipa007 <sulavstha007@gmail.com>` configured locally for all later commits.

- [ ] **Step 1: Initialize git and configure commit identity**

Run from the repository root:

```bash
git init
git config user.name majipa007
git config user.email sulavstha007@gmail.com
git config --get user.name && git config --get user.email
```

Expected: prints `majipa007` then `sulavstha007@gmail.com`. (Local config persists in `.git/config`, so every later task's commit uses this identity even when run by a fresh subagent.)

- [ ] **Step 2: Scaffold the plugin skeleton**

Run:

```bash
mkdir -p sdlc-team/.claude-plugin sdlc-team/commands sdlc-team/agents \
         sdlc-team/skills/sdlc-board/templates sdlc-team/hooks \
         sdlc-team/scripts/tests
```

- [ ] **Step 3: Write the manifest**

Create `sdlc-team/.claude-plugin/plugin.json`:

```json
{
  "name": "sdlc-team",
  "description": "Simulates a full software development team and automates the SDLC end-to-end via a shared Markdown Kanban board, a manager orchestrator, and specialist worker agents.",
  "version": "0.1.0"
}
```

- [ ] **Step 4: Write repo .gitignore**

Create `.gitignore` at the repository root:

```gitignore
# Plugin dev artifacts
*.log
.DS_Store
```

- [ ] **Step 5: Validate the skeleton**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0. (If it warns that directories are empty, that is fine at this stage — the error we must NOT see is an invalid/malformed `plugin.json`.)

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/.claude-plugin/plugin.json .gitignore
git commit -m "feat: scaffold sdlc-team plugin manifest and repo"
```

---

### Task 2: `sdlc-board` skill + templates

**Files:**
- Create: `sdlc-team/skills/sdlc-board/SKILL.md`
- Create: `sdlc-team/skills/sdlc-board/templates/kanban.md`
- Create: `sdlc-team/skills/sdlc-board/templates/team.md`
- Create: `sdlc-team/skills/sdlc-board/templates/project-config.md`
- Create: `sdlc-team/skills/sdlc-board/templates/inbox-message.md`

**Interfaces:**
- Consumes: the plugin skeleton from Task 1.
- Produces: the `sdlc-board` skill (loaded by every agent and command via `skills: [sdlc-board]` or explicit "load the sdlc-board skill"). Defines the **common worker protocol**, the **card schema**, the **inbox message schema**, the **column rules**, and the four **templates**. All later agent/command tasks reference these by name — this is the intended architecture, not a placeholder.

- [ ] **Step 1: Write the skill file**

Create `sdlc-team/skills/sdlc-board/SKILL.md`:

````markdown
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
- **Blocked** is processed FIRST every round. Any card here MUST contain a `question:` line addressed to Priya, or `question(HUMAN):` for the human.
- A card enters **Done** only when every Definition-of-Done checkbox is checked.
- **Only Priya edits this file.** Everyone else requests changes via the inbox.

## Card schema

```markdown
### T-014 | Implement JWT refresh endpoint
- assignee: Marcus
- created-by: Priya
- phase: Sprint 2
- priority: high
- depends-on: [T-011]
- branch: sdlc/T-014-jwt-refresh          # set when work starts
- flow: worktree → implement → tests → inbox report → Sofia review → Dev QA → merge
- what: |
    Add POST /auth/refresh. Rotate refresh tokens, invalidate old token,
    return new access+refresh pair. Follow existing error envelope in src/api/errors.ts.
- definition-of-done:
  - [ ] Endpoint implemented and returns correct status codes (200/401/403)
  - [ ] Unit + integration tests written and passing (Dev verifies)
  - [ ] No new high/critical findings (Sofia signs off)
  - [ ] Branch merges cleanly to main (Priya verifies)
- status-log:
  - 2026-07-24T10:02 created by Priya
  - 2026-07-24T10:31 Marcus started (worktree created)
```

**Card rules:**
- Task IDs are `T-###`, monotonically increasing, assigned only by Priya.
- A DoD checkbox may only be checked by the role that owns it: Dev owns test boxes, Sofia owns security boxes, the implementing worker owns implementation boxes, Priya owns the merge box. Ownership is requested via inbox and applied by Priya.

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
- note(Sofia): please pay attention to token rotation logic in src/auth/refresh.ts

## New task proposals
(none)
```

**Inbox rules:**
- Workers **never** edit `kanban.md`. All board changes are *requests* in inbox messages.
- `proposed-task` messages contain a full draft card; Priya decides whether it becomes a real card.
- After processing, Priya moves the file **unchanged** to `archive/` (`mv`, not rewrite). `archive/` is a replayable project history and MUST be committed.
- `type: escalation` messages (e.g. a high/critical security finding) trigger an immediate human checkpoint.

## Common worker protocol (Marcus, Elena, Jamey, Sofia, Dev)

Read `.sdlc/kanban.md`. Find cards assigned to you in Backlog or In Progress. Work the highest-priority unblocked one. **Never edit kanban.md.** Report everything via a new file in `.sdlc/inbox/` following the message schema above. If nothing is assigned to you, scan Review/notes for anything addressed to you; if still nothing, write a GENERAL inbox message saying you are idle and end your turn.

Respect your role's hard boundaries (see `.sdlc/team.md`). If a card needs work outside your scope, do NOT do it — file a `proposed-task` so Priya can route it, and note the dependency.

Git discipline (workers that write code): work only on branch `sdlc/<task-id>-<slug>` created from `main`; prefix every commit with `[T-###]`; never commit to `main`.

DoD honesty: only ever *request* a DoD box check via inbox, and only for a box you have personally verified.

## Templates

Starter files for a target project's `.sdlc/` live in `templates/`:
- `templates/kanban.md`
- `templates/team.md`
- `templates/project-config.md`
- `templates/inbox-message.md`
````

- [ ] **Step 2: Write the kanban template**

Create `sdlc-team/skills/sdlc-board/templates/kanban.md`:

```markdown
# Kanban — <project name>
> methodology: agile | phase: Sprint 1
> last-updated: <ISO timestamp> | round: 0

## Blocked
(cards needing manager/human input — processed FIRST every round)

## Backlog

## In Progress

## Review

## Done
```

- [ ] **Step 3: Write the team template**

Create `sdlc-team/skills/sdlc-board/templates/team.md`:

```markdown
# Team Roster & Role Boundaries

| Name    | Role                    | Writes code? | Scope / hard boundaries |
|---------|-------------------------|--------------|-------------------------|
| Priya   | Manager / Orchestrator  | No           | Only writer of kanban.md. Decomposes, assigns, merges branches, runs checkpoints. Never implements features. |
| Marcus  | Backend Developer       | Yes          | APIs, business logic, DB, migrations. Never touches UI components or CI config. |
| Elena   | Frontend Developer      | Yes          | UI, components, styling, client state. Never modifies API contracts — files a card for Marcus instead. |
| Jamey   | DevOps Engineer         | Yes (infra)  | CI/CD, Docker, IaC, environments, deploy scripts. Never writes feature code. |
| Sofia   | Security Engineer       | No (v1)      | Reviews diffs, dependency/CVE scans, threat notes. Files findings as proposed tasks; never fixes code herself. |
| Dev     | QA Engineer             | Tests only   | Writes/runs tests, verifies DoD checkboxes, signs off cards. Never modifies non-test source. |
```

- [ ] **Step 4: Write the project-config template**

Create `sdlc-team/skills/sdlc-board/templates/project-config.md`:

```markdown
# Project Config
- project: <name>
- created: <date>
- methodology: agile            # chosen by model, human-overridable
- methodology-reasoning: |
    <Priya's written justification>
- sprint-length: 1 round-batch  # or waterfall phase list
- max-rounds-per-sprint: 20
- parallelism: 3                # max workers spawned concurrently per round
- human-checkpoints:
    - init-approval: required
    - sprint-or-phase-gate: required
    - security-high-severity: halt-immediately
    - blocked-escalation: after 2 rounds unresolved

## Decision Log
- <date> methodology=agile approved by human
```

- [ ] **Step 5: Write the inbox-message template**

Create `sdlc-team/skills/sdlc-board/templates/inbox-message.md`:

```markdown
---
from: <AgentName>
task: <T-### or GENERAL>
type: status-update
timestamp: <ISO timestamp>
---
## Summary
<what happened>

## Requested board changes
- <e.g. move T-### → Review>

## Notes for others
- note(<Name>): <message>

## New task proposals
(none)
```

- [ ] **Step 6: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0; the `sdlc-board` skill is recognized.

- [ ] **Step 7: Commit**

```bash
git add sdlc-team/skills/sdlc-board
git commit -m "feat: add sdlc-board skill with schemas and templates"
```

---

### Task 3: `/sdlc-init` (Agile hardcoded) + `/status`

**Files:**
- Create: `sdlc-team/commands/sdlc-init.md`
- Create: `sdlc-team/commands/status.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill and its templates (Task 2).
- Produces: `/sdlc-init` scaffolds `.sdlc/` in the target project and stops at Checkpoint 1; `/status` renders a read-only summary. `/sdlc-init` invokes `priya-manager` for board writes — but Priya does not exist until Task 4, so M1 acceptance is tested after Task 4. In M1 this command may create the initial cards itself if Priya is absent; once Task 4 lands, it delegates. Written now against the final contract (delegates to `priya-manager`).

- [ ] **Step 1: Write the /sdlc-init command**

Create `sdlc-team/commands/sdlc-init.md`:

```markdown
---
description: Initialize the SDLC board — interview the human, scaffold .sdlc/, decompose the brief into a backlog, and stop for approval.
---

Load the `sdlc-board` skill for all schemas and templates.

1. **Interview the human.** Ask, concisely: what are we building, key constraints, deadline shape, and any compliance needs.

2. **Methodology.** For now, use `agile` (hardcoded). Write it into `project-config.md`.

3. **Scaffold `.sdlc/`** by copying the skill's `templates/` and filling placeholders:
   - `.sdlc/project-config.md` — project name, today's date, `methodology: agile`, defaults kept.
   - `.sdlc/team.md` — copied verbatim.
   - `.sdlc/kanban.md` — header filled (project name, methodology, `round: 0`), all columns empty.
   - Create empty `.sdlc/inbox/` and `.sdlc/archive/` directories, each with a `.gitkeep`.

4. **Decompose the brief** into an initial backlog: at least 3 well-formed cards under `## Backlog`, each with a full Definition of Done, an assignee chosen by role boundary (see team.md), and `T-###` ids starting at `T-001`. Invoke the `priya-manager` agent to author these cards — she is the only agent permitted to write `kanban.md`.

5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the chosen methodology and the backlog summary and STOP: ask the human to approve before any code is written. On approval, delete `.sdlc/.awaiting-human`. The project is then ready for `/sprint`.
```

- [ ] **Step 2: Write the /status command**

Create `sdlc-team/commands/status.md`:

```markdown
---
description: Read-only summary of the SDLC board — column counts, blocked items, current phase, recent history.
---

Read `.sdlc/kanban.md` and the most recent files in `.sdlc/archive/`. Do NOT modify anything.

If `.sdlc/kanban.md` does not exist, tell the user to run `/sdlc-init` first and stop.

Otherwise print:
- Project name, methodology, current phase, and round number (from the board header).
- A count of cards in each column: Blocked / Backlog / In Progress / Review / Done.
- Every Blocked card: its id, title, and `question:` line.
- The last 3 archive entries (filename + one-line summary from each message's `## Summary`).
```

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0; both commands recognized.

- [ ] **Step 4: Commit**

```bash
git add sdlc-team/commands/sdlc-init.md sdlc-team/commands/status.md
git commit -m "feat: add /sdlc-init (agile) and /status commands"
```

**M1 acceptance (verify after Task 4 exists):** In a throwaway project, run `/sdlc-init`, answer the interview, approve. Result: `.sdlc/` exists with a valid board header and 3+ well-formed cards in Backlog; `/status` prints correct counts.

---

### Task 4: `priya-manager` agent

**Files:**
- Create: `sdlc-team/agents/priya-manager.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill (Task 2).
- Produces: the `priya-manager` agent — the sole board writer, invoked by `/sdlc-init`, `/sprint`, and `/sdlc-override`. Its documented behaviors that other tasks rely on: drains inbox oldest-first → archive; processes Blocked first; assigns `T-###` ids; merges Review+QA-passed branches one at a time in approval order; converts merge conflicts into fix cards; detects checkpoints and writes/clears `.sdlc/.awaiting-human`; quarantines malformed inbox messages to `.sdlc/archive/invalid/`.

- [ ] **Step 1: Write the agent**

Create `sdlc-team/agents/priya-manager.md`:

```markdown
---
name: priya-manager
description: SDLC orchestrator. Invoke to process the inbox, update the kanban board, assign work, merge branches, and run checkpoints. The ONLY agent allowed to edit .sdlc/kanban.md.
model: sonnet
maxTurns: 40
skills: [sdlc-board]
---

You are Priya, the SDLC Manager / Orchestrator. You are the ONLY agent permitted to edit `.sdlc/kanban.md`. You never write feature code, tests, or infrastructure — you decompose, assign, merge, and run checkpoints. Load the `sdlc-board` skill first for all schemas.

## Your pass — run in exactly this order

1. **Drain the inbox, oldest first.** List `.sdlc/inbox/` sorted by filename (ISO timestamps sort chronologically). For each message:
   - Validate it against the inbox schema. If malformed, `mv` it to `.sdlc/archive/invalid/` (create the dir if needed) and note the quarantine in the round log; continue to the next message.
   - Apply the "Requested board changes" you agree with (move cards, check DoD boxes). Only check a DoD box if the requesting role owns it (Dev = test boxes, Sofia = security boxes, implementing worker = implementation boxes, you = the merge box) AND the message is that owning role's own report.
   - Record `note(X)` items so the addressed agent sees them next round.
   - Turn `proposed-task` drafts into real cards only if you accept them; assign a fresh `T-###` id.
   - After processing, `mv` the file UNCHANGED to `.sdlc/archive/`. Never rewrite it.

2. **Process the Blocked column first.** A card with `question(HUMAN):` is a checkpoint (step 5). A Blocked card unresolved for 2 consecutive rounds is a blocked-escalation checkpoint.

3. **Decompose new requirements** into cards with a full Definition of Done; assign by role boundary. Task IDs are `T-###`, monotonically increasing, assigned only by you. Never dispatch or advance a card whose `depends-on` cards are not all in Done.

4. **Decide merges.** For cards whose every DoD box is checked, merge the worker branch to `main` one at a time, in Review-approval order. On a merge conflict, do NOT resolve blindly: create a fix card for the original assignee, leave `main` untouched, and log it.

5. **Detect checkpoint conditions** — init approval, sprint/phase gate, security high/critical (`type: escalation`), blocked escalation, and round-cap breach (`max-rounds-per-sprint`, default 20). If any fires: write an empty `.sdlc/.awaiting-human`, present a summary, and STOP so the human can decide in-conversation. When the human responds and work resumes, delete `.sdlc/.awaiting-human`.

6. **Update the board header** (`last-updated`, `round`) and append every human decision to `project-config.md`'s Decision Log with today's date.

## Hard rules
- Only YOU edit `kanban.md`.
- Never write feature/test/infra code.
- Merge order is Review-approval order, one branch at a time; conflicts become fix cards, never blind resolutions.
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0; `priya-manager` recognized.

- [ ] **Step 3: Manual M1 acceptance**

In a throwaway directory: `claude --plugin-dir ./sdlc-team`, run `/sdlc-init` with a small brief, approve. Confirm `.sdlc/kanban.md` has 3+ valid cards and `/status` reports them. This closes M1.

- [ ] **Step 4: Commit**

```bash
git add sdlc-team/agents/priya-manager.md
git commit -m "feat: add priya-manager orchestrator agent"
```

---

### Task 5: `marcus-backend` agent

**Files:**
- Create: `sdlc-team/agents/marcus-backend.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill (common worker protocol) and Priya's inbox contract (Task 4).
- Produces: the `marcus-backend` worker, invoked by `/sprint` with a task id. Works exactly one card, on branch `sdlc/<task-id>-<slug>`, commits with `[T-###]` prefix, reports only via inbox. No worktree isolation yet (added in Task 9, per roadmap M4).

- [ ] **Step 1: Write the agent**

Create `sdlc-team/agents/marcus-backend.md`:

```markdown
---
name: marcus-backend
description: Backend developer persona. Invoke with a task ID to implement backend cards from the kanban board.
model: sonnet
maxTurns: 30
skills: [sdlc-board]
---

You are Marcus, the Backend Developer. Load the `sdlc-board` skill and follow the common worker protocol there.

## Scope (hard boundaries)
- You own: APIs, business logic, database, migrations.
- You NEVER touch: UI components, styling, client state, CI config, infrastructure.
- If a card needs frontend or infra work, do NOT do it — file a `proposed-task` inbox message so Priya can route it to Elena or Jamey, and note the dependency on your card.

## Git discipline
- Work only on branch `sdlc/<task-id>-<slug>` created from `main`. Never commit to `main`.
- Prefix every commit message with `[T-###]`.

## Definition-of-Done honesty
- Only ever *request* a DoD box check via an inbox message — never edit `kanban.md`.
- Only request a check for a box you have personally verified.

Work exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/agents/marcus-backend.md
git commit -m "feat: add marcus-backend worker agent"
```

---

### Task 6: `/sprint` sequential loop

**Files:**
- Create: `sdlc-team/commands/sprint.md`

**Interfaces:**
- Consumes: `priya-manager` (Task 4) and `marcus-backend` (Task 5).
- Produces: `/sprint` — runs rounds of "manager pass → one worker" sequentially. Optional arg `$1` = rounds to run before pausing. Parallel dispatch is added in Task 9.

- [ ] **Step 1: Write the command**

Create `sdlc-team/commands/sprint.md`:

```markdown
---
description: Run the SDLC orchestration loop — manager pass then worker dispatch, repeating until the board is clear or a checkpoint fires.
argument-hint: [rounds]
---

Optional argument `$1` = number of rounds to run before pausing (default: run until Done or a checkpoint).

Repeat until (all cards are in Done) OR (a checkpoint fires) OR (the round cap is reached) OR ($1 rounds have run):

**ROUND n:**

1. **Manager pass (sequential, sole board writer).** Invoke the `priya-manager` agent. She drains the inbox → archive, updates the board, processes Blocked first, merges approved branches, (re)assigns cards, and detects checkpoint conditions. If a checkpoint fires, she writes `.sdlc/.awaiting-human`, presents a summary, and you STOP — ask the human and wait.

2. **Dispatch (one worker, sequential).** Identify the single highest-priority actionable card (Backlog/In Progress assigned to a worker, or a Review card awaiting a reviewer's sign-off) whose `depends-on` cards are all Done. Invoke its assigned worker agent with the task id. The worker works exactly ONE card, writes inbox message(s), and terminates.

3. Next round — the manager pass drains the new inbox messages.

Report a one-line progress note after each round.
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 3: Manual M2 acceptance**

In a throwaway project with an initialized board holding one backend card: run `/sprint`. Confirm the card travels Backlog → In Progress → Review → Done, real code is committed on a `sdlc/T-...` branch, every transition is driven by an inbox message, and `.sdlc/archive/` contains the full trail. This closes M2.

- [ ] **Step 4: Commit**

```bash
git add sdlc-team/commands/sprint.md
git commit -m "feat: add /sprint sequential orchestration loop"
```

---

### Task 7: `elena-frontend` + `jamey-devops` agents

**Files:**
- Create: `sdlc-team/agents/elena-frontend.md`
- Create: `sdlc-team/agents/jamey-devops.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill.
- Produces: two more workers with the same protocol/git-discipline contract as Marcus, differing only in scope. No worktree isolation yet (Task 9).

- [ ] **Step 1: Write elena-frontend**

Create `sdlc-team/agents/elena-frontend.md`:

```markdown
---
name: elena-frontend
description: Frontend developer persona. Invoke with a task ID to implement UI cards from the kanban board.
model: sonnet
maxTurns: 30
skills: [sdlc-board]
---

You are Elena, the Frontend Developer. Load the `sdlc-board` skill and follow the common worker protocol there.

## Scope (hard boundaries)
- You own: UI, components, styling, client state.
- You NEVER modify API contracts. If a card needs an API change, do NOT change it — file a `proposed-task` for Marcus and note the dependency on your card.
- You NEVER write infrastructure or CI config.

## Git discipline
- Work only on branch `sdlc/<task-id>-<slug>` created from `main`. Never commit to `main`.
- Prefix every commit message with `[T-###]`.

## Definition-of-Done honesty
- Only ever *request* a DoD box check via an inbox message — never edit `kanban.md`.
- Only request a check for a box you have personally verified.

Work exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 2: Write jamey-devops**

Create `sdlc-team/agents/jamey-devops.md`:

```markdown
---
name: jamey-devops
description: DevOps engineer persona. Invoke with a task ID to implement CI/CD, container, IaC, and deploy cards from the kanban board.
model: sonnet
maxTurns: 30
skills: [sdlc-board]
---

You are Jamey, the DevOps Engineer. Load the `sdlc-board` skill and follow the common worker protocol there.

## Scope (hard boundaries)
- You own: CI/CD, Docker, IaC, environments, deploy scripts.
- You NEVER write feature code (backend or frontend). If a card needs feature code, do NOT write it — file a `proposed-task` for Marcus or Elena.

## Git discipline
- Work only on branch `sdlc/<task-id>-<slug>` created from `main`. Never commit to `main`.
- Prefix every commit message with `[T-###]`.
- Note on the card if a task must run against shared local infra and therefore cannot be isolated in a worktree.

## Definition-of-Done honesty
- Only ever *request* a DoD box check via an inbox message — never edit `kanban.md`.
- Only request a check for a box you have personally verified.

Work exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add sdlc-team/agents/elena-frontend.md sdlc-team/agents/jamey-devops.md
git commit -m "feat: add elena-frontend and jamey-devops worker agents"
```

---

### Task 8: `sofia-security` + `dev-qa` agents (review/QA gates)

**Files:**
- Create: `sdlc-team/agents/sofia-security.md`
- Create: `sdlc-team/agents/dev-qa.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill; Priya's DoD-ownership + escalation contract (Task 4).
- Produces: Sofia (read-only on source; `review-result`/`proposed-task`/`escalation` messages; high/critical → escalation) and Dev (`dod-check` messages for test boxes). These are the review + QA gates: with them plus Priya's rules, a card cannot reach Done without Sofia's security sign-off and Dev's test sign-off. No worktree isolation on Dev yet (added Task 9).

> **Builder decision (from spec §6.3 builder note):** Sofia and Dev both need to create inbox files, and path-scoped `disallowedTools` ("write only inside `.sdlc/inbox/`") is not reliably expressible in the current plugin frontmatter. Per the spec's fallback, we DROP `disallowedTools` and enforce the read-only-on-source boundary as a hard prompt rule for v1.

- [ ] **Step 1: Write sofia-security**

Create `sdlc-team/agents/sofia-security.md`:

```markdown
---
name: sofia-security
description: Security reviewer persona. Invoke to review a branch/diff for a card in Review. Read-only on source; reports findings via inbox only.
model: sonnet
maxTurns: 20
skills: [sdlc-board]
---

You are Sofia, the Security Engineer. Load the `sdlc-board` skill.

## Scope (hard boundaries — v1)
- You are READ-ONLY on all source. You NEVER modify, fix, or write code or tests.
- Your ONLY write action is creating a message file inside `.sdlc/inbox/`. Do not create or edit any other file.

## What you do
- Review the card's branch diff: `git diff main...sdlc/<task-id>-<slug>`.
- Run dependency/CVE checks appropriate to the stack.
- Severity-rate every finding: `low | medium | high | critical`.
- If clean: file a `review-result` inbox message signing off, requesting the security DoD box be checked.
- If low/medium fixes are needed: file `proposed-task` messages with full draft cards for the original assignee.
- **Any `high` or `critical` finding: file a `type: escalation` message.** This triggers an immediate human checkpoint — Priya halts the loop.

Report via inbox only, then end your turn.
```

- [ ] **Step 2: Write dev-qa**

Create `sdlc-team/agents/dev-qa.md`:

```markdown
---
name: dev-qa
description: QA engineer persona. Invoke to check out a card's branch, run and write tests, and verify DoD checkboxes. Modifies test files only.
model: sonnet
maxTurns: 20
skills: [sdlc-board]
---

You are Dev, the QA Engineer. Load the `sdlc-board` skill.

## Scope (hard boundaries)
- You write and run tests ONLY. You NEVER modify non-test source.
- If a test reveals a bug needing a source fix, file a `proposed-task` for the original assignee — do not fix it yourself.

## What you do
- Check out the card's branch.
- Run the existing test suite. Write any tests the card's DoD requires that are missing.
- Report pass/fail per DoD checkbox via a `dod-check` inbox message, requesting checks only for test-related boxes you have verified pass.

Report via inbox only, then end your turn.
```

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 4: Manual M3 acceptance**

In a throwaway project, drive one card through `/sprint` with the full team. Confirm the card cannot reach Done without both a Sofia `review-result` sign-off and a Dev `dod-check` pass in `.sdlc/archive/`. Add a card whose implementation pulls a known-vulnerable dependency; confirm Sofia files a `type: escalation` and Priya halts for the human. This closes M3.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/agents/sofia-security.md sdlc-team/agents/dev-qa.md
git commit -m "feat: add sofia-security and dev-qa review/QA agents"
```

---

### Task 9: Parallel dispatch + worktree isolation

**Files:**
- Modify: `sdlc-team/agents/marcus-backend.md` (add `isolation: worktree`)
- Modify: `sdlc-team/agents/elena-frontend.md` (add `isolation: worktree`)
- Modify: `sdlc-team/agents/jamey-devops.md` (add `isolation: worktree`)
- Modify: `sdlc-team/agents/dev-qa.md` (add `isolation: worktree`)
- Modify: `sdlc-team/commands/sprint.md` (dispatch step → parallel batch)

**Interfaces:**
- Consumes: all workers (Tasks 5, 7, 8), Priya's merge-order/conflict-to-fix-card contract (Task 4).
- Produces: workers each run in their own git worktree (parallel-safe code writing); `/sprint` dispatches up to `parallelism` workers in one parallel batch, one card per worker per round. Sofia stays without isolation (read-only). Priya already merges one branch at a time and converts conflicts to fix cards (Task 4) — no change needed there.

- [ ] **Step 1: Add worktree isolation to the four code/test workers**

In each of `marcus-backend.md`, `elena-frontend.md`, `jamey-devops.md`, `dev-qa.md`, add one line to the YAML frontmatter, immediately after the `maxTurns:` line:

```yaml
isolation: worktree
```

For example, `marcus-backend.md` frontmatter becomes:

```yaml
---
name: marcus-backend
description: Backend developer persona. Invoke with a task ID to implement backend cards from the kanban board.
model: sonnet
maxTurns: 30
isolation: worktree
skills: [sdlc-board]
---
```

(Sofia gets NO isolation — she only reads source and writes inbox files.)

- [ ] **Step 2: Rewrite the /sprint dispatch step to run parallel**

In `sdlc-team/commands/sprint.md`, replace step 2 ("Dispatch (one worker, sequential)...") with:

```markdown
2. **Dispatch (parallel).** Collect the set of distinct agents that now have an actionable card (a Backlog/In Progress card assigned to them, or a Review card awaiting their sign-off) whose `depends-on` cards are all Done. Spawn up to `parallelism` (from `project-config.md`, default 3) worker subagents IN PARALLEL — one Task-tool invocation per agent, all batched in a single message so they run concurrently. Each worker: its own worktree (`isolation: worktree`), works exactly ONE card, writes inbox message(s), and terminates.

   Safety rails: one card per worker per round; respect the parallelism cap; never dispatch a card whose `depends-on` is not Done; if two dispatched cards obviously touch the same area, Priya serializes them across rounds instead (she notes this in the card's status-log during her pass).
```

- [ ] **Step 3: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 4: Manual M4 acceptance**

In a throwaway project with two independent cards (e.g. one backend, one frontend, no shared files), run `/sprint`. Confirm both complete in the same round on separate `sdlc/T-...` branches and both merge cleanly. Then induce a conflict (two cards editing the same file); confirm Priya produces a fix card instead of a broken `main`. This closes M4.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/agents/marcus-backend.md sdlc-team/agents/elena-frontend.md \
        sdlc-team/agents/jamey-devops.md sdlc-team/agents/dev-qa.md \
        sdlc-team/commands/sprint.md
git commit -m "feat: parallel worker dispatch with worktree isolation"
```

---

### Task 10: Methodology auto-selection + `/sdlc-override` + `/standup`

**Files:**
- Modify: `sdlc-team/commands/sdlc-init.md` (replace hardcoded-Agile step with the §7 decision guide)
- Create: `sdlc-team/commands/sdlc-override.md`
- Create: `sdlc-team/commands/standup.md`

**Interfaces:**
- Consumes: `priya-manager` (Task 4), the `sdlc-board` skill.
- Produces: `/sdlc-init` now has Priya auto-select methodology from the brief and record reasoning; `/sdlc-override` lets the human change methodology/config with Priya restructuring phase metadata and logging; `/standup` prints a per-agent one-liner.

- [ ] **Step 1: Replace the methodology step in /sdlc-init**

In `sdlc-team/commands/sdlc-init.md`, replace step 2 ("**Methodology.** For now, use `agile` (hardcoded)...") with:

```markdown
2. **Methodology (Priya auto-selects).** Based on the brief, Priya chooses the methodology using this guide, and writes both the choice and a written justification into `project-config.md`'s `methodology` and `methodology-reasoning` fields:
   - Requirements vague / expected to evolve, iterative feedback OK → **agile** (sprints; sprint reviews are the gates).
   - Continuous small stream of tasks, no natural sprint rhythm → **kanban** (no sprints; gate every N completed cards or a human-set cadence).
   - Requirements fixed & fully known, compliance/contractual, hard sequential dependencies → **waterfall** (phase gates: Requirements → Design → Implementation → Verification → Release).
   - Fixed core spec + exploratory feature layer → **hybrid** (waterfall skeleton, agile inside Implementation).
   - Signals mixed → default to **agile**.

   The methodology controls only how Priya batches work, where gates fall, and what a "round" means — the queue/board mechanics never change. The human may override the choice at Checkpoint 1 (step 5) or later via `/sdlc-override`.
```

- [ ] **Step 2: Write /sdlc-override**

Create `sdlc-team/commands/sdlc-override.md`:

```markdown
---
description: Human override of methodology or a config value; Priya restructures phase metadata and logs the decision.
argument-hint: <methodology | key=value>
---

Argument `$1`: either a methodology (`agile | kanban | waterfall | hybrid`) or a `key=value` config change (e.g. `parallelism=5`).

Invoke the `priya-manager` agent to:
1. Apply the change to `.sdlc/project-config.md`.
2. If the methodology changed, restructure the board header's phase/sprint metadata in `kanban.md` accordingly (agile → sprints, waterfall → phase list, kanban → no sprints, hybrid → waterfall skeleton with agile Implementation).
3. Append the change to the Decision Log in `project-config.md` with today's date.
```

- [ ] **Step 3: Write /standup**

Create `sdlc-team/commands/standup.md`:

```markdown
---
description: One-line-per-agent standup synthesized from the board and recent archive.
---

Read `.sdlc/kanban.md` and the recent `.sdlc/archive/` messages. Modify nothing.

For each team member (Priya, Marcus, Elena, Jamey, Sofia, Dev), print exactly one line describing what they last finished and what they are starting next, e.g. `Marcus: finished T-014, starting T-016.` If a member has no recent activity, print `<Name>: idle.`
```

- [ ] **Step 4: Validate**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0.

- [ ] **Step 5: Manual acceptance (methodology auto-pick)**

In a throwaway project, run `/sdlc-init` with a "fixed-spec compliance project" brief. Confirm Priya auto-picks `waterfall` with a written `methodology-reasoning`. Run `/sdlc-override kanban` and confirm the header metadata and Decision Log update.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/commands/sdlc-init.md sdlc-team/commands/sdlc-override.md \
        sdlc-team/commands/standup.md
git commit -m "feat: methodology auto-selection, /sdlc-override, /standup"
```

---

### Task 11: `board-check.sh` Stop hook + `hooks.json` + round cap

**Files:**
- Create: `sdlc-team/scripts/board-check.sh`
- Create: `sdlc-team/scripts/tests/test-board-check.sh`
- Create: `sdlc-team/hooks/hooks.json`

**Interfaces:**
- Consumes: the board format (Task 2), Priya's `.sdlc/.awaiting-human` flag (Task 4).
- Produces: a Stop hook that blocks session end while any card sits outside Done AND `.sdlc/.awaiting-human` is absent. Contract: `board-check.sh` run from the target project root exits `0` (allow stop) when there is no board, or the flag exists, or all cards are in Done; exits `2` (block stop) with a stderr message when open cards remain and no flag is set.

This is the one genuinely testable script — TDD it.

- [ ] **Step 1: Write the failing test**

Create `sdlc-team/scripts/tests/test-board-check.sh`:

```bash
#!/usr/bin/env bash
# Fixture tests for board-check.sh. No framework — asserts on exit codes.
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/board-check.sh"
fails=0

run_case() {
  # $1 = description, $2 = expected exit code; board content on stdin, flag via $FLAG
  local desc="$1" expected="$2"
  local dir; dir="$(mktemp -d)"
  mkdir -p "$dir/.sdlc"
  cat > "$dir/.sdlc/kanban.md"
  [ "${FLAG:-0}" = "1" ] && : > "$dir/.sdlc/.awaiting-human"
  ( cd "$dir" && bash "$SCRIPT" ) >/dev/null 2>&1
  local got=$?
  if [ "$got" != "$expected" ]; then
    echo "FAIL: $desc (expected $expected, got $got)"; fails=1
  else
    echo "ok: $desc"
  fi
  rm -rf "$dir"
}

# 1. Card outside Done, no flag → block (2)
FLAG=0 run_case "open card blocks" 2 <<'EOF'
## Backlog
### T-001 | do a thing
## Done
EOF

# 2. All cards in Done → allow (0)
FLAG=0 run_case "all done allows" 0 <<'EOF'
## Backlog
## Done
### T-001 | finished thing
EOF

# 3. Open card but awaiting-human flag set → allow (0)
FLAG=1 run_case "awaiting-human allows despite open card" 0 <<'EOF'
## Backlog
### T-001 | do a thing
## Done
EOF

# 4. No board file at all → allow (0)
dir="$(mktemp -d)"; ( cd "$dir" && bash "$SCRIPT" ) >/dev/null 2>&1
[ $? -eq 0 ] && echo "ok: no board allows" || { echo "FAIL: no board allows"; fails=1; }
rm -rf "$dir"

exit "$fails"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash sdlc-team/scripts/tests/test-board-check.sh`
Expected: FAIL — `board-check.sh` does not exist yet (cases error / non-matching exit codes; script exits 1).

- [ ] **Step 3: Write the script**

Create `sdlc-team/scripts/board-check.sh`:

```bash
#!/usr/bin/env bash
# Stop hook: block session end while open cards remain on the SDLC board.
# Exit 0 = allow stop; exit 2 = block stop (message on stderr fed back to Claude).
set -euo pipefail

BOARD=".sdlc/kanban.md"
FLAG=".sdlc/.awaiting-human"

# No board → nothing to guard.
[ -f "$BOARD" ] || exit 0
# Legitimately waiting for a human → allow stop.
[ -f "$FLAG" ] && exit 0

# Count cards ("### T-...") that are NOT under the "## Done" column.
open=$(awk '
  /^## / { in_done = ($0 == "## Done"); next }
  /^### T-/ { if (!in_done) count++ }
  END { print count+0 }
' "$BOARD")

if [ "$open" -gt 0 ]; then
  echo "Open cards remain on the SDLC board ($open outside Done) — continue the sprint loop or ask the human." >&2
  exit 2
fi
exit 0
```

Then make it executable:

```bash
chmod +x sdlc-team/scripts/board-check.sh
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash sdlc-team/scripts/tests/test-board-check.sh`
Expected: all four cases print `ok:`; script exits 0.

- [ ] **Step 5: Write hooks.json**

Create `sdlc-team/hooks/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/board-check.sh"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Validate and confirm the round cap is covered**

Run: `claude plugin validate ./sdlc-team`
Expected: exits 0; the Stop hook is registered.

The round-cap breach checkpoint is already handled by Priya (Task 4, step 5 — she detects `max-rounds-per-sprint` and halts). No extra code needed; confirm that line is present in `priya-manager.md`.

- [ ] **Step 7: Commit**

```bash
git add sdlc-team/scripts/board-check.sh sdlc-team/scripts/tests/test-board-check.sh \
        sdlc-team/hooks/hooks.json
git commit -m "feat: add Stop hook and board-check.sh with tests"
```

- [ ] **Step 8: Manual M5 acceptance**

In a throwaway project with an open card and no `.sdlc/.awaiting-human`, try to end the session — confirm the Stop hook blocks it with the message. Create `.sdlc/.awaiting-human` and confirm the session can now end. This, with Task 10, closes M5.

---

### Task 12: `inbox-validate.sh` + malformed-message handling

**Files:**
- Create: `sdlc-team/scripts/inbox-validate.sh`
- Create: `sdlc-team/scripts/tests/test-inbox-validate.sh`

**Interfaces:**
- Consumes: the inbox message schema (Task 2).
- Produces: `inbox-validate.sh <file>` — exits `0` and prints `OK: <file>` for a schema-valid message; exits non-zero and prints `INVALID: <reason>` on stderr otherwise. Priya already quarantines malformed messages to `.sdlc/archive/invalid/` (Task 4); this script is the optional lint tool the spec calls for (M6).

- [ ] **Step 1: Write the failing test**

Create `sdlc-team/scripts/tests/test-inbox-validate.sh`:

```bash
#!/usr/bin/env bash
# Fixture tests for inbox-validate.sh.
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/inbox-validate.sh"
fails=0

check() {
  local desc="$1" expected="$2" file="$3"
  bash "$SCRIPT" "$file" >/dev/null 2>&1
  local got=$?
  if [ "$got" != "$expected" ]; then
    echo "FAIL: $desc (expected $expected, got $got)"; fails=1
  else
    echo "ok: $desc"
  fi
}

dir="$(mktemp -d)"

cat > "$dir/valid.md" <<'EOF'
---
from: Marcus
task: T-014
type: status-update
timestamp: 2026-07-24T11:47:00Z
---
## Summary
Did the thing.
EOF
check "valid message passes" 0 "$dir/valid.md"

cat > "$dir/badtype.md" <<'EOF'
---
from: Marcus
task: T-014
type: gossip
timestamp: 2026-07-24T11:47:00Z
---
## Summary
Did the thing.
EOF
check "bad type fails" 1 "$dir/badtype.md"

cat > "$dir/nosummary.md" <<'EOF'
---
from: Marcus
task: T-014
type: question
timestamp: 2026-07-24T11:47:00Z
---
No summary heading here.
EOF
check "missing summary fails" 1 "$dir/nosummary.md"

cat > "$dir/nofrom.md" <<'EOF'
---
task: T-014
type: question
timestamp: 2026-07-24T11:47:00Z
---
## Summary
x
EOF
check "missing from fails" 1 "$dir/nofrom.md"

check "missing file fails" 1 "$dir/does-not-exist.md"

rm -rf "$dir"
exit "$fails"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash sdlc-team/scripts/tests/test-inbox-validate.sh`
Expected: FAIL — `inbox-validate.sh` does not exist.

- [ ] **Step 3: Write the script**

Create `sdlc-team/scripts/inbox-validate.sh`:

```bash
#!/usr/bin/env bash
# Lint one inbox message against the schema in the sdlc-board skill.
# Exit 0 + "OK: <file>" if valid; exit 1 + "INVALID: <reason>" (stderr) otherwise.
set -uo pipefail

f="${1:-}"
[ -n "$f" ] || { echo "usage: inbox-validate.sh <file>" >&2; exit 1; }
[ -f "$f" ] || { echo "INVALID: file not found: $f" >&2; exit 1; }

errs=0
require() { grep -qE "^$1:" "$f" || { echo "INVALID: missing frontmatter '$1'" >&2; errs=1; }; }
require from
require task
require type
require timestamp

type=$(grep -E '^type:' "$f" | head -1 | sed 's/^type:[[:space:]]*//' | tr -d '[:space:]')
case "$type" in
  status-update|dod-check|question|proposed-task|review-result|escalation) ;;
  *) echo "INVALID: bad or missing type '$type'" >&2; errs=1 ;;
esac

grep -q '^## Summary' "$f" || { echo "INVALID: missing '## Summary' section" >&2; errs=1; }

if [ "$errs" -eq 0 ]; then
  echo "OK: $f"
  exit 0
fi
exit 1
```

Then:

```bash
chmod +x sdlc-team/scripts/inbox-validate.sh
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash sdlc-team/scripts/tests/test-inbox-validate.sh`
Expected: all five cases print `ok:`; script exits 0.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/inbox-validate.sh sdlc-team/scripts/tests/test-inbox-validate.sh
git commit -m "feat: add inbox-validate.sh with tests"
```

---

### Task 13: README + strict validation + end-to-end demo

**Files:**
- Create: `sdlc-team/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: install + usage documentation; a `claude plugin validate --strict` pass; a recorded end-to-end demo run. Closes M6.

- [ ] **Step 1: Write the README**

Create `sdlc-team/README.md`:

```markdown
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

## How it works

- **Board is the single source of truth** (`.sdlc/kanban.md`) and only Priya writes it.
- **Workers communicate via `.sdlc/inbox/`**; Priya processes messages oldest-first and moves them unchanged to `.sdlc/archive/` (a replayable history).
- **Parallel workers, zero conflicts**: each worker runs in its own git worktree; Priya merges one branch at a time and turns conflicts into fix cards.
- **Definition of Done** lives on every card as checkboxes, each owned by the responsible role.
- **Checkpoints** (init approval, sprint/phase gate, high/critical security finding, blocked escalation, round-cap) halt the loop and ask you. A Stop hook prevents the session ending with open cards unless `.sdlc/.awaiting-human` is set.

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
```

- [ ] **Step 2: Run the script test suites once more**

Run:
```bash
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
```
Expected: both exit 0, all `ok:` lines.

- [ ] **Step 3: Strict validation**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0 with no errors. (If `--strict` flags anything — e.g. a missing manifest field — fix it and re-run before committing.)

- [ ] **Step 4: End-to-end demo**

In a fresh throwaway directory, run `claude --plugin-dir <abs-path>/sdlc-team`, then build a small real app (e.g. a URL shortener) entirely through `/sdlc-init` + `/sprint`. Confirm: the board runs to all-Done; `.sdlc/archive/` + `git log` alone let you reconstruct the project state (spec §13 replayability check). Record a short note of the run in the commit message.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/README.md
git commit -m "docs: add README; pass strict validation and e2e demo"
```

---

## Spec §13 testing checklist (verify during the demo)

These are covered by the tasks noted; confirm each during the M6 end-to-end run:

- [ ] Board schema round-trip: Priya parses and rewrites every card without data loss (Task 4).
- [ ] Inbox ordering: messages processed oldest-first; archive filenames identical to inbox (Task 4 + skill rules).
- [ ] Boundary enforcement: Elena given a backend card refuses and files a `question`/`proposed-task` (Task 7).
- [ ] DoD integrity: a worker claiming an unverified DoD box is rejected by Priya's ownership rule (Task 4 + skill).
- [ ] Parallel round: no two workers write the same file on `main`; workers never edit the board (Task 9).
- [ ] Checkpoint halts actually stop generation and wait for human input (Tasks 4, 6).
- [ ] Stop hook: blocks stop with open cards; does NOT block while `.awaiting-human` exists (Task 11 — automated test).
- [ ] Replayability: project state reconstructable from `archive/` + `git log` alone (Task 13 demo).

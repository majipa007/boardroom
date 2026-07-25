# project.md — SDLC Automation Plugin for Claude Code

> **Purpose of this document:** This is the complete build specification for a Claude Code plugin
> called `sdlc-team`. Hand this file to Claude Code and build the plugin milestone by milestone
> (see §12 Build Roadmap). Everything needed — architecture, file schemas, agent prompts,
> command specs, hooks, and protocols — is defined here.

---

## 1. Vision

A Claude Code plugin that simulates a full software development team and automates the SDLC
end-to-end. A **manager agent (orchestrator)** decomposes work, assigns it on a **shared
Markdown Kanban board**, and **specialist worker agents** (frontend, backend, DevOps, security,
QA) pick up their assigned cards, **write real code in the actual repository**, and report back
through a **file-based message queue**. Work continues in rounds until the board is clear.
Humans intervene only at defined checkpoints.

Key properties:

- **Board as single source of truth.** All coordination happens through `.sdlc/kanban.md`.
- **Manager is the only writer of the board.** Workers communicate via an `inbox/` queue;
  processed messages move to `archive/` (which doubles as the full project history).
- **Parallel workers, zero conflicts.** Workers run as parallel subagents with
  `isolation: "worktree"` so each writes code in its own git worktree/branch. The manager
  merges. The inbox queue prevents board write conflicts; worktrees prevent code write conflicts.
- **SDLC methodology is auto-selected by the model** at init (Agile / Kanban-flow / Waterfall /
  hybrid), with reasoning recorded, and **overridable by the human** at the init checkpoint.
- **Definition of Done lives on every card** as checkboxes. Done is mechanical, not vibes.
- **Continuous re-checking.** After each round, every agent's context is effectively "read the
  board again — anything for me?" A Stop hook prevents the session from ending with open cards.

---

## 2. The Team (personas)

Defined in `.sdlc/team.md` at project init. Fixed roster for v1:

| Name    | Role                    | Writes code? | Scope / hard boundaries                                                                 |
|---------|-------------------------|--------------|------------------------------------------------------------------------------------------|
| Priya   | Manager / Orchestrator  | No           | Only writer of `kanban.md`. Decomposes, assigns, merges branches, runs checkpoints. Never implements features. |
| Marcus  | Backend Developer       | Yes          | APIs, business logic, DB, migrations. Never touches UI components or CI config.           |
| Elena   | Frontend Developer      | Yes          | UI, components, styling, client state. Never modifies API contracts — files a card for Marcus instead. |
| Jamey   | DevOps Engineer         | Yes (infra)  | CI/CD, Docker, IaC, environments, deploy scripts. Never writes feature code.               |
| Sofia   | Security Engineer       | No (v1)      | Reviews diffs, dependency/CVE scans, threat notes. Files findings as *proposed tasks*; never fixes code herself. |
| Dev     | QA Engineer             | Tests only   | Writes/runs tests, verifies DoD checkboxes, signs off cards. Never modifies non-test source. |

Boundaries are enforced two ways: (a) written as hard rules in each agent's system prompt, and
(b) where possible via agent frontmatter `disallowedTools` / tool restrictions (e.g. Sofia gets
read + inbox-write only; see §6).

---

## 3. On-disk layout inside the target project

The plugin operates on whatever repository the user runs Claude Code in. It creates and manages:

```
<user-project>/
├── .sdlc/
│   ├── project-config.md      # methodology, phases/sprints, checkpoint rules, decision log
│   ├── team.md                # roster + role boundaries (copied from plugin template)
│   ├── kanban.md              # THE BOARD — written only by Priya
│   ├── inbox/                 # worker → manager messages (one file per message)
│   │   └── <ISO-timestamp>_<agent>_<task-id>.md
│   └── archive/               # processed inbox messages, moved here verbatim by Priya
│       └── ... (same filenames — replayable project history)
├── src/ ...                   # real code written by workers (whatever the project is)
└── ...
```

`.sdlc/` should be committed to git (it *is* the project management record). Add
`.sdlc/inbox/` contents to short-lived commits or leave untracked until archived — builder's
choice, but **archive/ must be committed** so history survives.

---

## 4. File schemas (contracts — agents must follow these exactly)

### 4.1 `kanban.md`

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

### 4.2 Card schema (lives under a column heading)

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

Rules:
- Task IDs are `T-###`, monotonically increasing, assigned only by Priya.
- A card moves to **Done only when every DoD checkbox is checked**, and checkboxes may only be
  checked by the role responsible for them (Dev checks test boxes, Sofia checks security boxes, etc.),
  reported via inbox and applied by Priya.
- Any card in **Blocked** must contain a `question:` line addressed to Priya or `question(HUMAN):`.

### 4.3 Inbox message schema

One file per message: `.sdlc/inbox/<ISO-timestamp>_<agent>_<task-or-GENERAL>.md`

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

Rules:
- Workers **never** edit `kanban.md`. All board changes are *requests* in inbox messages.
- `proposed-task` messages contain a full draft card; Priya decides whether it becomes a real card.
- After processing, Priya moves the file **unchanged** to `archive/` (mv, not rewrite).

### 4.4 `project-config.md`

```markdown
# Project Config
- project: <name>
- created: <date>
- methodology: agile            # chosen by model, human-overridable
- methodology-reasoning: |
    <Priya's written justification — see §7>
- sprint-length: 1 round-batch  # or waterfall phase list
- max-rounds-per-sprint: 20
- parallelism: 3                # max workers spawned concurrently per round
- human-checkpoints:
    - init-approval: required
    - sprint-or-phase-gate: required
    - security-high-severity: halt-immediately
    - blocked-escalation: after 2 rounds unresolved
## Decision Log
- 2026-07-24 methodology=agile approved by human
```

---

## 5. Plugin structure (confirmed against official Claude Code plugin spec)

```
sdlc-team/
├── .claude-plugin/
│   └── plugin.json
├── commands/                       # slash commands (flat .md prompt files)
│   ├── sdlc-init.md                # /sdlc-init  — interview, methodology choice, board creation
│   ├── sprint.md                   # /sprint     — run the orchestration loop
│   ├── status.md                   # /status     — human-readable board summary
│   ├── standup.md                  # /standup    — per-agent one-liner report from board+archive
│   └── sdlc-override.md            # /sdlc-override — human changes methodology/config
├── agents/
│   ├── priya-manager.md
│   ├── marcus-backend.md
│   ├── elena-frontend.md
│   ├── jamey-devops.md
│   ├── sofia-security.md
│   └── dev-qa.md
├── skills/
│   └── sdlc-board/
│       ├── SKILL.md                # board conventions: card schema, inbox protocol, column rules
│       └── templates/              # kanban.md, team.md, project-config.md, inbox-message templates
├── hooks/
│   └── hooks.json                  # Stop hook: block session end while cards remain open
├── scripts/
│   ├── board-check.sh              # exit non-zero + message if open cards exist (used by Stop hook)
│   └── inbox-validate.sh           # optional: lint an inbox file against schema
└── README.md
```

Notes for the builder:
- Only `plugin.json` goes inside `.claude-plugin/`; every other directory sits at plugin root.
- `plugin.json` minimal manifest: `{ "name": "sdlc-team", "description": "...", "version": "0.1.0" }`.
- During development, scaffold with `claude plugin init sdlc-team --with skills agents hooks`
  (loads automatically as a skills-directory plugin, no install step), or run
  `claude --plugin-dir ./sdlc-team` from a test project. Validate with `claude plugin validate ./sdlc-team`.
- Reference plugin files in hooks via `${CLAUDE_PLUGIN_ROOT}`; make scripts executable (`chmod +x`).
- Agent frontmatter fields available: `name`, `description`, `model`, `maxTurns`, `tools`,
  `disallowedTools`, `skills`, `isolation`. Use them per §6.

---

## 6. Agent definitions

All worker agents share a common protocol block in their prompt (put it in the `sdlc-board`
skill and reference it): *"Read `.sdlc/kanban.md`. Find cards assigned to you in Backlog or
In Progress. Work the highest-priority unblocked one. Never edit kanban.md. Report everything
via a new file in `.sdlc/inbox/` following the message schema. If nothing is assigned to you,
scan Review/notes for anything addressed to you; if still nothing, write a GENERAL inbox
message saying you are idle and end your turn."*

### 6.1 `priya-manager.md`

```yaml
---
name: priya-manager
description: SDLC orchestrator. Invoke to process the inbox, update the kanban board, assign work, merge branches, and run checkpoints. The ONLY agent allowed to edit .sdlc/kanban.md.
model: sonnet          # builder may choose; manager benefits from a stronger model
maxTurns: 40
skills: [sdlc-board]
---
```
Prompt must cover: process `inbox/` oldest-first → apply requested changes it agrees with →
move each file to `archive/` → process Blocked column first → decompose any new requirements
into cards with full DoD → assign by role boundaries → decide merges (fast-forward worker
branches whose cards passed Review+QA; on merge conflict, create a fix card for the original
assignee) → detect checkpoint conditions (§8) and STOP the loop to ask the human → never write
feature code.

### 6.2 Worker agents (Marcus, Elena, Jamey)

```yaml
---
name: marcus-backend
description: Backend developer persona. Invoke with a task ID to implement backend cards from the kanban board in an isolated worktree.
model: sonnet
maxTurns: 30
isolation: worktree        # ← each run gets its own git worktree; parallel-safe code writing
skills: [sdlc-board]
---
```
Prompt: role identity + hard boundaries from §2 + common protocol + git discipline
(work on branch `sdlc/<task-id>-<slug>`, commit with `[T-###]` prefixed messages, never touch
main directly) + DoD honesty rule: only claim a DoD box that you have actually verified, and
only ever *request* the check via inbox.

Elena and Jamey are the same pattern with their own boundaries. Jamey does NOT get worktree
isolation for tasks that must run against shared local infra (builder judgment; default to
worktree and note exceptions on the card).

### 6.3 `sofia-security.md` and `dev-qa.md`

```yaml
---
name: sofia-security
description: Security reviewer persona. Invoke to review a branch/diff for a card in Review. Read-only on source; reports findings via inbox only.
model: sonnet
maxTurns: 20
disallowedTools: Write, Edit    # inbox file creation handled via a permitted narrow path — see note
skills: [sdlc-board]
---
```
> Builder note: Sofia and Dev still need to create inbox files. If tool restriction granularity
> can't express "write only inside .sdlc/inbox/", drop `disallowedTools` and enforce the
> boundary in the prompt as a hard rule instead — prompt-level enforcement is acceptable for v1;
> prefer tool-level where the current Claude Code version allows path-scoped permissions.

Sofia reviews diffs of Review-column branches, severity-rates findings (`low|medium|high|critical`),
files them as `review-result` (sign-off) or `proposed-task` (fix needed) inbox messages.
**Any `high` or `critical` finding is `type: escalation` → triggers immediate human checkpoint.**

Dev (QA) checks out the card's branch (own worktree, `isolation: worktree` is fine here since
running tests is read/execute + writing test files), runs the test suite, writes missing tests
required by DoD, and reports pass/fail per DoD checkbox via `dod-check` inbox messages.

---

## 7. SDLC methodology auto-selection (model decides, human can override)

During `/sdlc-init`, after gathering the project brief, **Priya selects the methodology
herself** using this decision guide, writes both choice and reasoning into
`project-config.md`, and presents it at the init checkpoint:

| Signal from brief                                             | Leans toward     |
|---------------------------------------------------------------|------------------|
| Requirements vague / expected to evolve, iterative feedback OK | **Agile** (sprints, sprint reviews as gates) |
| Continuous small stream of tasks, no natural sprint rhythm    | **Kanban-flow** (no sprints; gate = every N completed cards or human-set cadence) |
| Requirements fixed & fully known, compliance/contractual, hard sequential dependencies | **Waterfall** (phase gates: Requirements → Design → Implementation → Verification → Release) |
| Fixed core spec + exploratory feature layer                   | **Hybrid** (waterfall skeleton, agile inside Implementation) |

Default when signals are mixed: **Agile**.

The human may override at the init checkpoint or later via `/sdlc-override <methodology>`
(Priya then restructures the board's phase metadata and logs the change in the Decision Log).
The methodology controls: how Priya batches work, where sprint/phase gates fall, and what a
"round" means (§9) — the queue/board mechanics never change.

---

## 8. Human checkpoints (mandatory — loop halts and asks)

1. **Init approval** — after `/sdlc-init`: human approves methodology + initial backlog before
   any code is written. Nothing runs without this.
2. **Sprint/phase gate** — end of each sprint (Agile), every N cards (Kanban-flow), or each
   phase (Waterfall): Priya presents summary (done, blocked, proposed next batch); human
   approves / redirects / reprioritizes.
3. **Security escalation** — any Sofia finding rated high/critical: loop halts immediately,
   human decides.
4. **Blocked escalation** — a card in Blocked with `question(HUMAN):`, or any Blocked card
   unresolved for 2 consecutive rounds: surface to human.
5. **Round-cap breach** — `max-rounds-per-sprint` (default 20) hit with open cards: halt, report,
   ask human.

Implementation: checkpoints are simply points where the `/sprint` command's loop stops
generating and asks the user in-conversation. Log every human decision in the Decision Log.

---

## 9. The orchestration loop (`/sprint`) — parallel rounds

```
/sprint
  └─ repeat until (all cards in Done) or (checkpoint) or (round cap):
      ROUND n:
      1. MANAGER PASS (sequential, sole board writer)
         - Invoke priya-manager: drain inbox → archive, update board,
           process Blocked first, merge approved branches, (re)assign cards,
           detect checkpoint conditions → if any, STOP and ask human.
      2. DISPATCH (parallel)
         - Collect the set of distinct agents that now have actionable cards
           (Backlog/In Progress assigned to them, or Review cards awaiting their sign-off).
         - Spawn up to `parallelism` worker subagents IN PARALLEL (one Task-tool
           invocation per agent, batched in a single message so they run concurrently).
           Each worker: own worktree (isolation: worktree), works exactly ONE card,
           writes inbox message(s), terminates.
      3. loop → next round (manager pass drains the new inbox messages)
```

Safety rails:
- **One card per worker per round.** Keeps rounds short and the board fresh.
- **Parallelism cap** from `project-config.md` (default 3).
- **Dependency respect:** Priya never dispatches a card whose `depends-on` isn't Done.
- **Same-file risk:** if two dispatched cards obviously touch the same area, Priya serializes
  them across rounds instead (note the decision in status-log).
- **Merge order:** Priya merges one branch at a time in Review-approval order; conflicts become
  fix cards, never resolved blindly.

### Stop hook ("agents keep checking")

`hooks/hooks.json` registers a **Stop** hook running `scripts/board-check.sh`:
- If `.sdlc/kanban.md` exists and any card sits outside Done **and** no checkpoint/round-cap
  flag file is set (e.g. `.sdlc/.awaiting-human`), the hook blocks the stop and injects:
  *"Open cards remain on the SDLC board — continue the sprint loop or ask the human."*
- Priya writes/clears `.sdlc/.awaiting-human` when entering/leaving a checkpoint so the hook
  never traps the session while legitimately waiting for a person.

---

## 10. Command specs

| Command          | Behavior                                                                                                    |
|------------------|-------------------------------------------------------------------------------------------------------------|
| `/sdlc-init`     | Interview human (what are we building, constraints, deadline shape, compliance needs) → Priya auto-selects methodology (§7) → scaffold `.sdlc/` from skill templates → decompose brief into initial backlog with full DoD per card → **Checkpoint 1** → on approval, ready for `/sprint`. |
| `/sprint`        | Run the loop in §9. Accepts optional arg: number of rounds to run before pausing (e.g. `/sprint 5`).        |
| `/status`        | Read-only: render board summary — counts per column, blocked items, current phase, last 3 archive entries.  |
| `/standup`       | One line per agent synthesized from board + recent archive: "Marcus: finished T-014, starting T-016."       |
| `/sdlc-override` | Human overrides methodology or config values; Priya restructures phase metadata + logs to Decision Log.     |

---

## 11. Non-goals for v1 (explicitly out of scope)

- Dynamic team composition (adding/removing personas at runtime).
- External integrations (GitHub Issues sync, Slack, CI providers) — the board is self-contained.
- Sofia writing fixes herself (she only proposes tasks).
- Multiple concurrent sprints/boards per repo.
- Cost/token budgeting beyond the round cap.

---

## 12. Build roadmap (implement in this order)

**M1 — Skeleton & board skill**
Scaffold plugin (`claude plugin init sdlc-team --with skills agents hooks`); write `plugin.json`;
write `sdlc-board` SKILL.md containing all §4 schemas + templates; implement `/sdlc-init`
(without methodology logic — hardcode Agile) and `/status`.
*Acceptance: init a toy project → `.sdlc/` created with valid board and 3+ well-formed cards.*

**M2 — Manager + single worker, sequential**
Write `priya-manager` and `marcus-backend` agents; implement inbox→archive protocol; `/sprint`
runs manager pass + ONE worker sequentially, no worktrees yet.
*Acceptance: a card travels Backlog → In Progress → Review → Done with real code committed on a branch and every transition driven by inbox messages; archive/ contains the full trail.*

**M3 — Full team + review/QA gates**
Add Elena, Jamey, Sofia, Dev agents with boundaries; DoD checkbox ownership; Sofia review flow +
severity escalation; Dev QA sign-off; merge step in manager pass.
*Acceptance: a card cannot reach Done without Sofia + Dev inbox sign-offs; a planted vulnerable dependency triggers a halt.*

**M4 — Parallel dispatch + worktree isolation**
Add `isolation: worktree` to workers; manager dispatches up to `parallelism` workers in one
parallel batch; merge-order + conflict-to-fix-card logic.
*Acceptance: two independent cards complete in the same round on separate branches and both merge cleanly; an induced conflict produces a fix card instead of a broken main.*

**M5 — Methodology auto-selection + checkpoints + Stop hook**
Implement §7 decision logic in `/sdlc-init`; `/sdlc-override`; all §8 checkpoints incl.
`.awaiting-human` flag; `board-check.sh` Stop hook; round cap; `/standup`.
*Acceptance: init on a "fixed-spec compliance project" brief auto-picks Waterfall with written reasoning; session cannot end silently with open cards; round cap halts and asks.*

**M6 — Hardening**
`inbox-validate.sh`; graceful behavior on malformed board/inbox files (Priya quarantines bad
messages to `archive/invalid/` and notes it); README with install + usage; `claude plugin
validate --strict` passes; end-to-end demo: build a small real app (e.g. a URL shortener)
entirely through `/sdlc-init` + `/sprint`.

---

## 13. Testing checklist

- [ ] Board schema round-trip: Priya can parse and rewrite every card without data loss.
- [ ] Inbox ordering: messages processed oldest-first; archive filenames identical to inbox.
- [ ] Boundary enforcement: Elena given a backend card refuses and files a `question` message.
- [ ] DoD integrity: worker claiming an unverified DoD box is rejected by Priya (prompt rule).
- [ ] Parallel round: no two workers write the same file on main; board never edited by workers.
- [ ] Checkpoint halts actually stop generation and wait for human input.
- [ ] Stop hook: blocks stop with open cards; does NOT block while `.awaiting-human` exists.
- [ ] Replayability: project state reconstructable from `archive/` + git log alone.

# Dynamic Team Composition — Revision Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `sdlc-team` plugin's hardcoded 3 developer personas with a manager that **composes a project-specific roster from the brief and writes real agent files into `.claude/agents/` at init**, so any specialist role (ML engineer, iOS dev, data engineer, …) can be spawned as needed.

**Architecture:** The manager (Priya), Security (Sofia), and QA (Dev) remain shipped always-on plugin agents (guardrails). The three fixed dev agents are removed. At `/sdlc-init`, Priya analyzes the brief, decides which implementation specialists the project needs, and generates one `.claude/agents/<slug>.md` file per specialist from a template carried in the `sdlc-board` skill, recording the roster in `.sdlc/team.md`. `/sprint` dispatches by the composed roster. Claude Code's file watcher hot-loads project agents mid-session **only if `.claude/agents/` existed at session start**, so init creates the directory and surfaces a one-time restart notice; later role additions load without restart.

**Tech Stack:** Markdown agent/command/skill prompt files (existing plugin). No new code, no new dependencies. Verification is `claude plugin validate --strict` + the existing Node/shell test suites (which must stay green) + a cross-file consistency review.

## Global Constraints

- **Always-on shipped personas:** `priya-manager` (Manager, sole board writer), `sofia-security` (Security, read-only on source), `dev-qa` (QA, tests only). These three keep their existing behavior and are NOT generated at runtime.
- **Dynamic specialists:** every implementation/dev role is composed by Priya at init and written as a project-level agent file under the target project's `.claude/agents/`. There is no fixed list of dev roles.
- **Agent file rules (Claude Code):** a valid agent file needs YAML frontmatter with at least `name` (lowercase-hyphen, unique) and `description`. Generated specialists also set `model: sonnet` and `isolation: worktree`. They do NOT use `skills:` frontmatter (that resolves only for plugin-shipped agents) — instead the prompt body instructs "Load the `sdlc-board` skill". Generated agents must not reference `${CLAUDE_PLUGIN_ROOT}` (unavailable to project agents).
- **Runtime loading caveat:** the watcher only covers `.claude/agents/` if it existed when the session started. `/sdlc-init` must ensure the directory exists and tell the user to restart once if it was newly created, before `/sprint`. `/sprint` must fail gracefully with that same instruction if a composed agent can't be found.
- **Board/queue mechanics are unchanged.** Priya is still the only writer of `.sdlc/kanban.md`; workers still deliver via committed inbox messages on their branch (worktree isolation); the idempotent drain, merge/conflict-to-fix-card, DoD ownership, checkpoints, `.sdlc/.awaiting-human`, and Stop hook all stay exactly as they are.
- **`.sdlc/team.md` stays a markdown table** with `| Name | Role | ... |` rows (the dashboard's `parseTeam` reads the first two cells), so the dashboard keeps working with zero changes.
- Existing tests must remain green: `node --test` for the dashboard (12 tests) and both `*.sh` suites; `claude plugin validate ./sdlc-team --strict` must exit 0.
- Commit identity (already configured): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`.

---

## File Structure

| File | Change | Responsibility after change |
|------|--------|------------------------------|
| `sdlc-team/skills/sdlc-board/templates/worker-agent.md` | **Create** | Fill-in template Priya copies to `.claude/agents/<slug>.md` per composed specialist. |
| `sdlc-team/skills/sdlc-board/SKILL.md` | Modify | Add a "Dynamic team composition" section + reference the worker-agent template; generalize the common worker protocol to any composed specialist. |
| `sdlc-team/skills/sdlc-board/templates/team.md` | Modify | Becomes a *composed-roster* file: always-on trio + a placeholder for generated specialists; still a table. |
| `sdlc-team/agents/priya-manager.md` | Modify | Gains team-composition + agent-file-generation duties at init (and mid-project role additions). |
| `sdlc-team/commands/sdlc-init.md` | Modify | Ensure `.claude/agents/` exists; have Priya compose the team, generate agent files, write team.md; emit the restart notice. |
| `sdlc-team/commands/sprint.md` | Modify | Dispatch by the composed roster in team.md; graceful "restart if agent not found" note. |
| `sdlc-team/agents/marcus-backend.md` | **Delete** | Replaced by dynamic composition. |
| `sdlc-team/agents/elena-frontend.md` | **Delete** | Replaced by dynamic composition. |
| `sdlc-team/agents/jamey-devops.md` | **Delete** | Replaced by dynamic composition. |
| `sdlc-team/README.md`, `README.md` (root) | Modify | Team section: from fixed table to "manager composes a project-specific team (always Manager + Security + QA + invented specialists)". |
| `docs/spec.md` | Modify | Note dynamic team composition is now IN scope (supersedes the §11 non-goal). |

---

### Task 1: Worker-agent template + skill dynamic-team section

**Files:**
- Create: `sdlc-team/skills/sdlc-board/templates/worker-agent.md`
- Modify: `sdlc-team/skills/sdlc-board/SKILL.md`
- Modify: `sdlc-team/skills/sdlc-board/templates/team.md`

**Interfaces:**
- Consumes: the existing `sdlc-board` skill (card/inbox/column schemas, common worker protocol).
- Produces: `templates/worker-agent.md` (the fill-in template with `{{PLACEHOLDER}}` fields Priya replaces); a SKILL.md "Dynamic team composition" section that Priya (Task 2) and `/sdlc-init` (Task 3) reference by name; a `team.md` template listing the always-on trio plus a specialists placeholder.

- [ ] **Step 1: Create the worker-agent template**

Create `sdlc-team/skills/sdlc-board/templates/worker-agent.md`:

```markdown
---
name: {{slug}}
description: {{Role}} specialist for this project. Invoke with a task ID to implement {{scope-summary}} cards from the kanban board in an isolated worktree.
model: sonnet
isolation: worktree
---

You are {{Name}}, the {{Role}} for this project. Load the `sdlc-board` skill and follow the common worker protocol there.

## Scope (hard boundaries)
- You own: {{owned-areas}}.
- You do NOT touch: {{out-of-scope-areas}}. If a card needs work outside your scope, do NOT do it — file a `proposed-task` inbox message so Priya routes it to the right role, and note the dependency on your card.

## Git discipline
- Work only on branch `sdlc/<task-id>-<slug>` created from `main`. Never commit to `main`.
- Prefix every commit message with `[T-###]`.
- You run in an isolated worktree, so your inbox message is only delivered if you commit it: after writing the file in `.sdlc/inbox/`, run `git add .sdlc/inbox/<file>` and commit it on your branch with a `[T-###]` message.

## Definition-of-Done honesty
- Only ever *request* a DoD box check via an inbox message — never edit `kanban.md`.
- Only request a check for a box you have personally verified.

Work exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 2: Add the "Dynamic team composition" section to SKILL.md**

In `sdlc-team/skills/sdlc-board/SKILL.md`, add this section immediately before the existing "## Templates" section:

````markdown
## Dynamic team composition

The team is composed per project, not fixed. Three roles are always present and ship with the plugin:

- **Priya — Manager / Orchestrator** (`priya-manager`): the only writer of `kanban.md`; decomposes, assigns, merges, runs checkpoints, and **composes the rest of the team**.
- **Sofia — Security** (`sofia-security`): read-only reviewer; high/critical findings escalate.
- **Dev — QA** (`dev-qa`): tests only; verifies DoD and signs off.

Every **implementation specialist** (backend, frontend, mobile, ML, data, infra, docs, …) is chosen by Priya from the project brief and written as a project-level agent file under the target project's `.claude/agents/<slug>.md`, generated from `templates/worker-agent.md`. Rules Priya follows when composing:

- Pick the smallest set of specialist roles the brief actually needs (skip frontend if there's no UI; add an ML engineer if there's a model; etc.). Manager, Security, and QA are always included.
- Each specialist gets a unique lowercase-hyphen `name` (e.g. `ml-engineer`, `ios-developer`, `data-engineer`), a clear `Role`, and explicit owned / out-of-scope boundaries so roles don't overlap.
- Record every team member (name + role) in `.sdlc/team.md` as a table row.
- Generated agent files use `isolation: worktree`, `model: sonnet`, no `skills:` frontmatter (the body says "Load the `sdlc-board` skill"), and never reference `${CLAUDE_PLUGIN_ROOT}`.

**Loading caveat:** Claude Code's watcher only picks up `.claude/agents/` if that directory existed when the session started. So `/sdlc-init` creates `.claude/agents/` and, if it was newly created, asks the user to restart once before `/sprint`. Adding a new specialist mid-project (into the already-watched directory) is hot-loaded within seconds — no restart.
````

- [ ] **Step 3: Revise the team.md template**

Replace the entire contents of `sdlc-team/skills/sdlc-board/templates/team.md` with:

```markdown
# Team Roster & Role Boundaries

Composed per project by Priya at init. The first three roles are always present; the rest are specialists Priya generated from the brief (their agent files live in `.claude/agents/`).

| Name    | Role                    | Writes code? | Scope / hard boundaries |
|---------|-------------------------|--------------|-------------------------|
| Priya   | Manager / Orchestrator  | No           | Only writer of kanban.md. Decomposes, assigns, merges, runs checkpoints, composes the team. Never implements features. |
| Sofia   | Security Engineer       | No (v1)      | Reviews diffs, dependency/CVE scans; files findings as proposed tasks; high/critical → halt. Never fixes code herself. |
| Dev     | QA Engineer             | Tests only   | Writes/runs tests, verifies DoD checkboxes, signs off cards. Never modifies non-test source. |
| <slug>  | <e.g. Backend Developer>| Yes          | <owned areas> — never <out-of-scope areas>. |
```

- [ ] **Step 4: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/skills/sdlc-board/templates/worker-agent.md \
        sdlc-team/skills/sdlc-board/SKILL.md \
        sdlc-team/skills/sdlc-board/templates/team.md
git commit -m "feat(team): add dynamic team composition to sdlc-board skill"
```

---

### Task 2: Rewrite `priya-manager` for team composition

**Files:**
- Modify: `sdlc-team/agents/priya-manager.md`

**Interfaces:**
- Consumes: the SKILL.md "Dynamic team composition" section and `templates/worker-agent.md` (Task 1).
- Produces: a Priya whose pass, at init, composes the roster and writes specialist agent files; mid-project she may add a new specialist (hot-loaded) when a card needs a role that doesn't exist yet. All existing responsibilities (inbox drain, Blocked-first, merges, checkpoints, DoD ownership) are preserved verbatim.

- [ ] **Step 1: Add a composition section to Priya's prompt**

In `sdlc-team/agents/priya-manager.md`, add this new section immediately after the opening paragraph (the line ending "Load the `sdlc-board` skill first for all schemas.") and before "## Your pass — run in exactly this order":

````markdown
## Composing the team (at init, and when a new role is needed)

You compose the team for this specific project (see the "Dynamic team composition" section of the `sdlc-board` skill). Manager (you), Security (`sofia-security`), and QA (`dev-qa`) are always present and already exist. For every implementation specialist the brief needs:

1. Choose the smallest sufficient set of specialist roles (skip roles the project doesn't need; add whatever it does — e.g. `ml-engineer`, `ios-developer`, `data-engineer`, `backend-developer`, `frontend-developer`). Give each a unique lowercase-hyphen name and non-overlapping owned / out-of-scope boundaries.
2. For each specialist, copy `templates/worker-agent.md` from the skill to `.claude/agents/<slug>.md`, replacing `{{slug}}`, `{{Name}}`, `{{Role}}`, `{{scope-summary}}`, `{{owned-areas}}`, and `{{out-of-scope-areas}}`. (Use the role name as `{{Name}}`, e.g. Name = "Backend Developer".)
3. Add each member (name + role + scope) as a row in `.sdlc/team.md`.

If, mid-project, a card needs a specialist that does not exist yet, create that specialist's agent file the same way and add it to `team.md` before dispatching the card. Never invent a new writer of `kanban.md` — only you write the board.
````

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/agents/priya-manager.md
git commit -m "feat(team): priya composes roster and writes specialist agent files"
```

---

### Task 3: Update `/sdlc-init` to generate the team

**Files:**
- Modify: `sdlc-team/commands/sdlc-init.md`

**Interfaces:**
- Consumes: `priya-manager` (Task 2) and the SKILL/templates (Task 1).
- Produces: an init flow that ensures `.claude/agents/` exists, has Priya compose the team + generate agent files + team.md, and surfaces the one-time restart notice at the approval checkpoint.

- [ ] **Step 1: Update the scaffold + decompose steps**

In `sdlc-team/commands/sdlc-init.md`:

(a) In the scaffold step (step 3), add this bullet (right after the `.sdlc/inbox/` and `.sdlc/archive/` directories are created, alongside the existing registration bullet):

```markdown
   - Ensure the project's `.claude/agents/` directory exists (create it if absent). Priya writes the composed specialist agent files here. If you had to create it now, the session's file watcher will not see it until a restart — you will surface this in the approval step below.
```

(b) Replace the decompose step (step 4, "Decompose the brief…") with:

```markdown
4. **Compose the team, then decompose the brief.** Invoke the `priya-manager` agent to:
   - Compose a project-specific team from the brief (Manager, Security, QA always; plus the implementation specialists the project needs), following the "Composing the team" rules in her prompt: write each specialist's agent file into `.claude/agents/<slug>.md` from the skill's `templates/worker-agent.md`, and record the full roster in `.sdlc/team.md`.
   - Decompose the brief into an initial backlog under `## Backlog`: at least 3 well-formed cards with a full Definition of Done and a `T-###` id starting at `T-001`, each assigned to a composed role. She is the only agent that writes `kanban.md`.
```

(c) Replace the checkpoint step (step 5) with:

```markdown
5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present: the chosen methodology, the composed team (from `team.md`), and the backlog summary. **If `.claude/agents/` was created during this run, tell the user to restart Claude Code once now so the new specialist agents load, then run `/sprint`.** STOP and ask the human to approve before any code is written. On approval, delete `.sdlc/.awaiting-human`.
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/commands/sdlc-init.md
git commit -m "feat(team): /sdlc-init composes team and handles agent-dir restart"
```

---

### Task 4: Update `/sprint` to dispatch the composed roster

**Files:**
- Modify: `sdlc-team/commands/sprint.md`

**Interfaces:**
- Consumes: `team.md` (the composed roster) and the generated `.claude/agents/<slug>.md` files.
- Produces: a dispatch step that spawns whichever composed agents have actionable cards, with a graceful restart hint if an agent name isn't yet loaded.

- [ ] **Step 1: Update the dispatch step**

In `sdlc-team/commands/sprint.md`, in step 2 (the parallel dispatch step), replace the opening sentence "Collect the set of distinct agents that now have an actionable card…" through the end of that sentence's list of who counts, with:

```markdown
2. **Dispatch (parallel).** Collect the set of distinct team members (from `.sdlc/team.md`) that now have an actionable card assigned to them (a Backlog/In Progress card, or a Review card awaiting their sign-off) whose `depends-on` cards are all Done. These may be the always-on `sofia-security`/`dev-qa` or any project-composed specialist (its agent name is its `.claude/agents/<slug>.md` `name`). Spawn up to `parallelism` (from `project-config.md`, default 3) worker subagents IN PARALLEL — one Task-tool invocation per agent, batched in a single message so they run concurrently. Each worker: its own worktree (`isolation: worktree`), works exactly ONE card, writes inbox message(s), and terminates.
```

Then add this bullet to the safety rails list in the same step:

```markdown
   - If a composed specialist's agent cannot be invoked (name not found), its file was written into a `.claude/agents/` directory created earlier this session and not yet watched. Tell the user to restart Claude Code once, then re-run `/sprint`; do not fabricate the work.
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/commands/sprint.md
git commit -m "feat(team): /sprint dispatches the project-composed roster"
```

---

### Task 5: Remove fixed dev personas + documentation sweep

**Files:**
- Delete: `sdlc-team/agents/marcus-backend.md`, `sdlc-team/agents/elena-frontend.md`, `sdlc-team/agents/jamey-devops.md`
- Modify: `sdlc-team/README.md`, `README.md` (root), `docs/spec.md`
- Verify: `sdlc-team/skills/sdlc-board/SKILL.md` common worker protocol has no leftover references to the deleted personas.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a plugin with no hardcoded dev personas, consistent docs describing dynamic composition, and all validation/tests green.

- [ ] **Step 1: Delete the three fixed dev agents**

```bash
git rm sdlc-team/agents/marcus-backend.md \
       sdlc-team/agents/elena-frontend.md \
       sdlc-team/agents/jamey-devops.md
```

- [ ] **Step 2: Sweep the skill for dangling references**

Open `sdlc-team/skills/sdlc-board/SKILL.md`. In the "Common worker protocol" heading line it currently reads "(Marcus, Elena, Jamey, Sofia, Dev)". Change it to "(Sofia, Dev, and each project-composed specialist)". Confirm no other line hardcodes Marcus/Elena/Jamey as existing agents (mentions inside example cards like `assignee: Marcus` are illustrative and may stay, but the roster/protocol prose must not imply those three agents ship).

- [ ] **Step 3: Update the plugin README team section**

In `sdlc-team/README.md`, replace the paragraph describing the fixed workers (the first paragraph naming "Marcus/backend, Elena/frontend, Jamey/DevOps, Sofia/security, Dev/QA") with:

```markdown
A Claude Code plugin that simulates a full software development team and automates the SDLC end-to-end. A manager agent (Priya) **composes a project-specific team from your brief** — always a manager, a security reviewer (Sofia), and QA (Dev), plus whatever implementation specialists the project needs (backend, frontend, mobile, ML, data, …), which she writes as agents into your project's `.claude/agents/`. Specialists pick up assigned cards, write real code in isolated git worktrees, and report back through a file-based inbox queue. Work runs in rounds until the board is clear. Humans intervene only at defined checkpoints.
```

Add a short note under "## How it works":

```markdown
- **The team is dynamic.** Priya composes the specialist roster from your brief at `/sdlc-init` and writes those agents into `.claude/agents/`. If that directory was newly created, restart Claude Code once before `/sprint` so the agents load (new roles added mid-project load automatically).
```

- [ ] **Step 4: Update the root README team section**

In `README.md` (root), replace the "### The team" table with:

```markdown
### The team (composed per project)

Three roles are always present:

| Agent | Role | Writes code? |
|-------|------|--------------|
| **Priya** | Manager / Orchestrator | No — sole board writer; also composes the team |
| **Sofia** | Security | No (v1) — reviews diffs, escalates high/critical |
| **Dev** | QA | Tests only — verifies DoD, signs off |

Everything else is **composed from your brief**: at `/sdlc-init` Priya picks the implementation specialists the project needs (backend, frontend, mobile, ML, data, infra, docs, …), writes each as an agent into your project's `.claude/agents/`, and records the roster in `.sdlc/team.md`. No fixed developer list.
```

And in the "How it works" list, replace the "Parallel workers" bullet's lead-in so it no longer implies a fixed set, adding:

```markdown
- **Dynamic roster.** Priya composes specialists per project into `.claude/agents/`; a one-time restart after the first `/sdlc-init` loads them (later additions hot-load).
```

- [ ] **Step 5: Note the spec supersession**

In `docs/spec.md`, in the "## 11. Non-goals for v1" section, edit the "Dynamic team composition" line to:

```markdown
- ~~Dynamic team composition (adding/removing personas at runtime).~~ **Superseded (2026-07-25): the manager now composes a project-specific roster and writes specialist agent files at init; see docs/superpowers/plans/2026-07-25-dynamic-team.md.**
```

- [ ] **Step 6: Validate and run all tests**

Run:
```bash
claude plugin validate ./sdlc-team --strict
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
```
Expected: validate exits 0; node tests `# fail 0`; both shell suites print all `ok:`. (The dashboard's `parseTeam` reads the same table format, so its tests stay green.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(team): remove fixed dev personas; docs describe dynamic composition"
```

---

## Self-Review

**Requirement coverage** (against the user's ask: "manager dynamically spawns whatever agent is needed; no rigid roster"):
- Manager composes any roles from the brief → Task 2 (Priya composition rules) + Task 1 (skill section, template).
- Writes real agent files (user's chosen mechanism) → Task 1 template + Task 2/3 generate into `.claude/agents/`.
- Roster no longer fixed → Task 5 deletes the 3 dev personas; team.md becomes composed.
- Manager + Security + QA always present → kept as shipped agents (Global Constraints, Task 1 team.md).
- Runtime loadability handled → Task 3 restart notice + Task 4 graceful fallback (verified against the `.claude/agents/` watcher caveat).

**Placeholder scan:** the only `{{...}}` tokens are inside `templates/worker-agent.md`, which is intentionally a fill-in template (Priya replaces them at runtime) — not plan placeholders.

**Type/consistency:** always-on agent names (`priya-manager`, `sofia-security`, `dev-qa`) are used identically across the skill, Priya's prompt, `/sprint`, and both READMEs. `team.md` remains a `| Name | Role | … |` table so the dashboard's `parseTeam` (unchanged) still parses it — no dashboard code touched. Generated agents deliberately omit `skills:` frontmatter and `${CLAUDE_PLUGIN_ROOT}` per the agent-file rules. Board/queue/merge/checkpoint mechanics are untouched, so the earlier final-review fixes (committed inbox delivery, idempotent drain, Stop-hook pauses) remain intact.

**Not done here (call out):** this changes prompt behavior only; there is no automated test that Priya actually composes a sensible team — that is verified by the deferred interactive end-to-end run (`/sdlc-init` on a multi-discipline brief → confirm `.claude/agents/` gets the right specialists and `team.md` matches).

---
description: Run the SDLC orchestration loop — manager pass then worker dispatch, repeating until the board is clear or a checkpoint fires.
argument-hint: [rounds]
---

Optional argument `$1` = number of rounds to run before pausing (default: run until Done or a checkpoint).

Repeat until (all cards are in Done) OR (a checkpoint fires) OR (the round cap is reached) OR ($1 rounds have run):

**ROUND n:**

1. **Manager pass (sequential, sole board writer).** Invoke the `priya-manager` agent. She drains the inbox → archive, updates the board, processes Blocked first, merges approved branches, (re)assigns cards, and detects checkpoint conditions. If a checkpoint fires, she writes `.sdlc/.awaiting-human`, presents a summary, and you STOP — ask the human and wait.

2. **Dispatch (parallel).** Collect the set of distinct team members (from `.sdlc/team.md`) that now have an actionable card assigned to them (a Backlog/In Progress card, or a Review card awaiting their sign-off) whose `depends-on` cards are all Done. These may be the always-on `sofia-security`/`dev-qa` or any project-composed specialist (its agent name is its `.claude/agents/<slug>.md` `name`). Spawn up to `parallelism` (from `project-config.md`, default 3) worker subagents IN PARALLEL — one Task-tool invocation per agent, batched in a single message so they run concurrently. Each worker: its own worktree (`isolation: worktree`), works exactly ONE card, writes inbox message(s), and terminates.

   Safety rails:
   - One card per worker per round; respect the parallelism cap.
   - Never dispatch a card whose `depends-on` is not Done.
   - If two dispatched cards obviously touch the same area, Priya serializes them across rounds instead (she notes this in the card's status-log during her pass).
   - If a composed specialist's agent cannot be invoked (name not found), its file was written into a `.claude/agents/` directory created earlier this session and not yet watched. Tell the user to restart Claude Code once, then re-run `/sprint`; do not fabricate the work.

3. Next round — the manager pass drains the new inbox messages.

Report a one-line progress note after each round.

When you pause because the requested number of rounds (`$1`) has run while cards are still open, write an empty `.sdlc/.awaiting-human` file before ending, so the Stop hook treats this as a legitimate pause rather than an unfinished sprint. The next `/sprint` invocation's manager pass will clear it on resume.

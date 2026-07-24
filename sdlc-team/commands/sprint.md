---
description: Run the SDLC orchestration loop — manager pass then worker dispatch, repeating until the board is clear or a checkpoint fires.
argument-hint: [rounds]
---

Optional argument `$1` = number of rounds to run before pausing (default: run until Done or a checkpoint).

Repeat until (all cards are in Done) OR (a checkpoint fires) OR (the round cap is reached) OR ($1 rounds have run):

**ROUND n:**

1. **Manager pass (sequential, sole board writer).** Invoke the `priya-manager` agent. She drains the inbox → archive, updates the board, processes Blocked first, merges approved branches, (re)assigns cards, and detects checkpoint conditions. If a checkpoint fires, she writes `.sdlc/.awaiting-human`, presents a summary, and you STOP — ask the human and wait.

2. **Dispatch (parallel).** Collect the set of distinct agents that now have an actionable card (a Backlog/In Progress card assigned to them, or a Review card awaiting their sign-off) whose `depends-on` cards are all Done. Spawn up to `parallelism` (from `project-config.md`, default 3) worker subagents IN PARALLEL — one Task-tool invocation per agent, all batched in a single message so they run concurrently. Each worker: its own worktree (`isolation: worktree`), works exactly ONE card, writes inbox message(s), and terminates.

   Safety rails: one card per worker per round; respect the parallelism cap; never dispatch a card whose `depends-on` is not Done; if two dispatched cards obviously touch the same area, Priya serializes them across rounds instead (she notes this in the card's status-log during her pass).

3. Next round — the manager pass drains the new inbox messages.

Report a one-line progress note after each round.

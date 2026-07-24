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

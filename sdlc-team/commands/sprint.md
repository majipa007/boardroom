---
description: Run the SDLC orchestration loop — manager pass then role dispatch, repeating until the board is clear or a hard stop fires.
argument-hint: "[rounds] [--auto]"
---

Arguments: an optional round count (e.g. `/sprint 5`) and an optional `--auto` to force
autopilot for this run. Autopilot is otherwise controlled by `autopilot: on|off` in
`.sdlc/project-config.md` (default `off`).

**Normal mode** stops at every checkpoint and asks you. **Autopilot** keeps going, logging
its decisions, and halts only on a hard stop.

Repeat until a hard stop fires, the board is all Done, the round cap is reached, or the
requested number of rounds has run:

**ROUND n:**

1. **Manager pass (sequential, sole board writer).** Invoke the `manager` agent. It drains the
   inbox → archive, updates the board, processes Blocked first, checks that every card's
   `verify-roles` have signed off before allowing Done, merges approved branches (a reported
   failing test run blocks the merge unconditionally), allocates roles to ready cards
   (reuse → extend → mint, per its registry rules), and records every auto-decision in the
   Decision Log.

2. **Dispatch (parallel).** From `.sdlc/team.md` and the board, collect the ready work: cards
   in Backlog/In Progress whose `depends-on` are all Done, and cards in Review awaiting a
   `verify-roles` sign-off. Spawn up to `parallelism` (default 3) subagents IN PARALLEL — one
   Task-tool invocation per card, batched in a single message:
   - implementation cards → the **`worker`** agent
   - verification cards → the **`reviewer`** agent
   Each spawn prompt uses the skill's spawn template, injecting that role's charter,
   boundaries and conventions from the registry, plus exactly one card id.
   Each subagent works one card in its own worktree, commits its inbox message onto its
   branch, and terminates.

   Safety rails: one card per subagent per round; respect the parallelism cap; never dispatch
   a card whose `depends-on` is not Done; the worker that implemented a card is never the
   agent that verifies it; if two ready cards' file footprints overlap, the manager serializes
   them across rounds.

3. Next round — the manager pass drains the new inbox messages.

## Hard stops (autopilot halts on these five, and nothing else)

1. **Init approval** — the initial plan has not been approved yet.
2. **High/critical security finding** — any `type: escalation` from a `sec-review` role.
3. **Batched `question(HUMAN)`** — at the end of a round, if `.sdlc/human-queue.md` is
   non-empty, stop and present every queued item together.
4. **Round cap** — `max-rounds-per-sprint` (default 20) reached with work still open.
5. **Completion** — every card is in Done.

On any hard stop: write `.sdlc/.awaiting-human`, present the summary, and STOP. The next
manager pass clears the flag when work resumes.

**Everything else is an auto-decision** — role mints, charter extensions and edits,
allocation, serialization, retiring a role, and creating fix cards. The manager logs each one
to the Decision Log and the loop continues. In autopilot a sprint/phase gate does not halt:
it emits a **gate report** and the loop carries on.

Never halt mid-round. A condition discovered mid-round (including a mint-cap breach) is
appended to `.sdlc/human-queue.md` and surfaces at the end of that round.

## Gate report (emitted at each sprint/phase gate, and at every hard stop)

```
GATE REPORT — round <n>, phase <phase>
Done this gate: <card ids>        Open: <counts by column>
Merged: <branches>                Blocked: <card ids + why>
Decisions (auto) since last gate: <count> — <one line each>

Role health
  R-01 backend      6 cards, 1 rework
  R-04 sec-review   3 cards, 0 rework
  R-05 qa-verify    4 cards, 2 rework  ⚠ charter fix applied: <what was changed>
Any role at rework >= 2 must show the charter/conventions fix that was applied.

Queued for you: <items from .sdlc/human-queue.md, or "none">
```

In normal (non-autopilot) mode, the gate report is presented and the loop STOPS for your
approval, as before.

Report a one-line progress note after each round.

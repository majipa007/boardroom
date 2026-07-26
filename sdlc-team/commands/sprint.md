---
description: Run the SDLC orchestration loop — manager pass then role dispatch, repeating until the board is clear or a hard stop fires.
argument-hint: "[rounds] [--auto]"
---

Arguments: an optional round count (e.g. `/sprint 5`) and an optional `--auto` to force
autopilot for this run. Autopilot is otherwise controlled by `autopilot: on|off` in
`.sdlc/project-config.md` (default `off`). `[rounds]` is just a user-set bound on how many
rounds this invocation runs before returning control to you — it is not a sixth hard stop;
the round-cap hard stop below is the separate, config-driven `max-rounds-per-sprint` limit.

**Normal mode** stops at every checkpoint and asks you. **Autopilot** keeps going, logging
its decisions, and halts only on a hard stop.

Repeat until a hard stop fires, the board is all Done, the round cap is reached, or the
requested number of rounds has run:

**ROUND n — one RAD cycle: construct → verify → cutover:**

1. **Manager pass (sequential, sole board writer).** Invoke the `manager` agent. Tell it in
   the spawn prompt the effective autopilot state for this run — `on` if `--auto` was passed,
   otherwise whatever `autopilot:` reads in `project-config.md` — so it knows which of its two
   checkpoint branches to run. It drains the inbox → archive, updates the board, surfaces any
   `question(HUMAN):` card first, checks that every card's `verify-roles` have signed off
   before allowing `Shipped`, merges approved increments (a reported failing test run blocks
   the merge unconditionally), bundles ready cards into increments (reuse → extend → mint
   roles, per its registry rules), moves anything speculative to `Killed`, and records every
   auto-decision in the Decision Log.

2. **Construct (parallel).** From `.sdlc/team.md` and the board, collect the increments the
   manager just bundled — each a role's maximal conflict-free set of ready cards on one shared
   branch (`sdlc/inc-##-<slug>`), moved to `In flight`. Spawn one **`worker`** per role-bundle
   IN PARALLEL — one Task-tool invocation per bundle, batched in a single message — injecting
   that role's charter, boundaries and conventions, the bundle's card ids in dependency order,
   the branch name, and the explicit list of files that agent owns. **No worktrees**: every
   worker on an increment shares that one checkout, kept apart from other agents only by
   disjoint file ownership.

3. **Verify (parallel, once per increment).** As soon as every card in an increment reports
   done, dispatch ALL of that increment's `verify-roles` in ONE parallel round — one
   **`reviewer`** per verify-role, each reviewing the increment's combined diff
   (`git diff main...<branch>`), never card-by-card. Never leave a role idle while another
   increment is being verified: construct the next ready bundle for that role in the same
   round instead of waiting.

4. **Cutover.** When an increment's verify-roles all sign off, the manager pass merges it to
   `main`, moves its cards to `Shipped`, and immediately starts constructing the next ready
   bundle for the freed role — no idling between increments. A high/critical security finding
   halts everything before the merge; a reported failing test run blocks the merge
   unconditionally and becomes a fix card on the same branch.

   Safety rails: respect the parallelism cap on concurrent increments; never dispatch a card
   whose `depends-on` are not all `Shipped`; the worker that built an increment is never the
   reviewer that verifies it; if two ready cards need the same file, the manager bundles them
   into the same increment instead of splitting them.

5. Next round — the manager pass drains the new inbox messages and the cycle repeats.

## Hard stops (autopilot halts on these five, and nothing else)

1. **Init approval** — the initial plan has not been approved yet.
2. **High/critical security finding** — any `type: escalation` from a `sec-review` role.
3. **Open human question** — at the end of a round, if any Blocked card carries a
   `question(HUMAN):` line, stop and present them all together. The card leaves Blocked when
   the Manager records the human's answer, so an answered question cannot re-trigger this
   stop.
4. **Round cap** — `max-rounds-per-sprint` (default 20) reached with work still open.
5. **Completion** — every card is in Done.

On any hard stop: write `.sdlc/.awaiting-human`, present the summary, and STOP. The next
manager pass clears the flag when work resumes.

**Everything else is an auto-decision** — role mints, charter extensions and edits,
allocation, serialization, retiring a role, and creating fix cards. The manager logs each one
to the Decision Log and the loop continues. In autopilot a sprint/phase gate does not halt:
it emits a **gate report** and the loop carries on.

Never halt mid-round. A condition discovered mid-round (including a mint-cap breach) becomes
or stays a Blocked card carrying `question(HUMAN):` and surfaces at the end of that round.

## Gate report (emitted at each sprint/phase gate, and at every hard stop)

```
GATE REPORT — round <n>, phase <phase>
Shipped this gate: <card ids>     Open: Next <n> / In flight <n>
Merged: <branches>                Blocked (question(HUMAN)): <card ids + why>
Killed this cycle: <card ids + one-line reason each, or "none">
Decisions (auto) since last gate: <count> — <one line each>

Role health
  R-01 backend      6 cards, 1 rework
  R-04 sec-review   3 cards, 0 rework
  R-05 qa-verify    4 cards, 2 rework  ⚠ charter fix applied: <what was changed>
Any role at rework >= 2 must show the charter/conventions fix that was applied.

Needs you: <card id + question for each open question(HUMAN) card, or "none">
```

In normal (non-autopilot) mode, the gate report is presented and the loop STOPS for your
approval, as before.

Report a one-line progress note after each round.

> Note on provenance: the enablement mechanism (`autopilot: on|off` in `project-config.md`,
> plus `/sprint --auto`) is this implementation's invention, not called out verbatim in the
> original build spec (`docs/spec.md`) — flagged here so a reader can tell spec from
> invention.

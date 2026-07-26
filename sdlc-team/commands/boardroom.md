---
description: Build a project from a spec document, start to finish. The one command you need.
argument-hint: "[path/to/spec.md] [--go]"
---

This is the single entry point. Point it at a document and it runs the whole thing —
initialise, plan, build, verify, ship — without the human driving each step.

`$ARGUMENTS` is a path to a spec/PRD/brief document, plus an optional `--go`.

## If no document path was given

Do NOT start anything. Print this and stop:

```
boardroom — an AI software team that builds from a spec.

  /boardroom docs/spec.md        read the spec, plan it, then build it to completion
  /boardroom docs/spec.md --go   same, but skip the plan approval and start immediately

Already running?
  /sdlc-dashboard   watch the board live in a browser (two themes)
  /status           where things stand, right now
  /standup          one line per role

Fine-grained control (you rarely need these):
  /sprint [n]       run n cycles by hand instead of letting it run
  /sdlc-override    change methodology or a config value
```

Then ask which document to build from.

## With a document path

**1. Read the document.** Read the file at the given path in full. That IS the brief — do
**not** interview the human. If the path does not exist, say so and stop. If the document is
thin on a detail you need, make a sensible decision, write it into the Decision Log as
`DECISION (auto): assumed <X> because the spec was silent`, and keep going. Only stop for the
things in the hard-stop list.

**2. Initialise.** Do everything `/sdlc-init` does, using the document as the brief:
scaffold `.sdlc/`, seed the role registry (smallest crew that can ship — always a
`sec-review` and a `qa-verify` role), and decompose the document into the initial backlog
under `## Next` with `role:`, `verify-roles:`, a one-line `ships-when:` and at most 3 DoD
boxes per card. Register the project for the dashboard. Set `methodology: rad` and
**`autopilot: on`** in `project-config.md` — this path is meant to run unattended.

Apply the "do we really need this?" test while decomposing: prefer a handful of substantial
cards over a long tail, and put anything speculative straight into `## Killed` with a reason.

**3. Show the plan once.**
- Without `--go`: present a compact plan — the roles, the cards grouped into the increments
  you intend to build, and anything you assumed. Write `.sdlc/.awaiting-human`, ask for a
  yes, and stop. This is the only approval gate; it exists because the next step writes code
  into their repository.
- With `--go`: skip it. Log `DECISION (human): --go, no plan approval requested` and continue
  straight into step 4.

**4. Build it, to completion.** Run RAD cycles exactly as `/sprint` describes — construct,
verify, cutover — **continuously**, without asking the human to run another command:

- After each cycle, immediately start the next one. Do not report and wait.
- When a hard stop fires, present it, take the human's answer, and **resume the loop in the
  same turn**. Never make them type a command again to continue.
- Keep going until every card is `Shipped` or `Killed`.

The hard stops are exactly the five from `/sprint` — init approval, a high/critical security
finding, an open `question(HUMAN)` card, the round cap, and completion. Nothing else halts:
role mints, charter edits, bundling, serialisation and fix cards are all auto-decisions
recorded in the Decision Log.

**5. Report at the end.** When the board is clear, print: what shipped, what was killed and
why, the roles that ended up existing, how many cycles it took, and anything still open.
Point at `/sdlc-dashboard` for the live view and `.sdlc/archive/` for the full trail.

## Non-negotiable while running

- Security review happens over every increment's combined diff before it merges. A
  high/critical finding halts immediately. Never skip it to go faster.
- A failing test run blocks the merge, always.
- The implementer never verifies its own work.

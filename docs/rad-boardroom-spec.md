# boardroom — RAD / startup-velocity rework (spec)

> **Supersedes** the per-card agile pipeline. The board stops being a PMO ticket tracker and
> becomes what its name says: a room where a small crew decides what to build, what to cut,
> and ships in batches. Optimise for shipped increments per hour and token cost per shipped
> increment — not for cards moved or per-task traceability.

## 0. Why

Measured on a real board: 13 cards, 80 DoD boxes, 6 roles. The per-card pipeline costs
~4 rounds per card (implement → move → sec-review → qa-verify → merge), each round a full
manager invocation. 13 × 4 ≈ 52–60 rounds. At that price a plain planning-plus-subagents
session is cheaper and faster, which defeats the tool's purpose.

Targets after this rework: **~6–9 rounds for the same 13 cards**, most of the per-card tax
gone because there are no per-cards.

## 1. What to optimise for

| Optimise | Stop optimising |
|---|---|
| Shipped increments per hour | cards moved between columns |
| Token cost per shipped increment | per-card auditability |
| Decisions — build / cut / ship / kill | per-task traceability |
| Human interrupts only for irreversible or risky things | checkpoint ceremony |
| Smallest crew that can ship | role completeness |

## 2. RAD replaces methodology selection

`RAD` is the default and the only auto-selected methodology. Its cycle:

1. **Construct** — each free role takes the maximal coherent bundle of ready cards and builds
   it in one spawn, on one branch.
2. **Verify** — ONE gate over the combined diff: tests + review + security, dispatched in
   parallel in a single round.
3. **Cutover** — merge the increment; the next construct cycle starts immediately.

`waterfall` remains as a manual override (`/sdlc-override waterfall`) for genuinely fixed-spec
compliance work. `agile`, `kanban` and `hybrid` are deleted — four methodologies to choose
between is the ceremony this rework exists to remove.

## 3. Increments replace one-card-per-worker

- **Dynamic bundling, no cap.** A bundle is *every ready card one role can own without a
  file-footprint conflict with another in-flight bundle*. Dependencies inside a bundle are
  fine — one agent does them in order. Different roles bundle in parallel.
- The **branch is the increment**: `sdlc/inc-##-<slug>`. No `batch:` field on cards — grouping
  is derivable from the branch, so no new machinery.
- Verification runs **once per increment**, over the combined diff.
- If two ready cards genuinely need the same file, the manager **serialises** them on the same
  branch rather than splitting the increment.

## 4. Columns: Next | In flight | Shipped | Killed

- `Blocked` stops being a column — a card carrying `question(HUMAN):` **is** blocked, and the
  UI already surfaces those.
- `Review` folds into `In flight` — an increment is in flight until it merges.
- **`Killed`** is added, and is the column a boardroom actually needs: scope that was
  considered and cut, kept for the record. Killing a card is a logged decision.
- Legacy 5-column boards must keep parsing (existing projects are not rewritten).

## 5. Definition of Done: fewer, and clickable

- **Cap DoD at 3 boxes per card**, plus a one-line `ships-when:` that states the shippable
  outcome. Every box is a claim someone must verify; that is the friction being cut.
- **In the dashboard each DoD box is a clickable control** with three states:
  `unchecked` → `pending` (you clicked it; the manager has not applied it yet) → `checked`.
- Clicking writes an **inbox message**, never the board: the dashboard POSTs to its own local
  server, which creates `.sdlc/inbox/<ISO>_HUMAN_<card>.md` (`type: dod-check`, `from: Human`).
  The manager applies it on its next pass and archives the message.
  - The sole-writer invariant survives: only the manager edits `kanban.md`.
  - Every human tick is auditable in `archive/`.
  - A human ticking a box owned by a role is applied, and logged as
    `DECISION (human): ticked <box> on <card> (owned by <role>)`.
- The dashboard is therefore **no longer strictly read-only** — but it writes ONLY into
  `.sdlc/inbox/`, and only via `POST` on a localhost-bound server. It never touches
  `kanban.md`, `team.md`, or any source file.

## 6. No worktrees — one branch, shared checkout, disjoint files

Verified git behaviour that constrains this:

- One working directory has **one HEAD**; a second `checkout` replaces the first.
- git refuses to check out a branch already used by another worktree.
- Two agents editing **different files** on the **same branch in the same directory** is clean.

Therefore:

- **Drop `isolation: worktree`.** All agents in a round share the working directory and work
  on **one increment branch**.
- Collision avoidance is **explicit file ownership**: the manager states the file scope in each
  spawn prompt, backed by the role's charter boundaries (BE owns `api/**`, FE `app/**`, QA
  tests, Security read-only).
- **Hard rule for every agent: never run `git checkout`, `switch`, `reset`, `stash`, or any
  command that moves HEAD or the index wholesale.** HEAD is shared; moving it corrupts the
  work of every other agent in the round. Agents only `git add <their files>` and `git commit`.
- Concurrent commits can contend on `.git/index.lock`; retry once after a moment.
- "One backend engineer plus interns" = several agents under the same role charter, each given
  a disjoint slice of that role's files.
- Because everyone is on one branch, inbox messages no longer need branch-hopping delivery —
  an agent writes into `.sdlc/inbox/` and commits it on the shared branch.

## 7. Crew size

Startup defaults in `project-config.md`:

```markdown
- parallelism: 3
- max-active-roles: 4
- max-role-mints-per-sprint: 2
```

One combined `review` role covers security + QA on low-risk work. A dedicated `sec-review`
role is minted only when the project genuinely warrants it (auth, payments, secrets at the
centre of the product). Security review itself is never skipped — see §8.

## 8. Security is batched, never skipped

- Security review runs over the **combined increment diff before any merge** — 100% of the
  code, once per increment rather than once per card. This is PR-level review, which is how
  real teams work.
- Cards touching auth/authz, secrets, input parsing, dependencies, or file/network handling are
  still flagged, and a high/critical finding still halts everything immediately.
- The implementer may evidence its own **tests** (paste real command output), but may never
  sign off its own **security**.

## 9. "Do we really need this?" as a hard gate

At decomposition the manager must apply the test to every proposed card and record the answer:
merge trivial cards into their neighbour, and `Kill` anything speculative. Target a handful of
substantial cards, not a long tail of line items — everything downstream scales with card
count.

## 10. Acceptance

- [ ] A 13-card backlog ships in ≈6–9 rounds, not ~60.
- [ ] One increment branch carries several cards from several roles with no file collisions.
- [ ] No worktrees are created; no agent moves HEAD.
- [ ] Clicking a DoD box in the UI writes an inbox message, the manager applies it, the box
      shows `pending` then `checked`, and the tick appears in `archive/`.
- [ ] `Killed` cards are visible and never dispatched.
- [ ] A security finding still halts before any merge; the implementer never signs off its own
      security.
- [ ] An existing legacy 5-column, `assignee:`-based board still loads and renders.

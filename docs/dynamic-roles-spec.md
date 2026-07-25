# boardroom — Dynamic Roles Upgrade (patch spec)

> **Supersedes the fixed six-persona roster.** Roles are now minted, reused, and evolved by
> Priya at runtime via a role registry. The coordination protocol (board, inbox→archive queue,
> DoD checkboxes, manager-as-sole-board-writer, worktree isolation) is UNCHANGED and remains
> the contract. Combine with the Autopilot Upgrade — role decisions never stop the loop.

## 1. Role registry (replaces the fixed roster in team.md)

`.sdlc/team.md` becomes an append-mostly registry. Only Priya writes it.

```markdown
# Role Registry
## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |            # grows over time — this is the role's accumulated memory
    zod for validation; error envelope in src/api/errors.ts; money in integer minor units.
- default-tools: standard
- status: active            # active | retired
- minted: 2026-07-25 by Priya (init)
- history: 6 cards completed, 1 rework

## R-04 · sec-review
- charter: Reviews diffs for security: authz, input handling, secrets, dependencies. Severity-rates findings.
- boundaries: Read-only on source. Output only via inbox (review-result | proposed-task | escalation).
- ...
```

Rules:
- **IDs are stable** (`R-##`); cards reference roles by id AND name: `role: R-01 backend`.
- **Reuse before mint:** Priya must scan the registry and reuse/extend an existing role when
  its charter covers ≥ the task's needs. Minting a near-duplicate is a defect.
- **Charter edits > new roles.** If a role keeps producing rework, Priya edits its
  `conventions`/`charter` (logged in Decision Log) rather than minting a replacement.
- **Retire, don't delete.** Retired roles stay for archive traceability.
- Registry changes are auto-decisions: logged in the Decision Log, never a stop.

## 2. One generic worker agent (replaces per-persona agent files)

Delete marcus/elena/jamey/etc. agent files. Keep exactly three agent definitions:

### agents/manager.md  (Priya — unchanged duties + §4 rules below)

### agents/worker.md
```yaml
---
name: worker
description: Generic implementation worker. Spawn with a role charter and one card id. Works the card in an isolated worktree, reports via inbox only.
model: sonnet
maxTurns: 30
isolation: worktree
skills: [sdlc-board]
---
You are a worker on the boardroom team, acting under an assigned ROLE. Your spawn prompt
contains: (1) your role charter, boundaries, and conventions from the registry, (2) exactly
one card id. Protocol:
- Read .sdlc/kanban.md and your card in full. Work ONLY that card, ONLY within your
  role's boundaries. If the card requires touching something outside your boundaries,
  do not do it — file a `question` or `proposed-task` inbox message instead.
- Branch `sdlc/<card-id>-<slug>`; commits prefixed `[<card-id>]`.
- Never edit kanban.md or team.md. All reporting via a new .sdlc/inbox/ file
  (schema in the sdlc-board skill). Only claim DoD boxes you have actually verified,
  and only ever as a request.
- Use `question(HUMAN)` ONLY for irreversible decisions, spending money, credentials/
  secrets, or product-scope changes. Everything else is a normal question for the manager.
```

### agents/reviewer.md
Same frontmatter shape but `disallowedTools` for source edits where the platform allows
path-scoping (else prompt-enforced read-only + inbox/test-only writes). Spawned with a
*review-type* charter (sec-review, qa-verify, code-review). Kept separate from worker.md so
implementation and verification can never share a definition, tools, or prompt.

Priya's spawn prompt template (manager skill):
```
You are acting as role <R-id name>.
CHARTER: <charter>  BOUNDARIES: <boundaries>  CONVENTIONS: <conventions>
Your card: <card-id>. Round: <n>. Report via inbox only.
```

## 3. Card schema change

Replace `assignee:` with:
```markdown
- role: R-01 backend            # which charter executes this
- verify-roles: [R-04 sec-review, R-05 qa-verify]   # set by classification (§4.2)
```
Board rendering, standup, and the dashboard group by ROLE now. `board.json`: rename
`assignee` → `role` (keep `assignee` as an alias for one version so the dashboard doesn't break).

## 4. Manager rules (additions to Priya's prompt)

### 4.1 Allocation algorithm (every round, for each ready card)
1. Determine capabilities the card needs.
2. Registry scan → exact role match? assign. Partial match? extend that role's charter
   (log it) and assign.
3. No match → MINT: id, name, charter, boundaries, conventions seed; log
   `DECISION (auto): minted R-## <name> because <gap>`; assign.
4. Dispatch up to `parallelism` workers; if two ready cards' likely file-footprints overlap,
   serialize them across rounds (note on status-log).

### 4.2 Mandatory classification (replaces "Sofia reviews things")
On card creation Priya tags risk classes; classes attach verify-roles automatically:
- touches auth/authz, input parsing, secrets, dependencies, file/network handling
  → `verify-roles += sec-review` (mandatory, not staffing-dependent)
- produces/changes executable code → `verify-roles += qa-verify` (tests + DoD check)
- infra/deploy changes → `verify-roles += infra-review`
A card CANNOT move to Done until every verify-role has a sign-off inbox message in archive.

### 4.3 Separation of duties (hard invariants)
- The worker instance that implemented a card never verifies it. Verification is always a
  fresh reviewer-agent spawn, even if charters overlap.
- Priya never implements, edits code, or checks DoD boxes on her own authority.
- Red CI blocks merge unconditionally, including in autopilot.

### 4.4 Caps (token/runaway protection)
In project-config.md:
```markdown
- parallelism: 3
- max-role-mints-per-sprint: 4     # breach → batch as question(HUMAN) at next hard stop
- max-active-roles: 10             # breach → Priya must consolidate/retire before minting
```

## 5. Interaction with Autopilot
- Minting, charter edits, allocation, and serialization are auto-decisions → Decision Log,
  no stop. Hard stops remain exactly the Autopilot spec §3 list (init approval,
  high/critical security, batched question(HUMAN), round cap, completion).
- Stop hook unchanged.
- `/status` additions: active roles with card counts + rework counts; last 3 mints/edits.
- Gate reports add a **Role health** section: cards + rework per role; flag any role with
  rework ≥ 2 and what charter fix Priya applied.

## 6. Migration steps
1. Convert current team.md to registry format: existing personas become R-01..R-06 with
   their charters; keep names as role names (marcus → `backend`, etc.) or keep the human
   names as flavor — builder's choice, ids are what matter.
2. Rewrite open cards: `assignee:` → `role:`; add `verify-roles` via §4.2 classification.
3. Replace persona agent files with worker.md + reviewer.md; update manager skill with
   §4 rules + spawn template.
4. Update dashboard board.json generator (`assignee`→`role`, roster → registry roles with
   active/busy state).

## 7. Acceptance
- [ ] A card needing a capability no existing role covers → Priya mints, logs, assigns,
      completes it with zero human input.
- [ ] A near-duplicate need (e.g. "API endpoint" when backend exists) reuses R-01 — no mint.
- [ ] A card classified auth-touching cannot reach Done without a sec-review sign-off in
      archive/, even with no security role pre-existing.
- [ ] Implementer ≠ verifier verified in archive (different spawn, different agent type).
- [ ] Mint cap breach batches to the next hard stop instead of halting mid-round.
- [ ] Same role with 2 rework cards → gate report shows a charter fix was applied.
- [ ] Full autopilot run on a fresh project completes with roles minted along the way and
      no stops besides init approval and any genuine §3 events.

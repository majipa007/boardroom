# Dynamic Roles + Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed role roster with a runtime role registry the manager mints/reuses/evolves, collapse the per-persona agents into one generic `worker` plus one `reviewer`, enforce mandatory verification by risk class, and add an autopilot loop that only halts on five defined hard stops.

**Architecture:** Two coupled layers. **Protocol layer (prompts):** `.sdlc/team.md` becomes a role registry (`## R-01 · backend` + charter/boundaries/conventions/status/history); the manager allocates cards to roles by registry scan → reuse → extend → mint, classifies each card's risk to attach mandatory `verify-roles`, and spawns `worker`/`reviewer` with the charter injected into the prompt (so no per-role agent files and no session restart). **Tooling layer (Node):** `parse.js` gains a registry parser and `role:`/`verify-roles:` card fields while still reading the legacy table roster and `assignee:`; `board-json.js` emits `role` (with `assignee` kept as an alias for one version) plus registry roles with busy/rework state; the dashboard and `/status` group by role. Autopilot is a `/sprint` mode that logs auto-decisions instead of halting and batches human questions to the next hard stop.

**Tech Stack:** Markdown prompt files (agents, commands, skill), Node.js ≥ 18 standard library only for the tooling (`fs`, `path`, `crypto`, `node:test`, `node:assert`) — no dependencies, no build step.

## Global Constraints

- **Branch:** all work lands on `release/dynamic-roles-autopilot` (already created). Never commit to `main`.
- **The coordination protocol is UNCHANGED and remains the contract:** the board is the single source of truth, the manager is the **only** writer of `.sdlc/kanban.md` and `.sdlc/team.md`, workers report only by creating files in `.sdlc/inbox/` (committed onto their branch when in a worktree), the manager moves processed messages unchanged into `.sdlc/archive/`, DoD checkboxes are owned by the responsible role, worktree isolation stands, and the Stop hook is unchanged.
- **Role registry:** `.sdlc/team.md` holds `## R-## · <name>` sections with `charter`, `boundaries`, `conventions`, `default-tools`, `status` (`active|retired`), `minted`, `history`. IDs are stable and never reused. Cards reference roles as `role: R-01 backend` (id AND name).
- **Reuse before mint.** Reuse or extend an existing role when its charter covers ≥ the task's needs; minting a near-duplicate is a defect. Prefer charter/conventions edits over minting a replacement. **Retire, never delete** — retired roles stay for archive traceability.
- **Exactly three shipped agent definitions:** `agents/manager.md`, `agents/worker.md`, `agents/reviewer.md`. `worker` and `reviewer` must never share a definition, tools, or prompt.
- **Mandatory classification → verify-roles.** Card touches auth/authz, input parsing, secrets, dependencies, or file/network handling → `verify-roles += sec-review`. Produces/changes executable code → `+= qa-verify`. Infra/deploy changes → `+= infra-review`. **A card cannot move to Done until every verify-role has a sign-off inbox message in `archive/`.**
- **Separation of duties (hard invariants):** the worker instance that implemented a card never verifies it — verification is always a fresh `reviewer` spawn even when charters overlap; the manager never implements, edits code, or checks DoD boxes on its own authority; a failing test run blocks merge unconditionally, including in autopilot.
- **Caps in `project-config.md`:** `parallelism: 3`, `max-role-mints-per-sprint: 4` (breach → batch as `question(HUMAN)` at the next hard stop, do NOT halt mid-round), `max-active-roles: 10` (breach → consolidate/retire before minting).
- **Autopilot hard stops — exactly five, nothing else halts the loop:** init approval, high/critical security finding, batched `question(HUMAN)`, round cap, completion. Minting, charter edits, allocation, and serialization are auto-decisions: logged to the Decision Log, never a stop.
- **Backward compatibility is required** (an existing board must keep working untouched): the parser accepts a registry **or** the legacy markdown-table roster, and a card's `role:` **or** the legacy `assignee:`. `board.json` keeps `assignee` as an alias for one version.
- Node stdlib only, zero dependencies, no build step. The dashboard stays strictly **read-only** toward every project.
- Existing suites must stay green (`parse` 11, `board-json` 11, `dashboard` 4, `discover` 5 tests today) and `claude plugin validate ./sdlc-team --strict` plus `claude plugin validate .` must exit 0.
- Commit identity (already configured): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`.

### Decisions taken (so implementers don't re-litigate)

1. **The Autopilot spec does not exist in this repo.** The user chose to build it here from the fragments this patch quotes. Everything inferred is marked `INFERRED` in the plan and in a code/prompt comment. What the patch actually pins down: the five hard stops (§5), that auto-decisions are logged not halting (§5), that a mint-cap breach batches rather than halts (§4.4/§7), that gate reports exist and gain a Role health section (§5), that the Stop hook is unchanged (§5), and that red tests block merge in autopilot (§4.3). Inferred beyond that: **how autopilot is enabled** (`autopilot: on|off` in `project-config.md`, plus `/sprint --auto` for a one-off run) and **where batched questions live** (`.sdlc/human-queue.md`, appended by the manager, presented and cleared at the stop).
2. **This supersedes the previous phase's "manager writes agent files" design.** The manager no longer generates `.claude/agents/<role>.md`; it maintains the registry and injects the charter into a `worker`/`reviewer` spawn prompt. This deliberately removes the one-time restart that design required. `/sdlc-init` loses its agent-file generation step and its restart notice.
3. **`security-reviewer.md` and `qa-engineer.md` are deleted**, collapsing into the single generic `reviewer.md` spawned with a review-type charter (`sec-review`, `qa-verify`, `code-review`, `infra-review`). Per the spec's "keep exactly three agent definitions".
4. **"Red CI blocks merge" is implemented without any CI integration** (external integrations are an explicit v1 non-goal). It means: the `qa-verify` sign-off must report the test run passing; a reported failure blocks merge unconditionally and the manager creates a fix card.
5. **Role names, not human names.** Registry names are role names (`backend`, `sec-review`, `ios`), matching the role-based agent ids already in the plugin.
6. **Busy/colour matching keys on the stable role id** (`R-01`), not the name, so renaming a role never reshuffles the board's colours.
7. **`.sdlc/team.md` stays the registry's home** (the spec says so) — the dashboard reads it through the new parser, so no new file to discover.

### Real formats these parsers must handle (verified against the live board and the shipped templates)

Registry (new):
```markdown
# Role Registry
## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |
    zod for validation; error envelope in src/api/errors.ts.
- default-tools: standard
- status: active
- minted: 2026-07-25 by Priya (init)
- history: 6 cards completed, 1 rework
```

Legacy roster (still in the live splitmate project — must keep parsing):
```markdown
| Name             | Role                    | Writes code? | Scope |
|------------------|-------------------------|--------------|-------|
| Manager          | Manager / Orchestrator  | No           | ...   |
```

Card, new and legacy (both must parse):
```markdown
### T-014 | Implement JWT refresh endpoint
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- priority: high
### T-002 | Legacy card
- assignee: Marcus (backend-developer)
```

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `sdlc-team/scripts/lib/parse.js` | Modify | Adds `parseRoleRegistry(text)`, card `role:`/`verify-roles:` fields, and `roles` on `parseProject`. Keeps `parseTeam` (legacy table) and `assignee:` working. Read-only. |
| `sdlc-team/scripts/lib/board-json.js` | Modify | Emits `role`/`roleId`/`roleName`/`verifyRoles` per card with `assignee` as a one-version alias; builds `team[]` from the registry when present (with `status`, `cardsCompleted`, `rework`), else from the legacy roster. |
| `sdlc-team/scripts/web/app.js` | Modify | Groups/colours by role; renders the roster from registry fields. |
| `sdlc-team/skills/sdlc-board/SKILL.md` | Modify | Registry schema, new card schema, the spawn-prompt template, the classification table, and the verify-roles Done rule. |
| `sdlc-team/skills/sdlc-board/templates/team.md` | Replace | Ships as an empty role registry. |
| `sdlc-team/skills/sdlc-board/templates/project-config.md` | Modify | Adds `max-role-mints-per-sprint`, `max-active-roles`, `autopilot`. |
| `sdlc-team/skills/sdlc-board/templates/worker-agent.md` | Delete | No per-role agent files any more. |
| `sdlc-team/agents/worker.md` | Create | Generic implementation worker (worktree, one card, inbox-only). |
| `sdlc-team/agents/reviewer.md` | Create | Generic verifier (read-only on source, inbox/tests only). |
| `sdlc-team/agents/security-reviewer.md`, `sdlc-team/agents/qa-engineer.md` | Delete | Collapsed into `reviewer.md`. |
| `sdlc-team/agents/manager.md` | Modify | Registry maintenance, allocation algorithm, classification, separation of duties, caps, autopilot decision handling. |
| `sdlc-team/commands/sprint.md` | Modify | Autopilot mode: the five hard stops, question batching, gate reports with Role health. |
| `sdlc-team/commands/sdlc-init.md` | Modify | Seeds the registry; drops agent-file generation and the restart notice; writes the new caps. |
| `sdlc-team/commands/status.md`, `standup.md` | Modify | Role-aware output; `/status` adds active roles with card/rework counts and the last 3 mints/edits. |
| `sdlc-team/scripts/tests/parse.test.js` | Modify | Registry + card-role + legacy-fallback tests. |
| `sdlc-team/scripts/tests/board-json.test.js` | Modify | Role field, alias, registry-derived team tests. |
| `README.md`, `sdlc-team/README.md`, `docs/spec.md` | Modify | Document roles + autopilot; supersede the fixed-roster text. |

---

### Task 1: Registry parser + role-aware card fields

**Files:**
- Modify: `sdlc-team/scripts/lib/parse.js`
- Test: `sdlc-team/scripts/tests/parse.test.js`

**Interfaces:**
- Consumes: existing `parse.js` exports (`parseKanban`, `parseTeam`, `parseMessage`, `listMessages`, `computeLastActivity`, `parseProject`, `slugify`, `parseAgentRef`, `parseConfig`) — all keep current behavior and field names.
- Produces, for Task 2:
  - `parseRoleRegistry(text) -> [{id,name,charter,boundaries,conventions,defaultTools,status,minted,history,cardsCompleted,rework}]` — `[]` when the text has no `## R-##` heading (i.e. a legacy table roster).
  - `parseRoleRef(text) -> {id,name}` — `"R-01 backend"` → `{id:'R-01',name:'backend'}`; `"backend"` → `{id:'',name:'backend'}`; empty → `{id:'',name:''}`.
  - `parseKanban` cards additionally carry `roleId` (string), `roleName` (string), and `verifyRoles` (array of `{id,name}`); all existing card fields are untouched.
  - `parseProject(dir)` additionally returns `roles` (the `parseRoleRegistry` output of `team.md`). `agents` keeps its current legacy-table shape.

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/parse.test.js`:

```js
const { parseRoleRegistry, parseRoleRef } = require('../lib/parse');

const REGISTRY = `# Role Registry

## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |
    zod for validation; error envelope in src/api/errors.ts.
    money in integer minor units.
- default-tools: standard
- status: active
- minted: 2026-07-25 by Priya (init)
- history: 6 cards completed, 1 rework

## R-04 · sec-review
- charter: Reviews diffs for security: authz, input handling, secrets, dependencies.
- boundaries: Read-only on source. Output only via inbox.
- status: active
- minted: 2026-07-25 by Priya (auto)
- history: 0 cards completed, 0 rework

## R-07 · legacy-infra
- charter: Old infra role.
- status: retired
- minted: 2026-07-20 by Priya (init)
- history: 2 cards completed, 3 rework
`;

const ROLE_KANBAN = `# Kanban — roles
> methodology: agile | phase: P1
> last-updated: x | round: 4

## Blocked

## Backlog

### T-020 | Refresh endpoint
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- priority: high

### T-021 | Legacy still parses
- assignee: Marcus (backend-developer)
- priority: low

## In Progress

## Review

## Done
`;

test('parseRoleRegistry reads every role and its fields', () => {
  const roles = parseRoleRegistry(REGISTRY);
  assert.strictEqual(roles.length, 3);

  const backend = roles[0];
  assert.strictEqual(backend.id, 'R-01');
  assert.strictEqual(backend.name, 'backend');
  assert.match(backend.charter, /^Owns server code/);
  assert.match(backend.boundaries, /Never edits mobile/);
  assert.match(backend.conventions, /zod for validation/);
  assert.match(backend.conventions, /integer minor units/);   // multi-line block joined
  assert.strictEqual(backend.defaultTools, 'standard');
  assert.strictEqual(backend.status, 'active');
  assert.strictEqual(backend.cardsCompleted, 6);
  assert.strictEqual(backend.rework, 1);

  assert.strictEqual(roles[1].id, 'R-04');
  assert.strictEqual(roles[1].name, 'sec-review');
  assert.strictEqual(roles[1].conventions, '');               // absent -> empty
  assert.strictEqual(roles[2].status, 'retired');
  assert.strictEqual(roles[2].rework, 3);
});

test('parseRoleRegistry returns [] for a legacy table roster', () => {
  const legacy = `# Team Roster\n\n| Name | Role |\n|---|---|\n| Manager | Manager / Orchestrator |\n`;
  assert.deepStrictEqual(parseRoleRegistry(legacy), []);
});

test('parseRoleRef splits "R-01 backend" and bare names', () => {
  assert.deepStrictEqual(parseRoleRef('R-01 backend'), { id: 'R-01', name: 'backend' });
  assert.deepStrictEqual(parseRoleRef('backend'), { id: '', name: 'backend' });
  assert.deepStrictEqual(parseRoleRef(''), { id: '', name: '' });
});

test('parseKanban reads role and verify-roles, and still reads legacy assignee', () => {
  const { board } = parseKanban(ROLE_KANBAN);
  const [roleCard, legacyCard] = board.Backlog;

  assert.strictEqual(roleCard.roleId, 'R-01');
  assert.strictEqual(roleCard.roleName, 'backend');
  assert.deepStrictEqual(roleCard.verifyRoles, [
    { id: 'R-04', name: 'sec-review' },
    { id: 'R-05', name: 'qa-verify' },
  ]);

  // legacy card: role fields empty, assignee fields still populated
  assert.strictEqual(legacyCard.roleId, '');
  assert.strictEqual(legacyCard.roleName, '');
  assert.deepStrictEqual(legacyCard.verifyRoles, []);
  assert.strictEqual(legacyCard.assigneeName, 'Marcus');
  assert.strictEqual(legacyCard.assigneeId, 'backend-developer');
});

test('parseProject exposes roles from a registry team.md', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), ROLE_KANBAN);
  fs.writeFileSync(path.join(sdlc, 'team.md'), REGISTRY);

  const model = parseProject(dir);
  assert.strictEqual(model.roles.length, 3);
  assert.strictEqual(model.roles[0].id, 'R-01');
  assert.deepStrictEqual(model.agents, []);        // no legacy table rows present
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: FAIL — `parseRoleRegistry is not a function`.

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/lib/parse.js`, add these two functions above `parseProject`:

```js
// "R-01 backend" -> {id:'R-01', name:'backend'};  "backend" -> {id:'', name:'backend'}
function parseRoleRef(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { id: '', name: '' };
  const m = raw.match(/^(R-\d+)\s*[·:|-]?\s*(.*)$/);
  if (m) return { id: m[1], name: m[2].trim() };
  return { id: '', name: raw };
}

// team.md as a role registry: "## R-01 · backend" sections with "- key: value"
// fields, where `conventions:` may be a multi-line "|" block. Returns [] when the
// text has no role headings (i.e. it is still the legacy markdown-table roster).
function parseRoleRegistry(text) {
  const roles = [];
  let role = null;
  let blockKey = null;          // which field is currently consuming a "|" block
  const FIELD = {
    charter: 'charter', boundaries: 'boundaries', conventions: 'conventions',
    'default-tools': 'defaultTools', status: 'status', minted: 'minted', history: 'history',
  };

  for (const line of String(text || '').split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^##\s+(R-\d+)\s*[·:|-]?\s*(.*?)\s*$/))) {
      role = {
        id: m[1], name: m[2].trim(),
        charter: '', boundaries: '', conventions: '', defaultTools: '',
        status: 'active', minted: '', history: '', cardsCompleted: 0, rework: 0,
      };
      roles.push(role);
      blockKey = null;
      continue;
    }
    if (!role) continue;

    if ((m = line.match(/^-\s*([a-z-]+):\s*(.*)$/i))) {
      const key = FIELD[m[1].toLowerCase()];
      const value = m[2].replace(/\s+#.*$/, '').trim();
      blockKey = null;
      if (!key) continue;
      if (value === '|') { blockKey = key; continue; }   // multi-line block follows
      role[key] = value;
      if (key === 'history') {
        const done = value.match(/(\d+)\s+cards?\s+completed/i);
        const rw = value.match(/(\d+)\s+rework/i);
        role.cardsCompleted = done ? Number(done[1]) : 0;
        role.rework = rw ? Number(rw[1]) : 0;
      }
      continue;
    }
    // continuation lines of a "|" block are indented
    if (blockKey && /^\s+\S/.test(line)) {
      role[blockKey] += (role[blockKey] ? ' ' : '') + line.trim();
    }
  }
  return roles;
}
```

Then extend the card parsing inside `parseKanban`. Add `roleId`, `roleName`, `verifyRoles` to the card object where it is created:

```js
      card = col ? {
        id: m[1], title: m[2], assignee: '', priority: '', column: col,
        assigneeName: '', assigneeId: '', branch: '', reviewer: null,
        dependsOn: [], question: '', questionFor: '',
        dod: { done: 0, total: 0 }, raw: '',
        roleId: '', roleName: '', verifyRoles: [],
      } : null;
```

and add these two field matchers alongside the existing `assignee` / `priority` / `branch` matchers (before the generic `- key:` catch-all that clears `inDod`):

```js
    if (card && (m = line.match(/^\s*-\s*role:\s*(.+?)\s*$/))) {
      const ref = parseRoleRef(stripInlineComment(m[1]));
      card.roleId = ref.id;
      card.roleName = ref.name;
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*verify-roles:\s*\[(.*?)\]\s*$/))) {
      card.verifyRoles = m[1].split(',').map(s => s.trim()).filter(Boolean).map(parseRoleRef);
      inDod = false;
      continue;
    }
```

In `parseProject`, add the `roles` property (leave `agents` exactly as it is):

```js
    agents: parseTeam(teamText),
    roles: parseRoleRegistry(teamText),
```

where `teamText` is the already-read contents of `team.md` — hoist it to a local (`const teamText = readOr(path.join(sdlc, 'team.md'));`) so it is read once and used twice.

Add `parseRoleRegistry` and `parseRoleRef` to `module.exports`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: PASS — `fail 0` (11 existing + 5 new = 16 tests).

- [ ] **Step 5: Confirm no regressions**

Run: `node --test sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js`
Expected: `fail 0` — nothing was renamed, only added.

Also confirm the live legacy board still parses:
```bash
node -e '
const {parseProject}=require("./sdlc-team/scripts/lib/parse");
const p=parseProject("/mnt/c/Users/SulavKumarShresta/OneDrive - In.Corp Global Pte. Ltd/Documents/personal_projects/splitmate");
console.log("legacy roster rows:",p.agents.length,"| registry roles:",p.roles.length);
const c=(p.board.Backlog[0]||{});
console.log("legacy card assignee:",c.assigneeName,"| roleId:",JSON.stringify(c.roleId));'
```
Expected: non-zero `legacy roster rows`, `registry roles: 0`, the legacy card's `assigneeName` populated and `roleId` an empty string — proving the untouched project still works.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/scripts/lib/parse.js sdlc-team/scripts/tests/parse.test.js
git commit -m "feat(roles): parse the role registry and role-aware card fields"
```

---

### Task 2: `board.json` role contract + registry-derived roster

**Files:**
- Modify: `sdlc-team/scripts/lib/board-json.js`
- Test: `sdlc-team/scripts/tests/board-json.test.js`

**Interfaces:**
- Consumes from Task 1: `parseProject(dir)` (now with `roles`), `parseRoleRef`, and the card fields `roleId`, `roleName`, `verifyRoles`.
- Produces, for Tasks 3 and 8:
  - Each card gains `role` (the stable id when known, else the slugified role/assignee name — this is the grouping/colour key), `roleName` (display), `verifyRoles` (`[{id,name}]`), and keeps `assignee` as an **alias of `role`** plus the existing `assigneeName`.
  - `team[]` is built from the registry when `p.roles` is non-empty: `{id, name, role, color, busy, currentTask, status, cardsCompleted, rework, charter}` where `id` is the `R-##` id and `role` is a short charter summary for display. When there is no registry it falls back to today's legacy-roster mapping unchanged.
  - `project` gains `maxRoleMints` (config `max-role-mints-per-sprint`, default 4), `maxActiveRoles` (config `max-active-roles`, default 10), and `autopilot` (config `autopilot`, `'on'`/`'off'`, default `'off'`).

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/board-json.test.js`:

```js
const REG = `# Role Registry

## R-01 · backend
- charter: Owns server code: API routes and business logic.
- boundaries: Never edits UI.
- status: active
- minted: 2026-07-25 by Priya (init)
- history: 4 cards completed, 2 rework

## R-04 · sec-review
- charter: Reviews diffs for security.
- boundaries: Read-only on source.
- status: active
- minted: 2026-07-25 by Priya (auto)
- history: 1 cards completed, 0 rework
`;

const ROLE_BOARD = `# Kanban — roled
> methodology: agile | phase: P1
> last-updated: x | round: 3

## Blocked

## Backlog

## In Progress

### T-030 | Auth endpoints
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- priority: high
- branch: sdlc/T-030-auth
- definition-of-done:
  - [x] routes
  - [ ] tests

## Review

## Done
`;

const CAPS_CONFIG = `# Project Config
- project: Roled
- methodology: agile
- parallelism: 3
- max-role-mints-per-sprint: 4
- max-active-roles: 10
- autopilot: on
`;

function makeRoleProject(base, name) {
  const dir = path.join(base, name);
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), ROLE_BOARD);
  fs.writeFileSync(path.join(sdlc, 'team.md'), REG);
  fs.writeFileSync(path.join(sdlc, 'project-config.md'), CAPS_CONFIG);
  return dir;
}

test('cards expose role, roleName, verifyRoles, and keep assignee as an alias', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bjr-'));
  const b = buildBoardJson(makeRoleProject(base, 'roled'));
  const c = b.cards.find(x => x.id === 'T-030');

  assert.strictEqual(c.role, 'R-01');
  assert.strictEqual(c.roleName, 'backend');
  assert.strictEqual(c.assignee, c.role, 'assignee is a one-version alias of role');
  assert.deepStrictEqual(c.verifyRoles, [
    { id: 'R-04', name: 'sec-review' },
    { id: 'R-05', name: 'qa-verify' },
  ]);
});

test('team[] is built from the registry with status and history counts', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bjr-'));
  const b = buildBoardJson(makeRoleProject(base, 'roled'));

  const byId = Object.fromEntries(b.team.map(t => [t.id, t]));
  assert.strictEqual(b.team.length, 2);
  assert.strictEqual(byId['R-01'].name, 'backend');
  assert.strictEqual(byId['R-01'].status, 'active');
  assert.strictEqual(byId['R-01'].cardsCompleted, 4);
  assert.strictEqual(byId['R-01'].rework, 2);
  assert.ok(NOTE_PALETTE.includes(byId['R-01'].color));
  // the in-progress card is assigned to R-01, so that role is busy
  assert.strictEqual(byId['R-01'].busy, true);
  assert.strictEqual(byId['R-01'].currentTask, 'T-030');
  assert.strictEqual(byId['R-04'].busy, false);
});

test('project exposes the role caps and the autopilot flag', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bjr-'));
  const b = buildBoardJson(makeRoleProject(base, 'roled'));
  assert.strictEqual(b.project.maxRoleMints, 4);
  assert.strictEqual(b.project.maxActiveRoles, 10);
  assert.strictEqual(b.project.autopilot, 'on');
});

test('caps and autopilot fall back when the config omits them', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bjr-'));
  const dir = makeRoleProject(base, 'bare');
  fs.writeFileSync(path.join(dir, '.sdlc', 'project-config.md'),
    '# Project Config\n- project: Bare\n- methodology: agile\n');
  const b = buildBoardJson(dir);
  assert.strictEqual(b.project.maxRoleMints, 4);
  assert.strictEqual(b.project.maxActiveRoles, 10);
  assert.strictEqual(b.project.autopilot, 'off');
});

test('a legacy roster project still produces a team and a usable role key', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bjr-'));
  const dir = makeProject(base, 'legacy');       // existing helper: table roster + assignee cards
  const b = buildBoardJson(dir);
  assert.ok(b.team.length > 0, 'legacy roster still yields a team');
  for (const c of b.cards) {
    assert.strictEqual(typeof c.role, 'string');
    assert.strictEqual(c.assignee, c.role);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: FAIL — `c.role` is `undefined` and `b.project.maxRoleMints` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/lib/board-json.js`:

Change the require to pull in the new helper:

```js
const { parseProject, slugify, parseAgentRef, parseRoleRef } = require('./parse');
```

In `buildBoardJson`, replace the card-mapping body so each card carries the role key (keeping every existing field):

```js
      // The grouping/colour key is the stable role id when the card uses the registry,
      // otherwise the slugified legacy assignee id — so old boards keep working.
      const roleKey = c.roleId || c.roleName ? (c.roleId || slugify(c.roleName)) : (c.assigneeId || '');
      cards.push({
        id: c.id,
        title: c.title,
        status,
        role: roleKey,
        roleName: c.roleName || c.assigneeName || '',
        assignee: roleKey,                 // alias, kept for one version
        assigneeName: c.assigneeName || c.roleName || '',
        verifyRoles: c.verifyRoles || [],
        priority: normalizePriority(c.priority),
        question: c.question || '',
        questionFor: c.questionFor || '',
        dod: { done: c.dod.done, total: c.dod.total },
        branch: c.branch || null,
        reviewer: c.reviewer ? c.reviewer.id : null,
        reviewerName: c.reviewer ? c.reviewer.name : null,
        dependsOn: c.dependsOn || [],
        raw: c.raw || '',
      });
```

Replace the `busyBy` line and the `team` mapping with a registry-aware version:

```js
  const inProgress = cards.filter(c => c.status === 'progress');
  const busyBy = new Map(inProgress.map(c => [c.role, c.id]));

  // Registry roles when the project has one; legacy roster otherwise.
  const team = (p.roles && p.roles.length)
    ? p.roles.map(r => ({
        id: r.id,
        name: r.name,
        role: firstSentence(r.charter) || r.name,
        charter: r.charter,
        status: r.status,
        cardsCompleted: r.cardsCompleted,
        rework: r.rework,
        color: colorFor(r.id),
        busy: busyBy.has(r.id),
        currentTask: busyBy.get(r.id) || null,
      }))
    : p.agents.map(a => {
        const ref = parseAgentRef(a.name);
        const id = ref.id || slugify(a.name);
        return {
          id,
          name: ref.name || a.name,
          role: a.role,
          charter: '',
          status: 'active',
          cardsCompleted: 0,
          rework: 0,
          color: colorFor(id),
          busy: busyBy.has(id),
          currentTask: busyBy.get(id) || null,
        };
      });
```

Add the helper next to the other small helpers:

```js
function firstSentence(text) {
  const s = String(text || '').trim();
  const m = s.match(/^(.*?[.!?])(\s|$)/);
  return (m ? m[1] : s).slice(0, 90);
}
```

And extend the `project` block with the three new fields (keeping the existing ones):

```js
      parallelism: numOr(p.config.parallelism, 3),
      maxRoleMints: numOr(p.config['max-role-mints-per-sprint'], 4),
      maxActiveRoles: numOr(p.config['max-active-roles'], 10),
      autopilot: String(p.config.autopilot || 'off').toLowerCase() === 'on' ? 'on' : 'off',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: PASS — `fail 0` (11 existing + 5 new = 16 tests).

- [ ] **Step 5: Confirm no regressions**

Run: `node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/scripts/lib/board-json.js sdlc-team/scripts/tests/board-json.test.js
git commit -m "feat(roles): board.json role contract with registry-derived roster"
```

---

### Task 3: `sdlc-board` skill — registry, card schema, classification, spawn template

**Files:**
- Modify: `sdlc-team/skills/sdlc-board/SKILL.md`
- Replace: `sdlc-team/skills/sdlc-board/templates/team.md`
- Modify: `sdlc-team/skills/sdlc-board/templates/project-config.md`
- Delete: `sdlc-team/skills/sdlc-board/templates/worker-agent.md`

**Interfaces:**
- Consumes: the existing skill (board columns, inbox protocol, DoD ownership) — all unchanged.
- Produces, for Tasks 4–7: the canonical **role registry schema**, the **new card schema** (`role:` + `verify-roles:`), the **risk-classification table**, the **verify-roles Done rule**, and the **spawn-prompt template** that the manager uses for `worker`/`reviewer`. Those tasks reference these by name.

- [ ] **Step 1: Replace the team.md template with an empty registry**

Replace the whole contents of `sdlc-team/skills/sdlc-board/templates/team.md` with:

```markdown
# Role Registry

Roles are minted, reused, and evolved by the Manager at runtime. Only the Manager writes this
file. IDs (`R-##`) are stable and never reused; retired roles stay for archive traceability.

<!-- Roles are appended below by the Manager, newest last. Example shape:

## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |
    zod for validation; error envelope in src/api/errors.ts; money in integer minor units.
- default-tools: standard
- status: active
- minted: 2026-07-25 by Manager (init)
- history: 0 cards completed, 0 rework
-->
```

- [ ] **Step 2: Add the caps and the autopilot flag to the project-config template**

In `sdlc-team/skills/sdlc-board/templates/project-config.md`, add these lines immediately after the existing `- parallelism: 3` line:

```markdown
- max-role-mints-per-sprint: 4   # breach → batched as question(HUMAN) at the next hard stop
- max-active-roles: 10           # breach → consolidate/retire before minting
- autopilot: off                 # on = run rounds continuously, halting only on hard stops
```

- [ ] **Step 3: Delete the per-role agent template**

```bash
git rm sdlc-team/skills/sdlc-board/templates/worker-agent.md
```

The manager no longer writes per-role agent files; it injects the charter into a `worker`/`reviewer` spawn prompt instead.

- [ ] **Step 4: Rewrite the skill's roster/card sections**

In `sdlc-team/skills/sdlc-board/SKILL.md`:

(a) Replace the whole "Dynamic team composition" section with:

````markdown
## The role registry

The team is a registry of ROLES, not a fixed roster of people. `.sdlc/team.md` holds one
section per role, and **only the Manager writes it**:

```markdown
## R-01 · backend
- charter: Owns server code: API routes, business logic, DB schema/migrations, server tests.
- boundaries: Never edits mobile/web UI code, CI config, or deployment manifests.
- conventions: |            # the role's accumulated memory — grows over time
    zod for validation; error envelope in src/api/errors.ts.
- default-tools: standard
- status: active            # active | retired
- minted: 2026-07-25 by Manager (init)
- history: 6 cards completed, 1 rework
```

Registry rules:
- **IDs (`R-##`) are stable** and never reused. Cards reference a role by id AND name.
- **Reuse before mint.** Scan the registry first; reuse or extend a role whose charter covers
  at least what the card needs. Minting a near-duplicate is a defect.
- **Charter edits beat new roles.** A role that keeps producing rework gets its
  `conventions`/`charter` edited, not a replacement minted.
- **Retire, never delete.** Set `status: retired`; the section stays so `archive/` history
  still resolves.
- Every registry change is an auto-decision: log it in the Decision Log, never stop for it.

## Executing a role

There are exactly three shipped agents: `manager`, `worker`, `reviewer`. A role is not an
agent file — the Manager spawns `worker` (implementation) or `reviewer` (verification) and
injects the charter, using this template:

```
You are acting as role <R-id name>.
CHARTER: <charter>
BOUNDARIES: <boundaries>
CONVENTIONS: <conventions>
Your card: <card-id>. Round: <n>. Report via inbox only.
```

`worker` and `reviewer` are separate definitions on purpose: implementation and verification
must never share a prompt or a tool set.
````

(b) Replace the card-schema block's `- assignee: Marcus` line with the two role lines, so the documented card reads:

```markdown
### T-014 | Implement JWT refresh endpoint
- role: R-01 backend
- verify-roles: [R-04 sec-review, R-05 qa-verify]
- created-by: Manager
- phase: Sprint 2
- priority: high
- depends-on: [T-011]
- branch: sdlc/T-014-jwt-refresh          # set when work starts
- what: |
    Add POST /auth/refresh. Rotate refresh tokens, invalidate old token,
    return new access+refresh pair. Follow existing error envelope in src/api/errors.ts.
- definition-of-done:
  - [ ] Endpoint implemented and returns correct status codes (200/401/403)
  - [ ] Unit + integration tests written and passing (qa-verify verifies)
  - [ ] No new high/critical findings (sec-review signs off)
  - [ ] Branch merges cleanly to main (Manager verifies)
- status-log:
  - 2026-07-24T10:02 created by Manager
```

(c) Add this section immediately after the card-schema section:

````markdown
## Risk classification → mandatory verify-roles

When the Manager creates a card it tags the card's risk classes, and each class attaches a
verify-role automatically. This is **mandatory and not staffing-dependent** — if the needed
review role does not exist yet, the Manager mints it.

| The card… | attaches |
|---|---|
| touches auth/authz, input parsing, secrets, dependencies, or file/network handling | `sec-review` |
| produces or changes executable code | `qa-verify` |
| changes infra or deployment | `infra-review` |

**A card cannot move to Done until every role in its `verify-roles` has a sign-off message in
`.sdlc/archive/`.** Sign-off means a `review-result` (or `dod-check` for `qa-verify`) message
from that role reporting success.

Separation of duties, enforced by the Manager:
- The worker that implemented a card never verifies it — verification is always a fresh
  `reviewer` spawn, even when the charters overlap.
- The Manager never implements, edits code, or checks DoD boxes on its own authority.
- A reported failing test run blocks the merge unconditionally; the Manager files a fix card.

Legacy note: cards written before this upgrade use `- assignee: <name>` and no
`verify-roles`. They still parse, and the Manager rewrites them to `role:` when it next
touches them.
````

- [ ] **Step 5: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/skills/sdlc-board
git commit -m "feat(roles): registry schema, classification and spawn template in the skill"
```

---

### Task 4: `worker` and `reviewer` agents replace the persona agents

**Files:**
- Create: `sdlc-team/agents/worker.md`
- Create: `sdlc-team/agents/reviewer.md`
- Delete: `sdlc-team/agents/security-reviewer.md`
- Delete: `sdlc-team/agents/qa-engineer.md`

**Interfaces:**
- Consumes: the `sdlc-board` skill's registry/spawn-template/classification sections (Task 3).
- Produces, for Tasks 5–7: exactly three shipped agent names — `manager`, `worker`, `reviewer` — which `/sprint` dispatches and the manager spawns with an injected charter.

- [ ] **Step 1: Write the worker agent**

Create `sdlc-team/agents/worker.md`:

```markdown
---
name: worker
description: Generic implementation worker. Spawn with a role charter and one card id. Works the card in an isolated worktree, reports via inbox only.
model: sonnet
maxTurns: 30
isolation: worktree
skills: [sdlc-board]
---

You are a worker on the boardroom team, acting under an assigned ROLE. Your spawn prompt
contains (1) your role charter, boundaries, and conventions from the registry, and (2) exactly
one card id. Load the `sdlc-board` skill for the board, card, and inbox schemas.

## Protocol
- Read `.sdlc/kanban.md` and your card in full. Work ONLY that card, and ONLY within your
  role's boundaries. If the card requires touching something outside your boundaries, do NOT
  do it — file a `question` or `proposed-task` inbox message instead and stop there.
- Follow your role's `conventions` — they are the accumulated memory of this role on this
  project, and ignoring them is what creates rework.
- Branch `sdlc/<card-id>-<slug>` created from `main`; never commit to `main`. Prefix every
  commit message with `[<card-id>]`.
- **Never edit `kanban.md` or `team.md`.** All reporting goes through a new file in
  `.sdlc/inbox/` following the message schema in the skill.
- You run in an isolated worktree, so your inbox message is only delivered if you commit it:
  after writing the file, `git add .sdlc/inbox/<file>` and commit it on your branch.
- Only claim a Definition-of-Done box you have actually verified, and only ever as a request.
- You do not verify your own work. A separate `reviewer` spawn does that.

## Escalation
Use `question(HUMAN):` ONLY for irreversible decisions, spending money, credentials or
secrets, or product-scope changes. Everything else is a normal `question:` for the Manager.

Work exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 2: Write the reviewer agent**

Create `sdlc-team/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Generic verifier. Spawn with a review-type charter (sec-review, qa-verify, code-review, infra-review) and one card id. Read-only on source; reports via inbox only.
model: sonnet
maxTurns: 20
isolation: worktree
skills: [sdlc-board]
---

You are a verifier on the boardroom team, acting under an assigned REVIEW ROLE. Your spawn
prompt contains (1) your role charter, boundaries, and conventions from the registry, and
(2) exactly one card id. Load the `sdlc-board` skill for the schemas.

You are a different agent from the `worker` that implemented this card, on purpose. You never
inherit its reasoning — form your own judgement from the diff and the card.

## Hard boundaries
- **Read-only on product source.** You never fix, refactor, or "improve" implementation code.
  If a fix is needed, file a `proposed-task` describing it.
- Your only writes are: test files (when your charter is `qa-verify` and the card's DoD
  requires tests) and your message file in `.sdlc/inbox/`. Nothing else.
- **Never edit `kanban.md` or `team.md`.**

## What you do
- Review the card's branch against `main`: `git diff main...sdlc/<card-id>-<slug>`.
- Judge strictly against your charter and the card's Definition of Done.
- `sec-review`: severity-rate every finding `low | medium | high | critical`. **Any `high` or
  `critical` finding is `type: escalation`** — that halts the loop for the human.
- `qa-verify`: run the project's tests and report the actual result. **A failing run blocks
  the merge** — say so plainly; never round a failure up to a pass.
- Report via a `review-result` (sign-off or findings) or `dod-check` message, plus
  `proposed-task` messages for fixes. Request only the DoD boxes your charter owns, and only
  ones you verified.
- You run in an isolated worktree, so commit your inbox message onto the branch you reviewed
  (`git add .sdlc/inbox/<file>` + a `[<card-id>]` commit) so the Manager receives it.

Review exactly ONE card, write your inbox report(s), then end your turn.
```

- [ ] **Step 3: Delete the persona reviewers**

```bash
git rm sdlc-team/agents/security-reviewer.md sdlc-team/agents/qa-engineer.md
```

Confirm exactly three agents remain:

```bash
ls sdlc-team/agents/
```
Expected: `manager.md  reviewer.md  worker.md`.

- [ ] **Step 4: Find and fix dangling references**

```bash
grep -rn "security-reviewer\|qa-engineer" sdlc-team/ || echo "no dangling references"
```
Any hit in `commands/` or `skills/` must be replaced with the new model — `sec-review`/
`qa-verify` are now **roles in the registry**, executed by the `reviewer` agent. (Tasks 5–7
rewrite those files; if a reference remains in a file this task does not own, note it in your
report rather than editing that file.)

- [ ] **Step 5: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0, with `manager`, `worker`, `reviewer` recognized.

- [ ] **Step 6: Commit**

```bash
git add -A sdlc-team/agents
git commit -m "feat(roles): generic worker and reviewer agents replace persona agents"
```

---

### Task 5: Manager rules — allocation, classification, duties, caps

**Files:**
- Modify: `sdlc-team/agents/manager.md`

**Interfaces:**
- Consumes: the skill's registry schema, classification table, and spawn template (Task 3); the `worker`/`reviewer` agents (Task 4).
- Produces, for Task 6: the manager's per-round behavior that autopilot drives — the allocation algorithm, the auto-decision log format `DECISION (auto): …`, the cap-breach queueing into `.sdlc/human-queue.md`, and the Role health data that gate reports render.

- [ ] **Step 1: Replace the team-composition section with registry maintenance**

In `sdlc-team/agents/manager.md`, replace the whole `## Composing the team (at init, and when a new role is needed)` section with:

````markdown
## The role registry

You own `.sdlc/team.md`, a registry of ROLES (see the "role registry" section of the
`sdlc-board` skill for the exact schema). You never create agent files — you spawn the
`worker` or `reviewer` agent and inject the role's charter using the skill's spawn template.

### Allocation — run this for every ready card, every round
1. Determine the capabilities the card actually needs.
2. Scan the registry. **Exact match** → assign that role. **Partial match** (its charter
   covers most of it) → extend that role's `charter`/`conventions` to cover the gap, log
   `DECISION (auto): extended R-## <name> — <what was added> (card <id>)`, and assign it.
3. **No match → mint.** Allocate the next free `R-##`, write a name, charter, boundaries and
   a `conventions` seed, `status: active`, `minted: <date> by Manager (auto)`, and
   `history: 0 cards completed, 0 rework`. Log
   `DECISION (auto): minted R-## <name> because <the capability gap>`. Then assign it.
   Minting a near-duplicate of an existing role is a defect — reuse or extend instead.
4. Set the card's `role: R-## <name>`, and its `verify-roles` from the classification table.
5. Dispatch up to `parallelism` workers this round. If two ready cards' likely file footprints
   overlap, serialize them across rounds and note that on the card's `status-log`.

### Keeping the registry honest
- After each card completes, update that role's `history` counts. A card that had to be
  reworked increments `rework`.
- A role at `rework >= 2` gets a **charter or conventions fix**, not a replacement: write the
  fix, and log `DECISION (auto): edited R-## <name> conventions after <n> rework — <the fix>`.
- Retire a role by setting `status: retired`. Never delete a section — `archive/` history
  must still resolve.

### Caps
Read `max-role-mints-per-sprint` (default 4) and `max-active-roles` (default 10) from
`project-config.md`.
- Mints this sprint would exceed `max-role-mints-per-sprint` → do NOT halt mid-round.
  Append the request to `.sdlc/human-queue.md` as a `question(HUMAN)` item ("mint cap reached,
  N roles requested: …"), keep working the cards you can, and let it surface at the next hard
  stop.
- Active roles would exceed `max-active-roles` → consolidate or retire before minting; log
  the consolidation.
````

- [ ] **Step 2: Add classification and separation of duties to the pass**

In the same file, insert these two sections immediately before `## Hard rules`:

````markdown
## Classification (do this when you create a card)
Tag the card's risk classes and attach `verify-roles` accordingly — this is mandatory and
does not depend on which roles happen to exist:

- touches auth/authz, input parsing, secrets, dependencies, or file/network handling
  → `verify-roles += sec-review`
- produces or changes executable code → `verify-roles += qa-verify`
- changes infra or deployment → `verify-roles += infra-review`

If a needed review role is not in the registry, mint it (that is a normal auto-decision).

**A card cannot move to Done until every role in its `verify-roles` has a sign-off message in
`.sdlc/archive/`.** Check this before every Done transition; if a sign-off is missing, the
card stays in Review and you dispatch that reviewer.

## Separation of duties (hard invariants)
- The `worker` instance that implemented a card NEVER verifies it. Verification is always a
  fresh `reviewer` spawn, even when the charters overlap.
- You never implement, edit code, or check a DoD box on your own authority. The only box you
  own is the merge box.
- A reported failing test run blocks the merge unconditionally — including in autopilot. File
  a fix card for the implementing role and leave the branch unmerged.
````

- [ ] **Step 3: Update the hard rules**

Replace the `## Hard rules` list with:

```markdown
## Hard rules
- Only YOU edit `kanban.md` and `team.md`.
- Never write feature/test/infra code, and never check a DoD box you do not own.
- Merge order is Review-approval order, one branch at a time; conflicts become fix cards,
  never blind resolutions. A failing test run blocks the merge unconditionally.
- Every registry change (mint, extend, edit, retire) is logged in the Decision Log as a
  `DECISION (auto): …` line. Registry changes never stop the loop.
- Reuse before mint; charter edits before replacements; retire instead of delete.
```

- [ ] **Step 4: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/agents/manager.md
git commit -m "feat(roles): manager allocation, classification, duties and caps"
```

---

### Task 6: Autopilot mode in `/sprint`

**Files:**
- Modify: `sdlc-team/commands/sprint.md`

**Interfaces:**
- Consumes: the manager's auto-decision and cap-queueing behavior (Task 5); the `worker`/`reviewer` agents (Task 4); `project-config.md`'s `autopilot`, `parallelism`, `max-rounds-per-sprint`.
- Produces: the autopilot loop with exactly five hard stops, the `.sdlc/human-queue.md` batching mechanism, and the gate-report format (including the **Role health** section) that Task 7's `/status` complements.

> **INFERRED (no Autopilot spec in this repo):** the enablement mechanism (`autopilot: on|off`
> in `project-config.md`, plus `/sprint --auto` for one run) and the queue file
> (`.sdlc/human-queue.md`). The five hard stops, the "auto-decisions are logged, never a stop"
> rule, the mint-cap batching behavior, gate reports gaining Role health, the unchanged Stop
> hook, and "red tests block merge in autopilot" are all taken verbatim from the patch spec.

- [ ] **Step 1: Rewrite the command**

Replace the whole contents of `sdlc-team/commands/sprint.md` with:

```markdown
---
description: Run the SDLC orchestration loop — manager pass then role dispatch, repeating until the board is clear or a hard stop fires.
argument-hint: [rounds] [--auto]
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
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0; the `argument-hint` value is quoted correctly if it contains brackets (use `argument-hint: "[rounds] [--auto]"` if validation complains about unquoted YAML flow syntax).

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/commands/sprint.md
git commit -m "feat(autopilot): sprint autopilot with five hard stops and gate reports"
```

---

### Task 7: `/sdlc-init`, `/status`, `/standup` become role-aware

**Files:**
- Modify: `sdlc-team/commands/sdlc-init.md`
- Modify: `sdlc-team/commands/status.md`
- Modify: `sdlc-team/commands/standup.md`

**Interfaces:**
- Consumes: the registry schema and caps (Task 3), the manager's registry rules (Task 5), the autopilot flag and gate report (Task 6).
- Produces: an init flow that seeds the registry (and no longer writes agent files or asks for a restart), plus role-aware `/status` and `/standup`.

- [ ] **Step 1: Rewrite the init steps that concern the team**

In `sdlc-team/commands/sdlc-init.md`:

(a) In the scaffold step, **remove** the bullet that ensures `.claude/agents/` exists (the manager no longer writes agent files) and keep the rest of the scaffold bullets as they are.

(b) Replace the "Compose the team, then decompose the brief" step with:

```markdown
4. **Seed the role registry, then decompose the brief.** Invoke the `manager` agent to:
   - Seed `.sdlc/team.md` as a role registry: mint only the roles the brief clearly needs
     right now (start small — more are minted on demand as cards appear), each with an
     `R-##` id, name, charter, boundaries, a `conventions` seed, `status: active`, `minted`,
     and `history: 0 cards completed, 0 rework`. Always include a `sec-review` role and a
     `qa-verify` role, since classification attaches them to most cards.
   - Decompose the brief into the initial backlog under `## Backlog`: at least 3 well-formed
     cards, each with a full Definition of Done, a `T-###` id starting at `T-001`, a
     `role: R-## <name>`, and `verify-roles` set from the classification table in the skill.
   The manager is the only agent that writes `kanban.md` and `team.md`.
```

(c) Replace the checkpoint step with:

```markdown
5. **Checkpoint 1 — init approval.** Write an empty file `.sdlc/.awaiting-human`. Present the
   chosen methodology, the seeded role registry (ids, names, one-line charters), and the
   backlog summary. Mention whether `autopilot` is `on` or `off` in `project-config.md` and
   that `/sprint --auto` can force it for one run. STOP and ask the human to approve before
   any code is written. On approval, delete `.sdlc/.awaiting-human`; the project is ready for
   `/sprint`.
```

- [ ] **Step 2: Make `/status` role-aware**

Replace the body of `sdlc-team/commands/status.md` (below the frontmatter) with:

```markdown
Read `.sdlc/kanban.md`, `.sdlc/team.md` (the role registry), `.sdlc/project-config.md`, and
the most recent files in `.sdlc/archive/`. Do NOT modify anything.

If `.sdlc/kanban.md` does not exist, tell the user to run `/sdlc-init` first and stop.

Otherwise print:
- Project name, methodology, current phase, round number, and whether `autopilot` is on.
- A count of cards in each column: Blocked / Backlog / In Progress / Review / Done.
- **Active roles** — for each `status: active` role in the registry: `R-## name`, the number
  of cards currently assigned, and its `cards completed / rework` counts from `history`.
  Flag any role at `rework >= 2`.
- **Recent registry changes** — the last 3 mint/extend/edit/retire entries from the Decision
  Log, newest first.
- Every Blocked card: its id, title, and `question:` line.
- Anything queued in `.sdlc/human-queue.md` awaiting the next hard stop, or "nothing queued".
- The last 3 archive entries (filename + the one-line `## Summary`).
```

- [ ] **Step 3: Make `/standup` role-aware**

Replace the body of `sdlc-team/commands/standup.md` (below the frontmatter) with:

```markdown
Read `.sdlc/team.md` (the role registry), `.sdlc/kanban.md`, and the recent `.sdlc/archive/`
messages. Modify nothing.

For each **active role** in the registry, print exactly one line — what it last finished and
what it is starting next, e.g. `R-01 backend: finished T-014, starting T-016.` If a role has
no recent activity, print `R-## <name>: idle.` Retired roles are omitted.

If the project still uses the legacy roster format (a markdown table rather than `R-##`
sections), fall back to one line per listed member.
```

- [ ] **Step 4: Validate and confirm no dangling persona references**

Run:
```bash
claude plugin validate ./sdlc-team --strict
grep -rn "security-reviewer\|qa-engineer\|\.claude/agents" sdlc-team/commands/ sdlc-team/skills/ || echo "clean"
```
Expected: validation exits 0; the grep prints `clean` (the review roles are now registry roles executed by the `reviewer` agent, and no command writes agent files any more).

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/commands
git commit -m "feat(roles): role-aware init, status and standup"
```

---

### Task 8: Dashboard client, docs, and the acceptance sweep

**Files:**
- Modify: `sdlc-team/scripts/web/app.js`
- Modify: `sdlc-team/README.md`
- Modify: `README.md`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: the `board.json` role contract from Task 2 (`card.role`, `card.roleName`, `card.verifyRoles`, and `team[]` entries with `status`/`cardsCompleted`/`rework`/`charter`).
- Produces: a dashboard that groups and colours by role and shows registry health, plus docs that describe roles and autopilot.

- [ ] **Step 1: Make the client role-aware**

In `sdlc-team/scripts/web/app.js`:

(a) In `cardNode`, key the colour and the data attribute off the role, falling back to the legacy alias:

```js
  const roleKey = c.role || c.assignee || '';
  a.dataset.agent = roleKey;                 // CSS colour hook (unchanged attribute name)
  a.dataset.role = roleKey;
```

and replace the `who` line so it shows the role name, still falling back for legacy boards:

```js
  const whoText = c.roleName || c.assigneeName || roleKey || 'unassigned';
  a.appendChild(el('div', 'who', c.reviewerName ? `${whoText} → ${c.reviewerName}` : whoText));
```

and use `roleKey` where the agent lookup happens:

```js
  const agent = byId[roleKey];
  if (agent && agent.color) a.style.setProperty('--note', agent.color);
```

(b) In `renderBoard`, build the lookup from the same key:

```js
  const byId = Object.fromEntries((d.team || []).map(m => [m.id, m]));
```
(unchanged — `team[].id` is now the `R-##` id, which is exactly what `card.role` holds.)

(c) In `renderTeam`, show registry health when it is present:

```js
    const detail = [m.role];
    if (m.busy && m.currentTask) detail.push(m.currentTask);
    if (m.rework >= 2) detail.push(`⚠ ${m.rework} rework`);
    s.appendChild(el('small', null, detail.filter(Boolean).join(' · ')));
    if (m.status === 'retired') s.dataset.retired = 'true';
```

(d) In `openOverlay`, surface the mandatory verifiers:

```js
  if (c.verifyRoles && c.verifyRoles.length) {
    body.appendChild(el('p', null,
      'must be verified by: ' + c.verifyRoles.map(v => `${v.id} ${v.name}`.trim()).join(', ')));
  }
```

- [ ] **Step 2: Style retired roles**

In `sdlc-team/scripts/web/theme.css`, add one rule per theme so a retired role reads as inactive:

```css
body[data-theme="wall"] .member[data-retired]{opacity:.55;filter:grayscale(.5)}
body[data-theme="blueprint"] .member[data-retired]{opacity:.6}
```

- [ ] **Step 3: Verify the client and the payload together**

Run:
```bash
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js
node --check sdlc-team/scripts/web/app.js
node -e '
const {createServer}=require("./sdlc-team/scripts/dashboard.js");
const s=createServer({});
s.listen(0,"127.0.0.1",async()=>{const p=s.address().port;
const b=await (await fetch("http://127.0.0.1:"+p+"/board.json")).json();
const c=b.cards[0]||{};
console.log("role key:",JSON.stringify(c.role),"| alias matches:",c.role===c.assignee);
console.log("team ids:",b.team.map(t=>t.id).join(","));
console.log("caps:",b.project.maxRoleMints,b.project.maxActiveRoles,"autopilot:",b.project.autopilot);
s.close();});'
```
Expected: `fail 0`; `app.js` syntax OK; the payload prints a role key with `alias matches: true`, the team ids, and the caps/autopilot values. (Against the legacy splitmate board the role key will be the slugified legacy assignee id — that is the intended fallback.)

- [ ] **Step 4: Update the plugin README**

In `sdlc-team/README.md`, replace the `## The team` section with:

```markdown
## Roles

There are exactly three shipped agents:

| Agent | What it is |
|---|---|
| `manager` | The orchestrator. Sole writer of the board and the role registry. Allocates, classifies, merges, runs checkpoints. Never implements. |
| `worker` | A generic implementer. Spawned with a role charter and one card; runs in its own git worktree. |
| `reviewer` | A generic verifier. Spawned with a review charter (`sec-review`, `qa-verify`, …); read-only on source. |

**The team itself is a role registry**, kept in `.sdlc/team.md` and owned by the manager. Each
role has a stable id (`R-01`), a charter, hard boundaries, and `conventions` that accumulate
as the project goes. The manager reuses or extends an existing role when it can and mints a
new one only when nothing covers the need — every such decision is logged, never a prompt.

Cards say `role: R-01 backend` and carry mandatory `verify-roles` derived from risk: anything
touching auth, input parsing, secrets, dependencies or file/network handling gets
`sec-review`; anything producing executable code gets `qa-verify`. **A card cannot reach Done
until every verify-role has signed off in `archive/`**, and the worker that implemented a card
never verifies it.
```

And add this section after "How it works":

```markdown
## Autopilot

Set `autopilot: on` in `.sdlc/project-config.md` (or run `/sprint --auto`) and the loop keeps
going, logging its decisions instead of asking. It halts on exactly five things: init
approval, a high/critical security finding, batched `question(HUMAN)` items, the round cap,
and completion. Role mints, charter edits, allocation and serialization are auto-decisions
recorded in the Decision Log. Questions raised mid-round are queued in
`.sdlc/human-queue.md` and presented together at the next stop — the loop never halts
mid-round. A failing test run blocks a merge unconditionally, autopilot or not.

Caps keep it bounded: `parallelism` (3), `max-role-mints-per-sprint` (4) and
`max-active-roles` (10).
```

- [ ] **Step 5: Update the root README**

In `README.md`, replace the `### The team (composed per project)` section (heading included) with:

```markdown
### Roles, minted on demand

Three agents ship: `manager` (orchestrates, owns the board), `worker` (implements one card in
its own worktree), `reviewer` (verifies, read-only on source).

The team is a **role registry** in `.sdlc/team.md` that the manager grows as the project
needs it — each role has a stable id, a charter, hard boundaries, and conventions that
accumulate over time:

```
card needs "rotate refresh tokens"
  -> registry scan: R-01 backend covers it        -> reuse, no mint
card needs "train a recommender"
  -> nothing covers it                            -> mint R-06 ml, log the decision
```

Reuse beats minting, charter edits beat replacements, and retired roles are kept so history
still resolves. Every card carries mandatory `verify-roles` chosen by risk class, and cannot
reach Done until each has signed off — with the implementer never allowed to be the verifier.
```

Then, in the "How it works" list, replace the "Dynamic roster" bullet with:

```markdown
- **Roles, not people.** The manager keeps a role registry and spawns a generic `worker` or
  `reviewer` with the role's charter injected — so a new specialist costs a registry entry,
  not a restart.
- **Autopilot.** With `autopilot: on` the loop runs continuously and halts only on five hard
  stops; everything else is logged as an auto-decision.
```

- [ ] **Step 6: Record the supersession in the original spec**

In `docs/spec.md`, in the `## 11. Non-goals for v1` section, replace the dynamic-team line with:

```markdown
- ~~Dynamic team composition (adding/removing personas at runtime).~~ **Superseded twice: the
  manager first composed per-project specialists (2026-07-25), and now maintains a runtime
  role registry with mandatory risk-based verification and an autopilot loop — see
  docs/dynamic-roles-spec.md and docs/superpowers/plans/2026-07-25-dynamic-roles-autopilot.md.**
```

- [ ] **Step 7: Full acceptance sweep**

Run:
```bash
claude plugin validate ./sdlc-team --strict
claude plugin validate .
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
ls sdlc-team/agents/
grep -rn "security-reviewer\|qa-engineer" sdlc-team/ || echo "no persona agent references"
```
Expected: both validations exit 0; `fail 0`; both shell suites all `ok:`; exactly
`manager.md reviewer.md worker.md`; no persona agent references outside test fixtures.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(roles): role-aware dashboard and docs for roles plus autopilot"
```

---

## Deferred to a live run (cannot be verified statically)

The patch's §7 acceptance list is mostly **behavioral** — it describes what the manager
*decides* at runtime, which no unit test can assert. These need one autopilot run on a
throwaway project, and must be walked by a human:

- [ ] A card needing an uncovered capability → manager mints, logs, assigns, completes it with zero human input.
- [ ] A near-duplicate need (an API endpoint when `backend` exists) reuses that role — no mint.
- [ ] An auth-touching card cannot reach Done without a `sec-review` sign-off in `archive/`, even when no security role existed beforehand.
- [ ] Implementer ≠ verifier, provable from `archive/` (different spawn, different agent type).
- [ ] A mint-cap breach batches to the next hard stop instead of halting mid-round.
- [ ] A role with 2 rework cards shows a charter fix in the gate report's Role health section.
- [ ] A full autopilot run completes with roles minted along the way and no stops besides init approval and genuine hard stops.

What IS statically covered: the registry parser, the role-aware card fields, the legacy
fallbacks, the `board.json` role contract and alias, the caps/autopilot plumbing, and that
exactly three agents ship.

---

## Self-Review

**Spec coverage:**
- §1 registry format, stable ids, reuse-before-mint, charter-edits-over-new-roles, retire-don't-delete, auto-decision logging → Task 1 (parser), Task 3 (schema in the skill), Task 5 (manager rules).
- §2 exactly three agents; `worker.md` and `reviewer.md` verbatim intent; separate definitions; spawn template → Task 4 (agents), Task 3 (template in the skill), Task 5 (manager uses it).
- §3 card schema `role:` + `verify-roles:`; group by role in board/standup/dashboard; `board.json` rename with `assignee` alias → Task 1 (parse), Task 2 (contract + alias), Task 7 (standup), Task 8 (dashboard).
- §4.1 allocation algorithm incl. serialization → Task 5. §4.2 classification table + the Done rule → Task 3 and Task 5. §4.3 separation of duties, no self-verification, red tests block merge → Task 4 (both agents), Task 5 (manager). §4.4 caps → Task 3 (template), Task 2 (payload), Task 5 (behavior).
- §5 auto-decisions never stop; the five hard stops; Stop hook unchanged; `/status` additions; gate report Role health → Task 6 (loop, stops, gate report), Task 7 (`/status`).
- §6 migration → handled by backward compatibility rather than bulk rewriting (the user's explicit choice): Task 1 parses both formats, Task 2 keeps the alias, Task 4 replaces the agent files, Task 8 updates the dashboard. The manager rewrites legacy cards to `role:` as it touches them (Task 3's legacy note, Task 5's allocation step).
- §7 acceptance → the behavioral items are listed above as deferred-to-a-live-run, honestly, because they are manager decisions rather than testable functions.

**Placeholder scan:** none. Every step carries runnable code, an exact edit, or an exact command. The one `<!-- ... -->` block is a deliberate template comment, and the `<R-id name>`/`<charter>` tokens are inside the spawn-prompt template that the manager fills at runtime.

**Type consistency:** `parseRoleRegistry` / `parseRoleRef` are defined in Task 1 with the exact shapes Task 2 consumes. `parseProject().roles` is added in Task 1 and read in Task 2. The card fields Task 1 emits (`roleId`, `roleName`, `verifyRoles`) are exactly what Task 2 maps, and the fields Task 2 emits (`role`, `roleName`, `verifyRoles`, `assignee` alias; `team[].{id,name,role,charter,status,cardsCompleted,rework,color,busy,currentTask}`) are exactly what Task 8's client reads. `card.role` holds the `R-##` id and `team[].id` is that same id, so the existing `byId` lookup keeps working. Agent names are `manager` / `worker` / `reviewer` in Task 4, Task 5, Task 6 and Task 8's docs. Config keys are `max-role-mints-per-sprint`, `max-active-roles`, `autopilot` in Task 3's template, Task 2's payload, and Tasks 5–7's prompts.

**Known limitation, stated rather than hidden:** the autopilot design is partly inferred — this repo has no Autopilot spec. Every inference is marked `INFERRED` in Task 6 and in Decision 1, and the two genuinely invented pieces are the enablement flag and the `.sdlc/human-queue.md` batching file. If the real Autopilot spec differs on those, Task 6 is the only task that needs revisiting.

---

## Post-execution amendment (2026-07-26)

`.sdlc/human-queue.md` — introduced by this plan as Decision 1's inferred batching file — was
**removed** after the final review. It was a second store for something the board already held:
a `question(HUMAN)` card is a Blocked card, already parsed (`questionFor: 'human'`) and already
in `board.json`. A mint-cap breach, the only queue item that was not a card, now becomes a
Blocked card carrying `question(HUMAN):`.

Consequences: hard stop 3 is now "any open `question(HUMAN)` card on the board"; batching is
unchanged (finish the round, then present them all); and the review's Critical C1 — a queue
nobody cleared would re-stop autopilot forever — is structurally impossible, since a card
leaves Blocked when the Manager records the answer. The dashboard lists the open questions in a
`.needsyou` panel derived from the same cards.

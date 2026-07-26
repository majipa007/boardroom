# RAD Boardroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the cost of shipping from ~4 rounds per card to ~1 round per increment — RAD cycles, dynamically-sized increments on one shared branch, one verification gate per increment, a `Killed` column, and clickable DoD boxes in the dashboard.

**Architecture:** Three coupled changes. **Board model:** columns become `Next | In flight | Shipped | Killed` (blocked is a card flag, review folds into in-flight), DoD is capped at 3 boxes plus a one-line `ships-when:`, and the *branch* identifies the increment so no new card field is needed. **Concurrency:** worktrees are dropped — every agent in a round shares the working directory on one increment branch, kept safe by explicit per-agent file ownership backed by role charters, plus a hard rule that no agent may move HEAD. **Human input:** the dashboard renders each DoD box as a clickable control that POSTs to its own localhost server, which writes an inbox message the manager applies — so the manager remains the only writer of the board.

**Tech Stack:** Node.js ≥ 18 standard library only (`http`, `fs`, `path`, `crypto`, `node:test`, `node:assert`); vanilla HTML/CSS/JS; Markdown prompt files. No dependencies, no build step.

## Global Constraints

- **Branch:** all work lands on `release/rad-batching` (already created). Never commit to `main`.
- **Optimise for shipped increments per hour and token cost per increment.** Not cards moved, not per-task traceability.
- **Columns are `Next`, `In flight`, `Shipped`, `Killed`.** A card carrying `question(HUMAN):` is blocked by that fact — there is no Blocked column. Review folds into In flight. **Legacy 5-column boards (`Blocked/Backlog/In Progress/Review/Done`) must keep parsing and rendering** — existing projects are not rewritten.
- **RAD is the default and only auto-selected methodology** (construct → verify → cutover). `waterfall` stays as a manual `/sdlc-override` for fixed-spec compliance work. `agile`, `kanban`, `hybrid` are deleted.
- **Increments, not cards, are the unit of work.** A bundle = every ready card one role can own without a file-footprint conflict with another in-flight bundle. **No size cap.** Dependencies inside a bundle are fine. The **branch is the increment** (`sdlc/inc-##-<slug>`); no `batch:` card field.
- **Verification runs once per increment**, over the combined diff, with all needed review roles dispatched in parallel in a single round.
- **NO WORKTREES.** Every agent in a round shares the working directory on one increment branch. Verified git constraints that force this: one directory has one HEAD (a second checkout replaces the first); git refuses a branch already used by another worktree; two agents editing *different* files on the same branch in the same directory is clean.
- **Hard rule for every agent: never run `git checkout`, `git switch`, `git reset`, `git stash`, or anything else that moves HEAD or wholesale rewrites the index.** HEAD is shared. Agents only `git add <their own files>` and `git commit`. On `.git/index.lock` contention, wait briefly and retry once.
- **Collision avoidance is explicit file ownership**, stated per agent in the spawn prompt and backed by the role charter's boundaries. If two ready cards genuinely need the same file, the manager serialises them on the same branch.
- **DoD is capped at 3 boxes per card**, plus a one-line `ships-when:` naming the shippable outcome.
- **The dashboard may write ONLY into `.sdlc/inbox/`**, only via `POST` on the localhost-bound server, and never `kanban.md`, `team.md`, or any source file. The manager remains the sole writer of the board.
- A human DoD tick becomes `.sdlc/inbox/<ISO>_HUMAN_<card>.md` with `type: dod-check`, `from: Human`; the manager applies it, archives it, and logs `DECISION (human): ticked <box> on <card> (owned by <role>)`.
- **Security is batched, never skipped:** review covers the whole increment diff before any merge; a high/critical finding halts immediately; the implementer may evidence its own tests with real output but may never sign off its own security.
- **Crew defaults** in `project-config.md`: `parallelism: 3`, `max-active-roles: 4`, `max-role-mints-per-sprint: 2`. One combined `review` role covers security + QA on low-risk work; a dedicated `sec-review` is minted only when the product warrants it.
- Node stdlib only, zero dependencies, no build step. Server stays bound to `127.0.0.1`.
- Existing suites must stay green (43 tests today across parse/discover/dashboard/board-json, plus both shell suites) and `claude plugin validate ./sdlc-team --strict` and `claude plugin validate .` must exit 0.
- Commit identity (already configured): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`.

### Decisions taken (don't re-litigate)

1. **The branch is the increment.** No `batch:`/`increment:` card field — grouping is derived from `branch:`, which is already parsed. Cards in `Next` are simply unbundled.
2. **Blocked and Review are not columns.** Blocked is `question(HUMAN):` on a card; Review is part of In flight. This is what removes a whole round-trip per card.
3. **Clicking DoD writes an inbox message, not the board.** Keeps the sole-writer invariant and makes every human tick auditable. Cost: the tick is `pending` until the next manager pass — the UI shows that state rather than lying.
4. **Worktrees are dropped, not made optional.** Two agents on two branches in one checkout is impossible in git, so "branches instead of worktrees" necessarily means *one* branch for the whole round. That is the model.
5. **`agile`/`kanban`/`hybrid` are deleted** rather than left unused.

### Current formats these parsers must keep handling

Legacy (live `splitmate` project — must not break):
```markdown
## Blocked
## Backlog
### T-002 | Docker Compose
- assignee: Marcus (backend-developer)
- definition-of-done:
  - [ ] compose up works
## In Progress
## Review
## Done
```

New:
```markdown
## Next
### T-014 | JWT refresh
- role: R-01 backend
- verify-roles: [R-04 review]
- ships-when: POST /auth/refresh rotates tokens and the suite is green.
- branch: sdlc/inc-02-auth        # set when the increment starts
- definition-of-done:
  - [ ] endpoint returns 200/401/403
  - [x] tests green
## In flight
## Shipped
## Killed
```

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `sdlc-team/scripts/lib/parse.js` | Modify | New column set + legacy aliases; `dodItems` (text + checked per box); `shipsWhen`. Read-only. |
| `sdlc-team/scripts/lib/board-json.js` | Modify | New status keys with legacy mapping; `increments` grouped by branch; `dodItems`; `shipsWhen`; `killed`. |
| `sdlc-team/scripts/lib/inbox-write.js` | Create | The one sanctioned write path: `writeDodCheck(projectDir, card, boxIndex, checked)` → a message file in `.sdlc/inbox/`. Nothing else may write. |
| `sdlc-team/scripts/dashboard.js` | Modify | `POST /api/dod` → `writeDodCheck`; still localhost-only; everything else unchanged. |
| `sdlc-team/scripts/web/app.js` | Modify | 4 columns, increment grouping, clickable DoD with `pending` state. |
| `sdlc-team/scripts/web/theme.css` | Modify | DoD control + `pending` + `Killed` column styling in both themes. |
| `sdlc-team/scripts/board-check.sh` | Modify | "Open" = not in `Shipped`/`Killed` (and legacy `Done`). |
| `sdlc-team/skills/sdlc-board/SKILL.md` | Modify | RAD cycle, new columns, increments, `ships-when`, DoD cap, no-worktree + shared-HEAD rules, file ownership. |
| `sdlc-team/skills/sdlc-board/templates/{kanban,project-config}.md` | Modify | New columns; crew caps; `methodology: rad`. |
| `sdlc-team/agents/{worker,reviewer,manager}.md` | Modify | Bundles not single cards; no worktree; never move HEAD; file ownership; one gate per increment. |
| `sdlc-team/commands/{sprint,sdlc-init,status,standup,sdlc-override}.md` | Modify | RAD cycle; increment dispatch; kill decisions; RAD-only methodology. |
| `sdlc-team/scripts/tests/{parse,board-json,dashboard}.test.js` | Modify | Cover the new columns, `dodItems`, increments, and the POST path. |
| `README.md`, `sdlc-team/README.md`, `docs/spec.md` | Modify | Document RAD, increments, no worktrees, clickable DoD. |

---

### Task 1: Columns, DoD items and `ships-when` in `parse.js`

**Files:**
- Modify: `sdlc-team/scripts/lib/parse.js`
- Test: `sdlc-team/scripts/tests/parse.test.js`

**Interfaces:**
- Consumes: existing `parse.js` exports, all keeping current behaviour and names.
- Produces, for Task 2:
  - `COLUMNS` becomes `['Next','In flight','Shipped','Killed']`; a new `LEGACY_COLUMNS` = `['Blocked','Backlog','In Progress','Review','Done']`. `parseKanban` accepts **either** set and returns a `board` keyed by whichever headings the file actually contains.
  - Cards gain `dodItems` (`[{text,checked}]`, in file order) and `shipsWhen` (string, `''` when absent). `dod:{done,total}` keeps working and stays consistent with `dodItems`.

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/parse.test.js`:

```js
const RAD_BOARD = `# Kanban — rad
> methodology: rad | phase: Increment 2
> last-updated: x | round: 3

## Next

### T-014 | JWT refresh
- role: R-01 backend
- ships-when: POST /auth/refresh rotates tokens and the suite is green.
- definition-of-done:
  - [x] endpoint returns 200/401/403
  - [ ] tests green

## In flight

### T-015 | Groups API
- role: R-01 backend
- branch: sdlc/inc-02-auth

## Shipped

### T-001 | Scaffold
- role: R-01 backend
- branch: sdlc/inc-01-foundation

## Killed

### T-099 | Speculative export feature
- role: R-01 backend
`;

test('parseKanban reads the RAD column set', () => {
  const { board } = parseKanban(RAD_BOARD);
  assert.deepStrictEqual(Object.keys(board), ['Next', 'In flight', 'Shipped', 'Killed']);
  assert.strictEqual(board['Next'][0].id, 'T-014');
  assert.strictEqual(board['In flight'][0].id, 'T-015');
  assert.strictEqual(board['Shipped'][0].id, 'T-001');
  assert.strictEqual(board['Killed'][0].id, 'T-099');
});

test('parseKanban still reads a legacy 5-column board', () => {
  const { board } = parseKanban(RICH_KANBAN);   // legacy fixture already in this file
  assert.ok(board['Backlog'], 'legacy Backlog present');
  assert.ok(board['Blocked'], 'legacy Blocked present');
  assert.strictEqual(board['Backlog'][0].id, 'T-009');
});

test('cards expose dodItems in file order and ships-when', () => {
  const { board } = parseKanban(RAD_BOARD);
  const c = board['Next'][0];
  assert.strictEqual(c.shipsWhen, 'POST /auth/refresh rotates tokens and the suite is green.');
  assert.deepStrictEqual(c.dodItems, [
    { text: 'endpoint returns 200/401/403', checked: true },
    { text: 'tests green', checked: false },
  ]);
  assert.deepStrictEqual(c.dod, { done: 1, total: 2 }, 'counts stay consistent with dodItems');

  const shipped = board['Shipped'][0];
  assert.deepStrictEqual(shipped.dodItems, []);
  assert.strictEqual(shipped.shipsWhen, '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: FAIL — the board has legacy keys only, `dodItems` and `shipsWhen` are undefined.

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/lib/parse.js`:

Replace the `COLUMNS` constant and add the legacy set:

```js
const COLUMNS = ['Next', 'In flight', 'Shipped', 'Killed'];
// Boards created before the RAD rework use these. Both sets are accepted so an
// existing project keeps loading untouched.
const LEGACY_COLUMNS = ['Blocked', 'Backlog', 'In Progress', 'Review', 'Done'];
const ALL_COLUMNS = [...COLUMNS, ...LEGACY_COLUMNS];
```

In `parseKanban`, seed the board from whichever set the text actually uses, and key columns off `ALL_COLUMNS`:

```js
function parseKanban(text) {
  const header = { methodology: '', phase: '', round: 0 };
  // Seed with the column set this file uses, so callers see the real shape.
  const isLegacy = /^##\s+(Backlog|In Progress|Done)\s*$/m.test(text);
  const board = {};
  for (const c of (isLegacy ? LEGACY_COLUMNS : COLUMNS)) board[c] = [];
  let col = null, card = null, inDod = false;
  ...
```

and where the `## ` heading is matched, accept any known column (adding it if the file mixes sets):

```js
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      const name = m[1];
      if (ALL_COLUMNS.includes(name)) {
        if (!board[name]) board[name] = [];
        col = name;
      } else {
        col = null;
      }
      card = null; inDod = false;
      continue;
    }
```

Add `dodItems: []` and `shipsWhen: ''` to the card object where it is created, add a `ships-when` matcher next to the other field matchers, and record each DoD box's text as well as its state:

```js
    if (card && (m = line.match(/^\s*-\s*ships-when:\s*(.+?)\s*$/))) {
      card.shipsWhen = stripInlineComment(m[1]);
      inDod = false;
      continue;
    }
```

and replace the DoD checkbox counter with one that also stores the text:

```js
    if (card && inDod && (m = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/))) {
      const checked = m[1] !== ' ';
      card.dodItems.push({ text: m[2].trim(), checked });
      card.dod.total++;
      if (checked) card.dod.done++;
      continue;
    }
```

Export `LEGACY_COLUMNS` alongside `COLUMNS`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: PASS — `fail 0` (16 existing + 3 new = 19).

- [ ] **Step 5: Confirm the live legacy board still parses**

Run:
```bash
node -e '
const {parseKanban}=require(process.cwd()+"/sdlc-team/scripts/lib/parse");
const fs=require("fs");
const p="/mnt/c/Users/SulavKumarShresta/OneDrive - In.Corp Global Pte. Ltd/Documents/personal_projects/splitmate/.sdlc/kanban.md";
const {board}=parseKanban(fs.readFileSync(p,"utf8"));
console.log("columns:",Object.keys(board).join(" | "));
console.log("cards:",Object.values(board).reduce((n,a)=>n+a.length,0));
const c=(board.Backlog||[])[0]||{};
console.log("first card dodItems:",(c.dodItems||[]).length,"| dod:",JSON.stringify(c.dod));'
```
Expected: legacy column names, a non-zero card count, and `dodItems.length` equal to `dod.total` — proving the untouched project still loads and the new field is populated for it too.

- [ ] **Step 6: Regression + commit**

Run: `node --test sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js`
Expected: `fail 0`.

```bash
git add sdlc-team/scripts/lib/parse.js sdlc-team/scripts/tests/parse.test.js
git commit -m "feat(rad): RAD columns, DoD items and ships-when in the parser"
```

---

### Task 2: `board.json` — new statuses, increments, DoD items

**Files:**
- Modify: `sdlc-team/scripts/lib/board-json.js`
- Test: `sdlc-team/scripts/tests/board-json.test.js`

**Interfaces:**
- Consumes from Task 1: `COLUMNS`, `LEGACY_COLUMNS`, and card fields `dodItems`, `shipsWhen`.
- Produces, for Tasks 3–4:
  - `STATUS_BY_COLUMN` maps both sets: `Next→next`, `In flight→flight`, `Shipped→shipped`, `Killed→killed`; legacy `Blocked→next`, `Backlog→next`, `In Progress→flight`, `Review→flight`, `Done→shipped`.
  - `COLUMNS` (exported) = `['next','flight','shipped','killed']`.
  - Cards gain `dodItems` (`[{text,checked}]`) and `shipsWhen`.
  - New top-level `increments`: `[{branch, cards:[id], roles:[roleId], dod:{done,total}}]`, one entry per distinct non-null `branch` among non-shipped/killed cards, so the UI can group in-flight work.

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/board-json.test.js`:

```js
const RAD_BOARD2 = `# Kanban — rad2
> methodology: rad | phase: Increment 1
> last-updated: x | round: 2

## Next

### T-020 | Not started
- role: R-01 backend

## In flight

### T-021 | Auth routes
- role: R-01 backend
- branch: sdlc/inc-01-core
- ships-when: auth endpoints live and green.
- definition-of-done:
  - [x] routes
  - [ ] tests

### T-022 | Auth screens
- role: R-02 frontend
- branch: sdlc/inc-01-core
- definition-of-done:
  - [ ] screens

## Shipped

### T-001 | Scaffold
- role: R-01 backend
- branch: sdlc/inc-00-scaffold

## Killed

### T-099 | Speculative export
- role: R-01 backend
`;

function makeRadProject(base, name) {
  const dir = path.join(base, name);
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), RAD_BOARD2);
  fs.writeFileSync(path.join(sdlc, 'team.md'),
    '# Role Registry\n\n## R-01 · backend\n- charter: Owns api/**.\n- status: active\n- history: 1 cards completed, 0 rework\n\n## R-02 · frontend\n- charter: Owns app/**.\n- status: active\n- history: 0 cards completed, 0 rework\n');
  fs.writeFileSync(path.join(sdlc, 'project-config.md'),
    '# Project Config\n- project: Rad2\n- methodology: rad\n- parallelism: 3\n- max-active-roles: 4\n');
  return dir;
}

test('statuses use the RAD keys', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rad-'));
  const b = buildBoardJson(makeRadProject(base, 'r'));
  assert.deepStrictEqual(b.columns, ['next', 'flight', 'shipped', 'killed']);
  const byId = Object.fromEntries(b.cards.map(c => [c.id, c]));
  assert.strictEqual(byId['T-020'].status, 'next');
  assert.strictEqual(byId['T-021'].status, 'flight');
  assert.strictEqual(byId['T-001'].status, 'shipped');
  assert.strictEqual(byId['T-099'].status, 'killed');
});

test('cards carry dodItems and shipsWhen', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rad-'));
  const b = buildBoardJson(makeRadProject(base, 'r'));
  const c = b.cards.find(x => x.id === 'T-021');
  assert.deepStrictEqual(c.dodItems, [
    { text: 'routes', checked: true },
    { text: 'tests', checked: false },
  ]);
  assert.strictEqual(c.shipsWhen, 'auth endpoints live and green.');
  assert.deepStrictEqual(c.dod, { done: 1, total: 2 });
});

test('increments group in-flight cards by branch', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rad-'));
  const b = buildBoardJson(makeRadProject(base, 'r'));
  assert.strictEqual(b.increments.length, 1, 'only the in-flight branch counts');
  const inc = b.increments[0];
  assert.strictEqual(inc.branch, 'sdlc/inc-01-core');
  assert.deepStrictEqual(inc.cards.sort(), ['T-021', 'T-022']);
  assert.deepStrictEqual(inc.roles.sort(), ['R-01', 'R-02']);
  assert.deepStrictEqual(inc.dod, { done: 1, total: 3 });
});

test('a legacy board maps onto the RAD statuses', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rad-'));
  const dir = makeProject(base, 'legacy');      // existing legacy helper
  const b = buildBoardJson(dir);
  assert.deepStrictEqual(b.columns, ['next', 'flight', 'shipped', 'killed']);
  for (const c of b.cards) assert.ok(['next', 'flight', 'shipped', 'killed'].includes(c.status));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: FAIL — statuses are the old keys and `increments` is undefined.

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/lib/board-json.js`:

```js
const STATUS_BY_COLUMN = {
  // RAD
  'Next': 'next', 'In flight': 'flight', 'Shipped': 'shipped', 'Killed': 'killed',
  // legacy boards fold onto the same four
  'Blocked': 'next', 'Backlog': 'next', 'In Progress': 'flight',
  'Review': 'flight', 'Done': 'shipped',
};
const COLUMNS = ['next', 'flight', 'shipped', 'killed'];
```

In the card mapping, carry the two new fields:

```js
        dodItems: c.dodItems || [],
        shipsWhen: c.shipsWhen || '',
```

`busyBy` should now consider in-flight cards:

```js
  const inFlight = cards.filter(c => c.status === 'flight');
  const busyBy = new Map(inFlight.map(c => [c.role, c.id]));
```
and `activeWorktrees` becomes `inFlight.length` (the name stays for payload compatibility; there are no worktrees any more — note that in a comment).

Add the increments roll-up before building the payload, and include it:

```js
// One entry per distinct branch among cards still in flight — the branch IS the
// increment, so this is derived rather than stored on the card.
function buildIncrements(cards) {
  const by = new Map();
  for (const c of cards) {
    if (c.status === 'shipped' || c.status === 'killed') continue;
    if (!c.branch) continue;
    if (!by.has(c.branch)) by.set(c.branch, { branch: c.branch, cards: [], roles: [], dod: { done: 0, total: 0 } });
    const inc = by.get(c.branch);
    inc.cards.push(c.id);
    if (c.role && !inc.roles.includes(c.role)) inc.roles.push(c.role);
    inc.dod.done += c.dod.done;
    inc.dod.total += c.dod.total;
  }
  return [...by.values()];
}
```

and in the payload object add `increments: buildIncrements(cards),`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: PASS — `fail 0` (16 existing + 4 new = 20).

- [ ] **Step 5: Regression + commit**

Run: `node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js`
Expected: `fail 0`. (If a pre-existing test asserted the old `progress`/`backlog` status strings, update it to the RAD keys — the mapping is deliberate.)

```bash
git add sdlc-team/scripts/lib/board-json.js sdlc-team/scripts/tests/board-json.test.js
git commit -m "feat(rad): RAD statuses, increments roll-up and DoD items in board.json"
```

---

### Task 3: The one sanctioned write path — `POST /api/dod`

**Files:**
- Create: `sdlc-team/scripts/lib/inbox-write.js`
- Modify: `sdlc-team/scripts/dashboard.js`
- Test: `sdlc-team/scripts/tests/dashboard.test.js`

**Interfaces:**
- Consumes from Task 1: `parseProject` (to resolve the card and its DoD text) and `discoverProjects`.
- Produces, for Task 4: `POST /api/dod` with a JSON body `{project, card, index, checked}` → writes exactly one file into that project's `.sdlc/inbox/` and replies `{ok:true, file}`. Exported helper `writeDodCheck({projectDir, cardId, index, checked, boxText}) -> string` (the path written).
- **This module is the only place in the dashboard that writes anything.** It must refuse to write outside `<projectDir>/.sdlc/inbox/`.

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/dashboard.test.js`:

```js
const { writeDodCheck } = require('../lib/inbox-write');

test('writeDodCheck writes one schema-valid inbox message', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dodw-'));
  const dir = makeProject(base, 'alpha');
  const file = writeDodCheck({ projectDir: dir, cardId: 'T-001', index: 0, checked: true, boxText: 'compose up works' });

  assert.ok(file.startsWith(path.join(dir, '.sdlc', 'inbox')), 'writes inside .sdlc/inbox only');
  const body = fs.readFileSync(file, 'utf8');
  assert.match(body, /^---\n/);
  assert.match(body, /^from: Human$/m);
  assert.match(body, /^task: T-001$/m);
  assert.match(body, /^type: dod-check$/m);
  assert.match(body, /## Summary/);
  assert.match(body, /compose up works/);
  assert.match(body, /## Requested board changes/);
});

test('POST /api/dod writes a message and never touches the board', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dodw-'));
  const dir = makeProject(base, 'alpha');
  const boardBefore = fs.readFileSync(path.join(dir, '.sdlc', 'kanban.md'), 'utf8');
  const reg = path.join(base, 'registry.json');
  const server = createServer({ root: base, registryPath: reg });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/dod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'alpha', card: 'T-001', index: 0, checked: true }),
    });
    assert.strictEqual(r.status, 200);
    const out = await r.json();
    assert.strictEqual(out.ok, true);
    assert.ok(fs.existsSync(out.file), 'the message file exists');

    assert.strictEqual(fs.readFileSync(path.join(dir, '.sdlc', 'kanban.md'), 'utf8'), boardBefore,
      'the board is byte-identical — the dashboard never writes it');
  } finally {
    await new Promise(res => server.close(res));
  }
});

test('POST /api/dod rejects an unknown project and a bad body', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dodw-'));
  makeProject(base, 'alpha');
  const reg = path.join(base, 'registry.json');
  const server = createServer({ root: base, registryPath: reg });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const post = (body) => fetch(`http://127.0.0.1:${port}/api/dod`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
  try {
    assert.strictEqual((await post(JSON.stringify({ project: '../etc', card: 'T-001', index: 0 }))).status, 400);
    assert.strictEqual((await post('not json')).status, 400);
    assert.strictEqual((await post(JSON.stringify({ project: 'alpha' }))).status, 400);
    assert.strictEqual((await fetch(`http://127.0.0.1:${port}/api/dod`)).status, 404, 'GET is not the write path');
  } finally {
    await new Promise(res => server.close(res));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: FAIL — `Cannot find module '../lib/inbox-write'`.

- [ ] **Step 3: Write the writer module**

Create `sdlc-team/scripts/lib/inbox-write.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

// The ONLY write path the dashboard has. It creates one inbox message and nothing
// else: never kanban.md, never team.md, never a source file. The Manager applies
// the request on its next pass, so the board keeps a single writer.
function writeDodCheck({ projectDir, cardId, index, checked, boxText, now }) {
  if (!projectDir || !cardId || !Number.isInteger(index)) {
    throw new Error('projectDir, cardId and an integer index are required');
  }
  const inbox = path.join(projectDir, '.sdlc', 'inbox');
  const resolved = path.resolve(inbox);
  if (!resolved.startsWith(path.resolve(projectDir, '.sdlc'))) {
    throw new Error('refusing to write outside .sdlc/inbox');
  }
  fs.mkdirSync(inbox, { recursive: true });

  const stamp = (now || new Date().toISOString()).replace(/\.\d+Z$/, 'Z');
  const safeStamp = stamp.replace(/:/g, '-');
  const file = path.join(inbox, `${safeStamp}_HUMAN_${cardId}.md`);
  const verb = checked ? 'check' : 'uncheck';
  const body = `---
from: Human
task: ${cardId}
type: dod-check
timestamp: ${stamp}
---
## Summary
The human ${checked ? 'ticked' : 'un-ticked'} definition-of-done box ${index + 1}${boxText ? ` ("${boxText}")` : ''} on ${cardId} from the dashboard.

## Requested board changes
- ${verb} DoD box ${index + 1} on ${cardId}

## Notes for others
(none)

## New task proposals
(none)
`;
  fs.writeFileSync(file, body);
  return file;
}

module.exports = { writeDodCheck };
```

- [ ] **Step 4: Wire the route**

In `sdlc-team/scripts/dashboard.js`, add the require and a small body reader:

```js
const { writeDodCheck } = require('./lib/inbox-write');

function readJsonBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}
```

Then add this branch inside `createServer`'s handler, before the 404:

```js
    if (pathname === '/api/dod' && req.method === 'POST') {
      readJsonBody(req).then(body => {
        const id = String(body.project || '');
        // The project is chosen from the discovered set by exact basename — a
        // request can never point the writer at an arbitrary path.
        const dirs = discoverProjects({ root, registryPath });
        const dir = dirs.find(d => path.basename(d) === id);
        if (!dir || !body.card || !Number.isInteger(body.index)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'unknown project, or missing card/index' }));
          return;
        }
        const model = parseProject(dir);
        const card = Object.values(model.board).flat().find(c => c.id === body.card);
        const boxText = card && card.dodItems[body.index] ? card.dodItems[body.index].text : '';
        const file = writeDodCheck({
          projectDir: dir, cardId: body.card, index: body.index,
          checked: body.checked !== false, boxText,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      }).catch(e => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
      return;
    }
```

Note the handler already destructures `registryPath`; if it does not, add it to `createServer`'s options so discovery stays hermetic in tests.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: PASS — `fail 0`.

- [ ] **Step 6: Confirm the server is still localhost-only and read-only toward the board**

Run:
```bash
grep -n "server.listen" sdlc-team/scripts/dashboard.js
grep -rn "writeFileSync\|mkdirSync\|unlink\|rename" sdlc-team/scripts/dashboard.js sdlc-team/scripts/lib/board-json.js sdlc-team/scripts/lib/parse.js || echo "no writes outside inbox-write.js"
```
Expected: `listen(args.port, '127.0.0.1', …)`; the second grep prints the no-writes line (all writing lives in `inbox-write.js`).

- [ ] **Step 7: Commit**

```bash
git add sdlc-team/scripts/lib/inbox-write.js sdlc-team/scripts/dashboard.js sdlc-team/scripts/tests/dashboard.test.js
git commit -m "feat(rad): POST /api/dod writes a dod-check inbox message"
```

---

### Task 4: UI — four columns, increments, clickable DoD

**Files:**
- Modify: `sdlc-team/scripts/web/app.js`
- Modify: `sdlc-team/scripts/web/theme.css`

**Interfaces:**
- Consumes from Tasks 2–3: `columns` = `['next','flight','shipped','killed']`, `cards[].{status,dodItems,shipsWhen}`, `increments[]`, and `POST /api/dod`.
- Produces: the rendered board with four columns, an increment strip, and DoD controls that POST and show a `pending` state until the next poll confirms.

- [ ] **Step 1: Switch the columns and render DoD controls**

In `sdlc-team/scripts/web/app.js`:

Replace `COLS` and the stamp map keys:

```js
const COLS = [
  ['next', 'Next'],
  ['flight', 'In flight'],
  ['shipped', 'Shipped'],
  ['killed', 'Killed'],
];

// status -> [data-stamp, data-stamp-wall, data-stamp-bp]; Next has none
const STAMPS = {
  flight: ['wip', 'on it ✍', 'W.I.P.'],
  shipped: ['merged', 'shipped ✓', 'SHIPPED'],
  killed: ['killed', 'dropped ✕', 'KILLED'],
};
```

Add a pending-tick set and the DoD control renderer, above `cardNode`:

```js
// Boxes the human clicked whose inbox message the Manager has not applied yet.
const pendingTicks = new Set();          // `${cardId}:${index}`

async function toggleDod(card, index, nextChecked) {
  const key = `${card.id}:${index}`;
  pendingTicks.add(key);
  renderBoard();                          // optimistic: show it immediately as pending
  try {
    const r = await fetch('./api/dod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: selectedProject, card: card.id, index, checked: nextChecked,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    pendingTicks.delete(key);             // failed — drop the optimistic state
    renderBoard();
  }
}

function dodList(card) {
  const wrap = el('div', 'dodlist');
  card.dodItems.forEach((item, i) => {
    const key = `${card.id}:${i}`;
    const pending = pendingTicks.has(key);
    if (item.checked) pendingTicks.delete(key);   // the Manager applied it
    const row = el('label', 'dodbox');
    row.dataset.state = item.checked ? 'checked' : (pending ? 'pending' : 'open');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.checked || pending;
    box.addEventListener('click', ev => {
      ev.stopPropagation();                        // don't open the overlay
      toggleDod(card, i, !item.checked);
    });
    row.appendChild(box);
    row.appendChild(el('span', 'dodtext', item.text));
    if (pending && !item.checked) row.appendChild(el('span', 'dodpending', 'pending'));
    wrap.appendChild(row);
  });
  return wrap;
}
```

In `cardNode`, render `ships-when` and the DoD list instead of only the bar:

```js
  if (c.shipsWhen) a.appendChild(el('div', 'ships', `ships when: ${c.shipsWhen}`));

  if (c.dodItems && c.dodItems.length) {
    const pct = Math.round((c.dod.done / c.dod.total) * 100);
    const d = el('div', 'dod', `DoD ${c.dod.done}/${c.dod.total}${c.branch ? ' · ' + c.branch : ''}`);
    const bar = el('div', 'bar');
    const i = document.createElement('i');
    i.style.width = pct + '%';
    bar.appendChild(i);
    d.appendChild(bar);
    a.appendChild(d);
    a.appendChild(dodList(c));
  }
```

- [ ] **Step 2: Render the increment strip**

Add a renderer and call it from `poll()` right after `renderNeedsYou(d)`:

```js
function renderIncrements(d) {
  const host = document.getElementById('increments');
  host.textContent = '';
  const list = d.increments || [];
  host.hidden = list.length === 0;
  if (!list.length) return;
  host.appendChild(el('h4', null,
    currentTheme() === 'blueprint' ? 'INCREMENTS IN FLIGHT' : 'in flight'));
  for (const inc of list) {
    const row = el('div', 'incrow');
    row.appendChild(el('span', 'incbranch', inc.branch));
    row.appendChild(el('span', 'inccards', `${inc.cards.length} cards`));
    row.appendChild(el('span', 'increles', inc.roles.join(', ')));
    row.appendChild(el('span', 'incdod', `DoD ${inc.dod.done}/${inc.dod.total}`));
    host.appendChild(row);
  }
}
```

and add the container to `sdlc-team/scripts/web/index.html` immediately after the `needsyou` section:

```html
<section class="increments" id="increments" aria-label="Increments in flight" hidden></section>
```

Wire it into the grid by extending the areas in `theme.css`:

```css
  grid-template-areas:"rail hdr" "rail needs" "rail incs" "rail team" "rail board" "rail feed" "rail tblock";
  grid-template-rows:auto auto auto auto 1fr auto auto;
```
and `.increments{grid-area:incs;margin:8px 32px 0;padding:8px 14px}` plus `.increments[hidden]{display:none}`.

- [ ] **Step 3: Style the new pieces in both themes**

Add to `sdlc-team/scripts/web/theme.css` — shared:

```css
.dodlist{margin-top:6px;display:flex;flex-direction:column;gap:2px}
.dodbox{display:flex;align-items:flex-start;gap:6px;font-size:11px;line-height:1.3;cursor:pointer}
.dodbox input{margin:1px 0 0;cursor:pointer}
.dodbox[data-state="checked"] .dodtext{text-decoration:line-through;opacity:.65}
.dodpending{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.ships{margin-top:5px;font-size:11px;font-style:italic;opacity:.85}
.incrow{display:flex;gap:12px;align-items:baseline;font-size:11.5px;padding:3px 0}
.incbranch{font-weight:800}
.increles,.incdod,.inccards{opacity:.85}
```

Wall (before the Blueprint banner):

```css
body[data-theme="wall"] .increments{background:#fff;border-radius:8px;box-shadow:1px 2px 6px rgba(0,0,0,.1)}
body[data-theme="wall"] .increments h4{font-family:'Caveat',cursive;font-size:17px;letter-spacing:0;color:#635C52}
body[data-theme="wall"] .dodpending{color:#B07A1F}
body[data-theme="wall"] .incbranch{color:#2E2A26}
body[data-theme="wall"] .card[data-status="killed"]{filter:grayscale(.7);opacity:.6}
```

Blueprint (before the RESPONSIVE banner):

```css
body[data-theme="blueprint"] .increments{border:1px solid var(--lineW);background:rgba(9,34,74,.55)}
body[data-theme="blueprint"] .increments h4{font-family:'Oswald',sans-serif;letter-spacing:.22em}
body[data-theme="blueprint"] .dodpending{color:var(--warn)}
body[data-theme="blueprint"] .incbranch{font-family:'Oswald',sans-serif;letter-spacing:.08em}
body[data-theme="blueprint"] .card[data-status="killed"]{opacity:.55}
body[data-theme="blueprint"] .card[data-stamp="killed"]::after{color:var(--dim);border-color:var(--dim)}
```

And in the ≤640px block add `.increments{margin:8px 16px 0}`.

- [ ] **Step 4: Verify**

Run:
```bash
node --check sdlc-team/scripts/web/app.js
node --test sdlc-team/scripts/tests/*.test.js
python3 -c "
s=open('sdlc-team/scripts/web/theme.css',encoding='utf-8').read()
print('braces balanced:', s.count('{')==s.count('}'))
for t in ['grid-area:incs','.dodbox','.dodpending','.incrow','data-status=\"killed\"']:
    print(('ok   ' if t in s else 'MISS '), t)
"
```
Expected: syntax OK, `fail 0`, braces balanced, every token `ok`.

Then an end-to-end click check against a fixture (this is the one behaviour worth proving without a browser):
```bash
node -e '
const {createServer}=require(process.cwd()+"/sdlc-team/scripts/dashboard.js");
const fs=require("fs"),os=require("os"),path=require("path");
const base=fs.mkdtempSync(path.join(os.tmpdir(),"clk-"));
const dir=path.join(base,"demo"),sdlc=path.join(dir,".sdlc");
fs.mkdirSync(path.join(sdlc,"inbox"),{recursive:true});fs.mkdirSync(path.join(sdlc,"archive"),{recursive:true});
fs.writeFileSync(path.join(sdlc,"kanban.md"),"# Kanban — demo\n> methodology: rad | phase: I1\n> last-updated: x | round: 1\n\n## Next\n\n### T-001 | Thing\n- role: R-01 backend\n- definition-of-done:\n  - [ ] first box\n\n## In flight\n## Shipped\n## Killed\n");
fs.writeFileSync(path.join(sdlc,"team.md"),"# Role Registry\n\n## R-01 · backend\n- charter: api.\n- status: active\n- history: 0 cards completed, 0 rework\n");
fs.writeFileSync(path.join(sdlc,"project-config.md"),"# Project Config\n- project: Demo\n- methodology: rad\n");
const before=fs.readFileSync(path.join(sdlc,"kanban.md"),"utf8");
const s=createServer({root:base,registryPath:path.join(base,"reg.json")});
s.listen(0,"127.0.0.1",async()=>{const p=s.address().port;
const r=await fetch("http://127.0.0.1:"+p+"/api/dod",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({project:"demo",card:"T-001",index:0,checked:true})});
const out=await r.json();
console.log("POST ok:",out.ok,"| msg written:",fs.existsSync(out.file));
console.log("board untouched:",fs.readFileSync(path.join(sdlc,"kanban.md"),"utf8")===before);
console.log("inbox now holds:",fs.readdirSync(path.join(sdlc,"inbox")).length,"message(s)");
s.close();});'
```
Expected: `POST ok: true`, `msg written: true`, `board untouched: true`, `inbox now holds: 1 message(s)`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/web
git commit -m "feat(rad): four columns, increment strip and clickable DoD in the UI"
```

---

### Task 5: The prompt layer — RAD, bundling, one gate, no worktrees

**Files:**
- Modify: `sdlc-team/skills/sdlc-board/SKILL.md`
- Modify: `sdlc-team/skills/sdlc-board/templates/kanban.md`
- Modify: `sdlc-team/skills/sdlc-board/templates/project-config.md`
- Modify: `sdlc-team/agents/worker.md`, `sdlc-team/agents/reviewer.md`, `sdlc-team/agents/manager.md`
- Modify: `sdlc-team/commands/sprint.md`, `sdlc-init.md`, `sdlc-override.md`
- Modify: `sdlc-team/scripts/board-check.sh`

**Interfaces:**
- Consumes: the column/status/DoD contract from Tasks 1–3.
- Produces: agents that take **bundles** on a **shared branch** with **explicit file ownership** and never move HEAD; a manager that bundles dynamically, kills scope, and runs one verification gate per increment; a `/sprint` loop expressed as RAD cycles.

- [ ] **Step 1: Board schema and templates**

In `sdlc-team/skills/sdlc-board/SKILL.md`, replace the board-file block's columns with:

```markdown
## Next
(decided, not started)

## In flight
(being built or verified — the branch is the increment)

## Shipped

## Killed
(considered and cut — kept for the record)
```

and replace the **Column rules** with:

```markdown
**Column rules:**
- A card carrying `question(HUMAN):` is **blocked by that fact** — there is no Blocked column, and those cards are surfaced first every cycle.
- `In flight` covers both building and verifying. The card's `branch:` names the increment it belongs to.
- A card enters `Shipped` only when its increment's verification signed off and it merged.
- `Killed` is scope that was decided against. Killing is a logged decision; killed cards are never dispatched.
- **Only the Manager edits this file.** Everyone else requests changes via the inbox.
- Legacy boards using `Blocked/Backlog/In Progress/Review/Done` still load; the Manager migrates a card's column when it next touches it.
```

Add a `ships-when:` line and cap the DoD in the documented card schema:

```markdown
- ships-when: POST /auth/refresh rotates tokens and the suite is green.
- definition-of-done:          # keep to 3 boxes or fewer
  - [ ] endpoint returns 200/401/403
  - [ ] tests green
  - [ ] no high/critical findings (review signs off)
```

Add a new section after the card schema:

````markdown
## Increments — the unit of work

Work ships in **increments**, not cards. An increment is a bundle of ready cards built together
on **one branch**, `sdlc/inc-##-<slug>`. The branch IS the increment — there is no separate
field.

- **Bundle dynamically, with no size cap:** every ready card one role can own without a
  file-footprint conflict with another in-flight bundle. Dependencies inside a bundle are fine —
  one agent works them in order.
- Different roles bundle **in parallel on the same branch**, kept apart by file ownership.
- Verification runs **once per increment**, over the combined diff.
- If two ready cards genuinely need the same file, they are serialised on that branch rather
  than split into two increments.

## One branch, one checkout — the rules that keep it safe

There are **no worktrees**. Every agent in a cycle shares the working directory on the
increment branch. Git allows exactly one HEAD per directory, so this is the only way several
agents can run at once without separate checkouts.

- **Never run `git checkout`, `git switch`, `git reset`, `git stash`,** or anything else that
  moves HEAD or rewrites the index wholesale. Doing so destroys every other agent's work in
  flight.
- Only ever `git add <the files you own>` and `git commit`. Never `git add -A`.
- Your spawn prompt names the **files you own**. Editing a file outside that scope is a defect
  even if your charter would otherwise allow it — another agent may hold it this cycle.
- If a commit fails on `.git/index.lock`, wait a moment and retry once.
````

Replace `templates/kanban.md`'s columns with the four new ones, and add to `templates/project-config.md`:

```markdown
- methodology: rad               # rad (default) | waterfall (compliance override)
- max-active-roles: 4
- max-role-mints-per-sprint: 2
```
(replacing the existing `methodology:` line and any previous cap values).

- [ ] **Step 2: Agents take bundles, not single cards**

In `sdlc-team/agents/worker.md`: remove `isolation: worktree` from the frontmatter; change the closing line from "Work exactly ONE card" to working the **bundle** of card ids in the spawn prompt, in dependency order; and replace the git-discipline block with:

```markdown
## Git discipline — you share the working directory
- You are on the increment branch named in your spawn prompt. **Do not change branches.**
  Never run `git checkout`, `switch`, `reset`, or `stash` — other agents are working in this
  same directory right now and moving HEAD destroys their work.
- Only `git add` the files you own (your spawn prompt lists them) and commit with a
  `[<card-id>]` prefix. Never `git add -A`.
- If a commit fails on `.git/index.lock`, wait a moment and retry once.
- Write your inbox message into `.sdlc/inbox/` and commit it on this branch.
```

Apply the same frontmatter and git-discipline changes to `sdlc-team/agents/reviewer.md`, and change its closing line to reviewing **the increment** (the combined diff `git diff main...<increment branch>`) rather than one card. Delete its branch-fallback paragraph about `sdlc/<card-id>-review-<role>` — with a single shared branch it is obsolete.

- [ ] **Step 3: Manager — bundling, killing, one gate**

In `sdlc-team/agents/manager.md`, replace the allocation step 5 ("Dispatch up to `parallelism` workers…") with:

```markdown
5. **Bundle and dispatch.** Group the ready cards into increments: for each free role, the
   maximal set of its ready cards that does not conflict on files with another in-flight
   bundle. No size cap — bundle as much as coherently ships together. Name the increment
   branch `sdlc/inc-##-<slug>`, set it as `branch:` on every card in the bundle, move them to
   `In flight`, and dispatch ONE `worker` per role-bundle with: the role charter, the card ids
   in dependency order, the branch name, and **the explicit list of files that agent owns**.
   Never create a worktree; every agent shares the working directory on that branch.
   If two ready cards need the same file, keep them in the same bundle and say so — they are
   worked in order by one agent.
```

Add a section before `## Hard rules`:

````markdown
## Decide, don't just track
This is a boardroom: your first job every cycle is deciding what NOT to build.

- Apply **"do we really need this?"** to every card you would create or dispatch. Merge trivial
  cards into their neighbour. Move anything speculative to `Killed` with a one-line reason and
  log `DECISION (auto): killed T-### — <reason>`.
- Prefer a handful of substantial cards over a long tail of line items; everything downstream
  scales with card count.
- Cap each card's Definition of Done at **3 boxes**, and give it a one-line `ships-when:`
  naming the shippable outcome.

## One verification gate per increment
When every card in an increment reports done, dispatch **all** of its verify-roles in ONE round,
in parallel, each reviewing the **combined** increment diff (`git diff main...<branch>`). Do not
verify card-by-card. When they all sign off, merge the increment and move its cards to
`Shipped`. A high/critical security finding halts everything before any merge; a reported
failing test run blocks the merge unconditionally and becomes a fix card on the same branch.
````

Also update the human-DoD path in the inbox-drain step:

```markdown
   - A `dod-check` message with `from: Human` is a human ticking a box in the dashboard. Apply
     it, and log `DECISION (human): ticked <box> on <card> (owned by <role>)`. It is applied
     even when a role owns that box — the human may always override.
```

- [ ] **Step 4: `/sprint` becomes RAD cycles**

In `sdlc-team/commands/sprint.md`, replace the round description with the RAD cycle — a **construct** step (bundle + dispatch one worker per role-bundle on the shared increment branch, no worktrees), a **verify** step (all verify-roles for the increment in one parallel round over the combined diff), and a **cutover** step (merge, move to `Shipped`, start the next construct immediately — never leave a role idle while another verifies). Keep the five hard stops exactly as they are. Update the gate report's column names to `Next / In flight / Shipped / Killed` and add a `Killed this cycle:` line.

- [ ] **Step 5: Methodology becomes RAD-only**

In `sdlc-team/commands/sdlc-init.md`, replace the methodology step with:

```markdown
2. **Methodology.** Use **RAD** — build a major part, then test/review/security it as one gate,
   then cut over and repeat. Write `methodology: rad` and a one-line reason into
   `project-config.md`. The only alternative is `waterfall`, and only for a genuinely fixed-spec
   compliance project; the human can switch with `/sdlc-override waterfall`.
```

In `sdlc-team/commands/sdlc-override.md`, change the accepted methodology values to `rad | waterfall`.

- [ ] **Step 6: The Stop hook understands the new columns**

In `sdlc-team/scripts/board-check.sh`, "open" must mean *not shipped and not killed*, for both column sets. Replace the awk block with:

```bash
open=$(awk '
  /^## / {
    done_col = ($0 == "## Shipped" || $0 == "## Killed" || $0 == "## Done")
    next
  }
  /^### T-/ { if (!done_col) count++ }
  END { print count+0 }
' "$BOARD")
```

- [ ] **Step 7: Verify**

Run:
```bash
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
claude plugin validate ./sdlc-team --strict
claude plugin validate .
node --test sdlc-team/scripts/tests/*.test.js
grep -rn "isolation: worktree" sdlc-team/agents/ || echo "no worktrees in any agent"
grep -rn "agile\|kanban-flow\|hybrid" sdlc-team/commands/sdlc-init.md sdlc-team/commands/sdlc-override.md || echo "methodology trimmed to rad|waterfall"
```
Expected: both shell suites `ok:` (the board-check fixtures use legacy `## Done`, which the new awk still treats as closed — if a fixture needs a `## Shipped` case, add one); both validations exit 0; `fail 0`; both greps print their confirmation line.

- [ ] **Step 8: Commit**

```bash
git add -A sdlc-team
git commit -m "feat(rad): RAD cycles, dynamic bundling, shared-branch agents, killed column"
```

---

### Task 6: Docs and the acceptance sweep

**Files:**
- Modify: `README.md`, `sdlc-team/README.md`
- Modify: `docs/spec.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs describing RAD, increments, no worktrees, the `Killed` column and clickable DoD; plus a recorded acceptance run.

- [ ] **Step 1: Update the plugin README**

In `sdlc-team/README.md`: change the "How it works" bullets so they describe **increments on one shared branch** (not one card per worker in its own worktree), the **one gate per increment**, the **four columns** including `Killed`, the **3-box DoD + `ships-when:`**, and that **clicking a DoD box in the dashboard writes an inbox message the manager applies** (so the board still has one writer). Update the `.sdlc/` layout block's column names. Replace the worktree claim wherever it appears.

- [ ] **Step 2: Update the root README**

In `README.md`: replace the "Parallel, isolated, merged deliberately" bullet with a shared-branch + file-ownership bullet; update the *Why it's built this way* table row about agents overwriting each other's files to say **explicit file ownership on one branch** rather than worktrees; update the card anatomy to show `ships-when:` and a 3-box DoD; and add a short **RAD** paragraph replacing the methodology table (RAD default, waterfall as the compliance override).

- [ ] **Step 3: Note the supersession in the historical spec**

In `docs/spec.md`, extend the banner at the top to name this rework too, pointing at `docs/rad-boardroom-spec.md`.

- [ ] **Step 4: Full acceptance sweep**

Run:
```bash
claude plugin validate ./sdlc-team --strict
claude plugin validate .
node --test sdlc-team/scripts/tests/*.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
grep -rn "isolation: worktree\|worktree" sdlc-team/agents sdlc-team/commands sdlc-team/skills || echo "no worktree references in the prompt layer"
node -e '
const {buildBoardJson}=require(process.cwd()+"/sdlc-team/scripts/lib/board-json");
const b=buildBoardJson("/mnt/c/Users/SulavKumarShresta/OneDrive - In.Corp Global Pte. Ltd/Documents/personal_projects/splitmate");
console.log("legacy board -> statuses:",[...new Set(b.cards.map(c=>c.status))].join(","));
console.log("cards:",b.cards.length,"| increments:",b.increments.length);'
```
Expected: both validations exit 0; `fail 0`; both shell suites `ok:`; no worktree references in the prompt layer; and the legacy `splitmate` board maps onto the RAD statuses without error.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(rad): document increments, shared branch, killed column and clickable DoD"
```

---

## Deferred to a live run (cannot be verified statically)

- [ ] A 13-card backlog ships in ≈6–9 rounds rather than ~60.
- [ ] Several roles work one increment branch in the same cycle with no file collisions and no agent moving HEAD.
- [ ] Clicking a DoD box shows `pending`, the manager applies it, the box turns `checked`, and the tick lands in `archive/`.
- [ ] A security finding still halts before any merge; the implementer never signs off its own security.
- [ ] Killed cards are visible and never dispatched.

What IS statically covered: both column sets parsing, `dodItems`/`shipsWhen`, the increments roll-up, the POST write path (including that the board stays byte-identical), the localhost bind, the Stop hook's new notion of "open", and that no agent definition mentions worktrees.

---

## Self-Review

**Spec coverage:** §1 optimisation targets → the whole plan's shape (fewer rounds, fewer cards, one gate). §2 RAD-only → Task 5 Steps 5. §3 dynamic bundling, branch-is-increment → Task 2 (`increments`), Task 5 Steps 1 and 3. §4 four columns incl. `Killed` → Tasks 1, 2, 4, 5 (+ the Stop hook in Step 6). §5 DoD cap, `ships-when`, clickable with `pending` → Tasks 1–4. §6 no worktrees, shared HEAD rules, file ownership → Task 5 Steps 1–3 (and the frontmatter removal). §7 crew defaults → Task 5 Step 1. §8 batched security → Task 5 Step 3. §9 "do we really need this?" as a gate → Task 5 Step 3. §10 acceptance → the deferred list above, honestly split from what is statically covered.

**Placeholder scan:** none — every step carries runnable code, an exact edit, or an exact command.

**Type consistency:** `COLUMNS`/`LEGACY_COLUMNS` from Task 1 are consumed by Task 2's `STATUS_BY_COLUMN`; the status keys `next|flight|shipped|killed` are identical in Task 2, Task 4's `COLS`/`STAMPS`, and the CSS selectors; `dodItems:[{text,checked}]` and `shipsWhen` are produced in Task 1, mapped in Task 2, and read in Tasks 3–4; `writeDodCheck({projectDir,cardId,index,checked,boxText})` is defined in Task 3 and called only there; `increments:[{branch,cards,roles,dod}]` is built in Task 2 and rendered in Task 4.

**Known risks, stated rather than hidden:**
1. **Dropping worktrees trades isolation for speed.** Two agents that both violate their file scope will now silently clobber each other, where worktrees made that impossible. The mitigations are prompt-level (explicit ownership, never move HEAD, no `git add -A`) — real but not enforced by the runtime. This is the deliberate cost of the model the user chose.
2. **The dashboard is no longer strictly read-only.** It writes only into `.sdlc/inbox/` via one module on a localhost-bound POST, and Task 3 asserts the board stays byte-identical — but the invariant is weaker than before.
3. **No unit test covers the client's DoD click path** (no DOM without a dependency); Task 4's end-to-end check proves the server side and that the board is untouched, and the visual/interaction check is deferred.

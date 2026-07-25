# Boardroom Dashboard UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain dashboard UI with a two-theme (Sprint Wall / Blueprint) board rendered from a `board.json` contract that the plugin generates from `.sdlc/` markdown.

**Architecture:** Split cleanly at the JSON boundary. **Server side:** `lib/parse.js` gains the card fields the contract needs (DoD counts, question, reviewer, branch, deps) plus `project-config.md` parsing; a new `lib/board-json.js` maps that raw model onto the §2 contract (slug ids, `progress`-style status keys, agent colour palette, derived `busy`/`sprintRunning`, activity feed, content-hash `revision`); `dashboard.js` serves `GET /board.json[?project=<id>]` and the static web assets. **Client side:** `scripts/web/` holds `index.html` (the §3 DOM skeleton), `app.js` (fetch → render → 5s poll → theme toggle → card overlay) and `theme.css` (both themes keyed on `body[data-theme]`). All logic worth unit-testing lives server side where `node:test` can reach it; the client stays a thin renderer.

**Tech Stack:** Node.js ≥ 18 standard library only (`http`, `fs`, `path`, `crypto`, `node:test`, `node:assert`) — no dependencies, no build step. Vanilla HTML/CSS/JS. Google Fonts (Caveat, Nunito, Oswald, IBM Plex Mono) as the only external resource.

## Global Constraints

- **Branch:** all work lands on `release/dashboard-ui-v2` (already created). Do not commit to `main`.
- **No dependencies, no build step.** Node stdlib only server-side; vanilla HTML/CSS/JS client-side. No framework, no bundler, no `package.json`.
- **Only external resource is Google Fonts** (Caveat, Nunito, Oswald, IBM Plex Mono). Font stacks must fall back to `cursive`, `sans-serif`, `monospace` respectively; layout must not break if fonts fail.
- **The frontend never parses markdown.** It depends only on fetching `./board.json`.
- **Poll every 5 seconds**; re-render only when `revision` changed (no full repaint otherwise).
- **Dashboard stays strictly read-only** toward every project — it never creates, edits, moves, or deletes anything under a project's `.sdlc/`.
- **DOM contract of §3 is fixed.** Class names and `data-` attributes are the API between markup and the two stylesheets. Both themes style that exact skeleton; **all visual change comes from CSS keyed on `body[data-theme]`**.
- `data-theme` ∈ `wall` | `blueprint`; default `wall`; persisted in `localStorage` key `boardroom.theme`; all storage access wrapped in try/catch.
- **Stamp attributes** — set all three on every non-backlog card: blocked → `data-stamp="hold"` / `data-stamp-wall="held ✋"` / `data-stamp-bp="HOLD"`; progress → `wip` / `on it ✍` / `W.I.P.`; review → `inspect` / `checking 👀` / `INSPECT`; done → `merged` / `merged ✓` / `MERGED`; backlog → no stamp attributes at all.
- **Columns, in order:** `blocked`, `backlog`, `progress`, `review`, `done`. `priority` ∈ `high|med|low`. `activity` = the 8 newest archive entries, newest first. Unknown JSON fields must be ignored (forward compatibility).
- **Sprint Wall tokens:** bg `radial-gradient(#E9E4DC → #DFD8CC)`; ink `#2E2A26`; dim `#8A8177`; ok `#3E8E5A`; alarm `#B33A3A`; warn `#B07A1F`; note palette `#FFE87A`, `#FFB3C7`, `#A8E6CF`, `#C9B8F5`, `#AEDDF7`, `#FFD2A6`; display **Caveat** 600/700; body **Nunito** 400–800; card shadow `2px 5px 9px rgba(0,0,0,.18)`; card rotations odd −1.8° / even +1.6°, hover 0° + scale 1.05; tape column headers tilted −1°; 2px dashed column dividers; 🔥 after task id when `high`.
- **Blueprint tokens:** paper `linear-gradient(135deg, #123C7A → #0E3168)`; grid `rgba(214,228,255,.16)` 1px lines every 24px both axes; linework `rgba(214,228,255,.55)` 1px; ink `#E8F0FF`; dim `#9DB4E0`; ok `#7CE3A9`; warn `#FFD37A`; alarm `#FF9C8F`; card fill `rgba(9,34,74,.55)`, square corners; stamps top-right rotated −7° with 2px border; display **Oswald** 500–700 uppercase letter-spaced .1–.25em; body **IBM Plex Mono** 400–600; RFI callout with left 2px alarm border and `RFI → HUMAN:` prefix via CSS; title block bottom-right (hidden in Wall); busy member shows `▸ RUNNING` in ok-green.
- **Breakpoints:** 5 columns → 2 at `≤1100px` → 1 at `≤640px`. Project rail collapses to a header dropdown at `≤1100px`.
- **Accessibility floor:** WCAG AA contrast in both themes (Wall note text always `#2E2A26`); status/priority conveyed by text, never colour alone; columns are `section` + `h2`, cards are `article`, feed uses `time`; page readable with CSS disabled in document order header → team → columns → feed; `prefers-reduced-motion: reduce` disables all transitions/animations; theme transition ≤ 300ms.
- **Out of scope (v1):** drag-and-drop, editing cards from the UI, websockets, auth, extra theme variants, burndown charts.
- **Existing suites must stay green:** `node --test` on `parse.test.js`, `discover.test.js`, `dashboard.test.js`, plus `test-board-check.sh` and `test-inbox-validate.sh`. `claude plugin validate ./sdlc-team --strict` must exit 0.
- Commit identity (already configured): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`.

### Decisions taken (recorded so implementers don't re-litigate)

1. **One endpoint drives everything.** `GET /board.json` returns the §2 payload for the most-recently-active project **plus** a top-level `projects` array for the §8 rail. `GET /board.json?project=<id>` selects a specific project. This satisfies "the frontend must only depend on fetching `./board.json`" while still feeding the rail from a single poll. The existing `GET /api/projects` route stays (its tests stay green) but the new UI does not use it.
2. **Agent colours are a palette pool, not a name map.** The spec's six colours are kept exactly, but assigned deterministically by a hash of the agent `id` so any dynamically composed role (`ml-engineer`, `ios-developer`, …) gets a stable colour. The old persona names in the spec's table are dead — the roster is dynamic.
3. **Web assets live in `sdlc-team/scripts/web/`.** The server file is already named `scripts/dashboard.js`, so client JS cannot also be `dashboard.js`. Serving from `web/` avoids the clash and groups the assets.
4. **Fields the markdown does not carry are derived, and marked as such in code comments:** `activeWorktrees` = number of cards in `progress`; `sprintRunning` = at least one card in `progress` and no `.sdlc/.awaiting-human`; `awaitingHuman` = `.sdlc/.awaiting-human` exists; `maxRounds` = `max-rounds-per-sprint` from config, default `20`; `nextGate` = composed from methodology + phase.
5. **`revision` is a content hash** (`sha1` of the payload with `revision` omitted), not a timestamp — guarantees "payload changed ⇒ revision changed" and vice versa, which is what the 5s poll needs.

### Real `.sdlc/` formats these parsers must handle (verified against a live board)

```
### T-002 | Docker Compose + Postgres + Prisma schema
- assignee: Marcus (backend-developer)
- priority: high
- depends-on: [T-001]
- branch: sdlc/T-002-docker          # absent until work starts
- what: |
    ...multi-line block...
- definition-of-done:
  - [ ] `docker-compose up` brings up api + postgres cleanly (N3)
  - [x] Prisma schema models the full domain
- status-log:
  - 2026-07-25T17:10 created by Manager
```

- `assignee` is `Display Name (agent-id)` **or** a bare name (`Manager`). `reviewer:` and `question:` / `question(HUMAN):` appear only on cards that need them — all four are optional.
- `team.md` Name cells are also `Display Name (agent-id)` or bare (`Manager`).
- `project-config.md` uses `- key: value` lines with `#` comments; `max-rounds-per-sprint` may be absent.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `sdlc-team/scripts/lib/parse.js` | Modify | Markdown → raw model. Gains per-card DoD counts, `question`/`questionFor`, `branch`, `reviewer`, `dependsOn`, structured `assignee`, plus `parseConfig()` for `project-config.md`. Still read-only, still zero-dep. |
| `sdlc-team/scripts/lib/board-json.js` | Create | Raw model → §2 `board.json` contract: slug ids, `progress` status keys, palette assignment, derived `busy`/`currentTask`/`sprintRunning`/`activeWorktrees`, activity feed, `nextGate`, content-hash `revision`. |
| `sdlc-team/scripts/dashboard.js` | Modify | Adds `GET /board.json[?project=]` and static serving of `web/`. Keeps `/api/projects`. |
| `sdlc-team/scripts/web/index.html` | Create | The §3 DOM skeleton + font links + shell. Readable with CSS disabled. |
| `sdlc-team/scripts/web/app.js` | Create | Fetch/poll/render, theme toggle + persistence, card overlay, rail, error + empty states. |
| `sdlc-team/scripts/web/theme.css` | Create | Layout + both themes keyed on `body[data-theme]`, responsive, reduced-motion. |
| `sdlc-team/scripts/tests/parse.test.js` | Modify | Tests for the new parse fields + `parseConfig`. |
| `sdlc-team/scripts/tests/board-json.test.js` | Create | Tests for the contract mapping. |
| `sdlc-team/scripts/tests/dashboard.test.js` | Modify | Tests for the new routes + asset serving. |
| `sdlc-team/scripts/dashboard.html` | Delete | Replaced by `web/index.html` (Task 7). |
| `sdlc-team/README.md`, `README.md` | Modify | Document the two themes and the new layout (Task 7). |

---

### Task 1: Extend `parse.js` — card contract fields + config parsing

**Files:**
- Modify: `sdlc-team/scripts/lib/parse.js`
- Test: `sdlc-team/scripts/tests/parse.test.js`

**Interfaces:**
- Consumes: the existing `parse.js` exports (`parseKanban`, `parseTeam`, `parseMessage`, `listMessages`, `computeLastActivity`, `parseProject`) — all keep their current behavior and field names so `discover.test.js` / `dashboard.test.js` stay green.
- Produces, for Task 2:
  - `slugify(text) -> string` — lowercase, non-alphanumeric runs → single `-`, trimmed of leading/trailing `-`.
  - `parseAgentRef(text) -> { name, id }` — `"Marcus (backend-developer)"` → `{ name: 'Marcus', id: 'backend-developer' }`; `"Manager"` → `{ name: 'Manager', id: 'manager' }`; empty → `{ name: '', id: '' }`.
  - `parseConfig(text) -> object` — `- key: value` lines with `#` comments stripped, keys as written (`'max-rounds-per-sprint'`, `'parallelism'`, `'project'`); values are strings.
  - `parseKanban(text)` cards now additionally carry: `assigneeName` (string), `assigneeId` (string), `branch` (string, `''` when absent), `reviewer` (`{name,id}` or `null`), `dependsOn` (string array), `question` (string, `''` when absent), `questionFor` (`'human'` | `'manager'` | `''`), `dod` (`{done:number,total:number}`).
  - `parseProject(projectDir)` gains a `config` property holding `parseConfig()` output of `project-config.md`, and an `awaitingHuman` boolean (`.sdlc/.awaiting-human` exists).

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/parse.test.js`:

```js
const { slugify, parseAgentRef, parseConfig } = require('../lib/parse');

const RICH_KANBAN = `# Kanban — rich
> methodology: hybrid | phase: Foundation
> last-updated: 2026-07-25T17:10:00Z | round: 2

## Blocked

### T-006 | Authz middleware
- assignee: Marcus (backend-developer)
- priority: high
- depends-on: [T-002, T-003]
- question(HUMAN): Redis-backed rate limiting or in-memory for v1?
- definition-of-done:
  - [ ] middleware implemented
  - [ ] tests pass

## Backlog

### T-009 | Plain card
- assignee: Manager
- priority: low

## In Progress

## Review

### T-002 | Docker + Prisma
- assignee: Marcus (backend-developer)
- reviewer: Sofia (security-reviewer)
- priority: med
- branch: sdlc/T-002-docker
- definition-of-done:
  - [x] compose up works
  - [x] schema models domain
  - [ ] tests written

## Done
`;

const CONFIG = `# Project Config
- project: Splitmate
- methodology: hybrid            # chosen by model
- parallelism: 3                # max workers per round
- methodology-reasoning: |
    multi-line text that is not a simple key
`;

test('slugify normalizes text to an id', () => {
  assert.strictEqual(slugify('Backend Developer'), 'backend-developer');
  assert.strictEqual(slugify('  Dev/QA (QA Engineer) '), 'dev-qa-qa-engineer');
  assert.strictEqual(slugify('Manager'), 'manager');
});

test('parseAgentRef splits "Name (id)" and bare names', () => {
  assert.deepStrictEqual(parseAgentRef('Marcus (backend-developer)'),
    { name: 'Marcus', id: 'backend-developer' });
  assert.deepStrictEqual(parseAgentRef('Manager'), { name: 'Manager', id: 'manager' });
  assert.deepStrictEqual(parseAgentRef(''), { name: '', id: '' });
});

test('parseConfig reads simple key/value lines and strips comments', () => {
  const cfg = parseConfig(CONFIG);
  assert.strictEqual(cfg.project, 'Splitmate');
  assert.strictEqual(cfg.methodology, 'hybrid');
  assert.strictEqual(cfg.parallelism, '3');
  assert.strictEqual(cfg['max-rounds-per-sprint'], undefined);
});

test('parseKanban extracts DoD counts, deps, branch, reviewer and questions', () => {
  const { board } = parseKanban(RICH_KANBAN);

  const blocked = board.Blocked[0];
  assert.strictEqual(blocked.id, 'T-006');
  assert.strictEqual(blocked.assigneeName, 'Marcus');
  assert.strictEqual(blocked.assigneeId, 'backend-developer');
  assert.deepStrictEqual(blocked.dependsOn, ['T-002', 'T-003']);
  assert.strictEqual(blocked.question, 'Redis-backed rate limiting or in-memory for v1?');
  assert.strictEqual(blocked.questionFor, 'human');
  assert.deepStrictEqual(blocked.dod, { done: 0, total: 2 });
  assert.strictEqual(blocked.reviewer, null);
  assert.strictEqual(blocked.branch, '');

  const plain = board.Backlog[0];
  assert.strictEqual(plain.assigneeId, 'manager');
  assert.deepStrictEqual(plain.dod, { done: 0, total: 0 });
  assert.deepStrictEqual(plain.dependsOn, []);
  assert.strictEqual(plain.questionFor, '');

  const review = board.Review[0];
  assert.deepStrictEqual(review.dod, { done: 2, total: 3 });
  assert.strictEqual(review.branch, 'sdlc/T-002-docker');
  assert.deepStrictEqual(review.reviewer, { name: 'Sofia', id: 'security-reviewer' });
});

test('parseProject exposes config and awaitingHuman', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj2-'));
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), RICH_KANBAN);
  fs.writeFileSync(path.join(sdlc, 'project-config.md'), CONFIG);

  let model = parseProject(dir);
  assert.strictEqual(model.config.parallelism, '3');
  assert.strictEqual(model.awaitingHuman, false);

  fs.writeFileSync(path.join(sdlc, '.awaiting-human'), '');
  model = parseProject(dir);
  assert.strictEqual(model.awaitingHuman, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: FAIL — `slugify is not a function` (and the new assertions fail).

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/lib/parse.js`, add these helpers above `parseKanban`:

```js
function slugify(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "Marcus (backend-developer)" -> {name:'Marcus', id:'backend-developer'}
// "Manager"                    -> {name:'Manager', id:'manager'}
function parseAgentRef(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { name: '', id: '' };
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { name: m[1].trim(), id: slugify(m[2]) };
  return { name: raw, id: slugify(raw) };
}

// project-config.md: "- key: value" lines, trailing "# comment" stripped.
// Multi-line block values (key: |) are skipped — nothing in the contract needs them.
function parseConfig(text) {
  const cfg = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^-\s*([a-z0-9-]+):\s*(.*)$/i);
    if (!m) continue;
    const value = m[2].replace(/\s+#.*$/, '').trim();
    if (value === '|' || value === '') continue;
    cfg[m[1]] = value;
  }
  return cfg;
}
```

Then extend the card parsing inside `parseKanban`. Replace the card-creation line and the two field-matching lines with this block (keeping the existing `header` and column handling untouched):

```js
    if ((m = line.match(/^###\s+(T-\d+)\s*\|\s*(.+?)\s*$/))) {
      card = col ? {
        id: m[1], title: m[2], assignee: '', priority: '', column: col,
        assigneeName: '', assigneeId: '', branch: '', reviewer: null,
        dependsOn: [], question: '', questionFor: '',
        dod: { done: 0, total: 0 },
      } : null;
      if (card) board[col].push(card);
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*assignee:\s*(.+?)\s*$/))) {
      card.assignee = m[1];
      const ref = parseAgentRef(m[1]);
      card.assigneeName = ref.name;
      card.assigneeId = ref.id;
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*priority:\s*(.+?)\s*$/))) {
      card.priority = m[1]; inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*branch:\s*(.+?)\s*$/))) {
      card.branch = m[1]; inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*reviewer:\s*(.+?)\s*$/))) {
      card.reviewer = parseAgentRef(m[1]); inDod = false; continue;
    }
    if (card && (m = line.match(/^\s*-\s*depends-on:\s*\[(.*?)\]\s*$/))) {
      card.dependsOn = m[1].split(',').map(s => s.trim()).filter(Boolean);
      inDod = false;
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*question(\(HUMAN\))?:\s*(.+?)\s*$/i))) {
      card.question = m[2];
      card.questionFor = m[1] ? 'human' : 'manager';
      inDod = false;
      continue;
    }
    if (card && /^\s*-\s*definition-of-done:\s*$/.test(line)) { inDod = true; continue; }
    if (card && inDod && (m = line.match(/^\s*-\s*\[([ xX])\]/))) {
      card.dod.total++;
      if (m[1] !== ' ') card.dod.done++;
      continue;
    }
    if (card && /^\s*-\s*[a-z-]+:/i.test(line)) { inDod = false; continue; }
```

Declare `let inDod = false;` next to the existing `let card = null;`, and reset it (`inDod = false;`) wherever `card = null` is set on a `##` column heading.

In `parseProject`, add the two new properties:

```js
function parseProject(projectDir) {
  const sdlc = path.join(projectDir, '.sdlc');
  const { header, board } = parseKanban(readOr(path.join(sdlc, 'kanban.md')));
  return {
    name: path.basename(projectDir),
    path: projectDir,
    lastActivity: computeLastActivity(sdlc),
    methodology: header.methodology,
    phase: header.phase,
    round: header.round,
    agents: parseTeam(readOr(path.join(sdlc, 'team.md'))),
    board,
    inbox: listMessages(path.join(sdlc, 'inbox')),
    archive: listMessages(path.join(sdlc, 'archive')),
    config: parseConfig(readOr(path.join(sdlc, 'project-config.md'))),
    awaitingHuman: fs.existsSync(path.join(sdlc, '.awaiting-human')),
  };
}
```

Add the new names to `module.exports`: `slugify`, `parseAgentRef`, `parseConfig`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: PASS — `fail 0` (the 4 original tests plus the 5 new ones).

- [ ] **Step 5: Confirm nothing else regressed**

Run: `node --test sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js`
Expected: `fail 0` — the existing model fields were only added to, never renamed.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/scripts/lib/parse.js sdlc-team/scripts/tests/parse.test.js
git commit -m "feat(dashboard): parse DoD counts, deps, reviewer, questions and project config"
```

---

### Task 2: `lib/board-json.js` — the §2 contract mapper

**Files:**
- Create: `sdlc-team/scripts/lib/board-json.js`
- Test: `sdlc-team/scripts/tests/board-json.test.js`

**Interfaces:**
- Consumes from Task 1: `parseProject(dir)` (now with `config` + `awaitingHuman`), `slugify`, `parseAgentRef`, and the enriched card fields (`assigneeId`, `assigneeName`, `branch`, `reviewer`, `dependsOn`, `question`, `questionFor`, `dod`).
- Produces, for Task 3:
  - `STATUS_BY_COLUMN` — `{ 'Blocked':'blocked', 'Backlog':'backlog', 'In Progress':'progress', 'Review':'review', 'Done':'done' }`.
  - `NOTE_PALETTE` — the six Wall colours in spec order.
  - `colorFor(agentId) -> string` — deterministic palette pick.
  - `buildBoardJson(projectDir) -> object` — the §2 payload for one project (no `projects` key).
  - `buildPayload(projectDirs, selectedId?) -> object` — `buildBoardJson` of the selected (or first) project plus a `projects: [{id,name,methodology,phase,round,active}]` rail array. Returns `{ projects: [], project: null, ... }` shape with `error` set when there are no projects.

- [ ] **Step 1: Write the failing tests**

Create `sdlc-team/scripts/tests/board-json.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildBoardJson, buildPayload, colorFor, NOTE_PALETTE } = require('../lib/board-json');

const KANBAN = `# Kanban — demo
> methodology: hybrid | phase: Foundation
> last-updated: 2026-07-25T17:10:00Z | round: 2

## Blocked

### T-006 | Authz middleware
- assignee: Marcus (backend-developer)
- priority: high
- question(HUMAN): Redis or in-memory?
- definition-of-done:
  - [ ] implemented

## Backlog

### T-009 | Later thing
- assignee: Elena (mobile-developer)
- priority: low

## In Progress

### T-005 | Groups API
- assignee: Marcus (backend-developer)
- priority: med
- branch: sdlc/T-005-groups
- definition-of-done:
  - [x] routes
  - [ ] tests

## Review

## Done
`;

const TEAM = `# Team
| Name | Role | Writes code? |
|------|------|--------------|
| Manager | Manager / Orchestrator | No |
| Marcus (backend-developer) | Backend Developer | Yes |
| Elena (mobile-developer) | Mobile Developer | Yes |
`;

const CONFIG = `# Project Config
- project: Demo
- methodology: hybrid
- parallelism: 3
`;

const MSG = `---
from: Marcus
task: T-005
type: status-update
timestamp: 2026-07-25T12:41:00Z
---
## Summary
status update on T-005 · 6 files changed
`;

function makeProject(base, name, opts = {}) {
  const dir = path.join(base, name);
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), opts.kanban || KANBAN);
  fs.writeFileSync(path.join(sdlc, 'team.md'), TEAM);
  fs.writeFileSync(path.join(sdlc, 'project-config.md'), CONFIG);
  fs.writeFileSync(path.join(sdlc, 'archive', '2026-07-25T12:41:00Z_Marcus_T-005.md'), MSG);
  if (opts.awaiting) fs.writeFileSync(path.join(sdlc, '.awaiting-human'), '');
  return dir;
}

test('colorFor is deterministic and always in the palette', () => {
  const a = colorFor('ml-engineer');
  assert.ok(NOTE_PALETTE.includes(a));
  assert.strictEqual(a, colorFor('ml-engineer'));
  assert.ok(NOTE_PALETTE.includes(colorFor('')));
});

test('buildBoardJson maps the project block', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const b = buildBoardJson(makeProject(base, 'demo'));
  assert.strictEqual(b.project.name, 'demo');
  assert.strictEqual(b.project.methodology, 'hybrid');
  assert.strictEqual(b.project.phase, 'Foundation');
  assert.strictEqual(b.project.round, 2);
  assert.strictEqual(b.project.maxRounds, 20);          // default when config omits it
  assert.strictEqual(b.project.parallelism, 3);
  assert.strictEqual(b.project.activeWorktrees, 1);     // one card in progress
  assert.strictEqual(b.project.sprintRunning, true);
  assert.strictEqual(b.project.awaitingHuman, false);
  assert.ok(b.project.nextGate.length > 0);
  assert.deepStrictEqual(b.columns, ['blocked', 'backlog', 'progress', 'review', 'done']);
  assert.ok(typeof b.revision === 'string' && b.revision.length > 0);
});

test('buildBoardJson maps cards onto contract statuses and fields', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const b = buildBoardJson(makeProject(base, 'demo'));

  const byId = Object.fromEntries(b.cards.map(c => [c.id, c]));
  assert.strictEqual(byId['T-006'].status, 'blocked');
  assert.strictEqual(byId['T-006'].assignee, 'backend-developer');
  assert.strictEqual(byId['T-006'].questionFor, 'human');
  assert.strictEqual(byId['T-006'].question, 'Redis or in-memory?');
  assert.deepStrictEqual(byId['T-006'].dod, { done: 0, total: 1 });
  assert.strictEqual(byId['T-006'].branch, null);
  assert.strictEqual(byId['T-006'].reviewer, null);

  assert.strictEqual(byId['T-009'].status, 'backlog');
  assert.strictEqual(byId['T-005'].status, 'progress');
  assert.strictEqual(byId['T-005'].branch, 'sdlc/T-005-groups');
  assert.deepStrictEqual(byId['T-005'].dod, { done: 1, total: 2 });
  for (const c of b.cards) assert.ok(['high', 'med', 'low'].includes(c.priority));
});

test('buildBoardJson derives team busy state and colours', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const b = buildBoardJson(makeProject(base, 'demo'));

  const byId = Object.fromEntries(b.team.map(t => [t.id, t]));
  assert.strictEqual(byId['backend-developer'].busy, true);
  assert.strictEqual(byId['backend-developer'].currentTask, 'T-005');
  assert.strictEqual(byId['backend-developer'].name, 'Marcus');
  assert.strictEqual(byId['manager'].busy, false);
  assert.strictEqual(byId['manager'].currentTask, null);
  assert.ok(NOTE_PALETTE.includes(byId['manager'].color));
});

test('buildBoardJson maps the 8 newest archive entries newest-first', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const dir = makeProject(base, 'demo');
  const archive = path.join(dir, '.sdlc', 'archive');
  for (let i = 0; i < 10; i++) {
    const ts = `2026-07-25T1${i}:00:00Z`;
    fs.writeFileSync(path.join(archive, `${ts}_Marcus_T-00${i}.md`),
      MSG.replace('2026-07-25T12:41:00Z', ts).replace('· 6 files changed', `· entry ${i}`));
  }
  const b = buildBoardJson(dir);
  assert.strictEqual(b.activity.length, 8);
  assert.ok(b.activity[0].text.includes('entry 9'));      // newest first
  assert.match(b.activity[0].time, /^\d{2}:\d{2}$/);
  assert.strictEqual(b.activity[0].agent, 'marcus');
});

test('revision changes only when the payload changes', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const dir = makeProject(base, 'demo');
  const first = buildBoardJson(dir).revision;
  assert.strictEqual(buildBoardJson(dir).revision, first);

  const board = path.join(dir, '.sdlc', 'kanban.md');
  fs.writeFileSync(board, fs.readFileSync(board, 'utf8').replace('Authz middleware', 'Authz mw v2'));
  assert.notStrictEqual(buildBoardJson(dir).revision, first);
});

test('awaitingHuman flips sprintRunning off', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const b = buildBoardJson(makeProject(base, 'paused', { awaiting: true }));
  assert.strictEqual(b.project.awaitingHuman, true);
  assert.strictEqual(b.project.sprintRunning, false);
});

test('buildPayload adds the rail and honours the selected project', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const a = makeProject(base, 'alpha');
  const z = makeProject(base, 'zulu');

  const p = buildPayload([a, z], 'zulu');
  assert.strictEqual(p.project.name, 'zulu');
  assert.strictEqual(p.projects.length, 2);
  assert.strictEqual(p.projects.find(x => x.id === 'zulu').active, true);
  assert.strictEqual(p.projects.find(x => x.id === 'alpha').active, false);
  assert.ok(p.projects[0].methodology);

  const first = buildPayload([a, z]);
  assert.strictEqual(first.project.name, 'alpha');          // defaults to the first given
});

test('buildPayload reports an error state with no projects', () => {
  const p = buildPayload([]);
  assert.strictEqual(p.project, null);
  assert.deepStrictEqual(p.projects, []);
  assert.ok(typeof p.error === 'string' && p.error.length > 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: FAIL — `Cannot find module '../lib/board-json'`.

- [ ] **Step 3: Write the implementation**

Create `sdlc-team/scripts/lib/board-json.js`:

```js
'use strict';
const crypto = require('crypto');
const path = require('path');
const { parseProject, slugify, parseAgentRef } = require('./parse');

const STATUS_BY_COLUMN = {
  'Blocked': 'blocked',
  'Backlog': 'backlog',
  'In Progress': 'progress',
  'Review': 'review',
  'Done': 'done',
};
const COLUMNS = ['blocked', 'backlog', 'progress', 'review', 'done'];

// The spec's six sticky-note colours. Assigned by hash of the agent id rather than
// by name, so any dynamically composed role gets a stable colour.
const NOTE_PALETTE = ['#FFE87A', '#FFB3C7', '#A8E6CF', '#C9B8F5', '#AEDDF7', '#FFD2A6'];

function colorFor(agentId) {
  const s = String(agentId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return NOTE_PALETTE[h % NOTE_PALETTE.length];
}

function normalizePriority(p) {
  const v = String(p || '').toLowerCase();
  if (v.startsWith('high')) return 'high';
  if (v.startsWith('low')) return 'low';
  return 'med';
}

// HH:MM out of an ISO timestamp, without constructing a Date (keeps it pure).
function hhmm(timestamp) {
  const m = String(timestamp || '').match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '--:--';
}

function nextGateFor(methodology, phase) {
  const m = String(methodology || '').toLowerCase();
  if (m.startsWith('waterfall')) return `phase gate: ${phase || 'current phase'}`;
  if (m.startsWith('kanban')) return 'gate every N completed cards';
  return `sprint review after ${phase || 'this sprint'}`;
}

function buildBoardJson(projectDir) {
  const p = parseProject(projectDir);

  const cards = [];
  for (const [column, status] of Object.entries(STATUS_BY_COLUMN)) {
    for (const c of p.board[column] || []) {
      cards.push({
        id: c.id,
        title: c.title,
        status,
        assignee: c.assigneeId || '',
        assigneeName: c.assigneeName || '',
        priority: normalizePriority(c.priority),
        question: c.question || '',
        questionFor: c.questionFor || '',
        dod: { done: c.dod.done, total: c.dod.total },
        branch: c.branch || null,
        reviewer: c.reviewer ? c.reviewer.id : null,
        reviewerName: c.reviewer ? c.reviewer.name : null,
        dependsOn: c.dependsOn || [],
      });
    }
  }

  const inProgress = cards.filter(c => c.status === 'progress');
  const busyBy = new Map(inProgress.map(c => [c.assignee, c.id]));

  const team = p.agents.map(a => {
    const ref = parseAgentRef(a.name);
    const id = ref.id || slugify(a.name);
    return {
      id,
      name: ref.name || a.name,
      role: a.role,
      color: colorFor(id),
      busy: busyBy.has(id),
      currentTask: busyBy.get(id) || null,
    };
  });

  // Derived — the markdown carries no explicit field for these.
  const awaitingHuman = p.awaitingHuman;
  const activeWorktrees = inProgress.length;
  const sprintRunning = activeWorktrees > 0 && !awaitingHuman;

  const activity = p.archive
    .slice()
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 8)
    .map(m => ({
      time: hhmm(m.timestamp),
      agent: slugify(m.from),
      text: m.summary || `${m.type || 'message'} on ${m.task || 'the board'}`,
    }));

  const payload = {
    revision: '',
    project: {
      id: path.basename(projectDir),
      name: p.name,
      path: p.path,
      methodology: p.methodology,
      phase: p.phase,
      round: p.round,
      maxRounds: Number(p.config['max-rounds-per-sprint'] || 20),
      parallelism: Number(p.config.parallelism || 3),
      activeWorktrees,
      sprintRunning,
      nextGate: nextGateFor(p.methodology, p.phase),
      awaitingHuman,
    },
    team,
    columns: COLUMNS.slice(),
    cards,
    activity,
  };

  // Content hash, not a timestamp: payload changed <=> revision changed.
  payload.revision = crypto.createHash('sha1')
    .update(JSON.stringify({ ...payload, revision: undefined }))
    .digest('hex');
  return payload;
}

function buildPayload(projectDirs, selectedId) {
  const dirs = (projectDirs || []).slice();
  if (!dirs.length) {
    return {
      revision: 'empty',
      project: null,
      projects: [],
      team: [],
      columns: COLUMNS.slice(),
      cards: [],
      activity: [],
      error: 'No SDLC projects found. Run /sdlc-init in a project, or start the dashboard with --root <dir>.',
    };
  }

  const chosen = dirs.find(d => path.basename(d) === selectedId) || dirs[0];
  const board = buildBoardJson(chosen);
  board.projects = dirs.map(d => {
    const b = d === chosen ? board : buildBoardJson(d);
    return {
      id: path.basename(d),
      name: b.project.name,
      methodology: b.project.methodology,
      phase: b.project.phase,
      round: b.project.round,
      active: d === chosen,
    };
  });
  return board;
}

module.exports = { STATUS_BY_COLUMN, COLUMNS, NOTE_PALETTE, colorFor, buildBoardJson, buildPayload };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/board-json.test.js`
Expected: PASS — `fail 0` across all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/lib/board-json.js sdlc-team/scripts/tests/board-json.test.js
git commit -m "feat(dashboard): add board.json contract mapper with tests"
```

---

### Task 3: Serve `/board.json` and the web assets

**Files:**
- Modify: `sdlc-team/scripts/dashboard.js`
- Test: `sdlc-team/scripts/tests/dashboard.test.js`

**Interfaces:**
- Consumes from Task 2: `buildPayload(projectDirs, selectedId)`.
- Consumes existing: `discoverProjects({root})` from `lib/discover.js`, and the existing `parseArgs` / `buildModel` / `createServer` exports (kept for backwards compatibility so the current tests keep passing).
- Produces, for Task 4/5/6: `GET /board.json` → §2 payload + `projects` rail (most-recently-active project); `GET /board.json?project=<id>` → that project; `GET /` → `web/index.html`; `GET /app.js`, `GET /theme.css` → the matching files from `web/`; anything else → 404. Assets are served with correct `Content-Type` and are path-traversal safe.

- [ ] **Step 1: Write the failing tests**

Append to `sdlc-team/scripts/tests/dashboard.test.js`:

```js
test('GET /board.json returns the contract payload with a rail', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash2-'));
  makeProject(base, 'alpha');
  makeProject(base, 'zulu');
  const server = createServer({ root: base });
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/board.json`);
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/json/);
    const b = await r.json();
    assert.ok(b.project, 'has a selected project');
    assert.deepStrictEqual(b.columns, ['blocked', 'backlog', 'progress', 'review', 'done']);
    assert.strictEqual(b.projects.length, 2);
    assert.ok(typeof b.revision === 'string' && b.revision.length > 0);

    const r2 = await fetch(`http://127.0.0.1:${port}/board.json?project=zulu`);
    const b2 = await r2.json();
    assert.strictEqual(b2.project.id, 'zulu');
    assert.strictEqual(b2.projects.find(p => p.id === 'zulu').active, true);
  } finally {
    await new Promise(res => server.close(res));
  }
});

test('GET / serves the web page and assets are reachable', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash2-'));
  makeProject(base, 'alpha');
  const server = createServer({ root: base });
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /data-theme=/);
    assert.match(html, /themeToggle/);
    assert.match(html, /board\.json|app\.js/);

    const css = await fetch(`http://127.0.0.1:${port}/theme.css`);
    assert.strictEqual(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    assert.strictEqual(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  } finally {
    await new Promise(res => server.close(res));
  }
});

test('unknown paths 404 and traversal is refused', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash2-'));
  makeProject(base, 'alpha');
  const server = createServer({ root: base });
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  try {
    assert.strictEqual((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
    const trav = await fetch(`http://127.0.0.1:${port}/../../etc/passwd`);
    assert.ok(trav.status === 404 || trav.status === 400, 'traversal refused');
  } finally {
    await new Promise(res => server.close(res));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: FAIL — `/board.json` and `/theme.css` currently 404, and `GET /` serves the old page without `data-theme`.

- [ ] **Step 3: Write the implementation**

In `sdlc-team/scripts/dashboard.js`, add the new require and the asset table near the top:

```js
const { buildPayload } = require('./lib/board-json');

const WEB_DIR = path.join(__dirname, 'web');
const ASSETS = {
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.css': ['theme.css', 'text/css; charset=utf-8'],
};
```

Then replace the whole `createServer` function body with:

```js
function createServer({ root = null } = {}) {
  return http.createServer((req, res) => {
    const raw = req.url || '/';
    const [pathname, query = ''] = raw.split('?');

    // Static page
    if (pathname === '/' || pathname === '/index.html') {
      let html;
      try { html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8'); }
      catch { html = '<!doctype html><h1>dashboard assets missing</h1>'; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Static assets (fixed allow-list — no user-controlled path ever reaches the FS)
    if (ASSETS[pathname]) {
      const [file, type] = ASSETS[pathname];
      try {
        const body = fs.readFileSync(path.join(WEB_DIR, file), 'utf8');
        res.writeHead(200, { 'Content-Type': type });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('asset not found');
      }
      return;
    }

    // The board contract
    if (pathname === '/board.json') {
      try {
        const selected = new URLSearchParams(query).get('project') || undefined;
        const dirs = discoverProjects({ root })
          .map(d => ({ d, t: parseProject(d).lastActivity }))
          .sort((a, b) => b.t - a.t)
          .map(x => x.d);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(buildPayload(dirs, selected)));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'failed to build the board: ' + e.message }));
      }
      return;
    }

    // Legacy aggregate route (kept for backwards compatibility)
    if (pathname.startsWith('/api/projects')) {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildModel({ root })));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('error building model');
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
}
```

Path traversal note: only `/`, the two entries in `ASSETS`, `/board.json` and `/api/projects` ever touch the filesystem, and each maps to a hard-coded filename — a request like `/../../etc/passwd` matches nothing and falls through to the 404 branch.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: the two new asset/page tests still FAIL (`web/` does not exist yet — `GET /` returns the "assets missing" fallback and `/theme.css` 404s), while the `/board.json`, 404 and traversal tests PASS. This is expected at this point; Task 4 creates the assets and turns them green. The pre-existing `parseArgs` / `buildModel` / `/api/projects` tests must all still pass.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/dashboard.js sdlc-team/scripts/tests/dashboard.test.js
git commit -m "feat(dashboard): serve /board.json contract and web assets"
```

---

### Task 4: The §3 DOM skeleton + client renderer

**Files:**
- Create: `sdlc-team/scripts/web/index.html`
- Create: `sdlc-team/scripts/web/app.js`
- Create: `sdlc-team/scripts/web/theme.css` (placeholder in this task — a single comment line; Tasks 5 and 6 fill it)

**Interfaces:**
- Consumes from Task 3: `GET ./board.json[?project=<id>]` and the asset routes `/app.js`, `/theme.css`.
- Produces, for Tasks 5 and 6, exactly the §3 skeleton and these hooks (the two stylesheets depend on them verbatim):
  - `body[data-theme="wall"|"blueprint"]`, and `body[data-state="error"]` when the fetch fails.
  - `header.hdr` > `h1.proj`, `span.meta`, `span.gate` (plus `.gate[data-attention="true"]` when a human question is open), `button.toggle#themeToggle[aria-pressed]`.
  - `aside.rail` > `h4` + `button.ptab[data-project][data-active]` per project; `select#railSelect` mirror for narrow screens.
  - `section.team` > `span.member[data-agent][data-busy]` > `span.face` + `b` + `small`.
  - `main.board` > `section.col[data-col]` ×5 > `h2` (label + `span.count`) + `article.card[...]`, and `p.empty` when the column has no cards.
  - `article.card[data-status][data-agent][data-priority][data-stamp][data-stamp-wall][data-stamp-bp]` > `span.tid`, `h3.ttl`, `div.who`, optional `div.dod` > `div.bar` > `i`, optional `p.q`.
  - `footer.feed` > `h4` + `div.row` > `time` + `span`.
  - `div.titleblock` > `div.tb-row` > `b` + `span`.
  - `div.overlay#overlay[hidden]` > `div.sheet` > `button.x` + `#overlayBody`.

- [ ] **Step 1: Write the HTML skeleton**

Create `sdlc-team/scripts/web/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>boardroom — sprint board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Nunito:wght@400;600;800&family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./theme.css">
</head>
<body data-theme="wall">
  <header class="hdr">
    <h1 class="proj">boardroom</h1>
    <span class="meta">loading…</span>
    <span class="gate"></span>
    <select id="railSelect" aria-label="Select project"></select>
    <button class="toggle" id="themeToggle" type="button" aria-pressed="false">⇄ BLUEPRINT MODE</button>
  </header>

  <aside class="rail">
    <h4>projects</h4>
    <div id="railList"></div>
  </aside>

  <section class="team" id="team" aria-label="Team"></section>

  <main class="board" id="board"></main>

  <footer class="feed">
    <h4>activity</h4>
    <div id="feedRows"></div>
  </footer>

  <div class="titleblock" id="titleblock"></div>

  <div class="overlay" id="overlay" hidden>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Card detail">
      <button class="x" id="overlayClose" type="button" aria-label="Close">×</button>
      <div id="overlayBody"></div>
    </div>
  </div>

  <script src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the client renderer**

Create `sdlc-team/scripts/web/app.js`:

```js
'use strict';

const COLS = [
  ['blocked', 'blocked'],
  ['backlog', 'backlog'],
  ['progress', 'in progress'],
  ['review', 'review'],
  ['done', 'done'],
];

// status -> [data-stamp, data-stamp-wall, data-stamp-bp]
const STAMPS = {
  blocked: ['hold', 'held ✋', 'HOLD'],
  progress: ['wip', 'on it ✍', 'W.I.P.'],
  review: ['inspect', 'checking 👀', 'INSPECT'],
  merged: ['merged', 'merged ✓', 'MERGED'],
  done: ['merged', 'merged ✓', 'MERGED'],
};

const EMPTY_HINT = { wall: 'nothing here', blueprint: 'NO ITEMS — SEC CLEAR' };

let lastRevision = null;
let selectedProject = null;
let currentData = null;

/* ---------- theme ---------- */

function readStoredTheme() {
  try { return localStorage.getItem('boardroom.theme'); } catch { return null; }
}
function storeTheme(t) {
  try { localStorage.setItem('boardroom.theme', t); } catch { /* storage blocked — ignore */ }
}

function applyTheme(theme) {
  const t = theme === 'blueprint' ? 'blueprint' : 'wall';
  document.body.setAttribute('data-theme', t);
  const btn = document.getElementById('themeToggle');
  btn.textContent = t === 'wall' ? '⇄ BLUEPRINT MODE' : '⇄ SPRINT WALL MODE';
  btn.setAttribute('aria-pressed', String(t === 'blueprint'));
  renderTitle();
  renderBoard();          // empty hints differ per theme
}

function currentTheme() {
  return document.body.getAttribute('data-theme') === 'blueprint' ? 'blueprint' : 'wall';
}

function renderTitle() {
  const name = currentData && currentData.project ? currentData.project.name : 'boardroom';
  document.querySelector('h1.proj').textContent = currentTheme() === 'wall'
    ? `${name} — sprint wall`
    : `${name} — Construction Board`;
}

/* ---------- rendering ---------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function renderHeader(d) {
  const p = d.project;
  const bits = [p.methodology, p.phase, `round ${p.round}/${p.maxRounds}`,
                `${p.activeWorktrees} worktrees`];
  if (p.sprintRunning) {
    bits.push(currentTheme() === 'wall'
      ? '⌁ sprint running'
      : `GOOD SERVICE — ROUND ${p.round}/${p.maxRounds}`);
  }
  document.querySelector('span.meta').textContent = bits.filter(Boolean).join(' · ');

  const openQuestions = d.cards.filter(c => c.questionFor === 'human').length;
  const gate = document.querySelector('span.gate');
  if (openQuestions > 0) {
    gate.setAttribute('data-attention', 'true');
    gate.textContent = `needs you: ${openQuestions} question${openQuestions === 1 ? '' : 's'}`;
  } else if (!p.sprintRunning && p.awaitingHuman) {
    gate.setAttribute('data-attention', 'true');
    gate.textContent = `paused — waiting on you · ${p.nextGate}`;
  } else {
    gate.removeAttribute('data-attention');
    gate.textContent = `next gate: ${p.nextGate}`;
  }
}

function renderRail(d) {
  const list = document.getElementById('railList');
  const sel = document.getElementById('railSelect');
  list.textContent = '';
  sel.textContent = '';
  for (const p of d.projects || []) {
    const b = el('button', 'ptab');
    b.type = 'button';
    b.dataset.project = p.id;
    b.dataset.active = String(!!p.active);
    b.appendChild(el('b', null, p.name));
    b.appendChild(el('small', null, `${p.methodology || '—'} · ${p.phase || '—'} · r${p.round}`));
    b.addEventListener('click', () => { selectedProject = p.id; lastRevision = null; poll(); });
    list.appendChild(b);

    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    if (p.active) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => { selectedProject = sel.value; lastRevision = null; poll(); };
}

function renderTeam(d) {
  const host = document.getElementById('team');
  host.textContent = '';
  for (const m of d.team || []) {
    const s = el('span', 'member');
    s.dataset.agent = m.id;
    if (m.busy) s.dataset.busy = 'true';
    if (m.color) s.style.setProperty('--note', m.color);
    s.appendChild(el('span', 'face', (m.name || m.id || '?').trim().charAt(0).toUpperCase()));
    s.appendChild(el('b', null, m.name || m.id));
    s.appendChild(el('small', null, m.busy ? `${m.role} · ${m.currentTask}` : m.role));
    host.appendChild(s);
  }
}

function cardNode(c, byId) {
  const a = el('article', 'card');
  a.dataset.status = c.status;
  a.dataset.agent = c.assignee || '';
  if (c.priority) a.dataset.priority = c.priority;
  const stamp = STAMPS[c.status];
  if (stamp) {
    a.dataset.stamp = stamp[0];
    a.dataset.stampWall = stamp[1];
    a.dataset.stampBp = stamp[2];
  }
  const agent = byId[c.assignee];
  if (agent && agent.color) a.style.setProperty('--note', agent.color);

  a.appendChild(el('span', 'tid', c.id));
  a.appendChild(el('h3', 'ttl', c.title));

  const who = c.reviewerName ? `${c.assigneeName || c.assignee} → ${c.reviewerName}`
                             : (c.assigneeName || c.assignee || 'unassigned');
  a.appendChild(el('div', 'who', who));

  if (c.dod && c.dod.total > 0) {
    const pct = Math.round((c.dod.done / c.dod.total) * 100);
    const d = el('div', 'dod', `DoD ${c.dod.done}/${c.dod.total}${c.branch ? ' · ' + c.branch : ''}`);
    const bar = el('div', 'bar');
    const i = document.createElement('i');
    i.style.width = pct + '%';
    bar.appendChild(i);
    d.appendChild(bar);
    a.appendChild(d);
  }

  if (c.question) a.appendChild(el('p', 'q', c.question));

  a.tabIndex = 0;
  a.addEventListener('click', () => openOverlay(c));
  a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOverlay(c); } });
  return a;
}

function renderBoard() {
  const d = currentData;
  const host = document.getElementById('board');
  host.textContent = '';
  if (!d || !d.project) return;
  const byId = Object.fromEntries((d.team || []).map(m => [m.id, m]));

  for (const [key, label] of COLS) {
    const col = el('section', 'col');
    col.dataset.col = key;
    const cards = (d.cards || []).filter(c => c.status === key);
    const h = el('h2', null, label);
    h.appendChild(el('span', 'count', String(cards.length)));
    col.appendChild(h);
    if (!cards.length) col.appendChild(el('p', 'empty', EMPTY_HINT[currentTheme()]));
    for (const c of cards) col.appendChild(cardNode(c, byId));
    host.appendChild(col);
  }
}

function renderFeed(d) {
  const host = document.getElementById('feedRows');
  host.textContent = '';
  for (const a of (d.activity || []).slice(0, 8)) {
    const row = el('div', 'row');
    const t = document.createElement('time');
    t.textContent = a.time;
    row.appendChild(t);
    row.appendChild(el('span', null, `${a.agent} — ${a.text}`));
    host.appendChild(row);
  }
}

function renderTitleBlock(d) {
  const p = d.project;
  const host = document.getElementById('titleblock');
  host.textContent = '';
  const rows = [
    ['PROJECT', p.name],
    ['ROUND', `${p.round} / ${p.maxRounds}`],
    ['PARALLEL', String(p.parallelism)],
    ['APPROVED BY', d.cards.some(c => c.questionFor === 'human') ? 'PENDING — YOU' : 'AUTO'],
  ];
  for (const [k, v] of rows) {
    const r = el('div', 'tb-row');
    r.appendChild(el('b', null, k));
    r.appendChild(el('span', null, v));
    host.appendChild(r);
  }
}

/* ---------- overlay ---------- */

function openOverlay(c) {
  const body = document.getElementById('overlayBody');
  body.textContent = '';
  body.appendChild(el('h3', null, `${c.id} — ${c.title}`));
  body.appendChild(el('p', null,
    `status: ${c.status} · assignee: ${c.assigneeName || c.assignee || 'unassigned'}` +
    `${c.reviewerName ? ' · reviewer: ' + c.reviewerName : ''} · priority: ${c.priority}`));
  if (c.branch) body.appendChild(el('p', null, `branch: ${c.branch}`));
  if (c.dependsOn && c.dependsOn.length) body.appendChild(el('p', null, `depends on: ${c.dependsOn.join(', ')}`));
  if (c.question) body.appendChild(el('p', null, `question (${c.questionFor}): ${c.question}`));
  if (c.dod && c.dod.total) body.appendChild(el('p', null, `definition of done: ${c.dod.done} of ${c.dod.total} complete`));
  const ov = document.getElementById('overlay');
  ov.hidden = false;
  document.getElementById('overlayClose').focus();
}

function closeOverlay() { document.getElementById('overlay').hidden = true; }

/* ---------- polling ---------- */

function showError(message) {
  document.body.setAttribute('data-state', 'error');
  document.querySelector('span.meta').textContent = message;
  document.getElementById('board').textContent = '';
  const p = el('p', 'empty', "can't find the board — is the sprint folder present?");
  document.getElementById('board').appendChild(p);
}

async function poll() {
  try {
    const url = './board.json' + (selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : '');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.project) throw new Error(d.error || 'no projects found');

    document.body.removeAttribute('data-state');
    if (d.revision === lastRevision) return;     // nothing changed — no repaint
    lastRevision = d.revision;
    currentData = d;
    selectedProject = d.project.id;

    renderTitle();
    renderHeader(d);
    renderRail(d);
    renderTeam(d);
    renderBoard();
    renderFeed(d);
    renderTitleBlock(d);
  } catch (e) {
    lastRevision = null;
    showError("can't find the board — is the sprint folder present? (" + e.message + ")");
  }
}

/* ---------- boot ---------- */

document.getElementById('themeToggle').addEventListener('click', () => {
  const next = currentTheme() === 'wall' ? 'blueprint' : 'wall';
  applyTheme(next);
  storeTheme(next);
});
document.getElementById('overlayClose').addEventListener('click', closeOverlay);
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target.id === 'overlay') closeOverlay();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });

applyTheme(readStoredTheme() || 'wall');
poll();
setInterval(poll, 5000);
```

- [ ] **Step 3: Create the stylesheet placeholder**

Create `sdlc-team/scripts/web/theme.css` with exactly this content (Tasks 5 and 6 replace it):

```css
/* Layout + Sprint Wall theme land in Task 5; Blueprint in Task 6. */
```

- [ ] **Step 4: Run the server tests to verify they now pass**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: PASS — `fail 0`. The page test now finds `data-theme=` and `themeToggle`; `/app.js` and `/theme.css` return 200 with the right content types.

- [ ] **Step 5: Verify the rendered DOM against a real board**

Run:
```bash
node -e '
const {createServer}=require("./sdlc-team/scripts/dashboard.js");
const s=createServer({});
s.listen(0,async()=>{const p=s.address().port;
const b=await (await fetch("http://127.0.0.1:"+p+"/board.json")).json();
console.log("project:", b.project && b.project.name);
console.log("cards:", b.cards.length, "team:", b.team.length, "activity:", b.activity.length);
console.log("statuses:", [...new Set(b.cards.map(c=>c.status))].join(","));
console.log("revision:", b.revision.slice(0,12));
s.close();});'
```
Expected: prints a real project name, non-zero card/team counts, statuses drawn only from `blocked,backlog,progress,review,done`, and a 12-char revision prefix.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/scripts/web/index.html sdlc-team/scripts/web/app.js sdlc-team/scripts/web/theme.css
git commit -m "feat(dashboard): add themed DOM skeleton and client renderer"
```

---

### Task 5: Sprint Wall theme (layout + default theme)

**Files:**
- Modify: `sdlc-team/scripts/web/theme.css`

**Interfaces:**
- Consumes: the §3 DOM hooks produced by Task 4 (`.hdr`, `.rail`, `.ptab`, `.team`, `.member`, `.face`, `.board`, `.col`, `.card`, `.tid`, `.ttl`, `.who`, `.dod`, `.bar > i`, `.q`, `.empty`, `.feed`, `.row`, `.titleblock`, `.overlay`, `.sheet`, `#themeToggle`, `[data-attention]`, `--note` custom property, `data-stamp-wall`).
- Produces, for Task 6: the shared layout (grid areas, breakpoints, overlay, reduced-motion block) that Blueprint reuses, plus every `body[data-theme="wall"]` rule. Task 6 only adds `body[data-theme="blueprint"]` rules — it must not restructure layout.

- [ ] **Step 1: Write the shared layout and the Wall theme**

Replace the whole contents of `sdlc-team/scripts/web/theme.css` with:

```css
/* ============ shared layout (theme-agnostic) ============ */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 210px 1fr;
  grid-template-areas: "rail hdr" "rail team" "rail board" "rail feed";
  grid-template-rows: auto auto 1fr auto;
  transition: background-color .3s ease, color .3s ease;
}

.hdr   { grid-area: hdr; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 20px; }
.rail  { grid-area: rail; padding: 14px 12px; overflow-y: auto; }
.team  { grid-area: team; display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 20px 12px; }
.board { grid-area: board; display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; padding: 6px 20px 18px; align-items: start; }
.feed  { grid-area: feed; margin: 0 20px 18px; padding: 10px 14px; }

.hdr h1.proj { margin: 0; font-size: 26px; line-height: 1.1; }
.hdr .meta, .hdr .gate { font-size: 13px; }
#themeToggle { margin-left: auto; cursor: pointer; font: inherit; font-size: 12px; padding: 7px 12px; }
#railSelect { display: none; font: inherit; font-size: 12px; padding: 5px; }

.rail h4, .feed h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.ptab { display: block; width: 100%; text-align: left; cursor: pointer; font: inherit; margin-bottom: 8px; padding: 8px 10px; }
.ptab b { display: block; font-size: 14px; }
.ptab small { display: block; font-size: 11px; opacity: .75; }

.member { display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; }
.member b { font-size: 13px; }
.member small { font-size: 11px; opacity: .8; }
.face { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: var(--note, #ddd); color: #2E2A26; }

.col h2 { margin: 0 0 12px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.col h2 .count { font-size: 12px; opacity: .8; }

.card { position: relative; padding: 12px 12px 10px; margin-bottom: 14px; cursor: pointer; }
.card .tid { font-size: 11px; font-weight: 700; letter-spacing: .06em; }
.card .ttl { margin: 4px 0 6px; font-size: 16px; line-height: 1.25; }
.card .who { font-size: 12px; opacity: .85; }
.card .dod { margin-top: 8px; font-size: 11px; }
.card .bar { height: 4px; margin-top: 4px; background: rgba(0,0,0,.16); }
.card .bar i { display: block; height: 100%; background: currentColor; }
.card .q { margin: 8px 0 0; font-size: 12px; line-height: 1.35; }
.card:focus-visible, .ptab:focus-visible, #themeToggle:focus-visible, .x:focus-visible { outline: 3px solid #4C9AFF; outline-offset: 2px; }
.empty { font-size: 13px; opacity: .55; margin: 4px 0 0; }

.feed .row { display: flex; gap: 10px; padding: 4px 0; font-size: 12px; }
.feed .row time { opacity: .7; flex: 0 0 42px; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 20px; z-index: 50; }
.overlay[hidden] { display: none; }
.sheet { position: relative; max-width: 560px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 20px 22px; }
.sheet h3 { margin: 0 0 10px; }
.sheet p { margin: 6px 0; font-size: 13px; line-height: 1.45; }
.x { position: absolute; top: 8px; right: 10px; cursor: pointer; font-size: 20px; line-height: 1; background: none; border: 0; color: inherit; }

.titleblock { display: none; }

/* ============ Sprint Wall ============ */
body[data-theme="wall"] {
  --ink: #2E2A26; --dim: #8A8177;
  --ok: #3E8E5A; --alarm: #B33A3A; --warn: #B07A1F;
  background: radial-gradient(circle at 30% 20%, #E9E4DC, #DFD8CC);
  color: var(--ink);
  font-family: "Nunito", sans-serif;
}
body[data-theme="wall"] h1.proj,
body[data-theme="wall"] .col h2,
body[data-theme="wall"] .card .ttl,
body[data-theme="wall"] .rail h4,
body[data-theme="wall"] .feed h4 { font-family: "Caveat", cursive; font-weight: 700; }
body[data-theme="wall"] h1.proj { font-size: 34px; }
body[data-theme="wall"] .meta { color: var(--dim); font-weight: 600; }

body[data-theme="wall"] .gate { color: var(--dim); }
body[data-theme="wall"] .gate[data-attention="true"] {
  color: var(--alarm); font-weight: 800; background: #fff;
  border: 2px solid var(--alarm); border-radius: 3px; padding: 3px 8px;
}
body[data-theme="wall"] #themeToggle {
  background: #fff; color: var(--ink); border: 1px solid rgba(0,0,0,.22);
  border-radius: 3px; font-weight: 700; font-family: "Nunito", sans-serif;
}

/* project rail: white paper tabs */
body[data-theme="wall"] .ptab {
  background: #fff; color: var(--ink); border: 1px solid rgba(0,0,0,.14);
  border-radius: 3px 10px 10px 3px; box-shadow: 1px 2px 5px rgba(0,0,0,.12);
  font-family: "Nunito", sans-serif;
}
body[data-theme="wall"] .ptab[data-active="true"] { border-left: 4px solid var(--warn); font-weight: 800; }

body[data-theme="wall"] .member {
  background: var(--note, #fff); color: var(--ink);
  border-radius: 20px; box-shadow: 1px 2px 4px rgba(0,0,0,.14);
}
body[data-theme="wall"] .member[data-busy="true"] b::after { content: " ⌁"; color: var(--ok); }

/* column headers: painter's tape */
body[data-theme="wall"] .col h2 {
  background: #fff; color: var(--ink); padding: 5px 12px; transform: rotate(-1deg);
  box-shadow: 1px 2px 4px rgba(0,0,0,.14); font-size: 21px;
}
body[data-theme="wall"] .col + .col { border-left: 2px dashed rgba(0,0,0,.14); padding-left: 14px; }

/* cards: sticky notes with a push-pin */
body[data-theme="wall"] .card {
  background: var(--note, #FFE87A); color: var(--ink);
  box-shadow: 2px 5px 9px rgba(0,0,0,.18); border-radius: 2px;
  padding-top: 18px; transition: transform .18s ease, box-shadow .18s ease;
}
body[data-theme="wall"] .card::before {
  content: ""; position: absolute; top: 5px; left: 50%; transform: translateX(-50%);
  width: 11px; height: 11px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #E8635F, #A32620);
  box-shadow: 0 1px 2px rgba(0,0,0,.35);
}
body[data-theme="wall"] .card:nth-of-type(odd)  { transform: rotate(-1.8deg); }
body[data-theme="wall"] .card:nth-of-type(even) { transform: rotate(1.6deg); }
body[data-theme="wall"] .card:hover { transform: rotate(0deg) scale(1.05); box-shadow: 3px 8px 14px rgba(0,0,0,.24); z-index: 2; }
body[data-theme="wall"] .card[data-priority="high"] .tid::after { content: " 🔥"; }
body[data-theme="wall"] .card[data-stamp]::after {
  content: attr(data-stamp-wall); position: absolute; right: 8px; bottom: 6px;
  font-family: "Caveat", cursive; font-weight: 700; font-size: 15px; color: var(--ok);
}
body[data-theme="wall"] .card[data-stamp="hold"]::after    { color: var(--alarm); }
body[data-theme="wall"] .card[data-stamp="inspect"]::after { color: var(--warn); }
body[data-theme="wall"] .card .q {
  background: #fff; border-left: 3px solid var(--alarm); padding: 5px 7px; color: var(--ink);
}
body[data-theme="wall"] .empty { font-family: "Caveat", cursive; font-size: 17px; }

body[data-theme="wall"] .feed {
  background: #fff; border-radius: 10px; box-shadow: 1px 2px 6px rgba(0,0,0,.12); color: var(--ink);
}
body[data-theme="wall"] .sheet { background: #fff; color: var(--ink); border-radius: 4px; box-shadow: 3px 8px 20px rgba(0,0,0,.3); }

/* ============ responsive ============ */
@media (max-width: 1100px) {
  body { grid-template-columns: 1fr; grid-template-areas: "hdr" "team" "board" "feed"; }
  .rail { display: none; }
  #railSelect { display: inline-block; }
  .board { grid-template-columns: repeat(2, 1fr); }
  body[data-theme="wall"] .col + .col { border-left: 0; padding-left: 0; }
}
@media (max-width: 640px) {
  .board { grid-template-columns: 1fr; }
  .hdr { padding: 12px 14px; }
  .board, .team { padding-left: 14px; padding-right: 14px; }
  .feed { margin-left: 14px; margin-right: 14px; }
}

/* ============ reduced motion ============ */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
  body[data-theme="wall"] .card,
  body[data-theme="wall"] .card:nth-of-type(odd),
  body[data-theme="wall"] .card:nth-of-type(even),
  body[data-theme="wall"] .card:hover { transform: none; }
  body[data-theme="wall"] .col h2 { transform: none; }
}
```

- [ ] **Step 2: Confirm the CSS is served and syntactically sane**

Run:
```bash
node -e '
const fs=require("fs");
const css=fs.readFileSync("sdlc-team/scripts/web/theme.css","utf8");
const open=(css.match(/{/g)||[]).length, close=(css.match(/}/g)||[]).length;
console.log("braces balanced:", open===close, open, close);
for (const t of ["data-theme=\"wall\"","#E9E4DC","2px 5px 9px rgba(0,0,0,.18)","-1.8deg","1.6deg","Caveat","prefers-reduced-motion","max-width: 1100px","max-width: 640px"])
  console.log(css.includes(t) ? "ok  " : "MISS", t);'
```
Expected: `braces balanced: true` and every token `ok`.

- [ ] **Step 3: Compare against the demo**

Open `boardroom-dashboard-demo.html` (repo root) and the live dashboard side by side in a browser:

```bash
node sdlc-team/scripts/dashboard.js --port 8787
```

Visit `http://localhost:8787` in Wall theme. Check against the demo: sticky-note fills, the red pin, alternating rotations and the hover flatten, tape column headers, the dashed dividers, 🔥 on high-priority ids, the handwritten empty hint, the white feed strip. Fix any divergence — the demo wins on visuals.

- [ ] **Step 4: Run every suite**

Run:
```bash
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
```
Expected: `fail 0`; both shell suites all `ok:`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/web/theme.css
git commit -m "feat(dashboard): add layout and Sprint Wall theme"
```

---

### Task 6: Blueprint theme

**Files:**
- Modify: `sdlc-team/scripts/web/theme.css`

**Interfaces:**
- Consumes: the shared layout and DOM hooks from Task 5 — including `--note`, `data-stamp-bp`, `[data-attention]`, `.titleblock`/`.tb-row`, `.empty`, `.ptab[data-active]`, `.member[data-busy]`.
- Produces: `body[data-theme="blueprint"]` rules only. It must not change any shared-layout rule (no grid/breakpoint edits) — otherwise toggling themes would jump the layout, which the acceptance criteria forbid.

- [ ] **Step 1: Append the Blueprint theme**

Insert this block into `sdlc-team/scripts/web/theme.css` **immediately before** the `/* ============ responsive ============ */` section (so the media queries still win):

```css
/* ============ Blueprint ============ */
body[data-theme="blueprint"] {
  --ink: #E8F0FF; --dim: #9DB4E0;
  --ok: #7CE3A9; --warn: #FFD37A; --alarm: #FF9C8F;
  --line: rgba(214,228,255,.55);
  --grid: rgba(214,228,255,.16);
  background-color: #10366F;
  background-image:
    repeating-linear-gradient(0deg, var(--grid) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px 24px),
    linear-gradient(135deg, #123C7A, #0E3168);
  color: var(--ink);
  font-family: "IBM Plex Mono", monospace;
}
body[data-theme="blueprint"] h1.proj,
body[data-theme="blueprint"] .col h2,
body[data-theme="blueprint"] .card .ttl,
body[data-theme="blueprint"] .rail h4,
body[data-theme="blueprint"] .feed h4,
body[data-theme="blueprint"] .titleblock,
body[data-theme="blueprint"] #themeToggle {
  font-family: "Oswald", sans-serif; text-transform: uppercase; letter-spacing: .12em;
}
body[data-theme="blueprint"] h1.proj { font-weight: 600; font-size: 24px; letter-spacing: .25em; }
body[data-theme="blueprint"] .col h2 { font-weight: 500; font-size: 14px; letter-spacing: .18em; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
body[data-theme="blueprint"] .meta { color: var(--dim); }
body[data-theme="blueprint"] .gate { color: var(--dim); }
body[data-theme="blueprint"] .gate[data-attention="true"] { color: var(--warn); font-weight: 600; }
body[data-theme="blueprint"] #themeToggle {
  background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 0; font-size: 11px;
}

/* rail: SHEET INDEX panel */
body[data-theme="blueprint"] .rail { border-right: 1px solid var(--line); }
body[data-theme="blueprint"] .rail h4::after { content: " — sheet index"; }
body[data-theme="blueprint"] .ptab {
  background: rgba(9,34,74,.55); color: var(--ink); border: 1px solid var(--line);
  border-radius: 0; font-family: "IBM Plex Mono", monospace;
}
body[data-theme="blueprint"] .ptab[data-active="true"] { border-left: 3px solid var(--ok); }

/* crew manifest: bordered strip, dashed separators, no avatars */
body[data-theme="blueprint"] .team {
  border: 1px solid var(--line); margin: 0 20px 12px; padding: 8px 0; gap: 0;
  flex-wrap: nowrap; overflow-x: auto;
}
body[data-theme="blueprint"] .member { padding: 4px 14px; white-space: nowrap; }
body[data-theme="blueprint"] .member + .member { border-left: 1px dashed var(--line); }
body[data-theme="blueprint"] .face { display: none; }
body[data-theme="blueprint"] .member[data-busy="true"] small::after { content: " ▸ RUNNING"; color: var(--ok); font-weight: 600; }

/* cards: spec sheets */
body[data-theme="blueprint"] .card {
  background: rgba(9,34,74,.55); color: var(--ink);
  border: 1px solid var(--line); border-radius: 0; box-shadow: none;
  padding-top: 12px; transform: none;
}
body[data-theme="blueprint"] .card::before { content: none; }
body[data-theme="blueprint"] .card:hover { transform: none; border-color: var(--ink); }
body[data-theme="blueprint"] .card .ttl { font-size: 14px; font-weight: 500; letter-spacing: .1em; }
body[data-theme="blueprint"] .card .tid { color: var(--dim); }
body[data-theme="blueprint"] .card[data-priority="high"] .tid::after { content: " ⚑ HIGH"; color: var(--warn); }
body[data-theme="blueprint"] .card .bar { background: rgba(214,228,255,.18); }
body[data-theme="blueprint"] .card[data-stamp]::after {
  content: attr(data-stamp-bp); position: absolute; top: 8px; right: 8px;
  transform: rotate(-7deg); font-family: "Oswald", sans-serif; font-size: 10px;
  letter-spacing: .18em; padding: 2px 6px; border: 2px solid var(--ok); color: var(--ok);
}
body[data-theme="blueprint"] .card[data-stamp="hold"]::after    { border-color: var(--alarm); color: var(--alarm); }
body[data-theme="blueprint"] .card[data-stamp="inspect"]::after { border-color: var(--warn); color: var(--warn); }
body[data-theme="blueprint"] .card[data-stamp="wip"]::after     { border-color: var(--ink); color: var(--ink); }

/* blocked question renders as an RFI callout */
body[data-theme="blueprint"] .card .q {
  border-left: 2px solid var(--alarm); padding: 4px 8px; background: rgba(255,156,143,.08); color: var(--ink);
}
body[data-theme="blueprint"] .card .q::before {
  content: "RFI → HUMAN: "; font-family: "Oswald", sans-serif; letter-spacing: .1em; color: var(--alarm);
}
body[data-theme="blueprint"] .empty {
  border: 1px dashed var(--line); padding: 10px; text-align: center;
  font-family: "Oswald", sans-serif; letter-spacing: .14em; font-size: 11px; opacity: .8;
}

/* revision-history feed */
body[data-theme="blueprint"] .feed { border: 1px solid var(--line); }
body[data-theme="blueprint"] .feed h4::after { content: " — revision history"; }
body[data-theme="blueprint"] .feed .row { border-top: 1px dashed var(--line); padding: 5px 0; }

/* drawing title block */
body[data-theme="blueprint"] .titleblock {
  display: block; position: fixed; right: 16px; bottom: 16px; z-index: 10;
  border: 1px solid var(--line); background: rgba(9,34,74,.9); padding: 8px 10px; font-size: 10px;
}
body[data-theme="blueprint"] .tb-row { display: flex; gap: 10px; letter-spacing: .12em; }
body[data-theme="blueprint"] .tb-row b { color: var(--dim); min-width: 78px; }

body[data-theme="blueprint"] .sheet { background: #0E3168; color: var(--ink); border: 1px solid var(--line); border-radius: 0; }
```

- [ ] **Step 2: Verify both themes are present and layout rules were not touched**

Run:
```bash
node -e '
const fs=require("fs");
const css=fs.readFileSync("sdlc-team/scripts/web/theme.css","utf8");
const open=(css.match(/{/g)||[]).length, close=(css.match(/}/g)||[]).length;
console.log("braces balanced:", open===close);
console.log("wall rules:", (css.match(/data-theme="wall"/g)||[]).length);
console.log("blueprint rules:", (css.match(/data-theme="blueprint"/g)||[]).length);
for (const t of ["#123C7A","rgba(214,228,255,.55)","rgba(9,34,74,.55)","Oswald","IBM Plex Mono","attr(data-stamp-bp)","RFI → HUMAN: ","rotate(-7deg)","sheet index","revision history","▸ RUNNING"])
  console.log(css.includes(t) ? "ok  " : "MISS", t);
console.log("blueprint before responsive:", css.indexOf("Blueprint ==") < css.indexOf("responsive =="));'
```
Expected: braces balanced, both rule counts > 20, every token `ok`, and `blueprint before responsive: true`.

- [ ] **Step 3: Compare Blueprint against the demo in a browser**

```bash
node sdlc-team/scripts/dashboard.js --port 8787
```
Toggle to Blueprint at `http://localhost:8787` and compare with `boardroom-dashboard-demo.html`: drafting grid, 1px linework, square spec-sheet cards, rotated bordered stamps, the RFI callout, the bordered crew manifest with no avatars, REVISION HISTORY feed, and the bottom-right title block. Toggle back and forth and confirm **no layout jump** — only skin changes. Fix any divergence; the demo wins.

- [ ] **Step 4: Run every suite**

Run:
```bash
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
```
Expected: `fail 0`; both shell suites all `ok:`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/web/theme.css
git commit -m "feat(dashboard): add Blueprint theme"
```

---

### Task 7: Retire the old page, update docs, final acceptance sweep

**Files:**
- Delete: `sdlc-team/scripts/dashboard.html`
- Modify: `sdlc-team/README.md`
- Modify: `README.md`
- Modify: `sdlc-team/commands/sdlc-dashboard.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: a repo with exactly one dashboard UI (`scripts/web/`), documentation describing the two themes, and a green final sweep against the §9 acceptance criteria.

- [ ] **Step 1: Delete the superseded page**

```bash
git rm sdlc-team/scripts/dashboard.html
```

Confirm nothing still references it:

```bash
grep -rn "dashboard.html" sdlc-team/ README.md || echo "no references — good"
```
Expected: `no references — good`. (`dashboard.js` was already repointed at `web/index.html` in Task 3.)

- [ ] **Step 2: Update the plugin README dashboard section**

In `sdlc-team/README.md`, replace the `/sdlc-dashboard` table row with:

```markdown
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch the read-only local web dashboard — two themes (Sprint Wall / Blueprint), live board, team, inbox and archive for every project. |
```

And add this section immediately after the "How it works" list:

```markdown
## Dashboard

`/sdlc-dashboard` serves a read-only board at `http://localhost:8787` (Node.js ≥ 18, zero dependencies).
It ships two themes over one DOM, switchable from the header and remembered in `localStorage`:

- **Sprint Wall** (default) — sticky notes on a plaster wall, painter's-tape column headers, handwritten type.
- **Blueprint** — drafting paper: grid, 1px linework, spec-sheet cards, RFI callouts, a drawing title block.

The server converts `.sdlc/` markdown into a single `board.json` payload (`GET /board.json?project=<id>`);
the page polls it every 5 seconds and repaints only when the content hash changes. The UI never writes to a project.
```

- [ ] **Step 3: Update the root README dashboard section**

In `README.md`, replace the body of the `## Dashboard` section with:

```markdown
```
/sdlc-dashboard
```

A zero-dependency local web UI at `http://localhost:8787` that watches **every** Boardroom project on your machine, most-recently-active first — and for each: the composed team, the live board, the inbox, and the archive. It polls every 5 seconds and repaints only when something actually changed.

Two themes over the same board, toggled from the header and remembered across reloads:

| Theme | Looks like |
|---|---|
| **Sprint Wall** (default) | Sticky notes pinned to a plaster wall — painter's-tape column headers, handwritten titles, a 🔥 on high-priority cards |
| **Blueprint** | Drafting paper — grid, 1px linework, square spec-sheet cards, rotated `HOLD`/`W.I.P.`/`INSPECT`/`MERGED` stamps, `RFI → HUMAN` callouts, and a drawing title block |

It is strictly **read-only**. It never writes to your projects.

Projects register themselves at `/sdlc-init` (tracked in `~/.sdlc-team/projects.json`). Pass `--root <dir>` to also scan a workspace for boards created elsewhere.
```

- [ ] **Step 4: Mention the themes in the command prompt**

In `sdlc-team/commands/sdlc-dashboard.md`, replace the paragraph beginning "The server prints `http://localhost:<port>`." with:

```markdown
The server prints `http://localhost:<port>`. Open it in a browser: it lists every known SDLC project (most-recently-active first) and, per project, shows the team, the live kanban board, the inbox, and the archive — polling every 5 seconds. A header toggle switches between the **Sprint Wall** and **Blueprint** themes, and the choice is remembered. It is **read-only** and never modifies any project.
```

- [ ] **Step 5: Full acceptance sweep**

Run:
```bash
claude plugin validate ./sdlc-team --strict
claude plugin validate .
node --test sdlc-team/scripts/tests/parse.test.js sdlc-team/scripts/tests/discover.test.js sdlc-team/scripts/tests/dashboard.test.js sdlc-team/scripts/tests/board-json.test.js
bash sdlc-team/scripts/tests/test-board-check.sh
bash sdlc-team/scripts/tests/test-inbox-validate.sh
```
Expected: both validations pass; `fail 0`; both shell suites all `ok:`.

Then, in a browser at `http://localhost:8787`, walk the §9 checklist and confirm each:
- Toggling themes restyles every surface with no layout jump.
- Theme survives reload; clearing `localStorage` falls back to Wall.
- Stopping the server (or pointing `--root` at an empty dir) shows the themed "can't find the board" state, not a blank page.
- Counts, card positions, DoD bars, busy badges and the feed update within ~5s of editing a real `kanban.md`, with no flicker when nothing changed.
- A card with `question(HUMAN):` is unmissable in both themes (red gate note / warn gate + `PENDING — YOU` in the title block).
- Tab to the toggle, the rail and a card; Enter opens the overlay; Esc closes it.
- At 640px width the board is one column and still usable.
- With `prefers-reduced-motion: reduce` set in the OS/browser, cards sit flat and nothing animates.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dashboard): retire old UI, document Sprint Wall and Blueprint themes"
```

- [ ] **Step 7: Push the release branch**

```bash
git push -u origin release/dashboard-ui-v2
```

---

## Self-Review

**Spec coverage:**
- §1 stack/serving/data-source/refresh/no-deps → Global Constraints + Tasks 3 (serving), 1–2 (markdown → JSON), 4 (5s poll, revision compare), 4 (font links + fallbacks).
- §2 `board.json` contract → Task 2 (every field, including the derived ones), tested field-by-field.
- §3 DOM skeleton + stamp attribute table → Task 4 (`index.html` + `cardNode`/`render*`), reused verbatim by Tasks 5–6.
- §4.1 Wall tokens + signature details → Task 5. §4.2 Blueprint tokens + signature details → Task 6. Both verified token-by-token by the Step 2 greps and by demo comparison.
- §5 rendering, empty states, blocked emphasis, card overlay, feed cap, sprint state → Task 4 (`renderBoard` empty hints, `renderHeader` attention state, `openOverlay`, `renderFeed` slice(0,8), sprintRunning indicator).
- §6 toggle behavior, persistence, keyboard, reduced motion → Task 4 (`applyTheme`/`storeTheme`/try-catch) + Task 5 (focus ring, ≤300ms transition, reduced-motion block).
- §7 breakpoints, contrast, semantics, CSS-disabled readability → Task 5 (media queries, `--ink` always `#2E2A26` on Wall notes, `section`/`h2`/`article`/`time` in Task 4's skeleton, document order in `index.html`).
- §8 multi-project rail + `≤1100px` dropdown → Task 4 (`renderRail`, `#railSelect`), Task 5/6 rail styling, Task 5 media query.
- §9 acceptance criteria → Task 7 Step 5 walks all eight.
- §10 out of scope → recorded in Global Constraints; nothing in the plan builds them.

**Placeholder scan:** none. Every step carries runnable code or an exact edit. The one deliberately-empty file (`theme.css` in Task 4 Step 3) is a one-line comment that Task 5 replaces wholesale, and it is labelled as such.

**Type consistency:** `slugify` / `parseAgentRef` / `parseConfig` are defined in Task 1 and used with those exact signatures in Task 2. Task 2's `buildPayload(projectDirs, selectedId)` is called with that shape in Task 3. The card fields Task 2 emits (`status`, `assignee`, `assigneeName`, `reviewer`, `reviewerName`, `dod{done,total}`, `branch`, `dependsOn`, `question`, `questionFor`, `priority`) are exactly the ones Task 4's `cardNode`/`openOverlay` read. The DOM hooks Task 4 produces are exactly the selectors Tasks 5 and 6 style. Column keys are `blocked|backlog|progress|review|done` in Task 2, Task 4's `COLS`, and both stylesheets.

**Known limitation, stated rather than hidden:** there are no automated tests for the client rendering or for the CSS — no DOM environment is available without adding a dependency, which the spec forbids. Logic worth testing was therefore pushed server-side into `board-json.js` (9 tests) and `parse.js`, and the client stays a thin renderer. Visual correctness rests on the Task 5/6 token greps plus the demo comparison in a real browser, and the `.claude/agents`-style acceptance walk in Task 7 Step 5.

**Prerequisite:** `boardroom-dashboard-demo.html` must be present at the repo root before Task 5 — Tasks 5 and 6 both diff against it, and the §9 demo-parity criterion cannot be signed off without it.

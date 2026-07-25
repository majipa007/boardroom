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
- **`boardroom-dashboard-demo.html` (repo root) is the pixel source of truth.** Where this plan or the spec disagrees with the demo on *visuals*, the demo wins; this plan wins on *behavior and data*. Tasks 4–6 are ported from it, and the four sanctioned divergences are listed in each of those tasks.
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

**Reference:** `boardroom-dashboard-demo.html` at the repo root is the markup source of truth. The DOM below reproduces the demo's markup exactly, and adds only the three things the demo has no reference for: the project rail (§8), the card overlay (§5), and the error/empty states (§5, §9).

**Interfaces:**
- Consumes from Task 3: `GET ./board.json[?project=<id>]` and the asset routes `/app.js`, `/theme.css`.
- Produces, for Tasks 5 and 6, exactly these hooks (both stylesheets depend on them verbatim):
  - `body[data-theme="wall"|"blueprint"]`, plus `body[data-state="error"]` when the fetch fails.
  - `header.hdr` > `h1.proj`, `span.meta` (contains `<b>` around methodology, round and worktree count), `span.gate` (gains `data-attention="true"` when a human question is open), `select#railSelect`, `button.toggle#themeToggle[aria-pressed]`.
  - `aside.rail` > `h4` + `button.ptab[data-project][data-active]` per project.
  - `section.team#team` > `span.member[data-agent][data-busy]` > `span.face` + `b` + `small`. **`data-busy` is a bare valueless attribute** (the demo's CSS selector is `[data-busy]`).
  - `main.board#board` > `section.col[data-col]` ×5 > `h2` (label text + `span.count`) + `article.card`, plus `p.empty` when a column has no cards.
  - `article.card[data-status][data-agent][data-priority?][data-stamp?][data-stamp-wall?][data-stamp-bp?]` > `span.tid`, `h3.ttl`, `div.who`, optional `div.dod` > `div.bar` > `i`, optional `p.q`. Backlog cards carry no `data-stamp*`. Each card sets a `--note` custom property to its agent's colour.
  - `footer.feed` > `h4` + `div.row` > `time` + `span` (agent name inside `<b>`).
  - `div.titleblock#titleblock` > four `div` > `small` + `b`.
  - `div.overlay#overlay[hidden]` > `div.sheet` > `button.x#overlayClose` + `#overlayBody`.
- **Column labels are the demo's:** `Blocked`, `Backlog`, `Doing`, `Review`, `Done` (note "Doing", not "In Progress"), keyed to `data-col` values `blocked|backlog|progress|review|done`.

- [ ] **Step 1: Write the HTML skeleton**

Create `sdlc-team/scripts/web/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>boardroom — Sprint Wall / Blueprint</title>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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

<aside class="rail" aria-label="Projects">
  <h4>PROJECTS</h4>
  <div id="railList"></div>
</aside>

<section class="team" id="team" aria-label="Team"></section>

<main class="board" id="board"></main>

<footer class="feed" aria-label="Activity">
  <h4>ACTIVITY — INBOX / ARCHIVE</h4>
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

// data-col value -> demo's column heading text
const COLS = [
  ['blocked', 'Blocked'],
  ['backlog', 'Backlog'],
  ['progress', 'Doing'],
  ['review', 'Review'],
  ['done', 'Done'],
];

// status -> [data-stamp, data-stamp-wall, data-stamp-bp]; backlog has none
const STAMPS = {
  blocked: ['hold', 'held ✋', 'HOLD'],
  progress: ['wip', 'on it ✍', 'W.I.P.'],
  review: ['inspect', 'checking 👀', 'INSPECT'],
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
function currentTheme() {
  return document.body.dataset.theme === 'blueprint' ? 'blueprint' : 'wall';
}

function applyTheme(theme) {
  const t = theme === 'blueprint' ? 'blueprint' : 'wall';
  document.body.dataset.theme = t;
  const btn = document.getElementById('themeToggle');
  btn.textContent = t === 'blueprint' ? '⇄ SPRINT WALL MODE' : '⇄ BLUEPRINT MODE';
  btn.setAttribute('aria-pressed', String(t === 'blueprint'));
  renderTitle();
  if (currentData) { renderHeader(currentData); renderBoard(); }  // flavour text + empty hints differ
}

function renderTitle() {
  const name = currentData && currentData.project ? currentData.project.name : 'boardroom';
  document.querySelector('.proj').textContent = currentTheme() === 'blueprint'
    ? `${name} — Construction Board`
    : `${name} — sprint wall`;
}

/* ---------- helpers ---------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
// <b>value</b> segments, like the demo's .meta markup
function bold(text) { return el('b', null, text); }

/* ---------- rendering ---------- */

function renderHeader(d) {
  const p = d.project;
  const meta = document.querySelector('.meta');
  meta.textContent = '';
  meta.appendChild(bold(p.methodology || '—'));
  meta.append(` · ${p.phase || '—'} · round `);
  meta.appendChild(bold(`${p.round}/${p.maxRounds}`));
  meta.append(' · ');
  meta.appendChild(bold(String(p.activeWorktrees)));
  meta.append(' worktrees active');
  if (p.sprintRunning) {
    meta.append(currentTheme() === 'blueprint'
      ? ` · GOOD SERVICE — ROUND ${p.round}/${p.maxRounds}`
      : ' · ⌁ sprint running');
  }

  const openQuestions = d.cards.filter(c => c.questionFor === 'human').length;
  const gate = document.querySelector('.gate');
  if (openQuestions > 0) {
    gate.dataset.attention = 'true';
    gate.textContent = `needs you: ${openQuestions} question${openQuestions === 1 ? '' : 's'}`;
  } else if (!p.sprintRunning && p.awaitingHuman) {
    gate.dataset.attention = 'true';
    gate.textContent = `paused — waiting on you · ${p.nextGate}`;
  } else {
    delete gate.dataset.attention;
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
    if (m.busy) s.setAttribute('data-busy', '');       // bare attribute, matches [data-busy]
    if (m.color) s.style.setProperty('--note', m.color);
    s.appendChild(el('span', 'face', (m.name || m.id || '?').trim().charAt(0).toUpperCase()));
    s.appendChild(el('b', null, m.name || m.id));
    s.append(' ');
    s.appendChild(el('small', null, m.busy && m.currentTask ? `${m.role} · ${m.currentTask}` : m.role));
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
  a.appendChild(el('div', 'who', c.reviewerName
    ? `${c.assigneeName || c.assignee} → ${c.reviewerName}`
    : (c.assigneeName || c.assignee || 'unassigned')));

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
  a.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOverlay(c); }
  });
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
    const s = el('span');
    s.appendChild(el('b', null, a.agent));
    s.append(` · ${a.text}`);
    row.appendChild(s);
    host.appendChild(row);
  }
}

function renderTitleBlock(d) {
  const p = d.project;
  const host = document.getElementById('titleblock');
  host.textContent = '';
  const rows = [
    ['PROJECT', String(p.name || '').toUpperCase()],
    ['ROUND', `${p.round} / ${p.maxRounds}`],
    ['PARALLEL', `${p.activeWorktrees} WORKTREES`],
    ['APPROVED BY', d.cards.some(c => c.questionFor === 'human') ? 'PENDING — YOU' : 'AUTO'],
  ];
  for (const [k, v] of rows) {
    const cell = el('div');
    cell.appendChild(el('small', null, k));
    cell.appendChild(el('b', null, v));
    host.appendChild(cell);
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
  if (c.dependsOn && c.dependsOn.length) {
    body.appendChild(el('p', null, `depends on: ${c.dependsOn.join(', ')}`));
  }
  if (c.question) body.appendChild(el('p', null, `question (${c.questionFor}): ${c.question}`));
  if (c.dod && c.dod.total) {
    body.appendChild(el('p', null, `definition of done: ${c.dod.done} of ${c.dod.total} complete`));
  }
  document.getElementById('overlay').hidden = false;
  document.getElementById('overlayClose').focus();
}

function closeOverlay() { document.getElementById('overlay').hidden = true; }

/* ---------- polling ---------- */

function showError(message) {
  document.body.dataset.state = 'error';
  document.querySelector('.meta').textContent = message;
  const board = document.getElementById('board');
  board.textContent = '';
  board.appendChild(el('p', 'empty', "can't find the board — is the sprint folder present?"));
}

async function poll() {
  try {
    const url = './board.json' + (selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : '');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.project) throw new Error(d.error || 'no projects found');

    delete document.body.dataset.state;
    if (d.revision === lastRevision) return;      // unchanged — no repaint
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

- [ ] **Step 5: Verify the payload and DOM hooks against a real board**

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
const html=await (await fetch("http://127.0.0.1:"+p+"/")).text();
for (const t of ["data-theme=\"wall\"","themeToggle","class=\"rail\"","id=\"titleblock\"","id=\"overlay\"","ACTIVITY — INBOX / ARCHIVE"])
  console.log(html.includes(t)?"ok  ":"MISS", t);
s.close();});'
```
Expected: a real project name, non-zero counts, statuses only from `blocked,backlog,progress,review,done`, and every markup token `ok`.

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/scripts/web/index.html sdlc-team/scripts/web/app.js sdlc-team/scripts/web/theme.css
git commit -m "feat(dashboard): add demo-accurate DOM skeleton and client renderer"
```

---

### Task 5: Shared layout + Sprint Wall theme

**Files:**
- Modify: `sdlc-team/scripts/web/theme.css`

**Reference:** the CSS below is ported from `boardroom-dashboard-demo.html`'s `<style>` block — its "SHARED STRUCTURE" and "THEME: SPRINT WALL" sections, values unchanged. Four deliberate adaptations, each required by this project and marked in the CSS with a comment:

1. **Agent colours come from `--note`,** not from six hardcoded `[data-agent="marcus"]` rules. The roster is composed per project, so the demo's per-name rules cannot work; Task 2 assigns each agent one of the demo's six colours and Task 4 sets it as an inline `--note`. Same palette, same result, any role.
2. **Body becomes a CSS grid with a rail column** so §8's project rail has somewhere to live. The demo is block flow and has no rail. Every inner padding is kept at the demo's exact values, and below 1100px the rail is hidden — at which point the layout is the demo's.
3. **The activity rows are `.feed .row`,** not `.feed div`. The demo's selector would also style the `#feedRows` wrapper; scoping to `.row` yields identical visuals.
4. **Added, because the demo has no reference for them:** the rail, the card overlay, `.empty` hints, `.gate[data-attention]`, and focus rings.

**Interfaces:**
- Consumes: the DOM hooks produced by Task 4.
- Produces, for Task 6: the shared layout (grid areas, breakpoints, overlay, reduced-motion block) that Blueprint reuses unchanged, plus every `body[data-theme="wall"]` rule. Task 6 adds only `body[data-theme="blueprint"]` rules and must not touch layout.

- [ ] **Step 1: Write the shared layout and the Wall theme**

Replace the whole contents of `sdlc-team/scripts/web/theme.css` with:

```css
/* ============================================================
   SHARED STRUCTURE (ported from the demo; theme-agnostic)
   ============================================================ */
*{margin:0;box-sizing:border-box}

/* ADAPTATION 2: grid instead of the demo's block flow, to seat the project rail. */
body{
  min-height:100vh;transition:background .3s;
  display:grid;grid-template-columns:214px 1fr;
  grid-template-areas:"rail hdr" "rail team" "rail board" "rail feed" "rail tblock";
  grid-template-rows:auto auto 1fr auto auto;
}
.hdr{grid-area:hdr;display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;padding:24px 32px 6px}
.rail{grid-area:rail;padding:24px 14px;overflow-y:auto}
.team{grid-area:team;display:flex;gap:12px;padding:10px 32px 4px;flex-wrap:wrap}
.board{grid-area:board;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;padding:18px 28px 30px;align-items:start}
.feed{grid-area:feed;margin:0 32px 30px;padding:12px 18px}
.titleblock{grid-area:tblock;display:none}

.meta{font-size:12.5px}
.gate{margin-left:auto}
.toggle{cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.08em;padding:8px 16px;border-radius:6px;border:2px solid}
#railSelect{display:none;font:inherit;font-size:12px;padding:5px}

.rail h4{font-size:11px;letter-spacing:.18em;margin-bottom:10px;opacity:.75}
.ptab{display:block;width:100%;text-align:left;cursor:pointer;font:inherit;margin-bottom:9px;padding:8px 11px}
.ptab b{display:block;font-size:13px}
.ptab small{display:block;font-size:10.5px;opacity:.72}

.member{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;padding:4px 12px 4px 5px}
.face{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:15px;font-weight:700}
.member small{font-weight:600;font-size:10px;opacity:.7}
.member[data-busy]::after{content:"▸ working";font-size:9.5px;font-weight:800;margin-left:2px}

.col h2{font-size:18px;margin-bottom:14px}
.col h2 span{font-size:13px;opacity:.6;margin-left:6px}
.card{position:relative;padding:13px 14px 12px;margin-bottom:16px;cursor:pointer;transition:transform .15s}
.tid{font-size:10px;font-weight:800;letter-spacing:.1em;opacity:.6}
.ttl{font-size:16px;line-height:1.15;margin:3px 0 7px;font-weight:700}
.who{font-size:11px;font-weight:800}
.dod{margin-top:7px;font-size:10.5px;font-weight:700;opacity:.75}
.dod .bar{height:4px;border-radius:2px;margin-top:4px;overflow:hidden;background:rgba(0,0,0,.14)}
.dod .bar i{display:block;height:100%}
.q{font-size:11.5px;font-weight:700;border-radius:4px;padding:6px 8px;margin-top:7px;line-height:1.4}
.card[data-stamp]::after{position:absolute;bottom:8px;right:9px;font-size:13px;padding:0 7px;border:2px solid;border-radius:3px;transform:rotate(-7deg)}
.card[data-status="done"] .ttl{text-decoration:line-through;opacity:.6}

.feed h4{font-size:11px;letter-spacing:.18em;margin-bottom:8px;opacity:.75}
/* ADAPTATION 3: scoped to .row so the #feedRows wrapper isn't styled as a row. */
.feed .row{display:flex;gap:14px;font-size:12px;padding:3px 0}
.feed time{opacity:.55;min-width:44px}

/* ADDED (no demo reference): empty hints, overlay, focus rings */
.empty{font-size:13px;opacity:.55;margin-top:4px}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:20px;z-index:50}
.overlay[hidden]{display:none}
.sheet{position:relative;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;padding:20px 22px}
.sheet h3{margin-bottom:10px}
.sheet p{margin:6px 0;font-size:13px;line-height:1.45}
.x{position:absolute;top:8px;right:10px;cursor:pointer;font-size:20px;line-height:1;background:none;border:0;color:inherit}
.card:focus-visible,.ptab:focus-visible,.toggle:focus-visible,.x:focus-visible,#railSelect:focus-visible{outline:3px solid #4C9AFF;outline-offset:2px}

/* ============================================================
   THEME: SPRINT WALL
   ============================================================ */
body[data-theme="wall"]{
  font-family:'Nunito',sans-serif;color:#2E2A26;
  background:radial-gradient(circle at 30% 20%,#E9E4DC 0%,#DFD8CC 100%);
}
body[data-theme="wall"] .proj{font-family:'Caveat',cursive;font-size:44px;transform:rotate(-1.2deg)}
body[data-theme="wall"] .meta{color:#8A8177;font-weight:600}
body[data-theme="wall"] .meta b{color:#2E2A26}
body[data-theme="wall"] .gate{font-family:'Caveat',cursive;font-size:20px;background:#fff;padding:6px 16px;border-radius:4px;box-shadow:2px 3px 8px rgba(0,0,0,.12);transform:rotate(1.5deg);border-left:6px solid #FFD2A6}
body[data-theme="wall"] .gate[data-attention="true"]{border-left-color:#B33A3A;color:#B33A3A;font-weight:700}
body[data-theme="wall"] .toggle{background:#2E2A26;color:#F5EFE4;border-color:#2E2A26;font-family:'Nunito',sans-serif}
body[data-theme="wall"] .member{background:#fff;border-radius:20px;box-shadow:1px 2px 5px rgba(0,0,0,.12)}
body[data-theme="wall"] .face{font-family:'Caveat',cursive}
body[data-theme="wall"] .member[data-busy]::after{color:#3E8E5A}

/* ADAPTATION 1: palette arrives as --note (set inline per agent), replacing the
   demo's six hardcoded [data-agent="name"] rules — the roster is dynamic. */
body[data-theme="wall"] .face{background:var(--note,#FFD2A6);color:#2E2A26}
body[data-theme="wall"] .card{background:var(--note,#FFE87A);color:#2E2A26}

body[data-theme="wall"] .rail{border-right:2px dashed rgba(0,0,0,.09)}
body[data-theme="wall"] .rail h4{font-family:'Caveat',cursive;font-size:17px;letter-spacing:0}
body[data-theme="wall"] .ptab{background:#fff;color:#2E2A26;border:1px solid rgba(0,0,0,.14);border-radius:3px 10px 10px 3px;box-shadow:1px 2px 5px rgba(0,0,0,.12);font-family:'Nunito',sans-serif}
body[data-theme="wall"] .ptab[data-active="true"]{border-left:4px solid #B07A1F;font-weight:800}

body[data-theme="wall"] .col{border-right:2px dashed rgba(0,0,0,.09);padding:0 10px}
body[data-theme="wall"] .col:last-child{border-right:0}
body[data-theme="wall"] .col h2{font-family:'Caveat',cursive;font-size:24px;text-align:center;width:max-content;margin:0 auto 18px;background:rgba(255,255,255,.85);padding:2px 22px;transform:rotate(-1deg);box-shadow:1px 2px 4px rgba(0,0,0,.1)}
body[data-theme="wall"] .card{max-width:215px;margin-left:auto;margin-right:auto;box-shadow:2px 5px 9px rgba(0,0,0,.18)}
body[data-theme="wall"] .card::before{content:"";position:absolute;top:-7px;left:50%;width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#B33A3A 60%);box-shadow:0 2px 3px rgba(0,0,0,.3)}
body[data-theme="wall"] .card:nth-of-type(odd){transform:rotate(-1.8deg)}
body[data-theme="wall"] .card:nth-of-type(even){transform:rotate(1.6deg)}
body[data-theme="wall"] .card:hover{transform:scale(1.05) rotate(0);z-index:3}
body[data-theme="wall"] .ttl{font-family:'Caveat',cursive;font-size:20px;font-weight:700}
body[data-theme="wall"] .card[data-priority="high"] .tid::after{content:" 🔥"}
body[data-theme="wall"] .dod .bar i{background:#3E8E5A}
body[data-theme="wall"] .q{background:rgba(255,255,255,.6)}
body[data-theme="wall"] .q::before{content:"❓ "}
body[data-theme="wall"] .card[data-stamp]::after{content:attr(data-stamp-wall);font-family:'Caveat',cursive;color:#3E8E5A;border-color:#3E8E5A}
body[data-theme="wall"] .card[data-stamp="hold"]::after{color:#B33A3A;border-color:#B33A3A}
body[data-theme="wall"] .card[data-stamp="inspect"]::after{color:#B07A1F;border-color:#B07A1F}
body[data-theme="wall"] .feed{background:rgba(255,255,255,.9);border-radius:10px;box-shadow:1px 2px 6px rgba(0,0,0,.08)}
body[data-theme="wall"] .feed b{font-weight:800}
body[data-theme="wall"] .empty{font-family:'Caveat',cursive;font-size:17px}
body[data-theme="wall"] .sheet{background:#fff;color:#2E2A26;border-radius:4px;box-shadow:3px 8px 20px rgba(0,0,0,.3)}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width:1100px){
  /* rail hidden -> layout matches the demo's block-flow proportions */
  body{grid-template-columns:1fr;grid-template-areas:"hdr" "team" "board" "feed" "tblock"}
  .rail{display:none}
  #railSelect{display:inline-block}
  .board{grid-template-columns:repeat(2,1fr)}
}
@media (max-width:640px){
  .board{grid-template-columns:1fr}
  .hdr{padding:18px 16px 6px}
  .team{padding:10px 16px 4px}
  .board{padding:14px 14px 24px}
  .feed{margin:0 16px 24px}
  body[data-theme="wall"] .col{border-right:0}
}

/* ============================================================
   REDUCED MOTION
   ============================================================ */
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
  body[data-theme="wall"] .proj,
  body[data-theme="wall"] .gate,
  body[data-theme="wall"] .col h2,
  body[data-theme="wall"] .card,
  body[data-theme="wall"] .card:nth-of-type(odd),
  body[data-theme="wall"] .card:nth-of-type(even),
  body[data-theme="wall"] .card:hover{transform:none}
}
```

- [ ] **Step 2: Verify the CSS parses and carries the demo's exact values**

Run:
```bash
node -e '
const fs=require("fs");
const css=fs.readFileSync("sdlc-team/scripts/web/theme.css","utf8");
const open=(css.match(/{/g)||[]).length, close=(css.match(/}/g)||[]).length;
console.log("braces balanced:", open===close, open, close);
const need=["radial-gradient(circle at 30% 20%,#E9E4DC 0%,#DFD8CC 100%)","2px 5px 9px rgba(0,0,0,.18)",
"rotate(-1.8deg)","rotate(1.6deg)","scale(1.05) rotate(0)","max-width:215px","top:-7px",
"radial-gradient(circle at 35% 30%,#fff,#B33A3A 60%)","rotate(-1.2deg)","rotate(1.5deg)",
"font-size:44px","transform:rotate(-1deg)","content:\" 🔥\"","content:\"❓ \"",
"attr(data-stamp-wall)","var(--note,#FFE87A)","transform:rotate(-7deg)",
"text-decoration:line-through","prefers-reduced-motion","max-width:1100px","max-width:640px"];
for (const t of need) console.log(css.includes(t)?"ok  ":"MISS", t);'
```
Expected: `braces balanced: true` and every token `ok`.

- [ ] **Step 3: Compare against the demo in a browser**

```bash
node sdlc-team/scripts/dashboard.js --port 8787
```

Open `http://localhost:8787` (Wall) beside `boardroom-dashboard-demo.html`. Check each demo signature: sticky-note fills from the palette, the pin above each card's top edge, alternating ∓ rotations and the hover flatten-and-scale, centred tape column headers at −1°, the 44px handwritten title at −1.2°, the tilted white gate note, dashed column dividers, 🔥 on high-priority ids, ❓ before question text, the strike-through on Done titles, stamps bottom-right at −7°, and the white rounded feed. Fix any divergence — **the demo wins on visuals.**

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
git commit -m "feat(dashboard): port demo layout and Sprint Wall theme"
```

---

### Task 6: Blueprint theme

**Files:**
- Modify: `sdlc-team/scripts/web/theme.css`

**Reference:** ported from `boardroom-dashboard-demo.html`'s "THEME: BLUEPRINT" section, values unchanged. Additions where the demo has no reference: the rail (`SHEET INDEX`), the overlay, `.empty`, and `.gate[data-attention]`.

**Interfaces:**
- Consumes: the shared layout and DOM hooks from Tasks 4–5 — `--note`, `data-stamp-bp`, `[data-attention]`, `.titleblock > div > small + b`, `.empty`, `.ptab[data-active]`, `.member[data-busy]`, `.feed .row`.
- Produces: `body[data-theme="blueprint"]` rules only. It must not modify any shared-layout or responsive rule — otherwise toggling themes would shift the layout, which §9 forbids.

- [ ] **Step 1: Append the Blueprint theme**

Insert this block into `sdlc-team/scripts/web/theme.css` **immediately before** the `/* ==== RESPONSIVE ==== */` section, so the media queries still win:

```css
/* ============================================================
   THEME: BLUEPRINT
   ============================================================ */
body[data-theme="blueprint"]{
  --lineW:rgba(214,228,255,.55);--lineF:rgba(214,228,255,.16);--ok:#7CE3A9;--warn:#FFD37A;--alarm:#FF9C8F;
  font-family:'IBM Plex Mono',monospace;color:#E8F0FF;
  background:
    repeating-linear-gradient(0deg,transparent 0 23px,var(--lineF) 23px 24px),
    repeating-linear-gradient(90deg,transparent 0 23px,var(--lineF) 23px 24px),
    linear-gradient(135deg,#123C7A 0%,#0E3168 100%);
}
body[data-theme="blueprint"] .proj{font-family:'Oswald',sans-serif;font-size:26px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
body[data-theme="blueprint"] .meta{color:#9DB4E0;letter-spacing:.1em;text-transform:uppercase;font-size:10.5px}
body[data-theme="blueprint"] .meta b{color:#E8F0FF}
body[data-theme="blueprint"] .gate{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;border:1px dashed var(--lineW);padding:6px 14px;color:var(--warn)}
body[data-theme="blueprint"] .gate[data-attention="true"]{border-style:solid;border-color:var(--alarm);color:var(--alarm)}
body[data-theme="blueprint"] .toggle{background:transparent;color:#E8F0FF;border-color:var(--lineW);font-family:'Oswald',sans-serif;letter-spacing:.15em;text-transform:uppercase;border-radius:0}

/* ADDED (no demo reference): rail as a SHEET INDEX panel */
body[data-theme="blueprint"] .rail{border-right:1px solid var(--lineW)}
body[data-theme="blueprint"] .rail h4{font-family:'Oswald',sans-serif;letter-spacing:.25em}
body[data-theme="blueprint"] .rail h4::after{content:" — SHEET INDEX"}
body[data-theme="blueprint"] .ptab{background:rgba(9,34,74,.55);color:#E8F0FF;border:1px solid var(--lineW);border-radius:0;font-family:'IBM Plex Mono',monospace}
body[data-theme="blueprint"] .ptab b{font-family:'Oswald',sans-serif;letter-spacing:.1em;text-transform:uppercase}
body[data-theme="blueprint"] .ptab small{color:#9DB4E0;letter-spacing:.08em}
body[data-theme="blueprint"] .ptab[data-active="true"]{border-left:3px solid var(--ok)}

body[data-theme="blueprint"] .team{border:1px solid var(--lineW);margin:14px 32px 0;padding:0;width:max-content;gap:0}
body[data-theme="blueprint"] .member{border-right:1px dashed var(--lineF);padding:8px 16px;border-radius:0;background:none;box-shadow:none}
body[data-theme="blueprint"] .member:last-child{border-right:0}
body[data-theme="blueprint"] .face{display:none}
body[data-theme="blueprint"] .member b{font-family:'Oswald',sans-serif;letter-spacing:.1em;text-transform:uppercase}
body[data-theme="blueprint"] .member small{letter-spacing:.12em;text-transform:uppercase;color:#9DB4E0}
body[data-theme="blueprint"] .member[data-busy]::after{content:"▸ RUNNING";color:var(--ok)}

body[data-theme="blueprint"] .col{border-top:1px solid var(--lineW);border-right:0;padding:10px 0 0}
body[data-theme="blueprint"] .col h2{font-family:'Oswald',sans-serif;font-size:14px;letter-spacing:.2em;text-transform:uppercase;background:none;box-shadow:none;transform:none;width:auto;margin:0 0 14px;padding:0;text-align:left}
body[data-theme="blueprint"] .card{background:rgba(9,34,74,.55);border:1px solid var(--lineW);border-radius:0;box-shadow:none;max-width:none;transform:none;color:#E8F0FF}
body[data-theme="blueprint"] .card::before{content:none}
body[data-theme="blueprint"] .card:hover{transform:translateY(-2px)}
body[data-theme="blueprint"] .tid{color:#9DB4E0}
body[data-theme="blueprint"] .ttl{font-family:'Oswald',sans-serif;font-size:14.5px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}
body[data-theme="blueprint"] .who{color:#9DB4E0;letter-spacing:.1em;text-transform:uppercase;font-size:9.5px}
body[data-theme="blueprint"] .who::before{content:"crew: "}
body[data-theme="blueprint"] .card[data-priority="high"] .tid::after{content:" · PRI-A";color:var(--warn)}
body[data-theme="blueprint"] .dod{color:#9DB4E0}
body[data-theme="blueprint"] .dod .bar{background:rgba(214,228,255,.15);border-radius:0}
body[data-theme="blueprint"] .dod .bar i{background:var(--ok)}
body[data-theme="blueprint"] .q{color:var(--alarm);background:rgba(255,156,143,.07);border-left:2px solid var(--alarm);border-radius:0}
body[data-theme="blueprint"] .q::before{content:"RFI → HUMAN: ";letter-spacing:.1em}
body[data-theme="blueprint"] .card[data-stamp]::after{content:attr(data-stamp-bp);font-family:'Oswald',sans-serif;letter-spacing:.14em;top:8px;bottom:auto;border-radius:0}
body[data-theme="blueprint"] .card[data-stamp="merged"]::after{color:var(--ok);border-color:var(--ok)}
body[data-theme="blueprint"] .card[data-stamp="hold"]::after{color:var(--alarm);border-color:var(--alarm)}
body[data-theme="blueprint"] .card[data-stamp="inspect"]::after{color:var(--warn);border-color:var(--warn)}
body[data-theme="blueprint"] .card[data-stamp="wip"]::after{color:#E8F0FF;border-color:#E8F0FF;opacity:.7}
body[data-theme="blueprint"] .feed{border:1px solid var(--lineW);background:rgba(9,34,74,.85);border-radius:0;box-shadow:none}
body[data-theme="blueprint"] .feed h4{font-family:'Oswald',sans-serif;letter-spacing:.25em}
body[data-theme="blueprint"] .feed .row{color:#9DB4E0}
body[data-theme="blueprint"] .feed time{color:#E8F0FF}

/* ADDED (no demo reference): dashed empty placeholder, overlay surface */
body[data-theme="blueprint"] .empty{border:1px dashed var(--lineW);padding:10px;text-align:center;font-family:'Oswald',sans-serif;letter-spacing:.14em;font-size:11px;opacity:.85}
body[data-theme="blueprint"] .sheet{background:#0E3168;color:#E8F0FF;border:1px solid var(--lineW);border-radius:0}

body[data-theme="blueprint"] .titleblock{display:grid;grid-template-columns:repeat(4,auto);width:max-content;margin:0 32px 30px auto;border:1px solid var(--lineW);background:rgba(9,34,74,.85)}
body[data-theme="blueprint"] .titleblock div{padding:8px 16px;border-left:1px solid var(--lineF)}
body[data-theme="blueprint"] .titleblock div:first-child{border-left:0}
body[data-theme="blueprint"] .titleblock small{display:block;font-size:9px;letter-spacing:.18em;color:#9DB4E0}
body[data-theme="blueprint"] .titleblock b{font-family:'Oswald',sans-serif;font-size:14px;letter-spacing:.08em}
```

- [ ] **Step 2: Verify both themes are present, ordered, and demo-exact**

Run:
```bash
node -e '
const fs=require("fs");
const css=fs.readFileSync("sdlc-team/scripts/web/theme.css","utf8");
const open=(css.match(/{/g)||[]).length, close=(css.match(/}/g)||[]).length;
console.log("braces balanced:", open===close);
console.log("wall rules:",(css.match(/data-theme="wall"/g)||[]).length,
            "blueprint rules:",(css.match(/data-theme="blueprint"/g)||[]).length);
const need=["linear-gradient(135deg,#123C7A 0%,#0E3168 100%)","rgba(214,228,255,.55)","rgba(9,34,74,.55)",
"repeating-linear-gradient(0deg,transparent 0 23px","Oswald","IBM Plex Mono","attr(data-stamp-bp)",
"content:\"RFI → HUMAN: \"","content:\"crew: \"","content:\" · PRI-A\"","content:\"▸ RUNNING\"",
"SHEET INDEX","width:max-content","translateY(-2px)"];
for (const t of need) console.log(css.includes(t)?"ok  ":"MISS", t);
console.log("blueprint precedes responsive:", css.indexOf("THEME: BLUEPRINT") < css.indexOf("RESPONSIVE"));'
```
Expected: braces balanced, both rule counts > 20, every token `ok`, `blueprint precedes responsive: true`.

- [ ] **Step 3: Compare Blueprint against the demo in a browser**

```bash
node sdlc-team/scripts/dashboard.js --port 8787
```
Toggle to Blueprint and compare with the demo: the 24px drafting grid, 1px linework, the letter-spaced uppercase title, square spec-sheet cards with no pin, stamps top-right at −7°, `crew:` before the assignee, `· PRI-A` on high priority, the RFI callout, the bordered crew manifest with no avatars, the bordered feed, and the four-cell title block bottom-right. Then toggle back and forth several times and confirm **no layout jump** — only the skin changes. Fix any divergence; the demo wins.

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
git commit -m "feat(dashboard): port demo Blueprint theme"
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
- Produces: a repo with exactly one dashboard UI (`scripts/web/`), documentation describing the two themes, and a signed-off §9 acceptance walk.

- [ ] **Step 1: Delete the superseded page**

```bash
git rm sdlc-team/scripts/dashboard.html
```

Confirm nothing references it:

```bash
grep -rn "dashboard.html" sdlc-team/ README.md || echo "no references — good"
```
Expected: `no references — good`. (`dashboard.js` was repointed at `web/index.html` in Task 3.)

- [ ] **Step 2: Update the plugin README**

In `sdlc-team/README.md`, replace the `/sdlc-dashboard` table row with:

```markdown
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch the read-only local web dashboard — two themes (Sprint Wall / Blueprint), live board, team, inbox and archive for every project. |
```

And add this section immediately after the "How it works" list:

```markdown
## Dashboard

`/sdlc-dashboard` serves a read-only board at `http://localhost:8787` (Node.js ≥ 18, zero dependencies).
It ships two themes over one DOM, switchable from the header and remembered in `localStorage`:

- **Sprint Wall** (default) — sticky notes pinned to a plaster wall, painter's-tape column headers, handwritten type.
- **Blueprint** — drafting paper: grid, 1px linework, spec-sheet cards, RFI callouts, a drawing title block.

The server converts `.sdlc/` markdown into a single `board.json` payload (`GET /board.json?project=<id>`);
the page polls it every 5 seconds and repaints only when the content hash changes. The UI never writes to a project.
```

- [ ] **Step 3: Update the root README dashboard section**

In `README.md`, replace the body of the `## Dashboard` section with:

````markdown
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
````

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

Then in a browser at `http://localhost:8787`, walk the §9 checklist and confirm each:
- Toggling themes restyles every surface with no layout jump.
- Theme survives reload; clearing `localStorage` falls back to Wall.
- Pointing `--root` at an empty directory (or stopping the server) shows the themed "can't find the board" state, not a blank page.
- Counts, card positions, DoD bars, busy badges and the feed update within ~5s of editing a real `kanban.md`, with no repaint when nothing changed.
- A card with `question(HUMAN):` is unmissable in both themes (red-bordered gate note / solid alarm gate + `PENDING — YOU` in the title block).
- Tab reaches the toggle, the rail and cards; Enter opens the overlay; Esc closes it.
- At 640px the board is one column and still usable.
- With `prefers-reduced-motion: reduce`, cards sit flat and nothing animates.
- Side by side with `boardroom-dashboard-demo.html`, each theme is visually indistinguishable for the same data.

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
- §1 stack / serving / data source / 5s refresh / no deps → Global Constraints + Task 3 (serving), Tasks 1–2 (markdown → JSON), Task 4 (poll + revision compare, font links with fallbacks).
- §2 `board.json` contract → Task 2, tested field by field, including the five derived fields.
- §3 DOM skeleton + stamp attribute table → Task 4, reproduced from the demo's markup and consumed verbatim by Tasks 5–6.
- §4.1 Wall tokens and signature details → Task 5 (ported from the demo). §4.2 Blueprint → Task 6 (ported from the demo). Both verified by the Step 2 token greps plus a browser diff.
- §5 rendering, empty states, blocked emphasis, overlay, feed cap, sprint state → Task 4.
- §6 toggle, persistence, keyboard, reduced motion → Task 4 (`applyTheme` / `storeTheme` in try-catch) + Task 5 (focus rings, `.3s` transition, reduced-motion block).
- §7 breakpoints, contrast, semantics, CSS-disabled readability → Task 5 media queries; Wall ink pinned to `#2E2A26` on notes and faces; `section`/`h2`/`article`/`time` in Task 4's markup; document order in `index.html`.
- §8 rail + `≤1100px` dropdown → Task 4 (`renderRail`, `#railSelect`), Task 5/6 rail styling, Task 5 media query.
- §9 acceptance criteria → Task 7 Step 5 walks all eight, demo parity included.
- §10 out of scope → recorded in Global Constraints; nothing here builds them.

**Placeholder scan:** none. Every step carries runnable code or an exact edit. The one intentionally-empty file (`theme.css` in Task 4 Step 3) is a labelled one-line comment that Task 5 replaces wholesale.

**Type consistency:** `slugify` / `parseAgentRef` / `parseConfig` are defined in Task 1 and used with those signatures in Task 2. `buildPayload(projectDirs, selectedId)` from Task 2 is called with that shape in Task 3. The card fields Task 2 emits (`status`, `assignee`, `assigneeName`, `reviewer`, `reviewerName`, `dod{done,total}`, `branch`, `dependsOn`, `question`, `questionFor`, `priority`) are exactly what Task 4's `cardNode` / `openOverlay` read. Every selector Tasks 5–6 style is emitted by Task 4. Column keys are `blocked|backlog|progress|review|done` in Task 2, Task 4's `COLS`, and both stylesheets; the visible labels are the demo's `Blocked|Backlog|Doing|Review|Done`.

**Demo reconciliation (why Tasks 4–6 were rewritten):** the first draft of this plan was written from §4's token tables before the demo existed on disk. The demo then contradicted it in ~20 places, and the demo wins on visuals. Corrections now baked into the tasks: column header "Doing" (not "In Progress"); `.meta` values wrapped in `<b>`; column count as a bare `span` styled via `.col h2 span`; `data-busy` as a valueless attribute with `▸ working` / `▸ RUNNING` on `.member::after`; title block as four `div > small + b` cells (not `.tb-row`); stamps declared once in shared CSS at `rotate(-7deg)` with themes overriding position/colour; Wall cards `max-width:215px` centred; pin at `top:-7px` with the `#fff → #B33A3A` gradient; Wall `.col` divider as `border-right` with `:last-child` reset; `❓ ` prefix on Wall questions; `crew: ` prefix and `· PRI-A` in Blueprint; done titles struck through; feed rows as `<time>` + `<span><b>agent</b> · text</span>`; feed heading kept as the demo's `ACTIVITY — INBOX / ARCHIVE` (so §4.2's "REVISION HISTORY" wording is dropped — demo wins); Blueprint grid as `transparent 0 23px / lineF 23px 24px` repeating gradients.

**Sanctioned divergences from the demo, and why:**
1. Agent colours come from an inline `--note` (palette assigned by hash of agent id) instead of the demo's six `[data-agent="marcus"]` rules — the roster is composed per project, so per-name rules cannot work. Same six colours.
2. `body` is a CSS grid with a rail column; the demo is block flow with no rail. Inner paddings match the demo exactly, and below 1100px the rail is hidden, so the layout is the demo's.
3. Activity rows are scoped `.feed .row` rather than `.feed div`, so the `#feedRows` wrapper isn't styled as a row. Identical visuals.
4. The rail, the card overlay, `.empty` hints, `.gate[data-attention]` and focus rings have no demo reference — §5, §8 and §9 govern them.

**Known limitation, stated rather than hidden:** there are no automated tests for the client rendering or the CSS — a DOM environment would mean a dependency, which §1 forbids. Logic worth testing was therefore pushed server-side (`board-json.js`, 9 tests; `parse.js`, 9 tests), leaving the client a thin renderer. Visual correctness rests on the Task 5/6 token greps plus the browser diff against the demo in Tasks 5–7.

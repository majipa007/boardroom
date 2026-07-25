# SDLC Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only local web dashboard to the `sdlc-team` plugin that lists every SDLC project (most-recently-active first) and shows each one's agents, kanban board, inbox, and archive, auto-refreshing while agents work.

**Architecture:** A zero-dependency Node HTTP server (`scripts/dashboard.js`) discovers projects two ways — a central registry file (`~/.sdlc-team/projects.json`, appended by `/sdlc-init`) plus an optional `--root` directory scan for folders containing `.sdlc/`. Two pure library modules do the work: `lib/parse.js` turns one project's `.sdlc/` markdown into a JSON model, and `lib/discover.js` enumerates project directories. The server exposes `GET /api/projects` (JSON) and `GET /` (a self-contained HTML page that polls the API every 3s). A `/sdlc-dashboard` slash command launches it and prints the URL. Nothing writes to any project — it is a monitor.

**Tech Stack:** Node.js ≥ 18 standard library only (`http`, `fs`, `path`, `os`, `node:test`, `node:assert`) — no npm install, no framework. Vanilla HTML/CSS/JS for the page.

## Global Constraints

- **Node.js ≥ 18 required** (uses `node:test`, `node:assert`, stable APIs). No third-party dependencies — standard library only. No `package.json` needed.
- **Read-only.** The dashboard and its libraries never create, modify, move, or delete anything inside any project's `.sdlc/` (the sole exception is `registerProject`, which writes only to the central registry `~/.sdlc-team/projects.json`, never to a project).
- Registry path is exactly `~/.sdlc-team/projects.json` (a JSON array of absolute project paths).
- Default server port is `8787`; overridable via `--port N`. Optional `--root DIR` enables directory scanning.
- All new code lives under `sdlc-team/scripts/` (`dashboard.js`, `dashboard.html`, `lib/parse.js`, `lib/discover.js`) and tests under `sdlc-team/scripts/tests/` (`*.test.js`, run with `node --test`). This does not disturb the existing `*.sh` scripts or their tests.
- A "project" is any directory containing a `.sdlc/` subdirectory. Projects are sorted by `lastActivity` (newest first) = max mtime across `.sdlc/kanban.md`, `.sdlc/inbox/*`, `.sdlc/archive/*`.
- The board model uses the canonical column set from the `sdlc-board` skill: `Blocked`, `Backlog`, `In Progress`, `Review`, `Done`. Message frontmatter fields are `from`, `task`, `type`, `timestamp`.
- Commit identity (already configured in the repo): `user.name = majipa007`, `user.email = sulavstha007@gmail.com`.
- Executable/exec-bit note: these are Node scripts run via `node <file>` (not by their own exec bit), so no `chmod`/`git update-index --chmod=+x` is needed. The repo has `core.filemode=false`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `sdlc-team/scripts/lib/parse.js` | Pure functions: parse one project's `.sdlc/` markdown (kanban, team, inbox, archive) into a JSON model; compute last-activity mtime. No network, no writes. |
| `sdlc-team/scripts/lib/discover.js` | Enumerate project directories: read the registry, optionally scan a `--root`, dedup + filter to existing `.sdlc/` dirs. Also `registerProject` (registry-only write) + a `--register` CLI. |
| `sdlc-team/scripts/dashboard.js` | HTTP server: `--port`/`--root` args, `GET /api/projects` (discover → parse → sort → JSON), `GET /` (serve the HTML page). Thin glue over the two libs. |
| `sdlc-team/scripts/dashboard.html` | Self-contained UI: project sidebar (active-on-top), per-project agents / kanban / inbox / archive panels; polls `/api/projects` every 3s. |
| `sdlc-team/scripts/tests/parse.test.js` | `node:test` unit tests for `parse.js` against temp fixtures. |
| `sdlc-team/scripts/tests/discover.test.js` | `node:test` unit tests for `discover.js` against temp fixtures. |
| `sdlc-team/scripts/tests/dashboard.test.js` | `node:test` smoke test: start the server on an ephemeral port, fetch `/api/projects`, assert the model. |
| `sdlc-team/commands/sdlc-dashboard.md` | Slash command that launches the server and prints the URL. |
| `sdlc-team/commands/sdlc-init.md` (modify) | Add one step registering the project into the dashboard registry. |
| `sdlc-team/README.md` (modify) | Document the dashboard command. |

---

### Task 1: `lib/parse.js` — project markdown → JSON model

**Files:**
- Create: `sdlc-team/scripts/lib/parse.js`
- Test: `sdlc-team/scripts/tests/parse.test.js`

**Interfaces:**
- Consumes: nothing (leaf module; reads files via `fs`).
- Produces (exported): `parseKanban(text) -> {header:{methodology,phase,round}, board:{Blocked,Backlog,'In Progress',Review,Done}}` where each column is an array of `{id,title,assignee,priority,column}`; `parseTeam(text) -> [{name,role}]`; `parseMessage(file,text) -> {file,from,task,type,timestamp,summary}`; `listMessages(dir) -> [message]`; `computeLastActivity(sdlcDir) -> number` (epoch ms); `parseProject(projectDir) -> {name,path,lastActivity,methodology,phase,round,agents,board,inbox,archive}`.

- [ ] **Step 1: Write the failing test**

Create `sdlc-team/scripts/tests/parse.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseKanban, parseTeam, parseMessage, listMessages, parseProject } = require('../lib/parse');

const KANBAN = `# Kanban — demo
> methodology: agile | phase: Sprint 1
> last-updated: 2026-07-24T10:00:00Z | round: 3

## Blocked

## Backlog
### T-002 | Second task
- assignee: Elena
- priority: low

## In Progress
### T-001 | First task
- assignee: Marcus
- priority: high

## Review

## Done
`;

const TEAM = `# Team Roster & Role Boundaries

| Name    | Role                   | Writes code? | Scope |
|---------|------------------------|--------------|-------|
| Priya   | Manager / Orchestrator | No           | ...   |
| Marcus  | Backend Developer      | Yes          | ...   |
`;

const MSG = `---
from: Marcus
task: T-001
type: status-update
timestamp: 2026-07-24T11:00:00Z
---
## Summary
Implemented the first task.
`;

test('parseKanban reads header and places cards by column', () => {
  const { header, board } = parseKanban(KANBAN);
  assert.strictEqual(header.methodology, 'agile');
  assert.strictEqual(header.phase, 'Sprint 1');
  assert.strictEqual(header.round, 3);
  assert.strictEqual(board['In Progress'].length, 1);
  assert.strictEqual(board['In Progress'][0].id, 'T-001');
  assert.strictEqual(board['In Progress'][0].title, 'First task');
  assert.strictEqual(board['In Progress'][0].assignee, 'Marcus');
  assert.strictEqual(board['In Progress'][0].priority, 'high');
  assert.strictEqual(board.Backlog[0].id, 'T-002');
  assert.strictEqual(board.Done.length, 0);
});

test('parseTeam skips header/separator and returns members', () => {
  const agents = parseTeam(TEAM);
  assert.deepStrictEqual(agents, [
    { name: 'Priya', role: 'Manager / Orchestrator' },
    { name: 'Marcus', role: 'Backend Developer' },
  ]);
});

test('parseMessage extracts frontmatter and summary', () => {
  const m = parseMessage('2026_x.md', MSG);
  assert.strictEqual(m.from, 'Marcus');
  assert.strictEqual(m.task, 'T-001');
  assert.strictEqual(m.type, 'status-update');
  assert.strictEqual(m.timestamp, '2026-07-24T11:00:00Z');
  assert.strictEqual(m.summary, 'Implemented the first task.');
});

test('parseProject assembles the full model from a fixture dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(path.join(sdlc, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(sdlc, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'), KANBAN);
  fs.writeFileSync(path.join(sdlc, 'team.md'), TEAM);
  fs.writeFileSync(path.join(sdlc, 'inbox', '2026-07-24T11:00:00Z_Marcus_T-001.md'), MSG);

  const model = parseProject(dir);
  assert.strictEqual(model.name, path.basename(dir));
  assert.strictEqual(model.methodology, 'agile');
  assert.strictEqual(model.round, 3);
  assert.strictEqual(model.agents.length, 2);
  assert.strictEqual(model.inbox.length, 1);
  assert.strictEqual(model.inbox[0].from, 'Marcus');
  assert.strictEqual(model.archive.length, 0);
  assert.ok(model.lastActivity > 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: FAIL — `Cannot find module '../lib/parse'`.

- [ ] **Step 3: Write the implementation**

Create `sdlc-team/scripts/lib/parse.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

const COLUMNS = ['Blocked', 'Backlog', 'In Progress', 'Review', 'Done'];

function safeMtime(p) {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}
function readOr(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// kanban.md -> { header:{methodology,phase,round}, board:{col:[card]} }
function parseKanban(text) {
  const header = { methodology: '', phase: '', round: 0 };
  const board = {};
  for (const c of COLUMNS) board[c] = [];
  let col = null;
  let card = null;
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^>\s*methodology:\s*(.+?)\s*\|\s*phase:\s*(.+?)\s*$/))) {
      header.methodology = m[1]; header.phase = m[2]; continue;
    }
    if ((m = line.match(/^>\s*last-updated:.*\|\s*round:\s*(\d+)/))) {
      header.round = Number(m[1]); continue;
    }
    if ((m = line.match(/^##\s+(.+?)\s*$/))) {
      col = board[m[1]] ? m[1] : null; card = null; continue;
    }
    if ((m = line.match(/^###\s+(T-\d+)\s*\|\s*(.+?)\s*$/))) {
      card = col ? { id: m[1], title: m[2], assignee: '', priority: '', column: col } : null;
      if (card) board[col].push(card);
      continue;
    }
    if (card && (m = line.match(/^\s*-\s*assignee:\s*(.+?)\s*$/))) { card.assignee = m[1]; continue; }
    if (card && (m = line.match(/^\s*-\s*priority:\s*(.+?)\s*$/))) { card.priority = m[1]; continue; }
  }
  return { header, board };
}

// team.md markdown table -> [{name, role}]
function parseTeam(text) {
  const agents = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (!m) continue;
    const name = m[1].trim();
    const role = m[2].trim();
    if (!name || /^:?-+:?$/.test(name) || name.toLowerCase() === 'name') continue;
    agents.push({ name, role });
  }
  return agents;
}

// one inbox/archive message file -> {file,from,task,type,timestamp,summary}
function parseMessage(file, text) {
  const msg = { file: path.basename(file), from: '', task: '', type: '', timestamp: '', summary: '' };
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^(from|task|type|timestamp):\s*(.+?)\s*$/);
      if (m) msg[m[1]] = m[2];
    }
  }
  const sum = text.match(/##\s*Summary\s*\r?\n+([^\n]+)/);
  if (sum) msg.summary = sum[1].trim();
  return msg;
}

function listMessages(dir) {
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => parseMessage(f, readOr(path.join(dir, f))));
}

function computeLastActivity(sdlcDir) {
  let latest = safeMtime(path.join(sdlcDir, 'kanban.md'));
  for (const sub of ['inbox', 'archive']) {
    const d = path.join(sdlcDir, sub);
    let files = [];
    try { files = fs.readdirSync(d); } catch { files = []; }
    for (const f of files) latest = Math.max(latest, safeMtime(path.join(d, f)));
  }
  return latest;
}

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
  };
}

module.exports = { COLUMNS, parseKanban, parseTeam, parseMessage, listMessages, computeLastActivity, parseProject };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test sdlc-team/scripts/tests/parse.test.js`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/lib/parse.js sdlc-team/scripts/tests/parse.test.js
git commit -m "feat(dashboard): add project markdown parser with tests"
```

---

### Task 2: `lib/discover.js` — project discovery + registry

**Files:**
- Create: `sdlc-team/scripts/lib/discover.js`
- Test: `sdlc-team/scripts/tests/discover.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (exported): `DEFAULT_REGISTRY` (string, `~/.sdlc-team/projects.json`); `readRegistry(registryPath?) -> string[]`; `hasSdlc(dir) -> boolean`; `scanRoot(root, maxDepth=4) -> string[]`; `discoverProjects({registryPath?, root?}) -> string[]` (absolute, deduped, only dirs that still contain `.sdlc/`); `registerProject(projectDir, registryPath?) -> string` (appends abs path to the registry if absent; registry-only write). Also a `--register <dir>` CLI when run directly.

- [ ] **Step 1: Write the failing test**

Create `sdlc-team/scripts/tests/discover.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRegistry, hasSdlc, scanRoot, discoverProjects, registerProject } = require('../lib/discover');

function makeProject(base, name) {
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, '.sdlc'), { recursive: true });
  return dir;
}

test('hasSdlc detects a project dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const p = makeProject(base, 'alpha');
  assert.strictEqual(hasSdlc(p), true);
  assert.strictEqual(hasSdlc(base), false);
});

test('scanRoot finds nested .sdlc dirs', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  makeProject(base, 'alpha');
  makeProject(path.join(base, 'nested'), 'beta');
  const found = scanRoot(base).map(p => path.basename(p)).sort();
  assert.deepStrictEqual(found, ['alpha', 'beta']);
});

test('registerProject appends abs path once (idempotent)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const reg = path.join(base, 'registry.json');
  const p = makeProject(base, 'alpha');
  registerProject(p, reg);
  registerProject(p, reg);
  assert.deepStrictEqual(readRegistry(reg), [path.resolve(p)]);
});

test('discoverProjects unions registry + root scan, dedups, filters missing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-'));
  const reg = path.join(base, 'registry.json');
  const a = makeProject(base, 'alpha');
  const b = makeProject(base, 'beta');
  registerProject(a, reg);
  // 'beta' only discoverable by scan; also put a stale non-existent path in the registry
  fs.writeFileSync(reg, JSON.stringify([path.resolve(a), '/nope/does/not/exist']));
  const found = discoverProjects({ registryPath: reg, root: base }).map(p => path.basename(p)).sort();
  assert.deepStrictEqual(found, ['alpha', 'beta']);
});

test('readRegistry returns [] for a missing file', () => {
  assert.deepStrictEqual(readRegistry('/no/such/registry.json'), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test sdlc-team/scripts/tests/discover.test.js`
Expected: FAIL — `Cannot find module '../lib/discover'`.

- [ ] **Step 3: Write the implementation**

Create `sdlc-team/scripts/lib/discover.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_REGISTRY = path.join(os.homedir(), '.sdlc-team', 'projects.json');

function readRegistry(registryPath = DEFAULT_REGISTRY) {
  try {
    const arr = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function hasSdlc(dir) {
  try { return fs.statSync(path.join(dir, '.sdlc')).isDirectory(); } catch { return false; }
}

// Recursively find dirs containing .sdlc/ under root; bounded depth; skip noise dirs.
function scanRoot(root, maxDepth = 4) {
  const found = [];
  const SKIP = new Set(['.git', 'node_modules', '.sdlc', 'inbox', 'archive']);
  (function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (hasSdlc(dir)) found.push(dir);
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name)) walk(path.join(dir, e.name), depth + 1);
    }
  })(root, 0);
  return found;
}

function discoverProjects({ registryPath = DEFAULT_REGISTRY, root = null } = {}) {
  const candidates = [...readRegistry(registryPath)];
  if (root) candidates.push(...scanRoot(root));
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (hasSdlc(abs)) out.push(abs);
  }
  return out;
}

// Registry-only write. Never touches a project's .sdlc/.
function registerProject(projectDir, registryPath = DEFAULT_REGISTRY) {
  const abs = path.resolve(projectDir);
  const arr = readRegistry(registryPath);
  if (!arr.map(p => path.resolve(p)).includes(abs)) {
    arr.push(abs);
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(arr, null, 2) + '\n');
  }
  return abs;
}

if (require.main === module) {
  const i = process.argv.indexOf('--register');
  if (i !== -1) {
    const dir = process.argv[i + 1] || process.cwd();
    console.log(registerProject(dir));
  } else {
    console.log(discoverProjects({}).join('\n'));
  }
}

module.exports = { DEFAULT_REGISTRY, readRegistry, hasSdlc, scanRoot, discoverProjects, registerProject };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test sdlc-team/scripts/tests/discover.test.js`
Expected: PASS — `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/lib/discover.js sdlc-team/scripts/tests/discover.test.js
git commit -m "feat(dashboard): add project discovery and registry with tests"
```

---

### Task 3: `dashboard.js` — HTTP server

**Files:**
- Create: `sdlc-team/scripts/dashboard.js`
- Test: `sdlc-team/scripts/tests/dashboard.test.js`

**Interfaces:**
- Consumes: `lib/parse.js` (`parseProject`) and `lib/discover.js` (`discoverProjects`) from Tasks 1–2.
- Produces (exported): `parseArgs(argv) -> {port,root}`; `buildModel({root}) -> {generated:number, projects:[projectModel]}` (projects sorted by `lastActivity` desc); `createServer({root}?) -> http.Server` serving `GET /api/projects` and `GET /`. Run directly, it listens on `--port` (default 8787) and logs the URL. `GET /` serves `dashboard.html` from the script directory (created in Task 4; server tolerates its absence).

- [ ] **Step 1: Write the failing test**

Create `sdlc-team/scripts/tests/dashboard.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, buildModel, createServer } = require('../dashboard');

function makeProject(base, name) {
  const dir = path.join(base, name);
  const sdlc = path.join(dir, '.sdlc');
  fs.mkdirSync(sdlc, { recursive: true });
  fs.writeFileSync(path.join(sdlc, 'kanban.md'),
    '# Kanban — ' + name + '\n> methodology: agile | phase: Sprint 1\n> last-updated: x | round: 1\n\n## Backlog\n### T-001 | do it\n- assignee: Marcus\n\n## Done\n');
  fs.writeFileSync(path.join(sdlc, 'team.md'),
    '| Name | Role |\n|------|------|\n| Marcus | Backend Developer |\n');
  return dir;
}

test('parseArgs reads port and root with defaults', () => {
  assert.deepStrictEqual(parseArgs([]), { port: 8787, root: null });
  assert.deepStrictEqual(parseArgs(['--port', '9000', '--root', '/tmp/x']), { port: 9000, root: '/tmp/x' });
});

test('buildModel sorts projects newest-first', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
  const a = makeProject(base, 'alpha');
  const b = makeProject(base, 'beta');
  // make beta newer
  const future = Date.now() / 1000 + 100;
  fs.utimesSync(path.join(b, '.sdlc', 'kanban.md'), future, future);
  const model = buildModel({ root: base });
  const names = model.projects.map(p => p.name);
  assert.ok(names.includes('alpha') && names.includes('beta'));
  assert.strictEqual(names[0], 'beta'); // newest first
});

test('GET /api/projects returns the JSON model', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-'));
  makeProject(base, 'alpha');
  const server = createServer({ root: base });
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/projects`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body.projects));
    assert.ok(body.projects.some(p => p.name === 'alpha'));
    assert.strictEqual(body.projects[0].board.Backlog[0].id, 'T-001');
  } finally {
    await new Promise(res => server.close(res));
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: FAIL — `Cannot find module '../dashboard'`.

- [ ] **Step 3: Write the implementation**

Create `sdlc-team/scripts/dashboard.js`:

```js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { discoverProjects } = require('./lib/discover');
const { parseProject } = require('./lib/parse');

function parseArgs(argv) {
  const args = { port: 8787, root: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--root') args.root = argv[++i];
  }
  return args;
}

function buildModel({ root = null } = {}) {
  const dirs = discoverProjects({ root });
  const projects = dirs.map(parseProject).sort((a, b) => b.lastActivity - a.lastActivity);
  return { generated: Date.now(), projects };
}

function createServer({ root = null } = {}) {
  const htmlPath = path.join(__dirname, 'dashboard.html');
  return http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      let html;
      try { html = fs.readFileSync(htmlPath, 'utf8'); }
      catch { html = '<!doctype html><h1>dashboard.html not found</h1>'; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (url.startsWith('/api/projects')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildModel({ root })));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer({ root: args.root });
  server.listen(args.port, () => {
    console.log(`SDLC dashboard running: http://localhost:${args.port}  (Ctrl-C to stop)`);
    if (!args.root) console.log('Tip: pass --root <workspace-dir> to also scan for projects not yet in the registry.');
  });
}

module.exports = { parseArgs, buildModel, createServer };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test sdlc-team/scripts/tests/dashboard.test.js`
Expected: PASS — `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add sdlc-team/scripts/dashboard.js sdlc-team/scripts/tests/dashboard.test.js
git commit -m "feat(dashboard): add zero-dep HTTP server with API and smoke test"
```

---

### Task 4: `dashboard.html` — the UI

**Files:**
- Create: `sdlc-team/scripts/dashboard.html`

**Interfaces:**
- Consumes: `GET /api/projects` from Task 3 (the `{generated, projects:[...]}` shape).
- Produces: a self-contained page (inline CSS/JS, no external requests) that renders the project sidebar (sorted newest-first, matching API order) and, for the selected project, its header (methodology/phase/round), agents, kanban columns with cards, inbox list, and archive list. Polls `/api/projects` every 3s and re-renders, preserving the selected project.

No unit test (it is markup); verified by the served-content check below and manual viewing.

- [ ] **Step 1: Write the page**

Create `sdlc-team/scripts/dashboard.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SDLC Dashboard</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --panel:#191c22; --edge:#2a2f3a; --txt:#e6e6e6; --muted:#9aa4b2; --accent:#5aa9e6; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.45 system-ui, sans-serif; background:var(--bg); color:var(--txt); display:flex; height:100vh; }
  aside { width:240px; flex:0 0 240px; border-right:1px solid var(--edge); overflow-y:auto; padding:12px; }
  aside h1 { font-size:15px; margin:0 0 12px; }
  .proj { padding:8px 10px; border-radius:8px; cursor:pointer; margin-bottom:4px; border:1px solid transparent; }
  .proj:hover { background:var(--panel); }
  .proj.active { background:var(--panel); border-color:var(--accent); }
  .proj .name { font-weight:600; }
  .proj .meta { color:var(--muted); font-size:12px; }
  main { flex:1; overflow-y:auto; padding:20px; }
  .row { display:flex; gap:16px; flex-wrap:wrap; }
  .panel { background:var(--panel); border:1px solid var(--edge); border-radius:10px; padding:14px; margin-bottom:16px; }
  .cols { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
  .col h3 { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:0 0 8px; }
  .card { background:var(--bg); border:1px solid var(--edge); border-radius:8px; padding:8px; margin-bottom:8px; font-size:13px; }
  .card .id { color:var(--accent); font-weight:600; }
  .card .who { color:var(--muted); font-size:12px; }
  .agents span, .msg { display:block; }
  .msg { border-bottom:1px solid var(--edge); padding:6px 0; font-size:13px; }
  .msg .h { color:var(--muted); font-size:12px; }
  .muted { color:var(--muted); }
  h2 { margin:0 0 4px; }
</style>
</head>
<body>
<aside>
  <h1>SDLC Projects</h1>
  <div id="projects"></div>
  <div id="empty" class="muted" style="display:none">No projects found. Run <code>/sdlc-init</code> or launch with <code>--root</code>.</div>
</aside>
<main id="main"><p class="muted">Loading…</p></main>
<script>
let selected = null;
let data = { projects: [] };

function esc(s){ return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function renderSidebar(){
  const el = document.getElementById('projects');
  const empty = document.getElementById('empty');
  el.innerHTML = '';
  empty.style.display = data.projects.length ? 'none' : 'block';
  for (const p of data.projects){
    const d = document.createElement('div');
    d.className = 'proj' + (p.path === selected ? ' active' : '');
    d.innerHTML = '<div class="name">'+esc(p.name)+'</div>' +
      '<div class="meta">'+esc(p.methodology||'—')+' · '+esc(p.phase||'—')+' · r'+esc(p.round)+'</div>';
    d.onclick = () => { selected = p.path; render(); };
    el.appendChild(d);
  }
}

function cardHtml(c){
  return '<div class="card"><span class="id">'+esc(c.id)+'</span> '+esc(c.title)+
    '<div class="who">'+esc(c.assignee||'unassigned')+(c.priority?(' · '+esc(c.priority)):'')+'</div></div>';
}
function msgHtml(m){
  return '<div class="msg"><div class="h">'+esc(m.timestamp)+' · '+esc(m.from)+' · '+esc(m.type)+' · '+esc(m.task)+'</div>'+esc(m.summary)+'</div>';
}

function renderMain(){
  const main = document.getElementById('main');
  const p = data.projects.find(x => x.path === selected) || data.projects[0];
  if (!p){ main.innerHTML = '<p class="muted">Select a project.</p>'; return; }
  selected = p.path;
  const cols = ['Blocked','Backlog','In Progress','Review','Done'];
  main.innerHTML =
    '<h2>'+esc(p.name)+'</h2><p class="muted">'+esc(p.path)+'</p>' +
    '<div class="panel agents"><strong>Team</strong><br>' +
      p.agents.map(a=>'<span>'+esc(a.name)+' — <span class="muted">'+esc(a.role)+'</span></span>').join('') +
    '</div>' +
    '<div class="panel"><strong>Board</strong><div class="cols">' +
      cols.map(c=>'<div class="col"><h3>'+esc(c)+' ('+(p.board[c]||[]).length+')</h3>'+
        (p.board[c]||[]).map(cardHtml).join('')+'</div>').join('') +
    '</div></div>' +
    '<div class="row">' +
      '<div class="panel" style="flex:1;min-width:280px"><strong>Inbox ('+p.inbox.length+')</strong>' +
        (p.inbox.length?p.inbox.map(msgHtml).join(''):'<p class="muted">empty</p>')+'</div>' +
      '<div class="panel" style="flex:1;min-width:280px"><strong>Archive ('+p.archive.length+')</strong>' +
        (p.archive.length?p.archive.slice(-20).reverse().map(msgHtml).join(''):'<p class="muted">empty</p>')+'</div>' +
    '</div>';
}

function render(){ renderSidebar(); renderMain(); }

async function poll(){
  try {
    const r = await fetch('/api/projects');
    data = await r.json();
    render();
  } catch (e) { /* keep last render on transient error */ }
}
poll();
setInterval(poll, 3000);
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the server serves the page and the API together**

With the fixture from earlier tasks available, run a quick manual check:

Run:
```bash
node -e '
const {createServer}=require("./sdlc-team/scripts/dashboard.js");
const s=createServer({});
s.listen(0,async()=>{const p=s.address().port;
const html=await (await fetch("http://127.0.0.1:"+p+"/")).text();
console.log("has-mount:", html.includes(\"id=\\\"projects\\\"\") && html.includes(\"/api/projects\"));
s.close();});'
```
Expected: prints `has-mount: true` (the page loads and references the API endpoint).

- [ ] **Step 3: Commit**

```bash
git add sdlc-team/scripts/dashboard.html
git commit -m "feat(dashboard): add self-contained polling UI"
```

---

### Task 5: `/sdlc-dashboard` command + registry hook in `/sdlc-init` + README

**Files:**
- Create: `sdlc-team/commands/sdlc-dashboard.md`
- Modify: `sdlc-team/commands/sdlc-init.md` (add a registration step)
- Modify: `sdlc-team/README.md` (document the command)

**Interfaces:**
- Consumes: `dashboard.js` (Task 3) and `discover.js`'s `--register` CLI (Task 2).
- Produces: a launchable `/sdlc-dashboard` command; `/sdlc-init` now registers each new project so the dashboard finds it without a scan; README documents both.

- [ ] **Step 1: Write the /sdlc-dashboard command**

Create `sdlc-team/commands/sdlc-dashboard.md`:

```markdown
---
description: Launch the read-only SDLC monitoring dashboard on localhost and print its URL.
argument-hint: [--port N] [--root DIR]
---

Start the dashboard web server (Node.js ≥ 18 required) and tell the user the URL.

Run this, forwarding any arguments the user passed (default port 8787):

`node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.js" $ARGUMENTS`

The server prints `http://localhost:<port>`. Open it in a browser: it lists every known SDLC project (most-recently-active first) and, per project, shows the team, the live kanban board, the inbox, and the archive — refreshing every few seconds. It is **read-only** and never modifies any project.

Notes:
- The server runs until stopped with Ctrl-C. If you need the session free while it runs, start it in the background (append `&`) and report the URL.
- Projects appear automatically if they were created with `/sdlc-init` (which registers them). To include projects created elsewhere, pass `--root <workspace-dir>` to scan for `.sdlc/` folders.
```

- [ ] **Step 2: Add the registration step to /sdlc-init**

In `sdlc-team/commands/sdlc-init.md`, inside the scaffold step (step 3, right after the `.sdlc/` directories are created), add this bullet:

```markdown
   - Register the project with the dashboard: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/discover.js" --register "$(pwd)"` (appends this project's absolute path to `~/.sdlc-team/projects.json`; idempotent — safe to run again). If Node.js is unavailable, skip this; the dashboard's `--root` scan can still find the project.
```

- [ ] **Step 3: Document the dashboard in the README**

In `sdlc-team/README.md`, add a row to the Commands table:

```markdown
| `/sdlc-dashboard [--port N] [--root DIR]` | Launch a read-only local web dashboard (Node.js ≥ 18) showing every project's board, team, inbox, and archive, newest-active first. |
```

And add this section after the "How it works" section:

```markdown
## Dashboard

Run `/sdlc-dashboard` to launch a zero-dependency local web UI (default `http://localhost:8787`). It monitors every project that has run `/sdlc-init` (tracked in `~/.sdlc-team/projects.json`) plus any found under a `--root` you pass. The page auto-refreshes every few seconds and is strictly read-only. Requires Node.js ≥ 18; no `npm install`.
```

- [ ] **Step 4: Validate the plugin**

Run: `claude plugin validate ./sdlc-team --strict`
Expected: exits 0 (the new command is recognized; no manifest regression).

- [ ] **Step 5: Run the full dashboard test suite once more**

Run: `node --test sdlc-team/scripts/tests/`
Expected: all suites pass (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
git add sdlc-team/commands/sdlc-dashboard.md sdlc-team/commands/sdlc-init.md sdlc-team/README.md
git commit -m "feat(dashboard): add /sdlc-dashboard command, /sdlc-init registration, README"
```

**Manual acceptance (deferred, interactive):** with at least one initialized project, run `/sdlc-dashboard`, open the printed URL, confirm the project appears in the sidebar with its board/team/inbox/archive, that an active project sorts to the top, and that edits to the board show up within a few seconds without reloading.

---

## Self-Review

**Spec coverage** (against the user's request):
- "When downloaded, host a UI on a localhost port and let the user know" → `/sdlc-dashboard` command launches the server and prints the URL (Task 5/Task 3). *(A plugin cannot literally auto-start a server on download; a command is the sanctioned equivalent — confirmed with the user.)*
- "Show all the projects" → discovery via registry + `--root` scan (Task 2); listed in the sidebar (Task 4).
- "Project name (folder name) in the side" → sidebar uses `path.basename` as `name` (Task 1/4).
- "All the agents (devs + managers)" → `parseTeam` + agents panel (Task 1/4).
- "The inbox and archive" → `listMessages` + inbox/archive panels (Task 1/4).
- "The active kanban board" → `parseKanban` + board columns (Task 1/4).
- "Latest/ongoing projects on top" → `lastActivity` mtime + sort desc in `buildModel` (Task 1/3), sidebar follows API order (Task 4).

**Placeholder scan:** none — every step contains full runnable code or exact edits.

**Type consistency:** the JSON model shape produced by `parseProject` (Task 1) is consumed unchanged by `buildModel` (Task 3) and the HTML (`board[col]`, `agents[].name/role`, `inbox[]/archive[]` message fields, `name/path/methodology/phase/round/lastActivity`) — names match across tasks. `discoverProjects`/`registerProject`/`readRegistry` signatures used in Task 3 and Task 5 match Task 2's exports. Column set (`Blocked/Backlog/In Progress/Review/Done`) is identical in `parse.js`, the tests, and the HTML.

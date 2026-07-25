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

test('numeric config falls back when the value is malformed', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const dir = makeProject(base, 'weird');
  const cfg = path.join(dir, '.sdlc', 'project-config.md');
  fs.writeFileSync(cfg, '# Project Config\n- project: Weird\n- methodology: agile\n- parallelism: three\n- max-rounds-per-sprint: lots\n');
  const b = buildBoardJson(dir);
  assert.strictEqual(b.project.parallelism, 3);
  assert.strictEqual(b.project.maxRounds, 20);
  // must survive serialization as real numbers, not null
  const round = JSON.parse(JSON.stringify(b));
  assert.strictEqual(round.project.parallelism, 3);
  assert.strictEqual(round.project.maxRounds, 20);
});

test('buildPayload revision changes when only another project changed', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bj-'));
  const a = makeProject(base, 'alpha');
  const z = makeProject(base, 'zulu');

  const first = buildPayload([a, z], 'alpha').revision;
  assert.strictEqual(buildPayload([a, z], 'alpha').revision, first, 'stable when nothing changed');

  // change ONLY the non-selected project's board header (its rail row)
  const zBoard = path.join(z, '.sdlc', 'kanban.md');
  fs.writeFileSync(zBoard, fs.readFileSync(zBoard, 'utf8').replace('round: 2', 'round: 7'));

  const after = buildPayload([a, z], 'alpha');
  assert.strictEqual(after.project.name, 'alpha', 'still the selected project');
  assert.notStrictEqual(after.revision, first, 'rail change must change the revision');
});

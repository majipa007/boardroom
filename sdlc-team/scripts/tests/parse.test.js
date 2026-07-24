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

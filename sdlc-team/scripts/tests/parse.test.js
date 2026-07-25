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
| Manager | Manager / Orchestrator | No           | ...   |
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
    { name: 'Manager', role: 'Manager / Orchestrator' },
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

test('parseKanban captures each card\'s raw markdown with no bleed between cards', () => {
  const { board } = parseKanban(RICH_KANBAN);
  const review = board.Review[0]; // T-002
  assert.match(review.raw, /^### T-002 \| Docker \+ Prisma$/m);
  assert.match(review.raw, /- branch: sdlc\/T-002-docker/);
  assert.match(review.raw, /- \[x\] compose up works/);
  // must not include the other card's content
  assert.doesNotMatch(review.raw, /T-006/);
  assert.doesNotMatch(review.raw, /Authz middleware/);

  const blocked = board.Blocked[0]; // T-006
  assert.match(blocked.raw, /^### T-006 \| Authz middleware$/m);
  assert.doesNotMatch(blocked.raw, /Docker \+ Prisma/);
  assert.doesNotMatch(blocked.raw, /sdlc\/T-002-docker/);
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

test('parseKanban handles plain questions, empty deps and commented fields', () => {
  const KANBAN = `# Kanban — edge
> methodology: agile | phase: P1
> last-updated: x | round: 1

## Blocked

### T-020 | Manager question card
- assignee: Marcus (backend-developer)   # owns the API
- priority: high                         # bumped after triage
- depends-on: []
- branch: sdlc/T-020-thing               # set when work starts
- reviewer: Sofia (security-reviewer)    # security gate
- question: which error envelope should this use?

## Backlog

## In Progress

## Review

## Done
`;
  const c = parseKanban(KANBAN).board.Blocked[0];
  assert.strictEqual(c.questionFor, 'manager');
  assert.strictEqual(c.question, 'which error envelope should this use?');
  assert.deepStrictEqual(c.dependsOn, []);
  assert.strictEqual(c.branch, 'sdlc/T-020-thing');
  assert.strictEqual(c.priority, 'high');
  assert.strictEqual(c.assigneeName, 'Marcus');
  assert.strictEqual(c.assigneeId, 'backend-developer');
  assert.deepStrictEqual(c.reviewer, { name: 'Sofia', id: 'security-reviewer' });
  assert.deepStrictEqual(c.dod, { done: 0, total: 0 });
});

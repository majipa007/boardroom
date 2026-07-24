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

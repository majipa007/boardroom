'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, createServer } = require('../dashboard');
const { writeDodCheck } = require('../lib/inbox-write');

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

test('GET /board.json returns the contract payload with a rail', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dash2-'));
  const reg = path.join(base, 'registry.json');
  makeProject(base, 'alpha');
  makeProject(base, 'zulu');
  const server = createServer({ root: base, registryPath: reg });
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/board.json`);
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/json/);
    const b = await r.json();
    assert.ok(b.project, 'has a selected project');
    assert.deepStrictEqual(b.columns, ['next', 'flight', 'shipped', 'killed']);
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
  const reg = path.join(base, 'registry.json');
  makeProject(base, 'alpha');
  const server = createServer({ root: base, registryPath: reg });
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
  const reg = path.join(base, 'registry.json');
  makeProject(base, 'alpha');
  const server = createServer({ root: base, registryPath: reg });
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

test('two ticks on one card in the same second do not overwrite each other', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dodc-'));
  const dir = makeProject(base, 'alpha');
  const now = '2026-07-26T10:00:00Z';                 // same timestamp for both
  const a = writeDodCheck({ projectDir: dir, cardId: 'T-001', index: 0, checked: true, boxText: 'one', now });
  const b = writeDodCheck({ projectDir: dir, cardId: 'T-001', index: 1, checked: true, boxText: 'two', now });

  assert.notStrictEqual(a, b, 'different boxes must produce different files');
  assert.strictEqual(fs.readdirSync(path.join(dir, '.sdlc', 'inbox')).length, 2);
  assert.match(fs.readFileSync(a, 'utf8'), /box 1/);
  assert.match(fs.readFileSync(b, 'utf8'), /box 2/);

  // re-toggling the SAME box in the same second is last-state-wins, by design
  const again = writeDodCheck({ projectDir: dir, cardId: 'T-001', index: 0, checked: false, boxText: 'one', now });
  assert.strictEqual(again, a, 'same box + same second reuses the filename');
  assert.strictEqual(fs.readdirSync(path.join(dir, '.sdlc', 'inbox')).length, 2);
  assert.match(fs.readFileSync(a, 'utf8'), /un-ticked/);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, createServer } = require('../dashboard');

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
